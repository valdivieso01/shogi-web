"""Google OAuth authentication, user session endpoints, and public Hall of Fame / recent matches."""

import json
import os
import secrets
import urllib.request
from flask import Blueprint, jsonify, request

import database
from core.security import AUTH_SESSIONS, SECURITY, get_authenticated_user, get_client_ip, is_admin_user

auth_bp = Blueprint("auth_api", __name__)


@auth_bp.route("/api/auth/config", methods=["GET"])
def auth_config():
    return jsonify({"google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip()})


@auth_bp.route("/api/auth/google", methods=["POST"])
def auth_google():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "auth_google", max_calls=15, window_sec=60):
        return jsonify({"error": "Demasiados intentos de autenticación. Espera un minuto."}), 429

    data = request.get_json(silent=True) or {}
    credential = data.get("credential")
    if not credential:
        return jsonify({"error": "Falta el token de credencial de Google."}), 400

    google_id = None
    email = None
    name = "Jugador"
    picture = ""

    try:
        req = urllib.request.Request(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}",
            headers={"User-Agent": "DojoShogiOnline/1.0"},
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            info = json.loads(resp.read().decode("utf-8"))
            google_id = info.get("sub")
            email = info.get("email")
            name = info.get("name") or info.get("given_name") or "Jugador"
            picture = info.get("picture", "")
    except Exception as e1:
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token

            idinfo = id_token.verify_oauth2_token(credential, google_requests.Request())
            google_id = idinfo.get("sub")
            email = idinfo.get("email")
            name = idinfo.get("name") or idinfo.get("given_name") or "Jugador"
            picture = idinfo.get("picture", "")
        except Exception:
            return jsonify({"error": f"No se pudo validar el token de Google: {e1}"}), 401

    if not google_id:
        return jsonify({"error": "Token de Google inválido."}), 401

    user = database.upsert_user(google_id, email or "", name, picture)
    token = secrets.token_hex(24)
    database.save_session(token, user["id"])
    user["is_admin"] = is_admin_user(user)
    AUTH_SESSIONS[token] = user

    response = jsonify({"ok": True, "token": token, "user": user})
    response.set_cookie("shogi_auth_token", token, max_age=30 * 86400, httponly=True, samesite="Lax")
    return response


@auth_bp.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = get_authenticated_user(request)
    if user:
        refreshed = database.get_user_by_id(user["id"])
        if refreshed:
            user = refreshed
            user["is_admin"] = is_admin_user(user)
            token = (
                request.headers.get("Authorization", "").replace("Bearer ", "").strip()
                or request.cookies.get("shogi_auth_token")
            )
            if token:
                AUTH_SESSIONS[token] = user
        token = (
            request.headers.get("Authorization", "").replace("Bearer ", "").strip()
            or request.cookies.get("shogi_auth_token")
        )
        return jsonify({"authenticated": True, "user": user, "token": token})
    return jsonify({"authenticated": False, "user": None})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        token = request.cookies.get("shogi_auth_token")
    if token:
        database.delete_session(token)
        if token in AUTH_SESSIONS:
            del AUTH_SESSIONS[token]
    resp = jsonify({"ok": True})
    resp.delete_cookie("shogi_auth_token")
    return resp


@auth_bp.route("/api/leaderboard", methods=["GET"])
def api_leaderboard():
    limit = min(50, max(5, int(request.args.get("limit", 15))))
    data = database.get_leaderboard(limit=limit)
    return jsonify({"leaderboard": data})


@auth_bp.route("/api/matches/recent", methods=["GET"])
def api_recent_matches():
    limit = min(30, max(5, int(request.args.get("limit", 10))))
    data = database.get_recent_matches(limit=limit)
    return jsonify({"matches": data})
