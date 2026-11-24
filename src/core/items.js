import { RARITIES, RARITY_INDEX, RARITY_WEIGHTS, RARITY_GAP, rarityBand, UPGRADE, ITEM_SCALE, FORGED, DROP_LEVEL_CAP, BALANCE } from '../config/balance.js';
import {
  ITEM_BASES, AFFIXES, NAMED_ITEMS, MATERIALS, CONSUMABLES, QUEST_ITEMS, ITEM_SETS,
  LOOT_TABLES, CLASS_LEGENDARIES, ITEM_CLASS_BIAS, SLOT_NAMES, TROPHY_OF, EQUIP_SLOTS, SLOT_DROP_WEIGHTS,
} from '../config/items.js';
import { CLASSES } from '../config/classes.js';
import { MOB_LEVELS } from '../config/moblevels.js';
import { themedItemName } from '../config/itemthemes.js';
import { BIOME_SETS, SET_RULES, PIECE_SLOTS, PIECE_NAMES, biomeOfMob, favPiece, legacyBiome, setPieceName } from '../config/biomas.js';

let uidSeq = 0;
export function newUid(rng) {
  uidSeq = (uidSeq + 1) % 1e6;
  return Date.now().toString(36) + uidSeq.toString(36) + Math.floor(rng.next() * 1e8).toString(36);
}

// Item que veio de outro jogador (troca, mercado): confere o formato e devolve uma cópia limpa, ou null.
// Itens de missão não passam (são de quem fez a missão).
// item PRESO à alma: chaves/itens de missão e itens únicos (ex.: Anel da Aurora) não podem ser vendidos, largados nem trocados
// v0.9.78: Elmo → Capacete, Tiara → Chapéu (mago), Grevas → Calça
export function renameOldGear(it) {
  if (!it || it.kind !== 'equip') return it;
  if (typeof it.name === 'string') it.name = it.name.replace(/Tiara Rúnica/g, 'Chapéu Rúnico').replace(/Grevas de Ferro/g, 'Calça de Ferro').replace(/\bElmo\b/g, 'Capacete').replace(/\bTiara\b/g, 'Chapéu').replace(/\bGrevas\b/g, 'Calça');
  if (it.wkind === 'tiara') it.wkind = 'chapeu';
  if (it.wkind === 'grevas') it.wkind = 'calca';
  return it;
}
// atributos (FOR, AGI, crítico…) só valem em itens de chefe; nos outros, só ataque/defesa
export function statsAllowed(it) { return !!it?.boss; }
export function isBound(e) { return !!e && (e.kind === 'quest' || !!e.bound || !!e.retido || (e.kind === 'consumable' && !!CONSUMABLES[e.id]?.bound) || (e.kind === 'equip' && !!e.named && !!NAMED_ITEMS[e.named]?.unique)); }
// "preso ao personagem" (soul): prêmios de baú do mapa, de missão e do baú diário. Vende no Mercador, mas não troca,
// não vai ao mercado, não se larga e não cai no PvP (ninguém farma baú com personagem novo para vender).
export function isSoul(e) { return !!e && !!e.soul; }
export function noTrade(e) { return isBound(e) || isSoul(e); }
export function tradable(e) { return !!e && !noTrade(e) && (e.kind === 'equip' || e.kind === 'material' || e.kind === 'consumable'); }
export function sanitizeEntry(raw, rng) {
  let e = raw;
  if (typeof e === 'string') { if (e.length > 6000) return null; try { e = JSON.parse(e); } catch { return null; } }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : null);
  if (e.kind === 'consumable' || e.kind === 'material') {
    if (stackKindOf(e.id) !== e.kind) return null;
    const q = Math.floor(num(e.qty, 1, stackDef(e)?.stack || BALANCE.stack[e.kind] || 1) || 1);
    return { uid: newUid(rng), kind: e.kind, id: e.id, qty: q };
  }
  if (e.kind !== 'equip') return null;
  if (e.named ? !NAMED_ITEMS[e.named] : !ITEM_BASES[e.base]) return null;
  if (RARITY_INDEX[e.rarity] === undefined || !EQUIP_SLOTS.includes(e.slot)) return null;
  const out = {};
  if (e.retido) return null; // retido pelo servidor (aguardando o GM): não passa de mão em mão
  for (const k of ['kind', 'base', 'named', 'slot', 'wkind', 'cls', 'rarity', 'forged', 'effect', 'effectText', 'lore', 'name', 'src', 'set', 'bset', 'conv']) {
    if (e[k] == null) continue;
    if (typeof e[k] !== 'string' || e[k].length > 200) return null;
    out[k] = e[k];
  }
  for (const k of ['ilvl', 'reqLevel', 'atk', 'def', 'spd', 'up', 'cap', 'lure']) {
    if (e[k] == null) continue;
    const v = num(e[k], 0, 100000); if (v === null) return null; out[k] = v;
  }
  out.affixes = {};
  if (e.affixes && typeof e.affixes === 'object') for (const [k, v] of Object.entries(e.affixes)) { if (!AFFIXES[k]) return null; const n = num(v, -1000, 100000); if (n === null) return null; out.affixes[k] = n; }
  if (e.unique) out.unique = true;
  if (out.bset && (!BIOME_SETS[out.bset] || out.named || ITEM_BASES[out.base]?.set)) return null; // set que não existe
  if (!out.named && out.slot !== ITEM_BASES[out.base].slot) return null; // peça trocada de lugar (capacete no espaço da arma…)
  if (out.named && (out.slot !== NAMED_ITEMS[out.named].slot || out.rarity !== NAMED_ITEMS[out.named].rarity)) return null;
  out.uid = newUid(rng);
  if (out.named) { scaleNamed(out, out.ilvl); out.name = canonicalName(out); return out; } // itens com nome: números do jogo
  renameOldGear(out);
  convertOldItem(out); // item antigo (set de monstro) vindo de troca/mercado: vira a peça do set do bioma
  solidify(out); // atributos fixos: ninguém recebe item 'turbinado' por troca
  out.name = canonicalName(out); // e nem nome inventado
  return out;
}

