// =============================================================
// ELDORIA — Bestiário. Valores base no nível 1; escalam via BALANCE.enemyScale.
// aggro: 'passive' (só reage se atacado) | 'aggressive'
// =============================================================

// ---------- Monstros da Fenda (Ermos e Confins) ----------
// Todos seguem a mesma régua: cada PAPEL tem atributos-base (equivalentes ao nível 1, como os do vale)
// e o NÍVEL do monstro faz o resto (BALANCE.enemyScale). XP e ouro saem da vida e do dano, então
// um monstro mais forte sempre dá mais. Velocidade e alcance dependem só do papel.
const ROLES = {
  enxame:     { model: 'slime',    size: 1.4,  hp: 90,  dmg: 14, def: 2,  speed: 3.2, range: 1.9, atkCd: 1.45, windup: 0.4,  detect: 11, leash: 30, assist: 9, staggerable: true, loot: 'fenda_fraco', tag: 'Corpo a corpo · lento · em bando' },
  cacador:    { model: 'wolf',     size: 1.15, hp: 150, dmg: 18, def: 4,  speed: 6.8, range: 2.2, atkCd: 1.2,  windup: 0.3,  lunge: 3.4, detect: 17, leash: 38, assist: 15, pack: true, staggerable: true, loot: 'fenda', tag: 'Corpo a corpo · muito rápido · dá o bote' },
  guerreiro:  { combo: 3, model: 'skeleton', size: 1.15, hp: 240, dmg: 26, def: 10, speed: 3.8, range: 2.5, atkCd: 1.5,  windup: 0.55, detect: 13, leash: 30, assist: 10, patrol: true, staggerable: false, loot: 'fenda', tag: 'Corpo a corpo · golpes pesados · resistente' },
  saqueador:  { combo: 2, model: 'goblin',   size: 0.95, hp: 190, dmg: 20, def: 7,  speed: 5.1, range: 2.0, atkCd: 1.0,  windup: 0.26, detect: 14, leash: 32, assist: 12, patrol: true, staggerable: true, loot: 'fenda', tag: 'Corpo a corpo · ataques rápidos' },
  atirador:   { model: 'goblin',   size: 0.88, variant: 'sling', hp: 130, dmg: 17, def: 3, speed: 4.7, range: 14, atkCd: 1.9, windup: 0.5, ranged: { proj: 'pedra', speed: 19 }, kite: 6, detect: 16, leash: 30, assist: 10, staggerable: true, loot: 'fenda', tag: 'À distância (14 m) · foge quando você chega perto' },
  arqueiro:   { model: 'skeleton', size: 1.05, hp: 150, dmg: 19, def: 5,  speed: 3.6, range: 17, atkCd: 2.1,  windup: 0.6,  ranged: { proj: 'flecha', speed: 30 }, kite: 7, detect: 19, leash: 32, assist: 10, staggerable: true, loot: 'fenda', tag: 'À distância (17 m) · flechas rápidas' },
  conjurador: { model: 'skeleton', size: 1.1,  hp: 165, dmg: 23, def: 4,  speed: 3.4, range: 15, atkCd: 2.4,  windup: 0.8,  ranged: { proj: 'arcano', speed: 14 }, kite: 8, detect: 17, leash: 30, assist: 10, staggerable: true, loot: 'fenda', tag: 'À distância (15 m) · magia lenta mas forte' },
  fera:       { combo: 2, model: 'quad', species: 'javali', size: 1.1, hp: 250, dmg: 25, def: 9, speed: 5.3, range: 2.5, atkCd: 1.5, windup: 0.45, lunge: 4, detect: 15, leash: 34, assist: 12, staggerable: false, loot: 'fenda', tag: 'Corpo a corpo · fera pesada · investe e emenda golpes' },
  fera_elite: { combo: 3, model: 'quad', species: 'javali', size: 1.9, hp: 640, dmg: 36, def: 15, speed: 5.6, range: 3.2, atkCd: 1.9, windup: 0.7, lunge: 5.5, detect: 15, leash: 24, assist: 0, elite: true, staggerable: false, loot: 'fenda_elite', tag: 'Elite · investidas e combos de 3 golpes' },
  bruto:      { combo: 2, model: 'golem',    size: 1.6,  hp: 620, dmg: 38, def: 16, speed: 2.9, range: 3.1, atkCd: 2.3,  windup: 0.95, slam: { radius: 4 }, detect: 13, leash: 20, assist: 0, elite: true, staggerable: false, loot: 'fenda_elite', tag: 'Elite · corpo a corpo · golpe em área' },
};
export function fendaMob(role, name, color, extra = {}, behavior = '') {
  const r = ROLES[role];
  const m = { ...r, ...extra, name, color, role };
  if (extra.ranged) m.ranged = { ...r.ranged, ...extra.ranged };
  m.xp = Math.round(m.hp * 0.25 + m.dmg * 0.8);
  m.gold = [Math.round(m.xp * 0.15), Math.round(m.xp * 0.3)];
  m.aggro = 'aggressive';
  m.behavior = (behavior ? behavior + ' ' : '') + r.tag + '.';
  delete m.tag;
  return m;
}

