// Screen Trainer — MyStream (main process): the streaming studio.
//
// MyStream is two windows:
//   the STAGE  (stage.html)    a hidden page of a fixed size, 1280 x 720. It is the only thing viewers ever see: the
//                              grass and the fountain, the game windows the owner switched on, the Pokémon, the sticky
//                              notes. It is never shown on the desktop and nothing from the desktop is ever in it.
//   the BOOTH  (mystream.html) the window the owner works in. It shows a live picture of the stage and every control.
//                              Nothing in the booth is streamed.
// The picture that goes to Twitch or into a recording is a capture of the stage page itself (not of the screen), so
// it does not change when the booth is resized, minimised or covered, or when other programs are opened.
//
// While MyStream is open the game lives on the stage instead of the desktop overlay (main.js closes the overlay and
// opens it again afterwards; the save file is the handover). Clicks on the booth's picture are passed on to the stage.
//
// Rules that must stay true (tools/mystreamcheck.js checks them):
//   1. Only the stage is captured. The screen is never captured, and the display-capture handler below hands out
//      nothing but the stage page (plus, if the owner switched it on, the computer's sound).
//   2. A window is put on the stage only if the owner switched it on in the Games list. Screen Trainer's own windows
//      and windows recognised as Steam's can not be switched on at all.
//   3. What Mewtwo says is never readable on the stage (src/stage.js masks it; the booth shows the real words).
//   4. The Twitch tokens and the stream key never reach a window and are never written to disk in the clear
//      (Electron safeStorage; without it they are kept for this session only).
//   5. Going live and recording start only from a click in the booth. Nothing here starts them by itself.
'use strict';
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const STAGE = { w: 1280, h: 720 };
const BOOTH = { w: 1180, h: 760, minW: 780, minH: 540 };
const NOTE_COLORS = ['yellow', 'pink', 'mint', 'sky', 'lilac', 'peach'];
const MAX_SOURCES = 12, MAX_NOTES = 12;
const TWITCH = {
  device: 'https://id.twitch.tv/oauth2/device', token: 'https://id.twitch.tv/oauth2/token', validate: 'https://id.twitch.tv/oauth2/validate',
  api: 'https://api.twitch.tv/helix', whip: 'https://g.webrtc.live-video.net:4443/v2/offer',
  scopes: 'channel:read:stream_key channel:manage:broadcast chat:read chat:edit',      // read the stream key; set title, category and markers; read and write chat (0.6)
  chat: 'wss://irc-ws.chat.twitch.tv:443',
  activate: /^https:\/\/(www|id)\.twitch\.tv\//, whipHosts: /(^|\.)live-video\.net$/,
};
// windows that can never be put on the stage: this program's own, and Steam's
const OWN_TITLE = /^(Screen Trainer|MyStream)\b/;
const DEX_TITLE = 'My Field Dex';                           // the Pokédex window as something that can be switched on like a game (0.6)
const STEAM_TITLE = /^(steam|friends list|special offers|sign in to steam|steam guard.*|steam big picture mode|steam (settings|library|store|community|chat|overlay|client|support|login|news|market|friends|input|keyboard|controller|remote play|download|downloads|update|dialog|web helper|client webhelper)\b.*|steam - .*|.* - steam)$/i;
const isSteam = (title) => STEAM_TITLE.test(String(title || '').trim());

const num = (v, lo, hi, def) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');
const r4 = (v) => Math.round(v * 10000) / 10000;
/** the lengths a recording can have, in seconds: short ones for clips and for trying things out, long ones for videos */
const REC_LENGTHS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600];
const recSnap = (s) => REC_LENGTHS.reduce((b, x) => (Math.abs(x - s) < Math.abs(b - s) ? x : b), REC_LENGTHS[0]);

/** bring a saved MyStream file into valid shape (missing things take their default; anything unknown is dropped) */
function sanitize(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}, out = { v: 1 };
  const b = c.bounds;
  out.bounds = b && [b.x, b.y, b.width, b.height].every((n) => isFinite(+n)) ? { x: Math.round(+b.x), y: Math.round(+b.y), width: Math.round(num(b.width, BOOTH.minW, 20000, BOOTH.w)), height: Math.round(num(b.height, BOOTH.minH, 20000, BOOTH.h)) } : null;
  out.quality = c.quality === '1080' ? '1080' : '720';
  out.showTrainer = c.showTrainer !== false;                 // my Pokémon are on the stage
  out.fountain = c.fountain !== false;
  out.micBadge = c.micBadge !== false;                       // viewers see a small sign while the microphone is open
  out.tuck = !!c.tuck;                                       // keep each game's own window off the desktop while it is on the stage
  out.pcSound = !!c.pcSound;                                 // send the computer's sound along (everything it plays)
  out.pcVol = Math.round(num(c.pcVol, 0, 150, 100));        // (1.0) how loud the computer's sound is in the stream and the recording, in %
  out.micVol = Math.round(num(c.micVol, 0, 200, 100));      // (1.0) how loud the microphone is in them, in %
  out.micId = str(c.micId, 200);
  out.talkKey = c.talkKey === '' ? '' : (typeof c.talkKey === 'string' && /^[A-Za-z0-9+]{1,40}$/.test(c.talkKey) ? c.talkKey : 'Control+Alt+T');
  // how long a recording runs (0.7): from a five-second clip to an hour. recMinutes is what 0.6 and earlier read.
  out.recSeconds = recSnap(c.recSeconds !== undefined ? num(c.recSeconds, 5, 3600, 1800) : num(c.recMinutes, 15, 60, 30) * 60);
  out.recMinutes = Math.min(60, Math.max(15, Math.round(out.recSeconds / 300) * 5));
  out.title = str(c.title, 140);
  const seen = new Set();
  const id = (v, p) => { let s = typeof v === 'string' && new RegExp('^' + p + '[a-z0-9]{1,12}$').test(v) ? v : p + Math.random().toString(36).slice(2, 8); while (seen.has(s)) s = p + Math.random().toString(36).slice(2, 8); seen.add(s); return s; };
  out.sources = (Array.isArray(c.sources) ? c.sources : []).map((s) => {
    if (!s || typeof s !== 'object' || !str(s.title, 200).trim() || isSteam(s.title) || OWN_TITLE.test(s.title)) return null;
    return { id: id(s.id, 's'), title: str(s.title, 200).trim(), on: s.on !== false, x: r4(num(s.x, -0.9, 1.4, 0.3)), y: r4(num(s.y, -0.9, 1.4, 0.5)), w: r4(num(s.w, 0.03, 2, 0.4)),
      ar: r4(num(s.ar, 0.05, 40, 16 / 9)), placed: !!s.placed, key: ['auto', 'black', 'white', 'none'].includes(s.key) ? s.key : 'auto', tol: r4(num(s.tol, 0.01, 0.6, 0.07)), front: !!s.front, desk: !!s.desk,
      mouse: s.mouse === 'show' ? 'show' : 'hide',      // 0.9.4: is the Windows mouse pointer left in this game's picture? Hidden by default: the owner's own pointer is on the stage instead
      vol: s.vol === null || s.vol === undefined || s.vol === '' || !isFinite(+s.vol) ? null : Math.round(num(s.vol, 0, 100, 100)) };      // 1.0: this game's own volume in the Windows mixer, in % (null: never touched)
  }).filter(Boolean).slice(0, MAX_SOURCES);
  // the owner's own pointer on the stage (0.9.4): shown at all, how large, and an arrow at the edge when the mouse is off the stage
  const p = c.pointer && typeof c.pointer === 'object' ? c.pointer : {};
  out.pointer = { show: p.show !== false, size: Math.round(num(p.size, 1, 3, 1.5) * 4) / 4, edge: p.edge !== false };
  // The stacking order on the stage, from the back to the front (0.6): 'fountain' (the fountain and its places),
  // 'trainer' (my Pokémon) and the ids of the games. The owner changes it in the games list with the order numbers.
  {
    const known = new Set(['fountain', 'trainer', ...out.sources.map((s) => s.id)]);
    let order = (Array.isArray(c.order) ? c.order : []).filter((k, i, a) => typeof k === 'string' && known.has(k) && a.indexOf(k) === i);
    if (!order.includes('fountain') || !order.includes('trainer')) order = [...out.sources.filter((s) => !s.front && s.title !== DEX_TITLE).map((s) => s.id), 'fountain', 'trainer', ...out.sources.filter((s) => s.front || s.title === DEX_TITLE).map((s) => s.id)];      // a layout from before there was an order: the games as "behind" / "in front" said
    for (const s of out.sources) if (!order.includes(s.id)) { if (s.title === DEX_TITLE) order.push(s.id); else order.splice(Math.min(order.indexOf('fountain'), order.indexOf('trainer')), 0, s.id); }      // something new: a game goes behind the Pokémon and the fountain, the Field Dex in front of everything
    out.order = order;
    for (const s of out.sources) s.front = order.indexOf(s.id) > order.indexOf('trainer');
  }
  // windows that are off the desktop right now and where each belongs (written before a window is moved, so that it
  // can be put back even after a crash): handle -> { x, y, proc, cls, title }
  out.away = {};
  if (c.away && typeof c.away === 'object') for (const h of Object.keys(c.away).slice(0, 16)) {
    const a = c.away[h];
    if (/^\d{1,17}$/.test(h) && a && typeof a === 'object' && isFinite(+a.x) && isFinite(+a.y)) out.away[h] = { x: Math.round(num(a.x, -32000, 32000, 0)), y: Math.round(num(a.y, -32000, 32000, 0)), proc: str(a.proc, 80), cls: str(a.cls, 200), title: str(a.title, 200) };
  }
  out.notes = (Array.isArray(c.notes) ? c.notes : []).map((n) => {
    if (!n || typeof n !== 'object') return null;
    const text = str(n.text, 160).trim();
    if (!text) return null;
    return { id: id(n.id, 'n'), text, color: NOTE_COLORS.includes(n.color) ? n.color : 'yellow', x: r4(num(n.x, 0, 1, 0.1)), y: r4(num(n.y, 0, 1, 0.1)), rot: Math.round(num(n.rot, -8, 8, -3)), on: n.on !== false };
  }).filter(Boolean).slice(0, MAX_NOTES);
  const t = c.twitch && typeof c.twitch === 'object' ? c.twitch : {};
  const secret = (v) => (typeof v === 'string' && /^e:[A-Za-z0-9+/=]{1,6000}$/.test(v) ? v : '');
  out.twitch = { clientId: typeof t.clientId === 'string' && /^[a-z0-9]{10,60}$/i.test(t.clientId.trim()) ? t.clientId.trim() : '', login: str(t.login, 60), name: str(t.name, 60), userId: /^\d{1,20}$/.test(String(t.userId || '')) ? String(t.userId) : '',
    access: secret(t.access), refresh: secret(t.refresh), key: secret(t.key), keyFrom: t.keyFrom === 'login' ? 'login' : t.key ? 'typed' : '',
    server: typeof t.server === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?\/[\w\-./]*$/i.test(t.server) ? t.server : '' };
  return out;
}
/** Where the owner's mouse is, for the stage (0.9.4). Pure, so that tools/v094check.js can try it without Windows.
 *  cur     { dip: {x, y} where Electron says the mouse is, phys: {x, y} the same in screen pixels,
 *            shape: [hotspot x, hotspot y, width, height, shown] of the Windows pointer in screen pixels (ps\pointer.ps1) }
 *  wins    { sourceId: [left, top, right, bottom] } the windows of the games on the stage, in screen pixels
 *  tiles   { sourceId: { x, y, w, ar, live } } where each game lies on the stage (shares of the stage, as in cfg.sources)
 *  primary { x, y, width, height } the main display (DIP): the stage stands for it, as wide as the stage, from its top
 *  booth   { over: the mouse is on the booth window, play: { x, y } where it is on the booth's picture (stage pixels) or null }
 *  Returns { tiles: { sourceId: [x0, y0, x1, y1] }, known: [sourceIds whose window place is known], host: { at, x, y, a } }:
 *    tiles: for each game whose picture the Windows pointer is drawn into, that part of the picture (shares of it),
 *           with a margin: the stage paints it over from an earlier picture when the game's mouse is set to "hidden";
 *    host:  where the owner's own pointer goes on the stage (via: the game it was placed through, if any): at 'stage' (x, y in stage pixels), at 'edge' (an arrow
 *           at x, y on the stage's rim, pointing at angle a, because the mouse is somewhere off the stage), or 'off'
 *           (the mouse is on the booth: the owner is in the studio, not in the game). */
