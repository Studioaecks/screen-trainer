// Screen Trainer — forks (1.0): a copy of the program's own files to change and try out without danger.
//
// A fork is a folder forks\<name>\ in the Screen Trainer folder with:
//   app\          a copy of resources\app (all the source: change anything in here)
//   app\fork.json says that it is a fork, its name, and which version it was made from
//   data\         the fork's own settings and save (the main game's %APPDATA% folder is never touched by a fork)
// It is started by the same ScreenTrainer.exe with "--fork=<that folder>": main.js sees the argument before anything
// else and hands over to the fork's own main.js (rule 2). The fork runs as a program of its own beside the main game:
// its own tray icon (named after the fork), its own save, no startup entry, no hotkey, its own self-check folder. Both
// can run at once, one drawn over the other.
//
// Its rules:
//   1. Making a fork only copies: resources\app into forks\<name>\app, and (if the owner wants) the save and settings
//      into forks\<name>\data. Nothing of the main program is changed.
//   2. Only a folder under forks\ that holds fork.json and main.js is ever started as a fork (startArg checks).
//   3. A fork never registers itself to start with Windows and never takes the main game's hotkey, save, settings,
//      requests or self-check folder.
//   4. Throwing a fork away moves its folder to the Recycle Bin (deps.trash); nothing is deleted outright.
'use strict';
const fs = require('fs');
const path = require('path');

const NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
const SKIP = /^(fork\.json|node_modules|\.git)$/i;

/** this program, when it is a fork: { name, from, made, dir } (dir: forks\<name>) or null */
function self(appDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(appDir, 'fork.json'), 'utf8'));
    if (j && typeof j.name === 'string' && NAME.test(j.name)) return { name: j.name, from: String(j.from || '').slice(0, 20), made: String(j.made || '').slice(0, 30), dir: path.dirname(appDir) };
  } catch (e) { /* not a fork */ }
  return null;
}

/** "--fork=<folder>" on a command line, checked (rule 2): the fork's app folder, or null */
function startArg(argv, forksDir) {
  const a = (argv || []).find((x) => typeof x === 'string' && x.startsWith('--fork='));
  if (!a || !forksDir) return null;
  const dir = path.resolve(a.slice(7).replace(/^"|"$/g, ''));
  const root = path.resolve(forksDir) + path.sep;
  if (!dir.startsWith(root) || path.dirname(dir) + path.sep !== root) return null;      // exactly forks\<name>, nothing else
  const app = path.join(dir, 'app');
  try { if (fs.statSync(path.join(app, 'main.js')).isFile() && self(app)) return app; } catch (e) { /* not a fork */ }
  return null;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.test(d.name) || d.isSymbolicLink()) continue;
    const a = path.join(from, d.name), b = path.join(to, d.name);
    if (d.isDirectory()) copyDir(a, b); else if (d.isFile()) fs.copyFileSync(a, b);
  }
}

/** every fork in the forks folder */
function list(forksDir) {
  let names = [];
  try { names = fs.readdirSync(forksDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch (e) { return []; }
  return names.map((n) => { const s = self(path.join(forksDir, n, 'app')); return s ? { name: s.name, from: s.from, made: s.made, dir: path.join(forksDir, n) } : null; }).filter(Boolean);
}

/** a free name: "fork 1", "fork 2", ... */
function freeName(forksDir) {
  const have = new Set(list(forksDir).map((f) => f.name.toLowerCase()));
  for (let i = 1; i < 1000; i++) { const n = 'fork ' + i; if (!have.has(n) && !fs.existsSync(path.join(forksDir, n))) return n; }
  return 'fork ' + Date.now();
}

/**
 * Make a fork (rule 1). o: { forksDir, appDir, version, name, userDir (the main game's), withSave }
 * Returns { ok, name, dir } or { ok: false, error }.
 */
function make(o) {
  const name = o.name || freeName(o.forksDir);
  if (!NAME.test(name)) return { ok: false, error: 'A fork name is letters, digits, spaces, - and _, at most 40.' };
  const dir = path.join(o.forksDir, name);
  if (fs.existsSync(dir)) return { ok: false, error: `There is already a fork called "${name}".` };
  if (path.resolve(o.appDir).startsWith(path.resolve(o.forksDir) + path.sep)) return { ok: false, error: 'This is a fork already. Make new forks from the main game.' };
  try {
    copyDir(o.appDir, path.join(dir, 'app'));
    fs.writeFileSync(path.join(dir, 'app', 'fork.json'), JSON.stringify({ name, from: o.version || '', made: new Date().toISOString() }, null, 2));
    const data = path.join(dir, 'data');
    fs.mkdirSync(data, { recursive: true });
    if (o.withSave && o.userDir) {
      for (const f of ['save.json', 'settings.json']) { const a = path.join(o.userDir, f); if (fs.existsSync(a)) fs.copyFileSync(a, path.join(data, f)); }
      try {      // the fork's copy of the settings never starts with Windows (rule 3)
        const sf = path.join(data, 'settings.json'), s = JSON.parse(fs.readFileSync(sf, 'utf8'));
        s.autoStart = false; s.firstRun = false;
        fs.writeFileSync(sf, JSON.stringify(s, null, 2));
      } catch (e) { /* no settings yet: the fork starts fresh */ }
    }
    fs.writeFileSync(path.join(dir, 'ABOUT THIS FORK.txt'), [
      `A fork of Screen Trainer ${o.version || ''}, made ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.`,
      '',
      'app\\   the whole program (its source). Change anything here; the main game is not affected.',
      'data\\  this fork\'s own settings and save.' + (o.withSave ? ' It started as a copy of the main game\'s.' : ' It started empty.'),
      '',
      'Start it from the tray menu of the main game: Forks > Start "' + name + '". It runs beside the main game with its',
      'own tray icon. To throw it away: Forks > Throw away (it goes to the Recycle Bin).',
      'Liked a change? Copy the changed files from app\\ into Screen Trainer\\resources\\app\\ (make a backup first).',
      '',
    ].join('\r\n'));
    return { ok: true, name, dir };
  } catch (e) {
    return { ok: false, error: 'The fork could not be made: ' + e.message };
  }
}

module.exports = { self, startArg, list, make, freeName, NAME };