// NOMES (v0.11): sempre 1 ou 2 palavras. A versão MAIS FORTE de um monstro usa o mesmo nome em OUTRA COR (nameTint),
// em vez de uma palavra a mais: azul = versão da Fenda · roxo = versão forte (alfa) · vermelho = campeão/chefe.
// Regra: dois monstros diferentes nunca têm o mesmo nome E a mesma cor (o teste confere).
export const NAME_TINTS = { azul: '#4aa8ff', roxo: '#b974ff', vermelho: '#ff4a4a' };
export const tintOf = (def) => (def && NAME_TINTS[def.nameTint]) || null;

export const ENEMIES = {
  slime: {
    name: 'Slime', model: 'slime', color: 0x5fe8a8, size: 1.12,
    hp: 68, dmg: 17, def: 0, speed: 2.7, range: 1.7, atkCd: 1.6, windup: 0.38,
    aggro: 'passive', detect: 8, leash: 22, assist: 6,
    xp: 14, gold: [2, 6], loot: 'slime', staggerable: true,
    behavior: 'Passivo. Só ataca quando provocado; slimes vizinhos ajudam.',
  },
  // Chefe das Ruínas: Lorde dos Ossos. 18.000 de vida no nível 14
  rei_esqueleto: {
    combo: 3,
    name: 'Rei Esqueleto', model: 'skeleton', variant: 'rei', color: 0xe8e0cc, size: 2.1,
    hp: 2217.295, dmg: 22, def: 12, speed: 3.6, range: 3.2, atkCd: 1.7, windup: 0.6,
    aggro: 'aggressive', detect: 11, leash: 34, assist: 0, base: 'skeleton', boneLord: true, glow: 0x7fd8ff,
    xp: 1400, gold: [200, 320], loot: 'evento_chefe', staggerable: false, elite: true, miniboss: true,
    behavior: 'Rei esqueleto das Ruínas. Combo de 3 golpes com a espadona. ESPADA GIRATÓRIA: arremessa a espada, que vai e volta (desvie das duas vezes). MÃOS DO TÚMULO: ossos brotam do chão embaixo de você e prendem. INVESTIDA DE ESCUDO: corre em linha reta e derruba. Em 66% e 33% levanta esqueletos e fica mais rápido.',
  },
  // Primeiro chefe: Rei Slime. 10.000 de vida (5556 × 1,8 dos chefes), bate pouco, mas tem golpes de chefe
  rei_slime: {
    name: 'Rei Slime', model: 'slime', variant: 'rei', color: 0x5fe8a8, size: 3.6,
    hp: 5000, dmg: 13, def: 2, speed: 2.4, range: 3.6, atkCd: 2.0, windup: 0.6,
    aggro: 'passive', detect: 14, leash: 32, assist: 0, base: 'slime', kingSlime: true,
    xp: 600, gold: [120, 200], loot: 'evento_chefe', staggerable: false, elite: true, miniboss: true,
    behavior: 'O primeiro chefe. Só luta se for atacado. SUPER SALTO: pula alto e cai em cima de você (saia do círculo). CHUVA DE GOSMA: cospe bolas que caem nos círculos verdes e deixam lento. Em 66% e 33% de vida se divide em slimes menores e fica mais rápido.',
  },
  wolf: {
    name: 'Lobo', model: 'wolf', color: 0x8b8178, size: 1.0,
    hp: 110, dmg: 15, def: 3, speed: 6.6, range: 2.1, atkCd: 1.3, windup: 0.32, lunge: 3.2,
    aggro: 'aggressive', detect: 13, leash: 30, assist: 14, pack: true,
    xp: 30, gold: [3, 9], loot: 'wolf', staggerable: true,
    behavior: 'Caça em matilha: ao avistar você, uiva e chama os lobos próximos. Avança com um bote.',
  },
  goblin: {
    name: 'Goblin', model: 'goblin', color: 0x7fae3e, size: 0.8,
    hp: 135, dmg: 16, def: 5, speed: 5.0, range: 1.9, atkCd: 1.1, windup: 0.26,
    aggro: 'aggressive', detect: 12, leash: 28, assist: 10, fleeAt: 0.25,
    xp: 40, gold: [8, 18], loot: 'goblin', staggerable: true, patrol: true,
    behavior: 'Patrulha o acampamento. Foge com pouca vida para buscar reforços.',
  },
  goblin_atirador: {
    name: 'Goblin Atirador', model: 'goblin', variant: 'sling', color: 0x93b84a, size: 0.8,
    hp: 100, dmg: 15, def: 3, speed: 4.6, range: 13, atkCd: 1.9, windup: 0.5,
    aggro: 'aggressive', detect: 15, leash: 28, assist: 10, ranged: { proj: 'pedra', speed: 17 }, kite: 6,
    xp: 42, gold: [8, 18], loot: 'goblin', staggerable: true,
    behavior: 'Arremessa pedras à distância e recua quando você se aproxima.',
  },
  skeleton: {
    combo: 2,
    name: 'Esqueleto', model: 'skeleton', color: 0xe8e1cf, size: 1.05,
    hp: 180, dmg: 21, def: 9, speed: 3.4, range: 2.3, atkCd: 1.6, windup: 0.55,
    aggro: 'aggressive', detect: 11, leash: 26, assist: 9, patrol: true, nightDetectBonus: 5,
    xp: 52, gold: [10, 22], loot: 'skeleton', staggerable: false,
    behavior: 'Vaga pelas ruínas em rotas fixas. Mais atento à noite. Golpe lento e pesado.',
  },
  guardian: {
    combo: 2,
    name: 'Guardião Corrompido', model: 'golem', color: 0x6f6a78, size: 1.55,
    hp: 460, dmg: 30, def: 16, speed: 2.9, range: 3.0, atkCd: 2.4, windup: 0.95, slam: { radius: 3.4 },
    aggro: 'aggressive', detect: 12, leash: 15, assist: 0, guard: true,
    xp: 90, gold: [25, 50], loot: 'guardian', staggerable: false, elite: true,
    behavior: 'Protege seu posto e não se afasta dele. Seu golpe em área é anunciado por um círculo no chão.',
  },
  vigia: {
    combo: 3,
    name: 'Vigia Corrompido', model: 'warden', warden: true, color: 0x2c2a3a, glow: 0x7af0ff, size: 1.75,
    hp: 820, dmg: 30, def: 16, speed: 3.4, range: 3.4, atkCd: 1.9, windup: 0.75,
    aggro: 'aggressive', detect: 16, leash: 34, assist: 0, guard: true,
    xp: 380, gold: [80, 120], loot: 'vigia', staggerable: false, elite: true, miniboss: true,
    behavior: 'Carcereiro da Cripta, com lanterna de almas e alabarda. Combo de 3 golpes e varrida em círculo. Lança CORRENTES que prendem e puxam (desvie para o lado). O OLHAR DA LANTERNA atinge quem ele enxerga: esconda-se atrás de uma coluna. Em 66% e 33% acorrenta almas: enquanto existirem, ele quase não sofre dano — destrua as almas e ele fica atordoado.',
  },
  alma_acorrentada: {
    name: 'Alma Acorrentada', model: 'slime', variant: 'alma', color: 0x7af0ff, size: 0.85,
    hp: 120, dmg: 0, def: 4, speed: 0, range: 0, atkCd: 99, windup: 1,
    aggro: 'passive', detect: 0, leash: 999, assist: 0,
    xp: 15, gold: [0, 0], loot: 'alma', staggerable: false, summon: true,
    behavior: 'Alma presa pelo Vigia. Enquanto existir, protege o Vigia. Não ataca.',
  },
  // ---------- Planície do Guardião (mapa 2): crias da Fenda ----------
  couraco: {
    name: 'Couraço', model: 'quad', species: 'couraco', color: 0x6a6480, glow: 0xd36bff, size: 1.15,
    hp: 200, dmg: 20, def: 11, speed: 3.6, range: 2.0, atkCd: 1.5, windup: 0.45,
    aggro: 'aggressive', detect: 12, leash: 28, assist: 9,
    xp: 54, gold: [10, 22], loot: 'rift', staggerable: false,
    special: { kind: 'rolar', cd: 8, windup: 0.6, dist: 10, speed: 11, mult: 1.0, color: 0xd36bff },
    behavior: 'Tatu de couraça com cristais da Fenda nas costas. Vira uma bola e rola em linha reta: saia do caminho.',
  },
  rajado: {
    name: 'Rajado', model: 'quad', species: 'rajado', color: 0x4a4468, glow: 0x5ef0ff, size: 1.1,
    hp: 125, dmg: 16, def: 4, speed: 7.0, range: 2.1, atkCd: 1.2, windup: 0.3, lunge: 3.6,
    aggro: 'aggressive', detect: 18, leash: 40, assist: 14, pack: true,
    xp: 38, gold: [5, 11], loot: 'rift', staggerable: true,
    behavior: 'Felino listrado tocado pela Fenda. Caça em bando e dá o bote de longe.',
  },
  alpha_wolf: {
    combo: 3,
    name: 'Lobo', nameTint: 'roxo', model: 'wolf', variant: 'alpha', color: 0xd8dde8, size: 1.6,
    hp: 600, dmg: 26, def: 8, speed: 7.0, range: 2.8, atkCd: 1.4, windup: 0.4, lunge: 4.5,
    aggro: 'aggressive', detect: 16, leash: 34, assist: 16, pack: true,
    xp: 320, gold: [60, 100], loot: 'alpha', staggerable: false, elite: true, rare: true,
    behavior: 'Chefe raro. Surge apenas à noite na Floresta Sussurrante.',
  },
  boss_fenda: {
    name: 'Guardião', nameTint: 'vermelho', model: 'boss', color: 0x4a4458, size: 3.1,
    hp: 16666.67, dmg: 108, def: 18, speed: 3.7, range: 4.6, atkCd: 2.0, windup: 0.7, // 30.000 de vida (× 1,8 dos chefes)
    aggro: 'aggressive', detect: 20, leash: 26, assist: 0, guard: true,
    xp: 4200, gold: [300, 450], loot: 'boss', staggerable: false, elite: true, boss: true,
    behavior: 'Antigo protetor do Selo, consumido pela fenda. Três fases; ataques fortes sempre têm aviso no chão.',
  },
    ...fendaMobs(),
  ...confinsMobs(),
};

