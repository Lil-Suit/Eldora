import { BALANCE, RARITY_INDEX } from '../config/balance.js';
import { CLASSES } from '../config/classes.js';
import { ITEM_BASES } from '../config/items.js';
import { packBonus, bossGreenToBlue } from './items.js';
import { stackDef } from './items.js';

// Inventário em grade com pilhas. Entradas: equipamento {kind:'equip'} ou pilha {kind, id, qty}.
// `cap` = quantos espaços você PODE ocupar (mochila e teto do nível). A grade (`slots`) nunca é menor que o que
// você já carrega: se tiver mais itens que o cap (mochila trocada, teto do nível), NADA some — só não entra item novo
// até você liberar espaço. Os itens ficam sempre juntos no começo (sem buracos).
export class Inventory {
  constructor(cap = BALANCE.inventorySize, slots = null) {
    this.cap = Math.max(1, Math.floor(+cap) || 1);
    this.slots = [];
    if (slots) for (const it of slots) if (it) this.slots.push(it);
    this.fit();
  }

  get size() { return this.slots.length; }

  // grade = max(cap, itens que você carrega); mexe no próprio array (o save aponta para ele)
  fit() {
    let last = -1;
    for (let i = this.slots.length - 1; i >= 0; i--) if (this.slots[i]) { last = i; break; }
    const want = Math.max(this.cap, last + 1);
    if (this.slots.length > want) this.slots.length = want;
    while (this.slots.length < want) this.slots.push(null);
  }

  static stackMax(entry) {
    if (entry.kind === 'equip') return 1;
    return stackDef(entry)?.stack || BALANCE.stack[entry.kind] || 1;
  }

  // muda a capacidade da bolsa (mochila / nível). Nunca apaga item: se não couber, a grade fica com os itens que já tem.
  setCap(n) { this.cap = Math.max(1, Math.floor(+n) || 1); this.compact(); this.fit(); return true; }
  resize(n) { return this.setCap(n); }

  usedSlots() { let n = 0; for (const s of this.slots) if (s) n++; return n; }
  freeSlots() { return Math.max(0, this.cap - this.usedSlots()); }
  over() { return Math.max(0, this.usedSlots() - this.cap); } // itens acima da capacidade (guardados, sem perder)

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.kind !== 'equip' && s.id === id) n += s.qty;
    return n;
  }

  // Quantidade que caberia (para pilhas) ou 1/0 para equipamento.
  capacityFor(entry) {
    if (entry.kind === 'equip') return this.freeSlots() > 0 ? 1 : 0;
    const max = Inventory.stackMax(entry);
    let cap = this.freeSlots() * max;
    for (const s of this.slots) if (s && s.kind === entry.kind && s.id === entry.id) cap += Math.max(0, max - s.qty);
    return cap;
  }

  // Adiciona; retorna a quantidade que NÃO coube (0 = tudo adicionado).
  // force: itens da conta/missão (montaria, chave) entram mesmo com a bolsa cheia (a grade cresce; nada vai ao chão)
  add(entry, force = false) {
    if (force && entry.kind !== 'equip' && this.capacityFor(entry) < entry.qty) { this.compact(); this.slots.push({ ...entry }); return 0; }
    if (entry.kind === 'equip') {
      bossGreenToBlue(entry); // verde de chefe que chegar por troca/leilão também vira azul
      if (this.freeSlots() <= 0) return 1;
      this.fit();
      const i = this.slots.indexOf(null);
      if (i < 0) return 1;
      this.slots[i] = entry;
      return 0;
    }
    const max = Inventory.stackMax(entry);
    let left = entry.qty;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.kind === entry.kind && s.id === entry.id && s.qty < max) {
        const t = Math.min(left, max - s.qty);
        s.qty += t; left -= t;
      }
    }
    while (left > 0 && this.freeSlots() > 0) {
      this.fit();
      const i = this.slots.indexOf(null);
      if (i < 0) break;
      const t = Math.min(left, max);
      this.slots[i] = { ...entry, uid: entry.uid + (left !== entry.qty ? '-' + i : ''), qty: t };
      left -= t;
    }
    return left;
  }

  removeAt(index, qty = Infinity) {
    const s = this.slots[index];
    if (!s) return null;
    if (s.kind === 'equip' || qty >= s.qty) { this.slots[index] = null; this.compact(); return s; }
    s.qty -= qty;
    return { ...s, qty };
  }

  // sem buracos: quando um item sai, os de depois andam uma casa para trás (a ordem continua a mesma)
  compact() {
    let w = 0, moved = false;
    for (let r = 0; r < this.slots.length; r++) { const it = this.slots[r]; if (!it) continue; if (r !== w) { this.slots[w] = it; this.slots[r] = null; moved = true; } w++; }
    this.fit(); // tirou item com a bolsa acima da capacidade: a grade volta a encolher até o cap
    return moved;
  }

  removeId(id, qty) {
    let left = qty;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.kind !== 'equip' && s.id === id) {
        const t = Math.min(left, s.qty);
        s.qty -= t; left -= t;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    this.compact();
    return qty - left;
  }

  indexOfUid(uid) { return this.slots.findIndex((s) => s && s.uid === uid); }

  // Organiza: equipamentos por raridade (desc), depois consumíveis, materiais, missão.
  sort() {
    const order = { equip: 0, consumable: 1, material: 2, quest: 3 };
    const items = this.slots.filter(Boolean).sort((a, b) => {
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      if (a.kind === 'equip') return (RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity]) || (b.ilvl - a.ilvl);
      return a.id.localeCompare(b.id);
    });
    this.slots.fill(null);
    items.forEach((it, i) => { this.slots[i] = it; });
    this.fit();
  }

  toJSON() { return this.slots; }
}

