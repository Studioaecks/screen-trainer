// Screen Trainer — the Pokédex window: species index, team, bag, trainer card, options, and the slide-out
// Box with drag-and-drop arrangement. This window only displays and sends commands (st.cmd, st.setSettings);
// the game itself runs in the overlay, which sends a fresh snapshot (G.snapshot in game.js) about once a second.
'use strict';

(async () => {
  const st = window.st, $ = (id) => document.getElementById(id), D = DATA, X = typeof DATA_EXTRA !== 'undefined' ? DATA_EXTRA : { itemEvo: {}, wildItems: {}, dex: {}, itemNames: {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ui = (name) => { try { st.sound(name); } catch (e) { /* no sound: fine */ } };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const IDS = Object.keys(D.dex).map(Number).sort((a, b) => a - b);
  const STAT = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  const APT = { leader: 'born leader', steady: 'steady', loner: 'free spirit' };
  const TIER = ['', 'Common', 'Uncommon', 'Rare', 'Very rare'];
  const POCKETS = [['all', 'All'], ['medicine', 'Medicine'], ['training', 'Training'], ['evo', 'Evolution'], ['ball', 'Balls'], ['held', 'Held'], ['gift', 'Treasures']];
  const TYPE_COL = { normal: '#9fa8b0', fire: '#ff9c54', water: '#6aa5e8', electric: '#f3d23b', grass: '#63bb5b', ice: '#74cec0', fighting: '#e0627f', poison: '#bd7fd6', ground: '#d98d5c', flying: '#9db4e6',
    psychic: '#f98a8e', bug: '#a3cc3f', rock: '#c7b78b', ghost: '#8b9bd6', dragon: '#5c9be0', dark: '#8d8799', steel: '#7fb0c0', fairy: '#ec9fe6' };
  const WEATHER_NAME = { rain: 'rain', sun: 'harsh sunlight', sand: 'sandstorm', hail: 'hail', snow: 'snow' }, WEATHER_ICON = { rain: '☂', sun: '☀', sand: '≋', hail: '❄', snow: '❄' };
  const POCKET_OF = { heal: 'medicine', cure: 'medicine', revive: 'medicine', level: 'training', xp: 'training', ivs: 'training', nature: 'training', evo: 'evo', ball: 'ball', held: 'held', both: 'held', gift: 'gift', misc: 'gift' };

  // The files on disk can be newer than the program that is running (an update copied in while it was open).
  // The running program then lacks what this window asks for, so say so instead of showing a half-working device.
  let settings, info, spriteInfo;
  try { settings = await st.getSettings(); info = await st.info(); spriteInfo = await st.sprites(); } catch (e) { info = null; }
  const showVersion = () => { try { $('brandVer').textContent = info && info.version ? 'v' + info.version : ''; } catch (e) { /* no such line on this page */ } };      // after "Screen Trainer field dex" (0.9.4)
  showVersion();
  setTimeout(() => { try { brandUnown(); } catch (e) { /* the plain title stays */ } }, 400);
  if (info && info.myStream) document.body.classList.add('onstream');      // MyStream is open: this window may be on the stream (panel.css blurs the folder paths)
  if (!info || !('bank' in info) || !settings || !st.openGuardian || !('api' in info) || (st.openMyStream && !(info.api >= 5))) {      // (api 5: MyStream)
    $('lcd').innerHTML = '<section class="screen on"><header class="bar"><h2>Restart Screen Trainer</h2></header><div class="scroll prose"><p>Screen Trainer was updated while it was running. Right-click its tray icon, choose <b>Close app</b>, then start ScreenTrainer.exe again.</p><p>Your team and save are not affected.</p></div></section>';
    return;
  }
  Sprites.configure(spriteInfo, settings.spriteStyle);
  // The title line in Living Unown (0.9.8; the owner asked for it with the version in 0.9.4): "Screen Trainer field dex
  // v…" is written by the Unown (src/unown.js) and turns into plain letters while the mouse is on it.
  let brandLive = null;
  function brandUnown() {
    const b = document.querySelector('.brand');
    if (!b || typeof Unown === 'undefined') return;
    let cv = b.querySelector('canvas.ul');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'ul'; cv.setAttribute('aria-hidden', 'true'); b.appendChild(cv); }
    const text = b.textContent.replace(/\s+/g, ' ').trim(), r = b.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width || !text) return;
    const n = Array.from(text).length, cw = r.width / n, lh = r.height + 12;
    cv.style.width = r.width + 'px'; cv.style.height = lh + 'px'; cv.width = Math.round(r.width * dpr); cv.height = Math.round(lh * dpr);
    if (brandLive) brandLive.stop();
    brandLive = Unown.living(cv, { cw, lh, size: Math.round(lh * 0.86), pad: { x: 0, y: 0 }, calm: 0.6, stagger: 0.03, halo: 'rgba(235, 240, 255, .85)' });      // (a light glow: the device's top is dark)
    brandLive.setText(text);
    b.classList.add('unown');
    b.onmousemove = (e) => { const q = b.getBoundingClientRect(); brandLive.setPointer(e.clientX - q.left, e.clientY - q.top); };
  }
  const applyTheme = () => { document.documentElement.dataset.theme = settings.theme === 'classic' ? 'classic' : 'glass'; document.documentElement.dataset.contrast = settings.contrast === 'system' ? 'system' : 'own'; document.documentElement.dataset.hints = settings.hints === 'always' ? 'always' : 'hover'; };
  applyTheme();
  // The two screens are fixed frames; only the lists inside them scroll. Focusing a control must never move a frame
  // (that is how the generation buttons used to blank the screen), so a frame that gets scrolled is put straight back.
  for (const id of ['lcd', 'boxlcd']) $(id).addEventListener('scroll', (e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; });
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
  const GEN_REGION = ['', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let state = null, box = [], tab = 'dex', drag = null, armed = null, suppressClick = false;
  const sel = { dex: 1, party: null, bag: null, box: null, pocket: 'all' };
  const sig = {};                                             // last rendered signature per region, to skip identical redraws
  const changed = (key, value) => { const s = typeof value === 'string' ? value : JSON.stringify(value); if (sig[key] === s) return false; sig[key] = s; return true; };

  // ---------------------------------------------------------------- small builders
  const typeId = (name) => D.types.indexOf(name);
  const typeTag = (name) => { const src = Sprites.type(typeId(name)); return src ? `<img src="${esc(src)}" alt="${esc(name)}" title="${esc(name)}">` : `<span class="typ">${esc(name)}</span>`; };
  const img = (src, cls = '', alt = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" draggable="false">` : `<span class="${cls}"></span>`);
  const hearts = (n) => `<span class="hearts" title="Affection">${'♥'.repeat(n)}<i>${'♥'.repeat(5 - n)}</i></span>`;
  const hpCol = (r) => (r > 0.5 ? '#2f9d57' : r > 0.2 ? '#c9a100' : '#c22a5e');
  const gender = (m) => (m.genderless ? '' : m.fem ? ' ♀' : ' ♂');
  const no = (sp) => '#' + String(sp).padStart(4, '0');
  const kg = (hg) => (hg / 10).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' kg', metres = (dm) => (dm / 10).toFixed(1) + ' m';
  const sizeText = (m) => (m.size ? `<span class="sizetag s${m.size}">${m.size}</span> ${esc(m.sizeName)}${m.height ? ', ' + Size.metresText(m.height) : ''}` : '');
  const statRows = (vals, ivs, max) => vals.map((v, i) => `<div class="stat"><span>${STAT[i]}</span><b>${v}</b><i style="--w:${Math.round(clamp(v / max, 0, 1) * 100)}%"></i><em>${ivs ? ivs[i] : ''}</em></div>`).join('');

  /** a windowed list: draws only the rows on screen, so a thousand species or a few thousand boxed Pokémon stay fast */
  function windowed(scroller, pad, rowH, cols, cellHtml) {
    let count = 0, drawn = '';
    const draw = (force) => {
      const rows = Math.ceil(count / cols), first = Math.max(0, Math.floor(scroller.scrollTop / rowH) - 3), last = Math.min(rows, first + Math.ceil(scroller.clientHeight / rowH) + 7);
      const key = `${first}:${last}:${count}`;
      if (!force && key === drawn) return;
      drawn = key;
      let html = '';
      for (let r = first; r < last; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < count) html += cellHtml(i, r * rowH, c); }
      pad.style.height = rows * rowH + 'px';
      pad.innerHTML = html;
    };
    scroller.addEventListener('scroll', () => draw(false));
    return { set(n) { count = n; draw(true); }, redraw: () => draw(true), reveal(i) { const y = Math.floor(i / cols) * rowH; if (y < scroller.scrollTop) scroller.scrollTop = y; else if (y + rowH > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + rowH - scroller.clientHeight; } };
  }

  // ---------------------------------------------------------------- screens
  function show(name, quiet) {
    if (!$(name) || !$(name).classList.contains('screen')) name = 'dex';
    tab = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === name));
    document.querySelectorAll('#keys .key').forEach((k) => k.classList.toggle('on', k.dataset.tab === name));
    if (!quiet) ui('page');
    render(true);
    if (name === 'options') fillExport();
  }
  const openGuardian = () => { ui('select'); st.openGuardian(); };
  $('keys').addEventListener('click', (e) => { const k = e.target.closest('.key'); if (!k) return; if (k.dataset.tab) show(k.dataset.tab); else if (k.id === 'guardKey') openGuardian(); else if (k.id === 'streamKey') { ui('select'); st.openMyStream(); } else if (k.id === 'optKey') { ui('select'); if (st.openOptimize) st.openOptimize(); } });
  /** The three helper keys (0.7): Mewtwo's, Porygon-Z's "stream" and Rotom's "optimize" are there once that Pokémon has
   *  been met and caught (src/events.js, "the three helpers"). A game page from before 0.7 says nothing: all show. */
  function renderKeys() {
    const h = state && state.helpers, phone = !!(info && info.android);
    $('guardKey').hidden = !!h && !h.mewtwo;
    $('streamKey').hidden = (!!h && !h.porygonz) || phone;
    $('optKey').hidden = (!!h && !h.rotom) || phone || !st.openOptimize;
  }
  /** "party:<uid>": the team page, on that Pokémon (a right-click on a team member on the screen) */
  /** "boxmon:<uid>": the same page, on that Pokémon of the Box (a right-click on a Pokémon in the Box Field, 0.9) */
  function showTab(t) {
    const [name, uid] = String(t || '').split(':');
    if (name === 'boxmon') {
      if (uid) { sel.box = uid; setTimeout(() => { try { armed = null; sig.boxCells = ''; renderBox(true); } catch (e) { /* the Box is not drawn yet: it shows the choice when it is */ } }, 0); }
      show('party', true);
      return;
    }
    if (uid) { sel.party = uid; sel.box = null; wantParty = uid; }
    show(name, true);
  }
  let wantParty = null;                                     // (kept until the game's next state has that Pokémon on the team)
  st.onTab((t) => showTab(t));

  // ---------------------------------------------------------------- Pokédex
  let dexRows = [], seen = new Set(), caught = {};
  const dexList = windowed($('dexList'), $('dexPad'), 34, 1, (i, top) => {
    const sp = dexRows[i], d = D.dex[sp], isSeen = seen.has(sp), n = caught[sp] || 0;
    return `<div class="row ${sp === sel.dex ? 'sel' : ''} ${isSeen ? '' : 'unseen'}" style="top:${top}px" data-sp="${sp}"><span class="no">${no(sp)}</span>${isSeen ? img(Sprites.icon(sp), 'ic pix') : '<span class="ic"></span>'}<span class="nm">${isSeen ? esc(d.n) : '?????'}</span>${
      n ? img(Sprites.item('poke-ball'), 'got pix', 'caught') || '' : isSeen ? '<span class="dot" title="Seen"></span>' : ''}</div>`;
  });
  function filterDex() {
    const q = $('dexFind').value.trim().toLowerCase(), f = $('dexFilter').value;
    dexRows = IDS.filter((sp) => {
      const isSeen = seen.has(sp), isCaught = !!caught[sp];
      if (f === 'seen' && !isSeen) return false;
      if (f === 'caught' && !isCaught) return false;
      if (f === 'missing' && isCaught) return false;
      if (!q) return true;
      return String(sp).includes(q.replace(/^#?0*/, '')) && /^#?\d+$/.test(q) ? true : isSeen && D.dex[sp].n.toLowerCase().includes(q);
    });
    dexList.set(dexRows.length);
  }
  function renderDex(force) {
    const d = state.dex;
    seen = new Set(d.seenIds); caught = d.caughtIds || {};
    $('dexCount').textContent = `${d.caught} of ${d.total}`;
    if (changed('dexList', [d.seen, d.caught, $('dexFind').value, $('dexFilter').value]) || force) filterDex();
    renderDexEntry();
  }
  function renderDexEntry() {
    const sp = sel.dex, d = D.dex[sp], isSeen = seen.has(sp), n = caught[sp] || 0, x = X.dex[sp] || ['', 0, 0];
    if (!changed('dexEntry', [sp, isSeen, n, settings.spriteStyle, (state.dex.sizes || {})[sp]])) return;
    const spr = Sprites.resolve(sp, false, false);
    let html = `<h3>${isSeen ? esc(d.n) : '?????'}<small>${no(sp)}</small></h3><div class="sub">${isSeen && x[0] ? esc(x[0]) + ' Pokémon' : 'Not seen yet'}</div>
      <div class="finder"${isSeen && spr && n ? ` data-turn="${sp}:0:0" title="Drag it left or right to see its other pictures."` : ''}>${isSeen && spr ? `<img class="pix ${n ? '' : 'shade'}" src="${esc(spr.front)}" alt="">` : '<span class="q">?</span>'}<span class="tag">${n ? `caught ${n}×` : isSeen ? 'seen' : ''}</span></div>`;
    if (isSeen) html += `<div class="types">${d.t.map((t) => typeTag(D.types[t])).join('')}</div>`;
    if (n) {
      const rec = (state.dex.sizes || {})[sp], span = rec ? [Size.mult({ sz: rec[0] }), Size.mult({ sz: rec[1] })].map((k) => Size.metresText((x[1] / 10) * k)) : null;
      html += `<dl class="facts"><dt>Height</dt><dd>${metres(x[1])}</dd>${span ? `<dt>Yours</dt><dd>${rec[0] === rec[1] ? `${span[0]} (${Size.label({ sz: rec[0] })})` : `${span[0]} (${Size.label({ sz: rec[0] })}) to ${span[1]} (${Size.label({ sz: rec[1] })})`}</dd>` : ''}<dt>Weight</dt><dd>${kg(x[2])}</dd><dt>Catch rate</dt><dd>${d.cr} of 255</dd></dl>
        <div class="sect">Base stats</div>${statRows(d.s, null, 200)}`;
      const evo = [];
      for (const e of d.ev || []) evo.push(`${e.lvl ? 'Level ' + e.lvl : 'High affection'} → ${seen.has(e.to) ? esc(D.dex[e.to].n) : '?????'}`);
      for (const key in X.itemEvo) for (const e of X.itemEvo[key]) if (e[0] === sp) evo.push(`${esc(X.itemNames[key] || key)}${e[2] ? (e[2] === 'f' ? ' ♀' : ' ♂') : ''} → ${seen.has(e[1]) ? esc(D.dex[e[1]].n) : '?????'}`);
      if (evo.length) html += `<div class="sect">Evolves</div><div class="chips">${[...new Set(evo)].map((t) => `<span class="chip">${t}</span>`).join('')}</div>`;
      const carry = (X.wildItems[sp] || []).filter((c) => Sprites.item(c[0]));
      if (carry.length) html += `<div class="sect">Sometimes carries</div><div class="chips">${carry.map((c) => `<span class="chip">${img(Sprites.item(c[0]), 'pix')}${esc(X.itemNames[c[0]] || c[0])}</span>`).join('')}</div>`;
    } else if (isSeen) html += `<p class="sub" style="margin-top:10px">Catch one to fill in this entry.</p>`;
    else html += `<p class="sub" style="margin-top:10px">Wild Pokémon hop in from the edges of your screen. This one has not shown up yet.</p>`;
    $('dexEntry').innerHTML = html;
    applyTurn($('dexEntry'));
    $('dexEntry').scrollTop = 0;
  }
  function pickDex(sp, reveal) { if (!D.dex[sp]) return; sel.dex = sp; dexList.redraw(); if (reveal) dexList.reveal(dexRows.indexOf(sp)); renderDexEntry(); }
  $('dexList').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { pickDex(+r.dataset.sp); ui('scroll'); } });
  $('dexList').addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = clamp(dexRows.indexOf(sel.dex) + step, 0, dexRows.length - 1);
    if (dexRows[i]) { pickDex(dexRows[i], true); ui('scroll'); }
  });
  $('dexFind').addEventListener('input', () => { sig.dexList = ''; renderDex(); });
  $('dexFilter').addEventListener('change', () => { sig.dexList = ''; renderDex(); ui('select'); });

  // ---------------------------------------------------------------- team
  const monOf = (uid) => (state ? state.team.find((m) => m.uid === uid) : null) || box.find((m) => m.uid === uid) || null;
  function slotHtml(m, i) {
    const r = m.maxHp ? m.hp / m.maxHp : 0;
    return `<div class="slot ${m.uid === sel.party ? 'sel' : ''} ${m.hp <= 0 ? 'out' : ''}" data-uid="${esc(m.uid)}" data-src="party" title="${i === 0 ? 'Team leader' : 'Slot ' + (i + 1)}">
      ${img(m.icon, 'ic pix')}<div class="l1"><span>${i === 0 ? '★ ' : ''}${esc(m.name)}${m.shiny ? ' ✦' : ''}</span></div>${m.item ? img(m.item.icon, 'held pix', m.item.name) : '<span class="held"></span>'}
      <div class="bars"><div class="hp" style="--w:${Math.round(r * 100)}%;--c:${hpCol(r)}" title="HP ${m.hp} / ${m.maxHp}"></div><small>Lv. ${m.lvl}</small><div class="xp" style="--w:${Math.round(m.xp * 100)}%"></div></div></div>`;
  }
  function renderParty(force) {
    const team = state.team;
    const eggs = state.eggs || 0;                           // an egg being carried takes a place on the team, as in the games
    $('partyCount').textContent = `${team.length} of 6${eggs ? ` and ${eggs === 1 ? 'an egg' : eggs + ' eggs'}` : ''}`;
    if (wantParty && team.some((m) => m.uid === wantParty)) { sel.party = wantParty; wantParty = null; }
    if (!team.some((m) => m.uid === sel.party)) sel.party = team[0] ? team[0].uid : null;
    const busy = drag || (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('rename'));
    if (busy && !force) return;
    if (changed('partySlots', [team.map((m) => [m.uid, m.name, m.lvl, m.hp, m.maxHp, Math.round(m.xp * 50), m.item && m.item.key, m.icon]), sel.party, eggs, state.care, settings.hints]) || force) {
      // Hints are for the pointer (0.7): who is at the Day Care is said when the mouse rests on the free slots (or, with a
      // full team, on the count above), not in a line of its own. Options > This window > Hints brings the lines back.
      const all = settings.hints === 'always', care = state.care && state.care.guests.length ? `At the Day Care: ${state.care.guests.join(' and ')}${state.care.egg ? '. An egg is waiting there.' : ''} They are in the fence north of the fountain. Drag one out of the fence to take it back onto the team, or onto the pipe to send it to the Box.` : (state.care && state.care.egg ? 'An egg is waiting at the Day Care.' : '');
      const free = 6 - team.length - eggs, freeTip = `${free > 0 ? 'Room for ' + free + ' more on the team. ' : ''}${care}`.trim();
      $('partyCount').title = care;
      $('partySlots').innerHTML = team.length ? team.map(slotHtml).join('') + Array.from({ length: eggs }, () => `<div class="slot vacant" title="An egg from the Day Care. It takes a place on the team and hatches by itself when it is ready.">${all ? 'An egg. It will hatch when it is ready.' : 'An egg'}</div>`).join('') + (all && care ? `<div class="slot vacant" title="${esc(care)}">At the Day Care: ${state.care.guests.map(esc).join(' and ')}${state.care.egg ? '. An egg is waiting there.' : ''}</div>` : '') + (free > 0 ? `<div class="slot vacant${care && !all ? ' more' : ''}" title="${esc(freeTip)}">${free} free ${free === 1 ? 'slot' : 'slots'}${care && !all ? ' <span class="dot" aria-hidden="true"></span>' : ''}</div>` : '')
        : '<div class="empty">No partner yet.<br><b>Left-click</b> a wild Pokémon to weaken it, then <b>right-click</b> it to throw a ball.</div>';
    }
    // Which Pokémon the entry is about: the one chosen on the team list, or, while the Box screen is out, the one chosen
    // there (team rail or Box). Since 0.6 the Box shows its chosen Pokémon here, on the main screen, with everything.
    const boxOpen = $('stage').classList.contains('open'), m = (boxOpen && sel.box && monOf(sel.box)) || team.find((x) => x.uid === sel.party);
    shown = m ? m.uid : null;
    if (!changed('partyEntry', [m, team.length, armed, team[0] && team[0].uid, picking, settings.battleStyle, settings.autoBattle, settings.handsOff]) && !force) return;
    $('partyEntry').innerHTML = m ? entryHtml(m, team) : '';
    applyTurn($('partyEntry'));
  }
  let shown = null;                                         // uid of the Pokémon the entry shows

  // ---------------------------------------------------------------- importing a team (0.7)
  // Options > Save data > Import: a team in Pokémon Showdown's text format (src/showdown.js reads it). The text is read
  // here only to show what would be added; each line of the overview can be changed or unticked. "Add them" sends the
  // entries to the game, which checks every one again and makes the Pokémon (G.command 'importTeam').
  let imp = [];
  function importRead() {
    const r = Showdown.parse($('impText').value, D);
    imp = r.entries.map((e) => Object.assign({ use: !!e.ok }, e, { lvl: e.lvl || 50 }));
    $('impNote').textContent = imp.length ? `${imp.filter((e) => e.ok).length} of ${imp.length} read.${r.more ? ` ${r.more} more were left out: at most ${Showdown.MAX} at a time.` : ''}` : 'Nothing to read yet.';
    importDraw();
  }
  function importDraw() {
    const room = state ? Math.max(0, 6 - state.team.length - (state.eggs || 0)) : 0;
    $('impList').innerHTML = imp.map((e, i) => {
      if (!e.ok) return `<div class="imp bad"><div class="who"><b>${esc(e.species || '?')}</b></div><div class="notes">${e.notes.map(esc).join(' ')}</div></div>`;
      const d = D.dex[e.sp], icon = Sprites.icon(e.sp) || ((Sprites.resolve(e.sp, e.shiny, false) || {}).front || '');
      const moves = e.moves.length ? e.moves.map((id) => esc(D.moves[id].n)).join(', ') : 'the moves it knows at that level';
      return `<div class="imp" data-i="${i}">
        <label class="tick" title="Untick to leave this one out."><input type="checkbox" data-f="use" ${e.use ? 'checked' : ''} aria-label="Import ${esc(d.n)}"></label>
        ${img(icon, 'pix', d.n)}
        <div class="who"><b>${esc(d.n)}</b>
          <input type="text" data-f="nick" maxlength="12" value="${esc(e.nick || '')}" placeholder="nickname" title="Its nickname. Leave it empty for the species name." aria-label="Nickname">
          <span title="Its level, 1 to 100.">Lv. <input type="number" data-f="lvl" min="1" max="100" step="1" value="${e.lvl}" aria-label="Level"></span>
          <label title="A rare colouring."><input type="checkbox" data-f="shiny" ${e.shiny ? 'checked' : ''}> shiny</label>
          <select data-f="nat" title="Its nature. Random: it gets one as a caught Pokémon would." aria-label="Nature"><option value="-1">random nature</option>${D.natures.map((n, j) => `<option value="${j}" ${j === e.nat ? 'selected' : ''}>${esc(n.n)}</option>`).join('')}</select>
          ${d.gn < 0 || d.gn === 0 || d.gn >= 8 ? '' : `<select data-f="fem" title="Male or female. Random: as likely as its kind is." aria-label="Gender"><option value="">random</option><option value="0" ${e.fem === false ? 'selected' : ''}>male</option><option value="1" ${e.fem === true ? 'selected' : ''}>female</option></select>`}
        </div>
        <div class="mv" title="Up to four moves. Fewer than four are filled up with what it knows at its level.">Moves: ${moves}${e.itemName ? ` · holding ${esc(e.itemName)}` : ''}</div>
        ${e.notes.length ? `<div class="notes">${e.notes.map(esc).join(' ')}</div>` : ''}
      </div>`;
    }).join('');
    const n = imp.filter((e) => e.ok && e.use).length;
    $('impDo').hidden = !n;
    $('impSum').textContent = n ? `${n} to add: ${Math.min(n, room)} to the team${n > room ? `, ${n - room} to the Box` : ''}.` : '';
  }
  $('impRead').addEventListener('click', () => { importRead(); ui('select'); });
  $('impBack').addEventListener('click', () => show('options'));
  $('impList').addEventListener('change', (e) => {
    const row = e.target.closest('.imp[data-i]'), f = e.target.dataset.f, o = row && imp[+row.dataset.i];
    if (!o || !f) return;
    if (f === 'use') o.use = e.target.checked; else if (f === 'shiny') o.shiny = e.target.checked; else if (f === 'nick') o.nick = e.target.value.slice(0, 12);
    else if (f === 'lvl') { o.lvl = Math.min(100, Math.max(1, Math.round(+e.target.value) || 50)); e.target.value = o.lvl; }
    else if (f === 'nat') o.nat = +e.target.value; else if (f === 'fem') o.fem = e.target.value === '' ? null : e.target.value === '1';
    const n = imp.filter((x) => x.ok && x.use).length, room = state ? Math.max(0, 6 - state.team.length - (state.eggs || 0)) : 0;
    $('impDo').hidden = !n; $('impSum').textContent = n ? `${n} to add: ${Math.min(n, room)} to the team${n > room ? `, ${n - room} to the Box` : ''}.` : '';
  });
  $('impAdd').addEventListener('click', () => {
    const mons = imp.filter((e) => e.ok && e.use).map((e) => ({ sp: e.sp, nick: e.nick, lvl: e.lvl, shiny: e.shiny, fem: e.fem, nat: e.nat, iv: e.iv, moves: e.moves, itemName: e.itemName }));
    if (!mons.length) return;
    st.cmd({ type: 'importTeam', mons });
    ui('save');
    imp = []; $('impList').innerHTML = ''; $('impDo').hidden = true; $('impText').value = ''; $('impNote').textContent = `${mons.length} sent to the game. They are on the team page and in the Box.`;
    setTimeout(() => { st.requestState(true); show('party'); }, 500);
  });

  // ---------------------------------------------------------------- turning a Pokémon round (0.7)
  // The picture on a Pokémon's page can be dragged: left or right steps through every picture the sprites folder has
  // of it (front and back, the other sprite sets, the other colouring). `turned` remembers the picture chosen for each
  // Pokémon while the window is open, and puts it back whenever its page is drawn again.
  const turned = {}, STEP = 26;
  let turning = null;
  function applyTurn(scope) {
    for (const f of (scope || document).querySelectorAll('.finder[data-turn]')) {
      const key = f.dataset.turn, i = turned[key], img = f.querySelector('img.pix');
      if (!img || !i) { const c = f.querySelector('.view'); if (c) c.remove(); continue; }
      const [sp, sh, fem] = key.split(':').map(Number), list = Sprites.views(sp, !!sh, !!fem), v = list[((i % list.length) + list.length) % list.length];
      if (!v) continue;
      if (img.getAttribute('src') !== v.src) img.setAttribute('src', v.src);
      let c = f.querySelector('.view');
      if (!c) { c = document.createElement('span'); c.className = 'view'; f.appendChild(c); }
      c.textContent = v.label;
    }
  }
  document.addEventListener('mousedown', (e) => {
    const f = e.button === 0 && e.target.closest ? e.target.closest('.finder[data-turn]') : null;
    if (!f || !f.querySelector('img.pix')) return;
    const [sp, sh, fem] = f.dataset.turn.split(':').map(Number);
    if (Sprites.views(sp, !!sh, !!fem).length < 2) return;
    turning = { key: f.dataset.turn, x: e.clientX, from: turned[f.dataset.turn] || 0 };
    f.classList.add('turning'); e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!turning) return;
    const i = turning.from + Math.round((e.clientX - turning.x) / STEP);
    if (i !== (turned[turning.key] || 0)) { turned[turning.key] = i; applyTurn(); ui('scroll'); }
  });
  const endTurn = () => { if (!turning) return; turning = null; for (const f of document.querySelectorAll('.finder.turning')) f.classList.remove('turning'); };
  document.addEventListener('mouseup', endTurn); window.addEventListener('blur', endTurn);

  // ---------------------------------------------------------------- hints that are part of the page (0.7)
  // Mouse-over hints used to be the system's own tooltips, which are not part of the page: when the Field Dex is shown
  // on the MyStream stage (a picture of this page), viewers never saw them. Now the page draws the hint itself, in
  // #tip, so whoever watches reads along. A title is taken off its element while the pointer is on it and put back after.
  const tip = document.createElement('div');
  tip.id = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  let tipEl = null, tipT = 0;
  const tipPlace = (x, y) => { const w = tip.offsetWidth, h = tip.offsetHeight, W = window.innerWidth, Hh = window.innerHeight; tip.style.left = Math.max(6, Math.min(W - w - 6, x + 14)) + 'px'; tip.style.top = (y + 22 + h > Hh - 6 ? Math.max(6, y - h - 12) : y + 22) + 'px'; };
  function tipOff() { clearTimeout(tipT); if (tipEl) { if (tipEl.dataset.hint && !tipEl.title) tipEl.title = tipEl.dataset.hint; tipEl = null; } tip.hidden = true; }
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest ? e.target.closest('[title], [data-hint]') : null;
    if (el === tipEl) return;
    tipOff();
    if (!el || turning) return;
    const text = el.title || el.dataset.hint || '';
    if (!text.trim()) return;
    el.dataset.hint = text; el.removeAttribute('title'); tipEl = el;
    const x = e.clientX, y = e.clientY;
    tipT = setTimeout(() => { if (tipEl !== el) return; tip.textContent = text; tip.hidden = false; tipPlace(x, y); }, 380);
  });
  document.addEventListener('mousemove', (e) => { if (!tip.hidden) tipPlace(e.clientX, e.clientY); });
  document.addEventListener('mouseout', (e) => { if (tipEl && !(e.relatedTarget && tipEl.contains(e.relatedTarget))) tipOff(); });
  document.addEventListener('mousedown', tipOff); window.addEventListener('blur', tipOff);
  const H = (text) => ` title="${esc(text)}"`;              // a mouse-over hint
  /** everything about one Pokémon, team member or boxed, with a hint on every part */
  // ---- choosing moves (0.9.5, owner's list 11-16 update 5): a click on a move lists every move its species learns up
  // to its level; a click on one of those puts it in that place (src/mon.js setMove checks it, in the game).
  let picking = null;                                       // { uid, slot } while the list is open
  const moveInfo = (id) => { const mv = D.moves[id]; return { id, n: mv.n, t: D.types[mv.t], c: mv.c, p: mv.p, a: mv.a }; };
  const moveTip = (mv) => `${mv.n}: ${mv.t} type, ${mv.c === 1 ? 'a status move (no damage)' : mv.c === 2 ? 'physical (uses Attack against Defense)' : 'special (uses Sp. Atk against Sp. Def)'}${mv.p ? ', power ' + mv.p : ''}${mv.a ? ', hits ' + mv.a + ' times in 100' : ''}.`;
  const moveFace = (mv) => `<u style="--c:${TYPE_COL[mv.t] || '#999'}"></u><span>${esc(mv.n)}</span><em>${mv.p || '—'}</em>`;
  function pickerHtml(m) {
    const now = new Set(m.moves.map((mv) => mv.id)), list = [];
    for (const [lv, id] of (D.dex[m.sp] || { lm: [] }).lm) if (lv <= m.lvl && D.moves[id] && !list.includes(id)) list.push(id);
    for (const id of now) if (!list.includes(id)) list.push(id);
    return `<div class="mvpick"><p>${list.length > now.size ? `Moves ${esc(m.name)} knows at level ${m.lvl}. Pick one for this place:` : `${esc(m.name)} knows no other moves at level ${m.lvl} yet.`}</p>${list.map((id) => { const mv = moveInfo(id); return `<div class="mv${now.has(id) ? ' now' : ''}" data-act="setMove" data-move="${id}" title="${esc(moveTip(mv))}${now.has(id) ? ' It knows this one: picking it swaps the two.' : ''}">${moveFace(mv)}</div>`; }).join('')}</div>`;
  }
  // ---- the battle orders, on the leader's page (0.9.5, update 3): the same settings as in Options
  function ordersHtml() {
    const o = OPTIONS.find((g) => g[0] === 'team')[2].find((r) => r[0] === 'battleStyle')[4];
    return `<div class="sect"${H('What the team does in a fight. These are the same switches as in Options, under Catching and the team; the leader passes them on.')}>Battle orders</div><div class="orders">
      <select data-act="orders" aria-label="Battle orders">${o.map(([v, t]) => `<option value="${v}"${settings.battleStyle === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <label class="tick"><input type="checkbox" data-act="autoBattle"${settings.autoBattle !== false ? ' checked' : ''}> Battle on their own</label>
      <label class="tick"><input type="checkbox" data-act="handsOff"${settings.handsOff ? ' checked' : ''}> Hands off my target</label></div>`;
  }
  function entryHtml(m, team) {
    const i = team.findIndex((x) => x.uid === m.uid), inTeam = i >= 0, spr = m.sprite, max = Math.max(120, ...m.stats);
    const who = m.genderless ? 'no gender' : m.fem ? 'female' : 'male';
    return `
      <h3><span class="name-edit" data-act="rename" title="Its name. Click to rename; leave it empty for the species name.">${esc(m.name)}</span>${m.shiny ? `<span${H('Shiny: a rare colouring')}> ✦</span>` : ''}<small${H(`Level ${m.lvl}, ${who}. ${m.lvl >= 100 ? 'At the top level.' : Math.round(m.xp * 100) + '% of the way to the next level.'}`)}>Lv. ${m.lvl}${gender(m)}</small></h3>
      <div class="sub"${H('Species (if it has a nickname), the title its mark gives it, its nature, and its leadership aptitude. The nature decides the aptitude: a born leader does best in front, a steady one follows well, a free spirit goes its own way more often.')}>${m.nick ? esc(m.species) + ', ' : ''}${m.mark && m.mark.title ? esc(m.mark.title.replace(/^the /, '')) + ', ' : ''}${esc(m.nature)} nature, ${APT[m.apt]}${inTeam ? '' : ', in the Box'}</div>
      <div class="finder" data-turn="${m.sp}:${m.shiny ? 1 : 0}:${m.fem ? 1 : 0}"${H(`${m.species}, number ${m.sp} in the Pokédex${m.shiny ? ', shiny' : ''}${m.alpha ? ', an alpha' : ''}. Drag it left or right to see its other pictures.`)}>${spr ? `<img class="pix" src="${esc(spr)}" alt="">` : ''}<span class="tag"${H(m.hp <= 0 ? 'Fainted. It gets back up after a while; a Revive is quicker.' : m.st ? 'A status condition. It passes with time or medicine.' : '')}>${m.hp <= 0 ? 'fainted' : m.st ? m.st.toUpperCase() : ''}</span></div>
      <div class="types"><span${H('Its type or types. They decide which moves hit it hard and which of its own moves are stronger.')}>${m.types.map(typeTag).join('')}</span> <span${H(`Affection: ${m.hearts} of 5 hearts. Petting, winning and time on the team raise it. It makes a Pokémon listen better, and some only evolve when it is high.`)}>${hearts(m.hearts)}</span></div>
      <dl class="facts">
        <dt${H('Health now, and at most. The team shares medicine from the Bag; petting mends a little.')}>HP</dt><dd${H('Health now, and at most.')}>${m.hp} / ${m.maxHp}</dd>
        <dt${H('How big this one is for its kind, from S to XL, and its height. The smallest and largest earn a mark.')}>Size</dt><dd${H('How big this one is for its kind, and its height.')}>${sizeText(m)}</dd>
        ${inTeam ? `<dt${H(i === 0 ? 'The leader goes first and the team takes its cue from it. Leadership grows as it leads.' : 'How often it does what the battle orders say. Grows with affection and with a good leader.')}>${i === 0 ? 'Leadership' : 'Follows orders'}</dt><dd${H(i === 0 ? 'Leadership level, and how often it listens to you.' : 'The chance that it follows the battle orders.')}>${i === 0 ? `level ${m.leadLevel} of 10, listens to you ${m.obey}%` : m.obey + '%'}</dd>` : ''}
        <dt${H('The item it holds. Give one from the Bag; held items work by themselves in fights.')}>Holding</dt><dd>${m.item ? `<span class="chip btnlike" data-act="take" title="${esc(m.item.text)} Click to put it back in the Bag.">${img(m.item.icon, 'pix')}${esc(m.item.name)}</span>` : `<span${H('It holds nothing. Open the Bag and give it an item.')}>nothing</span>`}</dd>
        <dt${H('The ball it was caught in, and how many fights it has won.')}>Caught in</dt><dd${H(`Caught in a ${X.itemNames[m.ball] || m.ball}${m.metLvl ? ' at level ' + m.metLvl : ''}.${m.wins ? ' Fights won: ' + m.wins + '.' : ''}`)}><span class="chip">${img(m.ballIcon, 'pix')}${esc((X.itemNames[m.ball] || m.ball))}</span>${m.wins ? ` ${m.wins} wins` : ''}</dd>
      </dl>
      ${m.mark || m.ribbons.length ? `<div class="sect"${H('Marks come with a catch (weather, time, size, luck); ribbons are earned.')}>Honours</div><div class="honors">${m.mark ? `<img src="${esc(m.mark.icon || '')}" title="${esc(m.mark.name)}: ${esc(Sprites.mark(m.mark.key) ? m.name + ' ' + m.mark.title : m.mark.title)}" alt="${esc(m.mark.name)}">` : ''}${m.ribbons.map((r) => `<img src="${esc(r.icon || '')}" title="${esc(r.name)}: ${esc(r.text)}" alt="${esc(r.name)}">`).join('')}</div>` : ''}
      ${inTeam && i === 0 ? ordersHtml() : ''}
      <div class="sect"${H('The moves it uses by itself. Click one to change it for another move it knows at its level. A move you chose (✓) stays when it learns a new one.')}>Moves</div><div class="moves">${m.moves.map((mv, k) => `<div class="mv pick${mv.keep ? ' keep' : ''}${picking && picking.uid === m.uid && picking.slot === k ? ' picking' : ''}" data-act="pickMove" data-slot="${k}" title="${esc(moveTip(mv))} Click to change it.">${moveFace(mv)}</div>`).join('')}${m.moves.length < 4 ? `<div class="mv add" data-act="pickMove" data-slot="${m.moves.length}" title="Teach it one more move it knows at its level.">+ a move</div>` : ''}${picking && picking.uid === m.uid ? pickerHtml(m) : ''}</div>
      <div class="sect"${H('Its stats at this level. The number on the right is its individual strength in that stat, from 0 to 31: what it was born with.')}>Stats <span style="float:right;color:var(--ink2)">individual strength, of 31</span></div>${m.stats.map((v, k) => `<div class="stat"${H(`${STAT[k]}: ${v} at level ${m.lvl}. Individual strength ${m.iv ? m.iv[k] : '?'} of 31${m.iv && m.iv[k] >= 30 ? ', outstanding' : m.iv && m.iv[k] <= 5 ? ', weak' : ''}.`)}><span>${STAT[k]}</span><b>${v}</b><i style="--w:${Math.round(clamp(v / max, 0, 1) * 100)}%"></i><em>${m.iv ? m.iv[k] : ''}</em></div>`).join('')}
      <div class="acts">
        ${inTeam ? `<button class="btn go" data-act="leader" ${i === 0 ? 'disabled' : ''}${H(i === 0 ? 'It already leads the team.' : 'Put it at the head of the team. The others take their cue from the leader.')}>Make leader</button>
        <button class="btn" data-act="box" ${team.length <= 1 ? 'disabled' : ''}${H(team.length <= 1 ? 'The last team member stays.' : 'Send it to the Box. It stays yours and can come back any time.')}>Send to Box</button>`
        : `<button class="btn go" data-act="unbox" ${team.length + (state.eggs || 0) >= 6 ? 'disabled' : ''}${H(team.length + (state.eggs || 0) >= 6 ? 'The team is full (an egg takes a place too): drag it onto a team member in the Box screen to swap.' : 'Take it out of the Box and onto the team.')}>Add to team</button>`}
        <button class="btn warn ${armed === m.uid ? 'armed' : ''}" data-act="release" ${inTeam && team.length <= 1 ? 'disabled' : ''}${H('Let it go for good. It asks once more before it happens.')}>${armed === m.uid ? 'Really release?' : 'Release'}</button>
        <label class="tick" title="Stop this Pokémon from evolving"><input type="checkbox" data-act="evoLock" ${m.noEvo ? 'checked' : ''}>No evolving</label>
      </div>`;
  }
  $('partySlots').addEventListener('click', (e) => { if (suppressClick) return; const s = e.target.closest('.slot[data-uid]'); if (s) { sel.party = s.dataset.uid; if ($('stage').classList.contains('open')) { sel.box = sel.party; sig.rail = sig.boxCells = ''; renderBox(true); } armed = null; ui('scroll'); renderParty(true); } });
  function monAction(act, uid, el) {
    const m = monOf(uid);
    if (!m) return;
    if (act === 'rename') {
      const inp = document.createElement('input');
      inp.className = 'rename'; inp.maxLength = 12; inp.value = m.nick || ''; inp.placeholder = m.species;
      el.replaceWith(inp); inp.focus(); inp.select();
      let cancel = false;
      inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') inp.blur(); else if (k.key === 'Escape') { cancel = true; inp.blur(); } });
      inp.addEventListener('blur', () => { if (!cancel) st.cmd({ type: 'rename', uid, name: inp.value }); sig.partyEntry = sig.boxInfo = ''; setTimeout(() => st.requestState(true), 60); }, { once: true });
      return;
    }
    if (act === 'evoLock') { st.cmd({ type: 'evoLock', uid, on: el.checked }); ui('select'); return; }
    if (act === 'pickMove') { const slot = +el.dataset.slot; picking = picking && picking.uid === uid && picking.slot === slot ? null : { uid, slot }; ui('select'); renderParty(true); return; }
    if (act === 'setMove') { if (!picking) return; st.cmd({ type: 'setMove', uid, slot: picking.slot, move: +el.dataset.move }); picking = null; ui('select'); setTimeout(() => st.requestState(true), 60); return; }
    if (act === 'orders' || act === 'autoBattle' || act === 'handsOff') return;      // (changes come through the 'change' listener below)
    if (act === 'release') {
      if (armed !== uid) { armed = uid; ui('error'); render(true); setTimeout(() => { if (armed === uid) { armed = null; render(true); } }, 3500); return; }
      armed = null;
    }
    const cmd = { leader: 'leader', box: 'box', unbox: 'unbox', release: 'release', take: 'takeItem' }[act];
    if (!cmd) return;
    st.cmd({ type: cmd, uid });
    ui(act === 'release' ? 'close' : 'select');
    setTimeout(() => st.requestState(true), 60);
  }
  $('partyEntry').addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && shown) monAction(el.dataset.act, shown, el); });
  $('partyEntry').addEventListener('change', (e) => {      // the battle orders on the leader's page are the Options' own settings
    const a = e.target.dataset.act;
    if (a === 'orders') push({ battleStyle: e.target.value }); else if (a === 'autoBattle') push({ autoBattle: e.target.checked }); else if (a === 'handsOff') push({ handsOff: e.target.checked }); else return;
    ui('select');
  });

  // ---------------------------------------------------------------- bag
  $('pockets').innerHTML = POCKETS.map(([k, n]) => `<button class="pocket" data-pocket="${k}">${n}</button>`).join('');
  $('pockets').addEventListener('click', (e) => { const b = e.target.closest('.pocket'); if (b) { sel.pocket = b.dataset.pocket; ui('bag'); renderBag(true); } });
  function renderBag(force) {
    const bag = state.bag || [], list = bag.filter((it) => sel.pocket === 'all' || POCKET_OF[it.kind] === sel.pocket), total = bag.reduce((a, it) => a + it.n, 0);
    $('bagCount').textContent = total ? String(total) : '';
    document.querySelectorAll('.pocket').forEach((p) => p.classList.toggle('on', p.dataset.pocket === sel.pocket));
    if (!list.some((it) => it.key === sel.bag)) sel.bag = list[0] ? list[0].key : null;
    if (changed('bagTiles', [list.map((it) => [it.key, it.n, it.equipped]), sel.bag]) || force) {
      $('bagTiles').innerHTML = list.length ? list.map((it) => `<button class="tile ${it.key === sel.bag ? 'sel' : ''} ${it.equipped ? 'eq' : ''}" data-key="${esc(it.key)}" title="${esc(it.name)}">${img(it.icon, 'pix', it.name)}<b>${it.n > 1 ? '×' + it.n : ''}</b></button>`).join('')
        : `<div class="empty" style="grid-column:1/-1">${bag.length ? 'Nothing in this pocket.' : 'Your Bag is empty.<br>Now and then a wild Pokémon leaves an item behind when it is beaten or caught.'}</div>`;
    }
    const it = list.find((x) => x.key === sel.bag), team = state.team;
    if (!changed('bagEntry', [it, team.map((m) => [m.uid, m.name, m.item && m.item.key])]) && !force) return;
    if (!it) { $('bagEntry').innerHTML = ''; return; }
    const who = (m, on, act, extra = '') => `<button class="chip btnlike" data-act="${act}" data-uid="${esc(m.uid)}" ${on ? '' : 'disabled style="opacity:.35;box-shadow:none;cursor:default"'}>${img(m.icon, 'pix')}${esc(m.name)}${extra}</button>`;
    let html = `<div class="itemhead">${img(it.icon, 'pix')}<div><h3>${esc(it.name)}</h3><div class="rarity">${TIER[it.tier] || ''}, you have ${it.n}</div></div></div><p style="margin:10px 0 0">${esc(it.text)}</p>`;
    if (it.isBall) html += `<div class="acts"><button class="btn go" data-act="equip">${it.equipped ? 'Stop using them' : 'Use for my next throws'}</button></div><p class="sub">${it.equipped ? 'In use: every throw uses one until they run out. Then it is back to the Poké Ball, or to the next stack in the Bag.' : 'The plain Poké Ball is your standard ball and never runs out. Balls you find come in stacks of 10 to 100 and are used up.'}</p>`;
    if (!it.isBall && it.kind !== 'held') html += `<div class="sect">Use on</div><div class="chips">${team.length ? team.map((m) => who(m, it.targets.includes(m.uid), 'use')).join('') : '<span class="sub">You need a partner first.</span>'}</div>${team.length && !it.targets.length ? '<p class="sub">It would have no effect on anyone right now.</p>' : ''}`;
    if (it.canHold) html += `<div class="sect">Give to hold</div><div class="chips">${team.length ? team.map((m) => who(m, !(m.item && m.item.key === it.key), 'give', m.item ? ` <small style="color:var(--ink2)">(${esc(m.item.name)})</small>` : '')).join('') : '<span class="sub">You need a partner first.</span>'}</div>`;
    html += `<div class="acts"><button class="btn warn" data-act="toss">Toss one</button></div>`;
    $('bagEntry').innerHTML = html;
  }
  $('bagTiles').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) { sel.bag = t.dataset.key; ui('scroll'); renderBag(true); } });
  $('bagTiles').addEventListener('dblclick', (e) => {      // a double-click on a ball: throw these next (0.9.5, update 9)
    const t = e.target.closest('.tile'), it = t && (state.bag || []).find((x) => x.key === t.dataset.key);
    if (!it || !it.isBall) return;
    st.cmd({ type: 'equipBall', item: it.key, on: true }); ui('select');
    setTimeout(() => st.requestState(false), 60);
  });
  $('bagEntry').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !sel.bag) return;
    const type = { use: 'useItem', give: 'giveItem', equip: 'equipBall', toss: 'tossItem' }[b.dataset.act];
    st.cmd({ type, item: sel.bag, uid: b.dataset.uid });
    if (type === 'tossItem') ui('drop');
    setTimeout(() => st.requestState(false), 60);
  });

  // ---------------------------------------------------------------- trainer card
  function renderTrainer() {
    const s = state.stats, d = state.dex, earned = state.badges.filter((b) => b.earned).length;
    if (!changed('trainer', [s, d.seen, d.caught, state.badges.map((b) => [b.earned, b.retry]), state.ball, state.ballLeft])) return;
    const days = Math.max(1, Math.round((Date.now() - (state.started || Date.now())) / 864e5));
    $('trainerSince').textContent = `day ${days}`;
    const fig = (v, label) => `<div class="fig"><b>${Number(v || 0).toLocaleString('en-US')}</b><span>${label}</span></div>`;
    $('trainerBody').innerHTML = `
      <div class="figures">${fig(d.caught, 'species caught')}${fig(d.seen, 'species seen')}${fig(s.caught, 'Pokémon caught')}${fig(s.shiny, 'shinies caught')}${fig(s.ko, 'wild Pokémon beaten')}${fig(s.alpha, 'alphas caught')}${fig(s.items, 'items found')}${fig(s.pets, 'pets given')}</div>
      <p style="margin:12px 0 0" class="chip">${img(state.ballIcon, 'pix')}Throwing: ${esc(state.ball)}${state.ballSpecial ? ` ×${state.ballLeft || 0}` : ''}</p>
      <span class="sub"> ${state.ballSpecial ? 'A stack you found. When it runs out it is back to the Poké Ball.' : 'Your standard ball. Better ones are found, 10 to 100 at a time (Master Balls: 1 to 10).'}</span>
      <div class="sect">Badges <span style="float:right;color:var(--ink2)">${earned} of ${state.badges.length}</span></div>
      <div class="badges">${state.badges.map((b) => `<div class="badge ${b.earned ? 'earned' : 'locked'}">${img(b.icon, '', b.name)}<div><b>${esc(b.name)}</b>${esc(b.text)}${b.retry ? `<button class="btn" data-rematch="1" title="Gym Leader ${esc(b.leader)} comes back for another battle, right now.">Rechallenge ${esc(b.leader)}</button>` : ''}</div></div>`).join('')}</div>`;
  }
  $('trainerBody').addEventListener('click', (e) => { if (e.target.closest('[data-rematch]')) { st.cmd({ type: 'rematch' }); ui('select'); } });

  // ---------------------------------------------------------------- options (one line per setting)
  // A category: [id, title, rows]. The id is what the setting optClosed remembers when the category is folded shut.
  // A row: [key, kind, label, hint, extra]  kinds: check | range [min, max, step, format] | select [[value, label]...] | number
  // A row whose key starts with @ is a special control, built by hand in buildOptions.
  const pct = (v) => Math.round(v * 100) + '%', secs = (v) => (v < 60 ? v + ' s' : (v / 60).toFixed(v % 60 ? 1 : 0) + ' min');
  const OPTIONS = [
    ['howto', 'How-to videos', [['@howto']]],      // (1.0) the clips in the howto folder; locked until the sprites folder is found
    ['sound', 'Sound', [
      ['mute', 'check', 'Mute', 'Silence everything. The same switch is on the device and in the tray menu.'],
      ['masterVolume', 'range', 'All of Screen Trainer', 'One slider for everything Screen Trainer plays, before the ones below. (Games on the MyStream stage have their own sliders in MyStream.)', [0, 1, 0.05, pct]],
      ['sfxVolume', 'range', 'Sound effects', '', [0, 1, 0.05, pct]],
      ['musicVolume', 'range', 'Music', '', [0, 1, 0.05, pct]],
      ['music', 'check', 'Play music', ''],
      ['battleMusic', 'check', 'Battle music during fights', 'Switches to a battle theme while the team, or you, are fighting.'],
      ['musicShuffle', 'check', 'Change track every few minutes', 'Off: one track keeps looping until you press random or next.'],
      ['cries', 'check', 'Pokémon cries', ''],
      ['criesVolume', 'range', 'Cries', 'How loud the Pokémon cries are, next to the other sound effects.', [0, 1, 0.05, pct]],
      ['@bank'],
    ]],
    ['team', 'Catching and the team', [
      ['handsOff', 'check', 'Hands off my target', 'The team completely ignores the Pokémon you are clicking, and it ignores them.'],
      ['battleStyle', 'select', 'Battle orders', 'Only obedient team members hold back.', [['smart', 'Weaken new species and shinies'], ['catch', 'Always weaken, never knock out'], ['ko', 'Always knock out for experience']]],
      ['autoBattle', 'check', 'Battle on their own', 'Off: the team only fights what you click or what attacks them.'],
      ['autoMedicine', 'check', 'Share medicine in fights', 'The team uses potions, revives and cures from the Bag by itself.'],
      ['roam', 'select', 'Strolling', '', [['stroll', 'Stroll freely'], ['follow', 'Follow my cursor'], ['stay', 'Stay where I put them']]],
      ['evolve', 'check', 'Allow evolution', ''],
      ['megaDynamax', 'check', 'Mega Evolution and Dynamax', 'When the team fights to knock out, one member at a time changes for a while: a Mega Evolution if its kind has one and your sprites include its picture, else Gigantamax or Dynamax. The thin bar under a health bar is its charge.'],
      ['xpRate', 'range', 'Experience', 'How fast the team levels up from fights and catches. 1× is as in the games.', [0, 10, 0.25, (v) => (v > 0 ? v + '×' : 'None')]],
      ['walkSpeed', 'range', 'Walking speed', 'How fast everyone walks and runs: your team, wild Pokémon and visitors. Slower makes the world feel bigger.', [0.2, 2, 0.05, pct]],
      ['moveSpeed', 'range', 'Move use speed', 'How often Pokémon use their moves in a fight. Lower is a calmer battle that lasts longer.', [0.25, 3, 0.05, pct]],
    ]],
    ['wild', 'Wild encounters', [
      ['shinyOdds', 'number', 'Shiny odds', 'One in this many wild Pokémon is shiny.'],
      ['spawnEvery', 'range', 'Time between encounters', '', [5, 180, 5, secs]],
      ['maxWild', 'range', 'Most wild Pokémon at once', 'Counts encounters only, not the ones that have settled in.', [1, 10, 1, (v) => v]],
      ['maxLoiter', 'range', 'Wild Pokémon that stay', 'A wild Pokémon nobody is fighting settles in and strolls about instead of leaving, and about four in ten come in peace from the start. The team leaves them alone; click one to make an encounter of it. When the limit is reached the one that has been around longest moves on.', [0, 40, 1, (v) => (v > 0 ? 'up to ' + v : 'None stay')]],
      ['itemDrops', 'check', 'Item drops', 'Wild Pokémon sometimes leave an item behind.'],
      ['groupFreq', 'select', 'Groups of one kind', 'Now and then a wild Pokémon comes with a group of its own kind (once your team has three). They stick together and defend their ground.', [['off', 'Never'], ['rare', 'Rarely'], ['sometimes', 'Now and then'], ['often', 'Often']]],
      ['groupMax', 'range', 'Group size', 'The largest a group can be. Groups come in this size or up to two fewer.', [2, 10, 1, (v) => 'up to ' + v]],
      ['variety', 'range', 'Variety', 'Left: the usual mix, where common Pokémon come more often than rare ones. Further right: rare ones come about as often as common ones, and the same kind is less likely to come twice in a row.', [0, 10, 1, (v) => (v > 0 ? (v >= 10 ? 'Every kind alike' : 'More varied ' + v) : 'Usual mix')]],
      ['timeSpawns', 'check', 'Follow my clock', 'From 9 in the evening to 5 in the morning mostly night-time Pokémon come (Ghost and Dark types, Zubat, Hoothoot, Oddish, Clefairy and others); by day most of them sleep. Off: the time makes no difference.'],
      ['clickPower', 'range', 'Click strength', 'How much a click on a wild Pokémon weakens it. A click never knocks one out: only your team can.', [0.25, 4, 0.25, (v) => v + '×']],
      ['befriendPower', 'range', 'Befriending legendaries', 'How quickly petting a friendly legendary earns its trust.', [0.25, 4, 0.25, (v) => v + '×']],
      ['weatherFreq', 'range', 'Random weather', 'Rain, sun, snow, sand and hail from the sky. It strengthens and weakens moves and decides weather marks, and hurts nobody.', [0, 10, 1, (v) => Events.weatherLabel(v)]],
      ['weatherFixed', 'select', 'Weather all the time', 'Choose one and it stays for as long as this is set. Snow settles in patches and rain leaves puddles for a little while. Random weather waits meanwhile.', [['off', 'No: random weather as set above'], ['sun', 'Sunshine'], ['rain', 'Rain'], ['snow', 'Snow'], ['hail', 'Hail'], ['sand', 'Sandstorm']]],
      ['legendEvents', 'select', 'Legendary visits', 'Some are friendly, some pick a fight, some dodge your pointer. All of them can be caught.', [['off', 'Never'], ['rare', 'Rare, about once an hour'], ['sometimes', 'Now and then, about every half hour'], ['often', 'Often, about every ten minutes']]],
      ['trainerBattles', 'select', 'Trainer battles', 'Another Trainer hops in as a pointer of its own with a team of six. They never start it: click one of their Pokémon to battle (your leader goes for that one; double-click another to switch). Now and then it is a Gym Leader, for your next badge.', [['off', 'Never'], ['rare', 'Rare, about every 40 minutes'], ['sometimes', 'Now and then, about every quarter of an hour'], ['often', 'Often, about every six minutes']]],
      ['@gens'],
      ['paused', 'check', 'Pause wild encounters', 'Your team keeps strolling.'],
    ]],
    ['overlay', 'Overlay', [
      ['opacity', 'range', 'Transparency', 'How see-through everything on the overlay is.', [0.1, 1, 0.01, pct]],
      ['scale', 'range', 'Sprite size', '', [0.1, 4, 0.1, (v) => (+v).toFixed(1) + '×']],
      ['sizeMode', 'select', 'Pokémon sizes', 'To scale: a metre is a metre for every species, so Wailord towers and Joltik is tiny. Each Pokémon is also Small to Extra large for its kind.', [['true', 'To scale'], ['balanced', 'Balanced, gentler differences'], ['sprite', 'As the sprites are drawn']]],
      ['spriteStyle', 'select', 'Sprite set', 'Falls back to another set when a sprite is missing.', [['showdown', 'Animated'], ['bw', 'Animated pixel'], ['static', 'Still sprites']]],
      ['toasts', 'select', 'Notifications', 'Catches, shinies, items and badges.', [['cards', 'Cards with pictures'], ['text', 'One line of text'], ['off', 'Off']]],
      ['fxLevel', 'select', 'Attack effects', '', [['low', 'Subtle'], ['normal', 'Normal'], ['chaos', 'Full chaos']]],
      ['labels', 'select', 'Team name tags', '', [['auto', 'In battle and on hover'], ['always', 'Always'], ['never', 'Only on hover']]],
      ['moveNames', 'check', 'Show move names', ''],
      ['myCursor', 'check', 'My pointer is the mouse', 'Over your Pokémon and in the field window the mouse looks like your own pointer, the one you chose in MyStream or the online window. It is won in the game.'],
      ['alwaysOnTop', 'check', 'Stay on top', 'Draw over every window, including the taskbar.'],
      ['visible', 'check', 'Show overlay', 'Quick toggle: Ctrl + Alt + P'],
      ['autoStart', 'check', 'Launch on startup', 'Start quietly when Windows starts.'],
      ['@display'], ['@sprites'],
    ]],
    ['field', 'Field (windowed mode)', [
      ['field', 'check', 'Show the field', 'A window you can move and resize, with a field in it. While it is open your team stays inside and wild Pokémon come in over its edges. Close it and only the barriers go: everyone roams the whole screen until you create the field again.'],
      ['fieldSquare', 'check', 'Fountain Square', 'The fountain with the Poké Center, the pipe to the Box, the Day Care and the trade pads stands in the middle of the field, the same square as on the MyStream stage. The field\'s world is then at least 1280 by 720: drag the grass to look around.'],
      ['@zoom'],
      ['boxFieldMax', 'range', 'Pokémon in the Box Field', 'While the Box is open the field shows the Pokémon in it, each on its own share of the ground. Every species in the Box is shown first; this is the most there can be on the field at once.', [10, 1025, 5, (v) => 'up to ' + v]],
      ['@field'],
    ]],
    ['android', 'Android app', [['@android']]],
    ['online', 'Online', [['@online']]],
    ['share', 'Share Screen Trainer', [['@share']]],
    ['phone', 'This phone', [
      ['bgTrain', 'check', 'Train with the screen off', 'The team carries on while the screen is dark or another app is in front. Android shows a small "training" notice while it does. Close the app (swipe it away) to stop completely. Uses the battery steadily.'],
    ]],
    ['guardian', 'Mewtwo, your computer guardian', [
      ['guardian', 'check', 'Show Mewtwo on the screen', 'The XXL Super Alpha. Drag it wherever you like; click it to open its window.'],
      ['guardianAlerts', 'check', 'Mewtwo speaks up', 'When one of its checks finds something that needs you.'],
      ['@guardian'],
    ]],
    ['window', 'This window', [
      ['theme', 'select', 'Look', '', [['glass', 'Night glass'], ['classic', 'Classic LCD']]],
      ['hints', 'select', 'Hints', 'Where the explanations are: kept out of the way until the mouse rests on something, or written out under every option and on the team page.', [['hover', 'When the mouse rests on something'], ['always', 'Always written out']]],
      ['contrast', 'select', 'Windows contrast theme', 'Only matters while a contrast theme is switched on in Windows. Such a theme strips programs of their own colours, which leaves this device without a body.', [['own', 'Keep the device\'s own colours'], ['system', 'Use the Windows colours']]],
    ]],
    ['save', 'Save data', [['@savefile'], ['@rope'], ['@import'], ['@reset']]],
    ['mods', 'Mods and forks', [['@mods'], ['@forks']]],      // (1.0)
  ];
  function buildOptions() {
    const row = (label, hint, ctl, id) => `<div class="set"><label ${id ? `for="${id}"` : ''}>${label}${hint ? `<small>${hint}</small>` : ''}</label><div class="ctl">${ctl}</div></div>`;
    // every category has a fold button for a heading; "Fold all" and "Open all" sit above the first one
    const head = (id, title, n) => `<h3><button class="fold" data-fold="${id}" aria-expanded="true" aria-controls="grp-${id}" title="Fold or open this category"><span class="chev" aria-hidden="true"></span><span class="ft">${title}</span><small>${n}</small></button></h3>`;
    $('optBody').innerHTML = `<div class="foldbar"><button class="btn" id="foldAll">Fold all</button><button class="btn" id="foldNone">Open all</button></div>` + OPTIONS.map(([id, title, rows]) => `<div class="group" data-group="${id}">${head(id, title, rows.length)}<div class="gbody" id="grp-${id}">${rows.map(([k, kind, label, hint, x]) => {
      if (k === '@field') return `<div class="set"><label>The ground<small id="fieldNote"></small></label><div class="ctl"><output id="fieldSeed" style="min-width:86px"></output></div></div>`;
      if (k === '@zoom') return row('Zoom levels allowed', 'Turn the mouse wheel over the field to step through the levels ticked here. Untick all but one and the field cannot be zoomed.', `<div class="gens zooms" id="zooms">${ZOOMS.map((z) => `<label title="${Math.round(z * 100)}%"><input type="checkbox" value="${z}" aria-label="Zoom ${Math.round(z * 100)}%"><span>${Math.round(z * 100)}</span></label>`).join('')}</div>`);
      if (k === '@android') return `<div class="set"><label>Export an Android app<small>Packs the game into an app for your phone or tablet. It starts with the options exactly as they are set now, and every option can be changed in the app as well. Only the generations switched on now are packed, so only those can be chosen there. The pictures it needs are packed from your own sprites folder, so the file is for your own devices.</small></label><div class="ctl"><button class="btn go" id="exportApk">Export APK…</button></div><div class="path" id="exportNote"></div></div>
        <div class="set"><label for="exSave">Take my team and Pokédex along<small>Off: the app starts with nothing caught. On: installing it over an earlier export replaces the progress made on the device.</small></label><div class="ctl"><input type="checkbox" id="exSave" checked></div></div>
        <div class="set"><label for="exSounds">Take my game sounds along<small>The sound bank made from your ROM. Off, or without one: the built-in sounds.</small></label><div class="ctl"><input type="checkbox" id="exSounds" checked></div></div>`;
      if (k === '@gens') return row('Generations', 'Which generations wild Pokémon come from. At least one stays on.', `<div class="gens" id="gens">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `<label title="Generation ${g}: ${GEN_REGION[g]}"><input type="checkbox" value="${g}" aria-label="Generation ${g}, ${GEN_REGION[g]}"><span>${g}</span></label>`).join('')}<button class="btn" id="gensAll" title="Turn every generation on">All</button></div>`);
      if (k === '@guardian') return `<div class="set"><label>Mewtwo's window<small>Defender, updates, tune-up profiles and questions. Also in the tray menu.</small></label><div class="ctl"><button class="btn go" id="openGuardian">Open…</button></div></div>`;
      if (k === '@display') return row('Display', '', `<select id="display">${info.displays.map((d) => `<option value="${d.i}">${esc(d.label)}</option>`).join('')}</select>`, 'display');
      if (k === '@sprites') return `<div class="set"><label>Sprites folder<small>The folder that holds “pokemon” and “items”.</small></label><div class="ctl"><button class="btn" id="pick">Choose folder…</button></div><div class="path" id="spritesPath"></div></div>`;
      if (k === '@bank') return `<div class="set"><label>Game sounds<small id="bankNote"></small></label><div class="ctl"><button class="btn go" id="importRom">Import from ROM…</button><button class="btn" id="removeBank" hidden>Remove</button></div><div class="path" id="bankPath"></div></div>`;
      if (k === '@online') return `<div class="set"><label>Visit other Trainers<small>Opens the online window: visit a random Trainer or a friend, choose who may visit you, your class and your pointer. Switched off until you switch it on there. The ball on top of the fountain opens it too.</small></label><div class="ctl"><button class="btn go" id="openOnline">Online…</button></div></div>`;
      if (k === '@share') return `<div class="set"><label>Export an empty copy<small>Packs the program into one zip file for somebody else, with nothing of yours in it: no sprites, no game sounds, no save and none of your settings. They unzip it, choose a sprites folder of their own and, if they like, import the sounds from their own ROM. A "READ ME FIRST" file in it says how.</small></label><div class="ctl"><button class="btn go" id="exportShare">Export zip…</button></div><div class="path" id="shareNote"></div></div>`;
      if (k === '@import') return `<div class="set"><label>Import a team<small>Bring Pokémon in from a team written in Pokémon Showdown's text format, or from a list of names you type. You see what would be added, and can change it, before anything is.</small></label><div class="ctl"><button class="btn go" id="openImport">Import…</button></div></div>`;
      if (k === '@savefile') return `<div class="set"><label>Saved games<small>Your whole game in one small file (a few kilobytes), sealed so that only Screen Trainer can read it. Keep it somewhere safe, or take it to a new computer: load it there into a fresh Screen Trainer. Loading keeps the game you have now as a backup first.</small></label><div class="ctl"><button class="btn go" id="saveExport">Save game…</button><button class="btn" id="savePick">Load a saved game…</button></div><div class="path" id="saveNote"></div></div>`;
      if (k === '@rope') return `<div class="set"><label>Escape Rope<small>Packs your whole Screen Trainer folder into one zip to take along: the program, your sprites and sounds and anything else you put in that folder, your saved game and your options. You choose where the zip goes; then Screen Trainer closes and packs, and shows the zip when it is done. Nothing in the folder is changed.</small></label><div class="ctl"><button class="btn go" id="ropeGo">Escape Rope…</button></div><div class="path" id="ropeNote"></div></div>`;
      if (k === '@howto') return `<div class="set"><label>How-to videos<small>Short videos where the Pokémon of each part of Screen Trainer show you how it works. They open in your computer's own video player.</small></label></div><div id="howtoList" class="modlist"></div>`;
      if (k === '@mods') return `<div class="set"><label>Mods<small>A mod is a folder in the "mods" folder with a mod.json in it: new starting options, more or fewer of some Pokémon, Field Dex colours. Each is checked first and is off until you switch it on here; switching it off puts back what it changed. The README in the mods folder explains how to write one.</small></label><div class="ctl"><button class="btn" id="modsAgain">Look again</button><button class="btn" id="modsFolder">Open folder</button><button class="btn warn" id="modsOff">All off</button></div></div><div id="modsList" class="modlist"></div>`;
      if (k === '@forks') return `<div class="set"><label>Forks<small>A fork is a full copy of the program in the "forks" folder, with a save of its own: change its files and try it out beside the real game without any danger to it. It runs with its own tray icon; throwing it away puts it in the Recycle Bin.</small></label><div class="ctl"><button class="btn go" id="forkSave">Fork with my game</button><button class="btn" id="forkFresh">Fork, fresh</button><button class="btn" id="forkFolder">Open folder</button></div></div><div id="forkList" class="modlist"></div>`;
      if (k === '@reset') return `<div class="set"><label>Start over<small>Releases everything and clears your Pokédex, Bag and badges.</small></label><div class="ctl"><button class="btn warn" id="reset">Reset save…</button></div><div class="path" id="saveDir"></div></div>`;
      if (kind === 'check') return row(label, hint, `<input type="checkbox" id="${k}" data-set="${k}">`, k);
      if (kind === 'range') return row(label, hint, `<input type="range" id="${k}" data-set="${k}" min="${x[0]}" max="${x[1]}" step="${x[2]}"><output id="${k}Out"></output>`, k);
      if (kind === 'select') return row(label, hint, `<select id="${k}" data-set="${k}">${x.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>`, k);
      return row(label, hint, `1 in <input type="number" id="${k}" data-set="${k}" min="1" max="100000" step="1">`, k);
    }).join('')}</div></div>`).join('');
    // every option's explanation is also its mouse-over hint; with Hints set to "when the mouse rests on something"
    // (the default since 0.7) that is the only place it shows (panel.css hides the written-out ones)
    for (const s of $('optBody').querySelectorAll('.set')) { const h = s.querySelector('label > small:not([id])'); if (h && !s.title) s.title = h.textContent; }
  }
  const GROUPS = OPTIONS.map((g) => g[0]);
  /** fold the categories shut that the setting optClosed lists */
  function applyFolds() {
    const closed = new Set(settings.optClosed || []);
    for (const g of document.querySelectorAll('#optBody .group')) {
      const shut = closed.has(g.dataset.group);
      g.classList.toggle('closed', shut);
      g.querySelector('.fold').setAttribute('aria-expanded', String(!shut));
    }
    $('foldAll').disabled = closed.size >= GROUPS.length; $('foldNone').disabled = !closed.size;
  }
  const DEFS = Object.fromEntries(OPTIONS.flatMap(([, , rows]) => rows.filter((r) => r[1]).map((r) => [r[0], r])));
  // the field's seed: worked out from the caught species exactly as the field window does (src/field.js)
  const typesOf = (sp) => (D.dex[sp] ? D.dex[sp].t.map((t) => D.types[t]) : []);
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];              // the zoom levels that can be allowed (ZOOM_CHOICES in defaults.js)
  function fillField() {
    if (!$('fieldSeed') || typeof Field === 'undefined') return;
    const g = (state && state.ground) || { kind: 'team', list: ((state && state.team) || []).map((m) => m.sp) };
    const plan = Field.partyPlan(g.list, typesOf, { min: g.kind === 'team' ? 6 : 1 });
    if (!changed('fieldSeed', [plan.seed, plan.species, g.kind, state && state.field, settings.fieldZoomAt])) return;
    $('fieldSeed').textContent = Field.seedText(plan.seed);
    $('fieldNote').textContent = `${g.kind === 'box' ? 'The Box is open: the ground is grown from the Pokémon in it.' : 'The ground is grown from your team.'} ${Field.describeParty(plan)} Standing on ground of a move's type makes the move stronger.${state && state.field ? ` The field's world is ${state.field.w} by ${state.field.h} right now, seen at ${Math.round((settings.fieldZoomAt || 1) * 100)}%.` : ''}`;
  }
  // Android export: what would go into the app, then the export itself
  let shareWatch = false;
  let exportBusy = false, exportKeep = 0;                    // exportKeep: until when the result of an export stays on show
  const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  async function fillExport(result) {
    if (!$('exportNote') || !st.exportInfo || exportBusy) return;
    if (result) exportKeep = Date.now() + 120000; else if (Date.now() < exportKeep) return;
    if (result && result.ok) { $('exportNote').innerHTML = `<span class="good">Written:</span> ${esc(result.file)}<br>${mb(result.bytes)}, ${result.files.toLocaleString('en-US')} files, signed. Copy it to the device and open it there; Android asks once whether to allow installing from that app.`; return; }
    if (result && result.error) { $('exportNote').innerHTML = `<span class="bad">${esc(result.error)}</span>`; return; }
    const i = await st.exportInfo(), p = i && i.plan;
    if (!p || !p.ok) { $('exportNote').innerHTML = `<span class="bad">${esc((p && p.error) || 'The export is not available.')}</span>`; $('exportApk').disabled = true; return; }
    $('exportApk').disabled = false;
    $('exportNote').textContent = `About ${mb(p.bytes)}: ${p.sprites.toLocaleString('en-US')} pictures of ${p.species} species${p.gens ? ' (generations ' + p.gens.join(', ') + ' and what they evolve into)' : ''}${p.bank ? ', your game sounds' : ''}. Sprite size ${(+settings.scale).toFixed(1)}×.${i.last ? ' Last export: ' + i.last.file : ''}`;
  }
  let exportT = 0;
  const push = (patch) => st.setSettings(patch).then((s) => { settings = s; applyTheme(); fillOptions(); renderDeck(); clearTimeout(exportT); exportT = setTimeout(() => { if (tab === 'options') fillExport(); }, 500); });
  function fillOptions() {
    for (const k in DEFS) {
      const el = $(k), [, kind, , , x] = DEFS[k];
      if (!el) continue;
      if (kind === 'check') { el.checked = !!settings[k]; continue; }      // (a tick box always shows the truth, focused or not: the field window's own X turns "Show the field" off, 0.9.3)
      if (document.activeElement === el) continue;      // (a box being typed in, or a slider being held, is not changed under the hand)
      else { el.value = settings[k]; if (kind === 'range') $(k + 'Out').textContent = x[3](+el.value); }
    }
    document.querySelectorAll('#gens input').forEach((c) => { c.checked = (settings.gens || []).includes(+c.value); });
    document.querySelectorAll('#zooms input').forEach((c) => { c.checked = (settings.zoomLevels || [1]).includes(+c.value); });
    // The Android app shows every option that means something on a phone; the PC hides the phone's own.
    const phone = !!info.android, NOT_ON_PHONE = ['alwaysOnTop', 'visible', 'autoStart', 'display', 'pick', 'importRom', 'contrast', 'ropeGo'];
    for (const g of document.querySelectorAll('#optBody .group')) g.hidden = phone ? g.dataset.group === 'field' || g.dataset.group === 'android' || g.dataset.group === 'share' || g.dataset.group === 'online' || g.dataset.group === 'mods' || g.dataset.group === 'howto' : g.dataset.group === 'phone';
    if (phone) {
      for (const id of NOT_ON_PHONE) { const el = $(id), rowEl = el && el.closest('.set'); if (rowEl) rowEl.hidden = true; }
      if (info.packedGens) document.querySelectorAll('#gens label').forEach((l) => { l.hidden = !info.packedGens.includes(+l.querySelector('input').value); });
      const g = $('openGuardian'), gl = g && g.closest('.set').querySelector('small'); if (gl) gl.textContent = 'What Mewtwo can tell about this device: battery, storage, whether training goes on with the screen off.';
    }
    if ($('display')) $('display').value = String(settings.display || 0);
    const sets = info.spriteSets || {};
    for (const o of $('spriteStyle').options) o.disabled = info.spritesOk && !sets[o.value];
    $('spritesPath').innerHTML = info.spritesOk ? `<span class="good">Found</span> ${esc(info.spritesPath)}` : '<span class="bad">Not found.</span> Choose the folder that contains the “pokemon” and “items” folders.';
    $('saveDir').textContent = 'Saved in ' + info.saveDir;
    const snd = state && state.sound, bank = snd && snd.bank;
    $('bankNote').textContent = bank ? `Using sounds, cries and music imported from ${bank.game}.` : 'Using the built-in sounds. Import once from a FireRed or LeafGreen ROM you own to get the game\'s own effects, cries and music.';
    $('bankPath').textContent = info.bank ? info.bank.file : '';
    $('removeBank').hidden = !(info.bank && info.bank.source === 'imported');
    $('importRom').textContent = bank ? 'Import again…' : 'Import from ROM…';
    $('optHint').textContent = info.packaged ? '' : 'Development run: launch on startup is inactive.';
    $('about').textContent = `Screen Trainer ${info.version}. A personal fan project. Sprites and game sounds are read from your own files and are not part of the program.`;
    applyFolds(); fillField(); fillHowto();
  }
  async function refreshInfo() { info = await st.info(); showVersion(); document.body.classList.toggle('onstream', !!info.myStream); fillOptions(); }      // (MyStream is open: panel.css blurs the paths)
  buildOptions();
  // (1.0) mods and forks: the lists under Options > Mods and forks
  function fillMods(v) {
    const box = $('modsList'); if (!box) return;
    if (!v) { box.innerHTML = ''; return; }
    box.innerHTML = v.mods.length ? v.mods.map((m) => `<div class="set mod${m.ok ? '' : ' broken'}"><label>${esc(m.name)}${m.version ? ` <i>${esc(m.version)}</i>` : ''}<small>${m.ok ? `${m.author ? 'by ' + esc(m.author) + '. ' : ''}${esc(m.description || '')}${m.changes ? ` <b>Changes: ${esc(m.changes)}.</b>` : ''}` : `<span class="bad">Not used, it has a mistake (folder "${esc(m.folder)}"):</span><br>${m.errors.map(esc).join('<br>')}`}</small></label><div class="ctl"><input type="checkbox" data-mod="${esc(m.id)}" aria-label="Use ${esc(m.name)}" ${m.on ? 'checked' : ''} ${m.ok ? '' : 'disabled'}></div></div>`).join('')
      : `<p class="small">No mods yet. Put a mod's folder into ${esc(v.dir)} and press Look again.</p>`;
  }
  // (1.0) how-to videos: locked until the sprites folder is found (the videos show real Pokémon pictures)
  async function fillHowto() {
    const box = $('howtoList'); if (!box || !st.howto) return;
    const h = await st.howto();
    if (!h.clips.length) { box.innerHTML = '<p class="small">This copy has no how-to videos. They come in a folder called "howto" beside the program.</p>'; return; }
    if (h.locked) { box.innerHTML = `<p class="small">🔒 ${h.clips.length} videos are waiting. Choose your sprites folder first (Overlay > Sprites folder) and they unlock.</p>`; return; }
    box.innerHTML = h.clips.map((c) => `<div class="set mod"><label>${esc(c.title)}</label><div class="ctl">${[['gif', 'Loop'], ['s10', '10 s'], ['s30', '30 s']].filter(([k]) => c.files[k]).map(([k, n]) => `<button class="btn" data-howto="${esc(c.key)}" data-kind="${k}">${n}</button>`).join('')}</div></div>`).join('');
  }
  async function fillForks() {
    const box = $('forkList'); if (!box || !st.forks) return;
    const f = await st.forks();
    if (f.fork) { box.innerHTML = `<p class="small">This is the fork "${esc(f.fork)}". Forks are made and started from the main game.</p>`; for (const id of ['forkSave', 'forkFresh']) if ($(id)) $(id).disabled = true; return; }
    box.innerHTML = f.list.length ? f.list.map((x) => `<div class="set mod"><label>${esc(x.name)}<small>made from ${esc(x.from || '?')}, ${esc((x.made || '').slice(0, 10))}</small></label><div class="ctl"><button class="btn go" data-fork-start="${esc(x.name)}">Start</button><button class="btn warn" data-fork-trash="${esc(x.name)}">Throw away…</button></div></div>`).join('') : '<p class="small">No forks yet.</p>';
  }
  if (st.modsView) { st.modsView(false).then(fillMods); fillForks(); }
  if (st.onForks) st.onForks(() => fillForks());
  // a mod's Field Dex colours: set on the page as the panel.css variables they name (only colours: mods.js checked them)
  let modColors = [];
  function applyModColors(fx) {
    const root = document.documentElement.style;
    for (const k of modColors) root.removeProperty('--' + k);
    modColors = Object.keys((fx && fx.colors) || {});
    for (const k of modColors) root.setProperty('--' + k, fx.colors[k]);
  }
  if (st.modsFx) st.modsFx().then(applyModColors);
  if (st.onMods) st.onMods((fx) => { applyModColors(fx); if (st.modsView) st.modsView(false).then(fillMods); });
  $('optBody').addEventListener('input', (e) => {
    const k = e.target.dataset.set, def = DEFS[k];
    if (!def || def[1] !== 'range') return;
    $(k + 'Out').textContent = def[4][3](+e.target.value);
    clearTimeout(e.target._t); e.target._t = setTimeout(() => push({ [k]: +e.target.value }), 60);
  });
  $('optBody').addEventListener('change', (e) => {
    const el = e.target, k = el.dataset.set, def = DEFS[k];
    if (el.dataset.mod && st.modsSet) { st.modsSet(el.dataset.mod, el.checked).then((v) => { fillMods(v); ui('select'); }); return; }      // (1.0) a mod switched on or off
    if (el.closest('#gens')) { const gens = [...document.querySelectorAll('#gens input:checked')].map((c) => +c.value); if (gens.length) push({ gens }); else fillOptions(); ui('select'); return; }
    if (el.closest('#zooms')) { const zs = [...document.querySelectorAll('#zooms input:checked')].map((c) => +c.value); if (zs.length) push({ zoomLevels: zs }); else fillOptions(); ui('select'); return; }
    if (el.id === 'display') { push({ display: +el.value }); return; }
    if (!def) return;
    if (def[1] === 'check') { push({ [k]: el.checked }); ui('select'); }
    else if (def[1] === 'select') { push({ [k]: el.value }).then(() => { if (k === 'spriteStyle') st.sprites().then((i) => { Sprites.configure(i, settings.spriteStyle); render(true); }); }); ui('select'); }
    else if (def[1] === 'number') { const v = Math.max(1, Math.round(+el.value || 100)); el.value = v; push({ [k]: v }); }
  });
  let resetArmed = false;
  /** a saved game was chosen (Options, the Help screen, or Windows handed one over): what is in it, and "load it?" (0.9.8) */
  window.__stOfferShown = (r) => offerShown(r);      // (1.0) the self-check draws a preview for the how-to pictures; its Load button finds nothing picked
  function offerShown(r) {
    const note = $('saveNote');
    if (!note) return;
    if (!r || !r.ok) { note.innerHTML = r && r.error ? `<span class="bad">${esc(r.error)}</span>` : ''; return; }
    const s = r.summary, when = r.at ? new Date(r.at).toLocaleString() : 'unknown', lead = s.lead ? `${esc((s.lead.nick || (D.dex[s.lead.sp] || {}).n || '?'))}, Lv. ${s.lead.lvl}` : 'nobody';
    note.innerHTML = `<b>${esc(r.file)}</b>, saved ${esc(when)}${r.app ? ' with Screen Trainer ' + esc(r.app) : ''}: ${s.team} on the team (led by ${lead}), ${s.box} in the Box, ${s.species} species caught, ${s.badges} badges.<div class="ctl" style="margin-top:6px"><button class="btn warn" id="saveLoad">Load this game instead of mine</button><button class="btn" id="saveCancel">No</button></div><small>Your game as it is now is kept in the backups folder first.</small>`;
    note.scrollIntoView({ block: 'center' });
    ui('select');
  }
  $('helpLoad').addEventListener('click', () => { show('options'); setTimeout(() => { const b = $('savePick'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } }, 120); });      // (0.9.8) a fresh Screen Trainer: bring a saved game in
  $('optBody').addEventListener('click', async (e) => {
    const id = e.target.id, fold = e.target.closest('.fold');
    if (fold) {                                               // a category heading: fold it shut or open it
      const closed = new Set(settings.optClosed || []), g = fold.dataset.fold;
      if (closed.has(g)) closed.delete(g); else closed.add(g);
      push({ optClosed: GROUPS.filter((k) => closed.has(k)) }); ui('scroll');
      return;
    }
    if (id === 'foldAll' || id === 'foldNone') { push({ optClosed: id === 'foldAll' ? GROUPS.slice() : [] }); ui('scroll'); }
    else if (e.target.dataset.howto && st.howtoPlay) st.howtoPlay(e.target.dataset.howto, e.target.dataset.kind);
    else if (id === 'ropeGo') { if (st.rope) { $('ropeNote').textContent = 'Choose where the zip goes…'; ui('select'); st.rope(); } }
    else if (id === 'modsAgain' && st.modsView) { fillMods(await st.modsView(true)); ui('select'); }
    else if (id === 'modsFolder' && st.modsFolder) st.modsFolder();
    else if (id === 'modsOff' && st.modsOff) { fillMods(await st.modsOff()); ui('select'); }
    else if ((id === 'forkSave' || id === 'forkFresh') && st.forkMake) { st.forkMake(id === 'forkSave'); ui('select'); }
    else if (id === 'forkFolder' && st.forkFolder) st.forkFolder();
    else if (e.target.dataset.forkStart && st.forkStart) { const r = await st.forkStart(e.target.dataset.forkStart); if (r && !r.ok && r.error) $('forkList').insertAdjacentHTML('afterbegin', `<p class="bad">${esc(r.error)}</p>`); else ui('select'); }
    else if (e.target.dataset.forkTrash && st.forkTrash) { await st.forkTrash(e.target.dataset.forkTrash); fillForks(); }
    else if (id === 'exportApk') {
      if (exportBusy) return;
      exportBusy = true; e.target.disabled = true; $('exportNote').textContent = 'Choose where to save the app…';
      let r = null;
      try { r = await st.exportApk({ save: $('exSave').checked, sounds: $('exSounds').checked }); } catch (err) { r = { ok: false, error: String((err && err.message) || err) }; }
      exportBusy = false; e.target.disabled = false;
      if (r && r.ok) ui('save'); else if (r && r.error) ui('error');
      fillExport(r && !r.canceled ? r : null);
    }
    else if (id === 'gensAll') { push({ gens: [1, 2, 3, 4, 5, 6, 7, 8, 9] }); ui('select'); }
    else if (id === 'openImport') show('import');
    else if (id === 'openOnline') { if (st.visitOpen) st.visitOpen(false); ui('select'); }
    else if (id === 'exportShare') {
      if (!st.exportShare || e.target.disabled) return;
      e.target.disabled = true; $('shareNote').textContent = 'Choose where to save the zip file…';
      if (st.onShareProgress && !shareWatch) { shareWatch = true; st.onShareProgress((p) => { if (p && $('shareNote') && $('exportShare') && $('exportShare').disabled) $('shareNote').textContent = `Packing… ${Math.round((100 * (p.bytes || 0)) / Math.max(1, p.ofBytes || 1))}%`; }); }
      let r = null;
      try { r = await st.exportShare(); } catch (err) { r = { ok: false, error: String((err && err.message) || err) }; }
      e.target.disabled = false;
      if (r && r.ok) { ui('save'); $('shareNote').innerHTML = `<span class="good">Written:</span> ${esc(r.file)}<br>${mb(r.bytes)}, ${r.files.toLocaleString('en-US')} files. Nothing of yours is in it.`; }
      else if (r && r.error) { ui('error'); $('shareNote').innerHTML = `<span class="bad">${esc(r.error)}</span>`; }
      else $('shareNote').textContent = '';
    }
    else if (id === 'openGuardian') openGuardian();
    else if (id === 'pick') { const r = await st.pickSprites(); if (r && r.error) $('spritesPath').innerHTML = `<span class="bad">${esc(r.error)}</span>`; else { Sprites.configure(await st.sprites(), settings.spriteStyle); await refreshInfo(); render(true); } }
    else if (id === 'importRom') {
      $('bankNote').textContent = 'Choose the ROM file…';
      const r = await st.importRom();
      if (r && r.ok) { ui('save'); $('bankNote').textContent = `Imported ${r.info.songs} songs and effects and ${r.info.cries} cries from ${r.info.game}.`; setTimeout(refreshInfo, 1500); }
      else if (r && r.error) { ui('error'); $('bankNote').innerHTML = `<span class="bad">${esc(r.error)}</span>`; }
      else fillOptions();
    } else if (id === 'removeBank') { await st.removeBank(); setTimeout(refreshInfo, 600); }
    else if (id === 'saveExport') {
      if (!st.saveExport) return;
      $('saveNote').textContent = 'Saving…';
      const r = await st.saveExport();
      $('saveNote').innerHTML = r && r.ok ? `Saved, ${Math.max(1, Math.round(r.bytes / 1024))} KB: ${esc(r.file)}` : r && r.error ? `<span class="bad">${esc(r.error)}</span>` : '';
      if (r && r.ok) ui('save');
    } else if (id === 'savePick' || id === 'savePickAgain') {      // (savePickAgain: the one offered after a reset; ids are never used twice)
      if (!st.savePick) return;
      offerShown(await st.savePick());
    } else if (id === 'saveLoad') {
      const r = await st.saveLoad();
      $('saveNote').innerHTML = r && r.ok ? 'Loaded. Your Pokémon are on their way.' : `<span class="bad">${esc((r && r.error) || 'It was not loaded.')}</span>`;
      if (r && r.ok) { ui('save'); setTimeout(() => st.requestState(true), 2500); }
    } else if (id === 'saveCancel') { $('saveNote').textContent = ''; }
    else if (id === 'reset') {
      const b = $('reset');
      if (!resetArmed) { resetArmed = true; b.classList.add('armed'); b.textContent = 'Click again to erase everything'; ui('error'); setTimeout(() => { resetArmed = false; b.classList.remove('armed'); b.textContent = 'Reset save…'; }, 4000); return; }
      resetArmed = false; b.classList.remove('armed'); b.textContent = 'Reset save…';
      st.cmd({ type: 'reset' }); setTimeout(() => st.requestState(true), 100);
      if ($('saveNote')) $('saveNote').innerHTML = 'A fresh start. Have a saved game? <button class="btn" id="savePickAgain">Load a saved game…</button>';      // (0.9.8: after a reset a saved game can be loaded straight away)
    }
  });

  // ---------------------------------------------------------------- the Box tray
  let boxRows = [];
  const cellHtml = (m, top, col) => `<div class="cell ${m.uid === sel.box ? 'sel' : ''}" style="position:absolute;top:${top}px;left:calc(${col * 25}% + 2px);width:calc(25% - 4px);height:54px" data-uid="${esc(m.uid)}" data-src="box" title="${esc(m.name)} Lv. ${m.lvl}">${img(m.icon, 'pix')}<small>${m.lvl}</small>${m.shiny ? '<span class="star">✦</span>' : ''}</div>`;
  const boxPad = document.createElement('div');
  boxPad.className = 'pad'; boxPad.style.gridColumn = '1 / -1';
  $('boxGrid').appendChild(boxPad);
  const boxList = windowed($('boxGrid'), boxPad, 58, 4, (i, top, col) => cellHtml(boxRows[i], top, col));
  const boxOrdered = () => !$('boxFind').value.trim() && !$('boxSort').value;
  function filterBox() {
    const q = $('boxFind').value.trim().toLowerCase(), sort = $('boxSort').value;
    boxRows = box.filter((m) => !q || m.name.toLowerCase().includes(q) || m.species.toLowerCase().includes(q) || m.types.includes(q));
    if (sort === 'lvl') boxRows.sort((a, b) => b.lvl - a.lvl);
    else if (sort === 'sp') boxRows.sort((a, b) => a.sp - b.sp || b.lvl - a.lvl);
    else if (sort === 'name') boxRows.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'new') boxRows.sort((a, b) => b.met - a.met);
    boxList.set(boxRows.length);
    boxPad.innerHTML = boxRows.length ? boxPad.innerHTML : `<div class="empty">${box.length ? 'Nothing matches.' : 'Your Box is empty.<br>Pokémon you catch while the team is full wait here. Drag a team member over to store it.'}</div>`;
  }
  function renderBox(force) {
    if (!$('stage').classList.contains('open') && !force) return;
    const team = state.team;
    $('boxCount').textContent = box.length ? String(box.length) : '';
    if (drag && !force) return;
    if (changed('rail', [team.map((m) => [m.uid, m.lvl, m.icon, m.shiny]), sel.box]) || force) {
      $('rail').innerHTML = team.map((m, i) => `<div class="rslot ${i === 0 ? 'lead' : ''} ${m.uid === sel.box ? 'sel' : ''}" data-uid="${esc(m.uid)}" data-src="party" title="${esc(m.name)} Lv. ${m.lvl}${i === 0 ? ', team leader' : ''}">${img(m.icon, 'pix')}<small>${m.lvl}</small>${m.shiny ? '<span class="star">✦</span>' : ''}</div>`).join('')
        + Array.from({ length: 6 - team.length }, () => '<div class="rslot vacant">free</div>').join('');
    }
    if (changed('boxCells', [box.length, box.map((m) => m.uid).join(), $('boxFind').value, $('boxSort').value, sel.box]) || force) filterBox();
    const m = monOf(sel.box);
    if (!changed('boxInfo', [m && m.uid, m && m.name]) && !force) return;
    $('boxInfo').innerHTML = `<div class="sub" style="padding-top:6px">${m ? `<b>${esc(m.name)}</b> is shown on the main screen, with everything about it. ` : 'Click a Pokémon to see everything about it on the main screen. '}Drag Pokémon between the team rail and the Box, or within either, to arrange them. On a full team, drop onto a member to swap.</div>`;
  }
  const pickBox = (e) => { if (suppressClick) return; const c = e.target.closest('[data-uid]'); if (c) { sel.box = c.dataset.uid; armed = null; ui('scroll'); sig.boxCells = ''; renderBox(true); if (tab !== 'party') show('party', true); else { sig.partyEntry = ''; renderParty(true); } } };       // the chosen Pokémon's page opens on the main screen
  $('boxGrid').addEventListener('click', pickBox); $('rail').addEventListener('click', pickBox);
  $('boxInfo').addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && sel.box) monAction(el.dataset.act, sel.box, el); });
  $('boxFind').addEventListener('input', () => renderBox(true)); $('boxSort').addEventListener('change', () => { ui('select'); renderBox(true); });

  let boxBusy = false;
  function setBox(open, instant) {
    const stage = $('stage');
    if (boxBusy || stage.classList.contains('open') === open) return;
    $('boxToggle').setAttribute('aria-expanded', String(open)); $('boxunit').setAttribute('aria-hidden', String(!open));
    if (open) {
      st.panelBox(true);                                      // the window grows first, then the tray slides out
      boxBusy = true;
      setTimeout(() => { stage.classList.add('open'); boxBusy = false; sig.rail = sig.boxCells = sig.boxInfo = ''; if (state) renderBox(true); st.requestState(true); }, instant ? 0 : 60);
      if (!instant) ui('boxOpen');
    } else {
      stage.classList.add('closing'); stage.classList.remove('open'); boxBusy = true;
      ui('boxClose');
      setTimeout(() => { stage.classList.remove('closing'); boxBusy = false; st.panelBox(false); }, 360);
    }
  }
  $('boxToggle').addEventListener('click', () => setBox(!$('stage').classList.contains('open')));

  // ---------------------------------------------------------------- drag and drop (team order, team <-> Box, Box order)
  const ghost = $('ghost');
  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const item = el.closest('[data-uid][data-src]'), zone = el.closest('[data-zone]');
    if (!zone) return null;
    const t = { zone: zone.dataset.zone, el: item || zone, uid: item ? item.dataset.uid : null, after: false };
    if (item && t.zone === 'party') { const r = item.getBoundingClientRect(); t.after = y > r.top + r.height / 2; }
    return t;
  }
  /** the new line-up after dropping drag.uid on target, or null when that is not allowed */
  function arrangement(d, t) {
    const team = state.team.map((m) => m.uid), bx = box.map((m) => m.uid), fromTeam = d.src === 'party', src = fromTeam ? team : bx, fi = src.indexOf(d.uid);
    if (fi < 0 || !t || t.uid === d.uid) return null;
    if (t.zone === 'party') {
      let to = t.uid ? team.indexOf(t.uid) + (t.after ? 1 : 0) : team.length;
      if (fromTeam) { team.splice(fi, 1); if (to > fi) to--; team.splice(to, 0, d.uid); }
      else if (team.length < 6) { bx.splice(fi, 1); team.splice(to, 0, d.uid); }
      else if (t.uid) { const ti = team.indexOf(t.uid); bx[fi] = team[ti]; team[ti] = d.uid; }       // full team: swap places
      else return null;
    } else {
      let to = t.uid && boxOrdered() ? bx.indexOf(t.uid) : bx.length;
      if (!fromTeam) { if (!boxOrdered() || !t.uid) return null; bx.splice(fi, 1); if (to > fi) to--; bx.splice(to, 0, d.uid); }
      else { if (team.length <= 1) return null; team.splice(fi, 1); bx.splice(to, 0, d.uid); }
    }
    return { team, box: bx };
  }
  const clearMarks = () => document.querySelectorAll('.dropline, .dropinto, .dragging').forEach((e) => e.classList.remove('dropline', 'after', 'dropinto', 'dragging'));
  document.addEventListener('pointerdown', (e) => {
    const el = e.button === 0 && e.target.closest('[data-uid][data-src]');
    if (!el || e.target.closest('button, input, select')) return;
    drag = { uid: el.dataset.uid, src: el.dataset.src, sx: e.clientX, sy: e.clientY, on: false, el };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      const m = monOf(drag.uid);
      if (!m) { drag = null; return; }
      drag.on = true; ghost.hidden = false; ghost.innerHTML = `${img(m.icon, 'pix')}${esc(m.name)}`; ui('pick');
    }
    ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 8}px)`;
    clearMarks(); drag.el.classList.add('dragging');
    const t = dropTarget(e.clientX, e.clientY);
    drag.target = t && arrangement(drag, t) ? t : null;
    if (drag.target) { if (t.uid && t.zone === 'party' && !(drag.src === 'box' && state.team.length >= 6)) t.el.classList.add('dropline', ...(t.after ? ['after'] : [])); else t.el.classList.add('dropinto'); }
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag; drag = null; ghost.hidden = true; clearMarks();
    if (!d.on) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const next = d.target && arrangement(d, d.target);
    if (!next) { ui('error'); render(true); return; }
    // show the result at once; the overlay confirms it with the next snapshot
    const all = new Map([...state.team, ...box].map((m) => [m.uid, m]));
    state.team = next.team.map((u) => all.get(u)); box = next.box.map((u) => all.get(u));
    st.cmd({ type: 'arrange', team: next.team, box: next.box });
    ui('drop'); render(true);
    setTimeout(() => st.requestState(true), 80);
  };
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag); window.addEventListener('blur', endDrag);

  // ---------------------------------------------------------------- device controls: music deck, mute, window keys
  function renderDeck() {
    const snd = (state && state.sound) || {}, music = settings.music !== false, muted = !!settings.mute;
    const title = !snd.ok ? 'No sound device' : muted ? 'Muted' : !music ? 'Music off' : snd.battle && snd.scene === 'battle' ? snd.battle.title : snd.track ? snd.track.title : 'Starting…';
    $('track').textContent = title; $('track').title = title;
    document.querySelector('.tape').classList.toggle('playing', !!snd.playing && !muted);
    $('mPlay').setAttribute('aria-pressed', String(music)); $('muteKey').setAttribute('aria-pressed', String(muted));
    const fk = $('fieldKey'); if (fk) { const on = !!settings.field, phone = !!(info && info.android); fk.hidden = phone; fk.classList.toggle('on', on); fk.title = on ? 'Close the field window (the Pokémon then roam the whole screen)' : 'Open the field window'; fk.setAttribute('aria-pressed', String(on)); }      // (0.9.5)
  }
  $('mPrev').addEventListener('click', () => { st.cmd({ type: 'music', op: 'prev' }); ui('select'); setTimeout(() => st.requestState(false), 150); });
  $('mNext').addEventListener('click', () => { st.cmd({ type: 'music', op: 'next' }); ui('select'); setTimeout(() => st.requestState(false), 150); });
  $('mRandom').addEventListener('click', () => { st.cmd({ type: 'music', op: 'random' }); ui('select'); setTimeout(() => st.requestState(false), 150); });
  $('mPlay').addEventListener('click', () => { ui('select'); push({ music: settings.music === false }); });
  $('muteKey').addEventListener('click', () => { if (settings.mute) setTimeout(() => ui('select'), 120); push({ mute: !settings.mute }); });
  $('winMin').addEventListener('click', () => st.winMinimize());
  $('noteKey').addEventListener('click', () => { if (st.openNotepad) { st.openNotepad(); ui('open'); } });      // the Unown Notepad (0.9.8)
  if (st.onSaveOffer) st.onSaveOffer((r) => { show('options'); setTimeout(() => offerShown(r), 150); });
  $('fieldKey').addEventListener('click', () => { push({ field: !settings.field }); ui(settings.field ? 'close' : 'open'); });      // the field window from the top of the device (0.9.5, update 2)
  $('winClose').addEventListener('click', () => { ui('close'); setTimeout(() => st.winClose(), 90); });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const keys = ['dex', 'party', 'bag', 'trainer', 'options', 'help'], n = '123456'.indexOf(e.key);
    if (n >= 0) show(keys[n]); else if (e.key === '7' || e.key === 'g' || e.key === 'G') openGuardian(); else if (e.key === 'b' || e.key === 'B') setBox(!$('stage').classList.contains('open')); else if (e.key === 'm' || e.key === 'M') $('muteKey').click(); else if (e.key === 'Escape') st.winClose();
  });

  // ---------------------------------------------------------------- render loop
  function render(force) {
    if (!state) return;
    $('readout').textContent = '';      // 1.0: "caught and seen" is no longer shown up here (the owner's wish: the Trainer screen has it); the readout stays as an empty spacer
    $('readout').title = [state.event ? `${state.event.name} is visiting (${state.event.kind})` : '', state.weather ? `Weather: ${WEATHER_NAME[state.weather] || state.weather}` : ''].filter(Boolean).join('. ');
    $('sky').textContent = state.event ? '★' : state.weather ? WEATHER_ICON[state.weather] || '' : '';
    $('sky').title = $('readout').title; $('sky').hidden = !$('sky').textContent;
    $('led').classList.toggle('on', state.wild > 0);
    renderKeys();
    renderDeck();
    if (tab === 'dex') renderDex(force); else if (tab === 'party') renderParty(force); else if (tab === 'bag') renderBag(force); else if (tab === 'trainer') renderTrainer(); else if (tab === 'options') fillOptions();
    renderBox(force);
  }
  st.onState((s) => {
    if (drag && drag.on) return;                              // do not shuffle things under a drag
    if (s.box) box = s.box; else if (state && s.boxCount !== box.length) st.requestState(true);
    state = s;
    render(false);
  });
  st.onSettings((s) => { const style = settings.spriteStyle; settings = s; applyTheme(); if (s.spriteStyle !== style) st.sprites().then((i) => { Sprites.configure(i, s.spriteStyle); sig.dexEntry = ''; render(true); }); fillOptions(); renderDeck(); });
  fillOptions();
  showTab(location.hash.length > 1 ? location.hash.slice(1) : 'dex');
  if (settings.boxOpen) setBox(true, true);
  st.requestState(true);
  setInterval(() => { if (!document.hidden) st.requestState(false); }, 1000);
})();