// Ermos da Fenda: bichos de casca (besouro, aranha, caranguejo), a gárgula e o jabuti de cristal,
// e a corte do Trono Partido (mago, cavaleiro negro e arauto). Nada de gosma, goblin, lobo ou esqueleto aqui.
function fendaMobs() {
  const F = fendaMob;
  return {
    besouro_brasa: F('enxame', 'Besouro', 0x3a2418, { special: { kind: 'rolar', cd: 8, windup: 0.6, dist: 10, speed: 11, mult: 1.0, color: 0xff7a2a }, model: 'quad', species: 'besouro', size: 1.15, glow: 0xff7a2a, def: 6 }, 'Besouros de casco quente que andam em bando pelas cinzas.'),
    aranha_galhos: F('cacador', 'Aranha', 0x2a2232, { special: { kind: 'teia', cd: 7, windup: 0.5 }, model: 'quad', species: 'aranha', size: 1.25, glow: 0xc04cff }, 'Desce das árvores mortas e dá o bote.'),
    caranguejo_abissal: F('enxame', 'Caranguejo Abissal', 0x4a3a8a, { special: { kind: 'casco', cd: 11, windup: 0.3, recover: 0.2 }, model: 'quad', species: 'caranguejo', size: 1.2, glow: 0x7ad0ff, hp: 110, def: 10, speed: 3.6 }, 'Casco duro; sai do lago em grupos.'),
    conjurador_afogado: F('conjurador', 'Mago Coral', 0x3a5a7a, { form: 'afogado', special: { kind: 'circulo', element: 'agua', cd: 10, windup: 0.7, anim: 'throw', color: 0x7ad0ff }, model: 'cultist', skin: 0x8ab0b8, ranged: { proj: 'arcano', color: 0x7ad0ff } }, 'Feiticeiros do Lago Violeta, com coroa de coral e algas. Lançam orbes de água.'),
    gargula: F('guerreiro', 'Gárgula', 0x6e6a72, { model: 'beastman', beast: 'gargula', size: 1.2, glow: 0xff8a3a, combo: 2, hp: 250, dmg: 27, speed: 4.4, special: { kind: 'salto', cd: 8, windup: 0.6, mult: 1.3, color: 0xff8a3a } }, 'Pedra viva com asas: fica parada como estátua nas falésias e no Ossário e cai em cima de você.'),
    jabuti: F('fera_elite', 'Jabuti', 0x3a5a4a, { species: 'jabuti', size: 1.9, glow: 0x5ef0ff, speed: 3.6, lunge: 2.5, hp: 700, def: 20, special: { kind: 'patada', cd: 8, windup: 0.9, radius: 5.5, mult: 1.3, color: 0x5ef0ff } }, 'Jabuti gigante com cristais da Fenda no casco. Bate as patas e os cristais explodem em volta.'),
    cavaleiro_trono: F('guerreiro', 'Cavaleiro Negro', 0x2a2434, { form: 'negro', model: 'knight', size: 1.2, hp: 280, dmg: 30, glow: 0xff3b2f }, 'Os últimos defensores do trono caído.'),
    arauto_fenda: F('conjurador', 'Arauto Flamejante', 0x6a1a22, { form: 'arauto', special: { kind: 'circulo', element: 'fogo', cd: 9, windup: 0.7, anim: 'throw', count: 3, color: 0xff6a2a }, model: 'cultist', ranged: { proj: 'fogo', color: 0xff6a2a }, dmg: 27 }, 'Invoca fogo da Fenda; fique em movimento.'),
  };
}

