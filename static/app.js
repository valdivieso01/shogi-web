(() => {
  // Progressive enhancement fallback for <dialog closedby="any">
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener("pointerdown", (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener("pointerup", (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }

  function getOrCreatePlayerId() {
    try {
      let pid = sessionStorage.getItem("shogi_player_id");
      if (!pid) {
        pid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
          .replace(/-/g, "")
          .slice(0, 12);
        sessionStorage.setItem("shogi_player_id", pid);
      }
      return pid;
    } catch (_) {
      return Math.random().toString(36).slice(2, 10);
    }
  }

  function loadNickname() {
    try {
      return localStorage.getItem("shogi_nickname") || "";
    } catch (_) {
      return "";
    }
  }

  function saveNickname(name) {
    try {
      localStorage.setItem("shogi_nickname", name);
    } catch (_) {}
  }

  const state = {
    view: "lobby", // "lobby" | "game"
    playerId: getOrCreatePlayerId(),
    nickname: loadNickname(),
    searchingMatch: false,
    lobbyData: null,
    lobbySource: null,

    roomCode: null,
    playerToken: null,
    myColor: null, // "negro" | "blanco" | "ambos" | "espectador"
    flipped: false,
    game: null,
    selectedCell: null,
    selectedDrop: null,
    legalTargets: [],
    roomSource: null,

    tutorialActive: false,
    tutorialStep: 0,
    tutorialCompletedStep: false,
  };

  // Elementos del Tutorial
  const senseiPanel = document.getElementById("sensei-panel");
  const senseiStepBadge = document.getElementById("sensei-step-badge");
  const senseiTitle = document.getElementById("sensei-title");
  const senseiJumpSelect = document.getElementById("sensei-jump-select");
  const senseiProgressFill = document.getElementById("sensei-progress-fill");
  const senseiText = document.getElementById("sensei-text");
  const senseiKeyPoints = document.getElementById("sensei-key-points");
  const senseiDiagrams = document.getElementById("sensei-diagrams");
  const senseiObjective = document.getElementById("sensei-objective");
  const btnTutPrev = document.getElementById("btn-tut-prev");
  const btnTutRetry = document.getElementById("btn-tut-retry");
  const btnTutNext = document.getElementById("btn-tut-next");

  // Vistas y Controles Superiores
  const lobbyView = document.getElementById("lobby-view");
  const gameView = document.getElementById("game-view");
  const btnBackLobby = document.getElementById("btn-back-lobby");
  const roomPill = document.getElementById("room-pill");
  const roomCodeDisplay = document.getElementById("room-code-display");
  const myRoleBadge = document.getElementById("my-role-badge");
  const connDot = document.getElementById("conn-dot");
  const btnCopyLink = document.getElementById("btn-copy-link");
  const btnCopyInline = document.getElementById("btn-copy-inline");
  const btnFlipBoard = document.getElementById("btn-flip-board");

  // Elementos del Lobby
  const lobbyNicknameInput = document.getElementById("lobby-nickname");
  const onlineCountLabel = document.getElementById("online-count-label");
  const matchmakeCard = document.getElementById("matchmake-card");
  const matchmakeStatusText = document.getElementById("matchmake-status-text");
  const queueCountBadge = document.getElementById("queue-count-badge");
  const btnQuickMatch = document.getElementById("btn-quick-match");
  const btnCancelMatch = document.getElementById("btn-cancel-match");
  const openRoomsList = document.getElementById("open-rooms-list");
  const liveRoomsList = document.getElementById("live-rooms-list");
  const onlinePlayersList = document.getElementById("online-players-list");
  const directCodeInput = document.getElementById("direct-code-input");
  const directJoinError = document.getElementById("direct-join-error");

  // Elementos del Tablero
  const boardEl = document.getElementById("shogi-board");
  const colCoordsEl = document.getElementById("col-coords");
  const rowCoordsEl = document.getElementById("row-coords");
  const inviteCallout = document.getElementById("invite-callout");
  const inviteUrlInput = document.getElementById("invite-url-input");
  const turnBanner = document.getElementById("turn-banner");
  const checkAlert = document.getElementById("check-alert");
  const historyList = document.getElementById("history-list");
  const moveCounter = document.getElementById("move-counter");

  // Modales
  const lobbyDialog = document.getElementById("lobby-dialog");
  const rulesDialog = document.getElementById("rules-dialog");
  const promoteDialog = document.getElementById("promote-dialog");
  const bugDialog = document.getElementById("bug-dialog");
  const promotePreview = document.getElementById("promote-preview");
  const lobbyError = document.getElementById("lobby-error");

  const bugForm = document.getElementById("bug-report-form");
  const bugCategory = document.getElementById("bug-category");
  const bugContext = document.getElementById("bug-context");
  const bugDescription = document.getElementById("bug-description");
  const bugContact = document.getElementById("bug-contact");
  const bugError = document.getElementById("bug-error");
  const bugSuccess = document.getElementById("bug-success");
  const linkGithubIssue = document.getElementById("link-github-issue");
  const linkMailtoBug = document.getElementById("link-mailto-bug");

  const KANJI_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

  /* ==========================================
     SINTETIZADOR ZEN JAPONÉS (KOTO & AMBIENT + SONIDO KOMA)
     ========================================== */
  const zenAudio = (() => {
    let ctx = null;
    let masterGain = null;
    let droneOsc1 = null;
    let droneOsc2 = null;
    let droneGain = null;
    let timerId = null;
    let isPlaying = false;
    let volume = Number(localStorage.getItem("shogi_music_vol") ?? 45) / 100;

    // Escala pentatónica japonesa Hirajōshi / Yo en Re (D3 a A5)
    const KOTO_FREQS = [
      146.83, // D3
      164.81, // E3
      174.61, // F3
      220.0,  // A3
      246.94, // B3
      293.66, // D4
      329.63, // E4
      349.23, // F4
      440.0,  // A4
      493.88, // B4
      587.33, // D5
      659.25, // E5
    ];

    function ensureContext() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.value = volume * 0.35;
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      return ctx;
    }

    function playKotoPluck(freq, delaySec = 0, duration = 3.4) {
      if (!isPlaying || !ctx) return;
      const now = ctx.currentTime + delaySec;

      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const noteGain = ctx.createGain();

      // Timbre suave de cuerda pulsada (Koto japonés)
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      // Ligero vibrato/bend tradicional de Koto al pulsar
      osc.frequency.exponentialRampToValueAtTime(freq * 1.006, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.35);

      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(freq * 0.5, now);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 3.2, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.1, now + duration);

      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.linearRampToValueAtTime(0.28, now + 0.025);
      noteGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + duration + 0.05);
      subOsc.stop(now + duration + 0.05);
    }

    function startDrone() {
      if (!ctx || droneOsc1) return;
      const now = ctx.currentTime;
      droneOsc1 = ctx.createOscillator();
      droneOsc2 = ctx.createOscillator();
      droneGain = ctx.createGain();

      droneOsc1.type = "sine";
      droneOsc1.frequency.setValueAtTime(73.42, now); // D2
      droneOsc2.type = "sine";
      droneOsc2.frequency.setValueAtTime(110.0, now); // A2 (quinta justa)

      droneGain.gain.setValueAtTime(0.001, now);
      droneGain.gain.linearRampToValueAtTime(0.11, now + 2.5);

      droneOsc1.connect(droneGain);
      droneOsc2.connect(droneGain);
      droneGain.connect(masterGain);

      droneOsc1.start(now);
      droneOsc2.start(now);
    }

    function stopDrone() {
      if (droneOsc1 && ctx) {
        try {
          droneOsc1.stop();
          droneOsc2.stop();
        } catch (_) {}
      }
      droneOsc1 = null;
      droneOsc2 = null;
      droneGain = null;
    }

    function scheduleNextPhrase() {
      if (!isPlaying) return;
      const f1 = KOTO_FREQS[Math.floor(Math.random() * KOTO_FREQS.length)];
      playKotoPluck(f1, 0, 3.8);

      // A veces toca un arpegio suave de 2 o 3 notas
      if (Math.random() < 0.65) {
        const f2 = KOTO_FREQS[Math.floor(Math.random() * KOTO_FREQS.length)];
        playKotoPluck(f2, 0.55 + Math.random() * 0.35, 3.5);
      }
      if (Math.random() < 0.35) {
        const f3 = KOTO_FREQS[Math.floor(Math.random() * KOTO_FREQS.length)];
        playKotoPluck(f3, 1.35 + Math.random() * 0.4, 4.0);
      }

      const nextIntervalMs = 2400 + Math.random() * 1800;
      timerId = setTimeout(scheduleNextPhrase, nextIntervalMs);
    }

    function start() {
      if (isPlaying) return;
      if (!ensureContext()) return;
      isPlaying = true;
      startDrone();
      scheduleNextPhrase();
      localStorage.setItem("shogi_music_on", "1");
    }

    function stop() {
      isPlaying = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      stopDrone();
      localStorage.setItem("shogi_music_on", "0");
    }

    function toggle() {
      if (isPlaying) {
        stop();
      } else {
        start();
      }
      return isPlaying;
    }

    function setVolume(percent) {
      volume = Math.max(0, Math.min(100, Number(percent))) / 100;
      localStorage.setItem("shogi_music_vol", String(Math.round(volume * 100)));
      if (masterGain && ctx) {
        masterGain.gain.setTargetAtTime(volume * 0.35, ctx.currentTime, 0.05);
      }
    }

    // Efecto sutil de madera ('Pachi') al apoyar una ficha en el Shōgiban
    function playWoodClick() {
      if (!isPlaying || !ctx || volume <= 0.02) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.045);

      clickGain.gain.setValueAtTime(0.35, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(clickGain);
      clickGain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.055);
    }

    return {
      toggle,
      setVolume,
      playWoodClick,
      getVolumePercent: () => Math.round(volume * 100),
      isPlaying: () => isPlaying,
    };
  })();

  function escapeHTML(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const PIECE_CATALOG = {
    K: { kanji_negro: "王", kanji_blanco: "玉", kanji_promoted: "王", es: "Rey", romaji: "Gyokushō" },
    R: { kanji_negro: "飛", kanji_blanco: "飛", kanji_promoted: "龍", es: "Torre", es_promoted: "Dragón", romaji: "Hisha" },
    B: { kanji_negro: "角", kanji_blanco: "角", kanji_promoted: "馬", es: "Alfil", es_promoted: "C.Dragón", romaji: "Kakugyō" },
    G: { kanji_negro: "金", kanji_blanco: "金", kanji_promoted: "金", es: "Oro", romaji: "Kinshō" },
    S: { kanji_negro: "銀", kanji_blanco: "銀", kanji_promoted: "全", es: "Plata", es_promoted: "Plata+", romaji: "Ginshō" },
    N: { kanji_negro: "桂", kanji_blanco: "桂", kanji_promoted: "圭", es: "Caballo", es_promoted: "Caballo+", romaji: "Keima" },
    L: { kanji_negro: "香", kanji_blanco: "香", kanji_promoted: "杏", es: "Lancero", es_promoted: "Lancero+", romaji: "Kyōsha" },
    P: { kanji_negro: "歩", kanji_blanco: "歩", kanji_promoted: "と", es: "Peón", es_promoted: "Tokin", romaji: "Fuhyō" },
  };

  function makeCell(code, color, promoted = false) {
    const meta = PIECE_CATALOG[code];
    return {
      code,
      display_code: promoted ? `+${code}` : code,
      color,
      promoted,
      kanji: promoted ? meta.kanji_promoted : color === "negro" ? meta.kanji_negro : meta.kanji_blanco,
      es: promoted && meta.es_promoted ? meta.es_promoted : meta.es,
      romaji: meta.romaji,
    };
  }

  function makeStandardTutorialBoard() {
    const emptyRow = () => Array(9).fill(null);
    return [
      // Fila 0: Rival arriba (Gote · Blanco ☖) en la vista de aprendizaje para que el alumno juegue desde abajo
      [
        makeCell("L", "blanco"),
        makeCell("N", "blanco"),
        makeCell("S", "blanco"),
        makeCell("G", "blanco"),
        makeCell("K", "blanco"),
        makeCell("G", "blanco"),
        makeCell("S", "blanco"),
        makeCell("N", "blanco"),
        makeCell("L", "blanco"),
      ],
      [null, makeCell("R", "blanco"), null, null, null, null, null, makeCell("B", "blanco"), null],
      Array.from({ length: 9 }, () => makeCell("P", "blanco")),
      emptyRow(),
      emptyRow(),
      emptyRow(),
      Array.from({ length: 9 }, () => makeCell("P", "negro")),
      [null, makeCell("B", "negro"), null, null, null, null, null, makeCell("R", "negro"), null],
      [
        makeCell("L", "negro"),
        makeCell("N", "negro"),
        makeCell("S", "negro"),
        makeCell("G", "negro"),
        makeCell("K", "negro"),
        makeCell("G", "negro"),
        makeCell("S", "negro"),
        makeCell("N", "negro"),
        makeCell("L", "negro"),
      ],
    ];
  }

  function renderCompassHTML(diagram) {
    // diagram.grid es una matriz 3x3 o 5x5 con códigos:
    // "." = vacío, "C:Kanji" = pieza central, "1" = mueve 1 paso, "X" = prohibido, "R:flecha" = rayo deslizante, "J" = salto
    const is5 = diagram.grid.length === 5;
    const cellsHTML = [];
    for (const row of diagram.grid) {
      for (const token of row) {
        if (token.startsWith("C:")) {
          cellsHTML.push(`<div class="compass-cell center-piece">${token.slice(2)}</div>`);
        } else if (token === "1") {
          cellsHTML.push(`<div class="compass-cell step-one" title="Mueve 1 casilla">●</div>`);
        } else if (token.startsWith("R:")) {
          cellsHTML.push(`<div class="compass-cell step-ray" title="Se desliza cualquier cantidad de casillas">${token.slice(2)}</div>`);
        } else if (token === "J") {
          cellsHTML.push(`<div class="compass-cell step-jump" title="Salta sobre piezas">★</div>`);
        } else if (token === "X") {
          cellsHTML.push(`<div class="compass-cell step-forbidden" title="No puede mover aquí">✕</div>`);
        } else {
          cellsHTML.push(`<div class="compass-cell"></div>`);
        }
      }
    }
    return `
      <div class="move-diagram-card">
        <span class="move-diagram-title">${diagram.title}</span>
        <div class="move-compass ${is5 ? "compass-5x5" : ""}">
          ${cellsHTML.join("")}
        </div>
        <span class="move-diagram-legend">${diagram.legend}</span>
      </div>
    `;
  }

  // Curso Completo de 12 Lecciones con Diagramas Visuales de Movimiento
  const TUTORIAL_LESSONS = [
    {
      title: "1. El Rey (王 · K): Movimiento y Cómo Escapar del Jaque",
      text: "El Rey (Gyoku / Ōshō) es la pieza más importante: si lo acorralan sin escapatoria (Jaque Mate), termina la partida. En Shōgi las fichas no se dividen por color blanco/negro de madera, sino por hacia dónde apunta su punta pentagonal: las tuyas (Sente ☗) apuntan hacia arriba.",
      keyPoints: [
        "<strong>¿Cómo mueve el Rey?</strong> Exactamente <strong>1 casilla en cualquiera de las 8 direcciones</strong> (adelante, atrás, costados y las 4 diagonales).",
        "<strong>¿Promociona?</strong> No, el Rey nunca promociona.",
        "<strong>Regla de Jaque (Ōte):</strong> Nunca puedes dejar a tu Rey en una casilla atacada. En este ejercicio una Torre enemiga en (5, 4) está dando jaque a tu Rey en (8, 4).",
      ],
      diagrams: [
        {
          title: "Rey (王 · K)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:王", "1"],
            ["1", "1", "1"],
          ],
          legend: "● 1 casilla en las 8 direcciones",
        },
      ],
      objective: "👉 Haz clic en tu Rey en (8, 4). Verás que no puede subir por la columna 4 porque sigue la línea de la Torre enemiga: muévelo en diagonal a (7, 3) para ponerlo a salvo junto a tus Generales.",
      actionType: "move",
      from: [8, 4],
      to: [7, 3],
      extraPreviewTargets: [
        { row: 7, col: 3, capture: false },
        { row: 7, col: 5, capture: false },
      ],
      promote: false,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[7][3] = null;
        b[7][4] = null;
        b[7][5] = null;
        b[6][4] = null;
        b[6][3] = makeCell("G", "negro");
        b[8][3] = null;
        b[5][4] = makeCell("R", "blanco");
        b[1][1] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Muy bien! El Rey mueve 1 paso en cualquier dirección. En Shōgi suele resguardarse detrás de los Generales de Oro y Plata formando un castillo (Kakoi).",
    },
    {
      title: "2. El General de Oro (金 · G): El Guardián de 6 Direcciones",
      text: "El General de Oro (Kinshō) es el principal defensor del Rey. Es fundamental aprender su movimiento porque 4 piezas distintas (Peón, Lancero, Caballo y Plata) se transforman y mueven exactamente como un General de Oro cuando promocionan.",
      keyPoints: [
        "<strong>¿Cómo mueve el Oro?</strong> Mueve <strong>1 casilla en 6 direcciones</strong>: adelante, izquierda, derecha, atrás y las <strong>2 diagonales delanteras</strong>.",
        "<strong>Punto débil (✕):</strong> <strong>NO puede mover a las 2 diagonales traseras</strong> (mira las ✕ rojas en el diagrama).",
        "<strong>¿Promociona?</strong> No, el General de Oro ya está en su rango máximo.",
      ],
      diagrams: [
        {
          title: "General de Oro (金 · G)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:金", "1"],
            ["X", "1", "X"],
          ],
          legend: "● 6 casillas | ✕ Sin diagonal trasera",
        },
      ],
      objective: "👉 Un Caballo enemigo se infiltró en (6, 4). Selecciona tu General de Oro en (7, 3) —verás sus 6 movimientos— y usa su diagonal delantera derecha para capturarlo en (6, 4).",
      actionType: "move",
      from: [7, 3],
      to: [6, 4],
      extraPreviewTargets: [
        { row: 6, col: 2, capture: false },
        { row: 6, col: 3, capture: false },
        { row: 6, col: 4, capture: true },
        { row: 7, col: 2, capture: false },
        { row: 7, col: 4, capture: false },
        { row: 8, col: 3, capture: false },
      ],
      promote: false,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[7][3] = makeCell("G", "negro");
        b[8][3] = null;
        b[6][2] = null;
        b[6][3] = null;
        b[6][4] = makeCell("N", "blanco");
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Exacto! Recuerda siempre la forma del General de Oro: 3 casillas arriba, 2 a los costados y 1 derecho hacia atrás.",
    },
    {
      title: "3. El General de Plata (銀 · S): Ataque Diagonal vs Promoción",
      text: "El General de Plata (Ginshō) es el compañero ofensivo del Oro. Muchos principiantes los confunden, pero sus movimientos son complementarios: la Plata domina las 4 diagonales pero no tiene movimiento lateral ni hacia atrás recto.",
      keyPoints: [
        "<strong>¿Cómo mueve la Plata?</strong> Mueve <strong>1 casilla en 5 direcciones</strong>: derecho hacia adelante y las <strong>4 diagonales</strong> (¡sí tiene las 2 diagonales traseras!).",
        "<strong>Punto débil (✕):</strong> <strong>NO mueve a los costados ni derecho hacia atrás</strong>.",
        "<strong>¿Cuándo promocionar (+S · 全)?</strong> Al promocionar se convierte en Oro: gana costados y atrás, pero pierde las 2 diagonales traseras.",
      ],
      diagrams: [
        {
          title: "Plata Normal (銀 · S)",
          grid: [
            ["1", "1", "1"],
            ["X", "C:銀", "X"],
            ["1", "X", "1"],
          ],
          legend: "● Adelante + 4 diagonales",
        },
        {
          title: "Plata Promovida (+S · 全)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:全", "1"],
            ["X", "1", "X"],
          ],
          legend: "Mueve igual que el Oro",
        },
      ],
      objective: "👉 Selecciona tu General de Plata en (5, 4). Observa que NO puede ir a los costados (5, 3) ni (5, 5), pero sí en diagonal: muévelo en diagonal delantera a (4, 3).",
      actionType: "move",
      from: [5, 4],
      to: [4, 3],
      extraPreviewTargets: [
        { row: 4, col: 3, capture: false },
        { row: 4, col: 4, capture: false },
        { row: 4, col: 5, capture: false },
        { row: 6, col: 3, capture: false },
        { row: 6, col: 5, capture: false },
      ],
      promote: false,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[5][4] = makeCell("S", "negro");
        b[8][2] = null;
        b[6][3] = null;
        b[6][5] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Perfecto! La Plata sin promocionar es excelente para avanzar entre líneas y poder retirarse en diagonal trasera si es necesario.",
    },
    {
      title: "4. El Peón (歩 · P) y su Transformación en Tokin (と · +P)",
      text: "En Shōgi tienes 9 peones en la fila 6. A diferencia del ajedrez occidental, los peones japoneses NUNCA capturan en diagonal ni avanzan 2 casillas al inicio, pero cuando llegan a las 3 filas enemigas (filas 0, 1 o 2) se transforman en Tokin.",
      keyPoints: [
        "<strong>¿Cómo mueve y captura el Peón?</strong> Solo <strong>1 casilla derecho hacia adelante</strong>. Captura también de frente.",
        "<strong>Zona de Promoción:</strong> Las filas 0, 1 y 2 son el territorio enemigo. Al entrar allí puedes promocionar.",
        "<strong>El Tokin (と · +P):</strong> Un peón promocionado mueve en <strong>6 direcciones igual que un General de Oro</strong>. ¡Un humilde peón vale tanto como un General!",
      ],
      diagrams: [
        {
          title: "Peón Normal (歩 · P)",
          grid: [
            ["X", "1", "X"],
            ["X", "C:歩", "X"],
            ["X", "X", "X"],
          ],
          legend: "● Solo 1 paso al frente",
        },
        {
          title: "Tokin (+P · と)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:と", "1"],
            ["X", "1", "X"],
          ],
          legend: "Mueve como General de Oro",
        },
      ],
      objective: "👉 Tu Peón en (3, 2) está a un paso de la zona enemiga. Avánzalo a (2, 2) capturando de frente al peón rival y elige 'Promocionar (+)' para convertirlo en Tokin (と).",
      actionType: "move",
      from: [3, 2],
      to: [2, 2],
      canPromote: true,
      requirePromote: true,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[6][2] = null;
        b[3][2] = makeCell("P", "negro");
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Excelente! Ahora tu Tokin (+P) puede mover hacia los lados y en diagonal delantera, desarmando la defensa rival. Además, el peón capturado fue a tu reserva.",
    },
    {
      title: "5. El Lancero (香 · L): El Rayo Frontal",
      text: "En las esquinas del tablero (columnas 0 y 8) están tus dos Lanceros (Kyōsha). Imagínalos como una lanza o un cohete: corren tan lejos como quieran hacia adelante, pero jamás pueden retroceder ni girar.",
      keyPoints: [
        "<strong>¿Cómo mueve el Lancero?</strong> Se desliza <strong>cualquier número de casillas libres únicamente hacia adelante</strong> (no puede saltar sobre otras piezas).",
        "<strong>Promoción (+L · 杏):</strong> Al entrar en las filas 0, 1 o 2 puede promocionar y pasa a mover como <strong>General de Oro</strong>.",
        "<strong>Promoción obligatoria en fila 0:</strong> Si llega a la fila 0 (el borde final), promociona obligatoriamente para no quedar inmóvil.",
      ],
      diagrams: [
        {
          title: "Lancero (香 · L)",
          grid: [
            ["X", "R:⇑", "X"],
            ["X", "C:香", "X"],
            ["X", "X", "X"],
          ],
          legend: "⇑ Se desliza solo hacia adelante",
        },
        {
          title: "Lancero+ (+L · 杏)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:杏", "1"],
            ["X", "1", "X"],
          ],
          legend: "Mueve como General de Oro",
        },
      ],
      objective: "👉 La columna 0 está despejada. Selecciona tu Lancero en (8, 0), deslízalo hasta (1, 0) en territorio enemigo y promociónalo a Lancero+ (+L).",
      actionType: "move",
      from: [8, 0],
      to: [1, 0],
      extraPreviewTargets: [
        { row: 7, col: 0, capture: false },
        { row: 6, col: 0, capture: false },
        { row: 5, col: 0, capture: false },
        { row: 4, col: 0, capture: false },
        { row: 3, col: 0, capture: false },
        { row: 2, col: 0, capture: false },
        { row: 1, col: 0, capture: false },
      ],
      canPromote: true,
      requirePromote: true,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[6][0] = null;
        b[2][0] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Genial! Cerca de la base enemiga suele convenir promocionar al Lancero para que pueda moverse lateralmente hacia el Rey rival.",
    },
    {
      title: "6. El Caballo Japonés (桂 · N): El Salto en 'Y' y Ataque Doble",
      text: "El Caballo japonés (Keima) es la única pieza de todo el juego capaz de saltar por encima de piezas propias o rivales. Pero cuidado: no tiene los 8 saltos del ajedrez occidental, ¡solo tiene los 2 saltos hacia adelante!",
      keyPoints: [
        "<strong>¿Cómo salta el Caballo?</strong> Avanza <strong>2 filas hacia adelante y 1 columna a la izquierda o derecha</strong> (forma una 'Y' hacia el frente).",
        "<strong>No retrocede:</strong> Nunca puede saltar hacia los costados ni hacia atrás.",
        "<strong>Promoción (+N · 圭):</strong> En las filas 0, 1 o 2 promociona a General de Oro (obligatorio si cae en fila 0 o 1).",
      ],
      diagrams: [
        {
          title: "Caballo (桂 · N)",
          grid: [
            [".", "J", ".", "J", "."],
            [".", ".", ".", ".", "."],
            [".", ".", "C:桂", ".", "."],
            [".", ".", ".", ".", "."],
            [".", ".", ".", ".", "."],
          ],
          legend: "★ Salta 2 adelante y 1 al lado",
        },
        {
          title: "Caballo+ (+N · 圭)",
          grid: [
            ["1", "1", "1"],
            ["1", "C:圭", "1"],
            ["X", "1", "X"],
          ],
          legend: "Mueve como General de Oro",
        },
      ],
      objective: "👉 Tu Caballo está en (4, 2). Hazlo saltar por encima de los peones hasta (2, 3) y elige 'Mantener normal' (sin promocionar) para que desde (2, 3) amenace a la vez a la Torre en (0, 2) y al Rey en (0, 4).",
      actionType: "move",
      from: [4, 2],
      to: [2, 3],
      extraPreviewTargets: [
        { row: 2, col: 1, capture: false },
        { row: 2, col: 3, capture: false },
      ],
      canPromote: true,
      requirePromote: false,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[4][2] = makeCell("N", "negro");
        b[8][1] = null;
        b[2][3] = null;
        b[2][1] = null;
        b[0][2] = makeCell("R", "blanco");
        b[1][1] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Ataque doble perfecto! Desde (2, 3), tu Caballo apunta simultáneamente a (0, 2) donde está la Torre y a (0, 4) dando jaque al Rey enemigo.",
    },
    {
      title: "7. El Alfil (角 · B) y el Caballo Dragón (馬 · +B)",
      text: "El Alfil (Kakugyō) es una de las dos piezas mayores del Shōgi. En su estado normal solo domina las diagonales de un color, pero cuando promociona a Caballo Dragón (Ryūma / Uma) rompe esa limitación.",
      keyPoints: [
        "<strong>Alfil Normal (角 · B):</strong> Se desliza cualquier número de casillas libres en las <strong>4 diagonales</strong>.",
        "<strong>Caballo Dragón (+B · 馬):</strong> Conserva todas las diagonales del Alfil <strong>+ 1 paso ortogonal (arriba, abajo, izquierda, derecha)</strong>.",
        "Gracias a ese paso en cruz, el Caballo Dragón puede defenderse de cerca y cambiar de diagonal.",
      ],
      diagrams: [
        {
          title: "Alfil (角 · B)",
          grid: [
            ["R:⇖", "X", "R:⇗"],
            ["X", "C:角", "X"],
            ["R:⇙", "X", "R:⇘"],
          ],
          legend: "⇖⇗⇙⇘ Se desliza en 4 diagonales",
        },
        {
          title: "C.Dragón (+B · 馬)",
          grid: [
            ["R:⇖", "1", "R:⇗"],
            ["1", "C:馬", "1"],
            ["R:⇙", "1", "R:⇘"],
          ],
          legend: "Alfil + ● 1 paso en cruz (Rey)",
        },
      ],
      objective: "👉 Con la diagonal abierta, selecciona tu Alfil en (7, 1), cruza el tablero hasta (1, 7) capturando al Alfil rival y elige 'Promocionar (+)' para coronarlo en Caballo Dragón (馬).",
      actionType: "move",
      from: [7, 1],
      to: [1, 7],
      canPromote: true,
      requirePromote: true,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[5][2] = b[6][2];
        b[6][2] = null;
        b[3][6] = b[2][6];
        b[2][6] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Espectacular! Tu Caballo Dragón (+B) ahora ataca en todas las direcciones alrededor suyo además de cruzar el tablero en diagonal.",
    },
    {
      title: "8. La Torre (飛 · R) y el Rey Dragón (龍 · +R)",
      text: "La Torre (Hisha) es la pieza más poderosa del tablero. Al promocionar en territorio enemigo se convierte en el temido Rey Dragón (Ryūō), que combina el alcance total de una Torre con el movimiento corto de un Rey.",
      keyPoints: [
        "<strong>Torre Normal (飛 · R):</strong> Se desliza cualquier cantidad de casillas libres en <strong>vertical y horizontal</strong> (cruz).",
        "<strong>Rey Dragón (+R · 龍):</strong> Conserva todo el movimiento de la Torre <strong>+ 1 paso en las 4 diagonales</strong>.",
        "Un Dragón infiltrado en la fila 0 o 1 enemiga es la herramienta de ataque más letal del Shōgi.",
      ],
      diagrams: [
        {
          title: "Torre (飛 · R)",
          grid: [
            ["X", "R:⇑", "X"],
            ["R:⇐", "C:飛", "R:⇒"],
            ["X", "R:⇓", "X"],
          ],
          legend: "⇑⇓⇐⇒ Se desliza en cruz",
        },
        {
          title: "Dragón (+R · 龍)",
          grid: [
            ["1", "R:⇑", "1"],
            ["R:⇐", "C:龍", "R:⇒"],
            ["1", "R:⇓", "1"],
          ],
          legend: "Torre + ● 1 paso diagonal",
        },
      ],
      objective: "👉 Selecciona tu Torre en (7, 7), avanza por la columna abierta hasta (1, 7) y promociónala a Dragón (龍 · +R).",
      actionType: "move",
      from: [7, 7],
      to: [1, 7],
      canPromote: true,
      requirePromote: true,
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[6][7] = null;
        b[2][7] = null;
        b[1][7] = null;
        return { board: b, captured: { negro: [], blanco: [] } };
      },
      afterSuccessText: "¡Imparable! Ahora tu Dragón (+R) puede mover tanto a lo largo de las filas y columnas como 1 paso en diagonal.",
    },
    {
      title: "9. Reincorporación de Piezas (Drop / 打ち): Tus Capturas son Refuerzos",
      text: "A diferencia del ajedrez occidental, en Shōgi casi nunca hay tablas por falta de material: toda pieza que capturas del rival pierde su promoción, cambia a tu bando y espera en tu Komadai (reserva) para volver a entrar en combate.",
      keyPoints: [
        "<strong>¿Cómo funciona un Drop?</strong> En tu turno, en lugar de mover en el tablero, eliges una pieza de tu reserva y la colocas en <strong>cualquier casilla vacía</strong>.",
        "<strong>¿Entra promocionada?</strong> No. Incluso si la sueltas dentro de las 3 filas enemigas, siempre entra sin promocionar (podrá promocionar en un turno posterior al moverse).",
        "<strong>Ataque Doble con Drop:</strong> Observa que la casilla (2, 2) está vacía y conecta en diagonal con la Torre enemiga en (1, 1) y con el Rey enemigo en (0, 4).",
      ],
      diagrams: [
        {
          title: "Drop en (2, 2)",
          grid: [
            ["C:飛", ".", "C:玉"],
            [".", "C:角", "."],
            [".", ".", "."],
          ],
          legend: "Ataque doble a Torre (1,1) y Rey (0,4)",
        },
      ],
      objective: "👉 Haz clic en el Alfil (角 · B) de tu reserva inferior ('Piezas en mano') y reincorpóralo en la casilla vacía (2, 2) para atacar al mismo tiempo a la Torre en (1, 1) y dar jaque al Rey en (0, 4).",
      actionType: "drop",
      dropCode: "B",
      to: [2, 2],
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[2][2] = null;
        b[1][3] = null;
        b[1][7] = null;
        return {
          board: b,
          captured: {
            negro: [{ code: "B", count: 1, kanji: "角", es: "Alfil", romaji: "Kakugyō" }],
            blanco: [],
          },
        };
      },
      afterSuccessText: "¡Excelente! Al soltar tu Alfil en (2, 2) hiciste un ataque doble real: das jaque por la diagonal derecha al Rey en (0, 4) y en el siguiente turno podrás capturar la Torre de (1, 1).",
    },
    {
      title: "10. Las 3 Prohibiciones al Reincorporar: Nifu, Sin Salida y Uchifuzume",
      text: "Aunque puedes reincorporar casi cualquier pieza en cualquier casilla vacía, existen 3 reglas oficiales estrictas que prohíben ciertos Drops (sobre todo con Peones):",
      keyPoints: [
        "<strong>1. Nifu (二歩 - Dos Peones):</strong> Está prohibido reincorporar un Peón en una columna donde <strong>ya tengas otro Peón tuyo sin promocionar</strong>. (Si tu peón en esa columna ya es Tokin +P, sí puedes).",
        "<strong>2. Casilla sin movimiento futuro:</strong> Prohibido soltar Peón o Lancero en la fila 0, o Caballo en las filas 0 y 1.",
        "<strong>3. Uchifuzume (打ち歩詰め):</strong> Prohibido dar <strong>Jaque Mate inmediato soltando un Peón de la reserva</strong> (dar jaque normal con drop de peón sí vale, y dar mate moviendo un peón del tablero también vale).",
      ],
      diagrams: [
        {
          title: "Regla Nifu (二歩)",
          grid: [
            ["X", "1", "X"],
            ["X", ".", "X"],
            ["C:歩", "C:と", "C:歩"],
          ],
          legend: "✕ Columna con Peón | ● Columna con Tokin",
        },
      ],
      objective: "👉 Tienes peones sin promocionar en las columnas 3 y 5 (Nifu prohibido allí), pero en la columna 4 tu peón ya promocionó a Tokin (+P). Toma el Peón (歩 · P) de tu reserva y suéltalo en (2, 4).",
      actionType: "drop",
      dropCode: "P",
      to: [2, 4],
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[6][4] = null;
        b[3][4] = makeCell("P", "negro", true);
        b[2][4] = null;
        return {
          board: b,
          captured: {
            negro: [{ code: "P", count: 1, kanji: "歩", es: "Peón", romaji: "Fuhyō" }],
            blanco: [],
          },
        };
      },
      afterSuccessText: "¡Muy bien! Como en la columna 4 tenías un Tokin (+P) y no un Peón normal, reincorporar otro Peón en esa columna es 100% legal y no comete Nifu.",
    },
    {
      title: "11. Cómo Defender un Jaque: Escapar, Capturar o Interponer (Drop)",
      text: "Cuando el rival pone a tu Rey en jaque (Ōte), existen 3 formas legales de defenderte: 1) Mover el Rey a una casilla segura, 2) Capturar a la pieza atacante, o 3) Interponer una pieza en el medio (moviéndola o soltándola desde tu reserva).",
      keyPoints: [
        "<strong>Defensa con Drop (Aigoma):</strong> Si una pieza deslizante (Torre, Alfil o Lancero) da jaque a distancia, puedes reincorporar una pieza de tu reserva en una casilla intermedia para bloquear el ataque.",
        "En este tablero, una Torre enemiga en (4, 4) da jaque directo a tu Rey en (8, 4).",
      ],
      diagrams: [
        {
          title: "Bloqueo (合駒 · Aigoma)",
          grid: [
            [".", "C:飛", "."],
            [".", "1", "."],
            [".", "C:王", "."],
          ],
          legend: "● Interponer pieza entre Torre y Rey",
        },
      ],
      objective: "👉 Tu Rey en (8, 4) está en jaque por la Torre en (4, 4). Selecciona el General de Plata (銀 · S) de tu reserva inferior y reincorpóralo en (7, 4) para bloquear el jaque.",
      actionType: "drop",
      dropCode: "S",
      to: [7, 4],
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[6][4] = null;
        b[4][4] = makeCell("R", "blanco");
        b[1][1] = null;
        return {
          board: b,
          in_check: "negro",
          captured: {
            negro: [{ code: "S", count: 1, kanji: "銀", es: "Plata", romaji: "Ginshō" }],
            blanco: [],
          },
        };
      },
      afterSuccessText: "¡Defensa magistral! Bloqueaste el jaque de la Torre reincorporando una pieza de tu mano (Aigoma) frente a tu Rey.",
    },
    {
      title: "12. Jaque Mate Final (詰み · Tsumi): Oro en la Cabeza (Atama-kin)",
      text: "Para cerrar el curso, ejecutaremos el patrón de Jaque Mate más famoso del Shōgi: 'Atama-kin' (colocar un General de Oro justo en la cabeza del Rey enemigo, respaldado por otra pieza tuya).",
      keyPoints: [
        "El Rey enemigo está en (0, 4), encerrado a los lados por sus propios Lanceros en (0, 3) y (0, 5).",
        "Tu Peón en (2, 4) y tu Dragón (+R) en (1, 7) defienden la casilla (1, 4) y cubren toda la fila 1.",
        "A diferencia del Peón (que tendría prohibido dar mate de drop por Uchifuzume), <strong>el General de Oro SÍ puede dar Jaque Mate directo al reincorporarse</strong>.",
      ],
      diagrams: [
        {
          title: "Mate Atama-kin (頭金)",
          grid: [
            ["C:香", "C:玉", "C:香"],
            ["1", "C:金", "1"],
            [".", "C:歩", "."],
          ],
          legend: "Oro en (1,4) apoyado por Peón en (2,4)",
        },
      ],
      objective: "👉 Selecciona el General de Oro (金 · G) en tu reserva inferior y reincorpóralo en (1, 4) frente al Rey enemigo para dar ¡Jaque Mate!",
      actionType: "drop",
      dropCode: "G",
      to: [1, 4],
      setupBoard() {
        const b = makeStandardTutorialBoard();
        b[1][4] = null;
        b[2][4] = makeCell("P", "negro");
        b[6][4] = null;
        b[1][7] = makeCell("R", "negro", true);
        b[7][7] = null;
        b[0][3] = makeCell("L", "blanco");
        b[0][5] = makeCell("L", "blanco");
        return {
          board: b,
          captured: {
            negro: [{ code: "G", count: 1, kanji: "金", es: "Oro", romaji: "Kinshō" }],
            blanco: [],
          },
        };
      },
      afterSuccessText: "🎉 ¡JAQUE MATE (詰み - Tsumi)! El Rey enemigo no puede comer tu Oro porque está defendido por tu Peón y tu Dragón, ni puede escapar a ninguna casilla de la fila 1. ¡Completaste las 12 lecciones de la Academia de Shōgi!",
    },
  ];

  function getNickname() {
    const val = (lobbyNicknameInput.value || "").trim();
    if (val) {
      state.nickname = val;
      saveNickname(val);
      return val;
    }
    return state.nickname || `Samurai-${state.playerId.slice(0, 4).toUpperCase()}`;
  }

  function getInviteUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  }

  function saveSession(code, token, color) {
    try {
      sessionStorage.setItem(`shogi_room_${code}`, JSON.stringify({ token, color }));
    } catch (_) {}
  }

  function loadSession(code) {
    try {
      const raw = sessionStorage.getItem(`shogi_room_${code}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function switchView(targetView) {
    state.view = targetView;
    const inGame = targetView === "game";
    lobbyView.hidden = inGame;
    gameView.hidden = !inGame;
    btnBackLobby.hidden = !inGame;
    roomPill.hidden = !inGame;
    btnFlipBoard.hidden = !inGame;
    btnCopyLink.hidden = !inGame || (state.game && state.game.mode !== "online");
  }

  /* ==========================================
     LÓGICA DEL LOBBY Y MATCHMAKING EN TIEMPO REAL
     ========================================== */
  function connectLobbyStream() {
    if (state.lobbySource) {
      state.lobbySource.close();
    }
    const nameParam = encodeURIComponent(getNickname());
    const es = new EventSource(`/api/lobby/stream?player_id=${state.playerId}&name=${nameParam}`);
    state.lobbySource = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.replaced_by_same_ip) {
          es.close();
          matchmakeStatusText.textContent =
            "⚠️ Se abrió otra conexión al Dojo desde tu misma dirección IP. Esta pestaña quedó en pausa.";
          return;
        }
        state.lobbyData = data;
        // Verificar si el servidor nos emparejó en el matchmaking
        if (state.searchingMatch && data.matches && data.matches[state.playerId]) {
          const matchAssignment = data.matches[state.playerId];
          state.searchingMatch = false;
          updateMatchmakingUI();
          applyRoomJoined(matchAssignment);
          return;
        }
        renderLobby();
      } catch (_) {}
    };
  }

  function updateMatchmakingUI() {
    matchmakeCard.classList.toggle("searching", state.searchingMatch);
    btnQuickMatch.hidden = state.searchingMatch;
    btnCancelMatch.hidden = !state.searchingMatch;
    matchmakeStatusText.textContent = state.searchingMatch
      ? "Buscando oponente en el Dojo... En cuanto otro jugador pulse Buscar Rival, la partida iniciará automáticamente."
      : "Busca a otro jugador en cola y comienza una partida automáticamente con asignación de bandos.";
  }

  function renderLobby() {
    if (!state.lobbyData) return;
    const { open_rooms = [], live_rooms = [], queue_count = 0, online_players = [] } = state.lobbyData;

    onlineCountLabel.textContent = `${online_players.length} en el lobby`;
    queueCountBadge.textContent = `${queue_count} buscando rival`;
    updateMatchmakingUI();

    // 1. Salas Abiertas Esperando Rival
    if (open_rooms.length === 0) {
      openRoomsList.innerHTML = `<p class="empty-state">No hay salas públicas esperando jugador. ¡Crea una sala o pulsa "Buscar Rival Ahora"!</p>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const r of open_rooms) {
        const row = document.createElement("div");
        row.className = "room-row";
        const hostSide = r.players.negro.connected
          ? `☗ Negro: ${escapeHTML(r.players.negro.name)}`
          : `☖ Blanco: ${escapeHTML(r.players.blanco.name)}`;
        const freeSide = r.open_seat === "negro" ? "Libre: ☗ Negro" : "Libre: ☖ Blanco";
        row.innerHTML = `
          <div class="room-row-info">
            <div class="room-row-title">
              <span>${escapeHTML(r.title)}</span>
              <code>${escapeHTML(r.room_code)}</code>
            </div>
            <div class="room-row-players">
              <span>${hostSide}</span>
              <span class="seat-open">· ${freeSide}</span>
            </div>
          </div>
          <button type="button" class="btn btn-primary">Unirse y Jugar</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
          joinRoomByCode(r.room_code, getNickname());
        });
        frag.appendChild(row);
      }
      openRoomsList.replaceChildren(frag);
    }

    // 2. Partidas en Vivo (Espectador)
    if (live_rooms.length === 0) {
      liveRoomsList.innerHTML = `<p class="empty-state">No hay partidas en curso en este momento.</p>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const r of live_rooms) {
        const row = document.createElement("div");
        row.className = "room-row";
        row.innerHTML = `
          <div class="room-row-info">
            <div class="room-row-title">
              <span>☗ ${escapeHTML(r.players.negro.name)} vs ☖ ${escapeHTML(r.players.blanco.name)}</span>
              <code>${escapeHTML(r.room_code)}</code>
            </div>
            <div class="room-row-players">
              <span>Jugada #${Number(r.move_count) || 0} · Turno: ${r.turn === "negro" ? "☗ Negro" : "☖ Blanco"}</span>
            </div>
          </div>
          <button type="button" class="btn">Ver partida</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
          joinRoomByCode(r.room_code, getNickname(), null, true);
        });
        frag.appendChild(row);
      }
      liveRoomsList.replaceChildren(frag);
    }

    // 3. Jugadores Conectados en el Lobby
    if (online_players.length === 0) {
      onlinePlayersList.innerHTML = `<li class="player-chip">Conectando al lobby...</li>`;
    } else {
      onlinePlayersList.innerHTML = online_players
        .map((p) => {
          const isMe = p.player_id === state.playerId;
          const searching = p.status === "searching";
          return `
            <li class="player-chip ${searching ? "searching" : ""}">
              <span class="status-dot online" aria-hidden="true"></span>
              <span>${escapeHTML(p.name)}${isMe ? " (Tú)" : ""}${searching ? " · Buscando rival..." : ""}</span>
            </li>
          `;
        })
        .join("");
    }
  }

  async function startQuickMatchmaking() {
    state.searchingMatch = true;
    updateMatchmakingUI();
    const res = await fetch("/api/lobby/matchmake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: state.playerId,
        name: getNickname(),
      }),
    });
    const data = await res.json();
    if (res.ok && data.status === "matched") {
      state.searchingMatch = false;
      updateMatchmakingUI();
      applyRoomJoined(data);
    }
  }

  async function cancelQuickMatchmaking() {
    state.searchingMatch = false;
    updateMatchmakingUI();
    await fetch("/api/lobby/matchmake/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: state.playerId }),
    });
  }

  /* ==========================================
     LÓGICA DEL TABLERO Y PARTIDA EN TIEMPO REAL
     ========================================== */
  function canControlColor(color) {
    if (!state.game || state.game.winner) return false;
    if (state.game.turn !== color) return false;
    if (state.myColor === "ambos") return true;
    return state.myColor === color;
  }

  function mapVisualToBoard(vi, vj) {
    // En tablero.py (partidas reales): 'negro' inicia en filas 0..2 y avanza hacia 8; 'blanco' inicia en 6..8 y avanza hacia 0.
    // En el tutorial: 'negro' inicia en filas 6..8 y 'blanco' en 0..2.
    // Cuando state.flipped === false, 'negro' debe verse ABAJO (vi = 6..8) avanzando hacia ARRIBA (vi -> 0).
    const invertMatrix = state.tutorialActive ? state.flipped : !state.flipped;
    const r = invertMatrix ? 8 - vi : vi;
    const c = invertMatrix ? 8 - vj : vj;
    return { r, c };
  }

  function renderCoordinates() {
    const cols = [];
    const rows = [];
    for (let i = 0; i < 9; i++) {
      const { c } = mapVisualToBoard(0, i);
      const { r } = mapVisualToBoard(i, 0);
      cols.push(`<span>${9 - c} <small>(${c})</small></span>`);
      rows.push(`<span>${KANJI_NUMS[r]}<small>${r}</small></span>`);
    }
    colCoordsEl.innerHTML = cols.join("");
    rowCoordsEl.innerHTML = rows.join("");
  }

  function createKomaHTML(piece, pointsDown) {
    const dirClass = pointsDown ? "points-down" : "";
    const promoClass = piece.promoted ? "promoted" : "";
    const codeLabel = piece.display_code || piece.code;
    const subLabel = (window.i18n && window.i18n.getPieceLabel)
      ? window.i18n.getPieceLabel(piece.code, piece.promoted)
      : piece.es;
    return `
      <div class="koma-tile ${dirClass} ${promoClass}">
        <div class="koma-top-row">
          <span class="koma-kanji" lang="ja">${piece.kanji}</span>
          <span class="koma-code">${codeLabel}</span>
        </div>
        <span class="koma-sub">${subLabel}</span>
      </div>
    `;
  }

  function renderBoard() {
    renderCoordinates();
    if (!state.game) {
      boardEl.innerHTML = "";
      return;
    }

    const board = state.game.board;
    const lastMove = state.game.last_move;
    const inCheckColor = state.game.in_check;
    const bottomColor = state.flipped ? "blanco" : "negro";
    const fragment = document.createDocumentFragment();

    for (let vi = 0; vi < 9; vi++) {
      for (let vj = 0; vj < 9; vj++) {
        const { r, c } = mapVisualToBoard(vi, vj);
        const piece = board[r][c];

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "board-cell";
        cell.dataset.row = r;
        cell.dataset.col = c;

        if ((vi === 2 || vi === 5) && (vj === 2 || vj === 5)) {
          cell.classList.add("hoshi");
        }

        if (state.selectedCell && state.selectedCell.row === r && state.selectedCell.col === c) {
          cell.classList.add("selected");
        }

        if (lastMove) {
          const isFrom = lastMove.from && lastMove.from[0] === r && lastMove.from[1] === c;
          const isTo = lastMove.to && lastMove.to[0] === r && lastMove.to[1] === c;
          if (isFrom || isTo) {
            cell.classList.add("last-move");
          }
        }

        if (piece && piece.code === "K" && piece.color === inCheckColor) {
          cell.classList.add("king-in-check");
        }

        const legal = state.legalTargets.find((m) => m.row === r && m.col === c);
        if (legal) {
          cell.classList.add("legal-target");
          if (legal.capture) {
            cell.classList.add("legal-capture");
          }
        }

        if (state.tutorialActive && !state.tutorialCompletedStep) {
          const lesson = TUTORIAL_LESSONS[state.tutorialStep];
          if (lesson.actionType === "move" && lesson.from[0] === r && lesson.from[1] === c) {
            cell.classList.add("tutorial-origin");
          }
          if (lesson.to[0] === r && lesson.to[1] === c && (state.selectedCell || state.selectedDrop)) {
            cell.classList.add("tutorial-target");
          }
        }

        if (piece) {
          // El jugador ubicado abajo (bottomColor) siempre apunta hacia arriba (hacia el rival); el de arriba apunta hacia abajo
          const pointsDown = piece.color !== bottomColor;
          cell.innerHTML = createKomaHTML(piece, pointsDown);
          cell.setAttribute(
            "aria-label",
            `Fila ${r}, Columna ${c}: ${piece.es} (${piece.display_code}) de ${piece.color}`
          );
        } else {
          cell.setAttribute("aria-label", `Fila ${r}, Columna ${c}: casilla vacía`);
        }

        cell.addEventListener("click", () => onCellClick(r, c));
        fragment.appendChild(cell);
      }
    }

    boardEl.replaceChildren(fragment);
  }

  function renderPlayerPanels() {
    if (!state.game) return;
    const bottomColor = state.flipped ? "blanco" : "negro";
    const topColor = state.flipped ? "negro" : "blanco";

    const updateSide = (prefix, color) => {
      const isNegro = color === "negro";
      const card = document.getElementById(`${prefix}-player-card`);
      const sym = document.getElementById(`${prefix}-player-symbol`);
      const title = document.getElementById(`${prefix}-player-title`);
      const nameEl = document.getElementById(`${prefix}-player-name`);
      const turnTag = document.getElementById(`${prefix}-turn-tag`);
      const handGrid = document.getElementById(`${prefix}-hand-grid`);

      sym.textContent = isNegro ? "☗" : "☖";
      title.textContent = isNegro ? "Sente · Negro" : "Gote · Blanco";

      const pInfo = state.game.players[color];
      const isMe = state.myColor === color;
      nameEl.textContent = `${pInfo.name}${isMe ? " (Tú)" : ""}`;

      const isTurn = !state.game.winner && state.game.turn === color;
      card.classList.toggle("active-turn", isTurn);
      turnTag.hidden = !isTurn;
      turnTag.textContent = canControlColor(color) ? "Tu turno" : "Su turno";

      const hand = state.game.captured[color] || [];
      if (hand.length === 0) {
        handGrid.innerHTML = `<p class="komadai-empty">Sin piezas capturadas</p>`;
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const item of hand) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hand-piece-btn";
        const isSelected =
          state.selectedDrop && state.selectedDrop.color === color && state.selectedDrop.code === item.code;
        if (isSelected) btn.classList.add("selected");

        if (
          state.tutorialActive &&
          !state.tutorialCompletedStep &&
          color === "negro" &&
          TUTORIAL_LESSONS[state.tutorialStep].actionType === "drop" &&
          TUTORIAL_LESSONS[state.tutorialStep].dropCode === item.code
        ) {
          btn.classList.add("tutorial-origin");
        }

        const canDrop = canControlColor(color);
        btn.disabled = !canDrop;
        btn.setAttribute("aria-label", `Reincorporar ${item.es} (${item.count} disponible)`);
        const handPointsDown = prefix === "top";
        btn.innerHTML = `
          ${createKomaHTML({ ...item, display_code: item.code, promoted: false }, handPointsDown)}
          <span class="hand-count">${item.count}</span>
        `;
        btn.addEventListener("click", () => onHandPieceClick(color, item.code));
        fragment.appendChild(btn);
      }
      handGrid.replaceChildren(fragment);
    };

    updateSide("top", topColor);
    updateSide("bottom", bottomColor);
  }

  function renderStatusAndHistory() {
    if (!state.game) return;
    roomCodeDisplay.textContent = state.roomCode || "---";

    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const roleLabels = {
      negro: isEn ? "Playing as Black ☗" : "Juegas con Negro ☗",
      blanco: isEn ? "Playing as White ☖" : "Juegas con Blanco ☖",
      ambos: isEn ? "Local Mode (Both)" : "Modo Local (Ambos)",
      espectador: isEn ? "Spectator" : "Espectador",
    };
    myRoleBadge.textContent = roleLabels[state.myColor] || (isEn ? "No room" : "Sin sala");

    const shareUrl = getInviteUrl(state.roomCode);
    inviteUrlInput.value = shareUrl;
    const waitingOpponent =
      state.game.mode === "online" &&
      (!state.game.players.negro.connected || !state.game.players.blanco.connected);
    inviteCallout.hidden = !waitingOpponent;
    btnCopyLink.hidden = state.view !== "game" || state.game.mode !== "online";

    checkAlert.hidden = !state.game.in_check;
    if (state.game.in_check) {
      const checkedName = state.game.in_check === "negro"
        ? (isEn ? "Black (Sente ☗)" : "Sente (Negro ☗)")
        : (isEn ? "White (Gote ☖)" : "Gote (Blanco ☖)");
      checkAlert.innerHTML = isEn
        ? `Check on <strong>${checkedName}'s</strong> King (<span lang="ja">王手</span>)!`
        : `¡Jaque al Rey de <strong>${checkedName}</strong> (<span lang="ja">王手</span>)!`;
    }

    if (state.game.winner) {
      turnBanner.classList.add("winner");
      turnBanner.textContent = state.game.reason || (isEn ? "Game Over." : "Partida terminada.");
    } else {
      turnBanner.classList.remove("winner");
      const turnLabel = state.game.turn === "negro"
        ? (isEn ? "Black (Sente ☗)" : "Sente (Negro ☗)")
        : (isEn ? "White (Gote ☖)" : "Gote (Blanco ☖)");
      if (waitingOpponent) {
        turnBanner.textContent = isEn
          ? `Waiting for opponent... Starting turn: ${turnLabel}`
          : `Esperando al 2.º jugador... Turno inicial: ${turnLabel}`;
      } else if (canControlColor(state.game.turn)) {
        turnBanner.textContent = isEn
          ? `Your turn — Move ${turnLabel}`
          : `Es tu turno — Mueve con ${turnLabel}`;
      } else {
        turnBanner.textContent = isEn
          ? `${turnLabel}'s turn (waiting for move...)`
          : `Turno de ${turnLabel} (esperando su jugada...)`;
      }
    }

    const moveWord = isEn ? (state.game.move_count === 1 ? "move" : "moves") : (state.game.move_count === 1 ? "jugada" : "jugadas");
    moveCounter.textContent = `${state.game.move_count} ${moveWord}`;
    const items = (state.game.history || []).map((h) => `<li>${escapeHTML(h.notation)}</li>`).join("");
    historyList.innerHTML = items || `<li>${isEn ? "No moves yet" : "Sin movimientos todavía"}</li>`;
    historyList.scrollTop = historyList.scrollHeight;

    const isSpectator = state.myColor === "espectador";
    document.getElementById("btn-reset-game").hidden = isSpectator;
    document.getElementById("btn-resign-game").hidden = isSpectator || state.tutorialActive;
  }

  function renderGameAll() {
    renderBoard();
    renderPlayerPanels();
    renderStatusAndHistory();
  }

  function clearSelection() {
    state.selectedCell = null;
    state.selectedDrop = null;
    state.legalTargets = [];
  }

  async function fetchLegalMovesForCell(row, col) {
    if (!state.roomCode) return;
    const res = await fetch(
      `/api/rooms/${state.roomCode}/legal-moves?row=${row}&col=${col}&color=${state.game.turn}`
    );
    if (!res.ok) return;
    const data = await res.json();
    state.legalTargets = data.moves || [];
    renderBoard();
  }

  async function fetchLegalDrops(color, code) {
    if (!state.roomCode) return;
    const res = await fetch(
      `/api/rooms/${state.roomCode}/legal-moves?drop=${encodeURIComponent(code)}&color=${color}`
    );
    if (!res.ok) return;
    const data = await res.json();
    state.legalTargets = data.moves || [];
    renderBoard();
  }

  function askPromotionChoice(piece, targetInfo) {
    return new Promise((resolve) => {
      if (!targetInfo.can_promote) {
        resolve(false);
        return;
      }
      if (targetInfo.must_promote) {
        resolve(true);
        return;
      }

      const promotedPreviewPiece = makeCell(piece.code, piece.color, true);
      promotePreview.innerHTML = `
        <div class="preview-koma">${createKomaHTML(piece, false)}</div>
        <span aria-hidden="true">➔</span>
        <div class="preview-koma">${createKomaHTML(promotedPreviewPiece, false)}</div>
      `;

      const onClose = () => {
        promoteDialog.removeEventListener("close", onClose);
        const choice = promoteDialog.returnValue === "yes";
        promoteDialog.returnValue = "";
        resolve(choice);
      };
      promoteDialog.addEventListener("close", onClose);
      promoteDialog.showModal();
    });
  }

  async function onCellClick(row, col) {
    if (!state.game || state.game.winner) return;

    if (state.tutorialActive) {
      await onTutorialCellClick(row, col);
      return;
    }

    const turnColor = state.game.turn;
    if (!canControlColor(turnColor)) return;

    if (state.selectedDrop) {
      const isLegalDrop = state.legalTargets.some((m) => m.row === row && m.col === col);
      if (isLegalDrop) {
        await submitDrop(state.selectedDrop.code, row, col);
        return;
      }
    }

    if (state.selectedCell) {
      const targetInfo = state.legalTargets.find((m) => m.row === row && m.col === col);
      if (targetInfo) {
        const from = [state.selectedCell.row, state.selectedCell.col];
        const movingPiece = state.game.board[from[0]][from[1]];
        const promote = await askPromotionChoice(movingPiece, targetInfo);
        await submitMove(from, [row, col], promote);
        return;
      }
    }

    const clickedPiece = state.game.board[row][col];
    if (clickedPiece && clickedPiece.color === turnColor) {
      if (state.selectedCell && state.selectedCell.row === row && state.selectedCell.col === col) {
        clearSelection();
        renderGameAll();
        return;
      }
      state.selectedDrop = null;
      state.selectedCell = { row, col };
      state.legalTargets = [];
      renderGameAll();
      await fetchLegalMovesForCell(row, col);
    } else {
      clearSelection();
      renderGameAll();
    }
  }

  async function onHandPieceClick(color, code) {
    if (state.tutorialActive) {
      onTutorialHandClick(color, code);
      return;
    }
    if (!canControlColor(color)) return;
    if (state.selectedDrop && state.selectedDrop.color === color && state.selectedDrop.code === code) {
      clearSelection();
      renderGameAll();
      return;
    }
    state.selectedCell = null;
    state.selectedDrop = { color, code };
    state.legalTargets = [];
    renderGameAll();
    await fetchLegalDrops(color, code);
  }

  async function submitMove(from, to, promote) {
    const res = await fetch(`/api/rooms/${state.roomCode}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_token: state.playerToken,
        from,
        to,
        promote,
      }),
    });
    const data = await res.json();
    if (res.ok && data.state) {
      zenAudio.playWoodClick();
      clearSelection();
      state.game = data.state;
      renderGameAll();
    }
  }

  async function submitDrop(pieceCode, row, col) {
    const res = await fetch(`/api/rooms/${state.roomCode}/drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_token: state.playerToken,
        piece: pieceCode,
        to: [row, col],
      }),
    });
    const data = await res.json();
    if (res.ok && data.state) {
      zenAudio.playWoodClick();
      clearSelection();
      state.game = data.state;
      renderGameAll();
    }
  }

  function connectRoomStream(code) {
    if (state.roomSource) {
      state.roomSource.close();
    }
    const es = new EventSource(`/api/rooms/${code}/stream`);
    state.roomSource = es;

    es.onopen = () => {
      connDot.classList.add("online");
    };

    es.onmessage = (ev) => {
      try {
        const newState = JSON.parse(ev.data);
        if (newState.replaced_by_same_ip) {
          es.close();
          connDot.classList.remove("online");
          turnBanner.textContent =
            "⚠️ Se abrió otra conexión a la sala desde tu misma IP. Esta ventana quedó desconectada.";
          return;
        }
        const turnChanged = !state.game || state.game.move_count !== newState.move_count;
        state.game = newState;
        if (turnChanged) {
          clearSelection();
        }
        renderGameAll();
      } catch (_) {}
    };

    es.onerror = () => {
      connDot.classList.remove("online");
    };
  }

  function applyRoomJoined(data) {
    state.tutorialActive = false;
    senseiPanel.hidden = true;
    if (state.lobbySource) {
      state.lobbySource.close();
      state.lobbySource = null;
    }

    state.roomCode = data.room_code;
    state.playerToken = data.player_token;
    state.myColor = data.assigned_color;
    state.game = data.state;
    state.flipped = data.assigned_color === "blanco";
    clearSelection();

    saveSession(state.roomCode, state.playerToken, state.myColor);
    const url = new URL(window.location.href);
    url.searchParams.set("room", state.roomCode);
    window.history.pushState({}, "", url.toString());

    switchView("game");
    connectRoomStream(state.roomCode);
    renderGameAll();
  }

  function returnToLobby() {
    state.tutorialActive = false;
    senseiPanel.hidden = true;
    if (state.roomSource) {
      state.roomSource.close();
      state.roomSource = null;
    }
    if (state.searchingMatch) {
      cancelQuickMatchmaking();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.pushState({}, "", url.toString());

    switchView("lobby");
    connectLobbyStream();
  }

  /* ==========================================
     MODO ACADEMIA: PARTIDA PREARMADA PASO A PASO
     ========================================== */
  function startTutorial(stepIndex = 0) {
    if (state.lobbySource) {
      state.lobbySource.close();
      state.lobbySource = null;
    }
    if (state.roomSource) {
      state.roomSource.close();
      state.roomSource = null;
    }
    state.tutorialActive = true;
    state.roomCode = "ACADEMIA";
    state.myColor = "negro";
    state.flipped = true; // En el motor de tablero.py, negro empieza en filas 0..2 o en nuestro tutorial en filas 6..8 (sin girar: filas 6..8 abajo)
    state.flipped = false;
    connDot.classList.add("online");
    switchView("game");
    senseiPanel.hidden = false;
    btnCopyLink.hidden = true;
    loadTutorialStep(stepIndex);
  }

  function loadTutorialStep(stepIndex) {
    const idx = Math.max(0, Math.min(TUTORIAL_LESSONS.length - 1, stepIndex));
    state.tutorialStep = idx;
    state.tutorialCompletedStep = false;
    clearSelection();

    const lesson = TUTORIAL_LESSONS[idx];
    const setup = lesson.setupBoard();

    state.game = {
      room_code: "ACADEMIA",
      title: lesson.title,
      mode: "tutorial",
      visibility: "private",
      status: "playing",
      turn: "negro",
      in_check: setup.in_check || null,
      winner: null,
      reason: null,
      move_count: idx,
      last_move: null,
      history: [{ notation: `Lección ${idx + 1}: ${lesson.title}` }],
      board: setup.board,
      captured: setup.captured,
      players: {
        negro: { name: `${getNickname()} (Alumno)`, connected: true },
        blanco: { name: "Sensei del Dojo ☖", connected: true },
      },
    };

    if (senseiJumpSelect && senseiJumpSelect.options.length !== TUTORIAL_LESSONS.length) {
      senseiJumpSelect.innerHTML = TUTORIAL_LESSONS.map(
        (l, i) => `<option value="${i}">${l.title}</option>`
      ).join("");
    }
    if (senseiJumpSelect) {
      senseiJumpSelect.value = String(idx);
    }

    const pct = Math.round(((idx + 1) / TUTORIAL_LESSONS.length) * 100);
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const localized = (window.i18n && window.i18n.getLessonText)
      ? window.i18n.getLessonText(idx, isEn ? "en" : "es")
      : null;
    const lessonTitle = localized ? localized.title : lesson.title;
    const lessonText = localized ? localized.text : lesson.text;
    const lessonKeyPoints = localized ? localized.keyPoints : lesson.keyPoints;
    const lessonObjective = localized ? localized.objective : lesson.objective;

    senseiStepBadge.textContent = isEn
      ? `Lesson ${idx + 1} of ${TUTORIAL_LESSONS.length}`
      : `Lección ${idx + 1} de ${TUTORIAL_LESSONS.length}`;
    senseiTitle.textContent = lessonTitle;
    senseiProgressFill.style.setProperty("--progress", `${pct}%`);
    senseiText.textContent = lessonText;
    senseiKeyPoints.innerHTML = (lessonKeyPoints || []).map((pt) => `<li>${pt}</li>`).join("");
    senseiDiagrams.innerHTML = (lesson.diagrams || []).map(renderCompassHTML).join("");
    senseiObjective.textContent = lessonObjective;
    senseiObjective.classList.remove("completed");

    btnTutPrev.disabled = idx === 0;
    btnTutNext.textContent = idx === TUTORIAL_LESSONS.length - 1
      ? (isEn ? "Finish Course & Back to Lobby" : "Finalizar curso y volver al Lobby")
      : (isEn ? "Next lesson →" : "Siguiente lección →");

    renderGameAll();
  }

  function onTutorialHandClick(color, code) {
    if (state.tutorialCompletedStep || color !== "negro") return;
    const lesson = TUTORIAL_LESSONS[state.tutorialStep];
    if (lesson.actionType !== "drop" || lesson.dropCode !== code) {
      senseiObjective.textContent = `💡 Para esta lección sigue la instrucción: ${lesson.objective}`;
      return;
    }
    state.selectedCell = null;
    state.selectedDrop = { color: "negro", code };
    state.legalTargets = [{ row: lesson.to[0], col: lesson.to[1], capture: false }];
    renderGameAll();
  }

  async function onTutorialCellClick(row, col) {
    if (state.tutorialCompletedStep) return;
    const lesson = TUTORIAL_LESSONS[state.tutorialStep];

    // Caso 1: La lección es una reincorporación (Drop)
    if (lesson.actionType === "drop") {
      if (state.selectedDrop && row === lesson.to[0] && col === lesson.to[1]) {
        const meta = PIECE_CATALOG[lesson.dropCode];
        state.game.board[row][col] = makeCell(lesson.dropCode, "negro", false);
        state.game.captured.negro = [];
        state.game.last_move = { from: null, to: [row, col] };
        state.game.move_count += 1;
        state.game.history.push({
          notation: `${state.game.move_count}. ☗ ${lesson.dropCode}* → (${row},${col})`,
        });
        if (state.tutorialStep === TUTORIAL_LESSONS.length - 1) {
          state.game.in_check = "blanco";
          state.game.winner = "negro";
          state.game.reason = "¡Jaque Mate (Atama-kin)! Has completado la Academia de Shōgi.";
        }
        completeTutorialLesson(lesson);
        return;
      }
      senseiObjective.textContent = `💡 Primero haz clic en la pieza ${lesson.dropCode} (${PIECE_CATALOG[lesson.dropCode].es}) de tu reserva inferior y luego en la casilla iluminada (${lesson.to[0]}, ${lesson.to[1]}).`;
      return;
    }

    // Caso 2: La lección es un movimiento en el tablero
    if (
      state.selectedCell &&
      state.selectedCell.row === lesson.from[0] &&
      state.selectedCell.col === lesson.from[1] &&
      row === lesson.to[0] &&
      col === lesson.to[1]
    ) {
      const movingPiece = state.game.board[lesson.from[0]][lesson.from[1]];
      const targetPiece = state.game.board[row][col];
      let promote = false;

      if (lesson.canPromote) {
        promote = await askPromotionChoice(movingPiece, {
          can_promote: true,
          must_promote: false,
        });
        if (lesson.requirePromote && !promote) {
          senseiObjective.textContent =
            "💡 En esta lección queremos practicar la promoción: vuelve a mover la pieza y elige 'Promocionar (+)'.";
          clearSelection();
          renderGameAll();
          return;
        }
      }

      if (targetPiece) {
        const capMeta = PIECE_CATALOG[targetPiece.code];
        state.game.captured.negro.push({
          code: targetPiece.code,
          count: 1,
          kanji: capMeta.kanji_negro,
          es: capMeta.es,
          romaji: capMeta.romaji,
        });
      }

      state.game.board[row][col] = makeCell(movingPiece.code, "negro", promote || movingPiece.promoted);
      state.game.board[lesson.from[0]][lesson.from[1]] = null;
      state.game.last_move = { from: lesson.from, to: [row, col] };
      state.game.move_count += 1;
      state.game.history.push({
        notation: `${state.game.move_count}. ☗ ${movingPiece.code} (${lesson.from[0]},${lesson.from[1]}) → (${row},${col})${promote ? "+" : ""}`,
      });

      completeTutorialLesson(lesson);
      return;
    }

    // Seleccionar la pieza origen de la lección
    if (row === lesson.from[0] && col === lesson.from[1]) {
      state.selectedDrop = null;
      state.selectedCell = { row, col };
      state.legalTargets = lesson.extraPreviewTargets
        ? lesson.extraPreviewTargets
        : [
            {
              row: lesson.to[0],
              col: lesson.to[1],
              capture: state.game.board[lesson.to[0]][lesson.to[1]] !== null,
              can_promote: Boolean(lesson.canPromote),
            },
          ];
      renderGameAll();
    } else if (
      state.selectedCell &&
      state.selectedCell.row === lesson.from[0] &&
      state.selectedCell.col === lesson.from[1] &&
      lesson.extraPreviewTargets &&
      lesson.extraPreviewTargets.some((t) => t.row === row && t.col === col)
    ) {
      senseiObjective.textContent = `💡 ¡Bien visto! Esa casilla (${row}, ${col}) también es un movimiento legal de esta pieza, pero para completar el ejercicio del Sensei muévela a la casilla verde (${lesson.to[0]}, ${lesson.to[1]}).`;
    } else {
      senseiObjective.textContent = `💡 Selecciona la pieza iluminada en la fila ${lesson.from[0]}, columna ${lesson.from[1]} para realizar la jugada de esta lección.`;
    }
  }

  function completeTutorialLesson(lesson) {
    zenAudio.playWoodClick();
    state.tutorialCompletedStep = true;
    const givesCheckToBlanco = [5, 8, 11].includes(state.tutorialStep);
    state.game.in_check = givesCheckToBlanco ? "blanco" : null;
    clearSelection();
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const localized = (window.i18n && window.i18n.getLessonText)
      ? window.i18n.getLessonText(state.tutorialStep, isEn ? "en" : "es")
      : null;
    const successText = localized ? localized.afterSuccessText : lesson.afterSuccessText;
    senseiObjective.textContent = `✅ ${successText}`;
    senseiObjective.classList.add("completed");
    renderGameAll();

    if (lesson.opponentReply) {
      setTimeout(() => {
        if (!state.tutorialActive) return;
        const { from, to, notation } = lesson.opponentReply;
        const oppPiece = state.game.board[from[0]][from[1]];
        if (oppPiece) {
          state.game.board[to[0]][to[1]] = oppPiece;
          state.game.board[from[0]][from[1]] = null;
          state.game.last_move = { from, to };
          state.game.history.push({ notation });
          renderGameAll();
        }
      }, 650);
    }
  }

  async function createNewRoom(customOptions = null) {
    lobbyError.hidden = true;
    const modeRadio = document.querySelector('input[name="game-mode"]:checked');
    const colorRadio = document.querySelector('input[name="creator-color"]:checked');
    const titleInput = document.getElementById("room-title-create");

    const rawMode = customOptions?.rawMode || (modeRadio ? modeRadio.value : "online-public");
    const mode = rawMode === "local" ? "local" : rawMode === "ai" ? "ai" : "online";
    const visibility = rawMode === "online-private" || mode !== "online" ? "private" : "public";
    const color = customOptions?.color || (colorRadio ? colorRadio.value : "negro");
    const name = getNickname();
    const title = customOptions?.title || titleInput.value.trim() || `Dojo de ${name}`;

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, visibility, color, name, title }),
    });
    const data = await res.json();
    if (res.ok) {
      applyRoomJoined(data);
      if (lobbyDialog.open) lobbyDialog.close();
    } else {
      lobbyError.textContent = data.error || "Error al crear la sala.";
      lobbyError.hidden = false;
    }
  }

  async function joinRoomByCode(code, name = "", existingToken = null, spectate = false) {
    directJoinError.hidden = true;
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) {
      directJoinError.textContent = "Introduce un código de 6 caracteres.";
      directJoinError.hidden = false;
      return false;
    }

    const res = await fetch(`/api/rooms/${cleanCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || getNickname(),
        player_token: existingToken,
        spectate,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      applyRoomJoined(data);
      if (lobbyDialog.open) lobbyDialog.close();
      return true;
    } else {
      directJoinError.textContent = data.error || "No se encontró la sala.";
      directJoinError.hidden = false;
      return false;
    }
  }

  async function copyInviteLink(btn) {
    if (!state.roomCode) return;
    const url = getInviteUrl(state.roomCode);
    try {
      await navigator.clipboard.writeText(url);
      const original = btn.textContent;
      btn.textContent = "¡Enlace copiado!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1800);
    } catch (_) {
      inviteUrlInput.select();
    }
  }

  // Eventos de UI
  lobbyNicknameInput.value = state.nickname;
  lobbyNicknameInput.addEventListener("change", () => {
    getNickname();
    if (state.view === "lobby") {
      connectLobbyStream();
    }
  });

  btnQuickMatch.addEventListener("click", startQuickMatchmaking);
  btnCancelMatch.addEventListener("click", cancelQuickMatchmaking);

  const btnPlayAiQuick = document.getElementById("btn-play-ai-quick");
  if (btnPlayAiQuick) {
    btnPlayAiQuick.addEventListener("click", () => {
      createNewRoom({ rawMode: "ai", color: "negro", title: "Partida contra Sensei Bot" });
    });
  }

  document.getElementById("btn-create-public-quick").addEventListener("click", () => {
    createNewRoom({ rawMode: "online-public", color: "negro" });
  });

  document.getElementById("btn-direct-join").addEventListener("click", () => {
    joinRoomByCode(directCodeInput.value, getNickname());
  });

  directCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      joinRoomByCode(directCodeInput.value, getNickname());
    }
  });

  btnBackLobby.addEventListener("click", returnToLobby);

  document.getElementById("btn-start-tutorial-top").addEventListener("click", () => startTutorial(0));
  document.getElementById("btn-start-tutorial-hero").addEventListener("click", () => startTutorial(0));
  for (const pill of document.querySelectorAll(".chapter-pill")) {
    pill.addEventListener("click", () => {
      const step = Number(pill.dataset.step || 0);
      startTutorial(step);
    });
  }

  if (senseiJumpSelect) {
    senseiJumpSelect.addEventListener("change", (e) => {
      loadTutorialStep(Number(e.target.value || 0));
    });
  }

  btnTutPrev.addEventListener("click", () => {
    if (state.tutorialStep > 0) {
      loadTutorialStep(state.tutorialStep - 1);
    }
  });

  btnTutRetry.addEventListener("click", () => {
    loadTutorialStep(state.tutorialStep);
  });

  btnTutNext.addEventListener("click", () => {
    if (state.tutorialStep < TUTORIAL_LESSONS.length - 1) {
      loadTutorialStep(state.tutorialStep + 1);
    } else {
      returnToLobby();
    }
  });

  document.getElementById("btn-open-create-modal").addEventListener("click", () => {
    lobbyError.hidden = true;
    lobbyDialog.showModal();
  });

  document.getElementById("btn-open-rules").addEventListener("click", () => {
    rulesDialog.showModal();
  });

  function buildBugContextString() {
    if (state.view === "lobby") {
      return `Vista: Lobby | Jugador: ${getNickname()}`;
    }
    if (state.tutorialActive) {
      const lesson = TUTORIAL_LESSONS[state.tutorialStep];
      return `Vista: Academia (Lección ${state.tutorialStep + 1}/12: ${lesson ? lesson.title : ""})`;
    }
    if (state.game) {
      const lastNotation =
        state.game.history && state.game.history.length > 0
          ? state.game.history[state.game.history.length - 1].notation
          : "Sin jugadas";
      return `Sala: ${state.roomCode} (${state.game.mode}) | Turno: ${state.game.turn} | Jugada #${state.game.move_count} (${lastNotation})`;
    }
    return "Vista: General";
  }

  function updateExternalBugLinks() {
    const cat = bugCategory.value;
    const ctx = bugContext.value;
    const desc = bugDescription.value.trim() || "(Describe el error aquí)";
    const title = encodeURIComponent(`[Bug - ${cat}] Reporte desde Shōgi Dojo Online`);
    const body = encodeURIComponent(
      `Categoría: ${cat}\nContexto: ${ctx}\nJugador: ${getNickname()}\n\nDescripción:\n${desc}`
    );
    linkGithubIssue.href = `https://github.com/valdivieso01/shogi-web/issues/new?title=${title}&body=${body}`;
    linkMailtoBug.href = `mailto:hjavier.valdivieso@outlook.es?subject=${title}&body=${body}`;
  }

  function openBugReportDialog() {
    bugError.hidden = true;
    bugSuccess.hidden = true;
    bugContext.value = buildBugContextString();
    if (state.tutorialActive) {
      bugCategory.value = "Tutorial / Academia";
    } else if (state.view === "game") {
      bugCategory.value = "Regla de Shogi / Movimiento";
    }
    updateExternalBugLinks();
    bugDialog.showModal();
  }

  document.getElementById("btn-open-bug-report").addEventListener("click", openBugReportDialog);
  const btnBugFooter = document.getElementById("btn-open-bug-footer");
  if (btnBugFooter) {
    btnBugFooter.addEventListener("click", openBugReportDialog);
  }

  bugCategory.addEventListener("change", updateExternalBugLinks);
  bugDescription.addEventListener("input", updateExternalBugLinks);

  bugForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    bugError.hidden = true;
    bugSuccess.hidden = true;

    const description = bugDescription.value.trim();
    if (description.length < 5) {
      bugError.textContent = "Por favor describe el error con al menos 5 caracteres.";
      bugError.hidden = false;
      return;
    }

    const res = await fetch("/api/bug-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: bugCategory.value,
        context: bugContext.value,
        description,
        contact: bugContact.value.trim(),
        player_name: getNickname(),
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      bugDescription.value = "";
      bugSuccess.textContent = `✅ ¡Reporte #${data.report_id} enviado y guardado correctamente! Gracias por ayudarnos a mejorar el Dojo.`;
      bugSuccess.hidden = false;
    } else {
      bugError.textContent = data.error || "No se pudo enviar el reporte.";
      bugError.hidden = false;
    }
  });

  btnFlipBoard.addEventListener("click", () => {
    state.flipped = !state.flipped;
    renderGameAll();
  });

  // Controles de Música Relajante Zen
  const btnToggleMusic = document.getElementById("btn-toggle-music");
  const musicVolumeInput = document.getElementById("music-volume");
  const audioPill = btnToggleMusic ? btnToggleMusic.closest(".audio-control-pill") : null;

  function syncAudioUI() {
    if (!btnToggleMusic) return;
    const active = zenAudio.isPlaying();
    btnToggleMusic.setAttribute("aria-pressed", active ? "true" : "false");
    btnToggleMusic.textContent = active ? "🎵 Música: ON" : "🎵 Música: OFF";
    if (audioPill) {
      audioPill.classList.toggle("playing", active);
    }
  }

  if (musicVolumeInput) {
    musicVolumeInput.value = String(zenAudio.getVolumePercent());
    musicVolumeInput.addEventListener("input", (e) => {
      zenAudio.setVolume(e.target.value);
    });
  }

  if (btnToggleMusic) {
    btnToggleMusic.addEventListener("click", () => {
      zenAudio.toggle();
      syncAudioUI();
    });
  }

  document.getElementById("btn-create-room").addEventListener("click", () => createNewRoom());

  btnCopyLink.addEventListener("click", () => copyInviteLink(btnCopyLink));
  btnCopyInline.addEventListener("click", () => copyInviteLink(btnCopyInline));

  promoteDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
  });

  document.getElementById("btn-reset-game").addEventListener("click", async () => {
    if (state.tutorialActive) {
      loadTutorialStep(state.tutorialStep);
      return;
    }
    if (!state.roomCode) return;
    const res = await fetch(`/api/rooms/${state.roomCode}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_token: state.playerToken }),
    });
    const data = await res.json();
    if (res.ok && data.state) {
      clearSelection();
      state.game = data.state;
      renderGameAll();
    }
  });

  document.getElementById("btn-resign-game").addEventListener("click", async () => {
    if (!state.roomCode || !state.game || state.game.winner) return;
    await fetch(`/api/rooms/${state.roomCode}/resign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_token: state.playerToken }),
    });
  });

  for (const radio of document.querySelectorAll('input[name="game-mode"]')) {
    radio.addEventListener("change", (e) => {
      document.getElementById("color-choice-group").hidden =
        e.target.value === "local" || e.target.value === "ai";
    });
  }

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const saved = loadSession(roomParam.toUpperCase());
      joinRoomByCode(roomParam, getNickname(), saved ? saved.token : null);
    } else {
      returnToLobby();
    }
  });

  window.addEventListener("shogi:langchange", () => {
    if (state.view === "game") {
      renderGameAll();
      if (state.tutorialActive) {
        loadTutorialStep(state.tutorialStep);
      }
    } else if (state.view === "lobby" && state.lobbyData) {
      renderLobby(state.lobbyData);
    }
  });

  // Inicialización: si hay ?room=CODIGO entra a la partida; si no, abre el Lobby de Matchmaking
  async function init() {
    renderCoordinates();
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const saved = loadSession(roomParam.toUpperCase());
      const joined = await joinRoomByCode(roomParam, getNickname(), saved ? saved.token : null);
      if (joined) return;
    }
    switchView("lobby");
    connectLobbyStream();
  }

  init();
})();
