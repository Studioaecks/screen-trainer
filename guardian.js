// Screen Trainer — Mewtwo's abilities (main process): looking after the computer it lives on.
//
//   watch      Windows security (Defender, firewall), Windows Update, hardware and what is using it
//   act        a short, fixed list of safe actions (ACTIONS below): update protection, quick scan, flush DNS,
//              switch power plan, open the right Windows settings page ...
//   profiles   tune-up profiles (online gaming, limited overclock, everyday, your own) that remember what
//              they changed and can be undone exactly
//   ask        questions to Mewtwo: answered from its own checks, or by an AI the user connects
//              (a local model server, Claude, Grok or any OpenAI-compatible endpoint)
//
// Rules this file keeps, and that a change must keep too:
//   1. Nothing here needs administrator rights, and nothing asks for them.
//      (One exception since 0.9.9, the owner's decision of 2026-11-17, and it is not in this file: sentinel.js may
//      cut one AI program off from the internet with psiblock.ps1. Windows asks the owner each time; see its rules.)
//   2. Every command line is fixed text. The only values ever put into one are GUIDs and numbers that
//      passed `isGuid` / `clampInt`. Text from the user or from an AI never reaches a command line.
//   3. Reading is free; anything that changes the computer happens only when the user asks for it in
//      Mewtwo's window, is written to the log, and (for profiles) can be undone.
//   4. Nothing is deleted. Cleaning up is handed to Windows' own tools.
//   5. An AI can only *propose* a profile (validated by cleanSteps); it cannot run anything.
//
//   6. PowerShell is only ever given one of the six script files in ./ps, by name. No script text is built here.
//
// Everything Windows-specific goes through `run`, which tools/guardiancheck.js replaces with a pretend
// computer, so parsing, profiles and undo are tested without Windows.
'use strict';
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let WIN = process.platform === 'win32';
const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const EXE = { ps: path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), powercfg: path.join(SYS32, 'powercfg.exe'), reg: path.join(SYS32, 'reg.exe'), ipconfig: path.join(SYS32, 'ipconfig.exe'), cmd: path.join(SYS32, 'cmd.exe') };

// ------------------------------------------------------------------ running things
/** run a program with fixed arguments; never throws. -> { ok, code, out, err, ms } */
let run = (file, args, opts = {}) => new Promise((resolve) => {
  const t0 = Date.now();
  execFile(file, args, { windowsHide: true, timeout: opts.timeout || 30000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
    resolve({ ok: !error, code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, out: String(stdout || ''), err: String(stderr || (error && error.killed ? 'timed out' : '') || ''), ms: Date.now() - t0 });
  });
});
// What Mewtwo asks PowerShell is not text built here: it is six small script files in the "ps" folder beside this
// file, readable by anyone, run with -File. (Scripts passed as -EncodedCommand look like malware to antivirus tools.)
const SCRIPTS = ['security', 'updates', 'system', 'winget', 'sigupdate', 'quickscan'];
const scriptFile = (name) => path.join(__dirname, 'ps', name + '.ps1');
const ps = (name, timeout, flags = []) => (SCRIPTS.includes(name) ? run(EXE.ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile(name), ...flags], { timeout }) : Promise.resolve({ ok: false, code: -1, out: '', err: 'no such script', ms: 0 }));
/** a script that prints one JSON object as its last line */
async function psJson(name, timeout, flags) {
  const r = await ps(name, timeout, flags);
  const text = r.out.trim(), at = text.lastIndexOf('\n{') >= 0 ? text.lastIndexOf('\n{') + 1 : text.indexOf('{');
  try { return { ok: true, data: JSON.parse(at >= 0 ? text.slice(at) : text), ms: r.ms }; } catch (e) { return { ok: false, error: (r.err || r.out || 'no answer').trim().split('\n')[0].slice(0, 300), ms: r.ms }; }
}
const isGuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v) || 0));
const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);       // PowerShell turns a one-item list into the item

// ------------------------------------------------------------------ power plans (powercfg)
const PLAN = { balanced: '381b4222-f694-41f0-9685-ff5bb260df2e', high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', saver: 'a1841308-3541-4fab-bc81-f71556f20b4a', ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61' };
const PLAN_NAME = { balanced: 'Balanced', high: 'High performance', saver: 'Power saver', ultimate: 'Ultimate performance' };
const SUB_PROCESSOR = '54533251-82be-4824-96c1-47b60b740d00';
const SET = { boost: 'be337238-0d82-4146-a960-4f3749d470c7', maxProc: 'bc5038f7-23e0-4960-96da-33abaf5935ec' };     // boost mode, maximum processor state
const BOOST_NAME = ['Off', 'On', 'Aggressive', 'Efficient', 'Efficient aggressive', 'Aggressive at guaranteed', 'Efficient aggressive at guaranteed'];

