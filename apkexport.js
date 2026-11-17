// Screen Trainer — Android export (main process): turns the game, with the options exactly as they are set at that
// moment, into an Android app (.apk) for the user's own phone or tablet.
//
// What goes into the app
//   android/           the shell: a small Java program that shows a web view (sources and manifest are in this folder)
//   assets/app/        the game: the same pages and scripts this program runs, plus android.html and src/android.js,
//                      which stand in for this main process on the device
//   assets/app/locked.json    the options as they are now: what the app starts with (they can be changed in the app since 0.6;
//                             the file keeps its old name so older notes still find it).
//   assets/app/save.json      the save as it is now (optional)
//   assets/app/sounds.stbank  the user's sound bank (optional)
//   assets/sprites/    the pictures those options need, copied from the user's own sprites folder: every species of the
//                      chosen generations, whatever they evolve into, the species in the save, items, types, badges
//
// How it is built
//   The shell is compiled on this computer with the Android tools that are already installed on it (a Java kit and
//   the Android SDK build tools, as Android Studio and Unity's Android support bring them): javac, d8, aapt2 and
//   apksigner. Nothing is downloaded and nothing is uploaded. findTools() looks in the usual places; when something
//   is missing, plan() says what. The package itself is put together here (writeZip), then signed by apksigner with
//   a key that is made once and kept next to the save, so a later export installs over an earlier one.
//
// Rules for whoever changes this
//   - Tools are started with fixed arguments and no shell (execFile). Never build a command line from text that
//     came from a window, a file name the user typed, or the save.
//   - Only files listed by plan() are packed. Sprites and sounds are the user's own: they go into the user's own
//     export and nowhere else.
//
//   node tools/androidcheck.js     checks everything here that needs no Android tools (file choice, the package writer)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFile } = require('child_process');

const HOST = 'https://app.screentrainer.invalid';
const KEY = { file: 'android-export.keystore', alias: 'screentrainer', pass: 'screentrainer' };      // a personal signing key; it protects nothing but "updates come from the same computer"
const MIN_SDK = 24, TARGET_SDK = 34;
// program files that make up the game on the device (everything in src/ except Mewtwo's window, which stays on the PC)
const APP_FILES = ['android.html', 'defaults.js', 'overlay.css', 'panel.html', 'panel.css', 'icon.png', 'fonts/DotGothic16-Latin.ttf', 'fonts/Jersey20.ttf', 'fonts/OFL-DotGothic16.txt', 'fonts/OFL-Jersey20.txt'];
const SRC_SKIP = new Set(['guardian-ui.js']);
// settings that make no sense on a phone get one value in the copy the app starts from. (Until 0.5 the copy was
// frozen, "locked"; since 0.6 the app has the whole Options screen and these are only its starting values. Mewtwo
// comes along: on the phone it watches the battery and storage, see src/android.js.)
const LOCK_OVERRIDES = { field: false, autoStart: false, visible: true, display: 0, spritesPath: '', firstRun: false, boxOpen: false, optClosed: [], hotkey: '' };
const STORED = /\.(png|gif|jpg|ttf|stbank|arsc)$/i;          // already compact, or must not be compressed: stored as they are

let lastResult = null, dataCache = null;
const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const list = (p) => { try { return fs.readdirSync(p); } catch (e) { return []; } };
const size = (p) => { try { return fs.statSync(p).size; } catch (e) { return -1; } };

