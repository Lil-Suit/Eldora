import { slotHtml, pagedGrid, gridFit } from './panels.js';
import { ICONS, NPC_ICONS, itemIcon } from './icons.js';
import { esc } from './ui.js';
import { rewardsHtml, itemDetailHtml } from './panels.js';
import { NPCS, QUESTS } from '../config/quests.js';
import { CONSUMABLES, MATERIALS, EQUIP_SLOTS, SLOT_NAMES, ITEM_BASES } from '../config/items.js';
import { generateEquipment, itemValue, upgradeCost, displayName, rarityOf, makeStack, itemMainStat, stackDef, isBound, noSale } from '../core/items.js';
import { UPGRADE, RARITY_INDEX } from '../config/balance.js';
import { rng } from '../core/rng.js';
import { bankView, dailyView } from './economyui.js';
import { MARKET, expired } from '../game/market.js';
import { CLASSES } from '../config/classes.js';
import { DIAMONDS } from '../config/monetization.js';
import { itemCatalog } from '../core/catalog.js';
import { RARITIES } from '../config/balance.js';

// ---------- Livro dos Itens (Cronista) ----------
const RAR = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];
function catIcon(e, rarity = 'comum') {
  try { return itemIcon({ kind: 'equip', slot: e.slot, wkind: e.wkind, rarity: e.rarity || rarity, bset: e.bset, set: e.set, named: e.named, name: e.name }); } catch { return ICONS.livro; }
}
function catalogView() {
  const L = itemCatalog();
  let lastLv = -1;
  const rows = L.map((e, i) => {
    const head = e.level !== lastLv ? `<div class="cat-lv">Nível ${e.level}</div>` : '';
    lastLv = e.level;
    const c = RAR(e.rarity || 'comum').color;
    return `${head}<button class="cat-row interactive" data-a="d:view" data-v="item:${i}"><span class="cat-ico" style="color:${c}">${catIcon(e)}</span><b>${esc(e.name)}</b><small>${esc(e.kind)}</small></button>`;
  }).join('');
  return `<h3>Livro dos Itens</h3><p class="muted">Todos os equipamentos de Eldoria, do mais fraco ao mais forte. Toque em um para ver o que faz e quem solta.</p>
    <div class="cat-list">${rows}</div>`;
}
function catalogItemView(idx) {
  const e = itemCatalog()[+idx];
  if (!e) return catalogView();
  const st = e.stats.filter((x) => x.s).map((x) => `<span class="cat-st" style="border-color:${RAR(x.r).color}"><i style="color:${RAR(x.r).color}">${RAR(x.r).name}</i> ${x.s.k} ${x.s.v}</span>`).join('');
  const mobs = e.mobs.length ? e.mobs.map((m) => `<span class="cat-mob">${esc(m)}</span>`).join('') + (e.more ? `<span class="cat-mob">+${e.more} outros</span>` : '') : '<span class="muted">Não cai de monstros.</span>';
  return `<div class="cat-det"><span class="cat-ico big" style="color:${RAR(e.rarity || 'comum').color}">${catIcon(e)}</span><div><h3>${esc(e.name)}</h3><small>${esc(e.kind)} · <b>Nível ${e.req || e.level}</b></small></div></div>
    <p class="say">${esc(e.what)}</p>
    ${st ? `<div class="cat-sts">${st}</div>` : ''}
    <h4>Quem solta</h4><div class="cat-mobs">${mobs}</div>${e.note ? `<p class="muted">${esc(e.note)}</p>` : ''}
    <div class="row"><button class="btn" data-a="d:view" data-v="itens">Voltar à lista</button></div>`;
}