// ---------- v0.12 (pacote 2): sets por BIOMA ----------
// Nome que o jogo daria ao item (o servidor e a troca usam este, nunca o que veio de fora)
export function canonicalName(it) {
  if (!it || it.kind !== 'equip') return it?.name;
  if (it.named) return NAMED_ITEMS[it.named]?.name || it.name;
  const base = ITEM_BASES[it.base]; if (!base) return it.name;
  if (it.bset) return setPieceName(it);
  if (base.set) return base.name;
  let n = rolledName(base, it.rarity, Object.keys(it.affixes || {})[0] || null);
  if (it.forged && base.slot !== 'shield' && base.slot !== 'back') n += ' da Fenda';
  return n;
}
// Item antigo de "set de monstro" (it.src) vira a peça do set do bioma de onde ele vinha: MESMO fundo, MESMA peça,
// MESMO nível e os mesmos atributos (nada some). `conv` guarda o monstro de origem (o servidor registra a troca).
// Conjuntos de chefe (Prece/Natal) não eram sets de monstro: ficam como são, só voltam ao nome da peça.
export function convertOldItem(it) {
  if (!it || it.kind !== 'equip' || it.named) return false;
  if (it.set) { if (!it.src) return false; delete it.src; if (ITEM_BASES[it.base]) it.name = ITEM_BASES[it.base].name; return true; }
  if (it.bset || !it.src) return false;
  const b = legacyBiome(it.src, it.ilvl);
  it.conv = String(it.src).slice(0, 40);
  delete it.src;
  it.bset = b;
  it.name = setPieceName(it);
  return true;
}
// troca todos os itens de um personagem (bolsa, equipados e cofre); devolve quantos mudaram
export function convertSaveItems(p) {
  if (!p || typeof p !== 'object') return 0;
  let n = 0;
  const all = [...(Array.isArray(p.inventory) ? p.inventory : []), ...Object.values(p.equipment && typeof p.equipment === 'object' ? p.equipment : {}), ...(Array.isArray(p.vault) ? p.vault : [])];
  for (const it of all) if (convertOldItem(it)) n++;
  return n;
}
// peça do set: a FAVORITA do monstro fica com SET_RULES.fav do sorteio; as outras dividem o resto
// (arma continua a mais difícil entre as que não são favoritas)
export function setSlotWeights(src) {
  const fav = favPiece(src), favSlots = fav ? PIECE_SLOTS[fav] : [];
  const w = weaponLowest({ ...SLOT_DROP_WEIGHTS, ring: 0, neck: 0 });
  let tot = 0; for (const k in w) if (!favSlots.includes(k)) tot += w[k];
  const out = {};
  for (const k in w) out[k] = favSlots.includes(k) ? SET_RULES.fav / favSlots.length : ((fav ? 1 - SET_RULES.fav : 1) * w[k]) / tot;
  return out;
}
export function makeSetPiece(it, b) {
  if (!it || !BIOME_SETS[b]) return it;
  it.bset = b; delete it.src;
  it.name = setPieceName(it);
  return it;
}

// ---------- Pilhas (consumíveis, materiais, itens de missão) ----------
export function stackKindOf(id) {
  if (CONSUMABLES[id]) return 'consumable';
  if (MATERIALS[id]) return 'material';
  if (QUEST_ITEMS[id]) return 'quest';
  return null;
}
export function makeStack(id, qty, rng) {
  const kind = stackKindOf(id);
  if (!kind) throw new Error('Item desconhecido: ' + id);
  return { uid: newUid(rng), kind, id, qty };
}
export function stackDef(entry) {
  return CONSUMABLES[entry.id] || MATERIALS[entry.id] || QUEST_ITEMS[entry.id];
}

// ---------- Equipamentos ----------
const EPIC_WORD = 'Ancestral';
const LEG_WORD = 'Primordial';

// =============================================================
// ATRIBUTOS FIXOS (estilo Rucoy): o mesmo item com o mesmo fundo (raridade) do mesmo monstro é SEMPRE igual.
// - "patamar" = a posição do monstro na escada de níveis (slime, goblin, lobo, …): cada monstro mais forte sobe um patamar;
// - pontos = patamar + raridade + 1: cada monstro mais forte +1 ponto, cada fundo +1 ponto;
// - ARMA: 2 de ataque por ponto (slime: comum 2 · verde 4 · azul 6 · roxo 8 · amarelo 10; goblin: comum 4 …);
// - DEFESA (elmo, peitoral, calça, luvas, botas, escudo): 4 por ponto (slime: comum 4 · verde 8 · azul 12 …);
// - peças de defesa não dão vida; afixos também fixos (mesmos afixos e valores).
// =============================================================
export const ITEM_TIERS = [...new Set(Object.values(MOB_LEVELS))].sort((a, b) => a - b);
export function itemTier(ilvl) { let t = 0; for (let i = 0; i < ITEM_TIERS.length; i++) if (ITEM_TIERS[i] <= ilvl) t = i; return t; }
export function tierLevel(t) { return ITEM_TIERS[Math.max(0, Math.min(ITEM_TIERS.length - 1, t))]; }
// Pontos do item = (patamar do nível + 1 [+1 forjado]) × força da raridade + bônus da raridade.
// Antes a raridade só somava +1 por degrau: no nível alto um Mítico valia quase o mesmo que um Comum.
// Agora a raridade MULTIPLICA (Mítico ≈ +45% sobre o Comum no topo), e no começo continua fazendo diferença.
export const RARITY_POWER = { comum: 1.0, incomum: 1.08, raro: 1.16, epico: 1.26, mitico: 1.38, lendario: 1.5 };
export function itemPoints(ilvl, rarity, forged) { return Math.round((itemTier(ilvl) + 1 + (forged ? 1 : 0)) * (RARITY_POWER[rarity] || 1)) + (RARITY_INDEX[rarity] || 0); }
// defesa por ponto: as peças de defesa dão 4 por ponto; as LUVAS sobem de 1 em 1 (cada uma), senão davam defesa demais
// (a arma dá 2 de ataque por ponto)
export const DEF_PER_POINT = { chest: 4, helm: 4, shield: 4, legs: 4, gloveL: 1, gloveR: 1, boots: 4, ring: 0, neck: 0 };
const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function affixValue(key, ilvl, mult) {
  const a = AFFIXES[key];
  let v = (a.a + a.b * ilvl) * mult;
  if (a.cap) v = Math.min(a.cap, v);
  return a.int ? Math.max(1, Math.round(v)) : Math.round(v * 10) / 10;
}

