// Screen Trainer — creature data model: stats, experience, evolution, leadership, affection.
// Pure logic, no DOM. Uses the DATA tables built from the public PokeAPI data set.
'use strict';

const U = {
  rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
  rint: (n) => Math.floor(Math.random() * n),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  wpick(items, weightFn) {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, weightFn(it)); total += w; return w; });
    if (total <= 0) return items.length ? U.pick(items) : null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  },
};

const Mon = (() => {
  const D = DATA;
  const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed', 'accuracy', 'evasiveness'];
  const LEADER_NATURES = new Set(['Brave', 'Bold', 'Adamant', 'Serious', 'Careful', 'Calm', 'Hardy', 'Jolly']);
  const LONER_NATURES = new Set(['Timid', 'Lax', 'Naive', 'Rash', 'Hasty', 'Quirky', 'Naughty', 'Lonely']);
  let uidSeq = 0;
  const newUid = () => Date.now().toString(36) + (uidSeq++).toString(36) + U.rint(1296).toString(36);

  // While a Mega Evolution lasts, a stand-in takes the place of the Pokémon's species: the same species with the form's
  // base stats and types (src/forms.js sets and clears it; it is never saved).
  const FORMS = new Map();
  const species = (m) => FORMS.get(m.uid) || D.dex[m.sp];
  const setForm = (m, data) => { if (data) FORMS.set(m.uid, data); else FORMS.delete(m.uid); };
  const name = (m) => m.nick || species(m).n;
  const natureName = (m) => D.natures[m.nat].n;

  /** leadership aptitude: 'leader' | 'steady' | 'loner' — decided by nature */
  function aptitude(m) {
    const n = natureName(m);
    return LEADER_NATURES.has(n) ? 'leader' : LONER_NATURES.has(n) ? 'loner' : 'steady';
  }
  const aptMult = (m) => ({ leader: 1.5, steady: 1, loner: 0.5 }[aptitude(m)]);
  /** leadership level 0..10 from accumulated leadership experience */
  const leadLevel = (m) => Math.min(10, Math.floor(Math.sqrt((m.lead || 0) / 40)));
  /** affection hearts 0..5 */
  const hearts = (m) => (m.aff >= 255 ? 5 : Math.floor((m.aff || 0) / 51));

  function stats(m, lvlOverride) {
    const b = species(m).s, n = D.natures[m.nat], L = lvlOverride || m.lvl;
    const out = [Math.floor(((2 * b[0] + m.iv[0]) * L) / 100) + L + 10];
    for (let i = 1; i < 6; i++) {
      let v = Math.floor(((2 * b[i] + m.iv[i]) * L) / 100) + 5;
      if (n.up !== n.dn) { if (n.up === i) v = Math.floor(v * 1.1); if (n.dn === i) v = Math.floor(v * 0.9); }
      out.push(v);
    }
    if (m.sp === 292) out[0] = 1;
    return out;
  }
  /** alpha wild creatures carry a temporary HP multiplier (hpx) until caught */
  const maxHp = (m) => stats(m)[0] * (m.hpx || 1);
  /** drawn size of this individual relative to its species (src/size.js): Small to Extra large, alphas are always Extra large */
  const sizeOf = (m) => (typeof Size !== 'undefined' ? Size.mult(m) : 1);

  function movesAt(sp, lvl) {
    const known = D.dex[sp].lm.filter((e) => e[0] <= lvl).map((e) => e[1]);
    let mv = [...new Set(known)].slice(-4);
    if (!mv.some((id) => isDamaging(D.moves[id]))) {
      const dmg = known.filter((id) => isDamaging(D.moves[id])).pop();
      if (dmg) mv = [dmg, ...mv.slice(-3)];
    }
    if (!mv.length) mv = [33];
    return mv;
  }
  const isDamaging = (mv) => mv && mv.c !== 1;

  // ---- looks (0.9.3): the forms that only change how a Pokémon looks, never its stats or types. Each individual has
  // its own, chosen when it is made and kept for life (m.look; '' = the species' usual picture). The picture is the
  // sprite file "<species>-<look>" when the owner's sprite set has it (src/sprites.js), the usual one when it does not.
  // Forms that change types or stats (Alolan, Galarian, Hisuian, Paldean, Wormadam, Rotom...) are other species in
  // the sprite sets' numbering and are not here.
  const LETTERS = 'bcdefghijklmnopqrstuvwxyz'.split('');
  const SEASONS = ['', 'summer', 'autumn', 'winter'];     // spring, summer, autumn, winter (the month of the computer's clock)
  const VIVILLON = ['', 'archipelago', 'continental', 'elegant', 'fancy', 'garden', 'high-plains', 'icy-snow', 'jungle', 'marine', 'modern', 'monsoon', 'ocean', 'polar', 'river', 'sandstorm', 'savanna', 'sun', 'tundra'];
  const SWEETS = ['strawberry', 'berry', 'love', 'star', 'clover', 'flower', 'ribbon'], CREAMS = ['vanilla-cream', 'ruby-cream', 'matcha-cream', 'mint-cream', 'lemon-cream', 'salted-cream', 'ruby-swirl', 'caramel-swirl', 'rainbow-swirl'];
  const season = () => SEASONS[Math.floor(((new Date().getMonth() + 10) % 12) / 3)];      // Mar-May spring, Jun-Aug summer...
  const rare = (look, chance) => () => (Math.random() < chance ? look : '');
  const LOOKS = {
    201: () => (Math.random() < 2 / 28 ? U.pick(['exclamation', 'question']) : U.pick(['', ...LETTERS])),      // Unown: A to Z, ! and ?
    412: () => U.pick(['', 'sandy', 'trash']),                                 // Burmy: plant, sandy, trash cloak
    422: () => U.pick(['', 'east']), 423: () => U.pick(['', 'east']),          // Shellos and Gastrodon: west and east sea
    550: () => U.pick(['', 'blue-striped']),                                   // Basculin
    585: season, 586: season,                                                  // Deerling and Sawsbuck: the season
    666: () => U.pick(VIVILLON),                                               // Vivillon: its wing pattern
    669: () => U.pick(['', 'blue', 'orange', 'white', 'yellow']), 670: () => U.pick(['', 'blue', 'orange', 'white', 'yellow']), 671: () => U.pick(['', 'blue', 'orange', 'white', 'yellow']),      // Flabébé's flower
    854: rare('antique', 0.1), 855: rare('antique', 0.1),                      // Sinistea and Polteageist: the real antique
    869: () => `${U.pick(CREAMS)}-${U.pick(SWEETS)}-sweet`,                     // Alcremie: cream and sweet
    925: rare('four', 0.01),                                                   // Maushold: a family of four
    931: () => U.pick(['', 'blue', 'white', 'yellow']),                        // Squawkabilly
    978: () => U.pick(['', 'droopy', 'stretchy']),                             // Tatsugiri
    982: rare('threesegment', 0.01),                                           // Dudunsparce
    1012: rare('artisan', 0.1), 1013: rare('masterpiece', 0.1),                // Poltchageist and Sinistcha: the real masterpiece
  };
  // what an evolution keeps: Flabébé's flower, Shellos' sea, Sinistea's antique and the like. Vivillon is given its
  // pattern when Spewpa evolves, Sawsbuck the season, Alcremie its cream and sweet.
  const KEEPS = { 669: 670, 670: 671, 422: 423, 854: 855, 1012: 1013, 585: 586 };
  const FEMALE_LOOK = { 592: 'female', 593: 'female', 668: 'female' };      // Frillish, Jellicent, Pyroar: the female has her own picture
  /** a look for a new individual of this species ('' = the usual one) */
  function pickLook(sp, fem) { if (fem && FEMALE_LOOK[sp]) return FEMALE_LOOK[sp]; const f = LOOKS[sp]; return f ? f() || '' : ''; }
  /** the name of its look, for the Pokédex: "Unown B", "Vivillon (Garden Pattern)" ... '' when it has the usual one */
  function lookName(m) {
    const l = m && m.look; if (!l || FEMALE_LOOK[m.sp] === l) return '';
    if (m.sp === 201) return l === 'exclamation' ? '!' : l === 'question' ? '?' : l.toUpperCase();
    return l.replace(/-sweet$/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function create(sp, lvl, opts = {}) {
    const d = D.dex[sp];
    lvl = U.clamp(Math.round(lvl), 1, 100);
    const m = {
      uid: newUid(), sp, lvl, nat: U.rint(25), iv: [0, 0, 0, 0, 0, 0].map(() => U.rint(32)),
      shiny: opts.shiny ? 1 : 0, fem: d.gn < 0 ? 0 : (Math.random() * 8 < d.gn ? 1 : 0),
      xp: D.exp[d.gr][lvl], aff: 0, lead: 0, bond: {}, moves: movesAt(sp, lvl), st: null, nick: '',
      sz: opts.sz >= 0 ? Math.min(255, opts.sz | 0) : typeof Size !== 'undefined' ? Size.roll() : 127,
    };
    m.look = typeof opts.look === 'string' ? opts.look : pickLook(sp, m.fem);
    if (!m.look) delete m.look;                            // (most Pokémon have none: nothing is added to the save for them)
    m.hp = maxHp(m);
    return m;
  }

  /** Add experience. Returns a list of events: {type:'level'|'move'|'evolve', ...} */
  function gainXp(m, amount, allowEvolve = true) {
    const ev = [];
    if (m.lvl >= 100) return ev;
    const table = D.exp[species(m).gr];
    m.xp += Math.max(1, Math.floor(amount));
    while (m.lvl < 100 && m.xp >= table[m.lvl + 1]) {
      const before = maxHp(m);
      m.lvl++;
      m.hp = Math.min(maxHp(m), m.hp + (maxHp(m) - before));
      ev.push({ type: 'level', lvl: m.lvl });
      for (const [lv, id] of species(m).lm) {
        if (lv === m.lvl && !m.moves.includes(id) && learn(m, id)) ev.push({ type: 'move', id });
      }
    }
    if (allowEvolve) { const e = tryEvolve(m); if (e) ev.push(e); }
    return ev;
  }

  /** learn a move at a new level: forget the oldest one, but never the last damaging move and never one the owner chose
   *  in the Pokédex (m.mvKeep, 0.9.5). Returns false when all four were chosen: the new move can still be picked later. */
  function learn(m, id) {
    if (m.moves.length < 4) { m.moves.push(id); return true; }
    const keep = new Set(m.mvKeep || []), dmgCount = m.moves.filter((x) => isDamaging(D.moves[x])).length;
    const drop = m.moves.findIndex((x) => !keep.has(x) && !(dmgCount <= 1 && isDamaging(D.moves[x]) && !isDamaging(D.moves[id])));
    if (drop < 0) return false;
    m.moves.splice(drop, 1);
    m.moves.push(id);
    return true;
  }
  /** the moves it could use (0.9.5, owner's list 11-16 update 5): every move its species learns up to its level, and the
   *  ones it knows now, in the order they are learned */
  function movesAvailable(m) {
    const out = [];
    for (const [lv, id] of D.dex[m.sp].lm) if (lv <= m.lvl && D.moves[id] && !out.includes(id)) out.push(id);
    for (const id of m.moves || []) if (!out.includes(id)) out.push(id);
    return out;
  }
  /** put move `id` in place `slot` (0-3) by the owner's choice. A move it already knows swaps places; the last damaging
   *  move can not be swapped for a status move. Returns '' when done, else why not. */
  function setMove(m, slot, id) {
    slot = Math.round(+slot); id = Math.round(+id);
    if (!(slot >= 0 && slot < 4) || !movesAvailable(m).includes(id)) return 'It can not learn that move.';
    const mv = m.moves.slice(), at = mv.indexOf(id);
    if (slot >= mv.length) { if (at >= 0) return ''; mv.push(id); }
    else if (at >= 0) { [mv[at], mv[slot]] = [mv[slot], mv[at]]; }
    else mv[slot] = id;
    if (!mv.some((x) => isDamaging(D.moves[x]))) return 'It needs at least one move that does damage.';
    m.moves = mv;
    m.mvKeep = [...new Set([...(m.mvKeep || []).filter((x) => mv.includes(x)), id])];
    return '';
  }

  /** turn m into species `to`, keeping its health ratio; returns the evolve event */
  function evolveTo(m, to) {
    const from = m.sp, ratio = m.hp / maxHp(m);
    m.sp = to;
    const look = KEEPS[from] === to && m.look ? m.look : pickLook(to, m.fem);      // (its look goes with it where the games keep it, 0.9.3)
    if (look) m.look = look; else delete m.look;
    m.hp = m.hp <= 0 ? 0 : Math.max(1, Math.round(maxHp(m) * ratio));
    for (const [lv, id] of D.dex[to].lm) {
      if (lv <= 1 && !m.moves.includes(id) && m.moves.length < 4) m.moves.push(id);
    }
    return { type: 'evolve', from, to };
  }
  function tryEvolve(m) {
    const d = species(m);
    if (!d.ev || m.noEvo || m.item === 'everstone') return null;
    const ok = d.ev.filter((e) => (e.lvl && m.lvl >= e.lvl) || (e.aff && m.aff >= e.aff && m.lvl >= 8));
    if (!ok.length) return null;
    return evolveTo(m, U.pick(ok).to);
  }

  /** type effectiveness multiplier of an attacking type id against a species' types */
  function typeMult(atkType, defTypes) {
    let x = 1;
    for (const t of defTypes) x *= D.eff[atkType][t] / 100;
    return x;
  }

  /** catch math (Gen III/IV formula). Returns {a, p, shakes()} */
  function catchCalc(m, ballMult = 1) {
    const mh = maxHp(m), rate = species(m).cr;
    const st = m.st === 'slp' || m.st === 'frz' ? 2 : m.st ? 1.5 : 1;
    const a = Math.max(1, Math.floor((((3 * mh - 2 * m.hp) * rate * ballMult) / (3 * mh)) * st));
    if (a >= 255) return { a, p: 1, b: 65536 };
    const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)));
    return { a, b, p: Math.pow(b / 65536, 4) };
  }
  /** roll the four shake checks; 4 = caught, 0..3 = shakes before breaking free */
  function rollCatch(m, ballMult = 1) {
    const c = catchCalc(m, ballMult);
    if (c.a >= 255) return 4;
    let n = 0;
    while (n < 4 && U.rint(65536) < c.b) n++;
    return n;
  }

  /** experience yielded by defeating/catching a wild creature */
  const xpYield = (wild) => Math.floor((species(wild).bx * wild.lvl) / 7);

  return { STAT_NAMES, species, name, natureName, aptitude, aptMult, leadLevel, hearts, stats, maxHp, movesAt, isDamaging, movesAvailable, setMove,
    create, gainXp, learn, tryEvolve, evolveTo, setForm, pickLook, lookName, sizeOf, typeMult, catchCalc, rollCatch, xpYield };
})();

if (typeof module !== 'undefined') module.exports = { U, Mon };
