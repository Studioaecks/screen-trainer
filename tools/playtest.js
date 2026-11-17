#!/usr/bin/env node
// Screen Trainer — headless playtests.
//
// Runs the real overlay code (everything overlay.html loads) inside Node with a stub DOM, drives it with
// simulated players, fast-forwards hours of play in seconds and reports crashes, broken invariants,
// clipping, jitter, pacing and progression. No Electron and no npm packages needed.
//
//   node tools/playtest.js                     the rule checks and all four playtests, default lengths
//   node tools/playtest.js nerd --hours 8      one of them (rules | features | oldman | child | nerd | slowmo)
//   node tools/playtest.js all --seed 7 --json report.json --sprites "C:\path\to\sprites"
//   node tools/playtest.js nerd --hours 2 --save-out save.json     keep the resulting save file (handy for testing the Pokédex window)
//   node tools/playtest.js oldman --save-in "%APPDATA%\Screen Trainer\save.json"     start the simulated players from a real save
//
// Exit code 1 when a playtest finds an error or a broken invariant, so it can gate a change.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const which = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const SEED = +opt('seed', 1);
const W = +opt('width', 1920), H = +opt('height', 1079);
const SAVE_IN = opt('save-in', '') ? JSON.parse(fs.readFileSync(opt('save-in', ''), 'utf8')) : null;

