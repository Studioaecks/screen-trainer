// Screen Trainer — other Trainers (0.6): random trainer battles, and now and then a Gym Leader.
//
// A visiting Trainer is a mouse pointer of its own that hops onto the screen with its team (six Pokémon for a
// Trainer, the leader's own team for a Gym Leader). A visitor never starts a fight:
//   - Until you click one of its Pokémon they only loiter: they stroll and nap like any settled wild Pokémon, and the
//     careful ones keep close to their Trainer. After LINGER seconds without a click the Trainer moves on.
//   - Click one of them and the battle is on. A click is an order, no more: your leader is told to go for the one you
//     clicked (a double-click on another one names a new target), and decides for itself whether to listen, as with
//     every order (G.obeyChance in src/game.js). The rest of your team each take the nearest rival. The other
//     Trainer's pointer then picks targets for its own leader, with a little click of its own.
//   - They cannot be caught, do not run, and your clicks do them no harm. Knock them all out to win (experience as
//     usual, and a prize); if your whole team faints, the visitor wins and leaves.
//   - While the battle is on nobody who goes down gets up again (no reviving, no Poké Center for the fainted), and
//     wild Pokémon keep out of it (keepClear in src/game.js).
//   - A Gym Leader who leaves without handing over the badge can be called back whenever you like: a button with
//     that badge stays on the left edge of the screen (save.gymRetry) until the badge is won.
// Gym Leaders come for the badges, in the order of the games: the next badge you do not have, once its old task is
// done (src/honors.js keeps the tasks). Winning is what earns the badge.
// Option: Wild encounters > "Trainer battles" (setting trainerBattles). To try one: G.command({ type: 'rival', kind: 'gym' }).
//
// A rival's Pokémon are wild-side actors marked a.rival; game.js asks about that mark in a few places (catching,
// fleeing, who the team targets). Nothing here is saved except the badge and two counters.
'use strict';