// Diálogo com NPCs, loja e ferraria.
export function openDialog(ui, npcId, view = 'main', keep = false) {
  if (!keep) globalThis.__eldCrumb?.('diálogo: ' + npcId + ' / ' + view, 'ui');
  const G = ui.G, def = NPCS[npcId];
  if (def?.service === 'itens' && view === 'main') view = 'itens'; // Cronista: abre direto no Livro dos Itens
  ui.dialogNpc = npcId;
  ui.dialogView = view;
  if (!keep) { ui.dsel = null; ui.dconfirm = null; }
  const npc = G.interact.npcs[npcId];
  const ctx = G.questCtx();
  const f = G.quests.forNpc(npcId, ctx);
  let body = '';
  // Leiloeira: a loja já tem as abas Comprar / Vender / Meus anúncios — abre direto em Comprar
  // (só mostra o menu de conversa se ela tiver missão para entregar ou oferecer)
  if (view === 'main' && def.service === 'market' && !f.ready.length && !f.available.length && !f.active.length) {
    ui.mtab = 'buy'; ui.msel = null; ui.mmsg = '';
    openDialog(ui, npcId, 'market', keep);
    G.market.refresh().then(() => { if (ui.dialogView === 'market' && ui.dialogNpc === npcId) openDialog(ui, npcId, 'market', true); });
    return;
  }
  // Mercador: só equipamento inicial (comprar) + vender itens para ele — abre direto na aba Comprar
  if (view === 'main' && def.service === 'shop' && !f.ready.length && !f.available.length && !f.active.length) {
    ui.sellTab = 'buy'; ui.dsel = null; ui._shopDirect = true;
    openDialog(ui, npcId, 'shop', keep);
    return;
  }
  // v0.12.8: NPC de serviço abre DIRETO no serviço (sem lista de opções). Banqueira: abas Banco | Baú diário.
  if (view === 'main' && !f.ready.length && !f.available.length && !f.active.length && ['bank', 'supplies', 'upgrade'].includes(def.service)) {
    if (def.service === 'bank') {
      const v = G.economy?.daily?.pode ? 'bau' : 'bank';
      ui.bk = { v: '', q: '', res: null, to: null, tv: '', conf: false, msg: '' }; ui.bauMsg = '';
      Promise.allSettled([G.economy.loadBank(), G.economy.checkMail(), G.economy.dailyStatus()]).then(() => { if (ui.dialogNpc === npcId && (ui.dialogView === 'bank' || ui.dialogView === 'bau')) openDialog(ui, npcId, ui.dialogView, true); });
      openDialog(ui, npcId, v, keep); return;
    }
    openDialog(ui, npcId, def.service, keep); return;
  }
  if (view === 'main') ui._shopDirect = false;
  if (view === 'main') {
    if (ui._greetNpc !== npcId) { ui._greetNpc = npcId; ui._greet = def.greet[Math.floor(Math.random() * def.greet.length)]; }
    const opts = [];
    for (const id of f.ready) opts.push(`<button class="opt ready" data-a="d:turnin" data-q="${id}"><b>?</b> Entregar: ${esc(QUESTS[id].name)}</button>`);
    for (const id of f.available) opts.push(`<button class="opt av" data-a="d:offer" data-q="${id}"><b>!</b> ${QUESTS[id].type === 'principal' ? 'Missão' : 'Pedido'}: ${esc(QUESTS[id].name)}</button>`);
    for (const id of f.active) opts.push(`<button class="opt act" data-a="d:qinfo" data-q="${id}"><b>…</b> ${esc(QUESTS[id].name)} (em andamento)</button>`);
    if (def.service === 'shop') opts.push(`<button class="opt" data-a="d:selltab" data-t="buy">${ICONS.espada || ICONS.moeda} Comprar equipamento inicial</button>`, `<button class="opt" data-a="d:selltab" data-t="eq">${ICONS.moeda} Vender meus itens</button>`);
    if (def.service === 'supplies') opts.push(`<button class="opt" data-a="d:view" data-v="supplies">${ICONS.pocao || ICONS.moeda} Comprar poções e flechas</button>`);
    if (def.service === 'bank') opts.push(`<button class="opt${G.economy?.daily?.pode ? ' ready' : ''}" data-a="d:view" data-v="bau">🎁 Baú diário${G.economy?.daily?.pode ? ' — pronto para abrir!' : ''}</button>`, `<button class="opt" data-a="d:view" data-v="bank">${ICONS.moeda} Banco: guardar, sacar e transferir ouro</button>`);
    if (def.service === 'market') opts.push(`<button class="opt" data-a="d:market" data-t="buy">${ICONS.bolsa} Comprar de outros jogadores</button>`, `<button class="opt" data-a="d:market" data-t="sell">${ICONS.moeda} Vender um item (você escolhe o preço)${G.state.player.level < MARKET.minLevel ? ` — libera no nível ${MARKET.minLevel}` : ''}</button>`, `<button class="opt" data-a="d:market" data-t="mine">${ICONS.livro} Meus anúncios</button>`);
    if (def.service === 'upgrade') opts.push(`<button class="opt" data-a="d:view" data-v="upgrade">${ICONS.machado} Aprimorar equipamento</button>`);
    if (def.service === 'itens') opts.push(`<button class="opt" data-a="d:view" data-v="itens">${ICONS.livro} Ver o Livro dos Itens (do mais fraco ao mais forte)</button>`);
    if (def.service === 'hints') opts.push(`<button class="opt" data-a="d:view" data-v="hint">${ICONS.mapa} Pedir uma pista</button>`);
    if (def.service === 'lore' || npcId === 'mestre') opts.push(`<button class="opt" data-a="d:view" data-v="lore">${ICONS.livro} Contar sobre os Selos</button>`);
    opts.push(`<button class="opt bye" data-a="d:close">Até logo</button>`);
    body = `<p class="say">${esc(ui._greet)}</p><div class="opts">${opts.join('')}</div>`;
  } else if (view === 'offer' || view === 'qinfo') {
    const id = ui.dq, q = QUESTS[id];
    const objs = view === 'qinfo' ? G.quests.objectives(id).map((o) => `<li class="${o.done ? 'done' : ''}">${esc(o.text)}${o.need > 1 ? ` <b>${o.have}/${o.need}</b>` : ''}</li>`).join('') : q.stages[0].objectives.map((o) => `<li>${esc(o.text)}${o.count > 1 ? ` (${o.count})` : ''}</li>`).join('');
    body = `<h3>${esc(q.name)}</h3><p class="say">${esc(q.intro)}</p><ul class="qobj">${objs}</ul><div class="rws">${rewardsHtml(G, q.rewards)}</div>
      <div class="row">${view === 'offer' ? `<button class="btn primary" data-a="d:accept" data-q="${id}">Aceitar</button>` : ''}<button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  } else if (view === 'turnin') {
    const id = ui.dq, q = QUESTS[id];
    body = `<h3>${esc(q.name)}</h3><p class="say">${esc(q.done)}</p><div class="rws">${rewardsHtml(G, q.rewards)}</div>
      <div class="row"><button class="btn primary" data-a="d:complete" data-q="${id}">Receber recompensa</button></div>`;
  } else if (view === 'hint') {
    ui.hintI = ((ui.hintI ?? -1) + 1) % def.hints.length;
    body = `<p class="say">“${esc(def.hints[ui.hintI])}”</p><div class="row"><button class="btn" data-a="d:view" data-v="hint">Outra pista</button><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  } else if (view === 'lore') {
    const lines = npcId === 'eco' ? def.greet : [
      'Há muito tempo, estruturas antigas chamadas Selos da Realidade mantinham Eldoria inteira, separada do vazio entre os mundos.',
      'Os Selos começaram a falhar. Fendas surgem em regiões distantes e criaturas desconhecidas atravessam para cá.',
      "Dizem que o primeiro Guardião ergueu o Selo deste vale nas Ruínas de Vel'Thar. Se alguém sabe o que está acontecendo, é ele… ou o que restou dele.",
    ];
    body = `${lines.map((l) => `<p class="say">${esc(l)}</p>`).join('')}<div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  } else if (view === 'shop') body = shopView(ui);
  else if (view === 'itens') body = catalogView();
  else if (view.startsWith('item:')) body = catalogItemView(view.slice(5));
  else if (view === 'supplies') body = suppliesView(ui);
  else if (view === 'upgrade') body = upgradeView(ui);
  else if (view === 'market') body = marketView(ui);
  else if (view === 'bank' || view === 'bau') {
    const tabs = `<div class="dtabsrow"><button class="btn sm ${view === 'bank' ? 'primary' : ''}" data-a="d:view" data-v="bank">${ICONS.moeda} Banco</button><button class="btn sm ${view === 'bau' ? 'primary' : ''}" data-a="d:view" data-v="bau">🎁 Baú diário${G.economy?.daily?.pode ? ' •' : ''}</button></div>`;
    body = tabs + (view === 'bank' ? bankView(ui) : dailyView(ui));
  }
  const wide = view === 'itens' || view.startsWith('item:') || view === 'shop' || view === 'supplies' || view === 'upgrade' || view === 'market' || view === 'bank';
  const full = view === 'itens' || view.startsWith('item:');
  ui.el.dialog.className = 'dialog interactive' + (full ? ' full' : wide ? ' wide' : '');
  ui.el.dialog.innerHTML = `
    <div class="dhead"><div class="dport">${NPC_ICONS[npcId] || ICONS.pessoa}</div><div><b>${esc(def.name)}</b><small>${esc(def.title)} · ${esc(def.role)}</small></div>
    <div class="dgold">${ICONS.moeda}${G.state.player.gold.toLocaleString('pt-BR')}</div><button class="jclose" data-a="d:close">${ICONS.fechar}</button></div>
    <div class="dbody">${body}</div>`;
  ui.el.dialog.classList.remove('hidden');
  if (view === 'market') bindMarketSearch(ui);
  void npc;
}

// ---------- Fornecedora: grade estilo Rucoy (toque num item → perfil com o preço → Comprar) ----------
// 4 linhas: vida | mana (pequena, média, grande) e flechas | pergaminho — cabe inteiro no celular deitado
const Q4 = [1, 10, 50, 100, 250];
const SUPPLY_ROWS = [
  [['pocao_vida_p', Q4], ['tonico_p', Q4]], [['pocao_vida', Q4], ['tonico', Q4]], [['pocao_vida_g', Q4], ['tonico_g', Q4]],
  // o Pergaminho de Teleporte (💎) fica ao lado do de Retorno (ouro), no mesmo grupo
  [['flechas', [25, 50, 100, 250, 500]], ['pergaminho', [1, 5, 10], 'pergaminho_tp', [3, 8]]],
];
const TP_SKU = { 3: 'tp3', 8: 'tp8' }; // pacotes do Pergaminho de Teleporte (preço em DIAMONDS.prices)
function suppliesView(ui) {
  const G = ui.G, gold = G.state.player.gold;
  const tile = (id, q) => {
    const on = ui.supSel && ui.supSel.id === id && ui.supSel.q === q;
    const dia = id === 'pergaminho_tp';
    return `<button class="suptile${on ? ' on' : ''}${dia ? ' dia' : ''}" data-a="d:supsel" data-id="${id}" data-q="${q}" title="${esc(CONSUMABLES[id].name)} x${q}">${itemIcon({ kind: 'consumable', id })}${q > 1 ? `<u>${q}</u>` : ''}${dia ? '<s>💎</s>' : ''}</button>`;
  };
  const grp = (g) => { const out = []; for (let k = 0; k < g.length; k += 2) for (const q of g[k + 1]) out.push(tile(g[k], q)); return `<div class="supgrp">${out.join('')}</div>`; };
  const tiles = SUPPLY_ROWS.map((line) => `<div class="suprow">${line.map(grp).join('')}</div>`).join('');
  const sel = ui.supSel || { id: 'pocao_vida', q: 10 };
  const counts = `<div class="supcount"><span>${itemIcon({ kind: 'consumable', id: 'pocao_vida' })}<b>${G.lifeCount()}</b></span><span>${itemIcon({ kind: 'consumable', id: 'tonico' })}<b>${G.manaCount()}</b></span><span>${itemIcon({ kind: 'consumable', id: 'flechas' })}<b>${G.inv.count('flechas')}</b></span><span>${itemIcon({ kind: 'consumable', id: 'pergaminho_tp' })}<b>${G.inv.count('pergaminho_tp')}</b></span></div>`;
  if (sel.id === 'pergaminho_tp') {
    // pago com diamantes 💎 (saldo no servidor)
    const c = CONSUMABLES[sel.id], E = G.economy, sku = TP_SKU[sel.q], price = DIAMONDS.prices[sku];
    const ready = E?.online() && E.diamondsReady, bal = ready ? E.diamonds() : 0, fits = G.inv.capacityFor(makeStack(sel.id, 1, rng)) >= sel.q;
    const why = !ready ? (E?.online() ? 'Carregando diamantes…' : 'Entre com a sua conta') : bal < price ? `Faltam 💎${price - bal}` : !fits ? 'Bolsa cheia' : '';
    const prof = `<div class="supprof"><div class="supbig">${itemIcon({ kind: 'consumable', id: sel.id })}</div>
      <b style="color:${c.color}">${esc(c.name)}</b><p>${esc(c.desc)}</p>
      <div class="suprows"><span>Quantidade</span><b>${sel.q}</b><span>Preço</span><b class="tot dia">💎${price}</b><span>Seu saldo</span><b>${ready ? '💎' + bal.toLocaleString('pt-BR') : '—'}</b><span>Você tem</span><b>${G.inv.count(sel.id)}</b></div>
      <button class="btn primary big" data-a="d:supdia" ${why ? 'disabled' : ''}>${why || `Comprar por 💎${price}`}</button></div>`;
    return `<div class="supshop"><div>${counts}<div class="supgrid">${tiles}</div></div>${prof}</div><div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  }
  const c = CONSUMABLES[sel.id], total = c.price * sel.q, have = G.inv.count(sel.id);
  const fits = G.inv.capacityFor(makeStack(sel.id, 1, rng)) >= sel.q;
  const prof = `<div class="supprof"><div class="supbig">${itemIcon({ kind: 'consumable', id: sel.id })}</div>
    <b style="color:${c.color}">${esc(c.name)}</b><p>${esc(c.desc)}</p>
    <div class="suprows"><span>Quantidade</span><b>${sel.q}</b><span>Preço de cada</span><b>${ICONS.moeda}${c.price}</b><span>Total</span><b class="tot">${ICONS.moeda}${total.toLocaleString('pt-BR')}</b><span>Você tem</span><b>${have}</b></div>
    <button class="btn primary big" data-a="d:supbuy" ${gold < total || !fits ? 'disabled' : ''}>${gold < total ? 'Ouro insuficiente' : !fits ? 'Bolsa cheia' : `Comprar por ${total.toLocaleString('pt-BR')}`}</button></div>`;
  return `<div class="supshop"><div>${counts}<div class="supgrid">${tiles}</div></div>${prof}</div><div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
}

// ---------- Mercador: vender é fácil — abas Equipamentos | Poções e materiais, só os itens (sem espaços vazios,
// sem rolar); toque no item → perfil ao lado com o botão Vender ----------
// Equipamento inicial do Mercador (comum, nível 1). Preço de compra bem acima do de venda (7 ouro) — sem lucro fácil.
const STARTER = [
  ['@weapon', 40], ['capuz_couro', 25], ['gibao_couro', 30], ['calca_couro', 25], ['luva_couro_e', 15],
  ['luva_couro_d', 15], ['botas_couro', 20], ['escudo_madeira', 30], ['mochila_couro', 90],
];
function starterCatalog(G) {
  const cls = G.state.player.classId;
  if (!G._starterCat || G._starterCat.cls !== cls) {
    const items = STARTER.map(([b, price]) => {
      const baseId = b === '@weapon' ? CLASSES[cls]?.startWeapon || 'espada_curta' : b;
      return { baseId, price, it: generateEquipment({ baseId, rarity: 'comum', ilvl: 1, rng }) };
    });
    G._starterCat = { cls, items };
  }
  return G._starterCat.items;
}
function starterBuyHtml(ui, tabs) {
  const G = ui.G, gold = G.state.player.gold, cat = starterCatalog(G);
  if (!cat.find((c) => c.baseId === ui.bsel)) ui.bsel = cat[0].baseId;
  const cur = cat.find((c) => c.baseId === ui.bsel);
  const grid = cat.map((c) => slotHtml(c.it, `data-a="d:bsel" data-b="${c.baseId}"`, '', G).replace('class="islot', `class="islot${c.baseId === ui.bsel ? ' sel' : ''}`)).join('');
  const full = G.inv.freeSlots() <= 0;
  const prof = `<div class="sellprof">${itemDetailHtml(G, cur.it, { compare: true })}
    <button class="btn primary big" data-a="d:bbuy" ${gold < cur.price || full ? 'disabled' : ''}>${gold < cur.price ? `Ouro insuficiente (${ICONS.moeda}${cur.price})` : full ? 'Bolsa cheia' : `Comprar por ${ICONS.moeda}${cur.price}`}</button></div>`;
  return `<div class="shop sellshop"><div>${tabs}<p class="muted shopnote">Equipamento básico para começar. Itens melhores caem dos monstros ou estão na Leiloeira.</p><div class="sellgrid">${grid}</div></div>${prof}</div>`;
}

