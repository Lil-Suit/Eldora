import { VERSION } from '../version.js';
import { ICONS, SKILL_ICONS, CLASS_ICONS, itemIcon } from './icons.js';
import { esc } from './ui.js';
import { describeItem, compareItems, rarityOf, displayName, lootTableSummary, itemValue, stackDef, itemMainStat, noTrade } from '../core/items.js';
import { equipFromInventory, unequipToInventory, equipBlockReason, packBonus, bagRaw } from '../core/inventory.js';
import { ATTRIBUTES, DERIVED_INFO, RARITIES, RARITY_INDEX, BALANCE } from '../config/balance.js';
import { SLOT_NAMES, EQUIP_SLOTS, NAMED_ITEMS, CONSUMABLES } from '../config/items.js';
import { ENEMIES, BOSS, tintOf } from '../config/enemies.js';
import { MOB_LEVELS } from '../config/moblevels.js';
import { QUESTS, NPCS, QUEST_ORDER } from '../config/quests.js';
import { SKILL_UNLOCKS } from '../config/classes.js';
import { xpToNext, scaleRewardXp } from '../core/progression.js';
import { keyLabel } from '../game/input.js';
import { basicCooldown } from '../core/stats.js';
import { COSMETIC_SETS } from '../game/cosmetics.js';
import { ACHIEVEMENTS } from '../config/cosmetics.js';
import { MONETIZATION, DIAMONDS } from '../config/monetization.js';
import { itemTheme } from '../config/itemthemes.js';

export const JOURNAL_TABS = [
  ['inventory', 'Inventário', 'bolsa'], ['character', 'Personagem', 'pessoa'], ['skills', 'Habilidades', 'estrela'],
  ['quests', 'Missões', 'livro'], ['map', 'Mapa', 'mapa'], ['bestiary', 'Bestiário', 'caveira'], ['appearance', 'Aparência', 'cabide'],
];

export const TRI_UP = '<svg class="tri" viewBox="0 0 10 10"><path d="M5 1 9.5 9H.5z" fill="currentColor"/></svg>';
export const TRI_DOWN = '<svg class="tri" viewBox="0 0 10 10"><path d="M5 9 9.5 1H.5z" fill="currentColor"/></svg>';
const pct = (v) => (Math.round(v * 1000) / 10).toLocaleString('pt-BR') + '%';
const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

export function renderJournal(ui, tab) {
  const tabs = JOURNAL_TABS.map(([id, n, ic]) => `<button class="jtab ${id === tab ? 'on' : ''}" data-a="j:tab" data-tab="${id}">${ICONS[ic]}<span>${n}</span></button>`).join('');
  let body = '';
  switch (tab) {
    case 'inventory': body = inventory(ui); break;
    case 'character': body = character(ui); break;
    case 'skills': body = skills(ui); break;
    case 'quests': body = quests(ui); break;
    case 'map': body = mapTab(ui); break;
    case 'bestiary': body = bestiary(ui); break;
    case 'appearance': body = appearance(ui); break;
    default: break;
  }
  // atalhos que antes ficavam num menu à parte (celular): Gestos, Menu (configurações) e Painel GM
  const extra = `<span class="jsp"></span>${ui.G.saver?.serverGm ? `<button class="jtab jx" data-a="j:gm" title="Painel GM">${ICONS.coroa || '♛'}</button>` : ''}<button class="jtab jx jdia" data-a="diamonds" title="Loja de Diamantes">💎</button><button class="jtab jx" data-a="j:emotes" title="Gestos">${ICONS.sorriso}</button><button class="jtab jx" data-a="j:pause" title="Menu e configurações">${ICONS.engrenagem}</button>`;
  const html = `<div class="jwrap"><div class="jtabs">${tabs}${extra}<button class="jclose" data-a="j:close" title="Fechar (Esc)">${ICONS.fechar}</button></div><div class="jbody ${tab}">${body}</div></div>`;
  if (tab === 'inventory') setTimeout(() => {
    const box = ui.el.journal.querySelector('.pgrid[data-k="bag"]'); if (!box) return;
    const cs = getComputedStyle(box), slot = parseFloat(cs.getPropertyValue('--slotStd')) || 52, gap = 6;
    const W = box.clientWidth - 40, H = box.clientHeight - 10;
    const cols = Math.max(2, Math.floor((W + gap) / (slot + gap))), rows = Math.max(1, Math.floor((H + gap) / (slot + gap)));
    if (cols * rows !== ui.bagFit?.per || cols !== ui.bagFit?.cols) { ui.bagFit = { per: cols * rows, cols }; ui.renderJournal(); }
  }, 0);
  if (tab === 'map') setTimeout(() => {
    const c = ui.el.journal.querySelector('canvas.fullmap'); if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const redraw = () => ui.map.drawFull(c.getContext('2d'), c.width, c.height);
    ui.map.bindFull(c, redraw); redraw();
  }, 0);
  return html;
}

// Nome curto mostrado dentro do espaço do item (para reconhecer cada item sem abrir os detalhes)
const KIND_SHORT = { espada: 'Espada', montante: 'Montante', machado: 'Machado', arco: 'Arco', arco_longo: 'Arco longo', varinha: 'Varinha', cajado: 'Cajado', orbe: 'Orbe',
  elmo: 'Capacete', capuz: 'Capuz', tiara: 'Chapéu', chapeu: 'Chapéu', couro: 'Gibão', malha: 'Peitoral', manto: 'Manto',
  escudo: 'Escudo', broquel: 'Broquel', escudo_runico: 'Escudo', escudo_torre: 'Torre', calca: 'Calça', grevas: 'Calça', luvaE: 'Luva E', luvaD: 'Luva D', manoplaE: 'Manopla E', manoplaD: 'Manopla D', bota: 'Botas', botaF: 'Botas', mochila: 'Mochila' };
