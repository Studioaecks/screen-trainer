// Screen Trainer — the Android app's stand-in for the main process.
//
// On the PC, main.js keeps the settings and the save, tells the overlay where the pointer is, and passes messages
// between the overlay and the Pokédex window. In the exported app there is one page (android.html) in a web view, so
// this file plays that part: it gives the game the same window.st it has on the PC.
//
//   options     assets/app/locked.json holds the options as they were on the PC at export time. They are the
//               starting point only: since 0.6 every option can be changed in the app (the owner's wish) and is
//               remembered on the device (settings.json). A newer export brings its own options along once.
//               PHONE_FIXED lists the few that mean nothing on a phone; they keep one value.
//   save        kept by the shell in the app's own folder (AndroidHost, see android/src/.../Host.java). An export
//               that brought a save along replaces the device's progress once, when that export is first started.
//   Pokédex     the same panel.html, in a frame; stForPanel() is the window.st it gets.
//   touch       tap = click; finger down on a team Pokémon and move = drag it (no waiting, and holding first is fine);
//               long press on a wild Pokémon = throw a ball. A finger is blunt, so a touch that misses by a little
//               still finds the nearest Pokémon (REACH).
//   screen off  the game's loop is driven by the screen's refresh, which stops when the screen is off. keepGoing()
//               carries the game on from a timer then; the shell's Keep service stops Android from putting the
//               app to sleep (setting bgTrain).
//   Mewtwo      stands on the field as on the PC; a tap opens a small sheet about this device (battery, storage).
//   the field   drawn behind the game by src/field.js, from the species in the save, as in the field window.
//
// Without AndroidHost (the page opened in a desktop browser, as the checks do) the browser's own storage is used.
'use strict';

