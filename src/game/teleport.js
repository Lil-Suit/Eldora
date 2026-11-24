// Pergaminho de Teleporte (roxo, comprado com 💎): escolhe o MUNDO (1 Vale, 2 Planície do Guardião, 3 Ermos, 4 Confins) e a REGIÃO.
// Cada região libera quando você a descobre andando por ela (como um ponto de viagem).
// Viajar: a Pedra leva de graça às zonas seguras (Vila, Acampamento dos Exilados, Posto da Fronteira);
// para as outras regiões gasta 1 Pergaminho de Teleporte (comprado com diamantes 💎 — só conveniência).
import { LOCATIONS, WORLD, ERMOS, CONFINS, GUARDIAO, BOSS_SPAWN } from '../config/world.js';
import { MSG_LOCKED } from '../core/guardiao.js';
import { DIAMONDS } from '../config/monetization.js';
import { makeStack } from '../core/items.js';
import { rng } from '../core/rng.js';

export const TP_SCROLL = 'pergaminho_tp';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mundo 1: pontos de chegada nas bordas (não cai no meio de um acampamento cheio de monstros)
const VALE = [
  { id: 'vila', at: [WORLD.spawn.x, WORLD.spawn.z] },
  { id: 'prado', at: [12, -12] },
  { id: 'lago', at: [-72, 44] },
  { id: 'acampamento', at: [-60, -30] },
  { id: 'floresta', at: [90, -26] },
  { id: 'ruinas', at: [-18, -70] },
  { id: 'cripta', at: [146, -100] },
  { id: 'planalto', at: [35, -146], gate: true },
];
// Mundo 2 (Planície do Guardião): a chegada do portal e o caminho do trono
const PLANICIE = [
  { id: 'planicie_guardiao', at: [GUARDIAO.entry.x, GUARDIAO.entry.z], name: 'Chegada da Planície', safe: true },
  { id: 'planicie_centro', at: [35, -300], name: 'Planície do Guardião', lv: '5–18' },
  { id: 'arena_guardiao', at: [BOSS_SPAWN.x, BOSS_SPAWN.z + 36], name: 'Trono do Guardião', lv: 'Chefe 25' },
];

const lv = (s) => { const m = String(s || '').match(/\d+(?:\s*[–-]\s*\d+)?/); return m ? m[0].replace(/\s/g, '') : ''; };

export function teleportWorlds(G) {
  const st = G.state.world, disc = new Set(st.discovered || []);
  const vale = VALE.map((v) => {
    const L = LOCATIONS[v.id];
    const gateOk = !v.gate || st.flags?.gateOpen;
    const open = v.id === 'vila' || (disc.has(v.id) && gateOk);
    return { key: 'world:' + v.id, name: L.name, lv: v.id === 'vila' ? 'Segura' : lv(L.levels), open, why: !gateOk ? 'Abra o Portão dos Golens' : 'Ainda não descoberto', area: 'world', x: v.at[0], z: v.at[1] };
  });
  const gOk = disc.has('guardiao') || disc.has('planicie_guardiao');
  const planicie = PLANICIE.map((v) => ({
    key: 'guardiao:' + v.id, name: v.name, lv: v.safe ? 'Segura' : v.lv, area: 'guardiao',
    open: gOk && (v.safe || v.id === 'planicie_centro' || disc.has(v.id)), why: gOk ? 'Ainda não descoberto' : 'Entre pelo portal no topo do Planalto da Fenda',
    x: v.at[0], z: v.at[1],
  }));
  const passOk = G.guardiaoOk ? G.guardiaoOk() : true; // pacote 3: Ermos e Confins só depois do Guardião
  const ermosOk = disc.has('ermos') && passOk;
  const ermos = Object.entries(ERMOS.locations).map(([id, L]) => ({
    key: 'ermos:' + id, name: L.name, lv: id === 'acampamento' ? 'Segura' : lv(L.levels), area: 'ermos',
    open: ermosOk && (id === 'acampamento' || disc.has('ermos_' + id)), why: !passOk ? MSG_LOCKED : ermosOk ? 'Ainda não descoberto' : 'Entre nos Ermos pelo Portal da Fenda',
    x: L.x + ERMOS.offset.x, z: L.z + ERMOS.offset.z + (id === 'acampamento' ? 6 : 0),
  }));
  const confOk = disc.has('confins') && passOk;
  const confins = [{ key: 'confins:camp', name: CONFINS.camp.name, lv: 'Segura', area: 'confins', open: confOk, why: !passOk ? MSG_LOCKED : 'Entre nos Confins pelo portal dos Ermos', x: CONFINS.entry.x + CONFINS.offset.x, z: CONFINS.entry.z + CONFINS.offset.z + 6 }]
    .concat(Object.entries(CONFINS.biomes).map(([id, B]) => ({
      key: 'confins:' + id, name: B.name, lv: `${B.levels[0]}–${B.levels[1]}`, area: 'confins',
      open: confOk && disc.has('confins_' + id), why: !passOk ? MSG_LOCKED : confOk ? 'Ainda não descoberto' : 'Entre nos Confins pelo portal dos Ermos',
      x: B.cx + CONFINS.offset.x, z: B.cz + CONFINS.offset.z,
    })));
  return [
    { n: 1, id: 'world', name: 'Vale de Eldoria', places: vale },
    { n: 2, id: 'guardiao', name: 'Planície do Guardião', places: planicie },
    { n: 3, id: 'ermos', name: 'Ermos da Fenda', places: ermos },
    { n: 4, id: 'confins', name: 'Confins de Eldoria', places: confins },
  ];
}

