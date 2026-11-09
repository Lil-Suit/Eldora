// Contas e personagens salvos no servidor.
// Com a variável DATABASE_URL (Postgres: Neon, Supabase, Render...) os saves ficam guardados para sempre.
// Sem ela, guarda num arquivo (server/data.json), que some quando o Render reinicia: serve só para testes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function openStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const { default: pg } = await import('pg');
      const local = /localhost|127\.0\.0\.1|\/var\/run|host=\//.test(url);
      const pool = new pg.Pool({ connectionString: url, max: 4, ssl: local ? false : { rejectUnauthorized: false }, idleTimeoutMillis: 20000 });
      await pool.query(`CREATE TABLE IF NOT EXISTS eldoria_users (name TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, token TEXT NOT NULL, created BIGINT NOT NULL)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS eldoria_docs (owner TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY (owner, id))`);
      await pool.query(`CREATE INDEX IF NOT EXISTS eldoria_users_token ON eldoria_users (token)`);
      console.log('Saves: banco de dados Postgres conectado');
      return {
        kind: 'postgres',
        async getUser(name) { const r = await pool.query('SELECT * FROM eldoria_users WHERE name=$1', [name]); return r.rows[0] || null; },
        async userByToken(token) { const r = await pool.query('SELECT name FROM eldoria_users WHERE token=$1', [token]); return r.rows[0]?.name || null; },
        async addUser(u) { await pool.query('INSERT INTO eldoria_users (name, salt, hash, token, created) VALUES ($1,$2,$3,$4,$5)', [u.name, u.salt, u.hash, u.token, Date.now()]); },
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
    async listDocs(owner) { return Object.entries(db.docs[owner] || {}).map(([id, data]) => ({ id, data })); },
    async getDoc(owner, id) { return db.docs[owner]?.[id] || null; },
    async setDoc(owner, id, data) { (db.docs[owner] ||= {})[id] = data; flush(); },
    async delDoc(owner, id) { if (db.docs[owner]) { delete db.docs[owner][id]; flush(); } },
  };
}

export function hashPass(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
  return { salt, hash };
}
export function checkPass(pass, salt, hash) {
  const h = crypto.scryptSync(pass, salt, 32);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(h, ref);
}
export const newToken = () => crypto.randomBytes(24).toString('hex');
