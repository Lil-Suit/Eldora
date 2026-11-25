// =============================================================
// ELDORIA — Valores globais de equilíbrio. Edite aqui, não no código.
// =============================================================

export const BALANCE = {
  maxLevel: 1000, // estilo Rucoy: sem teto prático; cada monstro tem nível fixo (config/moblevels.js). GMs começam no 1000.
  gmLevel: 1000, gmPoints: 500, // contas GM (lil, pedrocas): nível 1000 e +500 pontos de atributo, uma vez por personagem
  runSpeed: 1.6, // correr (Shift no PC / botão no celular): 60% mais rápido fora de combate
  mountForAll: null, // ninguém ganha montaria de graça: só as contas da lista MONTARIAS do servidor (padrão: lil = cavalo)
  mountSpeed: 20, // Cavalo do Criador: 20× a velocidade a pé
  // XP no estilo do Rucoy Online (ver core/progression.js): total para o nível L = L^(3 + L/1000)
  // e cada monstro dá ~2×nível. Aqui o combate é de ação (cada abate demora mais que no Rucoy),
  // então os monstros dão o dobro: ~10 abates por nível no nível 13, ~15 no 20, ~23 no 30.
  xp: { mobMult: 2, eliteMult: 1.3, eventBossMult: 1.5, bossLevels: 2.5 },
  attrPointsPerLevel: 1.5, // metade de antes (1 e 2 pontos alternados)
  xpCurveMult: 0.95,      // subir de nível 5% mais fácil
  // monstros até 6 níveis abaixo dão XP cheio; depois −12% por nível (mínimo 25%)
  xpGap: { free: 6, perLevel: 0.12, min: 0.25 },
  // Diferença de nível no combate (inimigo acima do jogador)
  levelDiff: { enemyDmgPerLevel: 0.15, enemyDmgMax: 2.2, playerDmgPerLevel: 0.12, playerDmgMin: 0.3, lowerEnemyDmgPerLevel: 0.05, lowerEnemyDmgMin: 0.6 },

  critChanceBase: 0.05,
  critMultBase: 1.5,
  critChanceCap: 0.6,
  attackSpeedCap: 0.6, // +60% no máximo
  cooldownReductionCap: 0.35,
  defenseK: 100, // redução = def / (def + K)
  // Armadura dos monstros: nível × perLevel × (base + def/defDiv). Dano final = golpe × poder / (poder + armadura).
  armor: { perLevel: 3.6, base: 0.5, defDiv: 10, boss: 0.6 },
  damageVariance: 0.1,
  minDamage: 1,

  // Escalonamento por nível dos inimigos (multiplicativo por nível acima de 1)
  // dificuldade geral (v0.9.16): todos os monstros mais duros; chefes com bem mais vida e só um pouco mais de ataque
  enemyMult: { hp: 1.3, dmg: 1.2, eliteHp: 1.5, eliteDmg: 1.15, bossHp: 1.8, bossDmg: 1.08 },
  enemyScale: { hp: 0.27, dmg: 0.3, def: 1.0, xp: 0.2, gold: 0.2 },
  enemyRespawnSec: 28,
  respawn: { base: 40, perLevel: 1.5, max: 300 }, // tempo para um monstro morto voltar
  enemyDormantDist: 95,

  potionCooldown: 8,
  outOfCombatSec: 5,
  // BOLSA (v0.11): todo mundo começa com 10 espaços. A mochila soma espaços (pelo nível do item e pela raridade),
  // mas a bolsa NUNCA passa do teto do seu nível: teto = levelBase + nível (nv 1 → 16, nv 60 → 75, nv 100 → 115), até `max`.
  // Mochila acima do teto: vale o teto. Nenhum item some — com mais itens que o teto, você só não pega novos até liberar.
  inventorySize: 10,
  bag: { levelBase: 15, perLevel: 1, max: 300 },
  // escudos épicos/lendários: chance de atrair monstros próximos para você (nunca 100%)
  shieldLure: { epico: [0.08, 0.14], mitico: [0.12, 0.18], lendario: [0.16, 0.22], max: 0.25, every: 2.5 },
  // saque de chefe: 1 item sempre; chance de sair 2 e de sair 3
  // chefe solta 1 a 3 itens no total; cada pessoa leva no máximo 1 (2 é raríssimo)
  guardianHp: 45000, // Guardião da Fenda (primeiro chefe do portal)
  bossItems: { two: 0.35, three: 0.10, secondForSame: 0.03 },
  // Mochila: espaços EXTRAS = (5 + nível do item) × fator da raridade (+2 se for de chefe). Ex.: nível 100 → comum +42,
  // azul +63, roxo +79, vermelho +95, branco +105. O teto do nível (acima) sempre vale.
  packCap: { add: 5, k: { comum: 0.4, incomum: 0.5, raro: 0.6, epico: 0.75, mitico: 0.9, lendario: 1 }, forged: 2 },
  packSlots: { comum: 4, incomum: 6, raro: 9, epico: 13, mitico: 15, lendario: 18 },
  stack: { consumable: 300, material: 50, quest: 10 }, // poções empilham até 300 por espaço (flechas até 9999)
  agiMovePerPoint: 0.001, agiMoveCap: 0.12, // Agilidade: +0,1% de velocidade de movimento por ponto, até +12%

  pickupRadius: 1.8,
  magnetRadius: 4.2,

  dayLengthSec: 720, // um ciclo dia/noite completo
  autosaveSec: 20,

  bossRespawnSec: 240,
  // Chefes NÃO ficam sempre lá nem voltam por tempo: a cada `every` segundos cada chefe ausente
  // tem uma chance de nascer. Quanto mais forte (nível), menor a chance.
  // chance = base / (1 + nível / perLevel), mínimo `min`. Nv 1 ≈ 11% (≈9 min em média), nv 14 ≈ 7% (≈14 min),
  // nv 25 ≈ 5,3% (≈19 min), nv 79 ≈ 2,4% (≈40 min), nv 168 ≈ 1,3% (≈1 h 15 min).
  // chefes raros: depois de morto, espera no mínimo wait (+waitPerLevel por nível, até waitMax) minutos;
  // depois, a cada minuto tem chance base/(1+nível/perLevel). Rei Slime ≈ 1 h em média; os mais fortes, várias horas.
  // quanto o monstro persegue antes de desistir (multiplica o 'leash' de cada monstro, mais o raio do grupo)
  leashMult: 3.0, // maior: monstro persegue bem mais antes de evadir
  // wild*: chefes dos Ermos e Confins — 12%/min de chance enquanto alguém está perto, 35% de já estar lá quando você chega, volta 10 min depois de morrer
  rareSpawn: { every: 60, base: 0.03, perLevel: 20, min: 0.004, wait: 20, waitPerLevel: 0.4, waitMax: 90, wildChance: 0.12, wildPresent: 0.35, wildWait: 10 },
  eventFirstDelaySec: 120,
  eventCooldownSec: [180, 300],
  eventRareSkip: 0.45,          // Confins (3º mapa) em diante: 45% das vezes em que sairia uma raid, não sai nenhuma
  eventRareCooldownMult: 1.6,   // e a espera depois de uma raid é 60% maior
  eventWaitSec: 480, // a fenda abre num lugar qualquer do mapa e espera até 8 min alguém chegar para começar as ondas
  eventDurationSec: 180,

  respawnDelaySec: 4,
  safeZoneRegenMult: 2,
};

