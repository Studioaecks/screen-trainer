// Screen Trainer — visual effects: type-styled particles, beams, bolts, rings, floating text,
// lingering field zones and weather. Everything is drawn on transparent canvases; there is no scenery.
'use strict';

const FX = (() => {
  let gctx = null, tctx = null, W = 0, H = 0, mult = 1, dpr = 1;
  const P = [], S = [], T = [];
  const M = [];                 // what weather leaves on the ground for a short while: snow patches, rain puddles (0.6)
  const MAXP = 2600;

  // colors (light, mid, dark) + particle shape + gravity + additive blending, per elemental type
  const TYPE = {
    normal: { c: ['#ffffff', '#d8d8c0', '#a8a878'], s: 'star', g: 0 },
    fire: { c: ['#ffe27a', '#ff9a2e', '#f0501e'], s: 'flame', g: -90, add: 1 },
    water: { c: ['#d6f0ff', '#5aa9f0', '#2a6fd0'], s: 'drop', g: 340 },
    electric: { c: ['#ffffff', '#fff27a', '#ffd020'], s: 'bolt', g: 0, add: 1 },
    grass: { c: ['#c8f890', '#78c850', '#3f9e3a'], s: 'leaf', g: 60 },
    ice: { c: ['#ffffff', '#c8f4ff', '#88d8e8'], s: 'shard', g: 80 },
    fighting: { c: ['#ffffff', '#ffb090', '#e0503a'], s: 'spark', g: 0 },
    poison: { c: ['#e8a8f4', '#a040a0', '#6a2a8a'], s: 'bubble', g: -50 },
    ground: { c: ['#f0dc9a', '#c8a048', '#8a6a30'], s: 'clod', g: 520 },
    flying: { c: ['#ffffff', '#c8d4ff', '#90a8f0'], s: 'arc', g: -20 },
    psychic: { c: ['#ffd0e4', '#f85888', '#c8a0ff'], s: 'ring', g: 0, add: 1 },
    bug: { c: ['#e8f480', '#a8b820', '#788a10'], s: 'dot', g: 40 },
    rock: { c: ['#e0cc88', '#b8a038', '#806a28'], s: 'shard', g: 520 },
    ghost: { c: ['#b8a0e8', '#705898', '#3a2a5a'], s: 'wisp', g: -40 },
    dragon: { c: ['#c0b0ff', '#7038f8', '#4a20c0'], s: 'flame', g: -60, add: 1 },
    dark: { c: ['#9a8a80', '#584838', '#201a18'], s: 'spark', g: 0 },
    steel: { c: ['#ffffff', '#c8c8dc', '#8888a0'], s: 'spark', g: 0 },
    fairy: { c: ['#ffffff', '#ffc8e0', '#f0a0c0'], s: 'star', g: -20, add: 1 },
  };
  const style = (type) => TYPE[type] || TYPE.normal;
  const col = (type, i = 1) => style(type).c[i];

  function init(ground, top) { gctx = ground.getContext('2d'); tctx = top.getContext('2d'); }
  function resize(w, h, ratio) {
    W = w; H = h; dpr = ratio;
    for (const c of [gctx.canvas, tctx.canvas]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
    }
  }
  const setIntensity = (m) => { mult = m; };

  // weather (0.9.3): its particles and splashes are marked (wx), so that only they are cut away where another window
  // covers the field window (setClip: the parts of the world that can be seen, or null for all of it)
  let inWeather = false, clipR = null;
  function setClip(r) { clipR = Array.isArray(r) ? r : null; }
  function clipTo(c) { c.beginPath(); for (const [x, y, w, h] of clipR) c.rect(x, y, w, h); c.clip(); }
  function part(o) {
    if (P.length >= MAXP) P.shift();
    P.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 0.6, age: 0, size: 4, col: '#fff', shape: 'dot', g: 0, drag: 1.5, rot: Math.random() * 6.28, vr: 0, add: 0, wx: inWeather ? 1 : 0 }, o));
  }

  /** radial burst of type-styled particles */
  function burst(x, y, type, n = 10, speed = 170, size = 4, life = 0.6) {
    const st = style(type);
    n = Math.max(1, Math.round(n * mult));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = speed * (0.35 + Math.random() * 0.85);
      part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (st.g > 200 ? speed * 0.5 : 0), life: life * (0.6 + Math.random() * 0.7),
        size: size * (0.6 + Math.random() * 0.9), col: st.c[U.rint(3)], shape: st.s, g: st.g, add: st.add || 0, vr: U.rand(-6, 6) });
    }
  }
  /** a couple of slow particles — trails, auras, lingering patches */
  function puff(x, y, type, n = 1, spread = 8, size = 3.5, life = 0.5) {
    const st = style(type);
    for (let i = 0; i < n; i++) {
      if (mult < 1 && Math.random() > mult) continue;
      part({ x: x + U.rand(-spread, spread), y: y + U.rand(-spread, spread), vx: U.rand(-25, 25), vy: U.rand(-25, 25), life: life * (0.6 + Math.random() * 0.8),
        size: size * (0.6 + Math.random() * 0.8), col: st.c[U.rint(3)], shape: st.s, g: st.g * 0.5, add: st.add || 0, vr: U.rand(-4, 4) });
    }
  }
  function sparkle(x, y, n = 6, colr = '#fff6a8', spread = 30) {
    for (let i = 0; i < n; i++) part({ x: x + U.rand(-spread, spread), y: y + U.rand(-spread, spread), vx: 0, vy: -12, life: U.rand(0.4, 0.9), size: U.rand(4, 8), col: colr, shape: 'star', add: 1, vr: 3 });
  }
  function hearts(x, y, n = 3) {
    for (let i = 0; i < n; i++) part({ x: x + U.rand(-18, 18), y: y + U.rand(-8, 8), vx: U.rand(-22, 22), vy: U.rand(-70, -40), life: U.rand(0.8, 1.3), size: U.rand(7, 11), col: U.pick(['#ff6b9a', '#ff8fb3', '#ff4f7d']), shape: 'heart', drag: 0.6, rot: 0 });
  }
  /** a low puff of dust where something lands (hops, dropped items) */
  function dust(x, y, n = 5, size = 4) {
    n = Math.max(2, Math.round(n * Math.min(1, mult)));
    for (let i = 0; i < n; i++) { const dir = i % 2 ? 1 : -1; part({ x: x + dir * U.rand(2, 10), y: y - U.rand(0, 3), vx: dir * U.rand(30, 95), vy: U.rand(-46, -8), life: U.rand(0.25, 0.5), size: size * U.rand(0.7, 1.3), col: 'rgba(236,238,246,.7)', shape: 'wisp', drag: 3.2, g: 30 }); }
  }
  /** a bright four-point twinkle (shiny sparkle, items lying around) */
  function glint(x, y, size = 9, colr = '#ffffff') { part({ x, y, vx: 0, vy: 0, life: 0.55, size, col: colr, shape: 'glint', add: 1, drag: 0, rot: 0, vr: 1.2 }); }
  function shape(o) { S.push(Object.assign({ age: 0, dur: 0.3, wx: inWeather ? 1 : 0 }, o)); }
  function ring(x, y, r0, r1, colr, dur = 0.4, w = 4, fill = 0) { shape({ k: 'ring', x, y, r0, r1, col: colr, dur, w, fill }); }
  // ---------------------------------------------------------------- what a hit looks like (0.6)
  // Every damaging move ends here, whatever brought it (dash, shot, beam, from the sky, wave): a flourish of its type
  // at the spot it landed. o: { power, crit, eff (type effectiveness), size (the target's width) }.
  // "Subtle" (mult 0.5) shows nothing extra, "Normal" a modest version, "Full chaos" (mult 1.8) all of it: more and
  // larger, a second shockwave, light rays for strong moves, and a shake of the scene (FX.onShake, set by the page).
  let onShake = null;
  function impact(x, y, type, o = {}) {
    if (mult < 0.8) return;
    const st = style(type), chaos = mult > 1.4, pw = U.clamp((o.power || 60) / 80, 0.5, 2) * (o.crit ? 1.3 : 1) * ((o.eff || 1) > 1 ? 1.25 : (o.eff || 1) < 1 ? 0.7 : 1);
    const big = pw * (chaos ? 1.6 : 1), R = Math.max(26, (o.size || 60) * 0.55) * big, n = (k) => Math.max(1, Math.round(k * pw * mult));
    const c0 = st.c[0], c1 = st.c[1], c2 = st.c[2], add = st.add ? 1 : 0, rnd = (a, b) => U.rand(a, b), ang = () => Math.random() * 6.283;
    const fly = (k, speed, o2) => { for (let i = n(k); i > 0; i--) { const a = ang(), v = speed * rnd(0.45, 1) * (chaos ? 1.25 : 1); part(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.35, 0.7), size: rnd(3, 5.5), col: U.pick(st.c), shape: st.s, g: st.g, add, drag: 2.2, vr: rnd(-6, 6) }, o2 || {})); } };
    ring(x, y, R * 0.25, R * 1.25, c1, 0.3, chaos ? 5 : 3);
    if (chaos) { ring(x, y, R * 0.1, R * 1.9, c0, 0.48, 2); shape({ k: 'ring', x, y, r0: R * 0.2, r1: R * 0.9, col: c0, dur: 0.16, w: 2, fill: 0.5 }); }
    switch (type) {
      case 'fire': case 'dragon': fly(7, 210); for (let i = n(5); i > 0; i--) part({ x: x + rnd(-R, R) * 0.6, y: y + rnd(-6, 10), vx: rnd(-20, 20), vy: rnd(-150, -60), life: rnd(0.5, 0.95), size: rnd(4, 7), col: U.pick(st.c), shape: 'flame', g: -90, add: 1, drag: 0.8 }); break;
      case 'water': fly(6, 230, { shape: 'drop', g: 520, drag: 0.6, life: rnd(0.45, 0.8) }); shape({ k: 'ring', x, y: y + R * 0.35, r0: R * 0.3, r1: R * 1.3, col: c0, dur: 0.5, w: 2, fill: 0 }); break;
      case 'electric': for (let i = n(2) + 1; i > 0; i--) { const a = ang(), l = R * rnd(0.9, 1.7); bolt(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, U.pick([c0, c1]), 0.18, 2); } fly(5, 300, { shape: 'spark', life: 0.28 }); break;
      case 'grass': case 'bug': for (let i = n(8); i > 0; i--) { const a = ang(), r = R * rnd(0.2, 0.9); part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.sin(a) * 190, vy: Math.cos(a) * 190 - 30, life: rnd(0.5, 0.85), size: rnd(3.5, 6), col: U.pick(st.c), shape: st.s, g: 70, drag: 1.4, vr: rnd(-9, 9) }); } break;
      case 'ice': fly(8, 250, { shape: 'shard', g: 160, drag: 1.2 }); for (let i = n(3); i > 0; i--) glint(x + rnd(-R, R), y + rnd(-R, R) * 0.7, rnd(6, 11), '#e8fbff'); break;
      case 'ground': case 'rock': fly(8, 240, { shape: type === 'rock' ? 'shard' : 'clod', g: 640, drag: 0.5 }); dust(x, y + R * 0.3, n(4), 5); break;
      case 'poison': for (let i = n(8); i > 0; i--) part({ x: x + rnd(-R, R) * 0.7, y: y + rnd(-R, R) * 0.4, vx: rnd(-30, 30), vy: rnd(-110, -40), life: rnd(0.6, 1.1), size: rnd(3, 6.5), col: U.pick(st.c), shape: 'bubble', g: -40, drag: 0.9 }); break;
      case 'psychic': case 'fairy': for (let i = 0; i < (chaos ? 3 : 2); i++) shape({ k: 'ring', x, y, r0: R * 0.2, r1: R * (1 + i * 0.45), col: st.c[i % 3], dur: 0.34 + i * 0.12, w: 2, fill: 0 }); fly(6, 150, { shape: type === 'fairy' ? 'star' : 'ring', life: rnd(0.5, 0.8) }); break;
      case 'ghost': case 'dark': for (let i = n(7); i > 0; i--) { const a = ang(), r = R * rnd(1, 1.6); part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * 220, vy: -Math.sin(a) * 220, life: rnd(0.35, 0.55), size: rnd(4, 7), col: U.pick(st.c), shape: type === 'ghost' ? 'wisp' : 'spark', drag: 0.3 }); } slash(x, y, type, ang(), R * 0.9); if (chaos) slash(x, y, type, ang(), R * 1.2); break;
      case 'flying': for (let i = n(3); i > 0; i--) slash(x + rnd(-R, R) * 0.4, y + rnd(-R, R) * 0.4, type, rnd(-0.6, 0.6), R * rnd(0.7, 1.2)); fly(5, 260, { shape: 'arc', life: 0.4 }); break;
      case 'steel': fly(8, 330, { shape: 'spark', life: 0.26, col: '#ffffff' }); for (let i = n(2); i > 0; i--) glint(x + rnd(-R, R) * 0.6, y + rnd(-R, R) * 0.6, rnd(8, 14), '#ffffff'); break;
      case 'fighting': fly(7, 320, { shape: 'spark', life: 0.24 }); part({ x, y, vx: 0, vy: 0, life: 0.3, size: R * 0.5, col: c0, shape: 'star', add: 1, drag: 0, vr: 3 }); break;
      default: fly(7, 220); part({ x, y, vx: 0, vy: 0, life: 0.26, size: R * 0.4, col: c0, shape: 'star', add: 1, drag: 0, vr: 2 });
    }
    if (o.crit) { part({ x, y, vx: 0, vy: 0, life: 0.34, size: R * 0.7, col: '#fff6a8', shape: 'glint', add: 1, drag: 0, rot: 0, vr: 2 }); }
    if ((o.eff || 1) > 1) for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + 0.3; part({ x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.22, size: 4, col: '#ffffff', shape: 'streak', add: 1, drag: 0 }); }
    if (chaos && pw >= 1.2) {                               // a strong move at full chaos: rays of light and the ground shakes
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 + Math.random() * 0.3; part({ x, y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 0.3, size: 5, col: i % 2 ? c0 : c1, shape: 'streak', add: 1, drag: 0 }); }
      if (onShake) { try { onShake(Math.min(9, 3 + pw * 2.5), 0.22); } catch (e) { /* no page to shake */ } }
    }
  }
  /** a move being readied at full chaos: its colours gather on the user */
  function gather(x, y, type, size) {
    if (mult <= 1.4) return;
    const st = style(type), R = Math.max(40, size || 60);
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, r = R * U.rand(0.9, 1.5); part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 3.2, vy: -Math.sin(a) * r * 3.2, life: 0.3, size: U.rand(3, 5), col: U.pick(st.c), shape: st.s === 'bolt' ? 'spark' : st.s, add: st.add ? 1 : 0, drag: 0 }); }
    ring(x, y, R * 1.3, R * 0.2, st.c[1], 0.3, 2);
  }
  function beam(x1, y1, x2, y2, type, dur = 0.38, w = 12) { shape({ k: 'beam', x1, y1, x2, y2, type, dur, w }); }
  function slash(x, y, type, ang = U.rand(6.28), r = 34) { shape({ k: 'slash', x, y, type, ang, r, dur: 0.22 }); }
  function bolt(x1, y1, x2, y2, colr = '#fff27a', dur = 0.22, w = 3) {
    const pts = [[x1, y1]], n = Math.max(4, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 34));
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n, j = U.rand(-22, 22);
      pts.push([x1 + (x2 - x1) * t + (nx / nl) * j, y1 + (y2 - y1) * t + (ny / nl) * j]);
    }
    pts.push([x2, y2]);
    shape({ k: 'bolt', pts, col: colr, dur, w });
  }
  function text(x, y, str, o = {}) {
    if (T.length > 60) T.shift();
    T.push({ x, y, str, col: o.col || '#fff', size: o.size || 13, dur: o.dur || 1.1, age: 0, vy: o.vy === undefined ? -34 : o.vy, bold: o.bold !== false });
  }

  function update(dt) {
    for (let i = M.length - 1; i >= 0; i--) { const m = M[i]; m.age += dt; if (m.age >= m.life) { M[i] = M[M.length - 1]; M.pop(); } }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.sway) p.x += Math.sin(p.age * 2.4 + p.rot) * p.sway * dt;
    }
    for (let i = S.length - 1; i >= 0; i--) { S[i].age += dt; if (S[i].age >= S[i].dur) S.splice(i, 1); }
    for (let i = T.length - 1; i >= 0; i--) { const t = T[i]; t.age += dt; t.y += t.vy * dt; t.vy *= 1 - 1.5 * dt; if (t.age >= t.dur) T.splice(i, 1); }
  }
  const busy = () => P.length + S.length + T.length + M.length;
  /** drop every particle, shape and floating text at once (the world moved to another place on the screen) */
  const reset = () => { P.length = 0; S.length = 0; T.length = 0; M.length = 0; };

  function drawParticle(c, p) {
    const k = 1 - p.age / p.life, s = p.size;
    c.globalAlpha = Math.min(1, k * 1.6);
    c.fillStyle = c.strokeStyle = p.col;
    switch (p.shape) {
      case 'flame': c.beginPath(); c.arc(p.x, p.y, s * (0.4 + k), 0, 6.283); c.fill(); break;
      case 'wisp': c.globalAlpha *= 0.6; c.beginPath(); c.arc(p.x, p.y, s * (1.6 - k * 0.6), 0, 6.283); c.fill(); break;
      case 'drop': c.beginPath(); c.ellipse(p.x, p.y, s * 0.55, s, Math.atan2(p.vy, p.vx) + 1.571, 0, 6.283); c.fill(); break;
      case 'bubble': c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, s, 0, 6.283); c.stroke(); c.globalAlpha *= 0.35; c.fill(); break;
      case 'ring': c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, s * (2.2 - k * 1.4), 0, 6.283); c.stroke(); break;
      case 'spark': { const l = Math.hypot(p.vx, p.vy) || 1, n = (s * 2.2) / l; c.lineWidth = Math.max(1.5, s * 0.45); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * n, p.y - p.vy * n); c.stroke(); break; }
      case 'bolt': { c.lineWidth = 2; c.beginPath(); let x = p.x, y = p.y; c.moveTo(x, y); for (let i = 0; i < 3; i++) { x += Math.cos(p.rot + i * 2.1) * s * 1.3; y += Math.sin(p.rot + i * 2.1) * s * 1.3; c.lineTo(x, y); } c.stroke(); break; }
      case 'arc': c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, s * 2, p.rot, p.rot + 1.9); c.stroke(); break;
      case 'leaf': c.beginPath(); c.ellipse(p.x, p.y, s * 1.2, s * 0.5, p.rot, 0, 6.283); c.fill(); break;
      case 'clod': c.fillRect(p.x - s / 2, p.y - s / 2, s, s); break;
      case 'shard': c.beginPath(); for (let i = 0; i < 3; i++) { const a = p.rot + i * 2.094; c.lineTo(p.x + Math.cos(a) * s * (i ? 0.8 : 1.5), p.y + Math.sin(a) * s * (i ? 0.8 : 1.5)); } c.fill(); break;
      case 'star': c.beginPath(); for (let i = 0; i < 8; i++) { const a = p.rot + i * 0.7854, r = i % 2 ? s * 0.35 : s * k + 1; c.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } c.fill(); break;
      case 'heart': { const r = s * 0.5; c.beginPath(); c.moveTo(p.x, p.y + r); c.bezierCurveTo(p.x - r * 2.4, p.y - r * 0.6, p.x - r * 0.9, p.y - r * 2, p.x, p.y - r * 0.6); c.bezierCurveTo(p.x + r * 0.9, p.y - r * 2, p.x + r * 2.4, p.y - r * 0.6, p.x, p.y + r); c.fill(); break; }
      case 'glint': { const r = s * Math.sin(Math.min(1, 1 - k) * 3.1416) + 1; c.beginPath(); for (let i = 0; i < 8; i++) { const a = p.rot + i * 0.7854, q = i % 2 ? r * 0.18 : r; c.lineTo(p.x + Math.cos(a) * q, p.y + Math.sin(a) * q); } c.fill(); break; }
      case 'streak': c.lineWidth = 1.2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke(); break;
      default: c.beginPath(); c.arc(p.x, p.y, s * 0.6, 0, 6.283); c.fill();
    }
  }

  function drawShape(c, s) {
    const k = s.age / s.dur;
    if (s.k === 'ring') {
      const r = s.r0 + (s.r1 - s.r0) * (1 - (1 - k) * (1 - k));
      c.globalAlpha = (1 - k) * 0.9; c.strokeStyle = s.col; c.lineWidth = s.w * (1 - k * 0.5);
      c.beginPath(); c.arc(s.x, s.y, Math.max(0.5, r), 0, 6.283); c.stroke();
      if (s.fill) { c.globalAlpha = (1 - k) * s.fill; c.fillStyle = s.col; c.fill(); }
    } else if (s.k === 'beam') {
      const st = style(s.type), a = Math.sin(Math.min(1, k * 1.15) * 3.1416), w = s.w * (0.5 + a * 0.6);
      c.lineCap = 'round';
      c.globalAlpha = a * 0.45; c.strokeStyle = st.c[2]; c.lineWidth = w * 2.1; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
      c.globalAlpha = a * 0.85; c.strokeStyle = st.c[1]; c.lineWidth = w * 1.2; c.stroke();
      c.globalAlpha = a; c.strokeStyle = st.c[0]; c.lineWidth = w * 0.45; c.stroke();
      c.lineCap = 'butt';
    } else if (s.k === 'bolt') {
      c.globalAlpha = 1 - k; c.lineJoin = 'round';
      for (const [w, cl] of [[s.w * 3, s.col], [s.w, '#ffffff']]) {
        c.strokeStyle = cl; c.lineWidth = w; if (w > s.w) c.globalAlpha = (1 - k) * 0.45; else c.globalAlpha = 1 - k;
        c.beginPath(); s.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      }
    } else if (s.k === 'slash') {
      const st = style(s.type);
      c.globalAlpha = 1 - k; c.strokeStyle = st.c[0]; c.lineWidth = 5 * (1 - k) + 1; c.lineCap = 'round';
      c.beginPath(); c.arc(s.x - Math.cos(s.ang) * s.r * 0.6, s.y - Math.sin(s.ang) * s.r * 0.6, s.r, s.ang - 0.9 + k * 0.5, s.ang + 0.2 + k * 0.9); c.stroke();
      c.strokeStyle = st.c[1]; c.lineWidth = 2; c.beginPath(); c.arc(s.x - Math.cos(s.ang) * s.r * 0.6, s.y - Math.sin(s.ang) * s.r * 0.6, s.r + 6, s.ang - 0.7 + k * 0.5, s.ang + 0.1 + k * 0.9); c.stroke();
      c.lineCap = 'butt';
    }
  }

  // deterministic pseudo-random for stable zone decoration
  const srand = (seed, i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  const ease = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  const spot = (z, i, R, flat) => { const a = srand(z.seed, i) * 6.283, rr = Math.sqrt(srand(z.seed, i + 40)) * R; return [z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * flat]; };
  function hexagon(c, x, y, r) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.0472 + 0.5236; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
  function blob(c, x, y, r, colr, alpha) { const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, colr); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = alpha; c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }

  /** lingering field zone (terrain, screen, hazard, trap, residue). Each grows in, lives and dissolves;
   *  nothing here is scenery: every zone belongs to a move that was just used. */
  function drawZone(c, z, now) {
    const left = z.dur - z.t, fade = Math.min(1, z.t * 3) * Math.min(1, left * 1.5);
    if (fade <= 0) return;
    const st = style(z.type), pulse = 0.5 + 0.5 * Math.sin(now * 3 + z.seed), grow = ease(Math.min(1, z.t / 0.6)), R = z.r * (0.2 + 0.8 * grow), n = (k) => Math.max(2, Math.round(k * Math.min(1.4, mult)));
    c.save();
    if (z.kind === 'mark') {
      // what a move left on the ground (0.7): a flat patch in the colours of its type that fades when its time is up.
      // Drawn as light, like every field effect: a soft body, a rim, and a few specks that keep it alive.
      c.translate(z.x, z.y); c.scale(1, 0.6); c.translate(-z.x, -z.y);
      const last = Math.min(1, left / Math.min(3, z.dur * 0.4));
      blob(c, z.x, z.y, R, st.c[1], fade * last * 0.34); blob(c, z.x, z.y, R * 0.62, st.c[0], fade * last * 0.3);
      c.globalAlpha = fade * last * 0.5; c.strokeStyle = st.c[2] || st.c[0]; c.lineWidth = 2;
      c.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * 6.283, rr = R * (0.8 + 0.08 * Math.sin(a * 5 + z.seed) + 0.03 * Math.sin(now * 2 + a * 3)); if (i) c.lineTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); else c.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); } c.closePath(); c.stroke();
      for (let i = 0; i < n(Math.min(9, 2 + R / 28)); i++) { const [x, y] = spot(z, i, R * 0.72, 1), tw = 0.35 + 0.65 * Math.max(0, Math.sin(now * 2.4 + i * 1.7 + z.seed)); c.globalAlpha = fade * last * tw * 0.8; c.fillStyle = i % 2 ? st.c[0] : '#ffffff'; c.beginPath(); c.arc(x, y, 2.2, 0, 6.283); c.fill(); }
    } else if (z.kind === 'terrain') {
      blob(c, z.x, z.y, R, st.c[1], fade * (0.13 + pulse * 0.05));
      c.globalAlpha = fade * 0.6; c.strokeStyle = st.c[0]; c.lineWidth = 2; c.setLineDash([10, 14]); c.lineDashOffset = -now * 30;
      c.beginPath(); c.arc(z.x, z.y, R * 0.96, 0, 6.283); c.stroke(); c.setLineDash([]);
      if (z.type === 'electric') {                       // arcs that crackle from point to point
        c.lineJoin = 'round'; c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n(5); i++) {
          const ph = Math.floor(now * 7 + i * 1.7), life = (now * 7 + i * 1.7) % 1, sd = z.seed + ph * 3.1 + i;
          let [x, y] = spot({ seed: sd, x: z.x, y: z.y }, 1, R * 0.85, 1);
          c.beginPath(); c.moveTo(x, y);
          for (let k = 0; k < 4; k++) { x += (srand(sd, k + 5) - 0.5) * 70; y += (srand(sd, k + 9) - 0.5) * 50; c.lineTo(x, y); }
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = fade * (1 - life) * 0.4; c.strokeStyle = 'rgba(60,44,0,.9)'; c.lineWidth = 4; c.stroke();
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = fade * (1 - life) * 0.95; c.strokeStyle = i % 2 ? st.c[1] : '#ffffff'; c.lineWidth = i % 2 ? 2.2 : 1.2; c.stroke();
        }
      } else if (z.type === 'grass') {                   // blades that sway, a few flowers
        c.lineCap = 'round';
        for (let i = 0; i < n(44); i++) {
          const [x, y] = spot(z, i, R * 0.94, 1), h = 9 + srand(z.seed, i + 90) * 11, sw = Math.sin(now * 2.2 + i * 1.3) * 4;
          c.globalAlpha = fade * 0.85; c.strokeStyle = st.c[i % 3]; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sw * 0.3, y - h * 0.6, x + sw, y - h); c.stroke();
          if (i % 9 === 0) { c.fillStyle = i % 18 ? '#fff6a8' : '#ffc8e0'; c.beginPath(); c.arc(x + sw, y - h, 2.4, 0, 6.283); c.fill(); }
        }
      } else if (z.type === 'fairy') {                   // drifting pink mist
        for (let i = 0; i < n(8); i++) { const a = srand(z.seed, i) * 6.283 + now * 0.16 * (i % 2 ? 1 : -1), rr = R * (0.15 + 0.6 * srand(z.seed, i + 7)); blob(c, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, R * 0.38, i % 2 ? '#ffe4f0' : '#ffc8e0', fade * 0.12); }
      } else {                                           // psychic: rings that breathe outward, slow turning frames
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const k = (now * 0.45 + i / 3) % 1; c.globalAlpha = fade * (1 - k) * 0.55; c.strokeStyle = st.c[i % 3]; c.lineWidth = 2.5; c.beginPath(); c.arc(z.x, z.y, Math.max(1, k * R), 0, 6.283); c.stroke(); }
        for (let i = 0; i < 2; i++) { const a = now * (i ? -0.35 : 0.5), q = R * (i ? 0.5 : 0.72); c.globalAlpha = fade * 0.3; c.strokeStyle = st.c[2 - i]; c.lineWidth = 1.5; c.beginPath(); for (let k = 0; k < 4; k++) c.lineTo(z.x + Math.cos(a + k * 1.5708) * q, z.y + Math.sin(a + k * 1.5708) * q); c.closePath(); c.stroke(); }
        for (let i = 0; i < n(6); i++) { const a = now * 1.1 + i * 1.047; c.globalAlpha = fade * 0.8; c.fillStyle = st.c[0]; c.beginPath(); c.arc(z.x + Math.cos(a) * R * 0.86, z.y + Math.sin(a) * R * 0.86, 3, 0, 6.283); c.fill(); }
      }
    } else if (z.kind === 'screen') {
      const colr = z.col || st.c[0];
      if (z.key === 'mist') { for (let i = 0; i < n(9); i++) { const a = srand(z.seed, i) * 6.283 + now * 0.2 * (i % 2 ? 1 : -1), rr = R * (0.2 + 0.7 * srand(z.seed, i + 3)); blob(c, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, R * 0.36, '#f2f8ff', fade * 0.13); } }
      else {
        blob(c, z.x, z.y, R, colr, fade * 0.07);
        const tiles = Math.max(10, Math.round(R / 13)), hue = ['#9af0ff', '#b8a0ff', '#a0ffc8', '#ffe0a0'];
        for (let i = 0; i < tiles; i++) {                 // a ring of panes with a glint that travels round it
          const a = (i / tiles) * 6.283 + now * 0.12, sh = Math.max(0, Math.sin(now * 3.4 - i * 0.55)), x = z.x + Math.cos(a) * R, y = z.y + Math.sin(a) * R;
          hexagon(c, x, y, 11);
          c.fillStyle = z.key === 'aurora-veil' ? hue[(i + Math.floor(now * 2)) % hue.length] : colr;
          c.globalAlpha = fade * (0.28 + sh * 0.5); c.fill();
          c.globalAlpha = fade * 0.45; c.strokeStyle = 'rgba(20,24,34,.8)'; c.lineWidth = 2.2; c.stroke();
          c.globalAlpha = fade * (0.5 + sh * 0.5); c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.stroke();
        }
        c.globalCompositeOperation = 'lighter';
        const sweep = (now * 0.35 + z.seed) % 1;          // one slow highlight across the dome
        c.globalAlpha = fade * 0.2 * Math.sin(sweep * 3.1416); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.beginPath(); c.arc(z.x, z.y, R * 0.97, sweep * 6.283, sweep * 6.283 + 0.9); c.stroke();
      }
    } else if (z.kind === 'hazard') {
      if (z.sub === 'web') {
        const reveal = Math.min(1, z.t / 0.7), wob = 1 + 0.012 * Math.sin(now * 3 + z.seed);
        // drawn twice: a soft dark line underneath keeps the pale threads readable on a light window
        for (const [colr, lw, al] of [['rgba(20,24,34,.55)', 3, 0.5], ['rgba(248,248,240,.95)', 1.3, 0.95]]) {
          c.strokeStyle = colr; c.lineWidth = lw; c.globalAlpha = fade * al;
          for (let i = 0; i < 8; i++) { const a = i * 0.7854 + z.seed; c.beginPath(); c.moveTo(z.x, z.y); c.lineTo(z.x + Math.cos(a) * z.r * reveal * wob, z.y + Math.sin(a) * z.r * 0.6 * reveal * wob); c.stroke(); }
          for (let j = 1; j <= 4; j++) {
            if (j / 4 > reveal + 0.1) break;
            c.beginPath();
            for (let i = 0; i <= 8; i++) { const a = i * 0.7854 + z.seed, rr = (z.r * j) / 4 * wob, sag = i % 2 ? 0.93 : 1; const x = z.x + Math.cos(a) * rr * sag, y = z.y + Math.sin(a) * rr * 0.6 * sag; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
            c.stroke();
          }
        }
        for (let i = 0; i < 6; i++) { const [x, y] = spot(z, i + 20, z.r * 0.9, 0.6); c.globalAlpha = fade * (0.3 + 0.7 * Math.max(0, Math.sin(now * 2 + i * 1.9))); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 1.6, 0, 6.283); c.fill(); }
      } else if (z.sub === 'rock') {
        for (let i = 0; i < 9; i++) {                     // rocks that hang in the air and turn slowly
          const [x, y0] = spot(z, i, z.r, 0.6), pop = ease(Math.min(1, Math.max(0, z.t * 3 - i * 0.12))), y = y0 - 12 * pop + Math.sin(now * 2 + i) * 3.5, sz = (7 + srand(z.seed, i + 60) * 6) * pop, rot = now * 0.4 * (i % 2 ? 1 : -1) + i;
          c.globalAlpha = fade * 0.95; c.fillStyle = st.c[i % 3]; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1;
          c.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * 1.047, q = sz * (0.7 + 0.5 * srand(z.seed + i, k)); c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.85); } c.closePath(); c.fill(); c.stroke();
          c.globalAlpha = fade * 0.5; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - sz * 0.25, y - sz * 0.3, sz * 0.16, 0, 6.283); c.fill();
        }
      } else {                                            // spikes pop up one after another; toxic ones drip
        const toxic = z.sub === 'tspike';
        for (let i = 0; i < 14; i++) {
          const [x, y] = spot(z, i, z.r, 0.6), pop = ease(Math.min(1, Math.max(0, z.t * 4 - i * 0.1))), sz = 7 * pop, h = sz * 1.9;
          if (pop <= 0) continue;
          c.globalAlpha = fade * 0.95; c.fillStyle = toxic ? '#a040a0' : st.c[i % 3]; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x - sz * 0.55, y); c.lineTo(x, y - h); c.lineTo(x + sz * 0.55, y); c.closePath(); c.fill(); c.stroke();
          c.globalAlpha = fade * 0.75; c.strokeStyle = toxic ? '#e8a8f4' : '#ffffff'; c.beginPath(); c.moveTo(x - sz * 0.2, y - 1); c.lineTo(x, y - h + 2); c.stroke();
          if (toxic) { const k = (now * 0.9 + srand(z.seed, i + 5)) % 1; c.globalAlpha = fade * (1 - k) * 0.8; c.fillStyle = '#c070e0'; c.beginPath(); c.arc(x, y - h + k * h * 0.9, 1.8, 0, 6.283); c.fill(); }
        }
        const gl = (now * 0.5 + z.seed) % 1.6;             // a glint that runs across the patch
        if (gl < 1) { const [x, y] = spot(z, Math.floor(gl * 14), z.r, 0.6); c.globalAlpha = fade * Math.sin(gl * 3.1416); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y - 12, 2.2, 0, 6.283); c.fill(); }
      }
    } else if (z.kind === 'trap') {
      const t = z.type, cy = z.y - 22;
      if (t === 'fire' || t === 'dragon' || t === 'electric') {   // flames (or sparks) that circle the target
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n(9); i++) {
          const a = now * 5.2 + i * 0.698, back = Math.sin(a) < 0, x = z.x + Math.cos(a) * z.r, y = cy + Math.sin(a) * z.r * 0.42 - (i % 3) * 7, sz = 6 + 3 * Math.sin(now * 11 + i);
          c.globalAlpha = fade * (back ? 0.4 : 0.9); c.fillStyle = st.c[1]; c.beginPath(); c.arc(x, y, sz, 0, 6.283); c.fill();
          c.fillStyle = st.c[0]; c.beginPath(); c.arc(x, y + 1, sz * 0.5, 0, 6.283); c.fill();
          c.globalAlpha *= 0.5; c.fillStyle = st.c[2]; c.beginPath(); c.arc(x - Math.cos(a + 1.57) * 7, y - 7, sz * 0.6, 0, 6.283); c.fill();
        }
      } else if (t === 'water' || t === 'ice' || t === 'flying' || t === 'ground' || t === 'rock') {   // a whirl
        c.lineCap = 'round';
        for (let j = 0; j < 4; j++) {
          const k = j / 3, rr = z.r * (1.05 - k * 0.55);
          c.globalAlpha = fade * (0.85 - k * 0.3); c.strokeStyle = st.c[j % 3]; c.lineWidth = 4 - k * 2;
          for (let i = 0; i < 3; i++) { const a = now * (6 - k * 2) * (j % 2 ? -1 : 1) + i * 2.094; c.beginPath(); c.ellipse(z.x, cy + 10 - k * 34, rr, rr * 0.42, 0, a, a + 1.2); c.stroke(); }
        }
      } else {                                            // bands that squeeze
        c.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const sq = 0.86 + 0.14 * Math.sin(now * 7 + i * 1.3), y = cy + 14 - i * 16;
          c.globalAlpha = fade * 0.9; c.strokeStyle = st.c[1]; c.lineWidth = 5; c.beginPath(); c.ellipse(z.x, y, z.r * sq, z.r * 0.34 * sq, 0, 0.15, 2.99); c.stroke();
          c.strokeStyle = st.c[0]; c.lineWidth = 1.6; c.beginPath(); c.ellipse(z.x, y - 1.5, z.r * sq, z.r * 0.34 * sq, 0, 0.4, 2.7); c.stroke();
        }
      }
    } else {                                              // residue: what an attack left behind
      const t = z.type, ry = 0.55;
      for (let i = 0; i < 5; i++) {                       // a patch with a living, uneven edge
        const a = srand(z.seed, i) * 6.283, off = R * 0.34, wob = 1 + 0.1 * Math.sin(now * 2.4 + i * 1.7);
        const x = z.x + Math.cos(a) * off, y = z.y + Math.sin(a) * off * ry, rr = R * 0.62 * wob;
        const gr = c.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, st.c[1]); gr.addColorStop(0.65, st.c[2]); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = fade * (0.2 + pulse * 0.06); c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, rr, rr * ry, 0, 0, 6.283); c.fill();
      }
      if (t === 'fire' || t === 'dragon') {               // tongues of flame
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n(8); i++) {
          const [x, y] = spot(z, i, R * 0.8, ry), h = 12 + 9 * Math.sin(now * 9 + i * 2.1) + 6 * srand(z.seed, i + 30), w = 5 + 2 * srand(z.seed, i + 31), lean = Math.sin(now * 5 + i) * 3;
          c.globalAlpha = fade * 0.75; c.fillStyle = st.c[1]; c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.6 + lean, y - h * 0.6, x + lean, y - h); c.quadraticCurveTo(x + w * 0.6 + lean, y - h * 0.6, x + w, y); c.closePath(); c.fill();
          c.globalAlpha = fade * 0.8; c.fillStyle = st.c[0]; c.beginPath(); c.moveTo(x - w * 0.45, y); c.quadraticCurveTo(x + lean * 0.5, y - h * 0.45, x + lean * 0.6, y - h * 0.6); c.quadraticCurveTo(x + w * 0.3, y - h * 0.3, x + w * 0.45, y); c.closePath(); c.fill();
        }
      } else if (t === 'poison' || t === 'water' || t === 'bug') {   // bubbles that swell and pop
        for (let i = 0; i < n(7); i++) {
          const [x, y] = spot(z, i, R * 0.8, ry), k = (now * (0.6 + srand(z.seed, i + 3) * 0.6) + srand(z.seed, i + 5)) % 1;
          c.globalAlpha = fade * (k < 0.85 ? 0.85 : (1 - k) * 5); c.strokeStyle = st.c[0]; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y - k * 5, 2 + k * 6, 0, 6.283); c.stroke();
          c.globalAlpha *= 0.3; c.fillStyle = st.c[1]; c.fill();
        }
      } else if (t === 'electric') {                      // static that jumps about
        c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
        for (let i = 0; i < n(4); i++) {
          const ph = Math.floor(now * 9 + i * 2.3), sd = z.seed + ph + i * 7; let [x, y] = spot({ seed: sd, x: z.x, y: z.y }, 2, R * 0.8, ry);
          c.globalAlpha = fade * (1 - ((now * 9 + i * 2.3) % 1)); c.strokeStyle = i % 2 ? '#ffffff' : st.c[1]; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y);
          for (let k = 0; k < 3; k++) { x += (srand(sd, k) - 0.5) * 34; y -= srand(sd, k + 4) * 14; c.lineTo(x, y); }
          c.stroke();
        }
      } else if (t === 'ice') {                           // frost that has grown outward
        c.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * 6.283 + z.seed, len = R * (0.45 + 0.4 * srand(z.seed, i)) * grow, x2 = z.x + Math.cos(a) * len, y2 = z.y + Math.sin(a) * len * ry;
          c.globalAlpha = fade * 0.8; c.strokeStyle = st.c[i % 2]; c.lineWidth = 1.6; c.beginPath(); c.moveTo(z.x, z.y); c.lineTo(x2, y2); c.stroke();
          for (const side of [-1, 1]) { const mx = z.x + (x2 - z.x) * 0.6, my = z.y + (y2 - z.y) * 0.6; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(a + side * 0.9) * len * 0.25, my + Math.sin(a + side * 0.9) * len * 0.25 * ry); c.stroke(); }
          c.globalAlpha = fade * Math.max(0, Math.sin(now * 2.5 + i * 2)); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x2, y2, 1.8, 0, 6.283); c.fill();
        }
      } else {                                            // anything else: motes that circle lazily
        c.globalCompositeOperation = st.add ? 'lighter' : 'source-over';
        for (let i = 0; i < n(5); i++) { const a = now * (1 + (i % 3) * 0.4) + i * 1.26, rr = R * (0.3 + 0.12 * i); c.globalAlpha = fade * 0.75; c.fillStyle = st.c[i % 2]; c.beginPath(); c.arc(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * ry - 4, 2.6, 0, 6.283); c.fill(); }
      }
    }
    c.restore();
  }

  // Snow settles in patches and rain gathers in puddles, each for a short time (owner's wish, 0.6). They are marks of
  // light on the ground canvas like every other effect: they grow while the weather lasts and fade by themselves.
  const MARK_MAX = 46, MARK_LIFE = { snow: [16, 26], rain: [11, 18] };
  function mark(kind) {
    if (M.length >= MARK_MAX) return;
    const x = U.rand(30, W - 30), y = U.rand(H * 0.12, H - 14);
    for (const m of M) if (Math.abs(m.x - x) < m.rx + 40 && Math.abs(m.y - y) < m.ry + 16) { if (m.kind === kind && m.age < m.life - 5) m.life = Math.min(m.life + 2.5, m.age + 30); return; }      // falling on one that is there: it lasts longer
    const big = U.rand(0.7, 1.5), L = MARK_LIFE[kind];
    M.push({ kind, x, y, rx: (kind === 'snow' ? 34 : 30) * big, ry: (kind === 'snow' ? 9 : 7.5) * big, age: 0, life: U.rand(L[0], L[1]), seed: Math.random() * 1000 });
  }
  /** draw the marks on the ground canvas. now: game seconds */
  function drawMarks(c, now) {
    if (!M.length) return;
    c.save();
    for (const m of M) {
      const k = Math.min(1, m.age / 3) * Math.min(1, (m.life - m.age) / 4), grow = 0.35 + 0.65 * Math.min(1, m.age / 4);
      if (k <= 0) continue;
      const rx = m.rx * grow, ry = m.ry * grow;
      if (m.kind === 'snow') {
        for (let i = 0; i < 4; i++) {                        // a few overlapping drifts
          const ox = Math.sin(m.seed + i * 2.1) * rx * 0.45, oy = Math.cos(m.seed * 1.7 + i) * ry * 0.3, r = 0.55 + 0.3 * Math.abs(Math.sin(m.seed * 3 + i));
          c.globalAlpha = k * 0.5; c.fillStyle = i ? '#f3f8ff' : '#dfeafb';
          c.beginPath(); c.ellipse(m.x + ox, m.y + oy + (i ? 0 : 2), rx * r, ry * r, 0, 0, 6.283); c.fill();
        }
        c.globalAlpha = k * 0.7; c.fillStyle = '#ffffff';
        c.beginPath(); c.ellipse(m.x - rx * 0.12, m.y - ry * 0.22, rx * 0.5, ry * 0.42, 0, 0, 6.283); c.fill();
      } else {
        c.globalAlpha = k * 0.34; c.fillStyle = '#5f9fe0';
        c.beginPath(); c.ellipse(m.x, m.y, rx, ry, 0, 0, 6.283); c.fill();
        c.globalAlpha = k * 0.3; c.fillStyle = '#a9d2f7';
        c.beginPath(); c.ellipse(m.x - rx * 0.1, m.y - ry * 0.12, rx * 0.72, ry * 0.62, 0, 0, 6.283); c.fill();
        c.globalAlpha = k * 0.6; c.strokeStyle = '#e4f3ff'; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(m.x - rx * 0.2, m.y - ry * 0.25, rx * 0.5, ry * 0.4, 0, 3.5, 5.3); c.stroke();
        const rp = ((now * 0.8 + m.seed) % 1.6) / 1.6;      // a slow ring now and then
        if (rp < 0.6) { c.globalAlpha = k * 0.5 * (1 - rp / 0.6); c.beginPath(); c.ellipse(m.x + Math.sin(m.seed) * rx * 0.3, m.y, rx * 0.25 * (0.3 + rp), ry * 0.25 * (0.3 + rp), 0, 0, 6.283); c.stroke(); }
      }
    }
    c.restore();
  }
  /** spawn weather particles across the whole screen (rain, sun, sand, hail, snow) */
  function weatherTick(kind, dt) { inWeather = true; try { weatherSpawn(kind, dt); } finally { inWeather = false; } }
  function weatherSpawn(kind, dt) {
    const area = (W * H) / (1920 * 1080), n = (r) => { const v = r * dt * area * mult; return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0); };
    if (kind === 'snow' || kind === 'rain') for (let i = n(kind === 'snow' ? 1.1 : 1.5); i > 0; i--) mark(kind);
    if (kind === 'rain') {
      for (let i = n(150); i > 0; i--) part({ x: U.rand(-80, W), y: -10, vx: 140, vy: U.rand(900, 1200), life: (H / 1000) * 1.05, size: 2, col: 'rgba(170,210,255,.75)', shape: 'streak', drag: 0 });
      for (let i = n(26); i > 0; i--) ring(U.rand(0, W), U.rand(H * 0.25, H), 1, U.rand(7, 13), 'rgba(190,220,255,.8)', 0.32, 1.3);        // splashes
    } else if (kind === 'sand') for (let i = n(110); i > 0; i--) part({ x: -10, y: U.rand(0, H), vx: U.rand(700, 1000), vy: U.rand(-30, 60), life: (W / 800) * 1.05, size: 2, col: U.pick(['rgba(214,180,110,.7)', 'rgba(190,150,80,.6)']), shape: 'streak', drag: 0 });
    else if (kind === 'hail') for (let i = n(70); i > 0; i--) part({ x: U.rand(-40, W), y: -10, vx: U.rand(-20, 60), vy: U.rand(380, 520), life: H / 380, size: U.rand(3, 5), col: 'rgba(240,250,255,.9)', shape: 'shard', drag: 0, vr: 4 });
    else if (kind === 'snow') for (let i = n(55); i > 0; i--) part({ x: U.rand(-40, W), y: -10, vx: U.rand(-10, 30), vy: U.rand(70, 140), life: H / 70, size: U.rand(2, 4.5), col: 'rgba(245,250,255,.92)', shape: 'dot', drag: 0, vr: 1, sway: U.rand(20, 60) });
    else if (kind === 'sun') for (let i = n(14); i > 0; i--) glint(U.rand(0, W), U.rand(0, H * 0.85), U.rand(6, 13), 'rgba(255,236,150,.85)');
  }
  /** the part of the weather that is not particles: shafts of sunlight, banks of blowing sand. k fades it in and out */
  function drawWeather(c, kind, now, k) {
    if (k <= 0 || (kind !== 'sun' && kind !== 'sand')) return;
    c.save();
    if (kind === 'sun') {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = W * (0.08 + i * 0.21) + Math.sin(now * 0.22 + i * 1.9) * 60, w = 70 + 40 * Math.sin(now * 0.3 + i), lean = H * 0.32;
        const gr = c.createLinearGradient(x, 0, x + lean, H); gr.addColorStop(0, 'rgba(255,238,160,1)'); gr.addColorStop(1, 'rgba(255,238,160,0)');
        c.globalAlpha = k * (0.05 + 0.025 * Math.sin(now * 0.7 + i * 2.3)); c.fillStyle = gr;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w * 1.6 + lean, H); c.lineTo(x + lean - w * 0.3, H); c.closePath(); c.fill();
      }
    } else {
      for (let i = 0; i < 6; i++) { const x = ((now * (90 + i * 22) + i * 400) % (W + 700)) - 350, y = H * (0.12 + 0.15 * i) + Math.sin(now * 0.5 + i) * 30; blob(c, x, y, 230 + 40 * i, 'rgb(214,180,110)', k * 0.085); }
    }
    c.restore();
  }

  function clear() {
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0); gctx.clearRect(0, 0, W, H);
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, W, H);
  }
  function drawTop() {
    const c = tctx;
    for (const pass of clipR ? [0, 1] : [-1]) {          // (with a clip: what is not weather first, then the weather inside the clip)
      c.save();
      if (pass === 1) clipTo(c);
      let add = false;
      for (const p of P) {
        if (pass >= 0 && !!p.wx !== !!pass) continue;
        if (!!p.add !== add) { add = !!p.add; c.globalCompositeOperation = add ? 'lighter' : 'source-over'; }
        drawParticle(c, p);
      }
      c.globalCompositeOperation = 'lighter';
      for (const s of S) if (pass < 0 || !!s.wx === !!pass) drawShape(c, s);
      c.restore();
    }
  }
  function drawTexts() {
    const c = tctx;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const t of T) {
      c.globalAlpha = Math.min(1, (t.dur - t.age) * 3) * Math.min(1, t.age * 12 + 0.25);
      c.font = `${t.bold ? '700 ' : '600 '}${t.size}px "Segoe UI", system-ui, sans-serif`;
      if (t.w === undefined) t.w = c.measureText(t.str).width;                 // keep the whole line on the screen
      const x = Math.min(Math.max(t.x, t.w / 2 + 6), Math.max(t.w / 2 + 6, W - t.w / 2 - 6)), y = Math.min(Math.max(t.y, t.size * 0.5 + 4), H - t.size * 0.5 - 4);
      const pop = t.age < 0.12 ? 1 + (0.12 - t.age) * 2.2 : 1;                 // a tiny pop when it appears
      if (pop !== 1) { c.save(); c.translate(x, y); c.scale(pop, pop); c.translate(-x, -y); }
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(12,14,20,.92)'; c.strokeText(t.str, x, y);
      c.fillStyle = t.col; c.fillText(t.str, x, y);
      if (pop !== 1) c.restore();
    }
    c.restore();
  }

  return { TYPE, col, style, init, resize, reset, setIntensity, part, burst, puff, sparkle, hearts, dust, glint, ring, beam, slash, bolt, impact, gather, set onShake(f) { onShake = f; }, text, update, busy, clear, drawTop, drawTexts, drawZone, weatherTick, setClip, drawWeather, drawMarks, marks: () => M.length,
    get g() { return gctx; }, get t() { return tctx; }, get W() { return W; }, get H() { return H; } };
})();
