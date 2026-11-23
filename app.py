import copy
import json
import queue
import random
import string
import threading
import time
import uuid
from flask import Flask, Response, jsonify, request, send_from_directory

from jugador import Jugador
from piezas import Alfil, Caballo, GeneralOro, GeneralPlata, Lancero, Peon, Rey, Torre
from tablero import Tablero

app = Flask(__name__, static_folder="static", static_url_path="/static")

PIECE_META = {
    "K": {
        "kanji_negro": "王將",
        "kanji_blanco": "玉將",
        "kanji_promoted": "王將",
        "romaji": "Gyokushō",
        "es": "Rey",
        "can_promote": False,
    },
    "R": {
        "kanji_negro": "飛車",
        "kanji_blanco": "飛車",
        "kanji_promoted": "龍王",
        "romaji": "Hisha",
        "romaji_promoted": "Ryūō",
        "es": "Torre",
        "es_promoted": "Dragón",
        "can_promote": True,
    },
    "B": {
        "kanji_negro": "角行",
        "kanji_blanco": "角行",
        "kanji_promoted": "龍馬",
        "romaji": "Kakugyō",
        "romaji_promoted": "Ryūma",
        "es": "Alfil",
        "es_promoted": "Caballo Dragón",
        "can_promote": True,
    },
    "G": {
        "kanji_negro": "金將",
        "kanji_blanco": "金將",
        "kanji_promoted": "金將",
        "romaji": "Kinshō",
        "es": "Oro",
        "can_promote": False,
    },
    "S": {
        "kanji_negro": "銀將",
        "kanji_blanco": "銀將",
        "kanji_promoted": "成銀",
        "romaji": "Ginshō",
        "romaji_promoted": "Narigin",
        "es": "Plata",
        "es_promoted": "Plata+ (Oro)",
        "can_promote": True,
    },
    "N": {
        "kanji_negro": "桂馬",
        "kanji_blanco": "桂馬",
        "kanji_promoted": "成桂",
        "romaji": "Keima",
        "romaji_promoted": "Narikei",
        "es": "Caballo",
        "es_promoted": "Caballo+ (Oro)",
        "can_promote": True,
    },
    "L": {
        "kanji_negro": "香車",
        "kanji_blanco": "香車",
        "kanji_promoted": "成香",
        "romaji": "Kyōsha",
        "romaji_promoted": "Narikyō",
        "es": "Lancero",
        "es_promoted": "Lancero+ (Oro)",
        "can_promote": True,
    },
    "P": {
        "kanji_negro": "歩兵",
        "kanji_blanco": "歩兵",
        "kanji_promoted": "と金",
        "romaji": "Fuhyō",
        "romaji_promoted": "Tokin",
        "es": "Peón",
        "es_promoted": "Tokin (Oro)",
        "can_promote": True,
    },
}

HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"]


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
    # Notación tradicional 9..1 para columnas y a..i (más índice 0..8 entre paréntesis)
    shogi_col = 9 - col
    shogi_row = chr(ord("a") + row)
    return f"{shogi_col}{shogi_row} ({row},{col})"


