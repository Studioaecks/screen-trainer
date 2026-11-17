// Screen Trainer — the sound bank: sound effects, cries and music taken once from a Game Boy Advance ROM
// the user owns, stored as one compact file (.stbank) that the audio engine (src/m4a.js) plays from.
//
// Used by main.js (Options > Sound > Import from ROM) and from the command line:
//
//   node soundbank.js "<rom file>" ["<output .stbank>"]
//
// The bank is only the sound data (about 2.5 MB for FireRed); the ROM itself is not needed afterwards.
'use strict';
const fs = require('fs');
const path = require('path');
const M4A = require('./src/m4a.js');
const SoundMap = require('./src/soundmap.js');

const USER_FILE = 'sounds.stbank';

/** build a bank from a ROM file. Returns { ok, bank?, info?, error? } */
function build(romPath) {
  let rom;
  try {
    const st = fs.statSync(romPath);
    if (/\.(zip|7z|rar)$/i.test(romPath)) return { ok: false, error: 'That is a compressed archive. Unzip it first and choose the .gba file inside.' };
    if (st.size < 0x400000 || st.size > 0x2000000) return { ok: false, error: 'That file is not the size of a Game Boy Advance ROM.' };
    rom = new Uint8Array(fs.readFileSync(romPath));
  } catch (e) { return { ok: false, error: 'The file could not be read: ' + e.message }; }
  try {
    const bank = M4A.buildBank(rom), img = M4A.open(bank);
    if (!SoundMap.supported(img.meta)) {
      return { ok: false, error: `This looks like "${(img.meta && img.meta.title) || 'an unknown game'}". Screen Trainer knows the sound layout of ${Object.values(SoundMap.GAMES).join(' and ')}.` };
    }
    return { ok: true, bank, info: { game: SoundMap.gameName(img.meta), songs: img.meta.songs, cries: img.meta.cryCount, bytes: bank.length } };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** where the bank lives: the one imported in the app first, otherwise a "sounds" folder next to the program */
function find(userDir, startDirs) {
  const own = path.join(userDir, USER_FILE);
  if (fs.existsSync(own)) return { file: own, source: 'imported' };
  for (const start of startDirs || []) {
    let dir = start;
    for (let i = 0; i < 6 && dir; i++) {
      try {
        const folder = path.join(dir, 'sounds');
        const hit = fs.readdirSync(folder).filter((n) => n.toLowerCase().endsWith('.stbank')).sort()[0];
        if (hit) return { file: path.join(folder, hit), source: 'folder' };
      } catch (e) { /* no sounds folder here */ }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}
function load(found) { try { return found ? new Uint8Array(fs.readFileSync(found.file)) : null; } catch (e) { return null; } }

/** import a ROM into the user's data folder */
function importRom(romPath, userDir) {
  const r = build(romPath);
  if (!r.ok) return r;
  try {
    fs.mkdirSync(userDir, { recursive: true });
    const file = path.join(userDir, USER_FILE), tmp = file + '.tmp';
    fs.writeFileSync(tmp, r.bank); fs.renameSync(tmp, file);
    return { ok: true, info: r.info, file };
  } catch (e) { return { ok: false, error: 'The sound bank could not be saved: ' + e.message }; }
}
function remove(userDir) { try { fs.unlinkSync(path.join(userDir, USER_FILE)); return true; } catch (e) { return false; } }

module.exports = { build, find, load, importRom, remove, USER_FILE };

if (require.main === module) {
  const [rom, out] = process.argv.slice(2);
  if (!rom) { console.error('usage: node soundbank.js "<rom file>" ["<output .stbank>"]'); process.exit(2); }
  const r = build(rom);
  if (!r.ok) { console.error(r.error); process.exit(1); }
  const file = out || path.join(path.dirname(rom), path.basename(rom).replace(/\.[^.]+$/, '') + '.stbank');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, r.bank);
  console.log(`${r.info.game}: ${r.info.songs} songs and sound effects, ${r.info.cries} cries, ${(r.info.bytes / 1048576).toFixed(2)} MB -> ${file}`);
}
