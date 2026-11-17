// Screen Trainer — Optimize (0.7): Rotom's computer organizer. This file is the part that touches files.
//
// Rotom tidies ONE folder at a time, the one the owner picked in the system's own folder dialog, by moving the loose
// files in it into subfolders: by kind (Pictures, Videos, Documents ...), by year, or the way an AI suggests from the
// file names. Rotom is eager; these rules keep it harmless. tools/v07check.js enforces them on a pretend folder.
//
//   1. Only the chosen folder. Every path that is read or written is checked to lie inside it. Windows' own folders,
//      program folders, the user's whole profile, a whole drive and this program's folder cannot be chosen at all.
//   2. Names, sizes and dates only. No file is ever opened: Rotom does not know what is in your files, and neither
//      does an AI it asks (that gets the list of names and nothing else, and only if the owner presses the button).
//   3. Move, never delete, never overwrite. A file goes into a subfolder of the chosen folder; if a file of that name
//      is already there the newcomer gets " (2)" in its name. Folders, shortcuts and hidden or system files stay put.
//   4. Nothing happens without a plan the owner has seen. "Apply" carries out exactly the plan that was shown (its
//      id is checked), and only that.
//   5. Everything can be undone. Each applied plan is written to the log with where every file was; "Undo" moves
//      them back, and leaves alone any file that has been touched since (moved, renamed or replaced).
//   6. An AI only suggests folder names. Its answer is read as "file name -> folder name" and nothing else, and goes
//      through the same checks as Rotom's own plan (rule 1 and 3 hold whatever it says).
//
// State is kept in %APPDATA%\Screen Trainer\optimize.json: the chosen folder, and the log of applied plans.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILES = 4000, LOG_KEEP = 30;
// kinds of file by extension -> the subfolder they are sorted into
const KINDS = {
  Pictures: 'jpg jpeg png gif bmp webp heic heif tif tiff svg ico raw cr2 nef arw psd xcf avif',
  Videos: 'mp4 mkv mov avi wmv webm m4v flv mpg mpeg 3gp',
  Music: 'mp3 wav flac ogg m4a aac wma opus mid midi',
  Documents: 'pdf doc docx odt rtf txt md tex pages epub mobi',
  Spreadsheets: 'xls xlsx ods csv tsv numbers',
  Slides: 'ppt pptx odp key',
  Archives: 'zip rar 7z tar gz bz2 xz tgz iso cab',
  Installers: 'exe msi msix appx apk dmg pkg deb rpm',
  Code: 'js ts py java c cpp h hpp cs rb go rs php html css json xml yml yaml sh ps1 bat cmd sql ipynb lua',
  Fonts: 'ttf otf woff woff2',
  Models: 'gguf safetensors ckpt onnx pt pth bin',
  Torrents: 'torrent',
};
const KIND_OF = {};
for (const k in KINDS) for (const e of KINDS[k].split(' ')) KIND_OF[e] = k;
const STAY = /^(desktop\.ini|thumbs\.db|\.ds_store)$/i, STAY_EXT = new Set(['lnk', 'url', 'ini', 'sys', 'tmp', 'crdownload', 'part', 'partial', 'download']);
const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]/g;

let deps = { userDir: () => '', protectedDirs: () => [], complete: null }, state = null;
const file = () => path.join(deps.userDir(), 'optimize.json');
function load() {
  if (state) return state;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { raw = null; }
  state = { folder: raw && typeof raw.folder === 'string' ? raw.folder : '', mode: raw && ['kind', 'year', 'kindyear'].includes(raw.mode) ? raw.mode : 'kind', log: raw && Array.isArray(raw.log) ? raw.log.filter((l) => l && Array.isArray(l.moves)).slice(-LOG_KEEP) : [] };
  return state;
}
function save() { try { fs.mkdirSync(deps.userDir(), { recursive: true }); const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file()); } catch (e) { /* the log is kept in memory for this run */ } }
function init(d) { deps = Object.assign(deps, d || {}); state = null; plan = null; }