(() => {
  const host = window.AndroidHost || null, $ = (id) => document.getElementById(id);
  // what means nothing on a phone keeps one value; everything else is the owner's to change
  const PHONE_FIXED = { field: false, autoStart: false, visible: true, alwaysOnTop: true, display: 0, spritesPath: '', hotkey: '', firstRun: false, contrast: 'own' };
  const DEF = window.STDefaults || null;                                       // defaults.js: the same range checks as on the PC
  const DEX = { w: 640, h: 720, box: 436 };                                   // the Pokédex device's own size (as in main.js)
  const store = {
    read(name) { try { return (host ? host.read(name) : localStorage.getItem('st:' + name)) || ''; } catch (e) { return ''; } },
    write(name, text) { try { if (host) return !!host.write(name, text); localStorage.setItem('st:' + name, text); return true; } catch (e) { return false; } },
    json(name, def) { try { const t = this.read(name); return t ? JSON.parse(t) : def; } catch (e) { return def; } },
  };
  const packed = async (file, binary) => { try { const r = await fetch(file, { cache: 'no-store' }); if (!r.ok) return null; return binary ? new Uint8Array(await r.arrayBuffer()) : await r.json(); } catch (e) { return null; } };
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const game = {}, panel = {};                             // listeners of the game page and of the Pokédex frame, by channel
  const on = (set, ch) => (fn) => { set[ch] = fn; };
  const tell = (set, ch, v) => { if (typeof set[ch] === 'function') { try { set[ch](v); } catch (e) { console.error('[Screen Trainer]', e); } } };
  let settings = {}, locked = { settings: {}, version: '', exported: '', hasSave: false, hasBank: false }, sprites = { ok: false, idx: {}, extra: {} }, boxOpen = false;

  let packedGens = [];
  /** every option through the PC's own range checks, then the phone's fixed ones, then only generations whose pictures were packed */
  function tidy(raw) {
    let o = Object.assign({}, raw);
    if (DEF) { try { const clean = DEF.sanitize(o, window.innerHeight); o = {}; for (const k in DEF.DEFAULTS) o[k] = clean[k]; } catch (e) { /* keep what there is */ } }
    Object.assign(o, PHONE_FIXED);
    if (packedGens.length) { const g = (o.gens || []).filter((n) => packedGens.includes(n)); o.gens = g.length ? g : packedGens.slice(); }
    return o;
  }
  async function init() {
    locked = (await packed('locked.json')) || locked;
    sprites = (await packed('sprites.json')) || sprites;
    packedGens = Array.isArray(locked.gens) && locked.gens.length ? locked.gens.slice() : ((locked.settings || {}).gens || []).slice();
    const fresh = store.json('meta.json', {}).seed !== locked.exported;        // this export is started for the first time
    const kept = fresh ? {} : store.json('settings.json', {});
    const old = fresh ? {} : store.json('switches.json', {});                  // what an app from before 0.6 remembered
    settings = tidy(Object.assign({}, locked.settings, old, kept));
    settings.boxOpen = false;
    let save = store.json('save.json', null);
    if (fresh) {                                                               // a new export: its options take over once, and its save if it brought one
      if (locked.hasSave) { const brought = await packed('save.json'); if (brought) { save = brought; store.write('save.json', JSON.stringify(brought)); } }
      store.write('settings.json', JSON.stringify(settings));
      store.write('meta.json', JSON.stringify({ seed: locked.exported }));
    }
    $('dexKey').hidden = false;
    for (const ms of [60, 600]) setTimeout(() => drawField(false), ms);      // the game has the save by then: the field is grown from it
    keep();
    return { settings: copy(settings), sprites, save, version: locked.version, field: null };
  }
  /** change options. Everything may change; the result is checked like on the PC and remembered on the device */
  async function setSettings(patch) {
    if (!patch || typeof patch !== 'object') return copy(settings);
    const next = tidy(Object.assign({}, settings, patch));
    if (JSON.stringify(next) !== JSON.stringify(settings)) {
      settings = next;
      const keepIt = Object.assign({}, settings); delete keepIt.boxOpen;
      store.write('settings.json', JSON.stringify(keepIt));
      tell(game, 'settings', copy(settings)); tell(panel, 'settings', copy(settings));
      keep();
    }
    return copy(settings);
  }
  /** tell the shell whether the game should carry on with the screen off (it starts or stops its Keep service) */
  function keep() { try { if (host && host.keep && mode !== 'dream') host.keep(settings.bgTrain !== false); } catch (e) { /* an older shell: the timer below still helps */ } }
  const mode = (/[?&]mode=(\w+)/.exec(location.search) || [])[1] || 'app';

  // ---- the game page's window.st (the same calls preload.js offers on the PC)
  window.st = {
    init, hover() {}, save: (json) => { store.write('save.json', String(json)); }, openGuardian: () => openGuard(),
    sendState: (s) => { tell(panel, 'state', s); drawField(false); },
    openPanel: (tab) => openDex(tab),
    soundBank: async () => (locked.hasBank ? packed('sounds.stbank', true) : null),
    onSettings: on(game, 'settings'), onSprites: on(game, 'sprites'), onCursor: on(game, 'cursor'), onCmd: on(game, 'cmd'), onStateRequest: on(game, 'stateRequest'),
    onSound: on(game, 'sound'), onSoundBank: on(game, 'bank'), onGuardian: on(game, 'guardian'), onField: on(game, 'field'),
    getSettings: async () => copy(settings), setSettings,
  };

  // ---- the Pokédex frame's window.st (panel.html asks for it through window.parent.stForPanel)
  window.stForPanel = (win) => {
    win.addEventListener('DOMContentLoaded', () => {       // what makes no sense in the app is taken off the device
      const d = win.document;
      for (const sel of ['#streamKey', '#winMin']) { const el = d.querySelector(sel); if (el) el.hidden = true; }      // MyStream is a PC studio; there is nothing to minimise
    });
    return {
      getSettings: async () => copy(settings), setSettings, openGuardian: () => { closeDex(); openGuard(); },
      info: async () => ({ api: 4, packedGens: packedGens.slice(), version: locked.version, packaged: true, android: true, host: 'android', windows: false, saveDir: 'this device', spritesPath: 'packed into the app', spritesOk: !!sprites.ok,
        bank: locked.hasBank ? { file: 'packed into the app', source: 'packed' } : null, fieldOpen: false, displays: [{ i: 0, label: 'This device' }],
        spriteSets: { showdown: !!(sprites.idx || {})['pokemon/other/showdown'], bw: !!(sprites.idx || {})['pokemon/versions/generation-v/black-white/animated'], static: !!(sprites.idx || {}).pokemon } }),
      sprites: async () => sprites,
      requestState: (full) => tell(game, 'stateRequest', !!full), onState: on(panel, 'state'), onTab: on(panel, 'tab'), onSettings: on(panel, 'settings'),
      cmd: (c) => tell(game, 'cmd', c), sound: (name) => tell(game, 'sound', String(name)),
      pickSprites: async () => ({ ok: false, canceled: true }), importRom: async () => ({ ok: false, canceled: true }), removeBank: async () => ({ ok: false }),
      panelBox: (open) => { boxOpen = !!open; fitDex(); }, winMinimize: closeDex, winClose: closeDex, quit() {},
    };
  };
  const wrap = $('dexWrap'), frame = $('dexFrame');
  function fitDex() {
    const w = DEX.w + (boxOpen ? DEX.box : 0), k = Math.min(window.innerWidth / w, window.innerHeight / DEX.h, 1.6);
    frame.style.width = w + 'px'; frame.style.height = DEX.h + 'px'; frame.style.transform = `scale(${k.toFixed(4)})`;
    frame.style.margin = `${Math.round((DEX.h * k - DEX.h) / 2)}px ${Math.round((w * k - w) / 2)}px`;      // the frame keeps its own size in the layout; the margins take the difference
  }
  function openDex(tab) {
    tab = { team: 'party', box: 'party', settings: 'options' }[tab] || tab || 'dex';
    if (!frame.getAttribute('src')) frame.setAttribute('src', 'panel.html#' + tab); else tell(panel, 'tab', tab);
    wrap.hidden = false; fitDex();
    tell(game, 'sound', 'open');
  }
  function closeDex() { wrap.hidden = true; }
  $('dexKey').addEventListener('click', () => (wrap.hidden ? openDex() : closeDex()));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDex(); });
  window.addEventListener('resize', () => { fitDex(); drawField(true); });
  /** the shell asks: Back was pressed. true = it closed something here */
  window.stBack = () => { if (!$('guardWrap').hidden) { closeGuard(); return true; } if (!wrap.hidden) { closeDex(); return true; } return false; };
  /** the shell says: the app is going to the background. The save is written now */
  window.stPause = () => tell(game, 'cmd', { type: 'flush' });
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.stPause(); });

  // ---- the field behind the game
  const typesOf = (sp) => (DATA.dex[sp] ? DATA.dex[sp].t.map((t) => DATA.types[t]) : []);
  let fieldSig = '';
  function drawField(force) {
    const caught = typeof G !== 'undefined' && G.save ? G.save.dex.caught : {}, sig = Object.keys(caught).join(',') + '|' + window.innerWidth + 'x' + window.innerHeight;
    if (!force && sig === fieldSig) return;
    fieldSig = sig;
    Field.draw($('field'), Field.plan(caught, typesOf), window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  }
  drawField(true);

  // ---- touch
  // Team Pokémon, Mewtwo, items and the ball button get the finger exactly as the PC gets the mouse button: down at
  // once, moves as they come, up at the end. (Before 0.6 a drag only began after the finger had moved, by picking
  // again at the first spot, and holding still for a moment opened the team page instead: on a real phone, where a
  // drag starts with a hold and the Pokémon keeps walking, that meant dragging did not work.)
  // Wild Pokémon: tap = click, long press = throw a ball.
  const LONG = 480, SLOP = 12, REACH = 26;
  let touch = null;
  const at = (t) => [t.clientX - G.vx, t.clientY - G.vy];
  const mine = (e) => { for (const t of e.changedTouches) if (touch && t.identifier === touch.id) return t; return null; };
  /** what is under the finger: exactly, or else the nearest thing within REACH. Returns [hit, x, y] with the spot that hit */
  function reach(x, y) {
    let hit = G.pick(x, y);
    if (hit) return [hit, x, y];
    let best = null, bd = Infinity;
    for (let r = REACH / 2; r <= REACH && !best; r += REACH / 2) for (let i = 0; i < 8; i++) {
      const px = x + Math.cos(i * Math.PI / 4) * r, py = y + Math.sin(i * Math.PI / 4) * r, h = G.pick(px, py);
      if (h && r < bd) { best = [h, px, py]; bd = r; }
    }
    return best || [null, x, y];
  }
  window.addEventListener('touchstart', (e) => {
    if (e.target.closest && e.target.closest('.ui')) return;                   // the Pokédex key, the frame and Mewtwo's sheet handle their own touches
    e.preventDefault();
    if (touch || typeof G === 'undefined' || !G.save) return;
    const t = e.changedTouches[0], [x, y] = at(t), [hit, hx, hy] = reach(x, y);
    G.onMove(x, y);
    touch = { id: t.identifier, sx: x, sy: y, hx, hy, dx: hx - x, dy: hy - y, kind: 'none', held: false, long: false, timer: 0 };
    if (!hit) return;
    const wild = hit.kind === 'actor' && hit.actor.side === 'wild';
    if (wild) {
      touch.kind = 'wild';
      touch.timer = setTimeout(() => { if (touch && touch.kind === 'wild') { touch.long = true; G.onDown(touch.hx, touch.hy, 2); G.onUp(); } }, LONG);
    } else { touch.kind = 'hold'; touch.held = true; G.onDown(hx, hy, 0); }    // the finger is down on it: it is held from this moment
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    const t = mine(e);
    if (!t) return;
    e.preventDefault();
    const [x, y] = at(t);
    if (touch.kind === 'wild' && Math.hypot(x - touch.sx, y - touch.sy) > SLOP) clearTimeout(touch.timer);      // a swipe across a wild Pokémon is neither a tap nor a throw
    G.onMove(x + (touch.held ? touch.dx : 0), y + (touch.held ? touch.dy : 0));
  }, { passive: false });
  const lift = (e) => {
    const t = mine(e);
    if (!t) return;
    clearTimeout(touch.timer);
    const [x, y] = at(t);
    if (touch.held) G.onUp();
    else if (touch.kind === 'wild' && !touch.long && e.type === 'touchend' && Math.hypot(x - touch.sx, y - touch.sy) <= SLOP) { G.onDown(touch.hx, touch.hy, 0); G.onUp(); }
    touch = null;
  };
  window.addEventListener('touchend', lift); window.addEventListener('touchcancel', lift);
  window.stTouchState = () => (touch ? touch.kind : '');                       // for the checks

  // ---- carrying on with the screen off
  // The loop in game.js runs on requestAnimationFrame, which Android stops while nothing is shown. When no picture has
  // been drawn for a while, this timer moves the game forward by the time that really passed (nothing is drawn; the
  // save is written as usual). A hidden page's timers are slowed down by the engine, at worst to one a minute, so each
  // call makes up for all the time since the last one, up to CATCH_UP seconds.
  const CATCH_UP = 150, STEP = 0.1;
  let ranAt = performance.now();
  function keepGoing() {
    if (typeof G === 'undefined' || !G.save || !G.update) return;
    const now = performance.now(), seen = Math.max(G.frameAt || 0, ranAt);
    if (now - seen < 1500) return;                                             // the screen is drawing: the ordinary loop is at work
    if (settings.bgTrain === false || mode === 'dream') { ranAt = now; return; }
    let owed = Math.min(CATCH_UP, (now - seen) / 1000), n = 0;
    ranAt = now;
    try { for (; owed > 0; owed -= STEP, n++) G.update(STEP); } catch (e) { console.error('[Screen Trainer]', e); }
    window.stBackgroundSteps = (window.stBackgroundSteps || 0) + n;
  }
  setInterval(keepGoing, 1000);

  // ---- Mewtwo on this device: a sheet with what a page may know about the phone. Nothing leaves the device.
  const gw = $('guardWrap');
  const pctOf = (v) => Math.round(v * 100) + ' %', gb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.round(n / 1048576) + ' MB');
  let battery = null, warned = 0;
  async function readDevice() {
    const rows = [], advice = [];
    try { if (!battery && navigator.getBattery) battery = await navigator.getBattery(); } catch (e) { battery = null; }
    if (battery) {
      rows.push(['Battery', pctOf(battery.level) + (battery.charging ? ', charging' : ', on battery')]);
      if (!battery.charging && battery.level <= 0.2) advice.push('The battery is low. Plug in before a long training session.');
      else if (!battery.charging && settings.bgTrain !== false) advice.push('Training with the screen off uses the battery steadily. On a charger it can go on all night.');
    } else rows.push(['Battery', 'this device does not say']);
    try { const e = await navigator.storage.estimate(); if (e && e.quota) { rows.push(['Room for this app', gb(e.quota - (e.usage || 0)) + ' free']); if (e.quota - (e.usage || 0) < 50 * 1048576) advice.push('Storage is nearly full. The save is small, but Android itself needs room.'); } } catch (e) { /* not offered */ }
    if (navigator.deviceMemory) rows.push(['Memory', 'about ' + navigator.deviceMemory + ' GB']);
    if (navigator.hardwareConcurrency) rows.push(['Processor cores', String(navigator.hardwareConcurrency)]);
    rows.push(['Screen', `${window.innerWidth} x ${window.innerHeight}, ${(window.devicePixelRatio || 1).toFixed(1)}x`]);
    rows.push(['Screen off', settings.bgTrain !== false ? 'the team keeps training' + (host && host.keep ? '' : ' while Android lets the app run') : 'the game waits']);
    rows.push(['Save', store.read('save.json').length ? Math.max(1, Math.round(store.read('save.json').length / 1024)) + ' KB, kept on this device' : 'nothing yet']);
    rows.push(['Screen Trainer', (locked.version || '?') + (locked.exported ? ', exported ' + String(locked.exported).slice(0, 10) : '')]);
    rows.push(['Network', 'never used: the app answers everything from its own files']);
    if (!advice.length) advice.push('All is well here.');
    return { rows, advice };
  }
  const escText = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function openGuard() {
    gw.hidden = false;
    const d = await readDevice();
    $('guardRows').innerHTML = d.rows.map(([k, v]) => `<div><span>${escText(k)}</span><b>${escText(v)}</b></div>`).join('');
    $('guardSay').textContent = d.advice.join(' ');
  }
  function closeGuard() { gw.hidden = true; }
  gw.addEventListener('click', (e) => { if (e.target === gw || e.target.id === 'guardClose') closeGuard(); });
  /** Mewtwo speaks up by itself about the battery, at most every half hour (setting guardianAlerts) */
  setInterval(async () => {
    if (settings.guardian === false || settings.guardianAlerts === false || document.hidden || Date.now() - warned < 1800000) return;
    try { if (!battery && navigator.getBattery) battery = await navigator.getBattery(); } catch (e) { return; }
    if (battery && !battery.charging && battery.level <= 0.15) { warned = Date.now(); tell(game, 'guardian', { text: `Battery at ${pctOf(battery.level)}. I would plug in.`, tone: 'warn', seconds: 9 }); }
  }, 60000);
})();
