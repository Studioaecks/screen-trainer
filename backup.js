// Screen Trainer — Mewtwo's backups (0.9.9, owner's list 11-16 update 21): copies of what the owner chose, on a USB
// stick or an external drive, about once a week. Main process; Mewtwo's window shows and asks (tab "backup").
//
// The owner decides everything: which drive (a folder on it, chosen in Windows' own dialog), and what is copied. Either
// the walkthrough (folder by folder, with how much each holds) or a simple profile, and any other folder can be added.
// Rules:
//   1. Only what the owner chose is read, and it is only read: nothing in a chosen folder is ever changed.
//   2. Everything written goes into one folder on the drive: <chosen folder>\Screen Trainer backup\<this computer>\.
//      Nothing else on the drive is touched.
//   3. A file is copied when the drive has no copy of it or an older one (another size or date). Nothing on the drive
//      is ever deleted: a file removed from the computer stays in the backup.
//   4. A file that cannot be read (in use, no permission) is skipped and counted; links and junctions are not followed.
//   5. It runs when the owner starts it. "By itself" (once a week, when the drive is there) is an option that is off
//      until the owner switches it on. It can be stopped at any moment; what was copied by then is whole.
//   6. Screen Trainer's own data (save, settings, layouts) can be part of it: copied as files, and the game as a sealed
//      .stsave beside them.
// A Windows restore point is not part of this (the owner chose so): it would not hold personal files, and making one
// needs administrator rights, which Mewtwo never asks for here.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const WEEK = 7 * 24 * 3600 * 1000, MAX_DEPTH = 24, MAX_ITEMS = 40;
const SKIP = /^(\$recycle\.bin|system volume information|thumbs\.db|desktop\.ini)$/i;
const PROFILES = {
  trainer: { name: 'Screen Trainer only', text: 'Your game, settings and layouts. A few megabytes.', homes: [] },
  papers: { name: 'Screen Trainer and my documents', text: 'The above, and your Documents and Desktop.', homes: ['Documents', 'Desktop'] },
  memories: { name: 'Screen Trainer and my pictures and videos', text: 'The above, and your Pictures and Videos.', homes: ['Pictures', 'Videos'] },
  personal: { name: 'All my personal folders', text: 'Desktop, Documents, Downloads, Pictures, Videos and Music.', homes: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'] },
};
let deps = { userDir: () => '', homes: () => ({}), saveFile: async () => null, say: () => {} }, cfg = null, run = null;
const file = () => path.join(deps.userDir(), 'backup.json');
const norm = (p) => { const r = path.resolve(String(p || '')); return process.platform === 'win32' ? r.toLowerCase() : r; };
const within = (c, p) => { const a = norm(c), b = norm(p); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };
const drive = (p) => norm(path.parse(path.resolve(p)).root);
function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, seen = new Set();
  const items = (Array.isArray(r.items) ? r.items : []).filter((x) => x && typeof x.dir === 'string' && path.isAbsolute(x.dir) && !seen.has(norm(x.dir)) && seen.add(norm(x.dir))).slice(0, MAX_ITEMS).map((x) => ({ dir: path.resolve(x.dir) }));
  return { target: typeof r.target === 'string' && path.isAbsolute(r.target) ? path.resolve(r.target) : '', items, trainer: r.trainer !== false, weekly: r.weekly !== false, auto: !!r.auto,
    last: r.last && typeof r.last === 'object' && Number(r.last.at) > 0 ? { at: Number(r.last.at), copied: r.last.copied | 0, same: r.last.same | 0, skipped: r.last.skipped | 0, bytes: Number(r.last.bytes) || 0, stopped: !!r.last.stopped } : null, asked: Number(r.asked) || 0 };
}
function load() { if (cfg) return cfg; let raw = null; try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { raw = null; } cfg = clean(raw); return cfg; }
function save() { try { fs.mkdirSync(deps.userDir(), { recursive: true }); const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, file()); } catch (e) { /* kept for this run */ } }
function init(d) { deps = Object.assign(deps, d || {}); cfg = null; run = null; }

/** why a folder cannot be the place for the backup, or '' */
function refuseTarget(dir) {
  if (!dir || !path.isAbsolute(dir)) return 'That is not a folder.';
  let st = null; try { st = fs.statSync(dir); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) return 'That folder is not there (is the drive plugged in?).';
  if (within(dir, deps.userDir())) return 'That is Screen Trainer\'s own folder.';
  return '';
}
/** why a folder cannot be backed up, or '' */
function refuseSource(dir) {
  if (!dir || !path.isAbsolute(dir)) return 'That is not a folder.';
  let st = null; try { st = fs.statSync(dir); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) return 'That folder does not exist.';
  if (norm(dir) === drive(dir)) return 'A whole drive is too much: choose folders on it.';
  const c = load();
  if (c.target && (within(dir, c.target) || within(c.target, dir))) return 'The backup itself lies there.';
  return '';
}
const dest = () => path.join(load().target, 'Screen Trainer backup', os.hostname().replace(/[^\w.-]/g, '_') || 'computer');
/** the name a source folder has inside the backup: its own name, with its drive letter in front ("C Users Me Pictures") so two never collide */
const labelOf = (dir) => path.resolve(dir).replace(/[:]/g, '').split(/[\\/]+/).filter(Boolean).join(' ').slice(-120);

