// Screen Trainer — checks for 0.9.4 (the owner's "fixes and updates11-16" list, fixes 1 and 2: the pointers in MyStream).
//
//   node tools/v094check.js
//
// Headless, under a second: where the owner's pointer goes on the stage (mystream.js, pointerFrame), what is saved
// (sanitize), how the stage paints Windows' pointer out of a game's picture (src/stage.js, frameOf, run against a
// pretend canvas), and that the pieces are wired together.
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
const MS = require(path.join(APP, 'mystream.js'));

// ---- what is saved
{
  const c = MS.sanitize({ sources: [{ title: 'Task Bar Hero' }, { title: 'Mini Cozy Room', mouse: 'show' }, { title: 'Other', mouse: 'banana' }] });
  ok('fix 1: a game\'s mouse is hidden unless the owner shows it', c.sources[0].mouse === 'hide' && c.sources[1].mouse === 'show' && c.sources[2].mouse === 'hide', c.sources.map((s) => s.mouse));
  ok('fix 2: the pointer settings start as: shown, 150 %, with the edge arrow', JSON.stringify(c.pointer) === JSON.stringify({ show: true, size: 1.5, edge: true }), c.pointer);
  const d = MS.sanitize({ pointer: { show: false, size: 9, edge: false, extra: 1 } });
  ok('fix 2: pointer settings are kept and held in range', d.pointer.show === false && d.pointer.size === 3 && d.pointer.edge === false && !('extra' in d.pointer), d.pointer);
  ok('fix 2: the size goes in quarter steps', MS.sanitize({ pointer: { size: 1.33 } }).pointer.size === 1.25);
}

