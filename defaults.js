// Screen Trainer — every setting with its default value. Shared by the main process (main.js) and the
// headless playtests (tools/playtest.js). To add a setting: add it here, read it as G.set.<name> in the
// overlay, and add one row to the OPTIONS table in src/panel.js so it gets a control on the Options screen.
'use strict';

const DEFAULTS = {
  // overlay window
  opacity: 1, autoStart: false, alwaysOnTop: true, paused: false, display: 0, visible: true,
  // sprites
  scale: 0, spriteStyle: 'showdown', spritesPath: '',
  sizeMode: 'true',       // how big each species is drawn: 'true' (to scale) | 'balanced' (gentler) | 'sprite' (as the picture is)
  // wild encounters
  shinyOdds: 100, spawnEvery: 25, maxWild: 3, gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], itemDrops: true,
  maxLoiter: 12,          // how many wild Pokémon may settle in and stay when nobody is fighting them (0 = they wander off again, as before 0.4)
  weatherFreq: 3,         // random weather: 0 = never ... 10 = every couple of minutes (table in src/events.js)
  trainerBattles: 'sometimes',   // other Trainers come by for a battle: 'off' | 'rare' | 'sometimes' | 'often' (src/rivals.js)
  legendEvents: 'rare',   // legendary visits: 'off' | 'rare' | 'sometimes' | 'often'
  // 0.9.5: groups of one species (hordes), variety, the time of day, how strong a click is
  groupFreq: 'sometimes', // how often a wild Pokémon comes with a group of its own kind: 'off' | 'rare' | 'sometimes' | 'often' (src/game.js, GROUP_ODDS)
  groupMax: 5,            // the largest a group can be, the first one included: 2 ... 10 (they come in groups of groupMax - 2 to groupMax)
  variety: 0,             // 0 = the usual mix (common species come more often) ... 10 = every species about as likely, and fewer of the same kind in a row
  timeSpawns: false,      // on: the computer's clock decides who comes (from 9 in the evening to 5 in the morning mostly night-time Pokémon); off: no difference
  clickPower: 1,          // how hard a click on a wild Pokémon is: 0.25 ... 4 times the usual (a click still never knocks one out)
  befriendPower: 1,       // how fast petting earns a friendly legendary's trust: 0.25 ... 4 times the usual
  // team behaviour
  roam: 'stroll', battleStyle: 'smart', autoBattle: true, evolve: true,
  megaDynamax: true,      // team members Mega Evolve or Dynamax when they fight to knock out (src/forms.js)
  handsOff: false,        // the team leaves the Pokémon you are clicking completely alone
  autoMedicine: true,     // the team shares medicine from the Bag during fights
  xpRate: 1,              // experience multiplier for the team: 0 = none ... 10 = ten times as much
  walkSpeed: 1,           // how fast everyone walks and runs: 0.2 = a fifth of the usual pace ... 2 = twice as fast (slower makes the world feel bigger)
  moveSpeed: 1,           // how often moves are used in a fight: 0.25 = a quarter as often ... 3 = three times as often
  myCursor: true,         // (0.9.7) over the game (the Pokémon on the overlay, the field window) the mouse is drawn as the player's own pointer
  // display detail
  labels: 'auto', fxLevel: 'normal', moveNames: true,
  toasts: 'cards',        // notifications: 'cards' | 'text' | 'off'
  theme: 'glass',         // the Pokédex and Mewtwo windows: 'glass' | 'classic'
  hints: 'hover',         // explanations in the Pokédex window: 'hover' = only when the mouse rests on something | 'always' = written out under every option
  contrast: 'own',        // under a Windows contrast theme: 'own' = keep these windows' own colours | 'system' = use Windows' colours
  // Mewtwo, the computer guardian
  guardian: true,         // show Mewtwo on the overlay
  guardianAlerts: true,   // Mewtwo speaks up when a check finds something
  guardianX: 0.9, guardianY: 0.86,   // where Mewtwo stands, as a share of the screen (its feet)
  // the field: windowed mode. A resizable window with a generated field in it; while it is open the Pokémon stay inside it
  field: false,           // is the field window open?
  fieldX: null, fieldY: null, fieldW: 760, fieldH: 500,     // where it was last (null = centred on the screen)
  fieldMax: false,        // it was maximised (as large as the screen) when it was last closed: it opens that way again (0.9.5)
  fieldSquare: true,      // Fountain Square (the fountain, Poké Center, pipe, Day Care, trade pads) stands in the middle of the field's world
  fieldZoomAt: 0,         // how closely the field window looks at its world: the level last zoomed to (one of zoomLevels). 0 = never zoomed yet: the window starts as far out as the levels allow without showing more than the field
  zoomLevels: [0.5, 0.75, 1, 1.5, 2],   // the zoom levels the mouse wheel may step through in the field window (ZOOM_CHOICES below)
  boxFieldMax: 1025,      // while the Box is open the field shows the Pokémon in it: at most this many (10 to 1025)
  // the Android app only
  bgTrain: true,          // carry on with the screen off (the team trains; closing the app stops it)
  // weather
  weatherFixed: 'off',    // 'off' = random weather as weatherFreq says | 'sun' | 'rain' | 'sand' | 'hail' | 'snow': that weather all the time
  // sound
  mute: false, sfxVolume: 0.6, musicVolume: 0.35, music: true, battleMusic: true, cries: true, musicShuffle: true, musicTrack: '',
  masterVolume: 1,        // (1.0) everything Screen Trainer plays, before the sliders below: 0 ... 1
  criesVolume: 0.8,       // (1.0) the Pokémon cries on their own: 0 ... 1 (0.8 is how loud they were before 1.0)
  // window state
  hotkey: 'Control+Alt+P', firstRun: true, boxOpen: false,
  optClosed: [],          // Options screen: the categories that are folded shut (their ids, see OPTIONS in src/panel.js)
};

