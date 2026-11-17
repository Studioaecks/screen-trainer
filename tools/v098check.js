// Screen Trainer — checks for 0.9.8 (the owner's "fixes and updates11-16" list, requested updates 19 and 17: saved games
// as small sealed files, Living Unown, the Unown Notepad and its .unown notes).
//
//   node tools/v098check.js
//
// Headless, a few seconds: the two file kinds (made, read, refused when changed, locked notes), a real-sized save from
// the pretend page, how Living Unown lays out and keeps its letters, and the windows' files.
'use strict';
const path = require('path');
const fs = require('fs');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'ok   ' : 'FAIL '} ${name}${detail !== undefined && detail !== '' ? '   [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : ''}`);
  return !!cond;
}
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

(async () => {
  const F = require(path.join(APP, 'stfiles.js'));
  // ---- update 19: saved games
  const { boot, Sim } = require(path.join(APP, 'tools', 'playtest.js'));
  const env = await boot({ seed: 3, settings: { paused: true, mute: true } });
  const sim = new Sim(env, 'v098'), G = sim.G, Mon = sim.Mon;
  for (let i = 0; i < 6; i++) G.save.team.push(Mon.create(1 + i * 3, 30 + i, {}));
  for (let i = 0; i < 120; i++) G.save.box.push(Mon.create(10 + i, 20 + (i % 50), { shiny: i % 40 === 0 }));
  for (let i = 1; i <= 300; i++) { G.save.dex.seen[i] = 1; if (i % 2) G.save.dex.caught[i] = 1; }
  G.save.stats.caught = 900; G.save.badges = { 1: Date.now(), 2: Date.now() };
  const text = JSON.stringify(G.save), file = F.packSave(text, '0.9.8');
  ok('update 19: a full save (6 on the team, 120 in the Box, 300 seen) is a small file: kilobytes, not megabytes', file.length < 40000, `${Math.round(text.length / 1024)} KB of save -> ${Math.round(file.length / 1024)} KB of file`);
  const r = F.readSave(file);
  ok('update 19: it reads back exactly', r.ok && JSON.stringify(r.save) === text && r.app === '0.9.8');
  ok('update 19: what the owner is shown before loading', r.summary.team === 6 && r.summary.box === 120 && r.summary.species === 150 && r.summary.badges === 2 && !!r.summary.lead, r.summary);
  ok('update 19: no other program can read it (the save is not in it as text)', !file.includes(Buffer.from('"team"')) && !file.includes(Buffer.from('dex')) && file.toString('latin1', 0, 8) === 'STSAVE1\n');
  const bad = Buffer.from(file); bad[bad.length - 9] ^= 4;
  ok('update 19: a file with one changed byte is refused', !F.readSave(bad).ok && F.readSave(bad).why === 'broken');
  ok('update 19: other files are refused', F.readSave(Buffer.from('hello')).why === 'not' && F.readSave(F.packNote('hi')).why === 'not');
  let threw = false; try { F.packSave('{"not":"a save"}'); } catch (e) { threw = true; }
  ok('update 19: only a save can become a saved game', threw);
  const main = read('main.js'), panel = read('src/panel.js'), pre = read('preload.js');
  ok('update 19: Save game and Load a saved game in Options > Save data; offered after a reset and on the Help screen', /id="saveExport"/.test(panel) && /id="savePick"/.test(panel) && /id="savePickAgain"/.test(panel) && /id="helpLoad"/.test(read('panel.html')));
  ok('update 19: loading keeps the game in use as a backup, and the page may not save over the loaded game meanwhile', /'before-load-'/.test(main) && /if \(!loadingSave && g && e\.sender === g\.webContents/.test(main) && /if \(loadingSave && game\(\) && e\.sender === game\(\)\.webContents\) loadingSave = false;/.test(main));
  ok('update 19: the page never names a file: the main process asks the owner', /ipcMain\.handle\('st:save-pick', async \(\) =>/.test(main) && /saveLoad: \(\) => ipcRenderer\.invoke\('st:save-load'\)/.test(pre));

  // ---- update 17: notes
  const n0 = F.packNote('Hello there, Unown!', '0.9.8'), n1 = F.packNote('A secret.', '0.9.8', 'pidgey');
  ok('update 17: a note reads back in the notepad', F.readNote(n0).ok && F.readNote(n0).text === 'Hello there, Unown!');
  ok('update 17: a note is not readable as text', !n0.includes(Buffer.from('Hello')) && n0.toString('latin1', 0, 8) === 'UNOWN01\n');
  ok('update 17: a note locked with a word cannot be read without it, nor with the wrong one', F.readNote(n1).why === 'word' && F.readNote(n1, 'rattata').why === 'word' && F.readNote(n1, 'pidgey').text === 'A secret.');
  ok('update 17: Windows hands a file over as an argument: it is found (and switches are not files)', F.fileArg(['ScreenTrainer.exe', '--hidden', 'C:\\Notes\\Hi.UNOWN']) === 'C:\\Notes\\Hi.UNOWN' && F.fileArg(['x', '--selfcheck']) === '' && F.fileArg(['x', 'C:\\a\\game.stsave']) === 'C:\\a\\game.stsave');
  ok('update 17: opening a .unown starts only the notepad, not the game; it quits when the note closes', /if \(f && \/\\\.unown\$\/i\.test\(f\)\) \{ notepadOnly = true;/.test(main) && /if \(notepadOnly && !gameStarted && !notes\.size\) app\.quit\(\);/.test(main) && /if \(!gameStarted\) startGame\(\);/.test(main));
  ok('update 17: only a notepad window may ask for notes, and it never hands over a path', /const st = noteOf\(e\);\s*if \(!st/.test(main) && !/o\.file/.test(main.slice(main.indexOf("ipcMain.handle('np:save'"), main.indexOf("ipcMain.on('np:dirty'"))));

  // ---- Living Unown
  const U = require(path.join(APP, 'src', 'unown.js'));
  const L = U.layout(Array.from('Hi there. How are you?\n\nNew page! 😀\tok'), 4), letters = L.filter((x) => !/\s/.test(x.ch));
  ok('update 17: the letters of a sentence stay together, sentences of a paragraph, paragraphs of a page', letters.find((x) => x.ch === 'H').sent === letters.find((x) => x.ch === '.').sent && letters.find((x) => x.ch === 'y').sent !== letters[0].sent && letters.find((x) => x.ch === 'y').para === 0 && letters.find((x) => x.ch === 'N').para === 1);
  ok('update 17: a letter stands where it was typed (rows, columns, tabs)', L[0].row === 0 && L[0].col === 0 && letters.find((x) => x.ch === 'N').row === 2 && L.find((x) => x.ch === 'o' && x.row === 2).col === 12, L.find((x) => x.ch === 'o' && x.row === 2));
  const d = U.diff(Array.from('hello world'), Array.from('hello brave world'));
  ok('update 17: typing in the middle: the letters before and after stay, only the new ones hop in', d.p === 6 && d.s === 5);
  ok('update 17: A to Z, ! and ? are the owner\'s Unown; small letters, signs and emoji are new Unown', U.LOOK('A') === '' && U.LOOK('Q') === 'q' && U.LOOK('!') === 'exclamation' && U.LOOK('?') === 'question' && U.LOOK('q') === null && U.LOOK('.') === null && U.isEmoji('🐟') && !U.isEmoji('a'));
  global.Sprites = { ready: () => true, still: (sp, sh, look) => (look === 'b' ? 'file:///s/201-b.png' : 'file:///s/201.png') };
  ok('update 17: a look the sprite folder lacks is drawn instead of showing the wrong letter', U.spriteFor('B') === 'file:///s/201-b.png' && U.spriteFor('C') === null && U.spriteFor('A') === 'file:///s/201.png');
  delete global.Sprites;
  const usrc = read('src/unown.js');
  ok('update 17: they hop in, loiter, follow the mouse (being read), look about and blink (bored)', /const HOP = 0\.32/.test(usrc) && /it knows it is being read/.test(usrc) && /bored: it looks about/.test(usrc) && /a blink/.test(usrc) && /bored: a small hop now and then/.test(usrc));
  ok('update 17: no Pokémon picture is part of the program: Unown come from the owner\'s folder or are drawn', !/data:image\/png/.test(usrc) && /Sprites\.still\(201, false, look\)/.test(usrc));
  const html = read('notepad.html'), nj = read('src/notepad.js');
  ok('update 17: the notepad: File (New, Open, Save, Save as, Lock with a word), Edit, View (Read plainly)', ['new', 'open', 'save', 'saveAs', 'lock', 'undo', 'cut', 'copy', 'paste', 'all', 'plain'].every((k) => html.includes(`data-do="${k}"`)) && /Unown\.living\(cv/.test(nj));
  ok('update 17: the Field Dex opens it ("notes" at the top)', /id="noteKey"/.test(read('panel.html')) && /st\.openNotepad\(\)/.test(panel));
  ok('the Field Dex title is written in Living Unown and plain under the mouse', /function brandUnown\(\)/.test(panel) && /\.brand\.unown:hover canvas\.ul \{ visibility: hidden; \}/.test(read('panel.css')) && /<script src="src\/unown\.js"><\/script>/.test(read('panel.html')));
  ok('the window API went up', Number((/const API = ([0-9]+);/.exec(main) || [])[1]) >= 10);
  ok('version 0.9.8 or later', /^0\.9\.(8|9)|^[1-9]/.test(JSON.parse(read('package.json')).version));
  console.log(`\n=== 0.9.8 check: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
