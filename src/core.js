// Screen Trainer — shared game state, on-screen actors and common helpers.
// G is the one global game object; game.js, battle.js and items.js add their functions to it.
'use strict';

const G = {
  set: {}, save: null, actors: [], zones: [], shots: [], balls: [], drops: [], timers: [],
  weather: null, cursor: { x: -9999, y: -9999 }, hover: null, hoverDrop: null, drag: null, capture: false,
  now: 0, W: 0, H: 0, scale: 2, trainerTarget: null, clickT: -99, nextSpawn: 3, lastThrow: -9, turnT: 0, saveT: 0, dirty: false,
  lastBattle: -99, world: null, aid: 1, ballBtn: null, announce: () => {}, toast: () => {}, boxEpoch: 0,
  // The world is the rectangle the game happens in: the whole screen, or the inside of the field window while
  // that is open (src/overlay.js lays it out). W, H are the world's size and every position in the game is counted
  // from the world's top left corner. view is its place on the screen (null = whole screen), vx, vy that corner,
  // SW, SH the whole screen. Only Mewtwo and the notification cards live on the screen rather than in the world.
  view: null, vx: 0, vy: 0, SW: 0, SH: 0, pulling: false,
  // The camera (0.7, field window only): cam = { x, y, z } is the world point in the view's top left corner and the zoom.
  // null = no camera: the world is drawn one to one from the view's corner, as on the plain overlay and the stage.
  cam: null, blocks: [],
};
/** a world position on the screen (for what lives on the screen: Mewtwo, the rival's pointer, buttons) */
G.toScreen = (x, y) => (G.cam ? [(x - G.cam.x) * G.cam.z + G.vx, (y - G.cam.y) * G.cam.z + G.vy] : [x + G.vx, y + G.vy]);
/** Is a screen point inside the part of the world that can be seen (0.9.1)? Always on the plain overlay and the stage.
 *  In the field window the world can be larger than the window (the camera, 0.7): what walks outside the window is cut
 *  off from sight, and must be cut off from the mouse as well, or clicks on the bare desktop beside the field land on
 *  Pokémon nobody can see. While Pokémon are being brought in over the edges (G.pulling) they are drawn outside too. */
G.inView = (sx, sy) => { const v = G.view; return !v || !!G.pulling || (sx >= v.x && sx <= v.x + v.w && sy >= v.y && sy <= v.y + v.h); };
/** a screen position in the world */
G.toWorld = (sx, sy) => (G.cam ? [(sx - G.vx) / G.cam.z + G.cam.x, (sy - G.vy) / G.cam.z + G.cam.y] : [sx - G.vx, sy - G.vy]);

// The save file. Version stays 1: new fields are optional and filled in on load (overlay.js parseSave).
// bag: item key -> count. ball: the special ball equipped for the next throws. badges: badge id -> time earned.
// dex.size: species -> [smallest, largest] size value caught. Each Pokémon carries sz, its own size value (src/size.js).
// b2: this save knows the 0.4 ball rules (the Poké Ball is the standard ball, better ones are found in stacks).
G.newSave = () => ({ v: 1, team: [], box: [], dex: { seen: {}, caught: {}, size: {} }, bag: {}, ball: '', badges: {}, b2: 1,
  stats: { caught: 0, shiny: 0, ko: 0, clicks: 0, pets: 0, fled: 0, items: 0, alpha: 0, legend: 0, visits: 0, found: {} }, started: Date.now() });
G.touch = () => { G.dirty = true; };
G.after = (delay, fn) => { G.timers.push({ t: G.now + delay, fn }); };