// Atributos alocáveis — cada um tem papel único (sem redundância).
export const ATTRIBUTES = {
  for: {
    name: 'Força', short: 'FOR',
    desc: '+1,5 de Ataque com armas corpo a corpo (Guerreiro). +0,5 de Defesa para todas as classes.',
  },
  agi: {
    name: 'Agilidade', short: 'AGI',
    desc: '+1,5 de Ataque com arcos (Arqueiro). +0,25% de chance crítica, +0,3% de velocidade de ataque e +0,1% de velocidade de movimento (até +12%) para todas as classes.',
  },
  int: {
    name: 'Inteligência', short: 'INT',
    desc: '+1,5 de Poder Mágico (Mago). +3 de Mana/Energia máxima e +1% de Poder de Habilidade para todas as classes.',
  },
  vit: {
    name: 'Vitalidade', short: 'VIT',
    desc: '+10 de Vida máxima no Guerreiro (+7 no Arqueiro, +6 no Mago) e +0,15 de regeneração de vida por segundo.',
  },
};

// Atributos derivados (não alocáveis) mostrados na ficha.
export const DERIVED_INFO = {
  power: 'Ataque / Poder Mágico: base do dano de ataques e habilidades.',
  def: 'Defesa: reduz o dano recebido em Defesa ÷ (Defesa + 100).',
  crit: 'Chance crítica: golpes críticos causam 160% de dano.',
  aspd: 'Velocidade de ataque: reduz o intervalo entre ataques básicos.',
  spow: 'Poder de Habilidade: multiplica o dano das habilidades numeradas.',
  regen: 'Regeneração: vida recuperada por segundo (x2 dentro da vila).',
  cdr: 'Redução de recarga: diminui o tempo de recarga das habilidades.',
};