class GameRoom:
    def __init__(self, code: str, mode: str = "online"):
        self.code = code
        self.mode = mode  # "online" | "local"
        self.lock = threading.RLock()
        self.subscribers: list[queue.Queue] = []
        self.created_at = time.time()
        self.players = {
            "negro": {"token": None, "name": "Esperando jugador...", "connected": False},
            "blanco": {"token": None, "name": "Esperando jugador...", "connected": False},
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
                    # Comprobar que el propio rey no quede en jaque tras el movimiento
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
        else:
            self.turn = defender_color

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

    def serialize(self) -> dict:
        both_ready = (
            self.mode == "local"
            or (self.players["negro"]["connected"] and self.players["blanco"]["connected"])
        )
        status = "finished" if self.winner else ("playing" if both_ready else "waiting")
        return {
            "room_code": self.code,
            "mode": self.mode,
            "status": status,
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

    def broadcast(self):
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


ROOMS: dict[str, GameRoom] = {}
ROOMS_LOCK = threading.Lock()


def generate_room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(random.choices(alphabet, k=6))
        if code not in ROOMS:
            return code


def get_room_or_404(code: str) -> GameRoom | None:
    with ROOMS_LOCK:
        return ROOMS.get(code.upper())


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/rooms", methods=["POST"])
def create_room():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "online")
    if mode not in ("online", "local"):
        mode = "online"
    preferred_color = data.get("color", "negro")
    if preferred_color not in ("negro", "blanco"):
        preferred_color = "negro"
    player_name = (data.get("name") or "").strip()[:24] or (
        "Sente (Negro)" if preferred_color == "negro" else "Gote (Blanco)"
    )

    with ROOMS_LOCK:
        code = generate_room_code()
        room = GameRoom(code=code, mode=mode)
        token = uuid.uuid4().hex
        if mode == "local":
            room.players["negro"] = {"token": token, "name": "Jugador Negro (Sente)", "connected": True}
            room.players["blanco"] = {"token": token, "name": "Jugador Blanco (Gote)", "connected": True}
            assigned_color = "ambos"
        else:
            room.players[preferred_color] = {"token": token, "name": player_name, "connected": True}
            assigned_color = preferred_color
        ROOMS[code] = room

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
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "La sala indicada no existe."}), 404

    data = request.get_json(silent=True) or {}
    existing_token = data.get("player_token")
    player_name = (data.get("name") or "").strip()[:24]

    with room.lock:
        if room.mode == "local":
            return jsonify(
                {
                    "room_code": room.code,
                    "player_token": room.players["negro"]["token"],
                    "assigned_color": "ambos",
                    "state": room.serialize(),
                }
            )

        # Reconexión con token existente
        for color in ("negro", "blanco"):
            if existing_token and room.players[color]["token"] == existing_token:
                if player_name:
                    room.players[color]["name"] = player_name
                room.players[color]["connected"] = True
                room.broadcast()
                return jsonify(
                    {
                        "room_code": room.code,
                        "player_token": existing_token,
                        "assigned_color": color,
                        "state": room.serialize(),
                    }
                )

        # Asignar asiento libre
        for color in ("negro", "blanco"):
            if not room.players[color]["connected"]:
                token = uuid.uuid4().hex
                default_name = "Sente (Negro)" if color == "negro" else "Gote (Blanco)"
                room.players[color] = {
                    "token": token,
                    "name": player_name or default_name,
                    "connected": True,
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

        # Ambos asientos ocupados -> Espectador
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
    if not expected_token or token != expected_token:
        return False, "No es tu turno o no tienes permiso para mover estas piezas."
    return True, ""


@app.route("/api/rooms/<room_code>/move", methods=["POST"])
def make_move(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    from_pos = data.get("from")
    to_pos = data.get("to")
    promote_choice = data.get("promote")  # True, False o None (auto)

    if not (isinstance(from_pos, list) and isinstance(to_pos, list) and len(from_pos) == 2 and len(to_pos) == 2):
        return jsonify({"error": "Coordenadas inválidas."}), 400

    r0, c0 = int(from_pos[0]), int(from_pos[1])
    r1, c1 = int(to_pos[0]), int(to_pos[1])

    with room.lock:
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

        # Ejecutamos la jugada en el motor original
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
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@app.route("/api/rooms/<room_code>/drop", methods=["POST"])
def make_drop(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    data = request.get_json(silent=True) or {}
    token = data.get("player_token")
    piece_code = (data.get("piece") or "").strip().upper()
    to_pos = data.get("to")

    if not (isinstance(to_pos, list) and len(to_pos) == 2 and piece_code in PIECE_META):
        return jsonify({"error": "Datos de reincorporación inválidos."}), 400

    r1, c1 = int(to_pos[0]), int(to_pos[1])

    with room.lock:
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
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@app.route("/api/rooms/<room_code>/reset", methods=["POST"])
def reset_room(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    with room.lock:
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
        room.broadcast()
        return jsonify({"ok": True, "state": room.serialize()})


@app.route("/api/rooms/<room_code>/stream", methods=["GET"])
def stream_room(room_code: str):
    room = get_room_or_404(room_code)
    if not room:
        return jsonify({"error": "Sala no encontrada."}), 404

    q: queue.Queue = queue.Queue(maxsize=32)
    with room.lock:
        room.subscribers.append(q)
        initial_payload = json.dumps(room.serialize())

    def event_stream():
        try:
            yield f"data: {initial_payload}\n\n"
            while True:
                try:
                    msg = q.get(timeout=20)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            with room.lock:
                if q in room.subscribers:
                    room.subscribers.remove(q)

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), headers=headers)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
