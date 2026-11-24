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
const VERSION = process.env.ELDORIA_FAKE_VERSION || '0.11.1'; // (a variável é só para testes)

// ---------- Erros do servidor → Sentry (só no Render; sem dados pessoais) ----------
const SENTRY_DSN = process.env.SENTRY_DSN || 'https://8ffc505d8bfbef96c829cace57608900@o4512419115499520.ingest.us.sentry.io/4512419158622208';
const SENTRY_ON = !!process.env.RENDER && !/^(0|off|false)$/i.test(process.env.SENTRY || '');
let sentrySent = 0; const sentrySeen = new Map();
function reportError(err, where) {
  try {
    if (!SENTRY_ON) return;
    const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(SENTRY_DSN); if (!m) return;
    const msg = String(err?.message || err), sig = msg + '|' + where, now = Date.now();
    if (now - (sentrySeen.get(sig) || 0) < 60000 || sentrySent > 200) return;
    sentrySeen.set(sig, now); sentrySent++;
    const frames = String(err?.stack || '').split('\n').map((l) => /at (?:(.+?) \()?(.*?):(\d+):(\d+)\)?$/.exec(l.trim())).filter(Boolean)
      .map((f) => ({ function: f[1] || '?', filename: (f[2] || '').replace(/^.*\//, ''), abs_path: f[2], lineno: +f[3], colno: +f[4], in_app: !/node_modules|node:/.test(f[2] || '') })).reverse();
    const ev = { event_id: crypto.randomBytes(16).toString('hex'), timestamp: now / 1000, platform: 'node', level: 'error', release: 'eldoria@' + VERSION, environment: 'servidor', server_name: 'render',
      exception: { values: [{ type: err?.name || 'Error', value: msg.slice(0, 500), stacktrace: { frames } }] }, tags: { onde: where, runtime: 'servidor' }, extra: { jogadores: (() => { try { return peers.size; } catch { return 0; } })() } };
    const body = JSON.stringify({ event_id: ev.event_id, sent_at: new Date().toISOString() }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(ev);
    fetch(`https://${m[2]}/api/${m[3]}/envelope/?sentry_key=${m[1]}&sentry_version=7&sentry_client=eldoria-server%2F${VERSION}`, { method: 'POST', body, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  } catch { /* nunca derruba o servidor */ }
}
process.on('unhandledRejection', (e) => { console.error('Promessa rejeitada:', e?.message || e); reportError(e instanceof Error ? e : new Error(String(e)), 'unhandledRejection'); });
process.on('uncaughtException', (e) => { console.error('Erro não tratado:', e?.stack || e); reportError(e, 'uncaughtException'); setTimeout(() => process.exit(1), 1500); });

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
        async setPass(name, salt, hash, token) { await pool.query('UPDATE eldoria_users SET salt=$2, hash=$3, token=$4 WHERE name=$1', [name, salt, hash, token]); },
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
    async setPass(name, salt, hash, token) { if (db.users[name]) { Object.assign(db.users[name], { salt, hash, token }); flush(); } },
    async listDocs(owner) { return Object.entries(db.docs[owner] || {}).map(([id, data]) => ({ id, data })); },
    async getDoc(owner, id) { return db.docs[owner]?.[id] || null; },
    async setDoc(owner, id, data) { (db.docs[owner] ||= {})[id] = data; flush(); },
    async delDoc(owner, id) { if (db.docs[owner]) { delete db.docs[owner][id]; flush(); } },
  };
}

// scrypt assíncrono: conferir senha não trava o servidor (antes, uma enxurrada de logins congelava o jogo de todos)
const scryptA = (pass, salt) => new Promise((ok, no) => crypto.scrypt(String(pass), String(salt), 32, (e, k) => (e ? no(e) : ok(k))));
async function hashPass(pass, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: (await scryptA(pass, salt)).toString('hex') };
}
async function checkPass(pass, salt, hash) {
  try {
    const h = await scryptA(pass, salt), ref = Buffer.from(String(hash || ''), 'hex');
    return ref.length === h.length && crypto.timingSafeEqual(h, ref);
  } catch { return false; }
}
// Senha errada demais na MESMA conta: trava os logins dela por 15 min (funciona mesmo se o atacante trocar de IP)
const loginFails = new Map(); // conta → { n, at }
const LOCK_N = 10, LOCK_MS = 15 * 60000;
function loginLocked(name) { const f = loginFails.get(name); return !!f && f.n >= LOCK_N && Date.now() - f.at < LOCK_MS; }
function loginFail(name) {
  const now = Date.now(), f = loginFails.get(name);
  if (!f || now - f.at > LOCK_MS) loginFails.set(name, { n: 1, at: now }); else f.n++;
  if (loginFails.get(name).n === LOCK_N) segLog('login_travado', name, { tentativas: LOCK_N }, 0);
}
const LOCK_MSG = 'Muitas senhas erradas nesta conta. Espere 15 minutos.';
const newToken = () => crypto.randomBytes(24).toString('hex');

const REPO = path.resolve(HERE, '..');
// o jogo pode estar na raiz (só os arquivos do site, o jeito normal) ou em docs/ (projeto completo).
// A raiz vem primeiro: assim uma pasta docs/ esquecida no repositório não esconde a versão nova.
// qual cópia do jogo servir: a que tem a MESMA versão deste servidor (se sobrou um index.html velho
// solto na raiz do repositório, ele é ignorado). Sem nenhuma igual, a mais nova pelo número da versão.
const ROOT = (() => {
  const dirs = [path.join(REPO, 'docs'), REPO].filter((d) => fs.existsSync(path.join(d, 'index.html')));
  const verOf = (d) => { try { const h = fs.readFileSync(path.join(d, 'index.html'), 'utf8'); return (h.match(/"(\d+\.\d+\.\d+)"/) || [])[1] || '0.0.0'; } catch { return '0.0.0'; } };
  const num = (v) => v.split('.').reduce((a, x) => a * 1000 + +x, 0);
  const same = dirs.find((d) => verOf(d) === VERSION);
  const pick = same || dirs.sort((a, b) => num(verOf(b)) - num(verOf(a)))[0] || REPO;
  console.log('[eldoria] servindo o jogo de', path.relative(REPO, pick) || '.', 'versão', verOf(pick), same ? '(igual ao servidor)' : '(ATENÇÃO: diferente do servidor ' + VERSION + ')');
  return pick;
})();
const PORT = +process.env.PORT || 10000;
// SERVIDORES (mundos): cada um tem seus próprios jogadores à vista, monstros, eventos, raids e bate-papo.
// Contas, personagens, mercado, banco e diamantes são os mesmos em todos (como no Rucoy).
const SERVERS = [{ id: 1, name: 'Eldoria 1' }, { id: 2, name: 'Eldoria 2' }];
// "Mundo no servidor" (server/mundo.mjs): página sem tela que entra com esta chave e vira o anfitrião fixo.
// Sem a variável MUNDO_KEY (ex.: no Render), nada muda: o anfitrião continua sendo um jogador.
const MUNDO_KEY = String(process.env.MUNDO_KEY || '');
const svOf = (v) => { const n = parseInt(v, 10); return SERVERS.some((x) => x.id === n) ? n : 1; };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const BLOCK = /(^|\/)(\.|server\/|src\/|tools\/|test\/|node_modules\/|package)/;
const store = await openStore();

// =============================================================
// SEGURANÇA (anti-trapaça). O mundo roda no navegador dos jogadores, então o servidor confere o que dá:
// saves que sobem rápido demais, ouro que aparece do nada, golpes PvP impossíveis, excesso de mensagens,
// nomes falsos e roupas premium sem compra. Regra: na dúvida ele REGISTRA (server/seguranca.log e o comando
// /seguranca no chat do GM) e no máximo corrige o valor para o maior possível. Nunca apaga save nem bane sozinho.
// =============================================================
const SEG = '~seg', SEG_LOG_DOC = '~seglog';
// donos especiais de documentos: ninguém pode criar uma conta com esses nomes (ex.: "__diamantes__" lia e escrevia os diamantes de todos)
const SPECIAL_OWNERS = new Set(['__diamantes__', '~names', '~dir', '~mail', '~market', '~bau', SEG, SEG_LOG_DOC]);
const PROD = !!(process.env.RENDER || process.env.DATABASE_URL || process.env.NODE_ENV === 'production');
// nome de GM só se cria com GMS_REGISTRO=1 (num banco novo ou sem banco, qualquer um viraria GM criando a conta "lil")
const nameBlocked = (name) => SPECIAL_OWNERS.has(name) || /^[_~]{2}/.test(name) || (PROD && GMS.has(name) && process.env.GMS_REGISTRO !== '1');
const isGmName = (a) => GMS.has(String(a || '').toLowerCase());
const cleanStr = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const toInt = (v, lo, hi, def = lo) => { const n = Math.floor(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
// links no bate-papo viram [link] (golpes de "diamante grátis", sites +18)
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]{2,}\.(?:com|net|org|gg|io|xyz|ru|ly|link|top|tk|shop|online|site|app)(?:\.br)?\b(?:\/\S*)?/gi;
const maskLinks = (t) => String(t).replace(LINK_RE, '[link]');
// regras do jogo (src/core/items.js) para conferir itens do mercado; se a pasta src/ não estiver no servidor, confere só o formato
let CORE = null, CHK = null;
import('../src/core/items.js').then((m) => { CORE = m; }).catch(() => console.log('[segurança] src/core/items.js não encontrado: o mercado confere só o formato dos itens'));
// v0.12: conferência de itens (catálogo, fundo possível, nível, sets) e troca dos sets antigos — src/core/itemcheck.js
let GD = null; // pacote 3: Portal da Fenda (liberação por personagem)
import('../src/core/guardiao.js').then((m) => { GD = m; }).catch(() => console.log('[segurança] src/core/guardiao.js não encontrado: o portal do Guardião não é conferido'));
import('../src/core/itemcheck.js').then((m) => { CHK = m; convertMarketOnce().catch((e) => reportError(e, 'troca do mercado')); }).catch(() => console.log('[segurança] src/core/itemcheck.js não encontrado: itens do save não são conferidos'));

// ---- registro (arquivo + últimos 300 no banco, para o GM ver com /seguranca mesmo depois de reiniciar) ----
const SEG_FILE = process.env.SEG_LOG || path.join(HERE, 'seguranca.log');
const segRecent = [], segSeen = new Map();
let segTimer = null;
store.getDoc(SEG_LOG_DOC, 'log').then((d) => { if (Array.isArray(d?.list)) segRecent.unshift(...d.list.slice(-300)); }).catch(() => {});
function segLog(tipo, quem, info = {}, every = 60000) {
  try {
    const k = tipo + '|' + quem, now = Date.now();
    if (every && now - (segSeen.get(k) || 0) < every) return;
    segSeen.set(k, now); if (segSeen.size > 5000) segSeen.clear();
    const e = { t: new Date(now).toISOString(), tipo, quem: String(quem || '?').slice(0, 40), info: Object.entries(info).map(([a, b]) => a + '=' + (typeof b === 'string' ? b : JSON.stringify(b))).join(' ').slice(0, 300) };
    segRecent.push(e); if (segRecent.length > 300) segRecent.shift();
    console.warn('[segurança]', e.tipo, e.quem, e.info);
    fs.appendFile(SEG_FILE, JSON.stringify(e) + '\n', () => {});
    if (!segTimer) segTimer = setTimeout(() => { segTimer = null; store.setDoc(SEG_LOG_DOC, 'log', { list: segRecent.slice(-300) }).catch(() => {}); }, 20000);
  } catch { /* nunca derruba o servidor */ }
}

// ---- cabeçalhos de segurança (sem travar o jogo dentro do Claude: a página continua podendo abrir em moldura) ----
function secHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (String(req.headers['x-forwarded-proto'] || '').startsWith('https')) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}

// ---- limites de quantidade (balde de fichas) ----
function bucket(o, k, cap, perSec) {
  const now = Date.now(), B = (o.bk ||= {}), b = (B[k] ||= { n: cap, t: now });
  b.n = Math.min(cap, b.n + ((now - b.t) / 1000) * perSec); b.t = now;
  if (b.n < 1) return false;
  b.n -= 1; return true;
}
const apiBuckets = new Map();
function apiBucket(owner) { let o = apiBuckets.get(owner); if (!o) apiBuckets.set(owner, (o = {})); o.t = Date.now(); return bucket(o, 'api', 240, 4); }

// ---- XP (cópia de src/core/progression.js: curva do Rucoy, nível máximo 1000) ----
const MAX_LEVEL = 1000;
const xpToNext = (L) => (L >= MAX_LEVEL ? Infinity : Math.max(5, Math.round((Math.pow(L + 1, 3 + (L + 1) / 1000) - Math.pow(L, 3 + L / 1000)) * 0.95)));
const XP_AT = (() => { const a = [0, 0]; for (let L = 1; L < MAX_LEVEL; L++) a[L + 1] = a[L] + xpToNext(L); return a; })();
const xpTotal = (l, xp) => XP_AT[toInt(l, 1, MAX_LEVEL)] + Math.max(0, Math.min(+xp || 0, 1e13));
function levelOfXp(t) { let lo = 1, hi = MAX_LEVEL; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (XP_AT[m] <= t) lo = m; else hi = m - 1; } return { level: lo, xp: lo >= MAX_LEVEL ? 0 : Math.max(0, Math.floor(t - XP_AT[lo])) }; }
// o máximo que dá para ganhar honestamente (bem folgado): 3 chefes mais fortes de uma vez + 1 milhão de XP por minuto
const BOSS_XP = xpToNext(168) * 2.5;
const xpAllow = (ms) => 3 * BOSS_XP + (1e6 * Math.min(ms, 60 * 864e5)) / 60000;
// ouro: 1 milhão + 20 mil por nível de uma vez, e 50 mil + 2 mil por nível por minuto (vender a bolsa cheia de lendários cabe)
const goldAllow = (lvl, ms) => Math.round(1e6 + 2e4 * lvl + ((5e4 + 2e3 * lvl) * Math.min(ms, 60 * 864e5)) / 60000);
const GOLD_MAX = 2e9;

// ---- livro-caixa de cada conta (dono "~seg"): o servidor anota de onde o ouro pode vir ----
// ch: último save conferido de cada personagem { g ouro, x XP total, l nível, t hora, n nome }
// deb: ouro que SAIU do banco (vira saque no personagem ou transferência)   bcred: ouro que o banco pode receber (correio)
// cred: ouro que o personagem pode receber (vendas no mercado)   pend: ouro que precisa SAIR de um personagem (depósito, compra)
const H = 3600e3;
function ledgerNorm(d, now = Date.now()) {
  const L = d && typeof d === 'object' ? d : {};
  const keep = (a, ms) => (Array.isArray(a) ? a.filter((x) => x && x.n > 0 && now - x.t < ms).slice(-200) : []);
  return { ch: L.ch && typeof L.ch === 'object' ? L.ch : {}, bank: L.bank || null, deb: keep(L.deb, 6 * H), cred: keep(L.cred, 24 * H), bcred: keep(L.bcred, 24 * H), pend: keep(L.pend, H), nov: Array.isArray(L.nov) ? L.nov.filter((t) => now - t < 864e5) : [],
    gd: L.gd && typeof L.gd === 'object' ? L.gd : {}, gdc: L.gdc && typeof L.gdc === 'object' ? L.gdc : {} }; // gd: portal do Guardião liberado (personagem → hora) · gdc: migração já conferida
}
const ledgerGet = async (a) => ledgerNorm(await store.getDoc(SEG, a));
const ledgerSet = (a, L) => store.setDoc(SEG, a, L);
const sumN = (a) => a.reduce((s, x) => s + x.n, 0);
function take(a, n) { let got = 0; while (n - got > 0 && a.length) { const x = a[0], k = Math.min(x.n, n - got); x.n -= k; got += k; if (x.n <= 0) a.shift(); } return got; }
const acctQ = new Map(); // uma operação por vez em cada conta
function acctLock(a, fn) {
  const prev = acctQ.get(a) || Promise.resolve(), r = prev.then(fn, fn), tail = r.then(() => {}, () => {});
  acctQ.set(a, tail); tail.then(() => { if (acctQ.get(a) === tail) acctQ.delete(a); });
  return r;
}
const charCredit = (a, n, k) => acctLock(a, async () => { const L = await ledgerGet(a); L.cred.push({ n, t: Date.now(), k }); await ledgerSet(a, L); });
const bankCredit = (a, n) => acctLock(a, async () => { const L = await ledgerGet(a); L.bcred.push({ n, t: Date.now() }); await ledgerSet(a, L); });
// personagens que o livro ainda não viu (primeira vez depois desta versão): lê os saves guardados
async function seedChars(owner, L) {
  if (Object.keys(L.ch).length) return;
  for (const d of await store.listDocs(owner)) {
    if (!String(d.id).startsWith('rift_char_')) continue;
    try { const p = JSON.parse(d.data.json).player; L.ch[d.id.slice(10)] = { g: toInt(p.gold, 0, GOLD_MAX, 0), x: xpTotal(p.level, p.xp), l: toInt(p.level, 1, MAX_LEVEL), t: Date.now(), n: cleanStr(p.name, 16) }; } catch { /* save estranho: ignora */ }
  }
}

// ---- pacote 3: Portal da Fenda (atrás do Guardião) ----
// Liberado para sempre para o personagem que derrotou o Guardião ou participou da luta (deu dano / curou perto da arena),
// anotado AQUI (livro "~seg"), não só no save. Migração: na primeira vez que o livro vê o personagem depois desta versão,
// lê o save GUARDADO no servidor (de antes da versão): chefe já morto, ou já está/esteve nos Ermos/Confins → liberado.
async function gdMigrate(owner, cid, L) {
  if (!GD || !cid || L.gd[cid] || L.gdc[cid]) return false;
  let st = null;
  try { const d = await store.getDoc(owner, 'rift_char_' + cid); st = d && typeof d.json === 'string' ? JSON.parse(d.json) : null; } catch { st = null; }
  const now = Date.now();
  L.gdc[cid] = now;
  if (GD.passedBefore(st, false)) L.gd[cid] = now;
  return true;
}
function gdSend(peer) { send(peer, { t: 'msg', topic: 'fx', peer: 'server', data: { type: 's_gd', ok: peer.gdOk ? 1 : 0 } }); }
function gdLoad(peer, cid = peer.presence?.id) {
  if (!GD || !peer.account || !cid || peer.gm || peer.bot) return;
  acctLock(peer.account, async () => {
    const L = await ledgerGet(peer.account);
    if (await gdMigrate(peer.account, cid, L)) await ledgerSet(peer.account, L);
    if (peer.presence?.id !== cid) return;
    peer.gdOk = !!L.gd[cid]; gdSend(peer);
    gdCheck(peer, peer.presence, Date.now()); // já está nos Ermos/Confins sem liberação?
  }).catch(() => {});
}
function gdGrant(peer, why) {
  const cid = peer.presence?.id;
  if (!peer.account || !cid || peer.gdOk) return;
  peer.gdOk = true; gdSend(peer);
  acctLock(peer.account, async () => { const L = await ledgerGet(peer.account); if (!L.gd[cid]) { L.gd[cid] = Date.now(); L.gdc[cid] ||= Date.now(); await ledgerSet(peer.account, L); } }).catch(() => {});
  segLog('guardiao_liberado', peer.account, { personagem: cleanStr(peer.presence?.n, 16), como: why }, 0);
}
// presença nos Ermos/Confins sem liberação: registra e manda de volta ao Vale (sem banir)
function gdCheck(peer, pr, now) {
  if (!GD || peer.gm || peer.bot || peer.old || !peer.account || peer.gdOk !== false || !GD.isGated(pr.ar)) return;
  if (now - (peer.gdBackAt || 0) < 8000) return;
  peer.gdBackAt = now;
  segLog('portal_sem_guardiao', peer.account, { personagem: cleanStr(pr.n, 16), area: String(pr.ar).slice(0, 12) }, 5 * 60000);
  send(peer, { t: 'msg', topic: 'fx', peer: 'server', data: { type: 's_gdvolta' } });
}

// trocas entre jogadores (o ouro passa de um para o outro pelo navegador): o servidor anota as ofertas que viu
const tradeFin = new Map(), tradeOffer = new Map(); // "contaA|contaB" → hora da troca concluída · quem recebe → Map(quem dá → { n, t })
function noteTrade(from, to, d, now) {
  if (!from.account || !to.account || from.account === to.account) return;
  if (d.type === 'tr_off') { let mm = tradeOffer.get(to.account); if (!mm) tradeOffer.set(to.account, (mm = new Map())); mm.set(from.account, { n: toInt(d.gold, 0, 1e7, 0), t: now }); }
  if (d.type === 'tr_fin') tradeFin.set([from.account, to.account].sort().join('|'), now);
}
async function tradeTake(owner, need, now) {
  let got = 0;
  for (const [from, o] of tradeOffer.get(owner) || []) {
    if (need - got <= 0) break;
    const fin = tradeFin.get([owner, from].sort().join('|')) || 0;
    if (!o.n || now - o.t > 15 * 60000 || fin < o.t - 2000 || now - fin > 15 * 60000) continue;
    const G = await ledgerGet(from), has = Math.max(0, Math.max(0, ...Object.values(G.ch).map((c) => c.g || 0)) - sumN(G.pend)); // quem deu tinha esse ouro?
    const k = Math.min(need - got, o.n, has);
    if (k <= 0) continue;
    o.n -= k; got += k;
    acctLock(from, async () => { const L = await ledgerGet(from); L.pend.push({ n: k, t: Date.now() }); await ledgerSet(from, L); }); // precisa sair de quem deu
  }
  return got;
}

// ---- save de personagem: nível/XP e ouro não podem subir mais rápido que o possível ----
async function checkChar(owner, id, body, write) {
  let st = null;
  if (!isGmName(owner) && typeof body.json === 'string') { try { st = JSON.parse(body.json); } catch { st = null; } }
  const p = st?.player;
  if (!p || typeof p !== 'object') return write(); // GM ou formato desconhecido: guarda como veio
  const cid = id.slice(10);
  return acctLock(owner, async () => {
    const now = Date.now(), Lg = await ledgerGet(owner), prev = Lg.ch[cid], notes = {};
    await gdMigrate(owner, cid, Lg); // pacote 3: antes de o save novo substituir o guardado
    let lvl = toInt(p.level, 1, MAX_LEVEL), gold = toInt(p.gold, 0, GOLD_MAX, 0), fix = lvl !== p.level || gold !== p.gold;
    if (fix) notes.fora_do_limite = { nivel: p.level, ouro: p.gold };
    let tx = xpTotal(lvl, p.xp);
    if (prev && prev.t) {
      const dt = Math.max(0, now - prev.t);
      const maxX = prev.x + xpAllow(dt);
      if (tx > maxX) { const o = levelOfXp(maxX); notes.xp = { nivel: lvl, virou: o.level, minutos: Math.round(dt / 60000) }; lvl = o.level; p.xp = o.xp; tx = xpTotal(lvl, o.xp); fix = true; }
      else if (tx - prev.x > 0.6 * xpAllow(dt) && tx - prev.x > 2e6) segLog('xp_rapido', owner, { personagem: cleanStr(p.name, 16), nivel: `${prev.l}→${lvl}`, minutos: Math.round(dt / 60000) }, 10 * 60000);
      const up = gold - prev.g;
      if (up > 0) {
        let need = up;
        need -= take(Lg.deb, need);   // saque do banco
        need -= take(Lg.cred, need);  // vendas no mercado
        if (need > 0) need -= await tradeTake(owner, need, now); // troca com outro jogador
        const allow = Math.max(0, goldAllow(prev.l, dt) - sumN(Lg.pend)); // depósito/compra que ainda não saiu do personagem
        if (need > allow) { const cut = need - allow; notes.ouro = { antes: prev.g, veio: gold, ficou: gold - cut, minutos: Math.round(dt / 60000) }; gold -= cut; fix = true; }
      } else if (up < 0) take(Lg.pend, -up);
    } else if (!prev && !(await store.getDoc(owner, id)) && (lvl > 10 || gold > 50000)) {
      // personagem novo (ou trazido por código de save) já avançado: até 3 por dia passam (e ficam registrados)
      if (Lg.nov.length >= 3) { notes.novo = { nivel: lvl, ouro: gold }; if (lvl > 10) { lvl = 10; p.xp = 0; tx = xpTotal(10, 0); } gold = Math.min(gold, 50000); fix = true; }
      else { Lg.nov.push(now); segLog('personagem_novo_avancado', owner, { personagem: cleanStr(p.name, 16), nivel: lvl, ouro: gold }, 0); }
    }
    const pts = Object.values(p.attrs || {}).reduce((a, v) => a + Math.max(0, +v || 0), 0) + Math.max(0, +p.freePoints || 0);
    if (pts > Math.floor(1.5 * (lvl - 1)) + 3 && !p.gmBoost) segLog('atributos_demais', owner, { personagem: cleanStr(p.name, 16), pontos: pts, nivel: lvl }, 30 * 60000);
    p.level = lvl; p.gold = gold;
    if (fix) segLog('save_corrigido', owner, { personagem: cleanStr(p.name, 16), ...notes }, 0);
    const rev = await itemReview(owner, cid, p, prev, now); // v0.12: sets antigos trocados uma vez só + itens impossíveis
    if (rev.changed) st.updated = Math.max(+st.updated || 0, now) + 1; // a cópia conferida do servidor vale na próxima entrada
    if (fix || rev.changed) body.json = JSON.stringify(st);
    body.level = lvl; // o resumo (lista de personagens, ranking) segue o save conferido
    const aud = await auditItems(owner, p, prev, now, lvl);
    Lg.ch[cid] = { g: gold, x: tx, l: lvl, t: now, n: cleanStr(p.name, 16), ...aud, cv: rev.cv };
    await ledgerSet(owner, Lg);
    for (const q of peers.values()) if (q.account === owner && q.presence?.id === cid) q.lvlCap = lvl;
    return write();
  });
}

// ---- itens do save (v0.12, pacote 2) ----
// 1) TROCA DOS SETS ANTIGOS, UMA VEZ: cada peça de "set de monstro" vira a peça do set do bioma (mesmo fundo, mesma peça).
//    O jogo troca ao abrir o save (v17); o servidor confere e REGISTRA: no livro (ch[personagem].cv = hora da troca) e,
//    por conta, a chave de cada item trocado (doc "cv:<conta>": item → personagem). O mesmo item aparecendo em OUTRO
//    personagem (cópia de save / código antigo importado) fica RETIDO; save velho do mesmo personagem é trocado de novo
//    no lugar (é o mesmo item, nada duplica) e fica registrado.
// 2) ITENS IMPOSSÍVEIS: fora do catálogo, raridade inventada, nível acima do possível, peça fora do lugar, set que não existe.
//    Nada é apagado: o que dá para consertar vira o MÁXIMO POSSÍVEL; o que não dá fica RETIDO (guardado, sem uso) e registrado.
const CV_MAX = 6000;
const cvGet = async (a) => { const d = await store.getDoc(SEG, 'cv:' + a); return { u: d?.u && typeof d.u === 'object' ? d.u : {} }; };
const cvSet = (a, R) => { const k = Object.keys(R.u); if (k.length > CV_MAX) for (const x of k.slice(0, k.length - CV_MAX)) delete R.u[x]; return store.setDoc(SEG, 'cv:' + a, R); };
async function itemReview(owner, cid, p, prev, now) {
  const out = { changed: false, cv: prev?.cv || now };
  if (!CHK) return out;
  const who = cleanStr(p.name, 16), refs = CHK.itemRefs(p);
  const first = !prev?.cv, old = refs.filter((r) => CHK.isOldItem(r.it)), conv = refs.filter((r) => r.it.kind === 'equip' && r.it.conv && !CHK.isOldItem(r.it));
  const retain = (r, why) => { r.it.retido = 1; out.changed = true; segLog('item_retido', owner, { personagem: who, item: cleanStr(r.it.name || r.it.id, 40), onde: r.where, motivo: why }, 0); };
  if (old.length || (first && conv.length)) {
    const R = await cvGet(owner);
    let dup = 0, again = 0;
    // itens que o jogo já trocou: registra na 1ª vez; o mesmo item já registrado em outro personagem é cópia
    if (first) for (const r of conv) { const k = CHK.uidKey(r.it.uid); if (R.u[k] && R.u[k] !== cid) { retain(r, 'copia_de_item_trocado'); dup++; } else R.u[k] = cid; }
    // itens ainda no formato antigo: o servidor troca aqui mesmo
    for (const r of old) {
      const k = CHK.uidKey(r.it.uid), o = R.u[k];
      CHK.convertOldItem(r.it); out.changed = true;
      if (o && o !== cid) { retain(r, 'troca_repetida_em_outro_personagem'); dup++; } else { if (o === cid || !first) again++; R.u[k] = cid; }
    }
    await cvSet(owner, R);
    if (again) segLog('troca_repetida', owner, { personagem: who, itens: again }, 30 * 60000); // save de antes da troca subiu de novo
    if (dup) segLog('troca_copia', owner, { personagem: who, itens: dup }, 0);
  }
  if (first && (old.length || conv.length)) segLog('sets_trocados', owner, { personagem: who, itens: old.length + conv.length }, 0);
  // itens impossíveis
  for (const r of refs) {
    if (r.it.retido) continue;
    const res = CHK.checkItem(r.it, { mode: 'save' });
    if (res.ok) continue;
    if (res.fix) { CHK.fixItem(r.it, res.problems); out.changed = true; segLog('item_corrigido', owner, { personagem: who, item: cleanStr(r.it.name || r.it.id, 40), motivo: res.problems.join(',') }, 10 * 60000); }
    else retain(r, res.problems.join(','));
  }
  return out;
}

// ---- itens do save (v0.11): o servidor SÓ REGISTRA o que parece trapaça — nunca apaga item, cofre ou bolsa ----
// cofre maior que o comprado com diamantes, bolsa crescendo acima do teto do nível e muitos vermelhos/brancos de uma vez.
async function auditItems(owner, p, prev, now, lvl) {
  const who = cleanStr(p.name, 16), eq = p.equipment && typeof p.equipment === 'object' ? Object.values(p.equipment) : [];
  const inv = Array.isArray(p.inventory) ? p.inventory : [], vault = Array.isArray(p.vault) ? p.vault : [];
  let w = 0, r = 0;
  for (const it of [...inv, ...eq, ...vault]) if (it && it.kind === 'equip') { if (it.rarity === 'lendario') w++; else if (it.rarity === 'mitico') r++; }
  const vl = Math.min(100000, vault.length), bag = inv.filter(Boolean).length, teto = Math.min(300, 15 + lvl);
  const vb = Number.isFinite(prev?.vb) ? prev.vb : Math.max(COFRE.base, Math.min(vl, 120)); // 1ª vez: o tamanho que já tinha (até 120, o máximo antigo com ouro)
  if (vl > vb) {
    const n = (await diaGet(owner)).spent.filter((x) => x.sku === COFRE.sku).length, max = cofreMax(vb, n);
    if (vl > max) segLog('cofre_grande', owner, { personagem: who, espacos: vl, max }, 30 * 60000);
  }
  if (bag > teto && Number.isFinite(prev?.bag) && bag > prev.bag) segLog('bolsa_acima_do_teto', owner, { personagem: who, itens: bag, teto, antes: prev.bag }, 30 * 60000);
  if (prev?.t && Number.isFinite(prev.w) && now - prev.t < 6 * H) {
    if (w - prev.w >= 2) segLog('brancos_rapido', owner, { personagem: who, brancos: `${prev.w}→${w}`, minutos: Math.round((now - prev.t) / 60000) }, 30 * 60000);
    if (r - (prev.r || 0) >= 4) segLog('vermelhos_rapido', owner, { personagem: who, vermelhos: `${prev.r || 0}→${r}`, minutos: Math.round((now - prev.t) / 60000) }, 30 * 60000);
  }
  return { w, r, vb, bag };
}

// ---- banco: só sobe com correio recebido, transferência devolvida ou depósito de ouro que existe nos personagens ----
// (se recusar, o jogo desfaz o depósito sozinho: o ouro volta para a bolsa)
async function checkBank(owner, body, write) {
  if (isGmName(owner)) { await write(); return null; }
  return acctLock(owner, async () => {
    const now = Date.now(), Lg = await ledgerGet(owner), g = toInt(body.gold, 0, GOLD_MAX, 0);
    body.gold = g;
    let prev = Lg.bank ? toInt(Lg.bank.g, 0, GOLD_MAX, 0) : null;
    if (prev === null) { const s = await store.getDoc(owner, 'rift_bank'); prev = s ? toInt(s.gold, 0, GOLD_MAX, 0) : 0; }
    const d = g - prev;
    if (d < 0) Lg.deb.push({ n: -d, t: now });
    else if (d > 0) {
      let need = d;
      need -= take(Lg.bcred, need); // correio recebido
      need -= take(Lg.deb, need);   // transferência que falhou e voltou
      if (need > 0) {
        await seedChars(owner, Lg);
        const ch = Object.values(Lg.ch), lv = Math.max(1, ...ch.map((c) => c.l || 1));
        const free = ch.reduce((a, c) => a + (c.g || 0), 0) - sumN(Lg.pend) + goldAllow(lv, 5 * 60000);
        if (need > free) { segLog('banco_recusado', owner, { antes: prev, veio: g, sem_origem: need - Math.max(0, free) }, 0); return 'O banco recusou: esse ouro não está nos seus personagens.'; }
        Lg.pend.push({ n: need, t: now }); // tem que sair de um personagem no próximo save
      }
    }
    Lg.bank = { g, t: now };
    await ledgerSet(owner, Lg);
    await write();
    return null;
  });
}

// ---- mercado: quem compra precisa ter o ouro (no último save conferido, com folga para os últimos segundos) ----
async function buyerCheck(owner, price) {
  if (isGmName(owner)) return null;
  return acctLock(owner, async () => {
    const now = Date.now(), Lg = await ledgerGet(owner);
    await seedChars(owner, Lg);
    const ch = Object.values(Lg.ch);
    if (!ch.length) return null;
    const best = Math.max(...ch.map((c) => (c.g || 0) + ((5e4 + 2e3 * (c.l || 1)) * Math.min(now - (c.t || now), 10 * 60000)) / 60000)) + 100000 + sumN(Lg.deb) + sumN(Lg.cred);
    if (price > best) { segLog('mercado_sem_ouro', owner, { preco: price, tinha: Math.round(best - 100000) }, 0); return 'O servidor ainda não viu esse ouro no seu personagem. Espere alguns segundos e tente de novo.'; }
    Lg.pend.push({ n: price, t: now }); // o preço tem que sair do personagem
    await ledgerSet(owner, Lg);
    return null;
  });
}

// ---- jogadores conectados: roupa premium só com compra, nome só do dono, nível do save conferido ----
const FX_SKU = { geada: 'fx_geada', ouro: 'fx_ouro', trovao: 'fx_trovao' };
function loadOwned(peer) {
  if (!peer.account) { peer.owns = new Set(); return; }
  diaGet(peer.account).then((d) => { peer.owns = new Set(d.spent.flatMap((x) => [x.sku, ...(DIA_LEGACY[x.sku] || [])])); }).catch(() => {});
}
function loadLvlCap(peer, cid = peer.presence?.id) {
  if (!peer.account || !cid || peer.gm) return;
  ledgerGet(peer.account).then((L) => { if (peer.presence?.id === cid && L.ch[cid]) peer.lvlCap = L.ch[cid].l; }).catch(() => {});
  gdLoad(peer, cid);
}
function vetName(peer) {
  const n = peer.presence?.n;
  if (typeof n !== 'string' || !n || peer.nameOk === n || peer.nameChk === n) return;
  peer.nameChk = n;
  const key = nameKey(n);
  Promise.all([store.getDoc(NAMES, key), key !== peer.account ? store.getUser(key) : null]).then(([reg, acc]) => {
    peer.nameChk = null;
    if ((reg?.owner && reg.owner !== peer.account) || acc) { peer.nameBad = n; segLog('nome_de_outro', peer.account || peer.ip, { nome: n }, 10 * 60000); peersChanged(peer.sv); }
    else peer.nameOk = n;
  }).catch(() => { peer.nameChk = null; });
}
function cleanPresence(peer, raw, now) {
  const p = {};
  for (const [k, v] of Object.entries(raw).slice(0, 60)) {
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) p[k] = v;
    else if (typeof v === 'string') p[k] = v.slice(0, k === 'eq' ? 800 : 120);
  }
  if (p.n !== undefined) p.n = cleanStr(p.n, 16);
  const ready = peer.authDone || now - peer.joined > 10000; // espera a conta ser conferida (alguns segundos)
  if (ready && !peer.gm && !peer.bot) {
    if (typeof p.sk === 'string' && DIA_PRICES['hs_' + p.sk] && !peer.owns?.has('hs_' + p.sk)) { segLog('roupa_sem_compra', peer.account || peer.ip, { roupa: p.sk }, 10 * 60000); p.sk = 'campones'; }
    if (FX_SKU[p.fx] && !peer.owns?.has(FX_SKU[p.fx])) { segLog('efeito_sem_compra', peer.account || peer.ip, { efeito: p.fx }, 10 * 60000); p.fx = 'nenhum'; }
    if (p.n) { if (p.n === peer.nameBad) p.n = 'Viajante'; else { peer.presence = { ...peer.presence, n: p.n }; vetName(peer); } }
    if (peer.lvlCap && +p.l > peer.lvlCap + 2) p.l = peer.lvlCap;
  }
  moveCheck(peer, p, now);
  return p;
}
// velocidade: só registra (portais, pergaminhos e renascer são saltos e não contam)
function moveCheck(peer, p, now) {
  if (peer.gm || peer.bot || !p.c || p.d) { peer.mv = null; return; }
  const x = +p.x, z = +p.z, ar = p.ar || 'world';
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const v = peer.mv;
  if (!v || v.ar !== ar) { peer.mv = { x, z, ar, wx: x, wz: z, wt: now, tp: 0, tpT: now }; return; }
  if (Math.hypot(x - v.x, z - v.z) > 40) { v.tp++; v.wx = x; v.wz = z; v.wt = now; } // teleporte
  else if (now - v.wt >= 3000) {
    const sp = Math.hypot(x - v.wx, z - v.wz) / ((now - v.wt) / 1000), max = p.mt || MONTARIAS[peer.account] ? 200 : 35;
    if (sp > max) segLog('velocidade', peer.account || peer.ip, { nome: p.n, m_por_s: Math.round(sp), area: ar }, 5 * 60000);
    v.wx = x; v.wz = z; v.wt = now;
  }
  v.x = x; v.z = z;
  if (now - v.tpT > 60000) { if (v.tp > 15) segLog('teleportes', peer.account || peer.ip, { nome: p.n, por_minuto: v.tp }, 5 * 60000); v.tp = 0; v.tpT = now; }
}
// golpe PvP: confere as regras no servidor (antes valia qualquer dano, de qualquer distância, até em quem saiu do jogo)
function pvpHitOk(a, t, d, now) {
  const A = a.presence || {}, T = t.presence || {}, who = a.account || a.ip;
  if (!bucket(a, 'vh', 12, 8)) return false;
  if (a.gm || t.gm || !A.c || A.d || T.d || +A.pv !== 2 || (+A.l || 0) < 30 || !(+T.pv >= 1 || +T.pk > 0) || (A.pt && A.pt === T.pt) || (A.ar || 'world') !== (T.ar || 'world')) return false;
  const dist = Math.hypot((+A.x || 0) - (+T.x || 0), (+A.z || 0) - (+T.z || 0));
  if (!(dist <= 60)) { segLog('pvp_longe', who, { nome: A.n, metros: Math.round(dist) }, 5 * 60000); return false; }
  const cap = 400 * (Math.min(+A.l || 1, a.lvlCap || MAX_LEVEL) + 30);
  if (!(+d.dmg <= cap)) { segLog('pvp_dano', who, { nome: A.n, dano: Math.round(+d.dmg) || String(d.dmg).slice(0, 20), max: cap }, 5 * 60000); d.dmg = cap; }
  (t.hitAt ||= new Map()).set(a.id, now);
  return true;
}

// ---------------- contas e saves (HTTP /api) ----------------
// Montarias especiais por conta (apelido em minúsculas). Mude sem mexer no código com a variável
// de ambiente MONTARIAS no Render, ex.: "lil:cavalo,pedrocas:lobo" (padrão: só o lil, com o cavalo)
// GMs (nome com "GM" dourado para todos): variável GMS, ex.: "lil,pedrocas" (padrão: lil). Só o servidor decide quem é GM.
const GMS = new Set(String(process.env.GMS || 'lil,pedrocas').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const MONTARIAS = Object.fromEntries(String(process.env.MONTARIAS || 'lil:cavalo,pedrocas:lobo').split(',').map((x) => x.trim().toLowerCase().split(':')).filter((x) => x.length === 2 && ['cavalo', 'lobo'].includes(x[1])));
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
    if (p === '/api/servers') return json(res, 200, { servers: SERVERS.map((x) => ({ ...x, online: [...peers.values()].filter((q) => q.sv === x.id && !q.old && q.presence?.c).length })) });
    if (p.startsWith('/api/site/')) return siteApi(req, res, p);
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
        if (loginLocked(byEmail.name)) return json(res, 429, { error: LOCK_MSG });
        if (!(await checkPass(pass, byEmail.salt, byEmail.hash))) { loginFail(byEmail.name); return json(res, 401, { error: 'Senha incorreta.' }); }
        loginFails.delete(byEmail.name);
        return json(res, 200, { token: byEmail.token, user: byEmail.nick || byEmail.name });
      }
      if (byEmail) return json(res, 409, { error: 'Esse e-mail já tem uma conta. Entre com a senha.' });
      const nick = cleanStr(String(b.nick || '').trim(), 20), name = nick.toLowerCase();
      if (mode === 'register') {
        if (!NAME_RE.test(name)) return json(res, 400, { error: 'Apelido: 3 a 20 letras, números, ponto, traço ou _.' });
        if (nameBlocked(name) || await store.getUser(name)) return json(res, 409, { error: 'Esse apelido já está em uso. Escolha outro.' });
        const { salt, hash } = await hashPass(pass), token = newToken();
        await store.addUser({ name, nick, salt, hash, token, email });
        return json(res, 200, { token, user: nick });
      }
      if (mode === 'link') { // conta antiga (sem Google): apelido + senha antigos e liga ao e-mail
        const u = await store.getUser(name);
        if (u && loginLocked(u.name)) return json(res, 429, { error: LOCK_MSG });
        if (!u || !(await checkPass(pass, u.salt, u.hash))) { if (u) loginFail(u.name); return json(res, 401, { error: 'Apelido ou senha da conta antiga incorretos.' }); }
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
        if (nameBlocked(name) || await store.getUser(name)) return json(res, 409, { error: 'Esse apelido já está em uso. Escolha outro.' });
        if (await store.userByEmail(email)) return json(res, 409, { error: 'Esse e-mail já tem uma conta. Entre com ele.' });
        const { salt, hash } = await hashPass(pass), token = newToken();
        await store.addUser({ name, nick: cleanStr(String(b.user || '').trim(), 20), salt, hash, token, email });
        return json(res, 200, { token, user: String(b.user || '').trim(), email });
      }
      // entrar: pode usar o e-mail OU o apelido
      const u = login.includes('@') ? await store.userByEmail(login) : await store.getUser(login);
      if (u && loginLocked(u.name)) return json(res, 429, { error: LOCK_MSG });
      if (!u || !(await checkPass(pass, u.salt, u.hash))) { if (u) loginFail(u.name); return json(res, 401, { error: 'E-mail/apelido ou senha incorretos.' }); }
      loginFails.delete(u.name);
      return json(res, 200, { token: u.token, user: u.nick || u.name, email: u.email || null, montaria: MONTARIAS[u.name] || null, gm: GMS.has(u.name) });
    }
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const owner = auth ? await store.userByToken(auth) : null;
    if (!owner) return json(res, 401, { error: 'Entre na sua conta de novo.' });
    if (SPECIAL_OWNERS.has(owner)) { segLog('conta_reservada', owner, { ip }, 0); return json(res, 403, { error: 'Conta inválida.' }); }
    if (!apiBucket(owner)) { segLog('api_excesso', owner, { ip }); return json(res, 429, { error: 'Muitos pedidos. Espere um pouco.' }); }
    if (p === '/api/me') { const u = await store.getUser(owner); return json(res, 200, { user: u?.nick || owner, email: u?.email || null, store: store.kind, montaria: MONTARIAS[String(owner).toLowerCase()] || null, gm: GMS.has(String(owner).toLowerCase()) }); }
    // ---- diamantes 💎: o saldo fica SÓ no servidor (o jogador não consegue escrever) ----
    if (p === '/api/dia' && req.method === 'GET') { const d = await diaGet(owner); return json(res, 200, { total: d.total, spent: d.spent, balance: diaBal(d), gm: GMS.has(String(owner).toLowerCase()) }); }
    if (p === '/api/dia/spend' && req.method === 'POST') {
      const b = await readBody(req, 1024), sku = String(b.sku || '');
      let price = DIA_PRICES[sku];
      if (!price) return json(res, 400, { error: 'Este item não está à venda.' });
      return diaLock(async () => {
        const d = await diaGet(owner);
        if (sku === COFRE.sku) { // cofre do banco: o preço sobe a cada compra (50, 75, 100, 125) e para no dobro do cofre
          const n = d.spent.filter((x) => x.sku === COFRE.sku).length;
          if (n >= COFRE.buys) { segLog('cofre_alem_do_maximo', owner, { compras: n }, 10 * 60000); return json(res, 400, { error: 'Seu cofre já está no tamanho máximo.' }); }
          price = COFRE.price(n);
        }
        if (!DIA_REPEAT.has(sku) && diaOwns(d, sku)) return json(res, 200, { ok: true, owned: true, balance: diaBal(d), spent: d.spent });
        if (DIA_REQUIRES[sku] && !diaOwns(d, DIA_REQUIRES[sku])) return json(res, 400, { error: 'Compre a roupa primeiro: a cor extra vale só para quem já tem a roupa.' });
        if (sku === 'mk10' && MKT_MAX + MKT_EXTRA * d.spent.filter((x) => x.sku === 'mk10').length >= MKT_TOP) return json(res, 400, { error: `Você já tem o máximo de ${MKT_TOP} espaços de venda.` });
        if (diaBal(d) < price) return json(res, 400, { error: `Faltam ${price - diaBal(d)} 💎.` });
        d.spent.push({ sku, p: price, t: Date.now() }); if (d.spent.length > 500) d.spent = d.spent.slice(-500);
        await store.setDoc(DIA_OWNER, String(owner).toLowerCase(), d);
        for (const q of peers.values()) if (q.account === owner) loadOwned(q); // a roupa nova já vale para os outros verem
        return json(res, 200, { ok: true, balance: diaBal(d), spent: d.spent });
      });
    }
    if (p === '/api/dia/grant' && req.method === 'POST') {
      if (!GMS.has(String(owner).toLowerCase())) return json(res, 403, { error: 'Só o dono do jogo pode creditar diamantes.' });
      const b = await readBody(req, 1024), to = String(b.to || '').trim().toLowerCase(), n = Math.floor(+b.n);
      if (!(n > 0) || n > 1000000) return json(res, 400, { error: 'Quantidade inválida.' });
      const u = await store.getUser(to);
      if (!u) return json(res, 404, { error: 'Conta não encontrada (use o apelido de login).' });
      return diaLock(async () => {
        const d = await diaGet(to);
        d.total += n; d.log = (d.log || []).concat([{ n, t: Date.now(), by: String(owner) }]).slice(-40);
        await store.setDoc(DIA_OWNER, to, d);
        return json(res, 200, { ok: true, total: d.total, balance: diaBal(d), user: u.nick || u.name });
      });
    }
    // contas antigas (só apelido) podem cadastrar um e-mail
    if (p === '/api/email' && req.method === 'POST') {
      const b = await readBody(req, 2048), email = String(b.email || '').trim().toLowerCase(), u = await store.getUser(owner);
      if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Digite um e-mail válido.' });
      if (loginLocked(owner)) return json(res, 429, { error: LOCK_MSG });
      if (!u || !(await checkPass(String(b.pass || ''), u.salt, u.hash))) { loginFail(owner); return json(res, 401, { error: 'Senha incorreta.' }); }
      const other = await store.userByEmail(email);
      if (other && other.name !== owner) return json(res, 409, { error: 'Esse e-mail já está em outra conta.' });
      await store.setEmail(owner, email);
      return json(res, 200, { ok: true, email });
    }
    // ---- baú diário ----
    if (p === '/api/bau' && req.method === 'GET') {
      const b = await bauGet(owner), hoje = bauDay(), pode = b.last !== hoje;
      return json(res, 200, { pode, dia: pode ? bauProx(b, hoje) : b.dia, // sem poder: o dia que já abriu hoje
        seguidos: b.last >= hoje - 1 ? b.seguidos : 0, faltaMs: bauFalta(), dias: BAU_DIAS });
    }
    if (p === '/api/bau/abrir' && req.method === 'POST') {
      const body = (await readBody(req, 1024)) || {}, cid = cleanStr(body.cid, 40);
      return acctLock(owner, async () => {
        const now = Date.now(), hoje = bauDay(now), b = await bauGet(owner);
        if (b.last === hoje) {
          b.tent++; await store.setDoc(BAU, String(owner).toLowerCase(), b);
          if (b.tent >= 3) segLog('bau_repetido', owner, { tentativas: b.tent }, 30 * 60000);
          return json(res, 409, { error: 'Você já abriu o baú de hoje. Volte amanhã!', faltaMs: bauFalta(now) });
        }
        if (b.last > hoje) { segLog('bau_relogio', owner, { ultimo: b.last, hoje }, 0); return json(res, 409, { error: 'Volte amanhã!' }); }
        const dia = bauProx(b, hoje), D = BAU_DIAS[dia - 1];
        const Lg = await ledgerGet(owner); await seedChars(owner, Lg);
        const lvl = toInt(Lg.ch[cid]?.l || Math.max(1, ...Object.values(Lg.ch).map((c) => c.l || 1)), 1, MAX_LEVEL, 1);
        const ouro = Math.round(D.ouro * (1 + lvl / 10)), item = D.item && Math.random() < D.item ? pickW(BAU_RAR) : null;
        b.seguidos = b.last === hoje - 1 ? b.seguidos + 1 : 1;
        b.last = hoje; b.dia = dia; b.n++; b.tent = 0;
        b.hist = b.hist.concat([{ d: hoje, dia, ouro, item, cid, t: now }]).slice(-30);
        await store.setDoc(BAU, String(owner).toLowerCase(), b);
        Lg.cred.push({ n: ouro, t: now, k: 'bau' }); // o ouro do baú pode aparecer no save do personagem
        await ledgerSet(owner, Lg);
        return json(res, 200, { ok: true, dia, seguidos: b.seguidos, ouro, pocao: D.pocao || 0, tonico: D.tonico || 0, item, faltaMs: bauFalta(now) });
      });
    }
    // ---- Mercado dos Viajantes (no próprio servidor): anúncios de todos os jogadores ----
    if (p.startsWith('/api/market')) return market(req, res, p, owner);
    if (p.startsWith('/api/name/') && req.method === 'POST') return nameApi(req, res, p, owner);
    // ---- ferramentas de GM (só contas da lista GMS): ver uma conta e trocar a senha de quem esqueceu ----
    if (p.startsWith('/api/gm/') && req.method === 'POST') {
      if (!GMS.has(String(owner).toLowerCase())) return json(res, 403, { error: 'Só GM.' });
      if (p === '/api/gm/seguranca') return json(res, 200, { ok: true, list: segRecent.slice(-15).map((e) => `${e.t.slice(5, 16).replace('T', ' ')} ${e.tipo} · ${e.quem}${e.info ? ' · ' + e.info : ''}`) });
      const b = (await readBody(req, 4096)) || {}, who = String(b.user || '').trim().toLowerCase();
      const u = who.includes('@') ? await store.userByEmail(who) : await store.getUser(who);
      if (!u) return json(res, 404, { error: `Não existe conta "${b.user}" neste servidor${store.kind === 'arquivo' ? ' (ATENÇÃO: servidor SEM banco de dados — as contas somem a cada atualização)' : ''}.` });
      const mask = (e) => (e ? e.replace(/^(.).*(@.*)$/, '$1***$2') : 'sem e-mail');
      if (p === '/api/gm/conta') return json(res, 200, { ok: true, info: `Conta "${u.nick || u.name}" existe · e-mail ${mask(u.email)} · criada em ${new Date(+u.created || 0).toLocaleDateString('pt-BR')} · banco: ${store.kind}` });
      if (p === '/api/gm/senha') {
        const np = String(b.pass || '');
        if (np.length < 4 || np.length > 100) return json(res, 400, { error: 'A senha nova precisa ter pelo menos 4 caracteres.' });
        const { salt, hash } = await hashPass(np);
        loginFails.delete(u.name);
        await store.setPass(u.name, salt, hash, newToken()); // derruba as sessões antigas
        tries.clear();
        return json(res, 200, { ok: true, info: `Senha da conta "${u.nick || u.name}" trocada. Ela já pode entrar com a senha nova.` });
      }
      return json(res, 404, { error: 'não encontrado' });
    }
    // diretório de jogadores (para achar alguém pelo nome no banco, e para o site com os rankings)
    if (p === '/api/dir' && req.method === 'POST') {
      const b = await readBody(req, 4096);
      const n = String(b.n || '').replace(/\s+/g, ' ').trim().slice(0, 20), key = nameKey(n);
      if (!key) return json(res, 400, { error: 'Nome inválido.' });
      // o nome tem que ser desta conta (nomes são únicos no servidor)
      const reg = await store.getDoc(NAMES, key);
      if (reg && reg.owner && reg.owner !== owner) return json(res, 403, { error: 'Esse nome é de outra conta.' });
      const cur = (await store.getDoc(DIR, key)) || {};
      const num = (v, max) => Math.max(0, Math.min(max, Math.floor(+v || 0)));
      const kills = Array.isArray(b.pk) ? b.pk.slice(-30).map((k) => ({ n: cleanStr(k.n, 20), t: num(k.t, 9e15) })).filter((k) => k.n) : cur.pk || [];
      // ranking: o nível vem do save que o servidor já conferiu (não do que o jogo diz) e os abates PvP não pulam
      let lv = num(b.l, MAX_LEVEL), pvp = num(b.pvp, 1e7);
      if (!isGmName(owner)) {
        const Lg = await ledgerGet(owner), c = (reg?.charId && Lg.ch[reg.charId]) || Object.values(Lg.ch).find((x) => nameKey(x.n) === key);
        const top = c ? c.l : Math.max(10, cur.l || 0);
        if (lv > top) { segLog('ranking_nivel', owner, { nome: n, disse: lv, save: top }); lv = top; }
        const pmax = cur.t ? (cur.pvp || 0) + 2 + Math.floor((Date.now() - cur.t) / 10000) : 50;
        if (pvp > pmax) { segLog('ranking_pvp', owner, { nome: n, disse: pvp, max: pmax }); pvp = pmax; }
      }
      await store.setDoc(DIR, key, { n: cleanStr(n, 20), owner, code: cleanStr(b.code, 12), l: lv || 1, c: ['guerreiro', 'mago', 'arqueiro'].includes(b.c) ? b.c : cur.c || '',
        melee: num(b.melee, 5000), dist: num(b.dist, 5000), magic: num(b.magic, 5000), pvp, deaths: num(b.deaths, 1e7), guild: cleanStr(b.guild, 24), pk: kills, sv: num(b.sv, 9) || 1, t: Date.now() });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/dir' && req.method === 'GET') {
      const q = nameKey(new URL(req.url, 'http://x').searchParams.get('q') || '').replace('-', '');
      const list = (await store.listDocs(DIR)).map((d) => d.data).filter((x) => x && x.n && x.owner !== owner)
        .filter((x) => !q || nameKey(x.n).includes(q) || String(x.code || '').toLowerCase().replace('-', '').includes(q))
        .sort((a, b) => b.t - a.t).slice(0, 12).map((x) => ({ id: x.owner, n: x.n, l: x.l, c: x.c, code: x.code }));
      return json(res, 200, { list });
    }
    // correio: ouro enviado pelo banco chega no banco de quem recebe (mesmo offline)
    if (p === '/api/mail' && req.method === 'POST') {
      const b = await readBody(req, 4096);
      const to = String(b.to || '').toLowerCase(), gold = Math.floor(+b.gold);
      if (!to || to === owner) return json(res, 400, { error: 'Escolha para quem enviar.' });
      if (!(gold > 0 && gold <= 100000000)) return json(res, 400, { error: 'Valor inválido.' });
      if (!(await store.getUser(to))) return json(res, 404, { error: 'Jogador não encontrado.' });
      // o ouro precisa ter SAÍDO do banco de quem envia (o jogo salva o banco antes de enviar): ninguém cria ouro do nada
      const okMail = isGmName(owner) || await acctLock(owner, async () => {
        const Lg = await ledgerGet(owner);
        if (sumN(Lg.deb) < gold) return false;
        take(Lg.deb, gold); await ledgerSet(owner, Lg); return true;
      });
      if (!okMail) { segLog('correio_sem_saldo', owner, { ouro: gold, para: to }, 0); return json(res, 400, { error: 'Saldo do banco insuficiente.' }); }
      const id = 'g' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      await store.setDoc(MAIL, id, { to, from: owner, fromName: cleanStr(b.fromName || owner, 20), gold, t: Date.now() });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/mail/take' && req.method === 'POST') {
      return mailLock(async () => {
        const mine = (await store.listDocs(MAIL)).filter((d) => d.data?.to === owner);
        const total = mine.reduce((a, d) => a + Math.max(0, Math.floor(+d.data?.gold || 0)), 0);
        if (total > 0) await bankCredit(owner, total); // o banco de quem recebe pode subir esse tanto
        for (const d of mine) await store.delDoc(MAIL, d.id);
        return json(res, 200, { mail: mine.map((d) => d.data) });
      });
    }
    if (p === '/api/docs' && req.method === 'GET') return json(res, 200, { docs: await store.listDocs(owner) });
    const m = p.match(/^\/api\/docs\/([^/]+)$/);
    if (m && DOC_RE.test(m[1])) {
      const id = m[1];
      if (req.method === 'GET') { const d = await store.getDoc(owner, id); return json(res, 200, { exists: !!d, data: d }); }
      if (req.method === 'PUT') {
        // presente de nível: só um GM pode deixar (antes qualquer um se dava nível 1000 escrevendo este documento)
        if (id === 'rift_grant' && !isGmName(owner)) { segLog('presente_falso', owner, { ip }, 0); return json(res, 403, { error: 'Só GM.' }); }
        const b = await readBody(req);
        if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'dados inválidos' });
        const docs = await store.listDocs(owner);
        if (!docs.some((d) => d.id === id) && docs.length >= 40) return json(res, 400, { error: 'limite de documentos' });
        // personagens e banco: o servidor confere nível, XP e ouro antes de guardar
        if (id.startsWith('rift_char_')) await checkChar(owner, id, b, () => store.setDoc(owner, id, b));
        else if (id === 'rift_bank') { const err = await checkBank(owner, b, () => store.setDoc(owner, id, b)); if (err) return json(res, 400, { error: err }); }
        else await store.setDoc(owner, id, b);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { await store.delDoc(owner, id); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'não encontrado' });
  } catch (e) {
    reportError(e, 'api ' + req.method + ' ' + p.replace(/\/[^/]{16,}$/, '/:id'));
    return json(res, 500, { error: 'Erro no servidor: ' + (e?.message || e) });
  }
}

