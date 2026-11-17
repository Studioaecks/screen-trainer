// Screen Trainer — online visiting (0.8), the main process's part.
//
// What it is. A player who has MyStream open can let others in: they see the MyStream stage (and so only what the
// host switched on there) and play on it with a pointer of their own. Up to three visitors, four players in all.
// Whatever is caught while they are together, everyone present gets one. Nobody can type: a name is a class from a
// list plus a number, a chat line is one of sixteen from a list.
//
// How. Finding each other goes over public message boards (onlinenet.js); the visit itself is a direct connection
// between the two computers (WebRTC). The host's side of that connection lives in MyStream's booth page, which
// already has the picture of the stage (src/online-host.js); the visitor's side lives in the "online" window
// (visit.html, src/visit.js). This file sits between them: it owns the settings (online.json), decides who may come
// in, and checks every single thing a stranger's computer sends before it goes anywhere near the game.
//
// Rules that hold here:
//   - Off until the owner switches it on. With mode "off" no board is ever contacted; a visit is only started by the
//     owner's own click.
//   - A visitor can do four things on the host's field: move a pointer, hit a wild Pokémon, throw a ball at one, pet.
//     Nothing else of the host's can be reached: not the team, the Bag, the Box, the Day Care or any window.
//   - What arrives from the other side is numbers, checked against lists and ranges (gift, line). Never text, never
//     anything that is run. Since 0.9.7 the one exception goes the other way: the HOST may type to its visitors (hostText,
//     at most 120 characters, once a second); a visitor still only picks one of LINES. So nobody can put words on a
//     stream but the streamer, and a visitor reads what its host types at its own risk (the window says so).
//   - A direct connection shows each side the other's IP address. The window says so where it is switched on.
'use strict';
const fs = require('fs');
const path = require('path');
const N = require('./onlinenet.js');
const Pointers = require('./pointers.js');

const CLASSES = ['Youngster', 'Lass', 'Bug Catcher', 'Hiker', 'Ace Trainer', 'Breeder', 'Ranger', 'Swimmer', 'Camper', 'Picnicker', 'Fisher', 'Bird Keeper', 'Collector', 'Scientist', 'Rocker', 'Psychic'];
const LINES = ['Hi!', 'Welcome!', 'Nice field!', 'Nice team!', 'Good catch!', 'Wow, a shiny!', 'Thanks!', 'Good luck!', 'So close!', 'One more try!', 'Let\'s catch it together!', 'This one is yours.', 'I have to go.', 'See you!', 'Come visit me!', 'GG!',
  // 0.9.7 (appended: a line travels as its number)
  'Yes', 'No', 'OK!', 'Accept', 'Deny', 'Not now', 'Wait a moment', 'Ready!', 'Battle?', 'Nice battle!', 'Over here!', 'Help!', 'Wow!', 'Sorry!', 'Be right back', 'Let\'s go!'];
/** what the host typed, as it may go to the visitors and onto the stage: plain text, one line, at most 120 characters */
const cleanText = (t) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '');
// pointers are rewards: each is won in the player's own game. Since 0.9.7 there are over two hundred, listed in
// pointers.js (shared with the pages, which draw them by number); the first eight are the ones of 0.8, in their order.
const CURSORS = Pointers.LIST;
const MAX_VISITORS = 3;                          // with the host: four players
const HELPERS = ['rotom', 'mewtwo', 'porygonz'];
const WHY = {
  offline: 'No meeting place could be reached. Is this computer online?', nobody: 'Nobody answered.', full: 'There is no room there right now.',
  code: 'That is not a friend code: it has ten letters and digits.', self: 'That is your own code.', version: 'The two programs are different versions. Update Screen Trainer on both computers.',
  closed: 'The host could not let you in right now.', silent: 'The host did not answer.', offer: 'This computer could not start a connection.', cancelled: '', lost: 'The connection was lost.', home: 'You are home again.', sent: 'The host sent you home.', away: 'The host has gone.',
  off: 'Visiting is switched off. Choose "Friends" or "Anyone" first.',
};

/** (0.9.9, groundwork for a dedicated server) connection helpers the owner may name in online.json: at most four, stun:
 *  turn: or turns: addresses only, with a user name and password for TURN. Nothing else gets through. */