G.center = (a) => ({ x: a.x, y: a.y - a.h * 0.5 });
G.alive = (a) => a && !a.gone && a.state !== 'faint' && a.mon.hp > 0;
G.targetable = (a) => G.alive(a) && a.state !== 'captured' && a.state !== 'leave' && !a.vol.away && !a.await;
G.team = () => G.actors.filter((a) => a.side === 'team' && !a.gone);
G.wilds = () => G.actors.filter((a) => a.side === 'wild' && !a.gone);
/** a friendly legendary visitor: nobody attacks it and it attacks nobody (src/events.js) */
G.peaceful = (a) => !!(a && a.ev && a.ev.kind === 'friendly');
/** a wild Pokémon that has settled in and is loitering: nobody fights it until the player clicks it or it is provoked (game.js) */
G.settled = (a) => !!(a && a.loiter && !a.aggro && a.side === 'wild');
/** who a move of this actor's may hit. (While two Trainers battle, wild Pokémon are out of it: no move of the team's reaches them.) */
G.enemiesOf = (a) => { const duel = !!G.inTrainerBattle && G.inTrainerBattle(); return G.peaceful(a) || (duel && a.side === 'wild' && !a.rival) ? [] : G.actors.filter((b) => b.side !== a.side && G.targetable(b) && !G.peaceful(b) && (!G.settled(b) || b === a.target) && !(duel && b.side === 'wild' && !b.rival)); };
G.alliesOf = (a) => G.actors.filter((b) => b.side === a.side && G.alive(b));
G.leader = () => {
  const order = G.save.team.map((m) => G.actors.find((a) => a.mon === m && !a.gone)).filter(Boolean);
  return order.find((a) => G.alive(a)) || null;
};
G.typeName = (id) => DATA.types[id];
G.types = (a) => Mon.species(a.mon).t;
G.hasType = (a, name) => G.types(a).some((t) => DATA.types[t] === name);
G.say = (a, str, o = {}) => {
  a.sayN = G.now - (a.sayT || -9) < 0.7 ? (a.sayN || 0) + 1 : 0;
  a.sayT = G.now;
  FX.text(a.x + (o.dx || 0), Math.max(14, a.y - a.h * (a.pad ? 0.8 : 1) - 40 - (a.sayN % 5) * 14), str, o);
};
/** where an actor may stand so that its whole sprite and its name tag stay on the screen (y is at its feet) */
G.bounds = (a) => {
  const hw = Math.min(G.W * 0.3, a.w * a.hit * 0.5 + 4), top = Math.min(G.H * 0.55, a.h * (a.pad ? 0.8 : 1) + 36);
  return { x0: hw, x1: Math.max(hw, G.W - hw), y0: top, y1: Math.max(top, G.H - 6) };
};
/** true while the team should leave this wild creature alone because the player is working on it */
G.handsOff = (w) => !!G.set.handsOff && w === G.trainerTarget && (G.now - G.clickT < 12 || !!w.balled);
/** screen pixels per sprite pixel for this actor: set by G.sizeActor once its picture has loaded */
G.sizeOf = (a) => a.k || G.scale * (a.big || 1);
G.verbose = () => G.set.fxLevel !== 'low';

/** effective battle stats (coordinated low-level team members fight above their level) */
G.bstats = (a) => {
  const lvl = Math.max(a.mon.lvl, a.effLvl || 0);
  if (a._sk !== lvl + ':' + a.mon.sp) { a._sk = lvl + ':' + a.mon.sp; a._st = Mon.stats(a.mon, lvl); }
  return a._st;
};
G.blevel = (a) => Math.max(a.mon.lvl, a.effLvl || 0);
G.stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

G.spawnActor = (mon, side, x, y) => {
  const el = document.createElement('div');
  el.className = 'actor ' + side;
  const a = {
    id: G.aid++, mon, side, x, y, tx: x, ty: y, vx: 0, vy: 0, face: 1, back: false, el, img: null, imgB: null,
    w: 64 * (G.scale / 2), h: 64 * (G.scale / 2), pad: 0, hit: 1, state: 'idle', stateT: 0, target: null, cd: U.rand(0.6, 1.6), busy: false,
    stages: [0, 0, 0, 0, 0, 0, 0, 0], vol: {}, aggro: false, stay: U.rand(50, 95), age: 0, dmgBy: new Set(), obey: true, obeyT: 0, loaf: 0,
    flash: 0, ox: 0, oy: 0, kx: 0, ky: 0, alpha: 1, sc: 1, hpShown: mon.hp, lastHit: -99, lastHitBy: null, idleT: U.rand(1, 4), thinkT: U.rand(0.5),
    petT: -9, effLvl: 0, gone: false, speed: 50 + Mon.species(mon).s[5] * 0.85, clicks: 0, hold: false, _tf: '', _z: -1,
    jy: 0, squash: 0, hops: null, await: null, faceAt: -9, backAt: -9, fetch: null, big: Mon.sizeOf ? Mon.sizeOf(mon) : 1,
    k: 0, ev: null, petHeal: -9, hasteT: -9, haste: 1, loiter: false, calm: false, settledAt: 0, pull: false, nap: 0,
  };
  G.loadSprite(a);
  G.world.appendChild(el);
  G.actors.push(a);
  return a;
};

