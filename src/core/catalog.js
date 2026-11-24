// =============================================================
// Livro dos Itens (Cronista da vila): todos os equipamentos do jogo, do mais fraco ao mais forte,
// com o que cada um faz e quais monstros soltam. Sem porcentagens de drop.
// =============================================================
import { ITEM_BASES, ITEM_SETS, NAMED_ITEMS, CLASS_LEGENDARIES, LOOT_TABLES, SLOT_NAMES } from '../config/items.js';
import { ENEMIES } from '../config/enemies.js';
import { MOB_LEVELS } from '../config/moblevels.js';
import { BIOME_SETS, BIOME_ORDER, SET_PIECES, PIECE_SLOTS, PIECE_NAMES, setPieceName } from '../config/biomas.js';
import { CLASSES } from '../config/classes.js';
import { RARITIES } from '../config/balance.js';
import { solidify } from './items.js';

const mobName = (t) => ENEMIES[t]?.name || t;
// monstros que existem no mundo e soltam equipamento
function equipMobs() {
  return Object.keys(MOB_LEVELS).filter((t) => ENEMIES[t] && LOOT_TABLES[ENEMIES[t].loot]?.item).sort((a, b) => MOB_LEVELS[a] - MOB_LEVELS[b]);
}
// atributo principal de uma peça (ataque, defesa ou espaço) num nível e raridade
function statOf(base, slot, rarity, ilvl, extra = {}) {
  const it = solidify({ kind: 'equip', base, slot, rarity, ilvl, affixes: {}, ...extra });
  if (it.atk) return { k: 'Ataque', v: it.atk };
  if (it.def) return { k: 'Defesa', v: it.def };
  if (it.cap) return { k: 'Espaço', v: it.cap };
  return null;
}
const RAR_SHOW = ['comum', 'raro', 'epico', 'mitico'];

let CACHE = null;
export function itemCatalog() {
  if (CACHE) return CACHE;
  const out = [], mobs = equipMobs();
  // 1) itens soltos: caem de qualquer monstro do nível em diante
  for (const [id, b] of Object.entries(ITEM_BASES)) {
    if (b.set || b.boss || !SLOT_NAMES[b.slot]) continue;
    const lv = b.minIlvl || 1, from = mobs.filter((t) => MOB_LEVELS[t] >= lv);
    out.push({
      id: 'b:' + id, name: b.name, slot: b.slot, wkind: b.kind, level: lv, kind: 'Item solto',
      what: `${SLOT_NAMES[b.slot]}${b.cls ? ' de ' + (CLASSES[b.cls]?.name || b.cls) : ''}. A força depende do nível do monstro que soltou e da cor (raridade).`,
      stats: RAR_SHOW.map((r) => ({ r, s: statOf(id, b.slot, r, lv) })),
      mobs: from.slice(0, 10).map(mobName), more: Math.max(0, from.length - 10), note: `Cai de qualquer monstro a partir do nível ${lv}.`,
    });
  }
  // 2) sets dos biomas
  for (const bk of BIOME_ORDER) {
    const S = BIOME_SETS[bk], fam = Object.keys(S.fam || {});
    for (const p of SET_PIECES) {
      const slot = PIECE_SLOTS[p][0], base = Object.keys(ITEM_BASES).find((k) => ITEM_BASES[k].slot === slot && !ITEM_BASES[k].set);
      if (!base) continue;
      const fav = fam.filter((t) => S.fam[t] === p);
      out.push({
        id: `s:${bk}:${p}`, name: setPieceName({ bset: bk, slot, wkind: ITEM_BASES[base].kind }) || `${PIECE_NAMES[p]} ${S.word}`, slot, wkind: ITEM_BASES[base].kind, bset: bk,
        level: S.levels[0], kind: S.name, what: `${PIECE_NAMES[p]} do ${S.name} (${S.bioma}). Do nível ${S.levels[0]} ao ${S.levels[1]}.`,
        stats: RAR_SHOW.map((r) => ({ r, s: statOf(base, slot, r, S.levels[1]) })), statLv: S.levels[1],
        mobs: [...fav.map((t) => mobName(t) + ' (favorita)'), ...fam.filter((t) => !fav.includes(t)).map(mobName)], more: 0,
        note: 'A peça favorita de um monstro cai mais vezes dele.',
      });
    }
  }
  // 3) conjuntos de chefe (Prece, Natal…)
  for (const [sk, S] of Object.entries(ITEM_SETS)) {
    const bosses = Object.keys(S.drops || {});
    const lv = Math.min(...bosses.map((t) => MOB_LEVELS[t] || 1));
    for (const [slot, list] of Object.entries(S.bases || {})) {
      const base = list[0], b = ITEM_BASES[base]; if (!b) continue;
      const who = bosses.filter((t) => (S.drops[t] || []).includes(slot) || (S.drops[t] || []).includes(slot.replace(/[LR]$/, '')));
      out.push({
        id: `c:${sk}:${slot}`, name: b.name, slot, wkind: b.kind, set: sk, level: lv, kind: S.name,
        what: `${SLOT_NAMES[slot]} do ${S.name}. ${S.desc || 'O poder dela vem do efeito do conjunto completo.'}`,
        stats: RAR_SHOW.map((r) => ({ r, s: statOf(base, slot, r, lv) })),
        mobs: (who.length ? who : bosses).map(mobName), more: 0, note: 'Só cai de chefe.',
      });
    }
  }
  // 4) lendários com nome
  const bossesWithLeg = Object.keys(ENEMIES).filter((t) => LOOT_TABLES[ENEMIES[t].loot]?.special);
  // outros jeitos de ganhar um item com nome (missões e baús)
  const OTHER = { armadura_vale: 'Recompensa de missão na vila.', anel_aurora: 'Fica no Cofre das Runas (Ruínas de Vel\u2019Thar).', elmo_vigia: 'Fica no baú do fim da Cripta do Vigia.' };
  const classLeg = new Set(Object.values(CLASS_LEGENDARIES).flat());
  for (const [id, n] of Object.entries(NAMED_ITEMS)) {
    const myth = bossesWithLeg.filter((t) => LOOT_TABLES[ENEMIES[t].loot].special?.mythic?.id === id);
    const who = myth.length ? myth : classLeg.has(id) ? bossesWithLeg : [];
    out.push({
      id: 'n:' + id, name: n.name, slot: n.slot, wkind: n.kind, named: id, rarity: n.rarity, level: n.ilvl || 1, kind: (RARITIES.find((r) => r.id === n.rarity)?.name || 'Lendário') + ' único',
      what: `${n.effectText || ''} ${n.lore ? '“' + n.lore + '”' : ''}`.trim(),
      stats: [{ r: n.rarity, s: n.atk ? { k: 'Ataque', v: n.atk } : n.def ? { k: 'Defesa', v: n.def } : null }],
      mobs: who.map(mobName), more: 0, note: OTHER[id] || (who.length ? 'Raríssimo: só de chefe.' : 'Recompensa especial.'),
    });
  }
  // do mais fraco ao mais forte: nível em que começa a cair, depois a força do comum
  const pw = (e) => (e.stats.find((x) => x.s)?.s?.v || 0) + (e.named ? 1e4 : 0);
  out.sort((a, b) => a.level - b.level || pw(a) - pw(b) || a.name.localeCompare(b.name));
  CACHE = out;
  return out;
}
