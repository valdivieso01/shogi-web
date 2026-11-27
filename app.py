"""
Dojo Shōgi Online (将棋) — Main Flask Application Entrypoint.
Modular architecture using Flask Blueprints (`routes/`), domain core (`core/`), and Jinja2 templates (`templates/`).
"""

from flask import Flask, request

import database
from core.constants import PIECE_META, STORY_CHAPTERS
from core.game_room import ROOMS, ROOMS_LOCK, GameRoom, get_room_or_404
from core.lobby_manager import LOBBY, LobbyManager, broadcast_lobby
from core.security import AUTH_SESSIONS, SECURITY, get_authenticated_user, is_admin_user
from routes.admin_routes import admin_bp
from routes.auth_api import auth_bp
from routes.lobby_api import lobby_bp
from routes.rooms_api import rooms_bp
from routes.seo_pages import seo_bp

database.init_db()

app = Flask(__name__, static_folder="static", static_url_path="/static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

# Register modular Flask Blueprints
app.register_blueprint(seo_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(lobby_bp)
app.register_blueprint(rooms_bp)


@app.after_request
def add_security_and_cache_headers(response):
    icon_paths = (
        "/favicon.ico",
        "/icon-48.png",
        "/icon-192.png",
        "/icon-512.png",
        "/icon.svg",
        "/apple-touch-icon.png",
        "/apple-touch-icon-precomposed.png",
        "/static/favicon.ico",
        "/static/icon-48.png",
        "/static/icon-192.png",
        "/static/icon-512.png",
        "/static/icon.svg",
        "/static/apple-touch-icon.png",
    )
    if request.path in icon_paths:
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    elif request.path == "/" or request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://accounts.google.com https://*.adtrafficquality.google; "
        "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://accounts.google.com https://*.adtrafficquality.google; "
        "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.google.com https://accounts.google.com https://*.adtrafficquality.google; "
        "frame-ancestors 'none';"
    )
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