const NEAR = 90;                                            // screen pixels round a game's window where the pointer counts as coming in
function pointerFrame(cur, wins, tiles, primary, booth) {
  const out = { tiles: {}, known: Object.keys(wins || {}), host: { at: 'off', x: 0, y: 0, a: 0 } };
  const sh = Array.isArray(cur.shape) ? cur.shape : [0, 0, 32, 32, 1], p = cur.phys || cur.dip, d = cur.dip;
  const cw = Math.max(8, +sh[2] || 32), ch = Math.max(8, +sh[3] || 32), m = Math.max(4, Math.round(Math.max(cw, ch) * 0.25));
  let best = null;
  for (const id of Object.keys(wins || {})) {
    const r = wins[id];
    if (!Array.isArray(r) || r.length < 4) continue;
    const [l, t, rr, b] = r, W = rr - l, H = b - t;
    if (!(W >= 8 && H >= 8)) continue;
    const x0 = (p.x - sh[0] - m - l) / W, y0 = (p.y - sh[1] - m - t) / H, x1 = (p.x - sh[0] + cw + m - l) / W, y1 = (p.y - sh[1] + ch + m - t) / H;
    const ax = NEAR / W, ay = NEAR / H;                    // a little before it gets there: no clean copy is made with a pointer about to come in
    if (sh[4] && x1 > -ax && y1 > -ay && x0 < 1 + ax && y0 < 1 + ay) out.tiles[id] = [x0, y0, x1, y1].map(r4);
    const tile = tiles && tiles[id];
    if (tile && tile.live && p.x >= l && p.x < rr && p.y >= t && p.y < b && (!best || W * H < best.area)) best = { id, area: W * H, fx: (p.x - l) / W, fy: (p.y - t) / H, tile };
  }
  const SW = STAGE.w, SH = STAGE.h;
  let x, y;
  if (booth && booth.play) { x = booth.play.x; y = booth.play.y; }                       // playing on the booth's picture
  else if (booth && booth.over) return out;                                                // in the studio: nothing for viewers
  else if (best) { const t = best.tile; x = (t.x + best.fx * t.w) * SW; y = t.y * SH + (best.fy * t.w * SW) / Math.max(0.05, t.ar || 16 / 9); }      // over a game: where that game lies on the stage
  else { const P = primary || { x: 0, y: 0, width: 1920, height: 1080 }, k = SW / Math.max(1, P.width); x = (d.x - P.x) * k; y = (d.y - P.y) * k; }      // anywhere else: the stage is the main display
  if (!Number.isFinite(x) || !Number.isFinite(y)) return out;
  const via = !(booth && booth.play) && best ? best.id : '';      // the game it was placed through: the stage leaves the owner's pointer out where that game's own mouse is shown
  if (x >= 0 && x <= SW && y >= 0 && y <= SH) { out.host = { at: 'stage', x: Math.round(x), y: Math.round(y), a: 0, via }; return out; }
  // off the stage: an arrow on the rim, on the line from the middle of the stage to the mouse
  const IN = 26, cx = SW / 2, cy = SH / 2, dx = x - cx, dy = y - cy, s = Math.min(dx ? (cx - IN) / Math.abs(dx) : Infinity, dy ? (cy - IN) / Math.abs(dy) : Infinity);
  out.host = { at: 'edge', x: Math.round(cx + dx * s), y: Math.round(cy + dy * s), a: Math.round((Math.atan2(dy, dx) * 180) / Math.PI), via };
  return out;
}

/** only letters and digits, lower case: "TBH: Task Bar Hero v1.2" and "TBH: Task Bar Hero v1.3" are the same game */
const titleKey = (t) => String(t || '').toLowerCase().replace(/[^a-z]+/g, '');
/** which open window belongs to a remembered game: the same title, or one that differs only in digits and punctuation */
function matchWindow(title, windows, taken) {
  const free = windows.filter((w) => !taken.has(w.mediaId) && !w.steam);
  const k = titleKey(title);
  return free.find((w) => w.title === title) || (k.length >= 4 ? free.find((w) => titleKey(w.title) === k) : null) || null;
}