// recalcula os atributos de um item comum (não nomeado) pela regra fixa — usado ao criar e para itens antigos
export function solidify(item) {
  if (!item || item.kind !== 'equip' || item.named) return item;
  const base = ITEM_BASES[item.base]; if (!base) return item;
  const r = RARITIES[RARITY_INDEX[item.rarity]] || RARITIES[0];
  const forged = !!item.forged;
  const T = itemTier(item.ilvl || 1), lv = tierLevel(T), pts = itemPoints(item.ilvl || 1, item.rarity, forged);
  item.solid = 1;
  if (base.set && ITEM_SETS[base.set]) {
    // peça de conjunto de chefe: defesa reduzida, sem atributos; o poder dela é o efeito do conjunto
    const S = ITEM_SETS[base.set];
    item.set = base.set; item.boss = true; item.affixes = {};
    if (base.slot === 'back') item.cap = packCapOf(item.rarity, item.ilvl || 1, forged);
    else if (S.defMult === 1 && DEF_PER_POINT[base.slot]) item.def = pts * DEF_PER_POINT[base.slot];
    else if (DEF_PER_POINT[base.slot]) item.def = Math.max(1, Math.round(pts * DEF_PER_POINT[base.slot] * S.defMult));
    return item;
  }
  delete item.set; delete item.boss;
  if (base.slot === 'weapon') item.atk = 2 * pts;
  else if (base.slot === 'back') {
    item.cap = packCapOf(item.rarity, item.ilvl || 1, forged); item.affixes = {}; return item; // mochila só dá espaço
  } else if (DEF_PER_POINT[base.slot]) item.def = pts * DEF_PER_POINT[base.slot];
  if (base.slot === 'shield') {
    // atrair monstros: só escudos épicos, lendários ou míticos
    const L = RARITY_INDEX[item.rarity] >= RARITY_INDEX.epico ? BALANCE.shieldLure[item.rarity] : null;
    if (L) item.lure = Math.round(Math.min(BALANCE.shieldLure.max, ((L[0] + L[1]) / 2) * (forged ? 1.1 : 1)) * 100); else delete item.lure;
    item.affixes = {}; return item;
  }
  // v0.9.74: item comum (que não é de chefe) NÃO tem atributo nenhum — arma só ataque, armadura só defesa
  if (!base.boss) { item.affixes = {}; return item; }
  // afixos fixos: sempre os mesmos para a mesma peça e raridade
  // peça de uma classe não ganha o atributo principal das outras classes
  const others = base.cls ? Object.values(CLASSES).map((c) => c.primary).filter((k) => k !== CLASSES[base.cls].primary) : [];
  // peças de defesa não dão vida
  const pool = Object.keys(AFFIXES).filter((k) => !(AFFIXES[k].noWeapon && base.slot === 'weapon') && !others.includes(k) && !(k === 'hp' && base.slot !== 'weapon'));
  // atributos extras só em lendários e míticos (comum…épico: só o ataque/defesa)
  const nAff = r.affixes > 0 ? r.affixes + (base.slot === 'ring' ? 1 : 0) + (forged ? 1 : 0) : 0;
  const chosen = [];
  if (nAff > 0 && base.bonus && !(base.bonus === 'hp' && base.slot !== 'weapon')) chosen.push(base.bonus);
  if (base.cls && nAff > 0) { const prim = CLASSES[base.cls].primary; if (!chosen.includes(prim)) chosen.push(prim); }
  const h = hashStr(item.base);
  for (let i = 0; chosen.length < nAff && i < pool.length; i++) { const k = pool[(h + i * 7) % pool.length]; if (!chosen.includes(k)) chosen.push(k); }
  item.affixes = {};
  for (const k of chosen.slice(0, nAff)) item.affixes[k] = affixValue(k, lv, r.mult * (forged ? FORGED.affix : 1));
  return item;
}

export function generateEquipment({ baseId, rarity, ilvl, rng, forged = null }) {
  const base = ITEM_BASES[baseId];
  if (!base) throw new Error('Base desconhecida: ' + baseId);
  const item = {
    uid: newUid(rng), kind: 'equip', base: baseId, named: null,
    name: base.name, slot: base.slot, wkind: base.kind, cls: base.cls || null,
    rarity, ilvl, reqLevel: Math.max(1, ilvl - 1), affixes: {}, up: 0,
  };
  if (forged) { item.forged = forged; item.reqLevel = Math.max(1, ilvl - 2); }
  solidify(item);
  item.name = base.set ? base.name : rolledName(base, rarity, Object.keys(item.affixes)[0] || null);
  if (forged && !base.set && base.slot !== 'shield' && base.slot !== 'back') item.name += ' da Fenda';
  return item;
}

