import { CLASSES } from '../config/classes.js';
import { passedBefore } from './guardiao.js';
import { WORLD } from '../config/world.js';
import { generateEquipment, makeStack, solidify, scaleNamed, renameOldGear, bossGreenToBlue, convertSaveItems } from './items.js';
import { Inventory } from './inventory.js';
import { xpToNext, attrPointsTotal } from './progression.js';
import { BALANCE, RARITIES, RARITY_INDEX, ITEM_SCALE, FORGED } from '../config/balance.js';
import { NAMED_ITEMS, AFFIXES } from '../config/items.js';
import { themedItemName, themeOldItem } from '../config/itemthemes.js';

export const SAVE_VERSION = 18;

// Estado persistente de um novo personagem.
export function createNewState(name, classId, rng) {
  const cls = CLASSES[classId];
  const inv = new Inventory(BALANCE.inventorySize);
  inv.add(makeStack('pocao_vida', 3, rng));
  if (classId === 'arqueiro') inv.add(makeStack('flechas', 300, rng)); // o arqueiro começa com 300 flechas
  const weapon = generateEquipment({ baseId: cls.startWeapon, rarity: 'comum', ilvl: 1, rng });
  const chest = generateEquipment({ baseId: classId === 'mago' ? 'manto_aprendiz' : 'gibao_couro', rarity: 'comum', ilvl: 1, rng });
  return {
    v: SAVE_VERSION,
    charId: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    created: Date.now(),
    updated: Date.now(),
    player: {
      name: (name || '').trim().slice(0, 16) || 'Viajante',
      classId,
      level: 1, xp: 0, freePoints: 0,
      attrs: { for: 0, agi: 0, int: 0, vit: 0 },
      gold: 15,
      hp: null, res: null,
      pos: { x: WORLD.spawn.x, z: WORLD.spawn.z, area: 'world' },
      equipment: { weapon, shield: generateEquipment({ baseId: 'escudo_madeira', rarity: 'comum', ilvl: 1, rng }), helm: null, chest, ring: null },
      inventory: inv.slots,
      stats: { kills: {}, deaths: 0, playTime: 0, bossKills: 0, chests: 0, damageDealt: 0 },
      binds: null,
    },
    quests: { q: {}, tracked: null },
    world: {
      discovered: ['vila'],
      chests: [],
      runes: { seq: [], solved: false },
      uniques: [],
      lootLog: [],
      bossRespawnAt: 0,
      tutorial: 0,
      timeOfDay: 0.32,
      flags: {},
      bestiary: [],
    },
  };
}

