import { CLASSES } from '../config/classes.js';
import { RARITIES, RARITY_INDEX } from '../config/balance.js';

// Modo time: convide outros jogadores; XP dividido igualmente entre os membros que lutaram ou estavam perto,
// e quem ajudou ganha o abate (missões, bestiário, conquistas e o chefe) — sem limite de membros.
const KEY = 'rift.party.v1.';
export const TEAM_RANGE = 55; // metros: quem está perto do monstro quando ele cai conta como ajuda

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AREA_NAME = { world: 'Vale', cripta: 'Cripta', ermos: 'Ermos', confins: 'Confins' };

export class Party {
  constructor(G) {
    this.G = G;
    this.id = null;
    this.invites = [];      // convites recebidos { peer, pt, n, t }
    this.sent = new Map();  // peer -> hora do convite enviado
    this.tab = 'membros';
    this.log = null;        // saque do time desde que ele foi criado (itens e ouro de todos os membros)
    this.load();
  }

  // ---------- saque do time ----------
  logKey() { return KEY + (this.G.state?.charId || 'x') + '.log'; }
  loadLog() {
    if (!this.id) { this.log = null; return; }
    if (this.log?.pt === this.id) return;
    try { const o = JSON.parse(localStorage.getItem(this.logKey()) || 'null'); if (o && o.pt === this.id) { this.log = o; return; } } catch { /* ok */ }
    this.log = { pt: this.id, since: Date.now(), items: [], stacks: {}, gold: {} };
  }
  saveLog() { if (this.log) try { localStorage.setItem(this.logKey(), JSON.stringify(this.log)); } catch { /* ok */ } }
  addLog(who, k, nm, r, q, src) {
    this.loadLog(); const L = this.log; if (!L) return;
    who = String(who || '?').slice(0, 16); nm = String(nm || '').slice(0, 60); q = Math.max(1, Math.min(1e7, Math.round(+q || 1)));
    if (k === 'g') L.gold[who] = (L.gold[who] || 0) + q;
    else if (k === 'e') { L.items.unshift({ w: who, nm, r: RARITY_INDEX[r] !== undefined ? r : 'comum', src: String(src || '').slice(0, 40), t: Date.now() }); L.items.length = Math.min(L.items.length, 200); }
    else { const key = who + '|' + nm; L.stacks[key] = (L.stacks[key] || 0) + q; }
    this.saveLog();
    if (this.G.ui.modal === 'team' && this.tab === 'saque') this.refresh();
  }
  // o que EU peguei de monstro/chefe vai para o saque do time (e os outros membros recebem)
  noteLoot(kind, nm, rarity, qty, src) {
    if (!this.id) return;
    const me = this.G.state.player.name;
    this.addLog(me, kind, nm, rarity, qty, src);
    this.net?.room?.emit('fx', { type: 'plt', pt: this.id, k: kind, nm, r: rarity, q: qty, src, n: me }).catch(() => {});
  }

  get net() { return this.G.net; }
  key() { return KEY + (this.G.state?.charId || 'x'); }
  load() {
    try {
      const o = JSON.parse(localStorage.getItem(this.key()) || 'null');
      if (o && Date.now() - o.t < 3 * 3600e3) this.id = o.id;
    } catch { /* sem armazenamento */ }
  }
  save() { try { localStorage.setItem(this.key(), JSON.stringify({ id: this.id, t: Date.now() })); } catch { /* ok */ } }

  mates() {
    if (!this.id || !this.net) return [];
    return [...this.net.peers.values()].filter((g) => g.pr.pt === this.id);
  }
  size() { return this.id ? 1 + this.mates().length : 1; }
  isMate(peer) { const g = this.net?.peers.get(peer); return !!(this.id && g && g.pr.pt === this.id); }

  // manda a presença na hora (o time aparece para todos sem esperar)
  push() { const n = this.net; if (n?.room) { n.lastSent = null; n.lastSend = 1; try { n.update(0); } catch { /* ok */ } } }

  emit(o) { this.net?.room?.emit('fx', { ...o, n: this.G.state.player.name }).catch(() => this.G.ui.toastSmall('Não foi possível enviar agora.')); }

