# Changelog 📜

Todos los cambios notables en **Dojo Shōgi Online** se registran en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto se adhiere al versionado semántico.

---

## [3.0.0] - 2026-11-27

### ✨ Añadido
- **Modo Historia: *Crónicas del Sengoku* (5 Capítulos):** Campaña progresiva contra *Ashigaru Tōkichi*, *Hattori Hanzō*, *Takeda Shingen*, *Oda Nobunaga* y *Ōhashi Sōkei* con motor táctico de 5 niveles, retratos *Ukiyo-e*, diálogos reactivos y registro en base de datos.
- **Rediseño Visual *Indigo Kifu & Tatami Studio*:** Paleta japonesa *Kachi-iro* (`#0A101D`), barra lateral de comando fija, galería de 12 fichas *Koma* 3D para la Academia y bandejas *Komadai* con avatares de perfil e insignias de jugador.
- **Gestión de Salida, Pausa y Reconexión Online (5 Minutos):** Modal de confirmación al volver al Lobby, tarjeta **«▶ Reanudar Partida Ahora»** en el Lobby y temporizador de 5 minutos en partidas online antes de adjudicar victoria por abandono.
- **Google Sign-In, Ranking ELO y Panel de Administración (`/admin`):** Persistencia híbrida PostgreSQL/SQLite, Salón de la Fama, historial de partidas y panel `/admin` con KPIs y filtro por modalidad.
- **Respuesta Instantánea en el Tablero:** Pre-cálculo de `legal_moves` y `legal_drops` en `room.serialize()` y endpoint `/api/rooms/<code>/ai-move` con indicador visual animado.

### 🏗️ Refactorizado
- **Arquitectura Modular con Flask Blueprints:** Separación del monolito `app.py` (de 3.377 a 76 líneas) en `core/` (`constants.py`, `security.py`, `game_room.py`, `lobby_manager.py`), `routes/` (`seo_pages.py`, `auth_api.py`, `admin_routes.py`, `lobby_api.py`, `rooms_api.py`), `templates/` (`admin.html`, `legal_layout.html`) y catálogos frontend (`static/story_data.js`, `static/tutorial_data.js`).

---

## [2.0.0] - 2026-11-23

### ✨ Añadido (Versión Web Multijugador en Tiempo Real)
- **Servidor Web en Flask (`app.py`):** API REST + flujo de eventos en tiempo real mediante **Server-Sent Events (SSE)** para partidas online de 2 jugadores mediante salas con código de 6 caracteres y enlace de invitación (`?room=CODIGO`), además de modo local en el mismo dispositivo.
- **Interfaz Tradicional Japonesa (`static/`):** Tablero *Shōgiban* 9×9 con puntos *hoshi*, fichas pentagonales de madera (*Koma*) con Kanji tradicional, cambio a rojo carmesí al promocionar y etiqueta de guía en español.
- **Reservas (*Komadai*) y Promoción Interactiva (*Nari*):** Reincorporación visual de piezas capturadas, resaltado de movimientos legales que no dejan al propio Rey en jaque, modal de promoción e historial de jugadas con notación de Shōgi.

### 🐛 Corregido en el Motor Base (`piezas.py`, `tablero.py`)
- Corrección del movimiento del General de Plata (*Ginshō*) blanco y su diagonal derecha en ambos bandos.
- Corrección del movimiento ortogonal de la Torre Coronada (*Dragón* / *Ryūō*).
- Retorno explícito al mover Caballos (*Keima*) y Lanceros (*Kyōsha*) promovidos.
- Control de límites de tablero (`0..8`) en piezas deslizantes durante la detección de jaque.
- Validación precisa de *Uchifuzume* y clases `GeneralOro` / `Rey` en `tablero.py`.
