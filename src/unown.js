// Screen Trainer — Living Unown (0.9.8, owner's list 11-16 update 17).
//
// Text written in Unown that is alive: every letter is a small creature with an eye. It hops in quickly to the place it
// was typed and then loiters there, knowing it is being read (its eye follows the mouse) but still a little bored (it
// drifts, glances away, blinks, now and then gives a small hop). The letters of a sentence drift together, the
// sentences of a paragraph drift together, the paragraphs of a page drift together: loosely, so it stays readable, just.
//
// Where the letters come from:
//   - A to Z, ! and ? are the owner's own Unown pictures (201 and its looks "b" ... "z", "exclamation", "question"),
//     read from the sprites folder like every other sprite (overlay rule 5: no Pokémon picture is part of the program).
//     A look the folder does not have is drawn as below.
//   - Every other character (small letters, digits, punctuation, emoji, any letter of any script) is a new Unown made
//     here: the character drawn thick in Unown's ink, with an eye where the stroke is widest. A character too thin for
//     an eye (a comma, a dot, a dash) gets a little round body to carry one. Emoji become their own silhouette in ink.
//
// Unown.glyph(ch) -> { cv, w, h, eye: { x, y, r } | null } in units of the glyph's height (cached).
// Unown.living(canvas, { cw, lh, size, pad }) -> { setText(text), setView(x, y), setPointer(x, y), plain(on), stop(), state() }
'use strict';

