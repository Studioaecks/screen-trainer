#!/usr/bin/env node
// Screen Trainer — sound check. No audio device needed.
//
//   node tools/soundcheck.js                       every sound name used in the code has a built-in sound and a bank mapping
//   node tools/soundcheck.js <file.stbank | rom>   also render every mapped effect, cry and track from that bank and
//                                                  report anything silent, clipped or missing
//   node tools/soundcheck.js <bank> --wav <dir>    additionally write the rendered effects as .wav files to listen to
//
// Exit code 1 when something is wrong.
'use strict';
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const M4A = require(path.join(APP, 'src/m4a.js')), SoundMap = require(path.join(APP, 'src/soundmap.js')), Tunes = require(path.join(APP, 'src/tunes.js')), Core = require(path.join(APP, 'src/audio-core.js'));
const args = process.argv.slice(2), bankFile = args[0] && !args[0].startsWith('--') ? args[0] : null, wavDir = args.includes('--wav') ? args[args.indexOf('--wav') + 1] : null;
let bad = 0;
const fail = (msg) => { bad++; console.log('  PROBLEM  ' + msg); };

// 1. names used in the code
const used = new Set();
for (const f of ['game.js', 'battle.js', 'items.js', 'sound.js', 'panel.js', 'overlay.js', 'events.js', 'mewtwo.js', 'guardian-ui.js']) {
  const src = fs.readFileSync(path.join(APP, 'src', f), 'utf8');
  for (const m of src.matchAll(/(?:\bsnd|Sound\.play|\bui)\(\s*'([\w.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\?\s*'(\w+)'\s*:\s*'(\w+)'\s*(?:,|\))/g)) if (/snd\(|ui\(|Sound\.play\(/.test(src.slice(Math.max(0, m.index - 80), m.index))) { used.add(m[1]); used.add(m[2]); }
}
for (const n of ['brn', 'frz', 'par', 'psn', 'slp', 'rain', 'sun', 'sand', 'hail', 'snow', 'hitSuper', 'hitWeak', 'hit', 'statUp', 'statDown', 'treasure', 'item', 'pickup', 'web', 'hazard', 'pet', 'use']) used.add(n);
console.log(`${used.size} sound names used in the code`);
for (const n of [...used].sort()) {
  if (!Tunes.SFX[n]) fail(`"${n}" has no built-in sound (src/tunes.js SFX)`);
  if (!SoundMap.SFX[n]) fail(`"${n}" has no bank mapping (src/soundmap.js SFX)`);
}
for (const n of Object.keys(SoundMap.SFX)) if (!used.has(n)) console.log(`  note: "${n}" is mapped but not used anywhere`);

const stats = (pcm) => { let peak = 0, sum = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; sum += pcm[i] * pcm[i]; } return { peak, rms: Math.sqrt(sum / Math.max(1, pcm.length)) }; };
function wav(file, pcm, rate) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

// 2. the built-in synth and, if given, a bank: render everything through the same path the app uses
function renderAll(label, bank) {
  const RATE = 32000, out = [], post = (m) => out.push(m);
  Core.handle({ t: 'init', rate: RATE, bank }, post);
  const ready = out.pop();
  console.log(`\n${label}: ${ready.bank ? `${ready.bank.game}, ${ready.bank.songs} songs, ${ready.bank.cries} cries` : 'built-in synth'}, ${ready.tracks.length} music tracks`);
  if (bank && !ready.bank) { fail('the bank was not accepted'); return; }
  if (wavDir) fs.mkdirSync(wavDir, { recursive: true });
  let n = 0;
  for (const name of [...used].sort()) {
    Core.handle({ t: 'sfx', id: 1, name }, post);
    const pcm = out.pop().pcm;
    if (!pcm) { fail(`${label}: "${name}" rendered nothing`); continue; }
    const s = stats(pcm), sec = pcm.length / RATE;
    if (s.peak < 0.02) fail(`${label}: "${name}" is silent (peak ${s.peak.toFixed(3)})`);
    if (s.peak > 0.99) fail(`${label}: "${name}" clips`);
    if (sec > 6.5) fail(`${label}: "${name}" is ${sec.toFixed(1)} s long`);
    if (wavDir) wav(path.join(wavDir, `${bank ? 'bank' : 'builtin'}-${name}.wav`), pcm, RATE);
    n++;
  }
  let moves = 0;
  for (const type of Object.keys(SoundMap.TYPES)) for (const style of ['dash', 'shot', 'beam', 'wave', 'sky', 'status']) {
    Core.handle({ t: 'sfx', id: 1, name: 'move', param: { key: '', type, style } }, post);
    const pcm = out.pop().pcm;
    if (!pcm || stats(pcm).peak < 0.02) fail(`${label}: move sound ${type}/${style} is silent`); else moves++;
  }
  if (bank) for (const key of Object.keys(SoundMap.MOVES)) { Core.handle({ t: 'sfx', id: 1, name: 'move', param: { key, type: 'normal', style: 'dash' } }, post); const pcm = out.pop().pcm; if (!pcm || stats(pcm).peak < 0.02) fail(`${label}: move "${key}" is silent`); else moves++; }
  let cries = 0, real = 0;
  for (let sp = 1; sp <= 1025; sp++) { Core.handle({ t: 'cry', id: 1, sp }, post); const pcm = out.pop().pcm; if (!pcm || stats(pcm).peak < 0.02) fail(`${label}: cry of species ${sp} is silent`); else { cries++; if (bank && SoundMap.cryIndex(sp) >= 0) real++; } }
  let tracks = 0;
  const list = ready.tracks.concat(['wild', 'horde', 'alpha', 'shiny', 'legend', 'mewtwo', 'deoxys'].map((v) => Core.battleTrack(v)));
  for (const tr of list) {
    Core.handle({ t: 'open', sid: 'x', track: tr.id, mood: tr.id[0] === 'b' ? 'battle' : 'roam' }, post);
    let peak = 0, sum = 0, cnt = 0;
    for (let i = 0; i < 40; i++) { Core.handle({ t: 'pull', sid: 'x', n: RATE / 2 }, post); const c = out.pop(); if (!c.l) { fail(`${label}: track "${tr.title}" stopped`); break; } const s = stats(c.l); peak = Math.max(peak, s.peak); sum += s.rms; cnt++; }
    Core.handle({ t: 'close', sid: 'x' }, post);
    if (peak < 0.05) fail(`${label}: track "${tr.title}" is silent`); else if (peak > 0.995) fail(`${label}: track "${tr.title}" clips`); else tracks++;
  }
  console.log(`  ${n} effects, ${moves} attack sounds, ${cries} cries${bank ? ` (${real} from the game, the rest synthesised)` : ''}, ${tracks} of ${list.length} tracks play`);
}
renderAll('Built-in', null);
if (bankFile) {
  let bytes = new Uint8Array(fs.readFileSync(bankFile));
  if (String.fromCharCode(...bytes.subarray(0, 7)) !== 'STBANK1') bytes = M4A.buildBank(bytes);
  renderAll(path.basename(bankFile), bytes);
}
console.log(bad ? `\n${bad} problem(s)` : '\nAll good.');
process.exit(bad ? 1 : 0);
