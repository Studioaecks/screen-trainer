// Screen Trainer — checks for 1.0: "caught and seen" off the Field Dex top, the sound sliders, the Escape Rope and its
// zip writer, mods, forks, the tray's saved games.
//
//   node tools/v100check.js
//
// Headless, under a minute. Everything that touches files does it in a pretend Screen Trainer folder in the temp folder.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`);
  return !!cond;
}
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

/** a small zip reader: names, and the content of one entry (stored or deflated), ZIP64 aware */
function unzip(file) {
  const b = fs.readFileSync(file);
  let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  let n = b.readUInt16LE(e + 10), at = b.readUInt32LE(e + 16);
  if (b.readUInt32LE(e - 20) === 0x07064b50) { const z = Number(b.readBigUInt64LE(e - 20 + 8)); n = Number(b.readBigUInt64LE(z + 32)); at = Number(b.readBigUInt64LE(z + 48)); }
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const m = b.readUInt16LE(at + 10), cs = b.readUInt32LE(at + 20), nl = b.readUInt16LE(at + 28), xl = b.readUInt16LE(at + 30), cl = b.readUInt16LE(at + 32), off = b.readUInt32LE(at + 42);
    const name = b.slice(at + 46, at + 46 + nl).toString('utf8');
    const lnl = b.readUInt16LE(off + 26), lxl = b.readUInt16LE(off + 28), data = b.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + cs);
    out.set(name, () => (m === 8 ? zlib.inflateRawSync(data) : data));
    at += 46 + nl + xl + cl;
  }
  return out;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st100-'));
  try {
    // ---- the version, the Field Dex top
    ok('version 1.0.0 or later', /^(1|[2-9])\./.test(JSON.parse(read('package.json')).version), JSON.parse(read('package.json')).version);
    const panel = read('src/panel.js');
    ok('"caught and seen" is no longer written at the top of the Field Dex', !/\$\('readout'\)\.textContent = `\$\{state\.dex\.caught\} caught/.test(panel) && /\$\('readout'\)\.textContent = '';/.test(panel));
    ok('the Trainer screen still says species caught and seen', /fig\(d\.caught, 'species caught'\)/.test(panel) && /fig\(d\.seen, 'species seen'\)/.test(panel));
    ok('the empty readout takes no room', /\.readout:empty \{ padding: 0;/.test(read('panel.css')));

    // ---- sound sliders
    const { sanitize, DEFAULTS } = require(path.join(APP, 'defaults.js'));
    const d = sanitize({}), x = sanitize({ masterVolume: 3, criesVolume: -1 });
    ok('master and cries volume: start as loud as before 1.0, kept in range', d.masterVolume === 1 && d.criesVolume === 0.8 && x.masterVolume === 1 && x.criesVolume === 0, { d: [d.masterVolume, d.criesVolume], x: [x.masterVolume, x.criesVolume] });
    ok('both have a slider in Options > Sound', /\['masterVolume', 'range'/.test(panel) && /\['criesVolume', 'range'/.test(panel));
    const sound = read('src/sound.js');
    ok('the overlay uses them (master gain, cries scaled from 0.8)', /set\.masterVolume/.test(sound) && /cv \/ 0\.8/.test(sound));
    const msLib = require(path.join(APP, 'mystream.js'));
    const ms0 = msLib.sanitize({ sources: [{ title: 'Task Bar Hero', vol: 140 }, { title: 'Mini Cozy Room' }], pcVol: 999, micVol: -5 });
    ok('MyStream: a game keeps its own volume (0 to 100, or untouched), the stream mix is kept in range', ms0.sources[0].vol === 100 && ms0.sources[1].vol === null && ms0.pcVol === 150 && ms0.micVol === 0, { v: ms0.sources.map((s) => s.vol), pc: ms0.pcVol, mic: ms0.micVol });
    const msjs = read('mystream.js'), booth = read('src/booth.js'), ps = read('ps/appvolume.ps1');
    ok('MyStream: the volume goes through one fixed script, with whole numbers only', /appvolume\.ps1/.test(msjs) && /Number\.isInteger\(vol\) && vol >= 0 && vol <= 100/.test(msjs) && /'ms:game-volume'/.test(msjs));
    ok('MyStream: each game row has a sound slider; the mix has two', /data-act="vol"/.test(booth) && /pcGain/.test(booth) && /micLevel\(\)/.test(booth) && /id="pcVol"/.test(read('mystream.html')) && /id="micVol"/.test(read('mystream.html')));
    ok('appvolume.ps1: plain ASCII, reads or sets only the one program\'s sessions, never the main volume or a device', /^[\x09\x0a\x0d\x20-\x7e]*$/.test(ps) && /SetMasterVolume/.test(ps) && !/IAudioEndpointVolume|SetMasterVolumeLevel|Remove-Item|Invoke-Expression|-Verb\s+RunAs/i.test(ps));

    // ---- the zip writer
    const zipper = require(path.join(APP, 'zipper.js'));
    const zsrc = path.join(tmp, 'zsrc');
    fs.mkdirSync(path.join(zsrc, 'a', 'empty'), { recursive: true });
    fs.writeFileSync(path.join(zsrc, 'a', 'text.txt'), 'hello '.repeat(5000));
    fs.writeFileSync(path.join(zsrc, 'pic.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    const zout = path.join(tmp, 'z.zip');
    const zr = await zipper.write(zout, zipper.collect(zsrc, 'Top').concat([{ name: 'Top/ünï.txt', data: Buffer.from('é') }]));
    const zz = zr.ok ? unzip(zout) : new Map();
    ok('zip writer: files, an empty folder and a non-ASCII name come out as they went in', zr.ok && zz.get('Top/a/text.txt')().toString() === 'hello '.repeat(5000) && zz.has('Top/a/empty/') && zz.get('Top/ünï.txt')().toString() === 'é' && zz.get('Top/pic.png')().length === 7, zr);
    ok('zip writer: no ".part" is left behind', !fs.existsSync(zout + '.part'));
    let n = 0;
    const zc = await zipper.write(path.join(tmp, 'c.zip'), zipper.collect(zsrc, 'Top'), { cancelled: () => ++n > 1 });
    ok('zip writer: stopping leaves neither a zip nor a ".part"', !zc.ok && zc.cancelled && !fs.existsSync(path.join(tmp, 'c.zip')) && !fs.existsSync(path.join(tmp, 'c.zip.part')), zc);

    // ---- the Escape Rope
    const rope = require(path.join(APP, 'escaperope.js'));
    const home = path.join(tmp, 'ScreenTrainer'), exe = path.join(home, 'Screen Trainer');
    const mk = (rel, text) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text || rel); };
    mk('Screen Trainer/ScreenTrainer.exe', 'MZ'); mk('Screen Trainer/resources/app/main.js', '// app');
    mk('sprites-master/sprites/pokemon/25.png', 'pika'); mk('sounds/firered.stbank', 'bank'); mk('my ROMs/firered.gba', 'rom');
    mk('backup-v0.9.9/app-0.9.9.zip', 'old'); mk('share/ScreenTrainer-0.9.0-empty.zip', 'share'); mk('selfcheck/latest.txt', 'check');
    mk('Screen Trainer Escape Rope 2026-01-01.zip', 'an older rope'); mk('half.zip.part', 'half');
    ok('the Escape Rope packs the folder that holds the program when it is ours', rope.home(exe) === home, rope.home(exe));
    const lone = path.join(tmp, 'Downloads', 'Screen Trainer'); fs.mkdirSync(lone, { recursive: true }); fs.writeFileSync(path.join(tmp, 'Downloads', 'tax return.pdf'), 'x');
    ok('...and only the program folder when it was unzipped into some other folder (never all of Downloads)', rope.home(lone) === lone, rope.home(lone));
    const p = rope.plan(home, {}), pl = rope.plan(home, { lean: true });
    const names = p.items.map((i) => i.name);
    ok('it takes sprites, sounds and ROMs put in the folder (not an empty copy)', ['ScreenTrainer/sprites-master/sprites/pokemon/25.png', 'ScreenTrainer/sounds/firered.stbank', 'ScreenTrainer/my ROMs/firered.gba', 'ScreenTrainer/Screen Trainer/ScreenTrainer.exe'].every((n2) => names.includes(n2)), names);
    ok('it never takes half-written files or an earlier Escape Rope zip', !names.some((n2) => /\.part$|Escape Rope 2026/.test(n2)));
    ok('"leave out" drops old backups, shared copies and self-checks, and says how much that is', pl.files === p.files - 3 && p.leanFiles === 3 && p.leanBytes > 0, { all: p.files, lean: pl.files });
    const stfiles = require(path.join(APP, 'stfiles.js'));
    const saveText = JSON.stringify({ v: 1, team: [], box: [], dex: { seen: {}, caught: {} }, stats: {} });
    const out = path.join(home, 'rope.zip');      // (written inside the folder on purpose: it must not pack itself)
    const rr = await rope.run({ root: home, outFile: out, lean: false, version: '1.0.0', saveBuf: stfiles.packSave(saveText, '1.0.0'), settingsText: '{"shinyOdds":50}' });
    const rz = rr.ok ? unzip(out) : new Map();
    ok('the zip holds the folder, the saved game and the settings, and not itself', rr.ok && rz.has('ScreenTrainer/sprites-master/sprites/pokemon/25.png') && rz.has('ScreenTrainer/Escape Rope - my game/my game.stsave') && rz.get('ScreenTrainer/Escape Rope - my game/settings.json')().toString() === '{"shinyOdds":50}' && rz.has('ScreenTrainer/Escape Rope - my game/READ ME.txt') && ![...rz.keys()].some((k) => /rope\.zip/.test(k)), rr);
    ok('the saved game in it reads back', rr.ok && stfiles.readSave(rz.get('ScreenTrainer/Escape Rope - my game/my game.stsave')()).ok);
    ok('nothing in the folder was changed', fs.readFileSync(path.join(home, 'sounds/firered.stbank'), 'utf8') === 'bank' && fs.existsSync(path.join(home, 'half.zip.part')));
    // unzipped elsewhere: the save is found next to the program
    const there = path.join(tmp, 'Laptop', 'ScreenTrainer'), there2 = path.join(there, 'Escape Rope - my game');
    fs.mkdirSync(path.join(there, 'Screen Trainer'), { recursive: true }); fs.mkdirSync(there2, { recursive: true }); fs.writeFileSync(path.join(there2, 'my game.stsave'), rz.get('ScreenTrainer/Escape Rope - my game/my game.stsave')());
    ok('on the other computer the program finds the save it brought along', rope.findSave(path.join(there, 'Screen Trainer')) === path.join(there2, 'my game.stsave'));
    const main = read('main.js');
    ok('main.js: the Escape Rope asks where, says what it packs, then closes and packs', /showSaveDialog\(\{ title: 'Escape Rope/.test(main) && /'Pack and close'/.test(main) && /escaperope\.run\(/.test(main) && /quitting = true;/.test(main));
    ok('main.js: a computer without a save is offered the one the rope brought', /escaperope\.findSave\(/.test(main) && /offerSave\(ropeSave\)/.test(main));

    // ---- mods
    const mods = require(path.join(APP, 'mods.js'));
    const deps = { DEFAULTS, sanitize };
    const good = mods.validate({ format: mods.FORMAT_ID, id: 'shiny-hunt', name: 'Shiny hunt', version: '1.0', settings: { shinyOdds: 20, spawnEvery: 12 }, spawns: { 133: 5, 'type:dragon': 2 }, theme: { name: 'Ember', colors: { shell: '#a8322d', tint: '40, 10, 10' } } }, deps);
    ok('mods: a proper mod is accepted', good.ok && good.mod.settings.shinyOdds === 20 && good.mod.spawns['133'] === 5 && good.mod.theme.colors.shell === '#a8322d', good.errors);
    const bad = [
      [{ format: mods.FORMAT_ID, id: 'x1', name: 'n', settings: { autoStart: true } }, 'settings.autoStart'],
      [{ format: mods.FORMAT_ID, id: 'x2', name: 'n', settings: { spritesPath: 'C:\\' } }, 'settings.spritesPath'],
      [{ format: mods.FORMAT_ID, id: 'x3', name: 'n', settings: { shinyOdds: 'lots' } }, 'settings.shinyOdds'],
      [{ format: mods.FORMAT_ID, id: 'x4', name: 'n', settings: { maxWild: 99 } }, 'settings.maxWild'],
      [{ format: mods.FORMAT_ID, id: 'x5', name: 'n', settings: { madeUp: 1 } }, 'settings.madeUp'],
      [{ format: mods.FORMAT_ID, id: 'x6', name: 'n', spawns: { 2000: 2 } }, 'spawns.2000'],
      [{ format: mods.FORMAT_ID, id: 'x7', name: 'n', spawns: { 25: 50 } }, 'spawns.25'],
      [{ format: mods.FORMAT_ID, id: 'x8', name: 'n', theme: { colors: { shell: 'red;} body{display:none' } } }, 'theme.colors.shell'],
      [{ format: mods.FORMAT_ID, id: 'x9', name: 'n', theme: { colors: { 'font-size': '#fff' } } }, 'theme.colors.font-size'],
      [{ format: mods.FORMAT_ID, id: 'x10', name: 'n', script: 'alert(1)', settings: { xpRate: 2 } }, 'script'],
      [{ format: 'other/9', id: 'x11', name: 'n', settings: { xpRate: 2 } }, 'format'],
      [{ format: mods.FORMAT_ID, id: 'Bad Id', name: 'n', settings: { xpRate: 2 } }, 'id'],
      [{ format: mods.FORMAT_ID, id: 'x13', name: 'n' }, 'changes nothing'],
    ];
    const missed = bad.filter(([m, where]) => { const v = mods.validate(m, deps); return v.ok || !v.errors.some((e) => e.includes(where)); }).map(([, w]) => w);
    ok('mods: every kind of mistake is refused, and says where (computer settings, ranges, types, code, CSS, unknown keys)', missed.length === 0, missed);
    // switching on and off, against pretend settings
    const mdir = path.join(home, 'mods'), udir = path.join(tmp, 'user');
    const put = (folder, obj) => { fs.mkdirSync(path.join(mdir, folder), { recursive: true }); fs.writeFileSync(path.join(mdir, folder, 'mod.json'), typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    put('shiny-hunt', { format: mods.FORMAT_ID, id: 'shiny-hunt', name: 'Shiny hunt', settings: { shinyOdds: 20, spawnEvery: 12 }, spawns: { 133: 5 } });
    put('fast', { format: mods.FORMAT_ID, id: 'fast', name: 'Fast', settings: { spawnEvery: 5 }, spawns: { 133: 2, 'type:dragon': 3 }, theme: { colors: { lcd: '#f3e3c8' } } });
    put('broken', '{ "format": "screen-trainer-mod/1", "id": "broken", ');
    put('empty-folder-has-no-json', '{}'); fs.unlinkSync(path.join(mdir, 'empty-folder-has-no-json', 'mod.json'));
    let S = sanitize({ shinyOdds: 100, spawnEvery: 25 });
    const M = mods.create({ modsDir: () => mdir, userDir: () => udir, DEFAULTS, sanitize, getSettings: () => S, setSettings: (patch) => { S = sanitize(Object.assign({}, S, patch)); return S; } });
    M.init({});
    const v0 = M.view();
    ok('mods: the folder is read; broken ones are listed with what is wrong; all start off', v0.mods.length === 4 && v0.mods.filter((m) => m.ok).length === 2 && v0.mods.every((m) => !m.on) && v0.mods.find((m) => m.folder === 'broken').errors[0].includes('not valid JSON'), v0.mods.map((m) => [m.folder, m.ok, m.errors]));
    M.set('shiny-hunt', true);
    ok('mods: switched on, its settings are in use', S.shinyOdds === 20 && S.spawnEvery === 12, [S.shinyOdds, S.spawnEvery]);
    M.set('fast', true);
    const fx = M.effects();
    ok('mods: two on at once: the later one wins a setting, spawn multipliers multiply, colours come through', S.spawnEvery === 5 && fx.spawns['133'] === 10 && fx.spawns['type:dragon'] === 3 && fx.colors.lcd === '#f3e3c8', { spawnEvery: S.spawnEvery, fx });
    M.set('shiny-hunt', false);
    ok('mods: one switched off: its own changes go back, the other mod\'s stay', S.shinyOdds === 100 && S.spawnEvery === 5, [S.shinyOdds, S.spawnEvery]);
    M.allOff();
    ok('mods: all off: everything is as it was', S.shinyOdds === 100 && S.spawnEvery === 25 && !Object.keys(M.effects().spawns).length, [S.shinyOdds, S.spawnEvery]);
    M.set('fast', true); put('fast', '{ broken now');
    M.refresh();
    ok('mods: a mod that breaks while on is switched off and its changes go back', S.spawnEvery === 25 && M.count() === 0, [S.spawnEvery, M.count()]);
    M.set('shiny-hunt', true);
    const M2 = mods.create({ modsDir: () => mdir, userDir: () => udir, DEFAULTS, sanitize, getSettings: () => S, setSettings: (patch) => { S = sanitize(Object.assign({}, S, patch)); return S; } });
    M2.init({ allOff: true });
    ok('mods: starting with --no-mods switches every one off and puts the settings back', M2.count() === 0 && S.shinyOdds === 100, [M2.count(), S.shinyOdds]);
    ok('mods: the README for mod writers explains the format', /screen-trainer-mod\/1/.test(mods.readme()) && /spawns/.test(mods.readme()));
    // the game uses the spawn multipliers
    const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
    const env = await boot({ seed: 3, settings: { paused: true, legendEvents: 'off', trainerBattles: 'off', weatherFreq: 0, itemDrops: false, mute: true } });
    const sim = new Sim(env, 'v100'), G = sim.G;
    const w0 = G.spawnWeight(133, 0), w4 = G.spawnWeight(4, 0);
    G.modSpawn = { 133: 5, 'type:fire': 0 };
    ok('the game: a mod makes a species likelier, and a type never come', Math.abs(G.spawnWeight(133, 0) - w0 * 5) < 1e-9 && G.spawnWeight(4, 0) === 0 && w4 > 0, { eevee: [w0, G.spawnWeight(133, 0)], charmander: [w4, G.spawnWeight(4, 0)] });
    G.modSpawn = {};
    ok('the game: with no mod on nothing changes', G.spawnWeight(133, 0) === w0);
    ok('the overlay page takes the mods from the main process', /G\.modSpawn = \(init\.mods && init\.mods\.spawns\) \|\| \{\}/.test(read('src/overlay.js')) && /onMods/.test(read('preload.js')));
    ok('the Field Dex lists mods with their mistakes, and sets only the colours a mod names', /function fillMods/.test(panel) && /root\.setProperty\('--' \+ k, fx\.colors\[k\]\)/.test(panel));

    // ---- forks
    const forks = require(path.join(APP, 'forks.js'));
    const app = path.join(exe, 'resources', 'app'), user = path.join(tmp, 'appdata');
    fs.mkdirSync(path.join(app, 'src'), { recursive: true }); fs.writeFileSync(path.join(app, 'main.js'), '// main'); fs.writeFileSync(path.join(app, 'src', 'game.js'), '// game');
    fs.mkdirSync(user, { recursive: true }); fs.writeFileSync(path.join(user, 'save.json'), saveText); fs.writeFileSync(path.join(user, 'settings.json'), JSON.stringify({ autoStart: true, shinyOdds: 7 }));
    const fdir = path.join(home, 'forks');
    const f1 = forks.make({ forksDir: fdir, appDir: app, version: '1.0.0', userDir: user, withSave: true });
    ok('forks: a fork is a copy of the program with its own data, and its settings never start with Windows', f1.ok && fs.existsSync(path.join(f1.dir, 'app', 'src', 'game.js')) && fs.existsSync(path.join(f1.dir, 'data', 'save.json')) && JSON.parse(fs.readFileSync(path.join(f1.dir, 'data', 'settings.json'))).autoStart === false && JSON.parse(fs.readFileSync(path.join(f1.dir, 'data', 'settings.json'))).shinyOdds === 7, f1);
    ok('forks: the main program and its save are untouched', fs.readFileSync(path.join(app, 'main.js'), 'utf8') === '// main' && !fs.existsSync(path.join(app, 'fork.json')) && JSON.parse(fs.readFileSync(path.join(user, 'settings.json'))).autoStart === true);
    const f2 = forks.make({ forksDir: fdir, appDir: app, version: '1.0.0', userDir: user, withSave: false });
    ok('forks: a fresh fork starts empty, names do not clash', f2.ok && f2.name !== f1.name && !fs.existsSync(path.join(f2.dir, 'data', 'save.json')), [f1.name, f2.name]);
    ok('forks: a fork knows it is one; the main program knows it is not', forks.self(path.join(f1.dir, 'app')).name === f1.name && forks.self(app) === null);
    ok('forks: only a fork folder right under forks\\ is ever started', forks.startArg(['x', '--fork=' + f1.dir], fdir) === path.join(f1.dir, 'app') && forks.startArg(['x', '--fork=' + home], fdir) === null && forks.startArg(['x', '--fork=' + path.join(f1.dir, 'app')], fdir) === null && forks.startArg(['x', '--fork=' + path.join(fdir, '..', 'Screen Trainer')], fdir) === null);
    ok('forks: a fork cannot make forks of itself', !forks.make({ forksDir: fdir, appDir: path.join(f1.dir, 'app'), version: '1.0.0' }).ok);
    ok('forks: both are listed', forks.list(fdir).length === 2);
    const top = main.indexOf("const FORK = forks.self(__dirname);"), firstOther = main.indexOf("require('./spritescan')");
    ok('main.js: a fork is handed over before anything else starts; it uses its own data and self-check folders', top > 0 && top < firstOther && /app\.setPath\('userData', path\.join\(FORK\.dir, 'data'\)\)/.test(main) && /ST_SELFCHECK_DIR = path\.join\(FORK\.dir, 'selfcheck'\)/.test(main));
    ok('main.js: a fork never starts with Windows and never takes the hotkey', /if \(!app\.isPackaged \|\| FORK\) return;/.test(main) && /if \(settings\.hotkey && !FORK\)/.test(main));
    ok('main.js: throwing a fork away uses the Recycle Bin', /shell\.trashItem\(f\.dir\)/.test(main));

    // ---- the tray's saved games, the API
    ok('tray: Save game, Load a saved game and the Escape Rope', /label: 'Saved games'/.test(main) && /label: 'Save game…', click: \(\) => exportSave\(\)/.test(main) && /loadSaveFromTray\(\)/.test(main) && /label: 'Escape Rope/.test(main));
    ok('the API number went up (pages from 1.0 ask the main process for new things)', /const API = 12;/.test(main));
    ok('the empty copy still leaves sprites, sounds, ROMs, saves and forks out', ['sprites/x.png', 'sounds/a.stbank', 'r.gba', 'save.json', 'settings.json'].every((p2) => require(path.join(APP, 'shareexport.js')).NEVER.test(p2)));

    // ---- how-to videos: beside the program, listed only, opened only once the sprites folder is found
    {
      const howto = require(path.join(APP, 'howto.js')), h = path.join(tmp, 'howto-home'), c = path.join(h, 'howto', 'clips');
      fs.mkdirSync(path.join(c, 'rotom'), { recursive: true }); fs.mkdirSync(path.join(c, 'overlay'), { recursive: true });
      for (const n of ['rotom/07-rotom-10s.mp4', 'rotom/07-rotom-gif.gif', 'rotom/run.exe', 'overlay/01-overlay-30s.mp4']) fs.writeFileSync(path.join(c, n), 'x');
      const l = howto.list(h);
      ok('how-to: clips are listed in their number order with their titles', l.length === 2 && l[0].key === 'overlay' && l[1].title === "Rotom's big tidy-up", JSON.stringify(l));
      ok('how-to: only .mp4 and .gif are ever opened', howto.file(h, 'rotom', 's10') && !Object.values(l[1].files).some((n) => /\.exe$/.test(n)) && howto.file(h, '..', 's10') === null && howto.file(h, 'rotom', 's30') === null);
      ok('how-to: no folder, no videos (and no error)', howto.list(path.join(tmp, 'nowhere')).length === 0);
      ok('main.js: the videos stay locked until the sprites folder is found', /locked: !\(spriteInfo && spriteInfo\.ok\)/.test(main) && /st:howto-play[\s\S]{0,80}if \(!\(spriteInfo && spriteInfo\.ok\)\) return false;/.test(main));
      ok('the empty copy never takes the how-to videos along', require(path.join(APP, 'shareexport.js')).NEVER.test('howto/clips/x.mp4') || !fs.existsSync(path.join(APP, 'howto')));
    }
  } catch (e) {
    ok('no errors on the way', false, String((e && e.stack) || e));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the temp folder */ }
  }
  console.log(`\n=== 1.0 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
