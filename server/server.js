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
const VERSION = process.env.ELDORIA_FAKE_VERSION || '0.9.31'; // (a variável é só para testes)

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
// o jogo pode estar na raiz (só os arquivos do site, o jeito normal) ou em docs/ (projeto completo).
// A raiz vem primeiro: assim uma pasta docs/ esquecida no repositório não esconde a versão nova.
const ROOT = [REPO, path.join(REPO, 'docs')].find((d) => fs.existsSync(path.join(d, 'index.html'))) || REPO;
const PORT = +process.env.PORT || 10000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css' };
const BLOCK = /(^|\/)(\.|server\/|src\/|tools\/|test\/|node_modules\/|package)/;
const store = await openStore();

// ---------------- contas e saves (HTTP /api) ----------------
// Montarias especiais por conta (apelido em minúsculas). Mude sem mexer no código com a variável
// de ambiente MONTARIAS no Render, ex.: "lil:cavalo,pedrocas:lobo" (padrão: só o lil, com o cavalo)
// GMs (nome com "GM" dourado para todos): variável GMS, ex.: "lil,pedrocas" (padrão: lil). Só o servidor decide quem é GM.
const GMS = new Set(String(process.env.GMS || 'lil').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const MONTARIAS = Object.fromEntries(String(process.env.MONTARIAS || 'lil:cavalo').split(',').map((x) => x.trim().toLowerCase().split(':')).filter((x) => x.length === 2 && ['cavalo', 'lobo'].includes(x[1])));
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
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
        return json(res, 200, { token: u.token, user: u.nick || u.name, montaria: MONTARIAS[u.name] || null, gm: GMS.has(u.name) });
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
      const login = String(b.user || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (pass.length < 4 || pass.length > 100) return json(res, 400, { error: 'A senha precisa ter pelo menos 4 caracteres.' });
      if (p === '/api/register') {
        const name = login, email = String(b.email || '').trim().toLowerCase();
        if (!NAME_RE.test(name)) return json(res, 400, { error: 'Apelido: 3 a 20 letras, números, ponto, traço ou _.' });
        if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Digite um e-mail válido.' });
        if (await store.getUser(name)) return json(res, 409, { error: 'Esse apelido já está em uso. Escolha outro.' });
        if (await store.userByEmail(email)) return json(res, 409, { error: 'Esse e-mail já tem uma conta. Entre com ele.' });
        const { salt, hash } = hashPass(pass), token = newToken();
        await store.addUser({ name, nick: String(b.user || '').trim(), salt, hash, token, email });
        return json(res, 200, { token, user: String(b.user || '').trim(), email });
      }
      // entrar: pode usar o e-mail OU o apelido
      const u = login.includes('@') ? await store.userByEmail(login) : await store.getUser(login);
      if (!u || !checkPass(pass, u.salt, u.hash)) return json(res, 401, { error: 'E-mail/apelido ou senha incorretos.' });
      return json(res, 200, { token: u.token, user: u.nick || u.name, email: u.email || null, montaria: MONTARIAS[u.name] || null, gm: GMS.has(u.name) });
    }
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const owner = auth ? await store.userByToken(auth) : null;
    if (!owner) return json(res, 401, { error: 'Entre na sua conta de novo.' });
    if (p === '/api/me') { const u = await store.getUser(owner); return json(res, 200, { user: u?.nick || owner, email: u?.email || null, store: store.kind, montaria: MONTARIAS[String(owner).toLowerCase()] || null, gm: GMS.has(String(owner).toLowerCase()) }); }
    // contas antigas (só apelido) podem cadastrar um e-mail
    if (p === '/api/email' && req.method === 'POST') {
      const b = await readBody(req, 2048), email = String(b.email || '').trim().toLowerCase(), u = await store.getUser(owner);
      if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Digite um e-mail válido.' });
      if (!u || !checkPass(String(b.pass || ''), u.salt, u.hash)) return json(res, 401, { error: 'Senha incorreta.' });
      const other = await store.userByEmail(email);
      if (other && other.name !== owner) return json(res, 409, { error: 'Esse e-mail já está em outra conta.' });
      await store.setEmail(owner, email);
      return json(res, 200, { ok: true, email });
    }
    // ---- Mercado dos Viajantes (no próprio servidor): anúncios de todos os jogadores ----
    if (p.startsWith('/api/market')) return market(req, res, p, owner);
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

// Mercado: cada anúncio é um documento do dono especial "~market". O servidor decide quem compra
// (uma operação por vez), então nunca vende o mesmo item duas vezes.
const MKT = '~market', MKT_MAX = 10, MKT_DAYS = 3, MKT_FEE = 5;
let mktQueue = Promise.resolve();
const mktLock = (fn) => { const r = mktQueue.then(fn, fn); mktQueue = r.catch(() => {}); return r; };
async function market(req, res, p, owner) {
  const all = async () => (await store.listDocs(MKT)).map((d) => ({ id: d.id, ...d.data }));
  if (p === '/api/market' && req.method === 'GET') {
    const L = (await all()).filter((l) => l.status === 'open' || l.seller === owner).sort((a, b) => b.t - a.t).slice(0, 300);
    return json(res, 200, { listings: L });
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'não encontrado' });
  const b = await readBody(req, 16384);
  return mktLock(async () => {
    if (p === '/api/market/list') {
      const price = Math.floor(+b.price), item = String(b.item || '');
      if (!(price >= 1 && price <= 9999999)) return json(res, 400, { error: 'Preço entre 1 e 9.999.999.' });
      if (!item || item.length > 6000) return json(res, 400, { error: 'Item inválido.' });
      try { const it = JSON.parse(item); if (!it || !['equip', 'material', 'consumable'].includes(it.kind)) throw 0; } catch { return json(res, 400, { error: 'Item inválido.' }); }
      const L = await all();
      if (L.filter((l) => l.seller === owner && l.status === 'open').length >= MKT_MAX) return json(res, 400, { error: `No máximo ${MKT_MAX} anúncios por jogador.` });
      if (L.length >= 2000) return json(res, 400, { error: 'O mercado está cheio agora. Tente mais tarde.' });
      const id = 'm' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      const data = { item, name: String(b.name || '').slice(0, 60), price, seller: owner, sellerName: String(b.sellerName || owner).slice(0, 20), t: Date.now(), status: 'open' };
      await store.setDoc(MKT, id, data);
      return json(res, 200, { listing: { id, ...data } });
    }
    const id = String(b.id || '');
    if (p === '/api/market/buy' || p === '/api/market/cancel') {
      const l = id && await store.getDoc(MKT, id);
      if (!l || l.status !== 'open') return json(res, 409, { error: p.endsWith('buy') ? 'Este item acabou de ser vendido.' : 'Este item já foi vendido.' });
      if (p.endsWith('cancel')) {
        if (l.seller !== owner) return json(res, 403, { error: 'Esse anúncio não é seu.' });
        await store.delDoc(MKT, id);
        return json(res, 200, { item: l.item });
      }
      if (l.seller === owner) return json(res, 400, { error: 'Você não pode comprar o próprio item.' });
      if (Date.now() - (l.t || 0) > MKT_DAYS * 864e5) return json(res, 409, { error: 'Este anúncio expirou.' });
      await store.setDoc(MKT, id, { ...l, status: 'sold', buyer: owner, buyerName: String(b.buyerName || owner).slice(0, 20), soldAt: Date.now() });
      return json(res, 200, { item: l.item, price: l.price });
    }
    if (p === '/api/market/collect') {
      // ouro das vendas: entrega uma vez só e apaga os anúncios vendidos
      let total = 0, n = 0;
      for (const l of await all()) if (l.seller === owner && l.status === 'sold') { await store.delDoc(MKT, l.id); total += Math.floor(l.price * (1 - MKT_FEE / 100)); n++; }
      return json(res, 200, { total, n });
    }
    return json(res, 404, { error: 'não encontrado' });
  });
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
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || sock.remoteAddress || '?';
  const peer = { id, ip, sock, presence: {}, updatedAt: Date.now(), buf: Buffer.alloc(0), alive: true, rate: { t: Date.now(), n: 0 } };
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

// ---- filtro +18 do chat (cópia de src/core/chatfilter.js) e bloqueio de 30 min ----
const EXACT = ['sexo', 'sex', 'sexy', 'sexual', 'sexuais', 'transa', 'transar', 'transando', 'transou', 'transei', 'foder', 'fode', 'fodendo', 'fodida', 'fodido',
  'buceta', 'boceta', 'bct', 'xoxota', 'xota', 'xereca', 'xana', 'piroca', 'punheta', 'siririca', 'gozar', 'gozei', 'gozou', 'gozando', 'gozada', 'gozo',
  'porno', 'putaria', 'puta', 'putinha', 'prostituta', 'vagina', 'penis', 'boquete', 'mamada', 'tesao', 'tesuda', 'tesudo', 'nude', 'nudes', 'pelada', 'pelado', 'peladinha',
  'estupro', 'estuprar', 'estuprador', 'pedofilo', 'pedofilia', 'orgia', 'orgasmo', 'erecao', 'masturbar', 'masturbacao', 'anal', 'cu', 'cuzinho', 'hentai',
  'xvideos', 'pornhub', 'onlyfans', 'porn', 'fuck', 'fucking', 'dick', 'pussy', 'cock', 'boobs', 'tits', 'nsfw', 'xxx'];
const STEMS = ['bucet', 'bocet', 'xoxot', 'xerec', 'piroc', 'punhet', 'siriric', 'putari', 'masturb', 'pedofil', 'estupr', 'porn', 'orgasm', 'hentai', 'onlyfan', 'xvideo', 'tesud'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const squeeze = (w) => w.replace(/(.)\1+/g, '$1');
const SET = new Set([...EXACT, ...EXACT.map(squeeze)]);
const STEMS_SQ = [...new Set([...STEMS, ...STEMS.map(squeeze)])];

function tokens(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, (c) => LEET[c] || c).replace(/[^a-z]+/g, ' ').trim();
  const raw = t ? t.split(' ') : [];
  // letras soltas em sequência viram uma palavra só: "s e x o" -> "sexo"
  const out = [];
  let run = '';
  for (const w of raw) {
    if (w.length === 1) { run += w; continue; }
    if (run.length > 1) out.push(run);
    else if (run) out.push(run);
    run = '';
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

function isAdult(text) {
  for (const w of tokens(text)) {
    const s = squeeze(w);
    if (SET.has(w) || SET.has(s)) return true;
    if (STEMS_SQ.some((st) => s.startsWith(st) || w.startsWith(st))) return true;
  }
  return false;
}

const CHAT_BAN_MS = 30 * 60 * 1000;
const chatBans = new Map(); // ip ou apelido -> até quando
function banLeft(peer) {
  const now = Date.now(), n = String(peer.presence?.n || '').toLowerCase();
  return Math.max(0, (chatBans.get('ip:' + peer.ip) || 0) - now, (n ? chatBans.get('n:' + n) || 0 : 0) - now);
}

function onMessage(peer, text) {
  peer.alive = true;
  const now = Date.now();
  if (now - peer.rate.t > 1000) { peer.rate.t = now; peer.rate.n = 0; }
  if (++peer.rate.n > 120) return; // limite de mensagens por segundo
  let m; try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m !== 'object') return;
  // a conta da conexão (o jogo manda o token logo depois de entrar): só assim o servidor sabe quem é GM
  if (m.t === 'auth' && typeof m.token === 'string' && m.token.length < 200) {
    store.userByToken(m.token).then((name) => { peer.account = name || null; peer.gm = !!name && GMS.has(String(name).toLowerCase()); peersChanged(); }).catch(() => {});
    return;
  }
  if (m.t === 'pres' && m.p && typeof m.p === 'object') {
    // o mesmo personagem conectou de novo (saiu e entrou, recarregou a página): a conexão antiga cai na hora (sem "clone" parado)
    const cid = typeof m.p.id === 'string' && m.p.id ? m.p.id : null;
    if (cid && peer.presence?.id !== cid) for (const o of peers.values()) if (o !== peer && o.presence?.id === cid) { send(o, { t: 'kicked' }); setTimeout(() => drop(o), 50); }
    peer.presence = m.p; peer.updatedAt = now;
    return peersChanged();
  }
  if (m.t === 'emit' && TOPICS.has(m.topic)) {
    const d = m.data && typeof m.data === 'object' ? m.data : null;
    // bate-papo e privado: palavras +18 bloqueiam o chat por 30 minutos
    if (d && (m.topic === 'chat' || d.type === 's_dm')) {
      let left = banLeft(peer);
      if (!left && isAdult(d.text)) {
        const until = now + CHAT_BAN_MS, n = String(peer.presence?.n || '').toLowerCase();
        chatBans.set('ip:' + peer.ip, until); if (n) chatBans.set('n:' + n, until);
        left = CHAT_BAN_MS;
      }
      if (left) return send(peer, { t: 'msg', topic: 'fx', peer: 'server', data: { type: 's_ban', until: now + left } });
    }
    // mensagem para uma pessoa só (convite, troca, privado): vai só para ela
    if (d && typeof d.to === 'string') {
      const target = peers.get(d.to);
      if (target) send(target, { t: 'msg', topic: m.topic, peer: peer.id, data: d });
      return;
    }
    // selo de GM: quem decide é o servidor (o que o jogador mandar é ignorado)
    if (d && m.topic === 'chat') d.gm = peer.gm ? 1 : 0;
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
    const list = [...peers.values()].map((p) => ({ peer: p.id, presence: { ...p.presence, gm: p.gm ? 1 : 0 }, updatedAt: p.updatedAt }));
    broadcast({ t: 'peers', peers: list });
  }, 33);
}

// limpa bloqueios vencidos
setInterval(() => { const now = Date.now(); for (const [k, t] of chatBans) if (t < now) chatBans.delete(k); }, 60000);

// Deploy no Render: o servidor antigo recebe SIGTERM. Avisa todo mundo ("Em atualização / manutenção")
// e fecha em seguida; as páginas esperam o servidor novo e recarregam sozinhas.
let closing = false;
function shutdown() {
  if (closing) return; closing = true;
  broadcast({ t: 'maint' });
  setTimeout(() => process.exit(0), 2500);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// derruba conexões mortas
setInterval(() => {
  for (const p of peers.values()) {
    if (!p.alive) { drop(p); continue; }
    p.alive = false;
    try { p.sock.write(Buffer.from([0x89, 0])); } catch { drop(p); }
  }
}, 10000);

server.listen(PORT, () => console.log(`ELDORIA ${VERSION} online na porta ${PORT} · servindo ${ROOT} · saves: ${store.kind}`));