// Migração entre versões do save (mantém compatibilidade).
export function migrateState(s) {
  if (!s || typeof s !== 'object' || !s.player) throw new Error('Save inválido');
  if (!s.v || s.v < 2) {
    s.world = s.world || {};
    s.world.bestiary = s.world.bestiary || [];
    s.world.flags = s.world.flags || {};
    s.player.stats = Object.assign({ kills: {}, deaths: 0, playTime: 0, bossKills: 0, chests: 0, damageDealt: 0 }, s.player.stats || {});
    s.v = 2;
  }
  if (s.v < 3) { rescaleItemsV3(s); s.v = 3; }
  if (s.v < 4) { rescaleItemsV4(s); s.v = 4; }
  if (s.v < 5) { // curva de XP do Rucoy: mantém a fração da barra que o jogador já tinha
    const p = s.player, L = Math.max(1, p.level || 1);
    const old = Math.round(70 * Math.pow(L, 1.7)), nx = xpToNext(L);
    if (Number.isFinite(nx)) p.xp = Math.max(0, Math.min(nx - 1, Math.round(((p.xp || 0) / old) * nx)));
    s.v = 5;
  }
  if (s.v < 6) { // atributos fixos (estilo Rucoy): itens antigos passam a seguir a regra nova
    const p = s.player;
    const fixIt = (it) => { if (!it || it.kind !== 'equip') return; if (it.named) scaleNamed(it, it.ilvl); else solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fixIt);
    for (const k of Object.keys(p.equipment || {})) fixIt(p.equipment[k]);
    s.v = 6;
  }
  if (s.v < 7) { // regra nova (v0.9.52): itens 2+2 e 4+4, pontos de atributo pela metade — devolve os pontos para redistribuir
    const p = s.player;
    const fixIt = (it) => { if (!it || it.kind !== 'equip') return; if (it.named) scaleNamed(it, it.ilvl); else { solidify(it); if (it.src) it.name = themedItemName(it); } };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fixIt);
    for (const k of Object.keys(p.equipment || {})) fixIt(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(fixIt);
    p.attrs = { for: 0, agi: 0, int: 0, vit: 0 };
    p.freePoints = p.gmBoost ? BALANCE.gmPoints : attrPointsTotal(p.level || 1);
    p.respec = true;
    // arqueiros antigos ganham 300 flechas (agora elas acabam)
    if (p.classId === 'arqueiro' || s.classId === 'arqueiro' || p.cls === 'arqueiro') { if (Array.isArray(p.inventory)) { const i = p.inventory.findIndex((x) => !x); const st = { uid: 'fl' + Date.now().toString(36), kind: 'consumable', id: 'flechas', qty: 300 }; if (i >= 0) p.inventory[i] = st; } }
    s.v = 7;
  }
  if (s.v < 8) { // v0.9.57: itens que já estavam na bolsa/equipados ganham a estética do monstro (como os que caem agora)
    const p = s.player;
    if (Array.isArray(p.inventory)) p.inventory.forEach(themeOldItem);
    for (const k of Object.keys(p.equipment || {})) themeOldItem(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(themeOldItem);
    s.v = 8;
  }
  if (s.v < 9) { // v0.9.62: mochila pela raridade (mítica dá bem mais espaço que incomum). Nada se perde:
    // se a mochila equipada encolher e a bolsa não couber, ela fica com o espaço necessário até você liberar.
    const p = s.player, fix = (it) => { if (it && it.kind === 'equip' && it.slot === 'back' && !it.named) solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fix);
    if (Array.isArray(p.vault)) p.vault.forEach(fix);
    const back = p.equipment?.back;
    if (back && back.slot === 'back' && !back.named) {
      const old = back.cap ?? 0, used = Array.isArray(p.inventory) ? p.inventory.filter(Boolean).length : 0;
      solidify(back);
      const need = used - BALANCE.inventorySize - (back.up || 0);
      if (back.cap < need) back.cap = Math.min(Math.max(old, need), need);
    }
    s.v = 9;
  }
  if (s.v < 10) { // v0.9.63: a raridade multiplica o ataque/defesa — itens que você já tem são recalculados
    const p = s.player;
    const fixIt = (it) => { if (!it || it.kind !== 'equip' || it.slot === 'back') return; if (it.named) scaleNamed(it, it.ilvl); else solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fixIt);
    for (const k of Object.keys(p.equipment || {})) fixIt(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(fixIt);
    s.v = 10;
  }
  if (s.v < 11) { // v0.9.64: mochilas sobem de 2 em 2 por fundo e por set — recalcula (nunca perde item)
    const p = s.player, fix = (it) => { if (it && it.kind === 'equip' && it.slot === 'back' && !it.named) solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fix);
    if (Array.isArray(p.vault)) p.vault.forEach(fix);
    const back = p.equipment?.back;
    if (back && back.slot === 'back' && !back.named) {
      const old = back.cap ?? 0, used = Array.isArray(p.inventory) ? p.inventory.filter(Boolean).length : 0;
      solidify(back);
      const need = used - BALANCE.inventorySize - (back.up || 0);
      if (back.cap < need) back.cap = Math.min(Math.max(old, need), need);
    }
    s.v = 11;
  }
  if (s.v < 12) { // v0.9.74: itens que não são de chefe perdem os atributos (arma só ataque, armadura só defesa)
    const p = s.player, strip = (it) => { if (it && it.kind === 'equip' && !it.boss && it.affixes && Object.keys(it.affixes).length) it.affixes = {}; };
    if (Array.isArray(p.inventory)) p.inventory.forEach(strip);
    for (const k of Object.keys(p.equipment || {})) strip(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(strip);
    s.v = 12;
  }
  if (s.v < 13) { // v0.9.78: Elmo → Capacete, Tiara → Chapéu, Grevas → Calça (nomes e ícones)
    const p = s.player;
    if (Array.isArray(p.inventory)) p.inventory.forEach(renameOldGear);
    for (const k of Object.keys(p.equipment || {})) renameOldGear(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(renameOldGear);
    s.v = 13;
  }
  if (s.v < 14) { // v0.9.92: luvas sobem de 1 em 1 (davam defesa demais) — recalcula as luvas que você já tem
    const p = s.player, fix = (it) => { if (it && it.kind === 'equip' && (it.slot === 'gloveL' || it.slot === 'gloveR') && !it.named) solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fix);
    for (const k of Object.keys(p.equipment || {})) fix(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(fix);
    s.v = 14;
  }
  if (s.v < 15) { // v0.10.6: itens de chefe são no mínimo azuis — os verdes (incomum) que caíram de chefe viram azuis (raro)
    const p = s.player;
    if (Array.isArray(p.inventory)) p.inventory.forEach(bossGreenToBlue);
    for (const k of Object.keys(p.equipment || {})) bossGreenToBlue(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(bossGreenToBlue);
    s.v = 15;
  }
  if (s.v < 16) { // v0.11: mochila pela regra nova (nível do item × raridade; o teto do nível manda) e cofre por diamantes.
    // NADA é apagado: se a bolsa ficar acima do espaço, os itens ficam guardados e só não entra item novo até liberar.
    const p = s.player, fix = (it) => { if (it && it.kind === 'equip' && it.slot === 'back' && !it.named) solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fix);
    if (Array.isArray(p.vault)) p.vault.forEach(fix);
    fix(p.equipment?.back);
    // cofre: o tamanho que já tinha (comprado com ouro nas versões antigas) fica; daqui para frente cresce com diamantes
    p.vaultBase = Math.max(40, Array.isArray(p.vault) ? p.vault.length : 40);
    s.v = 16;
  }
  if (s.v < 17) { // v0.12 (pacote 2): sets por BIOMA. Cada peça de set antigo (de um monstro) vira a peça do set do bioma
    // de onde ela vinha, com o MESMO fundo, a MESMA peça, o mesmo nível e os mesmos números. Nada é apagado.
    // Acontece UMA vez (versão do save); o servidor confere, registra e não deixa repetir a troca para duplicar item.
    const n = convertSaveItems(s.player);
    s.world = s.world || {}; s.world.flags = s.world.flags || {};
    if (n) s.world.flags.setsTrocados = n; // aviso ao entrar no jogo
    s.v = 17;
  }
  if (s.v < 18) { // v0.12: +10% por patamar de monstro e cor = fração do salto (meio-termo) — recalcula ataque/defesa
    const p = s.player;
    const fixIt = (it) => { if (!it || it.kind !== 'equip' || it.slot === 'back') return; if (it.named) scaleNamed(it, it.ilvl); else solidify(it); };
    if (Array.isArray(p.inventory)) p.inventory.forEach(fixIt);
    for (const k of Object.keys(p.equipment || {})) fixIt(p.equipment[k]);
    if (Array.isArray(p.vault)) p.vault.forEach(fixIt);
    s.v = 18;
  }
  // pacote 3: quem já passou do Guardião (flag antiga, está/esteve nos Ermos ou Confins) continua com o portal liberado
  s.world = s.world || {}; s.world.flags = s.world.flags || {};
  if (!s.world.flags.guardiaoOk && passedBefore(s)) s.world.flags.guardiaoOk = 1;
  return s;
}

// v4: raridades mais próximas (Incomum +6%, Raro +12%, Épico +20%, Lendário +30%, Mítico +40%)
const V3_MULT = { comum: 1, incomum: 1.1, raro: 1.22, epico: 1.36, lendario: 1.5, mitico: 1.65 };
function rescaleItemsV4(s) {
  const p = s.player;
  const fix = (it) => {
    if (!it || it.kind !== 'equip' || it.named) return it;
    const r = it.rarity in V3_MULT ? it.rarity : 'comum';
    const nm = RARITIES[RARITY_INDEX[r]].mult;
    const f = (nm / V3_MULT[r]) * (it.forged ? FORGED.main / 1.12 : 1);
    if (it.atk) it.atk = Math.max(1, Math.round(it.atk * f));
    if (it.def) it.def = Math.max(1, Math.round(it.def * f));
    const fa = (nm / V3_MULT[r]) * (it.forged ? FORGED.affix / 1.08 : 1);
    for (const k of Object.keys(it.affixes || {})) {
      const A = AFFIXES[k];
      if (!A) continue;
      let v = it.affixes[k] * fa;
      if (A.cap) v = Math.min(A.cap, v);
      it.affixes[k] = A.int ? Math.max(1, Math.round(v)) : Math.round(v * 10) / 10;
    }
    return it;
  };
  if (Array.isArray(p.inventory)) p.inventory = p.inventory.map(fix);
  for (const k of Object.keys(p.equipment || {})) p.equipment[k] = fix(p.equipment[k]);
}

// v3: curva de itens mais suave. Reescala os itens que o jogador já tem, mantendo a "sorte" de cada um
// (um item que rolou acima da média continua acima da média na curva nova).
const OLD_MULT = { comum: 1, incomum: 1.12, raro: 1.28, epico: 1.46, lendario: 1.66, mitico: 1.85 };
const OLD_MAIN = { weapon: [5, 2.4], helm: [1.5, 0.8], chest: [3, 1.6] };
const OLD_AFF_B = { for: 0.55, agi: 0.55, int: 0.55, vit: 0.5, crit: 0.25, aspd: 0.4, spow: 0.6, hp: 5, regen: 0.08, def: 0.6 };
function rescaleItemsV3(s) {
  const p = s.player;
  const fix = (it) => {
    if (!it || it.kind !== 'equip') return it;
    if (it.named && NAMED_ITEMS[it.named]) {
      const n = NAMED_ITEMS[it.named];
      if (n.atk) it.atk = n.atk;
      if (n.def) it.def = n.def;
      it.affixes = { ...(n.affixes || {}) };
      return it;
    }
    const r = it.rarity in OLD_MULT ? it.rarity : 'comum';
    const newMult = RARITIES[RARITY_INDEX[r]].mult;
    const L = it.ilvl || 1;
    const om = OLD_MAIN[it.slot], nm = ITEM_SCALE[it.slot];
    if (om && nm) {
      const f = ((nm[0] + nm[1] * L) * newMult * (it.forged ? FORGED.main : 1)) / ((om[0] + om[1] * L) * OLD_MULT[r] * (it.forged ? 1.22 : 1));
      if (it.atk) it.atk = Math.max(1, Math.round(it.atk * f));
      if (it.def) it.def = Math.max(1, Math.round(it.def * f));
    }
    for (const k of Object.keys(it.affixes || {})) {
      const A = AFFIXES[k];
      if (!A || OLD_AFF_B[k] === undefined) continue;
      const f = ((A.a + A.b * L) * newMult * (it.forged ? FORGED.affix : 1)) / ((A.a + OLD_AFF_B[k] * L) * OLD_MULT[r] * (it.forged ? 1.15 : 1));
      let v = it.affixes[k] * f;
      if (A.cap) v = Math.min(A.cap, v);
      it.affixes[k] = A.int ? Math.max(1, Math.round(v)) : Math.round(v * 10) / 10;
    }
    return it;
  };
  if (Array.isArray(p.inventory)) p.inventory = p.inventory.map(fix);
  for (const k of Object.keys(p.equipment || {})) p.equipment[k] = fix(p.equipment[k]);
}

export function validateState(s) {
  const p = s?.player;
  if (!p || !CLASSES[p.classId]) return false;
  if (!Number.isFinite(p.level) || p.level < 1 || p.level > BALANCE.maxLevel) return false;
  if (!Array.isArray(p.inventory)) return false;
  if (!p.equipment || !p.equipment.weapon) return false;
  return true;
}

// Código de exportação: base64 de JSON + soma de verificação FNV-1a.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function toB64(str) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, 'utf8').toString('base64');
}
function fromB64(b64) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function encodeSaveCode(state) {
  const json = JSON.stringify(state);
  return 'RIFT1.' + fnv1a(json) + '.' + toB64(json);
}

export function decodeSaveCode(code) {
  const c = String(code || '').trim().replace(/\s+/g, '');
  const m = /^RIFT1\.([0-9a-z]+)\.(.+)$/.exec(c);
  if (!m) throw new Error('Código em formato desconhecido.');
  let json;
  try { json = fromB64(m[2]); } catch { throw new Error('Código corrompido.'); }
  if (fnv1a(json) !== m[1]) throw new Error('Código corrompido (verificação falhou).');
  const s = migrateState(JSON.parse(json));
  if (!validateState(s)) throw new Error('Save inválido.');
  return s;
}
