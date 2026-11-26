import copy
import hmac
import json
import os
import queue
import random
import re
import secrets
import threading
import time
import urllib.request
import uuid
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple
from flask import Flask, Response, jsonify, request, send_from_directory

import database
from jugador import Jugador
from piezas import Alfil, Caballo, GeneralOro, GeneralPlata, Lancero, Peon, Rey, Torre
from tablero import Tablero

database.init_db()

app = Flask(__name__, static_folder="static", static_url_path="/static")
# Límite máximo de payload HTTP (16 KB) contra ataques de agotamiento de memoria
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

AUTH_SESSIONS = {}  # token -> user_dict

ADMIN_EMAILS = set(
    filter(
        None,
        [
            e.strip().lower()
            for e in (os.environ.get("ADMIN_EMAILS", "hjavier.valdivieso@gmail.com,hjavier.valdivieso@outlook.es").split(","))
        ],
    )
)


def is_admin_user(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return False
    email = (user.get("email") or "").strip().lower()
    return bool(email and email in ADMIN_EMAILS)


def get_authenticated_user(req, token: str | None = None) -> dict | None:
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = req.args.get("auth_token") or req.cookies.get("shogi_auth_token")
    if token:
        if token in AUTH_SESSIONS:
            user = AUTH_SESSIONS[token]
            user["is_admin"] = is_admin_user(user)
            return user
        # Check persistent database session
        user = database.get_user_by_session(token)
        if user:
            user["is_admin"] = is_admin_user(user)
            AUTH_SESSIONS[token] = user
            return user
    return None

# ==========================================
# SEGURIDAD: IP, RATE LIMITING Y SANITIZACIÓN
# ==========================================
MAX_ROOMS = 200
ROOM_IDLE_TTL_SECONDS = 1800  # 30 min
WAITING_ROOM_TTL_SECONDS = 600  # 10 min
PLAYER_IDLE_TTL_SECONDS = 120  # 2 min

SAFE_CODE_RE = re.compile(r"^[A-Z0-9]{6,10}$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{4,36}$")
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f<>\"'`&]")


def get_client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        first_ip = forwarded.split(",")[0].strip()
        if first_ip:
            return first_ip[:45]
    return (request.remote_addr or "0.0.0.0")[:45]


def sanitize_text(value: str | None, max_len: int = 24, default: str = "") -> str:
    if not isinstance(value, str):
        return default
    cleaned = CONTROL_CHARS_RE.sub("", value).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:max_len] or default


class SecurityGuard:
    """Controla Rate Limiting por IP y límite de conexiones SSE simultáneas por IP."""

    MAX_SSE_PER_IP = 4

    def __init__(self):
        self.lock = threading.RLock()
        self.requests_by_ip: dict[str, dict[str, deque]] = defaultdict(lambda: defaultdict(deque))
        self.active_lobby_sse_by_ip: dict[str, list[queue.Queue]] = defaultdict(list)
        self.active_room_sse_by_ip: dict[str, list[queue.Queue]] = defaultdict(list)

    def check_rate_limit(self, ip: str, bucket: str, max_calls: int, window_sec: int) -> bool:
        now = time.time()
        with self.lock:
            q = self.requests_by_ip[ip][bucket]
            while q and now - q[0] > window_sec:
                q.popleft()
            if len(q) >= max_calls:
                return False
            q.append(now)
            return True

    def register_lobby_sse(self, ip: str, q: queue.Queue):
        with self.lock:
            conns = self.active_lobby_sse_by_ip[ip]
            while len(conns) >= self.MAX_SSE_PER_IP:
                old_q = conns.pop(0)
                if old_q is not q:
                    try:
                        old_q.put_nowait("__CLOSE_REPLACED_BY_SAME_IP__")
                    except queue.Full:
                        pass
            conns.append(q)

    def unregister_lobby_sse(self, ip: str, q: queue.Queue):
        with self.lock:
            conns = self.active_lobby_sse_by_ip.get(ip)
            if conns and q in conns:
                conns.remove(q)

    def register_room_sse(self, ip: str, q: queue.Queue):
        with self.lock:
            conns = self.active_room_sse_by_ip[ip]
            while len(conns) >= self.MAX_SSE_PER_IP:
                old_q = conns.pop(0)
                if old_q is not q:
                    try:
                        old_q.put_nowait("__CLOSE_REPLACED_BY_SAME_IP__")
                    except queue.Full:
                        pass
            conns.append(q)

    def unregister_room_sse(self, ip: str, q: queue.Queue):
        with self.lock:
            conns = self.active_room_sse_by_ip.get(ip)
            if conns and q in conns:
                conns.remove(q)


SECURITY = SecurityGuard()

PIECE_META = {
    "K": {
        "kanji_negro": "王",
        "kanji_blanco": "玉",
        "kanji_promoted": "王",
        "romaji": "Gyokushō",
        "es": "Rey",
        "can_promote": False,
    },
    "R": {
        "kanji_negro": "飛",
        "kanji_blanco": "飛",
        "kanji_promoted": "龍",
        "romaji": "Hisha",
        "romaji_promoted": "Ryūō",
        "es": "Torre",
        "es_promoted": "Dragón",
        "can_promote": True,
    },
    "B": {
        "kanji_negro": "角",
        "kanji_blanco": "角",
        "kanji_promoted": "馬",
        "romaji": "Kakugyō",
        "romaji_promoted": "Ryūma",
        "es": "Alfil",
        "es_promoted": "C.Dragón",
        "can_promote": True,
    },
    "G": {
        "kanji_negro": "金",
        "kanji_blanco": "金",
        "kanji_promoted": "金",
        "romaji": "Kinshō",
        "es": "Oro",
        "can_promote": False,
    },
    "S": {
        "kanji_negro": "銀",
        "kanji_blanco": "銀",
        "kanji_promoted": "全",
        "romaji": "Ginshō",
        "romaji_promoted": "Narigin",
        "es": "Plata",
        "es_promoted": "Plata+",
        "can_promote": True,
    },
    "N": {
        "kanji_negro": "桂",
        "kanji_blanco": "桂",
        "kanji_promoted": "圭",
        "romaji": "Keima",
        "romaji_promoted": "Narikei",
        "es": "Caballo",
        "es_promoted": "Caballo+",
        "can_promote": True,
    },
    "L": {
        "kanji_negro": "香",
        "kanji_blanco": "香",
        "kanji_promoted": "杏",
        "romaji": "Kyōsha",
        "romaji_promoted": "Narikyō",
        "es": "Lancero",
        "es_promoted": "Lancero+",
        "can_promote": True,
    },
    "P": {
        "kanji_negro": "歩",
        "kanji_blanco": "歩",
        "kanji_promoted": "と",
        "romaji": "Fuhyō",
        "romaji_promoted": "Tokin",
        "es": "Peón",
        "es_promoted": "Tokin",
        "can_promote": True,
    },
}

HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"]
PIECE_VALUES = {"K": 1000, "R": 10, "B": 9, "G": 6, "S": 5, "N": 4, "L": 3, "P": 1}

STORY_CHAPTERS = {
    1: {
        "chapter": 1,
        "id": "ashigaru",
        "name": "Ashigaru Tōkichi",
        "kanji": "足軽 藤吉",
        "mon": "歩",
        "portrait": "/static/portraits/ashigaru.jpg",
        "stars": 1,
        "elo": 800,
    },
    2: {
        "chapter": 2,
        "id": "hanzo",
        "name": "Hattori Hanzō",
        "kanji": "服部 半蔵",
        "mon": "忍",
        "portrait": "/static/portraits/hanzo.jpg",
        "stars": 2,
        "elo": 1100,
    },
    3: {
        "chapter": 3,
        "id": "shingen",
        "name": "Takeda Shingen",
        "kanji": "武田 信玄",
        "mon": "風",
        "portrait": "/static/portraits/shingen.jpg",
        "stars": 3,
        "elo": 1350,
    },
    4: {
        "chapter": 4,
        "id": "nobunaga",
        "name": "Oda Nobunaga",
        "kanji": "織田 信長",
        "mon": "天",
        "portrait": "/static/portraits/nobunaga.jpg",
        "stars": 4,
        "elo": 1600,
    },
    5: {
        "chapter": 5,
        "id": "sokei",
        "name": "Ōhashi Sōkei",
        "kanji": "大橋 宗桂",
        "mon": "王",
        "portrait": "/static/portraits/sokei.jpg",
        "stars": 5,
        "elo": 1850,
    },
}


def is_in_promotion_zone(color: str, row: int) -> bool:
    if color == "blanco":
        return row < 3
    return row > 5


def is_mandatory_promotion(piece_code: str, color: str, to_row: int) -> bool:
    if piece_code in ("P", "L"):
        return (color == "negro" and to_row == 8) or (color == "blanco" and to_row == 0)
    if piece_code == "N":
        return (color == "negro" and to_row in (7, 8)) or (color == "blanco" and to_row in (0, 1))
    return False


def format_coord(row: int, col: int) -> str:
    shogi_col = 9 - col
    shogi_row = chr(ord("a") + row)
    return f"{shogi_col}{shogi_row} ({row},{col})"


def build_piece_instance(code: str, color: str, promoted: bool = False):
    if code == "K":
        return Rey(color, "K", False)
    if code == "G":
        return GeneralOro(color, "G")
    if code == "R":
        return Torre(bool(promoted), color, "R")
    if code == "B":
        return Alfil(bool(promoted), color, "B")
    if code == "S":
        return GeneralPlata(bool(promoted), color, "S")
    if code == "N":
        return Caballo(bool(promoted), color, "N")
    if code == "L":
        return Lancero(bool(promoted), color, "L")
    return Peon(bool(promoted), color, "P")