/** the zoom levels that can be allowed for the field window (Options > Field) */
const ZOOM_CHOICES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** bring a loaded settings object into valid ranges (missing keys take their default) */
function sanitize(raw, screenHeight) {
  const s = Object.assign({}, DEFAULTS, raw || {});
  const num = (v, lo, hi, def) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  s.opacity = num(s.opacity, 0.1, 1, 1);
  if (!+s.scale) s.scale = (screenHeight || 1080) >= 1300 ? 2 : 1.5;      // first run: a size that suits the screen
  s.scale = num(s.scale, 0.1, 5, 2);
  s.xpRate = Math.round(num(s.xpRate, 0, 10, DEFAULTS.xpRate) * 100) / 100;
  s.walkSpeed = Math.round(num(s.walkSpeed, 0.2, 2, DEFAULTS.walkSpeed) * 100) / 100;
  s.moveSpeed = Math.round(num(s.moveSpeed, 0.25, 3, DEFAULTS.moveSpeed) * 100) / 100;
  s.maxLoiter = Math.round(num(s.maxLoiter, 0, 40, DEFAULTS.maxLoiter));
  if (!['off', 'rare', 'sometimes', 'often'].includes(s.groupFreq)) s.groupFreq = DEFAULTS.groupFreq;
  s.groupMax = Math.round(num(s.groupMax, 2, 10, DEFAULTS.groupMax));
  s.variety = Math.round(num(s.variety, 0, 10, DEFAULTS.variety));
  s.timeSpawns = !!s.timeSpawns;
  s.clickPower = Math.round(num(s.clickPower, 0.25, 4, DEFAULTS.clickPower) * 100) / 100;
  s.befriendPower = Math.round(num(s.befriendPower, 0.25, 4, DEFAULTS.befriendPower) * 100) / 100;
  s.field = !!s.field; s.fieldMax = !!s.fieldMax; s.myCursor = s.myCursor !== false; s.bgTrain = s.bgTrain !== false; s.fieldSquare = s.fieldSquare !== false;
  s.zoomLevels = [...new Set((Array.isArray(s.zoomLevels) ? s.zoomLevels : DEFAULTS.zoomLevels).map(Number).filter((z) => ZOOM_CHOICES.includes(z)))].sort((a, b) => a - b);
  if (!s.zoomLevels.length) s.zoomLevels = [1];           // at least one level: no zooming at all
  s.fieldZoomAt = +s.fieldZoomAt > 0 ? s.zoomLevels.reduce((b, z) => (Math.abs(z - s.fieldZoomAt) < Math.abs(b - s.fieldZoomAt) ? z : b), s.zoomLevels[0]) : 0;
  s.boxFieldMax = Math.round(num(s.boxFieldMax, 10, 1025, DEFAULTS.boxFieldMax));
  if (!['off', 'sun', 'rain', 'sand', 'hail', 'snow'].includes(s.weatherFixed)) s.weatherFixed = 'off';
  s.fieldW = Math.round(num(s.fieldW, 320, 20000, DEFAULTS.fieldW)); s.fieldH = Math.round(num(s.fieldH, 240, 20000, DEFAULTS.fieldH));
  for (const k of ['fieldX', 'fieldY']) s[k] = s[k] === null || s[k] === undefined || !isFinite(+s[k]) ? null : Math.round(Math.min(1e6, Math.max(-1e6, +s[k])));
  s.optClosed = Array.isArray(s.optClosed) ? [...new Set(s.optClosed.filter((k) => typeof k === 'string' && /^[a-z]{1,20}$/.test(k)))].slice(0, 20) : [];
  s.shinyOdds = Math.max(1, Math.round(+s.shinyOdds || 100));
  s.spawnEvery = num(s.spawnEvery, 3, 600, 25);
  s.maxWild = Math.round(num(s.maxWild, 1, 12, 3));
  s.sfxVolume = num(s.sfxVolume, 0, 1, 0.6); s.musicVolume = num(s.musicVolume, 0, 1, 0.35);
  s.masterVolume = num(s.masterVolume, 0, 1, 1); s.criesVolume = num(s.criesVolume, 0, 1, 0.8);
  if (!Array.isArray(s.gens) || !s.gens.length) s.gens = DEFAULTS.gens.slice();
  if (!['cards', 'text', 'off'].includes(s.toasts)) s.toasts = 'cards';
  if (!['true', 'balanced', 'sprite'].includes(s.sizeMode)) s.sizeMode = DEFAULTS.sizeMode;
  if (!['off', 'rare', 'sometimes', 'often'].includes(s.legendEvents)) s.legendEvents = DEFAULTS.legendEvents;
  if (!['off', 'rare', 'sometimes', 'often'].includes(s.trainerBattles)) s.trainerBattles = DEFAULTS.trainerBattles;
  if (!['glass', 'classic'].includes(s.theme)) s.theme = DEFAULTS.theme;
  if (!['hover', 'always'].includes(s.hints)) s.hints = DEFAULTS.hints;
  if (!['own', 'system'].includes(s.contrast)) s.contrast = DEFAULTS.contrast;
  s.weatherFreq = Math.round(num(s.weatherFreq, 0, 10, DEFAULTS.weatherFreq));
  s.guardianX = num(s.guardianX, 0.02, 0.98, DEFAULTS.guardianX); s.guardianY = num(s.guardianY, 0.1, 0.99, DEFAULTS.guardianY);
  s.gens = [...new Set(s.gens.map(Number).filter((g) => g >= 1 && g <= 9 && g === Math.floor(g)))].sort((a, b) => a - b);
  if (!s.gens.length) s.gens = DEFAULTS.gens.slice();
  return s;
}

module.exports = { DEFAULTS, sanitize, ZOOM_CHOICES };
