import { BALANCE } from '../config/balance.js';
import { CLASSES } from '../config/classes.js';
import { EQUIP_SLOTS } from '../config/items.js';
import { itemMainStat, itemTier, tierPower, statsAllowed, preceOfEquipment, natalOfEquipment, setManaOf } from './items.js';

const ATTR_KEYS = ['for', 'agi', 'int', 'vit'];

// Atributos totais: base da classe + crescimento por nível + pontos alocados + equipamentos.
export function totalAttributes(ps) {
  const cls = CLASSES[ps.classId];
  const a = {};
  for (const k of ATTR_KEYS) {
    a[k] = cls.baseAttrs[k] + Math.floor(cls.growth[k] * (ps.level - 1)) + (ps.attrs?.[k] || 0);
  }
  for (const slot of EQUIP_SLOTS) {
    const it = ps.equipment?.[slot];
    if (!it || it.retido || !it.affixes || slot === 'back' || slot === 'shield' || !statsAllowed(it)) continue;
    for (const k of ATTR_KEYS) if (it.affixes[k]) a[k] += it.affixes[k];
  }
  return a;
}

export function computeStats(ps) {
  const cls = CLASSES[ps.classId];
  const attrs = totalAttributes(ps);
  const sum = { crit: 0, aspd: 0, spow: 0, hp: 0, regen: 0, def: 0 };
  let armorDef = 0;
  const effects = new Set();
  for (const slot of EQUIP_SLOTS) {
    const it = ps.equipment?.[slot];
    if (!it || it.retido || slot === 'back') continue; // mochila não dá atributos, só espaço; item retido pelo servidor não vale
    if (slot !== 'weapon' && it.def) armorDef += itemMainStat(it);
    if (slot === 'shield') { if (it.effect) effects.add(it.effect); continue; } // escudo: só defesa (+ atrair)
    if (it.affixes && statsAllowed(it)) for (const k in sum) if (it.affixes[k] && !(k === 'aspd' && slot === 'weapon')) sum[k] += it.affixes[k];
    if (it.effect) effects.add(it.effect);
  }
  const weapon = ps.equipment?.weapon;
  const weaponAtk = weapon && !weapon.retido ? itemMainStat(weapon) : 2;
  const primary = attrs[cls.primary];
  // arma (2 por ponto) + atributo principal + nível — pesos acertados para a regra de itens fixos (2+2+2)
  const power = weaponAtk * 2 + primary * 1.5 + ps.level * 1.6;
  const def = cls.baseDef + armorDef + sum.def + attrs.for * 0.5;
  const maxHp = Math.round(cls.baseHp + cls.hpPerLevel * (ps.level - 1) + attrs.vit * (cls.hpPerVit ?? 10) + sum.hp);
  const maxRes = cls.resource.id === 'furia' ? cls.resource.max : Math.round(cls.resource.max + attrs.int * 3);
  const crit = Math.min(BALANCE.critChanceCap, BALANCE.critChanceBase + attrs.agi * 0.0025 + sum.crit / 100);
  const aspd = Math.min(BALANCE.attackSpeedCap, attrs.agi * 0.003 + sum.aspd / 100);
  const spow = attrs.int * 0.01 + sum.spow / 100;
  const regen = 0.6 + attrs.vit * 0.15 + sum.regen;
  const cdr = Math.min(BALANCE.cooldownReductionCap, effects.has('selo') ? 0.2 : 0);
  return {
    attrs, power: Math.round(power * 10) / 10, def: Math.round(def * 10) / 10,
    defReduction: def / (def + defenseK(ps.level)),
    maxHp, maxRes, crit, critMult: BALANCE.critMultBase, aspd, spow, regen, cdr,
    prece: preceOfEquipment(ps.equipment), // Conjunto da Prece vestido (cura aliados com a poção) ou null
    natal: natalOfEquipment(ps.equipment), // peças natalinas: congelamento em volta ao acertar
    smana: setManaOf(ps.equipment),        // barra de mana dos conjuntos (Prece/Natal)
    weaponSpd: 1, effects,
    lure: Math.min(BALANCE.shieldLure.max, (ps.equipment?.shield?.lure || 0) / 100), // armas não têm mais velocidade própria
    // começa mais lento; ganha até +14% de velocidade com os níveis (sensação de progressão)
    // e a Agilidade dá mais um pouco: +0,1% por ponto, até +12%
    moveSpeed: Math.round(cls.moveSpeed * (1 + Math.min(0.14, (ps.level - 1) * 0.01)) * (1 + Math.min(BALANCE.agiMoveCap, attrs.agi * BALANCE.agiMovePerPoint)) * 100) / 100,
  };
}

