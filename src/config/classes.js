// =============================================================
// ELDORIA — Classes jogáveis e habilidades
// Tipos de habilidade são executados em src/game/skills.js
// =============================================================

export const SKILL_UNLOCKS = [1, 4, 7, 10]; // nível em que cada slot (1-4) é liberado

export const CLASSES = {
  guerreiro: {
    id: 'guerreiro',
    name: 'Guerreiro',
    title: 'Escudo de Eldoria',
    desc: 'Combatente corpo a corpo resistente. Avança sobre os inimigos, gira a lâmina e segura a linha de frente.',
    role: 'Corpo a corpo · Resistência',
    difficulty: 1,
    primary: 'for',
    baseAttrs: { for: 8, agi: 4, int: 2, vit: 8 },
    growth: { for: 2, agi: 0.5, int: 0, vit: 1.5 },
    baseHp: 110, hpPerLevel: 16, hpPerVit: 10,
    resource: { id: 'furia', name: 'Fúria', max: 100, start: 20, regen: 0, decayOutOfCombat: 3, onHit: 7, onHurt: 4, color: '#ff7a3d' },
    moveSpeed: 5.3,
    baseDef: 6,
    weaponKinds: ['espada', 'machado', 'montante'],
    startWeapon: 'espada_curta',
    colors: { tunic: 0x9c3b2e, pants: 0x4a3a2c, trim: 0xd9b25f, skin: 0xe8b98f, hair: 0x5a3a22 },
    dodge: { name: 'Rolamento', dist: 6.4, dur: 0.62, cd: 1.5, iframes: 0.42, anim: 'roll' },
    basic: {
      name: 'Corte', type: 'melee', range: 2.9, arc: 115, mult: 1.0, cd: 0.62, maxTargets: 4,
      comboEvery: 3, comboMult: 1.35, desc: 'Golpe em arco. Todo 3º golpe é reforçado.',
    },
    skills: [
      { id: 'redemoinho', name: 'Redemoinho', type: 'whirl', cd: 5, cost: 25, mult: 0.95, radius: 3.8, ticks: 2, tickGap: 0.22,
        color: 0xffc061, desc: 'Gira a arma e atinge todos ao redor duas vezes.' },
      { id: 'investida', name: 'Investida', type: 'charge', cd: 8, cost: 0, gain: 15, mult: 1.3, dist: 8, dur: 0.26, stun: 1.1, width: 1.6,
        color: 0xffe2a0, desc: 'Avança e atordoa todos no caminho. Gera 15 de Fúria.' },
      { id: 'muralha', name: 'Muralha de Ferro', type: 'guard', cd: 15, cost: 20, shield: 0.1, shieldDur: 10, taunt: 9, tauntDur: 4, color: 0xffd36b, desc: 'Ergue uma barreira de 10% da sua vida máxima que absorve o dano. Dura 10 s (ou até quebrar). Recarga de 15 s. Provoca inimigos próximos.' },
      { id: 'sismico', name: 'Golpe Sísmico', type: 'quake', cd: 12, cost: 40, mult: 2.8, range: 8.5, arc: 70, knock: 4, slow: 0.5, slowDur: 2.5,
        color: 0xff9a4a, desc: 'Golpeia o chão: onda em cone que arremessa e desacelera.' },
    ],
  },

  arqueiro: {
    id: 'arqueiro',
    name: 'Arqueiro',
    title: 'Olho da Névoa',
    desc: 'Atirador ágil e preciso. Mantém distância, cobre áreas com flechas e escapa com saltos.',
    role: 'À distância · Mobilidade',
    difficulty: 2,
    primary: 'agi',
    baseAttrs: { for: 3, agi: 9, int: 3, vit: 6 },
    growth: { for: 0, agi: 2, int: 0.5, vit: 1.2 },
    baseHp: 85, hpPerLevel: 10, hpPerVit: 7, // menos vida que o Guerreiro (ataca de longe)
    resource: { id: 'energia', name: 'Energia', max: 100, start: 100, regen: 13, color: '#c9e85a' },
    moveSpeed: 5.6,
    baseDef: 3,
    weaponKinds: ['arco', 'arco_longo'],
    startWeapon: 'arco_curto',
    colors: { tunic: 0x3f6b3a, pants: 0x4c3f2f, trim: 0x8fd0ff, skin: 0xd9a77e, hair: 0x2b2420 },
    dodge: { name: 'Cambalhota', dist: 7, dur: 0.58, cd: 1.2, iframes: 0.4, anim: 'roll' },
    basic: {
      name: 'Flecha', type: 'projectile', proj: 'flecha', range: 18, speed: 44, mult: 0.8, cd: 0.56, radius: 0.55,
      desc: 'Dispara uma flecha rápida.' },
    skills: [
      { id: 'multiplo', name: 'Rajada Tripla', type: 'burst', cd: 4, cost: 30, mult: 0.75, count: 3, gap: 0.15, range: 18, speed: 48,
        color: 0xd8f07a, desc: 'Atira 3 flechas seguidas, bem rápido, no mesmo alvo.' },
      { id: 'perfurante', name: 'Flecha Perfurante', type: 'pierce', cd: 7, cost: 35, mult: 1.6, range: 21, speed: 56, radius: 0.9,
        color: 0x6ff3ff, desc: 'Flecha carregada que atravessa todos os inimigos em linha.' },
      { id: 'agilidade', name: 'Agilidade do Vento', type: 'haste', cd: 12, cost: 20, dur: 5, speed: 0.1, aspd: 0.1,
        color: 0xa9ffd0, desc: 'Por 5 segundos fica 10% mais rápido para andar e para atirar.' },
      { id: 'chuva', name: 'Chuva de Flechas', type: 'rain', cd: 14, cost: 50, mult: 0.5, radius: 4.6, ticks: 7, tickGap: 0.4, range: 16,
        color: 0xe6ff9a, desc: 'Uma chuva de flechas cai sobre a área alvo por 3s.' },
    ],
  },

  mago: {
    id: 'mago',
    name: 'Mago',
    title: 'Tecelão das Fendas',
    desc: 'Conjurador de energia arcana. Explosões em área, controle de grupos e teleporte.',
    role: 'Magia à distância · Controle',
    difficulty: 3,
    primary: 'int',
    baseAttrs: { for: 2, agi: 3, int: 10, vit: 5 },
    growth: { for: 0, agi: 0.5, int: 2.2, vit: 1 },
    baseHp: 75, hpPerLevel: 8.5, hpPerVit: 6, // o mais frágil
    resource: { id: 'mana', name: 'Mana', max: 100, start: 100, regen: 6.5, color: '#4fa3ff' },
    moveSpeed: 5.4,
    baseDef: 2,
    weaponKinds: ['varinha', 'cajado', 'orbe'],
    startWeapon: 'varinha',
    colors: { tunic: 0x3b3f9c, pants: 0x2b2d55, trim: 0x5ef0ff, skin: 0xf0c8a0, hair: 0xd8d8e8 },
    dodge: { name: 'Passo Etéreo', dist: 4.8, dur: 0.22, cd: 1.5, iframes: 0.3, anim: 'phase' },
    basic: {
      name: 'Fagulha Arcana', type: 'projectile', proj: 'arcano', range: 16.5, speed: 28, mult: 1.0, cd: 0.66, radius: 0.7, homing: 4.2,
      desc: 'Projétil arcano que persegue levemente o alvo.' },
    skills: [
      { id: 'bola_fogo', name: 'Bola de Fogo', type: 'fireball', cd: 3.5, cost: 20, mult: 1.9, radius: 3.6, range: 16, speed: 22,
        color: 0xff7a2a, desc: 'Projétil que explode em área.' },
      { id: 'gelo', name: 'Prisão de Gelo', type: 'nova', cd: 11, cost: 30, mult: 0.8, radius: 6.2, freeze: 2.6,
        color: 0x9fe8ff, desc: 'Congela todos os inimigos ao redor por 2,6s.' },
      { id: 'piscar', name: 'Piscar', type: 'blink', cd: 7, cost: 15, dist: 7.5,
        color: 0xc79bff, desc: 'Teleporta-se na direção mirada.' },
      { id: 'meteoro', name: 'Meteoro da Fenda', type: 'meteor', cd: 13, cost: 45, mult: 4.4, radius: 4.2, delay: 1.0, range: 16,
        color: 0xff4fd8, desc: 'Invoca um meteoro arcano sobre a área alvo após 1s.' },
    ],
  },
};

export const CLASS_LIST = ['guerreiro', 'arqueiro', 'mago'];
