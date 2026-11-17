// Screen Trainer — built-in sounds and music, used until a sound bank is imported from a ROM (and for any
// sound a bank does not have). Everything here is synthesised from scratch: chip-style blips, a
// species-seeded "cry", and endlessly generated background and battle tunes. No DOM, no Node APIs.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tunes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /** add one voice to a buffer. part = [wave, startHz, endHz, seconds, volume, delaySeconds, duty] */
  function voice(out, rate, [wave, f0, f1, dur, vol = 0.3, delay = 0, duty = 0.5], seed = 1) {
    const n = Math.floor(dur * rate), at = Math.floor(delay * rate), rnd = rng(seed);
    let ph = 0, hold = 0, noise = 1;
    for (let i = 0; i < n && at + i < out.length; i++) {
      const k = i / n, f = f0 * Math.pow(f1 / f0, k), env = Math.min(1, i / (rate * 0.004)) * Math.min(1, (n - i) / (rate * 0.012));
      ph += f / rate; if (ph >= 1) ph -= 1;
      let v;
      if (wave === 'sq') v = ph < duty ? 1 : -1;
      else if (wave === 'tri') v = 4 * Math.abs(ph - 0.5) - 1;
      else if (wave === 'saw') v = 2 * ph - 1;
      else { hold += f / rate; if (hold >= 1) { hold -= 1; noise = rnd() * 2 - 1; } v = noise; }
      out[at + i] += v * vol * env * (wave === 'noise' ? 1 : 1 - k * 0.5);
    }
  }
  function build(rate, parts, seed) {
    const len = parts.reduce((m, p) => Math.max(m, (p[3] || 0) + (p[5] || 0)), 0) + 0.03, out = new Float32Array(Math.ceil(len * rate));
    parts.forEach((p, i) => voice(out, rate, p, seed + i * 7));
    return out;
  }
  const arp = (notes, step, len, vol = 0.22, wave = 'sq', duty = 0.25) => notes.map((m, i) => [wave, hz(m), hz(m), len, vol, i * step, duty]);

  const SFX = {
    select: [['sq', 1320, 1320, 0.045, 0.2]], open: [['sq', 660, 990, 0.07, 0.2], ['sq', 990, 1320, 0.09, 0.2, 0.07]], close: [['sq', 1320, 990, 0.07, 0.2], ['sq', 990, 660, 0.09, 0.2, 0.07]],
    page: [['sq', 880, 880, 0.03, 0.18], ['sq', 1175, 1175, 0.04, 0.18, 0.03]], scroll: [['sq', 1760, 1760, 0.015, 0.12]], boxOpen: [['tri', 330, 660, 0.12, 0.3], ['sq', 880, 880, 0.06, 0.18, 0.12]],
    boxClose: [['tri', 660, 330, 0.12, 0.3], ['sq', 440, 440, 0.06, 0.18, 0.12]], pick: [['sq', 990, 990, 0.03, 0.18]], drop: [['sq', 660, 660, 0.04, 0.18]], error: [['sq', 196, 196, 0.09, 0.22], ['sq', 196, 196, 0.12, 0.22, 0.12]],
    use: [['tri', 523, 1046, 0.16, 0.3]], save: arp([72, 76, 79], 0.07, 0.09), bag: [['noise', 3000, 1500, 0.04, 0.12]],
    throw: [['noise', 6000, 900, 0.22, 0.14], ['sq', 420, 980, 0.2, 0.14, 0, 0.25]], ballOpen: [['noise', 5000, 800, 0.12, 0.2], ['sq', 1300, 320, 0.16, 0.2]], bounce: [['tri', 300, 150, 0.08, 0.35]],
    bounce2: [['tri', 280, 140, 0.07, 0.28]], bounce3: [['tri', 260, 130, 0.06, 0.2]], shake: [['sq', 520, 520, 0.03, 0.2], ['sq', 390, 390, 0.04, 0.2, 0.05]], click: [['sq', 1568, 1568, 0.03, 0.2], ['sq', 2093, 2093, 0.06, 0.2, 0.04]],
    caught: arp([72, 76, 79, 84, 79, 84, 88], 0.085, 0.11, 0.24).concat([['tri', hz(48), hz(48), 0.7, 0.3]]), breakFree: [['noise', 4000, 500, 0.16, 0.22], ['sq', 820, 210, 0.2, 0.18]],
    hit: [['noise', 2400, 500, 0.07, 0.3], ['tri', 220, 110, 0.08, 0.3]], hitSuper: [['noise', 3600, 400, 0.13, 0.36], ['tri', 330, 80, 0.16, 0.34]], hitWeak: [['tri', 180, 140, 0.06, 0.26]],
    faint: [['sq', 620, 90, 0.5, 0.2, 0, 0.25]], flee: [['sq', 320, 640, 0.07, 0.18], ['sq', 480, 960, 0.07, 0.18, 0.08], ['sq', 640, 1280, 0.09, 0.18, 0.16]], statUp: [['tri', 400, 1200, 0.3, 0.26]],
    statDown: [['tri', 1200, 400, 0.3, 0.26]], heal: arp([72, 76, 79], 0.06, 0.1, 0.2, 'tri'), protect: [['tri', 880, 1320, 0.2, 0.24]], poke: [['noise', 2500, 1200, 0.03, 0.2], ['sq', 700, 500, 0.04, 0.16]],
    explode: [['noise', 1200, 100, 0.6, 0.4]], brn: [['noise', 3000, 800, 0.18, 0.18]], psn: [['sq', 300, 220, 0.2, 0.18, 0, 0.125]], par: [['sq', 1800, 900, 0.05, 0.16], ['sq', 1800, 900, 0.05, 0.16, 0.07]],
    slp: [['tri', 500, 250, 0.4, 0.2]], frz: [['sq', 2400, 3200, 0.12, 0.14, 0, 0.125]], confuse: [['tri', 600, 900, 0.1, 0.2], ['tri', 900, 600, 0.1, 0.2, 0.1]], trap: [['saw', 200, 300, 0.2, 0.16]],
    seed: [['tri', 700, 1000, 0.1, 0.2]], love: arp([79, 84], 0.07, 0.1, 0.2), rain: [['noise', 5000, 3000, 0.7, 0.12]], sun: [['tri', 660, 1320, 0.5, 0.2]], sand: [['noise', 1500, 900, 0.8, 0.14]],
    hail: [['noise', 7000, 5000, 0.5, 0.12]], snow: [['tri', 1500, 1100, 0.4, 0.14]], terrain: [['tri', 220, 440, 0.5, 0.24]], screen: [['sq', 1200, 1200, 0.05, 0.16], ['sq', 1600, 1600, 0.2, 0.14, 0.05]],
    hazard: [['noise', 1800, 600, 0.12, 0.22]], web: [['saw', 900, 500, 0.2, 0.12]], teleport: [['sq', 400, 2400, 0.25, 0.16, 0, 0.125]],
    hop: [['tri', 210, 430, 0.07, 0.26]], land: [['noise', 900, 300, 0.04, 0.16]], pet: [['sq', 1046, 1046, 0.05, 0.16], ['sq', 1318, 1318, 0.08, 0.16, 0.06]],
    shiny: [['sq', 2093, 2093, 0.05, 0.14, 0, 0.125], ['sq', 2637, 2637, 0.05, 0.14, 0.06, 0.125], ['sq', 3136, 3136, 0.12, 0.14, 0.12, 0.125]],
    levelUp: arp([79, 84, 88, 91], 0.07, 0.1, 0.24), evolve: arp([72, 76, 79, 84, 88, 91, 96], 0.09, 0.14, 0.24).concat([['tri', hz(48), hz(48), 0.9, 0.3]]), item: arp([76, 79, 84], 0.08, 0.12, 0.22),
    berry: arp([79, 83], 0.07, 0.1, 0.2), treasure: arp([76, 80, 83, 88], 0.08, 0.12, 0.22), badge: arp([72, 72, 72, 76, 79, 84], 0.11, 0.14, 0.24).concat([['tri', hz(48), hz(55), 0.8, 0.3]]),
    pickup: [['sq', 1175, 1175, 0.04, 0.18], ['sq', 1568, 1568, 0.07, 0.18, 0.05]], recover: arp([67, 72, 76], 0.07, 0.1, 0.2, 'tri'), lead: arp([72, 79, 84], 0.08, 0.12, 0.22), exp: [['sq', 880, 1760, 0.12, 0.14]],
    alert: [['sq', 880, 880, 0.06, 0.18], ['sq', 880, 880, 0.06, 0.18, 0.1]],
  };
  const TYPE_TONE = { normal: ['tri', 300, 200], fighting: ['noise', 1500, 400], flying: ['noise', 5000, 2500], poison: ['sq', 260, 180], ground: ['noise', 500, 120], rock: ['noise', 900, 250], bug: ['saw', 800, 600],
    ghost: ['tri', 180, 260], steel: ['sq', 2200, 1800], fire: ['noise', 2600, 700], water: ['tri', 700, 350], grass: ['saw', 500, 900], electric: ['sq', 1900, 700], psychic: ['tri', 900, 1500], ice: ['sq', 2600, 3400],
    dragon: ['saw', 160, 320], dark: ['saw', 240, 120], fairy: ['tri', 1300, 2000] };

  /** a named effect, or an attack sound ("move", { type, style }); mono Float32Array or null */
  function sfx(name, rate, param) {
    if (name === 'move') {
      const [w, a, b] = TYPE_TONE[(param && param.type) || 'normal'] || TYPE_TONE.normal, long = param && (param.style === 'beam' || param.style === 'wave');
      return build(rate, [[w, a, b, long ? 0.34 : 0.16, 0.2, 0, 0.25], ['noise', 2000, 600, 0.05, 0.12]], 11);
    }
    return SFX[name] ? build(rate, SFX[name], 5) : null;
  }

  /** a made-up call for a species: two or three sliding chirps, the same every time for the same species */
  function cry(sp, rate, pitch = 1) {
    const r = rng(sp * 2654435761), parts = [], n = 2 + Math.floor(r() * 2), base = (220 + r() * 520) * pitch;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const dur = 0.09 + r() * 0.2, a = base * (0.7 + r() * 0.9), b = a * (0.55 + r() * 1.1);
      parts.push([r() < 0.6 ? 'sq' : 'saw', a, b, dur, 0.2, t, [0.125, 0.25, 0.5][Math.floor(r() * 3)]]);
      if (r() < 0.5) parts.push(['noise', 1800 + r() * 2500, 800, dur * 0.6, 0.07, t]);
      t += dur * (0.75 + r() * 0.3);
    }
    return build(rate, parts, sp);
  }

  // ------------------------------------------------------------------ generated music
  const NAMES_A = ['Meadow', 'Harbor', 'Lantern', 'Orchard', 'Hilltop', 'Riverside', 'Pinewood', 'Sunrise', 'Cobble', 'Windmill', 'Clover', 'Tidepool'];
  const NAMES_B = ['Stroll', 'Path', 'Breeze', 'Morning', 'Lullaby', 'Parade', 'Daydream', 'Shuffle', 'Waltz', 'Journey'];
  const title = (seed, mood) => { const r = rng(seed * 97 + 3); const a = NAMES_A[Math.floor(r() * NAMES_A.length)], b = NAMES_B[Math.floor(r() * NAMES_B.length)]; return mood === 'battle' ? `${a} Showdown` : `${a} ${b}`; };
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  const PROG = { major: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 2, 3, 4]], minor: [[0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 4], [0, 5, 3, 4]] };

  class Player {
    constructor(seed, mood, rate) {
      this.rate = rate; this.mood = mood === 'battle' ? 'battle' : 'roam'; this.seed = seed >>> 0; this.title = title(seed, this.mood);
      const r = rng(this.seed * 31 + (this.mood === 'battle' ? 17 : 5));
      this.minor = this.mood === 'battle' ? true : r() < 0.25;
      this.scale = this.minor ? MINOR : MAJOR; this.root = 57 + Math.floor(r() * 8);
      this.bpm = this.mood === 'battle' ? 150 + Math.floor(r() * 26) : 92 + Math.floor(r() * 34);
      this.step = (rate * 60) / this.bpm / 4; this.pos = 0; this.i = 0; this.voices = []; this.done = false; this.loops = 0; this.ok = true;
      const pick = (arr) => arr[Math.floor(r() * arr.length)], progs = PROG[this.minor ? 'minor' : 'major'];
      const A = pick(progs), B = pick(progs);
      this.chords = [...A, ...A, ...B, ...A];                                   // 16 bars, AABA
      this.melody = []; let deg = 4;
      const rhythms = [[1, 0, 1, 0, 1, 0, 1, 1], [1, 0, 0, 1, 1, 0, 1, 0], [1, 1, 1, 0, 1, 0, 0, 0], [1, 0, 1, 1, 0, 1, 1, 0]];
      const phrase = (bars) => { const out = []; for (const ch of bars) { const rh = pick(rhythms); for (let s = 0; s < 8; s++) { if (!rh[s]) { out.push(null); continue; }
        if (s === 0 || r() < 0.3) deg = ch + pick([0, 2, 4, 7]); else deg += pick([-2, -1, -1, 1, 1, 2]);
        deg = Math.max(0, Math.min(13, deg)); out.push(deg); } } return out; };
      const mA = phrase(A), mB = phrase(B);
      this.melody = [...mA, ...mA, ...mB, ...mA];
      this.fill = this.mood === 'battle' ? 1 : pick([0, 1]); this.duty = pick([0.25, 0.5]);
    }
    note(deg, oct = 0) { const n = this.scale.length; return this.root + 12 * (Math.floor(deg / n) + oct) + this.scale[((deg % n) + n) % n]; }
    add(wave, midi, steps, vol, duty, pan) { this.voices.push({ wave, f: hz(midi), n: Math.floor(steps * this.step), i: 0, ph: 0, vol, duty: duty || 0.5, pan: pan || 0, hold: 0, nz: 1 }); }
    /** schedule everything that starts on sixteenth-note `i` */
    tick(i) {
      const bar = Math.floor(i / 16) % 16, s = i % 16, ch = this.chords[bar], battle = this.mood === 'battle';
      if (s % 2 === 0) { const d = this.melody[(bar * 8 + s / 2) % this.melody.length]; if (d !== null && d !== undefined) this.add('sq', this.note(d, 1), 1.8, 0.11, this.duty, 0.15); }
      const ar = [0, 2, 4, 2][s % 4] + ch;
      if (this.fill || s % 2 === 0) this.add('sq', this.note(ar, 0), 0.9, 0.045, 0.125, -0.35);
      if (battle ? s % 2 === 0 : s % 4 === 0 || s === 10) this.add('tri', this.note(ch + (s === 10 || s % 8 === 6 ? 4 : 0), -2), battle ? 1.6 : 3, 0.2, 0.5, 0);
      if (s % 8 === 0) this.add('kick', 0, 1.2, 0.22);
      if (s % 8 === 4) this.add('noise', 0, 1.4, 0.07);
      if (battle ? true : s % 2 === 0) this.add('hat', 0, 0.4, battle ? 0.022 : 0.016);
      if (i > 0 && i % 256 === 0) this.loops++;
    }
    render(n) {
      const L = new Float32Array(n), R = new Float32Array(n), rate = this.rate;
      let at = 0;
      while (at < n) {
        if (this.pos <= 0) { this.tick(this.i++); this.pos += this.step; }
        const m = Math.min(n - at, Math.ceil(this.pos));
        for (let v = this.voices.length - 1; v >= 0; v--) {
          const o = this.voices[v], gl = o.vol * (1 - o.pan), gr = o.vol * (1 + o.pan);
          for (let j = 0; j < m && o.i < o.n; j++, o.i++) {
            const k = o.i / o.n, env = Math.min(1, o.i / (rate * 0.003)) * (1 - k) * (1 - k * 0.3);
            let x;
            if (o.wave === 'sq') { o.ph += o.f / rate; if (o.ph >= 1) o.ph -= 1; x = o.ph < o.duty ? 1 : -1; }
            else if (o.wave === 'tri') { o.ph += o.f / rate; if (o.ph >= 1) o.ph -= 1; x = 4 * Math.abs(o.ph - 0.5) - 1; }
            else if (o.wave === 'kick') { o.ph += (150 * (1 - k) + 40) / rate; x = Math.sin(o.ph * 6.283); }
            else { o.hold += (o.wave === 'hat' ? 9000 : 3200) / rate; if (o.hold >= 1) { o.hold -= 1; o.nz = Math.random() * 2 - 1; } x = o.nz; }
            L[at + j] += x * env * gl; R[at + j] += x * env * gr;
          }
          if (o.i >= o.n) this.voices.splice(v, 1);
        }
        at += m; this.pos -= m;
      }
      return [L, R];
    }
  }

  return { sfx, cry, Player, title, SFX };
});
