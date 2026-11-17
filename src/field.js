// Screen Trainer — the field: the ground drawn in the field window (windowed mode) and behind the game in the
// Android app. Pure drawing on one canvas, no game rules.
//
// The field is generated from a seed, and the seed is the Pokémon you have caught:
//   - nobody caught yet: a plain grass field;
//   - every species you have caught plants one patch of ground of its first type (a pond for a Water type, snow for
//     an Ice type, scorched earth for a Fire type ...) and a smaller one of its second type. Where a patch lies is
//     worked out from the species' Pokédex number, so it never moves: catching something new adds to the field and
//     leaves the rest as it was. The more of a species you have caught, the larger its patch.
//   - the seed number shown in Options is a fingerprint of the whole set; two players with the same Pokédex have
//     the same field.
// Places are stored as shares of the field's width and height, so the same field fits any window size.
//
// Since 0.7 the field window and the MyStream stage grow their ground another way (partyPlan below): from the Pokémon
// that are there, one equal share of the field each. The six team members get a sixth each; while the Box is open
// every Pokémon in the Box gets its share (158 Pokémon: one 158th each). A share is ground of that Pokémon's first
// type, with a smaller part of its second type. Standing on ground of a move's type strengthens the move
// (G.groundType in src/game.js asks typeAt here).
//
// To change how a type looks: its row in TERRAIN (three ground colours, then what grows or lies on it).
// To add a decoration: a few rows of characters in GLYPH (each character is one little square, '.' is empty).
'use strict';

