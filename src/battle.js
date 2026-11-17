// Screen Trainer — battle rules: move selection, damage, status conditions, stat stages,
// weather, terrain, hazards, screens, and how each move plays out on screen.
// Held items plug in through the Items.* hooks; sounds through snd().
'use strict';

const Battle = (() => {
  const D = DATA;
  const WEATHER = { 'rain-dance': 'rain', 'sunny-day': 'sun', sandstorm: 'sand', hail: 'hail', snowscape: 'snow', 'chilly-reception': 'snow' };
  const WEATHER_TEXT = { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', sand: 'A sandstorm kicked up!', hail: 'It started to hail!', snow: 'It started to snow!' };
  const TERRAIN = { 'electric-terrain': 'electric', 'grassy-terrain': 'grass', 'misty-terrain': 'fairy', 'psychic-terrain': 'psychic' };
  const HAZARD = { spikes: ['spike', 'ground'], 'toxic-spikes': ['tspike', 'poison'], 'stealth-rock': ['rock', 'rock'], 'sticky-web': ['web', 'bug'] };
  const SCREEN = { reflect: '#ffb060', 'light-screen': '#fff27a', 'aurora-veil': '#9af0ff', safeguard: '#b8ffb0', mist: '#e8f4ff' };
  const PROTECT = new Set(['protect', 'detect', 'kings-shield', 'spiky-shield', 'baneful-bunker', 'obstruct', 'silk-trap', 'burning-bulwark', 'max-guard', 'endure']);
  const NOTHING = new Set(['splash', 'celebrate', 'hold-hands', 'happy-hour']);
  const RECHARGE = new Set(['hyper-beam', 'giga-impact', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'rock-wrecker', 'roar-of-time', 'prismatic-laser', 'meteor-assault', 'eternabeam']);
  const CHARGE = { 'solar-beam': 'glow', 'solar-blade': 'glow', 'sky-attack': 'glow', 'razor-wind': 'glow', 'skull-bash': 'glow', 'meteor-beam': 'glow', 'electro-shot': 'glow', 'freeze-shock': 'glow', 'ice-burn': 'glow', geomancy: 'glow',
    fly: 'air', bounce: 'air', 'sky-drop': 'air', dig: 'under', dive: 'under', 'phantom-force': 'under', 'shadow-force': 'under' };
  const SELFKO = new Set(['explosion', 'self-destruct', 'misty-explosion', 'memento', 'final-gambit', 'healing-wish', 'lunar-dance']);
  const SKY = /^(thunder|thunderbolt|thunder-shock|rock-slide|rock-tomb|rock-throw|stone-edge|avalanche|icicle-crash|draco-meteor|smack-down|ancient-power|judgment|doom-desire|future-sight|thunder-cage|rising-voltage|rock-blast|power-gem|diamond-storm|sacred-fire|hurricane|sky-attack)$/;
  const BEAM = /beam|ray|cannon|pump|flamethrower|blizzard|breath|-gun|blast|pulse|laser|overheat|hyper-voice|psychic$|fire-spin|incinerate|ember|discharge|eruption|water-spout|moonblast|dazzling/;
  const MAIN = { burn: 'brn', freeze: 'frz', paralysis: 'par', poison: 'psn', sleep: 'slp' };
  const AIL_TEXT = { brn: 'was burned!', frz: 'was frozen solid!', par: 'is paralyzed!', psn: 'was poisoned!', slp: 'fell asleep!' };
  const AIL_COL = { brn: '#ff9a2e', frz: '#9ae8ff', par: '#ffe14d', psn: '#c070e0', slp: '#c8d0e8' };

  const lvl = (a) => G.blevel(a);
  const snd = (name, a, o) => { if (typeof Sound !== 'undefined') Sound.play(name, Object.assign({ x: a ? a.x : undefined }, o)); };
  const AIL_SND = { brn: 'brn', frz: 'frz', par: 'par', psn: 'psn', slp: 'slp' };
  const FIXED = {
    'sonic-boom': () => 20, 'dragon-rage': () => 40, 'seismic-toss': lvl, 'night-shade': lvl,
    psywave: (u) => Math.max(1, Math.floor(lvl(u) * U.rand(0.5, 1.5))),
    'super-fang': (u, t) => Math.max(1, Math.floor(t.mon.hp / 2)), 'natures-madness': (u, t) => Math.max(1, Math.floor(t.mon.hp / 2)), ruination: (u, t) => Math.max(1, Math.floor(t.mon.hp / 2)),
  };

  function powerOf(u, t, mv) {
    const k = mv.k, hpR = u.mon.hp / Mon.maxHp(u.mon);
    switch (k) {
      case 'return': return u.side === 'team' ? Math.max(1, Math.floor(u.mon.aff / 2.5)) : 60;
      case 'frustration': return u.side === 'team' ? Math.max(1, Math.floor((255 - u.mon.aff) / 2.5)) : 60;
      case 'flail': case 'reversal': return hpR < 0.04 ? 200 : hpR < 0.1 ? 150 : hpR < 0.2 ? 100 : hpR < 0.35 ? 80 : hpR < 0.69 ? 40 : 20;
      case 'eruption': case 'water-spout': case 'dragon-energy': return Math.max(1, Math.floor(150 * hpR));
      case 'facade': return u.mon.st ? 140 : 70;
      case 'hex': return t && t.mon.st ? 130 : 65;
      case 'venoshock': return t && t.mon.st === 'psn' ? 130 : 65;
      case 'brine': return t && t.mon.hp * 2 <= Mon.maxHp(t.mon) ? 130 : 65;
      case 'weather-ball': return G.weather ? 100 : 50;
      case 'magnitude': return U.pick([10, 30, 50, 50, 70, 70, 70, 90, 90, 110, 150]);
      case 'acrobatics': return 110;
      default: return mv.p || 60;
    }
  }

  function supported(mv) {
    if (mv.c !== 1) return true;
    if (mv.cat === 1 || mv.cat === 2 || mv.cat === 3 || mv.cat === 5 || mv.cat === 12) return true;
    const k = mv.k;
    return !!(WEATHER[k] || TERRAIN[k] || HAZARD[k] || SCREEN[k] || PROTECT.has(k) || EXTRA[k] || mv.sc || ALLY_HEAL[k]);
  }

  function moveStyle(mv) {
    if (mv.c === 1) return 'status';
    if (mv.tg === 9 || mv.tg === 11 || mv.tg === 14) return 'wave';
    if (mv.f && mv.f.includes('contact')) return 'dash';
    if (SKY.test(mv.k)) return 'sky';
    if (BEAM.test(mv.k) || (mv.f && mv.f.includes('pulse'))) return 'beam';
    return 'shot';
  }

  function interval(u) {
    let iv = U.clamp(3.0 - Mon.species(u.mon).s[5] / 90, 1.35, 2.9);
    iv *= U.clamp(1 - 0.07 * u.stages[5], 0.6, 1.5);
    if (u.mon.st === 'par') iv *= 1.5;
    return (iv * Items.haste(u) * U.rand(0.9, 1.15)) / (G.moveRate ? G.moveRate() : 1);      // Options > "Move use speed"
  }

  // ---------------------------------------------------------------- stat stages / status / healing
  function changeStage(a, statId, delta, src) {
    const i = statId - 1;
    if (i < 1 || i > 7 || !G.alive(a)) return false;
    if (delta < 0 && src && src.side !== a.side && G.zones.some((z) => z.key === 'mist' && z.side === a.side && G.inZone(a, z))) { G.say(a, 'Protected by Mist!', { col: '#e8f4ff', size: 11 }); return false; }
    const before = a.stages[i];
    a.stages[i] = U.clamp(before + delta, -6, 6);
    if (a.stages[i] === before) return false;
    const up = delta > 0, c = G.center(a);
    if (G.verbose()) G.say(a, `${Mon.STAT_NAMES[i]} ${up ? (delta > 1 ? 'rose sharply!' : 'rose!') : delta < -1 ? 'harshly fell!' : 'fell!'}`, { col: up ? '#ffb86b' : '#8ab8ff', size: 11, dy: -10 });
    for (let n = 0; n < 6; n++) FX.part({ x: c.x + U.rand(-a.w * 0.3, a.w * 0.3), y: c.y + (up ? a.h * 0.4 : -a.h * 0.4), vx: 0, vy: up ? -120 : 120, life: 0.5, size: 4, col: up ? '#ffb86b' : '#8ab8ff', shape: 'spark', drag: 0.5 });
    snd(up ? 'statUp' : 'statDown', a, { vol: 0.6 });
    return true;
  }

  function heal(a, n) {
    if (!G.alive(a)) return 0;
    const mh = Mon.maxHp(a.mon), before = a.mon.hp;
    a.mon.hp = Math.min(mh, a.mon.hp + Math.max(1, Math.floor(n)));
    const got = a.mon.hp - before;
    if (got > 0) { const c = G.center(a); FX.sparkle(c.x, c.y, 4, '#9cf07a', a.w * 0.3); if (G.verbose()) FX.text(c.x, c.y - 10, '+' + got, { col: '#9cf07a', size: 12 }); }
    return got;
  }

  // ---- healing others (0.9.6, owner's list 11-16 update 8). Heal Pulse and Floral Healing mend one hurt ally (until
  // 0.9.6 they were aimed at the foe like any other move and mended the foe); Life Dew, Jungle Healing and Lunar Blessing
  // mend every ally near by. In a fight they are chosen when an ally is badly hurt (chooseMove); out of a fight mend() is
  // asked now and then by src/game.js, and also uses Pollen Puff on a teammate and a Pokémon's own healing moves.
  const ALLY_HEAL = { 'heal-pulse': [50, 'one'], 'floral-healing': [50, 'one'], 'life-dew': [25, 'all'], 'jungle-healing': [25, 'all'], 'lunar-blessing': [25, 'all'] };
  const REACH = { fight: 420, calm: 700 };
  const ratio = (a) => a.mon.hp / Math.max(1, Mon.maxHp(a.mon));
  /** the allies this move would mend, worst first (for a one-ally move never the user itself) */
  function mendable(u, k, reach) {
    const one = ALLY_HEAL[k] ? ALLY_HEAL[k][1] === 'one' : k === 'pollen-puff';
    return G.alliesOf(u).filter((a) => G.alive(a) && a.state !== 'captured' && !a.balled && (!one || a !== u) && U.dist(a, u) < reach && a.mon.hp < Mon.maxHp(a.mon)).sort((a, b) => ratio(a) - ratio(b));
  }
  function allyHeal(u, mv, reach, pct) {
    const k = mv.k, list = mendable(u, k, reach), group = ALLY_HEAL[k] && ALLY_HEAL[k][1] === 'all';
    if (!list.length) return false;
    const c = G.center(u);
    let did = false;
    for (const x of group ? list : [list[0]]) {
      if (x !== u) { const tc = G.center(x); FX.beam(c.x, c.y, tc.x, tc.y, G.typeName(mv.t), 0.32, 8); }
      if (heal(x, (Mon.maxHp(x.mon) * pct) / 100) > 0) { did = true; const tc = G.center(x); FX.sparkle(tc.x, tc.y, 8, '#b8ffb0', x.w * 0.4); }
    }
    if (did) snd('heal', u);
    return did;
  }
  /** out of a fight: mend a hurt teammate, or itself, with a move it knows. Returns the move's name, or '' when there was
   *  nobody to mend or it knows no such move. */
  function mend(u) {
    if (!G.alive(u) || u.busy) return '';
    const mine = u.mon.moves.map((id) => D.moves[id]).filter(Boolean);
    for (const mv of mine) {
      const h = ALLY_HEAL[mv.k] || (mv.k === 'pollen-puff' ? [50, 'one'] : null);
      if (!h) continue;
      const w = mendable(u, mv.k, REACH.calm)[0];
      if (w && ratio(w) < 0.6 && allyHeal(u, mv, REACH.calm, h[0])) return mv.n;
    }
    if (ratio(u) < 0.5) for (const mv of mine) {
      if (mv.tg === 7 && mv.cat === 3 && mv.hl && heal(u, (Mon.maxHp(u.mon) * mv.hl) / 100) > 0) { snd('heal', u); return mv.n; }
    }
    return '';
  }
  function inflict(t, ail, u, mv) {
    if (!G.alive(t)) return false;
    const guarded = G.zones.some((z) => G.inZone(t, z) && ((z.key === 'safeguard' && z.side === t.side) || z.key === 'terrain-fairy'));
    const fail = (why) => { if (mv && mv.c === 1 && G.verbose()) G.say(t, why || 'But it failed!', { col: '#c8c8d0', size: 11 }); return false; };
    if (MAIN[ail]) {
      const code = MAIN[ail];
      if (t.mon.st) return fail();
      if (guarded) return fail('Protected!');
      if (code === 'brn' && G.hasType(t, 'fire')) return fail('No effect');
      if (code === 'frz' && (G.hasType(t, 'ice') || (G.weather && G.weather.kind === 'sun'))) return fail('No effect');
      if (code === 'par' && G.hasType(t, 'electric')) return fail('No effect');
      if (code === 'psn' && (G.hasType(t, 'poison') || G.hasType(t, 'steel'))) return fail('No effect');
      if (code === 'slp' && G.zoneAt(t, 'terrain-electric')) return fail('Protected!');
      t.mon.st = code;
      if (code === 'slp') t.vol.slp = 1 + U.rint(3);
      G.say(t, AIL_TEXT[code], { col: AIL_COL[code], size: 12, dy: -8 });
      snd(AIL_SND[code], t);
      Items.berryCheck(t);
      return true;
    }
    if (ail === 'confusion') { if (t.vol.conf || guarded) return fail(); t.vol.conf = 2 + U.rint(4); G.say(t, 'became confused!', { col: '#ffd0e4', size: 12, dy: -8 }); snd('confuse', t); Items.berryCheck(t); return true; }
    if (ail === 'trap') {
      if (t.vol.trap) return false;
      const type = mv ? G.typeName(mv.t) : 'normal';
      t.vol.trap = { n: 4 + U.rint(2), type };
      G.addZone({ kind: 'trap', x: t.x, y: t.y, r: Math.max(30, t.w * 0.55), dur: 15, type, follow: t, side: u ? u.side : null });
      G.say(t, 'was trapped!', { col: FX.col(type, 0), size: 12, dy: -8 });
      snd('trap', t);
      return true;
    }
    if (ail === 'leech-seed') { if (t.vol.seed || G.hasType(t, 'grass')) return fail('No effect'); t.vol.seed = u; G.say(t, 'was seeded!', { col: '#9cf07a', size: 12, dy: -8 }); snd('seed', t); return true; }
    if (ail === 'infatuation') { if (t.vol.love) return fail(); t.vol.love = 3; FX.hearts(t.x, t.y - t.h, 4); G.say(t, 'fell in love!', { col: '#ff8fb3', size: 12, dy: -8 }); snd('love', t); return true; }
    if (ail === 'yawn') { G.say(t, 'grew drowsy...', { col: '#c8d0e8', size: 11 }); G.after(4, () => inflict(t, 'sleep', u, null)); return true; }
    return fail();
  }

  // ---------------------------------------------------------------- damage
  function resolveHit(u, t, mv, o = {}) {
    if (!G.alive(t) || t.state === 'captured' || t.state === 'leave') return 0;
    if (u.side === 'team' && t.side === 'wild' && G.handsOff(t)) return 0;      // the player's own target: hands off
    if (G.peaceful(t) || G.peaceful(u)) return 0;                               // a friendly visitor is never part of a fight
    const type = G.typeName(mv.t), c = G.center(t);
    if (t.vol.away) { if (G.verbose()) G.say(t, 'Avoided!', { col: '#c8c8d0', size: 11 }); return 0; }
    if (t.vol.protect > G.now) { FX.ring(c.x, c.y, t.w * 0.3, t.w * 0.75, '#9af0ff', 0.35, 3, 0.2); G.say(t, 'Protected!', { col: '#9af0ff', size: 11 }); snd('protect', t, { vol: 0.6 }); return 0; }
    if (mv.a && !o.sure) {
      const st = u.stages[6] - t.stages[7];
      let acc = (mv.a / 100) * (st >= 0 ? (3 + st) / 3 : 3 / (3 - st)) * Items.accuracy(u, t);
      const w = G.weather && G.weather.kind;
      if ((w === 'rain' && (mv.k === 'thunder' || mv.k === 'hurricane')) || ((w === 'hail' || w === 'snow') && mv.k === 'blizzard')) acc = 9;
      if (mv.cat === 9) acc = lvl(u) < lvl(t) ? 0 : 0.3;
      if (t.side === 'team' && Mon.hearts(t.mon) >= 4 && U.chance(0.1)) acc = 0;
      if (!U.chance(acc)) { G.say(t, 'Missed!', { col: '#c8c8d0', size: 11 }); return 0; }
    }
    const eff = mv.k === 'struggle' ? 1 : Mon.typeMult(mv.t, G.types(t));
    if (eff === 0) { G.say(t, 'No effect', { col: '#c8c8d0', size: 11 }); return 0; }

    let dmg, crit = false, combo = false;
    if (mv.cat === 9) { dmg = t.mon.hp; G.say(t, "It's a one-hit KO!", { col: '#ff6b6b', size: 13 }); }
    else if (FIXED[mv.k]) dmg = FIXED[mv.k](u, t);
    else {
      const L = lvl(u), us = G.bstats(u), ts = G.bstats(t), phys = mv.c === 2, ai = phys ? 1 : 3, di = phys ? 2 : 4;
      let cr = mv.cr ? 1 / 8 : 1 / 24;
      if (u.side === 'team' && Mon.hearts(u.mon) >= 5) cr *= 2;
      if (u.vol.focus) cr *= 4;
      crit = U.chance(cr * Items.crit(u));
      const A = us[ai] * G.stageMult(crit ? Math.max(0, u.stages[ai]) : u.stages[ai]);
      let Df = ts[di] * G.stageMult(crit ? Math.min(0, t.stages[di]) : t.stages[di]) * Items.guard(t, phys);
      const w = G.weather && G.weather.kind;
      if (w === 'sand' && !phys && G.hasType(t, 'rock')) Df *= 1.5;
      if (w === 'snow' && phys && G.hasType(t, 'ice')) Df *= 1.5;
      let d = Math.floor(Math.floor((Math.floor((2 * L) / 5 + 2) * powerOf(u, t, mv) * A) / Df) / 50) + 2;
      if (G.types(u).includes(mv.t)) d *= 1.5;
      d *= eff * (crit ? 1.5 : 1) * U.rand(0.85, 1) * Items.power(u, mv, type, phys, eff);
      if (phys && u.mon.st === 'brn' && mv.k !== 'facade') d *= 0.5;
      if (w === 'rain') d *= type === 'water' ? 1.5 : type === 'fire' ? 0.5 : 1;
      if (w === 'sun') d *= type === 'fire' ? 1.5 : type === 'water' ? 0.5 : 1;
      // a terrain that a move called, or ground of the move's own type under the user's feet: the field's ground where
      // there is a field (src/field.js), or the mark a move of that type left behind (G.onGroundOf in src/game.js)
      if (((type === 'electric' || type === 'grass' || type === 'psychic') && G.zoneAt(u, 'terrain-' + type)) || (G.onGroundOf && G.onGroundOf(u, type))) d *= 1.3;
      if (type === 'dragon' && G.zoneAt(t, 'terrain-fairy')) d *= 0.5;
      if (!crit) {
        for (const z of G.zones) {
          if (z.kind !== 'screen' || z.side !== t.side || !G.inZone(t, z)) continue;
          if (z.key === 'aurora-veil' || (phys && z.key === 'reflect') || (!phys && z.key === 'light-screen')) { d *= 0.5; break; }
        }
      }
      if (o.spread > 1) d *= 0.75;
      if (u.side === 'team' && u.obey) d *= 1 + 0.03 * (G.leadLL || 0);
      if (u.side === 'team' && t.lastHitBy && t.lastHitBy !== u && t.lastHitBy.side === 'team' && G.now - t.lastHit < 1.4) {
        const bond = u.mon.bond[t.lastHitBy.mon.uid] || 0;
        if (bond >= 15) { d *= 1 + bond / 300; combo = true; }
      }
      dmg = Math.max(1, Math.floor(d));
    }
    const noKO = o.noKO || mv.k === 'false-swipe' || mv.k === 'hold-back' || (u.side === 'team' && u.obey && t.side === 'wild' && G.wantCatch(t));
    const dealt = G.hurt(t, dmg, u, { type, crit, eff, noKO, combo });
    if (dealt > 0) { const ic = G.center(t); FX.impact(ic.x, ic.y, type, { power: mv.p, crit, eff, size: t.w }); }      // what the hit looks like, by type (src/fx.js)
    if (dealt <= 0) return 0;

    if (G.alive(t)) {
      if (mv.ail && U.chance((mv.ac || 100) / 100)) inflict(t, mv.ail, u, mv);
      if (mv.cat === 6 && mv.sc && U.chance((mv.sch || 100) / 100)) for (const [s, ch] of mv.sc) changeStage(t, s, ch, u);
      if (mv.fl && U.chance(mv.fl / 100)) { t.vol.flinch = true; }
    }
    if (mv.cat === 7 && mv.sc && U.chance((mv.sch || 100) / 100)) for (const [s, ch] of mv.sc) changeStage(u, s, ch, u);
    Items.afterHit(u, t, dealt, mv);
    if (mv.dr > 0) heal(u, (dealt * mv.dr) / 100);
    else if (mv.dr < 0 && G.alive(u)) { G.hurt(u, Math.max(1, Math.floor((dealt * -mv.dr) / 100)), null, { type: 'normal', dot: true }); }
    if (!o.noZone && G.leaveMark) G.leaveMark(t.x, t.y, type, mv);      // every damaging move leaves ground of its type where it lands, for a while
    // lingering patch where a move with a status side effect landed
    if (mv.ail && (MAIN[mv.ail] || mv.ail === 'confusion') && mv.c !== 1 && !o.noZone) {
      G.addZone({ kind: 'residue', x: t.x, y: t.y, r: 34 + (mv.p || 60) * 0.35, dur: 5 + (mv.p || 60) / 40, type, side: u.side, ail: mv.ail, ac: Math.max(8, Math.min(40, mv.ac || 30)) });
    }
    return dealt;
  }

  // ---------------------------------------------------------------- status moves
  const EXTRA = {
    rest(u) { if (u.mon.hp >= Mon.maxHp(u.mon)) return false; u.mon.st = null; heal(u, 9999); u.mon.st = 'slp'; u.vol.slp = 2; G.say(u, 'went to sleep!', { col: AIL_COL.slp, size: 12 }); return true; },
    teleport(u) {
      const c = G.center(u); FX.ring(c.x, c.y, u.w * 0.6, 4, '#ffd0e4', 0.3, 3); FX.sparkle(c.x, c.y, 8, '#ffd0e4', u.w * 0.4); snd('teleport', u);
      if (u.side === 'wild') { G.flee(u, 'teleported away!', true); return true; }
      const b = G.bounds(u); u.x = U.rand(b.x0, b.x1); u.y = U.rand(b.y0, b.y1); u.tx = u.x; u.ty = u.y; u.warped = true; FX.sparkle(u.x, u.y - u.h * 0.5, 8, '#ffd0e4', u.w * 0.4); return true;
    },
    haze() { for (const a of G.actors) a.stages.fill(0); FX.text(G.W / 2, G.H * 0.3, 'All stat changes were eliminated!', { col: '#d8d8e8', size: 14, dur: 1.8 }); return true; },
    'heal-bell'(u) { for (const a of G.alliesOf(u)) a.mon.st = null; G.say(u, 'A bell chimed!', { col: '#fff6a8', size: 12 }); return true; },
    aromatherapy(u) { for (const a of G.alliesOf(u)) a.mon.st = null; G.say(u, 'A soothing aroma wafted!', { col: '#9cf07a', size: 12 }); return true; },
    'belly-drum'(u) { const mh = Mon.maxHp(u.mon); if (u.mon.hp <= mh / 2) return false; u.mon.hp -= Math.floor(mh / 2); u.stages[1] = 6; G.say(u, 'maximized its Attack!', { col: '#ffb86b', size: 12 }); return true; },
    'pain-split'(u, t) { if (!t || !G.alive(t)) return false; const avg = Math.floor((u.mon.hp + t.mon.hp) / 2); u.mon.hp = Math.min(Mon.maxHp(u.mon), avg); t.mon.hp = Math.max(1, Math.min(Mon.maxHp(t.mon), avg)); G.say(u, 'The battlers shared their pain!', { size: 11 }); return true; },
    'aqua-ring'(u) { u.vol.regen = 6; G.say(u, 'surrounded itself with a veil of water!', { col: '#5aa9f0', size: 11 }); return true; },
    ingrain(u) { u.vol.regen = 8; G.say(u, 'planted its roots!', { col: '#78c850', size: 11 }); return true; },
    wish(u) { G.say(u, 'made a wish!', { col: '#fff6a8', size: 11 }); G.after(5, () => heal(u, Mon.maxHp(u.mon) / 2)); return true; },
    'focus-energy'(u) { if (u.vol.focus) return false; u.vol.focus = true; G.say(u, 'is getting pumped!', { col: '#ffb86b', size: 11 }); return true; },
    tailwind(u) { for (const a of G.alliesOf(u)) changeStage(a, 6, 1, u); return true; },
    defog() { G.zones = G.zones.filter((z) => z.kind !== 'hazard' && z.kind !== 'screen'); FX.text(G.W / 2, G.H * 0.3, 'The field was cleared!', { size: 14 }); return true; },
  };

  function doStatus(u, t, mv) {
    const k = mv.k, type = G.typeName(mv.t), c = G.center(u);
    if (NOTHING.has(k)) { G.say(u, 'But nothing happened!', { col: '#c8c8d0', size: 11 }); return; }
    if (ALLY_HEAL[k]) { if (!allyHeal(u, mv, REACH.fight, mv.hl || ALLY_HEAL[k][0])) G.say(u, 'But it failed!', { col: '#c8c8d0', size: 11 }); return; }      // (0.9.6) an ally, not the foe
    if (WEATHER[k]) { G.setWeather(WEATHER[k], 30); FX.text(G.W / 2, G.H * 0.25, WEATHER_TEXT[WEATHER[k]], { col: '#eaf2ff', size: 15, dur: 2 }); FX.ring(c.x, c.y, 10, Math.max(G.W, G.H) * 0.6, '#eaf2ff', 1.1, 3); snd(WEATHER[k], u); return; }
    if (TERRAIN[k]) {
      G.zones = G.zones.filter((z) => z.kind !== 'terrain');
      G.addZone({ kind: 'terrain', key: 'terrain-' + TERRAIN[k], x: u.x, y: u.y - u.h * 0.3, r: Math.min(360, G.H * 0.42), dur: 25, type: TERRAIN[k] });
      G.say(u, mv.n + ' spread out!', { col: FX.col(TERRAIN[k], 0), size: 12 });
      const R = Math.min(360, G.H * 0.42); FX.ring(u.x, u.y - u.h * 0.3, 12, R, FX.col(TERRAIN[k], 0), 0.7, 5); FX.ring(u.x, u.y - u.h * 0.3, 6, R * 0.7, FX.col(TERRAIN[k], 1), 0.9, 3); FX.burst(u.x, u.y - u.h * 0.3, TERRAIN[k], 22, 320, 5, 0.8); snd('terrain', u); return;
    }
    if (HAZARD[k]) {
      const [sub, ty] = HAZARD[k], p = t && G.targetable(t) ? t : u;
      G.addZone({ kind: 'hazard', sub, key: 'hz-' + sub, x: p.x, y: p.y, r: 130, dur: 30, type: ty, side: u.side });
      FX.burst(p.x, p.y - 10, ty, 14, 200, 4); FX.ring(p.x, p.y, 8, 130, FX.col(ty, 1), 0.45, 3); snd(sub === 'web' ? 'web' : 'hazard', p); return;
    }
    if (SCREEN[k]) { G.addZone({ kind: 'screen', key: k, col: SCREEN[k], x: u.x, y: u.y - u.h * 0.4, r: 200, dur: 25, type, side: u.side }); G.say(u, mv.n + '!', { col: SCREEN[k], size: 12 }); FX.ring(u.x, u.y - u.h * 0.4, 20, 200, SCREEN[k], 0.6, 5, 0.12); snd('screen', u); return; }
    if (PROTECT.has(k)) { u.vol.protect = G.now + 2.4; FX.ring(c.x, c.y, 8, u.w * 0.75, '#9af0ff', 0.5, 3, 0.2); snd('protect', u); return; }
    if (EXTRA[k]) { if (EXTRA[k](u, t, mv) === false) G.say(u, 'But it failed!', { col: '#c8c8d0', size: 11 }); return; }
    if (mv.cat === 12) {
      if (!t || !G.targetable(t)) return;
      const tc = G.center(t); FX.burst(tc.x, tc.y, 'flying', 16, 300, 5);
      if (t.side === 'wild') G.flee(t, 'was driven off!', false);
      else { const a = Math.atan2(t.y - u.y, t.x - u.x); t.kx = Math.cos(a) * 900; t.ky = Math.sin(a) * 900; t.cd += 2; }
      return;
    }
    const selfish = [7, 4, 5, 13, 15, 3].includes(mv.tg);
    let list;
    if (selfish) list = mv.tg === 13 || mv.tg === 15 || mv.tg === 4 ? G.alliesOf(u).filter((a) => U.dist(a, u) < 420) : [u];
    else if (mv.tg === 11 || mv.tg === 9 || mv.tg === 14 || mv.tg === 6) list = G.enemiesOf(u).filter((a) => U.dist(a, u) < 420);
    else list = t && G.targetable(t) ? [t] : [];
    let did = false;
    for (const x of list) {
      if (x.side !== u.side) {
        if (x.vol.protect > G.now) { G.say(x, 'Protected!', { col: '#9af0ff', size: 11 }); continue; }
        if (mv.a && !U.chance(mv.a / 100)) { G.say(x, 'Missed!', { col: '#c8c8d0', size: 11 }); did = true; continue; }
        if (k === 'thunder-wave' && Mon.typeMult(mv.t, G.types(x)) === 0) { G.say(x, 'No effect', { col: '#c8c8d0', size: 11 }); did = true; continue; }
      }
      if (mv.cat === 1 || mv.cat === 5) { inflict(x, mv.ail, u, mv); did = true; }
      if (mv.sc) for (const [s, ch] of mv.sc) { if (changeStage(x, s, ch, u)) did = true; }
      if (mv.cat === 3 && mv.hl) { if (heal(x, (Mon.maxHp(x.mon) * mv.hl) / 100) > 0) { did = true; snd('heal', x); } }
    }
    if (!did) G.say(u, 'But it failed!', { col: '#c8c8d0', size: 11 });
  }

  // ---------------------------------------------------------------- move choice
  function chooseMove(u, t) {
    const smart = u.side === 'team' ? u.obey : U.chance(0.55);
    const mine = u.mon.moves.map((id) => D.moves[id]).filter(Boolean);
    const hpR = u.mon.hp / Mon.maxHp(u.mon);
    const score = (mv) => {
      if (!supported(mv)) return smart ? 0 : 6;
      const k = mv.k;
      if (mv.c !== 1) {
        const eff = Mon.typeMult(mv.t, G.types(t));
        if (eff === 0) return 0.5;
        let s = (mv.cat === 9 ? 45 : FIXED[k] ? 40 : powerOf(u, t, mv)) * eff * (G.types(u).includes(mv.t) ? 1.5 : 1) * (mv.a ? mv.a / 100 : 1) * (mv.hits ? 3 : 1);
        if (SELFKO.has(k)) s *= hpR < 0.25 ? 0.5 : 0.03;
        if (mv.tg === 9 && smart && G.alliesOf(u).some((a) => a !== u && U.dist(a, u) < 300)) s *= 0.4;
        if (CHARGE[k]) s *= 0.8;
        return s;
      }
      if (NOTHING.has(k)) return smart ? 0 : 5;
      if (ALLY_HEAL[k]) { const w = mendable(u, k, REACH.fight)[0]; return !w ? 0 : ratio(w) < 0.45 ? 85 : ratio(w) < 0.7 ? 22 : 0; }      // (0.9.6) for a hurt ally, never for the foe
      if (WEATHER[k]) return G.weather && G.weather.kind === WEATHER[k] ? 0 : 40;
      if (TERRAIN[k]) return G.zones.some((z) => z.key === 'terrain-' + TERRAIN[k]) ? 0 : 38;
      if (HAZARD[k]) return G.zones.some((z) => z.key === 'hz-' + HAZARD[k][0] && z.side === u.side) ? 0 : 36;
      if (SCREEN[k]) return G.zones.some((z) => z.key === k && z.side === u.side) ? 0 : 36;
      if (PROTECT.has(k)) return 10;
      if (k === 'rest') return hpR < 0.35 ? 70 : 0;
      if (EXTRA[k]) return k === 'teleport' ? (u.side === 'wild' ? 4 : 0) : 14;
      if (mv.cat === 12) return u.side === 'wild' ? 5 : smart ? 0 : 10;
      if (mv.cat === 3) return hpR < 0.45 ? 90 : hpR < 0.7 ? 25 : 0;
      if (mv.cat === 1 || mv.cat === 5) {
        if (MAIN[mv.ail]) return t.mon.st ? 0 : mv.ail === 'sleep' ? 60 : 48;
        if (mv.ail === 'confusion') return t.vol.conf ? 0 : 30;
        if (mv.ail === 'leech-seed') return t.vol.seed || G.hasType(t, 'grass') ? 0 : 36;
        return 12;
      }
      if (mv.sc) {
        const selfish = [7, 4, 5, 13, 15, 3].includes(mv.tg), who = selfish ? u : t;
        const [s, ch] = mv.sc[0], cur = who.stages[s - 1] || 0;
        return selfish ? (cur >= 2 ? 4 : 32) : cur <= -2 ? 4 : 24;
      }
      return 8;
    };
    const mv = U.wpick(mine, (m) => { const s = score(m); return smart ? s * s : s + 8; });
    const best = mv && (smart ? score(mv) > 0 : true) ? mv : null;
    return best || mine.find((m) => m.c !== 1) || D.moves[165];
  }

  // ---------------------------------------------------------------- playing a move out on screen
  function lunge(u, t, onHit) {
    const dx = t.x - u.x, dy = t.y - t.h * 0.3 - (u.y - u.h * 0.3), d = Math.hypot(dx, dy) || 1, reach = Math.min(d * 0.85, 260);
    u.lunge = { t: 0, dur: 0.13, back: 0.2, dx: (dx / d) * reach, dy: (dy / d) * reach, hit: onHit, done: false };
  }

  function shoot(u, t, mv, type, from) {
    const c = from || G.center(u);
    G.shots.push({ x: c.x, y: c.y, t, u, mv, type, sp: from ? 1100 : 640 + (mv.p || 60) * 2, life: 2.2, size: 5 + (mv.p || 60) / 16, lx: t.x, ly: t.y - t.h * 0.5, sound: !!(mv.f && mv.f.includes('sound')) });
  }

  function wave(u, mv, type) {
    const R = 150 + powerOf(u, null, mv) * 1.6, c = G.center(u), colr = FX.col(type, 1);
    FX.ring(c.x, u.y - u.h * 0.2, 20, R, colr, 0.6, 9); FX.ring(c.x, u.y - u.h * 0.2, 8, R * 0.8, FX.col(type, 0), 0.7, 4);
    FX.burst(c.x, u.y - 8, type, 26, R * 1.4, 5, 0.7);
    if (type === 'ground' || type === 'rock') for (const a of G.actors) if (U.dist(a, u) < R * 1.3) a.shake = 0.45;
    const list = (mv.tg === 9 || mv.tg === 14 ? G.actors.filter((a) => a !== u && G.targetable(a) && !G.peaceful(a) && !G.settled(a)) : G.enemiesOf(u)).filter((a) => U.dist(a, u) <= R + a.w * 0.3 && !(u.side === 'team' && G.handsOff(a)));
    for (const x of list) {
      G.after((U.dist(x, u) / R) * 0.42, () => {
        if (!G.alive(u) && !SELFKO.has(mv.k)) return;
        const xc = G.center(x); FX.burst(xc.x, xc.y, type, 10, 190, 4);
        resolveHit(u, x, mv, { spread: list.length });
      });
    }
  }

  function fire(u, t, mv) {
    const type = G.typeName(mv.t), sty = moveStyle(mv), st = FX.style(type);
    u.busy = true; u.hop = 0.22;
    if (G.set.moveNames !== false) G.say(u, mv.n, { col: st.c[0], size: 12, dur: 1 });
    if (typeof Sound !== 'undefined') Sound.move(mv, type, sty, u.x);
    let lead = mv.pr > 0 ? 0.1 : 0.24;
    if ((mv.p || 0) >= 90 && sty !== 'status') { const gc = G.center(u); FX.gather(gc.x, gc.y, type, u.w); }      // a strong move being readied (only at "Full chaos")
    const ch = CHARGE[mv.k];
    if (ch) {
      lead = 0.95;
      const c0 = G.center(u);
      for (let i = 0; i < 5; i++) G.after(i * 0.17, () => FX.puff(c0.x, c0.y, type, 4, u.w * 0.5, 4, 0.5));
      if (ch !== 'glow') { u.vol.away = ch; G.after(lead, () => { u.vol.away = null; }); }
    }
    const n = mv.hits ? (mv.hits[0] === mv.hits[1] ? mv.hits[0] : U.pick([2, 2, 2, 3, 3, 3, 4, 5].filter((x) => x >= mv.hits[0] && x <= mv.hits[1])) || mv.hits[0]) : 1;
    // still a fight? (the user may have been caught mid-move and now be on the target's side)
    const ok = () => G.alive(u) && u.state !== 'captured' && G.alive(t) && t.state !== 'captured' && u.side !== t.side;
    let total = lead;
    if (sty === 'status') {
      G.after(lead, () => { if (!G.alive(u) || u.state === 'captured') return; const c = G.center(u); FX.ring(c.x, c.y, 6, u.w * 0.6, st.c[1], 0.45, 3); FX.puff(c.x, c.y, type, 8, u.w * 0.35, 4, 0.6); doStatus(u, t, mv); });
      total += 0.35;
    } else if (sty === 'dash') {
      for (let i = 0; i < n; i++) G.after(lead + i * 0.36, () => { if (!ok()) return; lunge(u, t, () => { const c = G.center(t); FX.slash(c.x, c.y, type, undefined, Math.max(22, t.w * 0.3)); FX.burst(c.x, c.y, type, 9, 200, 4); resolveHit(u, t, mv); }); });
      total += n * 0.36 + 0.1;
    } else if (sty === 'shot') {
      for (let i = 0; i < n; i++) G.after(lead + i * 0.15, () => { if (ok()) shoot(u, t, mv, type); });
      total += n * 0.15 + 0.2;
    } else if (sty === 'beam') {
      G.after(lead, () => {
        if (!ok()) return;
        const a = G.center(u), b = G.center(t), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        FX.beam(a.x, a.y, b.x, b.y, type, 0.42, 7 + (mv.p || 60) / 11);
        for (let s = 0; s < d; s += 26) FX.puff(a.x + ((b.x - a.x) * s) / d, a.y + ((b.y - a.y) * s) / d, type, 1, 8, 4, 0.45);
        G.after(0.1, () => { if (!ok()) return; const c = G.center(t); FX.burst(c.x, c.y, type, 16, 240, 5); resolveHit(u, t, mv); });
      });
      total += 0.5;
    } else if (sty === 'sky') {
      for (let i = 0; i < n; i++) G.after(lead + i * 0.22, () => {
        if (!ok()) return;
        FX.ring(t.x, t.y - 4, t.w * 0.6, 6, st.c[1], 0.28, 2);
        G.after(0.26, () => {
          if (!ok()) return;
          const c = G.center(t);
          if (type === 'electric') { const sx = c.x + U.rand(-70, 70); FX.bolt(sx, -10, c.x, c.y, st.c[1], 0.26, 4); FX.bolt(sx + 12, -10, c.x, c.y, st.c[2], 0.2, 2); FX.burst(c.x, c.y, type, 18, 260, 5); resolveHit(u, t, mv); }
          else shoot(u, t, mv, type, { x: c.x + U.rand(-140, 140), y: c.y - Math.min(520, c.y + 30) });
        });
      });
      total += n * 0.22 + 0.45;
    } else {
      G.after(lead, () => { if (G.alive(u) && u.state !== 'captured') wave(u, mv, type); });
      total += 0.6;
    }
    G.after(total + 0.2, () => {
      u.busy = false;
      u.cd = interval(u) * (RECHARGE.has(mv.k) ? 2 : 1) * (mv.pr > 0 ? 0.7 : 1);
      if (SELFKO.has(mv.k) && G.alive(u) && u.state !== 'captured') { snd('explode', u); G.hurt(u, u.mon.hp, null, { type: 'normal', dot: true, quiet: true }); }
    });
  }

  /** one attack attempt: status checks first, then pick and play a move */
  function act(u, t) {
    const skip = (k = 1) => { u.cd = interval(u) * k; };
    if (u.vol.flinch) { u.vol.flinch = false; G.say(u, 'flinched!', { col: '#c8c8d0', size: 11 }); return skip(0.6); }
    const st = u.mon.st, c = G.center(u);
    if (st === 'slp') {
      u.vol.slp = (u.vol.slp === undefined ? 2 : u.vol.slp) - 1;
      if (u.vol.slp > 0) { FX.text(c.x + 12, c.y - u.h * 0.4, 'Zzz', { col: AIL_COL.slp, size: 13 }); return skip(); }
      u.mon.st = null; G.say(u, 'woke up!', { size: 11 });
    } else if (st === 'frz') {
      if (!U.chance(0.2)) { G.say(u, 'is frozen solid!', { col: AIL_COL.frz, size: 11 }); return skip(); }
      u.mon.st = null; G.say(u, 'thawed out!', { size: 11 });
    } else if (st === 'par' && U.chance(0.25)) { FX.burst(c.x, c.y, 'electric', 6, 90, 4); G.say(u, "is paralyzed! It can't move!", { col: AIL_COL.par, size: 11 }); return skip(); }
    if (u.vol.love) { u.vol.love--; if (U.chance(0.5)) { FX.hearts(c.x, c.y - u.h * 0.4, 2); G.say(u, 'is immobilized by love!', { col: '#ff8fb3', size: 11 }); return skip(); } }
    if (u.vol.conf) {
      u.vol.conf--;
      if (U.chance(0.33)) {
        const s = G.bstats(u), d = Math.floor(Math.floor((Math.floor((2 * lvl(u)) / 5 + 2) * 40 * s[1]) / s[2]) / 50) + 2;
        G.say(u, 'hurt itself in its confusion!', { col: '#ffd0e4', size: 11 });
        G.hurt(u, d, null, { type: 'normal', dot: true });
        return skip();
      }
    }
    fire(u, t, chooseMove(u, t));
  }

  /** end-of-turn effects, applied to every battler every few seconds */
  function endTurn(a) {
    if (!G.alive(a) || a.state === 'captured' || G.peaceful(a) || G.settled(a)) return;      // (a loitering wild Pokémon is out of the fight: nothing wears it down)
    // hands off: lingering damage (status, traps, weather) may wear the player's own target down, but never knocks it out
    const mine = a.side === 'wild' && G.handsOff(a);
    const mh = Mon.maxHp(a.mon), chip = (frac, type) => G.hurt(a, Math.max(1, Math.floor(mh * frac)), null, { type, dot: true, noKO: mine });
    const dead = () => !G.alive(a);
    if (a.mon.st === 'brn') { chip(1 / 16, 'fire'); if (dead()) return; }
    if (a.mon.st === 'psn') { chip(1 / 8, 'poison'); if (dead()) return; }
    if (a.vol.trap) {
      const tr = a.vol.trap;
      chip(1 / 8, tr.type); if (dead()) return;
      if (--tr.n <= 0) { a.vol.trap = null; for (const z of G.zones) if (z.kind === 'trap' && z.follow === a) z.t = z.dur; }
    }
    if (a.vol.seed) { if (!G.alive(a.vol.seed)) a.vol.seed = null; else { const seeder = a.vol.seed; heal(seeder, chip(1 / 8, 'grass')); if (dead()) return; } }
    if (a.vol.regen) { a.vol.regen--; heal(a, mh / 16); }
    Items.endTurn(a); if (dead()) return;
    const w = G.weather && !G.weather.natural && G.weather.kind;     // only weather a move called up hurts; the sky's own does not
    if (w === 'sand' && !['rock', 'ground', 'steel'].some((n) => G.hasType(a, n))) { chip(1 / 16, 'rock'); if (dead()) return; }
    if (w === 'hail' && !G.hasType(a, 'ice')) { chip(1 / 16, 'ice'); if (dead()) return; }
    for (const z of G.zones.slice()) {
      if (!G.inZone(a, z)) continue;
      if (z.key === 'terrain-grass') heal(a, mh / 16);
      if (z.kind === 'residue' && z.side !== a.side && !(z.side === 'team' && G.handsOff(a)) && !G.peaceful(a)) {
        if (z.type === 'fire') { chip(1 / 32, 'fire'); if (dead()) return; }
        if (z.ail && U.chance(z.ac / 100)) inflict(a, z.ail, null, null);
      }
    }
    if (a.side === 'team' && a.mon.st && Mon.hearts(a.mon) >= 4 && U.chance(0.2)) { a.mon.st = null; G.say(a, 'shook it off for you!', { col: '#ff8fb3', size: 11 }); }
  }

  /** entry hazards trigger once per creature that walks in */
  function hazard(a, z) {
    const mh = Mon.maxHp(a.mon), flying = G.hasType(a, 'flying');
    if (z.sub === 'rock') G.hurt(a, Math.max(1, Math.floor((mh / 8) * Mon.typeMult(6, G.types(a)))), null, { type: 'rock', dot: true });
    else if (flying) return;
    else if (z.sub === 'spike') G.hurt(a, Math.max(1, Math.floor(mh / 8)), null, { type: 'ground', dot: true });
    else if (z.sub === 'tspike') { if (G.hasType(a, 'poison')) { z.t = z.dur; G.say(a, 'absorbed the Toxic Spikes!', { col: '#c070e0', size: 11 }); } else inflict(a, 'poison', null, null); }
    else if (z.sub === 'web') changeStage(a, 6, -1, null);
  }

  return { act, fire, resolveHit, chooseMove, supported, moveStyle, interval, inflict, heal, changeStage, endTurn, hazard, powerOf, AIL_COL, mend, ALLY_HEAL };
})();