function create(ctx) {
  const { app, BrowserWindow, ipcMain, desktopCapturer, session, safeStorage, shell, globalShortcut, screen } = ctx;
  const EP = Object.assign({}, TWITCH, ctx.endpoints || {});
  const doFetch = ctx.fetch || ((...a) => fetch(...a));
  const file = () => path.join(ctx.userDir(), 'mystream.json');
  let cfg = null, stage = null, booth = null, opening = null, closing = null, attachTimer = null, saveT = null, validateTimer = null;
  let frozen = false;                   // (checks only: keep a stand-in window attached)
  let attached = {};                    // source id -> the window it shows right now: { mediaId, title }
  let stageInfo = { ready: false, sources: {}, notes: {} }, nudge = 0, lastMewtwo = null, live = { on: false, since: 0, resource: null }, rec = null, pending = null, twError = '';
  let ptrProc = null, ptrFor = '', ptrStarted = 0, ptrWins = {}, ptrShape = [0, 0, 32, 32, 1], ptrTimer = null, ptrSig = '', boothPoint = null, ptrFails = 0, ptrLast = null;      // the owner's pointer (0.9.4)
  const memory = {};                    // secrets kept for this session only, when the computer cannot encrypt them
  const alive = (w) => !!w && !w.isDestroyed();
  const isOpen = () => alive(booth) && alive(stage);
  const send = (w, ch, v) => { if (alive(w)) w.webContents.send(ch, v); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- the saved file
  function load() { let raw = null; try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { raw = null; } cfg = sanitize(raw); return cfg; }
  function persist(now) {
    clearTimeout(saveT);
    const write = () => { try { fs.mkdirSync(path.dirname(file()), { recursive: true }); const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, file()); } catch (e) { console.error('mystream save', e.message); } };
    if (now) write(); else saveT = setTimeout(write, 400);
  }
  const canEncrypt = () => { try { return !!safeStorage && safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
  function putSecret(name, text) {
    delete memory[name];
    if (!text) { cfg.twitch[name] = ''; return; }
    if (canEncrypt()) cfg.twitch[name] = 'e:' + safeStorage.encryptString(String(text)).toString('base64');
    else { cfg.twitch[name] = ''; memory[name] = String(text); }
  }
  function getSecret(name) {
    if (memory[name]) return memory[name];
    const v = cfg.twitch[name];
    if (!v) return '';
    try { return safeStorage.decryptString(Buffer.from(v.slice(2), 'base64')); } catch (e) { return ''; }
  }
  const hasSecret = (name) => !!(memory[name] || cfg.twitch[name]);
  /** what the booth may know: everything except the secrets */
  function view() {
    const t = cfg.twitch;
    return {
      chat: { state: chat.state, canSend: chat.canSend, channel: chat.channel, mayWrite: twScopes.includes('chat:edit') }, desk,
      cfg: Object.assign({}, cfg, { twitch: undefined }), stage: STAGE, colors: NOTE_COLORS, version: ctx.version, recLengths: REC_LENGTHS,
      attached: Object.fromEntries(Object.keys(attached).map((k) => [k, attached[k].title])), sources: stageInfo.sources, noteRects: stageInfo.notes || {},
      twitch: { clientId: t.clientId, login: t.login, name: t.name, connected: hasSecret('refresh') || hasSecret('access'), hasKey: hasSecret('key'), keyFrom: t.keyFrom, server: t.server, pending: pending ? { code: pending.code, url: pending.url, until: pending.until } : null, error: twError, safe: canEncrypt() },
      live: { on: live.on, since: live.since }, rec: rec ? { file: rec.file, bytes: rec.bytes, since: rec.since } : null, mewtwo: lastMewtwo, nudge,
      pointers: pointerChoice(), pointerWatch: { helper: !!ptrProc, windows: Object.keys(ptrWins).length },
    };
  }
  /** the owner's pointers (the same choice as in the online window: online.js keeps it) */
  function pointerChoice() { try { return ctx.pointer ? ctx.pointer() : null; } catch (e) { return null; } }
  const pushView = () => send(booth, 'ms:view', view());
  /** what the stage needs: the layout, with the window each game is shown from */
  const stageConfig = () => ({ stage: STAGE, showTrainer: cfg.showTrainer, fountain: cfg.fountain, order: cfg.order, micBadge: cfg.micBadge, notes: cfg.notes.filter((n) => n.on), pointer: cfg.pointer,
    sources: cfg.sources.filter((s) => s.on).map((s) => Object.assign({}, s, { mediaId: attached[s.id] ? (attached[s.id].mediaId === 'tab:dex' ? dexMedia() : attached[s.id].mediaId) : null },
      s.title === DEX_TITLE && s.key === 'auto' ? { key: 'black' } : null)) });      // (the Pokédex window is see-through round its device: that arrives as black and is taken out; the device fills too much of the edge for "find out" to notice)
  // The Field Dex on the stage is a capture of its own page, as the booth's picture of the stage is. An id for that is
  // made once per Pokédex window (asking again would hand the stage a new id and restart the picture every time).
  let dexId = { wc: 0, size: '', id: null };
  function dexMedia() {
    try {
      const p = ctx.panel && ctx.panel();
      if (!p || p.isDestroyed() || !alive(stage)) return null;
      const [w, h] = p.getContentSize(), k = (ctx.screen.getDisplayMatching(p.getBounds()).scaleFactor) || 1, size = `${Math.round(w * k)}x${Math.round(h * k)}`;      // the picture is taken at the window's own size; it changes when the Box slides out
      if (dexId.wc !== p.webContents.id || dexId.size !== size || !dexId.id) dexId = { wc: p.webContents.id, size, id: `tab:${size}:` + p.webContents.getMediaSourceId(stage.webContents) };
      return dexId.id;
    } catch (e) { return null; }
  }
  /** tell the Pokédex window whether it may be on a stream right now (it blurs folder paths then: panel.css) */
  function markDex(on) { try { const p = ctx.panel && ctx.panel(); if (p && !p.isDestroyed()) p.webContents.executeJavaScript(`document.body.classList.toggle('onstream', ${on ? 'true' : 'false'})`, true).catch(() => {}); } catch (e) { /* no window */ } }
  const pushStage = () => send(stage, 'ms:stage', stageConfig());

  // ---------------------------------------------------------------- windows that could go on the stage
  // Windows itself is asked about windows through one readable script, ps\windows.ps1 (it says what it does at its
  // top). Fixed program, fixed script, and only whole numbers are ever passed to it.
  const PS_EXE = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const whole = (v) => { v = Math.round(+v); return Number.isFinite(v) && Math.abs(v) < 4e15 ? v : null; };
  function winTool(mode, handle, x, y) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32' && !ctx.winToolTest) return resolve({ ok: false, error: 'only on Windows' });
      if (ctx.winToolTest) return resolve(ctx.winToolTest(mode, handle, x, y));
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'windows.ps1'), '-Mode', mode === 'move' ? 'move' : 'list'];
      if (mode === 'move') { const h = whole(handle), px = whole(x), py = whole(y); if (!h || px === null || py === null || Math.abs(px) > 32000 || Math.abs(py) > 32000) return resolve({ ok: false, error: 'not a number' }); args.push('-Handle', String(h), '-X', String(px), '-Y', String(py)); }
      execFile(PS_EXE, args, { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
        const last = String(stdout || '').trim().split(/\r?\n/).pop() || '';
        try { const j = JSON.parse(last); if (j && typeof j === 'object') return resolve(j); } catch (e) { /* not an answer */ }
        resolve({ ok: false, error: String((stderr || (err && err.message) || 'no answer')).replace(/\s+/g, ' ').slice(0, 400) });
      });
    });
  }
  // (1.0) How loud each game is: ps\appvolume.ps1 reads or sets the volume of the program that owns a game's window, in
  // the Windows volume mixer (what the owner hears, and so what "the computer's sound" sends along). Only whole numbers
  // are passed. The game must be on the stage as a window (not the Field Dex, which is Screen Trainer's own sound).
  function appVolume(handle, vol) {
    return new Promise((resolve) => {
      const h = whole(handle);
      if (!h) return resolve({ ok: false, error: 'not a window' });
      const set = vol !== undefined && vol !== null;
      if (set && !(Number.isInteger(vol) && vol >= 0 && vol <= 100)) return resolve({ ok: false, error: 'not a volume' });
      if (ctx.volTest) return resolve(ctx.volTest(h, set ? vol : null));
      if (process.platform !== 'win32') return resolve({ ok: false, error: 'only on Windows' });
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'appvolume.ps1'), '-Mode', set ? 'set' : 'get', '-Handle', String(h)];
      if (set) args.push('-Volume', String(vol));
      execFile(PS_EXE, args, { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
        const last = String(stdout || '').trim().split(/\r?\n/).pop() || '';
        try { const j = JSON.parse(last); if (j && typeof j === 'object') return resolve(j); } catch (e) { /* not an answer */ }
        resolve({ ok: false, error: String((stderr || (err && err.message) || 'no answer')).replace(/\s+/g, ' ').slice(0, 300) });
      });
    });
  }
  const volDone = {};      // window handle -> the volume last set there (so that a game that comes back gets its volume again, once)
  async function gameVolume(id, vol) {
    const s = cfg.sources.find((x) => x.id === id), a = s && attached[s.id], h = a && /^window:\d+:/.test(a.mediaId) ? hwnd(a.mediaId) : '';
    if (!s) return { ok: false, error: 'There is no such game in the list.' };
    if (vol !== undefined) { s.vol = vol === null ? null : Math.round(num(vol, 0, 100, 100)); persist(); }
    if (!h) return { ok: vol !== undefined, saved: true, error: vol !== undefined ? '' : 'The game is not open right now.', volume: s.vol };
    const r = await appVolume(+h, vol === undefined || s.vol === null ? undefined : s.vol);
    if (r && r.ok && s.vol !== null) volDone[h] = s.vol;
    return Object.assign({ saved: vol !== undefined }, r);
  }
  /** a game that is on the stage again gets the volume the owner gave it */
  function volumesAfterAttach() {
    for (const s of cfg.sources) {
      const a = attached[s.id], h = a && /^window:\d+:/.test(a.mediaId) ? hwnd(a.mediaId) : '';
      if (h && s.vol !== null && volDone[h] !== s.vol) { volDone[h] = s.vol; appVolume(+h, s.vol).then((r) => { if (!r || !r.ok || r.volume < 0) delete volDone[h]; }).catch(() => {}); }      // (no sound yet: tried again next time)
    }
  }
  const hwnd = (id) => String(id || '').split(':')[1] || '';
  // Windows leaves some windows out of its "windows you can share" list: tool windows and owned windows, which is
  // what desktop pets are (the ROG OMNI Virtual Pet is one: program "Virtual Pet", window "ASUSMascot"). They can be
  // captured by their handle all the same, so they are added to the list here, marked `hidden`. Windows' own
  // furniture never is.
  const SYS_CLASS = /^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd|Windows\.UI\.Core\.CoreWindow|ApplicationFrameWindow|XamlExplorerHostIslandWindow|tooltips_class32|IME|MSCTFIME UI|Xaml_WindowedPopupClass|TopLevelWindowForOverflowXamlIsland|NotifyIconOverflowWindow|Windows\.UI\.Composition\.DesktopWindowContentBridge|#32768|#32770)$/i;
  const SYS_PROC = /^(explorer|dwm|ShellExperienceHost|SearchHost|StartMenuExperienceHost|TextInputHost|SystemSettings|LockApp|csrss|winlogon|sihost|ctfmon|ScreenTrainer|steam.*)$/i;
  let winCache = { at: 0, list: [], busy: null };
  /** every visible top-level window as Windows describes it; asked again when the answer is older than maxAge ms */
  function allWindows(maxAge) {
    if (Date.now() - winCache.at < maxAge) return Promise.resolve(winCache.list);
    if (!winCache.busy) winCache.busy = winTool('list').then((r) => { winCache = { at: Date.now(), list: r && r.ok && Array.isArray(r.windows) ? r.windows : [], busy: null }; return winCache.list; });
    return winCache.busy;
  }
  const isHiddenId = (mediaId) => winCache.list.some((w) => String(w.h) === hwnd(mediaId) && w.hiddenOffer);
  async function listWindows(thumbs) {
    let list = [];
    try { list = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: thumbs ? { width: 256, height: 144 } : { width: 0, height: 0 }, fetchWindowIcons: false }); } catch (e) { list = []; }
    const own = new Set(BrowserWindow.getAllWindows().map((w) => { try { return hwnd(w.getMediaSourceId()); } catch (e) { return ''; } }));
    const out = list.filter((s) => s.name && s.name.trim() && !own.has(hwnd(s.id)) && !OWN_TITLE.test(s.name))
      .map((s) => ({ mediaId: s.id, title: s.name.trim().slice(0, 200), steam: isSteam(s.name), thumb: thumbs && s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '' }));
    // Asking Windows starts a helper program, so it is only done when it can matter: the list is being looked at, a game
    // that is switched on has no window yet, or one of the windows on the stage is a hidden one (it may have closed).
    const missing = !!cfg && cfg.sources.some((s) => s.on && !attached[s.id]), usesHidden = Object.values(attached).some((a) => isHiddenId(a.mediaId));
    if ((process.platform === 'win32' || ctx.winToolTest) && (thumbs || missing || usesHidden)) {
      const all = await allWindows(thumbs ? 8000 : 45000), have = new Set(out.map((w) => hwnd(w.mediaId)));
      for (const w of all) {
        w.hiddenOffer = false;
        if (have.has(String(w.h)) || own.has(String(w.h)) || w.cloaked || w.min || SYS_CLASS.test(w.cls || '') || SYS_PROC.test(w.proc || '') || (!w.title && !w.proc)) continue;
        const title = (w.title ? `${w.title} (${w.proc || 'program'})` : w.proc).slice(0, 200);
        if (OWN_TITLE.test(title) || isSteam(title)) continue;
        w.hiddenOffer = true;
        out.push({ mediaId: `window:${w.h}:0`, title, steam: false, thumb: '', hidden: true });
      }
    }
    try { const p = ctx.panel && ctx.panel(); if (p && !p.isDestroyed() && p.isVisible() && !p.isMinimized()) out.unshift({ mediaId: 'tab:dex', title: DEX_TITLE, steam: false, thumb: '', dex: true }); } catch (e) { /* no Pokédex window */ }
    return out;
  }
  // ---------------------------------------------------------------- games only in MyStream ("tuck away", option cfg.tuck)
  // The owner's wish: a game that is on the stage should not also clutter the desktop, and the mouse pointer should not
  // be drawn into its picture (Windows draws it while the pointer is over the window). A program cannot take another
  // program's window into itself, but the window can stand off the visible desktop: the game keeps running and is
  // still captured (checked on the owner's laptop with both games). So with cfg.tuck on, the window of every game on
  // the stage is moved to AWAY_X, and back to exactly where it was when the game is switched off, set "on my desktop
  // too" (s.desk), the option is switched off, or MyStream closes. Where it belongs is saved first (cfg.away).
  const AWAY_X = 20000;
  let tuckBusy = false, tuckAgain = false;
  async function syncTuck() {
    if (tuckBusy) { tuckAgain = true; return; }
    tuckBusy = true;
    try {
      const want = new Map();
      if (isOpen() && cfg.tuck && !closing) for (const s of cfg.sources) { const a = attached[s.id]; if (s.on && !s.desk && a && /^window:/.test(a.mediaId)) want.set(hwnd(a.mediaId), s.title); }
      const back = Object.keys(cfg.away).filter((h) => !want.has(h)), go = [...want.keys()].filter((h) => !cfg.away[h]);
      if (!back.length && !go.length) return;
      const all = await allWindows(0), find = (h) => all.find((q) => String(q.h) === h);
      for (const h of back) {
        const p = cfg.away[h], w = find(h);
        if (w && w.proc === p.proc && w.cls === p.cls && w.x >= AWAY_X - 200) await winTool('move', +h, p.x, p.y);      // only if it is still that window (handles are used again after a restart)
        delete cfg.away[h]; persist(true);
      }
      for (const h of go) {
        const w = find(h);
        if (!w || w.x >= AWAY_X - 200) continue;
        cfg.away[h] = { x: w.x, y: w.y, proc: String(w.proc || ''), cls: String(w.cls || ''), title: want.get(h) }; persist(true);
        const r = await winTool('move', +h, AWAY_X, w.y);
        if (!r || !r.ok) { delete cfg.away[h]; persist(true); }
      }
      winCache.at = 0;
    } finally { tuckBusy = false; if (tuckAgain) { tuckAgain = false; syncTuck().catch(() => {}); } else if (isOpen()) pushView(); }
  }
  /** find the window of every game that is switched on (again): this is how last session's games come back */
  async function attach() {
    if (!isOpen()) return;
    markDex(true);
    if (Object.values(attached).some((a) => a.mediaId === 'tab:dex')) { const before = dexId.id; if (before && dexMedia() !== before) pushStage(); }      // the Pokédex window changed size (the Box slid out): its picture is taken anew
    if (frozen) return;
    const wins = await listWindows(false);
    if (!isOpen() || frozen) return;
    const byId = new Map(wins.map((w) => [w.mediaId, w])), next = {}, taken = new Set();
    for (const s of cfg.sources) {                          // a window that is already shown stays with its game
      const a = attached[s.id];
      if (s.on && a && byId.has(a.mediaId) && !byId.get(a.mediaId).steam) { next[s.id] = a; taken.add(a.mediaId); }
    }
    for (const s of cfg.sources) {
      if (!s.on || next[s.id]) continue;
      const w = matchWindow(s.title, wins, taken);
      if (w) { next[s.id] = { mediaId: w.mediaId, title: w.title }; taken.add(w.mediaId); }
    }
    if (JSON.stringify(next) !== JSON.stringify(attached)) { attached = next; pushStage(); pushView(); }
    if (cfg.tuck || Object.keys(cfg.away).length) syncTuck().catch(() => {});
    volumesAfterAttach();
  }

  // ---------------------------------------------------------------- the owner's pointer (0.9.4)
  // Windows' own mouse pointer is drawn into the picture of every game window the mouse is over, and the engine draws
  // it whatever is asked (cursor: 'never' is ignored; tried on the owner's PC with getUserMedia and getDisplayMedia).
  // With several games on the stage that made several pointers. So MyStream now knows where the mouse is in each
  // game's picture and the stage paints that small part over from an earlier picture (src/stage.js, `clean`), unless
  // the owner set that game's mouse to "shown". Instead the owner's own pointer, the one won in the game and chosen in
  // the "pointer" tab, is drawn on the stage: in a game where the mouse is over that game, elsewhere where the mouse is
  // on the main display, and as an arrow on the rim when it is off the stage. pointerFrame() above decides; this part
  // gathers what it needs: Electron says where the mouse is, ps\pointer.ps1 where the games' windows are (one
  // PowerShell process while MyStream is open and shows a game window; it only reads).
  const POINTER_HZ = 30;
  function pointerHandles() {
    const hs = [];
    for (const s of cfg.sources) { const a = attached[s.id]; if (s.on && a && /^window:\d+:/.test(a.mediaId)) hs.push(hwnd(a.mediaId)); }
    return [...new Set(hs)].sort().join(',');
  }
  function stopPointerProc() { const p = ptrProc; ptrProc = null; ptrWins = {}; if (p) { try { p.kill(); } catch (e) { /* gone already */ } } }
  function pointerHelper() {
    const want = isOpen() && !closing ? pointerHandles() : '';
    if (ptrProc && ptrFor !== want) stopPointerProc();
    if (!want || ptrProc || (process.platform !== 'win32' && !ctx.pointerSpawn) || Date.now() - ptrStarted < 4000 * 2 ** Math.min(ptrFails, 5)) return;      // (a helper that keeps ending at once is asked again less and less often)
    ptrStarted = Date.now(); ptrFor = want;
    try {
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'pointer.ps1'), '-Handles', want, '-Parent', String(process.pid)];
      const p = ptrProc = ctx.pointerSpawn ? ctx.pointerSpawn(want) : require('child_process').spawn(PS_EXE, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let buf = '';
      p.stdout.setEncoding('utf8');
      p.stdout.on('data', (d) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (ptrProc !== p || !line) continue;
          try {
            const j = JSON.parse(line), wins = {};
            for (const w of Array.isArray(j.w) ? j.w : []) if (Array.isArray(w) && w.length === 5 && w.every(Number.isFinite)) wins[String(w[0])] = w.slice(1);
            ptrWins = wins;
            if (Array.isArray(j.c) && j.c.length === 5 && j.c.every(Number.isFinite)) ptrShape = j.c.map((v, k) => (k < 4 ? Math.max(0, Math.min(256, v)) : v ? 1 : 0));
          } catch (e) { /* not a line of ours */ }
        }
      });
      p.on('exit', () => { if (Date.now() - ptrStarted < 5000) ptrFails++; else ptrFails = 0; if (ptrProc === p) { ptrProc = null; ptrWins = {}; } });
      p.on('error', () => { if (ptrProc === p) { ptrProc = null; ptrWins = {}; } });
    } catch (e) { ptrProc = null; }
  }
  function pointerTick() {
    if (!isOpen() || closing) return;
    pointerHelper();
    let dip = null;
    try { dip = screen.getCursorScreenPoint(); } catch (e) { return; }
    let phys = dip;
    try { if (process.platform === 'win32' && screen.dipToScreenPoint) phys = screen.dipToScreenPoint(dip); } catch (e) { phys = dip; }
    const wins = {}, tiles = {};
    for (const s of cfg.sources) {
      const a = attached[s.id];
      if (!s.on || !a) continue;
      tiles[s.id] = { x: s.x, y: s.y, w: s.w, ar: s.ar, live: !!(stageInfo.sources[s.id] && stageInfo.sources[s.id].live) };
      const r = /^window:/.test(a.mediaId) ? ptrWins[hwnd(a.mediaId)] : null;
      if (r) wins[s.id] = r;
    }
    let primary = null;
    try { primary = screen.getPrimaryDisplay().bounds; } catch (e) { primary = null; }
    let over = false;
    try { if (alive(booth) && booth.isVisible() && !booth.isMinimized()) { const b = booth.getBounds(); over = dip.x >= b.x && dip.x < b.x + b.width && dip.y >= b.y && dip.y < b.y + b.height; } } catch (e) { over = false; }
    ptrLast = { dip, phys, primary, over };
    const f = pointerFrame({ dip, phys, shape: ptrShape }, wins, tiles, primary, { over, play: over ? boothPoint : null });
    let key = 0;
    try { key = ctx.cursorNow ? ctx.cursorNow() | 0 : 0; } catch (e) { key = 0; }
    f.key = key;
    const sig = JSON.stringify(f);
    if (sig !== ptrSig) { ptrSig = sig; send(stage, 'ms:pointer', f); }
  }
  function pointerStart() { clearInterval(ptrTimer); ptrSig = ''; boothPoint = null; ptrTimer = setInterval(pointerTick, Math.round(1000 / POINTER_HZ)); }
  function pointerStop() { clearInterval(ptrTimer); ptrTimer = null; stopPointerProc(); ptrFor = ''; ptrStarted = 0; boothPoint = null; }

  // ---------------------------------------------------------------- opening and closing
  function boothPlace() {
    const wa = screen.getPrimaryDisplay().workArea, b = cfg.bounds;
    const width = Math.min(b ? b.width : BOOTH.w, wa.width), height = Math.min(b ? b.height : BOOTH.h, wa.height);
    if (!b) return { x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height };
    const d = screen.getDisplayMatching(b).workArea;
    return { x: Math.min(Math.max(b.x, d.x - width + 160), d.x + d.width - 160), y: Math.min(Math.max(b.y, d.y), d.y + d.height - 80), width, height };
  }
  function open() {
    if (isOpen()) { if (booth.isMinimized()) booth.restore(); booth.show(); booth.focus(); return Promise.resolve(true); }
    if (opening) return opening;
    opening = (async () => {
      if (closing) await closing;
      load();
      await ctx.beforeOpen();                               // the game leaves the desktop overlay (main.js)
      attached = {}; stageInfo = { ready: false, sources: {}, notes: {} }; nudge = 0; lastMewtwo = null; live = { on: false, since: 0, resource: null }; twError = '';
      const prefs = { preload: path.join(ctx.appDir, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false };
      stage = new BrowserWindow({ width: STAGE.w, height: STAGE.h, useContentSize: true, show: false, frame: false, resizable: false, skipTaskbar: true, focusable: false, hasShadow: false, thickFrame: false,
        backgroundColor: '#6cbc5d', title: 'MyStream stage', webPreferences: prefs });
      stage.setMenu(null);
      stage.webContents.on('render-process-gone', () => { if (alive(stage) && !closing) stage.reload(); });
      booth = new BrowserWindow({ ...boothPlace(), minWidth: BOOTH.minW, minHeight: BOOTH.minH, title: 'MyStream', show: false, backgroundColor: '#0d1124', autoHideMenuBar: true, icon: ctx.icon() || undefined, webPreferences: prefs });
      booth.setMenu(null);
      // only the booth may ask for a capture, and all it ever gets is the stage page (rule 1)
      try {
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
          const ok = isOpen() && request.frame && request.frame === booth.webContents.mainFrame;
          if (!ok) { try { callback({}); } catch (e) { /* refused */ } return; }
          callback(cfg.pcSound && process.platform === 'win32' ? { video: stage.webContents.mainFrame, audio: 'loopback' } : { video: stage.webContents.mainFrame });
        });
      } catch (e) { console.error('mystream capture handler', e.message); }
      const remember = () => { if (!alive(booth) || booth.isMinimized() || booth.isMaximized()) return; cfg.bounds = booth.getNormalBounds(); persist(); };
      booth.on('move', remember); booth.on('resize', remember);
      booth.on('closed', () => { booth = null; close(); });
      await stage.loadFile(path.join(ctx.appDir, 'stage.html'));
      // Windows can hand a frameless window a pixel or two more than was asked for: measure the page and correct it, so the stage is exactly 1280 x 720
      for (let i = 0; i < 3; i++) {
        let size = null;
        try { size = await stage.webContents.executeJavaScript('[window.innerWidth, window.innerHeight]', true); } catch (e) { size = null; }
        if (!size || (size[0] === STAGE.w && size[1] === STAGE.h)) break;
        const c = stage.getContentSize();
        stage.setContentSize(c[0] - (size[0] - STAGE.w), c[1] - (size[1] - STAGE.h));
        await sleep(120);
      }
      await booth.loadFile(path.join(ctx.appDir, 'mystream.html'));
      booth.show();
      clearInterval(attachTimer);
      attachTimer = setInterval(() => attach().catch(() => {}), 4000);
      deskTimer = setInterval(() => deskRefresh().catch(() => {}), 30000);
      setTimeout(() => { twValidate().catch(() => {}).then(() => { chatStart().catch(() => {}); deskRefresh().catch(() => {}); }); }, 1500);
      attach().catch(() => {});
      pointerStart();
      applyTalkKey();
      clearInterval(validateTimer);
      validateTimer = setInterval(() => twValidate().catch(() => {}), 55 * 60 * 1000);       // Twitch asks for a check every hour
      twValidate().catch(() => {});
      ctx.changed();
      return true;
    })().catch(async (e) => { console.error('mystream open', e); try { if (alive(stage) || alive(booth)) await close(); else await ctx.afterClose(); } catch (x) { /* nothing more to undo */ } return false; }).finally(() => { opening = null; });
    return opening;
  }
  function close() {
    if (closing) return closing;
    if (!alive(stage) && !alive(booth)) return Promise.resolve();
    closing = (async () => {
      clearInterval(attachTimer); clearInterval(validateTimer); clearInterval(deskTimer); clearTimeout(saveT); chatStop(); pointerStop();
      if (pending) { clearTimeout(pending.timer); pending = null; }
      persist(true);
      if (ctx.beforeClose) { try { await ctx.beforeClose(); } catch (e) { /* closing all the same */ } }      // (Trainers who are visiting are told that the stage is going: online.js)
      await recStop();
      await whipStop();
      if (Object.keys(cfg.away).length) { for (let i = 0; i < 50 && tuckBusy; i++) await sleep(200); await syncTuck().catch(() => {}); }      // every game's window back where it was (closing is set: nothing stays away)
      try { session.defaultSession.setDisplayMediaRequestHandler(null); } catch (e) { /* nothing was set */ }
      if (alive(stage)) { send(stage, 'st:cmd', { type: 'flush' }); await sleep(350); }      // the game writes its save before it moves back
      if (alive(booth)) { const b = booth; booth = null; b.removeAllListeners('closed'); b.destroy(); }
      if (alive(stage)) stage.destroy();
      markDex(false); dexId = { wc: 0, size: '', id: null };
      stage = null; booth = null; attached = {};
      releaseTalkKey();
      await ctx.afterClose();                               // the game is back on the desktop overlay (main.js)
      ctx.changed();
    })().catch((e) => console.error('mystream close', e)).finally(() => { closing = null; });
    return closing;
  }

  // ---------------------------------------------------------------- the talk key (a global shortcut can toggle, not hold)
  let talkKey = '';
  function releaseTalkKey() { if (talkKey) { try { globalShortcut.unregister(talkKey); } catch (e) { /* was not ours */ } talkKey = ''; } }
  function applyTalkKey() {
    releaseTalkKey();
    if (!isOpen() || !cfg.talkKey || cfg.talkKey === ctx.reservedKey()) return;
    try { if (globalShortcut.register(cfg.talkKey, () => send(booth, 'ms:talk-key', 1))) talkKey = cfg.talkKey; } catch (e) { console.error('talk key', e.message); }
  }

  // ---------------------------------------------------------------- Twitch: login with a code, the stream key, the title
  async function form(url, data) {
    const r = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
    let json = {}; try { json = (await r.json()) || {}; } catch (e) { json = {}; }
    return { status: r.status, json };
  }
  const twFail = (r) => String((r.json && (r.json.message || r.json.error)) || 'Twitch answered ' + r.status).slice(0, 200);
  let twScopes = [];                                        // what the login in use may do (Twitch says so with every token; a login from before 0.6 has no chat scopes)
  function storeTokens(j) { if (Array.isArray(j.scope)) twScopes = j.scope.map(String); putSecret('access', j.access_token || ''); if (j.refresh_token) putSecret('refresh', j.refresh_token); persist(true); }
  function forget(keepKey) {
    putSecret('access', ''); putSecret('refresh', '');
    if (!keepKey && cfg.twitch.keyFrom === 'login') { putSecret('key', ''); cfg.twitch.keyFrom = ''; }
    cfg.twitch.login = cfg.twitch.name = cfg.twitch.userId = '';
    twScopes = []; chatStop(); desk = { live: false, viewers: 0, since: 0, game: '', at: 0 };
    persist(true);
  }
  async function twRefresh() {
    const rt = getSecret('refresh');
    if (!rt || !cfg.twitch.clientId) return false;
    const r = await form(EP.token, { client_id: cfg.twitch.clientId, grant_type: 'refresh_token', refresh_token: rt });
    if (r.status === 200 && r.json.access_token) { storeTokens(r.json); return true; }
    if (r.status === 400 || r.status === 401) { forget(true); twError = 'Twitch asks you to log in again.'; pushView(); }
    return false;
  }
  async function twApi(method, pathq, body) {
    const call = () => doFetch(EP.api + pathq, { method, headers: Object.assign({ Authorization: 'Bearer ' + getSecret('access'), 'Client-Id': cfg.twitch.clientId }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    if (!getSecret('access') && !(await twRefresh())) return { status: 401, json: {} };
    let r = await call();
    if (r.status === 401 && (await twRefresh())) r = await call();
    let json = {}; try { json = (await r.json()) || {}; } catch (e) { json = {}; }
    return { status: r.status, json };
  }
  async function twValidate() {
    if (!cfg || !hasSecret('refresh') || !cfg.twitch.clientId) return;
    const tok = getSecret('access');
    const r = tok ? await doFetch(EP.validate, { headers: { Authorization: 'OAuth ' + tok } }) : { status: 401 };
    if (r.status === 401) await twRefresh();
    else if (r.status === 200) { try { const j = await r.json(); if (j && Array.isArray(j.scopes)) { const had = twScopes.join(); twScopes = j.scopes.map(String); if (had !== twScopes.join() && isOpen()) chatStart().catch(() => {}); } } catch (e) { /* no list this time */ } }
  }
  /** after logging in: who is it, and what is their stream key */
  async function twWhoAndKey() {
    const u = await twApi('GET', '/users');
    const me = u.status === 200 && u.json.data && u.json.data[0];
    if (!me) { twError = 'Logged in, but Twitch did not say who you are: ' + twFail(u); return false; }
    cfg.twitch.userId = String(me.id); cfg.twitch.login = str(me.login, 60); cfg.twitch.name = str(me.display_name || me.login, 60);
    const k = await twApi('GET', '/streams/key?broadcaster_id=' + encodeURIComponent(cfg.twitch.userId));
    const key = k.status === 200 && k.json.data && k.json.data[0] && k.json.data[0].stream_key;
    if (key) { putSecret('key', key); cfg.twitch.keyFrom = 'login'; twError = ''; }
    else twError = 'Logged in, but Twitch would not give the stream key: ' + twFail(k);
    chatStart().catch(() => {}); deskRefresh().catch(() => {});
    persist(true);
    return !!key;
  }
  async function twLoginStart() {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    twError = '';
    if (!cfg.twitch.clientId) return { ok: false, error: 'Put in your Twitch Client ID first (step 1).' };
    let r;
    try { r = await form(EP.device, { client_id: cfg.twitch.clientId, scopes: EP.scopes }); } catch (e) { return { ok: false, error: 'Could not reach Twitch. Is the computer online?' }; }
    if (r.status !== 200 || !r.json.device_code) return { ok: false, error: 'Twitch did not accept the Client ID: ' + twFail(r) + '. Check that the app is registered as "Public".' };
    const j = r.json, p = pending = { device: j.device_code, code: str(j.user_code, 20), url: str(j.verification_uri, 300), until: Date.now() + num(j.expires_in, 60, 3600, 900) * 1000, every: num(j.interval, 2, 60, 5) * 1000, timer: null };
    const poll = async () => {
      if (pending !== p) return;
      if (Date.now() > p.until || !isOpen()) { pending = null; twError = 'The code ran out before it was approved. Start again.'; pushView(); return; }
      let t = null;
      try { t = await form(EP.token, { client_id: cfg.twitch.clientId, scopes: EP.scopes, device_code: p.device, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }); } catch (e) { t = null; }
      if (pending !== p) return;
      if (t && t.status === 200 && t.json.access_token) { pending = null; storeTokens(t.json); await twWhoAndKey(); pushView(); return; }
      const why = t ? String(t.json.message || t.json.error || '') : 'offline';
      if (t && /slow_down/.test(why)) p.every += 5000;
      else if (t && t.status >= 400 && !/pending|offline/.test(why) && why) { pending = null; twError = 'Twitch stopped the login: ' + why.slice(0, 120); pushView(); return; }
      p.timer = setTimeout(poll, p.every);
    };
    p.timer = setTimeout(poll, p.every);
    pushView();
    return { ok: true, code: p.code, url: p.url };
  }
  /** make sure there is a stream key to go live with (a logged-in account's key is fetched fresh, it can change) */
  async function liveReady() {
    if (hasSecret('refresh') && cfg.twitch.clientId && cfg.twitch.userId) { try { await twWhoAndKey(); } catch (e) { /* offline: the stored key may still do */ } }
    if (!hasSecret('key')) return { ok: false, error: 'Connect Twitch first (the Live tab): log in, or paste your stream key.' };
    return { ok: true };
  }
  async function twTitle() {
    if (!cfg.title || !hasSecret('refresh') || !cfg.twitch.userId) return;
    try { await twApi('PATCH', '/channels?broadcaster_id=' + encodeURIComponent(cfg.twitch.userId), { title: cfg.title }); } catch (e) { /* the stream goes on with its old title */ }
  }

  // ---------------------------------------------------------------- Twitch chat and the stream's desk (0.6)
  // Chat is Twitch's IRC over a web socket. It is opened here, in the main process, so the token never reaches a window;
  // the booth gets the lines and may hand over a line to send. Reading needs no login at all (an anonymous name will
  // do once the channel is known); writing needs the scopes chat:read and chat:edit, which a login made before 0.6
  // does not have: the booth then says "log in again". Chat is shown in the booth only, never on the stage.
  let chat = { ws: null, state: 'off', lines: [], canSend: false, channel: '', retry: null };
  function chatLine(l) { chat.lines.push(l); if (chat.lines.length > 200) chat.lines.shift(); send(booth, 'ms:chat', l); }
  function chatStop() { clearTimeout(chat.retry); if (chat.ws) { try { chat.ws.onclose = null; chat.ws.close(); } catch (e) { /* gone already */ } } chat.ws = null; chat.state = 'off'; chat.canSend = false; }
  async function chatStart() {
    chatStop();
    const channel = String(cfg.twitch.login || '').toLowerCase();
    if (!isOpen() || !/^[a-z0-9_]{2,30}$/.test(channel) || typeof WebSocket !== 'function') { chat.state = channel ? 'unavailable' : 'off'; pushView(); return; }
    const mayRead = twScopes.includes('chat:read'), token = mayRead ? (getSecret('access') || ((await twRefresh()) ? getSecret('access') : '')) : '';
    chat.canSend = !!token && twScopes.includes('chat:edit'); chat.channel = channel; chat.state = 'connecting';
    let ws;
    try { ws = chat.ws = new WebSocket(EP.chat); } catch (e) { chat.state = 'unavailable'; pushView(); return; }
    ws.onopen = () => { ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands'); ws.send('PASS ' + (token ? 'oauth:' + token : 'SCHMOOPIIE')); ws.send('NICK ' + (token ? channel : 'justinfan' + (10000 + Math.floor(Math.random() * 80000)))); ws.send('JOIN #' + channel); };
    ws.onmessage = (ev) => { for (const raw of String(ev.data).split('\r\n')) if (raw) { try { chatIn(raw, ws); } catch (e) { /* a line this does not understand */ } } };
    ws.onclose = () => { if (chat.ws !== ws) return; chat.ws = null; chat.state = 'off'; pushView(); if (isOpen() && !closing) chat.retry = setTimeout(() => chatStart().catch(() => {}), 15000); };
    ws.onerror = () => { /* onclose follows */ };
    pushView();
  }
  function chatIn(raw, ws) {
    if (raw.startsWith('PING')) { ws.send('PONG' + raw.slice(4)); return; }
    const tags = {}; let rest = raw;
    if (rest[0] === '@') { const i = rest.indexOf(' '); for (const kv of rest.slice(1, i).split(';')) { const j = kv.indexOf('='); if (j > 0) tags[kv.slice(0, j)] = kv.slice(j + 1); } rest = rest.slice(i + 1); }
    const m = /^:(\S+?)(?:!\S+)? (\S+)(?: (\S+))?(?: :?(.*))?$/.exec(rest);
    if (!m) return;
    const cmd = m[2], text = m[4] || '';
    if (cmd === '366' || cmd === 'ROOMSTATE') { if (chat.state !== 'on') { chat.state = 'on'; pushView(); } }
    else if (cmd === 'NOTICE' && /authentication failed|improperly formatted/i.test(text)) { chat.canSend = false; twScopes = twScopes.filter((x) => !/^chat:/.test(x)); chatLine({ sys: true, text: 'Twitch refused the chat login. Log in again to write; reading carries on.', at: Date.now() }); chat.retry = setTimeout(() => chatStart().catch(() => {}), 1500); }
    else if (cmd === 'PRIVMSG') chatLine({ user: str(tags['display-name'] || m[1], 40), color: /^#[0-9a-f]{6}$/i.test(tags.color || '') ? tags.color : '', text: str(text.replace(/^\u0001ACTION (.*)\u0001$/, '$1'), 500), mod: tags.mod === '1', at: Date.now() });
    else if (cmd === 'USERNOTICE' && tags['system-msg']) chatLine({ sys: true, text: str(tags['system-msg'].replace(/\\s/g, ' '), 300), at: Date.now() });
  }
  function chatSend(text) {
    const t = str(text, 480).replace(/[\r\n]+/g, ' ').trim();
    if (!t || !chat.ws || chat.state !== 'on' || !chat.canSend) return false;
    try { chat.ws.send(`PRIVMSG #${chat.channel} :${t}`); } catch (e) { return false; }
    chatLine({ user: cfg.twitch.name || chat.channel, color: '', text: t, me: true, at: Date.now() });
    return true;
  }
  // The desk: what Twitch's own Stream Manager shows first. Whether the stream is live, viewers, since when, the
  // category; setting the category; a stream marker; and the way to the real Stream Manager in the browser.
  let desk = { live: false, viewers: 0, since: 0, game: '', at: 0 }, deskTimer = null;
  const loggedIn = () => !!cfg && !!cfg.twitch.userId && hasSecret('refresh');
  async function deskRefresh() {
    if (!loggedIn() || !isOpen()) return desk;
    const id = encodeURIComponent(cfg.twitch.userId);
    try {
      const s = await twApi('GET', '/streams?user_id=' + id), d = s.status === 200 && s.json.data ? s.json.data[0] : null;
      const c = await twApi('GET', '/channels?broadcaster_id=' + id), ch = c.status === 200 && c.json.data ? c.json.data[0] : null;
      desk = { live: !!d, viewers: d ? d.viewer_count | 0 : 0, since: d ? Date.parse(d.started_at) || 0 : 0, game: ch ? str(ch.game_name, 80) : desk.game, at: Date.now() };
    } catch (e) { /* Twitch could not be reached: the desk keeps what it had */ }
    pushView();
    return desk;
  }

  // ---------------------------------------------------------------- going live: the booth makes a WebRTC offer, this posts it (WHIP)
  const whipAllowed = (url, first) => { try { const u = new URL(url); return (u.protocol === 'https:' && (EP.whipHosts.test(u.hostname) || u.hostname === new URL(first).hostname)) || !!ctx.endpoints; } catch (e) { return false; } };
  async function whipOffer(sdp) {
    if (typeof sdp !== 'string' || sdp.length > 60000 || !/^v=0/.test(sdp)) return { ok: false, error: 'bad offer' };
    const ready = await liveReady();
    if (!ready.ok) return ready;
    const key = getSecret('key'), first = cfg.twitch.server || EP.whip;
    let url = first;
    try {
      for (let hop = 0; hop < 4; hop++) {
        const r = await doFetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ' + key }, body: sdp });
        const loc = r.headers.get('location');
        if ([301, 302, 307, 308].includes(r.status) && loc) {
          url = new URL(loc, url).href;
          if (!whipAllowed(url, first)) return { ok: false, error: 'Twitch sent the stream somewhere unexpected; stopped.' };     // the key goes to Twitch's servers only
          continue;
        }
        const text = await r.text();
        if (r.status !== 201 && r.status !== 200) {
          const why = r.status === 401 || r.status === 403 ? 'Twitch did not accept the stream key. Log in again, or paste the key again.' : r.status === 409 ? 'Twitch says this channel is already live from another program.' : `Twitch's video server answered ${r.status}. ${text.slice(0, 120)}`;
          return { ok: false, status: r.status, error: why };
        }
        live = { on: true, since: Date.now(), resource: loc ? new URL(loc, url).href : null };
        twTitle();
        pushView(); ctx.changed();
        return { ok: true, answer: text };
      }
      return { ok: false, error: 'Too many redirects from the video server.' };
    } catch (e) { return { ok: false, error: 'Could not reach Twitch\'s video server. Is the computer online?' }; }
  }
  async function whipStop() {
    const was = live;
    live = { on: false, since: 0, resource: null };
    if (was.resource && whipAllowed(was.resource, cfg.twitch.server || EP.whip)) { try { await doFetch(was.resource, { method: 'DELETE', headers: { Authorization: 'Bearer ' + getSecret('key') } }); } catch (e) { /* it ends by itself when the picture stops */ } }
    if (was.on) { pushView(); ctx.changed(); }
  }

  // ---------------------------------------------------------------- recording: the booth encodes, this writes the file
  let recDir = null;                    // the self-check puts its short test recording next to its report instead
  const videosDir = () => { try { return app.getPath('videos'); } catch (e) { return path.join(app.getPath('home'), 'Videos'); } };
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
  function recStart(o) {
    if (rec) return { ok: false, error: 'already recording' };
    const ext = o && o.ext === 'webm' ? 'webm' : 'mp4';
    try {
      const dir = recDir || path.join(videosDir(), 'MyStream');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `MyStream ${stamp()}.${ext}`);
      rec = { file: f, out: fs.createWriteStream(f), bytes: 0, since: Date.now(), failed: '' };
      rec.out.on('error', (e) => { if (rec) { rec.failed = e.message; send(booth, 'ms:rec-error', 'The recording could not be written: ' + e.message); } });
      pushView(); ctx.changed();
      return { ok: true, file: f };
    } catch (e) { rec = null; return { ok: false, error: 'Could not create the video file: ' + e.message }; }
  }
  function recChunk(data) {
    if (!rec || rec.failed || !data) return;
    const buf = Buffer.from(data.buffer ? data.buffer : data, data.byteOffset || 0, data.byteLength);
    rec.bytes += buf.length;
    rec.out.write(buf);
  }
  function recStop() {
    if (!rec) return Promise.resolve({ ok: false });
    const r = rec; rec = null;
    return new Promise((resolve) => r.out.end(() => { pushView(); ctx.changed(); resolve({ ok: !r.failed, file: r.file, bytes: r.bytes, seconds: Math.round((Date.now() - r.since) / 1000), error: r.failed }); }));
  }

  // ---------------------------------------------------------------- what the windows may ask (each handler checks who is asking)
  const fromBooth = (e) => alive(booth) && e.sender === booth.webContents;
  const fromStage = (e) => alive(stage) && e.sender === stage.webContents;
  const handle = (ch, who, fn) => ipcMain.handle(ch, (e, ...a) => (who(e) ? fn(...a) : null));
  const on = (ch, who, fn) => ipcMain.on(ch, (e, ...a) => { if (who(e)) fn(...a); });
  handle('ms:view', fromBooth, () => view());
  handle('ms:set', fromBooth, (patch) => {
    if (!patch || typeof patch !== 'object') return view();
    const keep = cfg.twitch, was = cfg;
    const next = Object.assign({}, cfg);
    for (const k of ['quality', 'showTrainer', 'fountain', 'micBadge', 'tuck', 'order', 'pcSound', 'pcVol', 'micVol', 'micId', 'talkKey', 'recSeconds', 'title',
 'sources', 'notes', 'pointer']) if (k in patch) next[k] = patch[k];
    next.away = cfg.away;                                 // (never the booth's to change)
    cfg = sanitize(next); cfg.twitch = keep;
    for (const k of Object.keys(attached)) if (!cfg.sources.some((s) => s.id === k && s.on)) delete attached[k];
    persist();
    pushStage();
    if (was.talkKey !== cfg.talkKey) applyTalkKey();
    syncTuck().catch(() => {});
    if (JSON.stringify(was.sources.map((s) => [s.id, s.on, s.title])) !== JSON.stringify(cfg.sources.map((s) => [s.id, s.on, s.title]))) attach().catch(() => {});
    return view();
  });
  handle('ms:windows', fromBooth, async () => {
    const wins = await listWindows(true), shown = new Set(Object.values(attached).map((a) => a.mediaId));
    return wins.map((w) => ({ title: w.title, steam: w.steam, thumb: w.steam ? '' : w.thumb, shown: shown.has(w.mediaId) }));
  });
  handle('ms:stage-source', fromBooth, () => { try { return stage.webContents.getMediaSourceId(booth.webContents); } catch (e) { return null; } });
  handle('ms:nudge', fromBooth, () => {                     // no picture came from the hidden stage: put the window on a spot nobody can see and show it there
    if (!alive(stage) || nudge >= 1) return nudge;
    nudge = 1;
    try { stage.setPosition(-32000, -32000); stage.showInactive(); } catch (e) { /* stays hidden */ }
    return nudge;
  });
  on('ms:input', fromBooth, (ev) => {
    if (!alive(stage) || !ev) return;
    const x = Math.round(num(ev.x, -40, STAGE.w + 40, -40)), y = Math.round(num(ev.y, -40, STAGE.h + 40, -40)), button = ev.b === 2 ? 'right' : 'left', wc = stage.webContents;
    boothPoint = x < 0 || y < 0 || x > STAGE.w || y > STAGE.h ? null : { x, y };      // where the owner's pointer is shown while playing on the booth's picture (0.9.4)
    try {
      if (ev.t === 'move') wc.sendInputEvent({ type: 'mouseMove', x, y });
      else if (ev.t === 'down') { wc.sendInputEvent({ type: 'mouseMove', x, y }); wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 }); }
      else if (ev.t === 'up') wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    } catch (e) { /* the stage is closing */ }
  });
  on('ms:mic', fromBooth, (open) => send(stage, 'ms:mic', !!open));
  handle('ms:game-volume', fromBooth, (id, vol) => gameVolume(String(id || ''), vol === undefined ? undefined : vol === null ? null : +vol));      // (1.0) vol undefined: only read
  handle('ms:cursor', fromBooth, (i) => { if (Number.isInteger(i) && ctx.setCursor) { try { ctx.setCursor(i); } catch (e) { /* not won, or no online part */ } } ptrSig = ''; return view(); });      // the owner's pointer, chosen in the "pointer" tab (online.js checks that it was won)
  handle('ms:tw-client', fromBooth, (id) => { const clean = typeof id === 'string' && /^[a-z0-9]{10,60}$/i.test(id.trim()) ? id.trim() : ''; if (clean !== cfg.twitch.clientId) { forget(); cfg.twitch.clientId = clean; persist(true); } twError = clean || !id ? '' : 'That does not look like a Client ID (letters and digits, about 30 of them).'; return view(); });
  handle('ms:tw-login', fromBooth, () => twLoginStart());
  handle('ms:chat-lines', fromBooth, () => chat.lines.slice());
  handle('ms:chat-send', fromBooth, (text) => chatSend(text));
  handle('ms:desk-refresh', fromBooth, () => deskRefresh());
  handle('ms:desk-search', fromBooth, async (q) => { const query = str(q, 60).trim(); if (query.length < 2 || !loggedIn()) return []; const r = await twApi('GET', '/search/categories?first=8&query=' + encodeURIComponent(query)); return r.status === 200 && Array.isArray(r.json.data) ? r.json.data.map((g) => ({ id: str(g.id, 20), name: str(g.name, 80) })) : []; });
  handle('ms:desk-game', fromBooth, async (id) => { if (!/^\d{1,12}$/.test(String(id)) || !loggedIn()) return false; const r = await twApi('PATCH', '/channels?broadcaster_id=' + encodeURIComponent(cfg.twitch.userId), { game_id: String(id) }); await deskRefresh(); return r.status === 204 || r.status === 200; });
  handle('ms:desk-marker', fromBooth, async (text) => { if (!loggedIn()) return { ok: false, why: 'Log in with Twitch first.' }; const r = await twApi('POST', '/streams/markers', { user_id: cfg.twitch.userId, description: str(text, 140) }); return { ok: r.status === 200, why: r.status === 200 ? '' : r.status === 404 ? 'A marker needs a live stream.' : twFail(r) }; });
  handle('ms:desk-open', fromBooth, (what) => { const login = String(cfg.twitch.login || ''); if (!/^[a-z0-9_]{2,30}$/i.test(login)) return false; const url = what === 'manager' ? `https://dashboard.twitch.tv/u/${login}/stream-manager` : what === 'chat' ? `https://www.twitch.tv/popout/${login}/chat` : `https://www.twitch.tv/${login}`; if (!ctx.endpoints) shell.openExternal(url); return url; });
  handle('ms:tw-cancel', fromBooth, () => { if (pending) { clearTimeout(pending.timer); pending = null; } return view(); });
  handle('ms:tw-open', fromBooth, () => { const url = pending && pending.url; if (url && (EP.activate.test(url) || ctx.endpoints)) { if (!ctx.endpoints) shell.openExternal(url); return true; } return false; });
  handle('ms:tw-logout', fromBooth, () => { if (pending) { clearTimeout(pending.timer); pending = null; } forget(); twError = ''; return view(); });
  handle('ms:tw-key', fromBooth, (key) => { const k = typeof key === 'string' ? key.trim() : ''; if (k && !/^[\w\-]{10,200}$/.test(k)) { twError = 'That does not look like a stream key.'; return view(); } putSecret('key', k); cfg.twitch.keyFrom = k ? 'typed' : ''; twError = ''; persist(true); return view(); });
  handle('ms:tw-server', fromBooth, (url) => { const next = sanitize({ twitch: { server: typeof url === 'string' ? url.trim() : '' } }).twitch.server; cfg.twitch.server = next; persist(true); return view(); });
  handle('ms:live-ready', fromBooth, () => liveReady());
  handle('ms:whip-offer', fromBooth, (sdp) => whipOffer(sdp));
  handle('ms:whip-stop', fromBooth, () => whipStop().then(() => true));
  handle('ms:rec-start', fromBooth, (o) => recStart(o));
  on('ms:rec-chunk', fromBooth, (data) => recChunk(data));
  handle('ms:rec-stop', fromBooth, () => recStop());
  handle('ms:rec-show', fromBooth, (f) => { const dir = path.join(videosDir(), 'MyStream'); try { if (typeof f === 'string' && path.dirname(f) === dir && fs.existsSync(f)) shell.showItemInFolder(f); else { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); } } catch (e) { /* nothing to show */ } return true; });
  on('ms:close', fromBooth, () => close());
  // the stage
  handle('ms:stage-init', fromStage, () => stageConfig());
  on('ms:stage-info', fromStage, (info) => {
    if (!info || typeof info !== 'object') return;
    stageInfo = { ready: true, sources: {}, notes: {} };
    for (const n of cfg.notes) { const q = info.notes && info.notes[n.id]; if (q) stageInfo.notes[n.id] = { x: r4(num(q.x, -1, 2, 0)), y: r4(num(q.y, -1, 2, 0)), w: r4(num(q.w, 0, 1, 0.18)), h: r4(num(q.h, 0, 1, 0.15)) }; }
    let changed = false;
    for (const s of cfg.sources) {
      const i = info.sources && info.sources[s.id];
      if (!i) continue;
      stageInfo.sources[s.id] = { live: !!i.live, w: Math.round(num(i.w, 0, 10000, 0)), h: Math.round(num(i.h, 0, 10000, 0)), key: str(i.key, 10) };
      if (i.w > 0 && i.h > 0) { const ar = r4(i.w / i.h); if (Math.abs(ar - s.ar) > 0.005) { s.ar = ar; changed = true; } if (!s.placed) { place(s, i.w); changed = true; } }
    }
    if (changed) { persist(); pushStage(); }
    pushView();
  });
  on('ms:mewtwo', fromStage, (m) => { lastMewtwo = m && m.text ? { text: str(m.text, 240), tone: str(m.tone, 10), at: Date.now() } : null; pushView(); });      // the real words, for the booth only (rule 3)

  /** where a newly switched-on game goes: as large as it is on the real screen, standing on the bottom edge of the stage.
      (A game whose window covers the whole screen, as see-through overlay games do, fills the stage exactly.) The owner moves it from there. */
  function place(s, pixelsWide) {
    let screenW = 1920;
    try { const d = screen.getPrimaryDisplay(); screenW = Math.max(640, Math.round(d.size.width * (d.scaleFactor || 1))); } catch (e) { screenW = 1920; }
    const n = cfg.sources.filter((q) => q.placed).length;
    s.w = r4(Math.min(1, Math.max(0.08, pixelsWide / screenW)));
    const h = (s.w * STAGE.w) / s.ar / STAGE.h;
    s.x = r4(s.w > 0.9 ? (1 - s.w) / 2 : [0.5 - s.w / 2, 0.03, 0.97 - s.w][n % 3]);
    s.y = r4(Math.max(0, 1 - h - (h > 0.9 ? 0 : 0.03)));
    s.placed = true;
  }

  // ---------------------------------------------------------------- a look at itself, for the self-check
  async function check(folder, opt) {
    const lines = [], rep = { at: new Date().toISOString(), version: ctx.version, pictures: [] };
    let passed = 0, failed = 0;
    const add = (name, ok, note) => { if (ok) passed++; else failed++; lines.push(`${ok ? 'ok  ' : 'FAIL'}  ${name}${note ? '   [' + note + ']' : ''}`); };
    const js = async (w, code) => { try { return await w.webContents.executeJavaScript(code, true); } catch (e) { return null; } };
    const picture = async (w, name) => { try { const img = await w.webContents.capturePage(); if (img.isEmpty()) return false; fs.writeFileSync(path.join(folder, name), img.toPNG()); rep.pictures.push(name); return true; } catch (e) { return false; } };
    const wasOpen = isOpen();
    if (!wasOpen) await open();
    add('MyStream opens', isOpen());
    if (isOpen()) {
      for (let i = 0; i < 40 && !(await js(stage, 'typeof Stage !== "undefined" && Stage.ready()')); i++) await sleep(250);
      for (let i = 0; i < 40 && !(await js(booth, 'typeof Booth !== "undefined" && Booth.ready()')); i++) await sleep(250);
      // "dex": true: the Field Dex is opened and put on the stage for this check, and switched off again afterwards
      if (opt && opt.dex && ctx.openPanel) { try { ctx.openPanel('party'); } catch (e) { /* no Pokédex window */ } await sleep(3000); if (!Array.isArray(opt.attach)) opt.attach = []; opt.attach.push('my field dex'); }
      const wins = await listWindows(true);                // (true: also the windows Windows leaves out of its list)
      rep.windows = { count: wins.length, steam: wins.filter((w) => w.steam).length, hidden: wins.filter((w) => w.hidden).length };
      const want = (opt && Array.isArray(opt.attach) ? opt.attach : []).map((s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter((s) => s.length >= 3).slice(0, 8);
      const find = (opt && Array.isArray(opt.find) ? opt.find : []).map((x) => String(x).toLowerCase().trim()).filter((x) => x.length >= 3).slice(0, 12);
      rep.found = wins.filter((w) => !w.steam && find.some((k) => w.title.toLowerCase().includes(k))).map((w) => w.title);        // only the titles that contain a word that was asked for; no other title is written down
      rep.matching = wins.filter((w) => !w.steam && want.some((k) => w.title.toLowerCase().includes(k))).map((w) => w.title);
      // "probe": ["word"]: what Windows itself says about windows whose program, class or title contains a word (also the
      // ones it leaves out of the list above), and whether such a window can be captured by its handle all the same.
      const probe = (opt && Array.isArray(opt.probe) ? opt.probe : []).map((x) => String(x).toLowerCase().trim()).filter((x) => x.length >= 3).slice(0, 12);
      if (probe.length) {
        const all = await winTool('list');
        rep.probe = { ok: !!all.ok, error: all.error || '', total: all.ok ? all.windows.length : 0, windows: [] };
        const listed = new Set(wins.map((w) => hwnd(w.mediaId)));
        for (const w of (all.ok ? all.windows : []).filter((w) => probe.some((k) => `${w.proc} ${w.cls} ${w.title}`.toLowerCase().includes(k))).slice(0, 8)) {
          const item = { proc: w.proc, cls: w.cls, title: w.title, ex: '0x' + (+w.ex).toString(16), x: w.x, y: w.y, w: w.w, h: w.hgt, owned: w.owned, cloaked: w.cloaked, offered: listed.has(String(w.h)) };
          if (opt.tryHandle && !SYS_CLASS.test(w.cls || '') && !SYS_PROC.test(w.proc || '')) {      // never Windows' own furniture: the desktop itself is one of those windows
            const got = await js(stage, `(async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: ${JSON.stringify('window:' + w.h + ':0')}, maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30 } } });
              const v = document.createElement('video'); v.muted = true; v.srcObject = s; v.style.cssText = 'position:fixed;left:-9999px;width:4px;height:4px'; document.body.appendChild(v); await v.play();
              let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 > 2500) res(); else v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); setTimeout(res, 3500); });
              const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; if (c.width) c.getContext('2d').drawImage(v, 0, 0);
              const url = c.width ? c.toDataURL('image/png') : ''; s.getTracks().forEach((t) => t.stop()); v.remove(); return { ok: true, w: c.width, h: c.height, frames: n, url };
            } catch (e) { return { ok: false, error: String(e.message || e) }; } })()`);
            item.capture = got ? { ok: got.ok, w: got.w, h: got.h, frames: got.frames, error: got.error || '' } : { ok: false, error: 'no answer' };
            if (got && got.url) { const name = `probe-${rep.probe.windows.length + 1}.png`; try { fs.writeFileSync(path.join(folder, name), Buffer.from(got.url.split(',')[1], 'base64')); rep.pictures.push(name); item.picture = name; } catch (e) { /* no picture */ } }
          }
          rep.probe.windows.push(item);
        }
      }
      // "tuck": true: the option "Keep games off my desktop" tried for real: switched on, the games watched while their
      // windows are away, then put back as it was set. The report says where each window was, went, and came back to.
      if (opt && opt.tuck) {
        const was = !!cfg.tuck, t = rep.tuck = { games: [] };
        const frames = async () => { const st = await js(stage, 'Stage.report()'); return Object.fromEntries(cfg.sources.map((x) => [x.id, st && st.sources && st.sources[x.id] ? st.sources[x.id].frames : -1])); };
        const places = async () => { const all = await allWindows(0); return Object.fromEntries(cfg.sources.filter((x) => attached[x.id]).map((x) => { const w = all.find((q) => String(q.h) === hwnd(attached[x.id].mediaId)); return [x.id, w ? [w.x, w.y] : null]; })); };
        const p0 = await places();
        cfg.tuck = true; await syncTuck(); for (let i = 0; i < 60 && tuckBusy; i++) await sleep(200);
        await sleep(1000); const f0 = await frames(); await sleep(3000); const f1 = await frames(), p1 = await places();
        t.saved = Object.keys(cfg.away).length;
        await picture(stage, 'tuck-stage.png');
        if (!was) { cfg.tuck = false; await syncTuck(); for (let i = 0; i < 60 && tuckBusy; i++) await sleep(200); }
        const p2 = await places();
        for (const x of cfg.sources) if (attached[x.id]) t.games.push({ title: x.title, before: p0[x.id], away: p1[x.id], after: p2[x.id], pictures: f1[x.id] - f0[x.id] });
        const on = cfg.sources.filter((x) => attached[x.id] && !x.desk);
        add('games stay on the stage while their own windows are off the desktop', on.length > 0 && t.games.filter((g) => on.some((x) => x.title === g.title)).every((g) => g.away && g.away[0] >= AWAY_X - 200 && g.pictures > 20), t.games.map((g) => `${g.title}: ${g.pictures} pictures in 3 s`).join('; '));
        if (!was) add('every window is put back exactly where it was', t.games.every((g) => g.before && g.after && g.before[0] === g.after[0] && g.before[1] === g.after[1]) && !Object.keys(cfg.away).length, t.games.map((g) => `${g.title}: ${g.after}`).join('; '));
      }
      if (want.length) {                                    // asked to try these games: switch them on as the owner would in the Games list
        for (const t of rep.matching) if (!cfg.sources.some((s) => s.title === t) && cfg.sources.length < MAX_SOURCES) cfg.sources.push({ title: t, on: true, placed: false, fresh: true });
        const fresh = cfg.sources.filter((s) => s.fresh).map((s) => s.title);
        cfg = Object.assign(sanitize(cfg), { twitch: cfg.twitch });
        rep.addedNow = fresh;
        persist(true); await attach(); pushStage(); pushView();
        await sleep(6000);
      }
      await sleep(1500);
      const s = (await js(stage, 'Stage.report()')) || {}, b = (await js(booth, 'Booth.report()')) || {};
      if (opt && opt.dex) { const d = cfg.sources.find((x) => x.title === DEX_TITLE); add('the Field Dex is drawn on the stage', !!(d && s.sources && s.sources[d.id] && s.sources[d.id].live && s.sources[d.id].w > 200), d && s.sources && s.sources[d.id] ? `${s.sources[d.id].w} x ${s.sources[d.id].h}, background: ${s.sources[d.id].key}` : 'no picture'); rep.dexBlur = await (async () => { try { return await ctx.panel().webContents.executeJavaScript('document.body.classList.contains("onstream")', true); } catch (e) { return null; } })(); add('the Field Dex blurs folder paths while MyStream is open', rep.dexBlur === true); }
      rep.stage = s; rep.booth = b; rep.nudge = nudge; rep.sources = cfg.sources.map((x) => ({ title: x.title, on: x.on, x: x.x, y: x.y, w: x.w, ar: x.ar, key: x.key, shown: !!attached[x.id] }));
      const bounds = stage.getBounds();
      add('the stage is never on the desktop', !stage.isVisible() || bounds.x <= -30000, stage.isVisible() ? `shown out of sight at ${bounds.x}, ${bounds.y}` : 'hidden');
      add('the stage is 1280 x 720', s.w === STAGE.w && s.h === STAGE.h, `${s.w} x ${s.h}`);
      add('the stage page is drawing', s.frames > 0 && s.fps > 5, `${s.fps} pictures a second`);
      add('the grass and the fountain are drawn', !!s.ground && (!cfg.fountain ? true : !!s.fountain && (s.fountainSeen === undefined || s.fountainSeen === 'yes')), cfg.fountain ? `${s.fountainNote || ''}${s.fountainSeen && s.fountainSeen !== 'yes' ? '; the fountain is ' + s.fountainSeen : ''}` : 'the fountain is switched off in MyStream\'s options');
      add('the game runs on the stage', !!s.game, s.game ? `${s.team} of the team, ${s.actors} on the field` : 'no game');
      add('the booth gets the stage picture', b.video && b.video[0] >= 640 && b.frames > 0, b.video ? `${b.video[0]} x ${b.video[1]}, ${b.frames} pictures${nudge ? ', only after the stage was shown out of sight' : ''}` : 'no picture');
      add('what Mewtwo says is masked on the stage', s.mask === true, s.maskNote || '');
      add('every game that is switched on found its window', cfg.sources.filter((x) => x.on && x.title !== DEX_TITLE).every((x) => attached[x.id]),      /* (the Field Dex is only there while the Pokédex window is open) */ cfg.sources.filter((x) => x.on).map((x) => `${x.title}: ${attached[x.id] ? 'shown' : 'not open'}`).join('; ') || 'no games switched on');
      for (const x of cfg.sources.filter((q) => q.on && attached[q.id])) { const i = (s.sources || {})[x.id] || {}; add(`"${x.title}" is drawn on the stage`, !!i.live && i.w > 0, i.live ? `${i.w} x ${i.h}, background: ${i.key}, ${i.frames} pictures` : String(i.error || 'no picture yet')); }
      add('no Steam window and none of its own windows can be switched on', !cfg.sources.some((x) => isSteam(x.title) || OWN_TITLE.test(x.title)));
      // the owner's pointer (0.9.4): where it is said to be, and whether the games' windows are watched for the mouse
      const winGames = cfg.sources.filter((x) => x.on && attached[x.id] && /^window:/.test(attached[x.id].mediaId));
      let displays = null; try { displays = screen.getAllDisplays().map((q) => ({ id: q.id, bounds: q.bounds, scale: q.scaleFactor, primary: q.id === screen.getPrimaryDisplay().id })); } catch (e) { displays = null; }
      rep.pointer = { last: ptrLast, displays, frame: ptrSig ? JSON.parse(ptrSig) : null, helper: !!ptrProc, windows: ptrWins, shape: ptrShape, stage: s.pointer || null, settings: cfg.pointer, mouse: Object.fromEntries(cfg.sources.map((x) => [x.title, x.mouse])) };
      add("the owner's pointer is placed on the stage", !!(rep.pointer.frame && rep.pointer.frame.host), rep.pointer.frame ? `${rep.pointer.frame.host.at}${rep.pointer.frame.host.at !== 'off' ? ` at ${rep.pointer.frame.host.x}, ${rep.pointer.frame.host.y}` : ''}` : 'nothing sent yet');
      if (winGames.length && process.platform === 'win32') add("the games' windows are watched for the mouse (ps\\pointer.ps1)", !!ptrProc && winGames.every((x) => ptrWins[hwnd(attached[x.id].mediaId)]), `${Object.keys(ptrWins).length} of ${winGames.length} windows`);
      add('a recording can be made here', !!b.recType, b.recType || 'no video format');
      add('the stream can be encoded here', !!b.h264, 'H.264 for Twitch');
      if (opt && opt.record && b.recType) {
        recDir = folder;
        const r = await js(booth, `Booth.testRecord(${Math.round(num(opt.record, 2, 20, 4))})`);
        recDir = null;
        rep.testRecord = r;
        add('a short test recording was written', !!r && r.ok && r.bytes > 20000, r ? `${r.bytes} bytes in ${r.seconds} s: ${r.file}` : 'nothing');
      }
      await picture(stage, 'mystream-stage.png'); await picture(booth, 'mystream-booth.png');
      const shots = (await js(stage, 'Stage.snapshots()')) || {};
      for (const k of Object.keys(shots)) { try { const name = `mystream-source-${k}.png`; fs.writeFileSync(path.join(folder, name), Buffer.from(String(shots[k]).split(',')[1], 'base64')); rep.pictures.push(name); } catch (e) { /* no picture of this one */ } }
      if (!wasOpen && !(opt && opt.stay)) await close();
    }
    rep.passed = passed; rep.failed = failed;
    const text = [`MyStream check, Screen Trainer ${ctx.version}, ${rep.at}`, `${passed} passed, ${failed} failed`, '', ...lines, '', `Windows that could be shown: ${rep.windows ? rep.windows.count : '?'} (Steam's, never shown: ${rep.windows ? rep.windows.steam : '?'})`,
      rep.matching && rep.matching.length ? 'Asked for and switched on: ' + rep.matching.join(' | ') : '', rep.found && rep.found.length ? 'Titles with the words asked about: ' + rep.found.join(' | ') : '', 'Pictures: ' + rep.pictures.join(', ')].filter((l) => l !== '').join('\n') + '\n';
    if (opt && opt.dex && isOpen()) { const d = cfg.sources.find((x) => x.title === DEX_TITLE); if (d && d.on) { d.on = false; delete attached[d.id]; persist(true); pushStage(); pushView(); } }      // left in the list, switched off: the owner decides when it is on the stream
    try { fs.writeFileSync(path.join(folder, 'mystream.txt'), text); fs.writeFileSync(path.join(folder, 'mystream.json'), JSON.stringify(rep, null, 2)); } catch (e) { /* the folder went away */ }
    return { ok: failed === 0, passed, failed, dir: folder, text };
  }

  return { open, close, isOpen, check, stageWindow: () => (alive(stage) ? stage : null), boothWindow: () => (alive(booth) ? booth : null), isLive: () => live.on, isRecording: () => !!rec, keyChanged: applyTalkKey,
    _test: { view, cfg: () => cfg, attach, listWindows, setRecDir: (d) => { recDir = d; }, freezeAttach: (on) => { frozen = !!on; }, stageConfig, pushStage, setAttached: (a) => { attached = a; pushStage(); pushView(); } } };
}

module.exports = { create, sanitize, isSteam, matchWindow, titleKey, pointerFrame, STAGE, NOTE_COLORS, OWN_TITLE, REC_LENGTHS };