  // O time só é criado quando o convidado ACEITA: até lá o convite fica pendente (this.pend)
  invite(peer) {
    if (!this.net?.room) return;
    const pt = this.id || this.pend || (this.pend = 't' + Math.random().toString(36).slice(2, 10));
    this.sent.set(peer, Date.now());
    this.emit({ type: 'pinv', to: peer, pt });
    const g = this.net.peers.get(peer);
    this.G.ui.toastSmall(`Convite enviado para ${g?.pr.n || 'o jogador'}.`);
    this.refresh();
  }

  accept(i) {
    const inv = this.invites[i];
    if (!inv) return;
    if (this.id && this.id !== inv.pt) this.emit({ type: 'pleave', pt: this.id });
    this.id = inv.pt; this.save();
    this.invites = this.invites.filter((x) => x.pt !== inv.pt);
    this.push();
    this.emit({ type: 'pacc', to: inv.peer, pt: inv.pt });
    this.G.ui.banner('Você entrou no time', `Time de ${inv.n}. O XP é dividido entre quem luta junto.`, '#7dffa8');
    this.G.audio.play('discover');
    this.refresh();
  }
  decline(i) { this.invites.splice(i, 1); this.refresh(); }

  leave() {
    if (!this.id) return;
    this.emit({ type: 'pleave', pt: this.id });
    this.id = null; this.save(); this.push();
    this.G.ui.toastSmall('Você saiu do time.');
    this.refresh();
  }

  onFx(m, d) {
    const me = this.net.selfPeer, name = String(d.n || 'Viajante').slice(0, 16);
    if (d.type === 'pinv' && d.to === me && typeof d.pt === 'string') {
      if (d.pt === this.id) return;
      this.invites = this.invites.filter((x) => x.peer !== m.peer);
      if (this.invites.length >= 5) this.invites.shift();
      this.invites.push({ peer: m.peer, pt: d.pt.slice(0, 20), n: name, t: Date.now() });
      this.G.audio.play('discover');
      const ui = this.G.ui;
      // não abre o painel sozinho (atrapalhava a luta): aparece o aviso com Aceitar/Recusar no cantinho da tela
      ui.chatMessage?.({ name, text: 'convidou você para o time (Aceitar no aviso ao lado)', system: true });
      this.G.social?.drawSel(true);
    } else if (d.type === 'pacc' && d.to === me && (d.pt === this.id || d.pt === this.pend)) {
      if (!this.id) { this.id = this.pend; this.pend = null; this.save(); this.push(); }
      this.sent.delete(m.peer);
      this.G.ui.toastSmall(`${name} entrou no seu time!`, 4);
      this.G.audio.play('discover');
    } else if (d.type === 'pleave' && d.pt && d.pt === this.id) {
      this.G.ui.toastSmall(`${name} saiu do time.`);
    } else if (d.type === 'plt' && d.pt && d.pt === this.id && this.isMate(m.peer) && ['e', 's', 'g'].includes(d.k)) {
      this.addLog(name, d.k, d.nm, d.r, d.q, d.src);
      return;
    }
    this.refresh();
  }

  // Decide se ESTE jogador recebe o abate e por quantos o XP é dividido.
  // contrib: ids dos jogadores (na sala) que causaram dano ao monstro.
  credit(e, contrib) {
    const G = this.G, P = G.player;
    const mine = G.time.t - e.localHit < 60;
    if (!this.id) return mine ? { share: 1, assist: false } : null;
    const mates = this.mates();
    const teamHit = mine || mates.some((g) => contrib.has(g.id));
    if (!teamHit) return null;
    const near = (x, z, ar) => ar === e.area && Math.hypot(x - e.pos.x, z - e.pos.z) < TEAM_RANGE;
    if (!mine && !near(P.pos.x, P.pos.z, P.area)) return null; // caído perto também conta: ajudou na luta
    const n = 1 + mates.filter((g) => contrib.has(g.id) || near(g.pos.x, g.pos.z, g.pr.ar || 'world')).length;
    return { share: n, assist: !mine };
  }

