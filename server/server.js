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
const VERSION = '0.9.14';

// ---------- contas e personagens salvos (antes em store.js; agora tudo neste arquivo) ----------
// Contas e personagens salvos no servidor.
// Com a variável DATABASE_URL (Postgres: Neon, Supabase, Render...) os saves ficam guardados para sempre.
// Sem ela, guarda num arquivo (server/data.json), que some quando o Render reinicia: serve só para testes.


async function openStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const { default: pg } = await import('pg');
      const local = /localhost|127\.0\.0\.1|\/var\/run|host=\//.test(url);
      const pool = new pg.Pool({ connectionString: url, max: 4, ssl: local ? false : { rejectUnauthorized: false }, idleTimeoutMillis: 20000 });
      await pool.query(`CREATE TABLE IF NOT EXISTS eldoria_users (name TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, token TEXT NOT NULL, created BIGINT NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS eldoria_docs (owner TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY (owner, id))`);
      await pool.query(`CREATE INDEX IF NOT EXISTS eldoria_users_token ON eldoria_users (token)`);
      await pool.query(`ALTER TABLE eldoria_users ADD COLUMN IF NOT EXISTS email TEXT`);
      await pool.query(`ALTER TABLE eldoria_users ADD COLUMN IF NOT EXISTS nick TEXT`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS eldoria_users_email ON eldoria_users (email)`);
      console.log('Saves: banco de dados Postgres conectado');
      return {
        kind: 'postgres',
        async getUser(name) { const r = await pool.query('SELECT * FROM eldoria_users WHERE name=$1', [name]); return r.rows[0] || null; },
        async userByToken(token) { const r = await pool.query('SELECT name FROM eldoria_users WHERE token=$1', [token]); return r.rows[0]?.name || null; },
        async addUser(u) { await pool.query('INSERT INTO eldoria_users (name, salt, hash, token, created, email, nick) VALUES ($1,$2,$3,$4,$5,$6,$7)', [u.name, u.salt, u.hash, u.token, Date.now(), u.email || null, u.nick || u.name]); },
        async userByEmail(email) { const r = await pool.query('SELECT * FROM eldoria_users WHERE email=$1', [email]); return r.rows[0] || null; },
        async setEmail(name, email) { await pool.query('UPDATE eldoria_users SET email=$2 WHERE name=$1', [name, email]); },
        async listDocs(owner) { const r = await pool.query('SELECT id, data FROM eldoria_docs WHERE owner=$1', [owner]); return r.rows.map((x) => ({ id: x.id, data: JSON.parse(x.data) })); },
        async getDoc(owner, id) { const r = await pool.query('SELECT data FROM eldoria_docs WHERE owner=$1 AND id=$2', [owner, id]); return r.rows[0] ? JSON.parse(r.rows[0].data) : null; },
        async setDoc(owner, id, data) { await pool.query('INSERT INTO eldoria_docs (owner, id, data, updated) VALUES ($1,$2,$3,$4) ON CONFLICT (owner, id) DO UPDATE SET data=EXCLUDED.data, updated=EXCLUDED.updated', [owner, id, JSON.stringify(data), Date.now()]); },
        async delDoc(owner, id) { await pool.query('DELETE FROM eldoria_docs WHERE owner=$1 AND id=$2', [owner, id]); },
      };
    } catch (e) {
      console.error('Saves: não consegui usar o DATABASE_URL (' + (e?.message || e) + '). Usando arquivo temporário.');
    }
  }
  // arquivo local (temporário no Render grátis)
  const file = process.env.SAVE_FILE || path.join(HERE, 'data.json');
  let db = { users: {}, docs: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* novo */ }
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(db)); } catch (e) { console.error('Saves: erro ao gravar arquivo', e?.message); } }, 300); };
  console.log('Saves: SEM banco de dados (DATABASE_URL vazio) — usando arquivo ' + file + ' (apaga quando o servidor reinicia)');
  return {
    kind: 'arquivo',
    async getUser(name) { return db.users[name] || null; },
    async userByToken(token) { for (const u of Object.values(db.users)) if (u.token === token) return u.name; return null; },
    async addUser(u) { db.users[u.name] = { ...u, created: Date.now() }; flush(); },
    async userByEmail(email) { return Object.values(db.users).find((u) => u.email === email) || null; },
    async setEmail(name, email) { if (db.users[name]) { db.users[name].email = email; flush(); } },
    async listDocs(owner) { return Object.entries(db.docs[owner] || {}).map(([id, data]) => ({ id, data })); },
    async getDoc(owner, id) { return db.docs[owner]?.[id] || null; },
    async setDoc(owner, id, data) { (db.docs[owner] ||= {})[id] = data; flush(); },
    async delDoc(owner, id) { if (db.docs[owner]) { delete db.docs[owner][id]; flush(); } },
  };
}

function hashPass(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
  return { salt, hash };
}
function checkPass(pass, salt, hash) {
  const h = crypto.scryptSync(pass, salt, 32);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(h, ref);
}
const newToken = () => crypto.randomBytes(24).toString('hex');

const REPO = path.resolve(HERE, '..');
// o jogo pode estar em docs/ (projeto completo) ou na raiz (só os arquivos do site)
const ROOT = [path.join(REPO, 'docs'), REPO].find((d) => fs.existsSync(path.join(d, 'index.html'))) || REPO;
const PORT = +process.env.PORT || 10000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css' };
const BLOCK = /(^|\/)(\.|server\/|src\/|tools\/|test\/|node_modules\/|package)/;
const store = await openStore();

// ---------------- contas e saves (HTTP /api) ----------------
const NAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
const DOC_RE = /^[A-Za-z0-9_-]{1,64}$/;
const tries = new Map(); // limite de tentativas de login por IP
const GOOGLE_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
// confere o token do Google direto com o Google (sem bibliotecas)
async function verifyGoogle(idToken) {
  if (!idToken || idToken.length > 4096) return null;
  if (process.env.ELDORIA_TEST_GOOGLE === '1' && idToken.startsWith('test:')) return { email: idToken.slice(5), sub: idToken }; // só para testes locais
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const j = await r.json();
    if (j.aud !== GOOGLE_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(j.iss)) return null;
    if (!(j.email_verified === true || j.email_verified === 'true') || !j.email) return null;
    if (+j.exp * 1000 < Date.now()) return null;
    return { email: j.email, sub: j.sub, name: j.name };
  } catch { return null; }
}
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req, max = 1 << 20) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('grande demais')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { reject(new Error('json inválido')); } });
    req.on('error', reject);
  });
}
async function api(req, res, p) {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (p === '/api/status') return json(res, 200, { ok: true, versao: VERSION, store: store.kind, google: GOOGLE_ID || null });
    // ---- login com Google + senha (quando GOOGLE_CLIENT_ID está configurado) ----
    if (p === '/api/google' && req.method === 'POST') {
      if (!GOOGLE_ID) return json(res, 400, { error: 'Login com Google não configurado no servidor.' });
      const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
      if (now - t.at > 10 * 60000) { t.n = 0; t.at = now; }
      if (++t.n > 40) { tries.set(ip, t); return json(res, 429, { error: 'Muitas tentativas. Espere alguns minutos.' }); }
      tries.set(ip, t);
      const b = await readBody(req, 8192);
      const g = await verifyGoogle(String(b.idToken || ''));
      if (!g) return json(res, 401, { error: 'Não consegui confirmar sua conta Google. Tente de novo.' });
      const email = g.email.toLowerCase(), mode = String(b.mode || 'check'), pass = String(b.pass || '');
      const byEmail = await store.userByEmail(email);
      if (mode === 'check') return json(res, 200, { exists: !!byEmail, nick: byEmail ? (byEmail.nick || byEmail.name) : null, email });
      if (pass.length < 6 || pass.length > 100) return json(res, 400, { error: 'A senha precisa ter pelo menos 6 caracteres.' });
      if (mode === 'login') {
        if (!byEmail) return json(res, 404, { error: 'Esse e-mail ainda não tem conta. Crie uma.' });
        if (!checkPass(pass, byEmail.salt, byEmail.hash)) return json(res, 401, { error: 'Senha incorreta.' });
        return json(res, 200, { token: byEmail.token, user: byEmail.nick || byEmail.name });
      }
      if (byEmail) return json(res, 409, { error: 'Esse e-mail já tem uma conta. Entre com a senha.' });
      const nick = String(b.nick || '').trim(), name = nick.toLowerCase();
      if (mode === 'register') {
        if (!NAME_RE.test(name)) return json(res, 400, { error: 'Apelido: 3 a 20 letras, números, ponto, traço ou _.' });
        if (await store.getUser(name)) return json(res, 409, { error: 'Esse apelido já está em uso. Escolha outro.' });
        const { salt, hash } = hashPass(pass), token = newToken();
        await store.addUser({ name, nick, salt, hash, token, email });
        return json(res, 200, { token, user: nick });
      }
      if (mode === 'link') { // conta antiga (sem Google): apelido + senha antigos e liga ao e-mail
        const u = await store.getUser(name);
        if (!u || !checkPass(pass, u.salt, u.hash)) return json(res, 401, { error: 'Apelido ou senha da conta antiga incorretos.' });
        if (u.email) return json(res, 409, { error: 'Essa conta já está ligada a outro e-mail.' });
        await store.setEmail(name, email);
        return json(res, 200, { token: u.token, user: u.nick || u.name });
      }
      return json(res, 400, { error: 'pedido inválido' });
    }
    if ((p === '/api/register' || p === '/api/login') && req.method === 'POST') {
      if (GOOGLE_ID) return json(res, 403, { error: 'Entre com o Google.' });
      const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
      if (now - t.at > 10 * 60000) { t.n = 0; t.at = now; }
      if (++t.n > 30) { tries.set(ip, t); return json(res, 429, { error: 'Muitas tentativas. Espere alguns minutos.' }); }
      tries.set(ip, t);
      const b = await readBody(req, 4096);
      const name = String(b.user || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (!NAME_RE.test(name)) return json(res, 400, { error: 'Nome de usuário: 3 a 20 letras, números, ponto, traço ou _.' });
      if (pass.length < 4 || pass.length > 100) return json(res, 400, { error: 'A senha precisa ter pelo menos 4 caracteres.' });
      const u = await store.getUser(name);
      if (p === '/api/register') {
        if (u) return json(res, 409, { error: 'Esse nome de usuário já existe. Escolha outro ou entre com ele.' });
        const { salt, hash } = hashPass(pass), token = newToken();
        await store.addUser({ name, salt, hash, token });
        return json(res, 200, { token, user: name });
      }
      if (!u || !checkPass(pass, u.salt, u.hash)) return json(res, 401, { error: 'Usuário ou senha incorretos.' });
      return json(res, 200, { token: u.token, user: name });
    }
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const owner = auth ? await store.userByToken(auth) : null;
    if (!owner) return json(res, 401, { error: 'Entre na sua conta de novo.' });
    if (p === '/api/me') { const u = await store.getUser(owner); return json(res, 200, { user: u?.nick || owner, store: store.kind }); }
    if (p === '/api/docs' && req.method === 'GET') return json(res, 200, { docs: await store.listDocs(owner) });
    const m = p.match(/^\/api\/docs\/([^/]+)$/);
    if (m && DOC_RE.test(m[1])) {
      const id = m[1];
      if (req.method === 'GET') { const d = await store.getDoc(owner, id); return json(res, 200, { exists: !!d, data: d }); }
      if (req.method === 'PUT') {
        const b = await readBody(req);
        if (!b || typeof b !== 'object') return json(res, 400, { error: 'dados inválidos' });
        const docs = await store.listDocs(owner);
        if (!docs.some((d) => d.id === id) && docs.length >= 40) return json(res, 400, { error: 'limite de documentos' });
        await store.setDoc(owner, id, b);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { await store.delDoc(owner, id); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'não encontrado' });
  } catch (e) {
    return json(res, 500, { error: 'Erro no servidor: ' + (e?.message || e) });
  }
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok ' + peers.size); }
  if (p.startsWith('/api/')) return api(req, res, p);
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
  }, 33);
}

// derruba conexões mortas
setInterval(() => {
  for (const p of peers.values()) {
    if (!p.alive) { drop(p); continue; }
    p.alive = false;
    try { p.sock.write(Buffer.from([0x89, 0])); } catch { drop(p); }
  }
}, 25000);

server.listen(PORT, () => console.log(`ELDORIA ${VERSION} online na porta ${PORT} · servindo ${ROOT} · saves: ${store.kind}`));