// ---------- Diamantes: preços (iguais aos do jogo, src/config/monetization.js) ----------
const DIA_OWNER = '__diamantes__';
const DIA_PRICES = {
  mk10: 100, // +10 espaços de venda no mercado (até 50)
  skin_rubi: 120, skin_geada: 120, skin_abismo: 200, skin_jade: 150, skin_dragao: 220,
  fx_geada: 80, fx_ouro: 80, fx_trovao: 100, // (auras removidas: aura_petalas/aura_vazio não se compram mais)
  tp3: 1, tp8: 2, // Pergaminhos de Teleporte: 3 por 💎1, 8 por 💎2 (pode comprar de novo)
  // skins dos heróis (iguais a src/config/heroskins.js): roupa e as cores extras (metade do preço)
  hs_campones_2: 50, hs_patrulheiro: 100, hs_patrulheiro_3: 50, hs_mago: 150, hs_mago_2: 75, hs_mago_3: 75,
  hs_nobre: 200, hs_nobre_2: 100, hs_nobre_3: 100, hs_cavaleiro: 250, hs_cavaleiro_2: 125, hs_cavaleiro_3: 125,
};
// cor extra só para quem já tem a roupa
const DIA_REQUIRES = { hs_patrulheiro_3: 'hs_patrulheiro', hs_mago_2: 'hs_mago', hs_mago_3: 'hs_mago', hs_nobre_2: 'hs_nobre', hs_nobre_3: 'hs_nobre', hs_cavaleiro_2: 'hs_cavaleiro', hs_cavaleiro_3: 'hs_cavaleiro' };
const DIA_REPEAT = new Set(['tp3', 'tp8', 'mk10', 'cofre10']);
// cofre do banco (igual a src/config/economia.js): começa com 40, +10 por compra, até 80 (o dobro). Compra da CONTA.
const COFRE = { sku: 'cofre10', base: 40, step: 10, buys: 4, price: (n) => 50 + 25 * n };
DIA_PRICES[COFRE.sku] = COFRE.price(0); // preço da 1ª compra (as outras sobem: ver /api/dia/spend)
// tamanho máximo honesto do cofre de um personagem: o que ele já tinha quando o servidor viu pela 1ª vez + compras, até o dobro
const cofreMax = (base, n) => { const b = Math.max(COFRE.base, base || COFRE.base); return Math.max(b, Math.min(Math.max(COFRE.base * 2, b), b + COFRE.step * Math.min(COFRE.buys, n))); };

