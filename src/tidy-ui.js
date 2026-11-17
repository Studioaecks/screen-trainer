// Screen Trainer — Rotom's big tidy-up, the walkthrough (optimize.html, 0.9.9, owner's list 11-16 update 20).
//
// Rotom asks, one thing at a time: what to tidy (the whole computer, which here is your personal folders, or a folder or
// two) and what to leave alone; what to do with pictures, videos, music, documents and the rest; whether to look inside
// folders. Then it shows the plan: where everything would go, which folders it would never take apart and why, and the
// ones it is unsure about. Only folders you tick are taken apart. Nothing moves before "Start", and Undo puts it all
// back. tidy.js in the main process does the work and states its rules; this page only shows and asks.
'use strict';
(async () => {
  const st = window.st, o = st.opt, $ = (id) => document.getElementById(id), box = $('big');
  if (!box || !o.tStatus) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;
  let S = await o.tStatus(), plan = null, step = 0, running = false, prog = null, result = null, armed = false;
  const W = { roots: new Set(), ignore: [], pictures: { how: 'gather', by: 'year', rename: false }, videos: 'gather', music: 'gather', documents: 'inplace', other: 'inplace', inside: false, bin: true, dissolve: new Set(), extra: [] };
  if (S.last) { Object.assign(W.pictures, S.last.pictures || {}); for (const k of ['videos', 'music', 'documents', 'other']) if (S.last[k]) W[k] = S.last[k]; }
  const answers = () => ({ roots: [...W.roots], ignore: W.ignore, pictures: W.pictures, videos: W.videos, music: W.music, documents: W.documents, other: W.other, inside: W.inside, bin: W.bin, dissolve: [...W.dissolve] });
  const say = (t) => { const s = $('say'); if (s) s.textContent = t ? `Rotom: “${t}”` : ''; };
  const radio = (name, val, cur, label, hint) => `<label class="opt"><input type="radio" name="${name}" value="${val}"${cur === val ? ' checked' : ''}> <b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</label>`;
  const HOWS = (cur, name, home) => radio(name, 'gather', cur, `Gather them in my ${home} folder`, 'From every folder chosen, on the same drive.') + radio(name, 'inplace', cur, 'Sort them where they are', `Into a "${home}" folder inside each folder chosen.`) + radio(name, 'leave', cur, 'Leave them alone', '');

  const STEPS = [
    () => `<h3>What shall I tidy?</h3>
      <div class="acts"><button class="btn go" data-do="whole">My whole computer</button><button class="btn" data-do="none">Just a folder or two</button></div>
      <p class="sub">“My whole computer” means your own folders below. I never go into Windows, your programs, or their settings, and never onto another drive by myself.</p>
      <div class="ticks">${S.presets.map((p) => `<label class="tick${p.ok ? '' : ' off'}"><input type="checkbox" data-root="${esc(p.dir)}"${W.roots.has(p.dir) ? ' checked' : ''}${p.ok ? '' : ' disabled'}> ${esc(p.key)} <small>${esc(p.dir)}</small></label>`).join('')}
      ${W.extra.map((d) => `<label class="tick"><input type="checkbox" data-root="${esc(d)}"${W.roots.has(d) ? ' checked' : ''}> ${esc(base(d))} <small>${esc(d)}</small></label>`).join('')}</div>
      <div class="acts"><button class="btn" data-do="addRoot">Add another folder…</button></div>
      <h3>Anything I must leave alone?</h3>
      <p class="sub">A folder, a USB stick or an external drive that I should not touch at all, even though it lies in one of the folders above.</p>
      <div class="ticks">${W.ignore.map((d, i) => `<span class="chip">${esc(d)} <button class="x" data-unignore="${i}" title="Rotom may go there after all">×</button></span>`).join('') || '<span class="sub">Nothing yet.</span>'}</div>
      <div class="acts"><button class="btn" data-do="addIgnore">Leave this folder alone…</button></div>`,
    () => `<h3>Pictures: where do I put them?</h3>${HOWS(W.pictures.how, 'pic', 'Pictures')}
      <h3>How shall I sort them?</h3>
      ${radio('picby', 'year', W.pictures.by, 'A folder for each year', '2023, 2024 …')}${radio('picby', 'month', W.pictures.by, 'Year, then month', '2024 › 2024-06')}${radio('picby', 'flat', W.pictures.by, 'All together', '')}
      <label class="tick"><input type="checkbox" data-set="rename"${W.pictures.rename ? ' checked' : ''}> Name each picture by its date <small>“2024-06-01 14.03.22.jpg” instead of “IMG_4821.jpg”. Undo gives the old names back.</small></label>
      <p class="sub">I go by each picture's date and name. I never open a picture, so I cannot sort by what it shows: that will come with an AI that runs on this computer.</p>`,
    () => `<h3>Videos</h3>${HOWS(W.videos, 'videos', 'Videos')}<h3>Music</h3>${HOWS(W.music, 'music', 'Music')}
      <h3>Documents, spreadsheets, slides</h3>${HOWS(W.documents, 'documents', 'Documents')}
      <h3>Everything else I know (archives, installers)</h3>${radio('other', 'inplace', W.other, 'Sort them where they are', 'Into “Archives” and “Installers” inside each folder chosen.')}${radio('other', 'leave', W.other, 'Leave them alone', '')}
      <p class="sub">Shortcuts, hidden files and kinds of file I do not know always stay where they are.</p>`,
    () => `<h3>May I look inside your folders?</h3>
      ${radio('inside', 'no', W.inside ? 'yes' : 'no', 'No: only the loose files', 'Files lying directly in the folders chosen. Folders inside them stay exactly as they are.')}
      ${radio('inside', 'yes', W.inside ? 'yes' : 'no', 'Yes: show me which folders could be taken apart', 'I list them in the plan. A folder is only taken apart if you tick it there. A program, a game, a project or a backup is never offered; where I am unsure I say why.')}
      <label class="tick"><input type="checkbox" data-set="bin"${W.bin ? ' checked' : ''}> A folder I took apart and that is empty goes to the Recycle Bin <small>Never deleted for good: it can be taken out of the Recycle Bin, and Undo makes it again.</small></label>`,
  ];
  const fold = (title, items, open) => (items.length ? `<details${open ? ' open' : ''}><summary>${title}</summary><div class="rows">${items.join('')}</div></details>` : '');
  function planHtml() {
    const p = plan;
    if (!p) return '<p class="sub">Working out the plan…</p>';
    const tick = (x, warn) => `<label class="tick${warn ? ' warn' : ''}"><input type="checkbox" data-dissolve="${esc(x.dir)}"${W.dissolve.has(x.dir) ? ' checked' : ''}> ${esc(base(x.dir))} <small>${x.files} file${x.files === 1 ? '' : 's'} · ${esc(x.dir)}${warn ? `<br><b>I am not sure:</b> ${esc(x.why)}. Tick it only if you want it taken apart.` : ''}</small></label>`;
    return `<h3>The plan</h3>
      <p class="lead">${p.count ? `<b>${p.count.toLocaleString('en-US')}</b> file${p.count === 1 ? '' : 's'} (${size(p.bytes)}) would move; ${p.stay.toLocaleString('en-US')} stay where they are.` : 'Nothing needs moving: it is all in order already (or everything was left alone).'}${p.full ? ' That is as many as I do in one go: run me again afterwards.' : ''}${p.dissolve && p.bin ? ' Folders you ticked go to the Recycle Bin once they are empty.' : ''}</p>
      ${p.problems.map((x) => `<p class="bad">${esc(x.dir)}: ${esc(x.why)}</p>`).join('')}
      ${fold(`Where they would go (${p.dests.length} folder${p.dests.length === 1 ? '' : 's'})`, p.dests.map((d) => `<div class="row2"><span>${esc(d.dir)}</span><b>${d.files}</b><small>${size(d.bytes)}</small></div>`), true)}
      ${fold(`Every file (the first ${p.sample.length})`, p.sample.map((m) => `<div class="row2"><span>${esc(m.from)}</span><small>→ ${esc(m.to)}</small></div>`), false)}
      ${p.unsure.length ? `<h3>Folders I am not sure about</h3><p class="sub">I leave these alone unless you tick them.</p><div class="ticks">${p.unsure.map((x) => tick(x, true)).join('')}</div>` : ''}
      ${p.candidates.length ? `<h3>Folders I could take apart</h3><p class="sub">Their files would be sorted like the loose ones. Only the ones you tick.</p><div class="ticks">${p.candidates.map((x) => tick(x, false)).join('')}</div>` : ''}
      ${fold(`Left alone, and why (${p.kept.length})`, p.kept.map((k) => `<div class="row2"><span>${esc(k.dir)}</span><small>${esc(k.why)}</small></div>`), false)}`;
  }
  function draw() {
    const last = STEPS.length;
    let html = '';
    if (running) html = `<h3>At work…</h3><div class="bar"><i style="width:${prog && prog.of ? Math.round((prog.done / prog.of) * 100) : 0}%"></i></div><p class="sub">${prog ? `${prog.done.toLocaleString('en-US')} of ${prog.of.toLocaleString('en-US')}${prog.name ? ` · ${esc(prog.name)} → ${esc(prog.to)}` : ''}` : 'Starting…'}</p><p class="sub">Each move is instant: a file never leaves its drive, so nothing is copied and nothing can be cut off half-way.</p>`;
    else if (result) html = `<h3>${result.ok ? 'Done' : 'It did not work'}</h3><p class="lead">${esc(result.text || '')}</p>${result.failed && result.failed.length ? fold(`Left where they were (${result.failedCount})`, result.failed.map((f) => `<div class="row2"><span>${esc(f.name)}</span><small>${esc(f.why)}</small></div>`), false) : ''}
      <div class="acts"><button class="btn" data-do="undo">Undo: put everything back</button><button class="btn go" data-do="again">Tidy something else</button></div>`;
    else if (step < last) html = STEPS[step]() + `<div class="acts nav">${step ? '<button class="btn" data-do="back">Back</button>' : ''}<button class="btn go" data-do="next">${step === last - 1 ? 'Show me the plan' : 'Next'}</button><span class="sub">${step + 1} of ${last + 1}</span></div>`;
    else html = planHtml() + `<div class="acts nav"><button class="btn" data-do="back">Back</button><button class="btn go big${armed ? ' armed' : ''}" data-do="start"${plan && plan.count ? '' : ' disabled'}>${armed ? 'Yes, start' : 'Start'}</button><span class="sub">Nothing is deleted or overwritten. Undo puts everything back.</span></div>`;
    if (!running && !result && S.canUndo && S.lastRun) html += `<p class="fine">Last time: ${S.lastRun.moved} file${S.lastRun.moved === 1 ? '' : 's'} moved${S.lastRun.binned ? `, ${S.lastRun.binned} folder${S.lastRun.binned === 1 ? '' : 's'} to the Recycle Bin` : ''}, ${new Date(S.lastRun.at).toLocaleString()}. <button class="btn tiny" data-do="undo">Undo it</button></p>`;
    box.innerHTML = html;
  }
  async function propose() { plan = null; draw(); const r = await o.tPropose(answers()); plan = r && r.plan; armed = false; draw(); }
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.root) { if (t.checked) W.roots.add(t.dataset.root); else W.roots.delete(t.dataset.root); }
    else if (t.dataset.dissolve) { if (t.checked) W.dissolve.add(t.dataset.dissolve); else W.dissolve.delete(t.dataset.dissolve); propose(); }
    else if (t.dataset.set === 'rename') W.pictures.rename = t.checked;
    else if (t.dataset.set === 'bin') W.bin = t.checked;
    else if (t.name === 'pic') W.pictures.how = t.value; else if (t.name === 'picby') W.pictures.by = t.value;
    else if (t.name === 'inside') W.inside = t.value === 'yes';
    else if (['videos', 'music', 'documents', 'other'].includes(t.name)) W[t.name] = t.value;
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do],[data-unignore]');
    if (!b || running) return;
    if (b.dataset.unignore !== undefined) { W.ignore.splice(+b.dataset.unignore, 1); draw(); return; }
    const d = b.dataset.do;
    if (d === 'whole') { for (const p of S.presets) if (p.ok) W.roots.add(p.dir); draw(); }
    else if (d === 'none') { W.roots.clear(); draw(); }
    else if (d === 'addRoot') { const r = await o.tPick('root'); if (r && r.ok) { if (!W.extra.includes(r.dir) && !S.presets.some((p) => p.dir === r.dir)) W.extra.push(r.dir); W.roots.add(r.dir); } else if (r && r.text) say(r.text); draw(); }
    else if (d === 'addIgnore') { const r = await o.tPick('ignore'); if (r && r.ok && !W.ignore.includes(r.dir)) W.ignore.push(r.dir); draw(); }
    else if (d === 'back') { step = Math.max(0, step - 1); armed = false; draw(); }
    else if (d === 'next') { if (step === 0 && !W.roots.size) { say('Choose at least one folder first.'); return; } step++; if (step === STEPS.length) propose(); else draw(); }
    else if (d === 'start') {
      if (!plan || !plan.count) return;
      if (!armed) { armed = true; draw(); setTimeout(() => { if (armed && !running) { armed = false; draw(); } }, 5000); return; }
      armed = false; running = true; prog = null; window.dispatchEvent(new CustomEvent('rotom-busy', { detail: true })); say('Here we go! Everyone to work!'); draw();
      result = await o.tApply(plan.id);
      running = false; window.dispatchEvent(new CustomEvent('rotom-busy', { detail: false })); S = await o.tStatus(); say(result.text || ''); draw();
    }
    else if (d === 'undo') { const r = await o.tUndo(); say(r.text); S = await o.tStatus(); result = null; step = 0; plan = null; draw(); }
    else if (d === 'again') { result = null; plan = null; step = 0; W.dissolve.clear(); draw(); }
  });
  if (o.onTProgress) o.onTProgress((p) => { prog = p; if (running) { draw(); window.dispatchEvent(new CustomEvent('rotom-carry', { detail: p })); } });
  draw();
})();