export function shortName(entry) {
  if (entry.kind === 'equip') {
    if (entry.named) return entry.name.split(' ')[0];
    if (entry.slot === 'ring') return 'Anel';
    if (entry.slot === 'neck') return 'Cordão';
    return KIND_SHORT[entry.wkind] || entry.name.split(' ')[0];
  }
  return STACK_SHORT[entry.id] || (stackDef(entry)?.name || '?').split(' ')[0];
}
const STACK_SHORT = { pocao_vida: 'Poção', tonico: 'Tônico', pergaminho: 'Retorno', pergaminho_tp: 'Teleporte', gosma: 'Gosma', presa_lobo: 'Presa', insignia_goblin: 'Insígnia', po_osso: 'Pó de osso', fragmento_fenda: 'Fragmento', chave_selo: 'Chave' };

// Grade com PÁGINAS (estilo Rucoy): os itens têm sempre o mesmo tamanho (--slotStd) e uma seta ao lado
// troca a página. ns = prefixo do clique da tela ('j:' diário, 'd:' conversa, 'ec:' banco); per = itens por página.
export function pagedGrid(ui, key, cells, ns, fit) {
  ui.pg = ui.pg || {};
  const per = Math.max(4, (typeof fit === 'object' ? fit?.per : fit) || 20), cols = typeof fit === 'object' ? fit.cols : 0;
  const pages = Math.max(1, Math.ceil(cells.length / per));
  const pg = Math.min(ui.pg[key] || 0, pages - 1); ui.pg[key] = pg;
  const shown = cells.slice(pg * per, pg * per + per);
  const dots = pages > 1 ? `<div class="pgdots">${Array.from({ length: pages }, (_, k) => `<i class="${k === pg ? 'on' : ''}"></i>`).join('')}</div>` : '';
  // seta dividida ao meio: em cima vai para a próxima página, embaixo volta
  const arrow = pages > 1 ? `<div class="pgarrow"><button data-a="${ns}pg" data-k="${key}" data-p="${(pg + 1) % pages}" title="Próxima página">›</button><small>${pg + 1}/${pages}</small><button data-a="${ns}pg" data-k="${key}" data-p="${(pg - 1 + pages) % pages}" title="Página anterior">‹</button></div>` : '';
  const rows = cols ? Math.ceil(per / cols) : 0;
  return `<div class="pgrid" data-k="${key}"${rows ? ` style="--rows:${rows}"` : ''}>${dots}<div class="pgcells"${cols ? ` style="grid-template-columns:repeat(${cols},var(--slotStd))"` : ''}>${shown.join('')}</div>${arrow}</div>`;
}
// quantas casas cabem na tela (celular deitado x computador), com o tamanho padrão de item
export function gridFit(cols, rows) {
  const h = window.innerHeight || 400, w = window.innerWidth || 800;
  const r = h < 430 ? rows[0] : h < 640 ? rows[1] : rows[2];
  const c = w < 700 ? cols[0] : w < 1100 ? cols[1] : cols[2];
  return { per: c * r, cols: c };
}

export function slotHtml(entry, attrs = '', extra = '', G = null) {
  if (!entry) return `<div class="islot empty" ${attrs}>${extra}</div>`;
  const col = entry.kind === 'equip' ? rarityOf(entry).color : (stackDef(entry)?.color || '#e8e0cc');
  const qty = entry.kind !== 'equip' && entry.qty > 1 ? `<u>${entry.qty}</u>` : '';
  const up = entry.kind === 'equip' && entry.up ? `<s>+${entry.up}</s>` : '';
  let stat = '';
  if (entry.kind === 'equip') {
    const v = entry.slot === 'weapon' ? entry.atk : entry.def;
    if (entry.slot === 'back') stat = `<q class="cap">${packBonus(entry)}</q>`;
    else if (v) stat = `<q class="${entry.slot === 'weapon' ? 'atk' : 'def'}">${Math.round(itemMainStatSafe(entry))}</q>`;
    else if (entry.set) stat = '<q class="aff">✚</q>'; // peça do Conjunto da Prece (cura)
    else if (entry.slot === 'ring' && entry.boss) { const k = Object.keys(entry.affixes || {})[0]; if (k) stat = `<q class="aff">${(ATTR_SHORT[k] || k).slice(0, 3)}</q>`; }
  }
  const blocked = G && entry.kind === 'equip' && equipBlockReason(G.state.player, entry) ? ' blocked' : '';
  const forged = entry.forged ? ' forged' : '';
  return `<div class="islot r-${entry.rarity || 'item'}${blocked}${forged}" style="--c:${col}" ${attrs}><i style="color:${col}">${itemIcon(entry)}</i>${stat}${qty}${up}<span class="lbl">${esc(shortName(entry))}</span>${extra}</div>`;
}
const ATTR_SHORT = { for: 'FOR', agi: 'AGI', int: 'INT', vit: 'VIT', crit: 'CRI', aspd: 'VEL', spow: 'HAB', hp: 'VID', regen: 'REG', def: 'DEF' };
function itemMainStatSafe(it) { try { return itemMainStat(it); } catch { return it.atk || it.def || 0; } }

// colunas da grade da bolsa conforme o tamanho (para caber sem rolar)
const gc = (n) => n > 60 ? 10 : n > 48 ? 9 : n > 40 ? 8 : 7;

function isUpgrade(G, it) {
  if (it.kind !== 'equip' || equipBlockReason(G.state.player, it)) return false;
  const cur = G.state.player.equipment[it.slot];
  if (!cur) return true;
  const diff = compareItems(it, cur);
  const score = diff.reduce((s, d) => s + d.diff * (d.key === 'main' ? 1 : 0.6), 0);
  return score > 0.5;
}