// ---------- Baú diário (igual a src/config/economia.js; aqui é quem decide) ----------
// 1 por dia por CONTA, pelo relógio do SERVIDOR no horário de Brasília (mudar o relógio do aparelho não muda nada).
// Dias seguidos: 1 → 7 e volta ao 1; perdeu um dia, volta ao 1. O ouro entra no livro-caixa (o save pode subir esse tanto).
const BAU = '~bau', BAU_TZ = 3 * 3600e3;
const BAU_DIAS = [
  { ouro: 40, pocao: 3 }, { ouro: 60, pocao: 4, tonico: 1 }, { ouro: 80, pocao: 5, tonico: 1 }, { ouro: 110, pocao: 6, tonico: 2 },
  { ouro: 140, pocao: 7, tonico: 2, item: 0.1 }, { ouro: 180, pocao: 8, tonico: 3, item: 0.15 }, { ouro: 250, pocao: 10, tonico: 4, item: 0.3 },
];
const BAU_RAR = { incomum: 75, raro: 22, epico: 3 };
const bauDay = (t = Date.now()) => Math.floor((t - BAU_TZ) / 864e5);
const bauFalta = (t = Date.now()) => (bauDay(t) + 1) * 864e5 + BAU_TZ - t;
const bauGet = async (a) => { const d = await store.getDoc(BAU, String(a).toLowerCase()); return { last: Number.isFinite(+d?.last) ? +d.last : -1e9, dia: toInt(d?.dia, 0, 7, 0), seguidos: toInt(d?.seguidos, 0, 1e6, 0), n: toInt(d?.n, 0, 1e7, 0), hist: Array.isArray(d?.hist) ? d.hist.slice(-30) : [], tent: toInt(d?.tent, 0, 1e6, 0) }; };
// próximo dia da sequência (puro): ontem → continua; antes disso → volta ao 1
const bauProx = (b, hoje) => (b.last === hoje - 1 ? (b.dia % 7) + 1 : 1);
const pickW = (w) => { let t = 0; for (const k in w) t += w[k]; let r = Math.random() * t; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w).pop(); };
// skins antigas (antes dos heróis 3D): quem comprou ganhou a roupa nova equivalente e a cor
const DIA_LEGACY = { skin_rubi: ['hs_nobre'], skin_geada: ['hs_mago', 'hs_mago_3'], skin_abismo: ['hs_mago', 'hs_mago_2'], skin_jade: ['hs_patrulheiro', 'hs_patrulheiro_3'], skin_dragao: ['hs_cavaleiro', 'hs_cavaleiro_2'] };
const diaOwns = (d, sku) => d.spent.some((x) => x.sku === sku || DIA_LEGACY[x.sku]?.includes(sku));
async function diaGet(name) { const d = await store.getDoc(DIA_OWNER, String(name).toLowerCase()); return { total: Math.max(0, Math.floor(+d?.total || 0)), spent: Array.isArray(d?.spent) ? d.spent : [], log: Array.isArray(d?.log) ? d.log : [] }; }
// itens que saíram do jogo: o que foi gasto neles volta para o saldo (as auras, v0.9.92)
const DIA_REFUND = new Set(['aura_petalas', 'aura_vazio']);
function diaBal(d) { return Math.max(0, d.total - d.spent.reduce((a, x) => a + (DIA_REFUND.has(x.sku) ? 0 : Math.max(0, Math.floor(+x.p)) || 0), 0)); }
let diaQueue = Promise.resolve();
const diaLock = (fn) => { const r = diaQueue.then(fn, fn); diaQueue = r.catch(() => {}); return r; };

