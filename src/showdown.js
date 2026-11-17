// Screen Trainer — importing a team written in Pokémon Showdown's text format (0.7).
//
// The format is the plain text that Showdown's teambuilder exports and that people post everywhere:
//
//     Sparky (Pikachu) (F) @ Light Ball
//     Ability: Static
//     Level: 50
//     Shiny: Yes
//     EVs: 252 SpA / 4 SpD / 252 Spe
//     Timid Nature
//     IVs: 0 Atk
//     - Thunderbolt
//     - Volt Tackle
//
// One Pokémon per block, blocks separated by an empty line. Only the first line is needed: a name typed by hand with
// nothing else is enough. Whatever is missing is filled in the way this game would make that Pokémon: level 50, a
// random nature, the moves it knows at that level, no item. Whatever this game does not have is left out and said so
// (abilities, EVs and Tera types are not part of it; a move it does not know is replaced by one the Pokémon learns).
//
// This file only reads text and data tables: it touches no save. Showdown.parse(text, DATA) gives a list of entries
//     { sp, species, nick, lvl, shiny, fem (true/false/null), nat (index or -1), iv ([6] or null), moves ([ids]),
//       item (key or ''), notes ([what was changed or left out]), ok }
// which the Pokédex window shows for a look and an edit before anything is added, and which G.command('importTeam')
// in src/game.js checks again from scratch before it makes Pokémon of them (Showdown.build).
'use strict';