// ------------------------------------------------------------------ the Android tools on this computer
const EXE = process.platform === 'win32' ? '.exe' : '';
/** version folders such as 34.0.0 or android-34, newest first */
const newest = (names) => names.slice().sort((a, b) => {
  const pa = a.match(/\d+/g) || [], pb = b.match(/\d+/g) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (+pb[i] || 0) - (+pa[i] || 0); if (d) return d; }
  return a < b ? 1 : -1;
});
/** the folders a Java kit or an Android SDK is usually found in. env: the environment (for tests) */
function candidates(env) {
  const home = os.homedir(), pf = [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, 'C:\\Program Files'].filter(Boolean), local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const sdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, path.join(local, 'Android', 'Sdk'), path.join(home, 'Android', 'Sdk'), path.join(home, 'Library', 'Android', 'sdk')];
  const jdk = [env.JAVA_HOME, env.JDK_HOME];
  // Unity's Android support brings its own SDK and Java kit, one set per editor version
  const hubs = [];
  for (const p of pf) hubs.push(path.join(p, 'Unity', 'Hub', 'Editor'));
  try { const extra = JSON.parse(fs.readFileSync(path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'UnityHub', 'secondaryInstallPath.json'), 'utf8')); if (typeof extra === 'string' && extra) hubs.push(extra); } catch (e) { /* no second Unity folder */ }
  for (const hub of hubs) for (const ver of newest(list(hub))) {
    const base = path.join(hub, ver, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer');
    sdk.push(path.join(base, 'SDK')); jdk.push(path.join(base, 'OpenJDK'));
  }
  for (const p of pf) {
    jdk.push(path.join(p, 'Android', 'Android Studio', 'jbr'), path.join(p, 'Android', 'Android Studio', 'jre'));
    for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft', 'OpenJDK']) for (const v of newest(list(path.join(p, vendor)))) jdk.push(path.join(p, vendor, v));
  }
  for (const dir of (env.PATH || env.Path || '').split(path.delimiter)) if (dir && exists(path.join(dir, 'javac' + EXE))) jdk.push(path.dirname(dir));
  const uniq = (a) => [...new Set(a.filter((p) => typeof p === 'string' && p))];
  return { sdk: uniq(sdk), jdk: uniq(jdk) };
}
/** find javac, d8, aapt2, apksigner and a platform to compile against. Returns { ok, missing: [text...], ...paths } */
function findTools(env) {
  env = env || process.env;
  const c = candidates(env), t = { ok: false, missing: [], looked: c };
  for (const home of c.jdk) {
    const bin = path.join(home, 'bin');
    if (exists(path.join(bin, 'javac' + EXE)) && exists(path.join(bin, 'java' + EXE)) && exists(path.join(bin, 'keytool' + EXE))) { Object.assign(t, { jdk: home, java: path.join(bin, 'java' + EXE), javac: path.join(bin, 'javac' + EXE), keytool: path.join(bin, 'keytool' + EXE) }); break; }
  }
  for (const root of c.sdk) {
    if (!isDir(root)) continue;
    let bt = null, plat = null;
    for (const v of newest(list(path.join(root, 'build-tools')))) {
      const d = path.join(root, 'build-tools', v);
      if (exists(path.join(d, 'aapt2' + EXE)) && exists(path.join(d, 'lib', 'd8.jar')) && exists(path.join(d, 'lib', 'apksigner.jar'))) { bt = d; break; }
    }
    for (const v of newest(list(path.join(root, 'platforms')))) { const jar = path.join(root, 'platforms', v, 'android.jar'); if (exists(jar) && (+(v.match(/\d+/) || [0])[0] >= MIN_SDK)) { plat = jar; break; } }
    if (bt && plat) { Object.assign(t, { sdk: root, buildTools: bt, aapt2: path.join(bt, 'aapt2' + EXE), d8: path.join(bt, 'lib', 'd8.jar'), apksigner: path.join(bt, 'lib', 'apksigner.jar'), androidJar: plat }); break; }
  }
  if (!t.javac) t.missing.push('a Java development kit (javac). Android Studio and Unity\'s Android support both include one');
  if (!t.aapt2) t.missing.push('the Android SDK with its build tools and a platform (Android Studio installs it; so does "Android Build Support" in the Unity Hub)');
  t.ok = !t.missing.length;
  return t;
}
/** start a tool with fixed arguments (no shell). Resolves with { code, out } and never rejects */
function tool(file, args, opt) {
  return new Promise((resolve) => {
    execFile(file, args, Object.assign({ windowsHide: true, timeout: 240000, maxBuffer: 16 * 1024 * 1024 }, opt), (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: (String(stdout || '') + String(stderr || '')).trim(), failed: err ? String(err.message || err).slice(0, 400) : '' });
    });
  });
}

