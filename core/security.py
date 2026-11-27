"""Security, IP rate-limiting, text sanitization, and Google OAuth session resolution."""

import queue
import re
import threading
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional
from flask import request

import database
from core.constants import ADMIN_EMAILS, CONTROL_CHARS_RE

AUTH_SESSIONS: Dict[str, Dict[str, Any]] = {}  # token -> user_dict


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
        user = database.get_user_by_session(token)
        if user:
            user["is_admin"] = is_admin_user(user)
            AUTH_SESSIONS[token] = user
            return user
    return None


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
