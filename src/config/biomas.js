// =============================================================
// ELDORIA — Biomas: família de monstros e SET de cada um (v0.12, pacote 2)
// - Cada bioma tem a SUA família: nenhuma espécie aparece em dois biomas (slime só no Vale, goblin só no
//   Acampamento, esqueleto só nas Ruínas/Cripta do Vale; mortos-vivos ficam para o futuro mapa de zumbis).
// - Cada bioma tem UM set. Todos os monstros da família soltam peças dele; cada monstro tem uma peça FAVORITA
//   (bem mais chance) e as outras caem bem menos. Força pela faixa de nível do bioma (nunca acima de `max`).
// - O fundo (raridade) segue as tabelas do pacote 1 (config/balance.js), igual para peça de set ou item solto.
// - Itens soltos (sem set) continuam existindo: parte do saque é solta (ver SET_RULES.chance).
// =============================================================

// peças de um set (luvas = esquerda + direita)
export const SET_PIECES = ['weapon', 'helm', 'chest', 'legs', 'gloves', 'boots', 'shield', 'back'];
export const PIECE_SLOTS = { weapon: ['weapon'], helm: ['helm'], chest: ['chest'], legs: ['legs'], gloves: ['gloveL', 'gloveR'], boots: ['boots'], shield: ['shield'], back: ['back'] };
export const PIECE_NAMES = { weapon: 'Arma', helm: 'Capacete', chest: 'Peitoral', legs: 'Calça', gloves: 'Luvas', boots: 'Botas', shield: 'Escudo', back: 'Mochila' };
export const pieceOfSlot = (slot) => (slot === 'gloveL' || slot === 'gloveR' ? 'gloves' : SET_PIECES.includes(slot) ? slot : null);

// chance de um equipamento que cai ser peça do set do bioma (o resto é item solto) e peso da peça favorita
export const SET_RULES = { chance: 0.6, fav: 0.5 };

