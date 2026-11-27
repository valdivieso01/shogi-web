"""GameRoom engine, 5-level historical AI, board serialization, and room persistence."""

import copy
import hmac
import json
import queue
import random
import secrets
import threading
import time
from typing import Callable, Optional

import database
from core.constants import (
    HAND_ORDER,
    ONLINE_FORFEIT_TIMEOUT_SECONDS,
    PIECE_META,
    PIECE_VALUES,
    ROOM_IDLE_TTL_SECONDS,
    SAFE_CODE_RE,
    STORY_CHAPTERS,
    WAITING_ROOM_TTL_SECONDS,
)
from jugador import Jugador
from piezas import Alfil, Caballo, GeneralOro, GeneralPlata, Lancero, Peon, Rey, Torre
from tablero import Tablero

_lobby_broadcaster: Optional[Callable[[], None]] = None


def set_lobby_broadcaster(fn: Callable[[], None]):
    global _lobby_broadcaster
    _lobby_broadcaster = fn


def notify_lobby():
    if _lobby_broadcaster:
        _lobby_broadcaster()


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
            "negro": {"token": None, "name": "Esperando jugador...", "connected": False, "ip": None, "disconnected_at": None},
            "blanco": {"token": None, "name": "Esperando jugador...", "connected": False, "ip": None, "disconnected_at": None},
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
        end_reason = (
            "checkmate"
            if "Jaque Mate" in (self.reason or "")
            else (
                "resignation"
                if "rendido" in (self.reason or "")
                else ("forfeit" if "abandono" in (self.reason or "").lower() else "normal")
            )
        )
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

        noise_map = {1: 4.2, 2: 1.4, 3: 0.45, 4: 0.18, 5: 0.05}
        noise_amp = noise_map.get(level, 0.4)

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

        threatened_own_squares = set()
        if level >= 4:
            for r in range(9):
                for c in range(9):
                    p = self.tablero.tab[r][c]
                    if p is not None and p.color == ai_color and p.nombre != "K":
                        if self.is_square_attacked_by(self.tablero, r, c, enemy_color):
                            threatened_own_squares.add((r, c))

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

                        will_promote = m["can_promote"]
                        if level == 1 and will_promote and not m["must_promote"] and random.random() < 0.35:
                            will_promote = False
                        if will_promote:
                            promo_bonus = 3.8 if (level >= 4 and p.nombre in ("R", "B")) else 2.5
                            score += promo_bonus

                        if level == 2 and p.nombre in ("N", "B"):
                            score += 1.2

                        if is_currently_threatened:
                            score += p_val * 1.8

                        if ai_color == "blanco" and r1 > r0:
                            score += 0.35
                        elif ai_color == "negro" and r1 < r0:
                            score += 0.35
                        score += (4 - abs(4 - c1)) * 0.12

                        if level >= 3:
                            dist_before = abs(r0 - enemy_king_pos[0]) + abs(c0 - enemy_king_pos[1])
                            dist_after = abs(r1 - enemy_king_pos[0]) + abs(c1 - enemy_king_pos[1])
                            if dist_after < dist_before and p.nombre != "K":
                                score += 0.45 * (level - 2)
                            if level == 5 and p.nombre in ("G", "S") and r0 <= 2:
                                own_dist = abs(r1 - own_king_pos[0]) + abs(c1 - own_king_pos[1])
                                if own_dist <= 2:
                                    score += 0.6

                        candidates.append(("move", score, (r0, c0), (r1, c1), will_promote))

        hand_codes = {p.nombre for p in self.tablero.piezas_muertas if p.color == ai_color}
        for code in hand_codes:
            drops = self.get_legal_drops_for_piece(self.tablero, ai_color, code)
            for d in drops:
                r1, c1 = d["row"], d["col"]
                in_enemy_half = (r1 >= 4) if ai_color == "blanco" else (r1 <= 4)
                dist_enemy_king = abs(r1 - enemy_king_pos[0]) + abs(c1 - enemy_king_pos[1])

                if in_enemy_half or self.in_check == ai_color or (level >= 2 and dist_enemy_king <= 3):
                    drop_mult = 0.85 if level == 2 else (0.55 if level >= 4 else 0.45)
                    score = (
                        PIECE_VALUES.get(code, 1) * drop_mult
                        + (4 - abs(4 - c1)) * 0.15
                        + random.uniform(0.0, noise_amp)
                    )
                    if level == 2 and in_enemy_half:
                        score += 1.8
                    if level >= 3 and dist_enemy_king <= 2:
                        score += 1.6 * (level - 2)
                    candidates.append(("drop", score, code, (r1, c1), False))

        if not candidates:
            return False

        candidates.sort(key=lambda x: x[1], reverse=True)

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
                gives_check = self.is_king_in_check(sim_board, enemy_color)
                if gives_check:
                    tactical_delta += 3.5 if level == 3 else 5.2
                    if level >= 4 and not self.has_any_legal_action(sim_board, enemy_color):
                        tactical_delta += 1000.0

                dest_attacked = self.is_square_attacked_by(sim_board, r1, c1, enemy_color)
                if dest_attacked:
                    is_defended = False
                    if level >= 4 and sim_board.tab[r1][c1] is not None:
                        sim_board.tab[r1][c1].color = enemy_color
                        is_defended = self.is_square_attacked_by(sim_board, r1, c1, ai_color)
                        sim_board.tab[r1][c1].color = ai_color

                    safety_weight = 2.0 if level == 3 else (2.5 if level == 4 else 2.9)
                    if is_defended:
                        tactical_delta -= moved_val * (safety_weight * 0.45)
                    else:
                        tactical_delta -= moved_val * safety_weight

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
            or (
                bool(self.players["negro"].get("token"))
                and bool(self.players["blanco"].get("token"))
            )
        )
        return "finished" if self.winner else ("playing" if both_ready else "waiting")

    def check_disconnect_forfeit(self) -> bool:
        """Evaluates if a disconnected online player has exceeded the 5-minute grace window."""
        if self.winner or self.mode != "online":
            return False
        if not (self.players["negro"].get("token") and self.players["blanco"].get("token")):
            return False
        now = time.time()
        for color in ("negro", "blanco"):
            disc_at = self.players[color].get("disconnected_at")
            if disc_at and (now - float(disc_at)) >= ONLINE_FORFEIT_TIMEOUT_SECONDS:
                winner_color = self.other_color(color)
                self.winner = winner_color
                self.tablero.juego = "terminado"
                loser_label = "Sente (Negro ☗)" if color == "negro" else "Gote (Blanco ☖)"
                winner_label = "Sente (Negro ☗)" if winner_color == "negro" else "Gote (Blanco ☖)"
                self.reason = (
                    f"{loser_label} no reconectó tras 5 minutos. "
                    f"Victoria por abandono para {winner_label}."
                )
                self.players[color]["disconnected_at"] = None
                self.finalize_match_record()
                self.updated_at = now
                self.broadcast()
                return True
        return False

    def _serialize_seat(self, color: str) -> dict:
        p = self.players.get(color, {})
        u = p.get("user") if isinstance(p.get("user"), dict) else None
        picture = u.get("picture", "") if u else ""
        rating = u.get("rating") if u else None
        is_bot = p.get("token") == "AI_BOT"
        story_chap = getattr(self, "story_chapter", None)
        if color == "blanco" and story_chap and story_chap in STORY_CHAPTERS:
            ch = STORY_CHAPTERS[story_chap]
            picture = ch.get("portrait", "")
            rating = ch.get("elo")
        elif color == "blanco" and is_bot:
            picture = "/static/icon-192.png"
            rating = 1350
        disc_at = p.get("disconnected_at")
        remaining_sec = None
        if disc_at and not self.winner:
            remaining_sec = max(0, int(ONLINE_FORFEIT_TIMEOUT_SECONDS - (time.time() - float(disc_at))))
        return {
            "name": p.get("name", ""),
            "connected": bool(p.get("connected")),
            "disconnected_at": float(disc_at) if disc_at else None,
            "reconnect_seconds_left": remaining_sec,
            "picture": picture or "",
            "rating": rating,
            "is_registered": bool(u),
            "is_bot": is_bot,
            "story_chapter": story_chap if (color == "blanco" and story_chap) else None,
        }

    def serialize_summary(self) -> dict:
        open_seat = None
        if not self.players["negro"].get("token"):
            open_seat = "negro"
        elif not self.players["blanco"].get("token"):
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
                "negro": self._serialize_seat("negro"),
                "blanco": self._serialize_seat("blanco"),
            },
        }

    def serialize_legal_actions(self) -> tuple[dict, dict]:
        if self.winner:
            return {}, {}
        color = self.turn
        if self.mode == "ai" and color == "blanco":
            return {}, {}
        moves_map = {}
        for r in range(9):
            for c in range(9):
                p = self.tablero.tab[r][c]
                if p is not None and p.color == color:
                    m = self.get_legal_moves_for_piece(self.tablero, color, r, c)
                    if m:
                        moves_map[f"{r},{c}"] = m
        drops_map = {}
        hand_codes = {p.nombre for p in self.tablero.piezas_muertas if p.color == color}
        for code in hand_codes:
            d = self.get_legal_drops_for_piece(self.tablero, color, code)
            if d:
                drops_map[code] = d
        return moves_map, drops_map

    def serialize(self) -> dict:
        legal_moves, legal_drops = self.serialize_legal_actions()
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
            "legal_moves": legal_moves,
            "legal_drops": legal_drops,
            "players": {
                "negro": self._serialize_seat("negro"),
                "blanco": self._serialize_seat("blanco"),
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
        safe_players = {}
        for c_key, p_val in self.players.items():
            p_copy = dict(p_val)
            if isinstance(p_copy.get("user"), dict):
                u_raw = p_copy["user"]
                p_copy["user"] = {
                    "id": u_raw.get("id"),
                    "google_id": u_raw.get("google_id"),
                    "email": u_raw.get("email"),
                    "name": u_raw.get("name"),
                    "picture": u_raw.get("picture"),
                    "rating": u_raw.get("rating", 1200),
                    "is_admin": bool(u_raw.get("is_admin")),
                }
            safe_players[c_key] = p_copy

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
            "players": safe_players,
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
        notify_lobby()


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
            room.check_disconnect_forfeit()
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
        if room:
            room.check_disconnect_forfeit()
        return room


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


def restore_room_from_client_state(
    clean: str,
    client_state: dict,
    player_token: str | None,
    auth_user: dict | None,
    ip: str,
) -> GameRoom | None:
    if not isinstance(client_state, dict) or not isinstance(client_state.get("board"), list):
        return None
    mode = client_state.get("mode", "ai")
    story_chap = client_state.get("story_chapter")
    room = GameRoom(
        code=clean,
        mode=mode,
        visibility=client_state.get("visibility", "private"),
        title=client_state.get("title", f"Sala #{clean}"),
        owner_ip=ip,
        ai_level=client_state.get("ai_level", 3),
        story_chapter=story_chap,
    )
    board_grid = client_state.get("board", [])
    if len(board_grid) == 9:
        for r in range(9):
            for c in range(9):
                cell = board_grid[r][c]
                if cell is None:
                    room.tablero.tab[r][c] = None
                else:
                    room.tablero.tab[r][c] = build_piece_instance(
                        cell["code"],
                        cell["color"],
                        bool(cell.get("promoted", False)),
                    )
    dead_list = []
    captured = client_state.get("captured") or {}
    for owner_color in ("negro", "blanco"):
        for item in captured.get(owner_color, []):
            code_p = item.get("code")
            cnt = int(item.get("count", 0))
            if code_p in PIECE_META and cnt > 0:
                for _ in range(cnt):
                    dead_list.append(build_piece_instance(code_p, owner_color, False))
    room.tablero.piezas_muertas = dead_list
    room.turn = client_state.get("turn", "negro")
    room.in_check = client_state.get("in_check")
    room.winner = client_state.get("winner")
    room.reason = client_state.get("reason")
    room.move_count = int(client_state.get("move_count", 0))
    room.last_move = client_state.get("last_move")
    room.history = client_state.get("history", [])
    room.tablero.juego = "terminado" if room.winner else "iniciado"

    p_info = client_state.get("players") or {}
    sente_name = (p_info.get("negro") or {}).get("name", "Sente")
    gote_name = (p_info.get("blanco") or {}).get("name", "Gote")
    tok = player_token or secrets.token_urlsafe(24)
    room.players["negro"] = {
        "token": tok,
        "name": sente_name,
        "connected": True,
        "ip": ip,
        "user": auth_user,
    }
    room.players["blanco"] = {
        "token": "AI_BOT" if mode == "ai" else tok,
        "name": gote_name,
        "connected": True,
        "ip": "AI" if mode == "ai" else ip,
        "user": None,
    }
    ROOMS[clean] = room
    room.persist()
    return room