function parsePlans(text) {
  const plans = [];
  for (const m of String(text).matchAll(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.*?)\)\s*(\*)?/gi)) plans.push({ guid: m[1].toLowerCase(), name: m[2], active: !!m[3] });
  return plans;
}
/** the plugged-in and on-battery value of one setting, from `powercfg /qh` (matched by GUID and hex, so any Windows language works) */
function parseSetting(text, guid) {
  const chunk = String(text).split(/(?=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i).find((c) => c.toLowerCase().startsWith(guid));
  if (!chunk) return null;
  const end = chunk.slice(36).search(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const hex = [...(end < 0 ? chunk : chunk.slice(0, 36 + end)).matchAll(/0x([0-9a-f]{8})/gi)].map((m) => parseInt(m[1], 16));
  return hex.length >= 2 ? { ac: hex[hex.length - 2], dc: hex[hex.length - 1] } : null;
}
async function readPower() {
  if (!WIN) return { ok: false, error: 'Needs Windows.' };
  const list = await run(EXE.powercfg, ['/list']);
  const plans = parsePlans(list.out), active = plans.find((p) => p.active) || null;
  if (!plans.length) return { ok: false, error: (list.err || list.out || 'powercfg gave no answer').trim().slice(0, 200) };
  const q = await run(EXE.powercfg, ['/qh', 'SCHEME_CURRENT', SUB_PROCESSOR]);
  return { ok: true, plans, active: active ? active.guid : null, activeName: active ? active.name : '', boost: parseSetting(q.out, SET.boost), maxProc: parseSetting(q.out, SET.maxProc) };
}
async function setPlan(guid) {
  if (!isGuid(guid)) return { ok: false, error: 'Not a power plan.' };
  const r = await run(EXE.powercfg, ['/setactive', guid.toLowerCase()]);
  return { ok: r.ok, error: r.ok ? '' : (r.err || r.out).trim().slice(0, 200) };
}
/** set the plugged-in value of a processor setting on a plan, then make it take effect */
async function setProcAc(scheme, setting, value) {
  if (!(scheme === 'SCHEME_CURRENT' || isGuid(scheme)) || !isGuid(setting)) return { ok: false, error: 'Not a power setting.' };
  const r = await run(EXE.powercfg, ['/setacvalueindex', scheme, SUB_PROCESSOR, setting, String(clampInt(value, 0, 100))]);
  if (r.ok) await run(EXE.powercfg, ['/setactive', 'SCHEME_CURRENT']);
  return { ok: r.ok, error: r.ok ? '' : (r.err || r.out).trim().slice(0, 200) };
}
const GAMEBAR = 'HKCU\\Software\\Microsoft\\GameBar';
async function setGameMode(value) {                       // 1, 0, or null = remove the value (Windows' default: on)
  const r = value === null || value === undefined
    ? await run(EXE.reg, ['delete', GAMEBAR, '/v', 'AutoGameModeEnabled', '/f'])
    : await run(EXE.reg, ['add', GAMEBAR, '/v', 'AutoGameModeEnabled', '/t', 'REG_DWORD', '/d', value ? '1' : '0', '/f']);
  return { ok: r.ok || value === null, error: r.ok ? '' : (r.err || r.out).trim().slice(0, 200) };
}

// ------------------------------------------------------------------ state on disk: guardian.json next to the save
let deps = { userDir: os.tmpdir(), safeStorage: null, shell: null, getSettings: () => ({}), setSettings: () => {}, say: () => {} };
let state = null, memKey = '';
const stateFile = () => path.join(deps.userDir, 'guardian.json');
const AI_DEFAULT = { provider: 'none', url: '', model: '', key: '', share: true };
function load() {
  if (state) return state;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { /* first run */ }
  raw = raw && typeof raw === 'object' ? raw : {};
  state = { ai: Object.assign({}, AI_DEFAULT, raw.ai && typeof raw.ai === 'object' ? raw.ai : {}), custom: cleanSteps(raw.custom) || null, applied: raw.applied && raw.applied.undo ? raw.applied : null, log: Array.isArray(raw.log) ? raw.log.slice(-60) : [] };
  return state;
}
function persist() {
  try { fs.mkdirSync(deps.userDir, { recursive: true }); const tmp = stateFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2)); fs.renameSync(tmp, stateFile()); } catch (e) { console.error('guardian state', e.message); }
}
function note(what, ok, detail) {
  load().log.push({ at: Date.now(), what, ok: !!ok, detail: String(detail || '').slice(0, 300) });
  if (state.log.length > 60) state.log = state.log.slice(-60);
  persist();
}

// ------------------------------------------------------------------ watching
const cache = {};
async function section(name, fn, maxAge, force) {
  const c = cache[name];
  if (!force && c && Date.now() - c.at < maxAge) return c.v;
  if (c && c.busy) return c.busy;
  const p = fn().then((v) => { cache[name] = { at: Date.now(), v }; return v; }, (e) => { cache[name] = { at: Date.now(), v: { ok: false, error: String(e && e.message || e) } }; return cache[name].v; });
  cache[name] = Object.assign(c || { at: 0, v: null }, { busy: p });
  return p;
}
function cpuLoad() {                                       // share of the last half second the processor was busy
  const snap = () => os.cpus().map((c) => ({ idle: c.times.idle, all: Object.values(c.times).reduce((a, b) => a + b, 0) }));
  const a = snap();
  return new Promise((resolve) => setTimeout(() => { const b = snap(); let idle = 0, all = 0; b.forEach((c, i) => { idle += c.idle - a[i].idle; all += c.all - a[i].all; }); resolve(all > 0 ? Math.round((1 - idle / all) * 100) : 0); }, 450));
}
async function vitals() {
  const total = os.totalmem(), free = os.freemem();
  return { load: await cpuLoad(), memTotal: total, memUsed: total - free, uptime: os.uptime(), host: os.hostname(), cores: os.cpus().length };
}
const readSecurity = (force) => section('security', async () => (WIN ? psJson('security', 30000) : { ok: false, error: 'Needs Windows.' }), 120000, force);
const readUpdates = (force, online) => section('updates', async () => (WIN ? psJson('updates', online ? 240000 : 60000, online ? ['-Online'] : []) : { ok: false, error: 'Needs Windows.' }), online ? 0 : 600000, force || online);
const readSystem = (force) => section('system', async () => (WIN ? psJson('system', 45000) : { ok: false, error: 'Needs Windows.' }), 60000, force);
const readPowerCached = (force) => section('power', readPower, 15000, force);

/** the table `winget upgrade` prints: Name, Id, Version, Available, Source. Read by column position, so any wording of the headings works. */
function parseWinget(text) {
  const lines = String(text).split(/[\r\n]+/).map((l) => l.replace(/[\u2580-\u259f]/g, '').trimEnd()).filter((l) => l.trim() && !/^\s*[-\\|/]\s*$/.test(l));
  const isRule = (l) => /^-{10,}$/.test(l.trim());
  const dash = lines.findIndex(isRule);
  if (dash < 1) return { items: [], raw: lines.slice(-12).join('\n') };
  const head = lines[dash - 1], cols = [...head.matchAll(/\S+/g)].map((m) => m.index), items = [];
  if (cols.length < 4) return { items, raw: lines.slice(-12).join('\n') };
  const cell = (l, i) => l.slice(cols[i], i + 1 < cols.length ? cols[i + 1] : undefined).trim();
  for (const l of lines.slice(dash + 1)) {
    // the table ends at the first line that does not reach the "Available" column: the closing "N upgrades available."
    // (what follows it, a second table of pinned packages, is not ours)
    if (isRule(l) || items.length >= 200 || l.length <= cols[3] || !cell(l, 0) || !cell(l, 2) || !cell(l, 3)) break;
    items.push({ name: cell(l, 0), id: cell(l, 1), from: cell(l, 2), to: cell(l, 3) });
  }
  return { items, raw: '' };
}

/** everything Mewtwo knows right now. sections: which to read (default: all the quick ones) */
async function status(o = {}) {
  load();
  const [v, sec, upd, sys, pow] = await Promise.all([vitals(), readSecurity(o.force), readUpdates(o.force, false), readSystem(o.force), readPowerCached(o.force)]);
  const st = { at: Date.now(), supported: WIN, vitals: v, security: sec.ok ? sec.data : { error: sec.error }, updates: upd.ok ? upd.data : { error: upd.error }, system: sys.ok ? sys.data : { error: sys.error }, power: pow,
    apps: cache.apps && cache.apps.v ? cache.apps.v : null, applied: state.applied ? { id: state.applied.id, name: state.applied.name, at: state.applied.at } : null, scanning: !!busy.quickscan };
  for (const k of ['firewall', 'products']) if (st.security[k] !== undefined) st.security[k] = arr(st.security[k]);
  if (st.updates.pending !== undefined) st.updates.pending = arr(st.updates.pending);
  for (const k of ['gpu', 'disks', 'top', 'startup']) if (st.system[k] !== undefined) st.system[k] = arr(st.system[k]);
  st.advice = advise(st);
  return st;
}