// ---- rule 1: where Rotom may work
const norm = (p) => { const r = path.resolve(String(p || '')); return process.platform === 'win32' ? r.toLowerCase() : r; };
const inside = (child, parent) => { const c = norm(child), p = norm(parent); return c !== p && c.startsWith(p.endsWith(path.sep) ? p : p + path.sep); };
/** why this folder cannot be tidied, or '' when it can */
function refuse(dir) {
  if (!dir || typeof dir !== 'string' || !path.isAbsolute(dir)) return 'That is not a folder.';
  let st = null;
  try { st = fs.statSync(dir); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) return 'That folder does not exist.';
  const d = norm(dir), root = norm(path.parse(dir).root);
  if (d === root) return 'A whole drive is too much: choose a folder on it.';
  for (const p of deps.protectedDirs()) {
    if (!p || !p.dir) continue;
    const q = norm(p.dir);
    if (d === q || (p.deep && inside(d, q)) || (p.above && inside(q, d))) return p.why;
  }
  return '';
}

// ---- rule 2: what Rotom sees of a folder: names, sizes, dates
function scan(dir) {
  const out = [], kept = [];
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return { files: out, kept, error: 'The folder could not be read: ' + e.message }; }
  let more = 0;
  for (const d of names) {
    if (!d.isFile()) { kept.push({ name: d.name, why: d.isDirectory() ? 'a folder' : 'not an ordinary file' }); continue; }
    const ext = path.extname(d.name).slice(1).toLowerCase();
    if (d.name.startsWith('.') || d.name.startsWith('~$') || STAY.test(d.name) || STAY_EXT.has(ext)) { kept.push({ name: d.name, why: 'left where it is (shortcut, hidden, system or unfinished file)' }); continue; }
    if (out.length >= MAX_FILES) { more++; continue; }
    let st = null;
    try { st = fs.statSync(path.join(dir, d.name)); } catch (e) { st = null; }
    if (!st) continue;
    out.push({ name: d.name, ext, size: st.size, time: st.mtimeMs });
  }
  return { files: out, kept, more };
}
const kindOf = (f) => KIND_OF[f.ext] || 'Other';
const yearOf = (f) => String(new Date(f.time).getFullYear());
/** a folder name that is safe to create: one or two plain parts, nothing that climbs out */
function cleanFolder(name) {
  const parts = String(name || '').split(/[\\/]+/).map((p) => p.replace(BAD_NAME, '').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 40)).filter((p) => p && p !== '..' && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(p)).slice(0, 2);
  return parts.join(path.sep);
}

// ---- rule 4: the plan
let plan = null;
/** build a plan from "file -> folder". Files whose folder is empty stay where they are. */
function makePlan(dir, files, pick, by) {
  const moves = [], stay = [];
  for (const f of files) {
    const to = cleanFolder(pick(f));
    if (!to) { stay.push(f.name); continue; }
    moves.push({ name: f.name, to, size: f.size });
  }
  const folders = {};
  for (const m of moves) { const g = (folders[m.to] = folders[m.to] || { name: m.to, files: 0, bytes: 0 }); g.files++; g.bytes += m.size; }
  const id = crypto.createHash('sha256').update(JSON.stringify([norm(dir), moves.map((m) => [m.name, m.to])])).digest('hex').slice(0, 16);
  return { id, dir, by, moves, stay, folders: Object.values(folders).sort((a, b) => b.files - a.files), made: Date.now() };
}
const view = (p) => (p ? { id: p.id, dir: p.dir, by: p.by, folders: p.folders, count: p.moves.length, stay: p.stay.length, bytes: p.moves.reduce((s, m) => s + m.size, 0), sample: p.moves.slice(0, 400).map((m) => ({ name: m.name, to: m.to })), note: p.note || '' } : null);

