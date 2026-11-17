// Screen Trainer — checks for 0.9.6 (the owner's "fixes and updates11-16" list, requested updates 7 and 8: healing).
//
//   node tools/v096check.js
//
// Headless, under a minute, the same pretend page as tools/playtest.js.
'use strict';
const path = require('path');
const fs = require('fs');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`);
  return !!cond;
}
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

(async () => {
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true, autoBattle: false, roam: 'stroll' };
  const env = await boot({ seed: 11, settings: Object.assign({}, quiet) });
  const sim = new Sim(env, 'v096'), G = sim.G, Mon = sim.Mon, D = env.DATA, Battle = sim.get('Battle');
  const errs = () => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');
  const healer = Mon.create(531, 40, {}); healer.moves = [505, 33];           // Audino with Heal Pulse and Tackle
  const pal = Mon.create(6, 40, {}); pal.moves = [52, 10];                    // Charizard
  const self = Mon.create(35, 40, {}); self.moves = [105, 1];                 // Clefairy with Recover
  G.save.team.push(healer, pal, self); G.syncTeam(); sim.run(3, { render: 0 });
  const [H, P, S] = G.team();
  const ratio = (a) => a.mon.hp / Mon.maxHp(a.mon);
  const near = () => { for (const a of [H, P, S]) { a.x = a.tx = 600 + a.id * 3; a.y = a.ty = 400; a.idleT = 99; } };

  // ---- update 8: healers, out of a fight
  near(); P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.3);
  const n = Battle.mend(H);
  ok('update 8: out of a fight, a Pokémon with Heal Pulse mends a hurt teammate (half its health)', n === 'Heal Pulse' && ratio(P) > 0.75, { move: n, now: +ratio(P).toFixed(2) });
  H.mon.hp = Math.round(Mon.maxHp(H.mon) * 0.3); P.mon.hp = Mon.maxHp(P.mon); S.mon.hp = Mon.maxHp(S.mon);
  ok('update 8: Heal Pulse is never used on itself', Battle.mend(H) === '' && ratio(H) < 0.35);
  H.mon.hp = Mon.maxHp(H.mon);
  S.mon.hp = Math.round(Mon.maxHp(S.mon) * 0.3);
  ok('update 8: one with Recover mends itself when it is under half', Battle.mend(S) === 'Recover' && ratio(S) > 0.75, +ratio(S).toFixed(2));
  ok('update 8: nobody hurt: nothing is used', Battle.mend(H) === '' && Battle.mend(S) === '');
  near(); P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.3); G.lastBattle = G.now; H.mendT = 0;
  for (let i = 0; i < 20; i++) { G.lastBattle = G.now; sim.run(0.1, { render: 0 }); }      // (a fight just ended: no slow recovery yet)
  ok('update 8: the team does it by itself, within a couple of seconds', ratio(P) > 0.75, +ratio(P).toFixed(2));
  // ---- update 8: in a fight
  const foe = G.addWild(19, 30, false); sim.run(1.5, { render: 0 });
  foe.x = 700; foe.y = 400; H.obey = true;
  P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.3); foe.mon.hp = Math.round(Mon.maxHp(foe.mon) * 0.3);
  const pick = Battle.chooseMove(H, foe);
  ok('update 8: in a fight, with a teammate badly hurt, the healer chooses Heal Pulse', pick && pick.k === 'heal-pulse', pick && pick.k);
  const foeBefore = foe.mon.hp, palBefore = P.mon.hp;
  sim.get('Battle').fire(H, foe, D.moves[505]); sim.run(0.6, { render: 0 });
  ok('update 8: Heal Pulse mends the teammate, never the foe (until 0.9.6 it mended the foe)', P.mon.hp > palBefore && foe.mon.hp <= foeBefore, { pal: [palBefore, P.mon.hp], foe: [foeBefore, foe.mon.hp] });
  P.mon.hp = Mon.maxHp(P.mon); S.mon.hp = Mon.maxHp(S.mon); H.mon.hp = Mon.maxHp(H.mon);
  const pick2 = Battle.chooseMove(H, foe);
  ok('update 8: nobody hurt: it attacks instead', pick2 && pick2.k !== 'heal-pulse', pick2 && pick2.k);
  const group = Mon.create(1, 30, {}); group.moves = [816, 33];                // Jungle Healing
  ok('update 8: Jungle Healing and Lunar Blessing count as moves it can use', Battle.supported(D.moves[816]) && Battle.supported(D.moves[849]));
  G.removeActor(foe); sim.run(0.5, { render: 0 });

  // ---- update 7: the fountain
  G.setField({ x: 0, y: 0, w: 1280, h: 720 }); sim.run(2, { render: 0 });
  const f = G.fountainOf();
  ok('update 7: Fountain Square stands in the field', !!f, f && [Math.round(f.x), Math.round(f.y)]);
  if (f) {
    H.mon.moves = [33]; S.mon.moves = [1];                // (no healing moves now: the fountain alone)
    P.x = P.tx = f.x + 450; P.y = P.ty = f.y + 120; P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.3); P.idleT = 99;
    let drank = false, reached = 999;
    for (let i = 0; i < 300 && P.mon.hp < Mon.maxHp(P.mon); i++) { G.lastBattle = G.now; sim.run(0.1, { render: 0 }); if (G.drinking(P) && !drank) { drank = true; reached = i / 10; } }
    ok('update 7: a hurt team member walks to the fountain and drinks', drank, { reached, d: Math.round(Math.hypot(P.x - f.x, P.y - f.y)) });
    ok('update 7: it drinks until it is well again (the usual slow recovery was held off meanwhile)', P.mon.hp >= Mon.maxHp(P.mon) && !P.drink, +ratio(P).toFixed(2));
    P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.8); P.drink = null; sim.run(3, { render: 0 });
    ok('update 7: one only a little hurt does not bother', !P.drink);
    G.set.roam = 'stay'; P.mon.hp = Math.round(Mon.maxHp(P.mon) * 0.3); sim.run(2, { render: 0 });
    ok('update 7: "Stay where I put them" is respected', !P.drink);
    G.set.roam = 'stroll'; P.mon.hp = Mon.maxHp(P.mon);
    const w = G.addWild(129, 10, false); sim.run(2, { render: 0 });     // a Magikarp that stays: a water type, into the basin
    w.loiter = true; w.calm = true; w.mon.hp = Math.round(Mon.maxHp(w.mon) * 0.3);
    let wd = false;
    for (let i = 0; i < 900 && !wd; i++) { sim.run(0.1, { render: 0 }); if (w.drink) wd = true; }
    ok('update 7: a hurt wild Pokémon that is staying goes to the fountain now and then', wd);
    const inBasin = w.drink && Math.hypot((w.drink.x - f.x) / f.rx, (w.drink.y - f.y) / f.ry) < 1;
    ok('update 7: a water type goes into the basin', !!inBasin);
    G.trainerTarget = w; sim.run(0.5, { render: 0 });
    ok('update 7: the one you are working on stops drinking', !w.drink);
    G.trainerTarget = null; G.removeActor(w);
  }
  G.setField(null); sim.run(1, { render: 0 });
  ok('update 7: without Fountain Square (the plain overlay) nobody goes looking for one', !G.fountainOf());
  const src = read('src/game.js');
  ok('update 7: not in a Trainer battle', /a\.drink && \(G\.inTrainerBattle\(\)/.test(src) && /G\.inTrainerBattle\(\) \|\| !fountainOf\(\)\) return false;/.test(src));
  ok('update 1 (0.9.6): Mewtwo dives upright', !/rotate\(135deg\)/.test(read('overlay.css')));
  ok('version 0.9.6 or later', JSON.parse(read('package.json')).version.split('.').map(Number).reduce((v, n) => v * 100 + n, 0) >= 906);
  ok('no errors on the way', !errs(), errs());
  console.log(`\n=== 0.9.6 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
