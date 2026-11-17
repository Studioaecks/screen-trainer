// Screen Trainer — checks for 0.9.3 (the owner's "fixes and updates11-16" list, fixes 3, 5, 6, 7 and 8).
//
//   node tools/v093check.js
//
// Headless, a few seconds, the same pretend page as tools/playtest.js.
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
(async () => {
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true };
  const env = await boot({ seed: 5, settings: Object.assign({}, quiet) });
  const sim = new Sim(env, 'v093'), G = sim.G, Mon = sim.Mon;
  const errs = () => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');

  // ---- fix 6: looks
  const seen = new Set(); for (let i = 0; i < 3000; i++) seen.add(Mon.create(201, 5).look || '');
  ok('fix 6: Unown comes in all 28 shapes, A to Z, ! and ?', seen.size === 28 && seen.has('') && seen.has('z') && seen.has('question') && seen.has('exclamation'), [...seen].sort().join(','));
  const viv = new Set(); for (let i = 0; i < 600; i++) viv.add(Mon.create(666, 20).look || ''); 
  ok('fix 6: Vivillon wears its patterns', viv.size >= 15, viv.size);
  const f = Mon.create(669, 10); f.look = 'blue'; Mon.evolveTo(f, 670);
  ok('fix 6: Flabébé keeps its flower when it evolves', f.sp === 670 && f.look === 'blue');
  ok('fix 6: an ordinary Pokémon carries no look in the save', !('look' in Mon.create(25, 5)));
  const S = sim.get('Sprites');
  S.configure({ rootUrl: 'file:///S', idx: { pokemon: [201, '201-b', '666-high-plains'], 'pokemon/other/showdown': [201, '201-b', '666-highplains'] } }, 'showdown');
  ok('fix 6: an Unown B is drawn as a B', /201-b\.gif$/.test((S.resolve(201, false, false, 'b') || {}).front || ''));
  ok('fix 6: a look named differently in another sprite set is still found', /666-highplains\.gif$/.test((S.resolve(666, false, false, 'high-plains') || {}).front || ''));
  ok('fix 6: a look the sprite set does not have falls back to the usual picture', /\/201\.gif$/.test((S.resolve(201, false, false, 'q') || {}).front || ''));
  ok('fix 6: the Pokédex names it', Mon.lookName({ sp: 201, look: 'b' }) === 'B' && Mon.lookName({ sp: 666, look: 'high-plains' }) === 'High Plains');

  // ---- fix 8: a newcomer does not run away
  for (const [sp, lvl] of [[6, 60]]) G.save.team.push(Mon.create(sp, lvl, {}));
  G.syncTeam(); sim.run(3, { render: 0 });
  const w = G.addWild(16, 5, false); sim.run(0.5, { render: 0 });
  w.mon.hp = 1; w.aggro = true; w.fleeChk = false;
  const fled0 = G.save.stats.fled; let ran = 0;
  for (let i = 0; i < 30 && !w.gone; i++) { w.fleeChk = false; sim.run(0.05, { render: 0 }); }
  ran = w.state === 'leave' ? 1 : 0;
  ok('fix 8: a wild Pokémon that has just come (under 3 seconds) does not run away when it is hurt', ran === 0 && G.save.stats.fled === fled0, { state: w.state, gone: w.gone });
  const src = fs.readFileSync(path.join(APP, 'src', 'game.js'), 'utf8');
  ok('fix 8: "(not caught yet)" no longer passes by; a caught kind has a Poké Ball by its name', !/not caught yet\)/.test(src) && /caughtBall\(c,/.test(src));

  // ---- fix 3: the Trainer stays to talk
  const R = sim.get('Rivals');
  G.set.trainerBattles = 'often'; R.start(); sim.run(1, { render: 0 });
  if (R.active()) {
    const lines = []; const st0 = R.state();
    sim.get('(() => { const r = Rivals; return r; })()');
    // make it leave: nobody battles it
    for (let i = 0; i < 400 && R.active() && R.state().phase !== 'leave'; i++) sim.run(0.5, { render: 0 });
    const said = R.active() ? R.state().say : '';
    sim.run(2.5, { render: 0 });
    const still = R.active();
    sim.run(10, { render: 0 });
    ok('fix 3: a Trainer that leaves stays put while its words are up, then goes', !!st0 && !!said && still && !R.active(), { said, still });
  } else ok('fix 3: (a Trainer came)', false);

  // ---- fix 7: the tick box follows the setting
  const panel = fs.readFileSync(path.join(APP, 'src', 'panel.js'), 'utf8');
  ok('fix 7: a tick box in Options shows the setting even while it has the focus', /if \(kind === 'check'\) \{ el\.checked = !!settings\[k\]; continue; \}/.test(panel));
  // ---- fix 5: the whole window
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  ok('fix 5: the game is given the whole inside of the field window, also past the edge of the screen', /\{ x: c\.x - o\.x, y: c\.y - o\.y, w: c\.width, h: c\.height \}/.test(main));
  G.setField({ x: -200, y: 100, w: 640, h: 480 }); sim.run(1, { render: 0 });
  ok('fix 5: a field partly off the screen keeps the size of its window', !!G.view && G.view.w === 640 && G.view.x === -200 && G.W >= 1280, G.view);
  // ---- fix 4: the field window is an ordinary window; where others cover it the scenery and weather are cut away
  ok('fix 4: the overlay is never tied to the field window, which is not kept on top', /const want = false;/.test(main) && /fieldWin\.setAlwaysOnTop\(false\)/.test(main) && fs.existsSync(path.join(APP, 'ps', 'cover.ps1')));
  G.setField({ x: 100, y: 100, w: 800, h: 600 }); sim.run(1, { render: 0 });
  const FX = sim.FX, clips = []; const sc0 = FX.setClip; FX.setClip = (r) => { clips.push(r); return sc0(r); };
  G.covers = [[500, 100, 400, 300]]; G.applyCovers();
  const vis = clips[clips.length - 1];
  ok('fix 4: a window over part of the field: the rest of the field is what is drawn', Array.isArray(vis) && vis.length >= 1 && G.covered(600, 200) && !G.covered(200, 200), vis);
  const area = vis.reduce((t, r) => t + r[2] * r[3], 0) * G.cam.z * G.cam.z;
  ok('fix 4: the part left is the field less the window over it', Math.abs(area - (800 * 600 - 400 * 300)) < 50, Math.round(area));
  G.covers = [[0, 0, 2000, 2000]]; G.applyCovers();
  ok('fix 4: the field wholly covered: nothing of the scenery or weather is drawn', Array.isArray(clips[clips.length - 1]) && clips[clips.length - 1].length === 0);
  const [tm] = G.team(); tm.idleT = 999; tm.hops = null; const tp = G.toWorld(300, 400); tm.x = tm.tx = tp[0]; tm.y = tm.ty = tp[1];
  const hit = G.pick(tm.x, tm.y - tm.h * 0.45);
  ok('fix 4: a Pokémon in the covered field can still be clicked: the Pokémon stay on top', !!hit && hit.actor === tm);
  sim.run(2, { render: 0 });
  G.covers = []; G.applyCovers();
  ok('fix 4: nothing over it: the whole field again', clips[clips.length - 1] === null);
  ok('no errors on the way', !errs(), errs());
  console.log(`\n=== 0.9.3 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
