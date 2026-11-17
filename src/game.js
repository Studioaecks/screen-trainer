// Screen Trainer — the living overlay: wild encounters, the click-to-weaken and catch system,
// team behaviour (leadership, obedience, affection, bonds), item drops, input, rendering and persistence.
'use strict';

(() => {
  const D = DATA;
  const STANDARD_BALL = { name: 'poke-ball', label: 'Poké Ball', mult: 1 };      // unlimited; every better ball is found (src/items.js)
  // Loitering (setting maxLoiter): a wild Pokémon that nobody is fighting settles in and stays instead of wandering off.
  // CALM is the share of ordinary arrivals that come in peace: the team leaves those alone from the start.
  const CALM = 0.4;
  const ST_TAG = { brn: 'BRN', frz: 'FRZ', par: 'PAR', psn: 'PSN', slp: 'SLP' };
  const ARRIVE = 11;      // closer than this to its goal an actor has arrived (a resting actor only sets off again past 10 px)
  const nearest = (list, a) => list.reduce((b, x) => (!b || U.dist(x, a) < U.dist(b, a) ? x : b), null);
  const caughtSpecies = () => Object.keys(G.save.dex.caught).length;
  const snd = (name, a, o) => Sound.play(name, Object.assign({ x: a ? a.x : undefined }, o));
  const onScreen = (a) => a.x > -30 && a.x < G.W + 30 && a.y > -10 && a.y < G.H + a.h;
  const an = (n) => (/s$/.test(n) ? n : /^[aeiou]/i.test(n) ? 'an ' + n : 'a ' + n);
  const TONE_COL = { gold: '#ffe14d', shiny: '#ffe14d', alert: '#ff8a6a', item: '#9ad8ff', good: '#9cf07a', info: '#ffffff', rare: '#d6b8ff' };
  const ballImgs = {};

  /** the unlimited standard ball: the plain Poké Ball (until 0.3 better ones unlocked with the Pokédex; now they are found) */
  G.ballTier = () => STANDARD_BALL;
  /** the ball the next throw at this wild creature uses: the found stack in use (see src/items.js), else the standard one */
  G.ballFor = (a) => {
    const sp = Items.equippedBall(), ev = a && a.ev ? Events.catchMult(a) : 1;     // a legendary visitor can be easier to catch
    if (sp && a) return { name: sp.k, label: sp.n, mult: Items.ballMult(sp, a) * ev, special: sp.k };
    const t = G.ballTier();
    return { name: t.name, label: t.label, mult: t.mult * ev, special: null };
  };
  G.wantCatch = (t) => {
    if (t.rival) return false;                            // another Trainer's Pokémon is never caught: it is fought (src/rivals.js)
    const s = G.set.battleStyle;
    if (s === 'ko') return false;
    if (s === 'catch') return true;
    return !!t.mon.shiny || !G.save.dex.caught[t.mon.sp] || G.trainerTarget === t;
  };
  /** Options > "Walking speed" and "Move use speed": 1 is the usual pace. (While visiting another Trainer online these are
   *  that Trainer's, G.host: everyone in one world moves by the same rules.) */
  const rate = (k, lo, hi) => { const v = +((G.host && G.host[k] !== undefined ? G.host : G.set)[k]); return isFinite(v) && v > 0 ? U.clamp(v, lo, hi) : 1; };
  G.walkRate = () => rate('walkSpeed', 0.2, 2);
  G.moveRate = () => rate('moveSpeed', 0.25, 3);
  /** a battle with another Trainer is on (src/rivals.js) */
  G.inTrainerBattle = () => typeof Rivals !== 'undefined' && Rivals.fighting();
  /** natural = random weather from the sky (src/events.js): it runs its course and wears nobody down */
  G.setWeather = (kind, dur, natural) => { G.weather = { kind, t: 0, dur, natural: !!natural }; };
  G.announce = (str, col = '#ffffff', dur = 3.2) => {
    G.annN = G.now - (G.annT || -9) < 2.6 ? (G.annN || 0) + 1 : 0;
    G.annT = G.now;
    FX.text(G.W / 2, Math.max(70, G.H * 0.12) + (G.annN % 4) * 26, str, { col, size: 17, dur, vy: -6 });
  };
  /** news worth reading — { title, text, icon, tone }. Shown as a card, as one line of text, or not at all (setting "toasts") */
  G.toast = (o) => {
    const mode = G.set.toasts || 'cards';
    if (mode === 'off') return;
    if (mode === 'cards') Notify.show(o);
    else G.announce(o.title, TONE_COL[o.tone] || '#ffffff', o.dur || 3.6);
  };

  // ------------------------------------------------------------------ the ground under their feet (0.7)
  // Where there is a field (the field window, the MyStream stage, the phone) the ground is grown from the Pokémon that
  // are there: an equal share each, of their own types (Field.partyPlan in src/field.js). The pages that draw the ground
  // ask G.groundList who that is. Standing on ground of a move's type makes the move 1.3 times as strong, and so does the
  // mark a move of that type left behind: every damaging move leaves one where it lands, small and soon gone for a weak
  // move (Water Gun), wide and lasting for a strong one that sweeps the field (Surf, Water Spout).
  const typesOf = (sp) => (D.dex[sp] ? D.dex[sp].t.map((t) => D.types[t]) : []);
  let plan = null, planSig = '';
  /** is there ground to stand on at all? (not on the plain overlay: that has no scenery) */
  G.hasGround = () => !!G.view || G.ground === true;
  /** who the ground is grown from: the team's six, or everyone shown in the Box Field while the Box is open */
  G.groundList = () => (G.boxField && G.boxField.list ? { kind: 'box', list: G.boxField.list } : { kind: 'team', list: G.save ? G.save.team.map((m) => m.sp) : [] });
  G.groundPlan = () => {
    if (typeof Field === 'undefined' || !Field.partyPlan || !G.hasGround()) return null;
    const g = G.groundList(), sig = `${g.kind}:${g.list.join(',')}:${Math.round(G.W)}x${Math.round(G.H)}`;
    if (sig !== planSig) { planSig = sig; plan = Field.partyPlan(g.list, typesOf, { min: g.kind === 'team' ? 6 : 1, aspect: G.W / Math.max(1, G.H) }); }
    return plan;
  };
  /** the type of the ground at a place in the world ('' = plain grass, or no ground at all) */
  G.groundType = (x, y) => { const p = G.groundPlan(); if (!p) return ''; const t = Field.typeAt(p, x / G.W, y / G.H); return t === 'grass0' ? '' : t; };
  /** does this actor stand on ground of that type: the field's, or a mark a move left? */
  G.onGroundOf = (a, type) => G.zones.some((z) => z.kind === 'mark' && z.type === type && G.inZone(a, z)) || G.groundType(a.x, a.y) === type;
  const MARK_MAX = 14;
  /** a damaging move landed at (x, y): it leaves ground of its type there. How wide and for how long goes by the move. */
  G.leaveMark = (x, y, type, mv) => {
    const p = mv && mv.p > 0 ? mv.p : 0;
    if (!p || !type || type === 'normal' || (mv && mv.c === 1)) return null;      // status moves leave nothing, and Normal moves have no ground of their own
    const wide = mv.tg === 9 || mv.tg === 11 || mv.tg === 14;                 // moves that sweep the field (Surf, Earthquake, Water Spout...)
    const r = (22 + p * 0.55) * (wide ? 1.7 : 1) * (0.7 + 0.15 * G.scale), dur = (p < 60 ? 4 : p < 90 ? 10 : p < 120 ? 30 : p < 150 ? 60 : 120) * (wide ? 1.5 : 1);
    const marks = G.zones.filter((z) => z.kind === 'mark'), near = marks.find((z) => z.type === type && Math.hypot(z.x - x, (z.y - y) / 0.6) < Math.max(z.r, r) * 0.8);
    if (near) {                                           // the same ground again: the mark grows a little and lasts as long as the longer of the two
      near.r = Math.min(260, Math.max(near.r, r) * 1.06); near.dur = Math.max(near.dur - near.t, dur) + 0.5; near.t = 0.5;
      return near;
    }
    if (marks.length >= MARK_MAX) { const old = marks.reduce((b, z) => (z.dur - z.t < b.dur - b.t ? z : b), marks[0]), i = G.zones.indexOf(old); if (i >= 0) G.zones.splice(i, 1); }      // the one with least time left makes room
    return G.addZone({ kind: 'mark', x: U.clamp(x, 0, G.W), y: U.clamp(y, 0, G.H), r, dur, type });
  };

  // ------------------------------------------------------------------ hops: how creatures come onto and leave the screen
  /** travel to (x, y) in bouncy hops; o.then runs after the last landing */
  G.hopTo = (a, x, y, o = {}) => {
    if (a.ox || a.oy) { a.x += a.ox; a.y += a.oy; a.ox = a.oy = 0; }   // called away in the middle of a lunge: it leaves from where it is seen and does not snap back first
    const dist = Math.hypot(x - a.x, y - a.y), stride = (o.stride || 150) * (0.6 + 0.2 * G.scale);
    a.hops = { x0: a.x, y0: a.y, x1: x, y1: y, n: Math.max(1, Math.round(dist / stride)), i: 0, t: 0, dur: o.dur || 0.34, rest: o.rest === undefined ? 0.07 : o.rest, pause: 0,
      h: (o.height || 46) * (0.55 + 0.25 * G.scale), then: o.then || null };
    if (Math.abs(x - a.x) > 4) { a.face = x > a.x ? -1 : 1; a.faceAt = G.now; }
    a.back = false; a.moving = false; a.busy = false; a.lunge = null; a.ox = a.oy = 0; a.kx = a.ky = 0;
  };
  function stepHops(a, dt) {
    const h = a.hops;
    a.moving = false;
    if (h.pause > 0) { h.pause -= dt; if (h.pause > 0) return; }
    if (h.i >= h.n) { a.hops = null; a.jy = 0; a.tx = a.x; a.ty = a.y; if (h.then) h.then(); return; }
    if (h.t === 0 && onScreen(a)) snd('hop', a, { vol: 0.5 });
    h.t += dt;
    const k = Math.min(1, h.t / h.dur), p = (h.i + k) / h.n;
    a.x = h.x0 + (h.x1 - h.x0) * p; a.y = h.y0 + (h.y1 - h.y0) * p; a.jy = -h.h * 4 * k * (1 - k);
    a.tx = a.x; a.ty = a.y;
    if (k >= 1) {
      h.i++; h.t = 0; h.pause = h.rest; a.jy = 0; a.squash = 1;
      if (onScreen(a) && a.y < G.H + 4) FX.dust(a.x, a.y, 5, 3 + G.scale);
      if (h.i >= h.n && h.rest <= 0) { a.hops = null; a.tx = a.x; a.ty = a.y; if (h.then) h.then(); }
    }
  }
  /** a new actor waits off-screen until its sprite has loaded, so its real size is known, then hops in */
  function stepAwait(a) {
    if (!(a.nw || a.age > 1.5 || !a.img)) return;
    const w = a.await, m = 16, b = G.bounds(a);
    a.await = null;
    if (w.drop) {                                        // it is set down where it was let go (out of the Day Care, out of an egg): no walk in from the edge
      a.x = a.tx = U.clamp(w.x, b.x0, b.x1); a.y = a.ty = U.clamp(w.y, b.y0, b.y1);
      a.fall = { t: 0, h: Math.min(130, 46 + a.h * 0.6) }; a.jy = -a.fall.h; a.idleT = U.rand(1.5, 3.5);
      if (w.cry) Sound.cry(a.mon.sp, { x: a.x });
      if (w.then) w.then();
      return;
    }
    if (w.side === 0) { a.x = -(a.w / 2 + m); a.y = U.clamp(w.along, b.y0, b.y1); }
    else if (w.side === 1) { a.x = G.W + a.w / 2 + m; a.y = U.clamp(w.along, b.y0, b.y1); }
    else if (w.side === 2) { a.x = U.clamp(w.along, b.x0, b.x1); a.y = -m; }
    else { a.x = U.clamp(w.along, b.x0, b.x1); a.y = G.H + a.h + m; }
    a.tx = a.x; a.ty = a.y;
    G.hopTo(a, U.clamp(w.x, b.x0, b.x1), U.clamp(w.y, b.y0, b.y1), { dur: 0.36, then: w.then });
    if (w.cry) Sound.cry(a.mon.sp, { x: w.x });
  }

  // ------------------------------------------------------------------ damage, fainting, rewards
  G.hurt = (t, dmg, src, o = {}) => {
    if (!G.alive(t)) return 0;
    dmg = Math.max(1, Math.floor(dmg));
    if (o.noKO && dmg >= t.mon.hp) dmg = t.mon.hp - 1;
    else if (dmg >= t.mon.hp && src && t.mon.hp > 1) {
      if (t.side === 'team' && Mon.hearts(t.mon) >= 3 && U.chance(0.1)) { dmg = t.mon.hp - 1; G.say(t, 'toughed it out for you!', { col: '#ff8fb3', size: 11, dy: -12 }); }
      else if (Items.endures(t)) dmg = t.mon.hp - 1;
    }
    if (dmg <= 0) return 0;
    t.mon.hp -= dmg;
    t.flash = 0.13; t.lastHit = G.now; G.lastBattle = G.now;
    if (t.nap) t.nap = 0;
    const c = G.center(t);
    if (src) {
      t.lastHitBy = src; t.dmgBy.add(src.mon.uid);
      const ang = Math.atan2(t.y - src.y, t.x - src.x);
      if (!t.hops) { t.kx += Math.cos(ang) * 130; t.ky += Math.sin(ang) * 130; }
      if (t.side === 'wild') { if (t.loiter || t.calm) unsettle(t); t.aggro = true; t.cower = false; if (!G.targetable(t.target)) t.target = src; }
      if (!o.quiet) snd(o.eff > 1 ? 'hitSuper' : o.eff < 1 ? 'hitWeak' : 'hit', t, { vol: 0.75 });
    }
    if (!o.quiet) {
      const big = o.crit || o.eff > 1;
      FX.text(c.x + U.rand(-12, 12), c.y - t.h * 0.25, '-' + dmg, { col: o.dot ? FX.col(o.type || 'normal', 0) : o.crit ? '#ffe14d' : '#ffffff', size: o.dot ? 11 : big ? 16 : 13 });
      if (G.verbose()) {
        if (o.crit) G.say(t, 'A critical hit!', { col: '#ffe14d', size: 11, dy: -14 });
        if (o.eff > 1) G.say(t, "It's super effective!", { col: '#9cf07a', size: 11, dy: -2 });
        else if (o.eff < 1) G.say(t, "It's not very effective...", { col: '#b8b8c8', size: 11, dy: -2 });
        if (o.combo) G.say(t, 'Team combo!', { col: '#6ad0ff', size: 12, dy: -26 });
      }
    }
    if (o.dot && o.type) FX.puff(c.x, c.y, o.type, 4, t.w * 0.25, 4, 0.5);
    if (t.mon.hp <= 0) G.faint(t); else Items.berryCheck(t);
    G.touch();
    return dmg;
  };

  G.faint = (t) => {
    t.mon.hp = 0; t.state = 'faint'; t.stateT = 0; t.busy = false; t.lunge = null; t.hops = null; t.jy = 0; t.vol = {}; t.mon.st = null; t.stages.fill(0);
    G.say(t, `${Mon.name(t.mon)} fainted!`, { col: t.side === 'team' ? '#ff8a8a' : '#ffffff', size: 12 });
    snd('faint', t);
    if (t.side === 'wild') { G.save.stats.ko++; G.reward(t); G.dropsFrom(t, { caught: false }); G.after(1.0, () => G.removeActor(t)); }
    else {
      t.mon.aff = Math.max(0, t.mon.aff - 1);
      t.target = null; t.mode = 'roam'; t.hold = false;     // a fainted team member is after nobody
      if (t.fetch) { if (t.fetch.by === t) t.fetch.by = null; t.fetch = null; }       // and someone else may fetch the item it was walking to
      Sound.cry(t.mon.sp, { x: t.x, pitch: 0.82, vol: 0.5 });
    }
  };

  /** a wild creature leaves: it hops off the nearest edge (or vanishes at once, e.g. Teleport) */
  G.flee = (a, why, instant) => {
    if (a.gone || a.state === 'leave') return;
    G.say(a, `${Mon.name(a.mon)} ${why}`, { col: '#d8d8e8', size: 12 });
    G.save.stats.fled++;
    if (instant || a.await) { G.removeActor(a); return; }
    const calm = /wandered/.test(why), m = 24;
    a.state = 'leave'; a.run = true; a.aggro = false;
    const ds = [a.x, G.W - a.x, a.y, G.H - a.y], i = ds.indexOf(Math.min(...ds));
    const out = [[-(a.w / 2 + m), a.y], [G.W + a.w / 2 + m, a.y], [a.x, -m], [a.x, G.H + a.h + m]][i];
    if (!calm) snd('flee', a);
    G.hopTo(a, out[0], out[1], { dur: calm ? 0.36 : 0.25, stride: calm ? 130 : 190, rest: calm ? 0.08 : 0.02, height: calm ? 40 : 56, then: () => G.removeActor(a) });
  };

  function xpEvents(a, evs) {
    for (const e of evs) {
      if (e.type === 'level') { a._sk = ''; G.say(a, `Lv. ${e.lvl}!`, { col: '#ffe14d', size: 14, dy: -6 }); FX.sparkle(a.x, a.y - a.h * 0.5, 6, '#ffe14d', a.w * 0.4); snd('levelUp', a, { vol: 0.8 }); }
      else if (e.type === 'move') { if (G.verbose()) G.say(a, `learned ${D.moves[e.id].n}!`, { col: '#b8e0ff', size: 11, dy: -22 }); a.melee = undefined; }
      else if (e.type === 'evolve') G.evolveFx(a, e);
    }
  }
  G.evolveFx = (a, e) => {
    const c = G.center(a), was = a.mon.nick || D.dex[e.from].n;
    a._sk = ''; a.melee = undefined;
    FX.ring(c.x, c.y, 6, a.w * 1.3, '#ffffff', 0.7, 6, 0.35); FX.ring(c.x, c.y, 4, a.w * 2, '#fff6a8', 1, 3); FX.sparkle(c.x, c.y, 16, '#ffffff', a.w * 0.6);
    a.flash = 0.6;
    a.speed = 50 + Mon.species(a.mon).s[5] * 0.85;
    G.loadSprite(a);
    G.toast({ title: `${was} evolved into ${D.dex[e.to].n}!`, text: G.save.dex.caught[e.to] ? '' : 'New Pokédex entry.', icon: Sprites.icon(e.to), tone: 'gold', dur: 4.5 });
    snd('evolve', a);
    G.after(1.2, () => { if (!a.gone) Sound.cry(a.mon.sp, { x: a.x }); });
    G.save.dex.seen[e.to] = 1; G.save.dex.caught[e.to] = (G.save.dex.caught[e.to] || 0) + 1;
    G.saveNow();
  };

  /** the experience multiplier from Options (setting xpRate): a number from 0 to 10, 1 when unset */
  G.xpRate = () => { const r = G.set.xpRate; return r === undefined || r === null || !isFinite(+r) ? 1 : U.clamp(+r, 0, 10); };
  /** experience, affection, bonds and leadership after a wild creature is beaten or caught */
  G.reward = (w) => {
    const team = G.team().filter((a) => a.mon.hp > 0 && a !== w);
    if (!team.length) return;
    const base = Mon.xpYield(w.mon), parts = team.filter((a) => w.dmgBy.has(a.mon.uid)), leader = G.leader();
    const rate = G.xpRate();                             // Options > "Experience": 0 = none, 1 = as in the games, up to 10
    for (const a of team) {
      const part = parts.includes(a), xp = Math.floor(base * (part || Items.shares(a.mon) ? 1 : 0.5) * (Mon.hearts(a.mon) >= 2 ? 1.2 : 1) * Items.xpMult(a.mon) * rate);
      if (part) { a.mon.aff = Math.min(255, a.mon.aff + Math.ceil(Items.affMult(a.mon))); a.mon.wins = (a.mon.wins || 0) + 1; }
      if (xp < 1) continue;
      if (G.verbose() && a.mon.lvl < 100) FX.text(a.x, a.y - a.h - 4, `+${xp} XP`, { col: '#8ac8ff', size: 11, dur: 1.3 });
      xpEvents(a, Mon.gainXp(a.mon, xp, G.set.evolve !== false));
    }
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const x = parts[i].mon, y = parts[j].mon;
      x.bond[y.uid] = Math.min(100, (x.bond[y.uid] || 0) + 1); y.bond[x.uid] = Math.min(100, (y.bond[x.uid] || 0) + 1);
    }
    if (leader && leader !== w) {
      const before = Mon.leadLevel(leader.mon);
      leader.mon.lead = (leader.mon.lead || 0) + 3 * Mon.aptMult(leader.mon) * (parts.length > 1 ? 1.5 : 1);
      const now = Mon.leadLevel(leader.mon);
      if (now > before) { G.say(leader, `Leadership rose to ${now}!`, { col: '#ffd76a', size: 13, dy: -30 }); FX.sparkle(leader.x, leader.y - leader.h, 8, '#ffd76a', 30); snd('lead', leader); }
    }
    G.touch();
  };

  /** ribbons for team members and badges for the trainer; cheap, called every few seconds */
  G.checkHonors = () => {
    const sv = G.save;
    for (const m of sv.team) for (const r of Honors.checkRibbons(m)) {
      G.toast({ title: `${Mon.name(m)} earned the ${Honors.label(r.k)}!`, text: r.text, icon: Sprites.ribbon(r.k), tone: 'gold', pixel: false, dur: 4.5 });
      snd('lead'); G.touch();
    }
    for (const b of Honors.checkBadges(sv)) {
      G.toast({ title: `You earned the ${b.n}!`, text: b.text, icon: Sprites.badge(b.id), tone: 'gold', pixel: false, dur: 5.5 });
      snd('badge'); G.touch();
    }
  };

  // ------------------------------------------------------------------ obedience & leadership
  G.obeyChance = (a, leader) => {
    if (!leader) return 0.5;
    if (a === leader) return U.clamp(0.6 + (0.4 * a.mon.aff) / 255, 0, 0.99);
    const LL = Mon.leadLevel(leader.mon), apt = Mon.aptMult(leader.mon);
    const own = { leader: 0.05, steady: 0, loner: -0.1 }[Mon.aptitude(a.mon)];
    const bond = Math.min(100, a.mon.bond[leader.mon.uid] || 0);
    const p = 0.32 + 0.06 * LL * apt + (0.25 * a.mon.aff) / 255 + (0.15 * bond) / 100 + own - 0.012 * Math.max(0, a.mon.lvl - leader.mon.lvl - 5 * LL);
    return U.clamp(p, 0.05, 0.98);
  };

  function think(a) {
    const auto = G.set.autoBattle !== false;
    // wild creatures still hopping in are left alone, and so is the one the player is working on when "hands off" is set
    // (a wild that is loitering, or arriving in peace, is nobody's target until it is provoked or the player clicks it)
    const duel = G.inTrainerBattle();                    // a Trainer battle is between the two teams: wild Pokémon are left out of it
    const cands = G.wilds().filter((w) => G.targetable(w) && w.age > 2.2 && !w.hops && !G.handsOff(w) && !G.peaceful(w) && (duel ? !!w.rival : w.aggro || w === G.trainerTarget || (auto && !w.loiter && !w.calm)));
    if (!cands.length) { if (a.mode && a.mode !== 'roam') { a.idleT = U.rand(0.4, 3); a.tx = a.x; a.ty = a.y; } a.mode = 'roam'; a.target = null; a.effLvl = 0; a.hold = false; a.obeyFor = 0; return; }
    const leader = G.leader(), LL = leader ? Mon.leadLevel(leader.mon) : 0;
    G.leadLL = LL;
    // a wild that is already weak enough to catch needs no more attention: move on to the next one
    const held = (w) => G.wantCatch(w) && w.mon.hp / Mon.maxHp(w.mon) <= 0.22;
    const open = cands.filter((w) => !held(w)), pool = open.length ? open : cands;
    let pick = G.trainerTarget && pool.includes(G.trainerTarget) ? G.trainerTarget : null;
    if (!pick && leader && pool.includes(leader.target)) pick = leader.target; // stay on the leader's current target
    if (!pick) pick = pool.find((w) => w.aggro) || nearest(pool, leader || a);
    // A trainer battle: the leader goes for the one the player clicked, everyone else for the rival nearest to it
    if (typeof Rivals !== 'undefined' && Rivals.fighting()) { const rv = pool.filter((w) => w.rival); if (rv.length) pick = a === leader && rv.includes(Rivals.leadTarget()) ? Rivals.leadTarget() : nearest(rv, a); }
    if (G.now > a.obeyT || a.obeyFor !== pick.id) {
      const first = !a.obeyFor;
      a.obeyT = G.now + U.rand(7, 11); a.obeyFor = pick.id;
      a.obey = U.chance(G.obeyChance(a, leader));
      a.loaf = !a.obey && U.chance(0.4);
      a.wildcard = U.pick(cands);
      if (!a.obey) G.say(a, a.loaf ? `${Mon.name(a.mon)} is loafing around...` : `${Mon.name(a.mon)} ignored orders!`, { col: a.loaf ? '#b8b8c8' : '#ff9a8a', size: 11 });
      else if (first) FX.text(a.x, a.y - a.h - 10, '!', { col: '#ffe14d', size: 20, dur: 0.7 });
    }
    if (a.obey) {
      a.target = pick;
      const apt = leader ? Mon.aptMult(leader.mon) : 1;
      a.effLvl = leader && a.mon.lvl < leader.mon.lvl ? Math.round(a.mon.lvl + (leader.mon.lvl - a.mon.lvl) * Math.min(0.6, 0.06 * LL * apt)) : 0;
      a.hold = held(pick);
      a.mode = a.hold ? 'guard' : 'fight';
    } else if (a.loaf) { a.mode = 'roam'; a.target = null; a.effLvl = 0; a.hold = false; }
    else {
      if (!G.targetable(a.wildcard) || G.handsOff(a.wildcard)) a.wildcard = U.pick(cands);
      a.target = a.wildcard; a.mode = 'fight'; a.hold = false; a.effLvl = 0;
    }
  }

  function isMelee(a) {
    if (a.melee === undefined) {
      const dm = a.mon.moves.map((id) => D.moves[id]).filter((m) => m && m.c !== 1);
      a.melee = dm.length ? dm.filter((m) => m.f && m.f.includes('contact')).length * 2 >= dm.length : true;
    }
    return a.melee;
  }

  function fight(a, dt) {
    const t = a.target;
    if (!G.targetable(t)) return;
    const want = isMelee(a) ? (a.w * a.hit + t.w * t.hit) * 0.36 + 18 : 215 + (a.id % 5) * 22, d = U.dist(a, t) || 1;
    if (!a.busy) {
      // once in position it holds its ground until the target is well out of reach, so a crowd does not make it dither
      if (d > want + (a.settled ? 75 : 30)) {
        const slot = Math.atan2((a.y - t.y) * 1.6, a.x - t.x) + Math.sin(a.id * 1.7) * 0.5;
        a.tx = t.x + Math.cos(slot) * want; a.ty = t.y + Math.sin(slot) * want * 0.62; a.run = true; a.settled = false; a.backing = false;
      }
      // too close for a ranged fighter: it backs off, and keeps backing a little further than where it started to, so that
      // being nudged across that line by its neighbours does not make it step back and stop over and over
      else if (!a.melee && (d < want - 100 || (a.backing && d < want - 70))) { a.tx = a.x - ((t.x - a.x) / d) * 70; a.ty = a.y - ((t.y - a.y) / d) * 70; a.run = false; a.settled = false; a.backing = true; }
      else { a.tx = a.x; a.ty = a.y; a.settled = true; a.backing = false; }
      a.faceT = t;
    } else { a.tx = a.x; a.ty = a.y; }
    a.cd -= dt;
    if (a.cd <= 0 && !a.busy && !a.hold && (d <= want + 80 || (!a.melee && d < 460))) Battle.act(a, t);
  }

  /** a place to stroll to. A point that falls outside the world, or inside something that stands in it (G.blocks), is
   *  thrown again instead of being pushed to the nearest edge: pushing put every such point exactly on an edge, and after
   *  a few strolls everyone stood along the edges of the world. Now and then anywhere in the world will do. */
  function waypoint(a, far) {
    const b = G.bounds(a), reach = 520;
    let x = a.x, y = a.y;
    for (let i = 0; i < 14; i++) {
      const anywhere = far || U.chance(0.2);
      x = anywhere ? U.rand(b.x0, b.x1) : a.x + U.rand(-reach, reach); y = anywhere ? U.rand(b.y0, b.y1) : a.y + U.rand(-reach * 0.6, reach * 0.6);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && !inBlock(a, x, y)) break;
    }
    a.tx = U.clamp(x, b.x0, b.x1); a.ty = U.clamp(y, b.y0, b.y1);
  }
  /** does (x, y) lie inside something this actor cannot walk through? */
  function inBlock(a, x, y) {
    if (!G.blocks || !G.blocks.length) return false;
    for (const o of G.blocks) { if (o.pass && o.pass(a)) continue; const ex = (x - o.x) / (o.rx * 1.1 + 6), ey = (y - o.y) / (o.ry * 1.1 + 6); if (ex * ex + ey * ey < 1) return true; }
    return false;
  }
  /** Something that stands in the world (G.blocks) lies between an actor and where it is going: the point to walk to
   *  instead, a little further round its rim, or null when the way is clear. The side is chosen once and kept until the
   *  thing is passed (a.round), and a side that leads out of the world is not chosen: before 0.7 an actor walked straight
   *  at the Day Care fence, was eased back out and tried again, for as long as its goal lay behind it. */
  function steer(a) {
    let hit = null, at = 2;
    for (const o of G.blocks) {
      if (o.pass && o.pass(a)) continue;
      const ax = (a.x - o.x) / o.rx, ay = (a.y - o.y) / o.ry, vx = (a.tx - o.x) / o.rx - ax, vy = (a.ty - o.y) / o.ry - ay, L2 = vx * vx + vy * vy;
      if (L2 < 1e-6) continue;
      const t = U.clamp(-(ax * vx + ay * vy) / L2, 0, 1), cx = ax + vx * t, cy = ay + vy * t;
      if (cx * cx + cy * cy >= 0.97 || t >= at) continue;    // this one is not in the way (or another one is, sooner)
      hit = o; at = t;
    }
    if (!hit) { a.round = null; return null; }
    const o = hit, R = 1.14, ax = (a.x - o.x) / o.rx, ay = (a.y - o.y) / o.ry, gx = (a.tx - o.x) / o.rx, gy = (a.ty - o.y) / o.ry, ra = Math.hypot(ax, ay) || 0.001;
    const ang = Math.atan2(ay, ax), turn = Math.max(0.55, Math.acos(Math.min(1, R / ra))), b = G.bounds(a);
    const spot = (side) => [o.x + Math.cos(ang + side * turn) * (o.rx * R + 5), o.y + Math.sin(ang + side * turn) * (o.ry * R + 5)];
    const inside = (p) => p[0] >= b.x0 - 2 && p[0] <= b.x1 + 2 && p[1] >= b.y0 - 2 && p[1] <= b.y1 + 2;
    let side = a.round && a.round.o === o ? a.round.side : ax * gy - ay * gx >= 0 ? 1 : -1, p = spot(side);
    if (!inside(p)) { const q = spot(-side); if (inside(q)) { side = -side; p = q; } }      // that way round leads off the world: take the other
    a.round = { o, side };
    return p;
  }

  function wildAI(a, dt) {
    if (a.state === 'enter') a.state = 'roam';          // (a wild whose entry hop was interrupted, e.g. by a ball)
    if (a.state === 'leave') { a.state = 'roam'; G.flee(a, 'slipped away.'); G.save.stats.fled--; return; }   // lost its way out: set off again
    const team = G.team().filter(G.targetable);
    if (a.ev && Events.ai(a, dt, team)) return;          // a legendary visitor with a mind of its own (src/events.js)
    if (!a.rival && G.inTrainerBattle()) { keepClear(a, dt); return; }       // a Trainer battle is on: wild Pokémon stay out of it
    const mine = G.handsOff(a);                          // the player is working on this one: it forgets the team
    if (mine && a.aggro) { a.aggro = false; a.target = null; a.faceT = null; }
    if (a.aggro && !a.rival && team.length && !a.busy && a.mon.hp / Mon.maxHp(a.mon) <= 0.25 && G.now - a.lastHit > 3.5) {
      a.aggro = false; a.cower = true; a.terr = false; a.stay = Math.min(a.stay, 14);
      if (G.verbose()) G.say(a, `${Mon.name(a.mon)} is too weak to keep fighting`, { col: '#d8d8e8', size: 11 });
    }
    if (a.aggro && team.length) {
      if (!G.targetable(a.target) || a.target.side !== 'team') a.target = nearest(team, a);
      fight(a, dt);
      // (0.9.3) A Pokémon that has only just come does not run: it fights it out. Before, one the battle orders send the
      // team after at once (an already caught kind, "knock out for experience") was often down to a fifth of its health
      // within seconds and gone again, which looked like hopping in and straight back out. After three seconds it may
      // choose to run away, and says so.
      if (!a.fleeChk && !a.rival && a.age > 3 && a.mon.hp / Mon.maxHp(a.mon) < 0.2) { a.fleeChk = true; if (U.chance(0.25) && !a.busy) G.flee(a, 'ran away!'); }
      return;
    }
    a.aggro = false; a.faceT = null;
    if (a.loiter) { loiterAI(a, dt); return; }
    if (a.calm && canSettle(a)) { settle(a, true); return; }                 // it came in peace
    if (G.now - a.lastHit > 6 && !a.balled) a.stay -= dt;
    if (a.stay <= 0) {                                                       // nobody is fighting it any more: it stays, or (maxLoiter 0) wanders off
      if (canSettle(a)) { settle(a, false); return; }
      a.stay = 99; G.flee(a, 'wandered off.'); G.save.stats.fled--; return;
    }
    if (a.terr && a.age > 4 && team.length && !mine) { a.aggro = true; FX.text(a.x, a.y - a.h - 10, '!', { col: '#ff6b6b', size: 20, dur: 0.7 }); snd('alert', a, { vol: 0.5 }); return; }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < ARRIVE) {
      a.idleT -= dt;
      if (a.idleT <= 0) { waypoint(a, false); a.idleT = U.rand(1, 4.5); a.run = false; }
    }
  }

  /** A battle between two Trainers is on. A wild Pokémon takes no part: it drops whatever fight it was in and keeps a
   *  good way off from everyone who is fighting. When the battle is over it carries on as before. */
  function keepClear(a, dt) {
    if (a.aggro || a.target) { a.aggro = false; a.target = null; a.faceT = null; a.cower = false; a.fleeChk = false; }
    const near = nearest(G.actors.filter((b) => b !== a && !b.gone && (b.rival || (b.side === 'team' && b.mode === 'fight'))), a);
    if (near && Math.hypot(near.x - a.x, (near.y - a.y) * 1.4) < 300 && !a.hops) {
      a.clearT = (a.clearT || 0) - dt;
      if (a.clearT <= 0 || Math.hypot(a.tx - a.x, a.ty - a.y) < ARRIVE) {                     // pick a spot well away from the fighting, now and then
        a.clearT = 1.2;
        const b = G.bounds(a), ang = Math.atan2(a.y - near.y, a.x - near.x) + U.rand(-0.7, 0.7);
        let x = a.x + Math.cos(ang) * 320, y = a.y + Math.sin(ang) * 220;
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) { x = near.x < G.W / 2 ? U.rand(G.W * 0.6, b.x1) : U.rand(b.x0, G.W * 0.4); y = U.rand(b.y0, b.y1); }      // cornered: cross to the far side
        a.tx = U.clamp(x, b.x0, b.x1); a.ty = U.clamp(y, b.y0, b.y1); a.run = true; a.nap = 0;
      }
      return;
    }
    a.run = false;
    if (a.loiter) { loiterAI(a, dt); return; }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < ARRIVE) { a.idleT -= dt; if (a.idleT <= 0) { waypoint(a, false); a.idleT = U.rand(1, 4.5); } }
  }

  // ---- loitering: wild Pokémon that stay
  const canSettle = (a) => (G.set.maxLoiter | 0) > 0 && !a.ev && !a.balled && a.state !== 'leave';
  /** a wild Pokémon nobody is fighting makes itself at home. It keeps the health it has, so one the team weakened waits to be caught. */
  function settle(a, quiet) {
    a.loiter = true; a.calm = true; a.settledAt = G.now; a.terr = false; a.cower = false; a.aggro = false; a.target = null; a.faceT = null; a.fleeChk = false; a.stay = 9999;
    a.mon.st = null; a.stages.fill(0); a.vol = {};                           // it calmed down
    a.tx = a.x; a.ty = a.y; a.run = false; a.idleT = U.rand(0.6, 3);
    if (!quiet && G.verbose()) G.say(a, `${Mon.name(a.mon)} is staying a while`, { col: '#c8e8c0', size: 11 });
    G.trimLoiter();
  }
  /** it was provoked or clicked: an ordinary encounter again, until it has been left alone for a while */
  function unsettle(a) { a.loiter = false; a.calm = false; a.nap = 0; a.stay = U.rand(25, 45); a.drink = null; }
  /** more loiterers than the setting allows: the one that has been around longest wanders off (shinies last) */
  G.trimLoiter = () => {
    const max = Math.max(0, G.set.maxLoiter | 0), list = G.wilds().filter((w) => w.loiter && !w.rival && w.state !== 'leave');
    let over = list.length - max;
    if (over <= 0) return;
    list.sort((x, y) => (x.mon.shiny ? 1 : 0) - (y.mon.shiny ? 1 : 0) || x.settledAt - y.settledAt);
    for (const w of list) {
      if (over <= 0) break;
      if (w === G.hover || w === G.trainerTarget || w.balled || w.busy || w.hops || w.aggro) continue;
      w.loiter = false; w.calm = false; w.stay = 99;
      G.flee(w, 'wandered off.'); G.save.stats.fled--; over--;
    }
  };
  /** what a loitering wild Pokémon does: strolls, keeps its own kind company, naps */
  function loiterAI(a, dt) {
    if (a.drink) { if (a === G.trainerTarget || a === G.hover) a.drink = null; else if (drinkStep(a, dt, DRINK.wild)) return; }      // (0.9.6) a hurt loiterer drinks at the fountain
    if (a.nap > 0) {
      a.nap -= dt; a.tx = a.x; a.ty = a.y;
      a.zz = (a.zz || 0) - dt;
      if (a.zz <= 0) { a.zz = 2.6; FX.text(a.x + a.w * 0.25, a.y - a.h * 0.9, 'Zzz', { col: '#c8d0e8', size: 12, dur: 1.6, vy: -18 }); }
      return;
    }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) >= ARRIVE) return;
    a.idleT -= dt;
    if (a.idleT > 0) return;
    a.idleT = U.rand(3, 11); a.run = false;
    if (a.mon.hp < Mon.maxHp(a.mon) * 0.5 && a !== G.trainerTarget && U.chance(0.5) && startDrink(a)) return;
    if (U.chance(0.08)) { a.nap = U.rand(20, 50); return; }
    const kin = G.wilds().filter((b) => b !== a && b.loiter && !b.hops && b.mon.sp === a.mon.sp);
    if (kin.length && U.chance(0.35)) {
      const pal = U.pick(kin), b = G.bounds(a), side = a.x < pal.x ? -1 : 1, gap = (a.w * a.hit + pal.w * pal.hit) * 0.5 + 12;
      a.tx = U.clamp(pal.x + side * (gap + U.rand(0, 60)), b.x0, b.x1); a.ty = U.clamp(pal.y + U.rand(-40, 40), b.y0, b.y1);
    } else waypoint(a, false);
  }

  // ---- the fountain heals (0.9.6, owner's list 11-16 update 7). Where Fountain Square stands (the field window, the
  // MyStream stage), a hurt team member walks over to the fountain and drinks until it is well again: one under half its
  // health when there is no fight for it, one under a quarter even in the middle of one (not in a Trainer battle: that is
  // fought to the end, as reviving is held back then). A wild Pokémon that is staying (a loiterer) under half its health
  // goes now and then too, so one the team weakened can get away. Water types climb into the basin.
  const DRINK = { team: 0.12, wild: 0.06 };                // of full health a second while drinking
  const fountainOf = () => (G.blocks && G.blocks.length ? G.blocks.find((o) => o.name === 'fountain') || null : null);
  G.fountainOf = fountainOf;
  function startDrink(a) {
    const f = fountainOf();
    if (!f) return false;
    let x, y;
    if (f.pass && f.pass(a)) { const ang = U.rand(6.283), r = U.rand(0.1, 0.55); x = f.x + Math.cos(ang) * f.rx * r; y = f.y + Math.sin(ang) * f.ry * r; }      // in the water
    else { const ang = Math.atan2((a.y - f.y) / f.ry, (a.x - f.x) / f.rx) + ((a.id % 5) - 2) * 0.22; x = f.x + Math.cos(ang) * f.rx * 1.12; y = f.y + Math.sin(ang) * f.ry * 1.12; }      // on the rim, on the side it comes from
    a.drink = { x, y, at: 0, acc: 0, fx: 0, t0: G.now };
    a.nap = 0;
    return true;
  }
  /** walking to the fountain, or drinking. true while it is busy with that (nothing else is done for it then) */
  function drinkStep(a, dt, rate) {
    const d = a.drink, f = fountainOf(), m = a.mon, mh = Mon.maxHp(m);
    if (!d || !f || m.hp <= 0 || m.hp >= mh) { if (d && m.hp >= mh && d.at) G.say(a, `${Mon.name(m)} feels refreshed!`, { col: '#8fd8ff', size: 11 }); a.drink = null; if (a.faceT && !a.faceT.mon) a.faceT = null; return false; }
    const far = Math.hypot(d.x - a.x, d.y - a.y);
    if (!d.at) {
      a.tx = d.x; a.ty = d.y; a.run = far > 180;
      if (far < 26 + a.w * a.hit * 0.2) { d.at = G.now; a.faceT = { x: f.x, gone: false }; }
      else if (G.now - d.t0 > 25) { a.drink = null; if (a.faceT && !a.faceT.mon) a.faceT = null; return false; }      // (it could not get there in 25 seconds: the way is blocked or the world changed)
      return true;
    }
    a.tx = a.x; a.ty = a.y; a.run = false;
    d.acc += mh * rate * dt;
    if (d.acc >= 1) { const n = Math.floor(d.acc); d.acc -= n; m.hp = Math.min(mh, m.hp + n); G.touch(); }
    if (a.side === 'team') m.st = null;                   // the water washes off poison, burns and the like
    d.fx -= dt;
    if (d.fx <= 0) { d.fx = 0.55; const c = G.center(a); FX.sparkle(c.x, c.y, 3, '#8fd8ff', a.w * 0.3); FX.part({ x: a.x + U.rand(-8, 8), y: a.y - 4, vx: U.rand(-30, 30), vy: -90, life: 0.5, size: 3, col: '#bfe9ff', shape: 'drop', drag: 0.2, g: 300 }); }
    return true;
  }
  G.drinking = (a) => !!(a && a.drink && a.drink.at);
  function wantsFountain(a) {
    if (a.drink || a.mon.hp <= 0 || G.set.roam === 'stay' || a.fetch || a.dragging || G.inTrainerBattle() || !fountainOf()) return false;
    const r = a.mon.hp / Mon.maxHp(a.mon), fighting = a.mode === 'fight' || a.mode === 'guard';
    return fighting ? r < 0.25 : r < 0.5;
  }
  // ---- healers mend the team (0.9.6, update 8): a team member that knows a healing move uses it, out of a fight, on a
  // hurt teammate (or on itself) every few seconds (src/battle.js, Battle.mend). In a fight chooseMove picks it.
  function mendTick(a) {
    if (G.now < (a.mendT || 0)) return;
    a.mendT = G.now + 1.3;
    const n = typeof Battle !== 'undefined' && Battle.mend ? Battle.mend(a) : '';
    if (!n) return;
    a.mendT = G.now + 9 / G.moveRate();
    G.say(a, `${n}!`, { col: '#b8ffb0', size: 12 });
    G.touch();
  }

  function teamAI(a, dt) {
    a.thinkT -= dt;
    if (a.thinkT <= 0) { a.thinkT = 0.4 + Math.random() * 0.2; think(a); }
    if (a.drink && (G.inTrainerBattle() || (a.mode === 'fight' && a.mon.hp / Mon.maxHp(a.mon) >= 0.5))) a.drink = null;      // called back into a fight (0.9.6)
    if (a.drink || (wantsFountain(a) && startDrink(a))) { if (drinkStep(a, dt, DRINK.team)) return; }
    if (a.mode === 'fight' && G.targetable(a.target)) { a.nap = 0; fight(a, dt); return; }
    if (a.mode === 'guard' && G.targetable(a.target)) {
      const t = a.target, ang = a.id * 2.4;
      a.tx = t.x + Math.cos(ang) * 190; a.ty = t.y + Math.sin(ang) * 110; a.run = U.dist(a, t) > 320; a.faceT = t; a.nap = 0;
      return;
    }
    a.faceT = null;
    if (a.fetch) {                                       // walking over to an item that was dropped
      const d = a.fetch;
      if (d.gone || d.by !== a) a.fetch = null;
      else {
        a.nap = 0; a.tx = d.x; a.ty = d.gy + 2; a.run = Math.hypot(d.x - a.x, d.gy - a.y) > 260;
        if (Math.hypot(d.x - a.x, d.gy - a.y) < 28 + a.w * a.hit * 0.25) G.pickUp(d, a);
        return;
      }
    }
    if (G.tidying && G.now - (G.tidyAt || 0) > 900) G.tidying = false;      // (they always come back: a quarter of an hour at most)
    if (G.tidying) { const b = G.bounds(a); a.tx = b.x1; a.ty = U.clamp(a.y, b.y0, b.y1); a.run = true; return; }      // (0.9.9) off to the edge of the world to help Rotom carry files
    // out of battle: recover, then stroll / follow / stay
    const calm = G.now - G.lastBattle;
    mendTick(a);
    if (calm > 6 && a.mon.hp < Mon.maxHp(a.mon)) {
      a.regen = (a.regen || 0) + Mon.maxHp(a.mon) * 0.03 * dt;
      if (a.regen >= 1) { const n = Math.floor(a.regen); a.regen -= n; a.mon.hp = Math.min(Mon.maxHp(a.mon), a.mon.hp + n); G.touch(); }
    }
    if (calm > 15 && (a.mon.st || a.stages.some((s) => s))) { a.mon.st = null; a.stages.fill(0); a.vol = {}; }
    const mode = G.set.roam;
    if (a.nap > 0) {
      a.nap -= dt; a.tx = a.x; a.ty = a.y;
      a.zz = (a.zz || 0) - dt;
      if (a.zz <= 0) { a.zz = 2.6; FX.text(a.x + a.w * 0.25, a.y - a.h * 0.9, 'Zzz', { col: '#c8d0e8', size: 12, dur: 1.6, vy: -18 }); }
      return;
    }
    if (mode === 'stay') { a.tx = a.x; a.ty = a.y; return; }
    if (mode === 'follow' && G.cursor.x > -1000) {
      const slot = G.save.team.indexOf(a.mon), ang = slot * 1.05 + 0.6, R = 150 + slot * 20, b = G.bounds(a);
      const px = U.clamp(G.cursor.x + Math.cos(ang) * R, b.x0, b.x1), py = U.clamp(G.cursor.y + 70 + Math.sin(ang) * R * 0.55, b.y0, b.y1);
      const d = Math.hypot(px - a.x, py - a.y);
      if (d > 90) { a.tx = px; a.ty = py; a.run = d > 340; }
      return;
    }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < ARRIVE) {
      a.idleT -= dt;
      if (a.idleT <= 0) {
        a.idleT = U.rand(2, 9); a.run = false;
        if (calm > 90 && U.chance(0.12)) { a.nap = U.rand(25, 60); return; }
        const pals = G.team().filter((b) => b !== a && G.alive(b) && !b.await);
        if (pals.length && U.chance(0.3)) {
          const pal = pals.reduce((b, x) => ((a.mon.bond[x.mon.uid] || 0) > (a.mon.bond[b.mon.uid] || 0) ? x : b), pals[0]), b = G.bounds(a);
          const side = a.x < pal.x ? -1 : 1, gap = (a.w * a.hit + pal.w * pal.hit) * 0.5 + 14;      // stop beside the friend, not on top of it
          a.tx = U.clamp(pal.x + side * (gap + U.rand(0, 70)), b.x0, b.x1); a.ty = U.clamp(pal.y + U.rand(-50, 50), b.y0, b.y1);
        } else waypoint(a, false);
      }
    }
  }

  // facing only changes now and then, so a sprite never flickers between left and right (or front and back)
  const setFace = (a, f) => { if (f !== a.face && G.now - a.faceAt > 0.3) { a.face = f; a.faceAt = G.now; } };
  const setBack = (a, on) => { if (on !== a.back && G.now - a.backAt > 0.4) { a.back = on; a.backAt = G.now; } };

  // Petting an injured team member mends it a very little: PET_HEAL of its full health per second, and only
  // until one second after the last pet (G.pet sets a.petHeal). A whole minute of petting restores about 70%.
  const PET_HEAL = 0.012;
  function petHealing(a, dt) {
    const m = a.mon, mh = Mon.maxHp(m);
    if (a.side !== 'team' || m.hp <= 0 || m.hp >= mh) { a.petHeal = -9; a.petAcc = 0; return; }
    a.petAcc = (a.petAcc || 0) + mh * PET_HEAL * dt;
    if (a.petAcc < 1) return;
    const n = Math.floor(a.petAcc);
    a.petAcc -= n; m.hp = Math.min(mh, m.hp + n);
    FX.text(a.x + U.rand(-10, 10), a.y - a.h * 0.8, '+' + n, { col: '#9cf07a', size: 11, dur: 0.8, vy: -22 });
    G.touch();
  }

  function stepActor(a, dt) {
    a.age += dt; a.stateT += dt;
    a.hpShown += (a.mon.hp - a.hpShown) * Math.min(1, dt * 9);
    if (a.flash > 0) a.flash -= dt;
    if (a.hop > 0) a.hop -= dt;
    if (a.shake > 0) a.shake -= dt;
    if (a.squash > 0) a.squash = Math.max(0, a.squash - dt * 8);
    if (a.petHeal > G.now) petHealing(a, dt);
    if (a.await) { stepAwait(a); if (a.await || !a.fall) return; }
    if (a.fall) {                                        // dropping in: a short fall, then it lands with a little dust
      const f = a.fall; f.t += dt;
      const k = Math.min(1, f.t / 0.3);
      a.jy = -f.h * (1 - k * k);
      if (k >= 1) { a.fall = null; a.jy = 0; a.squash = 1; FX.dust(a.x, a.y, 6, 3 + G.scale); snd('land', a, { vol: 0.5 }); }
      return;
    }
    if (a.hops && a.state !== 'captured' && !a.dragging) { stepHops(a, dt); return; }
    if (a.kx || a.ky) {
      a.x += a.kx * dt; a.y += a.ky * dt; a.tx += a.kx * dt; a.ty += a.ky * dt;
      const k = Math.max(0, 1 - 9 * dt); a.kx *= k; a.ky *= k;
      if (Math.abs(a.kx) + Math.abs(a.ky) < 3) a.kx = a.ky = 0;
    }
    if (a.lunge) {
      const l = a.lunge; l.t += dt;
      if (l.t < l.dur) { const k = l.t / l.dur; a.ox = l.dx * k * k; a.oy = l.dy * k * k; }
      else {
        if (!l.done) { l.done = true; l.hit(); }
        const k = Math.min(1, (l.t - l.dur) / l.back); a.ox = l.dx * (1 - k); a.oy = l.dy * (1 - k);
        if (k >= 1) { a.lunge = null; a.ox = a.oy = 0; }
      }
    }
    if (a.state === 'faint') {
      // (not while a Trainer battle is on: whoever goes down stays down until it is over)
      if (a.side === 'team' && !G.inTrainerBattle() && (a.stateT > 25 || (a.stateT > 8 && !G.wilds().length))) {
        a.state = 'idle'; a.mon.hp = Math.max(1, Math.floor(Mon.maxHp(a.mon) / 2)); a.mode = 'roam'; a.cd = 1.5; a.dmgBy = new Set();
        G.say(a, `${Mon.name(a.mon)} is back on its feet!`, { col: '#9cf07a', size: 11 }); snd('heal', a, { vol: 0.6 });
      }
      return;
    }
    if (a.state === 'captured' || a.dragging) return;
    if (a.mon.shiny && a.side === 'wild' && !a.rival) { a.glintT = (a.glintT || 0) - dt; if (a.glintT <= 0) { a.glintT = U.rand(0.35, 0.8); FX.glint(a.x + U.rand(-a.w, a.w) * 0.45, a.y - U.rand(0.1, 1) * a.h, U.rand(7, 14), U.chance(0.5) ? '#fff6a8' : '#ffffff'); } }      // a wild shiny keeps glinting
    if (a.mon.alpha && a.side === 'wild') { a.aura = (a.aura || 0) - dt; if (a.aura <= 0) { a.aura = 0.12; FX.part({ x: a.x + U.rand(-a.w * 0.35, a.w * 0.35), y: a.y - U.rand(0, a.h * 0.5), vx: 0, vy: -60, life: 0.7, size: 4, col: U.pick(['#ff5a3c', '#ff9a5a']), shape: 'flame', add: 1, drag: 0.4 }); } }
    if (a.side === 'wild') wildAI(a, dt); else teamAI(a, dt);
    if (a.gone || a.hops) return;
    // movement: toward its goal, or round whatever stands in the way (steer)
    const far = Math.hypot(a.tx - a.x, a.ty - a.y), via = G.blocks && G.blocks.length && far > 3 ? steer(a) : null;
    const dx = (via ? via[0] : a.tx) - a.x, dy = (via ? via[1] : a.ty) - a.y, d = Math.hypot(dx, dy) || 0.001;
    let sp = a.speed * G.walkRate() * (a.run ? 1.7 : 0.65) * (a.mon.st === 'par' ? 0.5 : 1) * U.clamp(1 + 0.1 * a.stages[5], 0.5, 1.6) * (a.hasteT > G.now ? a.haste : 1);
    if (a.busy || a.lunge || a.vol.trap || a.mon.st === 'slp' || a.mon.st === 'frz') sp = 0;
    a.moving = sp > 0 && far > (a.moving ? 3 : 10);
    if (a.moving) {
      const step = Math.min(d, sp * dt);
      a.x += (dx / d) * step; a.y += (dy / d) * step;
      if (Math.abs(dx) > 6) setFace(a, dx > 0 ? -1 : 1);
      setBack(a, dy < 0 && Math.abs(dy) > Math.abs(dx) * 1.3 && d > 24);
    } else {
      setBack(a, false);
      if (a.faceT && !a.faceT.gone && Math.abs(a.faceT.x - a.x) > 14) setFace(a, a.faceT.x > a.x ? -1 : 1);
    }
    // keep the whole sprite and its name tag on the screen (eased, so nothing snaps)
    const b = G.bounds(a), cx = U.clamp(a.x, b.x0, b.x1), cy = U.clamp(a.y, b.y0, b.y1);
    if (cx !== a.x || cy !== a.y) { const m = 900 * dt; a.x += U.clamp(cx - a.x, -m, m); a.y += U.clamp(cy - a.y, -m, m); }
    a.tx = U.clamp(a.tx, b.x0, b.x1); a.ty = U.clamp(a.ty, b.y0, b.y1);
    // Things that stand in the world (the fountain and its places, on the MyStream stage and in the field window).
    // G.blocks = [{ x, y, rx, ry, pass(a) }], ellipses on the ground. Feet inside one are eased out to its edge; a place
    // to go that lies inside becomes the nearest spot on the edge. pass(a) true = this one may enter.
    if (G.blocks && G.blocks.length) for (const o of G.blocks) {
      if (o.pass && o.pass(a)) continue;
      const ex = (a.x - o.x) / o.rx, ey = (a.y - o.y) / o.ry, q = ex * ex + ey * ey;
      if (q < 1) {
        const r = Math.sqrt(q) || 0.001, m = 600 * dt, ux = q < 1e-4 ? 1 : ex / r, uy = q < 1e-4 ? 0 : ey / r;
        a.x += U.clamp(o.x + ux * o.rx - a.x, -m, m); a.y += U.clamp(o.y + uy * o.ry - a.y, -m, m);      // (which way round it is steer's business)
      }
      const gx = (a.tx - o.x) / o.rx, gy = (a.ty - o.y) / o.ry, gq = gx * gx + gy * gy;
      if (gq < 1.04) {
        const far = gq > 0.01, vx = far ? gx : ex || 1, vy = far ? gy : ey, vl = Math.hypot(vx, vy) || 1;
        a.tx = o.x + (vx / vl) * o.rx * 1.03; a.ty = o.y + (vy / vl) * o.ry * 1.03;
      }
    }
  }

  function separate(dt) {
    const list = G.actors, f = Math.min(1, dt * 7);
    const skip = (a) => a.state === 'captured' || a.dragging || a.state === 'faint' || a.state === 'leave' || a.hops || a.await || a.fall;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (skip(a) || skip(b)) continue;
      const min = (a.w * a.hit + b.w * b.hit) * (a.side === b.side ? 0.46 : 0.34);
      let dx = b.x - a.x, dy = (b.y - a.y) * 1.7, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.5) { const ang = (a.id * 2.4 + b.id) % 6.283; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
      const push = ((min - d) / d) * 0.5 * f, px = dx * push, py = (dy / 1.7) * push;
      // a resting actor takes its goal along, otherwise it would walk straight back and shiver
      if (!a.lunge) { a.x -= px; a.y -= py; if (!a.moving) { a.tx -= px; a.ty -= py; } }
      if (!b.lunge) { b.x += px; b.y += py; if (!b.moving) { b.tx += px; b.ty += py; } }
    }
  }

  // ------------------------------------------------------------------ spawning
  G.buildPool = () => {
    const gens = new Set(G.set.gens || [1]);
    G.pool = Object.keys(D.dex).map(Number).filter((id) => gens.has(D.dex[id].g) && Sprites.available(id));
  };
  // 0.9.5 (owner's list 11-16, updates 12 and 16): groups, variety and the time of day are options.
  const GROUP_ODDS = { off: 0, rare: 0.07, sometimes: 0.16, often: 0.32 };      // 'sometimes' is how it always was
  const RECENT = 6;                                         // the last few species that came (variety makes them less likely again)
  // Night-time Pokémon: every Ghost and Dark type, and these (national numbers): Oddish's line, Clefairy's, Zubat's,
  // Hoothoot's, Spinarak's, Murkrow's, Volbeat, Illumise, Lunatone, Woobat's, Noibat's, Morelull's.
  const NIGHT = new Set([43, 44, 45, 182, 35, 36, 173, 41, 42, 169, 163, 164, 167, 168, 198, 430, 313, 314, 337, 527, 528, 714, 715, 755, 756]);
  G.isNocturnal = (id) => { const d = D.dex[id]; return !!d && (NIGHT.has(id) || d.t.some((t) => D.types[t] === 'ghost' || D.types[t] === 'dark')); };
  /** what the clock says (only with the option on): 'night' from 9 in the evening to 5 in the morning, else 'day' */
  G.timeOfDay = (date) => { if (!G.set.timeSpawns) return ''; const h = (date || new Date()).getHours(); return h >= 21 || h < 5 ? 'night' : 'day'; };
  /** how likely a species is to come next: common ones more (catch rate), evolved, baby and legendary ones less; the
   *  variety option evens that out and keeps the last few species from coming straight back; the time of day
   *  (option) favours night-time Pokémon at night and keeps most of them asleep by day */
  function spawnWeight(i, nCaught) {
    const d = D.dex[i];
    let w = d.cr * (d.st > 0 ? 0.35 : 1) * (d.bb ? 0.4 : 1) * (d.lg ? (nCaught >= 15 ? 0.25 : 0) : 1);
    const v = U.clamp(G.set.variety || 0, 0, 10);
    if (w > 0 && v > 0) { w = Math.pow(w, 1 - v * 0.09); if ((G.recentSpawns || []).includes(i)) w *= 1 - v * 0.085; }
    const tod = G.timeOfDay();
    if (tod) w *= G.isNocturnal(i) ? (tod === 'night' ? 6 : 0.4) : (tod === 'night' ? 0.35 : 1);
    const mod = G.modSpawn;      // (1.0) mods: a multiplier for the species and for each of its types (mods.js checked them: 0 to 20)
    if (mod && w > 0) { if (mod[i] !== undefined) w *= mod[i]; for (const t of d.t || []) { const m = mod['type:' + D.types[t]]; if (m !== undefined) w *= m; } }
    return w;
  }
  G.spawnWeight = spawnWeight;
  G.spawnWild = () => spawnWild();      // (for the checks: tools/v095check.js)
  function spawnWild() {
    if (!G.pool || !G.pool.length) return null;
    const team = G.save.team, nCaught = caughtSpecies();
    let sp = 0, lvl = 3;
    if (!team.length) {
      const easy = G.pool.filter((id) => { const d = D.dex[id]; return d.st === 0 && !d.lg && !d.bb && d.cr >= 120; });
      sp = U.pick(easy.length ? easy : G.pool); lvl = 2 + U.rint(3);
    } else {
      const avg = team.reduce((s, m) => s + m.lvl, 0) / team.length;
      for (let tries = 0; tries < 40 && !sp; tries++) {
        const L = U.clamp(Math.round(avg * U.rand(0.55, 1.1)) + U.rint(3) - 1, 2, 100);
        const id = U.wpick(G.pool, (i) => spawnWeight(i, nCaught));
        const d = D.dex[id];
        if (d.ml > L + 4) continue;
        sp = id; lvl = Math.max(L, d.ml);
      }
      if (!sp) return null;
    }
    G.recentSpawns = [sp].concat(G.recentSpawns || []).slice(0, RECENT);
    const odds = 1 / Math.max(1, G.set.shinyOdds || 100), d = D.dex[sp];
    // late-game variety: alpha encounters (big, tough, aggressive) and hordes of one species
    if (team.length >= 2 && !d.lg && U.chance(0.07)) return G.addWild(sp, Math.min(100, Math.max(lvl, d.ml) + 6 + U.rint(8)), U.chance(odds), null, { alpha: true });
    const first = G.addWild(sp, lvl, U.chance(odds));
    if (team.length >= 3 && !d.lg && d.st === 0 && U.chance(GROUP_ODDS[G.set.groupFreq] !== undefined ? GROUP_ODDS[G.set.groupFreq] : 0.16)) {
      const most = U.clamp(G.set.groupMax || 5, 2, 10), n = U.clamp(most - 3 + U.rint(3), 1, most - 1);      // followers: the group is (most - 2) to most strong, the first one included
      for (let i = 0; i < n; i++) { const b = G.addWild(sp, Math.max(2, Math.round(lvl * 0.6)), U.chance(odds), null, { quiet: true, near: first }); b.terr = true; b.horde = true; }
      first.terr = true; first.horde = true; first.calm = false;
      G.toast({ title: `A horde of ${d.n} appeared!`, icon: Sprites.icon(sp), tone: 'alert' });
    }
    return first;
  }
  /** where a newcomer comes in: which edge of the world (0 left, 1 right, 2 top, 3 bottom), how far along it, and where it
   *  hops to. The world is the whole screen or, while the field window is open, the field. near: arrive beside this one. */
  function entrySpot(near) {
    const side = near ? near.side0 : U.wpick([0, 1, 2, 3], (i) => (i < 2 ? G.H : G.W));
    // how far in a newcomer goes: up to the middle of the world (until 0.7 no further than 460 px, which kept them near the edges)
    const inX = [Math.min(110, G.W * 0.12), Math.max(Math.min(460, G.W * 0.4), G.W * 0.5)], top = [Math.min(170, G.H * 0.25), Math.max(Math.min(420, G.H * 0.55), G.H * 0.6)], bottom = [Math.min(90, G.H * 0.15), Math.max(Math.min(340, G.H * 0.5), G.H * 0.55)];
    let along, ex, ey;
    if (near) { along = near.along + U.rand(-90, 90); ex = near.dest.x + U.rand(-150, 150); ey = near.dest.y + U.rand(-120, 120); }
    else if (side < 2) { along = U.rand(Math.min(140, G.H * 0.3), G.H - 40); ex = side === 0 ? U.rand(inX[0], inX[1]) : G.W - U.rand(inX[0], inX[1]); ey = along + U.rand(-160, 160); }
    else { along = U.rand(Math.min(80, G.W * 0.2), G.W - Math.min(80, G.W * 0.2)); ex = along + U.rand(-200, 200); ey = side === 2 ? U.rand(top[0], top[1]) : G.H - U.rand(bottom[0], bottom[1]); }
    return { side, along, x: ex, y: ey };
  }
  /** add a wild creature. pos (optional) puts it straight on the screen; otherwise it hops in from an edge.
   *  o: { alpha, quiet, near: another wild to arrive next to (hordes), event: a legendary visit announces itself,
   *       hpx: health multiplier while wild, sz: size value } */
  G.addWild = (sp, lvl, shiny, pos, o = {}) => {
    const mon = Mon.create(sp, lvl, { shiny, sz: o.alpha ? 255 : o.sz });        // alphas are always Extra large
    if (o.alpha) { mon.hpx = 3; mon.alpha = 1; mon.hp = Mon.maxHp(mon); for (const i of [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 3)) mon.iv[i] = 31; }
    if (o.hpx) { mon.hpx = o.hpx; mon.hp = Mon.maxHp(mon); }
    const e = entrySpot(o.near), side = e.side, along = e.along, ex = e.x, ey = e.y;
    const a = G.spawnActor(mon, 'wild', pos ? pos.x : -9999, pos ? pos.y : -9999);
    a.side0 = side; a.along = along; a.dest = { x: ex, y: ey };
    a.terr = o.alpha || U.chance(0.35);
    // some come in peace and simply stay (never alphas, hordes, legendaries or visitors)
    a.calm = !o.alpha && !o.near && !o.event && !D.dex[sp].lg && (G.set.maxLoiter | 0) > 0 && U.chance(CALM);
    if (a.calm) a.terr = false;
    if (o.alpha) a.stay += 40;
    if (pos) a.state = 'roam';
    else { a.state = 'enter'; a.await = { side, along, x: ex, y: ey, cry: !o.quiet, then: () => { if (a.state === 'enter') a.state = 'roam'; a.idleT = U.rand(0.4, 1.6); } }; }
    // What the Pokédex knows of it goes into the news of its arrival (0.7): never seen before, seen but not caught, or
    // already caught. A kind that is new to the Pokédex gets a card of its own; the others say it in their line.
    const dex = G.save.dex, known = dex.caught[sp] ? 'caught' : dex.seen[sp] ? 'seen' : 'new';
    const KNOWN = { new: 'Never seen before: a new kind for your Pokédex.', seen: 'Seen before, not caught yet.', caught: `Already caught${dex.caught[sp] > 1 ? ' (' + dex.caught[sp] + ' times)' : ''}.` };
    a.known = known;
    G.save.dex.seen[sp] = 1;
    const nm = D.dex[sp].n, tx = U.clamp(ex, 120, G.W - 120), ty = U.clamp(ey - 90, 60, G.H - 60);
    if (o.alpha) { G.toast({ title: `An alpha ${nm} appeared!`, text: `Bigger, tougher and looking for a fight. ${KNOWN[known]}`, icon: Sprites.icon(sp), tone: 'alert', dur: 4.2 }); }
    if (o.quiet) { /* part of a horde */ }
    else if (shiny) {
      // a shiny is announced twice over: the card, a fanfare of sparkles when it lands, and it keeps glinting while it is here (stepActor)
      G.toast({ title: `✦ A shiny ${nm} appeared! ✦`, text: `Do not let it get away. ${KNOWN[known]}`, icon: Sprites.still(sp, true) || Sprites.icon(sp), tone: 'shiny', dur: 7 });
      G.after(1.1, () => { if (!a.gone) { FX.sparkle(a.x, a.y - a.h * 0.5, 22, '#fff6a8', a.w * 0.7); FX.ring(a.x, a.y - a.h * 0.5, 6, a.w + 60, '#fff6a8', 0.9, 3); for (let i = 0; i < 9; i++) FX.glint(a.x + U.rand(-a.w, a.w) * 0.6, a.y - U.rand(0, a.h), U.rand(8, 18), '#fff6a8'); snd('shiny', a); } });
      G.after(2.0, () => { if (!a.gone && a.side === 'wild') { FX.sparkle(a.x, a.y - a.h * 0.5, 12, '#ffffff', a.w * 0.5); FX.ring(a.x, a.y - a.h * 0.5, 4, a.w + 30, '#ffe14d', 0.7, 2); } });
    } else if (!o.alpha && !o.event) {
      if (known === 'new') G.toast({ title: `A wild ${nm} appeared!`, text: KNOWN.new, icon: Sprites.icon(sp), tone: 'good', dur: 4.2 });
      else if (G.verbose()) FX.text(tx, ty, `A wild ${nm} appeared!`, { size: 13, dur: 2.4, vy: -10, col: '#ffffff' });      // (caught or not: the ball by its name says it, 0.9.3)
    }
    G.touch();
    return a;
  };

  // ------------------------------------------------------------------ item drops
  /** roll what a beaten or caught wild creature leaves behind and put it on the screen */
  G.dropsFrom = (a, ctx) => {
    if (G.set.itemDrops === false) return;
    const keys = Items.rollDrops(a.mon, Object.assign({ alpha: !!a.mon.alpha, shiny: !!a.mon.shiny, legend: !!D.dex[a.mon.sp].lg, horde: !!a.horde, luck: Items.teamLuck(G.save.team) }, ctx));
    keys.forEach((k, i) => G.dropItem(k, a.x + i * 28, a.y));
  };
  G.dropItem = (key, x, y) => {
    while (G.drops.length >= 24) G.removeDrop(G.drops[0]);
    const src = Sprites.item(key), el = src ? new Image() : document.createElement('div');
    el.className = 'drop' + (src ? '' : ' plain');
    if (src) { el.src = src; el.draggable = false; }
    const size = Math.round(30 * Math.max(1, G.scale * 0.7));
    el.style.width = el.style.height = size + 'px';
    G.world.appendChild(el);
    const d = { id: G.aid++, key, el, size, x: U.clamp(x, 30, G.W - 30), y: y - 30, gy: U.clamp(y + U.rand(-6, 22), 90, G.H - 10), vx: U.rand(-70, 70), vy: -330, t: 0, rest: false, bounced: false, by: null, gone: false, tw: U.rand(0.4, 1.4) };
    G.drops.push(d);
    return d;
  };
  G.removeDrop = (d) => { d.gone = true; d.el.remove(); const i = G.drops.indexOf(d); if (i >= 0) G.drops.splice(i, 1); if (G.hoverDrop === d) G.hoverDrop = null; };
  /** an item is picked up: by a team member that walked over to it, or by the player's click (by = null) */
  G.pickUp = (d, by) => {
    if (d.gone) return;
    const def = Items.get(d.key);
    G.removeDrop(d);
    const n = def && def.ball ? Items.ballStack(d.key) : 1;   // balls are found by the stack: 10 to 100 of them (1 to 10 Master Balls)
    if (!def || !Items.add(d.key, n)) return;
    FX.sparkle(d.x, d.y - d.size * 0.5, 6, '#fff6a8', 16); FX.ring(d.x, d.y - d.size * 0.5, 4, 26, '#fff6a8', 0.3, 2);
    const what = n > 1 ? `${n} ${def.n}s` : an(def.n), inUse = def.ball && G.save.ball === d.key;
    const note = !def.ball ? def.text : inUse ? `Your next throws use them. After the last one it is back to the Poké Ball. ${def.text}` : `In the Bag for when the ${Items.name(G.save.ball)}s run out. ${def.text}`;
    G.toast({ title: by ? `${Mon.name(by.mon)} found ${what}!` : `You found ${what}!`, text: note, icon: Sprites.item(d.key), tone: def.tier >= 3 ? 'rare' : 'item', dur: def.ball ? 5 : def.tier >= 3 ? 4.6 : 3.4 });
    snd(def.tier >= 4 ? 'treasure' : def.tier === 3 ? 'item' : 'pickup', d);
    if (by) { by.hop = 0.25; by.fetch = null; by.idleT = U.rand(1, 3); by.tx = by.x; by.ty = by.y; }
    G.pushState();
  };
  function stepDrop(d, dt) {
    if (!d.rest) {
      d.vy += 1100 * dt; d.y += d.vy * dt; d.x = U.clamp(d.x + d.vx * dt, 20, G.W - 20);
      if (d.y >= d.gy) { d.y = d.gy; if (!d.bounced) { d.bounced = true; d.vy = -160; d.vx *= 0.4; FX.dust(d.x, d.gy, 4, 3); snd('land', d, { vol: 0.5 }); } else d.rest = true; }
    } else {
      d.t += dt; d.tw -= dt;
      if (d.tw <= 0) { d.tw = U.rand(0.9, 1.9); FX.glint(d.x + U.rand(-d.size, d.size) * 0.3, d.y - d.size * U.rand(0.3, 0.9), U.rand(6, 11), '#fff6a8'); }
      if (d.t > 150) { G.removeDrop(d); return; }                       // nobody wanted it
      if (!d.by && d.t > 4) {                                          // a free team member walks over to fetch it
        const free = G.team().filter((a) => G.alive(a) && !a.await && !a.hops && !a.fetch && !a.dragging && a.mode !== 'fight' && a.mode !== 'guard' && !(a.nap > 0));
        const who = nearest(free, d);
        if (who) { d.by = who; who.fetch = d; }
      }
    }
    const bob = d.rest ? Math.sin(G.now * 3 + d.id) * 2 : 0, fade = d.t > 144 ? Math.max(0, (150 - d.t) / 6) : 1;
    d.el.style.transform = `translate3d(${(d.x - d.size / 2).toFixed(1)}px,${(d.y - d.size + bob).toFixed(1)}px,0)`;
    d.el.style.zIndex = Math.floor(d.gy);
    if (fade !== d._op) { d._op = fade; d.el.style.opacity = fade; }
  }

  // ------------------------------------------------------------------ trainer input
  G.pick = (x, y) => {
    const [sx, sy] = G.toScreen(x, y);                    // (where the point is on the screen)
    if (!G.inView(sx, sy)) {                              // outside the field window: only what stands on the screen itself (0.9.1)
      if (typeof Rivals !== 'undefined' && Rivals.hit(sx, sy)) return { kind: 'gym' };
      if (typeof Mewtwo !== 'undefined' && Mewtwo.hit(sx, sy)) return { kind: 'guard' };
      return null;
    }
    const b = G.ballBtn;
    if (b && G.targetable(b.a) && Math.hypot(x - b.x, y - b.y) <= b.r + 5) return { kind: 'ball', actor: b.a };
    for (const d of G.drops) if (d.rest && Math.abs(x - d.x) <= d.size * 0.6 + 4 && y >= d.y - d.size - 6 && y <= d.y + 8) return { kind: 'drop', drop: d };
    let best = null, bestD = Infinity;
    for (const a of G.actors) {
      if (a.gone || a.await || a.state === 'captured' || a.state === 'leave' || (a.side === 'wild' && a.state === 'faint')) continue;
      // species drawn to scale can be tiny: the clickable area never shrinks below about 36 by 34 pixels
      const hw = Math.max(a.w * a.hit * 0.5, 12) + 6, top = a.y - Math.max(a.h * (a.pad ? 0.8 : 1), 28) - 6 + a.jy, bottom = a.y + 6 + a.jy;
      if (x < a.x - hw || x > a.x + hw || y < top || y > bottom) continue;
      // where sprites overlap, the one whose middle is nearest the pointer (measured in its own size) is the one meant:
      // a small Pokémon standing in front of, or behind, a large one can still be clicked
      const d = Math.hypot((x - a.x) / hw, (y - (top + bottom) / 2) / ((bottom - top) / 2));
      if (d < bestD) { best = a; bestD = d; }
    }
    if (!best && b && G.targetable(b.a) && Math.abs(x - b.a.x) < 84 && y > b.y - 24 && y < b.a.y) best = b.a;
    if (!best && typeof Rivals !== 'undefined' && Rivals.hit(sx, sy)) return { kind: 'gym' };        // the badge button that calls a Gym Leader back (src/rivals.js)
    if (!best && typeof Mewtwo !== 'undefined' && Mewtwo.hit(sx, sy)) return { kind: 'guard' };      // Mewtwo
    if (!best && typeof Square !== 'undefined' && !(G.covered && G.covered(sx, sy))) { const k = Square.hit(x, y); if (k) return { kind: 'place', what: k }; }      // the fountain's button, a Day Care guest, the egg (src/square.js)
    return best ? { kind: 'actor', actor: best } : null;
  };
  G.poke = (a, x, y) => {
    if (!G.targetable(a)) return;
    G.save.stats.clicks++; a.clicks++;
    if (a.loiter || a.calm) unsettle(a);                  // clicking a loiterer makes an encounter of it again
    G.trainerTarget = a; G.clickT = G.now;
    FX.burst(x, y, 'normal', 6, 150, 4, 0.35); FX.ring(x, y, 4, 24, '#ffffff', 0.22, 2);
    snd('poke', a, { vol: 0.8 });
    const mh = Mon.maxHp(a.mon);
    G.hurt(a, Math.max(1, Math.ceil(mh * (G.save.team.length ? 0.05 : 0.09) * U.clamp(G.set.clickPower || 1, 0.25, 4))), null, { type: 'normal', noKO: true });      // (clickPower, 0.9.5; noKO: a click never knocks out, overlay rule 3)
    a.hop = 0.2;
    // with a team (and without "hands off") a poked wild turns on the team; otherwise it just skips about
    if (G.save.team.length && !G.set.handsOff && !G.inTrainerBattle()) { if (a.clicks >= 2 && !a.cower) a.aggro = true; }
    else if (a.clicks % 4 === 0 && !a.hops) { waypoint(a, false); a.run = true; a.idleT = 1; }
  };
  G.pet = (a) => {
    if (a.state === 'faint') { G.say(a, 'needs a moment to recover...', { col: '#c8c8d0', size: 11 }); return; }
    const m = a.mon;
    FX.hearts(a.x, a.y - a.h * 0.9, 2 + Mon.hearts(m)); a.hop = 0.25; a.nap = 0;
    snd('pet', a);
    G.save.stats.pets++;
    if (m.hp < Mon.maxHp(m)) a.petHeal = G.now + 1;        // a little mending that stops one second after the last pet
    if (G.now - a.petT < 2) return;
    a.petT = G.now;
    const before = Mon.hearts(m);
    m.aff = Math.min(255, m.aff + Math.ceil(2 * Items.affMult(m)));
    if (Mon.hearts(m) > before) { G.say(a, `Affection rose! ${'♥'.repeat(Mon.hearts(m))}`, { col: '#ff8fb3', size: 13 }); FX.sparkle(a.x, a.y - a.h * 0.5, 8, '#ffb8d0', a.w * 0.5); Sound.cry(m.sp, { x: a.x, pitch: 1.08, vol: 0.6 }); }
    if (G.set.evolve !== false) { const e = Mon.tryEvolve(m); if (e) G.evolveFx(a, e); }
    G.touch();
  };
  // ------------------------------------------------------------------ what the pointer did
  // The last few happenings are kept (not saved anywhere) so that "I clicked and nothing happened" can be looked into:
  // the request { "run": "pointer" } writes them to the self-check folder, with what the windows were doing (main.js).
  G.trace = [];
  G.note = (what, d) => { G.trace.push(Object.assign({ at: Date.now(), now: +G.now.toFixed(2), what }, d || {})); if (G.trace.length > 200) G.trace.shift(); };
  const whoIs = (a) => (a ? `${Mon.name(a.mon)}#${a.id} ${a.side}${a.rival ? ' rival' : ''} ${a.state}${a.await ? ' await' : ''}${a.balled ? ' balled' : ''}${a.vol && a.vol.away ? ' away' : ''}${a.dragging ? ' dragging' : ''}` : '');
  const hitIs = (hit) => (!hit ? 'nothing' : hit.kind === 'box' ? 'box ' + hit.name + (hit.held ? ' (held)' : '') : hit.kind ? hit.kind + (hit.actor ? ' ' + whoIs(hit.actor) : hit.what ? ' ' + hit.what : '') : hit.actor ? 'held ' + whoIs(hit.actor) : '?');
  /** the Pokémon nearest to a point, and whether a click there could have meant it */
  function nearestTo(x, y) {
    let best = null, bd = Infinity;
    for (const a of G.actors) { const d = Math.hypot(x - a.x, y - (a.y - a.h * 0.45)); if (d < bd) { bd = d; best = a; } }
    if (!best) return 'nobody on the field';
    const a = best, hw = Math.max(a.w * a.hit * 0.5, 12) + 6, top = a.y - Math.max(a.h * (a.pad ? 0.8 : 1), 28) - 6 + a.jy, inside = x >= a.x - hw && x <= a.x + hw && y >= top && y <= a.y + 6 + a.jy;
    return `${whoIs(a)}, ${Math.round(bd)} px away, ${inside ? 'the click was on it' : 'the click was beside it'}${a.gone ? ', gone' : ''}`;
  }
  G.pointerReport = () => ({
    machines: Machine.report(), putRight: G.sanityFound || 0, seen: Object.assign({}, G.seen),
    boxMons: typeof BoxField !== 'undefined' && BoxField.active() ? BoxField.where().slice(0, 12).map((s) => Object.assign(s, { screen: G.toScreen(s.x, s.y - s.h * 0.5).map(Math.round) })) : undefined,
    trace: G.trace.slice(-200), now: +G.now.toFixed(2), cursor: { x: Math.round(G.cursor.x), y: Math.round(G.cursor.y) }, capture: G.capture, drag: G.drag ? whoIs(G.drag.a) : '', hover: whoIs(G.hover),
    box: typeof BoxField !== 'undefined' ? BoxField.state() : null, view: G.view || null, cam: G.cam || null, W: Math.round(G.W), H: Math.round(G.H), stage: !!(document.body && document.body.classList.contains('stage')),
    actors: G.actors.map((a) => { const s = G.toScreen(a.x, a.y - a.h * 0.45), hit = G.pick(a.x, a.y - a.h * 0.45); return { who: whoIs(a), x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h), screen: [Math.round(s[0]), Math.round(s[1])], targetable: G.targetable(a), clickAtItsMiddleMeans: hitIs(hit) }; }),
  });
  G.onDown = (x, y, button) => {
    G.cursor.x = x; G.cursor.y = y;
    if (typeof BoxField !== 'undefined' && BoxField.active()) {      // the Box Field: its Pokémon can be petted, carried and looked up (0.9)
      const s = G.inView(...G.toScreen(x, y)) ? BoxField.down(x, y, button) : '';
      G.note('down', { x: Math.round(x), y: Math.round(y), button, hit: s ? 'box ' + s : 'nothing', waiting: 'the Box Field is up' });
      return;
    }
    const hit = G.pick(x, y);
    G.note('down', { x: Math.round(x), y: Math.round(y), button, hit: hitIs(hit), near: hit ? undefined : nearestTo(x, y) });
    if (!hit) return;
    if (hit.kind === 'drop') { G.pickUp(hit.drop, null); return; }
    if (hit.kind === 'guard') { const s = G.toScreen(x, y); Mewtwo.down(s[0], s[1], button); return; }
    if (hit.kind === 'place') { if (typeof Square !== 'undefined') Square.down(hit.what, x, y, button); return; }
    if (hit.kind === 'gym') { if (button === 0) Rivals.rematch(); return; }
    const a = hit.actor;
    if (hit.kind === 'ball') { G.throwBall(a); return; }
    if (a.side === 'wild' && a.rival && typeof Rivals !== 'undefined') { Rivals.click(a, button); return; }      // another Trainer's Pokémon: a click is an order, not a poke
    if (a.side === 'wild') { if (button === 2) G.throwBall(a); else if (button === 0) { if (G.peaceful(a)) Events.pet(a); else G.poke(a, x, y); } }
    else if (button === 2) teamRight(a);                  // a right-click opens the Pokédex on that team member's own page; two quick ones open the field window (0.9.5)
    else if (button === 0) G.drag = { a, ox: a.x - x, oy: a.y - y, sx: x, sy: y, moved: false };
  };
  // A right-click on a team member opens the Pokédex on its page. Two right-clicks on it in quick succession open the
  // field window instead (owner's list 11-16, update 10), so the Pokédex waits RIGHT_TWICE seconds for a second one.
  const RIGHT_TWICE = 0.33;
  let rightOf = null, rightAt = 0, rightT = 0;
  function teamRight(a) {
    const now = Date.now(), uid = a.mon.uid;
    clearTimeout(rightT);
    if (rightOf === uid && now - rightAt < RIGHT_TWICE * 1000 + 120) {
      rightOf = null; G.note('field', { by: 'two right-clicks' });
      try { if (window.st.openField) window.st.openField(); } catch (e) { /* no field window here */ }
      return;
    }
    rightOf = uid; rightAt = now;
    rightT = setTimeout(() => { rightOf = null; try { window.st.openPanel('party:' + uid); } catch (e) { /* no Pokédex here */ } }, RIGHT_TWICE * 1000);
  }
  G.onMove = (x, y) => {
    G.cursor.x = x; G.cursor.y = y;
    if (typeof BoxField !== 'undefined' && BoxField.active()) { BoxField.move(x, y); return; }
    if (typeof Mewtwo !== 'undefined') { const s = G.toScreen(x, y); if (Mewtwo.move(s[0], s[1])) return; }
    const d = G.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > 6) { d.moved = true; d.a.dragging = true; d.a.nap = 0; d.a.hops = null; d.a.jy = 0; d.a.fetch = null; }
    if (d.moved) { const b = G.bounds(d.a); d.a.x = U.clamp(x + d.ox, b.x0, b.x1); d.a.y = U.clamp(y + d.oy, b.y0, b.y1); d.a.tx = d.a.x; d.a.ty = d.a.y; }
  };
  G.onUp = () => {
    if (typeof Mewtwo !== 'undefined') Mewtwo.up();
    if (typeof BoxField !== 'undefined' && BoxField.up()) { G.note('up', { drag: 'a Pokémon of the Box' }); return; }
    const d = G.drag;
    G.note('up', { drag: d ? whoIs(d.a) + (d.moved ? ', moved' : ', a pat') : 'none' });
    if (!d) return;
    G.drag = null; d.a.dragging = false; d.a.idleT = U.rand(3, 7);
    if (d.a.gone || !G.actors.includes(d.a)) return;      // (it left while it was held)
    if (!d.moved) G.pet(d.a); else { d.a.squash = 1; FX.dust(d.a.x, d.a.y, 4, 3 + G.scale); }
  };

  // ------------------------------------------------------------------ catching
  /** o (only from src/visitors.js): { by: the visiting Trainer's place 1 to 3, x: where their pointer is }.
   *  A visitor throws a plain Poké Ball of their own: nothing is taken from the Bag. */
  G.throwBall = (a, o) => {
    if (a && a.rival) { G.say(a, 'It belongs to another Trainer!', { col: '#ffd0d0', size: 12 }); return; }
    if (!G.targetable(a) || a.side !== 'wild' || a.balled || a.await || G.now - G.lastThrow < 0.9) return;
    G.lastThrow = G.now; a.balled = true; G.trainerTarget = a; G.clickT = G.now;
    const by = o && o.by ? o.by | 0 : 0;
    const tier = by ? { name: STANDARD_BALL.name, label: STANDARD_BALL.label, mult: STANDARD_BALL.mult * (a.ev ? Events.catchMult(a) : 1), special: null } : G.ballFor(a), src = Sprites.item(tier.name);
    if (tier.special && Items.take(tier.special) && !Items.count(tier.special)) {      // that was the last of the stack
      const next = Items.equippedBall();
      G.toast({ title: `That was your last ${tier.label}`, text: next ? `Next up: ${next.n}, ${Items.count(next.k)} left.` : 'Back to the Poké Ball.', icon: Sprites.item(next ? next.k : STANDARD_BALL.name), tone: 'item', dur: 4 });
    }
    const el = src ? new Image() : document.createElement('div');
    el.className = 'ball' + (src ? '' : ' plain');
    if (src) { el.src = src; el.draggable = false; }
    const size = Math.round(20 * G.scale + 10);
    el.style.width = el.style.height = size + 'px';
    G.world.appendChild(el);
    const sx = U.clamp((by && Number.isFinite(o.x) ? o.x : G.cursor.x) + U.rand(-140, 140), 20, G.W - 20);
    G.balls.push({ a, el, x: sx, y: G.H + 30, sx, sy: G.H + 30, t: 0, phase: 'fly', rot: 0, tier, size, n: 0, shakes: 0, gy: 0, vy: 0, by });
    Sound.play('throw', { x: sx });
  };
  function stepBall(b, dt) {
    const a = b.a;
    b.t += dt;
    if (b.phase === 'fly') {
      // aim where the target will stand once caught: on the screen, even if it was still hopping in
      const gb = G.bounds(a), ax = U.clamp(a.x, gb.x0, gb.x1), ay = U.clamp(a.y, gb.y0, gb.y1), hop = ax === a.x && ay === a.y ? a.jy : 0;
      const k = Math.min(1, b.t / 0.5), tx = ax, ty = ay - a.h * 0.5 + hop;
      b.x = U.lerp(b.sx, tx, k); b.y = U.lerp(b.sy, ty, k) - Math.sin(k * Math.PI) * 170; b.rot += dt * 16;
      if (k >= 1) {
        if (a.gone || !G.alive(a) || a.state === 'leave') { b.phase = 'fade'; b.t = 0; a.balled = false; return; }
        b.shakes = a.ev && a.ev.helper ? 4 : Mon.rollCatch(a.mon, b.tier.mult);      // (a helper lets itself be caught with the first ball: src/events.js)
        a.state = 'captured'; a.busy = false; a.lunge = null; a.hops = null; a.jy = 0; a.ox = a.oy = 0;
        a.x = ax; a.y = ay; a.tx = ax; a.ty = ay;
        FX.ring(tx, ty, a.w * 0.6, 6, '#ffffff', 0.3, 4, 0.3); FX.burst(tx, ty, 'normal', 14, 230, 4);
        snd('ballOpen', a);
        b.phase = 'drop'; b.t = 0; b.gy = a.y - b.size * 0.3; b.vy = -200; b.rot = 0;
      }
    } else if (b.phase === 'drop') {
      b.vy += 1100 * dt; b.y += b.vy * dt;
      if (b.y >= b.gy) { b.y = b.gy; FX.dust(b.x, b.gy + b.size * 0.4, 3, 3); if (!b.bounced) { b.bounced = true; b.vy = -170; snd('bounce', b); } else { b.phase = 'shake'; b.t = 0; snd('bounce2', b); } }
    } else if (b.phase === 'shake') {
      const max = Math.min(3, b.shakes);
      if (b.n < max) {
        if (!b.rang) { b.rang = true; snd('shake', b); }
        const k = b.t / 0.85;
        b.rot = k < 0.55 ? Math.sin((k / 0.55) * Math.PI * 2) * 0.5 : 0;
        if (k >= 1) { b.n++; b.t = 0; b.rang = false; }
      } else if (b.t > 0.35) {
        if (b.shakes >= 4) {
          FX.sparkle(b.x, b.y - 6, 12, '#ffe14d', 26); FX.ring(b.x, b.y, 4, 40, '#ffe14d', 0.4, 3);
          for (let i = 0; i < 3; i++) FX.part({ x: b.x, y: b.y - 4, vx: (i - 1) * 90, vy: -210, life: 0.7, size: 9, col: '#ffe14d', shape: 'star', g: 520, drag: 0.4, vr: 6, add: 1 });
          snd('click', b);
          G.catch(a, b); b.phase = 'caught'; b.t = 0;
        } else {
          FX.burst(b.x, b.y, 'normal', 16, 240, 4); FX.ring(b.x, b.y, 6, a.w * 0.6, '#ffffff', 0.3, 3);
          snd('breakFree', b);
          a.state = 'roam'; a.balled = false; a.hop = 0.3; a.tx = a.x; a.ty = a.y; a.idleT = 0.6;
          G.say(a, ['It broke free!', 'It popped right out!', 'So close!', 'Almost had it!'][b.shakes], { col: '#ffb0a0', size: 13 });
          if (a.loiter || a.calm) unsettle(a);
          if (a.ev) Events.brokeFree(a);
          else if (G.save.team.length && !G.set.handsOff) { a.aggro = true; a.cower = false; a.lastHit = G.now; } else if (U.chance(0.12)) G.flee(a, 'fled!');
          b.phase = 'fade'; b.t = 0.5;
        }
      }
    } else if (b.phase === 'caught') { if (b.t > 1.2) b.dead = true; }
    else if (b.phase === 'fade') { if (b.t > 0.7) b.dead = true; }
    const alpha = b.phase === 'caught' ? Math.max(0, 1 - Math.max(0, b.t - 0.7) * 2) : b.phase === 'fade' ? Math.max(0, 1 - b.t / 0.7) : 1;
    b.el.style.transform = `translate3d(${(b.x - b.size / 2).toFixed(1)}px,${(b.y - b.size / 2).toFixed(1)}px,0) rotate(${b.rot.toFixed(2)}rad)`;
    b.el.style.opacity = alpha;
    b.el.style.zIndex = Math.floor(b.gy || b.y) + 2;
    if (b.dead) b.el.remove();
  }
  G.catch = (a, b) => {
    if (a.ev && a.ev.helper && Events.helperCaught(a, b)) return;      // Rotom, Mewtwo, Porygon-Z: they move into their part of the program, not onto the team
    const m = a.mon, sv = G.save, d = D.dex[m.sp], nm = d.n, first = !sv.team.length, isNew = !sv.dex.caught[m.sp], bd = Items.get(b.tier.name);
    sv.dex.caught[m.sp] = (sv.dex.caught[m.sp] || 0) + 1; sv.stats.caught++;
    if (m.shiny) sv.stats.shiny++;
    if (m.alpha) sv.stats.alpha = (sv.stats.alpha || 0) + 1;
    if (d.lg) sv.stats.legend = (sv.stats.legend || 0) + 1;
    m.ball = b.tier.name; m.aff = (bd && bd.ball && bd.ball.aff) || 35; m.met = Date.now(); m.metLvl = m.lvl;
    if (m.hpx) { const r = m.hp / Mon.maxHp(m); delete m.hpx; m.hp = Math.max(1, Math.round(Mon.maxHp(m) * r)); }
    if (bd && bd.ball && bd.ball.heal) { m.hp = Mon.maxHp(m); m.st = null; }
    m.mark = Honors.markFor(m, { weather: G.weather && G.weather.kind }) || undefined;
    if (a.ev) Events.caught(a);
    a.big = Mon.sizeOf(m); G.sizeActor(a);
    // the smallest and largest of each species you have caught (shown in its Pokédex entry)
    const rec = (sv.dex.size = sv.dex.size || {}), sz = Size.value(m), was = rec[m.sp];
    rec[m.sp] = was ? [Math.min(was[0], sz), Math.max(was[1], sz)] : [sz, sz];
    const sizeNote = Size.label(m) === 'M' || !Size.metres(m) ? '' : ` ${Size.name(m)}: ${Size.metresText(Size.metres(m))}.`;
    a.stages.fill(0); a.vol = {};
    G.reward(a);
    G.dropsFrom(a, { caught: true });
    if (G.trainerTarget === a) G.trainerTarget = null;
    const title = m.mark && Honors.MARKS[m.mark] ? `Gotcha! ${nm} ${Honors.MARKS[m.mark]} was caught!` : `Gotcha! ${m.shiny ? 'Shiny ' : ''}${nm} was caught!`;
    let text;
    if (G.teamRoom()) {
      sv.team.push(m);
      a.side = 'team'; a.el.className = 'actor team'; a.state = 'idle'; a.aggro = false; a.target = null; a.mode = 'roam';
      a.dmgBy = new Set(); a.balled = false; a.obeyFor = 0; a.x = b.x; a.y = b.gy + b.size * 0.3; a.tx = a.x; a.ty = a.y; a.idleT = 2.5; a.hop = 0.3;
      a.speed = 50 + Mon.species(m).s[5] * 0.85;
      text = first ? 'Your first partner, and your team leader.' : 'It joined your team.';
    } else {
      sv.box.push(m); G.boxEpoch++;
      G.removeActor(a);
      text = 'Your team is full, so it went to your Box.';
    }
    G.toast({ title, text: text + sizeNote + (isNew ? ' New Pokédex entry.' : ''), icon: m.shiny ? Sprites.still(m.sp, true) || Sprites.icon(m.sp) : Sprites.icon(m.sp), tone: m.shiny ? 'shiny' : 'gold', dur: 4.6 });
    Sound.play('caught', { x: b.x });
    if (typeof Visitors !== 'undefined') Visitors.caught(m, b);      // Trainers who are visiting each get one like it (src/visitors.js)
    G.checkHonors();
    G.saveNow();
  };

  // ------------------------------------------------------------------ team roster <-> actors
  const teamSpot = (i) => [G.W * (0.3 + 0.08 * i) + U.rand(-30, 30), G.H * 0.72 + U.rand(-50, 50)];
  /** make the on-screen team match the save: remove actors that left the team, hop newcomers in from the bottom edge */
  // ------------------------------------------------------------------ eggs
  // save.eggs: the eggs the trainer carries, each { mon, t, x, y }: the Pokémon inside (made by Breed.egg in
  // src/breed.js), the seconds left until it hatches (never shown to anyone), and where it lies. They are handed out
  // by the Day Care on the MyStream stage and hatch wherever the game runs: stage, desktop or phone. As in the games an
  // egg takes a place on the team: team and eggs together are six at most (G.teamRoom).
  G.teamRoom = () => G.save.team.length + (G.save.eggs ? G.save.eggs.length : 0) < 6;
  function stepEggs(dt) {
    const eggs = G.save.eggs;
    if (!eggs || !eggs.length) return;
    for (let i = eggs.length - 1; i >= 0; i--) { eggs[i].t -= dt; if (eggs[i].t <= 0) G.hatch(eggs.splice(i, 1)[0]); }
  }
  G.hatch = (egg) => {
    const sv = G.save, m = egg.mon, toTeam = sv.team.length < 6, here = isFinite(egg.x) && isFinite(egg.y) && (egg.x || egg.y);
    m.hp = Mon.maxHp(m);
    if (toTeam) sv.team.push(m); else { sv.box.push(m); G.boxEpoch++; }
    sv.dex.seen[m.sp] = 1; sv.dex.caught[m.sp] = (sv.dex.caught[m.sp] || 0) + 1; sv.stats.hatched = (sv.stats.hatched || 0) + 1;
    G.syncTeam();
    const a = G.actors.find((q) => q.mon === m);
    if (a && a.await) G.dropIn(a, here ? egg.x : a.await.x, here ? egg.y : a.await.y);      // it drops in where the egg lay (0.6: it hopped in from the edge)
    if (here) { FX.sparkle(egg.x, egg.y - 12, 16, '#fff6a8', 34); FX.ring(egg.x, egg.y - 12, 4, 40, '#ffffff', 0.6, 3); }
    G.toast({ title: `The egg hatched into ${m.shiny ? 'a shiny ' : ''}${Mon.name(m)}!`, text: toTeam ? (sv.dex.caught[m.sp] === 1 ? 'New Pokédex entry. It joined your team.' : 'It joined your team.') : 'The team was full: it is in the Box.', icon: Sprites.icon(m.sp), tone: 'gold', dur: 5 });
    Sound.play('caught');
    G.after(0.9, () => Sound.cry(m.sp, { x: here ? egg.x : G.W / 2 }));
    if (typeof G.onHatch === 'function') { try { G.onHatch(egg, m); } catch (e) { /* a listener's trouble is not the game's */ } }
    G.saveNow();
  };

  /** a team member that is about to come onto the screen is set down at (x, y) instead of hopping in from an edge */
  G.dropIn = (a, x, y) => { if (!a || !a.await) return; a.await.drop = true; a.await.x = a.tx = x; a.await.y = a.ty = y; a.await.along = x; };
  G.syncTeam = () => {
    const team = G.save.team;
    for (const a of G.team()) if (!team.includes(a.mon)) G.removeActor(a);
    team.forEach((m, i) => {
      if (G.actors.some((a) => a.mon === m)) return;
      const [x, y] = teamSpot(i);
      const a = G.spawnActor(m, 'team', -9999, -9999);
      a.mode = 'roam'; a.tx = x; a.ty = y;
      a.await = { side: 3, along: x, x, y, cry: false, then: () => { a.idleT = U.rand(1, 3.5); } };
      if (m.hp <= 0) m.hp = Math.max(1, Math.floor(Mon.maxHp(m) / 2));
    });
  };
  G.gather = () => {
    G.team().forEach((a, i) => {
      const b = G.bounds(a), x = U.clamp(G.W / 2 + (i - 2.5) * 90, b.x0, b.x1), y = U.clamp(G.H / 2 + (i % 2) * 50, b.y0, b.y1);
      if (a.await) { a.await.x = x; a.await.y = y; return; }
      a.hops = null; a.jy = 0; a.fetch = null; a.x = x; a.y = y; a.tx = x; a.ty = y; a.nap = 0; a.idleT = 6; a.squash = 1;
      FX.sparkle(x, y - a.h * 0.5, 5, '#ffffff', 30);
    });
    snd('select');
  };

  // ------------------------------------------------------------------ the world's place on the screen (the field window)
  // The world is the whole screen until the field window opens; then it is the inside of that window, and its edges are
  // the barriers. overlay.js lays the page out (G.W, G.H, G.vx, G.vy) and calls these. Positions are always counted from
  // the world's own corner, so when the world jumps to another place everything in it is moved by the difference, and
  // nothing changes place on the screen. Moving or resizing an open field needs none of that: the world travels with it.
  /** move everything in the world by (dx, dy) */
  G.shiftWorld = (dx, dy) => { if (dx || dy) G.mapWorld(1, dx, dy); };
  /** every position in the world becomes k times itself plus (bx, by): what a jump of the world's corner and, with the
   *  field window's camera, a change of zoom at that moment come to */
  G.mapWorld = (k, bx, by) => {
    const X = (v) => v * k + bx, Y = (v) => v * k + by;
    for (const a of G.actors) {
      a.x = X(a.x); a.y = Y(a.y); a.tx = X(a.tx); a.ty = Y(a.ty); a._tf = ''; a.round = null;
      if (a.hops) { a.hops.x0 = X(a.hops.x0); a.hops.x1 = X(a.hops.x1); a.hops.y0 = Y(a.hops.y0); a.hops.y1 = Y(a.hops.y1); }
    }
    for (const d of G.drops) { d.x = X(d.x); d.y = Y(d.y); d.gy = Y(d.gy); }
    for (const b of G.balls) { b.x = X(b.x); b.y = Y(b.y); b.sx = X(b.sx); b.sy = Y(b.sy); if (b.gy) b.gy = Y(b.gy); }
    for (const z of G.zones) { z.x = X(z.x); z.y = Y(z.y); z.r *= k; }
    for (const sh of G.shots) { sh.x = X(sh.x); sh.y = Y(sh.y); sh.lx = X(sh.lx); sh.ly = Y(sh.ly); }
    if (G.save && G.save.eggs) for (const e of G.save.eggs) if (e.x || e.y) { e.x = X(e.x); e.y = Y(e.y); }
    G.cursor.x = X(G.cursor.x); G.cursor.y = Y(G.cursor.y);
    if (FX.reset) FX.reset();                              // effects in flight are simply dropped
  };
  /** the world has a new size or place. opened: the field was just created; closed: it is gone and the barriers with it */
  G.onView = (opened, closed) => {
    for (const a of G.actors) {
      G.sizeActor(a);                                      // the size cap follows the world's shorter side
      if (!a.await) continue;                              // not on the screen yet: it comes in over an edge of the new world
      if (a.side === 'team') { const [x, y] = teamSpot(G.save.team.indexOf(a.mon)); a.await.along = x; a.await.x = x; a.await.y = y; }
      else { const e = entrySpot(null); a.side0 = e.side; a.along = e.along; a.dest = { x: e.x, y: e.y }; Object.assign(a.await, e); }
    }
    for (const d of G.drops) { d.x = U.clamp(d.x, 30, Math.max(30, G.W - 30)); d.gy = U.clamp(d.gy, Math.min(90, G.H * 0.5), G.H - 10); if (d.y > d.gy) d.y = d.gy; }
    if (opened) pullInside();
    else if (closed) endPull();
    G.nextSpawn = Math.max(G.nextSpawn, 2.5);
  };
  /** the field was created: whoever stands outside it is brought in, the team at a run, the others after them */
  function pullInside() {
    let n = 0;
    for (const a of G.actors) {
      if (a.gone || a.await || a.state === 'leave') continue;
      const b = G.bounds(a);
      if (a.x >= b.x0 && a.x <= b.x1 && a.y >= b.y0 && a.y <= b.y1) continue;
      const inX = Math.min(260, (b.x1 - b.x0) * 0.45), inY = Math.min(200, (b.y1 - b.y0) * 0.45);
      const x = U.clamp(a.x, b.x0 + U.rand(0, inX), b.x1 - U.rand(0, inX)), y = U.clamp(a.y, b.y0 + U.rand(0, inY), b.y1 - U.rand(0, inY));
      if (a.state === 'faint' || a.state === 'captured' || a.dragging) { a.x = x; a.y = y; a.tx = x; a.ty = y; continue; }     // carried in
      const team = a.side === 'team';
      a.pull = true; a.nap = 0; a.settled = false;
      G.hopTo(a, x, y, { dur: team ? 0.2 : 0.3, stride: team ? 260 : 170, rest: team ? 0.01 : 0.06, height: team ? 64 : 46, then: () => { a.pull = false; a.idleT = U.rand(1, 4); } });
      n++;
    }
    G.pulling = n > 0;
    clipWorld(!G.pulling);                                 // while they are on their way in they must be seen outside the field
    if (n) snd('select');
  }
  function endPull() { for (const a of G.actors) a.pull = false; G.pulling = false; clipWorld(true); }
  /** the page element the world is drawn in cuts sprites off at its edge, except while someone is being brought in */
  function clipWorld(on) { const r = G.world && G.world.parentNode; if (r && r.classList) r.classList.toggle('open', !on); }

  /** use an item from the Bag on a team member (auto = the team did it by itself) */
  G.useItem = (key, m, auto) => {
    const a = G.actors.find((x) => x.mon === m && !x.gone);
    if (m && m.hp <= 0 && G.inTrainerBattle()) {           // no reviving in the middle of a Trainer battle
      if (!auto) G.toast({ title: 'Not during a Trainer battle', text: `${Mon.name(m)} stays down until the battle is over.`, icon: Sprites.icon(m.sp), tone: 'alert', dur: 4 });
      return false;
    }
    const r = Items.use(key, m, a);
    if (!r.ok) return false;
    if (a && !a.await) {
      if (r.kind === 'revive' && a.state === 'faint') { a.state = 'idle'; a.mode = 'roam'; a.cd = 1.5; a.dmgBy = new Set(); }
      FX.sparkle(a.x, a.y - a.h * 0.5, 8, '#9cf07a', a.w * 0.4); a.hop = 0.25; a._sk = '';
      if (r.text) G.say(a, auto ? `${Items.name(key)}! ${r.text}` : r.text, { col: '#9cf07a', size: 11 });
      xpEvents(a, r.events || []);
      snd(r.kind === 'gift' ? 'pet' : 'use', a);
    } else if (r.events) for (const e of r.events) if (e.type === 'evolve') { G.save.dex.seen[e.to] = 1; G.save.dex.caught[e.to] = (G.save.dex.caught[e.to] || 0) + 1; }
    G.touch();
    return true;
  };

  // ------------------------------------------------------------------ rendering
  const TINT = { frz: 'hue-rotate(165deg) saturate(.55) brightness(1.25)', psn: 'hue-rotate(-35deg) saturate(1.25)', brn: 'saturate(1.3) brightness(.95)', slp: 'brightness(.82)', par: '' };
  let dpr = 1;
  const snap = (v) => Math.round(v * dpr) / dpr;         // whole device pixels: pixel art stays crisp and does not shimmer
  function renderActor(a) {
    let ox = a.ox, oy = a.oy + a.jy, alpha = 1, filter = '', sx = 1, sy = 1;
    if (a.hop > 0) oy -= Math.sin(Math.min(1, a.hop / 0.25) * Math.PI) * 10;
    if (a.shake > 0) ox += Math.sin(G.now * 70) * 3;
    if (a.moving) oy -= Math.abs(Math.sin(G.now * (a.run ? 13 : 9) + a.id)) * 2.5 * (G.scale / 2);
    if (a.squash > 0) { sx = 1 + 0.1 * a.squash; sy = 1 - 0.14 * a.squash; } else if (a.jy < -6) { sx = 0.96; sy = 1.05; }
    if (a.state === 'faint') { if (a.side === 'wild') { const k = Math.min(1, a.stateT / 0.7); alpha = 1 - k; oy += k * 12; } else { alpha = 0.5; filter = 'grayscale(1) brightness(.75)'; } }
    else if (a.state === 'captured' || a.await) alpha = 0;
    else if (a.fall) alpha = Math.min(1, a.fall.t / 0.1);
    else if (a.vol.away === 'air') { oy -= 240; alpha = 0.35; }
    else if (a.vol.away === 'under') alpha = 0.12;
    if (a.flash > 0) filter = 'brightness(3.2) saturate(0)';
    else if (!filter && a.mon.st) filter = TINT[a.mon.st] || '';
    if (a.dragging) oy -= 6;
    const useBack = a.back && !!a.imgB && a.imgB.naturalWidth > 0;
    if (a._bk !== useBack && a.img) { a._bk = useBack; a.img.style.display = useBack ? 'none' : 'block'; if (a.imgB) a.imgB.style.display = useBack ? 'block' : 'none'; }
    const w = useBack ? a.imgB.naturalWidth * G.sizeOf(a) : a.w, h = useBack ? a.imgB.naturalHeight * G.sizeOf(a) : a.h;
    const flip = useBack ? -a.face : a.face;
    const tf = `translate3d(${snap(a.x - w / 2 + ox)}px,${snap(a.y - h + a.pad * h + oy)}px,0) scale(${flip * sx},${sy})`;
    if (tf !== a._tf) { a._tf = tf; a.el.style.transform = tf; }
    const z = Math.floor(a.y);
    if (z !== a._z) { a._z = z; a.el.style.zIndex = z; }
    if (alpha !== a._al) { a._al = alpha; a.el.style.opacity = alpha; }
    if (filter !== a._fl) { a._fl = filter; a.el.style.filter = filter; }
  }

  function ballImage(name) {
    if (!(name in ballImgs)) { const src = Sprites.item(name); ballImgs[name] = src ? Object.assign(new Image(), { src }) : null; }
    return ballImgs[name];
  }
  function drawLabels(c) {
    const mode = G.set.labels || 'auto', noTeam = !G.save.team.length, leader = G.leader();
    G.ballBtn = null;
    const focus = G.hover && G.hover.side === 'wild' && G.targetable(G.hover) ? G.hover : G.targetable(G.trainerTarget) ? G.trainerTarget : noTeam ? nearest(G.wilds().filter(G.targetable), G.cursor) : null;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    for (const a of G.actors) {
      if (a.gone || a.await || a.state === 'captured' || (a.state === 'faint' && a.side === 'wild')) continue;
      const m = a.mon, wild = a.side === 'wild';
      // a loiterer keeps its name tag to itself until the pointer is on it or something happens to it
      const show = G.settled(a) ? a === G.hover || a === focus || a.balled || G.now - a.lastHit < 4
        : wild || mode === 'always' || a === G.hover || a.state === 'faint' || (mode !== 'never' && (a.mode === 'fight' || a.mode === 'guard' || G.now - a.lastHit < 4));
      if (!show) continue;
      const meter = wild && a === focus && G.targetable(a);
      const mh = Mon.maxHp(m), bw = 64, x = Math.round(U.clamp(a.x + a.ox, bw / 2 + 34, G.W - bw / 2 - 34));
      const y = Math.round(Math.max(24, a.y - a.h * (a.pad ? 0.8 : 1) - (meter ? 20 : 12) + a.oy + a.jy - (a.vol.away === 'air' ? 240 : 0)));
      const cls = Size.label(m), tag = cls === 'M' || (wild && m.alpha) || (a.ev && a.ev.helper) ? '' : ' ' + cls;     // size shows unless it is the ordinary Medium
      const label = `${a === leader ? '★ ' : ''}${wild && m.alpha ? 'Alpha ' : ''}${a.ev ? Events.tag(a) : ''}${a.rival ? '◆ ' : ''}${Mon.name(m)}${m.shiny ? ' ✦' : ''}${tag}  Lv.${m.lvl}`;
      c.font = '600 11px "Segoe UI", system-ui, sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,20,.9)'; c.strokeText(label, x, y - 9);
      // a wild Pokémon of a kind already caught has a little Poké Ball before its name; one not caught yet has none (0.9.3)
      if (wild && G.save.dex.caught[m.sp]) caughtBall(c, x - c.measureText(label).width / 2 - 8, y - 13);
      c.fillStyle = wild ? (m.shiny ? '#ffe14d' : a.ev ? '#d6b8ff' : m.alpha ? '#ff8a6a' : '#ffffff') : a === leader ? '#ffd76a' : '#bfe6ff'; c.fillText(label, x, y - 9);
      // HP bar
      const r = U.clamp(a.hpShown / mh, 0, 1);
      c.fillStyle = 'rgba(12,14,20,.88)'; c.fillRect(x - bw / 2 - 1, y - 5, bw + 2, 7);
      c.fillStyle = r > 0.5 ? '#58d058' : r > 0.2 ? '#f0c030' : '#f05038'; c.fillRect(x - bw / 2, y - 4, Math.max(r > 0 ? 1 : 0, bw * r), 5);
      // the charge for Mega Evolution or Dynamax (while it lasts: the time left), a thin bar under the health bar
      const fb = typeof Forms !== 'undefined' ? Forms.bar(a) : null;
      if (fb) { c.fillStyle = 'rgba(12,14,20,.88)'; c.fillRect(x - bw / 2 - 1, y + 2, bw + 2, 4); c.fillStyle = fb.col; c.fillRect(x - bw / 2, y + 3, Math.max(fb.r > 0 ? 1 : 0, bw * fb.r), 2); }
      if (m.st) {
        c.font = '700 9px "Segoe UI", system-ui, sans-serif';
        c.fillStyle = 'rgba(12,14,20,.88)'; c.fillRect(x - bw / 2 - 28, y - 6, 25, 10);
        c.fillStyle = Battle.AIL_COL[m.st]; c.fillText(ST_TAG[m.st], x - bw / 2 - 15.5, y + 2);
      }
      if (meter) {
        const ball = G.ballFor(a), p = Mon.catchCalc(m, ball.mult).p;
        c.fillStyle = 'rgba(12,14,20,.88)'; c.fillRect(x - bw / 2 - 1, y + 3, bw + 2, 6);
        c.fillStyle = p > 0.66 ? '#6ad0ff' : p > 0.33 ? '#58a8f0' : '#4a78d8'; c.fillRect(x - bw / 2, y + 4, Math.max(1, bw * p), 4);
        c.font = '700 10px "Segoe UI", system-ui, sans-serif'; c.textAlign = 'right';
        const pt = `${Math.round(p * 100)}%`;
        c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,20,.9)'; c.strokeText(pt, x - bw / 2 - 5, y + 10); c.fillStyle = '#9ad8ff'; c.fillText(pt, x - bw / 2 - 5, y + 10);
        c.textAlign = 'center';
        const bx = x + bw / 2 + 18, by = y, br = 12, img = ballImage(ball.name);
        G.ballBtn = { a, x: bx, y: by, r: br };
        c.fillStyle = a.balled ? 'rgba(12,14,20,.4)' : 'rgba(12,14,20,.78)'; c.beginPath(); c.arc(bx, by, br + 2, 0, 6.283); c.fill();
        c.strokeStyle = ball.special ? 'rgba(255,225,77,.95)' : 'rgba(255,255,255,.75)'; c.lineWidth = ball.special ? 1.8 : 1.2; c.stroke();
        if (img && img.complete && img.naturalWidth) { c.imageSmoothingEnabled = false; c.drawImage(img, bx - 13, by - 13, 26, 26); }
        else { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(bx, by, 6, 0, 6.283); c.fill(); }
        if (ball.special) {                                // a found stack: how many are left
          const left = '×' + Items.count(ball.special);
          c.font = '700 10px "Segoe UI", system-ui, sans-serif'; c.textAlign = 'left';
          c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,20,.9)'; c.strokeText(left, bx + br + 5, by + 4); c.fillStyle = '#ffe14d'; c.fillText(left, bx + br + 5, by + 4);
          c.textAlign = 'center';
        }
        if (noTeam) {
          c.font = '600 11px "Segoe UI", system-ui, sans-serif';
          const hint = 'Click to weaken  ·  Right-click to throw a ball', hy = Math.min(G.H - 8, a.y + 18);
          c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,20,.9)'; c.strokeText(hint, x, hy); c.fillStyle = '#fff6a8'; c.fillText(hint, x, hy);
        }
      } else if (!wild && a === G.hover && m.lvl < 100) {
        const tb = D.exp[Mon.species(m).gr], k = U.clamp((m.xp - tb[m.lvl]) / Math.max(1, tb[m.lvl + 1] - tb[m.lvl]), 0, 1);
        c.fillStyle = 'rgba(12,14,20,.88)'; c.fillRect(x - bw / 2 - 1, y + 3, bw + 2, 4);
        c.fillStyle = '#58a8f0'; c.fillRect(x - bw / 2, y + 4, bw * k, 2);
      }
    }
    const d = G.hoverDrop;                                // the item under the pointer
    if (d && !d.gone) {
      const name = Items.name(d.key), y = Math.max(16, d.y - d.size - 8);
      c.font = '600 11px "Segoe UI", system-ui, sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(12,14,20,.9)'; c.strokeText(name, d.x, y); c.fillStyle = '#fff6a8'; c.fillText(name, d.x, y);
    }
    c.restore();
  }

  function drawShots(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const s of G.shots) {
      const st = FX.style(s.type);
      c.globalAlpha = 0.5; c.fillStyle = st.c[1]; c.beginPath(); c.arc(s.x, s.y, s.size * 1.5, 0, 6.283); c.fill();
      c.globalAlpha = 1; c.fillStyle = st.c[0]; c.beginPath(); c.arc(s.x, s.y, s.size * 0.75, 0, 6.283); c.fill();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ main update
  /** what the music should be doing: a fight is on while the team and a wild creature are at it, or the player is */
  function sceneCheck() {
    const rank = { wild: 1, horde: 2, alpha: 3, shiny: 4, legend: 5 };
    let best = null;
    for (const w of G.wilds()) {
      if (!G.targetable(w) || w.await || (G.peaceful(w) && !w.balled)) continue;       // petting a friendly visitor is no fight
      const engaged = (w.aggro && G.save.team.length > 0) || w.balled || (w === G.trainerTarget && G.now - G.clickT < 6) || G.actors.some((t) => t.side === 'team' && t.mode === 'fight' && t.target === w);
      if (!engaged) continue;
      const d = D.dex[w.mon.sp], v = d.lg ? 'legend' : w.mon.shiny ? 'shiny' : w.mon.alpha ? 'alpha' : w.horde ? 'horde' : 'wild';
      if (!best || rank[v] > rank[best.v]) best = { v, sp: w.mon.sp };
    }
    Sound.scene(best ? 'battle' : 'roam', best ? (best.v === 'legend' && best.sp === 150 ? 'mewtwo' : best.v === 'legend' && best.sp === 386 ? 'deoxys' : best.v) : null);
  }

  let slowT = 0, honorT = 0, sceneT = 0;
  // One frame. The game's own step and the pointer's are kept apart (0.9): whatever goes wrong in the first, the second
  // still runs, so a Pokémon under the pointer can always be clicked and the mouse is never left with the overlay.
  G.update = (dt) => {
    let failed = null;
    try { step(dt); } catch (e) { failed = e; }
    try { pointerStep(dt); } catch (e) { failed = failed || e; }
    if (failed) throw failed;                              // (G.frame writes it down and carries on with the next frame)
  };
  function step(dt) {
    if (typeof BoxField !== 'undefined' && BoxField.step(dt)) {      // the Box is open and the field shows the Box: the game waits (src/boxfield.js)
      Play.go('box', 'the Box is out');
      FX.update(dt); Notify.update(dt);
      if (typeof Visitors !== 'undefined') Visitors.step(dt);      // (visiting Trainers' pointers keep moving while the game waits)
      if (G.drag) { G.drag.a.dragging = false; G.drag = null; }
      return;
    }
    Play.go('playing', 'the team has the field');
    G.now += dt;
    if (typeof Visitors !== 'undefined') Visitors.step(dt);
    for (let i = G.timers.length - 1; i >= 0; i--) if (G.timers[i].t <= G.now) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); }
    // encounters
    if (!G.set.paused && Sprites.ready()) {
      G.nextSpawn -= dt;
      if (G.nextSpawn <= 0) {
        G.nextSpawn = (G.set.spawnEvery || 25) * U.rand(0.6, 1.4);
        if (G.wilds().filter((w) => !w.loiter).length < (G.set.maxWild || 3)) spawnWild();      // loiterers have their own limit (maxLoiter)
      }
    }
    Events.update(dt);                                   // random weather and legendary visits
    for (const a of G.actors.slice()) if (!a.gone) { try { stepActor(a, dt); } catch (e) { actorFailed(a, e); } }      // (one Pokémon in trouble does not stop the others)
    separate(dt);
    // projectiles
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i], t = s.t;
      s.life -= dt;
      if (G.alive(t) && t.state !== 'captured') { s.lx = t.x + t.ox; s.ly = t.y - t.h * 0.5; }
      const dx = s.lx - s.x, dy = s.ly - s.y, d = Math.hypot(dx, dy), step = s.sp * dt;
      if (s.sound) { s.rg = (s.rg || 0) + dt; if (s.rg > 0.06) { s.rg = 0; FX.ring(s.x, s.y, 4, 18, FX.col(s.type, 0), 0.25, 2); } }
      else FX.puff(s.x, s.y, s.type, 1, 3, s.size * 0.7, 0.3);
      if (d <= step + 10 || s.life <= 0) { G.shots.splice(i, 1); FX.burst(s.lx, s.ly, s.type, 12, 210, s.size * 0.8); if (s.u.side !== t.side && s.u.state !== 'captured') Battle.resolveHit(s.u, t, s.mv); }
      else { s.x += (dx / d) * step; s.y += (dy / d) * step; }
    }
    for (let i = G.balls.length - 1; i >= 0; i--) { stepBall(G.balls[i], dt); if (G.balls[i].dead) G.balls.splice(i, 1); }
    for (const d of G.drops.slice()) stepDrop(d, dt);
    // lingering zones
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      z.t += dt;
      if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; }
      if (z.t >= z.dur) { G.zones.splice(i, 1); continue; }
      z.tick += dt;
      if (z.tick > (z.kind === 'terrain' ? 0.12 : 0.2)) {
        z.tick = 0;
        const ang = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * z.r;
        if (z.kind === 'residue' || z.kind === 'terrain' || z.kind === 'trap') FX.puff(z.x + Math.cos(ang) * rr, z.y + Math.sin(ang) * rr * (z.kind === 'terrain' ? 1 : 0.55), z.type, 1, 4, 4, 0.7);
        else if (z.kind === 'screen' && z.key === 'safeguard') FX.part({ x: z.x + Math.cos(ang) * rr, y: z.y + Math.sin(ang) * rr, vx: 0, vy: -40, life: 0.9, size: 3, col: '#b8ffb0', shape: 'dot', add: 1, drag: 0.3 });
      }
      if (z.kind === 'hazard') for (const a of G.actors) if (a.side !== z.side && G.targetable(a) && !(a.side === 'wild' && !a.rival && G.inTrainerBattle()) && !a.hops && !z.seen.has(a.id) && G.inZone(a, z) && !(z.side === 'team' && G.handsOff(a)) && !G.peaceful(a) && !G.settled(a)) { z.seen.add(a.id); Battle.hazard(a, z); }
    }
    if (G.weather) {
      const w = G.weather;
      w.t += dt; FX.weatherTick(w.kind, dt * Math.min(1, w.t / 1.2) * Math.min(1, Math.max(0, (w.dur - w.t) / 1.2)));
      if (!w.natural && G.now - G.lastBattle > 12) w.dur = Math.min(w.dur, w.t + 1.5);       // weather a move called clears up once the fighting is over
      if (w.t >= w.dur) G.weather = null;
    }
    stepEggs(dt);
    if (typeof Forms !== 'undefined') Forms.update(dt);     // Mega Evolution and Dynamax
    if (typeof Rivals !== 'undefined') Rivals.update(dt);   // other Trainers and Gym Leaders
    G.turnT += dt;
    if (G.turnT >= 3) { G.turnT = 0; for (const a of G.actors.slice()) if (a.side === 'wild' || a.mode === 'fight' || a.mode === 'guard' || a.mon.st || a.vol.trap || a.vol.seed) Battle.endTurn(a); }
    if (G.trainerTarget && !G.targetable(G.trainerTarget) && G.trainerTarget.state !== 'captured') G.trainerTarget = null;
    slowT += dt; if (slowT >= 1.5) { slowT = 0; Items.autoCare(); G.trimLoiter(); }
    if (G.pulling && !G.actors.some((a) => a.pull && a.hops)) endPull();
    honorT += dt; if (honorT >= 3) { honorT = 0; G.checkHonors(); }
    sceneT += dt; if (sceneT >= 0.25) { sceneT = 0; sceneCheck(); }
    FX.update(dt);
    Notify.update(dt);
    sanityT += dt; if (sanityT >= 1) { sanityT = 0; G.sanity(); }
    G.saveT += dt;
    if (G.saveT > 20 && G.dirty) G.saveNow();
  }

  // ------------------------------------------------------------------ the two machines of this page (src/machine.js)
  // play:    what the page is doing. "playing": the game runs. "box": the Box is out and the field shows the Box, the
  //          game waits (src/boxfield.js).
  // pointer: who has the mouse. On the desktop the overlay lets every click fall through to whatever lies behind it
  //          ("through") except while the pointer is on something of the game's; the window is told on every change
  //          (st.hover) and, in case the two ever fell out of step, once more every two seconds.
  const Play = Machine.make('play', { about: 'what the game page is doing', initial: 'playing', states: {
    playing: { about: 'the game runs' },
    box: { about: 'the Box is out and the field shows the Pokémon in it: the game waits, the Box Pokémon can be petted, carried and looked up' },
  } });
  const Pointer = Machine.make('pointer', { about: 'who has the mouse on the game page', initial: 'through', states: {
    through: { about: 'nothing of the game under the pointer: clicks go to whatever lies behind the overlay' },
    over: { about: 'the pointer is on a Pokémon or a thing of the game: the next click is the game\'s' },
    held: { about: 'a Pokémon is in the pointer\'s hand (a drag)', max: 90, then: 'through' },
    guard: { about: 'Mewtwo is being dragged', max: 90, then: 'through' },
    place: { about: 'a Day Care guest or an egg is in the pointer\'s hand', max: 90, then: 'through' },
  }, change: (to, from, why) => {
    const cap = to !== 'through';
    if (to === 'through' && (from === 'held' || from === 'guard' || from === 'place') && /^more than/.test(why)) letGo('held for too long');      // (the watchdog: a hand that never opened)
    if (cap !== G.capture || tellAt === 0) tell(cap, why);
  } });
  let tellAt = 0, capAt = 0, blockedTold = 0, sanityT = 0, lastHitAt = 0, lastHit = null, lastHitPt = [0, 0];
  const LINGER = 0.18;                                     // seconds the mouse is kept after the pointer slipped off a Pokémon (0.9.1)
  const desk = () => !!(window.st && window.st.blocked) && !(document.body && document.body.classList && document.body.classList.contains('stage'));
  function tell(cap, why) {
    const changed = cap !== G.capture || tellAt === 0;
    G.capture = cap; tellAt = Date.now(); if (cap) { capAt = tellAt; G.seen.polls = 0; }
    try { window.st.hover(cap); } catch (e) { /* no window to tell */ }
    if (changed) G.note('mouse', { takes: cap, over: why });      // (saying it again is not news)
  }
  /** Whatever is in the pointer's hand is put down where the pointer is, exactly as a mouse button coming up would:
   *  for a button that was never seen to come up (it was let go over another window), or a Pokémon that left while held. */
  function letGo(why) {
    const held = !!G.drag || (typeof Mewtwo !== 'undefined' && Mewtwo.dragging()) || (typeof Stations !== 'undefined' && Stations.grabbing && Stations.grabbing()) || (typeof BoxField !== 'undefined' && BoxField.holding());
    if (!held) return false;
    if (G.drag && (G.drag.a.gone || !G.actors.includes(G.drag.a))) { G.drag.a.dragging = false; G.drag = null; }
    try { G.onUp(); } catch (e) { G.drag = null; }
    G.note('let go', { why });
    G.report('let go', why);
    return true;
  }
  G.letGo = letGo;
  G.pointer = Pointer; G.play = Play;
  /** times the pointer was seen: `poll` by the main process (it asks Windows where the pointer is), `real` by this page as a mouse event of its own, `up` with no button held */
  G.seen = { poll: 0, polls: 0, real: 0 };

  function pointerStep() {
    const box = typeof BoxField !== 'undefined' && BoxField.active();
    if (G.pin && !box) {                                   // (a test holds this one under the pointer: command "pin")
      const a = G.pin.a;
      if (G.now > G.pin.until || a.gone) G.pin = null;
      else { const b = G.bounds(a); a.x = U.clamp(G.cursor.x, b.x0, b.x1); a.y = U.clamp(G.cursor.y + a.h * 0.45, b.y0, b.y1); a.tx = a.x; a.ty = a.y; a.hops = null; a.jy = 0; }
    }
    if (G.drag && (G.drag.a.gone || G.drag.a.state === 'captured')) letGo('the Pokémon in hand is not there any more');
    // what is under the pointer → the window is told whether to catch the mouse or let it fall through
    const seen = G.inView(...G.toScreen(G.cursor.x, G.cursor.y));      // (outside the field window nothing of the world takes the mouse, 0.9.1)
    const hit = box ? (seen || BoxField.holding() ? BoxField.pick(G.cursor.x, G.cursor.y) : null)      // (the Box Field: a Pokémon of the Box, 0.9)
      : G.drag ? { actor: G.drag.a } : typeof Mewtwo !== 'undefined' && Mewtwo.dragging() ? { kind: 'guard' }
      : typeof Stations !== 'undefined' && Stations.grabbing && Stations.grabbing() ? { kind: 'place', what: 'care' } : G.pick(G.cursor.x, G.cursor.y);      // (a Day Care guest or egg in the pointer's hand keeps the mouse)
    // A Pokémon on the move slips out from under a pointer that is still. The mouse is kept a moment longer (0.9.1),
    // so that a button pressed just then still reaches the game instead of the window behind the overlay.
    const here = G.toScreen(G.cursor.x, G.cursor.y);
    if (hit) { lastHitAt = G.now; lastHit = hit; lastHitPt = here; }
    // (only while the pointer stays where it was: a pointer that moved away has left the Pokémon on purpose)
    const linger = !hit && !!lastHit && seen && G.now - lastHitAt < LINGER && Math.hypot(here[0] - lastHitPt[0], here[1] - lastHitPt[1]) < 24;
    G.hover = hit && hit.actor ? hit.actor : null;
    if (typeof Mewtwo !== 'undefined') Mewtwo.hover(!!hit && hit.kind === 'guard');
    if (typeof Rivals !== 'undefined') Rivals.hover(!!hit && hit.kind === 'gym');
    if (typeof Square !== 'undefined') Square.hover(!!hit && hit.kind === 'place' && hit.what === 'top');
    G.hoverDrop = hit && hit.kind === 'drop' ? hit.drop : null;
    const holding = box ? !!hit && hit.held : !!G.drag;
    const state = !hit ? (linger ? 'over' : 'through') : holding ? 'held' : hit.kind === 'guard' && Mewtwo.dragging() ? 'guard' : hit.kind === 'place' && hit.what === 'care' && Stations.grabbing && Stations.grabbing() ? 'place' : 'over';
    Pointer.go(state, linger ? 'still near ' + hitIs(lastHit) : hitIs(hit));
    const now = Date.now();
    if (tellAt === 0 || now - tellAt > 2000) tell(state !== 'through', (linger ? 'still near ' + hitIs(lastHit) : hitIs(hit)) + ' (said again)');      // once more, should the window and this page ever disagree
    for (const r of Machine.tick(now)) G.report('rescued', `${r.machine}: ${r.from} -> ${r.to}`);
    // Blocked? The window was told to take the mouse and the pointer is moving over a Pokémon, yet no mouse event of
    // its own reaches this page: some other window lies on top of the overlay there. The main process is told; it
    // puts the overlay back where it belongs (unless it is one of our own windows that is rightly in front).
    if (G.capture && desk()) {
      if (G.seen.real >= capAt) blockedTold = 0;
      else if (now - capAt > 450 && G.seen.poll > capAt + 150 && G.seen.polls >= 3 && now - blockedTold > 1500) {
        blockedTold = now;
        G.note('blocked', { over: hitIs(hit) });
        try { const s = G.toScreen(G.cursor.x, G.cursor.y); window.st.blocked({ x: Math.round(s[0]), y: Math.round(s[1]), over: hitIs(hit) }); } catch (e) { /* older shell */ }
      }
    } else blockedTold = 0;
    const cur = !hit ? '' : (G.drag && G.drag.moved) || (hit.kind === 'guard' && Mewtwo.dragging()) || (box && hit.held) ? 'grabbing' : (hit.actor && hit.actor.side === 'team' && hit.kind !== 'ball') || box ? 'grab' : 'pointer';
    if (cur !== G._cur) { G._cur = cur; document.documentElement.style.cursor = cur; }
  }

  // ------------------------------------------------------------------ keeping things sane (0.9)
  /** something went wrong or was put right: kept in the page's own notes, and the main process writes it to the
   *  self-check folder (blackbox.log), so that it can still be read after the fact */
  G.report = (kind, text) => { try { if (window.st && window.st.note) window.st.note({ kind: String(kind), text: String(text).slice(0, 600), now: +G.now.toFixed(1) }); } catch (e) { /* nobody to tell */ } };
  const failedOnce = new Set();
  /** a Pokémon's own step threw: it is told once, and the Pokémon is brought back to something it can go on from */
  function actorFailed(a, e) {
    const msg = String((e && e.stack) || e).slice(0, 500), key = Mon.name(a.mon) + '|' + msg.slice(0, 120);
    if (!failedOnce.has(key)) { failedOnce.add(key); console.error('[Screen Trainer] ' + Mon.name(a.mon), e); G.note('error', { who: whoIs(a), msg }); G.report('error', `${whoIs(a)}: ${msg}`); }
    a.fails = (a.fails || 0) + 1;
    a.busy = false; a.lunge = null; a.hops = null; a.jy = 0; a.ox = a.oy = 0; a.kx = a.ky = 0; a.target = null; a.fetch = null; a.fall = null;
    if (a.fails > 240 && a.side === 'wild' && !a.rival && !a.ev) G.removeActor(a);      // a wild one that cannot be helped (four seconds of trying) leaves
  }
  const FIN = ['x', 'y', 'tx', 'ty', 'w', 'h', 'jy', 'ox', 'oy', 'kx', 'ky', 'hit', 'pad'];
  /** Once a second: is every Pokémon in a state it can get out of? What is not right is put right and written down.
   *  Returns what was found (the checks ask). Each of these was a way for one Pokémon to stay on the screen and
   *  never answer a click again. */
  G.sanity = () => {
    const found = [], fix = (a, what) => { found.push(`${a ? whoIs(a) + ': ' : ''}${what}`); };
    for (const a of G.actors.slice()) {
      if (a.gone) { fix(a, 'gone but still listed'); const i = G.actors.indexOf(a); if (i >= 0) G.actors.splice(i, 1); if (a.el) a.el.remove(); continue; }
      // a number that is not a number: the picture stays where it last was and no click finds it
      for (const k of FIN) if (!Number.isFinite(a[k])) {
        const b = G.bounds(a), good = { x: a.gx, y: a.gy, tx: a.gx, ty: a.gy, w: 64 * (G.scale / 2), h: 64 * (G.scale / 2), hit: 1 }[k];
        fix(a, `${k} was ${a[k]}`);
        a[k] = Number.isFinite(good) ? good : k === 'x' || k === 'tx' ? (b.x0 + b.x1) / 2 : k === 'y' || k === 'ty' ? (b.y0 + b.y1) / 2 : 0;
        if (k === 'w' || k === 'h') { a.nw = a.nw || 0; G.sizeActor(a); }
        a._tf = '';
      }
      a.gx = a.x; a.gy = a.y;                              // the last place known to be good
      if (a.el && a.el.isConnected === false && G.world && G.world.appendChild) { fix(a, 'its picture was not on the page'); G.world.appendChild(a.el); a._tf = ''; }
      if (a.dragging && !(G.drag && G.drag.a === a)) { fix(a, 'marked as held, but not in the pointer\'s hand'); a.dragging = false; }
      if (a.balled && !G.balls.some((b) => b.a === a)) { a.balledT = (a.balledT || 0) + 1; if (a.balledT > 3) { fix(a, 'marked as having a ball on the way, but there is none'); a.balled = false; a.balledT = 0; } } else a.balledT = 0;
      if (a.vol && a.vol.away) { a.awayT = (a.awayT || 0) + 1; if (a.awayT > 8) { fix(a, `out of reach (${a.vol.away}) for more than 8 seconds`); a.vol.away = null; a.awayT = 0; } } else a.awayT = 0;
      if (a.await) { a.awaitT = (a.awaitT || 0) + 1; if (a.awaitT > 45) { fix(a, 'waiting to come in for more than 45 seconds'); const b = G.bounds(a); a.await = null; a.fall = null; a.hops = null; a.jy = 0; a.x = a.tx = U.clamp(a.x, b.x0, b.x1); a.y = a.ty = U.clamp(a.y, b.y0, b.y1); if (a.state === 'enter') a.state = a.side === 'team' ? 'idle' : 'roam'; a.awaitT = 0; } } else a.awaitT = 0;
    }
    if (G.drag && (G.drag.a.gone || !G.actors.includes(G.drag.a))) { fix(null, 'the pointer held a Pokémon that is gone'); letGo('the Pokémon in hand is gone'); }
    if (G.hover && G.hover.gone) G.hover = null;
    if (G.trainerTarget && G.trainerTarget.gone) G.trainerTarget = null;
    // pictures left behind by a Pokémon that is no longer in the game (they look like a Pokémon and answer nothing)
    try {
      const mine = new Set(G.actors.map((a) => a.el)), els = G.world && G.world.querySelectorAll ? G.world.querySelectorAll('.actor') : [];
      for (const el of els) if (!mine.has(el)) { fix(null, 'a picture without a Pokémon was left on the page'); el.remove(); }
    } catch (e) { /* a page without that */ }
    if (found.length) { G.note('put right', { what: found.slice(0, 6) }); G.report('put right', found.slice(0, 6).join('; ')); }
    G.sanityFound = (G.sanityFound || 0) + found.length;
    return found;
  };

  let drew = true;
  G.render = () => {
    dpr = window.devicePixelRatio || 1;
    for (const a of G.actors) renderActor(a);
    // the two full-screen canvases are only touched while there is something on them (sprites are separate elements)
    const labels = G.set.labels === 'always' || !!G.hover || !!G.hoverDrop || G.actors.some((a) => (a.side === 'wild' && !G.settled(a)) || a.mode === 'fight' || a.mode === 'guard' || a.state === 'faint' || G.now - a.lastHit < 4);
    const busy = labels || G.zones.length > 0 || G.shots.length > 0 || !!G.weather || FX.busy() > 0;
    if (!busy && !drew) return;
    FX.clear();
    drew = busy;
    if (!busy) return;
    const g = FX.g, t = FX.t;
    if (G.weather) { const w = G.weather; FX.drawWeather(g, w.kind, G.now, Math.min(1, w.t / 1.5) * Math.min(1, Math.max(0, (w.dur - w.t) / 1.5))); }
    FX.drawMarks(g, G.now);                               // snow patches and puddles lie under everything else
    for (const z of G.zones) FX.drawZone(g, z, G.now);
    drawLabels(t);
    drawShots(t);
    FX.drawTop();
    FX.drawTexts();
  };

  // Full frame rate whenever anything on screen moves; a slow tick when the team is just standing around
  // (the sprites' own animation is done by the browser and does not need us).
  let last = 0, idle = 0;
  G.frame = (ts) => {
    G.frameAt = ts;                                       // (the Android page reads this: no frames for a while means the screen is off)
    const still = !(typeof BoxField !== 'undefined' && BoxField.active()) && !G.wilds().some((w) => !G.settled(w)) && !FX.busy() && !Notify.busy() && !G.balls.length && !G.drops.length && !G.drag && !G.weather && !G.actors.some((a) => a.moving || a.hops || a.await || a.fall || a.hop > 0 || a.squash > 0 || a.flash > 0);
    idle = still ? (idle + 1) % 3 : 0;
    if (!idle) {
      const dt = Math.min(still ? 0.1 : 0.05, (ts - last) / 1000 || 0.016);
      last = ts;
      try { G.update(dt); G.render(); } catch (e) { console.error('[Screen Trainer]', e); const msg = String((e && e.stack) || e).slice(0, 400); if (G.note && (G._errMsg !== msg || ts - (G._errAt || 0) > 5000)) { G._errMsg = msg; G._errAt = ts; G.note('error', { msg }); if (G.report) G.report('error', msg); } }
    }
    requestAnimationFrame(G.frame);
  };

  // ------------------------------------------------------------------ persistence, Pokédex snapshot, commands
  G.saveNow = () => { G.dirty = false; G.saveT = 0; try { window.st.save(JSON.stringify(G.save)); } catch (e) { /* ignore */ } G.pushState(); };

  /** the species' name with its look: "Unown B", "Vivillon (High Plains)" (0.9.3) */
  const lookedName = (m) => { const d = D.dex[m.sp], l = Mon.lookName(m); return !l ? d.n : m.sp === 201 ? `${d.n} ${l}` : `${d.n} (${l})`; };
  G.lookedName = lookedName;
  /** a Poké Ball 9 pixels across, drawn by hand so it never waits for a picture (the caught mark by a name, 0.9.3) */
  function caughtBall(c, cx, cy) {
    c.save();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(12,14,20,.95)';
    c.beginPath(); c.arc(cx, cy, 4.5, Math.PI, 0); c.closePath(); c.fillStyle = '#ee3a3a'; c.fill();
    c.beginPath(); c.arc(cx, cy, 4.5, 0, Math.PI); c.closePath(); c.fillStyle = '#f4f4f4'; c.fill();
    c.beginPath(); c.arc(cx, cy, 4.5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - 4.5, cy); c.lineTo(cx + 4.5, cy); c.stroke();
    c.beginPath(); c.arc(cx, cy, 1.6, 0, Math.PI * 2); c.fillStyle = '#f4f4f4'; c.fill(); c.lineWidth = 1; c.stroke();
    c.restore();
  }
  function monView(m, i) {
    const d = D.dex[m.sp], tb = D.exp[d.gr], spr = Sprites.resolve(m.sp, m.shiny, m.fem, m.look), it = m.item ? Items.get(m.item) : null;
    return Object.assign({
      uid: m.uid, sp: m.sp, name: Mon.name(m), species: lookedName(m), look: m.look || '', nick: m.nick || '', lvl: m.lvl, hp: m.hp, maxHp: Mon.maxHp(m), shiny: !!m.shiny, fem: m.fem, genderless: d.gn < 0, alpha: !!m.alpha,
      xp: m.lvl >= 100 ? 1 : U.clamp((m.xp - tb[m.lvl]) / Math.max(1, tb[m.lvl + 1] - tb[m.lvl]), 0, 1),
      types: d.t.map((t) => D.types[t]), typeIds: d.t, nature: Mon.natureName(m), apt: Mon.aptitude(m), aff: m.aff, hearts: Mon.hearts(m), lead: Math.floor(m.lead || 0), leadLevel: Mon.leadLevel(m),
      stats: Mon.stats(m), iv: m.iv, moves: m.moves.map((id) => { const mv = D.moves[id]; return { id, n: mv.n, t: D.types[mv.t], c: mv.c, p: mv.p, a: mv.a, keep: !!(m.mvKeep && m.mvKeep.includes(id)) }; }),
      sprite: spr ? spr.front : '', icon: (m.look && spr ? spr.front : Sprites.icon(m.sp)) || (spr ? spr.front : ''), st: m.st, noEvo: !!m.noEvo, ball: m.ball || 'poke-ball', ballIcon: Sprites.item(m.ball || 'poke-ball'), leader: i === 0,
      item: it ? { key: m.item, name: it.n, text: it.text, icon: Sprites.item(m.item) } : null, wins: m.wins || 0, metLvl: m.metLvl, met: m.met || 0,
      size: Size.label(m), sizeName: Size.name(m), height: Size.metres(m), sz: Size.value(m),
      obey: i === undefined ? null : Math.round((i === 0 ? U.clamp(0.6 + (0.4 * m.aff) / 255, 0, 0.99) : G.obeyChance({ mon: m }, { mon: G.save.team[0] })) * 100),
    }, Honors.monView(m));
  }
  let sentBoxEpoch = -1;
  /** everything the Pokédex window shows. The Box can be large, so it is only included when it changed (or full is set). */
  /** (0.9.7) the numbers the pointers are won by (pointers.js): species caught in all, per type and per generation (and
   *  how many each generation has), shinies (and of which types), badges, legendaries, alphas, pets, items found,
   *  Trainers beaten, friendly battles won, catches made together on visits */
  /** (0.9.7) the team as numbers, to go along on a visit (online.js checks them again with gift()) */
  G.teamGift = () => G.save.team.slice(0, 6).map((m) => ({ sp: m.sp, lvl: m.lvl, shiny: !!m.shiny, nat: m.nat, iv: m.iv, fem: m.fem === 1 ? true : m.fem === 0 ? false : undefined, moves: (m.moves || []).slice(0, 4), sz: m.sz }));
  G.pointerStats = () => {
    const sv = G.save, st = sv.stats || {}, type = {}, gen = {}, genAll = {}, shinyType = {}, badgeIds = {};
    for (const id of Object.keys(D.dex)) { const g = D.dex[id].g; genAll[g] = (genAll[g] || 0) + 1; }
    for (const k of Object.keys(sv.dex.caught)) { const d = D.dex[k]; if (!d) continue; gen[d.g] = (gen[d.g] || 0) + 1; for (const t of d.t) { const n = D.types[t]; type[n] = (type[n] || 0) + 1; } }
    for (const m of sv.team.concat(sv.box)) if (m.shiny && D.dex[m.sp]) for (const t of D.dex[m.sp].t) shinyType[D.types[t]] = 1;
    for (const k of Object.keys(sv.badges || {})) badgeIds[k] = 1;
    return { species: caughtSpecies(), caught: st.caught | 0, shiny: st.shiny | 0, legend: st.legend | 0, alpha: st.alpha | 0, pets: st.pets | 0, items: st.items | 0, trainers: st.trainers | 0, friendly: st.friendly | 0, visitCaught: st.visitCaught | 0, type, gen, genAll, shinyType, badgeIds };
  };
  G.snapshot = (full) => {
    const sv = G.save, tier = G.ballTier(), eq = Items.equippedBall();
    const out = {
      team: sv.team.map((m, i) => monView(m, i)), boxCount: sv.box.length, eggs: sv.eggs ? sv.eggs.length : 0,
      care: sv.daycare && Array.isArray(sv.daycare.mons) ? { guests: sv.daycare.mons.map((m) => `${Mon.name(m)} (Lv. ${m.lvl})`), egg: !!sv.daycare.egg } : { guests: [], egg: false },      // who is at the Day Care on the MyStream field
      dex: { seen: Object.keys(sv.dex.seen).length, caught: caughtSpecies(), total: Object.keys(D.dex).length, seenIds: Object.keys(sv.dex.seen).map(Number), caughtIds: sv.dex.caught, sizes: sv.dex.size || {} },
      weather: G.weather ? G.weather.kind : null, event: Events.view(),
      stats: sv.stats, started: sv.started, ball: eq ? eq.n : tier.label, ballIcon: Sprites.item(eq ? eq.k : tier.name), ballSpecial: !!eq, ballLeft: eq ? Items.count(eq.k) : 0, nextBall: null,
      bag: Items.view(), badges: Honors.badgeView(sv), sound: Sound.status(), spritesOk: Sprites.ready(), wild: G.wilds().filter((w) => !G.settled(w)).length,
      loiter: G.wilds().filter((w) => G.settled(w)).length, field: G.view ? { w: Math.round(G.W), h: Math.round(G.H) } : null,
      ground: G.groundList(),                               // who the field's ground is grown from (field.html draws it)
      helpers: Events.helperView(),                         // which of Rotom, Mewtwo and Porygon-Z are here: their buttons show in the Pokédex
      ptr: G.pointerStats(),                                // (0.9.7) what the pointers to be won are counted from (pointers.js, online.js)
    };
    if (full || sentBoxEpoch !== G.boxEpoch) { out.box = sv.box.map((m) => monView(m)); sentBoxEpoch = G.boxEpoch; }
    return out;
  };
  G.pushState = (full) => { try { window.st.sendState(G.snapshot(full)); } catch (e) { /* ignore */ } };

  /** commands from the Pokédex window and the tray menu: { type, uid?, ... } */
  G.command = (c) => {
    if (!c || typeof c.type !== 'string') return;
    const sv = G.save, ti = sv.team.findIndex((m) => m.uid === c.uid), bi = sv.box.findIndex((m) => m.uid === c.uid), tm = sv.team[ti];
    switch (c.type) {
      case 'gather': G.gather(); break;
      case 'state': break;
      case 'leader': if (ti > 0) { const [m] = sv.team.splice(ti, 1); sv.team.unshift(m); G.toast({ title: `${Mon.name(m)} is now the team leader!`, icon: Sprites.icon(m.sp), tone: 'gold' }); } break;
      case 'move': { const j = ti + c.dir; if (ti >= 0 && j >= 0 && j < sv.team.length) { [sv.team[ti], sv.team[j]] = [sv.team[j], sv.team[ti]]; } break; }
      case 'box': if (ti >= 0 && sv.team.length > 1) { sv.box.push(sv.team.splice(ti, 1)[0]); G.syncTeam(); } break;
      case 'unbox': if (bi >= 0 && G.teamRoom()) { const m = sv.box.splice(bi, 1)[0]; m.hp = Math.max(m.hp, 1); sv.team.push(m); G.syncTeam(); } break;
      case 'release':
        if (ti >= 0 && sv.team.length > 1) { if (tm.item) Items.add(tm.item); sv.team.splice(ti, 1); G.syncTeam(); }
        else if (bi >= 0) { if (sv.box[bi].item) Items.add(sv.box[bi].item); sv.box.splice(bi, 1); }
        break;
      case 'rename': { const m = tm || sv.box[bi]; if (m) m.nick = String(c.name || '').slice(0, 12).trim(); break; }
      case 'tidy':                                          // (0.9.9) Rotom's big tidy-up: the team goes off to help, and comes back when it is done
        G.tidying = !!c.on; G.tidyAt = G.now;
        if (c.on) { for (const a of G.team()) { a.nap = 0; if (G.alive(a)) G.say(a, 'Off to help Rotom!', { col: '#ffb86b', size: 11 }); } G.toast({ title: 'Rotom is tidying up', text: 'Your team went to carry files. They will be back.', icon: Sprites.icon(479), tone: 'info', dur: 5 }); }
        else { for (const a of G.team()) { a.idleT = 0; } G.toast({ title: 'The tidy-up is done', text: `${c.moved | 0} file${(c.moved | 0) === 1 ? '' : 's'} put in order. Your team is back.`, icon: Sprites.icon(479), tone: 'gold', dur: 6 }); }
        break;
      case 'evoLock': { const m = tm || sv.box[bi]; if (m) m.noEvo = c.on ? 1 : 0; break; }
      case 'setMove': {                                     // the owner picks a move in the Pokédex (0.9.5)
        const m = tm || sv.box[bi]; if (!m) break;
        const why = Mon.setMove(m, c.slot, c.move);
        if (why) G.toast({ title: why, icon: Sprites.icon(m.sp), tone: 'info', dur: 3 });
        else { snd('select'); const a = tm && G.team().find((x) => x.mon === m); if (a) G.say(a, `${D.moves[Math.round(+c.move)].n}!`, { col: '#ffe680', size: 12 }); }
        break;
      }
      case 'arrange': {                                     // drag and drop: the whole line-up in one go
        const all = new Map([...sv.team, ...sv.box].map((m) => [m.uid, m]));
        const want = Array.isArray(c.team) ? [...new Set(c.team)].filter((u) => all.has(u)) : [];
        if (!want.length || want.length > 6) break;         // a team has one to six members
        const used = new Set(want), box = (Array.isArray(c.box) ? [...new Set(c.box)] : []).filter((u) => all.has(u) && !used.has(u));
        box.forEach((u) => used.add(u));
        for (const u of all.keys()) if (!used.has(u)) box.push(u);          // anyone not mentioned stays in the Box
        const lead = sv.team[0];
        sv.team = want.map((u) => all.get(u)); sv.box = box.map((u) => all.get(u));
        for (const m of sv.team) if (!(m.hp >= 0)) m.hp = 1;
        G.syncTeam();
        if (lead && sv.team[0] !== lead) G.toast({ title: `${Mon.name(sv.team[0])} is now the team leader!`, icon: Sprites.icon(sv.team[0].sp), tone: 'gold' });
        break;
      }
      case 'importTeam': {                                  // Pokémon read from a Showdown team text (src/showdown.js); every entry is checked again here
        if (typeof Showdown === 'undefined' || !Array.isArray(c.mons)) break;
        const made = [];
        for (const e of c.mons.slice(0, Showdown.MAX)) { let r = null; try { r = Showdown.build(e, { DATA: D, Mon, Items }); } catch (err) { r = null; } if (r && r.mon) made.push(r.mon); }
        if (!made.length) { G.toast({ title: 'Nothing was imported', text: 'None of the entries was a Pokémon this game knows.', tone: 'alert', dur: 5 }); return; }
        let toTeam = 0, toBox = 0;
        const rec = (sv.dex.size = sv.dex.size || {});
        for (const m of made) {
          if (G.teamRoom()) { sv.team.push(m); toTeam++; } else { sv.box.push(m); toBox++; }
          sv.dex.seen[m.sp] = 1; sv.dex.caught[m.sp] = (sv.dex.caught[m.sp] || 0) + 1;
          const sz = Size.value(m), was = rec[m.sp]; rec[m.sp] = was ? [Math.min(was[0], sz), Math.max(was[1], sz)] : [sz, sz];
        }
        sv.stats.imported = (sv.stats.imported || 0) + made.length;
        G.syncTeam();
        G.toast({ title: `${made.length} Pokémon imported`, text: [toTeam ? `${toTeam} joined your team` : '', toBox ? `${toBox} went to the Box` : ''].filter(Boolean).join(', ') + '.', icon: Sprites.icon(made[0].sp), tone: 'gold', dur: 6 });
        snd('caught');
        break;
      }
      case 'useItem': if (tm) G.useItem(String(c.item), tm, false); break;
      case 'giveItem': if (tm && Items.give(String(c.item), tm)) { const a = G.actors.find((x) => x.mon === tm); if (a && !a.await) { G.say(a, `is now holding ${an(Items.name(tm.item))}.`, { col: '#9ad8ff', size: 11 }); a.hop = 0.25; } snd('use'); } break;
      case 'takeItem': if (tm && Items.unhold(tm)) snd('drop'); break;
      case 'equipBall': { const d = Items.get(String(c.item)); if (d && d.ball && Items.count(d.k)) { sv.ball = c.on === true ? d.k : sv.ball === d.k ? '' : d.k; snd('select'); } break; }      // (on: true from a double-click in the Bag, 0.9.5: always "use these")
      case 'tossItem': Items.take(String(c.item), 1); break;
      case 'music': Sound.music(String(c.op || 'random')); return;
      // for trying things out and for the checks in tools/: start a weather or a legendary visit right now
      case 'weather': Events.startWeather(c.kind ? String(c.kind) : null, +c.seconds || 0); return;
      case 'rival': if (typeof Rivals !== 'undefined') Rivals.start(c.kind === 'gym' || c.kind === 'trainer' ? c.kind : undefined); break;      // (for trying it out, and for the checks)
      case 'rematch': if (typeof Rivals !== 'undefined') Rivals.rematch(); break;      // the Pokédex's "Rechallenge" button
      case 'event': Events.start(c.kind ? String(c.kind) : null, +c.sp || 0); return;
      case 'helper': Events.startHelper(String(c.key || '')); return;      // (for trying it out, and for the checks)
      case 'gift': {                                        // caught together on a visit: online.js let only numbers through, and the Pokémon is built anew here
        if (typeof Showdown === 'undefined' || !c.mon) return;
        let r = null;
        try { r = Showdown.build(c.mon, { DATA: D, Mon, Items }); } catch (err) { r = null; }
        if (!r || !r.mon) return;
        const m = r.mon, nm = D.dex[m.sp].n, isNew = !sv.dex.caught[m.sp], from = String(c.from || 'a Trainer').replace(/[^\w .'-]/g, '').slice(0, 24);
        delete m.imp; m.vis = 1; m.aff = 35;               // vis: it was caught on a visit
        if (Number.isInteger(c.mon.sz) && c.mon.sz >= 0 && c.mon.sz <= 255) m.sz = c.mon.sz;
        sv.dex.seen[m.sp] = 1; sv.dex.caught[m.sp] = (sv.dex.caught[m.sp] || 0) + 1;
        sv.stats.caught++; sv.stats.visitCaught = (sv.stats.visitCaught || 0) + 1; if (m.shiny) sv.stats.shiny++;
        const rec = (sv.dex.size = sv.dex.size || {}), sz = Size.value(m), was = rec[m.sp]; rec[m.sp] = was ? [Math.min(was[0], sz), Math.max(was[1], sz)] : [sz, sz];
        let text;
        if (G.teamRoom()) { sv.team.push(m); G.syncTeam(); text = 'It joined your team.'; } else { sv.box.push(m); G.boxEpoch++; text = 'It went to your Box.'; }
        G.toast({ title: `${c.mine ? 'Gotcha!' : 'Caught together:'} ${m.shiny ? 'Shiny ' : ''}${nm}`, text: `On ${from}'s field. ${text}${isNew ? ' New Pokédex entry.' : ''}`, icon: m.shiny ? Sprites.still(m.sp, true) || Sprites.icon(m.sp) : Sprites.icon(m.sp), tone: m.shiny ? 'shiny' : 'gold', dur: 5 });
        Sound.play('caught', {});
        G.checkHonors(); G.saveNow();
        return;
      }
      case 'visitHelper': Events.visitHelper(String(c.key || ''), String(c.from || 'a Trainer').replace(/[^\w .'-]/g, '').slice(0, 24)); return;      // Rotom, Mewtwo or Porygon-Z came along from a visit
      case 'guardSay': if (typeof Mewtwo !== 'undefined') Mewtwo.say(String(c.text || ''), c.tone, +c.seconds || 0); return;
      case 'pin': {                                          // (for looking into clicks: the request "pointer" holds one Pokémon under the pointer for a while, so that a click is sure to be on it)
        const list = (c.who === 'wild' ? G.wilds() : G.team()).filter((a) => !a.gone && !a.await && a.state !== 'captured' && a.state !== 'leave');
        const a = list[Math.max(0, c.n | 0) % Math.max(1, list.length)];
        G.pin = a && +c.sec > 0 ? { a, until: G.now + Math.min(120, +c.sec) } : null;
        G.note('pin', { who: G.pin ? whoIs(a) : 'nobody' });
        return;
      }
      case 'reset':
        for (const a of G.actors.slice()) G.removeActor(a);
        for (const b of G.balls) b.el.remove();
        for (const d of G.drops.slice()) G.removeDrop(d);
        G.balls.length = 0; G.zones.length = 0; G.shots.length = 0; G.weather = null; if (typeof Rivals !== 'undefined') Rivals.reset(); G.trainerTarget = null; Notify.clear(); Events.reset();
        G.save = G.newSave(); G.nextSpawn = 2; G.toast({ title: 'A fresh start', text: 'Catch your first partner!', tone: 'info' });
        if (typeof Mewtwo !== 'undefined') Mewtwo.apply(G.set, true);      // a new game has not met Mewtwo yet (src/events.js, "the three helpers")
        break;
      default: return;
    }
    G.boxEpoch++;
    G.saveNow();
  };
})();