function rolledName(base, rarity, mainAffix) {
  const suf = mainAffix ? AFFIXES[mainAffix].suffix : '';
  switch (rarity) {
    case 'comum': return base.name;
    case 'incomum': return base.name + ' de Qualidade';
    case 'raro': return `${base.name} ${suf}`.trim();
    case 'epico': return `${base.name} ${EPIC_WORD} ${suf}`.trim();
    default: return `${base.name} ${LEG_WORD} ${suf}`.trim();
  }
}

// Itens nomeados (lendários/míticos) CRESCEM com o nível: os números do config valem para o ilvl do config;
// em ilvl maior, ataque/defesa e atributos fixos sobem pela mesma curva dos outros itens, com bônus de lendário.
export const NAMED_BONUS = 1.15;
export function scaleNamed(item, ilvl) {
  const n = NAMED_ITEMS[item.named];
  if (!n) return item;
  const L = Math.max(n.ilvl, Math.round(ilvl || n.ilvl));
  item.ilvl = L;
  const sc = ITEM_SCALE[n.slot];
  if (sc) {
    const f = (sc[0] + sc[1] * L) / (sc[0] + sc[1] * n.ilvl) * NAMED_BONUS;
    if (n.atk) item.atk = Math.round(n.atk * f);
    if (n.def) item.def = Math.round(n.def * f);
  }
  // ataque/defesa seguem a mesma regra fixa dos outros itens (a amarela de um monstro = a comum do seguinte)
  { const pts = itemPoints(L, n.rarity); if (n.atk) item.atk = 2 * pts; if (n.def && DEF_PER_POINT[n.slot]) item.def = pts * DEF_PER_POINT[n.slot]; }
  if (n.slot !== 'weapon' && item.affixes?.hp) delete item.affixes.hp; // peças de defesa não dão vida
  item.affixes = {};
  if (!n.boss) return item; // v0.9.74: lendários com nome guardam só o efeito especial (sem atributos)
  for (const [k, v] of Object.entries(n.affixes || {})) {
    const A = AFFIXES[k];
    if (A && !A.cap) item.affixes[k] = A.int ? Math.round(v * (A.a + A.b * L) / (A.a + A.b * n.ilvl)) : Math.round(v * (A.a + A.b * L) / (A.a + A.b * n.ilvl) * 10) / 10;
    else item.affixes[k] = v;
  }
  return item;
}

export function createNamed(id, rng, ilvl) {
  const n = NAMED_ITEMS[id];
  if (!n) throw new Error('Item nomeado desconhecido: ' + id);
  return scaleNamed({
    uid: newUid(rng), kind: 'equip', base: null, named: id,
    name: n.name, slot: n.slot, wkind: n.kind, cls: n.cls || null,
    rarity: n.rarity, ilvl: n.ilvl, reqLevel: n.reqLevel,
    atk: n.atk, def: n.def, spd: n.spd, affixes: { ...(n.affixes || {}) },
    effect: n.effect || null, effectText: n.effectText || null, lore: n.lore || null,
    unique: !!n.unique, up: 0,
  }, ilvl);
}

// Escolhe uma base elegível para o slot/classe/nível
export function pickBase({ slot, cls, ilvl, rng, classBias = ITEM_CLASS_BIAS }) {
  const s = slot || rng.weighted(weaponLowest({ ...SLOT_DROP_WEIGHTS }));
  let candidates = Object.keys(ITEM_BASES).filter((k) => ITEM_BASES[k].slot === s && !ITEM_BASES[k].set && ITEM_BASES[k].minIlvl <= Math.max(1, ilvl)); // peças de conjunto só caem de chefe
  if (s === 'weapon' && cls) {
    const own = candidates.filter((k) => ITEM_BASES[k].cls === cls);
    if (own.length && rng.chance(classBias)) candidates = own;
  }
  return rng.pick(candidates);
}

// Pesos de raridade de uma fonte: pela faixa de força do monstro (nunca acima do seu nível + leech) e,
// se você estiver muito acima do monstro, as cores melhores caem um pouco (o que sai delas vai para a mais simples).
export function bandLevel(level, playerLevel = null) {
  const L = Math.max(1, +level || 1), P = +playerLevel || 0;
  return P > 0 ? Math.min(L, P + RARITY_GAP.leech) : L;
}
export function gapFactor(level, playerLevel = null) {
  const P = +playerLevel || 0; if (!P) return 1;
  const gap = P - Math.max(1, +level || 1) - RARITY_GAP.free;
  return gap > 0 ? Math.max(RARITY_GAP.min, 1 - RARITY_GAP.per * gap) : 1;
}
export function applyRarityGap(weights, level, playerLevel = null) {
  const w = { ...weights }, f = gapFactor(level, playerLevel);
  if (f >= 1) return w;
  const keys = Object.keys(w).filter((k) => w[k] > 0).sort((a, b) => RARITY_INDEX[a] - RARITY_INDEX[b]);
  let moved = 0;
  for (const k of keys.slice(1)) { const v = w[k] * f; moved += w[k] - v; w[k] = v; }
  if (keys.length) w[keys[0]] += moved;
  return w;
}
export function rarityWeights(tier, level = 1, playerLevel = null) {
  const T = RARITY_WEIGHTS[tier] || RARITY_WEIGHTS.normal;
  return applyRarityGap(T[rarityBand(bandLevel(level, playerLevel)).id], level, playerLevel);
}
export function rollRarity(tier, rng, level = 1, playerLevel = null) {
  return rng.weighted(rarityWeights(tier, level, playerLevel));
}