const GB = (b) => (b / 1073741824).toFixed(b > 107374182400 ? 0 : 1) + ' GB';
const days = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)) : null);
/** what Mewtwo would point out, most serious first. tone: bad | warn | ok | info. act: an ACTIONS id that would help */
function advise(st) {
  const out = [], add = (tone, text, act, label) => out.push({ tone, text, act: act || '', label: label || '' });
  if (!st.supported) { add('info', 'My senses for security, updates and tuning are made for Windows. Here I can only tell you about memory and processor load.'); return out; }
  const d = st.security.defender, other = (st.security.products || []).filter((n) => !/defender/i.test(n));
  if (d) {
    // With another antivirus installed, Windows puts Defender in passive mode: it stays "enabled" but leaves real-time
    // protection to the other product. That is how it should be, not a fault.
    const standby = other.length > 0 && (!d.enabled || /passive/i.test(d.mode || ''));
    if (standby) add('ok', `${other[0]} is guarding this PC; Microsoft Defender stands by behind it.`);
    else if (!d.enabled) add('bad', 'Microsoft Defender antivirus is switched off.', 'open.security', 'Open Windows Security');
    else if (!d.realtime) add('bad', 'Real-time protection is off. Nothing is being checked as it arrives.', 'open.security', 'Open Windows Security');
    if (d.enabled && !standby && d.sigAge >= 7 && d.sigAge < 4e9) add('warn', `Protection definitions are ${Math.round(d.sigAge)} days old.`, 'defender.update', 'Update protection');
    if (d.enabled && !standby && d.quickAge >= 14) add('warn', d.quickAge > 4e9 ? 'No quick scan has ever been run.' : `The last quick scan was ${Math.round(d.quickAge)} days ago.`, 'defender.quickscan', 'Quick scan');
  } else if (other.length) add('ok', `${other[0]} is guarding this PC.`);
  else if (st.security.defenderError || st.security.error) add('info', 'I could not read Microsoft Defender on this PC.');
  const fwOff = (st.security.firewall || []).filter((f) => !f.on).map((f) => f.name);
  if (fwOff.length) add('bad', `The firewall is off for: ${fwOff.join(', ')}.`, 'open.firewall', 'Open firewall settings');
  if (st.security.threats > 0) add('warn', `Defender dealt with ${st.security.threats} threat${st.security.threats === 1 ? '' : 's'} in the last 30 days.`, 'open.security', 'See protection history');
  const u = st.updates;
  if (u.reboot) add('warn', 'Windows is waiting for a restart to finish installing updates.');
  if (u.pending && u.pending.length) add('warn', `${u.pending.length} Windows update${u.pending.length === 1 ? ' is' : 's are'} waiting.`, 'open.update', 'Open Windows Update');
  const patch = u.lastPatch ? days(u.lastPatch.on) : null;
  if (patch !== null && patch > 45 && !(u.pending && u.pending.length)) add('warn', `Windows last installed an update ${patch} days ago.`, 'updates.check', 'Check for updates');
  if (st.apps && st.apps.items && st.apps.items.length) add('info', `${st.apps.items.length} app${st.apps.items.length === 1 ? ' has' : 's have'} a newer version.`, 'apps.upgradeAll', 'Update apps…');
  for (const k of st.system.disks || []) if (k.size > 0 && k.free / k.size < 0.1) add(k.free / k.size < 0.05 ? 'bad' : 'warn', `Drive ${k.id} has only ${GB(k.free)} free.`, 'open.storage', 'Open Storage');
  const mem = st.vitals.memTotal ? st.vitals.memUsed / st.vitals.memTotal : 0;
  if (mem > 0.9) add('warn', `Memory is ${Math.round(mem * 100)}% full.${st.system.top && st.system.top[0] ? ` ${st.system.top[0].name} holds the most (${st.system.top[0].mb} MB).` : ''}`, 'open.taskmgr', 'Open Task Manager');
  if ((st.system.startup || []).length > 12) add('info', `${st.system.startup.length} programs start with Windows.`, 'open.startup', 'Open Startup apps');
  if (st.vitals.uptime > 10 * 86400) add('info', `This PC has been running for ${Math.round(st.vitals.uptime / 86400)} days without a restart.`);
  if (st.applied) add('info', `The "${st.applied.name}" profile is in effect.`);
  if (!out.some((a) => a.tone === 'bad' || a.tone === 'warn')) add('ok', 'I find nothing that needs you.');
  const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ------------------------------------------------------------------ actions the window may ask for
// (the tables below have no prototype, so a name like "constructor" sent by a window finds nothing)
const table = (o) => Object.assign(Object.create(null), o);
const OPEN = table({                                       // pages of Windows itself, opened with the system handler
  'open.security': 'windowsdefender:', 'open.firewall': 'windowsdefender://network/', 'open.update': 'ms-settings:windowsupdate', 'open.storage': 'ms-settings:storagesense',
  'open.startup': 'ms-settings:startupapps', 'open.power': 'ms-settings:powersleep', 'open.gamemode': 'ms-settings:gaming-gamemode', 'open.taskmgr': 'taskmgr:',
});
const busy = {};
const once = async (key, fn) => { if (busy[key]) return { ok: false, text: 'That is already running.' }; busy[key] = true; try { return await fn(); } finally { busy[key] = false; } };
// label: on the button. move: the name Mewtwo gives the ability. changes: true when it alters the computer (logged).
// long (0.9.5): it can take minutes; Mewtwo dives off the screen while it runs and comes back with the answer (main.js).
const ACTIONS = table({
  'defender.update': { label: 'Update protection', move: 'Safeguard', changes: true, long: true, run: () => once('sig', async () => { const r = await ps('sigupdate', 240000); delete cache.security; return { ok: r.ok, text: r.ok ? 'Protection definitions are up to date.' : 'Windows would not update the definitions: ' + (r.err || r.out).trim().split('\n')[0].slice(0, 160) }; }) },
  'defender.quickscan': { label: 'Quick scan', move: 'Barrier', changes: true, long: true, run: () => once('quickscan', async () => { const r = await ps('quickscan', 45 * 60000); delete cache.security; return { ok: r.ok, text: r.ok ? 'Quick scan finished. Anything found is in Windows Security under Protection history.' : 'The scan did not run: ' + (r.err || r.out).trim().split('\n')[0].slice(0, 160) }; }) },
  'updates.check': { label: 'Check for updates', move: 'Future Sight', changes: false, long: true, run: () => once('upd', async () => { const r = await readUpdates(true, true); const n = r.ok ? arr(r.data.pending).length : -1; return { ok: r.ok && !r.data.pendingError, text: !r.ok || r.data.pendingError ? 'Windows Update did not answer: ' + String(r.error || r.data.pendingError).slice(0, 160) : n ? `${n} update${n === 1 ? ' is' : 's are'} waiting. Windows Update installs them.` : 'Windows is up to date.' }; }) },
  'apps.check': { label: 'Check apps', move: 'Miracle Eye', changes: false, long: true, run: () => once('apps', async () => { const r = await ps('winget', 120000); const p = parseWinget(r.out); cache.apps = { at: Date.now(), v: p }; return { ok: p.items.length > 0 || /\S/.test(r.out), text: p.items.length ? `${p.items.length} app${p.items.length === 1 ? ' has' : 's have'} a newer version.` : p.raw ? 'winget answered, but not with a list I can read:\n' + p.raw.slice(0, 400) : 'winget did not answer. It comes with Windows as "App Installer".' , items: p.items }; }) },
  'apps.upgradeAll': { label: 'Update apps…', move: 'Recover', changes: true, run: async () => { const r = await run(EXE.cmd, ['/d', '/c', 'start', 'Mewtwo: updating apps', EXE.cmd, '/k', 'winget upgrade --all --include-unknown']); delete cache.apps; return { ok: r.ok, text: r.ok ? 'A window opened where winget updates your apps. It asks before each installer that needs you.' : 'Could not open a terminal.' }; } },
  'net.flushdns': { label: 'Flush DNS', move: 'Amnesia', changes: true, run: async () => { const r = await run(EXE.ipconfig, ['/flushdns']); return { ok: r.ok, text: r.ok ? 'The DNS cache is cleared. The next visit to each site looks its address up afresh.' : 'Windows would not clear the DNS cache.' }; } },
  'power.plan': { label: 'Switch power plan', move: 'Psych Up', changes: true, run: async (guid) => { const p = await readPower(); const want = p.ok && p.plans.find((x) => x.guid === String(guid).toLowerCase()); if (!want) return { ok: false, text: 'This PC does not have that power plan.' }; const r = await setPlan(want.guid); delete cache.power; return { ok: r.ok, text: r.ok ? `Power plan: ${want.name}.` : 'Windows refused: ' + r.error }; } },
});
for (const id of Object.keys(OPEN)) ACTIONS[id] = { label: 'Open', move: '', changes: false, run: async () => { if (!deps.shell) return { ok: false, text: 'Cannot open Windows settings from here.' }; try { await deps.shell.openExternal(OPEN[id]); return { ok: true, text: '' }; } catch (e) { return { ok: false, text: 'Windows could not open that page.' }; } } };

/** does this ability take long enough for Mewtwo to dive off and come back? (0.9.5) */
const isLong = (id) => { const a = typeof id === 'string' ? ACTIONS[id] : null; return !!(a && a.long); };
const moveOf = (id) => { const a = typeof id === 'string' ? ACTIONS[id] : null; return a ? a.move || '' : ''; };
async function act(id, arg) {
  const a = typeof id === 'string' ? ACTIONS[id] : null;
  if (!a) return { ok: false, text: 'I do not know that ability.' };
  if (!WIN) return { ok: false, text: 'That ability needs Windows.' };
  const r = await a.run(arg);
  if (a.changes) note(a.label, r.ok, r.text);
  return Object.assign({ move: a.move }, r);
}

// ------------------------------------------------------------------ tune-up profiles
// A profile is a set of steps. Every value is one of the listed choices; 'keep' leaves that part of the PC alone.
const STEP_CHOICES = {
  plan: ['keep', 'balanced', 'high', 'ultimate', 'saver'],     // Windows power plan
  boost: ['keep', 0, 1, 2, 3, 4],                               // processor boost mode while plugged in (BOOST_NAME)
  maxProc: ['keep', 50, 60, 70, 80, 90, 99, 100],               // highest processor state while plugged in, %
  gameMode: ['keep', true, false],                              // Windows Game Mode
  flushDns: [false, true],                                      // clear the DNS cache once
  quiet: [false, true],                                         // Screen Trainer steps aside: no wild encounters, weather or visits, subtle effects
};
const STEP_TEXT = {
  plan: (v) => `Power plan: ${PLAN_NAME[v]}`,
  boost: (v) => `Processor boost while plugged in: ${BOOST_NAME[v]}`,
  maxProc: (v) => `Processor may run up to ${v}% while plugged in`,
  gameMode: (v) => `Windows Game Mode ${v ? 'on' : 'off'}`,
  flushDns: () => 'Clear the DNS cache once',
  quiet: () => 'Screen Trainer steps aside: no wild encounters, weather or visits, subtle effects',
};
/** accept only known steps with known values; anything else is dropped. -> steps or null */
function cleanSteps(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of Object.keys(STEP_CHOICES)) {
    const v = raw[k], hit = STEP_CHOICES[k].find((c) => c === v || String(c) === String(v));
    out[k] = hit === undefined ? STEP_CHOICES[k][0] : hit;
  }
  return out;
}
const describe = (steps) => Object.keys(STEP_CHOICES).filter((k) => steps[k] !== 'keep' && steps[k] !== false).map((k) => STEP_TEXT[k](steps[k]));
const PROFILES = table({
  gaming: { name: 'Online gaming', move: 'Agility', blurb: 'For play over the network: full power while plugged in, Game Mode on, a fresh DNS cache, and Screen Trainer out of your way.',
    steps: { plan: 'high', boost: 'keep', maxProc: 100, gameMode: true, flushDns: true, quiet: true } },
  overclock: { name: 'Limited overclock', move: 'Calm Mind', blurb: 'As far as software should go: the processor uses its turbo boost aggressively and never holds back while plugged in. It stays inside the limits the manufacturer set. No voltage, multiplier or fan changes; expect more heat and fan noise.',
    steps: { plan: 'high', boost: 2, maxProc: 100, gameMode: 'keep', flushDns: false, quiet: false } },
  everyday: { name: 'Everyday', move: 'Recover', blurb: 'Back to a calm, balanced PC: the Balanced plan and normal boost.',
    steps: { plan: 'balanced', boost: 1, maxProc: 100, gameMode: 'keep', flushDns: false, quiet: false } },
});
const QUIET = { paused: true, fxLevel: 'low', weatherFreq: 0, legendEvents: 'off' };
function profiles() {
  load();
  const list = Object.keys(PROFILES).map((id) => ({ id, name: PROFILES[id].name, move: PROFILES[id].move, blurb: PROFILES[id].blurb, steps: PROFILES[id].steps, does: describe(PROFILES[id].steps) }));
  list.push({ id: 'custom', name: 'My own', move: 'Psych Up', blurb: state.custom ? 'The profile you put together with Mewtwo.' : 'Not set up yet. Mewtwo walks you through it.', steps: state.custom, does: state.custom ? describe(state.custom) : [] });
  return { list, applied: state.applied ? { id: state.applied.id, name: state.applied.name, at: state.applied.at, did: state.applied.did || [], skipped: state.applied.skipped || [] } : null, choices: STEP_CHOICES, boostNames: BOOST_NAME, planNames: PLAN_NAME };
}
/** what a set of steps would do, in words, without saving anything */
function preview(raw) { const steps = cleanSteps(raw); return steps ? { ok: true, steps, does: describe(steps) } : { ok: false, does: [] }; }
function saveCustom(raw) { const steps = cleanSteps(raw); if (!steps) return { ok: false }; load().custom = steps; persist(); return { ok: true, steps, does: describe(steps) }; }

