import { hitPlayer } from './combat.js';
import { xpToNext } from '../core/progression.js';
import { ICONS } from '../ui/icons.js';
import { noTrade } from '../core/items.js';

// =============================================================
// PvP estilo Rucoy Online — pelo botão da ESPADA (libera no nível 30)
// - espada APAGADA: ninguém te ataca e você não ataca ninguém (a não ser que você tenha caveira);
// - toque 1 → espada AMARELA: você pode APANHAR de quem está com espada vermelha, mas não bate em ninguém;
// - toque 2 → espada VERMELHA: você bate (com os golpes normais, sem clicar em ninguém) e também apanha;
// - toque 3 → apaga de novo (só sem "block").
// - para a espada vermelha tirar dano é preciso ter OURO na bolsa (nível × 100); sem o ouro, o golpe não faz nada.
// - bateu em alguém sem caveira → CAVEIRA VERMELHA (3 min) e qualquer um (de espada vermelha) pode te bater, mesmo se você apagar a espada;
// - matou alguém → caveira BRANCA; com 5 abates → ROXA; com 10+ → PRETA (vira "procurado" no mural da vila).
//   Os abates somem aos poucos (1 a cada 20 min).
// - quem tira dano de alguém fica com BLOCK (60 s, renova a cada golpe): não entra em área segura, não monta,
//   não sai da conta — e se fechar o jogo, o personagem CONTINUA no mundo até o block acabar.
// - morrer para jogador: perde 10% do XP do nível; com caveira, ainda cai item da bolsa.
// - time não se ataca; GMs ficam de fora; na cidade ninguém se machuca.
// O dano é calculado por quem bate e aplicado por quem apanha (com a defesa dele), pela rede.
// =============================================================
export const PVP = { minLevel: 30, dmgMult: 0.45, redSec: 180, blockSec: 60, decayMin: 20, goldPerLevel: 100, xpLoss: 0.1, bountyPerLevel: 150 };
export const SKULL = [null, { cls: 'pk1', name: 'Caveira vermelha', color: '#ff3b3b' }, { cls: 'pk2', name: 'Caveira branca', color: '#ffffff' }, { cls: 'pk3', name: 'Caveira roxa', color: '#b46bff' }, { cls: 'pk4', name: 'Caveira preta', color: '#111' }];
const MODE_NAME = ['apagada', 'amarela', 'vermelha'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AREA_NAME = { world: 'Vale', cripta: 'Cripta', ermos: 'Ermos', confins: 'Confins' };

class PvpFoe {
  constructor(pvp, g) {
    this.pvp = pvp; this.g = g; this.pvpFoe = true;
    this.radius = 0.55; this.replica = false; this.evading = false; this.visibleToPlayer = true; this.state = 'pvp'; this.dead = false;
    this.stats = { armor: 0, def: 0, maxHp: 100 };
    this.rig = { height: 1.9, root: { visible: true } };
  }
  get pos() { return this.g.pos; }
  get area() { return this.g.pr.ar || 'world'; }
  get level() { return +this.g.pr.l || 1; }
  get hp() { return Math.max(0, +this.g.pr.hp || 0); }
  get def() { return { name: this.g.pr.n || 'Jogador', boss: false, pvp: true }; }
  alive() { return this.pvp.canHit(this.g); }
  takeDamage(dmg, info = {}) { return this.pvp.sendHit(this.g, dmg, info); }
  applySlow() {} applyStun() {} applyFreeze() {} setState() {}
}

export class Pvp {
  constructor(G) {
    this.G = G;
    this.objs = new Map(); // peer → PvpFoe
    this.lastOut = null;   // último ponto fora da área segura (o block empurra de volta)
    this.warnT = 0;
  }
  get net() { return this.G.net; }
  now() { return Date.now(); }
  get d() { const p = this.G.state.player; return (p.pvpx ||= { mode: 0, kills: 0, redUntil: 0, decayAt: 0, blockUntil: 0, maxSkull: 0, bounty: null }); }

  // ---------- estado ----------
  mode() { return this.unlocked() ? (this.d.mode | 0) : 0; }
  unlocked() { return this.G.state.player.level >= PVP.minLevel && !this.G.saver?.serverGm; }
  skull() {
    const d = this.d;
    if (d.kills >= 10) return 4; if (d.kills >= 5) return 3; if (d.kills >= 1) return 2;
    return this.now() < d.redUntil ? 1 : 0;
  }
  skullOf(g) { return +g?.pr?.pk || 0; }
  modeOf(g) { return +g?.pr?.pv || 0; }
  blocked() { return this.now() < (this.d.blockUntil || 0); }
  blockLeft() { return Math.max(0, Math.ceil((this.d.blockUntil - this.now()) / 1000)); }
  goldNeed() { return this.G.state.player.level * PVP.goldPerLevel; }
  hasGold() { return (this.G.state.player.gold || 0) >= this.goldNeed(); }
  // presença: modo, caveira, block (em hora do servidor) e vida máxima (para o servidor aplicar dano se você sair no block)
  presence() {
    const off = this.net?.room?.clockOff || 0;
    return { pv: this.mode(), pk: this.skull(), bl: this.blocked() ? Math.round(this.d.blockUntil + off) : 0, mh: Math.round(this.G.player?.stats?.maxHp || 0) };
  }

  cycle() {
    const G = this.G, ui = G.ui, d = this.d;
    if (G.saver?.serverGm) return ui.toastSmall('GMs não participam do PvP.', 3);
    if (!this.unlocked()) return ui.toastSmall(`A espada do PvP libera no nível ${PVP.minLevel}.`, 3);
    const next = (this.mode() + 1) % 3;
    if (next === 0 && this.blocked()) { G.audio.play('error'); return ui.toastSmall(`Em combate (block): espere ${this.blockLeft()} s para apagar a espada.`, 3); }
    d.mode = next;
    if (next === 1) ui.toastSmall('⚔ Espada AMARELA: você pode ser atacado por quem está de espada vermelha, mas não ataca ninguém.', 5);
    else if (next === 2) ui.toastSmall(`⚔ Espada VERMELHA: seus golpes acertam jogadores (amarelos, vermelhos e com caveira).${this.hasGold() ? '' : ` Você precisa de ${this.goldNeed().toLocaleString('pt-BR')} de ouro para tirar dano!`}`, 6, true);
    else ui.toastSmall('Espada apagada: fora do PvP.', 3);
    G.audio.play('click');
    this.drawBtn(true);
    G.saver?.requestSave('pvp');
  }

  // ---------- quem pode bater em quem ----------
  safeAt(x, z, area) { return this.G.world.isSafe(x, z, area); }
  common(g) {
    const G = this.G, P = G.player;
    if (!g || this.net.stale?.(g) || !g.pr.c) return 'Jogador não está por perto.';
    if (G.saver?.serverGm || this.net.isGm?.(g)) return 'GMs não participam do PvP.';
    if ((g.pr.ar || 'world') !== P.area) return 'Jogador em outro mapa.';
    if (g.pr.d) return 'Jogador caído.';
    if (!P.alive) return 'Você está caído.';
    if (G.party?.id && g.pr.pt === G.party.id) return 'Ele está no seu time.';
    if (this.safeAt(P.pos.x, P.pos.z, P.area) || this.safeAt(g.pos.x, g.pos.z, P.area)) return 'Na cidade ninguém luta (área segura).';
    return null;
  }
  // eu (espada vermelha) posso bater nele?
  whyNot(g) {
    const c = this.common(g); if (c) return c;
    if (this.mode() !== 2) return 'Ligue a espada vermelha para atacar jogadores.';
    if (!(this.modeOf(g) >= 1 || this.skullOf(g) > 0)) return 'Esse jogador está fora do PvP (espada apagada).';
    return null;
  }
  // ele (que me mandou um golpe) podia me bater?
  canHitMe(g) {
    if (this.common(g)) return false;
    if (this.modeOf(g) !== 2 || (+g.pr.l || 1) < PVP.minLevel) return false;
    return this.mode() >= 1 || this.skull() > 0;
  }
  canHit(g) { return !this.whyNot(g); }

  foe(g) { let f = this.objs.get(g.id); if (!f || f.g !== g) { f = new PvpFoe(this, g); this.objs.set(g.id, f); } return f; }
  // com a espada vermelha, os golpes normais acertam quem estiver no PvP por perto (sem clicar em ninguém)
  foes() {
    if (!this.net?.peers?.size || this.mode() !== 2 || this.G.mode !== 'play') return [];
    const out = [];
    for (const g of this.net.peers.values()) if (this.canHit(g)) out.push(this.foe(g));
    return out;
  }

  // ---------- rede ----------
  send(o) { return this.net?.room?.emit('fx', { ...o, n: this.G.state.player.name }).catch(() => {}); }
  sendHit(g, dmg, info) {
    if (!this.canHit(g)) return null;
    if (!this.hasGold()) {
      if (this.now() > this.warnT) { this.warnT = this.now() + 4000; this.G.ui.toastSmall(`Sem ouro suficiente: a espada vermelha precisa de ${this.goldNeed().toLocaleString('pt-BR')} de ouro na bolsa para tirar dano.`, 4); }
      return { dmg: 0, killed: false };
    }
    const d = this.d, now = this.now();
    this.send({ type: 'v_hit', to: g.id, dmg: Math.round(dmg), crit: info.crit ? 1 : 0, l: this.G.state.player.level });
    d.blockUntil = now + PVP.blockSec * 1000;
    if (!this.skullOf(g)) {
      if (this.skull() === 0) this.G.ui.toastSmall('☠ Caveira VERMELHA: você atacou alguém. Agora qualquer um pode te atacar.', 5, true);
      d.redUntil = Math.max(d.redUntil, now + PVP.redSec * 1000);
    }
    return { dmg: Math.max(1, Math.round(dmg * PVP.dmgMult)), killed: false };
  }
  onMsg(m, d) {
    const G = this.G, P = G.player, g = this.net.peers.get(m.peer);
    if (G.mode !== 'play') return;
    if (d.type === 'v_hit') {
      if (!g || !this.canHitMe(g)) return; // na cidade, GM, espada apagada, time…
      const raw = Math.max(0, Math.min(1e7, +d.dmg || 0)) * PVP.dmgMult;
      const skBefore = this.skull();
      const got = hitPlayer(G, raw, { level: +d.l || 1, area: P.area, name: g.pr.n, pvp: true });
      if (got > 0 && !P.alive) {
        this.send({ type: 'v_kill', to: m.peer, sk: skBefore, id: G.state.charId || null });
        this.onKilledBy(g.pr.n, skBefore);
      }
      return;
    }
    if (d.type === 'v_kill') this.onKill(d, g);
  }
  onKill(d, g) {
    const G = this.G, p = G.state.player, x = this.d, name = g?.pr.n || d.n || 'o jogador';
    p.stats.pvpKills = (p.stats.pvpKills || 0) + 1;
    // registro para o site do jogo: quem você derrotou e quando (os 30 últimos)
    p.stats.pvpLog = [...(p.stats.pvpLog || []), { n: String(name).slice(0, 20), t: Date.now() }].slice(-30);
    G.economy?.writeDirectory?.();
    if (!(+d.sk)) { x.kills = (x.kills || 0) + 1; x.decayAt = this.now() + PVP.decayMin * 60000; }
    x.maxSkull = Math.max(x.maxSkull || 0, this.skull());
    // caçada do mural: matou o procurado
    if (x.bounty && d.id && x.bounty.id === d.id) {
      const gold = Math.max(500, x.bounty.lvl * PVP.bountyPerLevel);
      p.gold += gold; p.stats.bounties = (p.stats.bounties || 0) + 1; x.bounty = null;
      G.ui.banner('Recompensa recebida!', `Você derrotou o procurado e ganhou ${gold.toLocaleString('pt-BR')} de ouro.`, '#ffd36b');
      G.audio.play('discover');
    } else G.ui.toastSmall(`Você derrotou ${name}!`, 4, true);
    const sk = this.skull();
    if (sk >= 2) G.ui.toastSmall(`☠ ${SKULL[sk].name}: ${x.kills} abate${x.kills > 1 ? 's' : ''} de jogador.${sk === 4 ? ' Você é PROCURADO na vila!' : ''}`, 5, true);
    if (G.target?.pvpFoe) G.target = null;
    G.saver.requestSave('pvp');
  }
  onKilledBy(byName, skull) {
    const G = this.G, p = G.state.player;
    const need = xpToNext(p.level);
    const lost = Number.isFinite(need) ? Math.min(p.xp, Math.round(need * PVP.xpLoss)) : 0;
    p.xp -= lost;
    let msg = `Você foi derrotado por ${byName}` + (lost ? ` e perdeu ${lost.toLocaleString('pt-BR')} XP.` : '.');
    if (skull >= 1) {
      // com caveira cai item da bolsa (caveira preta: 2), nunca missão nem o que está equipado
      for (let k = 0; k < (skull === 4 ? 2 : 1); k++) {
        const idx = G.inv.slots.map((it, i) => (it && !noTrade(it) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) break;
        const i = idx[Math.floor(Math.random() * idx.length)], it = G.inv.slots[i];
        G.loot?.dropFromBag?.(G.inv.removeAt(i));
        msg += ` Com caveira, você deixou cair ${it.name || 'um item'}.`;
      }
    }
    this.d.redUntil = 0; this.d.blockUntil = 0;
    G.ui.chatMessage({ name: 'PvP', text: msg, system: true, pv: true });
    G.saver.requestSave('pvp');
  }
  // morreu enquanto estava fora do jogo (o personagem ficou no mundo por causa do block)
  onOfflineDeath(m) {
    const G = this.G;
    if (!G.state?.player) return;
    this.onKilledBy(m.by || 'um jogador', +m.sk || 0);
    G.ui.showMessage('Você caiu enquanto estava fora', 'Você saiu do jogo durante o <b>block</b> do PvP. Seu personagem ficou no mundo e foi derrotado.');
  }

  // ---------- mural de procurados (vila) ----------
  wanted() {
    if (!this.net?.peers) return [];
    return [...this.net.peers.values()].filter((g) => this.skullOf(g) === 4 && g.pr.id && !this.net.isGm?.(g));
  }
  openBoard() {
    const G = this.G, ui = G.ui;
    ui.openModal('html', ''); ui.modal = 'wanted'; ui.el.modal.className = 'modal interactive team';
    this.renderBoard();
  }
  renderBoard() {
    const G = this.G, ui = G.ui, x = this.d;
    if (ui.modal !== 'wanted') return;
    const list = this.wanted();
    const cur = x.bounty;
    const cards = list.map((g) => {
      const mine = cur && cur.id === g.pr.id;
      const gold = Math.max(500, (+g.pr.l || 1) * PVP.bountyPerLevel);
      return `<div class="wcard${mine ? ' on' : ''}"><div class="wtop">PROCURADO</div><div class="wskull">☠</div><div class="wlv">Nível ${+g.pr.l || 1}</div><small>${AREA_NAME[g.pr.ar] || 'Vale'}</small><div class="wgold">${gold.toLocaleString('pt-BR')} ouro</div>
        ${mine ? '<span class="tsent">Caçada aceita</span>' : `<button class="btn primary" data-a="pv:hunt" data-i="${esc(g.pr.id)}" data-l="${+g.pr.l || 1}">Aceitar caçada</button>`}</div>`;
    }).join('');
    ui.el.modal.innerHTML = `<div class="card teamcard wanted"><h2>Mural de Procurados</h2>
      <p class="tdesc">Jogadores com <b>caveira preta</b> (10+ abates de jogador). O nome é segredo: só o nível e onde está. Aceite uma caçada, ligue a espada vermelha e derrote o procurado (ele aparece com <b>🎯</b> para você). Recompensa em ouro e conquistas.</p>
      ${cur ? `<p class="tdesc">Sua caçada: procurado de nível <b>${cur.lvl}</b>. <button class="btn" data-a="pv:drop">Desistir</button></p>` : ''}
      <div class="wgrid">${cards || '<p class="tdesc">Nenhum procurado online agora. Volte mais tarde.</p>'}</div>
      <div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
  }
  click(a, el) {
    if (a === 'cycle') return this.cycle();
    if (a === 'hunt') {
      const g = this.wanted().find((w) => w.pr.id === el.dataset.i);
      if (!g) return this.G.ui.toastSmall('Esse procurado saiu.', 3);
      if (g.pr.id === this.G.state.charId) return this.G.ui.toastSmall('Você não pode caçar a si mesmo.', 3);
      this.d.bounty = { id: g.pr.id, lvl: +g.pr.l || 1, t: Date.now() };
      this.G.ui.toastSmall(`Caçada aceita: procurado de nível ${this.d.bounty.lvl}. Ele aparece com 🎯.`, 5);
      this.G.saver?.requestSave('pvp');
    } else if (a === 'drop') { this.d.bounty = null; this.G.saver?.requestSave('pvp'); }
    this.renderBoard();
  }
  isBountyTarget(g) { const b = this.d.bounty; return !!b && !!g?.pr?.id && g.pr.id === b.id; }

  // ---------- HUD / regras do block ----------
  drawBtn(force) {
    const el = this.G.ui?.el?.pvpbtn; if (!el) return;
    if (this.G.saver?.serverGm) { if (this._btnKey !== 'gm') { this._btnKey = 'gm'; el.className = 'pvpbtn hidden'; } return; } // GM não usa PvP
    const st = !this.unlocked() ? 'lock' : ['off', 'yel', 'red'][this.mode()];
    const bl = this.blocked() ? this.blockLeft() : 0;
    const key = st + '|' + bl + '|' + this.hasGold();
    if (!force && key === this._btnKey) return;
    this._btnKey = key;
    el.className = 'pvpbtn interactive ' + st + (bl ? ' blk' : '');
    el.title = !this.unlocked() ? `PvP libera no nível ${PVP.minLevel}` : `Espada ${MODE_NAME[this.mode()]} (toque para trocar)` + (this.mode() === 2 && !this.hasGold() ? ` · precisa de ${this.goldNeed()} de ouro` : '');
    el.innerHTML = `<span class="sw">${ICONS.espada}</span>${!this.unlocked() ? `<small>Nv ${PVP.minLevel}</small>` : bl ? `<small>${bl}s</small>` : ''}`;
  }
  update(dt) {
    const G = this.G, P = G.player, x = this.d, t = this.now();
    if (G.saver?.serverGm && x.mode) x.mode = 0;
    // abates somem aos poucos
    if (x.kills > 0 && t > (x.decayAt || 0)) { if (x.decayAt) x.kills--; x.decayAt = t + PVP.decayMin * 60000; }
    // block: não entra em área segura (volta para fora) e não monta
    if (P && G.mode === 'play') {
      const safe = this.safeAt(P.pos.x, P.pos.z, P.area);
      if (!safe) this.lastOut = { x: P.pos.x, z: P.pos.z, area: P.area };
      else if (this.blocked() && this.lastOut && this.lastOut.area === P.area) {
        P.teleport(this.lastOut.x, this.lastOut.z);
        if (t > this.warnT) { this.warnT = t + 2500; G.ui.toastSmall(`Em combate (block): você não pode entrar na área segura por ${this.blockLeft()} s.`, 3); }
      }
      if (this.blocked() && P.mounted) P.setMount(false);
    }
    // sua caveira ao lado do seu nome
    const sk = this.skull(), nm = G.ui?.el?.pname;
    if (nm && (sk !== this._shown || !nm.querySelector('.myskull') !== !sk)) {
      this._shown = sk; nm.querySelector('.myskull')?.remove();
      if (sk) { const i = document.createElement('i'); i.className = 'myskull ' + SKULL[sk].cls; i.textContent = '☠'; i.title = SKULL[sk].name; nm.prepend(i); }
    }
    this.drawBtn();
    if (G.target?.pvpFoe && !G.target.alive()) G.target = null;
    for (const k of this.objs.keys()) if (!this.net?.peers.has(k)) this.objs.delete(k);
  }
}