export function rollEquipment({ rarity, ilvl, slot, cls, rng, classBias, forged }) {
  const baseId = pickBase({ slot, cls, ilvl, rng, classBias });
  return generateEquipment({ baseId, rarity, ilvl, rng, forged });
}

// Lendário rolado vira um item nomeado ainda não obtido (proteção contra duplicatas).
function legendaryOrFallback({ cls, ilvl, rng, owned, slot }) {
  const pool = Object.keys(NAMED_ITEMS).filter((k) => {
    const n = NAMED_ITEMS[k];
    return n.rarity === 'lendario' && !owned.has(k) && (!slot || n.slot === slot);
  });
  if (pool.length) {
    void cls; // igual para todas as classes: qualquer lendário pode cair
    const id = rng.pick(pool);
    return createNamed(id, rng, ilvl);
  }
  return rollEquipment({ rarity: 'epico', ilvl, slot, cls, rng, forged: 'Lendário convertido' });
}

// Arma é SEMPRE a peça mais difícil de cair (de qualquer monstro, em qualquer sorteio)
function weaponLowest(w) {
  const others = Object.entries(w).filter(([k, v]) => k !== 'weapon' && v > 0).map(([, v]) => v);
  if (others.length && w.weapon > 0) w.weapon = Math.min(w.weapon, Math.min(...others) * 0.6);
  return w;
}

// ---------- Conjunto da Prece: números ----------
// n = peças vestidas, lvl = nível médio das peças, best = índice do melhor fundo (0 comum … 5 branco)
export function preceInfo(n, lvl, best) {
  const S = ITEM_SETS.prece;
  if (!n) return null;
  return {
    n, lvl,
    radius: S.radius[Math.max(0, Math.min(S.radius.length - 1, best))],
    mult: 1, // o time recebe a MESMA cura da poção, na hora
    cost: Math.round(10 + lvl * 0.6),                  // mana gasta a cada poção que cura aliados
    manaMax: 60 + 12 * n,                              // barra de mana do conjunto (Guerreiro e Arqueiro)
    regen: Math.round((1.2 + 0.15 * n) * 10) / 10,     // mana por segundo
  };
}
export function preceOfEquipment(eq) {
  let n = 0, lv = 0, best = 0;
  for (const slot of EQUIP_SLOTS) { const it = eq?.[slot]; if (it?.set === 'prece') { n++; lv += it.ilvl || 1; best = Math.max(best, RARITY_INDEX[it.rarity] || 0); } }
  return n ? preceInfo(n, Math.round(lv / n), best) : null;
}
// ---------- Natal: congelamento ----------
// Ao acertar um inimigo, os inimigos em volta ficam mais lentos por 2 s. O quanto depende do fundo da melhor
// peça natalina (+1% por peça a mais), no máximo 25% — nunca chega perto de 50%.
// Gasta mana A CADA SEGUNDO enquanto está congelando alguém: mais fundo e mais inimigos = mais mana.
export const NATAL_SLOW = [5, 8, 10, 12, 15, 20];       // % por fundo: comum, verde, azul, roxo, vermelho, branco
export const NATAL_MANA = [2, 3, 4, 5, 6, 8];           // mana/s pelo fundo (+1 por inimigo congelado, até +8)
export function natalOfEquipment(eq) {
  let n = 0, best = 0;
  for (const slot of EQUIP_SLOTS) { const it = eq?.[slot]; if (it?.set === 'natal') { n++; best = Math.max(best, RARITY_INDEX[it.rarity] || 0); } }
  if (!n) return null;
  const pct = Math.min(25, NATAL_SLOW[best] + (n - 1));
  return { n, best, pct, k: 1 - pct / 100, radius: 4.5, dur: 2, mana: NATAL_MANA[best] };
}
// barra de mana dos conjuntos de chefe (Prece e Natal): Guerreiro e Arqueiro ganham uma; o Mago usa a dele
export function setManaOf(eq) {
  let n = 0;
  for (const slot of EQUIP_SLOTS) { const it = eq?.[slot]; if (it?.set === 'prece' || it?.set === 'natal') n++; }
  return n ? { max: 60 + 12 * n, regen: Math.round((1.2 + 0.15 * n) * 10) / 10 } : null;
}

function setEffectText(item) {
  const S = ITEM_SETS[item.set]; if (!S) return null;
  if (item.set === 'natal') {
    const b = RARITY_INDEX[item.rarity] || 0;
    return `Peça natalina (saque do Noel, do Flocos e da Rena Maligna). CONGELAMENTO: ao acertar um inimigo, os inimigos em volta (até 4,5 m) ficam ${NATAL_SLOW[b]}% mais lentos por 2 s, pelo fundo desta peça (+1% por peça natalina a mais, no máximo 25%). Gasta ${NATAL_MANA[b]} de mana por segundo enquanto congela, +1 por inimigo congelado. Vestir qualquer peça mostra a barra de mana.`;
  }
  const one = preceInfo(1, item.ilvl || 1, RARITY_INDEX[item.rarity] || 0);
  return `${S.name}: ao beber uma poção de vida, os aliados do seu TIME a até ${one.radius} m (pelo fundo desta peça) recebem na hora a MESMA cura da poção. O tônico também devolve a mesma quantidade de Mana, Energia ou Fúria para eles. Cada vez gasta ${one.cost} de mana neste nível (peças de nível maior gastam mais). Vestir qualquer peça mostra a barra de mana (o tônico também enche essa barra). Defesa 30% menor que a de uma peça comum.`;
}

// conjunto que um chefe solta (ou null)
export function setOfBoss(type) { if (!type) return null; for (const S of Object.values(ITEM_SETS)) if (S.drops[type]) return S; return null; }

