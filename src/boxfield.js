// Screen Trainer — the Box Field (0.7): while the Box is open, the field shows the Pokémon in it.
//
// Opening the Box in the Pokédex replaces the field that is up (the field window's, or the MyStream stage's) with the
// Box Field: every Pokémon in the Box strolls on the field, and the ground is grown from them instead of from the
// team, one equal share each (158 Pokémon: one 158th of the field each; Field.partyPlan in src/field.js). Closing the
// Box brings the team's field back exactly as it was left: the game waits meanwhile (G.update in src/game.js asks
// BoxField.step first), so nothing is fought, caught or missed behind the Box Field.
//
//   - How many are shown is the option "Pokémon in the Box Field" (boxFieldMax, at most 1025). When the Box holds
//     more, one of every species comes first, so every kind in the Box is represented; then the rest in Box order.
//   - A Pokémon whose picture is missing from the sprites folder is not left out: a stand-in shape in the colours of
//     its first type stands for it, with its Pokédex number.
//   - They are light things, not actors of the game: a picture, a place and somewhere to stroll to. Nothing here can
//     hurt, catch or change a Pokémon. Pointing at one shows its name.
//   - They can be touched (0.9; before, nothing in the Box Field took the mouse and a click on one did nothing): a
//     click pets it (a hop, hearts, its cry), a right-click shows it in the Pokédex's Box, and it can be carried to
//     another spot of the field, where it then strolls. G.onDown, G.onMove and G.onUp in src/game.js pass the pointer
//     on while the Box Field is up; the grass between the Pokémon is still the field window's to drag.
//   - There is no Box Field on the plain overlay: that has no field to replace (rule 1 of AGENTS.md).
//
// src/overlay.js is told by the main process whether the Box is on show (st.onBox) and calls BoxField.set.
'use strict';