function inventory(ui) {
  const G = ui.G, sp = G.state.player, inv = G.inv, st = G.player.stats;
  const sel = ui.sel;
  // boneco de equipamentos 3×3 (cabe sem rolar): mochila/elmo/anel · luva/peito/luva · arma/calça/botas
  const DOLL = ['back', 'helm', 'ring', 'gloveL', 'chest', 'gloveR', 'weapon', 'legs', 'shield', 'neck', 'boots', null];
  const eq = DOLL.map((s) => {
    if (!s) return '<div class="eqcell gap"></div>';
    const it = sp.equipment[s];
    const on = sel?.src === 'eq' && sel.slot === s ? ' sel' : '';
    return `<div class="eqcell${on}" data-a="j:sel" data-slot="${s}" title="${SLOT_NAMES[s]}${it ? ': ' + esc(displayName(it)) : ''}">${slotHtml(it, '', '', G)}<small>${SLOT_NAMES[s]}</small></div>`;
  }).join('');
  void EQUIP_SLOTS;
  const cells = inv.slots.map((it, i) => {
    const on = sel?.src === 'inv' && sel.i === i ? ' sel' : '';
    const badge = it && isUpgrade(G, it) ? `<em class="better" title="Melhor que o equipado">${TRI_UP}</em>` : '';
    return slotHtml(it, `data-a="j:sel" data-i="${i}"`, badge, G).replace('class="islot', `class="islot${on}`);
  });
  const grid = pagedGrid(ui, 'bag', cells, 'j:', ui.bagFit || gridFit([5, 6, 7], [4, 6, 8]));
  return `
    <div class="invcol">
      <div class="eqdoll">${eq}</div>
      <div class="statsum">
        <div><span>${G.player.cls.id === 'mago' ? 'Poder mágico' : 'Ataque'}</span><b>${fmt(st.power)}</b></div>
        <div><span>Defesa</span><b>${fmt(st.def)} <small>(${pct(st.defReduction)})</small></b></div>
        <div><span>Vida</span><b>${st.maxHp}</b></div>
        <div><span>Crítico</span><b>${pct(st.crit)}</b></div>
      </div>
    </div>
    <div class="invgrid-wrap">
      <div class="invhead"><span><span title="${bagRaw(sp) > inv.cap ? `Teto do nível ${sp.level}: ${inv.cap} espaços (a mochila daria ${bagRaw(sp)})` : 'Espaços da bolsa'}">Bolsa <b>${inv.usedSlots()}/${inv.cap}</b></span>${inv.over() ? ` <em class="bagover" title="Você tem mais itens que o espaço da bolsa: nada some, mas só entra item novo depois de liberar">acima do limite</em>` : ''} <span class="goldline inl">${ICONS.moeda}<b>${sp.gold.toLocaleString('pt-BR')}</b></span></span><button class="btn sm" data-a="j:sort">Organizar</button></div>
      ${grid}
    </div>
    ${itemPopup(ui)}`;
}

// item escolhido: aparece SOZINHO no meio da tela (sem a coluna fixa ao lado), com os botões
function itemPopup(ui) {
  const G = ui.G, sel = ui.sel;
  const it = sel?.src === 'inv' ? G.inv.slots[sel.i] : sel?.src === 'eq' ? G.state.player.equipment[sel.slot] : null;
  if (!it) return '';
  return `<div class="ipop" data-a="j:desel"><div class="ipopcard" data-a="j:noop"><button class="ipx" data-a="j:desel" title="Fechar">${ICONS.fechar}</button>${itemDetail(ui)}</div></div>`;
}

export function itemDetailHtml(G, it, opts = {}) {
  const d = describeItem(it);
  const sp = G.state.player;
  let compare = '';
  if (it.kind === 'equip' && opts.compare !== false) {
    const cur = sp.equipment[it.slot];
    if (cur && cur.uid !== it.uid) {
      const diff = compareItems(it, cur);
      compare = `<div class="cmp"><div class="cmph">Comparado ao equipado (${esc(displayName(cur))})</div>${diff.length ? diff.map((x) => `<div class="${x.diff > 0 ? 'up' : 'down'}">${x.diff > 0 ? TRI_UP : TRI_DOWN} ${esc(x.label)} ${x.diff > 0 ? '+' : ''}${String(x.diff).replace('.', ',')}</div>`).join('') : '<div>Sem diferença</div>'}</div>`;
    } else if (!cur) compare = '<div class="cmp"><div class="up">Nada equipado neste espaço</div></div>';
  }
  const why = it.kind === 'equip' ? equipBlockReason(sp, it) : null;
  return `
    <div class="idh" style="--c:${d.color || '#fff'}">
      <div class="idicon" style="color:${d.color}">${itemIcon(it)}</div>
      <div><div class="idname" style="color:${d.color}">${esc(d.title)}</div><div class="idsub">${d.rarity ? `<b style="color:${d.color}">${d.rarity}</b> · ` : ''}${esc(d.sub)}</div></div>
    </div>
    ${d.req ? `<div class="idreq ${d.req > sp.level ? 'bad' : ''}">Requer nível ${d.req}${d.cls && d.cls !== sp.classId ? ' · <span class="bad">outra classe</span>' : ''}</div>` : ''}
    <div class="idlines">${d.lines.map((l) => `<div class="${l.main ? 'main' : ''}"><span>${esc(l.label)}</span><b>${esc(l.text)}</b></div>`).join('')}</div>
    ${d.effect ? `<div class="ideff">✦ ${esc(d.effect)}</div>` : ''}
    ${d.forged ? `<div class="idforged">⚔ ${esc(d.forged)}</div>` : ''}
    ${(() => { const th = itemTheme(it); return th ? `<div class="idsrc" style="--tc:${th.key === 'natal' ? th.fx2 : th.metal};--tf:${th.key === 'natal' ? '#ff7a84' : th.fx}">${th.set ? `<b>${esc(th.key === 'natal' ? 'Item natalino' : th.mob)}</b> · saque de chefe` : th.bset ? `<b>${esc(th.mob)}</b> · ${esc(th.name)}` : `Feito de <b>${esc(th.mob)}</b>${th.key !== 'cor' ? ` · estilo ${esc(th.name)}` : ''}`}</div>` : ''; })()}
    ${d.desc ? `<div class="iddesc">${esc(d.desc)}</div>` : ''}
    ${d.lore ? `<div class="idlore">“${esc(d.lore)}”</div>` : ''}
    ${compare}
    <div class="idval">${ICONS.moeda} Valor de venda: ${itemValue(it)}</div>
    ${why && opts.showWhy !== false ? `<div class="idreq bad">${esc(why)}</div>` : ''}`;
}

