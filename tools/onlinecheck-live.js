// Screen Trainer — the live part of tools/onlinecheck.js: the real program visits itself through two stand-in message
// boards on this computer. Host and visitor are the same program here (the checks allow that, the program never does),
// so one run shows the whole way: the notes, the direct connection, the picture, the pointer, a click, a shared
// catch, the chat lines, being sent home, blocking. Nothing leaves this computer.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

async function run({ ok, sleep, results, APP }) {
  const { app } = require('electron');
  const Board = require(path.join(APP, 'tools', 'standin-board.js'));
  const b1 = await Board.start(), b2 = await Board.start();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onlinecheck-')), userDir = path.join(tmp, 'user');
  fs.mkdirSync(userDir, { recursive: true });
  const mon = (sp, lvl, extra) => Object.assign({ sp, iv: [12, 12, 12, 12, 12, 12], lvl, nat: 3, hp: 30 }, extra || {});
  fs.writeFileSync(path.join(userDir, 'save.json'), JSON.stringify({ v: 1, team: [mon(7, 14), mon(25, 12)], box: [], dex: { caught: { 7: 1, 25: 1 }, seen: { 7: 1, 25: 1 } }, stats: {}, bag: {}, helpers: { rotom: 1, mewtwo: 1, porygonz: 1 } }));
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({ spritesPath: process.env.ST_TEST_SPRITES || '', firstRun: false, mute: true, spriteStyle: 'static', scale: 2, paused: true, legendEvents: 'off', trainerBattles: 'off', guardian: false }));
  app.setName('Screen Trainer');
  app.setPath('userData', userDir);
  process.env.ST_TEST = '1';
  process.env.ST_TEST_BOARDS = [b1.url, b2.url].join(',');
  process.env.ST_SELFCHECK_DIR = path.join(tmp, 'selfcheck');
  require(path.join(APP, 'main.js'));
  await app.whenReady();
  const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > (ms || 10000)) return null; await sleep(120); } };
  const js = (w, code) => w.webContents.executeJavaScript(code, true);
  const finish = async () => { const bad = results.filter((r) => !r.ok).length; console.log(`\n${results.length - bad} passed, ${bad} failed`); try { await b1.close(); await b2.close(); } catch (e) { /* closing anyway */ } app.exit(bad ? 1 : 0); };
  try {
    const T = await until(() => global.__stTest && global.__stTest.overlay() && global.__stTest);
    if (!ok('the program starts', !!T)) return finish();
    await until(() => js(T.overlay(), 'typeof G !== "undefined" && !!G.save'));
    const sprites = await js(T.overlay(), 'Sprites.ready()');
    const O = T.online();
    ok('visiting is switched off at first: no board is spoken to', !!O && O._test.cfg().mode === 'off' && !O.hosting() && b1.clients() === 0 && b2.clients() === 0, `${b1.clients()} + ${b2.clients()} connections`);
    // the ball on the fountain opens the window; switched off, nothing is looked for
    O.button();
    const hub = await until(() => O.window());
    if (!ok('the ball on the fountain opens the online window', !!hub)) return finish();
    await until(() => js(hub, 'typeof Visit !== "undefined" && !!V'));
    await sleep(900);
    ok('switched off, the window explains itself and looks for nobody', (await js(hub, '[document.getElementById("goRandom").disabled, document.getElementById("state").textContent]')).join() === 'true,offline' && b1.clients() === 0 && O._test.visitState().state === 'idle');
    ok('the window says that a visit shows your IP address', /IP address/.test(await js(hub, 'document.querySelector(".note.warn").textContent')));
    ok('nothing in the window takes typed words but the friend code', (await js(hub, 'document.querySelectorAll("input:not([type=radio]), textarea, [contenteditable]").length')) === 1 && (await js(hub, 'document.getElementById("friend").maxLength')) === 11);
    // switch it on: still no host without MyStream's stage
    await js(hub, 'document.querySelector("#modes input[value=friends]").click()');
    await sleep(500);
    ok('switched on without MyStream there is no stage to visit, and the window says how to get one', O._test.cfg().mode === 'friends' && !O.hosting() && /open MyStream/.test(await js(hub, 'document.getElementById("hostNote").textContent')));
    ok('MyStream opens', await T.openMyStream());
    const ms = T.ms(), stage = ms.stageWindow(), booth = ms.boothWindow();
    await until(() => js(stage, 'Stage.ready()')); await until(() => js(booth, 'Booth.ready()'));
    ok('with the stage up the program can be visited', !!(await until(() => O.hosting(), 15000)) && !!(await until(() => b1.clients() >= 1 && b2.clients() >= 1, 8000)), `${b1.clients()} + ${b2.clients()} connections`);
    await until(async () => /can be visited now/.test(await js(hub, 'document.getElementById("hostNote").textContent')), 8000);

    // ---- a friend's visit (the program's own code)
    const code = O._test.cfg().code, t0 = Date.now();
    await js(hub, `(() => { const f = document.getElementById('friend'); f.value = ${JSON.stringify(code.toLowerCase())}; f.dispatchEvent(new Event('input')); document.getElementById('goFriend').click(); })()`);
    const there = await until(() => O._test.visitState().state === 'there', 40000);
    if (!ok('a visit with the friend code gets in', !!there, there ? `${((Date.now() - t0) / 1000).toFixed(1)} s` : JSON.stringify(O._test.visitState()))) return finish();
    const st1 = await until(async () => { const s = await js(hub, 'Visit.stats()'); return s.frames > 8 && s.w > 0 ? s : null; }, 20000);
    ok('the picture of the host\'s stage arrives', !!st1 && st1.w === 1280 && st1.h === 720 && st1.frames > 8, st1 ? `${st1.w} x ${st1.h}, ${st1.frames} pictures, ${st1.pair}` : JSON.stringify(await js(hub, 'Visit.stats()')));
    const v1 = await until(async () => { const s = await js(stage, 'Visitors.state()'); return s.n === 1 ? s : null; }, 8000);
    ok('the visitor stands on the stage with a pointer and a name made of a class and a number', !!v1 && /^[A-Z][A-Za-z ]+ \d{4}$/.test(v1.list[0].name) && v1.list[0].slot === 1 && v1.list[0].key === 'poke', v1 && v1.list[0]);
    ok('the visitor is told who is here', !!(await until(async () => { const s = await js(hub, 'Visit.stats()'); return s.slot === 1 && s.roster.list.length === 1 && /\d{4}$/.test(s.roster.host) ? s : null; }, 6000)));
    ok('the host sees the visitor listed, marked as a friend', !!(await until(async () => (await js(hub, 'document.querySelectorAll("#guests .guest").length')) === 1 && /friend/.test(await js(hub, 'document.querySelector("#guests .guest").textContent')), 6000)));
    const sniff = b1.notes.map((n) => n.text).join('\n');
    ok('on the boards there was no address and no code to read', !/candidate|a=fingerprint|v=0/.test(sniff) && !sniff.includes(code), `${b1.notes.length} notes`);
    // the pointer
    await js(hub, 'Visit.send({ t: "p", x: 300, y: 200 })');
    ok('the pointer goes where the visitor points', !!(await until(async () => { const s = await js(stage, 'Visitors.state()'); return s.list[0] && Math.abs(s.list[0].x - 300) < 3 && Math.abs(s.list[0].y - 200) < 3; }, 5000)));
    // a pointer move on the picture itself (the window's own mouse)
    {
      const r = await js(hub, '(() => { const b = document.getElementById("vid").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()');
      const k = Math.min(r.w / 1280, r.h / 720), px = Math.round(r.x + (r.w - 1280 * k) / 2 + 900 * k), py = Math.round(r.y + (r.h - 720 * k) / 2 + 500 * k);
      hub.webContents.sendInputEvent({ type: 'mouseMove', x: px, y: py }); await sleep(120); hub.webContents.sendInputEvent({ type: 'mouseMove', x: px + 1, y: py });
      ok('a point of the picture is the same point of the stage', !!(await until(async () => { const s = await js(stage, 'Visitors.state()'); return s.list[0] && Math.abs(s.list[0].x - 900) < 6 && Math.abs(s.list[0].y - 500) < 6; }, 5000)), (await js(stage, 'Visitors.state()')).list[0]);
    }
    // chat lines
    await js(hub, 'document.querySelectorAll("#lines button")[4].click()');
    const said = await until(async () => { const s = await js(stage, 'Visitors.state()'); return s.list[0] && s.list[0].say ? s.list[0].say : null; }, 5000);
    ok('a ready-made line shows as a bubble at the visitor\'s pointer', said === 'Good catch!', said);
    await js(hub, 'Visit.send({ t: "say", i: "<img src=x>" }); Visit.send({ t: "say", i: 99 }); Visit.send({ t: "say", text: "typed words" })');
    await sleep(500);
    ok('nothing but a line from the list can be said', (await js(stage, 'Visitors.state()')).list[0].say === 'Good catch!');
    O._test.hostSay(1);
    ok('the host can answer with a line too', !!(await until(async () => (await js(stage, 'Visitors.state()')).host === 'Welcome!', 4000)));

    if (sprites) {
      // ---- playing: a hit, a ball, a shared catch
      const put = (sp, lvl) => js(stage, `(() => { const a = G.addWild(${sp}, ${lvl}, false, { x: 640, y: 560 }); a.await = null; a.hops = null; a.state = 'roam'; a.x = a.tx = 640; a.y = a.ty = 560; a.calm = true; a.stay = 999; window.__w = a; return a.id; })()`);
      await put(16, 3); await sleep(900);
      const hp0 = await js(stage, '__w.mon.hp');
      await js(hub, `Visit.send({ t: 'c', b: 0, x: ${640}, y: ${540} })`);
      ok('a visitor\'s left click weakens a wild Pokémon', !!(await until(async () => (await js(stage, '__w.mon.hp')) < hp0, 4000)), `${hp0} -> ${await js(stage, '__w.mon.hp')}`);
      // the host's own things are not a visitor's to touch
      const team0 = await js(stage, '(() => { const a = G.team()[0]; a.hops = null; a.await = null; return { x: a.x, y: a.y - a.h * 0.4, uid: a.mon.uid, aff: a.mon.aff, px: a.x, py: a.y }; })()');
      await js(hub, `Visit.send({ t: 'c', b: 2, x: ${Math.round(team0.x)}, y: ${Math.round(team0.y)} })`); await sleep(400);
      ok('a visitor\'s right click on the host\'s Pokémon opens nothing and moves nothing', !T.panel() && (await js(stage, '!G.drag')));
      const bagBefore = await js(stage, 'JSON.stringify(G.save.bag)'), counts = await js(stage, '[G.save.team.length, G.save.box.length]');
      let after = null;
      for (let i = 0; i < 10 && !after; i++) {              // (a ball can fail: the visitor throws again, as a player would)
        await js(stage, 'if (!__w.gone) { __w.mon.hp = 1; __w.x = __w.tx = 640; __w.y = __w.ty = 560; __w.hops = null; } G.lastThrow = -9;');
        await js(hub, `Visit.send({ t: 'c', b: 2, x: 640, y: 540 })`);
        after = await until(async () => { const c = await js(stage, '[G.save.team.length, G.save.box.length]'); if (c[0] + c[1] >= counts[0] + counts[1] + 2) return c; const w = await js(stage, '({ balled: !!__w.balled, balls: G.balls.length })'); return !w.balled && !w.balls ? 'again' : null; }, 12000);
        if (after === 'again') { after = null; await sleep(1300); }
      }
      ok('a visitor\'s ball catches, the host gets the Pokémon and the visitor one like it', !!after, after ? `team and Box ${counts.join('+')} -> ${after.join('+')} (host and visitor are one program here)` : JSON.stringify(await js(stage, '[G.save.team.length, G.save.box.length, G.balls.length]')));
      ok('the ball was the visitor\'s own: nothing left the host\'s Bag', (await js(stage, 'JSON.stringify(G.save.bag)')) === bagBefore);
      const got = await js(stage, '(() => { const all = G.save.team.concat(G.save.box).filter((m) => m.sp === 16); return all.map((m) => ({ lvl: m.lvl, vis: m.vis || 0, uid: !!m.uid, ball: m.ball })); })()');
      ok('the visitor\'s copy is a Pokémon of its own, marked as caught on a visit', got.length === 2 && got.filter((m) => m.vis === 1).length === 1 && got.every((m) => m.uid && m.lvl === got[0].lvl), got);
      ok('and counts in the visitor\'s Pokédex', (await js(stage, 'G.save.dex.caught[16]')) === 2 && (await js(stage, 'G.save.stats.visitCaught')) === 1);
    } else console.log('      (no ST_TEST_SPRITES: the checks that need Pokémon on the stage are skipped)');

    // ---- going home
    const top = await js(stage, 'Square.state().top');
    await js(hub, `Visit.send({ t: 'c', b: 0, x: ${top.x}, y: ${top.y} })`);
    const home = await until(() => O._test.visitState().state === 'idle' && O._test.visitState().why === 'home', 8000);
    ok('the ball on top of the fountain takes a visitor home', !!home && !!(await until(async () => (await js(stage, 'Visitors.state()')).n === 0, 5000)) && O.visitors() === 0, JSON.stringify(O._test.visitState()));
    ok('the window is back at its buttons and says so', (await js(hub, '[document.getElementById("idle").hidden, document.getElementById("vid").hidden, document.getElementById("note").textContent]')).join('|') === 'false|true|You are home again.');

    // ---- anyone: a random visit; sent home by the host; blocked
    await js(hub, 'document.querySelector("#modes input[value=open]").click()'); await sleep(600);
    await js(hub, 'document.getElementById("goRandom").click()');
    ok('open to anyone, a random visit finds the host', !!(await until(() => O._test.visitState().state === 'there', 40000)), JSON.stringify(O._test.visitState()));
    await until(async () => (await js(hub, 'document.querySelectorAll("#guests .guest").length')) === 1, 6000);
    await js(hub, 'document.querySelector("#guests .guest button").click()');
    ok('the host can send a visitor home', !!(await until(() => O._test.visitState().state === 'idle' && O._test.visitState().why === 'sent', 8000)) && O.visitors() === 0, JSON.stringify(O._test.visitState()));
    await js(hub, 'document.getElementById("goRandom").click()');
    await until(() => O._test.visitState().state === 'there', 40000);
    await until(async () => (await js(hub, 'document.querySelectorAll("#guests .guest").length')) === 1, 6000);
    await js(hub, 'document.querySelector("#guests .guest button.bad").click()');
    await until(() => O._test.visitState().state === 'idle', 8000);
    ok('the host can block a visitor', O._test.cfg().blocked.length === 1 && !!(await until(async () => (await js(hub, 'document.querySelectorAll("#blocked .blk").length')) === 1, 4000)));
    await js(hub, 'document.getElementById("goRandom").click()');
    const refused = await until(() => { const s = O._test.visitState(); return s.state === 'idle' && s.why && s.why !== 'sent' ? s : null; }, 40000);
    ok('somebody blocked does not get in again', !!refused && O.visitors() === 0, refused && refused.why);
    await js(hub, 'document.querySelector("#blocked .blk button").click()'); await sleep(400);
    ok('and can be unblocked', O._test.cfg().blocked.length === 0);

    // ---- the check a player's computer can run on itself (here against the stand-in boards)
    {
      const before = JSON.stringify([O._test.cfg().mode, O._test.cfg().code]);
      const chk = await O.check();
      ok('the program can check visiting by visiting itself', chk.ok && chk.steps.length >= 6, chk.steps.map((s) => `${s.ok ? 'ok' : 'FAIL'} ${s.name}${s.detail ? ' (' + s.detail + ')' : ''}`).join('; '));
      await sleep(600);
      ok('and afterwards the mode and the friend code are what they were, and nobody is visiting', JSON.stringify([O._test.cfg().mode, O._test.cfg().code]) === before && O.visitors() === 0 && O._test.visitState().state === 'idle' && JSON.parse(fs.readFileSync(path.join(userDir, 'online.json'), 'utf8')).code === O._test.cfg().code);
      await until(() => O.hosting(), 8000);
    }
    // ---- a full field, and MyStream closing
    await js(hub, 'document.getElementById("goRandom").click()');
    await until(() => O._test.visitState().state === 'there', 40000);
    ok('a pointer that is won can be chosen, one that is not cannot', (await js(hub, 'st.ov.set({ cursor: 7 })')).cursor === 7 && (await js(hub, 'st.ov.set({ cursor: 3 })')).cursor === 7, 'the save of this check has Rotom, Mewtwo and Porygon-Z, and two species');
    await ms.close();
    ok('when MyStream closes the visitors are home again and nobody can come', !!(await until(() => O._test.visitState().state === 'idle' && !O.hosting() && O.visitors() === 0, 10000)), JSON.stringify(O._test.visitState()));
    await js(hub, 'document.querySelector("#modes input[value=off]").click()');
    ok('switched off again, the boards are left', !!(await until(() => b1.clients() === 0 && b2.clients() === 0, 6000)), `${b1.clients()} + ${b2.clients()} connections`);
    await sleep(900);
    const saved = JSON.parse(fs.readFileSync(path.join(userDir, 'online.json'), 'utf8'));
    ok('what is kept: the mode, an identity, the code, class and pointer, who is blocked. No names, no addresses', Object.keys(saved).sort().join() === 'blocked,boards,bounds,cls,code,cursor,mode,pid' && saved.mode === 'off', Object.keys(saved).join());
  } catch (e) { ok('the live checks ran to the end', false, String((e && e.stack) || e).slice(0, 400)); }
  return finish();
}
module.exports = { run };