// ------------------------------------------------------------------ sprite sizes (real files when available)
const spritescan = require(path.join(APP, 'spritescan.js'));
function findSprites() {
  const given = opt('sprites', process.env.ST_SPRITES || '');
  return spritescan.normalize(given) || spritescan.autoFind([APP, process.cwd()]);
}
const dimCache = new Map();
function imageSize(url) {
  if (dimCache.has(url)) return dimCache.get(url);
  let dim = null;
  try {
    const file = decodeURIComponent(url.replace(/^file:\/\/\/?/, process.platform === 'win32' ? '' : '/'));
    const fd = fs.openSync(file, 'r'), b = Buffer.alloc(26);
    fs.readSync(fd, b, 0, 26, 0); fs.closeSync(fd);
    if (b.toString('latin1', 0, 3) === 'GIF') dim = [b.readUInt16LE(6), b.readUInt16LE(8)];
    else if (b.readUInt32BE(0) === 0x89504e47) dim = [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch (e) { /* missing file: the image "fails to load" */ }
  dimCache.set(url, dim);
  return dim;
}

// ------------------------------------------------------------------ stub DOM
function makeDom(log) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return t.canvas;
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const classList = (e) => ({
    add: (...c) => { const s = new Set(e.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); e.className = [...s].join(' '); },
    remove: (...c) => { e.className = e.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
    toggle: (c, on) => { const has = e.className.split(/\s+/).includes(c); const want = on === undefined ? !has : !!on; if (want !== has) (want ? e.classList.add(c) : e.classList.remove(c)); return want; },
    contains: (c) => e.className.split(/\s+/).includes(c),
  });
  let made = 0;
  function el(tag) {
    made++;
    const e = {
      tagName: String(tag).toUpperCase(), style: {}, children: [], parentNode: null, className: '', hidden: false, dataset: {}, _text: '',
      appendChild(c) { if (c.parentNode) c.remove(); this.children.push(c); c.parentNode = this; return c; },
      insertBefore(c, ref) { if (c.parentNode) c.remove(); const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); c.parentNode = this; return c; },
      removeChild(c) { c.remove(); return c; },
      remove() { const p = this.parentNode; if (p) { const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentNode = null; } },
      get firstChild() { return this.children[0] || null; },
      get lastChild() { return this.children[this.children.length - 1] || null; },
      get childElementCount() { return this.children.length; },
      set textContent(v) { for (const c of this.children) c.parentNode = null; this.children.length = 0; this._text = String(v); },
      get textContent() { return this._text; },
      setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
      addEventListener: noop, removeEventListener: noop,
      getContext() { ctx2d.canvas = this; return ctx2d; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
      animate() { return { cancel: noop, finished: Promise.resolve() }; },
    };
    e.classList = classList(e);
    return e;
  }
  class StubImage {
    constructor() { Object.assign(this, el('img')); this.classList = classList(this); this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this._src = ''; }
    set src(v) {
      this._src = v;
      // like a browser, finish loading later (on the next simulated frame), never inside the assignment
      StubImage.pending.push(() => {
        const d = StubImage.sizeOf(v);
        this.complete = true;
        if (d) { this.naturalWidth = d[0]; this.naturalHeight = d[1]; if (this.onload) this.onload(); }
        else if (this.onerror) this.onerror();
      });
    }
    get src() { return this._src; }
  }
  StubImage.sizeOf = () => [64, 64];
  StubImage.pending = [];
  StubImage.flush = () => { for (const fn of StubImage.pending.splice(0)) fn(); };
  const byId = {};
  const document = {
    getElementById(id) { return byId[id] || (byId[id] = Object.assign(el('div'), { id })); },
    createElement: el, documentElement: el('html'), body: el('body'), hidden: false,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  };
  return { document, Image: StubImage, byId, count: () => made, log };
}

// ------------------------------------------------------------------ boot the overlay scripts in a sandbox
async function boot({ settings = {}, save = SAVE_IN ? JSON.parse(JSON.stringify(SAVE_IN)) : null, seed = SEED, sprites = findSprites() } = {}) {
  const errors = [];
  const dom = makeDom();
  const info = sprites ? spritescan.scan(sprites) : null;
  if (info && info.ok) dom.Image.sizeOf = imageSize;
  // without a sprites folder: pretend every species has a 64x64 still sprite
  // (a few items of every rarity too: balls are found by a rule of their own, so without these nothing else could drop)
  const fakeItems = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'quick-ball', 'net-ball', 'luxury-ball', 'potion', 'super-potion', 'oran-berry', 'revive', 'full-heal', 'rare-candy', 'hyper-potion', 'leftovers', 'lucky-egg', 'nugget', 'big-nugget', 'full-restore', 'max-revive'];
  const fake = { root: '/fake', rootUrl: 'file:///fake', ok: true, items: Object.fromEntries(fakeItems.map((k) => [k, true])),
    idx: { pokemon: Array.from({ length: 1025 }, (_, i) => i + 1) }, itemList: null };
  const spriteInfo = info && info.ok ? info : fake;

  const main = require(path.join(APP, 'main.js').replace(/main\.js$/, 'defaults.js'));
  const base = Object.assign({}, main.DEFAULTS, { scale: 2, firstRun: false }, settings);
  let rngState = seed >>> 0;
  const rand = () => { rngState = (rngState + 0x6d2b79f5) >>> 0; let t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const handlers = {}, sent = { saves: 0, lastSave: '', hover: false, states: 0, lastState: null, opened: 0, sounds: 0 };
  const on = (ch) => (fn) => { handlers[ch] = fn; };
  const st = {
    init: async () => ({ settings: Object.assign({}, base), sprites: spriteInfo, save, version: 'sim', sounds: null }),     // a copy, as over IPC
    hover: (b) => { sent.hover = !!b; }, save: (json) => { sent.saves++; sent.lastSave = json; }, sendState: (s) => { sent.states++; sent.lastState = s; },
    openPanel: () => { sent.opened++; }, onSettings: on('settings'), onSprites: on('sprites'), onCursor: on('cursor'), onCmd: on('cmd'), onStateRequest: on('stateRequest'),
    soundBank: async () => null, setSettings: async (p) => { Object.assign(base, p); if (handlers.settings) handlers.settings(Object.assign({}, base)); return base; },
    onSound: on('sound'), sound: () => { sent.sounds++; },
    onGuardian: on('guardian'), openGuardian: () => { sent.guardian = (sent.guardian || 0) + 1; },
  };
  let rafCb = null;
  const win = {
    st, innerWidth: W, innerHeight: H, devicePixelRatio: 1, _listeners: {}, addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }, removeEventListener: () => {},      // (the listeners are kept, so a check can send the page a mouse event: tools/v091check.js)
    requestAnimationFrame: (fn) => { rafCb = fn; return 1; }, cancelAnimationFrame: () => {},
  };
  const sandbox = {
    window: win, document: dom.document, Image: dom.Image, console: { log: () => {}, warn: () => {}, info: () => {}, error: (...a) => errors.push('console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' ')) },
    requestAnimationFrame: win.requestAnimationFrame, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, performance: { now: () => 0 },
    navigator: { userAgent: 'sim' }, location: { hash: '', href: 'file:///sim/overlay.html' }, __rand: rand,
  };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  Object.assign(win, { document: dom.document, Image: dom.Image });
  const ctx = vm.createContext(sandbox);
  vm.runInContext('Math.random = __rand;', ctx);
  const html = fs.readFileSync(path.join(APP, 'overlay.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    try { vm.runInContext(fs.readFileSync(path.join(APP, s), 'utf8'), ctx, { filename: s }); }
    catch (e) { errors.push(`load ${s}: ${e.stack || e}`); }
  }
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // let the async bootstrap finish
  const get = (expr) => vm.runInContext(expr, ctx);
  const G = get('G'), FX = get('FX'), Mon = get('Mon'), DATA = get('DATA');
  if (!G.save) errors.push('bootstrap did not finish (G.save is not set)');
  return { ctx, get, G, FX, Mon, DATA, dom, errors, sent, handlers, settings: base, spriteInfo, realSprites: !!(info && info.ok), raf: () => rafCb };
}

// ------------------------------------------------------------------ a simulated session
class Sim {
  constructor(env, name) {
    Object.assign(this, env);
    this.name = name; this.t = 0; this.tasks = []; this.findings = []; this.ev = {}; this.series = []; this.maxima = {}; this.notes = [];
    this.texts = []; this.firstCatch = null; this.cursor = { x: -9999, y: -9999 };
    this.instrument();
  }
  count(k, n = 1) { this.ev[k] = (this.ev[k] || 0) + n; }
  max(k, v) { if (!(k in this.maxima) || v > this.maxima[k]) this.maxima[k] = v; }
  problem(kind, msg, extra) {
    const f = this.findings.find((x) => x.kind === kind && x.msg === msg);
    if (f) { f.n++; f.last = +this.t.toFixed(2); return; }
    if (this.findings.length < 400) this.findings.push(Object.assign({ kind, msg, n: 1, first: +this.t.toFixed(2) }, extra || {}));
  }
  instrument() {
    const self = this, G = this.G, FX = this.FX;
    const wrap = (obj, key, before) => { const o = obj[key]; if (typeof o !== 'function') return; obj[key] = function (...a) { try { before(...a); } catch (e) { /* metrics only */ } return o.apply(this, a); }; };
    wrap(G, 'catch', (a) => { self.count('caught'); if (a.mon.shiny) self.count('caughtShiny'); if (a.mon.alpha) self.count('caughtAlpha'); if (self.firstCatch === null) self.firstCatch = self.t; });
    wrap(G, 'faint', (a) => self.count(a.side === 'wild' ? 'wildKO' : 'teamFaint'));
    wrap(G, 'flee', () => self.count('fled'));
    wrap(G, 'addWild', (sp, lvl, shiny, pos, o) => { self.count('spawned'); if (shiny) self.count('spawnShiny'); if (o && o.alpha) self.count('spawnAlpha'); });
    wrap(G, 'evolveFx', () => self.count('evolved'));
    wrap(G, 'announce', (s) => { self.count('announce'); self.texts.push([self.t, 'A', s]); });
    wrap(G, 'throwBall', () => self.count('throwCalls'));
    wrap(G, 'dropItem', () => self.count('itemDrops'));
    wrap(G, 'pickUp', () => self.count('itemPickups'));
    wrap(G, 'toast', (o) => { self.count('toast'); self.texts.push([self.t, 'T', (o && (o.title || o.text)) || '']); });
    wrap(FX, 'text', (x, y, s) => { self.count('fxText'); if (self.keepTexts) self.texts.push([self.t, 't', s, Math.round(x), Math.round(y)]); });
    const S = this.get('typeof Sound !== "undefined" ? Sound : null');
    if (S) { wrap(S, 'play', (n) => self.count('sfx:' + n)); wrap(S, 'cry', () => self.count('cry')); wrap(S, 'scene', (n) => self.count('scene:' + n)); }
  }
  // ---- input helpers (the overlay only receives a click when the pointer is over something it draws)
  move(x, y) { this.cursor.x = x; this.cursor.y = y; this.G.onMove(x, y); }
  click(x, y, button = 0) {
    this.move(x, y);
    this.count('clickAttempts');
    if (!this.G.pick(x, y)) { this.count('clickThrough'); return false; }
    this.G.onDown(x, y, button); this.G.onUp(); this.count(button === 2 ? 'rightClicks' : 'leftClicks');
    return true;
  }
  clickActor(a, button = 0, wobble = 0) {
    const r = this.get('Math.random');
    return this.click(a.x + (r() - 0.5) * wobble, a.y - a.h * (a.pad ? 0.4 : 0.5) + (r() - 0.5) * wobble, button);
  }
  drag(a, x, y) { const sx = a.x, sy = a.y - a.h * 0.4; this.move(sx, sy); if (!this.G.pick(sx, sy)) return false; this.G.onDown(sx, sy, 0); this.G.onMove((sx + x) / 2, (sy + y) / 2); this.G.onMove(x, y); this.G.onUp(); this.count('drags'); return true; }
  cmd(c) { this.count('cmd:' + c.type); if (this.handlers.cmd) this.handlers.cmd(c); }
  set(patch) { Object.assign(this.settings, patch); this.count('settingChanges'); if (this.handlers.settings) this.handlers.settings(Object.assign({}, this.settings)); }
  every(sec, fn, jitter = 0) { const task = { next: this.t + sec * (0.2 + this.rnd()), sec, fn, jitter }; this.tasks.push(task); return task; }
  rnd() { return this.get('Math.random')(); }
  wilds() { return this.G.actors.filter((a) => a.side === 'wild' && !a.gone); }
  team() { return this.G.actors.filter((a) => a.side === 'team' && !a.gone); }

  /** advance the game; `render` draws every n-th step (exercises the render path with a stub canvas) */
  run(seconds, { dt = 1 / 60, render = 30, onStep = null, checkEvery = 1 } = {}) {
    const G = this.G, steps = Math.round(seconds / dt);
    let nextCheck = 0;
    for (let i = 0; i < steps; i++) {
      for (const task of this.tasks) if (this.t >= task.next) { task.next = this.t + task.sec * (1 + (this.rnd() - 0.5) * 2 * task.jitter); try { task.fn(this); } catch (e) { this.problem('persona', String(e.stack || e)); } }
      this.dom.Image.flush();
      try { G.update(dt); } catch (e) { this.problem('exception', 'update: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')); }
      if (render && i % render === 0) { try { G.render(); } catch (e) { this.problem('exception', 'render: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')); } }
      this.t += dt;
      if (onStep) onStep(this, dt);
      if (this.t >= nextCheck) { nextCheck = this.t + checkEvery; this.check(); }
    }
    for (const e of this.errors.splice(0)) this.problem('exception', e.split('\n').slice(0, 3).join(' | '));
  }

  /** invariants that must hold at any moment */
  check() {
    const G = this.G, Mon = this.Mon, sv = G.save, bad = (m) => this.problem('invariant', m), Size = this.get('Size');
    const fin = (v) => typeof v === 'number' && isFinite(v);
    for (const a of G.actors) {
      if (!fin(a.x) || !fin(a.y) || !fin(a.tx) || !fin(a.ty)) bad(`actor position is not a number (${Mon.name(a.mon)})`);
      const mh = Mon.maxHp(a.mon);
      if (!fin(a.mon.hp) || a.mon.hp < 0 || a.mon.hp > mh + 0.001) bad(`hp out of range ${a.mon.hp}/${mh}`);
      if (a.mon.lvl < 1 || a.mon.lvl > 100) bad('level out of range');
      if (a.gone) bad('removed actor still listed');
      if (a.side === 'team' && !sv.team.includes(a.mon)) bad('team actor without a roster entry');
      if (a.busy && a.state !== 'captured') { a._busyT = (a._busyT || 0) + 1; if (a._busyT > 20) bad('actor stuck busy for more than 20 s'); } else a._busyT = 0;
      if (a.nw && a.grow) { const base = Size.spriteScale(a.mon, a.nw, a.nh, !!a.pad, G.set.sizeMode || 'true', G.scale, Math.min(G.W, G.H)); if (!(a.k > 0) || a.k < base * 0.999 || a.k > Math.max(base, (0.62 * Math.min(W, H)) / Math.max(a.nw, a.nh)) * 1.001 || !(a.form || (a.ev && a.ev.helper))) bad(`a changed Pokémon is out of range (${Mon.name(a.mon)}: ${Math.round(a.w)} x ${Math.round(a.h)}, form ${a.form && a.form.kind})`); }      // Mega Evolution or Dynamax (src/forms.js), or one of the three Super XXL helpers (src/events.js): larger on purpose, within its own limit
      else if (a.nw) {                                        // drawn as the size model says, and never outgrowing the screen
        const want = Size.spriteScale(a.mon, a.nw, a.nh, !!a.pad, G.set.sizeMode || 'true', G.scale, Math.min(G.W, G.H)), body = Math.min(a.w, a.h) * (a.pad ? Size.DRAW.paddedFill : 1);
        if (!(a.k > 0) || Math.abs(a.k - want) > 1e-6 * want) bad(`a sprite is not drawn at the size the size model gives (${Mon.name(a.mon)}: ${a.k} for ${want})`);
        if (!(body > 0 && body <= Size.DRAW.hardCap * Math.min(W, H) + 1)) bad(`sprite size out of range (${Mon.name(a.mon)}: ${Math.round(a.w)} x ${Math.round(a.h)})`);
      }
      if (a.ev && a.side !== 'wild') bad('a caught visitor still behaves like a visitor');
    }
    for (const m of [...sv.team, ...sv.box]) if (!(m.sz >= 0 && m.sz <= 255)) bad(`a Pokémon without a size (${Mon.name(m)})`);
    if (G.actors.filter((a) => a.ev).length > 1) bad('more than one legendary visitor at a time');
    const mew = this.get('typeof Mewtwo !== "undefined" && Mewtwo.present() ? Mewtwo.box() : null');
    if (mew && !(fin(mew.x) && fin(mew.y) && mew.x >= 0 && mew.x <= W && mew.y >= 0 && mew.y <= H)) bad(`Mewtwo is off the screen (${mew.x}, ${mew.y})`);
    const tm = G.actors.filter((a) => a.side === 'team');
    if (tm.length !== sv.team.length) bad(`team actors ${tm.length} != roster ${sv.team.length}`);
    if (sv.team.length > 6) bad('team larger than six');
    const uids = new Set(); for (const m of [...sv.team, ...sv.box]) { if (uids.has(m.uid)) bad('duplicate creature uid'); uids.add(m.uid); }
    if (G.trainerTarget && G.trainerTarget.gone) bad('trainer target points at a removed actor');
    if (G.hover && G.hover.gone) bad('hover points at a removed actor');
    this.max('actors', G.actors.length); this.max('wild', this.wilds().length); this.max('zones', G.zones.length); this.max('timers', G.timers.length);
    this.max('shots', G.shots.length); this.max('balls', G.balls.length); this.max('fx', this.FX.busy()); this.max('box', sv.box.length);
    this.max('domNodes', this.dom.byId.world ? this.dom.byId.world.children.length : 0);
    if (G.drops) this.max('drops', G.drops.length);
    if (G.timers.length > 4000) bad('timer queue keeps growing');
    if (this.dom.byId.world && this.dom.byId.world.children.length > G.actors.length + G.balls.length + (G.drops ? G.drops.length : 0) + 40) bad('DOM nodes leaking in #world');
  }
  sample() {
    const sv = this.G.save, lv = sv.team.map((m) => m.lvl);
    this.series.push({ t: Math.round(this.t), team: sv.team.length, avg: lv.length ? +(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1) : 0, max: lv.length ? Math.max(...lv) : 0,
      species: Object.keys(sv.dex.caught).length, seen: Object.keys(sv.dex.seen).length, box: sv.box.length, wild: this.wilds().length });
  }
  report(extra = {}) {
    const sv = this.G.save, json = JSON.stringify(sv);
    const hours = this.t / 3600;
    return Object.assign({
      _save: json, persona: this.name, simHours: +hours.toFixed(2), realSprites: this.realSprites,
      firstCatchMin: this.firstCatch === null ? null : +(this.firstCatch / 60).toFixed(1),
      team: sv.team.map((m) => `${this.Mon.name(m)} L${m.lvl}${m.shiny ? '*' : ''}${m.item ? ' @' + m.item : ''}`), box: sv.box.length,
      dex: { caught: Object.keys(sv.dex.caught).length, seen: Object.keys(sv.dex.seen).length }, stats: sv.stats, bag: sv.bag || undefined,
      events: this.ev, perHour: { spawned: +((this.ev.spawned || 0) / hours).toFixed(1), caught: +((this.ev.caught || 0) / hours).toFixed(1), wildKO: +((this.ev.wildKO || 0) / hours).toFixed(1), teamFaint: +((this.ev.teamFaint || 0) / hours).toFixed(1),
        texts: Math.round((this.ev.fxText || 0) / hours), announcements: Math.round(((this.ev.announce || 0) + (this.ev.toast || 0)) / hours) },
      maxima: this.maxima, saveKB: +(json.length / 1024).toFixed(1), saves: this.sent.saves, findings: this.findings, notes: this.notes,
      progression: this.series.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 12)) === 0 || i === arr.length - 1),
    }, extra);
  }
}

