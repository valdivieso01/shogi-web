"""LobbyManager for online player presence, matchmaking queue, and live room listings."""

import json
import queue
import secrets
import threading
import time

from core.constants import PLAYER_IDLE_TTL_SECONDS, SAFE_ID_RE
from core.game_room import ROOMS, ROOMS_LOCK, set_lobby_broadcaster
from core.security import sanitize_text


class LobbyManager:
    MAX_PLAYERS_PER_IP = 2

    def __init__(self):
        self.lock = threading.RLock()
        self.subscribers: list[queue.Queue] = []
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


set_lobby_broadcaster(broadcast_lobby)