function cleanIce(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || typeof s !== 'object' || out.length >= 4) continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && /^(stun|turn|turns):[\w.-]+(:\d{1,5})?(\?transport=(udp|tcp))?$/i.test(u)).slice(0, 4);
    if (!urls.length) continue;
    const o = { urls };
    if (typeof s.username === 'string' && s.username.length <= 200) o.username = s.username;
    if (typeof s.credential === 'string' && s.credential.length <= 200) o.credential = s.credential;
    out.push(o);
  }
  return out;
}
const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const blocked = [], had = new Set();
  for (const b of Array.isArray(r.blocked) ? r.blocked : []) { if (!b || !N.isTag(b.tag) || had.has(b.tag) || blocked.length >= 200) continue; had.add(b.tag); blocked.push({ tag: b.tag, cls: int(b.cls, 0, CLASSES.length - 1, 0), at: Number(b.at) > 0 ? Number(b.at) : 0 }); }
  return {
    mode: r.mode === 'friends' || r.mode === 'open' ? r.mode : 'off',
    pid: typeof r.pid === 'string' && /^[0-9a-f]{32}$/.test(r.pid) ? r.pid : N.newId(),
    code: N.validCode(r.code) ? N.cleanCode(r.code) : N.newCode(),
    cls: int(r.cls, 0, CLASSES.length - 1, 0), cursor: int(r.cursor, 0, CURSORS.length - 1, 0),
    blocked,
    boards: (Array.isArray(r.boards) ? r.boards : []).filter((u) => typeof u === 'string' && /^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(u)).slice(0, 6),      // (empty: the built-in ones)
    ice: cleanIce(r.ice),                                 // (0.9.9) the owner's own STUN / TURN servers, for a dedicated server later (SERVER.md); empty: the built-in public STUN
    bounds: r.bounds && [r.bounds.x, r.bounds.y, r.bounds.width, r.bounds.height].every(Number.isFinite) ? { x: Math.round(r.bounds.x), y: Math.round(r.bounds.y), width: Math.round(r.bounds.width), height: Math.round(r.bounds.height) } : null,
  };
}
/** a Pokémon as it may cross between two computers: numbers in range and nothing else (src/game.js builds it anew) */
function gift(m) {
  if (!m || typeof m !== 'object' || !Number.isInteger(m.sp) || m.sp < 1 || m.sp > 1100 || !Number.isFinite(m.lvl)) return null;
  const out = { sp: m.sp, lvl: Math.min(100, Math.max(1, Math.round(m.lvl))), shiny: m.shiny === true };
  if (Number.isInteger(m.nat) && m.nat >= 0 && m.nat <= 24) out.nat = m.nat;
  if (Array.isArray(m.iv) && m.iv.length === 6) out.iv = m.iv.map((v) => Math.min(31, Math.max(0, Math.round(Number(v)) || 0)));
  if (m.fem === true || m.fem === false) out.fem = m.fem;
  if (Array.isArray(m.moves)) out.moves = m.moves.filter((x) => Number.isInteger(x) && x > 0 && x < 2000).slice(0, 4);
  if (Number.isInteger(m.sz) && m.sz >= 0 && m.sz <= 255) out.sz = m.sz;
  return out;
}
const line = (i) => (Number.isInteger(i) && i >= 0 && i < LINES.length ? i : -1);
const nameOf = (w) => `${CLASSES[int(w && w.cls, 0, CLASSES.length - 1, 0)]} ${N.numberOf(w && w.tag)}`;
const cursorsFor = (s) => Pointers.view(s || {});

/** ctx: { BrowserWindow, ipcMain, userDir(), appDir, icon(), version, stage(), booth(), game(), stats(), askStats(), changed(),
 *         boards (checks only: stand-in boards), allowSelf (checks only) } */
