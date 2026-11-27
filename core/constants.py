"""Global constants, piece metadata, and Story Mode historical chapters."""

import os
import re

SITE_URL = "https://www.dojoshogi.online"

MAX_ROOMS = 200
ROOM_IDLE_TTL_SECONDS = 1800  # 30 min
WAITING_ROOM_TTL_SECONDS = 600  # 10 min
PLAYER_IDLE_TTL_SECONDS = 120  # 2 min

SAFE_CODE_RE = re.compile(r"^[A-Z0-9]{6,10}$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{4,36}$")
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f<>\"'`&]")

ADMIN_EMAILS = set(
    filter(
        None,
        [
            e.strip().lower()
            for e in (
                os.environ.get(
                    "ADMIN_EMAILS",
                    "hjavier.valdivieso@gmail.com,hjavier.valdivieso@outlook.es",
                ).split(",")
            )
        ],
    )
)

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
