// Mercado dos Viajantes: jogadores anunciam itens com o Mercador Tomas e outros jogadores compram.
// Os anúncios ficam no banco de dados compartilhado da página publicada (coleção "market").
// O vendedor recebe o ouro na próxima vez que abrir o mercado (mesmo que tenha vendido offline).
import { displayName, sanitizeEntry, tradable } from '../core/items.js';
import { rng } from '../core/rng.js';

export const MARKET = { maxListings: 10, extra: 10, extraPrice: 100, top: 50, maxPrice: 9999999, feePct: 0, days: 3, minLevel: 10 };
const EXPIRE_MS = MARKET.days * 24 * 3600 * 1000;
export const expired = (l) => Date.now() - (l.t || 0) > EXPIRE_MS;

export class Market {
  constructor(G) {
    this.G = G;
    this.listings = [];
    this.state = 'idle'; // idle | loading | ok | off
    this.busy = false;
  }

  get cloud() { return this.G.saver.cloud; }
  // no site próprio (Render) o mercado mora no servidor; no Claude, no banco compartilhado da página
  srv() { return this.G.saver.serverUser && this.G.saver.serverToken ? this.G.saver.serverToken : null; }
  available() { return !!this.srv() || !!this.cloud?.db; }
  col() { return this.cloud.db.collection('market'); }
  async api(path, body) {
    const r = await Promise.race([fetch(path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.srv() }, body: body ? JSON.stringify(body) : undefined }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'erro'); e.reason = j.error; throw e; }
    return j;
  }
  levelOk() { return (this.G.state?.player?.level || 1) >= MARKET.minLevel; }
  // espaços de venda: 10 + 10 por compra de "mk10" (💎100), até 50
  maxListings() { const n = (this.G.economy?.spent || []).filter((x) => x.sku === 'mk10').length; return Math.min(MARKET.top, MARKET.maxListings + MARKET.extra * n); }
  openCount() { return this.mine().filter((l) => l.status === 'open').length; }
  full() { return this.openCount() >= this.maxListings(); }
  async buySlots() {
    const max = this.maxListings();
    if (max >= MARKET.top) return { ok: false, reason: `Você já tem o máximo de ${MARKET.top} espaços de venda.` };
    const r = await this.G.economy.buyWithDiamonds('mk10');
    return r.ok ? { ok: true, max: this.maxListings() } : r;
  }

  async refresh() {
    if (!this.available()) { this.state = 'off'; return; }
    if (this.srv()) {
      this.state = 'loading';
      try {
        const j = await this.api('/api/market');
        this.listings = (j.listings || []).filter((l) => l && l.item && Number.isFinite(l.price));
        // quem sou eu no servidor: o dono dos anúncios que o servidor marcou como meus
        this.state = 'ok';
        await this.collect();
      } catch { this.state = 'erro'; }
      return;
    }
    this.state = 'loading';
    try {
      const snap = await Promise.race([this.col().orderBy('t', 'desc').limit(120).get(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))]);
      this.listings = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l && l.item && Number.isFinite(l.price));
      this.state = 'ok';
      await this.collect();
    } catch { this.state = 'erro'; }
  }

  uid() { return this.srv() ? String(this.G.saver.serverOwner || this.G.saver.serverUser || '').toLowerCase() : this.cloud?.uid; }
  mine() { const u = this.uid(); return this.listings.filter((l) => String(l.seller) === String(u)); }
  forSale() { const u = this.uid(); return this.listings.filter((l) => l.status === 'open' && String(l.seller) !== String(u) && !expired(l)); }

  // ouro das vendas feitas enquanto você estava fora
  async collect() {
    const G = this.G;
    let total = 0, n = 0;
    if (this.srv()) { try { const j = await this.api('/api/market/collect', {}); total = j.total || 0; n = j.n || 0; } catch { /* tenta de novo depois */ } }
    else for (const l of this.mine().filter((x) => x.status === 'sold')) {
      try { await this.col().doc(l.id).delete(); total += Math.floor(l.price * (1 - MARKET.feePct / 100)); n++; } catch { /* outro aparelho já recebeu */ }
    }
    if (total > 0) {
      G.state.player.gold += total;
      G.ui.toastSmall(`Mercado: você vendeu ${n} ite${n > 1 ? 'ns' : 'm'} e recebeu ${total} de ouro.`, 5);
      G.audio.play('loot', { rarity: 1 });
      G.saver.requestSave('mercado');
      const u = this.uid(); this.listings = this.listings.filter((l) => !(String(l.seller) === String(u) && l.status === 'sold'));
    }
  }

  async list(invIndex, price) {
    const G = this.G;
    if (!this.available() || this.busy) return { ok: false, reason: 'Mercado indisponível.' };
    if (!this.levelOk()) return { ok: false, reason: `As vendas liberam no nível ${MARKET.minLevel}.` };
    const it = G.inv.slots[invIndex];
    price = Math.floor(price);
    if (!it) return { ok: false, reason: 'Escolha um item.' };
    if (!tradable(it)) return { ok: false, reason: 'Chaves, itens de missão, itens únicos, prêmios presos ao personagem e itens Épicos, Míticos e Lendários não podem ser vendidos.' };
    if (!(price >= 1 && price <= MARKET.maxPrice)) return { ok: false, reason: `Preço entre 1 e ${MARKET.maxPrice}.` };
    if (this.full()) { const max = this.maxListings(); return { ok: false, full: max < MARKET.top, reason: max >= MARKET.top ? `No máximo ${MARKET.top} anúncios por jogador.` : `Seus ${max} espaços de venda estão cheios. Compre +${MARKET.extra} espaços por 💎${MARKET.extraPrice}.` }; }
    this.busy = true;
    if (this.srv()) {
      try {
        const j = await this.api('/api/market/list', { item: JSON.stringify(it), name: displayName(it), price, sellerName: G.state.player.name });
        G.inv.removeAt(invIndex);
        this.listings.unshift(j.listing);
        G.saver.saveNow('mercado', true);
        return { ok: true };
      } catch (e) { return { ok: false, reason: e.reason || 'Não foi possível anunciar agora.' }; } finally { this.busy = false; }
    }
    try {
      const ref = this.col().doc();
      const data = { item: JSON.stringify(it), name: displayName(it), price, seller: this.cloud.uid, sellerName: G.state.player.name, t: Date.now(), status: 'open' };
      await ref.set(data);
      G.inv.removeAt(invIndex);
      this.listings.unshift({ id: ref.id, ...data });
      G.saver.saveNow('mercado', true);
      return { ok: true };
    } catch { return { ok: false, reason: 'Não foi possível anunciar agora.' }; } finally { this.busy = false; }
  }

  async cancel(id) {
    const G = this.G;
    const l = this.listings.find((x) => x.id === id);
    if (!l || this.busy) return { ok: false };
    if (G.inv.freeSlots() <= 0) return { ok: false, reason: 'Bolsa cheia.' };
    this.busy = true;
    if (this.srv()) {
      try {
        const j = await this.api('/api/market/cancel', { id });
        G.inv.add(sanitizeEntry(j.item, rng) || JSON.parse(j.item));
        this.listings = this.listings.filter((x) => x.id !== id);
        G.saver.saveNow('mercado', true);
        return { ok: true };
      } catch (e) { await this.refresh(); return { ok: false, reason: e.reason || 'Não foi possível cancelar agora.' }; } finally { this.busy = false; }
    }
    try {
      const ref = this.col().doc(id);
      const lease = await ref.acquire({ holder: this.cloud.uid, ttlMs: 5000 });
      if (!lease.acquired) return { ok: false, reason: 'Alguém está comprando este item agora.' };
      const snap = await ref.get();
      if (!snap.exists || snap.data().status !== 'open') { await this.refresh(); return { ok: false, reason: 'Este item já foi vendido.' }; }
      await ref.delete();
      G.inv.add(sanitizeEntry(l.item, rng) || JSON.parse(l.item));
      this.listings = this.listings.filter((x) => x.id !== id);
      G.saver.saveNow('mercado', true);
      return { ok: true };
    } catch { return { ok: false, reason: 'Não foi possível cancelar agora.' }; } finally { this.busy = false; }
  }

  async buy(id) {
    const G = this.G, sp = G.state.player;
    const l = this.listings.find((x) => x.id === id);
    if (!l || this.busy) return { ok: false };
    if (sp.gold < l.price) return { ok: false, reason: 'Ouro insuficiente.' };
    if (G.inv.freeSlots() <= 0) return { ok: false, reason: 'Bolsa cheia.' };
    this.busy = true;
    if (this.srv()) {
      try {
        const j = await this.api('/api/market/buy', { id, buyerName: sp.name });
        const item = sanitizeEntry(j.item, rng);
        if (!item) return { ok: false, reason: 'Este anúncio tem um item inválido.' };
        sp.gold -= l.price;
        G.inv.add(item);
        l.status = 'sold';
        G.audio.play('loot', { rarity: 2 });
        G.saver.saveNow('compra', true);
        return { ok: true, item };
      } catch (e) { await this.refresh(); return { ok: false, reason: e.reason || 'Não foi possível comprar agora.' }; } finally { this.busy = false; }
    }
    try {
      const ref = this.col().doc(id);
      // trava curta: só um comprador por vez
      const lease = await ref.acquire({ holder: this.cloud.uid, ttlMs: 5000 });
      if (!lease.acquired) return { ok: false, reason: 'Outra pessoa está comprando este item.' };
      const snap = await ref.get();
      if (!snap.exists || snap.data().status !== 'open') { await this.refresh(); return { ok: false, reason: 'Este item acabou de ser vendido.' }; }
      if (expired(snap.data())) return { ok: false, reason: 'Este anúncio expirou.' };
      const item = sanitizeEntry(snap.data().item, rng);
      if (!item) return { ok: false, reason: 'Este anúncio tem um item inválido.' };
      await ref.update({ status: 'sold', buyer: this.cloud.uid, buyerName: sp.name, soldAt: Date.now() });
      sp.gold -= l.price;
      G.inv.add(item);
      l.status = 'sold';
      G.audio.play('loot', { rarity: 2 });
      G.saver.saveNow('compra', true);
      return { ok: true, item };
    } catch { return { ok: false, reason: 'Não foi possível comprar agora.' }; } finally { this.busy = false; }
  }
}
