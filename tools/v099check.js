// Screen Trainer — checks for 0.9.9 (the owner's "fixes and updates11-16" list, requested updates 20, 21 and 13:
// Rotom's big tidy-up, Mewtwo's AI watch and backups, groundwork for a server).
//
//   node tools/v099check.js
//
// Headless, a few seconds. Rotom and the backup really move and copy files, in a pretend home folder made in the
// system's temp folder and removed afterwards; nothing else on the computer is touched.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`);
  return !!cond;
}
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const exists = (f) => fs.existsSync(f);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-v099-'));
  const H = path.join(tmp, 'home'), P = (...a) => path.join(H, ...a);
  const put = (rel, size, when) => { const f = P(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'.repeat(size || 3)); if (when) { const t = new Date(when); fs.utimesSync(f, t, t); } return f; };
  try {
    // ---- a pretend home
    for (const d of ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'AppData', 'Desktop/ScreenTrainer/Screen Trainer']) fs.mkdirSync(P(d), { recursive: true });
    put('Downloads/holiday.jpg', 10, '2023-07-04T10:00:00'); put('Downloads/beach.PNG', 11, '2024-01-15T09:30:00'); put('Downloads/song.mp3', 5); put('Downloads/clip.mp4', 6);
    put('Downloads/report.pdf', 7); put('Downloads/sheet.xlsx', 8); put('Downloads/setup.zip', 9); put('Downloads/unknown.xyz', 4); put('Downloads/link.lnk', 2); put('Downloads/.hidden', 2);
    put('Desktop/photo.jpg', 12, '2022-03-03T12:00:00'); put('Desktop/notes.txt', 5); put('Desktop/ScreenTrainer/Screen Trainer/ScreenTrainer.exe', 5); put('Desktop/ScreenTrainer/readme.txt', 5);
    put('Pictures/already.jpg', 5, '2021-05-05T12:00:00'); put('Pictures/holiday.jpg', 99, '2020-01-01T12:00:00');      // (a second "holiday.jpg" will want the same place)
    put('Downloads/MyGame/game.exe', 5); put('Downloads/MyGame/data.pak', 5); put('Downloads/MyGame/shot.png', 5);
    put('Downloads/code/package.json', 5); put('Downloads/code/logo.png', 5);
    for (let i = 0; i < 10; i++) put(`Downloads/Trip 2019/img${i}.jpg`, 5, '2019-08-0' + (1 + (i % 8)) + 'T10:00:00');
    put('Downloads/stuff/a.jpg', 5, '2023-02-02T10:00:00'); put('Downloads/stuff/b.pdf', 5); put('Downloads/stuff/c.mp3', 5);
    put('Downloads/tax backup/2020.pdf', 5);
    put('Downloads/secret/keep.jpg', 5);
    const binned = [];
    const T = require(path.join(APP, 'tidy.js'));
    const protectedDirs = () => [{ dir: H, above: true, why: 'whole user folder' }, { dir: P('AppData'), deep: true, why: 'settings' }, { dir: P('Desktop/ScreenTrainer/Screen Trainer'), deep: true, why: 'Screen Trainer itself' }];
    T.init({ userDir: () => path.join(tmp, 'user'), protectedDirs, homes: () => ({ Desktop: P('Desktop'), Documents: P('Documents'), Downloads: P('Downloads'), Pictures: P('Pictures'), Videos: P('Videos'), Music: P('Music') }),
      trash: async (d) => { fs.rmSync(d, { recursive: true }); binned.push(d); return true; } });

    // ---- update 20: Rotom's big tidy-up
    ok('update 20: "the whole computer" is the personal folders; Windows, AppData, a whole drive and the user folder itself are refused', T.presets().length === 6 && T.presets().every((x) => x.ok) && !!T.refuseRoot(H) && !!T.refuseRoot(P('AppData')) && !!T.refuseRoot(path.parse(H).root) && !T.refuseRoot(P('Desktop')));
    const roots = [P('Desktop'), P('Downloads'), P('Pictures')];
    let r = T.propose({ roots, ignore: [P('Downloads/secret')], pictures: { how: 'gather', by: 'year' }, videos: 'gather', music: 'gather', documents: 'inplace', other: 'inplace', inside: true, bin: true });
    let pl = r.plan;
    const names = (list) => list.map((x) => path.basename(x.dir)).sort().join();
    ok('update 20: the plan is shown before anything moves', r.ok && pl.count > 0 && exists(P('Downloads/holiday.jpg')), pl.count);
    ok('update 20: a program, a game and a project are never offered to be taken apart, and it says why', pl.kept.some((k) => /MyGame$/.test(k.dir) && /program/.test(k.why)) && pl.kept.some((k) => /code$/.test(k.dir)) && pl.kept.some((k) => /ScreenTrainer$/.test(k.dir)), pl.kept.map((k) => path.basename(k.dir) + ': ' + k.why));
    ok('update 20: where Rotom is unsure it asks, and says why (an album; a name like "backup")', names(pl.unsure) === 'Trip 2019,tax backup' && pl.unsure.every((u) => u.why.length > 10), pl.unsure);
    ok('update 20: an ordinary folder can be ticked; the ignored folder is left alone', names(pl.candidates) === 'stuff' && pl.kept.some((k) => /secret$/.test(k.dir) && /leave it alone/.test(k.why)));
    ok('update 20: no folder is taken apart that was not ticked', !pl.sample.some((m) => /stuff|Trip 2019|tax backup|MyGame|secret/.test(m.from)));
    const to = (name) => (pl.sample.find((m) => path.basename(m.from) === name) || {}).to || '';
    ok('update 20: pictures are gathered by year, videos and music go home, documents and the rest are sorted where they are', to('holiday.jpg') === P('Pictures', '2023', 'holiday.jpg') && to('beach.PNG') === P('Pictures', '2024', 'beach.PNG') && to('photo.jpg') === P('Pictures', '2022', 'photo.jpg') && to('already.jpg') === P('Pictures', '2021', 'already.jpg') && to('clip.mp4') === P('Videos', 'clip.mp4') && to('song.mp3') === P('Music', 'song.mp3') && to('report.pdf') === P('Downloads', 'Documents', 'report.pdf') && to('sheet.xlsx') === P('Downloads', 'Spreadsheets', 'sheet.xlsx') && to('setup.zip') === P('Downloads', 'Archives', 'setup.zip'), pl.sample.slice(0, 4));
    ok('update 20: shortcuts, hidden files and kinds Rotom does not know stay put', !to('link.lnk') && !to('.hidden') && !to('unknown.xyz'));
    r = T.propose({ roots, ignore: [P('Downloads/secret')], pictures: { how: 'gather', by: 'year' }, videos: 'gather', music: 'gather', documents: 'inplace', other: 'inplace', inside: true, bin: true, dissolve: [P('Downloads/stuff'), P('Downloads/MyGame'), P('Downloads/secret')] });
    pl = r.plan;
    ok('update 20: a ticked folder is taken apart; ticking a program or an ignored folder changes nothing', pl.sample.some((m) => /stuff[\\/]a\.jpg$/.test(m.from)) && !pl.sample.some((m) => /MyGame|secret/.test(m.from)));
    const wrong = await T.apply('not-the-plan');
    ok('update 20: only the plan on the screen is carried out', !wrong.ok && exists(P('Downloads/holiday.jpg')));
    const seen = [];
    const done = await T.apply(pl.id, (p) => seen.push(p));
    ok('update 20: the files are moved as the plan said, and progress is told', done.ok && done.moved === pl.count && exists(P('Pictures/2023/holiday.jpg')) && exists(P('Videos/clip.mp4')) && exists(P('Music/song.mp3')) && exists(P('Music/c.mp3')) && exists(P('Downloads/Documents/b.pdf')) && seen.length >= 2 && seen[seen.length - 1].end, done.text);
    ok('update 20: nothing is overwritten: the second "holiday.jpg" kept its own place', exists(P('Pictures/2020/holiday.jpg')) && fs.statSync(P('Pictures/2020/holiday.jpg')).size === 99 && fs.statSync(P('Pictures/2023/holiday.jpg')).size === 10);
    ok('update 20: the emptied folder went to the Recycle Bin; the others are untouched', binned.length === 1 && /stuff$/.test(binned[0]) && exists(P('Downloads/MyGame/shot.png')) && exists(P('Downloads/Trip 2019/img0.jpg')) && exists(P('Downloads/secret/keep.jpg')) && exists(P('Desktop/ScreenTrainer/readme.txt')) && exists(P('Downloads/unknown.xyz')));
    const again = T.propose({ roots, pictures: { how: 'gather', by: 'year' }, videos: 'gather', music: 'gather', documents: 'inplace', other: 'inplace' });
    ok('update 20: doing it again finds nothing more to do', again.plan.count === 0, again.plan.sample);
    fs.writeFileSync(P('Music/song.mp3'), 'changed by the owner since');
    const un = T.undo();
    ok('update 20: Undo puts every file back where it was, and makes the binned folder again', un.ok && exists(P('Downloads/holiday.jpg')) && exists(P('Downloads/stuff/a.jpg')) && exists(P('Desktop/photo.jpg')) && exists(P('Pictures/holiday.jpg')) && exists(P('Pictures/already.jpg')) && !exists(P('Pictures/2023')) && !exists(P('Downloads/Documents')), un.text);
    ok('update 20: a file the owner changed since is left alone', exists(P('Music/song.mp3')) && !exists(P('Downloads/song.mp3')) && un.left.length === 1);
    r = T.propose({ roots: [P('Pictures')], pictures: { how: 'inplace', by: 'month', rename: true } });
    ok('update 20: pictures can be sorted by month and named by their date', r.plan.sample.some((m) => /home[\\/]Pictures[\\/]2021[\\/]2021-05[\\/]2021-05-05 12\.00\.00\.jpg$/.test(m.to)), r.plan.sample.slice(0, 2));
    const tsrc = read('tidy.js');
    ok('update 20: no file is opened, copied or deleted by Rotom (a move on one drive only); folders go to the Recycle Bin', !/readFileSync\((?!file\(\))|copyFile|unlinkSync|rmSync|createReadStream/.test(tsrc.replace(/fs\.readFileSync\(file\(\), 'utf8'\)/, '')) && /deps\.trash\(d\)/.test(tsrc) && /drive\(m\.dir\) !== drive\(m\.from\)/.test(tsrc));
    await sectionTwo(tmp, H, P, put);
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the temp folder is cleaned by the system */ } }
  console.log(`\n=== 0.9.9 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

async function sectionTwo(tmp) {
  // ---------------------------------------------------------------- Mewtwo's backups (on pretend folders)
  const B = require(path.join(APP, 'backup.js'));
  const user = path.join(tmp, 'user'), drive = path.join(tmp, 'usb'), docs = path.join(tmp, 'docs'), pics = path.join(tmp, 'pics');
  for (const d of [user, drive, docs, pics, path.join(user, 'Cache'), path.join(docs, 'sub')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(user, 'save.json'), '{"a":1}'); fs.writeFileSync(path.join(user, 'settings.json'), '{}'); fs.writeFileSync(path.join(user, 'Cache', 'big.bin'), 'cache');
  fs.writeFileSync(path.join(docs, 'a.txt'), 'alpha'); fs.writeFileSync(path.join(docs, 'sub', 'b.txt'), 'beta'); fs.writeFileSync(path.join(pics, 'p.jpg'), 'picture');
  fs.writeFileSync(path.join(drive, 'mine.txt'), 'the drive owner\'s own file');
  B.init({ userDir: () => user, homes: () => ({ Documents: docs, Pictures: pics }), saveFile: async () => Buffer.from('STSAVE1\nsealed'), say: () => {} });
  let s = B.status();
  ok('backup: nothing is chosen at first, weekly reminder on, by-itself off', !s.target && !s.items.length && s.weekly && !s.auto && s.profiles.length === 4, s);
  ok('backup: will not start without a place', (await B.start()).ok === false);
  ok('backup: refuses Screen Trainer\'s own folder as the place', !!B.refuseTarget(user) && B.setTarget(path.join(user, 'Cache')).ok === false);
  ok('backup: refuses a place that is not there', !!B.refuseTarget(path.join(tmp, 'nowhere')));
  ok('backup: takes the chosen drive', B.setTarget(drive).ok === true && B.status().where.startsWith(path.join(drive, 'Screen Trainer backup')));
  ok('backup: refuses a whole drive and the backup\'s own folder as a source', !!B.refuseSource(path.parse(tmp).root) && !!B.refuseSource(drive) && !!B.refuseSource(tmp));
  s = B.set({ profile: 'papers' });
  ok('backup: a profile chooses its folders (only those that exist)', s.items.length === 1 && s.items[0].dir === docs && s.trainer, s.items);
  ok('backup: any other folder can be added, once', B.addFolder(pics).ok && B.addFolder(pics).ok && B.status().items.length === 2);
  const m = await B.measure(docs);
  ok('backup: "how much?" counts a folder', m.files === 2 && m.bytes === 9, m);
  const seen = [], own = fs.readdirSync(user).filter((n) => n.endsWith('.json') && n !== 'backup.json').length;
  let r = await B.start((p) => seen.push(p));
  const root = B.status().where, at = (...a) => path.join(root, ...a), lab = B._test.labelOf;
  ok('backup: copies what was chosen', r.ok && r.copied === 3 + own && r.same === 0 && exists(at(lab(docs), 'a.txt')) && exists(at(lab(docs), 'sub', 'b.txt')) && exists(at(lab(pics), 'p.jpg')), r);
  ok('backup: Screen Trainer\'s data: its .json files and the sealed game, not the caches', exists(at('Screen Trainer', 'save.json')) && exists(at('Screen Trainer', 'my game.stsave')) && !exists(at('Screen Trainer', 'Cache')) && exists(at('READ ME.txt')));
  ok('backup: the copies are whole and nothing unfinished is left', fs.readFileSync(at(lab(docs), 'sub', 'b.txt'), 'utf8') === 'beta' && !fs.readdirSync(at(lab(docs))).some((n) => /\.stpart$/.test(n)));
  ok('backup: the drive\'s other files are untouched', fs.readFileSync(path.join(drive, 'mine.txt'), 'utf8') === 'the drive owner\'s own file' && fs.readdirSync(drive).length === 2);
  ok('backup: the sources are untouched', fs.readFileSync(path.join(docs, 'a.txt'), 'utf8') === 'alpha' && fs.readdirSync(docs).length === 2);
  r = await B.start();
  ok('backup: a second run copies nothing again', r.ok && r.copied === 0 && r.same === 3 + own, r);
  fs.writeFileSync(path.join(docs, 'a.txt'), 'alpha, changed'); fs.unlinkSync(path.join(pics, 'p.jpg')); fs.writeFileSync(path.join(docs, 'new.txt'), 'n');
  r = await B.start();
  ok('backup: only the changed and the new file are copied', r.copied === 2 && fs.readFileSync(at(lab(docs), 'a.txt'), 'utf8') === 'alpha, changed', r);
  ok('backup: a file removed from the computer stays in the backup', exists(at(lab(pics), 'p.jpg')));
  const now = Date.now();
  ok('backup: not due within a week', B.due(now + 3 * 86400000).due === false);
  const d1 = B.due(now + 8 * 86400000);
  ok('backup: due after a week, asks, does not start by itself', d1.due === true && d1.here === true && d1.auto === false && d1.days === 8, d1);
  ok('backup: asks at most once a day', B.due(now + 8 * 86400000 + 3600000).due === false && B.due(now + 9 * 86400000 + 60000).due === true);
  B.set({ auto: true });
  ok('backup: "by itself" only when the owner ticked it', B.due(now + 12 * 86400000).auto === true);
  B.set({ weekly: false });
  ok('backup: no reminder when switched off', B.due(now + 30 * 86400000).due === false);
  ok('backup: removing a folder takes it out', B.set({ remove: pics }).items.length === 1);
  B.init({ userDir: () => user });
  ok('backup: the choices are kept in backup.json', B.status().target === drive && B.status().items.length === 1 && B.status().last.copied === 2);

  // ---------------------------------------------------------------- Mewtwo's AI watch (Windows is a stand-in)
  const S = require(path.join(APP, 'sentinel.js'));
  const sdir = path.join(tmp, 'sentinel'); fs.mkdirSync(sdir);
  const exe = path.join(tmp, 'ollama.exe'); fs.writeFileSync(exe, 'x');
  const odd = 'C:\\Users\\Me\\My & Apps\\claude.exe';
  const said = [], logged = [], calls = [];
  let world = { running: [{ name: 'ollama', path: exe, id: 7 }, { name: 'notepad', path: 'C:\\Windows\\notepad.exe', id: 8 }, { name: 'ScreenTrainer', path: 'C:\\App\\ScreenTrainer.exe', id: 9 }],
    startup: [{ name: 'x', command: '"C:\\Program Files\\ChatGPT\\ChatGPT.exe" --hidden' }, { name: 'y', command: 'C:\\Tools\\backup.exe /s' }], listening: [{ port: 11434, id: 7, address: '127.0.0.1' }, { port: 8080, id: 8 }], blocked: [] };
  let answer = { ok: true };
  S._test.setRun(async (args) => { calls.push(args); return args.some((a) => /aiblock\.ps1$/.test(a)) ? JSON.stringify(answer) : 'noise\n' + JSON.stringify(world); });
  S.init({ userDir: () => sdir, selfExe: 'C:\\App\\ScreenTrainer.exe', say: (m) => said.push(m), log: (...a) => logged.push(a) });
  let sc = await S.scan();
  const names = sc.found.map((f) => f.name).join(',');
  ok('watch: only AI programs are kept (no other program\'s name)', sc.ok && names === 'ChatGPT,Ollama' && !JSON.stringify(sc).includes('notepad') && !JSON.stringify(sc).includes('backup.exe'), names);
  const ol = sc.found.find((f) => f.name === 'Ollama'), cg = sc.found.find((f) => f.name === 'ChatGPT');
  ok('watch: running, listening and starting with Windows are told apart', ol.running && ol.port === 11434 && !ol.startup && cg.startup && !cg.running, [ol, cg]);
  ok('watch: the first look announces nothing', said.length === 0 && !ol.isNew);
  ok('watch: what was seen is remembered', JSON.parse(fs.readFileSync(path.join(sdir, 'sentinel.json'), 'utf8')).seen.length === 2);
  world.running.push({ name: 'claude', path: odd, id: 11 });
  sc = await S.scan();
  ok('watch: a new AI program is announced, once', said.length === 1 && /Claude/.test(said[0].text) && sc.found.find((f) => f.name === 'Claude').isNew, said);
  await S.scan();
  ok('watch: and not again', said.length === 1);
  ok('watch: the scan only runs the reading script, never with -Command', calls.every((a) => a.includes('-File') && !a.includes('-Command') && !a.includes('-EncodedCommand')) && calls.every((a) => /aiwatch\.ps1$/.test(a[a.indexOf('-File') + 1])));
  calls.length = 0;
  let b = await S.block('c:\\nowhere\\grok.exe', true);
  ok('block: refuses a program the watch did not find', !b.ok && calls.length === 0);
  b = await S.block(odd.toLowerCase(), true);
  ok('block: refuses a path with unusual characters', !b.ok && calls.length === 0 && sc.found.find((f) => f.name === 'Claude').canBlock === false, b);
  b = await S.block(exe.toLowerCase(), true);
  const call = calls.find((a) => a.some((x) => /aiblock\.ps1$/.test(x)));
  ok('block: one fixed command line, the path as an argument', b.ok && call && call[call.indexOf('-Mode') + 1] === 'block' && call[call.indexOf('-Program') + 1] === exe && !call.includes('-Command'), call);
  ok('block: written to the log', logged.length === 1 && /Block Ollama/.test(logged[0][0]) && logged[0][1] === true);
  answer = { ok: false, error: 'not allowed', declined: true };
  b = await S.block(exe.toLowerCase(), false);
  ok('block: when Windows is not allowed to, it says nothing changed', !b.ok && /nothing changed/.test(b.text));
  world.blocked = [{ rule: 'Screen Trainer Mewtwo block - ollama.exe', program: exe, on: true }];
  sc = await S.scan(true);
  ok('watch: a blocked program is shown as blocked', sc.found.find((f) => f.name === 'Ollama').blocked === true);
  ok('watch: the path rule is the same in sentinel.js and aiblock.ps1', read('ps/aiblock.ps1').includes("'" + S.SAFE_PATH.source + "'"), S.SAFE_PATH.source);
  ok('watch: well-known AI programs are known, ordinary ones are not', ['ollama.exe', 'LM Studio.exe', 'Claude.exe', 'ChatGPT.exe', 'Cursor.exe', 'openclaw.exe'].every((n) => S.known('C:\\x\\' + n)) && ['chrome.exe', 'explorer.exe', 'janitor.exe', 'cursors.exe', 'steam.exe'].every((n) => !S.known('C:\\x\\' + n)));

  // ---------------------------------------------------------------- groundwork for a server (update 13)
  const O = require(path.join(APP, 'online.js'));
  const ice = O.cleanIce([{ urls: ['stun:stun.example.org:3478', 'http://evil.example', 'turn:turn.example.org:3478?transport=udp'], username: 'u', credential: 'c' }, { urls: 'turns:t.example.org:5349' }, { urls: ['javascript:alert(1)'] }, null, 'x']);
  ok('server: own STUN / TURN servers are taken, anything else is dropped', ice.length === 2 && ice[0].urls.length === 2 && ice[0].username === 'u' && ice[1].urls[0] === 'turns:t.example.org:5349', ice);
  ok('server: at most four, and none by default', O.cleanIce(Array(9).fill({ urls: 'stun:a.example.org' })).length === 4 && O.sanitize({}).ice.length === 0 && O.sanitize({}).boards.length === 0);
  ok('server: own meeting boards must be secure web sockets', O.sanitize({ boards: ['wss://my.example.org:8084/mqtt', 'ws://plain.example.org/mqtt', 'https://x.example'] }).boards.length === 1);
  ok('server: both ends of a visit use the owner\'s servers when given', /ice/.test(read('src/online-host.js')) && /ice/.test(read('src/visit.js')) && /cfg\.ice/.test(read('online.js')));
  ok('server: SERVER.md says how', exists(path.join(APP, 'SERVER.md')) && /boards/.test(read('SERVER.md')) && /ice/.test(read('SERVER.md')));

  // ---------------------------------------------------------------- the files and the wiring
  const main = read('main.js'), pre = read('preload.js'), gh = read('guardian.html'), oh = read('optimize.html');
  ok('wiring: main.js has every call the windows make', ['st:g-ai-scan', 'st:g-ai-block', 'st:g-bk-status', 'st:g-bk-set', 'st:g-bk-target', 'st:g-bk-add', 'st:g-bk-home', 'st:g-bk-measure', 'st:g-bk-start', 'st:g-bk-stop', 'st:g-bk-open', 'st:t-status', 'st:t-pick', 'st:t-propose', 'st:t-apply', 'st:t-undo'].every((c) => main.includes("'" + c + "'") && pre.includes("'" + c + "'")));
  ok('wiring: Mewtwo\'s window has the two tabs', /data-tab="guard"/.test(gh) && /data-tab="backup"/.test(gh) && /id="guardBody"/.test(gh) && /id="backupBody"/.test(gh) && /guardian-more\.js/.test(gh));
  ok('wiring: Rotom\'s window has the walkthrough', /id="big"/.test(oh) && /tidy-ui\.js/.test(oh));
  ok('wiring: the pages build no path of their own to delete or run', !/require\(|child_process|fs\./.test(read('src/guardian-more.js') + read('src/tidy-ui.js')));
  ok('wiring: the game knows the team goes to help Rotom, with a way back', /case 'tidy'/.test(read('src/game.js')) && /G\.tidying/.test(read('src/game.js')));
  ok('rules: guardian.js names the one exception to "no administrator rights"', /aiblock|sentinel/.test(read('guardian.js').slice(0, 4000)));
  const ver = JSON.parse(read('package.json')).version.split('.').map(Number);
  ok('version 0.9.9 or later', ver[0] > 0 || ver[1] > 9 || (ver[1] === 9 && ver[2] >= 9), ver.join('.'));
  ok('API is 11 or more', Number((/const API = (\d+)/.exec(main) || [])[1]) >= 11);
}