// ---------- SITE do jogo (público): rankings, busca de jogadores e mortes no PvP ----------
// Lê o diretório (~dir) que cada jogo atualiza. Nada de conta, e-mail ou dono aparece aqui.
let dirCache = { t: 0, list: [] };
async function dirAll() {
  if (Date.now() - dirCache.t < 20000) return dirCache.list;
  const list = (await store.listDocs(DIR)).map((d) => d.data).filter((x) => x && x.n);
  dirCache = { t: Date.now(), list };
  return list;
}
const pubEntry = (x) => ({ n: x.n, l: x.l || 1, c: x.c || '', pvp: x.pvp || 0, deaths: x.deaths || 0, sv: x.sv || 1, t: x.t || 0 });
function onlineNow() { // nome → servidor de quem está jogando agora
  const m = new Map();
  for (const q of peers.values()) if (!q.old && q.presence?.c && q.presence?.n) m.set(nameKey(q.presence.n), q.sv);
  return m;
}
const RANKS = {
  nivel: { f: () => true, k: (x) => x.l || 0 },
  guerreiro: { f: (x) => x.c === 'guerreiro', k: (x) => x.l || 0 },
  mago: { f: (x) => x.c === 'mago', k: (x) => x.l || 0 },
  arqueiro: { f: (x) => x.c === 'arqueiro', k: (x) => x.l || 0 },
  pvp: { f: (x) => (x.pvp || 0) > 0, k: (x) => x.pvp || 0 },
};
async function siteApi(req, res, p) {
  const q = new URL(req.url, 'http://x').searchParams;
  const sv = parseInt(q.get('sv'), 10) || 0; // 0 = todos os servidores
  const all = (await dirAll()).filter((x) => !sv || (x.sv || 1) === sv);
  const on = onlineNow();
  const withOn = (x) => ({ ...pubEntry(x), on: on.get(nameKey(x.n)) || 0 });
  if (p === '/api/site/rank') {
    const R = RANKS[q.get('by')] || RANKS.nivel, n = Math.max(1, Math.min(100, +q.get('n') || 50));
    const list = all.filter(R.f).sort((a, b) => R.k(b) - R.k(a) || (a.t || 0) - (b.t || 0)).slice(0, n).map(withOn);
    return json(res, 200, { list, total: all.length, servers: SERVERS });
  }
  if (p === '/api/site/search') {
    const k = nameKey(q.get('q') || '').slice(0, 20);
    if (!k) return json(res, 200, { list: [] });
    const list = all.filter((x) => nameKey(x.n).includes(k)).sort((a, b) => (nameKey(a.n) === k ? -1 : 0) - (nameKey(b.n) === k ? -1 : 0) || (b.l || 0) - (a.l || 0)).slice(0, 20).map(withOn);
    return json(res, 200, { list });
  }
  if (p === '/api/site/player') {
    const k = nameKey(q.get('n') || '');
    const x = (await dirAll()).find((d) => nameKey(d.n) === k);
    if (!x) return json(res, 404, { error: 'Jogador não encontrado.' });
    const every = await dirAll();
    const pos = (by) => { const R = RANKS[by]; if (!R || !R.f(x)) return 0; return every.filter(R.f).sort((a, b) => R.k(b) - R.k(a) || (a.t || 0) - (b.t || 0)).indexOf(x) + 1; };
    const rank = { nivel: pos('nivel'), classe: x.c ? pos(x.c) : 0, pvp: pos('pvp') };
    return json(res, 200, { player: { ...withOn(x), kills: (x.pk || []).slice().sort((a, b) => b.t - a.t), rank } });
  }
  if (p === '/api/site/kills') {
    const list = [];
    for (const x of all) for (const k of x.pk || []) list.push({ by: x.n, byL: x.l || 1, byC: x.c || '', n: k.n, t: k.t, sv: x.sv || 1 });
    list.sort((a, b) => b.t - a.t);
    return json(res, 200, { list: list.slice(0, Math.max(1, Math.min(100, +q.get('n') || 50))) });
  }
  if (p === '/api/site/resumo') {
    const online = [...peers.values()].filter((x) => !x.old && x.presence?.c);
    return json(res, 200, { jogadores: (await dirAll()).length, online: online.length, servers: SERVERS.map((x) => ({ ...x, online: online.filter((o) => o.sv === x.id).length })), versao: VERSION });
  }
  return json(res, 404, { error: 'não encontrado' });
}

