// Screen Trainer — Rotom's big tidy-up (0.9.9, owner's list 11-16 update 20). This file is the part that touches files.
//
// optimize.js (0.7) sorts the loose files of ONE folder. This is the larger job the owner asked for: several folders or
// "the whole computer" (which here means the owner's personal folders: Desktop, Documents, Downloads, Pictures, Videos,
// Music, and any folder added), with a walkthrough that asks how each kind of file should be handled, a plan that is
// shown before anything happens, and questions wherever Rotom is not sure. More reach needs stricter rules:
//
//   1. Only the folders the owner chose (the roots), minus the ones the owner said to ignore. Windows, programs, program
//      data, AppData and this program can never be roots, and a folder that holds any of them is never gone into.
//      Links and junctions are never followed.
//   2. Names, sizes and dates only. No file is ever opened: pictures are sorted by their date and name, not by what
//      they show (that waits for an AI that runs on this computer).
//   3. Files are moved, never deleted, never overwritten (a second file of a name becomes "name (2)"), and never across
//      drives: a file stays on the drive it is on (a move on one drive is instant and cannot fail half-way).
//   4. A folder is taken apart only if the owner ticked that very folder in the plan. A folder that looks like it
//      belongs together is never offered (a program, a project, a game, a backup: 'never') or is offered with the reason
//      Rotom is unsure (an album, a set, a very large folder: 'ask').
//   5. A folder that was taken apart and is empty goes to the Recycle Bin (never deleted for good), if the owner said so.
//   6. Nothing happens without the plan the owner has seen: apply() takes the plan's id and carries out exactly that.
//   7. Everything can be undone: every move is written down with where the file was; undo() puts each file back (one
//      that was changed since is left alone) and makes the binned folders again.
//
// tools/v099check.js runs all of this on a pretend home folder.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILES = 20000, MAX_DEPTH = 6, LOG_KEEP = 20;
const KINDS = {
  Pictures: 'jpg jpeg png gif bmp webp heic heif tif tiff svg raw cr2 nef arw psd xcf avif',
  Videos: 'mp4 mkv mov avi wmv webm m4v flv mpg mpeg 3gp',
  Music: 'mp3 wav flac ogg m4a aac wma opus mid midi',
  Documents: 'pdf doc docx odt rtf txt md tex pages epub mobi',
  Spreadsheets: 'xls xlsx ods csv tsv numbers',
  Slides: 'ppt pptx odp key',
  Archives: 'zip rar 7z tar gz bz2 xz tgz iso cab',
  Installers: 'exe msi msix appx apk dmg pkg deb rpm',
};
const KIND_OF = {};
for (const k in KINDS) for (const e of KINDS[k].split(' ')) KIND_OF[e] = k;
const GROUP = { Pictures: 'pictures', Videos: 'videos', Music: 'music', Documents: 'documents', Spreadsheets: 'documents', Slides: 'documents' };      // which question of the walkthrough decides
const STAY = /^(desktop\.ini|thumbs\.db|\.ds_store)$/i, STAY_EXT = new Set(['lnk', 'url', 'ini', 'sys', 'tmp', 'crdownload', 'part', 'partial', 'download']);
// what makes a folder one thing that must not be taken apart (rule 4, 'never'): a file or folder of one of these names in it
const NEVER_NAMES = ['.git', '.svn', '.hg', 'node_modules', 'package.json', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'makefile', 'cmakelists.txt', 'setup.exe', 'autorun.inf', 'steam_appid.txt', 'projectsettings', '.vscode', '.idea', 'unins000.exe', 'gradlew', 'pom.xml', 'index.html', 'manifest.json'];
const NEVER_EXT = new Set(['sln', 'csproj', 'vcxproj', 'uproject', 'unity', 'xcodeproj', 'dll', 'exe', 'pak', 'asar', 'jar', 'sys']);
const ASK_NAME = /(backup|back-up|save|saves|game|project|install|setup|portable|archive|old|copy|do not|don't|important|work|tax|invoice)/i;

let deps = { userDir: () => '', protectedDirs: () => [], homes: () => ({}), trash: async () => false }, state = null, plan = null;
const file = () => path.join(deps.userDir(), 'tidy.json');
function load() {
  if (state) return state;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { raw = null; }
  state = { log: raw && Array.isArray(raw.log) ? raw.log.filter((l) => l && Array.isArray(l.moves)).slice(-LOG_KEEP) : [], last: raw && raw.last && typeof raw.last === 'object' ? raw.last : null };
  return state;
}
function save() { try { fs.mkdirSync(deps.userDir(), { recursive: true }); const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file()); } catch (e) { /* kept in memory for this run */ } }
function init(d) { deps = Object.assign(deps, d || {}); state = null; plan = null; }

