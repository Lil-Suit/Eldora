// =============================================================
// ELDORIA — servidor de multiplayer (sem dependências)
// Serve o jogo (index.html e arquivos) e uma sala em tempo real por WebSocket em /ws.
// Todos que abrirem o mesmo endereço entram no mesmo mundo e se veem.
// Uso: node server/server.js   (porta: variável PORT, padrão 10000)
// =============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
// o jogo pode estar em docs/ (projeto completo) ou na raiz (só os arquivos do site)
const ROOT = [path.join(REPO, 'docs'), REPO].find((d) => fs.existsSync(path.join(d, 'index.html'))) || REPO;
const PORT = +process.env.PORT || 10000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css' };
const BLOCK = /(^|\/)(\.|server\/|src\/|tools\/|test\/|node_modules\/|package)/;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok ' + peers.size); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || BLOCK.test(path.relative(ROOT, file).replace(/\\/g, '/'))) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': p.endsWith('index.html') || p.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600' });
    res.end(buf);
  });
});

// ---------------- WebSocket mínimo (RFC 6455, só texto) ----------------
const peers = new Map(); // id -> { sock, presence, updatedAt, buf, alive, rate }
let seq = 0;

server.on('upgrade', (req, sock) => {
  if (!(req.url || '').startsWith('/ws') || (req.headers.upgrade || '').toLowerCase() !== 'websocket') return sock.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const id = 'p' + (++seq).toString(36) + crypto.randomBytes(3).toString('hex');
  const peer = { id, sock, presence: {}, updatedAt: Date.now(), buf: Buffer.alloc(0), alive: true, rate: { t: Date.now(), n: 0 } };
  peers.set(id, peer);
  send(peer, { t: 'hello', peer: id });
  peersChanged();
  sock.on('data', (chunk) => onData(peer, chunk));
  sock.on('close', () => drop(peer));
  sock.on('error', () => drop(peer));
});

function drop(peer) {
  if (!peers.has(peer.id)) return;
  peers.delete(peer.id);
  try { peer.sock.destroy(); } catch { /* já fechado */ }
  peersChanged();
}

function frame(text, op = 1) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])]);
  return Buffer.concat([head, data]);
}
function send(peer, obj) { try { if (!peer.sock.destroyed) peer.sock.write(frame(JSON.stringify(obj))); } catch { /* ignora */ } }
function broadcast(obj) { const f = frame(JSON.stringify(obj)); for (const p of peers.values()) { try { if (!p.sock.destroyed) p.sock.write(f); } catch { /* ignora */ } } }

function onData(peer, chunk) {
  peer.buf = Buffer.concat([peer.buf, chunk]);
  if (peer.buf.length > 1 << 20) return drop(peer);
  for (;;) {
    const b = peer.buf;
    if (b.length < 2) return;
    const op = b[0] & 15, masked = b[1] & 128;
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 64 * 1024) return drop(peer);
    const need = off + (masked ? 4 : 0) + len;
    if (b.length < need) return;
    let payload = b.subarray(off + (masked ? 4 : 0), need);
    if (masked) { const m = b.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
    peer.buf = b.subarray(need);
    if (op === 8) return drop(peer);
    if (op === 9) { try { peer.sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch { /* ok */ } continue; }
    if (op === 10) { peer.alive = true; continue; }
    if (op === 1) onMessage(peer, payload.toString('utf8'));
  }
}

const TOPICS = new Set(['chat', 'fx', 'mob']);
function onMessage(peer, text) {
  peer.alive = true;
  const now = Date.now();
  if (now - peer.rate.t > 1000) { peer.rate.t = now; peer.rate.n = 0; }
  if (++peer.rate.n > 120) return; // limite de mensagens por segundo
  let m; try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'pres' && m.p && typeof m.p === 'object') {
    peer.presence = m.p; peer.updatedAt = now;
    return peersChanged();
  }
  if (m.t === 'emit' && TOPICS.has(m.topic)) {
    broadcast({ t: 'msg', topic: m.topic, peer: peer.id, data: m.data ?? null });
  }
  if (m.t === 'ping') send(peer, { t: 'pong', at: m.at });
}

// lista de jogadores: enviada no máximo a cada 50 ms (posições chegam quase em tempo real)
let pending = null;
function peersChanged() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const list = [...peers.values()].map((p) => ({ peer: p.id, presence: p.presence, updatedAt: p.updatedAt }));
    broadcast({ t: 'peers', peers: list });
  }, 50);
}

// derruba conexões mortas
setInterval(() => {
  for (const p of peers.values()) {
    if (!p.alive) { drop(p); continue; }
    p.alive = false;
    try { p.sock.write(Buffer.from([0x89, 0])); } catch { drop(p); }
  }
}, 25000);

server.listen(PORT, () => console.log(`ELDORIA online na porta ${PORT} · servindo ${ROOT}`));