async function applyProfile(id) {
  load();
  if (!WIN) return { ok: false, text: 'Profiles change Windows settings, so they need Windows.' };
  const prof = id === 'custom' ? (state.custom ? { name: 'My own', move: 'Psych Up', steps: state.custom } : null) : typeof id === 'string' ? PROFILES[id] : null;
  if (!prof) return { ok: false, text: id === 'custom' ? 'Set up your own profile first.' : 'I do not know that profile.' };
  return once('profile', async () => {
    if (state.applied) await undoInner();                 // one profile at a time, so "undo" always goes back to how you had it
    const steps = prof.steps, did = [], skipped = [], undo = { scheme: null, proc: null, gameMode: undefined, st: null };
    const before = await readPower();
    if (!before.ok) return { ok: false, text: 'I could not read the power settings: ' + before.error };
    // 1. power plan
    if (steps.plan !== 'keep') {
      let want = before.plans.find((p) => p.guid === PLAN[steps.plan]);
      if (!want && steps.plan === 'ultimate') want = before.plans.find((p) => p.guid === PLAN.high);
      if (!want) skipped.push(`This PC has no "${PLAN_NAME[steps.plan]}" plan (usual on newer laptops), so the plan stays "${before.activeName}".`);
      else if (want.guid !== before.active) { const r = await setPlan(want.guid); if (r.ok) { undo.scheme = before.active; did.push(`Power plan: ${want.name}`); } else skipped.push('Power plan: Windows refused. ' + r.error); }
    }
    // 2. processor settings live in the plan that is active now
    const now = undo.scheme ? await readPower() : before;
    const proc = { scheme: now.active, boost: null, maxProc: null };
    for (const [key, label] of [['boost', (v) => STEP_TEXT.boost(v)], ['maxProc', (v) => STEP_TEXT.maxProc(v)]]) {
      if (steps[key] === 'keep') continue;
      const cur = now.ok && now[key];
      if (!cur) { skipped.push(`${label(steps[key])}: this PC does not offer that setting.`); continue; }
      if (cur.ac === steps[key]) continue;
      const r = await setProcAc('SCHEME_CURRENT', SET[key], steps[key]);
      if (r.ok) { proc[key] = cur.ac; did.push(label(steps[key])); } else skipped.push(`${label(steps[key])}: Windows refused. ${r.error}`);
    }
    if (proc.boost !== null || proc.maxProc !== null) undo.proc = proc;
    // 3. Game Mode
    if (steps.gameMode !== 'keep') {
      const sys = await readSystem(true), cur = sys.ok ? sys.data.gameMode : undefined, want = steps.gameMode ? 1 : 0;
      if (cur === undefined) skipped.push('Game Mode: I could not read how it is set, so I left it.');
      else if ((cur === null ? 1 : cur) !== want) { const r = await setGameMode(want); if (r.ok) { undo.gameMode = cur; did.push(STEP_TEXT.gameMode(steps.gameMode)); } else skipped.push('Game Mode: Windows refused. ' + r.error); }
    }
    // 4. one-off, nothing to undo
    if (steps.flushDns) { const r = await run(EXE.ipconfig, ['/flushdns']); if (r.ok) did.push('Cleared the DNS cache'); }
    // 5. Screen Trainer itself
    if (steps.quiet) { const s = deps.getSettings() || {}; undo.st = {}; for (const k of Object.keys(QUIET)) undo.st[k] = s[k]; deps.setSettings(QUIET); did.push('Screen Trainer stepped aside'); }
    state.applied = { id, name: prof.name, at: Date.now(), undo, did, skipped };
    for (const k of ['power', 'system']) delete cache[k];
    note(`Profile "${prof.name}"`, true, did.join('; ') || 'nothing needed changing');
    return { ok: true, move: prof.move, name: prof.name, did, skipped, text: did.length ? `${prof.name} is in effect.` : `${prof.name}: this PC was already set that way.` };
  });
}
async function undoInner() {
  const ap = state.applied;
  if (!ap) return [];
  const u = ap.undo, back = [];
  if (u.proc && isGuid(u.proc.scheme)) for (const key of ['boost', 'maxProc']) if (u.proc[key] !== null && u.proc[key] !== undefined) { const r = await setProcAc(u.proc.scheme, SET[key], u.proc[key]); if (r.ok) back.push(key === 'boost' ? `Processor boost back to ${BOOST_NAME[u.proc.boost] || u.proc.boost}` : `Processor limit back to ${u.proc.maxProc}%`); }
  if (isGuid(u.scheme)) { const r = await setPlan(u.scheme); if (r.ok) back.push('Power plan back to how it was'); }
  if (u.gameMode !== undefined) { const r = await setGameMode(u.gameMode); if (r.ok) back.push('Game Mode back to how it was'); }
  if (u.st) { const patch = {}; for (const k of Object.keys(QUIET)) if (u.st[k] !== undefined) patch[k] = u.st[k]; deps.setSettings(patch); back.push('Screen Trainer is back'); }
  state.applied = null;
  for (const k of ['power', 'system']) delete cache[k];
  note(`Undid profile "${ap.name}"`, true, back.join('; '));
  return back;
}
const undoProfile = () => { load(); if (!state.applied) return Promise.resolve({ ok: false, text: 'No profile is in effect.' }); return once('profile', async () => { const name = state.applied.name, back = await undoInner(); return { ok: true, move: 'Recover', back, text: `Everything "${name}" changed is back to how you had it.` }; }); };

