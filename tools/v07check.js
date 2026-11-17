// Screen Trainer — checks for what 0.7 changed and added (the owner's "Fixes and updates 11-13" list).
//
//   node tools/v07check.js                                   the rules of the game, headless: a few seconds
//   xvfb-run -a electron --no-sandbox tools/v07check.js      also the real program: the field window with its camera
//                                                            and Fountain Square, the Box Field, the Pokédex window
//   ST_TEST_SPRITES=<a sprites folder>  gives the real program pictures; without one most live checks cannot run.
//
// The headless part boots the game exactly as tools/playtest.js does (same pretend page) and asks pointed questions:
// does a walker get round the Day Care instead of walking at it, does a fainted team member stay down during a
// Trainer battle, and so on. Each check names the item of the list it belongs to.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const APP = path.join(__dirname, '..');
const live = !!process.versions.electron;
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 260) + ']' : ''}`);
  return !!cond;
}

// ------------------------------------------------------------------ the rules, headless
async function rules() {
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true };
  const mon = (sim, sp, lvl, o) => sim.Mon.create(sp, lvl, o || {});
  const fresh = async (settings, team) => {
    const sim = new Sim(await boot({ seed: 7, settings: Object.assign({}, quiet, settings || {}) }), 'v07'), G = sim.G;
    for (const [sp, lvl] of team || []) G.save.team.push(mon(sim, sp, lvl));
    G.save.helpers = { rotom: 1, mewtwo: 1, porygonz: 1 };      // (the helpers have their own check below)
    G.syncTeam(); sim.run(4, { render: 0 });
    return { sim, G, get: sim.get };
  };
  const errs = (sim) => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');

  // ---- fix 1: walking speed, move use speed
  {
    const walked = async (walkSpeed) => { const { sim, G } = await fresh({ walkSpeed }, [[25, 20]]); const a = G.team()[0]; a.x = a.tx = 300; a.y = a.ty = 500; sim.run(0.2, { render: 0 }); const x0 = a.x; let t = 0; while (t < 3) { a.tx = 1500; a.ty = 500; a.run = false; a.nap = 0; a.idleT = 9; G.update(1 / 60); t += 1 / 60; } return a.x - x0; };
    const full = await walked(1), half = await walked(0.5), dbl = await walked(2);
    ok('fix 1: the walking speed option slows everyone down and speeds them up in proportion', Math.abs(half / full - 0.5) < 0.06 && Math.abs(dbl / full - 2) < 0.15, { full: Math.round(full), half: Math.round(half), double: Math.round(dbl) });
    const { sim, get } = await fresh({}, [[25, 20]]);
    const iv = (ms) => { sim.settings.moveSpeed = ms; sim.handlers.settings(Object.assign({}, sim.settings)); let s = 0; const a = sim.G.team()[0]; for (let i = 0; i < 400; i++) s += get('Battle').interval(a); return s / 400; };
    const one = iv(1), slow = iv(0.5), fast = iv(2);
    ok('fix 1: the move use speed option changes how often moves are used, separately', Math.abs(slow / one - 2) < 0.1 && Math.abs(fast / one - 0.5) < 0.05, { at1: +one.toFixed(2), atHalf: +slow.toFixed(2), atDouble: +fast.toFixed(2) });
    const D = require(path.join(APP, 'defaults.js'));
    ok('fix 1: both are options with ranges', D.sanitize({ walkSpeed: 9, moveSpeed: 0 }).walkSpeed === 2 && D.sanitize({ moveSpeed: 0.01 }).moveSpeed === 0.25 && D.DEFAULTS.walkSpeed === 1 && /\['walkSpeed', 'range'/.test(fs.readFileSync(path.join(APP, 'src', 'panel.js'), 'utf8')) && /\['moveSpeed', 'range'/.test(fs.readFileSync(path.join(APP, 'src', 'panel.js'), 'utf8')));
  }
  // ---- fix 1: nobody gets stuck walking at the Day Care; strolling does not gather everyone at the edges
  {
    const { sim, G } = await fresh({}, [[25, 20]]);
    const a = G.team()[0];
    // the Day Care as it stands on the stage: a wide low block near the top of the world, with no way round its top
    const yard = { name: 'yard', x: G.W / 2, y: 137, rx: 132, ry: 52 };
    G.blocks = [yard];
    const inside = (o, x, y) => ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 < 0.93;
    const trip = (x0, y0, x1, y1) => { a.x = x0; a.y = y0; a.tx = x1; a.ty = y1; a.round = null; let t = 0, went = false, worst = 0; while (t < 30) { a.tx = x1; a.ty = y1; a.nap = 0; a.idleT = 9; G.update(1 / 60); t += 1 / 60; if (inside(yard, a.x, a.y)) went = true; worst = Math.max(worst, 0); if (Math.hypot(a.x - x1, a.y - y1) < 12) break; } return { t: +t.toFixed(1), went, left: Math.round(Math.hypot(a.x - x1, a.y - y1)) }; };
    const b = G.bounds(a);
    const across = trip(yard.x - 260, 150, yard.x + 260, 150), back = trip(yard.x + 260, 140, yard.x - 260, 160), under = trip(yard.x, 330, yard.x + 30, b.y0 + 2);
    ok('fix 1: a walker whose goal lies behind the Day Care goes round it and arrives', across.left < 14 && back.left < 14 && !across.went && !back.went && across.t < 25, { across, back });
    ok('fix 1: a goal that cannot be reached past the fence ends at the fence, not in a shuffle', under.t <= 30 && !under.went, under);
    G.blocks = [];
    const { sim: s2, G: G2 } = await fresh({ paused: false, spawnEvery: 3, maxWild: 4, maxLoiter: 30, autoBattle: false }, [[25, 20]]);
    s2.run(600, { render: 0, dt: 1 / 20 });
    const w = G2.wilds().filter((x) => !x.await && !x.hops), edge = w.filter((x) => { const bb = G2.bounds(x); return x.x - bb.x0 < 50 || bb.x1 - x.x < 50 || x.y - bb.y0 < 40 || bb.y1 - x.y < 40; });
    ok('fix 1: wild Pokémon that stay spread over the world instead of standing along its edges', w.length >= 8 && edge.length / w.length < 0.34, `${edge.length} of ${w.length} near an edge after ten minutes${errs(s2) ? ' ' + errs(s2) : ''}`);
  }
  // ---- fix 5: Master Balls come 1 to 10
  {
    const { get } = await fresh({}, [[25, 20]]);
    const Items = get('Items'), m = Array.from({ length: 400 }, () => Items.ballStack('master-ball')), u = Array.from({ length: 400 }, () => Items.ballStack('ultra-ball'));
    ok('fix 5: a find of Master Balls holds 1 to 10, of other balls 10 to 100 as before', Math.min(...m) === 1 && Math.max(...m) === 10 && Math.min(...u) >= 10 && Math.max(...u) <= 100 && Math.max(...u) > 60, { master: [Math.min(...m), Math.max(...m)], ultra: [Math.min(...u), Math.max(...u)] });
  }
  // ---- fix 2: set down where it is let go; fix 2/3 need the stage and are in the live part
  {
    const { sim, G } = await fresh({}, [[25, 20]]);
    const egg = { mon: mon(sim, 54, 1), t: 0.5, x: 900, y: 600 };
    G.save.eggs = [egg];
    sim.run(0.7, { render: 0 });
    const a = G.actors.find((q) => q.mon === egg.mon);
    sim.dom.Image.flush(); sim.run(0.05, { render: 0 });
    const at = a ? { x: Math.round(a.x), y: Math.round(a.y), fall: !!a.fall, hops: !!a.hops, await: !!a.await } : null;
    sim.run(1, { render: 0 });
    ok('fix 2: a hatched Pokémon drops in where the egg lay instead of hopping in from the edge', !!a && at.x === 900 && at.y === 600 && at.fall && !at.hops && !a.fall && Math.round(a.jy) === 0 && G.save.team.includes(egg.mon), at);
  }
  // ---- fix 4: Trainer battles
  {
    const { sim, G, get } = await fresh({ battleStyle: 'ko' }, [[6, 60], [9, 60], [3, 60]]);
    const Rivals = get('Rivals');
    const R = Rivals.start('trainer');
    sim.dom.Image.flush(); sim.run(6, { render: 0 });
    const theirs = () => G.wilds().filter((w) => w.rival), wild = G.addWild(19, 5, false, { x: G.team()[0].x + 60, y: G.team()[0].y });
    wild.aggro = true; wild.terr = true;
    for (const w of [...theirs(), ...G.team()]) { w.mon.hpx = 40; w.mon.hp = sim.Mon.maxHp(w.mon); }      // (everyone sturdy enough that the battle lasts as long as the check needs)
    ok('fix 4: another Trainer comes with a team', !!R && theirs().length === 6);
    const t0 = theirs()[0];
    Rivals.click(t0, 0);
    const leader = G.leader();
    ok('fix 4: a click is an order: the leader is told at once and decides for itself', Rivals.fighting() && Rivals.leadTarget() === t0 && leader.obeyFor === 0 && leader.thinkT === 0);
    // orders are obeyed about as often as the leader's obedience says, not always
    let obeyed = 0, n = 0;
    for (let i = 0; i < 300; i++) { leader.obeyT = 0; leader.obeyFor = 0; leader.thinkT = 0; G.update(1 / 60); if (leader.obeyFor) { n++; if (leader.obey) obeyed++; } }
    const want = G.obeyChance(leader, leader);
    ok('fix 4: the Pokémon might not listen (orders are obeyed as often as its obedience says)', n > 200 && Math.abs(obeyed / n - want) < 0.12 && want < 1, { obeyed: +(obeyed / n).toFixed(2), obedience: +want.toFixed(2) });
    // a team member goes down: it stays down while the battle is on, whatever is tried
    const down = G.team()[1];
    G.faint(down);
    G.save.bag.revive = 3;
    sim.run(40, { render: 0, dt: 1 / 30 });
    const still = Rivals.fighting();
    const stayed = down.state === 'faint' && down.mon.hp === 0, refused = G.useItem('revive', down.mon, false) === false && G.save.bag.revive === 3;
    ok('fix 4: who goes down in a Trainer battle stays down: no getting up by itself, no Revive', still && stayed && refused, { fighting: still, state: down.state, hp: down.mon.hp, revives: G.save.bag.revive });
    ok('fix 4: wild Pokémon keep out of a Trainer battle: not fought, not fighting, at a distance', G.targetable(wild) && !wild.aggro && !G.team().some((a) => a.target === wild) && wild.mon.hp === sim.Mon.maxHp(wild.mon) && Math.min(...G.team().filter((a) => a.mode === 'fight').map((a) => Math.hypot(a.x - wild.x, a.y - wild.y)).concat(9999)) > 150, { aggro: wild.aggro, hp: wild.mon.hp });
    // win it: the rest of the rival team faints
    for (const w of theirs()) if (G.alive(w)) G.faint(w);
    sim.run(30, { render: 0, dt: 1 / 30 });
    ok('fix 4: once the battle is over the fainted get up again as before', !Rivals.fighting() && down.state !== 'faint' && down.mon.hp > 0, { state: down.state, hp: down.mon.hp, problems: errs(sim) });
  }
  {
    // a Gym Leader wins: the badge button appears and calls the leader back
    const { sim, G, get } = await fresh({ battleStyle: 'ko' }, [[25, 8]]);
    const Rivals = get('Rivals'), Honors = get('Honors');
    const first = Honors.BADGES[0];
    G.save.gymRetry = first.id;                             // (stands for "its task is done": the leader may come)
    const R = Rivals.start('gym');
    sim.dom.Image.flush(); sim.run(5, { render: 0 });
    const had = !!R && R.kind === 'gym';
    G.save.gymRetry = 0;
    Rivals.click(G.wilds().find((w) => w.rival), 0);
    for (const a of G.team()) G.faint(a);
    sim.run(8, { render: 0 });
    const kept = G.save.gymRetry === first.id && !G.save.badges[first.id];
    sim.run(6, { render: 0 });
    const [bx, by] = [34, Math.round(G.SH * 0.42)], w = G.toWorld(bx, by), hit = G.pick(w[0], w[1]);
    ok('fix 4: after losing to a Gym Leader a badge button appears on the screen', had && kept && !Rivals.active() && !!hit && hit.kind === 'gym' && get('Honors').badgeView(G.save)[0].retry === true, { had, kept, hit: hit && hit.kind });
    sim.run(30, { render: 0 });                             // the team is back on its feet
    G.onDown(w[0], w[1], 0); G.onUp();
    sim.dom.Image.flush(); sim.run(3, { render: 0 });
    const again = Rivals.state();
    ok('fix 4: clicking it brings that Gym Leader back for another battle, any time', !!again && again.kind === 'gym' && again.badge === first.id && !G.pick(w[0], w[1]), again);
    for (const x of G.wilds().filter((q) => q.rival)) { if (Rivals.state().phase === 'wait') Rivals.click(x, 0); }
    for (const x of G.wilds().filter((q) => q.rival)) if (G.alive(x)) G.faint(x);
    sim.run(6, { render: 0 });
    ok('fix 4: winning gives the badge and the button goes away for good', !!G.save.badges[first.id] && !G.save.gymRetry && !get('Honors').badgeView(G.save)[0].retry, { badge: !!G.save.badges[first.id], retry: G.save.gymRetry, problems: errs(sim) });
  }
  // ---- update 1: the ground is the team's, a sixth each; standing on ground of a move's type strengthens the move; moves leave marks
  {
    const { Field } = require(path.join(APP, 'src', 'field.js'));
    const types = { 6: ['fire', 'flying'], 9: ['water'], 3: ['grass', 'poison'], 25: ['electric'], 143: ['normal'], 94: ['ghost', 'poison'] };
    const share = (list, o) => { const p = Field.partyPlan(list, (sp) => types[sp] || ['water'], o || { min: 6 }), N = 240, by = {}; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = (i + 0.5) / N, v = (j + 0.5) / N, fx = Math.min(p.cols - 1, Math.floor(u * p.cols)), fy = Math.min(p.rows - 1, Math.floor(v * p.rows)); const t = Field.typeAt(p, u, v); by[t] = (by[t] || 0) + 1 / (N * N); } return { p, by }; };
    const six = share([6, 9, 3, 25, 143, 94]), two = share([9, 25]);
    const near = (v, want) => Math.abs(v - want) < 0.035;
    ok('update 1: each of the six gets a sixth of the field, in ground of its types', six.p.shares === 6 && near(six.by.water, 1 / 6) && near(six.by.electric, 1 / 6) && near(six.by.normal, 1 / 6) && near((six.by.fire || 0) + (six.by.flying || 0), 1 / 6) && near((six.by.grass || 0) + (six.by.ghost || 0) + (six.by.poison || 0), 2 / 6), Object.fromEntries(Object.entries(six.by).map(([k, v]) => [k, +v.toFixed(3)])));
    ok('update 1: two Pokémon still get a sixth each; the rest stays grass', near(two.by.water, 1 / 6) && near(two.by.electric, 1 / 6) && near(two.by.grass0, 4 / 6));
    const box = share(Array.from({ length: 158 }, (_, i) => i + 1), { min: 1 });
    ok('update 3: 158 Pokémon in the Box get one 158th of the field each (a share for every one)', box.p.cells.filter((c) => c.sp).length === 158 && box.p.cols * box.p.rows >= 158 && box.p.cols * box.p.rows < 158 + box.p.cols, { cols: box.p.cols, rows: box.p.rows });
    const full = Field.partyPlan(Array.from({ length: 1025 }, (_, i) => i + 1), () => ['water'], { min: 1 });
    ok('update 3: so do 1,025', full.cells.filter((c) => c.sp).length === 1025);

    const { sim, G, get } = await fresh({ battleStyle: 'ko' }, [[9, 50], [25, 50]]);
    ok('update 1: on the plain overlay there is no ground (no scenery there), so nothing is boosted by it', G.hasGround() === false && G.groundType(100, 100) === '');
    G.ground = true;                                        // as on the stage
    const plan = G.groundPlan(), spot = (type) => { for (let y = 20; y < G.H; y += 16) for (let x = 20; x < G.W; x += 16) if (G.groundType(x, y) === type) return [x, y]; return null; };
    const water = spot('water'), grass = (() => { for (let y = 20; y < G.H; y += 16) for (let x = 20; x < G.W; x += 16) if (G.groundType(x, y) === '') return [x, y]; return null; })();
    ok('update 1: with a field the game knows the ground under every foot', !!plan && plan.shares === 6 && !!water && !!grass && G.groundList().kind === 'team' && G.groundList().list.join() === '9,25');
    const Battle = get('Battle'), D = sim.DATA, squirtle = G.team().find((a) => a.mon.sp === 9), foe = G.addWild(19, 50, false, { x: 0, y: 0 });
    const gun = +Object.keys(D.moves).find((id) => D.moves[id].k === 'water-gun'), surf = +Object.keys(D.moves).find((id) => D.moves[id].k === 'surf');
    const dmg = (at, mv, n) => { let s = 0; for (let i = 0; i < n; i++) { squirtle.x = at[0]; squirtle.y = at[1]; foe.x = at[0] + 40; foe.y = at[1]; foe.mon.hp = sim.Mon.maxHp(foe.mon); foe.state = 'roam'; G.zones.length = 0; s += Battle.resolveHit(squirtle, foe, D.moves[mv], { noZone: true }) || 0; } return s / n; };
    foe.mon.lvl = 100; foe.mon.hpx = 30; foe.mon.hp = sim.Mon.maxHp(foe.mon);
    const onWater = dmg(water, gun, 300), onGrass = dmg(grass, gun, 300);
    ok('update 1: standing on ground of its type makes a move about 1.3 times as strong', Math.abs(onWater / onGrass - 1.3) < 0.09, { onWater: +onWater.toFixed(1), onGrass: +onGrass.toFixed(1), ratio: +(onWater / onGrass).toFixed(2) });
    G.zones.length = 0;
    const small = G.leaveMark(300, 300, 'water', D.moves[gun]), big = G.leaveMark(900, 600, 'water', D.moves[surf]);
    ok('update 1: a weak move leaves a small mark that is soon gone, a strong sweeping one a wide mark that stays', !!small && !!big && small.kind === 'mark' && small.dur <= 5 && big.dur >= 40 && big.r > small.r * 2, { waterGun: [Math.round(small.r), small.dur], surf: [Math.round(big.r), big.dur] });
    squirtle.x = 900; squirtle.y = 600;
    ok('update 1: the mark counts as ground of that type for whoever stands in it', G.onGroundOf(squirtle, 'water') && !G.onGroundOf(squirtle, 'fire'));
    const again = G.leaveMark(910, 600, 'water', D.moves[surf]);
    for (let i = 0; i < 40; i++) G.leaveMark(40 + i * 37, 200 + (i % 5) * 90, 'fire', { p: 60, tg: 10 });
    ok('update 1: marks of one type that overlap become one, and the field never fills up with them', again === big && G.zones.filter((z) => z.kind === 'mark').length <= 15);
    ok('update 1: status moves and Normal moves leave no mark', G.leaveMark(500, 500, 'water', { p: 0, c: 1 }) === null && G.leaveMark(500, 500, 'normal', { p: 80 }) === null);
    sim.run(8, { render: 0 });
    ok('update 1: marks fade when their time is up', !G.zones.includes(small) && G.zones.includes(big), errs(sim));
  }
  // ---- update 6: the news of an arrival says what the Pokédex knows
  {
    const { sim, G } = await fresh({ fxLevel: 'normal' }, [[25, 20]]);
    sim.keepTexts = true;
    const said = (fn) => { const n = sim.texts.length; fn(); return sim.texts.slice(n).map((t) => t[2]).join(' | '); };
    const a = said(() => G.addWild(16, 5, false)), b = said(() => G.addWild(16, 5, false));
    G.save.dex.caught[16] = 2;
    const c = said(() => G.addWild(16, 5, false)), s = said(() => G.addWild(16, 5, true));
    // (0.9.3: "not caught yet" / "already caught" left the passing words; a Poké Ball by the name of a caught kind says it now, tools/v093check.js)
    ok('update 6: a kind never seen before gets its card; the others are announced in passing', /A wild Pidgey appeared!/.test(a) && /A wild Pidgey appeared!/.test(b) && /A wild Pidgey appeared!/.test(c) && !/not caught yet/.test(b), { a, b, c });
    const shiny = G.wilds().find((w) => w.mon.shiny); let glints = 0; const FX = sim.FX, g0 = FX.glint; FX.glint = function () { glints++; return g0.apply(this, arguments); };
    sim.dom.Image.flush(); sim.run(6, { render: 0 });
    ok('update 6: a shiny is announced with more to-do and keeps glinting while it is here', /✦ A shiny Pidgey appeared! ✦/.test(s) && glints >= 12 && !!shiny, { said: s, glints });
  }
  // ---- updates 7, 8, 9: the three helpers
  {
    const sim = new Sim(await boot({ seed: 11, settings: Object.assign({}, quiet, { paused: false, spawnEvery: 600 }) }), 'v07'), G = sim.G, Ev = sim.get('Events');
    sim.keepTexts = true;
    ok('updates 7-9: a new game has none of the three helpers, and Mewtwo does not stand guard yet', !Ev.hasHelper('rotom') && !Ev.hasHelper('mewtwo') && !Ev.hasHelper('porygonz') && !sim.get('Mewtwo').present());
    const order = [];
    let within = null;
    for (let i = 0; i < 3; i++) {
      let a = null; const t0 = sim.t;
      for (let k = 0; k < 40 * 20 && !a; k++) { sim.run(0.05, { render: 0 }); a = G.wilds().find((w) => w.ev && w.ev.helper); }
      if (!a) break;
      if (i === 0) within = sim.t;
      sim.dom.Image.flush(); sim.run(5, { render: 0 });
      const big = a.grow > 1 && Math.max(a.w, a.h) >= Math.min(G.W, G.H) * 0.18 - 1 && Math.max(a.w, a.h) <= Math.min(G.W, G.H) * 0.62 + 1, friendly = G.peaceful(a), sp = a.mon.sp, key = a.ev.helper;
      const before = G.save.team.length + G.save.box.length;
      G.throwBall(a); sim.run(5, { render: 0 });
      order.push({ key, sp, big, friendly, caught: Ev.hasHelper(key), kept: G.save.team.length + G.save.box.length === before, gone: a.gone, wait: +(sim.t - t0).toFixed(1) });
    }
    ok('update 7: a friendly Super XXL Rotom drops by within half a minute of a new game', order[0] && order[0].sp === 479 && within <= 30 && order[0].big && order[0].friendly, { at: within });
    ok('updates 8, 9: then Mewtwo, then Porygon-Z, each soon after the one before', order.length === 3 && order[1].sp === 150 && order[2].sp === 474 && order.every((o) => o.wait < 20), order.map((o) => [o.key, o.wait]));
    ok('updates 7-9: each lets itself be caught with the first ball and moves into its part of the program, not onto the team', order.length === 3 && order.every((o) => o.caught && o.kept && o.gone), order);
    const view = G.snapshot().helpers;
    ok('updates 7-9: the Pokédex is told, so their three buttons appear; Mewtwo now stands guard', view.rotom && view.mewtwo && view.porygonz && sim.get('Mewtwo').present() && G.save.dex.caught[479] === 1 && G.save.dex.caught[150] === 1 && G.save.dex.caught[474] === 1);
    ok('updates 7-9: each says a few words of its own', ['Bzzt', 'guardian', 'broadcast'].every((w) => sim.texts.some((t) => new RegExp(w, 'i').test(t[2]))), errs(sim));
    // one that is not caught leaves, and comes back
    const s2 = new Sim(await boot({ seed: 12, settings: Object.assign({}, quiet, { paused: false, spawnEvery: 600 }) }), 'v07'), G2 = s2.G;
    s2.run(20, { render: 0 }); s2.dom.Image.flush();
    const there = !!G2.wilds().find((w) => w.ev && w.ev.helper);
    s2.run(200, { render: 0, dt: 1 / 20 });
    const left = !G2.wilds().find((w) => w.ev && w.ev.helper);
    let back = false;
    for (let i = 0; i < 70 && !back; i++) { s2.run(10, { render: 0, dt: 1 / 20 }); s2.dom.Image.flush(); back = !!G2.wilds().find((w) => w.ev && w.ev.helper); }
    ok('updates 7-9: a helper that is not caught leaves after a while and comes back later', there && left && back, { there, left, back, problems: errs(s2) });
  }
  // ---- update 10: a Showdown team
  {
    const { sim, G, get } = await fresh({}, [[25, 20], [1, 5], [4, 5], [7, 5]]);
    const S = require(path.join(APP, 'src', 'showdown.js')), D = sim.DATA;
    const text = '=== [gen9] demo ===\n\nSparky (Pikachu) (F) @ Leftovers\nAbility: Static\nLevel: 42\nShiny: Yes\nEVs: 252 SpA\nTimid Nature\nIVs: 0 Atk\n- Thunderbolt\n- Surf\n- Not A Move\n\nRotom-Wash\nBold Nature\n- Hydro Pump\n\ngarchomp\nMr. Mime\nNotamon\nType: Null';
    const r = S.parse(text, D), e = r.entries;
    ok('update 10: a Showdown team is read: nickname, species, gender, level, shiny, nature, IVs, moves', e.length === 6 && e[0].sp === 25 && e[0].nick === 'Sparky' && e[0].fem === true && e[0].lvl === 42 && e[0].shiny && D.natures[e[0].nat].n === 'Timid' && e[0].iv[1] === 0 && e[0].iv[0] === 31 && e[0].moves.length === 2 && e[0].notes.length === 1, e[0]);
    ok('update 10: names typed by hand are enough; forms fall back to the kind; unknown names are reported, not guessed', e[1].sp === 479 && e[1].notes.length === 1 && e[2].sp === 445 && e[3].sp === 122 && e[4].ok === false && e[5].sp === 772, e.map((x) => x.species));
    const before = { team: G.save.team.length, box: G.save.box.length };
    G.command({ type: 'importTeam', mons: e.concat([{ sp: 999999 }, null, { sp: 25, lvl: 'x', moves: ['nope', 85], nick: '<b>averyveryverylongname' }]) });
    const team = G.save.team, box = G.save.box, sparky = team.find((m) => m.nick === 'Sparky'), rotom = [...team, ...box].find((m) => m.sp === 479), odd = [...team, ...box].find((m) => m.sp === 25 && m !== sparky && m.imp);
    ok('update 10: the Pokémon go to the team while it has room, the rest to the Box', team.length === 6 && box.length === before.box + 4 && team.length - before.team === 2, { team: team.length, box: box.length });
    ok('update 10: what was given is kept, what was missing is filled in as the game would', !!sparky && sparky.lvl === 42 && sparky.shiny === 1 && sparky.fem === 1 && sparky.moves.length === 4 && sparky.moves.includes(e[0].moves[0]) && sparky.hp === sim.Mon.maxHp(sparky) && !!rotom && rotom.lvl === 50 && rotom.moves.length >= 1 && D.natures[rotom.nat].n === 'Bold', sparky && { lvl: sparky.lvl, moves: sparky.moves.map((id) => D.moves[id].n), item: sparky.item });
    ok('update 10: the game checks every entry itself: nonsense is dropped or repaired, never trusted', !!odd && odd.lvl === 50 && odd.nick.length <= 12 && !/[<>]/.test(odd.nick) && odd.moves.every((id) => D.moves[id]) && ![...team, ...box].some((m) => !D.dex[m.sp]));
    sim.run(3, { render: 0 });
    ok('update 10: the game carries on with the imported team', G.team().length === 6 && !errs(sim), errs(sim));
  }
  // ---- update 3: who the Box Field shows
  {
    const { sim, get } = await fresh({}, [[25, 20]]);
    const BoxField = get('BoxField'), box = [];
    for (let i = 0; i < 40; i++) box.push({ sp: 1 + (i % 4), uid: 'a' + i });
    for (let i = 0; i < 10; i++) box.push({ sp: 100 + i, uid: 'b' + i });
    const pick = BoxField.choose(box, 14), kinds = new Set(pick.map((m) => m.sp)), few = BoxField.choose(box, 12);
    ok('update 3: when the Box holds more than the field may show, every kind in it is still represented', pick.length === 14 && kinds.size === 14 && [1, 2, 3, 4, 100, 109].every((sp) => kinds.has(sp)) && new Set(few.map((m) => m.sp)).size === 12 && BoxField.choose(box, 2000).length === 50);
    ok('update 3: the limit is an option, 10 to 1,025', require(path.join(APP, 'defaults.js')).sanitize({ boxFieldMax: 5000 }).boxFieldMax === 1025 && require(path.join(APP, 'defaults.js')).sanitize({ boxFieldMax: 1 }).boxFieldMax === 10);
    ok('update 3: on the plain overlay there is no field to replace, so the Box Field never comes up', (() => { BoxField.set(true); sim.G.save.box.push(sim.Mon.create(16, 5)); sim.run(1, { render: 0 }); const on = BoxField.active(); BoxField.set(false); return !on; })());
  }
  // ---- update 5: the empty copy
  {
    const share = require(path.join(APP, 'shareexport.js')), { readZip } = require(path.join(APP, 'apkexport.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v07share-')), exe = path.join(tmp, 'Screen Trainer'), app = path.join(exe, 'resources', 'app');
    const put = (rel, text) => { const f = path.join(exe, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text || 'x'.repeat(200)); };
    // a program folder with everything that belongs in it, and everything that must stay out lying about
    for (const f of ['ScreenTrainer.exe', 'ffmpeg.dll', 'resources.pak', 'icudtl.dat', 'LICENSE', 'version', 'locales/en-US.pak', 'resources/app/main.js', 'resources/app/src/game.js', 'resources/app/fonts/Jersey20.ttf', 'resources/app/tools/playtest.js', 'resources/app/package.json']) put(f);
    const out = ['Fixes and updates.txt', 'my notes.docx', 'resources/app/save.json', 'resources/app/settings.json', 'resources/app/mystream.json', 'resources/app/sounds/firered.stbank', 'resources/app/sprites/pokemon/1.png', 'resources/app/sprites-master/sprites/pokemon/1.png', 'resources/app/rom/firered.gba', 'resources/app/android/ScreenTrainer.apk', 'resources/app/android/release.keystore', 'resources/app/.hidden/x.js', 'resources/default_app.asar', 'sounds/firered.stbank', 'resources/app/backups/before-0.6.0/save.json'];
    for (const f of out) put(f);
    const zip = path.join(tmp, 'out', 'empty.zip');
    const r = await share.run({ exeDir: exe, appDir: app, version: '0.7.0' }, zip, null);
    const names = r.ok ? readZip(fs.readFileSync(zip)).map((e) => e.name) : [];
    ok('update 5: the empty copy is one zip with the program in it and a READ ME FIRST', r.ok && names.includes('Screen Trainer/ScreenTrainer.exe') && names.includes('Screen Trainer/resources/app/src/game.js') && names.includes('Screen Trainer/locales/en-US.pak') && names.includes('Screen Trainer/READ ME FIRST.txt') && r.hasExe, r.ok ? `${names.length} files` : r.error);
    const leaked = names.filter((n) => out.some((f) => n.endsWith(f)) || /stbank|\.gba|sprites|save\.json|settings\.json|\.apk|keystore|notes|Fixes/i.test(n));
    ok('update 5: no sprites, sounds, ROM, save, settings, app or key gets into it, whatever lies in the folder', r.ok && leaked.length === 0, leaked.join(', '));
    const note = share.readme('0.7.0');
    ok('update 5: the note tells a new player what to bring, and that idle games can go on the stage', /sprites folder of your own/.test(note) && /FireRed/.test(note) && /Task Bar Hero and Mini Cozy Room/.test(note) && /not made, endorsed or supported/.test(note));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // ---- update 7: Optimize, Rotom's organizer (optimize.js): its six rules, on a pretend folder
  {
    const opt = require(path.join(APP, 'optimize.js')), crypto = require('crypto');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v07opt-')), user = path.join(tmp, 'appdata'), work = path.join(tmp, 'Downloads'), sys = path.join(tmp, 'Windows'), home = path.join(tmp, 'home');
    for (const d of [user, work, sys, home, path.join(home, 'Desktop'), path.join(work, 'Old stuff'), path.join(work, 'Pictures')]) fs.mkdirSync(d, { recursive: true });
    const put = (dir, name, text, when) => { const f = path.join(dir, name); fs.writeFileSync(f, text); if (when) fs.utimesSync(f, when, when); return f; };
    const y = (n) => new Date(n, 5, 15);
    put(work, 'holiday.jpg', 'J1', y(2022)); put(work, 'cat.PNG', 'P1', y(2024)); put(work, 'report.pdf', 'D1', y(2024)); put(work, 'song.mp3', 'M1', y(2023)); put(work, 'setup.exe', 'E1', y(2025));
    put(work, 'notes', 'N1', y(2025)); put(work, 'Game.lnk', 'L1'); put(work, 'desktop.ini', 'I1'); put(work, '.hidden', 'H1'); put(work, 'movie.mkv.crdownload', 'C1'); put(path.join(work, 'Old stuff'), 'inner.jpg', 'X1');
    put(path.join(work, 'Pictures'), 'cat.PNG', 'ALREADY THERE');
    const asked = [];
    opt.init({ userDir: () => user, protectedDirs: () => [{ dir: sys, deep: true, why: 'system' }, { dir: home, above: true, why: 'home' }, { dir: user, deep: true, why: 'own' }], complete: async (system, prompt) => { asked.push(prompt); return { ok: true, by: 'Stand-in AI', text: asked.length === 1 ? '1\tTrip\n2\tTrip\n3\t..\\..\\Windows\\System32\n4\tC:/evil\n5\t-\n6\tCON' : 'I would rather chat.' }; } });
    const hashAll = () => { const o = {}; const walk = (d, rel) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(f).isDirectory()) walk(f, r); else o[r] = fs.readFileSync(f, 'utf8'); } }; walk(work, ''); return o; };
    ok('update 7, rule 1: Rotom cannot be pointed at a drive, at Windows, at the whole user folder, at its own data, or at nothing', !!opt.refuse(path.parse(work).root) && !!opt.refuse(sys) && !!opt.refuse(path.join(sys, 'System32')) && !!opt.refuse(home) && !!opt.refuse(tmp) && !!opt.refuse(user) && !!opt.refuse('relative/path') && !!opt.refuse(path.join(tmp, 'nowhere')) && opt.refuse(path.join(home, 'Desktop')) === '' && opt.refuse(work) === '', { windows: opt.refuse(sys), home: opt.refuse(home) });
    ok('update 7: no folder, no plan', opt.propose('kind').ok === false && opt.setFolder(sys).ok === false && opt.setFolder(work).ok === true);
    const before = hashAll();
    const p1 = opt.propose('kind'), f = Object.fromEntries(p1.plan.folders.map((x) => [x.name, x.files]));
    ok('update 7, rule 2 and 4: a plan is drawn up from the names alone, and drawing it up moves nothing', p1.ok && f.Pictures === 2 && f.Documents === 1 && f.Music === 1 && f.Installers === 1 && f.Other === 1 && p1.plan.count === 6 && JSON.stringify(hashAll()) === JSON.stringify(before), f);
    ok('update 7, rule 3: folders, shortcuts, hidden and unfinished files are not part of any plan', !p1.plan.sample.some((m) => /lnk|desktop\.ini|hidden|crdownload|Old stuff|inner/.test(m.name)) && p1.kept >= 5);
    ok('update 7, rule 4: only the plan that was shown can be applied', opt.apply('0000000000000000').ok === false && opt.apply('').ok === false && JSON.stringify(hashAll()) === JSON.stringify(before));
    const a1 = opt.apply(p1.plan.id), after = hashAll();
    ok('update 7, rule 3: files are moved into subfolders, nothing is lost, and a file of the same name is never overwritten', a1.ok && a1.moved === 6 && after['Pictures/holiday.jpg'] === 'J1' && after['Pictures/cat.PNG'] === 'ALREADY THERE' && after['Pictures/cat (2).PNG'] === 'P1' && after['Documents/report.pdf'] === 'D1' && after['Other/notes'] === 'N1' && after['Old stuff/inner.jpg'] === 'X1' && after['Game.lnk'] === 'L1' && Object.keys(after).length === Object.keys(before).length && Object.values(after).sort().join() === Object.values(before).sort().join(), Object.keys(after).sort());
    ok('update 7, rule 4: a plan can be applied once', opt.apply(p1.plan.id).ok === false);
    fs.writeFileSync(path.join(work, 'Music', 'song.mp3'), 'I EDITED THIS');
    const u1 = opt.undo(), back = hashAll();
    ok('update 7, rule 5: undo puts every file back where it was, removes the folders it made, and leaves a file alone that was changed since', u1.ok && u1.back === 5 && u1.left.length === 1 && back['holiday.jpg'] === 'J1' && back['cat.PNG'] === 'P1' && back['Pictures/cat.PNG'] === 'ALREADY THERE' && back['Music/song.mp3'] === 'I EDITED THIS' && !fs.existsSync(path.join(work, 'Documents')) && !fs.existsSync(path.join(work, 'Other')) && fs.existsSync(path.join(work, 'Pictures')) && opt.undo().ok === false, { back: u1.back, left: u1.left });
    const p2 = opt.propose('kindyear'), f2 = p2.plan.folders.map((x) => x.name.replace(/\\/g, '/')).sort();
    ok('update 7: sorting by kind and year gives a folder for each', p2.ok && f2.includes('Pictures/2022') && f2.includes('Pictures/2024') && f2.includes('Installers/2025'), f2);
    // rule 6: an AI suggests; whatever it says stays inside the folder
    const p3 = await opt.proposeAi(), f3 = p3.ok ? p3.plan.folders.map((x) => x.name) : [];
    ok('update 7, rule 6: an AI is sent the file names and nothing else', asked.length === 1 && !asked[0].includes(tmp) && !/J1|P1|D1/.test(asked[0]) && /holiday\.jpg/.test(asked[0]) && !/Game\.lnk|hidden/.test(asked[0]), asked[0].slice(0, 80));
    ok('update 7, rule 6 and 1: whatever folder the AI names, the files stay inside the chosen folder', p3.ok && f3.includes('Trip') && f3.every((n) => !/[\\/:]|\.\./.test(n) && !/^con$/i.test(n)) && (() => { const r = opt.apply(p3.plan.id), h = hashAll(); return r.ok && !fs.existsSync(path.join(tmp, 'Windows', 'System32')) && fs.readdirSync(sys).length === 0 && Object.values(h).sort().join() === Object.values(back).sort().join(); })(), f3);
    const p4 = await opt.proposeAi();
    ok('update 7, rule 6: an answer that is not a plan is refused, not guessed at', p4.ok === false && /could not be read/.test(p4.text));
    const st = opt.status();
    ok('update 7: the log says what was done, and the last sorting can be undone', st.canUndo && st.log.length === 2 && st.log[1].undone === true && st.folder === path.resolve(work) && opt.undo().ok === true);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // ---- reading checks
  {
    const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
    const D = require(path.join(APP, 'defaults.js'));
    ok('update 2: zoom levels are an option: only allowed ones are kept, at least one stays, the zoom in use is one of them', JSON.stringify(D.sanitize({ zoomLevels: [9, 0.5, 2, 2, 'x'] }).zoomLevels) === '[0.5,2]' && JSON.stringify(D.sanitize({ zoomLevels: [] }).zoomLevels) === '[1]' && D.sanitize({ zoomLevels: [0.5, 2], fieldZoomAt: 1.4 }).fieldZoomAt === 2 && D.sanitize({}).fieldZoomAt === 0 && D.sanitize({ fieldZoomAt: 'x' }).fieldZoomAt === 0);
    const list = (h) => (read(h).match(/<script src="src\/[\w-]+\.js">/g) || []).map((s) => s.slice(17, -2));
    ok('the overlay and the stage load the same game, and every script they name exists', JSON.stringify(list('overlay.html')) === JSON.stringify(list('stage.html').filter((f) => f !== 'stage.js')) && [...list('overlay.html'), ...list('stage.html'), ...list('android.html'), ...list('panel.html')].every((f) => fs.existsSync(path.join(APP, 'src', f))));
    ok('update 11: explanations are kept for the mouse pointer by default, and can be written out again', D.DEFAULTS.hints === 'hover' && D.sanitize({ hints: 'x' }).hints === 'hover' && /data-hints="hover"\] \.set > label > small:not\(\[id\]\) \{ display: none/.test(read('panel.css')) && /s\.title = h\.textContent/.test(read('src/panel.js')));
    ok('update 4: a right-click on a team member opens the Pokédex on that Pokémon', /openPanel\('party:' \+ a\.mon\.uid\)/.test(read('src/game.js')) && /function showTab/.test(read('src/panel.js')) && /tab\.includes\(':'\)/.test(read('main.js')));
    ok('update 4: hints are part of the Pokédex page, so they are in the picture on the MyStream stage', /id = 'tip'/.test(read('src/panel.js')) && /#tip \{ position: fixed/.test(read('panel.css')));
    ok('rule 6 holds: every new option is in defaults.js', ['walkSpeed', 'moveSpeed', 'fieldSquare', 'fieldZoomAt', 'zoomLevels', 'boxFieldMax', 'hints'].every((k) => k in D.DEFAULTS));
  }
}

// ------------------------------------------------------------------ the real program (only under Electron)
async function liveChecks() {
  const { app } = require('electron');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v07check-'));
  const userDir = path.join(tmp, 'user');
  fs.mkdirSync(userDir, { recursive: true });
  const mon = (sp, lvl, extra) => Object.assign({ sp, iv: [12, 12, 12, 12, 12, 12], lvl, nat: 3, hp: 30 }, extra || {});
  const box = []; for (let i = 0; i < 37; i++) box.push(mon(1 + ((i * 7) % 150), 5 + (i % 20)));
  box.push(mon(1, 5));                                      // a second Bulbasaur
  box.push(mon(149, 55));                                   // (the stand-in sprites folder of the checks has no picture of this one)
  fs.writeFileSync(path.join(userDir, 'save.json'), JSON.stringify({ v: 1, team: [mon(7, 14), mon(25, 12), mon(54, 11, { fem: 1 })], box, dex: { caught: { 7: 1, 25: 1, 54: 1 }, seen: { 7: 1, 25: 1, 54: 1, 16: 1 } }, stats: {}, bag: {}, helpers: { mewtwo: 1 } }));
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({ spritesPath: process.env.ST_TEST_SPRITES || '', firstRun: false, mute: true, spriteStyle: 'static', scale: 2, paused: true, field: true, fieldW: 760, fieldH: 500, fieldZoomAt: 1, legendEvents: 'off', trainerBattles: 'off' }));
  app.setName('Screen Trainer');
  app.setPath('userData', userDir);
  process.env.ST_TEST = '1';
  process.env.ST_SELFCHECK_DIR = path.join(tmp, 'selfcheck');
  require(path.join(APP, 'main.js'));
  await app.whenReady();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > (ms || 10000)) return null; await sleep(120); } };
  const T = await until(() => global.__stTest && global.__stTest.overlay() && global.__stTest);
  if (!ok('the program starts with its overlay', !!T)) return;
  const js = (w, code) => w.webContents.executeJavaScript(code, true);
  const ov = T.overlay(), trouble = [];
  ov.webContents.on('console-message', (e) => { const m = String(e.message || ''); if (/error/i.test(m) && !/Autofill|DevTools/.test(m)) trouble.push(m.slice(0, 200)); });
  await until(() => js(ov, 'typeof G !== "undefined" && !!G.save'));
  const sprites = await js(ov, 'Sprites.ready()');
  if (!sprites) console.log('      (no ST_TEST_SPRITES: the game has no pictures, so the checks below that need Pokémon on the screen are skipped)');

  // ---- the field window: Fountain Square, the camera
  const fw = await until(() => T.field());
  if (!ok('update 1: the field window opens', !!fw)) return;
  const look = () => js(ov, '({ view: G.view, W: G.W, H: G.H, cam: G.cam, sq: Square.state(), st: Stations.state(), ground: G.groundList(), hasGround: G.hasGround(), pulling: G.pulling })');
  const s0 = await until(async () => { const v = await look(); return v.view && v.sq.shown && v.st.built && !v.pulling ? v : null; }, 12000);
  ok('update 1: the field has a world of its own, at least as large as the MyStream stage, seen through a camera', !!s0 && s0.W >= 1280 && s0.H >= 720 && s0.view.w === 760 && !!s0.cam && s0.cam.z === 1, s0 && { view: s0.view, W: s0.W, H: s0.H, cam: s0.cam });
  ok('update 1: Fountain Square stands in its middle: the fountain, the Poké Center, the pipe, the Day Care', !!s0 && s0.sq.shown && ['fountain', 'column', 'center', 'pipe', 'yard'].every((n) => s0.sq.blocks.includes(n)) && s0.st.on, s0 && s0.sq);
  ok('update 1: the camera starts on the fountain', !!s0 && Math.abs(s0.cam.x + 380 - s0.W / 2) < 2 && Math.abs(s0.sq.top.x - s0.W / 2) < 2);
  const plan = await until(() => js(fw, 'window.fieldPlan && window.fieldPlan.view && window.fieldPlan.species ? window.fieldPlan : null'), 6000) || await js(fw, 'window.fieldPlan || null');      // (the page draws plain grass first and the team's ground once the overlay has sent it)
  ok('update 1: the ground is grown from the team, a sixth each, and the field page draws the same world the overlay shows', !!plan && plan.kind === 'team' && plan.species === 3 && plan.shares === 6 && plan.world.W === s0.W && plan.view.x === s0.cam.x && plan.view.z === 1, plan);
  const same = await js(ov, 'JSON.stringify([G.groundType(100, 100), G.groundType(640, 100), G.groundType(1150, 100), G.groundType(640, 600)])'), there = await js(fw, `(() => { const g = ${JSON.stringify(s0.ground)}, p = Field.partyPlan(g.list, (sp) => DATA.dex[sp].t.map((t) => DATA.types[t]), { min: 6, aspect: ${s0.W} / ${s0.H} }); const at = (x, y) => { const t = Field.typeAt(p, x / ${s0.W}, y / ${s0.H}); return t === 'grass0' ? '' : t; }; return JSON.stringify([at(100, 100), at(640, 100), at(1150, 100), at(640, 600)]); })()`);
  ok('update 1: the game and the picture agree about what ground lies where', same === there && /water/.test(same), same);
  // zoom and pan, as the field page reports them
  await js(fw, 'st.fieldCam({ zoom: 1, at: [380, 250] })');
  const z1 = await until(async () => { const v = await look(); return v.cam && v.cam.z === 1.5 ? v : null; }, 3000);
  ok('update 2: the wheel steps to the next allowed zoom level, and the point under the pointer stays put', !!z1 && Math.abs(z1.cam.x + 380 / 1.5 - (s0.cam.x + 380)) < 1, z1 && z1.cam);
  const fv = await until(async () => { const v = await js(fw, 'window.fieldPlan.view'); return v && v.z === 1.5 ? v : null; }, 3000);
  ok('update 2: the field page follows the camera', !!fv && Math.abs(fv.x - z1.cam.x) < 0.01);
  await js(fw, 'st.fieldCam({ pan: [-90, -40] })'); await sleep(250);
  const p1 = await look();
  ok('update 2: dragging the grass moves the camera', Math.abs(p1.cam.x - (z1.cam.x + 60)) < 1 && Math.abs(p1.cam.y - (z1.cam.y + 40 / 1.5)) < 1, p1.cam);
  await js(fw, 'st.fieldCam({ pan: [-99999, -99999] })'); await sleep(250);
  const p2 = await look();
  ok('update 2: the camera stops at the edge of the world', Math.abs(p2.cam.x - (p2.W - 760 / 1.5)) < 1 && Math.abs(p2.cam.y - (p2.H - 500 / 1.5)) < 1, p2.cam);
  for (let i = 0; i < 6; i++) { await js(fw, 'st.fieldCam({ zoom: 1, at: [10, 10] })'); await sleep(170); }
  const top = (await look()).cam.z;
  for (let i = 0; i < 8; i++) { await js(fw, 'st.fieldCam({ zoom: -1, at: [10, 10] })'); await sleep(170); }
  const low = await look();
  ok('update 2: zooming stops at the largest and the smallest level allowed in Options', top === 2 && low.cam.z === 0.5, { top, low: low.cam });
  ok('update 2: zoomed out so far that the world is smaller than the window, the world sits in its middle', Math.abs(low.cam.x - (low.W - 760 / 0.5) / 2) < 1);
  T.setSettings({ zoomLevels: [1, 2], fieldZoomAt: 1 }); await sleep(500);
  await js(fw, 'st.fieldCam({ zoom: 1, at: [380, 250] })'); await sleep(300);
  const only = await look();
  ok('update 2: only the levels ticked in Options can be reached', only.cam.z === 2, only.cam);
  await sleep(900);
  ok('update 2: the zoom is remembered', T.settings().fieldZoomAt === 2);
  // a field that was never zoomed starts as far out as the levels allow, but not past the field filling the window (760 x 500 of 1280 x 720: 0.75)
  T.setSettings({ zoomLevels: [0.5, 0.75, 1, 1.5, 2], fieldZoomAt: 0 }); await sleep(500);
  const far1 = await look();
  T.setSettings({ zoomLevels: [0.5, 1, 2], fieldZoomAt: 0 }); await sleep(500);
  const far2 = await look();
  ok('update 2: a field never zoomed before starts as far out as the allowed levels go without showing more than the field', far1.cam.z === 0.75 && far2.cam.z === 1, { first: far1.cam, second: far2.cam });
  T.setSettings({ zoomLevels: [0.5, 0.75, 1, 1.5, 2], fieldZoomAt: 1 }); await sleep(500);
  if (sprites) {
    // the pointer finds a team member wherever the camera looks from
    const hit = await js(ov, `(() => { const a = G.team().find((x) => !x.await && !x.hops); if (!a) return null; const s = G.toScreen(a.x, a.y - a.h * 0.5), w = G.toWorld(s[0], s[1]), p = G.pick(w[0], w[1]); return { ok: !!p && p.actor === a, s, back: [Math.round(w[0] - a.x), Math.round(w[1] - (a.y - a.h * 0.5))] }; })()`);
    ok('update 2: a click lands on the Pokémon that is drawn there, at any zoom', !!hit && hit.ok && hit.back[0] === 0 && hit.back[1] === 0, hit);
    // the Day Care in the field window: a guest, an egg, taking it out by hand, and straight down the pipe
    const care = await js(ov, `(async () => {
      const a = G.team().find((x) => x.mon.sp === 54), P = Stations.spots();
      a.x = P.yard.x; a.y = P.yard.y1 - 10; Stations._test.dropped(a);
      const b = G.team().find((x) => x.mon.sp === 25); b.x = P.yard.x + 20; b.y = P.yard.y1 - 10; Stations._test.dropped(b);
      await new Promise((r) => setTimeout(r, 500));
      const inYard = Stations.state().yard, team = G.save.team.length;
      const guest = G.save.daycare.mons[0], overGuest = Square.hit(P.yard.x - 50, P.yard.y1 - 30);
      // out of the fence and onto the pipe, with the pointer
      G.onDown(P.yard.x - 50, P.yard.y1 - 30, 0); G.onMove(P.pipe.x, P.pipe.y - 20); G.cursor.x = P.pipe.x; G.cursor.y = P.pipe.y - 20; G.onUp();
      const piped = G.save.box.includes(guest) && G.save.daycare.mons.length === 1 && G.save.team.length === team;
      // the other one is taken out by hand and set down on the grass
      const other = G.save.daycare.mons[0];
      await new Promise((r) => setTimeout(r, 300));
      const g2 = Stations.state();
      const x = P.yard.x + 260, y = P.yard.y1 + 120;
      return { inYard, overGuest, piped, team, other: other.uid, x, y, P: { x: P.yard.x, y1: P.yard.y1 } };
    })()`);
    ok('fix 2: a Day Care guest dropped on the pipe goes straight to the Box (no free team place needed)', !!care && care.inYard === 2 && care.overGuest === 'care' && care.piped, care);
  }
  if (sprites) {
    // ---- fixes 2 and 3 in the field window: a guest taken out by hand is set down where it is let go; the egg can be seen in the hand
    const hand = await js(ov, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)), P = Stations.spots(), other = G.save.daycare.mons[0];
      const x = P.yard.x + 260, y = P.yard.y1 + 120;
      const el = document.querySelector('#stPlaces img.guest'), r0 = el.getBoundingClientRect(), w0 = G.toWorld(r0.left + r0.width / 2, r0.bottom - 12);
      G.onDown(w0[0], w0[1], 0); G.onMove(x, y); G.cursor.x = x; G.cursor.y = y; G.onUp();
      await wait(120);
      const a = G.actors.find((q) => q.mon === other), first = a ? { x: Math.round(a.x), y: Math.round(a.y), await: !!a.await, fall: !!a.fall, hops: !!a.hops } : null;
      await wait(900);
      const landed = a ? { x: Math.round(a.x), y: Math.round(a.y), fall: !!a.fall, jy: Math.round(a.jy) } : null;
      // an egg waits at the Day Care: pick it up and carry it
      const care = G.save.daycare; care.egg = { mon: Mon.create(54, 1) };
      await wait(200);
      const egg = [...document.querySelectorAll('#stPlaces .station.eggs')][0];
      const before = !egg.hidden;
      G.onDown(P.yard.x, P.yard.y1 - 20, 0); G.onMove(P.yard.x + 150, P.yard.y1 + 90);
      await wait(300);                                       // (several frames pass: until 0.7 the egg vanished on the first of them)
      const inHand = !egg.hidden && getComputedStyle(egg).display !== 'none', r = egg.getBoundingClientRect(), s = G.toScreen(P.yard.x + 150, P.yard.y1 + 90);
      const follows = Math.abs((r.left + r.width / 2) - s[0]) < 30 && Math.abs((r.top + r.height / 2) - s[1]) < 40;
      G.cursor.x = P.yard.x + 150; G.cursor.y = P.yard.y1 + 90; G.onUp();
      await wait(200);
      return { first, landed, want: { x, y: y + 20 }, before, inHand, follows, carried: (G.save.eggs || []).length, team: G.save.team.length };
    })()`);
    ok('fix 2: a Pokémon taken out of the Day Care is set down where it is let go, with a little drop', !!hand && !!hand.first && Math.abs(hand.first.x - hand.want.x) < 3 && Math.abs(hand.first.y - hand.want.y) < 3 && !hand.first.hops && !!hand.landed && !hand.landed.fall && hand.landed.jy === 0, hand && { first: hand.first, landed: hand.landed, want: hand.want });
    ok('fix 3: an egg dragged out of the Day Care can be seen in the hand all the way', !!hand && hand.before && hand.inHand && hand.follows && hand.carried === 1, hand && { before: hand.before, inHand: hand.inHand, follows: hand.follows, carried: hand.carried });
  }

  // ---- the Pokédex window: a right-click opens it on that Pokémon; the helper keys; hints; turning a picture; importing a team
  const uid = await js(ov, 'G.save.team[G.save.team.length - 1].uid');
  T.openPanel('party:' + uid);
  const pw = await until(() => { const p = T.panel(); return p && !p.isDestroyed() && p.isVisible() ? p : null; });
  if (ok('update 4: the Pokédex opens', !!pw)) {
    const ptrouble = [];
    pw.webContents.on('console-message', (e) => { const m = String(e.message || ''); if (/error/i.test(m) && !/Autofill|DevTools/.test(m)) ptrouble.push(m.slice(0, 200)); });
    await until(() => js(pw, 'document.querySelector("#party.screen.on") && document.querySelector("#partyEntry h3") ? 1 : 0'), 8000);
    const page = await js(pw, `({ on: document.querySelector('.screen.on').id, sel: document.querySelector('#partySlots .slot.sel') ? document.querySelector('#partySlots .slot.sel').dataset.uid : '', turn: (document.querySelector('#partyEntry .finder') || {}).dataset ? document.querySelector('#partyEntry .finder').dataset.turn : '' })`);
    ok('update 4: a right-click on a team member opens the team page on that very Pokémon', page.on === 'party' && page.sel === uid, page);
    const keys = await js(pw, `({ guard: !document.getElementById('guardKey').hidden, stream: !document.getElementById('streamKey').hidden, rotom: !document.getElementById('optKey').hidden })`);
    ok('updates 7-9: only the buttons of helpers that were caught are in the Field Dex (here: Mewtwo)', keys.guard && !keys.stream && !keys.rotom, keys);
    if (sprites) {
      const turn = await js(pw, `(async () => {
        const f = document.querySelector('#partyEntry .finder[data-turn]'), img = f.querySelector('img.pix'), src0 = img.getAttribute('src'), r = img.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (type, dx) => (type === 'mousedown' ? img : document).dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x + dx, clientY: y }));
        ev('mousedown', 0); ev('mousemove', 30); const one = img.getAttribute('src'), cap1 = (f.querySelector('.view') || {}).textContent || '';
        ev('mousemove', 60); const two = img.getAttribute('src'); ev('mouseup', 60);
        await new Promise((r2) => setTimeout(r2, 1300));           // the game's next state arrives and the page is drawn again
        const kept = document.querySelector('#partyEntry .finder img.pix').getAttribute('src');
        return { src0: src0.split('/').slice(-3).join('/'), one: one.split('/').slice(-3).join('/'), two: two.split('/').slice(-3).join('/'), cap1, kept: kept === two };
      })()`);
      ok('update 4: dragging a Pokémon\'s picture steps through its other pictures, and the choice stays', turn.one !== turn.src0 && turn.two !== turn.one && /behind/.test(turn.cap1) && turn.kept, turn);
    }
    const hint = await js(pw, `(async () => {
      document.querySelector('#keys .key[data-tab="options"]').click();
      await new Promise((r) => setTimeout(r, 300));
      const row = [...document.querySelectorAll('#optBody .set')].find((s) => s.querySelector('#walkSpeed')), small = row.querySelector('label > small');
      const hidden = getComputedStyle(small).display === 'none', title = row.title;
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 30, clientY: r.top + 8 }));
      await new Promise((r2) => setTimeout(r2, 600));
      const tip = document.getElementById('tip'), shown = !tip.hidden, text = tip.textContent, native = row.hasAttribute('title');
      row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      return { hidden, title: title.slice(0, 40), shown, same: text === title, native, back: row.title === title, gone: tip.hidden, mode: document.documentElement.dataset.hints, dup: [...document.querySelectorAll('[id]')].map((e) => e.id).filter((id, i, a) => a.indexOf(id) !== i) };
    })()`);
    ok('update 11: an option\'s explanation is no longer written out; it is a hint when the mouse rests on the option', hint.mode === 'hover' && hint.hidden && hint.title.length > 10, hint);
    ok('update 4: the hint is drawn by the page itself (so it is in the picture on the stage), not by Windows', hint.shown && hint.same && !hint.native && hint.back && hint.gone, hint);
    ok('no element id is used twice in the Pokédex page', hint.dup.length === 0, hint.dup.join(', '));
    T.setSettings({ hints: 'always' }); await sleep(400);
    ok('update 11: Options > Hints brings the written-out explanations back', await js(pw, `getComputedStyle([...document.querySelectorAll('#optBody .set')].find((s) => s.querySelector('#walkSpeed')).querySelector('label > small')).display !== 'none'`));
    T.setSettings({ hints: 'hover' }); await sleep(300);
    // importing a team
    const imp = await js(pw, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('openImport').click(); await wait(200);
      const on = document.querySelector('.screen.on').id;
      document.getElementById('impText').value = 'Zap (Raichu) (M) @ Leftovers\\nLevel: 33\\nJolly Nature\\n- Thunderbolt\\n\\nNotamon\\n\\ngengar';
      document.getElementById('impRead').click(); await wait(200);
      const rows = [...document.querySelectorAll('#impList .imp')].map((r) => [r.classList.contains('bad'), (r.querySelector('b') || {}).textContent]);
      const lvl = document.querySelector('#impList .imp[data-i="2"] input[data-f="lvl"]'); lvl.value = '77'; lvl.dispatchEvent(new Event('change', { bubbles: true }));
      const sum = document.getElementById('impSum').textContent;
      document.getElementById('impAdd').click(); await wait(1500);
      return { on, rows, sum, after: document.querySelector('.screen.on').id };
    })()`.replace(/\\\\n/g, '\\n'));
    const got = await js(ov, `(() => { const all = [...G.save.team, ...G.save.box], r = all.find((m) => m.nick === 'Zap'), g = all.find((m) => m.sp === 94 && m.imp); return { raichu: r ? [r.sp, r.lvl, Mon.natureName(r), r.fem, r.moves.length] : null, gengar: g ? [g.lvl, g.moves.length] : null, team: G.save.team.length }; })()`);
    ok('update 10: the import screen reads a team, shows it for a look and an edit, and says what it could not read', imp.on === 'import' && imp.rows.length === 3 && imp.rows[1][0] === true && imp.rows[0][1] === 'Raichu' && /2 to add/.test(imp.sum), imp);
    ok('update 10: "Add them" puts the Pokémon into the game as shown, edits included', !!got.raichu && got.raichu[0] === 26 && got.raichu[1] === 33 && got.raichu[2] === 'Jolly' && got.raichu[3] === 0 && got.raichu[4] === 4 && !!got.gengar && got.gengar[0] === 77 && imp.after === 'party', got);

    // ---- the Box Field: opening the Box replaces the field with everyone in the Box
    const boxN = await js(ov, 'G.save.box.length');
    await js(pw, `document.getElementById('boxToggle').click()`);
    const bf = await until(async () => { const v = await js(ov, 'BoxField.state()'); return v.on ? v : null; }, 6000);
    ok('update 3: opening the Box puts the Box Field up: everyone in the Box strolls on the field', !!bf && bf.shown === boxN && bf.box === boxN, bf);
    const seen = await js(ov, `({ hiddenWorld: getComputedStyle(document.getElementById('world')).visibility === 'hidden', square: getComputedStyle(document.getElementById('stPlaces')).visibility === 'hidden', pics: document.querySelectorAll('#boxField .bxMon').length, standins: [...document.querySelectorAll('#boxField .bxMon.standin')].map((e) => e.textContent), ground: G.groundList().kind, list: G.groundList().list.length, inside: [...document.querySelectorAll('#boxField .bxMon')].every((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; }) })`);
    ok('update 3: the team\'s field waits unseen meanwhile, and every Pokémon in the Box has a picture on the field', seen.hiddenWorld && seen.square && seen.pics === boxN && seen.inside, seen);
    ok('update 3: a Pokémon whose picture is missing is shown as a stand-in shape with its number', seen.standins.length === 1 && seen.standins[0] === '149', seen.standins);
    const bplan = await until(async () => { const v = await js(fw, 'window.fieldPlan'); return v && v.kind === 'box' ? v : null; }, 5000);
    ok('update 3: the ground is grown from the Box now, one share for each Pokémon shown', !!bplan && bplan.species === boxN && bplan.shares >= boxN && seen.ground === 'box' && seen.list === boxN, bplan && { kind: bplan.kind, species: bplan.species, shares: bplan.shares });
    const t0 = await js(ov, 'G.now'); await sleep(700);
    const moved = await js(ov, `({ now: G.now, state: BoxField.state() })`);
    ok('update 3: the game itself waits while the Box Field is up', moved.now === t0 && moved.state.on, { t0, now: moved.now });
    T.setSettings({ boxFieldMax: 10 });
    const few = await until(async () => { const v = await js(ov, 'BoxField.state()'); return v.on && v.shown === 10 ? v : null; }, 5000);
    ok('update 3: the option limits how many are shown, a different kind each while kinds last', !!few && few.species === 10, few);
    T.setSettings({ boxFieldMax: 1025 }); await sleep(400);
    await js(pw, `document.getElementById('boxToggle').click()`);
    const off = await until(async () => { const v = await js(ov, '({ s: BoxField.state(), world: getComputedStyle(document.getElementById("world")).visibility, ground: G.groundList().kind, left: document.querySelectorAll("#boxField .bxMon").length })'); return !v.s.on ? v : null; }, 6000);
    const t1 = await js(ov, 'G.now'); await sleep(400);
    ok('update 3: closing the Box brings the team\'s field back and the game carries on', !!off && off.world !== 'hidden' && off.ground === 'team' && off.left === 0 && (await js(ov, 'G.now')) > t1, off);
    ok('nothing in the Pokédex page went wrong along the way', ptrouble.length === 0, ptrouble.join(' | '));
    pw.close(); await sleep(300);
  }

  // ---- Optimize: Rotom's window
  {
    const odir = path.join(tmp, 'Loose'); fs.mkdirSync(odir, { recursive: true });
    for (const [n, t] of [['a.jpg', 'A'], ['b.pdf', 'B'], ['c.mp3', 'C']]) fs.writeFileSync(path.join(odir, n), t);
    T.openOptimize();
    const ow = await until(() => { const w = T.optimize(); return w && w.isVisible() ? w : null; });
    if (ok('update 7: Optimize opens in a window of its own', !!ow)) {
      const otrouble = [];
      ow.webContents.on('console-message', (e) => { const m = String(e.message || ''); if (/error/i.test(m) && !/Autofill|DevTools/.test(m)) otrouble.push(m.slice(0, 200)); });
      await until(() => js(ow, 'window.OptimizeUI && OptimizeUI.ready()'), 8000);
      const room = await js(ow, `({ helpers: OptimizeUI.helpers(), pics: OptimizeUI.pictures(), names: [...document.querySelectorAll('#floor .helper')].map((e) => e.title.split(':')[0]), look: document.getElementById('look').disabled, title: document.title })`);
      ok('update 7: its room holds Rotom and the eight helpers, and nothing can be done before a folder is chosen', room.helpers === 8 && room.names.length === 9 && ['Porygon', 'Porygon2', 'Metagross', 'Alakazam', 'Oranguru', 'Beheeyem', 'Genesect', 'Jolteon', 'Rotom'].every((n) => room.names.includes(n)) && room.look === true && (!sprites || room.pics === 9), room);
      ok('update 7: MyStream can never show it (its title is one of the program\'s own)', require(path.join(APP, 'mystream.js')).OWN_TITLE.test(room.title), room.title);
      const set = T.optimizeModule.setFolder(odir);       // (the folder dialog is Windows' own and cannot be pressed from here)
      await js(ow, 'location.reload()'); await until(() => js(ow, 'window.OptimizeUI && OptimizeUI.ready()'), 8000);
      await js(ow, `document.getElementById('look').click()`);
      const plan = await until(() => js(ow, `(() => { const s = OptimizeUI.state(); return s && s.plan ? { count: s.plan.count, folders: s.plan.folders.map((f) => f.name), shown: !document.getElementById('planCard').hidden, cards: document.querySelectorAll('#folders .fold').length } : null; })()`), 5000);
      ok('update 7: "Show me the plan" shows where every loose file would go, and moves nothing', set.ok && !!plan && plan.count === 3 && plan.shown && plan.cards === 3 && fs.existsSync(path.join(odir, 'a.jpg')), plan);
      await js(ow, `document.getElementById('apply').click()`);
      const done = await until(() => (fs.existsSync(path.join(odir, 'Pictures', 'a.jpg')) && fs.existsSync(path.join(odir, 'Documents', 'b.pdf')) && fs.existsSync(path.join(odir, 'Music', 'c.mp3')) ? 1 : 0), 5000);
      ok('update 7: "Sort them" carries the plan out', !!done && !fs.existsSync(path.join(odir, 'a.jpg')) && fs.readFileSync(path.join(odir, 'Pictures', 'a.jpg'), 'utf8') === 'A');
      await until(() => js(ow, `!document.getElementById('undo').disabled`), 4000);
      await js(ow, `document.getElementById('undo').click()`);
      const undone = await until(() => (fs.existsSync(path.join(odir, 'a.jpg')) && !fs.existsSync(path.join(odir, 'Pictures')) ? 1 : 0), 5000);
      ok('update 7: "Undo" puts everything back', !!undone && fs.readdirSync(odir).sort().join() === 'a.jpg,b.pdf,c.mp3');
      const other = await js(ov, 'window.st.opt.status()');
      ok('update 7: only Rotom\'s own window can ask it to do anything', !!other && other.ok === false && !other.folder, other);
      ok('nothing in Rotom\'s window went wrong along the way', otrouble.length === 0, otrouble.join(' | '));
      ow.close(); await sleep(200);
    }
  }

  // ---- closing the field: the barriers go, the square with them
  T.setSettings({ field: false });
  const shut = await until(async () => { const v = await look(); return !v.view ? v : null; }, 6000);
  ok('update 1: closing the field takes Fountain Square away and gives the whole screen back', !!shut && !shut.cam && !shut.sq.shown && shut.sq.blocks.length === 0 && !shut.hasGround, shut && { W: shut.W, sq: shut.sq });
  ok('nothing on the overlay page went wrong along the way', trouble.length === 0, trouble.join(' | '));
  app.exit(fail ? 1 : 0);
}

(async () => {
  try {
    if (!live || process.argv.includes('--rules')) await rules();
    if (live) { await liveChecks(); return; }
  } catch (e) { fail++; console.log('FAIL  the checks ran to the end   [' + String((e && e.stack) || e).slice(0, 600) + ']'); }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (!live) console.log('(run this file with Electron to check the real program as well; see the top of the file)');
  process.exit(fail ? 1 : 0);
})();
