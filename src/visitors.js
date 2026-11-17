// Screen Trainer — online visiting, the game's side (0.8).
//
// On the MyStream stage: the pointers of the Trainers who are visiting, what their clicks do, and telling them what
// was caught. Everything a visitor sends has been checked and counted by online.js in the main process before it
// arrives here ({ t: 'join' | 'leave' | 'p' | 'c' | 'say', slot, ... }); this file decides what a click may do.
//
// A visitor can hit a wild Pokémon (left click), throw a ball at one (right click, or the ball button) and pet. A
// visitor's ball is a plain Poké Ball that is not taken from the host's Bag. A visitor cannot move, order or take the
// host's Pokémon, pick up what lies on the ground, or touch the Day Care, the pipe, the trade pads, Mewtwo or a
// rival's team. The ball on top of the fountain takes a visitor home.
//
// Whatever is caught while visitors are here, everyone present gets one (G.catch calls Visitors.caught).
//
// On every page that runs the game: `Online`, what the ball on top of the fountain does for the player at home
// (src/square.js asks for it).
'use strict';

const Visitors = (() => {
  const KEYS = ['poke', 'great', 'ultra', 'master', 'star', 'badge', 'crown', 'bolt'];
  const paint = (el, i) => { if (typeof Pointers !== 'undefined') Pointers.paint(el, i | 0); else el.dataset.k = KEYS[i] || KEYS[0]; };      // (0.9.7: over two hundred pointers, pointers.js)
  const scale = () => (typeof window !== 'undefined' && window.__ptrScale > 0 ? window.__ptrScale : 1.5);      // (0.9.7: as large as the owner's own, MyStream's pointer tab)
  const list = new Map();                        // slot -> { slot, name, key, x, y, tx, ty, el, edge, tag, say, sayT, seen }
  let layer = null, hostSay = null, hostSayT = 0;
  const has = typeof window !== 'undefined' && typeof document !== 'undefined';
  const out = (m) => { try { if (has && window.st && window.st.vOut) window.st.vOut(m); } catch (e) { /* no bridge here */ } };
  function ensure() {
    if (layer || !has) return layer;
    const host = document.getElementById('screen') || document.body;
    if (!host || !host.appendChild) return null;
    layer = document.createElement('div'); layer.id = 'visitors';
    host.appendChild(layer);
    return layer;
  }
  // Where a visitor's pointer is. Off the stage (the visitor's mouse left the picture) it is an arrow on the rim in the
  // pointer's colours, pointing to where it went (0.9.7, owner's list 11-16 update 4), as the owner's own is.
  const outside = (v) => v.tx < 0 || v.ty < 0 || v.tx > G.W || v.ty > G.H;
  function place(v) {
    const k = scale();
    if (outside(v)) {
      v.el.hidden = true;
      if (v.edge) {
        const cx = G.W / 2, cy = G.H / 2, dx = v.tx - cx, dy = v.ty - cy, IN = 26, f = Math.min(dx ? (cx - IN) / Math.abs(dx) : Infinity, dy ? (cy - IN) / Math.abs(dy) : Infinity), s = G.toScreen(cx + dx * f, cy + dy * f);
        v.edge.hidden = false; v.edge.style.transform = `translate3d(${Math.round(s[0])}px, ${Math.round(s[1])}px, 0) rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg) scale(${Math.min(2, 0.6 + k * 0.4)})`;
      }
      return;
    }
    if (v.edge) v.edge.hidden = true;
    v.el.hidden = false;
    const s = G.toScreen(v.x, v.y); v.el.style.transform = `translate3d(${Math.round(s[0])}px, ${Math.round(s[1])}px, 0) scale(${k})`;
  }
  function join(m) {
    if (!ensure() || !Number.isInteger(m.slot) || m.slot < 1 || m.slot > 3) return;
    leave(m.slot, true);
    const el = document.createElement('div'); el.className = 'vp'; paint(el, m.cursor); el.dataset.slot = String(m.slot);
    const edge = document.createElement('div'); edge.className = 'vpEdge vEdge'; paint(edge, m.cursor); edge.hidden = true; edge.appendChild(document.createElement('b')); edge.appendChild(document.createElement('i'));
    const arrow = document.createElement('i'), tag = document.createElement('span'), say = document.createElement('b');
    tag.className = 'vpName'; tag.textContent = String(m.name || 'Trainer').slice(0, 24); say.className = 'vpSay'; say.hidden = true;
    el.appendChild(arrow); el.appendChild(tag); el.appendChild(say); layer.appendChild(el); layer.appendChild(edge);
    const v = { slot: m.slot, name: tag.textContent, key: el.dataset.k, cursor: m.cursor | 0, x: G.W / 2, y: G.H * 0.3, tx: G.W / 2, ty: G.H * 0.3, el, edge, tag, say, sayT: 0, seen: false };
    list.set(m.slot, v); place(v);
    if (m.quiet) return;
    G.toast({ title: `${v.name} came to visit`, text: 'They can help weaken and catch. Whatever is caught, each of you gets one.', tone: 'info', dur: 5 });
    try { Sound.play('open'); } catch (e) { /* silent */ }
  }
  function leave(slot, quiet) {
    const v = list.get(slot);
    if (!v) return;
    list.delete(slot);
    if (typeof Rivals !== 'undefined' && Rivals.guestGone) Rivals.guestGone(slot);      // its team goes home with it (0.9.7)
    try { v.el.remove(); if (v.edge) v.edge.remove(); } catch (e) { /* gone */ }
    if (!quiet) G.toast({ title: `${v.name} went home`, text: '', tone: 'info', dur: 3.5 });
  }
  function speak(slot, text) {
    text = String(text || '').slice(0, slot === 0 ? 120 : 40);      // (the host's own typed words may be longer, 0.9.7)
    if (!text) return;
    if (slot === 0) {                                       // the host: a bubble over the fountain's top, or the middle of the field
      if (!ensure()) return;
      if (!hostSay) { hostSay = document.createElement('b'); hostSay.className = 'vpSay host'; layer.appendChild(hostSay); }
      const top = typeof Square !== 'undefined' && Square.state().top, s = G.toScreen(top ? top.x : G.W / 2, top ? top.y - 30 : G.H * 0.2);
      hostSay.textContent = text; hostSay.hidden = false; hostSay.style.left = Math.round(s[0]) + 'px'; hostSay.style.top = Math.round(s[1]) + 'px'; hostSayT = Math.max(4, 1.5 + text.split(/\s+/).length * 0.4);
      return;
    }
    const v = list.get(slot);
    if (v) { v.say.textContent = text; v.say.hidden = false; v.sayT = 4; }
  }
  /** what a visitor's click does (x, y in the world) */
  function click(v, b, x, y) {
    v.tx = v.x = x; v.ty = v.y = y; place(v);
    // the ball on top of the fountain is the way home, whoever happens to stand in front of it
    if (b === 0 && typeof Square !== 'undefined' && Square.hit(x, y) === 'top') { out({ t: 'home', slot: v.slot }); return; }
    const hit = G.pick(x, y);
    if (!hit || hit.kind === 'place') return;
    if (hit.kind === 'ball') { G.throwBall(hit.actor, { by: v.slot, x }); return; }
    if (hit.kind !== 'actor') return;                       // what lies on the ground, Mewtwo, the badge button: the host's own
    const a = hit.actor;
    if (a.side === 'wild') {
      if (a.rival) return;                                  // a Trainer battle is the host's
      if (b === 2) G.throwBall(a, { by: v.slot, x });
      else if (G.peaceful(a)) Events.pet(a);
      else G.poke(a, x, y);
    } else if (b === 0) G.pet(a);
  }
  function input(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') { join(m); return; }
    if (m.t === 'leave') { leave(m.slot); return; }
    if (m.t === 'say') { speak(m.slot | 0, m.text); return; }
    if (m.t === 'team') { const v = list.get(m.slot); if (v && Array.isArray(m.list)) { v.team = m.list.slice(0, 6); v.teamAt = 0; } return; }      // (0.9.7) a visitor's team, as numbers; Rivals.guest builds it
    const v = list.get(m.slot);
    if (!v || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    if (m.t === 'p') { const was = outside(v); v.tx = m.x; v.ty = m.y; if (!v.seen || (was && !outside(v))) { v.seen = true; v.x = m.x; v.y = m.y; } }      // (back in from off the stage: it appears where it came in)
    else if (m.t === 'c') { try { click(v, m.b === 2 ? 2 : 0, m.x, m.y); } catch (e) { /* a click that found nothing to do */ } }
  }
  // ---- visitors' teams (0.9.7): one at a time stands on the field as a 'guest' rival team (src/rivals.js); when it
  // leaves (a friendly battle ended, or nobody battled it for a long while and another visitor is waiting) the next one
  // comes, and after a rest the same one again, healthy, as it is built anew from the numbers.
  const TEAM_REST = 25, TEAM_TURN = 240;
  let teamT = 0;
  function teams(dt) {
    teamT -= dt;
    if (teamT > 0 || typeof Rivals === 'undefined' || !Rivals.guest) return;
    teamT = 2;
    const here = Rivals.guestSlot ? Rivals.guestSlot() : 0;
    for (const v of list.values()) if (v.slot === here) v.teamAt = G.now;      // (the time it was last on the field)
    if (Rivals.active()) {
      const st = Rivals.state(), waiting = [...list.values()].some((v) => v.team && v.slot !== here);
      if (here && st && st.phase === 'wait' && waiting && G.now - (list.get(here) || {}).teamCame > TEAM_TURN) Rivals.guestGone(here);      // another visitor's turn
      return;
    }
    const next = [...list.values()].filter((v) => v.team && v.team.length && G.now - (v.teamAt || -999) > TEAM_REST).sort((a, b) => (a.teamAt || 0) - (b.teamAt || 0))[0];
    if (!next) return;
    const c = typeof Pointers !== 'undefined' ? Pointers.colors(next.cursor) : null;
    if (Rivals.guest(next.slot, next.name, next.team, c ? c.a : '')) { next.teamAt = G.now; next.teamCame = G.now; }
  }
  /** where a visitor's pointer is in the world (for its team to follow), or null when it is off the stage */
  function where(slot) { const v = list.get(slot); return v && !outside(v) ? { x: v.x, y: v.y } : null; }
  /** every frame: the pointers glide to where they were last reported, the bubbles run out */
  function step(dt) {
    if (hostSay && hostSayT > 0) { hostSayT -= dt; if (hostSayT <= 0) hostSay.hidden = true; }
    if (!list.size) return;
    try { teams(dt); } catch (e) { /* a team that could not be built waits */ }
    const k = Math.min(1, dt * 26);                          // (0.9.7: they follow more closely)
    for (const v of list.values()) {
      if (outside(v)) { place(v); continue; }            // (off the stage: the arrow on the rim; it glides in again from where it left)
      if (v.x !== v.tx || v.y !== v.ty) { v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; if (Math.abs(v.tx - v.x) < 0.5 && Math.abs(v.ty - v.y) < 0.5) { v.x = v.tx; v.y = v.ty; } place(v); }
      else if (v.el.hidden) place(v);
      if (v.sayT > 0) { v.sayT -= dt; if (v.sayT <= 0) v.say.hidden = true; }
    }
  }
  /** a Pokémon was caught here: everyone who is visiting gets one like it (only numbers travel; each game builds its own) */
  function caught(m, ball) {
    if (!list.size || !m) return;
    out({ t: 'catch', by: (ball && ball.by) | 0, mon: { sp: m.sp, lvl: m.lvl, shiny: !!m.shiny, nat: m.nat, iv: Array.isArray(m.iv) ? m.iv.slice(0, 6) : undefined, fem: m.fem === 1 ? true : m.fem === 0 && D.dex[m.sp] && D.dex[m.sp].gn > 0 ? false : undefined, moves: (m.moves || []).slice(0, 4), sz: m.sz } });
    const who = ball && ball.by ? list.get(ball.by) : null;
    if (who) G.toast({ title: `${who.name} threw that ball`, text: 'Everyone here gets one.', tone: 'info', dur: 3.5 });
  }
  /** Rotom, Mewtwo or Porygon-Z let itself be caught here: it goes home with the visitors as well */
  function helper(key) { if (list.size) out({ t: 'helper', key }); }
  const D = typeof DATA !== 'undefined' ? DATA : { dex: {} };
  if (has && window.st && window.st.onVIn) { window.st.onVIn(input); out({ t: 'ready' }); }      // (a stage page that started again asks who is here)
  return { input, step, caught, helper, where, count: () => list.size, state: () => ({ n: list.size, list: [...list.values()].map((v) => ({ slot: v.slot, name: v.name, key: v.key, x: Math.round(v.x), y: Math.round(v.y), say: v.sayT > 0 ? v.say.textContent : '', off: outside(v), edge: !!(v.edge && !v.edge.hidden), team: v.team ? v.team.length : 0 })), host: hostSayT > 0 && hostSay ? hostSay.textContent : '' }) };
})();

/** the ball on top of the fountain, for the player at home */
const Online = {
  buttonLabel: () => (Visitors.count() ? `Online visiting · ${Visitors.count()} Trainer${Visitors.count() === 1 ? '' : 's'} here` : 'Visit a random online Screen Trainer'),
  button: () => { try { if (window.st && window.st.visitOpen) window.st.visitOpen(true); } catch (e) { /* no bridge here */ } },
};