class GameRoom:
    def __init__(
        self,
        code: str,
        mode: str = "online",
        visibility: str = "public",
        title: str = "",
        owner_ip: str = "",
        ai_level: int = 3,
        story_chapter: Optional[int] = None,
    ):
        self.code = code
        self.mode = mode  # "online" | "local" | "ai"
        self.visibility = visibility if visibility in ("public", "private") else "public"
        self.title = title or f"Dojo #{code}"
        self.owner_ip = owner_ip
        self.story_chapter = story_chapter if story_chapter in STORY_CHAPTERS else None
        self.ai_level = max(1, min(5, int(self.story_chapter or ai_level or 3)))
        self.lock = threading.RLock()
        self.subscribers: list[queue.Queue] = []
        self.created_at = time.time()
        self.updated_at = time.time()
        self.players = {
            "negro": {"token": None, "name": "Esperando jugador...", "connected": False, "ip": None},
            "blanco": {"token": None, "name": "Esperando jugador...", "connected": False, "ip": None},
        }
        self.reset_board()

    def reset_board(self):
        self.tablero = Tablero()
        self.j_negro = Jugador("negro")
        self.j_blanco = Jugador("blanco")
        self.turn = "negro"
        self.in_check = None
        self.winner = None
        self.reason = None
        self.last_move = None
        self.history = []
        self.move_count = 0
        self._recorded_in_db = False

    def finalize_match_record(self):
        if getattr(self, "_recorded_in_db", False) or not self.winner:
            return
        self._recorded_in_db = True
        sente_user = self.players.get("negro", {}).get("user")
        gote_user = self.players.get("blanco", {}).get("user")
        sente_name = self.players.get("negro", {}).get("name", "Sente")
        gote_name = self.players.get("blanco", {}).get("name", "Gote")
        end_reason = "checkmate" if "Jaque Mate" in (self.reason or "") else ("resignation" if "rendido" in (self.reason or "") else "normal")
        story_chap = getattr(self, "story_chapter", None)
        gote_pic_override = ""
        if story_chap and story_chap in STORY_CHAPTERS:
            gote_pic_override = STORY_CHAPTERS[story_chap].get("portrait", "")
        try:
            database.record_match(
                room_code=self.code,
                sente_user=sente_user,
                gote_user=gote_user,
                sente_name=sente_name,
                gote_name=gote_name,
                winner_color=self.winner,
                end_reason=end_reason,
                move_count=self.move_count,
                story_chapter=story_chap,
                gote_picture_override=gote_pic_override,
            )
        except Exception as e:
            print(f"[DB Error] finalize_match_record {self.code}: {e}")

    def get_jugador(self, color: str) -> Jugador:
        return self.j_negro if color == "negro" else self.j_blanco

    def other_color(self, color: str) -> str:
        return "blanco" if color == "negro" else "negro"

    def is_king_in_check(self, tablero: Tablero, king_color: str) -> bool:
        attacker_color = self.other_color(king_color)
        attacker = self.get_jugador(attacker_color)
        return bool(attacker.verificar_jaque(attacker, tablero))

    def get_legal_moves_for_piece(self, tablero: Tablero, color: str, r0: int, c0: int) -> list[dict]:
        piece = tablero.tab[r0][c0]
        if piece is None or piece.color != color:
            return []

        jugador = self.get_jugador(color)
        legal = []
        for r1 in range(9):
            for c1 in range(9):
                if r0 == r1 and c0 == c1:
                    continue
                sim_board = copy.deepcopy(tablero)
                sim_board.modo_control_tablero = False
                if jugador.jugar_pieza(sim_board, color, (r0, c0), (r1, c1)):
                    if not self.is_king_in_check(sim_board, color):
                        meta = PIECE_META.get(piece.nombre, {})
                        already_promoted = bool(getattr(piece, "promocion", False))
                        can_promote = (
                            meta.get("can_promote", False)
                            and not already_promoted
                            and (is_in_promotion_zone(color, r0) or is_in_promotion_zone(color, r1))
                        )
                        must_promote = can_promote and is_mandatory_promotion(piece.nombre, color, r1)
                        legal.append(
                            {
                                "row": r1,
                                "col": c1,
                                "capture": tablero.tab[r1][c1] is not None,
                                "can_promote": can_promote,
                                "must_promote": must_promote,
                            }
                        )
        return legal

    def get_legal_drops_for_piece(self, tablero: Tablero, color: str, piece_code: str) -> list[dict]:
        has_piece = any(p.color == color and p.nombre == piece_code for p in tablero.piezas_muertas)
        if not has_piece:
            return []

        jugador = self.get_jugador(color)
        legal = []
        for r in range(9):
            for c in range(9):
                if tablero.tab[r][c] is not None:
                    continue
                sim_board = copy.deepcopy(tablero)
                sim_board.modo_control_tablero = False
                if sim_board.reintroducir_pieza(jugador, piece_code, f"{r} {c}", sim_board):
                    if not self.is_king_in_check(sim_board, color):
                        legal.append({"row": r, "col": c})
        return legal

    def has_any_legal_action(self, tablero: Tablero, color: str) -> bool:
        for r in range(9):
            for c in range(9):
                p = tablero.tab[r][c]
                if p is not None and p.color == color:
                    if self.get_legal_moves_for_piece(tablero, color, r, c):
                        return True
        hand_codes = {p.nombre for p in tablero.piezas_muertas if p.color == color}
        for code in hand_codes:
            if self.get_legal_drops_for_piece(tablero, color, code):
                return True
        return False

    def evaluate_post_turn(self, mover_color: str):
        defender_color = self.other_color(mover_color)
        mover = self.get_jugador(mover_color)
        in_check = bool(mover.verificar_jaque(mover, self.tablero))
        self.in_check = defender_color if in_check else None

        has_escape = self.has_any_legal_action(self.tablero, defender_color)
        if not has_escape:
            self.tablero.juego = "terminado"
            self.winner = mover_color
            if in_check:
                self.reason = f"¡Jaque Mate! Victoria para {'Sente (Negro ☗)' if mover_color == 'negro' else 'Gote (Blanco ☖)'}."
            else:
                self.reason = f"Sin jugadas legales para {'Negro' if defender_color == 'negro' else 'Blanco'}. Victoria para {'Negro' if mover_color == 'negro' else 'Blanco'}."
            self.finalize_match_record()
        else:
            self.turn = defender_color

    def is_square_attacked_by(self, tablero: Tablero, target_r: int, target_c: int, attacker_color: str) -> bool:
        """Verifica sin copiar el tablero si alguna pieza de attacker_color ataca (target_r, target_c)."""
        attacker = self.get_jugador(attacker_color)
        prev_mode = tablero.modo_control_tablero
        tablero.modo_control_tablero = True
        try:
            for i in range(9):
                for j in range(9):
                    if i == target_r and j == target_c:
                        continue
                    p = tablero.tab[i][j]
                    if p is not None and p.color == attacker_color:
                        if attacker.jugar_pieza(tablero, attacker_color, (i, j), (target_r, target_c)) is True:
                            return True
            return False
        finally:
            tablero.modo_control_tablero = prev_mode

    def play_ai_turn(self, ai_color: str = "blanco") -> bool:
        """Motor táctico escalable del Dojo (5 niveles de personajes históricos)."""
        if self.winner or self.turn != ai_color:
            return False

        level = getattr(self, "ai_level", 3)
        enemy_color = self.other_color(ai_color)
        jugador = self.get_jugador(ai_color)
        candidates = []

        # Nivel de ruido aleatorio según dificultad (Nivel 1: alto azar -> Nivel 5: precisión de Meijin)
        noise_map = {1: 4.2, 2: 1.4, 3: 0.45, 4: 0.18, 5: 0.05}
        noise_amp = noise_map.get(level, 0.4)

        # Ubicación de ambos reyes para heurísticas de ataque y defensa
        enemy_king_pos = (8, 4) if ai_color == "blanco" else (0, 4)
        own_king_pos = (0, 4) if ai_color == "blanco" else (8, 4)
        for r in range(9):
            for c in range(9):
                pk = self.tablero.tab[r][c]
                if pk is not None and pk.nombre == "K":
                    if pk.color == enemy_color:
                        enemy_king_pos = (r, c)
                    elif pk.color == ai_color:
                        own_king_pos = (r, c)

        # En niveles 4 y 5, detectar qué piezas propias valiosas están amenazadas ahora mismo
        threatened_own_squares = set()
        if level >= 4:
            for r in range(9):
                for c in range(9):
                    p = self.tablero.tab[r][c]
                    if p is not None and p.color == ai_color and p.nombre != "K":
                        if self.is_square_attacked_by(self.tablero, r, c, enemy_color):
                            threatened_own_squares.add((r, c))

        # 1. Evaluar todos los movimientos legales de piezas en el tablero
        for r0 in range(9):
            for c0 in range(9):
                p = self.tablero.tab[r0][c0]
                if p is not None and p.color == ai_color:
                    p_val = PIECE_VALUES.get(p.nombre, 1)
                    is_currently_threatened = (r0, c0) in threatened_own_squares
                    for m in self.get_legal_moves_for_piece(self.tablero, ai_color, r0, c0):
                        r1, c1 = m["row"], m["col"]
                        target = self.tablero.tab[r1][c1]
                        score = random.uniform(0.0, noise_amp)

                        if target is not None:
                            capture_mult = 2.0 if level == 1 else (3.2 if level <= 3 else 3.8)
                            score += PIECE_VALUES.get(target.nombre, 1) * capture_mult
                            if getattr(target, "promocion", False):
                                score += 2.2

                        # Promoción (Nivel 1 a veces olvida promocionar si no es obligatorio)
                        will_promote = m["can_promote"]
                        if level == 1 and will_promote and not m["must_promote"] and random.random() < 0.35:
                            will_promote = False
                        if will_promote:
                            promo_bonus = 3.8 if (level >= 4 and p.nombre in ("R", "B")) else 2.5
                            score += promo_bonus

                        # Personalidad Nivel 2 (Hattori Hanzō): afinidad por Caballos y Alfiles
                        if level == 2 and p.nombre in ("N", "B"):
                            score += 1.2

                        # Si la pieza propia estaba amenazada, premiar ponerla a salvo
                        if is_currently_threatened:
                            score += p_val * 1.8

                        # Avanzar hacia el rey enemigo y controlar el centro
                        if ai_color == "blanco" and r1 > r0:
                            score += 0.35
                        elif ai_color == "negro" and r1 < r0:
                            score += 0.35
                        score += (4 - abs(4 - c1)) * 0.12

                        # Presión sobre la vecindad del Rey enemigo (Niveles 3-5)
                        if level >= 3:
                            dist_before = abs(r0 - enemy_king_pos[0]) + abs(c0 - enemy_king_pos[1])
                            dist_after = abs(r1 - enemy_king_pos[0]) + abs(c1 - enemy_king_pos[1])
                            if dist_after < dist_before and p.nombre != "K":
                                score += 0.45 * (level - 2)
                            # En Nivel 5 (Meijin), Generales de Oro/Plata protegen cerca de su propio Rey si no atacan
                            if level == 5 and p.nombre in ("G", "S") and r0 <= 2:
                                own_dist = abs(r1 - own_king_pos[0]) + abs(c1 - own_king_pos[1])
                                if own_dist <= 2:
                                    score += 0.6

                        candidates.append(("move", score, (r0, c0), (r1, c1), will_promote))

        # 2. Evaluar reincorporaciones legales (Drops) desde el Komadai
        hand_codes = {p.nombre for p in self.tablero.piezas_muertas if p.color == ai_color}
        for code in hand_codes:
            drops = self.get_legal_drops_for_piece(self.tablero, ai_color, code)
            for d in drops:
                r1, c1 = d["row"], d["col"]
                in_enemy_half = (r1 >= 4) if ai_color == "blanco" else (r1 <= 4)
                dist_enemy_king = abs(r1 - enemy_king_pos[0]) + abs(c1 - enemy_king_pos[1])

                if in_enemy_half or self.in_check == ai_color or (level >= 2 and dist_enemy_king <= 3):
                    drop_mult = 0.85 if level == 2 else (0.55 if level >= 4 else 0.45)
                    score = PIECE_VALUES.get(code, 1) * drop_mult + (4 - abs(4 - c1)) * 0.15 + random.uniform(0.0, noise_amp)
                    if level == 2 and in_enemy_half:
                        score += 1.8  # Emboscada Shinobi de Hattori Hanzō
                    if level >= 3 and dist_enemy_king <= 2:
                        score += 1.6 * (level - 2)
                    candidates.append(("drop", score, code, (r1, c1), False))

        if not candidates:
            return False

        candidates.sort(key=lambda x: x[1], reverse=True)

        # 3. Análisis táctico de seguridad y Jaque/Mate para niveles 3, 4 y 5 sobre los mejores candidatos
        if level >= 3:
            top_k = 14 if level == 3 else (20 if level == 4 else 26)
            refined = []
            for idx, cand in enumerate(candidates):
                action_type, base_score, src, dst, should_promote = cand
                if idx >= top_k:
                    refined.append(cand)
                    continue

                r1, c1 = dst
                sim_board = copy.deepcopy(self.tablero)
                sim_board.modo_control_tablero = False
                ok = False
                moved_val = 1

                if action_type == "move":
                    r0, c0 = src
                    piece_obj = sim_board.tab[r0][c0]
                    moved_val = PIECE_VALUES.get(piece_obj.nombre, 1) if piece_obj else 1
                    if jugador.jugar_pieza(sim_board, ai_color, (r0, c0), (r1, c1)):
                        ok = True
                        mp = sim_board.tab[r1][c1]
                        if should_promote and mp is not None and hasattr(mp, "promocion"):
                            mp.promocion = True
                else:
                    piece_code = src
                    moved_val = PIECE_VALUES.get(piece_code, 1)
                    if sim_board.reintroducir_pieza(jugador, piece_code, f"{r1} {c1}", sim_board):
                        ok = True

                if not ok:
                    refined.append((action_type, base_score - 100.0, src, dst, should_promote))
                    continue

                tactical_delta = 0.0

                # ¿Esta jugada da Jaque (Ōte) al Rey del jugador?
                gives_check = self.is_king_in_check(sim_board, enemy_color)
                if gives_check:
                    tactical_delta += 3.5 if level == 3 else 5.2
                    # En niveles 4 y 5: verificar si es Jaque Mate inmediato (Tsumi)
                    if level >= 4 and not self.has_any_legal_action(sim_board, enemy_color):
                        tactical_delta += 1000.0

                # ¿La casilla destino (r1, c1) está atacada por el jugador humano?
                dest_attacked = self.is_square_attacked_by(sim_board, r1, c1, enemy_color)
                if dest_attacked:
                    # En niveles 4 y 5 comprobamos si la casilla está defendida por otra pieza nuestra
                    is_defended = False
                    if level >= 4 and sim_board.tab[r1][c1] is not None:
                        sim_board.tab[r1][c1].color = enemy_color
                        is_defended = self.is_square_attacked_by(sim_board, r1, c1, ai_color)
                        sim_board.tab[r1][c1].color = ai_color

                    safety_weight = 2.0 if level == 3 else (2.5 if level == 4 else 2.9)
                    if is_defended:
                        # Si está defendida, solo penalizar si entregamos una pieza cara
                        tactical_delta -= moved_val * (safety_weight * 0.45)
                    else:
                        # Pieza colgada gratis: fuerte penalización
                        tactical_delta -= moved_val * safety_weight

                # Nivel 5 (Meijin Ōhashi Sōkei): penalizar si dejamos Torre o Alfil propio colgado en otra casilla
                if level == 5:
                    for rr in range(9):
                        for cc in range(9):
                            if rr == r1 and cc == c1:
                                continue
                            own_p = sim_board.tab[rr][cc]
                            if own_p is not None and own_p.color == ai_color and own_p.nombre in ("R", "B", "G", "S"):
                                if self.is_square_attacked_by(sim_board, rr, cc, enemy_color):
                                    tactical_delta -= PIECE_VALUES.get(own_p.nombre, 5) * 1.35

                refined.append((action_type, base_score + tactical_delta, src, dst, should_promote))

            refined.sort(key=lambda x: x[1], reverse=True)
            candidates = refined

        action_type, _, src, dst, should_promote = candidates[0]
        r1, c1 = dst

        if action_type == "move":
            r0, c0 = src
            target_before = self.tablero.tab[r1][c1]
            captured_code = target_before.nombre if target_before is not None else None
            piece = self.tablero.tab[r0][c0]
            was_promoted = bool(getattr(piece, "promocion", False))

            self.tablero.modo_control_tablero = False
            if not jugador.jugar_pieza(self.tablero, ai_color, (r0, c0), (r1, c1)):
                return False

            moved_piece = self.tablero.tab[r1][c1]
            promoted_now = False
            if should_promote and hasattr(moved_piece, "promocion") and not was_promoted:
                moved_piece.promocion = True
                promoted_now = True

            self.move_count += 1
            symbol = "☗" if ai_color == "negro" else "☖"
            action_sym = "x" if captured_code else "→"
            promo_suffix = "+" if promoted_now else ""
            notation = f"{self.move_count}. {symbol} {moved_piece.nombre} {format_coord(r0, c0)} {action_sym} {format_coord(r1, c1)}{promo_suffix}"
            self.last_move = {
                "type": "move",
                "color": ai_color,
                "from": [r0, c0],
                "to": [r1, c1],
                "piece": moved_piece.nombre,
                "captured": captured_code,
                "promoted": promoted_now,
                "notation": notation,
            }
            self.history.append(self.last_move)
        else:
            piece_code = src
            if not self.tablero.reintroducir_pieza(jugador, piece_code, f"{r1} {c1}", self.tablero):
                return False
            self.move_count += 1
            symbol = "☗" if ai_color == "negro" else "☖"
            notation = f"{self.move_count}. {symbol} {piece_code}* → {format_coord(r1, c1)}"
            self.last_move = {
                "type": "drop",
                "color": ai_color,
                "from": None,
                "to": [r1, c1],
                "piece": piece_code,
                "captured": None,
                "promoted": False,
                "notation": notation,
            }
            self.history.append(self.last_move)

        self.evaluate_post_turn(ai_color)
        return True

    def serialize_board(self) -> list[list[dict | None]]:
        grid = []
        for r in range(9):
            row_cells = []
            for c in range(9):
                p = self.tablero.tab[r][c]
                if p is None:
                    row_cells.append(None)
                else:
                    code = p.nombre
                    promoted = bool(getattr(p, "promocion", False))
                    meta = PIECE_META[code]
                    kanji = (
                        meta["kanji_promoted"]
                        if promoted
                        else (meta["kanji_negro"] if p.color == "negro" else meta["kanji_blanco"])
                    )
                    es_label = meta.get("es_promoted", meta["es"]) if promoted else meta["es"]
                    row_cells.append(
                        {
                            "code": code,
                            "display_code": f"+{code}" if promoted else code,
                            "color": p.color,
                            "promoted": promoted,
                            "kanji": kanji,
                            "es": es_label,
                            "romaji": meta.get("romaji_promoted", meta["romaji"]) if promoted else meta["romaji"],
                        }
                    )
            grid.append(row_cells)
        return grid

    def serialize_captured(self) -> dict:
        counts = {"negro": {}, "blanco": {}}
        for p in self.tablero.piezas_muertas:
            counts[p.color][p.nombre] = counts[p.color].get(p.nombre, 0) + 1

        result = {"negro": [], "blanco": []}
        for color in ("negro", "blanco"):
            for code in HAND_ORDER:
                cnt = counts[color].get(code, 0)
                if cnt > 0:
                    meta = PIECE_META[code]
                    result[color].append(
                        {
                            "code": code,
                            "count": cnt,
                            "kanji": meta["kanji_negro"] if color == "negro" else meta["kanji_blanco"],
                            "es": meta["es"],
                            "romaji": meta["romaji"],
                        }
                    )
        return result

    def get_status(self) -> str:
        both_ready = (
            self.mode in ("local", "ai")
            or (self.players["negro"]["connected"] and self.players["blanco"]["connected"])
        )
        return "finished" if self.winner else ("playing" if both_ready else "waiting")

    def serialize_summary(self) -> dict:
        open_seat = None
        if not self.players["negro"]["connected"]:
            open_seat = "negro"
        elif not self.players["blanco"]["connected"]:
            open_seat = "blanco"

        return {
            "room_code": self.code,
            "title": self.title,
            "mode": self.mode,
            "visibility": self.visibility,
            "status": self.get_status(),
            "turn": self.turn,
            "move_count": self.move_count,
            "open_seat": open_seat,
            "created_at": int(self.created_at),
            "players": {
                "negro": {
                    "name": self.players["negro"]["name"],
                    "connected": self.players["negro"]["connected"],
                },
                "blanco": {
                    "name": self.players["blanco"]["name"],
                    "connected": self.players["blanco"]["connected"],
                },
            },
        }

    def serialize(self) -> dict:
        return {
            "room_code": self.code,
            "title": self.title,
            "mode": self.mode,
            "visibility": self.visibility,
            "story_chapter": getattr(self, "story_chapter", None),
            "ai_level": getattr(self, "ai_level", 3),
            "status": self.get_status(),
            "turn": self.turn,
            "in_check": self.in_check,
            "winner": self.winner,
            "reason": self.reason,
            "move_count": self.move_count,
            "last_move": self.last_move,
            "history": self.history[-40:],
            "board": self.serialize_board(),
            "captured": self.serialize_captured(),
            "players": {
                "negro": {
                    "name": self.players["negro"]["name"],
                    "connected": self.players["negro"]["connected"],
                },
                "blanco": {
                    "name": self.players["blanco"]["name"],
                    "connected": self.players["blanco"]["connected"],
                },
            },
        }

    def to_snapshot(self) -> dict:
        grid = []
        for r in range(9):
            row_data = []
            for c in range(9):
                p = self.tablero.tab[r][c]
                if p is None:
                    row_data.append(None)
                else:
                    row_data.append(
                        {
                            "code": p.nombre,
                            "color": p.color,
                            "promoted": bool(getattr(p, "promocion", False)),
                        }
                    )
            grid.append(row_data)

        dead = [
            {"code": p.nombre, "color": p.color}
            for p in self.tablero.piezas_muertas
        ]
        return {
            "code": self.code,
            "mode": self.mode,
            "visibility": self.visibility,
            "title": self.title,
            "owner_ip": self.owner_ip,
            "story_chapter": self.story_chapter,
            "ai_level": self.ai_level,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "turn": self.turn,
            "in_check": self.in_check,
            "winner": self.winner,
            "reason": self.reason,
            "last_move": self.last_move,
            "history": self.history[-40:],
            "move_count": self.move_count,
            "recorded_in_db": getattr(self, "_recorded_in_db", False),
            "players": self.players,
            "grid": grid,
            "dead": dead,
        }

    def apply_snapshot(self, snap: dict):
        self.mode = snap.get("mode", self.mode)
        self.visibility = snap.get("visibility", self.visibility)
        self.title = snap.get("title", self.title)
        self.owner_ip = snap.get("owner_ip", self.owner_ip)
        self.story_chapter = snap.get("story_chapter", self.story_chapter)
        self.ai_level = snap.get("ai_level", self.ai_level)
        self.created_at = float(snap.get("created_at", self.created_at))
        self.updated_at = float(snap.get("updated_at", self.updated_at))
        self.turn = snap.get("turn", "negro")
        self.in_check = snap.get("in_check")
        self.winner = snap.get("winner")
        self.reason = snap.get("reason")
        self.last_move = snap.get("last_move")
        self.history = snap.get("history", [])
        self.move_count = int(snap.get("move_count", 0))
        self._recorded_in_db = bool(snap.get("recorded_in_db", False))
        if "players" in snap and isinstance(snap["players"], dict):
            self.players = snap["players"]

        grid = snap.get("grid")
        if isinstance(grid, list) and len(grid) == 9:
            for r in range(9):
                for c in range(9):
                    cell = grid[r][c]
                    if cell is None:
                        self.tablero.tab[r][c] = None
                    else:
                        self.tablero.tab[r][c] = build_piece_instance(
                            cell["code"],
                            cell["color"],
                            bool(cell.get("promoted", False)),
                        )
        dead = snap.get("dead")
        if isinstance(dead, list):
            self.tablero.piezas_muertas = [
                build_piece_instance(d["code"], d["color"], False) for d in dead
            ]
        self.tablero.juego = "terminado" if self.winner else "iniciado"

    @classmethod
    def from_snapshot(cls, snap: dict) -> "GameRoom":
        room = cls(
            code=snap["code"],
            mode=snap.get("mode", "online"),
            visibility=snap.get("visibility", "public"),
            title=snap.get("title", ""),
            owner_ip=snap.get("owner_ip", ""),
            ai_level=snap.get("ai_level", 3),
            story_chapter=snap.get("story_chapter"),
        )
        room.apply_snapshot(snap)
        return room

    def persist(self):
        database.save_active_room(self.code, self.to_snapshot(), self.updated_at)

    def broadcast(self):
        self.persist()
        payload = json.dumps(self.serialize())
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            if q in self.subscribers:
                self.subscribers.remove(q)
        broadcast_lobby()


