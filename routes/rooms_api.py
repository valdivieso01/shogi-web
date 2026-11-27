"""GameRoom lifecycle, move/drop actions, AI turn trigger, room sync, and SSE room stream."""

import hmac
import json
import queue
import secrets
import time
from flask import Blueprint, Response, jsonify, request

import database
from core.constants import MAX_ROOMS, PIECE_META, SAFE_CODE_RE, STORY_CHAPTERS
from core.game_room import (
    ROOMS,
    ROOMS_LOCK,
    GameRoom,
    authorize_action,
    cleanup_expired_resources,
    format_coord,
    generate_room_code,
    get_room_or_404,
    restore_room_from_client_state,
)
from core.lobby_manager import broadcast_lobby
from core.security import SECURITY, get_authenticated_user, get_client_ip, sanitize_text

rooms_bp = Blueprint("rooms_api", __name__)


@rooms_bp.route("/api/rooms", methods=["POST"])
def create_room():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "create_room", max_calls=15, window_sec=60):
        return jsonify({"error": "Has creado demasiadas salas en poco tiempo desde esta IP. Espera 1 minuto."}), 429

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "online")
    if mode not in ("online", "local", "ai"):
        mode = "online"
    visibility = data.get("visibility", "public")
    if visibility not in ("public", "private"):
        visibility = "public"
    if mode in ("local", "ai"):
        visibility = "private"
    preferred_color = data.get("color", "negro")
    if preferred_color not in ("negro", "blanco"):
        preferred_color = "negro"

    raw_chapter = data.get("story_chapter")
    story_chapter = None
    if raw_chapter is not None:
        try:
            c_int = int(raw_chapter)
            if c_int in STORY_CHAPTERS:
                story_chapter = c_int
        except (ValueError, TypeError):
            pass

    raw_level = data.get("ai_level", 3)
    try:
        ai_level = max(1, min(5, int(story_chapter or raw_level or 3)))
    except (ValueError, TypeError):
        ai_level = 3

    auth_user = get_authenticated_user(request, data.get("auth_token"))
    default_player_name = (
        auth_user["name"]
        if auth_user and auth_user.get("name")
        else ("Sente (Negro)" if preferred_color == "negro" else "Gote (Blanco)")
    )
    player_name = sanitize_text(
        data.get("name"),
        max_len=24,
        default=default_player_name,
    )
    default_title = (
        f"Cap. {story_chapter}: {STORY_CHAPTERS[story_chapter]['name']}"
        if story_chapter
        else f"Sala de {player_name}"
    )
    room_title = sanitize_text(data.get("title"), max_len=36, default=default_title)

    with ROOMS_LOCK:
        cleanup_expired_resources()
        if len(ROOMS) >= MAX_ROOMS:
            return jsonify({"error": "El servidor alcanzó el límite máximo de salas activas. Intenta en unos minutos."}), 503

        stale_waiting = [
            c for c, r in ROOMS.items() if r.owner_ip == ip and r.get_status() == "waiting"
        ]
        for c in stale_waiting:
            del ROOMS[c]

        code = generate_room_code()
        room = GameRoom(
            code=code,
            mode=mode,
            visibility=visibility,
            title=room_title,
            owner_ip=ip,
            ai_level=ai_level,
            story_chapter=story_chapter,
        )
        token = secrets.token_urlsafe(24)
        if mode == "local":
            room.players["negro"] = {"token": token, "name": "Jugador Negro (Sente)", "connected": True, "ip": ip, "user": auth_user}
            room.players["blanco"] = {"token": token, "name": "Jugador Blanco (Gote)", "connected": True, "ip": ip, "user": None}
            assigned_color = "ambos"
        elif mode == "ai":
            bot_name = (
                f"{STORY_CHAPTERS[story_chapter]['name']} ({STORY_CHAPTERS[story_chapter]['kanji']})"
                if story_chapter
                else "Sensei Bot"
            )
            room.players["negro"] = {"token": token, "name": player_name, "connected": True, "ip": ip, "user": auth_user}
            room.players["blanco"] = {"token": "AI_BOT", "name": bot_name, "connected": True, "ip": "AI", "user": None}
            assigned_color = "negro"
        else:
            room.players[preferred_color] = {"token": token, "name": player_name, "connected": True, "ip": ip, "user": auth_user}
            assigned_color = preferred_color
        ROOMS[code] = room
        room.persist()

    broadcast_lobby()
    return jsonify(
        {
            "room_code": code,
            "player_token": token,
            "assigned_color": assigned_color,
            "state": room.serialize(),
        }
    )