// ---------- Confins de Eldoria (níveis 65–165): uma família por bioma ----------
function confinsMobs() {
  const F = fendaMob;
  return {
    // Planícies Douradas: javalis e minotauros
    javali: F('fera', 'Javali', 0x6e4e36, { species: 'javali', glow: 0xff7a3a, hp: 230, dmg: 23 }, 'Javali bravo das planícies: abaixa a cabeça e dá chifrada com as presas.'),
    javali_dourado: F('fera', 'Javali Dourado', 0xa8824a, { species: 'javali', glow: 0xffd34a }, 'Cerdas de ouro. Mais forte que o javali comum e anda perto dos minotauros.'),
    minotauro: F('fera', 'Minotauro', 0x6a4a32, { model: 'beastman', beast: 'touro', size: 1.35, glow: 0xff3b2f, hp: 280, dmg: 27, range: 2.8, special: { kind: 'carga', cd: 7, windup: 0.8, dist: 14, speed: 15, mult: 1.4, punish: 1.0 } }, 'Abaixa os chifres e investe em linha reta: role para o lado.'),
    javali_rei: F('fera_elite', 'Javali-Rei', 0x8a6a3a, { species: 'javali', glow: 0xff5a2a }, 'O maior javali das planícies, com coroa de presas. Investe e emenda golpes.'),
    // Pântano Sombrio: sapos, homens-lagarto e o jacaré
    sapo: F('cacador', 'Sapo-Boi', 0x5a7a3a, { model: 'quad', species: 'sapo', size: 1.25, glow: 0xd8ff5a, hp: 170, def: 6, speed: 5.6, special: { kind: 'teia', cd: 7, windup: 0.45, color: 0xff8aa0 } }, 'Coaxa alto e chama o bando. Gruda a língua em você (deixa lento) e salta para morder.'),
    homem_lagarto: F('saqueador', 'Homem-Lagarto', 0x4a7a4a, { special: { kind: 'lanca', cd: 5, windup: 0.45 }, model: 'lizardman', size: 1.1, hp: 200, dmg: 21 }, 'Caça em grupo com lanças na lama.'),
    jacare: F('fera_elite', 'Jacaré-Açu', 0x3e4a2e, { species: 'jacare', size: 1.7, glow: 0xffd23a, speed: 4.6, hp: 680, special: { kind: 'carga', cd: 8, windup: 0.7, dist: 12, speed: 15, mult: 1.4, color: 0x9aff5a } }, 'O rei da lama: dispara de repente pela margem e fecha a bocarra. Saia da frente da investida.'),
    // Deserto de Âmbar: basilisco, escorpião e a esfinge
    basilisco: F('cacador', 'Basilisco', 0xc8904a, { model: 'quad', species: 'basilisco', size: 1.3, glow: 0xffd23a, hp: 160, def: 8, special: { kind: 'sopro', cd: 7, windup: 0.6, color: 0xffb040 } }, 'Lagarto de chifres do deserto. Corre rápido e sopra areia quente em cone.'),
    escorpiao_ambar: F('cacador', 'Escorpião', 0xc88a3a, { special: { kind: 'ferroada', cd: 6, windup: 0.55, color: 0x7aff5a }, model: 'quad', species: 'escorpiao', size: 1.3, glow: 0xffb040, hp: 140, def: 8 }, 'Pinças fortes e ferrão rápido.'),
    esfinge: F('fera_elite', 'Esfinge', 0xd8b070, { species: 'esfinge', size: 1.8, glow: 0x5ad8ff, speed: 5.0, hp: 700, special: { kind: 'salto', cd: 8, windup: 0.7, mult: 1.5, color: 0x5ad8ff } }, 'Guardiã das dunas: leoa alada com coroa de faraó. Salta de longe e cai com as garras.'),
    // Floresta Esmeralda: cogumelos andantes, cervos, lobisomens e o Ente
    cogumelo: F('conjurador', 'Cogumelo', 0xc84a3a, { model: 'fungo', size: 1.1, skin: 0xf0e6d0, glow: 0x9aff6a, ranged: { proj: 'arcano', color: 0xb8ff6a }, special: { kind: 'circulo', element: 'veneno', cd: 9, windup: 0.8, count: 3, color: 0x9aff5a } }, 'Cogumelo andante: solta esporos de longe e espalha nuvens venenosas no chão.'),
    cervo_espinhoso: F('cacador', 'Cervo Espinhoso', 0x6a5a3a, { model: 'quad', species: 'cervo', size: 1.1, glow: 0x7affb0 }, 'Galhada de espinhos que brilham. Dá marradas e coices.'),
    lobisomem: F('cacador', 'Lobisomem', 0x5a4a3c, { model: 'beastman', beast: 'lobo', size: 1.3, glow: 0xffd23a, combo: 3, windup: 0.28, hp: 230, dmg: 24, def: 7, speed: 7.2, range: 2.4, special: { kind: 'salto', cd: 7, windup: 0.6, mult: 1.4, color: 0xffd23a } }, 'Garras rápidas em sequência de 3 e um salto por cima de você.'),
    guardiao_bosque: F('bruto', 'Ente Ancião', 0x5a4a2e, { special: { kind: 'raizes', cd: 8, windup: 0.5, anim: 'cast' }, model: 'treant', size: 1.55, glow: 0x9aff6a, leaf: 0x3a8a3a }, 'Árvore viva que protege o coração da floresta.'),
    // Tundra Gélida: morsa, urso polar, yeti e o titã
    morsa: F('fera', 'Morsa', 0x8a6a5a, { species: 'morsa', size: 1.35, glow: 0x9fe8ff, speed: 4.4, hp: 290, def: 12, special: { kind: 'patada', cd: 7, windup: 0.8, radius: 4.2, color: 0x9fe8ff } }, 'Pesadona: escorrega pelo gelo e se joga de barriga no chão, rachando o gelo em volta.'),
    urso_polar: F('fera', 'Urso Polar', 0xe8eef4, { species: 'urso', size: 1.15, glow: 0x7ad0ff }, 'Fica de pé nas patas de trás e desaba com as duas patas.'),
    yeti: F('fera', 'Yeti', 0xe8eef4, { yetiSkills: true, model: 'beastman', beast: 'yeti', size: 1.5, glow: 0x7ad0ff, hp: 340, dmg: 30, range: 2.9, special: { kind: 'patada', cd: 6, windup: 0.9, radius: 4.5, color: 0x9fe8ff } }, 'Esmurra o chão e congela quem estiver perto. Arranca uma bola de gelo gigante do chão e arremessa (deixa lento) e carrega um salto enorme para a frente.'),
    tita_gelo: F('bruto', 'Titã Gélido', 0x9ac4e0, { model: 'titan', titan: 'gelo', size: 2.6, glow: 0x9fe8ff, weapon: 'clava', hp: 760, dmg: 42, range: 3.9, slam: { radius: 4.8 }, iceTitan: true, special: { kind: 'patada', cd: 9, windup: 1.1, radius: 7, mult: 1.35, color: 0x9fe8ff } }, 'Um gigante de 5 metros. A clava racha o gelo num raio enorme.'),
    // Terras de Magma: rinoceronte, salamandra, cérbero e o titã
    rinoceronte: F('fera', 'Rinoceronte', 0x2e2626, { species: 'rinoceronte', size: 1.4, glow: 0xff6a1a, hp: 300, def: 14, special: { kind: 'carga', cd: 7, windup: 0.8, dist: 14, speed: 16, mult: 1.4, punish: 1.0, color: 0xff6a1a } }, 'Couro de obsidiana e chifre em brasa. Raspa a pata e investe em linha reta: role para o lado.'),
    salamandra_magma: F('cacador', 'Salamandra', 0x3a1a14, { model: 'quad', species: 'salamandra', size: 1.4, glow: 0xff6a1a }, 'Corpo comprido e baixo, crista de fogo. Rápida e traiçoeira.'),
    cerbero: F('cacador', 'Cérbero', 0x2a1612, { model: 'quad', species: 'cerbero', size: 1.35, glow: 0xff6a1a, combo: 2, hp: 210, dmg: 25, def: 8, special: { kind: 'sopro', cd: 7, windup: 0.6, color: 0xff7a2a } }, 'Três cabeças: morde duas vezes e cospe fogo em cone.'),
    tita_magma: F('bruto', 'Titã Ígneo', 0x3a2420, { magmaSkills: true, model: 'titan', titan: 'magma', size: 2.6, glow: 0xff6a1a, weapon: 'montante', hp: 780, dmg: 43, range: 4.0, slam: { radius: 4.8 }, special: { kind: 'circulo', element: 'fogo', cd: 9, windup: 0.8, count: 4, color: 0xff5a1a } }, 'Rocha derretida com uma espada do tamanho de uma árvore. Chama meteoros.'),
    // Picos do Fim do Mundo: medusas do vazio, o cérebro abissal e o titã
    medusa: F('conjurador', 'Medusa', 0x6a4ad8, { model: 'medusa', size: 1.5, glow: 0x5ef0ff, speed: 2.8, hp: 220, dmg: 28, ranged: { proj: 'arcano', color: 0x5ef0ff }, special: { kind: 'circulo', element: 'arcano', cd: 8, windup: 0.7, count: 3, color: 0x5ef0ff } }, 'Água-viva do vazio que flutua entre os picos. Dispara raios e faz chover choques nos círculos.'),
    cerebro_abissal: F('conjurador', 'Cérebro Abissal', 0xc88aa8, { brainDash: true, model: 'brain', size: 2.4, glow: 0xc8a0ff, speed: 2.6, hp: 290, dmg: 33, ranged: { proj: 'arcano', color: 0xc8a0ff }, special: { kind: 'circulo', element: 'arcano', cd: 8, windup: 0.7, count: 3, color: 0xc8a0ff } }, 'Um cérebro gigante que flutua e chove orbes do céu. Avança 3 vezes seguidas, mudando a mira a cada investida.'),
    tita_fenda: F('bruto', 'Titã Astral', 0x2e2a40, { model: 'titan', titan: 'fenda', size: 2.9, glow: 0xc8a0ff, cape: 0x2a1a4a, weapon: 'montante', hp: 900, dmg: 46, range: 4.2, slam: { radius: 5 }, special: { kind: 'salto', cd: 9, windup: 0.9, mult: 1.6, color: 0xc8a0ff } }, 'O guardião mais forte dos picos. Salta e cai sobre você.'),
  };
}