// ---- rule 1: where Rotom may work
const norm = (p) => { const r = path.resolve(String(p || '')); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inside = (child, parent) => { const c = norm(child), p = norm(parent); return c !== p && c.startsWith(p.endsWith(path.sep) ? p : p + path.sep); };
const within = (child, parent) => norm(child) === norm(parent) || inside(child, parent);
const drive = (p) => norm(path.parse(path.resolve(p)).root);
/** why this folder cannot be one of the roots, or '' */
function refuseRoot(dir) {
  if (!dir || typeof dir !== 'string' || !path.isAbsolute(dir)) return 'That is not a folder.';
  let st = null;
  try { st = fs.statSync(dir); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) return 'That folder does not exist.';
  if (norm(dir) === drive(dir)) return 'A whole drive is too much: choose folders on it.';
  for (const p of deps.protectedDirs()) { if (!p || !p.dir) continue; if (norm(dir) === norm(p.dir) || (p.deep && inside(dir, p.dir)) || (p.above && inside(p.dir, dir) && !p.rootOk)) return p.why; }
  return '';
}
/** may Rotom work in this folder? Never in a protected place or one the owner said to ignore. strict (for a folder below
 *  a root, before it is gone into or taken apart): also never one that HOLDS a protected place. A root itself may hold
 *  one (the Desktop holds this program's folder on the owner's PC): its loose files are sorted, that folder is skipped. */
function offLimits(dir, ignore, strict) {
  for (const p of deps.protectedDirs()) { if (!p || !p.dir) continue; if (within(dir, p.dir) && (p.deep || norm(dir) === norm(p.dir))) return 'off limits'; if (strict && p.deep && inside(p.dir, dir)) return 'holds a place Rotom stays out of'; }
  for (const i of ignore || []) if (within(dir, i)) return 'you said to leave it alone';
  return '';
}

// ---- rule 2: what Rotom sees
const ext = (name) => path.extname(name).slice(1).toLowerCase();
const loose = (name) => !(name.startsWith('.') || name.startsWith('~$') || STAY.test(name) || STAY_EXT.has(ext(name)));
function list(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; } }
/** rule 4: does this folder belong together? { level: 'never' | 'ask' | '', why } (looks at names only, two levels deep) */
function unit(dir, entries) {
  const names = entries.map((d) => d.name.toLowerCase());
  for (const n of names) if (NEVER_NAMES.includes(n)) return { level: 'never', why: `it holds "${n}": it looks like a program, a project or a website` };
  const files = entries.filter((d) => d.isFile()), exts = files.map((d) => ext(d.name));
  const hard = exts.find((e) => NEVER_EXT.has(e));
  if (hard) return { level: 'never', why: `it holds .${hard} files: it looks like a program or a project` };
  for (const d of entries) if (d.isDirectory() && !d.isSymbolicLink()) {      // one level further: a program often keeps its files a folder down
    const sub = list(path.join(dir, d.name));
    if (sub && (sub.some((x) => NEVER_NAMES.includes(x.name.toLowerCase())) || sub.some((x) => x.isFile() && NEVER_EXT.has(ext(x.name))))) return { level: 'never', why: `its folder "${d.name}" looks like a program or a project` };
  }
  if (ASK_NAME.test(path.basename(dir))) return { level: 'ask', why: 'its name says it may be a backup, a project or something kept on purpose' };
  if (files.length >= 8) {
    const by = {}; for (const e of exts) { const k = KIND_OF[e] || 'Other'; by[k] = (by[k] || 0) + 1; }
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / files.length >= 0.85 && ['Pictures', 'Music', 'Videos'].includes(top[0])) return { level: 'ask', why: `it is nearly all ${top[0].toLowerCase()}: it looks like an album or a set that belongs together` };
  }
  if (entries.length > 400) return { level: 'ask', why: 'it is very large' };
  if (entries.some((d) => d.isDirectory())) return { level: 'ask', why: 'it has folders of its own inside: somebody arranged it' };
  return { level: '', why: '' };
}
/** every loose file under dir (for a folder the owner ticked), never into a part of it that belongs together */
function filesUnder(dir, ignore, depth, out) {
  const entries = list(dir);
  if (!entries) return out;
  for (const d of entries) {
    if (out.length >= MAX_FILES) break;
    const p = path.join(dir, d.name);
    if (d.isSymbolicLink()) continue;
    if (d.isFile()) { if (loose(d.name)) out.push(p); continue; }
    if (!d.isDirectory() || depth >= MAX_DEPTH || offLimits(p, ignore, true)) continue;
    const sub = list(p);
    if (!sub || unit(p, sub).level === 'never') continue;
    filesUnder(p, ignore, depth + 1, out);
  }
  return out;
}

