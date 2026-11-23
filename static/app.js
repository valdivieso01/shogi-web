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

  const state = {
    roomCode: null,
    playerToken: null,
    myColor: null, // "negro" | "blanco" | "ambos" | "espectador"
    flipped: false, // false = Negro abajo (filas 0..8), true = Blanco abajo (filas 8..0)
    game: null,
    selectedCell: null, // { row, col }
    selectedDrop: null, // { color, code }
    legalTargets: [], // [{ row, col, capture, can_promote, must_promote }]
    eventSource: null,
    pendingMove: null,
  };

  // Elementos del DOM
  const boardEl = document.getElementById("shogi-board");
  const colCoordsEl = document.getElementById("col-coords");
  const rowCoordsEl = document.getElementById("row-coords");
  const roomCodeDisplay = document.getElementById("room-code-display");
  const myRoleBadge = document.getElementById("my-role-badge");
  const connDot = document.getElementById("conn-dot");
  const btnCopyLink = document.getElementById("btn-copy-link");
  const btnCopyInline = document.getElementById("btn-copy-inline");
  const inviteCallout = document.getElementById("invite-callout");
  const inviteUrlInput = document.getElementById("invite-url-input");
  const turnBanner = document.getElementById("turn-banner");
  const checkAlert = document.getElementById("check-alert");
  const historyList = document.getElementById("history-list");
  const moveCounter = document.getElementById("move-counter");

  const lobbyDialog = document.getElementById("lobby-dialog");
  const rulesDialog = document.getElementById("rules-dialog");
  const promoteDialog = document.getElementById("promote-dialog");
  const promotePreview = document.getElementById("promote-preview");
  const lobbyError = document.getElementById("lobby-error");

  const KANJI_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

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

  function canControlColor(color) {
    if (!state.game || state.game.winner) return false;
    if (state.game.turn !== color) return false;
    if (state.myColor === "ambos") return true;
    return state.myColor === color;
  }

  function renderCoordinates() {
    const cols = [];
    const rows = [];
    for (let i = 0; i < 9; i++) {
      const c = state.flipped ? 8 - i : i;
      const r = state.flipped ? 8 - i : i;
      cols.push(`<span>${9 - c} <small>(${c})</small></span>`);
      rows.push(`<span>${KANJI_NUMS[r]}<small>${r}</small></span>`);
    }
    colCoordsEl.innerHTML = cols.join("");
    rowCoordsEl.innerHTML = rows.join("");
  }

  function createKomaHTML(piece, pointsDown) {
    const dirClass = pointsDown ? "points-down" : "";
    const promoClass = piece.promoted ? "promoted" : "";
    return `
      <div class="koma-tile ${dirClass} ${promoClass}">
        <span class="koma-kanji" lang="ja">${piece.kanji}</span>
        <span class="koma-sub">${piece.display_code} · ${piece.es}</span>
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
    const fragment = document.createDocumentFragment();

    for (let vi = 0; vi < 9; vi++) {
      for (let vj = 0; vj < 9; vj++) {
        const r = state.flipped ? 8 - vi : vi;
        const c = state.flipped ? 8 - vj : vj;
        const piece = board[r][c];

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "board-cell";
        cell.dataset.row = r;
        cell.dataset.col = c;

        // Puntos Hoshi tradicionales (intersecciones 2,2 / 2,5 / 5,2 / 5,5)
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

        if (piece) {
          // Negro (Sente) apunta hacia fila 0 (arriba si no está girado); Blanco (Gote) apunta hacia fila 8
          const pointsDown = state.flipped ? piece.color === "negro" : piece.color === "blanco";
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

        const canDrop = canControlColor(color);
        btn.disabled = !canDrop;
        btn.setAttribute("aria-label", `Reincorporar ${item.es} (${item.count} disponible)`);
        btn.innerHTML = `
          <div class="koma-tile">
            <span class="koma-kanji" lang="ja">${item.kanji}</span>
            <span class="koma-sub">${item.code} · ${item.es}</span>
          </div>
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

    const roleLabels = {
      negro: "Juegas con Negro ☗",
      blanco: "Juegas con Blanco ☖",
      ambos: "Modo Local (Ambos)",
      espectador: "Espectador",
    };
    myRoleBadge.textContent = roleLabels[state.myColor] || "Sin sala";

    const shareUrl = getInviteUrl(state.roomCode);
    inviteUrlInput.value = shareUrl;
    const waitingOpponent =
      state.game.mode === "online" &&
      (!state.game.players.negro.connected || !state.game.players.blanco.connected);
    inviteCallout.hidden = !waitingOpponent;
    btnCopyLink.hidden = state.game.mode !== "online";

    checkAlert.hidden = !state.game.in_check;
    if (state.game.in_check) {
      const checkedName = state.game.in_check === "negro" ? "Sente (Negro ☗)" : "Gote (Blanco ☖)";
      checkAlert.innerHTML = `¡Jaque al Rey de <strong>${checkedName}</strong> (<span lang="ja">王手</span>)!`;
    }

    if (state.game.winner) {
      turnBanner.classList.add("winner");
      turnBanner.textContent = state.game.reason || "Partida terminada.";
    } else {
      turnBanner.classList.remove("winner");
      const turnLabel = state.game.turn === "negro" ? "Sente (Negro ☗)" : "Gote (Blanco ☖)";
      if (waitingOpponent) {
        turnBanner.textContent = `Esperando al 2.º jugador... Turno inicial: ${turnLabel}`;
      } else if (canControlColor(state.game.turn)) {
        turnBanner.textContent = `Es tu turno — Mueve con ${turnLabel}`;
      } else {
        turnBanner.textContent = `Turno de ${turnLabel} (esperando su jugada...)`;
      }
    }

    moveCounter.textContent = `${state.game.move_count} ${state.game.move_count === 1 ? "jugada" : "jugadas"}`;
    const items = (state.game.history || []).map((h) => `<li>${h.notation}</li>`).join("");
    historyList.innerHTML = items || `<li>Sin movimientos todavía</li>`;
    historyList.scrollTop = historyList.scrollHeight;
  }

  function renderAll() {
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

      promotePreview.innerHTML = `
        <div class="preview-koma">${createKomaHTML(piece, false)}</div>
        <span aria-hidden="true">➔</span>
        <div class="preview-koma">
          <div class="koma-tile promoted">
            <span class="koma-kanji" lang="ja">+${piece.code}</span>
            <span class="koma-sub">Promovida</span>
          </div>
        </div>
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
    const turnColor = state.game.turn;
    if (!canControlColor(turnColor)) return;

    // 1. Si hay una pieza de la reserva seleccionada para reincorporar (Drop)
    if (state.selectedDrop) {
      const isLegalDrop = state.legalTargets.some((m) => m.row === row && m.col === col);
      if (isLegalDrop) {
        await submitDrop(state.selectedDrop.code, row, col);
        return;
      }
    }

    // 2. Si hay una pieza del tablero seleccionada y clicamos en un destino legal
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

    // 3. Seleccionar una pieza propia del tablero
    const clickedPiece = state.game.board[row][col];
    if (clickedPiece && clickedPiece.color === turnColor) {
      if (state.selectedCell && state.selectedCell.row === row && state.selectedCell.col === col) {
        clearSelection();
        renderAll();
        return;
      }
      state.selectedDrop = null;
      state.selectedCell = { row, col };
      state.legalTargets = [];
      renderAll();
      await fetchLegalMovesForCell(row, col);
    } else {
      clearSelection();
      renderAll();
    }
  }

  async function onHandPieceClick(color, code) {
    if (!canControlColor(color)) return;
    if (state.selectedDrop && state.selectedDrop.color === color && state.selectedDrop.code === code) {
      clearSelection();
      renderAll();
      return;
    }
    state.selectedCell = null;
    state.selectedDrop = { color, code };
    state.legalTargets = [];
    renderAll();
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
      clearSelection();
      state.game = data.state;
      renderAll();
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
      clearSelection();
      state.game = data.state;
      renderAll();
    }
  }

  function connectRoomStream(code) {
    if (state.eventSource) {
      state.eventSource.close();
    }
    const es = new EventSource(`/api/rooms/${code}/stream`);
    state.eventSource = es;

    es.onopen = () => {
      connDot.classList.add("online");
    };

    es.onmessage = (ev) => {
      try {
        const newState = JSON.parse(ev.data);
        const turnChanged = !state.game || state.game.move_count !== newState.move_count;
        state.game = newState;
        if (turnChanged) {
          clearSelection();
        }
        renderAll();
      } catch (_) {}
    };

    es.onerror = () => {
      connDot.classList.remove("online");
    };
  }

  function applyRoomJoined(data) {
    state.roomCode = data.room_code;
    state.playerToken = data.player_token;
    state.myColor = data.assigned_color;
    state.game = data.state;
    state.flipped = data.assigned_color === "blanco";
    clearSelection();

    saveSession(state.roomCode, state.playerToken, state.myColor);
    const url = new URL(window.location.href);
    url.searchParams.set("room", state.roomCode);
    window.history.replaceState({}, "", url.toString());

    connectRoomStream(state.roomCode);
    renderAll();
  }

  async function createNewRoom() {
    lobbyError.hidden = true;
    const modeInput = document.querySelector('input[name="game-mode"]:checked');
    const colorInput = document.querySelector('input[name="creator-color"]:checked');
    const nameInput = document.getElementById("player-name-create");

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: modeInput ? modeInput.value : "online",
        color: colorInput ? colorInput.value : "negro",
        name: nameInput.value.trim(),
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

  async function joinRoomByCode(code, name = "", existingToken = null) {
    lobbyError.hidden = true;
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) {
      lobbyError.textContent = "Introduce un código de sala válido.";
      lobbyError.hidden = false;
      return false;
    }

    const res = await fetch(`/api/rooms/${cleanCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        player_token: existingToken,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      applyRoomJoined(data);
      if (lobbyDialog.open) lobbyDialog.close();
      return true;
    } else {
      lobbyError.textContent = data.error || "No se encontró la sala.";
      lobbyError.hidden = false;
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
  document.getElementById("btn-open-lobby").addEventListener("click", () => {
    lobbyError.hidden = true;
    lobbyDialog.showModal();
  });

  document.getElementById("btn-open-rules").addEventListener("click", () => {
    rulesDialog.showModal();
  });

  document.getElementById("btn-flip-board").addEventListener("click", () => {
    state.flipped = !state.flipped;
    renderAll();
  });

  document.getElementById("btn-create-room").addEventListener("click", createNewRoom);

  document.getElementById("btn-join-room").addEventListener("click", () => {
    const code = document.getElementById("join-code-input").value;
    const name = document.getElementById("player-name-join").value.trim();
    joinRoomByCode(code, name);
  });

  btnCopyLink.addEventListener("click", () => copyInviteLink(btnCopyLink));
  btnCopyInline.addEventListener("click", () => copyInviteLink(btnCopyInline));

  document.getElementById("btn-reset-game").addEventListener("click", async () => {
    if (!state.roomCode) return;
    await fetch(`/api/rooms/${state.roomCode}/reset`, { method: "POST" });
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
      document.getElementById("color-choice-group").hidden = e.target.value === "local";
    });
  }

  // Inicialización automática: si hay ?room=CODE en la URL se une; si no, crea una sala online lista para compartir
  async function init() {
    renderCoordinates();
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      const saved = loadSession(roomParam.toUpperCase());
      const joined = await joinRoomByCode(roomParam, "", saved ? saved.token : null);
      if (joined) return;
    }
    await createNewRoom();
  }

  init();
})();