// ---------- Nomes de personagem ÚNICOS no servidor inteiro ----------
// "Lil" e "lil" (e "Líl") contam como o mesmo nome. O nome de conta de outra pessoa também não pode
// ser usado (ninguém se passa pelo criador). Cada nome fica guardado no dono especial "~names".
const NAMES = '~names';
const DIR = '~dir', MAIL = '~mail';
let mailQueue = Promise.resolve();
const mailLock = (fn) => { const r = mailQueue.then(fn, fn); mailQueue = r.catch(() => {}); return r; };
const nameKey = (n) => String(n || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
let nameQueue = Promise.resolve();
const nameLock = (fn) => { const r = nameQueue.then(fn, fn); nameQueue = r.catch(() => {}); return r; };
async function nameApi(req, res, p, owner) {
  const b = (await readBody(req)) || {};
  const name = String(b.name || '').replace(/\s+/g, ' ').trim(), key = nameKey(name);
  const cid = typeof b.charId === 'string' && b.charId ? b.charId.slice(0, 40) : null;
  if (p === '/api/name/release') {
    return nameLock(async () => { const d = await store.getDoc(NAMES, key); if (d && d.owner === owner && (!cid || !d.charId || d.charId === cid)) await store.delDoc(NAMES, key); return json(res, 200, { ok: true }); });
  }
  if (p !== '/api/name/reserve' && p !== '/api/name/check') return json(res, 404, { error: 'não encontrado' });
  if (name.length < 3 || name.length > 16 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name)) return json(res, 400, { error: 'Nome inválido: use de 3 a 16 letras ou números.' });
  return nameLock(async () => {
    const taken = () => json(res, 409, { error: `O nome "${name}" já está em uso. Escolha outro.` });
    if (key !== owner && (await store.getUser(key))) return taken(); // nome da conta de outra pessoa
    const d = await store.getDoc(NAMES, key);
    if (d && d.owner !== owner) return taken();
    if (d && d.charId && cid && d.charId !== cid && (await store.getDoc(owner, 'rift_char_' + d.charId))) return json(res, 409, { error: `Você já tem um personagem chamado "${d.name}".` });
    if (p === '/api/name/check') return json(res, 200, { ok: true });
    await store.setDoc(NAMES, key, { owner, charId: cid || d?.charId || null, name, at: Date.now() });
    return json(res, 200, { ok: true, name });
  });
}