// Habilidades do chefe (tempos em segundos)
export const BOSS = {
  level: 25,
  phases: [
    { at: 1.0, name: 'Despertar' },
    { at: 0.6, name: 'Fúria da Fenda', speedMult: 1.25, roar: true },
    { at: 0.25, name: 'Colapso', speedMult: 1.4, windupMult: 0.8 },
  ],
  attacks: {
    swipe:   { windup: 0.6, range: 4.8, arc: 120, mult: 1.0, cd: 1.6 },
    slam:    { windup: 1.35, radius: 6.5, mult: 1.9, cd: 7 },
    charge:  { windup: 1.05, dist: 20, width: 3.2, speed: 26, mult: 1.6, cd: 9 },
    shards:  { windup: 1.2, count: 6, radius: 2.6, mult: 1.25, cd: 8, minPhase: 1 },
    wave:    { windup: 0.95, maxR: 18, speed: 13, width: 1.1, mult: 1.1, cd: 10, minPhase: 1 },
    summon:  { count: 3, type: 'couraco', atHp: 0.42 },
  },
};

// ---------- Campeões de evento: o chefe da última onda ----------
// Versão maior e mais forte de um monstro da região, com golpe de choque a cada 3 ataques (como o Vigia).
// O saque é de chefe: de 1 a 3 itens, cada um sorteado entre quem lutou (mais dano = mais chance).
function champion(baseId, name, o = {}, look = {}) {
  const b = ENEMIES[baseId];
  const m = {
    // nome em cor própria (não herda a cor do monstro base). v0.12: as marcas de chefe tinham ficado dentro do comentário
    ...b, name, nameTint: o.nameTint, base: baseId, champLook: look, elite: true, eventBoss: true, miniboss: true, staggerable: false, pack: false, patrol: false, rare: false,
    size: (b.size || 1) * (o.size || 1.32) * 1.5, hp: Math.round(b.hp * (o.hp || (b.elite ? 2.1 : 3.4))), dmg: Math.round(b.dmg * (o.dmg || 1.25)),
    def: Math.round((b.def || 0) * 1.3), xp: Math.round(b.xp * (b.elite ? 1.5 : 3)), loot: 'evento_chefe', assist: 0, leash: 60, detect: 30,
    gold: [Math.round((b.gold?.[0] || 5) * 3), Math.round((b.gold?.[1] || 10) * 3)],
    behavior: 'Campeão de evento: chega na última onda, entra em fúria em 66% e 33% de vida (chama ajudantes e solta onda de choque) e marca o chão embaixo dos jogadores para explodir. ' + (b.behavior || ''),
  };
  if (b.ranged) m.ranged = { ...b.ranged };
  return m;
}
Object.assign(ENEMIES, {
  // Vale
  campeao_ruptura: champion('wolf', 'Lobo', { nameTint: 'vermelho', size: 1.45 }, { crown: 'cristais', metal: 0x2a1640, glow: 0xff4fd8, tint: 0x0a0414, tintK: 0.6 }),
  // Chefe Goblin Saqueador: agora é chefe SOLO do Acampamento Goblin (nasce sozinho, como o Rei Slime e o Lorde dos Ossos)
  campeao_goblin: champion('goblin', 'Goblin', { nameTint: 'vermelho', size: 1.5 }, { crown: 'coroa', cape: 0x8a1c1c, glow: 0xffd24a, tint: 0x6a2a10, tintK: 0.4 }),
  // chefe da raid Invasão Goblin: o capitão que comanda a horda, atira pedras de longe e chama atiradores
  campeao_horda: champion('goblin_atirador', 'Capitão Goblin', { size: 1.55, hp: 3.6 }, { crown: 'chifres', metal: 0x3a2a14, cape: 0x2a5a1a, pauldron: 0x4a3a1a, glow: 0x9aff5a, tint: 0x1a3a08, tintK: 0.45 }),
  campeao_ossos: champion('skeleton', 'Esqueleto', { nameTint: 'vermelho', size: 1.35 }, { crown: 'chifres', metal: 0x1a1428, glow: 0x7af0ff, cape: 0x23153a, pauldron: 0x2a2440, tint: 0x2a2048, tintK: 0.62 }),
  // Ermos
  campeao_abissal: champion('caranguejo_abissal', 'Caranguejo Abissal', { nameTint: 'vermelho', size: 1.3 }, { crown: 'cristais', metal: 0x2a1640, glow: 0xc86bff, tint: 0x2a0a40, tintK: 0.3, crownK: 1.4 }),
  campeao_osso: champion('cavaleiro_trono', 'Cavaleiro Negro', { nameTint: 'vermelho' }, { crown: 'chifres', metal: 0x14121a, glow: 0x7dff4a, cape: 0x0e1a10, pauldron: 0x1a1a22, tint: 0x1a2418, tintK: 0.72 }),
  campeao_colosso: champion('jabuti', 'Jabuti', { nameTint: 'vermelho', size: 1.1 }, { crown: 'cristais', metal: 0x3a4a6a, glow: 0xffffff, tint: 0x0a2a4a, tintK: 0.55 }),
  // Confins
  campeao_minotauro: champion('minotauro', 'Rei Minotauro', {}, { crown: 'coroa', cape: 0x9a1a1a, glow: 0xffd24a, tint: 0x2a0e06, tintK: 0.45 }),
  campeao_lagarto: champion('homem_lagarto', 'Rei Lagarto', { size: 1.4 }, { crown: 'chifres', metal: 0x5a4a2a, glow: 0x9aff5a, cape: 0x1e3a1a, pauldron: 0x4a5a2a, tint: 0x0e2a12, tintK: 0.5 }),
  campeao_cerebro: champion('cerebro_abissal', 'Cérebro-Colmeia', { size: 1.4 }, { crown: 'aureola', metal: 0x2a1a4a, glow: 0xc8a0ff, tint: 0x4a1a6a, tintK: 0.3, crownK: 1.1 }),
  campeao_lobisomem: champion('lobisomem', 'Lobisomem', { nameTint: 'vermelho' }, { crown: 'aureola', metal: 0xc8d0e8, glow: 0xe8f0ff, cape: 0x2a1a3a, pauldron: 0x5a5a6a, tint: 0x1a1a2a, tintK: 0.3 }),
  campeao_escorpiao: champion('escorpiao_ambar', 'Escorpião-Rainha', { size: 1.45 }, { crown: 'coroa', glow: 0xffb02a, tint: 0x4a1004, tintK: 0.5 }),
  campeao_tita_gelo: champion('tita_gelo', 'Titã Gélido', { nameTint: 'vermelho', size: 1.0 }, { crown: 'cristais', metal: 0xd8f0ff, glow: 0x9fe8ff, cape: 0x1a3a6a, pauldron: 0xbfe0ff, tint: 0x0a1a4a, tintK: 0.35 }),
  campeao_tita_magma: champion('tita_magma', 'Titã Ígneo', { nameTint: 'vermelho', size: 1.0 }, { crown: 'chifres', metal: 0x1a0a08, glow: 0xff6a1a, cape: 0x8a1a08, pauldron: 0x2a1410, tint: 0x0a0404, tintK: 0.3 }),
  campeao_tita_fenda: champion('tita_fenda', 'Titã Astral', { nameTint: 'vermelho', size: 1.0 }, { crown: 'aureola', metal: 0x1a1030, glow: 0xff4fd8, cape: 0x2a0a3a, pauldron: 0x2a1a40, tint: 0x14082a, tintK: 0.35 }),
});