const Unown = (() => {
  const INK = '#2c2d39', RIM = '#565a6e', EYE = '#ffffff', PUPIL = '#16161d';
  const RES = 64;                                        // a generated glyph is drawn RES squares high, then scaled
  const cache = new Map();
  const has = typeof document !== 'undefined';

  // ---------------------------------------------------------------- the owner's Unown pictures for A-Z ! ?
  const LOOK = (ch) => (ch === 'A' ? '' : ch === '!' ? 'exclamation' : ch === '?' ? 'question' : /^[A-Z]$/.test(ch) ? ch.toLowerCase() : null);
  /** the file of the owner's Unown for this character, or null (also when the folder's set lacks that look: then
   *  Sprites.still falls back to the plain "A", which would be the wrong letter) */
  function spriteFor(ch) {
    const look = LOOK(ch);
    if (look === null || typeof Sprites === 'undefined' || !Sprites.ready()) return null;
    const plain = Sprites.still(201, false, ''), url = Sprites.still(201, false, look);
    return url && (look === '' || url !== plain) ? url : null;
  }

  // ---------------------------------------------------------------- new Unown, drawn here
  const isEmoji = (ch) => /\p{Extended_Pictographic}/u.test(ch);
  /** where an eye fits best: the inked point furthest from the edge of the ink (a distance map, two passes) */
  function eyeSpot(data, w, h) {
    const D = new Float32Array(w * h), INF = 1e9;
    for (let i = 0; i < w * h; i++) D[i] = data[i * 4 + 3] > 120 ? INF : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (D[i]) D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (D[i]) D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
    let best = -1, bx = w / 2, by = h / 2, sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = D[y * w + x]; if (d > 0) { sx += x; sy += y; n++; } if (d > best || (d === best && Math.abs(y - h * 0.42) < Math.abs(by - h * 0.42))) { best = d; bx = x; by = y; } }
    return { x: bx, y: by, d: best, cx: n ? sx / n : w / 2, cy: n ? sy / n : h / 2, ink: n };
  }
  function makeGlyph(ch) {
    const w = RES, h = RES, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const emoji = isEmoji(ch);
    g.font = emoji ? `${Math.round(h * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif` : `bold ${Math.round(h * 0.66)}px "Segoe UI", "Arial Rounded MT Bold", Arial, "DotGothic16", sans-serif`;
    if (emoji) {
      g.fillText(ch, w / 2, h * 0.54);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = INK; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';      // its own outline, in ink
      g.strokeStyle = INK; g.lineWidth = 3;
    } else {
      g.strokeStyle = RIM; g.lineWidth = h * 0.15; g.strokeText(ch, w / 2, h * 0.53);
      g.strokeStyle = INK; g.lineWidth = h * 0.1; g.strokeText(ch, w / 2, h * 0.53);
      g.fillStyle = INK; g.fillText(ch, w / 2, h * 0.53);
    }
    let data = null;
    try { data = g.getImageData(0, 0, w, h).data; } catch (e) { data = null; }
    let eye = null;
    if (data) {
      let s = eyeSpot(data, w, h);
      if (!s.ink) return { cv, w: 1, h: 1, eye: null };
      if (s.d < h * 0.07) {                              // too thin for an eye: a little round body of its own, on the ink
        const r = h * 0.15, bx = s.cx, by = Math.min(h - r - 2, Math.max(r + 2, s.cy));
        g.fillStyle = RIM; g.beginPath(); g.arc(bx, by, r + 2, 0, 6.2832); g.fill();
        g.fillStyle = INK; g.beginPath(); g.arc(bx, by, r, 0, 6.2832); g.fill();
        s = { x: bx, y: by, d: r };
      }
      const r = Math.min(s.d * 0.62, h * 0.095);           // (small enough that the letter stays a letter: tried on the Field Dex title)
      eye = { x: s.x / w, y: s.y / h, r: r / h };
      g.fillStyle = EYE; g.beginPath(); g.arc(s.x, s.y, r, 0, 6.2832); g.fill();
    }
    return { cv, w: 1, h: 1, eye, made: true };
  }

  /** the glyph for one character (a code point). Cached. A sprite-letter starts as a drawn one and becomes the picture
   *  once that has loaded (trimmed to the letter: the pictures have empty space round it). */
  function glyph(ch) {
    if (!has || !ch || /^\s$/.test(ch)) return null;
    if (cache.has(ch)) return cache.get(ch);
    const gl = makeGlyph(ch);
    cache.set(ch, gl);
    const url = spriteFor(ch);
    if (url) {
      const im = new Image();
      im.onload = () => {
        try {
          const t = document.createElement('canvas'); t.width = im.naturalWidth; t.height = im.naturalHeight;
          const tg = t.getContext('2d'); tg.drawImage(im, 0, 0);
          const d = tg.getImageData(0, 0, t.width, t.height).data;
          let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1;
          for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (d[(y * t.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (x1 < x0) return;
          const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh), cv = document.createElement('canvas');
          cv.width = side; cv.height = side;
          const cg = cv.getContext('2d'); cg.imageSmoothingEnabled = false; cg.drawImage(t, x0, y0, bw, bh, Math.round((side - bw) / 2), Math.round((side - bh) / 2), bw, bh);
          Object.assign(gl, { cv, eye: null, made: false, sprite: true, pixel: true });      // (the owner's Unown has an eye of its own)
        } catch (e) { /* the picture could not be read: the drawn letter stays */ }
      };
      im.src = url;
    }
    return gl;
  }

  // ---------------------------------------------------------------- living text
  const SENT_END = /[.!?。！？]/;
  /** text -> the place of every character: [{ ch, col, row, sent, para }] (spaces and line ends are places too, with no glyph) */
  /** cols (0.9.8.1): the page is that many characters wide; a line that is full carries on in the next row, as the
   *  notepad's text box does (it breaks anywhere, spaces included). 0 = lines are as long as they are. */
  function layout(chars, tab, cols) {
    const out = [];
    let col = 0, row = 0, sent = 0, para = 0, blank = false;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (cols > 0 && col >= cols && ch !== '\n') { row++; col = 0; }
      out.push({ ch, col, row, sent, para });
      if (ch === '\n') { row++; col = 0; if (blank) { para++; sent++; } blank = true; continue; }
      if (ch === '\t') { col = (Math.floor(col / tab) + 1) * tab; if (cols > 0 && col > cols) col = cols; continue; }
      if (!/\s/.test(ch)) blank = false;
      col++;
      if (SENT_END.test(ch) && (i + 1 >= chars.length || /\s/.test(chars[i + 1]))) sent++;
    }
    return out;
  }
  /** what stayed, what went, what came: the longest same start and the longest same end */
  function diff(a, b) {
    let p = 0; const n = Math.min(a.length, b.length);
    while (p < n && a[p] === b[p]) p++;
    let s = 0;
    while (s < n - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return { p, s };
  }
  const HOP = 0.32;                                       // seconds to hop into place
  /** the drift of a sentence, a paragraph, and of each letter: a few slow waves (seed: who) */
  const wave = (t, seed, sp) => Math.sin(t * sp + seed * 6.17) * 0.6 + Math.sin(t * sp * 0.43 + seed * 2.3) * 0.4;
  const rnd = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };

  function living(canvas, o) {
    o = Object.assign({ cw: 16, lh: 30, size: 24, pad: { x: 6, y: 4 }, tab: 4, cols: 0, hop: true, stagger: 0.004, calm: 1, halo: '' }, o || {});      // halo: a glow round each letter, for a dark background
    const g = canvas.getContext('2d');
    let chars = [], actors = [], dying = [], view = { x: 0, y: 0 }, pointer = { x: -1, y: -1, at: -99 }, plainOn = false, raf = 0, seq = 1, stopped = false;
    const now = () => performance.now() / 1000;
    function spawnFrom(tx, ty) {                          // it comes from the nearest side, a little above
      const W = canvas.clientWidth || canvas.width, side = tx < W / 2 ? -1 : 1;
      return { x: side < 0 ? -o.cw * 2 : W + o.cw * 2, y: ty - o.lh * (0.5 + Math.random()) };
    }
    function setText(text) {
      const next = Array.from(String(text || ''));
      const { p, s } = diff(chars, next), t = now();
      const keepEnd = actors.slice(actors.length - s), gone = actors.slice(p, actors.length - s);
      for (const a of gone) if (a.g) { a.dieAt = t; dying.push(a); }
      const fresh = [];
      for (let i = p; i < next.length - s; i++) fresh.push({ id: seq++, ch: next[i], g: glyph(next[i]), born: t + (o.hop ? Math.min(1.2, (i - p) * o.stagger) : -9), seed: rnd(seq * 7919), x: 0, y: 0, from: null, hopAt: t + 4 + Math.random() * 12, blinkAt: t + 2 + Math.random() * 6, lookAt: 0, gaze: { x: 0, y: 0 } });
      actors = actors.slice(0, p).concat(fresh, keepEnd);
      chars = next;
      const L = layout(chars, o.tab, o.cols);
      actors.forEach((a, i) => { const l = L[i]; a.tx = o.pad.x + l.col * o.cw + o.cw / 2; a.ty = o.pad.y + l.row * o.lh + o.lh / 2; a.sent = l.sent; a.para = l.para; if (!a.from) { a.from = spawnFrom(a.tx, a.ty); a.x = a.tx; a.y = a.ty; } });
      kick();
    }
    function frame() {
      raf = 0;
      if (stopped) return;
      const t = now(), W = canvas.width / (window.devicePixelRatio || 1), H = canvas.height / (window.devicePixelRatio || 1), dpr = window.devicePixelRatio || 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (plainOn) { return; }
      const reading = t - pointer.at < 3, size = o.size, calm = o.calm;
      for (const a of actors) {
        if (!a.g) continue;
        let x, y;
        const k = (t - a.born) / HOP;
        if (k < 1) {
          if (k < 0) continue;                            // (still to come: staggered)
          const e = k * (2 - k);
          x = a.from.x + (a.tx - a.from.x) * e; y = a.from.y + (a.ty - a.from.y) * e - Math.sin(k * Math.PI) * o.lh * 1.1;
        } else {
          // loitering: its own little sway, its sentence's drift, its paragraph's drift (loosely together)
          const sx = wave(t, a.sent * 0.37 + 0.11, 0.21), sy = wave(t, a.sent * 0.53 + 0.29, 0.17), px = wave(t, a.para * 0.71 + 0.5, 0.09), py = wave(t, a.para * 0.43 + 0.9, 0.08);
          x = a.tx + calm * (Math.sin(t * (0.6 + a.seed * 0.5) + a.seed * 40) * o.cw * 0.07 + sx * o.cw * 0.13 + px * o.cw * 0.1);
          y = a.ty + calm * (Math.cos(t * (0.8 + a.seed * 0.4) + a.seed * 30) * o.lh * 0.04 + sy * o.lh * 0.07 + py * o.lh * 0.06);
          if (t > a.hopAt) { const hk = (t - a.hopAt) / 0.28; if (hk >= 1) a.hopAt = t + 6 + Math.random() * 16; else y -= Math.sin(hk * Math.PI) * o.lh * 0.18 * calm; }      // bored: a small hop now and then
        }
        x -= view.x; y -= view.y;
        if (x < -size || y < -size || x > W + size || y > H + size) continue;
        drawOne(a, x, y, size, t, reading, 1);
      }
      dying = dying.filter((a) => t - a.dieAt < 0.3);
      for (const a of dying) { const k = (t - a.dieAt) / 0.3; drawOne(a, a.tx - view.x, a.ty - view.y + k * k * o.lh, size * (1 - k * 0.4), t, false, 1 - k); }
      kick();
    }
    function drawOne(a, x, y, size, t, reading, alpha) {
      const gl = a.g, cv = gl.cv, w = size * (cv.width / cv.height), h = size;
      g.globalAlpha = alpha;
      g.imageSmoothingEnabled = !gl.pixel;
      if (o.halo) { g.shadowColor = o.halo; g.shadowBlur = Math.max(2, size * (o.haloSize || 0.18)); if (o.haloSize) g.drawImage(cv, x - w / 2, y - h / 2, w, h); }      // (haloSize: a stronger glow, drawn twice, for a busy ground)
      g.drawImage(cv, x - w / 2, y - h / 2, w, h);
      if (o.halo) { g.shadowColor = 'transparent'; g.shadowBlur = 0; }
      if (gl.eye) {
        const ex = x - w / 2 + gl.eye.x * w, ey = y - h / 2 + gl.eye.y * h, er = gl.eye.r * h;
        if (t > a.blinkAt) { if (t - a.blinkAt > 0.13) a.blinkAt = t + 2.5 + Math.random() * 7; else { g.fillStyle = INK; g.beginPath(); g.arc(ex, ey, er + 0.5, 0, 6.2832); g.fill(); g.globalAlpha = 1; return; } }      // a blink
        let dx, dy;
        if (reading && pointer.x > -1) { dx = pointer.x - view.x - ex; dy = pointer.y - view.y - ey; }      // it knows it is being read
        else { if (t > a.lookAt) { a.lookAt = t + 1.5 + Math.random() * 4; const ang = Math.random() * 6.2832; a.gaze = { x: Math.cos(ang), y: Math.sin(ang) * 0.6 }; } dx = a.gaze.x; dy = a.gaze.y; }      // bored: it looks about
        const d = Math.hypot(dx, dy) || 1, m = er * 0.42;
        g.fillStyle = PUPIL; g.beginPath(); g.arc(ex + (dx / d) * m, ey + (dy / d) * m, er * 0.5, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
    }
    function kick() { if (!raf && !stopped && has) raf = requestAnimationFrame(frame); }
    return {
      setText,
      setView(x, y) { view = { x: x || 0, y: y || 0 }; kick(); },
      setPointer(x, y) { pointer = { x, y, at: now() }; },
      plain(on) { plainOn = !!on; kick(); },
      stop() { stopped = true; if (raf) cancelAnimationFrame(raf); },
      state: () => ({ chars: chars.length, glyphs: actors.filter((a) => a.g).length, dying: dying.length, sentences: actors.length ? Math.max(...actors.map((a) => a.sent)) + 1 : 0, paragraphs: actors.length ? Math.max(...actors.map((a) => a.para)) + 1 : 0 }),
      _actors: () => actors,
    };
  }

  return { glyph, living, layout, diff, spriteFor, LOOK, isEmoji };
})();
if (typeof module !== 'undefined') module.exports = Unown;
