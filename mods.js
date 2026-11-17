// Screen Trainer — mods (1.0): properly formatted changes that anyone can write, checked before they are used.
//
// A mod is a folder in "mods" (next to the program folder, in the Screen Trainer folder) with one file, mod.json.
// mods\README.txt (written by the program the first time the folder is opened) explains the format to people; the
// rules for this file are:
//   1. A mod is data, never code. mod.json is read as JSON and nothing in it is ever run, loaded as a page or handed to
//      Windows. Its pieces can only do what is listed in FORMAT below.
//   2. Everything is checked (validate). A mod with one mistake is not used at all and the Options screen says what
//      the mistake is and where. Settings go through the same range checks as the Options screen (defaults.js).
//   3. A mod is off until the owner switches it on, and switching it off puts back what it changed. "All mods off" (and
//      starting with --no-mods) switches every one off. A mod that is changed or removed while it is on is switched off
//      the next time the folder is read.
//   4. Settings that touch the computer or the owner's files cannot be changed by a mod (BLOCKED): startup, the hotkey,
//      the sprites folder, which screen, Mewtwo, online visiting (which is not in settings.json anyway).
//   5. The state (which are on, and what they changed) is mods.json in the user folder. A fork has its own.
'use strict';
const fs = require('fs');
const path = require('path');

const FORMAT_ID = 'screen-trainer-mod/1';
const MAX_BYTES = 64 * 1024;
const MAX_MODS = 50;
const BLOCKED = new Set(['autoStart', 'hotkey', 'spritesPath', 'display', 'visible', 'firstRun', 'optClosed', 'guardian', 'guardianAlerts', 'guardianX', 'guardianY', 'boxOpen', 'field', 'fieldX', 'fieldY', 'fieldW', 'fieldH', 'fieldMax', 'fieldZoomAt', 'musicTrack']);
const TYPES = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
// the Field Dex colours a theme may set (panel.css :root), and the two that are "r, g, b" triplets
const THEME_VARS = new Set(['shell', 'shell-hi', 'shell-lo', 'tray', 'bezel', 'lcd', 'lcd-dim', 'ink', 'ink2', 'line', 'key', 'key-lo', 'amber', 'berry', 'ok', 'on-ink', 'xp', 'btn-hi', 'go-hi', 'tint', 'glaze']);
const TRIPLETS = new Set(['tint', 'glaze']);
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+%?\s*)?\))$/i;
const TRIPLET = /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/;
const FORMAT = {
  format: 'always "' + FORMAT_ID + '"',
  id: 'letters a-z, digits and dashes, 2 to 40 (the same as the folder name is best)',
  name: 'up to 60 characters', version: 'up to 20 characters', author: 'up to 60 characters', description: 'up to 400 characters',
  settings: 'starting values for options, e.g. { "shinyOdds": 50, "spawnEvery": 10 } (only options from the Options screen, in their ranges)',
  spawns: 'how often wild Pokémon come, as a multiplier from 0 (never) to 20: { "25": 5, "type:dragon": 2 }',
  theme: 'Field Dex colours: { "name": "Ember", "colors": { "shell": "#a8322d", "lcd": "#f3e3c8" } }',
};

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, max) : '');

