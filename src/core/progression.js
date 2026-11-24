import { BALANCE } from '../config/balance.js';

// Curva do Rucoy Online: XP total para chegar ao nível L = L^(3 + L/1000).
// Sobe rápido no começo (nível 2 com 2 monstros) e pede cada vez mais, sem teto duro.
export function rucoyTotal(level) { return Math.pow(level, 3 + level / 1000); }

export function xpToNext(level) {
  if (level >= BALANCE.maxLevel) return Infinity;
  return Math.max(5, Math.round((rucoyTotal(level + 1) - rucoyTotal(level)) * BALANCE.xpCurveMult));
}

// pontos de atributo: 1,5 por nível (alterna 1 e 2) — total ganho do nível 1 até o nível L
export function attrPointsTotal(level) { return Math.floor(BALANCE.attrPointsPerLevel * (Math.max(1, level) - 1)); }
export function attrPointsAt(level) { return attrPointsTotal(level) - attrPointsTotal(level - 1); }

export function totalXpToReach(level) {
  let t = 0;
  for (let l = 1; l < level; l++) t += xpToNext(l);
  return t;
}

// XP de um monstro comum do nível L no Rucoy (rato nv 1 ≈ 2, goblin nv 15 ≈ 30, assassino nv 45 ≈ 115)
export function mobBaseXp(level) { return 2 * level + 0.012 * level * level; }

// Monstros bem mais fracos que você dão menos (o XP já cai sozinho porque depende do nível do monstro)
export function levelGapFactor(enemyLevel, playerLevel) {
  const g = BALANCE.xpGap;
  const below = playerLevel - enemyLevel - g.free;
  return below <= 0 ? 1 : Math.max(g.min, 1 - g.perLevel * below);
}

// Quanto o monstro "vale" perto dos outros do mesmo nível (mais vida e dano = mais XP; elites bem mais)
export function toughness(def) {
  const t = Math.max(0.5, Math.min(8, (def.xp || 55) / 55));
  return t * (def.elite ? BALANCE.xp.eliteMult : 1) * (def.eventBoss ? BALANCE.xp.eventBossMult : 1);
}

export function xpForKill(def, enemyLevel, playerLevel) {
  const L = Math.max(1, enemyLevel);
  if (def.boss) return Math.round(xpToNext(L) * BALANCE.xp.bossLevels);
  return Math.max(1, Math.round(mobBaseXp(L) * BALANCE.xp.mobMult * toughness(def) * levelGapFactor(L, playerLevel)));
}

// Recompensas fixas (missões, descobertas, segredos) foram pensadas na curva antiga:
// mantém a mesma fração de nível que davam antes.
export function scaleRewardXp(n, level) {
  const old = 70 * Math.pow(Math.max(1, level), 1.7);
  const nx = xpToNext(level);
  if (!Number.isFinite(nx)) return 0;
  return Math.max(1, Math.round((n * nx) / old));
}

// Adiciona XP ao estado do jogador. Retorna quantos níveis foram ganhos.
export function addXp(p, amount) {
  if (p.level >= BALANCE.maxLevel) { p.xp = 0; return 0; }
  p.xp += Math.max(0, Math.round(amount));
  let gained = 0;
  while (p.level < BALANCE.maxLevel && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.freePoints = (p.freePoints || 0) + attrPointsAt(p.level);
    gained++;
  }
  if (p.level >= BALANCE.maxLevel) p.xp = 0;
  return gained;
}
