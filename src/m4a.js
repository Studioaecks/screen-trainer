// Screen Trainer — a small Game Boy Advance sound engine ("MP2K" / m4a, the engine used by the GBA
// Pokémon games) in plain JavaScript. It reads sound data either straight from a ROM image or from the
// compact sound bank Screen Trainer extracts from one, and renders songs, sound effects and cries.
//
// No DOM and no Node APIs: the same file runs in the audio worker, in the main process (ROM import)
// and in tools/soundcheck.js.
//
//   const img = M4A.open(bytes)                       ROM file or .stbank file (Uint8Array)
//   const p = new M4A.Player(img, songIndex, 48000)   p.render(n) -> [Float32Array left, right]
//   M4A.renderSong(img, songIndex, 48000, maxSeconds) whole jingle / sound effect
//   M4A.cry(img, cryIndex, 48000, { pitch, reverse }) one cry, mono
//   M4A.buildBank(romBytes)                           -> Uint8Array (.stbank): only the bytes sound needs
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.M4A = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROM_BASE = 0x08000000, FRAME_HZ = 59.7275, FIX_HZ = 13379;
  const MAGIC = 'STBANK1\n';
  // note / wait lengths in ticks, indexed by (command - 0x80) or (command - 0xCF)
  const CLOCK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 28, 30, 32, 36, 40, 42, 44, 48, 52, 54, 56, 60, 64, 66, 68, 72, 76, 78, 80, 84, 88, 90, 92, 96];
  const DELTA = [0, 1, 4, 9, 16, 25, 36, 49, -64, -49, -36, -25, -16, -9, -4, -1];
  const CGB_FREQ = [-2004, -1891, -1785, -1685, -1591, -1501, -1417, -1337, -1262, -1192, -1125, -1062];
  const NOISE = [0xD7, 0xD6, 0xD5, 0xD4, 0xC7, 0xC6, 0xC5, 0xC4, 0xB7, 0xB6, 0xB5, 0xB4, 0xA7, 0xA6, 0xA5, 0xA4, 0x97, 0x96, 0x95, 0x94, 0x87, 0x86, 0x85, 0x84, 0x77, 0x76, 0x75, 0x74, 0x67, 0x66, 0x65, 0x64,
    0x57, 0x56, 0x55, 0x54, 0x47, 0x46, 0x45, 0x44, 0x37, 0x36, 0x35, 0x34, 0x27, 0x26, 0x25, 0x24, 0x17, 0x16, 0x15, 0x14, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00];
  const WAVE_VOL = [0, 0, 0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 1, 1];
  const DUTY = [0.125, 0.25, 0.5, 0.75];
  const XCMD_ARGS = [0, 4, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4];
  const DS_GAIN = 13 / 16;       // the games run the mixer at master volume 12 of 15
  const PSG_GAIN = 0.25;         // one tone channel spans a quarter of the output range
  const MAX_DS = 5;              // direct-sound channels the games allow at once

  // ------------------------------------------------------------------ image: ROM bytes or sparse bank
  class Image {
    constructor(segs, meta) {
      this.segs = segs.slice().sort((a, b) => a.start - b.start);
      this.meta = meta || null; this.last = this.segs[0] || null; this.mark = null; this.samples = new Map();
      this.size = this.segs.length ? this.segs[this.segs.length - 1].start + this.segs[this.segs.length - 1].data.length : 0;
    }
    seg(o) {
      let s = this.last;
      if (s && o >= s.start && o < s.start + s.data.length) return s;
      let lo = 0, hi = this.segs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1; s = this.segs[mid];
        if (o < s.start) hi = mid - 1; else if (o >= s.start + s.data.length) lo = mid + 1; else { this.last = s; return s; }
      }
      return null;
    }
    u8(o) { const s = this.seg(o); if (!s) return 0; if (this.mark) this.mark[o] = 1; return s.data[o - s.start]; }
    s8(o) { return (this.u8(o) << 24) >> 24; }
    u16(o) { return this.u8(o) | (this.u8(o + 1) << 8); }
    u32(o) { return (this.u8(o) | (this.u8(o + 1) << 8) | (this.u8(o + 2) << 16) | (this.u8(o + 3) << 24)) >>> 0; }
    /** a ROM pointer as an offset, or -1 when it does not point into the image (the target itself need not be stored:
     *  key-split tables are addressed from a base that lies before the table) */
    ptr(o) { const v = this.u32(o); return v >= ROM_BASE && v - ROM_BASE < this.size ? v - ROM_BASE : -1; }
    bytes(o, n) {
      const s = this.seg(o);
      if (!s || o - s.start + n > s.data.length) return null;
      if (this.mark) this.mark.fill(1, o, o + n);
      return s.data.subarray(o - s.start, o - s.start + n);
    }

    /** decoded sample: { d: Int8Array (n + 1 values), n, rate (Hz at middle C), loop, loopStart } */
    sample(off) {
      if (this.samples.has(off)) return this.samples.get(off);
      let out = null;
      const type = this.u16(off), status = this.u16(off + 2), freq = this.u32(off + 4), loopStart = this.u32(off + 8), n = this.u32(off + 12);
      if (off >= 0 && n > 0 && n < 0x400000 && freq > 0 && type <= 1) {
        const d = new Int8Array(n + 1);
        if (type === 1) {
          const blocks = Math.ceil(n / 64), src = this.bytes(off + 16, blocks * 33);
          if (src) {
            for (let b = 0, o = 0; b < blocks; b++) {
              const p = b * 33; let s = (src[p] << 24) >> 24;
              if (o < n) d[o++] = s;
              s = ((s + DELTA[src[p + 1] & 15]) << 24) >> 24; if (o < n) d[o++] = s;
              for (let k = 2; k < 33; k++) {
                s = ((s + DELTA[src[p + k] >> 4]) << 24) >> 24; if (o < n) d[o++] = s;
                s = ((s + DELTA[src[p + k] & 15]) << 24) >> 24; if (o < n) d[o++] = s;
              }
            }
            out = { d, n, rate: freq / 1024, loop: false, loopStart: 0 };
          }
        } else {
          const src = this.bytes(off + 16, n);
          if (src) {
            for (let i = 0; i < n; i++) d[i] = (src[i] << 24) >> 24;
            const loop = !!(status & 0xC000) && loopStart < n;
            d[n] = loop ? d[loopStart] : 0;
            out = { d, n, rate: freq / 1024, loop, loopStart: loop ? loopStart : 0 };
          }
        }
      }
      this.samples.set(off, out);
      return out;
    }
  }

  /** open a ROM image or a .stbank file */
  function open(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    let isBank = bytes.length > 16;
    for (let i = 0; i < MAGIC.length && isBank; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) isBank = false;
    if (!isBank) { const img = new Image([{ start: 0, data: bytes }]); img.meta = locate(img); return img; }
    const len = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
    let json = '';
    for (let i = 0; i < len; i++) json += String.fromCharCode(bytes[12 + i]);
    const meta = JSON.parse(json);
    let p = 12 + len;
    const segs = meta.segs.map(([start, n]) => { const s = { start, data: bytes.subarray(p, p + n) }; p += n; return s; });
    return new Image(segs, meta);
  }

  // ------------------------------------------------------------------ finding the tables in a ROM
  function songOk(img, p) {
    if (p < 0 || p + 8 > img.size) return false;
    const n = img.u8(p);
    if (n > 16) return false;
    if (n === 0) return true;
    if (img.ptr(p + 4) < 0) return false;
    for (let t = 0; t < n; t++) if (img.ptr(p + 8 + 4 * t) < 0) return false;
    return true;
  }
  function locate(img) {
    const N = img.size, d = img.segs[0].data;
    if (N < 0x100000) return null;
    const u32 = (o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
    const isPtr = (v) => v >= ROM_BASE && v < ROM_BASE + N;
    // cry table: a long run of "compressed direct-sound voice, key 60" entries
    const cryRun = (b0) => {
      let best = { off: -1, n: 0 };
      for (let o = 0; o + 12 <= N; o += 4) {
        if (d[o] !== b0 || d[o + 1] !== 0x3C || d[o + 2] !== 0 || d[o + 3] !== 0 || d[o + 8] !== 0xFF || d[o + 10] !== 0xFF || !isPtr(u32(o + 4))) continue;
        let n = 0;
        while (o + n * 12 + 12 <= N && d[o + n * 12] === b0 && d[o + n * 12 + 1] === 0x3C && d[o + n * 12 + 8] === 0xFF && isPtr(u32(o + n * 12 + 4))) n++;
        if (n > best.n) best = { off: o, n };
        o += Math.max(0, n - 1) * 12;
      }
      return best;
    };
    const cry = cryRun(0x20), rev = cryRun(0x30);
    // song table: the longest run of { pointer to a plausible song header, u16, u16 }
    let song = { off: -1, n: 0 };
    for (let o = 0; o + 8 <= N; o += 4) {
      const v = u32(o);
      if (!isPtr(v) || (v & 3) || d[o + 5] || d[o + 7] || !songOk(img, v - ROM_BASE)) continue;
      let n = 0, real = 0;
      while (o + n * 8 + 8 <= N) {
        const q = u32(o + n * 8);
        if (!isPtr(q) || d[o + n * 8 + 5] || d[o + n * 8 + 7] || !songOk(img, q - ROM_BASE)) break;
        if (d[q - ROM_BASE]) real++;
        n++;
      }
      if (real > song.n) song = { off: o, n: real, count: n };
      o += Math.max(0, n - 1) * 8;
    }
    if (song.off < 0 || song.n < 20) return null;
    let title = '', code = '';
    for (let i = 0xA0; i < 0xAC && d[i]; i++) title += String.fromCharCode(d[i]);
    for (let i = 0xAC; i < 0xB0; i++) code += String.fromCharCode(d[i]);
    return { title: title.trim(), game: code, version: d[0xBC], songTable: song.off, songCount: song.count, cryTable: cry.n >= 100 ? cry.off : -1, cryCount: cry.n >= 100 ? cry.n : 0, cryRev: rev.n >= 100 ? rev.off : -1 };
  }
  const songOffset = (img, i) => (img.meta && i >= 0 && i < img.meta.songCount ? img.ptr(img.meta.songTable + i * 8) : -1);

  // ------------------------------------------------------------------ sequencer + synthesiser
  const SF_START = 0x80, SF_STOP = 0x40, SF_IEC = 0x04, SF_ENV = 0x03;

  class Player {
    /** opt.dry: run the sequencer only (used to find which bytes a song needs) */
    constructor(img, song, rate, opt = {}) {
      this.img = img; this.rate = rate || 32768; this.dry = !!opt.dry; this.ok = false; this.done = true;
      const off = typeof opt.offset === 'number' ? opt.offset : songOffset(img, song);
      this.tracks = []; this.ds = []; this.psg = [null, null, null, null];
      this.tempoD = 150; this.tempoC = 0; this.tick = 0; this.frames = 0; this.c15 = 14; this.loops = 0; this.pos = 0;
      this.frameLeft = 0; this.frameAcc = 0; this.dcL = 0; this.dcR = 0; this.pxL = 0; this.pxR = 0;
      if (off < 0 || !songOk(img, off)) return;
      const n = img.u8(off);
      if (!n) return;
      this.prio = img.u8(off + 2);
      const rv = img.u8(off + 3);
      this.reverb = rv & 0x80 ? (rv & 0x7F) / 128 : 0;
      this.vg = img.ptr(off + 4);
      for (let t = 0; t < n; t++) {
        this.tracks.push({ i: t, pc: img.ptr(off + 8 + 4 * t), on: true, wait: 0, run: 0, key: 60, vel: 127, gate: 0, vol: 0, pan: 0, bend: 0, bendR: 2, tune: 0, keySh: 0,
          lfoS: 22, lfoDl: 0, lfoDlC: 0, lfoC: 0, mod: 0, modT: 0, modM: 0, prio: 0, voice: { type: 1, key: 60, len: 0, pan: 0, wav: 0, a: 0, d: 0, s: 15, r: 0, off: -1 },
          stack: [], rep: 0, echoV: 0, echoL: 0, gotos: 0, volL: 0, volR: 0, keyM: 0, pitM: 0 });
      }
      if (!this.dry) {
        const dl = Math.max(8, Math.round(this.rate * (7 * 224) / FIX_HZ));
        this.rvL = new Float32Array(dl); this.rvR = new Float32Array(dl); this.rvI = 0; this.rvF = Math.round(this.rate * 224 / FIX_HZ);
        this.smooth = 1 - Math.exp(-1 / (this.rate * 0.003));
      }
      this.ok = true; this.done = false;
    }

    // ---- track state -> channel volume / pitch (TrkVolPitSet)
    trackVolPit(tr) {
      let x = (tr.vol * 64) >> 5;
      if (tr.modT === 1) x = (x * (tr.modM + 128)) >> 7;
      let y = 2 * tr.pan;
      if (tr.modT === 2) y += tr.modM;
      y = y < -128 ? -128 : y > 127 ? 127 : y;
      tr.volR = ((y + 128) * x) >> 8; tr.volL = ((127 - y) * x) >> 8;
      let p = (tr.tune + tr.bend * tr.bendR) * 4 + (tr.keySh << 8);
      if (tr.modT === 0) p += 16 * tr.modM;
      tr.keyM = p >> 8; tr.pitM = p & 0xFF;
    }
    chanVol(ch, tr) {
      const r = (ch.vel * (0x80 + ch.rpan) * tr.volR) >> 14, l = (ch.vel * (0x7F - ch.rpan) * tr.volL) >> 14;
      ch.rv = r > 255 ? 255 : r; ch.lv = l > 255 ? 255 : l;
    }
    chanPitch(ch, tr) {
      let key = ch.key + tr.keyM; if (key < 0) key = 0;
      const fine = tr.pitM;
      if (ch.cgb) {
        if (ch.cgb === 4) { let k = key <= 20 ? 0 : key - 21; if (k > 59) k = 59; ch.nr43 = NOISE[k]; const s = ch.nr43 >> 4, r = ch.nr43 & 7; ch.freq = 524288 / (r === 0 ? 0.5 : r) / Math.pow(2, s + 1); return; }
        let k = key, f = fine;
        if (k <= 35) { f = 0; k = 0; } else { k -= 36; if (k > 130) { k = 130; f = 255; } }
        const reg = (i) => CGB_FREQ[i % 12] >> Math.floor(i / 12);
        const v1 = reg(k), v2 = reg(k + 1), x = v1 + ((f * (v2 - v1)) >> 8) + 2048;
        ch.reg = x; ch.freq = (ch.cgb === 3 ? 65536 : 131072) / Math.max(1, 2048 - x);
      } else if (ch.smp) {
        ch.step = (ch.fix ? FIX_HZ : ch.smp.rate * Math.pow(2, (key - 60 + fine / 256) / 12)) / this.rate;
      }
    }

    readVoice(n) {
      const o = this.vg + 12 * n, img = this.img;
      return { off: o, type: img.u8(o), key: img.u8(o + 1), len: img.u8(o + 2), pan: img.u8(o + 3), wav: img.u32(o + 4), a: img.u8(o + 8), d: img.u8(o + 9), s: img.u8(o + 10), r: img.u8(o + 11) };
    }
    voiceAt(o) {
      const img = this.img;
      return { off: o, type: img.u8(o), key: img.u8(o + 1), len: img.u8(o + 2), pan: img.u8(o + 3), wav: img.u32(o + 4), a: img.u8(o + 8), d: img.u8(o + 9), s: img.u8(o + 10), r: img.u8(o + 11) };
    }

    noteOn(tr, gate) {
      const img = this.img;
      let v = tr.voice, key = tr.key, rpan = 0;
      if (v.type & 0xC0) {                       // key split or drum kit: look the real voice up
        const base = v.wav >= ROM_BASE ? v.wav - ROM_BASE : -1;
        if (base < 0) return;
        let idx = key;
        if (v.type & 0x40) { const tbl = img.ptr(v.off + 8); if (tbl < 0) return; idx = img.u8(tbl + key); }
        const sub = this.voiceAt(base + 12 * idx);
        if (sub.type & 0xC0) return;
        if (v.type & 0x80) { if (sub.pan & 0x80) rpan = (sub.pan - 0xC0) * 2; key = sub.key; }
        v = sub;
      }
      const prio = Math.min(255, this.prio + tr.prio), cgb = v.type & 7;
      let ch;
      if (cgb) {
        if (cgb > 4) return;
        const cur = this.psg[cgb - 1];
        if (cur && (cur.flags & 0xC7) && !(cur.flags & SF_STOP)) {
          if (cur.prio > prio) return;
          if (cur.prio === prio && cur.tr.i < tr.i) return;
        }
        ch = { cgb, flags: SF_START, a: v.a & 7, d: v.d & 7, s: v.s & 15, r: v.r & 7, ev: 0, cnt: 0, goal: 0, sg: 0, len: v.len, ph: 0, cur: 0, lfsr: 0x7FFF, acc: 0, out: 1, panL: 1, panR: 1 };
        if (cgb === 3) {
          const w = v.wav >= ROM_BASE ? img.bytes(v.wav - ROM_BASE, 16) : null;
          ch.wave = new Float32Array(32);
          if (w) for (let i = 0; i < 32; i++) ch.wave[i] = (((w[i >> 1] >> (i & 1 ? 0 : 4)) & 15) - 7.5) / 7.5;
        } else if (cgb === 4) { ch.narrow = !!(v.wav & 1); ch.lfsr = ch.narrow ? 0x7F : 0x7FFF; }
        else { ch.duty = DUTY[v.wav & 3]; ch.sweep = cgb === 1 && !(v.pan & 0x80) && (v.pan & 0x70) ? v.pan : 8; ch.swT = 0; }
        this.psg[cgb - 1] = ch;
      } else {
        const smp = v.wav >= ROM_BASE ? img.sample(v.wav - ROM_BASE) : null;
        if (!smp) return;
        if (this.dry) return;
        let slot = -1;
        for (let i = 0; i < this.ds.length; i++) if (!this.ds[i].flags) { slot = i; break; }
        if (slot < 0 && this.ds.length < MAX_DS) slot = this.ds.length;
        if (slot < 0) {                          // steal: releasing channels first, then the lowest priority
          let bp = prio, bt = tr.i, rel = false;
          for (let i = 0; i < this.ds.length; i++) {
            const c = this.ds[i];
            if (c.flags & SF_STOP) { if (!rel) { rel = true; bp = c.prio; bt = c.tr.i; slot = i; continue; } }
            else if (rel) continue;
            if (c.prio < bp) { bp = c.prio; bt = c.tr.i; slot = i; } else if (c.prio === bp && c.tr.i >= bt) { bt = c.tr.i; slot = i; }
          }
          if (slot < 0) return;
        }
        ch = { cgb: 0, flags: SF_START, smp, fix: !!(v.type & 8), a: v.a, d: v.d, s: v.s, r: v.r, env: 0, p: 0, step: 0, gl: 0, gr: 0, tl: 0, tr2: 0 };
        this.ds[slot] = ch;
      }
      ch.tr = tr; ch.key = key; ch.vel = tr.vel; ch.prio = prio; ch.gate = gate; ch.rpan = rpan; ch.echoV = tr.echoV; ch.echoL = tr.echoL; ch.note = tr.key;
      tr.lfoDlC = tr.lfoDl; if (tr.lfoDl) tr.modM = 0;
      this.trackVolPit(tr); this.chanVol(ch, tr); this.chanPitch(ch, tr);
    }
    release(tr, key) {
      const hit = (c) => c && c.tr === tr && c.flags && !(c.flags & SF_STOP) && (key === undefined ? true : (c.note === key && c.gate === 0));
      for (const c of this.ds) if (hit(c)) c.flags |= SF_STOP;
      for (const c of this.psg) if (hit(c)) c.flags |= SF_STOP;
    }

    /** one sequencer tick for every track */
    clock() {
      const img = this.img;
      let live = 0;
      for (const tr of this.tracks) {
        if (!tr.on) continue;
        live++;
        for (const c of this.ds) if (c.tr === tr && c.gate > 0 && c.flags && !(c.flags & SF_STOP) && --c.gate === 0) c.flags |= SF_STOP;
        for (const c of this.psg) if (c && c.tr === tr && c.gate > 0 && c.flags && !(c.flags & SF_STOP) && --c.gate === 0) c.flags |= SF_STOP;
        let guard = 0;
        while (tr.on && tr.wait === 0) {
          if (++guard > 4000 || tr.pc < 0) { tr.on = false; this.release(tr); break; }
          let cmd = img.u8(tr.pc);
          if (cmd < 0x80) cmd = tr.run; else { tr.pc++; if (cmd >= 0xBD) tr.run = cmd; }
          if (cmd >= 0xCF) {                      // note (0xCF is a tie: held until EOT)
            let gate = CLOCK[cmd - 0xCF], b = img.u8(tr.pc);
            if (b < 0x80) { tr.key = b; tr.pc++; b = img.u8(tr.pc); if (b < 0x80) { tr.vel = b; tr.pc++; b = img.u8(tr.pc); if (b < 0x80) { gate += b; tr.pc++; } } }
            this.noteOn(tr, gate);
          } else if (cmd >= 0xB1) {
            const arg = () => img.u8(tr.pc++);
            switch (cmd) {
              case 0xB1: tr.on = false; this.release(tr); break;
              case 0xB2: { const to = img.ptr(tr.pc); tr.gotos++; if (to < 0) { tr.on = false; this.release(tr); } else tr.pc = to; break; }
              case 0xB3: { const to = img.ptr(tr.pc); if (tr.stack.length < 3 && to >= 0) { tr.stack.push(tr.pc + 4); tr.pc = to; } else tr.pc += 4; break; }
              case 0xB4: if (tr.stack.length) tr.pc = tr.stack.pop(); break;
              case 0xB5: { const n = arg(), to = img.ptr(tr.pc); if (n === 0) { tr.gotos++; tr.pc = to; } else if (++tr.rep < n) tr.pc = to; else { tr.rep = 0; tr.pc += 4; } break; }
              case 0xB9: { const op = arg(); tr.pc += 2; if (op >= 6 && op <= 17) tr.pc += 4; break; }
              case 0xBA: tr.prio = arg(); break;
              case 0xBB: this.tempoD = arg() * 2; break;
              case 0xBC: tr.keySh = (arg() << 24) >> 24; break;
              case 0xBD: tr.voice = this.readVoice(arg()); break;
              case 0xBE: tr.vol = arg(); break;
              case 0xBF: tr.pan = arg() - 64; break;
              case 0xC0: tr.bend = arg() - 64; break;
              case 0xC1: tr.bendR = arg(); break;
              case 0xC2: tr.lfoS = arg(); if (!tr.lfoS) tr.modM = 0; break;
              case 0xC3: tr.lfoDl = arg(); break;
              case 0xC4: tr.mod = arg(); if (!tr.mod) tr.modM = 0; break;
              case 0xC5: tr.modT = arg(); break;
              case 0xC8: tr.tune = arg() - 64; break;
              case 0xCC: tr.pc += 2; break;
              case 0xCD: { const x = arg(); if (x === 8) tr.echoV = arg(); else if (x === 9) tr.echoL = arg(); else tr.pc += XCMD_ARGS[x] || 0; break; }
              case 0xCE: { const b = img.u8(tr.pc); if (b < 0x80) { tr.key = b; tr.pc++; } this.release(tr, tr.key); break; }
              default: tr.on = false; this.release(tr);
            }
          } else tr.wait = CLOCK[cmd - 0x80];
        }
        if (!tr.on) continue;
        if (tr.wait > 0) tr.wait--;
        if (tr.lfoS && tr.mod) {                  // triangle LFO: vibrato, tremolo or auto-pan
          if (tr.lfoDlC) tr.lfoDlC--;
          else { tr.lfoC = (tr.lfoC + tr.lfoS) & 0xFF; const s = ((tr.lfoC - 0x40) << 24) >> 24 < 0 ? (tr.lfoC << 24) >> 24 : 0x80 - tr.lfoC; tr.modM = (tr.mod * s) >> 6; }
        }
      }
      this.tick++;
      const looping = this.tracks.filter((t) => t.on);
      if (looping.length && looping.every((t) => t.gotos > this.loops)) this.loops++;
      return live;
    }

    // ---- tone channel envelope, once per frame (CgbSound)
    cgbModVol(c) {
      const l = c.lv, r = c.rv;
      c.panL = 1; c.panR = 1;
      if (r >= l) { if ((r >> 1) >= l) c.panL = 0; } else if ((l >> 1) >= r) c.panR = 0;
      c.goal = Math.min(15, (l + r) >> 4); c.sg = (c.goal * c.s + 15) >> 4;
    }
    cgbStep(c, again) {
      let label;
      if (c.flags & SF_START) {
        if (c.flags & SF_STOP) { c.flags = 0; return; }
        c.flags = 3; this.cgbModVol(c); c.cnt = c.a;
        if (c.a) { c.ev = 0; label = 'done'; } else label = 'decay';
      } else if (c.flags & SF_IEC) { if (--c.echoL <= 0) c.flags = 0; return; }
      else if ((c.flags & SF_STOP) && (c.flags & SF_ENV)) { c.flags &= ~SF_ENV; c.cnt = c.r; label = c.r ? 'done' : 'echo'; }
      else label = 'step';
      for (;;) {
        if (label === 'step') {
          label = 'done';
          if (c.cnt === 0) {
            this.cgbModVol(c);
            const e = c.flags & SF_ENV;
            if (e === 0) { if (--c.ev <= 0) label = 'echo'; else c.cnt = c.r; }
            else if (e === 1) { c.ev = c.sg; c.cnt = 7; }
            else if (e === 2) { if (--c.ev <= c.sg) label = 'sustain'; else c.cnt = c.d; }
            else if (++c.ev >= c.goal) label = 'decay'; else c.cnt = c.a;
          }
        } else if (label === 'decay') {
          c.flags--; c.cnt = c.d;
          if (c.d) { c.ev = c.goal; label = 'done'; } else label = 'sustain';
        } else if (label === 'sustain') {
          if (c.s === 0) { c.flags &= ~SF_ENV; label = 'echo'; }
          else { c.flags--; c.ev = c.sg; c.cnt = 7; label = 'done'; }
        } else if (label === 'echo') {
          c.ev = (c.goal * c.echoV + 0xFF) >> 8;
          if (c.ev) c.flags |= SF_IEC; else c.flags = 0;
          return;
        } else {
          c.cnt = (c.cnt - 1) & 0xFF;
          if (again) { again = false; label = 'step'; } else return;
        }
      }
    }

    /** one engine frame (about 1/60 s): sequencer ticks, then envelopes */
    frame() {
      this.tempoC += this.tempoD;
      let live = this.tracks.length;
      while (this.tempoC >= 150) { this.tempoC -= 150; live = this.clock(); }
      for (const tr of this.tracks) if (tr.on) {
        this.trackVolPit(tr);
        for (const c of this.ds) if (c.tr === tr && c.flags) { this.chanVol(c, tr); this.chanPitch(c, tr); }
        for (const c of this.psg) if (c && c.tr === tr && c.flags) { this.chanVol(c, tr); this.chanPitch(c, tr); }
      }
      const twice = this.c15 === 0;
      this.c15 = this.c15 ? this.c15 - 1 : 14;
      for (const c of this.psg) if (c && c.flags) {
        this.cgbStep(c, twice);
        if (c.cgb === 1 && c.flags && (c.sweep & 0x70) && (c.sweep & 7)) {       // frequency sweep
          c.swT += 128 / FRAME_HZ;
          const per = (c.sweep >> 4) & 7;
          while (c.swT >= per) { c.swT -= per; const dx = c.reg >> (c.sweep & 7); c.reg += c.sweep & 8 ? -dx : dx; if (c.reg > 2047 || c.reg < 0) { c.flags = 0; break; } c.freq = 131072 / Math.max(1, 2048 - c.reg); }
        }
      }
      let voices = 0;
      for (const c of this.ds) {
        if (!c.flags) continue;
        if (c.flags & SF_START) {
          if (c.flags & SF_STOP) { c.flags = 0; continue; }
          c.flags = 3; c.env = c.a; if (c.env >= 255) { c.env = 255; c.flags = 2; }
        } else if (c.flags & SF_IEC) { if (--c.echoL <= 0) { c.flags = 0; continue; } }
        else if (c.flags & SF_STOP) {
          c.env = (c.env * c.r) >> 8;
          if (c.env <= c.echoV) { if (!c.echoV) { c.flags = 0; c.tl = c.tr2 = 0; continue; } c.env = c.echoV; c.flags |= SF_IEC; }
        } else if ((c.flags & SF_ENV) === 2) { c.env = (c.env * c.d) >> 8; if (c.env <= c.s) { c.env = c.s; if (!c.s) { c.flags = 0; c.tl = c.tr2 = 0; continue; } c.flags--; } }
        else if ((c.flags & SF_ENV) === 3) { c.env += c.a; if (c.env >= 255) { c.env = 255; c.flags--; } }
        const g = (c.env / 255) * DS_GAIN / 128;
        c.tl = (c.lv / 255) * g; c.tr2 = (c.rv / 255) * g;
        voices++;
      }
      for (const c of this.psg) if (c && c.flags) voices++;
      this.frames++;
      if (!live && !voices) this.done = true;
    }

    mix(L, R, at, m) {
      const k = this.smooth, rate = this.rate;
      for (const c of this.ds) {
        if (!c.flags && c.gl < 1e-5 && c.gr < 1e-5) continue;
        const s = c.smp, d = s.d, n = s.n;
        let p = c.p, gl = c.gl, gr = c.gr;
        const tl = c.flags ? c.tl : 0, tr = c.flags ? c.tr2 : 0, step = c.step;
        for (let j = 0; j < m; j++) {
          const ip = p | 0, v = d[ip] + (d[ip + 1] - d[ip]) * (p - ip);
          gl += (tl - gl) * k; gr += (tr - gr) * k;
          L[at + j] += v * gl; R[at + j] += v * gr;
          p += step;
          if (p >= n) { if (s.loop) { p -= n - s.loopStart; if (p >= n) p = s.loopStart; } else { c.flags = 0; c.tl = c.tr2 = 0; p = n; c.gl = c.gr = gl = gr = 0; break; } }
        }
        c.p = p; c.gl = gl; c.gr = gr;
      }
      // reverb: the mixer feeds back what it played about 0.12 s ago
      if (this.reverb > 0) {
        const bl = this.rvL, br = this.rvR, len = bl.length, g = this.reverb * 0.25, f = this.rvF;
        let i = this.rvI;
        for (let j = 0; j < m; j++) {
          const i2 = i + f >= len ? i + f - len : i + f, e = (bl[i] + br[i] + bl[i2] + br[i2]) * g;
          const l = L[at + j] + e, r = R[at + j] + e;
          bl[i] = l; br[i] = r; L[at + j] = l; R[at + j] = r;
          if (++i >= len) i = 0;
        }
        this.rvI = i;
      }
      for (const c of this.psg) {
        if (!c) continue;
        const on = c.flags && c.ev > 0;
        const tgt = on ? (c.cgb === 3 ? WAVE_VOL[c.ev & 15] : c.ev / 15) * PSG_GAIN : 0;
        if (!on && c.cur < 1e-4) { c.cur = 0; continue; }
        let cur = c.cur, ph = c.ph;
        const dt = c.freq / rate, pl = c.panL, pr = c.panR;
        if (c.cgb <= 2) {
          const duty = c.duty;
          for (let j = 0; j < m; j++) {
            cur += (tgt - cur) * k;
            let v = ph < duty ? 1 : -1;
            if (dt < 0.5) {                      // band-limit both edges of the pulse
              if (ph < dt) { const t = ph / dt; v += t + t - t * t - 1; } else if (ph > 1 - dt) { const t = (ph - 1) / dt; v += t * t + t + t + 1; }
              let q = ph - duty; if (q < 0) q += 1;
              if (q < dt) { const t = q / dt; v -= t + t - t * t - 1; } else if (q > 1 - dt) { const t = (q - 1) / dt; v -= t * t + t + t + 1; }
            }
            v *= cur; L[at + j] += v * pl; R[at + j] += v * pr;
            ph += dt; if (ph >= 1) ph -= 1;
          }
        } else if (c.cgb === 3) {
          const w = c.wave;
          for (let j = 0; j < m; j++) { cur += (tgt - cur) * k; const v = w[(ph * 32) & 31] * cur; L[at + j] += v * pl; R[at + j] += v * pr; ph += dt; if (ph >= 1) ph -= 1; }
        } else {
          let l = c.lfsr, acc = c.acc, out = c.out;
          for (let j = 0; j < m; j++) {
            cur += (tgt - cur) * k;
            acc += dt;
            let sum = 0, cnt = 0;
            while (acc >= 1) { acc -= 1; const bit = (l ^ (l >> 1)) & 1; l = (l >> 1) | (bit << 14); if (c.narrow) l = (l & ~0x40) | (bit << 6); out = l & 1 ? -1 : 1; sum += out; if (++cnt > 64) { acc = 0; break; } }
            const v = (cnt ? sum / cnt : out) * cur;
            L[at + j] += v * pl; R[at + j] += v * pr;
          }
          c.lfsr = l; c.acc = acc; c.out = out;
        }
        c.cur = cur; c.ph = ph;
      }
    }

    /** render n samples; returns [left, right] */
    render(n) {
      const L = new Float32Array(n), R = new Float32Array(n);
      if (!this.ok) return [L, R];
      let i = 0;
      while (i < n) {
        if (this.frameLeft <= 0) {
          if (this.done) break;
          this.frame();
          this.frameAcc += this.rate / FRAME_HZ;
          this.frameLeft = Math.floor(this.frameAcc); this.frameAcc -= this.frameLeft;
        }
        const m = Math.min(n - i, this.frameLeft);
        this.mix(L, R, i, m);
        i += m; this.frameLeft -= m;
      }
      // remove DC (pulse waves are lopsided) and limit softly
      let dl = this.dcL, dr = this.dcR, xl = this.pxL, xr = this.pxR;
      for (let j = 0; j < i; j++) {
        const l = L[j], r = R[j];
        dl = l - xl + 0.9985 * dl; xl = l; dr = r - xr + 0.9985 * dr; xr = r;
        const a = dl * 0.9, b = dr * 0.9;
        L[j] = a > 0.7 ? 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3) : a < -0.7 ? -0.7 - 0.3 * Math.tanh((-a - 0.7) / 0.3) : a;
        R[j] = b > 0.7 ? 0.7 + 0.3 * Math.tanh((b - 0.7) / 0.3) : b < -0.7 ? -0.7 - 0.3 * Math.tanh((-b - 0.7) / 0.3) : b;
      }
      this.dcL = dl; this.dcR = dr; this.pxL = xl; this.pxR = xr; this.pos += i;
      return [L, R];
    }

    /** sequencer only: touch every byte this song needs (first pass plus one loop) */
    dryRun(maxTicks = 120000) {
      if (!this.ok) return 0;
      let t = 0;
      while (t < maxTicks) { if (!this.clock()) break; if (this.loops >= 2) break; t++; }
      return t;
    }
  }

  /** render a whole (non-looping) song such as a jingle or sound effect; looping songs are cut at maxSeconds */
  function renderSong(img, song, rate, maxSeconds = 8, opt = {}) {
    const p = new Player(img, song, rate, opt);
    if (!p.ok) return null;
    const chunk = Math.round(rate / 4), ls = [], rs = [];
    let total = 0;
    while (!p.done && total < maxSeconds * rate) { const [l, r] = p.render(chunk); ls.push(l); rs.push(r); total += chunk; if (opt.stopOnLoop && p.loops) break; }
    const L = new Float32Array(total), R = new Float32Array(total);
    ls.forEach((a, i) => { L.set(a, i * chunk); R.set(rs[i], i * chunk); });
    let end = total;                              // trim trailing silence, keep a short tail
    while (end > 0 && Math.abs(L[end - 1]) < 2e-4 && Math.abs(R[end - 1]) < 2e-4) end--;
    end = Math.min(total, end + Math.round(rate * 0.02));
    const cut = p.done ? 0 : Math.min(end, Math.round(rate * 0.25));
    for (let i = 0; i < cut; i++) { const g = i / cut; L[end - 1 - i] *= g; R[end - 1 - i] *= g; }
    return { l: L.subarray(0, end), r: R.subarray(0, end), looped: !p.done, seconds: end / rate };
  }

  /** one cry from the cry table (index 0 = first species), resampled to `rate` */
  function cry(img, index, rate, opt = {}) {
    const m = img.meta;
    if (!m || m.cryTable < 0 || index < 0 || index >= m.cryCount) return null;
    const wav = img.ptr(m.cryTable + index * 12 + 4), s = wav < 0 ? null : img.sample(wav);
    if (!s) return null;
    const step = (s.rate * (opt.pitch || 1)) / rate, n = Math.max(1, Math.floor(s.n / step)), out = new Float32Array(n), g = DS_GAIN / 128 * (opt.vol === undefined ? 1 : opt.vol);
    for (let i = 0; i < n; i++) {
      const p = opt.reverse ? s.n - 1 - i * step : i * step, ip = Math.max(0, Math.min(s.n - 1, p | 0)), fr = p - (p | 0);
      out[i] = (s.d[ip] + (s.d[Math.min(s.n - 1, ip + 1)] - s.d[ip]) * fr) * g;
    }
    const fade = Math.min(n, Math.round(rate * 0.012));
    for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
    return out;
  }

  // ------------------------------------------------------------------ the bank: a sparse copy of the sound data
  function buildBank(romBytes) {
    if (!(romBytes instanceof Uint8Array)) romBytes = new Uint8Array(romBytes);
    const img = new Image([{ start: 0, data: romBytes }]);
    const meta = locate(img);
    if (!meta) throw new Error('This file does not look like a Game Boy Advance ROM with a sound table Screen Trainer understands.');
    img.meta = meta; img.mark = new Uint8Array(romBytes.length);
    img.bytes(0xA0, 0x20);
    img.bytes(meta.songTable, meta.songCount * 8);
    let songs = 0;
    for (let i = 0; i < meta.songCount; i++) {
      const off = img.ptr(meta.songTable + i * 8);
      if (off < 0 || !img.u8(off)) continue;
      try { const p = new Player(img, i, 0, { dry: true }); if (p.ok) { p.dryRun(); songs++; } } catch (e) { /* a broken entry: skip it */ }
    }
    for (const tbl of [meta.cryTable, meta.cryRev]) if (tbl >= 0) {
      img.bytes(tbl, meta.cryCount * 12);
      for (let i = 0; i < meta.cryCount; i++) { const w = img.ptr(tbl + i * 12 + 4); if (w >= 0) img.sample(w); }
    }
    const segs = [], mark = img.mark, GAP = 48;
    for (let o = 0; o < mark.length; o++) {
      if (!mark[o]) continue;
      let end = o, gap = 0;
      for (let q = o; q < mark.length && gap <= GAP; q++) { if (mark[q]) { end = q; gap = 0; } else gap++; }
      const start = o & ~3, stop = Math.min(mark.length, (end + 4) & ~3);
      segs.push([start, stop - start]);
      o = stop;
    }
    const info = Object.assign({}, meta, { format: 1, songs, segs });
    const json = JSON.stringify(info), total = segs.reduce((a, s) => a + s[1], 0);
    const out = new Uint8Array(12 + json.length + total);
    for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i);
    out[8] = json.length & 255; out[9] = (json.length >> 8) & 255; out[10] = (json.length >> 16) & 255; out[11] = (json.length >> 24) & 255;
    for (let i = 0; i < json.length; i++) out[12 + i] = json.charCodeAt(i);
    let p = 12 + json.length;
    for (const [start, n] of segs) { out.set(romBytes.subarray(start, start + n), p); p += n; }
    return out;
  }

  return { open, locate, Player, renderSong, cry, buildBank, songOffset, FRAME_HZ };
});
