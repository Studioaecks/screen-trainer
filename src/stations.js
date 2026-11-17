// Screen Trainer — the places round the MyStream fountain (0.6). Only the stage loads this file.
//
//   Poké Center   left of the fountain. Drop one hurt or fainted team Pokémon on it: it is mended to full health.
//   the pipe      right. A team Pokémon dropped on it goes to the Box. (An original clay pipe in a mound of earth.)
//   Day Care      north. Drop up to two team Pokémon into the fence: they leave the team, stroll in the yard and
//                 slowly gain experience. Two that can breed by the games' rules (src/breed.js: a male and a female
//                 of one egg group, or one of them Ditto) leave an egg after a while; the sign says how they get
//                 along. Drag a Pokémon or the egg out again: that needs a free place on the team. The egg is then
//                 carried (save.eggs, src/game.js) and hatches by itself when its hidden time is up.
//   trade pads    south. "Mystery trade": the Pokémon is swapped for a random one, for good. "Evolve trade": it is
//                 sent over and comes straight back, which makes the kinds that evolve by trade evolve.
//                 Both ask first: the Pokémon has to be dropped on the pad a second time.
//
// Everything is drawn here in little squares, like the fountain; the sign on the Poké Center is the ball from the
// owner's own sprites folder. The rules of the game stay in game.js: this file calls G.command, Mon.* and G.syncTeam,
// and listens by wrapping G.onDown / onMove / onUp / update. Day Care guests live in the save as save.daycare
// ({ mons: [...], t: seconds two have spent together since the last look, egg: { mon } | null }); src/overlay.js repairs it on load.
'use strict';