export class Teleports {
  constructor(G) { this.G = G; this.tab = null; this.shop = false; this.msg = ''; this.fromScroll = false; }

  scrolls() { return this.G.inv.count(TP_SCROLL); }
  // quanto custa ir para o lugar: zona segura pela Pedra = grátis; o resto = 1 pergaminho (GM não gasta)
  cost(p) {
    if (this.G.saver?.serverGm) return 0;
    if (this.fromScroll) return 1;
    return p.lv === 'Segura' ? 0 : 1;
  }

  open(opts = {}) {
    const G = this.G;
    this.fromScroll = !!opts.scroll;
    this.shop = !!opts.shop; this.msg = '';
    if (!this.tab) this.tab = G.player?.area === 'cripta' ? 'world' : (G.player?.area || 'world');
    if (this.shop) G.economy?.loadDiamonds?.().then(() => this.refresh());
    G.ui.openModal('html', this.render());
    G.ui.modal = 'teleport'; G.ui.el.modal.className = 'modal interactive team tpmodal';
  }
  refresh() { if (this.G.ui.modal === 'teleport') this.G.ui.el.modal.innerHTML = this.render(); }

  shopHtml() {
    const E = this.G.economy, ready = E?.online() && E.diamondsReady, bal = ready ? E.diamonds() : null;
    const packs = (DIAMONDS.scrolls || []).map((x) => {
      const price = DIAMONDS.prices[x.sku];
      return `<div class="tpbuy"><b>📜 ${x.qty} pergaminho${x.qty > 1 ? 's' : ''}</b>${x.tag ? `<em>${esc(x.tag)}</em>` : ''}<button class="btn sm primary" data-a="tp:buy" data-sku="${x.sku}" ${ready && bal >= price ? '' : 'disabled'}>💎 ${price}</button></div>`;
    }).join('');
    return `<div class="tpshop"><p class="tdesc">O <b>Pergaminho de Teleporte</b> leva você direto para qualquer região que já descobriu. É só conveniência: não dá força. Fica preso à sua conta (não vende nem troca). Também está na <b>Fornecedora Lia</b>, ao lado do Pergaminho de Retorno.</p>
      <div class="tpbuys">${packs}</div>
      <small class="muted">Seu saldo: ${ready ? `💎 ${bal.toLocaleString('pt-BR')}` : E?.online() ? 'carregando…' : 'entre com a sua conta para usar diamantes'}</small></div>`;
  }