function shopView(ui) {
  const G = ui.G, tab = ui.sellTab || 'buy';
  const isEq = (it) => it.kind === 'equip';
  const list = [];
  G.inv.slots.forEach((it, i) => { if (it && (tab === 'eq' ? isEq(it) : !isEq(it))) list.push(i); });
  if (ui.dsel != null && !list.includes(ui.dsel)) ui.dsel = null;
  const sel = ui.dsel != null ? G.inv.slots[ui.dsel] : null;
  const nEq = G.inv.slots.filter((it) => it && isEq(it)).length, nSt = G.inv.slots.filter((it) => it && !isEq(it)).length;
  const tabs = `<div class="selltabs"><button class="btn sm ${tab === 'buy' ? 'primary' : ''}" data-a="d:selltab" data-t="buy">Comprar</button><button class="btn sm ${tab === 'eq' ? 'primary' : ''}" data-a="d:selltab" data-t="eq">Vender equip. (${nEq})</button><button class="btn sm ${tab === 'st' ? 'primary' : ''}" data-a="d:selltab" data-t="st">Vender poções/mat. (${nSt})</button>${ui._shopDirect ? '<button class="btn sm back" data-a="d:close">Fechar</button>' : '<button class="btn sm back" data-a="d:view" data-v="main">Voltar</button>'}</div>`;
  if (tab === 'buy') return starterBuyHtml(ui, tabs);
  const grid = list.length ? pagedGrid(ui, 'ssell' + tab, list.map((i) => slotHtml(G.inv.slots[i], `data-a="d:ssel" data-i="${i}"`, '', G).replace('class="islot', `class="islot${ui.dsel === i ? ' sel' : ''}${isBound(G.inv.slots[i]) ? ' bound' : ''}`)), 'd:', gridFit([4, 5, 6], [3, 4, 5])) : '';
  const prof = sel ? `<div class="sellprof">${itemDetailHtml(G, sel, { compare: false })}
      ${isBound(sel) || noSale(sel) ? '<p class="muted">Chaves, itens de missão, itens únicos e itens Épicos, Míticos e Lendários não podem ser vendidos.</p>' : `<button class="btn primary big" data-a="d:sell">Vender${sel.qty > 1 ? ` (x${sel.qty})` : ''} por ${ICONS.moeda}${itemValue(sel).toLocaleString('pt-BR')}</button>`}</div>`
    : '<div class="sellprof empty"><p class="muted">Toque num item para ver o perfil e o valor de venda.</p></div>';
  return `<div class="shop sellshop"><div>${tabs}<div class="sellgrid">${grid || '<p class="muted">Nada aqui.</p>'}</div></div>${prof}</div>`;
}

