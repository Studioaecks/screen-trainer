// Screen Trainer — Optimize, Rotom's window (optimize.html): the page. It shows and asks; every request goes to
// optimize.js in the main process (window.st.opt.*), which checks all of it again and states its rules at its top.
//
// The room at the top is the home of Rotom's helpers: eight Pokémon known for their minds and their speed, each with
// the one job it stands for here. They are drawn from the owner's own sprites folder (a stand-in shape when a
// picture is missing) and live only in this window.
'use strict';
(async () => {
  const st = window.st, o = st.opt, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // who lives in the room: species, name, the job it stands for
  const HELPERS = [
    [233, 'Porygon2', 'sorts by kind'], [137, 'Porygon', 'carries the files'], [376, 'Metagross', 'works out the plan'], [65, 'Alakazam', 'remembers where everything was'],
    [765, 'Oranguru', 'asks the AI for advice'], [606, 'Beheeyem', 'reads names, sizes and dates'], [649, 'Genesect', 'finds the loose files'], [135, 'Jolteon', 'keeps it quick'],
  ];
  let S = null, busy = false, walkers = [];
  // 0.9.9: the big tidy-up (src/tidy-ui.js) sets everyone to work, and every batch of files is carried across the room
  window.addEventListener('rotom-busy', (e) => { busy = !!e.detail; document.body.classList.toggle('working', busy); });
  window.addEventListener('rotom-carry', (e) => {
    const floor = $('floor'); if (!floor || floor.querySelectorAll('.parcel').length > 14) return;
    const el = document.createElement('div'); el.className = 'parcel'; el.textContent = e.detail && e.detail.end ? '✓' : '▤'; el.title = (e.detail && e.detail.name) || '';
    el.style.top = 70 + Math.random() * 40 + 'px';
    floor.appendChild(el); setTimeout(() => el.remove(), 1500);
  });
  const say = (text) => { $('say').textContent = text ? `Rotom: “${text}”` : ''; };

  // ---- the room
  try { const info = await st.sprites(), set = await st.getSettings(); Sprites.configure(info, set.spriteStyle); } catch (e) { /* no pictures: stand-in shapes */ }
  function picture(sp, name) {
    let src = '';
    try { const r = Sprites.resolve(sp, false, false); src = r ? r.front : ''; } catch (e) { src = ''; }
    const stand = () => { const d = document.createElement('div'); d.className = 'standin'; d.textContent = name.slice(0, 4); return d; };
    if (!src) return stand();
    const img = new Image(); img.alt = ''; img.draggable = false; img.onerror = () => { if (img.parentNode) img.parentNode.replaceChild(stand(), img); }; img.src = src;
    return img;
  }
  function buildRoom() {
    const floor = $('floor'), W = floor.clientWidth || 900;
    const add = (sp, name, job, host) => { const el = document.createElement('div'); el.className = 'helper' + (host ? ' host' : ''); el.title = `${name}: ${job}`; el.appendChild(picture(sp, name)); const tag = document.createElement('span'); tag.textContent = job; el.appendChild(tag); floor.appendChild(el); return el; };
    const lane = (i) => 210 + ((W - 290) / (HELPERS.length - 1)) * i;      // (Rotom has the left end of the room to itself)
    walkers = HELPERS.map(([sp, name, job], i) => ({ el: add(sp, name, job, false), x: lane(i), y: 62 + (i % 2) * 14, tx: 0, wait: Math.random() * 4, face: 1, home: lane(i) }));
    const host = add(479, 'Rotom', 'tidies your folder', true); host.style.transform = 'translate3d(14px, 26px, 0)';
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const w = floor.clientWidth || 900, speed = busy ? 150 : 34;
      for (const k of walkers) {
        k.home = Math.min(w - 60, Math.max(210, k.home));
        if (k.wait > 0) { k.wait -= dt * (busy ? 4 : 1); if (k.wait <= 0) k.tx = Math.min(w - 60, Math.max(210, k.home + (Math.random() - 0.5) * (busy ? 420 : 120))); }
        else { const d = k.tx - k.x; if (Math.abs(d) < 2) k.wait = 1 + Math.random() * 5; else { k.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt); k.face = d > 0 ? -1 : 1; } }
        k.el.style.transform = `translate3d(${Math.round(k.x - 40)}px, ${k.y}px, 0)`;
        const pic = k.el.firstChild; if (pic && pic.style) pic.style.transform = `scaleX(${k.face})`;
        k.el.classList.toggle('busy', busy);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- drawing what the main process says
  function draw() {
    if (!S) return;
    $('folder').textContent = S.folder || 'No folder chosen yet.';
    $('folderNote').innerHTML = S.problem ? `<span class="bad">${esc(S.problem)}</span>` : S.folder ? `${S.loose.toLocaleString('en-US')} loose file${S.loose === 1 ? '' : 's'} in it${S.kept ? `, ${S.kept} other thing${S.kept === 1 ? '' : 's'} that stay${S.kept === 1 ? 's' : ''} put (folders, shortcuts, hidden files)` : ''}.` : 'Downloads and the Desktop are where loose files pile up.';
    if (document.activeElement !== $('mode')) $('mode').value = S.mode;
    const ready = !!S.folder && !S.problem && !busy;
    $('look').disabled = !ready; $('ai').disabled = !ready; $('pick').disabled = busy;
    const p = S.plan;
    $('planCard').hidden = !p;
    if (p) {
      $('folders').innerHTML = p.folders.map((f) => `<div class="fold"><b>${esc(f.name)}</b><span>${f.files.toLocaleString('en-US')} file${f.files === 1 ? '' : 's'}, ${size(f.bytes)}</span></div>`).join('') || '<p class="sub">Nothing needs sorting: every loose file stays where it is.</p>';
      $('sampleSum').textContent = `Every file and where it would go (${p.count.toLocaleString('en-US')}${p.count > p.sample.length ? `, the first ${p.sample.length} shown` : ''})`;
      $('sample').innerHTML = p.sample.map((m) => `<div><span>${esc(m.name)}</span><span>${esc(m.to)}</span></div>`).join('');
      $('applyNote').textContent = `${p.count.toLocaleString('en-US')} file${p.count === 1 ? '' : 's'} (${size(p.bytes)}) into ${p.folders.length} folder${p.folders.length === 1 ? '' : 's'}, sorted ${p.by}.${p.stay ? ` ${p.stay} stay where they are.` : ''} ${p.note || ''}`;
      $('apply').disabled = busy || !p.count;
    }
    $('undo').disabled = busy || !S.canUndo;
    $('undoNote').textContent = S.last ? `Last: ${S.last.moved.toLocaleString('en-US')} files ${S.last.by}, ${when(S.last.at)}.` : 'Nothing to undo.';
    $('log').innerHTML = S.log.length ? S.log.map((l) => `<div class="${l.undone ? 'undone' : ''}"><span>${esc(when(l.at))}</span><b>${esc(l.dir)}</b><span>${l.moved.toLocaleString('en-US')} files ${esc(l.by)}</span></div>`).join('') : '<p class="sub">Nothing yet.</p>';
  }
  async function refresh() { S = await o.status(); draw(); }
  const work = async (fn) => { if (busy) return null; busy = true; draw(); let r = null; try { r = await fn(); } catch (e) { r = { ok: false, text: String((e && e.message) || e) }; } busy = false; await refresh(); return r; };

  $('pick').addEventListener('click', async () => { const r = await work(() => o.pick()); if (r && r.ok) say('Bzzt! Nice mess. Shall I draw up a plan?'); else if (r && r.text) { $('planNote').innerHTML = `<span class="bad">${esc(r.text)}</span>`; say('Bzzt... not there. Pick another one.'); } });
  $('mode').addEventListener('change', async () => { if (S && S.folder && !S.problem) { const r = await work(() => o.propose($('mode').value)); note(r); } });
  const note = (r) => { $('planNote').innerHTML = r && r.ok ? '' : `<span class="bad">${esc((r && r.text) || 'That did not work.')}</span>`; };
  $('look').addEventListener('click', async () => { const r = await work(() => o.propose($('mode').value)); note(r); if (r && r.ok) say(r.plan.count ? `${r.plan.count} files, ${r.plan.folders.length} folders. Look it over!` : 'Bzzt? This one is tidy already.'); });
  $('ai').addEventListener('click', async () => { say('Asking... only the file names go out.'); const r = await work(() => o.proposeAi()); note(r); if (r && r.ok) { $('planNote').textContent = `Suggested by ${r.by}. It was sent ${r.sent}, and nothing else.`; say('Here is what it suggests. You decide.'); } else say('Bzzt. No luck with the AI. I can still sort by kind or by year.'); });
  $('apply').addEventListener('click', async () => { if (!S || !S.plan) return; const r = await work(() => o.apply(S.plan.id)); $('planNote').innerHTML = r && r.ok ? esc(r.text) + (r.failed && r.failed.length ? ` <span class="bad">${esc(r.failed.slice(0, 3).map((f) => `${f.name}: ${f.why}`).join('; '))}${r.failed.length > 3 ? '…' : ''}</span>` : '') : `<span class="bad">${esc((r && r.text) || 'That did not work.')}</span>`; say(r && r.ok && r.moved ? 'Zzzt! Done. Undo is right there if you miss the mess.' : 'Bzzt. Nothing moved.'); });
  $('undo').addEventListener('click', async () => { const r = await work(() => o.undo()); $('undoNote').textContent = (r && r.text) || ''; say(r && r.ok ? 'All back where it was. Bzzt.' : 'Nothing to take back.'); });

  buildRoom();
  await refresh();
  say(S && S.folder && !S.problem ? 'Bzzt! Back for more? Show me the plan.' : 'Bzzt! Choose a folder and I will tidy it up.');
  window.OptimizeUI = { ready: () => !!S, state: () => S, helpers: () => walkers.length, pictures: () => document.querySelectorAll('#floor .helper img').length };      // for the checks
})();