// ---- where the owner's pointer goes (all in screen pixels; the main display 1920 x 1080 at 100 %)
{
  const P = { x: 0, y: 0, width: 1920, height: 1080 }, SW = MS.STAGE.w, SH = MS.STAGE.h;
  const cur = (x, y, shown) => ({ dip: { x, y }, phys: { x, y }, shape: [0, 0, 32, 32, shown === undefined ? 1 : shown] });
  const full = { a: [0, 0, 1920, 1080] }, fullTile = { a: { x: 0, y: 0, w: 1, ar: 16 / 9, live: true } };
  let f = MS.pointerFrame(cur(960, 540), full, fullTile, P, { over: false, play: null });
  ok('fix 2: over a full-screen game the pointer is at the same place on the stage', f.host.at === 'stage' && Math.abs(f.host.x - SW / 2) <= 1 && Math.abs(f.host.y - SH / 2) <= 1 && f.host.via === 'a', f.host);
  const b = f.tiles.a;
  ok('fix 1: the part of the game\'s picture under Windows\' pointer is known (with a margin)', !!b && b[0] < 0.5 && b[1] < 0.5 && b[2] > 0.5 + 32 / 1920 && b[3] > 0.5 + 32 / 1080, b);
  ok("fix 1: the stage is told which games' windows are found", JSON.stringify(f.known) === '["a"]');
  f = MS.pointerFrame(cur(1950, 150), { s: [100, 100, 500, 400], b: [2000, 0, 2400, 300] }, {}, P, { over: false, play: null });
  ok('fix 1: a pointer just about to come into a game counts already; one far away does not', !!f.tiles.b && !f.tiles.s, Object.keys(f.tiles));
  f = MS.pointerFrame(cur(960, 540, 0), full, fullTile, P, { over: false, play: null });
  ok('fix 1: a pointer Windows has hidden is not painted out (there is nothing to paint out)', !f.tiles.a);
  // a small game moved elsewhere on the stage by the owner
  const wins = { a: [0, 0, 1920, 1080], s: [100, 100, 500, 400] }, tiles = { a: fullTile.a, s: { x: 0.6, y: 0.5, w: 0.3, ar: 4 / 3, live: true } };
  f = MS.pointerFrame(cur(300, 250), wins, tiles, P, { over: false, play: null });
  const tx = (0.6 + 0.5 * 0.3) * SW, ty = 0.5 * SH + (0.5 * 0.3 * SW) / (4 / 3);
  ok('fix 2: over a small game the pointer follows that game on the stage, wherever it was put', f.host.at === 'stage' && Math.abs(f.host.x - tx) <= 1 && Math.abs(f.host.y - ty) <= 1 && f.host.via === 's', [f.host, Math.round(tx), Math.round(ty)]);
  ok('fix 1: both games get their part painted out', !!f.tiles.a && !!f.tiles.s);
  f = MS.pointerFrame(cur(1500, 900), {}, {}, P, { over: false, play: null });
  ok('fix 2: with no game under it, the stage stands for the main display', f.host.at === 'stage' && Math.abs(f.host.x - 1500 * SW / 1920) <= 1 && Math.abs(f.host.y - 900 * SW / 1920) <= 1, f.host);
  f = MS.pointerFrame(cur(2600, 500), {}, {}, P, { over: false, play: null });
  ok('fix 2: on a second screen to the right: an arrow on the right rim, pointing right', f.host.at === 'edge' && f.host.x > SW - 40 && f.host.x <= SW && Math.abs(f.host.a) <= 20, f.host);
  f = MS.pointerFrame(cur(-800, -900), {}, {}, P, { over: false, play: null });
  ok('fix 2: up and to the left: the arrow is on the rim and points up and left', f.host.at === 'edge' && f.host.a < -90 && f.host.a > -180 && f.host.x >= 0 && f.host.y >= 0 && f.host.y < 40, f.host);
  f = MS.pointerFrame(cur(960, 540), full, fullTile, P, { over: true, play: null });
  ok('fix 2: on the booth window (the studio) viewers see no pointer', f.host.at === 'off');
  f = MS.pointerFrame(cur(960, 540), full, fullTile, P, { over: true, play: { x: 100, y: 200 } });
  ok('fix 2: playing on the booth\'s picture: the pointer is where it is on that picture', f.host.at === 'stage' && f.host.x === 100 && f.host.y === 200 && !f.host.via, f.host);
  f = MS.pointerFrame(cur(960, 540), full, { a: Object.assign({}, fullTile.a, { live: false }) }, P, { over: false, play: null });
  ok('fix 2: a game that shows no picture yet is not used to place the pointer', f.host.at === 'stage' && !f.host.via);
  f = MS.pointerFrame({ dip: { x: 640, y: 360 }, phys: { x: 960, y: 540 }, shape: [0, 0, 48, 48, 1] }, full, fullTile, P, { over: false, play: null });
  ok('fix 2: a screen scaled to 150 %: screen pixels for the games, Electron\'s points for the display', f.host.at === 'stage' && Math.abs(f.host.x - SW / 2) <= 1, f.host);
}