const Field = (() => {
  const CELL = 8;                 // one square of ground, in CSS pixels
  const DOT = 2;                  // one little square of a decoration
  const HEDGE = 10;               // the border that stands for the barriers
  const MAX_PATCHES = 150;        // with a full Pokédex the smallest patches are left out

  // colours used by the decorations
  const INK = { a: '#3f8f3c', b: '#2f7a34', w: '#ffffff', y: '#ffe36a', p: '#ff9ccf', r: '#e8503c', o: '#ff9a3c', k: '#3a2a26', l: '#bfe9ff', d: '#7d8590', D: '#5b626d', s: '#e9dcae',
    c: '#9be4ff', C: '#e8fbff', v: '#b58be8', V: '#7a4fc0', g: '#57b86a', n: '#8a5a34', m: '#f4f1e8', e: '#ffd23c', t: '#cfd6de', u: '#48607a', f: '#f7b6e6', q: '#6a4a8a', i: '#d9f3ff' };
  const GLYPH = {
    tuft: ['a.a..', '.a.a.', '.aba.'], tuft2: ['.a.', 'a.a', 'aba'],
    daisy: ['.w.', 'wyw', '.w.'], pink: ['.p.', 'pyp', '.p.'], red: ['.r.', 'ryr', '.r.'], bell: ['.v.', 'vyv', '.v.'], sun: ['.e.', 'eoe', '.e.'],
    pebble: ['.tt.', 'tddD'], rock: ['.dd..', 'dttd.', 'dddDD', '.DDD.'], ripple: ['ll....', '...ll.'], ripple2: ['..l.', 'l...'], lily: ['.gg.', 'ggpg', '.gg.'],
    ember: ['.o.', 'oeo', '.r.'], crack: ['k...', '.ko.', '..k.', '.ok.'], flake: ['i.i', '.C.', 'i.i'], drift: ['.CC.', 'CCCC'], crystal: ['.c.', 'cCc', 'cCc', '.c.'],
    bolt: ['.e', 'ee', 'e.'], rivet: ['D..D', '....', '....', 'D..D'], plate: ['tttt', 't..t', 'tttt'], shroom: ['.rr.', 'rwrr', '.mm.'], pshroom: ['.VV.', 'VfVV', '.mm.'],
    stone: ['.DD.', 'DddD', 'DddD'], wisp: ['.v.', 'vCv', '.v.'], leaf: ['o.', '.n'], twig: ['n..', '.n.', '..n'], feather: ['..m', '.m.', 'm..'], star: ['.f.', 'fCf', '.f.'],
    claw: ['k.k.k', '.k.k.'], dune: ['s..s', '.ss.'], shell: ['.m.', 'mfm'], print: ['n.n', '...', '.n.'], bubble: ['.V.', 'V.V', '.V.'], gem: ['.u.', 'ucu', '.u.'], spark: ['e'],
  };
  // type -> [name, [three ground colours], rim colour (drawn where it meets other ground), [decoration, how often]...]
  const TERRAIN = {
    grass0: ['grass', ['#74c365', '#6cbc5d', '#7dca6e'], null, ['tuft', 0.09], ['tuft2', 0.06], ['daisy', 0.012]],
    normal: ['meadow', ['#8fd27a', '#86cb71', '#99d985'], null, ['daisy', 0.07], ['tuft2', 0.07], ['sun', 0.02]],
    grass: ['tall grass', ['#4fa851', '#46a04a', '#5ab35b'], '#3a8a40', ['tuft', 0.4], ['tuft2', 0.22], ['red', 0.03]],
    bug: ['thicket', ['#5c9a3c', '#548f38', '#66a644'], '#447a30', ['leaf', 0.16], ['tuft', 0.14], ['twig', 0.05], ['shroom', 0.015]],
    water: ['pond', ['#4f9fe0', '#4796d8', '#5aa9e8'], '#e3d7a4', ['ripple', 0.13], ['ripple2', 0.1], ['lily', 0.025]],
    ice: ['snow', ['#eef8ff', '#e2f1fb', '#f8fdff'], '#bcdcf0', ['flake', 0.08], ['drift', 0.06], ['crystal', 0.012]],
    fire: ['scorched earth', ['#6b4a3c', '#624236', '#755243'], '#3f2a22', ['crack', 0.1], ['ember', 0.05], ['pebble', 0.03]],
    ground: ['sand', ['#e2cd8c', '#dac482', '#ead698'], '#c5ad6a', ['dune', 0.12], ['pebble', 0.03], ['shell', 0.012]],
    rock: ['rocky ground', ['#a79f8e', '#9d9584', '#b1a999'], '#7f7868', ['pebble', 0.14], ['rock', 0.05]],
    electric: ['charged grass', ['#b7cf52', '#aec64a', '#c2d95e'], '#8fa63a', ['bolt', 0.05], ['sun', 0.06], ['spark', 0.1]],
    poison: ['mire', ['#7a5f96', '#72588e', '#8469a0'], '#58406f', ['bubble', 0.08], ['pshroom', 0.03], ['tuft2', 0.04]],
    psychic: ['dream flowers', ['#93c98a', '#8bc283', '#9ed294'], null, ['star', 0.1], ['pink', 0.12], ['bell', 0.05]],
    fairy: ['fairy ring', ['#a8dca0', '#a0d598', '#b3e5ab'], null, ['pink', 0.16], ['pshroom', 0.04], ['star', 0.05], ['daisy', 0.06]],
    fighting: ['training ground', ['#b98d62', '#b0845a', '#c3986d'], '#8f6a44', ['print', 0.1], ['pebble', 0.04]],
    flying: ['windswept grass', ['#9bd8a4', '#92d09b', '#a6e1ae'], null, ['feather', 0.05], ['tuft2', 0.12]],
    ghost: ['graveyard soil', ['#5d5a6e', '#555266', '#676478'], '#3f3d4e', ['stone', 0.035], ['wisp', 0.04], ['tuft2', 0.03]],
    dark: ['shaded grass', ['#3d6f4a', '#366644', '#467a53'], '#2b5237', ['claw', 0.04], ['tuft', 0.14]],
    dragon: ['crystal ground', ['#5f78b8', '#5770ae', '#6a83c4'], '#3f5590', ['gem', 0.07], ['crystal', 0.04]],
    steel: ['metal plates', ['#aab4be', '#a1abb5', '#b5bec8'], '#7c8792', ['rivet', 0.25], ['plate', 0.03]],
  };

  // ---- numbers from numbers: everything here is decided by hashing, never by Math.random, so a field is repeatable
  const hash = (n) => { n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x7feb352d); n = Math.imul((n ^ (n >>> 15)) >>> 0, 0x846ca68b); return (n ^ (n >>> 16)) >>> 0; };
  const h2 = (a, b) => hash((hash(a | 0) ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0);
  const unit = (a, b) => h2(a, b) / 4294967296;
  /** smooth noise, 0..1 */
  function noise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = (t) => t * t * (3 - 2 * t);
    const v = (i, j) => unit(h2(xi + i, yi + j), seed);
    const a = v(0, 0), b = v(1, 0), c = v(0, 1), d = v(1, 1), u = s(fx), w = s(fy);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }

  /** the caught species as a sorted list of Pokédex numbers. caught: { species: how many } or a list */
  const speciesOf = (caught) => (Array.isArray(caught) ? caught.map(Number) : Object.keys(caught || {}).filter((k) => caught[k] > 0).map(Number)).filter((n) => n > 0).sort((a, b) => a - b);
  /** the seed: a fingerprint of the set of caught species (0 when there are none) */
  function seedOf(caught) {
    let h = 2166136261;
    for (const sp of speciesOf(caught)) { h ^= sp & 0xff; h = Math.imul(h, 16777619); h ^= sp >>> 8; h = Math.imul(h, 16777619); }
    return speciesOf(caught).length ? h >>> 0 : 0;
  }
  const seedText = (seed) => (seed ? seed.toString(16).toUpperCase().padStart(8, '0') : 'none yet');

  /** what the field is made of.  caught: { species: count }.  typesOf(species) -> list of type names (first one counts most) */
  function plan(caught, typesOf) {
    const list = speciesOf(caught), counts = {}, patches = [];
    for (const sp of list) {
      const types = (typesOf(sp) || []).filter((t) => TERRAIN[t]), n = Array.isArray(caught) ? 1 : caught[sp] || 1;
      types.slice(0, 2).forEach((t, i) => {
        const u = 0.07 + 0.86 * unit(sp, 11 + i * 7), v = 0.09 + 0.82 * unit(sp, 23 + i * 7);
        patches.push({ t, sp, u: i ? Math.min(0.95, Math.max(0.05, u * 0.35 + (0.07 + 0.86 * unit(sp, 11)) * 0.65)) : u, v: i ? Math.min(0.93, Math.max(0.07, v * 0.35 + (0.09 + 0.82 * unit(sp, 23)) * 0.65)) : v,
          size: (i ? 0.55 : 1) * (1 + 0.28 * Math.log2(Math.min(64, n))) });
        counts[t] = (counts[t] || 0) + 1;
      });
    }
    // many species: every patch shrinks so that grass stays the ground everything else lies on
    const k = 0.115 * Math.min(1, Math.sqrt(16 / Math.max(1, patches.length)) + 0.18);
    for (const p of patches) p.r = Math.max(0.036, k * p.size);
    patches.sort((a, b) => b.r - a.r);
    return { seed: seedOf(caught), species: list.length, patches: patches.slice(0, MAX_PATCHES), counts };
  }
  /** one line for the Options screen: what the caught Pokémon made of the field */
  function describe(p) {
    if (!p.species) return 'A plain grass field. Every species you catch adds a patch of its own ground.';
    const names = Object.keys(p.counts).sort((a, b) => p.counts[b] - p.counts[a]).slice(0, 5).map((t) => TERRAIN[t][0]);
    return `Grown from ${p.species} caught species: ${names.join(', ')}${Object.keys(p.counts).length > 5 ? ' and more' : ''}.`;
  }

  // ---- the ground of the field window and the stage (0.7): equal shares for the Pokémon that are there
  /** list: species numbers in order (the team's six, or everyone in the Box); an empty place may be 0. typesOf as in plan().
   *  o.min: the least number of shares (6 for a team, so that two Pokémon do not get half the field each). */
  function partyPlan(list, typesOf, o = {}) {
    const mons = (list || []).map((sp) => Number(sp) || 0), n = Math.max(o.min || 1, mons.length, 1), aspect = o.aspect > 0 ? o.aspect : 16 / 9;
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect)))), rows = Math.ceil(n / cols);
    let h = 2166136261; const counts = {};
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const sp = mons[i] || 0, types = sp ? (typesOf(sp) || []).filter((t) => TERRAIN[t]) : [];
      cells.push({ sp, t: types[0] || 'grass0', t2: types[1] || '' });
      if (sp) { h ^= (sp + i * 131) & 0xffff; h = Math.imul(h, 16777619); for (const t of types.slice(0, 2)) counts[t] = (counts[t] || 0) + 1; }
    }
    return { kind: 'party', seed: (h >>> 0) || 1, species: mons.filter(Boolean).length, shares: n, cols, rows, cells, counts, patches: [] };
  }
  /** which ground lies at (u, v), both 0..1 across the field: a TERRAIN key ('grass0' is plain grass). The borders between
   *  shares wobble, so the field does not look like a chessboard; the wobble moves ground about without changing how much
   *  of it each Pokémon has. */
  function typeAt(p, u, v) {
    if (!p || p.kind !== 'party') return 'grass0';
    const s = p.seed, fx = u * p.cols, fy = v * p.rows, k = 3.1;
    const wx = fx + (noise(fx * k, fy * k, s + 51) - 0.5) * 0.62, wy = fy + (noise(fx * k, fy * k, s + 57) - 0.5) * 0.62;
    const cx = Math.min(p.cols - 1, Math.max(0, Math.floor(wx))), cy = Math.min(p.rows - 1, Math.max(0, Math.floor(wy))), cell = p.cells[cy * p.cols + cx];
    if (!cell) return 'grass0';
    if (!cell.t2) return cell.t;
    // the second type: a part of the share (about a third), on a side that depends on the Pokémon
    const lx = wx - cx, ly = wy - cy, a = unit(cell.sp, cy * p.cols + cx + 3) * 6.283, d = (lx - 0.5) * Math.cos(a) + (ly - 0.5) * Math.sin(a) + (noise(fx * 7, fy * 7, s + 61) - 0.5) * 0.3;
    return d > 0.14 ? cell.t2 : cell.t;
  }
  /** one line for the Options screen: what the Pokémon made of the field */
  function describeParty(p) {
    if (!p.species) return 'A plain grass field. Each Pokémon on your team turns an equal share of it into ground of its own types.';
    const names = Object.keys(p.counts).sort((a, b) => p.counts[b] - p.counts[a]).slice(0, 5).map((t) => TERRAIN[t][0]);
    return `${p.species} Pokémon, one ${p.shares === 6 ? 'sixth' : p.shares + 'th'} of the field each: ${names.join(', ')}${Object.keys(p.counts).length > 5 ? ' and more' : ''}.`;
  }

  function glyph(c, name, x, y, d) {
    const rows = GLYPH[name];
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch !== '.') { c.fillStyle = INK[ch]; c.fillRect(x + i * d, y + j * d, d, d); } }
  }

  /** draw the field on a canvas. w, h: its size in CSS pixels; dpr: device pixels per CSS pixel */
  function draw(canvas, p, w, h, dpr) {
    dpr = dpr > 0 ? dpr : 1;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const c = canvas.getContext('2d'), cell = Math.max(2, Math.round(CELL * dpr)), dot = Math.max(1, Math.round(DOT * dpr)), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    const seed = p.seed || 1, min = Math.min(W, H), keys = Object.keys(TERRAIN), grid = new Uint8Array(cols * rows);
    const P = p.patches.map((q) => ({ x: q.u * W, y: q.v * H, r: q.r * min, id: keys.indexOf(q.t) }));
    // which ground each square is. A party plan (0.7): whatever typeAt says there.
    if (p.kind === 'party') for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid[j * cols + i] = Math.max(0, keys.indexOf(typeAt(p, ((i + 0.5) * cell) / W, ((j + 0.5) * cell) / H)));
    // A plan of patches (plan(), still what the Android app grows): the patch whose (wobbly) edge it is deepest inside, or grass
    else for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
      const wob = (noise((i * CELL) / 46, (j * CELL) / 46, seed) - 0.5) * 0.7 + (noise((i * CELL) / 17, (j * CELL) / 17, seed + 7) - 0.5) * 0.3;
      let best = 0, score = 1;
      for (let n = 0; n < P.length; n++) {
        const q = P[n], dx = x - q.x, dy = y - q.y;
        if (dx > q.r * 1.6 || dx < -q.r * 1.6 || dy > q.r * 1.6 || dy < -q.r * 1.6) continue;
        const d = Math.sqrt(dx * dx + dy * dy) / q.r + wob;
        if (d < score) { score = d; best = q.id; }
      }
      grid[j * cols + i] = best;
    }
    const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 255 : grid[j * cols + i]);
    // the ground
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const g = grid[j * cols + i], t = TERRAIN[keys[g]], shade = noise((i * CELL) / 90, (j * CELL) / 90, seed + 3), r = unit(h2(i, j), seed + 5);
      c.fillStyle = t[1][r < 0.14 ? 2 : shade > 0.56 ? 1 : 0];
      c.fillRect(i * cell, j * cell, cell, cell);
    }
    // rims where a patch meets other ground: a shore round a pond, a darker lip round the rest
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const g = grid[j * cols + i], rim = TERRAIN[keys[g]][2];
      if (!rim) continue;
      c.fillStyle = rim;
      const x = i * cell, y = j * cell;
      if (at(i, j - 1) !== g && at(i, j - 1) !== 255) c.fillRect(x, y, cell, dot);
      if (at(i - 1, j) !== g && at(i - 1, j) !== 255) c.fillRect(x, y, dot, cell);
      if (at(i + 1, j) !== g && at(i + 1, j) !== 255) c.fillRect(x + cell - dot, y, dot, cell);
      if (at(i, j + 1) !== g && at(i, j + 1) !== 255) c.fillRect(x, y + cell - dot, cell, dot);
    }
    // what grows and lies on it: one try per pair of squares, only where the ground is all of one kind
    for (let j = 1; j < rows - 2; j += 2) for (let i = 1; i < cols - 2; i += 2) {
      const g = grid[j * cols + i];
      if (at(i + 1, j) !== g || at(i, j + 1) !== g || at(i + 1, j + 1) !== g) continue;
      const t = TERRAIN[keys[g]];
      let r = unit(h2(i, j), seed + 11);
      for (let n = 3; n < t.length; n++) {
        if (r < t[n][1]) { glyph(c, t[n][0], i * cell + Math.floor(unit(h2(i, j), seed + 13) * cell * 0.9), j * cell + Math.floor(unit(h2(i, j), seed + 17) * cell * 0.9), dot); break; }
        r -= t[n][1];
      }
    }
    // the hedge round the field: the barriers
    const hb = Math.max(4, Math.round(HEDGE * dpr)), bump = Math.max(4, Math.round(8 * dpr));
    c.fillStyle = 'rgba(20, 60, 30, .28)'; c.fillRect(hb, hb, W - hb * 2, dot * 2); c.fillRect(hb, hb, dot * 2, H - hb * 2);       // its shadow on the grass
    c.fillStyle = '#2f6b3a'; c.fillRect(0, 0, W, hb); c.fillRect(0, H - hb, W, hb); c.fillRect(0, 0, hb, H); c.fillRect(W - hb, 0, hb, H);
    for (let x = 0, n = 0; x < W; x += bump, n++) {
      c.fillStyle = unit(n, seed + 31) < 0.5 ? '#3f8a4a' : '#377d42';
      c.fillRect(x, dot, bump - dot, hb - dot * 2); c.fillRect(x, H - hb + dot, bump - dot, hb - dot * 2);
      if (unit(n, seed + 37) < 0.3) { c.fillStyle = '#58a862'; c.fillRect(x + dot, dot * 2, dot, dot); c.fillRect(x + dot * 2, H - hb + dot * 2, dot, dot); }
    }
    for (let y = hb, n = 0; y < H - hb; y += bump, n++) {
      c.fillStyle = unit(n, seed + 41) < 0.5 ? '#3f8a4a' : '#377d42';
      c.fillRect(dot, y, hb - dot * 2, bump - dot); c.fillRect(W - hb + dot, y, hb - dot * 2, bump - dot);
      if (unit(n, seed + 43) < 0.3) { c.fillStyle = '#58a862'; c.fillRect(dot * 2, y + dot, dot, dot); c.fillRect(W - hb + dot * 2, y + dot * 2, dot, dot); }
    }
    return { cols, rows, patches: P.length };
  }

  return { plan, partyPlan, typeAt, draw, describe, describeParty, seedOf, seedText, TERRAIN, HEDGE };
})();

if (typeof module !== 'undefined') module.exports = { Field };
