// Telas da economia: troca segura, banco e loja de diamantes.
import { ICONS } from './icons.js';
import { esc } from './ui.js';
import { slotHtml, pagedGrid, gridFit } from './panels.js';
import { displayName, rarityOf, stackDef, sanitizeEntry } from '../core/items.js';
import { COSMETIC_SETS } from '../game/cosmetics.js';
import { skinThumb } from './panels.js';
import { DIAMONDS } from '../config/monetization.js';
import { skinName } from '../config/heroskins.js';
import { TRADE } from '../game/trade.js';
import { rng } from '../core/rng.js';
import { VAULT, vaultSizeFor, DAILY, dailyGold } from '../config/economia.js';

const gold = (n) => `${ICONS.moeda}${Math.floor(n).toLocaleString('pt-BR')}`;
const dia = (n) => `<span class="dia">💎${Math.floor(n).toLocaleString('pt-BR')}</span>`;

// ---------- troca ----------
function itemLine(it) {
  if (!it) return '';
  const col = it.kind === 'equip' ? rarityOf(it).color : (stackDef(it)?.color || '#e8e0cc');
  return `<b style="color:${col}">${esc(displayName(it))}${it.qty > 1 ? ` x${it.qty}` : ''}</b>`;
}

export function renderTrade(ui, T) {
  const G = ui.G, s = T.s, sp = G.state.player;
  const theirs = s.theirs.items.map((j) => sanitizeEntry(j, rng));
  const mySlots = Array.from({ length: TRADE.maxItems }, (_, i) => (s.mine.refs[i] ? slotHtml(s.mine.refs[i], s.phase === 'offer' ? `data-a="tr:rem" data-i="${i}" title="Tirar da oferta"` : '', '', G) : '<div class="islot empty"></div>')).join('');
  const thSlots = Array.from({ length: TRADE.maxItems }, (_, i) => (theirs[i] ? slotHtml(theirs[i], '', '', G) : '<div class="islot empty"></div>')).join('');
  const st = (ready, conf) => (conf ? '<em class="ok">Confirmou</em>' : ready ? '<em class="ok">Pronto</em>' : '<em>Montando a oferta…</em>');
  let body;
  if (s.phase === 'done') {
    body = `<div class="trdone"><h3>Troca concluída!</h3><p>Você recebeu ${theirs.map(itemLine).join(', ') || 'nenhum item'}${s.theirs.gold ? ` e ${gold(s.theirs.gold)}` : ''}.</p>
      <div class="row"><button class="btn primary" data-a="tr:close">Fechar</button></div></div>`;
  } else if (s.phase === 'confirm') {
    const give = s.mine.refs.map(itemLine).join(', ') || '<i>nenhum item</i>';
    const get = theirs.map(itemLine).join(', ') || '<i>nenhum item</i>';
    const warn = !theirs.length && !s.theirs.gold ? '<p class="trwarn">Atenção: você não vai receber nada nesta troca.</p>' : '';
    body = `<div class="trconf"><p class="tdesc">Confira com calma. A troca só acontece quando <b>os dois</b> confirmarem <b>exatamente</b> isto:</p>
      <div class="trsum"><div><h3>Você dá</h3><p>${give}</p><p>${gold(s.mine.gold)}</p></div><div><h3>Você recebe de ${esc(s.name)}</h3><p>${get}</p><p>${gold(s.theirs.gold)}</p></div></div>${warn}
      <div class="trstat">Você: ${st(true, s.myConf)} · ${esc(s.name)}: ${st(true, s.theirConf)}</div>
      <div class="row">${s.myConf ? '<button class="btn" disabled>Aguardando o outro jogador…</button>' : '<button class="btn primary" data-a="tr:confirm">Confirmar troca</button><button class="btn" data-a="tr:back">Mudar a oferta</button>'}<button class="btn" data-a="tr:cancel">Cancelar</button></div></div>`;
  } else {
    const bag = G.inv.slots.map((it, i) => (it ? slotHtml(it, `data-a="tr:add" data-i="${i}"`, '', G).replace('class="islot', `class="islot${s.mine.refs.includes(it) ? ' sel' : ''}`) : '<div class="islot empty"></div>')).join('');
    body = `<div class="trcols">
      <div class="trside"><h3>Sua oferta ${st(s.myReady, false)}</h3><div class="invgrid tr">${mySlots}</div>
        <div class="trgold"><span>${ICONS.moeda}</span><input id="trgold" type="number" min="0" max="${sp.gold}" value="${s.mine.gold}" inputmode="numeric"><button class="btn sm" data-a="tr:gold">Ok</button><button class="btn sm" data-a="tr:goldall">Tudo</button><small>na bolsa: ${sp.gold.toLocaleString('pt-BR')}</small></div></div>
      <div class="trside"><h3>Oferta de ${esc(s.name)} ${st(s.theirReady, false)}</h3><div class="invgrid tr">${thSlots}</div><div class="trgold"><span>${ICONS.moeda}</span><b>${s.theirs.gold.toLocaleString('pt-BR')}</b>${s.theirSeq < 0 ? '<small>aguardando…</small>' : ''}</div></div>
      <div class="trbag"><h3>Sua bolsa <small>toque para oferecer</small></h3><div class="invgrid trbag">${bag}</div></div></div>
      <div class="row trbtns"><button class="btn primary" data-a="tr:ready" ${s.myReady ? 'disabled' : ''}>${s.myReady ? 'Pronto ✓' : 'Pronto'}</button><button class="btn" data-a="tr:cancel">Cancelar</button>
      <small>Qualquer mudança desmarca o "Pronto" dos dois. Depois vem uma tela de conferência.</small></div>`;
  }
  return `<div class="card trcard"><h2>${ICONS.bolsa} Troca com ${esc(s.name)}</h2>${body}</div>`;
}