ROOMS: dict[str, GameRoom] = {}
ROOMS_LOCK = threading.RLock()


def generate_room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if code not in ROOMS:
            return code


def cleanup_expired_resources():
    now = time.time()
    with ROOMS_LOCK:
        expired_codes = []
        for code, room in ROOMS.items():
            age = now - room.updated_at
            if room.get_status() == "waiting" and age > WAITING_ROOM_TTL_SECONDS:
                expired_codes.append(code)
            elif age > ROOM_IDLE_TTL_SECONDS:
                expired_codes.append(code)
        for code in expired_codes:
            del ROOMS[code]
            database.delete_active_room(code)


def get_room_or_404(code: str) -> GameRoom | None:
    clean = (code or "").strip().upper()
    if not SAFE_CODE_RE.match(clean):
        return None
    cleanup_expired_resources()
    with ROOMS_LOCK:
        room = ROOMS.get(clean)
        snap = database.load_active_room(clean)
        if snap:
            if room is None:
                room = GameRoom.from_snapshot(snap)
                ROOMS[clean] = room
            elif (
                snap.get("move_count", 0) != room.move_count
                or float(snap.get("updated_at", 0)) > room.updated_at
                or snap.get("winner") != room.winner
            ):
                room.apply_snapshot(snap)
        return room


