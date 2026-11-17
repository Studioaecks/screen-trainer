// Screen Trainer — checks for MyStream (mystream.js, stage.html, mystream.html).
//
//   node tools/mystreamcheck.js                         the rules that can be checked by reading: the saved file's
//                                                       shape, which windows may be shown, what the code never does
//   electron --no-sandbox tools/mystreamcheck.js        the same, and then the real program: it opens MyStream, puts a
//                                                       stand-in game window on the stage, sticks a note on, clicks,
//                                                       talks, logs in to a stand-in Twitch, goes live to a stand-in
//                                                       video server, records, closes, opens again
//   (on a machine without a screen:  xvfb-run -a electron --no-sandbox tools/mystreamcheck.js)
//   ST_TEST_SPRITES=<a sprites folder>  gives the game pictures to show; without it the game runs with none.
//
// Nothing here talks to Twitch and nothing is streamed anywhere: the stand-ins run inside this process.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const appDir = path.join(__dirname, '..');
const mystream = require(path.join(appDir, 'mystream.js'));
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

let passed = 0, failed = 0;
const ok = (name, cond, note) => { if (cond) passed++; else failed++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${note !== undefined && note !== '' ? '   [' + note + ']' : ''}`); return !!cond; };

function readingChecks() {
  const S = mystream.sanitize;
  const d = S(null);
  ok('an empty file gives the defaults', d.quality === '720' && d.showTrainer && d.fountain && d.sources.length === 0 && d.notes.length === 0 && d.recMinutes === 30 && d.recSeconds === 1800 && !d.pcSound);
  ok('a recording can be as short as 5 seconds and as long as an hour, on the allowed lengths only', S({ recSeconds: 1 }).recSeconds === 5 && S({ recSeconds: 5 }).recSeconds === 5 && S({ recSeconds: 99999 }).recSeconds === 3600 && S({ recSeconds: 7 }).recSeconds === 5 && S({ recSeconds: 2500 }).recSeconds === 2400 && S({ recSeconds: 'x' }).recSeconds === 1800);
  ok('a layout from 0.6 keeps its length (recMinutes), and recMinutes stays readable for 0.6', S({ recMinutes: 45 }).recSeconds === 2700 && S({ recMinutes: 5 }).recSeconds === 900 && S({ recSeconds: 5 }).recMinutes === 15 && S({ recSeconds: 2700 }).recMinutes === 45);
  const many = S({ sources: Array.from({ length: 30 }, (_, i) => ({ title: 'Game ' + i })), notes: Array.from({ length: 30 }, (_, i) => ({ text: 'n' + i })) });
  ok('at most twelve games and twelve notes', many.sources.length === 12 && many.notes.length === 12);
  ok('every game and note has its own id', new Set([...many.sources, ...many.notes].map((x) => x.id)).size === 24);
  const bad = S({ sources: [{ title: 'Steam' }, { title: 'Friends List' }, { title: 'Screen Trainer Pokédex' }, { title: 'MyStream' }, { title: '' }, { title: 'TBH: Task Bar Hero', x: 99, w: -3, key: 'pink' }], notes: [{ text: '   ' }, { text: 'x'.repeat(500), color: 'black', rot: 90 }] });
  ok('Steam windows and its own windows are dropped from a saved file', bad.sources.length === 1 && bad.sources[0].title === 'TBH: Task Bar Hero');
  ok('places and options are brought into range', bad.sources[0].x <= 1.4 && bad.sources[0].w >= 0.03 && bad.sources[0].key === 'auto' && bad.notes.length === 1 && bad.notes[0].text.length === 160 && bad.notes[0].color === 'yellow' && bad.notes[0].rot === 8);
  ok('secrets in a saved file must be encrypted ones', S({ twitch: { access: 'plain-token', key: 'live_123_abc', refresh: 'e:QUJD' } }).twitch.access === '' && S({ twitch: { key: 'live_123_abc' } }).twitch.key === '' && S({ twitch: { refresh: 'e:QUJD' } }).twitch.refresh === 'e:QUJD');
  ok('the video server must be an https address', S({ twitch: { server: 'http://evil.example/x' } }).twitch.server === '' && S({ twitch: { server: 'https://g.webrtc.live-video.net:4443/v2/offer' } }).twitch.server !== '');
  const steam = ['Steam', 'steam', 'Friends List', 'Steam Settings', 'Steam Big Picture Mode', 'Special Offers', 'Sign in to Steam', 'Counter - Steam', 'Steam - News'];
  ok('Steam windows are recognised', steam.every(mystream.isSteam), steam.filter((t) => !mystream.isSteam(t)).join(', '));
  const games = ['Mini Cozy Room', 'TBH: Task Bar Hero', 'TaskBarHero', 'ASUS Virtual Pet', 'OMNI', 'SteamWorld Dig', 'Steamboat Willie'];
  ok('games are not mistaken for Steam', !games.some(mystream.isSteam), games.filter(mystream.isSteam).join(', '));
  const wins = [{ mediaId: 'window:1:0', title: 'Notepad' }, { mediaId: 'window:2:0', title: 'TBH: Task Bar Hero v1.4' }, { mediaId: 'window:3:0', title: 'Mini Cozy Room' }, { mediaId: 'window:4:0', title: 'Mini Cozy Room', steam: false }];
  const m1 = mystream.matchWindow('Mini Cozy Room', wins, new Set()), m2 = mystream.matchWindow('Mini Cozy Room', wins, new Set(['window:3:0']));
  ok('a remembered game finds its window again', m1 && m1.mediaId === 'window:3:0' && m2 && m2.mediaId === 'window:4:0');
  ok('a title that only changed its version number still matches', (mystream.matchWindow('TBH: Task Bar Hero v1.3', wins, new Set()) || {}).mediaId === 'window:2:0');
  ok('an unknown game matches nothing', mystream.matchWindow('Rusty\'s Retirement', wins, new Set()) === null && mystream.matchWindow('X', wins, new Set()) === null);

  // what the code never does
  const main = read('mystream.js'), booth = read('src/booth.js'), stage = read('src/stage.js'), whip = read('src/whip.js'), stageHtml = read('stage.html'), boothHtml = read('mystream.html');
  ok('only windows are ever listed for capture, never screens', /types: \['window'\]/.test(main) && !/types:[^\]]*screen/.test(main));
  ok('the booth never captures a window or the screen itself', !/chromeMediaSource: 'desktop'/.test(booth) && !/chromeMediaSource: 'screen'/.test(booth) && (booth.match(/getDisplayMedia/g) || []).length === 1);
  ok('the capture handler hands out the stage page only', (main.match(/callback\(/g) || []).length === 2 && /video: stage\.webContents\.mainFrame/.test(main) && !/video: [a-z]*[sS]ources?\[/.test(main));
  ok('the stage captures single windows by their id only (and the Field Dex by its own page)', (stage.match(/getUserMedia/g) || []).length === 2 && /chromeMediaSourceId: mediaId/.test(stage) && /chromeMediaSource: 'tab', chromeMediaSourceId: tab\[3\]/.test(stage) && !/chromeMediaSource: 'screen'/.test(stage));
  ok('what Mewtwo says goes through the mask', /StageHost\.mask\(words, tone\)/.test(read('src/mewtwo.js')) && /body\.stage \.gsay \{ filter: blur/.test(read('stage.css')));
  ok('the stream key stays in the main process', !/Bearer/.test(booth) && !/Bearer/.test(whip) && !/getSecret|stream_key/.test(booth));
  ok('secrets are not part of what the booth is told', /cfg: Object\.assign\(\{\}, cfg, \{ twitch: undefined \}\)/.test(main));
  ok('the stage page loads the game exactly as overlay.html does', (() => { const list = (h) => (h.match(/<script src="src\/[\w-]+\.js">/g) || []).map((s) => s.slice(17, -2)); const o = list(read('overlay.html')), s = list(stageHtml).filter((f) => f !== 'stage.js'); return JSON.stringify(o) === JSON.stringify(s); })());      // (since 0.7 the overlay loads the field, the fountain and its places too: the field window has Fountain Square)
  ok('the stage loads its mask before the game starts', stageHtml.indexOf('src/stage.js') < stageHtml.indexOf('src/overlay.js'));
  ok('the booth page is the only one with the controls', /id="goLive"/.test(boothHtml) && !/goLive|recBtn|streamKey/.test(stageHtml));
  ok('going live takes two clicks', /Sure\? Click again/.test(booth));
}

// ------------------------------------------------------------------ the real program (only under Electron)
async function liveChecks() {
  const { app, BrowserWindow } = require('electron');
  const http = require('http');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mystreamcheck-'));
  const userDir = path.join(tmp, 'user'), recDir = path.join(tmp, 'rec');
  fs.mkdirSync(userDir, { recursive: true }); fs.mkdirSync(recDir, { recursive: true });
  const mon = (sp, lvl) => ({ sp, iv: [12, 12, 12, 12, 12, 12], lvl, nat: 3, hp: 30 });
  fs.writeFileSync(path.join(userDir, 'save.json'), JSON.stringify({ v: 1, team: [mon(7, 14), mon(25, 12), mon(54, 11)], box: [mon(60, 5)], dex: { caught: { 7: 1, 25: 1, 54: 1, 60: 1 } }, stats: {}, bag: {} }));
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({ spritesPath: process.env.ST_TEST_SPRITES || '', firstRun: false, mute: true, spriteStyle: 'static', scale: 2, paused: true }));
  app.setName('Screen Trainer');
  app.setPath('userData', userDir);
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');        // a stand-in microphone

  // ---- the stand-in for Twitch: login with a code, the API, and a video server that answers like a WHIP endpoint
  const seen = { device: 0, polls: 0, approved: false, refreshes: 0, title: null, whipAuth: null, whipDeleted: false, expired: false, keyAsked: 0 };
  let receiver = null;
  const body = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => res(b)); });
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), text = await body(req), form = new URLSearchParams(text), json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const auth = req.headers.authorization || '';
    if (u.pathname === '/oauth2/device') { seen.device++; return json(form.get('client_id') === 'abcdefghij0123456789abcdefghij' && /channel:read:stream_key/.test(form.get('scopes') || '') ? 200 : 400, { device_code: 'dev-1', user_code: 'ABCD-EFGH', verification_uri: base + '/activate?device-code=ABCD-EFGH', expires_in: 600, interval: 1, message: 'invalid client' }); }
    if (u.pathname === '/oauth2/token') {
      if (form.get('grant_type') === 'refresh_token') { seen.refreshes++; seen.expired = false; return json(form.get('refresh_token') === 'refresh-1' ? 200 : 400, { access_token: 'access-2', refresh_token: 'refresh-1', expires_in: 14000 }); }
      seen.polls++;
      return seen.approved && form.get('device_code') === 'dev-1' ? json(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 14000, scope: String(form.get('scopes') || '').split(' ') }) : json(400, { status: 400, message: 'authorization_pending' });
    }
    if (u.pathname === '/oauth2/validate') return json(seen.expired ? 401 : 200, { scopes: ['channel:read:stream_key', 'channel:manage:broadcast', 'chat:read', 'chat:edit'] });
    if (u.pathname.startsWith('/helix/')) {
      if (seen.expired || !/^Bearer access-[12]$/.test(auth) || !req.headers['client-id']) return json(401, { message: 'Invalid OAuth token' });
      if (u.pathname === '/helix/users') return json(200, { data: [{ id: '4242', login: 'tester', display_name: 'Tester' }] });
      if (u.pathname === '/helix/streams/key') { seen.keyAsked++; return json(u.searchParams.get('broadcaster_id') === '4242' ? 200 : 400, { data: [{ stream_key: 'live_4242_SECRETKEYsecretkey' }] }); }
      if (u.pathname === '/helix/channels' && req.method === 'PATCH') { try { const b = JSON.parse(text); if ('title' in b) seen.title = b.title; if ('game_id' in b) seen.game = b.game_id; } catch (e) { seen.title = '?'; } res.writeHead(204); return res.end(); }
      if (u.pathname === '/helix/channels') return json(200, { data: [{ game_id: seen.game || '0', game_name: seen.game === '1111' ? 'Pokémon Stand-in' : 'Just Chatting' }] });
      if (u.pathname === '/helix/streams') return json(200, { data: [{ viewer_count: 7, started_at: new Date(Date.now() - 65 * 60000).toISOString() }] });
      if (u.pathname === '/helix/search/categories') return json(200, { data: [{ id: '1111', name: 'Pokémon Stand-in' }, { id: '2222', name: 'Other ' + u.searchParams.get('query') }] });
      if (u.pathname === '/helix/streams/markers') { seen.markers = (seen.markers || 0) + 1; return json(200, { data: [{ id: 'm1' }] }); }
    }
    if (u.pathname === '/whip' && req.method === 'POST') {
      seen.whipAuth = auth;
      if (auth !== 'Bearer live_4242_SECRETKEYsecretkey' || !/application\/sdp/.test(req.headers['content-type'] || '')) { res.writeHead(401); return res.end('bad key'); }
      const answer = await receiver.webContents.executeJavaScript(`answer(${JSON.stringify(text)})`, true);
      res.writeHead(201, { 'Content-Type': 'application/sdp', Location: '/whip/session-1' });
      return res.end(answer);
    }
    if (u.pathname === '/whip/session-1' && req.method === 'DELETE') { seen.whipDeleted = auth === 'Bearer live_4242_SECRETKEYsecretkey'; res.writeHead(200); return res.end(); }
    res.writeHead(404); res.end();
  });
  server.on('upgrade', (req, sock) => {
    const accept = require('crypto').createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const say = (t) => { const b = Buffer.from(t + '\r\n'); sock.write(Buffer.concat([Buffer.from(b.length < 126 ? [0x81, b.length] : [0x81, 126, b.length >> 8, b.length & 255]), b])); };
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 6) return;
        let len = buf[1] & 127, at = 2;
        if (len === 126) { if (buf.length < 8) return; len = buf.readUInt16BE(2); at = 4; }
        if (buf.length < at + 4 + len) return;
        const mask = buf.subarray(at, at + 4), body = Buffer.from(buf.subarray(at + 4, at + 4 + len)), op = buf[0] & 15;
        buf = buf.subarray(at + 4 + len);
        if (op !== 1) continue;
        for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
        const line = body.toString();
        seen.chat = (seen.chat || []).concat(line);
        if (/^JOIN #tester/.test(line)) { say(':tester.tmi.twitch.tv 366 tester #tester :End of /NAMES list'); say('@badge-info=;color=#1E90FF;display-name=Viewer_One;mod=0 :viewer_one!viewer_one@viewer_one.tmi.twitch.tv PRIVMSG #tester :hello from <b>chat</b>'); }
      }
    });
    sock.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  process.env.ST_TEST = '1';
  process.env.ST_SELFCHECK_DIR = path.join(tmp, 'selfcheck');
  process.env.ST_TEST_TWITCH = JSON.stringify({ device: base + '/oauth2/device', token: base + '/oauth2/token', validate: base + '/oauth2/validate', api: base + '/helix', whip: base + '/whip', chat: base.replace(/^http/, 'ws') + '/chat' });

  require(path.join(appDir, 'main.js'));
  await app.whenReady();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > (ms || 10000)) return null; await sleep(150); } };
  const T = await until(() => global.__stTest && global.__stTest.overlay() && global.__stTest);
  if (!ok('the program starts with its overlay', !!T)) return;
  const js = (w, code) => w.webContents.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await until(() => js(T.overlay(), 'typeof G !== "undefined" && !!G.save'));
  // the stand-in viewer: takes the offer the way Twitch's video server would, and counts what arrives
  receiver = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await receiver.loadURL('data:text/html,<script>let pc,stats={};async function answer(sdp){pc=new RTCPeerConnection();pc.ontrack=()=>{};await pc.setRemoteDescription({type:"offer",sdp});await pc.setLocalDescription(await pc.createAnswer());await new Promise(r=>{if(pc.iceGatheringState==="complete")return r();pc.onicegatheringstatechange=()=>pc.iceGatheringState==="complete"&&r();setTimeout(r,2000)});return pc.localDescription.sdp}async function got(){const o={video:0,audio:0,codec:"",w:0,h:0};const s=await pc.getStats();s.forEach(r=>{if(r.type==="inbound-rtp"&&r.kind==="video"){o.video=r.framesDecoded||r.framesReceived||0;o.w=r.frameWidth||0;o.h=r.frameHeight||0;const c=s.get(r.codecId);o.codec=c?c.mimeType:""}if(r.type==="inbound-rtp"&&r.kind==="audio")o.audio=r.packetsReceived||0});return o}</script>');

  // ---- opening
  const teamBefore = await js(T.overlay(), 'G.save.team.length');
  ok('MyStream opens', await T.openMyStream());
  const ms = T.ms(), stage = ms.stageWindow(), booth = ms.boothWindow();
  ok('the overlay is closed while MyStream is open', !T.overlay() && T.game() === stage);
  ok('the stage is hidden and the booth is shown', stage && !stage.isVisible() && booth && booth.isVisible());
  await until(() => js(stage, 'Stage.ready()')); await until(() => js(booth, 'Booth.ready()'));
  ms._test.setRecDir(recDir);
  const s0 = await js(stage, 'Stage.report()');
  ok('the stage is 1280 x 720 and draws its ground and fountain', s0.w === 1280 && s0.h === 720 && s0.ground && s0.fountain, s0.fountainNote);
  ok('the game moved onto the stage with its save', s0.game && s0.team === teamBefore && teamBefore === 3, `${s0.team} of ${teamBefore}`);
  ok('sprites are sized for the stage', (await js(stage, 'G.set.scale')) < 2 && T.settings().scale === 2, String(await js(stage, 'G.set.scale')));
  ok('what Mewtwo says is masked', s0.mask, s0.maskNote);
  ok('the booth shows the stage picture', !!(await until(async () => { const b = await js(booth, 'Booth.report()'); return b.frames > 5 && b.video[0] === 1280 && b.video[1] === 720; })), JSON.stringify(await js(booth, 'Booth.report()')));
  const grass = async (x, y) => { const img = await stage.webContents.capturePage({ x, y, width: 2, height: 2 }); const b = img.toBitmap(); return [b[2], b[1], b[0]]; };
  // (since 0.7 the ground is the team's, a sixth each: the first of the three is a Water type, so its share, top left, is a pond; the lower half belongs to nobody and stays grass)
  const g0 = await grass(40, 680), g1 = await grass(40, 40);
  ok('the ground is grass (not hidden behind the page)', g0[1] > g0[0] + 30 && g0[1] > g0[2] + 30, g0.join(','));
  ok('and a pond where the Water type of the team has its share of the field', g1[2] > g1[0] + 60 && g1[2] > g1[1] + 30, g1.join(','));

  // ---- a stand-in game window: black background with a red square, as a see-through overlay game arrives
  await js(stage, `window.__stageTestStream = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 200; const g = c.getContext('2d'); let n = 0; setInterval(() => { g.fillStyle = '#000'; g.fillRect(0, 0, 800, 200); g.fillStyle = '#e02020'; g.fillRect(300, 50, 200, 100); g.fillStyle = '#fff'; g.fillRect(n++ % 780, 190, 10, 6); }, 50); return c.captureStream(20); }; 1`);
  ms._test.freezeAttach(true);
  await js(booth, `st.ms.set({ sources: [{ title: 'Stand-in Game', on: true, placed: false }], notes: [{ text: 'Back in 5 minutes!', color: 'pink', x: 0.1, y: 0.1, rot: -4, on: true }] }).then(() => 1)`);
  const src = ms._test.cfg().sources[0];
  ms._test.setAttached({ [src.id]: { mediaId: 'test:1', title: 'Stand-in Game' } });
  const tile = await until(async () => { const r = await js(stage, 'Stage.report()'); const t = r.sources[src.id]; return t && t.live && t.frames > 25 && t; }, 12000);
  ok('a game window is drawn on the stage', !!tile && tile.w === 800 && tile.h === 200, tile ? `${tile.w} x ${tile.h}${tile.gpu ? '' : ', drawn without the graphics card'}` : 'no picture: ' + JSON.stringify((await js(stage, 'Stage.report()')).sources));
  ok('its black background is found and removed', !!tile && tile.key === 'black', tile && tile.key);
  await sleep(600);
  const placed = ms._test.cfg().sources[0];
  ok('a new game is placed on the bottom edge by itself', placed.placed && Math.abs(placed.ar - 4) < 0.05 && placed.y > 0.5 && placed.y + (placed.w * 1280 / placed.ar) / 720 <= 1.001, `x ${placed.x}, y ${placed.y}, w ${placed.w}`);
  const px = (fx, fy) => grass(Math.round((placed.x + placed.w * fx) * 1280), Math.round((placed.y * 720) + (placed.w * 1280 / placed.ar) * fy));
  const inSquare = await px(0.5, 0.5), inEmpty = await px(0.1, 0.3);
  ok('the game shows through, its empty part is grass', inSquare[0] > 180 && inSquare[1] < 80 && inEmpty[1] > inEmpty[0] + 30, `square ${inSquare.join(',')}; empty ${inEmpty.join(',')}`);
  ok('the sticky note is on the stage', (await js(stage, 'document.querySelectorAll("#stNotes .note.pink").length === 1 && document.querySelector("#stNotes .note").textContent')) === 'Back in 5 minutes!');
  // ---- 0.6: the places round the fountain (src/stations.js). The team here: Squirtle, Pikachu, Psyduck; Poliwag in the Box.
  {
    const st = () => js(stage, 'Stations.state()');
    for (let i = 0; i < 30 && !((await st()) || {}).built; i++) await wait(200);
    ok('the Poké Center, the pipe, the Day Care and the trade pads stand round the fountain', (await st()).on && (await js(stage, 'document.querySelectorAll("#stPlaces > .station:not([hidden])").length')) >= 6 && (await js(stage, 'G.blocks.map((b) => b.name).join()')) === 'fountain,column,center,pipe,yard');
    const dropAt = (sp, spot, dy) => js(stage, `(() => { const a = G.actors.find((q) => q.side === 'team' && q.mon.sp === ${sp}); if (!a) return false; const p = Stations.spots()[${JSON.stringify(spot)}]; a.hops = null; a.await = null; a.x = a.tx = p.x; a.y = a.ty = p.y + ${dy || 0}; Stations._test.dropped(a); return true; })()`);
    await js(stage, `(() => { const a = G.actors.find((q) => q.side === 'team' && q.mon.sp === 25); a.mon.hp = 3; a.mon.st = 'par'; })()`);
    await dropAt(25, 'center', 10); await wait(8500);
    const healed = await js(stage, `(() => { const m = G.save.team.find((q) => q.sp === 25); return { hp: m.hp, max: Mon.maxHp(m), st: m.st, busy: Stations.state().patient }; })()`);
    ok('a hurt Pokémon dropped on the Poké Center is mended to full health', healed.hp === healed.max && !healed.st && !healed.busy, JSON.stringify(healed));
    await dropAt(54, 'pipe', -10); await wait(500);
    const piped = await js(stage, '({ team: G.save.team.map((m) => m.sp), box: G.save.box.map((m) => m.sp) })');
    ok('a Pokémon dropped on the pipe goes to the Box', !piped.team.includes(54) && piped.box.includes(54), JSON.stringify(piped));
    await dropAt(7, 'yard', -30); await wait(600);
    const inYard = await js(stage, '({ team: G.save.team.map((m) => m.sp), care: G.save.daycare.mons.map((m) => m.sp), shown: Stations.state().yard })');
    ok('a Pokémon dropped into the Day Care leaves the team and strolls in the yard', !inYard.team.includes(7) && inYard.care.join() === '7' && inYard.shown === 1, JSON.stringify(inYard));
    ok('the last team member cannot be given away', (await dropAt(25, 'pipe', -10)) && (await js(stage, 'G.save.team.length')) === 1);
    // breeding by the rules: Squirtle and Psyduck share an egg group. Two males get no egg; a male and a female do.
    await js(stage, `(() => { const m = G.save.box.pop(); G.save.daycare.mons.push(m); G.save.daycare.mons[0].fem = 0; G.save.daycare.mons[1].fem = 0; })()`); await wait(700);
    ok('two guests that cannot have an egg: the Day Care says so', (await st()).yard === 2 && /prefer to play with other/.test((await st()).say), (await st()).say);
    await js(stage, 'G.save.daycare.mons[1].fem = 1'); await wait(400);
    ok('a male and a female of one egg group get along', /get along/.test((await st()).say), (await st()).say);
    for (let i = 0; i < 80 && !(await st()).egg; i++) { await js(stage, 'Stations._test.hurry()'); await wait(120); }
    ok('and leave an egg after a while', (await st()).egg === true && /egg is waiting/.test((await st()).say));
    await js(stage, `(() => { const p = Stations.spots().yard; G.onDown(p.x, p.y1 - 20, 0); G.onMove(p.x - 300, p.y1 + 200); G.onUp(); })()`); await wait(600);
    const took = await js(stage, '({ team: G.save.team.length, eggs: G.save.eggs.map((e) => [e.mon.sp, e.mon.lvl, e.t]), yardEgg: !!G.save.daycare.egg, shown: Stations.state().carried, room: G.teamRoom() })');
    ok('the egg is carried once it is dragged out: it holds a level 1 Psyduck (the mother\'s first form) and takes a team place', took.team === 1 && took.eggs.length === 1 && took.eggs[0][0] === 54 && took.eggs[0][1] === 1 && took.eggs[0][2] > 57 && took.eggs[0][2] <= 60 && !took.yardEgg && took.shown === 1, JSON.stringify(took));
    ok('nothing on the stage or in the booth shows how long the egg will take', (await js(stage, '[...document.querySelectorAll("body *")].filter((e) => !e.children.length && /egg/i.test(e.textContent)).every((e) => !/\\d/.test(e.textContent))')) === true);
    await js(stage, 'G.save.eggs[0].t = 0.3'); await wait(1800);
    const hatched = await js(stage, '({ team: G.save.team.map((m) => [m.sp, m.lvl]), eggs: G.save.eggs.length, n: G.save.stats.hatched, shown: Stations.state().carried })');
    ok('when its time is up the egg hatches by itself and the Pokémon joins the team', hatched.team.length === 2 && hatched.team[1][0] === 54 && hatched.team[1][1] === 1 && hatched.eggs === 0 && hatched.n === 1 && hatched.shown === 0, JSON.stringify(hatched));
    // trades: asked first, then done on the second drop
    await js(stage, `(() => { const m = Mon.create(64, 30); G.save.team.push(m); G.syncTeam(); })()`); await wait(800);
    await dropAt(64, 'padE'); const asked = (await st()).ask; await wait(300);
    await dropAt(64, 'padE'); await wait(6200);
    const evo = await js(stage, 'G.save.team.map((m) => m.sp)');
    ok('the evolve trade asks first, then sends Kadabra over and back, and it evolves', asked === 'padE' && evo.includes(65) && !evo.includes(64), `asked at ${asked}; team ${evo}`);
    const before = await js(stage, 'G.save.team.map((m) => m.uid)');
    await dropAt(65, 'padM'); const once = await js(stage, 'G.save.team.map((m) => m.uid)'); await wait(300);
    await dropAt(65, 'padM'); await wait(6200);
    const after = await js(stage, '({ uids: G.save.team.map((m) => m.uid), sps: G.save.team.map((m) => m.sp), trades: G.save.stats.trades, dark: !document.getElementById("stTrade").hidden })');
    ok('the mystery trade does nothing on the first drop and swaps the Pokémon on the second', JSON.stringify(once) === JSON.stringify(before) && after.uids.length === before.length && after.uids.filter((u) => !before.includes(u)).length === 1 && !after.sps.includes(65) && after.trades === 1 && !after.dark, JSON.stringify(after.sps));
    await js(stage, `(() => { const s = G.save; s.team = [Mon.create(7, 14), Mon.create(25, 12), Mon.create(54, 11)]; s.box = [Mon.create(60, 5)]; s.daycare = { mons: [], t: 0, egg: null }; G.syncTeam(); G.saveNow(); })()`); await wait(2500);       // as it was, for the checks that follow
  }
  // ---- 0.6: Mega Evolution and Dynamax (src/forms.js). Stand-in pictures exist for Mega Charizard X and Y and Gigantamax Pikachu.
  {
    await js(stage, `(() => { const s = G.save; s.team = [Mon.create(6, 40), Mon.create(25, 30), Mon.create(7, 30)]; G.syncTeam(); G.set.battleStyle = 'ko'; })()`);
    for (let i = 0; i < 40 && !(await js(stage, 'G.actors.filter((a) => a.side === "team" && !a.await && a.nw).length === 3')); i++) await wait(250);
    const opt = await js(stage, 'G.save.team.map((m) => { const o = Forms.option(m); return o.kind + (o.form ? ":" + o.form.id : ""); })');
    ok('what each kind can do: Charizard a Mega Evolution, Pikachu Gigantamax, Squirtle Dynamax', /^mega:1003[45]$/.test(opt[0]) && opt[1] === 'gmax:10199' && opt[2] === 'dmax', opt.join(' '));
    const snap = (sp) => js(stage, `(() => { const a = G.actors.find((q) => q.side === 'team' && q.mon.sp === ${sp}), m = a.mon; return { form: a.form ? a.form.kind : '', name: a.form ? a.form.name : '', types: G.types(a).join(), atk: Mon.stats(m)[3], hp: m.hp, max: Mon.maxHp(m), h: Math.round(a.h), src: a.img ? a.img.src.split('/').pop() : '', glow: a.el.classList.contains('dmax'), bar: Forms.bar(a) }; })()`);
    const c0 = await snap(6);
    await js(stage, `(() => { G.save.dex.caught[143] = 1; G.set.battleStyle = 'ko'; G.trainerTarget = null; const w = G.spawnActor(Mon.create(143, 60), 'wild', 400, 500);      /* (a kind already caught, so the orders want it knocked out whatever the setting says by now) */ w.await = null; w.hops = null; w.x = w.tx = 400; w.y = w.ty = 500; for (const a of G.actors) if (a.side === 'team') { a.charge = a.mon.sp === 6 ? 1 : 0; a.hops = null; a.x = a.tx = 460; a.y = a.ty = 520; } })()`);
    for (let i = 0; i < 60 && !(await js(stage, '!!Forms.active()')); i++) await wait(200);
    await wait(900);
    const c1 = await snap(6);
    ok('fighting to knock out with a full charge, Charizard Mega Evolves: its form\'s types, stats and picture', c1.form === 'mega' && /^Mega Charizard [XY]$/.test(c1.name) && c1.types === (/X$/.test(c1.name) ? '10,16' : '10,3') && c1.atk > c0.atk && /^1003[45]\.png$/.test(c1.src) && c1.hp <= c1.max && c1.bar.on, JSON.stringify(c1));
    await js(stage, 'Forms.active().form.t = 0.05'); await wait(900);
    const c2 = await snap(6);
    ok('and changes back when its time is up, with its charge empty again', c2.form === '' && c2.types === c0.types && c2.atk === c0.atk && c2.src === c0.src && c2.bar.r < 0.1 && !(await js(stage, '!!Forms.active()')), JSON.stringify(c2));
    await js(stage, `(() => { for (const w of G.wilds()) G.removeActor(w); for (const a of G.team()) { a.mon.hp = Mon.maxHp(a.mon); a.hpShown = a.mon.hp; if (a.state === 'faint') { a.state = 'idle'; a.mode = 'roam'; } } G.lastBattle = G.now; })()`); await wait(400);
    const p0 = await snap(25);
    await js(stage, `G.lastBattle = G.now; Forms.start(G.actors.find((q) => q.side === 'team' && q.mon.sp === 25))`); await wait(900);
    const p1 = await snap(25);
    ok('Pikachu Gigantamaxes: its own picture, much larger, health doubled, the red glow', p1.form === 'gmax' && p1.src === '10199.png' && p1.h > p0.h * 1.8 && p1.max === p0.max * 2 && p1.hp === p0.hp * 2 && p1.glow, JSON.stringify(p1));
    await js(stage, 'Forms.end(Forms.active())'); await wait(700);
    const p2 = await snap(25);
    ok('and returns to its size and health', p2.form === '' && p2.max === p0.max && p2.hp === p0.hp && Math.abs(p2.h - p0.h) < 2 && !p2.glow && p2.src === p0.src, JSON.stringify(p2));
    await js(stage, `(() => { for (const w of G.wilds()) G.removeActor(w); G.set.megaDynamax = false; })()`); await wait(300);
    ok('with the option off there is no charge bar and nothing changes', (await snap(7)).bar === null);
    // what a hit looks like, by type, and more of it at "Full chaos"
    const fx = await js(stage, `(() => { const types = Object.keys(FX.TYPE), out = { n: types.length, normal: 0, chaos: 0, shakes: 0, err: '' }; const keep = FX.onShake; FX.onShake = () => { out.shakes++; };
      try { FX.reset(); FX.setIntensity(1); for (const t of types) FX.impact(300, 300, t, { power: 120, crit: true, eff: 2, size: 80 }); out.normal = FX.busy(); FX.reset(); FX.setIntensity(1.8); for (const t of types) { FX.impact(300, 300, t, { power: 120, crit: true, eff: 2, size: 80 }); FX.gather(300, 300, t, 80); } out.chaos = FX.busy();
        FX.reset(); FX.setIntensity(0.5); FX.impact(300, 300, 'fire', { power: 120 }); out.low = FX.busy(); FX.update(0.05); } catch (e) { out.err = String(e.message || e); }
      FX.onShake = keep; FX.reset(); FX.setIntensity(1); return out; })()`);
    ok('every type has its own look for a hit; "Full chaos" shows far more and shakes the scene, "Subtle" nothing extra', !fx.err && fx.n === 18 && fx.normal > 150 && fx.chaos > fx.normal * 1.6 && fx.shakes === 18 && fx.low === 0, JSON.stringify(fx));
    await js(stage, `(() => { const s = G.save; G.set.megaDynamax = true; G.set.battleStyle = 'smart'; s.team = [Mon.create(7, 14), Mon.create(25, 12), Mon.create(54, 11)]; s.box = [Mon.create(60, 5)]; G.syncTeam(); G.saveNow(); })()`); await wait(2500);
  }
  // ---- 0.6: other Trainers and Gym Leaders (src/rivals.js)
  {
    const rs = () => js(stage, 'Rivals.state()');
    const clickMon = (pick, button, twice) => js(stage, `(() => { const R = Rivals.state(); const a = G.wilds().filter((w) => w.rival && !w.gone && w.state !== 'faint')[${pick}]; if (!a) return 0; a.hops = null; a.await = null; const x = a.x, y = a.y - a.h * 0.5; G.onDown(x, y, ${button}); G.onUp(); ${twice ? 'G.onDown(x, y, 0); G.onUp();' : ''} return a.mon.sp; })()`);
    await js(stage, `(() => { for (const w of G.wilds()) G.removeActor(w); G.save.stats.caught = Math.max(1, G.save.stats.caught || 0); G.save.badges = {}; G.command({ type: 'rival', kind: 'trainer' }); })()`);
    for (let i = 0; i < 50 && !(await js(stage, 'G.wilds().filter((w) => w.rival && !w.await && !w.hops && w.nw).length === 6')); i++) await wait(250);
    const strong = () => js(stage, `(() => { for (const a of G.team()) { a.mon.lvl = 80; a.mon.hp = Mon.maxHp(a.mon); a.hpShown = a.mon.hp; if (a.state === 'faint') a.state = 'idle'; } })()`);      // the visitors were sized for the team as it was: now the team cannot lose
    await strong();
    const r0 = await rs();
    ok('a Trainer hops in as a pointer of its own with six Pokémon and says so', !!r0 && r0.kind === 'trainer' && r0.phase === 'wait' && r0.mons === 6 && r0.say.length > 10 && (await js(stage, 'document.querySelectorAll(".rival svg").length')) === 1, JSON.stringify(r0));
    await wait(4000);
    const idle = await js(stage, '({ hurt: G.wilds().filter((w) => w.rival && w.mon.hp < Mon.maxHp(w.mon)).length, fighting: G.team().filter((a) => a.mode === "fight").length, theirs: G.wilds().filter((w) => w.rival && w.aggro).length })');
    ok('nobody starts it: until a click the visitors loiter and the team leaves them alone', idle.hurt === 0 && idle.fighting === 0 && idle.theirs === 0 && (await rs()).phase === 'wait', JSON.stringify(idle));
    const before = await js(stage, 'G.save.team.length + G.save.box.length');
    await clickMon(0, 2); await wait(1200);
    ok('another Trainer\'s Pokémon cannot be caught', (await js(stage, 'G.save.team.length + G.save.box.length')) === before && (await js(stage, 'G.balls.length')) === 0 && (await rs()).phase === 'wait');
    const first = await clickMon(0, 0); await wait(300);
    const r1 = await rs();
    ok('a click on one of them starts the battle and is the leader\'s target', r1.phase === 'battle' && r1.lead === first && (await js(stage, 'G.wilds().filter((w) => w.rival && w.aggro).length')) === 6, JSON.stringify(r1));
    const other = await clickMon(3, 0); await wait(900);
    const r2 = await rs();
    const dbl = await clickMon(3, 0, true); await wait(300);
    const r3 = await rs();
    ok('one click on another does not change the target, a double-click does', r2.lead === first && dbl === other && r3.lead === other, `${first} -> ${r2.lead} -> ${r3.lead}`);
    let fought = false;
    for (let i = 0; i < 30 && !fought; i++) { await wait(300); fought = await js(stage, '(() => { const l = G.leader(); return G.team().filter((a) => a.mode === "fight" && a.target && a.target.rival).length >= 1 && (!l || !l.target || !!l.target.rival); })()'); }
    ok('the team fights them', fought === true);
    await js(stage, 'for (const w of G.wilds()) if (w.rival) { w.mon.hp = 1; }');
    for (let i = 0; i < 120 && (await rs()) && (await rs()).phase === 'battle'; i++) await wait(500);
    const r4 = await rs(), st4 = await js(stage, '({ won: G.save.stats.trainers || 0, badges: Object.keys(G.save.badges || {}).length })');
    ok('knocking all of them out wins the battle (no badge from an ordinary Trainer)', (!r4 || r4.phase === 'leave') && st4.won === 1 && st4.badges === 0, JSON.stringify([r4 && r4.phase, st4]));
    for (let i = 0; i < 30 && (await rs()); i++) await wait(300);
    ok('the next badge to win is the first, the Boulder Badge', (await js(stage, '(Honors.nextGym(G.save) || {}).id')) === 1);
    await js(stage, `(() => { for (const a of G.team()) { a.mon.hp = Mon.maxHp(a.mon); if (a.state === 'faint') a.state = 'idle'; } G.command({ type: 'rival', kind: 'gym' }); })()`);
    for (let i = 0; i < 50 && !(await js(stage, 'G.wilds().filter((w) => w.rival && !w.await && !w.hops && w.nw).length === 2')); i++) await wait(250);
    await strong();
    const g0 = await rs();
    ok('a Gym Leader comes for it: Brock with Geodude and Onix, with a line of his own', !!g0 && g0.kind === 'gym' && g0.name === 'Gym Leader Brock' && g0.badge === 1 && g0.mons === 2 && /rock/i.test(g0.say), JSON.stringify(g0));
    await clickMon(0, 0); await js(stage, 'for (const w of G.wilds()) if (w.rival) { w.mon.hp = 1; }');
    for (let i = 0; i < 120 && (await rs()) && (await rs()).phase === 'battle'; i++) await wait(500);
    const b1 = await js(stage, '({ badge: !!(G.save.badges || {})[1], gyms: G.save.stats.gyms || 0, next: (Honors.nextGym(G.save) || {}).id || 0, view: Honors.badgeView(G.save)[0].text })');
    ok('beating him earns the Boulder Badge, and the next leader in line is no longer Brock', b1.badge && b1.gyms === 1 && b1.next !== 1 && /Brock/.test(b1.view), JSON.stringify(b1));
    for (let i = 0; i < 30 && (await rs()); i++) await wait(300);
    await js(stage, `G.command({ type: 'rival', kind: 'trainer' })`); await wait(1500);
    await js(stage, 'Rivals.update(200)'); await wait(600);
    ok('a Trainer nobody battles moves on after a while', ((await rs()) || { phase: 'leave' }).phase === 'leave');
    for (let i = 0; i < 30 && (await rs()); i++) await wait(300);
    await js(stage, `(() => { const s = G.save; for (const w of G.wilds()) G.removeActor(w); s.team = [Mon.create(7, 14), Mon.create(25, 12), Mon.create(54, 11)]; s.box = [Mon.create(60, 5)]; G.syncTeam(); G.saveNow(); })()`); await wait(2500);
  }
  // ---- 0.6: the Field Dex as something on the stage, with folder paths blurred while MyStream is open
  {
    const T = global.__stTest; T.openPanel('party');
    for (let i = 0; i < 40 && !(T.panel() && !T.panel().webContents.isLoading()); i++) await wait(250);
    await wait(1200);
    await js(booth, `st.ms.view().then((v) => { const c = v.cfg; c.sources.push({ title: 'My Field Dex', on: true, placed: false }); return st.ms.set({ sources: c.sources }); })`);
    const dexSrc = ms._test.cfg().sources.find((x) => x.title === 'My Field Dex');
    ok('the Field Dex is offered in the list of windows while it is open', (await ms._test.listWindows(false)).some((w) => w.dex && w.title === 'My Field Dex'));
    ms._test.setAttached({ [src.id]: { mediaId: 'test:1', title: 'Stand-in Game' }, [dexSrc.id]: { mediaId: 'tab:dex', title: 'My Field Dex' } });
    await ms._test.attach();
    let dexTile = null;
    for (let i = 0; i < 40; i++) { await wait(500); const r = await js(stage, 'Stage.report()'); const id = (ms._test.cfg().sources.find((x) => x.title === 'My Field Dex') || {}).id; dexTile = r && r.sources && r.sources[id]; if (dexTile && dexTile.live && dexTile.frames > 3) break; }
    ok('the Field Dex can be put on the stage like a game', !!dexTile && dexTile.live && dexTile.w > 200, dexTile ? `${dexTile.w} x ${dexTile.h}, ${dexTile.frames} pictures${dexTile.error ? ', ' + dexTile.error : ''}` : 'no tile');
    const blur = await T.panel().webContents.executeJavaScript(`(() => { const p = document.querySelector('#saveDir'), t = document.querySelector('#partyEntry'); return { on: document.body.classList.contains('onstream'), path: p ? getComputedStyle(p).filter : '', team: t ? getComputedStyle(t).filter : '' }; })()`, true);
    ok('while MyStream is open the Field Dex blurs folder paths, never the team', blur.on && /blur/.test(blur.path) && blur.team === 'none', JSON.stringify(blur));
    const pj = (c) => T.panel().webContents.executeJavaScript(c, true);
    await pj(`document.getElementById('boxToggle').click()`); await wait(1800);
    await pj(`(() => { const c = document.querySelector('#boxGrid [data-uid]'); if (c) c.click(); })()`); await wait(700);
    const bx = await pj(`({ screen: document.querySelector('.screen.on').id, name: (document.querySelector('#partyEntry h3 .name-edit') || {}).textContent, add: !!document.querySelector('#partyEntry [data-act="unbox"]'), hints: document.querySelectorAll('#partyEntry [title]').length, foot: document.getElementById('boxInfo').textContent.length })`);
    ok('a Pokémon chosen in the Box is shown on the main screen, with a hint on every part', bx.screen === 'party' && bx.name === 'Poliwag' && bx.add && bx.hints >= 25 && bx.foot < 260, JSON.stringify(bx));
    await wait(4500);                                       // the Pokédex window is wider now: its picture on the stage follows
    const wide = (await js(stage, 'Stage.report()')).sources[dexSrc.id];
    ok('the Field Dex on the stage follows when the Box slides out', !!wide && wide.live && wide.w > 900, wide ? `${wide.w} x ${wide.h}` : 'no tile');
    await js(booth, `st.ms.view().then((v) => st.ms.set({ sources: v.cfg.sources.filter((x) => x.title !== 'My Field Dex') }))`);
    ms._test.setAttached({ [src.id]: { mediaId: 'test:1', title: 'Stand-in Game' } });
    T.panel().close();
    await wait(400);
  }
  // ---- 0.6: notes under the Pokémon, the fountain in three layers that nobody walks through, dark panels of a game kept
  const zs = () => js(stage, '(() => { const z = (el) => (el ? +getComputedStyle(el).zIndex : NaN), g = [...document.querySelectorAll("body > .stLayer")].find((l) => l.querySelector(".src")); return { root: z(document.getElementById("root")), places: z(document.getElementById("stPlaces")), notes: z(document.getElementById("stNotes")), game: z(g), screen: z(document.getElementById("screen")) }; })()');
  const z0 = await zs();
  ok('sticky notes lie under the Pokémon and the fountain, and over the games behind', z0.notes < z0.root && z0.notes < z0.places && z0.notes > z0.game, JSON.stringify(z0));
  ok('to begin with: a game at the back, then the fountain and its places, my Pokémon in front', z0.game < z0.places && z0.places < z0.root && z0.root < z0.screen, JSON.stringify(z0));
  {
    const ord0 = ms._test.cfg().order.slice(), gid = ms._test.cfg().sources[0].id;
    ok('the games list shows an order number for my Pokémon, the fountain and every game', JSON.stringify(await js(booth, '[...document.querySelectorAll("#builtin .ord input, #sources .ord input")].map((i) => +i.value)')) === '[1,2,3]');
    await js(booth, `document.querySelector('#sources .ord button[data-ord="up"]').click()`); await wait(500);
    const z1 = await zs();
    ok('an arrow moves a game one step forward: now between the fountain and my Pokémon', ms._test.cfg().order.join() === ['fountain', gid, 'trainer'].join() && z1.places < z1.game && z1.game < z1.root, ms._test.cfg().order.join());
    await js(booth, `(() => { const i = document.querySelector('#builtin .ord input[data-key="fountain"]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait(500);
    const z2 = await zs();
    ok('typing 1 puts the fountain in front of everything', ms._test.cfg().order[2] === 'fountain' && z2.places > z2.root && z2.places > z2.game && z2.notes < z2.root, ms._test.cfg().order.join());
    await js(booth, `st.ms.set({ order: ${JSON.stringify(ord0)} })`); await wait(400);
  }
  const ft = await js(stage, '({ layers: document.querySelectorAll("#stPlaces > .fountain").length, z: [...document.querySelectorAll("#stPlaces > .fountain")].map((e) => +e.style.zIndex), blocks: (G.blocks || []).map((b) => b.name) })');
  ok('the fountain stands in three layers, back to front', ft.layers === 3 && ft.z[0] < ft.z[1] && ft.z[1] < ft.z[2] && ft.blocks.slice(0, 2).join() === 'fountain,column', JSON.stringify(ft));
  await js(stage, `(() => { const b = G.blocks[0]; window.__fb = b; for (const a of G.actors) if (a.side === 'team' && !a.await) { a.hops = null; a.x = a.tx = b.x + (a.mon.sp === 25 ? -30 : 40)       /* Pikachu is the one that is not a Water type */; a.y = a.ty = b.y + 4; } })()`);
  await wait(2500);
  const feet = await js(stage, `G.actors.filter((a) => a.side === 'team' && !a.await).map((a) => ({ sp: a.mon.sp, q: +(((a.x - __fb.x) / __fb.rx) ** 2 + ((a.y - __fb.y) / __fb.ry) ** 2).toFixed(2) }))`);
  ok('nobody stands in the stone: a Pokémon put into the fountain is eased out to its edge', feet.filter((f) => f.sp === 25).length > 0 && feet.filter((f) => f.sp === 25).every((f) => f.q >= 0.9), JSON.stringify(feet));
  ok('a Water type may stay in the basin', feet.some((f) => f.sp !== 25 && f.q < 0.9), JSON.stringify(feet.filter((f) => f.sp !== 25)));
  const mk = await js(stage, `(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 400, 240);
    g.fillStyle = '#c8a050'; g.fillRect(100, 60, 200, 120); g.fillStyle = '#050505'; g.fillRect(112, 72, 176, 96);      // a game's panel: a frame with a dark inside
    const m = window.__stageMask(c, 'black'); return { outside: m.at(40, 40), frame: m.at(104, 120), inside: m.at(200, 120) }; })()`);
  ok('only background joined to the edge is taken out: the dark inside of a game\'s panel stays', mk.outside === 255 && mk.frame === 0 && mk.inside === 0, JSON.stringify(mk));
  ok('the booth is told where the note and the game are', await until(async () => { const v = await js(booth, 'st.ms.view()'); return Object.keys(v.noteRects).length === 1 && v.attached[src.id] === 'Stand-in Game' && v.sources[src.id] && v.sources[src.id].live; }));

  // ---- pointer: clicks on the booth's picture arrive on the stage at the same spot
  await js(stage, 'window.__clicks = []; window.addEventListener("mousedown", (e) => window.__clicks.push([e.clientX, e.clientY, e.button]), true); 1');
  const viewBox = await js(booth, '(() => { const r = document.getElementById("view").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()');
  const at = (fx, fy) => ({ x: Math.round(viewBox.x + viewBox.w * fx), y: Math.round(viewBox.y + viewBox.h * fy) });
  const click = (p, button) => { booth.webContents.sendInputEvent({ type: 'mouseMove', ...p }); booth.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: button || 'left', clickCount: 1 }); booth.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: button || 'left', clickCount: 1 }); };
  click(at(0.25, 0.75)); await sleep(400); click(at(0.75, 0.25), 'right'); await sleep(400);
  const clicks = await js(stage, 'window.__clicks');
  ok('a click on the picture reaches the stage at the same place', clicks.length === 2 && Math.abs(clicks[0][0] - 320) <= 4 && Math.abs(clicks[0][1] - 540) <= 4 && clicks[0][2] === 0 && Math.abs(clicks[1][0] - 960) <= 4 && clicks[1][2] === 2, JSON.stringify(clicks));
  ok('the picture keeps its 16:9 shape in the window', Math.abs(viewBox.w / viewBox.h - 16 / 9) < 0.01, `${Math.round(viewBox.w)} x ${Math.round(viewBox.h)}`);

  // ---- "Move things": dragging the game in the booth moves it on the stage; resizing the booth moves nothing
  await js(booth, 'document.querySelector(\'#mode [data-mode="arrange"]\').click(); 1'); await sleep(200);
  const hb = await js(booth, '(() => { const h = document.querySelector("#edit .h.src"); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, n: document.querySelectorAll("#edit .h").length }; })()');
  ok('games and notes get a frame to drag', !!hb && hb.n === 2, hb && hb.n);
  if (hb) {
    const p0 = { x: Math.round(hb.x), y: Math.round(hb.y) }, p1 = { x: p0.x, y: p0.y - Math.round(viewBox.h * 0.3) };
    booth.webContents.sendInputEvent({ type: 'mouseMove', ...p0 }); booth.webContents.sendInputEvent({ type: 'mouseDown', ...p0, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i++) { booth.webContents.sendInputEvent({ type: 'mouseMove', x: p0.x, y: Math.round(p0.y + ((p1.y - p0.y) * i) / 6), modifiers: ['leftButtonDown'] }); await sleep(40); }
    booth.webContents.sendInputEvent({ type: 'mouseUp', ...p1, button: 'left', clickCount: 1 }); await sleep(500);
    const moved = ms._test.cfg().sources[0];
    ok('dragging a game moves it on the stage', Math.abs(moved.y - (placed.y - 0.3)) < 0.03 && Math.abs(moved.x - placed.x) < 0.01, `y ${placed.y} -> ${moved.y}`);
    const before = JSON.stringify(ms._test.cfg().sources) + JSON.stringify(ms._test.cfg().notes);
    const b0 = booth.getBounds(); booth.setBounds({ x: b0.x, y: b0.y, width: 820, height: 560 }); await sleep(700);
    const small = await js(booth, '(() => { const r = document.getElementById("view").getBoundingClientRect(); return r.width / r.height; })()');
    ok('resizing the booth changes nothing on the stage', JSON.stringify(ms._test.cfg().sources) + JSON.stringify(ms._test.cfg().notes) === before && Math.abs(small - 16 / 9) < 0.01 && (await js(stage, 'innerWidth')) === 1280);
    booth.setBounds(b0); await sleep(300);
  }
  await js(booth, 'document.querySelector(\'#mode [data-mode="play"]\').click(); 1');

  // ---- the talk button
  await js(booth, 'Booth._test.setTalking(true).then(() => 1)'); await sleep(500);
  const t1 = await js(booth, 'Booth.report()'), badge1 = await js(stage, '!document.getElementById("stMic").hidden');
  await js(booth, 'Booth._test.setTalking(false).then(() => 1)'); await sleep(300);
  const badge2 = await js(stage, '!document.getElementById("stMic").hidden');
  ok('talking opens the microphone and shows viewers the sign', t1.talking && t1.mic === 'open' && badge1 === true);
  ok('letting go closes it again', badge2 === false && !(await js(booth, 'Booth.report()')).talking);

  // ---- Twitch: login with a code (stand-in), the stream key, where the secrets end up
  const v1 = await js(booth, 'st.ms.twClient("abcdefghij0123456789abcdefghij").then(() => st.ms.twLogin())');
  ok('the login starts and shows a code', v1 && v1.ok && v1.code === 'ABCD-EFGH' && seen.device === 1, JSON.stringify(v1));
  await sleep(2500);
  ok('nothing is logged in before the code is approved', seen.polls >= 1 && !(await js(booth, 'st.ms.view()')).twitch.connected);
  seen.approved = true;
  const v2 = await until(async () => { const v = await js(booth, 'st.ms.view()'); return v.twitch.connected && v.twitch.hasKey && v; }, 9000);
  ok('after approving, MyStream is logged in and has the stream key', !!v2 && v2.twitch.name === 'Tester' && v2.twitch.keyFrom === 'login');
  const viewText = JSON.stringify(await js(booth, 'st.ms.view()')), onDisk = fs.readFileSync(path.join(userDir, 'mystream.json'), 'utf8');
  ok('the booth is never told a token or the key', !/access-1|refresh-1|SECRETKEY/.test(viewText));
  ok('no token and no key is on disk in the clear', !/access-1|refresh-1|SECRETKEY/.test(onDisk));

  // ---- 0.6: chat and the stream's desk, against the stand-ins
  {
    const wait2 = (ms2) => new Promise((r) => setTimeout(r, ms2));
    const vc = await until(async () => { const v = await js(booth, 'st.ms.view()'); return v.chat.state === 'on' && v; }, 9000);
    ok('chat connects with the login and may write', !!vc && vc.chat.canSend && vc.chat.channel === 'tester' && (seen.chat || []).some((l) => l === 'PASS oauth:access-1') && (seen.chat || []).some((l) => l === 'NICK tester'), JSON.stringify(vc && vc.chat));
    await wait2(600);
    const shown = await js(booth, '(() => { const r = document.querySelector("#chatLog .cl"); return r ? { who: r.querySelector("b").textContent, color: r.querySelector("b").style.color, text: r.querySelector("span").textContent, tags: r.querySelectorAll("span b").length } : null; })()');
    ok('a viewer\'s line shows in the booth, as plain text', !!shown && shown.who === 'Viewer_One' && shown.text === 'hello from <b>chat</b>' && shown.tags === 0 && /30, 144, 255|1e90ff/i.test(shown.color), JSON.stringify(shown));
    ok('chat is nowhere on the stage', !/hello from/.test(await js(stage, 'document.body.innerText')));
    await js(booth, `(() => { document.getElementById('chatIn').value = 'thanks for watching'; document.getElementById('chatGo').click(); })()`); await wait2(700);
    ok('a line written in the booth goes to chat', (seen.chat || []).includes('PRIVMSG #tester :thanks for watching') && (await js(booth, 'document.querySelectorAll("#chatLog .cl.me").length')) === 1);
    ok('the token is not told to the booth through chat either', !/access-1/.test(JSON.stringify(await js(booth, 'st.ms.chatLines()'))));
    const d1 = await js(booth, 'st.ms.deskRefresh()');
    await js(booth, 'document.querySelector(\'.key[data-tab="live"]\').click()');
    const deskHtml = await until(async () => { const h = await js(booth, 'document.getElementById("deskLine").innerHTML'); return /LIVE/.test(h) && h; }, 4000);
    ok('the desk shows that the stream is live, the viewers and the category', !!d1 && d1.live && d1.viewers === 7 && d1.game === 'Just Chatting' && /LIVE<\/b> 7 viewers, for 1 h 5 min/.test(deskHtml || ''), String(deskHtml).slice(0, 120));
    const hits = await js(booth, 'st.ms.deskSearch("pokemon")');
    ok('categories can be searched and set', Array.isArray(hits) && hits[0].id === '1111' && (await js(booth, 'st.ms.deskGame("1111")')) === true && seen.game === '1111' && (await js(booth, 'st.ms.view()')).desk.game === 'Pokémon Stand-in');
    ok('a marker can be added, and odd input is refused', (await js(booth, 'st.ms.deskMarker("nice catch")')).ok === true && seen.markers === 1 && (await js(booth, 'st.ms.deskGame("1; drop")')) === false);
    ok('the Stream Manager button leads to Twitch\'s own page for this channel', (await js(booth, 'st.ms.deskOpen("manager")')) === 'https://dashboard.twitch.tv/u/tester/stream-manager');
  }

  // ---- going live to the stand-in video server
  await js(booth, 'st.ms.set({ title: "Chill idle stream" }).then(() => 1)');
  await js(booth, 'Booth._test.liveButton().then(() => 1)');
  ok('one click does not go live yet', (await js(booth, 'Booth._test.state()')).sure === true && !(await js(booth, 'Booth._test.state()')).liveWanted && seen.whipAuth === null);
  await js(booth, 'Booth._test.liveButton().then(() => 1)');
  const liveOk = await until(async () => (await js(booth, 'Booth._test.state()')).liveState === 'live', 15000);
  ok('the second click goes live', !!liveOk && seen.whipAuth === 'Bearer live_4242_SECRETKEYsecretkey' && ms.isLive(), seen.whipAuth ? 'the server got the key' : 'the server was never asked: ' + JSON.stringify(await js(booth, 'Booth._test.state()')));
  if (!liveOk) throw new Error('not live: the checks that need a stream are skipped');
  const r1 = await until(async () => { const r = await js(receiver, 'got()'); return r.video > 10 && r.audio > 10 && r; }, 15000);
  ok('the viewer receives H.264 video and sound', !!r1 && /h264/i.test(r1.codec), r1 ? `${r1.codec} ${r1.w} x ${r1.h}, ${r1.video} pictures, ${r1.audio} sound packets` : JSON.stringify(await js(receiver, 'got()')));
  ok('the stream title is set on Twitch', seen.title === 'Chill idle stream', String(seen.title));
  booth.minimize(); await sleep(400);
  const m0 = (await js(receiver, 'got()')).video; await sleep(2500); const m1b = (await js(receiver, 'got()')).video;
  ok('minimising the booth does not stop the stream', m1b - m0 > 20, `${m1b - m0} pictures in 2.5 s`);
  booth.restore(); await sleep(300);
  // an expired login is renewed without the owner noticing
  seen.expired = true; const keyAsked = seen.keyAsked;
  const ready2 = await js(booth, 'st.ms.liveReady()');
  ok('an expired login renews itself', ready2 && ready2.ok && seen.refreshes >= 1 && seen.keyAsked > keyAsked);

  // ---- recording while live
  const rec = await js(booth, 'Booth.testRecord(4)');
  const recFile = rec && rec.file;
  ok('a recording is written while live', !!rec && rec.ok && rec.bytes > 30000 && fs.existsSync(recFile) && path.dirname(recFile) === recDir, rec ? `${rec.bytes} bytes, ${rec.type}` : 'nothing');
  if (recFile && fs.existsSync(recFile)) {
    let probe = '';
    try { probe = require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', recFile], { encoding: 'utf8' }); } catch (e) { probe = ''; }
    if (probe) { const j = JSON.parse(probe), v = (j.streams || []).find((s) => s.codec_type === 'video'), a = (j.streams || []).find((s) => s.codec_type === 'audio'); ok('the video file is a real video with sound', !!v && !!a && v.width === 1280 && v.height === 720 && +j.format.duration > 2.5, v ? `${v.codec_name} ${v.width} x ${v.height}, ${a ? a.codec_name : 'no sound'}, ${(+j.format.duration).toFixed(1)} s` : 'no video stream'); }
    else console.log('      (ffprobe is not installed here: the video file was not looked into)');
  }
  await js(booth, 'Booth._test.endLive().then(() => 1)'); await sleep(500);
  ok('ending the stream tells the video server', seen.whipDeleted && !ms.isLive());

  // ---- closing and opening again: the game goes back to the overlay, the layout is remembered
  const layout = JSON.stringify(ms._test.cfg().sources.map((s) => [s.title, s.on, s.x, s.y, s.w])) + JSON.stringify(ms._test.cfg().notes.map((n) => [n.text, n.color, n.x, n.y]));
  await ms.close();
  const back = await until(() => T.overlay() && js(T.overlay(), 'typeof G !== "undefined" && !!G.save && G.save.team.length'));
  ok('closing MyStream brings the game back to the overlay', back === teamBefore && !ms.isOpen() && T.game() === T.overlay());
  const saved = JSON.parse(fs.readFileSync(path.join(userDir, 'save.json'), 'utf8'));
  ok('the save went along both ways', saved.team.length === teamBefore && saved.v === 1);
  await T.openMyStream();
  const again = T.ms();
  await until(() => js(again.stageWindow(), 'Stage.ready()'));
  ok('the layout of last time is back', JSON.stringify(again._test.cfg().sources.map((s) => [s.title, s.on, s.x, s.y, s.w])) + JSON.stringify(again._test.cfg().notes.map((n) => [n.text, n.color, n.x, n.y])) === layout);
  ok('the note is on the stage again', !!(await until(() => js(again.stageWindow(), 'document.querySelectorAll("#stNotes .note").length === 1'))));
  ok('a game that is not running leaves the stage as it is', (await js(again.stageWindow(), 'Stage.report()')).sources[src.id] ? !(await js(again.stageWindow(), 'Stage.report()')).sources[src.id].live : true);
  ok('the login was remembered', (await js(again.boothWindow(), 'st.ms.view()')).twitch.connected === true || !require('electron').safeStorage.isEncryptionAvailable(), require('electron').safeStorage.isEncryptionAvailable() ? 'encrypted on disk' : 'this machine cannot encrypt: kept for one session only');
  if (process.env.ST_TEST_PICTURES) { try { fs.mkdirSync(process.env.ST_TEST_PICTURES, { recursive: true }); again._test.freezeAttach(true); await js(again.stageWindow(), `window.__stageTestStream = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 200; const g = c.getContext('2d'); setInterval(() => { g.fillStyle = '#000'; g.fillRect(0, 0, 800, 200); g.fillStyle = '#e02020'; g.fillRect(300, 50, 200, 100); }, 100); return c.captureStream(10); }; 1`); again._test.setAttached({ [src.id]: { mediaId: 'test:1', title: 'Stand-in Game' } }); await sleep(2500); for (const tab of ['games', 'notes', 'live', 'record', 'options']) { await js(again.boothWindow(), `Booth._test.show('${tab}'); 1`); await sleep(500); fs.writeFileSync(path.join(process.env.ST_TEST_PICTURES, `booth-${tab}.png`), (await again.boothWindow().webContents.capturePage()).toPNG()); } await js(again.boothWindow(), 'document.querySelector(\'#mode [data-mode="arrange"]\').click(); 1'); await sleep(400); fs.writeFileSync(path.join(process.env.ST_TEST_PICTURES, 'booth-arrange.png'), (await again.boothWindow().webContents.capturePage()).toPNG()); fs.writeFileSync(path.join(process.env.ST_TEST_PICTURES, 'stage.png'), (await again.stageWindow().webContents.capturePage()).toPNG()); } catch (e) { console.log('      (pictures: ' + e.message + ')'); } }
  await again.close();
  server.close();
}

(async () => {
  readingChecks();
  if (process.versions.electron) { try { await liveChecks(); } catch (e) { ok('the live checks ran to the end', false, String((e && e.stack) || e).slice(0, 600)); } }
  else console.log('\n(run this file with Electron to check the real program as well; see the top of the file)');
  console.log(`\n${passed} passed, ${failed} failed`);
  if (process.versions.electron) require('electron').app.exit(failed ? 1 : 0); else process.exit(failed ? 1 : 0);
})();
