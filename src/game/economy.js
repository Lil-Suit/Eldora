// Economia entre jogadores: banco, transferências de ouro, diretório de jogadores e diamantes.
//
// Onde cada coisa fica (banco de dados compartilhado da página publicada):
//  - Banco: data/users/<id>/rift_bank      → privado (só o próprio jogador lê/escreve); vale para todos os seus personagens
//  - Transferências: mail/<id>/in/<doc>     → quem envia escreve na caixa de entrada de quem recebe
//  - Diretório: players/<id>                → nome, nível e classe para achar alguém pelo nome
//  - Diamantes: diamonds/<id>               → SÓ o dono do jogo escreve (crédito de compra com dinheiro real)
//               data/users/<id>/rift_dspend  → o que o jogador já comprou com diamantes (a compra é o desbloqueio)
// Sem conexão (arquivo local), o banco fica no aparelho e transferência/diamantes ficam fechados.
import { DIAMONDS } from '../config/monetization.js';
import { VAULT } from '../config/economia.js';

export const BANK = { maxTransfer: 10000000, mailPollSec: 45, dirEverySec: 300 };
const LS_BANK = 'eldoria_bank_v1';

// código curto e fixo de cada jogador (para o comprovante de compra e para achar alguém)
export function playerCode(uid) {
  const h = (seed) => { let x = seed >>> 0; for (const ch of String(uid)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36).toUpperCase(); };
  const s = (h(2166136261) + h(97531)).replace(/[^A-Z0-9]/g, '').padEnd(8, '7');
  return s.slice(0, 4) + '-' + s.slice(4, 8);
}