function set(patch) {
  const c = load(), p = patch && typeof patch === 'object' ? patch : {};
  if (typeof p.weekly === 'boolean') c.weekly = p.weekly;
  if (typeof p.auto === 'boolean') c.auto = p.auto;
  if (typeof p.trainer === 'boolean') c.trainer = p.trainer;
  if (typeof p.profile === 'string' && PROFILES[p.profile]) { const h = deps.homes() || {}; c.trainer = true; c.items = PROFILES[p.profile].homes.map((k) => h[k]).filter((d) => d && !refuseSource(d)).map((dir) => ({ dir })); }
  if (typeof p.remove === 'string') c.items = c.items.filter((x) => norm(x.dir) !== norm(p.remove));
  save();
  return status();
}
function setTarget(dir) { const no = refuseTarget(dir); if (no) return { ok: false, text: no }; const c = load(); c.target = path.resolve(dir); c.items = c.items.filter((x) => !refuseSource(x.dir)); save(); return { ok: true }; }
function addFolder(dir) { const no = refuseSource(dir); if (no) return { ok: false, text: no }; const c = load(); if (c.items.length >= MAX_ITEMS) return { ok: false, text: 'That is enough folders for one backup.' }; if (!c.items.some((x) => norm(x.dir) === norm(dir))) c.items.push({ dir: path.resolve(dir) }); save(); return { ok: true }; }

