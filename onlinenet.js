// Screen Trainer — online visiting: how two players find each other and say hello (0.8).
//
// There is no Screen Trainer server. Two programs that want to meet need a place to leave each other a note, and
// this uses free public message boards for that (MQTT brokers, over a secure web socket): several at once, so one
// being down does not matter. A note is small and short-lived: "who is open to visitors?", "I am", "may I come in?
// here is how to reach me", "come in". The visit itself (the picture of the host's field, the pointers) then runs
// directly between the two computers (WebRTC, in the windows) and never touches the boards.
//
// What a stranger reading the boards can learn: that somebody, somewhere, is playing. Everything that says how to
// reach a computer (its address) is sealed so that only the two who are meeting can read it (an exchanged key, AES).
// A friend code never travels: both sides derive a room name and a proof from it, slowly on purpose, so that neither
// can be worked back into the code.
//
// This file is plain Node (no Electron): tools/onlinecheck.js runs it against a stand-in board.
'use strict';
const crypto = require('crypto');

const NS = 'screentrainer1';
const VERSION = 2;                               // two programs must agree on this to meet (2: 0.9.7, over two hundred pointers, teams, the host's typed words)
const MAX_NOTE = 24000;                          // bytes; an offer with every address is 3 to 6 thousand
const BOARDS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const CODE_ABC = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';        // no I, L, O, U, 0 or 1: nothing that is misread
const CODE_LEN = 10;

