// Screen Trainer — main process: the transparent click-through overlay window, tray menu,
// settings, save file, launch-on-startup, the sound bank, the Pokédex window, Mewtwo's window,
// the field window (windowed mode), the Android export and MyStream (the streaming studio, mystream.js).
'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, globalShortcut, shell, safeStorage, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
// (1.0) Forks (forks.js): "--fork=<forks\name>" hands the whole start over to that fork's own main.js, before anything
// else happens here. A fork is a copy of this folder with fork.json in it; it keeps its settings, save and self-check
// pictures in its own folder and never registers startup or the hotkey.
const forks = require('./forks');
const escaperope = require('./escaperope');
const FORK = forks.self(__dirname);
if (!FORK) {
  const forkApp = forks.startArg(process.argv, path.join(escaperope.home(path.dirname(process.execPath)), 'forks'));
  if (forkApp) { require(path.join(forkApp, 'main.js')); return; }      // (a top-level return: main.js is a CommonJS module)
} else {
  app.setName('Screen Trainer fork ' + FORK.name);
  app.setPath('userData', path.join(FORK.dir, 'data'));
  process.env.ST_SELFCHECK_DIR = path.join(FORK.dir, 'selfcheck');      // (its own reports and requests: the main game's request.json is never taken by a fork)
}
const sprites = require('./spritescan');
const soundbank = require('./soundbank');
const { DEFAULTS, sanitize } = require('./defaults');
const guardian = require('./guardian');
const selfcheck = require('./selfcheck');
const apkexport = require('./apkexport');
const shareexport = require('./shareexport');
const optimize = require('./optimize');
const mystream = require('./mystream');
const online = require('./online');
const Pointers = require('./pointers');
const stfiles = require('./stfiles');
const tidy = require('./tidy');
const backup = require('./backup');
const sentinel = require('./sentinel');
const Machine = require('./src/machine');
const zipper = require('./zipper');
const modsLib = require('./mods');

const HIDDEN_ARG = '--hidden', GUARDIAN_ARG = '--guardian', SELFCHECK_ARG = '--selfcheck', MYSTREAM_ARG = '--mystream', NOMODS_ARG = '--no-mods';
const API = 12;                // goes up when a window needs something new from this file (a page newer than the running program shows "restart")
// the Pokédex window: the device itself, and how much wider it gets when the Box screen slides out
const DEX = { w: 640, h: 720, box: 436 };
const GUARD = { w: 600, h: 720 };                         // Mewtwo's window (guardian.html)
const FIELD = { minW: 320, minH: 240, least: { w: 200, h: 150 } };      // the field window: smallest size, and the least of it that must lie on the overlay's screen to count

// keep the overlay animating even though it never has focus and other windows sit "under" it
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // the overlay never gets a click to "unlock" sound

let overlay = null, panel = null, guardWin = null, fieldWin = null, tray = null, settings = null, spriteInfo = null, cursorTimer = null, topTimer = null, quitting = false, bankFound = null;
let fieldRect = null, fieldSaveT = null, exporting = null, ms = null, fieldView = null, optWin = null, tied = false, keepOverlay = true, fieldGoing = null;
const userDir = () => app.getPath('userData');
const settingsFile = () => path.join(userDir(), 'settings.json');
const saveFile = () => path.join(userDir(), 'save.json');

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeAtomic(file, text) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (e) { console.error('write failed', file, e.message); }
}
const screenH = () => screen.getPrimaryDisplay().size.height;
const loadSettings = () => sanitize(readJson(settingsFile()), screenH());
/** once per version: keep a copy of the save and settings as they were before this version first ran */
function backupOnUpgrade() {
  try {
    const dir = path.join(userDir(), 'backups', 'before-' + app.getVersion());
    if (fs.existsSync(dir)) return;
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['save.json', 'settings.json', 'guardian.json']) if (fs.existsSync(path.join(userDir(), f))) fs.copyFileSync(path.join(userDir(), f), path.join(dir, f));
  } catch (e) { console.error('backup', e.message); }
}
const persistSettings = () => writeAtomic(settingsFile(), JSON.stringify(settings, null, 2));

const nearProgram = () => [path.dirname(process.execPath), app.getAppPath(), process.cwd()];
function refreshBank() { bankFound = soundbank.find(userDir(), nearProgram()); return bankFound; }

function refreshSprites() {
  let root = sprites.normalize(settings.spritesPath);
  if (!root) {
    root = sprites.autoFind([...nearProgram(), app.getPath('desktop'), app.getPath('downloads'), app.getPath('documents')]);
    if (root) { settings.spritesPath = root; persistSettings(); }
  }
  spriteInfo = sprites.scan(root);
  return spriteInfo;
}

function targetDisplay() {
  const all = screen.getAllDisplays();
  return all[settings.display] || screen.getPrimaryDisplay();
}
function overlayBounds() {
  const b = targetDisplay().bounds;
  // one pixel short of full height so Windows does not treat the overlay as a full-screen app
  return { x: b.x, y: b.y, width: b.width, height: b.height - 1 };
}

function createOverlay() {
  overlay = new BrowserWindow({
    ...overlayBounds(), transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false, backgroundColor: '#00000000', title: 'Screen Trainer Overlay',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webSecurity: true },
  });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setMenu(null);
  applyTopmost();
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  const mine = overlay;
  tied = false;
  // (placeOverlay: a window shown after its owner was already in place keeps the place it had in the stack, which can be
  // BEHIND the field window. That was the empty field after starting or after MyStream closed, 0.9.)
  overlay.once('ready-to-show', () => { if (settings.visible) overlay.showInactive(); tieOverlay(); placeOverlay('the overlay was shown'); syncLayer('the overlay is ready'); sendMyPointer(); });
  // (Windows closes an owned window along with its owner. The overlay is let go before the field window closes, see
  // tieOverlay; should it ever be taken along all the same, it is made again: the game picks up from its last save.)
  overlay.on('closed', () => { if (overlay !== mine) return; overlay = null; tied = false; captureNow = false; syncLayer('the overlay window closed'); if (keepOverlay && !quitting) setTimeout(() => { if (!overlay && keepOverlay && !quitting) { createOverlay(); syncField(); } }, 150); });
  overlay.webContents.on('render-process-gone', () => { if (!quitting && overlay) overlay.reload(); });

  clearInterval(cursorTimer);
  let lastX = null, lastY = null;
  cursorTimer = setInterval(() => {
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
    const p = screen.getCursorScreenPoint(), b = overlay.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    if (x === lastX && y === lastY) return;
    lastX = x; lastY = y;
    overlay.webContents.send('st:cursor', { x, y });
  }, 33);
  clearInterval(topTimer);
  // The keeper (0.9). Once a second the overlay is put where its state says it belongs: directly above the field
  // window while it is tied to it, on top of everything (every fourth second) while it is its own master and "Stay
  // on top" is set. Windows is not asked whether it is already there (Electron cannot ask): putting a window where
  // it already is changes nothing, and anything that got it out of place is undone within a second.
  let beat = 0;
  topTimer = setInterval(() => {
    beat++;
    syncLayer('');
    if (tied || fieldOpen()) placeOverlay(''); else if (beat % 4 === 0) placeOverlay('');      // (0.9.3: with the field open the overlay is kept on top every second: the field window may be brought forward at any moment)
    coverWatch();
    for (const r of Machine.tick(Date.now())) note({ kind: 'rescued', text: `${r.machine}: ${r.from} -> ${r.to}` });
  }, 1000);
}
/** put the overlay where it belongs in the stack of windows (see the keeper above). why: for the black box, '' = routine */
function placeOverlay(why) {
  if (!overlay || overlay.isDestroyed() || !settings.visible || !overlay.isVisible()) return false;
  try {
    if (tied) { if (!fieldOpen() || !fieldWin.isVisible() || fieldWin.isMinimized()) return false; overlay.moveAbove(fieldWin.getMediaSourceId()); }
    else if (settings.alwaysOnTop) overlay.moveTop();
    else return false;
  } catch (e) { note({ kind: 'error', text: 'placing the overlay: ' + String(e && e.message) }); return false; }
  if (why) note({ kind: 'placed', text: `${why}: the overlay was put ${tied ? 'directly above the field window' : 'on top'}` });
  return true;
}
// ---- the machines of the main process (src/machine.js; the table is in AGENTS.md)
// layer: where the overlay window lies. home: which page runs the game.
const Layer = Machine.make('layer', { about: 'where the overlay window lies among the windows', initial: 'none', states: {
  none: { about: 'there is no overlay window (the program is starting, or the game is on the MyStream stage)' },
  own: { about: 'its own master: above everything while "Stay on top" is set' },
  field: { about: 'tied to the field window and directly above it: whatever is in front of the field is in front of the Pokémon too' },
  hidden: { about: 'hidden (the hotkey, or "Show Pokémon" switched off)' },
} });
const Home = Machine.make('home', { about: 'which page runs the game', initial: 'moving', states: {
  overlay: { about: 'the desktop overlay' },
  stage: { about: 'the MyStream stage (the overlay is closed meanwhile)' },
  moving: { about: 'between the two: the save file is the handover', max: 25, then: 'overlay' },
}, change: (to, from, why) => {
  // nobody ran the game for 25 seconds (MyStream did not come up, or the overlay did not come back): the overlay is made again
  if (to === 'overlay' && from === 'moving' && /^more than/.test(why) && !quitting && !(ms && ms.isOpen()) && (!overlay || overlay.isDestroyed())) { keepOverlay = true; createOverlay(); if (fieldOpen() && settings.visible) fieldWin.showInactive(); syncField(); }
} });
function syncLayer(why) {
  const have = !!overlay && !overlay.isDestroyed();
  Layer.go(!have ? 'none' : !settings.visible ? 'hidden' : tied ? 'field' : 'own', why || 'kept in step');
  const staged = !!(ms && ms.stageWindow());
  if (staged) Home.go('stage', why || 'the stage is up'); else if (have && !(ms && ms.isOpen())) Home.go('overlay', why || 'the overlay is up'); else if (!have) Home.go('moving', why || 'no page runs the game');
}
// ---- the black box: what went wrong or was put right, kept in the self-check folder (blackbox.log, one line each),
// so that "it stopped answering clicks an hour ago" can still be looked into. Nothing but this program's own doings
// goes in: no window titles of other programs, nothing typed, no file names.
let boxLines = [], boxT = null, boxSame = { text: '', n: 0 };
function note(o) {
  if (!o || typeof o.kind !== 'string') return;
  const line = { at: new Date().toISOString(), kind: o.kind.slice(0, 24), text: String(o.text || '').slice(0, 600) };
  if (o.now !== undefined && Number.isFinite(+o.now)) line.gameTime = +o.now;
  if (line.kind + line.text === boxSame.text && ++boxSame.n > 3) return;      // (the same thing over and over is written three times)
  if (line.kind + line.text !== boxSame.text) boxSame = { text: line.kind + line.text, n: 0 };
  boxLines.push(JSON.stringify(line));
  if (boxLines.length > 400) boxLines.splice(0, boxLines.length - 400);
  clearTimeout(boxT); boxT = setTimeout(flushBox, 1500);
}
function flushBox() {
  if (!boxLines.length) return;
  const lines = boxLines; boxLines = [];
  try {
    const dir = selfcheck.dir(app, userDir()), file = path.join(dir, 'blackbox.log');
    fs.mkdirSync(dir, { recursive: true });
    let old = ''; try { old = fs.readFileSync(file, 'utf8'); } catch (e) { old = ''; }
    if (old.length > 300000) old = old.slice(old.indexOf('\n', old.length - 150000) + 1);      // the older half goes
    fs.writeFileSync(file, old + lines.join('\n') + '\n');
  } catch (e) { /* no folder to write into: the notes stay in memory only */ }
}
// What lies over what (0.7.1). Without a field window the overlay is its own master: above everything while "Stay on
// top" is set. While the field window is there, the overlay BELONGS to it: Windows keeps an owned window directly
// above its owner and nowhere else, so whatever is in front of the field window (the Field Dex, a browser) is in front
// of the Pokémon and Fountain Square as well, and "Stay on top" is the field window's to keep (its owned overlay
// follows by itself). Before 0.7.1 the overlay was pushed to the very top once a second: harmless while it only held
// Pokémon, but with the fountain on it the fountain was drawn over the Field Dex.
const TOP_LEVEL = 'pop-up-menu';                 // ("floating" would put the window behind the taskbar, and on Windows 11 it then stops being topmost)
function applyTopmost() {
  const top = !!settings.alwaysOnTop;
  // (0.9.3, fix 4) The field window is an ordinary window: other windows can lie over it. Only the Pokémon stay on
  // top: the overlay is never tied to the field window any more, and hides the scenery where the field is covered
  // (coverWatch below). Our own windows need not be kept on top to get in front of the field.
  if (fieldOpen()) fieldWin.setAlwaysOnTop(false);
  for (const w of [panel, guardWin, optWin]) if (w && !w.isDestroyed() && w.isAlwaysOnTop()) w.setAlwaysOnTop(false);
  if (!overlay || overlay.isDestroyed() || tied) return;      // (tied: an owned window is topmost exactly when its owner is; asking otherwise would change the owner too)
  if (top) overlay.setAlwaysOnTop(true, 'screen-saver'); else overlay.setAlwaysOnTop(false);
}
/** tie the overlay to the field window while the game is inside it, let it go when it is not (no field, or the field minimised or hidden) */
function tieOverlay() {
  if (!overlay || overlay.isDestroyed()) { tied = false; return; }
  const want = false;                                       // (0.9.3: never tied; see applyTopmost)
  const now = overlay.getParentWindow();
  if (want === tied && (want ? now === fieldWin : !now)) return;
  try {
    if (want) { overlay.setAlwaysOnTop(false); overlay.setParentWindow(fieldWin); tied = true; }
    else { tied = false; overlay.setParentWindow(null); if (settings.visible && !overlay.isVisible()) overlay.showInactive(); }
  } catch (e) { console.error('tie', e.message); tied = !!overlay.getParentWindow(); }
  applyTopmost();
  refreshMouse();
  placeOverlay(want ? 'the game went into the field window' : 'the game left the field window');
  syncLayer(want ? 'tied to the field window' : 'let go of the field window');
}
/** let the overlay go at once: its owner is about to close, be hidden or be minimised */
function untieOverlay() {
  if (!tied || !overlay || overlay.isDestroyed()) { tied = false; return; }
  tied = false;
  try { overlay.setParentWindow(null); if (settings.visible && !overlay.isVisible()) overlay.showInactive(); } catch (e) { console.error('untie', e.message); }
  applyTopmost();
  refreshMouse();
  syncLayer('the field window is going');
}
/** say again to Windows whether the overlay takes the mouse, as the game page last asked (0.9.1). Changing the
 *  overlay's owner (tie, untie) rewrites the window's styles, and the click-through state must not be left to chance. */