export const RARITIES = [
  { id: 'comum',    name: 'Comum',    color: '#cfd2d6', mult: 1.00, affixes: 0, value: 6,   beam: false },
  // atributos extras (afixos) só nos lendários e míticos
  { id: 'incomum',  name: 'Incomum',  color: '#62d764', mult: 1.06, affixes: 0, value: 16,  beam: false },
  { id: 'raro',     name: 'Raro',     color: '#4aa8ff', mult: 1.12, affixes: 0, value: 42,  beam: true },
  { id: 'epico',    name: 'Épico',    color: '#b974ff', mult: 1.2, affixes: 0, value: 115, beam: true },
  // ordem dos fundos: sem fundo (comum) · verde · azul · roxo · VERMELHO (mítico) · BRANCO (lendário, o topo)
  { id: 'mitico',   name: 'Mítico',   color: '#ff3b3b', mult: 1.3, affixes: 3, value: 320, beam: true },
  { id: 'lendario', name: 'Lendário', color: '#ffffff', mult: 1.4, affixes: 4, value: 900, beam: true },
];
// Crescimento dos itens por nível do item (ilvl): valor = (base + porNível × ilvl) × raridade × tipo.
// Curva suave de propósito: um item 10 níveis acima é ~3× o inicial, e a raridade soma +10% a +65%.
export const ITEM_SCALE = { weapon: [6, 1.6], helm: [1.5, 0.55], chest: [3, 1.1], shield: [1.8, 0.7], legs: [2, 0.8], gloveL: [0.8, 0.3], gloveR: [0.8, 0.3], boots: [1.1, 0.42], back: [0.9, 0.35] };
// Itens de chefe ("Forjados na Fenda")
export const FORGED = { main: 1.15, affix: 1.1 };
// Saque nunca cai muito acima do seu nível (o item sempre pode ser usado ao cair)
export const DROP_LEVEL_CAP = { normal: 1, forged: 1 };
export const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));