// ------------------------------------------------------------------ asking Mewtwo
const ANTHROPIC_VERSION = '2023-06-01';                   // the Messages API version header; see https://docs.claude.com/en/api/messages
// kind: which wire format. 'openai' = POST <url>/chat/completions, 'anthropic' = POST <url>/messages.
const PROVIDERS = table({
  none: { label: 'No AI: Mewtwo answers from its own checks', kind: '', url: '', model: '', key: false },
  local: { label: 'A model on this computer', kind: 'openai', url: 'http://127.0.0.1:1234/v1', model: '', key: false },
  claude: { label: 'Claude', kind: 'anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', key: true },
  grok: { label: 'Grok', kind: 'openai', url: 'https://api.x.ai/v1', model: 'grok-4', key: true },
  custom: { label: 'Another OpenAI-compatible service', kind: 'openai', url: '', model: '', key: 'optional' },
});
// where local model servers usually listen: LM Studio, Ollama, llama.cpp, text-generation-webui, KoboldCpp, vLLM
const LOCAL_PORTS = [[1234, 'LM Studio'], [11434, 'Ollama'], [8080, 'llama.cpp'], [5000, 'text-generation-webui'], [5001, 'KoboldCpp'], [8000, 'vLLM']];
const getKey = () => { const a = load().ai; if (memKey) return memKey; if (!a.key) return ''; try { return deps.safeStorage && deps.safeStorage.isEncryptionAvailable() ? deps.safeStorage.decryptString(Buffer.from(a.key, 'base64')) : ''; } catch (e) { return ''; } };
function aiView() {
  const a = load().ai, p = PROVIDERS[a.provider] || PROVIDERS.none;
  return { provider: PROVIDERS[a.provider] ? a.provider : 'none', url: a.url || p.url, model: a.model || p.model, hasKey: !!getKey(), keySaved: !!a.key, share: a.share !== false, canStoreKey: !!(deps.safeStorage && deps.safeStorage.isEncryptionAvailable()),
    providers: Object.keys(PROVIDERS).map((id) => ({ id, label: PROVIDERS[id].label, url: PROVIDERS[id].url, model: PROVIDERS[id].model, key: PROVIDERS[id].key })) };
}
/** save AI settings. key: undefined = leave as it is, '' = forget it */
function aiSet(cfg) {
  const a = load().ai, c = cfg || {};
  if (c.provider !== undefined && PROVIDERS[c.provider] && c.provider !== a.provider) {
    // another service: its own address, model and key; and details of this PC are only shared with a model on this PC until the user says otherwise
    a.provider = c.provider; a.url = ''; a.model = ''; a.key = ''; memKey = ''; a.share = c.provider === 'local';
  }
  const p = PROVIDERS[a.provider];
  if (typeof c.url === 'string' && (a.provider === 'local' || a.provider === 'custom')) { const u = c.url.trim().replace(/\/+$/, ''); a.url = /^https?:\/\/[^\s]+$/i.test(u) ? u.slice(0, 300) : ''; }
  if (typeof c.model === 'string') a.model = c.model.trim().slice(0, 120);
  if (typeof c.share === 'boolean') a.share = c.share;
  if (typeof c.key === 'string') {
    const k = c.key.trim().slice(0, 400);
    memKey = k; a.key = '';
    if (k && deps.safeStorage && deps.safeStorage.isEncryptionAvailable()) { try { a.key = deps.safeStorage.encryptString(k).toString('base64'); } catch (e) { a.key = ''; } }
  }
  if (!p.key) { memKey = ''; a.key = ''; }
  persist();
  return aiView();
}
async function fetchJson(url, init, timeout) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, Object.assign({ signal: ctl.signal }, init));
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { ok: res.ok, status: res.status, data, text };
  } catch (e) { return { ok: false, status: 0, data: null, text: e && e.name === 'AbortError' ? 'timed out' : String((e && e.cause && e.cause.code) || (e && e.message) || e) }; } finally { clearTimeout(timer); }
}
/** look for model servers on this computer */
async function aiDetect() {
  const found = [];
  await Promise.all(LOCAL_PORTS.map(async ([port, name]) => {
    const url = `http://127.0.0.1:${port}/v1`, r = await fetchJson(url + '/models', { method: 'GET' }, 1500);
    if (r.ok && r.data && Array.isArray(r.data.data)) found.push({ url, name, models: r.data.data.map((m) => String(m.id)).slice(0, 40) });
  }));
  return found.sort((a, b) => a.url.localeCompare(b.url));
}
async function aiModels() {
  const v = aiView(), p = PROVIDERS[v.provider];
  if (!p.kind || !v.url) return { ok: false, models: [] };
  const key = getKey(), headers = p.kind === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } : key ? { Authorization: 'Bearer ' + key } : {};
  const r = await fetchJson(v.url + '/models', { method: 'GET', headers }, 8000);
  return r.ok && r.data && Array.isArray(r.data.data) ? { ok: true, models: r.data.data.map((m) => String(m.id)).slice(0, 80) } : { ok: false, models: [], error: r.status ? `The service answered ${r.status}.` : 'No answer from ' + v.url };
}

