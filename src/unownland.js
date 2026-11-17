// Screen Trainer — the Living Background of the Unown Notepad (0.9.8.1, the owner's idea).
//
// A blank page is grass. A word the page recognises (love, fire, sea, night ...) changes the ground: slowly, spreading
// outward from where the word stands, until one word alone has changed the whole page. With more such words on the page
// each has its own ground, and where two meet they either merge (kindred grounds blend into each other) or fight (fire
// and water, love and war: the border flickers back and forth). So what is written settles into a living map of itself.
//
// The owner's note for "love" (IdeaFor-love.unown) is what its ground is drawn from: a deeper, velvety emerald that
// holds the golden warmth of late afternoon; soft like moss; tall, tangled growth with clover, chamomile and tiny
// blossoms woven in; alive all year (it never withers at a border: love holds its ground a little better); and a
// breeze moving over it.
//
// UnownLand.seeds(chars, places) -> [{ key, theme, x, y }] the recognised words of a text, where places are Unown.layout's
// UnownLand.draw(g, t, { x, y, w, h, cell, seeds: [{ theme, x, y, born }], ox, oy }) paints the ground of the page's
//   visible part (x, y, w, h on the canvas; ox, oy: where that part lies on the page; seed places are page coordinates).
// Nothing here is a picture file: every ground is a few colours and rules. To add a ground: a THEMES entry, its words in
// WORDS, and FOES if it should fight somebody.
'use strict';