function itemDetail(ui) {
  const G = ui.G, sel = ui.sel;
  let it = null;
  if (sel?.src === 'inv') it = G.inv.slots[sel.i];
  if (sel?.src === 'eq') it = G.state.player.equipment[sel.slot];
  if (!it) return `<div class="empty-detail">${ICONS.bolsa}<p>Selecione um item para ver detalhes, comparar e equipar.</p><p class="muted">Seta verde <span class="better-demo">${TRI_UP}</span> = melhor que o equipado. Número = ataque/defesa. Fundo vermelho = classe ou nível incompatível.</p></div>`;
  const btns = [];
  if (sel.src === 'inv') {
    if (it.kind === 'equip') {
      const why = equipBlockReason(G.state.player, it);
      // bloqueado: o botão já diz o porquê (antes parecia que "não equipava")
      btns.push(why ? `<button class="btn" data-a="j:equip" disabled title="${esc(why)}">${esc(why.replace('Somente', 'Só para').replace('Requer nível', 'Precisa nível').replace(/\.$/, ''))}</button>` : `<button class="btn primary" data-a="j:equip">Equipar</button>`);
    }
    if (it.kind === 'consumable') btns.push(`<button class="btn primary" data-a="j:use">Usar</button>`);
    if (it.id === 'cavalo_criador' || it.id === 'lobo_criacao') btns.push(`<button class="btn primary" data-a="j:use">${G.player.mounted ? 'Desmontar' : 'Montar'}</button>`);
    if (!noTrade(it)) btns.push(ui.confirmDrop === it.uid ? `<button class="btn danger" data-a="j:drop">Confirmar: largar</button>` : `<button class="btn" data-a="j:drop">Largar no chão</button>`);
  } else if (it && sel.slot !== 'weapon') btns.push(`<button class="btn" data-a="j:unequip">Desequipar</button>`);
  return itemDetailHtml(G, it, { compare: sel.src === 'inv' }) + `<div class="row">${btns.join('')}</div>`;
}

function character(ui) {
  const G = ui.G, sp = G.state.player, P = G.player, st = P.stats, cls = P.cls;
  const need = xpToNext(sp.level);
  const BRIEF = { for: 'Ataque do Guerreiro · Defesa', agi: 'Ataque do Arqueiro · Crítico · Vel. de ataque', int: 'Poder do Mago · Mana · Poder de habilidade', vit: '+10 de Vida · Regeneração' };
  const attrs = Object.entries(ATTRIBUTES).map(([k, a]) => `
    <div class="attr ${k === cls.primary ? 'primary' : ''}" title="${esc(a.desc)}">
      <div class="attrn"><b>${a.name}${k === cls.primary ? ' <em>principal</em>' : ''}</b><small>${BRIEF[k]}${sp.attrs[k] ? ` · +${sp.attrs[k]} alocados` : ''}</small></div>
      <span class="av">${st.attrs[k]}</span>${sp.freePoints > 0 ? `<button class="plus" data-a="j:attr" data-k="${k}" title="Gastar 1 ponto">+</button>` : ''}
    </div>`).join('');
  const derived = [
    [cls.id === 'mago' ? 'Poder mágico' : 'Ataque', fmt(st.power), DERIVED_INFO.power],
    ['Defesa', `${fmt(st.def)} (−${pct(st.defReduction)})`, DERIVED_INFO.def],
    ['Vida máxima', st.maxHp, ''],
    [cls.resource.name + ' máxima', st.maxRes, ''],
    ['Chance crítica', pct(st.crit), DERIVED_INFO.crit],
    ['Vel. de ataque', `${fmt(1 / basicCooldown(cls, st))}/s (+${pct(st.aspd)})`, DERIVED_INFO.aspd],
    ['Poder de habilidade', '+' + pct(st.spow), DERIVED_INFO.spow],
    ['Regeneração', fmt(st.regen) + '/s', DERIVED_INFO.regen],
    ['Red. de recarga', pct(st.cdr), DERIVED_INFO.cdr],
    ['Vel. de movimento', fmt(st.moveSpeed) + ' m/s', ''],
  ].map(([n, v, tip]) => `<div title="${esc(tip)}"><span>${n}</span><b>${v}</b></div>`).join('');
  const s = sp.stats;
  const kills = Object.values(s.kills).reduce((a, b) => a + b, 0);
  const pt = Math.floor(s.playTime / 60);
  const uniques = G.state.world.uniques.length, totalU = Object.values(NAMED_ITEMS).filter((n) => n.unique).length;
  const respecCost = 20 * sp.level;
  const allocated = Object.values(sp.attrs).reduce((a, b) => a + b, 0);
  return `
    <div class="charhead">
      <div class="charemb" style="color:${cls.resource.color}">${CLASS_ICONS[cls.id]}</div>
      <div><h2>${esc(sp.name)}</h2><div class="muted">${cls.name} · ${cls.title}</div>
      <div class="xpline"><div class="bar xp"><i style="width:${need === Infinity ? 100 : (sp.xp / need) * 100}%"></i></div><span>Nível ${sp.level} · ${Math.floor(sp.xp)}/${need === Infinity ? '—' : need} XP</span></div></div>
      ${sp.freePoints > 0 ? `<div class="points pulse">${sp.freePoints} ponto${sp.freePoints > 1 ? 's' : ''} para distribuir</div>` : ''}
    </div>
    <div class="charcols">
      <div class="ccol"><h3>Atributos</h3>${attrs}
        ${allocated > 0 ? `<button class="btn sm" data-a="j:respec">Redistribuir (${respecCost} ouro)</button>` : ''}
      </div>
      <div class="ccol"><h3>Estatísticas</h3><div class="derived">${derived}</div></div>
      <div class="ccol"><h3>Jornada</h3><div class="derived">
          <div><span>Tempo de jogo</span><b>${Math.floor(pt / 60)}h ${pt % 60}min</b></div>
          <div><span>Inimigos derrotados</span><b>${kills}</b></div>
          <div><span>Chefes derrotados</span><b>${s.bossKills}</b></div>
          <div><span>Baús abertos</span><b>${s.chests}</b></div>
          <div><span>Quedas</span><b>${s.deaths}</b></div>
          <div><span>Dano causado</span><b>${Math.round(s.damageDealt).toLocaleString('pt-BR')}</b></div>
          <div><span>Itens únicos</span><b>${uniques}/${totalU}</b></div>
          <div><span>Locais descobertos</span><b>${G.state.world.discovered.filter((d) => d !== 'cripta_interior').length}/13</b></div>
        </div>
      </div>
    </div>`;
}

