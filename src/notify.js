// Screen Trainer — notification cards: short, readable announcements with a picture (a catch, a shiny,
// an item, a badge ...). They stack at the top of the overlay, never take clicks and remove themselves.
// Floating battle text stays in fx.js; this is only for news worth reading.
'use strict';

const Notify = (() => {
  const MAX = 4, queue = [], live = [];
  let host = null;
  const TONES = { gold: '#ffcb47', shiny: '#ffe14d', alert: '#ff7a5c', item: '#6ad0ff', good: '#7be08a', info: '#c9d4ea', rare: '#c9a0ff' };

  function init(el) { host = el; }

  /** show({ title, text, icon, tone, dur, pixel }) — icon is an image URL; pixel keeps small sprites crisp */
  function show(o) {
    if (!host || !o || !o.title) return;
    const same = live.find((c) => c.title === o.title && c.text === (o.text || '') && c.age < 2.5 && !c.out);
    if (same) { same.n++; same.count.textContent = '×' + same.n; same.count.style.display = 'inline-block'; same.age = Math.min(same.age, 0.6); return; }
    if (queue.length > 12) queue.shift();
    queue.push(o);
  }
  function mount(o) {
    const el = document.createElement('div'), body = document.createElement('div'), title = document.createElement('div'), count = document.createElement('span');
    el.className = 'toast in'; el.style.setProperty && el.style.setProperty('--tone', TONES[o.tone] || TONES.info);
    el.style.borderLeftColor = TONES[o.tone] || TONES.info;
    if (o.icon) { const img = new Image(); img.className = 'ticon' + (o.pixel === false ? ' smooth' : ''); img.draggable = false; img.onerror = () => img.remove(); img.src = o.icon; el.appendChild(img); }
    body.className = 'tbody'; title.className = 'ttitle'; title.textContent = o.title; count.className = 'tcount'; count.style.display = 'none'; title.appendChild(count); body.appendChild(title);
    if (o.text) { const t = document.createElement('div'); t.className = 'ttext'; t.textContent = o.text; body.appendChild(t); }
    el.appendChild(body);
    host.appendChild(el);
    live.push({ el, count, title: o.title, text: o.text || '', age: 0, dur: o.dur || 3.6, n: 1, out: false });
  }
  /** call every frame with the frame time */
  function update(dt) {
    while (queue.length && live.filter((c) => !c.out).length < MAX) mount(queue.shift());
    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i];
      c.age += dt;
      if (c.age > 0.05 && !c.shown) { c.shown = true; c.el.className = 'toast'; }
      if (!c.out && c.age >= c.dur) { c.out = true; c.el.className = 'toast out'; c.age = 0; }
      else if (c.out && c.age >= 0.35) { c.el.remove(); live.splice(i, 1); }
    }
  }
  function clear() { queue.length = 0; for (const c of live) c.el.remove(); live.length = 0; }
  const busy = () => queue.length + live.length;
  return { init, show, update, clear, busy };
})();
