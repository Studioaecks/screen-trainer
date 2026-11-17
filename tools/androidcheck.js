#!/usr/bin/env node
// Screen Trainer — checks for the Android export that need no Android tools and no phone.
//
//   node tools/androidcheck.js                         the checks (a few seconds)
//   node tools/androidcheck.js --sprites "<sprites>"   use this sprites folder for the file choice
//   node tools/androidcheck.js --stage <folder>        also lay out the files the app would contain, as a web site:
//                                                      serve that folder and open /app/android.html in any browser
//                                                      to see the Android page without a device
//   node tools/androidcheck.js --save save.json        put this save into the staged app
//
// What it checks: which files an export would pack and that every one exists; that the index the app's sprite
// lookup reads matches those files; that the options the app starts with switch off what a phone cannot do; that the package
// writer makes a zip other tools can read, with stored files on four-byte boundaries; where the Android tools are
// looked for; and, when a Java kit is on the PATH, that the shell's Java compiles against the stand-in classes in
// android/stubs. What it cannot check: the build itself (it needs the real Android SDK, see apkexport.js) and how
// the app behaves on a device.
// Exit code 1 when a check fails.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const APP = path.join(__dirname, '..');
const apk = require(path.join(APP, 'apkexport.js'));
const spritescan = require(path.join(APP, 'spritescan.js'));
const { DEFAULTS, sanitize } = require(path.join(APP, 'defaults.js'));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const results = [], check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail || '' }); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-androidcheck-'));
const EXE = process.platform === 'win32' ? '.exe' : '';
const touch = (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); };

// ---- a stand-in sprites folder when none is given: a few numbered files that only have to exist
function fakeSprites() {
  const root = path.join(tmp, 'sprites');
  for (const id of [1, 2, 3, 4, 5, 6, 25, 26, 133, 134, 135, 136, 196, 197, 470, 471, 700]) {
    touch(path.join(root, 'pokemon', id + '.png')); touch(path.join(root, 'pokemon', 'shiny', id + '.png'));
    if (id % 2) for (const d of ['', 'back', 'shiny', path.join('back', 'shiny')]) touch(path.join(root, 'pokemon', 'other', 'showdown', d, id + '.gif'));
  }
  touch(path.join(root, 'pokemon', 'other', 'showdown', 'female', '25.gif'));
  for (const n of ['poke-ball', 'great-ball', 'potion']) touch(path.join(root, 'items', n + '.png'));
  return root;
}
const spritesRoot = spritescan.normalize(opt('sprites', process.env.ST_SPRITES || '')) || fakeSprites();
const spriteInfo = spritescan.scan(spritesRoot);
const save = opt('save', '') ? JSON.parse(fs.readFileSync(opt('save', ''), 'utf8')) : { v: 1, team: [{ sp: 133, uid: 'a' }], box: [{ sp: 700, uid: 'b' }], dex: { caught: { 133: 1, 700: 1 }, seen: {} } };
const settings = sanitize(Object.assign({}, DEFAULTS, { gens: [1], scale: 0.5, guardian: true, field: true, autoStart: true, optClosed: ['sound'] }), 1080);