function upgradeView(ui) {
  const G = ui.G, sp = G.state.player, flags = G.state.world.flags;
  if (!flags.upgradeUnlocked) return `<p class="say">Ainda não conheço seu estilo de luta. Conclua <b>Presas e Insígnias</b> e eu abro minha forja para você.</p><div class="row"><button class="btn" data-a="d:view" data-v="main">Voltar</button></div>`;
  const list = [];
  for (const s of EQUIP_SLOTS) { const it = sp.equipment[s]; if (it && (it.atk || it.def)) list.push({ it, src: 'eq', key: 'eq:' + s }); }
  G.inv.slots.forEach((it, i) => { if (it && it.kind === 'equip' && (it.atk || it.def)) list.push({ it, src: 'inv', key: 'inv:' + i }); });
  if (!ui.dsel || !list.find((x) => x.key === ui.dsel)) ui.dsel = list[0]?.key;
  const cur = list.find((x) => x.key === ui.dsel);
  const rows = list.map((x) => `<div class="uprow ${x.key === ui.dsel ? 'sel' : ''}" data-a="d:usel" data-k="${x.key}"><i style="color:${rarityOf(x.it).color}">${itemIcon(x.it)}</i><b style="color:${rarityOf(x.it).color}">${esc(displayName(x.it))}</b><small>${x.src === 'eq' ? 'Equipado' : 'Bolsa'}</small></div>`).join('');
  let det = '<p class="muted">Selecione um item.</p>';
  if (cur) {
    const c = upgradeCost(cur.it);
    if (!c) det = `<p>Este item já está no aprimoramento máximo (+${UPGRADE.maxLevel}).</p>`;
    else {
      const now = itemMainStat(cur.it), next = Math.round((cur.it.atk ?? cur.it.def) * (1 + UPGRADE.statPerLevel * c.level));
      const mats = Object.entries(c.materials).map(([id, n]) => { const have = G.inv.count(id); return `<li class="${have >= n ? 'ok' : 'bad'}">${esc(MATERIALS[id].name)}: ${have}/${n}</li>`; }).join('');
      const can = sp.gold >= c.gold && Object.entries(c.materials).every(([id, n]) => G.inv.count(id) >= n);
      det = `<h3>${esc(displayName(cur.it))} → +${c.level}</h3><div class="upstat">${cur.it.slot === 'weapon' ? 'Ataque' : 'Defesa'}: <b>${now}</b> → <b class="up">${next}</b></div>
        <ul class="mats">${mats}<li class="${sp.gold >= c.gold ? 'ok' : 'bad'}">Ouro: ${sp.gold}/${c.gold}</li></ul>
        <p class="muted">O aprimoramento sempre funciona — sem chance de falha.</p>
        <button class="btn primary" data-a="d:upgrade" ${can ? '' : 'disabled'}>Aprimorar</button>`;
    }
  }
  return `<div class="shop"><div><h3>Equipamentos</h3><div class="uplist">${rows || '<p class="muted">Nada para aprimorar.</p>'}</div></div><div>${det}</div></div>`;
}