// v0.12: anúncios guardados de antes da troca dos sets (itens de "set de monstro") viram a peça do set do bioma, uma vez só
async function convertMarketOnce() {
  if (!CHK || (await store.getDoc(SEG, 'conv:mercado'))) return;
  let n = 0;
  for (const d of await store.listDocs(MKT)) {
    const l = d.data; if (!l || typeof l.item !== 'string') continue;
    let it; try { it = JSON.parse(l.item); } catch { continue; }
    if (!CHK.isOldItem(it) && !(it?.set && it?.src)) continue;
    CHK.convertOldItem(it); await store.setDoc(MKT, d.id, { ...l, item: JSON.stringify(it), name: cleanStr(it.name, 60) }); n++;
  }
  await store.setDoc(SEG, 'conv:mercado', { t: Date.now(), n });
  if (n) segLog('mercado_sets_trocados', 'servidor', { anuncios: n }, 0);
}

// Mercado: cada anúncio é um documento do dono especial "~market". O servidor decide quem compra
// (uma operação por vez), então nunca vende o mesmo item duas vezes.
const MKT = '~market', MKT_MAX = 10, MKT_DAYS = 3, MKT_FEE = 0; // v0.11: mercado SEM taxa (quem vende recebe o preço inteiro)
// espaços de venda: 10 de graça; cada compra de "mk10" (💎100) dá +10, até 50 no total
const MKT_EXTRA = 10, MKT_TOP = 50;
const mktMax = async (owner) => Math.min(MKT_TOP, MKT_MAX + MKT_EXTRA * (await diaGet(owner)).spent.filter((x) => x.sku === 'mk10').length);
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
      try { const it = JSON.parse(item); if (!it || !['equip', 'material', 'consumable'].includes(it.kind)) throw 0; if (it.soul || it.bound) { segLog('mercado_item_preso', owner, { item: cleanStr(it.name || it.id, 40) }, 0); return json(res, 400, { error: 'Esse item é preso ao personagem.' }); } } catch { return json(res, 400, { error: 'Item inválido.' }); }
      // com as regras do jogo (src/core/items.js): item que não existe, de missão ou preso à alma não vai à venda
      if (CORE) { const ok = CORE.sanitizeEntry(item, { next: Math.random }); if (!ok || !CORE.tradable(ok)) { segLog('mercado_item_invalido', owner, { item: item.slice(0, 120) }, 0); return json(res, 400, { error: 'Item inválido.' }); } }
      // v0.12: catálogo, fundo possível, nível, set — e item de set antigo (já devia ter sido trocado) não vai à venda
      if (CHK && !isGmName(owner)) { const r = CHK.checkItem(item, { mode: 'market' }); if (!r.ok) { segLog('mercado_item_impossivel', owner, { item: cleanStr(r.item?.name || r.item?.id || '', 40), motivo: r.problems.join(',') }, 0); return json(res, 400, { error: r.problems.includes('set_antigo') ? 'Esse item é de antes da troca dos sets: entre no jogo de novo para ele virar a peça nova.' : 'Esse item não existe nas regras do jogo.' }); } }
      const L = await all();
      const max = await mktMax(owner);
      if (L.filter((l) => l.seller === owner && l.status === 'open').length >= max) return json(res, 400, { error: max >= MKT_TOP ? `No máximo ${MKT_TOP} anúncios por jogador.` : `Seus ${max} espaços de venda estão cheios. Compre +${MKT_EXTRA} espaços por 💎100.`, full: true, max });
      if (L.length >= 2000) return json(res, 400, { error: 'O mercado está cheio agora. Tente mais tarde.' });
      const id = 'm' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      const data = { item, name: cleanStr(b.name, 60), price, seller: owner, sellerName: cleanStr(b.sellerName || owner, 20), t: Date.now(), status: 'open' };
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
      // quem compra precisa ter o ouro no save guardado (com folga para o que ganhou nos últimos segundos)
      const why = await buyerCheck(owner, l.price);
      if (why) return json(res, 400, { error: why });
      await store.setDoc(MKT, id, { ...l, status: 'sold', buyer: owner, buyerName: cleanStr(b.buyerName || owner, 20), soldAt: Date.now() });
      return json(res, 200, { item: l.item, price: l.price });
    }
    if (p === '/api/market/collect') {
      // ouro das vendas: entrega uma vez só e apaga os anúncios vendidos
      let total = 0, n = 0;
      for (const l of await all()) if (l.seller === owner && l.status === 'sold') { await store.delDoc(MKT, l.id); total += Math.floor(l.price * (1 - MKT_FEE / 100)); n++; }
      if (total > 0) await charCredit(owner, total, 'mercado'); // o ouro do personagem pode subir esse tanto
      return json(res, 200, { total, n });
    }
    return json(res, 404, { error: 'não encontrado' });
  });
}

