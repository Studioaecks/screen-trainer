// Screen Trainer — the pointers to be won (0.9.7; the first eight came in 0.8 and keep their numbers).
//
// A pointer is a reward, won in the player's own game. Two programs that meet online send each other a pointer's
// NUMBER (its place in this list), never a picture, so both sides must build exactly the same list: append new ones at
// the end, never reorder or remove (online.js checks a number against this list's length).
//
// Every pointer is the same arrow (pointers.css draws it); what differs is its colours: --a (the top), --b (the
// bottom), --edge. Pages call Pointers.paint(el, i) to give an element those colours.
//
// Who has won what is decided in the main process (online.js, cursorsFor) from numbers the game counts (G.pointerStats
// in src/game.js): species caught in all and per type and per generation, shinies, badges, legendaries, alphas, pets,
// items, Trainers beaten, friendly battles won and catches made on visits.
'use strict';

(function (root) {
  const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const TYPE_COL = { normal: '#9fa8b0', fire: '#ff9c54', water: '#6aa5e8', electric: '#f3d23b', grass: '#63bb5b', ice: '#74cec0', fighting: '#e0627f', poison: '#bd7fd6', ground: '#d98d5c', flying: '#9db4e6',
    psychic: '#f98a8e', bug: '#a3cc3f', rock: '#c7b78b', ghost: '#8b9bd6', dragon: '#5c9be0', dark: '#8d8799', steel: '#7fb0c0', fairy: '#ec9fe6' };
  const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  const REGION_COL = ['#e8413c', '#d6a22b', '#3b9be0', '#8b6fd6', '#3a3f4a', '#3b82e0', '#f0943c', '#c43c8c', '#e05a28'];
  const BADGES = ['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth', 'Zephyr', 'Hive', 'Plain', 'Fog', 'Storm', 'Mineral', 'Glacier', 'Rising'];
  const BADGE_COL = ['#9a9a9a', '#5ab4f0', '#f5c518', '#63bb5b', '#e86aa8', '#f0d040', '#e8413c', '#8b5a2b', '#9db4e6', '#a3cc3f', '#ec9fe6', '#8b9bd6', '#f0943c', '#7fb0c0', '#74cec0', '#5c9be0'];
  const EDGE = '#20242c';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const n = (v) => Number(v) | 0;
  /** a colour a little lighter (toward white) */
  function light(hex, k) { const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, f = (c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }

  const LIST = [
    // 0.8: the first eight (their colours are also in pointers.css, by key)
    { k: 'poke', n: 'Poké pointer', need: 'yours from the start', a: '#e8413c', b: '#ffffff', won: () => true },
    { k: 'great', n: 'Great pointer', need: 'catch 10 species', a: '#3b82e0', b: '#f2f6ff', won: (s) => n(s.species) >= 10 },
    { k: 'ultra', n: 'Ultra pointer', need: 'catch 50 species', a: '#f5c518', b: '#2b2f38', won: (s) => n(s.species) >= 50 },
    { k: 'master', n: 'Master pointer', need: 'catch 150 species', a: '#8b46d6', b: '#f6ecff', won: (s) => n(s.species) >= 150 },
    { k: 'star', n: 'Shiny pointer', need: 'catch a shiny', a: '#ffe14d', b: '#fff7c2', won: (s) => n(s.shiny) >= 1 },
    { k: 'badge', n: 'Badge pointer', need: 'win 8 badges', a: '#c9d2dc', b: '#8d98a6', won: (s) => n(s.badges) >= 8 },
    { k: 'crown', n: 'Champion pointer', need: 'win 16 badges', a: '#ffd24a', b: '#b8860b', won: (s) => n(s.badges) >= 16 },
    { k: 'bolt', n: 'Rotom pointer', need: 'catch the 3 helpers', a: '#ff8a2a', b: '#ffe14d', won: (s) => n(s.helpers) >= 3 },
  ];
  const add = (k, name, need, a, b, won, group) => LIST.push({ k, n: name, need, a, b, won, group });
  // ---- 0.9.7: by type (species caught of that type)
  const TIERS = [['Novice', 3, '#ffffff'], ['Adept', 10, null], ['Expert', 25, '#ffd24a'], ['Master', 50, EDGE]];
  for (const t of TYPES) for (const [tier, need, b] of TIERS) add(`${t}-${tier.toLowerCase()}`, `${cap(t)} ${tier} pointer`, `catch ${need} ${cap(t)}-type species`, TYPE_COL[t], b || light(TYPE_COL[t], 0.6), (s) => n(s.type && s.type[t]) >= need, 'type');
  // ---- by generation (share of that generation's species caught)
  const GEN_TIERS = [['explorer', 0.25], ['ranger', 0.5], ['expert', 0.75], ['master', 1]];
  REGIONS.forEach((r, g) => GEN_TIERS.forEach(([tier, share], j) => add(`gen${g + 1}-${tier}`, `${r} ${tier} pointer`, `catch ${Math.round(share * 100)}% of the ${r} Pokémon`, REGION_COL[g], ['#ffffff', light(REGION_COL[g], 0.6), '#ffd24a', EDGE][j],
    (s) => { const all = n(s.genAll && s.genAll[g + 1]); return all > 0 && n(s.gen && s.gen[g + 1]) >= Math.ceil(all * share); }, 'region')));
  // ---- species in all
  for (const need of [25, 75, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1025]) add(`dex${need}`, `${need} Species pointer`, `catch ${need} species`, need >= 1000 ? '#ffd24a' : need >= 500 ? '#8b46d6' : need >= 200 ? '#3b82e0' : '#e8413c', need >= 1000 ? '#fff7c2' : '#ffffff', (s) => n(s.species) >= need, 'dex');
  // ---- catches in all
  for (const need of [50, 100, 250, 500, 1000, 2500, 5000, 10000]) add(`catch${need}`, `${need.toLocaleString('en-US')} Catches pointer`, `catch ${need.toLocaleString('en-US')} Pokémon`, '#2b2f38', need >= 5000 ? '#ffd24a' : need >= 1000 ? '#c9d2dc' : '#e8413c', (s) => n(s.caught) >= need, 'catch');
  // ---- shinies
  for (const need of [3, 5, 10, 25, 50, 100]) add(`shiny${need}`, `${need} Shinies pointer`, `catch ${need} shinies`, '#ffe14d', need >= 50 ? '#ff8fb3' : need >= 10 ? '#7cc4ff' : '#ffffff', (s) => n(s.shiny) >= need, 'shiny');
  // ---- each badge (the 8th and 16th have theirs above)
  BADGES.forEach((b, i) => { if (i === 7 || i === 15) return; add(`badge${i + 1}`, `${b} pointer`, `win the ${b} Badge`, BADGE_COL[i], '#ffffff', (s) => n(s.badges) >= i + 1 || !!(s.badgeIds && s.badgeIds[i + 1]), 'badge'); });
  // ---- legendaries, alphas, petting, items, Trainers, friendly battles, catching together
  for (const need of [1, 3, 5, 10, 20]) add(`legend${need}`, `${need} Legend${need > 1 ? 's' : ''} pointer`, `catch ${need} legendary Pokémon`, '#c9a0ff', need >= 10 ? '#ffd24a' : '#ffffff', (s) => n(s.legend) >= need, 'legend');
  for (const need of [1, 5, 10, 25]) add(`alpha${need}`, `${need} Alpha${need > 1 ? 's' : ''} pointer`, `catch ${need} alpha Pokémon`, '#ff5a3c', need >= 10 ? '#2b2f38' : '#ffd0c4', (s) => n(s.alpha) >= need, 'alpha');
  for (const need of [100, 500, 1000, 5000, 10000]) add(`pets${need}`, `${need.toLocaleString('en-US')} Pets pointer`, `pet your Pokémon ${need.toLocaleString('en-US')} times`, '#ff8fb3', need >= 5000 ? '#ffd24a' : '#ffffff', (s) => n(s.pets) >= need, 'pets');
  for (const need of [25, 100, 500, 1000]) add(`items${need}`, `${need} Finds pointer`, `find ${need} items`, '#63bb5b', need >= 500 ? '#ffd24a' : '#ffffff', (s) => n(s.items) >= need, 'items');
  for (const need of [1, 5, 10, 25, 50, 100]) add(`trainer${need}`, `${need} Trainer${need > 1 ? 's' : ''} pointer`, `beat ${need} Trainer${need > 1 ? 's' : ''} in battle`, '#4dc3ff', need >= 25 ? '#ffd24a' : '#ffffff', (s) => n(s.trainers) >= need, 'trainer');
  for (const need of [1, 5, 10]) add(`friendly${need}`, `${need} Friendly battle${need > 1 ? 's' : ''} pointer`, `win ${need} friendly battle${need > 1 ? 's' : ''} against a visitor's team`, '#7ee08a', need >= 10 ? '#ffd24a' : '#ffffff', (s) => n(s.friendly) >= need, 'friendly');
  for (const need of [1, 10, 50]) add(`together${need}`, `${need} Together pointer`, `catch ${need} Pokémon together with a visitor or host`, '#5fe0d0', need >= 50 ? '#ffd24a' : '#ffffff', (s) => n(s.visitCaught) >= need, 'together');
  // ---- a shiny of each type
  for (const t of TYPES) add(`shiny-${t}`, `Shiny ${cap(t)} pointer`, `catch a shiny ${cap(t)}-type Pokémon`, '#ffe14d', TYPE_COL[t], (s) => !!(s.shinyType && s.shinyType[t]), 'shiny');

  const Pointers = {
    LIST, TYPES, TYPE_COL,
    count: () => LIST.length,
    /** the pointers with whether each was won, for the windows that offer them */
    view(s) { s = s || {}; return LIST.map((c, i) => ({ i, k: c.k, n: c.n, need: c.need, a: c.a, b: c.b, group: c.group || 'first', won: !!c.won(s) })); },
    /** give an element (a .vp or .vpEdge) the colours of pointer number i */
    paint(el, i) { const c = LIST[i] || LIST[0]; if (!el || !el.style) return; el.dataset.k = c.k; el.style.setProperty('--a', c.a); el.style.setProperty('--b', c.b); el.style.setProperty('--edge', EDGE); },
    colors: (i) => { const c = LIST[i] || LIST[0]; return { a: c.a, b: c.b, edge: EDGE }; },
    /** the same arrow as a picture for the mouse itself (CSS cursor), 0.9.7: "on Screen Trainer the mouse is the player" */
    cursorCss(i, px) {
      const c = LIST[i] || LIST[0], w = Math.round(px || 32), h = Math.round(w * 4 / 3), enc = (s) => s.replace(/#/g, '%23');
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 24 32'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='.47' stop-color='${c.a}'/><stop offset='.47' stop-color='${EDGE}'/><stop offset='.55' stop-color='${EDGE}'/><stop offset='.55' stop-color='${c.b}'/></linearGradient></defs><path d='M1 1 L1 25.6 L6.5 19.5 L10.1 31 L14.9 29.1 L10.3 17.6 L18.7 17.6 Z' fill='url(%23g)' stroke='${EDGE}' stroke-width='1.6' stroke-linejoin='round'/></svg>`;
      return `url("data:image/svg+xml,${enc(svg)}") 1 1, auto`;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Pointers;
  else root.Pointers = Pointers;
})(typeof window !== 'undefined' ? window : this);
