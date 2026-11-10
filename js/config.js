/* ==========================================================================
   AFTERSHOCK / CONFIG.JS
   Este es el archivo principal para personalizar el juego.
   Puedes cambiar valores sin editar game.js ni art.js.
   ========================================================================== */
window.GAME_CONFIG = {
  // Resolución interna del juego. El navegador la escala automáticamente.
  canvas: {
    width: 960,
    height: 600
  },

  // Edificio: tamaño de las habitaciones, altura entre plantas y escaleras.
  building: {
    roomWidth: 960,
    floorGap: 270,
    roomHeight: 235,
    stairWidth: 142,
    stairMargin: 34,

    // Cantidad de pisos por dificultad. El tutorial es una zona de práctica.
    floorsByDifficulty: {
      tutorial: 3,
      easy: 3,
      steady: 4,
      normal: 5,
      severe: 6,
      hard: 7
    },

    floorNames: [
      "OFICINAS",
      "APARTAMENTOS",
      "ARCHIVO",
      "COMERCIO",
      "VIVIENDAS",
      "CONSULTORIOS",
      "BODEGA",
      "RECEPCIÓN"
    ]
  },

  // Personaje: velocidad, salto, gravedad, tamaño y tiempo de invulnerabilidad.
  player: {
    speed: 235,
    runMultiplier: 1.38,
    jumpForce: 570,
    gravity: 1550,
    maxFall: 900,
    width: 52,
    height: 82,
    invulnerability: 1.05
  },

  // Casco: duración de la protección en segundos.
  helmet: {
    duration: 10,
    warningAt: 3
  },

  // Rescates: tiempo necesario, segundos que se ganan y distancia de interacción.
  rescue: {
    duration: 2.5,
    bonusSeconds: 7,
    distance: 58
  },

  // Objetos: cada cuántos pisos se distribuyen casco y botiquín.
  items: {
    helmetEveryFloor: 3,
    medkitEveryFloor: 4
  },

  // Peligros: frecuencia, velocidad, daño y cantidad simultánea.
  hazards: {
    maxActive: 4,
    spawnMin: 1.1,
    spawnMax: 1.8,
    warningTime: 0.95,
    debrisSpeed: 350,
    debrisDamage: 1,
    floorHazardDamage: 1,
    floorHazardWidth: 64,
    floorHazardHeight: 20
  },

  // Cámara: suavidad del seguimiento y sacudida sísmica.
  camera: {
    followEase: 8.5,
    shake: 8
  },

  // Dificultades. Menos hazardRate = aparecen peligros más seguido.
  difficulty: {
    // Modo de práctica: 3 pisos, tiempo amplio y sin escombros aleatorios.
    tutorial: {
      label: "ENTRENAMIENTO",
      time: 999,
      lives: 5,
      hazardRate: 999,
      hazardSpeed: 0,
      rescueTime: 2.5,
      floorHazardCount: 3
    },

    easy: {
      label: "CONTROLADO",
      time: 150,
      lives: 5,
      hazardRate: 2.35,
      hazardSpeed: 285,
      rescueTime: 1.7,
      floorHazardCount: 1
    },
    steady: {
      label: "ATENCIÓN",
      time: 146,
      lives: 5,
      hazardRate: 2.15,
      hazardSpeed: 295,
      rescueTime: 1.75,
      floorHazardCount: 1
    },
    normal: {
      label: "INESTABLE",
      time: 140,
      lives: 4,
      hazardRate: 1.95,
      hazardSpeed: 310,
      rescueTime: 1.8,
      floorHazardCount: 1
    },
    severe: {
      label: "CRÍTICO",
      time: 135,
      lives: 4,
      hazardRate: 1.8,
      hazardSpeed: 325,
      rescueTime: 1.9,
      floorHazardCount: 2
    },
    hard: {
      label: "COLAPSO",
      time: 130,
      lives: 4,
      hazardRate: 1.65,
      hazardSpeed: 340,
      rescueTime: 2.0,
      floorHazardCount: 2
    }
  },

  // Paleta general de la arquitectura.
  colors: {
    sky: "#111c27",
    wall: "#35434c",
    wallDark: "#26343e",
    floor: "#66737a",
    floorDark: "#18232c",
    accent: "#d96b50",
    light: "#e4b45e",
    window: "#223e50"
  }
};
