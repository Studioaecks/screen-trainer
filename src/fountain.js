// Screen Trainer — the fountain in the middle of Fountain Square (the MyStream stage and the field window). Pure drawing
// on small canvases, no game rules.
//
// An original design, drawn in the same little squares as the field (src/field.js): a round stone basin, a bowl on a
// column that overflows into it, and a jet from the top. Nothing of it is a picture file. Two things come from the
// owner's own sprites folder at run time, like every other sprite in this program, and are simply left out when the
// folder has none: the ball on top (items/poke-ball.png) and up to two stone statues of Water types the player has
// caught, which spout into the basin.
//
// 0.9.7 (owner's list 11-16 update 14: "improve quality of the fountain, increase size so small details are easier to
// see"). The drawing is still written in design units (the 0.6 drawing, 176 x 150), but drawn S times finer: px() and
// oval() multiply every length by S and round to whole squares, so the fountain stands 25 % larger and stays crisp pixel
// art. New details: seams between the stones of the wall, carving round the rim and the bowl, moss, lily pads with a
// flower, coins shining on the bottom of the basin, and fish gliding under the water. Everything outside reads the
// scaled SIZE, BASE, CX, ROWS and TOP; nothing else knows about S.
//
// Fountain.create(canvas, { mid, front }) -> { draw(seconds), setFinial(url), setStatues([url, url]), SIZE, BASE, ROWS }
// The canvas is SIZE.w x SIZE.h squares; show it scaled up with image-rendering: pixelated. BASE is the row where the
// basin stands on the ground: sprites whose feet are lower than that belong in front of the fountain.
'use strict';