// =============================================================
// RARIDADE (v0.11) — cada cor MUITO mais difícil que a anterior.
// 1) A FORÇA do monstro decide o teto: monstro fraco solta quase só comum/verde; roxo para cima só de monstro forte e chefe.
//    A faixa vem do nível do monstro, mas nunca passa do SEU nível + `leech` (ninguém ganha raridade de monstro forte
//    só por estar no grupo de quem bate nele).
// 2) Jogador MUITO acima do monstro não ganha raridade melhor: passando de `free` níveis acima, as chances de
//    verde para cima caem `per` por nível (até ficar em `min` do normal). A QUANTIDADE de itens não muda.
// Pesos em %, por tipo de fonte (normal, bom, elite, chefes, raid) e por faixa (f1…f4). Tabela completa: LISTAS-PACOTE.md.
// =============================================================
export const RARITY_BANDS = [
  { id: 'f1', name: 'Fraco', upTo: 14 },        // Vale: slime, goblin, lobo, esqueleto, chefes do Vale
  { id: 'f2', name: 'Médio', upTo: 49 },        // Planície do Guardião e Ermos (até o Cavaleiro Ósseo)
  { id: 'f3', name: 'Forte', upTo: 99 },        // fundo dos Ermos e Confins até o Deserto/Pântano
  { id: 'f4', name: 'Muito forte', upTo: Infinity }, // Confins 100+ (Floresta, Tundra, Magma, Picos)
];
export const RARITY_GAP = { free: 8, per: 0.03, min: 0.5, leech: 10 };
export const RARITY_WEIGHTS = {
  // monstros comuns
  normal: {
    f1: { comum: 88, incomum: 11, raro: 1 },
    f2: { comum: 82, incomum: 15.5, raro: 2.3, epico: 0.2 },
    f3: { comum: 76.4, incomum: 19.1, raro: 4, epico: 0.42, mitico: 0.07, lendario: 0.01 },
    f4: { comum: 72, incomum: 21.6, raro: 5.1, epico: 1.05, mitico: 0.22, lendario: 0.03 },
  },
  // monstros comuns um pouco melhores (esqueletos, monstros da Fenda)
  bom: {
    f1: { comum: 85.5, incomum: 13, raro: 1.5 },
    f2: { comum: 79.5, incomum: 17.6, raro: 2.6, epico: 0.3 },
    f3: { comum: 73.6, incomum: 21, raro: 4.7, epico: 0.6, mitico: 0.09, lendario: 0.01 },
    f4: { comum: 69.2, incomum: 23.4, raro: 5.9, epico: 1.2, mitico: 0.27, lendario: 0.03 },
  },
  // elites (alfa, guardião corrompido, golens, colossos, titãs)
  elite: {
    f1: { comum: 58, incomum: 35.5, raro: 6, epico: 0.5 },
    f2: { comum: 52, incomum: 37.5, raro: 9.1, epico: 1.3, mitico: 0.1 },
    f3: { comum: 46, incomum: 39.6, raro: 12, epico: 2.15, mitico: 0.23, lendario: 0.02 },
    f4: { comum: 42, incomum: 40.5, raro: 14.4, epico: 2.6, mitico: 0.47, lendario: 0.03 },
  },
  // chefes: só de azul para cima; o roxo (ou melhor) é raro de verdade e só o 1º item do chefe pode ser
  chefe_menor: {
    f1: { raro: 95.7, epico: 4, mitico: 0.3 },
    f2: { raro: 93.3, epico: 6, mitico: 0.65, lendario: 0.05 },
    f3: { raro: 90.4, epico: 8.5, mitico: 1, lendario: 0.1 },
    f4: { raro: 87.6, epico: 10.6, mitico: 1.6, lendario: 0.2 },
  },
  chefe: { // Guardião da Fenda
    f1: { raro: 93.6, epico: 5.8, mitico: 0.5, lendario: 0.1 },
    f2: { raro: 90.9, epico: 8, mitico: 0.95, lendario: 0.15 },
    f3: { raro: 87.8, epico: 10.5, mitico: 1.45, lendario: 0.25 },
    f4: { raro: 84.6, epico: 13, mitico: 2, lendario: 0.4 },
  },
  raid_chefe: { // chefe de raid: nunca branco
    f1: { raro: 96, epico: 3.8, mitico: 0.2 },
    f2: { raro: 94, epico: 5.6, mitico: 0.4 },
    f3: { raro: 91.6, epico: 7.7, mitico: 0.7 },
    f4: { raro: 89, epico: 9.9, mitico: 1.1 },
  },
  // recompensa de evento (hoje as raids entregam ouro e materiais; fica pronto para uso)
  bau: {
    f1: { comum: 30, incomum: 55, raro: 13.5, epico: 1.5 },
    f2: { comum: 25, incomum: 55, raro: 17.6, epico: 2.2, mitico: 0.2 },
    f3: { comum: 22, incomum: 54, raro: 20.7, epico: 2.95, mitico: 0.33, lendario: 0.02 },
    f4: { comum: 20, incomum: 53, raro: 22.9, epico: 3.6, mitico: 0.45, lendario: 0.05 },
  },
};
export function rarityBand(level) { const L = Math.max(1, +level || 1); return RARITY_BANDS.find((b) => L <= b.upTo) || RARITY_BANDS[RARITY_BANDS.length - 1]; }

export const UPGRADE = {
  maxLevel: 5,
  statPerLevel: 0.08, // +8% do atributo principal por nível
  goldBase: 30,
  materials: [
    null,
    { gosma: 2, presa_lobo: 1 },
    { gosma: 3, presa_lobo: 2 },
    { insignia_goblin: 2, presa_lobo: 2 },
    { po_osso: 3, insignia_goblin: 1 },
    { fragmento_fenda: 2, po_osso: 2 },
  ],
};