// ---- the walkthrough's answers, cleaned
const HOW = ['gather', 'inplace', 'leave'];
function answers(o) {
  o = o && typeof o === 'object' ? o : {};
  const how = (v, d) => (HOW.includes(v) ? v : d), dirs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && path.isAbsolute(x)).map((x) => path.resolve(x)).slice(0, 60) : []);
  const pic = o.pictures && typeof o.pictures === 'object' ? o.pictures : {};
  return {
    roots: dirs(o.roots), ignore: dirs(o.ignore), dissolve: dirs(o.dissolve),
    pictures: { how: how(pic.how, 'gather'), by: ['year', 'month', 'flat'].includes(pic.by) ? pic.by : 'year', rename: !!pic.rename },
    videos: how(o.videos, 'gather'), music: how(o.music, 'gather'), documents: how(o.documents, 'inplace'), other: o.other === 'leave' ? 'leave' : 'inplace',
    inside: !!o.inside, bin: !!o.bin,
  };
}
const pad = (n) => String(n).padStart(2, '0');
/** where one file goes: { dir, name } or null (it stays) */
function destination(file, root, st, a) {
  const name = path.basename(file), kind = KIND_OF[ext(name)] || '', group = GROUP[kind] || 'other';
  if (!kind) return null;                                 // a kind Rotom does not know stays where it is
  const how = group === 'pictures' ? a.pictures.how : a[group];
  if (how === 'leave') return null;
  const homes = deps.homes() || {}, home = { pictures: homes.Pictures, videos: homes.Videos, music: homes.Music, documents: homes.Documents }[group];
  const isHome = (home && norm(root) === norm(home)) || path.basename(root).toLowerCase() === kind.toLowerCase();      // sorting Pictures inside the Pictures folder makes no "Pictures\Pictures"
  let base = isHome ? root : path.join(root, kind), gathered = false;
  if (how === 'gather' && home && fs.existsSync(home) && drive(home) === drive(file) && !offLimits(home, a.ignore)) { base = group === 'documents' && kind !== 'Documents' ? path.join(home, kind) : home; gathered = true; }
  const d = new Date(st.mtimeMs);
  if (group === 'pictures' && a.pictures.by !== 'flat') base = path.join(base, String(d.getFullYear()), ...(a.pictures.by === 'month' ? [`${d.getFullYear()}-${pad(d.getMonth() + 1)}`] : []));
  const to = group === 'pictures' && a.pictures.rename ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}${path.extname(name).toLowerCase()}` : name;
  if (norm(base) === norm(path.dirname(file)) && to === name) return null;      // it is where it belongs already
  if (!gathered && within(path.dirname(file), path.join(root, kind)) && to === name) return null;      // already sorted here by kind (and by date, if deeper)
  return { dir: base, name: to, gathered };
}

// ---- rule 6: the plan
function makePlan(o) {
  const a = answers(o), moves = [], unsure = [], candidates = [], kept = [], problems = [];
  let cross = 0, stay = 0, seen = 0;
  const roots = [];
  for (const r of a.roots) { const no = refuseRoot(r) || offLimits(r, a.ignore); if (no) problems.push({ dir: r, why: no }); else if (!roots.some((x) => within(r, x))) roots.push(r); }
  const take = (file, root) => {
    if (moves.length >= MAX_FILES) return;
    let st = null; try { st = fs.lstatSync(file); } catch (e) { st = null; }
    if (!st || !st.isFile()) return;
    seen++;
    const d = destination(file, root, st, a);
    if (!d) { stay++; return; }
    if (drive(d.dir) !== drive(file)) { cross++; return; }                // rule 3 (destination() never picks another drive; kept as a second lock)
    moves.push({ from: file, dir: d.dir, name: d.name, size: st.size, time: st.mtimeMs });
  };
  for (const root of roots) {
    const entries = list(root);
    if (!entries) { problems.push({ dir: root, why: 'it could not be read' }); continue; }
    for (const d of entries) {
      const p = path.join(root, d.name);
      if (d.isSymbolicLink()) continue;
      if (d.isFile()) { if (loose(d.name)) take(p, root); continue; }
      if (!d.isDirectory()) continue;
      if (roots.some((x) => norm(x) === norm(p))) continue;                 // a root of its own
      const off = offLimits(p, a.ignore, true);
      if (off) { kept.push({ dir: p, why: off }); continue; }
      if (KINDS[d.name] || /^(19|20)\d\d$/.test(d.name) || d.name === 'Other') continue;      // a folder of the sorting itself
      if (!a.inside) continue;
      const sub = list(p); if (!sub) continue;
      const u = unit(p, sub), n = sub.filter((x) => x.isFile() && loose(x.name)).length;
      if (u.level === 'never') { kept.push({ dir: p, why: u.why }); continue; }
      const ticked = a.dissolve.some((x) => norm(x) === norm(p));
      (u.level === 'ask' ? unsure : candidates).push({ dir: p, files: n, why: u.why, ticked });
      if (ticked) for (const f of filesUnder(p, a.ignore, 1, [])) take(f, root);      // rule 4: only a folder the owner ticked is taken apart
    }
  }
  const dests = {};
  for (const m of moves) { const g = (dests[norm(m.dir)] = dests[norm(m.dir)] || { dir: m.dir, files: 0, bytes: 0 }); g.files++; g.bytes += m.size; }
  const id = crypto.createHash('sha256').update(JSON.stringify([a, moves.map((m) => [m.from, m.dir, m.name])])).digest('hex').slice(0, 16);
  return { id, a, roots, moves, dests: Object.values(dests).sort((x, y) => y.files - x.files), unsure, candidates, kept, problems, cross, stay, seen, made: Date.now() };
}
const view = (p) => (p ? { id: p.id, roots: p.roots, count: p.moves.length, bytes: p.moves.reduce((s, m) => s + m.size, 0), dests: p.dests.slice(0, 200), unsure: p.unsure, candidates: p.candidates, kept: p.kept.slice(0, 200), problems: p.problems, cross: p.cross, stay: p.stay, seen: p.seen,
  full: p.moves.length >= MAX_FILES, sample: p.moves.slice(0, 300).map((m) => ({ from: m.from, to: path.join(m.dir, m.name) })), bin: p.a.bin, dissolve: p.a.dissolve.length } : null);
function propose(o) { plan = makePlan(o); return { ok: true, plan: view(plan) }; }

// ---- rules 3, 5, 6, 7: carrying it out, and taking it back
const free = (dir, name) => { const e = path.extname(name), base = name.slice(0, name.length - e.length); let n = name, i = 2; while (fs.existsSync(path.join(dir, n))) n = `${base} (${i++})${e}`; return n; };
const hasFiles = (dir, depth) => { const es = list(dir); if (!es) return true; for (const d of es) { if (!d.isDirectory() || d.isSymbolicLink() || depth > MAX_DEPTH + 2) return true; if (hasFiles(path.join(dir, d.name), depth + 1)) return true; } return false; };
let running = false;
async function apply(id, onProgress) {
  const s = load();
  if (running) return { ok: false, text: 'Rotom is already at work.' };
  if (!plan || plan.id !== id) return { ok: false, text: 'That is not the plan on the screen. Look again first.' };
  const p = plan; plan = null; running = true;
  const done = [], failed = [], made = new Set(), binned = [], homes = Object.values(deps.homes() || {}).filter(Boolean);
  const allowed = (dir) => p.roots.some((r) => within(dir, r)) || homes.some((h) => within(dir, h));
  try {
    for (let i = 0; i < p.moves.length; i++) {
      const m = p.moves[i];
      if (i % 25 === 0) { if (onProgress) onProgress({ done: i, of: p.moves.length, name: path.basename(m.from), to: m.dir }); await new Promise((r) => setImmediate(r)); }
      if (!p.roots.some((r) => inside(m.from, r)) || offLimits(path.dirname(m.from), p.a.ignore) || !allowed(m.dir) || offLimits(m.dir, p.a.ignore) || path.basename(m.name) !== m.name || drive(m.dir) !== drive(m.from)) { failed.push({ name: m.from, why: 'outside what was chosen' }); continue; }      // rules 1 and 3, whatever the plan says
      try {
        const st = fs.lstatSync(m.from);
        if (!st.isFile() || st.size !== m.size) { failed.push({ name: m.from, why: 'changed since the plan was made' }); continue; }
        for (let d = m.dir; !fs.existsSync(d); d = path.dirname(d)) made.add(d);
        fs.mkdirSync(m.dir, { recursive: true });
        const to = path.join(m.dir, free(m.dir, m.name));
        fs.renameSync(m.from, to);                          // a move on one drive: the file's content is never read or copied
        done.push({ from: m.from, to, size: st.size, time: st.mtimeMs });
      } catch (e) { failed.push({ name: m.from, why: e.code === 'EBUSY' || e.code === 'EPERM' ? 'in use by another program' : e.code === 'EXDEV' ? 'on another drive' : String(e.message || e).slice(0, 80) }); }
    }
    // rule 5: a folder the owner ticked that holds no file any more goes to the Recycle Bin
    if (p.a.bin) for (const d of p.a.dissolve) {
      if (!p.roots.some((r) => inside(d, r)) || offLimits(d, p.a.ignore) || !fs.existsSync(d) || hasFiles(d, 0)) continue;
      let ok = false; try { ok = (await deps.trash(d)) !== false; } catch (e) { ok = false; }
      if (ok && !fs.existsSync(d)) binned.push(d);
    }
  } finally { running = false; }
  const entry = { at: Date.now(), roots: p.roots, moves: done, made: [...made], binned, undone: false };
  if (done.length || binned.length) { s.log.push(entry); s.log = s.log.slice(-LOG_KEEP); }
  s.last = p.a; save();
  if (onProgress) onProgress({ done: p.moves.length, of: p.moves.length, end: true });
  return { ok: true, moved: done.length, failed: failed.slice(0, 200), failedCount: failed.length, binned: binned.length, text: `${done.length} file${done.length === 1 ? '' : 's'} put in order${binned.length ? `, ${binned.length} empty folder${binned.length === 1 ? '' : 's'} in the Recycle Bin` : ''}${failed.length ? `, ${failed.length} left where they were` : ''}.` };
}
/** take the last tidy-up back: every file to where it was, the binned (empty) folders made again */
function undo() {
  const s = load(), e = [...s.log].reverse().find((l) => !l.undone);
  if (running) return { ok: false, text: 'Rotom is at work.' };
  if (!e) return { ok: false, text: 'There is nothing to undo.' };
  let back = 0; const left = [];
  for (const d of e.binned || []) { try { fs.mkdirSync(d, { recursive: true }); } catch (err) { /* its files will say so */ } }
  for (const m of e.moves.slice().reverse()) {
    try {
      const st = fs.lstatSync(m.to);
      if (!st.isFile() || st.size !== m.size || Math.abs(st.mtimeMs - m.time) > 2000) { left.push({ name: m.to, why: 'changed since' }); continue; }
      if (fs.existsSync(m.from)) { left.push({ name: m.to, why: 'a file of that name is back in its old place' }); continue; }
      fs.mkdirSync(path.dirname(m.from), { recursive: true });
      fs.renameSync(m.to, m.from); back++;
    } catch (err) { left.push({ name: m.to, why: 'not where it was put' }); }
  }
  for (const d of (e.made || []).slice().sort((x, y) => y.length - x.length)) { try { fs.rmdirSync(d); } catch (err) { /* not empty: it stays */ } }      // folders Rotom made, if empty again (rmdir refuses anything else)
  e.undone = true; save();
  return { ok: true, back, left: left.slice(0, 200), text: `${back} file${back === 1 ? '' : 's'} put back${left.length ? `, ${left.length} left alone` : ''}.` };
}
/** the owner's personal folders, for "the whole computer" */
function presets() {
  const h = deps.homes() || {};
  return ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'].map((k) => ({ key: k, dir: h[k] || '', ok: !!h[k] && !refuseRoot(h[k]) })).filter((x) => x.dir);
}
function status() {
  const s = load(), last = [...s.log].reverse().find((l) => !l.undone);
  return { presets: presets(), plan: view(plan), running, last: s.last, canUndo: !!last, lastRun: last ? { at: last.at, moved: last.moves.length, binned: (last.binned || []).length } : null,
    log: s.log.slice(-10).reverse().map((l) => ({ at: l.at, moved: l.moves.length, binned: (l.binned || []).length, undone: !!l.undone, roots: l.roots })) };
}

module.exports = { init, refuseRoot, propose, apply, undo, status, presets, KINDS, MAX_FILES, _test: { unit, destination, answers, makePlan, offLimits, list } };
