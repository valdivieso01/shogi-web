"""Lobby state, real-time matchmaking pairing, and SSE lobby stream endpoints."""

import json
import queue
import random
import secrets
from flask import Blueprint, Response, jsonify, request

from core.game_room import (
    ROOMS,
    ROOMS_LOCK,
    GameRoom,
    cleanup_expired_resources,
    generate_room_code,
)
from core.lobby_manager import LOBBY, broadcast_lobby
from core.security import SECURITY, get_authenticated_user, get_client_ip, sanitize_text

lobby_bp = Blueprint("lobby_api", __name__)


@lobby_bp.route("/api/lobby", methods=["GET"])
def get_lobby():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "lobby_get", max_calls=60, window_sec=60):
        return jsonify({"error": "Demasiadas peticiones desde tu IP. Espera unos segundos."}), 429
    player_id = request.args.get("player_id") or ""
    name = request.args.get("name") or ""
    if player_id:
        LOBBY.touch_player(player_id, name, ip)
    return jsonify(LOBBY.serialize())


@lobby_bp.route("/api/lobby/matchmake", methods=["POST"])
def lobby_matchmake():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "matchmake", max_calls=10, window_sec=60):
        return jsonify({"error": "Demasiados intentos de búsqueda desde tu IP. Espera un momento."}), 429

    data = request.get_json(silent=True) or {}
    raw_pid = (data.get("player_id") or "").strip()
    auth_user = get_authenticated_user(request, data.get("auth_token"))
    name = sanitize_text(data.get("name"), max_len=24)
    if auth_user and auth_user.get("name") and (not name or name.startswith("Samurai-")):
        name = auth_user["name"]
    player_id = LOBBY.touch_player(raw_pid, name, ip)
    if auth_user:
        with LOBBY.lock:
            if player_id in LOBBY.players:
                LOBBY.players[player_id]["user"] = auth_user

    with LOBBY.lock:
        LOBBY.players[player_id]["match"] = None

        opponent_id = next(
            (
                pid
                for pid in LOBBY.match_queue
                if pid != player_id and pid in LOBBY.players
            ),
            None,
        )

        if opponent_id:
            LOBBY.match_queue.remove(opponent_id)
            if player_id in LOBBY.match_queue:
                LOBBY.match_queue.remove(player_id)

            opponent = LOBBY.players[opponent_id]
            me = LOBBY.players[player_id]

            colors = ["negro", "blanco"]
            random.shuffle(colors)
            opp_color, my_color = colors[0], colors[1]

            with ROOMS_LOCK:
                cleanup_expired_resources()
                code = generate_room_code()
                title = f"{opponent['name']} vs {me['name']}"
                room = GameRoom(code=code, mode="online", visibility="public", title=title, owner_ip=ip)
                opp_token = secrets.token_urlsafe(24)
                my_token = secrets.token_urlsafe(24)

                room.players[opp_color] = {
                    "token": opp_token,
                    "name": opponent["name"],
                    "connected": True,
                    "ip": opponent.get("ip"),
                    "user": opponent.get("user"),
                }
                room.players[my_color] = {
                    "token": my_token,
                    "name": me["name"],
                    "connected": True,
                    "ip": ip,
                    "user": me.get("user"),
                }
                ROOMS[code] = room
                room.persist()

            room_state = room.serialize()
            opp_assignment = {
                "room_code": code,
                "player_token": opp_token,
                "assigned_color": opp_color,
                "state": room_state,
            }
            my_assignment = {
                "room_code": code,
                "player_token": my_token,
                "assigned_color": my_color,
                "state": room_state,
            }

            opponent["status"] = "idle"
            opponent["match"] = opp_assignment
            me["status"] = "idle"
            me["match"] = my_assignment

            broadcast_lobby()
            return jsonify({"status": "matched", "player_id": player_id, **my_assignment})

        LOBBY.match_queue = [
            pid
            for pid in LOBBY.match_queue
            if pid in LOBBY.players and LOBBY.players[pid].get("ip") != ip
        ]
        LOBBY.match_queue.append(player_id)
        LOBBY.players[player_id]["status"] = "searching"

    broadcast_lobby()
    return jsonify({"status": "searching", "player_id": player_id, "queue_count": len(LOBBY.match_queue)})


@lobby_bp.route("/api/lobby/matchmake/cancel", methods=["POST"])
def lobby_matchmake_cancel():
    ip = get_client_ip()
    data = request.get_json(silent=True) or {}
    player_id = (data.get("player_id") or "").strip()
    with LOBBY.lock:
        LOBBY.match_queue = [
            pid
            for pid in LOBBY.match_queue
            if pid != player_id and (pid not in LOBBY.players or LOBBY.players[pid].get("ip") != ip)
        ]
        if player_id in LOBBY.players:
            LOBBY.players[player_id]["status"] = "idle"
            LOBBY.players[player_id]["match"] = None
    broadcast_lobby()
    return jsonify({"ok": True})


@lobby_bp.route("/api/lobby/stream", methods=["GET"])
def stream_lobby():
    ip = get_client_ip()
    raw_pid = (request.args.get("player_id") or "").strip()
    name = sanitize_text(request.args.get("name"), max_len=24)
    player_id = LOBBY.touch_player(raw_pid, name, ip)

    q: queue.Queue = queue.Queue(maxsize=32)
    SECURITY.register_lobby_sse(ip, q)
    with LOBBY.lock:
        LOBBY.subscribers.append(q)
    broadcast_lobby()

    def event_stream():
        try:
            yield f"data: {json.dumps(LOBBY.serialize())}\n\n"
            while True:
                try:
                    msg = q.get(timeout=20)
                    if msg == "__CLOSE_REPLACED_BY_SAME_IP__":
                        yield f'data: {json.dumps({"replaced_by_same_ip": True})}\n\n'
                        break
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    LOBBY.touch_player(player_id, name, ip)
                    yield ": keepalive\n\n"
        finally:
            SECURITY.unregister_lobby_sse(ip, q)
            with LOBBY.lock:
                if q in LOBBY.subscribers:
                    LOBBY.subscribers.remove(q)
            LOBBY.remove_player(player_id, ip)
            broadcast_lobby()

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), headers=headers)