const Stations = (() => {
  const K = 2, EGG_LOOK = 25, CARE_XP_EVERY = 60, HEAL_SECONDS = 6, ASK_SECONDS = 9;
  // the kinds that evolve when traded (their item is not asked for here)
  const TRADE_EVO = { 64: 65, 67: 68, 75: 76, 93: 94, 61: 186, 79: 199, 95: 208, 123: 212, 117: 230, 137: 233, 233: 474, 366: 367, 112: 464, 125: 466, 126: 467, 356: 477, 349: 350, 525: 526, 533: 534, 588: 589, 616: 617, 682: 683, 684: 685, 708: 709, 710: 711 };
  let on = false, built = false, els = {}, P = {}, patient = null, ask = null, yard = [], eggEl = null, grab = null, careT = 0, busyTrade = false, ball = null, eggPic = null, eggBox = null, carried = [];
  const $new = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const px = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  function oval(g, cx, cy, rx, ry, c) { g.fillStyle = c; for (let dy = -ry; dy <= ry; dy++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)))); if (hw > 0) g.fillRect(cx - hw, cy + dy, hw * 2, 1); } }
  const care = () => { const s = G.save; if (!s.daycare || !Array.isArray(s.daycare.mons)) s.daycare = { mons: [], t: 0, egg: null }; return s.daycare; };
  const sprite = (m) => { const r = Sprites.resolve(m.sp, !!m.shiny, !!m.fem, m.look); return r ? r.front : ''; };

  // ------------------------------------------------------------------ pictures
  function canvas(w, h, draw) { const c = $new('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; draw(g); return c; }
  function drawCenter(g) {
    oval(g, 33, 51, 30, 5, 'rgba(24,66,34,.30)');
    px(g, 8, 24, 48, 27, '#f4f1e8'); px(g, 8, 24, 3, 27, '#ffffff'); px(g, 52, 24, 4, 27, '#d6d0c0'); px(g, 8, 49, 48, 2, '#b9b2a0');
    for (let r = 0; r < 15; r++) { const inset = Math.max(0, 6 - r); px(g, 3 + inset, 9 + r, 58 - inset * 2, 1, r < 2 ? '#f58a78' : r < 12 ? '#e8503c' : '#b83a2a'); }
    px(g, 3, 24, 58, 1, '#8f2a1d');
    for (const x of [12, 44]) { px(g, x, 33, 9, 9, '#3d6f9f'); px(g, x + 1, 34, 7, 7, '#9bd4ff'); px(g, x + 1, 34, 3, 3, '#d9f1ff'); }
    px(g, 26, 35, 12, 16, '#3d6f9f'); px(g, 27, 36, 10, 15, '#7fb8ea'); px(g, 31, 36, 1, 15, '#3d6f9f'); px(g, 27, 36, 4, 5, '#c6e6ff');
    oval(g, 32, 28, 6, 6, '#8f2a1d'); oval(g, 32, 28, 5, 5, '#ffffff');
    if (ball) g.drawImage(ball, 27, 23, 10, 10); else { px(g, 30, 26, 2, 2, '#ff6f9c'); px(g, 33, 26, 2, 2, '#ff6f9c'); px(g, 29, 27, 7, 2, '#ff6f9c'); px(g, 30, 29, 5, 1, '#ff6f9c'); px(g, 31, 30, 3, 1, '#ff6f9c'); px(g, 32, 31, 1, 1, '#ff6f9c'); }
    px(g, 22, 51, 20, 4, '#d9cfa4'); px(g, 22, 54, 20, 1, '#b9ad7e');
  }
  function drawPipe(g) {
    oval(g, 20, 33, 18, 6, '#6f5335'); oval(g, 20, 32, 17, 5, '#8a6a45');
    for (let i = 0; i < 16; i++) px(g, 4 + ((i * 37) % 31), 29 + ((i * 13) % 7), 2, 1, i % 2 ? '#a58258' : '#5a4229');
    px(g, 12, 13, 16, 19, '#c96f3d'); px(g, 13, 13, 3, 19, '#e39160'); px(g, 24, 13, 4, 19, '#9c4f27');
    px(g, 9, 7, 22, 7, '#d67a45'); px(g, 10, 7, 4, 7, '#f0a273'); px(g, 27, 7, 4, 7, '#a85a2e'); px(g, 9, 13, 22, 1, '#8c4722');
    oval(g, 20, 8, 9, 2, '#3a2416'); oval(g, 20, 8, 7, 1, '#1f130b');
    px(g, 6, 30, 5, 2, '#8a6a45'); px(g, 29, 31, 6, 2, '#8a6a45');
  }
  const FENCE = { w: 124, h: 50 };
  function drawYard(g, front) {
    const post = (x, y) => { px(g, x, y - 7, 3, 8, '#c9a26b'); px(g, x, y - 7, 1, 8, '#e6c592'); px(g, x + 2, y - 7, 1, 8, '#8f6b3d'); px(g, x, y - 8, 3, 1, '#e6c592'); };
    const rail = (x0, x1, y) => { px(g, x0, y - 5, x1 - x0, 1, '#b08650'); px(g, x0, y - 3, x1 - x0, 1, '#b08650'); };
    if (!front) {
      oval(g, 62, 27, 60, 22, 'rgba(170,224,150,.55)');
      rail(2, 122, 9); for (let x = 2; x <= 120; x += 13) post(x, 9);
      for (const x of [2, 119]) { px(g, x + 1, 6, 1, 38, '#b08650'); for (let y = 20; y < 44; y += 11) post(x, y); }
    } else {
      rail(2, 50, 46); rail(74, 122, 46);
      for (const x of [2, 15, 28, 41, 49, 72, 80, 93, 106, 119]) post(x, 46);
      px(g, 49, 37, 3, 2, '#8f6b3d'); px(g, 72, 37, 3, 2, '#8f6b3d');
    }
  }
  function drawPad(g, col, hi) { oval(g, 28, 12, 27, 9, 'rgba(24,66,34,.28)'); oval(g, 28, 10, 26, 8, '#9aa3b1'); oval(g, 28, 9, 25, 7, '#cfd6e6'); oval(g, 28, 9, 19, 5, col); oval(g, 28, 9, 14, 3, hi); px(g, 22, 8, 12, 1, '#ffffff'); px(g, 32, 7, 2, 1, '#ffffff'); px(g, 22, 9, 2, 1, '#ffffff'); }
  function drawEgg(g) { oval(g, 8, 10, 6, 7, '#f6f0df'); oval(g, 7, 9, 4, 5, '#fffaf0'); px(g, 5, 11, 3, 2, '#9fd98c'); px(g, 10, 7, 2, 2, '#9fd98c'); px(g, 9, 13, 3, 2, '#9fd98c'); }

  // ------------------------------------------------------------------ putting them on the stage
  const host = () => document.getElementById('stPlaces') || G.world;      // the layer of the fountain and its places (stage.html)
  function part(name, cv, cls) { const el = $new('div', 'station ' + (cls || '')); el.appendChild(cv); el.style.width = cv.width * K + 'px'; el.style.height = cv.height * K + 'px'; host().appendChild(el); els[name] = el; return el; }
  function sign(name, text) { const el = $new('div', 'stSign'); el.textContent = text; host().appendChild(el); els[name] = el; return el; }
  async function build() {
    if (built || typeof G === 'undefined' || !G.world) return;
    built = true;
    try { const src = Sprites.item('poke-ball'); if (src) ball = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); } catch (e) { ball = null; }
    try { const src = Sprites.egg && Sprites.egg(); if (src) eggPic = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); } catch (e) { eggPic = null; }      // the sprite set's own egg, if it has one
    if (eggPic) try {                                         // such pictures have a wide empty margin: find the egg itself
      const t = canvas(eggPic.naturalWidth, eggPic.naturalHeight, (g) => g.drawImage(eggPic, 0, 0)), d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
      let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1;
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (d[(y * t.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      eggBox = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
    } catch (e) { eggBox = null; }
    part('center', canvas(64, 56, drawCenter)); part('pipe', canvas(40, 40, drawPipe));
    part('yardBack', canvas(FENCE.w, FENCE.h, (g) => drawYard(g, false))); part('yardFront', canvas(FENCE.w, FENCE.h, (g) => drawYard(g, true)));
    part('padM', canvas(56, 22, (g) => drawPad(g, '#b58be8', '#d9c2fb'))); part('padE', canvas(56, 22, (g) => drawPad(g, '#ffd24a', '#fff0a8')));
    sign('sCenter', 'Poké Center'); sign('sPipe', 'to the Box'); sign('sYard', 'Day Care'); sign('sYardSay', '').classList.add('say'); sign('sPadM', 'Mystery trade'); sign('sPadE', 'Evolve trade'); sign('sAsk', '').classList.add('ask');
    els.sAsk.hidden = true; els.sYardSay.hidden = true;      // (until 0.7 the empty question box could be seen in the stage's top left corner until the first drop)
    eggEl = eggPart('egg'); eggEl.hidden = true;
    const t = $new('div'); t.id = 'stTrade'; t.hidden = true; t.innerHTML = '<img class="out" alt=""><img class="in" alt=""><p></p>'; els.trade = t;
    ((!document.body.classList.contains('stage') && document.getElementById('root')) || document.body).appendChild(t);      // in the field window a trade darkens the field, not the screen
    wrap();
    place(on);
  }
  /** where everything stands: round the middle of the stage, where the fountain is */
  function place(show) {
    on = !!show;
    if (!built || !els.trade) return;                        // (still being built: build() places everything when it is done)
    const W = G.W || window.innerWidth, H = G.H || window.innerHeight, cx = Math.round(W / 2), cy = Math.round(H / 2);      // the middle of the world (the stage's world is its page; the field window's can be larger)
    P = {
      center: { x: cx - 330, y: cy + 36 }, pipe: { x: cx + 330, y: cy + 44 },
      yard: { x: cx, y: cy - 214, x0: cx - 110, x1: cx + 110, y0: cy - 286, y1: cy - 220 },      // (0.9.7: 24 higher, clear of the larger fountain's jet)
      padM: { x: cx - 74, y: cy + 222 }, padE: { x: cx + 74, y: cy + 222 },
    };
    const put = (el, x, baseY, z) => { const w = parseFloat(el.style.width), h = parseFloat(el.style.height); el.style.transform = `translate3d(${Math.round(x - w / 2)}px, ${Math.round(baseY - h)}px, 0)`; el.style.zIndex = String(Math.floor(z === undefined ? baseY : z)); };
    put(els.center, P.center.x, P.center.y + 10, P.center.y); put(els.pipe, P.pipe.x, P.pipe.y + 12, P.pipe.y);
    put(els.yardBack, P.yard.x, P.yard.y + 8, P.yard.y0 - 20); put(els.yardFront, P.yard.x, P.yard.y + 8, P.yard.y + 4);
    put(els.padM, P.padM.x, P.padM.y + 14, P.padM.y - 30); put(els.padE, P.padE.x, P.padE.y + 14, P.padE.y - 30);
    const label = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
    label(els.sCenter, P.center.x, P.center.y - 118); label(els.sPipe, P.pipe.x, P.pipe.y - 84); label(els.sYard, P.yard.x, P.yard.y0 - 34); label(els.sYardSay, P.yard.x, P.yard.y1 + 16);
    label(els.sPadM, P.padM.x, P.padM.y + 18); label(els.sPadE, P.padE.x, P.padE.y + 18);
    for (const k in els) if (k !== 'trade' && k !== 'egg' && k !== 'sAsk' && k !== 'sYardSay') els[k].hidden = !on;
    if (!on) { els.sAsk.hidden = true; els.sYardSay.hidden = true; eggEl.hidden = true; for (const y of yard) y.el.hidden = true; for (const c of carried) c.el.hidden = true; }
  }
  /** what feet cannot walk through (added to G.blocks by the stage) */
  const blocks = () => (on && built && P.center ? [
    { name: 'center', x: P.center.x, y: P.center.y - 10, rx: 62, ry: 16 }, { name: 'pipe', x: P.pipe.x, y: P.pipe.y - 4, rx: 24, ry: 10 },
    { name: 'yard', x: P.yard.x, y: (P.yard.y0 + P.yard.y1) / 2 + 6, rx: 132, ry: 52 },
  ] : []);

  // ------------------------------------------------------------------ what a drop does
  const name = (m) => Mon.name(m);
  const note = (title, text, sp) => G.toast({ title, text: text || '', icon: sp ? Sprites.icon(sp) : '', tone: 'gold', dur: 4 });
  function where(x, y) {
    const near = (p, rx, up, down) => Math.abs(x - p.x) <= rx && y >= p.y - up && y <= p.y + down;
    if (near(P.center, 70, 96, 40)) return 'center';
    if (near(P.pipe, 44, 70, 34)) return 'pipe';
    if (x >= P.yard.x0 - 16 && x <= P.yard.x1 + 16 && y >= P.yard.y0 - 26 && y <= P.yard.y1 + 30) return 'yard';
    if (near(P.padM, 58, 40, 36)) return 'padM';
    if (near(P.padE, 58, 40, 36)) return 'padE';
    return '';
  }
  function dropped(a) {
    if (!on || busyTrade) return;
    const spot = where(a.x, a.y), m = a.mon, team = G.save.team;
    if (spot !== 'padM' && spot !== 'padE') clearAsk();
    if (spot === 'center') {
      if (patient && patient !== a && !patient.gone) { G.say(a, 'The Poké Center is busy.', { col: '#ffd0d0', size: 12 }); return; }
      if (a.state === 'faint' && G.inTrainerBattle && G.inTrainerBattle()) { G.say(a, 'Not during a Trainer battle.', { col: '#ffd0d0', size: 12 }); note('The Poké Center waits', `${name(m)} stays down until the Trainer battle is over.`, m.sp); return; }
      if (m.hp >= Mon.maxHp(m) && !m.st && a.state !== 'faint') { G.say(a, 'is in fine shape!', { col: '#9cf07a', size: 12 }); return; }
      patient = a; a.careT = 0; snd('heal');
    } else if (spot === 'pipe') {
      if (team.length <= 1) { G.say(a, 'The team needs at least one.', { col: '#ffd0d0', size: 12 }); return; }
      FX.dust(P.pipe.x, P.pipe.y - 60, 8, 5); FX.ring(P.pipe.x, P.pipe.y - 62, 4, 30, '#ffffff', 0.4, 2); snd('boxClose');
      note(`${name(m)} went down the pipe`, 'It is in the Box now.', m.sp);
      G.command({ type: 'box', uid: m.uid });
    } else if (spot === 'yard') {
      const d = care();
      if (d.mons.length >= 2) { G.say(a, 'The Day Care is full.', { col: '#ffd0d0', size: 12 }); return; }
      if (team.length <= 1) { G.say(a, 'The team needs at least one.', { col: '#ffd0d0', size: 12 }); return; }
      const i = team.indexOf(m); if (i < 0) return;
      team.splice(i, 1); d.mons.push(m); if (d.mons.length < 2) d.t = 0;
      G.syncTeam(); G.saveNow(); snd('boxClose');
      note(`${name(m)} is at the Day Care`, 'Drag it out of the fence to take it back.', m.sp);
    } else if (spot === 'padM' || spot === 'padE') {
      if (ask && ask.uid === m.uid && ask.spot === spot && G.now < ask.until) { clearAsk(); trade(a, spot === 'padE'); return; }
      if (spot === 'padM' && team.length < 1) return;
      ask = { uid: m.uid, spot, until: G.now + ASK_SECONDS };
      els.sAsk.textContent = spot === 'padM' ? `Trade ${name(m)} away for a surprise? Are you sure? This cannot be undone. Drop it here once more to trade.`
        : `Send ${name(m)} over and get it straight back?${TRADE_EVO[m.sp] && !m.noEvo ? ' It will evolve, and that cannot be undone.' : ''} Drop it here once more.`;
      els.sAsk.style.left = P[spot].x + 'px'; els.sAsk.style.top = (P[spot].y - 96) + 'px'; els.sAsk.hidden = false;
    }
  }
  function clearAsk() { ask = null; if (els.sAsk) els.sAsk.hidden = true; }
  const snd = (n) => { try { Sound.play(n); } catch (e) { /* no such sound: silent */ } };

  // ------------------------------------------------------------------ the trade
  function trade(a, evolve) {
    const sv = G.save, m = a.mon, ti = sv.team.indexOf(m);
    if (ti < 0 || busyTrade) return;
    busyTrade = true;
    let got = m, evo = null;
    if (!evolve) {
      const pool = (G.pool || []).filter((id) => id !== m.sp && !DATA.dex[id].lg), sp = pool.length ? U.pick(pool) : m.sp;
      got = Mon.create(sp, m.lvl, { shiny: Math.random() < 1 / Math.max(1, G.set.shinyOdds || 100) });
    } else if (TRADE_EVO[m.sp] && !m.noEvo && DATA.dex[TRADE_EVO[m.sp]] && Sprites.available(TRADE_EVO[m.sp])) evo = TRADE_EVO[m.sp];
    const t = els.trade, out = t.querySelector('.out'), inn = t.querySelector('.in'), line = t.querySelector('p');
    out.src = sprite(m); inn.src = sprite(evolve ? m : got); line.textContent = evolve ? `${name(m)} is on its way...` : `Bye, ${name(m)}!`;
    t.hidden = false; t.className = ''; void t.offsetWidth; t.className = 'go';
    snd('throw');
    setTimeout(() => {                                       // dark: the swap happens now
      if (!evolve) {
        const at = sv.team.indexOf(m);
        if (at >= 0) { sv.team[at] = got; sv.dex.seen[got.sp] = 1; sv.dex.caught[got.sp] = (sv.dex.caught[got.sp] || 0) + 1; sv.stats.trades = (sv.stats.trades || 0) + 1; G.syncTeam(); G.saveNow(); }
      }
      line.textContent = evolve ? `${name(m)} came back!` : `${Mon.name(got)} came over. Take good care of it!`;
    }, 2300);
    setTimeout(() => {
      t.className = ''; t.hidden = true; busyTrade = false;
      if (!evolve) { note(`${Mon.name(got)} joined in a trade`, `Level ${got.lvl}${got.shiny ? ', shiny!' : ''}`, got.sp); snd('caught'); return; }
      if (evo && !a.gone) { const e = Mon.evolveTo(m, evo); if (e) G.evolveFx(a, e); } else G.say(a, 'came back just the same.', { col: '#d9e6ff', size: 12 });
    }, 5200);
  }

  // ------------------------------------------------------------------ every tick: the patient, the yard, the question
  function tick(dt) {
    if (!built || !on) return;
    if (ask && G.now >= ask.until) clearAsk();
    if (patient) {
      const a = patient, m = a.mon, max = Mon.maxHp(m);
      if (a.gone || a.dragging || !G.save.team.includes(m)) patient = null;
      else {
        if (a.state === 'faint') { a.state = 'idle'; a.mode = 'roam'; a.cd = 1.5; a.dmgBy = new Set(); m.hp = Math.max(1, m.hp); }
        a.x = a.tx = P.center.x; a.y = a.ty = P.center.y + 22; a.hops = null;
        m.hp = Math.min(max, m.hp + Math.max(1, (max * dt) / HEAL_SECONDS)); a.careT += dt;
        if (Math.random() < dt * 6) FX.sparkle(a.x + U.rand(-16, 16), a.y - a.h * U.rand(0.2, 0.9), 2, '#ffb8d0', 10);
        if (m.hp >= max && a.careT > 1.2) { m.hp = max; m.st = null; patient = null; G.say(a, 'is fully healed!', { col: '#9cf07a', size: 13 }); FX.ring(a.x, a.y - a.h * 0.5, 4, a.w, '#9cf07a', 0.5, 3); snd('heal'); G.touch(); }
      }
    }
    const d = care();
    // the yard shows who is in the save
    if (yard.length !== d.mons.length || yard.some((y, i) => y.m !== d.mons[i])) {
      for (const y of yard) y.el.remove();
      yard = d.mons.map((m, i) => { const el = $new('img', 'station guest'); el.src = sprite(m); el.alt = ''; host().appendChild(el); return { m, el, x: P.yard.x + (i ? 50 : -50), y: P.yard.y1 - 8, tx: 0, ty: 0, wait: U.rand(0.5, 2), face: 1 }; });
    }
    for (const y of yard) {
      if (grab && grab.y === y) continue;
      if (y.wait > 0) { y.wait -= dt; if (y.wait <= 0) { y.tx = U.rand(P.yard.x0 + 14, P.yard.x1 - 14); y.ty = U.rand(P.yard.y0 + 26, P.yard.y1); } }
      else { const dx = y.tx - y.x, dy = y.ty - y.y, dist = Math.hypot(dx, dy), v = 26 * (G.walkRate ? G.walkRate() : 1); if (dist < 3) y.wait = U.rand(1.5, 5); else { y.x += (dx / dist) * Math.min(dist, v * dt); y.y += (dy / dist) * Math.min(dist, v * dt); if (Math.abs(dx) > 2) y.face = dx > 0 ? -1 : 1; } }
      draw(y);
    }
    // Two guests: every EGG_LOOK seconds together there may be an egg, by the rules and the odds of src/breed.js
    const pair = d.mons.length === 2 ? Breed.match(d.mons[0], d.mons[1]) : null;
    if (pair && pair.ok && !d.egg) {
      d.t = (d.t || 0) + dt;
      if (d.t >= EGG_LOOK) { d.t = 0; if (Math.random() < pair.chance) { const m = Breed.egg(d.mons[0], d.mons[1], G.set.shinyOdds); if (m) { d.egg = { mon: m }; note('An egg at the Day Care!', 'Drag it out of the fence to carry it. It hatches when it is ready.'); G.saveNow(); } } }
    }
    const say = d.egg ? 'An egg is waiting!' : pair ? pair.line : '';
    if (els.sYardSay.textContent !== say) els.sYardSay.textContent = say;
    els.sYardSay.hidden = !say;
    // the eggs being carried lie where they were put down; one that is nearly ready stirs
    const eggs = G.save.eggs || [];
    while (carried.length > eggs.length) carried.pop().el.remove();
    while (carried.length < eggs.length) carried.push({ el: eggPart('carried' + carried.length) });
    eggs.forEach((e, i) => { const el = carried[i].el; el.hidden = false; el.classList.toggle('stir', e.t < 8); el.style.left = Math.round(e.x - 16) + 'px'; el.style.top = Math.round(e.y - 36) + 'px'; el.style.transform = ''; el.style.zIndex = String(Math.floor(e.y)); });
    careT += dt;
    if (careT >= CARE_XP_EVERY) { careT = 0; for (const m of d.mons) Mon.gainXp(m, 8 + m.lvl * 3, false); if (d.mons.length) G.touch(); }
    eggEl.hidden = !d.egg;                                  // (0.6 hid it while it was being carried: the egg in your hand could not be seen)
    if (d.egg && !(grab && grab.egg)) { eggEl.style.transform = `translate3d(${P.yard.x - 14}px, ${P.yard.y1 - 34}px, 0)`; eggEl.style.zIndex = String(Math.floor(P.yard.y1 - 2)); }
  }
  function draw(y) { const h = 46; y.el.style.height = h + 'px'; y.el.style.transform = `translate3d(${Math.round(y.x - (y.el.naturalWidth / Math.max(1, y.el.naturalHeight)) * h / 2)}px, ${Math.round(y.y - h)}px, 0) scaleX(${y.face})`; y.el.style.zIndex = String(Math.floor(y.y)); y.el.hidden = false; }
  /** an egg to show: the sprite set's own picture when it has one, else the drawn one */
  function eggPart(name) { const el = part(name, canvas(16, 18, (g) => { if (eggPic) { const b = eggBox || { x: 0, y: 0, w: eggPic.naturalWidth, h: eggPic.naturalHeight }, k = Math.min(16 / b.w, 18 / b.h), w = Math.max(1, Math.round(b.w * k)), h = Math.max(1, Math.round(b.h * k)); g.drawImage(eggPic, b.x, b.y, b.w, b.h, Math.round((16 - w) / 2), 18 - h, w, h); } else drawEgg(g); }), 'eggs'); delete els[name]; if (name === 'egg') els.egg = el; return el; }

  // ------------------------------------------------------------------ the pointer: drops on a place, and taking guests out of the yard
  function wrap() {
    const down = G.onDown, move = G.onMove, up = G.onUp, update = G.update;
    G.update = (dt) => { update(dt); try { tick(dt); } catch (e) { console.error('[Stations]', e); } };
    G.onDown = (x, y, button) => {
      if (on && button === 0 && !busyTrade && !(typeof BoxField !== 'undefined' && BoxField.active())) {      // (not while the Box Field is up: the click is for a Pokémon of the Box)
        const d = care();
        if (d.egg && Math.abs(x - P.yard.x) < 18 && y > P.yard.y1 - 40 && y < P.yard.y1 + 4) { grab = { egg: true }; carryEgg(x, y); return; }
        const hit = yard.find((g) => Math.abs(x - g.x) < 26 && y > g.y - 50 && y < g.y + 6);
        if (hit) { grab = { y: hit }; return; }
      }
      down(x, y, button);
    };
    G.onMove = (x, y) => {
      move(x, y);
      if (!grab) return;
      if (grab.y) { grab.y.x = x; grab.y.y = y + 20; draw(grab.y); grab.y.el.style.zIndex = '99999'; }
      else carryEgg(x, y);
    };
    G.onUp = () => {
      const dr = G.drag, g = grab;
      grab = null;
      up();
      if (g) { takeOut(g); return; }
      if (dr && dr.moved && dr.a && dr.a.side === 'team' && !dr.a.gone) dropped(dr.a);
    };
  }
  /** the egg in the pointer's hand */
  function carryEgg(x, y) { eggEl.hidden = false; eggEl.style.transform = `translate3d(${Math.round(x - 16)}px, ${Math.round(y - 22)}px, 0)`; eggEl.style.zIndex = '99999'; }
  function takeOut(g) {
    const d = care(), sv = G.save, x = G.cursor.x, y = G.cursor.y, spot = where(x, y), inside = spot === 'yard';
    if (inside) { if (g.y) { g.y.x = U.clamp(x, P.yard.x0 + 14, P.yard.x1 - 14); g.y.y = U.clamp(y + 20, P.yard.y0 + 26, P.yard.y1); g.y.wait = 2; } return; }
    const back = () => { if (g.y) { g.y.x = P.yard.x; g.y.y = P.yard.y1 - 8; g.y.wait = 1; } };
    if (g.y && spot === 'pipe') {                             // out of the Day Care and straight down the pipe: that needs no place on the team
      const i = d.mons.indexOf(g.y.m); if (i < 0) return;
      d.mons.splice(i, 1); if (d.mons.length < 2) d.t = 0;
      sv.box.push(g.y.m); G.boxEpoch++; G.saveNow();
      FX.dust(P.pipe.x, P.pipe.y - 60, 8, 5); FX.ring(P.pipe.x, P.pipe.y - 62, 4, 30, '#ffffff', 0.4, 2); snd('boxClose');
      note(`${name(g.y.m)} went down the pipe`, 'From the Day Care straight to the Box.', g.y.m.sp);
      return;
    }
    if (!G.teamRoom()) { note('The team is full', g.egg ? 'An egg takes a place on the team. Send a team member down the pipe first.' : 'Drop it on the pipe to send it to the Box, or free a place on the team first.'); back(); return; }
    if (g.egg) {
      if (!d.egg) return;
      const m = d.egg.mon;
      d.egg = null; d.t = 0;
      if (!Array.isArray(sv.eggs)) sv.eggs = [];
      sv.eggs.push({ mon: m, t: Breed.hatchSeconds(m.sp), x: U.clamp(x, 30, G.W - 30), y: U.clamp(y + 18, 60, G.H - 16) });      // how long is nobody's to see
      G.saveNow(); snd('pickup');
      note('You took the egg', 'It takes a place on the team and hatches when it is ready.');
    } else {
      const i = d.mons.indexOf(g.y.m); if (i < 0) return;
      d.mons.splice(i, 1); if (d.mons.length < 2) d.t = 0;
      sv.team.push(g.y.m); G.syncTeam(); G.saveNow(); snd('boxClose');
      const a = G.actors.find((q) => q.mon === g.y.m); if (a) G.dropIn(a, U.clamp(x, 40, G.W - 40), U.clamp(y + 20, 60, G.H - 20));      // set down where it was let go
    }
  }

  /** is a Day Care guest or the waiting egg under the pointer? (the field window's overlay only takes the mouse over something it draws) */
  function hit(x, y) {
    if (!on || !built || busyTrade) return false;
    if (care().egg && Math.abs(x - P.yard.x) < 18 && y > P.yard.y1 - 40 && y < P.yard.y1 + 4) return true;
    return yard.some((g) => Math.abs(x - g.x) < 26 && y > g.y - 50 && y < g.y + 6);
  }
  return { build, place, blocks, hit, grabbing: () => !!grab, where: (x, y) => where(x, y), spots: () => P, state: () => ({ on, built, patient: !!patient, ask: ask ? ask.spot : '', yard: yard.length, egg: !!care().egg, say: els.sYardSay ? els.sYardSay.textContent : '', carried: carried.length, trading: busyTrade }), _test: { dropped, trade, takeOut, hurry: () => { care().t = EGG_LOOK; } } };
})();
if (typeof module !== 'undefined') module.exports = Stations;
