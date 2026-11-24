import { migrateState, validateState, encodeSaveCode, decodeSaveCode } from '../core/state.js';
import { BALANCE } from '../config/balance.js';
import { CLASSES } from '../config/classes.js';

// Salvamento por PERSONAGEM (espaços separados): navegador (localStorage) + nuvem da conta.
// Cada personagem tem seu próprio documento, então dois aparelhos com personagens diferentes não se sobrescrevem.
const OLD_KEY = 'rift.save.v1';
const INDEX_KEY = 'rift.chars.v1';
const CHAR_KEY = (id) => 'rift.char.v1.' + id;
const SETTINGS_KEY = 'rift.settings.v1';
export const MAX_CHARS = 8;

// id estável: saves antigos sem id recebem sempre o MESMO id (derivado da data de criação),
// para não virarem várias cópias quando abertos em aparelhos diferentes.
export function charIdOf(s) {
  if (!s.charId) s.charId = 'c' + (s.created || Date.now()).toString(36);
  return s.charId;
}
const summary = (s) => ({ id: charIdOf(s), name: s.player.name, cls: s.player.classId, level: s.player.level, t: s.updated || Date.now(), created: s.created || 0, owner: s.owner || null });
// mesmo personagem salvo com ids diferentes (versões antigas): mostra só o mais avançado
function dedupe(list) {
  const best = new Map();
  for (const c of list) {
    const key = c.created ? `${c.created}|${c.name}|${c.cls}` : 'id:' + c.id;
    const b = best.get(key);
    if (!b || c.level > b.level || (c.level === b.level && c.t > b.t)) best.set(key, c);
  }
  return [...best.values()];
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* nada */ } }
function parseState(raw) {
  try { const s = migrateState(JSON.parse(raw)); return validateState(s) ? s : null; } catch { return null; }
}

export class SaveManager {
  constructor(G) {
    this.G = G;
    this.cloud = null;
    this.cloudIndex = null;
    this.cloudState = 'indisponível';
    this.lastCloudWrite = 0;
    this.cloudBusy = false;
    this.pending = null;
    this.timer = 0;
    this.localOk = true;
  }

  // ---------- local ----------
  static localIndex() {
    let idx = [];
    try { idx = JSON.parse(lsGet(INDEX_KEY) || '[]'); } catch { idx = []; }
    // migra o save único da v0.1/v0.2
    const old = lsGet(OLD_KEY);
    if (old) {
      const s = parseState(old);
      if (s) {
        const sm = summary(s);
        if (!idx.find((c) => c.id === sm.id)) { lsSet(CHAR_KEY(sm.id), JSON.stringify(s)); idx.push(sm); lsSet(INDEX_KEY, JSON.stringify(idx)); }
      }
      lsDel(OLD_KEY);
    }
    return idx.filter((c) => c && c.id && CLASSES[c.cls]).sort((a, b) => b.t - a.t);
  }
  static readLocalChar(id) { const raw = lsGet(CHAR_KEY(id)); return raw ? parseState(raw) : null; }
  static writeLocal(s) {
    if (SaveManager.OWNER && !s.owner) s.owner = SaveManager.OWNER; // personagem fica marcado com a conta dona
    const sm = summary(s);
    const ok = lsSet(CHAR_KEY(sm.id), JSON.stringify(s));
    const idx = SaveManager.localIndex().filter((c) => c.id !== sm.id);
    idx.push(sm);
    lsSet(INDEX_KEY, JSON.stringify(idx));
    return ok;
  }
  static deleteLocal(id) {
    lsDel(CHAR_KEY(id));
    lsSet(INDEX_KEY, JSON.stringify(SaveManager.localIndex().filter((c) => c.id !== id)));
  }
  static readSettings() { try { return JSON.parse(lsGet(SETTINGS_KEY) || 'null'); } catch { return null; } }
  static writeSettings(s) { lsSet(SETTINGS_KEY, JSON.stringify(s)); }
  // saiu da conta: tira deste navegador os personagens dela (eles continuam salvos na conta)
  static clearOwner(owner) { for (const c of SaveManager.localIndex()) if (c.owner && c.owner === owner) SaveManager.deleteLocal(c.id); }
  // só os personagens do navegador que são desta conta (ou de ninguém, de antes das contas)
  static mine(c) { return !c.owner || (SaveManager.OWNER && c.owner === SaveManager.OWNER); }
  static clearAllLocal() { for (const c of SaveManager.localIndex()) lsDel(CHAR_KEY(c.id)); lsDel(INDEX_KEY); lsDel(OLD_KEY); }