const server = http.createServer((req, res) => {
  try { handle(req, res); } catch (e) { reportError(e, 'http'); try { res.writeHead(400); res.end('Bad request'); } catch { /* já respondeu */ } }
});
function handle(req, res) {
  secHeaders(req, res);
  // mudou de casa (ex.: Render → servidor próprio): REDIRECT_TO=https://novo-endereco manda todo mundo para lá
  if (process.env.REDIRECT_TO && !String(req.url || '').startsWith('/ws')) { res.writeHead(301, { Location: process.env.REDIRECT_TO.replace(/\/$/, '') + (req.url || '/') }); return res.end(); }
  // app da Play Store (Trusted Web Activity): prova que o site é do app → abre em tela cheia, sem barra de endereço.
  // Configure ANDROID_PACKAGE (ex.: com.eldoria.app) e ANDROID_SHA256 (impressão digital da chave, "AA:BB:…"; várias separadas por vírgula).
  if ((req.url || '').split('?')[0] === '/.well-known/assetlinks.json') {
    const pkg = String(process.env.ANDROID_PACKAGE || ''), fps = [...new Set([...String(process.env.ANDROID_SHA256 || '').split(','), 'FC:D3:91:1A:22:28:5B:74:62:0B:83:11:27:F8:F3:64:D0:14:A1:86:0A:E0:3C:69:37:60:CA:EF:39:68:22:F9', '58:CF:CA:8A:AF:D4:57:B9:FA:69:D4:25:2C:7D:4F:15:96:99:B7:BB:78:12:AA:68:0D:00:E9:84:3D:B0:66:BC'].map((x) => x.trim().toUpperCase()).filter(Boolean))]; // chave do app oficial (pública)
    if (!pkg || !fps.length) { res.writeHead(404); return res.end('[]'); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' });
    return res.end(JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fps } }]));
  }
  // endereço com % quebrado (ex.: /%E0%A4%A) derrubava o servidor inteiro: agora é só "não encontrado"
  let p; try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (p.includes('\0')) { res.writeHead(400); return res.end('Bad request'); }
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok ' + peers.size); }
  if (p.startsWith('/api/')) return api(req, res, p);
  if (p === '/site' || p === '/ranking') p = '/site.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!(file === ROOT || file.startsWith(ROOT + path.sep)) || BLOCK.test(path.relative(ROOT, file).replace(/\\/g, '/'))) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    // x-eldoria: o app instalado (service worker) só guarda/usa respostas que vieram mesmo do jogo,
    // nunca a página "acordando" do Render (plano grátis) que aparece quando o servidor está dormindo
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': p.endsWith('index.html') || p.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600', 'x-eldoria': VERSION });
    res.end(buf);
  });
}

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
  let qs; try { qs = new URL(req.url || '/', 'http://x').searchParams; } catch { return sock.destroy(); }
  const sv = svOf(qs.get('sv')), mk = String(qs.get('mundo') || '');
  const bot = MUNDO_KEY.length >= 12 && mk.length === MUNDO_KEY.length && crypto.timingSafeEqual(Buffer.from(mk), Buffer.from(MUNDO_KEY));
  const peer = { id, ip, sv, bot, sock, presence: {}, joined: Date.now(), updatedAt: Date.now(), buf: Buffer.alloc(0), alive: true, rate: { t: Date.now(), n: 0 } };
  peers.set(id, peer);
  send(peer, { t: 'hello', peer: id, now: Date.now(), sv });
  peersChanged(sv);
  sock.on('data', (chunk) => onData(peer, chunk));
  sock.on('close', () => drop(peer));
  sock.on('error', () => drop(peer));
});

// PvP: quem bateu em alguém fica com "block" por um tempo. Se sair do jogo (fechar a página) durante o block,
// o personagem CONTINUA no mundo até o block acabar — e pode ser derrotado (a morte vale quando ele voltar).
const pendingPvp = new Map(); // id do personagem -> { sk, by } (morreu enquanto estava desconectado)
function drop(peer, force = false) {
  if (!peers.has(peer.id)) return;
  if (peer.linger && !force) return; // já está parado no mundo esperando o block acabar
  try { peer.sock?.destroy(); } catch { /* já fechado */ }
  const bl = +peer.presence?.bl || 0;
  if (!force && !peer.old && !peer.linger && peer.presence?.c && !peer.presence.d && bl > Date.now()) {
    peer.linger = true; peer.sock = null;
    peer.lingerT = setTimeout(() => drop(peer, true), Math.min(10 * 60000, bl - Date.now() + 500));
    peersChanged(peer.sv);
    return;
  }
  clearTimeout(peer.lingerT);
  peers.delete(peer.id);
  peersChanged(peer.sv);
}
// golpe PvP num personagem que ficou no mundo (dono desconectado): o servidor aplica o dano
function lingerHit(from, target, d) {
  const P = target.presence; if (!P || P.d) return;
  const mh = Math.max(50, +P.mh || 500), dmg = Math.max(0, Math.min(1e7, +d.dmg || 0)) * 0.45;
  P.hp = Math.max(0, (+P.hp || 100) - (dmg / mh) * 100);
  target.updatedAt = Date.now();
  if (P.hp <= 0) {
    P.d = 1; P.hp = 0;
    if (P.id) pendingPvp.set(P.id, { sk: +P.pk || 0, by: String(from.presence?.n || '').slice(0, 16) });
    send(from, { t: 'msg', topic: 'fx', peer: target.id, data: { type: 'v_kill', to: from.id, sk: +P.pk || 0, id: P.id || null, n: P.n } });
    setTimeout(() => drop(target, true), 3000);
  }
  peersChanged(target.sv);
}

