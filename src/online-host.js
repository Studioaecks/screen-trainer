// Screen Trainer — online visiting, the host's end of the connections (MyStream's booth page, 0.8).
//
// The booth already holds the picture of the stage (booth.js). A visitor who was let in (online.js in the main process
// decides that) gets that picture over a direct connection, and sends back where its pointer is and what it clicks.
// This file only carries: what a visitor sends is handed to the main process as it comes, which checks every value
// before anything reaches the game. No sound is sent, and never the microphone.
//
// OnlineHost.accept({ vid, slot, sdp }) -> the answer, or null     OnlineHost.send(message, vid or null)     OnlineHost.drop(vid)
'use strict';

const OnlineHost = (() => {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const peers = new Map();                       // vid -> { pc, ch, sender, open }
  const tell = (m) => { try { window.st.ov.host(m); } catch (e) { /* the window is closing */ } };
  const track = () => (typeof window.boothStageTrack === 'function' ? window.boothStageTrack() : null);
  const gathered = (pc, ms) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
  function drop(vid) {
    const p = peers.get(vid);
    if (!p) return;
    peers.delete(vid);
    try { if (p.ch) { p.ch.onclose = null; p.ch.close(); } } catch (e) { /* closed */ }
    try { p.pc.onconnectionstatechange = null; p.pc.close(); } catch (e) { /* closed */ }
  }
  function gone(vid) { if (!peers.has(vid)) return; drop(vid); tell({ t: 'closed', vid }); }
  async function accept(q) {
    const video = track();
    if (!video || !q || typeof q.sdp !== 'string' || peers.size >= 3) return null;
    const pc = new RTCPeerConnection({ iceServers: Array.isArray(q.ice) && q.ice.length ? q.ice : ICE }), p = { pc, ch: null, sender: null, open: false };
    peers.set(q.vid, p);
    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      if (ch.label !== 'st' || p.ch) { try { ch.close(); } catch (e) { /* closed */ } return; }
      p.ch = ch;
      ch.onopen = () => { if (p.open) return; p.open = true; tell({ t: 'open', vid: q.vid }); };
      ch.onclose = () => gone(q.vid);
      ch.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data.length > 1600) return;      // (0.9.7: a team of six is longer than a click; online.js checks every value)
        let m = null;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        tell({ t: 'in', vid: q.vid, m });
      };
      if (ch.readyState === 'open') ch.onopen();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') gone(q.vid);
      else if (s === 'disconnected') setTimeout(() => { if (peers.get(q.vid) === p && pc.connectionState !== 'connected') gone(q.vid); }, 7000);
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: q.sdp });
      p.sender = pc.addTrack(video, new MediaStream([video]));
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc, 2500);
      try { const par = p.sender.getParameters(); if (!par.encodings || !par.encodings.length) par.encodings = [{}]; par.encodings[0].maxBitrate = 1800000; par.encodings[0].maxFramerate = 24; await p.sender.setParameters(par); } catch (e) { /* the browser's own choice then */ }
      return pc.localDescription.sdp;
    } catch (e) { drop(q.vid); return null; }
  }
  function send(m, only) {
    const text = JSON.stringify(m);
    for (const [vid, p] of peers) if ((!only || only === vid) && p.open && p.ch && p.ch.readyState === 'open') { try { p.ch.send(text); } catch (e) { /* it is going */ } }
    return true;
  }
  // the main process is told whether there is a picture to show; when the stage page starts again the visitors get the new picture
  let had = null;
  setInterval(() => {
    const t = track();
    if (!!t !== !!had) tell({ t: 'ready', on: !!t });
    if (t && had && t !== had) for (const p of peers.values()) { try { if (p.sender) p.sender.replaceTrack(t); } catch (e) { /* it will leave by itself */ } }
    had = t;
  }, 700);
  window.addEventListener('beforeunload', () => { for (const vid of [...peers.keys()]) drop(vid); });
  return { accept, send, drop, count: () => peers.size };
})();
window.OnlineHost = OnlineHost;
