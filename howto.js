// Screen Trainer - the how-to videos (1.0).
// The videos are not part of the program: they sit in a "howto" folder beside it (ScreenTrainer\howto\clips\<topic>\),
// because they show real Pokémon pictures (the folder the videos are made in, "howto-media", works too). The Field Dex lists them only once the player's own sprites folder has been
// found, and opens one in the computer's own video player. Only .mp4 and .gif files inside that folder are ever opened.
'use strict';
const fs = require('fs');
const path = require('path');

const TITLES = {
  overlay: 'Pokémon on your screen', catching: 'Weaken and catch', fielddex: 'The Field Dex', settings: 'Transparency and startup',
  field: 'The Field window', mewtwo: 'Mewtwo, computer guardian', rotom: "Rotom's big tidy-up", mystream: 'MyStream studio',
  online: 'Visit other Trainers', notepad: 'The Unown Notepad', save: 'Saving, loading and the Escape Rope', mods: 'Mods and forks',
};
const KIND = [['gif', /-gif\.gif$/i], ['s10', /-10s\.mp4$/i], ['s30', /-30s\.mp4$/i]];

/** the clips in <home>/howto/clips, in their number order: [{ key, title, files: { gif, s10, s30 } }] */
const DIRS = ['howto', 'howto-media'];
const clipsDir = (home) => DIRS.map((d) => path.join(home, d, 'clips')).find((d) => fs.existsSync(d)) || path.join(home, DIRS[0], 'clips');
function list(home) {
  const dir = clipsDir(home), out = [];
  let topics = [];
  try { topics = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const key of topics) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, key)); } catch { continue; }
    const files = {}; let order = 99;
    for (const n of names) for (const [k, re] of KIND) if (re.test(n)) { files[k] = n; const m = /^(\d+)-/.exec(n); if (m) order = Math.min(order, +m[1]); }
    if (Object.keys(files).length) out.push({ key, order, title: TITLES[key] || key, files });
  }
  return out.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)).map(({ order, ...c }) => c);
}

/** the full path of one clip, or null when key/kind do not name a clip that is there */
function file(home, key, kind) {
  const c = list(home).find((x) => x.key === key);
  const n = c && c.files[kind];
  return n ? path.join(clipsDir(home), c.key, n) : null;
}

module.exports = { list, file, TITLES };
