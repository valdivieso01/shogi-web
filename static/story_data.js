/* ==========================================
   MODO HISTORIA: CRÓNICAS DEL SENGOKU (5 CAPÍTULOS)
   Datos de Personajes, Retratos Ukiyo-e y Diálogos
   ========================================== */
window.STORY_BOSSES = [
  {
    chapter: 1,
    id: "ashigaru",
    name: "Ashigaru Tōkichi",
    kanji: "足軽 藤吉",
    mon: "歩",
    portrait: "/static/portraits/ashigaru.jpg",
    stars: 1,
    elo: 800,
    era: { es: "1554 · Provincia de Owari", en: "1554 · Owari Province" },
    role: { es: "Soldado de Infantería", en: "Foot Soldier of Owari" },
    desc: {
      es: "Joven recluta con sandalias de paja. Avanza con entusiasmo pero descuida su retaguardia y comete errores tácticos.",
      en: "Eager young recruit in straw sandals. Advances boldly but leaves gaps in his defense and overlooks tactics.",
    },
    quotes: {
      intro: {
        es: "«¡Aunque hoy sea un simple soldado de a pie, algún día gobernaré todo Japón! ¡En guardia!»",
        en: "“Though I am a humble foot soldier today, one day I shall rule all Japan! En garde!”",
      },
      capture: {
        es: "«¡Ja! ¡Esta pieza pasa a mi reserva! ¡Mi señor Nobunaga estará orgulloso!»",
        en: "“Hah! This piece joins my reserve! Lord Nobunaga will be proud!”",
      },
      drop: {
        es: "«¡Refuerzos al campo de batalla! ¡Nadie espera al soldado Tōkichi!»",
        en: "“Reinforcements to the battlefield! Nobody expects soldier Tōkichi!”",
      },
      check_player: {
        es: "«¡Jaque al Rey (Ōte)! ¡Tengo al general enemigo contra las cuerdas!»",
        en: "“Check to the King (Ōte)! I have the enemy general cornered!”",
      },
      in_check: {
        es: "«¡Ugh, mi Rey está en peligro! ¡Retirada táctica, protejan el campamento!»",
        en: "“Ugh, my King is in danger! Tactical retreat, guard the camp!”",
      },
      defeat: {
        es: "«¡Increíble estrategia! Me has derrotado en buena ley... Aprenderé de esta batalla. El ninja Hattori Hanzō te espera.»",
        en: "“Incredible strategy! You defeated me fair and square... I will learn from this battle. The shinobi Hattori Hanzō awaits you.”",
      },
      victory: {
        es: "«¡Victoria para la infantería de Owari! ¡Nunca subestimes a un Peón en el tablero!»",
        en: "“Victory for the Owari infantry! Never underestimate a Pawn on the board!”",
      },
    },
  },
  {
    chapter: 2,
    id: "hanzo",
    name: "Hattori Hanzō",
    kanji: "服部 半蔵",
    mon: "忍",
    portrait: "/static/portraits/hanzo.jpg",
    stars: 2,
    elo: 1100,
    era: { es: "1572 · Provincia de Mikawa", en: "1572 · Mikawa Province" },
    role: { es: "El Demonio Shinobi de Iga", en: "Demon Shinobi of Iga" },
    desc: {
      es: "Maestro del sigilo y la infiltración. Especialista en saltos de Caballo, diagonales de Alfil y reincorporaciones sorpresa (Drops) tras tus líneas.",
      en: "Master of stealth and infiltration. Specializes in Knight leaps, Bishop diagonals, and surprise Drops behind your lines.",
    },
    quotes: {
      intro: {
        es: "«En las sombras del tablero, la pieza que creías muerta volverá por tu espalda.»",
        en: "“In the shadows of the board, the piece you thought dead will strike from behind.”",
      },
      capture: {
        es: "«Un golpe silencioso. Tu formación tiene puntos ciegos.»",
        en: "“A silent strike. Your formation has blind spots.”",
      },
      drop: {
        es: "«¡Técnica de infiltración de Iga (打ち)! Una emboscada donde menos lo esperabas.»",
        en: "“Iga infiltration technique (打ち)! An ambush where you least expected it.”",
      },
      check_player: {
        es: "«¡Ōte desde las sombras! Tu Rey no tiene dónde esconderse.»",
        en: "“Ōte from the shadows! Your King has nowhere to hide.”",
      },
      in_check: {
        es: "«¡Humo y evasión! Has logrado detectar mi posición...»",
        en: "“Smoke and evasion! You managed to spot my position...”",
      },
      defeat: {
        es: "«Tu visión atraviesa la niebla de Iga... Reconozco tu maestría. Prepárate: el Tigre de Kai, Takeda Shingen, marcha hacia ti.»",
        en: "“Your vision pierces the fog of Iga... I acknowledge your mastery. Prepare yourself: the Tiger of Kai, Takeda Shingen, marches toward you.”",
      },
      victory: {
        es: "«La batalla terminó antes de que vieras la sombra de mi espada.»",
        en: "“The battle ended before you even saw the shadow of my blade.”",
      },
    },
  },
  {
    chapter: 3,
    id: "shingen",
    name: "Takeda Shingen",
    kanji: "武田 信玄",
    mon: "風",
    portrait: "/static/portraits/shingen.jpg",
    stars: 3,
    elo: 1350,
    era: { es: "1561 · Batalla de Kawanakajima", en: "1561 · Battle of Kawanakajima" },
    role: { es: "El Tigre de Kai (Fūrinkazan)", en: "The Tiger of Kai (Fūrinkazan)" },
    desc: {
      es: "Estratega militar legendario. Evalúa qué casillas están amenazadas antes de avanzar, evitando regalar piezas y presionando en formación cerrada.",
      en: "Legendary military strategist. Evaluates threatened squares before advancing, avoiding free giveaways and pressing in tight formation.",
    },
    quotes: {
      intro: {
        es: "«Veloz como el viento, silencioso como el bosque, feroz como el fuego e inamovible como la montaña (風林火山).»",
        en: "“Swift as the wind, silent as the forest, fierce as fire, and immovable as the mountain (風林火山).”",
      },
      capture: {
        es: "«¡Como el fuego que devora la llanura! Mi caballería de Kai rompe tu línea.»",
        en: "“Like fire consuming the plains! My Kai cavalry breaks your line.”",
      },
      drop: {
        es: "«Las reservas entran en formación en el momento exacto.»",
        en: "“Reserves enter formation at the exact decisive moment.”",
      },
      check_player: {
        es: "«¡Jaque al Rey! ¡La carga de Takeda es imparable!»",
        en: "“Check to the King! The charge of Takeda is unstoppable!”",
      },
      in_check: {
        es: "«¡Inamovible como la montaña! Mi guardia de Oro resistirá tu embate.»",
        en: "“Immovable as a mountain! My Gold guard will withstand your assault.”",
      },
      defeat: {
        es: "«Ni siquiera en Kawanakajima vi una táctica tan brillante... Has superado al Tigre de Kai. Pero ten cuidado con Oda Nobunaga.»",
        en: "“Not even at Kawanakajima did I witness such brilliant tactics... You have surpassed the Tiger of Kai. Beware of Oda Nobunaga.”",
      },
      victory: {
        es: "«El estandarte Fūrinkazan ondea victorioso. Te faltó paciencia en la defensa.»",
        en: "“The Fūrinkazan banner flies victorious. You lacked patience in defense.”",
      },
    },
  },
  {
    chapter: 4,
    id: "nobunaga",
    name: "Oda Nobunaga",
    kanji: "織田 信長",
    mon: "天",
    portrait: "/static/portraits/nobunaga.jpg",
    stars: 4,
    elo: 1600,
    era: { es: "1575 · Castillo de Azuchi", en: "1575 · Azuchi Castle" },
    role: { es: "El Rey Demonio del Sexto Cielo", en: "Demon King of the Sixth Heaven" },
    desc: {
      es: "Conquistador implacable (Tenka Fubu). Busca jaques directos, corona Torres en Dragón, defiende sus piezas amenazadas y castiga cualquier descuido.",
      en: "Ruthless conqueror (Tenka Fubu). Seeks direct checks, promotes Rooks into Dragons, defends threatened pieces, and punishes any mistake.",
    },
    quotes: {
      intro: {
        es: "«¡Unificaré el tablero bajo mi espada (天下布武)! ¡Demuéstrame si mereces desafiar al Rey Demonio!»",
        en: "“I shall unify the board under my blade (天下布武)! Show me if you are worthy of challenging the Demon King!”",
      },
      capture: {
        es: "«¡Inevitabilidad absoluta! Toda pieza débil será barrida del tablero.»",
        en: "“Absolute inevitability! Every weak piece shall be swept from the board.”",
      },
      drop: {
        es: "«¡Fuego en línea! Mis reservas caen sobre tu fortaleza como arcabuces en Nagashino.»",
        en: "“Volley fire! My reserves rain upon your fortress like matchlocks at Nagashino.”",
      },
      check_player: {
        es: "«¡Jaque (Ōte)! ¡Arrodíllate ante el poder de Azuchi!»",
        en: "“Check (Ōte)! Kneel before the might of Azuchi!”",
      },
      in_check: {
        es: "«¿Osas amenazar al Rey del Sexto Cielo? ¡Pagaremos fuego con fuego!»",
        en: "“You dare threaten the Demon King of the Sixth Heaven? We shall answer fire with fire!”",
      },
      defeat: {
        es: "«¡Jajaja! ¡Soberbio! El sueño de la ambición dura un suspiro... Solo queda un hombre por encima de mí en este arte: el Meijin Ōhashi Sōkei.»",
        en: "“Hahaha! Superb! A dream within a dream... Only one man stands above me in this art: the Meijin Ōhashi Sōkei.”",
      },
      victory: {
        es: "«¡Tenka Fubu! Nadie puede detener la marcha hacia la unificación.»",
        en: "“Tenka Fubu! None can halt the march toward unification.”",
      },
    },
  },
  {
    chapter: 5,
    id: "sokei",
    name: "Ōhashi Sōkei",
    kanji: "大橋 宗桂",
    mon: "王",
    portrait: "/static/portraits/sokei.jpg",
    stars: 5,
    elo: 1850,
    era: { es: "1612 · Castillo de Edo", en: "1612 · Edo Castle" },
    role: { es: "Primer Meijin Oficial de Shōgi", en: "First Official Shōgi Meijin" },
    desc: {
      es: "Gran Maestro histórico nombrado por el Shōgun Tokugawa Ieyasu. Evalúa ataques múltiples, protege su castillo con Oro y Plata y calcula redes de Jaque Mate.",
      en: "Historical Grandmaster appointed by Shōgun Tokugawa Ieyasu. Evaluates multi-piece threats, fortifies his King with Gold & Silver, and calculates mating nets.",
    },
    quotes: {
      intro: {
        es: "«El Shōgi es el espejo del espíritu. Has vencido a grandes guerreros para llegar ante mí. Muéstrame tu camino.»",
        en: "“Shōgi is the mirror of the spirit. You have bested great warlords to stand before me. Show me your way.”",
      },
      capture: {
        es: "«Toda ganancia material debe servir a la armonía de la posición.»",
        en: "“Every material gain must serve the harmony of the position.”",
      },
      drop: {
        es: "«Una ficha en el Komadai vale por diez cuando cae en la casilla precisa.»",
        en: "“A piece on the Komadai is worth ten when dropped on the exact square.”",
      },
      check_player: {
        es: "«Ōte (王手). El viento cambia en el tablero; observa con calma tu defensa.»",
        en: "“Ōte (王手). The wind shifts across the board; observe your defense calmly.”",
      },
      in_check: {
        es: "«Un ataque profundo y certero... Mi castillo debe responder con precisión.»",
        en: "“A deep and accurate strike... My castle must respond with precision.”",
      },
      defeat: {
        es: "«Me inclino ante tu maestría (参りました - Mairimashita). Hoy has conquistado las Crónicas del Sengoku y mereces el título de Gran Maestro del Dojo.»",
        en: "“I bow to your mastery (参りました - Mairimashita). Today you have conquered the Sengoku Chronicles and earned the title of Dojo Grandmaster.”",
      },
      victory: {
        es: "«Una partida honorable. En cada derrota reside la semilla de tu próxima maestría.»",
        en: "“An honorable match. Within every defeat lies the seed of your future mastery.”",
      },
    },
  },
];
