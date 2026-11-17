// Screen Trainer — a stand-in message board for the checks: a web socket server that speaks just enough MQTT
// (connect, subscribe, publish at QoS 0, ping). tools/onlinecheck.js runs online visiting against it, so the checks
// never talk to a public board. Not part of the program: nothing loads this but the checks.
'use strict';
const http = require('http');
const crypto = require('crypto');
const { parse, P } = require('../onlinenet.js');

const frame = (payload) => {                     // one unmasked binary frame from the server
  const n = payload.length, head = n < 126 ? Buffer.from([0x82, n]) : n < 65536 ? Buffer.from([0x82, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x82, 127]), Buffer.from([0, 0, 0, 0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])]);
  return Buffer.concat([head, payload]);
};
const matches = (filter, topic) => filter === topic || filter === '#' || (filter.endsWith('/#') && topic.startsWith(filter.slice(0, -1)));

/** start a board on a free port: { url, close(), notes: every note that went through (topic, text), clients() } */
function start() {
  return new Promise((resolve) => {
    const clients = new Set(), notes = [];
    const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    server.on('upgrade', (req, sock) => {
      const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n`);
      const c = { sock, subs: new Set(), wire: Buffer.alloc(0), mqtt: Buffer.alloc(0) };
      clients.add(c);
      const out = (b) => { try { sock.write(frame(b)); } catch (e) { /* gone */ } };
      sock.on('data', (d) => {
        c.wire = Buffer.concat([c.wire, d]);
        for (;;) {                                           // web socket frames from the client (masked)
          if (c.wire.length < 2) break;
          const op = c.wire[0] & 15; let len = c.wire[1] & 127, at = 2;
          if (len === 126) { if (c.wire.length < 4) break; len = c.wire.readUInt16BE(2); at = 4; } else if (len === 127) { if (c.wire.length < 10) break; len = Number(c.wire.readBigUInt64BE(2)); at = 10; }
          const masked = !!(c.wire[1] & 128); if (c.wire.length < at + (masked ? 4 : 0) + len) break;
          const mask = masked ? c.wire.subarray(at, at + 4) : null; at += masked ? 4 : 0;
          const body = Buffer.from(c.wire.subarray(at, at + len)); if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
          c.wire = c.wire.subarray(at + len);
          if (op === 8) { sock.end(); return; }
          if (op === 9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, body.length]), body])); } catch (e) { /* gone */ } continue; }
          if (op !== 2 && op !== 0 && op !== 1) continue;
          c.mqtt = Buffer.concat([c.mqtt, body]);
          let r; try { r = parse(c.mqtt); } catch (e) { sock.destroy(); return; }
          c.mqtt = r[1];
          for (const p of r[0]) {
            if (p.type === 1) out(Buffer.from([0x20, 2, 0, 0]));
            else if (p.type === 8) { let i = 2; const codes = []; while (i + 2 <= p.body.length) { const n = (p.body[i] << 8) | p.body[i + 1]; c.subs.add(p.body.subarray(i + 2, i + 2 + n).toString('utf8')); i += 2 + n + 1; codes.push(0); } out(Buffer.concat([Buffer.from([0x90, 2 + codes.length, p.body[0], p.body[1]]), Buffer.from(codes)])); }
            else if (p.type === 10) { let i = 2; while (i + 2 <= p.body.length) { const n = (p.body[i] << 8) | p.body[i + 1]; c.subs.delete(p.body.subarray(i + 2, i + 2 + n).toString('utf8')); i += 2 + n; } out(Buffer.from([0xb0, 2, p.body[0], p.body[1]])); }
            else if (p.type === 12) out(Buffer.from([0xd0, 0]));
            else if (p.type === 3) {
              const n = (p.body[0] << 8) | p.body[1], topic = p.body.subarray(2, 2 + n).toString('utf8'), payload = p.body.subarray(2 + n);
              notes.push({ topic, text: payload.toString('utf8') });
              for (const o of clients) if ([...o.subs].some((f) => matches(f, topic))) { try { o.sock.write(frame(P.publish(topic, payload))); } catch (e) { /* gone */ } }
            }
          }
        }
      });
      const gone = () => clients.delete(c);
      sock.on('close', gone); sock.on('error', gone);
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `ws://127.0.0.1:${server.address().port}/mqtt`, port: server.address().port, notes, clients: () => clients.size, close: () => new Promise((r) => { for (const c of clients) { try { c.sock.destroy(); } catch (e) { /* gone */ } } server.close(() => r()); }) }));
  });
}
module.exports = { start };
if (require.main === module) start().then((b) => console.log(b.url));