// fam: monstro → peça favorita. levels: faixa do set (o item nunca passa de `max`).
// Cores (paleta) e detalhe do set: o fundo (raridade) continua na moldura/gema, como antes.
export const BIOME_SETS = {
  vale: {
    name: 'Set do Prado', word: 'do Prado', bioma: 'Vale de Eldoria', levels: [1, 20],
    theme: { metal: '#b6c48e', metalD: '#7d9058', dark: '#3e4a2a', wood: '#8a6a42', woodD: '#5a4428', fx: '#e6f2a0', fx2: '#7fd86a', motif: 'gotas' },
    fam: { slime: 'boots', goblin: 'shield', goblin_atirador: 'gloves', wolf: 'legs', skeleton: 'helm', alpha_wolf: 'back', rei_slime: 'chest', campeao_goblin: 'weapon', rei_esqueleto: 'weapon', vigia: 'helm', alma_acorrentada: 'chest', campeao_ruptura: 'back', campeao_horda: 'weapon', campeao_ossos: 'weapon' },
  },
  guardiao: {
    name: 'Set da Sentinela', word: 'da Sentinela', bioma: 'Planície do Guardião', levels: [12, 28],
    theme: { metal: '#a4a2be', metalD: '#64628a', dark: '#2a2840', wood: '#4a4660', woodD: '#2e2a40', fx: '#d36bff', fx2: '#5ef0ff', motif: 'pedras', glow: true },
    fam: { couraco: 'chest', rajado: 'gloves', guardian: 'shield', boss_fenda: 'weapon' },
  },
  ermos: {
    name: 'Set das Cinzas', word: 'das Cinzas', bioma: 'Ermos da Fenda', levels: [25, 65],
    theme: { metal: '#8e7e76', metalD: '#5a4a46', dark: '#2a2220', wood: '#3e2e26', woodD: '#241a14', fx: '#ff8a3a', fx2: '#c06bff', motif: 'espinhos', glow: true },
    fam: { besouro_brasa: 'helm', aranha_galhos: 'gloves', caranguejo_abissal: 'shield', conjurador_afogado: 'chest', gargula: 'back', jabuti: 'weapon', cavaleiro_trono: 'legs', arauto_fenda: 'boots', campeao_abissal: 'weapon', campeao_osso: 'weapon', campeao_colosso: 'weapon' },
  },
  planicie: {
    name: 'Set da Colheita', word: 'da Colheita', bioma: 'Planícies Douradas', levels: [65, 80],
    theme: { metal: '#e8c870', metalD: '#b08a30', dark: '#6a4e18', wood: '#a87a3a', woodD: '#6e4e22', fx: '#fff0a0', fx2: '#ffb83a', motif: 'presas' },
    fam: { javali: 'boots', javali_dourado: 'helm', minotauro: 'chest', javali_rei: 'weapon', campeao_minotauro: 'weapon' },
  },
  pantano: {
    name: 'Set do Lodo', word: 'do Lodo', bioma: 'Pântano Sombrio', levels: [82, 100],
    theme: { metal: '#6a7a4a', metalD: '#46522e', dark: '#262e18', wood: '#4a4a2a', woodD: '#2e2e18', fx: '#a8d85a', fx2: '#5a8a3a', motif: 'musgo' },
    fam: { sapo: 'boots', homem_lagarto: 'shield', jacare: 'weapon', campeao_lagarto: 'weapon' },
  },
  deserto: {
    name: 'Set da Duna', word: 'da Duna', bioma: 'Deserto de Âmbar', levels: [82, 100],
    theme: { metal: '#e2c58a', metalD: '#b08c4a', dark: '#6e5428', wood: '#c8a060', woodD: '#8a6a34', fx: '#ffb43a', fx2: '#d88a1a', motif: 'ambar', glow: true },
    fam: { basilisco: 'legs', escorpiao_ambar: 'gloves', esfinge: 'weapon', campeao_escorpiao: 'weapon' },
  },
  floresta: {
    name: 'Set da Seiva', word: 'da Seiva', bioma: 'Floresta Esmeralda', levels: [100, 119],
    theme: { metal: '#5ab86a', metalD: '#2e7a3e', dark: '#1a4a24', wood: '#7a5a34', woodD: '#4e3a20', fx: '#8ae86a', fx2: '#3aa84a', motif: 'folhas' },
    fam: { cogumelo: 'helm', cervo_espinhoso: 'back', lobisomem: 'gloves', guardiao_bosque: 'weapon', campeao_lobisomem: 'weapon' },
  },
  tundra: {
    name: 'Set da Geada', word: 'da Geada', bioma: 'Tundra Gélida', levels: [120, 142],
    theme: { metal: '#cfeaff', metalD: '#86b8dc', dark: '#4a7aa0', wood: '#e8f4ff', woodD: '#a8c8e0', fx: '#aaf2ff', fx2: '#ffffff', motif: 'cristais', glow: true },
    fam: { morsa: 'boots', urso_polar: 'chest', yeti: 'helm', tita_gelo: 'weapon', campeao_tita_gelo: 'weapon' },
  },
  vulcao: {
    name: 'Set da Brasa', word: 'da Brasa', bioma: 'Terras de Magma', levels: [125, 146],
    theme: { metal: '#c8553a', metalD: '#8a2c1c', dark: '#4a1610', wood: '#3a2018', woodD: '#24120c', fx: '#ffb43a', fx2: '#ff6a1a', motif: 'chamas', glow: true },
    fam: { rinoceronte: 'shield', salamandra_magma: 'legs', cerbero: 'helm', tita_magma: 'weapon', campeao_tita_magma: 'weapon' },
  },
  pico: {
    name: 'Set Astral', word: 'Astral', bioma: 'Picos do Fim do Mundo', levels: [145, 169],
    theme: { metal: '#7a6ad0', metalD: '#4a3a98', dark: '#1e1648', wood: '#3a2a5a', woodD: '#22183a', fx: '#c8a0ff', fx2: '#5ef0ff', motif: 'runas', glow: true },
    fam: { medusa: 'back', cerebro_abissal: 'helm', tita_fenda: 'weapon', campeao_cerebro: 'chest', campeao_tita_fenda: 'weapon' },
  },
};
export const BIOME_ORDER = Object.keys(BIOME_SETS);

// monstro → bioma (cada monstro está em UMA família só; o teste confere)
export const MOB_BIOME = {};
for (const [b, S] of Object.entries(BIOME_SETS)) for (const k of Object.keys(S.fam)) MOB_BIOME[k] = b;
export const biomeOfMob = (type) => (type && MOB_BIOME[type]) || null;
export const favPiece = (type) => { const b = biomeOfMob(type); return b ? BIOME_SETS[b].fam[type] : null; };