// =============================================================
// NATAL (evento de temporada — liga/desliga em config/seasonal.js)
// Três chefes do mundo que nascem em lugar aleatório do Vale ou dos Ermos, com aviso para todo o servidor.
// Vida fixa (não muda com o nível). Têm golpe normal, tiro básico de longe, golpes variados e chamam bonecos de neve.
// =============================================================
const NATAL_BASE = { aggro: 'aggressive', detect: 22, leash: 70, assist: 0, elite: true, miniboss: true, eventBoss: true, worldBoss: true, natal: true, staggerable: false, pack: false, patrol: false, rare: false, loot: 'natal', base: 'mini_boneco', bossItems: 1 }; // bossItems: só 1 item por vitória
Object.assign(ENEMIES, {
  noel: {
    ...NATAL_BASE, name: 'Noel', model: 'noel', color: 0xc81e1e, size: 3.5, glow: 0xffd24a,
    hp: 2000, fixedHp: 200000, dmg: 30, def: 16, speed: 4.3, range: 4.6, atkCd: 1.7, windup: 0.6, lunge: 2.5, combo: 3,
    xp: 7000, gold: [1500, 2500],
    specials: [
      { kind: 'circulo', cd: 9, windup: 0.75, count: 5, color: 0xff3b3b, name: 'Chuva de Presentes' },
      { kind: 'salto', cd: 11, windup: 0.8, color: 0xffd24a, name: 'Salto do Trenó' },
      { kind: 'carga', cd: 10, windup: 0.7, dist: 14, color: 0xff3b3b, name: 'Investida com o Saco' },
      { kind: 'patada', cd: 8, windup: 0.7, radius: 5, color: 0xffffff, name: 'Tremor de Neve' },
      { kind: 'invocar', cd: 20, windup: 0.9, count: 3, color: 0x9fe8ff, name: 'Bonecos de Neve' },
    ],
    tag: 'Chefe de Natal · 200 mil de vida',
    behavior: 'Chefe de Natal. Golpes normais em sequência e presentes atirados de longe. CHUVA DE PRESENTES: presentes caem nos círculos vermelhos e explodem. SALTO DO TRENÓ: pula em cima de você. INVESTIDA COM O SACO: corre em linha reta. TREMOR DE NEVE: bate o pé no chão em volta dele. Às vezes chama bonecos de neve e, em 66% e 33% de vida, fica furioso.',
  },
  boneco_neve: {
    ...NATAL_BASE, name: 'Flocos Maligno', model: 'boneco', color: 0xf4f8ff, size: 2.6, glow: 0x9fe8ff,
    hp: 1600, fixedHp: 150000, dmg: 26, def: 14, speed: 3.6, range: 3.4, atkCd: 1.8, windup: 0.6, lunge: 2,
    xp: 6000, gold: [1200, 2000],
    specials: [
      { kind: 'teia', cd: 6, windup: 0.5, color: 0xffffff, name: 'Bola de Neve (deixa lento)' },
      { kind: 'rolar', cd: 10, windup: 0.7, dist: 14, speed: 12, mult: 1.0, color: 0x9fe8ff, name: 'Avalanche Rolante' },
      { kind: 'circulo', cd: 9, windup: 0.8, count: 4, color: 0x9fe8ff, name: 'Nevasca (gelo deixa lento)' },
      { kind: 'patada', cd: 8, windup: 0.7, radius: 5.5, color: 0x9fe8ff, name: 'Pancada de Gelo' },
      { kind: 'invocar', cd: 16, windup: 0.8, count: 3, color: 0x9fe8ff, name: 'Bonecos de Neve' },
    ],
    tag: 'Chefe de Natal · 150 mil de vida',
    behavior: 'Chefe de Natal. Bate com os braços de galho e atira bolas de neve. BOLA DE NEVE: deixa lento. AVALANCHE ROLANTE: vira uma bola e rola em linha reta. NEVASCA: círculos de gelo no chão. PANCADA DE GELO: em volta dele. Chama mini bonecos de neve com frequência.',
  },
  rena_maligna: {
    ...NATAL_BASE, name: 'Rena Maligna', fem: true, model: 'quad', species: 'cervo', natalDress: 'rena', color: 0x5a3a24, size: 2.2, glow: 0xff2a2a,
    hp: 1400, fixedHp: 130000, dmg: 28, def: 12, speed: 6.0, range: 3.2, atkCd: 1.5, windup: 0.5, lunge: 4, combo: 2,
    xp: 5500, gold: [1000, 1800],
    specials: [
      { kind: 'carga', cd: 7, windup: 0.6, dist: 16, color: 0xff2a2a, name: 'Investida dos Chifres' },
      { kind: 'salto', cd: 10, windup: 0.7, color: 0xff2a2a, name: 'Salto da Rena' },
      { kind: 'patada', cd: 8, windup: 0.6, radius: 4.5, color: 0xff7a2a, name: 'Coice' },
      { kind: 'circulo', cd: 11, windup: 0.8, count: 3, color: 0xc04cff, name: 'Sinos Amaldiçoados' },
      { kind: 'invocar', cd: 22, windup: 0.8, count: 2, color: 0x9fe8ff, name: 'Bonecos de Neve' },
    ],
    tag: 'Chefe de Natal · 130 mil de vida',
    behavior: 'Chefe de Natal. Rápida: chifradas em dupla e magia de longe. INVESTIDA DOS CHIFRES: corre em linha reta. SALTO DA RENA: cai em cima de você. COICE: em volta dela. SINOS AMALDIÇOADOS: círculos mágicos no chão. Às vezes chama bonecos de neve.',
  },
  // ajudante dos chefes de Natal
  mini_boneco: {
    name: 'Mini Boneco', model: 'boneco', mini: true, color: 0xf4f8ff, size: 0.9, glow: 0x9fe8ff,
    hp: 420, dmg: 18, def: 6, speed: 4.6, range: 2.0, atkCd: 1.4, windup: 0.4, lunge: 2.5,
    aggro: 'aggressive', detect: 16, leash: 40, assist: 10, natal: true, staggerable: true,
    xp: 60, gold: [6, 14], loot: 'neve',
    tag: 'Corpo a corpo · ajudante de Natal', behavior: 'Pula atrás de você e dá cabeçadas geladas.',
  },
});

