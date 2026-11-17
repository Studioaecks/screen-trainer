// Screen Trainer — the Escape Rope (1.0): the whole Screen Trainer folder packed into one zip, for taking it along.
//
// The owner's wish: "export zip of itself, zip the user's whole Screen Trainer folder for transport. Not an empty copy:
// if the user moved sprites and ROM into the folder then they are included. Select the deposit location of the zip, and
// confirm closes and zips shut."
//
// Its rules:
//   1. It only reads. Nothing in the folder is changed, moved or deleted; the one file written is the zip, where the
//      owner chose (zipper.js writes "<zip>.part" first and renames it when it is whole).
//   2. What is packed is the Screen Trainer folder: the folder that holds the program folder ("Screen Trainer\" with
//      ScreenTrainer.exe) when it looks like Screen Trainer's own (sprites, sounds, backups, selfcheck, README.txt,
//      forks or mods next to it, or "Screen Trainer" in its name). Otherwise only the program folder itself, so that a
//      copy unzipped straight into Downloads never packs the whole Downloads folder. The confirmation names the folder.
//   3. The game goes along too: the save as a sealed "my game.stsave" (the same file as Options > Save data > Save game)
//      and settings.json, in "Escape Rope - my game" at the top of the zip. They live in %APPDATA%, not in the folder.
//      On another computer the program offers to load that save the first time it starts without one.
//      Mewtwo's and MyStream's files (an AI key, the Twitch login) stay behind: Windows seals them to this computer.
//   4. Left out always: half-written files (*.part, *.tmp), earlier Escape Rope zips at the top of the folder, and the
//      zip being written. Left out when the owner ticks it: old backups (backup-v*), shared empty copies (share) and
//      self-check pictures (selfcheck).
'use strict';
const fs = require('fs');
const path = require('path');
const zipper = require('./zipper');

const SAVE_DIR = 'Escape Rope - my game';
const SAVE_NAME = 'my game.stsave';
const OURS = /^(sprites-master|sprites|sounds|selfcheck|share|forks|mods|android|README\.txt|backup-v[\d.]+)$/i;
const LEAN = /^(backup-v[\d.]+|share|selfcheck)(\/|$)/i;
const ALWAYS_OUT = /(^|\/)[^/]+\.(part|tmp)$/i;
const OLD_ROPE = /^[^/]*escape rope[^/]*\.zip$/i;

/** the Screen Trainer folder for a program folder (rule 2) */
function home(exeDir) {
  const parent = path.dirname(exeDir);
  if (!parent || parent === exeDir) return exeDir;
  let names = [];
  try { names = fs.readdirSync(parent); } catch (e) { return exeDir; }
  const ours = names.filter((n) => OURS.test(n)).length;
  if (/screen ?trainer/i.test(path.basename(parent)) || ours >= 2) return parent;
  return exeDir;
}

/** what would be packed. o: { lean, outFile } */
function plan(root, o = {}) {
  const out = o.outFile ? path.resolve(o.outFile) : '';
  let leanBytes = 0, leanFiles = 0;
  const top = path.basename(root) || 'Screen Trainer';
  const items = zipper.collect(root, top, (rel, isDir) => {
    if (!isDir && (ALWAYS_OUT.test(rel) || OLD_ROPE.test(rel))) return true;
    if (out && path.resolve(root, rel) === out) return true;
    return false;
  });
  const kept = [];
  for (const it of items) {
    const rel = it.name.slice(top.length + 1);
    if (LEAN.test(rel)) { leanBytes += it.size || 0; leanFiles++; if (o.lean) continue; }
    kept.push(it);
  }
  const bytes = kept.reduce((s, it) => s + (it.size || 0), 0);
  return { root, top, items: kept, files: kept.length, bytes, leanBytes, leanFiles };
}

/** the note that goes in with the save */
function note(version, when) {
  return [
    `SCREEN TRAINER ${version}, packed by the Escape Rope on ${when}`,
    '',
    'This zip is a whole Screen Trainer folder: the program, and whatever was kept next to it (sprites, sounds,',
    'backups, mods, forks). This folder, "' + SAVE_DIR + '", holds the game that was being played:',
    '  my game.stsave   the saved game (the team, the Box, the Bag, the Pokédex, badges)',
    '  settings.json    the options',
    '',
    'ON THE OTHER COMPUTER',
    '  1. Unzip the whole zip somewhere you like (right-click > Extract All...). Do not run it from inside the zip.',
    '  2. Start "Screen Trainer\\ScreenTrainer.exe".',
    '  3. If that computer has never played Screen Trainer, it offers to load my game.stsave by itself.',
    '     Otherwise: Pokédex > options > Save data > "Load a saved game..." and choose my game.stsave.',
    '',
    'Mewtwo\'s AI key and the MyStream Twitch login are not in here: Windows locks them to the computer they were',
    'made on. Log in again on the new one.',
    '',
  ].join('\r\n');
}

/**
 * Pack. ctx: { root, outFile, lean, version, saveBuf (Buffer of a .stsave, or null), settingsText (or ''), onProgress, cancelled }
 * Returns what zipper.write returns.
 */
async function run(ctx) {
  const p = plan(ctx.root, { lean: ctx.lean, outFile: ctx.outFile });
  const extra = [], dir = p.top + '/' + SAVE_DIR + '/';
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  extra.push({ name: dir + 'READ ME.txt', data: Buffer.from(note(ctx.version || '', when), 'utf8') });
  if (ctx.saveBuf) extra.push({ name: dir + SAVE_NAME, data: ctx.saveBuf });
  if (ctx.settingsText) extra.push({ name: dir + 'settings.json', data: Buffer.from(ctx.settingsText, 'utf8') });
  const items = p.items.filter((it) => !it.name.startsWith(dir)).concat(extra);       // (a folder packed before holds an older one: the new one wins)
  return zipper.write(ctx.outFile, items, { onProgress: ctx.onProgress, cancelled: ctx.cancelled });
}

/** a save packed by an Escape Rope, next to the program (for "offer it on a computer that has none") */
function findSave(exeDir) {
  for (const d of [path.dirname(exeDir), exeDir]) {
    const f = path.join(d, SAVE_DIR, SAVE_NAME);
    try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* not here */ }
  }
  return null;
}
function findSettings(exeDir) {
  for (const d of [path.dirname(exeDir), exeDir]) {
    const f = path.join(d, SAVE_DIR, 'settings.json');
    try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* not here */ }
  }
  return null;
}

module.exports = { home, plan, run, note, findSave, findSettings, SAVE_DIR, SAVE_NAME, LEAN };