class LobbyManager:
    MAX_PLAYERS_PER_IP = 2

    def __init__(self):
        self.lock = threading.RLock()
        self.subscribers: list[queue.Queue] = []
        # player_id -> {"player_id", "ip", "name", "status": "idle"|"searching", "last_seen", "match": None}
        self.players: dict[str, dict] = {}
        self.match_queue: list[str] = []

    def touch_player(self, player_id: str, name: str, ip: str) -> str:
        if not player_id or not SAFE_ID_RE.match(player_id):
            player_id = secrets.token_hex(6)
        with self.lock:
            now = time.time()
            stale_ids = [
                pid
                for pid, p in self.players.items()
                if now - p["last_seen"] > PLAYER_IDLE_TTL_SECONDS and not p.get("match")
            ]
            for pid in stale_ids:
                if pid in self.match_queue:
                    self.match_queue.remove(pid)
                del self.players[pid]

            # Limitar cantidad de identidades simultáneas por IP (máx 2 para permitir 2 dispositivos en la misma red Wi-Fi / NAT)
            same_ip_pids = [
                pid for pid, p in self.players.items() if p.get("ip") == ip and pid != player_id
            ]
            same_ip_pids.sort(key=lambda pid: self.players[pid]["last_seen"])
            while len(same_ip_pids) >= self.MAX_PLAYERS_PER_IP:
                evict_pid = same_ip_pids.pop(0)
                if evict_pid in self.match_queue:
                    self.match_queue.remove(evict_pid)
                if evict_pid in self.players and not self.players[evict_pid].get("match"):
                    del self.players[evict_pid]

            clean_name = sanitize_text(name, max_len=24, default=f"Samurai-{player_id[:4].upper()}")
            if player_id not in self.players:
                self.players[player_id] = {
                    "player_id": player_id,
                    "ip": ip,
                    "name": clean_name,
                    "status": "idle",
                    "last_seen": now,
                    "match": None,
                }
            else:
                self.players[player_id]["ip"] = ip
                if name and name.strip():
                    self.players[player_id]["name"] = clean_name
                self.players[player_id]["last_seen"] = now
            return player_id

    def remove_player(self, player_id: str, ip: str | None = None):
        with self.lock:
            if player_id in self.match_queue:
                self.match_queue.remove(player_id)
            if player_id in self.players:
                if not self.players[player_id].get("match"):
                    del self.players[player_id]

    def serialize(self) -> dict:
        with ROOMS_LOCK:
            public_rooms = [
                r.serialize_summary()
                for r in sorted(ROOMS.values(), key=lambda x: x.created_at, reverse=True)
                if r.mode == "online" and r.visibility == "public"
            ]

        open_rooms = [r for r in public_rooms if r["status"] == "waiting"]
        live_rooms = [r for r in public_rooms if r["status"] == "playing"]

        with self.lock:
            # Limpiar cola de jugadores inactivos
            self.match_queue = [pid for pid in self.match_queue if pid in self.players]
            online_list = [
                {
                    "player_id": p["player_id"],
                    "name": p["name"],
                    "status": "searching" if p["player_id"] in self.match_queue else p["status"],
                }
                for p in self.players.values()
            ]
            matches_by_player = {
                pid: p["match"] for pid, p in self.players.items() if p.get("match") is not None
            }

        return {
            "open_rooms": open_rooms[:20],
            "live_rooms": live_rooms[:20],
            "queue_count": len(self.match_queue),
            "online_players": online_list[:40],
            "matches": matches_by_player,
        }

    def broadcast(self):
        payload = json.dumps(self.serialize())
        with self.lock:
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                if q in self.subscribers:
                    self.subscribers.remove(q)


LOBBY = LobbyManager()


def broadcast_lobby():
    LOBBY.broadcast()


@app.after_request
def add_security_and_cache_headers(response):
    if request.path == "/" or request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    # Cabeceras de seguridad contra XSS, Clickjacking y MIME Sniffing
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


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/ads.txt")
def ads_txt():
    return send_from_directory(app.static_folder, "ads.txt", mimetype="text/plain")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(app.static_folder, "favicon.ico", mimetype="image/x-icon")


@app.route("/apple-touch-icon.png")
@app.route("/apple-touch-icon-precomposed.png")
def apple_touch_icon():
    return send_from_directory(app.static_folder, "apple-touch-icon.png", mimetype="image/png")


@app.route("/icon-48.png")
def icon_48():
    return send_from_directory(app.static_folder, "icon-48.png", mimetype="image/png")


@app.route("/icon-192.png")
def icon_192():
    return send_from_directory(app.static_folder, "icon-192.png", mimetype="image/png")


@app.route("/icon-512.png")
def icon_512():
    return send_from_directory(app.static_folder, "icon-512.png", mimetype="image/png")


@app.route("/icon.svg")
def icon_svg():
    return send_from_directory(app.static_folder, "icon.svg", mimetype="image/svg+xml")


@app.route("/manifest.json")
def manifest_json():
    manifest = {
        "name": "Dojo Shōgi Online (将棋)",
        "short_name": "Dojo Shōgi",
        "description": "Juega Shōgi (Ajedrez Tradicional Japonés) online gratis en tiempo real para 2 jugadores con Lobby de Matchmaking y Academia interactiva.",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#181411",
        "theme_color": "#181411",
        "icons": [
            {
                "src": "/static/icon-48.png",
                "sizes": "48x48",
                "type": "image/png",
            },
            {
                "src": "/static/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
            },
            {
                "src": "/static/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
            },
            {
                "src": "/static/icon.svg",
                "sizes": "any",
                "type": "image/svg+xml",
            },
        ],
    }
    return jsonify(manifest)


SITE_URL = "https://www.dojoshogi.online"


@app.route("/robots.txt")
def robots_txt():
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        f"Sitemap: {SITE_URL}/sitemap.xml",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    today = time.strftime("%Y-%m-%d")
    pages = [
        ("/", "daily", "1.0"),
        ("/sobre-nosotros", "monthly", "0.8"),
        ("/politica-de-privacidad", "monthly", "0.7"),
        ("/terminos-de-servicio", "monthly", "0.7"),
    ]
    urls_xml = "".join(
        f"""  <url>
    <loc>{SITE_URL}{path}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{prio}</priority>
  </url>\n"""
        for path, freq, prio in pages
    )
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls_xml}</urlset>"""
    return Response(xml, mimetype="application/xml")


def render_legal_page(
    title: str,
    description: str,
    body_html: str,
    canonical_path: str = "/",
    lang: str = "es",
    other_lang_url: str = "/",
) -> Response:
    year = time.strftime("%Y")
    canonical_url = f"{SITE_URL}{canonical_path}"
    is_en = lang == "en"

    html_lang = "en" if is_en else "es"
    og_locale = "en_US" if is_en else "es_AR"
    subtitle = (
        "Online Dojo · Real-Time Matchmaking & Game Rooms"
        if is_en
        else "Dojo Online · Matchmaking y Salas en Tiempo Real"
    )
    back_label = "← Back to Dojo / Board" if is_en else "← Volver al Dojo / Tablero"
    home_url = "/?lang=en" if is_en else "/"
    toggle_label = "ES" if is_en else "EN"

    footer_desc = (
        "Free and independent community platform to play Shōgi (Traditional Japanese Chess) online in real-time for 2 players or vs AI, with official rule motor in Python, Matchmaking Lobby, and interactive 12-lesson Dojo Academy in Spanish and English."
        if is_en
        else "Plataforma web comunitaria e independiente para jugar al Shōgi (Ajedrez Tradicional Japonés) online en tiempo real para 2 jugadores, con motor de reglas oficiales en Python, Lobby de Matchmaking y Academia interactiva paso a paso en español."
    )
    link_lobby = ("Lobby & Play" if is_en else "Lobby & Jugar", home_url)
    link_about = (
        "About Us & Contact" if is_en else "Sobre Nosotros & Contacto",
        "/about" if is_en else "/sobre-nosotros",
    )
    link_privacy = (
        "Privacy Policy" if is_en else "Política de Privacidad",
        "/privacy" if is_en else "/politica-de-privacidad",
    )
    link_terms = (
        "Terms of Service" if is_en else "Términos de Servicio",
        "/terms" if is_en else "/terminos-de-servicio",
    )

    footer_copy = (
        f"© {year} Shōgi Dojo Online. Created and maintained by <strong>Javier Valdivieso</strong> (Mendoza, Argentina)."
        if is_en
        else f"© {year} Shōgi Dojo Online. Creado y mantenido por <strong>Javier Valdivieso</strong> (Mendoza, Argentina)."
    )
    footer_source = (
        'Open source under MIT License · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>'
        if is_en
        else 'Código abierto bajo Licencia MIT · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>'
    )

    html = f"""<!DOCTYPE html>
<html lang="{html_lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | Dojo Shōgi Online (将棋)</title>
  <meta name="description" content="{description}">
  <meta name="author" content="Javier Valdivieso">
  <meta name="robots" content="index, follow">
  <meta name="google-adsense-account" content="ca-pub-4665232577336299">
  <link rel="canonical" href="{canonical_url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="{og_locale}">
  <meta property="og:site_name" content="Dojo Shōgi Online (将棋)">
  <meta property="og:title" content="{title} | Dojo Shōgi Online">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{canonical_url}">
  <meta property="og:image" content="{SITE_URL}/static/og-image.png">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Shippori+Mincho:wght@600;700;800&family=Yuji+Syuku&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/styles.css?v=22">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4665232577336299" crossorigin="anonymous"></script>
  <script>
    window.va = window.va || function () {{ (window.vaq = window.vaq || []).push(arguments); }};
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-koma" aria-hidden="true">王</span>
      <div>
        <h1>Shōgi <span lang="ja">将棋</span></h1>
        <p class="subtitle">{subtitle}</p>
      </div>
    </div>
    <div class="room-bar">
      <div class="lang-switch-pill">
        <a href="{other_lang_url}" class="btn-lang-toggle" title="Cambiar idioma / Switch language" style="text-decoration:none;">
          🌐 <span>{toggle_label}</span>
        </a>
      </div>
      <a href="{home_url}" class="btn btn-primary" style="text-decoration:none;">{back_label}</a>
    </div>
  </header>

  <main class="legal-page-container">
    <article class="legal-card">
      {body_html}
    </article>
  </main>

  <footer class="site-footer">
    <div class="site-footer-inner">
      <div class="site-footer-top">
        <div class="site-footer-brand">
          <div class="site-footer-logo">
            <span class="footer-koma-icon" aria-hidden="true">王</span>
            <span>Shōgi Dojo Online (<span lang="ja">将棋</span>)</span>
          </div>
          <p>{footer_desc}</p>
        </div>
        <nav class="site-footer-nav" aria-label="Enlaces legales y de información">
          <a href="{link_lobby[1]}">{link_lobby[0]}</a>
          <a href="{link_about[1]}">{link_about[0]}</a>
          <a href="{link_privacy[1]}">{link_privacy[0]}</a>
          <a href="{link_terms[1]}">{link_terms[0]}</a>
        </nav>
      </div>
      <div class="site-footer-bottom">
        <p>{footer_copy}</p>
        <p>{footer_source}</p>
      </div>
    </div>
  </footer>
