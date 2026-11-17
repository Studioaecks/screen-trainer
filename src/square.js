// Screen Trainer — Fountain Square (0.7): the fountain and the places round it in the field window, and the button on
// top of the fountain.
//
// Until 0.7 only the MyStream stage had the fountain, the Poké Center, the pipe, the Day Care and the trade pads
// (src/stage.js builds them there, src/stations.js is the places). The field window now has the same square in the
// middle of its world, so the two are one place seen two ways. This file builds it for the field window: the overlay
// page loads src/fountain.js and src/stations.js too, and src/overlay.js calls Square.sync() whenever the world is
// laid out. The square is there while the field window is open and the option "Fountain Square" (fieldSquare) is on.
//
// The ball on top of the fountain is a button on both pages: "Visit a random online Screen Trainer" (src/online.js),
// and, while visiting, the way home. On the stage src/stage.js says where the ball is (Square.setTop).
//
// Everything is drawn into #stPlaces, the layer under the Pokémon. Rule 1 of AGENTS.md (no scenery on the overlay)
// is kept the way the field window keeps it: nothing is drawn outside the field, and closing the field removes it all.
'use strict';

const Square = (() => {
  const K = 2;                                     // screen pixels per little square, as on the stage
  const MAP = { w: 1280, h: 720 };                 // the least size of the field's world: the size of the MyStream stage
  let parts = null, fountain = null, built = false, shown = false, top = null, ring = null, tip = null, hot = false, note = 'not built';
  const stage = () => typeof Stage !== 'undefined';        // on the stage src/stage.js builds the fountain itself
  const wanted = () => !stage() && !!G.view && G.set.fieldSquare !== false;
  const isWater = (a) => !!(a && a.mon && DATA.dex[a.mon.sp] && DATA.dex[a.mon.sp].t.some((t) => DATA.types[t] === 'water'));
  const host = () => document.getElementById('stPlaces');

  function build() {
    if (built) return true;
    const h = host();
    if (!h || typeof Fountain === 'undefined') return false;
    try {
      const layer = () => { const el = document.createElement('div'); el.className = 'fountain'; const cv = document.createElement('canvas'); el.appendChild(cv); return { el, cv }; };
      const back = layer(), mid = layer(), front = layer();
      fountain = Fountain.create(back.cv, { mid: mid.cv, front: front.cv });
      parts = [back.el, mid.el, front.el];
      for (const el of parts) h.appendChild(el);
      fountain.draw(0);
      built = true; note = 'plain stone';
      setInterval(() => { if (fountain && shown) fountain.draw(performance.now() / 1000); }, 83);      // twelve pictures a second: it is pixel art
      dress();
      if (typeof Stations !== 'undefined') Stations.build().then(place).catch(() => {});
    } catch (e) { built = false; parts = null; fountain = null; note = 'could not be built: ' + String((e && e.message) || e).slice(0, 80); return false; }
    return true;
  }
  /** the ball on top and the statues come from the owner's sprites folder (and the statues from their own Pokédex), as on the stage */
  async function dress() {
    if (!fountain || typeof Sprites === 'undefined' || !Sprites.ready()) return;
    let ball = false, n = 0;
    try { ball = await fountain.setFinial(Sprites.item('poke-ball')); } catch (e) { ball = false; }
    try {
      const caught = Object.keys((G.save && G.save.dex && G.save.dex.caught) || {}).map(Number).filter((sp) => DATA.dex[sp] && DATA.dex[sp].t.some((t) => DATA.types[t] === 'water') && Sprites.available(sp)).sort((a, b) => a - b);
      const pick = caught.length > 2 ? [caught[0], caught[caught.length - 1]] : caught;
      n = await fountain.setStatues(pick.map((sp) => Sprites.still(sp, false) || (Sprites.resolve(sp, false, false) || {}).front));
    } catch (e) { n = 0; }
    note = `${ball ? 'ball on top' : 'plain top'}, ${n} statue${n === 1 ? '' : 's'}`;
  }
  /** put everything where the world's middle is now (the world changes size with the field window) */
  function place() {
    if (stage()) return;
    const on = shown && built;
    if (parts) for (const el of parts) el.hidden = !on;
    if (!on) { G.blocks = []; setTop(0, 0, 0, false); if (typeof Stations !== 'undefined') Stations.place(false); return; }
    const R = Fountain.ROWS, w = Fountain.SIZE.w * K, h = Fountain.SIZE.h * K, left = Math.round(G.W / 2 - w / 2), y0 = Math.round(G.H / 2 - h * 0.55), cx = left + Fountain.CX * K;
    [R.back, R.mid, R.front].forEach((row, i) => Object.assign(parts[i].style, { width: w + 'px', height: h + 'px', transform: `translate3d(${left}px, ${y0}px, 0)`, zIndex: String(Math.floor(y0 + row * K)) }));
    // nobody walks through the stone; Water types may get into the basin (src/game.js keeps feet out of G.blocks)
    G.blocks = [
      { name: 'fountain', x: cx, y: y0 + R.foot.y * K, rx: R.foot.rx * K, ry: R.foot.ry * K, pass: isWater },
      { name: 'column', x: cx, y: y0 + R.column.y * K, rx: R.column.rx * K, ry: R.column.ry * K },
    ];
    setTop(cx, y0 + (Fountain.TOP ? Fountain.TOP.y : 31) * K, (Fountain.TOP ? Fountain.TOP.r : 11) * K, true);      // (0.9.7: the fountain says where its ball is)
    if (typeof Stations !== 'undefined') { Stations.place(true); G.blocks = G.blocks.concat(Stations.blocks()); }
  }
  /** the world was laid out again (src/overlay.js): build, show, hide or move the square as that calls for */
  function sync() {
    if (stage()) return;
    const want = wanted();
    if (want && !built) build();
    shown = want && built;
    place();
  }

  // ------------------------------------------------------------------ the button on top of the fountain
  /** where the ball on top of the fountain is, in the world (the stage tells; the field window knows from place) */
  function setTop(x, y, r, on) {
    top = on ? { x, y, r } : null;
    const h = host();
    if (!h) return;
    if (!ring) {
      ring = document.createElement('div'); ring.className = 'sqTop'; ring.hidden = true;
      tip = document.createElement('div'); tip.className = 'stSign sqTip'; tip.hidden = true;
      h.appendChild(ring); h.appendChild(tip);
    }
    ring.hidden = !top; if (!top) tip.hidden = true;
    if (top) { ring.style.transform = `translate3d(${Math.round(x - r)}px, ${Math.round(y - r)}px, 0)`; ring.style.width = ring.style.height = r * 2 + 'px'; tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y - r - 34) + 'px'; }
  }
  const label = () => (typeof Online !== 'undefined' ? Online.buttonLabel() : 'Visit a random online Screen Trainer (not built yet)');
  /** what of the square is under the pointer (world coordinates): 'top' the fountain's button, 'care' a Day Care guest or its egg, or '' */
  function hit(x, y) {
    if (top && Math.hypot(x - top.x, y - top.y) <= top.r + 3) return 'top';
    if (!stage() && shown && typeof Stations !== 'undefined' && Stations.hit && Stations.hit(x, y)) return 'care';
    return '';
  }
  function down(what, x, y, button) {
    if (what !== 'top' || button !== 0) return;
    if (ring && ring.classList) { ring.classList.remove('press'); void ring.offsetWidth; ring.classList.add('press'); }
    try { Sound.play('select'); } catch (e) { /* silent */ }
    if (typeof Online !== 'undefined') Online.button();
    else G.toast({ title: 'Visiting other Trainers is not built yet', text: 'This button will take you to a random Screen Trainer who is online. Nothing in this version connects to anyone.', tone: 'info', dur: 6 });
  }
  function hover(on) {
    on = !!on && !!top;
    if (on === hot && (!on || (tip && tip.textContent === label()))) return;
    hot = on;
    if (tip) { tip.textContent = on ? label() : ''; tip.hidden = !on; }
    if (ring && ring.classList) ring.classList.toggle('hot', on);
  }

  return { MAP, sync, place, dress, setTop, hit, down, hover, state: () => ({ built, shown, note, top: top ? { x: Math.round(top.x), y: Math.round(top.y), r: top.r } : null, blocks: (G.blocks || []).map((b) => b.name) }) };
})();
if (typeof module !== 'undefined') module.exports = Square;
