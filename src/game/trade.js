// Troca segura entre dois jogadores online e perto um do outro.
//
// Como fica segura:
//  1. Cada um monta a sua oferta (itens da bolsa + ouro). A oferta do outro aparece em tempo real.
//  2. Qualquer mudança em qualquer lado desmarca o "Pronto" dos dois.
//  3. Com os dois "Prontos", abre a tela de conferência ("você dá / você recebe") e cada um aperta "Confirmar".
//  4. A troca só acontece quando os dois confirmaram exatamente as mesmas ofertas (código da troca igual dos dois lados).
//  5. Antes de trocar, cada lado confere se ainda tem tudo o que ofereceu; se algo sumiu, a troca é cancelada.
//  6. Itens recebidos passam por um validador; itens de missão não podem ser trocados; diamantes nunca entram em troca.
// A troca é cancelada se alguém se afastar, mudar de região, sair do jogo ou ficar 3 minutos parado.
import { sanitizeEntry, tradable, displayName } from '../core/items.js';
import { rng } from '../core/rng.js';

export const TRADE = { range: 10, keepRange: 25, maxItems: 8, maxGold: 10000000, idleSec: 180, resendSec: 1.5, resendFor: 25 };

// código da troca: igual nos dois lados quando as ofertas são as mesmas
export function tradeHash(offerA, offerB) {
  const s = `${offerA.gold}|${offerA.items.join('§')}#${offerB.gold}|${offerB.items.join('§')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}

export class Trade {
  constructor(G) {
    this.G = G;
    this.s = null;          // sessão atual
    this.invites = [];      // [{ peer, n, t }]
    this.pending = null;    // convite que eu mandei { peer, t }
    this.sel = null;
  }

  get net() { return this.G.net; }
  selfPeer() { return this.net?.selfPeer; }
  peerInfo(peer) { return this.net?.peers?.get(peer); }

  near(peer, range) {
    const g = this.peerInfo(peer), P = this.G.player;
    if (!g || !P) return false;
    if ((g.pr.ar || 'world') !== P.area) return false;
    return Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) <= range;
  }

  emit(o) { this.net?.room?.emit('fx', { ...o, n: this.G.state.player.name }).catch(() => {}); }

  // ---------- convite ----------
  invite(peer) {
    if (this.s) return this.G.ui.toastSmall('Termine a troca atual primeiro.');
    if (!this.net?.room) return this.G.ui.toastSmall('A troca funciona quando há outros jogadores online.');
    if (!this.near(peer, TRADE.range)) return this.G.ui.toastSmall(`Chegue mais perto (até ${TRADE.range} m) para propor uma troca.`);
    this.pending = { peer, t: Date.now() };
    this.emit({ type: 'tr_inv', to: peer });
    this.G.ui.toastSmall(`Pedido de troca enviado para ${this.peerInfo(peer)?.pr.n || 'o jogador'}.`);
    this.refresh();
  }

  accept(i) {
    const inv = this.invites[i];
    if (!inv) return;
    this.invites.splice(i, 1);
    if (this.s) return;
    if (!this.near(inv.peer, TRADE.keepRange)) { this.G.ui.toastSmall('O jogador se afastou.'); return this.refresh(); }
    this.emit({ type: 'tr_acc', to: inv.peer });
    this.begin(inv.peer, inv.n);
  }

  decline(i) {
    const inv = this.invites[i];
    if (!inv) return;
    this.invites.splice(i, 1);
    this.emit({ type: 'tr_dec', to: inv.peer });
    this.refresh();
  }

  begin(peer, name) {
    this.pending = null;
    this.s = {
      peer, name: String(name || 'Jogador').slice(0, 20),
      mine: { refs: [], json: [], gold: 0 }, theirs: { items: [], json: [], gold: 0 },
      mySeq: 0, theirSeq: -1, myReady: null, theirReady: null, myConf: null, theirConf: null,
      phase: 'offer', last: Date.now(), resendT: 0, resendLeft: 0, done: null,
    };
    this.sel = null;
    this.G.ui.closeDialog?.();
    this.open();
    this.G.audio.play('discover');
  }

  // ---------- oferta ----------
  myOffer() { return { gold: this.s.mine.gold, items: this.s.mine.json }; }
  theirOffer() { return { gold: this.s.theirs.gold, items: this.s.theirs.json }; }
  hash() {
    const me = this.selfPeer() || 'eu', A = me < this.s.peer;
    return A ? tradeHash(this.myOffer(), this.theirOffer()) : tradeHash(this.theirOffer(), this.myOffer());
  }

  changed() {
    const s = this.s;
    s.mySeq++; s.myReady = null; s.theirReady = null; s.myConf = null; s.theirConf = null; s.phase = 'offer'; s.last = Date.now();
    this.emit({ type: 'tr_off', to: s.peer, seq: s.mySeq, items: s.mine.json, gold: s.mine.gold });
    this.refresh();
  }

  addItem(invIndex) {
    const s = this.s, it = this.G.inv.slots[invIndex];
    if (!s || !it || s.phase !== 'offer') return;
    if (!tradable(it)) return this.G.ui.toastSmall('Chaves, itens de missão itens únicos e prêmios presos ao personagem não podem ser trocados.');
    if (s.mine.refs.includes(it)) return;
    if (s.mine.refs.length >= TRADE.maxItems) return this.G.ui.toastSmall(`No máximo ${TRADE.maxItems} itens por troca.`);
    s.mine.refs.push(it); s.mine.json.push(JSON.stringify(it));
    this.changed();
  }

  removeItem(i) {
    const s = this.s;
    if (!s || s.phase !== 'offer') return;
    s.mine.refs.splice(i, 1); s.mine.json.splice(i, 1);
    this.changed();
  }

  setGold(n) {
    const s = this.s;
    if (!s || s.phase !== 'offer') return;
    n = Math.max(0, Math.min(Math.floor(+n || 0), this.G.state.player.gold, TRADE.maxGold));
    if (n === s.mine.gold) return this.refresh();
    s.mine.gold = n;
    this.changed();
  }

  // ---------- pronto / confirmar ----------
  ready() {
    const s = this.s;
    if (!s || s.phase !== 'offer') return;
    if (s.theirSeq < 0) return this.G.ui.toastSmall('Aguarde a oferta do outro jogador chegar.');
    if (!s.mine.refs.length && !s.mine.gold && !s.theirs.items.length && !s.theirs.gold) return this.G.ui.toastSmall('As duas ofertas estão vazias.');
    s.myReady = this.hash();
    this.emit({ type: 'tr_rdy', to: s.peer, h: s.myReady });
    this.checkReady();
    this.refresh();
  }

  checkReady() {
    const s = this.s;
    if (s.myReady && s.theirReady && s.myReady === s.theirReady && s.myReady === this.hash()) s.phase = 'confirm';
  }

  spaceOk() {
    const s = this.s, inv = this.G.inv;
    // espaço que sobra depois de entregar os meus itens
    const free = Math.max(0, inv.cap - (inv.usedSlots() - s.mine.refs.length)); // bolsa acima do limite: só o que ficar abaixo do teto conta
    return s.theirs.items.length <= free;
  }

  confirm() {
    const s = this.s;
    if (!s || s.phase !== 'confirm') return;
    if (!this.spaceOk()) return this.G.ui.toastSmall('Sua bolsa não tem espaço para o que você vai receber.');
    if (this.peerInfo(s.peer) && !this.near(s.peer, TRADE.keepRange)) return this.G.ui.toastSmall('Chegue mais perto do outro jogador para confirmar.');
    s.myConf = this.hash();
    s.resendLeft = TRADE.resendFor; s.resendT = TRADE.resendSec;
    this.emit({ type: 'tr_cnf', to: s.peer, h: s.myConf });
    if (s.theirConf === s.myConf) this.commit();
    this.refresh();
  }

  // a troca acontece de verdade aqui (cada lado entrega o que é seu e recebe o do outro)
  commit() {
    const s = this.s, G = this.G, sp = G.state.player, inv = G.inv;
    if (!s || s.done) return;
    const h = s.myConf;
    // ainda tenho tudo o que ofereci?
    for (let i = 0; i < s.mine.refs.length; i++) {
      const r = s.mine.refs[i];
      if (inv.slots.indexOf(r) < 0 || JSON.stringify(r) !== s.mine.json[i]) return this.cancel('Um item da sua oferta mudou ou saiu da bolsa.', true);
    }
    if (sp.gold < s.mine.gold) return this.cancel('Você não tem mais o ouro que ofereceu.', true);
    const incoming = s.theirs.items.map((x) => sanitizeEntry(x, rng));
    if (incoming.some((x) => !x)) return this.cancel('A oferta do outro jogador tem um item inválido.', true);
    if (!this.spaceOk()) return this.cancel('Sua bolsa não tem espaço para o que você vai receber.', true);
    // entrega
    for (const r of s.mine.refs) { const i = inv.slots.indexOf(r); if (i >= 0) inv.slots[i] = null; }
    inv.compact();
    sp.gold -= s.mine.gold;
    // recebe
    for (const it of incoming) { const left = inv.add(it); if (left > 0) G.loot.spawnDrop({ ...it, qty: it.kind === 'equip' ? undefined : left }, G.player.pos.x, G.player.pos.z, G.player.area); }
    sp.gold += s.theirs.gold;
    sp.stats.trades = (sp.stats.trades || 0) + 1;
    s.done = h; s.phase = 'done';
    G.saver.saveNow('troca', true);
    this.emit({ type: 'tr_fin', to: s.peer, h });
    G.ui.refreshHud?.();
    G.audio.play('loot', { rarity: 2 });
    const got = incoming.map((x) => displayName(x) + (x.qty > 1 ? ` x${x.qty}` : '')).join(', ');
    G.ui.banner('Troca concluída!', `Você recebeu ${[got, s.theirs.gold ? `${s.theirs.gold.toLocaleString('pt-BR')} de ouro` : ''].filter(Boolean).join(' e ') || 'nada'} de ${s.name}.`, '#7dffa8');
    this.refresh();
  }

  cancel(reason = 'Troca cancelada.', tell = true) {
    const s = this.s;
    if (!s) return;
    if (tell && !s.done) this.emit({ type: 'tr_can', to: s.peer, why: reason.slice(0, 80) });
    this.s = null;
    this.G.ui.toastSmall(reason, 4);
    this.close();
  }

  // ---------- mensagens ----------
  onFx(m, d) {
    const me = this.selfPeer(), from = m.peer;
    if (d.to && d.to !== me) return;
    const s = this.s;
    switch (d.type) {
      case 'tr_inv': {
        if (s) { this.emit({ type: 'tr_busy', to: from }); return; }
        this.invites = this.invites.filter((x) => x.peer !== from && Date.now() - x.t < 60000);
        this.invites.push({ peer: from, n: String(d.n || 'Jogador').slice(0, 20), t: Date.now() });
        this.G.ui.chatMessage?.({ name: String(d.n || 'Alguém').slice(0, 20), text: 'quer trocar com você (Aceitar no aviso ao lado)', system: true });
        this.G.social?.drawSel(true);
        this.G.audio.play('discover');
        this.refresh();
        return;
      }
      case 'tr_acc': if (this.pending?.peer === from && !s) this.begin(from, d.n); return;
      case 'tr_dec': if (this.pending?.peer === from) { this.pending = null; this.G.ui.toastSmall(`${String(d.n || 'O jogador').slice(0, 20)} recusou a troca.`); this.refresh(); } return;
      case 'tr_busy': if (this.pending?.peer === from) { this.pending = null; this.G.ui.toastSmall('O jogador já está em outra troca.'); this.refresh(); } return;
    }
    if (!s || s.peer !== from) return;
    s.last = Date.now();
    switch (d.type) {
      case 'tr_off': {
        if (s.done) return;
        const seq = Math.floor(+d.seq);
        if (!(seq > s.theirSeq)) return;
        const items = Array.isArray(d.items) ? d.items.slice(0, TRADE.maxItems).map(String) : [];
        if (items.some((x) => x.length > 6000)) return;
        s.theirSeq = seq;
        s.theirs.json = items;
        s.theirs.items = items;
        s.theirs.gold = Math.max(0, Math.min(TRADE.maxGold, Math.floor(+d.gold || 0)));
        s.myReady = null; s.theirReady = null; s.myConf = null; s.theirConf = null; s.phase = 'offer';
        this.refresh();
        return;
      }
      case 'tr_rdy': s.theirReady = String(d.h || ''); this.checkReady(); this.refresh(); return;
      case 'tr_cnf': {
        const h = String(d.h || '');
        if (s.done) { if (h === s.done) this.emit({ type: 'tr_fin', to: s.peer, h }); return; }
        s.theirConf = h;
        if (s.myConf && s.myConf === h) this.commit();
        this.refresh();
        return;
      }
      case 'tr_fin': if (s.done && String(d.h) === s.done) { s.resendLeft = 0; } else if (!s.done && s.myConf && String(d.h) === s.myConf) { s.theirConf = s.myConf; this.commit(); } return;
      case 'tr_can': if (!s.done) { this.s = null; this.G.ui.toastSmall(`${s.name} cancelou a troca${d.why ? `: ${String(d.why).slice(0, 80)}` : '.'}`, 4); this.close(); } return;
      default: return;
    }
  }

  update(dt) {
    const s = this.s;
    if (!s) return;
    if (s.done) {
      // continua avisando "terminei" até o outro responder (mensagem perdida não deixa um lado sem receber)
      if (s.resendLeft > 0) { s.resendLeft -= dt; s.resendT -= dt; if (s.resendT <= 0) { s.resendT = TRADE.resendSec; this.emit({ type: 'tr_fin', to: s.peer, h: s.done }); } }
      return;
    }
    // a conexão pode piscar: só cancela se o outro sumir ou ficar longe por alguns segundos seguidos
    if (!this.peerInfo(s.peer)) { s.goneT = (s.goneT || 0) + dt; if (s.goneT > 8) return this.cancel('O outro jogador saiu do jogo.', false); } else s.goneT = 0;
    if (this.peerInfo(s.peer) && !this.near(s.peer, TRADE.keepRange)) { s.farT = (s.farT || 0) + dt; if (s.farT > 3) return this.cancel('Vocês se afastaram e a troca foi cancelada.', true); } else s.farT = 0;
    if (Date.now() - s.last > TRADE.idleSec * 1000) return this.cancel('A troca ficou parada tempo demais.', true);
    if (s.myConf && s.resendLeft > 0) { s.resendLeft -= dt; s.resendT -= dt; if (s.resendT <= 0) { s.resendT = TRADE.resendSec; this.emit({ type: 'tr_cnf', to: s.peer, h: s.myConf }); } }
    // oferta saiu da bolsa no meio (ex.: vendeu ou equipou): tira da oferta
    if (s.phase === 'offer') {
      const lost = s.mine.refs.findIndex((r) => this.G.inv.slots.indexOf(r) < 0);
      if (lost >= 0) this.removeItem(lost);
      if (s.mine.gold > this.G.state.player.gold) this.setGold(this.G.state.player.gold);
    }
  }

  // ---------- janela ----------
  open() { this.G.ui.openModal('html', ''); this.G.ui.modal = 'trade'; this.G.ui.el.modal.className = 'modal interactive trade'; this.refresh(); }
  close() { if (this.G.ui.modal === 'trade') this.G.ui.closeModal(); this.G.party?.refresh?.(); }
  refresh() {
    const ui = this.G.ui;
    if (ui.modal === 'trade' && this.s) ui.el.modal.innerHTML = ui.renderTrade(this);
    else if (ui.modal === 'trade' && !this.s) this.close();
    this.G.party?.refresh?.();
  }

  click(a, el) {
    if (a === 'inv') this.invite(el.dataset.p);
    else if (a === 'acc') this.accept(+el.dataset.i);
    else if (a === 'dec') this.decline(+el.dataset.i);
    else if (a === 'add') this.addItem(+el.dataset.i);
    else if (a === 'rem') this.removeItem(+el.dataset.i);
    else if (a === 'gold') { const v = this.G.ui.el.modal.querySelector('#trgold')?.value; this.setGold(v); }
    else if (a === 'goldall') this.setGold(this.G.state.player.gold);
    else if (a === 'ready') this.ready();
    else if (a === 'confirm') this.confirm();
    else if (a === 'back') { if (this.s && this.s.phase === 'confirm' && !this.s.myConf) this.changed(); }
    else if (a === 'cancel') this.cancel('Você cancelou a troca.', true);
    else if (a === 'close') { if (this.s?.done) { this.s = null; this.close(); } }
  }
}