const Fountain = (() => {
  const S = 1.25, sc1 = (v) => Math.round(v * S);
  const SIZE = { w: sc1(176), h: sc1(150) }, BASE = sc1(126), CX = sc1(88), DCX = 88;      // (DCX: the middle in design units)
  const C = {
    shade: 'rgba(24, 66, 34, .30)', path: '#d9cfa4', path2: '#cbbf90', pebble: '#b9ad7e',
    stoneHi: '#e3e7ee', stone: '#bcc3ce', stoneMid: '#9aa3b1', stoneLo: '#757f8f', stoneDk: '#586172', moss: '#6aa862', moss2: '#4f8a4a',
    water: '#4f9fe0', waterHi: '#8cc8f6', waterLo: '#3d86c8', waterDk: '#2f6fae', foam: '#e8f7ff', spray: '#c9ecff',
    red: '#e8503c', pink: '#ff9ccf', yellow: '#ffe36a', white: '#ffffff', leaf: '#3f8f3c', violet: '#b58be8',
    pad: '#4fa04a', padHi: '#7cc86a', gold: '#f2c84b', goldHi: '#fff1a8', fish: '#e8743c', fishHi: '#ffb27a',
  };
  const hash = (n) => { n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x7feb352d); n = Math.imul((n ^ (n >>> 15)) >>> 0, 0x846ca68b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  // Depth (0.6). One picture cannot be both behind and in front of a Pokémon that is bathing in the basin, so the page
  // may hand over two more canvases: `mid` gets a copy of what rises out of the water (column, bowl, spire, jet) and
  // `front` a copy of the front wall and everything below it. Stacked at ROWS.back / .mid / .front (the rows where each
  // touches the ground or the water), a swimmer is drawn over the water, behind or before the column, and behind the wall.
  const ROWS = { back: sc1(89), mid: sc1(104), front: sc1(121), water: { y: sc1(106), rx: sc1(60), ry: sc1(9) }, foot: { y: sc1(108), rx: sc1(96), ry: sc1(24) }, column: { y: sc1(104), rx: sc1(12), ry: sc1(5) } };
  const TOP = { y: sc1(31), r: sc1(11) };                  // the ball on top, which is a button (src/square.js): its middle and its size
  function create(canvas, parts) {
    const mid = parts && parts.mid, front = parts && parts.front;
    for (const p of [mid, front]) if (p) { p.width = SIZE.w; p.height = SIZE.h; }
    const mc = mid && mid.getContext('2d'), fc = front && front.getContext('2d');
    function slices() {
      if (mc) { mc.clearRect(0, 0, SIZE.w, SIZE.h); mc.drawImage(canvas, CX - sc1(36), 0, sc1(72), sc1(69), CX - sc1(36), 0, sc1(72), sc1(69)); mc.drawImage(canvas, CX - sc1(9), sc1(69), sc1(18), sc1(36), CX - sc1(9), sc1(69), sc1(18), sc1(36)); }
      if (fc) {
        fc.clearRect(0, 0, SIZE.w, SIZE.h);
        const R = sc1(70);
        for (let x = -R; x <= R; x++) { const y0 = sc1(103) + Math.round(sc1(15) * Math.sqrt(Math.max(0, 1 - (x * x) / (R * R)))); fc.drawImage(canvas, CX + x, y0, 1, SIZE.h - y0, CX + x, y0, 1, SIZE.h - y0); }
      }
    }
    canvas.width = SIZE.w; canvas.height = SIZE.h;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    let finial = null, statues = [];
    const still = document.createElement('canvas'), sg = still.getContext('2d');       // everything that does not move, drawn once
    still.width = SIZE.w; still.height = SIZE.h;
    let stillDone = false;

    // design units -> squares. Neighbouring rows and columns meet without a gap (each edge is rounded on its own).
    const px = (g, x, y, w, h, col) => { g.fillStyle = col; const X = Math.round(x * S), Y = Math.round(y * S); g.fillRect(X, Y, Math.max(1, Math.round((x + w) * S) - X), Math.max(1, Math.round((y + h) * S) - Y)); };
    /** a filled ellipse (design units), row by row in squares: keeps the hard pixel edge */
    function oval(g, cx, cy, rx, ry, col, from, to) {
      g.fillStyle = col;
      const CXs = cx * S, CYs = Math.round(cy * S), RX = rx * S, RY = ry * S, f = from === undefined ? -RY : from * S, t = to === undefined ? RY : to * S;
      for (let dy = Math.ceil(Math.max(-RY, f)); dy <= Math.floor(Math.min(RY, t)); dy++) {
        const h = Math.round(RX * Math.sqrt(Math.max(0, 1 - (dy * dy) / (RY * RY))));
        if (h > 0) g.fillRect(Math.round(CXs - h), CYs + dy, h * 2, 1);
      }
    }
    const half = (rx, ry, dy) => Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    const rimY = (x) => 104 + 15 * Math.sqrt(Math.max(0, 1 - (x * x) / 4900));      // the front rim of the basin, x from the middle (design units)
    function flower(g, x, y, col) { px(g, x, y - 1, 1, 1, col); px(g, x - 1, y, 1, 1, col); px(g, x + 1, y, 1, 1, col); px(g, x, y + 1, 1, 1, col); px(g, x, y, 1, 1, C.yellow); px(g, x, y + 2, 1, 2, C.leaf); }

    function load(url) { return new Promise((res) => { if (!url) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }); }
    /** a sprite as a small stone figure: its own outline, in the fountain's greys (tall: design units) */
    function stoneFigure(img, tall, flip) {
      const k = (tall * S) / img.naturalHeight, w = Math.max(4, Math.round(img.naturalWidth * k)), h = Math.max(4, Math.round(tall * S));
      const t = document.createElement('canvas'); t.width = w; t.height = h;
      const g = t.getContext('2d'); g.imageSmoothingEnabled = false;
      if (flip) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(img, 0, 0, w, h);
      try {
        const d = g.getImageData(0, 0, w, h), a = d.data, greys = [[88, 97, 114], [117, 127, 143], [154, 163, 177], [188, 195, 206], [227, 231, 238]];
        for (let i = 0; i < a.length; i += 4) {
          if (a[i + 3] < 110) { a[i + 3] = 0; continue; }
          const l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) / 255, q = greys[Math.min(4, Math.floor(l * 5))];
          a[i] = q[0]; a[i + 1] = q[1]; a[i + 2] = q[2]; a[i + 3] = 255;
        }
        g.putImageData(d, 0, 0);
      } catch (e) { /* the picture cannot be read back: it keeps its own colours */ }
      return t;
    }

    function drawStill() {
      const g = sg, X = DCX;
      g.clearRect(0, 0, SIZE.w, SIZE.h);
      g.imageSmoothingEnabled = false;
      // the paved ring it stands on, and its shadow on the grass
      oval(g, X + 2, 129, 86, 19, C.shade);
      oval(g, X, 126, 84, 18, C.path2);
      oval(g, X, 125, 82, 17, C.path);
      for (let i = 0; i < 90; i++) { const a = hash(i * 7 + 1) * Math.PI * 2, r = 0.8 + hash(i * 13 + 5) * 0.18; px(g, X + Math.cos(a) * 80 * r, 125 + Math.sin(a) * 15.5 * r, 2, 1, i % 3 ? C.pebble : C.path2); }
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, x = X + Math.cos(a) * 83, y = 126 + Math.sin(a) * 17.6; px(g, x, y, 1.6, 0.8, C.path2); }      // the edge stones of the paving
      // flowers round the ring
      const cols = [C.red, C.pink, C.white, C.violet, C.yellow];
      for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2 + 0.2, x = X + Math.cos(a) * 85, y = 127 + Math.sin(a) * 19; if (y > 6 && y < 146 && x > 2 && x < 173 && Math.sin(a) > -0.75) flower(g, Math.round(x), Math.round(y), cols[i % cols.length]); }
      // the back of the basin wall (seen over the water), then the water, then the front wall
      oval(g, X, 104, 70, 15, C.stoneLo);
      oval(g, X, 104, 67, 13, C.stoneMid, -13, 0);
      for (let i = 0; i < 12; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / 12), x = X + Math.cos(a) * 68.5; px(g, x, 104 + Math.sin(a) * 14, 0.6, 1.4, C.stoneDk); }      // seams on the far wall
      oval(g, X, 105, 65, 12, C.waterLo);
      oval(g, X, 106, 63, 11, C.water);
      oval(g, X, 107, 50, 7, C.waterLo);                     // the deeper middle
      for (let i = 0; i < 9; i++) { const a = hash(i * 29 + 6) * Math.PI * 2, r = 0.25 + hash(i * 37 + 1) * 0.6; px(g, X + Math.cos(a) * 52 * r, 107 + Math.sin(a) * 6 * r, 1, 0.8, C.gold); px(g, X + Math.cos(a) * 52 * r + 0.8, 107 + Math.sin(a) * 6 * r, 0.6, 0.6, C.goldHi); }      // coins on the bottom
      // front wall: the band between the rim and the foot
      for (let dy = 0; dy <= 15; dy++) { const hTop = half(70, 15, dy); px(g, X - hTop, 104 + dy, hTop * 2, 1, C.stone); }
      for (let row = 0; row < 10; row++) {
        const y = 110 + row, outer = half(70, 15, Math.min(15, row + 2)), wide = Math.max(half(70, 15, 4), half(70, 15, Math.max(0, row - 4))), hw = Math.min(70, Math.max(outer, wide));
        px(g, X - hw, y, hw * 2, 1, row < 1 ? C.stoneHi : row < 6 ? C.stone : row < 8 ? C.stoneMid : C.stoneLo);
      }
      // seams between the stones of the front wall: two courses, the joints staggered
      for (let x = -66; x <= 66; x += 1) {
        const y = rimY(x);
        if (Math.abs(x) < 67) px(g, X + x, y + 3.4, 1, 0.5, C.stoneMid);
        const j = (((x + 70) % 12) + 12) % 12, j2 = (((x + 64) % 12) + 12) % 12;
        if (j === 0) px(g, X + x, y + 0.9, 0.6, 2.5, C.stoneMid);
        if (j2 === 0 && Math.abs(x) < 62) px(g, X + x, y + 3.9, 0.6, 2.2, C.stoneLo);
      }
      // carve the water back out of the front wall's top: the inner edge of the rim
      oval(g, X, 105, 65, 12, C.waterLo, 0, 12);
      oval(g, X, 106, 63, 11, C.water, 0, 11);
      oval(g, X, 107, 50, 7, C.waterLo, 0, 7);
      // rim highlight and the wall's foot
      for (let x = -68; x <= 68; x += 1) { const y = Math.round(rimY(x)); px(g, X + x, y - 1, 1, 1, C.stoneHi); px(g, X + x, y + 5, 1, 1, C.stoneMid); px(g, X + x, y + 6, 1, 1, C.stoneLo); px(g, X + x, y + 7, 1, 1, C.stoneDk); }
      for (let x = -69; x <= 69; x++) { const y = Math.round(rimY(x)); for (let k = 0; k < 5; k++) px(g, X + x, y + k, 1, 1, k === 0 ? C.stoneHi : (Math.abs(x) % 14 === 0 ? C.stoneMid : C.stone)); }
      for (let x = -63; x <= 63; x += 7) { const y = rimY(x); px(g, X + x, y + 1.6, 1.2, 1.2, C.stoneMid); px(g, X + x + 0.3, y + 1.6, 0.6, 0.5, C.stoneHi); }      // carved studs on the rim
      for (let i = 0; i < 12; i++) { const x = Math.round(-62 + i * 11.3 + hash(i + 40) * 4), y = Math.round(rimY(x)); if (hash(i + 90) < 0.6) { px(g, X + x, y + 5, 3, 1, C.moss); px(g, X + x + 1, y + 6, 1.4, 0.8, C.moss2); } }      // moss at the foot
      // lily pads on the water, one with a flower
      const pad = (x, y, r, flowerToo) => { oval(g, x, y, r, r * 0.42, C.pad); oval(g, x - r * 0.25, y - r * 0.12, r * 0.55, r * 0.2, C.padHi); px(g, x + r * 0.15, y - r * 0.42, r * 0.5, 0.7, C.water); if (flowerToo) { px(g, x - 0.6, y - 1.6, 1.4, 1.2, C.pink); px(g, x - 1.4, y - 1, 1, 0.8, C.pink); px(g, x + 0.6, y - 1, 1, 0.8, C.pink); px(g, x - 0.2, y - 1.2, 0.6, 0.5, C.yellow); } };
      pad(X - 44, 104, 5, true); pad(X + 40, 110, 4, false); pad(X + 51, 103, 3, false);
      // the column out of the water
      px(g, X - 9, 99, 18, 5, C.stoneLo); px(g, X - 8, 98, 16, 2, C.stoneMid);
      px(g, X - 5, 66, 10, 33, C.stone); px(g, X - 5, 66, 3, 33, C.stoneHi); px(g, X + 2, 66, 3, 33, C.stoneMid); px(g, X - 6, 80, 12, 2, C.stoneMid); px(g, X - 6, 79, 12, 1, C.stoneHi);
      px(g, X - 6, 92, 12, 1.4, C.stoneMid); px(g, X - 6, 91.4, 12, 0.6, C.stoneHi);      // a second ring on the column
      for (let y = 70; y < 98; y += 4) px(g, X - 1, y, 0.6, 2, C.stoneMid);                // fluting
      // the bowl: underside, rim, water, and a band of carving round it
      for (let dy = 0; dy <= 9; dy++) { const hw = half(31, 10, dy); px(g, X - hw, 58 + dy, hw * 2, 1, dy < 3 ? C.stone : dy < 6 ? C.stoneMid : C.stoneLo); }
      for (let x = -27; x <= 27; x += 4.5) { const y = 60 + 4 * Math.sqrt(Math.max(0, 1 - (x * x) / 900)); px(g, X + x, y, 1.2, 1.2, C.stoneHi); px(g, X + x + 0.4, y + 1.2, 0.8, 0.6, C.stoneLo); }
      oval(g, X, 57, 33, 7, C.stoneHi);
      oval(g, X, 57, 31, 6, C.stoneMid);
      oval(g, X, 57, 29, 5, C.waterLo);
      oval(g, X, 58, 27, 4, C.water);
      // the spire and the top
      px(g, X - 3, 42, 6, 15, C.stone); px(g, X - 3, 42, 2, 15, C.stoneHi); px(g, X + 1, 42, 2, 15, C.stoneMid);
      px(g, X - 4, 49, 8, 1.2, C.stoneMid);
      px(g, X - 6, 40, 12, 3, C.stoneMid); px(g, X - 6, 39, 12, 1, C.stoneHi);
      if (finial) { const s = sc1(18); g.drawImage(finial, CX - s / 2, sc1(39) - s + sc1(2), s, s); }
      else { oval(g, X, 32, 8, 8, C.stoneMid); oval(g, X - 1, 31, 7, 7, C.stone); px(g, X - 4, 27, 3, 2, C.stoneHi); px(g, X - 8, 32, 16, 1, C.stoneLo); }
      // statues on their plinths, left and right of the basin, facing the middle
      statues.forEach((s, i) => {
        if (!s) return;
        const side = i === 0 ? -1 : 1, bx = X + side * 76;
        px(g, bx - 9, 116, 18, 6, C.stoneMid); px(g, bx - 9, 116, 18, 1, C.stoneHi); px(g, bx - 9, 121, 18, 1, C.stoneLo); px(g, bx - 8, 122, 16, 1, C.shade);
        px(g, bx - 9, 118.5, 18, 0.6, C.stoneLo);
        g.drawImage(s, Math.round(bx * S - s.width / 2), sc1(116) - s.height);
      });
      stillDone = true;
    }

    /** t: seconds. Draws one picture of the fountain. */
    function draw(t) {
      if (!stillDone) drawStill();
      const X = DCX;
      c.clearRect(0, 0, SIZE.w, SIZE.h);
      c.drawImage(still, 0, 0);
      const step = Math.floor(t * 12);
      // fish gliding under the water (drawn first: the ripples go over them)
      for (let i = 0; i < 3; i++) {
        const sp = 0.05 + i * 0.017, a = t * sp * Math.PI * 2 * (i % 2 ? -1 : 1) + i * 2.1, r = 0.45 + 0.25 * Math.sin(t * 0.3 + i);
        const x = X + Math.cos(a) * 54 * r, y = 107 + Math.sin(a) * 6.5 * r, dir = (i % 2 ? -1 : 1) * (Math.sin(a) >= 0 ? -1 : 1);
        px(c, x - 2, y, 4, 1.2, i === 2 ? C.waterDk : C.fish); px(c, x - (dir > 0 ? 3 : -2.2), y - 0.2, 1.2, 1.6, i === 2 ? C.waterDk : C.fish); px(c, x + (dir > 0 ? 1 : -2), y, 1, 0.6, C.fishHi);
      }
      // ripples on the basin: short light strokes that drift outward from where the water lands
      for (let i = 0; i < 30; i++) {
        const a = hash(i * 11 + 3) * Math.PI * 2, life = ((t * 0.22 + hash(i * 5 + 1)) % 1), r = 0.25 + life * 0.7;
        const x = X + Math.cos(a) * 60 * r, y = 106 + Math.sin(a) * 9.5 * r;
        if (y < 97 || (Math.abs(x - X) < 8 && y < 104)) continue;
        px(c, x - 2, y, life < 0.7 ? 4 : 2, 1, life < 0.5 ? C.waterHi : C.spray);
      }
      // ripples in the bowl
      for (let i = 0; i < 7; i++) { const a = hash(i * 17 + 9) * Math.PI * 2, life = (t * 0.5 + hash(i * 3 + 2)) % 1; px(c, X + Math.cos(a) * 22 * life - 1, 58 + Math.sin(a) * 3 * life, 3, 1, C.waterHi); }
      // the bowl overflows: threads of water from its rim down into the basin
      for (let i = 0; i < 11; i++) {
        const u = -1 + (i + 0.5) * (2 / 11), x = X + u * 29, top = 59 + Math.round(6 * Math.sqrt(Math.max(0, 1 - u * u))), bottom = 103 + Math.round(5 * (1 - Math.abs(u)));
        for (let y = top; y < bottom; y++) {
          const k = (y * 3 + step * 5 + i * 7) % 11;
          if (k < 7) px(c, x, y, i % 2 ? 0.8 : 1.6, 1, k < 2 ? C.foam : k < 5 ? C.spray : C.waterHi);
        }
        const sp = (step + i * 3) % 6;                      // where a thread lands
        px(c, x - 2 - (sp >> 1), bottom, 2, 1, C.foam); px(c, x + 2 + (sp >> 1), bottom, 2, 1, C.foam); if (sp < 3) px(c, x, bottom - 1 - sp, 1, 1, C.foam);
      }
      // the jet from the top: drops rise from the ball and fall back into the bowl
      const topY = finial ? 22 : 23;
      for (let i = 0; i < 40; i++) {
        const life = (t * 0.9 + i / 40) % 1, dir = (hash(i * 23 + 7) - 0.5) * 2, vx = dir * 19, up = 24 + hash(i * 31 + 2) * 9;
        const x = X + vx * life, y = topY - up * 4 * life * (1 - life) + (57 - topY) * life * life;
        if (y > 56 && Math.abs(x - X) > 27) continue;
        px(c, x, y, 0.8, life < 0.12 ? 1.6 : 0.8, i % 3 === 0 ? C.foam : C.spray);
        if (i % 4 === 0) px(c, x + (dir > 0 ? -0.8 : 0.8), y + 0.8, 0.8, 0.8, C.waterHi);
      }
      px(c, X - 1, topY - 2 - (step % 2), 2, 3, C.foam);
      // the statues spout an arc into the basin
      statues.forEach((s, i) => {
        if (!s) return;
        const side = i === 0 ? -1 : 1, x0 = X + side * 70, y0 = 116 - (s.height / S) * 0.62, x1 = X + side * 38, y1 = 105;
        for (let k = 0; k < 18; k++) {
          const life = (t * 1.1 + k / 18) % 1, x = x0 + (x1 - x0) * life, y = y0 + (y1 - y0) * life - 16 * 4 * life * (1 - life) * 0.5;
          px(c, x, y, 0.8, 0.8, k % 3 ? C.spray : C.foam); if (k % 2) px(c, x, y + 0.8, 0.8, 0.8, C.waterHi);
        }
        const sp = step % 4; px(c, x1 - 2 - sp, y1 + 1, 2, 1, C.foam); px(c, x1 + 1 + sp, y1 + 1, 2, 1, C.foam);
      });
      // glints on the water, and now and then a coin flashes
      for (let i = 0; i < 11; i++) { const on = hash(i * 41 + Math.floor(t * 2.5 + i * 0.37)) < 0.28; if (on) { const a = hash(i * 9 + 4) * Math.PI * 2, r = 0.2 + hash(i * 19) * 0.75; px(c, X + Math.cos(a) * 58 * r, 106 + Math.sin(a) * 9 * r, 0.8, 0.8, C.white); } }
      for (let i = 0; i < 9; i++) if (hash(i * 53 + Math.floor(t * 1.3 + i * 0.61)) < 0.12) { const a = hash(i * 29 + 6) * Math.PI * 2, r = 0.25 + hash(i * 37 + 1) * 0.6; px(c, X + Math.cos(a) * 52 * r + 0.4, 107 + Math.sin(a) * 6 * r - 0.4, 0.8, 0.8, C.white); }
      slices();
      return true;
    }

    return {
      draw, SIZE, BASE, ROWS, TOP,
      async setFinial(url) { const img = await load(url); finial = img; stillDone = false; return !!img; },
      async setStatues(urls) {
        const imgs = await Promise.all((urls || []).slice(0, 2).map(load));
        statues = imgs.map((img, i) => (img && img.naturalHeight ? stoneFigure(img, 26, i === 0) : null));      // front sprites look to the left: the left statue is turned to face the water
        stillDone = false;
        return statues.filter(Boolean).length;
      },
    };
  }
  return { create, SIZE, BASE, ROWS, CX, TOP, S };
})();
if (typeof module !== 'undefined') module.exports = Fountain;
