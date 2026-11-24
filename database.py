"""
Dojo Shogi Online - Database Layer
Supports PostgreSQL (Neon / Supabase via DATABASE_URL) and fallback to local SQLite (shogi.db).
"""

import os
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple

DATABASE_URL = os.environ.get("DATABASE_URL", "")

_IS_POSTGRES = False
_PG_MODULE = None

if DATABASE_URL and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")):
    # Try importing psycopg2 or pg8000
    try:
        import psycopg2
        import psycopg2.extras
        _PG_MODULE = "psycopg2"
        _IS_POSTGRES = True
    except ImportError:
        try:
            import pg8000.dbapi
            _PG_MODULE = "pg8000"
            _IS_POSTGRES = True
        except ImportError:
            _IS_POSTGRES = False

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "shogi.db")


def get_connection():
    if _IS_POSTGRES:
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if _PG_MODULE == "psycopg2":
            import psycopg2
            return psycopg2.connect(url)
        elif _PG_MODULE == "pg8000":
            import pg8000.dbapi
            # Parse URL for pg8000 if needed
            return pg8000.dbapi.connect(DATABASE_URL)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _run_query(query: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = False, commit: bool = True):
    conn = get_connection()
    try:
        cur = conn.cursor()
        q = query
        if _IS_POSTGRES:
            q = query.replace("?", "%s")
        cur.execute(q, params)
        result = None
        if fetch_one:
            row = cur.fetchone()
            if row:
                if hasattr(cur, "description") and cur.description:
                    cols = [d[0] for d in cur.description]
                    result = dict(zip(cols, row))
                else:
                    result = dict(row)
        elif fetch_all:
            rows = cur.fetchall()
            if hasattr(cur, "description") and cur.description:
                cols = [d[0] for d in cur.description]
                result = [dict(zip(cols, r)) for r in rows]
            else:
                result = [dict(r) for r in rows]
        if commit:
            conn.commit()
        cur.close()
        return result
    finally:
        conn.close()


def init_db():
    conn = get_connection()
    try:
        cur = conn.cursor()
        if _IS_POSTGRES:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                google_id VARCHAR(128) UNIQUE NOT NULL,
                email VARCHAR(255),
                name VARCHAR(128) NOT NULL,
                picture VARCHAR(512),
                rating INTEGER DEFAULT 1200,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                draws INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                room_code VARCHAR(32),
                sente_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                gote_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sente_name VARCHAR(128) NOT NULL,
                gote_name VARCHAR(128) NOT NULL,
                sente_picture VARCHAR(512),
                gote_picture VARCHAR(512),
                winner_color VARCHAR(16) NOT NULL,
                winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                end_reason VARCHAR(64),
                move_count INTEGER DEFAULT 0,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
        else:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT,
                name TEXT NOT NULL,
                picture TEXT,
                rating INTEGER DEFAULT 1200,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                draws INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """)
            cur.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT,
                sente_user_id INTEGER,
                gote_user_id INTEGER,
                sente_name TEXT NOT NULL,
                gote_name TEXT NOT NULL,
                sente_picture TEXT,
                gote_picture TEXT,
                winner_color TEXT NOT NULL,
                winner_user_id INTEGER,
                end_reason TEXT,
                move_count INTEGER DEFAULT 0,
                played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sente_user_id) REFERENCES users(id),
                FOREIGN KEY (gote_user_id) REFERENCES users(id),
                FOREIGN KEY (winner_user_id) REFERENCES users(id)
            );
            """)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def upsert_user(google_id: str, email: str, name: str, picture: str) -> Dict[str, Any]:
    """Insert or update user upon Google sign in and return user profile dict."""
    user = _run_query(
        "SELECT * FROM users WHERE google_id = ?",
        (google_id,),
        fetch_one=True
    )
    if user:
        _run_query(
            "UPDATE users SET name = ?, picture = ?, email = ? WHERE google_id = ?",
            (name, picture, email, google_id)
        )
        user["name"] = name
        user["picture"] = picture
        user["email"] = email
        return user
    else:
        _run_query(
            "INSERT INTO users (google_id, email, name, picture, rating, wins, losses, draws) VALUES (?, ?, ?, ?, 1200, 0, 0, 0)",
            (google_id, email, name, picture)
        )
        return _run_query(
            "SELECT * FROM users WHERE google_id = ?",
            (google_id,),
            fetch_one=True
        )


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    return _run_query("SELECT * FROM users WHERE id = ?", (user_id,), fetch_one=True)


def calculate_elo(rating_a: int, rating_b: int, score_a: float, k: int = 32) -> Tuple[int, int]:
    """
    Standard Elo rating calculation.
    score_a: 1.0 (win), 0.5 (draw), 0.0 (loss).
    Returns (new_rating_a, new_rating_b).
    """
    expected_a = 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))
    expected_b = 1.0 - expected_a
    new_a = int(round(rating_a + k * (score_a - expected_a)))
    new_b = int(round(rating_b + k * ((1.0 - score_a) - expected_b)))
    return max(100, new_a), max(100, new_b)


