// Screen Trainer — the "online" window's page (visit.html, 0.8).
//
// Two things live here. The buttons: who may visit, the friend code, the class and pointer, who is here, who is
// blocked (all of it is kept and decided by online.js in the main process; this page asks with st.ov.*). And `Visit`,
// the visitor's end of a visit: a direct connection to the host's computer that brings the picture of their stage
// and carries this pointer's place and clicks the other way. What the host's computer sends is handed to the main
// process as it comes ('hi', 'catch', 'helper'); nothing from there is ever shown as text or run.
'use strict';

const $ = (id) => document.getElementById(id);
const ov = window.st.ov;
let V = null;

// ------------------------------------------------------------------ the visitor's end of the connection
const Visit = (() => {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const STAGE = { w: 1280, h: 720 };
  let pc = null, ch = null, there = false, gen = 0, lastMove = 0, frames = 0, roster = { list: [], host: '' }, mySlot = 0;
  const vid = $('vid');
  const gathered = (p, ms) => new Promise((res) => {
    if (p.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, ms);
    p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
  const tell = (m) => { try { ov.hub(m); } catch (e) { /* the window is closing */ } };
  const send = (m) => { if (ch && ch.readyState === 'open') { try { ch.send(JSON.stringify(m)); return true; } catch (e) { /* it is going */ } } return false; };
  function reset() {
    gen++; there = false; mySlot = 0; roster = { list: [], host: '' };
    try { if (ch) { ch.onclose = null; ch.onmessage = null; ch.close(); } } catch (e) { /* closed */ }
    try { if (pc) { pc.onconnectionstatechange = null; pc.ontrack = null; pc.close(); } } catch (e) { /* closed */ }
    pc = null; ch = null;
    try { vid.srcObject = null; } catch (e) { /* nothing was shown */ }
    return true;
  }
  function ended(why) { if (!pc) return; const was = there; reset(); if (was || why) tell({ t: 'gone', why: why || 'lost' }); }
  /** the host's computer said something */
  function heard(text) {
    if (typeof text !== 'string' || text.length > 1500) return;
    let m = null;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') { mySlot = m.you | 0; tell({ t: 'hi', you: mySlot }); }
    else if (m.t === 'who') { roster = { list: (Array.isArray(m.list) ? m.list : []).slice(0, 3).map((x) => ({ slot: x.slot | 0, name: nameOf(x) })), host: nameOf(m.host) }; drawWho(); }
    else if (m.t === 'say') {
      const who = m.slot ? (roster.list.find((x) => x.slot === (m.slot | 0)) || {}).name || 'A Trainer' : roster.host || 'The host';
      const line = !m.slot && typeof m.text === 'string' ? m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) : V && V.lines[m.i | 0];      // (0.9.7: the host may type; shown as text, never as anything else)
      if (line) toast(`${who}: ${line}`);
    }
    else if (m.t === 'catch' || m.t === 'helper' || m.t === 'duel') tell(m);
    else if (m.t === 'home') ended(m.why === 'sent' ? 'sent' : m.why === 'away' ? 'away' : 'home');
  }
  // (a name is never sent: it is made here, from this program's own list of classes and the number in the other side's tag)
  const nameOf = (w) => { const tag = w && typeof w.tag === 'string' && /^[0-9a-f]{16}$/.test(w.tag) ? w.tag : '0000000000000000', classes = (V && V.classes) || ['Trainer']; return `${classes[(w && w.cls) | 0] || classes[0]} ${String(parseInt(tag.slice(0, 8), 16) % 10000).padStart(4, '0')}`; };
  async function offer(ice) {
    reset();
    const mine = gen;
    pc = new RTCPeerConnection({ iceServers: Array.isArray(ice) && ice.length ? ice : ICE });      // (0.9.9: the owner's own servers when online.json names some)
    ch = pc.createDataChannel('st', { ordered: true });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => { if (mine !== gen) return; vid.srcObject = e.streams[0] || new MediaStream([e.track]); vid.play().catch(() => {}); };
    ch.onopen = () => { if (mine !== gen) return; there = true; tell({ t: 'there' }); };
    ch.onclose = () => { if (mine === gen) ended(there ? 'away' : 'lost'); };
    ch.onmessage = (e) => { if (mine === gen) heard(e.data); };
    pc.onconnectionstatechange = () => {
      if (mine !== gen || !pc) return;
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') ended('lost');
      else if (s === 'disconnected') setTimeout(() => { if (mine === gen && pc && pc.connectionState !== 'connected') ended('lost'); }, 7000);
    };
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc, 2500);
    return mine === gen && pc ? pc.localDescription.sdp : null;
  }
  /** the host said yes: finish the connection. true once the two computers are talking. */
  async function accept(q) {
    if (!pc || !q || typeof q.sdp !== 'string') return false;
    const mine = gen;
    try { await pc.setRemoteDescription({ type: 'answer', sdp: q.sdp }); } catch (e) { return false; }
    for (let i = 0; i < 200 && mine === gen && !there; i++) await new Promise((r) => setTimeout(r, 100));
    return mine === gen && there;
  }
  function bye() { send({ t: 'bye' }); return true; }
  /** where on the host's stage a point of the picture is (the picture is letterboxed inside the element) */
  function at(e) {
    const r = vid.getBoundingClientRect(), k = Math.min(r.width / STAGE.w, r.height / STAGE.h), w = STAGE.w * k, h = STAGE.h * k;
    return { x: Math.round((e.clientX - r.left - (r.width - w) / 2) / k), y: Math.round((e.clientY - r.top - (r.height - h) / 2) / k) };
  }
  vid.addEventListener('pointermove', (e) => { if (!there) return; const now = performance.now(); if (now - lastMove < 20) return; lastMove = now; send(Object.assign({ t: 'p' }, at(e))); });
  vid.addEventListener('pointerdown', (e) => { if (!there || (e.button !== 0 && e.button !== 2)) return; e.preventDefault(); send(Object.assign({ t: 'c', b: e.button }, at(e))); });
  vid.addEventListener('contextmenu', (e) => e.preventDefault());
  vid.addEventListener('pointerleave', (e) => { if (!there) return; const p = at(e); send({ t: 'p', x: Math.max(-38, Math.min(1318, p.x)), y: Math.max(-38, Math.min(758, p.y)) }); });      // (off the picture, on the side it left by: the host's stage shows an arrow there, 0.9.7)
  window.addEventListener('beforeunload', () => { send({ t: 'bye' }); });
  if (vid.requestVideoFrameCallback) { const tick = () => { frames++; vid.requestVideoFrameCallback(tick); }; vid.requestVideoFrameCallback(tick); }
  /** (for the checks) how the connection is doing */
  async function stats() {
    const out = { there, frames, w: vid.videoWidth, h: vid.videoHeight, slot: mySlot, roster, pair: '' };
    try { if (pc) { const r = await pc.getStats(); let pair = null; r.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; }); if (pair) { const l = r.get(pair.localCandidateId), m = r.get(pair.remoteCandidateId); out.pair = `${l ? l.candidateType : '?'} to ${m ? m.candidateType : '?'}`; } } } catch (e) { /* no numbers */ }
    return out;
  }
  return { offer, accept, reset, bye, send, stats, isThere: () => there, roster: () => roster, slot: () => mySlot };
})();
window.Visit = Visit;

