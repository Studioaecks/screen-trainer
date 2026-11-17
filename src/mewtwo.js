// Screen Trainer — Mewtwo on the overlay: the XXL Super Alpha that watches over the computer.
//
// It is not part of the game: it is never wild, never on the team, takes no part in fights and cannot be
// caught or hurt, so it is deliberately not in G.actors. It stands where you drag it, floats on the spot
// (a CSS animation, so it costs nothing while the screen is otherwise still) and opens its own window
// when clicked. What it knows about the computer comes from guardian.js in the main process, which sends
// it things to say (st.onGuardian).
//
// Show or hide it: setting `guardian`. Where it stands: `guardianX`, `guardianY` (shares of the screen).
//
// It stands on the screen, not in the game's world: when the field window is open and the Pokémon are kept inside it,
// Mewtwo stays where it was. So everything here is in screen coordinates (G.SW, G.SH), and game.js adds the world's
// corner (G.vx, G.vy) to the pointer before asking Mewtwo.hit / .down / .move.
'use strict';

const Mewtwo = (() => {
  const SP = 150;
  const mon = { sp: SP, xxl: 1, sz: 255, shiny: 0, fem: 0 };                  // xxl: the one size nothing else has (src/size.js)
  const TONE = { ok: '#7be08a', warn: '#ffcb47', bad: '#ff7a5c', info: '#c9a0ff' };
  let el = null, img = null, bubble = null, tagEl = null, x = 0, y = 0, w = 0, h = 0, nw = 0, nh = 0, padded = false, drag = null, sayTimer = 0, fx = 0.9, fy = 0.86;
  let gone = null;                                         // (0.9.5) while it is off on a long task: { at, t } (see away / back)
  const SW = () => G.SW || G.W, SH = () => G.SH || G.H;                      // the whole screen

  const present = () => !!el;
  function size() {
    if (!el || !nw) return;
    const k = Size.spriteScale(mon, nw, nh, padded, G.set.sizeMode || 'true', G.scale, Math.min(SW(), SH()) || 1080);
    w = nw * k; h = nh * k;
    img.style.width = w + 'px'; img.style.height = h + 'px';
    img.style.imageRendering = k < 1 ? 'auto' : '';
    place();
  }
  function place() {
    if (!el || gone) return;
    x = U.clamp(x, w * 0.5, Math.max(w * 0.5, SW() - w * 0.5)); y = U.clamp(y, Math.min(h + 8, SH()), SH() - 4);
    el.style.transform = `translate3d(${Math.round(x - w / 2)}px,${Math.round(y - h)}px,0)`;
    el.style.zIndex = Math.floor(y);
    el.classList.toggle('flip', x < SW() / 2);                                 // it faces the middle of the screen
  }
  function build() {
    const r = Sprites.resolve(SP, false, false);
    if (!r || !G.world) return;
    el = document.createElement('div'); el.className = 'guard';
    img = new Image(); img.className = 'spr gspr'; img.draggable = false;
    tagEl = document.createElement('div'); tagEl.className = 'gtag'; tagEl.textContent = 'Mewtwo  XXL Super Alpha';
    bubble = document.createElement('div'); bubble.className = 'gsay'; bubble.hidden = true;
    padded = !!r.padded;
    img.onload = () => { nw = img.naturalWidth; nh = img.naturalHeight; size(); };
    img.onerror = () => remove();
    img.src = r.front;
    el.appendChild(img); el.appendChild(tagEl); el.appendChild(bubble);
    (G.screenLayer || G.world).appendChild(el);
    w = h = 0; nw = nh = 0;
    x = SW() * fx; y = SH() * fy;
  }
  function remove() { if (el) el.remove(); el = img = bubble = tagEl = null; drag = null; clearTimeout(sayTimer); }
  /** call when settings, the sprite folder or the screen size change */
  function apply(s, reload) {
    s = s || G.set;
    // (0.7) Mewtwo stands guard once it has been met and caught: it comes by shortly after a new game starts (src/events.js, "the three helpers")
    const here = typeof Events === 'undefined' || !Events.hasHelper || (!!G.save && Events.hasHelper('mewtwo'));
    const want = s.guardian !== false && Sprites.ready() && here;
    if (!drag) { fx = +s.guardianX || 0.9; fy = +s.guardianY || 0.86; }
    if (reload) remove();
    if (want && !el) build(); else if (!want && el) remove();
    if (el) { if (!drag) { x = SW() * fx; y = SH() * fy; } size(); place(); }
  }

  // ---- pointer: a click opens the Mewtwo window, a drag moves it
  const hit = (px, py) => !!el && !gone && w > 0 && px >= x - w * 0.5 && px <= x + w * 0.5 && py >= y - h * 0.97 && py <= y + 4;
  const dragging = () => !!drag;
  const open = () => { try { if (window.st.openGuardian) window.st.openGuardian(); } catch (e) { /* no window to open: fine */ } };
  function down(px, py, button) {
    if (button === 2) { open(); return; }
    if (button === 0) drag = { ox: x - px, oy: y - py, sx: px, sy: py, moved: false };
  }
  function move(px, py) {
    if (!drag) return false;
    if (!drag.moved && Math.hypot(px - drag.sx, py - drag.sy) > 6) { drag.moved = true; el.classList.add('held'); }
    if (drag.moved) { x = px + drag.ox; y = py + drag.oy; place(); }
    return true;
  }
  function up() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!el) return;
    el.classList.remove('held');
    if (!d.moved) { open(); return; }
    fx = x / SW(); fy = y / SH();
    try { window.st.setSettings({ guardianX: +fx.toFixed(4), guardianY: +fy.toFixed(4) }); } catch (e) { /* stays where it is for this session */ }
  }
  const hover = (on) => { if (el && el._over !== on) { el._over = on; el.classList.toggle('over', on); } };

  /** a line in its speech card. tone: ok | warn | bad | info */
  function say(text, tone, seconds) {
    if (!el || !text) return false;
    const words = String(text).slice(0, 220);
    // on the MyStream stage viewers must not read this: the stage keeps the real words for the owner's booth and shows scrambled letters (src/stage.js)
    bubble.textContent = window.StageHost ? window.StageHost.mask(words, tone) : words;
    bubble.style.borderColor = TONE[tone] || TONE.info;
    bubble.hidden = false;
    el.classList.add('speaking');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { if (bubble) { bubble.hidden = true; el.classList.remove('speaking'); } }, Math.max(2, seconds || 7) * 1000);
    return true;
  }

  // ---- a long task (0.9.5, owner's list 11-16 update 1): it calls its move, dives (upright since 0.9.6) into the bottom right corner
  // of the screen, and comes back with the answer when main.js says the task is done. It always comes back: at the
  // latest after BACK_ANYWAY seconds (a quick scan may take up to 45 minutes), and when it is asked to go again.
  const BACK_ANYWAY = 50 * 60;
  function away(move) {
    if (!el || drag) return false;
    if (gone) return true;
    if (move) say(`${move}!`, 'info', 2);
    const me = gone = { t: setTimeout(() => { if (gone === me) back('', 'info', 0); }, BACK_ANYWAY * 1000), at: Date.now() };
    setTimeout(() => {
      if (gone !== me || !el) return;
      bubble.hidden = true; el.classList.remove('speaking');
      el.classList.add('diving');
      el.style.transform = `translate3d(${Math.round(SW() + w * 0.6)}px,${Math.round(SH() + h * 0.2)}px,0)`;
    }, 900);
    return true;
  }
  function back(text, tone, seconds) {
    const was = gone;
    if (!was) { if (text) say(text, tone, seconds); return; }
    clearTimeout(was.t); gone = null;
    if (!el) return;
    el.classList.remove('diving');
    el.classList.add('returning');
    el.style.transform = `translate3d(${Math.round(SW() + w * 0.6)}px,${Math.round(SH() + h * 0.2)}px,0)`;
    void el.offsetWidth;                                    // (from the corner, not from wherever the dive ended)
    place();
    setTimeout(() => { if (!el || gone) return; el.classList.remove('returning'); if (text) say(text, tone, seconds); }, 1100);
  }
  const isAway = () => !!gone;

  return { apply, present, hit, dragging, down, move, up, hover, say, away, back, isAway, box: () => ({ x, y, w, h }) };
})();
