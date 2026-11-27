"""Admin Dashboard view (/admin) and restricted analytics APIs."""

from flask import Blueprint, jsonify, render_template, request

import database
from core.game_room import ROOMS
from core.security import get_authenticated_user, is_admin_user

admin_bp = Blueprint("admin_routes", __name__)


@admin_bp.route("/api/admin/overview", methods=["GET"])
def api_admin_overview():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    stats = database.get_admin_overview()
    stats["active_rooms"] = len(ROOMS)
    return jsonify({"ok": True, "stats": stats})


@admin_bp.route("/api/admin/matches", methods=["GET"])
def api_admin_matches():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    limit = min(200, max(10, int(request.args.get("limit", 100))))
    offset = max(0, int(request.args.get("offset", 0)))
    filter_type = request.args.get("filter", "all")
    matches = database.get_admin_matches(limit=limit, offset=offset, filter_type=filter_type)
    return jsonify({"ok": True, "matches": matches})


@admin_bp.route("/api/admin/users", methods=["GET"])
def api_admin_users():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    limit = min(200, max(10, int(request.args.get("limit", 100))))
    offset = max(0, int(request.args.get("offset", 0)))
    users = database.get_admin_users(limit=limit, offset=offset)
    return jsonify({"ok": True, "users": users})


@admin_bp.route("/admin")
def page_admin():
    return render_template("admin.html")
