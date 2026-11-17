// Screen Trainer — the Unown Notepad's page (notepad.html, 0.9.8, owner's list 11-16 update 17).
//
// A classic notepad. What is typed goes into a see-through text box (it keeps the caret, the selection, undo, cut and
// paste exactly as Windows does them) and appears under it in Living Unown (src/unown.js): each letter hops in to where
// it was typed and loiters there. "Read plainly" (Ctrl+R) shows the plain letters for proofreading.
// Notes are saved as .unown files where the owner chooses (main process: stfiles.js seals them; this page never sees a
// path). A note can be locked with a word; without it nobody can read the file, not even Screen Trainer.
'use strict';

(() => {
  const st = window.st, np = st && st.np, $ = (id) => document.getElementById(id);
  const ta = $('text'), cv = $('unown'), page = $('page'), desk = $('desk'), sheet = $('sheet'), land = $('land');
  let name = '', dirty = false, word = '', wordMode = '', fs = 20, calm = 1, living = null;
  // 0.9.8.1: the page has a fixed size, as in a word processor: COLS letters wide, growing LINES lines at a time. A line
  // that is full carries on in the next (the text box and Unown.layout break at the same place: anywhere).
  const COLS = 64, LINES = 28;
  let M = null, seeds = [], born = new Map(), groundOn = true;

  // ---------------------------------------------------------------- the living letters, measured to the text box
  function metrics() {
    const css = getComputedStyle(ta), g = document.createElement('canvas').getContext('2d');
    g.font = `${css.fontSize} ${css.fontFamily}`;
    const ls = parseFloat(css.letterSpacing) || 0, cw = g.measureText('M').width + ls, lh = parseFloat(css.lineHeight) || fs * 1.7;
    return { cw, lh, size: Math.round(lh * 0.78), pad: { x: parseFloat(css.paddingLeft) || 6, y: parseFloat(css.paddingTop) || 4 } };
  }
  const view = () => ({ x: desk.scrollLeft - sheet.offsetLeft, y: desk.scrollTop - sheet.offsetTop });      // where the window looks, in the page's own coordinates
  function build() {
    if (living) living.stop();
    M = metrics();
    sheet.style.width = Math.ceil(COLS * M.cw + M.pad.x * 2 + 1) + 'px';
    living = Unown.living(cv, Object.assign({}, M, { calm, cols: COLS, halo: 'rgba(255, 255, 255, .95)', haloSize: 0.3 }));
    retext();
    fit();
  }
  /** the text changed: the Unown, the page's height (whole pages), and the words the ground knows */
  function retext() {
    living.setText(ta.value);
    const chars = Array.from(ta.value), L = Unown.layout(chars, 4, COLS), rows = L.length ? L[L.length - 1].row + (chars[chars.length - 1] === '\n' ? 2 : 1) : 1, pages = Math.max(1, Math.ceil(rows / LINES));
    ta.style.height = Math.ceil(pages * LINES * M.lh + M.pad.y * 2) + 'px';
    const now = performance.now() / 1000, next = new Map();
    seeds = UnownLand.seeds(chars, L).map((s, i) => {
      const b = born.has(s.key) ? born.get(s.key) : now + Math.min(3, i * 0.25) * (born.size ? 0 : 1);      // (a note just opened: its words wake one after another)
      next.set(s.key, b);
      return { theme: s.theme, x: M.pad.x + s.col * M.cw, y: M.pad.y + s.row * M.lh + M.lh / 2, born: b };
    });
    born = next;
    const v = view(); living.setView(v.x, v.y);
  }
  function fit() {
    const dpr = window.devicePixelRatio || 1, r = page.getBoundingClientRect();
    for (const c of [cv, land]) { c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr)); }
    if (living) { const v = view(); living.setView(v.x, v.y); }
  }
  window.addEventListener('resize', fit);
  // ---------------------------------------------------------------- the ground of the page (src/unownland.js), a dozen pictures a second
  function ground() {
    const dpr = window.devicePixelRatio || 1, g = land.getContext('2d'), W = land.width / dpr, H = land.height / dpr, v = view();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!M || !groundOn || document.body.classList.contains('plain')) return;
    const sx = -v.x, sy = -v.y, sw = sheet.offsetWidth, sh = sheet.offsetHeight;
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(W, sx + sw), y1 = Math.min(H, sy + sh);
    g.fillStyle = 'rgba(0, 0, 0, .22)'; g.fillRect(sx + 4, sy + 5, sw, sh);                       // the page's shadow on the desk
    if (x1 > x0 && y1 > y0) UnownLand.draw(g, performance.now() / 1000, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, ox: x0 - sx, oy: y0 - sy, cell: 6, seeds });
    g.strokeStyle = '#2a4a2a'; g.lineWidth = 3; g.strokeRect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);       // its border
    g.strokeStyle = 'rgba(255, 255, 255, .5)'; g.lineWidth = 1; g.setLineDash([6, 6]);                  // where one page ends and the next begins
    for (let p = 1; p * LINES * M.lh + M.pad.y < sh - M.pad.y - 2; p++) { const y = sy + M.pad.y + p * LINES * M.lh; g.beginPath(); g.moveTo(sx + 8, y); g.lineTo(sx + sw - 8, y); g.stroke(); }
    g.setLineDash([]);
  }
  setInterval(ground, 80);

  // ---------------------------------------------------------------- typing, the caret, the status line
  function status() {
    const v = ta.value, at = ta.selectionStart, before = v.slice(0, at), ln = before.split('\n').length, col = at - before.lastIndexOf('\n');
    $('where').textContent = `Ln ${ln}, Col ${col}`;
    const n = Array.from(v).filter((c) => !/\s/.test(c)).length;
    $('count').textContent = `${n} Unown` + (seeds.length ? ` · ${seeds.length} living word${seeds.length === 1 ? '' : 's'}` : '');
    $('lockState').textContent = word ? '🔒 locked with a word' : '';
    $('saved').textContent = dirty ? 'not saved' : name ? 'saved' : '';
    document.title = `${dirty ? '*' : ''}${name || 'Untitled'} - Unown Notepad`;
  }
  function changed(on) { if (dirty !== on) { dirty = on; np.dirty(on); } status(); }
  ta.addEventListener('input', () => { retext(); changed(true); });
  desk.addEventListener('scroll', () => { const v = view(); living.setView(v.x, v.y); });
  for (const ev of ['keyup', 'click', 'select']) ta.addEventListener(ev, status);
  page.addEventListener('mousemove', (e) => { const r = sheet.getBoundingClientRect(); living.setPointer(e.clientX - r.left, e.clientY - r.top); });      // they know they are being read
  desk.addEventListener('mousedown', (e) => { if (e.target === desk) { e.preventDefault(); ta.focus(); } });      // a click on the desk beside the page: back to writing
  page.addEventListener('mouseleave', () => living.setPointer(-1, -1));

  // ---------------------------------------------------------------- the word (locking a note, opening a locked one)
  function askWord(mode) {
    wordMode = mode;
    $('wordText').textContent = mode === 'unlock' ? 'This note is locked. Its word:' : word ? 'A new word for this note (leave it empty to unlock it):' : 'Lock this note with a word. Without it nobody can read the file, not even Screen Trainer:';
    $('word').hidden = false; $('wordIn').value = ''; $('wordIn').focus();
  }
  async function wordOk() {
    const w = $('wordIn').value;
    $('word').hidden = true;
    if (wordMode === 'unlock') {
      const r = await np.unlock(w);
      if (!r || !r.ok) { askWord('unlock'); $('wordText').textContent = r && r.why === 'word' ? 'That is not its word. Try again:' : 'It could not be opened.'; return; }
      word = w;
      take(r);
    } else { word = w; changed(true); }
    ta.focus();
  }
  $('wordOk').onclick = wordOk;
  $('wordNo').onclick = () => { $('word').hidden = true; ta.focus(); };
  $('wordIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') wordOk(); if (e.key === 'Escape') $('wordNo').onclick(); });

  // ---------------------------------------------------------------- files (the main process chooses, reads and writes)
  function take(m) {
    if (!m) return;
    if (m.locked && typeof m.text !== 'string') { name = m.name || ''; status(); askWord('unlock'); return; }
    ta.value = typeof m.text === 'string' ? m.text : '';
    name = m.name || ''; if (!m.locked) word = '';
    desk.scrollTop = 0; desk.scrollLeft = 0; ta.setSelectionRange(0, 0);
    born = new Map(); retext();
    changed(false); ta.focus();
  }
  async function save(as) {
    const r = await np.save({ text: ta.value, as: !!as, word });
    if (r && r.ok) { name = r.name; changed(false); return true; }
    if (r && r.error) alertLine(r.error);
    return false;
  }
  function alertLine(text) { $('saved').textContent = text; }
  async function open() { const r = await np.open(); if (r && r.ok) { word = ''; take(r); } else if (r && r.error) alertLine(r.error); }
  function fresh() { word = ''; take({ text: '', name: '' }); }
  np.onText(take);
  np.onAskSave(async () => { const ok = await save(false); np.closeOk(ok); });      // closing with a note not saved: "Save" was chosen

  // ---------------------------------------------------------------- the menu and the keys
  const ACT = {
    new: fresh, open, save: () => save(false), saveAs: () => save(true), lock: () => askWord('lock'), close: () => window.close(),
    undo: () => { ta.focus(); document.execCommand('undo'); }, cut: () => { ta.focus(); document.execCommand('cut'); }, copy: () => { ta.focus(); document.execCommand('copy'); },
    paste: () => { ta.focus(); document.execCommand('paste'); }, all: () => { ta.focus(); ta.select(); },
    plain: () => { document.body.classList.toggle('plain'); document.querySelector('[data-do="plain"]').classList.toggle('on', document.body.classList.contains('plain')); },
    bigger: () => zoom(2), smaller: () => zoom(-2),
    calm: () => { calm = calm === 1 ? 0.35 : 1; document.querySelector('[data-do="calm"]').classList.toggle('on', calm !== 1); build(); },
    ground: () => { groundOn = !groundOn; document.body.classList.toggle('noground', !groundOn); document.querySelector('[data-do="ground"]').classList.toggle('on', groundOn); },
  };
  function zoom(d) { fs = Math.max(12, Math.min(40, fs + d)); document.documentElement.style.setProperty('--fs', fs + 'px'); document.documentElement.style.setProperty('--lh', Math.round(fs * 1.7) + 'px'); document.documentElement.style.setProperty('--ls', Math.round(fs * 0.3) + 'px'); build(); }
  const menu = $('menu');
  menu.addEventListener('click', (e) => {
    const top = e.target.closest('.top'), item = e.target.closest('[data-do]');
    if (top) { const m = top.parentElement, was = m.classList.contains('open'); for (const x of menu.querySelectorAll('.m')) x.classList.remove('open'); if (!was) m.classList.add('open'); return; }
    if (item) { for (const x of menu.querySelectorAll('.m')) x.classList.remove('open'); const f = ACT[item.dataset.do]; if (f) f(); }
  });
  menu.addEventListener('mouseover', (e) => { const m = e.target.closest('.m'); if (m && menu.querySelector('.m.open') && !m.classList.contains('open')) { for (const x of menu.querySelectorAll('.m')) x.classList.remove('open'); m.classList.add('open'); } });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menu')) for (const x of menu.querySelectorAll('.m')) x.classList.remove('open'); });
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    const f = k === 'n' ? ACT.new : k === 'o' ? ACT.open : k === 's' ? (e.shiftKey ? ACT.saveAs : ACT.save) : k === 'r' ? ACT.plain : k === '+' || k === '=' ? ACT.bigger : k === '-' ? ACT.smaller : null;
    if (f) { e.preventDefault(); f(); }
  });

  // ---------------------------------------------------------------- start
  (async () => {
    let h = null;
    try { h = await np.hello(); } catch (e) { h = null; }
    try { if (h && h.sprites) Sprites.configure(h.sprites, h.style || 'showdown'); } catch (e) { /* no sprites: every letter is drawn */ }
    build(); status(); ta.focus(); document.querySelector('[data-do="ground"]').classList.add('on');
    if (h && h.open) take(h.open);                       // opened with a note (from the Field Dex's Open, or from Windows)
    window.Notepad = { state: () => Object.assign({ name, dirty, locked: !!word, text: ta.value.length, plain: document.body.classList.contains('plain'), page: { cols: COLS, lines: LINES, w: sheet.offsetWidth, h: sheet.offsetHeight, textW: ta.clientWidth }, words: seeds.map((s) => s.theme) }, living.state()) };      // (for the checks)
  })();
})();
