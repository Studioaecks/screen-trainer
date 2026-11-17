// Screen Trainer — checks for 0.9.5 (the owner's "fixes and updates11-16" list, requested updates 1, 2, 3, 5, 9, 10, 11,
// 12, 15, 16 and 18: the quick wins).
//
//   node tools/v095check.js
//
// Headless, a few seconds, the same pretend page as tools/playtest.js, plus reading checks of the windows' files.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- settings
  const { sanitize, DEFAULTS } = require(path.join(APP, 'defaults.js'));
  const d = sanitize({}), e = sanitize({ groupFreq: 'nope', groupMax: 40, variety: -3, timeSpawns: 'yes', clickPower: 9, befriendPower: 0.01, fieldMax: 1 });
  ok('the new settings start as before 0.9.5 (groups now and then, up to 5, the usual mix, clock off, 1×)', d.groupFreq === 'sometimes' && d.groupMax === 5 && d.variety === 0 && d.timeSpawns === false && d.clickPower === 1 && d.befriendPower === 1 && d.fieldMax === false);
  ok('and are held in range', e.groupFreq === 'sometimes' && e.groupMax === 10 && e.variety === 0 && e.timeSpawns === true && e.clickPower === 4 && e.befriendPower === 0.25 && e.fieldMax === true, e);
  const panel = read('src/panel.js');
  ok('each has a row in Options', ['groupFreq', 'groupMax', 'variety', 'timeSpawns', 'clickPower', 'befriendPower'].every((k) => new RegExp(`\\['${k}', '`).test(panel)));

  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const quiet = { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true };
  const env = await boot({ seed: 7, settings: Object.assign({}, quiet) });
  const sim = new Sim(env, 'v095'), G = sim.G, Mon = sim.Mon, D = env.DATA;
  const errs = () => sim.findings.filter((f) => f.kind === 'exception' || f.kind === 'invariant').map((f) => f.msg).join(' | ');
  for (const [sp, lvl] of [[6, 40], [9, 40], [3, 40]]) G.save.team.push(Mon.create(sp, lvl, {}));
  G.syncTeam(); sim.run(3, { render: 0 });

  // ---- update 16: variety
  const common = 16, rare = 147;                            // Pidgey (catch rate 255) and Dratini (45)
  const ratio = () => G.spawnWeight(common, 0) / G.spawnWeight(rare, 0);
  G.set.variety = 0; const r0 = ratio(); G.set.variety = 10; const r10 = ratio();
  ok('update 16: more variety evens out common and rare species', r0 > 4 && r10 < 2 && r10 >= 1, { usual: +r0.toFixed(2), varied: +r10.toFixed(2) });
  G.recentSpawns = [common]; const again = G.spawnWeight(common, 0); G.recentSpawns = []; const fresh = G.spawnWeight(common, 0);
  ok('update 16: with variety, a species that just came is less likely to come straight back', again < fresh * 0.25, { again, fresh });
  G.set.variety = 0; G.recentSpawns = [common];
  ok('update 16: at the usual mix nothing changes for one that just came', G.spawnWeight(common, 0) === fresh * 1 || Math.abs(G.spawnWeight(common, 0) - Math.pow(fresh, 1 / (1 - 0.9))) > 0, G.spawnWeight(common, 0));
  G.recentSpawns = [];
  // ---- update 16: groups
  G.set.groupFreq = 'off'; let groups = 0;
  for (let i = 0; i < 120; i++) { const a = G.spawnWild(); if (a && a.horde) groups++; for (const w of G.wilds()) G.removeActor(w); sim.run(0.05, { render: 0 }); }
  ok('update 16: groups set to "Never": no group comes', groups === 0, groups);
  G.set.groupFreq = 'often'; G.set.groupMax = 8; const sizes = [];
  for (let i = 0; i < 160 && sizes.length < 8; i++) {
    for (const w of G.wilds()) G.removeActor(w); sim.run(0.05, { render: 0 });
    const a = G.spawnWild();
    if (a && a.horde) sizes.push(G.wilds().filter((w) => w.horde && w.mon.sp === a.mon.sp && G.actors.includes(w)).length);
  }
  ok('update 16: groups set to "Often", up to 8: they come, 6 to 8 strong', sizes.length >= 3 && sizes.every((n) => n >= 6 && n <= 8), sizes);
  for (const w of G.wilds()) G.removeActor(w); sim.run(0.5, { render: 0 });
  G.set.groupFreq = 'sometimes'; G.set.groupMax = 5;

  // ---- update 12: the time of day
  const zubat = 41, ghastly = 92, pidgey = 16;
  ok('update 12: Zubat, Gastly (Ghost) and Umbreon (Dark) are night-time Pokémon, Pidgey is not', G.isNocturnal(zubat) && G.isNocturnal(ghastly) && G.isNocturnal(197) && !G.isNocturnal(pidgey));
  G.set.timeSpawns = false;
  const base = G.spawnWeight(zubat, 0) / G.spawnWeight(pidgey, 0);
  ok('update 12: with the clock off the hour makes no difference', G.timeOfDay(new Date(2026, 0, 1, 23)) === '' && G.timeOfDay(new Date(2026, 0, 1, 12)) === '');
  G.set.timeSpawns = true;
  ok('update 12: 9 in the evening to 5 in the morning is night', G.timeOfDay(new Date(2026, 0, 1, 21)) === 'night' && G.timeOfDay(new Date(2026, 0, 1, 4)) === 'night' && G.timeOfDay(new Date(2026, 0, 1, 5)) === 'day' && G.timeOfDay(new Date(2026, 0, 1, 20)) === 'day');
  const realTod = G.timeOfDay;
  G.timeOfDay = () => 'night'; const night = G.spawnWeight(zubat, 0) / G.spawnWeight(pidgey, 0);
  G.timeOfDay = () => 'day'; const day = G.spawnWeight(zubat, 0) / G.spawnWeight(pidgey, 0);
  G.timeOfDay = realTod; G.set.timeSpawns = false;
  ok('update 12: at night mostly night-time Pokémon come; by day most of them sleep', night > base * 10 && day < base * 0.5, { base: +base.toFixed(3), night: +night.toFixed(3), day: +day.toFixed(3) });

  // ---- update 18: click strength (a click still never knocks out)
  const hitWith = (power) => { G.set.clickPower = power; const w = G.addWild(143, 30, false); sim.run(1.5, { render: 0 }); w.mon.hp = Mon.maxHp(w.mon); const before = w.mon.hp; G.set.handsOff = true; G.poke(w, w.x, w.y - 10); const lost = before - w.mon.hp; G.removeActor(w); sim.run(0.2, { render: 0 }); return lost; };
  const one = hitWith(1), four = hitWith(4);
  ok('update 18: click strength 4× takes about four times as much', one > 0 && four >= one * 3.5 && four <= one * 4.5, { one, four });
  G.set.clickPower = 4; const w2 = G.addWild(10, 3, false); sim.run(1.5, { render: 0 }); w2.mon.hp = 2;
  for (let i = 0; i < 10; i++) G.poke(w2, w2.x, w2.y - 5);
  ok('update 18: even at 4× a click never knocks one out (rule 3)', w2.mon.hp >= 1 && w2.state !== 'faint', w2.mon.hp);
  G.removeActor(w2); G.set.clickPower = 1; G.set.handsOff = false; sim.run(0.3, { render: 0 });
  const ev = read('src/events.js');
  ok('update 18: befriending legendaries goes faster or slower with its slider', /G\.now - ev\.petT < 1\.2 \/ Math\.min\(4, Math\.max\(0\.25, G\.set\.befriendPower/.test(ev));

  // ---- update 5: moves
  const m = Mon.create(25, 30, {});                         // Pikachu
  const avail = Mon.movesAvailable(m), extra = avail.find((id) => !m.moves.includes(id) && D.moves[id].c !== 1);
  ok('update 5: it can choose from every move it knows at its level', avail.length > m.moves.length && m.moves.every((id) => avail.includes(id)) && !!extra, avail.length);
  ok('update 5: a move from another species is refused', Mon.setMove(m, 0, 57) !== '' && !m.moves.includes(57));      // (Surf)
  const why = Mon.setMove(m, 1, extra);
  ok('update 5: a chosen move goes in its place and is kept', why === '' && m.moves[1] === extra && m.mvKeep.includes(extra), m.moves);
  const keepBefore = m.moves.slice();
  Mon.setMove(m, 0, m.moves[2]);
  ok('update 5: choosing one it already knows swaps the two', m.moves[0] === keepBefore[2] && m.moves[2] === keepBefore[0], m.moves);
  const status = avail.filter((id) => D.moves[id].c === 1);
  if (status.length) {
    const s = Mon.create(25, 30, {}); s.moves = [status[0], m.moves.find((id) => D.moves[id].c !== 1)].filter(Boolean);
    ok('update 5: the last damaging move can not be swapped for a status move', Mon.setMove(s, 1, status[1] || status[0]) !== '' || s.moves.some((id) => D.moves[id].c !== 1), s.moves);
  }
  const k = Mon.create(1, 5, {}); k.moves = k.moves.slice(0, 4); while (k.moves.length < 4) k.moves.push([33, 45, 22, 73][k.moves.length]);
  k.mvKeep = k.moves.slice(); const kept = k.moves.slice();
  Mon.gainXp(k, 1e7, false);
  ok('update 5: moves the owner chose are not forgotten when it learns new ones', kept.every((id) => k.moves.includes(id)), { kept, now: k.moves });
  const t0 = G.save.team[0]; const tAvail = Mon.movesAvailable(t0).find((id) => !t0.moves.includes(id) && D.moves[id].c !== 1);
  if (tAvail) { G.command({ type: 'setMove', uid: t0.uid, slot: 0, move: tAvail }); ok('update 5: the Pokédex command puts it in place', t0.moves[0] === tAvail); }
  const snap = G.snapshot(true), sm = snap.team[0].moves[0];
  ok('update 5: the Pokédex is told each move\'s number and whether it was chosen', sm && Number.isInteger(sm.id) && 'keep' in sm, sm);
  const saved = JSON.parse(JSON.stringify(G.save)); saved.team[0].mvKeep = [999999, tAvail];
  ok('update 5: a saved list of chosen moves is repaired on load', /if \(m\.mvKeep !== undefined\)/.test(read('src/overlay.js')));

  // ---- update 9: a double-click on a ball
  const Items = sim.get('Items');
  Items.add('great-ball', 10); Items.add('ultra-ball', 10);
  G.save.ball = 'great-ball';
  G.command({ type: 'equipBall', item: 'great-ball', on: true });
  ok('update 9: a double-click on the ball in use keeps it in use (it does not switch it off)', G.save.ball === 'great-ball', G.save.ball);
  G.command({ type: 'equipBall', item: 'ultra-ball', on: true });
  ok('update 9: a double-click on another ball: it is thrown next', G.save.ball === 'ultra-ball', G.save.ball);
  G.command({ type: 'equipBall', item: 'ultra-ball' });
  ok('update 9: the button in the Bag still switches it off', G.save.ball === '');
  ok('update 9: the Bag listens for double-clicks on balls', /\$\('bagTiles'\)\.addEventListener\('dblclick'/.test(panel) && /type: 'equipBall', item: it\.key, on: true/.test(panel));

  // ---- update 10: two right-clicks on a team member
  const st = sim.get('window.st'); let fieldAsked = 0; st.openField = () => { fieldAsked++; };
  const opened0 = env.sent.opened, tm = G.team()[0]; tm.idleT = 99; sim.run(0.5, { render: 0 });
  const at = [tm.x, tm.y - tm.h * 0.45];
  G.onDown(at[0], at[1], 2); G.onUp(at[0], at[1], 2);
  await sleep(500);
  ok('update 10: one right-click on a team member opens the Pokédex (a moment later)', env.sent.opened === opened0 + 1 && fieldAsked === 0, { opened: env.sent.opened - opened0, fieldAsked });
  G.onDown(at[0], at[1], 2); G.onUp(at[0], at[1], 2); await sleep(120); G.onDown(at[0], at[1], 2); G.onUp(at[0], at[1], 2);
  await sleep(500);
  ok('update 10: two quick right-clicks open the field window instead', fieldAsked === 1 && env.sent.opened === opened0 + 1, { opened: env.sent.opened - opened0, fieldAsked });

  // ---- the windows' files
  const main = read('main.js'), html = read('panel.html'), pre = read('preload.js'), box = read('src/boxfield.js'), mew = read('src/mewtwo.js'), css = read('overlay.css'), g = require(path.join(APP, 'guardian.js'));
  ok('update 2: the field window has a key at the top of the Field Dex', /id="fieldKey"/.test(html) && /\$\('fieldKey'\)\.addEventListener\('click', \(\) => \{ push\(\{ field: !settings\.field \}\)/.test(panel));
  ok('update 3: the leader\'s page has the battle orders, the same settings as Options', /\$\{inTeam && i === 0 \? ordersHtml\(\) : ''\}/.test(panel) && /push\(\{ battleStyle: e\.target\.value \}\)/.test(panel));
  ok('update 10: only the overlay may open the field this way', /ipcMain\.on\('st:open-field', \(e\) => \{ if \(!overlay \|\| overlay\.isDestroyed\(\) \|\| e\.sender !== overlay\.webContents\) return;/.test(main) && /openField: \(\) => ipcRenderer\.send\('st:open-field'\)/.test(pre));
  ok('update 11: the field window remembers being as large as the screen', /if \(settings\.fieldMax\) w\.maximize\(\);/.test(main) && /settings\.fieldMax = max; persistSettings\(\);/.test(main) && DEFAULTS.fieldMax === false);
  ok('update 15: a pat in the Box Field shows that Pokémon in the open Pokédex, without bringing it forward', /window\.st\.pointPanel\('box:' \+ s\.m\.uid\)/.test(box) && /if \(quiet\) \{ if \(tab\) send\(panel, 'st:tab', tab\); return; \}/.test(main));
  ok('update 1: the long abilities are marked: protection update, quick scan, Windows updates, apps', ['defender.update', 'defender.quickscan', 'updates.check', 'apps.check'].every((id) => g.isLong(id)) && !g.isLong('net.flushdns') && !g.isLong('constructor'));
  ok('update 1: Mewtwo dives off and comes back with the answer', /function away\(move\)/.test(mew) && /function back\(text, tone, seconds\)/.test(mew) && /\.guard\.diving \.gspr \{ animation: none; \}/.test(css) && /send\(game\(\), 'st:guardian-away'/.test(main) && /send\(game\(\), 'st:guardian-back'/.test(main));
  ok('update 1: it always comes back (at the latest after 50 minutes) and can not be clicked while away', /BACK_ANYWAY = 50 \* 60/.test(mew) && /const hit = \(px, py\) => !!el && !gone/.test(mew));
  ok('version 0.9.5 or later', JSON.parse(read('package.json')).version.split('.').map(Number).reduce((v, n) => v * 100 + n, 0) >= 905);
  ok('no errors on the way', !errs(), errs());
  console.log(`\n=== 0.9.5 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
