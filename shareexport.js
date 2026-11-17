// Screen Trainer — the empty copy (0.7): the program packed for somebody else, with nothing of the owner's in it.
//
// Options > Share > "Export an empty copy" writes one zip file: the program exactly as it runs here, and a
// "READ ME FIRST.txt". Whoever gets it unzips it, starts ScreenTrainer.exe, points it at a sprites folder of their
// own and, if they like, lets it read the sounds from a ROM of their own. Then they play.
//
// What is in it: the program files next to ScreenTrainer.exe and this folder (resources\app).
// What is never in it, whatever lies about (rule 5 of AGENTS.md: sprites and game sounds are never part of the program):
//   - sprites, sound banks, ROMs, Android apps and signing keys (NEVER below), and anything in the program folder that
//     is not a program file (only the kinds of file in ROOT_KEEP are taken from next to the .exe);
//   - the save, the settings, Mewtwo's and MyStream's files and the Twitch login: those live in %APPDATA%, which this
//     file never reads.
// tools/v07check.js packs a pretend program folder with every kind of thing that must stay out, and looks.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_KEEP = /\.(exe|dll|pak|bin|dat|json|html)$/i;          // what a program file next to the .exe looks like
const ROOT_NAMES = new Set(['LICENSE', 'version']);
const ROOT_DIRS = ['locales', 'resources'];
const RES_SKIP = new Set(['app', 'app.asar', 'default_app.asar']);  // (the game goes in from appDir; a test run has Electron's own stand-in app here)
// never packed, wherever it turns up
const NEVER = /\.(stbank|gba|nds|gbc|gb|sav|apk|aab|keystore|jks|pem|key)$|(^|\/)(save|settings|guardian|mystream|online|optimize|locked|sprites)\.json$|(^|\/)(sprites|sprites-master|sounds|backups|selfcheck|node_modules|\.git)(\/|$)/i;
const STORED = /\.(png|gif|jpg|jpeg|webp|zip|ttf|woff2?|mp4|webm)$/i;     // already packed: stored as they are

const list = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return []; } };
function walk(dir, rel, out) {
  for (const d of list(dir).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? rel + '/' + d.name : d.name, full = path.join(dir, d.name);
    if (NEVER.test(r) || d.name.startsWith('.')) continue;
    if (d.isDirectory()) walk(full, r, out); else if (d.isFile()) out.push({ rel: r, file: full });
  }
  return out;
}

/** what would be packed. exeDir: the folder ScreenTrainer.exe is in; appDir: this folder (resources\app). */
function plan(exeDir, appDir) {
  const entries = [];
  for (const d of list(exeDir)) if (d.isFile() && (ROOT_KEEP.test(d.name) || ROOT_NAMES.has(d.name)) && !NEVER.test(d.name)) entries.push({ rel: d.name, file: path.join(exeDir, d.name) });
  for (const dir of ROOT_DIRS) {
    if (dir === 'resources') { for (const d of list(path.join(exeDir, dir))) { if (RES_SKIP.has(d.name) || NEVER.test('resources/' + d.name)) continue; const full = path.join(exeDir, dir, d.name); if (d.isDirectory()) walk(full, 'resources/' + d.name, entries); else if (d.isFile()) entries.push({ rel: 'resources/' + d.name, file: full }); } }
    else walk(path.join(exeDir, dir), dir, entries);
  }
  walk(appDir, 'resources/app', entries);
  let bytes = 0;
  for (const e of entries) { try { e.size = fs.statSync(e.file).size; } catch (err) { e.size = 0; } bytes += e.size; }
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { entries, bytes, exe: entries.some((e) => /\.exe$/i.test(e.rel) && !e.rel.includes('/')) };
}