// ---------- Saque ----------
// ctx: { cls, playerLevel, owned:Set (únicos já obtidos), questNeeds:Set de materiais, firstKill, src: tipo do monstro }
// v0.12: monstro de uma família solta peça do SET do bioma (SET_RULES.chance) ou item solto (o resto).

export function rollLoot(tableId, enemyLevel, ctx, rng) {
  const t = LOOT_TABLES[tableId];
  const out = { gold: 0, stacks: [], items: [] };
  if (!t) return out;
  const owned = ctx.owned || new Set();
  if (t.goldAmount) out.gold = rng.int(t.goldAmount[0], t.goldAmount[1]);
  else if (ctx.goldRange && rng.chance(t.gold)) {
    out.gold = Math.max(1, Math.round(rng.int(ctx.goldRange[0], ctx.goldRange[1]) * (1 + 0.2 * (enemyLevel - 1)) * (t.goldMult ?? 1)));
  }
  // troféu do próprio monstro
  if (ctx.trophy && rng.chance(ctx.trophy.chance)) out.stacks.push({ id: ctx.trophy.id, qty: ctx.trophy.qty ? rng.int(ctx.trophy.qty[0], ctx.trophy.qty[1]) : 1 });
  for (const d of t.drops || []) {
    const p = d.questBoost && ctx.questNeeds?.has(d.id) ? d.questBoost : d.chance;
    if (rng.chance(p)) {
      const qty = d.qty ? rng.int(d.qty[0], d.qty[1]) : 1;
      out.stacks.push({ id: d.id, qty });
    }
  }
  const it = t.item;
  // reserva o lendário de classe garantido da 1ª vitória para não ser "gasto" por um lendário sorteado
  const reserved = null && t.special && ctx.firstKill ? (CLASS_LEGENDARIES[ctx.cls] || []).find((k) => !owned.has(k)) : null;
  const ownedForRoll = reserved ? new Set([...owned, reserved]) : owned;
  if (it) {
    // chefes: ctx.slots diz quais dos itens sorteados são deste jogador (divisão pelo dano)
    const n = ctx.slots ? ctx.slots.length : (it.count || 1);
    const used = new Set();
    for (let j = 0; j < n; j++) {
      const i = ctx.slots ? ctx.slots[j] : j;
      if (!rng.chance(it.chance)) continue;
      let rarity = rollRarity(it.tier, rng, enemyLevel, ctx.playerLevel);
      const minR = (it.min || [])[i];
      if (minR && RARITY_INDEX[rarity] < RARITY_INDEX[minR]) rarity = minR;
      // chefe: no máximo 1 item muito raro (roxo ou melhor) — só o primeiro item do chefe pode ser
      if (t.bossLoot && i > 0 && RARITY_INDEX[rarity] > RARITY_INDEX.raro) rarity = 'raro';
      // chefe: item do MESMO nível do chefe (pode ser mais raro, mas chefe fraco dá item fraco)
      let ilvl = Math.max(1, enemyLevel + (it.tier === 'elite' ? 1 : 0));
      // nunca muito acima do seu nível: o item sempre pode ser equipado ao cair
      if (ctx.playerLevel) ilvl = Math.max(1, Math.min(ilvl, ctx.playerLevel + (it.forged ? DROP_LEVEL_CAP.forged : DROP_LEVEL_CAP.normal)));
      // a classe não influencia o sorteio
      const classBias = 0; // a classe não muda o que cai: as chances são iguais para todos
      // chefes do Conjunto da Prece: parte do saque vira peça do conjunto (cada chefe solta só as peças dele)
      const SET = t.bossLoot && setOfBoss(ctx.src);
      if (SET && rng.chance(SET.chance)) {
        const ss = rng.pick(SET.drops[ctx.src]);
        if (SET.rarities) rarity = rng.weighted(applyRarityGap(SET.rarities, enemyLevel, ctx.playerLevel)); // Natal: verde, vermelho e branco (os dois últimos raríssimos)
        const pc = generateEquipment({ baseId: rng.pick(SET.bases[ss]), rarity, ilvl, rng, forged: it.forged || null });
        out.items.push(pc); used.add(pc.base); continue;
      }
      if (rarity === 'lendario') { out.items.push(legendaryOrFallback({ cls: ctx.cls, ilvl, rng, owned: ownedForRoll, slot: null })); continue; }
      // peça do set do bioma (a favorita do monstro cai bem mais) ou item solto; o set nunca passa do nível máximo dele
      const bs = biomeOfMob(ctx.src), asSet = !!bs && rng.chance(SET_RULES.chance);
      const slot = asSet ? rng.weighted(setSlotWeights(ctx.src)) : null;
      const lv = asSet ? Math.min(ilvl, BIOME_SETS[bs].levels[1]) : ilvl;
      // itens diferentes no mesmo saque: tenta outra base se repetir
      let eq = rollEquipment({ rarity, ilvl: lv, slot, cls: ctx.cls, rng, classBias, forged: it.forged || null });
      for (let k = 0; k < 6 && used.has(eq.base); k++) eq = rollEquipment({ rarity, ilvl: lv, slot, cls: ctx.cls, rng, forged: it.forged || null });
      used.add(eq.base);
      if (asSet) makeSetPiece(eq, bs);
      out.items.push(eq);
    }
  }
  const sp = t.special;
  if (sp) {
    // lendário extra do chefe: sorteado entre os de TODAS as classes (mesma chance para todo mundo)
    const allLeg = Object.values(CLASS_LEGENDARIES).flat().filter((k) => !owned.has(k) && !out.items.some((x) => x.named === k));
    const classLeg = allLeg.length ? [rng.pick(allLeg)] : [];
    // o lendário extra só para quem levou algum item — e só se ainda não saiu nada roxo ou melhor (no máx. 1 muito raro)
    const won = (!ctx.slots || ctx.slots.length > 0) && !out.items.some((x) => RARITY_INDEX[x.rarity] >= RARITY_INDEX.epico);
    if (classLeg.length && won && rng.chance(sp.legendaryChance)) {
      out.items.push(createNamed(classLeg[0], rng, Math.min(enemyLevel, (ctx.playerLevel || enemyLevel) + 1)));
    }
    if (sp.mythic && won && !owned.has(sp.mythic.id) && rng.chance(sp.mythic.chance)) {
      out.items.push(createNamed(sp.mythic.id, rng, Math.min(enemyLevel, (ctx.playerLevel || enemyLevel) + 1)));
    }
  }
  return out;
}