function refreshMouse() {
  if (!overlay || overlay.isDestroyed()) return;
  try { overlay.setIgnoreMouseEvents(!captureNow, { forward: true }); } catch (e) { /* the window is going */ }
}
function applyVisible() {
  if (fieldOpen()) { if (settings.visible) fieldWin.showInactive(); else fieldWin.hide(); }      // the hotkey hides the field along with the Pokémon
  if (!overlay || overlay.isDestroyed()) return;
  if (settings.visible) { overlay.showInactive(); applyTopmost(); placeOverlay('shown again'); } else overlay.hide();
  syncLayer(settings.visible ? 'shown' : 'hidden');
}
function applyAutoStart() {
  if (!app.isPackaged || FORK) return;                     // (a fork never starts with Windows)
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoStart, path: process.execPath, args: [HIDDEN_ARG] }); } catch (e) { console.error('autostart', e.message); }
}
function applyHotkey() {
  globalShortcut.unregisterAll();
  if (settings.hotkey && !FORK) { try { globalShortcut.register(settings.hotkey, () => setSettings({ visible: !settings.visible })); } catch (e) { console.error('hotkey', e.message); } }
  if (ms) ms.keyChanged();                                // MyStream's talk key was unregistered along with ours: it registers its own again
}

function setSettings(patch) {
  const before = settings;
  settings = sanitize(Object.assign({}, settings, patch || {}), screenH());      // values from any window are brought into range
  persistSettings();
  if (before.alwaysOnTop !== settings.alwaysOnTop) applyTopmost();
  if (before.visible !== settings.visible) applyVisible();
  if (before.autoStart !== settings.autoStart) applyAutoStart();
  if (before.hotkey !== settings.hotkey) applyHotkey();
  if (before.display !== settings.display && overlay) { overlay.setBounds(overlayBounds()); syncField(); }
  if (before.field !== settings.field) { if (settings.field) openField(); else closeField(); }
  if (before.myCursor !== settings.myCursor) sendMyPointer();
  if (before.spritesPath !== settings.spritesPath) { refreshSprites(); send(game(), 'st:sprites', spriteInfo); }
  send(game(), 'st:settings', gameSettings(game()));
  send(panel, 'st:settings', settings);
  send(guardWin, 'st:settings', settings);
  buildTray();
  return settings;
}

// ------------------------------------------------------------------ the field window (windowed mode)
// An ordinary resizable window with a generated field in it (field.html draws it, from the Pokémon that were caught).
// The game itself stays where it always is, in the overlay: this file only tells the overlay where the inside of the
// field window lies on its screen ('st:field', a rectangle or null). While there is a rectangle the overlay keeps the
// Pokémon inside it and lets wild ones in over its edges; with none (window closed, minimised, hidden, or on another
// display) the barriers are down and everyone roams the screen. The overlay must stay above the field window, so it
// is raised again whenever the field window is touched.
const fieldOpen = () => !!fieldWin && !fieldWin.isDestroyed();
let fieldGrow = { w: 0, h: 0 };
function fieldPlace() {
  const wa = targetDisplay().workArea;
  const width = Math.min(Math.max(settings.fieldW, FIELD.minW), wa.width), height = Math.min(Math.max(settings.fieldH, FIELD.minH), wa.height);
  let x = settings.fieldX, y = settings.fieldY;
  if (x === null || y === null) { x = Math.round(wa.x + (wa.width - width) / 2); y = Math.round(wa.y + (wa.height - height) / 2); }
  else {                                                   // wherever it was last: keep enough of it on a screen to grab
    const d = screen.getDisplayMatching({ x, y, width, height }).workArea;
    x = Math.min(Math.max(x, d.x - width + 120), d.x + d.width - 120); y = Math.min(Math.max(y, d.y), d.y + d.height - 80);
  }
  return { x, y, width, height };
}
function openField() {
  if (fieldOpen()) { if (fieldWin.isMinimized()) fieldWin.restore(); if (settings.visible) fieldWin.show(); return; }
  const w = fieldWin = new BrowserWindow({
    ...fieldPlace(), minWidth: FIELD.minW, minHeight: FIELD.minH, title: 'Screen Trainer field', show: false, resizable: true, maximizable: true, fullscreenable: false,
    backgroundColor: '#6cbc5d', icon: trayImage(64) || undefined, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  w.setMenu(null);
  applyTopmost();
  w.loadFile(path.join(__dirname, 'field.html'));
  // (Windows hands back a window a few pixels larger than asked for on a screen scaled to 112.5 % and the like; saved
  // as it is, the field grew by that much at every start. The difference is measured once and taken off when saving.)
  const asked = fieldPlace();
  fieldGrow = { w: 0, h: 0 };
  w.once('ready-to-show', () => {
    try { const got = w.getNormalBounds(), dw = got.width - asked.width, dh = got.height - asked.height; if (Math.abs(dw) <= 24 && Math.abs(dh) <= 24 && !w.isMaximized()) fieldGrow = { w: dw, h: dh }; } catch (e) { /* stays 0 */ }
    sendMyPointer();
    if (settings.fieldMax) w.maximize();                     // it was as large as the screen when it was closed: it comes back that way (0.9.5, update 11)
    if (settings.visible) w.showInactive(); syncField(); placeOverlay('the field window was shown');
  });
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'minimize', 'show', 'hide']) w.on(ev, () => { syncField(); rememberField(); });
  for (const ev of ['maximize', 'unmaximize']) w.on(ev, () => { const max = ev === 'maximize'; if (fieldWin === w && settings.fieldMax !== max) { settings.fieldMax = max; persistSettings(); } });      // (0.9.5)
  for (const ev of ['focus', 'show', 'restore']) w.on(ev, () => placeOverlay(''));      // (whenever the field window comes forward the overlay is put directly above it: the keeper, at once)
  w.on('close', () => { rememberField(true); if (fieldWin === w) { fieldGoing = w; untieOverlay(); } });      // (before the window is gone: Windows would take the owned overlay with it)
  w.on('closed', () => {
    if (fieldWin === w) fieldWin = null;
    fieldGoing = null;
    syncField();
    applyTopmost();                                         // (our own windows were kept on top to be able to come in front of the field: no field, no need)
    refreshMouse();
    placeOverlay('the field window closed');                // (on top of everything again at once, not at the keeper's next beat: 0.9.1)
    if (!quitting && settings.field) setSettings({ field: false });       // closed with its own button: the barriers are down
  });
}
function closeField() { if (fieldOpen()) fieldWin.close(); }
/** keep the field window's place for next time (not while it is minimised or maximised) */
function rememberField(now) {
  clearTimeout(fieldSaveT);
  const keep = () => {
    if (!fieldOpen() || fieldWin.isMinimized() || fieldWin.isMaximized()) return;
    const n = fieldWin.getNormalBounds(), b = { x: n.x, y: n.y, width: n.width - fieldGrow.w, height: n.height - fieldGrow.h };
    if (b.x === settings.fieldX && b.y === settings.fieldY && b.width === settings.fieldW && b.height === settings.fieldH) return;
    Object.assign(settings, { fieldX: b.x, fieldY: b.y, fieldW: b.width, fieldH: b.height });
    persistSettings();
  };
  if (now) keep(); else fieldSaveT = setTimeout(keep, 500);
}
/** the inside of the field window as a rectangle on the overlay (null when there is no field to stay in) */
function fieldOnOverlay() {
  if (!fieldOpen() || !overlay || overlay.isDestroyed() || !fieldWin.isVisible() || fieldWin.isMinimized()) return null;
  const c = fieldWin.getContentBounds(), o = overlay.getBounds();
  const x0 = Math.max(c.x, o.x), y0 = Math.max(c.y, o.y), x1 = Math.min(c.x + c.width, o.x + o.width), y1 = Math.min(c.y + c.height, o.y + o.height);
  // The whole inside of the window, also the part that has been pushed past the edge of the screen (0.9.3). Only the
  // part on the screen used to be sent: the overlay then fitted the world and its camera to a smaller field than the
  // one the field window draws, and the Pokémon and the fountain no longer stood on the ground under them. Now both
  // work from the same rectangle; what lies past the edge of the screen is simply not seen, as with any window.
  return x1 - x0 >= FIELD.least.w && y1 - y0 >= FIELD.least.h ? { x: c.x - o.x, y: c.y - o.y, w: c.width, h: c.height } : null;
}
function syncField() {
  const r = fieldOnOverlay();
  if (JSON.stringify(r) !== JSON.stringify(fieldRect)) { fieldRect = r; send(overlay, 'st:field', r); }
  tieOverlay();
  coverWatch();
}
// ---- what covers the field window (0.9.3, fix 4). ps\cover.ps1 runs while the field is shown and prints the parts of
// the field window that other windows cover, whenever they change (screen pixels). They go to the overlay as
// rectangles on its page ('st:covers'): there the fountain, the buildings, the ground's marks and the weather are cut
// away, so they are hidden with the field window, while the Pokémon stay in front of everything.
let coverProc = null, coverFor = null, coverSig = '[]', coverStarted = 0;
const handleOf = (w) => { const b = w.getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); };
function coverWatch() {
  const want = process.platform === 'win32' && !quitting && !!fieldRect && fieldOpen() && !!overlay && !overlay.isDestroyed();
  if (coverProc && (!want || coverFor.f !== fieldWin || coverFor.o !== overlay)) stopCover();
  if (!want || coverProc || Date.now() - coverStarted < 8000) return;
  coverStarted = Date.now();
  try {
    const exe = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const p = coverProc = require('child_process').spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'cover.ps1'),
      '-Field', handleOf(fieldWin), '-Skip', handleOf(overlay), '-Parent', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    coverFor = { f: fieldWin, o: overlay };
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (coverProc === p) onCovers(line); } });
    p.on('exit', () => { if (coverProc === p) { coverProc = null; sendCovers([]); } });
    p.on('error', () => { if (coverProc === p) { coverProc = null; sendCovers([]); } });
  } catch (e) { coverProc = null; note({ kind: 'error', text: 'watching what covers the field: ' + String(e && e.message) }); }
}
function stopCover() { const p = coverProc; coverProc = null; if (p) try { p.kill(); } catch (e) { /* gone */ } sendCovers([]); }
function onCovers(line) {
  let j = null; try { j = JSON.parse(line); } catch (e) { return; }
  if (!Array.isArray(j) || !fieldOpen() || !overlay || overlay.isDestroyed()) return;
  const o = overlay.getBounds();
  sendCovers(j.slice(0, 200).filter((r) => Array.isArray(r) && r.length === 4).map(([x, y, w, h]) => {
    let d = { x, y, width: w, height: h };
    try { d = screen.screenToDipRect(fieldWin, d); } catch (e) { /* not Windows: as it is */ }
    return [Math.floor(d.x - o.x), Math.floor(d.y - o.y), Math.ceil(d.width) + 1, Math.ceil(d.height) + 1];
  }));
}
function sendCovers(list) { const sig = JSON.stringify(list); if (sig === coverSig) return; coverSig = sig; send(overlay, 'st:covers', list); }
function send(win, ch, v) { if (win && !win.isDestroyed()) win.webContents.send(ch, v); }
/** the window the game is running in: the desktop overlay, or MyStream's stage while that is open */
function game() { return (ms && ms.stageWindow()) || overlay; }