// ------------------------------------------------------------------ the buttons
let toastT = 0;
function toast(text) { const t = $('toast'); t.textContent = String(text).slice(0, 160); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
function drawWho() {
  const r = Visit.roster(), box = $('who'); box.textContent = '';
  const add = (text, cls) => { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; box.appendChild(s); };
  if (r.host) add(r.host + ' (host)', 'host');
  for (const x of r.list) add(x.name + (x.slot === Visit.slot() ? ' (you)' : ''), x.slot === Visit.slot() ? 'me' : '');
}
function linesInto(box, say) {
  if (box.childElementCount === V.lines.length) return;
  box.textContent = '';
  V.lines.forEach((text, i) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => say(i); box.appendChild(b); });
}
const STATE = { idle: '', looking: 'Looking for somebody…', connecting: 'Knocking…', there: '' };
function render() {
  if (!V) return;
  const v = V.visit, h = V.hosting, away = v.state === 'there', busy = v.state === 'looking' || v.state === 'connecting';
  $('me').textContent = V.name;
  $('lamp').className = 'lamp' + (away ? ' there' : V.mode !== 'off' ? ' on' : '');
  $('state').textContent = away ? `visiting ${v.host ? v.host.name : ''}` : V.mode === 'off' ? 'offline' : h.visitors.length ? `${h.visitors.length} visiting you` : h.on ? (V.mode === 'open' ? 'open to anyone' : 'open to friends') : 'online';
  // the left side: the picture while away, the buttons at home
  $('vid').hidden = !away; $('idle').hidden = away || busy; $('busy').hidden = !busy; $('bar').hidden = !away;
  $('busyText').textContent = v.state === 'connecting' && v.host ? `Knocking at ${v.host.name}'s…` : STATE[v.state] || '';
  $('note').textContent = v.text || '';
  $('goRandom').disabled = V.mode === 'off'; $('goFriend').disabled = V.mode === 'off';
  $('idleText').textContent = V.mode === 'off' ? 'Visiting is switched off. Choose "Friends" or "Anyone" on the right to go online; until then nothing is sent or looked for.' : 'You see their field and play on it with a pointer of your own: weaken wild Pokémon, throw balls. Whatever is caught while you are there, each of you gets one.';
  if (away) { linesInto($('lines'), (i) => Visit.send({ t: 'say', i })); drawWho(); }
  // the right side
  for (const r of document.querySelectorAll('#modes input')) r.checked = r.value === V.mode;
  $('code').textContent = V.code;
  $('hostNote').textContent = V.mode === 'off' ? '' : !h.stage ? 'To be visited, open MyStream (the porygon-z key in the Field Dex, or the tray menu): visitors see its stage, and only what you put on it. Going visiting works without it.'
    : !h.ready ? 'MyStream is starting…' : h.on ? (h.boards.some((s) => s === 'on') ? `You can be visited now${h.visitors.length ? '' : ': nobody is here yet'}. Up to ${V.max} visitors at a time.` : 'Reaching the meeting places…') : '';
  $('openMs').hidden = V.mode === 'off' || h.stage;
  const g = $('guests'), sig = JSON.stringify(h.visitors);
  if (g.dataset.sig !== sig) {
    g.dataset.sig = sig; g.textContent = '';
    for (const x of h.visitors) {
      const row = document.createElement('div'); row.className = 'guest';
      const name = document.createElement('span'); name.textContent = x.name; if (x.friend) { const s = document.createElement('small'); s.textContent = 'friend'; name.appendChild(s); }
      const a = document.createElement('button'); a.textContent = 'Send home'; a.onclick = () => ov.kick({ vid: x.vid, block: false });
      const b = document.createElement('button'); b.className = 'bad'; b.textContent = 'Block'; b.onclick = () => ov.kick({ vid: x.vid, block: true });
      row.appendChild(name); row.appendChild(a); row.appendChild(b); g.appendChild(row);
    }
  }
  $('hostLines').hidden = !h.visitors.length || away; $('hostChat').hidden = !h.visitors.length || away;
  if (h.visitors.length) linesInto($('hostLines'), (i) => ov.say(i));
  const cls = $('cls');
  if (cls.childElementCount !== V.classes.length) { cls.textContent = ''; V.classes.forEach((n, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = n; cls.appendChild(o); }); }
  cls.value = String(V.cls); $('num').textContent = V.name.replace(/^.* /, '');
  const cur = $('cursors'), csig = JSON.stringify([V.cursors, V.cursor]);
  if (cur.dataset.sig !== csig) {
    cur.dataset.sig = csig; cur.textContent = '';
    for (const c of V.cursors.slice().sort((x, y) => (y.won ? 1 : 0) - (x.won ? 1 : 0) || x.i - y.i)) {      // (0.9.7: over two hundred; the won ones first)
      const b = document.createElement('button'); b.className = 'cur' + (c.i === V.cursor ? ' on' : '') + (c.won ? '' : ' locked'); b.disabled = !c.won; b.title = c.won ? 'Use this pointer' : 'To win it: ' + c.need;
      const p = document.createElement('span'); p.className = 'vp'; if (typeof Pointers !== 'undefined') Pointers.paint(p, c.i); else p.dataset.k = c.k; p.appendChild(document.createElement('i'));
      const n = document.createElement('b'); n.textContent = c.n;
      b.appendChild(p); b.appendChild(n); b.appendChild(document.createTextNode(c.won ? (c.i === V.cursor ? 'in use' : 'won') : c.need));
      b.onclick = () => ov.set({ cursor: c.i }).then(take);
      cur.appendChild(b);
    }
  }
  $('blockedN').textContent = V.blocked.length ? `(${V.blocked.length})` : '';
  const bl = $('blocked'), bsig = JSON.stringify(V.blocked);
  if (bl.dataset.sig !== bsig) {
    bl.dataset.sig = bsig; bl.textContent = '';
    if (!V.blocked.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Nobody. A blocked Trainer cannot visit you, and a random visit never takes you to them.'; bl.appendChild(p); }
    for (const x of V.blocked.slice(0, 30)) { const row = document.createElement('div'); row.className = 'blk'; const s = document.createElement('span'); s.textContent = x.name; const b = document.createElement('button'); b.textContent = 'Unblock'; b.onclick = () => ov.set({ unblock: x.tag }).then(take); row.appendChild(s); row.appendChild(b); bl.appendChild(row); }
    if (V.blocked.length > 1) { const b = document.createElement('button'); b.textContent = 'Unblock all'; b.onclick = () => ov.set({ unblock: 'all' }).then(take); bl.appendChild(b); }
  }
}
function take(v) { if (v) { V = v; render(); } }

for (const r of document.querySelectorAll('#modes input')) r.addEventListener('change', () => { if (r.checked) ov.set({ mode: r.value }).then(take); });
$('cls').addEventListener('change', () => ov.set({ cls: +$('cls').value }).then(take));
$('copy').onclick = () => { navigator.clipboard.writeText(V.code).then(() => toast('Your friend code is on the clipboard.')).catch(() => toast('Mark the code and copy it by hand.')); };
let sureNew = 0;
$('newCode').onclick = () => { if (Date.now() - sureNew > 5000) { sureNew = Date.now(); toast('Click "New" again: the old code stops working at once.'); return; } sureNew = 0; ov.set({ newCode: true }).then(take); };
$('goRandom').onclick = () => ov.visit({ kind: 'random' });
const goFriend = () => { const code = $('friend').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 10) { toast('A friend code has ten letters and digits.'); return; } ov.visit({ kind: 'friend', code }); };
$('goFriend').onclick = goFriend;
$('friend').addEventListener('keydown', (e) => { if (e.key === 'Enter') goFriend(); });
$('friend').addEventListener('input', () => { const el = $('friend'), raw = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); el.value = raw.length > 5 ? raw.slice(0, 5) + '-' + raw.slice(5) : raw; });
$('openMs').onclick = () => ov.openMyStream();
const hostSend = () => { const el = $('hostText'), t = el.value.trim(); if (!t) return; ov.sayText(t).then((ok) => { if (ok) el.value = ''; else toast('Wait a moment between lines.'); }); };      // (0.9.7) the host's own words
$('hostSend').onclick = hostSend;
$('hostText').addEventListener('keydown', (e) => { if (e.key === 'Enter') hostSend(); });
$('stop').onclick = () => ov.leave();
$('home').onclick = () => ov.leave();
let sureBlock = 0;
$('block').onclick = () => { if (Date.now() - sureBlock > 5000) { sureBlock = Date.now(); toast('Click again to block this Trainer: you will not meet again.'); return; } sureBlock = 0; ov.blockHost(); };
ov.onView(take);
ov.view().then(take);