  render() {
    const G = this.G, worlds = teleportWorlds(G), w = worlds.find((x) => x.id === this.tab) || worlds[0], lvl = G.state.player.level, n = this.scrolls();
    const tabs = worlds.map((x) => `<button class="btn sm ${x.id === w.id ? 'primary' : ''}" data-a="tp:tab" data-t="${x.id}">Mundo ${x.n} · ${esc(x.name)}</button>`).join('');
    const rows = w.places.map((p) => {
      const min = parseInt(p.lv, 10), danger = Number.isFinite(min) && lvl < min - 1, c = this.cost(p);
      if (!p.open) return `<div class="tpp locked" title="${esc(p.why)}"><b>🔒 ${esc(p.name)}</b><small>${esc(p.why)}</small></div>`;
      return `<button class="tpp${danger ? ' danger' : ''}${c && n < c ? ' nos' : ''}" data-a="tp:go" data-k="${esc(p.key)}"><b>${esc(p.name)}</b><small>${p.lv === 'Segura' ? 'Zona segura' : `Nível ${esc(p.lv)}${danger ? ' · perigoso' : ''}`} · ${c ? '📜 1' : 'grátis'}</small></button>`;
    }).join('');
    const head = `<div class="tphead"><h2>Pergaminho de Teleporte</h2><span class="tpcount">📜 ${n}</span><button class="btn sm ${this.shop ? 'primary' : ''}" data-a="tp:shop">Comprar com 💎</button></div>`;
    const note = this.fromScroll ? 'Escolha o destino: gasta 1 pergaminho.' : 'Zonas seguras são grátis. As outras regiões gastam 1 📜 Pergaminho de Teleporte. Regiões liberam quando você as descobre.';
    return `<div class="card teamcard tpcard">${head}${this.msg ? `<p class="mmsg">${esc(this.msg)}</p>` : ''}
      ${this.shop ? this.shopHtml() : `<div class="tptabs">${tabs}</div><div class="tpgrid">${rows}</div><p class="tpnote muted">${note}</p>`}
      <div class="row">${this.shop ? '<button class="btn" data-a="tp:shop">Voltar aos destinos</button>' : ''}<button class="btn" data-a="m:close">Fechar</button></div></div>`;
  }

  // compra com diamantes → os pergaminhos entram na bolsa
  async buy(sku) {
    const G = this.G, pack = (DIAMONDS.scrolls || []).find((x) => x.sku === sku);
    if (!pack) return { ok: false, reason: 'Pacote desconhecido.' };
    const st = makeStack(TP_SCROLL, pack.qty, rng);
    if (G.inv.capacityFor(st) < pack.qty) return { ok: false, reason: 'Bolsa cheia: libere 1 espaço.' };
    const r = await G.economy.buyWithDiamonds(sku);
    if (!r.ok) return r;
    G.inv.add(makeStack(TP_SCROLL, pack.qty, rng));
    G.audio.play('discover');
    G.saver.saveNow?.('pergaminho', true);
    G.ui.refreshPanels?.();
    return { ok: true, qty: pack.qty };
  }

  click(a, el) {
    const G = this.G;
    if (a === 'tab') { this.tab = el.dataset.t; this.msg = ''; this.refresh(); return; }
    if (a === 'shop') { this.shop = !this.shop; this.msg = ''; if (this.shop) G.economy?.loadDiamonds?.().then(() => this.refresh()); this.refresh(); return; }
    if (a === 'buy') {
      if (this._busy) return; this._busy = true; this.msg = 'Comprando…'; this.refresh();
      this.buy(el.dataset.sku).then((r) => { this._busy = false; this.msg = r.ok ? `+${r.qty} 📜 Pergaminho${r.qty > 1 ? 's' : ''} de Teleporte na bolsa!` : r.reason; if (r.ok) this.shop = false; this.refresh(); });
      return;
    }
    if (a === 'go') {
      const p = teleportWorlds(G).flatMap((w) => w.places).find((x) => x.key === el.dataset.k);
      if (!p || !p.open) return;
      const c = this.cost(p);
      if (c && this.scrolls() < c) { this.shop = true; this.msg = 'Você precisa de 1 Pergaminho de Teleporte para ir até lá.'; G.audio.play('error'); this.refresh(); G.economy?.loadDiamonds?.().then(() => this.refresh()); return; }
      if (c) G.inv.removeId(TP_SCROLL, c);
      G.ui.closeModal();
      G.teleportPlace(p.area, p.x, p.z, p.name, p.area === 'world' ? 'Vale de Eldoria' : p.area === 'guardiao' ? 'Planície do Guardião · mapa 2' : p.area === 'ermos' ? 'Ermos da Fenda · mapa 3' : 'Confins de Eldoria · mapa 4');
    }
  }
}

// ponto seguro perto do alvo: andável, fora d'água e sem nada em cima (procura em espiral)
export function safeSpot(W, area, x, z) {
  for (let r = 0; r <= 48; r += 3) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 1.6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!W.walkable(px, pz, area)) continue;
      if (W.inWater?.(px, pz) && area !== 'cripta') continue;
      if (W.col.pointBlocked(px, pz, 1.2)) continue;
      return { x: px, z: pz };
    }
  }
  return { x, z };
}
