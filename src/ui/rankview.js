// RANKING dentro do jogo (abre pelo botão do canto superior direito da tela inicial; seta ← volta).
// Rankings de nível, guerreiros, magos, arqueiros e PvP, busca de jogador (página com quem ele derrotou e quando)
// e mortes recentes no PvP. No servidor próprio os dados vêm de /api/site; dentro do Claude, do diretório "players".
import { SERVERS, serverName, ownServer } from '../game/servers.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CLS = { guerreiro: ['Guerreiro', '⚔️'], mago: ['Mago', '🔮'], arqueiro: ['Arqueiro', '🏹'] };
const TABS = [['nivel', 'Nível'], ['guerreiro', 'Guerreiros'], ['mago', 'Magos'], ['arqueiro', 'Arqueiros'], ['pvp', 'PvP'], ['mortes', 'Mortes']];
const TITLES = { nivel: 'Maiores níveis', guerreiro: 'Melhores guerreiros', mago: 'Melhores magos', arqueiro: 'Melhores arqueiros', pvp: 'Mais abates no PvP' };
const RANKS = {
  nivel: { f: () => true, k: (x) => x.l || 0 },
  guerreiro: { f: (x) => x.c === 'guerreiro', k: (x) => x.l || 0 },
  mago: { f: (x) => x.c === 'mago', k: (x) => x.l || 0 },
  arqueiro: { f: (x) => x.c === 'arqueiro', k: (x) => x.l || 0 },
  pvp: { f: (x) => (x.pvp || 0) > 0, k: (x) => x.pvp || 0 },
};
const sortBy = (R) => (a, b) => R.k(b) - R.k(a) || (a.t || 0) - (b.t || 0);
const dt = (t) => { if (!t) return '—'; const d = new Date(t); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 90) return 'agora'; if (s < 3600) return Math.round(s / 60) + ' min atrás'; if (s < 86400) return Math.round(s / 3600) + ' h atrás'; return Math.round(s / 86400) + ' dias atrás'; };
const timeout = (p, ms = 9000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('tempo esgotado')), ms))]);