const PERSONA = `You are Mewtwo, speaking as the guardian of the user's computer inside the desktop app Screen Trainer.
Voice: calm, exact, a little grand, never rude. Short answers: a few sentences, plain words, no markdown headings.
You watch over Windows security, updates and performance. You cannot run commands or change anything yourself. The user acts through the buttons in your window: Watch (Update protection, Quick scan, Check for updates, Check apps), Tune (profiles: Online gaming, Limited overclock, Everyday, My own; each can be undone) and the Windows settings pages those buttons open.
Never tell the user to disable security features, to edit the registry by hand, to run commands they do not understand, or to change voltages or clock multipliers. For real overclocking say it belongs in the manufacturer's own tool and that it is at their own risk.
If you are unsure, say so. Do not invent facts about this computer: use only the summary below when it is given.
When the user wants their own tune-up profile set up or changed, discuss it briefly, then end your reply with one line of exactly this form (and nothing after it):
PROFILE {"plan":"keep|balanced|high|ultimate|saver","boost":"keep" or 0-4,"maxProc":"keep" or 50|60|70|80|90|99|100,"gameMode":"keep" or true or false,"flushDns":true or false,"quiet":true or false}
boost is the processor boost mode while plugged in (0 off, 1 on, 2 aggressive, 3 efficient, 4 efficient aggressive). quiet makes Screen Trainer step aside. The user must still press a button to save or apply it.`;
function summary(st) {
  const L = [], d = st.security.defender, u = st.updates, s = st.system, v = st.vitals, p = st.power;
  L.push(`Windows: ${u.os ? `${u.os.name} build ${u.os.build}` : 'unknown'}; up for ${Math.round(v.uptime / 3600)} h`);
  if (s.cpu) L.push(`Processor: ${s.cpu.name}, ${s.cpu.cores} cores / ${s.cpu.threads} threads; load now ${v.load}%`);
  if (s.gpu && s.gpu.length) L.push('Graphics: ' + s.gpu.join(', '));
  L.push(`Memory: ${GB(v.memUsed)} of ${GB(v.memTotal)} in use`);
  for (const k of s.disks || []) L.push(`Drive ${k.id}: ${GB(k.free)} free of ${GB(k.size)}`);
  if (s.battery) L.push(`Battery: ${s.battery.pct}%${s.battery.status === 2 ? ', plugged in' : ''}`);
  const others = (st.security.products || []).filter((n) => !/defender/i.test(n));
  if (others.length) L.push(`Other antivirus installed: ${others.join(', ')}${d && /passive/i.test(d.mode || '') ? ' (it is the active one; Defender is in passive mode, which is normal)' : ''}`);
  if (d) L.push(`Defender: ${d.enabled ? 'on' : 'off'}, real-time ${d.realtime ? 'on' : 'off'}, definitions ${Math.round(d.sigAge)} days old, last quick scan ${d.quickAge > 4e9 ? 'never' : Math.round(d.quickAge) + ' days ago'}`);
  if (st.security.firewall) L.push('Firewall: ' + st.security.firewall.map((f) => `${f.name} ${f.on ? 'on' : 'off'}`).join(', '));
  if (u.pending) L.push(`Windows updates waiting: ${u.pending.length}${u.reboot ? '; restart pending' : ''}`);
  if (p && p.ok) L.push(`Power plan: ${p.activeName}${p.boost ? `; boost mode plugged in: ${BOOST_NAME[p.boost.ac] || p.boost.ac}` : ''}${p.maxProc ? `; max processor ${p.maxProc.ac}%` : ''}; plans available: ${p.plans.map((x) => x.name).join(', ')}`);
  if (s.gameMode !== undefined) L.push(`Game Mode: ${s.gameMode === 0 ? 'off' : 'on'}`);
  if (s.top && s.top.length) L.push('Using most memory: ' + s.top.slice(0, 6).map((t) => `${t.name} ${t.mb} MB`).join(', '));
  if (s.startup) L.push(`Programs starting with Windows: ${s.startup.length}`);
  if (st.applied) L.push(`Tune-up profile in effect: ${st.applied.name}`);
  L.push('My own findings: ' + st.advice.map((a) => a.text).join(' '));
  return L.join('\n');
}
/** Mewtwo's own answer, from its checks, when no AI is connected */
function nativeAnswer(q, st) {
  const t = String(q || '').toLowerCase(), A = st.advice, has = (re) => re.test(t), say = (lines) => lines.filter(Boolean).join(' ');
  const findings = (re) => A.filter((a) => re.test(a.text)).map((a) => a.text);
  if (!st.supported) return 'My senses for security, updates and tuning are made for Windows. On this system I can only watch memory and processor load.';
  const d = st.security.defender, u = st.updates, s = st.system, v = st.vitals, p = st.power;
  if (has(/who are you|what (can|do) you|help|abilit/)) return 'I am Mewtwo. I watch this computer: its protection, its updates and how hard it is working. Under Watch I show what I see and what I would do. Under Tune I change power settings for you, and undo them exactly. Connect an AI under Ask and I can also answer open questions.';
  const otherAv = (st.security.products || []).filter((n) => !/defender/i.test(n)), standby = d && otherAv.length > 0 && (!d.enabled || /passive/i.test(d.mode || ''));
  if (has(/virus|malware|defender|secur|safe|protect|firewall|threat|hack/)) return say([standby ? `${otherAv[0]} is the antivirus guarding this PC, and Microsoft Defender stands by behind it, which is how Windows arranges it.` : d ? `Microsoft Defender is ${d.enabled ? 'on' : 'off'} and real-time protection is ${d.realtime ? 'on' : 'off'}.` : 'I cannot read Microsoft Defender here.', d && d.enabled ? `Its definitions are ${Math.round(d.sigAge)} day${Math.round(d.sigAge) === 1 ? '' : 's'} old; the last quick scan was ${d.quickAge > 4e9 ? 'never' : Math.round(d.quickAge) + ' days ago'}.` : '', ...findings(/firewall|threat/), 'Quick scan and Update protection are under Watch.']);
  if (has(/updat|patch|upgrade|winget|driver/)) return say([u.pending ? (u.pending.length ? `${u.pending.length} Windows update${u.pending.length === 1 ? ' is' : 's are'} waiting.` : 'Windows has no updates waiting that I can see.') : 'Windows Update did not answer me.', u.reboot ? 'A restart is pending.' : '', u.lastPatch ? `The last one installed ${days(u.lastPatch.on)} days ago.` : '', 'Check for updates looks online; Check apps asks winget about your programs. I leave drivers and firmware to your manufacturer\'s own tool.']);
  if (has(/overclock|boost|turbo/)) return 'My "Limited overclock" profile lets the processor use its turbo boost aggressively and never hold back while plugged in. That is all software should do on its own: it stays inside the manufacturer\'s limits. Voltages and multipliers belong in your manufacturer\'s tool, at your own risk.';
  if (has(/gam|fps|lag|ping|stutter/)) return say([`"Online gaming" under Tune gives full power while plugged in, turns Game Mode on, clears the DNS cache and makes Screen Trainer step aside.`, p && p.ok ? `Right now the plan is ${p.activeName}.` : '', s.top && s.top[0] ? `${s.top[0].name} holds the most memory (${s.top[0].mb} MB).` : '']);
  if (has(/slow|fast|speed|optimi|perform|memory|ram|cpu|processor|hot|fan/)) return say([`The processor is at ${v.load}% and memory is ${Math.round((v.memUsed / v.memTotal) * 100)}% full.`, s.top && s.top.length ? `Most memory: ${s.top.slice(0, 3).map((x) => `${x.name} (${x.mb} MB)`).join(', ')}.` : '', s.startup ? `${s.startup.length} programs start with Windows.` : '', ...findings(/Drive|running for/), 'The profiles under Tune change power settings and can be undone.']);
  if (has(/disk|space|storage|drive|clean|temp/)) return say([(s.disks || []).map((k) => `Drive ${k.id} has ${GB(k.free)} free of ${GB(k.size)}.`).join(' ') || 'I cannot read the drives here.', 'I delete nothing myself. Windows\' own Storage page cleans up safely; I can open it from Watch.']);
  if (has(/batter|power|plan|plug/)) return say([p && p.ok ? `The power plan is ${p.activeName}.` : '', s.battery ? `The battery is at ${s.battery.pct}%${s.battery.status === 2 ? ' and plugged in' : ''}.` : 'I see no battery.', st.applied ? `The "${st.applied.name}" profile is in effect.` : '']);
  if (has(/start ?up|boot/)) return say([s.startup ? `${s.startup.length} programs start with Windows${s.startup.length ? ': ' + s.startup.slice(0, 8).map((x) => x.name).join(', ') + (s.startup.length > 8 ? ' and more' : '') : ''}.` : 'I cannot read the startup list here.', 'Windows\' Startup apps page switches them off; I can open it.']);
  return say(['Here is what I see.', ...A.slice(0, 4).map((a) => a.text), 'For open questions, connect an AI under Ask: a model on this computer, Claude or Grok.']);
}
/** pull a proposed profile out of an AI answer; the text is returned without the PROFILE line */
function extractProposal(text) {
  const m = /^[ \t>*-]*PROFILE\s*(\{.*\})\s*$/m.exec(String(text));
  if (!m) return { text: String(text).trim(), proposal: null };
  let steps = null; try { steps = cleanSteps(JSON.parse(m[1])); } catch (e) { /* not a profile after all */ }
  return { text: String(text).replace(m[0], '').trim(), proposal: steps ? { steps, does: describe(steps) } : null };
}
/** history: [{ role: 'user' | 'assistant', content }] ending with the user's question */
/** One question to the AI that is chosen under Ask > AI, for another part of the program (Rotom's Optimize asks for a
 *  sorting plan this way). Nothing about this computer is added: the caller decides what the AI is told.
 *  Returns { ok, text, by } or { ok: false, text: why not }. */
