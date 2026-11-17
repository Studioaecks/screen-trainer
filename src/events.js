// Screen Trainer — things that happen by themselves: weather from the sky, and rare visits by legendary Pokémon.
//
//   Weather   Options > "Random weather" (setting weatherFreq, 0..10). Unlike weather a move calls up, it runs
//             its course and wears nobody down; it still boosts and weakens moves and decides weather marks.
//   Visits    Options > "Legendary visits" (setting legendEvents). One legendary at a time, of three kinds:
//               friendly    hurts nobody and is hurt by nobody; click it to pet it and earn its trust
//               aggressive  a boss with five times the health that goes for the team
//               evasive     darts away from the pointer until it is out of breath
//             Every kind can be caught: each has its own way of raising the catch chance (catchMult below).
//
// game.js calls in here at a handful of marked places (Events.update, .ai, .pet, .catchMult, .caught,
// .brokeFree, .tag). To try things without waiting: G.command({ type: 'weather', kind: 'rain' }) and
// G.command({ type: 'event', kind: 'evasive', sp: 380 }).
'use strict';

const Events = (() => {
  const D = DATA;

  // ------------------------------------------------------------------ random weather
  // minutes between two spells of weather, on average, for each position of the slider (0 = never)
  const WEATHER_MIN = [0, 60, 40, 25, 15, 10, 7, 5, 3.5, 2.5, 1.5];
  const WEATHER_KINDS = [['rain', 30], ['sun', 25], ['snow', 20], ['sand', 15], ['hail', 10]];      // kind, how likely
  const WEATHER_TEXT = { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', sand: 'A sandstorm kicked up!', hail: 'It started to hail!', snow: 'It started to snow!' };
  const WEATHER_SECONDS = [60, 150];
  let weatherIn = null, weatherFreq = -1;
  const weatherGap = (f) => WEATHER_MIN[f] * 60 * U.rand(0.5, 1.5);
  /** what the Options slider shows for a position */
  const weatherLabel = (f) => (!f ? 'Never' : WEATHER_MIN[f] >= 2 ? `about every ${WEATHER_MIN[f]} min` : `about every ${Math.round(WEATHER_MIN[f] * 60)} s`);

  function startWeather(kind, seconds) {
    if (!WEATHER_TEXT[kind]) kind = U.wpick(WEATHER_KINDS, (k) => k[1])[0];
    G.setWeather(kind, seconds > 0 ? seconds : U.rand(WEATHER_SECONDS[0], WEATHER_SECONDS[1]), true);
    FX.text(G.W / 2, G.H * 0.25, WEATHER_TEXT[kind], { col: '#eaf2ff', size: 15, dur: 2.4 });
    Sound.play(kind);
    return kind;
  }
  /** Options > "Weather all the time" (setting weatherFixed): that weather stays up for as long as the option does.
      It is natural weather (hurts nobody). A visitor that brings its own, or a move that calls another, takes over
      for its time; then the chosen weather comes back. */
  let fixed = 'off';
  function stepFixed() {
    const want = WEATHER_TEXT[G.set.weatherFixed] ? G.set.weatherFixed : 'off';
    if (want !== fixed) {
      if (G.weather && G.weather.fixed) G.weather.dur = Math.min(G.weather.dur, G.weather.t + 1.5);      // the old choice clears up
      fixed = want;
    }
    if (fixed === 'off') return false;
    const w = G.weather;
    if (!w) { G.setWeather(fixed, 3600, true); G.weather.fixed = true; FX.text(G.W / 2, G.H * 0.25, WEATHER_TEXT[fixed], { col: '#eaf2ff', size: 15, dur: 2.4 }); Sound.play(fixed); }
    else if (w.fixed && w.kind === fixed && w.dur - w.t < 600) w.dur = w.t + 3600;                       // it never runs out
    return true;
  }
  function stepWeather(dt) {
    if (stepFixed()) return;                               // random weather waits while one is chosen
    const f = U.clamp(Math.round(+G.set.weatherFreq || 0), 0, 10);
    if (f !== weatherFreq) { const first = weatherFreq < 0; weatherFreq = f; weatherIn = f ? weatherGap(f) * (first ? U.rand(0.3, 1) : 1) : null; }
    if (!f || G.weather) return;                           // the clock waits while any weather is up
    weatherIn -= dt;
    if (weatherIn <= 0) { weatherIn = weatherGap(f); startWeather(); }
  }

  // ------------------------------------------------------------------ legendary visits
  const EVERY = { off: 0, rare: 75, sometimes: 30, often: 10 };       // minutes between visits, on average
  const KINDS = ['friendly', 'aggressive', 'evasive'];
  const STAY = { friendly: 110, aggressive: 170, evasive: 95 };       // seconds a visit lasts when nothing ends it sooner
  const TRUST_MAX = 12, STAMINA = 5, TIRED = 3.4, SHY = 210, DASH = 330, BOSS_HP = 5;     // BOSS_HP: health multiplier of an aggressive visitor
  // Temperament where the games give a clear lead (roamers dodge, guardians and titans fight, protectors are gentle).
  // A legendary that is not listed gets one from its Pokédex number, so each species always behaves the same way.
  const TEMPER = {
    evasive: [151, 243, 244, 245, 251, 380, 381, 385, 481, 488, 492, 494, 641, 642, 648, 720, 802, 807, 893],
    aggressive: [144, 145, 146, 150, 377, 378, 379, 382, 383, 384, 386, 483, 484, 485, 486, 487, 491, 643, 644, 645, 646, 649, 717, 718, 721, 800, 890, 894, 895, 896, 897, 1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1025],
    friendly: [249, 250, 480, 482, 489, 490, 493, 638, 639, 640, 647, 716, 719, 772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 801, 808, 809, 888, 889, 891, 892, 898, 905, 1017, 1024],
  };
  const TEMPER_OF = {};
  for (const k of KINDS) for (const sp of TEMPER[k]) TEMPER_OF[sp] = k;
  const temper = (sp) => TEMPER_OF[sp] || KINDS[sp % 3];
  // a few bring their own weather with them, as they do in the games; Rayquaza clears the sky
  const BRINGS = { 144: 'snow', 145: 'rain', 146: 'sun', 245: 'rain', 249: 'rain', 250: 'sun', 377: 'sand', 378: 'hail', 382: 'rain', 383: 'sun', 485: 'sun', 641: 'rain', 642: 'rain', 645: 'sand', 646: 'hail', 896: 'snow' };
  const TAG = { friendly: 'Friendly ', aggressive: 'Raging ', evasive: 'Swift ' };
  const HELLO = {
    friendly: ['is paying you a visit!', 'A friendly legendary Pokémon. Click it to pet it and earn its trust: the more it trusts you, the easier it is to catch.'],
    aggressive: ['is on the rampage!', 'A legendary Pokémon looking for a fight. Wear it down, then throw a ball.'],
    evasive: ['is darting about!', 'It shies away from your pointer. Chase it until it is out of breath, then throw a ball.'],
  };

  let cur = null, nextIn = null, freq = '';
  const gap = (f) => EVERY[f] * 60 * U.rand(0.6, 1.4);
  const nameOf = (a) => Mon.name(a.mon);
  const active = () => !!(cur && cur.a && !cur.a.gone && cur.a.ev);

  function pickSpecies(kind) {
    const fits = (id) => D.dex[id].lg && (!kind || temper(id) === kind);
    let pool = (G.pool || []).filter(fits);                                   // the generations ticked in Options first
    if (!pool.length) pool = Object.keys(D.dex).map(Number).filter((id) => fits(id) && Sprites.available(id));
    return pool.length ? U.wpick(pool, (id) => (G.save.dex.caught[id] ? 1 : 3)) : 0;      // ones you have not caught come more often
  }

  /** begin a visit. kind and sp are optional; returns the actor, or null when no visit can start right now */
  function start(kind, sp) {
    if (active() || !Sprites.ready()) return null;
    if (!KINDS.includes(kind)) kind = null;
    if (!sp || !D.dex[sp] || !Sprites.available(sp)) sp = pickSpecies(kind);
    if (!sp) return null;
    const team = G.save.team;
    kind = kind || temper(sp);
    if (kind === 'aggressive' && !team.length) kind = 'evasive';              // nobody to fight yet
    const avg = team.length ? team.reduce((s, m) => s + m.lvl, 0) / team.length : 12;
    const lvl = U.clamp(Math.round(avg + (kind === 'aggressive' ? 8 : 2) + U.rint(5)), 15, 100);
    const a = G.addWild(sp, lvl, U.chance(1 / Math.max(1, G.set.shinyOdds || 100)), null, { event: true, hpx: kind === 'aggressive' ? BOSS_HP : 0 });
    a.ev = { kind, trust: 0, petT: -9, stam: STAMINA, tired: 0, dashAt: 0, left: STAY[kind], gift: false, healed: false, fails: 0, weak: false, idle: 1 };
    a.terr = kind === 'aggressive'; a.stay = 9999;                             // this file decides when it leaves
    cur = { a, kind, sp, out: '' };
    G.save.stats.visits = (G.save.stats.visits || 0) + 1;
    const nm = D.dex[sp].n, hi = HELLO[kind];
    G.toast({ title: `${nm} ${hi[0]}`, text: hi[1], icon: Sprites.still(sp, a.mon.shiny) || Sprites.icon(sp), tone: 'rare', dur: 8 });
    Sound.play('alert', { x: G.W / 2 });
    if (BRINGS[sp]) startWeather(BRINGS[sp], STAY[kind] * 0.8); else if (sp === 384) G.weather = null;
    G.touch();
    return a;
  }

  function gift(a) {
    const key = Items.randomItem(3);
    if (!key) return;
    a.ev.gift = true;
    G.dropItem(key, a.x + (a.face > 0 ? -1 : 1) * (a.w * 0.4 + 20), a.y);
    G.say(a, `${nameOf(a)} left you a gift!`, { col: '#fff6a8', size: 12 });
  }
  function leave(a, why) {
    const ev = a.ev;
    if (ev.kind === 'friendly' && ev.trust >= 3 && !ev.gift) gift(a);
    cur.out = cur.out || 'left';
    G.flee(a, why || { friendly: 'bid you farewell.', aggressive: 'lost interest and left.', evasive: 'darted off into the distance.' }[ev.kind]);
    G.save.stats.fled--;                                   // a visit that ends is not an escape
  }

  // ---- the three temperaments. Events.ai runs at the top of the wild AI in game.js; true = "I moved it myself".
  function ai(a, dt) {
    const ev = a.ev;
    if (!ev) return false;
    ev.left -= dt;
    if (ev.left <= 0 && !a.balled && !a.busy) { leave(a, ev.helper ? 'will be back later.' : undefined); return true; }
    if (ev.helper) helperAI(a, dt);
    if (ev.kind === 'aggressive') {
      if (!ev.weak && a.mon.hp / Mon.maxHp(a.mon) <= 0.25) { ev.weak = true; G.say(a, `${nameOf(a)} is worn out. Now is your chance!`, { col: '#d6b8ff', size: 12 }); }
      return false;                                        // otherwise it fights like any territorial wild Pokémon
    }
    a.aggro = false; a.terr = false; a.cower = false; a.target = null;       // these two never fight back
    if (ev.kind === 'friendly') return false;              // and a friendly one simply strolls about
    return evasive(a, dt);
  }
  function evasive(a, dt) {
    const ev = a.ev, c = G.cursor, b = G.bounds(a);
    if (ev.tired > 0) {                                    // out of breath: it stands still, and is far easier to catch
      ev.tired -= dt; a.faceT = null;
      if (G.now >= a.hasteT) { a.tx = a.x; a.ty = a.y; }   // (it finishes the dash that wore it out first)
      ev.puff = (ev.puff || 0) - dt;
      if (ev.puff <= 0) { ev.puff = 0.6; FX.puff(a.x + a.face * -a.w * 0.3, a.y - a.h * 0.7, 'normal', 2, 10, 4, 0.5); }
      if (ev.tired <= 0) { ev.stam = STAMINA; G.say(a, `${nameOf(a)} got its breath back!`, { col: '#d6b8ff', size: 11 }); }
      return true;
    }
    ev.stam = Math.min(STAMINA, ev.stam + dt * 0.2);
    const dx = a.x - c.x, dy = a.y - a.h * 0.5 - c.y, d = Math.hypot(dx, dy);
    if (c.x > -1000 && d < SHY + a.w * 0.3 && G.now >= ev.dashAt && !a.balled) {
      const ang = Math.atan2(dy, dx) + U.rand(-0.7, 0.7);
      let tx = U.clamp(a.x + Math.cos(ang) * DASH, b.x0, b.x1), ty = U.clamp(a.y + Math.sin(ang) * DASH * 0.7, b.y0, b.y1);
      if (Math.hypot(tx - a.x, ty - a.y) < 140) {         // cornered: slip past to the other side of the screen
        tx = c.x < G.W / 2 ? U.rand(G.W * 0.6, b.x1) : U.rand(b.x0, G.W * 0.4);
        ty = c.y < G.H / 2 ? U.rand(G.H * 0.6, b.y1) : U.rand(b.y0, G.H * 0.45);
      }
      a.tx = tx; a.ty = ty; a.run = true; a.settled = false;
      a.haste = 3.2; a.hasteT = G.now + 0.5; ev.dashAt = G.now + 0.45; ev.idle = 1.2; ev.stam -= 1;
      FX.dust(a.x, a.y, 5, 4);
      Sound.play('hop', { x: a.x, vol: 0.5 });
      if (ev.stam < 1) { ev.stam = 0; ev.tired = TIRED; G.say(a, `${nameOf(a)} is catching its breath!`, { col: '#d6b8ff', size: 12 }); }
      return true;
    }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < 11) {         // nothing near: wander
      ev.idle -= dt;
      if (ev.idle <= 0) { ev.idle = U.rand(1, 3.5); a.run = false; a.tx = U.clamp(a.x + U.rand(-420, 420), b.x0, b.x1); a.ty = U.clamp(a.y + U.rand(-260, 260), b.y0, b.y1); }
    }
    return true;
  }

  /** the player clicks a friendly visitor: it is petted, not hurt */
  function pet(a) {
    const ev = a.ev, nm = nameOf(a);
    FX.hearts(a.x, a.y - a.h * 0.9, 3); a.hop = 0.25;
    Sound.play('pet', { x: a.x });
    G.save.stats.pets++;
    G.trainerTarget = a; G.clickT = G.now;                 // shows the catch meter and the ball button on it
    if (G.now - ev.petT < 1.2 / Math.min(4, Math.max(0.25, G.set.befriendPower || 1))) return;      // befriendPower (0.9.5): 2 = trust grows twice as fast
    ev.petT = G.now;
    if (ev.trust >= TRUST_MAX) return;
    ev.trust++;
    if (ev.trust === 4 && !ev.healed) {
      ev.healed = true;
      for (const t of G.team()) if (t.mon.hp > 0) { t.mon.hp = Mon.maxHp(t.mon); t.mon.st = null; FX.sparkle(t.x, t.y - t.h * 0.5, 6, '#9cf07a', t.w * 0.4); }
      G.say(a, `${nm} restored your team!`, { col: '#9cf07a', size: 12 });
      Sound.play('heal', { x: a.x });
    } else if (ev.trust === 8 && !ev.gift) gift(a);
    else if (ev.trust === TRUST_MAX) { G.say(a, `${nm} trusts you completely!`, { col: '#ff8fb3', size: 13 }); FX.sparkle(a.x, a.y - a.h * 0.5, 10, '#ffb8d0', a.w * 0.5); }
    else G.say(a, `Trust ${'♥'.repeat(Math.ceil(ev.trust / 3))}`, { col: '#ff8fb3', size: 11 });
    G.touch();
  }

  /** how much easier this visitor is to catch right now (multiplies the ball's own strength) */
  function catchMult(a) {
    const ev = a.ev;
    if (!ev) return 1;
    if (ev.helper) return 1e6;                                                // a helper lets itself be caught with the first ball
    if (ev.kind === 'friendly') return 1 + ev.trust * 3.5;                    // full trust: about one throw in three with an Ultra Ball
    if (ev.kind === 'evasive') return ev.tired > 0 ? 9 : 2.5;
    return ev.weak ? 4 : 1;
  }
  /** it popped out of a ball */
  function brokeFree(a) {
    const ev = a.ev;
    ev.fails++;
    if (ev.kind === 'aggressive') { if (G.save.team.length) { a.aggro = true; a.cower = false; a.lastHit = G.now; } return; }
    if (ev.kind === 'evasive') { ev.tired = 0; ev.stam = STAMINA; ev.dashAt = 0; return; }       // the fright gives it a second wind
    ev.trust = Math.max(0, ev.trust - 1); ev.left -= 6;
    if (ev.fails >= 8) leave(a, 'has had enough of the balls and left.');
  }
  function caught(a) { if (cur && cur.a === a) cur.out = 'caught'; a.ev = null; a.haste = 1; a.hasteT = -9; }
  const tag = (a) => (a.ev ? (a.ev.helper ? 'Super XXL ' : TAG[a.ev.kind]) : '');

  // ------------------------------------------------------------------ the three helpers (0.7)
  // Three parts of the program each belong to a Pokémon, and that Pokémon has to be met first. Shortly after a new game
  // starts (within half a minute) a friendly Super XXL Rotom drops by, then Mewtwo, then Porygon-Z, one after the
  // other. Each says a few words and lets itself be caught with the first ball; catching it puts its button into the
  // Field Dex:   Rotom -> Optimize, the computer organizer     Mewtwo -> the Guardian     Porygon-Z -> MyStream.
  // A helper does not join the team or the Box: it moves into its part of the program (save.helpers[key] = when).
  // One that is not caught leaves after a while and comes back later, for as long as it takes. Until all three are
  // here ordinary legendary visits wait their turn only while a helper is on the screen. A save from before 0.7 has
  // no helpers yet, so they come by there too: the first time 0.7 runs is, for them, a new game.
  // To try one: G.command({ type: 'helper', key: 'rotom' }).
  const HELPERS = [
    { key: 'rotom', sp: 479, opens: 'Optimize', what: 'It wants to tidy up your computer.',
      lines: ['Bzzt! So many files in there... may I?', 'Zzzt! I can sort all of that. Just throw a ball!', 'Bzz-bzzt! Let me in, I will keep it neat!'], yes: 'Bzzt! Deal! Find me under "optimize" in your Field Dex.' },
    { key: 'mewtwo', sp: 150, opens: 'the Guardian', what: 'It offers to watch over your computer.',
      lines: ['I have watched this machine. It needs a guardian.', 'I offer my strength. Throw the ball; I will not resist.', 'Nothing will harm what I protect.'], yes: 'So be it. I stand guard. My button is in your Field Dex.' },
    { key: 'porygonz', sp: 474, opens: 'MyStream', what: 'It wants to put your games on the air.',
      lines: ['St-st-stream? I c-can broadcast!', 'On air... on air... t-throw the ball!', 'Sig-signal ready. Sh-shall we go live?'], yes: 'C-connected! Press "stream" in your Field Dex. We are l-live!' },
  ];
  const HELP_STAY = 150, HELP_FIRST = 8, HELP_NEXT = 6, HELP_BACK = [360, 600];
  let helperIn = null;
  const helpers = () => { const sv = G.save; if (!sv.helpers || typeof sv.helpers !== 'object') sv.helpers = {}; return sv.helpers; };
  const hasHelper = (key) => !!helpers()[key];
  const helperDef = (key) => HELPERS.find((h) => h.key === key);
  /** the helper is here to stay: its part of the program opens */
  function grant(h, how) {
    const sv = G.save, nm = D.dex[h.sp] ? D.dex[h.sp].n : h.key;
    helpers()[h.key] = Date.now();
    sv.dex.seen[h.sp] = 1; sv.dex.caught[h.sp] = (sv.dex.caught[h.sp] || 0) + 1;
    G.toast({ title: `${nm} joined you: ${h.opens} is open!`, text: how === 'caught' ? `"${h.yes}"` : how && how.from ? `It came along from ${how.from}'s field. "${h.yes}"` : `Your sprites folder has no picture of ${nm}, so it came unseen. Its button is in the Field Dex.`, icon: Sprites.still(h.sp, false) || Sprites.icon(h.sp), tone: 'gold', dur: 9 });
    try { if (h.key === 'mewtwo' && typeof Mewtwo !== 'undefined') Mewtwo.apply(G.set, true); } catch (e) { /* it shows up on the next settings change */ }
    helperIn = HELP_NEXT;
    G.saveNow();
  }
  /** a helper arrives. Returns its actor, or null when it cannot come right now. */
  function startHelper(key) {
    const h = helperDef(key);
    if (!h || hasHelper(h.key) || active() || !Sprites.ready() || (typeof Rivals !== 'undefined' && Rivals.active())) return null;
    if (!D.dex[h.sp] || !Sprites.available(h.sp)) { grant(h, 'unseen'); return null; }
    const team = G.save.team, avg = team.length ? team.reduce((s, m) => s + m.lvl, 0) / team.length : 20;
    const a = G.addWild(h.sp, U.clamp(Math.round(avg + 20), 40, 100), false, null, { event: true, sz: 255 });
    a.grow = 1.6;                                          // Super XXL: larger than the largest of its kind (G.sizeActor)
    a.ev = { kind: 'friendly', helper: h.key, trust: TRUST_MAX, petT: -9, stam: STAMINA, tired: 0, dashAt: 0, left: HELP_STAY, gift: true, healed: true, fails: 0, weak: false, idle: 1, talk: 0.8, line: 0 };      // (talk: it says its first words as soon as it has landed)
    a.terr = false; a.calm = false; a.stay = 9999;
    G.sizeActor(a);                                        // (its picture may have been sized before it was known to be a helper)
    cur = { a, kind: 'friendly', sp: h.sp, out: '', helper: h.key };
    const nm = D.dex[h.sp].n;
    G.toast({ title: `A Super XXL ${nm} has come to see you!`, text: `${h.what} It is friendly: right-click it to throw a ball and it lets itself be caught at once. Catching it opens ${h.opens}.`, icon: Sprites.still(h.sp, false) || Sprites.icon(h.sp), tone: 'rare', dur: 10 });
    Sound.play('alert', { x: G.W / 2 });
    G.touch();
    return a;
  }
  /** a helper was caught: it does not go to the team or the Box (called by G.catch in src/game.js) */
  function helperCaught(a, b) {
    const h = helperDef(a.ev && a.ev.helper);
    if (!h) return false;
    if (cur && cur.a === a) cur.out = 'caught';
    const x = a.x, y = a.y - a.h * 0.5;
    FX.sparkle(x, y, 24, '#ffe14d', a.w * 0.6); FX.ring(x, y, 6, a.w + 80, '#ffffff', 0.8, 4);
    FX.text(U.clamp(x, 160, Math.max(160, G.W - 160)), Math.max(40, y - 30), `"${h.yes}"`, { col: '#fff6a8', size: 13, dur: 4.5, vy: -8 });      // its parting words, where it stood
    G.save.stats.caught++; if (D.dex[h.sp].lg) G.save.stats.legend = (G.save.stats.legend || 0) + 1;
    a.ev = null;
    if (G.trainerTarget === a) G.trainerTarget = null;
    G.removeActor(a);
    Sound.play('caught', { x: b ? b.x : x });
    grant(h, 'caught');
    if (typeof Visitors !== 'undefined') Visitors.helper(h.key);      // it goes home with the Trainers who are visiting as well
    return true;
  }
  /** what a helper on the screen does besides strolling: it speaks now and then, and after a while it goes (and comes back) */
  function helperAI(a, dt) {
    const ev = a.ev, h = helperDef(ev.helper);
    ev.talk -= dt;
    if (ev.talk <= 0 && !a.hops && !a.balled) { ev.talk = U.rand(9, 13); G.say(a, `"${h.lines[ev.line % h.lines.length]}"`, { col: '#fff6a8', size: 13 }); ev.line++; }
  }
  function stepHelpers(dt) {
    if (!G.save || HELPERS.every((h) => hasHelper(h.key))) return;
    if (helperIn === null) helperIn = HELP_FIRST;
    if (cur || G.set.paused || !Sprites.ready()) return;
    helperIn -= dt;
    if (helperIn > 0) return;
    const next = HELPERS.find((h) => !hasHelper(h.key));
    helperIn = U.rand(HELP_BACK[0], HELP_BACK[1]);         // should it leave uncaught, this is when the next one tries
    startHelper(next.key);
  }

  function stepVisits(dt) {
    const f = EVERY[G.set.legendEvents] === undefined ? 'rare' : G.set.legendEvents;
    if (f !== freq) { const first = !freq; freq = f; nextIn = EVERY[f] ? gap(f) * (first ? U.rand(0.35, 1) : 1) : null; }
    if (cur) {
      const a = cur.a;
      if (a.state === 'faint' && !cur.out) { cur.out = 'beaten'; G.toast({ title: `${D.dex[cur.sp].n} was beaten and vanished.`, text: 'It will be back one day.', icon: Sprites.icon(cur.sp), tone: 'info' }); }
      if (a.gone || !a.ev) { const helper = !!cur.helper; cur = null; if (!helper && EVERY[freq]) nextIn = gap(freq); }      // (a helper's visit does not put the legendaries' clock back)
      return;
    }
    if (nextIn === null || G.set.paused || !Sprites.ready()) return;
    nextIn -= dt;
    if (nextIn <= 0) { nextIn = gap(freq); start(); }
  }

  function update(dt) { stepWeather(dt); stepHelpers(dt); stepVisits(dt); }
  function reset() { cur = null; freq = ''; weatherFreq = -1; fixed = 'off'; helperIn = null; }
  /** for the Pokédex window */
  const view = () => (active() ? { kind: cur.kind, sp: cur.sp, name: D.dex[cur.sp].n, helper: cur.helper || '' } : null);
  /** which helpers are here: { rotom, mewtwo, porygonz } (for the Pokédex window, which shows their buttons) */
  const helperView = () => Object.fromEntries(HELPERS.map((h) => [h.key, G.save ? hasHelper(h.key) : false]));
  /** caught on somebody else's field while visiting: it is here from now on too (once; a visitor of its own that is on the way stays away) */
  function visitHelper(key, from) {
    const h = helperDef(key);
    if (!h || !G.save || hasHelper(h.key)) return false;
    if (cur && cur.a && cur.a.ev && cur.a.ev.helper === h.key && !cur.a.gone) { cur.out = 'caught'; cur.a.ev = null; G.removeActor(cur.a); }
    grant(h, { from });
    return true;
  }

  return { update, reset, view, start, startHelper, helperCaught, visitHelper, hasHelper, helperView, HELPERS, startWeather, weatherLabel, ai, pet, catchMult, brokeFree, caught, tag, temper, active, WEATHER_MIN, EVERY, KINDS };
})();
