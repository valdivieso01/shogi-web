# Changelog 📜

Todos los cambios notables en **Shōgi Web** se registrarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto se adhiere al versionado semántico.

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
