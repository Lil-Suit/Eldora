import * as THREE from 'three';
import { CLASSES } from '../config/classes.js';
import { ACHIEVEMENTS } from '../config/cosmetics.js';
import { RARITIES, RARITY_INDEX } from '../config/balance.js';
import { isAdult, chatBanLeft, setChatBan, CHAT_BAN_MS } from '../core/chatfilter.js';

// Social: ficha do jogador (clicar/tocar em alguém), amigos (online/offline) e mensagens privadas.
// Mensagens de rede começam com "s_" (sinsp: pede a ficha; sinspr: resposta; sfadd: aviso de amizade; sdm: privado).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AREA_NAME = { world: 'Vale', cripta: 'Cripta', ermos: 'Ermos', confins: 'Confins' };
const _v = new THREE.Vector3();

export class Social {
  constructor(G) {
    this.G = G;
    this.online = new Map();   // amigo -> estava online na última checagem
    this.checked = false;
    this.info = new Map();     // peer -> resposta da ficha { ach, shop }
    this.card = null;          // peer da ficha aberta
    this.dmWith = null;        // nome de quem está na conversa privada aberta
    this.dms = new Map();      // nome -> [{ me, text, t }]
  }
  get net() { return this.G.net; }
  friends() { const p = this.G.state?.player; if (!p) return []; return (p.friends ||= []); }
  findFriend(id, n) { return this.friends().find((f) => (id && f.id && f.id === id) || f.n === n); }
  ghostOf(f) { if (!this.net) return null; for (const g of this.net.peers.values()) if (!this.net.stale(g) && (f.id && g.pr.id === f.id) || g.pr.n === f.n) return g; return null; }
  peerByName(n) { if (!this.net) return null; for (const g of this.net.peers.values()) if (g.pr.n === n) return g; const k = String(n).toLowerCase(); for (const g of this.net.peers.values()) if (String(g.pr.n || '').toLowerCase() === k) return g; return null; }
  send(o) { return this.net?.room?.emit('fx', { ...o, n: this.G.state.player.name }).catch(() => {}); }

  // ---------- quem está online ----------
  update(dt) {
    this.drawSel();
    const now = performance.now(); // relógio real: não depende do FPS
    if (now - (this.lastChk || 0) < 1000 || !this.G.state?.player) return;
    this.lastChk = now;
    const ui = this.G.ui;
    for (const f of this.friends()) {
      const g = this.ghostOf(f), on = !!g, was = this.online.get(f.n);
      if (g) { f.l = +g.pr.l || f.l; f.c = g.pr.c || f.c; if (g.pr.id) f.id = g.pr.id; }
      if (this.checked && was !== undefined && was !== on) {
        ui.toastSmall(`Amigo ${f.n} ficou ${on ? 'online' : 'offline'}.`, 4);
        ui.chatMessage({ name: f.n, text: on ? 'ficou online' : 'ficou offline', system: true });
      }
      this.online.set(f.n, on);
    }
    this.checked = true;
    if (this.G.ui.modal === 'friends') this.renderFriends();
  }