@rooms_bp.route("/api/rooms/<room_code>/join", methods=["POST"])
def join_room(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "join_room", max_calls=15, window_sec=60):
        return jsonify({"error": "Demasiados intentos de conexión desde tu IP. Espera unos segundos."}), 429

    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "La sala indicada no existe."}), 404

    data = request.get_json(silent=True) or {}
    existing_token = data.get("player_token")
    auth_user = get_authenticated_user(request, data.get("auth_token"))
    player_name = sanitize_text(data.get("name"), max_len=24)
    if auth_user and auth_user.get("name") and (not player_name or player_name.startswith("Samurai-")):
        player_name = auth_user["name"]
    as_spectator = bool(data.get("spectate", False))

    with room.lock:
        room.updated_at = time.time()
        if room.mode == "local":
            return jsonify(
                {
                    "room_code": room.code,
                    "player_token": room.players["negro"]["token"],
                    "assigned_color": "ambos",
                    "state": room.serialize(),
                }
            )

        for color in ("negro", "blanco"):
            seat_token = room.players[color]["token"]
            token_matches = (
                isinstance(existing_token, str)
                and isinstance(seat_token, str)
                and hmac.compare_digest(existing_token, seat_token)
            )
            if token_matches:
                if player_name:
                    room.players[color]["name"] = player_name
                if auth_user:
                    room.players[color]["user"] = auth_user
                room.players[color]["connected"] = True
                room.players[color]["disconnected_at"] = None
                room.players[color]["ip"] = ip
                room.broadcast()
                return jsonify(
                    {
                        "room_code": room.code,
                        "player_token": seat_token,
                        "assigned_color": color,
                        "state": room.serialize(),
                    }
                )

        if not as_spectator:
            for color in ("negro", "blanco"):
                if not room.players[color].get("token"):
                    token = secrets.token_urlsafe(24)
                    default_name = "Sente (Negro)" if color == "negro" else "Gote (Blanco)"
                    room.players[color] = {
                        "token": token,
                        "name": player_name or default_name,
                        "connected": True,
                        "disconnected_at": None,
                        "ip": ip,
                        "user": auth_user,
                    }
                    room.broadcast()
                    return jsonify(
                        {
                            "room_code": room.code,
                            "player_token": token,
                            "assigned_color": color,
                            "state": room.serialize(),
                        }
                    )

        return jsonify(
            {
                "room_code": room.code,
                "player_token": None,
                "assigned_color": "espectador",
                "state": room.serialize(),
            }
        )