// ------------------------------------------------------------------ personas
const PERSONAS = {
  /** an older player with little interest: glances over now and then, clicks slowly and not very accurately, never opens settings */
  async oldman(hours = 3) {
    const sim = new Sim(await boot({ seed: SEED }), 'oldman');
    let attention = 0, cool = 0;
    sim.every(1, (s) => {
      if (attention > 0) attention -= 1; else if (s.rnd() < 1 / 420) attention = 20 + s.rnd() * 50;  // looks over every ~7 minutes for under a minute
      if (attention <= 0 || (cool -= 1) > 0) return;
      const w = s.wilds().filter((a) => s.G.targetable(a) && a.x > 0 && a.x < W && a.y > 0 && a.y < H);
      if (!w.length) { if (s.team().length && s.rnd() < 0.06) { s.clickActor(s.team()[0], 0, 60); cool = 4; } return; }
      const a = w[0];
      cool = 2 + s.rnd() * 4;                                    // slow hands
      const hpR = a.mon.hp / s.Mon.maxHp(a.mon);
      if (hpR > 0.5 && s.rnd() < 0.8) s.clickActor(a, 0, 70);     // inaccurate clicks, some miss and pass through
      else if (s.rnd() < 0.5) s.clickActor(a, 2, 50);
    });
    sim.every(300, (s) => s.sample());
    sim.run(hours * 3600, { render: 20 });
    sim.sample();
    const r = sim.report();
    r.idleShare = +(1 - (sim.ev.clickAttempts || 0) * 4 / sim.t).toFixed(3);
    return r;
  },

  /** a child: everything maxed out, clicks and drags everything, mashes buttons in the settings window, for hours */
  async child(hours = 6) {
    const sim = new Sim(await boot({ seed: SEED + 1, settings: { maxWild: 12, spawnEvery: 3, fxLevel: 'chaos', scale: 4, shinyOdds: 2 } }), 'child');
    const R = () => sim.rnd();
    sim.every(0.12, (s) => {                                      // ~8 clicks a second on anything at all
      const all = s.G.actors.filter((a) => !a.gone);
      const r = R();
      if (!all.length || r < 0.1) { s.click(R() * W, R() * H, R() < 0.3 ? 2 : 0); return; }
      const a = all[Math.floor(R() * all.length)];
      if (r < 0.55) s.clickActor(a, 0, 30); else if (r < 0.85) s.clickActor(a, 2, 30);
      else if (a.side === 'team') s.drag(a, R() < 0.3 ? (R() < 0.5 ? -400 : W + 400) : R() * W, R() < 0.3 ? (R() < 0.5 ? -400 : H + 400) : R() * H);
      if (s.G.drops && s.G.drops.length && R() < 0.5) { const d = s.G.drops[Math.floor(R() * s.G.drops.length)]; s.click(d.x, d.y - 8, 0); }
    }, 0.6);
    sim.every(7, (s) => {                                         // mashing the settings window
      const pick = (arr) => arr[Math.floor(R() * arr.length)];
      const sv = s.G.save, any = [...sv.team, ...sv.box], m = any.length ? pick(any) : null;
      const moves = [
        () => s.set({ scale: pick([0.5, 1, 2, 3, 4, 5]) }), () => s.set({ spriteStyle: pick(['showdown', 'bw', 'static']) }), () => s.set({ opacity: 0.1 + R() * 0.9 }),
        () => s.set({ roam: pick(['stroll', 'follow', 'stay']) }), () => s.set({ paused: R() < 0.2 }), () => s.set({ fxLevel: pick(['low', 'normal', 'chaos']) }),
        () => s.set({ battleStyle: pick(['smart', 'catch', 'ko']) }), () => s.set({ maxWild: 1 + Math.floor(R() * 12), spawnEvery: 3 + Math.floor(R() * 10) }),
        () => s.set({ gens: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(() => R() < 0.6).concat([1]) }), () => s.set({ labels: pick(['auto', 'always', 'never']), moveNames: R() < 0.5, autoBattle: R() < 0.8, evolve: R() < 0.8 }),
        () => s.set({ handsOff: R() < 0.5, mute: R() < 0.5, music: R() < 0.5, toasts: pick(['cards', 'text', 'off']) }),
        () => s.set({ sizeMode: pick(['true', 'balanced', 'sprite', 'nonsense']), weatherFreq: Math.floor(R() * 14) - 2, legendEvents: pick(['off', 'rare', 'sometimes', 'often', 'x']) }),
        () => s.set({ guardian: R() < 0.7, guardianX: R() * 1.4 - 0.2, guardianY: R() * 1.4 - 0.2 }),
        () => s.cmd({ type: 'weather', kind: pick(['rain', 'sun', 'sand', 'hail', 'snow', 'frogs', undefined]), seconds: R() * 60 }), () => s.cmd({ type: 'event', kind: pick(['friendly', 'aggressive', 'evasive', 'silly', undefined]), sp: pick([0, 150, 249, 380, 99999, -1]) }),
        () => s.cmd({ type: 'guardSay', text: pick(['hello', '', '<b>x</b>', 'x'.repeat(900)]), tone: pick(['ok', 'bad', 'zzz']) }),
        () => { const b = s.get('typeof Mewtwo !== "undefined" && Mewtwo.present() ? Mewtwo.box() : null'); if (b) { const x = b.x, y = b.y - b.h * 0.5; s.move(x, y); if (s.G.pick(x, y)) { s.G.onDown(x, y, R() < 0.2 ? 2 : 0); if (R() < 0.6) s.G.onMove(R() < 0.2 ? -500 : R() * W, R() < 0.2 ? H + 500 : R() * H); s.G.onUp(); s.count('mewtwoClicks'); } } },
        () => m && s.cmd({ type: 'leader', uid: m.uid }), () => m && s.cmd({ type: 'move', uid: m.uid, dir: R() < 0.5 ? -1 : 1 }), () => m && s.cmd({ type: 'box', uid: m.uid }),
        () => m && s.cmd({ type: 'unbox', uid: m.uid }), () => m && sv.box.length > 3 && s.cmd({ type: 'release', uid: pick(sv.box).uid }),
        () => m && s.cmd({ type: 'rename', uid: m.uid, name: pick(['', 'AAAAAAAAAAAAAAAAAAAAAAAA', '<b>x</b>', '💥💥💥', '   ', "o'k\"", 'null']) }),
        () => m && s.cmd({ type: 'evoLock', uid: m.uid, on: R() < 0.5 }), () => s.cmd({ type: 'gather' }), () => s.cmd({ type: 'nope' }), () => s.cmd({ type: 'leader', uid: 'missing' }),
        () => { const all = [...sv.team, ...sv.box].map((x) => x.uid).sort(() => R() - 0.5); const n = Math.min(6, 1 + Math.floor(R() * 6)); s.cmd({ type: 'arrange', team: all.slice(0, n), box: all.slice(n) }); },
        () => s.cmd({ type: 'arrange', team: [], box: [] }), () => s.cmd({ type: 'arrange', team: ['x', 'y'], box: null }),
        () => { const bag = sv.bag || {}; const keys = Object.keys(bag); if (keys.length && m) s.cmd({ type: pick(['useItem', 'giveItem', 'takeItem', 'equipBall', 'tossItem']), item: pick(keys), uid: m.uid }); },
        () => s.cmd({ type: 'useItem', item: 'not-an-item', uid: m && m.uid }), () => s.cmd({ type: 'music', op: pick(['random', 'next', 'prev', 'toggle']) }),
        () => s.handlers.stateRequest && s.handlers.stateRequest(),
      ];
      pick(moves)();
    }, 0.8);
    let resets = 0;
    sim.every(5400, (s) => { if (resets < 1) { resets++; s.cmd({ type: 'reset' }); } });       // and once, the big red button
    sim.every(600, (s) => s.sample());
    sim.run(hours * 3600, { render: 12 });
    sim.sample();
    return sim.report({ resets });
  },

  /** a Pokémon expert building the strongest possible team: weakens, uses status, catches everything new, hunts alphas, optimises the roster */
  async nerd(hours = 8) {
    const sim = new Sim(await boot({ seed: SEED + 2, settings: { maxWild: 5, spawnEvery: 12, battleStyle: 'smart', handsOff: true } }), 'nerd');
    const G = sim.G, Mon = sim.Mon, D = sim.DATA;
    const bst = (m) => D.dex[m.sp].s.reduce((a, b) => a + b, 0);
    const power = (m) => bst(m) * (0.5 + m.lvl / 100) + m.iv.reduce((a, b) => a + b, 0) * 0.4 + (m.shiny ? 5 : 0);
    let throwCool = 0;
    sim.every(0.35, (s) => {
      throwCool -= 0.35;
      const wilds = s.wilds().filter((a) => G.targetable(a) && a.state !== 'enter' && a.x > 20 && a.x < W - 20 && a.y > 20);
      if (G.drops) for (const d of G.drops) if (!d.taken && s.rnd() < 0.5) { s.click(d.x, d.y - 8, 0); return; }
      if (!wilds.length) { const t = s.team(); if (t.length && s.rnd() < 0.3) { const low = t.reduce((b, a) => (a.mon.aff < b.mon.aff ? a : b), t[0]); if (low.mon.aff < 255) s.clickActor(low, 0, 6); } return; }
      const want = (a) => !!a.mon.shiny || !!a.mon.alpha || !G.save.dex.caught[a.mon.sp] || (G.save.team.length < 6) || power(a.mon) > Math.min(...G.save.team.map(power)) * 1.15;
      const targets = wilds.filter(want).sort((a, b) => (b.mon.shiny - a.mon.shiny) || (!!b.mon.alpha - !!a.mon.alpha) || bst(b.mon) - bst(a.mon));
      const a = targets[0];
      if (!a) return;
      const p = Mon.catchCalc(a.mon, G.ballFor ? G.ballFor(a).mult : G.ballTier().mult).p, hpR = a.mon.hp / Mon.maxHp(a.mon);
      if (a.balled) return;
      if ((p > 0.55 || hpR <= 0.12 || (hpR < 0.3 && a.mon.st)) && throwCool <= 0) { if (s.clickActor(a, 2, 4)) throwCool = 1.0; }
      else if (hpR > 0.12) s.clickActor(a, 0, 4);
    });
    // roster management every couple of minutes: best six on the team, a born leader in front, bag put to use
    sim.every(120, (s) => {
      const sv = G.save;
      if (!sv.team.length) return;
      const all = [...sv.team, ...sv.box].sort((x, y) => power(y) - power(x));
      const best = all.slice(0, 6);
      best.sort((x, y) => (Mon.aptMult(y) + Mon.leadLevel(y) * 0.3 + y.lvl / 200) - (Mon.aptMult(x) + Mon.leadLevel(x) * 0.3 + x.lvl / 200));
      const cur = sv.team.map((m) => m.uid).join(), next = best.map((m) => m.uid).join();
      if (cur !== next) {
        if (typeof G.arrange === 'function' || s.get('typeof Items !== "undefined"')) s.cmd({ type: 'arrange', team: best.map((m) => m.uid), box: all.slice(6).map((m) => m.uid) });
        else {                                                    // v0.1 commands
          for (const m of sv.team.slice()) if (!best.includes(m) && sv.team.length > 1) s.cmd({ type: 'box', uid: m.uid });
          for (const m of best) if (!sv.team.includes(m)) s.cmd({ type: 'unbox', uid: m.uid });
          s.cmd({ type: 'leader', uid: best[0].uid });
        }
      }
      const bag = sv.bag || {};
      for (const key of Object.keys(bag)) {
        const it = s.get('typeof Items !== "undefined" ? Items.get : null'); if (!it) break;
        const def = it(key); if (!def) continue;
        const team = sv.team.slice().sort((x, y) => power(y) - power(x));
        if (def.kind === 'held') { const free = team.find((m) => !m.item); if (free) s.cmd({ type: 'giveItem', item: key, uid: free.uid }); }
        else if (def.kind === 'ball') s.cmd({ type: 'equipBall', item: key });
        else for (const m of team) { if ((sv.bag[key] || 0) > 0) s.cmd({ type: 'useItem', item: key, uid: m.uid }); }
      }
      if (sv.box.length > 60) for (const m of sv.box.slice().sort((x, y) => power(x) - power(y)).slice(0, sv.box.length - 60)) if (!m.shiny) s.cmd({ type: 'release', uid: m.uid });
    });
    sim.every(600, (s) => s.sample());
    sim.run(hours * 3600, { render: 20 });
    sim.sample();
    const r = sim.report();
    const sv = G.save;
    r.teamPower = sv.team.map((m) => Math.round(power(m)));
    r.leader = sv.team[0] ? { name: Mon.name(sv.team[0]), apt: Mon.aptitude(sv.team[0]), leadLevel: Mon.leadLevel(sv.team[0]) } : null;
    r.hearts = sv.team.map((m) => Mon.hearts(m));
    r.legendariesCaught = Object.keys(sv.dex.caught).filter((id) => D.dex[id].lg).length;
    return r;
  },

  /** slow motion: tiny time steps, every frame drawn and measured for sprites popping, clipping the screen edge and jittering */
  async slowmo(seconds = 420) {
    const sim = new Sim(await boot({ seed: SEED + 3, settings: { maxWild: 6, spawnEvery: 5, scale: +opt('scale', 2), fxLevel: 'normal' } }), 'slowmo');
    const G = sim.G, dt = 1 / 240;
    // scripted player so that every animation happens: weaken, throw, pet, drag
    sim.every(0.6, (s) => {
      const w = s.wilds().filter((a) => G.targetable(a) && a.state !== 'enter');
      if (w.length && s.rnd() < 0.8) { const a = w[Math.floor(s.rnd() * w.length)]; s.clickActor(a, a.mon.hp / s.Mon.maxHp(a.mon) < 0.45 ? 2 : 0, 4); }
      else if (s.team().length && s.rnd() < 0.3) s.clickActor(s.team()[Math.floor(s.rnd() * s.team().length)], 0, 4);
    });
    const tracks = new Map(), stats = { frames: 0, popIn: [], popOut: [], offscreen: {}, flip: {}, backFlip: {}, shiver: {}, teleport: [], labelClip: {}, hopIn: 0, hopOut: 0, wildSeen: 0, context: [] };
    const seen = new Set();
    const parse = (el) => { const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform || ''); return m ? [+m[1], +m[2]] : null; };
    const name = (a) => `${sim.Mon.name(a.mon)}#${a.id}`;
    const bump = (obj, a, n = 1) => { const k = name(a); obj[k] = (obj[k] || 0) + n; };
    const step = () => {
      stats.frames++;
      const live = new Set();
      for (const a of G.actors) {
        live.add(a.id);
        const p = parse(a.el); if (!p) continue;
        const useBack = a._bk && a.imgB, w = useBack ? a.imgB.naturalWidth * G.sizeOf(a) : a.w, h = useBack ? a.imgB.naturalHeight * G.sizeOf(a) : a.h;
        const op = a.el.style.opacity === undefined || a.el.style.opacity === '' ? 1 : +a.el.style.opacity;
        const box = { l: p[0], t: p[1], r: p[0] + w, b: p[1] + h, vis: op > 0.02 };
        // visible body: trimmed by the hit fraction so transparent sprite padding does not count
        const padX = (w * (1 - (a.hit || 1))) / 2, body = { l: box.l + padX, r: box.r - padX, t: box.t + h * (a.pad ? 0.2 : 0), b: box.b - (a.pad || 0) * h };
        const onScreen = body.r > 0 && body.l < W && body.b > 0 && body.t < H;
        let tr = tracks.get(a.id);
        if (!tr) {
          tr = { a, first: sim.t, px: p[0] + w / 2, py: p[1] + h - (a.pad || 0) * h, face: a.face, back: !!a._bk, faceFlips: [], backFlips: [], dirFlips: [], lastDir: 0, side: a.side };
          tracks.set(a.id, tr);
          if (a.side === 'wild' && !seen.has(a.id) && onScreen && box.vis && sim.t > 0.5) stats.popIn.push({ who: name(a), t: +sim.t.toFixed(2), x: Math.round(a.x), y: Math.round(a.y), state: a.state });
          seen.add(a.id);
        }
        tr.box = box; tr.body = body; tr.onScreen = onScreen && box.vis; tr.state = a.state;
        const moving = a.state === 'enter' || a.state === 'leave' || a.state === 'faint' || a.dragging || a.state === 'captured' || a.vol.away || a.hops || a.await || a.lunge;   // a fainting sprite fades out where it fell; a lunge at a target on the edge reaches past it for a tenth of a second
        if (a.hops) { if (a.state === 'leave') tr.hopOut = true; else tr.hopIn = true; }
        if (!moving && box.vis && a.age > 1) {
          const over = Math.max(0 - body.l, body.r - W, 0 - body.t, body.b - H - 2);
          if (over > 8) { const k = name(a); stats.offscreen[k] = Math.max(stats.offscreen[k] || 0, Math.round(over)); }
          const labelY = a.y - a.h * (a.pad ? 0.8 : 1) - 30;
          if (labelY < 2 && a.side === 'wild') bump(stats.labelClip, a);
        }
        if (a.face !== tr.face) { tr.face = a.face; tr.faceFlips.push(sim.t); }
        if (!!a._bk !== tr.back) { tr.back = !!a._bk; tr.backFlips.push(sim.t); }
        // movement is measured at the feet: the back picture of a sprite can be a different size from the front one,
        // which moves the element's corner when it turns around although the Pokémon stays where it stands
        const fx = p[0] + w / 2, fy = p[1] + h - (a.pad || 0) * h, dx = fx - tr.px, dy = fy - tr.py;
        if (a.warped) { a.warped = false; tr.skipJump = true; }                       // the move Teleport
        if (!a.dragging && !a.lunge && Math.hypot(dx, dy) > 60 && !tr.skipJump && !tr.hidden && box.vis && a.age > 0.1) stats.teleport.push({ who: name(a), t: +sim.t.toFixed(2), d: Math.round(Math.hypot(dx, dy)), state: a.state });
        tr.skipJump = false; tr.hidden = !box.vis;
        const dir = Math.abs(dx) < 0.15 ? 0 : Math.sign(dx);
        if (dir && tr.lastDir && dir !== tr.lastDir && !a.lunge && !(a.shake > 0) && !(a.flash > 0) && !a.hops && !a.kx && !a.ky && !a.dragging) tr.dirFlips.push(sim.t);
        if (dir) tr.lastDir = dir;
        tr.px = fx; tr.py = fy;
        for (const [list, into, limit, win] of [[tr.faceFlips, stats.flip, 3, 0.6], [tr.backFlips, stats.backFlip, 3, 0.8], [tr.dirFlips, stats.shiver, 5, 0.5]]) {
          while (list.length && sim.t - list[0] > win) list.shift();
          if (list.length >= limit) {
            bump(into, a); list.length = 0;
            if (stats.context.length < 14) stats.context.push({ what: into === stats.flip ? 'faceFlip' : into === stats.backFlip ? 'backFlip' : 'shiver', who: name(a), t: +sim.t.toFixed(2), side: a.side, state: a.state, mode: a.mode || '', moving: !!a.moving, busy: !!a.busy, hold: !!a.hold,
              aggro: !!a.aggro, toGoal: Math.round(Math.hypot(a.tx - a.x, a.ty - a.y)), toTarget: a.target && !a.target.gone ? Math.round(Math.hypot(a.target.x - a.x, a.target.y - a.y)) : null, kick: Math.round(Math.abs(a.kx) + Math.abs(a.ky)), near: G.actors.filter((b) => b !== a && Math.hypot(b.x - a.x, b.y - a.y) < 90).length });
          }
        }
      }
      for (const [id, tr] of tracks) if (!live.has(id)) {
        if (tr.side === 'wild') { stats.wildSeen++; if (tr.hopIn) stats.hopIn++; if (tr.hopOut) stats.hopOut++; }
        if (tr.side === 'wild' && tr.onScreen && (tr.state === 'leave')) stats.popOut.push({ who: name(tr.a), t: +sim.t.toFixed(2), x: Math.round(tr.a.x), y: Math.round(tr.a.y), w: Math.round(tr.a.w) });
        tracks.delete(id);
      }
    };
    for (const k of ['gather']) { const o = G[k]; if (o) G[k] = function (...a) { for (const tr of tracks.values()) tr.skipJump = true; return o.apply(this, a); }; }
    sim.run(seconds, { dt, render: 1, onStep: step, checkEvery: 0.5 });
    const top = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    const r = sim.report();
    r.slowmo = { frames: stats.frames, dt: '1/240 s', scale: sim.settings.scale, wildFinished: stats.wildSeen, hoppedIn: stats.hopIn, hoppedOut: stats.hopOut,
      popIn: { count: stats.popIn.length, examples: stats.popIn.slice(0, 5) }, popOut: { count: stats.popOut.length, examples: stats.popOut.slice(0, 5) },
      offscreenWhileIdle: { actors: Object.keys(stats.offscreen).length, worstPx: top(stats.offscreen, 6) },
      faceFlipFlop: { actors: Object.keys(stats.flip).length, total: Object.values(stats.flip).reduce((a, b) => a + b, 0), worst: top(stats.flip, 4) },
      backFrontFlipFlop: { actors: Object.keys(stats.backFlip).length, total: Object.values(stats.backFlip).reduce((a, b) => a + b, 0), worst: top(stats.backFlip, 4) },
      shiver: { actors: Object.keys(stats.shiver).length, total: Object.values(stats.shiver).reduce((a, b) => a + b, 0), worst: top(stats.shiver, 4) },
      teleports: { count: stats.teleport.length, examples: stats.teleport.slice(0, 6) }, labelClippedTop: { actors: Object.keys(stats.labelClip).length } };
    r.slowmoContext = stats.context;
    for (const [k, v] of [['popIn', stats.popIn.length], ['popOut', stats.popOut.length], ['offscreen', Object.keys(stats.offscreen).length], ['faceFlipFlop', r.slowmo.faceFlipFlop.total], ['backFrontFlipFlop', r.slowmo.backFrontFlipFlop.total], ['shiver', r.slowmo.shiver.total], ['teleport', stats.teleport.length]])
      if (v) r.findings.push({ kind: 'visual', msg: `${k}: ${v}`, n: v });
    return r;
  },
  /** the owner's rules, checked head-on: clicks never knock out, and "Hands off my target" keeps the team away */
  async rules() {
    const out = {}, bad = [];
    // 1. rapid clicking with no team around: the wild Pokémon stays at 1 HP at worst
    {
      const sim = new Sim(await boot({ seed: SEED + 10, settings: { maxWild: 1, spawnEvery: 3 } }), 'rules');
      const G = sim.G;
      let clicks = 0, minHp = Infinity, kos = 0, clicking = false, byClick = 0;
      const faint = G.faint; G.faint = function (a) { if (a.side === 'wild') { kos++; if (clicking) byClick++; } return faint.apply(this, arguments); };
      sim.every(0.15, (s) => {
        const w = s.wilds().find((a) => G.targetable(a)); if (!w) return;
        const x = w.x, y = w.y - w.h * (w.pad ? 0.4 : 0.5), hit = G.pick(x, y);
        if (!hit || hit.actor !== w || hit.kind === 'ball') return;                        // never the ball button: no catches, so no team
        clicking = true; G.onMove(x, y); G.onDown(x, y, 0); G.onUp(); clicking = false;
        clicks++; minHp = Math.min(minHp, w.mon.hp);
      });
      sim.run(240);
      out.clicksNeverKnockOut = { clicks, lowestHp: minHp, knockedOut: kos, team: G.save.team.length };
      if (kos || byClick || minHp < 1) bad.push(`clicks knocked a wild Pokémon out (${kos} fainted, ${byClick} during a click, lowest HP ${minHp}, ${clicks} clicks)`);
      if (clicks < 200 || G.save.team.length) bad.push(`the click check did not run as intended (${clicks} clicks, team of ${G.save.team.length})`);
      for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
    }
    // 2. hands off: a team of six, one wild Pokémon at a time, clicked from the moment it appears.
    //    With the option on, nothing but the clicks may hurt it and it must not attack the team; with it off, the team joins in.
    let last = null;
    for (const handsOff of [true, false]) {
      const sim = new Sim(await boot({ seed: SEED + 4, settings: { maxWild: 1, spawnEvery: 3, handsOff, shinyOdds: 100000 } }), 'rules'), G = sim.G;
      for (const sp of [25, 4, 7, 1, 16, 133]) G.save.team.push(sim.Mon.create(sp, 30, {}));
      G.syncTeam();
      sim.run(3);
      // GRACE: a team member already on its way when the first click lands needs a moment to let go.
      // It cannot hurt the target in that moment either: teamHits counts from the first click on.
      const GRACE = 1;
      let w = null, teamHits = 0, lostToTeam = 0, otherLoss = 0, targeted = 0, wildAttacks = 0, clicks = 0, firstClick = 0, lastClick = -99, held = 0, clicking = false, lastSrc = '';
      const recent = () => sim.t - lastClick < 12;
      const hurt = G.hurt; G.hurt = function (t, dmg, src) {
        const dealt = hurt.apply(this, arguments);
        if (t === w && dealt > 0 && !clicking && recent()) { lastSrc = src ? src.side : 'lingering'; if (src && src.side === 'team') teamHits++; else otherLoss++; }
        return dealt;
      };
      // fainting to anything but another wild Pokémon's own attack means the team, or what it left behind, took the catch away
      const faint = G.faint; G.faint = function (a) { if (a === w && recent() && lastSrc !== 'wild') lostToTeam++; return faint.apply(this, arguments); };
      const onStep = (s) => {
        if (!w || w.gone || !G.targetable(w)) { w = null; return; }
        const settled = recent() && s.t - firstClick > GRACE;
        if (G.handsOff(w)) held++;
        if (settled && s.team().some((t) => t.target === w && t.mode === 'fight' && G.alive(t))) targeted++;
        if (settled && w.target && w.target.side === 'team' && w.busy) wildAttacks++;
      };
      sim.every(1.5, (s) => {
        if (!w) { w = s.wilds().find((a) => G.targetable(a) && !a.hops && a.age < 2); if (!w) return; lastClick = -99; lastSrc = ''; }
        const x = w.x, y = w.y - w.h * 0.5, hit = G.pick(x, y);
        if (hit && hit.actor === w && hit.kind !== 'ball') { clicking = true; G.onMove(x, y); G.onDown(x, y, 0); G.onUp(); clicking = false; clicks++; if (s.t - lastClick >= 12) firstClick = s.t; lastClick = s.t; }
      }, 0);
      sim.run(600, { onStep });
      out[handsOff ? 'handsOffOn' : 'handsOffOffControl'] = { clicks, hitsByTeam: teamHits, faintedToTeam: lostToTeam, teamTargetedIt: targeted, itAttackedTeam: wildAttacks, otherLosses: otherLoss };
      if (handsOff && (teamHits || lostToTeam || targeted || wildAttacks)) bad.push(`hands off: the clicked Pokémon was hit by the team ${teamHits}x, fainted to the team ${lostToTeam}x, was targeted ${targeted}x, attacked the team ${wildAttacks}x (${clicks} clicks)`);
      if (handsOff && (clicks < 50 || held < 1000)) bad.push(`the hands-off check did not run as intended (${clicks} clicks)`);
      if (!handsOff && !teamHits && !targeted) bad.push('hands off control: the team never joined in, so the check above proves nothing');
      for (const f of sim.findings) if (f.kind !== 'visual') bad.push(`${f.kind}: ${f.msg}`);
      last = sim;
    }
    const r = last.report();
    r.persona = 'rules'; r.simHours = +((240 + 603 * 2) / 3600).toFixed(2); r.rules = out; r.progression = [];
    r.findings = bad.map((msg) => ({ kind: 'invariant', msg, n: 1 }));
    return r;
  },

  /** what 0.3 added, checked head-on: sizes, petting that mends, weather from the sky, legendary visits */
  async features() {
    const out = {}, bad = [];
    const need = (ok, msg) => { if (!ok) bad.push(msg); };
    // (the three helpers of 0.7 are already at home in these runs: their own visits are checked by tools/v07check.js, and here they would be counted as legendary visitors)
    const lead = (sim) => { const G = sim.G; G.save.helpers = { rotom: 1, mewtwo: 1, porygonz: 1 }; for (const sp of [25, 4, 7, 1, 16, 133]) G.save.team.push(sim.Mon.create(sp, 40, {})); G.syncTeam(); sim.run(4); };
    const quiet = { paused: true, weatherFreq: 0, legendEvents: 'off', shinyOdds: 100000 };

    // ---- 1. sizes
    {
      const sim = new Sim(await boot({ seed: SEED + 20, settings: quiet }), 'features'), G = sim.G, Size = sim.get('Size'), D = sim.DATA;
      const share = { S: 0, M: 0, L: 0, XL: 0 }, N = 40000;
      for (let i = 0; i < N; i++) share[Size.label({ sz: Size.roll() })]++;
      for (const k in share) share[k] = +(share[k] / N * 100).toFixed(1);
      out.sizeShare = share;
      need(share.S > 13 && share.S < 23 && share.M > 55 && share.M < 67 && share.L > 12 && share.L < 21 && share.XL > 3 && share.XL < 7, `size classes are off: ${JSON.stringify(share)}`);
      // every species, drawn to scale: within the floor and the cap, and in step with its real height
      const min = Math.min(W, H), rows = [];
      for (const id of Object.keys(D.dex).map(Number)) {
        const r = sim.get('Sprites').resolve(id, false, false); if (!r) continue;
        const d = sim.dom.Image.sizeOf(r.front); if (!d) continue;
        const m = { sp: id, sz: 127 }, k = Size.spriteScale(m, d[0], d[1], !!r.padded, 'true', 1, min), wide = d[0] / d[1] >= Size.DRAW.wide;
        rows.push({ id, h: Size.speciesMetres(id), ref: (wide ? d[0] : d[1]) * (r.padded ? Size.DRAW.paddedFill : 1) * k, px: d[1] * k });
      }
      const lo = Size.DRAW.floor - 0.5, hi = Size.DRAW.cap * min + 0.5, mid = rows.filter((r) => r.ref > lo + 2 && r.ref < hi - 2);
      const off = mid.filter((r) => Math.abs(r.ref / r.h - Size.DRAW.ppm) > 1.5);
      out.sizeDisplay = { species: rows.length, toScale: mid.length, atFloor: rows.filter((r) => r.ref <= lo + 2).length, atCap: rows.filter((r) => r.ref >= hi - 2).length, pixelsPerMetre: Size.DRAW.ppm };
      need(rows.length > 20, 'no sprites to measure');
      need(!rows.some((r) => r.ref < lo || r.ref > hi), 'a species is drawn below the floor or above the cap');
      need(!off.length, `${off.length} species are not drawn to scale (first: #${off[0] && off[0].id})`);
      const by = (id) => rows.find((r) => r.id === id);
      if (by(595) && by(321) && by(25) && by(95)) need(by(321).ref > by(595).ref * 5 && by(95).px > by(25).px * 3, 'Wailord and Onix should dwarf Joltik and Pikachu');
      // an Extra large individual is drawn larger than a Small one of the same species, in every mode
      for (const mode of ['true', 'balanced', 'sprite']) {
        const small = Size.spriteScale({ sp: 25, sz: 10 }, 60, 60, false, mode, 2, min), big = Size.spriteScale({ sp: 25, sz: 250 }, 60, 60, false, mode, 2, min);
        need(big > small * 1.5, `mode ${mode}: an Extra large Pikachu is not clearly larger than a Small one`);
      }
      // the three modes on a live actor
      G.save.team.push(sim.Mon.create(6, 40, { sz: 127 })); G.syncTeam(); sim.run(3);
      const onix = sim.team()[0], hTrue = onix.h;
      sim.set({ sizeMode: 'sprite' }); sim.run(0.5); const hSprite = onix.h;
      sim.set({ sizeMode: 'balanced' }); sim.run(0.5); const hBal = onix.h;
      out.charizardPixelsAt2x = { toScale: Math.round(hTrue), balanced: Math.round(hBal), sprite: Math.round(hSprite) };
      need(hTrue > hBal && hBal > 0 && hSprite > 0 && hTrue !== hSprite, 'the size mode setting does not change how a team member is drawn');
      for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
    }
    // an old save gains sizes, and the same ones every time it is loaded
    {
      const old = { v: 1, team: [{ uid: 'old1', sp: 25, lvl: 20, nat: 3, iv: [1, 2, 3, 4, 5, 6], moves: [84], hp: 20, aff: 10 }, { uid: 'old2', sp: 143, lvl: 30, nat: 3, iv: [1, 2, 3, 4, 5, 6], moves: [33], hp: 20, mark: 'jumbo-mark' }], box: [{ uid: 'old3', sp: 10, lvl: 5, nat: 1, iv: [0, 0, 0, 0, 0, 0], moves: [33], hp: 5, mark: 'mini-mark' }] };
      const a = (await boot({ seed: 1, save: JSON.parse(JSON.stringify(old)), settings: quiet })).G.save, b = (await boot({ seed: 99, save: JSON.parse(JSON.stringify(old)), settings: quiet })).G.save;
      const sz = (sv) => [...sv.team, ...sv.box].map((m) => m.sz);
      out.oldSaveSizes = sz(a);
      need(a.team.length === 2 && a.box.length === 1, 'an old save lost Pokémon on load');
      need(sz(a).every((v) => v >= 0 && v <= 255) && sz(a).join() === sz(b).join(), 'old Pokémon do not get a stable size');
      need(a.team[1].sz === 255 && a.box[0].sz === 0, 'Jumbo and Mini marks should become the largest and smallest sizes');
    }

    // ---- 2. petting mends a little, and stops a second after the last pet
    {
      const sim = new Sim(await boot({ seed: SEED + 21, settings: quiet }), 'features'), G = sim.G, Mon = sim.Mon;
      lead(sim);
      const a = sim.team()[0], mh = Mon.maxHp(a.mon);
      const inFight = () => { G.lastBattle = G.now; };                      // as in a fight: the usual rest-and-recover is off
      a.mon.hp = Math.floor(mh / 2);
      sim.run(5, { onStep: inFight }); const idle = a.mon.hp - Math.floor(mh / 2);
      const h0 = a.mon.hp; let pets = 0;
      const task = sim.every(0.5, () => { G.pet(a); pets++; }, 0);
      sim.run(10, { onStep: inFight }); const gained = a.mon.hp - h0;
      sim.tasks.splice(sim.tasks.indexOf(task), 1);
      const lastPet = sim.t;
      sim.run(1.2, { onStep: inFight }); const h1 = a.mon.hp;
      sim.run(6, { onStep: inFight }); const after = a.mon.hp - h1;
      out.petHeal = { maxHp: mh, pets, gainedIn10s: gained, share: +(gained / mh).toFixed(3), withoutPetting: idle, afterStopping: after, stoppedWithin: +(sim.t - lastPet - 6).toFixed(1) };
      need(idle === 0, 'the check is flawed: health came back without petting');
      need(gained >= 1 && gained <= mh * 0.2, `petting for 10 s mended ${gained} of ${mh} HP: it should be a little, not nothing and not a lot`);
      need(after === 0, `health kept coming back ${after} HP more than a second after the last pet`);
      a.mon.hp = mh; G.pet(a); sim.run(2, { onStep: inFight });
      need(a.mon.hp === mh, 'petting pushed health over the maximum');
      for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
    }

    // ---- 3. weather from the sky
    {
      const count = async (weatherFreq, hours) => {
        const sim = new Sim(await boot({ seed: SEED + 22, settings: Object.assign({}, quiet, { weatherFreq }) }), 'features'), G = sim.G;
        lead(sim);
        const hp = () => sim.team().reduce((s, t) => s + t.mon.hp, 0), full = hp();
        let n = 0, natural = 0, shortest = 1e9, lost = 0, kinds = new Set(), cur = null, t0 = 0;
        sim.run(hours * 3600, { render: 0, dt: 1 / 20, onStep: (s) => {
          const w = G.weather;
          if (w && w !== cur) { n++; kinds.add(w.kind); if (w.natural) natural++; t0 = s.t; }
          if (!w && cur) shortest = Math.min(shortest, s.t - t0);
          cur = w; lost = Math.max(lost, full - hp());
        } });
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
        return { spells: n, natural, kinds: [...kinds].sort(), shortestSeconds: n ? Math.round(shortest) : null, healthLost: lost, label: sim.get('Events').weatherLabel(weatherFreq) };
      };
      const never = await count(0, 2), often = await count(10, 2), mild = await count(3, 6);
      out.weather = { off: never, max: often, default: mild };
      need(never.spells === 0, 'weather started although the slider is at Never');
      need(often.spells >= 25 && often.natural === often.spells, `slider at maximum: ${often.spells} spells of weather in two hours`);
      need(mild.spells >= 4 && mild.spells <= 40, `default slider: ${mild.spells} spells of weather in six hours`);
      need(often.shortestSeconds >= 55, `a spell of weather lasted only ${often.shortestSeconds} s`);
      need(often.healthLost === 0, `weather from the sky cost the resting team ${often.healthLost} HP`);
      need(often.kinds.length >= 4, 'hardly any variety in the weather');
    }

    // ---- 4. legendary visits
    {
      const Ev = (sim) => sim.get('Events');
      const visit = async (kind, sp, seed, extra) => {
        const sim = new Sim(await boot({ seed, settings: Object.assign({}, quiet, { paused: false, maxWild: 1, spawnEvery: 600, battleStyle: 'ko' }, extra || {}) }), 'features'), G = sim.G;
        lead(sim); G.nextSpawn = 1e9;
        sim.cmd({ type: 'event', kind, sp });
        sim.run(6);
        return { sim, G, a: sim.wilds().find((w) => w.ev) || null };
      };
      const res = {};
      // friendly: nobody hurts it, it hurts nobody, petting earns trust, a gift and a better catch chance
      {
        const { sim, G, a } = await visit('friendly', 716, SEED + 30);
        need(!!a && a.ev.kind === 'friendly', 'the friendly visit did not start');
        if (a) {
          let targeted = 0, hits = 0, teamHurt = 0;
          const full = sim.Mon.maxHp(a.mon), hurt = G.hurt;
          G.hurt = function (t, dmg, src) { const d = hurt.apply(this, arguments); if (d > 0 && t === a) hits++; if (d > 0 && t.side === 'team') teamHurt++; return d; };
          const before = Ev(sim).catchMult(a);
          sim.every(1.4, () => { if (!a.gone && a.ev) sim.clickActor(a, 0, 2); }, 0);
          sim.run(40, { onStep: (s) => { if (s.team().some((t) => t.target === a)) targeted++; } });
          res.friendly = { species: sim.Mon.name(a.mon), trust: a.ev ? a.ev.trust : null, catchBonus: [+before.toFixed(1), a.ev ? +Ev(sim).catchMult(a).toFixed(1) : null], hitsTaken: hits, teamTargetedIt: targeted, teamHurt, hp: `${a.mon.hp}/${full}`, gift: sim.ev.itemDrops || 0 };
          need(hits === 0 && targeted === 0 && teamHurt === 0 && a.mon.hp === full, `the friendly visitor was dragged into a fight (hit ${hits}x, targeted ${targeted}x, team hurt ${teamHurt}x)`);
          need(a.ev && a.ev.trust >= 10 && Ev(sim).catchMult(a) > before * 10, 'petting the friendly visitor did not earn its trust');
          need((sim.ev.itemDrops || 0) >= 1, 'the friendly visitor never left a gift');
        }
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
      }
      // evasive: runs from the pointer, tires, and is then far easier to catch
      {
        const { sim, G, a } = await visit('evasive', 380, SEED + 31, { autoBattle: false });
        need(!!a && a.ev.kind === 'evasive', 'the evasive visit did not start');
        if (a) {
          let dashes = 0, tired = 0, fled = 0, tries = 0, tiredBonus = 0, freshBonus = Ev(sim).catchMult(a), wasTired = false, attacks = 0;
          const pos = () => ({ x: a.x, y: a.y - a.h * 0.5 });
          sim.every(0.7, () => {                              // the player keeps putting the pointer right on it
            if (a.gone || !a.ev) return;
            const p = pos(); tries++; sim.move(p.x, p.y); sim._at = { x: p.x, y: p.y, t: sim.t, tired: a.ev.tired > 0 };
          }, 0);
          sim.run(45, { onStep: (s) => {
            if (a.gone || !a.ev) return;
            if (a.busy) attacks++;
            if (a.ev.tired > 0 && !wasTired) { tired++; tiredBonus = Ev(s).catchMult(a); }
            wasTired = a.ev.tired > 0;
            const at = s._at;
            if (at && !at.done && s.t - at.t > 0.6) { at.done = true; if (!at.tired) { dashes++; if (Math.hypot(a.x - at.x, a.y - a.h * 0.5 - at.y) > 150) fled++; } }
          } });
          res.evasive = { species: sim.Mon.name(a.mon), approaches: tries, gotAway: `${fled} of ${dashes}`, timesOutOfBreath: tired, catchBonus: { fresh: freshBonus, outOfBreath: tiredBonus }, attacks };
          need(dashes >= 10 && fled >= dashes * 0.8, `the evasive visitor only got away from the pointer ${fled} of ${dashes} times`);
          need(tired >= 2 && tiredBonus > freshBonus * 2, 'the evasive visitor never tired, or tiring does not help the catch');
          need(attacks === 0, 'the evasive visitor attacked');
        }
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
      }
      // aggressive: a boss that goes for the team
      {
        const { sim, G, a } = await visit('aggressive', 383, SEED + 32);
        need(!!a && a.ev.kind === 'aggressive' && a.mon.hpx >= 3, 'the aggressive visit did not start as a boss');
        if (a) {
          let dealt = 0; const hurt = G.hurt;
          G.hurt = function (t, dmg, src) { const d = hurt.apply(this, arguments); if (d > 0 && src === a) dealt += d; return d; };
          sim.run(40);
          res.aggressive = { species: sim.Mon.name(a.mon), level: a.mon.lvl, teamLevel: 40, damageDealt: dealt, hp: `${a.mon.hp}/${sim.Mon.maxHp(a.mon)}`, state: a.gone ? 'gone' : a.state };
          need(dealt > 0, 'the aggressive visitor never attacked the team');
        }
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
      }
      // every kind can be caught: a ball is accepted, and a catch puts it on the team or in the Box and ends the visit
      res.catchable = {};
      for (const [kind, sp] of [['friendly', 249], ['evasive', 245], ['aggressive', 150]]) {
        const { sim, G, a } = await visit(kind, sp, SEED + 33, { autoBattle: false });
        if (!a) { bad.push(`${kind}: no visitor to catch`); continue; }
        const Mon = sim.Mon, roll = Mon.rollCatch; let throws = 0, natural = null;
        Mon.rollCatch = function () { const n = roll.apply(this, arguments); if (natural === null) natural = n; return 4; };
        const uid = a.mon.uid;
        sim.every(0.4, () => { if (!a.gone && a.side === 'wild' && !a.balled) { G.throwBall(a); if (a.balled) throws++; } }, 0);
        sim.run(12);
        const got = [...G.save.team, ...G.save.box].some((m) => m.uid === uid);
        res.catchable[kind] = { species: D_name(sim, sp), ballAccepted: throws > 0, caught: got, visitOver: !Ev(sim).active(), legendsCaught: G.save.stats.legend };
        need(throws > 0 && got && !Ev(sim).active() && G.save.stats.legend >= 1, `${kind}: the visitor could not be caught (throws ${throws}, caught ${got})`);
        need(![...G.save.team, ...G.save.box].some((m) => m.hpx), `${kind}: a caught visitor kept its boss health`);
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
      }
      // how often they come, left to themselves
      const tally = async (legendEvents, hours) => {
        const sim = new Sim(await boot({ seed: SEED + 34, settings: Object.assign({}, quiet, { paused: false, legendEvents, spawnEvery: 60 }) }), 'features');
        lead(sim);
        const kinds = {}; let was = null;
        sim.run(hours * 3600, { render: 0, dt: 1 / 20, onStep: (s) => { const v = Ev(s).view(), id = v ? v.kind + v.sp : null; if (id && id !== was) kinds[v.kind] = (kinds[v.kind] || 0) + 1; was = id; } });
        for (const f of sim.findings) bad.push(`${f.kind}: ${f.msg}`);
        return { visits: sim.G.save.stats.visits || 0, perHour: +((sim.G.save.stats.visits || 0) / hours).toFixed(2), kinds };
      };
      res.frequency = { off: await tally('off', 3), rare: await tally('rare', 12), often: await tally('often', 4) };
      need(res.frequency.off.visits === 0, 'a legendary visited although visits are off');
      need(res.frequency.rare.visits >= 3 && res.frequency.rare.visits <= 25, `rare: ${res.frequency.rare.visits} visits in twelve hours`);
      need(res.frequency.often.visits >= 10, `often: ${res.frequency.often.visits} visits in four hours`);
      out.visits = res;
    }
    const sim = new Sim(await boot({ seed: SEED, settings: quiet }), 'features');
    const r = sim.report();
    r.persona = 'features'; r.simHours = 39.5; r.features = out; r.progression = []; r.team = undefined; r.events = undefined; r.stats = undefined; r.perHour = undefined; r.maxima = undefined;
    r.findings = bad.map((msg) => ({ kind: 'invariant', msg, n: 1 }));
    return r;
  },
};
const D_name = (sim, sp) => sim.DATA.dex[sp].n;