// Espaços extras da mochila: definido em items.js (capacidade do item)
export { packBonus };
// teto da bolsa pelo nível: nv 1 → 16, nv 60 → 75, nv 100 → 115 (BALANCE.bag)
export function bagLevelCap(level) { const B = BALANCE.bag; return Math.min(B.max, B.levelBase + Math.max(1, Math.floor(+level) || 1) * B.perLevel); }
// espaços que a mochila daria sem o teto (10 + mochila)
export function bagRaw(player, back = player?.equipment?.back) { return BALANCE.inventorySize + packBonus(back); }
export function bagSize(player, back = player?.equipment?.back) { return Math.min(bagRaw(player, back), bagLevelCap(player?.level)); }

// Verifica se o personagem pode equipar o item. Retorna null ou motivo.
export function equipBlockReason(player, item) {
  if (item.kind !== 'equip') return 'Não é um equipamento.';
  if (item.retido) return 'Item retido pelo servidor: o GM precisa conferir.';
  if (item.reqLevel > player.level) return `Requer nível ${item.reqLevel}.`;
  if (item.slot === 'weapon' && item.cls && item.cls !== player.classId) return `Somente ${CLASSES[item.cls].name}.`;
  return null;
}

// Equipa o item do índice; o antigo volta para o mesmo espaço.
export function equipFromInventory(player, inv, index) {
  const item = inv.slots[index];
  if (!item) return { ok: false, reason: 'Espaço vazio.' };
  const why = equipBlockReason(player, item);
  if (why) return { ok: false, reason: why };
  const prev = player.equipment[item.slot] || null;
  if (item.slot === 'back') {
    // trocar de mochila muda o tamanho da bolsa: confere se tudo cabe
    const n = bagSize(player, item), used = inv.usedSlots() - (prev ? 0 : 1);
    if (used > n && n < inv.cap) return { ok: false, reason: `Essa mochila tem menos espaço: libere ${used - n} espaço(s) da bolsa antes.` };
    player.equipment.back = item; inv.slots[index] = prev;
    inv.setCap(n);
    return { ok: true, item, prev };
  }
  player.equipment[item.slot] = item;
  inv.slots[index] = prev;
  return { ok: true, item, prev };
}

export function unequipToInventory(player, inv, slot) {
  const it = player.equipment[slot];
  if (!it) return { ok: false, reason: 'Nada equipado.' };
  if (slot === 'weapon') return { ok: false, reason: 'Você precisa de uma arma equipada.' };
  if (inv.freeSlots() <= 0) return { ok: false, reason: 'Inventário cheio.' };
  if (slot === 'back') {
    const n = bagSize(player, null), used = inv.usedSlots() + 1;
    if (used > n) return { ok: false, reason: `Sem a mochila a bolsa fica com ${n} espaços: libere ${used - n} espaço(s) antes.` };
    player.equipment.back = null;
    inv.setCap(n); inv.add(it);
    return { ok: true, item: it };
  }
  inv.add(it);
  player.equipment[slot] = null;
  return { ok: true, item: it };
}
