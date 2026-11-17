// Screen Trainer — checks for the state machines and for "a Pokémon can always be clicked" (0.9).
//
//   node tools/statecheck.js
//
// Headless, a few seconds, the same pretend page as tools/playtest.js. It checks
//   - src/machine.js itself: the table is obeyed, refusals are counted, a state with a time limit is left;
//   - the page's two machines (play, pointer): through / over / held, the Box Field, the window is told again;
//   - that a mouse button which never came up does not leave a Pokémon in the pointer's hand;
//   - that one Pokémon in trouble (its step throws) does not stop the others or the pointer;
//   - G.sanity: every way found for a Pokémon to stay on the screen and never answer a click is put right
//     (a place that is not a number, a ball that never arrives, out of reach for good, a picture without a Pokémon);
//   - the Box Field: its Pokémon can be petted, carried and looked up.
// Exit code 1 when something fails, so it can gate a change.
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`);
  return !!cond;
}

function machines() {
  const Machine = require(path.join(APP, 'src', 'machine.js'));
  Machine.reset();
  const seen = [];
  const m = Machine.make('door', { about: 'a door', initial: 'shut', states: {
    shut: { about: 'shut', to: ['opening'] }, opening: { about: 'on its way', to: ['open', 'shut'], max: 0.05, then: 'shut' }, open: { about: 'open', to: ['shut'] },
  }, change: (to, from, why) => seen.push(`${from}>${to}:${why}`) });
  ok('a machine starts in its first state', m.state === 'shut' && m.is('shut') && !m.is('open'));
  ok('a change the table allows is made, with its reason kept', m.go('opening', 'pushed') && m.state === 'opening' && m.history.length === 1 && m.history[0].why === 'pushed' && seen[0] === 'shut>opening:pushed');
  ok('going where it already is changes nothing', !m.go('opening', 'again') && m.history.length === 1);
  m.go('open', 'arrived');
  ok('a change the table forbids is refused and counted, not thrown', !m.go('opening', 'no') && m.state === 'open' && m.refused === 1 && /open -> opening/.test(m.lastRefused));
  Machine.strict = true;
  let threw = false; try { m.go('opening', 'no'); } catch (e) { threw = true; }
  Machine.strict = false;
  ok('the checks can ask for it to throw instead', threw);
  m.go('shut', 'closed'); m.go('opening', 'pushed again');
  const before = Machine.tick(Date.now());
  const later = Machine.tick(Date.now() + 200);
  ok('a state with a time limit is left when the time is up', before.length === 0 && later.length === 1 && later[0].to === 'shut' && m.state === 'shut' && m.rescued === 1, later);
  let bad = false; try { Machine.make('x', { initial: 'a', states: { a: { to: ['nowhere'] } } }); } catch (e) { bad = true; }
  ok('a table that names a state that does not exist is turned down when it is made', bad);
  const r = Machine.report().find((x) => x.name === 'door');
  ok('the report names the state, what it means and how it got there', !!r && r.state === 'shut' && r.means === 'shut' && r.history.length >= 4 && r.states.length === 3, r && r.history.length);
  Machine.reset();
}

async function page() {
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true };
  const fresh = async (team, box) => {
    const env = await boot({ seed: 11, settings: Object.assign({}, quiet) });
    const sim = new Sim(env, 'state'), G = sim.G;
    const hover = []; const st = sim.get('window.st'); const h0 = st.hover; st.hover = (b) => { hover.push(!!b); h0(b); };
    const notes = []; st.note = (o) => notes.push(o);
    const opened = []; st.openPanel = (t) => opened.push(t);
    for (const [sp, lvl] of team || []) G.save.team.push(sim.Mon.create(sp, lvl, {}));
    for (const [sp, lvl] of box || []) G.save.box.push(sim.Mon.create(sp, lvl, {}));
    G.save.helpers = { rotom: 1, mewtwo: 1, porygonz: 1 };
    G.syncTeam(); sim.run(4, { render: 0 });
    return { sim, G, hover, notes, opened, get: sim.get };
  };
  const errs = (sim) => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');
  const mid = (a) => [a.x, a.y - a.h * 0.45];

  // ---- the pointer machine
  {
    const { sim, G, hover } = await fresh([[25, 20], [133, 20]]);
    const a = G.team()[0]; a.x = a.tx = 400; a.y = a.ty = 400; a.idleT = 99;
    sim.move(50, 50); sim.run(0.1, { render: 0 });
    ok('nothing under the pointer: clicks fall through', G.pointer.state === 'through' && G.capture === false);
    sim.move(...mid(a)); sim.run(0.1, { render: 0 });
    ok('on a Pokémon: the overlay takes the mouse, and the window was told', G.pointer.state === 'over' && G.capture === true && hover[hover.length - 1] === true, G.pointer.state);
    G.onDown(...mid(a), 0); sim.run(0.05, { render: 0 });
    ok('a button down on a team member: it is in the pointer\'s hand', G.pointer.state === 'held' && !!G.drag);
    G.onUp(); sim.run(0.05, { render: 0 });
    ok('the button up: a pat, and the hand is empty again', G.pointer.state === 'over' && !G.drag && G.save.stats.pets === 1);
    // the mouse up that never comes
    G.onDown(...mid(a), 0); sim.run(0.05, { render: 0 });
    const let1 = G.letGo('test');
    ok('a hand that is told to let go lets go (the button came up over another window)', let1 === true && !G.drag && a.dragging === false && G.letGo('again') === false);
    sim.move(50, 50); sim.run(0.1, { render: 0 });
    ok('and afterwards clicks fall through again', G.pointer.state === 'through' && G.capture === false && hover[hover.length - 1] === false);
    // the Pokémon leaves while it is held
    sim.move(...mid(a)); sim.run(0.05, { render: 0 }); G.onDown(...mid(a), 0); sim.run(0.05, { render: 0 });
    G.command({ type: 'box', uid: a.mon.uid }); sim.run(0.1, { render: 0 });      // it is sent to the Box while it is in the hand
    ok('a Pokémon that leaves while it is held is not held any more', !G.drag && G.pointer.state !== 'held', G.pointer.state);
    ok('the history of the pointer can be read', G.pointer.history.length >= 6 && Array.isArray(sim.get('Machine.report()')) && sim.get('Machine.report()').some((m) => m.name === 'pointer' && m.means));
    const told = hover.length; const realNow = Date.now; let shift = 0; sim.get('Date').now = () => realNow() + shift;
    shift = 2600; sim.run(0.05, { render: 0 });
    ok('the window is told once more after two seconds, changed or not', hover.length === told + 1, hover.length - told);
    sim.get('Date').now = realNow;
    ok('no errors on the way', !errs(sim), errs(sim));
  }

  // ---- one Pokémon in trouble does not stop the others
  {
    const { sim, G, notes } = await fresh([[25, 20], [133, 20], [6, 30]]);
    const [a, b, c] = G.team();
    for (const x of [a, b, c]) { x.idleT = 0; }
    Object.defineProperty(b, 'idleT', { get() { throw new Error('made up for the check'); }, set() {}, configurable: true });      // its step throws, every frame
    const x0 = [a.x, c.x]; a.tx = a.x + 200; c.tx = c.x - 200; a.idleT = 0; c.idleT = 0;
    sim.move(...mid(c));
    let threw = 0; for (let i = 0; i < 60; i++) { try { G.update(1 / 60); } catch (e) { threw++; } c.idleT = 99; }
    ok('the frame does not throw because of one Pokémon', threw === 0, threw);
    ok('it is written down once, not sixty times', notes.filter((n) => n.kind === 'error').length === 1, notes.map((n) => n.kind));
    ok('the pointer still finds the others', G.pointer.state === 'over' && G.hover === c, G.pointer.state);
    delete b.idleT; b.idleT = 1;
    sim.run(1, { render: 0 });
    ok('and when the trouble is over it carries on', !b.gone && Number.isFinite(b.x));
  }
  // ---- something outside the Pokémon throws: the pointer is still looked after
  {
    const { sim, G } = await fresh([[25, 20]]);
    const a = G.team()[0]; a.x = a.tx = 400; a.y = a.ty = 400; a.idleT = 99;
    sim.move(...mid(a));
    const ev = sim.get('Events'), u0 = ev.update; ev.update = () => { throw new Error('made up for the check'); };
    let threw = 0; for (let i = 0; i < 10; i++) { try { G.update(1 / 60); } catch (e) { threw++; } }
    ev.update = u0;
    ok('a step that throws is reported, and the Pokémon under the pointer can still be clicked', threw === 10 && G.pointer.state === 'over' && G.capture === true, `${threw} ${G.pointer.state}`);
  }

  // ---- G.sanity
  {
    const { sim, G, notes } = await fresh([[25, 20], [133, 20]]);
    const [a, b] = G.team(); a.x = a.tx = 300; a.y = a.ty = 400; a.idleT = 99; b.x = b.tx = 700; b.y = b.ty = 400; b.idleT = 99;
    sim.run(1.2, { render: 0 });
    ok('nothing to put right in a healthy game', G.sanity().length === 0 && (G.sanityFound || 0) === 0, G.sanityFound);
    a.jy = NaN;
    ok('a Pokémon with a height that is not a number cannot be clicked ...', !G.pick(...mid(a)));
    const f1 = G.sanity();
    ok('... until it is put right', f1.length === 1 && a.jy === 0 && !!G.pick(a.x, a.y - a.h * 0.45), f1);
    a.x = NaN; a.y = undefined;
    const f2 = G.sanity();
    ok('a place that is not a number goes back to the last good place', f2.length === 2 && a.x === 300 && a.y === 400, [a.x, a.y]);
    const w = G.addWild(19, 5, false, { x: 500, y: 300 });
    sim.run(0.2, { render: 0 });
    w.balled = true; w.vol.away = 'air'; w.dragging = true;
    let found = []; for (let i = 0; i < 10; i++) found = found.concat(G.sanity());
    ok('a ball that never arrives, out of reach for good, held by nobody: all put right', !w.balled && !w.vol.away && !w.dragging && found.length === 3, found);
    ok('what was put right is written to the black box', notes.some((n) => n.kind === 'put right'), notes.length);
    sim.run(2, { render: 0 });
    ok('and the game carries on without errors', !errs(sim), errs(sim));
  }

  // ---- the Box Field can be touched
  {
    const { sim, G, opened, hover } = await fresh([[25, 20]], [[1, 5], [4, 5], [7, 5], [152, 12]]);
    G.ground = true;                                        // (a field to show the Box on, as on the stage)
    const BF = sim.get('BoxField');
    BF.set(true); sim.run(0.5, { render: 0 });
    ok('the Box is out: the game waits and says so', BF.active() && G.play.state === 'box');
    const s = BF.where()[0];
    sim.move(-500, -500); sim.run(0.1, { render: 0 });
    ok('nothing of the Box under the pointer: clicks fall through', G.pointer.state === 'through' && G.capture === false);
    const at = () => { const q = BF.where().find((x) => x.uid === s.uid); return [q.x, q.y - q.h * 0.5]; };
    sim.move(...at()); sim.run(0.05, { render: 0 });
    ok('on a Pokémon of the Box: the overlay takes the mouse', G.pointer.state === 'over' && G.capture === true && hover[hover.length - 1] === true, G.pointer.state);
    const pets = G.save.stats.pets, aff = G.save.box[0].aff, hp = G.save.box[0].hp;
    G.onDown(...at(), 0); G.onUp(); sim.run(0.3, { render: 0 });
    ok('a click pets it, and nothing about the Pokémon is changed', BF.active() && G.save.stats.pets === pets && G.save.box[0].aff === aff && G.save.box[0].hp === hp && !BF.holding());
    G.onDown(...at(), 2); G.onUp();
    ok('a right-click shows it in the Pokédex\'s Box', opened.length === 1 && opened[0] === 'box:' + s.uid, opened);
    const p0 = at();
    G.onDown(...p0, 0); sim.move(p0[0] + 120, p0[1] + 40); sim.run(0.05, { render: 0 });
    ok('it can be picked up', BF.holding() && G.pointer.state === 'held', G.pointer.state);
    G.onUp(); sim.run(0.05, { render: 0 });
    const p1 = at();
    ok('and set down somewhere else', !BF.holding() && Math.abs(p1[0] - (p0[0] + 120)) < 3 && G.pointer.state !== 'held', [p0, p1]);
    G.onDown(...at(), 0); sim.run(0.05, { render: 0 });
    BF.set(false); sim.run(0.3, { render: 0 });
    ok('the Box goes in while one is held: the team is back and nothing is in the hand', !BF.active() && !BF.holding() && G.play.state === 'playing' && G.pointer.state !== 'held', G.pointer.state);
    ok('no errors on the way', !errs(sim), errs(sim));
  }
}

(async () => {
  machines();
  await page();
  console.log(`\n=== state check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
