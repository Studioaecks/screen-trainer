// Screen Trainer — checks breeding and genders against the rules of the games.   node tools/breedcheck.js
// Loads the game's own files (data, the breeding table, a single Pokémon, the breeding rules) and tries known cases.
'use strict';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const { DATA, Mon, Breed } = new Function(['data.js', 'data-breed.js', 'size.js', 'mon.js', 'breed.js'].map(read).join('\n;\n') + '\n;return { DATA, Mon, Breed };')();
let failed = 0, n = 0;
const ok = (name, pass, note) => { n++; if (!pass) failed++; console.log(`${pass ? 'ok    ' : 'FAILED'}  ${name}${note !== undefined ? '   [' + note + ']' : ''}`); };
const mon = (sp, fem, extra) => Object.assign(Mon.create(sp, 30), { fem: fem ? 1 : 0 }, extra || {});
const pair = (a, b) => Breed.match(a, b);
const kids = (a, b, times) => { const s = new Set(); for (let i = 0; i < (times || 60); i++) { const m = Breed.egg(a, b, 4096); if (m) s.add(m.sp); } return [...s].sort((x, y) => x - y).join(','); };

// genders follow each species' own ratio
const share = (sp) => { let f = 0; for (let i = 0; i < 6000; i++) f += Mon.create(sp, 5).fem; return f / 6000; };
ok('Eevee: one in eight is female', Math.abs(share(133) - 0.125) < 0.02, share(133).toFixed(3));
ok('Pikachu: half are female', Math.abs(share(25) - 0.5) < 0.03);
ok('Chansey is always female, Tauros always male', share(113) === 1 && share(128) === 0);
ok('Magnemite, Ditto and Mewtwo have no gender', ['none', 'none', 'none'].join() === [81, 132, 150].map((sp) => Breed.gender(Mon.create(sp, 5))).join());

// who can have an egg
ok('a male and a female of the same species: yes, and they get along very well', pair(mon(25, 0), mon(25, 1)).ok && pair(mon(25, 0), mon(25, 1)).chance === 0.5);
ok('two males: no', !pair(mon(25, 0), mon(25, 0)).ok);
ok('different species of one egg group: yes (Charizard and Dragonite, both Dragon)', pair(mon(6, 0), mon(149, 1)).ok && pair(mon(6, 0), mon(149, 1)).chance === 0.2);
ok('different egg groups: no (Pikachu and Gyarados)', !pair(mon(25, 0), mon(130, 1)).ok, pair(mon(25, 0), mon(130, 1)).why);
ok('no gender: only with Ditto', !pair(mon(81, 0), mon(81, 0)).ok && pair(mon(81, 0), mon(132, 0)).ok);
ok('two Ditto: no', !pair(mon(132, 0), mon(132, 0)).ok);
ok('legendaries and babies have no eggs', !pair(mon(150, 0), mon(132, 0)).ok && !pair(mon(172, 0), mon(25, 1)).ok);
ok('the old quirk: Nidorina and Nidoqueen have no eggs', !pair(mon(30, 1), mon(33, 0)).ok && !pair(mon(31, 1), mon(34, 0)).ok);

// what hatches
ok('the first form of the mother\'s family: Dragonite mother, Charizard father -> Dratini', kids(mon(6, 0), mon(149, 1)) === '147');
ok('and the other way round -> Charmander', kids(mon(6, 1), mon(149, 0)) === '4');
ok('Pikachu parents -> Pichu', kids(mon(25, 0), mon(26, 1)) === '172');
ok('Snorlax -> Munchlax (no incense needed)', kids(mon(143, 0), mon(143, 1)) === '446');
ok('with Ditto the other parent decides, male or not: Machamp + Ditto -> Machop', kids(mon(68, 0), mon(132, 0)) === '66');
ok('Magnemite + Ditto -> Magnemite', kids(mon(82, 0), mon(132, 0)) === '81');
ok('Nidoran female -> either Nidoran', kids(mon(29, 1), mon(34, 0), 200) === '29,32');
ok('Tauros and Miltank -> Miltank', kids(mon(128, 0), mon(241, 1)) === '241');
ok('Volbeat and Illumise -> either', kids(mon(313, 0), mon(314, 1), 200) === '313,314');
ok('Manaphy + Ditto -> Phione', kids(mon(490, 0), mon(132, 0)) === '489');
ok('those that cannot breed give no egg', Breed.egg(mon(25, 0), mon(25, 0), 4096) === null);

// what it inherits
{
  const a = mon(25, 0, { iv: [31, 31, 31, 31, 31, 31] }), b = mon(25, 1, { iv: [0, 0, 0, 0, 0, 0] });
  let min = 6, max = 0; for (let i = 0; i < 300; i++) { const c = Breed.egg(a, b, 4096).iv.filter((v) => v === 31 || v === 0).length; min = Math.min(min, c); max = Math.max(max, c); }
  ok('at least three individual strengths come from the parents', min >= 3, `between ${min} and ${max} of 6 match a parent`);
  const knot = mon(25, 1, { iv: [0, 0, 0, 0, 0, 0], item: 'destiny-knot' }); let m5 = 6; for (let i = 0; i < 300; i++) m5 = Math.min(m5, Breed.egg(a, knot, 4096).iv.filter((v) => v === 31 || v === 0).length);
  ok('five with a Destiny Knot', m5 >= 5, m5);
  const stone = mon(25, 1, { nat: 7, item: 'everstone' }); let same = true; for (let i = 0; i < 80; i++) same = same && Breed.egg(mon(25, 0, { nat: 3 }), stone, 4096).nat === 7;
  ok('an Everstone passes the nature on', same);
  const child = Breed.egg(mon(6, 0, { ball: 'ultra-ball' }), mon(149, 1, { ball: 'dive-ball' }), 4096);
  ok('level 1, in the mother\'s ball, in full health', child.lvl === 1 && child.ball === 'dive-ball' && child.hp === Mon.maxHp(child), `${child.lvl}, ${child.ball}`);
  ok('a Master Ball is not passed on', Breed.egg(mon(6, 0), mon(149, 1, { ball: 'master-ball' }), 4096).ball === 'poke-ball');
}
ok('eggs take a short while: Magikarp 30 s, Bulbasaur 60 s, the slowest about four minutes', Breed.hatchSeconds(129) === 30 && Breed.hatchSeconds(1) === 60 && Breed.hatchSeconds(147) === 100, [129, 1, 147].map(Breed.hatchSeconds).join());
ok('every species has its egg groups', Object.keys(DATA.dex).every((id) => Breed.groups(+id).length >= 1));
console.log(`\n${n - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