  // ---------- interface ----------
  open() { this.G.ui.openModal('html', this.render()); this.G.ui.modal = 'team'; this.G.ui.el.modal.className = 'modal interactive team'; }
  refresh() { if (this.G.ui.modal === 'team') this.G.ui.el.modal.innerHTML = this.render(); this.G.ui.refreshTeam?.(); }

  row(n, cls, lvl, area, hp, extra = '', me = false) {
    const c = CLASSES[cls];
    return `<div class="trow${me ? ' me' : ''}"><div class="tinfo"><b>${esc(n)}</b><small>${esc(c?.name || '')} · Nv ${+lvl || 1} · ${AREA_NAME[area] || 'Vale'}</small>
      <div class="bar hp mini"><i style="width:${Math.max(0, Math.min(100, hp ?? 100))}%"></i></div></div>${extra}</div>`;
  }

  // botão de troca (só perto: até 10 m)
  tradeBtn(g) {
    const T = this.G.trade;
    if (!T) return '';
    if (T.pending?.peer === g.id && Date.now() - T.pending.t < 60000) return '<span class="tsent">Troca pedida</span>';
    const ok = T.near(g.id, 10);
    return `<button class="btn" data-a="tr:inv" data-p="${esc(g.id)}" ${ok ? '' : 'disabled title="Chegue a até 10 m para trocar"'}>${ok ? 'Trocar' : 'Trocar (longe)'}</button>`;
  }

  renderLoot() {
    this.loadLog();
    const L = this.log;
    let h = `<div class="card teamcard"><h2>Time</h2>${this.tabsHtml()}`;
    if (!L) return h + `<p class="tdesc">Entre em um time para ver aqui tudo o que o time pegar.</p><div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
    const totalGold = Object.values(L.gold).reduce((a, b) => a + b, 0);
    const d = new Date(L.since), hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    h += `<p class="tdesc">Tudo o que os membros pegaram de monstros e chefes desde que o time foi criado (${hh}).</p>`;
    h += `<div class="tcols"><div class="tcol"><h3>Ouro do time: ${totalGold.toLocaleString('pt-BR')}</h3>`;
    const gl = Object.entries(L.gold).sort((a, b) => b[1] - a[1]);
    h += gl.length ? gl.map(([w, g]) => `<div class="tloot"><b>${esc(w)}</b><span class="tgold">${g.toLocaleString('pt-BR')} de ouro</span></div>`).join('') : '<p class="tdesc">Ninguém pegou ouro ainda.</p>';
    const st = Object.entries(L.stacks).sort((a, b) => b[1] - a[1]).slice(0, 40);
    if (st.length) h += `<h3>Materiais e poções</h3>` + st.map(([k, q]) => { const [w, nm] = k.split('|'); return `<div class="tloot"><b>${esc(w)}</b><span>${esc(nm)} ×${q}</span></div>`; }).join('');
    h += `</div><div class="tcol"><h3>Itens (${L.items.length})</h3>`;
    h += L.items.length ? L.items.map((it) => { const R = RARITIES[RARITY_INDEX[it.r] ?? 0]; return `<div class="tloot"><b>${esc(it.w)}</b><span style="color:${R.color}">${esc(it.nm)}</span>${it.src ? `<small>de ${esc(it.src)}</small>` : ''}</div>`; }).join('') : '<p class="tdesc">Nenhum item ainda.</p>';
    h += `</div></div><div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
    return h;
  }
  tabsHtml() { return `<div class="ttabs"><button class="btn${this.tab === 'membros' ? ' primary' : ''}" data-a="team:tab" data-t="membros">Membros</button><button class="btn${this.tab === 'saque' ? ' primary' : ''}" data-a="team:tab" data-t="saque">Saque do time</button></div>`; }