function skillMultText(s) {
  if (s.mult == null) return '';
  const ticks = s.ticks ? ` × ${s.ticks}` : s.count ? ` × ${s.count} flechas` : '';
  return `Dano: ${Math.round(s.mult * 100)}%${ticks}`;
}

function skills(ui) {
  const G = ui.G, P = G.player, cls = P.cls, lvl = G.state.player.level, I = G.input.binds;
  const b = cls.basic;
  const key = (k) => G.isTouch ? '' : `<kbd>${k}</kbd>`;
  const cards = [`
    <div class="skrow"><div class="skico">${cls.id === 'guerreiro' ? SKILL_ICONS.corte : cls.id === 'arqueiro' ? SKILL_ICONS.flecha : SKILL_ICONS.fagulha}</div>
    <div class="skt"><b>${esc(b.name)}</b> ${key('Clique')}<div class="muted">${esc(b.desc)}</div><div class="skmeta"><span>Alcance ${String(b.range).replace('.', ',')}m</span><span>${fmt(1 / basicCooldown(cls, P.stats))} ataques/s</span></div></div></div>`];
  cls.skills.forEach((sk, i) => {
    const locked = lvl < SKILL_UNLOCKS[i];
    cards.push(`<div class="skrow ${locked ? 'locked' : ''}"><div class="skico">${SKILL_ICONS[sk.id] || ICONS.estrela}${locked ? `<span class="lk">${ICONS.cadeado}</span>` : ''}</div>
      <div class="skt"><b>${esc(sk.name)}</b> ${key(keyLabel(I['skill' + (i + 1)]))} ${locked ? `<span class="lockt">Nível ${SKILL_UNLOCKS[i]}</span>` : ''}
      <div class="muted">${esc(sk.desc)}</div>
      <div class="skmeta">${sk.cost ? `<span>${sk.cost} ${cls.resource.name}</span>` : '<span>Sem custo</span>'}<span>Recarga ${String(sk.cd).replace('.', ',')}s</span>${skillMultText(sk) ? `<span>${skillMultText(sk)}</span>` : ''}</div></div></div>`);
  });
  cards.push(`<div class="skrow"><div class="skico">${ICONS.esquiva}</div><div class="skt"><b>${esc(cls.dodge.name)}</b> ${key(keyLabel(I.dodge))}<div class="muted">Esquiva rápida, invulnerável por ${Math.round(cls.dodge.iframes * 1000)}ms.</div><div class="skmeta"><span>Recarga ${String(cls.dodge.cd).replace('.', ',')}s</span></div></div></div>`);
  const r = cls.resource;
  const resText = r.id === 'furia' ? 'sobe ao acertar e ao receber dano; cai fora de combate.' : `regenera ${String(r.regen).replace('.', ',')}/s (dobro na vila).`;
  return `<div class="skhead"><b class="skcls">${cls.name}</b><span><b style="color:${r.color}">${r.name}</b> ${resText}</span><span class="muted">Novas habilidades nos níveis ${SKILL_UNLOCKS.join(', ')}.</span></div><div class="skgrid">${cards.join('')}</div>`;
}

function rewardsHtml(G, rw) {
  const parts = [];
  if (rw.xp) parts.push(`<span class="rw xp">${scaleRewardXp(rw.xp, G.state.player.level)} XP</span>`);
  if (rw.gold) parts.push(`<span class="rw gold">${ICONS.moeda}${rw.gold}</span>`);
  for (const it of rw.items || []) {
    if (it.consumable) parts.push(`<span class="rw">${CONSUMABLES[it.consumable].name} x${it.qty || 1}</span>`);
    else if (it.named) { const n = NAMED_ITEMS[it.named]; parts.push(`<span class="rw" style="color:${RARITIES[RARITY_INDEX[n.rarity]].color}">${esc(n.name)}</span>`); }
    else if (it.roll) parts.push(`<span class="rw" style="color:${RARITIES[RARITY_INDEX[it.roll.rarity]].color}">${it.roll.slot === 'weapon' ? 'Arma' : 'Equipamento'} ${RARITIES[RARITY_INDEX[it.roll.rarity]].name.toLowerCase()} da sua classe</span>`);
    else if (it.quest) parts.push(`<span class="rw" style="color:#5ef0ff">Chave do Selo</span>`);
  }
  return parts.join('');
}
export { rewardsHtml };

