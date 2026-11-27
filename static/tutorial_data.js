/* ==========================================
   ACADEMIA INTERACTIVA DE SHŌGI (12 LECCIONES)
   Catálogo de Piezas y Escenarios del Curso
   ========================================== */
(() => {
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

  window.ShogiTutorialData = {
    PIECE_CATALOG,
    makeCell,
    makeStandardTutorialBoard,
    TUTORIAL_LESSONS,
  };
})();
