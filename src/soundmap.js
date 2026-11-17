// Screen Trainer — which entry of an imported sound bank plays for which game event, the music playlist,
// and the attack sounds per move and per type. Numbers are positions in the FireRed / LeafGreen song table
// (both games share one layout). To support another game, add a table for its game code in GAMES.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SoundMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // event -> [song, volume, longest seconds to play]
  const SFX = {
    // Pokédex window
    select: [5, 0.8], open: [103, 0.9], close: [104, 0.9], page: [102, 1], scroll: [101, 1], boxOpen: [4, 0.8], boxClose: [3, 0.8], pick: [108, 1], drop: [29, 0.8],
    error: [26, 0.6], use: [1, 0.8], save: [48, 0.7], bag: [246, 0.5],
    // catching
    throw: [54, 0.8], ballOpen: [15, 0.7], bounce: [49, 0.6], bounce2: [50, 0.6], bounce3: [51, 0.6], shake: [23, 0.9], click: [247, 0.9], caught: [319, 0.75], breakFree: [15, 0.7],
    // battle
    hit: [13, 0.5], hitSuper: [14, 0.55], hitWeak: [12, 0.5], faint: [16, 0.7], flee: [17, 0.9], statUp: [232, 0.8, 0.9], statDown: [238, 0.8, 0.9], heal: [218, 0.7],
    protect: [202, 0.7], poke: [127, 0.6], explode: [171, 0.7],
    brn: [144, 0.6], psn: [141, 0.6], par: [131, 0.6], slp: [230, 0.7], frz: [130, 0.7], confuse: [189, 0.6], trap: [163, 0.7], seed: [173, 0.8], love: [205, 0.8],
    rain: [120, 0.8], sun: [221, 0.8], sand: [212, 0.9, 1.8], hail: [235, 0.8], snow: [130, 0.8], terrain: [236, 0.7, 1.6], screen: [200, 0.9], hazard: [124, 0.6], web: [122, 0.7], teleport: [196, 0.7],
    // life on the overlay
    hop: [10, 0.55], land: [28, 0.35], pet: [89, 0.7], shiny: [95, 1], levelUp: [257, 0.7], evolve: [259, 0.7], item: [258, 0.7], berry: [262, 0.65], treasure: [318, 0.7], badge: [260, 0.7],
    pickup: [25, 0.9], recover: [256, 0.6], lead: [254, 0.7], exp: [84, 0.7], alert: [22, 0.5],
  };

  // background playlist: [song, title]
  const MUSIC = [
    [300, 'Pallet Town'], [291, 'Route 1'], [314, 'Pewter City'], [293, 'Route 3'], [288, 'Mt. Moon'], [292, 'Route 24'], [313, 'Vermilion City'], [304, 'S.S. Anne'], [294, 'Route 11'],
    [280, 'Lavender Town'], [309, 'Celadon City'], [273, 'Game Corner'], [308, 'Fuchsia City'], [305, 'Surfing'], [279, 'Cinnabar Island'], [282, 'Cycling'], [287, 'Viridian Forest'],
    [303, 'Pokémon Center'], [301, "Professor Oak's Lab"], [275, 'Gym'], [307, 'Silph Co.'], [274, 'Rocket Hideout'], [306, 'Pokémon Tower'], [289, 'Pokémon Mansion'], [295, 'Victory Road'],
    [333, 'Sevii Islands Route'], [335, 'Sevii Islands: One to Three'], [336, 'Sevii Islands: Four and Five'], [337, 'Sevii Islands: Six and Seven'], [331, 'Sevii Islands Cave'],
    [344, 'Trainer Tower'], [327, 'Union Room'], [330, 'Berry Picking'], [326, 'Pokémon Jump'], [332, 'Teachy TV'], [272, 'Follow Me'], [329, 'Mystery Gift'], [286, 'Hall of Fame'],
    [278, 'Title Screen'], [290, 'Credits'],
  ];
  const BATTLE = { wild: [298, 'Wild Battle'], horde: [297, 'Trainer Battle'], alpha: [296, 'Gym Leader Battle'], shiny: [299, 'Champion Battle'], legend: [341, 'Legendary Battle'], mewtwo: [340, 'Mewtwo Battle'], deoxys: [339, 'Deoxys Battle'] };
  const VICTORY = [311, 'Victory'];

  // attack sounds: exact move first, then type + how the move plays out on screen
  const MOVES = {
    thunderbolt: 111, harden: 113, nightmare: 114, 'vital-throw': 115, bubble: 117, cut: 121, 'string-shot': 122, 'rock-throw': 124, gust: 126, 'double-slap': 127, 'double-team': 128, 'razor-wind': 129, 'icy-wind': 130,
    'thunder-wave': 131, 'comet-punch': 132, 'mega-kick': 134, crabhammer: 135, 'jump-kick': 136, 'flame-wheel': 137, flamethrower: 139, 'fire-punch': 140, toxic: 141, 'sacred-fire': 143, ember: 144, 'take-down': 145,
    blizzard: 147, scratch: 148, 'vise-grip': 149, 'wing-attack': 150, fly: 151, 'sand-attack': 152, bite: 154, headbutt: 155, surf: 156, 'hydro-pump': 157, whirlpool: 158, 'horn-attack': 159, 'tail-whip': 160, mist: 161,
    'poison-powder': 162, bind: 163, 'dragon-rage': 164, sing: 165, 'perish-song': 166, 'pay-day': 167, dig: 168, 'dizzy-punch': 169, 'self-destruct': 170, explosion: 171, absorb: 172, screech: 174, 'bubble-beam': 175,
    supersonic: 177, 'belly-drum': 178, metronome: 179, bonemerang: 180, lick: 181, psybeam: 182, 'feint-attack': 183, 'swords-dance': 184, leer: 185, swagger: 186, 'heal-bell': 188, 'confuse-ray': 189, snore: 190,
    'brick-break': 191, 'giga-drain': 192, 'solar-beam': 194, 'petal-dance': 195, teleport: 196, minimize: 197, sketch: 198, swift: 199, reflect: 200, barrier: 201, detect: 202, 'lock-on': 203, moonlight: 204, charm: 205,
    charge: 206, strength: 207, 'hyper-beam': 208, waterfall: 209, reversal: 210, 'acid-armor': 211, sandstorm: 212, 'tri-attack': 214, encore: 215, 'baton-pass': 217, 'milk-drink': 218, attract: 219, 'morning-sun': 221,
    flatter: 222, 'sand-tomb': 223, 'grass-whistle': 224, 'spit-up': 225, dive: 226, earthquake: 227, twister: 228, 'sweet-scent': 229, yawn: 230, 'sky-uppercut': 231, 'heat-wave': 233, uproar: 234, hail: 235,
    'cosmic-power': 236, 'teeter-dance': 237, haze: 239, thunder: 80, 'thunder-shock': 112, 'thunder-punch': 111, 'mega-punch': 132, 'ice-punch': 130, 'ice-beam': 147, 'water-gun': 117, 'vine-whip': 121, 'razor-leaf': 121,
    psychic: 193, 'shadow-ball': 114, 'quick-attack': 145, tackle: 155, pound: 127, 'body-slam': 145, slash: 121, peck: 159, 'drill-peck': 159, 'karate-chop': 191, 'low-kick': 136, 'rock-slide': 124, 'fire-blast': 143,
    'leech-seed': 173, 'mega-drain': 192, protect: 202, 'light-screen': 200, rest: 230, growl: 174, roar: 234, recover: 218, 'soft-boiled': 218, 'sleep-powder': 162, 'stun-spore': 162, 'fire-spin': 138, agility: 128,
  };
  //            dash  shot  beam  wave  sky  status
  const TYPES = {
    normal: [155, 199, 208, 234, 199, 160], fighting: [132, 115, 191, 207, 231, 184], flying: [150, 126, 129, 126, 151, 126], poison: [141, 141, 141, 162, 141, 162], ground: [168, 152, 152, 227, 168, 152],
    rock: [124, 124, 124, 124, 124, 113], bug: [149, 122, 122, 123, 122, 122], ghost: [181, 189, 114, 114, 114, 189], steel: [159, 113, 208, 113, 113, 113], fire: [140, 144, 139, 233, 143, 144],
    water: [135, 117, 157, 156, 209, 161], grass: [121, 172, 194, 195, 121, 229], electric: [111, 112, 111, 131, 80, 131], psychic: [169, 182, 193, 182, 193, 200], ice: [130, 130, 147, 147, 130, 235],
    dragon: [164, 164, 164, 228, 164, 164], dark: [154, 183, 183, 183, 154, 185], fairy: [205, 219, 219, 229, 219, 205],
  };
  const STYLES = ['dash', 'shot', 'beam', 'wave', 'sky', 'status'];

  const GAMES = { BPRE: 'FireRed', BPGE: 'LeafGreen' };
  const supported = (meta) => !!(meta && GAMES[meta.game] && meta.songCount >= 340);
  const gameName = (meta) => (meta && GAMES[meta.game]) || (meta && meta.title) || 'unknown game';

  /** the song to play for a move: [song, volume, longest seconds] */
  function moveSong(key, type, style) {
    if (MOVES[key]) return [MOVES[key], 0.5, 1.5];
    const row = TYPES[type] || TYPES.normal, i = Math.max(0, STYLES.indexOf(style));
    return [row[i], 0.45, 1.3];
  }

  // cry table order after the first 251 species (national dex numbers; 0 = unused slot)
  const HOENN = [352, 315, 324, 309, 310, 355, 380, 360, 336, 319, 335, 298, 333, 334, 0, 276, 277, 0, 327, 255, 256, 257, 252, 253, 254, 258, 259, 260, 279, 278, 354, 353, 270, 271, 272, 273, 274, 275, 318, 265, 266, 267, 268, 269,
    280, 281, 282, 287, 288, 289, 290, 291, 292, 296, 297, 299, 362, 311, 312, 283, 284, 300, 301, 316, 317, 322, 323, 339, 340, 341, 342, 325, 326, 328, 329, 330, 331, 332, 343, 344, 337, 338, 349, 350, 359, 307, 308, 363, 364,
    365, 366, 367, 368, 345, 346, 347, 348, 374, 375, 376, 371, 372, 377, 378, 379, 351, 313, 314, 261, 262, 356, 302, 303, 304, 305, 306, 369, 370, 383, 382, 384, 373, 286, 285, 264, 357, 320, 263, 295, 294, 321, 293, 361, 381,
    385, 386, 358];
  const cryOf = new Map();
  HOENN.forEach((sp, i) => { if (sp) cryOf.set(sp, 251 + i); });
  /** cry table index for a national dex number, or -1 when the game has no cry for it */
  const cryIndex = (sp) => (sp >= 1 && sp <= 251 ? sp - 1 : cryOf.has(sp) ? cryOf.get(sp) : -1);

  return { SFX, MUSIC, BATTLE, VICTORY, MOVES, TYPES, GAMES, supported, gameName, moveSong, cryIndex };
});