// ------------------------------------------------------------------ which files go in
/** the game data (species, generations, evolutions): src/data.js is a plain script, so it is run to read it */
function gameData(appDir) {
  const file = path.join(appDir, 'src', 'data.js'), stamp = size(file);
  if (dataCache && dataCache.stamp === stamp && dataCache.file === file) return dataCache.data;
  const box = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\n;this.__data = DATA;', box, { filename: 'data.js' });
  dataCache = { file, stamp, data: box.__data };
  return box.__data;
}
/** every species the app can show: the chosen generations, what the save holds, and everything those evolve into */
function speciesFor(D, settings, save) {
  const set = new Set(), gens = new Set(settings.gens || []);
  for (const id of Object.keys(D.dex)) if (gens.has(D.dex[id].g)) set.add(+id);
  if (save) for (const m of [...(save.team || []), ...(save.box || [])]) if (m && D.dex[m.sp]) set.add(+m.sp);
  const todo = [...set];
  while (todo.length) { const d = D.dex[todo.pop()]; for (const e of (d && d.ev) || []) if (D.dex[e.to] && !set.has(e.to)) { set.add(e.to); todo.push(e.to); } }
  return [...set].sort((a, b) => a - b);
}
// the same folders and the same order of preference as src/sprites.js
const BASES = { showdown: ['pokemon/other/showdown', 'gif'], bw: ['pokemon/versions/generation-v/black-white/animated', 'gif'], static: ['pokemon', 'png'] };
const ORDER = { showdown: ['showdown', 'bw', 'static'], bw: ['bw', 'showdown', 'static'], static: ['static', 'showdown', 'bw'] };
/** the picture files to pack, and the index of them the app's sprite lookup reads (the same shape spritescan.js makes) */
function chooseSprites(info, species, style) {
  const idx = {}, want = new Map(), have = {};
  for (const k in info.idx || {}) have[k] = new Set(info.idx[k]);
  const add = (dir, name, ext) => { const rel = `${dir}/${name}.${ext}`; if (!want.has(rel)) want.set(rel, path.join(info.root, ...rel.split('/'))); };
  const take = (dir, id, ext) => { if (!have[dir] || !have[dir].has(id)) return false; add(dir, id, ext); (idx[dir] = idx[dir] || new Set()).add(id); return true; };
  const order = ORDER[style] || ORDER.showdown;
  for (const sp of species) {
    for (const shiny of ['', '/shiny']) for (const fem of ['', '/female']) {
      for (const base of order) {                           // the first set that has this picture, as the game falls back
        const [dir, ext] = BASES[base];
        if (!take(dir + shiny + fem, sp, ext)) continue;
        take(dir + '/back' + shiny + fem, sp, ext);
        break;
      }
    }
    take('pokemon', sp, 'png'); take('pokemon/shiny', sp, 'png');         // stills, for notification cards and as the last fallback
  }
  const x = info.extra || {}, extra = { items: [], icons: null, types: null, badges: [], marks: null, ribbons: null };
  if (x.icons) { const ids = x.icons.ids.filter((id) => species.includes(id)); for (const id of ids) add(x.icons.dir, id, 'png'); extra.icons = { dir: x.icons.dir, ids }; }
  for (const n of x.items || []) { add('items', n, 'png'); extra.items.push(n); }
  if (x.types) { for (const id of x.types.ids) add(x.types.dir, id, 'png'); extra.types = x.types; }
  for (const n of x.badges || []) { add('badges', n, 'png'); extra.badges.push(n); }
  if (x.marks) { for (const n of x.marks.names) add(x.marks.dir, n, 'png'); extra.marks = x.marks; }
  if (x.ribbons) { for (const n of x.ribbons.names) add(x.ribbons.dir, n, 'png'); extra.ribbons = x.ribbons; }
  const index = { root: '', rootUrl: HOST + '/sprites', ok: true, idx: {}, items: {}, extra };
  for (const k in idx) index.idx[k] = [...idx[k]].sort((a, b) => a - b);
  for (const n of ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball']) index.items[n] = extra.items.includes(n);
  return { files: want, index };
}
/** the options as the app gets them */
function lockedSettings(settings) { return Object.assign({}, settings, LOCK_OVERRIDES); }

/** what an export would contain. ctx: { appDir, userDir, version, settings, spriteInfo, save, bank }. Never throws */
function plan(ctx) {
  const out = { ok: false, error: '', bytes: 0, sprites: 0, species: 0, gens: (ctx.settings.gens || []).slice(), bank: false, save: false, tools: null, entries: [] };
  try {
    const tools = findTools(ctx.env);
    out.tools = { ok: tools.ok, missing: tools.missing, jdk: tools.jdk || '', sdk: tools.sdk || '', buildTools: tools.buildTools ? path.basename(tools.buildTools) : '', platform: tools.androidJar ? path.basename(path.dirname(tools.androidJar)) : '' };
    const info = ctx.spriteInfo;
    if (!info || !info.ok || !info.root) { out.error = 'The sprites folder was not found. Choose it under Overlay first.'; return out; }
    const D = gameData(ctx.appDir), species = speciesFor(D, ctx.settings, ctx.save), pick = chooseSprites(info, species, ctx.settings.spriteStyle);
    const entries = [];
    for (const rel of APP_FILES) entries.push({ name: 'assets/app/' + rel, file: path.join(ctx.appDir, ...rel.split('/')) });
    for (const n of list(path.join(ctx.appDir, 'src')).sort()) if (n.endsWith('.js') && !SRC_SKIP.has(n)) entries.push({ name: 'assets/app/src/' + n, file: path.join(ctx.appDir, 'src', n) });
    const locked = { version: ctx.version, exported: new Date().toISOString(), gens: (ctx.settings.gens || []).slice(), settings: lockedSettings(ctx.settings), hasSave: !!ctx.save, hasBank: !!ctx.bank };
    entries.push({ name: 'assets/app/locked.json', data: Buffer.from(JSON.stringify(locked)) });
    entries.push({ name: 'assets/app/sprites.json', data: Buffer.from(JSON.stringify(pick.index)) });
    if (ctx.save) { entries.push({ name: 'assets/app/save.json', data: Buffer.from(JSON.stringify(ctx.save)) }); out.save = true; }
    if (ctx.bank && exists(ctx.bank)) { entries.push({ name: 'assets/app/sounds.stbank', file: ctx.bank }); out.bank = true; }
    for (const [rel, file] of pick.files) entries.push({ name: 'assets/sprites/' + rel, file, sprite: true });
    let bytes = 0, missing = 0;
    for (const e of entries) { e.bytes = e.data ? e.data.length : size(e.file); if (e.bytes < 0) { missing++; e.bytes = 0; e.gone = true; } bytes += e.bytes; }
    Object.assign(out, { entries: entries.filter((e) => !e.gone), bytes, sprites: pick.files.size, species: species.length, missingFiles: missing });
    if (missing && entries.some((e) => e.gone && !e.sprite)) { out.error = 'A program file is missing: ' + entries.find((e) => e.gone && !e.sprite).file; return out; }
    if (!tools.ok) { out.error = 'To build the app this computer needs ' + tools.missing.join(', and ') + '.'; return out; }
    out.ok = true;
  } catch (e) { out.error = 'The export could not be prepared: ' + String((e && e.message) || e); }
  return out;
}

// ------------------------------------------------------------------ the package (a zip file)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0; let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** read a small zip (the package aapt2 made): [{ name, method, crc, csize, usize, raw }], raw being the stored bytes as they are */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const n = buf.readUInt16LE(eocd + 10), out = [];
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('damaged zip directory');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    const data = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    out.push({ name, method, crc, csize, usize, raw: buf.subarray(data, data + csize) });
    p += 46 + nl + xl + cl;
  }
  return out;
}
/** write a zip. entries: [{ name, file | data | raw (+ method, crc, usize) }]. Stored entries start on a 4-byte boundary,
 *  as Android wants for resources.arsc and likes for everything it reads straight from the package. Returns { files, bytes } */