const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const withTimeout = (p, ms = 9000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

const REFUND = new Set(['aura_petalas', 'aura_vazio']);
export class Economy {
  constructor(G) {
    this.G = G;
    this.bank = 0;
    this.bankLog = [];
    this.bankReady = false;
    this.granted = 0;        // diamantes creditados pelo dono do jogo
    this.spent = [];         // [{ sku, p, t }]
    this.diamondsReady = false;
    this.owner = false;
    this.dirCache = null;
    this.mailT = 3;
    this.dirT = 2;
    this.busy = false;
  }

  get C() { return this.G.saver.cloud; }
  // conta do servidor (Render): diamantes ficam SÓ no servidor — o jogador não consegue escrever o saldo
  srv() { const S = this.G.saver; return S.serverUser && S.serverToken ? S.serverToken : null; }
  async sapi(path, body) {
    const r = await withTimeout(fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.srv() }, body: body ? JSON.stringify(body) : undefined }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Falha no servidor.');
    return j;
  }
  online() { return !!this.C?.db; }
  code() { return this.C ? playerCode(this.C.uid) : '—'; }

  // chamado ao entrar no jogo (e quando a nuvem conecta depois)
  async init() {
    await this.loadBank();
    if (!this.online()) return;
    if (this.srv()) this.owner = !!this.G.saver.serverGm;
    else {
      try { const user = await window.claude?.use?.('user'); this.owner = !!(await user?.isOwner?.()); } catch { this.owner = false; }
      if (this.owner) this.giveOwnerHorse();
    }
    await Promise.allSettled([this.loadDiamonds(), this.writeDirectory(), this.checkMail(), this.dailyStatus(true)]);
  }

  // o criador do jogo ganha o Cavalo do Criador em todos os personagens (para explorar rápido)
  giveOwnerHorse() {
    const G = this.G;
    if (G.mode !== 'play' || G.inv.count('cavalo_criador') > 0) return;
    const horse = { uid: 'cavalo-' + Date.now().toString(36), kind: 'quest', id: 'cavalo_criador', qty: 1 };
    // bolsa cheia (ou acima do limite do nível): o cavalo entra mesmo assim — nada vai para o chão
    if (G.inv.add(horse, true) > 0) return;
    G.ui.banner('Cavalo do Criador', 'Seu cavalo está na bolsa! Toque no botão do cavalo (ou aperte H) para montar: corre 20× mais rápido.', '#e8b070');
    G.audio.play('discover');
    G.saver.saveNow('cavalo', true);
    G.ui.refreshHud?.();
  }

  update(dt) {
    if (!this.online() || this.G.mode !== 'play') return;
    this.mailT -= dt;
    if (this.mailT <= 0) { this.mailT = BANK.mailPollSec; this.checkMail(); }
    this.dirT -= dt;
    if (this.dirT <= 0) { this.dirT = BANK.dirEverySec; this.writeDirectory(); }
  }

  // ---------- banco ----------
  bankRef() { return this.online() ? this.C.db.doc('data/users/' + this.C.uid + '/rift_bank') : null; }

  async loadBank() {
    try {
      if (this.online()) {
        const snap = await withTimeout(this.bankRef().get());
        const d = snap.exists ? snap.data() : null;
        this.bank = Math.max(0, Math.floor(+d?.gold || 0));
        this.bankLog = Array.isArray(d?.log) ? d.log.slice(-20) : [];
      } else {
        const d = JSON.parse(localStorage.getItem(LS_BANK) || 'null');
        this.bank = Math.max(0, Math.floor(+d?.gold || 0));
        this.bankLog = Array.isArray(d?.log) ? d.log.slice(-20) : [];
      }
      this.bankReady = true;
    } catch { this.bankReady = this.bankReady || false; }
  }

  async saveBank() {
    const data = { gold: this.bank, log: this.bankLog.slice(-20), t: Date.now() };
    if (this.online()) await withTimeout(this.bankRef().set(data));
    else localStorage.setItem(LS_BANK, JSON.stringify(data));
  }

  logBank(kind, gold, who = '') { this.bankLog.push({ k: kind, g: gold, w: String(who).slice(0, 24), t: Date.now() }); this.bankLog = this.bankLog.slice(-20); }

  async deposit(n) {
    const sp = this.G.state.player;
    n = Math.floor(+n);
    if (!this.bankReady) return { ok: false, reason: 'O banco ainda está carregando.' };
    if (!(n > 0)) return { ok: false, reason: 'Escolha um valor.' };
    if (n > sp.gold) return { ok: false, reason: 'Você não tem esse ouro na bolsa.' };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    sp.gold -= n; this.bank += n; this.logBank('dep', n);
    try { await this.saveBank(); this.G.saver.saveNow('banco', true); return { ok: true }; }
    catch { sp.gold += n; this.bank -= n; this.bankLog.pop(); return { ok: false, reason: 'Não foi possível falar com o banco agora.' }; }
    finally { this.busy = false; }
  }

  async withdraw(n) {
    const sp = this.G.state.player;
    n = Math.floor(+n);
    if (!this.bankReady) return { ok: false, reason: 'O banco ainda está carregando.' };
    if (!(n > 0)) return { ok: false, reason: 'Escolha um valor.' };
    if (n > this.bank) return { ok: false, reason: 'Saldo do banco insuficiente.' };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    this.bank -= n; this.logBank('saq', n);
    try { await this.saveBank(); sp.gold += n; this.G.saver.saveNow('banco', true); return { ok: true }; }
    catch { this.bank += n; this.bankLog.pop(); return { ok: false, reason: 'Não foi possível falar com o banco agora.' }; }
    finally { this.busy = false; }
  }

  // ---------- diretório de jogadores ----------
  async writeDirectory() {
    if (!this.online()) return;
    const sp = this.G.state.player;
    if (this.srv()) { // servidor próprio: diretório no servidor (banco e site do jogo usam)
      try { await this.sapi('/api/dir', this.dirEntry()); } catch { /* tenta de novo depois */ }
      return;
    }
    // dentro do Claude: o ranking do jogo lê daqui (nível, classe, PvP e quem derrotou)
    try { await withTimeout(this.C.db.doc('players/' + this.C.uid).set({ ...this.dirEntry(), t: Date.now() })); } catch { /* tenta de novo depois */ }
  }

  // o que vai para o diretório (nível, classe, habilidades e PvP: o site do jogo monta os rankings com isso)
  dirEntry() {
    const sp = this.G.state.player, st = sp.stats || {};
    return { n: String(sp.name).slice(0, 20), l: sp.level, c: this.G.player?.cls?.id || '', code: this.code(),
      pvp: st.pvpKills || 0, deaths: st.deaths || 0, pk: (st.pvpLog || []).slice(-30), sv: this.G.net?.server || 1 };
  }
  async players(force = false) {
    if (!this.online()) return [];
    if (this.dirCache && !force && Date.now() - this.dirCache.t < 30000) return this.dirCache.list;
    if (this.srv()) return []; // no servidor a busca é feita lá (search)
    try {
      const snap = await withTimeout(this.C.db.collection('players').orderBy('t', 'desc').limit(300).get());
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p && p.n && p.id !== this.C.uid);
      this.dirCache = { t: Date.now(), list };
      return list;
    } catch { return this.dirCache?.list || []; }
  }

  async search(q) {
    if (this.srv()) { try { return (await this.sapi('/api/dir?q=' + encodeURIComponent(String(q || '').trim()))).list || []; } catch { return []; } }
    const list = await this.players();
    const f = fold(q).replace('-', '');
    if (!f) return list.slice(0, 12);
    return list.filter((p) => fold(p.n).includes(f) || fold(p.code || playerCode(p.id)).replace('-', '').includes(f)).slice(0, 12);
  }

  // ---------- transferências (saem do banco, chegam no banco de quem recebe, mesmo offline) ----------
  async transfer(to, n) {
    n = Math.floor(+n);
    if (!this.online()) return { ok: false, reason: 'Transferências só funcionam na página publicada, com a conta conectada.' };
    if (!to?.id || to.id === this.C.uid) return { ok: false, reason: 'Escolha para quem enviar.' };
    if (!(n > 0)) return { ok: false, reason: 'Escolha um valor.' };
    if (n > BANK.maxTransfer) return { ok: false, reason: 'Valor alto demais.' };
    if (n > this.bank) return { ok: false, reason: 'Saldo do banco insuficiente. Deposite o ouro antes de transferir.' };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    const sp = this.G.state.player;
    this.bank -= n; this.logBank('env', n, to.n);
    try {
      await this.saveBank();
      try {
        if (this.srv()) await this.sapi('/api/mail', { to: to.id, gold: n, fromName: String(sp.name).slice(0, 20) });
        else await withTimeout(this.C.db.collection('mail/' + to.id + '/in').doc().set({ gold: n, from: this.C.uid, fromName: String(sp.name).slice(0, 20), t: Date.now() }));
      } catch (err) {
        // não chegou: devolve
        this.bank += n; this.bankLog.pop(); await this.saveBank().catch(() => {});
        throw err;
      }
      this.G.saver.saveNow('transferência', true);
      return { ok: true };
    } catch { return { ok: false, reason: 'Não foi possível transferir agora. Seu ouro continua no banco.' }; }
    finally { this.busy = false; }
  }

  // ouro que chegou de outros jogadores
  async checkMail() {
    if (!this.online() || this._mailBusy) return;
    this._mailBusy = true;
    try {
      let total = 0; const from = [];
      if (this.srv()) { // servidor: ele entrega e apaga numa operação só
        const j = await this.sapi('/api/mail/take', {});
        for (const m of j.mail || []) { const g = Math.floor(+m.gold); if (g > 0 && g <= BANK.maxTransfer) { total += g; from.push(String(m.fromName || 'alguém').slice(0, 20)); this.logBank('rec', g, m.fromName || ''); } }
      }
      const snap = this.srv() ? { docs: [] } : await withTimeout(this.C.db.collection('mail/' + this.C.uid + '/in').limit(50).get());
      for (const d of snap.docs) {
        const m = d.data() || {};
        const g = Math.floor(+m.gold);
        // apaga primeiro: se outro aparelho já recebeu, a remoção falha e não conta duas vezes
        try { await withTimeout(this.C.db.doc('mail/' + this.C.uid + '/in/' + d.id).delete()); } catch { continue; }
        if (g > 0 && g <= BANK.maxTransfer) { total += g; from.push(String(m.fromName || 'alguém').slice(0, 20)); this.logBank('rec', g, m.fromName || ''); }
      }
      if (total > 0) {
        this.bank += total;
        await this.saveBank();
        const names = [...new Set(from)].join(', ');
        this.G.ui.banner('Ouro recebido!', `${names} enviou ${total.toLocaleString('pt-BR')} de ouro para o seu banco.`, '#ffd36b');
        this.G.audio.play('loot', { rarity: 2 });
        if (this.G.ui.dialogView === 'bank') this.G.ui.openDialog?.(this.G.ui.dialogNpc);
      }
    } catch { /* tenta de novo depois */ } finally { this._mailBusy = false; }
  }

  // ---------- diamantes ----------
  async loadDiamonds() {
    if (this.srv()) {
      try {
        const d = await this.sapi('/api/dia');
        this.granted = Math.max(0, Math.floor(+d.total || 0));
        this.spent = (Array.isArray(d.spent) ? d.spent : []).map((x) => ({ sku: String(x.sku), p: Math.max(0, Math.floor(+x.p) || 0), t: +x.t || 0 }));
        if (d.gm) this.owner = true;
        this.diamondsReady = true;
        this.G.cosmetics?.syncPremium?.();
      } catch { /* tenta de novo depois */ }
      return;
    }
    if (!this.online()) return;
    try {
      const [g, s] = await Promise.all([
        withTimeout(this.C.db.doc('diamonds/' + this.C.uid).get()),
        withTimeout(this.C.db.doc('data/users/' + this.C.uid + '/rift_dspend').get()),
      ]);
      this.granted = Math.max(0, Math.floor(+(g.exists ? g.data().total : 0) || 0));
      const list = s.exists && Array.isArray(s.data().list) ? s.data().list : [];
      this.spent = list.filter((x) => x && typeof x.sku === 'string' && Number.isFinite(+x.p)).map((x) => ({ sku: x.sku, p: Math.max(0, Math.floor(+x.p)), t: +x.t || 0 }));
      this.diamondsReady = true;
      this.G.cosmetics?.syncPremium?.();
    } catch { /* fica sem diamantes até conectar */ }
  }

  diamonds() { return Math.max(0, this.granted - this.spent.reduce((a, x) => a + (REFUND.has(x.sku) ? 0 : x.p), 0)); } // auras saíram: o gasto nelas volta
  ownsSku(sku) { return this.spent.some((x) => x.sku === sku); }

  async buyWithDiamonds(sku) {
    const price = DIAMONDS.prices[sku];
    if (!price) return { ok: false, reason: 'Este item não está à venda.' };
    if (!this.online() || !this.diamondsReady) return { ok: false, reason: 'Os diamantes só funcionam na página publicada, com a conta conectada.' };
    const repeat = !!DIAMONDS.repeat?.includes(sku);
    if (!repeat && this.ownsSku(sku)) return { ok: true };
    if (this.srv()) {
      if (this.diamonds() < price) return { ok: false, reason: `Faltam ${price - this.diamonds()} 💎.` };
      if (this.busy) return { ok: false, reason: 'Aguarde…' };
      this.busy = true;
      try {
        const r = await this.sapi('/api/dia/spend', { sku });
        if (Array.isArray(r.spent)) this.spent = r.spent.map((x) => ({ sku: String(x.sku), p: Math.max(0, Math.floor(+x.p) || 0), t: +x.t || 0 }));
        this.G.cosmetics?.syncPremium?.();
        return { ok: true, owned: !!r.owned };
      } catch (e) { return { ok: false, reason: e.message || 'Não foi possível concluir agora. Nenhum diamante foi gasto.' }; }
      finally { this.busy = false; }
    }
    if (this.diamonds() < price) return { ok: false, reason: `Faltam ${price - this.diamonds()} 💎.` };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    const entry = { sku, p: price, t: Date.now() };
    this.spent.push(entry);
    try {
      await withTimeout(this.C.db.doc('data/users/' + this.C.uid + '/rift_dspend').set({ list: this.spent }));
      this.G.cosmetics?.syncPremium?.();
      this.G.saver.saveNow('diamantes', true);
      return { ok: true };
    } catch { this.spent = this.spent.filter((x) => x !== entry); return { ok: false, reason: 'Não foi possível concluir agora. Nenhum diamante foi gasto.' }; }
    finally { this.busy = false; }
  }

  // ---------- cofre do banco: +10 espaços por compra (50, 75, 100, 125 💎), conferido e gravado SÓ no servidor ----------
  vaultBuys() { return Math.min(VAULT.buys, this.spent.filter((x) => x.sku === VAULT.sku).length); }
  async buyVault() {
    if (!this.srv() || !this.diamondsReady) return { ok: false, reason: 'O cofre maior só pode ser comprado no servidor do jogo, com a conta conectada.' };
    const n = this.vaultBuys(), price = VAULT.price(n);
    if (n >= VAULT.buys) return { ok: false, reason: 'O cofre já está no tamanho máximo.' };
    if (this.diamonds() < price) return { ok: false, reason: `Faltam ${price - this.diamonds()} 💎.` };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    try {
      const r = await this.sapi('/api/dia/spend', { sku: VAULT.sku });
      if (Array.isArray(r.spent)) this.spent = r.spent.map((x) => ({ sku: String(x.sku), p: Math.max(0, Math.floor(+x.p) || 0), t: +x.t || 0 }));
      this.G.saver.saveNow('cofre', true);
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message || 'Não foi possível concluir agora. Nenhum diamante foi gasto.' }; }
    finally { this.busy = false; }
  }

  // ---------- baú diário (1 por dia por conta; o SERVIDOR confere o dia e sorteia o prêmio) ----------
  async dailyStatus(notify = false) {
    if (!this.srv()) { this.daily = { off: true }; return this.daily; }
    try {
      const d = await this.sapi('/api/bau');
      this.daily = { pode: !!d.pode, dia: Math.max(1, Math.min(7, d.dia | 0)), seguidos: d.seguidos | 0, faltaMs: +d.faltaMs || 0, t: Date.now() };
      if (notify && this.daily.pode) {
        this.G.ui.toastSmall(`🎁 Baú diário pronto (dia ${this.daily.dia} de 7): fale com a Banqueira Odete na vila.`, 7);
      }
    } catch { this.daily = this.daily || { erro: true }; }
    return this.daily;
  }
  async dailyOpen() {
    if (!this.srv()) return { ok: false, reason: 'O baú diário só funciona no servidor do jogo, com a conta conectada.' };
    if (this.busy) return { ok: false, reason: 'Aguarde…' };
    this.busy = true;
    try {
      const G = this.G, sp = G.state.player;
      const r = await this.sapi('/api/bau/abrir', { cid: G.state.charId, nome: String(sp.name).slice(0, 20) });
      const items = [];
      if (r.pocao > 0) items.push({ consumable: 'pocao_vida', qty: r.pocao | 0 });
      if (r.tonico > 0) items.push({ consumable: 'tonico', qty: r.tonico | 0 });
      if (r.item && ['incomum', 'raro', 'epico'].includes(r.item)) items.push({ roll: { rarity: r.item, ilvl: Math.max(1, sp.level) } }); // preso ao personagem (giveRewards)
      G.loot.giveRewards({ gold: Math.max(0, Math.floor(+r.ouro || 0)), items }, G.player.pos, 'Baú diário');
      this.daily = { pode: false, dia: r.dia, seguidos: r.seguidos | 0, faltaMs: +r.faltaMs || 0, t: Date.now() };
      G.saver.saveNow('baú diário', true);
      return { ok: true, r };
    } catch (e) { return { ok: false, reason: e.message || 'Não foi possível abrir agora.' }; }
    finally { this.busy = false; }
  }

  // Painel do dono: credita diamantes depois de conferir o pagamento (o db só aceita esta escrita do dono)
  async ownerGrant(to, n) {
    n = Math.floor(+n);
    if (!this.owner) return { ok: false, reason: 'Só o dono do jogo pode creditar diamantes.' };
    if (!to?.id || !(n > 0) || n > 1000000) return { ok: false, reason: 'Escolha o jogador e a quantidade.' };
    if (this.srv()) {
      try {
        const r = await this.sapi('/api/dia/grant', { to: to.id, n });
        if (String(to.id).toLowerCase() === String(this.C?.uid || '').toLowerCase()) await this.loadDiamonds();
        return { ok: true, total: r.total };
      } catch (e) { return { ok: false, reason: e.message || 'O servidor recusou.' }; }
    }
    try {
      const ref = this.C.db.doc('diamonds/' + to.id);
      const snap = await withTimeout(ref.get());
      const d = snap.exists ? snap.data() : {};
      const total = Math.max(0, Math.floor(+d.total || 0)) + n;
      const log = (Array.isArray(d.log) ? d.log : []).concat([{ n, t: Date.now() }]).slice(-40);
      await withTimeout(ref.set({ total, log, name: String(to.n || '').slice(0, 20) }));
      if (to.id === this.C.uid) await this.loadDiamonds();
      return { ok: true, total };
    } catch { return { ok: false, reason: 'O banco de dados recusou (só o dono pode creditar).' }; }
  }
}
