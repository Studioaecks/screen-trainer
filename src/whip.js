// MyStream — sending the stage to Twitch (booth page). The picture goes out the way a browser sends video: WebRTC,
// started with one HTTP request ("WHIP"). This file builds the connection and the offer; the main process posts the
// offer together with the stream key (mystream.js, whipOffer), so the key never comes into this page.
//
// Whip.start(stream, { kbps }, post) -> resolves when Twitch has answered; Whip.stop(); Whip.onState = (state, info) => {}
// states: 'off' | 'connecting' | 'live' | 'trouble' (the line dropped; booth.js tries again) | 'failed'
'use strict';

const Whip = (() => {
  let pc = null, state = 'off', statsT = 0, lastBytes = 0, lastAt = 0, kbps = 0;
  const api = { start, stop, onState: null, state: () => state, kbps: () => kbps, supported };
  const set = (s, info) => { if (s === state && !info) return; state = s; if (api.onState) api.onState(s, info || ''); };

  /** Twitch takes H.264 video. Does this computer's browser engine offer it? */
  function supported() {
    try { return RTCRtpSender.getCapabilities('video').codecs.some((c) => /h264/i.test(c.mimeType)); } catch (e) { return false; }
  }
  function preferH264(transceiver) {
    const all = RTCRtpSender.getCapabilities('video').codecs;
    const rank = (c) => { const f = c.sdpFmtpLine || ''; return (/packetization-mode=1/.test(f) ? 0 : 4) + (/profile-level-id=42e0/i.test(f) ? 0 : /profile-level-id=4d/i.test(f) ? 1 : /profile-level-id=42/i.test(f) ? 2 : 3); };
    const h264 = all.filter((c) => /h264/i.test(c.mimeType)).sort((a, b) => rank(a) - rank(b));
    if (!h264.length) throw new Error('This computer cannot make the kind of video Twitch takes (H.264).');
    transceiver.setCodecPreferences([...h264, ...all.filter((c) => /rtx|red|ulpfec|flexfec/i.test(c.mimeType))]);
  }
  const iceDone = (p, ms) => new Promise((res) => {
    if (p.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });

  async function start(stream, opt, post) {
    stop();
    set('connecting');
    const p = pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
    try {
      const v = stream.getVideoTracks()[0], a = stream.getAudioTracks()[0];
      if (!v) throw new Error('There is no picture of the stage to send.');
      try { v.contentHint = 'detail'; } catch (e) { /* a hint only */ }
      const vt = p.addTransceiver(v, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: (opt.kbps || 3000) * 1000, maxFramerate: 30 }] });
      preferH264(vt);
      if (a) p.addTransceiver(a, { direction: 'sendonly', streams: [stream] });
      await p.setLocalDescription(await p.createOffer());
      await iceDone(p, 2500);
      if (pc !== p) return false;
      const res = await post(p.localDescription.sdp);
      if (pc !== p) return false;
      if (!res || !res.ok) throw new Error((res && res.error) || 'Twitch did not answer.');
      await p.setRemoteDescription({ type: 'answer', sdp: res.answer });
      try { const prm = vt.sender.getParameters(); prm.degradationPreference = 'maintain-resolution'; await vt.sender.setParameters(prm); } catch (e) { /* keeps the default */ }
      p.addEventListener('connectionstatechange', () => {
        if (pc !== p) return;
        const s = p.connectionState;
        if (s === 'connected') set('live'); else if (s === 'disconnected') set('trouble', 'The connection is shaky.'); else if (s === 'failed' || s === 'closed') set('trouble', 'The connection to Twitch was lost.');
      });
      if (p.connectionState === 'connected') set('live');
      clearInterval(statsT); lastBytes = 0; lastAt = 0;
      statsT = setInterval(async () => {
        if (pc !== p) return;
        try {
          let bytes = 0;
          (await p.getStats()).forEach((r) => { if (r.type === 'outbound-rtp') bytes += r.bytesSent || 0; });
          const now = performance.now();
          if (lastAt) kbps = Math.max(0, Math.round(((bytes - lastBytes) * 8) / (now - lastAt)));
          lastBytes = bytes; lastAt = now;
        } catch (e) { /* no numbers this time */ }
      }, 2000);
      return true;
    } catch (e) {
      if (pc === p) { stop(); set('failed', String((e && e.message) || e)); }
      throw e;
    }
  }
  function stop() {
    clearInterval(statsT); kbps = 0;
    if (pc) { const p = pc; pc = null; try { p.close(); } catch (e) { /* already closed */ } }
    set('off');
  }
  return api;
})();