/** the note that goes in with it */
function readme(version) {
  return [
    `SCREEN TRAINER ${version}`,
    '=================',
    '',
    'A fan-made idle game: wild Pokémon hop onto your screen over whatever you are doing, your team fights and',
    'catches them, and a little Field Dex keeps the team, the Box, the Bag and the options. It can also put your',
    'idle desktop games on one calm picture and stream or record that picture instead of your desktop.',
    '',
    'This copy is empty on purpose. It holds the program and nothing else: no pictures of Pokémon, no game sounds,',
    'no saved game. You bring your own:',
    '',
    'TO START',
    '  1. Unzip this folder anywhere you like and start ScreenTrainer.exe. A tray icon appears.',
    '  2. Pictures. Right-click the tray icon > Pokédex > options > Overlay > "Sprites folder" > Choose folder, and',
    '     pick a sprites folder of your own: the one that holds the folders "pokemon" and "items" (a download of a',
    '     sprite collection called "sprites-master", or its "sprites" folder, is laid out that way).',
    '     Without one nothing can be drawn, and the program says so.',
    '  3. Sounds (optional). options > Sound > "Import from ROM" reads the sounds out of a ROM of Pokémon FireRed',
    '     (or LeafGreen, Ruby, Sapphire, Emerald) that you own, once. Without one the program plays its own',
    '     simple built-in sounds.',
    '  4. Play. Wild Pokémon hop in from the edges of your screen: left-click one to weaken it, right-click it to',
    '     throw a ball. Shortly after you start, three large friendly visitors come by, one after the other',
    '     (Rotom, Mewtwo, Porygon-Z). Right-click each to catch it: every one of them opens a part of the program.',
    '',
    'IF WINDOWS OR AN ANTIVIRUS WARNS',
    '  Screen Trainer is not signed by a company, so Windows and some antivirus programs (Norton, AVG and others) are',
    '  careful with it the first time. Nothing is installed: it runs from this folder.',
    '  - "Windows protected your PC": click "More info", then "Run anyway".',
    '  - An antivirus moved ScreenTrainer.exe to quarantine or blocked it: open the antivirus, find Screen Trainer in its',
    '    quarantine or history, choose Restore, and add this whole folder as an exclusion (Norton: Settings > Antivirus >',
    '    Scans and Risks > Exclusions / Low Risks > "Items to Exclude from Scans" and "Items to Exclude from Auto-Protect",',
    '    then add the folder). Then start ScreenTrainer.exe again.',
    '  - Windows Firewall may ask about network access the first time online visiting is used: allow it on private',
    '    networks for visits between computers at home.',
    '',
    'GOOD TO KNOW',
    '  - Saved games: tray menu > Saved games. The Escape Rope there packs this whole folder, with your sprites, sounds',
    '    and saved game, into one zip to take to another computer.',
    '  - Mods: the "mods" folder next to the program folder. Its README says how to write one; every mod is off until',
    '    you switch it on in options > Mods and forks.',
    '  - Options > Field shows a field window with a fountain square in it, if you would rather keep everyone in',
    '    one place than all over the screen.',
    '  - MyStream (Porygon-Z\'s button in the Field Dex) streams to Twitch or records a video of one picture that',
    '    you arrange: never your desktop, your files or your notifications. Idle games that sit on the desktop',
    '    can be put on that picture next to your Pokémon: Task Bar Hero and Mini Cozy Room on Steam, among',
    '    others, work well there.',
    '  - Online visiting is off until you switch it on (tray menu > Online visiting, or the ball on top of the',
    '    fountain). Then you can visit other Trainers on their field, and with MyStream open they can visit yours:',
    '    up to four play together, and whatever is caught, everyone there gets one. Nobody can type at you: a',
    '    name is a class and a number, and the only "chat" is a short list of ready-made lines. A visit is a',
    '    direct connection between two computers, so each can find out the other\'s IP address.',
    '  - Options > Android app packs the game for your own phone.',
    '  - Everything you do stays on your computer, in %APPDATA%\\Screen Trainer. To start over: options > Save data.',
    '  - The help screen in the Field Dex explains the rest.',
    '',
    'Screen Trainer is a fan project. It is not made, endorsed or supported by Nintendo, Game Freak, Creatures or',
    'The Pokémon Company, who own Pokémon and everything about it. It contains none of their pictures or sounds.',
    '',
  ].join('\r\n');
}

// ---- writing the zip: one file after another, packed off the main thread so the windows stay alive
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const deflate = (buf) => new Promise((res, rej) => zlib.deflateRaw(buf, { level: 6 }, (err, out) => (err ? rej(err) : res(out))));

/** pack the empty copy. ctx: { exeDir, appDir, version }. Returns { ok, file, bytes, files } or { ok: false, error }. */
async function run(ctx, outFile, onProgress) {
  const p = plan(ctx.exeDir, ctx.appDir), top = 'Screen Trainer/';
  if (!p.entries.length) return { ok: false, error: 'There is nothing to pack.' };
  const items = [{ rel: 'READ ME FIRST.txt', data: Buffer.from(readme(ctx.version || ''), 'utf8') }].concat(p.entries);
  const tmp = outFile + '.part', central = [];
  let fd = null, offset = 0, done = 0, doneBytes = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const put = (b) => new Promise((res, rej) => fs.write(fd, b, 0, b.length, null, (err) => { if (err) rej(err); else { offset += b.length; res(); } }));
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fd = fs.openSync(tmp, 'w');
    for (const e of items) {
      const plain = e.data || (await fs.promises.readFile(e.file)), name = Buffer.from(top + e.rel, 'utf8'), crc = crc32(plain);
      let method = 0, body = plain;
      if (!STORED.test(e.rel) && plain.length >= 64) { const packed = await deflate(plain); if (packed.length < plain.length) { method = 8; body = packed; } }
      const flags = /[^\x20-\x7e]/.test(top + e.rel) ? 0x0800 : 0, h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12);
      h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(plain.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
      central.push({ name, flags, method, crc, csize: body.length, usize: plain.length, offset });
      await put(h); await put(name); await put(body);
      done++; doneBytes += plain.length;
      if (onProgress) onProgress({ step: 'pack', done, of: items.length, bytes: doneBytes, ofBytes: p.bytes });
    }
    const start = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(c.flags, 8); h.writeUInt16LE(c.method, 10); h.writeUInt16LE(dosTime, 12); h.writeUInt16LE(dosDate, 14);
      h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.offset, 42);
      await put(h); await put(c.name);
    }
    if (central.length > 65000 || offset > 0xfff00000) throw new Error('too many or too large files for one zip');
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16);
    await put(end);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tmp, outFile);
    return { ok: true, file: outFile, bytes: offset, files: central.length, unpacked: p.bytes, hasExe: p.exe };
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (err) { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch (err) { /* nothing was written */ }
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { plan, run, readme, NEVER };