// ---------- monstros antigos (saíram no pacote 2): de que bioma eram ----------
// Usado UMA vez para trocar os itens antigos ("Capacete Gosma Gélida" → "Capacete da Geada"), sem apagar nada.
export const LEGACY_BIOME = {
  rift_slime: 'guardiao', rift_wolf: 'guardiao',
  brasa_viva: 'ermos', batedor_cinzas: 'ermos', gosma_abissal: 'ermos', goblin_corrompido: 'ermos', lobo_sombrio: 'ermos',
  arqueiro_falesias: 'ermos', cavaleiro_osso: 'ermos', necromante_ossario: 'ermos', colosso_cristal: 'ermos',
  goblin_saqueador: 'planicie', gosma_mel: 'planicie', touro_rochoso: 'planicie', golem_pedra: 'planicie',
  cerebro_podre: 'pantano', gosma_brejo: 'pantano', goblin_lodo: 'pantano', lobo_brejo: 'pantano', golem_musgo: 'pantano',
  esqueleto_areia: 'deserto', colosso_areia: 'deserto', gosma_ambar: 'deserto', chacal_areia: 'deserto',
  goblin_cacador: 'floresta', lobo_esmeralda: 'floresta', gosma_esmeralda: 'floresta',
  gosma_gelo: 'tundra', lobo_gelo: 'tundra', esqueleto_gelo: 'tundra', colosso_gelo: 'tundra',
  gosma_magma: 'vulcao', cao_brasa: 'vulcao', cavaleiro_cinza: 'vulcao', piromante_cinzas: 'vulcao', colosso_magma: 'vulcao',
  cavaleiro_fenda: 'pico', oraculo_astral: 'pico', lobo_astral: 'pico', gosma_astral: 'pico', colosso_astral: 'pico',
};
// bioma pelo nível do item (item antigo de um monstro desconhecido): o primeiro set em que o nível cabe
export function biomeByLevel(ilvl) {
  const L = Math.max(1, +ilvl || 1);
  for (const b of BIOME_ORDER) if (L <= BIOME_SETS[b].levels[1]) return b;
  return BIOME_ORDER[BIOME_ORDER.length - 1];
}
// bioma de um item antigo pelo monstro de origem; se o nível do item não couber no set de lá, vai para o set do nível
// (o item NUNCA perde força na troca)
export function legacyBiome(src, ilvl) {
  const b = biomeOfMob(src) || LEGACY_BIOME[src] || null;
  if (b && (+ilvl || 1) <= BIOME_SETS[b].levels[1]) return b;
  return biomeByLevel(ilvl);
}

// nome da peça: "Capacete da Geada", "Espada do Prado", "Arco Astral"
const NOUN_BY_KIND = { espada: 'Espada', machado: 'Machado', montante: 'Montante', arco: 'Arco', arco_longo: 'Arco Longo', varinha: 'Varinha', cajado: 'Cajado', orbe: 'Orbe', adaga: 'Adaga', clava: 'Clava', capuz: 'Capuz', elmo: 'Capacete', tiara: 'Chapéu', chapeu: 'Chapéu', couro: 'Peitoral', malha: 'Peitoral', manto: 'Manto', calca: 'Calça', grevas: 'Calça', escudo: 'Escudo', broquel: 'Escudo', escudo_runico: 'Escudo', escudo_torre: 'Escudo', bota: 'Botas', botaF: 'Botas', mochila: 'Mochila', luvaE: 'Luva Esq.', luvaD: 'Luva Dir.', manoplaE: 'Manopla Esq.', manoplaD: 'Manopla Dir.' };
const NOUN_BY_SLOT = { weapon: 'Arma', helm: 'Capacete', chest: 'Peitoral', legs: 'Calça', boots: 'Botas', gloveL: 'Luva Esq.', gloveR: 'Luva Dir.', shield: 'Escudo', back: 'Mochila', ring: 'Anel', neck: 'Cordão' };
export function setPieceName(it) {
  const S = BIOME_SETS[it?.bset]; if (!S) return it?.name;
  return `${NOUN_BY_KIND[it.wkind] || NOUN_BY_SLOT[it.slot] || 'Peça'} ${S.word}`;
}