// ------------------------------------------------------------------ run
async function main() {
  const list = which === 'all' ? ['rules', 'features', 'oldman', 'child', 'nerd', 'slowmo'] : [which];
  const out = [];
  let failed = false;
  for (const name of list) {
    if (!PERSONAS[name]) { console.error('unknown playtest: ' + name); process.exit(2); }
    const t0 = Date.now();
    const len = opt(name === 'slowmo' ? 'seconds' : 'hours', undefined);
    const r = await PERSONAS[name](len === undefined ? undefined : +len);
    r.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    if (opt('save-out', '') && r._save) fs.writeFileSync(opt('save-out', ''), r._save);
    delete r._save;
    out.push(r);
    const hard = r.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant' || f.kind === 'persona');
    if (hard.length) failed = true;
    if (!flag('quiet')) {
      console.log(`\n=== ${name}: ${r.simHours} h simulated in ${r.wallSeconds} s — ${hard.length ? hard.length + ' ERRORS' : 'no errors'}${r.findings.length - hard.length ? ', ' + (r.findings.length - hard.length) + ' visual findings' : ''}`);
      for (const [k, v] of Object.entries(r)) if (!['progression', 'findings', 'persona', 'simHours', 'wallSeconds'].includes(k) && v !== undefined) console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`.slice(0, 900));
      if (r.progression.length) console.log('progression:', r.progression.map((p) => `${(p.t / 3600).toFixed(1)}h team${p.team} avgL${p.avg} max${p.max} sp${p.species} box${p.box}`).join(' | '));
      for (const f of r.findings.slice(0, 30)) console.log(`  [${f.kind}] x${f.n} @${f.first === undefined ? '' : f.first + 's'} ${f.msg}`);
    }
  }
  const file = opt('json', '');
  if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
  process.exit(failed ? 1 : 0);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
module.exports = { boot, Sim, PERSONAS };