def record_match(
    room_code: str,
    sente_user: Optional[Dict[str, Any]],
    gote_user: Optional[Dict[str, Any]],
    sente_name: str,
    gote_name: str,
    winner_color: str,
    end_reason: str,
    move_count: int,
) -> Optional[Dict[str, Any]]:
    """
    Records a match if at least one of the players is registered.
    Updates wins, losses and Elo ratings when applicable.
    """
    sente_id = sente_user.get("id") if sente_user else None
    gote_id = gote_user.get("id") if gote_user else None

    # If neither player is registered, skip database recording
    if not sente_id and not gote_id:
        return None

    sente_pic = sente_user.get("picture") if sente_user else ""
    gote_pic = gote_user.get("picture") if gote_user else ""

    winner_id = None
    if winner_color == "negro":
        winner_id = sente_id
    elif winner_color == "blanco":
        winner_id = gote_id

    # Update stats & Elo
    if sente_id and gote_id:
        # Both registered: calculate Elo delta
        s_score = 1.0 if winner_color == "negro" else (0.5 if winner_color == "tablas" else 0.0)
        new_s_rating, new_g_rating = calculate_elo(sente_user.get("rating", 1200), gote_user.get("rating", 1200), s_score)
        if winner_color == "negro":
            _run_query("UPDATE users SET rating = ?, wins = wins + 1 WHERE id = ?", (new_s_rating, sente_id))
            _run_query("UPDATE users SET rating = ?, losses = losses + 1 WHERE id = ?", (new_g_rating, gote_id))
        elif winner_color == "blanco":
            _run_query("UPDATE users SET rating = ?, losses = losses + 1 WHERE id = ?", (new_s_rating, sente_id))
            _run_query("UPDATE users SET rating = ?, wins = wins + 1 WHERE id = ?", (new_g_rating, gote_id))
        else:
            _run_query("UPDATE users SET rating = ?, draws = draws + 1 WHERE id = ?", (new_s_rating, sente_id))
            _run_query("UPDATE users SET rating = ?, draws = draws + 1 WHERE id = ?", (new_g_rating, gote_id))
    elif sente_id and not gote_id:
        # Sente is registered vs guest
        if winner_color == "negro":
            _run_query("UPDATE users SET wins = wins + 1, rating = rating + 8 WHERE id = ?", (sente_id,))
        elif winner_color == "blanco":
            _run_query("UPDATE users SET losses = losses + 1, rating = MAX(100, rating - 8) WHERE id = ?", (sente_id,))
        else:
            _run_query("UPDATE users SET draws = draws + 1 WHERE id = ?", (sente_id,))
    elif gote_id and not sente_id:
        # Gote is registered vs guest
        if winner_color == "blanco":
            _run_query("UPDATE users SET wins = wins + 1, rating = rating + 8 WHERE id = ?", (gote_id,))
        elif winner_color == "negro":
            _run_query("UPDATE users SET losses = losses + 1, rating = MAX(100, rating - 8) WHERE id = ?", (gote_id,))
        else:
            _run_query("UPDATE users SET draws = draws + 1 WHERE id = ?", (gote_id,))

    # Insert match row
    _run_query("""
    INSERT INTO matches (
        room_code, sente_user_id, gote_user_id,
        sente_name, gote_name, sente_picture, gote_picture,
        winner_color, winner_user_id, end_reason, move_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        room_code, sente_id, gote_id,
        sente_name, gote_name, sente_pic, gote_pic,
        winner_color, winner_id, end_reason, move_count
    ))

    return {
        "recorded": True,
        "winner_color": winner_color,
        "winner_user_id": winner_id,
    }


def get_leaderboard(limit: int = 15) -> List[Dict[str, Any]]:
    """Returns top players ordered by rating and wins."""
    query = """
    SELECT id, name, picture, rating, wins, losses, draws,
           (wins + losses + draws) AS total_games,
           CASE WHEN (wins + losses) > 0
                THEN ROUND((wins * 100.0) / (wins + losses), 1)
                ELSE 0.0 END AS win_rate
    FROM users
    WHERE (wins + losses + draws) > 0
    ORDER BY rating DESC, wins DESC
    LIMIT ?
    """
    return _run_query(query, (limit,), fetch_all=True) or []


def get_recent_matches(limit: int = 10) -> List[Dict[str, Any]]:
    """Returns recent recorded matches."""
    query = """
    SELECT m.id, m.room_code, m.sente_name, m.gote_name,
           m.sente_picture, m.gote_picture, m.winner_color,
           m.winner_user_id, m.end_reason, m.move_count, m.played_at,
           CASE WHEN m.winner_color = 'negro' THEN m.sente_name
                WHEN m.winner_color = 'blanco' THEN m.gote_name
                ELSE 'Tablas' END AS winner_name
    FROM matches m
    ORDER BY m.id DESC
    LIMIT ?
    """
    return _run_query(query, (limit,), fetch_all=True) or []