const BoxField = (() => {
  let wantOn = false, on = false, mons = [], strollers = [], layer = null, tag = null, plan = null, hover = null, sizeH = 48, frame = 0, sig = '', hand = null;
  const typeName = (sp) => { const d = DATA.dex[sp]; return d ? DATA.types[d.t[0]] : 'normal'; };
  const root = () => document.getElementById('root');
  const body = () => document.body;

  /** who is shown: one of every species first, then the rest in Box order, up to the limit */
  function choose(box, max) {
    const seen = new Set(), first = [], rest = [];
    for (const m of box) { if (seen.has(m.sp)) rest.push(m); else { seen.add(m.sp); first.push(m); } }
    return first.concat(rest).slice(0, Math.max(1, max));
  }
  const limit = () => U.clamp(Math.round(+G.set.boxFieldMax || 1025), 10, 1025);
  const signature = () => `${G.save.box.length}:${limit()}:${Math.round(G.W)}x${Math.round(G.H)}:${G.boxEpoch}`;

  /** a picture for this Pokémon, or the stand-in shape when the sprites folder has none */
  function picture(m) {
    let src = '';
    try { src = Sprites.still(m.sp, !!m.shiny, m.look) || ((Sprites.resolve(m.sp, !!m.shiny, !!m.fem, m.look) || {}).front || ''); } catch (e) { src = ''; }
    const standIn = () => {
      const el = document.createElement('div'), col = (typeof FX !== 'undefined' && FX.col ? FX.col(typeName(m.sp), 0) : '#9aa3b1');
      el.className = 'bxMon standin'; el.textContent = String(m.sp);
      el.style.background = col; el.style.width = el.style.height = Math.round(sizeH * 0.8) + 'px'; el.style.lineHeight = Math.round(sizeH * 0.8) + 'px'; el.style.fontSize = Math.max(8, Math.round(sizeH * 0.26)) + 'px';
      return el;
    };
    if (!src) return { el: standIn(), stand: true };
    const img = new Image();
    img.className = 'bxMon'; img.draggable = false; img.alt = ''; img.style.height = sizeH + 'px';
    const s = { el: img, stand: false };
    img.onerror = () => { const el = standIn(); if (img.parentNode) img.parentNode.replaceChild(el, img); s.el = el; s.stand = true; if (s.owner) { s.owner.el = el; s.owner.stand = true; s.owner.dirty = true; } };
    img.src = src;
    return s;
  }

  function enter() {
    const sv = G.save, r = root();
    if (!r || !sv || !sv.box.length) return false;
    layer = document.getElementById('boxField');
    if (!layer) { layer = document.createElement('div'); layer.id = 'boxField'; r.appendChild(layer); if (typeof G.applyCam === 'function') G.applyCam(); }      // (a new layer of the world: the field window's camera looks at it like at the others)
    layer.textContent = ''; layer.hidden = false;
    mons = choose(sv.box, limit());
    const n = mons.length, W = G.W, H = G.H;
    G.boxField = { list: mons.map((m) => m.sp), total: sv.box.length };
    plan = G.groundPlan();
    const cols = plan ? plan.cols : Math.max(1, Math.round(Math.sqrt(n * (W / H)))), rows = plan ? plan.rows : Math.ceil(n / cols);
    sizeH = Math.round(U.clamp(Math.sqrt((W * H) / Math.max(1, n)) * 0.62, 18, 76));
    strollers = mons.map((m, i) => {
      const cx = ((i % cols) + 0.5) / cols * W, cy = (Math.floor(i / cols) + 0.62) / rows * H, p = picture(m);
      const s = { m, el: p.el, stand: p.stand, hx: cx, hy: cy, x: cx + U.rand(-8, 8), y: cy + U.rand(-4, 4), tx: 0, ty: 0, wait: U.rand(0.3, 7), face: U.chance(0.5) ? 1 : -1, dirty: true, rx: (W / cols) * 0.42, ry: (H / rows) * 0.3 };
      p.owner = s;
      layer.appendChild(s.el);
      return s;
    });
    tag = document.createElement('div'); tag.className = 'bxTag'; tag.hidden = true; layer.appendChild(tag);
    if (r.classList) r.classList.add('boxfield');
    if (body() && body().classList) body().classList.add('boxfield');
    on = true; hover = null; hand = null; sig = signature();
    for (const s of strollers) draw(s);
    const species = new Set(mons.map((m) => m.sp)).size, left = sv.box.length - n;
    G.toast({ title: 'The Box Field', text: `${n} Pokémon from your Box, ${species} species, each on its own share of the ground.${left > 0 ? ` ${left} more are in the Box than the field shows (Options > Field).` : ''} Close the Box to go back to your team.`, tone: 'info', dur: 6 });
    changed();
    return true;
  }
  function leave() {
    on = false; strollers = []; mons = []; hover = null; hand = null; plan = null;
    if (layer) { layer.textContent = ''; layer.hidden = true; }
    G.boxField = null;
    const r = root();
    if (r && r.classList) r.classList.remove('boxfield');
    if (body() && body().classList) body().classList.remove('boxfield');
    changed();
  }
  /** the ground belongs to someone else now: the pages that draw it are told */
  function changed() {
    try { if (typeof G.onGroundChange === 'function') G.onGroundChange(); } catch (e) { /* the page has no ground of its own */ }
    try { G.pushState(); } catch (e) { /* no window to tell */ }
  }
  function draw(s) {
    const w = s.stand ? sizeH * 0.8 : (s.el.naturalWidth ? (s.el.naturalWidth / Math.max(1, s.el.naturalHeight)) * sizeH : sizeH), h = s.stand ? sizeH * 0.8 : sizeH;
    s.w = w; s.h = h;
    const up = (s.hop > 0 ? Math.sin(Math.min(1, s.hop / 0.25) * Math.PI) * 10 : 0) + (hand && hand.s === s && hand.moved ? 6 : 0);
    s.el.style.transform = `translate3d(${Math.round(s.x - w / 2)}px, ${Math.round(s.y - h - up)}px, 0) scaleX(${s.stand ? 1 : s.face})`;
    s.el.style.zIndex = String(hand && hand.s === s && hand.moved ? 99999 : Math.floor(s.y));
    s.dirty = false;
  }

  // ---- the pointer (0.9): a Pokémon of the Box can be petted, carried and looked up
  /** the one under a point of the world */
  function at(cx, cy) {
    let best = null, bd = 1e9;
    if (cx > -1000) for (const s of strollers) { const w = Math.max((s.w || sizeH) / 2, 14) + 4, h = Math.max(s.h || sizeH, 26); if (cx < s.x - w || cx > s.x + w || cy > s.y + 4 || cy < s.y - h - 4) continue; const d = Math.abs(cx - s.x) + Math.abs(cy - (s.y - h / 2)); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  const nameOf = (s) => `${Mon.name(s.m)}${s.m.shiny ? ' ✦' : ''}`;
  /** what the pointer is on, for G.update: null, or { kind: 'box', name, held } */
  function pick(cx, cy) {
    if (!on) return null;
    if (hand) return { kind: 'box', name: nameOf(hand.s), held: true };
    const s = at(cx, cy);
    return s ? { kind: 'box', name: nameOf(s), held: false } : null;
  }
  /** a mouse button went down. Returns the name of the Pokémon it was on, or '' */
  function down(x, y, button) {
    if (!on) return '';
    const s = at(x, y);
    if (!s) return '';
    if (button === 2) { try { window.st.openPanel('box:' + s.m.uid); } catch (e) { /* no Pokédex to show it in */ } s.hop = 0.25; s.dirty = true; }
    else if (button === 0) hand = { s, ox: s.x - x, oy: s.y - y, sx: x, sy: y, moved: false };
    return nameOf(s);
  }
  function move(x, y) {
    const d = hand;
    if (!d) return false;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 6) d.moved = true;
    if (d.moved) { d.s.x = U.clamp(x + d.ox, 12, G.W - 12); d.s.y = U.clamp(y + d.oy, sizeH + 8, G.H - 8); d.s.dirty = true; }
    return true;
  }
  /** the button came up: a pat, or the Pokémon is set down and strolls about its new spot. true when something was in hand */
  function up() {
    const d = hand;
    if (!d) return false;
    hand = null;
    const s = d.s;
    if (!strollers.includes(s)) return true;
    s.dirty = true;
    if (d.moved) { s.hx = s.x; s.hy = s.y; s.wait = U.rand(2, 6); try { FX.dust(s.x, s.y, 4, 3 + G.scale); } catch (e) { /* no dust on this page */ } return true; }
    s.hop = 0.25; s.wait = Math.max(s.wait, 1.2);
    try { if (window.st && window.st.pointPanel) window.st.pointPanel('box:' + s.m.uid); } catch (e) { /* no Pokédex to show it in */ }      // a pat also shows it in the open Pokédex, without taking the keyboard (0.9.5)
    try { FX.hearts(s.x, s.y - (s.h || sizeH) * 0.9, 2 + Mon.hearts(s.m)); } catch (e) { /* no hearts on this page */ }
    try { Sound.cry(s.m.sp, { x: s.x, vol: 0.5 }); } catch (e) { /* silent */ }
    return true;
  }

  /** the main process says whether the Box is on show */
  function set(show) { wantOn = !!show; }
  /** one step. true = the Box Field is up and the game waits. Called first thing by G.update. */
  function step(dt) {
    const should = wantOn && !!G.save && G.save.box.length > 0 && G.hasGround() && typeof Sprites !== 'undefined' && Sprites.ready();
    if (should && !on) enter();
    else if (!should && on) leave();
    if (!on) return false;
    if (sig !== signature()) { leave(); enter(); if (!on) return false; }       // the Box, the limit or the world changed: grow it again
    frame++;
    const v = 24 * (G.walkRate ? G.walkRate() : 1), many = strollers.length > 300;
    for (let i = 0; i < strollers.length; i++) {
      const s = strollers[i];
      if (many && (i + frame) % 2) continue;               // a crowded field moves half of them per frame
      const d = many ? dt * 2 : dt;
      if (s.hop > 0) { s.hop -= dt; s.dirty = true; }
      if (hand && hand.s === s) { if (s.dirty) draw(s); continue; }      // in the pointer's hand: it goes where the pointer goes
      if (s.wait > 0) { s.wait -= d; if (s.wait <= 0) { s.tx = U.clamp(s.hx + U.rand(-s.rx, s.rx), 12, G.W - 12); s.ty = U.clamp(s.hy + U.rand(-s.ry, s.ry), sizeH + 8, G.H - 8); } }
      else {
        const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy);
        if (dist < 2) s.wait = U.rand(2, 10);
        else { const st = Math.min(dist, v * d); s.x += (dx / dist) * st; s.y += (dy / dist) * st; if (Math.abs(dx) > 2) s.face = dx > 0 ? -1 : 1; s.dirty = true; }
      }
      if (s.dirty || (!s.w && s.el.naturalWidth)) draw(s);
    }
    // the name of the one under the pointer (or in its hand)
    const best = hand ? hand.s : at(G.cursor.x, G.cursor.y);
    if (best !== hover) { hover = best; tag.hidden = !best; if (best) tag.textContent = `${Mon.name(best.m)}${best.m.shiny ? ' ✦' : ''}  Lv.${best.m.lvl}`; }
    if (hover) { tag.style.left = Math.round(hover.x) + 'px'; tag.style.top = Math.round(hover.y - (hover.h || sizeH) - 22) + 'px'; }
    return true;
  }

  return { set, step, active: () => on, choose, pick, down, move, up, holding: () => !!hand, letGo: () => { hand = null; }, where: () => strollers.map((s) => ({ uid: s.m.uid, name: Mon.name(s.m), x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w || sizeH), h: Math.round(s.h || sizeH) })), state: () => ({ want: wantOn, on, shown: strollers.length, species: new Set(mons.map((m) => m.sp)).size, standIns: strollers.filter((s) => s.stand).length, box: G.save ? G.save.box.length : 0, size: sizeH, ground: G.boxField ? G.boxField.list.length : 0, hover: hover ? Mon.name(hover.m) : '' }) };
})();
if (typeof module !== 'undefined') module.exports = BoxField;