// Chance do troféu: monstro comum ~1 em 3; elite quase sempre (1–2); campeão de evento 2–3
export function trophyChance(def) {
  if (def.eventBoss) return { chance: 1, qty: [2, 3] };
  if (def.elite || def.miniboss) return { chance: 0.6, qty: [1, 1] };
  return { chance: 0.15, qty: null };
}

// Probabilidades legíveis para o Bestiário (transparência).
export function lootTableSummary(tableId, type = null, def = null, level = null, playerLevel = null) {
  const t = LOOT_TABLES[tableId];
  const lvl = level ?? (type && MOB_LEVELS[type]) ?? 1;
  if (!t) return [];
  const rows = [];
  rows.push({ label: 'Ouro', chance: 1, color: '#ffd36b' });
  const tr = type && TROPHY_OF[type];
  if (tr) { const tc = trophyChance(def || {}); rows.push({ label: MATERIALS[tr].name + ' (troféu)', chance: tc.chance, color: MATERIALS[tr].color }); }
  for (const d of t.drops || []) {
    const def = MATERIALS[d.id] || CONSUMABLES[d.id];
    rows.push({ label: def ? def.name : d.id, chance: d.chance, boost: d.questBoost || null, color: def?.color });
  }
  if (t.item) {
    const SET = t.bossLoot && setOfBoss(type);
    const w = SET?.rarities && SET.chance >= 1 ? applyRarityGap(SET.rarities, lvl, playerLevel) : rarityWeights(t.item.tier, lvl, playerLevel);
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    rows.push({ label: `Equipamento${t.item.roll ? ` (${t.item.roll[0]} a ${t.item.roll[1]} itens, divididos pelo dano)` : t.item.count > 1 ? ` (x${t.item.count})` : ''}${t.item.forged ? ' · Forjado na Fenda' : ''}${t.item.min?.[0] ? ` · 1º no mínimo ${RARITIES[RARITY_INDEX[t.item.min[0]]].name}` : ''}`, chance: t.item.chance, rarities: Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => ({ id: k, p: v / tot })) });
  }
  const bs = t.item && biomeOfMob(type);
  if (bs) { const fav = favPiece(type); rows.push({ label: `${BIOME_SETS[bs].name}${fav ? ` · favorita: ${PIECE_NAMES[fav]}` : ''}`, chance: t.item.chance * SET_RULES.chance, color: BIOME_SETS[bs].theme.fx2 }); }
  if (t.special) {
    rows.push({ label: 'Lendário (raríssimo)', chance: t.special.legendaryChance, color: '#ff9d2e' });
    if (t.special.mythic) rows.push({ label: NAMED_ITEMS[t.special.mythic.id].name, chance: t.special.mythic.chance, color: '#ff4778' });
  }
  return rows;
}

// Chance de cada cor POR ABATE (monstros comuns/elites: 1 item no máximo) ou POR ITEM (chefes).
// Usado no Bestiário e na lista do pacote: "1 azul a cada ~X mortes".
export function rarityOdds(tableId, level, playerLevel = null, type = null) {
  const t = LOOT_TABLES[tableId]; if (!t?.item) return null;
  const SET = t.bossLoot && setOfBoss(type);
  const w = SET?.rarities && SET.chance >= 1 ? applyRarityGap(SET.rarities, level, playerLevel) : rarityWeights(t.item.tier, level, playerLevel);
  const tot = Object.values(w).reduce((a, b) => a + b, 0), per = t.bossLoot ? 1 : t.item.chance * (t.item.count || 1);
  const out = {};
  for (const r of RARITIES) out[r.id] = ((w[r.id] || 0) / tot) * per;
  return { perKill: !t.bossLoot, odds: out };
}

// ---------- Valores, aprimoramento e descrição ----------
export function itemMainStat(item) {
  const base = item.atk ?? item.def ?? 0;
  return Math.round(base * (1 + UPGRADE.statPerLevel * (item.up || 0)));
}

export function itemValue(entry) {
  if (entry.kind !== 'equip') {
    const d = stackDef(entry);
    return (d?.value || 1) * (entry.qty || 1);
  }
  const r = RARITIES[RARITY_INDEX[entry.rarity]];
  return Math.round(r.value * (1 + entry.ilvl * 0.15) * (1 + 0.25 * (entry.up || 0)) * (entry.forged ? 1.6 : 1));
}

export function upgradeCost(item) {
  const next = (item.up || 0) + 1;
  if (next > UPGRADE.maxLevel) return null;
  const ri = RARITY_INDEX[item.rarity];
  return {
    level: next,
    gold: Math.round(UPGRADE.goldBase * next * (1 + ri * 0.5) * (1 + item.ilvl * 0.1)),
    materials: { ...UPGRADE.materials[next] },
  };
}