// ------------------------------------------------------------------ MyStream, the streaming studio
// mystream.js owns its two windows (the hidden stage that viewers see, and the booth). The game can only run in one
// place, so while MyStream is open the overlay is closed and the game runs on the stage; the save file is the handover
// (the overlay writes it, the stage reads it, and the other way round on closing). The field window waits meanwhile.
function createMyStream() {
  ms = mystream.create({
    app, BrowserWindow, ipcMain, desktopCapturer, session, safeStorage, shell, globalShortcut, screen, version: app.getVersion(), appDir: __dirname, userDir,
    icon: () => trayImage(64), reservedKey: () => settings.hotkey, changed: () => buildTray(), panel: () => panel, openPanel: (tab) => openPanel(tab),
    endpoints: !app.isPackaged && process.env.ST_TEST_TWITCH ? JSON.parse(process.env.ST_TEST_TWITCH) : undefined,      // the checks (tools/mystreamcheck.js) talk to a stand-in, never to Twitch
    // the owner's own pointer on the stage (0.9.4): the same one as in the online window, which keeps the choice
    pointer: () => (ov ? ov.pointer() : null), cursorNow: () => (ov ? ov.cursorNow() : 0), setCursor: (i) => { if (ov) ov.set({ cursor: i }); },
    beforeOpen: async () => {
      send(overlay, 'st:cmd', { type: 'flush' });
      await new Promise((r) => setTimeout(r, 350));
      keepOverlay = false;                        // the game is moving to the stage: the overlay is closed on purpose
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      overlay = null;
      tied = false; captureNow = false;
      syncLayer('the game moves to the MyStream stage');
      if (fieldOpen()) fieldWin.hide();
    },
    beforeClose: async () => { if (ov) await ov.hostLeaving(); },
    afterClose: async () => {
      if (ov) ov.stageGone();                                // whoever was visiting has no stage to be on any more
      if (quitting) return;
      keepOverlay = true;
      createOverlay();
      if (fieldOpen() && settings.visible) fieldWin.showInactive();
      syncField();
      syncLayer('MyStream closed: the game comes back to the overlay');
    },
  });
}
function openMyStream() { return ms ? ms.open() : Promise.resolve(false); }

// ------------------------------------------------------------------ online visiting (0.8)
// online.js owns the "online" window and everything that goes to or comes from another player's computer; the picture
// and the pointers travel between MyStream's booth (the host's end) and that window (the visitor's end).
let ov = null, gameStats = { species: 0, shiny: 0, badges: 0, helpers: 0 };
function createOnline() {
  const test = !app.isPackaged && process.env.ST_TEST_BOARDS ? String(process.env.ST_TEST_BOARDS).split(',').filter(Boolean) : null;      // the checks (tools/onlinecheck.js) use stand-in boards on this computer, never a public one
  ov = online.create({
    BrowserWindow, ipcMain, userDir, appDir: __dirname, icon: () => trayImage(64), version: app.getVersion(),
    stage: () => (ms ? ms.stageWindow() : null), booth: () => (ms ? ms.boothWindow() : null), game, stats: () => gameStats,
    askStats: () => send(game(), 'st:state-request', false), changed: () => { try { buildTray(); } catch (e) { /* no tray yet */ } },
    boards: test, allowSelf: !!test, pace: test ? 0.25 : 1,
    pointerChanged: () => sendMyPointer(),
  });
}
ipcMain.on('ov:mystream', () => openMyStream());
/** (0.9.7, owner's list 11-16 update 4: "owner mouse when the game is open = the custom mouse") the overlay and the field
 *  window draw the mouse as the player's own pointer (setting myCursor; the pointer is the one online.js keeps) */
function sendMyPointer() {
  let i = 0;
  try { i = ov ? ov.cursorNow() | 0 : 0; } catch (e) { i = 0; }
  const css = settings.myCursor !== false ? Pointers.cursorCss(i, 32) : '';
  for (const w of [game(), fieldOpen() ? fieldWin : null]) send(w, 'st:my-pointer', { css });
}
/** the settings as the page that runs the game should see them. The stage is smaller than the screen (720 high), so
    there the sprite size is brought down by the same share: the Pokémon look as large on stream as they do on the desktop. */
function gameSettings(win) {
  if (!ms || !win || win !== ms.stageWindow()) return settings;
  return Object.assign({}, settings, { scale: Math.max(0.1, Math.round(settings.scale * Math.min(1, mystream.STAGE.h / Math.max(480, targetDisplay().size.height)) * 100) / 100) });
}
if (!app.isPackaged && process.env.ST_TEST) global.__stTest = { online: () => ov, ms: () => ms, overlay: () => overlay, game, openMyStream, settings: () => settings, openPanel, panel: () => panel, setSettings, openOptimize, optimize: () => (optWin && !optWin.isDestroyed() ? optWin : null), optimizeModule: optimize, field: () => (fieldOpen() ? fieldWin : null), fieldView: () => fieldView };      // for tools/mystreamcheck.js

// ------------------------------------------------------------------ the Pokédex window
// A frameless, device-shaped window. It is a fixed size; when the Box screen slides out the window grows to the
// right by DEX.box. On small screens the whole device is zoomed down to fit.
const TAB_ALIAS = { team: 'party', box: 'party', settings: 'options' };
function dexZoom() {
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return Math.max(0.6, Math.min(1, (wa.height - 16) / DEX.h, (wa.width - 16) / (DEX.w + DEX.box)));
}
function dexSize(open) { const z = panel && !panel.isDestroyed() ? panel.webContents.getZoomFactor() : dexZoom(); return { width: Math.round((DEX.w + (open ? DEX.box : 0)) * z), height: Math.round(DEX.h * z) }; }
function setPanelBox(open) {
  if (!panel || panel.isDestroyed()) return;
  const b = panel.getBounds(), size = dexSize(open), wa = screen.getDisplayMatching(b).workArea;
  // keep the device where it is; only nudge left if the Box would hang off the right edge of the screen
  const x = Math.max(wa.x, Math.min(b.x, wa.x + wa.width - size.width));
  // setBounds also moves the size limits of a fixed-size window, so "resizable" is never switched on here
  // (switching it on a transparent window has changed its frame on Windows in some Electron versions)
  panel.setBounds({ x, y: b.y, width: size.width, height: size.height });
  if (!!settings.boxOpen !== !!open) { settings.boxOpen = !!open; persistSettings(); }
  syncBox();
}
/** Is the Box on show: the Pokédex window up, with its Box slid out? The page that runs the game is told ('st:box'):
 *  while it is, the field shows the Pokémon in the Box instead of the team (src/boxfield.js). */
let boxShown = false;
const boxOnShow = () => !!(panel && !panel.isDestroyed() && panel.isVisible() && !panel.isMinimized() && settings && settings.boxOpen);
function syncBox(force) { const on = boxOnShow(); if (on !== boxShown || force) { boxShown = on; send(game(), 'st:box', on); } }
ipcMain.handle('st:box-get', () => boxOnShow());
function openPanel(tab, quiet) {
  // "party:<uid>" opens the team page on that Pokémon (a right-click on a team member, 0.7)
  // "box:<uid>" opens it on that Pokémon of the Box (a right-click on a Pokémon in the Box Field, 0.9): the page knows it as "boxmon:<uid>"
  if (typeof tab === 'string' && tab.includes(':')) { const i = tab.indexOf(':'), base = tab.slice(0, i), arg = tab.slice(i + 1).replace(/[^\w-]/g, '').slice(0, 40); tab = (base === 'box' && arg ? 'boxmon' : TAB_ALIAS[base] || base) + (arg ? ':' + arg : ''); }
  else tab = TAB_ALIAS[tab] || tab;
  if (panel && !panel.isDestroyed()) { if (quiet) { if (tab) send(panel, 'st:tab', tab); return; } if (panel.isMinimized()) panel.restore(); panel.show(); panel.focus(); if (tab) send(panel, 'st:tab', tab); return; }
  const zoom = dexZoom(), open = !!settings.boxOpen;
  panel = new BrowserWindow({
    width: Math.round((DEX.w + (open ? DEX.box : 0)) * zoom), height: Math.round(DEX.h * zoom), title: 'Screen Trainer Pokédex', show: false,
    frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: '#00000000',
    roundedCorners: false,                       // the device draws its own shape; Windows 11 should not round or outline the window
    icon: trayImage(64) || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, zoomFactor: zoom },
  });
  panel.setMenu(null); applyTopmost();
  panel.loadFile(path.join(__dirname, 'panel.html'), tab ? { hash: tab } : undefined);
  panel.once('ready-to-show', () => { panel.webContents.setZoomFactor(zoom); panel.show(); send(game(), 'st:sound', 'open'); syncBox(); });
  for (const ev of ['show', 'hide', 'minimize', 'restore']) panel.on(ev, () => syncBox());
  panel.on('closed', () => { panel = null; syncBox(); });
}

// ------------------------------------------------------------------ Mewtwo's window
// Same kind of window as the Pokédex: frameless, fixed size, zoomed down on small screens.
function openGuardian() {
  if (guardWin && !guardWin.isDestroyed()) { if (guardWin.isMinimized()) guardWin.restore(); guardWin.show(); guardWin.focus(); return; }
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, zoom = Math.max(0.6, Math.min(1, (wa.height - 16) / GUARD.h, (wa.width - 16) / GUARD.w));
  guardWin = new BrowserWindow({
    width: Math.round(GUARD.w * zoom), height: Math.round(GUARD.h * zoom), title: 'Screen Trainer Mewtwo', show: false,
    frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: '#00000000', roundedCorners: false,
    icon: trayImage(64) || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, zoomFactor: zoom },
  });
  guardWin.setMenu(null); applyTopmost();
  guardWin.loadFile(path.join(__dirname, 'guardian.html'));
  guardWin.once('ready-to-show', () => { guardWin.webContents.setZoomFactor(zoom); guardWin.show(); send(game(), 'st:sound', 'open'); });
  guardWin.on('closed', () => { guardWin = null; });
}

function trayImage(size) {
  try {
    const root = spriteInfo && spriteInfo.root;
    if (root) {
      const img = nativeImage.createFromPath(path.join(root, 'items', 'poke-ball.png'));
      if (!img.isEmpty()) return img.resize({ width: size, height: size, quality: 'best' });
    }
  } catch (e) { /* fall through */ }
  const fallback = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  return fallback.isEmpty() ? null : fallback.resize({ width: size, height: size });
}