// Intervalo do ataque básico considerando arma e velocidade de ataque.
export function basicCooldown(cls, stats) {
  return cls.basic.cd / (stats.weaponSpd * (1 + stats.aspd));
}

export function rollDamage(power, mult, critChance, critMult, rng) {
  const v = 1 + (rng.next() * 2 - 1) * BALANCE.damageVariance;
  let amount = power * mult * v;
  const crit = rng.next() < critChance;
  if (crit) amount *= critMult;
  return { amount, crit };
}

// quanto da defesa vale contra um atacante do nível L: um conjunto completo comum do mesmo patamar segura ~55%
export function defenseK(level) { const T = itemTier(level || 1); return BALANCE.defenseK * 0.5 + 0.7 * 28 * tierPower(T); }
// v0.12: as armas ficaram mais fortes nos patamares altos (+10% por monstro); a vida e a armadura dos monstros
// sobem na mesma proporção do poder esperado do herói daquele nível (arma + atributo + nível).
export function gearScale(level) {
  const L = Math.max(1, level || 1), T = itemTier(L), R = 6 * L;
  return (4 * tierPower(T) + R) / (4 * (T + 1) + R);
}
export function mitigate(amount, def, level) {
  const red = def / (def + defenseK(level));
  return Math.max(BALANCE.minDamage, Math.round(amount * (1 - red)));
}

// Armadura do monstro (estilo Rucoy): cresce com o nível e com a "dureza" do monstro.
// O mesmo golpe tira quase tudo de um slime e bem menos de um lobo; quem é muito mais forte que o monstro
// ignora quase toda a armadura (ver armorMitigate).
export function enemyArmor(def, level) {
  const A = BALANCE.armor;
  const tough = A.base + (def.def || 0) / A.defDiv;
  return Math.round(Math.max(1, level) * A.perLevel * tough * (def.boss ? A.boss : 1) * gearScale(level) * 10) / 10;
}
export function armorMitigate(amount, power, armor) {
  if (!armor) return Math.max(BALANCE.minDamage, Math.round(amount));
  const p = Math.max(1, power);
  return Math.max(BALANCE.minDamage, Math.round(amount * p / (p + armor)));
}

// vida dos chefes: 8.000 + 900·L·(1 + L/60) — nível 1 ≈ 9 mil, 14 ≈ 24 mil, 50 ≈ 90 mil, 100 ≈ 248 mil, 165 ≈ 565 mil
// chefes de raid têm 60% disso (são vários por evento)
export function bossHp(level, def = {}) {
  const L = Math.max(1, level);
  return Math.round((8000 + 900 * L * (1 + L / 60)) * (def.eventBoss && !def.worldBoss ? 0.6 : 1) * (def.hpScale || 1) * gearScale(L));
}

export function enemyStats(def, level) {
  const M = BALANCE.enemyMult, big = def.boss || def.miniboss;
  const mh = big ? M.bossHp : def.elite ? M.eliteHp : M.hp, md = big ? M.bossDmg : def.elite ? M.eliteDmg : M.dmg;
  if (def.boss) return { maxHp: Math.round(BALANCE.guardianHp * gearScale(level)), dmg: def.dmg * md, def: def.def, armor: enemyArmor(def, level) };
  if (def.fixedHp) { const s0 = BALANCE.enemyScale; return { maxHp: Math.round(def.fixedHp * gearScale(level)), dmg: def.dmg * md * (1 + s0.dmg * (level - 1)), def: def.def + s0.def * (level - 1), armor: enemyArmor(def, level) }; } // chefes de Natal: vida fixa
  const s = BALANCE.enemyScale;
  return {
    // chefes (do mundo, de raid e o Vigia): vida pela curva de chefe — quanto mais forte, MUITO mais vida
    maxHp: big || def.eventBoss ? bossHp(level, def) : Math.round(def.hp * mh * (1 + s.hp * (level - 1)) * gearScale(level)),
    dmg: def.dmg * md * (1 + s.dmg * (level - 1)),
    def: def.def + s.def * (level - 1),
    armor: enemyArmor(def, level),
  };
}