export function dialogClick(ui, a, el) {
  const G = ui.G, sp = G.state.player, npcId = ui.dialogNpc;
  switch (a) {
    case 'close': ui.closeDialog(); break;
    case 'view':
      if (el.dataset.v === 'bank') { ui.bk = { v: '', q: '', res: null, to: null, tv: '', conf: false, msg: '' }; Promise.allSettled([G.economy.loadBank(), G.economy.checkMail()]).then(() => { if (ui.dialogView === 'bank') openDialog(ui, npcId, 'bank', true); }); }
      if (el.dataset.v === 'bau') { ui.bauMsg = ''; G.economy.dailyStatus().then(() => { if (ui.dialogView === 'bau') openDialog(ui, npcId, 'bau', true); }); }
      openDialog(ui, npcId, el.dataset.v); break;
    case 'bauopen': {
      if (ui._bauBusy) break; ui._bauBusy = true;
      G.economy.dailyOpen().then((r) => {
        ui._bauBusy = false;
        if (r.ok) { const x = r.r; ui.bauMsg = `Dia ${x.dia}: +${x.ouro.toLocaleString('pt-BR')} de ouro${x.pocao ? `, ${x.pocao} poções` : ''}${x.tonico ? `, ${x.tonico} tônicos` : ''}${x.item ? ' e um equipamento!' : '.'}`; G.audio.play('loot', { rarity: x.item ? 2 : 1 }); }
        else { ui.bauMsg = r.reason; G.audio.play('error'); }
        if (ui.dialogView === 'bau') openDialog(ui, npcId, 'bau', true);
        ui.refreshHud?.();
      });
      break;
    }
    case 'market': {
      ui.mtab = el.dataset.t || ui.mtab || 'buy'; ui.msel = null; ui.mmsg = '';
      openDialog(ui, npcId, 'market');
      G.market.refresh().then(() => { if (ui.dialogView === 'market') openDialog(ui, npcId, 'market', true); });
      break;
    }
    case 'mtab': ui.mtab = el.dataset.t; ui.msel = null; ui.mmsg = ''; openDialog(ui, npcId, 'market', true); break;
    case 'mf': ui.mf = el.dataset.f; ui.mimg = null; openDialog(ui, npcId, 'market', true); break;
    case 'mimg': ui.mimg = ui.mimg === el.dataset.k ? null : el.dataset.k; openDialog(ui, npcId, 'market', true); break;
    case 'mclear': ui.mq = ''; ui.mimg = null; ui.mf = 'all'; openDialog(ui, npcId, 'market', true); break;
    case 'ms': ui.ms = ui.ms === 'preco' ? 'novo' : 'preco'; openDialog(ui, npcId, 'market', true); break;
    case 'mview': ui.mview = el.dataset.id || null; openDialog(ui, npcId, 'market', true); break;
    case 'msel': ui.msel = +el.dataset.i; ui.mprice = null; ui.mmsg = ''; openDialog(ui, npcId, 'market', true); break;
    case 'mlist': {
      const inp = ui.el.dialog.querySelector('#mprice');
      const price = Math.floor(+(inp?.value || 0));
      G.market.list(ui.msel, price).then((r) => { ui.mmsg = r.ok ? 'Item anunciado! Você recebe o ouro quando alguém comprar.' : r.reason; if (r.ok) { ui.msel = null; G.audio.play('loot', { rarity: 1 }); } openDialog(ui, npcId, 'market', true); });
      break;
    }
    case 'mslots': G.market.buySlots().then((r) => { ui.mmsg = r.ok ? `Agora você tem ${r.max} espaços de venda!` : r.reason || 'Não foi possível.'; if (r.ok) G.audio.play('loot', { rarity: 2 }); openDialog(ui, npcId, 'market', true); }); break;
    case 'mbuy': G.market.buy(el.dataset.id).then((r) => { ui.mmsg = r.ok ? `Comprado: ${displayName(r.item)}` : r.reason || 'Não foi possível.'; openDialog(ui, npcId, 'market', true); ui.refreshHud?.(); }); break;
    case 'mcancel': G.market.cancel(el.dataset.id).then((r) => { ui.mmsg = r.ok ? 'Anúncio cancelado — o item voltou para a bolsa.' : r.reason || 'Não foi possível.'; openDialog(ui, npcId, 'market', true); }); break;
    case 'offer': ui.dq = el.dataset.q; openDialog(ui, npcId, 'offer'); break;
    case 'qinfo': ui.dq = el.dataset.q; openDialog(ui, npcId, 'qinfo'); break;
    case 'turnin': ui.dq = el.dataset.q; openDialog(ui, npcId, 'turnin'); break;
    case 'accept': G.acceptQuest(el.dataset.q); openDialog(ui, npcId, 'main'); break;
    case 'complete': G.turnInQuest(el.dataset.q); openDialog(ui, npcId, 'main'); break;
    case 'supsel': {
      ui.supSel = { id: el.dataset.id, q: +el.dataset.q }; openDialog(ui, npcId, 'supplies', true);
      if (ui.supSel.id === 'pergaminho_tp' && G.economy?.online()) G.economy.loadDiamonds().then(() => { if (ui.dialogView === 'supplies') openDialog(ui, npcId, 'supplies', true); });
      break;
    }
    case 'supdia': {
      const sku = TP_SKU[ui.supSel?.q];
      if (!sku || ui._diaBusy) break;
      ui._diaBusy = true;
      G.teleports.buy(sku).then((r) => {
        ui._diaBusy = false;
        if (r.ok) { ui.toastSmall(`+${r.qty} Pergaminhos de Teleporte`); G.audio.play('coin'); } else { ui.toastSmall(r.reason, 4); G.audio.play('error'); }
        if (ui.dialogView === 'supplies') openDialog(ui, npcId, 'supplies', true);
      });
      break;
    }
    case 'supbuy': {
      const sel = ui.supSel || { id: 'pocao_vida', q: 10 }, c = CONSUMABLES[sel.id], total = c.price * sel.q;
      if (sp.gold < total) { G.audio.play('error'); break; }
      const st = makeStack(sel.id, sel.q, rng);
      if (G.inv.capacityFor(st) < sel.q) { ui.toastSmall('Bolsa cheia!'); G.audio.play('error'); break; }
      sp.gold -= total; G.inv.add(st);
      G.audio.play('coin'); ui.toastSmall(`Comprou ${sel.q}× ${c.name}`); ui.refreshHud();
      G.saver.requestSave('compra');
      openDialog(ui, npcId, 'supplies', true);
      break;
    }
    case 'sellall': {
      const r = el.dataset.r; let total = 0, n = 0;
      G.inv.slots.forEach((s, i) => { if (s && s.kind === 'equip' && s.rarity === r && !isBound(s) && !noSale(s)) { total += itemValue(s); G.inv.slots[i] = null; n++; } }); G.inv.compact();
      sp.gold += total; ui.dsel = null;
      G.audio.play('coin'); ui.toastSmall(`${n} itens vendidos por ${total} ouro`);
      ui.refreshHud(); openDialog(ui, npcId, 'shop', true); G.saver.requestSave('venda');
      break;
    }
    case 'sellmats': {
      let total = 0;
      G.inv.slots.forEach((s, i) => { if (s && s.kind === 'material' && !isBound(s)) { total += itemValue(s); G.inv.slots[i] = null; } }); G.inv.compact();
      sp.gold += total; ui.dsel = null;
      G.audio.play('coin'); ui.toastSmall(`Materiais vendidos por ${total} ouro`);
      G.questEvent({ type: 'inventory' });
      ui.refreshHud(); openDialog(ui, npcId, 'shop', true); G.saver.requestSave('venda');
      break;
    }
    case 'buy': {
      const c = CONSUMABLES[el.dataset.id];
      if (sp.gold < c.price) { G.audio.play('error'); break; }
      const st = makeStack(el.dataset.id, 1, rng);
      if (G.inv.capacityFor(st) <= 0) { ui.toastSmall('Inventário cheio!'); G.audio.play('error'); break; }
      sp.gold -= c.price; G.inv.add(st);
      G.audio.play('coin'); ui.refreshHud();
      openDialog(ui, npcId, 'shop', true);
      break;
    }
    case 'ssel': ui.dsel = +el.dataset.i; openDialog(ui, npcId, 'shop', true); break;
    case 'pg': ui.pg = ui.pg || {}; ui.pg[el.dataset.k] = +el.dataset.p; openDialog(ui, npcId, ui.dialogView || 'main', true); G.audio.play('ui'); break;
    case 'bsel': ui.bsel = el.dataset.b; openDialog(ui, npcId, 'shop', true); break;
    case 'bbuy': {
      const c = starterCatalog(G).find((x) => x.baseId === ui.bsel);
      if (!c || sp.gold < c.price) { G.audio.play('error'); break; }
      if (G.inv.freeSlots() <= 0) { ui.toastSmall('Bolsa cheia!'); G.audio.play('error'); break; }
      sp.gold -= c.price;
      G.inv.add(generateEquipment({ baseId: c.baseId, rarity: 'comum', ilvl: 1, rng }));
      G.audio.play('coin'); ui.toastSmall(`Comprou ${c.it.name}`); ui.refreshHud();
      G.saver.requestSave('compra');
      openDialog(ui, npcId, 'shop', true);
      break;
    }
    case 'selltab': ui.sellTab = el.dataset.t; ui.dsel = null; openDialog(ui, npcId, 'shop', true); break;
    case 'sell': {
      const it = G.inv.slots[ui.dsel];
      if (!it || isBound(it)) break;
      if (noSale(it)) { ui.toastSmall('Itens Épicos, Míticos e Lendários não podem ser vendidos.'); break; }
      const v = itemValue(it);
      G.inv.removeAt(ui.dsel);
      sp.gold += v; ui.dsel = null;
      G.audio.play('coin'); ui.toastSmall(`Vendido por ${v} ouro`);
      G.questEvent({ type: 'inventory' });
      ui.refreshHud(); openDialog(ui, npcId, 'shop', true);
      G.saver.requestSave('venda');
      break;
    }
    case 'sellcommons': {
      let total = 0;
      G.inv.slots.forEach((s, i) => { if (s && s.kind === 'equip' && s.rarity === 'comum') { total += itemValue(s); G.inv.slots[i] = null; } }); G.inv.compact();
      sp.gold += total; ui.dsel = null;
      G.audio.play('coin'); ui.toastSmall(`Vendidos por ${total} ouro`);
      ui.refreshHud(); openDialog(ui, npcId, 'shop', true);
      break;
    }
    case 'usel': ui.dsel = el.dataset.k; openDialog(ui, npcId, 'upgrade', true); break;
    case 'upgrade': {
      const [src, k] = ui.dsel.split(':');
      const it = src === 'eq' ? sp.equipment[k] : G.inv.slots[+k];
      const c = it && upgradeCost(it);
      if (!c) break;
      if (sp.gold < c.gold || !Object.entries(c.materials).every(([id, n]) => G.inv.count(id) >= n)) { G.audio.play('error'); break; }
      sp.gold -= c.gold;
      for (const [id, n] of Object.entries(c.materials)) G.inv.removeId(id, n);
      it.up = c.level;
      G.player.recompute();
      G.audio.play('slam', { vol: 0.5 }); G.audio.play('loot', { rarity: 2, gap: 0 });
      const P = G.player; G.fx.burst({ x: P.pos.x, y: P.pos.y + 1.2, z: P.pos.z }, { count: 24, color: [0xffa040, 0xffd36b], speed: 4, size: 0.3, life: 0.6 });
      ui.toastSmall(`${displayName(it)} aprimorado!`);
      G.questEvent({ type: 'inventory' });
      ui.refreshHud(); openDialog(ui, npcId, 'upgrade', true);
      G.saver.requestSave('aprimorar');
      break;
    }
    default: break;
  }
  void SLOT_NAMES; void RARITY_INDEX; void itemDetailHtml;
}


