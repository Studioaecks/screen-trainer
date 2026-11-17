// Screen Trainer — sound for the overlay: effects, cries and music through Web Audio.
// PCM comes from the audio core (a worker): the imported ROM sound bank when there is one, the built-in
// synth otherwise. Everything here degrades to silence when audio is unavailable; the game never waits on it.
'use strict';

const Sound = (() => {
  const JINGLES = new Set(['caught', 'levelUp', 'evolve', 'item', 'berry', 'treasure', 'badge', 'recover', 'lead']);
  const GAP = { hit: 0.09, hitSuper: 0.12, hitWeak: 0.09, hop: 0.05, land: 0.05, statUp: 0.4, statDown: 0.4, heal: 0.25, levelUp: 0.9, scroll: 0.03, pet: 0.12, poke: 0.05, faint: 0.2, exp: 0.5, bounce: 0.04, shake: 0.1 };
  const MAX_VOICES = 10, CHUNK = 0.4, AHEAD = 1.1, CACHE = 90;

  let ctx = null, master = null, sfxGain = null, musGain = null, duck = null, core = null, ok = false, ready = false, set = {}, st = null;
  let reqId = 1, voices = 0, sceneNow = 'roam', sceneWant = 'roam', sceneT = 0, variantWant = 'wild', playedFor = 0, pumpTimer = null, sidSeq = 1;
  const waiting = new Map(), buffers = new Map(), lastAt = {}, pendingPlays = new Map();
  const info = { bank: null, tracks: [], track: null, battle: null, playing: false };
  let roam = null, battle = null, battleRest = 0;
  const BATTLE_KEEP = 60;      // seconds a paused battle theme is kept so the next fight can pick it up again

  // ---------------------------------------------------------------- core (worker, or the page as a fallback)
  function startCore() {
    const onMsg = (m) => {
      if (m.t === 'ready') { info.bank = m.bank; info.tracks = m.tracks || []; ready = true; buffers.clear(); pickTrack(set.musicTrack); preload(); refreshMusic(); changed(); }
      else if (m.t === 'pcm' || m.t === 'battleTrack') { const fn = waiting.get(m.id); waiting.delete(m.id); if (fn) fn(m); }
      else if (m.t === 'chunk') onChunk(m);
    };
    try {
      const w = new Worker('src/audio-worker.js');
      w.onmessage = (e) => onMsg(e.data);
      w.onerror = () => { core = null; inlineCore(onMsg); };
      core = { post: (m, tr) => w.postMessage(m, tr || []) };
    } catch (e) { inlineCore(onMsg); }
  }
  function inlineCore(onMsg) {
    const names = ['src/m4a.js', 'src/soundmap.js', 'src/tunes.js', 'src/audio-core.js'];
    const next = () => {
      if (!names.length) { core = { post: (m) => setTimeout(() => window.AudioCore.handle(m, onMsg), 0) }; loadBank(); return; }
      const s = document.createElement('script'); s.src = names.shift(); s.onload = next; s.onerror = () => { ok = false; }; document.body.appendChild(s);
    };
    next();
  }
  async function loadBank() {
    let bank = null;
    try { bank = st && st.soundBank ? await st.soundBank() : null; } catch (e) { bank = null; }
    ready = false;
    if (core) core.post({ t: 'init', rate: ctx.sampleRate, bank: bank || null });
  }
  const ask = (msg, fn) => { msg.id = reqId++; waiting.set(msg.id, fn); core.post(msg); };

  function init(settings, bridge) {
    set = settings || {}; st = bridge;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || ctx) return;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      duck = ctx.createGain(); duck.connect(master);
      musGain = ctx.createGain(); musGain.connect(duck);
      ok = true;
    } catch (e) { ok = false; ctx = null; return; }
    apply(set);
    startCore();
    if (core && core.post && !ready) loadBank();
    pumpTimer = setInterval(tick, 120);
  }

  const audible = () => ok && !set.mute && set.visible !== false;
  function apply(settings) {
    const prevTrack = set.musicTrack;
    set = settings || {};
    if (!ok) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(audible() ? Math.max(0, Math.min(1, set.masterVolume === undefined ? 1 : +set.masterVolume)) : 0, t, 0.03);      // (1.0: the master slider)
    sfxGain.gain.setTargetAtTime(Math.max(0, Math.min(1, set.sfxVolume === undefined ? 0.6 : +set.sfxVolume)), t, 0.03);
    musGain.gain.setTargetAtTime(Math.max(0, Math.min(1, set.musicVolume === undefined ? 0.35 : +set.musicVolume)) * 0.9, t, 0.05);
    if (audible() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ready && set.musicTrack && set.musicTrack !== prevTrack && (!info.track || info.track.id !== set.musicTrack)) { pickTrack(set.musicTrack); restartRoam(); }
    refreshMusic();
  }

  // ---------------------------------------------------------------- effects and cries
  function buffer(key, msg, then) {
    if (buffers.has(key)) { const b = buffers.get(key); buffers.delete(key); buffers.set(key, b); then(b); return; }
    if (pendingPlays.has(key)) { if (then !== noop) pendingPlays.get(key).push(then); return; }
    pendingPlays.set(key, then === noop ? [] : [then]);
    ask(msg, (m) => {
      const list = pendingPlays.get(key) || []; pendingPlays.delete(key);
      if (!m.pcm || !m.pcm.length) { buffers.set(key, null); return; }
      const b = ctx.createBuffer(1, m.pcm.length, ctx.sampleRate);
      b.getChannelData(0).set(m.pcm);
      buffers.set(key, b);
      if (buffers.size > CACHE) buffers.delete(buffers.keys().next().value);
      for (const fn of list) fn(b);
    });
  }
  const noop = () => {};
  function start(b, o) {
    if (!b || voices >= MAX_VOICES + (o.jingle ? 4 : 0)) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; src.playbackRate.value = o.rate || 1; g.gain.value = o.vol === undefined ? 1 : o.vol;
    let node = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
    src.connect(g); node.connect(sfxGain);
    voices++; src.onended = () => { voices--; };
    src.start();
    if (o.jingle && musGain) {                         // let fanfares cut through the music
      const t = ctx.currentTime, d = b.duration / (o.rate || 1);
      duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(0.35, t, 0.04); duck.gain.setTargetAtTime(1, t + Math.max(0.3, d - 0.2), 0.25);
    }
  }
  /** pan for something at screen x */
  const panAt = (x) => (typeof x === 'number' && G.W ? ((((x + (G.vx || 0)) / (G.SW || G.W)) * 2 - 1) * 0.55) : 0);      // left to right across the whole screen

  /** play a named effect: Sound.play('caught') / Sound.play('hit', { x: actor.x, vol: 0.8 }) */
  function play(name, o = {}) {
    if (!audible() || !ready || !(+set.sfxVolume > 0 || set.sfxVolume === undefined)) return;
    const now = ctx.currentTime, gap = GAP[name] === undefined ? 0.06 : GAP[name];
    if (now - (lastAt[name] || -9) < gap) return;
    lastAt[name] = now;
    buffer('fx:' + name, { t: 'sfx', name }, (b) => start(b, { vol: o.vol, rate: o.rate, pan: panAt(o.x), jingle: JINGLES.has(name) }));
  }
  /** the sound of an attack */
  function move(mv, type, style, x) {
    if (!audible() || !ready || set.sfxVolume === 0 || !mv) return;
    const key = 'mv:' + mv.k, now = ctx.currentTime;
    if (now - (lastAt[key] || -9) < 0.15 || now - (lastAt.anyMove || -9) < 0.05) return;
    lastAt[key] = lastAt.anyMove = now;
    buffer(info.bank ? key : `mv:${type}:${style}`, { t: 'sfx', name: 'move', param: { key: mv.k, type, style } }, (b) => start(b, { vol: 0.9, pan: panAt(x) }));
  }
  /** a species' cry; pitch < 1 is lower (fainting), > 1 higher */
  function cry(sp, o = {}) {
    if (!audible() || !ready || set.cries === false || set.sfxVolume === 0 || set.criesVolume === 0) return;
    const now = ctx.currentTime;
    if (now - (lastAt.cry || -9) < 0.18) return;
    lastAt.cry = now;
    const cv = set.criesVolume === undefined ? 0.8 : Math.max(0, Math.min(1, +set.criesVolume));      // (1.0: the cries slider; 0.8 is as loud as before)
    buffer('cry:' + sp, { t: 'cry', sp }, (b) => start(b, { vol: (o.vol === undefined ? 0.8 : o.vol) * cv / 0.8, rate: o.pitch || 1, pan: panAt(o.x) }));
  }
  function preload() {
    for (const n of ['hit', 'hitSuper', 'hitWeak', 'throw', 'ballOpen', 'bounce', 'shake', 'click', 'caught', 'faint', 'hop', 'land', 'poke', 'pet', 'select']) buffer('fx:' + n, { t: 'sfx', name: n }, noop);
  }

  // ---------------------------------------------------------------- music: streamed in short chunks
  function Stream(track, mood) {
    this.sid = 'm' + sidSeq++; this.track = track; this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(musGain);
    this.next = 0; this.active = false; this.asked = false; this.nodes = new Set(); this.closed = false;
    core.post({ t: 'open', sid: this.sid, track: track.id, mood });
  }
  Stream.prototype.play = function (fade = 0.6) {
    if (this.closed) return;
    const t = ctx.currentTime;
    this.active = true; this.next = Math.max(this.next, t + 0.08);
    this.gain.gain.cancelScheduledValues(t); this.gain.gain.setValueAtTime(this.gain.gain.value, t); this.gain.gain.linearRampToValueAtTime(1, t + fade);
    this.pump();
  };
  Stream.prototype.pause = function (fade = 0.6, close = false) {
    const t = ctx.currentTime;
    this.active = false; if (close) this.closed = true;
    this.gain.gain.cancelScheduledValues(t); this.gain.gain.setValueAtTime(this.gain.gain.value, t); this.gain.gain.linearRampToValueAtTime(0, t + fade);
    const nodes = [...this.nodes], self = this;
    setTimeout(() => { if (self.active) return; for (const n of nodes) { try { n.stop(); } catch (e) { /* already ended */ } } self.next = 0; if (close) { core.post({ t: 'close', sid: self.sid }); try { self.gain.disconnect(); } catch (e) { /* gone */ } } }, fade * 1000 + 60);
  };
  Stream.prototype.pump = function () {
    if (!this.active || this.asked || this.closed) return;
    if (this.next - ctx.currentTime > AHEAD) return;
    this.asked = true;
    core.post({ t: 'pull', sid: this.sid, n: Math.round(ctx.sampleRate * CHUNK) });
  };
  const streams = new Map();
  function onChunk(m) {
    const s = streams.get(m.sid);
    if (!s) return;
    s.asked = false;
    if (!m.l || !s.active) return;
    const b = ctx.createBuffer(2, m.l.length, ctx.sampleRate);
    b.getChannelData(0).set(m.l); b.getChannelData(1).set(m.r);
    const src = ctx.createBufferSource();
    src.buffer = b; src.connect(s.gain);
    const when = Math.max(s.next, ctx.currentTime + 0.03);
    src.start(when); s.next = when + b.duration;
    s.nodes.add(src); src.onended = () => s.nodes.delete(src);
    s.loops = m.loops || 0;
    if (m.done) { s.active = false; if (s === roam) setTimeout(() => music('next'), Math.max(0, (s.next - ctx.currentTime) * 1000)); }
    s.pump();
  }
  const open = (track, mood) => { const s = new Stream(track, mood); streams.set(s.sid, s); return s; };
  const shut = (s, fade) => { if (!s) return; s.pause(fade, true); setTimeout(() => streams.delete(s.sid), fade * 1000 + 500); };

  function pickTrack(id) {
    const list = info.tracks;
    if (!list.length) { info.track = null; return; }
    info.track = list.find((t) => t.id === id) || list[Math.floor(Math.random() * list.length)];
  }
  const musicOn = () => audible() && ready && set.music !== false && +set.musicVolume !== 0;
  function restartRoam() { if (roam) { shut(roam, 0.5); roam = null; } playedFor = 0; refreshMusic(); }
  /** bring the streams in line with settings and the current scene */
  function refreshMusic() {
    if (!ok || !ready || !core) return;
    const on = musicOn(), inBattle = sceneNow === 'battle' && set.battleMusic !== false;
    if (!on) { if (roam && roam.active) roam.pause(0.4); if (battle) { shut(battle, 0.4); battle = null; info.battle = null; } info.playing = false; changed(); return; }
    if (inBattle) {
      if (roam && roam.active) roam.pause(0.5);
      const v = variantWant;
      // Fights come every half minute. A theme that rested only briefly carries on where it stopped, so the
      // same opening bars are not heard over and over; after a longer calm, or for a different kind of
      // opponent, it starts from the top.
      if (battle && !battle.active && (battle.variant !== v || ctx.currentTime - battleRest > BATTLE_KEEP)) { shut(battle, 0.1); battle = null; }
      if (battle && !battle.active) { battle.play(0.3); info.battle = battle.track; }
      else if (!battle) {
        ask({ t: 'battleTrack', variant: v }, (m) => { if (battle || sceneNow !== 'battle' || !musicOn()) return; battle = open(m.track, 'battle'); battle.variant = v; info.battle = m.track; battle.play(0.25); changed(); });
      }
    } else {
      const fromBattle = !!(battle && battle.active);
      if (fromBattle) { battle.pause(1.2); battleRest = ctx.currentTime; }
      info.battle = null;
      if (!info.track) pickTrack(set.musicTrack);
      if (!info.track) return;
      if (!roam) roam = open(info.track, 'roam');
      if (!roam.active) roam.play(fromBattle ? 1.4 : 0.8);
    }
    info.playing = true;
    changed();
  }
  /** 'battle' while a fight is going on, 'roam' otherwise; variant: wild | horde | alpha | shiny | legend ... */
  function scene(name, variant) { sceneWant = name === 'battle' ? 'battle' : 'roam'; if (variant) variantWant = variant; }
  function tick() {
    if (!ok || !ready) return;
    // a fight has to last a moment before the music changes, and the calm has to last before it changes back
    if (sceneWant !== sceneNow) { sceneT += 0.12; if (sceneT >= (sceneWant === 'battle' ? 0.5 : 4.5)) { sceneNow = sceneWant; sceneT = 0.001; refreshMusic(); } } else if (sceneT > 0.001) sceneT = 0.001;
    for (const s of streams.values()) s.pump();
    if (battle && !battle.active && sceneNow !== 'battle' && ctx.currentTime - battleRest > BATTLE_KEEP) { shut(battle, 0); battle = null; }
    if (roam && roam.active && sceneNow === 'roam') {
      playedFor += 0.12;
      if (set.musicShuffle !== false && playedFor > 170 && (roam.loops || 0) >= 1) music('random');   // move on after a few minutes
    }
  }
  /** music controls from the Pokédex / tray: random | next | prev | toggle | a track id */
  function music(op) {
    if (!ready) return;
    const list = info.tracks, i = info.track ? list.findIndex((t) => t.id === info.track.id) : -1;
    if (op === 'toggle') { if (st && st.setSettings) st.setSettings({ music: set.music === false }); return; }
    if (!list.length) return;
    let next;
    if (op === 'random') { do { next = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && info.track && next.id === info.track.id); }
    else if (op === 'next') next = list[(i + 1) % list.length];
    else if (op === 'prev') next = list[(i - 1 + list.length) % list.length];
    else next = list.find((t) => t.id === op);
    if (!next) return;
    info.track = next;
    if (st && st.setSettings) st.setSettings({ musicTrack: next.id, music: true }); else set.musicTrack = next.id;
    restartRoam();
  }
  /** a new sound bank was imported (or removed): reload it */
  function reload() { if (!ok || !core) return; for (const s of streams.values()) shut(s, 0.2); roam = battle = null; info.track = null; loadBank(); }

  let onChange = null;
  function changed() { if (onChange) onChange(); }
  const status = () => ({ ok, ready, bank: info.bank, tracks: info.tracks, track: info.track, battle: info.battle, playing: info.playing && musicOn(), scene: sceneNow });

  return { init, apply, play, move, cry, scene, music, reload, status, set onChange(fn) { onChange = fn; } };
})();