  render() {
    if (this.tab === 'saque') return this.renderLoot();
    const G = this.G, st = G.state.player, P = G.player;
    const online = !!this.net?.room;
    const mates = this.mates();
    const others = online ? [...this.net.peers.values()].filter((g) => !this.id || g.pr.pt !== this.id) : [];
    const myHp = Math.round((P.hp / P.stats.maxHp) * 100);
    let h = `<div class="card teamcard"><h2>Time</h2>${this.tabsHtml()}
      <p class="tdesc">O XP de cada monstro é <b>dividido igualmente</b> entre os membros do time que lutaram ou estavam perto (até ${TEAM_RANGE} m). Quem ajudou também ganha o abate: missões, bestiário e <b>conquistas</b> — inclusive o chefe. Sem limite de pessoas. Para <b>trocar</b> itens e ouro com segurança, chegue perto da pessoa e toque em Trocar.</p>
      <div class="tcols"><div class="tcol"><h3>${this.id ? `Seu time (${1 + mates.length})` : 'Você está sozinho'}${this.id ? ' <button class="btn tleave" data-a="team:leave">Sair do time</button>' : ''}</h3>`;
    h += this.row(st.name, P.cls.id, st.level, P.area, myHp, '', true);
    for (const g of mates) h += this.row(g.pr.n, g.pr.c, g.pr.l, g.pr.ar, g.pr.hp, this.tradeBtn(g));
    h += `</div><div class="tcol">`;
    if (this.invites.length) {
      h += `<h3>Convites</h3>`;
      this.invites.forEach((inv, i) => { h += `<div class="trow inv"><div class="tinfo"><b>${esc(inv.n)}</b><small>convidou você para o time</small></div><button class="btn primary" data-a="team:acc" data-i="${i}">Entrar</button><button class="btn" data-a="team:dec" data-i="${i}">Recusar</button></div>`; });
    }
    const T = G.trade;
    if (T?.invites.length) {
      h += `<h3>Pedidos de troca</h3>`;
      T.invites.forEach((inv, i) => { h += `<div class="trow inv"><div class="tinfo"><b>${esc(inv.n)}</b><small>quer trocar itens/ouro com você</small></div><button class="btn primary" data-a="tr:acc" data-i="${i}">Trocar</button><button class="btn" data-a="tr:dec" data-i="${i}">Recusar</button></div>`; });
    }
    h += `<h3>Jogadores online</h3>`;
    if (!online) h += `<p class="tdesc">Sem conexão multiplayer. Abra a página publicada do jogo para jogar com outras pessoas.</p>`;
    else if (!others.length) h += `<p class="tdesc">Ninguém mais online agora. Quando alguém abrir o jogo, aparece aqui para você convidar.</p>`;
    for (const g of others) {
      const sent = this.sent.has(g.id) && Date.now() - this.sent.get(g.id) < 60000;
      h += this.row(g.pr.n, g.pr.c, g.pr.l, g.pr.ar, g.pr.hp, (sent ? `<span class="tsent">Convite enviado</span>` : `<button class="btn primary" data-a="team:inv" data-p="${esc(g.id)}">Convidar</button>`) + this.tradeBtn(g));
    }
    h += `</div></div><div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
    return h;
  }

  click(a, el) {
    if (a === 'tab') { this.tab = el.dataset.t === 'saque' ? 'saque' : 'membros'; this.refresh(); return; }
    if (a === 'inv') this.invite(el.dataset.p);
    else if (a === 'acc') this.accept(+el.dataset.i);
    else if (a === 'dec') this.decline(+el.dataset.i);
    else if (a === 'leave') this.leave();
  }

  // quadros do time no HUD (abaixo do seu)
  hudHtml() {
    const mates = this.mates();
    if (!mates.length) return '';
    const shown = mates.slice(0, 5);
    let h = shown.map((g) => `<div class="tm${g.pr.d ? ' dead' : ''}"><span>${esc(String(g.pr.n || '').slice(0, 10))} <small>${+g.pr.l || 1}</small></span><div class="bar hp mini"><i style="width:${Math.max(0, Math.min(100, g.pr.d ? 0 : g.pr.hp ?? 100))}%"></i></div></div>`).join('');
    if (mates.length > shown.length) h += `<div class="tm more">+${mates.length - shown.length} no time</div>`;
    return h;
  }
}