</body>
</html>"""
    return Response(html, mimetype="text/html")


@app.route("/sobre-nosotros")
@app.route("/about")
def page_sobre_nosotros():
    is_en = request.path == "/about" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>About Us &amp; Contact</h1>
      <p class="legal-updated">Independent Community Japanese Chess Platform</p>

      <section class="legal-section">
        <h2>What is Shōgi Dojo Online?</h2>
        <p>
          <strong>Shōgi Dojo Online (将棋)</strong> was founded with the mission to bring the ancient Japanese strategy game —<em>Shōgi</em>— to an international community through a free, lightning-fast web platform with no mandatory registrations and clear interactive guides.
        </p>
        <p>The platform features:</p>
        <ul>
          <li><strong>Official Python Rules Motor (OOP)</strong>: Complete piece validation, promotion in enemy ranks (<em>Nari</em>), drop reincorporation from the <em>Komadai</em> (<em>Drops</em>), algorithmic check detection (<em>Ōte</em>), checkmate (<em>Tsumi</em>), and traditional prohibitions like <em>Nifu</em> (two pawns on a file) and <em>Uchifuzume</em> (drop pawn mate).</li>
          <li><strong>Real-Time Matchmaking Lobby</strong>: Automated quick pairing between online players, open public rooms, private code/link invite rooms, and live spectator mode powered by Server-Sent Events (SSE).</li>
          <li><strong>Interactive 12-Lesson Dojo Academy</strong>: A practical, hands-on step-by-step course with visual compass diagrams (3×3 and 5×5) enabling anyone to master every piece without having to blindly memorize Kanji symbols.</li>
        </ul>
      </section>

      <section class="legal-section legal-highlight-box">
        <h2>Creator &amp; Mission</h2>
        <p>
          The project was designed, developed, and maintained independently by <strong>Javier Valdivieso</strong>, software developer based in Mendoza, Argentina. The goal is to provide an accessible, welcoming learning hub combining traditional pentagonal wooden pieces (<em>Koma</em>) with modern web design and multilingual accessibility.
        </p>
        <div class="legal-badges">
          <span>Engine Repository: <a href="https://github.com/valdivieso01/shogi" target="_blank" rel="noopener noreferrer">valdivieso01/shogi</a></span>
          <span>Web Platform: <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a></span>
          <span>Location: Mendoza, Argentina</span>
        </div>
      </section>

      <section class="legal-section">
        <h2>Contact &amp; Feedback</h2>
        <p>
          Found an interesting edge case in the engine, have ideas for new lessons in the Academy, or wish to make an inquiry regarding privacy or advertising?
        </p>
        <p>
          Reach out directly via email to:
          <a href="mailto:hjavier.valdivieso@outlook.es" class="legal-mail-link">hjavier.valdivieso@outlook.es</a>
        </p>
      </section>
        """
        return render_legal_page(
            "About Us & Contact",
            "Learn about Dojo Shōgi Online (dojoshogi.online), an open-source Japanese chess project with matchmaking and a 12-lesson academy, and how to contact creator Javier Valdivieso.",
            body,
            canonical_path="/about",
            lang="en",
            other_lang_url="/sobre-nosotros",
        )

    body = """
      <h1>Sobre Nosotros &amp; Contacto</h1>
      <p class="legal-updated">Proyecto Independiente de Ajedrez Japonés en Español e Inglés</p>

      <section class="legal-section">
        <h2>¿Qué es Shōgi Dojo Online?</h2>
        <p>
          <strong>Shōgi Dojo Online (将棋)</strong> nació con la misión de acercar el milenario juego de estrategia japonés —el <em>Shōgi</em>— a la comunidad hispanohablante mediante una plataforma web gratuita, rápida, sin registros obligatorios y con explicaciones claras en español e inglés.
        </p>
        <p>La plataforma combina:</p>
        <ul>
          <li><strong>Motor oficial de reglas en Python (POO)</strong>: Valida movimientos individuales de cada pieza, coronaciones en zona enemiga (<em>Nari</em>), reincorporación de piezas capturadas desde el <em>Komadai</em> (<em>Drops</em>), detección algorítmica de jaque (<em>Ōte</em>), jaque mate (<em>Tsumi</em>) y prohibiciones tradicionales como <em>Nifu</em> (dos peones en la misma columna) y <em>Uchifuzume</em>.</li>
          <li><strong>Lobby de Matchmaking en Tiempo Real</strong>: Emparejamiento automático entre jugadores online, salas públicas abiertas, salas privadas mediante código o enlace directo y modo espectador en vivo mediante Server-Sent Events (SSE).</li>
          <li><strong>Academia Interactiva de 12 Lecciones</strong>: Un curso práctico guiado con brújulas visuales de movimiento (3×3 y 5×5) donde cualquier principiante aprende cómo mueve cada ficha sin tener que memorizar los caracteres Kanji a ciegas.</li>
        </ul>
      </section>

      <section class="legal-section legal-highlight-box">
        <h2>El Creador y Misión</h2>
        <p>
          El proyecto fue creado y es mantenido de forma independiente por <strong>Javier Valdivieso</strong>, desarrollador de software en Mendoza, Argentina. El objetivo es ofrecer un punto de encuentro accesible y educativo que combine fichas pentagonales tradicionales (<em>Koma</em>) con ayudas visuales pensadas para jugadores de habla hispana e internacional.
        </p>
        <div class="legal-badges">
          <span>GitHub Motor: <a href="https://github.com/valdivieso01/shogi" target="_blank" rel="noopener noreferrer">valdivieso01/shogi</a></span>
          <span>GitHub Web: <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a></span>
          <span>Ubicación: Mendoza, Argentina</span>
        </div>
      </section>

      <section class="legal-section">
        <h2>Contacto y Sugerencias</h2>
        <p>
          ¿Encontraste algún caso borde en el motor de reglas, tienes sugerencias para nuevas lecciones en la Academia o deseas realizar una consulta sobre privacidad o publicidad?
        </p>
        <p>
          Puedes comunicarte directamente por correo electrónico a:
          <a href="mailto:hjavier.valdivieso@outlook.es" class="legal-mail-link">hjavier.valdivieso@outlook.es</a>
        </p>
      </section>
    """
    return render_legal_page(
        "Sobre Nosotros y Contacto",
        "Conoce qué es Dojo Shōgi Online (dojoshogi.online), la historia del proyecto de ajedrez japonés en español y cómo contactar con su creador Javier Valdivieso.",
        body,
        canonical_path="/sobre-nosotros",
        lang="es",
        other_lang_url="/about",
    )