  // ---------- clicar / tocar em um jogador ----------
  ghostAt(sx, sy, maxPx = 46) {
    const G = this.G, P = G.player;
    if (!this.net || !P) return null;
    const w = G.renderer.domElement.clientWidth, h = G.renderer.domElement.clientHeight;
    let best = null, bd = maxPx;
    for (const g of this.net.peers.values()) {
      if (!g.proxy || (g.pr.ar || 'world') !== P.area || !g.rig?.root.visible) continue;
      _v.set(g.pos.x, g.pos.y + 1.1, g.pos.z).project(G.camera);
      if (_v.z > 1) continue;
      const d = Math.hypot((_v.x * 0.5 + 0.5) * w - sx, (-_v.y * 0.5 + 0.5) * h - sy);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  // tocar/clicar em um jogador só SELECIONA (estilo Rucoy): aparece um botão no canto para abrir o perfil
  tryOpenAt(sx, sy) { const g = this.ghostAt(sx, sy); if (!g) return false; this.select(g.id); return true; }
  select(peer) { this.sel = peer; this.selT = performance.now(); this.drawSel(true); }
  drawSel(force) {
    const ui = this.G.ui, el = ui.el.psel; if (!el) return;
    // convite de time / pedido de troca: aparece NESTE mesmo cantinho, com Aceitar e Recusar (some em 60 s)
    const rq = this.request();
    if (rq) {
      const h = `<i class="rqi">${rq.kind === 'team' ? '⚔' : '⇄'}</i><span class="rqt"><b>${esc(rq.n)}</b><small>${rq.kind === 'team' ? 'convidou você para o time' : 'quer trocar com você'}</small></span>`
        + `<button class="btn primary" data-a="so:rqacc" data-k="${rq.kind}" data-i="${rq.i}">Aceitar</button><button class="btn" data-a="so:rqdec" data-k="${rq.kind}" data-i="${rq.i}" title="Recusar">✕</button>`;
      if (force || h !== this._selH) { this._selH = h; el.innerHTML = h; el.classList.remove('hidden'); el.classList.add('req'); }
      return;
    }
    el.classList.remove('req');
    const P = this.G.player, g = this.sel && this.net?.peers.get(this.sel);
    const ok = g && !this.net.stale(g) && (g.pr.ar || 'world') === P?.area && Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) < 45;
    if (!ok) { if (this.sel || force || this._selH) { this.sel = null; el.classList.add('hidden'); el.innerHTML = ''; this._selH = ''; } return; }
    const pk = +g.pr.pk ? `<i class="skull pk${+g.pr.pk}">☠</i>` : '';
    const h = `${pk}<b>${this.net.isGm(g) ? '<i class="gm">GM</i> ' : ''}${esc(g.pr.n)}</b><small>Nv ${+g.pr.l || 1}</small><button class="btn primary" data-a="so:selcard">Perfil</button><button class="btn" data-a="so:selx" title="Fechar">✕</button>`;
    if (force || h !== this._selH) { this._selH = h; el.innerHTML = h; el.classList.remove('hidden'); }
  }

  // o pedido mais antigo ainda válido (convite de time ou de troca); os vencidos (60 s) somem sozinhos
  request() {
    const now = Date.now(), party = this.G.party, trade = this.G.trade;
    if (party?.invites?.length) party.invites = party.invites.filter((x) => now - x.t < 60000 && x.pt !== party.id);
    if (trade?.invites?.length) trade.invites = trade.invites.filter((x) => now - x.t < 60000);
    const list = [];
    (party?.invites || []).forEach((x, i) => list.push({ kind: 'team', i, n: x.n, t: x.t }));
    if (!trade?.s) (trade?.invites || []).forEach((x, i) => list.push({ kind: 'trade', i, n: x.n, t: x.t }));
    list.sort((a, b) => a.t - b.t);
    return list[0] || null;
  }

  openCard(peer) {
    const g = this.net?.peers.get(peer);
    if (!g) return;
    this.card = peer;
    this.send({ type: 's_insp', to: peer });
    this.G.ui.openModal('html', this.renderCard());
    this.G.ui.modal = 'pcard'; this.G.ui.el.modal.className = 'modal interactive team';
  }
  refreshCard() { if (this.G.ui.modal === 'pcard') this.G.ui.el.modal.innerHTML = this.renderCard(); }

  renderCard() {
    const g = this.net?.peers.get(this.card);
    if (!g) return `<div class="card teamcard pcard"><h2>Jogador saiu</h2><div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
    const pr = g.pr, cls = CLASSES[pr.c], inf = this.info.get(this.card);
    const party = this.G.party;
    const teamMates = pr.pt ? [...this.net.peers.values()].filter((x) => x.pr.pt === pr.pt).map((x) => x.pr.n) : [];
    if (pr.pt && party?.id === pr.pt) teamMates.push(this.G.state.player.name);
    const team = !pr.pt || teamMates.length < 2 ? 'Sem time' : party?.id === pr.pt ? `No seu time (${teamMates.length})` : `Time com ${teamMates.filter((n) => n !== pr.n).slice(0, 3).join(', ')}${teamMates.length > 4 ? '…' : ''} (${teamMates.length})`;
    const fr = !!this.findFriend(pr.id, pr.n);
    const sentInv = party?.sent?.has(this.card) && Date.now() - party.sent.get(this.card) < 60000;
    const ach = inf ? Object.entries(ACHIEVEMENTS).map(([id, a]) => `<span class="pach${inf.ach.includes(id) ? ' on' : ''}" title="${esc(a.desc)}">${esc(a.name)}</span>`).join('') : '<small class="muted">carregando…</small>';
    const shop = !inf ? '<small class="muted">carregando…</small>' : inf.shop.length
      ? inf.shop.map((s) => `<div class="pshop"><b style="color:${(RARITIES[RARITY_INDEX[s.r]] || RARITIES[0]).color}">${esc(s.name)}</b><span>${(+s.p || 0).toLocaleString('pt-BR')} ouro</span></div>`).join('')
      : '<small class="muted">Nada à venda agora.</small>';
    const nAch = inf ? inf.ach.length : 0;
    return `<div class="card teamcard pcard">
      <h2>${this.net?.isGm(g) ? '<i class="gm">GM</i> ' : ''}${esc(pr.n)}</h2>
      <div class="pgrid">
        <div><span>Classe</span><b>${esc(cls?.name || '?')}</b></div>
        <div><span>Nível</span><b>${+pr.l || 1}</b></div>
        <div><span>Time</span><b>${esc(team)}</b></div>
        <div><span>Onde</span><b>${AREA_NAME[pr.ar] || 'Vale'}</b></div>
      </div>
      <div class="tcols"><div class="tcol"><h3>Loja</h3>${shop}</div>
      <div class="tcol"><h3>Conquistas ${inf ? `(${nAch}/${Object.keys(ACHIEVEMENTS).length})` : ''}</h3><div class="pachs">${ach}</div></div></div>
      <div class="row pbtns">
        ${party && party.id && party.id === pr.pt ? '<span class="tsent">No seu time</span>' : sentInv ? '<span class="tsent">Convite enviado</span>' : `<button class="btn primary" data-a="so:team">Convidar p/ time</button>`}
        <button class="btn" data-a="so:${fr ? 'unfriend' : 'friend'}">${fr ? 'Remover amigo' : 'Adicionar amigo'}</button>
        <button class="btn" data-a="so:dm" data-n="${esc(pr.n)}">Mensagem</button>
        ${this.G.trade ? `<button class="btn" data-a="tr:inv" data-p="${esc(g.id)}" ${this.G.trade.near(g.id, 10) ? '' : 'disabled title="Chegue a até 10 m para trocar"'}>Trocar</button>` : ''}
        <button class="btn" data-a="m:close">Fechar</button>
      </div></div>`;
  }

  myCardInfo() {
    const s = this.G.state, ach = Object.entries(ACHIEVEMENTS).filter(([, a]) => { try { return a.check(s); } catch { return false; } }).map(([id]) => id);
    let shop = [];
    try { shop = (this.G.market?.mine?.() || []).filter((l) => l.status === 'open').slice(0, 8).map((l) => { let r = 'comum'; try { r = JSON.parse(l.item).rarity || r; } catch { /* ok */ } return { name: String(l.name || '').slice(0, 40), p: +l.price || 0, r }; }); } catch { /* ok */ }
    return { ach, shop };
  }

  // ---------- amigos ----------
  addFriend(peer) {
    const g = this.net?.peers.get(peer);
    if (!g || this.findFriend(g.pr.id, g.pr.n)) return;
    if (this.friends().length >= 100) return this.G.ui.toastSmall('Lista de amigos cheia (100).');
    this.friends().push({ id: g.pr.id || null, n: g.pr.n, c: g.pr.c, l: g.pr.l });
    this.online.set(g.pr.n, true);
    this.G.saver?.requestSave('amigo');
    this.G.ui.toastSmall(`${g.pr.n} agora é seu amigo. Você verá quando ficar online ou offline.`, 5);
    this.send({ type: 's_fadd', to: peer });
  }
  removeFriend(n) {
    const p = this.G.state.player;
    p.friends = this.friends().filter((f) => f.n !== n);
    this.online.delete(n);
    this.G.saver?.requestSave('amigo');
  }

  openFriends() {
    this.G.ui.openModal('html', '');
    this.G.ui.modal = 'friends'; this.G.ui.el.modal.className = 'modal interactive team';
    this.renderFriends();
  }
  renderFriends() {
    const list = this.friends().slice().sort((a, b) => (this.ghostOf(b) ? 1 : 0) - (this.ghostOf(a) ? 1 : 0) || a.n.localeCompare(b.n));
    const rows = list.map((f) => {
      const g = this.ghostOf(f), on = !!g;
      return `<div class="trow"><span class="fdot${on ? ' on' : ''}"></span><div class="tinfo"><b class="flink" data-a="so:dm" data-n="${esc(f.n)}" title="Mandar mensagem privada">${on && this.net?.isGm(g) ? '<i class="gm">GM</i> ' : ''}${esc(f.n)}</b><small>${esc(CLASSES[f.c]?.name || '')} · Nv ${+f.l || 1} · ${on ? 'online · ' + (AREA_NAME[g.pr.ar] || 'Vale') : 'offline'}</small></div>
        ${on ? `<button class="btn" data-a="so:card" data-p="${esc(g.id)}">Ver</button>` : ''}<button class="btn" data-a="so:dm" data-n="${esc(f.n)}">Mensagem</button><button class="btn" data-a="so:rm" data-n="${esc(f.n)}" title="Remover">✕</button></div>`;
    }).join('');
    const on = list.filter((f) => this.ghostOf(f)).length;
    this.G.ui.el.modal.innerHTML = `<div class="card teamcard"><h2>Amigos <small class="muted">${on} online de ${list.length}</small></h2>
      <p class="tdesc">Toque em um jogador no mapa e em <b>Adicionar amigo</b>. Toque no nome do amigo para mandar uma <b>mensagem privada</b>.</p>
      <div class="tcols one">${rows || '<p class="tdesc">Você ainda não tem amigos adicionados.</p>'}</div>
      <div class="row"><button class="btn" data-a="m:close">Fechar</button></div></div>`;
  }

  // ---------- mensagens privadas ----------
  openDm(n) {
    this.dmWith = n;
    this.G.ui.openModal('html', '');
    this.G.ui.modal = 'dm'; this.G.ui.el.modal.className = 'modal interactive team';
    this.renderDm();
  }
  renderDm() {
    const n = this.dmWith, log = this.dms.get(n) || [], on = !!this.peerByName(n);
    const m = this.G.ui.el.modal;
    m.innerHTML = `<div class="card teamcard dmcard"><h2>${esc(n)} <small class="muted">${on ? 'online' : 'offline'}</small></h2>
      <div class="dmlog">${log.map((x) => `<div class="dmm${x.me ? ' me' : ''}"><b>${x.me ? 'Você' : esc(n)}</b> ${esc(x.text)}</div>`).join('') || '<small class="muted">Nenhuma mensagem ainda.</small>'}</div>
      <form class="dmform"><input maxlength="140" placeholder="${on ? 'Escreva e aperte Enter…' : 'Só dá para mandar quando estiver online'}" ${on ? '' : 'disabled'} autocomplete="off"><button class="btn primary" ${on ? '' : 'disabled'}>Enviar</button></form>
      <div class="row"><button class="btn" data-a="so:friends">Amigos</button><button class="btn" data-a="m:close">Fechar</button></div></div>`;
    const lg = m.querySelector('.dmlog'); lg.scrollTop = 1e6;
    const f = m.querySelector('.dmform'), inp = f.querySelector('input');
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    f.addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value.trim(); if (v) this.sendDm(n, v); });
    if (on) setTimeout(() => inp.focus(), 30);
  }
  pushDm(n, me, text) {
    const a = this.dms.get(n) || []; a.push({ me, text, t: Date.now() }); if (a.length > 50) a.shift(); this.dms.set(n, a);
  }
  sendDm(n, text) {
    const t = String(text).trim().slice(0, 140);
    if (!t || !this.checkMessage(t)) { if (this.G.ui.modal === 'dm') this.renderDm(); return; }
    const g = this.peerByName(n);
    if (!g) return this.G.ui.toastSmall(`${n} está offline.`);
    this.send({ type: 's_dm', to: g.id, text: t });
    this.pushDm(n, true, t);
    if (this.G.ui.modal !== 'dm') this.G.ui.chatMessage({ name: `[PV para ${g.pr.n}]`, text: t, pv: true, me: true });
    if (this.G.ui.modal === 'dm' && this.dmWith === n) this.renderDm();
  }

  // Confere o texto antes de enviar (chat e privado). Palavras +18 = 30 min sem chat.
  checkMessage(text) {
    const left = chatBanLeft(this.G);
    if (left > 0) { this.G.ui.toastSmall(`Chat bloqueado por mais ${Math.ceil(left / 60000)} min (palavras +18).`, 5); return false; }
    if (isAdult(text)) {
      setChatBan(this.G, Date.now() + CHAT_BAN_MS);
      this.G.ui.chatMessage({ name: 'Sistema', text: 'Mensagem bloqueada: palavras +18 não são permitidas. Seu chat ficou bloqueado por 30 minutos.', system: true });
      this.G.ui.banner('Chat bloqueado por 30 min', 'Palavras +18 não são permitidas no jogo.', '#ff6b5e');
      return false;
    }
    return true;
  }

  // ---------- rede ----------
  onFx(m, d) {
    const me = this.net.selfPeer, name = String(d.n || 'Viajante').slice(0, 16);
    if (d.type === 's_ban' && m.peer === 'server') { // o servidor bloqueou o chat (+18)
      const until = Math.min(Date.now() + CHAT_BAN_MS, +d.until || 0);
      if (until > Date.now()) { setChatBan(this.G, until); this.G.ui.chatMessage({ name: 'Sistema', text: `Chat bloqueado por ${Math.ceil((until - Date.now()) / 60000)} min (palavras +18).`, system: true }); }
      return;
    }
    if (d.to && d.to !== me) return;
    if (d.type === 's_insp') { this.send({ type: 's_inspr', to: m.peer, ...this.myCardInfo() }); return; }
    if (d.type === 's_inspr') {
      const ach = Array.isArray(d.ach) ? d.ach.filter((x) => typeof x === 'string' && ACHIEVEMENTS[x]).slice(0, 40) : [];
      const shop = Array.isArray(d.shop) ? d.shop.slice(0, 8).map((s) => ({ name: String(s?.name || '').slice(0, 40), p: Math.max(0, +s?.p || 0), r: RARITY_INDEX[s?.r] !== undefined ? s.r : 'comum' })) : [];
      this.info.set(m.peer, { ach, shop });
      if (this.card === m.peer) this.refreshCard();
      return;
    }
    if (d.type === 's_fadd') { this.G.ui.toastSmall(`${name} adicionou você como amigo.`, 5); return; }
    if (d.type === 's_dm') {
      const text = String(d.text || '').slice(0, 140);
      if (!text || isAdult(text)) return; // não mostra +18
      this.pushDm(name, false, text);
      if (this.G.ui.modal === 'dm' && this.dmWith === name) this.renderDm();
      else { this.G.ui.chatMessage({ name: `[PV] ${name}`, text, pv: true }); this.G.audio.play('discover'); }
    }
  }

  click(a, el) {
    if (a === 'team') { this.G.party?.invite(this.card); this.refreshCard(); }
    else if (a === 'friend') { this.addFriend(this.card); this.refreshCard(); }
    else if (a === 'unfriend') { const g = this.net?.peers.get(this.card); if (g) this.removeFriend(this.findFriend(g.pr.id, g.pr.n)?.n || g.pr.n); this.refreshCard(); }
    else if (a === 'dm') this.openDm(el.dataset.n);
    else if (a === 'rm') { this.removeFriend(el.dataset.n); this.renderFriends(); }
    else if (a === 'card') this.openCard(el.dataset.p);
    else if (a === 'selcard') { if (this.sel) this.openCard(this.sel); }
    else if (a === 'selx') { this.sel = null; this.drawSel(true); }
    else if (a === 'rqacc' || a === 'rqdec') {
      const i = +el.dataset.i, acc = a === 'rqacc';
      if (el.dataset.k === 'team') { if (acc) this.G.party?.accept(i); else this.G.party?.decline(i); }
      else if (el.dataset.k === 'trade') { if (acc) this.G.trade?.accept(i); else this.G.trade?.decline(i); }
      this.drawSel(true);
    }
    else if (a === 'friends') this.openFriends();
  }
}