function quests(ui) {
  const G = ui.G, Q = G.quests, ctx = G.questCtx();
  const groups = { active: [], available: [], done: [], locked: [] };
  for (const id of QUEST_ORDER) {
    const s = Q.status(id, ctx);
    if (s === 'active' || s === 'ready') groups.active.push(id);
    else if (s === 'available') groups.available.push(id);
    else if (s === 'done') groups.done.push(id);
    else groups.locked.push(id);
  }
  if (!ui.qsel || !QUESTS[ui.qsel]) ui.qsel = groups.active[0] || groups.available[0] || groups.done[0];
  const item = (id, cls) => `<div class="qitem ${cls} ${ui.qsel === id ? 'sel' : ''}" data-a="j:qsel" data-q="${id}"><b>${QUESTS[id].type === 'principal' ? '◆ ' : ''}${esc(QUESTS[id].name)}</b>${Q.status(id, ctx) === 'ready' ? '<em>Pronta</em>' : ''}${Q.tracked === id ? '<i>rastreando</i>' : ''}</div>`;
  const sec = (t, arr, html) => arr.length ? `<h3>${t} <small>${arr.length}</small></h3>${html}` : '';
  const list = `
    ${sec('Ativas', groups.active, groups.active.map((i) => item(i, 'act')).join(''))}
    ${sec('Disponíveis', groups.available, groups.available.map((i) => item(i, 'av')).join(''))}
    ${sec('Bloqueadas', groups.locked, groups.locked.map((i) => `<div class="qitem lock ${ui.qsel === i ? 'sel' : ''}" data-a="j:qsel" data-q="${i}"><b>${esc(QUESTS[i].name)}</b><em>${esc(Q.lockReason(i, ctx) || '')}</em></div>`).join(''))}
    ${sec('Concluídas', groups.done, groups.done.map((i) => item(i, 'done')).join(''))}
    ${!groups.active.length && !groups.available.length ? '<p class="muted">Explore e suba de nível para liberar mais missões.</p>' : ''}`;
  const id = ui.qsel;
  let det = '';
  if (id) {
    const def = QUESTS[id], s = Q.status(id, ctx);
    const objs = s === 'active' || s === 'ready' ? Q.objectives(id).map((o) => `<li class="${o.done ? 'done' : ''}">${esc(o.text)}${o.need > 1 ? ` — <b>${o.have}/${o.need}</b>` : ''}</li>`).join('') : def.stages.flatMap((st) => st.objectives).map((o) => `<li class="${s === 'done' ? 'done' : ''}">${esc(o.text)}</li>`).join('');
    det = `<h2>${esc(def.name)}</h2><div class="muted">${def.type === 'principal' ? 'Missão principal' : 'Missão secundária'} · ${esc(NPCS[def.giver].name)}${def.turnIn !== def.giver ? ` → ${esc(NPCS[def.turnIn].name)}` : ''}</div>
      <p class="qintro">${esc(def.intro)}</p>
      <h3>Objetivos ${def.stages.length > 1 && (s === 'active' || s === 'ready') ? `<small>(etapa ${Q.q[id].stage + 1}/${def.stages.length})</small>` : ''}</h3><ul class="qobj">${objs}</ul>
      ${s === 'ready' ? `<p class="ready">Volte a ${esc(NPCS[def.turnIn].name)} para entregar.</p>` : ''}
      ${s === 'available' ? `<p class="av">Fale com ${esc(NPCS[def.giver].name)} para aceitar.</p>` : ''}
      <h3>Recompensas</h3><div class="rws">${rewardsHtml(G, def.rewards)}</div>
      ${(s === 'active' || s === 'ready') && Q.tracked !== id ? `<div class="row"><button class="btn" data-a="j:track" data-q="${id}">Rastrear no mapa</button></div>` : ''}`;
  }
  return `<div class="qlist">${list}</div><div class="qdet">${det}</div>`;
}

function mapTab(ui) {
  const ev = ui.G.events?.active;
  return `<div class="mapwrap"><canvas class="fullmap"></canvas><div class="mapzoom"><button data-a="j:mz" data-z="in" title="Aproximar">+</button><button data-a="j:mz" data-z="out" title="Afastar">−</button><button data-a="j:mz" data-z="me" title="Centralizar em você">◎</button></div><small class="maphint">Arraste para mover · pinça ou +/− para zoom</small>${ev ? `<div class="mapev">✦ ${esc(ev.title || 'Evento ativo')}${ev.status ? ` · ${esc(ev.status)}` : ''}</div>` : ''}</div>
    <div class="legend"><span><i style="background:#fff"></i>Você</span><span><i style="background:#ffe9a8"></i>NPC</span><span><b style="color:#ffd36b">◆</b> Objetivo</span><span><b style="color:#e7a6ff">✦</b> Evento</span><span><b style="color:#ff6b8a">☠</b> Chefe</span><span><i style="background:#5ef0ff"></i>Jogadores</span><span><i style="background:#ffb04a"></i>Masmorra</span><span><b style="color:#ff6b5a">⚔</b> Hunt (farm)</span></div>`;
}

function bestiary(ui) {
  const G = ui.G, known = G.state.world.bestiary, kills = G.state.player.stats.kills;
  // em ordem de nível (cada monstro tem nível fixo, como no Rucoy)
  const order = ['slime', 'goblin', 'goblin_atirador', 'wolf', 'alpha_wolf', 'skeleton', 'couraco', 'rajado', 'vigia', 'guardian', 'boss_fenda'];
  if (!ui.bsel || (ui.bsel !== '__log' && !known.includes(ui.bsel))) ui.bsel = order.find((id) => known.includes(id)) || '__log';
  const list = order.map((id) => {
    const e = ENEMIES[id];
    if (!known.includes(id)) return `<div class="bitem unknown">???</div>`;
    return `<div class="bitem ${ui.bsel === id ? 'sel' : ''}" data-a="j:bsel" data-b="${id}"><b${tintOf(e) ? ` style="color:${tintOf(e)}"` : ''}>${esc(e.name)}</b><small>Nv ${MOB_LEVELS[id] ?? (e.boss ? BOSS.level : '')} · ${kills[id] || 0}</small></div>`;
  }).join('') + `<div class="bitem log ${ui.bsel === '__log' ? 'sel' : ''}" data-a="j:bsel" data-b="__log"><b>★ Diário de saques raros</b></div>`;
  let det = '';
  if (ui.bsel === '__log') {
    const log = G.state.world.lootLog.slice(0, 14).map((l) => `<div class="ll"><b style="color:${RARITIES[RARITY_INDEX[l.rarity]].color}">${esc(l.name)}</b><small>${esc(l.src || '')} · ${new Date(l.t).toLocaleDateString('pt-BR')}</small></div>`).join('');
    det = `<h2>Diário de saques raros</h2>${log || '<p class="muted">Itens Raros ou melhores aparecerão aqui.</p>'}`;
  } else {
    const id = ui.bsel, e = ENEMIES[id];
    const loot = lootTableSummary(e.loot, id, e, MOB_LEVELS[id] ?? (e.boss ? BOSS.level : null), G.state.player.level).map((r) => {
      if (r.rarities) return `<div class="lr"><span>${esc(r.label)}</span><b>${pct(r.chance)}</b><div class="rarbar">${r.rarities.map((x) => `<i style="flex:${x.p};background:${RARITIES[RARITY_INDEX[x.id]].color}" title="${RARITIES[RARITY_INDEX[x.id]].name}: ${pct(x.p)}"></i>`).join('')}</div><small>${r.rarities.map((x) => `${RARITIES[RARITY_INDEX[x.id]].name} ${pct(x.p)}`).join(' · ')}</small></div>`;
      return `<div class="lr"><span style="color:${r.color || 'inherit'}">${esc(r.label)}</span><b>${pct(r.chance)}${r.boost ? ` <small>(${pct(r.boost)} com missão)</small>` : ''}</b></div>`;
    }).join('');
    det = `<div class="bh"><h2${tintOf(e) ? ` style="color:${tintOf(e)}"` : ''}>${esc(e.name)}</h2><span>${e.elite ? '<em>Elite</em>' : ''}${e.rare ? '<em>Raro</em>' : ''}${e.boss ? '<em>Chefe</em>' : ''}</span><small>Nível ${MOB_LEVELS[id] ?? (e.boss ? BOSS.level : '?')} · Derrotados: ${kills[id] || 0}</small></div>
      <p class="muted">${esc(e.behavior)}</p><div class="loot"><div class="lh">Tabela de saque (probabilidades reais)</div>${loot}</div>`;
  }
  return `<div class="blist">${list}</div><div class="bdet">${det}</div>`;
}