/** every file under dir, as [relative path, size, time]; cb(file) for each. Never follows links. */
async function walk(dir, rel, depth, each, stop) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { each(null, rel || '.'); return; }
  for (const d of entries) {
    if (stop()) return;
    if (d.isSymbolicLink() || SKIP.test(d.name)) continue;
    const p = path.join(dir, d.name), r = rel ? path.join(rel, d.name) : d.name;
    if (d.isDirectory()) { if (depth < MAX_DEPTH && !(load().target && within(p, load().target))) await walk(p, r, depth + 1, each, stop); }
    else if (d.isFile()) await each(p, r);
  }
}
/** how much a folder holds (for the walkthrough): { files, bytes }, counted for at most a few seconds */
async function measure(dir) {
  let files = 0, bytes = 0; const t0 = Date.now();
  await walk(dir, '', 0, async (p) => { if (!p) return; files++; try { bytes += (await fsp.stat(p)).size; } catch (e) { /* unreadable */ } }, () => Date.now() - t0 > 4000);
  return { files, bytes, more: Date.now() - t0 > 4000 };
}
/** copy what is new or changed. onProgress({ copied, same, skipped, bytes, name }). Resolves with the tally. */
async function start(onProgress) {
  const c = load();
  if (run) return { ok: false, text: 'A backup is running.' };
  const no = refuseTarget(c.target);
  if (no) return { ok: false, text: c.target ? no : 'Choose where the backup goes first.' };
  if (!c.items.length && !c.trainer) return { ok: false, text: 'Nothing is chosen to back up.' };
  const me = run = { stop: false, copied: 0, same: 0, skipped: 0, bytes: 0, at: Date.now() }, root = dest();
  const tell = (name) => { if (onProgress) onProgress({ copied: me.copied, same: me.same, skipped: me.skipped, bytes: me.bytes, name: name || '' }); };
  async function copyOne(p, to) {
      try {
        const st = await fsp.stat(p);
        let have = null; try { have = await fsp.stat(to); } catch (e) { have = null; }
        if (have && have.isFile() && have.size === st.size && Math.abs(have.mtimeMs - st.mtimeMs) < 2500) { me.same++; }
        else {
          await fsp.mkdir(path.dirname(to), { recursive: true });
          const tmp = to + '.stpart';
          await fsp.copyFile(p, tmp);                       // (the source is only read; a copy cut short never stands under the real name)
          try { await fsp.utimes(tmp, st.atime, st.mtime); } catch (e) { /* the date stays the copy's own: it is copied again next time */ }
          await fsp.rename(tmp, to);
          me.copied++; me.bytes += st.size;
        }
      } catch (e) { me.skipped++; try { await fsp.unlink(to + '.stpart'); } catch (x) { /* there was none (only ever our own unfinished copy) */ } }
  }
  async function copyTree(src, label) {
    const base = path.join(root, label);
    let n = 0;
    await walk(src, '', 0, async (p, rel) => {
      if (!p) { me.skipped++; return; }
      await copyOne(p, path.join(base, rel));
      if (++n % 20 === 0) { tell(rel); await new Promise((r) => setImmediate(r)); }
    }, () => me.stop);
  }
  try {
    await fsp.mkdir(root, { recursive: true });
    if (c.trainer) {
      // Screen Trainer's own data: its .json files (save, settings, layouts, logs of what Rotom and Mewtwo did). Not the
      // browser engine's caches that lie beside them, and not the sound bank (it is made from the owner's own ROM again).
      let own = []; try { own = (await fsp.readdir(deps.userDir(), { withFileTypes: true })).filter((d) => d.isFile() && /\.json$/i.test(d.name) && d.name.toLowerCase() !== 'backup.json'); } catch (e) { own = []; }      // (not this backup's own notes: they change with every run)
      for (const d of own) await copyOne(path.join(deps.userDir(), d.name), path.join(root, 'Screen Trainer', d.name));
      try { const b = await deps.saveFile(); if (b) await fsp.writeFile(path.join(root, 'Screen Trainer', 'my game.stsave'), b); } catch (e) { /* the save's own file was copied above */ }
    }
    for (const it of c.items) { if (me.stop) break; if (refuseSource(it.dir)) { me.skipped++; continue; } tell(it.dir); await copyTree(it.dir, labelOf(it.dir)); }
    try { await fsp.writeFile(path.join(root, 'READ ME.txt'), `A backup made by Screen Trainer (Mewtwo) on ${new Date().toString()}.\r\nEach folder here is a copy of one folder of this computer: its name says which. To get a file back, copy it from here to where you want it.\r\n"Screen Trainer" holds the game's own data; "my game.stsave" in it can be loaded from Options > Save data > Load a saved game.\r\nNothing in this folder is ever deleted by Screen Trainer.\r\n`); } catch (e) { /* the copies are there all the same */ }
  } catch (e) { run = null; return { ok: false, text: 'The backup could not be written: ' + e.message }; }
  c.last = { at: Date.now(), copied: me.copied, same: me.same, skipped: me.skipped, bytes: me.bytes, stopped: me.stop }; save();
  run = null; tell('');
  const mb = (me.bytes / 1048576).toFixed(me.bytes > 10485760 ? 0 : 1);
  return { ok: true, copied: me.copied, same: me.same, skipped: me.skipped, bytes: me.bytes, stopped: me.stop, where: root, text: `${me.stop ? 'Stopped. ' : ''}${me.copied} file${me.copied === 1 ? '' : 's'} copied (${mb} MB), ${me.same} were already there${me.skipped ? `, ${me.skipped} could not be read` : ''}.` };
}
function stop() { if (run) run.stop = true; return !!run; }
/** is a backup due? (the weekly reminder: Mewtwo asks, at most once a day) -> { due, here, auto } */
function due(now) {
  const c = load(); now = now || Date.now();
  if (!c.weekly || !c.target || run || (!c.items.length && !c.trainer)) return { due: false };
  if (c.last && now - c.last.at < WEEK) return { due: false };
  const here = !refuseTarget(c.target);
  if (!c.auto && now - c.asked < 24 * 3600 * 1000) return { due: false };
  c.asked = now; save();
  return { due: true, here, auto: c.auto && here, days: c.last ? Math.floor((now - c.last.at) / 86400000) : -1 };
}
function status() {
  const c = load(), h = deps.homes() || {};
  return { target: c.target, targetProblem: c.target ? refuseTarget(c.target) : '', where: c.target ? dest() : '', items: c.items.map((x) => ({ dir: x.dir, problem: refuseSource(x.dir) })), trainer: c.trainer, weekly: c.weekly, auto: c.auto, last: c.last, running: run ? { copied: run.copied, same: run.same, skipped: run.skipped, bytes: run.bytes } : null,
    sameDrive: !!c.target && c.items.some((x) => drive(x.dir) === drive(c.target)), profiles: Object.keys(PROFILES).map((k) => ({ key: k, name: PROFILES[k].name, text: PROFILES[k].text })),
    homes: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'].filter((k) => h[k]).map((k) => ({ key: k, dir: h[k], chosen: c.items.some((x) => norm(x.dir) === norm(h[k])) })) };
}
module.exports = { init, status, set, setTarget, addFolder, measure, start, stop, due, refuseTarget, refuseSource, PROFILES, WEEK, _test: { labelOf, dest, load } };