/** look at the chosen folder and plan how to sort it. mode: 'kind' | 'year' | 'kindyear' */
function propose(mode) {
  const s = load(), no = refuse(s.folder);
  if (no) return { ok: false, text: no };
  if (['kind', 'year', 'kindyear'].includes(mode)) { s.mode = mode; save(); }
  const sc = scan(s.folder);
  if (sc.error) return { ok: false, text: sc.error };
  const pick = s.mode === 'year' ? yearOf : s.mode === 'kindyear' ? (f) => kindOf(f) + path.sep + yearOf(f) : kindOf;
  plan = makePlan(s.folder, sc.files, pick, s.mode === 'year' ? 'by year' : s.mode === 'kindyear' ? 'by kind, then year' : 'by kind');
  if (sc.more) plan.note = `${sc.more} more files were left for the next round (at most ${MAX_FILES} at a time).`;
  return { ok: true, plan: view(plan), kept: sc.kept.length };
}
/** rule 6: let the AI chosen in Mewtwo's window suggest the folders, from the names alone */
async function proposeAi() {
  const s = load(), no = refuse(s.folder);
  if (no) return { ok: false, text: no };
  if (typeof deps.complete !== 'function') return { ok: false, text: 'No AI is connected.' };
  const sc = scan(s.folder);
  if (sc.error) return { ok: false, text: sc.error };
  const files = sc.files.slice(0, 600);
  if (!files.length) return { ok: false, text: 'There are no loose files in that folder.' };
  const system = 'You sort files into folders. You are given a numbered list of file names from one folder. Suggest a short folder name for each file, grouping related files (by project, topic or kind). Use at most 12 different folders, plain names of one to three words, no slashes. Answer with one line per file and nothing else, in the form  number<TAB>folder name . If a file should stay where it is, give it the folder name  -  .';
  const user = files.map((f, i) => `${i + 1}\t${f.name}`).join('\n');
  const r = await deps.complete(system, user, 4096);
  if (!r || !r.ok) return { ok: false, text: (r && r.text) || 'The AI did not answer.', none: !!(r && r.none) };
  const to = new Map();
  for (const line of String(r.text).split('\n')) { const m = /^\s*(\d+)\s*[\t|:.)-]+\s*(.+?)\s*$/.exec(line); if (m && +m[1] >= 1 && +m[1] <= files.length) to.set(+m[1] - 1, m[2] === '-' ? '' : m[2]); }
  if (to.size < Math.max(1, files.length * 0.5)) return { ok: false, text: 'The AI\'s answer could not be read as a plan. Rotom can sort by kind or by year by itself.' };
  plan = makePlan(s.folder, files, (f) => (to.has(files.indexOf(f)) ? cleanFolder(to.get(files.indexOf(f))).split(path.sep)[0] : ''), `as ${r.by} suggests`);
  if (plan.folders.length > 40) return { ok: false, text: 'The AI wanted more than 40 folders. That is not tidying.' };
  if (sc.files.length > files.length) plan.note = `Only the first ${files.length} files were shown to the AI.`;
  return { ok: true, plan: view(plan), by: r.by, sent: `${files.length} file names${r.local ? ' (to a model on this computer)' : ''}` };
}

