// Screen Trainer — sizes. Two things live here, both pure arithmetic (no DOM), used by the overlay and the
// Pokédex window alike:
//   1. every individual Pokémon has a size value `sz` (0..255) that puts it in a class, Small to Extra large;
//   2. how tall a species is drawn on the screen, from its real height in the Pokédex data.
// To retune sizes, change the numbers in CLASSES, MULT and DRAW below; nothing else needs touching.
'use strict';

const Size = (() => {
  const X = typeof DATA_EXTRA !== 'undefined' ? DATA_EXTRA : { dex: {} };

  // A size value is the sum of two dice (0..127 each), so middling sizes are common and the ends are rare.
  // Share of all Pokémon per class with these limits: S 18%, M 61%, L 16%, XL 5%.
  const CLASSES = [
    { k: 'S', name: 'Small', from: 0 },
    { k: 'M', name: 'Medium', from: 76 },
    { k: 'L', name: 'Large', from: 172 },
    { k: 'XL', name: 'Extra large', from: 216 },
  ];
  const XXL = { k: 'XXL', name: 'XXL' };                  // not rolled: Mewtwo the guardian only
  // height multiplier at size 0, at the middle (127.5) and at 255; straight lines in between
  const MULT = { min: 0.78, mid: 1, max: 1.4, xxl: 1.75 };
  // jumbo and mini marks go to the very largest and smallest (about 1 in 86 each)
  const JUMBO = 236, MINI = 18;

  // Drawing. `ppm` is screen pixels per metre at sprite size 1x: 72 keeps a one-metre species the size it always was.
  // `floor` keeps tiny species visible and clickable; `cap` (a share of the shorter screen side) keeps giants on the screen.
  // Below sprite size 1x the floor shrinks along with everything else (down to `floorMin`), so a very small setting
  // such as 0.1x still shows species in proportion instead of all at one size.
  const DRAW = { ppm: 72, floor: 24, floorMin: 5, cap: 0.32, hardCap: 0.46, wide: 1.4, paddedFill: 0.62 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const roll = () => Math.floor(Math.random() * 128) + Math.floor(Math.random() * 128);
  /** a stable size for a Pokémon caught before sizes existed, from its id */
  function fromUid(uid) {
    let h = 2166136261;
    for (const c of String(uid || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return ((h >>> 0) % 128) + ((h >>> 9) % 128);
  }
  const value = (m) => (m && m.sz >= 0 && m.sz <= 255 ? m.sz : 127);
  const cls = (m) => { if (m && m.xxl) return XXL; const v = value(m); let c = CLASSES[0]; for (const x of CLASSES) if (v >= x.from) c = x; return c; };
  const label = (m) => cls(m).k;
  const name = (m) => cls(m).name;
  /** how much taller or shorter than the species' Pokédex height this individual is */
  function mult(m) {
    if (m && m.xxl) return MULT.xxl;
    const v = value(m);
    return v <= 127.5 ? MULT.min + (v / 127.5) * (MULT.mid - MULT.min) : MULT.mid + ((v - 127.5) / 127.5) * (MULT.max - MULT.mid);
  }
  const speciesMetres = (sp) => (X.dex[sp] && X.dex[sp][1] ? X.dex[sp][1] / 10 : 0);
  /** the smallest a species is drawn (before its own Small-to-Extra-large factor) at this Sprite size setting */
  const floorAt = (scale) => Math.max(DRAW.floorMin, DRAW.floor * Math.min(1, scale > 0 ? scale : 1));
  /** this individual's height in metres (0 when the species has no height on record) */
  const metres = (m) => speciesMetres(m.sp) * mult(m);
  const metresText = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' m';
  const markFor = (m) => (value(m) >= JUMBO ? 'jumbo-mark' : value(m) <= MINI ? 'mini-mark' : null);

  /** screen pixels for one sprite pixel.
   *  nw, nh: the picture's own size. padded: a still sprite with empty space around the creature.
   *  mode: 'true' | 'balanced' | 'sprite'. scale: the Sprite size setting. screenMin: the shorter screen side. */
  function spriteScale(m, nw, nh, padded, mode, scale, screenMin) {
    const ind = mult(m), h = speciesMetres(m.sp), fill = padded ? DRAW.paddedFill : 1;
    // 'sprite': the picture at its own size, as before sizes existed (only kept from outgrowing the screen)
    if (mode === 'sprite' || !h || !nw || !nh) return nw && nh ? Math.min(scale * ind, (DRAW.hardCap * screenMin) / (Math.max(nw, nh) * fill)) : scale * ind;
    // a species much longer than tall (Wailord, Kyogre) is measured along its length, like its Pokédex figure
    const ref = (nw / nh >= DRAW.wide ? nw : nh) * fill;
    const want = mode === 'balanced' ? Math.sqrt(h) * DRAW.ppm * scale : h * DRAW.ppm * scale;
    const floor = floorAt(scale), px = clamp(want, floor, Math.max(floor, DRAW.cap * screenMin)) * ind;
    return Math.min(px, DRAW.hardCap * screenMin) / ref;
  }

  return { CLASSES, MULT, DRAW, roll, fromUid, value, cls, label, name, mult, metres, speciesMetres, metresText, markFor, spriteScale, floorAt };
})();

if (typeof module !== 'undefined') module.exports = { Size };