function writeZip(outFile, entries, onProgress) {
  const fd = fs.openSync(outFile, 'w'), central = [], seen = new Set();
  let offset = 0, done = 0;
  const put = (b) => { fs.writeSync(fd, b, 0, b.length); offset += b.length; };
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  try {
    for (const e of entries) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      let method, crc, usize, body;
      if (e.raw) { method = e.method; crc = e.crc; usize = e.usize; body = e.raw; }
      else {
        const plain = e.data || fs.readFileSync(e.file);
        crc = crc32(plain); usize = plain.length;
        if (STORED.test(e.name) || plain.length < 64) { method = 0; body = plain; }
        else { const packed = zlib.deflateRawSync(plain, { level: 9 }); if (packed.length < plain.length) { method = 8; body = packed; } else { method = 0; body = plain; } }
      }
      const name = Buffer.from(e.name, 'utf8'), flags = /[^\x20-\x7e]/.test(e.name) ? 0x0800 : 0;       // (bit 11: the name is UTF-8)
      // the "Android alignment" extra field (id 0xd935): pads the header so the data starts on a multiple of four
      let extra = Buffer.alloc(0);
      if (method === 0 && (offset + 30 + name.length) % 4) { const pad = (4 - ((offset + 30 + name.length + 6) % 4)) % 4; extra = Buffer.alloc(6 + pad); extra.writeUInt16LE(0xd935, 0); extra.writeUInt16LE(2 + pad, 2); extra.writeUInt16LE(4, 4); }
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12);
      h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(usize, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
      central.push({ name, flags, method, crc, csize: body.length, usize, offset });
      put(h); put(name); if (extra.length) put(extra); put(body);
      if (onProgress && ++done % 200 === 0) onProgress(done, entries.length);
    }
    const start = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(c.flags, 8); h.writeUInt16LE(c.method, 10); h.writeUInt16LE(dosTime, 12); h.writeUInt16LE(dosDate, 14);
      h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.offset, 42);
      put(h); put(c.name);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16);
    put(end);
    if (central.length > 65000 || offset > 0xfff00000) throw new Error('too many or too large files for one app');
  } finally { fs.closeSync(fd); }
  return { files: central.length, bytes: offset };
}