function create(ctx) {
  const { BrowserWindow, ipcMain } = ctx;
  const file = () => path.join(ctx.userDir(), 'online.json');
  let cfg = sanitize(null), loaded = false, hub = null, saveT = null;
  // hosting
  let hostNet = null, H = null, boothReady = false;
  const visitors = new Map();                    // vid -> { vid, tag, cls, cursor, name, slot, friend, since, open, n: { t, p, c, s } }
  // visiting
  let visit = { state: 'idle' }, visitNet = null, visitRun = 0, got = { t: 0, n: 0 };
  let checking = false;                          // a visit to this very program, to see that visiting works from this computer (check)

  const alive = (w) => !!w && !w.isDestroyed();
  const send = (w, ch, v) => { if (alive(w)) w.webContents.send(ch, v); };
  const run = (w, code) => (alive(w) ? w.webContents.executeJavaScript(code, true).catch(() => null) : Promise.resolve(null));
  function load() { if (loaded) return cfg; loaded = true; let raw = null; try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { raw = null; } cfg = sanitize(raw); if (!raw) persist(true); return cfg; }
  function persist(now) {
    clearTimeout(saveT);
    if (checking) return;                                   // (the check's stand-in code and mode are not for keeping)
    const write = () => { try { fs.mkdirSync(ctx.userDir(), { recursive: true }); const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, file()); } catch (e) { console.error('online save', e.message); } };
    if (now) write(); else saveT = setTimeout(write, 400);
  }
  const boards = () => (ctx.boards && ctx.boards.length ? ctx.boards : cfg.boards.length ? cfg.boards : N.BOARDS);
  const me = () => ({ tag: N.tagOf(cfg.pid), cls: cfg.cls, cursor: cfg.cursor });
  const isBlocked = (tag) => cfg.blocked.some((b) => b.tag === tag);
  const stats = () => (ctx.stats && ctx.stats()) || {};      // (everything G.pointerStats counts: pointers.js reads only numbers from it)

  // ---------------------------------------------------------------- what the window shows
  function view() {
    load();
    const stageOpen = alive(ctx.stage());
    return {
      version: ctx.version, mode: cfg.mode, code: N.showCode(cfg.code), cls: cfg.cls, cursor: cfg.cursor, name: nameOf(me()),
      classes: CLASSES, lines: LINES, cursors: cursorsFor(stats()), max: MAX_VISITORS,
      blocked: cfg.blocked.map((b) => ({ tag: b.tag, name: nameOf(b) })),
      hosting: { stage: stageOpen, ready: stageOpen && boothReady, on: !!H, boards: hostNet ? hostNet.states().map((s) => s.state) : [],
        visitors: [...visitors.values()].filter((v) => v.open).map((v) => ({ vid: v.vid, name: v.name, slot: v.slot, friend: v.friend, cursor: v.cursor })) },
      visit: { state: visit.state, why: visit.why || '', text: visit.why ? WHY[visit.why] || 'It did not work.' : '', host: visit.host ? { name: visit.host.name, tag: visit.host.tag } : null, kind: visit.kind || '', slot: visit.slot || 0 },
    };
  }
  let pushT = null;
  const push = () => { clearTimeout(pushT); pushT = setTimeout(() => { send(hub, 'ov:view', view()); if (ctx.changed) ctx.changed(); }, 30); };

  // ---------------------------------------------------------------- being visited
  const freeSlots = () => MAX_VISITORS - visitors.size;
  function syncHost() {
    load();
    const want = cfg.mode !== 'off' && boothReady && alive(ctx.stage()) && alive(ctx.booth());
    if (want && !H) {
      hostNet = N.net(boards(), { onState: push });
      hostNet.open();
      H = N.host({ net: hostNet, code: cfg.code, pid: cfg.pid, self: !!ctx.allowSelf || checking, mode: () => cfg.mode, me: () => ({ cls: cfg.cls, cursor: cfg.cursor }), free: freeSlots, blocked: isBlocked, offer: accept });
      H.start();
    } else if (!want && H) {
      H.stop(); H = null;
      if (hostNet) { hostNet.close(); hostNet = null; }
      for (const v of [...visitors.values()]) drop(v.vid, 'away');
    }
    push();
  }
  function restartHost() { if (!H) { syncHost(); return; } H.stop(); H = null; if (hostNet) { hostNet.close(); hostNet = null; } syncHost(); }      // (a new code is a new room; the visitors who are here stay)
  /** a knock that passed the door: the booth makes the connection. Returns its answer, or null. */
  async function accept(q) {
    if (freeSlots() <= 0 || isBlocked(q.tag) || !alive(ctx.booth()) || !boothReady) return null;
    let slot = 1; const used = new Set([...visitors.values()].map((v) => v.slot)); while (used.has(slot)) slot++;
    const v = { vid: q.vid, tag: q.tag, cls: int(q.cls, 0, CLASSES.length - 1, 0), cursor: int(q.cursor, 0, CURSORS.length - 1, 0), slot, friend: !!q.friend, since: Date.now(), open: false, n: { t: 0, p: 0, c: 0, s: 0 }, sayAt: 0 };
    v.name = nameOf(v);
    visitors.set(v.vid, v);
    const answer = await run(ctx.booth(), `window.OnlineHost ? OnlineHost.accept(${JSON.stringify({ vid: v.vid, slot, sdp: q.sdp, ice: cfg.ice })}) : null`);
    if (!N.isSdp(answer)) { visitors.delete(v.vid); return null; }
    setTimeout(() => { const x = visitors.get(v.vid); if (x && !x.open) drop(v.vid, 'lost'); }, 30000);      // it knocked and never came in
    return answer;
  }
  // (who is here goes out as tag and class: every program makes the names itself, from its own list)
  const roster = () => [...visitors.values()].filter((v) => v.open).map((v) => ({ slot: v.slot, tag: v.tag, cls: v.cls, cursor: v.cursor }));
  const whoIsHere = () => ({ t: 'who', list: roster(), host: { tag: N.tagOf(cfg.pid), cls: cfg.cls } });
  function toVisitors(m, only) { run(ctx.booth(), `window.OnlineHost && OnlineHost.send(${JSON.stringify(m)}, ${JSON.stringify(only || null)})`); }
  function drop(vid, why) {
    const v = visitors.get(vid);
    if (!v) return;
    visitors.delete(vid);
    run(ctx.booth(), `window.OnlineHost && OnlineHost.drop(${JSON.stringify(vid)}, ${JSON.stringify(why || '')})`);
    if (v.open) { send(ctx.stage(), 'st:v-in', { t: 'leave', slot: v.slot }); toVisitors(whoIsHere()); }
    push();
  }
  /** from the booth: the state of its connections, and what the visitors' computers send */
  function fromBooth(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ready') { boothReady = !!m.on; syncHost(); return; }
    const v = visitors.get(m.vid);
    if (!v) return;
    if (m.t === 'open') {
      v.open = true;
      send(ctx.stage(), 'st:v-in', { t: 'join', slot: v.slot, name: v.name, cursor: v.cursor });
      toVisitors({ t: 'hi', you: v.slot }, v.vid);
      toVisitors(whoIsHere());
      push();
    } else if (m.t === 'closed') drop(v.vid, 'lost');
    else if (m.t === 'in' && v.open) input(v, m.m);
  }
  /** one thing a visitor's computer sent. Everything is checked and counted here; the game only ever gets what is listed. */
  function input(v, m) {
    if (!m || typeof m !== 'object') return;
    const now = Date.now(), n = v.n;
    if (now - n.t >= 1000) { n.t = now; n.p = 0; n.c = 0; }
    if (m.t === 'p' || m.t === 'c') {
      const x = Number(m.x), y = Number(m.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -40 || x > 1320 || y < -40 || y > 760) return;
      if (m.t === 'p') { if (++n.p > 75) return; send(ctx.stage(), 'st:v-in', { t: 'p', slot: v.slot, x: Math.round(x), y: Math.round(y) }); }
      else { if (++n.c > 8 || (m.b !== 0 && m.b !== 2)) return; send(ctx.stage(), 'st:v-in', { t: 'c', slot: v.slot, b: m.b, x: Math.round(x), y: Math.round(y) }); }
    } else if (m.t === 'say') {
      const i = line(m.i);
      if (i < 0 || now - v.sayAt < 1500) return;
      v.sayAt = now;
      send(ctx.stage(), 'st:v-in', { t: 'say', slot: v.slot, i, text: LINES[i] });      // (the words come from this program's own list, never from the visitor)
      toVisitors({ t: 'say', slot: v.slot, i });
    } else if (m.t === 'team') {                           // (0.9.7) the visitor's team, as numbers only: at most six, once in 10 seconds, 30 times a visit
      if (!Array.isArray(m.list) || now - (v.teamAt || 0) < 10000 || (v.teams = (v.teams || 0) + 1) > 30) return;
      v.teamAt = now;
      const list = m.list.slice(0, 6).map(gift).filter(Boolean);
      if (list.length) send(ctx.stage(), 'st:v-in', { t: 'team', slot: v.slot, list });
    } else if (m.t === 'bye') drop(v.vid, 'home');
  }
  /** from the stage: what happened in the game that the visitors should know or get */
  function fromStage(m) {
    if (!m || typeof m !== 'object' || !visitors.size) return;
    if (m.t === 'ready') { for (const v of visitors.values()) if (v.open) send(ctx.stage(), 'st:v-in', { t: 'join', slot: v.slot, name: v.name, cursor: v.cursor, quiet: true }); return; }      // the stage page started again: its visitors are still here
    if (m.t === 'home') { const v = [...visitors.values()].find((x) => x.slot === m.slot); if (v) { toVisitors({ t: 'home', why: 'home' }, v.vid); setTimeout(() => drop(v.vid, 'home'), 400); } }
    else if (m.t === 'catch') { const g = gift(m.mon); if (g) toVisitors({ t: 'catch', by: int(m.by, 0, MAX_VISITORS, 0), mon: g }); }
    else if (m.t === 'helper') { if (HELPERS.includes(m.key)) toVisitors({ t: 'helper', key: m.key }); }
    else if (m.t === 'duel' && ['start', 'won', 'lost'].includes(m.s)) { const v = [...visitors.values()].find((x) => x.slot === m.slot); if (v) toVisitors({ t: 'duel', s: m.s }, v.vid); }      // (0.9.7) a friendly battle with that visitor's team
  }
  let hostSayAt = 0;
  function hostSay(i) {
    i = line(i);
    if (i < 0 || !visitors.size || Date.now() - hostSayAt < 1500) return;
    hostSayAt = Date.now();
    send(ctx.stage(), 'st:v-in', { t: 'say', slot: 0, i, text: LINES[i] });
    toVisitors({ t: 'say', slot: 0, i });
  }
  /** the host typed something to its visitors (0.9.7): it shows over the fountain on the host's own stage and as a line
   *  in each visitor's window. Visitors can not answer in words, only with LINES. */
  let hostTextAt = 0;
  function hostText(t) {
    const text = cleanText(t);
    if (!text || !visitors.size || Date.now() - hostTextAt < 1000) return false;
    hostTextAt = Date.now();
    send(ctx.stage(), 'st:v-in', { t: 'say', slot: 0, text });
    toVisitors({ t: 'say', slot: 0, text });
    return true;
  }
  function kick(vid, block) {
    const v = visitors.get(vid);
    if (!v) return;
    if (block && !isBlocked(v.tag)) { cfg.blocked.unshift({ tag: v.tag, cls: v.cls, at: Date.now() }); cfg.blocked = cfg.blocked.slice(0, 200); persist(); }
    toVisitors({ t: 'home', why: 'sent' }, vid);
    setTimeout(() => drop(vid, 'sent'), 400);
  }

  // ---------------------------------------------------------------- visiting
  // (visit.state: idle, looking, connecting, there. After a visit or a try that failed, visit.why says how it ended.)
  const busy = () => visit.state === 'looking' || visit.state === 'connecting' || visit.state === 'there';
  async function startVisit(kind, code) {
    load();
    if (busy()) return;
    if (cfg.mode === 'off') { visit = { state: 'idle', why: 'off' }; push(); return; }
    if (!alive(hub)) return;
    const mine = ++visitRun;
    visit = { state: 'looking', kind: kind === 'friend' ? 'friend' : 'random' }; got = { t: 0, n: 0 }; push();
    await run(hub, 'window.Visit && Visit.reset()');
    visitNet = N.net(boards()); visitNet.open();
    const G = N.guest({ net: visitNet, pid: cfg.pid, pace: ctx.pace || 1, self: !!ctx.allowSelf || checking, me: () => ({ cls: cfg.cls, cursor: cfg.cursor }), skip: isBlocked, offer: () => run(hub, `window.Visit ? Visit.offer(${JSON.stringify(cfg.ice)}) : null`) });
    let r = null;
    try { r = await G.visit(Object.assign({ cancelled: () => mine !== visitRun }, visit.kind === 'friend' ? { code } : {})); } catch (e) { r = { ok: false, why: 'closed' }; }
    try { visitNet.close(); } catch (e) { /* closed */ } visitNet = null;
    if (mine !== visitRun) return;
    if (!r.ok) { visit = { state: 'idle', why: r.why, kind: visit.kind }; await run(hub, 'window.Visit && Visit.reset()'); push(); return; }
    visit = { state: 'connecting', kind: visit.kind, host: Object.assign({ name: nameOf(r.host) }, r.host) }; push();
    const okay = await run(hub, `window.Visit ? Visit.accept(${JSON.stringify({ sdp: r.sdp, host: visit.host.name })}) : false`);
    if (mine !== visitRun) return;
    if (!okay) { visit = { state: 'idle', why: 'lost', kind: visit.kind }; await run(hub, 'window.Visit && Visit.reset()'); push(); }
  }
  function leave(why) {
    visitRun++;
    if (visitNet) { try { visitNet.close(); } catch (e) { /* closed */ } visitNet = null; }
    run(hub, 'window.Visit && Visit.reset()');
    visit = { state: 'idle', why: why && why !== 'cancelled' ? why : '' };
    push();
  }
  /** from the online window: how its connection is doing, and what the host's computer sends */
  function fromHub(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'there') { if (visit.state === 'connecting') { visit.state = 'there'; push(); } return; }
    if (m.t === 'gone') { if (busy()) leave(typeof m.why === 'string' && WHY[m.why] !== undefined ? m.why : 'lost'); return; }
    if (visit.state !== 'there') return;
    if (m.t === 'hi') { visit.slot = int(m.you, 1, MAX_VISITORS, 0); push(); setTimeout(sendTeam, 800); }
    else if (m.t === 'duel') { const t = { start: 'started a friendly battle with your team!', won: 'Your team won the friendly battle!', lost: 'Your team lost the friendly battle. Nothing was lost: they battled as copies.' }[m.s]; if (t) run(hub, `window.toast && toast(${JSON.stringify((m.s === 'start' ? (visit.host ? visit.host.name + ' ' : 'The host ') : '') + t)})`); }
    else if (m.t === 'catch') {
      const g = gift(m.mon), now = Date.now();
      if (!g || now - got.t < 1200 || got.n >= 400) return;                // (a host's computer cannot pour Pokémon into a visitor's Box)
      got.t = now; got.n++;
      send(ctx.game(), 'st:cmd', { type: 'gift', mon: g, from: visit.host ? visit.host.name : 'a Trainer', mine: int(m.by, 0, MAX_VISITORS, 0) === visit.slot && visit.slot > 0 });
    } else if (m.t === 'helper') { if (HELPERS.includes(m.key)) send(ctx.game(), 'st:cmd', { type: 'visitHelper', key: m.key, from: visit.host ? visit.host.name : 'a Trainer' }); }
  }
  /** (0.9.7) visiting: my team goes along, as numbers, to stand on the host's field (src/visitors.js, src/rivals.js) */
  async function sendTeam() {
    if (visit.state !== 'there') return;
    const raw = await run(ctx.game(), 'typeof G !== "undefined" && G.teamGift ? G.teamGift() : null');
    const list = Array.isArray(raw) ? raw.slice(0, 6).map(gift).filter(Boolean) : [];
    if (list.length) run(hub, `window.Visit && Visit.send(${JSON.stringify({ t: 'team', list })})`);
  }
  function blockHost() {
    if (!visit.host || !N.isTag(visit.host.tag)) return;
    if (!isBlocked(visit.host.tag)) { cfg.blocked.unshift({ tag: visit.host.tag, cls: visit.host.cls | 0, at: Date.now() }); cfg.blocked = cfg.blocked.slice(0, 200); persist(); }
    leave('home');
  }

  // ---------------------------------------------------------------- the settings
  function set(patch) {
    load();
    const p = patch && typeof patch === 'object' ? patch : {}, before = cfg.mode + cfg.code;
    if (p.mode === 'off' || p.mode === 'friends' || p.mode === 'open') cfg.mode = p.mode;
    if (Number.isInteger(p.cls) && p.cls >= 0 && p.cls < CLASSES.length) cfg.cls = p.cls;
    if (Number.isInteger(p.cursor) && cursorsFor(stats()).some((c) => c.i === p.cursor && c.won)) { cfg.cursor = p.cursor; if (ctx.pointerChanged) ctx.pointerChanged(cfg.cursor); }
    if (p.newCode === true) cfg.code = N.newCode();
    if (typeof p.unblock === 'string') cfg.blocked = p.unblock === 'all' ? [] : cfg.blocked.filter((b) => b.tag !== p.unblock);
    persist();
    if (cfg.mode === 'off' && busy()) leave('cancelled');
    if (before !== cfg.mode + cfg.code) { if (p.newCode === true) restartHost(); else syncHost(); }
    push();
    return view();
  }

  // ---------------------------------------------------------------- the window
  function open(then) {
    load();
    if (alive(hub)) { if (hub.isMinimized()) hub.restore(); hub.show(); hub.focus(); if (then) act(then); return hub; }
    const b = cfg.bounds;
    hub = new BrowserWindow({ width: b ? b.width : 1040, height: b ? b.height : 720, x: b ? b.x : undefined, y: b ? b.y : undefined, minWidth: 760, minHeight: 560, title: 'Screen Trainer online', show: false,
      backgroundColor: '#0d1124', autoHideMenuBar: true, icon: (ctx.icon && ctx.icon()) || undefined,
      webPreferences: { preload: path.join(ctx.appDir, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    hub.setMenu(null);
    const w = hub;
    const remember = () => { if (!alive(w) || w.isMinimized() || w.isMaximized()) return; cfg.bounds = w.getNormalBounds(); persist(); };
    w.on('move', remember); w.on('resize', remember);
    w.on('closed', () => { if (hub === w) hub = null; visitRun++; if (visitNet) { try { visitNet.close(); } catch (e) { /* closed */ } visitNet = null; } visit = { state: 'idle' }; });
    w.loadFile(path.join(ctx.appDir, 'visit.html'));
    w.once('ready-to-show', () => { w.show(); if (ctx.askStats) ctx.askStats(); if (then) setTimeout(() => act(then), 500); });
    return hub;
  }
  function act(then) { if (then && then.visit === 'random' && cfg.mode !== 'off' && !busy()) startVisit('random'); }
  /** the ball on top of the fountain: opens the window; when visiting is switched on it goes looking for somebody at once */
  function button() { open({ visit: 'random' }); }

  /** Does visiting work from this computer? The program visits itself the long way round: over the real meeting places,
   *  then a direct connection, then the picture. For its length it uses a friend code made for the occasion (so nobody
   *  else can find the room) and afterwards everything is as it was. MyStream has to be open. Nothing is caught or changed
   *  in the game. Returns what happened, step by step. */
  async function check() {
    load();
    const out = { ok: false, boards: [], steps: [] }, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await wait(150); } };
    const step = (name, ok, detail) => { out.steps.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail }); return !!ok; };
    if (checking || busy()) { step('free to check', false, 'a visit is going on'); return out; }
    if (!alive(ctx.stage()) || !alive(ctx.booth())) { step('MyStream is open', false); return out; }
    const keep = { mode: cfg.mode, code: cfg.code };
    clearTimeout(saveT); persist(true);
    checking = true;
    try {
      cfg.mode = 'friends'; cfg.code = N.newCode();
      restartHost();
      if (!step('the stage has a picture to show', await until(() => boothReady && !!H, 20000))) return out;
      const up = await until(() => hostNet && hostNet.up() > 0, 15000);
      out.boards = hostNet ? hostNet.states() : [];
      if (!step('a meeting place is reached', up, out.boards.map((b) => `${b.url.replace(/^wss?:\/\//, '').replace(/[:/].*$/, '')} ${b.state}`).join(', '))) return out;
      await wait(1200);                                     // (the room is listened for on the boards that came up a moment later too)
      out.boards = hostNet.states();
      open();
      if (!step('the online window opens', await until(() => run(hub, 'typeof Visit !== "undefined" && !!V'), 10000))) return out;
      const t0 = Date.now();
      startVisit('friend', cfg.code);
      const there = await until(() => visit.state === 'there' || (visit.state === 'idle' && visit.why), 60000);
      if (!step('the visit gets in over a direct connection', visit.state === 'there', visit.state === 'there' ? `${((Date.now() - t0) / 1000).toFixed(1)} s` : (visit.why || 'no answer') + (there ? '' : ' (waited a minute)'))) return out;
      const s = await until(async () => { const x = await run(hub, 'Visit.stats()'); return x && x.frames > 8 && x.w > 0 ? x : null; }, 20000);
      out.stats = s || (await run(hub, 'Visit.stats()'));
      if (!step('the picture of the stage arrives', !!s, out.stats ? `${out.stats.w} x ${out.stats.h}, ${out.stats.frames} pictures, ${out.stats.pair}` : '')) return out;
      await run(hub, 'Visit.send({ t: "p", x: 420, y: 300 })');
      const seen = await until(async () => { const x = await run(ctx.stage(), 'typeof Visitors !== "undefined" ? Visitors.state() : null'); return x && x.n === 1 && Math.abs(x.list[0].x - 420) < 4 ? x : null; }, 8000);
      step('the pointer shows on the stage', !!seen, seen ? seen.list[0].name : '');
      // 0.9.7: the visitor's team comes along (here: this program's own team, as numbers, standing on its own stage), and the host's typed words go out
      const team = await until(async () => { const x = await run(ctx.stage(), 'typeof Visitors !== "undefined" ? Visitors.state() : null'); return x && x.list[0] && x.list[0].team > 0 ? x.list[0].team : null; }, 15000);
      step("the visitor's team arrives, as numbers", !!team, team ? `${team} Pokémon` : 'none came (an empty team sends none)');
      step("the host's typed words go out", hostText('Hello from the online check!'), '');
      out.ok = out.steps.every((x) => x.ok);
      return out;
    } catch (e) { step('the check ran to its end', false, String((e && e.message) || e).slice(0, 200)); return out; } finally {
      try { await run(hub, 'window.Visit && Visit.bye()'); await wait(200); leave('cancelled'); for (const v of [...visitors.values()]) drop(v.vid, 'home'); } catch (e) { /* closing anyway */ }
      cfg.mode = keep.mode; cfg.code = keep.code;
      checking = false;
      restartHost();
      push();
    }
  }

  const fromHubWin = (e) => alive(hub) && e.sender === hub.webContents;
  const fromBoothWin = (e) => alive(ctx.booth()) && e.sender === ctx.booth().webContents;
  const fromStageWin = (e) => alive(ctx.stage()) && e.sender === ctx.stage().webContents;
  ipcMain.handle('ov:view', (e) => (fromHubWin(e) ? view() : null));
  ipcMain.handle('ov:set', (e, p) => (fromHubWin(e) ? set(p) : null));
  ipcMain.on('ov:visit', (e, q) => { if (fromHubWin(e)) startVisit(q && q.kind === 'friend' ? 'friend' : 'random', q && q.code); });
  ipcMain.on('ov:leave', (e) => { if (fromHubWin(e)) { run(hub, 'window.Visit && Visit.bye()'); setTimeout(() => leave('cancelled'), 120); } });
  ipcMain.on('ov:block-host', (e) => { if (fromHubWin(e)) { run(hub, 'window.Visit && Visit.bye()'); setTimeout(blockHost, 120); } });
  ipcMain.on('ov:kick', (e, q) => { if (fromHubWin(e) && q) kick(String(q.vid), !!q.block); });
  ipcMain.on('ov:say', (e, i) => { if (fromHubWin(e)) hostSay(i); });
  ipcMain.handle('ov:say-text', (e, t) => (fromHubWin(e) || fromBoothWin(e) ? hostText(t) : false));      // (0.9.7) the host's own words: from the online window or MyStream's booth
  ipcMain.on('ov:hub', (e, m) => { if (fromHubWin(e)) fromHub(m); });
  ipcMain.on('ov:host', (e, m) => { if (fromBoothWin(e)) fromBooth(m); });
  ipcMain.on('st:v-out', (e, m) => { if (fromStageWin(e)) fromStage(m); });
  ipcMain.on('ov:open', (_e, go) => { if (go) button(); else open(); });      // any of the program's own pages: the fountain's ball (go: look for somebody at once), a button in the options

  return {
    open, button, view, set, syncHost, check, close: () => { if (H) { H.stop(); H = null; } if (hostNet) { hostNet.close(); hostNet = null; } visitors.clear(); boothReady = false; visitRun++; if (visitNet) { visitNet.close(); visitNet = null; } if (alive(hub)) hub.destroy(); hub = null; },
    stageGone: () => { boothReady = false; for (const v of [...visitors.values()]) visitors.delete(v.vid); syncHost(); },
    /** MyStream is about to close: whoever is visiting is told, so that they are home at once and not left looking at a still picture */
    hostLeaving: async () => { if (!visitors.size) return; toVisitors({ t: 'home', why: 'away' }); await new Promise((r) => setTimeout(r, 350)); },
    /** the owner's own pointer (0.9.4): MyStream shows it on the stage, and its "pointer" tab chooses it, as this window does */
    pointer: () => { load(); return { cursor: cfg.cursor, cursors: cursorsFor(stats()) }; }, cursorNow: () => load().cursor,
    window: () => (alive(hub) ? hub : null), visitors: () => visitors.size, hosting: () => !!H, visiting: () => visit.state === 'there',
    _test: { cfg: () => cfg, startVisit, leave, visitState: () => visit, fromHub, hostSay, hostText, kick, input: (vid, m) => { const v = visitors.get(vid); if (v) input(v, m); } },
  };
}

module.exports = { create, sanitize, gift, line, nameOf, cursorsFor, cleanText, cleanIce, CLASSES, LINES, CURSORS, MAX_VISITORS, WHY };