@app.route("/politica-de-privacidad")
@app.route("/privacy")
def page_privacidad():
    is_en = request.path == "/privacy" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>Privacy Policy</h1>
      <p class="legal-updated">Last updated: November 2026</p>

      <section class="legal-section">
        <h2>1. General Information</h2>
        <p>
          At <strong>Dojo Shōgi Online (将棋)</strong> (available at <a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>), visitor and player privacy is paramount. This document details the types of information processed when using our gaming and academy platform, as well as our cookie and advertising compliance with <strong>Google AdSense</strong> standards.
        </p>
      </section>

      <section class="legal-section">
        <h2>2. Game Data &amp; Local Storage</h2>
        <p>
          To enable instant, friction-free multiplayer gaming without requiring accounts with personal identifiers, Shōgi Dojo Online stores only in your browser (<code>localStorage</code> and <code>sessionStorage</code>) your chosen player nickname and a temporary cryptographic session token to reconnect you to active rooms upon page refresh.
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Cookies &amp; Google AdSense Advertising</h2>
        <p>
          This website uses third-party advertising services, primarily <strong>Google AdSense</strong> (publisher ID <code>ca-pub-4665232577336299</code>). Google uses cookies to serve ads based on prior user visits to this or other websites:
        </p>
        <ul>
          <li>Google's use of advertising cookies enables it and its partners to serve ads based on your visit to our site and/or other sites on the Internet.</li>
          <li>Users may opt out of personalized advertising by visiting <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.</li>
          <li>For detailed info on how Google processes data across partner sites, visit: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">How Google uses information from sites or apps that use our services</a>.</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>4. Server Logs &amp; Technical Analytics</h2>
        <p>
          Standard technical logs (anonymized IP, browser type, timestamp, HTTP status code) are retained exclusively for diagnostic, anti-abuse (rate limiting / denial of service prevention), and server stability purposes.
        </p>
      </section>

      <section class="legal-section">
        <h2>5. External Links</h2>
        <p>
          Our platform links to open-source GitHub repositories. We are not responsible for the privacy practices or contents of external websites.
        </p>
      </section>

      <section class="legal-section">
        <h2>6. Contact</h2>
        <p>
          For any questions concerning this Privacy Policy, email us at <a href="mailto:hjavier.valdivieso@outlook.es">hjavier.valdivieso@outlook.es</a> or visit our <a href="/about">About Us &amp; Contact</a> page.
        </p>
      </section>
        """
        return render_legal_page(
            "Privacy Policy",
            "Privacy policy, cookie usage, and Google AdSense compliance for Dojo Shōgi Online (dojoshogi.online).",
            body,
            canonical_path="/privacy",
            lang="en",
            other_lang_url="/politica-de-privacidad",
        )

    body = """
      <h1>Política de Privacidad</h1>
      <p class="legal-updated">Última actualización: Noviembre de 2026</p>

      <section class="legal-section">
        <h2>1. Información general</h2>
        <p>
          En <strong>Dojo Shōgi Online (将棋)</strong> (disponible en <a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>), la privacidad de nuestros visitantes y jugadores es de suma importancia. Este documento describe los tipos de información que se reciben y procesan al utilizar nuestra plataforma de juego y aprendizaje, así como el uso de cookies publicitarias conforme a los estándares de <strong>Google AdSense</strong>.
        </p>
      </section>

      <section class="legal-section">
        <h2>2. Datos de juego y almacenamiento local</h2>
        <p>
          Para facilitar las partidas multijugador en tiempo real sin exigir la creación de cuentas con datos personales sensibles, Shōgi Dojo Online almacena únicamente en tu navegador (<code>localStorage</code> y <code>sessionStorage</code>) el apodo o <em>nickname</em> elegido voluntariamente y un identificador temporal de sesión para reconectarte a tu sala en caso de recarga de página.
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Cookies y Publicidad de Google AdSense</h2>
        <p>
          Este sitio web utiliza servicios publicitarios de terceros, principalmente <strong>Google AdSense</strong> (identificador de editor <code>ca-pub-4665232577336299</code>). Google, como proveedor externo, utiliza cookies para publicar anuncios relevantes en nuestro sitio:
        </p>
        <ul>
          <li>Google utiliza cookies asociadas con anuncios (como la cookie de DoubleClick / DART) para mostrar anuncios basados en las visitas previas de los usuarios a este sitio web o a otros sitios en Internet.</li>
          <li>Los usuarios pueden inhabilitar el uso de cookies para publicidad personalizada visitando la <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Configuración de anuncios de Google</a>.</li>
          <li>Para obtener más detalles sobre cómo Google trata los datos en sitios asociados, consulta: <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">Cómo utiliza Google la información de sitios web o aplicaciones que utilizan nuestros servicios</a>.</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>4. Archivos de registro y analíticas</h2>
        <p>
          Como la mayoría de los servidores web estándar, el sistema registra eventos técnicos básicos (dirección IP anónima, tipo de navegador, fecha/hora y código de respuesta HTTP) exclusivamente con fines de diagnóstico técnico, prevención de abuso en las salas de juego y estabilidad del servicio.
        </p>
      </section>

      <section class="legal-section">
        <h2>5. Enlaces a sitios externos</h2>
        <p>
          Este sitio puede contener enlaces a repositorios de código abierto en GitHub o recursos educativos externos. No somos responsables de las políticas de privacidad ni de los contenidos de dichos sitios externos.
        </p>
      </section>

      <section class="legal-section">
        <h2>6. Contacto</h2>
        <p>
          Para cualquier consulta sobre esta Política de Privacidad, puedes escribirnos a <a href="mailto:hjavier.valdivieso@outlook.es">hjavier.valdivieso@outlook.es</a> o visitar la sección <a href="/sobre-nosotros">Sobre Nosotros y Contacto</a>.
        </p>
      </section>
    """
    return render_legal_page(
        "Política de Privacidad",
        "Política de privacidad, uso de cookies y configuración de Google AdSense de Dojo Shōgi Online (dojoshogi.online).",
        body,
        canonical_path="/politica-de-privacidad",
        lang="es",
        other_lang_url="/privacy",
    )


@app.route("/terminos-de-servicio")
@app.route("/terms")
def page_terminos():
    is_en = request.path == "/terms" or request.args.get("lang") == "en"
    if is_en:
        body = """
      <h1>Terms of Service &amp; Legal Notice</h1>
      <p class="legal-updated">Last updated: November 2026</p>

      <section class="legal-section">
        <h2>1. Service Nature</h2>
        <p>
          <strong>Dojo Shōgi Online</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>) is a free community platform dedicated to learning and playing Shōgi (Traditional Japanese Chess) online in real-time with other players, against Sensei Bot (AI), or in local pass-and-play mode. Accessing this platform signifies acceptance of these core terms of service.
        </p>
      </section>

      <section class="legal-section">
        <h2>2. Lobby Conduct &amp; Fair Play</h2>
        <p>
          When choosing a player nickname or public room title in the Dojo, users agree not to use:
        </p>
        <ul>
          <li>Offensive, discriminatory, defamatory, or hateful content.</li>
          <li>Commercial spam, malicious URLs, or impersonation.</li>
          <li>Automated bots or denial-of-service attacks against matchmaking streams (SSE) or game APIs.</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>3. Intellectual Property &amp; MIT License</h2>
        <p>
          The underlying Python Shōgi engine and web front-end are distributed for educational and community benefit under the open-source <strong>MIT License</strong> on GitHub (<a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a>).
        </p>
      </section>

      <section class="legal-section">
        <h2>4. Disclaimer of Warranties</h2>
        <p>
          The service is provided &ldquo;as is&rdquo;, without warranties of uninterrupted uptime. Game rooms are ephemeral and stored in memory for active sessions.
        </p>
      </section>
        """
        return render_legal_page(
            "Terms of Service",
            "Terms and conditions of use for the website and multiplayer matchmaking lobby of Dojo Shōgi Online (dojoshogi.online).",
            body,
            canonical_path="/terms",
            lang="en",
            other_lang_url="/terminos-de-servicio",
        )

    body = """
      <h1>Términos de Servicio y Aviso Legal</h1>
      <p class="legal-updated">Última actualización: Noviembre de 2026</p>

      <section class="legal-section">
        <h2>1. Naturaleza del servicio</h2>
        <p>
          <strong>Dojo Shōgi Online</strong> (<a href="https://www.dojoshogi.online">https://www.dojoshogi.online</a>) es una plataforma educativa y recreativa gratuita que permite aprender y jugar al Shōgi (ajedrez tradicional japonés) en línea con otros usuarios, contra el Bot del Dojo o en modo local. Al acceder y utilizar el sitio, aceptas estos términos básicos de convivencia y uso.
        </p>
      </section>

      <section class="legal-section">
        <h2>2. Conducta en el Lobby y Salas de Juego</h2>
        <p>
          Al elegir un nombre de jugador (<em>nickname</em>) o título para una sala pública en el Lobby del Dojo, el usuario se compromete a no utilizar:
        </p>
        <ul>
          <li>Lenguaje ofensivo, discriminatorio, difamatorio o que incite al odio.</li>
          <li>Spam publicitario, URLs maliciosas o suplantación de identidad.</li>
          <li>Scripts automatizados o ataques de denegación de servicio contra los flujos en tiempo real (SSE) o la cola de emparejamiento.</li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>3. Propiedad intelectual y Licencia MIT</h2>
        <p>
          El código fuente del motor de Shōgi y su interfaz web se distribuye con fines educativos y comunitarios bajo la <strong>Licencia MIT</strong> en GitHub (<a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">valdivieso01/shogi-web</a>).
        </p>
      </section>

      <section class="legal-section">
        <h2>4. Exención de responsabilidad</h2>
        <p>
          El servicio se proporciona &ldquo;tal cual&rdquo;, sin garantías de disponibilidad ininterrumpida. Las salas de juego en memoria son efímeras y están destinadas a partidas recreativas en tiempo real.
        </p>
      </section>
    """
    return render_legal_page(
        "Términos de Servicio",
        "Términos y condiciones de uso del sitio web y Lobby multijugador Dojo Shōgi Online (dojoshogi.online).",
        body,
        canonical_path="/terminos-de-servicio",
        lang="es",
        other_lang_url="/terms",
    )


# ==========================================
# RUTAS DE AUTENTICACIÓN GOOGLE Y RANKING
# ==========================================
@app.route("/api/auth/config", methods=["GET"])
def auth_config():
    return jsonify({
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    })


@app.route("/api/auth/google", methods=["POST"])
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

    # 1. Validar directamente con el endpoint oficial de Google Tokeninfo
    try:
        req = urllib.request.Request(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}",
            headers={"User-Agent": "DojoShogiOnline/1.0"}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            info = json.loads(resp.read().decode("utf-8"))
            google_id = info.get("sub")
            email = info.get("email")
            name = info.get("name") or info.get("given_name") or "Jugador"
            picture = info.get("picture", "")
    except Exception as e1:
        # Fallback con google-auth si está disponible
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests
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


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = get_authenticated_user(request)
    if user:
        refreshed = database.get_user_by_id(user["id"])
        if refreshed:
            user = refreshed
            user["is_admin"] = is_admin_user(user)
            # Update memory session
            token = request.headers.get("Authorization", "").replace("Bearer ", "").strip() or request.cookies.get("shogi_auth_token")
            if token:
                AUTH_SESSIONS[token] = user
        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip() or request.cookies.get("shogi_auth_token")
        return jsonify({"authenticated": True, "user": user, "token": token})
    return jsonify({"authenticated": False, "user": None})


@app.route("/api/auth/logout", methods=["POST"])
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


@app.route("/api/leaderboard", methods=["GET"])
def api_leaderboard():
    limit = min(50, max(5, int(request.args.get("limit", 15))))
    data = database.get_leaderboard(limit=limit)
    return jsonify({"leaderboard": data})


@app.route("/api/matches/recent", methods=["GET"])
def api_recent_matches():
    limit = min(30, max(5, int(request.args.get("limit", 10))))
    data = database.get_recent_matches(limit=limit)
    return jsonify({"matches": data})


@app.route("/api/admin/overview", methods=["GET"])
def api_admin_overview():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    stats = database.get_admin_overview()
    stats["active_rooms"] = len(ROOMS)
    return jsonify({"ok": True, "stats": stats})


@app.route("/api/admin/matches", methods=["GET"])
def api_admin_matches():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    limit = min(200, max(10, int(request.args.get("limit", 100))))
    offset = max(0, int(request.args.get("offset", 0)))
    filter_type = request.args.get("filter", "all")
    matches = database.get_admin_matches(limit=limit, offset=offset, filter_type=filter_type)
    return jsonify({"ok": True, "matches": matches})


@app.route("/api/admin/users", methods=["GET"])
def api_admin_users():
    user = get_authenticated_user(request)
    if not user or not is_admin_user(user):
        return jsonify({"error": "Acceso denegado. Se requieren permisos de administrador."}), 403
    limit = min(200, max(10, int(request.args.get("limit", 100))))
    offset = max(0, int(request.args.get("offset", 0)))
    users = database.get_admin_users(limit=limit, offset=offset)
    return jsonify({"ok": True, "users": users})


@app.route("/admin")
def page_admin():
    html = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel de Administración | Dojo Shōgi Online</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Shippori+Mincho:wght@600;700;800&family=Yuji+Syuku&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/styles.css?v=22">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    .admin-container { max-width: 1240px; margin: 1.25rem auto 3.5rem; padding: 0 1.25rem; }
    .admin-header-card {
      background:
        radial-gradient(circle at 92% 15%, rgba(188, 42, 30, 0.16), transparent 48%),
        linear-gradient(155deg, rgba(38, 25, 16, 0.98), rgba(18, 12, 8, 0.99));
      border: 1px solid rgba(226, 180, 90, 0.42); border-radius: 14px;
      padding: 1.35rem 1.6rem; display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 1rem; margin-bottom: 1.35rem;
      box-shadow: 0 16px 36px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,220,140,0.12);
      position: relative; overflow: hidden;
    }
    .admin-header-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, #8b1e14, #d4af37, #f1c40f, #d4af37, #8b1e14);
    }
    .admin-title-wrap { display: flex; align-items: center; gap: 0.95rem; }
    .admin-hanko-seal {
      width: 44px; height: 44px; min-width: 44px; border-radius: 6px;
      background: linear-gradient(145deg, #c6281c, #96180f);
      border: 1.5px solid rgba(255, 232, 214, 0.85);
      box-shadow: inset 0 0 0 2px #96180f, 0 4px 10px rgba(0,0,0,0.7);
      color: #fff6ec; font-family: var(--font-calligraphy); font-size: 1.45rem;
      display: flex; align-items: center; justify-content: center; transform: rotate(-3deg);
    }
    .admin-title-text h1 {
      font-family: var(--font-display); font-size: 1.45rem; color: #fae5a3;
      margin: 0 0 0.2rem; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
    }
    .admin-title-text p { color: var(--text-muted); margin: 0; font-size: 0.86rem; }
    .admin-actions { display: flex; align-items: center; gap: 0.75rem; }
    .admin-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 0.95rem; margin-bottom: 1.5rem; }
    .kpi-card {
      background: linear-gradient(165deg, rgba(36, 24, 16, 0.96), rgba(20, 13, 9, 0.99));
      border: 1px solid rgba(226, 180, 90, 0.25); border-radius: 12px;
      padding: 1.1rem 1.15rem; display: flex; flex-direction: column; gap: 0.35rem;
      box-shadow: 0 8px 22px rgba(0,0,0,0.45);
      position: relative; overflow: hidden;
    }
    .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #b8251a, #e2b45a); }
    .kpi-label { font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; }
    .kpi-value { font-family: var(--font-display); font-size: 1.95rem; font-weight: 800; color: #fae5a3; line-height: 1.1; }
    .kpi-sub { font-size: 0.75rem; color: #a89f91; }
    .admin-tabs {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem;
      background: rgba(16, 11, 7, 0.85); border: 1px solid rgba(226, 180, 90, 0.32);
      border-radius: 12px; padding: 0.38rem; margin-bottom: 1.25rem;
      box-shadow: 0 8px 22px rgba(0,0,0,0.45);
    }
    .admin-tab-btn {
      background: transparent; border: 1px solid transparent; color: var(--text-muted);
      font-family: var(--font-display); font-size: 0.98rem; font-weight: 700;
      padding: 0.65rem 1.25rem; cursor: pointer; border-radius: 9px; transition: all 0.18s ease;
    }
    .admin-tab-btn:hover { color: #fff; background: rgba(226, 180, 90, 0.08); }
    .admin-tab-btn.active {
      color: #fae5a3;
      background: linear-gradient(135deg, rgba(188, 42, 30, 0.28), rgba(226, 180, 90, 0.2));
      border-color: rgba(226, 180, 90, 0.65);
      box-shadow: 0 4px 14px rgba(0,0,0,0.45);
    }
    .admin-panel {
      background: linear-gradient(160deg, rgba(35, 23, 15, 0.97), rgba(18, 12, 8, 0.99));
      border: 1px solid rgba(226, 180, 90, 0.3); border-radius: 14px; padding: 1.35rem;
      box-shadow: 0 12px 30px rgba(0,0,0,0.5);
    }
    .table-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
    .table-search-input {
      background: #140d08; border: 1px solid rgba(226, 180, 90, 0.28); color: #fff;
      padding: 0.48rem 0.85rem; border-radius: 8px; font-size: 0.85rem; width: 280px; max-width: 100%;
    }
    .table-responsive { width: 100%; overflow-x: auto; }
    .admin-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; text-align: left; }
    .admin-table th {
      background: #150e09; color: #fae5a3; font-family: var(--font-display);
      padding: 0.75rem 0.65rem; font-weight: 700; border-bottom: 1px solid rgba(226, 180, 90, 0.25); white-space: nowrap;
    }
    .admin-table td { padding: 0.68rem 0.65rem; border-bottom: 1px solid rgba(255,255,255,0.06); color: #efe6d8; vertical-align: middle; }
    .admin-table tr:hover td { background: rgba(226, 180, 90, 0.05); }
    .player-badge-cell { display: inline-flex; align-items: center; gap: 0.45rem; }
    .user-avatar-mini { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(212,175,55,0.5); }
    .badge-win { display: inline-block; padding: 0.18rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .badge-win-sente { background: rgba(188, 42, 30, 0.28); color: #ffd4cc; border: 1px solid rgba(188, 42, 30, 0.55); }
    .badge-win-gote { background: rgba(226, 180, 90, 0.18); color: #fae5a3; border: 1px solid rgba(226, 180, 90, 0.45); }
    .btn-subfilter {
      background: transparent; border: none; color: #a89f91; font-size: 0.78rem; font-weight: 600;
      padding: 0.28rem 0.68rem; border-radius: 6px; cursor: pointer; transition: all 0.15s;
    }
    .btn-subfilter.active { background: rgba(188, 42, 30, 0.35); color: #fae5a3; border: 1px solid rgba(226, 180, 90, 0.4); }
    .auth-gate-box {
      text-align: center; padding: 3rem 1.5rem;
      background: linear-gradient(160deg, rgba(35, 23, 15, 0.98), rgba(18, 12, 8, 0.99));
      border: 1px solid rgba(226, 180, 90, 0.38);
      border-radius: 14px; max-width: 480px; margin: 4rem auto; box-shadow: 0 16px 40px rgba(0,0,0,0.65);
    }
    .auth-gate-box h2 { font-family: var(--font-display); color: #fae5a3; margin-bottom: 0.75rem; }
    .auth-gate-box p { color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-koma" aria-hidden="true">王</span>
      <div>
        <h1>Shōgi <span lang="ja">将棋</span></h1>
        <p class="subtitle">Panel de Control &amp; Auditoría del Dojo</p>
      </div>
    </div>
    <div class="room-bar">
      <a href="/" class="btn btn-primary" style="text-decoration:none;">← Volver al Dojo</a>
    </div>
  </header>

  <main class="admin-container">
    <div id="auth-gate" class="auth-gate-box" style="display:none;">
      <h2>🛡️ Acceso Restringido</h2>
      <p>Este panel es exclusivo para administradores de <strong>Dojo Shōgi Online</strong>. Para consultar las estadísticas y registros, inicia sesión con tu cuenta autorizada.</p>
      <div id="admin-google-btn-slot" style="display:flex; justify-content:center;"></div>
    </div>

    <div id="admin-content" style="display:none;">
      <div class="admin-header-card">
        <div class="admin-title-wrap">
          <div class="admin-hanko-seal" title="Hanko: Supervisión del Dojo" aria-hidden="true">監</div>
          <div class="admin-title-text">
            <h1>Panel de Administración y Métricas (奉行所)</h1>
            <p>Supervisión en tiempo real de partidas disputadas, jugadores registrados y balance de juego del Dojo.</p>
          </div>
        </div>
        <div class="admin-actions">
          <div id="admin-user-pill" style="display:inline-flex; align-items:center; gap:0.5rem; background:rgba(212,175,55,0.15); padding:0.3rem 0.75rem; border-radius:999px; font-size:0.82rem; border:1px solid rgba(212,175,55,0.3);">
            <img id="admin-avatar" src="" alt="Admin" style="width:24px; height:24px; border-radius:50%;">
            <span id="admin-name" style="font-weight:700; color:#fff;"></span>
          </div>
          <button type="button" class="btn btn-primary" id="btn-refresh-admin">🔄 Refrescar</button>
        </div>
      </div>

      <div class="admin-kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">👥 Jugadores Registrados</span>
          <span class="kpi-value" id="kpi-users">-</span>
          <span class="kpi-sub">Cuentas con Google OAuth</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">⚔️ Partidas Totales</span>
          <span class="kpi-value" id="kpi-matches">-</span>
          <span class="kpi-sub" id="kpi-matches-sub">-</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">🏯 Modo Historia</span>
          <span class="kpi-value" id="kpi-story">-</span>
          <span class="kpi-sub" id="kpi-story-sub">Duelos en Crónicas del Sengoku</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">🎮 Partidas de Invitados</span>
          <span class="kpi-value" id="kpi-guests">-</span>
          <span class="kpi-sub" id="kpi-guests-sub">Sin registro</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">☗ Sente vs ☖ Gote</span>
          <span class="kpi-value" id="kpi-sides">-</span>
          <span class="kpi-sub" id="kpi-sides-sub">Victorias de cada bando</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">🎯 Jaque Mate / Rendición</span>
          <span class="kpi-value" id="kpi-reasons">-</span>
          <span class="kpi-sub" id="kpi-reasons-sub">Motivo de finalización</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">⏱️ Promedio Movimientos</span>
          <span class="kpi-value" id="kpi-moves">-</span>
          <span class="kpi-sub">Jugadas por partida</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">🟢 Salas Activas</span>
          <span class="kpi-value" id="kpi-rooms">-</span>
          <span class="kpi-sub">En servidor en este instante</span>
        </div>
      </div>

      <div class="admin-tabs">
        <button type="button" class="admin-tab-btn active" data-tab="matches">📜 Registro de Partidas (<span id="matches-count-tab">0</span>)</button>
        <button type="button" class="admin-tab-btn" data-tab="users">👥 Usuarios Registrados (<span id="users-count-tab">0</span>)</button>
      </div>

      <!-- PANEL DE PARTIDAS -->
      <div class="admin-panel" id="panel-matches">
        <div class="table-toolbar">
          <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
            <h2 style="font-size:1.1rem; color:#f1c40f; margin:0;">Registro de Partidas</h2>
            <div class="filter-pills-wrap" style="display:inline-flex; gap:0.35rem; background:#18110c; padding:0.2rem; border-radius:8px; border:1px solid rgba(255,255,255,0.1); flex-wrap:wrap;">
              <button type="button" class="btn-subfilter active" data-match-filter="all">Todas (<span id="cnt-sub-all">0</span>)</button>
              <button type="button" class="btn-subfilter" data-match-filter="story">🏯 Modo Historia (<span id="cnt-sub-story">0</span>)</button>
              <button type="button" class="btn-subfilter" data-match-filter="registered">🏆 Registradas (<span id="cnt-sub-reg">0</span>)</button>
              <button type="button" class="btn-subfilter" data-match-filter="guest">⚪ Invitados (<span id="cnt-sub-guest">0</span>)</button>
            </div>
          </div>
          <input type="search" id="search-matches" class="table-search-input" placeholder="🔍 Filtrar por sala o jugador...">
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th># ID</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Sala</th>
                <th>☗ Sente (Negro)</th>
                <th>☖ Gote (Blanco)</th>
                <th>Ganador</th>
                <th>Finalización</th>
                <th>Movs</th>
              </tr>
            </thead>
            <tbody id="matches-tbody">
              <tr><td colspan="9" style="text-align:center; padding:2rem;">Cargando partidas...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PANEL DE USUARIOS -->
      <div class="admin-panel" id="panel-users" style="display:none;">
        <div class="table-toolbar">
          <h2 style="font-size:1.1rem; color:#f1c40f; margin:0;">Directorio de Jugadores</h2>
          <input type="search" id="search-users" class="table-search-input" placeholder="🔍 Filtrar por nombre o email...">
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th># ID</th>
                <th>Jugador</th>
                <th>Email Google</th>
                <th>Rating ELO</th>
                <th>Victorias</th>
                <th>Derrotas</th>
                <th>Winrate</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              <tr><td colspan="8" style="text-align:center; padding:2rem;">Cargando usuarios...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <script>
    let allMatches = [];
    let allUsers = [];
    let currentMatchFilter = "all";

    async function initAdmin() {
      try {
        const token = localStorage.getItem("shogi_auth_token");
        const headers = {};
        if (token) headers["Authorization"] = "Bearer " + token;
        const authRes = await fetch("/api/auth/me", { headers });
        const authData = await authRes.json();
        if (!authData.authenticated || !authData.user || !authData.user.is_admin) {
          showAuthGate();
          return;
        }
        if (authData.token) {
          localStorage.setItem("shogi_auth_token", authData.token);
        }
        showDashboard(authData.user);
        loadAdminData();
      } catch (err) {
        showAuthGate();
      }
    }

    async function showAuthGate() {
      document.getElementById("auth-gate").style.display = "block";
      document.getElementById("admin-content").style.display = "none";
      try {
        const confRes = await fetch("/api/auth/config");
        const conf = await confRes.json();
        if (conf.google_client_id && window.google && window.google.accounts) {
          google.accounts.id.initialize({
            client_id: conf.google_client_id,
            callback: handleGoogleAuth
          });
          google.accounts.id.renderButton(document.getElementById("admin-google-btn-slot"), {
            theme: "filled_blue", size: "large", text: "signin_with", shape: "pill"
          });
        }
      } catch (_) {}
    }

    async function handleGoogleAuth(resp) {
      if (!resp.credential) return;
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: resp.credential })
      });
      const data = await res.json();
      if (data.ok && data.user && data.user.is_admin) {
        if (data.token) {
          localStorage.setItem("shogi_auth_token", data.token);
        }
        window.location.reload();
      } else {
        alert("La cuenta conectada (" + (data.user ? data.user.email : "") + ") no tiene permisos de administrador.");
      }
    }

    function showDashboard(user) {
      document.getElementById("auth-gate").style.display = "none";
      document.getElementById("admin-content").style.display = "block";
      document.getElementById("admin-name").textContent = user.name || user.email;
      if (user.picture) {
        document.getElementById("admin-avatar").src = user.picture;
      } else {
        document.getElementById("admin-avatar").style.display = "none";
      }
    }

    async function loadAdminData() {
      try {
        const token = localStorage.getItem("shogi_auth_token");
        const headers = {};
        if (token) headers["Authorization"] = "Bearer " + token;
        const [ovRes, matchesRes, usersRes] = await Promise.all([
          fetch("/api/admin/overview", { headers }),
          fetch("/api/admin/matches?limit=200", { headers }),
          fetch("/api/admin/users?limit=200", { headers })
        ]);
        const ov = await ovRes.json();
        const m = await matchesRes.json();
        const u = await usersRes.json();

        if (ov.ok) renderKPIs(ov.stats);
        if (m.ok) {
          allMatches = m.matches || [];
          document.getElementById("matches-count-tab").textContent = allMatches.length;
          const regCnt = allMatches.filter(x => x.is_registered).length;
          const guestCnt = allMatches.length - regCnt;
          const storyCnt = allMatches.filter(x => x.story_chapter != null).length;
          document.getElementById("cnt-sub-all").textContent = allMatches.length;
          document.getElementById("cnt-sub-story").textContent = storyCnt;
          document.getElementById("cnt-sub-reg").textContent = regCnt;
          document.getElementById("cnt-sub-guest").textContent = guestCnt;
          applyMatchesFilter();
        }
        if (u.ok) {
          allUsers = u.users || [];
          document.getElementById("users-count-tab").textContent = allUsers.length;
          renderUsersTable(allUsers);
        }
      } catch (e) {
        console.error("Error loading admin data:", e);
      }
    }

    function renderKPIs(s) {
      document.getElementById("kpi-users").textContent = s.total_users;
      document.getElementById("kpi-matches").textContent = s.total_matches;
      document.getElementById("kpi-matches-sub").textContent = `${s.registered_matches || 0} registradas · ${s.guest_matches || 0} invitados`;

      const storyEl = document.getElementById("kpi-story");
      if (storyEl) {
        storyEl.textContent = s.story_matches || 0;
        document.getElementById("kpi-story-sub").textContent = `🏆 ${s.story_wins || 0} victorias · 💀 ${s.story_losses || 0} derrotas`;
      }

      document.getElementById("kpi-guests").textContent = s.guest_matches || 0;
      const totalGuestSide = (s.guest_sente_wins || 0) + (s.guest_gote_wins || 0);
      const guestSentePct = totalGuestSide > 0 ? Math.round((s.guest_sente_wins * 100) / totalGuestSide) : 50;
      document.getElementById("kpi-guests-sub").textContent = `☗ ${guestSentePct}% vs ☖ ${100 - guestSentePct}% · Prom. ${s.guest_avg_moves || 0} movs`;

      document.getElementById("kpi-sides").textContent = s.sente_wins + " / " + s.gote_wins;
      const totalSide = s.sente_wins + s.gote_wins;
      const sentePct = totalSide > 0 ? Math.round((s.sente_wins * 100) / totalSide) : 50;
      document.getElementById("kpi-sides-sub").textContent = `☗ Sente: ${sentePct}% · ☖ Gote: ${100 - sentePct}%`;

      document.getElementById("kpi-reasons").textContent = s.checkmate_count + " / " + s.resignation_count;
      document.getElementById("kpi-reasons-sub").textContent = "Jaque Mate / Rendición";
      document.getElementById("kpi-moves").textContent = s.avg_moves;
      document.getElementById("kpi-rooms").textContent = s.active_rooms || 0;
    }

    function renderMatchesTable(list) {
      const tbody = document.getElementById("matches-tbody");
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:#888;">No hay partidas registradas todavía.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(m => {
        let typeBadge = "";
        if (m.story_chapter != null) {
          const authTag = m.is_registered ? " · 🏆" : " · ⚪";
          typeBadge = `<span style="background:rgba(188,42,30,0.28); color:#ffd4cc; border:1px solid rgba(226,180,90,0.5); padding:0.15rem 0.45rem; border-radius:4px; font-size:0.72rem; font-weight:700;">🏯 Historia Cap. ${m.story_chapter}${authTag}</span>`;
        } else if (m.is_registered) {
          typeBadge = '<span style="background:rgba(212,175,55,0.2); color:#f1c40f; border:1px solid rgba(212,175,55,0.4); padding:0.15rem 0.45rem; border-radius:4px; font-size:0.72rem; font-weight:700;">🏆 Registrada</span>';
        } else {
          typeBadge = '<span style="background:rgba(255,255,255,0.08); color:#a89f91; border:1px solid rgba(255,255,255,0.15); padding:0.15rem 0.45rem; border-radius:4px; font-size:0.72rem;">⚪ Invitados</span>';
        }
        const winnerBadge = m.winner_color === "negro"
          ? '<span class="badge-win badge-win-sente">☗ Sente (' + escapeHtml(m.sente_name) + ')</span>'
          : (m.winner_color === "blanco"
            ? '<span class="badge-win badge-win-gote">☖ Gote (' + escapeHtml(m.gote_name) + ')</span>'
            : '<span class="badge-win">Tablas</span>');
        const reason = m.end_reason === "checkmate" ? "⚔️ Jaque Mate" : (m.end_reason === "resignation" ? "🏳️ Rendición" : escapeHtml(m.end_reason || "Normal"));
        const dateStr = m.played_at ? m.played_at.substring(0, 16).replace("T", " ") : "-";
        const senteAvatar = m.sente_picture ? `<img src="${m.sente_picture}" class="user-avatar-mini" alt="">` : '';
        const goteAvatar = m.gote_picture ? `<img src="${m.gote_picture}" class="user-avatar-mini" alt="">` : '';

        return `<tr>
          <td><strong>#${m.id}</strong></td>
          <td>${typeBadge}</td>
          <td style="white-space:nowrap; font-size:0.78rem; color:#a89f91;">${dateStr}</td>
          <td><code>${escapeHtml(m.room_code || "-")}</code></td>
          <td><span class="player-badge-cell">${senteAvatar} <strong>${escapeHtml(m.sente_name)}</strong></span></td>
          <td><span class="player-badge-cell">${goteAvatar} <strong>${escapeHtml(m.gote_name)}</strong></span></td>
          <td>${winnerBadge}</td>
          <td>${reason}</td>
          <td><strong>${m.move_count || 0}</strong></td>
        </tr>`;
      }).join("");
    }

    function renderUsersTable(list) {
      const tbody = document.getElementById("users-tbody");
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#888;">No hay usuarios registrados todavía.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(u => {
        const avatar = u.picture ? `<img src="${u.picture}" class="user-avatar-mini" alt="">` : '';
        const dateStr = u.created_at ? u.created_at.substring(0, 10) : "-";
        return `<tr>
          <td><strong>#${u.id}</strong></td>
          <td><span class="player-badge-cell">${avatar} <strong>${escapeHtml(u.name)}</strong></span></td>
          <td style="color:#a89f91;">${escapeHtml(u.email || "-")}</td>
          <td><span style="font-weight:700; color:#f1c40f;">${u.rating || 1200} pts</span></td>
          <td style="color:#2ecc71;"><strong>${u.wins || 0}</strong></td>
          <td style="color:#e74c3c;"><strong>${u.losses || 0}</strong></td>
          <td><strong>${u.win_rate != null ? u.win_rate + '%' : '-'}</strong></td>
          <td style="font-size:0.78rem; color:#8e8577;">${dateStr}</td>
        </tr>`;
      }).join("");
    }

    function escapeHtml(str) {
      if (!str) return "";
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function applyMatchesFilter() {
      const q = (document.getElementById("search-matches").value || "").toLowerCase().trim();
      let filtered = allMatches;
      if (currentMatchFilter === "story") {
        filtered = filtered.filter(m => m.story_chapter != null);
      } else if (currentMatchFilter === "registered") {
        filtered = filtered.filter(m => m.is_registered);
      } else if (currentMatchFilter === "guest") {
        filtered = filtered.filter(m => !m.is_registered);
      }
      if (q) {
        filtered = filtered.filter(m =>
          (m.room_code || "").toLowerCase().includes(q) ||
          (m.sente_name || "").toLowerCase().includes(q) ||
          (m.gote_name || "").toLowerCase().includes(q)
        );
      }
      renderMatchesTable(filtered);
    }

    // Tabs switching
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        document.getElementById("panel-matches").style.display = tab === "matches" ? "block" : "none";
        document.getElementById("panel-users").style.display = tab === "users" ? "block" : "none";
      });
    });

    // Subfilters (Todas / Registradas / Invitados)
    document.querySelectorAll(".btn-subfilter").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-subfilter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentMatchFilter = btn.dataset.matchFilter;
        applyMatchesFilter();
      });
    });

    // Real-time search
    document.getElementById("search-matches").addEventListener("input", applyMatchesFilter);

    document.getElementById("search-users").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = allUsers.filter(u =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
      renderUsersTable(filtered);
    });

    document.getElementById("btn-refresh-admin").addEventListener("click", () => {
      loadAdminData();
    });

    window.addEventListener("DOMContentLoaded", initAdmin);
  </script>
</body>
</html>"""
    return Response(html, mimetype="text/html")


@app.route("/api/lobby", methods=["GET"])
def get_lobby():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "lobby_get", max_calls=60, window_sec=60):
        return jsonify({"error": "Demasiadas peticiones desde tu IP. Espera unos segundos."}), 429
    player_id = request.args.get("player_id") or ""
    name = request.args.get("name") or ""
    if player_id:
        LOBBY.touch_player(player_id, name, ip)
    return jsonify(LOBBY.serialize())


@app.route("/api/lobby/matchmake", methods=["POST"])
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

        # Emparejar con otro jugador distinto en la cola
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

        # Eliminar de la cola cualquier otra entrada previa que tuviera la misma IP
        LOBBY.match_queue = [
            pid
            for pid in LOBBY.match_queue
            if pid in LOBBY.players and LOBBY.players[pid].get("ip") != ip
        ]
        LOBBY.match_queue.append(player_id)
        LOBBY.players[player_id]["status"] = "searching"

    broadcast_lobby()
    return jsonify({"status": "searching", "player_id": player_id, "queue_count": len(LOBBY.match_queue)})


@app.route("/api/lobby/matchmake/cancel", methods=["POST"])
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


@app.route("/api/lobby/stream", methods=["GET"])
def stream_lobby():
    ip = get_client_ip()
    raw_pid = (request.args.get("player_id") or "").strip()
    name = sanitize_text(request.args.get("name"), max_len=24)
    player_id = LOBBY.touch_player(raw_pid, name, ip)

    q: queue.Queue = queue.Queue(maxsize=32)
    # Solo 1 conexión SSE de Lobby activa por IP (cierra la anterior si abre otra pestaña)
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


@app.route("/api/rooms", methods=["POST"])
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

        # Regla 1 Sala en Espera por IP: si esta IP ya tenía una sala en espera ('waiting'), se elimina la anterior
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
                else "Sensei Bot 🤖"
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


@app.route("/api/rooms/<room_code>/join", methods=["POST"])
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

        # 1. Reconexión autenticada únicamente por token criptográfico (evita secuestro de asiento entre dispositivos en la misma red Wi-Fi / NAT)
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
            # Asignar asiento libre (si la IP aún no ocupa el otro asiento)
            for color in ("negro", "blanco"):
                if not room.players[color]["connected"]:
                    token = secrets.token_urlsafe(24)
                    default_name = "Sente (Negro)" if color == "negro" else "Gote (Blanco)"
                    room.players[color] = {
                        "token": token,
                        "name": player_name or default_name,
                        "connected": True,
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


@app.route("/api/rooms/<room_code>", methods=["GET"])
def get_room_state(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "La sala indicada no existe."}), 404
    with room.lock:
        return jsonify(room.serialize())


@app.route("/api/rooms/<room_code>/legal-moves", methods=["GET"])
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


def authorize_action(room: GameRoom, token: str | None) -> tuple[bool, str]:
    if room.winner:
        return False, "La partida ya ha finalizado."
    if room.mode == "local":
        return True, ""
    expected_token = room.players[room.turn]["token"]
    if (
        not expected_token
        or not isinstance(token, str)
        or not hmac.compare_digest(token, expected_token)
    ):
        return False, "No es tu turno o no tienes permiso para mover estas piezas."
    return True, ""


@app.route("/api/rooms/<room_code>/move", methods=["POST"])
def make_move(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "game_action", max_calls=45, window_sec=60):
        return jsonify({"error": "Demasiadas jugadas por minuto desde tu IP."}), 429

    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    from_pos = data.get("from")
    to_pos = data.get("to")
    promote_choice = data.get("promote")

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
        if room.mode == "ai" and not room.winner and room.turn == "blanco":
            room.play_ai_turn("blanco")
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@app.route("/api/rooms/<room_code>/drop", methods=["POST"])
def make_drop(room_code: str):
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "game_action", max_calls=45, window_sec=60):
        return jsonify({"error": "Demasiadas jugadas por minuto desde tu IP."}), 429

    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    piece_code = (data.get("piece") or "").strip().upper()
    to_pos = data.get("to")

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
        if room.mode == "ai" and not room.winner and room.turn == "blanco":
            room.play_ai_turn("blanco")
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@app.route("/api/rooms/<room_code>/reset", methods=["POST"])
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


