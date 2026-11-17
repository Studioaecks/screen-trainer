// Screen Trainer — a zip writer for big folders (1.0), used by the Escape Rope (escaperope.js) and the fork maker.
//
// shareexport.js packs the small empty copy in memory with the classic zip format. The Escape Rope packs a whole
// Screen Trainer folder with the owner's sprites, sounds, backups and recordings in it: tens of thousands of files and
// easily more than 4 GB. So this writer:
//   - streams every file in pieces (nothing is held in memory whole, however large it is);
//   - writes ZIP64 records when a file, an offset or the number of files is beyond what the classic format holds
//     (Windows' own Explorer, 7-Zip and every other current unzipper read them);
//   - stores pictures, sounds and other already-packed files as they are and deflates the rest;
//   - writes to "<file>.part" and renames it only when everything is in, so a cancelled or failed run leaves no
//     half zip that looks whole.
// It only reads the files it is handed and writes the one zip file. It never changes, moves or deletes anything else.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const STORED = /\.(png|gif|jpg|jpeg|webp|zip|7z|rar|gz|ttf|woff2?|mp3|mp4|m4a|ogg|webm|mkv|stbank|stsave|unown|apk|aab|exe|dll|pak|bin|dat)$/i;
const CHUNK = 1 << 20;            // read 1 MB at a time
const BIG = 0xffffffff;

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crcUpdate(c, buf) { for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c; }
const crcDone = (c) => (c ^ 0xffffffff) >>> 0;

function dosStamp(d) {
  const y = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }

/**
 * Write a zip.
 * items: [{ name: 'Folder/file.txt', file: 'C:\\...\\file.txt' } or { name, data: Buffer }]  (names use forward slashes)
 * o: { onProgress({ done, of, bytes, ofBytes, name }), cancelled() -> true to stop, level (deflate level, default 6) }
 * Returns { ok, file, files, bytes, skipped: [{ name, why }] } or { ok: false, error, cancelled }.
 * A file that can no longer be read (gone, locked by another program) is left out and listed in `skipped`.
 */