G.loadSprite = (a) => {
  const r = (a.form && a.form.id && Sprites.resolve(a.form.id, a.mon.shiny, false)) || Sprites.resolve(a.mon.sp, a.mon.shiny, a.mon.fem, a.mon.look);      // (a.form: Mega Evolution or Gigantamax, src/forms.js)
  a.el.textContent = '';
  a.img = a.imgB = null; a.nw = a.nh = 0; a.k = 0;
  if (!r) return;
  a.pad = r.padded ? 0.16 : 0;
  a.hit = r.padded ? 0.66 : 1;
  const mk = (src, isBack) => {
    const img = new Image();
    img.draggable = false; img.className = 'spr' + (isBack ? ' bk' : '');
    img.onload = () => {
      if (isBack) { img.style.width = img.naturalWidth * G.sizeOf(a) + 'px'; img.style.height = img.naturalHeight * G.sizeOf(a) + 'px'; return; }
      a.nw = img.naturalWidth; a.nh = img.naturalHeight;
      G.sizeActor(a);
    };
    img.onerror = () => { img.remove(); if (isBack) a.imgB = null; };
    img.src = src;
    a.el.appendChild(img);
    return img;
  };
  a.img = mk(r.front, false);
  if (r.back) { a.imgB = mk(r.back, true); a.imgB.style.display = 'none'; }
};
G.sizeActor = (a) => {
  if (!a.nw) return;
  // species drawn to scale from their Pokédex height, times this individual's own size (src/size.js)
  a.k = Size.spriteScale(a.mon, a.nw, a.nh, !!a.pad, G.set.sizeMode || 'true', G.scale, Math.min(G.W, G.H) || 1080);
  if (a.grow) a.k = Math.min(a.k * a.grow, Math.max(a.k, ((Math.min(G.W, G.H) || 1080) * 0.62) / Math.max(a.nw, a.nh)));      // Mega Evolution and Dynamax: larger, but never more than about six tenths of the screen
  // the three helpers are Super XXL whatever their kind's height: even a 30 cm Rotom stands about a fifth of the field tall (never past the cap above)
  if (a.ev && a.ev.helper) a.k = Math.max(a.k, ((Math.min(G.W, G.H) || 1080) * 0.18) / Math.max(a.nw, a.nh));
  a.w = a.nw * a.k; a.h = a.nh * a.k;
  a.img.style.width = a.w + 'px'; a.img.style.height = a.h + 'px';
  const soft = a.k < 1 ? 'auto' : '';                    // shrunk pictures are smoothed; enlarged ones stay crisp pixels
  a.img.style.imageRendering = soft;
  if (a.imgB) a.imgB.style.imageRendering = soft;
  if (a.imgB && a.imgB.naturalWidth) { a.imgB.style.width = a.imgB.naturalWidth * a.k + 'px'; a.imgB.style.height = a.imgB.naturalHeight * a.k + 'px'; }
  a.el.style.transformOrigin = `50% ${Math.round((1 - a.pad) * 100)}%`;     // squash and stretch from the feet
  a._tf = '';
};
G.removeActor = (a) => {
  a.gone = true;
  a.el.remove();
  const i = G.actors.indexOf(a);
  if (i >= 0) G.actors.splice(i, 1);
  if (G.trainerTarget === a) G.trainerTarget = null;
  if (G.hover === a) G.hover = null;
  for (const z of G.zones) if (z.follow === a) z.t = z.dur;
  for (const d of G.drops) if (d.by === a) d.by = null;
};

/** add a lingering field zone */
G.addZone = (z) => {
  z = Object.assign({ kind: 'residue', x: 0, y: 0, r: 60, t: 0, dur: 5, type: 'normal', side: null, seed: Math.random() * 100, seen: new Set(), tick: 0 }, z);
  const same = G.zones.find((o) => o.key && o.key === z.key && o.side === z.side);
  if (same) { same.t = 0; same.x = z.x; same.y = z.y; return same; }
  if (G.zones.length > 40) G.zones.shift();
  G.zones.push(z);
  return z;
};
G.inZone = (a, z) => { const dx = a.x - z.x, dy = (a.y - z.y) / (z.kind === 'terrain' || z.kind === 'screen' ? 1 : 0.6); return dx * dx + dy * dy <= z.r * z.r; };
G.zoneAt = (a, key) => G.zones.find((z) => z.key === key && G.inZone(a, z));