async function complete(system, user, maxTokens) {
  const v = aiView(), p = PROVIDERS[v.provider], key = getKey();
  if (!p || !p.kind) return { ok: false, none: true, text: 'No AI is chosen. Choose one in Mewtwo\'s window, under Ask > AI.' };
  if (!v.url || !v.model || (p.key === true && !key)) return { ok: false, text: !v.url ? 'The AI has no address yet (Mewtwo\'s window, Ask > AI).' : !v.model ? 'No model is chosen yet (Mewtwo\'s window, Ask > AI).' : 'That service needs an API key (Mewtwo\'s window, Ask > AI).' };
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/i.test(v.url + '/'), max = Math.min(8192, Math.max(256, maxTokens | 0 || 2048));
  const sys = String(system || '').slice(0, 8000), msg = [{ role: 'user', content: String(user || '').slice(0, 60000) }];
  let r, text = '';
  if (p.kind === 'anthropic') {
    r = await fetchJson(v.url + '/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify({ model: v.model, max_tokens: max, system: sys, messages: msg }) }, 120000);
    if (r.ok && r.data && Array.isArray(r.data.content)) text = r.data.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
  } else {
    r = await fetchJson(v.url + '/chat/completions', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: JSON.stringify({ model: v.model, max_tokens: max, stream: false, messages: [{ role: 'system', content: sys }, ...msg] }) }, local ? 600000 : 120000);
    if (r.ok && r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message) text = String(r.data.choices[0].message.content || '');
  }
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) return { ok: false, text: r.status === 401 || r.status === 403 ? 'The service did not accept the API key.' : r.status === 404 ? 'The service does not know that address or model.' : r.status === 429 ? 'The service says: too many requests, or no credit left.' : r.status ? `The service answered ${r.status}.` : local ? `Nothing is listening at ${v.url}. Start your model server first.` : `The service could not be reached (${r.text}).` };
  return { ok: true, text: text.slice(0, 200000), by: p.label + (v.model ? ` (${v.model})` : ''), local };
}
async function ask(history) {
  const msgs = (Array.isArray(history) ? history : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return { ok: false, text: 'Ask me something.' };
  const st = await status(), v = aiView(), p = PROVIDERS[v.provider], key = getKey();
  if (!p.kind) return { ok: true, by: 'Mewtwo', text: nativeAnswer(msgs[msgs.length - 1].content, st), proposal: null };
  if (!v.url || !v.model || (p.key === true && !key)) return { ok: false, text: !v.url ? 'Tell me where the AI listens (its address) under Ask > AI.' : !v.model ? 'Choose a model under Ask > AI.' : 'That service needs an API key. Enter it under Ask > AI.' };
  const system = PERSONA + (v.share ? '\n\nSummary of this computer, read just now:\n' + summary(st) : '\n\n(The user chose not to share details of this computer with you.)');
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/i.test(v.url + '/');
  let r, text = '';
  if (p.kind === 'anthropic') {
    r = await fetchJson(v.url + '/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify({ model: v.model, max_tokens: 1024, system, messages: msgs }) }, 120000);
    if (r.ok && r.data && Array.isArray(r.data.content)) text = r.data.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
  } else {
    r = await fetchJson(v.url + '/chat/completions', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: JSON.stringify({ model: v.model, max_tokens: 1024, stream: false, messages: [{ role: 'system', content: system }, ...msgs] }) }, local ? 600000 : 120000);
    if (r.ok && r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message) text = String(r.data.choices[0].message.content || '');
  }
  if (!text.trim()) {
    const why = r.status === 401 || r.status === 403 ? 'The service did not accept the API key.' : r.status === 404 ? 'The service does not know that address or model.' : r.status === 429 ? 'The service says: too many requests, or no credit left.' : r.status ? `The service answered ${r.status}.` : local ? `Nothing is listening at ${v.url}. Start your model server first.` : `I could not reach ${v.url} (${r.text}).`;
    const detail = r.data && r.data.error ? String(r.data.error.message || r.data.error).slice(0, 200) : '';
    return { ok: false, text: `${why}${detail ? ' ' + detail : ''} Until then I answer from my own checks:\n\n${nativeAnswer(msgs[msgs.length - 1].content, st)}` };
  }
  const out = extractProposal(text.replace(/<think>[\s\S]*?<\/think>/g, ''));
  return { ok: true, by: PROVIDERS[v.provider].label + (v.model ? ` (${v.model})` : ''), text: out.text.slice(0, 6000), proposal: out.proposal };
}

// ------------------------------------------------------------------ the quiet watch in the background
let watchTimer = null;
async function patrol() {
  if (!WIN) return null;
  const st = await status({ force: true }), worst = st.advice.find((a) => a.tone === 'bad') || st.advice.find((a) => a.tone === 'warn');
  if (worst && (deps.getSettings() || {}).guardianAlerts !== false) deps.say({ text: worst.text + ' Click me for more.', tone: worst.tone, seconds: 12 });
  return worst || null;
}
function init(d) {
  deps = Object.assign(deps, d || {});
  load();
  clearInterval(watchTimer);
  if (WIN && !d.noWatch) { setTimeout(() => patrol().catch(() => {}), 90000); watchTimer = setInterval(() => patrol().catch(() => {}), 4 * 3600000); }
}
const stop = () => clearInterval(watchTimer);
const log = () => load().log.slice().reverse();

module.exports = { init, stop, status, act, isLong, moveOf, note, profiles, applyProfile, undoProfile, saveCustom, preview, aiView, aiSet, aiDetect, aiModels, ask, complete, log, patrol,
  ACTIONS, PROFILES, STEP_CHOICES, PROVIDERS, cleanSteps, describe, advise, nativeAnswer, extractProposal, parsePlans, parseSetting, parseWinget, summary,
  // for tools/guardiancheck.js: swap the computer for a pretend one
  _test: { setRun(fn) { run = fn; }, setWindows(b) { WIN = !!b; }, reset() { state = null; memKey = ''; for (const k of Object.keys(cache)) delete cache[k]; }, SCRIPTS, scriptFile, EXE, PLAN, SET, SUB_PROCESSOR } };