// ---------- Mercado dos Viajantes (entre jogadores) ----------
const foldTxt = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const KIND_NAMES = { espada: 'Espadas', machado: 'Machados', montante: 'Montantes', arco: 'Arcos', arco_longo: 'Arcos longos', varinha: 'Varinhas', cajado: 'Cajados', orbe: 'Orbes', adaga: 'Adagas', clava: 'Clavas', escudo: 'Escudos' };
// cada "imagem" do filtro é um tipo de item: tipo de arma, de elmo, de armadura, anel ou a pilha exata
export function marketImgKey(it) { return it.kind === 'equip' ? `e:${it.slot}:${it.slot === 'ring' || it.slot === 'neck' ? '' : it.wkind || ''}` : `s:${it.id}`; }
function marketImgLabel(it) {
  if (it.kind !== 'equip') return stackDef(it)?.name || it.id;
  if (it.slot === 'ring') return 'Anéis';
  if (it.slot === 'neck') return 'Cordões';
  if ({ legs: 1, gloveL: 1, gloveR: 1, boots: 1, back: 1 }[it.slot]) return ({ legs: 'Calças', gloveL: 'Luvas (esq.)', gloveR: 'Luvas (dir.)', boots: 'Botas', back: 'Mochilas' })[it.slot];
  if (it.slot === 'weapon') return KIND_NAMES[it.wkind] || 'Armas';
  return (it.base && ITEM_BASES[it.base]?.name) || (it.slot === 'helm' ? 'Capacetes' : 'Armaduras');
}
// pesquisa pelo nome enquanto digita (sem redesenhar a janela, o teclado continua aberto)
export function bindMarketSearch(ui) {
  const q = ui.el.dialog.querySelector('#mq');
  if (!q) return;
  const apply = () => {
    const words = foldTxt(q.value).split(/\s+/).filter((w) => w && !['de', 'da', 'do', 'das', 'dos'].includes(w));
    let n = 0;
    for (const r of ui.el.dialog.querySelectorAll('.mlist .mrow')) { const ok = words.every((w) => r.dataset.n.includes(w)); r.hidden = !ok; if (ok) n++; }
    const none = ui.el.dialog.querySelector('.mnone');
    if (none) none.hidden = n > 0;
    const clr = ui.el.dialog.querySelector('.mclr');
    if (clr) clr.hidden = !(q.value || ui.mimg);
  };
  q.addEventListener('input', () => { ui.mq = q.value; apply(); });
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') q.blur(); });
  q.addEventListener('keyup', (e) => e.stopPropagation());
  apply();
  if (ui._mqFocus) { ui._mqFocus = false; q.focus(); }
}
function marketView(ui) {
  const G = ui.G, M = G.market, tab = ui.mtab || 'buy';
  const tabs = [['buy', 'Comprar'], ['sell', 'Vender'], ['mine', 'Meus anúncios']].map(([id, n]) => `<button class="btn sm ${tab === id ? 'primary' : ''}" data-a="d:mtab" data-t="${id}">${n}</button>`).join('');
  const msg = ui.mmsg ? `<p class="mmsg">${esc(ui.mmsg)}</p>` : '';
  let body = '';
  if (!M.available()) {
    body = '<p class="say">O Mercado dos Viajantes funciona na página publicada do jogo, com outros jogadores conectados. Neste arquivo local ele fica fechado.</p>';
  } else if (M.state === 'loading' && !M.listings.length) {
    body = '<p class="muted">Carregando anúncios…</p>';
  } else if (tab === 'buy') {
    const f = ui.mf || 'all', img = ui.mimg || null;
    const cat = (it) => (it.kind === 'equip' ? (it.slot === 'weapon' ? 'arma' : it.slot === 'ring' || it.slot === 'neck' ? 'anel' : 'armadura') : it.kind === 'consumable' ? 'pocao' : 'mat');
    const all = M.forSale().map((l) => { try { return { l, it: JSON.parse(l.item) }; } catch { return null; } }).filter(Boolean);
    // imagens para escolher: um ícone por tipo de item que está à venda agora
    const kinds = new Map();
    for (const x of all) {
      const k = marketImgKey(x.it);
      if (!kinds.has(k)) kinds.set(k, { it: x.it, n: 0, label: marketImgLabel(x.it) });
      kinds.get(k).n++;
    }
    const chips = [['all', 'Tudo'], ['arma', 'Armas'], ['armadura', 'Armaduras'], ['anel', 'Anéis'], ['mat', 'Materiais'], ['pocao', 'Poções']].map(([id, n]) => `<button class="btn sm ${f === id ? 'primary' : ''}" data-a="d:mf" data-f="${id}">${n}</button>`).join('');
    const pics = [...kinds.entries()].filter(([, v]) => f === 'all' || cat(v.it) === f).map(([k, v]) => `<button class="mpic ${img === k ? 'on' : ''}" data-a="d:mimg" data-k="${esc(k)}" title="${esc(v.label)}">${itemIcon(v.it)}<b>${v.n}</b></button>`).join('');
    const list = all.filter((x) => (f === 'all' || cat(x.it) === f) && (!img || marketImgKey(x.it) === img)).sort((a, b) => (ui.ms === 'preco' ? a.l.price - b.l.price : b.l.t - a.l.t));
    const imgLabel = img && kinds.get(img) ? kinds.get(img).label : '';
    const top = `<div class="msearch"><input id="mq" type="search" placeholder="Pesquisar pelo nome…" value="${esc(ui.mq || '')}" autocomplete="off" enterkeyhint="search">
        <button class="btn sm mclr" data-a="d:mclear"${ui.mq || img ? '' : ' hidden'}>Limpar</button><button class="btn sm" data-a="d:ms">${ui.ms === 'preco' ? 'Menor preço' : 'Mais novos'}</button></div>
      <div class="mfilt">${chips}</div>
      ${pics ? `<div class="mpics"><small>${img ? `Só: <b>${esc(imgLabel)}</b> (toque de novo para tirar)` : 'Ou toque numa imagem:'}</small>${pics}</div>` : ''}`;
    const rows = list.map(({ l, it }) => {
      const col = it.kind === 'equip' ? rarityOf(it).color : (stackDef(it)?.color || '#e8e0cc');
      const stat = it.kind === 'equip' ? (it.slot === 'weapon' ? `Ataque ${itemMainStat(it)}` : it.def ? `Defesa ${itemMainStat(it)}` : 'Anel') : `x${it.qty || 1}`;
      return `<div class="mrow${ui.mview === l.id ? ' on' : ''}" data-n="${esc(foldTxt(displayName(it) + ' ' + marketImgLabel(it)))}"><span class="mic" data-a="d:mview" data-id="${esc(l.id)}">${slotHtml(it, '', '', G)}</span><div class="mn" data-a="d:mview" data-id="${esc(l.id)}"><b style="color:${col}">${esc(displayName(it))}</b><small>${esc(stat)}${it.reqLevel ? ` · Nível ${it.reqLevel}` : ''} · vendedor: ${esc(String(l.sellerName || '?').slice(0, 16))}</small></div>
        <button class="btn sm primary" data-a="d:mbuy" data-id="${esc(l.id)}" ${G.state.player.gold < l.price ? 'disabled' : ''}>${ICONS.moeda}${l.price.toLocaleString('pt-BR')}</button></div>`;
    }).join('');
    // perfil do item escolhido (toque na imagem ou no nome): atributos completos + preço + Comprar
    const pv = ui.mview ? all.find((x) => x.l.id === ui.mview) : null;
    // janela no MEIO da tela só com o item escolhido: perfil + preço + Comprar
    const pvHtml = pv ? `<div class="mpop"><div class="mpopcard">${itemDetailHtml(G, pv.it)}
      <div class="mpopbuy"><div><span>Preço</span><b>${ICONS.moeda}${pv.l.price.toLocaleString('pt-BR')}</b><small>vendedor: ${esc(String(pv.l.sellerName || '?').slice(0, 16))}</small></div>
        <button class="btn primary big" data-a="d:mbuy" data-id="${esc(pv.l.id)}" ${G.state.player.gold < pv.l.price ? 'disabled' : ''}>${G.state.player.gold < pv.l.price ? 'Ouro insuficiente' : 'Comprar'}</button><button class="btn" data-a="d:mview" data-id="">Fechar</button></div></div></div>` : '';
    body = top + pvHtml + `<div class="mlist">${rows}</div><p class="muted mnone"${rows ? ' hidden' : ''}>${all.length ? 'Nada encontrado com esse filtro.' : 'Nenhum item à venda agora. Seja o primeiro a anunciar!'}</p>`;
  } else if (tab === 'sell' && !M.levelOk()) {
    body = `<p class="say">As vendas no Mercado dos Viajantes liberam no <b>nível ${MARKET.minLevel}</b>. Você está no nível ${G.state.player.level}. Até lá, você já pode comprar de outros jogadores.</p>`;
  } else if (tab === 'sell') {
    const grid = pagedGrid(ui, 'msell', G.inv.slots.map((it, i) => (it ? slotHtml(it, `data-a="d:msel" data-i="${i}"`, '', G).replace('class="islot', `class="islot${ui.msel === i ? ' sel' : ''}`) : '<div class="islot empty"></div>')), 'd:', gridFit([4, 5, 6], [3, 4, 5]));
    const sel = ui.msel != null ? G.inv.slots[ui.msel] : null;
    const sug = sel ? Math.max(1, itemValue(sel) * 3) : 0;
    const form = sel ? `<div class="mform"><b style="color:${sel.kind === 'equip' ? rarityOf(sel).color : '#fff'}">${esc(displayName(sel))}${sel.qty > 1 ? ` x${sel.qty}` : ''}</b>
      <label>Preço <input id="mprice" type="number" min="1" max="999999" value="${ui.mprice || sug}" inputmode="numeric"></label>
      <button class="btn primary" data-a="d:mlist">Anunciar</button><small>Sem taxa: você recebe o preço inteiro · o anúncio fica ${MARKET.days} dias · você recebe o ouro mesmo offline.</small></div>`
      : '<p class="muted">Escolha um item da bolsa para anunciar.</p>';
    // espaços de venda: 10 de graça; com tudo cheio, compra +10 por 💎100 (até 50)
    const used = M.openCount(), max = M.maxListings(), E = G.economy;
    const slots = `<div class="mslots"><span>Espaços de venda: <b>${used}/${max}</b></span>${max < MARKET.top
      ? `<button class="btn sm ${used >= max ? 'primary' : ''}" data-a="d:mslots" ${E?.online?.() && E.diamondsReady && E.diamonds() >= MARKET.extraPrice ? '' : 'disabled'}>+${MARKET.extra} espaços · 💎${MARKET.extraPrice}</button>`
      : `<small class="muted">máximo de ${MARKET.top}</small>`}</div>`;
    body = `${slots}<div class="msell"><div class="invgrid sm">${grid}</div>${form}</div>`;
  } else {
    const rows = M.mine().map((l) => {
      let it; try { it = JSON.parse(l.item); } catch { return ''; }
      const exp = l.status === 'open' && expired(l);
      return `<div class="mrow"><span class="mic">${slotHtml(it, '', '', G)}</span><div class="mn"><b>${esc(displayName(it))}</b><small>${ICONS.moeda}${l.price.toLocaleString('pt-BR')} · ${l.status === 'sold' ? `vendido para ${esc(String(l.buyerName || '?').slice(0, 16))}` : exp ? 'expirou — retire o item' : 'à venda'}</small></div>
        ${l.status === 'open' ? `<button class="btn sm ${exp ? 'primary' : ''}" data-a="d:mcancel" data-id="${esc(l.id)}">${exp ? 'Retirar' : 'Cancelar'}</button>` : ''}</div>`;
    }).join('');
    body = rows ? `<div class="mlist">${rows}</div>` : '<p class="muted">Você não tem anúncios.</p>';
  }
  return `<div class="mhead"><h3>${ui.dialogNpc === 'leiloeira' ? 'Loja dos Jogadores' : 'Mercado dos Viajantes'}</h3><div class="mtabs">${tabs}</div></div>${msg}${body}<div class="row">${NPCS[ui.dialogNpc]?.service === 'market' ? '<button class="btn" data-a="d:close">Fechar</button>' : '<button class="btn" data-a="d:view" data-v="main">Voltar</button>'}</div>`;
}