export function skinThumb(id, g) { return `<img class="skth" src="chars/thumb/${id}_${g}.jpg?v=${VERSION}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`; }
function swatch(kind, def, id, g) {
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  if (def.hero) return skinThumb(id, g);
  if (kind === 'skin') {
    const c = def.colors;
    return c ? `<span class="sw" style="background:${hex(c.tunic)}"></span><span class="sw" style="background:${hex(c.cape)}"></span><span class="sw" style="background:${hex(c.trim)}"></span>` : '<span class="sw def">✦</span>';
  }
  return def.color ? def.color.map((n) => `<span class="sw dot" style="background:${hex(n)};box-shadow:0 0 10px ${hex(n)}"></span>`).join('') : '<span class="sw def">—</span>';
}

function appearance(ui) {
  const G = ui.G, C = G.cosmetics;
  const section = (kind, title) => {
    const g = C.gender();
    const cards = Object.entries(COSMETIC_SETS[kind]).filter(([, d]) => C.fits(d)).map(([id, d]) => {
      const un = C.isUnlocked(d), on = C.equipped(kind) === id, prem = d.unlock.type === 'premium', base = !un && C.needsBase?.(d);
      let action;
      if (on) action = '<span class="eqd">Em uso</span>';
      else if (un) action = `<button class="btn sm" data-a="j:cos" data-k="${kind}" data-id="${id}">Usar</button>`;
      else if (prem) action = `<button class="btn sm primary" data-a="j:buy" data-sku="${d.unlock.sku}" ${base ? 'disabled' : ''}>💎${DIAMONDS.prices[d.unlock.sku] || '?'}</button>`;
      else action = `<span class="lockt">${ICONS.cadeado}</span>`;
      const nm = (g === 'F' && d.nameF) || d.name;
      return `<div class="cos ${on ? 'on' : ''} ${un ? '' : 'locked'} ${prem ? 'prem' : ''}">
        <div class="cossw">${swatch(kind, d, id, g)}</div>
        <div class="cosinfo"><b>${esc(nm)}${prem ? ' <em>Premium</em>' : ''}</b><small>${esc(d.hero ? (base ? `Precisa: ${(g === 'F' && base.nameF) || base.name}` : d.desc) : un ? d.desc : C.lockText(d))}</small></div>${action}</div>`;
    }).join('');
    return `${title ? `<h3>${title}</h3>` : ''}<div class="cosgrid ${kind === 'skin' ? 'sk' : ''}">${cards}</div>`;
  };
  const ach = Object.entries(ACHIEVEMENTS).map(([id, a]) => {
    const got = C.data.achievements.includes(id);
    const un = C.unlocksFor(id).map((u) => u.name).join(', ');
    return `<div class="ach ${got ? 'got' : ''}"><b>${got ? '★' : '☆'} ${esc(a.name)}</b><small>${esc(a.desc)}${un ? ` · Libera: ${esc(un)}` : ''}</small></div>`;
  }).join('');
  const support = MONETIZATION.supportUrl
    ? `<div class="support"><a class="btn primary" href="${esc(MONETIZATION.supportUrl)}" target="_blank" rel="noopener">${esc(MONETIZATION.supportLabel)}</a><span>${esc(MONETIZATION.supportNote)}</span><small>${esc(MONETIZATION.supportUrl)}</small></div>` : '';
  const subs = [['skin', 'Visual'], ['fx', 'Efeito da arma'], ['ach', `Conquistas ${C.data.achievements.length}/${Object.keys(ACHIEVEMENTS).length}`]];
  const sub = ui.cosTab && (ui.cosTab === 'ach' || COSMETIC_SETS[ui.cosTab]) ? ui.cosTab : 'skin';
  const subtabs = subs.map(([id, n]) => `<button class="btn sm ${id === sub ? 'primary' : ''}" data-a="j:costab" data-t="${id}">${n}</button>`).join('');
  const body = sub === 'ach' ? `<div class="achgrid">${ach}</div>` : section(sub, '');
  const E = G.economy, dbal = E?.online() && E.diamondsReady ? E.diamonds().toLocaleString('pt-BR') : '—';
  return `<div class="coshead"><div class="cossub">${subtabs}<button class="btn sm dbtn" data-a="diamonds">💎 ${dbal} · Loja de Diamantes</button></div><div class="cosnote">Tudo aqui é <b>apenas visual</b>: não muda atributos nem dano.</div></div>
    ${support}<div class="cosbody">${body}</div>`;
}

