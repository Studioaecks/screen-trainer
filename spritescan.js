// Screen Trainer — finds the sprite folder and indexes which sprite files exist.
// Nothing is copied: the windows load images straight from this folder.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const BASES = { 'pokemon/other/showdown': '.gif', 'pokemon/versions/generation-v/black-white/animated': '.gif', pokemon: '.png' };
// optional extras, first folder that exists wins
const ICONS = ['pokemon/versions/generation-viii/icons', 'pokemon/versions/generation-vii/icons', 'pokemon/versions/generation-vi/icons'];
const TYPES = ['types/generation-viii/sword-shield', 'types/generation-ix/scarlet-violet', 'types/generation-viii/brilliant-diamond-shining-pearl', 'types/generation-viii/legends-arceus'];
const MARKS = ['marks/generation-ix', 'marks/generation-viii'];
const RIBBONS = ['ribbons/generation-viii', 'ribbons/generation-ix'];

function isSpriteRoot(dir) {
  try { return fs.statSync(path.join(dir, 'pokemon')).isDirectory(); } catch (e) { return false; }
}

/** normalise whatever folder the user picked (repo root, sprites/, sprites/pokemon) to the sprites root */
function normalize(dir) {
  if (!dir) return null;
  const cands = [dir, path.join(dir, 'sprites'), path.join(dir, 'sprites-master', 'sprites'), path.dirname(dir)];
  for (const c of cands) if (isSpriteRoot(c) && fs.existsSync(path.join(c, 'pokemon', '1.png'))) return c;
  for (const c of cands) if (isSpriteRoot(c)) return c;
  return null;
}

/** look for a sprites folder near the program (walking up a few levels) */
function autoFind(startDirs) {
  for (const start of startDirs) {
    let dir = start;
    for (let i = 0; i < 6 && dir; i++) {
      for (const rel of ['sprites-master/sprites', 'sprites-master', 'sprites', 'PokeAPI-sprites/sprites', 'sprites-master/sprites-master/sprites']) {
        const hit = normalize(path.join(dir, rel));
        if (hit) return hit;
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

const list = (root, rel, ext) => { try { return fs.readdirSync(path.join(root, rel)).filter((n) => n.endsWith(ext)); } catch (e) { return []; } };
const numbered = (names) => names.filter((n) => /^\d+\.[a-z]+$/.test(n)).map((n) => parseInt(n, 10));
// the pictures of a species' looks (0.9.3): "201-b.png", "666-high-plains.gif" ... kept as their names, "201-b"
const looks = (names) => names.filter((n) => /^\d+-[a-z0-9-]+\.[a-z]+$/.test(n)).map((n) => n.slice(0, n.lastIndexOf('.')));
const stems = (names) => names.map((n) => n.slice(0, n.lastIndexOf('.')));

const rel0 = (base, b, s, f) => base + b + s + f;
function scan(root) {
  // idx: sprite folder -> species ids present. items: the four basic balls (kept for older code).
  // extra: item names, box icons, type labels, badges, marks and ribbons, each empty when the folder is missing.
  const out = { root: root || '', rootUrl: '', idx: {}, items: {}, ok: false, extra: { items: [], icons: null, types: null, badges: [], marks: null, ribbons: null } };
  if (!root || !isSpriteRoot(root)) return out;
  out.rootUrl = pathToFileURL(root).href.replace(/\/+$/, '');
  for (const base of Object.keys(BASES)) {
    for (const b of ['', '/back']) for (const s of ['', '/shiny']) for (const f of ['', '/female']) {
      const names = list(root, rel0(base, b, s, f), BASES[base]), rel = base + b + s + f, ids = numbered(names).concat(looks(names));
      if (ids.length) out.idx[rel] = ids;
    }
  }
  const x = out.extra;
  x.items = stems(list(root, 'items', '.png'));
  for (const n of ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball']) out.items[n] = x.items.includes(n);
  for (const dir of ICONS) { const ids = numbered(list(root, dir, '.png')); if (ids.length) { x.icons = { dir, ids }; break; } }
  for (const dir of TYPES) { const ids = numbered(list(root, dir, '.png')); if (ids.length >= 18) { x.types = { dir, ids }; break; } }
  x.badges = numbered(list(root, 'badges', '.png'));
  for (const dir of MARKS) { const names = stems(list(root, dir, '.png')); if (names.length) { x.marks = { dir, names }; break; } }
  for (const dir of RIBBONS) { const names = stems(list(root, dir, '.png')); if (names.length) { x.ribbons = { dir, names }; break; } }
  out.ok = Object.keys(out.idx).length > 0;
  return out;
}

module.exports = { scan, normalize, autoFind };
