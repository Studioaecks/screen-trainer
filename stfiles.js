// Screen Trainer — its own two kinds of file (0.9.8), main process only.
//
//   .stsave   a saved game (owner's list 11-16, update 19): the whole save, a few kilobytes. Made from Options > Save
//             data, loaded from there (and offered after "Reset save" and on a fresh install).
//   .unown    a note written in the Unown Notepad (update 17): the text as typed, readable only by Screen Trainer's
//             notepad, which shows it in Living Unown. Optionally locked with a word.
//
// Both: a short header that says what the file is, then the content as JSON, squeezed (deflate) and sealed with
// AES-256-GCM. The key is made from a key inside the program and a fresh random salt for every file, plus the word for a
// locked note. So no other program can read or change one (a changed byte and the file is refused), and a locked note
// cannot be read without its word, even by Screen Trainer. An unlocked one can be read by anybody who has Screen
// Trainer: the program's own key is in its source, which is how "only Screen Trainer can read it" works.
// Nothing here ever goes online; files are only written where the owner chooses.
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');

const APP_KEY = 'Screen Trainer files, 0.9.8: 6f1c9d2a8b47e05c3a91d7f2b6e48c05a3d9f17e2b8c64a0';
const KINDS = {
  save: { magic: 'STSAVE1\n', ext: 'stsave', name: 'Screen Trainer saved game', max: 20e6 },
  note: { magic: 'UNOWN01\n', ext: 'unown', name: 'Unown note', max: 2e6 },
};
const SALT = 16, IV = 12, TAG = 16;

function keyFor(kind, salt, word) { return crypto.scryptSync(`${APP_KEY}\0${kind}\0${word || ''}`, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }
/** obj -> the bytes of a file of that kind. word (optional): lock it */
function pack(kind, obj, word) {
  const k = KINDS[kind];
  if (!k) throw new Error('unknown kind');
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  if (json.length > k.max) throw new Error('too large');
  const body = zlib.deflateRawSync(json, { level: 9 }), salt = crypto.randomBytes(SALT), iv = crypto.randomBytes(IV), locked = typeof word === 'string' && word.length > 0;
  const c = crypto.createCipheriv('aes-256-gcm', keyFor(kind, salt, locked ? word : ''), iv);
  const flags = Buffer.from([locked ? 1 : 0]);
  c.setAAD(Buffer.concat([Buffer.from(k.magic, 'latin1'), flags]));
  const enc = Buffer.concat([c.update(body), c.final()]);
  return Buffer.concat([Buffer.from(k.magic, 'latin1'), flags, salt, iv, c.getAuthTag(), enc]);
}
/** what kind of file these bytes are ('save', 'note' or ''), and whether it is locked */
function kindOf(buf) {
  if (!Buffer.isBuffer(buf)) return { kind: '', locked: false };
  for (const [kind, k] of Object.entries(KINDS)) if (buf.length > k.magic.length + 1 + SALT + IV + TAG && buf.toString('latin1', 0, k.magic.length) === k.magic) return { kind, locked: buf[k.magic.length] === 1 };
  return { kind: '', locked: false };
}
/** the bytes of a file -> { ok: true, obj } or { ok: false, why: 'not' (not this kind) | 'word' (locked: no word, or the
 *  wrong one) | 'broken' (changed or damaged) } */
function unpack(kind, buf, word) {
  const k = KINDS[kind], what = kindOf(buf);
  if (!k || what.kind !== kind) return { ok: false, why: 'not' };
  if (what.locked && !(typeof word === 'string' && word.length)) return { ok: false, why: 'word', locked: true };
  let at = k.magic.length;
  const flags = buf.subarray(at, at + 1); at += 1;
  const salt = buf.subarray(at, at + SALT); at += SALT;
  const iv = buf.subarray(at, at + IV); at += IV;
  const tag = buf.subarray(at, at + TAG); at += TAG;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyFor(kind, salt, what.locked ? word : ''), iv);
    d.setAAD(Buffer.concat([Buffer.from(k.magic, 'latin1'), flags]));
    d.setAuthTag(tag);
    const body = Buffer.concat([d.update(buf.subarray(at)), d.final()]);
    const json = zlib.inflateRawSync(body, { maxOutputLength: k.max });
    return { ok: true, obj: JSON.parse(json.toString('utf8')), locked: what.locked };
  } catch (e) { return { ok: false, why: what.locked ? 'word' : 'broken', locked: what.locked }; }
}

// ---------------------------------------------------------------- saved games
/** a save (the text of save.json) as a file */
function packSave(saveText, version) {
  const save = JSON.parse(saveText);                       // (refuses what is not a save to begin with)
  if (!save || typeof save !== 'object' || !Array.isArray(save.team)) throw new Error('not a save');
  return pack('save', { v: 1, app: String(version || ''), at: new Date().toISOString(), save });
}
/** a file -> { ok, save (object), app, at, summary } or { ok: false, why } */
function readSave(buf) {
  const r = unpack('save', buf);
  if (!r.ok) return r;
  const o = r.obj, s = o && o.save;
  if (!s || typeof s !== 'object' || !Array.isArray(s.team) || !Array.isArray(s.box || [])) return { ok: false, why: 'broken' };
  return { ok: true, save: s, app: String(o.app || ''), at: String(o.at || ''), summary: summary(s) };
}
/** what the owner is shown before loading */
function summary(s) {
  const caught = s.dex && s.dex.caught && typeof s.dex.caught === 'object' ? Object.keys(s.dex.caught).length : 0;
  return { team: s.team.length, box: Array.isArray(s.box) ? s.box.length : 0, species: caught, catches: (s.stats && s.stats.caught) | 0, badges: s.badges && typeof s.badges === 'object' ? Object.keys(s.badges).length : 0, started: Number(s.started) || 0,
    lead: s.team[0] && Number.isInteger(s.team[0].sp) ? { sp: s.team[0].sp, lvl: s.team[0].lvl | 0, nick: typeof s.team[0].nick === 'string' ? s.team[0].nick.slice(0, 12) : '' } : null };
}

// ---------------------------------------------------------------- notes
const packNote = (text, version, word) => pack('note', { v: 1, app: String(version || ''), at: new Date().toISOString(), text: String(text).slice(0, KINDS.note.max / 2) }, word);
function readNote(buf, word) {
  const r = unpack('note', buf, word);
  if (!r.ok) return r;
  return typeof r.obj.text === 'string' ? { ok: true, text: r.obj.text, at: String(r.obj.at || ''), locked: r.locked } : { ok: false, why: 'broken' };
}
/** the first file of ours named on a command line (Windows "Open with" hands the file as an argument), or '' */
function fileArg(argv) {
  for (const a of (argv || []).slice(1)) if (typeof a === 'string' && !a.startsWith('-') && /\.(unown|stsave)$/i.test(a)) return a;
  return '';
}

module.exports = { KINDS, pack, unpack, kindOf, packSave, readSave, summary, packNote, readNote, fileArg };