@app.route("/api/rooms/<room_code>/resign", methods=["POST"])
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


@app.route("/api/rooms/<room_code>/stream", methods=["GET"])
def stream_room(room_code: str):
    ip = get_client_ip()
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    q: queue.Queue = queue.Queue(maxsize=32)
    SECURITY.register_room_sse(ip, q)
    with room.lock:
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
                    snap = database.load_active_room(room.code)
                    if snap and (
                        snap.get("move_count", 0) != last_seen_move
                        or float(snap.get("updated_at", 0)) > last_seen_updated
                    ):
                        with room.lock:
                            room.apply_snapshot(snap)
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

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), headers=headers)


@app.route("/api/bug-report", methods=["POST"])
def submit_bug_report():
    ip = get_client_ip()
    if not SECURITY.check_rate_limit(ip, "bug_report", max_calls=5, window_sec=300):
        return jsonify({"error": "Has enviado demasiados reportes recientemente. Intenta en unos minutos."}), 429

    data = request.get_json(silent=True) or {}
    category = sanitize_text(data.get("category"), max_len=40, default="general")
    description = sanitize_text(data.get("description"), max_len=800, default="")
    contact = sanitize_text(data.get("contact"), max_len=80, default="")
    context_info = sanitize_text(data.get("context"), max_len=400, default="")
    player_name = sanitize_text(data.get("player_name"), max_len=24, default="Anónimo")

    if len(description) < 5:
        return jsonify({"error": "Por favor escribe una descripción de al menos 5 caracteres."}), 400

    report_entry = {
        "id": secrets.token_hex(4).upper(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ip": ip,
        "player_name": player_name,
        "category": category,
        "description": description,
        "contact": contact,
        "context": context_info,
    }

    # En Vercel Serverless el sistema de archivos raíz es read-only; usamos /tmp y emitimos a stdout para vercel logs
    print(f"[BUG_REPORT] {json.dumps(report_entry, ensure_ascii=False)}", flush=True)
    base_dir = "/tmp" if os.environ.get("VERCEL") else os.path.dirname(os.path.abspath(__file__))
    reports_path = os.path.join(base_dir, "bug_reports.jsonl")
    try:
        with open(reports_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(report_entry, ensure_ascii=False) + "\n")
    except OSError:
        pass

    return jsonify({"ok": True, "report_id": report_entry["id"]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
