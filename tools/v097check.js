// Screen Trainer — checks for 0.9.7 (the owner's "fixes and updates11-16" list, requested updates 4, 6 and 14: chat,
// pointers, visitors' teams, the fountain).
//
//   node tools/v097check.js
//
// Headless, under a minute: the pointer list, what online.js lets through, a visitor's team on the pretend page of
// tools/playtest.js (a friendly battle from start to end), the fountain's measures, and the windows' files.
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
  // ---- pointers
  const P = require(path.join(APP, 'pointers.js'));
  const keys = P.LIST.map((c) => c.k);
  ok('update 4: over two hundred pointers to win', P.count() >= 200, P.count());
  ok('update 4: every pointer has its own key, and the first eight keep their numbers', new Set(keys).size === keys.length && keys.slice(0, 8).join() === 'poke,great,ultra,master,star,badge,crown,bolt');
  const none = P.view({}).filter((c) => c.won).length, lots = P.view({ species: 300, caught: 1200, shiny: 12, badges: 9, legend: 5, alpha: 2, pets: 600, items: 120, trainers: 6, friendly: 1, visitCaught: 3, type: { fire: 30, water: 60 }, gen: { 1: 151 }, genAll: { 1: 151 }, shinyType: { fire: 1 } }).filter((c) => c.won).length;
  ok('update 4: a new player has one pointer; a long game wins many more', none === 1 && lots > 40, { none, lots });
  ok('update 4: a pointer can be the mouse itself (a picture for the cursor)', /^url\("data:image\/svg\+xml,.*"\) 1 1, auto$/.test(P.cursorCss(4, 32)) && !/[<>]/.test(P.cursorCss(4, 32).replace(/%3C|%3E/g, '')) === false);
  // ---- online: lines, the host's words, teams
  const O = require(path.join(APP, 'online.js')), N = require(path.join(APP, 'onlinenet.js'));
  ok('update 4: the first sixteen lines keep their numbers; yes, no, accept, deny and more are added', O.LINES.slice(0, 16).join('|').startsWith('Hi!|Welcome!') && O.LINES.length === 32 && ['Yes', 'No', 'Accept', 'Deny'].every((l) => O.LINES.includes(l)));
  ok('update 4: what the host types is cleaned: one line, no hidden characters, 120 characters at most', O.cleanText('  Hi\nthere‮!\u0007 ') === 'Hi there !' && O.cleanText('x'.repeat(300)).length === 120 && O.cleanText(42) === '');
  ok('update 4: two programs meet only with the same protocol (2), and a pointer number up to 1023 crosses', N.VERSION === 2 && /o\.cursor < 1024/.test(read('onlinenet.js')));
  const team = [{ sp: 6, lvl: 50, shiny: false, nat: 3, iv: [31, 31, 31, 31, 31, 31], moves: [52, 999999, 'x', 10], sz: 128 }, { sp: 99999, lvl: 5 }, 'nope', { sp: 25, lvl: 300 }];
  const clean = team.map(O.gift).filter(Boolean);
  ok('update 6: a team crosses as numbers only, checked one by one', clean.length === 2 && clean[0].moves.join() === '52,10' && clean[1].lvl === 100, clean);
  const onl = read('online.js');
  ok('update 6: the host takes a team at most once in 10 seconds, six Pokémon, 30 times a visit', /now - \(v\.teamAt \|\| 0\) < 10000 \|\| \(v\.teams = \(v\.teams \|\| 0\) \+ 1\) > 30/.test(onl) && /m\.list\.slice\(0, 6\)\.map\(gift\)/.test(onl));
  ok('update 4: visitors still can only pick a line by its number (no words from a visitor reach anyone)', /const i = line\(m\.i\);/.test(onl) && /text: LINES\[i\]/.test(onl));

  // ---- a visitor's team on the stage (the pretend page)
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true, autoBattle: true };
  const env = await boot({ seed: 21, settings: Object.assign({}, quiet) });
  const sim = new Sim(env, 'v097'), G = sim.G, Mon = sim.Mon, V = sim.get('Visitors'), R = sim.get('Rivals');
  const errs = () => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');
  for (const [sp, lvl] of [[6, 80], [9, 80], [3, 80]]) G.save.team.push(Mon.create(sp, lvl, {}));
  G.syncTeam(); sim.run(3, { render: 0 });
  V.input({ t: 'join', slot: 1, name: 'Hiker 0042', cursor: 12, quiet: true });
  V.input({ t: 'p', slot: 1, x: 640, y: 300 }); sim.run(1, { render: 0 });
  V.input({ t: 'p', slot: 1, x: Math.round(G.W) + 30, y: 200 }); sim.run(0.3, { render: 0 });      // (the stage is 1280 wide; this pretend page is a whole screen)
  let vs = V.state().list[0];
  ok('update 4: a visitor\'s pointer that leaves the picture is an arrow on the rim', vs.off && vs.edge, vs);
  V.input({ t: 'p', slot: 1, x: 600, y: 320 }); sim.run(0.3, { render: 0 });
  vs = V.state().list[0];
  ok('update 4: back on the picture it is a pointer again, where it came in', !vs.off && !vs.edge && Math.abs(vs.x - 600) < 3, vs);
  V.input({ t: 'team', slot: 1, list: [O.gift({ sp: 19, lvl: 5 }), O.gift({ sp: 16, lvl: 5 })] });
  for (let i = 0; i < 40 && !R.active(); i++) sim.run(0.25, { render: 0 });
  const st0 = R.state(), guests = G.wilds().filter((w) => w.guest === 1);
  ok('update 6: the visitor\'s team stands on the field, as another Trainer\'s team', !!st0 && st0.kind === 'guest' && guests.length === 2 && guests.every((w) => w.rival), st0);
  sim.run(20, { render: 0 });
  ok('update 6: it stays while the visitor stays (no leaving after a while), and the team leaves it alone', R.active() && R.state().phase === 'wait' && G.team().every((a) => a.target !== guests[0] && a.target !== guests[1]));
  const outs = []; const st = sim.get('window.st'); st.vOut = (m) => outs.push(m);
  const g0 = guests[0]; G.onDown(g0.x, g0.y - g0.h * 0.4, 0); G.onUp(g0.x, g0.y - g0.h * 0.4, 0); sim.run(0.1, { render: 0 });
  ok('update 6: one click does not start a battle', R.state().phase === 'wait');
  R.click(g0, 0); R.click(g0, 0);
  ok('update 6: a double-click starts a friendly battle, and the visitor is told', R.state().phase === 'battle' && outs.some((m) => m.t === 'duel' && m.s === 'start' && m.slot === 1), outs);
  const thrown = G.throwBall ? (() => { const before = g0.balled; G.throwBall(g0); return !g0.balled || g0.balled === before; })() : true;
  ok('update 6: a visitor\'s Pokémon can not be caught', thrown);
  const fr0 = G.save.stats.friendly || 0;
  for (let i = 0; i < 400 && R.active() && R.state().phase === 'battle'; i++) sim.run(0.25, { render: 0 });
  ok('update 6: the team wins the friendly battle: counted, the visitor told, no prize', (G.save.stats.friendly || 0) === fr0 + 1 && outs.some((m) => m.t === 'duel' && m.s === 'lost'), { friendly: G.save.stats.friendly, outs });
  for (let i = 0; i < 200 && R.active(); i++) sim.run(0.25, { render: 0 });
  sim.run(30, { render: 0 });
  ok('update 6: after a rest the team comes back (healthy: built anew)', R.active() && R.state().kind === 'guest' && R.state().alive === 2, R.state());
  V.input({ t: 'leave', slot: 1 }); for (let i = 0; i < 80 && R.active(); i++) sim.run(0.25, { render: 0 });
  ok('update 6: when the visitor goes home its team goes too', !R.active() && !G.wilds().some((w) => w.guest === 1 && !w.gone && w.state !== 'leave'));

  // ---- update 14: the fountain
  const F = require(path.join(APP, 'src', 'fountain.js'));
  ok('update 14: the fountain is a quarter larger, its measures scaled together', F.S === 1.25 && F.SIZE.w === 220 && F.SIZE.h === 188 && F.CX === 110 && F.BASE === 158 && F.ROWS.foot.rx === 120 && F.TOP.y === 39);
  const fsrc = read('src/fountain.js');
  ok('update 14: new details: seams, carving, lily pads, coins, fish', ['seams between the stones', 'carved studs', 'lily pads', 'coins on the bottom', 'fish gliding'].every((w) => fsrc.includes(w)));
  ok('update 14: the button on top follows the fountain', /Fountain\.TOP \? Fountain\.TOP\.y : 31/.test(read('src/square.js')) && /Fountain\.TOP \? Fountain\.TOP\.y : 31/.test(read('src/stage.js')));

  // ---- the windows' files
  const main = read('main.js'), pre = read('preload.js'), visitHtml = read('visit.html'), visitJs = read('src/visit.js'), vis = read('src/visitors.js');
  ok('update 4: the host types in the online window; the window says only the host can', /id="hostText"/.test(visitHtml) && /ov\.sayText\(t\)/.test(visitJs) && /sayText: \(t\) => ipcRenderer\.invoke\('ov:say-text', t\)/.test(pre));
  ok('update 4: a visitor shows the host\'s words as text only', /!m\.slot && typeof m\.text === 'string' \? m\.text\.replace/.test(visitJs) && /t\.textContent = String\(text\)/.test(visitJs));
  ok('update 4: my pointer is the mouse over the game and the field (setting myCursor)', /function sendMyPointer\(\)/.test(main) && /Pointers\.cursorCss\(i, 32\)/.test(main) && /st\.onMyPointer/.test(read('src/overlay.js')) && /st\.onMyPointer/.test(read('field.html')));
  ok('update 4: visitors\' pointers are as large as the owner\'s and follow more closely', /window\.__ptrScale/.test(vis) && /dt \* 26/.test(vis) && /n\.p > 75/.test(onl));
  ok('update 6: the visitor sends its team after saying hello', /setTimeout\(sendTeam, 800\)/.test(onl) && /G\.teamGift/.test(read('src/game.js')));
  ok('the pages load pointers.js', ['stage.html', 'mystream.html', 'visit.html'].every((f) => /<script src="pointers\.js"><\/script>/.test(read(f))));
  ok('version 0.9.7 or later', JSON.parse(read('package.json')).version.split('.').map(Number).reduce((v, n) => v * 100 + n, 0) >= 907);
  ok('no errors on the way', !errs(), errs());
  console.log(`\n=== 0.9.7 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