function buildTray() {
  if (!tray) return;
  const radio = (key, value, label) => ({ label, type: 'radio', checked: settings[key] === value, click: () => setSettings({ [key]: value }) });
  const check = (key, label) => ({ label, type: 'checkbox', checked: !!settings[key], click: (item) => setSettings({ [key]: item.checked }) });
  if (roping) { tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Escape Rope: packing…', enabled: false }, { label: 'Stop packing (nothing is lost)', click: () => { ropeCancel = true; } }])); return; }
  const forkList = FORK ? [] : forks.list(forksDir());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: FORK ? `Screen Trainer fork "${FORK.name}"` : 'Screen Trainer', enabled: false },
    { type: 'separator' },
    { label: 'Pokédex…', click: () => openPanel() },
    { label: 'Mewtwo, computer guardian…', click: () => openGuardian() },
    { label: 'Rotom, Optimize (tidy a folder)…', click: () => openOptimize() },
    { label: ov && ov.visitors() ? `Online visiting (${ov.visitors()} here)…` : ov && ov.visiting() ? 'Online visiting (you are away)…' : 'Online visiting…', click: () => ov && ov.open() },
    { label: ms && ms.isOpen() ? (ms.isLive() ? 'MyStream (live)…' : ms.isRecording() ? 'MyStream (recording)…' : 'MyStream (open)…') : 'MyStream, streaming studio…', click: () => openMyStream() },
    { label: 'Find my team', click: () => { if (!settings.visible) setSettings({ visible: true }); send(game(), 'st:cmd', { type: 'gather' }); } },
    check('field', 'Field window (windowed mode)'),
    { type: 'separator' },
    { label: 'Strolling mode', submenu: [radio('roam', 'stroll', 'Stroll freely'), radio('roam', 'follow', 'Follow my cursor'), radio('roam', 'stay', 'Stay put')] },
    { label: 'Resize', submenu: [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((v) => radio('scale', v, v + '×')) },
    { label: 'Opacity', submenu: [1, 0.85, 0.7, 0.5, 0.3].map((v) => radio('opacity', v, Math.round(v * 100) + '%')) },
    check('alwaysOnTop', 'Stay on top'),
    check('autoStart', 'Automatic startup'),
    check('paused', 'Pause wild encounters'),
    check('handsOff', 'Hands off my target'),
    check('guardian', 'Show Mewtwo on the screen'),
    { type: 'separator' },
    check('mute', 'Mute'),
    { label: 'Music', submenu: [check('music', 'Play music'), check('battleMusic', 'Battle music during fights'), { type: 'separator' },
      { label: 'Random track', click: () => send(game(), 'st:cmd', { type: 'music', op: 'random' }) }, { label: 'Next track', click: () => send(game(), 'st:cmd', { type: 'music', op: 'next' }) }] },
    { label: settings.visible ? 'Hide overlay' : 'Show overlay', accelerator: settings.hotkey || undefined, click: () => setSettings({ visible: !settings.visible }) },
    { type: 'separator' },
    { label: 'Saved games', submenu: [
      { label: 'Save game…', click: () => exportSave().then((r) => { if (r && r.ok) shell.showItemInFolder(r.file); else if (r && r.error) dialog.showErrorBox('Screen Trainer', r.error); }) },
      { label: 'Load a saved game…', click: () => loadSaveFromTray() },
      { type: 'separator' },
      { label: 'Escape Rope (pack up the whole folder and close)…', click: () => escapeRope() },
    ] },
    { label: 'Export Android app…', click: () => exportApk({ ask: true }).then((r) => { if (r && r.ok) shell.showItemInFolder(r.file); }) },
    { label: mods && mods.count() ? `Mods (${mods.count()} on)` : 'Mods', submenu: [
      { label: 'Choose mods…', click: () => openPanel('options') },
      { label: 'All mods off', enabled: !!(mods && mods.count()), click: () => { if (mods) { mods.allOff(); sendMods(); } } },
      { label: 'Open the mods folder', click: () => openModsFolder() },
    ] },
    FORK ? { label: 'This is a fork: forks are made in the main game', enabled: false } : { label: 'Forks', submenu: [
      { label: 'Make a fork (with a copy of my game)', click: () => makeFork(true) },
      { label: 'Make a fork (starting fresh)', click: () => makeFork(false) },
      ...(forkList.length ? [{ type: 'separator' }] : []),
      ...forkList.map((f) => ({ label: `Start "${f.name}" (from ${f.from || '?'})`, click: () => startFork(f.name) })),
      ...(forkList.length ? [{ type: 'separator' }, { label: 'Throw a fork away', submenu: forkList.map((f) => ({ label: f.name, click: () => trashFork(f.name) })) }] : []),
      { type: 'separator' },
      { label: 'Open the forks folder', click: () => { fs.mkdirSync(forksDir(), { recursive: true }); shell.openPath(forksDir()); } },
    ] },
    { label: 'Developer', submenu: [
      { label: 'Run self-check', click: () => runSelfCheck('tray').then((r) => { if (r && r.dir) shell.openPath(r.dir); }) },
      { label: 'Restart Screen Trainer', click: () => restart() },
    ] },
    { label: 'Close app', click: () => quit() },
  ]));
  tray.setToolTip(FORK ? `Screen Trainer fork "${FORK.name}"` : 'Screen Trainer');
}
function createTray() {
  const img = trayImage(32);
  if (!img) return;
  try {
    tray = new Tray(img);
    tray.on('click', () => openPanel());
    buildTray();
  } catch (e) { console.error('tray', e.message); }
}

function quit() {
  if (quitting) return;
  quitting = true;
  send(game(), 'st:cmd', { type: 'flush' });
  // MyStream first ends a stream or a recording properly and lets the stage write the save
  Promise.resolve(ms && ms.isOpen() ? ms.close() : null).catch(() => {}).then(() => setTimeout(() => app.quit(), 300));
}
/** close and start again, e.g. after its files were replaced with a newer version */
function restart() {
  if (quitting) return;
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== SELFCHECK_ARG && a !== HIDDEN_ARG && a !== MYSTREAM_ARG) });
  quit();
}

