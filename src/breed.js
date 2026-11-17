// Screen Trainer — breeding, by the rules of the games (0.6).
//
//   Who can have an egg   A male and a female that share an egg group; or Ditto with anything that can breed at all.
//                         Pokémon without gender only with Ditto. Nothing from the "no eggs" group (babies, most
//                         legendaries, and by an old quirk Nidorina and Nidoqueen). Not two Ditto.
//   What hatches          The first form of the mother's family (of the one that is not Ditto), at level 1.
//                         Nidoran can be either Nidoran; Volbeat and Illumise either of the two; Manaphy's egg holds
//                         a Phione. Babies hatch without incense, as in the newer games.
//   What it inherits      Three of its six individual strengths from the parents (five if one holds a Destiny Knot);
//                         the nature of a parent holding an Everstone; the mother's ball. Its gender is rolled by its
//                         species' own ratio and it may be shiny at the usual odds. Egg moves are not passed on.
//   How long              Breed.hatchSeconds: from the species' hatch counter, half a minute to a few minutes.
//
// The table of egg groups, hatch counters and families is src/data-breed.js (generated). Genders themselves were
// always by the species' ratio (DATA.dex[sp].gn, eighths that are female; -1 = none): see Mon.create.
// Used by src/stations.js (the Day Care) and src/game.js (eggs hatching). tools/playtest.js checks the rules.
'use strict';

const Breed = (() => {
  const B = typeof BREED_DATA !== 'undefined' ? BREED_DATA : { groups: [], g: [], h: [], from: [], baby: [] }, DITTO = 132, NO_EGGS = 15;
  const groups = (sp) => B.g[sp] || [];
  /** the first form of a species' family */
  const base = (sp) => { for (let i = 0; i < 5 && B.from[sp]; i++) sp = B.from[sp]; return sp; };
  const gender = (m) => (DATA.dex[m.sp].gn < 0 ? 'none' : m.fem ? 'female' : 'male');
  /** can these two have an egg? { ok, why, mother, chance: of an egg at each look, line: what the Day Care says } */
  function match(a, b) {
    const ga = groups(a.sp), gb = groups(b.sp), da = a.sp === DITTO, db = b.sp === DITTO;
    const no = (why) => ({ ok: false, why, mother: null, chance: 0, line: 'They prefer to play with other Pokémon.' });
    if (!ga.length || !gb.length || ga.includes(NO_EGGS) || gb.includes(NO_EGGS)) return no('one of them is of a kind that has no eggs');
    if (da && db) return no('two Ditto have no eggs');
    let mother;
    if (da || db) mother = da ? b : a;                       // with Ditto the other one decides what hatches, whatever its gender
    else {
      const xa = gender(a), xb = gender(b);
      if (xa === 'none' || xb === 'none') return no('a Pokémon without gender only has eggs with Ditto');
      if (xa === xb) return no('they are both ' + xa);
      if (!ga.some((g) => gb.includes(g))) return no('they are of different egg groups');
      mother = xa === 'female' ? a : b;
    }
    const same = a.sp === b.sp;
    return { ok: true, why: '', mother, chance: same ? 0.5 : 0.2, line: same ? 'The two seem to get along very well.' : 'The two seem to get along.' };
  }
  /** the species that hatches from this mother's egg */
  function child(mother) {
    const sp = base(mother.sp);
    if (sp === 29 || sp === 32) return Math.random() < 0.5 ? 29 : 32;
    if (sp === 313 || sp === 314) return Math.random() < 0.5 ? 313 : 314;
    if (sp === 490) return 489;
    return sp;
  }
  /** the Pokémon inside an egg of these two, or null when they cannot have one */
  function egg(a, b, shinyOdds) {
    const k = match(a, b);
    if (!k.ok) return null;
    const sp = child(k.mother);
    if (!DATA.dex[sp]) return null;
    const m = Mon.create(sp, 1, { shiny: Math.random() < 1 / Math.max(1, shinyOdds || 4096) });
    const n = a.item === 'destiny-knot' || b.item === 'destiny-knot' ? 5 : 3, which = [0, 1, 2, 3, 4, 5].map((i) => [Math.random(), i]).sort((p, q) => p[0] - q[0]).slice(0, n).map((p) => p[1]);
    for (const s of which) m.iv[s] = (Math.random() < 0.5 ? a : b).iv[s];
    const stone = [a, b].filter((p) => p.item === 'everstone');
    if (stone.length) m.nat = U.pick(stone).nat;
    const from = a.sp === b.sp ? U.pick([a, b]) : k.mother, ball = from.ball || 'poke-ball';
    m.ball = ball === 'master-ball' || ball === 'cherish-ball' ? 'poke-ball' : ball;
    m.hp = Mon.maxHp(m);
    return m;
  }
  /** how long an egg takes, in seconds: 5 egg cycles = 30 s, the usual 20 = a minute, 120 = a little over four minutes */
  const hatchSeconds = (sp) => 20 + (B.h[sp] || 20) * 2;
  return { groups, groupNames: (sp) => groups(sp).map((g) => B.groups[g]), base, gender, match, child, egg, hatchSeconds, DITTO };
})();
if (typeof module !== 'undefined') module.exports = Breed;