@rooms_bp.route("/api/rooms/<room_code>/sync", methods=["POST"])
def sync_room_state(room_code: str):
    """Restores an active room from client state if a serverless instance lost in-memory state."""
    clean = (room_code or "").strip().upper()
    if not SAFE_CODE_RE.match(clean):
        return jsonify({"error": "Código de sala inválido."}), 400

    data = request.get_json(silent=True) or {}
    client_state = data.get("state")
    player_token = data.get("player_token")
    if not isinstance(client_state, dict) or not isinstance(client_state.get("board"), list):
        return jsonify({"error": "Estado de sincronización inválido."}), 400

    auth_user = get_authenticated_user(request, data.get("auth_token"))
    ip = get_client_ip()

    with ROOMS_LOCK:
        room = get_room_or_404(clean)
        if room is None:
            room = restore_room_from_client_state(clean, client_state, player_token, auth_user, ip)
        if not room:
            return jsonify({"error": "No se pudo sincronizar la sala."}), 400
        return jsonify({"ok": True, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>", methods=["GET"])
def get_room_state(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "La sala indicada no existe."}), 404
    with room.lock:
        return jsonify(room.serialize())


@rooms_bp.route("/api/rooms/<room_code>/legal-moves", methods=["GET"])
def get_legal_moves(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    with room.lock:
        if room.winner:
            return jsonify({"moves": []})
        piece_code = request.args.get("drop")
        color = request.args.get("color") or room.turn
        if piece_code:
            moves = room.get_legal_drops_for_piece(room.tablero, color, piece_code)
            return jsonify({"moves": moves})

        try:
            row = int(request.args.get("row", -1))
            col = int(request.args.get("col", -1))
        except ValueError:
            return jsonify({"moves": []})

        if not (0 <= row < 9 and 0 <= col < 9):
            return jsonify({"moves": []})

        moves = room.get_legal_moves_for_piece(room.tablero, color, row, col)
        return jsonify({"moves": moves})


@rooms_bp.route("/api/rooms/<room_code>/move", methods=["POST"])
def make_move(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "game_action", max_calls=45, window_sec=60):
        return jsonify({"error": "Demasiadas jugadas por minuto desde tu IP."}), 429

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    room = get_room_or_404(room_code)
    if not room and isinstance(data.get("client_state"), dict):
        auth_user = get_authenticated_user(request, data.get("auth_token"))
        with ROOMS_LOCK:
            room = restore_room_from_client_state(room_code.strip().upper(), data["client_state"], token, auth_user, ip)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    from_pos = data.get("from")
    to_pos = data.get("to")
    promote_choice = data.get("promote")
    defer_ai = bool(data.get("defer_ai", False))

    if not (isinstance(from_pos, list) and isinstance(to_pos, list) and len(from_pos) == 2 and len(to_pos) == 2):
        return jsonify({"error": "Coordenadas inválidas."}), 400

    try:
        r0, c0 = int(from_pos[0]), int(from_pos[1])
        r1, c1 = int(to_pos[0]), int(to_pos[1])
    except (ValueError, TypeError):
        return jsonify({"error": "Coordenadas no numéricas."}), 400

    with room.lock:
        room.updated_at = time.time()
        ok, err = authorize_action(room, token)
        if not ok:
            return jsonify({"error": err}), 403

        color = room.turn
        jugador = room.get_jugador(color)
        if not (jugador.validar_posiciones(r0, c0) and jugador.validar_posiciones(r1, c1)):
            return jsonify({"error": "Posición fuera del tablero."}), 400

        piece = room.tablero.tab[r0][c0]
        if piece is None or piece.color != color:
            return jsonify({"error": "Selecciona una pieza propia válida."}), 400

        legal_targets = room.get_legal_moves_for_piece(room.tablero, color, r0, c0)
        matching = next((m for m in legal_targets if m["row"] == r1 and m["col"] == c1), None)
        if not matching:
            return jsonify({"error": "Movimiento ilegal según las reglas de Shōgi (o deja a tu Rey en jaque)."}), 400

        target_before = room.tablero.tab[r1][c1]
        captured_code = target_before.nombre if target_before is not None else None
        was_promoted = bool(getattr(piece, "promocion", False))

        room.tablero.modo_control_tablero = False
        if not jugador.jugar_pieza(room.tablero, color, (r0, c0), (r1, c1)):
            return jsonify({"error": "No se puede realizar la jugada."}), 400

        moved_piece = room.tablero.tab[r1][c1]
        promoted_now = False
        if matching["can_promote"] and hasattr(moved_piece, "promocion") and not was_promoted:
            if matching["must_promote"] or promote_choice is True or promote_choice is None:
                moved_piece.promocion = True
                promoted_now = True

        room.move_count += 1
        symbol = "☗" if color == "negro" else "☖"
        action_sym = "x" if captured_code else "→"
        promo_suffix = "+" if promoted_now else ""
        notation = f"{room.move_count}. {symbol} {moved_piece.nombre} {format_coord(r0, c0)} {action_sym} {format_coord(r1, c1)}{promo_suffix}"

        room.last_move = {
            "type": "move",
            "color": color,
            "from": [r0, c0],
            "to": [r1, c1],
            "piece": moved_piece.nombre,
            "captured": captured_code,
            "promoted": promoted_now,
            "notation": notation,
        }
        room.history.append(room.last_move)

        room.evaluate_post_turn(color)
        ai_pending = bool(room.mode == "ai" and not room.winner and room.turn == "blanco")
        if ai_pending and not defer_ai:
            room.play_ai_turn("blanco")
            ai_pending = False
        room.broadcast()
        return jsonify({"ok": True, "ai_pending": ai_pending, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/drop", methods=["POST"])
def make_drop(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "game_action", max_calls=45, window_sec=60):
        return jsonify({"error": "Demasiadas jugadas por minuto desde tu IP."}), 429

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    room = get_room_or_404(room_code)
    if not room and isinstance(data.get("client_state"), dict):
        auth_user = get_authenticated_user(request, data.get("auth_token"))
        with ROOMS_LOCK:
            room = restore_room_from_client_state(room_code.strip().upper(), data["client_state"], token, auth_user, ip)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    piece_code = (data.get("piece") or "").strip().upper()
    to_pos = data.get("to")
    defer_ai = bool(data.get("defer_ai", False))

    if not (isinstance(to_pos, list) and len(to_pos) == 2 and piece_code in PIECE_META):
        return jsonify({"error": "Datos de reincorporación inválidos."}), 400

    try:
        r1, c1 = int(to_pos[0]), int(to_pos[1])
    except (ValueError, TypeError):
        return jsonify({"error": "Coordenadas no numéricas."}), 400

    with room.lock:
        room.updated_at = time.time()
        ok, err = authorize_action(room, token)
        if not ok:
            return jsonify({"error": err}), 403

        color = room.turn
        jugador = room.get_jugador(color)
        if not jugador.validar_posiciones(r1, c1):
            return jsonify({"error": "Posición fuera del tablero."}), 400

        legal_drops = room.get_legal_drops_for_piece(room.tablero, color, piece_code)
        if not any(d["row"] == r1 and d["col"] == c1 for d in legal_drops):
            return jsonify(
                {
                    "error": "Reincorporación ilegal (casilla ocupada, Nifu, sin movimiento futuro, Uchifuzume o Rey en jaque)."
                }
            ), 400

        if not room.tablero.reintroducir_pieza(jugador, piece_code, f"{r1} {c1}", room.tablero):
            return jsonify({"error": "No es posible incorporar la pieza en esa posición."}), 400

        room.move_count += 1
        symbol = "☗" if color == "negro" else "☖"
        notation = f"{room.move_count}. {symbol} {piece_code}* → {format_coord(r1, c1)}"
        room.last_move = {
            "type": "drop",
            "color": color,
            "from": None,
            "to": [r1, c1],
            "piece": piece_code,
            "captured": None,
            "promoted": False,
            "notation": notation,
        }
        room.history.append(room.last_move)

        room.evaluate_post_turn(color)
        ai_pending = bool(room.mode == "ai" and not room.winner and room.turn == "blanco")
        if ai_pending and not defer_ai:
            room.play_ai_turn("blanco")
            ai_pending = False
        room.broadcast()
        return jsonify({"ok": True, "ai_pending": ai_pending, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/ai-move", methods=["POST"])
def make_ai_move(room_code: str):
    ip = get_client_ip()
    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    room = get_room_or_404(room_code)
    if not room and isinstance(data.get("client_state"), dict):
        auth_user = get_authenticated_user(request, data.get("auth_token"))
        with ROOMS_LOCK:
            room = restore_room_from_client_state(room_code.strip().upper(), data["client_state"], token, auth_user, ip)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    with room.lock:
        room.updated_at = time.time()
        if room.mode == "ai" and not room.winner and room.turn == "blanco":
            room.play_ai_turn("blanco")
            room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/reset", methods=["POST"])
def reset_room(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "reset_room", max_calls=10, window_sec=60):
        return jsonify({"error": "Demasiados reinicios desde tu IP. Espera unos segundos."}), 429

    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")

    with room.lock:
        if room.mode in ("online", "ai"):
            valid_player = False
            for color in ("negro", "blanco"):
                seat_token = room.players[color]["token"]
                if (
                    isinstance(token, str)
                    and isinstance(seat_token, str)
                    and hmac.compare_digest(token, seat_token)
                ):
                    valid_player = True
                    break
            if not valid_player:
                return jsonify({"error": "Solo los jugadores de la partida pueden reiniciar el tablero."}), 403

        room.updated_at = time.time()
        room.reset_board()
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/resign", methods=["POST"])
def resign_room(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")

    with room.lock:
        if room.winner:
            return jsonify({"error": "La partida ya terminó."}), 400

        resigning_color = room.turn
        if room.mode == "online":
            if token == room.players["negro"]["token"]:
                resigning_color = "negro"
            elif token == room.players["blanco"]["token"]:
                resigning_color = "blanco"
            else:
                return jsonify({"error": "Solo los jugadores de la sala pueden rendirse."}), 403

        winner_color = room.other_color(resigning_color)
        room.winner = winner_color
        room.tablero.juego = "terminado"
        room.reason = (
            f"{'Sente (Negro ☗)' if resigning_color == 'negro' else 'Gote (Blanco ☖)'} se ha rendido. "
            f"Victoria para {'Sente (Negro ☗)' if winner_color == 'negro' else 'Gote (Blanco ☖)'}."
        )
        room.finalize_match_record()
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/leave", methods=["POST"])
def leave_room(room_code: str):
    """Handles temporary disconnect (starts 5-minute countdown) or permanent forfeit."""
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    action = data.get("action", "disconnect")  # "disconnect" | "forfeit" | "reconnect"

    with room.lock:
        if room.winner:
            return jsonify({"ok": True, "state": room.serialize()})

        player_color = None
        for color in ("negro", "blanco"):
            seat_token = room.players[color].get("token")
            if (
                isinstance(token, str)
                and isinstance(seat_token, str)
                and hmac.compare_digest(token, seat_token)
            ):
                player_color = color
                break

        if not player_color:
            return jsonify({"ok": False, "error": "Jugador no identificado en la sala."}), 403

        if action == "reconnect":
            room.players[player_color]["connected"] = True
            room.players[player_color]["disconnected_at"] = None
            room.updated_at = time.time()
            room.broadcast()
            return jsonify({"ok": True, "state": room.serialize()})

        if action == "forfeit" and room.mode == "online" and room.get_status() == "playing":
            winner_color = room.other_color(player_color)
            room.winner = winner_color
            room.tablero.juego = "terminado"
            loser_label = "Sente (Negro ☗)" if player_color == "negro" else "Gote (Blanco ☖)"
            winner_label = "Sente (Negro ☗)" if winner_color == "negro" else "Gote (Blanco ☖)"
            room.reason = (
                f"{loser_label} abandonó la partida. "
                f"Victoria por abandono para {winner_label}."
            )
            room.players[player_color]["connected"] = False
            room.players[player_color]["disconnected_at"] = None
            room.finalize_match_record()
            room.updated_at = time.time()
            room.broadcast()
            return jsonify({"ok": True, "state": room.serialize()})

        # Default: temporary disconnect (starts 5-minute reconnect timer in online matches)
        room.players[player_color]["connected"] = False
        if not room.players[player_color].get("disconnected_at"):
            room.players[player_color]["disconnected_at"] = time.time()
        room.updated_at = time.time()
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@rooms_bp.route("/api/rooms/<room_code>/stream", methods=["GET"])
def stream_room(room_code: str):
    ip = get_client_ip()
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    token = request.args.get("player_token")
    stream_color = None
    q: queue.Queue = queue.Queue(maxsize=32)
    SECURITY.register_room_sse(ip, q)
    with room.lock:
        for color in ("negro", "blanco"):
            seat_token = room.players[color].get("token")
            if (
                isinstance(token, str)
                and isinstance(seat_token, str)
                and hmac.compare_digest(token, seat_token)
            ):
                stream_color = color
                was_disconnected = bool(room.players[color].get("disconnected_at")) or not room.players[color].get("connected")
                room.players[color]["connected"] = True
                room.players[color]["disconnected_at"] = None
                if was_disconnected:
                    room.updated_at = time.time()
                    room.broadcast()
                break
        room.subscribers.append(q)
        initial_payload = json.dumps(room.serialize())

    def event_stream():
        last_seen_move = room.move_count
        last_seen_updated = room.updated_at
        try:
            yield f"data: {initial_payload}\n\n"
            while True:
                try:
                    msg = q.get(timeout=4)
                    if msg == "__CLOSE_REPLACED_BY_SAME_IP__":
                        yield f'data: {json.dumps({"replaced_by_same_ip": True})}\n\n'
                        break
                    last_seen_move = room.move_count
                    last_seen_updated = room.updated_at
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    with room.lock:
                        if room.check_disconnect_forfeit():
                            last_seen_move = room.move_count
                            last_seen_updated = room.updated_at
                            yield f"data: {json.dumps(room.serialize())}\n\n"
                            continue
                    snap = database.load_active_room(room.code)
                    if snap and (
                        snap.get("move_count", 0) != last_seen_move
                        or float(snap.get("updated_at", 0)) > last_seen_updated
                        or snap.get("winner") != room.winner
                    ):
                        with room.lock:
                            room.apply_snapshot(snap)
                            room.check_disconnect_forfeit()
                            last_seen_move = room.move_count
                            last_seen_updated = room.updated_at
                            synced_payload = json.dumps(room.serialize())
                        yield f"data: {synced_payload}\n\n"
                    else:
                        yield ": keepalive\n\n"
        finally:
            SECURITY.unregister_room_sse(ip, q)
            with room.lock:
                if q in room.subscribers:
                    room.subscribers.remove(q)
                if (
                    stream_color
                    and not room.winner
                    and room.mode == "online"
                    and room.get_status() == "playing"
                ):
                    room.players[stream_color]["connected"] = False
                    if not room.players[stream_color].get("disconnected_at"):
                        room.players[stream_color]["disconnected_at"] = time.time()
                    room.updated_at = time.time()
                    room.broadcast()

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), headers=headers)