// ------------------------------------------------------------------ building
const hashOf = (files) => { const h = crypto.createHash('sha256'); for (const f of files) { h.update(path.basename(f)); h.update(fs.readFileSync(f)); } return h.digest('hex').slice(0, 16); };
const walk = (dir, ext) => { const out = []; for (const n of list(dir).sort()) { const p = path.join(dir, n); if (isDir(p)) out.push(...walk(p, ext)); else if (!ext || n.endsWith(ext)) out.push(p); } return out; };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* a temp folder left behind: harmless */ } };

/** compile the shell (android/ in the program folder) into a small package without assets. Kept between exports. */
async function buildShell(ctx, t, log) {
  const src = path.join(ctx.appDir, 'android'), java = walk(path.join(src, 'src'), '.java'), manifest = path.join(src, 'AndroidManifest.xml'), res = path.join(src, 'res');
  if (!java.length || !exists(manifest)) throw new Error('the android folder of the program is incomplete');
  const key = hashOf([...java, manifest, ...walk(res), __filename]) + '-' + path.basename(t.buildTools) + '-' + ctx.version;
  const cacheDir = path.join(ctx.userDir, 'android-shell'), cached = path.join(cacheDir, key + '.apk');
  if (exists(cached)) { log('shell: using the one built earlier (' + key + ')'); return fs.readFileSync(cached); }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'screentrainer-shell-'));
  try {
    const classes = path.join(work, 'classes'), dex = path.join(work, 'dex'), base = path.join(work, 'base.apk'), resZip = path.join(work, 'res.zip');
    fs.mkdirSync(classes); fs.mkdirSync(dex);
    const step = async (name, file, args) => {
      const r = await tool(file, args);
      log(`${name}: ${r.code === 0 ? 'ok' : 'FAILED (' + r.code + ')'}${r.out ? '\n' + r.out.split('\n').slice(0, 40).join('\n') : ''}${r.failed && r.code ? '\n' + r.failed : ''}`);
      if (r.code !== 0) throw new Error(`${name} failed: ${(r.out || r.failed).split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 500)}`);
    };
    await step('javac', t.javac, ['-encoding', 'UTF-8', '-nowarn', '-Xlint:-options', '-source', '8', '-target', '8', '-classpath', t.androidJar, '-d', classes, ...java]);
    await step('d8', t.java, ['-cp', t.d8, 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', t.androidJar, '--output', dex, ...walk(classes, '.class')]);
    await step('aapt2 compile', t.aapt2, ['compile', '--dir', res, '-o', resZip]);
    await step('aapt2 link', t.aapt2, ['link', '-o', base, '-I', t.androidJar, '--manifest', manifest, '--min-sdk-version', String(MIN_SDK), '--target-sdk-version', String(TARGET_SDK), resZip]);
    const parts = readZip(fs.readFileSync(base)).map((e) => ({ name: e.name, raw: Buffer.from(e.raw), method: e.method, crc: e.crc, usize: e.usize }));
    parts.push({ name: 'classes.dex', data: fs.readFileSync(path.join(dex, 'classes.dex')) });
    const shell = path.join(work, 'shell.apk');
    writeZip(shell, parts);
    const buf = fs.readFileSync(shell);
    try { fs.mkdirSync(cacheDir, { recursive: true }); for (const old of list(cacheDir)) fs.unlinkSync(path.join(cacheDir, old)); fs.writeFileSync(cached, buf); } catch (e) { /* not kept: it is simply built again next time */ }
    return buf;
  } finally { rmrf(work); }
}
/** the signing key: made once with the Java kit's keytool and kept next to the save */
async function signingKey(ctx, t, log) {
  const file = path.join(ctx.userDir, KEY.file);
  if (exists(file)) return file;
  const r = await tool(t.keytool, ['-genkeypair', '-keystore', file, '-storetype', 'PKCS12', '-storepass', KEY.pass, '-keypass', KEY.pass, '-alias', KEY.alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950', '-dname', 'CN=Screen Trainer personal export']);
  log('keytool: ' + (r.code === 0 ? 'made a signing key' : 'FAILED\n' + r.out));
  if (r.code !== 0 || !exists(file)) throw new Error('the signing key could not be made: ' + (r.out || r.failed).slice(0, 300));
  return file;
}

/** build the app and write it to outFile. Resolves with { ok, file, bytes, files, sprites, species, ms, verify, log } or { ok: false, error } */
async function run(ctx, outFile, onProgress) {
  const t0 = Date.now(), lines = [], log = (s) => lines.push(s), say = (text, share) => { try { if (onProgress) onProgress({ text, share }); } catch (e) { /* nobody listening */ } };
  const finish = (r) => {
    r.ms = Date.now() - t0; r.log = lines.join('\n');
    try { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(path.join(path.dirname(outFile), 'export-log.txt'), [`Screen Trainer ${ctx.version} Android export, ${new Date().toISOString()}`, r.ok ? `ok: ${r.file} (${r.bytes} bytes, ${r.files} files)` : 'FAILED: ' + r.error, '', ...lines].join('\r\n')); } catch (e) { /* no log then */ }
    lastResult = { ok: r.ok, file: r.file || outFile, at: Date.now(), error: r.error || '' };
    return r;
  };
  const p = plan(ctx);
  if (!p.ok) return finish({ ok: false, error: p.error, tools: p.tools });
  const t = findTools(ctx.env), tmp = outFile + '.unsigned', part = outFile + '.part';
  log(`tools: java kit ${t.jdk}; build tools ${t.buildTools}; platform ${t.androidJar}`);
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    say('Building the app shell…', 0.05);
    const shell = await buildShell(ctx, t, log);
    say('Packing the game and the pictures…', 0.2);
    const entries = readZip(shell).map((e) => ({ name: e.name, raw: Buffer.from(e.raw), method: e.method, crc: e.crc, usize: e.usize })).concat(p.entries);
    const z = writeZip(tmp, entries, (done, all) => say('Packing the game and the pictures…', 0.2 + 0.55 * (done / all)));
    log(`package: ${z.files} files, ${z.bytes} bytes before signing`);
    say('Signing…', 0.8);
    const ks = await signingKey(ctx, t, log);
    const sign = await tool(t.java, ['-jar', t.apksigner, 'sign', '--ks', ks, '--ks-pass', 'pass:' + KEY.pass, '--key-pass', 'pass:' + KEY.pass, '--ks-key-alias', KEY.alias, '--min-sdk-version', String(MIN_SDK), '--out', part, tmp]);
    log('apksigner sign: ' + (sign.code === 0 ? 'ok' : 'FAILED\n' + sign.out));
    if (sign.code !== 0) throw new Error('signing failed: ' + (sign.out || sign.failed).split('\n').slice(0, 3).join(' | ').slice(0, 500));
    const verify = await tool(t.java, ['-jar', t.apksigner, 'verify', '--verbose', '--min-sdk-version', String(MIN_SDK), part]);
    log('apksigner verify:\n' + verify.out);
    if (verify.code !== 0) throw new Error('the signed app did not pass its own check: ' + verify.out.split('\n').slice(0, 3).join(' | ').slice(0, 500));
    rmrf(outFile); fs.renameSync(part, outFile); rmrf(part + '.idsig'); rmrf(outFile + '.idsig');
    say('Done.', 1);
    return finish({ ok: true, file: outFile, bytes: size(outFile), files: z.files, sprites: p.sprites, species: p.species, save: p.save, bank: p.bank, verify: verify.out.split('\n').slice(0, 8).join('\n'), tools: p.tools });
  } catch (e) {
    return finish({ ok: false, error: String((e && e.message) || e), tools: p.tools });
  } finally { rmrf(tmp); rmrf(part); rmrf(part + '.idsig'); }
}

module.exports = { plan, run, last: () => lastResult, findTools, candidates, chooseSprites, speciesFor, lockedSettings, readZip, writeZip, gameData, HOST, MIN_SDK, TARGET_SDK };
