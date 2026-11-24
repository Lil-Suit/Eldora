// =============================================================
// ELDORIA — Conferência de itens (v0.12, pacote 2). Usada pelo SERVIDOR (save, mercado e troca) e pelos testes.
// IMPOSSÍVEL: item fora do catálogo, raridade que não existe, peça no lugar errado, nível acima do possível,
// set que não existe, peça de set acima do teto dele, item antigo (set de monstro) fora da troca, números fora da regra.
// Save: o que dá para consertar vira o MÁXIMO POSSÍVEL; o que não dá fica RETIDO (guardado, sem uso) para o GM ver.
// Mercado e troca: qualquer coisa impossível é recusada (nada é consertado no meio do caminho).
// =============================================================
import { ITEM_BASES, NAMED_ITEMS, ITEM_SETS, CONSUMABLES, MATERIALS, QUEST_ITEMS, LOOT_TABLES, EQUIP_SLOTS } from '../config/items.js';
import { RARITY_INDEX, RARITY_WEIGHTS, rarityBand, UPGRADE, BALANCE } from '../config/balance.js';
import { BIOME_SETS } from '../config/biomas.js';
import { MOB_LEVELS } from '../config/moblevels.js';
import { ENEMIES } from '../config/enemies.js';
import { NATAL } from '../config/seasonal.js';
import { solidify, scaleNamed, canonicalName, convertOldItem } from './items.js';

// nível de item mais alto que existe: o monstro mais forte + 3 (campeão do bioma) + 1 (elite)
export const ILVL_MAX = Math.max(...Object.values(MOB_LEVELS)) + 4;

// fundo mais alto que cada set pode ter (pelas tabelas de raridade dos monstros da família). Branco sorteado vira item
// com nome, então peça de set nunca nasce branca (só as que vieram da troca dos itens antigos, marcadas com `conv`).
const top = (w) => Object.keys(w || {}).filter((k) => w[k] > 0).reduce((a, k) => (RARITY_INDEX[k] > RARITY_INDEX[a] ? k : a), 'comum');
export const SET_MAX_RARITY = {};
for (const [b, S] of Object.entries(BIOME_SETS)) {
  let best = 'comum';
  for (const type of Object.keys(S.fam)) {
    const t = LOOT_TABLES[ENEMIES[type]?.loot]; if (!t?.item) continue;
    const k = top(RARITY_WEIGHTS[t.item.tier]?.[rarityBand(MOB_LEVELS[type] ?? S.levels[1]).id]);
    if (RARITY_INDEX[k] > RARITY_INDEX[best]) best = k;
  }
  SET_MAX_RARITY[b] = RARITY_INDEX[best] > RARITY_INDEX.mitico ? 'mitico' : best;
}
// fundos possíveis das peças natalinas: chefe dá azul para cima (o verde sorteado vira azul); roxo só pelo GM
const NATAL_OK = new Set(['raro', 'epico', ...Object.keys(NATAL.raridades || {}).filter((k) => RARITY_INDEX[k] > RARITY_INDEX.raro)]);

const STACK_MAX = (it, def) => def.stack || BALANCE.stack[it.kind] || 1;
const isInt = (v) => Number.isInteger(+v) && Number.isFinite(+v);

