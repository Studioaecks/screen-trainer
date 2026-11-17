// Screen Trainer — the Android page (android.html + src/android.js) driven like a phone, in the program's own engine.
//
//   xvfb-run -a electron --no-sandbox tools/androidpage.js        (ST_TEST_SPRITES=<a sprites folder> is needed: without
//                                                                  pictures no Pokémon stands on the field to be touched)
//
// It serves the app folder the way the Android shell does (one made-up site, files only), opens the page phone-sized
// with touch switched on, and checks what 0.6 changed: a finger drags a team Pokémon (also after holding it still
// first, which is how the owner's phone showed the fault), every option can be changed and is remembered, the game
// carries on while nothing is drawn (screen off), Mewtwo's sheet opens. tools/androidcheck.js checks the export itself.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const APP = path.join(__dirname, '..'), SPRITES = process.env.ST_TEST_SPRITES || '';
const results = [];
const ok = (name, pass, note) => { results.push(!!pass); console.log(`${pass ? 'ok    ' : 'FAILED'}  ${name}${note !== undefined && note !== '' ? '   [' + note + ']' : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', gif: 'image/gif', ttf: 'font/ttf' };

app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('no-proxy-server');                // the page comes from this very process
app.whenReady().then(async () => {
  const ids = SPRITES ? fs.readdirSync(path.join(SPRITES, 'pokemon')).filter((n) => /^\d+\.png$/.test(n)).map((n) => parseInt(n, 10)).sort((a, b) => a - b) : [];
  const mon = (sp, lvl) => ({ sp, iv: [12, 12, 12, 12, 12, 12], lvl, nat: 3, hp: 30 });
  let port = 0;
  const packed = () => ({
    'locked.json': JSON.stringify({ version: 'test', exported: '2026-11-13T00:00:00Z', gens: [1], hasSave: true, hasBank: false,
      settings: { gens: [1], scale: 1.5, mute: true, paused: true, spriteStyle: 'static', guardian: true, sizeMode: 'sprite', maxWild: 3, autoStart: true, field: true } }),
    'sprites.json': JSON.stringify({ root: '', rootUrl: `http://127.0.0.1:${port}/sprites`, ok: ids.length > 0, idx: { pokemon: ids }, items: { 'poke-ball': true }, extra: { items: ['poke-ball'], icons: null, types: null, badges: [], marks: null, ribbons: null } }),
    'save.json': JSON.stringify({ v: 1, team: [mon(7, 14), mon(25, 12), mon(54, 11)], box: [mon(60, 5)], dex: { caught: { 7: 1, 25: 1, 54: 1, 60: 1 } }, stats: {}, bag: {} }),
  });
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (p.includes('..')) { res.writeHead(403); res.end(); return; }
    const made = packed()[p.replace(/^app\//, '')];
    if (made && p.startsWith('app/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(made); return; }
    const file = p.startsWith('sprites/') ? path.join(SPRITES || APP, p.slice(8)) : p.startsWith('app/') ? path.join(APP, p.slice(4)) : '';
    fs.readFile(file, (err, buf) => { if (err || !file) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file).slice(1)] || 'application/octet-stream' }); res.end(buf); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  const win = new BrowserWindow({ width: 412, height: 860, useContentSize: true, show: true, webPreferences: { backgroundThrottling: true } });
  const wc = win.webContents, js = (code) => wc.executeJavaScript(code, true);
  wc.on('console-message', (e) => { if (process.env.ST_TEST_LOG) console.log('page:', e.message); });
  await win.loadURL(`http://127.0.0.1:${port}/app/android.html?mode=app`);
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const finger = (type, x, y) => wc.debugger.sendCommand('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
  for (let i = 0; i < 80 && !(await js('typeof G !== "undefined" && !!G.save && G.actors.filter((a) => a.side === "team" && !a.await && !a.hops).length >= 3')); i++) await wait(250);
  const team = await js('G.actors.filter((a) => a.side === "team" && !a.await).length');
  ok('the page starts and the team stands on the field', team >= 3, team + ' of 3' + (SPRITES ? '' : ' (no ST_TEST_SPRITES given)'));
  if (team < 1) return done();

  // ---- options
  const s0 = await js('window.st.getSettings()');
  ok('the options the export brought are the start', s0.maxWild === 3 && s0.scale === 1.5 && s0.guardian === true, JSON.stringify({ maxWild: s0.maxWild, guardian: s0.guardian }));
  ok('what means nothing on a phone keeps its one value', s0.autoStart === false && s0.field === false && s0.visible === true);
  const s1 = await js('window.st.setSettings({ maxWild: 7, xpRate: 99, autoStart: true, gens: [1, 2, 5], weatherFixed: "snow", nonsense: 1 })');
  ok('every option can be changed in the app', s1.maxWild === 7 && s1.weatherFixed === 'snow', JSON.stringify({ maxWild: s1.maxWild, weatherFixed: s1.weatherFixed }));
  ok('changes go through the same range checks as on the PC', s1.xpRate === 10 && s1.autoStart === false && !('nonsense' in s1), 'xpRate ' + s1.xpRate);
  ok('only generations whose pictures were packed can be chosen', JSON.stringify(s1.gens) === '[1]', JSON.stringify(s1.gens));
  ok('the options are remembered on the device', JSON.parse(await js('localStorage.getItem("st:settings.json")')).maxWild === 7);
  await js('window.st.setSettings({ weatherFixed: "off" })');

  // ---- the Pokédex frame: Options is there, with the phone's own rows
  await js('document.getElementById("dexKey").click()');
  await wait(1500);
  const dex = await js(`(() => { const d = document.getElementById('dexFrame').contentDocument, vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    const grp = (id) => d.querySelector('#optBody .group[data-group="' + id + '"]');
    return { key: vis(d.querySelector('#keys [data-tab="options"]')), phone: !!grp('phone') && !grp('phone').hidden, android: !grp('android') || grp('android').hidden, field: !grp('field') || grp('field').hidden,
      startup: d.getElementById('autoStart') ? d.getElementById('autoStart').closest('.set').hidden : null, gens: [...d.querySelectorAll('#gens label')].filter((l) => !l.hidden).length, stream: vis(d.getElementById('streamKey')) }; })()`);
  ok('the Pokédex on the phone has the Options key', dex.key === true);
  ok('Options shows the phone\'s rows and hides the PC-only ones', dex.phone && dex.android && dex.field && dex.startup === true && dex.gens === 1 && !dex.stream, JSON.stringify(dex));
  await js('window.stBack()');

  // ---- touch: hold first, then drag (the fault on the owner's phone), then a quick drag
  const pos = () => js('(() => { const a = G.actors.filter((q) => q.side === "team" && !q.await && q.state !== "faint")[0]; return { id: a.id, x: a.x + G.vx, y: a.y + G.vy - a.h * 0.5, ax: a.x, ay: a.y }; })()');
  const where = (id) => js(`(() => { const a = G.actors.find((q) => q.id === ${JSON.stringify(id)}); return { x: a.x, y: a.y, dragging: !!a.dragging }; })()`);
  for (const [name, hold] of [['a finger that rests on a Pokémon first, then moves, drags it', 800], ['a quick drag works too', 0]]) {
    const p = await pos(), dx = p.ax > 200 ? -110 : 110, dy = p.ay > 430 ? -90 : 90;
    await finger('touchStart', p.x, p.y);
    if (hold) await wait(hold);
    const held = await js('window.stTouchState()');
    for (let i = 1; i <= 8; i++) { await finger('touchMove', p.x + (dx * i) / 8, p.y + (dy * i) / 8); await wait(30); }
    const mid = await where(p.id);
    await finger('touchEnd', 0, 0);
    await wait(120);
    const end = await where(p.id), dexOpen = await js('!document.getElementById("dexWrap").hidden');
    ok(name, held === 'hold' && mid.dragging && Math.abs(end.x - p.ax - dx) < 14 && Math.abs(end.y - p.ay - dy) < 14 && !end.dragging && !dexOpen, `moved ${Math.round(end.x - p.ax)}, ${Math.round(end.y - p.ay)} of ${dx}, ${dy}${dexOpen ? '; the Pokédex opened' : ''}`);
    await wait(300);
  }
  { // a blunt finger: a touch a little beside the sprite still takes hold of it
    const p = await pos(), side = await js(`(() => { const a = G.actors.find((q) => q.id === ${JSON.stringify(p.id)}); return Math.max(a.w * a.hit * 0.5, 12) + 6; })()`);
    await finger('touchStart', p.x + side + 12, p.y);
    const held = await js('window.stTouchState()');
    await finger('touchEnd', 0, 0);
    ok('a touch that misses by a little still finds the Pokémon', held === 'hold', held || 'nothing');
  }
  const pets = await js('G.save.stats.pets');
  { const p = await pos(); await finger('touchStart', p.x, p.y); await wait(60); await finger('touchEnd', 0, 0); await wait(100); }
  ok('a tap on a team Pokémon still pets it', (await js('G.save.stats.pets')) === pets + 1);

  // ---- Mewtwo
  await js('window.st.openGuardian()');
  await wait(600);
  const sheet = await js('({ open: !document.getElementById("guardWrap").hidden, rows: document.querySelectorAll("#guardRows div").length, say: document.getElementById("guardSay").textContent })');
  ok('Mewtwo\'s sheet opens and tells about the device', sheet.open && sheet.rows >= 5 && sheet.say.length > 5, sheet.rows + ' rows');
  ok('Back closes the sheet', (await js('window.stBack()')) === true && (await js('document.getElementById("guardWrap").hidden')));

  // ---- screen off: nothing is drawn, the game goes on
  const before = await js('({ now: G.now, steps: window.stBackgroundSteps || 0 })');
  win.hide();
  await wait(6000);
  const after = await js('({ now: G.now, steps: window.stBackgroundSteps || 0, hidden: document.hidden })');
  ok('with nothing drawn (screen off) the game carries on', after.steps > before.steps && after.now - before.now > 3, `${(after.now - before.now).toFixed(1)} game seconds in 6, ${after.steps - before.steps} steps${after.hidden ? '' : ' (the page was not told it is hidden)'}`);
  await js('window.st.setSettings({ bgTrain: false })');
  await wait(1500);
  const off0 = await js('G.now'); await wait(3000);
  ok('with the option off the game waits', (await js('G.now')) - off0 < 0.5);
  win.show();
  done();

  function done() {
    const failed = results.filter((r) => !r).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    server.close(); app.exit(failed ? 1 : 0);
  }
}).catch((e) => { console.error(e); app.exit(1); });