  // ---------- nuvem ----------
  async connectCloud() {
    this.cloudLoading = true;
    try {
      if (!window.claude?.use) return null;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) { this.cloudState = 'indisponível'; return null; }
      const uid = await user.id();
      if (!uid) { this.cloudState = 'sem conta'; return null; }
      const base = 'data/users/' + uid + '/';
      this.cloud = { db, uid, col: db.collection('data/users/' + uid), char: (id) => db.doc(base + 'rift_char_' + id) };
      this.cloudState = 'conectado';
      await this.readCloudIndex();
      return this.cloud;
    } catch { this.cloudState = 'indisponível'; return null; } finally { this.cloudLoading = false; }
  }

  // fora do Claude: conta no servidor próprio do jogo
  async connectServer(acc) {
    const { serverCloud } = await import('./serverauth.js');
    const db = serverCloud(acc.token);
    this.serverUser = acc.user;
    SaveManager.OWNER = String(acc.user || '').toLowerCase() || null;
    this.serverMount = acc.montaria || null;
    this.serverGm = !!acc.gm;
    this.serverChecked = !acc.offline; // resposta de verdade do servidor (não só a sessão guardada)
    this.serverToken = acc.token || null; // usado pelo mercado do servidor // montaria especial da conta (ex.: lil = cavalo, pedrocas = lobo)
    this.cloud = { db, uid: acc.user, col: db.collection('docs'), char: (id) => db.doc('rift_char_' + id) };
    this.cloudState = 'conta ' + acc.user;
    await this.readCloudIndex();
    if (this.cloudState === 'erro de leitura') this.cloudState = 'conta ' + acc.user + ' (sem conexão)';
    // personagens antigos só deste navegador (sem dono) sobem para a conta; os de OUTRA conta ficam de fora
    for (const c of SaveManager.localIndex()) {
      if (c.owner) continue;
      if ((this.cloudIndex || []).some((x) => x.id === c.id)) { const st0 = SaveManager.readLocalChar(c.id); if (st0) { st0.owner = SaveManager.OWNER; SaveManager.writeLocal(st0); } continue; } // já é desta conta: marca
      const st = SaveManager.readLocalChar(c.id);
      if (st) { st.owner = SaveManager.OWNER; SaveManager.writeLocal(st); await this.writeCloud(st); }
    }
    this.cloudState = 'conta ' + acc.user;
    return this.cloud;
  }

  withTimeout(p) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]); }

  async readCloudIndex() {
    if (!this.cloud) return [];
    const list = [];
    try {
      const snap = await this.withTimeout(this.cloud.col.get());
      const docs = snap?.docs || [];
      for (const d of docs) {
        const id = d.id || '';
        const data = typeof d.data === 'function' ? d.data() : d.data;
        if (!data || !data.json) continue;
        if (id.startsWith('rift_char_')) {
          let created = data.created || 0;
          if (!created) { try { created = JSON.parse(data.json).created || 0; } catch { /* nada */ } }
          list.push({ id: data.id || id.slice(10), name: data.name, cls: data.cls, level: data.level, t: data.t || 0, created });
        } else if (id === 'rift_save') {
          // documento único da v0.1/v0.2
          const st = parseState(data.json);
          if (st) {
            const sm = summary(st);
            if (!list.find((c) => c.id === sm.id)) { await this.cloud.char(sm.id).set({ json: JSON.stringify(st), ...sm }).catch(() => {}); list.push(sm); }
          }
        }
      }
      this.cloudIndex = list;
    } catch { this.cloudIndex = this.cloudIndex || []; this.cloudState = 'erro de leitura'; }
    return this.cloudIndex;
  }

  // Lista combinada (navegador + nuvem), mais recente primeiro
  characters() {
    const map = new Map();
    for (const c of SaveManager.localIndex()) {
      // servidor não respondeu: os da conta guardada aparecem como "aguardando servidor" (não somem)
      if (!SaveManager.mine(c)) { if (this.waitOwner && c.owner === this.waitOwner) map.set(c.id, { ...c, src: 'navegador', wait: true }); continue; }
      if (!c.created) { const st = SaveManager.readLocalChar(c.id); c.created = st?.created || 0; }
      map.set(c.id, { ...c, src: 'navegador' });
    }
    for (const c of this.cloudIndex || []) {
      const cur = map.get(c.id);
      if (!cur || c.t > cur.t) map.set(c.id, { ...c, src: 'nuvem' });
    }
    return dedupe([...map.values()].filter((c) => CLASSES[c.cls])).sort((a, b) => b.t - a.t);
  }

  async loadCharacter(id) {
    let local = SaveManager.readLocalChar(id);
    if (local && local.owner && local.owner !== SaveManager.OWNER) local = null; // de outra conta: não abre
    let cloud = null;
    const ci = (this.cloudIndex || []).find((c) => c.id === id);
    if (this.cloud && ci && (!local || ci.t > (local.updated || 0))) {
      try { const snap = await this.withTimeout(this.cloud.char(id).get()); if (snap.exists) cloud = parseState(snap.data().json); } catch { cloud = null; }
    }
    const s = cloud && (!local || (cloud.updated || 0) > (local.updated || 0)) ? cloud : local;
    if (s) charIdOf(s);
    return s;
  }

  async deleteCharacter(id) {
    const nm = (this.cloudIndex || []).find((c) => c.id === id)?.name;
    if (this.serverToken && nm) import('./serverauth.js').then((SA) => SA.releaseName(this.serverToken, nm, id)); // nome fica livre de novo
    SaveManager.deleteLocal(id);
    if (this.cloud) {
      try {
        await this.cloud.char(id).delete();
        this.cloudIndex = (this.cloudIndex || []).filter((c) => c.id !== id);
      } catch { /* nada */ }
    }
  }

  snapshot() {
    const G = this.G;
    if (!G.state || !G.player) return null;
    G.player.saveTo(G.state.player);
    G.state.player.inventory = G.inv.slots;
    G.state.quests = G.quests.toJSON();
    G.state.player.binds = { ...G.input.binds };
    G.state.updated = Date.now();
    charIdOf(G.state);
    return G.state;
  }

  saveNow(reason = 'auto', cloud = false) {
    const s = this.snapshot();
    if (!s) return false;
    this.localOk = SaveManager.writeLocal(s);
    if (cloud || Date.now() - this.lastCloudWrite > (this.serverUser ? 15000 : 45000)) this.writeCloud(s);
    this.G.ui?.savedIndicator?.(reason);
    return true;
  }

  async writeCloud(s) {
    if (!this.cloud || this.cloudBusy) return;
    this.cloudBusy = true;
    try {
      const sm = summary(s);
      await this.cloud.char(sm.id).set({ json: JSON.stringify(s), ...sm });
      this.cloudIndex = [...(this.cloudIndex || []).filter((c) => c.id !== sm.id), sm];
      this.lastCloudWrite = Date.now();
      this.cloudState = this.serverUser ? 'conta ' + this.serverUser + ' ✓' : 'sincronizado';
    } catch (e) {
      this.cloudState = e?.code === 'invalid_argument' ? 'somente leitura' : 'erro ao salvar';
    } finally { this.cloudBusy = false; }
  }

  requestSave(reason) { this.pending = reason; this.pendingT = 2; }

  update(dt) {
    if (this.G.mode !== 'play') return;
    this.timer += dt;
    if (this.pending) { this.pendingT -= dt; if (this.pendingT <= 0) { this.saveNow(this.pending, true); this.pending = null; this.timer = 0; } }
    if (this.timer >= BALANCE.autosaveSec) { this.timer = 0; this.saveNow('auto'); }
  }

  exportCode() { const s = this.snapshot(); return s ? encodeSaveCode(s) : ''; }
  static importCode(code) { const s = decodeSaveCode(code); charIdOf(s); return s; }

  async clearAll() {
    for (const c of this.characters()) await this.deleteCharacter(c.id);
    SaveManager.clearAllLocal();
  }
}