// ---- where the tools are looked for
{
  const sdk = path.join(tmp, 'Android', 'Sdk'), jdk = path.join(tmp, 'jdk-17');
  for (const v of ['30.0.3', '34.0.0']) { touch(path.join(sdk, 'build-tools', v, 'aapt2' + EXE)); touch(path.join(sdk, 'build-tools', v, 'lib', 'd8.jar')); touch(path.join(sdk, 'build-tools', v, 'lib', 'apksigner.jar')); }
  touch(path.join(sdk, 'build-tools', '35.0.0', 'aapt2' + EXE));                  // an incomplete newer one must be passed over
  for (const v of ['android-23', 'android-33', 'android-9']) touch(path.join(sdk, 'platforms', v, 'android.jar'));
  for (const n of ['java', 'javac', 'keytool']) touch(path.join(jdk, 'bin', n + EXE));
  const none = apk.findTools({ PATH: '', LOCALAPPDATA: path.join(tmp, 'nothing'), ProgramFiles: path.join(tmp, 'nothing'), APPDATA: path.join(tmp, 'nothing') });
  check('without Android tools the export says what is missing', !none.ok && none.missing.length === 2, none.missing.join(' | '));
  const env = { PATH: '', LOCALAPPDATA: tmp, JAVA_HOME: jdk, ProgramFiles: path.join(tmp, 'nothing'), APPDATA: path.join(tmp, 'nothing') };
  const found = apk.findTools(env);
  check('the tools are found in the usual places', found.ok && found.javac === path.join(jdk, 'bin', 'javac' + EXE) && found.sdk === sdk, JSON.stringify({ jdk: found.jdk, sdk: found.sdk }));
  check('the newest complete build tools and a recent enough platform are chosen', found.ok && path.basename(found.buildTools) === '34.0.0' && path.basename(path.dirname(found.androidJar)) === 'android-33', `${found.buildTools && path.basename(found.buildTools)}, ${found.androidJar && path.basename(path.dirname(found.androidJar))}`);
  // Unity's Android support: Editor/<version>/Editor/Data/PlaybackEngines/AndroidPlayer/{SDK,OpenJDK}
  const unity = path.join(tmp, 'pf', 'Unity', 'Hub', 'Editor', '6000.0.23f1', 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer');
  touch(path.join(unity, 'SDK', 'build-tools', '34.0.0', 'aapt2' + EXE)); touch(path.join(unity, 'SDK', 'build-tools', '34.0.0', 'lib', 'd8.jar')); touch(path.join(unity, 'SDK', 'build-tools', '34.0.0', 'lib', 'apksigner.jar'));
  touch(path.join(unity, 'SDK', 'platforms', 'android-34', 'android.jar'));
  for (const n of ['java', 'javac', 'keytool']) touch(path.join(unity, 'OpenJDK', 'bin', n + EXE));
  const u = apk.findTools({ PATH: '', LOCALAPPDATA: path.join(tmp, 'nothing'), ProgramFiles: path.join(tmp, 'pf'), APPDATA: path.join(tmp, 'nothing') });
  check('Unity\'s Android support is found too', u.ok && u.sdk === path.join(unity, 'SDK') && u.jdk === path.join(unity, 'OpenJDK'), JSON.stringify({ jdk: u.jdk, sdk: u.sdk }));

  // ---- what an export would pack
  const ctx = { appDir: APP, userDir: path.join(tmp, 'user'), version: 'check', settings, spriteInfo, save, bank: null, env };
  const p = apk.plan(ctx);
  check('an export can be planned', p.ok, p.error);
  const names = p.entries.map((e) => e.name);
  check('every planned file exists', p.entries.every((e) => e.data || fs.existsSync(e.file)) && !p.missingFiles, `${p.entries.length} files, ${p.missingFiles || 0} missing`);
  check('no file is planned twice', new Set(names).size === names.length);
  const need = ['android.html', 'overlay.css', 'panel.html', 'panel.css', 'src/android.js', 'src/overlay.js', 'src/game.js', 'src/field.js', 'src/panel.js', 'src/data.js', 'src/audio-worker.js', 'locked.json', 'sprites.json', 'save.json'];
  check('the game\'s own files are all in', need.every((n) => names.includes('assets/app/' + n)), need.filter((n) => !names.includes('assets/app/' + n)).join(', '));
  // every script and stylesheet the two pages name must be packed
  const refs = [];
  for (const page of ['android.html', 'panel.html']) for (const m of fs.readFileSync(path.join(APP, page), 'utf8').matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) refs.push(m[1]);
  check('every script and stylesheet the pages load is packed', refs.every((r) => names.includes('assets/app/' + r)), refs.filter((r) => !names.includes('assets/app/' + r)).join(', '));
  check('Mewtwo\'s window stays on the PC', !names.some((n) => /guardian/.test(n)), names.filter((n) => /guardian/.test(n)).join(', '));
  const locked = JSON.parse(p.entries.find((e) => e.name === 'assets/app/locked.json').data.toString());
  check('the app starts with the options as they were set', locked.settings.scale === 0.5 && JSON.stringify(locked.settings.gens) === '[1]' && locked.settings.maxLoiter === settings.maxLoiter, JSON.stringify({ scale: locked.settings.scale, gens: locked.settings.gens }));
  check('what a phone cannot do is switched off in the options the app starts with (Mewtwo comes along)', locked.settings.guardian === settings.guardian && JSON.stringify(locked.gens) === '[1]' && locked.settings.field === false && locked.settings.autoStart === false && locked.settings.spritesPath === '' && locked.settings.optClosed.length === 0);
  const index = JSON.parse(p.entries.find((e) => e.name === 'assets/app/sprites.json').data.toString()), packed = new Set(names);
  let listed = 0, absent = 0;
  for (const dir in index.idx) for (const id of index.idx[dir]) { listed++; if (!packed.has(`assets/sprites/${dir}/${id}.${dir === 'pokemon' || dir.startsWith('pokemon/shiny') || dir.startsWith('pokemon/back') || dir.startsWith('pokemon/female') ? 'png' : dir.startsWith('pokemon/other') || dir.includes('animated') ? 'gif' : 'png'}`)) absent++; }
  for (const n of index.extra.items) if (!packed.has(`assets/sprites/items/${n}.png`)) absent++;
  check('the sprite index lists exactly what is packed', listed > 0 && absent === 0 && index.rootUrl === apk.HOST + '/sprites', `${listed} pictures listed, ${absent} of them not packed`);
  const D = apk.gameData(APP), species = apk.speciesFor(D, settings, save);
  const inSave = [...(save.team || []), ...(save.box || [])].map((m) => m.sp).filter((sp) => D.dex[sp]), has = new Set(species);
  check('the save\'s Pokémon and every evolution come along', inSave.every((sp) => has.has(sp)) && species.every((sp) => (D.dex[sp].ev || []).every((e) => !D.dex[e.to] || has.has(e.to))) && has.has(1) && (opt('save', '') || (has.has(471) && !has.has(152))), `${species.length} species`);
  const noTools = apk.plan(Object.assign({}, ctx, { env: { PATH: '', LOCALAPPDATA: path.join(tmp, 'nothing'), ProgramFiles: path.join(tmp, 'nothing'), APPDATA: path.join(tmp, 'nothing') } }));
  check('without the tools the plan explains itself and still counts the files', !noTools.ok && /needs/.test(noTools.error) && noTools.sprites === p.sprites, noTools.error);

  // ---- the package writer
  const zipFile = path.join(tmp, 'check.apk'), big = Buffer.alloc(70000, 7), text = Buffer.from('x'.repeat(5000));
  const parts = [{ name: 'resources.arsc', data: Buffer.from('arsc-stand-in-' + 'r'.repeat(90)) }, { name: 'assets/app/a.js', data: text }, { name: 'assets/sprites/pokemon/1.png', data: big }, { name: 'assets/sprites/items/odd-length.png', data: Buffer.from('p'.repeat(77)) }, { name: 'assets/app/a.js', data: Buffer.from('twice') }];
  const z = apk.writeZip(zipFile, parts), buf = fs.readFileSync(zipFile), back = apk.readZip(buf);
  const body = (e) => (e.method === 8 ? zlib.inflateRawSync(e.raw) : Buffer.from(e.raw));
  check('the package writer and reader agree', z.files === 4 && back.length === 4 && back.every((e) => { const src = parts.find((q) => q.name === e.name); return src && body(e).equals(src.data); }), `${z.files} files, ${z.bytes} bytes`);
  check('pictures and resources are stored, scripts are compressed', back.find((e) => e.name.endsWith('1.png')).method === 0 && back.find((e) => e.name === 'resources.arsc').method === 0 && back.find((e) => e.name.endsWith('a.js')).method === 8);
  const odd = path.join(tmp, 'odd.zip'); apk.writeZip(odd, [{ name: 'assets/sprites/items/poké ball.png', data: Buffer.from('q'.repeat(70)) }]);
  check('a file name with an accent or a space survives', apk.readZip(fs.readFileSync(odd))[0].name === 'assets/sprites/items/poké ball.png');
  check('stored files start on a four-byte boundary', back.filter((e) => e.method === 0).every((e) => (e.raw.byteOffset - buf.byteOffset) % 4 === 0), back.filter((e) => e.method === 0).map((e) => (e.raw.byteOffset - buf.byteOffset) % 4).join(','));
  try { const out = execFileSync('unzip', ['-t', zipFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { LC_ALL: 'C.UTF-8' }) }); check('another zip tool accepts the package', /No errors detected/.test(out), out.trim().split('\n').pop()); }
  catch (e) { if (e.code === 'ENOENT') check('another zip tool accepts the package (skipped: no unzip here)', true); else check('another zip tool accepts the package', false, String(e.stdout || e.message).slice(-300)); }

  // ---- the shell's Java, against the stand-in classes
  const stubs = path.join(APP, 'android', 'stubs'), walk = (d) => fs.readdirSync(d).flatMap((n) => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk(f) : f.endsWith('.java') ? [f] : []; });
  try {
    const o1 = path.join(tmp, 'stubs'), o2 = path.join(tmp, 'classes'); fs.mkdirSync(o1); fs.mkdirSync(o2);
    const quiet = { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' }) };
    execFileSync('javac', ['-nowarn', '-Xlint:-options', '-source', '8', '-target', '8', '-d', o1, ...walk(stubs)], quiet);
    execFileSync('javac', ['-nowarn', '-Xlint:-options', '-source', '8', '-target', '8', '-encoding', 'UTF-8', '-classpath', o1, '-d', o2, ...walk(path.join(APP, 'android', 'src'))], quiet);
    const made = walk2(o2);
    check('the shell\'s Java compiles', made.includes('MainActivity.class') && made.includes('Dream.class') && made.includes('Host.class') && made.includes('Keep.class'), made.join(', '));
  } catch (e) {
    if (e.code === 'ENOENT') check('the shell\'s Java compiles (skipped: no Java kit on the PATH)', true);
    else check('the shell\'s Java compiles', false, String(e.stderr || e.message).split('\n').filter((l) => l && !/^Picked up/.test(l)).slice(0, 6).join(' | '));
  }
  function walk2(d) { return fs.readdirSync(d).flatMap((n) => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk2(f) : [n]; }); }
  const manifest = fs.readFileSync(path.join(APP, 'android', 'AndroidManifest.xml'), 'utf8');
  check('the manifest names the classes that exist', ['MainActivity', 'Dream'].every((c) => manifest.includes('app.screentrainer.' + c) && fs.existsSync(path.join(APP, 'android', 'src', 'app', 'screentrainer', c + '.java'))));
  check('the shell and the page agree on the address', fs.readFileSync(path.join(APP, 'android', 'src', 'app', 'screentrainer', 'Host.java'), 'utf8').includes(apk.HOST.replace('https://', '')));

  // ---- lay the app's files out as a web site
  const stage = opt('stage', '');
  if (stage) {
    let n = 0;
    for (const e of p.entries) { const to = path.join(stage, ...e.name.replace(/^assets\//, '').split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); if (e.data) fs.writeFileSync(to, e.data); else fs.copyFileSync(e.file, to); n++; }
    // served from another address than the app's own, the pictures are found next to the pages
    const idx = path.join(stage, 'app', 'sprites.json'), j = JSON.parse(fs.readFileSync(idx, 'utf8')); j.rootUrl = '../sprites'; fs.writeFileSync(idx, JSON.stringify(j));
    console.log(`staged ${n} files in ${stage}: serve that folder and open /app/android.html`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok    ' : 'FAILED'}  ${r.name}${r.detail && (!r.ok || args.includes('--verbose')) ? '   [' + r.detail + ']' : ''}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