// ---- rules 3, 4 and 5: carrying a plan out, and taking it back
const free = (dir, name) => { const ext = path.extname(name), base = name.slice(0, name.length - ext.length); let n = name, i = 2; while (fs.existsSync(path.join(dir, n))) n = `${base} (${i++})${ext}`; return n; };
function apply(id) {
  const s = load();
  if (!plan || plan.id !== id || norm(plan.dir) !== norm(s.folder)) return { ok: false, text: 'That is not the plan on the screen. Look again first.' };
  const no = refuse(plan.dir);
  if (no) return { ok: false, text: no };
  const done = [], failed = [];
  for (const m of plan.moves) {
    const from = path.join(plan.dir, m.name), dir = path.join(plan.dir, m.to);
    if (path.dirname(from) !== path.resolve(plan.dir) || !inside(dir, plan.dir) || path.basename(m.name) !== m.name) { failed.push({ name: m.name, why: 'outside the folder' }); continue; }      // rule 1, whatever the plan says
    try {
      const st = fs.lstatSync(from);
      if (!st.isFile()) { failed.push({ name: m.name, why: 'no longer an ordinary file' }); continue; }
      fs.mkdirSync(dir, { recursive: true });
      const name = free(dir, m.name), to = path.join(dir, name);
      fs.renameSync(from, to);                               // a move inside one folder: the file's content is never read or copied
      done.push({ from: m.name, to: path.join(m.to, name), size: st.size, time: st.mtimeMs });
    } catch (e) { failed.push({ name: m.name, why: e.code === 'EBUSY' || e.code === 'EPERM' ? 'in use by another program' : String(e.message || e).slice(0, 80) }); }
  }
  const entry = { at: Date.now(), dir: plan.dir, by: plan.by, moves: done, undone: false };
  if (done.length) { s.log.push(entry); s.log = s.log.slice(-LOG_KEEP); save(); }
  plan = null;
  return { ok: true, moved: done.length, failed, text: done.length ? `${done.length} file${done.length === 1 ? '' : 's'} sorted${failed.length ? `, ${failed.length} left where they were` : ''}.` : 'Nothing was moved.' };
}
/** take the last applied plan back */
function undo() {
  const s = load(), e = [...s.log].reverse().find((l) => !l.undone);
  if (!e) return { ok: false, text: 'There is nothing to undo.' };
  if (refuse(e.dir)) return { ok: false, text: 'That folder is not there any more.' };
  let back = 0; const left = [];
  for (const m of e.moves.slice().reverse()) {
    const now = path.join(e.dir, m.to), home = path.join(e.dir, m.from);
    if (!inside(now, e.dir) || path.dirname(home) !== path.resolve(e.dir)) { left.push({ name: m.from, why: 'outside the folder' }); continue; }
    try {
      const st = fs.lstatSync(now);
      if (!st.isFile() || st.size !== m.size || Math.abs(st.mtimeMs - m.time) > 2000) { left.push({ name: m.from, why: 'changed since it was sorted' }); continue; }      // rule 5: a file that was touched since is left alone
      if (fs.existsSync(home)) { left.push({ name: m.from, why: 'a file of that name is back in its old place' }); continue; }
      fs.renameSync(now, home); back++;
    } catch (err) { left.push({ name: m.from, why: 'not where it was put' }); }
  }
  // folders that Rotom made and that are empty again go, too (only empty ones: rmdir refuses anything else)
  for (const dir of [...new Set(e.moves.map((m) => path.dirname(m.to)))].sort((a, b) => b.length - a.length)) { let d = dir; while (d && d !== '.') { try { fs.rmdirSync(path.join(e.dir, d)); } catch (err) { break; } d = path.dirname(d); } }
  e.undone = true; save();
  return { ok: true, back, left, text: `${back} file${back === 1 ? '' : 's'} put back${left.length ? `, ${left.length} left alone` : ''}.` };
}

/** the owner picked a folder (in the system's dialog: main.js) */
function setFolder(dir) {
  const no = refuse(dir);
  if (no) return { ok: false, text: no };
  const s = load(); s.folder = path.resolve(dir); plan = null; save();
  return { ok: true, folder: s.folder };
}
/** what the window shows */
function status() {
  const s = load(), no = s.folder ? refuse(s.folder) : '', last = [...s.log].reverse().find((l) => !l.undone);
  let loose = 0, kept = 0;
  if (s.folder && !no) { const sc = scan(s.folder); loose = sc.files.length + (sc.more || 0); kept = sc.kept.length; }
  return { folder: s.folder, problem: no, mode: s.mode, loose, kept, plan: view(plan), canUndo: !!last, last: last ? { at: last.at, by: last.by, moved: last.moves.length, dir: last.dir } : null,
    log: s.log.slice(-12).reverse().map((l) => ({ at: l.at, dir: l.dir, by: l.by, moved: l.moves.length, undone: !!l.undone })) };
}

module.exports = { init, refuse, setFolder, status, propose, proposeAi, apply, undo, KINDS, MAX_FILES, _test: { scan, cleanFolder, makePlan, load } };
