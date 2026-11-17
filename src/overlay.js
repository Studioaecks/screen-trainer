// Screen Trainer — overlay bootstrap: settings, save data, sound, input wiring, main loop.
'use strict';

(async () => {
  const st = window.st, $ = (id) => document.getElementById(id);
  const init = await st.init();

  let upgradeNote = null, helperNote = null;               // something a new version has to tell the owner of an older save, once
  /** read a save file, repairing anything missing or out of range (older saves gain the newer fields here) */
  function parseSave(raw) {
    try {
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || s.v !== 1 || !Array.isArray(s.team) || !Array.isArray(s.box)) return null;
      const fresh = G.newSave();
      const fix = (m) => {
        if (!m || !DATA.dex[m.sp] || !Array.isArray(m.iv) || m.iv.length !== 6) return null;
        m.lvl = U.clamp(m.lvl | 0, 1, 100); m.nat = U.clamp(m.nat | 0, 0, 24); m.bond = m.bond || {}; m.aff = U.clamp(m.aff | 0, 0, 255);
        m.moves = (m.moves || []).filter((id) => DATA.moves[id]).slice(0, 4);
        if (!m.moves.length) m.moves = Mon.movesAt(m.sp, m.lvl);
        if (m.mvKeep !== undefined) { m.mvKeep = Array.isArray(m.mvKeep) ? m.mvKeep.filter((id) => m.moves.includes(id)) : []; if (!m.mvKeep.length) delete m.mvKeep; }      // the moves the owner chose (0.9.5)
        delete m.hpx;                                   // only wild alphas carry the health bonus
        m.hp = U.clamp(m.hp | 0, 0, Mon.maxHp(m));
        if (!m.uid) m.uid = 'm' + Math.random().toString(36).slice(2);
        if (m.item && !Items.get(m.item)) m.item = null;
        if (m.rb && !Array.isArray(m.rb)) delete m.rb;
        // sizes arrived in 0.3: older Pokémon get one that never changes (alphas and Jumbo marks are Extra large, Mini marks tiny)
        if (!(m.sz >= 0 && m.sz <= 255)) m.sz = m.alpha || m.mark === 'alpha-mark' || m.mark === 'jumbo-mark' ? 255 : m.mark === 'mini-mark' ? 0 : Size.fromUid(m.uid);
        m.sz |= 0;
        return m;
      };
      s.team = s.team.map(fix).filter(Boolean).slice(0, 6);
      s.box = s.box.map(fix).filter(Boolean);
      // Pokémon staying at the Day Care on the MyStream field (src/stations.js, 0.6): at most two, an egg, and the time two have spent together
      { const d = s.daycare && typeof s.daycare === 'object' ? s.daycare : {}, inEgg = d.egg && d.egg.mon ? fix(d.egg.mon) : null; s.daycare = { mons: (Array.isArray(d.mons) ? d.mons : []).map(fix).filter(Boolean).slice(0, 2), t: Math.max(0, +d.t || 0), egg: inEgg ? { mon: inEgg } : null }; }
      // eggs being carried: the Pokémon inside, the seconds until it hatches, where it lies (src/game.js, "eggs")
      s.eggs = (Array.isArray(s.eggs) ? s.eggs : []).map((e) => { const m = e && e.mon ? fix(e.mon) : null; return m ? { mon: m, t: Math.max(0, +e.t || 0), x: +e.x || 0, y: +e.y || 0 } : null; }).filter(Boolean).slice(0, 6);
      s.dex = Object.assign(fresh.dex, s.dex || {});
      if (!s.dex.size || typeof s.dex.size !== 'object') s.dex.size = {};
      for (const m of [...s.team, ...s.box]) { const r = s.dex.size[m.sp]; s.dex.size[m.sp] = Array.isArray(r) ? [Math.min(r[0], m.sz), Math.max(r[1], m.sz)] : [m.sz, m.sz]; }     // smallest and largest owned
      s.stats = Object.assign(fresh.stats, s.stats || {});
      const bag = {};
      for (const k in s.bag || {}) { const n = Math.floor(+s.bag[k]); if (n > 0 && Items.get(k)) bag[k] = Math.min(n, 9999); }
      s.bag = bag;
      // Balls changed in 0.4: the Poké Ball is the standard ball and better ones are found in stacks. A save from before
      // gets, once, a stack of what its Pokédex had unlocked (Great Ball at 15 species, Ultra Ball at 40), so nothing is lost.
      if (!s.b2) {
        s.b2 = 1;
        const n = Object.keys(s.dex.caught || {}).length, gift = [];
        if (n >= 15 && Items.get('great-ball')) { bag['great-ball'] = Math.min(9999, (bag['great-ball'] || 0) + 50); gift.push('50 Great Balls'); }
        if (n >= 40 && Items.get('ultra-ball')) { bag['ultra-ball'] = Math.min(9999, (bag['ultra-ball'] || 0) + 50); gift.push('50 Ultra Balls'); }
        if (s.team.length || s.box.length) upgradeNote = { title: 'Balls work differently now', text: `The Poké Ball is your standard ball. Better balls are found in stacks of ${Items.BALL_STACK[0]} to ${Items.BALL_STACK[1]} and used until they run out.${gift.length ? ` For what your Pokédex had unlocked you got ${gift.join(' and ')}: equip them in the Bag.` : ''}`, icon: Sprites.item('poke-ball'), tone: 'info', dur: 12 };
      }
      s.bag = bag;
      s.ball = typeof s.ball === 'string' && bag[s.ball] ? s.ball : '';
      s.badges = s.badges && typeof s.badges === 'object' ? s.badges : {};
      // The three helpers arrived in 0.7 (src/events.js): Rotom, Mewtwo and Porygon-Z come by and are caught, and that opens
      // Optimize, the Guardian and MyStream. A save from before has not met them: they come by now, and the owner is told why
      // Mewtwo and two buttons are away for a moment.
      if (!s.helpers || typeof s.helpers !== 'object') {
        s.helpers = {};
        if (s.team.length || s.box.length) helperNote = { title: 'Three visitors are on their way', text: 'New in 0.7: Rotom, Mewtwo and Porygon-Z each come by in a moment, very large and friendly. Right-click each one to catch it with the first ball. Mewtwo then stands guard again, and their buttons (rotom, mewtwo, porygon-z) appear in the Field Dex.', icon: Sprites.icon(150), tone: 'info', dur: 14 };
      }
      for (const k of Object.keys(s.helpers)) if (!['rotom', 'mewtwo', 'porygonz'].includes(k) || !(+s.helpers[k] > 0)) delete s.helpers[k];
      s.gymRetry = s.gymRetry | 0;
      return s;
    } catch (e) { return null; }
  }

  G.world = $('world'); G.screenLayer = $('screen');
  FX.init($('ground'), $('top'));
  Notify.init($('toasts'));
  // ---- the world and the screen. The world (#root) is where the game happens: the whole screen, or the inside of the
  // field window while that is open (G.view, its rectangle on this screen). Mewtwo and the notification cards are on
  // the screen (#screen) and stay put either way.
  const root = $('root');
  const rect = (r) => (r && r.w >= 160 && r.h >= 120 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null);
  // The field window's camera (0.7). In the field window the world is at least as large as the MyStream stage, so that
  // Fountain Square fits (src/square.js), and it is seen through a camera: G.cam = { x, y, z }, the world point in the
  // view's top left corner and the zoom. The zoom is one of the levels allowed in Options (zoomLevels); the wheel over
  // the field steps through them and dragging the grass moves the camera (field.html sends both: st.onFieldCam).
  // #root stays the view's rectangle and cuts off what lies outside; its children carry the camera as a transform.
  const levels = () => { const l = (G.set && Array.isArray(G.set.zoomLevels) ? G.set.zoomLevels : []).map(Number).filter((z) => z >= 0.25 && z <= 4).sort((a, b) => a - b); return l.length ? l : [1]; };
  const level = (z) => levels().reduce((b, x) => (Math.abs(x - z) < Math.abs(b - z) ? x : b), levels()[0]);
  function clampCam() {
    const c = G.cam, v = G.view;
    if (!c || !v) return;
    const vw = v.w / c.z, vh = v.h / c.z;                  // how much of the world the view shows
    c.x = vw >= G.W ? (G.W - vw) / 2 : U.clamp(c.x, 0, G.W - vw); c.y = vh >= G.H ? (G.H - vh) / 2 : U.clamp(c.y, 0, G.H - vh);
  }
  let viewSig = '';
  function layout() {
    G.SW = window.innerWidth; G.SH = window.innerHeight;
    const v = G.view, cam = !!v && typeof Square !== 'undefined' && !(document.body && document.body.classList && document.body.classList.contains('stage'));
    G.vx = v ? v.x : 0; G.vy = v ? v.y : 0;
    if (cam) {
      const big = !G.set || G.set.fieldSquare !== false, at = +(G.set && G.set.fieldZoomAt) || 0;
      G.W = Math.max(big ? Square.MAP.w : 0, v.w); G.H = Math.max(big ? Square.MAP.h : 0, v.h);
      // never zoomed yet: start as far out as the allowed levels go, but no further than the field filling the window
      const fill = Math.max(v.w / G.W, v.h / G.H), far = levels().find((x) => x >= fill - 1e-6), z = at > 0 ? level(at) : far || levels()[levels().length - 1];
      if (!G.cam) G.cam = { x: (G.W - v.w / z) / 2, y: (G.H - v.h / z) / 2, z };      // a new field: look at its middle
      else if (G.cam.z !== z) { const mx = G.cam.x + v.w / G.cam.z / 2, my = G.cam.y + v.h / G.cam.z / 2; G.cam.z = z; G.cam.x = mx - v.w / z / 2; G.cam.y = my - v.h / z / 2; }      // another zoom: the middle stays put
      clampCam();
    } else { G.cam = null; G.W = v ? v.w : G.SW; G.H = v ? v.h : G.SH; }
    root.style.left = G.vx + 'px'; root.style.top = G.vy + 'px'; root.style.width = (v ? v.w : G.W) + 'px'; root.style.height = (v ? v.h : G.H) + 'px';
    root.classList.toggle('field', !!v);
    FX.resize(G.W, G.H, Math.min(window.devicePixelRatio || 1, 1.5));
    applyCam();
    if (G.set && G.set.scale) Mewtwo.apply(G.set);
    if (G.save && typeof Square !== 'undefined') Square.sync();      // Fountain Square comes and goes with the field window
  }
  /** the camera as it is now: onto the page, and to the field window, which draws the ground the same way */
  function applyCam() {
    const c = G.cam, t = c ? `translate(${(-c.x * c.z).toFixed(2)}px, ${(-c.y * c.z).toFixed(2)}px) scale(${c.z})` : '';
    for (const el of root.children || []) if (el.id !== 'stTrade' && el.style) { el.style.transformOrigin = '0 0'; el.style.transform = t; }
    if (c && ptr) { const w = G.toWorld(ptr.x, ptr.y); G.cursor.x = w[0]; G.cursor.y = w[1]; }
    const sig = c ? [G.W, G.H, c.x.toFixed(1), c.y.toFixed(1), c.z].join(',') : '';
    if (sig !== viewSig && st.fieldView) { viewSig = sig; st.fieldView(c ? { W: G.W, H: G.H, x: c.x, y: c.y, z: c.z, levels: levels() } : null); }
    if (G.applyCovers) G.applyCovers();                     // (the cut-away parts are in the world: they move with the camera, 0.9.3)
  }
  G.applyCam = applyCam;                                     // (a layer added to the world later asks for the camera: src/boxfield.js)
  let ptr = null, zoomSaveT = 0;                             // where the pointer is on the screen
  /** the field window says: the grass was dragged ({ pan: [dx, dy] } in screen pixels) or the wheel turned ({ zoom: 1 | -1, at: [x, y] } in the view) */
  function onFieldCam(m) {
    const c = G.cam, v = G.view;
    if (!c || !v || !m) return;
    if (Array.isArray(m.pan)) { c.x -= (+m.pan[0] || 0) / c.z; c.y -= (+m.pan[1] || 0) / c.z; clampCam(); applyCam(); return; }
    if (m.zoom) {
      const l = levels(), i = l.indexOf(level(c.z)), z = l[U.clamp(i + (m.zoom > 0 ? 1 : -1), 0, l.length - 1)];
      if (z === c.z) return;
      const ax = Array.isArray(m.at) ? U.clamp(+m.at[0] || 0, 0, v.w) : v.w / 2, ay = Array.isArray(m.at) ? U.clamp(+m.at[1] || 0, 0, v.h) : v.h / 2;
      const wx = c.x + ax / c.z, wy = c.y + ay / c.z;      // the world point under the pointer stays under it
      c.z = z; c.x = wx - ax / z; c.y = wy - ay / z;
      clampCam(); applyCam();
      FX.text(G.W / 2, c.y + 40 / z, Math.round(z * 100) + '%', { col: '#ffffff', size: Math.round(15 / z), dur: 0.9, vy: 0 });
      clearTimeout(zoomSaveT); zoomSaveT = setTimeout(() => { if (G.set.fieldZoomAt !== z) st.setSettings({ fieldZoomAt: z }); }, 600);      // remembered for next time
    }
  }
  /** the field window appeared, moved, changed size or went away. r: its rectangle on this screen, or null when there is none */
  G.setField = (r) => {
    const next = rect(r), old = G.view;
    if (!next && !old) return;
    if (next && old && next.x === old.x && next.y === old.y && next.w === old.w && next.h === old.h) return;
    const opened = !!next && !old, closed = !next && !!old;
    const ox = old ? old.x : 0, oy = old ? old.y : 0, nx = next ? next.x : 0, ny = next ? next.y : 0;
    const was = G.cam ? Object.assign({}, G.cam) : null;   // the camera the old field was seen through
    G.view = next;
    if (opened || closed) G.cam = null;                    // a new field gets a camera of its own (layout)
    layout();
    // the world jumped: keep everything where it is on the screen (with a camera that is a shift and a change of scale)
    if (opened) { const c = G.cam, z = c ? c.z : 1; G.mapWorld(1 / z, (ox - nx) / z + (c ? c.x : 0), (oy - ny) / z + (c ? c.y : 0)); }
    else if (closed) { const z = was ? was.z : 1; G.mapWorld(z, ox - (was ? was.x * z : 0), oy - (was ? was.y * z : 0)); }
    else if (!G.cam) { G.cursor.x += ox - nx; G.cursor.y += oy - ny; }       // the field moved and took the world along; only the pointer stayed behind
    if (!G.save) return;
    G.onView(opened, closed);
    if (opened && G.save.team.length) G.toast({ title: 'The field is up', text: 'Your team is called inside. Wild Pokémon now come in over the edges of the field.', tone: 'info', dur: 4.5 });
    if (closed) G.toast({ title: 'The barriers are down', text: 'Everyone roams the whole screen until the field is created again.', tone: 'info', dur: 4.5 });
  };
  G.view = rect(init.field);                               // the field can already be open when this page starts
  layout();
  window.addEventListener('resize', () => { layout(); if (G.save) G.onView(false, false); });

  function notice() {
    const n = $('notice');
    n.hidden = Sprites.ready();
    n.textContent = 'Screen Trainer can’t find the sprites folder. Open the Pokédex from the tray icon, go to Options and choose it.';
  }
  function applySettings(s, first) {
    const prev = G.set;
    G.set = s;
    const restyle = first || prev.spriteStyle !== s.spriteStyle;                 // other pictures: load them again
    const rescale = prev.scale !== s.scale || prev.sizeMode !== s.sizeMode;      // same pictures, another size
    G.scale = s.scale || 2;
    root.style.opacity = G.screenLayer.style.opacity = s.opacity === undefined ? 1 : s.opacity;
    FX.setIntensity({ low: 0.5, normal: 1, chaos: 1.8 }[s.fxLevel] || 1);
    if (restyle) { Sprites.configure(G.spriteInfo, s.spriteStyle); for (const a of G.actors) G.loadSprite(a); }
    else if (rescale) for (const a of G.actors) G.sizeActor(a);
    Mewtwo.apply(s, restyle);
    if (!first && prev.toasts !== s.toasts) Notify.clear();
    G.buildPool();
    Sound.apply(s);
    notice();
    // the field window's zoom, the levels allowed and Fountain Square are settings too: lay the world out again
    if (G.view && (first || prev.fieldZoomAt !== s.fieldZoomAt || prev.fieldSquare !== s.fieldSquare || JSON.stringify(prev.zoomLevels) !== JSON.stringify(s.zoomLevels))) { layout(); if (!first && G.save) G.onView(false, false); }
  }

  G.spriteInfo = init.sprites || {};
  Sprites.configure(G.spriteInfo, init.settings.spriteStyle);
  G.save = parseSave(init.save) || G.newSave();
  G.set = init.settings;
  G.modSpawn = (init.mods && init.mods.spawns) || {};      // (1.0) spawn multipliers of the mods that are on (mods.js); used by spawnWeight in src/game.js
  if (st.onMods) st.onMods((fx) => { G.modSpawn = (fx && fx.spawns) || {}; });
  Sound.init(init.settings, st);
  Sound.onChange = () => G.pushState();
  // a strong hit at "Full chaos" shakes the Pokémon for a moment (src/fx.js, impact)
  FX.onShake = (px, sec) => { const w = G.world; if (!w || typeof w.animate !== 'function') return; w.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${px}px,${-px * 0.6}px)` }, { transform: `translate(${-px * 0.8}px,${px * 0.5}px)` }, { transform: `translate(${px * 0.5}px,${px * 0.3}px)` }, { transform: 'translate(0,0)' }], { duration: sec * 1000, easing: 'ease-out' }); };
  applySettings(init.settings, true);
  G.syncTeam();
  if (typeof Square !== 'undefined') Square.sync();

  st.onSettings((s) => applySettings(s, false));
  st.onSprites((info) => { G.spriteInfo = info || {}; Sprites.configure(G.spriteInfo, G.set.spriteStyle); Items.resetPools(); for (const a of G.actors) G.loadSprite(a); G.buildPool(); Mewtwo.apply(G.set, true); notice(); if (typeof Square !== 'undefined') Square.dress(); });
  const world = (sx, sy) => { ptr = { x: sx, y: sy }; return G.toWorld(sx, sy); };      // the pointer arrives in screen coordinates; the game counts in the world's own
  st.onCursor((p) => { if (G.seen) { G.seen.poll = Date.now(); G.seen.polls++; } const w = world(p.x, p.y); G.onMove(w[0], w[1]); });
  if (st.onField) st.onField((r) => G.setField(r));
  // ---- what covers the field window (0.9.3, fix 4). The field window is an ordinary window now and this page stays
  // on top: where other windows lie over the field, the scenery drawn here (Fountain Square, the ground's marks, the
  // weather) is cut away so it is hidden with the field, and only the Pokémon (and their name tags) show over those
  // windows. main.js sends the covered parts as rectangles on this page ('st:covers', ps\cover.ps1).
  G.covers = [];
  G.covered = (sx, sy) => !!G.view && G.covers.some(([x, y, w, h]) => sx >= x && sx < x + w && sy >= y && sy < y + h);
  /** rectangle r without rectangle c: up to four rectangles */
  function cut(r, c) {
    const [x, y, w, h] = r, x1 = x + w, y1 = y + h, cx0 = Math.max(x, c[0]), cy0 = Math.max(y, c[1]), cx1 = Math.min(x1, c[0] + c[2]), cy1 = Math.min(y1, c[1] + c[3]);
    if (cx1 <= cx0 || cy1 <= cy0) return [r];
    const out = [];
    if (cy0 > y) out.push([x, y, w, cy0 - y]);                       // above
    if (cy1 < y1) out.push([x, cy1, w, y1 - cy1]);                   // below
    if (cx0 > x) out.push([x, cy0, cx0 - x, cy1 - cy0]);             // left
    if (cx1 < x1) out.push([cx1, cy0, x1 - cx1, cy1 - cy0]);         // right
    return out;
  }
  let coverSig = '';
  function applyCovers() {
    const v = G.view;
    let vis = null;
    if (v && G.covers.length) {
      let rs = [[v.x, v.y, v.w, v.h]];
      for (const c of G.covers) rs = rs.flatMap((r) => cut(r, c));
      vis = rs.map(([x, y, w, h]) => { const a = G.toWorld(x, y), b = G.toWorld(x + w, y + h); return [a[0], a[1], b[0] - a[0], b[1] - a[1]]; });
    }
    const css = !vis ? '' : vis.length ? `path('${vis.map(([x, y, w, h]) => `M${x.toFixed(1)} ${y.toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}z`).join('')}')` : 'polygon(0 0, 0 0, 0 0)';
    if (css === coverSig) return;
    coverSig = css;
    for (const id of ['ground', 'stPlaces']) { const el = document.getElementById(id); if (el && el.style) el.style.clipPath = css; }
    FX.setClip(vis);
  }
  G.applyCovers = applyCovers;
  if (st.onCovers) st.onCovers((list) => { G.covers = Array.isArray(list) ? list.filter((r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)) : []; applyCovers(); });
  if (st.onFieldCam) st.onFieldCam((m) => onFieldCam(m));
  // the Box Field: the field shows the Pokémon in the Box while the Pokédex has its Box out (src/boxfield.js)
  if (typeof BoxField !== 'undefined') { if (st.onBox) st.onBox((on) => BoxField.set(!!on)); if (st.boxShown) st.boxShown().then((on) => BoxField.set(!!on)).catch(() => {}); }
  st.onCmd((c) => { if (c && c.type === 'flush') { G.saveNow(); return; } G.command(c); });
  st.onStateRequest((full) => G.pushState(!!full));
  if (st.onSound) st.onSound((name) => Sound.play(String(name)));              // the Pokédex window plays its sounds here
  if (st.onSoundBank) st.onSoundBank(() => Sound.reload());                    // a ROM was imported
  if (st.onGuardian) st.onGuardian((m) => { if (m && m.text) Mewtwo.say(m.text, m.tone, m.seconds); });      // Mewtwo has something to say
  if (st.onMyPointer) st.onMyPointer((m) => { try { document.documentElement.style.cursor = m && typeof m.css === 'string' ? m.css : ''; } catch (e) { /* no page style */ } });      // the mouse over the game is the player's own pointer (0.9.7)
  if (st.onGuardianAway) st.onGuardianAway((m) => Mewtwo.away(m && m.move));      // a long task: off it dives (0.9.5)
  if (st.onGuardianBack) st.onGuardianBack((m) => Mewtwo.back(m && m.text, m && m.tone, m && m.seconds));

  // (G.seen.real: a mouse event of this page's own arrived. src/game.js, pointerStep, compares it with the pointer the
  // main process reports to notice another window lying over the overlay.)
  const real = () => { if (G.seen) G.seen.real = Date.now(); };
  const isDesktop = () => !!st.blocked && !(document.body && document.body.classList && document.body.classList.contains('stage'));      // the desktop overlay: not the stage, not the phone (asked each time: a check can set st.blocked after the page is up)
  // A press that never arrived (0.9.1). The overlay lets the mouse through until the pointer is on a Pokémon; when the
  // button goes down in the moment before the window has switched (a Pokémon walking under a still pointer, or the
  // first click after the field window closed), Windows hands the press to the window behind and only the release
  // comes here: the play test's trace showed four releases on a Pokémon and not one press. Such a release on
  // something of the game's is taken for the whole click.
  const pressed = new Set();
  window.addEventListener('mousedown', (e) => { real(); pressed.add(e.button); if (e.target && e.target.closest && e.target.closest('.ui')) return; const w = world(e.clientX, e.clientY); G.onDown(w[0], w[1], e.button); e.preventDefault(); });      // (.ui: the Android page's own controls)
  // The press that never arrives also stops a drag before it starts (0.9.2). On the owner's computer not one press
  // reached this page in an afternoon (83 releases, 0 presses): Windows hands the overlay the release and the moves,
  // never the press. So when the pointer moves with the left button held and no press of its own was seen, and the
  // button was up the move before (it went down here, not somewhere else before the pointer came over), the press
  // is taken to have been made where the pointer last was with the button up, and the drag begins from there.
  let upAt = null, lastButtons = 0;
  const pressFromMove = (e, w) => {
    if (!isDesktop() || !(e.buttons & 1) || pressed.has(0) || lastButtons !== 0 || G.drag || !G.capture) return false;
    if (e.target && e.target.closest && e.target.closest('.ui')) return false;
    const at = upAt && performance.now() - upAt.t < 1500 ? upAt : { x: w[0], y: w[1] };
    const box = typeof BoxField !== 'undefined' && BoxField.active();
    const hit = box ? BoxField.pick(at.x, at.y) : G.pick(at.x, at.y);
    if (!hit) return false;
    pressed.add(0);
    if (G.note) G.note('lost press', { button: 0, taken: 'the button is held while the pointer moves: a drag from where it went down' });
    G.onDown(at.x, at.y, 0);
    return true;
  };
  window.addEventListener('mousemove', (e) => {
    real();
    const w = world(e.clientX, e.clientY);
    pressFromMove(e, w);
    if (e.buttons === 0) upAt = { x: w[0], y: w[1], t: performance.now() };
    lastButtons = e.buttons;
    G.onMove(w[0], w[1]);
    // A button that went down here and came up over another window never sends its "up" to this page: the Pokémon
    // would stay in the pointer's hand and the overlay would keep the mouse. No button held = it is let go.
    if (isDesktop() && e.buttons === 0 && G.pointer && G.pointer.is('held', 'guard', 'place') && G.pointer.age() > 0.25) G.letGo('no mouse button is held any more');
  });
  window.addEventListener('mouseup', (e) => {
    real();
    const had = pressed.delete(e.button);
    if (!had && isDesktop() && (e.button === 0 || e.button === 2) && !(e.target && e.target.closest && e.target.closest('.ui'))) {
      const w = world(e.clientX, e.clientY);
      const box = typeof BoxField !== 'undefined' && BoxField.active();
      const hit = box ? BoxField.pick(w[0], w[1]) : G.pick(w[0], w[1]);
      if (hit && !G.drag) {
        if (G.note) G.note('lost press', { button: e.button, taken: 'the release counts as the click' });
        G.onDown(w[0], w[1], e.button);
      }
    }
    G.onUp();
  });
  window.addEventListener('blur', () => { pressed.clear(); lastButtons = 0; G.onUp(); });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('dragstart', (e) => e.preventDefault());
  window.addEventListener('beforeunload', () => { try { st.save(JSON.stringify(G.save)); } catch (e) { /* ignore */ } });

  if (upgradeNote) { const note = upgradeNote; G.after(4, () => G.toast(note)); G.touch(); }
  if (helperNote) { const note = helperNote; G.after(2, () => G.toast(note)); G.touch(); }
  if (!G.save.team.length && Sprites.ready()) G.after(1.2, () => G.toast({ title: 'Catch your first partner!', text: 'Wild Pokémon hop in from the edges of your screen. Click one to weaken it, right-click to throw a ball.', tone: 'info', dur: 9 }));
  requestAnimationFrame(G.frame);
})();
