// Screen Trainer — checks for online visiting (0.8).
//
//   node tools/onlinecheck.js
//       the part without windows: the notes two players leave each other (onlinenet.js), against two stand-in
//       message boards on this computer, and what the program accepts from a stranger (online.js).
//   xvfb-run -a electron --no-sandbox tools/onlinecheck.js      (with ST_TEST_SPRITES, as for tools/v07check.js)
//       the real program visiting itself through a stand-in board: the picture arrives, the pointer shows on the
//       stage, a click lands, a catch is shared, the fountain's ball sends the visitor home.
//
// Nothing here talks to a public board or to anybody else.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const APP = path.join(__dirname, '..');
const inElectron = !!process.versions.electron;

const results = [];
const ok = (name, good, detail) => { results.push({ name, ok: !!good }); console.log(`${good ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`); return !!good; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SDP = (label) => 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:1 1 udp 2 203.0.113.7 5000 typ host\r\na=label:' + label + '\r\n';

async function headless() {
  const N = require(path.join(APP, 'onlinenet.js'));
  const Board = require(path.join(APP, 'tools', 'standin-board.js'));

  // ---- the wire format
  {
    const long = 'x'.repeat(300), pk = N.P.publish('a/b', long);
    const [one, rest] = N.parse(Buffer.concat([pk, pk.subarray(0, 5)]));
    ok('a note longer than 127 bytes is packed and read back, and half a packet waits for its other half', one.length === 1 && one[0].type === 3 && one[0].body.length === 2 + 3 + 300 && rest.length === 5);
    let threw = false; try { N.parse(Buffer.from([0x30, 0xff, 0xff, 0xff, 0xff, 0x01])); } catch (e) { threw = true; }
    ok('a packet that claims no end is refused', threw);
  }
  // ---- codes and seals
  {
    const code = N.newCode();
    ok('a friend code is ten characters nobody misreads', code.length === 10 && [...code].every((c) => N.CODE_ABC.includes(c)) && N.validCode(N.showCode(code).toLowerCase()) && !N.validCode('ABC'), N.showCode(code));
    ok('the room name of a code tells nothing of the code, and is the same on both sides', N.roomOf(code) === N.roomOf(' ' + N.showCode(code).toLowerCase()) && !N.roomOf(code).includes(code) && N.roomOf(code) !== N.roomOf(N.newCode()));
    const a = N.keypair(), b = N.keypair(), ka = a.secret(b.pub, 's'), kb = b.secret(a.pub, 's'), sealed = N.seal(ka, { hello: 'there' });
    let broke = false; try { N.unseal(kb, sealed.slice(0, 20) + (sealed[20] === 'A' ? 'B' : 'A') + sealed.slice(21)); } catch (e) { broke = true; }
    let wrong = false; try { N.unseal(N.keypair().secret(a.pub, 's'), sealed); } catch (e) { wrong = true; }
    ok('two key pairs agree on a seal that only they can open, and a changed seal does not open', ka.equals(kb) && N.unseal(kb, sealed).hello === 'there' && broke && wrong);
    ok('an identity is shown as a tag and a number, never as itself', /^[0-9a-f]{16}$/.test(N.tagOf('me')) && N.tagOf('me') !== N.tagOf('you') && /^\d{4}$/.test(N.numberOf(N.tagOf('me'))));
  }

  // ---- two boards, a host, visitors and somebody listening in
  const b1 = await Board.start(), b2 = await Board.start(), urls = [b1.url, b2.url];
  const mk = () => { const n = N.net(urls); n.open(); return n; };
  const spy = N.board(b1.url, { onNote: () => {} }); spy.open(); spy.subscribe(['#']);
  const hostNet = mk(), code = N.newCode();
  const state = { mode: 'friends', free: 3, blockedTags: new Set(), offers: [], answer: true, self: false };
  const H = N.host({ net: hostNet, code, pid: 'host-identity', mode: () => state.mode, me: () => ({ cls: 4, cursor: 2 }), free: () => state.free, blocked: (t) => state.blockedTags.has(t),
    offer: async (q) => { state.offers.push(q); return state.answer ? SDP('answer-for-' + q.vid) : null; } });
  ok('the boards are reached', await hostNet.ready(5000) && hostNet.up() === 2, hostNet.states().map((s) => s.state).join(' '));
  H.start();
  await sleep(300);
  const visitor = (pid, extra) => { const n = mk(); return { n, g: N.guest(Object.assign({ net: n, pid, pace: 0.12, me: () => ({ cls: 7, cursor: 1 }), offer: async () => SDP('offer-of-' + pid) }, extra || {})) }; };

  const v1 = visitor('alice');
  const r1 = await v1.g.visit({ code });
  ok('a friend with the code is let in: offer there, answer back', r1.ok && /answer-for-/.test(r1.sdp) && state.offers.length === 1 && /offer-of-alice/.test(state.offers[0].sdp) && state.offers[0].friend === true, r1.ok ? '' : r1.why);
  ok('each side learns the other\'s tag, class and pointer, nothing else', r1.ok && r1.host.tag === H.tag && r1.host.cls === 4 && r1.host.cursor === 2 && state.offers[0].tag === v1.g.tag && state.offers[0].cls === 7 && state.offers[0].cursor === 1 && Object.keys(r1.host).sort().join() === 'cls,cursor,tag');
  await sleep(200);
  ok('a note that reaches both boards is acted on once', state.offers.length === 1 && b1.notes.length > 0 && b2.notes.length === b1.notes.length, `${b1.notes.length} notes on each board`);
  const all = b1.notes.map((n) => n.text).join('\n');
  ok('nobody reading the boards sees an address, an offer or the code', !/candidate|203\.0\.113|v=0|offer-of|answer-for/.test(all) && !all.includes(code) && !all.includes('alice') && !all.includes('host-identity'), `${all.length} characters read`);

  const v2 = visitor('bob');
  const r2 = await v2.g.visit({ code: N.newCode() });
  ok('a wrong code finds nobody', !r2.ok && r2.why === 'nobody' && state.offers.length === 1, r2.why);
  const r3 = await v2.g.visit({});
  ok('a host who lets in friends only is not found by a random visit', !r3.ok && r3.why === 'nobody' && state.offers.length === 1, r3.why);
  // a knock without the proof (somebody who learned the room name from a board, not the code)
  {
    const sneak = mk(); await sneak.ready(3000);
    const keys = N.keypair(), vid = require('crypto').randomBytes(12).toString('hex'); let hostKey = null, got = null;
    sneak.listen(`${N.NS}/v/${vid}`, (m) => { if (m.t === 'here') hostKey = m.k; else got = m; });
    await sleep(150); sneak.send(`${N.NS}/r/${H.room}`, { t: 'who', v: vid });
    for (let i = 0; i < 30 && !hostKey; i++) await sleep(50);
    const key = hostKey ? keys.secret(hostKey, H.room + '|' + vid) : null;
    if (key) sneak.send(`${N.NS}/r/${H.room}`, { t: 'knock', v: vid, k: keys.pub, x: N.seal(key, { ver: N.VERSION, sdp: SDP('sneak'), tag: N.tagOf('sneak'), cls: 0, cursor: 0 }) });
    await sleep(500);
    ok('knowing the room name without the code opens nothing', !!hostKey && !got && state.offers.length === 1);
    sneak.close();
  }

  state.mode = 'open';
  const r4 = await v2.g.visit({});
  ok('a host open to anyone is found by a random visit', r4.ok && state.offers.length === 2 && state.offers[1].friend === false && state.offers[1].tag === v2.g.tag, r4.ok ? '' : r4.why);
  state.blockedTags.add(v2.g.tag);
  const r5 = await v2.g.visit({});
  ok('somebody shut out is told there is no room, and no connection is made', !r5.ok && r5.why === 'full' && state.offers.length === 2, r5.why);
  state.blockedTags.clear(); state.free = 0;
  const r6 = await v2.g.visit({});
  const r7 = await v1.g.visit({ code });
  ok('a full field is not offered to random visitors and turns a friend away politely', !r6.ok && (r6.why === 'full' || r6.why === 'nobody') && !r7.ok && r7.why === 'full' && state.offers.length === 2, `${r6.why}, ${r7.why}`);
  state.free = 3;
  const me = N.guest({ net: mk(), pid: 'host-identity', pace: 0.12, me: () => ({ cls: 0, cursor: 0 }), offer: async () => SDP('me') });
  const r8 = await me.visit({ code });
  ok('nobody visits themselves', !r8.ok && r8.why === 'self' && state.offers.length === 2, r8.why);
  const v3 = visitor('carol', { skip: (t) => t === H.tag });
  const r9 = await v3.g.visit({});
  ok('a host the visitor has blocked is passed over', !r9.ok && state.offers.length === 2, r9.why);
  state.answer = false;
  const r10 = await v1.g.visit({ code });
  ok('a host that cannot answer says so instead of leaving the visitor waiting', !r10.ok && r10.why === 'closed', r10.why);
  state.answer = true;
  // a knock read off the board and sent again
  {
    const before = state.offers.length, knock = b1.notes.filter((n) => n.topic === `${N.NS}/r/${H.room}` && /"t":"knock"/.test(n.text)).pop();
    const again = JSON.parse(knock.text); again.i = require('crypto').randomBytes(12).toString('hex');
    const replay = mk(); await replay.ready(3000); replay.send(knock.topic, again); await sleep(500);
    ok('a knock that is sent a second time does nothing', state.offers.length === before);
    const bent = JSON.parse(knock.text); bent.i = require('crypto').randomBytes(12).toString('hex'); bent.v = require('crypto').randomBytes(12).toString('hex');
    replay.send(knock.topic, bent); await sleep(500);
    ok('a knock that was tampered with does nothing', state.offers.length === before);
    replay.close();
  }
  H.stop(); await sleep(200);
  const r11 = await v1.g.visit({ code });
  ok('a host who has gone offline is not found', !r11.ok && r11.why === 'nobody', r11.why);
  const lone = N.guest({ net: N.net(['ws://127.0.0.1:9/mqtt']), pid: 'x', pace: 0.05, me: () => ({}), offer: async () => SDP('x') });
  const r12 = await lone.visit({ patience: 600 });
  ok('with no board in reach a visit ends with "offline"', !r12.ok && r12.why === 'offline', r12.why);

  // ---- what the program takes from a stranger (online.js, the parts that need no window)
  {
    const O = require(path.join(APP, 'online.js'));
    const c0 = O.sanitize(null);
    ok('visiting starts switched off, with an identity and a friend code of its own', c0.mode === 'off' && /^[0-9a-f]{32}$/.test(c0.pid) && N.validCode(c0.code) && c0.blocked.length === 0);
    const c1 = O.sanitize({ mode: 'everyone', pid: 'x', code: 'short', cls: 999, cursor: -4, blocked: [{ tag: 'zz' }, { tag: 'a'.repeat(16), cls: 3 }, { tag: 'a'.repeat(16) }], boards: ['http://evil.example', 'wss://ok.example/mqtt', 5] });
    ok('settings from a file are brought into shape', c1.mode === 'off' && /^[0-9a-f]{32}$/.test(c1.pid) && N.validCode(c1.code) && c1.cls === 0 && c1.cursor === 0 && c1.blocked.length === 1 && JSON.stringify(c1.boards) === '["wss://ok.example/mqtt"]', c1);
    const g = (m) => O.gift(m);
    ok('a Pokémon caught together arrives as numbers only', JSON.stringify(g({ sp: 25, lvl: 12, shiny: true, nat: 3, iv: [1, 2, 3, 4, 5, 6], fem: true, moves: [84, 45], sz: 200, nick: '<b>hi</b>', item: 'master-ball', hp: 9999, uid: 'x' })) === JSON.stringify({ sp: 25, lvl: 12, shiny: true, nat: 3, iv: [1, 2, 3, 4, 5, 6], fem: true, moves: [84, 45], sz: 200 }));
    ok('nonsense is not a Pokémon', g(null) === null && g({ sp: 'x' }) === null && g({ sp: 0, lvl: 5 }) === null && g({ sp: 5000, lvl: 5 }) === null && g({ sp: 25, lvl: 500 }).lvl === 100 && g({ sp: 25, lvl: 5, iv: [99, -4, 'a', 1, 2, 3] }).iv.join() === '31,0,0,1,2,3' && g({ sp: 25, lvl: 5, moves: new Array(50).fill(1) }).moves.length === 4);
    ok('a chat line is a number from the list, never text', O.line(3) === 3 && O.line('hello') === -1 && O.line(-1) === -1 && O.line(O.LINES.length) === -1 && O.LINES.length >= 12 && O.LINES.every((l) => typeof l === 'string' && l.length <= 40));
    ok('names are made from a list and a number', O.nameOf({ tag: N.tagOf('me'), cls: 2 }) === `${O.CLASSES[2]} ${N.numberOf(N.tagOf('me'))}` && /^\w[\w ]+ \d{4}$/.test(O.nameOf({ tag: N.tagOf('q'), cls: 999 })));
    ok('pointers are won, and what is not won cannot be chosen', O.cursorsFor({ species: 0, shiny: 0, badges: 0, helpers: 0 }).filter((c) => c.won).length === 1 && O.cursorsFor({ species: 60, shiny: 1, badges: 8, helpers: 3 }).filter((c) => c.won).length >= 5 && O.cursorsFor({ species: 9999, shiny: 9, badges: 16, helpers: 3 }).every((c) => c.won));
  }
  spy.close(); for (const x of [hostNet, v1.n, v2.n, v3.n]) x.close();
  await b1.close(); await b2.close();
}

async function main() {
  if (!inElectron) {
    await headless();
    const bad = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - bad} passed, ${bad} failed`);
    console.log('(run this file with Electron to check a real visit as well; see the top of the file)');
    process.exit(bad ? 1 : 0);
  }
  await require('./onlinecheck-live.js').run({ ok, sleep, results, APP });
}
main().catch((e) => { console.error(e); process.exit(2); });