/** check one mod.json (already parsed). deps: { DEFAULTS, sanitize }. Returns { ok, mod, errors } */
function validate(raw, deps, folder) {
  const errors = [], err = (where, what) => errors.push(`${where}: ${what}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['mod.json: it must be one { ... } object'] };
  for (const k of Object.keys(raw)) if (!(k in FORMAT)) err(k, 'not something a mod can have (it can have: ' + Object.keys(FORMAT).join(', ') + ')');
  if (raw.format !== FORMAT_ID) err('format', `must be "${FORMAT_ID}"`);
  const mod = { id: '', name: '', version: '', author: '', description: '', settings: {}, spawns: {}, theme: null, folder: folder || '' };
  if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(raw.id)) err('id', FORMAT.id); else mod.id = raw.id;
  if (typeof raw.name !== 'string' || !clean(raw.name, 60)) err('name', 'a name is needed, ' + FORMAT.name); else mod.name = clean(raw.name, 60);
  for (const k of ['version', 'author', 'description']) {
    if (raw[k] === undefined) continue;
    const max = k === 'description' ? 400 : k === 'version' ? 20 : 60;
    if (typeof raw[k] !== 'string' || raw[k].length > max) err(k, FORMAT[k]); else mod[k] = clean(raw[k], max);
  }
  if (raw.settings !== undefined) {
    if (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) err('settings', FORMAT.settings);
    else {
      const keys = Object.keys(raw.settings);
      const tried = deps.sanitize(Object.assign({}, deps.DEFAULTS, raw.settings), 1080);
      for (const k of keys) {
        if (!(k in deps.DEFAULTS)) { err('settings.' + k, 'there is no such option'); continue; }
        if (BLOCKED.has(k)) { err('settings.' + k, 'a mod may not change this one (it is about your computer or your files)'); continue; }
        const v = raw.settings[k];
        if (typeof v !== typeof deps.DEFAULTS[k] && !(deps.DEFAULTS[k] === null || v === null)) { err('settings.' + k, `must be a ${Array.isArray(deps.DEFAULTS[k]) ? 'list' : typeof deps.DEFAULTS[k]}, like ${JSON.stringify(deps.DEFAULTS[k])}`); continue; }
        if (JSON.stringify(tried[k]) !== JSON.stringify(v)) { err('settings.' + k, `${JSON.stringify(v)} is not allowed (the nearest allowed is ${JSON.stringify(tried[k])})`); continue; }
        mod.settings[k] = v;
      }
    }
  }
  if (raw.spawns !== undefined) {
    if (!raw.spawns || typeof raw.spawns !== 'object' || Array.isArray(raw.spawns)) err('spawns', FORMAT.spawns);
    else {
      const keys = Object.keys(raw.spawns);
      if (keys.length > 1100) err('spawns', 'too many entries (1100 at most)');
      for (const k of keys.slice(0, 1100)) {
        const v = raw.spawns[k];
        const sp = /^\d{1,4}$/.test(k) ? +k : 0, type = /^type:([a-z]+)$/.exec(k);
        if (!(sp >= 1 && sp <= 1025) && !(type && TYPES.includes(type[1]))) { err('spawns.' + k, 'must be a Pokédex number from 1 to 1025, or "type:" and a type such as "type:fire"'); continue; }
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 20) { err('spawns.' + k, 'must be a number from 0 (never) to 20'); continue; }
        mod.spawns[sp ? String(sp) : 'type:' + type[1]] = Math.round(v * 100) / 100;
      }
    }
  }
  if (raw.theme !== undefined) {
    const t = raw.theme;
    if (!t || typeof t !== 'object' || Array.isArray(t) || !t.colors || typeof t.colors !== 'object' || Array.isArray(t.colors)) err('theme', FORMAT.theme);
    else {
      for (const k of Object.keys(t)) if (k !== 'name' && k !== 'colors') err('theme.' + k, 'a theme has only "name" and "colors"');
      const colors = {};
      for (const k of Object.keys(t.colors)) {
        const v = t.colors[k];
        if (!THEME_VARS.has(k)) { err('theme.colors.' + k, 'not one of the Field Dex colours (' + [...THEME_VARS].join(', ') + ')'); continue; }
        if (typeof v !== 'string' || !(TRIPLETS.has(k) ? TRIPLET : COLOR).test(v.trim())) { err('theme.colors.' + k, TRIPLETS.has(k) ? 'must be three numbers like "28, 40, 35"' : 'must be a colour like "#a8322d" or "rgb(168, 50, 45)"'); continue; }
        colors[k] = v.trim();
      }
      mod.theme = { name: clean(t.name, 40), colors };
    }
  }
  if (!Object.keys(mod.settings).length && !Object.keys(mod.spawns).length && !(mod.theme && Object.keys(mod.theme.colors).length) && !errors.length) err('mod.json', 'it changes nothing: give it "settings", "spawns" or a "theme"');
  return { ok: !errors.length, mod, errors };
}

function create(deps) {
  // deps: { modsDir: () => folder, userDir: () => folder, DEFAULTS, sanitize, getSettings, setSettings }
  const stateFile = () => path.join(deps.userDir(), 'mods.json');
  let state = { on: [], before: {} }, list = [];
  const readState = () => {
    try { const j = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); state = { on: Array.isArray(j.on) ? j.on.filter((x) => typeof x === 'string').slice(0, MAX_MODS) : [], before: j.before && typeof j.before === 'object' ? j.before : {} }; }
    catch (e) { state = { on: [], before: {} }; }
  };
  const writeState = () => { try { fs.mkdirSync(deps.userDir(), { recursive: true }); fs.writeFileSync(stateFile() + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(stateFile() + '.tmp', stateFile()); } catch (e) { /* kept in memory */ } };

  /** read the mods folder again */
  function scan() {
    const dir = deps.modsDir(), out = [];
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch (e) { names = []; }
    for (const folder of names.slice(0, MAX_MODS)) {
      const file = path.join(dir, folder, 'mod.json');
      let text = null;
      try { const st = fs.statSync(file); if (st.size > MAX_BYTES) { out.push({ folder, ok: false, errors: ['mod.json: larger than 64 KB'] }); continue; } text = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); }
      catch (e) { out.push({ folder, ok: false, errors: ['there is no mod.json in this folder'] }); continue; }
      let raw = null;
      try { raw = JSON.parse(text); } catch (e) { out.push({ folder, ok: false, errors: ['mod.json is not valid JSON: ' + String(e.message).slice(0, 160)] }); continue; }
      const v = validate(raw, deps, folder);
      out.push(Object.assign({ folder }, v));
    }
    const seen = new Set();
    for (const m of out) if (m.ok) { if (seen.has(m.mod.id)) { m.ok = false; m.errors = ['id: another mod already has the id "' + m.mod.id + '"']; } seen.add(m.mod.id); }
    list = out;
    return out;
  }
  const good = () => list.filter((m) => m.ok);
  const isOn = (id) => state.on.includes(id);
  const onMods = () => good().filter((m) => isOn(m.mod.id)).sort((a, b) => state.on.indexOf(a.mod.id) - state.on.indexOf(b.mod.id));      // (in the order they were switched on: the later one wins)

  /** put the settings as the mods that are on say (rule 3: what no mod sets any more goes back to what it was) */
  function applySettings() {
    const cur = deps.getSettings(), want = {}, wanted = new Set();
    for (const m of onMods()) for (const k of Object.keys(m.mod.settings)) { wanted.add(k); want[k] = m.mod.settings[k]; if (!(k in state.before)) state.before[k] = cur[k]; }
    for (const k of Object.keys(state.before)) if (!wanted.has(k)) { if (k in deps.DEFAULTS) want[k] = state.before[k]; delete state.before[k]; }
    writeState();
    const patch = {};
    for (const k of Object.keys(want)) if (JSON.stringify(cur[k]) !== JSON.stringify(want[k])) patch[k] = want[k];
    if (Object.keys(patch).length) deps.setSettings(patch);
  }
  /** what the game pages need: spawn multipliers and Field Dex colours of the mods that are on */
  function effects() {
    const spawns = {}, colors = {}, names = [];
    for (const m of onMods()) {
      names.push(m.mod.name);
      for (const k of Object.keys(m.mod.spawns)) spawns[k] = (spawns[k] === undefined ? 1 : spawns[k]) * m.mod.spawns[k];
      if (m.mod.theme) Object.assign(colors, m.mod.theme.colors);
    }
    return { on: names, spawns, colors };
  }
  function view() {
    return { dir: deps.modsDir(), format: FORMAT_ID, mods: list.map((m) => ({ folder: m.folder, ok: m.ok, errors: (m.errors || []).slice(0, 12), on: !!(m.ok && isOn(m.mod.id)),
      id: m.mod ? m.mod.id : '', name: m.mod ? m.mod.name || m.folder : m.folder, version: m.mod ? m.mod.version : '', author: m.mod ? m.mod.author : '', description: m.mod ? m.mod.description : '',
      changes: m.ok ? [Object.keys(m.mod.settings).length ? Object.keys(m.mod.settings).length + ' option(s)' : '', Object.keys(m.mod.spawns).length ? Object.keys(m.mod.spawns).length + ' spawn rate(s)' : '', m.mod.theme ? 'Field Dex colours' : ''].filter(Boolean).join(', ') : '' })) };
  }
  /** start: read the state and the folder; a mod that is on but gone or broken now is switched off (rule 3) */
  function init(o = {}) {
    readState(); scan();
    if (o.allOff) state.on = [];
    const okIds = new Set(good().map((m) => m.mod.id));
    state.on = state.on.filter((id) => okIds.has(id));
    applySettings();
  }
  function refresh() { scan(); const okIds = new Set(good().map((m) => m.mod.id)); const before = state.on.length; state.on = state.on.filter((id) => okIds.has(id)); if (state.on.length !== before) applySettings(); else writeState(); return view(); }
  function set(id, on) {
    const m = good().find((x) => x.mod.id === id);
    if (!m) return Object.assign(view(), { error: 'That mod is not there, or it has a mistake.' });
    state.on = state.on.filter((x) => x !== id); if (on) state.on.push(id);
    applySettings();
    return view();
  }
  function allOff() { state.on = []; applySettings(); return view(); }
  return { init, scan, refresh, set, allOff, view, effects, count: () => state.on.length };
}

/** the note for people who write mods, written into the mods folder the first time it is opened */
function readme() {
  return [
    'SCREEN TRAINER MODS',
    '===================',
    '',
    'A mod is a folder in here with one file in it, mod.json. Screen Trainer reads the folders when it starts and when',
    'you press "look again" (Pokédex > options > Mods and forks). Every mod is off until you switch it on there, and',
    'switching it off puts back everything it changed. A mod with a mistake is not used; the Options screen says what',
    'the mistake is. A mod is data only: nothing in it is ever run.',
    '',
    'mod.json looks like this (only "format", "id" and "name" are needed, plus at least one change):',
    '',
    '{',
    `  "format": "${FORMAT_ID}",`,
    '  "id": "shiny-hunt",',
    '  "name": "Shiny hunt",',
    '  "version": "1.0",',
    '  "author": "Your name",',
    '  "description": "Shinies 1 in 20, wild Pokemon twice as often, more Eevee and Dragon types.",',
    '  "settings": { "shinyOdds": 20, "spawnEvery": 12 },',
    '  "spawns": { "133": 5, "type:dragon": 2 },',
    '  "theme": { "name": "Ember", "colors": { "shell": "#a8322d", "shell-hi": "#d0594d", "shell-lo": "#6e1d1a", "lcd": "#f3e3c8" } }',
    '}',
    '',
    'WHAT EACH PART DOES',
    ...Object.keys(FORMAT).map((k) => `  ${k.padEnd(12)} ${FORMAT[k]}`),
    '',
    'settings  The names are the ones in settings.json (%APPDATA%\\Screen Trainer). Values must be in the same range',
    '          the Options screen allows. These cannot be changed by a mod: ' + [...BLOCKED].join(', ') + '.',
    'spawns    1 is as usual, 2 twice as likely, 0.5 half, 0 never. A number is a Pokedex number; "type:" and one of',
    '          ' + TYPES.join(', ') + ' changes every Pokemon of that type. Two mods multiply.',
    'theme     Field Dex colours: ' + [...THEME_VARS].join(', ') + '. "tint" and "glaze" are three numbers "r, g, b";',
    '          the others are colours like "#a8322d" or "rgb(168, 50, 45)". The last mod switched on wins.',
    '',
    'Something went wrong? Pokedex > options > Mods and forks > "All mods off", or start Screen Trainer with --no-mods.',
    'To try bigger changes to the program itself without danger, make a fork there instead.',
    '',
  ].join('\r\n');
}

module.exports = { create, validate, readme, FORMAT_ID, BLOCKED, THEME_VARS };
