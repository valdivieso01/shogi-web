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

    authToken: localStorage.getItem("shogi_auth_token") || null,
    authUser: null,
    googleClientId: null,

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

  // Auth y Ranking
  const btnGoogleLogin = document.getElementById("btn-google-login");
  const userProfileWidget = document.getElementById("user-profile-widget");
  const userAvatarTop = document.getElementById("user-avatar-top");
  const userNameTop = document.getElementById("user-name-top");
  const userRatingTop = document.getElementById("user-rating-top");
  const btnLogout = document.getElementById("btn-logout");
  const leaderboardTbody = document.getElementById("leaderboard-tbody");
  const recentMatchesList = document.getElementById("recent-matches-list");

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

  const { PIECE_CATALOG, makeCell, makeStandardTutorialBoard } = window.ShogiTutorialData;

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

  const { TUTORIAL_LESSONS } = window.ShogiTutorialData;

  function getNickname() {
    if (state.authUser && state.authUser.name) {
      return state.authUser.name;
    }
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

  function saveSession(code, token, color, meta = {}) {
    try {
      sessionStorage.setItem(`shogi_room_${code}`, JSON.stringify({ token, color }));
      if (code && code !== "ACADEMIA" && color !== "espectador") {
        localStorage.setItem(
          "shogi_active_match",
          JSON.stringify({
            roomCode: code,
            token,
            color,
            mode: meta.mode || (state.game && state.game.mode) || "ai",
            storyChapter: meta.storyChapter || (state.game && state.game.story_chapter) || null,
            rivalName:
              meta.rivalName ||
              (state.game && state.game.players && state.game.players.blanco && state.game.players.blanco.name) ||
              "Sensei Bot",
            moveCount: meta.moveCount ?? ((state.game && state.game.move_count) || 0),
            savedAt: Date.now(),
          })
        );
      }
    } catch (_) {}
  }

  function clearActiveMatchStorage() {
    try {
      localStorage.removeItem("shogi_active_match");
    } catch (_) {}
  }

  function getActiveMatchStorage() {
    try {
      const raw = localStorage.getItem("shogi_active_match");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Expire after 30 minutes (matching server ROOM_IDLE_TTL_SECONDS)
      if (!parsed || !parsed.roomCode || Date.now() - (parsed.savedAt || 0) > 30 * 60 * 1000) {
        localStorage.removeItem("shogi_active_match");
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function renderResumeMatchBanner() {
    const card = document.getElementById("resume-match-card");
    const tagEl = document.getElementById("resume-match-tag");
    const codeEl = document.getElementById("resume-match-code");
    const descEl = document.getElementById("resume-match-desc");
    if (!card) return;

    const active = getActiveMatchStorage();
    if (!active) {
      card.hidden = true;
      return;
    }
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    card.hidden = false;
    codeEl.textContent = active.roomCode;
    if (active.storyChapter) {
      tagEl.textContent = isEn ? `STORY CH. ${active.storyChapter} PAUSED` : `MODO HISTORIA CAP. ${active.storyChapter}`;
      descEl.textContent = isEn
        ? `Battle in progress vs ${active.rivalName} (${active.moveCount} moves).`
        : `Duelo en curso contra ${active.rivalName} (${active.moveCount} jugadas).`;
    } else if (active.mode === "online") {
      tagEl.textContent = isEn ? "ONLINE MATCH (5 MIN WINDOW)" : "PARTIDA ONLINE (5 MIN PARA VOLVER)";
      descEl.textContent = isEn
        ? `Your online room #${active.roomCode} is holding your seat for 5 minutes.`
        : `Tu sala online #${active.roomCode} guarda tu asiento durante 5 minutos.`;
    } else {
      tagEl.textContent = isEn ? "MATCH IN PROGRESS" : "PARTIDA EN PAUSA";
      descEl.textContent = isEn
        ? `Practice match vs ${active.rivalName} ready to resume.`
        : `Partida en curso contra ${active.rivalName} lista para continuar.`;
    }
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
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    matchmakeStatusText.textContent = state.searchingMatch
      ? (isEn
          ? "Searching for an opponent in the Dojo... As soon as another player joins, the match begins automatically."
          : "Buscando oponente en el Dojo... En cuanto otro jugador pulse Buscar Rival, la partida iniciará automáticamente.")
      : (isEn
          ? "Find another player in queue and start an online real-time match instantly with automatic side assignment."
          : "Busca a otro jugador en cola y comienza una partida automáticamente con asignación de bandos.");
  }

  function renderLobby() {
    if (!state.lobbyData) return;
    const { open_rooms = [], live_rooms = [], queue_count = 0, online_players = [] } = state.lobbyData;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";

    onlineCountLabel.textContent = isEn
      ? `${online_players.length} in the lobby`
      : `${online_players.length} en el lobby`;
    queueCountBadge.textContent = isEn
      ? `${queue_count} searching rival`
      : `${queue_count} buscando rival`;
    updateMatchmakingUI();

    // 1. Salas Abiertas Esperando Rival
    if (open_rooms.length === 0) {
      openRoomsList.innerHTML = `<p class="empty-state">${
        isEn
          ? 'No public rooms waiting for players. Create a room or click "Find Opponent Now"!'
          : 'No hay salas públicas esperando jugador. ¡Crea una sala o pulsa "Buscar Rival Ahora"!'
      }</p>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const r of open_rooms) {
        const row = document.createElement("div");
        row.className = "room-row";
        const hostSide = isEn
          ? (r.players.negro.connected
              ? `☗ Black: ${escapeHTML(r.players.negro.name)}`
              : `☖ White: ${escapeHTML(r.players.blanco.name)}`)
          : (r.players.negro.connected
              ? `☗ Negro: ${escapeHTML(r.players.negro.name)}`
              : `☖ Blanco: ${escapeHTML(r.players.blanco.name)}`);
        const freeSide = isEn
          ? (r.open_seat === "negro" ? "Open: ☗ Black" : "Open: ☖ White")
          : (r.open_seat === "negro" ? "Libre: ☗ Negro" : "Libre: ☖ Blanco");
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
          <button type="button" class="btn btn-primary">${isEn ? "Join & Play" : "Unirse y Jugar"}</button>
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
      liveRoomsList.innerHTML = `<p class="empty-state">${
        isEn
          ? "No active matches right now."
          : "No hay partidas en curso en este momento."
      }</p>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const r of live_rooms) {
        const row = document.createElement("div");
        row.className = "room-row";
        const turnLabel = isEn
          ? (r.turn === "negro" ? "☗ Black" : "☖ White")
          : (r.turn === "negro" ? "☗ Negro" : "☖ Blanco");
        const moveLabel = isEn ? "Move" : "Jugada";
        const turnText = isEn ? "Turn:" : "Turno:";
        row.innerHTML = `
          <div class="room-row-info">
            <div class="room-row-title">
              <span>☗ ${escapeHTML(r.players.negro.name)} vs ☖ ${escapeHTML(r.players.blanco.name)}</span>
              <code>${escapeHTML(r.room_code)}</code>
            </div>
            <div class="room-row-players">
              <span>${moveLabel} #${Number(r.move_count) || 0} · ${turnText} ${turnLabel}</span>
            </div>
          </div>
          <button type="button" class="btn">${isEn ? "Spectate" : "Ver partida"}</button>
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
      onlinePlayersList.innerHTML = `<li class="player-chip">${isEn ? "Connecting to lobby..." : "Conectando al lobby..."}</li>`;
    } else {
      onlinePlayersList.innerHTML = online_players
        .map((p) => {
          const isMe = p.player_id === state.playerId;
          const searching = p.status === "searching";
          const youLabel = isEn ? " (You)" : " (Tú)";
          const searchLabel = isEn ? " · Searching rival..." : " · Buscando rival...";
          return `
            <li class="player-chip ${searching ? "searching" : ""}">
              <span class="status-dot online" aria-hidden="true"></span>
              <span>${escapeHTML(p.name)}${isMe ? youLabel : ""}${searching ? searchLabel : ""}</span>
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
        auth_token: state.authToken,
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
    const isEn = window.i18n && window.i18n.getLanguage() === "en";

    const updateSide = (prefix, color) => {
      const isNegro = color === "negro";
      const card = document.getElementById(`${prefix}-player-card`);
      const sym = document.getElementById(`${prefix}-player-symbol`);
      const title = document.getElementById(`${prefix}-player-title`);
      const nameEl = document.getElementById(`${prefix}-player-name`);
      const turnTag = document.getElementById(`${prefix}-turn-tag`);
      const handGrid = document.getElementById(`${prefix}-hand-grid`);
      const avatarImg = document.getElementById(`${prefix}-player-avatar`);
      const komaFallback = document.getElementById(`${prefix}-player-koma-fallback`);
      const badgesEl = document.getElementById(`${prefix}-player-badges`);

      sym.textContent = isNegro ? "☗" : "☖";
      title.textContent = isNegro
        ? (isEn ? "Sente · Black (Moves 1st)" : "Sente · Negro (Mueve 1.º)")
        : (isEn ? "Gote · White (Moves 2nd)" : "Gote · Blanco (Mueve 2.º)");

      const pInfo = state.game.players[color] || { name: "Esperando...", connected: false };
      const isMe = state.myColor === color;
      nameEl.textContent = pInfo.name;

      // Resolver foto / retrato del jugador de este lado
      let pictureUrl = pInfo.picture || "";
      let ratingVal = pInfo.rating || null;
      let isRegistered = Boolean(pInfo.is_registered);

      // Si soy yo y tengo sesión de Google activa en el cliente
      if (isMe && state.authUser) {
        if (!pictureUrl && state.authUser.picture) pictureUrl = state.authUser.picture;
        if (!ratingVal && state.authUser.rating) ratingVal = state.authUser.rating;
        isRegistered = true;
      }

      // Si es Modo Historia y es el rival Gote
      if (color === "blanco" && state.game.story_chapter) {
        const storyBoss = STORY_BOSSES.find((b) => b.chapter === Number(state.game.story_chapter));
        if (storyBoss) {
          pictureUrl = storyBoss.portrait;
          ratingVal = storyBoss.elo;
        }
      }

      if (avatarImg && komaFallback) {
        if (pictureUrl) {
          avatarImg.src = pictureUrl;
          avatarImg.alt = pInfo.name;
          avatarImg.hidden = false;
          komaFallback.hidden = true;
          avatarImg.onerror = () => {
            avatarImg.hidden = true;
            komaFallback.hidden = false;
          };
        } else {
          avatarImg.hidden = true;
          komaFallback.hidden = false;
          komaFallback.textContent = isNegro ? "王" : "玉";
          komaFallback.classList.toggle("points-down", prefix === "top");
        }
      }

      if (badgesEl) {
        const pills = [];
        if (isMe) {
          pills.push(`<span class="p-meta-pill is-you">${isEn ? "You" : "Tú"}</span>`);
        }
        if (state.game.story_chapter && color === "blanco") {
          pills.push(`<span class="p-meta-pill is-elo">${isEn ? "Ch." : "Cap."} ${state.game.story_chapter}</span>`);
        } else if (state.tutorialActive) {
          pills.push(`<span class="p-meta-pill is-verified">${color === "negro" ? (isEn ? "Student" : "Alumno") : "Sensei"}</span>`);
        } else if (pInfo.is_bot || (state.game.mode === "ai" && color === "blanco")) {
          pills.push(`<span class="p-meta-pill">${isEn ? "Dojo AI" : "IA del Dojo"}</span>`);
        } else if (isRegistered) {
          pills.push(`<span class="p-meta-pill is-verified">${isEn ? "Registered" : "Registrado"}</span>`);
        } else if (pInfo.connected) {
          pills.push(`<span class="p-meta-pill">${isEn ? "Guest" : "Invitado"}</span>`);
        }
        if (ratingVal) {
          pills.push(`<span class="p-meta-pill is-elo">${ratingVal} ELO</span>`);
        }
        if (state.game.mode === "online" && !state.game.winner && pInfo.disconnected_at) {
          const leftSec = Math.max(
            0,
            Math.ceil(300 - (Date.now() / 1000 - Number(pInfo.disconnected_at)))
          );
          const mm = String(Math.floor(leftSec / 60)).padStart(2, "0");
          const ss = String(leftSec % 60).padStart(2, "0");
          pills.push(
            `<span class="p-meta-pill is-disconnected">⏳ ${
              isEn ? `Reconnecting (${mm}:${ss})` : `Desconectado (${mm}:${ss})`
            }</span>`
          );
        }
        badgesEl.innerHTML = pills.join("");
      }

      const isTurn = !state.game.winner && state.game.turn === color;
      card.classList.toggle("active-turn", isTurn);
      turnTag.hidden = !isTurn;
      turnTag.textContent = canControlColor(color)
        ? (isEn ? "Your turn" : "Tu turno")
        : (isEn ? "Their turn" : "Su turno");

      const hand = state.game.captured[color] || [];
      if (hand.length === 0) {
        handGrid.innerHTML = `<p class="komadai-empty">${isEn ? "No captured pieces" : "Sin piezas capturadas"}</p>`;
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
      state.game.mode === "online" && state.game.status === "waiting";
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

    const oppColor = state.myColor === "blanco" ? "negro" : "blanco";
    const oppInfo = state.game.players && state.game.players[oppColor];
    const oppDisconnected =
      state.game.mode === "online" &&
      state.game.status === "playing" &&
      !state.game.winner &&
      oppInfo &&
      oppInfo.disconnected_at;

    if (state.game.winner) {
      clearActiveMatchStorage();
      turnBanner.classList.remove("is-thinking");
      turnBanner.classList.add("winner");
      turnBanner.textContent = state.game.reason || (isEn ? "Game Over." : "Partida terminada.");
    } else if (oppDisconnected) {
      turnBanner.classList.remove("winner");
      turnBanner.classList.add("is-thinking");
      const leftSec = Math.max(
        0,
        Math.ceil(300 - (Date.now() / 1000 - Number(oppInfo.disconnected_at)))
      );
      const mm = String(Math.floor(leftSec / 60)).padStart(2, "0");
      const ss = String(leftSec % 60).padStart(2, "0");
      const msg = isEn
        ? `⏳ Opponent disconnected — Victory by forfeit in ${mm}:${ss} if they don't return.`
        : `⏳ Rival desconectado — Victoria por abandono en ${mm}:${ss} si no reconecta.`;
      turnBanner.innerHTML = `<span class="thinking-spinner" aria-hidden="true"></span><span>${escapeHTML(msg)}</span>`;
    } else if (state.busyAction) {
      turnBanner.classList.remove("winner");
      turnBanner.classList.add("is-thinking");
      const rivalName = (state.game.players.blanco && state.game.players.blanco.name) || "Sensei Bot";
      const busyLabel = state.busyMessage || (
        state.game.mode === "ai" && state.game.turn === "blanco"
          ? (isEn ? `${rivalName} is thinking...` : `${rivalName} está pensando su jugada...`)
          : (isEn ? "Processing move..." : "Ejecutando jugada...")
      );
      turnBanner.innerHTML = `<span class="thinking-spinner" aria-hidden="true"></span><span>${escapeHTML(busyLabel)}</span>`;
    } else {
      turnBanner.classList.remove("winner", "is-thinking");
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
    renderStoryHud();
  }

  function clearSelection() {
    state.selectedCell = null;
    state.selectedDrop = null;
    state.legalTargets = [];
  }

  async function ensureRoomSyncedOnServer() {
    if (!state.roomCode || !state.game || state.tutorialActive) return false;
    try {
      const res = await fetch(`/api/rooms/${state.roomCode}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_token: state.playerToken,
          auth_token: state.authToken,
          state: state.game,
        }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function fetchLegalMovesForCell(row, col) {
    if (!state.roomCode || !state.game) return;
    // 1. Instant zero-network lookup from pre-calculated legal_moves map
    if (state.game.legal_moves && typeof state.game.legal_moves === "object") {
      state.legalTargets = state.game.legal_moves[`${row},${col}`] || [];
      renderBoard();
      return;
    }
    let res = await fetch(
      `/api/rooms/${state.roomCode}/legal-moves?row=${row}&col=${col}&color=${state.game.turn}`
    );
    if (res.status === 404) {
      const synced = await ensureRoomSyncedOnServer();
      if (synced) {
        res = await fetch(
          `/api/rooms/${state.roomCode}/legal-moves?row=${row}&col=${col}&color=${state.game.turn}`
        );
      }
    }
    if (!res.ok) return;
    const data = await res.json();
    state.legalTargets = data.moves || [];
    renderBoard();
  }

  async function fetchLegalDrops(color, code) {
    if (!state.roomCode || !state.game) return;
    // 1. Instant zero-network lookup from pre-calculated legal_drops map
    if (state.game.legal_drops && typeof state.game.legal_drops === "object") {
      state.legalTargets = state.game.legal_drops[code] || [];
      renderBoard();
      return;
    }
    let res = await fetch(
      `/api/rooms/${state.roomCode}/legal-moves?drop=${encodeURIComponent(code)}&color=${color}`
    );
    if (res.status === 404) {
      const synced = await ensureRoomSyncedOnServer();
      if (synced) {
        res = await fetch(
          `/api/rooms/${state.roomCode}/legal-moves?drop=${encodeURIComponent(code)}&color=${color}`
        );
      }
    }
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
    if (!state.game || state.game.winner || state.busyAction) return;

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
    if (state.busyAction) return;
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

  function setBusyState(isBusy, msg = "") {
    state.busyAction = isBusy;
    state.busyMessage = msg;
    if (boardEl) {
      boardEl.classList.toggle("is-busy", Boolean(isBusy));
    }
    renderStatusAndHistory();
    renderPlayerPanels();
  }

  async function triggerPendingAiMove() {
    if (!state.roomCode || !state.game || state.game.winner) return;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const rivalName = (state.game.players.blanco && state.game.players.blanco.name) || "Sensei Bot";
    setBusyState(
      true,
      isEn ? `${rivalName} is thinking its move...` : `${rivalName} está calculando su respuesta...`
    );
    try {
      const res = await fetch(`/api/rooms/${state.roomCode}/ai-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_token: state.playerToken,
          auth_token: state.authToken,
          client_state: state.game,
        }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        zenAudio.playWoodClick();
        state.game = data.state;
      }
    } finally {
      setBusyState(false, "");
      renderGameAll();
    }
  }

  async function submitMove(from, to, promote) {
    if (state.busyAction) return;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    setBusyState(true, isEn ? "Sending move..." : "Ejecutando tu jugada...");
    try {
      const payload = JSON.stringify({
        player_token: state.playerToken,
        auth_token: state.authToken,
        from,
        to,
        promote,
        defer_ai: true,
        client_state: state.game,
      });
      const res = await fetch(`/api/rooms/${state.roomCode}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await res.json();
      if (res.ok && data.state) {
        zenAudio.playWoodClick();
        clearSelection();
        state.game = data.state;
        setBusyState(false, "");
        renderGameAll();
        if (data.ai_pending) {
          await triggerPendingAiMove();
        }
        return;
      }
    } finally {
      setBusyState(false, "");
      renderGameAll();
    }
  }

  async function submitDrop(pieceCode, row, col) {
    if (state.busyAction) return;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    setBusyState(true, isEn ? "Dropping piece..." : "Reincorporando pieza en el tablero...");
    try {
      const payload = JSON.stringify({
        player_token: state.playerToken,
        auth_token: state.authToken,
        piece: pieceCode,
        to: [row, col],
        defer_ai: true,
        client_state: state.game,
      });
      const res = await fetch(`/api/rooms/${state.roomCode}/drop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await res.json();
      if (res.ok && data.state) {
        zenAudio.playWoodClick();
        clearSelection();
        state.game = data.state;
        setBusyState(false, "");
        renderGameAll();
        if (data.ai_pending) {
          await triggerPendingAiMove();
        }
        return;
      }
    } finally {
      setBusyState(false, "");
      renderGameAll();
    }
  }

  function connectRoomStream(code) {
    if (state.roomSource) {
      state.roomSource.close();
    }
    const tokenParam = state.playerToken ? `?player_token=${encodeURIComponent(state.playerToken)}` : "";
    const es = new EventSource(`/api/rooms/${code}/stream${tokenParam}`);
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
        if (!newState.winner && state.roomCode && state.playerToken) {
          saveSession(state.roomCode, state.playerToken, state.myColor, {
            mode: newState.mode,
            storyChapter: newState.story_chapter,
            rivalName: newState.players && newState.players.blanco && newState.players.blanco.name,
            moveCount: newState.move_count,
          });
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

    if (!state.game.winner) {
      saveSession(state.roomCode, state.playerToken, state.myColor, {
        mode: state.game.mode,
        storyChapter: state.game.story_chapter,
        rivalName: state.game.players && state.game.players.blanco && state.game.players.blanco.name,
        moveCount: state.game.move_count,
      });
    } else {
      clearActiveMatchStorage();
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", state.roomCode);
    window.history.pushState({}, "", url.toString());

    switchView("game");
    if (state.game && state.game.mode === "online") {
      connectRoomStream(state.roomCode);
    } else {
      if (state.roomSource) {
        state.roomSource.close();
        state.roomSource = null;
      }
      connDot.classList.add("online");
    }
    renderGameAll();
  }

  async function notifyRoomLeave(action = "disconnect") {
    if (!state.roomCode || !state.playerToken || state.tutorialActive) return;
    try {
      await fetch(`/api/rooms/${state.roomCode}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_token: state.playerToken,
          action,
        }),
        keepalive: true,
      });
    } catch (_) {}
  }

  function returnToLobby() {
    state.tutorialActive = false;
    senseiPanel.hidden = true;
    const storyHud = document.getElementById("story-hud-panel");
    if (storyHud) storyHud.hidden = true;
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
    renderResumeMatchBanner();
    renderStoryCampaign();
    connectLobbyStream();
    loadCommunityStats();
  }

  function requestLeaveMatch() {
    // If tutorial, spectator, or finished game, exit immediately without dialog
    if (
      state.tutorialActive ||
      !state.game ||
      state.game.winner ||
      state.myColor === "espectador" ||
      (state.game.mode === "online" && state.game.status === "waiting" && state.game.move_count === 0)
    ) {
      if (state.game && state.game.winner) {
        clearActiveMatchStorage();
      }
      returnToLobby();
      return;
    }

    const leaveDialog = document.getElementById("leave-match-dialog");
    const titleEl = document.getElementById("leave-dialog-title");
    const descEl = document.getElementById("leave-dialog-desc");
    const btnPause = document.getElementById("btn-leave-pause");
    const btnForfeit = document.getElementById("btn-leave-forfeit");
    const btnStay = document.getElementById("btn-leave-stay");
    if (!leaveDialog) {
      returnToLobby();
      return;
    }

    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const isOnlineActive = state.game.mode === "online" && state.game.status === "playing";

    if (isOnlineActive) {
      titleEl.textContent = isEn ? "Leave online match in progress?" : "¿Salir de la partida online en curso?";
      descEl.textContent = isEn
        ? "If you pause to the Lobby, your seat is held for 5 minutes so you can resume. If you don't return within 5 minutes (or if you forfeit now), your opponent wins by abandonment."
        : "Si sales al Lobby temporalmente, tu asiento se guardará durante 5 minutos para que puedas reanudar. Si no regresas en 5 minutos (o si eliges abandonar ahora), tu rival ganará por abandono.";
      btnPause.textContent = isEn
        ? "⏸ Go to Lobby (5-minute window to resume)"
        : "⏸ Ir al Lobby (tienes 5 minutos para reanudar)";
      btnForfeit.textContent = isEn
        ? "🏳 Forfeit match now (Victory for opponent)"
        : "🏳 Abandonar y dar por perdida la partida";
      btnForfeit.hidden = false;
    } else {
      const rivalName =
        (state.game.players && state.game.players.blanco && state.game.players.blanco.name) || "Sensei Bot";
      titleEl.textContent = isEn ? "Pause match and return to Lobby?" : "¿Pausar partida y volver al Lobby?";
      descEl.textContent = isEn
        ? `Your match against ${rivalName} will stay saved for 30 minutes so you can resume from the Lobby whenever you want, or you can discard it.`
        : `Tu partida contra ${rivalName} quedará guardada en pausa durante 30 minutos para que puedas reanudarla desde el Lobby con un clic, o puedes descartarla ahora.`;
      btnPause.textContent = isEn
        ? "⏸ Save in pause & go to Lobby"
        : "⏸ Guardar en pausa y volver al Lobby";
      btnForfeit.textContent = isEn
        ? "🗑 Discard match without saving"
        : "🗑 Descartar partida y salir";
      btnForfeit.hidden = false;
    }
    btnStay.textContent = isEn ? "Continue playing on board" : "Seguir jugando en el tablero";
    leaveDialog.showModal();
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
    state.flipped = false;
    connDot.classList.add("online");
    switchView("game");
    senseiPanel.hidden = false;
    const storyHud = document.getElementById("story-hud-panel");
    if (storyHud) storyHud.hidden = true;
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
    const storyChapter = customOptions?.storyChapter || null;
    const aiLevel = customOptions?.aiLevel || storyChapter || 3;

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        visibility,
        color,
        name,
        title,
        story_chapter: storyChapter,
        ai_level: aiLevel,
        auth_token: state.authToken,
      }),
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

  async function joinRoomByCode(code, name = "", existingToken = null, spectate = false, silentNotFound = false) {
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
        auth_token: state.authToken,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      applyRoomJoined(data);
      if (lobbyDialog.open) lobbyDialog.close();
      return true;
    } else {
      if (!silentNotFound) {
        directJoinError.textContent = data.error || "No se encontró la sala.";
        directJoinError.hidden = false;
      }
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

  btnBackLobby.addEventListener("click", requestLeaveMatch);

  const leaveDialogEl = document.getElementById("leave-match-dialog");
  const btnLeavePause = document.getElementById("btn-leave-pause");
  const btnLeaveForfeit = document.getElementById("btn-leave-forfeit");
  const btnLeaveStay = document.getElementById("btn-leave-stay");

  if (btnLeavePause && leaveDialogEl) {
    btnLeavePause.addEventListener("click", async () => {
      leaveDialogEl.close();
      if (state.game && !state.game.winner && state.roomCode && state.playerToken) {
        saveSession(state.roomCode, state.playerToken, state.myColor, {
          mode: state.game.mode,
          storyChapter: state.game.story_chapter,
          rivalName: state.game.players && state.game.players.blanco && state.game.players.blanco.name,
          moveCount: state.game.move_count,
        });
        if (state.game.mode === "online") {
          await notifyRoomLeave("disconnect");
        }
      }
      returnToLobby();
    });
  }

  if (btnLeaveForfeit && leaveDialogEl) {
    btnLeaveForfeit.addEventListener("click", async () => {
      leaveDialogEl.close();
      clearActiveMatchStorage();
      if (state.game && !state.game.winner && state.roomCode && state.playerToken) {
        if (state.game.mode === "online" && state.game.status === "playing") {
          await notifyRoomLeave("forfeit");
        }
      }
      returnToLobby();
    });
  }

  if (btnLeaveStay && leaveDialogEl) {
    btnLeaveStay.addEventListener("click", () => {
      leaveDialogEl.close();
    });
  }

  const btnResumeActiveMatch = document.getElementById("btn-resume-active-match");
  const btnDiscardActiveMatch = document.getElementById("btn-discard-active-match");

  if (btnResumeActiveMatch) {
    btnResumeActiveMatch.addEventListener("click", async () => {
      const active = getActiveMatchStorage();
      if (!active || !active.roomCode) {
        renderResumeMatchBanner();
        return;
      }
      const joined = await joinRoomByCode(active.roomCode, getNickname(), active.token, false, true);
      if (!joined) {
        clearActiveMatchStorage();
        renderResumeMatchBanner();
      }
    });
  }

  if (btnDiscardActiveMatch) {
    btnDiscardActiveMatch.addEventListener("click", async () => {
      const active = getActiveMatchStorage();
      if (active && active.mode === "online" && active.roomCode && active.token) {
        try {
          await fetch(`/api/rooms/${active.roomCode}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_token: active.token, action: "forfeit" }),
          });
        } catch (_) {}
      }
      clearActiveMatchStorage();
      renderResumeMatchBanner();
    });
  }

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
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    btnToggleMusic.setAttribute("aria-pressed", active ? "true" : "false");
    btnToggleMusic.textContent = active
      ? (isEn ? "🎶 Music: ON" : "🎶 Música: ON")
      : (isEn ? "🎵 Music: OFF" : "🎵 Música: OFF");
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
    syncAudioUI();
    renderResumeMatchBanner();
    renderStoryCampaign();
    if (state.view === "game") {
      renderGameAll();
      if (state.tutorialActive) {
        loadTutorialStep(state.tutorialStep);
      }
    } else if (state.view === "lobby") {
      updateMatchmakingUI();
      if (state.lobbyData) {
        renderLobby();
      }
      loadCommunityStats();
    }
  });

  // Live 1-second ticker for the 5-minute online reconnection countdown
  setInterval(() => {
    if (
      state.view === "game" &&
      state.game &&
      state.game.mode === "online" &&
      !state.game.winner &&
      state.game.players &&
      ((state.game.players.negro && state.game.players.negro.disconnected_at) ||
        (state.game.players.blanco && state.game.players.blanco.disconnected_at))
    ) {
      renderPlayerPanels();
      renderStatusAndHistory();
    }
  }, 1000);

  // Best-effort beacon when tab is closed or hidden during an active online match
  window.addEventListener("pagehide", () => {
    if (
      state.view === "game" &&
      state.game &&
      state.game.mode === "online" &&
      state.game.status === "playing" &&
      !state.game.winner &&
      state.roomCode &&
      state.playerToken &&
      navigator.sendBeacon
    ) {
      try {
        const blob = new Blob(
          [JSON.stringify({ player_token: state.playerToken, action: "disconnect" })],
          { type: "application/json" }
        );
        navigator.sendBeacon(`/api/rooms/${state.roomCode}/leave`, blob);
      } catch (_) {}
    }
  });

  /* ==========================================
     AUTENTICACIÓN GOOGLE Y PERFIL DE USUARIO
     ========================================== */
  async function checkAuthStatus() {
    try {
      const headers = {};
      if (state.authToken) {
        headers["Authorization"] = `Bearer ${state.authToken}`;
      }
      const res = await fetch("/api/auth/me", { headers });
      const data = await res.json();
      if (data.authenticated && data.user) {
        state.authUser = data.user;
        if (data.token) {
          state.authToken = data.token;
          localStorage.setItem("shogi_auth_token", data.token);
        }
        updateAuthUI(data.user);
        if (data.user.name && !loadNickname()) {
          lobbyNicknameInput.value = data.user.name;
          saveNickname(data.user.name);
        }
      } else {
        state.authUser = null;
        state.authToken = null;
        localStorage.removeItem("shogi_auth_token");
        updateAuthUI(null);
      }
    } catch (_) {
      updateAuthUI(null);
    }
  }

  function updateAuthUI(user) {
    const btnAdmin = document.getElementById("btn-admin-topbar");
    const heroProfileCard = document.getElementById("hero-profile-card");
    const lobbyHero = document.getElementById("lobby-hero");
    if (user) {
      if (btnGoogleLogin) btnGoogleLogin.hidden = true;
      if (userProfileWidget) {
        userProfileWidget.hidden = false;
        userAvatarTop.src = user.picture || "/static/icon-48.png";
        userNameTop.textContent = user.name;
        userRatingTop.textContent = `${user.rating || 1200} pts`;
      }
      if (btnAdmin) btnAdmin.hidden = !user.is_admin;
      if (heroProfileCard) heroProfileCard.hidden = true;
      if (lobbyHero) lobbyHero.classList.add("is-authenticated");
    } else {
      if (btnGoogleLogin) btnGoogleLogin.hidden = false;
      if (userProfileWidget) userProfileWidget.hidden = true;
      if (btnAdmin) btnAdmin.hidden = true;
      if (heroProfileCard) heroProfileCard.hidden = false;
      if (lobbyHero) lobbyHero.classList.remove("is-authenticated");
    }
    renderStoryCampaign();
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.authToken}` },
      });
    } catch (_) {}
    state.authToken = null;
    state.authUser = null;
    localStorage.removeItem("shogi_auth_token");
    updateAuthUI(null);
    loadCommunityStats();
  }

  async function handleGoogleCredential(credential) {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        state.authToken = data.token;
        state.authUser = data.user;
        localStorage.setItem("shogi_auth_token", data.token);
        updateAuthUI(data.user);
        if (data.user.name) {
          lobbyNicknameInput.value = data.user.name;
          saveNickname(data.user.name);
        }
        loadCommunityStats();
      } else {
        alert(data.error || "Error al autenticar con Google.");
      }
    } catch (_) {
      alert("Error de conexión al autenticar con Google.");
    }
  }

  async function initGoogleAuth() {
    if (btnLogout) {
      btnLogout.addEventListener("click", handleLogout);
    }
    try {
      const res = await fetch("/api/auth/config");
      const cfg = await res.json();
      state.googleClientId = cfg.google_client_id;
    } catch (_) {}

    if (btnGoogleLogin) {
      btnGoogleLogin.addEventListener("click", () => {
        if (state.googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
          window.google.accounts.id.prompt();
        } else if (!state.googleClientId) {
          const isEn = window.i18n && window.i18n.getLanguage() === "en";
          alert(
            isEn
              ? "Google Sign-In is enabled! To connect live Google accounts, configure GOOGLE_CLIENT_ID in your Vercel project environment variables."
              : "¡El sistema de Google Sign-In está activo! Para conectar cuentas reales de Google, agrega GOOGLE_CLIENT_ID en las variables de entorno de tu proyecto en Vercel."
          );
        }
      });
    }

    if (state.googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: state.googleClientId,
          callback: (response) => {
            if (response.credential) {
              handleGoogleCredential(response.credential);
            }
          },
        });
        if (!state.authToken) {
          window.google.accounts.id.prompt();
        }
      } catch (_) {}
    }
  }

  /* ==========================================
     SALÓN DE LA FAMA Y HISTORIAL DE PARTIDAS
     ========================================== */
  async function loadCommunityStats() {
    if (!leaderboardTbody && !recentMatchesList) return;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";

    // 1. Leaderboard
    try {
      const res = await fetch("/api/leaderboard?limit=15");
      const data = await res.json();
      const players = data.leaderboard || [];
      if (players.length === 0) {
        leaderboardTbody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state">
              ${isEn
                ? "No rated matches yet. Sign in with Google, play a match, and lead the Hall of Fame!"
                : "Aún no hay partidas puntuadas. ¡Inicia sesión con Google, juega una partida y lidera el Salón de la Fama!"}
            </td>
          </tr>
        `;
      } else {
        leaderboardTbody.innerHTML = players
          .map((p, idx) => {
            let rankBadge = `${idx + 1}`;
            let rankClass = "";
            if (idx === 0) {
              rankBadge = "I";
              rankClass = "rank-1";
            } else if (idx === 1) {
              rankBadge = "II";
              rankClass = "rank-2";
            } else if (idx === 2) {
              rankBadge = "III";
              rankClass = "rank-3";
            }
            const avatarSrc = p.picture || "/static/icon-48.png";
            return `
              <tr>
                <td><span class="rank-badge ${rankClass}">${rankBadge}</span></td>
                <td>
                  <div class="leaderboard-player-cell">
                    <img src="${escapeHTML(avatarSrc)}" alt="" class="leaderboard-avatar" width="24" height="24" onerror="this.src='/static/icon-48.png'">
                    <span>${escapeHTML(p.name)}</span>
                  </div>
                </td>
                <td class="text-right"><strong>${p.rating}</strong></td>
                <td class="text-right">${p.wins} / ${p.losses}</td>
                <td class="text-right">${p.win_rate}%</td>
              </tr>
            `;
          })
          .join("");
      }
    } catch (_) {}

    // 2. Recent Matches
    try {
      const res = await fetch("/api/matches/recent?limit=10");
      const data = await res.json();
      const matches = data.matches || [];
      if (matches.length === 0) {
        recentMatchesList.innerHTML = `<p class="empty-state">${
          isEn ? "No matches recorded recently." : "No hay partidas registradas recientemente."
        }</p>`;
      } else {
        recentMatchesList.innerHTML = matches
          .map((m) => {
            const senteWinner = m.winner_color === "negro";
            const goteWinner = m.winner_color === "blanco";
            let reasonLabel = "Victoria";
            if (m.end_reason === "checkmate") {
              reasonLabel = isEn ? "Checkmate" : "Jaque Mate";
            } else if (m.end_reason === "resignation") {
              reasonLabel = isEn ? "Resignation" : "Rendición";
            } else if (m.winner_color === "tablas") {
              reasonLabel = isEn ? "Draw" : "Tablas";
            }
            const storyBadge = m.story_chapter
              ? `<span class="match-reason-badge" style="background:rgba(184,41,29,0.22); color:#ffd4cc; border-color:rgba(217,173,101,0.4);">${isEn ? "Story Ch." : "Historia Cap."} ${m.story_chapter}</span>`
              : "";
            return `
              <div class="match-item-card">
                <div class="match-players">
                  <div class="match-player-line ${senteWinner ? "winner" : ""}">
                    <span>☗</span>
                    <span>${escapeHTML(m.sente_name)}</span>
                    ${senteWinner ? "· Victoria" : ""}
                  </div>
                  <div class="match-player-line ${goteWinner ? "winner" : ""}">
                    <span>☖</span>
                    <span>${escapeHTML(m.gote_name)}</span>
                    ${goteWinner ? "· Victoria" : ""}
                  </div>
                </div>
                <div class="match-meta-right">
                  ${storyBadge}
                  <span class="match-reason-badge">${reasonLabel}</span>
                  <span>${m.move_count} ${isEn ? "moves" : "jugadas"}</span>
                </div>
              </div>
            `;
          })
          .join("");
      }
    } catch (_) {}
  }

  /* ==========================================
     MODO HISTORIA: CRÓNICAS DEL SENGOKU (5 CAPÍTULOS)
     ========================================== */
  const STORY_STORAGE_KEY = "shogi_story_progress";
  const STORY_BOSSES = window.STORY_BOSSES || [];

  function loadStoryProgress() {
    try {
      const raw = localStorage.getItem(STORY_STORAGE_KEY);
      if (!raw) return { completed: [], unlockAll: false };
      const parsed = JSON.parse(raw);
      return {
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        unlockAll: Boolean(parsed.unlockAll),
      };
    } catch (_) {
      return { completed: [], unlockAll: false };
    }
  }

  function saveStoryProgress(prog) {
    try {
      localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(prog));
    } catch (_) {}
  }

  function markStoryChapterCompleted(chapterNum) {
    const prog = loadStoryProgress();
    const c = Number(chapterNum);
    if (!prog.completed.includes(c)) {
      prog.completed.push(c);
      saveStoryProgress(prog);
    }
  }

  function renderStoryCampaign() {
    const grid = document.getElementById("story-chapters-grid");
    const pill = document.getElementById("story-progress-pill");
    const btnUnlock = document.getElementById("btn-story-unlock-all");
    if (!grid) return;

    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const lang = isEn ? "en" : "es";
    const prog = loadStoryProgress();
    const isAdmin = Boolean(state.authUser && state.authUser.is_admin);
    const freePlayActive = isAdmin && prog.unlockAll;

    const hubBadge = document.getElementById("hub-story-badge");
    if (hubBadge) {
      hubBadge.textContent = `${prog.completed.length}/5`;
    }
    if (pill) {
      pill.textContent = isEn
        ? `${prog.completed.length} / 5 Defeated`
        : `${prog.completed.length} / 5 Derrotados`;
    }
    if (btnUnlock) {
      btnUnlock.hidden = !isAdmin;
      btnUnlock.textContent = freePlayActive
        ? (isEn ? "Progressive Mode (Admin)" : "Modo Progresivo (Admin)")
        : (isEn ? "Unlock All (Admin)" : "Modo Libre (Admin)");
    }

    grid.innerHTML = STORY_BOSSES.map((b) => {
      const isDone = prog.completed.includes(b.chapter);
      const isUnlocked = b.chapter === 1 || prog.completed.includes(b.chapter - 1) || freePlayActive || isDone;
      const isNext = !isDone && (b.chapter === 1 || prog.completed.includes(b.chapter - 1));
      const starsStr = "★".repeat(b.stars) + "☆".repeat(5 - b.stars);

      let statusBadge = "";
      if (isDone) {
        statusBadge = `<span class="story-status-tag done">${isEn ? "Defeated" : "Derrotado"}</span>`;
      } else if (isUnlocked) {
        statusBadge = `<span class="story-status-tag ready">${isEn ? "Available" : "Disponible"}</span>`;
      } else {
        statusBadge = `<span class="story-status-tag locked">${isEn ? "Locked" : "Bloqueado"}</span>`;
      }

      const btnLabel = isDone
        ? (isEn ? "Rematch" : "Revancha")
        : isUnlocked
          ? (isEn ? `Challenge Ch. ${b.chapter} →` : `Desafiar Cap. ${b.chapter} →`)
          : (isEn ? `Win Ch. ${b.chapter - 1} first` : `Vence el Cap. ${b.chapter - 1}`);

      const cardClasses = [
        "story-boss-card",
        isDone ? "is-completed" : "",
        isNext ? "is-next" : "",
        !isUnlocked ? "is-locked" : "",
      ].filter(Boolean).join(" ");

      return `
        <article class="${cardClasses}">
          <div class="story-boss-art-banner">
            <img src="${b.portrait}" alt="${escapeHTML(b.name)}" class="story-boss-portrait" width="360" height="360" loading="lazy">
            <div class="story-boss-art-overlay">
              <span class="story-boss-chap">${isEn ? "Ch." : "Cap."} ${b.chapter} · ${escapeHTML(b.era[lang])}</span>
              ${statusBadge}
            </div>
            <div class="story-boss-mon" title="Hanko: ${b.kanji}" aria-hidden="true">${b.mon}</div>
          </div>
          <div class="story-boss-body">
            <div class="story-boss-meta">
              <h3 class="story-boss-name">${escapeHTML(b.name)}</h3>
              <span class="story-boss-kanji" lang="ja">${b.kanji}</span>
            </div>
            <div class="story-boss-role">${escapeHTML(b.role[lang])}</div>
            <p class="story-boss-desc">${escapeHTML(b.desc[lang])}</p>
          </div>
          <div class="story-boss-footer">
            <p class="story-boss-quote">${escapeHTML(b.quotes.intro[lang])}</p>
            <div class="story-boss-badges">
              <span class="story-stars" title="ELO ~${b.elo}">${starsStr}</span>
              <span class="story-elo-tag">ELO ~${b.elo}</span>
            </div>
            <button type="button" class="btn ${isNext ? "btn-primary" : "btn-accent"} btn-block btn-story-play" data-chapter="${b.chapter}" ${!isUnlocked ? "disabled" : ""}>
              ${btnLabel}
            </button>
          </div>
        </article>
      `;
    }).join("");

    grid.querySelectorAll(".btn-story-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ch = Number(btn.getAttribute("data-chapter"));
        startStoryChapter(ch);
      });
    });
  }

  async function startStoryChapter(chapterNum) {
    const boss = STORY_BOSSES.find((b) => b.chapter === Number(chapterNum));
    if (!boss) return;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    await createNewRoom({
      rawMode: "ai",
      color: "negro",
      storyChapter: boss.chapter,
      aiLevel: boss.chapter,
      title: isEn ? `Ch. ${boss.chapter}: vs ${boss.name}` : `Cap. ${boss.chapter}: vs ${boss.name}`,
    });
  }

  function renderStoryHud() {
    const hud = document.getElementById("story-hud-panel");
    if (!hud) return;
    const chapNum = state.game && state.game.story_chapter ? Number(state.game.story_chapter) : null;
    if (!chapNum || state.tutorialActive) {
      hud.hidden = true;
      return;
    }

    const boss = STORY_BOSSES.find((b) => b.chapter === chapNum);
    if (!boss) {
      hud.hidden = true;
      return;
    }

    hud.hidden = false;
    const isEn = window.i18n && window.i18n.getLanguage() === "en";
    const lang = isEn ? "en" : "es";

    const portraitEl = document.getElementById("story-hud-portrait");
    if (portraitEl && boss.portrait) {
      portraitEl.src = boss.portrait;
      portraitEl.alt = boss.name;
    }
    document.getElementById("story-hud-mon").textContent = boss.mon;
    document.getElementById("story-hud-chapter-badge").textContent = isEn
      ? `Chapter ${boss.chapter} of 5`
      : `Capítulo ${boss.chapter} de 5`;
    document.getElementById("story-hud-stars").textContent = `${"★".repeat(boss.stars)} · ${boss.elo} ELO`;
    document.getElementById("story-hud-era").textContent = boss.era[lang];
    document.getElementById("story-hud-name").textContent = `${boss.name} (${boss.kanji}) — ${boss.role[lang]}`;

    let quoteText = boss.quotes.intro[lang];
    const nextBtn = document.getElementById("btn-story-next-chapter");

    if (state.game.winner === "negro") {
      quoteText = boss.quotes.defeat[lang];
      markStoryChapterCompleted(boss.chapter);
      if (nextBtn) {
        if (boss.chapter < 5) {
          const nextBoss = STORY_BOSSES.find((b) => b.chapter === boss.chapter + 1);
          nextBtn.hidden = false;
          nextBtn.textContent = isEn
            ? `Next Chapter: ${nextBoss.name} →`
            : `Siguiente: ${nextBoss.name} →`;
          nextBtn.onclick = () => startStoryChapter(boss.chapter + 1);
        } else {
          nextBtn.hidden = false;
          nextBtn.textContent = isEn ? "Campaign Completed! Back to Dojo" : "¡Campaña Completada! Volver al Dojo";
          nextBtn.onclick = () => returnToLobby();
        }
      }
    } else {
      if (nextBtn) nextBtn.hidden = true;
      if (state.game.winner === "blanco") {
        quoteText = boss.quotes.victory[lang];
      } else if (state.game.in_check === "negro") {
        quoteText = boss.quotes.check_player[lang];
      } else if (state.game.in_check === "blanco") {
        quoteText = boss.quotes.in_check[lang];
      } else if (state.game.last_move && state.game.last_move.color === "blanco") {
        if (state.game.last_move.type === "drop") {
          quoteText = boss.quotes.drop[lang];
        } else if (state.game.last_move.captured) {
          quoteText = boss.quotes.capture[lang];
        }
      }
    }

    document.getElementById("story-hud-quote").textContent = quoteText;
  }

  function switchHubTab(tabName) {
    const panels = {
      online: document.getElementById("hub-panel-online"),
      story: document.getElementById("story-campaign-section"),
      ranking: document.getElementById("hub-panel-ranking"),
    };
    Object.entries(panels).forEach(([key, el]) => {
      if (el) el.hidden = key !== tabName;
    });
    document.querySelectorAll(".lobby-hub-tab").forEach((btn) => {
      const isMatch = btn.getAttribute("data-hub-tab") === tabName;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
  }

  function initStoryCampaign() {
    const btnUnlock = document.getElementById("btn-story-unlock-all");
    if (btnUnlock) {
      btnUnlock.addEventListener("click", () => {
        if (!state.authUser || !state.authUser.is_admin) return;
        const prog = loadStoryProgress();
        prog.unlockAll = !prog.unlockAll;
        saveStoryProgress(prog);
        renderStoryCampaign();
      });
    }
    document.querySelectorAll(".lobby-hub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchHubTab(btn.getAttribute("data-hub-tab"));
      });
    });
    const btnJumpStory = document.getElementById("btn-jump-story");
    if (btnJumpStory) {
      btnJumpStory.addEventListener("click", () => {
        switchHubTab("story");
      });
    }
    renderStoryCampaign();
  }

  // Inicialización: si hay ?room=CODIGO entra a la partida; si no, abre el Lobby de Matchmaking
  async function init() {
    renderCoordinates();
    initStoryCampaign();
    checkAuthStatus();
    initGoogleAuth();
    loadCommunityStats();
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const saved = loadSession(roomParam.toUpperCase());
      const joined = await joinRoomByCode(roomParam, getNickname(), saved ? saved.token : null, false, true);
      if (joined) return;
      directJoinError.hidden = true;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("room");
      window.history.replaceState({}, "", cleanUrl.toString());
    }
    switchView("lobby");
    renderResumeMatchBanner();
    connectLobbyStream();
    loadCommunityStats();
  }

  init();
})();
