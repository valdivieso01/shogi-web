# Shōgi Web (将棋) · Multijugador Online para 2 Jugadores ⚔️🏯

Versión web multijugador en tiempo real del **Shōgi (Ajedrez Tradicional Japonés)** para 2 jugadores, construida con **Flask (Python)** reutilizando el motor orientado a objetos (`Tablero`, `Jugador`, `Pieza`) y un frontend moderno con fichas pentagonales tradicionales (*Koma*) y sincronización mediante Server-Sent Events (SSE).

---

## ✨ Características Principales

- 🌐 **Multijugador Online en Tiempo Real (Salas con Código / Link):** Crea una sala y comparte el enlace (`?room=CODIGO`) para que el segundo jugador se conecte desde otro dispositivo o navegador.
- 👥 **Modo Local (Mismo Dispositivo):** Opción integrada para que 2 jugadores compartan pantalla sin esperar conexión remota.
- 🏯 **Tablero *Shōgiban* 9×9 y Fichas Pentagonales (*Koma*):** Cada pieza muestra su **Kanji tradicional** (`王將`, `飛車`, `角行`, `金將`, `銀將`, `桂馬`, `香車`, `歩兵`), cambia a rojo carmesí al promocionar (`龍王`, `龍馬`, `成銀`, `成桂`, `成香`, `と金`) e incluye subtítulo en español y código de pieza (`K`, `R`, `B`, `G`, `S`, `N`, `L`, `P`).
- 🔄 **Reservas (*Komadai*) y Reincorporación (*Drops*):** Haz clic en cualquier pieza capturada de tu reserva para resaltar todas las casillas legales donde puedes reincorporarla.
- ♟️ **Reglas Oficiales Completas:** Validación de movimientos legales sin dejar al propio Rey en jaque, detección de jaque (*Ōte*) y jaque mate, promociones opcionales y obligatorias (*Nari*), *Nifu* (dos peones) y *Uchifuzume* (prohibición de jaque mate directo por drop de peón).

---

## 🏛️ Estructura del Proyecto

```text
shogi-web/
├── app.py               # Servidor Flask, gestión de salas online y stream SSE
├── tablero.py           # Clase Tablero: matriz 9x9, promociones y drops
├── jugador.py           # Clase Jugador: validación de jugadas, jaque y jaque mate
├── piezas.py            # Jerarquía de clases de piezas y reglas de movimiento
├── static/
│   ├── index.html       # Interfaz web semántica con modales <dialog> nativos
│   ├── styles.css       # Diseño Shōgiban, fichas pentagonales y layout CSS Grid
│   └── app.js           # Cliente en tiempo real (EventSource), salas y tablero
├── test.py              # Suite de pruebas unitarias del motor de Shōgi
└── requirements.txt     # Dependencias (numpy, flask)
```

---

## 🚀 Instalación y Ejecución

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Luego abre `http://localhost:5000` en tu navegador y comparte el enlace de invitación con el segundo jugador.