const UnownLand = (() => {
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const T = (o) => Object.assign(o, { c: o.c.map(hex), deco: (o.deco || []).map(hex) });
  // c: the ground's colours, dark to light. deco: specks on it (flowers, embers, stars). rate: how many cells have a
  // speck. twinkle: specks come and go. sheen: a band of light drifting over it (colour, strength). hold: how well it
  // stands its ground at a border (love: a little better).
  const GRASS = T({ c: ['#3f8f3f', '#4fa64a', '#62b857', '#74c865'], deco: ['#8fd97a'], rate: 0.03 });
  const THEMES = {
    love: T({ c: ['#0e5e3a', '#127a48', '#1a9457', '#2bb06a'], deco: ['#ffffff', '#fff2a8', '#ff9ccf', '#f6d7ff', '#e9c46a'], rate: 0.11, sheen: ['#ffd27a', 0.34], tall: true, hold: 14 }),
    life: T({ c: ['#2c8a2c', '#3fa63c', '#5cc24e', '#86d96a'], deco: ['#ff8fd0', '#ffe36a', '#ffffff', '#b58be8', '#ff6b6b'], rate: 0.14 }),
    fire: T({ c: ['#4a1408', '#8a2a0a', '#c4500c', '#ee8a1c'], deco: ['#ffd24a', '#fff3b0', '#ff5a1c'], rate: 0.1, twinkle: 5 }),
    water: T({ c: ['#184a84', '#2468b0', '#3f8cd6', '#6ab0ec'], deco: ['#c9ecff', '#ffffff'], rate: 0.07, twinkle: 2, sheen: ['#bfe6ff', 0.2] }),
    ice: T({ c: ['#9fcfe0', '#c2e4f0', '#e2f4fb', '#f6fcff'], deco: ['#ffffff', '#8fd0ee'], rate: 0.08, twinkle: 1.5 }),
    night: T({ c: ['#090d28', '#11173f', '#1a2358', '#263070'], deco: ['#fff6c2', '#ffffff', '#b9c6ff'], rate: 0.05, twinkle: 0.8 }),
    sun: T({ c: ['#c49a1c', '#dcb432', '#f0cc50', '#fbe27e'], deco: ['#fff8d0', '#ffffff'], rate: 0.06, sheen: ['#fffbe0', 0.3] }),
    death: T({ c: ['#262424', '#383434', '#4c4646', '#625a58'], deco: ['#d8d2c8', '#8a7f7a'], rate: 0.04 }),
    war: T({ c: ['#3c2414', '#5a341c', '#744424', '#8c5630'], deco: ['#c0392b', '#2b2b2b', '#e06030'], rate: 0.07, twinkle: 3 }),
    peace: T({ c: ['#6ab870', '#88cf8c', '#a8e2ac', '#c8f2ca'], deco: ['#ffffff', '#fdfde8'], rate: 0.1 }),
    storm: T({ c: ['#32374a', '#474e68', '#5f6888', '#7882a4'], deco: ['#fff27a', '#ffffff'], rate: 0.025, twinkle: 9 }),
    dream: T({ c: ['#33184f', '#4c2574', '#6a369c', '#8a4fc0'], deco: ['#f0c6ff', '#ffffff', '#9fe8ff'], rate: 0.07, twinkle: 1.2, sheen: ['#f0c6ff', 0.2] }),
    stone: T({ c: ['#5c6068', '#767b84', '#9096a0', '#aab0ba'], deco: ['#c9ced6', '#6aa862'], rate: 0.05 }),
    gold: T({ c: ['#8a6410', '#b88a18', '#dcae28', '#f4cf50'], deco: ['#fff6c0', '#ffffff'], rate: 0.09, twinkle: 4 }),
    sorrow: T({ c: ['#3a4a5e', '#4a5e76', '#5e7490', '#7a90aa'], deco: ['#b8d4f0', '#dfeeff'], rate: 0.09, twinkle: 6 }),
  };
  const WORDS = {
    love: 'love loved loves loving lover beloved adore adored heart hearts kiss kissed hug hugs cherish darling sweetheart affection romance tender devotion',
    life: 'life live alive grow grows growing grew bloom blooms blossom flower flowers garden spring seed seeds leaf leaves tree trees forest meadow green birth born',
    fire: 'fire fires flame flames burn burns burning burned blaze ember embers inferno lava magma volcano scorch heat hot rage fury anger angry',
    water: 'water waters sea seas ocean oceans river rivers lake lakes wave waves tide rain raining stream swim swimming flood drown blue',
    ice: 'ice icy snow snows snowing snowy frost frozen freeze freezing cold winter glacier blizzard chill',
    night: 'night nights midnight moon moonlight star stars dark darkness shadow shadows dusk evening sleep asleep',
    sun: 'sun sunny sunshine sunlight day dawn morning light bright summer warm warmth joy happy happiness smile laugh laughter',
    death: 'death dead die dies died dying grave graves ghost ghosts bone bones decay rot ash ashes end ended tomb',
    war: 'war wars battle battles fight fights fighting fought hate hated hatred enemy enemies blood sword kill killed attack',
    peace: 'peace peaceful calm quiet still gentle rest serene harmony kind kindness friend friends friendship together',
    storm: 'storm storms thunder lightning tempest wind winds gale hurricane electric shock',
    dream: 'dream dreams dreaming dreamed dreamt magic magical wonder wish wishes hope hopes imagine mystery spell',
    stone: 'stone stones rock rocks mountain mountains cave hard steel iron wall walls strong',
    gold: 'gold golden treasure rich riches coin coins money crown jewel jewels shine shiny',
    sorrow: 'sad sadness sorrow cry cries crying cried tear tears grief lonely alone miss missed lost pain hurt',
  };
  const DICT = new Map();
  for (const k of Object.keys(WORDS)) for (const w of WORDS[k].split(' ')) DICT.set(w, k);
  // who fights whom (everything else merges)
  const FOES = new Set(['fire|water', 'fire|ice', 'love|war', 'love|death', 'life|death', 'sun|night', 'peace|war', 'sun|storm', 'sun|sorrow', 'ice|sun', 'dream|war', 'life|war', 'fire|life', 'gold|sorrow']);
  const fights = (a, b) => a !== b && (FOES.has(a + '|' + b) || FOES.has(b + '|' + a));

  /** the recognised words of a text. places: Unown.layout(chars, ...) (same length). key tells one standing word from
   *  another, so that a word keeps its ground (and the time it has had to spread) while the text round it changes. */
  function seeds(chars, places) {
    const out = [], seen = {};
    let i = 0;
    while (i < chars.length) {
      if (!/\p{L}/u.test(chars[i])) { i++; continue; }
      let j = i; while (j < chars.length && /[\p{L}'’]/u.test(chars[j])) j++;
      const word = chars.slice(i, j).join('').toLowerCase().replace(/['’]s$/, ''), theme = DICT.get(word);
      if (theme) {
        const a = places[i], b = places[j - 1], n = (seen[word] = (seen[word] || 0) + 1);
        out.push({ key: `${word}#${n}`, word, theme, col: a.row === b.row ? (a.col + b.col + 1) / 2 : a.col + 0.5, row: a.row });
      }
      i = j;
    }
    return out;
  }

  // ---------------------------------------------------------------- painting
  const h2 = (x, y, k) => { let n = Math.imul(x * 374761393 + y * 668265263 + k * 2147483647, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
  const CALM = 0.45;                                      // how far every square is drawn toward its ground's middle colour (0 = raw, 1 = flat)
  const SPEED = 34;                                       // pixels a second a ground spreads from its word
  const WOBBLE = 26;                                      // how ragged and restless a border is, in pixels
  let buf = null, bw = 0, bh = 0, off = null, og = null;
  function cellColor(theme, cx, cy, t, px, py) {
    const th = theme ? THEMES[theme] : GRASS, r = h2(cx, cy, 1);
    // tall, tangled growth (love): the blades lean in strands instead of lying as even specks
    const lean = th.tall ? h2(cx + Math.floor(cy * 0.5 + h2(cx, 0, 3) * 3), Math.floor(cy / 3), 2) : r;
    let col = th.c[Math.min(3, Math.floor(lean * 4))], deco = false;
    if (th.rate && h2(cx, cy, 5) < th.rate) {
      const on = !th.twinkle || h2(cx, cy, 7 + Math.floor(t * th.twinkle + h2(cx, cy, 9) * 10)) < 0.5;
      if (on) { col = th.deco[Math.floor(h2(cx, cy, 11) * th.deco.length)]; deco = true; }
    }
    let R = col[0], G = col[1], B = col[2];
    if (!deco) { const m = th.mean || (th.mean = [0, 1, 2].map((k) => (th.c[1][k] + th.c[2][k]) / 2)); R += (m[0] - R) * CALM; G += (m[1] - G) * CALM; B += (m[2] - B) * CALM; }      // a quieter ground: the writing has to be read on it
    // the breeze: a slow band of lighter ground drifting across; for a ground with a sheen (love's late-afternoon gold) in its colour
    const wind = Math.sin(px * 0.012 + py * 0.007 - t * 0.6) * 0.5 + Math.sin(px * 0.004 - t * 0.23 + 1.7) * 0.5;
    if (th.sheen) { const k = Math.max(0, wind) * th.sheen[1], s = th.sheenRgb || (th.sheenRgb = hex(th.sheen[0])); R += (s[0] - R) * k; G += (s[1] - G) * k; B += (s[2] - B) * k; }
    else { const k = 1 + wind * 0.05; R *= k; G *= k; B *= k; }
    return [R, G, B];
  }
  /** g: 2D context. o: { x, y, w, h (the visible part of the page on the canvas), ox, oy (where that part is on the page),
   *  cell (pixels a square), seeds: [{ theme, x, y, born }] (page pixels; born: seconds, the clock of t) } */
  function draw(g, t, o) {
    const cell = o.cell || 6, cols = Math.ceil(o.w / cell) + 1, rows = Math.ceil(o.h / cell) + 1;
    if (cols < 1 || rows < 1) return;
    if (!buf || bw !== cols || bh !== rows) { bw = cols; bh = rows; off = document.createElement('canvas'); off.width = cols; off.height = rows; og = off.getContext('2d'); buf = og.createImageData(cols, rows); }
    const d = buf.data, S = o.seeds || [], cx0 = Math.floor(o.ox / cell), cy0 = Math.floor(o.oy / cell), flick = Math.floor(t * 3.2);
    const reach = S.map((s) => Math.max(0, t - s.born) * SPEED + (THEMES[s.theme].hold || 0));
    for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
      const cx = cx0 + rx, cy = cy0 + ry, px = cx * cell, py = cy * cell;
      let best = -1, bs = -1e9, second = -1, ss = -1e9;
      if (S.length) {
        const wob = (h2(cx >> 2, cy >> 2, 21) - 0.5) * WOBBLE + Math.sin(t * 0.7 + h2(cx >> 3, cy >> 3, 23) * 6.28) * WOBBLE * 0.35;
        for (let i = 0; i < S.length; i++) {
          const dx = px - S[i].x, dy = py - S[i].y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > reach[i] + WOBBLE) continue;         // it has not come this far yet
          const sc = -dist + (THEMES[S[i].theme].hold || 0) + wob * (i % 2 ? 1 : -1);
          if (sc > bs) { second = best; ss = bs; best = i; bs = sc; } else if (sc > ss) { second = i; ss = sc; }
        }
      }
      let theme = best >= 0 ? S[best].theme : '';
      if (best >= 0) {
        const edge = reach[best] - Math.sqrt((px - S[best].x) ** 2 + (py - S[best].y) ** 2);      // how far inside its spreading front
        if (edge < 22 && h2(cx, cy, 31) > (edge + WOBBLE * 0.5) / (22 + WOBBLE * 0.5)) theme = '';      // the front: it comes blade by blade
        else if (second >= 0 && S[second].theme !== theme) {
          const gap = bs - ss, other = S[second].theme;
          if (fights(theme, other)) { if (gap < 30 && h2(cx >> 1, cy >> 1, 41 + flick) < 0.5 - gap / 60) theme = other; }      // a fight: the border flickers back and forth
          else if (gap < 46 && h2(cx, cy, 43) < 0.5 - gap / 92) theme = other;                                                  // kindred: they grow into each other
        }
      }
      const c = cellColor(theme, cx, cy, t, px, py), k = (ry * cols + rx) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    og.putImageData(buf, 0, 0);
    g.save();
    g.beginPath(); g.rect(o.x, o.y, o.w, o.h); g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(off, o.x - (o.ox - cx0 * cell), o.y - (o.oy - cy0 * cell), cols * cell, rows * cell);
    g.restore();
  }
  return { seeds, draw, fights, THEMES, WORDS, DICT, SPEED };
})();
if (typeof module !== 'undefined') module.exports = UnownLand;