const Showdown = (() => {
  const MAX = 30;                                          // Pokémon in one import (a team is six; a pasted box may be more)
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'.:%]/g, '').replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const STAT = { hp: 0, atk: 1, def: 2, spa: 3, spd: 4, spe: 5 };
  let tables = null, tablesFor = null;
  /** name tables for a DATA object: species and moves by their slug (and species by their plain name) */
  function index(D) {
    if (tablesFor === D && tables) return tables;
    const sp = {}, mv = {};
    for (const id in D.dex) { const d = D.dex[id]; sp[slug(d.k || d.n)] = +id; sp[slug(d.n)] = +id; }
    for (const id in D.moves) { const m = D.moves[id]; if (m) { mv[slug(m.k || m.n)] = +id; mv[slug(m.n)] = +id; } }
    const nat = {}; D.natures.forEach((n, i) => { nat[slug(n.n)] = i; });
    tablesFor = D; tables = { sp, mv, nat };
    return tables;
  }
  /** a species by whatever name it was given. Regional and other forms the game does not have fall back to the base kind. */
  function findSpecies(name, T) {
    let s = slug(name);
    if (T.sp[s]) return { sp: T.sp[s], exact: true };
    for (;;) { const i = s.lastIndexOf('-'); if (i < 0) break; s = s.slice(0, i); if (T.sp[s]) return { sp: T.sp[s], exact: false }; }
    return null;
  }

  /** read one block of lines */
  function block(lines, D, T) {
    const notes = [], first = lines[0];
    // "Nick (Species) (M) @ Item"   "Species (F) @ Item"   "Species"
    let head = first, item = '';
    const at = head.lastIndexOf(' @ ');
    if (at >= 0) { item = head.slice(at + 3).trim(); head = head.slice(0, at); }
    let fem = null;
    const g = /\s*\((M|F)\)\s*$/i.exec(head);
    if (g) { fem = g[1].toUpperCase() === 'F'; head = head.slice(0, g.index); }
    let nick = '', name = head.trim();
    const par = /^(.*)\(([^()]+)\)\s*$/.exec(name);
    if (par && par[1].trim()) { nick = par[1].trim(); name = par[2].trim(); } else if (par) name = par[2].trim();
    const found = findSpecies(name, T);
    if (!found) return { ok: false, species: name, nick, notes: [`"${name}" is not a Pokémon this game knows.`], raw: first };
    const sp = found.sp, d = D.dex[sp];
    if (!found.exact) notes.push(`"${name}" is read as ${d.n} (that form is not in this game).`);
    const e = { ok: true, sp, species: d.n, nick: nick.slice(0, 12), lvl: 0, shiny: false, fem, nat: -1, iv: null, moves: [], item: '', itemName: item, notes };
    if (d.gn < 0 && fem !== null) e.fem = null;
    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      let m;
      if ((m = /^level:\s*(\d+)/i.exec(line))) e.lvl = Math.min(100, Math.max(1, +m[1]));
      else if ((m = /^shiny:\s*(\w+)/i.exec(line))) e.shiny = /^y/i.test(m[1]);
      else if ((m = /^(\w+)\s+nature\b/i.exec(line))) { const i = T.nat[slug(m[1])]; if (i === undefined) notes.push(`"${m[1]}" is not a nature: it gets one at random.`); else e.nat = i; }
      else if ((m = /^ivs:\s*(.+)$/i.exec(line))) {
        const iv = [31, 31, 31, 31, 31, 31];
        for (const part of m[1].split('/')) { const q = /(\d+)\s*([a-z]+)/i.exec(part); if (q && STAT[q[2].toLowerCase()] !== undefined) iv[STAT[q[2].toLowerCase()]] = Math.min(31, Math.max(0, +q[1])); }
        e.iv = iv;
      } else if ((m = /^[-–•]\s*(.+)$/.exec(line))) {
        const mvName = m[1].replace(/\s*\[.*\]\s*$/, '').trim(), id = T.mv[slug(mvName)] || T.mv[slug(mvName.replace(/^hidden power.*$/i, 'hidden power'))];
        if (!id) notes.push(`The move "${mvName}" is not in this game.`);
        else if (e.moves.includes(id)) notes.push(`"${mvName}" is listed twice.`);
        else if (e.moves.length < 4) e.moves.push(id);
      } else if (/^(ability|evs|tera type|happiness|hidden power|gigantamax|dynamax level):/i.test(line)) { /* not part of this game: read and left out */ }
    }
    return e;
  }

  /** Showdown.parse(text, DATA) -> { entries, more }.  more: how many blocks were left out because there were too many. */
  function parse(text, D) {
    const T = index(D), blocks = [];
    let cur = [];
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      if (!line) { if (cur.length) { blocks.push(cur); cur = []; } continue; }
      if (/^===.*===$/.test(line)) { if (cur.length) { blocks.push(cur); cur = []; } continue; }      // "=== [gen9] Team name ===" headings
      // A line that begins a new Pokémon although no empty line came before it (a list typed by hand): it names a kind
      // ("Type: Null" does, although it looks like a detail), or it is no detail line at all (then it is reported).
      const detail = /^([-–•]\s*\S|[A-Za-z][\w ]*:\s|\w+\s+nature\b)/i.test(line);
      if (cur.length && (!detail || findSpecies(line.replace(/\s+@\s.*$/, '').replace(/\s*\((M|F)\)\s*$/i, '').replace(/^.*\(([^()]+)\)\s*$/, '$1'), T))) { blocks.push(cur); cur = []; }
      cur.push(line);
    }
    if (cur.length) blocks.push(cur);
    return { entries: blocks.slice(0, MAX).map((b) => block(b, D, T)), more: Math.max(0, blocks.length - MAX) };
  }

  /** Make a real Pokémon of one entry, filling in what is missing. env: { DATA, Mon, Items (may be null), learnable(sp) -> Set of move ids or null }.
   *  Returns { mon, notes } or null when the entry cannot be one. Everything is checked here again: entries come from a window. */
  function build(e, env) {
    const D = env.DATA, Mon = env.Mon;
    if (!e || !D.dex[e.sp]) return null;
    const d = D.dex[e.sp], notes = [];
    const lvl = e.lvl >= 1 && e.lvl <= 100 ? Math.round(e.lvl) : 50;
    const m = Mon.create(e.sp, lvl, { shiny: !!e.shiny });
    if (typeof e.nick === 'string') m.nick = e.nick.replace(/[<>]/g, '').slice(0, 12).trim();
    if (d.gn < 0) m.fem = 0; else if (e.fem === true || e.fem === false) { if ((d.gn === 0 && e.fem) || (d.gn >= 8 && !e.fem)) notes.push(`${d.n} is always ${d.gn === 0 ? 'male' : 'female'}.`); else m.fem = e.fem ? 1 : 0; }
    if (Number.isInteger(e.nat) && e.nat >= 0 && e.nat < D.natures.length) m.nat = e.nat;
    if (Array.isArray(e.iv) && e.iv.length === 6) m.iv = e.iv.map((v) => Math.min(31, Math.max(0, Math.round(+v) || 0)));
    // moves: the ones asked for that exist; the rest of the four are what it knows at its level
    const asked = (Array.isArray(e.moves) ? e.moves : []).map(Number).filter((id) => D.moves[id]), own = Mon.movesAt(e.sp, lvl);
    const moves = [...new Set(asked)].slice(0, 4);
    if (asked.length && moves.length < 4) for (const id of own) { if (moves.length >= 4) break; if (!moves.includes(id)) moves.push(id); }
    m.moves = moves.length ? moves : own;
    if (!asked.length) notes.push('No moves were given: it knows what it would have learned by this level.');
    if (e.itemName || e.item) {
      const key = slug(e.item || e.itemName);
      if (env.Items && env.Items.get(key)) m.item = key; else notes.push(`The item "${e.itemName || e.item}" is not in this game.`);
    }
    m.hp = Mon.maxHp(m); m.aff = 70; m.met = Date.now(); m.metLvl = lvl; m.ball = 'poke-ball'; m.imp = 1;      // imp: it came by import, not by a catch
    return { mon: m, notes };
  }

  return { parse, build, slug, MAX };
})();
if (typeof module !== 'undefined') module.exports = Showdown;
