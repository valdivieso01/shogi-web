# Dojo Shōgi Online (将棋) · [www.dojoshogi.online](https://www.dojoshogi.online) ⚔️🏯

Plataforma web multijugador en tiempo real del **Shōgi (Ajedrez Tradicional Japonés)** con **Emparejamiento Rápido Online**, **Modo Historia de 5 capítulos (*Crónicas del Sengoku*)**, **Academia Interactiva de 12 lecciones**, **Ranking ELO con Google Sign-In**, **Música Zen procedimental** y **Panel de Administración**, desplegada en **[https://www.dojoshogi.online](https://www.dojoshogi.online)** y construida con una arquitectura modular en **Flask (Python)** + **PostgreSQL / SQLite**.

---

## ✨ Características Principales

### ⚔️ Modos de Juego
- 🌐 **Multijugador Online en Tiempo Real (Matchmaking & Salas):**
  - **Emparejamiento Rápido (*Taikyoku*):** Cola en vivo con asignación automática de bandos (*Sente* ☗ / *Gote* ☖).
  - **Salas Públicas, Privadas (código de 6 letras) y Modo Espectador** mediante *Server-Sent Events (SSE)*.
  - **Protección de Desconexión (5 Minutos) y Reanudación:** Si un jugador sale al Lobby o pierde conexión, su asiento se reserva durante **5 minutos** con cuenta regresiva en vivo (`MM:SS`) y tarjeta **«▶ Reanudar Partida Ahora»** en el Lobby; si no regresa a tiempo, se adjudica la victoria por abandono al rival.
- 🏯 **Modo Historia: *Crónicas del Sengoku* (5 Capítulos Históricos):**
  - Campaña progresiva contra 5 figuras históricas del Japón feudal con retratos estilo *Ukiyo-e*, sello imperial *Hanko* y diálogos reactivos bilingües (ES/EN):
    1. **Cap. 1 (1554 · Owari):** *Ashigaru Tōkichi* (`足軽 藤吉` · ~800 ELO)
    2. **Cap. 2 (1572 · Mikawa):** *Hattori Hanzō* (`服部 半蔵` · ~1100 ELO)
    3. **Cap. 3 (1561 · Kawanakajima):** *Takeda Shingen* (`武田 信玄` · ~1350 ELO)
    4. **Cap. 4 (1575 · Castillo de Azuchi):** *Oda Nobunaga* (`織田 信長` · ~1600 ELO)
    5. **Cap. 5 (1612 · Castillo de Edo):** *Ōhashi Sōkei* (`大橋 宗桂` · Primer Meijin · ~1850 ELO)
- 🤖 **Práctica vs IA (*Sensei Bot*) y Modo Local (2 jugadores en el mismo dispositivo).**

### 🎓 Academia Interactiva de 12 Lecciones
- Curso paso a paso accesible desde las **12 fichas pentagonales *Koma* 3D** del Lobby:
  1. El Rey (`王 · K`) y escape de jaque
  2. El General de Oro (`金 · G`)
  3. El General de Plata (`銀 · S`) y promoción
  4. El Peón (`歩 · P`) y el *Tokin* (`と · +P`)
  5. El Lancero (`香 · L`)
  6. El Caballo Japonés (`桂 · N`) y ataque doble
  7. El Alfil (`角 · B`) y el Caballo Dragón (`馬 · +B`)
  8. La Torre (`飛 · R`) y el Rey Dragón (`龍 · +R`)
  9. Reincorporación de piezas (*Drops* / `打ち`)
  10. Las 3 prohibiciones de Drop: *Nifu* (`二歩`), sin movimiento futuro y *Uchifuzume* (`打ち歩詰め`)
  11. Defensa de Jaque (*Aigoma* / `合駒`)
  12. Jaque Mate Final (*Tsumi* / `詰み`: *Atama-kin*)

### 🎨 Experiencia, Diseño y Comunidad
- 🎨 **Estética *Indigo Kifu & Tatami Studio*:** Paleta samurai *Kachi-iro* (`#0A101D`), consola de comando fija a la izquierda, tablero *Shōgiban* en madera *Kaya* con fichas pentagonales 3D y bandejas *Komadai* con avatares de jugador (foto de Google, retrato *Ukiyo-e* o *Koma* real).
- ⚡ **Respuesta Instantánea (0 ms al seleccionar piezas):** Pre-cálculo de movimientos y drops legales en el estado de la sala + turno de IA desacoplado (`/ai-move`) con indicador visual animado.
- 🏆 **Google Sign-In, Sistema ELO y Salón de la Fama:** Autenticación con Google OAuth 2.0, cálculo de rating ELO, tabla de clasificación y registro histórico de partidas (Online, IA y Modo Historia).
- 🎶 **Sintetizador Zen Procedimental (Web Audio API):** Música ambiental japonesa en escala pentatónica *Hirajōshi* (cuerdas de *Koto*) y sonido de madera (*Pachi*) al asentar cada ficha.
- 🌍 **Soporte Bilingüe Completo (Español / Inglés):** Selector instantáneo `ES / EN` en toda la interfaz, lecciones y diálogos.
- 🛡️ **Panel de Administración (`/admin`):** Dashboard con métricas KPI, filtro de partidas por modalidad (Todas, Online, Modo Historia, IA) y listado de usuarios registrados.

---

## 🏛️ Arquitectura Modular del Proyecto

El proyecto está organizado con **Flask Blueprints** (`routes/`), **servicios de dominio** (`core/`), **plantillas Jinja2** (`templates/`), **persistencia híbrida PostgreSQL/SQLite** (`database.py`) y **catálogos frontend separados** (`static/`):

```text
shogi-web/
├── app.py                     # Entrypoint Flask (76 líneas), registro de Blueprints y cabeceras HTTP/CSP
├── database.py                # Capa de datos híbrida PostgreSQL (Neon/Vercel) y SQLite local + ELO
├── tablero.py                 # Motor de Shōgi: matriz 9×9, promociones (Nari), Nifu y Uchifuzume
├── jugador.py                 # Motor de Shōgi: validación de movimientos, jaque (Ōte) y jaque mate
├── piezas.py                  # Jerarquía orientada a objetos de las 8 piezas de Shōgi
├── core/                      # Dominio, IA, seguridad y estado en tiempo real
│   ├── constants.py           # Constantes globales, metadatos de piezas, TTLs y capítulos de Historia
│   ├── security.py            # SecurityGuard (rate-limit por IP), sanitización XSS y sesiones OAuth
│   ├── game_room.py           # GameRoom, IA táctica de 5 niveles, snapshots DB y timer de abandono (5m)
│   └── lobby_manager.py       # LobbyManager, cola de matchmaking y difusión SSE del lobby
├── routes/                    # Flask Blueprints (API REST + vistas + streams SSE)
│   ├── seo_pages.py           # /, /sobre-nosotros, /politica-de-privacidad, /terminos-de-servicio, SEO, bugs
│   ├── auth_api.py            # /api/auth/* (Google OAuth), /api/leaderboard y /api/matches/recent
│   ├── admin_routes.py        # /admin y /api/admin/{overview,matches,users}
│   ├── lobby_api.py           # /api/lobby, /api/lobby/matchmake y /api/lobby/stream
│   └── rooms_api.py           # /api/rooms/* (create, join, sync, move, drop, ai-move, leave, resign, stream)
├── templates/                 # Plantillas HTML Jinja2 del servidor
│   ├── admin.html             # Panel de administración del Dojo
│   └── legal_layout.html      # Plantilla editorial/legal reutilizable
├── static/                    # Frontend SPA (HTML5 semántico, CSS Grid, Vanilla JS)
│   ├── index.html             # Aplicación principal con modales <dialog> nativos
│   ├── styles.css             # Sistema de diseño Indigo Kifu & Tatami Studio
│   ├── app.js                 # Lógica de interfaz, tablero, audio Zen, lobby y reconexión
│   ├── story_data.js          # Catálogo de los 5 jefes del Modo Historia y diálogos ES/EN
│   ├── tutorial_data.js       # Catálogo de piezas y los 12 escenarios interactivos de la Academia
│   ├── i18n.js                # Diccionario bilingüe Español / Inglés
│   └── portraits/             # Retratos ilustrados Ukiyo-e de los 5 jefes históricos
├── test.py                    # Suite de pruebas unitarias del motor de reglas de Shōgi
├── vercel.json                # Configuración de despliegue Serverless en Vercel
└── requirements.txt           # Dependencias de Python (Flask, numpy, google-auth, psycopg2-binary, pg8000)
```

---

## 🚀 Instalación y Ejecución Local

```powershell
# 1. Crear y activar entorno virtual
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Iniciar el servidor local
python app.py
```

Abre `http://localhost:5000` en tu navegador.

### Variables de Entorno Opcionales (Producción / Vercel)
- `POSTGRES_URL` o `DATABASE_URL`: Cadena de conexión a PostgreSQL (si no se define, usa automáticamente `shogi_dojo.db` en SQLite local).
- `GOOGLE_CLIENT_ID`: ID de cliente OAuth 2.0 para habilitar el inicio de sesión con Google.
- `ADMIN_EMAILS`: Lista de correos separados por coma con acceso al panel `/admin`.