// ---------- banco ----------
// Cofre de itens do banco (por personagem): começa com 40 espaços; +10 por compra com diamantes (da conta), até 80.
// Nunca encolhe (quem aumentou com ouro nas versões antigas mantém o tamanho).
export { VAULT };
export function vaultOf(sp, bought = 0) {
  if (!Array.isArray(sp.vault)) sp.vault = new Array(VAULT.start).fill(null);
  const want = vaultSizeFor(sp.vaultBase || VAULT.start, bought);
  while (sp.vault.length < want) sp.vault.push(null);
  return sp.vault;
}

export function bankView(ui) {
  const G = ui.G, E = G.economy, sp = G.state.player, b = (ui.bk ||= { v: '', q: '', res: null, to: null, tv: '', conf: false, msg: '' });
  const online = E.online();
  const tab = ui.bkTab || 'cofre';
  const tabs = [['cofre', 'Cofre de itens'], ['banco', 'Banco (ouro)'], ['enviar', 'Transferir']].map(([id, n]) => `<button class="btn sm ${tab === id ? 'primary' : ''}" data-a="ec:bktab" data-t="${id}">${n}</button>`).join('');
  let body = '';
  if (tab === 'cofre') {
    const nb = E.vaultBuys(), V = vaultOf(sp, nb), used = V.filter(Boolean).length, per = gridFit([4, 4, 5], [3, 4, 5]);
    const vg = pagedGrid(ui, 'vault', V.map((it, i) => (it ? slotHtml(it, `data-a="ec:vout" data-i="${i}"`, '', G) : '<div class="islot empty"></div>')), 'ec:', per);
    const pager = '';
    const bg = pagedGrid(ui, 'vbag', G.inv.slots.map((it, i) => (it ? slotHtml(it, `data-a="ec:vin" data-i="${i}"`, '', G) : '<div class="islot empty"></div>')), 'ec:', per);
    const can = nb < VAULT.buys && vaultSizeFor(sp.vaultBase, nb + 1) > V.length, cost = VAULT.price(nb);
    body = `<div class="vault">
      <div class="vcol"><h4>Cofre <small>${used}/${V.length} · toque para tirar</small></h4>${vg}${pager}
        ${can ? `<button class="btn sm" data-a="ec:vup" ${E.srv() && E.diamondsReady && E.diamonds() >= cost ? '' : 'disabled'} title="Compra da conta: vale para todos os seus personagens">Cofre +${VAULT.step} · ${dia(cost)}</button>` : '<small class="muted">Cofre no tamanho máximo.</small>'}</div>
      <div class="vcol"><h4>Bolsa <small>toque para guardar</small></h4>${bg}<small class="muted">Itens do cofre ficam seguros: não caem quando você morre.</small></div>
    </div>`;
  } else if (tab === 'banco') {
    const log = E.bankLog.slice(-5).reverse().map((l) => {
      const k = { dep: 'Depósito', saq: 'Saque', env: `Enviado para ${l.w}`, rec: `Recebido de ${l.w}` }[l.k] || l.k;
      return `<li><span>${esc(k)}</span><b class="${l.k === 'saq' || l.k === 'env' ? 'neg' : 'pos'}">${l.k === 'saq' || l.k === 'env' ? '−' : '+'}${l.g.toLocaleString('pt-BR')}</b></li>`;
    }).join('');
    body = `<div class="bank">
      <div class="bcol">
        <div class="bbal"><div><small>Na bolsa</small><b>${gold(sp.gold)}</b></div><div><small>No banco</small><b>${E.bankReady ? gold(E.bank) : '…'}</b></div></div>
        <div class="bop"><h4>Guardar ou retirar</h4>
          <div class="brow"><input id="bkv" type="number" min="1" placeholder="Valor" value="${esc(b.v)}" inputmode="numeric"></div>
          <div class="brow quick">${[100, 1000, 10000, 100000].map((n) => `<button class="btn sm" data-a="ec:bkadd" data-n="${n}">+${n >= 1000 ? n / 1000 + 'k' : n}</button>`).join('')}<button class="btn sm" data-a="ec:bkpct" data-p="100">Tudo</button><button class="btn sm" data-a="ec:bkclr">Limpar</button></div>
          <div class="brow"><button class="btn primary" data-a="ec:bkdep">Depositar</button><button class="btn" data-a="ec:bkwd">Sacar</button></div>
          <small>O ouro no banco não se perde e vale para todos os seus personagens${online ? '' : ' (neste aparelho)'}.</small></div>
      </div>
      <div class="bcol">${log ? `<div class="bop"><h4>Últimas movimentações</h4><ul class="blog">${log}</ul></div>` : '<div class="bop"><h4>Movimentações</h4><small>Nada por aqui ainda.</small></div>'}</div>
    </div>`;
  } else {
    const res = b.res ? (b.res.length ? b.res.map((p, i) => `<button class="btn sm ${b.to?.id === p.id ? 'primary' : ''}" data-a="ec:bkto" data-i="${i}">${esc(p.n)} <small>Nv ${+p.l || 1} · ${esc(p.code || '')}</small></button>`).join('') : '<small class="muted">Ninguém encontrado.</small>') : '';
    body = online
      ? `<div class="bop"><h4>Transferir ouro do banco para outro jogador</h4>
          <div class="brow"><input id="bkq" placeholder="Nome ou código do jogador" value="${esc(b.q)}"><button class="btn sm" data-a="ec:bksearch">Buscar</button></div>
          <div class="bres">${res}</div>
          ${b.to ? `<div class="brow"><input id="bktv" type="number" min="1" placeholder="Quanto" value="${esc(b.tv)}" inputmode="numeric">${b.conf
            ? `<button class="btn primary" data-a="ec:bksend">Confirmar: enviar ${(+b.tv || 0).toLocaleString('pt-BR')} para ${esc(b.to.n)}</button><button class="btn sm" data-a="ec:bkno">Não</button>`
            : `<button class="btn primary" data-a="ec:bkpre">Enviar para ${esc(b.to.n)}</button>`}</div>` : ''}
          <small>Sai do seu banco e cai no banco da pessoa, mesmo se ela estiver offline.</small></div>`
      : '<div class="bop"><h4>Transferir</h4><small>Transferências funcionam na página publicada do jogo, com a conta conectada.</small></div>';
  }
  return `<div class="mhead bankhead"><h3>${ICONS.moeda} Banco de Eldoria</h3><div class="mtabs">${tabs}</div><span class="bgold">${gold(sp.gold)}</span></div>${b.msg ? `<p class="mmsg">${esc(b.msg)}</p>` : ''}
    ${body}
    <div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
}

// ---------- baú diário (Banqueira Odete): 7 dias seguidos, o servidor confere o dia ----------
export function dailyView(ui) {
  const G = ui.G, E = G.economy, d = E.daily || {}, sp = G.state.player;
  const hh = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  if (d.off) return `<p class="say">O baú diário funciona no servidor do jogo, com a sua conta conectada.</p><div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  const cur = d.dia || 1;
  const tiles = DAILY.days.map((x, i) => {
    const n = i + 1, st = !d.pode ? (n <= cur ? 'feito' : '') : n < cur ? 'feito' : n === cur ? 'hoje' : '';
    return `<div class="bauday ${st}"><b>Dia ${n}</b><span>${ICONS.moeda}${dailyGold(n, sp.level).toLocaleString('pt-BR')}</span><small>${x.pocao} poções${x.tonico ? ` · ${x.tonico} tôn.` : ''}</small>${x.item ? `<em>${Math.round(x.item * 100)}% item</em>` : ''}</div>`;
  }).join('');
  const btn = d.erro ? '<small class="muted">Sem conexão com o servidor agora.</small>'
    : d.pode ? `<button class="btn primary" data-a="d:bauopen">Abrir o baú do dia ${cur}</button>`
      : `<button class="btn" disabled>Volte em ${hh((d.faltaMs || 0) - (Date.now() - (d.t || Date.now())))}</button>`;
  return `<h3>🎁 Baú diário</h3><p class="muted">Abra 1 vez por dia (horário de Brasília). Dias seguidos dão prêmios melhores até o dia 7; depois recomeça. Faltou um dia, volta ao dia 1. Item do baú fica preso ao personagem.</p>
    <div class="baudays">${tiles}</div>${ui.bauMsg ? `<p class="mmsg">${esc(ui.bauMsg)}</p>` : ''}
    <div class="row">${btn}<button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
}

// ---------- loja de diamantes ----------
export function premiumList() {
  const out = [];
  for (const [kind, set] of Object.entries(COSMETIC_SETS)) for (const [id, d] of Object.entries(set)) if (d.unlock.type === 'premium') out.push({ kind, id, d, sku: d.unlock.sku, price: DIAMONDS.prices[d.unlock.sku] || 0 });
  return out;
}
// só o que serve para o personagem (roupas que existem para o gênero dele)
function premiumFor(C) {
  const out = [];
  for (const x of premiumList()) if (!x.d.hero || C.fits(x.d)) out.push(x);
  return out;
}

export function renderDiamonds(ui) {
  const G = ui.G, E = G.economy, C = G.cosmetics, st = (ui.ds ||= { view: 'shop', q: '', res: null, to: null, n: '', msg: '' });
  const online = E.online();
  const bal = online && E.diamondsReady ? dia(E.diamonds()) : online ? '…' : '—';
  const head = `<h2>💎 Diamantes <span class="dbal">Saldo: ${bal}</span><span class="dsp"></span>${E.owner && st.view !== 'owner' ? '<button class="btn sm" data-a="ec:dsview" data-v="owner">Painel do dono</button>' : ''}${st.view !== 'owner' ? '<button class="btn sm" data-a="m:close">Fechar</button>' : ''}</h2>${st.msg ? `<p class="mmsg">${esc(st.msg)}</p>` : ''}`;
  if (st.view === 'owner' && E.owner) {
    const res = st.res ? (st.res.length ? st.res.map((p, i) => `<button class="btn sm ${st.to?.id === p.id ? 'primary' : ''}" data-a="ec:dsto" data-i="${i}">${esc(p.n)} <small>Nv ${+p.l || 1} · ${esc(p.code || '')}</small></button>`).join('') : '<small class="muted">Ninguém encontrado.</small>') : '';
    return `<div class="card dshop">${head}<h3>Painel do dono</h3>
      <p class="tdesc">Depois de conferir um pagamento, ache o jogador pelo nome ou pelo código que ele mandou e credite os diamantes. Só a sua conta (dona do jogo) consegue fazer isso.</p>
      <div class="brow"><input id="dsq" placeholder="Nome ou código (ex.: ABCD-1234)" value="${esc(st.q)}"><button class="btn sm" data-a="ec:dssearch">Buscar</button><button class="btn sm" data-a="ec:dsme">Eu mesmo</button></div>
      <div class="bres">${res}</div>
      ${st.to ? `<div class="brow"><input id="dsn" type="number" min="1" placeholder="Diamantes" value="${esc(st.n)}" inputmode="numeric">${DIAMONDS.packs.map((p) => `<button class="btn sm" data-a="ec:dsset" data-n="${p.qty}">${p.qty}</button>`).join('')}<button class="btn primary" data-a="ec:dsgrant">Creditar para ${esc(st.to.n)}</button></div>` : ''}
      <div class="row"><button class="btn" data-a="ec:dsview" data-v="shop">Voltar à loja</button><button class="btn" data-a="m:close">Fechar</button></div></div>`;
  }
  const pay = DIAMONDS.payment;
  const packs = DIAMONDS.packs.map((p) => `<div class="dpack"><b>💎 ${p.qty.toLocaleString('pt-BR')}</b>${p.tag ? `<em>${esc(p.tag)}</em>` : ''}<span>${esc(p.price)}</span>
    <button class="btn sm ${pay === 'off' ? '' : 'primary'}" data-a="ec:dsbuy" data-p="${esc(p.id)}">${pay === 'off' ? 'Em breve' : 'Comprar'}</button></div>`).join('');
  const g = C.gender(), tab = st.tab || 'skin';
  const items = premiumFor(C).filter((x) => (tab === 'skin') === (x.kind === 'skin')).map((x) => {
    const own = C.isUnlocked(x.d), on = C.equipped(x.kind) === x.id, base = !own && C.needsBase?.(x.d);
    const act = on ? '<span class="eqd">Em uso</span>' : own ? `<button class="btn sm" data-a="ec:dsuse" data-k="${x.kind}" data-id="${x.id}">Usar</button>`
      : `<button class="btn sm primary" data-a="ec:dsget" data-sku="${x.sku}" ${online && E.diamondsReady && E.diamonds() >= x.price && !base ? '' : 'disabled'}>💎${x.price}</button>`;
    const kind = { skin: 'Roupa', fx: 'Efeito' }[x.kind];
    const nm = (g === 'F' && x.d.nameF) || x.d.name;
    if (x.d.hero) return `<div class="ditem ${own ? 'own' : ''}" title="${esc(x.d.desc)}">${skinThumb(x.id, g)}<div><b>${esc(nm)}</b>${base ? `<small>Precisa: ${esc(skinName(x.d.requires, g))}</small>` : ''}${act}</div></div>`;
    return `<div class="ditem ${own ? 'own' : ''}"><div><b>${esc(nm)}</b><small>${kind} · ${esc(x.d.desc)}</small></div>${act}</div>`;
  }).join('');
  const tp = (DIAMONDS.scrolls || []).map((x) => `<button class="btn sm" data-a="ec:dstp" data-sku="${x.sku}" ${online && E.diamondsReady && E.diamonds() >= DIAMONDS.prices[x.sku] ? '' : 'disabled'}>📜${x.qty} · 💎${DIAMONDS.prices[x.sku]}</button>`).join('');
  const note = pay === 'off'
    ? 'A compra com dinheiro real ainda não foi ligada pelo dono do jogo.'
    : pay === 'link' ? esc(DIAMONDS.paymentNote) : 'Compra pela loja do aplicativo.';
  return `<div class="card dshop">${head}
    <p class="tdesc">Diamantes <b>só são comprados com dinheiro real</b> e servem para <b>visuais</b> e para o <b>Pergaminho de Teleporte</b> (só conveniência) — não dão força nem vantagem. Não caem de monstros e não podem ser trocados, vendidos nem transferidos. Seu código de jogador: <b class="code">${esc(E.code())}</b></p>
    <div class="dcols"><div><h3>Pacotes</h3><div class="dpacks">${packs}</div><small class="muted dnote">${note}</small>
        <h3>Pergaminho de Teleporte <small class="muted">· você tem 📜 ${G.inv.count('pergaminho_tp')}</small></h3><div class="dtp">${tp}</div></div>
      <div><div class="dtabs"><button class="btn sm ${tab === 'skin' ? 'primary' : ''}" data-a="ec:dstab" data-t="skin">Roupas</button><button class="btn sm ${tab === 'fx' ? 'primary' : ''}" data-a="ec:dstab" data-t="fx">Efeitos da arma</button></div>
        <div class="ditems ${tab === 'skin' ? 'sk' : ''}">${items}</div></div></div></div>`;
}

export function openDiamonds(ui) {
  ui.ds = ui.ds || { view: 'shop', q: '', res: null, to: null, n: '', msg: '' };
  ui.ds.msg = '';
  ui.openModal('html', renderDiamonds(ui));
  ui.modal = 'diamonds';
  ui.el.modal.className = 'modal interactive diamonds';
  if (ui.G.economy.online()) ui.G.economy.loadDiamonds().then(() => refreshDiamonds(ui)); // sempre recarrega: o saldo pode ter mudado (crédito do dono)
}
function refreshDiamonds(ui) { if (ui.modal === 'diamonds') ui.el.modal.innerHTML = renderDiamonds(ui); }

// ---------- cliques ----------
export function ecoClick(ui, a, el) {
  const G = ui.G, E = G.economy, sp = G.state.player;
  const b = (ui.bk ||= { v: '', q: '', res: null, to: null, tv: '', conf: false, msg: '' });
  const val = (id) => ui.root.querySelector('#' + id)?.value ?? '';
  const redraw = () => ui.refreshDialog?.();
  const done = (r, okMsg) => { b.msg = r.ok ? okMsg : r.reason || 'Não foi possível.'; if (r.ok) G.audio.play('loot', { rarity: 1 }); ui.refreshHud?.(); redraw(); };
  switch (a) {
    case 'bktab': ui.bkTab = el.dataset.t; b.msg = ''; redraw(); break;
    case 'vpg': ui.vPage = +el.dataset.p; redraw(); break;
    case 'pg': ui.pg = ui.pg || {}; ui.pg[el.dataset.k] = +el.dataset.p; redraw(); break;
    case 'bkadd': b.v = String((+val('bkv') || 0) + (+el.dataset.n || 0)); redraw(); break;
    case 'bkclr': b.v = ''; redraw(); break;
    case 'vin': { // bolsa → cofre
      const i = +el.dataset.i, it = G.inv.slots[i]; if (!it) break;
      const V = vaultOf(sp);
      if (it.kind !== 'equip') { const same = V.find((x) => x && x.kind === it.kind && x.id === it.id); if (same) { same.qty = (same.qty || 1) + (it.qty || 1); G.inv.slots[i] = null; G.inv.compact(); G.saver.requestSave('cofre'); redraw(); break; } }
      const j = V.findIndex((x) => !x); if (j < 0) { b.msg = 'Cofre cheio. Aumente o cofre ou tire algo.'; redraw(); break; }
      V[j] = it; G.inv.slots[i] = null; G.inv.compact(); G.audio.play('click'); G.player.recompute?.(); G.questEvent({ type: 'inventory' }); G.saver.requestSave('cofre'); redraw(); break;
    }
    case 'vout': { // cofre → bolsa
      const i = +el.dataset.i, V = vaultOf(sp), it = V[i]; if (!it) break;
      const left = G.inv.add(it);
      if (it.kind === 'equip' ? left : left === (it.qty || 1)) { b.msg = 'Bolsa cheia!'; redraw(); break; }
      if (it.kind !== 'equip' && left > 0) it.qty = left; else V[i] = null;
      G.audio.play('click'); G.questEvent({ type: 'inventory' }); G.saver.requestSave('cofre'); redraw(); break;
    }
    case 'vup': { // +10 espaços no cofre com diamantes: o servidor confere o saldo e grava a compra
      E.buyVault().then((r) => { if (r.ok) { const V = vaultOf(sp, E.vaultBuys()); G.saver.requestSave('cofre'); b.msg = `Cofre aumentado para ${V.length} espaços.`; G.audio.play('coin'); } else b.msg = r.reason || 'Não foi possível.'; redraw(); });
      break;
    }
    case 'bkpct': { const p = +el.dataset.p; b.v = String(Math.floor((sp.gold * p) / 100) || ''); redraw(); break; }
    case 'bkdep': b.v = val('bkv'); E.deposit(b.v).then((r) => { if (r.ok) b.v = ''; done(r, 'Ouro guardado no banco.'); }); break;
    case 'bkwd': b.v = val('bkv'); E.withdraw(b.v).then((r) => { if (r.ok) b.v = ''; done(r, 'Ouro sacado para a bolsa.'); }); break;
    case 'bksearch': b.q = val('bkq'); b.to = null; b.conf = false; E.search(b.q).then((r) => { b.res = r; redraw(); }); break;
    case 'bkto': b.to = b.res?.[+el.dataset.i] || null; b.conf = false; redraw(); break;
    case 'bkpre': b.tv = val('bktv'); if (!(+b.tv > 0)) { b.msg = 'Escolha quanto enviar.'; } else if (+b.tv > E.bank) { b.msg = 'Saldo do banco insuficiente. Deposite antes de transferir.'; } else b.conf = true; redraw(); break;
    case 'bkno': b.conf = false; redraw(); break;
    case 'bksend': E.transfer(b.to, b.tv).then((r) => { const to = b.to?.n; if (r.ok) { b.conf = false; b.tv = ''; } done(r, `Enviado para ${to}!`); }); break;
    // diamantes
    case 'dsbuy': {
      const pack = DIAMONDS.packs.find((p) => p.id === el.dataset.p);
      if (DIAMONDS.payment === 'link' && DIAMONDS.paymentUrl) {
        const url = DIAMONDS.paymentUrl.replace('{pack}', encodeURIComponent(pack.id)).replace('{code}', encodeURIComponent(E.code()));
        window.open(url, '_blank', 'noopener');
        ui.ds.msg = `Pagamento aberto em outra aba. Mande o comprovante com o código ${E.code()}.`;
      } else if (DIAMONDS.payment === 'app' && window.RIFT_STORE?.buyDiamonds) {
        window.RIFT_STORE.buyDiamonds(pack.id).then(() => E.loadDiamonds()).then(() => refreshDiamonds(ui)).catch(() => {});
        ui.ds.msg = 'Abrindo a loja do aplicativo…';
      } else ui.ds.msg = 'A compra de diamantes ainda não está disponível.';
      refreshDiamonds(ui);
      break;
    }
    case 'dsget': E.buyWithDiamonds(el.dataset.sku).then((r) => { ui.ds.msg = r.ok ? 'Comprado! Já está liberado em Aparência.' : r.reason; if (r.ok) G.audio.play('discover'); refreshDiamonds(ui); }); break;
    case 'dstp': G.teleports.buy(el.dataset.sku).then((r) => { ui.ds.msg = r.ok ? `+${r.qty} Pergaminho(s) de Teleporte na bolsa! Toque nele na bolsa para viajar.` : r.reason; refreshDiamonds(ui); }); break;
    case 'dsuse': G.cosmetics.equip(el.dataset.k, el.dataset.id); refreshDiamonds(ui); break;
    case 'dstab': ui.ds.tab = el.dataset.t; refreshDiamonds(ui); break;
    case 'dsview': ui.ds.view = el.dataset.v; ui.ds.msg = ''; refreshDiamonds(ui); break;
    case 'dssearch': ui.ds.q = val('dsq'); ui.ds.to = null; E.search(ui.ds.q).then((r) => { ui.ds.res = r; refreshDiamonds(ui); }); break;
    case 'dsme': ui.ds.to = { id: G.saver.cloud?.uid, n: sp.name }; ui.ds.res = null; refreshDiamonds(ui); break;
    case 'dsto': ui.ds.to = ui.ds.res?.[+el.dataset.i] || null; refreshDiamonds(ui); break;
    case 'dsset': ui.ds.n = el.dataset.n; refreshDiamonds(ui); break;
    case 'dsgrant': ui.ds.n = val('dsn'); E.ownerGrant(ui.ds.to, ui.ds.n).then((r) => { ui.ds.msg = r.ok ? `Creditado! ${ui.ds.to.n} agora tem ${r.total} 💎 no total.` : r.reason; refreshDiamonds(ui); }); break;
    default: break;
  }
}
