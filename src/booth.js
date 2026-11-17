// MyStream — the booth (mystream.html): the window the owner works in. Nothing here is streamed.
//
// What this file does:
//   - shows the live picture of the stage (a capture of the hidden stage page, asked for through the main process);
//   - passes clicks on that picture to the stage ("Play"), or lets games and notes be dragged about ("Move things");
//   - the lists on the right: which windows are shown, sticky notes, Twitch, recording, options;
//   - the talk button (hold to talk; slide up to keep the microphone open) and the sound that goes out;
//   - going live (src/whip.js) and recording (MediaRecorder; the main process writes the file).
// Everything that is saved lives in the main process (mystream.js): this page asks with st.ms.set({ ... }) and gets
// the whole state back as a "view" (also pushed whenever something changes).
'use strict';

const Booth = (() => {
  const st = window.st, ms = st.ms, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0'); };
  const megs = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.round(b / 1e6) + ' MB');
  /** a length in words: "5 seconds", "1 minute", "1 minute 30 seconds", "45 minutes" */
  const span = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60), a = m ? `${m} minute${m === 1 ? '' : 's'}` : '', b = s ? `${s} second${s === 1 ? '' : 's'}` : ''; return [a, b].filter(Boolean).join(' ') || '0 seconds'; };
  const U01 = (i, n) => Math.min(n - 1, Math.max(0, Math.round(i) || 0));      // a slider's value as a place in a list
  const KEY_NAMES = { auto: 'find out', black: 'black', white: 'white', none: 'keep it' };

  let V = null, cfg = null, mode = 'play', tab = 'games', ready = false, drag = null, sel = null, noteColor = 'yellow';
  let stageStream = null, pvFrames = 0, outStream = null, previewTry = 0;
  // online visiting (src/online-host.js): the visitors get the very picture the viewers of a stream get, and nothing else
  window.boothStageTrack = () => { const t = stageStream && stageStream.getVideoTracks()[0]; return t && t.readyState === 'live' ? t : null; };
  let actx = null, dest = null, micGain = null, pcGain = null, analyser = null, micStream = null, pcStream = null, micNote = '';
  const micLevel = () => Math.max(0, Math.min(2, ((cfg && cfg.micVol) === undefined ? 100 : cfg.micVol) / 100)), pcLevel = () => Math.max(0, Math.min(1.5, ((cfg && cfg.pcVol) === undefined ? 100 : cfg.pcVol) / 100));      // (1.0: the mix sliders)
  function applyMix() { if (!actx) return; if (micGain) micGain.gain.setTargetAtTime(talking ? micLevel() : 0, actx.currentTime, 0.012); if (pcGain) pcGain.gain.setTargetAtTime(pcLevel(), actx.currentTime, 0.03); }
  let talking = false, locked = false;
  let liveWanted = false, liveState = 'off', liveTries = 0, retryT = 0, sure = false, sureT = 0;
  let mr = null, recChain = Promise.resolve(), recT = 0, recInfo = null, lastRec = null;
  let wins = [], winsBusy = false;
  const sig = {};                       // what each list was last drawn from, so lists are only rebuilt when they change

  // ---------------------------------------------------------------- small helpers
  let toastT = 0;
  let lastToast = '';
  function toast(text, tone) { lastToast = text; const t = $('toast'); t.textContent = text; t.className = tone || ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, tone === 'bad' ? 9000 : 5000); }
  async function set(patch) { const v = await ms.set(patch); if (v) take(v); }
  let pushT = 0;
  const pushLayout = (now) => { clearTimeout(pushT); const go = () => ms.set({ sources: cfg.sources, notes: cfg.notes }).then((v) => { if (v && !drag) take(v); }); if (now) go(); else pushT = setTimeout(go, 60); };
  function take(v) {
    const keep = drag && cfg ? { sources: cfg.sources, notes: cfg.notes } : null;        // while something is being dragged its place is decided here
    V = v; cfg = v.cfg;
    if (keep) { cfg.sources = keep.sources; cfg.notes = keep.notes; }
    render();
  }

  // ---------------------------------------------------------------- the picture of the stage
  async function startPreview() {
    const mine = ++previewTry;
    if (stageStream) { for (const t of stageStream.getTracks()) { t.onended = null; t.stop(); } stageStream = null; }
    const id = await ms.stageSource();
    if (!id || mine !== previewTry) return;
    const [w, h] = cfg.quality === '1080' ? [1920, 1080] : [1280, 720];
    try {
      stageStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id, minWidth: w, maxWidth: w, minHeight: h, maxHeight: h, maxFrameRate: 30 } } });
    } catch (e) { $('wait').textContent = 'The stage could not be shown: ' + ((e && e.message) || e); return; }
    if (mine !== previewTry) { for (const t of stageStream.getTracks()) t.stop(); return; }
    const pv = $('pv');
    pv.srcObject = stageStream;
    pv.play().catch(() => {});
    stageStream.getVideoTracks()[0].onended = () => setTimeout(startPreview, 1000);       // the stage page started again: pick its picture up again
    outStream = null;
    const before = pvFrames;
    setTimeout(async () => {                                // no picture from the hidden page? ask for it to be shown out of sight, then try once more
      if (mine !== previewTry || pvFrames > before) return;
      const level = await ms.nudge();
      if (level && mine === previewTry) startPreview();
    }, 4500);
  }
  function countFrames() {
    const pv = $('pv');
    const tick = () => { pvFrames++; if (pvFrames === 1) $('wait').hidden = true; pv.requestVideoFrameCallback(tick); };
    pv.requestVideoFrameCallback(tick);
  }

  // ---------------------------------------------------------------- sound: the microphone (only while talking) and, if wanted, the computer's sound
  function audio() {
    if (actx) return;
    actx = new AudioContext({ sampleRate: 48000 });
    dest = actx.createMediaStreamDestination();
    micGain = actx.createGain(); micGain.gain.value = 0; micGain.connect(dest);
    pcGain = actx.createGain(); pcGain.gain.value = pcLevel(); pcGain.connect(dest);
    analyser = actx.createAnalyser(); analyser.fftSize = 512;
    const hush = actx.createConstantSource(); hush.offset.value = 0; hush.connect(dest); hush.start();      // keeps the sound track running while nobody talks
  }
  async function openMic() {
    audio();
    if (micStream) return true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: cfg.micId ? { exact: cfg.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      try { micStream = cfg.micId ? await navigator.mediaDevices.getUserMedia({ audio: true }) : null; } catch (x) { micStream = null; }
      if (!micStream) { micNote = 'No microphone could be opened. Check that one is plugged in and allowed in Windows.'; renderTalk(); return false; }
    }
    micNote = '';
    const src = actx.createMediaStreamSource(micStream);
    src.connect(analyser); src.connect(micGain);
    for (const t of micStream.getAudioTracks()) t.enabled = talking;
    fillMics();
    return true;
  }
  function closeMic() { if (micStream) for (const t of micStream.getTracks()) t.stop(); micStream = null; }
  async function setTalking(on) {
    if (on === talking) return;
    talking = on;
    renderTalk();
    if (on && !(await openMic())) { talking = false; locked = false; renderTalk(); return; }
    if (micStream) for (const t of micStream.getAudioTracks()) t.enabled = talking;       // closed means closed: the microphone gives nothing at all
    if (micGain) micGain.gain.setTargetAtTime(talking ? micLevel() : 0, actx.currentTime, 0.012);
    ms.mic(talking);
    renderTalk();
  }
  async function fillMics() {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const s = $('micSel'), html = '<option value="">The computer\'s usual microphone</option>' + list.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microphone ' + (i + 1))}</option>`).join('');
      if (sig.mics !== html) { sig.mics = html; s.innerHTML = html; }
      s.value = cfg.micId || '';
    } catch (e) { /* the list stays as it is */ }
  }
  async function applyPcSound() {
    audio();
    if (!cfg.pcSound) { if (pcStream) for (const t of pcStream.getTracks()) t.stop(); pcStream = null; return; }
    if (pcStream) return;
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });       // the main process answers this with the stage page and the computer's sound, never the screen
      for (const t of s.getVideoTracks()) t.stop();
      if (!s.getAudioTracks().length) throw new Error('no sound came with it');
      pcStream = s;
      actx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(pcGain);
    } catch (e) { pcStream = null; toast('The computer\'s sound could not be added here. The microphone still works.', 'bad'); }
  }
  /** the picture and the sound that go out, as one stream */
  async function ensureOut() {
    audio();
    if (actx.state === 'suspended') { try { await actx.resume(); } catch (e) { /* stays quiet */ } }
    await applyPcSound();
    if (!stageStream || !stageStream.getVideoTracks().length || stageStream.getVideoTracks()[0].readyState !== 'live') throw new Error('There is no picture of the stage yet.');
    if (!outStream || outStream.getVideoTracks()[0] !== stageStream.getVideoTracks()[0]) outStream = new MediaStream([stageStream.getVideoTracks()[0], dest.stream.getAudioTracks()[0]]);
    return outStream;
  }

  // ---------------------------------------------------------------- going live
  Whip.onState = (s, info) => {
    liveState = s;
    if (s === 'live') liveTries = 0;
    if (s === 'trouble' && liveWanted && !retryT) {          // the line dropped: wait a moment (it may come back by itself), then connect again
      retryT = setTimeout(async () => {
        retryT = 0;
        if (!liveWanted || Whip.state() === 'live') return;
        if (++liveTries > 6) { await endLive(); toast('The stream ended: the connection to Twitch could not be brought back.', 'bad'); return; }
        await ms.whipStop();
        connect(true);
      }, 5000 + liveTries * 4000);
    }
    if (info && s === 'failed') toast(info, 'bad');
    renderBar();
  };
  async function connect(again) {
    try { const out = await ensureOut(); await Whip.start(out, { kbps: cfg.quality === '1080' ? 4500 : 3000 }, (sdp) => ms.whipOffer(sdp)); }
    catch (e) {
      if (again && liveWanted) { Whip.onState('trouble', ''); return; }
      liveWanted = false; await ms.whipStop();
      toast('Could not go live. ' + ((e && e.message) || e), 'bad'); show('live');
    }
    renderBar();
  }
  async function endLive() { liveWanted = false; clearTimeout(retryT); retryT = 0; Whip.stop(); await ms.whipStop(); renderBar(); }
  async function liveButton() {
    if (liveWanted) { await endLive(); toast('The stream has ended.', 'good'); return; }
    if (!sure) {                                            // two clicks to go live: never by accident
      const r = await ms.liveReady();
      if (!r || !r.ok) { show('live'); toast((r && r.error) || 'Connect Twitch first.', 'bad'); return; }
      if (!Whip.supported()) { toast('This computer cannot make the kind of video Twitch takes (H.264).', 'bad'); return; }
      sure = true; clearTimeout(sureT); sureT = setTimeout(() => { sure = false; renderBar(); }, 6000); renderBar(); return;
    }
    sure = false; clearTimeout(sureT);
    liveWanted = true; liveTries = 0; renderBar();
    connect(false);
  }

  // ---------------------------------------------------------------- recording
  function recType() {
    for (const t of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm']) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* next */ } }
    return '';
  }
  async function recStart(seconds) {
    if (mr) return { ok: false, error: 'already recording' };
    const type = recType();
    if (!type) return { ok: false, error: 'This computer has no video format to record with.' };
    let out;
    try { out = await ensureOut(); } catch (e) { return { ok: false, error: e.message }; }
    const r = await ms.recStart({ ext: /mp4/.test(type) ? 'mp4' : 'webm' });
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'The video file could not be created.' };
    recChain = Promise.resolve();
    const m = mr = new MediaRecorder(out, { mimeType: type, videoBitsPerSecond: cfg.quality === '1080' ? 8e6 : 5e6, audioBitsPerSecond: 160000 });
    m.ondataavailable = (e) => { if (e.data && e.data.size) recChain = recChain.then(() => e.data.arrayBuffer()).then((b) => ms.recChunk(new Uint8Array(b))).catch(() => {}); };      // one after the other, in order
    m.onerror = () => recStop();
    m.start(2000);
    recInfo = { file: r.file, since: Date.now(), seconds, type };
    clearTimeout(recT); recT = setTimeout(() => recStop(true), seconds * 1000);
    render();
    return { ok: true, file: r.file };
  }
  function recStop(full) {
    if (!mr) return Promise.resolve({ ok: false });
    const m = mr; mr = null; clearTimeout(recT);
    return new Promise((resolve) => {
      m.onstop = async () => {
        await recChain;
        const r = await ms.recStop();
        lastRec = r && r.file ? r : lastRec; recInfo = null;
        if (r && r.ok) toast(`${full ? 'The recording is complete' : 'Recording saved'}: ${clock(r.seconds)}, ${megs(r.bytes)}. It is in your Videos folder, under MyStream.`, 'good');
        else toast('The recording could not be saved' + (r && r.error ? ': ' + r.error : '.'), 'bad');
        render();
        resolve(r || { ok: false });
      };
      try { m.stop(); } catch (e) { m.onstop(); }
    });
  }
  async function recButton() {
    if (mr) { await recStop(false); return; }
    const r = await recStart(cfg.recSeconds || 1800);
    if (!r.ok) toast(r.error, 'bad'); else toast(`Recording for ${span(cfg.recSeconds || 1800)}. It stops by itself; press the button again to stop sooner.`, 'good');
  }

  // ---------------------------------------------------------------- drawing the window
  function renderBar() {
    if (!V) return;
    const live = liveWanted, st1 = $('status'), go = $('goLive'), led = $('led');
    const since = V.live && V.live.since ? (Date.now() - V.live.since) / 1000 : 0;
    st1.className = 'pill' + (live && liveState === 'live' ? ' on' : live ? ' busy' : '');
    st1.textContent = !live ? 'OFF AIR' : liveState === 'live' ? `LIVE ${clock(since)}${Whip.kbps() ? '  ' + Whip.kbps() + ' kbps' : ''}` : liveState === 'trouble' ? 'CONNECTION LOST, TRYING AGAIN' : 'CONNECTING';
    go.textContent = live ? 'End stream' : sure ? 'Sure? Click again' : 'Go live';
    go.className = 'btn live' + (live ? ' on' : sure ? ' sure' : '');
    led.className = 'led' + (live && liveState === 'live' ? ' live' : mr ? ' rec' : '');
    const rp = $('recPill'), rb = $('recBtn');
    rp.hidden = !mr; rb.textContent = mr ? 'Stop recording' : 'Record'; rb.classList.toggle('on', !!mr);
    if (mr && recInfo) rp.textContent = `REC ${clock((Date.now() - recInfo.since) / 1000)} of ${clock(recInfo.seconds)}`;
  }
  function renderTalk() {
    const w = $('talkWrap');
    w.classList.toggle('talking', talking); w.classList.toggle('locked', locked);
    $('talk').setAttribute('aria-pressed', String(talking));
    $('talkWord').textContent = locked ? 'tap to close' : talking ? 'talking' : 'hold to talk';
    $('lock').textContent = locked ? 'open' : 'lock';
    $('talkHint').textContent = micNote || (locked ? 'The microphone stays open. Tap the button to close it.' : `Hold to talk. Slide up while holding to keep the microphone open.${cfg && cfg.talkKey ? ' From anywhere: ' + cfg.talkKey.replace(/\+/g, ' + ') + '.' : ''}`);
  }
  function switchHtml(on, attrs, disabled) { return `<button class="sw${on ? ' on' : ''}" ${attrs} role="switch" aria-checked="${!!on}"${disabled ? ' disabled' : ''}></button>`; }
  // The order: what lies over what on the stage. 1 is in front of everything. cfg.order lists the keys from the back to
  // the front ('trainer', 'fountain' and the games' ids); the number is counted from the front.
  const orderOf = (k) => { const o = cfg.order || [], i = o.indexOf(k); return i < 0 ? o.length : o.length - i; };
  const orderHtml = (k) => `<span class="ord" title="Where it lies in the picture. 1 is in front of everything; a higher number lies further back. Type a number or use the arrows."><button class="btn tiny" data-ord="up" data-key="${k}" title="Bring forward" aria-label="Bring forward">▲</button><input type="number" min="1" max="${(cfg.order || []).length}" value="${orderOf(k)}" data-ord="set" data-key="${k}" aria-label="Order, 1 is in front"><button class="btn tiny" data-ord="down" data-key="${k}" title="Send back" aria-label="Send back">▼</button></span>`;
  function moveOrder(key, pos) {
    const o = (cfg.order || []).slice(), i = o.indexOf(key), n = o.length;
    if (i < 0 || !isFinite(pos)) return;
    pos = Math.max(1, Math.min(n, Math.round(pos)));
    o.splice(i, 1); o.splice(n - pos, 0, key);
    cfg.order = o; set({ order: o });
  }
  function renderGames() {
    const b = `<div class="item${cfg.showTrainer ? ' on' : ''}">${switchHtml(cfg.showTrainer, 'data-flag="showTrainer"')}<span class="name" title="Your Screen Trainer Pokémon">Screen Trainer</span>${orderHtml('trainer')}<span class="state">${cfg.showTrainer ? 'on the stage: click them in the picture to play' : 'hidden from viewers; the game goes on'}</span></div>` +
      `<div class="item${cfg.fountain ? ' on' : ''}">${switchHtml(cfg.fountain, 'data-flag="fountain"')}<span class="name" title="The fountain in the middle, and round it the Poké Center, the pipe to the Box, the Day Care and the trade pads">The fountain and its places</span>${orderHtml('fountain')}</div>`;
    if (sig.builtin !== b) { sig.builtin = b; $('builtin').innerHTML = b; }
    const s = cfg.sources.map((x) => {
      const shown = V.attached[x.id], info = V.sources[x.id] || {};
      const away = cfg.tuck && x.on && shown && !x.desk;      // its own window is off the desktop (option "Keep games off my desktop")
      const state = !x.on ? 'switched off' : shown ? `showing${info.w ? ` (${info.w} × ${info.h})` : ''}${away ? ', only here' : ''}` : 'not open right now; it appears by itself when the game is started';
      return `<div class="item${x.on && shown ? ' on' : ''}" data-id="${x.id}">${switchHtml(x.on, 'data-act="toggle"')}<span class="name" title="${esc(x.title)}">${esc(x.title)}</span><button class="x" data-act="remove" title="Take it off the list">×</button>
        <span class="state">${state}</span>
        <span class="tools">background <select data-act="key">${Object.keys(KEY_NAMES).map((k) => `<option value="${k}"${x.key === k ? ' selected' : ''}>${k === 'auto' && info.key ? `find out (${info.key === 'none' ? 'kept' : info.key + ' removed'})` : KEY_NAMES[k] + (k === 'black' || k === 'white' ? ' removed' : '')}</option>`).join('')}</select> order ${orderHtml(x.id)} <button class="btn tiny mouse${x.mouse === 'show' ? ' on' : ''}" data-act="mouse" title="${x.mouse === 'show' ? 'Windows draws its mouse pointer into this game\'s picture. Press to take it out (your own pointer is on the stage instead).' : 'Windows\' mouse pointer is taken out of this game\'s picture; your own pointer is on the stage instead. Press to leave Windows\' pointer in.'}">mouse: ${x.mouse === 'show' ? 'shown' : 'hidden'}</button>${x.title !== 'My Field Dex' ? ` <span class="gvol" title="How loud this game is. It is the game's own slider in the Windows volume mixer: you hear it, and so do viewers when the computer's sound is sent along.">sound <input type="range" min="0" max="100" step="5" data-act="vol" value="${x.vol === null || x.vol === undefined ? 100 : x.vol}"> <b>${x.vol === null || x.vol === undefined ? 'as it is' : x.vol + ' %'}</b></span>` : ''}${cfg.tuck && x.on ? ` <button class="btn" data-act="desk" title="${x.desk ? 'Move its own window off the desktop again' : 'Bring its own window back to the desktop so you can use the game'}">${x.desk ? 'only here again' : 'on my desktop too'}</button>` : ''}</span></div>`;
    }).join('') || '<p class="small">No games on the stage yet. Pick them from the open windows below.</p>';
    if (sig.sources !== s) { sig.sources = s; $('sources').innerHTML = s; }
    const have = new Set(cfg.sources.map((x) => x.title));
    const w = wins.filter((x) => !have.has(x.title)).map((x, i) => x.steam
      ? `<div class="item steam"><span></span><span class="name">${esc(x.title)}</span><span></span><span class="state">A Steam window: never shown.</span></div>`
      : `<div class="item" data-win="${esc(x.title)}">${x.thumb ? `<img src="${x.thumb}" alt="">` : '<span></span>'}<span class="name" title="${esc(x.title)}">${esc(x.title)}</span><button class="btn tiny" data-act="add">show</button></div>`).join('') || `<p class="small">${winsBusy ? 'Looking…' : 'No other windows are open.'}</p>`;
    if (sig.wins !== w) { sig.wins = w; $('windows').innerHTML = w; }
  }
  function renderNotes() {
    const sw = V.colors.map((c) => `<button class="swatch c-${c}${c === noteColor ? ' on' : ''}" data-color="${c}" title="${c}"></button>`).join('');
    if (sig.sw !== sw) { sig.sw = sw; $('swatches').innerHTML = sw; }
    const n = cfg.notes.map((x) => `<div class="item notei${x.on ? ' on' : ''}" data-id="${x.id}">${switchHtml(x.on, 'data-act="toggle"')}<i class="c-${x.color}"></i><span class="name" title="${esc(x.text)}">${esc(x.text)}</span><button class="x" data-act="remove" title="Throw it away">×</button></div>`).join('');
    if (sig.notes !== n) { sig.notes = n; $('notes').innerHTML = n; }
    $('noteCount').textContent = `${cfg.notes.length} of 12`;
    $('noteAdd').disabled = cfg.notes.length >= 12;
  }
  const idle = (el) => document.activeElement !== el;
  function renderLive() {
    const t = V.twitch, box = $('twStatus');
    let cls = 'card', html = '';
    if (t.error) { cls += ' bad'; html = esc(t.error); }
    else if (t.connected && t.hasKey) { cls += ' good'; html = `Logged in as <b>${esc(t.name || t.login)}</b>. Ready to go live.`; }
    else if (t.connected) html = `Logged in as <b>${esc(t.name || t.login)}</b>, but Twitch has not given a stream key yet.`;
    else if (t.hasKey) { cls += ' good'; html = 'A stream key is saved. Ready to go live.'; }
    else html = 'Not connected to Twitch yet. Log in below (best), or paste your stream key.';
    if (!t.safe) html += '<br>This computer cannot encrypt the login, so it is kept only until MyStream closes.';
    if (sig.tw !== cls + html) { sig.tw = cls + html; box.className = cls; box.innerHTML = html; }
    // the stream's desk and the chat (only the booth shows them; nothing of it goes on the stage)
    const d = V.desk || {}, c = V.chat || {}, mins = d.since ? Math.max(0, Math.round((Date.now() - d.since) / 60000)) : 0;
    const line = !t.connected ? 'Log in with Twitch to see your viewers, set the category, add markers and write in chat.'
      : `${d.live ? `<b class="onair">LIVE</b> ${d.viewers} ${d.viewers === 1 ? 'viewer' : 'viewers'}, for ${mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min'}` : 'Not live right now'}${d.game ? ` · Category: <b>${esc(d.game)}</b>` : ''}`;
    if (sig.desk !== line) { sig.desk = line; $('deskLine').innerHTML = line; }
    for (const id of ['gameQ', 'deskMark', 'deskManager', 'deskPop']) $(id).disabled = !t.connected;
    const cs = c.state === 'on' ? (c.canSend ? 'connected' : 'reading only') : c.state === 'connecting' ? 'connecting…' : c.state === 'unavailable' ? 'not available here' : t.connected || c.channel ? 'not connected' : '';
    $('chatState').textContent = cs;
    $('chatIn').disabled = $('chatGo').disabled = !(c.state === 'on' && c.canSend);
    $('chatNote').textContent = c.state === 'on' && !c.canSend ? 'You can read chat here. To write, press “Log in again” below once: your login is from before chat was added.' : !t.connected ? 'Chat shows up here once you are logged in. It is for your eyes only and never on the stream.' : 'Chat is for your eyes only: it is never part of the picture viewers get.';
    if (idle($('clientId'))) $('clientId').value = t.clientId || '';
    if (idle($('title'))) $('title').value = cfg.title || '';
    if (idle($('server'))) $('server').value = t.server || '';
    $('twOut').hidden = !t.connected;
    $('twGo').textContent = t.connected ? 'Log in again' : 'Log in with Twitch';
    const code = $('twCode'), p = t.pending;
    const ch = p ? `Your code:<span class="big">${esc(p.code)}</span>Twitch opens in your browser. Check that it shows this code, then press Authorize there.<div class="row"><button class="btn go" id="twOpen">Open Twitch</button><button class="btn" id="twCancel">Cancel</button></div><span class="small">Waiting for you to approve…</span>` : '';
    if (sig.code !== ch) { sig.code = ch; code.innerHTML = ch; code.hidden = !p; }
  }
  function renderRecord() {
    // the slider counts through the allowed lengths (5 seconds ... 1 hour), not through minutes
    const L = (V && V.recLengths) || [1800], at = Math.max(0, L.indexOf(cfg.recSeconds)), el = $('recLen');
    if (+el.max !== L.length - 1) { el.min = 0; el.max = L.length - 1; el.step = 1; el.value = at; }
    if (idle(el)) el.value = at;
    const sec = L[U01(+el.value, L.length)] || cfg.recSeconds || 1800, rate = cfg.quality === '1080' ? 8.16 : 5.16, size = (sec * rate * 1e6) / 8;
    $('recLenText').textContent = `${span(sec)} (about ${size < 1e6 ? '1 MB or less' : megs(size)})`;
    $('recGo').textContent = mr ? 'Stop recording' : 'Start recording';
    $('recGo').classList.toggle('on', !!mr);
    let html = '';
    if (mr && recInfo) html = `Recording: <b>${clock((Date.now() - recInfo.since) / 1000)}</b> of ${clock(recInfo.seconds)}${V.rec ? ', ' + megs(V.rec.bytes) + ' so far' : ''}.<br>It stops by itself and is saved in your Videos folder, under MyStream.`;
    else if (lastRec && lastRec.file) html = `Last recording: ${clock(lastRec.seconds)}, ${megs(lastRec.bytes)}<br>${esc(lastRec.file)}<div class="row"><button class="btn tiny" id="recShow">show the file</button></div>`;
    else html = 'Videos are saved in your Videos folder, under MyStream.';
    if (sig.rec !== html) { sig.rec = html; $('recInfo').innerHTML = html; }
  }
  function renderOptions() {
    if (idle($('quality'))) $('quality').value = cfg.quality;
    $('micBadge').checked = cfg.micBadge; $('tuck').checked = !!cfg.tuck; $('pcSound').checked = cfg.pcSound;
    for (const k of ['pcVol', 'micVol']) { if (idle($(k))) $(k).value = cfg[k] === undefined ? 100 : cfg[k]; $(k + 'Text').textContent = $(k).value + ' %'; }
    if (idle($('talkKey'))) $('talkKey').value = cfg.talkKey;
    if (idle($('micSel'))) $('micSel').value = cfg.micId || '';
    $('about').textContent = `Screen Trainer ${V.version}. The stage is ${V.stage.w} × ${V.stage.h} and is sent as ${cfg.quality}p. Viewers see only the stage: never this window, the desktop or any other program.`;
  }
  const PTR_KEYS = ['poke', 'great', 'ultra', 'master', 'star', 'badge', 'crown', 'bolt'];      // the order of CURSORS in online.js
  function renderPointer() {
    const p = cfg.pointer || { show: true, size: 1.5, edge: true };
    $('ptrShow').checked = p.show !== false; $('ptrEdge').checked = p.edge !== false;
    if (idle($('ptrSize'))) $('ptrSize').value = p.size || 1.5;
    $('ptrSizeText').textContent = `${Math.round(+$('ptrSize').value * 100)} %`;
    const P = V.pointers, list = P && Array.isArray(P.cursors) ? P.cursors : [];
    const won = list.filter((c) => c.won).length;
    $('ptrCount').textContent = list.length ? `${won} of ${list.length} won` : '';
    const order = list.slice().sort((x, y) => (y.won ? 1 : 0) - (x.won ? 1 : 0) || x.i - y.i);      // (0.9.7: the won ones first, then what is left to win)
    const html = list.length ? order.map((c) => `<button class="cur${c.i === P.cursor ? ' on' : ''}${c.won ? '' : ' locked'}" data-cur="${c.i}"${c.won ? '' : ' disabled'} title="${c.won ? 'Use this pointer' : 'To win it: ' + esc(c.need)}"><span class="vp" data-k="${esc(c.k)}" style="--a:${c.a};--b:${c.b}"><i></i></span><b>${esc(c.n)}</b>${c.won ? (c.i === P.cursor ? 'in use' : 'won') : esc(c.need)}</button>`).join('') : '<p class="small">The pointers are not available right now.</p>';
    if (sig.ptr !== html) { sig.ptr = html; $('ptrList').innerHTML = html; }
    const n = (cfg.sources || []).filter((s) => s.on).length, w = V.pointerWatch || {};
    $('ptrNote').textContent = !n ? 'No games are on the stage yet.' : w.helper ? `Watching ${w.windows} game window${w.windows === 1 ? '' : 's'} for the mouse.` : 'Looking for the games\' windows…';
  }
  function renderMewtwo() {
    const m = V.mewtwo, fresh = m && Date.now() - m.at < 15000;
    $('mewtwo').hidden = !fresh;
    if (fresh) $('mewtwoText').textContent = m.text;
  }
  function render() {
    if (!V) return;
    renderBar(); renderTalk(); renderMewtwo();
    if (tab === 'games') renderGames(); else if (tab === 'notes') renderNotes(); else if (tab === 'live') renderLive(); else if (tab === 'record') renderRecord(); else if (tab === 'pointer') renderPointer(); else renderOptions();
    $('hint').textContent = mode === 'play' ? 'Viewers see exactly this picture and nothing else. Click your Pokémon here to play.' : 'Drag games and notes to where you want them. Drag a corner, or turn the mouse wheel, to change a game\'s size.';
    renderEdit();
  }
  function show(name) {
    tab = name;
    for (const k of document.querySelectorAll('#tabs .key')) k.classList.toggle('on', k.dataset.tab === name);
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== 'pane-' + name;
    if (name === 'games') lookForWindows();
    if (name === 'options') fillMics();
    render();
  }
  async function lookForWindows() {
    if (winsBusy) return;
    winsBusy = true;
    try { wins = (await ms.windows()) || []; } catch (e) { wins = []; }
    winsBusy = false;
    if (tab === 'games') renderGames();
  }

  // ---------------------------------------------------------------- "Move things": frames over the picture
  const handles = new Map();
  const NOTE = { w: 232 / 1280, pad: 12 / 720 };
  function noteRect(n) { const r = V.noteRects[n.id]; const w = r ? r.w : NOTE.w, h = r ? r.h : 0.2; return { x: n.x * (1 - w), y: NOTE.pad + n.y * (1 - 2 * NOTE.pad - Math.max(60 / 720, h)), w, h }; }
  function renderEdit() {
    const box = $('edit');
    box.hidden = mode !== 'arrange';
    if (box.hidden) return;
    const want = new Map();
    for (const s of cfg.sources) if (s.on) want.set(s.id, { kind: 'src', item: s, label: s.title });
    for (const n of cfg.notes) if (n.on) want.set(n.id, { kind: 'note', item: n, label: 'note' });
    for (const [id, el] of handles) if (!want.has(id)) { el.remove(); handles.delete(id); }
    for (const [id, w] of want) {
      let el = handles.get(id);
      if (!el) { el = document.createElement('div'); el.dataset.id = id; el.innerHTML = '<b></b><i class="grip"></i>'; handles.set(id, el); box.appendChild(el); }
      el.className = `h ${w.kind}${sel === id ? ' sel' : ''}${w.kind === 'src' && !V.attached[id] ? ' off' : ''}`;
      el.firstChild.textContent = w.label;
      const r = w.kind === 'src' ? { x: w.item.x, y: w.item.y, w: w.item.w, h: (w.item.w * 16) / 9 / (w.item.ar || 16 / 9) } : noteRect(w.item);
      Object.assign(el.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    }
  }
  function editDown(e) {
    const el = e.target.closest('.h');
    if (!el) { sel = null; renderEdit(); return; }
    const id = el.dataset.id, src = cfg.sources.find((s) => s.id === id), note = cfg.notes.find((n) => n.id === id), item = src || note;
    if (!item) return;
    sel = id;
    const box = $('edit').getBoundingClientRect();
    drag = { id, item, kind: src ? 'src' : 'note', resize: !!src && e.target.classList.contains('grip'), sx: e.clientX, sy: e.clientY, bw: box.width, bh: box.height, o: Object.assign({}, item), r0: src ? null : noteRect(note) };
    el.setPointerCapture(e.pointerId);
    renderEdit(); e.preventDefault();
  }
  function editMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / drag.bw, dy = (e.clientY - drag.sy) / drag.bh, it = drag.item;
    if (drag.kind === 'src') {
      if (drag.resize) it.w = clamp(drag.o.w + dx, 0.03, 2); else { it.x = clamp(drag.o.x + dx, -0.9, 1.4); it.y = clamp(drag.o.y + dy, -0.9, 1.4); }
      it.placed = true;
    } else {
      const r = drag.r0;
      it.x = clamp((r.x + dx) / Math.max(0.05, 1 - r.w), 0, 1); it.y = clamp((r.y + dy - NOTE.pad) / Math.max(0.05, 1 - 2 * NOTE.pad - Math.max(60 / 720, r.h)), 0, 1);
    }
    renderEdit(); pushLayout(false);
  }
  function editUp() { if (!drag) return; drag = null; pushLayout(true); }
  function editWheel(e) {
    const el = e.target.closest('.h.src');
    if (!el) return;
    const s = cfg.sources.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const k = e.deltaY < 0 ? 1.05 : 1 / 1.05, w = clamp(s.w * k, 0.03, 2), h0 = (s.w * 16) / 9 / s.ar, h1 = (w * 16) / 9 / s.ar;
    s.x -= (w - s.w) / 2; s.y -= (h1 - h0) / 2; s.w = w; s.placed = true; sel = s.id;
    renderEdit(); pushLayout(false); e.preventDefault();
  }

  // ---------------------------------------------------------------- "Play": the pointer goes to the stage
  function wirePlay() {
    const view = $('view');
    let lastMove = 0, down = false;
    const at = (e) => { const r = view.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * V.stage.w, y: ((e.clientY - r.top) / r.height) * V.stage.h }; };
    view.addEventListener('pointerdown', (e) => { if (mode !== 'play' || e.button === 1) return; down = true; view.setPointerCapture(e.pointerId); ms.input(Object.assign({ t: 'down', b: e.button }, at(e))); e.preventDefault(); });
    view.addEventListener('pointermove', (e) => { if (mode !== 'play') return; const now = performance.now(); if (now - lastMove < 28) return; lastMove = now; ms.input(Object.assign({ t: 'move' }, at(e))); });
    const up = (e) => { if (mode !== 'play' || !down) return; down = false; ms.input(Object.assign({ t: 'up', b: e.button }, at(e))); };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('pointerleave', () => { if (mode === 'play' && !down) ms.input({ t: 'move', x: -30, y: -30 }); });
    view.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- the talk button
  function wireTalk() {
    const btn = $('talk'), wrap = $('talkWrap');
    let held = false, startY = 0, closing = false;
    const slide = (v) => wrap.style.setProperty('--slide', String(v));
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = true; startY = e.clientY; btn.setPointerCapture(e.pointerId);
      if (locked) closing = true; else setTalking(true);    // a tap on an open microphone closes it (on release)
      e.preventDefault();
    });
    btn.addEventListener('pointermove', (e) => {
      if (!held || closing || locked) return;
      const up = clamp((startY - e.clientY) / 54, 0, 1);
      slide(up);
      if (up >= 1) { locked = true; slide(0); renderTalk(); }  // slid up far enough: it stays open
    });
    const release = () => {
      if (!held) return;
      held = false; slide(0);
      if (closing) { closing = false; locked = false; setTalking(false); }
      else if (!locked) setTalking(false);
      renderTalk();
    };
    btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // the space bar is hold-to-talk while this window is in front (not while typing)
    const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !typing() && !locked) { setTalking(true); e.preventDefault(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !typing() && !locked) { setTalking(false); e.preventDefault(); } });
    window.addEventListener('blur', () => { if (!locked && talking) setTalking(false); });
    ms.onTalkKey(() => { locked = !locked; setTalking(locked); renderTalk(); });       // the key from anywhere opens and closes it
    const data = new Uint8Array(512);
    setInterval(() => {
      let level = 0;
      if (analyser && talking) { analyser.getByteTimeDomainData(data); let peak = 0; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128)); level = Math.min(1, (peak / 128) * 1.6); }
      $('meter').firstChild.style.width = Math.round(level * 100) + '%';
    }, 70);
  }

  // ---------------------------------------------------------------- everything clickable on the right
  function wireSide() {
    $('tabs').addEventListener('click', (e) => { const k = e.target.closest('.key'); if (k) show(k.dataset.tab); });
    $('mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.mode; for (const x of $('mode').children) x.classList.toggle('on', x === b); if (mode === 'play') sel = null; render(); });
    $('goLive').addEventListener('click', liveButton);
    $('recBtn').addEventListener('click', recButton);
    $('recGo').addEventListener('click', recButton);
    $('recFolder').addEventListener('click', () => ms.recShow(''));
    $('pane-record').addEventListener('click', (e) => { if (e.target.id === 'recShow' && lastRec) ms.recShow(lastRec.file); });
    $('recLen').addEventListener('input', renderRecord);
    $('recLen').addEventListener('change', () => { const L = (V && V.recLengths) || [1800]; set({ recSeconds: L[U01(+$('recLen').value, L.length)] }); });
    $('refresh').addEventListener('click', lookForWindows);
    $('builtin').addEventListener('click', (e) => { const b = e.target.closest('[data-flag]'); if (b) set({ [b.dataset.flag]: !cfg[b.dataset.flag] }); });
    $('sources').addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]'), act = e.target.dataset.act; if (!row || !act) return;
      const s = cfg.sources.find((x) => x.id === row.dataset.id); if (!s) return;
      if (act === 'toggle') s.on = !s.on; else if (act === 'desk') s.desk = !s.desk; else if (act === 'mouse') s.mouse = s.mouse === 'show' ? 'hide' : 'show'; else if (act === 'remove') cfg.sources = cfg.sources.filter((x) => x !== s); else return;
      set({ sources: cfg.sources }).then(lookForWindows);
    });
    for (const box of [$('builtin'), $('sources')]) {
      box.addEventListener('click', (e) => { const b = e.target.closest('button[data-ord]'); if (!b) return; e.stopPropagation(); moveOrder(b.dataset.key, orderOf(b.dataset.key) + (b.dataset.ord === 'up' ? -1 : 1)); });
      box.addEventListener('change', (e) => { if (e.target.dataset.ord === 'set') moveOrder(e.target.dataset.key, +e.target.value); });
    }
    $('sources').addEventListener('change', (e) => {
      const row = e.target.closest('[data-id]'), act = e.target.dataset.act; if (!row) return;
      const s = cfg.sources.find((x) => x.id === row.dataset.id); if (!s) return;
      if (act === 'vol') {      // (1.0) a game's volume: set in the Windows mixer at once, and kept for next time
        const v = +e.target.value; s.vol = v;
        ms.gameVolume(s.id, v).then((r) => { if (r && !r.ok && r.error) toast(`The volume is kept for this game, but Windows did not take it now: ${r.error}`, 'bad'); else if (r && r.ok && r.volume < 0) toast('Kept. The game is not playing any sound yet; its volume is set when it does.', ''); });
        return;
      }
      if (act === 'key') s.key = e.target.value; else return;
      set({ sources: cfg.sources });
    });
    $('sources').addEventListener('input', (e) => { if (e.target.dataset.act === 'vol') { const b = e.target.parentNode.querySelector('b'); if (b) b.textContent = e.target.value + ' %'; } });
    $('windows').addEventListener('click', (e) => {
      const row = e.target.closest('[data-win]'); if (!row || e.target.dataset.act !== 'add') return;
      if (cfg.sources.length >= 12) { toast('Twelve games is the most the stage holds.', 'bad'); return; }
      cfg.sources.push({ title: row.dataset.win, on: true, placed: false });
      set({ sources: cfg.sources });
    });
    $('swatches').addEventListener('click', (e) => { const c = e.target.dataset.color; if (c) { noteColor = c; sig.sw = ''; renderNotes(); } });
    $('noteAdd').addEventListener('click', () => {
      const text = $('noteText').value.trim(); if (!text) { $('noteText').focus(); return; }
      cfg.notes.push({ text, color: noteColor, x: 0.06 + Math.random() * 0.8, y: 0.04 + Math.random() * 0.35, rot: Math.round(Math.random() * 10 - 5), on: true });
      $('noteText').value = '';
      set({ notes: cfg.notes });
    });
    $('notes').addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]'), act = e.target.dataset.act; if (!row || !act) return;
      const n = cfg.notes.find((x) => x.id === row.dataset.id); if (!n) return;
      if (act === 'toggle') n.on = !n.on; else if (act === 'remove') cfg.notes = cfg.notes.filter((x) => x !== n);
      set({ notes: cfg.notes });
    });
    // Twitch
    $('title').addEventListener('change', () => set({ title: $('title').value }));
    $('clientId').addEventListener('change', async () => take(await ms.twClient($('clientId').value)));
    $('twGo').addEventListener('click', async () => {
      take(await ms.twClient($('clientId').value));
      const r = await ms.twLogin();
      if (!r || !r.ok) toast((r && r.error) || 'The login could not be started.', 'bad'); else ms.twOpen();
      take(await ms.view());
    });
    $('twOut').addEventListener('click', async () => take(await ms.twLogout()));
    $('twCode').addEventListener('click', async (e) => { if (e.target.id === 'twOpen') ms.twOpen(); else if (e.target.id === 'twCancel') take(await ms.twCancel()); });
    $('keySave').addEventListener('click', async () => { const k = $('streamKey').value.trim(); if (!k) return; take(await ms.twKey(k)); $('streamKey').value = ''; if (!V.twitch.error) toast('The stream key is saved.', 'good'); });
    $('keyClear').addEventListener('click', async () => { take(await ms.twKey('')); $('streamKey').value = ''; });
    $('server').addEventListener('change', async () => take(await ms.twServer($('server').value)));
    // options
    $('quality').addEventListener('change', async () => { await set({ quality: $('quality').value }); if (liveWanted || mr) toast('The new quality is used from the next stream or recording.'); else startPreview(); });
    $('micSel').addEventListener('change', async () => { await set({ micId: $('micSel').value }); closeMic(); if (talking) openMic(); });
    $('micBadge').addEventListener('change', () => set({ micBadge: $('micBadge').checked }));
    // ---- Twitch chat and the stream's desk
    const log = $('chatLog');
    const addChat = (l) => {
      if (!l) return;
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40, row = document.createElement('div');
      row.className = 'cl' + (l.sys ? ' sys' : '') + (l.me ? ' me' : '');
      if (!l.sys) { const who = document.createElement('b'); who.textContent = l.user + (l.mod ? ' ⚔' : ''); if (l.color) who.style.color = l.color; row.appendChild(who); }
      const text = document.createElement('span'); text.textContent = l.text; row.appendChild(text);      // (as text, never as HTML: chat is written by strangers)
      log.appendChild(row);
      while (log.children.length > 200) log.firstChild.remove();
      if (stick) log.scrollTop = log.scrollHeight;
    };
    st.ms.onChat(addChat);
    st.ms.chatLines().then((lines) => { for (const l of lines || []) addChat(l); }).catch(() => {});
    const sayIt = () => { const v = $('chatIn').value.trim(); if (!v) return; st.ms.chatSend(v).then((ok) => { if (ok) $('chatIn').value = ''; }); };
    $('chatGo').addEventListener('click', sayIt);
    $('chatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sayIt(); } e.stopPropagation(); });
    let gameT = 0;
    $('gameQ').addEventListener('input', () => { clearTimeout(gameT); gameT = setTimeout(async () => {
      const hits = await st.ms.deskSearch($('gameQ').value).catch(() => []), box = $('gameHits');
      box.textContent = '';
      for (const g of hits || []) { const b = document.createElement('button'); b.className = 'btn tiny'; b.textContent = g.name; b.addEventListener('click', async () => { const ok = await st.ms.deskGame(g.id); $('deskNote').textContent = ok ? `Category set to ${g.name}.` : 'Twitch did not take the category.'; box.textContent = ''; $('gameQ').value = ''; }); box.appendChild(b); }
    }, 350); });
    $('deskMark').addEventListener('click', async () => { const r = await st.ms.deskMarker(''); $('deskNote').textContent = r && r.ok ? 'Marker added.' : (r && r.why) || 'No marker was added.'; });
    $('deskManager').addEventListener('click', () => st.ms.deskOpen('manager'));
    $('deskPop').addEventListener('click', () => st.ms.deskOpen('chat'));
    $('tuck').addEventListener('change', () => set({ tuck: $('tuck').checked }));
    // the owner's pointer (0.9.4)
    const ptr = (patch) => set({ pointer: Object.assign({}, cfg.pointer, patch) });
    $('ptrShow').addEventListener('change', () => ptr({ show: $('ptrShow').checked }));
    $('ptrEdge').addEventListener('change', () => ptr({ edge: $('ptrEdge').checked }));
    $('ptrSize').addEventListener('input', () => { $('ptrSizeText').textContent = `${Math.round(+$('ptrSize').value * 100)} %`; });
    $('ptrSize').addEventListener('change', () => ptr({ size: +$('ptrSize').value }));
    $('ptrList').addEventListener('click', async (e) => { const b = e.target.closest('[data-cur]'); if (!b || b.disabled) return; const v = await ms.cursor(+b.dataset.cur); if (v) take(v); });
    $('pcSound').addEventListener('change', async () => { await set({ pcSound: $('pcSound').checked }); applyPcSound(); });
    for (const k of ['pcVol', 'micVol']) {      // (1.0) the mix: heard at once while sliding, saved when let go
      $(k).addEventListener('input', () => { $(k + 'Text').textContent = $(k).value + ' %'; cfg[k] = +$(k).value; applyMix(); });
      $(k).addEventListener('change', () => set({ [k]: +$(k).value }).then(applyMix));
    }
    $('talkKey').addEventListener('change', () => set({ talkKey: $('talkKey').value.trim() }));
    $('closeAll').addEventListener('click', () => { if (liveWanted || mr) { toast('End the stream and the recording first.', 'bad'); return; } ms.close(); });
    const edit = $('edit');
    edit.addEventListener('pointerdown', editDown); edit.addEventListener('pointermove', editMove); edit.addEventListener('pointerup', editUp); edit.addEventListener('pointercancel', editUp);
    edit.addEventListener('wheel', editWheel, { passive: false });
  }

  async function init() {
    wireSide(); wirePlay(); wireTalk(); countFrames();
    take(await ms.view());
    ms.onView((v) => take(v));
    ms.onRecError((text) => { toast(text, 'bad'); recStop(false); });
    show('games');
    await startPreview();
    setInterval(() => { renderBar(); renderMewtwo(); if (tab === 'record') renderRecord(); }, 1000);
    setInterval(() => { if (tab === 'games' && document.visibilityState === 'visible') lookForWindows(); }, 6000);
    window.addEventListener('beforeunload', () => { try { Whip.stop(); } catch (e) { /* closing anyway */ } });
    ready = true;
  }
  init();

  return {
    ready: () => ready,
    /** for the self-check */
    report() { const pv = $('pv'); return { video: [pv.videoWidth, pv.videoHeight], frames: pvFrames, recType: recType(), h264: Whip.supported(), live: liveState, mode, tab, talking, locked, mic: micStream ? 'open' : 'closed' }; },
    async testRecord(seconds) { const r = await recStart(seconds + 600); if (!r.ok) return r; await new Promise((res) => setTimeout(res, seconds * 1000)); return Object.assign({ type: recType() }, await recStop(false)); },
    _test: { setTalking, show, recStart, recStop, liveButton, endLive, state: () => ({ liveWanted, liveState, talking, locked, rec: !!mr, sure, toast: lastToast }) },
  };
})();