// ---------- de onde vêm os dados ----------
class RankData {
  constructor(G) { this.G = G; this.cache = null; }
  get mode() { return ownServer() ? 'server' : this.G.economy?.online() ? 'cloud' : null; }
  async api(path) {
    const r = await timeout(fetch('/api/site/' + path, { cache: 'no-store' }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
    return j;
  }
  async all() { // dentro do Claude: lê o diretório e monta tudo aqui
    if (this.cache && Date.now() - this.cache.t < 20000) return this.cache.list;
    const C = this.G.economy.C;
    const snap = await timeout(C.db.collection('players').orderBy('t', 'desc').limit(500).get());
    const me = this.G.state?.player?.name;
    const list = snap.docs.map((d) => d.data()).filter((x) => x && x.n).map((x) => ({ ...x, on: x.n === me && this.G.mode === 'play' ? (this.G.net?.server || 1) : 0 }));
    this.cache = { t: Date.now(), list };
    return list;
  }
  pick(list, sv) { return list.filter((x) => !sv || (x.sv || 1) === sv); }
  async rank(by, sv) {
    if (this.mode === 'server') return (await this.api(`rank?by=${by}&n=100${sv ? '&sv=' + sv : ''}`)).list;
    const R = RANKS[by] || RANKS.nivel;
    return this.pick(await this.all(), sv).filter(R.f).sort(sortBy(R)).slice(0, 100);
  }
  async search(q, sv) {
    if (this.mode === 'server') return (await this.api(`search?q=${encodeURIComponent(q)}${sv ? '&sv=' + sv : ''}`)).list;
    const k = fold(q);
    return this.pick(await this.all(), sv).filter((x) => fold(x.n).includes(k)).sort((a, b) => (b.l || 0) - (a.l || 0)).slice(0, 20);
  }
  async player(n) {
    if (this.mode === 'server') return (await this.api('player?n=' + encodeURIComponent(n))).player;
    const all = await this.all(), x = all.find((d) => fold(d.n) === fold(n));
    if (!x) throw new Error('Jogador não encontrado.');
    const pos = (by) => { const R = RANKS[by]; return R && R.f(x) ? all.filter(R.f).sort(sortBy(R)).indexOf(x) + 1 : 0; };
    return { ...x, l: x.l || 1, pvp: x.pvp || 0, deaths: x.deaths || 0, sv: x.sv || 1, kills: (x.pk || []).slice().sort((a, b) => b.t - a.t), rank: { nivel: pos('nivel'), classe: x.c ? pos(x.c) : 0, pvp: pos('pvp') } };
  }
  async kills(sv) {
    if (this.mode === 'server') return (await this.api(`kills?n=60${sv ? '&sv=' + sv : ''}`)).list;
    const out = [];
    for (const x of this.pick(await this.all(), sv)) for (const k of x.pk || []) out.push({ by: x.n, byL: x.l || 1, n: k.n, t: k.t, sv: x.sv || 1 });
    return out.sort((a, b) => b.t - a.t).slice(0, 60);
  }
}

// ---------- a tela ----------
export class RankView {
  constructor(G) {
    this.G = G; this.data = new RankData(G); this.el = null;
    this.sv = 0; this.tab = 'nivel'; this.stack = []; // pilha de telas (a seta ← volta uma)
  }
  get isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'rankview';
    el.innerHTML = `<div class="rv-top">
        <button class="rv-back" data-rv="back" aria-label="Voltar">←</button>
        <div class="rv-title">🏆 Ranking</div>
        <form class="rv-search" data-rv="form" autocomplete="off"><input placeholder="Procurar jogador…" maxlength="20" aria-label="Nome do jogador"><button aria-label="Buscar">🔍</button></form>
      </div>
      <div class="rv-bar"><nav class="rv-tabs"></nav><div class="rv-svs"></div></div>
      <div class="rv-body"></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.onClick(e));
    el.querySelector('[data-rv=form]').addEventListener('submit', (e) => { e.preventDefault(); const q = el.querySelector('.rv-search input').value.trim(); if (q) this.go({ v: 'busca', q }); });
    this.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.back(); } };
    window.addEventListener('keydown', this.onKey, true);
    this.stack = [];
    this.go({ v: 'rank', by: this.tab }, true);
  }
  close() {
    if (!this.el) return;
    window.removeEventListener('keydown', this.onKey, true);
    this.el.remove(); this.el = null; this.stack = [];
  }
  back() { if (this.stack.length > 1) { this.stack.pop(); this.show(this.stack[this.stack.length - 1]); } else this.close(); }
  go(view, reset = false) { if (reset) this.stack = []; this.stack.push(view); this.show(view); }

  onClick(e) {
    const t = e.target.closest('[data-rv]');
    if (!t) return;
    const a = t.dataset.rv;
    if (a === 'back') this.back();
    else if (a === 'tab') { this.tab = t.dataset.k; this.go(t.dataset.k === 'mortes' ? { v: 'mortes' } : { v: 'rank', by: t.dataset.k }, true); }
    else if (a === 'sv') { this.sv = +t.dataset.sv || 0; this.show(this.stack[this.stack.length - 1]); }
    else if (a === 'player') this.go({ v: 'player', n: t.dataset.n });
  }

  chrome(view) {
    const cur = view.v === 'mortes' ? 'mortes' : view.v === 'rank' ? view.by : '';
    this.el.querySelector('.rv-tabs').innerHTML = TABS.map(([k, n]) => `<button class="rv-tab${k === cur ? ' on' : ''}" data-rv="tab" data-k="${k}">${n}</button>`).join('');
    this.el.querySelector('.rv-svs').innerHTML = [{ id: 0, name: 'Todos' }, ...SERVERS].map((s) => `<button class="rv-sv${s.id === this.sv ? ' on' : ''}" data-rv="sv" data-sv="${s.id}">${esc(s.name)}</button>`).join('');
    this.el.querySelector('.rv-back').title = this.stack.length > 1 ? 'Voltar' : 'Fechar o ranking';
  }
  who(x) { return `<button class="rv-name" data-rv="player" data-n="${esc(x.n)}">${x.on ? '<i class="rv-on" title="Online agora"></i>' : ''}${esc(x.n)}</button>`; }
  cls(c) { return c && CLS[c] ? `<span class="rv-cls ${c}">${CLS[c][1]} ${CLS[c][0]}</span>` : ''; }

  async show(view) {
    if (!this.el) return;
    this.chrome(view);
    const body = this.el.querySelector('.rv-body'), token = (this._tok = (this._tok || 0) + 1);
    body.scrollTop = 0;
    if (!this.data.mode) { body.innerHTML = `<div class="rv-empty">O ranking aparece quando você joga conectado (entrando na sua conta).</div>`; return; }
    body.innerHTML = '<div class="rv-empty">Carregando…</div>';
    let html = '';
    try {
      if (view.v === 'rank') {
        const list = await this.data.rank(view.by, this.sv), pvp = view.by === 'pvp';
        html = `<h3 class="rv-h">${TITLES[view.by]}${this.sv ? ' · ' + esc(serverName(this.sv)) : ''}</h3>` + (list.length
          ? `<div class="rv-list">${list.map((x, i) => `<div class="rv-row"><span class="rv-pos p${i + 1}">${i + 1}º</span>${this.who(x)}${this.cls(x.c)}<span class="rv-sv-n">${esc(serverName(x.sv || 1))}</span><b class="rv-val">${pvp ? `${x.pvp} <small>abates</small>` : `<small>Nv</small> ${x.l}`}</b></div>`).join('')}</div>`
          : `<div class="rv-empty">${pvp ? 'Ninguém derrotou outro jogador ainda.' : 'Ninguém aqui ainda. Seja o primeiro!'}</div>`);
      } else if (view.v === 'mortes') {
        const list = await this.data.kills(this.sv);
        html = `<h3 class="rv-h">Mortes recentes no PvP</h3>` + (list.length
          ? `<div class="rv-list">${list.map((k) => `<div class="rv-row rv-kill">${this.who({ n: k.by })}<span class="rv-x">derrotou</span>${this.who({ n: k.n })}<span class="rv-when">${dt(k.t)} · ${esc(serverName(k.sv || 1))}</span></div>`).join('')}</div>`
          : '<div class="rv-empty">Nenhuma morte no PvP ainda.</div>');
      } else if (view.v === 'busca') {
        const list = await this.data.search(view.q, this.sv);
        html = `<h3 class="rv-h">Busca: “${esc(view.q)}”</h3>` + (list.length
          ? `<div class="rv-list">${list.map((x) => `<div class="rv-row">${this.who(x)}${this.cls(x.c)}<span class="rv-sv-n">${esc(serverName(x.sv || 1))}</span><b class="rv-val"><small>Nv</small> ${x.l}</b></div>`).join('')}</div>`
          : '<div class="rv-empty">Nenhum jogador com esse nome.</div>');
      } else if (view.v === 'player') {
        const x = await this.data.player(view.n), c = CLS[x.c] || ['Herói', '🛡️'], rk = (v) => (v ? v + 'º' : '—');
        html = `<div class="rv-prof"><div class="rv-av">${c[1]}</div><div><h3>${esc(x.n)}</h3>
            <div class="rv-meta">${this.cls(x.c)}<span>Nível <b>${x.l}</b></span><span>${esc(serverName(x.sv || 1))}</span>
            <span>${x.on ? '<i class="rv-on"></i><b class="rv-good">Online agora</b>' : 'Visto ' + ago(x.t)}</span></div></div></div>
          <div class="rv-boxes">
            <div><small>Ranking de nível</small><b>${rk(x.rank.nivel)}</b></div>
            <div><small>Ranking de ${c[0].toLowerCase()}s</small><b>${rk(x.rank.classe)}</b></div>
            <div><small>Abates no PvP</small><b>${x.pvp}</b></div>
            <div><small>Mortes no PvP</small><b>${x.deaths}</b></div>
            <div><small>Ranking PvP</small><b>${rk(x.rank.pvp)}</b></div>
          </div>
          <h3 class="rv-h">Jogadores derrotados</h3>` + (x.kills.length
          ? `<div class="rv-list">${x.kills.map((k) => `<div class="rv-row rv-kill"><span class="rv-x">Derrotou</span>${this.who({ n: k.n })}<span class="rv-when">${dt(k.t)}</span></div>`).join('')}</div>`
          : '<div class="rv-empty">Ainda não derrotou nenhum jogador.</div>');
      }
    } catch (e) { html = `<div class="rv-empty">${esc(e.message || 'Não deu para carregar agora.')}</div>`; }
    if (this.el && token === this._tok) body.innerHTML = html;
  }
}