// devolve { ok, problems: [códigos], fix: dá para consertar?, item }
// modos: 'save' (item antigo é aceito: vai ser trocado), 'market' e 'trade' (tudo tem que estar certo)
export function checkItem(raw, { mode = 'save' } = {}) {
  let it = raw;
  if (typeof it === 'string') { if (it.length > 6000) return { ok: false, problems: ['formato'], fix: false, item: null }; try { it = JSON.parse(it); } catch { return { ok: false, problems: ['formato'], fix: false, item: null }; } }
  if (!it || typeof it !== 'object' || Array.isArray(it)) return { ok: false, problems: ['formato'], fix: false, item: null };
  const P = [], hard = [];
  if (it.retido) (mode === 'save' ? P : hard).push('retido');
  if (it.kind === 'consumable' || it.kind === 'material' || it.kind === 'quest') {
    const def = it.kind === 'consumable' ? CONSUMABLES[it.id] : it.kind === 'material' ? MATERIALS[it.id] : QUEST_ITEMS[it.id];
    if (!def) hard.push('desconhecido');
    else if (!isInt(it.qty) || +it.qty < 1 || +it.qty > STACK_MAX(it, def)) P.push('quantidade');
    return done(P, hard, it, mode);
  }
  if (it.kind !== 'equip') return { ok: false, problems: ['formato'], fix: false, item: it };
  const base = it.named ? null : ITEM_BASES[it.base], named = it.named ? NAMED_ITEMS[it.named] : null;
  if (it.named ? !named : !base) hard.push('desconhecido');
  if (RARITY_INDEX[it.rarity] === undefined) hard.push('raridade');
  if (!EQUIP_SLOTS.includes(it.slot)) hard.push('slot');
  if (hard.length) return done(P, hard, it, mode);
  // peça no lugar certo e do tipo certo
  const want = named || base;
  if (it.slot !== want.slot || (want.kind && it.wkind && it.wkind !== want.kind && !(it.wkind === 'chapeu' && want.kind === 'tiara'))) P.push('slot');
  if (named && it.rarity !== named.rarity) P.push('raridade_alta');
  // nível do item
  if (!isInt(it.ilvl) || +it.ilvl < 1 || +it.ilvl > ILVL_MAX) P.push('nivel');
  if (it.up != null && (!isInt(it.up) || +it.up < 0 || +it.up > UPGRADE.maxLevel)) P.push('melhoria');
  // conjuntos de chefe (Prece / Natal)
  if (it.set && (!ITEM_SETS[it.set] || base?.set !== it.set)) hard.push('set');
  if (base?.set === 'natal' && !NATAL_OK.has(it.rarity)) P.push('raridade_alta'); // (natal sem fundo/verde: não existe)
  // set do bioma
  if (it.bset) {
    const S = BIOME_SETS[it.bset];
    if (!S || named || base?.set) hard.push('set');
    else {
      if (+it.ilvl > S.levels[1]) P.push('nivel');
      if (!it.conv && RARITY_INDEX[it.rarity] > RARITY_INDEX[SET_MAX_RARITY[it.bset]]) P.push('raridade_alta');
    }
  }
  // item antigo (set de monstro): no save ele é trocado; no mercado/troca não passa
  if (it.src && !it.bset && !named && !base?.set) (mode === 'save' ? P : hard).push('set_antigo');
  return done(P, hard, it, mode);
}
function done(P, hard, it, mode) {
  const problems = [...new Set([...hard, ...P])];
  // mercado/troca: nada é consertado no caminho
  return { ok: !problems.length, problems, fix: !hard.length && mode === 'save', item: it };
}

// conserta o que dá: vira o MÁXIMO POSSÍVEL (nível no teto, fundo no teto do set, peça no lugar certo, melhoria no máximo)
export function fixItem(it, problems = checkItem(it).problems) {
  if (!it) return it;
  if (it.kind !== 'equip') { const def = CONSUMABLES[it.id] || MATERIALS[it.id] || QUEST_ITEMS[it.id]; if (def) it.qty = Math.max(1, Math.min(STACK_MAX(it, def), Math.floor(+it.qty) || 1)); return it; }
  const named = it.named ? NAMED_ITEMS[it.named] : null, base = named ? null : ITEM_BASES[it.base];
  if (problems.includes('set_antigo')) convertOldItem(it);
  if (problems.includes('slot')) { it.slot = (named || base).slot; it.wkind = (named || base).kind; }
  if (problems.includes('nivel')) it.ilvl = Math.max(1, Math.min(it.bset ? BIOME_SETS[it.bset].levels[1] : ILVL_MAX, Math.floor(+it.ilvl) || 1));
  if (problems.includes('melhoria')) it.up = Math.max(0, Math.min(UPGRADE.maxLevel, Math.floor(+it.up) || 0));
  if (problems.includes('raridade_alta')) it.rarity = named ? named.rarity : base?.set === 'natal' ? 'raro' : SET_MAX_RARITY[it.bset] || it.rarity;
  if (it.reqLevel > it.ilvl) it.reqLevel = Math.max(1, it.ilvl - 1);
  if (named) scaleNamed(it, it.ilvl); else solidify(it);
  it.name = canonicalName(it);
  return it;
}

// todos os itens de um personagem, com onde estão (bolsa, equipado, cofre)
export function itemRefs(p) {
  const out = [];
  if (Array.isArray(p?.inventory)) p.inventory.forEach((it, i) => { if (it) out.push({ where: 'bolsa', i, it }); });
  if (p?.equipment && typeof p.equipment === 'object') for (const [k, it] of Object.entries(p.equipment)) if (it) out.push({ where: 'equipado', i: k, it });
  if (Array.isArray(p?.vault)) p.vault.forEach((it, i) => { if (it) out.push({ where: 'cofre', i, it }); });
  return out;
}
// chave curta e fixa de um item (registro da troca no servidor)
export function uidKey(uid) { let h = 2166136261; for (const c of String(uid || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const isOldItem = (it) => !!(it && it.kind === 'equip' && it.src && !it.bset && !it.named && !ITEM_BASES[it.base]?.set);
export { convertOldItem };
