// Screen Trainer — Mewtwo's window, the two tabs of 0.9.9 (owner's list 11-16 update 21):
//   guard    the AI watch (sentinel.js): which AI programs are on this computer, and cutting one off from the internet
//   backup   copies of what the owner chose on a USB stick or external drive (backup.js): a walkthrough, or a simple
//            profile, plus any other folder; a reminder once a week
// This page shows and asks; the two modules in the main process do the work and state their rules.
'use strict';
(async () => {
  const st = window.st, g = st.guard, $ = (id) => document.getElementById(id);
  if (!g.aiScan || !$('guardBody')) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const say = (text) => { const s = $('speech'); if (s && text) s.textContent = text; };
  const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

  // ---------------------------------------------------------------- guard: the AI watch
  let watch = { at: 0, found: [] }, looking = false;
  function drawGuard() {
    const f = watch.found;
    $('guardBody').innerHTML = `<h3>AI programs on this computer</h3>
      <p class="quiet">Assistants, agents and local model servers I know by name: running now, starting with Windows, or listening for connections. I only look; nothing is stopped or changed unless you press a button.</p>
      <div class="acts"><button class="btn go" data-ai="scan"${looking ? ' disabled' : ''}>${looking ? 'Looking…' : 'Look now'}</button><span class="quiet">${watch.at ? 'Last looked ' + new Date(watch.at).toLocaleTimeString() : ''}</span></div>
      ${f.length ? f.map((x) => `<div class="entry ai${x.blocked ? ' blocked' : ''}"><span class="lamp ${x.blocked ? 'ok' : x.isNew ? 'warn' : 'info'}"></span><div>
        <b>${esc(x.name)}</b>${x.isNew ? ' <em class="new">new</em>' : ''} <span class="quiet">${esc(x.what)}</span>
        <div class="quiet path">${esc(x.path)}</div>
        <div class="quiet">${[x.running ? 'running now' : 'not running', x.startup ? 'starts with Windows' : '', x.port ? `listening on port ${x.port}` : '', x.blocked ? 'cut off from the internet by me' : ''].filter(Boolean).join(' · ')}</div>
        <div class="acts">${x.canBlock ? (x.blocked ? `<button class="btn" data-ai="unblock" data-id="${esc(x.id)}">Unblock</button>` : `<button class="btn" data-ai="block" data-id="${esc(x.id)}" title="Adds a Windows Firewall rule for this one program. Windows will ask you to allow it.">Block its internet</button>`) : '<span class="quiet">Its path has unusual characters: block it in Windows Firewall yourself.</span>'}</div>
      </div></div>`).join('') : `<p class="quiet">${watch.at ? 'None of the AI programs I know is here right now.' : 'Press "Look now".'}</p>`}
      <p class="quiet fine">Blocking is the one thing I do that needs administrator rights: Windows asks you each time, and I add or remove only my own firewall rule (out and in) for that one program. It keeps running; it just cannot reach the network. I tell you when a new AI program turns up.</p>`;
  }
  async function scan() { looking = true; drawGuard(); const r = await g.aiScan(); looking = false; if (r && r.found) watch = { at: r.at || Date.now(), found: r.found }; if (r && r.text) say(r.text); drawGuard(); }
  $('guardBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ai]'); if (!b || b.disabled) return;
    if (b.dataset.ai === 'scan') return scan();
    b.disabled = true; say('Windows will ask you to allow it.');
    const r = await g.aiBlock(b.dataset.id, b.dataset.ai === 'block');
    say(r.text); await scan();
  });

  // ---------------------------------------------------------------- backup
  let B = await g.bkStatus(), wstep = -1, sizes = {}, prog = null, last = null;
  const check = (on, attrs, label, hint) => `<label class="tick"><input type="checkbox" ${attrs}${on ? ' checked' : ''}> ${label}${hint ? ` <small>${hint}</small>` : ''}</label>`;
  const where = () => `<div class="entry"><span class="lamp ${B.target && !B.targetProblem ? 'ok' : 'warn'}"></span><div><b>Where</b> <span class="quiet">${B.target ? esc(B.where) : 'not chosen yet'}</span>${B.targetProblem ? `<div class="quiet warn">${esc(B.targetProblem)}</div>` : ''}${B.sameDrive ? '<div class="quiet warn">That is on the same drive as some of what it copies. A backup is safer on another drive (a USB stick, an external drive).</div>' : ''}
    <div class="acts"><button class="btn" data-bk="target">Choose the drive…</button>${B.target && !B.targetProblem ? '<button class="btn" data-bk="open">Open the backup folder</button>' : ''}</div></div></div>`;
  const what = () => `<div class="entry"><span class="lamp ${B.items.length || B.trainer ? 'ok' : 'warn'}"></span><div><b>What</b>
    ${check(B.trainer, 'data-bkset="trainer"', 'Screen Trainer’s own data', 'your game, settings and layouts; a few megabytes')}
    ${B.items.map((x) => `<div class="pathrow"><span class="path">${esc(x.dir)}</span>${x.problem ? `<span class="quiet warn">${esc(x.problem)}</span>` : ''}<button class="x" data-bk="remove" data-dir="${esc(x.dir)}" title="Take it out of the backup">×</button></div>`).join('')}
    <div class="acts"><button class="btn" data-bk="add">Add a folder…</button></div></div></div>`;
  const when = () => `<div class="entry"><span class="lamp info"></span><div><b>When</b>
    ${check(B.weekly, 'data-bkset="weekly"', 'Remind me once a week', 'I say so when the last backup is a week old')}
    ${check(B.auto, 'data-bkset="auto"', 'Do it by itself when the drive is there', 'once a week, without asking; off unless you tick it')}</div></div>`;
  const runBox = () => `<div class="entry"><span class="lamp ${B.running ? 'warn' : B.last ? 'ok' : 'info'}"></span><div><b>${B.running ? 'Backing up…' : 'Back up'}</b>
    <div class="quiet">${B.running ? `${(prog || B.running).copied} copied, ${(prog || B.running).same} already there${prog && prog.name ? ' · ' + esc(base(prog.name)) : ''}` : last ? esc(last.text) : B.last ? `Last backup: ${new Date(B.last.at).toLocaleString()} (${B.last.copied} copied, ${size(B.last.bytes)}${B.last.stopped ? ', stopped early' : ''})` : 'No backup has been made yet.'}</div>
    <div class="acts">${B.running ? '<button class="btn" data-bk="stop">Stop</button>' : `<button class="btn go" data-bk="start"${B.target && !B.targetProblem && (B.items.length || B.trainer) ? '' : ' disabled'}>Back up now</button>`}</div></div></div>`;
  // the walkthrough: one question at a time
  const WALK = [
    () => `<h3>1. Where shall the backup go?</h3><p class="quiet">Plug in the USB stick or external drive, then choose it (or a folder on it). Everything I write goes into one folder there, “Screen Trainer backup”; nothing else on the drive is touched.</p>${where()}`,
    () => `<h3>2. Screen Trainer itself?</h3><p class="quiet">Your game, settings and layouts, and your game once more as a saved-game file you can load on any computer.</p>${check(B.trainer, 'data-bkset="trainer"', 'Yes, back up Screen Trainer’s own data', '')}`,
    () => `<h3>3. Your own folders</h3><p class="quiet">Tick the ones to back up. “How much?” counts what is in one (for a few seconds at most).</p>
      ${B.homes.map((h) => `<div class="pathrow">${check(h.chosen, `data-bkhome="${esc(h.dir)}"`, esc(h.key), esc(h.dir))}<span class="quiet">${sizes[h.dir] ? `${sizes[h.dir].files.toLocaleString('en-US')}${sizes[h.dir].more ? '+' : ''} files, ${size(sizes[h.dir].bytes)}${sizes[h.dir].more ? ' or more' : ''}` : ''}</span><button class="btn tiny" data-bk="measure" data-dir="${esc(h.dir)}">How much?</button></div>`).join('')}`,
    () => `<h3>4. Anything else?</h3><p class="quiet">Any other folder: projects, a games folder, a second drive’s folder.</p>${B.items.filter((x) => !B.homes.some((h) => h.dir === x.dir)).map((x) => `<div class="pathrow"><span class="path">${esc(x.dir)}</span><button class="x" data-bk="remove" data-dir="${esc(x.dir)}">×</button></div>`).join('') || '<p class="quiet">Nothing else yet.</p>'}<div class="acts"><button class="btn" data-bk="add">Add a folder…</button></div>`,
    () => `<h3>5. When?</h3>${when()}`,
    () => `<h3>6. Ready</h3><p class="quiet">I copy what is new or changed. Nothing on the drive is ever deleted: a file you remove from the computer stays in the backup.</p>${where()}${what()}${runBox()}`,
  ];
  function drawBackup() {
    const el = $('backupBody');
    if (wstep >= 0) el.innerHTML = WALK[wstep]() + `<div class="acts nav">${wstep ? '<button class="btn" data-bk="wback">Back</button>' : ''}${wstep < WALK.length - 1 ? '<button class="btn go" data-bk="wnext">Next</button>' : ''}<button class="btn" data-bk="wend">${wstep < WALK.length - 1 ? 'Skip the walkthrough' : 'Done'}</button><span class="quiet">${wstep + 1} of ${WALK.length}</span></div>`;
    else el.innerHTML = `<h3>Backups</h3><p class="quiet">Copies of what you choose, on a USB stick or an external drive. Only what you choose; nothing on the drive is ever deleted.</p>
      <div class="acts"><button class="btn go" data-bk="walk">Walk me through it</button></div>
      <p class="quiet">Or pick a simple profile, and add any other folder below:</p>
      <div class="acts wrap">${B.profiles.map((p) => `<button class="btn" data-bk="profile" data-key="${p.key}" title="${esc(p.text)}">${esc(p.name)}</button>`).join('')}</div>
      ${where()}${what()}${when()}${runBox()}
      <p class="quiet fine">This is not a Windows restore point (those do not hold your pictures and documents, and need administrator rights). It is plain copies of your files that you can open on any computer.</p>`;
  }
  async function refresh() { B = await g.bkStatus(); drawBackup(); }
  $('backupBody').addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.bkset) { B = await g.bkSet({ [t.dataset.bkset]: t.checked }); drawBackup(); }
    else if (t.dataset.bkhome) { if (t.checked) { const r = await g.bkHome(t.dataset.bkhome); if (r && r.text) say(r.text); } else await g.bkSet({ remove: t.dataset.bkhome }); refresh(); }
  });
  $('backupBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bk]'); if (!b || b.disabled) return;
    const k = b.dataset.bk;
    if (k === 'walk') { wstep = 0; drawBackup(); }
    else if (k === 'wnext') { wstep = Math.min(WALK.length - 1, wstep + 1); drawBackup(); }
    else if (k === 'wback') { wstep = Math.max(0, wstep - 1); drawBackup(); }
    else if (k === 'wend') { wstep = -1; drawBackup(); }
    else if (k === 'target') { const r = await g.bkTarget(); if (r && r.text) say(r.text); refresh(); }
    else if (k === 'add') { const r = await g.bkAdd(); if (r && r.text) say(r.text); refresh(); }
    else if (k === 'remove') { B = await g.bkSet({ remove: b.dataset.dir }); drawBackup(); }
    else if (k === 'profile') { B = await g.bkSet({ profile: b.dataset.key }); say('Set. Add any other folder below, then “Back up now”.'); drawBackup(); }
    else if (k === 'measure') { b.disabled = true; b.textContent = 'Counting…'; sizes[b.dataset.dir] = await g.bkMeasure(b.dataset.dir); drawBackup(); }
    else if (k === 'open') g.bkOpen();
    else if (k === 'stop') { await g.bkStop(); say('Stopping after this file.'); }
    else if (k === 'start') { last = null; prog = null; say('Recover! I am off to copy your files.'); const p = g.bkStart(); setTimeout(refresh, 300); last = await p; say(last.text); refresh(); }
  });
  if (g.onBkProgress) g.onBkProgress((p) => { prog = p; if (B.running && !document.hidden) drawBackup(); });

  $('tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; if (t.dataset.tab === 'guard') { drawGuard(); if (!watch.at) scan(); say('I watch the other minds on this machine.'); } else if (t.dataset.tab === 'backup') { refresh(); say('A copy elsewhere is the only real safety.'); } });
  drawGuard(); drawBackup();
})();
