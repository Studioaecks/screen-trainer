// Screen Trainer — Mewtwo's window (guardian.html). It shows what guardian.js (main process) reports and sends
// the user's choices back through st.guard.*; it runs nothing itself. Four screens: watch, tune, ask, log.
// Anything that changes the computer is asked for twice: the first click arms the button, the second does it.
'use strict';

(async () => {
  const st = window.st, g = st.guard, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ui = (name) => { try { st.sound(name); } catch (e) { /* no sound: fine */ } };
  // the files on disk can be newer than the program that is running (an update copied in while it was open)
  const stale = () => { $('watchBody').innerHTML = '<p>Screen Trainer was updated while it was running. Right-click its tray icon, choose <b>Close app</b>, then start ScreenTrainer.exe again.</p>'; $('speech').textContent = 'I need a restart before I can see.'; };
  let settings = null, info = null;
  try { settings = await st.getSettings(); info = await st.info(); } catch (e) { info = null; }
  if (!g || !info || !(info.api >= 3) || !settings) { stale(); return; }

  let status = null, prof = null, ai = null, tab = 'watch', walk = null, thinking = false;
  const history = [];
  const theme = () => { document.documentElement.dataset.theme = settings.theme === 'classic' ? 'classic' : 'glass'; document.documentElement.dataset.contrast = settings.contrast === 'system' ? 'system' : 'own'; };
  theme();
  st.onSettings((s) => { settings = s; theme(); });
  try { Sprites.configure(await st.sprites(), settings.spriteStyle); const r = Sprites.resolve(150, false, false); if (r) $('face').src = r.front; else $('face').remove(); } catch (e) { $('face').remove(); }
  $('host').textContent = `guardian of ${info.host || 'this computer'}`;

  // ---------------------------------------------------------------- small helpers
  const GB = (b) => (b / 1073741824).toFixed(b > 107374182400 ? 0 : 1) + ' GB';
  const ago = (d) => (d === null || d === undefined ? 'unknown' : d > 4e9 ? 'never' : d < 1 ? 'today' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'} ago`);
  const daysSince = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 864e5) : null);
  const clock = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const say = (text, tone) => { if (!text) return; $('speech').textContent = text; $('speech').className = 'speech ' + (tone || ''); };
  const bar = (share, tone) => `<div class="bar" style="--w:${Math.round(Math.min(1, Math.max(0, share)) * 100)}%;--c:var(--${tone || 'psy'})"></div>`;
  const NEEDS_CONFIRM = new Set(['defender.quickscan', 'apps.upgradeAll', 'power.plan']);
  /** a button for one of Mewtwo's abilities (ACTIONS in guardian.js) */
  const actBtn = (id, label, o = {}) => `<button class="btn ${o.go ? 'go' : ''} ${o.on ? 'on' : ''}" data-act="${esc(id)}" ${o.arg ? `data-arg="${esc(o.arg)}"` : ''} ${o.title ? `title="${esc(o.title)}"` : ''} ${o.off ? 'disabled' : ''}>${esc(label)}</button>`;
  function arm(btn, again) {                               // first click: ask; second click within four seconds: do
    if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; return true; }
    btn.dataset.label = btn.textContent; btn.classList.add('armed'); btn.textContent = again || 'Sure? Click again';
    ui('error');
    setTimeout(() => { if (btn.isConnected && btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 4000);
    return false;
  }
  async function busy(btn, fn) {
    btn.disabled = true; btn.classList.add('busy');
    try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('busy'); } }
  }

  // ---------------------------------------------------------------- watch
  function renderWatch() {
    const s = status;
    if (!s) return;
    const top = s.advice[0];
    if (!walk && tab !== 'ask') say(top.text, top.tone);
    const v = s.vitals, mem = v.memTotal ? v.memUsed / v.memTotal : 0;
    const vitals = `<dt>Processor load</dt><dd>${v.load}% ${bar(v.load / 100, v.load > 85 ? 'warn' : 'psy')}</dd><dt>Memory</dt><dd>${GB(v.memUsed)} of ${GB(v.memTotal)} ${bar(mem, mem > 0.9 ? 'warn' : 'psy')}</dd><dt>Running for</dt><dd>${v.uptime > 172800 ? Math.round(v.uptime / 86400) + ' days' : Math.round(v.uptime / 3600) + ' hours'}</dd>`;
    if (!s.supported) {
      $('watchBody').innerHTML = `<div class="card"><h2><span class="lamp"></span>This computer</h2><dl class="facts">${vitals}</dl></div><p class="quiet">${esc(top.text)}</p>`;
      return;
    }
    const sec = s.security, d = sec.defender, u = s.updates, y = s.system, tone = (re) => { const a = s.advice.filter((x) => re.test(x.text)); return a.some((x) => x.tone === 'bad') ? 'bad' : a.some((x) => x.tone === 'warn') ? 'warn' : 'ok'; };
    const other = (sec.products || []).filter((n) => !/defender/i.test(n));
    let html = `<div class="card"><h2><span class="lamp ${d ? tone(/Defender|protection|definitions|scan|firewall|threat/i) : ''}"></span>Protection</h2><dl class="facts">
      ${d ? `<dt>Microsoft Defender</dt><dd>${other.length && (!d.enabled || /passive/i.test(d.mode || '')) ? `standing by: ${esc(other[0])} is the active antivirus` : `${d.enabled ? 'on' : 'off'}${d.mode && d.mode !== 'Normal' ? ` (${esc(d.mode)})` : ''}, real-time protection ${d.realtime ? 'on' : 'off'}`}</dd>
      <dt>Definitions</dt><dd>${d.sigAge < 1 ? 'updated today' : 'updated ' + ago(d.sigAge)}${d.sigVersion ? `, version ${esc(d.sigVersion)}` : ''}</dd>
      <dt>Last quick scan</dt><dd>${ago(d.quickAge)}${s.scanning ? ', one is running now' : ''}</dd>` : `<dt>Microsoft Defender</dt><dd>${esc(sec.defenderError || sec.error || 'could not be read')}</dd>`}
      ${other.length ? `<dt>Also installed</dt><dd>${esc(other.join(', '))}</dd>` : ''}
      <dt>Firewall</dt><dd>${sec.firewall && sec.firewall.length ? sec.firewall.map((f) => `${esc(f.name)} ${f.on ? 'on' : 'off'}`).join(', ') : esc(sec.firewallError || 'could not be read')}</dd>
      ${sec.threats !== undefined ? `<dt>Threats, 30 days</dt><dd>${sec.threats}</dd>` : ''}</dl>
      <div class="acts">${actBtn('defender.update', 'Update protection', { go: true, off: !d || !d.enabled })}${actBtn('defender.quickscan', 'Quick scan', { off: !d || !d.enabled || s.scanning, title: 'Takes a few minutes. Runs in the background.' })}${actBtn('open.security', 'Windows Security')}</div></div>`;
    const patch = u.lastPatch ? daysSince(u.lastPatch.on) : null, apps = s.apps && s.apps.items;
    html += `<div class="card"><h2><span class="lamp ${u.error ? '' : tone(/update|restart to finish/i)}"></span>Updates</h2><dl class="facts">
      <dt>Windows</dt><dd>${u.os ? `${esc(u.os.name)}, build ${esc(u.os.build)}` : esc(u.error || u.osError || 'could not be read')}</dd>
      <dt>Waiting</dt><dd>${u.pending ? (u.pending.length ? `${u.pending.length}: ${u.pending.slice(0, 4).map((p) => esc(p.title)).join('; ')}${u.pending.length > 4 ? ' …' : ''}` : 'nothing that Windows has found so far') : esc(u.pendingError || 'unknown')}${u.reboot ? '. A restart is pending.' : ''}</dd>
      ${patch !== null ? `<dt>Last installed</dt><dd>${ago(patch)}${u.lastPatch.id ? ` (${esc(u.lastPatch.id)})` : ''}</dd>` : ''}
      <dt>Apps</dt><dd>${apps ? (apps.length ? `${apps.length} with a newer version: ${apps.slice(0, 5).map((a) => esc(a.name)).join(', ')}${apps.length > 5 ? ' …' : ''}` : 'none with a newer version') : 'not checked yet'}</dd></dl>
      <div class="acts">${actBtn('updates.check', 'Check for updates', { go: true, title: 'Asks Windows Update online. Can take a minute.' })}${actBtn('open.update', 'Windows Update')}${actBtn('apps.check', 'Check apps', { title: 'Asks winget which of your programs have a newer version.' })}${apps && apps.length ? actBtn('apps.upgradeAll', 'Update apps…', { title: 'Opens a window where winget updates them.' }) : ''}</div></div>`;
    html += `<div class="card"><h2><span class="lamp ${tone(/Drive|Memory is|running for/i)}"></span>This computer</h2><dl class="facts">
      ${y.cpu ? `<dt>Processor</dt><dd>${esc(y.cpu.name)}, ${y.cpu.cores} cores</dd>` : ''}${y.gpu && y.gpu.length ? `<dt>Graphics</dt><dd>${esc(y.gpu.join(', '))}</dd>` : ''}${vitals}
      ${(y.disks || []).map((k) => `<dt>Drive ${esc(k.id)}</dt><dd>${GB(k.free)} free of ${GB(k.size)} ${bar(1 - k.free / k.size, k.free / k.size < 0.1 ? 'warn' : 'psy')}</dd>`).join('')}
      ${y.battery ? `<dt>Battery</dt><dd>${y.battery.pct}%${y.battery.status === 2 ? ', plugged in' : ''}</dd>` : ''}
      ${y.top && y.top.length ? `<dt>Most memory</dt><dd>${y.top.slice(0, 5).map((t) => `${esc(t.name)} ${t.mb} MB`).join(', ')}</dd>` : ''}
      ${y.startup ? `<dt>Start with Windows</dt><dd>${y.startup.length} program${y.startup.length === 1 ? '' : 's'}</dd>` : ''}</dl>
      <div class="acts">${actBtn('open.taskmgr', 'Task Manager')}${actBtn('open.storage', 'Storage')}${actBtn('open.startup', 'Startup apps')}</div></div>`;
    html += `<div class="card"><h2>What I would do</h2><ul class="advice">${s.advice.map((a) => `<li><span class="lamp ${a.tone}"></span><span>${esc(a.text)}</span>${a.act ? actBtn(a.act, a.label || 'Do it') : '<span></span>'}</li>`).join('')}</ul></div>`;
    $('watchBody').innerHTML = html;
  }

  // ---------------------------------------------------------------- tune: profiles, power plan, the walkthrough
  // The walkthrough builds "My own" profile one question at a time. Each question fills one step of the profile
  // (the steps and their allowed values are STEP_CHOICES in guardian.js; anything else is dropped there).
  const STARTS = [
    ['Play', 'Games, alone or online', { plan: 'high', boost: 'keep', maxProc: 100, gameMode: true, flushDns: true, quiet: true }],
    ['Heavy work', 'Rendering, compiling, exporting', { plan: 'high', boost: 2, maxProc: 100, gameMode: 'keep', flushDns: false, quiet: true }],
    ['Cool and quiet', 'Less heat and fan noise', { plan: 'balanced', boost: 3, maxProc: 99, gameMode: 'keep', flushDns: false, quiet: false }],
    ['Long battery', 'Away from the charger', { plan: 'saver', boost: 0, maxProc: 80, gameMode: 'keep', flushDns: false, quiet: true }],
  ];
  const QUESTIONS = [
    ['start', 'What is this profile for?', 'Pick the closest. It only sets a starting point; you can change every answer after it.'],
    ['plan', 'Which Windows power plan?', 'The plan sets how eagerly Windows spends power. I only offer the plans this PC has.'],
    ['boost', 'How should the processor use its turbo boost while plugged in?', 'Aggressive is the fastest and the hottest. Efficient gives most of the speed with less heat. Off keeps it cool and quiet, and slower.'],
    ['maxProc', 'How far may the processor go while plugged in?', '100% is everything it has. 99% is a known trick: it switches turbo off and keeps a laptop cooler. Lower saves more.'],
    ['gameMode', 'Windows Game Mode?', 'Game Mode gives the game in front priority and holds back updates and notifications while you play.'],
    ['extras', 'Two last things', 'Clearing the DNS cache makes the next lookups fresh, which can help after network trouble. Stepping aside means Screen Trainer stops spawning wild Pokémon, weather and visits and keeps its effects subtle, so nothing of mine costs you frames.'],
    ['review', 'This is your profile', 'Save it, or save it and put it into effect now. Whatever it changes, "Undo" puts back exactly.'],
  ];
  function walkHtml() {
    const [key, q, why] = QUESTIONS[walk.i], w = walk.steps, plans = (status && status.power && status.power.ok ? status.power.plans : []).map((p) => p.guid);
    const GUID = { balanced: '381b4222-f694-41f0-9685-ff5bb260df2e', high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', saver: 'a1841308-3541-4fab-bc81-f71556f20b4a', ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61' };
    const opt = (k, v, label) => `<button class="btn ${String(w[k]) === String(v) ? 'on' : ''}" data-walk="${k}" data-v="${esc(v)}">${esc(label)}</button>`;
    let body = '';
    if (key === 'start') body = STARTS.map((s, i) => `<button class="btn" data-start="${i}" title="${esc(s[1])}">${esc(s[0])}</button>`).join('');
    else if (key === 'plan') body = opt('plan', 'keep', 'Leave it as it is') + ['balanced', 'high', 'ultimate', 'saver'].filter((p) => !plans.length || plans.includes(GUID[p])).map((p) => opt('plan', p, prof.planNames[p])).join('');
    else if (key === 'boost') body = opt('boost', 'keep', 'Leave it') + [2, 4, 1, 3, 0].map((v) => opt('boost', v, prof.boostNames[v])).join('');
    else if (key === 'maxProc') body = opt('maxProc', 'keep', 'Leave it') + [100, 99, 90, 80, 70, 60, 50].map((v) => opt('maxProc', v, v + '%')).join('');
    else if (key === 'gameMode') body = opt('gameMode', 'keep', 'Leave it') + opt('gameMode', true, 'On') + opt('gameMode', false, 'Off');
    else if (key === 'extras') body = [['flushDns', 'Clear the DNS cache'], ['quiet', 'Screen Trainer steps aside']].map(([k, label]) => `<button class="btn ${w[k] ? 'on' : ''}" data-walk="${k}" data-v="${!w[k]}">${w[k] ? '✓ ' : ''}${label}</button>`).join('');
    else body = `<ul class="does">${walk.does.length ? walk.does.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>It changes nothing yet. Go back and choose something.</li>'}</ul>`;
    return `<div class="walk"><div class="steps">Step ${walk.i + 1} of ${QUESTIONS.length}</div><h3>${esc(q)}</h3><div class="q">${esc(why)}</div><div class="opts">${body}</div>
      <div class="acts">${walk.i > 0 ? '<button class="btn" data-walknav="-1">Back</button>' : ''}${key !== 'review' && key !== 'start' ? '<button class="btn go" data-walknav="1">Next</button>' : ''}${key === 'review' ? `<button class="btn go" data-walksave="apply" ${walk.does.length ? '' : 'disabled'}>Save and apply</button><button class="btn" data-walksave="save" ${walk.does.length ? '' : 'disabled'}>Save</button>` : ''}<button class="btn" data-walknav="0">Cancel</button></div></div>`;
  }
  async function walkTo(i) {
    walk.i = Math.max(0, Math.min(QUESTIONS.length - 1, i));
    if (QUESTIONS[walk.i][0] === 'review') { const r = await g.preview(walk.steps); walk.does = r && r.does ? r.does : []; }
    say(QUESTIONS[walk.i][1], 'info');
    renderTune();
  }
  function renderTune() {
    if (!prof) return;
    const ap = prof.applied, win = status ? status.supported : info.windows, pw = status && status.power && status.power.ok ? status.power : null;
    let html = '';
    if (!win) html += '<p class="quiet">Profiles change Windows power settings, so they need Windows. You can still look around.</p>';
    if (ap) html += `<div class="card banner"><h2><span class="lamp ok"></span>${esc(ap.name)} is in effect<span class="move">since ${esc(clock(ap.at))}</span></h2>
      ${ap.did.length ? `<ul class="does">${ap.did.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="quiet">This PC was already set that way, so nothing needed changing.</p>'}
      ${ap.skipped.length ? `<ul class="does skipped">${ap.skipped.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="acts"><button class="btn go" data-undo="1">Undo: put everything back</button></div></div>`;
    if (walk) html += walkHtml();
    for (const p of prof.list) {
      const mine = p.id === 'custom', on = ap && ap.id === p.id;
      html += `<div class="card"><h2>${esc(p.name)}<span class="move">${esc(p.move)}</span></h2><div>${esc(p.blurb)}</div>
        ${p.does.length ? `<ul class="does">${p.does.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="acts">${p.steps ? `<button class="btn go" data-apply="${esc(p.id)}" ${!win || on ? 'disabled' : ''}>${on ? 'In effect' : 'Apply'}</button>` : ''}${mine ? `<button class="btn ${p.steps ? '' : 'go'}" data-walkstart="1">${p.steps ? 'Change it with Mewtwo' : 'Set it up with Mewtwo'}</button>` : ''}</div></div>`;
    }
    if (pw) html += `<div class="card"><h2>Power plan</h2><div class="quiet">Now: ${esc(pw.activeName)}${pw.boost ? `, boost ${esc(prof.boostNames[pw.boost.ac] || pw.boost.ac)} while plugged in` : ''}${pw.maxProc ? `, processor up to ${pw.maxProc.ac}%` : ''}.</div>
      <div class="plan">${pw.plans.map((x) => actBtn('power.plan', x.name, { arg: x.guid, on: x.active, off: x.active })).join('')}${actBtn('open.power', 'Power settings')}${actBtn('open.gamemode', 'Game Mode')}</div></div>`;
    html += '<p class="quiet">Nothing here needs administrator rights, deletes anything, or touches voltages, clock multipliers or fans. Every profile remembers what it changed, and Undo puts it back.</p>';
    $('tuneBody').innerHTML = html;
  }
  $('tuneBody').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.walkstart) { const mine = prof.list.find((p) => p.id === 'custom').steps; walk = { i: mine ? 1 : 0, steps: Object.assign({ plan: 'keep', boost: 'keep', maxProc: 'keep', gameMode: 'keep', flushDns: false, quiet: false }, mine || {}), does: [] }; ui('select'); await walkTo(walk.i); $('tuneBody').scrollTop = 0; }
    else if (b.dataset.start !== undefined) { walk.steps = Object.assign({}, STARTS[+b.dataset.start][2]); ui('select'); await walkTo(1); }
    else if (b.dataset.walk) { const k = b.dataset.walk, raw = b.dataset.v; walk.steps[k] = raw === 'true' ? true : raw === 'false' ? false : raw === 'keep' || isNaN(+raw) ? raw : +raw; ui('scroll'); renderTune(); }
    else if (b.dataset.walknav !== undefined) {
      const d = +b.dataset.walknav;
      if (d === 0) { walk = null; ui('close'); renderTune(); renderWatch(); } else { ui('page'); await walkTo(walk.i + d); }
    } else if (b.dataset.walksave) {
      const r = await g.saveCustom(walk.steps), apply = b.dataset.walksave === 'apply';
      walk = null; prof = await g.profiles(); ui('save');
      if (r.ok && apply) await applyProfile('custom', null); else { say('Saved. It waits under "My own".', 'ok'); renderTune(); }
    } else if (b.dataset.apply) { if (!arm(b, 'Change these settings? Click again')) return; await busy(b, () => applyProfile(b.dataset.apply, b)); }
    else if (b.dataset.undo) { if (!arm(b, 'Put everything back? Click again')) return; await busy(b, async () => { const r = await g.undo(); say(r.text, r.ok ? 'ok' : 'warn'); ui(r.ok ? 'save' : 'error'); await load(true); }); }
    else if (b.dataset.act) await doAct(b);
  });
  async function applyProfile(id) {
    const r = await g.apply(id);
    say(r.ok ? `${r.move}! ${r.text}${r.skipped && r.skipped.length ? ' Some things I had to leave: see below.' : ''}` : r.text, r.ok ? 'ok' : 'warn');
    ui(r.ok ? 'save' : 'error');
    await load(true);
    $('tuneBody').scrollTop = 0;
  }

  // ---------------------------------------------------------------- abilities
  async function doAct(btn) {
    const id = btn.dataset.act;
    if (NEEDS_CONFIRM.has(id) && !arm(btn)) return;
    ui('select');
    if (id === 'defender.quickscan') say('Barrier! I am scanning. This takes a few minutes; I will tell you when it is done.', 'info');
    else if (id === 'updates.check') say('Future Sight… asking Windows Update. This can take a minute.', 'info');
    else if (id === 'apps.check') say('Asking winget about your programs…', 'info');
    await busy(btn, async () => {
      const r = await g.act(id, btn.dataset.arg);
      if (r.text) say((r.ok && r.move ? r.move + '! ' : '') + r.text, r.ok ? 'ok' : 'warn');
      if (!id.startsWith('open.')) await load(true);
    });
  }
  $('watchBody').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) doAct(b); });

  // ---------------------------------------------------------------- ask
  const QUICK = ['How is my computer?', 'Am I protected?', 'Are updates waiting?', 'Why might it be slow?', 'What does Limited overclock do?'];
  $('quick').innerHTML = QUICK.map((q) => `<button class="chip" type="button">${esc(q)}</button>`).join('');
  function addMsg(who, text, o = {}) {
    const el = document.createElement('div');
    el.className = `msg ${who}${o.fail ? ' fail' : ''}`;
    el.textContent = text;
    if (o.by) { const s = document.createElement('small'); s.textContent = o.by; el.appendChild(s); }
    if (o.proposal) {
      const box = document.createElement('div'), list = document.createElement('ul'), acts = document.createElement('div');
      list.className = 'does'; for (const d of o.proposal.does) { const li = document.createElement('li'); li.textContent = d; list.appendChild(li); }
      acts.className = 'acts';
      for (const [mode, label] of [['apply', 'Save as my own and apply'], ['save', 'Save as my own']]) { const b = document.createElement('button'); b.className = 'btn' + (mode === 'apply' ? ' go' : ''); b.textContent = label; b.addEventListener('click', async () => { if (mode === 'apply' && !arm(b, 'Change these settings? Click again')) return; const r = await g.saveCustom(o.proposal.steps); prof = await g.profiles(); if (r.ok && mode === 'apply') { await applyProfile('custom'); show('tune'); } else { say('Saved. It waits under Tune, "My own".', 'ok'); ui('save'); renderTune(); } }); acts.appendChild(b); }
      box.appendChild(list); box.appendChild(acts); el.appendChild(box);
    }
    $('chat').appendChild(el); $('chat').scrollTop = $('chat').scrollHeight;
    return el;
  }
  async function ask(q) {
    q = String(q || '').trim();
    if (!q || thinking) return;
    thinking = true; $('send').disabled = true;
    addMsg('me', q); history.push({ role: 'user', content: q });
    const wait = addMsg('it', '…');
    const r = await g.ask(history).catch((e) => ({ ok: false, text: 'I could not answer: ' + e.message }));
    wait.remove();
    addMsg('it', r.text || 'I have no answer.', { by: r.by ? 'answered by ' + r.by : '', fail: !r.ok, proposal: r.proposal });
    if (r.ok) history.push({ role: 'assistant', content: r.text }); else history.pop();
    ui(r.ok ? 'select' : 'error');
    thinking = false; $('send').disabled = false; $('question').focus();
  }
  $('askForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('question').value; $('question').value = ''; ask(q); });
  $('quick').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) ask(c.textContent); });

  // who answers
  const NOTE = {
    none: 'I answer from my own checks: quick and private, but only about what I can see.',
    local: 'A model running on this computer: nothing leaves it. Start the model first in a program that serves it (LM Studio, Ollama, or llama.cpp\'s server); I talk to that program and do not load model files myself. "Find" looks for one.',
    claude: 'Needs an API key from Anthropic (console.anthropic.com). Your questions, and the summary of this computer if you tick the box, go to that service.',
    grok: 'Needs an API key from xAI (console.x.ai). Your questions, and the summary of this computer if you tick the box, go to that service.',
    custom: 'Any service that speaks the OpenAI chat format, for example your own bot. Give its address ending in /v1.',
  };
  function renderAi() {
    if (!ai) return;
    const p = ai.providers.find((x) => x.id === ai.provider) || ai.providers[0], isAi = ai.provider !== 'none';
    if (!$('aiProvider').options.length) $('aiProvider').innerHTML = ai.providers.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
    $('aiProvider').value = ai.provider;
    for (const el of document.querySelectorAll('.needs-ai')) el.hidden = !isAi;
    for (const el of document.querySelectorAll('.needs-url')) el.hidden = !(ai.provider === 'local' || ai.provider === 'custom');
    for (const el of document.querySelectorAll('.needs-key')) el.hidden = !p.key;
    $('aiDetect').hidden = ai.provider !== 'local';
    if (document.activeElement !== $('aiUrl')) $('aiUrl').value = ai.url || '';
    if (document.activeElement !== $('aiModel')) $('aiModel').value = ai.model || '';
    $('aiKey').value = ''; $('aiKey').placeholder = ai.hasKey ? (ai.keySaved ? 'a key is saved' : 'a key is held until you close Screen Trainer') : p.key === 'optional' ? 'only if the service needs one' : 'paste your key';
    $('aiForget').hidden = !ai.hasKey;
    $('aiShare').checked = !!ai.share;
    $('aiNow').textContent = isAi ? `${p.label}${ai.model ? ' (' + ai.model + ')' : ''}` : 'Mewtwo, from its own checks';
    $('aiNote').textContent = NOTE[ai.provider] + (p.key && !ai.canStoreKey ? ' On this system the key cannot be stored safely, so it is kept only until Screen Trainer closes.' : p.key ? ' The key is stored encrypted on this PC and is only ever sent to that service.' : '');
  }
  const setAi = async (cfg) => { ai = await g.aiSet(cfg); renderAi(); };
  $('aiProvider').addEventListener('change', () => { ui('select'); setAi({ provider: $('aiProvider').value }); });
  $('aiUrl').addEventListener('change', () => setAi({ url: $('aiUrl').value }));
  $('aiModel').addEventListener('change', () => setAi({ model: $('aiModel').value }));
  $('aiKey').addEventListener('change', () => { if ($('aiKey').value.trim()) setAi({ key: $('aiKey').value }); });
  $('aiForget').addEventListener('click', () => setAi({ key: '' }));
  $('aiShare').addEventListener('change', () => setAi({ share: $('aiShare').checked }));
  const fillModels = (models) => { $('aiModels').innerHTML = models.map((m) => `<option value="${esc(m)}">`).join(''); };
  $('aiDetect').addEventListener('click', () => busy($('aiDetect'), async () => {
    const found = await g.aiDetect();
    if (!found.length) { $('aiNote').textContent = 'I found no model server on this computer. Start your model in LM Studio, Ollama or llama.cpp\'s server, then press Find again.'; ui('error'); return; }
    const f = found[0]; fillModels(f.models);
    await setAi({ url: f.url, model: ai.model && f.models.includes(ai.model) ? ai.model : f.models[0] || '' });
    $('aiNote').textContent = `Found ${f.name} at ${f.url} with ${f.models.length} model${f.models.length === 1 ? '' : 's'}${found.length > 1 ? `, and ${found.length - 1} more server${found.length > 2 ? 's' : ''}` : ''}.`; ui('save');
  }));
  $('aiList').addEventListener('click', () => busy($('aiList'), async () => { const r = await g.aiModels(); fillModels(r.models); $('aiNote').textContent = r.ok ? `${r.models.length} models: ${r.models.slice(0, 12).join(', ')}${r.models.length > 12 ? ' …' : ''}` : (r.error || 'The service gave no list.') + ' You can type the model name yourself.'; }));

  // ---------------------------------------------------------------- log
  async function renderLog() {
    const list = await g.log();
    $('logBody').innerHTML = list.length ? list.map((e) => `<div class="entry"><span class="lamp ${e.ok ? 'ok' : 'warn'}"></span><div><time>${esc(clock(e.at))}</time>${esc(e.what)}${e.detail ? `<div class="quiet">${esc(e.detail)}</div>` : ''}</div></div>`).join('')
      : '<p class="quiet">Nothing yet. Everything I change on this computer is written down here.</p>';
  }

  // ---------------------------------------------------------------- screens and loading
  function show(name) {
    tab = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === name));
    document.querySelectorAll('#tabs .tab[data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    if (name === 'log') renderLog();
    if (name === 'tune') renderTune();
    if (name === 'ask') { say(ai && ai.provider !== 'none' ? 'Ask. I will consult the mind you connected.' : 'Ask. I answer from what I can see myself.', 'info'); $('question').focus(); }
    else if (status && !walk) say(status.advice[0].text, status.advice[0].tone);
  }
  $('tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; ui('page'); if (t.dataset.tab) show(t.dataset.tab); else load(true); });
  let loading = null;
  function load(force) {
    if (loading) return loading;
    loading = (async () => {
      try { [status, prof] = await Promise.all([g.status({ force: !!force }), g.profiles()]); renderWatch(); if (tab === 'tune') renderTune(); if (tab === 'log') renderLog(); }
      catch (e) { $('watchBody').innerHTML = `<p class="quiet">${esc(e.message)}</p>`; }
      loading = null;
    })();
    return loading;
  }
  $('frame').addEventListener('scroll', (e) => { e.currentTarget.scrollTop = 0; });
  $('winMin').addEventListener('click', () => st.winMinimize());
  $('winClose').addEventListener('click', () => { ui('close'); setTimeout(() => st.winClose(), 90); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.matches('input, select')) st.winClose(); });
  ai = await g.ai(); renderAi();
  await load(false);
  setInterval(() => { if (!document.hidden && !walk) load(false); }, 20000);
})();
