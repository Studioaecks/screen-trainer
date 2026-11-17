// Screen Trainer — checks for 0.9.8.1 (the Unown Notepad's fixed page and its Living Background).
//
//   node tools/v0981check.js
//
// Headless, under a second: which words the page knows and where they stand, who fights whom, the page's wrapping,
// and the notepad's files.
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
const U = require(path.join(APP, 'src', 'unown.js')), Land = require(path.join(APP, 'src', 'unownland.js'));

const at = (text, cols) => { const c = Array.from(text); return Land.seeds(c, U.layout(c, 4, cols || 64)); };
let s = at('I love you. Fire and the sea!\nNothing here.');
ok('a word the page knows changes the ground: love, fire, sea', s.map((x) => x.theme).join() === 'love,fire,water', s.map((x) => x.word + ':' + x.theme));
ok('it spreads from where the word stands (the middle of the word)', s[0].row === 0 && s[0].col === 4 && s[1].col === 14, s.map((x) => [x.col, x.row]));
ok('capital letters and "\'s" do not matter; other words leave the grass alone', at("LOVE Love's lovely glove").map((x) => x.theme).join() === 'love,love');
s = at('love and love');
ok('the same word twice is two places, each keeping its own ground while the text changes', s.length === 2 && s[0].key === 'love#1' && s[1].key === 'love#2');
ok('fire and water fight, love and war fight; love and life merge, as do night and dream', Land.fights('fire', 'water') && Land.fights('war', 'love') && !Land.fights('love', 'life') && !Land.fights('night', 'dream') && !Land.fights('love', 'love'));
ok('every ground has its colours, and every word leads to a ground', Object.keys(Land.WORDS).every((k) => Land.THEMES[k] && Land.THEMES[k].c.length === 4) && [...Land.DICT.values()].every((k) => Land.THEMES[k]) && Land.DICT.size > 200, Land.DICT.size);
const love = Land.THEMES.love;
ok('love, as the owner wrote it: emerald, a golden sheen, tall tangled growth with clover, chamomile and blossoms, and it holds its ground', love.tall && love.sheen && love.hold > 0 && love.deco.length >= 4 && love.c[1][1] > love.c[1][0] * 3);
// ---- the page
const L = U.layout(Array.from('x'.repeat(70) + '\nab'), 4, 64);
ok('the page is 64 letters wide: a full line carries on in the next', L[63].row === 0 && L[63].col === 63 && L[64].row === 1 && L[64].col === 0 && L[71].row === 2, [L[64], L[71]]);
ok('without a page width nothing wraps (the Field Dex title)', U.layout(Array.from('x'.repeat(70)), 4, 0)[69].row === 0);
const css = read('notepad.css'), js = read('src/notepad.js'), html = read('notepad.html');
ok('the text box breaks where the Unown do (anywhere, spaces included)', /white-space: break-spaces; word-break: break-all/.test(css) && /const COLS = 64, LINES = 28;/.test(js) && /cols: COLS/.test(js));
ok('the page grows a whole page at a time and has a border; pages are marked', /pages \* LINES \* M\.lh/.test(js) && /strokeRect\(sx \+ 1\.5/.test(js) && /setLineDash\(\[6, 6\]\)/.test(js));
ok('the ground is drawn under the Unown and can be switched off; reading plainly shows paper', /<canvas id="land"><\/canvas>\s*<canvas id="unown"><\/canvas>/.test(html) && /data-do="ground"/.test(html) && /body\.plain #land, body\.noground #land \{ visibility: hidden; \}/.test(css));
ok('a word keeps the time it has had to spread while the text round it changes', /born\.has\(s\.key\) \? born\.get\(s\.key\)/.test(js));
ok('nothing of it is a picture file', !/\.png|data:image/.test(read('src/unownland.js')));
ok('version 0.9.8.1 or later', /^0\.9\.(8\.[1-9]|9)|^[1-9]/.test(JSON.parse(read('package.json')).version));
console.log(`\n=== 0.9.8.1 check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