// Espaços EXTRAS de uma mochila: (5 + nível do item) × fator da raridade (+2 se de chefe). Quem manda no fim é o
// teto do nível do jogador (bagLevelCap em core/inventory.js): mochila acima do teto vale o teto.
export function packCapOf(rarity, ilvl, forged = false) {
  const c = BALANCE.packCap, k = c.k[rarity] ?? c.k.comum;
  return Math.max(1, Math.round((c.add + Math.max(1, +ilvl || 1)) * k)) + (forged ? c.forged : 0);
}

// Espaços extras que uma mochila dá: a capacidade sorteada (cap) + 1 por melhoria.
// Mochilas antigas (sem cap) usam a regra antiga por raridade, para ninguém perder espaço.
export function packBonus(item) {
  if (!item || item.slot !== 'back') return 0;
  const base = item.cap != null ? item.cap : (BALANCE.packSlots[item.rarity] || 4) + (ITEM_BASES[item.base]?.bag || 0);
  return base + (item.up || 0);
}

export function rarityOf(item) { return RARITIES[RARITY_INDEX[item.rarity]] || RARITIES[0]; }

export function displayName(item) {
  if (item.kind !== 'equip') return stackDef(item)?.name || item.id;
  return item.name + (item.up ? ` +${item.up}` : '');
}

export function formatAffix(key, v) {
  const a = AFFIXES[key];
  return { label: a.name, text: a.fmt.replace('{v}', String(v).replace('.', ',')) };
}

export function describeItem(item) {
  if (item.kind !== 'equip') {
    const d = stackDef(item);
    return { title: d.name, sub: item.kind === 'consumable' ? 'Consumível' : item.kind === 'quest' ? 'Item de missão' : 'Material', lines: [], desc: d.desc, color: d.color };
  }
  const r = rarityOf(item);
  const lines = [];
  if (item.slot === 'weapon') {
    lines.push({ label: item.cls === 'mago' ? 'Poder mágico' : 'Ataque', text: String(itemMainStat(item)), main: true });
  } else if (item.slot === 'back') {
    lines.push({ label: 'Capacidade', text: `+${packBonus(item)} espaços na bolsa`, main: true });
  } else if (item.def) {
    lines.push({ label: 'Defesa', text: String(itemMainStat(item)), main: true });
  }
  if (item.slot === 'shield' && item.lure) lines.push({ label: 'Atrair monstros', text: `${item.lure}% de chance` });
  if (item.soul) lines.push({ label: 'Preso ao personagem', text: 'não troca nem vende no mercado' });
  if (item.set && ITEM_SETS[item.set] && !ITEM_SETS[item.set].noEffect) lines.push({ label: 'Conjunto', text: `${ITEM_SETS[item.set].name} (saque de chefe)` });
  if (item.retido) lines.push({ label: 'Retido', text: 'o servidor segurou este item para o GM conferir' });
  if (item.slot !== 'back' && item.slot !== 'shield' && statsAllowed(item)) for (const k in item.affixes) { if (k === 'aspd' && item.slot === 'weapon') continue; lines.push(formatAffix(k, item.affixes[k])); }
  const clsName = item.cls ? CLASSES[item.cls].name : null;
  return {
    title: displayName(item), color: r.color, rarity: r.name,
    sub: `${SLOT_NAMES[item.slot]}${clsName ? ' · ' + clsName : ''} · Nível do item ${item.ilvl}`,
    req: item.reqLevel, cls: item.cls, lines, effect: item.effectText || (item.set ? setEffectText(item) : null), lore: item.lore,
    forged: item.forged ? `Saque de chefe (${item.forged}): +${Math.round((FORGED.main - 1) * 100)}% de ${item.slot === 'weapon' ? 'ataque' : 'defesa'}.` : null,
  };
}

// Diferença de atributos-chave entre um item e o equipado (para comparação).
export function compareItems(candidate, equipped) {
  if (candidate.slot === 'back') { const d = packBonus(candidate) - packBonus(equipped); return d ? [{ key: 'cap', label: 'Capacidade', diff: d }] : []; }
  if (candidate.slot === 'shield') {
    const out = [], dm = itemMainStat(candidate) - (equipped ? itemMainStat(equipped) : 0), dl = (candidate.lure || 0) - (equipped?.lure || 0);
    if (Math.abs(dm) > 0.001) out.push({ key: 'main', label: 'Defesa', diff: Math.round(dm * 10) / 10 });
    if (dl) out.push({ key: 'lure', label: 'Atrair monstros %', diff: dl });
    return out;
  }
  const keys = ['main', 'for', 'agi', 'int', 'vit', 'crit', 'aspd', 'spow', 'hp', 'regen', 'def'];
  const val = (it, k) => (!it ? 0 : k === 'main' ? itemMainStat(it) : (statsAllowed(it) && it.affixes?.[k]) || 0);
  const out = [];
  for (const k of keys) {
    const d = val(candidate, k) - val(equipped, k);
    if (Math.abs(d) > 0.001) out.push({ key: k, label: k === 'main' ? (candidate.slot === 'weapon' ? 'Ataque' : 'Defesa') : AFFIXES[k].name, diff: Math.round(d * 10) / 10 });
  }
  return out;
}

// itens de chefe (forjados) são no mínimo azuis: um verde antigo vira azul (atributos recalculados)
export function bossGreenToBlue(it) {
  if (!it || it.kind !== 'equip' || !it.forged || it.rarity !== 'incomum') return it;
  it.rarity = 'raro';
  if (it.named) scaleNamed(it, it.ilvl); else solidify(it);
  if (typeof it.name === 'string') it.name = it.name.replace(' de Qualidade', '');
  if (it.bset) it.name = setPieceName(it);
  else if (it.src && !it.named) { try { it.name = themedItemName(it); } catch { /* fica o nome */ } }
  return it;
}