const Rivals = (() => {
  const EVERY = { off: 0, rare: 40, sometimes: 15, often: 6 };       // minutes between visits, on average
  const LINGER = 80, GYM_SHARE = 0.25;
  const CLASSES = ['Youngster', 'Lass', 'Bug Catcher', 'Hiker', 'Ace Trainer', 'Camper', 'Picnicker', 'Swimmer', 'Black Belt', 'Beauty', 'Bird Keeper', 'Fisher', 'Scientist', 'Pokéfan'];
  const NAMES = ['Robin', 'Sam', 'Alex', 'Kit', 'Jo', 'Mika', 'Dana', 'Lou', 'Noa', 'Remy', 'Tess', 'Ivo', 'Wren', 'Pax', 'Juno', 'Cleo'];
  const COLORS = ['#ff6b6b', '#4dc3ff', '#7be07b', '#ffb347', '#c792ea', '#ff8fb3', '#5fe0d0'];
  const CAREFUL = ['Careful', 'Timid', 'Calm', 'Bashful', 'Modest', 'Gentle'];
  // badge id -> the leader, the team (species) and a line of its own
  const GYMS = {
    1: ['Brock', [74, 95], 'My Pokémon are as hard as rock. Let us see you chip at them.'], 2: ['Misty', [120, 121], 'My Water Pokémon will wash your plans away!'],
    3: ['Lt. Surge', [100, 25, 26], 'Electric Pokémon saved my skin. Now they zap yours!'], 4: ['Erika', [71, 114, 45], 'Oh, hello. My Grass Pokémon would love to dance with yours.'],
    5: ['Koga', [109, 89, 109, 110], 'Poison works slowly, and it always works. Despair!'], 6: ['Sabrina', [64, 122, 49, 65], 'I saw you coming. I see how this ends, too.'],
    7: ['Blaine', [58, 77, 78, 59], 'Hah! My Fire Pokémon burn hot. Got a Burn Heal?'], 8: ['Giovanni', [111, 51, 31, 34, 112], 'So you made it this far. The ground itself answers to me.'],
    9: ['Falkner', [16, 17], 'Bird Pokémon are no pushovers. Watch them fly!'], 10: ['Bugsy', [11, 14, 123], 'I never lose when it comes to Bug Pokémon. Let me show you my research!'],
    11: ['Whitney', [35, 241], 'Everybody was into Pokémon, so I got into it too! I am good, you know.'], 12: ['Morty', [92, 93, 94, 93], 'I train with ghosts to see what others cannot.'],
    13: ['Chuck', [57, 62], 'WAHAHAH! My roaring muscles and my Fighting Pokémon await!'], 14: ['Jasmine', [81, 81, 208], 'Um... please do your best. My Steel Pokémon will, too.'],
    15: ['Pryce', [86, 87, 221], 'Pokémon know many winters. Mine have weathered them all.'], 16: ['Clair', [148, 148, 148, 230], 'I am the best Dragon master there is. Are you ready to lose?'],
  };
  let R = null, nextIn = null, freq = '', btn = null;
  const gap = (f) => EVERY[f] * 60 * U.rand(0.5, 1.5);
  const alive = () => (R ? R.mons.filter((a) => !a.gone && a.state !== 'faint' && a.mon.hp > 0) : []);
  const fighting = () => !!R && R.phase === 'battle';

  // ------------------------------------------------------------------ the pointer
  function makePointer(color, gym) {
    const el = document.createElement('div'); el.className = 'rival' + (gym ? ' gym' : '');
    el.innerHTML = `<svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true"><path d="M3 2 L3 27 L9.5 21 L14 31.5 L18.5 29.5 L14 19.5 L23 19.5 Z" fill="${gym ? '#ffe36a' : '#ffffff'}" stroke="${color}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="8" r="5.2" fill="${color}" stroke="#10131b" stroke-width="1.4"/><path d="M14.8 8 H25.2" stroke="#10131b" stroke-width="1.4"/><circle cx="20" cy="8" r="1.6" fill="#fff" stroke="#10131b" stroke-width="1"/></svg>`;
    const who = document.createElement('span'), words = document.createElement('span');      // (made one by one: the headless playtests have no HTML parser)
    who.className = 'who'; words.className = 'say'; words.hidden = true;
    el.appendChild(who); el.appendChild(words);
    try { (document.getElementById('screen') || document.body).appendChild(el); } catch (e) { /* no page to stand on */ }
    return { el, who, words };
  }
  function say(text, seconds) { if (!R) return; R.words.textContent = text; R.words.hidden = !text; R.sayT = seconds || 5; }
  function placePointer() { const s = G.toScreen(R.x, R.y), x = s[0], y = s[1] + Math.sin(G.now * 3) * 2 - (R.hop > 0 ? Math.sin((R.hop / 0.5) * Math.PI) * 26 : 0); R.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${R.press > 0 ? ' scale(.86)' : ''}`; }

  // ------------------------------------------------------------------ arriving
  function start(kind) {
    if (R || !Sprites.ready() || !G.save.team.length || (typeof Events !== 'undefined' && Events.active())) return null;
    const sv = G.save, team = sv.team, avg = team.reduce((s, m) => s + m.lvl, 0) / team.length;
    const again = retryBadge(), due = typeof Honors.nextGym === 'function' ? Honors.nextGym(sv) : null;
    const badge = (again && Honors.BADGES.find((b) => b.id === again)) || due, gym = kind === 'gym' ? badge : kind === 'trainer' ? null : badge && U.chance(GYM_SHARE) ? badge : null;
    if (kind === 'gym' && !gym) return null;
    let species, name, line;
    if (gym) { const g = GYMS[gym.id]; species = g[1].filter((sp) => Sprites.available(sp)); name = 'Gym Leader ' + g[0]; line = g[2]; if (!species.length) return null; }
    else {
      const pool = (G.pool || []).filter((id) => !DATA.dex[id].lg && !DATA.dex[id].bb);
      if (!pool.length) return null;
      species = Array.from({ length: 6 }, () => U.pick(pool)); name = `${U.pick(CLASSES)} ${U.pick(NAMES)}`; line = U.pick(['I challenge you! Click one of my Pokémon when you are ready.', 'Our eyes met. That means a battle! Click one of mine to begin.', 'Fancy a battle? Click one of my Pokémon.']);
    }
    const side = U.chance(0.5) ? -1 : 1, color = gym ? '#c8961e' : U.pick(COLORS);
    R = { kind: gym ? 'gym' : 'trainer', badge: gym || null, name, color, phase: 'wait', t: 0, mons: [], x: side < 0 ? -40 : G.W + 40, y: G.H * U.rand(0.3, 0.6), tx: G.W * (side < 0 ? 0.22 : 0.78), ty: G.H * U.rand(0.35, 0.55), hop: 0.5, press: 0, sayT: 0, pickT: 2, leadTarget: null, target: null, last: null, said: 0 };
    Object.assign(R, makePointer(color, !!gym));
    R.who.textContent = name;
    species.forEach((sp, i) => {
      const lvl = U.clamp(Math.round(avg + (gym ? 1 + i * 0.6 : U.rand(-2, 1.4))), 2, 100);
      const a = G.addWild(sp, lvl, false, null, { event: true });
      a.rival = R; a.terr = false; a.aggro = false; a.calm = false; a.loiter = true; a.settledAt = G.now; a.stay = 9999;
      R.mons.push(a);
    });
    G.toast({ title: gym ? `${name} wants to battle!` : `${name} would like to battle!`, text: gym ? `For the ${gym.n}. Click one of the leader's Pokémon to begin.` : 'Click one of their Pokémon to begin. They will not start it.', icon: gym ? Sprites.badge(gym.id) : Sprites.icon(species[0]), tone: 'rare', dur: 8 });
    Sound.play('alert', { x: G.W / 2 });
    say(line, 7);
    placePointer();
    return R;
  }

  // ------------------------------------------------------------------ a visitor's team (0.9.7, owner's list 11-16 update 6)
  // A Trainer visiting online brings its team: online.js let only numbers through, src/visitors.js hands them here. They
  // are a rival team of the kind 'guest': no pointer of their own (the visitor's pointer is the Trainer), they stay as long
  // as the visitor does, and follow its pointer about. A double-click on one of them starts a friendly battle, with the
  // rules of a Trainer battle; nothing is won but the honour (save.stats.friendly) and the experience, and nothing of the
  // visitor's own Pokémon changes: these are copies, built anew from the numbers. One visitor's team at a time.
  function guest(slot, name, list, color) {
    if (R || !Sprites.ready() || !Array.isArray(list) || !list.length || typeof Showdown === 'undefined') return null;
    const mons = [];
    for (const g of list.slice(0, 6)) {
      let r = null;
      try { r = Showdown.build(g, { DATA, Mon, Items }); } catch (e) { r = null; }
      if (r && r.mon && Sprites.available(r.mon.sp)) mons.push(r.mon);
    }
    if (!mons.length) return null;
    R = { kind: 'guest', slot, badge: null, name: String(name || 'A visitor').slice(0, 24), color: color || '#7ee08a', phase: 'wait', t: 0, mons: [], x: G.W / 2, y: G.H * 0.3, tx: G.W / 2, ty: G.H * 0.3, hop: 0, press: 0, sayT: 0, pickT: 2, leadTarget: null, target: null, last: null, said: 0 };
    Object.assign(R, makePointer(R.color, false));
    R.el.style.display = 'none';                          // (the visitor's own pointer stands for this Trainer: src/visitors.js)
    for (const m of mons) {
      const a = G.addWild(m.sp, m.lvl, !!m.shiny, null, { event: true, quiet: true });
      Object.assign(a.mon, { nat: m.nat, iv: m.iv, moves: m.moves && m.moves.length ? m.moves.slice(0, 4) : a.mon.moves, fem: m.fem, sz: m.sz !== undefined ? m.sz : a.mon.sz });
      a.mon.hp = Mon.maxHp(a.mon);
      a.rival = R; a.guest = slot; a.terr = false; a.aggro = false; a.calm = false; a.loiter = true; a.settledAt = G.now; a.stay = 9999;
      R.mons.push(a);
    }
    G.toast({ title: `${R.name} brought their team`, text: 'Double-click one of their Pokémon for a friendly battle.', icon: Sprites.icon(mons[0].sp), tone: 'info', dur: 6 });
    return R;
  }
  /** that visitor went home: its team goes with it */
  function guestGone(slot) { if (R && R.kind === 'guest' && R.slot === slot) { const r = R; leave(''); if (R === r) { r.hold = 0; r.t = 99; } } }
  const tellVisitor = (s) => { try { if (R && R.kind === 'guest' && window.st && window.st.vOut) window.st.vOut({ t: 'duel', slot: R.slot, s }); } catch (e) { /* no bridge here */ } };

  // ------------------------------------------------------------------ the player's clicks
  function click(a, button) {
    if (!R || a.rival !== R) return;
    if (button === 2) { G.say(a, 'It belongs to another Trainer!', { col: '#ffd0d0', size: 12 }); return; }
    if (button !== 0) return;
    if (R.phase === 'wait' && R.kind === 'guest' && !(R.last && R.last.a === a && G.now - R.last.t < 0.5)) {      // a visitor's team: a double-click starts it
      R.last = { a, t: G.now }; FX.text(a.x, a.y - a.h - 12, 'double-click for a friendly battle', { col: '#c8ffd0', size: 11, dur: 1.2 });
      return;
    }
    if (R.phase === 'wait') {
      R.last = null;
      if (R.kind === 'guest') tellVisitor('start');
      R.phase = 'battle'; R.t = 0; G.lastBattle = G.now;
      for (const m of R.mons) { m.loiter = false; m.calm = false; m.nap = 0; m.aggro = true; m.stay = 9999; }
      say(R.kind === 'gym' ? 'Show me what you have got!' : 'Here we go!', 3);
      if (R.kind === 'guest') G.toast({ title: `A friendly battle with ${R.name}!`, text: 'Their team against yours. Nothing is lost: these are copies of their Pokémon.', icon: Sprites.icon(R.mons[0].mon.sp), tone: 'rare', dur: 5 });
      order(a);
      return;
    }
    if (R.phase !== 'battle' || a === R.leadTarget) return;
    if (R.last && R.last.a === a && G.now - R.last.t < 0.5) { R.last = null; order(a); }
    else { R.last = { a, t: G.now }; FX.text(a.x, a.y - a.h - 12, 'double-click to switch', { col: '#ffe9a8', size: 11, dur: 1.1 }); }
  }
  /** An order: "go for that one". The leader hears it at once and decides for itself whether to listen (think in
   *  src/game.js rolls its obedience and says so on the screen when it does not). */
  function order(a) {
    R.leadTarget = a; R.orders = (R.orders || 0) + 1;
    FX.ring(a.x, a.y - a.h * 0.5, 6, a.w + 30, '#ffe14d', 0.7, 3); Sound.play('select');
    const lead = G.leader();
    if (lead) { lead.obeyT = 0; lead.obeyFor = 0; lead.thinkT = 0; }
  }

  // ------------------------------------------------------------------ calling a Gym Leader back
  const retryBadge = () => { const sv = G.save, id = sv ? sv.gymRetry | 0 : 0; return id && GYMS[id] && !(sv.badges || {})[id] ? id : 0; };
  /** the badge button on the left edge of the screen: there while a Gym Leader can be called back, gone otherwise */
  function syncButton() {
    const id = !R && G.save && G.save.team.length ? retryBadge() : 0;
    if (!id) { if (btn) { btn.el.remove(); btn = null; } return; }
    if (!btn || btn.id !== id) {
      if (btn) btn.el.remove();
      const el = document.createElement('div'), pic = document.createElement('span'), tip = document.createElement('span'), src = Sprites.badge(id);
      el.className = 'gymBtn'; pic.className = 'pic'; tip.className = 'tip';
      if (src) { const im = new Image(); im.draggable = false; im.src = src; pic.appendChild(im); } else pic.textContent = String(id);
      tip.textContent = `Rechallenge Gym Leader ${GYMS[id][0]}`;
      el.appendChild(pic); el.appendChild(tip);
      try { (document.getElementById('screen') || document.body).appendChild(el); } catch (e) { /* no page to stand on */ }
      btn = { id, el, x: 0, y: 0, r: 24, hot: false };
    }
    const x = 34, y = Math.round((G.SH || G.H) * 0.42);
    if (x !== btn.x || y !== btn.y) { btn.x = x; btn.y = y; btn.el.style.transform = `translate3d(${x - 24}px, ${y - 24}px, 0)`; }
  }
  /** is the pointer (in screen coordinates) on the badge button? */
  const hit = (sx, sy) => !!btn && Math.hypot(sx - btn.x, sy - btn.y) <= btn.r + 4;
  const hover = (on) => { if (btn && btn.hot !== !!on) { btn.hot = !!on; if (btn.el.classList) btn.el.classList.toggle('hot', btn.hot); } };
  /** the button was clicked (or the Pokédex asked): the Gym Leader comes back for another go */
  function rematch() {
    const id = retryBadge();
    if (!id) return null;
    const r = start('gym');
    if (!r) G.toast({ title: `Gym Leader ${GYMS[id][0]} cannot come right now`, text: 'Try again in a moment, when nobody else is visiting.', icon: Sprites.badge(id), tone: 'info', dur: 4 });
    return r;
  }
  /** a Gym Leader is leaving and the badge stays with them: remember it, and say how to call them back */
  function keepForLater(lost) {
    const sv = G.save, gym = R && R.badge;
    if (!gym || (sv.badges || {})[gym.id]) return;
    const first = sv.gymRetry !== gym.id;
    sv.gymRetry = gym.id; G.touch();
    if (lost || first) G.toast({ title: lost ? `${R.name} won this time` : `${R.name} will wait`, text: `Rechallenge whenever you like: click the ${gym.n} on the left edge of the screen.`, icon: Sprites.badge(gym.id), tone: 'info', dur: 8 });
  }

  // ------------------------------------------------------------------ how it ends
  function leave(text) {
    if (!R || R.phase === 'leave') return;
    // (0.9.3) The Trainer stays where it is long enough to read what it says (about a third of a second a word, at
    // least three seconds), then walks off at an easy pace. It used to make for the edge at once and was gone in a
    // second and a half, before the owner had ever read a word of it.
    R.hold = text ? Math.max(3, 1.5 + text.split(/\s+/).length * 0.35) : 0.4;
    R.phase = 'leave'; R.t = 0; say(text, R.hold + 2.5);
    for (const a of alive()) { a.aggro = false; a.loiter = false; G.flee(a, 'was called back.', false); G.save.stats.fled--; }
    R.tx = R.x; R.ty = R.y; R.hop = 0.5;
    R.out = R.x < G.W / 2 ? -60 : G.W + 60;
  }
  function won() {
    const sv = G.save, gym = R.badge;
    if (R.kind === 'guest') {                             // a friendly battle: the honour, the experience, no prize
      sv.stats.friendly = (sv.stats.friendly || 0) + 1; tellVisitor('lost');
      G.toast({ title: `You won the friendly battle against ${R.name}!`, text: '', icon: Sprites.icon(R.mons[0].mon.sp), tone: 'gold', dur: 6 });
      leave(''); G.saveNow(); return;
    }
    sv.stats.trainers = (sv.stats.trainers || 0) + 1;
    const prize = U.pick(['super-potion', 'great-ball', 'ultra-ball', 'rare-candy', 'revive']), n = gym ? 3 : 1;
    let got = '';
    try { if (Items.get(prize)) { Items.add(prize, n); got = `${n > 1 ? n + ' x ' : ''}${Items.get(prize).n}`; } } catch (e) { got = ''; }
    if (gym) {
      sv.badges = sv.badges || {}; sv.badges[gym.id] = Date.now(); sv.stats.gyms = (sv.stats.gyms || 0) + 1;
      if (sv.gymRetry === gym.id) sv.gymRetry = 0;
      G.toast({ title: `You earned the ${gym.n}!`, text: `${R.name} was beaten.${got ? ' Prize: ' + got + '.' : ''}`, icon: Sprites.badge(gym.id), tone: 'gold', dur: 9 });
      Sound.play('levelUp');
    } else G.toast({ title: `You beat ${R.name}!`, text: got ? 'Prize: ' + got + '.' : '', icon: Sprites.item(prize) || '', tone: 'gold', dur: 6 });
    leave(gym ? `Well fought. The ${gym.n} is yours.` : U.pick(['You are good! I will train harder.', 'What a battle. Until next time!', 'I lost... Take this, you earned it.']));
    G.saveNow();
  }

  // ------------------------------------------------------------------ every frame
  function update(dt) {
    const f = EVERY[G.set.trainerBattles] !== undefined ? G.set.trainerBattles : 'sometimes';
    if (f !== freq) { freq = f; nextIn = EVERY[f] ? gap(f) * U.rand(0.3, 1) : null; }
    syncButton();
    if (!R) {
      if (nextIn === null || G.set.paused || !G.save.team.length) return;
      nextIn -= dt;
      if (nextIn <= 0) { nextIn = gap(f); start(); }
      return;
    }
    R.t += dt; if (R.hop > 0) R.hop -= dt; if (R.press > 0) R.press -= dt;
    if (R.sayT > 0) { R.sayT -= dt; if (R.sayT <= 0) say(''); }
    const mons = alive(), team = G.team().filter(G.targetable);
    if (R.phase === 'wait') {
      if (mons.length) { R.tx = mons.reduce((s, a) => s + a.x, 0) / mons.length + 30; R.ty = Math.min(...mons.map((a) => a.y - a.h)) - 40; }
      for (const a of mons) if (CAREFUL.includes(Mon.natureName(a.mon)) && !a.nap && Math.hypot(a.x - R.x, a.y - R.y) > 150 && !a.moving) { a.tx = R.x + U.rand(-70, 70); a.ty = R.y + U.rand(40, 110); }      // the careful ones keep close
      if (!mons.length) leave('');
      else if (R.kind === 'guest') { const p = typeof Visitors !== 'undefined' && Visitors.where ? Visitors.where(R.slot) : null; if (p) { R.x = R.tx = p.x; R.y = R.ty = p.y + 60; } }      // (a visitor's team stays as long as the visitor, near its pointer)
      else if (R.t > LINGER * 0.6 && R.said < 1) { R.said = 1; say('No battle? I will hang around a little longer.', 5); }
      else if (R.t > LINGER) { keepForLater(false); leave(R.kind === 'gym' ? 'Another day, then. The badge will wait.' : 'Maybe next time!'); }
    } else if (R.phase === 'battle') {
      if (!mons.length) won();
      else if (!team.length && !G.team().some((a) => a.state !== 'faint' && !a.await) && R.kind === 'guest') { tellVisitor('won'); G.toast({ title: `${R.name} won the friendly battle`, text: 'Their team is still here: try again whenever you like.', tone: 'info', dur: 6 }); leave(''); }
      else if (!team.length && !G.team().some((a) => a.state !== 'faint' && !a.await)) { G.save.stats.trainerLosses = (G.save.stats.trainerLosses || 0) + 1; keepForLater(true); leave(R.kind === 'gym' ? 'Not yet. Come back stronger.' : 'I win this one!'); }
      else {
        if (!alive().includes(R.leadTarget)) R.leadTarget = null;
        R.pickT -= dt;
        if (R.pickT <= 0 && team.length) {                 // the other Trainer chooses a target for its leader, and clicks
          R.pickT = U.rand(4, 7);
          const lead = mons[0], t = team.slice().sort((p, q) => p.mon.hp / Mon.maxHp(p.mon) - q.mon.hp / Mon.maxHp(q.mon))[0];
          R.target = t; lead.target = t; R.press = 0.18;
          FX.ring(t.x, t.y - t.h * 0.5, 4, t.w * 0.7 + 20, R.color, 0.6, 2);
        }
        if (R.target && !R.target.gone) { R.tx = R.target.x + 16; R.ty = R.target.y - R.target.h * 0.6; }
      }
    } else if (R.phase === 'leave') {
      if (R.t >= R.hold) R.tx = R.out;                    // done talking: off it goes
      if (R.t > R.hold + 4.5) { R.el.remove(); R = null; return; }
    }
    const k = Math.min(1, dt * (R.phase === 'battle' ? 5 : R.phase === 'leave' ? 0.9 : 2.2));
    R.x += (R.tx - R.x) * k; R.y += (R.ty - R.y) * k;
    placePointer();
  }
  function reset() { if (R) { R.el.remove(); R = null; } if (btn) { btn.el.remove(); btn = null; } freq = ''; nextIn = null; }
  return { start, guest, guestGone, click, update, reset, fighting, hit, hover, rematch, retry: retryBadge, active: () => !!R, guestSlot: () => (R && R.kind === 'guest' ? R.slot : 0),
 leadTarget: () => (R ? R.leadTarget : null), state: () => (R ? { kind: R.kind, name: R.name, phase: R.phase, alive: alive().length, mons: R.mons.length, badge: R.badge ? R.badge.id : 0, lead: R.leadTarget ? R.leadTarget.mon.sp : 0, say: R.words.textContent } : null), GYMS, EVERY };
})();
if (typeof module !== 'undefined') module.exports = Rivals;
