// Screen Trainer — checks for 0.9.1 ("Pokémon outside the field window can be clicked", "clicks lost after the
// field window closed").
//
//   node tools/v091check.js
//
// Headless, a few seconds, the same pretend page as tools/playtest.js. It checks
//   - with the field window open and its world larger than the window (the camera), a Pokémon walking outside the
//     window cannot be clicked and does not take the mouse; one inside can, and so can Mewtwo outside it;
//   - the Box Field likewise;
//   - after the field window closes, every Pokémon on the screen can be clicked again;
//   - a Pokémon that walks out from under a still pointer keeps the mouse a moment (so a press just then still lands),
//     and a pointer that moves away lets go at once.
// Exit code 1 when something fails.
'use strict';
const path = require('path');
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
  const env = await boot({ seed: 7, settings: Object.assign({}, quiet) });
  const sim = new Sim(env, 'v091'), G = sim.G;
  const hover = []; const st = sim.get('window.st'); const h0 = st.hover; st.hover = (b) => { hover.push(!!b); h0(b); };
  st.openPanel = () => {};
  for (const [sp, lvl] of [[25, 20], [133, 20]]) G.save.team.push(sim.Mon.create(sp, lvl, {}));
  G.syncTeam(); sim.run(4, { render: 0 });
  const errs = () => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');

  // ---- a small field window: the world (at least 1280 x 720) is larger than what the window shows
  G.setField({ x: 500, y: 200, w: 320, h: 228 });
  sim.run(3, { render: 0 });
  G.pulling = false;                                       // (the walk in is over)
  ok('the field window is open and seen through a camera', !!G.view && !!G.cam && G.W >= 1280, { view: G.view, cam: G.cam, W: G.W });
  const [a, b] = G.team();
  for (const x of [a, b]) { x.idleT = 999; x.hops = null; x.jy = 0; }
  // a stands where the window shows it, b far outside what the window shows
  const inW = G.toWorld(G.view.x + G.view.w / 2, G.view.y + G.view.h * 0.7);
  a.x = a.tx = inW[0]; a.y = a.ty = inW[1];
  const outS = [G.view.x - 200, G.view.y + 100], outW = G.toWorld(outS[0], outS[1]);
  b.x = b.tx = Math.max(40, Math.min(G.W - 40, outW[0])); b.y = b.ty = Math.max(80, Math.min(G.H - 10, outW[1] + b.h * 0.45));
  const bS = G.toScreen(b.x, b.y - b.h * 0.45);
  ok('(set up) one team member is outside the window, in the world', !G.inView(bS[0], bS[1]) && b.x >= 0 && b.x <= G.W, { b: [b.x, b.y], screen: bS, view: G.view });
  const mid = (x) => [x.x, x.y - x.h * 0.45];
  ok('a Pokémon outside the field window cannot be clicked', G.pick(...mid(b)) === null);
  sim.move(...mid(b)); sim.run(0.1, { render: 0 });
  ok('and does not take the mouse: the click goes to the desktop', G.pointer.state === 'through' && G.capture === false, G.pointer.state);
  ok('a Pokémon inside the field window can be clicked', !!G.pick(...mid(a)) && G.pick(...mid(a)).actor === a);
  sim.move(...mid(a)); sim.run(0.1, { render: 0 });
  ok('and takes the mouse', G.pointer.state === 'over' && G.capture === true && hover[hover.length - 1] === true, G.pointer.state);
  const pets = G.save.stats.pets;
  G.onDown(...mid(a), 0); G.onUp(); sim.run(0.05, { render: 0 });
  ok('a click on it pets it', G.save.stats.pets === pets + 1);
  // Mewtwo stands on the screen, not in the field: it stays clickable wherever it is
  const M = sim.get('typeof Mewtwo !== "undefined" ? Mewtwo : null');
  if (M && M.present && M.present()) {
    const m = M.box(), ms = [m.x, m.y - m.h * 0.5];
    const mw = G.toWorld(ms[0], ms[1]), hit = G.pick(mw[0], mw[1]);
    ok('Mewtwo can still be clicked outside the field window', G.inView(ms[0], ms[1]) || (!!hit && hit.kind === 'guard'), { m, hit });
  }
  // the Box Field: same rule
  const BF = sim.get('BoxField');
  for (const [sp, lvl] of [[1, 5], [4, 5], [7, 5]]) G.save.box.push(sim.Mon.create(sp, lvl, {}));
  BF.set(true); sim.run(0.5, { render: 0 });
  if (BF.active()) {
    const w = BF.where();
    const out = w.find((s) => { const p = G.toScreen(s.x, s.y - s.h / 2); return !G.inView(p[0], p[1]); });
    const inn = w.find((s) => { const p = G.toScreen(s.x, s.y - s.h / 2); return G.inView(p[0], p[1]); });
    if (out) { sim.move(out.x, out.y - out.h / 2); sim.run(0.1, { render: 0 }); ok('the Box Field: a Pokémon outside the window does not take the mouse', G.pointer.state === 'through', G.pointer.state); }
    else ok('the Box Field: (none outside the window to try)', true);
    if (inn) { sim.move(inn.x, inn.y - inn.h / 2); sim.run(0.1, { render: 0 }); ok('the Box Field: one inside the window does', G.pointer.state === 'over', G.pointer.state); }
  } else ok('the Box Field came up', false);
  BF.set(false); sim.run(0.5, { render: 0 });

  // ---- the field window closes: everyone on the screen can be clicked
  G.setField(null);
  sim.run(1, { render: 0 });
  ok('the field window closed: no view, no camera', !G.view && !G.cam);
  const vis = G.team().filter((x) => !x.await && !x.gone);
  let all = vis.length > 0;
  for (const x of vis) { x.idleT = 999; x.hops = null; const h = G.pick(...mid(x)); if (!h || h.actor !== x) all = false; }
  ok('after it closed, every team member on the screen can be clicked', all, vis.map((x) => [Math.round(x.x), Math.round(x.y)]));
  const c = vis[0];
  sim.move(...mid(c)); sim.run(0.1, { render: 0 });
  ok('and takes the mouse when the pointer is on it', G.pointer.state === 'over' && G.capture === true, G.pointer.state);

  // ---- a Pokémon walks out from under a still pointer
  const at = mid(c);
  c.x += 300; c.tx = c.x; sim.run(0.05, { render: 0 });
  ok('it walked away from a still pointer: the mouse is kept a moment', G.pointer.state === 'over' && G.capture === true, G.pointer.state);
  sim.run(0.4, { render: 0 });
  ok('and let go soon after', G.pointer.state === 'through' && G.capture === false, G.pointer.state);
  sim.move(...mid(c)); sim.run(0.1, { render: 0 });
  sim.move(at[0] - 400, at[1]); sim.run(0.05, { render: 0 });
  ok('a pointer that moves away from the Pokémon lets go at once', G.pointer.state === 'through', G.pointer.state);

  // ---- the press that never arrives (0.9.1 / 0.9.2): only moves and the release reach the page
  const L = sim.get('window._listeners'); if (!st.blocked) st.blocked = () => {};      // (the desktop overlay)
  const fire = (type, x, y, buttons, button = 0) => { const s = G.toScreen(x, y); for (const f of L[type] || []) f({ clientX: s[0] - G.vx * 0, clientY: s[1], buttons, button, target: null, preventDefault() {} }); };
  const [p] = G.team(); p.idleT = 999; p.hops = null; p.x = p.tx = 500; p.y = p.ty = 400;
  const pm = mid(p);
  fire('mousemove', pm[0], pm[1], 0); sim.run(0.1, { render: 0 });
  const tapPets = G.save.stats.pets;
  fire('mouseup', pm[0], pm[1], 0); sim.run(0.05, { render: 0 });
  ok('a release with no press, on a team member: taken as a click (a pat)', G.save.stats.pets === tapPets + 1 && !G.drag, G.save.stats.pets - tapPets);
  fire('mousemove', pm[0], pm[1], 0); sim.run(0.1, { render: 0 });
  ok('(the pointer is on it again)', G.capture === true, G.pointer.state);
  fire('mousemove', pm[0] + 30, pm[1] + 20, 1); sim.run(0.05, { render: 0 });
  ok('the button held while the pointer moves, no press seen: the drag begins', !!G.drag && G.drag.a === p && G.pointer.state === 'held', G.pointer.state);
  fire('mousemove', pm[0] + 120, pm[1] + 60, 1); sim.run(0.05, { render: 0 });
  fire('mouseup', pm[0] + 120, pm[1] + 60, 0); sim.run(0.3, { render: 0 });
  ok('and the release sets it down where the pointer is', !G.drag && Math.abs(p.x - (pm[0] + 120)) < 30, [Math.round(p.x), Math.round(p.y)]);
  // a desktop drag that only passes over a Pokémon with the button already down does not pick it up
  const [q] = G.team(); q.idleT = 999; q.hops = null; const qm = mid(q);
  fire('mousemove', qm[0] - 300, qm[1], 1);              // (the button went down somewhere else)
  sim.move(...qm); fire('mousemove', qm[0], qm[1], 1); sim.run(0.1, { render: 0 });
  fire('mousemove', qm[0] + 20, qm[1], 1); sim.run(0.05, { render: 0 });
  ok('a button pressed elsewhere and dragged over a Pokémon does not pick it up', !G.drag, G.pointer.state);
  fire('mouseup', qm[0] + 20, qm[1], 0); sim.run(0.1, { render: 0 });
  ok('no errors on the way', !errs(), errs());

  console.log(`\n=== 0.9.1 / 0.9.2 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
