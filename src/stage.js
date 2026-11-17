// MyStream — the stage page (stage.html): everything viewers see besides the game itself.
//
// This file draws the ground, shows the game windows the owner switched on (each one is a capture of that single
// window, never of the screen), builds the fountain, puts up the sticky notes, and keeps what Mewtwo says unreadable.
// The layout arrives from the main process (mystream.js): st.ms.onStage(config). Places are shares of the stage
// (0..1), so they mean the same whatever size the booth window has.
//
// To add something viewers should see: add it to the config in mystream.js (stageConfig), draw it here.
// Never show anything here that the owner did not put on the stage.
'use strict';

// What Mewtwo says is for the owner. src/mewtwo.js hands every line to mask(): the real words go to the booth, the
// stage gets the same shape in scrambled letters (and stage.css blurs the card on top of that).
window.StageHost = {
  scramble(text) { const abc = 'abcdefghijklmnopqrstuvwxyz'; return String(text).replace(/[^\s]/g, () => abc[Math.floor(Math.random() * abc.length)]); },
  mask(text, tone) {
    try { window.st.ms.mewtwo({ text: String(text), tone: String(tone || 'info') }); } catch (e) { /* no booth to tell */ }
    return this.scramble(text);
  },
};

const Stage = (() => {
  const st = window.st, ms = st && st.ms, $ = (id) => document.getElementById(id);
  let cfg = null, frames = 0, fps = 0, groundOk = false, ready = false, micOpen = false;
  const tiles = new Map();              // source id -> its tile
  const notes = new Map();              // note id -> element
  let fountain = null, fountainEl = null, fountainNote = 'not built';

  // ---------------------------------------------------------------- the ground: a field grown from the team
  // Until 0.6 this was the plain grass of an unseeded field. Now it is the same generated field as the field window
  // (src/field.js), with the species of the current team as its seed: change the team and the ground changes with it.
  let groundSig = null;
  // Since 0.7 each of the team's six has an equal share of the ground, of its own types (Field.partyPlan), and while the
  // Box is open the ground is everyone's in the Box: G.groundList in src/game.js says who, here as in the field window.
  const groundOf = () => { try { return G.groundList(); } catch (e) { return { kind: 'team', list: [] }; } };      // (the game is not up yet: plain grass)
  function drawGround(force) {
    const g = groundOf(), sig = g.kind + ':' + g.list.join(',') + '|' + window.innerWidth + 'x' + window.innerHeight;
    if (!force && sig === groundSig) return;
    groundSig = sig;
    try { Field.draw($('stGround'), Field.partyPlan(g.list, (sp) => (DATA.dex[sp] ? DATA.dex[sp].t.map((t) => DATA.types[t]) : []), { min: g.kind === 'team' ? 6 : 1, aspect: window.innerWidth / Math.max(1, window.innerHeight) }), window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); groundOk = true; } catch (e) { groundOk = false; }
  }
  setInterval(() => drawGround(false), 3000);

  // ---------------------------------------------------------------- the fountain
  const FOUNTAIN = { scale: 2, cx: 0.5, cy: 0.5 };          // squares of 2 px, like the field's decorations; its middle on the stage's middle
  let fountainParts = [];                 // [back, mid, front]: three layers of the same picture (see Fountain.ROWS)
  function buildFountain() {
    if (fountainEl || typeof G === 'undefined' || !G.world) return;
    const layer = () => { const el = document.createElement('div'); el.className = 'fountain'; const cv = document.createElement('canvas'); el.appendChild(cv); return { el, cv }; };
    const back = layer(), mid = layer(), front = layer();
    fountainEl = back.el; fountainParts = [back.el, mid.el, front.el];
    fountain = Fountain.create(back.cv, { mid: mid.cv, front: front.cv });
    placeFountain();
    for (const el of fountainParts) $('stPlaces').appendChild(el);      // its own layer since 0.6 (before: inside the game's world, sorted among the Pokémon)
    fountainNote = 'plain stone';
    dressFountain();
    setInterval(() => { if (fountain && cfg && cfg.fountain !== false) fountain.draw(performance.now() / 1000); }, 83);       // twelve pictures a second: it is pixel art
    fountain.draw(0);
    if (typeof Stations !== 'undefined') Stations.build().then(placeFountain).catch(() => {});      // the Poké Center, the pipe, the Day Care and the trade pads stand round it
  }
  const isWater = (a) => !!(a && a.mon && DATA.dex[a.mon.sp] && DATA.dex[a.mon.sp].t.some((t) => DATA.types[t] === 'water'));
  function placeFountain() {
    if (!fountainEl) return;
    const k = FOUNTAIN.scale, R = Fountain.ROWS, w = Fountain.SIZE.w * k, h = Fountain.SIZE.h * k, left = Math.round(window.innerWidth * FOUNTAIN.cx - w / 2), top = Math.round(window.innerHeight * FOUNTAIN.cy - h * 0.55);
    // sprites sort by their feet (lower on the stage is in front); each layer sorts by the row where it stands
    [R.back, R.mid, R.front].forEach((row, i) => Object.assign(fountainParts[i].style, { width: w + 'px', height: h + 'px', transform: `translate3d(${left}px, ${top}px, 0)`, zIndex: String(Math.floor(top + row * k)) }));
    // Nobody walks through the stone (0.5 let them, and they were cut off by it). Water types may get into the basin
    // and bathe; everyone goes round the column. src/game.js keeps feet out of G.blocks.
    const on = !cfg || cfg.fountain !== false, cx = left + Fountain.CX * k;
    G.blocks = on ? [
      { name: 'fountain', x: cx, y: top + R.foot.y * k, rx: R.foot.rx * k, ry: R.foot.ry * k, pass: isWater },
      { name: 'column', x: cx, y: top + R.column.y * k, rx: R.column.rx * k, ry: R.column.ry * k },
    ] : [];
    if (typeof Stations !== 'undefined') { Stations.place(on); G.blocks = G.blocks.concat(Stations.blocks()); }      // they come and go with the fountain
    if (typeof Square !== 'undefined') Square.setTop(cx, top + (Fountain.TOP ? Fountain.TOP.y : 31) * k, (Fountain.TOP ? Fountain.TOP.r : 11) * k, on);      // the ball on top is a button (src/square.js)
  }
  /** is the fountain really to be seen? 'off' = switched off in the options, 'yes', or what is wrong */
  function fountainSeen() {
    try {
      if (!fountainEl) return 'not built';
      if (document.body.classList.contains('nofountain')) return 'off';
      const r = fountainEl.getBoundingClientRect(), cv = fountainEl.querySelector('canvas');
      if (getComputedStyle(fountainEl).display === 'none' || r.width < 10) return 'hidden';
      if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return 'off the stage';
      const a = cv.getContext('2d').getImageData(Fountain.CX - 30, Fountain.ROWS.water.y, 1, 1).data[3];
      return a > 200 ? 'yes' : 'not drawn';
    } catch (e) { return 'unknown: ' + String(e.message || e).slice(0, 60); }
  }
  /** the ball on top and the statues come from the owner's sprites folder (and the statues from their own Pokédex) */
  async function dressFountain() {
    if (!fountain || typeof Sprites === 'undefined' || !Sprites.ready()) return;
    let ball = false, n = 0;
    try { ball = await fountain.setFinial(Sprites.item('poke-ball')); } catch (e) { ball = false; }
    try {
      const caught = Object.keys((G.save && G.save.dex && G.save.dex.caught) || {}).map(Number).filter((sp) => DATA.dex[sp] && DATA.dex[sp].t.some((t) => DATA.types[t] === 'water') && Sprites.available(sp)).sort((a, b) => a - b);
      const pick = caught.length > 2 ? [caught[0], caught[caught.length - 1]] : caught;
      n = await fountain.setStatues(pick.map((sp) => Sprites.still(sp, false) || (Sprites.resolve(sp, false, false) || {}).front));
    } catch (e) { n = 0; }
    fountainNote = `${ball ? 'ball on top' : 'plain top'}, ${n} statue${n === 1 ? '' : 's'}`;
    fountain.draw(performance.now() / 1000);
  }

  // ---------------------------------------------------------------- game windows
  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }';
  // The empty background of a see-through game arrives as black (or white). Taking out every black pixel also took
  // out the dark parts of a game's own panels, and the grass showed through them. So only background that is joined
  // to the picture's edge goes: `m` is a small map (1 = joined to the edge), made by fillMask a few times a second.
  const FS = 'precision mediump float; uniform sampler2D u; uniform sampler2D m; uniform float mode; uniform float tol; varying vec2 v;' +
    'void main(){ vec4 c = texture2D(u, v); float a = 1.;' +
    ' if (mode > .5 && mode < 1.5) a = smoothstep(tol * .5, tol, max(c.r, max(c.g, c.b)));' +          // black background out
    ' else if (mode > 1.5) a = smoothstep(tol * .5, tol, 1. - min(c.r, min(c.g, c.b)));' +            // white background out
    ' a = mix(1., a, smoothstep(.25, .75, texture2D(m, v).r));' +                                      // dark that is walled in by the game stays
    ' gl_FragColor = vec4(c.rgb * a, a); }';
  function makeGl(canvas) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    const maskTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([255]));      // until the first map: everything counts as joined, as before 0.6
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'm'), 1);
    return { gl, mode: gl.getUniformLocation(prog, 'mode'), tol: gl.getUniformLocation(prog, 'tol') };
  }
  /** Which background-coloured parts of the picture are joined to its edge? A flood fill from the border over a
      quarter-size copy. Returns { w, h, data } with 255 = joined (that is background), 0 = walled in or not background. */
  const MASK_DIV = 4, MASK_EVERY = 240;
  function fillMask(t, v, w, h) {
    const mw = Math.max(8, Math.round(w / MASK_DIV)), mh = Math.max(8, Math.round(h / MASK_DIV));
    if (!t.mc || t.mc.width !== mw || t.mc.height !== mh) { t.mc = document.createElement('canvas'); t.mc.width = mw; t.mc.height = mh; t.mg = t.mc.getContext('2d', { willReadFrequently: true }); t.mask = new Uint8Array(mw * mh); t.stack = new Int32Array(mw * mh); }
    t.mg.drawImage(v, 0, 0, mw, mh);
    const d = t.mg.getImageData(0, 0, mw, mh).data, out = t.mask, st = t.stack, white = t.key === 'white', lim = Math.round((t.s.tol || 0.07) * 255);
    const bg = (i) => { const p = i * 4; return white ? Math.min(d[p], d[p + 1], d[p + 2]) >= 255 - lim : Math.max(d[p], d[p + 1], d[p + 2]) <= lim; };
    out.fill(0);
    let n = 0;
    const push = (i) => { if (!out[i] && bg(i)) { out[i] = 255; st[n++] = i; } };
    for (let x = 0; x < mw; x++) { push(x); push((mh - 1) * mw + x); }
    for (let y = 0; y < mh; y++) { push(y * mw); push(y * mw + mw - 1); }
    while (n) {
      const i = st[--n], x = i % mw;
      if (x > 0) push(i - 1); if (x < mw - 1) push(i + 1); if (i >= mw) push(i - mw); if (i < mw * (mh - 1)) push(i + mw);
    }
    return { w: mw, h: mh, data: out };
  }
  /** is the edge of the picture all black (or all white)? Then that is a see-through window's empty background. */
  function guessKey(video) {
    try {
      const w = 96, h = 54, t = document.createElement('canvas'); t.width = w; t.height = h;
      const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let n = 0, black = 0, white = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x > 1 && x < w - 2 && y > 1 && y < h - 2) continue;
        const i = (y * w + x) * 4, hi = Math.max(d[i], d[i + 1], d[i + 2]), lo = Math.min(d[i], d[i + 1], d[i + 2]);
        n++; if (hi < 12) black++; if (lo > 243) white++;
      }
      return black / n > 0.6 ? 'black' : white / n > 0.85 ? 'white' : 'none';
    } catch (e) { return 'none'; }
  }
  // ---------------------------------------------------------------- Windows' pointer out of a game's picture (0.9.4)
  // The engine draws the mouse pointer into a window's picture whatever is asked. mystream.js (pointerFrame) says where
  // in each game's picture the pointer is drawn (ptr.tiles: shares of the picture, with a margin); unless the owner set
  // that game's mouse to "shown", that part is taken from `clean`, a copy of the game's picture made while the pointer was
  // elsewhere (kept fresh every few pictures; while the pointer is there, everything round it is kept fresh). What is
  // under a pointer that stays still therefore stands still too, and moves on as soon as the pointer does.
  // No copy is made while the place of the game's window is not known yet (ptr.known): it could hold the pointer. If the
  // pointer is already over the game then, its part is filled from the rows just above and below it (first tried on the
  // owner's PC: the mouse was over the game when MyStream opened, and the first copy kept Windows' pointer in it).
  let ptr = { tiles: {}, known: [], host: { at: 'off' }, key: 0 };
  const CLEAN_EVERY = 3;
  function frameOf(t, v, w, h) {
    if (t.s.mouse === 'show') { t.patched = false; return v; }
    if (!t.cc || t.cc.width !== w || t.cc.height !== h) { t.cc = document.createElement('canvas'); t.cc.width = w; t.cc.height = h; t.cg = t.cc.getContext('2d'); t.ccFull = false; t.prevBox = null; }
    if (!(ptr.known || []).includes(t.id)) { t.ccFull = false; t.prevBox = null; t.patched = false; return v; }      // where the pointer is in this picture is not known yet
    const now = ptr.tiles && ptr.tiles[t.id], was = t.prevBox;
    t.prevBox = now || null;
    if (!now) {
      if (!t.ccFull || t.frames % CLEAN_EVERY === 0) { t.cg.drawImage(v, 0, 0, w, h); t.ccFull = true; }
      t.patched = false;
      return v;
    }
    // the pointer as it was a moment ago is covered too: the picture and the news of where the mouse is do not arrive together
    const b = was ? [Math.min(now[0], was[0]), Math.min(now[1], was[1]), Math.max(now[2], was[2]), Math.max(now[3], was[3])] : now;
    const x0 = Math.max(0, Math.min(w, Math.floor(b[0] * w))), y0 = Math.max(0, Math.min(h, Math.floor(b[1] * h))), x1 = Math.max(x0, Math.min(w, Math.ceil(b[2] * w))), y1 = Math.max(y0, Math.min(h, Math.ceil(b[3] * h)));
    const g = t.cg, band = (x, y, bw, bh) => { if (bw > 0 && bh > 0) g.drawImage(v, x, y, bw, bh, x, y, bw, bh); };
    if (!t.ccFull && x1 > x0 && y1 > y0) {                  // nothing clean of that part yet: the row above it stretched down over its upper half, the row below up over the rest
      const mid = y0 + Math.round((y1 - y0) / 2), above = y0 > 0 ? y0 - 1 : y1 < h ? y1 : -1, below = y1 < h ? y1 : above;
      if (above >= 0) { g.drawImage(v, x0, above, x1 - x0, 1, x0, y0, x1 - x0, mid - y0); g.drawImage(v, x0, below, x1 - x0, 1, x0, mid, x1 - x0, y1 - mid); }
      else g.clearRect(x0, y0, x1 - x0, y1 - y0);
      t.filled = (t.filled || 0) + 1;
    }
    band(0, 0, w, y0); band(0, y1, w, h - y1); band(0, y0, x0, y1 - y0); band(x1, y0, w - x1, y1 - y0);
    t.ccFull = true; t.patched = true; t.patches = (t.patches || 0) + 1;
    return t.cc;
  }
  function makeTile(s) {
    const el = document.createElement('div'); el.className = 'src gone';
    const wrap = document.createElement('div'); wrap.className = 'stLayer'; document.body.appendChild(wrap); wrap.appendChild(el);      // every game has a layer of its own, so it can lie anywhere in the order
    const canvas = document.createElement('canvas'), video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    el.appendChild(canvas); el.appendChild(video);          // (the video stays in the page, unseen: a video outside the page is not told about new pictures)
    const glx = makeGl(canvas);
    return { id: s.id, el, wrap, canvas, video, glx, g2: glx ? null : canvas.getContext('2d', { willReadFrequently: true }), mediaId: null, stream: null, live: false, w: 0, h: 0, frames: 0, key: 'none', guessed: 0, error: '', s };
  }
  function stopTile(t) {
    t.token = {};
    if (t.stream) for (const tr of t.stream.getTracks()) { tr.onended = null; tr.stop(); }
    t.stream = null; t.video.srcObject = null; t.live = false; t.mediaId = null; t.el.classList.add('gone');
  }
  async function startTile(t, mediaId) {
    stopTile(t);
    t.mediaId = mediaId; t.error = ''; t.frames = 0; t.guessed = 0;
    const token = t.token = {}, tab = /^tab:(\d+)x(\d+):(.+)$/.exec(mediaId);      // "tab:<width>x<height>:<id>": a page of this program (mystream.js, dexMedia)
    try {
      const stream = window.__stageTestStream && /^test:/.test(mediaId) ? window.__stageTestStream(mediaId)
        : tab ? await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: tab[3], minWidth: +tab[1], maxWidth: +tab[1], minHeight: +tab[2], maxHeight: +tab[2], maxFrameRate: 30 } } })      // the Field Dex: a picture of its own page at its own size (no mouse pointer in it)
        : await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: mediaId, maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30 } } });      // that one window, nothing else
      if (t.token !== token) { for (const tr of stream.getTracks()) tr.stop(); return; }
      t.stream = stream; t.video.srcObject = stream;
      try { await stream.getVideoTracks()[0].applyConstraints({ cursor: 'never' }); } catch (e) { /* this engine draws the pointer into a window's picture whatever is asked */ }
      try { t.cursor = String(stream.getVideoTracks()[0].getSettings().cursor || 'not said'); } catch (e) { t.cursor = '?'; }
      stream.getVideoTracks()[0].onended = () => { if (t.token === token) { stopTile(t); report(); } };          // the game was closed: its tile goes, the stage stays as it is
      await t.video.play();
      let lastPaint = 0;
      const loop = () => {
        if (t.token !== token) return;
        lastPaint = performance.now(); paintTile(t);
        t.video.requestVideoFrameCallback(loop);
      };
      loop();
      const watch = setInterval(() => { if (t.token !== token) { clearInterval(watch); return; } if (performance.now() - lastPaint > 400 && t.video.videoWidth) { lastPaint = performance.now(); paintTile(t); } }, 200);      // should the page not be told, look for itself
    } catch (e) { if (t.token === token) { t.error = String((e && e.message) || e).slice(0, 120); t.live = false; report(); } }
  }
  function paintTile(t) {
    const v = t.video, w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return;
    const first = !t.live || w !== t.w || h !== t.h;
    if (first) { t.w = w; t.h = h; t.canvas.width = w; t.canvas.height = h; if (t.glx) t.glx.gl.viewport(0, 0, w, h); t.guessed = 0; }
    t.frames++;
    // "auto": look at the picture's edge a few times in the first seconds, then keep the answer
    const src = frameOf(t, v, w, h);                       // the picture, with Windows' pointer painted over unless this game's mouse is shown (0.9.4)
    if (t.s.key !== 'auto') t.key = t.s.key;
    else if (t.guessed < 4 && (t.frames === 2 || t.frames === 20 || t.frames === 60 || t.frames === 150)) { t.key = guessKey(src); t.guessed++; }
    if (!t.glx) paintSlow(t, src, w, h);
    else try {
      const { gl, mode, tol } = t.glx;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (t.key !== 'none' && performance.now() - (t.maskAt || 0) > MASK_EVERY) {
        t.maskAt = performance.now();
        const k = fillMask(t, src, w, h);
        gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, k.w, k.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, k.data); gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniform1f(mode, t.key === 'black' ? 1 : t.key === 'white' ? 2 : 0); gl.uniform1f(tol, t.s.tol || 0.07);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch (e) { t.error = String(e.message || e).slice(0, 120); }
    if (first) { t.live = true; t.el.classList.remove('gone'); placeTile(t); report(); }
    else if (t.frames === 21 || t.frames === 61 || t.frames === 151) report();
  }
  /** the same without a graphics card (WebGL switched off or broken): slower, every other picture, same result */
  window.__stageMask = (picture, key) => { const k = fillMask({ s: {}, key: key || 'black' }, picture, picture.width, picture.height); return { w: k.w, h: k.h, at: (x, y) => k.data[Math.round(y / MASK_DIV) * k.w + Math.round(x / MASK_DIV)] }; };      // for tools/mystreamcheck.js
  function paintSlow(t, v, w, h) {
    if (t.key !== 'none' && t.frames % 2) return;
    const g = t.g2;
    try {
      g.clearRect(0, 0, w, h); g.drawImage(v, 0, 0, w, h);
      if (t.key === 'none') return;
      const img = g.getImageData(0, 0, w, h), d = img.data, hi = Math.round((t.s.tol || 0.07) * 255), lo = hi * 0.5, white = t.key === 'white';
      const k = fillMask(t, v, w, h);                       // only background joined to the edge goes (see FS above)
      for (let i = 0, px = 0; i < d.length; i += 4, px++) {
        const m = white ? 255 - Math.min(d[i], d[i + 1], d[i + 2]) : Math.max(d[i], d[i + 1], d[i + 2]);
        if (m < hi && k.data[Math.min(k.h - 1, ((px / w) | 0) * k.h / h | 0) * k.w + Math.min(k.w - 1, (px % w) * k.w / w | 0)]) d[i + 3] = m <= lo ? 0 : Math.round(((m - lo) / (hi - lo)) * 255);
      }
      g.putImageData(img, 0, 0);
    } catch (e) { t.error = String(e.message || e).slice(0, 120); }
  }
  function placeTile(t) {
    const s = t.s, ar = t.w && t.h ? t.w / t.h : s.ar || 16 / 9;
    Object.assign(t.el.style, { left: (s.x * 100).toFixed(3) + '%', top: (s.y * 100).toFixed(3) + '%', width: (s.w * 100).toFixed(3) + '%', aspectRatio: String(ar) });
  }
  function applySources(list) {
    const want = new Set(list.map((s) => s.id));
    for (const [id, t] of tiles) if (!want.has(id)) { stopTile(t); t.wrap.remove(); tiles.delete(id); }
    list.forEach((s, i) => {
      let t = tiles.get(s.id);
      if (!t) { t = makeTile(s); tiles.set(s.id, t); }
      t.s = s;
      placeTile(t);
      if (s.mediaId !== t.mediaId) { if (s.mediaId) startTile(t, s.mediaId); else stopTile(t); }
    });
    applyOrder();
  }
  /** what lies over what: cfg.order lists 'fountain', 'trainer' and the games from the back to the front */
  function applyOrder() {
    const order = (cfg && cfg.order) || ['fountain', 'trainer'], z = (k) => 10 + Math.max(0, order.indexOf(k)) * 10;
    $('root').style.zIndex = String(z('trainer')); $('stPlaces').style.zIndex = String(z('fountain'));
    $('stNotes').style.zIndex = String(Math.min(z('trainer'), z('fountain')) - 5);      // the notes lie on the grass, under the Pokémon and the fountain
    for (const [id, t] of tiles) t.wrap.style.zIndex = String(z(id));
  }

  // ---------------------------------------------------------------- the owner's own pointer (0.9.4)
  // "On Screen Trainer the mouse is the player": viewers see the owner's pointer, the one won in the game and chosen in
  // MyStream's "pointer" tab, where the mouse is (mystream.js, pointerFrame, decides where that is on the stage). When the
  // mouse is off the stage an arrow in the pointer's colours sits on the rim, pointing to where it went. It is a
  // picture only: it takes no clicks (the booth's "Play" passes those on, as before).
  const KEYS = ['poke', 'great', 'ultra', 'master', 'star', 'badge', 'crown', 'bolt'];      // the order of CURSORS in online.js (and of src/visitors.js)
  let hp = null;
  function hostEls() {
    if (hp) return hp;
    const host = document.body;                            // (not in #screen: that is hidden with the Pokémon when "Screen Trainer" is switched off on the stage)
    const el = document.createElement('div'); el.className = 'vp host'; el.id = 'hostPointer'; el.appendChild(document.createElement('i'));
    const edge = document.createElement('div'); edge.className = 'vpEdge'; edge.id = 'hostEdge'; edge.appendChild(document.createElement('b')); edge.appendChild(document.createElement('i'));
    el.hidden = edge.hidden = true;
    host.appendChild(el); host.appendChild(edge);
    hp = { el, edge, x: 0, y: 0, tx: 0, ty: 0, at: 'off', a: 0, last: performance.now() };
    const step = (now) => {
      const dt = Math.min(0.1, (now - hp.last) / 1000), k = Math.min(1, dt * 22); hp.last = now;
      if (hp.at !== 'off' && (hp.x !== hp.tx || hp.y !== hp.ty)) { hp.x += (hp.tx - hp.x) * k; hp.y += (hp.ty - hp.y) * k; if (Math.abs(hp.tx - hp.x) < 0.5 && Math.abs(hp.ty - hp.y) < 0.5) { hp.x = hp.tx; hp.y = hp.ty; } drawHost(); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return hp;
  }
  function drawHost() {
    const p = (cfg && cfg.pointer) || { show: true, size: 1.5, edge: true }, s = p.size || 1.5, key = typeof Pointers !== 'undefined' ? ((Pointers.LIST[ptr.key] || Pointers.LIST[0]).k) : KEYS[ptr.key] || KEYS[0];
    const via = ptr.host && ptr.host.via && cfg && (cfg.sources || []).find((q) => q.id === ptr.host.via);
    const own = !!(via && via.mouse === 'show');            // that game's own pointer is shown: one pointer is enough
    const onStage = p.show !== false && hp.at === 'stage' && !own, onEdge = p.show !== false && p.edge !== false && hp.at === 'edge';
    if (hp.el.dataset.k !== key) { if (typeof Pointers !== 'undefined') { Pointers.paint(hp.el, ptr.key); Pointers.paint(hp.edge, ptr.key); } else { hp.el.dataset.k = key; hp.edge.dataset.k = key; } }      // (0.9.7: any of the pointers in pointers.js)
    hp.el.hidden = !onStage; hp.edge.hidden = !onEdge;
    if (onStage) hp.el.style.transform = `translate3d(${Math.round(hp.x)}px, ${Math.round(hp.y)}px, 0) scale(${s})`;
    if (onEdge) hp.edge.style.transform = `translate3d(${Math.round(hp.x)}px, ${Math.round(hp.y)}px, 0) rotate(${hp.a}deg) scale(${Math.min(2, 0.6 + s * 0.4)})`;
  }
  function onPointer(f) {
    if (!f || typeof f !== 'object') return;
    ptr = { tiles: f.tiles && typeof f.tiles === 'object' ? f.tiles : {}, known: Array.isArray(f.known) ? f.known : [], host: f.host && typeof f.host === 'object' ? f.host : { at: 'off' }, key: f.key | 0 };
    const h = hostEls(), at = ['stage', 'edge'].includes(ptr.host.at) ? ptr.host.at : 'off';
    const sx = Number.isFinite(ptr.host.x) ? ptr.host.x * (window.innerWidth / ((cfg && cfg.stage && cfg.stage.w) || 1280)) : 0, sy = Number.isFinite(ptr.host.y) ? ptr.host.y * (window.innerHeight / ((cfg && cfg.stage && cfg.stage.h) || 720)) : 0;
    if (at !== h.at) { h.x = sx; h.y = sy; }                // from the rim onto the stage, or the other way: no glide across
    h.at = at; h.tx = sx; h.ty = sy; h.a = Number.isFinite(ptr.host.a) ? ptr.host.a : 0;
    drawHost();
  }
  const hostReport = () => (hp ? { at: hp.at, x: Math.round(hp.x), y: Math.round(hp.y), shown: !hp.el.hidden, edge: !hp.edge.hidden, key: hp.el.dataset.k || '' } : { at: 'none' });
  window.__stagePointer = onPointer;                          // for tools/mystreamcheck.js

  // ---------------------------------------------------------------- sticky notes
  const NOTE_W = 232;
  function applyNotes(list) {
    const box = $('stNotes'), want = new Set(list.map((n) => n.id));
    for (const [id, el] of notes) if (!want.has(id)) { el.remove(); notes.delete(id); }
    for (const n of list) {
      let el = notes.get(n.id);
      if (!el) { el = document.createElement('div'); notes.set(n.id, el); box.appendChild(el); }
      const cls = `note ${n.color}${n.text.length > 90 ? ' longer' : n.text.length > 40 ? ' long' : ''}`;
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== n.text) el.textContent = n.text;
      el.style.setProperty('--rot', n.rot + 'deg');
      el.style.transform = `rotate(${n.rot}deg)`;
      el.style.left = Math.round(n.x * (window.innerWidth - NOTE_W)) + 'px';
      el.style.top = Math.round(12 + n.y * (window.innerHeight - 24 - Math.max(60, el.offsetHeight))) + 'px';
    }
  }

  // ---------------------------------------------------------------- the layout arrives
  function apply(next) {
    cfg = next;
    window.__ptrScale = (cfg.pointer && cfg.pointer.size) || 1.5;      // visitors' pointers are as large as the owner's (src/visitors.js, 0.9.7)
    document.body.classList.toggle('notrainer', cfg.showTrainer === false);
    document.body.classList.toggle('nofountain', cfg.fountain === false); placeFountain();
    applySources(cfg.sources || []);
    applyNotes(cfg.notes || []);
    showMic();
    if (hp) drawHost();
    report();
  }
  const showMic = () => { $('stMic').hidden = !(micOpen && cfg && cfg.micBadge !== false); };
  let reportT = 0;
  function report() {
    clearTimeout(reportT);
    reportT = setTimeout(() => {
      const sources = {}, rects = {};
      for (const [id, t] of tiles) sources[id] = { live: t.live, w: t.w, h: t.h, key: t.key };
      for (const [id, el] of notes) rects[id] = { x: el.offsetLeft / window.innerWidth, y: el.offsetTop / window.innerHeight, w: el.offsetWidth / window.innerWidth, h: el.offsetHeight / window.innerHeight };
      try { ms.stageInfo({ sources, notes: rects }); } catch (e) { /* closing */ }
    }, 120);
  }

  function start() {
    drawGround();
    let last = performance.now(), n = 0;
    const tick = (now) => { frames++; n++; if (now - last >= 1000) { fps = Math.round((n * 1000) / (now - last)); n = 0; last = now; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const wait = setInterval(() => { if (typeof G !== 'undefined' && G.save && G.world) { clearInterval(wait); G.ground = true; G.onGroundChange = () => drawGround(false); buildFountain(); drawGround(false); ready = true; report(); } }, 200);      // (G.ground: there is ground here, so its types count in a fight)
    window.addEventListener('resize', () => { drawGround(true); placeFountain(); if (cfg) applyNotes(cfg.notes || []); report(); });      // (the window is brought to its exact size just after it opens)
    if (!ms) return;
    ms.onStage((c) => apply(c));
    ms.onMic((open) => { micOpen = !!open; showMic(); });
    if (ms.onPointer) ms.onPointer(onPointer);
    ms.stageInit().then((c) => { if (c) apply(c); });
    setInterval(report, 5000);
  }
  start();

  return {
    ready: () => ready && !!cfg,
    /** for the self-check */
    report() {
      const probe = document.createElement('div'); probe.className = 'gsay'; probe.hidden = false; probe.style.visibility = 'hidden'; document.body.appendChild(probe);
      const blurred = /blur/.test(getComputedStyle(probe).filter); probe.remove();
      const hooked = typeof Mewtwo !== 'undefined' && /StageHost/.test(String(Mewtwo.say)) && /StageHost\.mask/.test(String(Mewtwo.say)) && window.StageHost.scramble('Hello there') !== 'Hello there';
      const sources = {};
      for (const [id, t] of tiles) sources[id] = { live: t.live, w: t.w, h: t.h, key: t.key, frames: t.frames, error: t.error, gpu: !!t.glx, cursor: t.cursor, mouse: t.s.mouse || 'hide', patches: t.patches || 0, filled: t.filled || 0, known: (ptr.known || []).includes(id), pointerOver: !!(ptr.tiles && ptr.tiles[id]) };
      return { pointer: hostReport(), w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, frames, fps, ground: groundOk, fountain: !!fountain, fountainNote, fountainSeen: fountainSeen(), game: typeof G !== 'undefined' && !!G.save, team: typeof G !== 'undefined' && G.save ? G.save.team.length : 0,
        actors: typeof G !== 'undefined' && G.actors ? G.actors.length : 0, sources, notes: notes.size, mask: blurred && hooked, maskNote: `${blurred ? 'blurred' : 'NOT blurred'}, ${hooked ? 'scrambled' : 'NOT scrambled'}` };
    },
    /** small pictures of each game window as it arrives, before its background is removed (self-check) */
    snapshots() {
      const out = {};
      let i = 0;
      for (const [, t] of tiles) {
        i++;
        if (!t.live) continue;
        try { const k = Math.min(1, 960 / t.w), cv = document.createElement('canvas'); cv.width = Math.round(t.w * k); cv.height = Math.round(t.h * k); cv.getContext('2d').drawImage(t.video, 0, 0, cv.width, cv.height); out[i] = cv.toDataURL('image/png'); } catch (e) { /* no picture */ }
      }
      return out;
    },
  };
})();
