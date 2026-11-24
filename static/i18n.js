/**
 * Dojo Shōgi Online - Internationalization (i18n) Engine
 * Provides full English & Spanish localization for UI, pieces, and all 12 Academy Lessons.
 */
(() => {
  const STORAGE_KEY = "shogi_lang";

  function detectInitialLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "es" || saved === "en") return saved;
      const navLang = navigator.language || navigator.userLanguage || "es";
      return navLang.toLowerCase().startsWith("es") ? "es" : "en";
    } catch (_) {
      return "es";
    }
  }

  let currentLang = detectInitialLanguage();

  const TRANSLATIONS = {
    es: {
      site_title: "Dojo Shōgi Online (将棋) | Ajedrez Japonés Gratis para 2 Jugadores y Academia",
      subtitle: "Dojo Online · Matchmaking y Salas en Tiempo Real",
      btn_back_lobby: "← Volver al Lobby",
      room_label: "Sala:",
      role_no_room: "Sin sala",
      btn_copy_link: "Copiar link de invitación",
      btn_flip_board: "Girar tablero",
      btn_learn_play: "🎓 Aprender a Jugar",
      btn_music_off: "🎵 Música: OFF",
      btn_music_on: "🎶 Música: ON",
      music_label: "Control de música relajante del Dojo",
      music_vol_label: "Volumen de la música relajante",
      btn_create_room_top: "+ Crear Sala",
      btn_rules_top: "Glosario y Reglas",
      btn_bug_top: "🐞 Reportar Error",
      lang_switch_label: "Idioma / Language",

      // Lobby
      player_name_label: "Tu nombre de jugador en el Dojo",
      player_name_placeholder: "Ej. Kenshin",
      online_suffix: "en el lobby",
      quick_match_title: "Emparejamiento Rápido",
      quick_match_desc: "Busca a otro jugador en cola y comienza una partida automáticamente con asignación de bandos.",
      searching_rival: "0 buscando rival",
      searching_rival_n: "{n} buscando rival",
      btn_quick_match: "⚔️ Buscar Rival Ahora",
      btn_cancel_match: "Cancelar búsqueda",
      btn_play_ai: "🤖 Jugar vs Bot (1J)",
      searching_status: "Buscando rival en tiempo real... Esperando a otro jugador...",

      // Academy Banner
      academy_badge: "🎓 Academia Interactiva Completa · 12 Lecciones con Diagramas",
      academy_heading: "Curso Paso a Paso: Cómo Mueve Cada Pieza, Reglas y Tácticas",
      academy_desc: "Aprende desde cero con diagramas visuales de movimiento (brújula de casillas) y práctica en el tablero: Rey, General de Oro, General de Plata, Peón y Tokin, Lancero, Caballo, Alfil y Caballo Dragón, Torre y Dragón, Reincorporaciones (Drops), prohibiciones (Nifu y Uchifuzume), Defensa de Jaque y Jaque Mate.",
      btn_start_course: "🎓 Empezar Curso desde Lección 1",

      // Lobby columns
      open_rooms_heading: "Salas Abiertas Esperando Rival",
      btn_new_public_room: "+ Nueva Sala Pública",
      no_open_rooms: "No hay salas esperando jugador. ¡Crea una o usa Buscar Rival!",
      join_code_heading: "Unirse con Código Privado",
      join_code_placeholder: "CÓDIGO (6 LETRAS)",
      btn_direct_join: "Entrar",
      live_rooms_heading: "Partidas en Vivo (Espectador)",
      no_live_rooms: "No hay partidas en curso en este momento.",
      online_players_heading: "Jugadores en el Lobby",

      // Auth & Leaderboard
      btn_login_google: "Iniciar con Google",
      btn_logout: "Cerrar sesión",
      leaderboard_title: "🏆 Salón de la Fama (Top Jugadores)",
      leaderboard_tag: "Competitivo",
      rank_col: "#",
      player_col: "Jugador",
      rating_col: "Rating",
      victories_col: "V / D",
      winrate_col: "Efectividad",
      leaderboard_empty: "Aún no hay partidas puntuadas. ¡Inicia sesión con Google, juega una partida y lidera el Salón de la Fama!",
      recent_matches_title: "📜 Últimas Partidas Disputadas",
      matches_tag: "En Vivo",
      recent_matches_empty: "No hay partidas registradas recientemente.",

      // SEO Editorial
      seo_heading: "¿Qué es el Shōgi (将棋) y cómo funciona el Ajedrez Japonés?",
      seo_art1_title: "🏯 El Tablero 9×9 y las Fichas Pentagonales (Koma)",
      seo_art1_text: "El Shōgi, conocido en Japón como el Juego de los Generales, se disputa sobre un tablero rectangular de 9 filas por 9 columnas (Shōgiban). A diferencia del ajedrez occidental, todas las piezas tienen el mismo color de madera: la pertenencia a cada jugador —Sente (☗ Negro, quien mueve primero) o Gote (☖ Blanco)— se identifica por la dirección hacia la que apunta la punta de cada ficha pentagonal.",
      seo_art2_title: "🔄 La Regla de Reincorporación (Drops / 打ち)",
      seo_art2_text: "La característica estratégica que hace único al Shōgi en todo el mundo es que las piezas capturadas nunca mueren. Cuando capturas una ficha del adversario, esta pierde su promoción, pasa a tu soporte lateral (Komadai) y en cualquiera de tus turnos posteriores puedes gastarlo para reincorporarla en una casilla vacía como parte de tu propio ejército.",
      seo_art3_title: "⚡ Zona de Promoción (成り) y Reglas Especiales",
      seo_art3_text: "Las 3 filas más alejadas de cada jugador conforman la zona de promoción. Al entrar, moverse o salir de ella, los Peones, Lanceros, Caballos y Generales de Plata pueden promocionar para mover como un General de Oro, mientras que la Torre se corona en Rey Dragón (龍) y el Alfil en Caballo Dragón (馬). El motor valida además las prohibiciones oficiales de Nifu (dos peones en la misma columna) y Uchifuzume.",

      // Game Arena
      gote_title: "Gote · Blanco",
      sente_title: "Sente · Negro",
      waiting_player: "Esperando jugador...",
      your_turn: "Tu turno",
      their_turn: "Su turno",
      komadai_top_title: "Piezas en mano (Komadai)",
      komadai_bottom_title: "Piezas en mano (clic para reincorporar)",
      match_status_heading: "Estado de la Partida",
      loading_game: "Cargando partida...",
      check_alert_text: "¡Jaque al Rey (王手 - Ōte)!",
      invite_waiting_text: "Esperando a tu oponente. Comparte este enlace o espera a que alguien se una desde el Lobby:",
      btn_copy_inline: "Copiar",
      btn_reset_board: "Reiniciar tablero",
      btn_resign: "Rendirse",
      board_hint: "Selecciona una pieza de tu bando para ver sus movimientos legales, o haz clic en una pieza capturada de tu reserva para reincorporarla.",
      history_heading: "Registro de Jugadas",
      moves_count: "{n} jugadas",
      no_moves: "Sin jugadas",

      // Modals
      create_modal_title: "Crear Nueva Sala de Shōgi",
      room_title_label: "Nombre de la sala (opcional)",
      room_title_placeholder: "Ej. Dojo Principiantes",
      mode_legend: "Modo y visibilidad",
      mode_pub_title: "Sala Online Pública (Visible en el Lobby)",
      mode_pub_sub: "Cualquier jugador en el Lobby podrá unirse con un clic.",
      mode_priv_title: "Sala Online Privada (Solo con Código / Link)",
      mode_priv_sub: "No aparece en la lista pública; invita con el enlace directo.",
      mode_ai_title: "1 Jugador contra Sensei Bot 🤖 (IA)",
      mode_ai_sub: "Practica una partida completa en solitario contra el bot del Dojo.",
      mode_local_title: "2 Jugadores en este Dispositivo",
      mode_local_sub: "Turnos compartidos en la misma pantalla.",
      color_legend: "Elige tu bando inicial",
      color_sente: "☗ Sente (Negro · Empieza)",
      color_gote: "☖ Gote (Blanco · 2.º turno)",
      btn_create_submit: "Crear Sala y Entrar",

      // Promote Dialog
      promote_title: "¿Promocionar pieza (成り)?",
      promote_desc: "Tu pieza entró en la zona de promoción enemiga (últimas 3 filas).",
      btn_promote_no: "Mantener normal",
      btn_promote_yes: "Promocionar (+)",

      // Sensei Panel
      btn_tut_prev: "← Lección anterior",
      btn_tut_retry: "Reiniciar ejercicio",
      btn_tut_next: "Siguiente lección →",
      btn_finish_course: "Finalizar Curso y Volver al Lobby",

      // Footer
      footer_about: "Sobre Nosotros & Contacto",
      footer_privacy: "Política de Privacidad",
      footer_terms: "Términos de Servicio",
      footer_sitemap: "Sitemap XML",
      footer_bug: "🐞 Reportar Error",
      footer_desc: "Plataforma web comunitaria e independiente para jugar al Shōgi (Ajedrez Tradicional Japonés) online en tiempo real para 2 jugadores, con motor de reglas oficiales en Python, Lobby de Matchmaking y Academia interactiva paso a paso en español e inglés.",
      footer_copy: "© 2026 Shōgi Dojo Online. Creado y mantenido con dedicación por <strong>Javier Valdivieso</strong> (Mendoza, Argentina).",
      footer_license: 'Motor en Python (<code>Tablero</code>, <code>Jugador</code>, <code>Pieza</code>) bajo Licencia MIT · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>',

      // Glosario y Reglas
      rules_dialog_title: "Glosario de Piezas y Movimientos de Shōgi",
      guide_koma_k: "K · Rey",
      guide_piece_k_title: "Rey (王將 / 玉將 · K)",
      guide_piece_k_desc: "Se mueve 1 casilla en cualquier dirección (ortogonal o diagonal). No promociona.",
      guide_koma_r: "R → +R (龍王)",
      guide_piece_r_title: "Torre (飛車 · R)",
      guide_piece_r_desc: "Se desliza cualquier número de casillas en cruz (vertical/horizontal). <strong>Promoción (Dragón):</strong> suma 1 paso en las 4 diagonales.",
      guide_koma_b: "B → +B (龍馬)",
      guide_piece_b_title: "Alfil (角行 · B)",
      guide_piece_b_desc: "Se desliza cualquier número de casillas en diagonal. <strong>Promoción (Caballo Dragón):</strong> suma 1 paso ortogonal en cruz.",
      guide_koma_g: "G · Oro",
      guide_piece_g_title: "General de Oro (金將 · G)",
      guide_piece_g_desc: "Mueve 1 casilla hacia adelante, a los lados, atrás o en las 2 diagonales delanteras (todas menos las 2 diagonales traseras).",
      guide_koma_s: "S → +S (成銀)",
      guide_piece_s_title: "General de Plata (銀將 · S)",
      guide_piece_s_desc: "Mueve 1 casilla hacia adelante o en las 4 diagonales. <strong>Promoción:</strong> pasa a mover como General de Oro.",
      guide_koma_n: "N → +N (成桂)",
      guide_piece_n_title: "Caballo (桂馬 · N)",
      guide_piece_n_desc: "Salta 2 casillas hacia adelante y 1 a la izquierda o derecha (única pieza que salta). <strong>Promoción:</strong> mueve como General de Oro.",
      guide_koma_l: "L → +L (成香)",
      guide_piece_l_title: "Lancero (香車 · L)",
      guide_piece_l_desc: "Se desliza cualquier número de casillas únicamente hacia adelante. <strong>Promoción:</strong> mueve como General de Oro.",
      guide_koma_p: "P → +P (と金)",
      guide_piece_p_title: "Peón (歩兵 · P)",
      guide_piece_p_desc: "Avanza 1 casilla hacia adelante (captura también de frente). <strong>Promoción (Tokin):</strong> mueve como General de Oro.",
      special_rules_title: "Reglas Especiales Implementadas",
      special_rule_orient: "<strong>Orientación en el tablero:</strong> En Shōgi las fichas no se distinguen por color de madera, sino por la dirección a la que apunta su punta pentagonal. <strong>Sente (Negro ☗)</strong> apunta hacia arriba (filas 8 → 0) y <strong>Gote (Blanco ☖)</strong> hacia abajo (filas 0 → 8).",
      special_rule_drops: "<strong>Reincorporación (Drops / <span lang=\"ja\">打ち</span>):</strong> Las piezas capturadas pierden su promoción, pasan a tu <em>Komadai</em> (reserva) y en tu turno puedes colocarlas en cualquier casilla vacía.",
      special_rule_nifu: "<strong>Nifu (<span lang=\"ja\">二歩</span> - Dos Peones):</strong> No puedes reincorporar un peón en una columna donde ya tengas otro peón sin promocionar.",
      special_rule_uchifuzume: "<strong>Uchifuzume (<span lang=\"ja\">打ち歩詰め</span>):</strong> No está permitido reincorporar un peón de la reserva dando jaque mate inmediato; sí puedes dar jaque mate moviendo un peón que ya estaba en el tablero.",
      special_rule_future: "<strong>Casillas con movimiento futuro:</strong> Peones y lanceros no pueden reincorporarse en la última fila enemiga, ni los caballos en las dos últimas filas.",

      // Bug Dialog
      bug_dialog_title: "🐞 Reportar Error o Sugerencia",
      bug_category_label: "Categoría del problema",
      bug_opt_rules: "Regla de Shōgi / Movimiento de pieza",
      bug_opt_tutorial: "Tutorial / Academia de 12 lecciones",
      bug_opt_visual: "Visual / Tamaño o diseño del tablero",
      bug_opt_lobby: "Lobby / Matchmaking / Conexión",
      bug_opt_other: "Otro / Sugerencia de mejora",
      bug_context_label: "Contexto detectado automáticamente",
      bug_desc_label: "¿Qué ocurrió o qué deberíamos corregir?",
      bug_desc_placeholder: "Describe brevemente el error (ej: En la lección 4 intenté mover el peón a tal casilla y...)",
      bug_contact_label: "Tu correo o usuario (opcional, por si quieres respuesta)",
      bug_contact_placeholder: "opcional@correo.com",
      btn_submit_bug: "Enviar Reporte al Dojo",
      link_github_issue: "Abrir Issue en GitHub ↗",
      link_mailto_bug: "Enviar por Email ✉",

      // In-Game Dynamic Alerts
      role_sente: "Juegas con Negro ☗",
      role_gote: "Juegas con Blanco ☖",
      role_both: "Modo Local (Ambos)",
      role_spectator: "Espectador",
      turn_sente: "Turno: Negras (Sente ☗)",
      turn_gote: "Turno: Blancas (Gote ☖)",
      game_over: "Fin de la partida",
      winner_sente: "¡Ganan las Negras (Sente ☗)!",
      winner_gote: "¡Ganan las Blancas (Gote ☖)!",
      resign_confirm: "¿Estás seguro de que deseas rendirte? La partida terminará como victoria para tu rival.",
      resign_reason: "Rendición del jugador.",
      bot_thinking: "Sensei Bot está pensando su jugada...",
      link_copied: "¡Enlace copiado al portapapeles!",
      cannot_move_in_check: "¡Movimiento ilegal! Tu Rey seguiría bajo jaque.",
      drop_nifu_err: "¡Regla Nifu violada! No puedes colocar dos peones sin promocionar en la misma columna.",
      drop_uchifuzume_err: "¡Regla Uchifuzume! Está prohibido dar jaque mate soltando un peón de la reserva.",
    },

    en: {
      site_title: "Dojo Shōgi Online (将棋) | Free Japanese Chess for 2 Players & Academy",
      subtitle: "Online Dojo · Real-Time Matchmaking & Game Rooms",
      btn_back_lobby: "← Back to Lobby",
      room_label: "Room:",
      role_no_room: "No room",
      btn_copy_link: "Copy invite link",
      btn_flip_board: "Flip board",
      btn_learn_play: "🎓 Learn to Play",
      btn_music_off: "🎵 Music: OFF",
      btn_music_on: "🎶 Music: ON",
      music_label: "Dojo ambient relaxing music controls",
      music_vol_label: "Ambient music volume",
      btn_create_room_top: "+ Create Room",
      btn_rules_top: "Rules & Glossary",
      btn_bug_top: "🐞 Report Issue",
      lang_switch_label: "Language / Idioma",

      // Lobby
      player_name_label: "Your Dojo Player Nickname",
      player_name_placeholder: "e.g. Kenshin",
      online_suffix: "in the lobby",
      quick_match_title: "Quick Matchmaking (対局)",
      quick_match_desc: "Find another player in queue and start an online real-time match instantly with automatic side assignment.",
      searching_rival: "0 searching rival",
      searching_rival_n: "{n} searching rival",
      btn_quick_match: "⚔️ Find Opponent Now",
      btn_cancel_match: "Cancel Search",
      btn_play_ai: "🤖 Play vs AI Bot (1P)",
      searching_status: "Searching for an opponent in real time... Waiting for another player...",

      // Academy Banner
      academy_badge: "🎓 Complete Interactive Academy · 12 Step-by-Step Lessons",
      academy_heading: "Interactive Course: Piece Movements, Core Rules & Tactics",
      academy_desc: "Master Shōgi from scratch with movement compass diagrams and interactive on-board practice: King, Gold General, Silver General, Pawn & Tokin, Lance, Knight, Bishop & Dragon Horse, Rook & Dragon, Drops (Reincorporations), prohibitions (Nifu & Uchifuzume), Check Defense, and Checkmate.",
      btn_start_course: "🎓 Start Course from Lesson 1",

      // Lobby columns
      open_rooms_heading: "Open Rooms Waiting for Opponents",
      btn_new_public_room: "+ New Public Room",
      no_open_rooms: "No rooms waiting for players. Create one or click Find Opponent!",
      join_code_heading: "Join with Private Code",
      join_code_placeholder: "CODE (6 LETTERS)",
      btn_direct_join: "Join",
      live_rooms_heading: "Live Matches (Spectator)",
      no_live_rooms: "No active matches right now.",
      online_players_heading: "Players in Lobby",

      // Auth & Leaderboard
      btn_login_google: "Sign in with Google",
      btn_logout: "Sign out",
      leaderboard_title: "🏆 Hall of Fame (Leaderboard)",
      leaderboard_tag: "Competitive",
      rank_col: "#",
      player_col: "Player",
      rating_col: "Rating",
      victories_col: "W / L",
      winrate_col: "Win Rate",
      leaderboard_empty: "No rated matches yet. Sign in with Google, play a match, and lead the Hall of Fame!",
      recent_matches_title: "📜 Recent Matches Played",
      matches_tag: "Live",
      recent_matches_empty: "No matches recorded recently.",

      // SEO Editorial
      seo_heading: "What is Shōgi (将棋) and How Does Japanese Chess Work?",
      seo_art1_title: "🏯 The 9×9 Board & Pentagonal Pieces (Koma)",
      seo_art1_text: "Shōgi, known in Japan as the Game of Generals, is played on a 9×9 grid (Shōgiban). Unlike Western chess, all pieces share the same natural wooden hue: ownership by Sente (☗ Black, moves first) or Gote (☖ White) is determined by the direction the pentagonal tip points — your pieces point forward toward your opponent.",
      seo_art2_title: "🔄 The Drop Rule (Reincorporation / 打ち)",
      seo_art2_text: "The signature feature that makes Shōgi unique worldwide is that captured pieces never leave the game. When you capture an opponent's piece, it loses any promotion, joins your hand reserve (Komadai), and on any subsequent turn you may drop it onto any empty square as an active soldier in your army.",
      seo_art3_title: "⚡ Promotion Zones (成り) & Prohibitions",
      seo_art3_text: "The three farthest ranks form each player's promotion zone. When entering, moving within, or exiting, Pawns, Lances, Knights, and Silver Generals can promote into Gold-equivalent powers, while the Rook crowns into a Dragon King (龍) and the Bishop into a Dragon Horse (馬). The engine also enforces Nifu (two unpromoted pawns on a file) and Uchifuzume (drop pawn mate).",

      // Game Arena
      gote_title: "Gote · White",
      sente_title: "Sente · Black",
      waiting_player: "Waiting for opponent...",
      your_turn: "Your turn",
      their_turn: "Their turn",
      komadai_top_title: "Captured in hand (Komadai)",
      komadai_bottom_title: "Captured in hand (click to drop)",
      match_status_heading: "Match Status",
      loading_game: "Loading match...",
      check_alert_text: "Check on the King (王手 - Ōte)!",
      invite_waiting_text: "Waiting for your opponent. Share this invite link or wait for someone to join from the Lobby:",
      btn_copy_inline: "Copy",
      btn_reset_board: "Reset Board",
      btn_resign: "Resign",
      board_hint: "Select a piece of your army to view legal moves, or click a captured piece in your hand reserve to drop it.",
      history_heading: "Move History",
      moves_count: "{n} moves",
      no_moves: "No moves yet",

      // Modals
      create_modal_title: "Create New Shōgi Room",
      room_title_label: "Room title (optional)",
      room_title_placeholder: "e.g. Beginners Dojo",
      mode_legend: "Game Mode & Visibility",
      mode_pub_title: "Public Online Room (Visible in Lobby)",
      mode_pub_sub: "Anyone in the Lobby can join with a single click.",
      mode_priv_title: "Private Online Room (Code / Link Only)",
      mode_priv_sub: "Hidden from the public list; players join via your link.",
      mode_ai_title: "1 Player vs Sensei Bot 🤖 (AI)",
      mode_ai_sub: "Practice a full match in solo mode against the Dojo engine.",
      mode_local_title: "2 Players on this Device (Pass & Play)",
      mode_local_sub: "Take turns sharing the same screen.",
      color_legend: "Choose your starting army",
      color_sente: "☗ Sente (Black · Moves First)",
      color_gote: "☖ Gote (White · Moves Second)",
      btn_create_submit: "Create Room & Enter",

      // Promote Dialog
      promote_title: "Promote piece (成り)?",
      promote_desc: "Your piece has entered or moved inside the enemy promotion zone (last 3 ranks).",
      btn_promote_no: "Keep Normal",
      btn_promote_yes: "Promote (+)",

      // Sensei Panel
      btn_tut_prev: "← Previous lesson",
      btn_tut_retry: "Reset exercise",
      btn_tut_next: "Next lesson →",
      btn_finish_course: "Finish Course & Back to Lobby",

      // Footer
      footer_about: "About Us & Contact",
      footer_privacy: "Privacy Policy",
      footer_terms: "Terms of Service",
      footer_sitemap: "XML Sitemap",
      footer_bug: "🐞 Report Issue",
      footer_desc: "Free and independent community platform to play Shōgi (Traditional Japanese Chess) online in real-time for 2 players or vs AI, with official rule motor in Python, Matchmaking Lobby, and interactive 12-lesson Dojo Academy in Spanish and English.",
      footer_copy: "© 2026 Shōgi Dojo Online. Created and maintained with care by <strong>Javier Valdivieso</strong> (Mendoza, Argentina).",
      footer_license: 'Python Engine (<code>Tablero</code>, <code>Jugador</code>, <code>Pieza</code>) under MIT License · <a href="https://github.com/valdivieso01/shogi-web" target="_blank" rel="noopener noreferrer">GitHub: valdivieso01/shogi-web</a>',

      // Rules & Glossary
      rules_dialog_title: "Piece Glossary & Shōgi Rules",
      guide_koma_k: "K · King",
      guide_piece_k_title: "King (王將 / 玉將 · K)",
      guide_piece_k_desc: "Moves 1 square in any direction (orthogonal or diagonal). Never promotes.",
      guide_koma_r: "R → +R (龍王)",
      guide_piece_r_title: "Rook (飛車 · R)",
      guide_piece_r_desc: "Slides any number of squares orthogonally (cross). <strong>Promotion (Dragon King):</strong> adds 1 step in all 4 diagonals.",
      guide_koma_b: "B → +B (龍馬)",
      guide_piece_b_title: "Bishop (角行 · B)",
      guide_piece_b_desc: "Slides any number of squares diagonally. <strong>Promotion (Dragon Horse):</strong> adds 1 orthogonal step in cross.",
      guide_koma_g: "G · Gold",
      guide_piece_g_title: "Gold General (金將 · G)",
      guide_piece_g_desc: "Moves 1 square forward, sideways, backward, or 2 forward diagonals (all except 2 backward diagonals).",
      guide_koma_s: "S → +S (成銀)",
      guide_piece_s_title: "Silver General (銀將 · S)",
      guide_piece_s_desc: "Moves 1 square forward or in all 4 diagonals. <strong>Promotion:</strong> moves as a Gold General.",
      guide_koma_n: "N → +N (成桂)",
      guide_piece_n_title: "Knight (桂馬 · N)",
      guide_piece_n_desc: "Jumps 2 squares forward and 1 left or right (only jumping piece). <strong>Promotion:</strong> moves as a Gold General.",
      guide_koma_l: "L → +L (成香)",
      guide_piece_l_title: "Lance (香車 · L)",
      guide_piece_l_desc: "Slides any number of squares straight forward. <strong>Promotion:</strong> moves as a Gold General.",
      guide_koma_p: "P → +P (と金)",
      guide_piece_p_title: "Pawn (歩兵 · P)",
      guide_piece_p_desc: "Advances 1 square straight forward (also captures forward). <strong>Promotion (Tokin):</strong> moves as a Gold General.",
      special_rules_title: "Special Rules Implemented",
      special_rule_orient: "<strong>Board Orientation:</strong> In Shōgi, pieces are not distinguished by wood color, but by the direction their pentagonal tip faces. <strong>Sente (Black ☗)</strong> points forward/up (ranks 8 → 0) and <strong>Gote (White ☖)</strong> points downward (ranks 0 → 8).",
      special_rule_drops: "<strong>Drops (Reincorporation / <span lang=\"ja\">打ち</span>):</strong> Captured pieces lose any promotion, enter your hand reserve (<em>Komadai</em>), and can be dropped onto any vacant square on your turn.",
      special_rule_nifu: "<strong>Nifu (<span lang=\"ja\">二歩</span> - Two Pawns):</strong> You cannot drop a pawn on a vertical file that already contains another of your unpromoted pawns.",
      special_rule_uchifuzume: "<strong>Uchifuzume (<span lang=\"ja\">打ち歩詰め</span>):</strong> Delivering immediate checkmate by dropping a pawn is strictly prohibited (moving an on-board pawn to mate is legal).",
      special_rule_future: "<strong>Future Move Rule:</strong> Pawns and Lances cannot be dropped on the farthest rank, nor Knights on the farthest two ranks.",

      // Bug Dialog
      bug_dialog_title: "🐞 Report Issue or Suggestion",
      bug_category_label: "Problem Category",
      bug_opt_rules: "Shōgi Rule / Piece movement",
      bug_opt_tutorial: "12-Lesson Academy / Tutorial",
      bug_opt_visual: "Visual / Board design",
      bug_opt_lobby: "Lobby / Matchmaking / Connection",
      bug_opt_other: "Other / Feature suggestion",
      bug_context_label: "Auto-detected Context",
      bug_desc_label: "What happened or what should we improve?",
      bug_desc_placeholder: "Briefly describe the issue (e.g. In lesson 4 I moved the pawn to...)",
      bug_contact_label: "Your email or username (optional)",
      bug_contact_placeholder: "optional@email.com",
      btn_submit_bug: "Submit Report to Dojo",
      link_github_issue: "Open GitHub Issue ↗",
      link_mailto_bug: "Send via Email ✉",

      // In-Game Dynamic Alerts
      role_sente: "Playing as Black ☗",
      role_gote: "Playing as White ☖",
      role_both: "Local Mode (Both)",
      role_spectator: "Spectator",
      turn_sente: "Turn: Black (Sente ☗)",
      turn_gote: "Turn: White (Gote ☖)",
      game_over: "Game Over",
      winner_sente: "Black Wins (Sente ☗)!",
      winner_gote: "White Wins (Gote ☖)!",
      resign_confirm: "Are you sure you want to resign? The game will end with a victory for your opponent.",
      resign_reason: "Player resignation.",
      bot_thinking: "Sensei Bot is contemplating its move...",
      link_copied: "Invite link copied to clipboard!",
      cannot_move_in_check: "Illegal move! Your King remains under check.",
      drop_nifu_err: "Nifu rule violation! You cannot drop two unpromoted pawns on the same file.",
      drop_uchifuzume_err: "Uchifuzume rule! Checkmate cannot be delivered by dropping a pawn from your reserve.",
    },
  };

  const PIECE_LABELS = {
    es: {
      K: "Rey",
      R: "Torre",
      "R+": "Dragón",
      B: "Alfil",
      "B+": "C.Dragón",
      G: "Oro",
      S: "Plata",
      "S+": "Plata+",
      N: "Caballo",
      "N+": "Caballo+",
      L: "Lancero",
      "L+": "Lancero+",
      P: "Peón",
      "P+": "Tokin",
    },
    en: {
      K: "King",
      R: "Rook",
      "R+": "Dragon",
      B: "Bishop",
      "B+": "Horse",
      G: "Gold",
      S: "Silver",
      "S+": "+Silver",
      N: "Knight",
      "N+": "+Knight",
      L: "Lance",
      "L+": "+Lance",
      P: "Pawn",
      "P+": "Tokin",
    },
  };

  const TUTORIAL_PILLS = {
    es: [
      "1. El Rey (王 · K)",
      "2. General de Oro (金 · G)",
      "3. General de Plata (銀 · S)",
      "4. Peón y Tokin (歩 → と)",
      "5. El Lancero (香 · L)",
      "6. El Caballo (桂 · N)",
      "7. Alfil y C.Dragón (角 → 馬)",
      "8. Torre y Dragón (飛 → 龍)",
      "9. Reincorporar (Drops)",
      "10. Reglas Nifu y Uchifuzume",
      "11. Defender un Jaque",
      "12. Jaque Mate (Atama-kin)",
    ],
    en: [
      "1. The King (王 · K)",
      "2. Gold General (金 · G)",
      "3. Silver General (銀 · S)",
      "4. Pawn & Tokin (歩 → と)",
      "5. The Lance (香 · L)",
      "6. The Knight (桂 · N)",
      "7. Bishop & Horse (角 → 馬)",
      "8. Rook & Dragon (飛 → 龍)",
      "9. Drops (Reincorporation)",
      "10. Nifu & Uchifuzume Rules",
      "11. Defending Against Check",
      "12. Checkmate (Atama-kin)",
    ],
  };

  const TUTORIAL_EN_TEXTS = [
    {
      title: "1. The King (王 · K): Movement & Escaping Check",
      text: "The King (Gyoku / Ōshō) is the most critical piece: if surrounded without escape (Checkmate), the match ends. In Shōgi, pieces are not divided by wood color, but by the direction their pentagonal tip points: yours (Sente ☗) always point forward/up.",
      keyPoints: [
        "<strong>How does the King move?</strong> Exactly <strong>1 square in any of the 8 directions</strong> (forward, backward, sides, and all 4 diagonals).",
        "<strong>Does it promote?</strong> No, the King never promotes.",
        "<strong>Check Rule (Ōte):</strong> You may never leave your King under attack. In this drill, an enemy Rook at (5, 4) is checking your King at (8, 4).",
      ],
      objective: "👉 Click your King at (8, 4). Notice you cannot move forward along column 4 due to the enemy Rook's ray: step diagonally to (7, 3) to safety alongside your Generals.",
      afterSuccessText: "Well done! The King steps 1 square in all directions. In real Shōgi games, protect your King behind Gold and Silver Generals by constructing a castle (Kakoi).",
    },
    {
      title: "2. The Gold General (金 · G): The 6-Direction Shield",
      text: "The Gold General (Kinshō) is the King's primary bodyguard. Mastering its moves is essential because 4 different pieces (Pawn, Lance, Knight, and Silver) promote and move exactly like a Gold General.",
      keyPoints: [
        "<strong>How does Gold move?</strong> Exactly <strong>1 square in 6 directions</strong>: forward, left, right, backward, and the <strong>2 forward diagonals</strong>.",
        "<strong>Blind Spot (✕):</strong> It <strong>CANNOT move to the 2 backward diagonals</strong> (notice the red ✕ in the diagram).",
        "<strong>Does it promote?</strong> No, Gold is already at maximum rank.",
      ],
      objective: "👉 An enemy Knight infiltrated to (6, 4). Select your Gold General at (7, 3) and use its forward-right diagonal to capture it at (6, 4).",
      afterSuccessText: "Spot on! Always visualize the Gold's shape: 3 squares above, 2 sideways, and 1 straight backward.",
    },
    {
      title: "3. Silver General (銀 · S): Diagonal Assault vs Promotion",
      text: "The Silver General (Ginshō) is the offensive partner to Gold. While beginners often confuse them, their movements are complementary: Silver commands all 4 diagonals, but has no sideways or straight-backward moves.",
      keyPoints: [
        "<strong>How does Silver move?</strong> <strong>1 square in 5 directions</strong>: straight forward and all <strong>4 diagonals</strong> (including both backward diagonals!).",
        "<strong>Blind Spot (✕):</strong> It <strong>CANNOT move sideways or straight backward</strong>.",
        "<strong>When to promote (+S · 全)?</strong> Promoting turns it into a Gold: it gains sides and back, but loses its retreat diagonals.",
      ],
      objective: "👉 Advance your Silver at (6, 4) diagonally forward to (5, 3) into enemy territory.",
      afterSuccessText: "Great move! Silver's ability to retreat diagonally makes it the premier climbing general (Bōgin) in offensive openings.",
    },
    {
      title: "4. Pawn & Tokin (歩 → と): Step-by-Step Advance and Coronation",
      text: "Unlike Western chess pawns which capture diagonally, Shōgi Pawns (Fuhyō) move and capture 1 square straight forward. When reaching the promotion zone, they crown into a powerful Tokin (と), moving identically to a Gold General!",
      keyPoints: [
        "<strong>How does a Pawn move?</strong> Exactly <strong>1 square straight forward</strong>. Captures are also made straight ahead.",
        "<strong>Promotion to Tokin (と):</strong> When promoted, this humble 1-point pawn becomes a full Gold General, but if captured, it reverts to a normal pawn in the captor's hand.",
      ],
      objective: "👉 Advance your Pawn at (3, 4) into the promotion zone at (2, 4) and select 'Promote (+)' in the pop-up.",
      afterSuccessText: "Outstanding! A promoted Pawn (Tokin) gives you the power of a Gold General at zero sacrifice if exchanged.",
    },
    {
      title: "5. The Lance (香 · L): The Forward Spear",
      text: "The Lance (Kyōsha), nicknamed the 'Spearman', charges down vertical files like a one-way vertical Rook. It can never move backward or sideways.",
      keyPoints: [
        "<strong>Movement:</strong> Slides <strong>any number of unobstructed squares straight forward</strong>.",
        "<strong>Promotion (+L · 杏):</strong> Becomes a Gold General upon reaching enemy ranks.",
      ],
      objective: "👉 Select your Lance at (7, 8) and strike along file 8 to capture the enemy Gold at (2, 8), crowning into Promoted Lance.",
      afterSuccessText: "Superb! Lances exert immense linear pressure along the edge files (file 1 and 9).",
    },
    {
      title: "6. The Knight (桂 · N): Jumping Over Pieces",
      text: "The Shōgi Knight (Keima) is the ONLY piece allowed to leap over intervening pieces. Unlike Western chess, it cannot move sideways or backward: it only jumps 2 squares forward and 1 square left or right.",
      keyPoints: [
        "<strong>Movement:</strong> Jumps <strong>2 squares forward + 1 square left or right</strong>.",
        "<strong>Commitment:</strong> A Knight jump is irreversible — it cannot retreat unless it promotes into a Gold!",
      ],
      objective: "👉 Leap your Knight from (7, 2) over friendly pawns to land on (5, 3), fork-threatening enemy pieces.",
      afterSuccessText: "Well done! The Knight's jump is deadly because pawns in front cannot block it.",
    },
    {
      title: "7. Bishop & Dragon Horse (角 → 馬): Dominating Diagonals",
      text: "The Bishop (Kakugyō) slices across any distance diagonally. When crowned into a Dragon Horse (Ryūma), it retains all its infinite diagonals and adds 1 orthogonal step in all 4 directions (cross).",
      keyPoints: [
        "<strong>Bishop:</strong> Slides any distance along all 4 diagonals.",
        "<strong>Dragon Horse (+B · 馬):</strong> Unlimited diagonals PLUS 1 square up, down, left, right.",
      ],
      objective: "👉 Move your Bishop from (7, 1) across the board to (2, 6) in the promotion zone and promote to Dragon Horse (+).",
      afterSuccessText: "Fantastic! The Dragon Horse is one of the two apex heavy pieces on the Shōgi battlefield.",
    },
    {
      title: "8. Rook & Dragon King (飛 → 龍): The Apex Attacker",
      text: "The Rook (Hisha) controls entire vertical and horizontal files. Once promoted into the Dragon King (Ryūō), it gains 1 step in all 4 diagonals, making it arguably the strongest piece in the game.",
      keyPoints: [
        "<strong>Rook:</strong> Slides any distance orthogonally (cross).",
        "<strong>Dragon King (+R · 龍):</strong> Unlimited cross lines PLUS 1 square along each of the 4 diagonals.",
      ],
      objective: "👉 Slide your Rook from (7, 1) along rank 7 to (7, 7) and enter the enemy zone to promote to Dragon King.",
      afterSuccessText: "Magnificent! A Dragon King invading the opponent's camp spells doom for their defensive castle.",
    },
    {
      title: "9. Drops (Reincorporation / 打ち): Reviving Captured Pieces",
      text: "In Shōgi, captured pieces go to your reserve (Komadai). On any turn, instead of moving a piece on the board, you can drop any captured piece onto any vacant square as your own!",
      keyPoints: [
        "<strong>Drop Rule:</strong> Place a piece from your reserve onto an empty square.",
        "<strong>Always Unpromoted:</strong> Even if captured as a promoted piece, it drops in its base form.",
      ],
      objective: "👉 Click the Silver General in your hand reserve below, then drop it onto square (4, 4) to fork the enemy King.",
      afterSuccessText: "Brilliant! Drops ensure that Shōgi never enters boring, simplified endgames — matches stay tactical until the very end.",
    },
    {
      title: "10. Nifu & Uchifuzume: Critical Prohibitions",
      text: "Because drops are so potent, Shōgi has strict anti-abuse rules: Nifu (Two Pawns) and Uchifuzume (Pawn Drop Mate).",
      keyPoints: [
        "<strong>Nifu (二歩):</strong> You cannot drop a pawn on a vertical file that already contains another of your unpromoted pawns.",
        "<strong>Uchifuzume (打ち歩詰め):</strong> You cannot deliver immediate checkmate by DROPPING a pawn (moving a pawn already on the board to mate is legal).",
      ],
      objective: "👉 Notice file 4 already has your unpromoted pawn (Nifu prohibition). Drop your reserve Pawn onto file 3 at (5, 3) to break the enemy camp legally.",
      afterSuccessText: "Perfect! Respecting Nifu and Uchifuzume is the mark of a disciplined Shōgi player.",
    },
    {
      title: "11. Defending Against Check: Parrying Enemy Attacks",
      text: "When an opponent checks your King, you MUST resolve the check immediately using one of three methods: fleeing with the King, capturing the attacking piece, or dropping an interposing piece (Aigoma).",
      keyPoints: [
        "<strong>1. Evade:</strong> Move the King to a safe square.",
        "<strong>2. Capture:</strong> Take the checking piece.",
        "<strong>3. Interpose (Aigoma):</strong> Drop a piece between the checker and your King to block the line.",
      ],
      objective: "👉 An enemy Rook is checking your King. Drop a Gold General from your hand at (6, 4) to shield your King.",
      afterSuccessText: "Masterful defense! Interposing shields (Aigoma) neutralize long-range attacks and counter-attack the checking piece.",
    },
    {
      title: "12. Checkmate (Atama-kin): The Classic Golden Finish",
      text: "The most famous checkmate pattern in Shōgi history is Atama-kin (Head Gold): dropping a Gold General directly in front of the opponent's King, where it covers all front and side escape squares!",
      keyPoints: [
        "<strong>Atama-kin pattern:</strong> Gold dropped directly in front of the King.",
        "<strong>Guard:</strong> A friendly piece (like a Rook or Silver) must defend the Gold so the King cannot capture it.",
      ],
      objective: "👉 The enemy King is cornered at (0, 4) and your Rook guards column 4. Drop your Gold General from hand at (1, 4) directly in the King's face to deliver checkmate!",
      afterSuccessText: "🎉 Tsumi! CHECKMATE! You have completed the 12 lessons of the Dojo Shōgi Academy. You are now fully prepared to battle online players and the Sensei Bot!",
    },
  ];

  function getLessonText(idx, lang) {
    if (lang === "en" && TUTORIAL_EN_TEXTS[idx]) {
      return TUTORIAL_EN_TEXTS[idx];
    }
    return null;
  }

  function t(key, params = {}) {
    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS.es;
    let str = langDict[key] || TRANSLATIONS.es[key] || key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return str;
  }

  function getPieceLabel(code, promoted) {
    const key = promoted ? `${code}+` : code;
    const dict = PIECE_LABELS[currentLang] || PIECE_LABELS.es;
    return dict[key] || dict[code] || code;
  }

  function applyTranslations() {
    document.documentElement.lang = currentLang;

    // Direct data-i18n text content
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(key);
      if (val) el.textContent = val;
    });

    // data-i18n-html for elements with markup
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const val = t(key);
      if (val) el.innerHTML = val;
    });

    // data-i18n-placeholder
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(key);
      if (val) el.setAttribute("placeholder", val);
    });

    // data-i18n-label / aria-label
    document.querySelectorAll("[data-i18n-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-label");
      const val = t(key);
      if (val) el.setAttribute("aria-label", val);
    });

    // Update document title
    document.title = t("site_title");

    // Update current language label on switcher button
    const langLabel = document.getElementById("current-lang-label");
    if (langLabel) {
      langLabel.textContent = currentLang.toUpperCase();
    }

    // Update Academy Chapter pills in lobby
    const pillButtons = document.querySelectorAll("#tutorial-chapters-pills .chapter-pill");
    const pillsList = TUTORIAL_PILLS[currentLang] || TUTORIAL_PILLS.es;
    pillButtons.forEach((btn, idx) => {
      if (pillsList[idx]) btn.textContent = pillsList[idx];
    });

    // Update footer navigation links according to current language
    const linkAbout = document.getElementById("footer-link-about");
    if (linkAbout) linkAbout.href = currentLang === "en" ? "/about" : "/sobre-nosotros";
    const linkPrivacy = document.getElementById("footer-link-privacy");
    if (linkPrivacy) linkPrivacy.href = currentLang === "en" ? "/privacy" : "/politica-de-privacidad";
    const linkTerms = document.getElementById("footer-link-terms");
    if (linkTerms) linkTerms.href = currentLang === "en" ? "/terms" : "/terminos-de-servicio";

    // Broadcast change to app.js
    window.dispatchEvent(new CustomEvent("shogi:langchange", { detail: { lang: currentLang } }));
  }

  function setLanguage(newLang) {
    if (newLang !== "es" && newLang !== "en") return;
    currentLang = newLang;
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (_) {}
    applyTranslations();
  }

  function toggleLanguage() {
    setLanguage(currentLang === "es" ? "en" : "es");
  }

  // Initialize on DOM load
  window.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("btn-toggle-lang");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", toggleLanguage);
    }
    applyTranslations();
  });

  window.i18n = {
    t,
    setLanguage,
    toggleLanguage,
    getLanguage: () => currentLang,
    getPieceLabel,
    getLessonText,
    applyTranslations,
    TUTORIAL_PILLS,
  };
})();
