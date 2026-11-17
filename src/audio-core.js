// Screen Trainer — audio core: turns requests ("the catch jingle", "the next half second of music") into
// PCM. Uses the sound bank imported from a ROM when there is one and the built-in synth (tunes.js) otherwise.
// Runs inside the audio worker (audio-worker.js); sound.js runs it on the page itself if workers are unavailable.
(function (root, factory) {
  const api = factory(root.M4A || (typeof require === 'function' ? require('./m4a.js') : null), root.SoundMap || (typeof require === 'function' ? require('./soundmap.js') : null),
    root.Tunes || (typeof require === 'function' ? require('./tunes.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AudioCore = api;
})(typeof self !== 'undefined' ? self : this, function (M4A, SoundMap, Tunes) {
  'use strict';
  let rate = 48000, img = null;
  const players = new Map();
  const BUILTIN = [3, 8, 14, 21, 27, 33, 40, 46, 52, 59, 65, 71];

  const tracks = () => (img ? SoundMap.MUSIC.map(([id, title]) => ({ id: 's' + id, title })) : BUILTIN.map((seed) => ({ id: 'g' + seed, title: Tunes.title(seed, 'roam') })));
  function battleTrack(variant) {
    if (img) { const b = SoundMap.BATTLE[variant] || SoundMap.BATTLE.wild; return { id: 's' + b[0], title: b[1] }; }
    const seed = { wild: 101, horde: 102, alpha: 103, shiny: 104, legend: 105, mewtwo: 105, deoxys: 105 }[variant] || 101;
    return { id: 'b' + seed, title: Tunes.title(seed, 'battle') };
  }
  function init(msg) {
    rate = msg.rate || 48000; img = null; players.clear();
    if (msg.bank) {
      try { const im = M4A.open(msg.bank); if (SoundMap.supported(im.meta)) img = im; } catch (e) { img = null; }
    }
    return { t: 'ready', bank: img ? { game: SoundMap.gameName(img.meta), songs: img.meta.songs || img.meta.songCount, cries: img.meta.cryCount } : null, tracks: tracks() };
  }
  const mono = (r, vol) => { const n = r.l.length, out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = (r.l[i] + r.r[i]) * 0.5 * vol; return out; };

  function sfx(msg) {
    if (img) {
      const ent = msg.name === 'move' ? SoundMap.moveSong(msg.param.key, msg.param.type, msg.param.style) : SoundMap.SFX[msg.name];
      if (ent) { const r = M4A.renderSong(img, ent[0], rate, ent[2] || 6); if (r && r.l.length > 8) return mono(r, ent[1] * 1.6); }
    }
    return Tunes.sfx(msg.name, rate, msg.param);
  }
  function cry(msg) {
    const idx = img ? SoundMap.cryIndex(msg.sp) : -1;
    return (idx >= 0 && M4A.cry(img, idx, rate, { vol: 0.8 })) || Tunes.cry(msg.sp, rate);
  }
  function openStream(msg) {
    const id = String(msg.track || ''), kind = id[0], num = +id.slice(1);
    let p = null;
    if (kind === 's' && img) { p = new M4A.Player(img, num, rate); if (!p.ok) p = null; }
    if (!p) p = new Tunes.Player(kind === 's' ? num : num || 3, kind === 'b' || msg.mood === 'battle' ? 'battle' : 'roam', rate);
    players.set(msg.sid, p);
  }

  /** handle one request; `post(message, transferList)` sends the answer */
  function handle(msg, post) {
    switch (msg.t) {
      case 'init': post(init(msg)); break;
      case 'sfx': case 'cry': {
        let pcm = null;
        try { pcm = msg.t === 'sfx' ? sfx(msg) : cry(msg); } catch (e) { pcm = null; }
        post({ t: 'pcm', id: msg.id, pcm }, pcm ? [pcm.buffer] : []);
        break;
      }
      case 'battleTrack': post({ t: 'battleTrack', id: msg.id, track: battleTrack(msg.variant) }); break;
      case 'open': try { openStream(msg); } catch (e) { players.delete(msg.sid); } break;
      case 'pull': {
        const p = players.get(msg.sid);
        if (!p) { post({ t: 'chunk', sid: msg.sid, l: null, r: null }); break; }
        let out;
        try { out = p.render(msg.n); } catch (e) { players.delete(msg.sid); post({ t: 'chunk', sid: msg.sid, l: null, r: null }); break; }
        post({ t: 'chunk', sid: msg.sid, l: out[0], r: out[1], loops: p.loops || 0, done: !!p.done }, [out[0].buffer, out[1].buffer]);
        break;
      }
      case 'close': players.delete(msg.sid); break;
      default: break;
    }
  }
  return { handle, tracks, battleTrack };
});
