// Screen Trainer — sprite lookup, shared by the overlay and the Pokédex window.
// `info` comes from spritescan.js in the main process: it says which files exist in the user's sprites folder.
'use strict';

const Sprites = (() => {
  let root = '', idx = {}, style = 'showdown', items = new Set(), icons = null, types = null, badges = new Set(), marks = null, ribbons = null;
  const BASES = {
    showdown: ['pokemon/other/showdown', 'gif'],
    bw: ['pokemon/versions/generation-v/black-white/animated', 'gif'],
    static: ['pokemon', 'png'],
  };
  const ORDER = { showdown: ['showdown', 'bw', 'static'], bw: ['bw', 'showdown', 'static'], static: ['static', 'showdown', 'bw'] };

  function configure(info, st) {
    info = info || {};
    root = info.rootUrl || '';
    idx = {};
    for (const k in info.idx || {}) idx[k] = new Set(info.idx[k]);
    const x = info.extra || {};
    items = new Set(x.items && x.items.length ? x.items : Object.keys(info.items || {}).filter((k) => info.items[k]));
    icons = x.icons ? { dir: x.icons.dir, ids: new Set(x.icons.ids) } : null;
    types = x.types ? { dir: x.types.dir, ids: new Set(x.types.ids) } : null;
    badges = new Set(x.badges || []);
    marks = x.marks ? { dir: x.marks.dir, names: new Set(x.marks.names) } : null;
    ribbons = x.ribbons ? { dir: x.ribbons.dir, names: new Set(x.ribbons.names) } : null;
    style = ORDER[st] ? st : 'showdown';
    // the looks each folder has (0.9.3), found by species and look whatever the set calls the file: one set says
    // "666-high-plains", another "666-highplains"; Alcremie is "-sweet" in one and not in the other
    lookIdx = {};
    for (const k in idx) for (const id of idx[k]) if (typeof id === 'string') (lookIdx[k] = lookIdx[k] || new Map()).set(lookKey(id), id);
  }
  let lookIdx = {};
  const lookKey = (id) => String(id).replace(/-sweet$/, '').replace(/-/g, '').replace(/^(\d+)/, '$1-');
  /** the file name this folder uses for the look, or null */
  const lookIn = (dir, sp, look) => (lookIdx[dir] && lookIdx[dir].get(lookKey(sp + '-' + look))) || null;
  const has = (dir, id) => !!idx[dir] && idx[dir].has(id);
  const file = (dir, id, ext) => `${root}/${dir}/${id}.${ext}`;
  function variant(base, id, back, shiny, fem, look) {
    const [dir0, ext] = BASES[base], b = back ? '/back' : '', s = shiny ? '/shiny' : '';
    if (look) { const f = lookIn(dir0 + b + s, id, look); if (f) return file(dir0 + b + s, f, ext); }
    if (fem && has(dir0 + b + s + '/female', id)) return file(dir0 + b + s + '/female', id, ext);
    if (has(dir0 + b + s, id)) return file(dir0 + b + s, id, ext);
    return null;
  }
  /** resolve front/back images for a creature, falling back across sprite sets */
  function resolve(sp, shiny, fem, look) {
    // with a look: the first set that has its picture (a still picture of an Unown "B" is better than a moving "A")
    if (look) for (const wantShiny of shiny ? [true, false] : [false]) for (const base of ORDER[style]) {
      const front = lookIn(BASES[base][0] + (wantShiny ? '/shiny' : ''), sp, look) && variant(base, sp, false, wantShiny, fem, look);
      if (front) return { front, back: variant(base, sp, true, wantShiny, fem, look) || variant(base, sp, true, wantShiny, fem), base, padded: base === 'static' };
    }
    for (const wantShiny of shiny ? [true, false] : [false]) {
      for (const base of ORDER[style]) {
        const front = variant(base, sp, false, wantShiny, fem);
        if (front) return { front, back: variant(base, sp, true, wantShiny, fem), base, padded: base === 'static' };
      }
    }
    return null;
  }
  const available = (sp) => ORDER.static.some((b) => has(BASES[b][0], sp));
  /** Every picture the folder has of this Pokémon, for turning it round in the Pokédex (0.7): the set in use first, front
   *  then back, then the other sets, then the same again in the other colouring. Each is { src, label }. */
  function views(sp, shiny, fem, look) {
    const NAME = { showdown: 'animated', bw: 'animated pixel', static: 'still' }, out = [], seen = new Set();
    for (const sh of shiny ? [true, false] : [false, true]) for (const base of ORDER[style]) for (const back of [false, true]) {
      const src = (look && variant(base, sp, back, sh, fem, look)) || variant(base, sp, back, sh, fem);
      if (src && !seen.has(src)) { seen.add(src); out.push({ src, label: `${sh ? 'shiny, ' : ''}${back ? 'from behind' : 'from the front'}, ${NAME[base]}`, shiny: sh, back, base }); }
    }
    return out;
  }
  const ready = () => !!root && Object.keys(idx).length > 0;
  // each of these returns a file URL, or null when the user's folder does not have that image
  const item = (name) => (items.has(name) ? `${root}/items/${name}.png` : null);
  const icon = (sp) => (icons && icons.ids.has(sp) ? `${root}/${icons.dir}/${sp}.png` : has('pokemon', sp) ? file('pokemon', sp, 'png') : null);
  const still = (sp, shiny, look) => (look && (variant('static', sp, false, shiny, false, look) || variant('static', sp, false, false, false, look))) || variant('static', sp, false, shiny, false) || variant('static', sp, false, false, false);
  const type = (id) => (types && types.ids.has(id) ? `${root}/${types.dir}/${id}.png` : null);
  const badge = (n) => (badges.has(n) ? `${root}/badges/${n}.png` : null);
  const mark = (key) => (marks && marks.names.has(key) ? `${root}/${marks.dir}/${key}.png` : null);
  const ribbon = (key) => (ribbons && ribbons.names.has(key) ? `${root}/${ribbons.dir}/${key}.png` : null);
  /** the egg picture of the sprite set (pokemon/egg.png), if the set has one; the caller copes when it does not load */
  const egg = () => (root ? `${root}/pokemon/egg.png` : null);
  return { configure, resolve, available, views, ready, item, icon, still, type, badge, mark, ribbon, egg };
})();