// ------------------------------------------------------------------ MQTT 3.1.1, the little of it this needs (QoS 0)
const varint = (n) => { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return Buffer.from(out); };
const str = (s) => { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]); };
const packet = (first, body) => Buffer.concat([Buffer.from([first]), varint(body.length), body]);
const P = {
  connect: (id, keep) => packet(0x10, Buffer.concat([str('MQTT'), Buffer.from([4, 2, keep >> 8, keep & 255]), str(id)])),
  subscribe: (id, topics) => packet(0x82, Buffer.concat([Buffer.from([id >> 8, id & 255]), ...topics.map((t) => Buffer.concat([str(t), Buffer.from([0])]))])),
  unsubscribe: (id, topics) => packet(0xa2, Buffer.concat([Buffer.from([id >> 8, id & 255]), ...topics.map(str)])),
  publish: (topic, payload) => packet(0x30, Buffer.concat([str(topic), Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')])),
  ping: () => Buffer.from([0xc0, 0]),
  disconnect: () => Buffer.from([0xe0, 0]),
};
/** take the whole packets off the front of what has arrived: [packets, the rest] */
function parse(buf) {
  const out = [];
  for (;;) {
    if (buf.length < 2) break;
    let len = 0, mult = 1, at = 1, done = false;
    while (at < buf.length && at <= 4) { const b = buf[at++]; len += (b & 127) * mult; mult *= 128; if (!(b & 128)) { done = true; break; } }
    if (!done) { if (at > 4) throw new Error('a packet with no end'); break; }
    if (len > MAX_NOTE * 2) throw new Error('a packet too long');
    if (buf.length < at + len) break;
    out.push({ type: buf[0] >> 4, flags: buf[0] & 15, body: buf.subarray(at, at + len) });
    buf = buf.subarray(at + len);
  }
  return [out, buf];
}

/** one board: connects, stays connected, subscribes again after a drop */
function board(url, o) {
  const WS = o.WebSocket || globalThis.WebSocket;
  let ws = null, state = 'off', buf = Buffer.alloc(0), pingT = null, retryT = null, nextId = 1, closed = true, tries = 0;
  const wanted = new Set();
  const set = (s) => { if (s !== state) { state = s; if (o.onState) o.onState(s); } };
  const send = (b) => { if (ws && ws.readyState === 1) { try { ws.send(b); return true; } catch (e) { /* closing */ } } return false; };
  const id = () => { nextId = (nextId % 65000) + 1; return nextId; };
  function feed(data) {
    const chunk = typeof data === 'string' ? Buffer.from(data, 'binary') : Buffer.from(data);
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    if (buf.length > 1 << 20) throw new Error('too much at once');
    const r = parse(buf); buf = r[1];
    for (const p of r[0]) {
      if (p.type === 2) {                                   // the board says hello
        if (p.body.length < 2 || p.body[1] !== 0) throw new Error('refused');
        tries = 0; set('on');
        if (wanted.size) send(P.subscribe(id(), [...wanted]));
        clearInterval(pingT); pingT = setInterval(() => send(P.ping()), 25000);
      } else if (p.type === 3) {                            // a note
        if (p.body.length < 2) continue;
        const n = (p.body[0] << 8) | p.body[1]; let at = 2 + n;
        if (at > p.body.length) continue;
        const topic = p.body.subarray(2, at).toString('utf8');
        if ((p.flags >> 1) & 3) at += 2;                    // (a note sent with a receipt carries a number first)
        if (at <= p.body.length) o.onNote(topic, p.body.subarray(at));
      }
    }
  }
  function open() {
    closed = false; clearTimeout(retryT);
    if (ws || typeof WS !== 'function') return;
    let mine;
    try { mine = ws = new WS(url, ['mqtt']); } catch (e) { ws = null; retry(); return; }
    try { mine.binaryType = 'arraybuffer'; } catch (e) { /* a stand-in without it */ }
    buf = Buffer.alloc(0); set('connecting');
    mine.onopen = () => { if (ws === mine) send(P.connect('st' + crypto.randomBytes(9).toString('hex'), 60)); };
    mine.onmessage = (ev) => { if (ws !== mine) return; try { feed(ev.data); } catch (e) { try { mine.close(); } catch (x) { /* gone */ } } };
    mine.onclose = () => { if (ws !== mine) return; ws = null; clearInterval(pingT); set('off'); retry(); };
    mine.onerror = () => { /* onclose follows */ };
  }
  function retry() { if (closed) return; clearTimeout(retryT); retryT = setTimeout(open, Math.min(30000, 1500 * 2 ** Math.min(tries++, 4))); }
  function close() {
    closed = true; clearTimeout(retryT); clearInterval(pingT); wanted.clear();
    if (ws) { const w = ws; ws = null; try { if (w.readyState === 1) w.send(P.disconnect()); w.close(); } catch (e) { /* gone */ } }
    set('off');
  }
  return {
    url, open, close, state: () => state,
    subscribe: (topics) => { const fresh = topics.filter((t) => !wanted.has(t)); for (const t of fresh) wanted.add(t); if (fresh.length && state === 'on') send(P.subscribe(id(), fresh)); },
    unsubscribe: (topics) => { const had = topics.filter((t) => wanted.delete(t)); if (had.length && state === 'on') send(P.unsubscribe(id(), had)); },
    publish: (topic, text) => state === 'on' && send(P.publish(topic, text)),
  };
}

/** all the boards as one: a note goes out on every board that is up and comes in once, whichever board brings it first */
function net(urls, o) {
  o = o || {};
  const seen = new Map(), handlers = new Map();
  const know = (i) => { const now = Date.now(); if (seen.size > 600) for (const [k, t] of seen) if (now - t > 120000) seen.delete(k); if (seen.has(i)) return true; seen.set(i, now); return false; };
  const boards = (urls && urls.length ? urls : BOARDS).slice(0, 6).map((u) => board(u, {
    WebSocket: o.WebSocket,
    onState: () => { if (o.onState) o.onState(states()); },
    onNote: (topic, payload) => {
      if (payload.length > MAX_NOTE) return;
      let m = null;
      try { m = JSON.parse(payload.toString('utf8')); } catch (e) { return; }
      if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.i !== 'string' || m.i.length < 8 || m.i.length > 40 || typeof m.t !== 'string' || m.t.length > 12) return;
      if (know(m.i)) return;
      const h = handlers.get(topic);
      if (h) { try { h(m); } catch (e) { /* a note this does not understand */ } }
    },
  }));
  const states = () => boards.map((b) => ({ url: b.url, state: b.state() }));
  return {
    open: () => { for (const b of boards) b.open(); },
    close: () => { handlers.clear(); for (const b of boards) b.close(); },
    states, up: () => boards.filter((b) => b.state() === 'on').length,
    /** wait until at least one board is up (true) or the time is over (false) */
    ready: (ms) => new Promise((res) => { const t0 = Date.now(); const tick = () => { if (boards.some((b) => b.state() === 'on')) res(true); else if (Date.now() - t0 > (ms || 8000)) res(false); else setTimeout(tick, 100); }; tick(); }),
    listen: (topic, fn) => { handlers.set(topic, fn); for (const b of boards) b.subscribe([topic]); },
    forget: (topic) => { handlers.delete(topic); for (const b of boards) b.unsubscribe([topic]); },
    send: (topic, m) => { const note = Object.assign({ i: crypto.randomBytes(12).toString('hex') }, m), text = JSON.stringify(note); if (text.length > MAX_NOTE) return 0; know(note.i); let n = 0; for (const b of boards) if (b.publish(topic, text)) n++; return n; },
  };
}

// ------------------------------------------------------------------ keys, codes and seals
const cleanCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('').filter((c) => CODE_ABC.includes(c)).join('').slice(0, CODE_LEN);
const validCode = (code) => cleanCode(code).length === CODE_LEN;
const showCode = (code) => { const c = cleanCode(code); return c.slice(0, 5) + '-' + c.slice(5); };
function newCode() { let s = ''; while (s.length < CODE_LEN) { const b = crypto.randomBytes(1)[0]; if (b < 240) s += CODE_ABC[b % CODE_ABC.length]; } return s; }
const newId = () => crypto.randomBytes(16).toString('hex');
/** what others see of an identity: a tag that cannot be worked back into it */
const tagOf = (pid) => crypto.createHash('sha256').update('screentrainer id ' + String(pid)).digest('hex').slice(0, 16);
const numberOf = (tag) => String(parseInt(String(tag).slice(0, 8), 16) % 10000).padStart(4, '0');
// (scrypt is slow on purpose: a room name seen on a board cannot be tried against every possible code)
const derived = new Map();
function fromCode(code, what, len) {
  const k = what + ':' + cleanCode(code);
  if (!derived.has(k)) { if (derived.size > 40) derived.clear(); derived.set(k, crypto.scryptSync(cleanCode(code), 'screentrainer ' + what, len)); }
  return derived.get(k);
}
const roomOf = (code) => fromCode(code, 'room', 12).toString('hex');
const proofKey = (code) => fromCode(code, 'proof', 32);
const sign = (key, text) => crypto.createHmac('sha256', key).update(text).digest('base64');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function keypair() {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { pub: e.getPublicKey('base64'), secret: (theirs, salt) => Buffer.from(crypto.hkdfSync('sha256', e.computeSecret(Buffer.from(String(theirs), 'base64')), Buffer.from(String(salt)), Buffer.from('screentrainer visit 1'), 32)) };
}
function seal(key, obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
function unseal(key, text) {
  const raw = Buffer.from(String(text), 'base64');
  if (raw.length < 29) throw new Error('too short');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12)); d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
}
const isKey = (k) => typeof k === 'string' && k.length >= 80 && k.length <= 100 && /^[A-Za-z0-9+/=]+$/.test(k);
const isVid = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
const isTag = (v) => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const isRoom = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
const isSdp = (s) => typeof s === 'string' && s.length > 50 && s.length < 16000 && /^v=0/.test(s);
const who = (o) => ({ tag: o.tag, cls: Number.isInteger(o.cls) && o.cls >= 0 && o.cls < 64 ? o.cls : 0, cursor: Number.isInteger(o.cursor) && o.cursor >= 0 && o.cursor < 1024 ? o.cursor : 0 });

// ------------------------------------------------------------------ the host's side
/** o: { net, code, pid, mode() 'friends' | 'open', me() { cls, cursor }, free() how many more may come,
 *       blocked(tag), offer({ vid, tag, cls, cursor, friend, sdp }) -> the answer or null (async), self: allow a visit from this very program (checks only) } */
function host(o) {
  const room = roomOf(o.code), pk = proofKey(o.code), keys = keypair(), tag = tagOf(o.pid), handled = new Map();
  const roomTopic = `${NS}/r/${room}`, lobby = `${NS}/lobby`;
  let said = [], knocks = [], on = false;
  const mayAnswer = () => { const now = Date.now(); said = said.filter((t) => now - t < 1000); if (said.length >= 6) return false; said.push(now); return true; };
  const mayKnock = () => { const now = Date.now(); knocks = knocks.filter((t) => now - t < 10000); if (knocks.length >= 8) return false; knocks.push(now); return true; };      // (making a connection is work: a door that is hammered on stops opening)
  const here = (v) => ({ t: 'here', r: room, k: keys.pub, f: Math.max(0, o.free()), h: tag, p: sign(pk, `here|${v}|${keys.pub}`) });
  function onLobby(m) {
    if (m.t !== 'ask' || !isVid(m.v) || o.mode() !== 'open' || o.free() <= 0 || !mayAnswer()) return;
    o.net.send(`${NS}/v/${m.v}`, here(m.v));
  }
  async function onRoom(m) {
    if (!isVid(m.v)) return;
    const back = `${NS}/v/${m.v}`;
    if (m.t === 'who') { if (mayAnswer()) o.net.send(back, here(m.v)); return; }
    if (m.t !== 'knock' || !isKey(m.k) || typeof m.x !== 'string' || m.x.length > MAX_NOTE) return;
    if (handled.has(m.v)) return;                           // (a note read off a board and sent again does nothing)
    if (handled.size > 300) for (const [k, t] of handled) if (Date.now() - t > 300000) handled.delete(k);
    const friend = typeof m.p === 'string' && same(m.p, sign(pk, `knock|${m.v}|${m.k}`));
    if (o.mode() === 'friends' && !friend) return;          // without the code there is nobody home
    if (o.mode() !== 'friends' && o.mode() !== 'open') return;
    let key = null, body = null;
    try { key = keys.secret(m.k, room + '|' + m.v); body = unseal(key, m.x); } catch (e) { return; }
    handled.set(m.v, Date.now());
    const no = (why) => o.net.send(back, { t: 'no', x: seal(key, { why }) });
    if (!mayKnock()) { no('full'); return; }
    if (!body || typeof body !== 'object' || body.ver !== VERSION) { no('version'); return; }
    if (!isTag(body.tag) || !isSdp(body.sdp)) { no('closed'); return; }
    if (body.tag === tag && !o.self) { no('self'); return; }
    if (o.blocked(body.tag) || o.free() <= 0) { no('full'); return; }      // (somebody shut out is told the same as when there is no room)
    let answer = null;
    try { answer = await o.offer(Object.assign(who(body), { vid: m.v, friend, sdp: body.sdp })); } catch (e) { answer = null; }
    if (!isSdp(answer)) { no('closed'); return; }
    o.net.send(back, { t: 'yes', x: seal(key, { sdp: answer, host: Object.assign({ tag }, who(Object.assign({ tag }, o.me()))) }) });
  }
  return {
    room, tag,
    start: () => { if (on) return; on = true; o.net.listen(roomTopic, (m) => { onRoom(m).catch(() => {}); }); o.net.listen(lobby, onLobby); },
    stop: () => { if (!on) return; on = false; o.net.forget(roomTopic); o.net.forget(lobby); },
    on: () => on,
  };
}

// ------------------------------------------------------------------ the visitor's side
/** o: { net, pid, me() { cls, cursor }, offer() -> my offer (async), skip(tag) hosts not to visit, self: checks only }
 *  visit({ code }) for a friend, visit({}) for anyone -> { ok, sdp, host, room } or { ok: false, why } */
function guest(o) {
  const tag = tagOf(o.pid);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * (o.pace || 1)));      // (pace: the checks do not wait as long as people do)
  async function visit(q) {
    q = q || {};
    const vid = crypto.randomBytes(12).toString('hex'), keys = keypair(), inbox = `${NS}/v/${vid}`, found = new Map();
    let reply = null, stop = false;
    const cancelled = () => stop || (q.cancelled && q.cancelled());
    o.net.listen(inbox, (m) => {
      if (m.t === 'here') { if (isRoom(m.r) && isKey(m.k) && isTag(m.h) && Number.isInteger(m.f) && found.size < 60 && !found.has(m.r)) found.set(m.r, m); }
      else if ((m.t === 'yes' || m.t === 'no') && typeof m.x === 'string' && !reply) reply = m;
    });
    try {
      if (!(await o.net.ready(q.patience || 9000))) return { ok: false, why: 'offline' };
      let list = [];
      if (q.code) {
        if (!validCode(q.code)) return { ok: false, why: 'code' };
        const room = roomOf(q.code), pk = proofKey(q.code);
        for (let i = 0; i < 4 && !found.has(room) && !cancelled(); i++) { o.net.send(`${NS}/r/${room}`, { t: 'who', v: vid }); await wait(1300); }
        const h = found.get(room);
        if (!h) return { ok: false, why: 'nobody' };
        if (!same(h.p || '', sign(pk, `here|${vid}|${h.k}`))) return { ok: false, why: 'nobody' };     // somebody answering in the friend's name
        list = [Object.assign({ proof: sign(pk, `knock|${vid}|${keys.pub}`) }, h)];
      } else {
        for (let i = 0; i < 3 && !cancelled(); i++) { o.net.send(`${NS}/lobby`, { t: 'ask', v: vid }); await wait(1000); }
        list = [...found.values()].filter((h) => h.f > 0 && (o.self || h.h !== tag) && !(o.skip && o.skip(h.h)));
        for (let i = list.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
        if (!list.length) return { ok: false, why: found.size ? 'full' : 'nobody' };
      }
      let sdp = null;
      try { sdp = await o.offer(); } catch (e) { sdp = null; }
      if (!isSdp(sdp)) return { ok: false, why: 'offer' };
      let why = 'nobody';
      for (const h of list.slice(0, 4)) {
        if (cancelled()) return { ok: false, why: 'cancelled' };
        let key = null;
        try { key = keys.secret(h.k, h.r + '|' + vid); } catch (e) { continue; }
        reply = null;
        const knock = { t: 'knock', v: vid, k: keys.pub, x: seal(key, Object.assign({ ver: VERSION, sdp }, who(Object.assign({ tag }, o.me())))) };
        if (h.proof) knock.p = h.proof;
        o.net.send(`${NS}/r/${h.r}`, knock);
        for (let t = 0; t < 100 && !reply && !cancelled(); t++) await wait(100);
        if (!reply) { why = 'silent'; continue; }
        let body = null;
        try { body = unseal(key, reply.x); } catch (e) { why = 'silent'; continue; }
        if (reply.t === 'yes' && body && isSdp(body.sdp) && body.host && isTag(body.host.tag)) return { ok: true, sdp: body.sdp, host: who(body.host), room: h.r, friend: !!q.code };
        why = body && typeof body.why === 'string' ? body.why.slice(0, 12) : 'closed';
        // (a host that says no has made no connection, so the same offer can go to the next one)
      }
      return { ok: false, why };
    } finally { stop = true; o.net.forget(inbox); }
  }
  return { tag, visit };
}

module.exports = { NS, VERSION, BOARDS, MAX_NOTE, P, parse, board, net, host, guest, cleanCode, validCode, showCode, newCode, newId, tagOf, numberOf, roomOf, keypair, seal, unseal, isSdp, isTag, CODE_ABC, CODE_LEN };