// ------------------------------------------------------------------ self-check, and requests left as a file
// selfcheck.js looks the running program over (windows, tray, sprites, the Pokédex controls, what Mewtwo reads from
// Windows), saves pictures of its own windows and writes a report into a "selfcheck" folder next to the program.
// A file named request.json in that folder asks for it without touching the program: { "run": "selfcheck" },
// { "run": "restart" } or { "run": "export-apk" } (writes the Android app into an "android" folder next to the
// program folder, with the options as they are). That is how someone who can only copy files to this computer (an
// AI agent, say) can update the program, restart it and see whether it came up right. Nothing else can be asked for
// this way.
const checker = () => selfcheck.create({
  app, BrowserWindow, screen, desktopCapturer, globalShortcut, guardian, version: app.getVersion(), userDir: userDir(), fork: FORK ? FORK.name : '',
  state: () => ({ overlay, panel, guardWin, optWin, fieldWin, fieldRect, tray, settings, spriteInfo, bankFound }), openPanel, openGuardian, openOptimize, setSettings, online: () => ov,
  exportPlan: () => apkexport.plan(exportContext({})),
  // (1.0, read only) for the how-to pictures: the Escape Rope's question as it would be asked, and a saved game's preview
  ropeQuestion: () => { const root = stHome(), first = escaperope.plan(root, {}); let desk = docs(); try { desk = app.getPath('desktop'); } catch (e) { /* documents */ } return ropeQuestion(root, first, path.join(desk, `Screen Trainer Escape Rope ${new Date().toISOString().slice(0, 10)}.zip`), null); },
  savePreview: () => { try { const buf = stfiles.packSave(fs.readFileSync(saveFile(), 'utf8'), app.getVersion()), r = stfiles.readSave(buf); return r.ok ? { ok: true, file: 'my game.stsave', summary: r.summary, at: r.at, app: r.app } : null; } catch (e) { return null; } },
  extra: async () => {      // (1.0) read only: the mods, the Escape Rope's plan, the forks, and whether the volume mixer can be read
    let rope = null; try { const root = stHome(), p = escaperope.plan(root, {}); rope = { root, files: p.files, bytes: p.bytes, leanBytes: p.leanBytes }; } catch (e) { rope = null; }
    return { mods: mods ? mods.view() : null, rope, forks: { fork: FORK ? FORK.name : '', list: FORK ? [] : forks.list(forksDir()), dir: forksDir() }, mixer: await mixerProbe() };
  },
});
/** (1.0, for the self-check) ps\appvolume.ps1 -Mode probe: counts the programs in the Windows volume mixer, nothing else */
function mixerProbe() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    require('child_process').execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'appvolume.ps1'), '-Mode', 'probe'], { windowsHide: true, timeout: 20000, encoding: 'utf8' }, (err, out, serr) => {
      const last = String(out || '').trim().split(/\r?\n/).pop() || '';
      try { resolve(JSON.parse(last)); } catch (e) { resolve({ ok: false, error: String(serr || (err && err.message) || 'no answer').replace(/\s+/g, ' ').slice(0, 300) }); }
    });
  });
}
let checking = null;
function runSelfCheck(why) {
  if (ms && ms.isOpen()) return Promise.resolve({ ok: false, error: 'MyStream is open: the game is on its stage, not on the overlay. Close MyStream, or ask for "mystream-check" instead.' });
  if (!checking) checking = checker().run(why).catch((e) => ({ ok: false, error: String((e && e.stack) || e) })).finally(() => { checking = null; });
  return checking;
}
let requestTimer = null;
function watchRequests() {
  const dir = selfcheck.dir(app, userDir()), file = path.join(dir, 'request.json');
  clearInterval(requestTimer);
  requestTimer = setInterval(async () => {
    if (quitting || !fs.existsSync(file)) return;
    let req = null;
    try { req = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { req = null; }
    try { fs.unlinkSync(file); } catch (e) { return; }      // taken: it is answered once
    const run = req && typeof req.run === 'string' ? req.run : '', result = { run, at: new Date().toISOString(), version: app.getVersion(), ok: false, note: '' };
    if (run === 'selfcheck') { const r = await runSelfCheck('request'); result.ok = !!(r && r.ok !== false); result.folder = r && r.dir; result.passed = r && r.passed; result.failed = r && r.failed; }
    else if (run === 'restart') { result.ok = true; result.note = 'restarting'; }
    else if (run === 'export-apk') { const r = await exportApk({}); result.ok = !!(r && r.ok); result.export = r; }
    else if (run === 'online-check') {                       // does visiting work from this computer? The program visits itself over the real meeting places (online.js, check). stay: leave MyStream open afterwards
      const was = !!(ms && ms.isOpen());
      if (!was) await openMyStream();
      const r = ov ? await ov.check() : { ok: false, steps: [] };
      if (!was && !req.stay && ms) await ms.close();
      result.ok = !!r.ok; result.online = r;
    }
    else if (run === 'online') { if (ov) ov.open(); result.ok = !!ov; }
    else if (run === 'notepad-check') {                     // (0.9.8) the Unown Notepad with a few lines typed in it: a picture of it, how many Unown came, then it closes without saving
      const w = openNotepad(''), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await new Promise((r) => w.webContents.once('did-finish-load', r)); await wait(1200);
      const text = typeof req.text === 'string' ? req.text.slice(0, 2000) : 'Hello, Unown! This page is grass until a word it knows is written.\n\nI love you.\n\n\n\nThen came fire, and after the fire the sea.\n\n\nAt night we dream. 123 (ok) 🐟 ✨';
      await w.webContents.executeJavaScript(`(() => { const t = document.getElementById('text'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input')); })()`, true);
      await wait(typeof req.wait === 'number' ? Math.min(60000, Math.max(500, req.wait)) : 9000);      // (the grounds need a while to spread)
      const out = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-notepad');
      fs.mkdirSync(out, { recursive: true });
      try { fs.writeFileSync(path.join(out, 'notepad.png'), (await w.capturePage()).toPNG()); } catch (e) { /* no picture */ }
      result.notepad = await w.webContents.executeJavaScript('window.Notepad ? Notepad.state() : null', true).catch(() => null);
      await w.webContents.executeJavaScript(`document.body.classList.add('plain')`, true); await wait(300);
      try { fs.writeFileSync(path.join(out, 'notepad-plain.png'), (await w.capturePage()).toPNG()); } catch (e) { /* no picture */ }
      const st = notes.get(w.webContents.id); if (st) st.closing = true;
      w.close();
      result.ok = !!(result.notepad && result.notepad.glyphs > 20); result.note = out;
    }
    else if (run === 'pointer' || run === 'state') { flushBox(); if (req.pin !== undefined) { send(game(), 'st:cmd', { type: 'pin', who: req.who === 'wild' ? 'wild' : 'team', n: req.n | 0, sec: +req.pin || 0 }); await new Promise((r) => setTimeout(r, 300)); } const r = await pointerReport(); try { fs.writeFileSync(path.join(dir, run === 'state' ? 'state.json' : 'pointer.json'), JSON.stringify(r, null, 1)); result.ok = true; result.note = run === 'state' ? 'state.json' : 'pointer.json'; } catch (e) { result.note = String(e.message); } }
    else if (run === 'export-share') { const r = await exportShare({}); result.ok = !!(r && r.ok); result.export = r; }      // the empty copy, into a "share" folder next to the program folder
    else if (run === 'mystream') { result.ok = !!(await openMyStream()); result.note = 'MyStream opened'; }
    else if (run === 'mystream-close') { if (ms) await ms.close(); result.ok = true; result.note = 'MyStream closed'; }
    else if (run === 'mystream-check') {                   // find: words, the report lists the window titles that contain one; attach: words from the titles of games to switch on first; record: seconds of test recording; stay: leave MyStream open afterwards
      const folder = path.join(dir, new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-') + '-mystream');
      try { fs.mkdirSync(folder, { recursive: true }); const r = await ms.check(folder, { attach: req.attach, find: req.find, record: req.record, stay: req.stay, probe: req.probe, tryHandle: req.tryHandle === true, tuck: req.tuck === true, dex: req.dex === true }); result.ok = !!r.ok; result.folder = folder; result.passed = r.passed; result.failed = r.failed; fs.writeFileSync(path.join(dir, 'latest-mystream.txt'), path.basename(folder) + '\n' + r.text); }
      catch (e) { result.note = String((e && e.stack) || e).slice(0, 600); }
    }
    else result.note = 'unknown request; these exist: "selfcheck", "restart", "export-apk", "export-share", "mystream", "mystream-close", "mystream-check", "online", "online-check", "state" (also "pointer")';
    try { fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2)); } catch (e) { /* the folder went away: nothing to answer into */ }
    if (run === 'restart') restart();
  }, 5000);
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('st:init', (e) => { if (loadingSave && game() && e.sender === game().webContents) loadingSave = false; return { settings: gameSettings(BrowserWindow.fromWebContents(e.sender)), sprites: spriteInfo, save: readJson(saveFile()), version: app.getVersion(), field: fieldOnOverlay(), mods: modsFx(), fork: FORK ? FORK.name : '' }; });      // (loadingSave: a loaded game is on disk; the page that reads it may save again)
// Mewtwo (guardian.js). Each of these only passes plain values on; guardian.js validates all of them.
ipcMain.on('st:open-guardian', () => openGuardian());
// ------------------------------------------------------------------ Optimize: Rotom's window (0.7)
// An ordinary window with a look of its own (optimize.html). optimize.js does the work and states its rules; every
// request below passes plain values, and only this window may make them. The folder is chosen in the system's own
// dialog here, never typed. The window is not offered to MyStream (its title starts with "Screen Trainer") and is
// marked as protected content, so a capture of the screen shows a blank where it is.
function openOptimize() {
  if (optWin && !optWin.isDestroyed()) { if (optWin.isMinimized()) optWin.restore(); optWin.show(); optWin.focus(); return; }
  optWin = new BrowserWindow({
    width: 960, height: 760, minWidth: 720, minHeight: 520, title: 'Screen Trainer Optimize', show: false, backgroundColor: '#070d1c', autoHideMenuBar: true, fullscreenable: false,
    icon: trayImage(64) || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  optWin.setMenu(null); applyTopmost();
  try { optWin.setContentProtection(true); } catch (e) { /* not on this system: the title still keeps it off the stage */ }
  optWin.loadFile(path.join(__dirname, 'optimize.html'));
  optWin.once('ready-to-show', () => { optWin.show(); send(game(), 'st:sound', 'open'); });
  optWin.on('closed', () => { optWin = null; });
}
const fromOpt = (e) => !!optWin && !optWin.isDestroyed() && e.sender === optWin.webContents;
const optHandle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => (fromOpt(e) ? fn(...a) : { ok: false, text: 'Only Rotom\'s window may ask that.' }));
ipcMain.on('st:open-optimize', () => openOptimize());
optHandle('st:o-status', () => optimize.status());
optHandle('st:o-pick', async () => {
  const r = await dialog.showOpenDialog(optWin, { title: 'Choose the folder Rotom should tidy', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
  return optimize.setFolder(r.filePaths[0]);
});
optHandle('st:o-propose', (mode) => optimize.propose(String(mode || '')));
optHandle('st:o-ai', () => optimize.proposeAi());
optHandle('st:o-apply', (id) => optimize.apply(String(id || '')));
optHandle('st:o-undo', () => optimize.undo());
// ---- 0.9.9: Rotom's big tidy-up (tidy.js states its rules). The folders are chosen in Windows' own dialog; the page never names a path that was not chosen there or is not one of the personal folders.
const tidyChosen = new Set();
const tidyKnown = (d) => typeof d === 'string' && (tidyChosen.has(path.resolve(d).toLowerCase()) || tidy.presets().some((p) => p.dir.toLowerCase() === path.resolve(d).toLowerCase()));
optHandle('st:t-status', () => tidy.status());
optHandle('st:t-pick', async (what) => {
  const r = await dialog.showOpenDialog(optWin, { title: what === 'ignore' ? 'A folder Rotom must leave alone' : 'A folder for Rotom to tidy', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const dir = r.filePaths[0], no = what === 'ignore' ? '' : tidy.refuseRoot(dir);
  if (no) return { ok: false, text: no };
  tidyChosen.add(path.resolve(dir).toLowerCase());
  return { ok: true, dir };
});
optHandle('st:t-propose', (o) => {
  o = o && typeof o === 'object' ? o : {};
  const keep = (a) => (Array.isArray(a) ? a.filter(tidyKnown) : []);
  const roots = keep(o.roots), under = (d) => typeof d === 'string' && roots.some((r) => path.resolve(d).toLowerCase().startsWith(path.resolve(r).toLowerCase() + path.sep));
  return tidy.propose(Object.assign({}, o, { roots, ignore: keep(o.ignore), dissolve: (Array.isArray(o.dissolve) ? o.dissolve : []).filter(under) }));
});
optHandle('st:t-apply', async (id) => {
  let told = 0;
  send(game(), 'st:cmd', { type: 'tidy', on: true });
  const r = await tidy.apply(String(id || ''), (p) => { if (Date.now() - told > 120 || p.end) { told = Date.now(); send(optWin, 'st:t-progress', { done: p.done, of: p.of, name: p.name ? path.basename(p.name) : '', to: p.to ? path.basename(p.to) : '', end: !!p.end }); } });
  send(game(), 'st:cmd', { type: 'tidy', on: false, moved: r && r.moved | 0 });
  return r;
});
optHandle('st:t-undo', () => tidy.undo());
/** the places Rotom may never be pointed at (optimize.js, rule 1). deep: that folder and everything in it; above: any folder that holds it */
function optimizeProtected() {
  const env = process.env, home = require('os').homedir(), exeDir = path.dirname(app.getPath('exe'));
  // (only the user folder is also refused from above: Rotom moves the loose files of the chosen folder and never goes into
  //  its subfolders, so the Desktop can be tidied although this program's folder may stand on it)
  const list = [
    { dir: home, above: true, why: 'Your whole user folder is too much. Choose a folder in it: Downloads, Desktop, Documents…' },
    { dir: path.join(home, 'AppData'), deep: true, why: 'That is where your programs keep their settings. Rotom stays out of it.' },
    { dir: env.WINDIR || env.SystemRoot || '', deep: true, why: 'That is Windows itself. Rotom stays out of it.' },
    { dir: env.ProgramFiles || '', deep: true, why: 'That is where your programs live. Rotom stays out of it.' },
    { dir: env['ProgramFiles(x86)'] || '', deep: true, why: 'That is where your programs live. Rotom stays out of it.' },
    { dir: env.ProgramData || '', deep: true, why: 'That is where your programs keep their data. Rotom stays out of it.' },
    { dir: userDir(), deep: true, why: 'That is Screen Trainer\'s own data. Rotom stays out of it.' },
    { dir: exeDir, deep: true, why: 'That is Screen Trainer itself. Rotom stays out of it.' },
    { dir: __dirname, deep: true, why: 'That is Screen Trainer itself. Rotom stays out of it.' },
  ];
  if (process.platform !== 'win32') for (const d of ['/etc', '/usr', '/bin', '/sbin', '/lib', '/var', '/System', '/Library', '/Applications']) list.push({ dir: d, deep: true, why: 'That belongs to the system. Rotom stays out of it.' });
  return list.filter((p) => p.dir);
}
ipcMain.on('st:open-mystream', () => openMyStream());
ipcMain.handle('st:g-status', (_e, o) => guardian.status({ force: !!(o && o.force) }));
ipcMain.handle('st:g-act', async (_e, id, arg) => {
  // A long ability (a quick scan, updates...) sends Mewtwo off: a dive into the bottom right corner of the
  // screen, and back with the answer when it is done (0.9.5, owner's list 11-16 update 1). The others answer on the spot.
  const long = guardian.isLong(id) && process.platform === 'win32';
  if (long) send(game(), 'st:guardian-away', { move: guardian.moveOf(id) });
  let r;
  try { r = await guardian.act(id, arg); } catch (e) { r = { ok: false, text: 'Something went wrong: ' + String(e && e.message).slice(0, 120) }; }
  if (long) send(game(), 'st:guardian-back', { text: `${r.ok && r.move ? r.move + '! ' : ''}${r.text || ''}`.slice(0, 200), tone: r.ok ? 'ok' : 'warn', seconds: 9 });
  else if (r.ok && r.move) send(game(), 'st:guardian', { text: `${r.move}! ${r.text}`.slice(0, 200), tone: 'ok', seconds: 6 });
  return r;
});
ipcMain.handle('st:g-profiles', () => guardian.profiles());
ipcMain.handle('st:g-apply', async (_e, id) => { const r = await guardian.applyProfile(id); if (r.ok) send(game(), 'st:guardian', { text: `${r.move}! ${r.text}`, tone: 'ok', seconds: 7 }); return r; });
ipcMain.handle('st:g-undo', async () => { const r = await guardian.undoProfile(); if (r.ok) send(game(), 'st:guardian', { text: `${r.move}! ${r.text}`, tone: 'ok', seconds: 7 }); return r; });
ipcMain.handle('st:g-custom', (_e, steps) => guardian.saveCustom(steps));
ipcMain.handle('st:g-preview', (_e, steps) => guardian.preview(steps));
ipcMain.handle('st:g-ai', () => guardian.aiView());
ipcMain.handle('st:g-ai-set', (_e, cfg) => guardian.aiSet(cfg));
ipcMain.handle('st:g-ai-detect', () => guardian.aiDetect());
ipcMain.handle('st:g-ai-models', () => guardian.aiModels());
ipcMain.handle('st:g-ask', (_e, history) => guardian.ask(history));
ipcMain.handle('st:g-log', () => guardian.log());
// ---- 0.9.9: Mewtwo's AI watch (sentinel.js) and backups (backup.js). Only Mewtwo's window may ask; each module states its rules.
const fromGuard = (e) => !!guardWin && !guardWin.isDestroyed() && e.sender === guardWin.webContents;
const guardHandle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => (fromGuard(e) ? fn(...a) : { ok: false, text: 'Only Mewtwo\'s window may ask that.' }));
guardHandle('st:g-ai-scan', async () => { const r = await sentinel.scan(true); return { ok: r.ok, text: r.text || '', at: sentinel.status().at, found: sentinel.status().found }; });
guardHandle('st:g-ai-block', (id, on) => sentinel.block(String(id || ''), !!on));
guardHandle('st:g-bk-status', () => backup.status());
guardHandle('st:g-bk-set', (patch) => backup.set(patch));
guardHandle('st:g-bk-target', async () => { const r = await dialog.showOpenDialog(guardWin, { title: 'Where the backup goes: a folder on your USB stick or external drive', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return { ok: false }; return backup.setTarget(r.filePaths[0]); });
guardHandle('st:g-bk-add', async () => { const r = await dialog.showOpenDialog(guardWin, { title: 'A folder to back up', properties: ['openDirectory'] }); if (r.canceled || !r.filePaths[0]) return { ok: false }; return backup.addFolder(r.filePaths[0]); });
guardHandle('st:g-bk-home', (dir) => backup.addFolder(String(dir || '')));
guardHandle('st:g-bk-measure', (dir) => backup.measure(String(dir || '')));
guardHandle('st:g-bk-stop', () => backup.stop());
guardHandle('st:g-bk-open', () => { const s = backup.status(); if (s.where && fs.existsSync(s.where)) shell.openPath(s.where); return true; });
guardHandle('st:g-bk-start', () => runBackup());
/** a backup, with Mewtwo off at work meanwhile (as for its other long jobs) */
async function runBackup() {
  send(game(), 'st:guardian-away', { move: 'Recover' });
  let lastTold = 0;
  const r = await backup.start((p) => { if (Date.now() - lastTold > 250 || !p.name) { lastTold = Date.now(); send(guardWin, 'st:g-bk-progress', p); } });
  guardian.note('Backup', !!r.ok, r.text);
  send(game(), 'st:guardian-back', { text: r.ok ? `Recover! ${r.text}` : r.text, tone: r.ok ? 'ok' : 'warn', seconds: 9 });
  return r;
}
/** now and then: is a new AI program here, and is the weekly backup due? (both only speak; a backup runs by itself only if the owner switched that on) */
function patrolMore() {
  sentinel.scan(false).catch(() => {});
  const d = backup.due();
  if (!d.due) return;
  if (d.auto) runBackup().catch(() => {});
  else send(game(), 'st:guardian', { text: d.here ? `${d.days < 0 ? 'No backup has been made yet' : `The last backup is ${d.days} days old`}, and the drive is here. Click me, then "backup".` : `${d.days < 0 ? 'No backup has been made yet' : `The last backup is ${d.days} days old`}. Plug in the backup drive when you can.`, tone: 'info', seconds: 12 });
}
ipcMain.on('st:win-min', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w !== overlay && w !== game()) w.minimize(); });
ipcMain.on('st:win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w !== overlay && w !== game()) w.close(); });
ipcMain.handle('st:sprites-get', () => spriteInfo);
ipcMain.handle('st:sound-bank', () => soundbank.load(refreshBank()));
ipcMain.on('st:sound', (_e, name) => send(game(), 'st:sound', String(name)));
ipcMain.on('st:panel-box', (_e, open) => setPanelBox(!!open));
ipcMain.on('st:panel-min', () => { if (panel && !panel.isDestroyed()) panel.minimize(); });
ipcMain.on('st:panel-close', () => { if (panel && !panel.isDestroyed()) panel.close(); });
// (the last few switches are kept for the request "pointer": see pointerReport)
// The page says it on every change and once more every two seconds (src/game.js, the "pointer" machine): the window is
// set each time, so the two cannot stay out of step.
const hoverLog = [];
let captureNow = false, blockedAt = 0, stackAt = 0;
ipcMain.on('st:hover', (e, on) => {
  if (!overlay || overlay.isDestroyed() || e.sender !== overlay.webContents) return;      // (the stage is an ordinary page: nothing to pass through)
  overlay.setIgnoreMouseEvents(!on, { forward: true });
  if (!!on !== captureNow) { captureNow = !!on; hoverLog.push({ at: Date.now(), takesMouse: !!on, tied, visible: overlay.isVisible() }); if (hoverLog.length > 120) hoverLog.shift(); }
});
// The page has the mouse, the pointer is moving on a Pokémon, and no mouse event reaches it: another window lies over the
// overlay there. If that is one of our own windows it is rightly in front (the Field Dex over the field). If not, the
// overlay is put back where it belongs, and what lay where is written to the black box (programs by name, no titles).
ipcMain.on('st:blocked', async (e, o) => {
  if (!overlay || overlay.isDestroyed() || e.sender !== overlay.webContents) return;
  const p = screen.getCursorScreenPoint(), now = Date.now();
  const mine = [['the Pokédex', panel], ['Mewtwo\'s window', guardWin], ['the optimizer', optWin], ['the online window', ov && ov.window()], ['MyStream', ms && ms.boothWindow()]]
    .find(([, w]) => { if (!w || w.isDestroyed() || !w.isVisible() || w.isMinimized()) return false; const b = w.getBounds(); return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height; });
  const over = String((o && o.over) || '').replace(/[^\w #.'-]/g, ' ').slice(0, 80);
  if (mine) { if (now - blockedAt > 20000) { blockedAt = now; note({ kind: 'covered', text: `${over}: ${mine[0]} is in front there` }); } return; }
  blockedAt = now;
  const placed = placeOverlay('');
  note({ kind: 'blocked', text: `${over}: clicks did not reach the overlay (${Layer.state}); ${placed ? 'it was put back in place' : 'nothing to put back'}` });
  if (now - stackAt > 30000) { stackAt = now; const st = await windowStack(); if (st) note({ kind: 'stack', text: st.slice(0, 12).map((w) => `${w.n}:${w.program}${w.ours ? ' "' + w.title.slice(0, 24) + '"' : ''}${w.topmost ? ' top' : ''}${w.letsClicksThrough ? ' through' : ''} ${w.w}x${w.h}`).join(' | ') }); }
});
ipcMain.on('st:note', (e, o) => { const g = game(); if (!g || e.sender !== g.webContents || !o || typeof o.kind !== 'string') return; note({ kind: o.kind.replace(/[^\w ]/g, '').slice(0, 24), text: String(o.text || '').slice(0, 600), now: o.now }); });
ipcMain.handle('st:machines', () => stateOfThings());
/** every machine of the main process, and the state the modules keep for themselves, by name */
function stateOfThings() {
  const fw = fieldOpen() ? (fieldWin.isMinimized() ? 'minimised' : fieldWin.isVisible() ? 'open' : 'hidden') : 'closed';
  const on = ov ? ov.view() : null;
  return {
    machines: Machine.report(),
    kept: {                                                 // state that lives in its module's own variables (AGENTS.md says where)
      fieldWindow: fw, box: boxOnShow() ? 'out' : 'in', pokedex: panel && !panel.isDestroyed() ? (panel.isMinimized() ? 'minimised' : panel.isVisible() ? 'open' : 'hidden') : 'closed',
      mouse: captureNow ? 'the overlay takes it' : 'falls through', myStream: ms ? (ms.isOpen() ? (ms.isLive() ? 'open, live' : 'open') + (ms.isRecording() ? ', recording' : '') : 'closed') : 'none',
      online: on ? { mode: on.mode, visit: on.visit && on.visit.state, hosting: !!(on.hosting && on.hosting.on) } : null,
      busy: { selfCheck: !!checking, exportingApk: !!exporting, exportingShare: !!sharing }, quitting,
    },
  };
}
/** For looking into "I clicked a Pokémon and nothing happened": what the game page saw of the pointer, and what the
 *  windows were doing. Written to the self-check folder as pointer.json by the request { "run": "pointer" }. */
/** every visible top-level window on this computer, front to back, the way Windows has them stacked (ps\windows.ps1, the
 *  readable script MyStream also uses). Windows of other programs are named by their program only, never by their title. */
function windowStack() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const exe = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    require('child_process').execFile(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'windows.ps1'), '-Mode', 'list'], { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      let list = null;
      try { const j = JSON.parse(String(stdout || '').trim().split(/\r?\n/).pop() || ''); list = j && Array.isArray(j.windows) ? j.windows : null; } catch (e) { list = null; }
      if (!list) return resolve(null);
      const me = path.basename(process.execPath, '.exe').toLowerCase();
      resolve(list.map((w, i) => {
        const ours = String(w.proc || '').toLowerCase() === me, ex = Number(w.ex) || 0;
        return { n: i, program: String(w.proc || ''), ours, title: ours ? String(w.title || '') : '', cls: String(w.cls || '').slice(0, 60), topmost: !!(ex & 0x8), letsClicksThrough: !!(ex & 0x20), layered: Math.floor(ex / 0x80000) % 2 === 1, noActivate: Math.floor(ex / 0x08000000) % 2 === 1, owned: !!w.owned, cloaked: w.cloaked | 0, minimized: !!w.min, x: w.x, y: w.y, w: w.w, h: w.hgt };
      }));
    });
  });
}
async function pointerReport() {
  const win = (w) => (w && !w.isDestroyed() ? { title: w.getTitle(), bounds: w.getBounds(), visible: w.isVisible(), minimized: w.isMinimized(), onTop: w.isAlwaysOnTop(), focused: w.isFocused(), ownedBy: w.getParentWindow() ? w.getParentWindow().getTitle() : '' } : null);
  const g = game();
  let page = null;
  try { page = g ? await g.webContents.executeJavaScript('typeof G !== "undefined" && G.pointerReport ? G.pointerReport() : null', true) : null; } catch (e) { page = { error: String(e && e.message) }; }
  const focused = BrowserWindow.getFocusedWindow();
  return {
    at: new Date().toISOString(), version: app.getVersion(), cursor: screen.getCursorScreenPoint(), tied, fieldRect, covers: { watching: !!coverProc, list: JSON.parse(coverSig) }, boxShown, stayOnTop: !!settings.alwaysOnTop, visibleSetting: !!settings.visible,
    focusedWindow: focused ? focused.getTitle() : '(none of ours)', gamePage: g === overlay ? 'overlay' : g ? 'stage' : 'none',
    windows: { overlay: win(overlay), field: win(fieldWin), pokedex: win(panel), mewtwo: win(guardWin), optimize: win(optWin), online: win(ov && ov.window()), booth: win(ms && ms.boothWindow()) },
    mouseSwitches: hoverLog.slice(-60), page, stack: await windowStack(), main: stateOfThings(),
  };
}
ipcMain.on('st:save', (e, json) => { const g = game(); if (!loadingSave && g && e.sender === g.webContents && typeof json === 'string' && json.length < 20e6) writeAtomic(saveFile(), json); });      // only the page that runs the game saves

// ------------------------------------------------------------------ the Unown Notepad (0.9.8, owner's list 11-16 update 17)
// A notepad window whose writing is Living Unown (notepad.html). Notes are .unown files (stfiles.js), read and written
// only here, where the owner chooses: the page never sees a path. Windows can hand Screen Trainer a .unown file ("Open
// with"): then only the notepad opens, not the game (see the start of the program at the end of this file).
const notes = new Map();                                    // webContents id -> { win, file, dirty, closing }
const noteOf = (e) => notes.get(e.sender.id) || null;
function openNotepad(file) {
  const win = new BrowserWindow({ width: 1250, height: 820, minWidth: 420, minHeight: 300, title: 'Unown Notepad', show: false, backgroundColor: '#fbfaf4', autoHideMenuBar: true, icon: trayImage(64) || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  win.setMenu(null);
  const st = { win, file: file || '', dirty: false, closing: false, pending: null }, id = win.webContents.id;
  notes.set(id, st);
  win.loadFile(path.join(__dirname, 'notepad.html'));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('close', (e) => {
    if (!st.dirty || st.closing || quitting) return;
    e.preventDefault();
    const c = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Save', "Don't save", 'Cancel'], defaultId: 0, cancelId: 2, title: 'Unown Notepad', message: 'Save the note before closing?' });
    if (c === 0) send(win, 'np:ask-save', 1);
    else if (c === 1) { st.closing = true; win.close(); }
  });
  win.on('closed', () => { notes.delete(id); if (notepadOnly && !gameStarted && !notes.size) app.quit(); });      // (opened from Windows only for this note: that was all)
  return win;
}
/** read a note file for a notepad window: { text, name } or { locked, name } or { error } */
function readNoteFile(st, file, word) {
  let buf = null;
  try { buf = fs.readFileSync(file); } catch (e) { return { ok: false, error: 'That note could not be read.' }; }
  const r = stfiles.readNote(buf, word);
  if (!r.ok && r.why === 'word') { st.pending = file; return { ok: false, locked: true, name: path.basename(file), why: word ? 'word' : 'locked' }; }
  if (!r.ok) return { ok: false, error: r.why === 'not' ? 'That is not an Unown note.' : 'That note is damaged or was changed.' };
  st.file = file; st.pending = null;
  return { ok: true, text: r.text, name: path.basename(file), locked: r.locked };
}
ipcMain.handle('np:hello', (e) => {
  const st = noteOf(e);
  if (!st) return null;
  if (!spriteInfo) refreshSprites();
  const out = { sprites: spriteInfo, style: (settings && settings.spriteStyle) || 'showdown' };
  if (st.file) { const r = readNoteFile(st, st.file); out.open = r.ok ? r : r.locked ? { locked: true, name: r.name } : null; if (!r.ok && !r.locked) st.file = ''; }
  return out;
});
ipcMain.handle('np:open', async (e) => {
  const st = noteOf(e);
  if (!st) return null;
  const r = await dialog.showOpenDialog(st.win, { title: 'Open an Unown note', defaultPath: st.file ? path.dirname(st.file) : docs(), properties: ['openFile'], filters: [{ name: stfiles.KINDS.note.name, extensions: [stfiles.KINDS.note.ext] }] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false };
  const x = readNoteFile(st, r.filePaths[0]);
  if (x.locked) { send(st.win, 'np:text', { locked: true, name: x.name }); return { ok: false }; }
  return x;
});
ipcMain.handle('np:unlock', (e, word) => { const st = noteOf(e); if (!st || !st.pending || typeof word !== 'string') return { ok: false }; return readNoteFile(st, st.pending, word); });
ipcMain.handle('np:save', async (e, o) => {
  const st = noteOf(e);
  if (!st || !o || typeof o.text !== 'string') return { ok: false };
  let file = o.as ? '' : st.file;
  if (!file) {
    const r = await dialog.showSaveDialog(st.win, { title: 'Save the note', defaultPath: st.file || path.join(docs(), 'Note.unown'), filters: [{ name: stfiles.KINDS.note.name, extensions: [stfiles.KINDS.note.ext] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    file = r.filePath;
  }
  try { fs.writeFileSync(file, stfiles.packNote(o.text, app.getVersion(), typeof o.word === 'string' ? o.word.slice(0, 200) : '')); } catch (err) { return { ok: false, error: 'It could not be saved: ' + err.message }; }
  st.file = file; st.dirty = false;
  return { ok: true, name: path.basename(file) };
});
ipcMain.on('np:dirty', (e, on) => { const st = noteOf(e); if (st) st.dirty = !!on; });
ipcMain.on('np:close-ok', (e, ok) => { const st = noteOf(e); if (st && ok) { st.closing = true; st.win.close(); } });
ipcMain.on('st:open-notepad', () => openNotepad(''));

// ------------------------------------------------------------------ saved games as files (0.9.8, owner's list 11-16 update 19)
// "Save game" writes the whole save into one small sealed .stsave file where the owner chooses (stfiles.js); "Load a
// saved game" reads one and, after the owner says yes, makes it the game: the save in use is kept first
// (backupsefore-load-<time>), the file is written as save.json and the page that runs the game starts again and reads
// it. While that happens the page may not save (loadingSave), or its last save would undo the load.
let loadingSave = false, pickedSave = null;
const flushGame = () => new Promise((r) => { const g = game(); if (!g || g.isDestroyed()) return r(); send(g, 'st:cmd', { type: 'flush' }); setTimeout(r, 400); });
const docs = () => { try { return app.getPath('documents'); } catch (e) { return userDir(); } };
ipcMain.handle('st:save-export', () => exportSave());
async function exportSave() {
  await flushGame();
  let text = '';
  try { text = fs.readFileSync(saveFile(), 'utf8'); } catch (e) { return { ok: false, error: 'There is no save yet.' }; }
  const day = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(panel && !panel.isDestroyed() ? panel : undefined, { title: 'Save your game', defaultPath: path.join(docs(), `Screen Trainer ${day}.stsave`), filters: [{ name: stfiles.KINDS.save.name, extensions: [stfiles.KINDS.save.ext] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  try { const b = stfiles.packSave(text, app.getVersion()); fs.writeFileSync(r.filePath, b); return { ok: true, file: r.filePath, bytes: b.length }; } catch (e) { return { ok: false, error: 'It could not be written: ' + e.message }; }
}
/** (1.0) the tray's "Load a saved game…": Windows' dialog, then the Pokédex asks, exactly as a file opened with Windows would */
async function loadSaveFromTray() {
  const r = await dialog.showOpenDialog({ title: 'Load a saved game', defaultPath: docs(), properties: ['openFile'], filters: [{ name: stfiles.KINDS.save.name, extensions: [stfiles.KINDS.save.ext] }] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return;
  offerSave(r.filePaths[0]);
}
ipcMain.handle('st:save-pick', async () => {
  pickedSave = null;
  const r = await dialog.showOpenDialog(panel && !panel.isDestroyed() ? panel : undefined, { title: 'Load a saved game', defaultPath: docs(), properties: ['openFile'], filters: [{ name: stfiles.KINDS.save.name, extensions: [stfiles.KINDS.save.ext] }] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false };
  return pickSaveFile(r.filePaths[0]);
});
function pickSaveFile(file) {
  let buf = null;
  try { buf = fs.readFileSync(file); } catch (e) { return { ok: false, error: 'That file could not be read.' }; }
  const s = stfiles.readSave(buf);
  if (!s.ok) return { ok: false, error: s.why === 'not' ? 'That is not a Screen Trainer saved game.' : 'That saved game is damaged or was changed, so it is not loaded.' };
  pickedSave = { save: s.save, file };
  return { ok: true, file: path.basename(file), summary: s.summary, at: s.at, app: s.app };
}
ipcMain.handle('st:save-load', async () => {
  if (!pickedSave) return { ok: false, error: 'Choose a saved game first.' };
  const p = pickedSave; pickedSave = null;
  await flushGame();
  loadingSave = true;
  try {
    const dir = path.join(userDir(), 'backups', 'before-load-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(saveFile())) fs.copyFileSync(saveFile(), path.join(dir, 'save.json'));
    writeAtomic(saveFile(), JSON.stringify(p.save));
  } catch (e) { loadingSave = false; return { ok: false, error: 'It could not be loaded: ' + e.message }; }
  const g = game();
  if (g && !g.isDestroyed()) g.webContents.reload(); else loadingSave = false;
  setTimeout(() => { loadingSave = false; }, 20000);      // (should the page never ask, saving is allowed again after a while)
  note({ kind: 'save loaded', text: 'a saved game was loaded from a file (the one before is in backups)' });      // (no file names in the black box)
  return { ok: true };
});
ipcMain.on('st:state', (e, s) => {
  const g = game(); if (!g || e.sender !== g.webContents) return;
  send(panel, 'st:state', s); send(fieldWin, 'st:state', s);
  // what the pointers to be won are counted from (online.js)
  try { gameStats = Object.assign({ species: (s.dex && s.dex.caught) | 0, shiny: (s.stats && s.stats.shiny) | 0, badges: Array.isArray(s.badges) ? s.badges.filter((b) => b && b.earned).length : 0, helpers: s.helpers ? Object.values(s.helpers).filter(Boolean).length : 0 }, s.ptr && typeof s.ptr === 'object' ? s.ptr : null); } catch (err) { /* stays as it was */ }      // (0.9.7: s.ptr, everything the 205 pointers are won by: G.pointerStats in src/game.js)
});       // the field window reads who its ground is grown from
// The field window's camera (0.7). The overlay owns it (src/overlay.js): the field window reports a drag of the grass or
// a turn of the wheel ('st:field-cam'), the overlay answers with what its camera shows now ('st:field-view'), and the
// field window draws its ground exactly so. Only numbers pass, and only between those two pages.
const two = (a) => (Array.isArray(a) ? [+a[0] || 0, +a[1] || 0] : undefined);
ipcMain.on('st:field-cam', (e, m) => {
  if (!fieldOpen() || e.sender !== fieldWin.webContents || !m || typeof m !== 'object' || !overlay || overlay.isDestroyed()) return;
  send(overlay, 'st:field-cam', { pan: two(m.pan), zoom: m.zoom ? (m.zoom > 0 ? 1 : -1) : 0, at: two(m.at) });
});
ipcMain.on('st:field-view', (e, v) => {
  if (!overlay || overlay.isDestroyed() || e.sender !== overlay.webContents) return;
  const n = (x, lo, hi) => Math.min(hi, Math.max(lo, +x || 0));
  fieldView = v && typeof v === 'object' ? { W: n(v.W, 1, 40000), H: n(v.H, 1, 40000), x: n(v.x, -40000, 40000), y: n(v.y, -40000, 40000), z: n(v.z, 0.1, 8) || 1, levels: (Array.isArray(v.levels) ? v.levels : []).slice(0, 12).map(Number).filter((z) => z > 0) } : null;
  send(fieldWin, 'st:field-view', fieldView);
});
ipcMain.handle('st:field-view-get', () => fieldView);
ipcMain.handle('st:export-info', () => exportInfo());
ipcMain.handle('st:export-apk', (_e, o) => exportApk(Object.assign({}, o, { ask: true })));
// The empty copy (0.7, shareexport.js): the program zipped for somebody else, with nothing of the owner's in it.
let sharing = null;
function exportShare(o) {
  if (sharing) return sharing;
  sharing = (async () => {
    let file = path.join(path.dirname(exportDir()), 'share', `ScreenTrainer-${app.getVersion()}-empty.zip`);
    if (o && o.ask) {
      const r = await dialog.showSaveDialog(panel || undefined, { title: 'Export an empty copy of Screen Trainer', defaultPath: file, filters: [{ name: 'Zip file', extensions: ['zip'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      file = /\.zip$/i.test(r.filePath) ? r.filePath : r.filePath + '.zip';
    }
    return shareexport.run({ exeDir: path.dirname(app.getPath('exe')), appDir: __dirname, version: app.getVersion() }, file, (p) => send(panel, 'st:share-progress', p));
  })().finally(() => { sharing = null; });
  return sharing;
}
ipcMain.handle('st:export-share', () => exportShare({ ask: true }));
ipcMain.handle('st:share-info', () => { const p = shareexport.plan(path.dirname(app.getPath('exe')), __dirname); return { files: p.entries.length, bytes: p.bytes, exe: p.exe }; });

// ------------------------------------------------------------------ 1.0: the Escape Rope, mods, forks
// The Screen Trainer folder: the one that holds the program folder, when it looks like ours (escaperope.home).
const stHome = () => escaperope.home(path.dirname(app.getPath('exe')));
const forksDir = () => path.join(stHome(), 'forks');
const modsDir = () => path.join(FORK ? FORK.dir : stHome(), 'mods');      // (a fork has a mods folder of its own)
const gb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB');

// The Escape Rope (escaperope.js): pick where the zip goes, say what is packed, then close the windows and pack the
// whole folder; when it is done, show the zip and quit. The tray says how far it is and can stop it.
let roping = false, ropeCancel = false;
/** the Escape Rope's question before packing (also drawn by the self-check, for the how-to videos) */
function ropeQuestion(root, first, outFile, free) {
  return {
    type: 'question', title: 'Escape Rope', buttons: ['Pack and close', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true,
    message: `Pack the whole Screen Trainer folder and close?`,
    detail: `Folder: ${root}\n${first.files} files, ${gb(first.bytes)} (sprites, sounds and anything else you put there), plus your saved game and settings.\n\nThe zip: ${outFile}${free !== null && free < first.bytes * 0.8 ? `\n\nOnly ${gb(free)} is free there. Pick another place if the zip does not fit.` : ''}\n\nScreen Trainer closes now and packs; the tray icon shows how far it is. When it is done the zip is shown and the program ends. Nothing in the folder is changed.`,
    checkboxLabel: first.leanFiles ? `Leave out old backups, shared copies and self-check pictures (${gb(first.leanBytes)})` : undefined, checkboxChecked: false,
  };
}
async function escapeRope() {
  if (roping || quitting) return;
  const root = stHome();
  const first = escaperope.plan(root, {});
  const day = new Date().toISOString().slice(0, 10);
  let desk = docs(); try { desk = app.getPath('desktop'); } catch (e) { /* documents, then */ }
  const pick = await dialog.showSaveDialog({ title: 'Escape Rope: where should the zip go?', defaultPath: path.join(desk, `Screen Trainer Escape Rope ${day}.zip`), filters: [{ name: 'Zip file', extensions: ['zip'] }] });
  if (pick.canceled || !pick.filePath) return;
  const outFile = /\.zip$/i.test(pick.filePath) ? pick.filePath : pick.filePath + '.zip';
  let free = null;
  try { const s = fs.statfsSync(path.dirname(outFile)); free = s.bavail * s.bsize; } catch (e) { free = null; }
  const ask = await dialog.showMessageBox(ropeQuestion(root, first, outFile, free));
  if (ask.response !== 0) return;
  roping = true; ropeCancel = false;
  await flushGame();
  let saveBuf = null, settingsText = '';
  try { saveBuf = stfiles.packSave(fs.readFileSync(saveFile(), 'utf8'), app.getVersion()); } catch (e) { saveBuf = null; }
  try { settingsText = fs.readFileSync(settingsFile(), 'utf8'); } catch (e) { settingsText = ''; }
  try { if (ms && ms.isOpen()) await ms.close(); } catch (e) { /* closing anyway */ }
  try { if (ov) ov.close(); } catch (e) { /* closing anyway */ }
  quitting = true;                                          // (nothing is opened again from here on)
  for (const w of BrowserWindow.getAllWindows()) { try { w.destroy(); } catch (e) { /* gone */ } }
  globalShortcut.unregisterAll();
  buildTray();
  let lastTip = 0;
  const r = await escaperope.run({ root, outFile, lean: !!ask.checkboxChecked, version: app.getVersion(), saveBuf, settingsText, cancelled: () => ropeCancel,
    onProgress: (p) => { const now = Date.now(); if (now - lastTip > 500 && tray) { lastTip = now; tray.setToolTip(`Escape Rope: packing ${Math.floor((p.bytes / Math.max(1, p.ofBytes)) * 100)}% (${p.done} of ${p.of} files)`); } } });
  if (r.ok) {
    shell.showItemInFolder(r.file);
    await dialog.showMessageBox({ type: 'info', title: 'Escape Rope', buttons: ['OK'], message: 'Packed. Screen Trainer is ready to travel.', detail: `${r.file}\n${r.files} files, ${gb(r.bytes)}.${r.skipped.length ? `\n${r.skipped.length} file(s) could not be read and were left out (another program had them open): ${r.skipped.slice(0, 5).map((s) => s.name).join(', ')}` : ''}\n\nOn the other computer: unzip it, start Screen Trainer\\ScreenTrainer.exe, and it offers your saved game.` });
  } else if (r.cancelled) await dialog.showMessageBox({ type: 'info', title: 'Escape Rope', buttons: ['OK'], message: 'Packing was stopped. No zip was left behind and nothing was changed.' });
  else await dialog.showMessageBox({ type: 'error', title: 'Escape Rope', buttons: ['OK'], message: 'The zip could not be made.', detail: r.error + '\n\nNothing in the folder was changed. Start Screen Trainer again and try another place for the zip.' });
  app.quit();
}
ipcMain.handle('st:rope-info', () => { const root = stHome(), p = escaperope.plan(root, {}); return { root, files: p.files, bytes: p.bytes, leanBytes: p.leanBytes }; });
ipcMain.handle('st:rope', () => { setTimeout(() => escapeRope(), 50); return true; });

// (1.0) how-to videos (howto.js): in the "howto" folder beside the program, listed only once the sprites folder is found
const howto = require('./howto');
ipcMain.handle('st:howto', () => ({ locked: !(spriteInfo && spriteInfo.ok), clips: howto.list(stHome()) }));
ipcMain.handle('st:howto-play', (e, key, kind) => {
  if (!(spriteInfo && spriteInfo.ok)) return false;
  const f = howto.file(stHome(), String(key || ''), ['gif', 's10', 's30'].includes(kind) ? kind : 's30');
  if (!f) return false;
  shell.openPath(f); return true;
});

// Mods (mods.js): data only, checked, off until switched on. The game pages get the spawn multipliers and colours.
let mods = null;
const modsFx = () => (mods ? mods.effects() : { on: [], spawns: {}, colors: {} });
function sendMods() { const fx = modsFx(); send(game(), 'st:mods', fx); send(panel, 'st:mods', fx); buildTray(); }
function openModsFolder() {
  const dir = modsDir();
  try { fs.mkdirSync(dir, { recursive: true }); const rm = path.join(dir, 'README.txt'); if (!fs.existsSync(rm)) fs.writeFileSync(rm, modsLib.readme()); } catch (e) { /* shown as it is */ }
  shell.openPath(dir);
}
ipcMain.handle('st:mods-view', (_e, again) => (mods ? (again ? mods.refresh() : mods.view()) : null));
ipcMain.handle('st:mods-set', (_e, id, on) => { if (!mods || typeof id !== 'string') return null; const v = mods.set(id, !!on); sendMods(); return v; });
ipcMain.handle('st:mods-off', () => { if (!mods) return null; const v = mods.allOff(); sendMods(); return v; });
ipcMain.handle('st:mods-folder', () => { openModsFolder(); return true; });
ipcMain.handle('st:mods-fx', () => modsFx());

// Forks (forks.js)
function makeFork(withSave) {
  if (FORK) return { ok: false, error: 'This is a fork already. Make new forks from the main game.' };
  flushGame().then(() => {
    const r = forks.make({ forksDir: forksDir(), appDir: __dirname, version: app.getVersion(), userDir: userDir(), withSave: !!withSave });
    buildTray();
    if (r.ok) dialog.showMessageBox({ type: 'info', title: 'Screen Trainer forks', buttons: ['Start it now', 'Show the folder', 'Later'], noLink: true, message: `Fork "${r.name}" is ready.`, detail: `${r.dir}\n\nIts app folder is a full copy of the program to change as you like; its data folder holds its own ${withSave ? 'copy of your game' : 'fresh game'}. It runs beside this one with its own tray icon.` })
      .then((a) => { if (a.response === 0) startFork(r.name); else if (a.response === 1) shell.openPath(r.dir); });
    else dialog.showErrorBox('Screen Trainer forks', r.error);
    send(panel, 'st:forks', forks.list(forksDir()));
  });
  return { ok: true };
}
function startFork(name) {
  const f = forks.list(forksDir()).find((x) => x.name === name);
  if (!f) return { ok: false, error: 'There is no such fork.' };
  try {
    const child = require('child_process').spawn(process.execPath, app.isPackaged ? [`--fork=${f.dir}`] : [app.getAppPath(), `--fork=${f.dir}`], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function trashFork(name) {
  const f = forks.list(forksDir()).find((x) => x.name === name);
  if (!f) return { ok: false };
  const a = await dialog.showMessageBox({ type: 'question', title: 'Screen Trainer forks', buttons: ['Move it to the Recycle Bin', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true, message: `Throw fork "${f.name}" away?`, detail: `${f.dir}\n\nClose the fork first if it is running. The folder goes to the Recycle Bin, so it can still be put back from there.` });
  if (a.response !== 0) return { ok: false };
  try { await shell.trashItem(f.dir); } catch (e) { dialog.showErrorBox('Screen Trainer forks', 'It could not be moved to the Recycle Bin (is the fork still running?): ' + e.message); }
  buildTray(); send(panel, 'st:forks', forks.list(forksDir()));
  return { ok: true };
}
ipcMain.handle('st:forks', () => ({ fork: FORK ? FORK.name : '', list: FORK ? [] : forks.list(forksDir()), dir: forksDir() }));
ipcMain.handle('st:fork-make', (_e, withSave) => makeFork(!!withSave));
ipcMain.handle('st:fork-start', (_e, name) => (typeof name === 'string' ? startFork(name) : { ok: false }));
ipcMain.handle('st:fork-trash', (_e, name) => (typeof name === 'string' ? trashFork(name) : { ok: false }));
ipcMain.handle('st:fork-folder', () => { fs.mkdirSync(forksDir(), { recursive: true }); shell.openPath(forksDir()); return true; });
ipcMain.on('st:state-request', (_e, full) => send(game(), 'st:state-request', !!full));
ipcMain.on('st:cmd', (_e, c) => send(game(), 'st:cmd', c));
ipcMain.on('st:open-panel', (_e, tab) => openPanel(typeof tab === 'string' ? tab : undefined));
ipcMain.on('st:open-field', (e) => { if (!overlay || overlay.isDestroyed() || e.sender !== overlay.webContents) return; if (!settings.field) setSettings({ field: true }); else { openField(); if (fieldOpen()) fieldWin.show(); } });      // (0.9.5: only the overlay asks; on the MyStream stage there is no field window)
ipcMain.on('st:point-panel', (_e, tab) => { if (typeof tab === 'string' && panel && !panel.isDestroyed() && panel.isVisible() && !panel.isMinimized()) openPanel(tab, true); });      // (0.9.5: a pat in the Box Field shows that Pokémon in the open Pokédex)
ipcMain.on('st:quit', () => quit());
ipcMain.handle('st:settings-get', (e) => gameSettings(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('st:settings-set', (_e, patch) => {
  const clean = {};
  for (const k of Object.keys(patch || {})) if (k in DEFAULTS) clean[k] = patch[k];
  return setSettings(clean);
});
ipcMain.handle('st:pick-sprites', async () => {
  const r = await dialog.showOpenDialog(panel || undefined, { title: 'Choose your sprites folder', properties: ['openDirectory'], defaultPath: settings.spritesPath || app.getPath('desktop') });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const root = sprites.normalize(r.filePaths[0]);
  if (!root) return { ok: false, error: 'That folder does not contain a "pokemon" sprites folder.' };
  setSettings({ spritesPath: root });
  return { ok: spriteInfo.ok, path: root };
});
// one-time import of sound effects, cries and music from a ROM the user picks
ipcMain.handle('st:import-rom', async () => {
  const r = await dialog.showOpenDialog(panel || undefined, { title: 'Choose a Pokémon FireRed or LeafGreen ROM', properties: ['openFile'], defaultPath: app.getPath('downloads'),
    filters: [{ name: 'Game Boy Advance ROM', extensions: ['gba', 'bin'] }, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const res = soundbank.importRom(r.filePaths[0], userDir());
  if (res.ok) { refreshBank(); send(game(), 'st:sound-bank-changed', 1); }
  return { ok: res.ok, error: res.error, info: res.info };
});
ipcMain.handle('st:remove-bank', () => { const ok = soundbank.remove(userDir()); refreshBank(); send(game(), 'st:sound-bank-changed', 1); return { ok }; });
ipcMain.handle('st:info', () => ({
  api: API, version: app.getVersion(), packaged: app.isPackaged, fieldOpen: fieldOpen(), myStream: !!(ms && ms.isOpen()), host: require('os').hostname(), windows: process.platform === 'win32', saveDir: userDir(), spritesPath: settings.spritesPath, spritesOk: !!(spriteInfo && spriteInfo.ok),
  bank: bankFound ? { file: bankFound.file, source: bankFound.source } : null,
  spriteSets: spriteInfo ? { showdown: !!spriteInfo.idx['pokemon/other/showdown'], bw: !!spriteInfo.idx['pokemon/versions/generation-v/black-white/animated'], static: !!spriteInfo.idx.pokemon } : {},
  displays: screen.getAllDisplays().map((d, i) => ({ i, label: `Display ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' — primary' : ''}` })),
}));

// ------------------------------------------------------------------ Android export
// apkexport.js packs the game, the options as they are right now (locked: the app has no Options screen), the sprites
// those options need and, if wanted, the save and the sound bank into an Android app (.apk), and signs it with a key
// that is made once and kept with the save. Nothing is uploaded; the file is written where the user says.
const exportDir = () => (app.isPackaged ? path.join(path.dirname(process.execPath), '..', 'android') : path.join(userDir(), 'android'));
function exportContext(o) {
  return { appDir: __dirname, userDir: userDir(), version: app.getVersion(), settings, spriteInfo, save: o.save === false ? null : readJson(saveFile()), bank: o.sounds === false || !bankFound ? null : bankFound.file };
}
function exportInfo() {
  let plan = null;
  try { plan = apkexport.plan(exportContext({})); } catch (e) { plan = { ok: false, error: String((e && e.message) || e) }; }
  return { plan, dir: exportDir(), busy: !!exporting, last: apkexport.last() };
}
/** o: { ask: show a "save as" window first, save: false to leave the save out, sounds: false to leave the sound bank out } */
function exportApk(o) {
  if (exporting) return exporting;
  exporting = (async () => {
    send(game(), 'st:cmd', { type: 'flush' });            // the save on disk should be the save as it is now
    await new Promise((r) => setTimeout(r, 300));
    let file = path.join(exportDir(), 'ScreenTrainer.apk');
    if (o.ask) {
      const r = await dialog.showSaveDialog(panel || undefined, { title: 'Export the Android app', defaultPath: file, filters: [{ name: 'Android app', extensions: ['apk'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      file = /\.apk$/i.test(r.filePath) ? r.filePath : r.filePath + '.apk';
    }
    try { return await apkexport.run(exportContext(o), file, (p) => send(panel, 'st:export-progress', p)); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  })().finally(() => { exporting = null; });
  return exporting;
}

// ------------------------------------------------------------------ lifecycle
if (!app.requestSingleInstanceLock()) app.quit();
else {
  // (0.9.8) Windows can start Screen Trainer with one of its files: "Open with" a .unown note opens only the Unown
  // Notepad, without the game (the owner's wish: "selecting Screen Trainer when it's not playing will not start the game,
  // just open the file"); a .stsave saved game starts the game and offers to load it (Options > Save data).
  app.on('second-instance', (_e, argv) => {
    const f = stfiles.fileArg(argv);
    if (f && /\.unown$/i.test(f)) { openNotepad(f); return; }
    if (!gameStarted) startGame();
    if (f) { offerSave(f); return; }
    if ((argv || []).includes(GUARDIAN_ARG)) openGuardian(); else if ((argv || []).includes(MYSTREAM_ARG)) openMyStream(); else openPanel();
  });
  app.whenReady().then(() => {
    const f = stfiles.fileArg(process.argv);
    if (f && /\.unown$/i.test(f)) { notepadOnly = true; settings = loadSettings(); refreshSprites(); openNotepad(f); return; }
    startGame();
    if (f) setTimeout(() => offerSave(f), 1500);
  });
}
/** a saved game handed over by Windows: the Pokédex opens on Options with it, asking whether to load it */
function offerSave(file) {
  const r = pickSaveFile(file);
  openPanel('options');
  setTimeout(() => send(panel, 'st:save-offer', r), 900);
}
let gameStarted = false, notepadOnly = false;
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  {
    backupOnUpgrade();
    // (1.0) unzipped from an Escape Rope on a computer that never played: its settings are taken, and its save is offered
    const ropeSave = !FORK && !fs.existsSync(saveFile()) ? escaperope.findSave(path.dirname(app.getPath('exe'))) : null;
    if (ropeSave && !fs.existsSync(settingsFile())) { const sf = escaperope.findSettings(path.dirname(app.getPath('exe'))); if (sf) { try { const s = JSON.parse(fs.readFileSync(sf, 'utf8')); s.firstRun = false; writeAtomic(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { /* starts fresh */ } } }
    settings = loadSettings();
    mods = modsLib.create({ modsDir, userDir, DEFAULTS, sanitize: (s) => sanitize(s, screenH()), getSettings: () => settings, setSettings });
    mods.init({ allOff: process.argv.includes(NOMODS_ARG) });
    refreshSprites();
    refreshBank();
    createMyStream();
    createOnline();
    createOverlay();
    if (settings.field) openField();                      // the field was open last time
    createTray();
    applyHotkey();
    applyAutoStart();
    guardian.init({ userDir: userDir(), safeStorage, shell, getSettings: () => settings, setSettings, say: (m) => send(game(), 'st:guardian', m) });
    const homes = () => { const o = {}; for (const [k, n] of [['Desktop', 'desktop'], ['Documents', 'documents'], ['Downloads', 'downloads'], ['Pictures', 'pictures'], ['Videos', 'videos'], ['Music', 'music']]) { try { o[k] = app.getPath(n); } catch (e) { /* this Windows has no such folder */ } } return o; };
    tidy.init({ userDir, protectedDirs: optimizeProtected, homes, trash: (d) => shell.trashItem(d) });
    backup.init({ userDir, homes, saveFile: async () => { await flushGame(); try { return stfiles.packSave(fs.readFileSync(saveFile(), 'utf8'), app.getVersion()); } catch (e) { return null; } } });
    sentinel.init({ userDir, selfExe: app.getPath('exe'), say: (m) => send(game(), 'st:guardian', m), log: (what, ok, text) => guardian.note(what, ok, text) });
    setTimeout(patrolMore, 90000); setInterval(patrolMore, 30 * 60000);
    optimize.init({ userDir, protectedDirs: optimizeProtected, complete: (system, user, max) => guardian.complete(system, user, max) });
    watchRequests();
    if (process.argv.includes(GUARDIAN_ARG)) openGuardian();
    if (process.argv.includes(MYSTREAM_ARG)) setTimeout(() => openMyStream(), 1500);
    if (process.argv.includes(SELFCHECK_ARG)) setTimeout(() => runSelfCheck('command line'), 6000);
    if (ropeSave) setTimeout(() => offerSave(ropeSave), 2500);
    const startedHidden = process.argv.includes(HIDDEN_ARG);
    if (settings.firstRun || (!startedHidden && !spriteInfo.ok)) { openPanel(settings.firstRun ? 'help' : 'options'); settings.firstRun = false; persistSettings(); }
    else if (!tray && !startedHidden) openPanel();
    const refit = () => { if (overlay && !overlay.isDestroyed()) overlay.setBounds(overlayBounds()); syncField(); };
    screen.on('display-metrics-changed', refit); screen.on('display-added', refit); screen.on('display-removed', refit);
  }
}
{
  app.on('window-all-closed', () => { /* keep running in the tray (a notepad opened on its own quits when it closes) */ });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { stopCover(); if (ov) { try { ov.close(); } catch (e) { /* going anyway */ } } globalShortcut.unregisterAll(); clearInterval(cursorTimer); clearInterval(topTimer); clearInterval(requestTimer); clearTimeout(fieldSaveT); guardian.stop(); });
}