async function write(outFile, items, o = {}) {
  const tmp = outFile + '.part', central = [], skipped = [];
  let fd = null, offset = 0, done = 0, doneBytes = 0;
  const ofBytes = items.reduce((s, it) => s + (it.size || (it.data ? it.data.length : 0)), 0);
  const put = (b) => { const at = offset; offset += b.length; return new Promise((res, rej) => fs.write(fd, b, 0, b.length, at, (err) => (err ? rej(err) : res()))); };      // (always at an explicit place: the headers are filled in afterwards at theirs)
  const level = o.level === undefined ? 6 : o.level;
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fd = fs.openSync(tmp, 'w');
    for (const it of items) {
      if (o.cancelled && o.cancelled()) throw Object.assign(new Error('cancelled'), { cancelled: true });
      const r = await one(it);
      if (r) skipped.push(r);
      done++;
      if (o.onProgress) o.onProgress({ done, of: items.length, bytes: doneBytes, ofBytes, name: it.name });
    }
    // the central directory
    const cdStart = offset;
    for (const c of central) {
      const extra = [];
      if (c.usize >= BIG) extra.push(u64(c.usize));
      if (c.csize >= BIG) extra.push(u64(c.csize));
      if (c.offset >= BIG) extra.push(u64(c.offset));
      const ex = extra.length ? Buffer.concat([Buffer.from([0x01, 0x00]), (() => { const b = Buffer.alloc(2); b.writeUInt16LE(extra.length * 8); return b; })(), ...extra]) : Buffer.alloc(0);
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(extra.length ? 45 : 20, 4); h.writeUInt16LE(extra.length ? 45 : 20, 6); h.writeUInt16LE(c.flags, 8); h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(Math.min(c.csize, BIG), 20); h.writeUInt32LE(Math.min(c.usize, BIG), 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt16LE(ex.length, 30);
      h.writeUInt32LE(c.dir ? 0x10 : 0, 38); h.writeUInt32LE(Math.min(c.offset, BIG), 42);
      await put(h); await put(c.name); if (ex.length) await put(ex);
    }
    const cdSize = offset - cdStart;
    const needs64 = central.length >= 0xffff || cdStart >= BIG || cdSize >= BIG;
    if (needs64) {
      const z = Buffer.alloc(56), here = offset;
      z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14);
      z.writeBigUInt64LE(BigInt(central.length), 24); z.writeBigUInt64LE(BigInt(central.length), 32); z.writeBigUInt64LE(BigInt(cdSize), 40); z.writeBigUInt64LE(BigInt(cdStart), 48);
      await put(z);
      const l = Buffer.alloc(20);
      l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(here), 8); l.writeUInt32LE(1, 16);
      await put(l);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Math.min(central.length, 0xffff), 8); end.writeUInt16LE(Math.min(central.length, 0xffff), 10);
    end.writeUInt32LE(Math.min(cdSize, BIG), 12); end.writeUInt32LE(Math.min(cdStart, BIG), 16);
    await put(end);
    fs.closeSync(fd); fd = null;
    try { fs.unlinkSync(outFile); } catch (e) { /* there was none */ }
    fs.renameSync(tmp, outFile);
    return { ok: true, file: outFile, files: central.length, bytes: offset, skipped };
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (err) { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch (err) { /* nothing was written */ }
    return { ok: false, error: String((e && e.message) || e), cancelled: !!(e && e.cancelled) };
  }

  /** one entry: the local header (with room for ZIP64 sizes), the data, then the real sizes and CRC written into the header */
  async function one(it) {
    const isDir = /\/$/.test(it.name);
    const name = Buffer.from(it.name, 'utf8'), flags = /[^\x20-\x7e]/.test(it.name) ? 0x0800 : 0;
    let mtime = new Date(), size = 0, rfd = null;
    if (!isDir && !it.data) {
      try { rfd = fs.openSync(it.file, 'r'); const st = fs.fstatSync(rfd); size = st.size; mtime = st.mtime; }
      catch (e) { if (rfd !== null) { try { fs.closeSync(rfd); } catch (err) { /* */ } } return { name: it.name, why: e.code || e.message }; }
    } else if (it.data) size = it.data.length;
    const stamp = dosStamp(mtime);
    const method = isDir || size < 64 || STORED.test(it.name) ? 0 : 8;
    const big = size >= BIG - 1024 * 1024;            // (deflate can grow a little: room for ZIP64 sizes when it is near the line)
    const at = offset, h = Buffer.alloc(30);
    const ex = big ? Buffer.concat([Buffer.from([0x01, 0x00, 16, 0]), Buffer.alloc(16)]) : Buffer.alloc(0);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(big ? 45 : 20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(stamp.time, 10); h.writeUInt16LE(stamp.date, 12);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(ex.length, 28);
    await put(h); await put(name); if (ex.length) await put(ex);
    let crc = 0xffffffff, usize = 0, csize = 0;
    const defl = method === 8 ? zlib.createDeflateRaw({ level }) : null, outParts = [];
    if (defl) defl.on('data', (b) => outParts.push(b));
    const flushOut = async () => { while (outParts.length) { const b = outParts.shift(); csize += b.length; await put(b); } };
    const feed = async (b) => {
      crc = crcUpdate(crc, b); usize += b.length; doneBytes += b.length;
      if (!defl) { csize += b.length; await put(b); return; }
      await new Promise((res) => defl.write(b, res));
      await flushOut();
    };
    try {
      if (it.data) await feed(it.data);
      else if (!isDir) {
        const buf = Buffer.alloc(CHUNK);
        for (;;) {
          const n = await new Promise((res, rej) => fs.read(rfd, buf, 0, CHUNK, null, (err, got) => (err ? rej(err) : res(got))));
          if (!n) break;
          await feed(Buffer.from(buf.subarray(0, n)));
          if (o.cancelled && o.cancelled()) throw Object.assign(new Error('cancelled'), { cancelled: true });
        }
      }
      if (defl) { await new Promise((res) => defl.end(res)); await new Promise((res) => (defl.readableEnded ? res() : defl.on('end', res))); await flushOut(); }
    } finally { if (rfd !== null) { try { fs.closeSync(rfd); } catch (e) { /* */ } } }
    crc = crcDone(crc);
    // fill in the header now that crc and sizes are known
    const fix = Buffer.alloc(12);
    fix.writeUInt32LE(crc, 0); fix.writeUInt32LE(big ? BIG : csize, 4); fix.writeUInt32LE(big ? BIG : usize, 8);
    await new Promise((res, rej) => fs.write(fd, fix, 0, 12, at + 14, (err) => (err ? rej(err) : res())));
    if (big) { const z = Buffer.concat([u64(usize), u64(csize)]); await new Promise((res, rej) => fs.write(fd, z, 0, 16, at + 30 + name.length + 4, (err) => (err ? rej(err) : res()))); }
    else if (csize >= BIG || usize >= BIG) throw new Error(`${it.name} grew past 4 GB while it was packed`);
    central.push({ name, flags, method, crc, csize, usize, offset: at, time: stamp.time, date: stamp.date, dir: isDir });
    return null;
  }
}

/** every file under a folder, as zip items under a top folder name. skip(rel, isDir) -> true leaves a path out. Links are not followed. */
function collect(root, top, skip) {
  const out = [];
  const walk = (dir, rel) => {
    let list = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    let any = false;
    for (const d of list) {
      const r = rel ? rel + '/' + d.name : d.name, full = path.join(dir, d.name);
      if (d.isSymbolicLink()) continue;
      if (skip && skip(r, d.isDirectory())) continue;
      if (d.isDirectory()) { any = true; walk(full, r); }
      else if (d.isFile()) { any = true; let size = 0; try { size = fs.statSync(full).size; } catch (e) { continue; } out.push({ name: (top ? top + '/' : '') + r, file: full, size }); }
    }
    if (!any && rel) out.push({ name: (top ? top + '/' : '') + rel + '/', size: 0 });      // an empty folder is kept as a folder
  };
  walk(root, '');
  return out;
}

module.exports = { write, collect, STORED };