// ---------- cliques ----------
export function journalClick(ui, a, el) {
  const G = ui.G, sp = G.state.player;
  switch (a) {
    case 'mz': {
      const M = ui.map, z = el.dataset.z;
      if (z === 'in') M.zoomFull(1.4); else if (z === 'out') M.zoomFull(1 / 1.4); else M.centerFull();
      const c = ui.el.journal.querySelector('canvas.fullmap'); if (c) M.drawFull(c.getContext('2d'), c.width, c.height);
      break;
    }
    case 'tab': if (el.dataset.tab === 'map') ui.map.view = null; ui.journalTab = el.dataset.tab; ui.sel = null; ui.renderJournal(); G.bus.emit('panel', el.dataset.tab); G.audio.play('ui'); break;
    case 'close': ui.closeJournal(); break;
    case 'desel': ui.sel = null; ui.confirmDrop = null; ui.renderJournal(); break;
    case 'noop': break;
    case 'pg': ui.pg = ui.pg || {}; ui.pg[el.dataset.k] = +el.dataset.p; ui.renderJournal(); G.audio.play('ui'); break;
    case 'emotes': ui.closeJournal(); ui.toggleEmotes(true); break;
    case 'pause': ui.closeJournal(); ui.openModal('pause'); break;
    case 'gm': ui.closeJournal(); import('../game/gm.js').then((GM) => GM.openGmPanel(G)); break;
    case 'sel': {
      ui.confirmDrop = null;
      // tocar de novo no item já selecionado equipa direto
      const again = !el.dataset.slot && ui.sel?.src === 'inv' && ui.sel.i === +el.dataset.i && G.time.t - (ui.selAt || 0) < 1.2;
      const it0 = !el.dataset.slot ? G.inv.slots[+el.dataset.i] : null;
      ui.selAt = G.time.t;
      if (again && it0?.kind === 'equip' && !equipBlockReason(sp, it0)) return journalClick(ui, 'equip', el);
      ui.sel = el.dataset.slot ? { src: 'eq', slot: el.dataset.slot } : { src: 'inv', i: +el.dataset.i };
      ui.renderJournal();
      break;
    }
    case 'equip': {
      const r = equipFromInventory(sp, G.inv, ui.sel.i);
      if (!r.ok) { ui.toastSmall(r.reason); G.audio.play('error'); break; }
      G.player.recompute();
      G.audio.play('loot', { rarity: RARITY_INDEX[r.item.rarity] || 0 });
      ui.toastSmall('Equipado: ' + displayName(r.item));
      ui.sel = null; // fecha a janela do item
      G.saver.requestSave('equipar');
      ui.refreshPanels();
      break;
    }
    case 'unequip': {
      const r = unequipToInventory(sp, G.inv, ui.sel.slot);
      if (!r.ok) { ui.toastSmall(r.reason); break; }
      G.player.recompute();
      ui.sel = null; ui.refreshPanels();
      break;
    }
    case 'use': {
      const it = G.inv.slots[ui.sel.i];
      if (it?.id === 'cavalo_criador' || it?.id === 'lobo_criacao') { G.player.toggleMount(); ui.closeJournal?.(); break; }
      if (it?.id === 'pergaminho_tp') { ui.closeJournal?.(); G.teleports.open({ scroll: true }); break; }
      if (it) G.usePotion(it.id);
      ui.refreshPanels();
      break;
    }
    case 'drop': {
      const it = G.inv.slots[ui.sel.i];
      if (!it || noTrade(it)) break; // chaves, itens únicos e prêmios presos ao personagem não podem ser largados
      if (ui.confirmDrop !== it.uid) { ui.confirmDrop = it.uid; ui.renderJournal(); break; }
      const gone = G.inv.removeAt(ui.sel.i) || it;
      G.loot.dropFromBag(gone); // não some: cai no chão (você ou outro jogador pode pegar)
      ui.confirmDrop = null; ui.sel = null;
      G.questEvent({ type: 'inventory' });
      ui.toastSmall('Item largado no chão. Afaste-se e volte para pegar de novo.', 4);
      ui.refreshPanels();
      break;
    }
    case 'sort': G.inv.sort(); ui.sel = null; ui.renderJournal(); break;
    case 'attr': {
      if (sp.freePoints <= 0) break;
      sp.freePoints--; sp.attrs[el.dataset.k]++;
      G.player.recompute();
      G.audio.play('ui');
      ui.renderJournal(); ui.refreshHud();
      G.saver.requestSave('atributo');
      break;
    }
    case 'respec': {
      const cost = 20 * sp.level;
      if (sp.gold < cost) { ui.toastSmall('Ouro insuficiente.'); G.audio.play('error'); break; }
      sp.gold -= cost;
      const n = Object.values(sp.attrs).reduce((x, y) => x + y, 0);
      sp.attrs = { for: 0, agi: 0, int: 0, vit: 0 };
      sp.freePoints += n;
      G.player.recompute();
      ui.renderJournal(); ui.refreshHud();
      break;
    }
    case 'qsel': ui.qsel = el.dataset.q; ui.renderJournal(); break;
    case 'bsel': ui.bsel = el.dataset.b; ui.renderJournal(); break;
    case 'costab': ui.cosTab = el.dataset.t; ui.renderJournal(); break;
    case 'track': G.quests.tracked = el.dataset.q; G.onQuestChanged(); ui.renderJournal(); break;
    case 'cos':
      if (G.cosmetics.equip(el.dataset.k, el.dataset.id)) { G.audio.play('loot', { rarity: 2 }); ui.renderJournal(); }
      break;
    case 'buy':
      G.cosmetics.purchase(el.dataset.sku).then((r) => { ui.toastSmall(r.ok ? 'Comprado com diamantes! Já pode usar.' : r.reason || 'Compra não concluída.', 4); ui.renderJournal(); });
      break;
    default: break;
  }
}