// ---- the stage paints Windows' pointer over (src/stage.js frameOf, against a pretend canvas)
{
  const src = read('src/stage.js'), i = src.indexOf('  function frameOf('), j = src.indexOf('\n  function makeTile(', i);
  ok('fix 1: the stage has frameOf', i > 0 && j > i);
  const draws = [];
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...a) => draws.push(a) }) }) };
  const make = new Function('document', 'ptrRef', 'CLEAN_EVERY', `let ptr = ptrRef; ${src.slice(i, j)}; return { frameOf, setPtr: (p) => { ptr = p; } };`);
  const S = make(document, { tiles: {}, known: [] }, 3), video = { v: 1 }, t = { id: 'a', s: { mouse: 'hide' }, frames: 0 };
  let out = S.frameOf(t, video, 1000, 500);
  ok("fix 1: while the game's window is not found yet, no copy is made (it could hold the pointer)", out === video && draws.length === 0 && !t.ccFull);
  S.setPtr({ tiles: { a: [0.4, 0.4, 0.5, 0.6] }, known: ['a'] });
  out = S.frameOf(t, video, 1000, 500);
  ok('fix 1: the pointer already over the game when it is found: its part is filled from the rows above and below', out === t.cc && t.filled === 1 && draws.slice(0, 2).every((d) => d.length === 9 && d[4] === 1 && d[5] === 400 && d[7] === 100), draws.slice(0, 2).map((d) => d.slice(1)));
  draws.length = 0; t.cc = null; t.filled = 0; t.prevBox = null;
  S.setPtr({ tiles: {}, known: ['a'] });
  out = S.frameOf(t, video, 1000, 500);
  ok('fix 1: no pointer over the game: its own picture is used, and a clean copy is made', out === video && draws.length === 1 && draws[0].length === 5);
  draws.length = 0; t.frames = 1;
  S.setPtr({ tiles: { a: [0.4, 0.4, 0.5, 0.6] }, known: ['a'] });
  out = S.frameOf(t, video, 1000, 500);
  const covered = (x, y) => draws.some((d) => x >= d[5] && x < d[5] + d[7] && y >= d[6] && y < d[6] + d[8]);
  ok('fix 1: the pointer over the game: the copy is used, renewed everywhere but under the pointer', out === t.cc && draws.length === 4 && !covered(450, 250) && covered(10, 10) && covered(990, 490) && covered(300, 250) && covered(600, 250), draws.map((d) => d.slice(5)));
  draws.length = 0;
  S.setPtr({ tiles: { a: [0.6, 0.4, 0.7, 0.6] }, known: ['a'] });
  S.frameOf(t, video, 1000, 500);
  ok('fix 1: where the pointer was a moment ago stays covered too', !covered(450, 250) && !covered(650, 250), draws.map((d) => d.slice(5)));
  draws.length = 0; t.s.mouse = 'show';
  out = S.frameOf(t, video, 1000, 500);
  ok('fix 1: a game whose mouse is "shown" is left as it is', out === video && draws.length === 0);
}

// ---- wired together
{
  const st = read('src/stage.js'), ms = read('mystream.js'), pre = read('preload.js'), main = read('main.js'), html = read('mystream.html'), booth = read('src/booth.js'), ps = read('ps/pointer.ps1'), on = read('online.js');
  ok('the stage draws from the painted-over picture (WebGL, slow path and background guess)', /texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, src\)/.test(st) && /paintSlow\(t, src, w, h\)/.test(st) && /guessKey\(src\)/.test(st) && /fillMask\(t, src, w, h\)/.test(st));
  ok('the stage listens for the pointer', /ms\.onPointer\(onPointer\)/.test(st) && /onPointer: on\('ms:pointer'\)/.test(pre));
  ok('MyStream sends the pointer while it is open and stops with it', /pointerStart\(\);/.test(ms) && /pointerStop\(\);/.test(ms) && /send\(stage, 'ms:pointer', f\)/.test(ms));
  ok('the booth chooses the pointer through online.js (only one that was won)', /handle\('ms:cursor'/.test(ms) && /cursor: \(i\) => ipcRenderer\.invoke\('ms:cursor', i\)/.test(pre) && /setCursor: \(i\) =>/.test(main) && /cursorNow: \(\) => load\(\)\.cursor/.test(on));
  ok('the booth has the pointer tab and the mouse switch per game', /data-tab="pointer"/.test(html) && /id="pane-pointer"/.test(html) && /data-act=\\?"mouse\\?"/.test(booth) && /s\.mouse = s\.mouse === 'show' \? 'hide' : 'show'/.test(booth));
  ok('pointer settings can be saved from the booth', /'sources', 'notes', 'pointer'\]/.test(ms));
  ok('ps\\pointer.ps1 is plain ASCII and only reads', !/[^\x00-\x7f]/.test(ps) && !/SetWindowPos|SetCursorPos|MoveWindow|SendInput/.test(ps));
  ok('the window API went up (pages newer than the running program ask for a restart)', +(/const API = (\d+);/.exec(main) || [0, 0])[1] >= 8);
  ok('version 0.9.4 or later', JSON.parse(read('package.json')).version.split('.').map(Number).reduce((v, n) => v * 100 + n, 0) >= 904);
}

console.log(`\n=== 0.9.4 check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