function frame(text, op = 1) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])]);
  return Buffer.concat([head, data]);
}
function send(peer, obj) { try { if (peer.sock && !peer.sock.destroyed) peer.sock.write(frame(JSON.stringify(obj))); } catch { /* ignora */ } }
// sv: só para quem está naquele servidor (sem sv: todos, ex.: aviso de manutenção)
function broadcast(obj, sv) { const f = frame(JSON.stringify(obj)); for (const p of peers.values()) { if (sv && p.sv !== sv) continue; try { if (p.sock && !p.sock.destroyed) p.sock.write(f); } catch { /* ignora */ } } }

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
  if (++peer.rate.n > 120) { if (peer.rate.n === 121) segLog('ws_flood', peer.account || peer.ip, { por_segundo: 120 }); return; } // limite de mensagens por segundo
  let m; try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m !== 'object') return;
  // a conta da conexão (o jogo manda o token logo depois de entrar): só assim o servidor sabe quem é GM
  if (m.t === 'auth' && typeof m.token === 'string' && m.token.length < 200) {
    if (now - (peer.authAt || 0) < 3000) return; // cada pedido consulta o banco: no máximo 1 a cada 3 s
    peer.authAt = now;
    store.userByToken(m.token).then((name) => {
      if (SPECIAL_OWNERS.has(name)) name = null;
      peer.account = name || null; peer.gm = !!name && GMS.has(String(name).toLowerCase()); peer.authDone = true;
      loadOwned(peer); loadLvlCap(peer); vetName(peer);
      peersChanged(peer.sv);
    }).catch(() => {});
    return;
  }
  if (m.t === 'pres' && m.p && typeof m.p === 'object' && !Array.isArray(m.p)) {
    if (text.length > 4096) { segLog('presenca_grande', peer.account || peer.ip, { bytes: text.length }); return; }
    const pr = cleanPresence(peer, m.p, now);
    // o mesmo personagem conectou de novo (saiu e entrou, recarregou a página): a conexão antiga cai na hora (sem "clone" parado)
    const cid = typeof pr.id === 'string' && pr.id ? pr.id : null;
    if (cid && peer.presence?.id !== cid) {
      for (const o of peers.values()) if (o !== peer && o.presence?.id === cid) { send(o, { t: 'kicked' }); setTimeout(() => drop(o, !!o.linger), 50); }
      peer.lvlCap = null; peer.gdOk = undefined; if (peer.authDone) setTimeout(() => loadLvlCap(peer, cid), 0); // depois de guardar a presença nova
    }
    peer.presence = pr; peer.updatedAt = now;
    gdCheck(peer, pr, now);
    // morreu no PvP enquanto estava fora (personagem ficou no mundo por causa do block): avisa ao voltar
    if (cid && pendingPvp.has(cid)) { send(peer, { t: 'pvpdead', ...pendingPvp.get(cid) }); pendingPvp.delete(cid); }
    // jogo aberto numa versão antiga (aba velha, cópia velha em cache): fica isolado e recebe "atualizar"
    // — assim uma aba velha não vira anfitriã e não bagunça os monstros de quem está na versão nova
    const old = (!!pr.n || peer.bot) && pr.vv !== VERSION;
    if (old && !peer.oldSent) { peer.oldSent = true; send(peer, { t: 'maint' }); }
    if (old !== !!peer.old) { peer.old = old; }
    return peersChanged(peer.sv);
  }
  if (m.t === 'emit' && TOPICS.has(m.topic)) {
    if (peer.old || (!peer.bot && peer.presence?.vv !== VERSION)) return; // versão antiga (ou nem entrou no jogo): não fala com os outros
    const d = m.data && typeof m.data === 'object' && !Array.isArray(m.data) ? m.data : null;
    if (!d) return;
    const host = lastHost.get(peer.sv), isHost = !!host && host === peer.id, who = peer.account || peer.ip;
    // tamanho e quantidade por tipo (o anfitrião manda o estado dos monstros: sem limite próprio)
    const L = m.topic === 'chat' ? [1500, 5, 0.5] : m.topic === 'fx' ? [32768, 120, 40] : isHost ? [65536, 0, 0] : [8192, 45, 35];
    if (text.length > L[0]) { segLog('msg_grande', who, { tipo: m.topic, bytes: text.length }); return; }
    if (L[1] && !bucket(peer, m.topic, L[1], L[2])) { segLog('flood_' + m.topic, who, { n: peer.presence?.n }); return; }
    // monstros: só o anfitrião manda o estado; os outros só mandam o dano que causaram, e só para ele
    if (m.topic === 'mob' && !isHost) {
      if (!Array.isArray(d.d) || d.to !== host) return;
      d.d = d.d.slice(0, 40);
    }
    // nome de quem fala/age: o da presença (que o servidor confere), nunca o que vem na mensagem
    if (typeof d.n === 'string' && typeof peer.presence?.n === 'string' && peer.presence.n) d.n = peer.presence.n;
    // bate-papo e privado: limite de tamanho, sem links (golpes) e palavras +18 bloqueiam o chat por 30 minutos
    if (m.topic === 'chat' || d.type === 's_dm') {
      if (d.type === 's_dm' && !bucket(peer, 'dm', 6, 0.5)) return;
      d.text = maskLinks(String(d.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 140));
      let left = banLeft(peer);
      if (!left && isAdult(d.text)) {
        const until = now + CHAT_BAN_MS, n = String(peer.presence?.n || '').toLowerCase();
        chatBans.set('ip:' + peer.ip, until); if (n) chatBans.set('n:' + n, until);
        left = CHAT_BAN_MS;
      }
      if (left) return send(peer, { t: 'msg', topic: 'fx', peer: 'server', data: { type: 's_ban', until: now + left } });
    }
    if (d.type === 'announce') d.text = String(d.text ?? '').slice(0, 120);
    // pacote 3: luta contra o Guardião. Quem cura perto da arena conta como participante; quando o anfitrião anuncia
    // a queda do Guardião, quem deu dano (lista dele) ou curou nos últimos 3 min — e está perto da arena — fica liberado.
    if (GD && d.type === 'hl' && peer.presence && GD.nearArena(peer.presence.ar, peer.presence.x, peer.presence.z)) peer.gdHeal = now;
    if (GD && m.topic === 'mob' && isHost && d.k !== undefined && d.gb) {
      const c = new Set(Array.isArray(d.c) ? d.c.slice(0, 40).map(String) : []);
      for (const q of peers.values()) {
        if (q.sv !== peer.sv || !q.presence || q.gdOk) continue;
        const dmg = c.has(String(q.id)), heal = now - (q.gdHeal || 0) < 180000;
        if ((dmg || heal) && GD.nearArena(q.presence.ar, q.presence.x, q.presence.z, 90)) gdGrant(q, dmg ? 'dano' : 'cura');
      }
    }
    // mensagem para uma pessoa só (convite, troca, privado, golpe PvP): vai só para ela
    if (typeof d.to === 'string') {
      const target = peers.get(d.to);
      if (target && target.sv !== peer.sv) return; // outro servidor: não alcança
      if (target && d.type === 'v_hit' && !pvpHitOk(peer, target, d, now)) return;
      if (target && d.type === 'v_kill' && !((peer.hitAt?.get(target.id) || 0) > now - 90000)) { segLog('pvp_abate_falso', who, { para: target.presence?.n }); return; }
      if (target && d.type === 'tr_off' && CHK && !peer.gm && Array.isArray(d.items)) { // v0.12: item impossível não entra na troca
        const bad = d.items.map((x) => CHK.checkItem(String(x).slice(0, 6000), { mode: 'trade' })).find((r) => !r.ok);
        if (bad) { segLog('troca_item_impossivel', who, { item: cleanStr(bad.item?.name || bad.item?.id || '', 40), motivo: bad.problems.join(',') }, 60000); return; }
      }
      if (target) noteTrade(peer, target, d, now);
      if (target?.linger) { if (d.type === 'v_hit') lingerHit(peer, target, d); return; }
      if (target) send(target, { t: 'msg', topic: m.topic, peer: peer.id, data: d });
      return;
    }
    // selo de GM: quem decide é o servidor (o que o jogador mandar é ignorado)
    if (m.topic === 'chat') d.gm = peer.gm ? 1 : 0;
    // estado dos monstros de UM mapa (o anfitrião manda separado por mapa): só para quem está nele
    if (m.topic === 'mob' && typeof d.ar === 'string' && d.s) {
      const f = frame(JSON.stringify({ t: 'msg', topic: 'mob', peer: peer.id, data: d }));
      for (const p of peers.values()) { if (p.sv !== peer.sv || p === peer || (p.presence?.ar || 'world') !== d.ar) continue; try { if (p.sock && !p.sock.destroyed) p.sock.write(f); } catch { /* ignora */ } }
      return;
    }
    broadcast({ t: 'msg', topic: m.topic, peer: peer.id, data: d }, peer.sv);
  }
  if (m.t === 'ping') send(peer, { t: 'pong', at: m.at });
}

// ANFITRIÃO ÚNICO (quem simula os monstros, o dia/noite e os eventos para todos): o servidor escolhe
// e avisa todo mundo, então nunca há dois mundos diferentes. É quem está há mais tempo conectado
// ENTRE os que estão jogando de verdade (personagem em jogo, tela aberta e mandando sinal nos últimos 8 s).
const lastHost = new Map(); // servidor -> anfitrião
// Anfitrião (quem simula os monstros do servidor): prefere PC a celular (celular esquenta e trava com o mundo todo);
// entre iguais, quem entrou primeiro. Fica com o atual enquanto ele servir (trocar reinicia os monstros de todos).
function pickHost(sv) {
  // mundo no servidor ligado e respondendo: ele é sempre o anfitrião (nenhum jogador carrega o mundo)
  const now0 = Date.now(), okBot = (p) => p && p.bot && p.sv === sv && !p.old && p.sock && now0 - p.updatedAt <= 8000;
  const curB = peers.get(lastHost.get(sv)); if (okBot(curB)) return curB.id;
  for (const p of peers.values()) if (okBot(p)) return p.id;
  // nh: 1 = cliente que nunca simula o mundo (app nativo da Godot): nunca vira anfitrião
  const now = Date.now(), ok = (p) => p && p.sv === sv && !p.old && !p.linger && p.presence?.c && p.presence.v !== 0 && !p.presence.nh && now - p.updatedAt <= 8000;
  let best = null;
  for (const p of peers.values()) {
    if (!ok(p)) continue;
    if (!best || (p.presence.mb ? 1 : 0) < (best.presence.mb ? 1 : 0) || ((p.presence.mb ? 1 : 0) === (best.presence.mb ? 1 : 0) && p.joined < best.joined)) best = p;
  }
  const cur = peers.get(lastHost.get(sv));
  if (ok(cur) && best && (cur.presence.mb ? 1 : 0) <= (best.presence.mb ? 1 : 0)) return cur.id;
  return best ? best.id : null;
}
setInterval(() => { for (const { id } of SERVERS) if (pickHost(id) !== (lastHost.get(id) ?? null)) peersChanged(id); }, 2000);

// lista de jogadores (de cada servidor): enviada no máximo a cada 50 ms (posições chegam quase em tempo real)
const pending = new Map();
// Lista de jogadores: no máximo 10 vezes por segundo (antes até 30). Cada um recebe a posição em tempo real só de
// quem está no MESMO mapa; os de outros mapas vão inteiros 1 vez por segundo (no meio, só "continua aí": keep).
const lastFull = new Map();
function peersChanged(sv = 1) {
  if (pending.get(sv)) return;
  pending.set(sv, setTimeout(() => {
    pending.delete(sv);
    const now = Date.now();
    const all = [...peers.values()].filter((p) => !p.old && p.sv === sv);
    const ent = new Map(all.map((p) => [p.id, { peer: p.id, presence: { ...p.presence, gm: p.gm ? 1 : 0, lg: p.linger ? 1 : 0 }, updatedAt: p.updatedAt }]));
    const host = pickHost(sv); lastHost.set(sv, host);
    const full = now - (lastFull.get(sv) || 0) >= 1000;
    if (full) { lastFull.set(sv, now); return broadcast({ t: 'peers', peers: [...ent.values()], host, now }, sv); }
    const byArea = new Map();
    for (const r of peers.values()) {
      if (r.sv !== sv || !r.sock) continue;
      const ar = r.presence?.ar || 'world';
      let f = byArea.get(ar);
      if (!f) {
        const same = [], keep = [];
        for (const p of all) ((p.presence?.ar || 'world') === ar ? same.push(ent.get(p.id)) : keep.push(p.id));
        f = frame(JSON.stringify({ t: 'peers', peers: same, keep, partial: 1, host, now }));
        byArea.set(ar, f);
      }
      try { if (!r.sock.destroyed) r.sock.write(f); } catch { /* ignora */ }
    }
  }, 100));
}

// limpa bloqueios vencidos
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of chatBans) if (t < now) chatBans.delete(k);
  for (const [k, t] of tradeFin) if (now - t > 20 * 60000) tradeFin.delete(k);
  for (const [k, mm] of tradeOffer) { for (const [f, o] of mm) if (now - o.t > 20 * 60000) mm.delete(f); if (!mm.size) tradeOffer.delete(k); }
  for (const [k, f] of loginFails) if (now - f.at > LOCK_MS) loginFails.delete(k);
  for (const [k, b] of apiBuckets) if (now - b.t > 120000) apiBuckets.delete(k);
}, 60000);

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
    if (p.linger) continue; // personagem parado no mundo (block do PvP): sai sozinho quando o block acaba
    if (!p.alive) { drop(p); continue; }
    p.alive = false;
    try { p.sock.write(Buffer.from([0x89, 0])); } catch { drop(p); }
  }
}, 10000);

server.listen(PORT, () => console.log(`ELDORIA ${VERSION} online na porta ${PORT} · servindo ${ROOT} · saves: ${store.kind}`));
// "despertador": o Render grátis dorme depois de 15 min sem visitas e mostra a tela dele para quem chega.
// O próprio servidor se visita pelo endereço público a cada 10 min, então nunca dorme. KEEP_AWAKE=0 desliga.
{
  const url = String(process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (url && process.env.KEEP_AWAKE !== '0' && !process.env.REDIRECT_TO) {
    setInterval(() => { fetch(url + '/api/status', { headers: { 'user-agent': 'eldoria-despertador' } }).catch(() => {}); }, 10 * 60 * 1000).unref?.();
    console.log('despertador ligado:', url);
  }
}
