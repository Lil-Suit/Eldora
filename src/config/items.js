// =============================================================
// ELDORIA — Itens, afixos, itens únicos e tabelas de saque
// =============================================================
import { NATAL } from './seasonal.js';

// Bases de equipamento. atk/def são multiplicadores sobre a fórmula por nível do item (ilvl).
export const ITEM_BASES = {
  // Guerreiro
  espada_curta:   { name: 'Espada Curta',     slot: 'weapon', kind: 'espada',   cls: 'guerreiro', atk: 1.00, minIlvl: 1 },
  machado_ferro:  { name: 'Machado de Ferro', slot: 'weapon', kind: 'machado',  cls: 'guerreiro', atk: 1.03, minIlvl: 2 },
  montante:       { name: 'Montante',         slot: 'weapon', kind: 'montante', cls: 'guerreiro', atk: 1.05, minIlvl: 5 },
  // Arqueiro
  arco_curto:     { name: 'Arco Curto',       slot: 'weapon', kind: 'arco',       cls: 'arqueiro', atk: 1.05, minIlvl: 1 },
  arco_longo:     { name: 'Arco Longo',       slot: 'weapon', kind: 'arco_longo', cls: 'arqueiro', atk: 1.07, minIlvl: 3 },
  arco_composto:  { name: 'Arco Composto',    slot: 'weapon', kind: 'arco',       cls: 'arqueiro', atk: 1.20, minIlvl: 6 },
  // Mago
  varinha:        { name: 'Varinha de Freixo', slot: 'weapon', kind: 'varinha', cls: 'mago', atk: 1.06, minIlvl: 1 },
  cajado_carvalho:{ name: 'Cajado de Carvalho',slot: 'weapon', kind: 'cajado',  cls: 'mago', atk: 1.06, minIlvl: 2 },
  orbe_arcano:    { name: 'Orbe Arcano',       slot: 'weapon', kind: 'orbe',    cls: 'mago', atk: 1.22, minIlvl: 5 },
  // Capacetes / chapéus
  capuz_couro:    { name: 'Capuz de Couro',  slot: 'helm', kind: 'capuz', def: 0.9,  minIlvl: 1 },
  elmo_ferro:     { name: 'Capacete de Ferro', slot: 'helm', kind: 'elmo',  def: 1.15, minIlvl: 3 },
  tiara_runica:   { name: 'Chapéu Rúnico',   slot: 'helm', kind: 'chapeu', def: 0.8, minIlvl: 4, bonus: 'int' }, // chapéu de mago
  // Armaduras
  gibao_couro:    { name: 'Gibão de Couro',  slot: 'chest', kind: 'couro', def: 1.0,  minIlvl: 1 },
  cota_malha:     { name: 'Cota de Malha',   slot: 'chest', kind: 'malha', def: 1.22, minIlvl: 3 },
  manto_aprendiz: { name: 'Manto do Aprendiz', slot: 'chest', kind: 'manto', def: 0.82, minIlvl: 2, bonus: 'spow' },
  // Anéis
  anel_cobre:     { name: 'Anel de Cobre',   slot: 'ring', kind: 'anel', minIlvl: 1 },
  anel_prata:     { name: 'Anel de Prata',   slot: 'ring', kind: 'anel', minIlvl: 4 },
  anel_gravado:   { name: 'Anel Gravado',    slot: 'ring', kind: 'anel', minIlvl: 7 },
  // Calças
  calca_couro:    { name: 'Calça de Couro',   slot: 'legs', kind: 'calca',  def: 1.0,  minIlvl: 1 },
  grevas_ferro:   { name: 'Calça de Ferro',   slot: 'legs', kind: 'calca',  def: 1.2,  minIlvl: 3 },
  calca_seda:     { name: 'Calça de Seda',    slot: 'legs', kind: 'calca',  def: 0.85, minIlvl: 2, bonus: 'agi' },
  // Luvas (cada mão é um espaço)
  luva_couro_e:   { name: 'Luva de Couro (esquerda)', slot: 'gloveL', kind: 'luvaE',    def: 1.0,  minIlvl: 1 },
  manopla_e:      { name: 'Manopla (esquerda)',       slot: 'gloveL', kind: 'manoplaE', def: 1.2,  minIlvl: 3, bonus: 'for' },
  luva_couro_d:   { name: 'Luva de Couro (direita)',  slot: 'gloveR', kind: 'luvaD',    def: 1.0,  minIlvl: 1 },
  manopla_d:      { name: 'Manopla (direita)',        slot: 'gloveR', kind: 'manoplaD', def: 1.2,  minIlvl: 3, bonus: 'crit' },
  // Escudos (todas as classes)
  escudo_madeira: { name: 'Escudo de Madeira', slot: 'shield', kind: 'escudo', def: 1.0, minIlvl: 1 },
  broquel:        { name: 'Broquel',           slot: 'shield', kind: 'broquel', def: 0.9, minIlvl: 2 },
  escudo_ferro:   { name: 'Escudo de Ferro',   slot: 'shield', kind: 'escudo', def: 1.2, minIlvl: 3 },
  escudo_runico:  { name: 'Escudo Rúnico',     slot: 'shield', kind: 'escudo_runico', def: 1.15, minIlvl: 5 },
  escudo_torre:   { name: 'Escudo-Torre',      slot: 'shield', kind: 'escudo_torre', def: 1.4, minIlvl: 7 },
  // Botas
  botas_couro:    { name: 'Botas de Couro',   slot: 'boots', kind: 'bota',  def: 1.0,  minIlvl: 1 },
  botas_ferro:    { name: 'Botas de Ferro',   slot: 'boots', kind: 'botaF', def: 1.2,  minIlvl: 3 },
  // Mochilas (costas)
  mochila_couro:  { name: 'Mochila de Couro', slot: 'back', kind: 'mochila', minIlvl: 1 },
  mochila_viajante:{ name: 'Mochila de Viajante', slot: 'back', kind: 'mochila', minIlvl: 4 },
  // ---------- Conjunto da Prece (só cai de chefes; ver ITEM_SETS) ----------
  // cada peça tem versões de pano (Mago), couro (Arqueiro) e metal (Guerreiro): mesma defesa, só muda o visual
  prece_capuz:   { name: 'Capuz da Prece',          slot: 'helm',   kind: 'capuz',   def: 1, minIlvl: 1, set: 'prece' },
  prece_elmo:    { name: 'Capacete da Prece',       slot: 'helm',   kind: 'elmo',    def: 1, minIlvl: 1, set: 'prece' },
  prece_chapeu:  { name: 'Chapéu da Prece',         slot: 'helm',   kind: 'chapeu',  def: 1, minIlvl: 1, set: 'prece' },
  prece_manto:   { name: 'Manto da Prece',          slot: 'chest',  kind: 'manto',   def: 1, minIlvl: 1, set: 'prece' },
  prece_gibao:   { name: 'Gibão da Prece',          slot: 'chest',  kind: 'couro',   def: 1, minIlvl: 1, set: 'prece' },
  prece_peitoral:{ name: 'Peitoral da Prece',       slot: 'chest',  kind: 'malha',   def: 1, minIlvl: 1, set: 'prece' },
  prece_calca:   { name: 'Calça da Prece',          slot: 'legs',   kind: 'calca',   def: 1, minIlvl: 1, set: 'prece' },
  prece_luva_e:  { name: 'Luva da Prece (esquerda)', slot: 'gloveL', kind: 'luvaE',  def: 1, minIlvl: 1, set: 'prece' },
  prece_luva_d:  { name: 'Luva da Prece (direita)',  slot: 'gloveR', kind: 'luvaD',  def: 1, minIlvl: 1, set: 'prece' },
  prece_manopla_e: { name: 'Manopla da Prece (esquerda)', slot: 'gloveL', kind: 'manoplaE', def: 1, minIlvl: 1, set: 'prece' },
  prece_manopla_d: { name: 'Manopla da Prece (direita)',  slot: 'gloveR', kind: 'manoplaD', def: 1, minIlvl: 1, set: 'prece' },
  prece_botas:   { name: 'Botas da Prece',          slot: 'boots',  kind: 'bota',    def: 1, minIlvl: 1, set: 'prece' },
  prece_botas_ferro: { name: 'Botas de Ferro da Prece', slot: 'boots', kind: 'botaF', def: 1, minIlvl: 1, set: 'prece' },
  prece_escudo:  { name: 'Escudo da Prece',         slot: 'shield', kind: 'escudo',  def: 1, minIlvl: 1, set: 'prece' },
  prece_mochila: { name: 'Mochila da Prece',        slot: 'back',   kind: 'mochila', minIlvl: 1, set: 'prece' },
  prece_cordao:  { name: 'Cordão da Prece',         slot: 'neck',   kind: 'cordao',  minIlvl: 1, set: 'prece' },
  prece_anel:    { name: 'Anel da Prece',           slot: 'ring',   kind: 'anel',    minIlvl: 1, set: 'prece' },
  // ---------- Natal (só cai dos chefes de Natal): só peças de defesa ----------
  natal_gorro:   { name: 'Gorro Natalino',          slot: 'helm',   kind: 'capuz',   def: 1, minIlvl: 1, set: 'natal' },
  natal_casaco:  { name: 'Casaco Natalino',         slot: 'chest',  kind: 'couro',   def: 1, minIlvl: 1, set: 'natal' },
  natal_calca:   { name: 'Calça Natalina',          slot: 'legs',   kind: 'calca',   def: 1, minIlvl: 1, set: 'natal' },
  natal_luva_e:  { name: 'Luva Natalina (esquerda)', slot: 'gloveL', kind: 'luvaE',  def: 1, minIlvl: 1, set: 'natal' },
  natal_luva_d:  { name: 'Luva Natalina (direita)',  slot: 'gloveR', kind: 'luvaD',  def: 1, minIlvl: 1, set: 'natal' },
  natal_botas:   { name: 'Botas Natalinas',         slot: 'boots',  kind: 'bota',    def: 1, minIlvl: 1, set: 'natal' },
};

// =============================================================
// Conjuntos de CHEFE (estilo Rucoy). Só caem dos chefes listados em "drops".
// Conjunto da Prece: ao beber uma poção de VIDA, cura também os aliados perto com parte da cura da poção,
// gastando mana. Quanto mais alto o nível das peças, mais cura e mais gasto de mana; quanto maior o fundo
// (raridade) da melhor peça, maior a distância da cura. As peças têm menos defesa que as comuns.
// =============================================================
const PRECE_ARMOR = ['helm', 'chest', 'legs', 'gloveL', 'gloveR', 'boots', 'shield'];
export const ITEM_SETS = {
  prece: {
    name: 'Conjunto da Prece', short: 'Prece', pieces: 10,
    defMult: 0.7, // 30% menos defesa que uma peça comum do mesmo nível e fundo
    // versões de cada espaço (cai uma delas ao acaso); a 1ª é a de pano, depois couro, depois metal
    bases: {
      helm: ['prece_capuz', 'prece_chapeu', 'prece_elmo'], chest: ['prece_manto', 'prece_gibao', 'prece_peitoral'], legs: ['prece_calca'],
      gloveL: ['prece_luva_e', 'prece_manopla_e'], gloveR: ['prece_luva_d', 'prece_manopla_d'], boots: ['prece_botas', 'prece_botas_ferro'], shield: ['prece_escudo'],
      back: ['prece_mochila'], neck: ['prece_cordao'], ring: ['prece_anel'],
    },
    // versão de cada classe (o GM recebe a da classe dele)
    byClass: {
      guerreiro: { helm: 'prece_elmo', chest: 'prece_peitoral', gloveL: 'prece_manopla_e', gloveR: 'prece_manopla_d', boots: 'prece_botas_ferro' },
      arqueiro: { helm: 'prece_capuz', chest: 'prece_gibao' },
      mago: { helm: 'prece_chapeu', chest: 'prece_manto' },
    },
    // só o Lorde dos Ossos (o primeiro chefe esqueleto) solta a mochila, o cordão e o anel
    drops: { rei_slime: PRECE_ARMOR, campeao_goblin: PRECE_ARMOR, rei_esqueleto: [...PRECE_ARMOR, 'back', 'neck', 'ring'] },
    chance: 0.45, // cada item do saque desses chefes tem esta chance de ser uma peça do conjunto
    // (o Escudo da Prece cai de todos os três)
    radius: [6, 7, 8, 9.5, 11, 12.5], // metros, pelo fundo da melhor peça: comum, verde, azul, roxo, vermelho, branco
  },
};
// Natal: peças natalinas (vermelho, verde e branco) — só defesa, sem arma nem escudo; saem nos fundos
// verde, vermelho e branco (ver NATAL.raridades em config/seasonal.js). Não têm efeito de conjunto.
const NATAL_ARMOR = ['helm', 'chest', 'legs', 'gloveL', 'gloveR', 'boots'];
ITEM_SETS.natal = {
  name: 'Conjunto Natalino', short: 'Natal', pieces: 6, defMult: 1, noEffect: true,
  bases: { helm: ['natal_gorro'], chest: ['natal_casaco'], legs: ['natal_calca'], gloveL: ['natal_luva_e'], gloveR: ['natal_luva_d'], boots: ['natal_botas'] },
  drops: { noel: NATAL_ARMOR, boneco_neve: NATAL_ARMOR, rena_maligna: NATAL_ARMOR },
  chance: 1, // todo item desses chefes é natalino
  rarities: NATAL.raridades, // v0.11: vermelho e branco raríssimos (eram 30% e 10%)
  radius: [0, 0, 0, 0, 0, 0],
};
// peça do conjunto para um espaço (e classe, se quiser a versão dela)
export function setBaseFor(S, slot, cls) { return S.byClass?.[cls]?.[slot] || S.bases[slot][0]; }

export const SLOT_NAMES = { weapon: 'Arma', helm: 'Capacete', chest: 'Peitoral', shield: 'Escudo', legs: 'Calça', gloveL: 'Luva esq.', gloveR: 'Luva dir.', boots: 'Botas', back: 'Mochila', ring: 'Anel', neck: 'Cordão' };
export const EQUIP_SLOTS = ['weapon', 'shield', 'helm', 'chest', 'legs', 'gloveL', 'gloveR', 'boots', 'back', 'ring', 'neck'];
// Sorteio de espaço nos saques: armas aparecem bem menos (não é toda hora que cai uma espada)
// armas caem bem mais (≈1 em 4 itens)
// (anéis só como lendários com nome: anel comum sem atributos não serviria para nada)
// arma = a peça mais rara de cair (mais baixa que qualquer outra; ver weaponLowest em core/items.js)
export const SLOT_DROP_WEIGHTS = { weapon: 4, shield: 10, helm: 12, chest: 12, legs: 12, gloveL: 9, gloveR: 9, boots: 12, back: 7, ring: 0, neck: 0 };

// Afixos: valor = (a + b * ilvl) * multiplicador de raridade, com teto opcional.
export const AFFIXES = {
  for:   { name: 'Força',               fmt: '+{v}',  a: 1, b: 0.4, int: true, suffix: 'do Urso' },
  agi:   { name: 'Agilidade',           fmt: '+{v}',  a: 1, b: 0.4, int: true, suffix: 'da Raposa' },
  int:   { name: 'Inteligência',        fmt: '+{v}',  a: 1, b: 0.4, int: true, suffix: 'da Coruja' },
  vit:   { name: 'Vitalidade',          fmt: '+{v}',  a: 1, b: 0.38, int: true, suffix: 'do Carvalho' },
  crit:  { name: 'Chance crítica',      fmt: '+{v}%', a: 1, b: 0.2, cap: 8,  suffix: 'da Precisão' },
  aspd:  { name: 'Vel. de ataque',      fmt: '+{v}%', a: 2, b: 0.3,  cap: 12, suffix: 'do Vento', noWeapon: true },
  spow:  { name: 'Poder de habilidade', fmt: '+{v}%', a: 3, b: 0.45, cap: 18, suffix: 'das Fendas' },
  hp:    { name: 'Vida',                fmt: '+{v}',  a: 8, b: 3.5,  int: true, suffix: 'da Vida' },
  regen: { name: 'Regeneração',         fmt: '+{v}/s',a: 0.3, b: 0.06, suffix: 'da Fonte' },
  def:   { name: 'Defesa',              fmt: '+{v}',  a: 1, b: 0.45, int: true, suffix: 'da Muralha', noWeapon: true },
};

// Itens nomeados (fixos). unique: true => proteção contra duplicatas.
export const NAMED_ITEMS = {
  espada_primeiro_guardiao: {
    name: 'Espada do Primeiro Guardião', slot: 'weapon', kind: 'espada', cls: 'guerreiro', rarity: 'lendario',
    ilvl: 10, reqLevel: 8, atk: 33, affixes: { for: 8, vit: 6, crit: 5 }, unique: true,
    effect: 'onda_luz', effectText: 'A cada 4º ataque básico, libera uma onda de luz que causa 150% do dano em linha reta.',
    lore: 'Forjada para quem selou a primeira fenda. Ainda pulsa com luz antiga.',
  },
  lamina_abismo: {
    name: 'Lâmina do Abismo', slot: 'weapon', kind: 'montante', cls: 'guerreiro', rarity: 'lendario',
    ilvl: 10, reqLevel: 8, atk: 33, affixes: { for: 7, crit: 6, vit: 5 }, unique: true,
    effect: 'dreno', effectText: 'Golpes críticos drenam 8% do dano causado como vida.',
    lore: 'Uma lâmina que bebeu da escuridão entre os mundos.',
  },
  arco_nevoa_azul: {
    name: 'Arco da Névoa Azul', slot: 'weapon', kind: 'arco_longo', cls: 'arqueiro', rarity: 'lendario',
    ilvl: 10, reqLevel: 8, atk: 32, affixes: { agi: 8, crit: 6, vit: 5 }, unique: true,
    effect: 'nevoa', effectText: 'Flechas básicas atravessam até 2 inimigos e deixam uma névoa que reduz a velocidade.',
    lore: 'Dizem que suas flechas somem na névoa e reaparecem no alvo.',
  },
  cajado_fendas: {
    name: 'Cajado das Fendas', slot: 'weapon', kind: 'cajado', cls: 'mago', rarity: 'lendario',
    ilvl: 10, reqLevel: 8, atk: 32, affixes: { int: 8, spow: 10, vit: 4 }, unique: true,
    effect: 'fenda_fogo', effectText: 'A Bola de Fogo abre uma pequena fenda que causa dano contínuo por 3s.',
    lore: 'Feito com um fragmento do próprio Selo da Realidade.',
  },
  armadura_vale: {
    name: 'Armadura do Vale', slot: 'chest', kind: 'malha', rarity: 'raro',
    ilvl: 4, reqLevel: 3, def: 13, affixes: { vit: 4, hp: 22 }, unique: true,
    lore: 'Placas leves forjadas por Brunna com presas de lobo e insígnias goblin.',
  },
  elmo_vigia: {
    name: 'Capacete do Vigia', slot: 'helm', kind: 'elmo', rarity: 'epico',
    ilvl: 7, reqLevel: 5, def: 9, affixes: { vit: 5, crit: 3, spow: 6 }, unique: true,
    lore: 'O elmo de quem vigiava a Cripta. Seus olhos ainda brilham no escuro.',
  },
  anel_aurora: {
    name: 'Anel da Aurora', slot: 'ring', kind: 'anel', rarity: 'lendario',
    ilvl: 8, reqLevel: 4, affixes: { vit: 6, regen: 1.2, spow: 8 }, unique: true,
    effect: 'aurora', effectText: 'Fora de combate, regenera 3% da vida máxima por segundo. Ao subir de nível, libera uma aurora dourada.',
    lore: 'Guardado pelas runas do Sol, da Lua e da Estrela.',
  },
  coracao_selo: {
    name: 'Coração do Selo Partido', slot: 'ring', kind: 'anel', rarity: 'lendario',
    ilvl: 12, reqLevel: 9, affixes: { for: 6, agi: 6, int: 6, vit: 6 }, unique: true,
    effect: 'selo', effectText: 'Recargas 20% mais rápidas. Golpes críticos abrem micro-fendas que causam 60% de dano em área.',
    lore: 'O núcleo do Selo que protegia Eldoria. Ainda não terminou de se partir.',
  },
};

export const CLASS_LEGENDARIES = {
  guerreiro: ['espada_primeiro_guardiao', 'lamina_abismo'],
  arqueiro: ['arco_nevoa_azul'],
  mago: ['cajado_fendas'],
};

export const MATERIALS = {
  gosma:           { name: 'Gosma do Vale',      value: 2,  icon: 'gota',     color: '#7fe36a', desc: 'Resíduo pegajoso de slime. Usado em aprimoramentos.' },
  presa_lobo:      { name: 'Presa de Lobo',      value: 5,  icon: 'presa',    color: '#e8e0cc', desc: 'Presa afiada. A ferreira Brunna procura por elas.' },
  insignia_goblin: { name: 'Insígnia Goblin',    value: 7,  icon: 'insignia', color: '#c7a33e', desc: 'Distintivo de lata dos saqueadores.' },
  po_osso:         { name: 'Pó de Osso',         value: 9,  icon: 'po',       color: '#ddd6c6', desc: 'Restos dos esqueletos errantes.' },
  fragmento_fenda: { name: 'Fragmento da Fenda', value: 22, icon: 'cristal',  color: '#d36bff', desc: 'Cristal instável que vibra perto de fendas.' },
};

// Troféus: cada monstro dos Ermos e dos Confins solta o seu (como os conjuntos de cada monstro no Rucoy).
// sprite = desenho em pixel art (ui/pixelicons.js); tint = [claro, escuro, brilho, destaque].
const T = (name, sprite, tint, value, desc) => ({ name, sprite, tint, value, icon: 'bolsa', color: tint[0], desc, trophy: true });
export const TROPHIES = {
  // Ermos da Fenda (10–20)
  carapaca_brasa:   T('Carapaça de Brasa',   'carapaca', ['#ff9a4a', '#a8401a', '#ffe0a0', '#5a2412'], 10, 'Casco ainda quente de um besouro de brasa.'),
  insignia_cinzas:  T('Insígnia Cinzenta',   'emblema',  ['#b8b4b0', '#5a5654', '#eae6e0', '#3a3634'], 11, 'Distintivo dos batedores que vivem nas cinzas.'),
  seda_galhos:      T('Seda dos Galhos',     'seda',     ['#8a6a42', '#4a3420', '#d8e8c0', '#3a2a18'], 12, 'Fio grudento das aranhas que fingem ser galhos.'),
  amuleto_corrompido: T('Amuleto Corrompido', 'runa',    ['#6a5a7a', '#3a2e48', '#d080ff', '#b040ff'], 13, 'Os goblins corrompidos usam isto no pescoço.'),
  pinca_abissal:    T('Pinça Abissal',       'garra',    ['#7ab8e8', '#2e5a8a', '#d8f0ff', '#1e3a5a'], 13, 'Pinça de um caranguejo das águas escuras.'),
  perola_afogada:   T('Pérola Afogada',      'nucleo',   ['#3a6a70', '#1e3a40', '#9affe8', '#3ac8b0'], 15, 'Brilha como água funda. Conjuradores afogados guardam uma.'),
  pena_falesias:    T('Pena das Falésias',   'pena',     ['#d8d0c0', '#7a6e5e', '#ffffff', '#4a4038'], 15, 'Os arqueiros das falésias enfeitam as flechas com elas.'),
  emblema_osso:     T('Emblema de Osso',     'emblema',  ['#e8e0cc', '#9a8e74', '#ffffff', '#6a5e4a'], 16, 'Brasão dos cavaleiros que não morreram direito.'),
  cranio_ossario:   T('Crânio do Ossário',   'cranio',   ['#e8e0cc', '#a89a7e', '#9affb0', '#3aff7a'], 18, 'Os olhos ainda acendem quando está escuro.'),
  nucleo_cristal:   T('Núcleo de Cristal',   'nucleo',   ['#6a5a7a', '#3a2e48', '#f0c0ff', '#c050ff'], 26, 'O coração de um colosso de cristal.'),
  emblema_trono:    T('Emblema do Trono',    'emblema',  ['#ffd45c', '#a8781e', '#fff2b0', '#7a2aa8'], 22, 'Usado pela guarda do trono quebrado.'),
  runa_arauto:      T('Runa do Arauto',      'runa',     ['#4a3a5a', '#241a30', '#ff80e0', '#ff3ad0'], 20, 'Pedra com um sinal que anuncia a Fenda.'),
  brasa_viva:       T('Brasa Viva',          'brasa',    ['#ff6a1a', '#a82a0a', '#fff0a0', '#ff9a3a'], 10, 'Continua queimando mesmo fora do fogo.'),
  gosma_abissal:    T('Gosma Abissal',       'gota',     ['#5a6aff', '#2a2a8a', '#c8d0ff', '#1a1a4a'], 9, 'Gelatina azul-escura das gosmas da Fenda.'),
  presa_sombria:    T('Presa Sombria',       'presa',    ['#5a5070', '#2a2438', '#c8b8ff', '#1a1424'], 12, 'Presa de um lobo que vive na sombra da Fenda.'),
  // Confins de Eldoria (20–40)
  chifre_minotauro: T('Chifre de Minotauro', 'chifre',   ['#efe2c4', '#a88e60', '#fff8e8', '#5a4630'], 28, 'Pesado e afiado. Dizem que dá coragem a quem carrega.'),
  insignia_fundeira: T('Insígnia Fundeira',  'emblema',  ['#9ab84a', '#4a6a1e', '#e0ffa0', '#2e4012'], 24, 'Os goblins fundeiros marcam as pedras com ela.'),
  nucleo_runico:    T('Núcleo Rúnico',       'nucleo',   ['#8a8a84', '#4a4a46', '#c0f0ff', '#3ab0ff'], 45, 'Pedra viva cheia de runas azuis. O que mantinha o golem de pé.'),
  escama_lagarto:   T('Escama de Lagarto',   'escama',   ['#5aa05a', '#2a5a2a', '#c8ffb0', '#1a3a1a'], 30, 'Dura como couro curtido.'),
  olho_putrido:     T('Olho Pútrido',        'olho',     ['#9aff5a', '#3a8a1a', '#d8ffb0', '#1a4a0a'], 32, 'Ainda se mexe de vez em quando.'),
  musgo_antigo:     T('Musgo Antigo',        'casca',    ['#5aa04a', '#2a5a22', '#b8ff90', '#3a2a18'], 40, 'Cresceu por séculos nas costas de um golem.'),
  ferrao_ambar:     T('Ferrão de Âmbar',     'ferrao',   ['#e8a040', '#8a5a1a', '#fff0b0', '#7aff5a'], 30, 'A ponta ainda tem veneno.'),
  runa_dunas:       T('Runa das Dunas',      'runa',     ['#d8b26a', '#8a6a3a', '#fff0b0', '#ffb040'], 32, 'Areia presa numa pedra que nunca esfria.'),
  nucleo_arenito:   T('Núcleo de Arenito',   'nucleo',   ['#c8a060', '#7a5a30', '#fff0b0', '#ffb040'], 46, 'O coração quente de um colosso do deserto.'),
  garra_lobisomem:  T('Garra de Lobisomem',  'garra',    ['#e8e0cc', '#9a8e74', '#ffffff', '#4a4038'], 36, 'Arrancada numa noite de lua.'),
  pena_verde:       T('Pena Verde',          'pena',     ['#6aba4a', '#2a6a1e', '#d8ffb0', '#1a3a10'], 30, 'Os caçadores goblins se escondem nas árvores com elas.'),
  casca_ancia:      T('Casca Anciã',         'casca',    ['#8a6a42', '#4a3420', '#b8ff90', '#2a1e12'], 50, 'Um pedaço do Ente Ancião. Ainda tem seiva.'),
  pelo_yeti:        T('Pelo de Yeti',        'tufo',     ['#f2f6fa', '#a8b8c8', '#ffffff', '#4a5a6e'], 42, 'Quentinho. Muito procurado na tundra.'),
  coracao_gelo:     T('Coração de Gelo',     'nucleo',   ['#9ac4e0', '#4a7a9a', '#ffffff', '#9fe8ff'], 62, 'Gelo que não derrete. Arrancado de um titã.'),
  presa_infernal:   T('Presa Infernal',      'presa',    ['#ffd0a0', '#a8401a', '#fff6d0', '#ff6a1a'], 44, 'Presa de uma das três cabeças do Cérbero.'),
  brasa_piromante:  T('Brasa do Piromante',  'brasa',    ['#ff5a1a', '#a01a0a', '#fff0a0', '#ff8a2a'], 40, 'O fogo que os piromantes carregam no bolso.'),
  coracao_magma:    T('Coração de Magma',    'nucleo',   ['#5a3a30', '#2a1a16', '#fff0a0', '#ff6a1a'], 66, 'Ainda pulsa. Cuidado para não queimar a mochila.'),
  emblema_fenda:    T('Emblema da Fenda',    'emblema',  ['#8a7aaa', '#3a2e5a', '#f0e0ff', '#c8a0ff'], 48, 'Brasão dos últimos guardas do fim do mundo.'),
  olho_abissal:     T('Olho Abissal',        'olho',     ['#c8a0ff', '#6a3aaa', '#f0e0ff', '#2a1a4a'], 50, 'Olhar para ele por muito tempo dá dor de cabeça.'),
  coracao_fenda:    T('Coração da Fenda',    'nucleo',   ['#3a3650', '#1a1828', '#f0e0ff', '#c8a0ff'], 80, 'O núcleo de um Titã da Fenda. Vibra na sua mão.'),
  // v0.12 (pacote 2): famílias novas
  placa_couraco:    T('Placa de Couraço',    'carapaca', ['#8a84a8', '#4a4468', '#f0c0ff', '#d36bff'], 14, 'Placa da couraça, com uma lasca de cristal da Fenda.'),
  garra_rajada:     T('Garra Rajada',        'garra',    ['#6a6480', '#2a2440', '#c8f8ff', '#5ef0ff'], 15, 'Garra listrada de um felino da Fenda.'),
  asa_gargula:      T('Asa de Gárgula',      'pena',     ['#8a8690', '#4a4650', '#ffd0a0', '#ff8a3a'], 16, 'Pedra fina como couro. Ainda está morna.'),
  casco_jabuti:     T('Casco de Jabuti',     'carapaca', ['#5a8a7a', '#2a4a3e', '#c8fbff', '#5ef0ff'], 26, 'Pedaço do casco com um cristal que zumbe.'),
  presa_javali:     T('Presa de Javali',     'presa',    ['#f0e6d0', '#a8946a', '#ffffff', '#5a4630'], 24, 'Curva e afiada como uma foice.'),
  glandula_sapo:    T('Glândula de Sapo',    'gota',     ['#b8e05a', '#5a8a2a', '#f0ffb0', '#2a4a12'], 28, 'Gosmenta. Os curandeiros do pântano adoram.'),
  dente_jacare:     T('Dente de Jacaré',     'presa',    ['#efe6c8', '#8a7a50', '#ffffff', '#3e4a2e'], 44, 'Do tamanho de uma adaga.'),
  escama_basilisco: T('Escama de Basilisco', 'escama',   ['#e0b060', '#8a5a2a', '#fff0b0', '#ffd23a'], 30, 'Quente ao toque, como pedra ao sol.'),
  joia_esfinge:     T('Joia da Esfinge',     'nucleo',   ['#5ad8ff', '#1a6a8a', '#e0f8ff', '#ffd36b'], 48, 'Estava na coroa da esfinge. Brilha à noite.'),
  esporo_vivo:      T('Esporo Vivo',         'gota',     ['#d84a3a', '#7a1a14', '#fff0e0', '#9aff6a'], 32, 'Ainda solta uma fumacinha verde.'),
  presa_morsa:      T('Presa de Morsa',      'presa',    ['#f4f0e8', '#a8a090', '#ffffff', '#9fe8ff'], 40, 'Marfim gelado da tundra.'),
  chifre_obsidiana: T('Chifre de Obsidiana', 'chifre',   ['#3a3030', '#120c0c', '#ffd0a0', '#ff6a1a'], 44, 'Vidro vulcânico com brasa por dentro.'),
  veu_medusa:       T('Véu de Medusa',       'seda',     ['#8a6ad8', '#3a2a7a', '#e0fbff', '#5ef0ff'], 50, 'Transparente e cheio de faíscas.'),
  // Eventos (cada evento tem o seu)
  estilhaco_ruptura: T('Estilhaço da Ruptura', 'cristal', ['#d36bff', '#7a2aa8', '#ffffff', '#4a1a6a'], 14, 'Pedaço de uma fenda que você fechou.'),
  estandarte_goblin: T('Estandarte Goblin',  'estandarte', ['#c84a3a', '#7a2018', '#ffd45c', '#a8781e'], 18, 'A bandeira da invasão. Os goblins vão sentir falta.'),
  cranio_maldito:   T('Crânio Amaldiçoado',  'cranio',   ['#d8d0c0', '#8a8070', '#ff80ff', '#c03aff'], 22, 'Sobrou da Horda de Ossos.'),
  estilhaco_abismo: T('Estilhaço do Abismo', 'cristal',  ['#5a6aff', '#2a2a8a', '#e0e4ff', '#1a1a4a'], 26, 'Pedaço da Ruptura Abissal.'),
  estandarte_osso:  T('Estandarte de Osso',  'estandarte', ['#e8e0cc', '#8a7e64', '#9affb0', '#3a3a3a'], 30, 'Carregado pela Marcha dos Cavaleiros de Osso.'),
  coroa_colosso:    T('Coroa do Colosso',    'nucleo',   ['#b878ff', '#5a2aa8', '#ffffff', '#ff80ff'], 46, 'O Colosso Desperto usava isto na testa.'),
  chifre_estouro:   T('Chifre do Estouro',   'chifre',   ['#e8c890', '#8a6a3a', '#fff4d8', '#4a3418'], 50, 'Do líder do Estouro de Minotauros.'),
  olho_colmeia:     T('Olho da Colmeia',     'olho',     ['#ff80c0', '#a82a6a', '#ffe0f0', '#3a0a2a'], 56, 'O olho do cérebro que comandava o Enxame.'),
  garra_lua:        T('Garra da Lua',        'garra',    ['#dfe8ff', '#7a8aaa', '#ffffff', '#2a3048'], 54, 'Da Caçada do Lobisomem, numa noite de lua.'),
  coracao_tita:     T('Coração de Titã',     'nucleo',   ['#2a2a32', '#121216', '#ffffff', '#ffd45c'], 110, 'Prova de que você derrubou um titã furioso.'),
};

// Qual troféu cada monstro solta
export const TROPHY_OF = {
  // Planície do Guardião
  couraco: 'placa_couraco', rajado: 'garra_rajada',
  // Ermos da Fenda
  besouro_brasa: 'carapaca_brasa', aranha_galhos: 'seda_galhos', caranguejo_abissal: 'pinca_abissal', conjurador_afogado: 'perola_afogada',
  gargula: 'asa_gargula', jabuti: 'casco_jabuti', cavaleiro_trono: 'emblema_trono', arauto_fenda: 'runa_arauto',
  // Confins de Eldoria
  javali: 'presa_javali', minotauro: 'chifre_minotauro', sapo: 'glandula_sapo', homem_lagarto: 'escama_lagarto', jacare: 'dente_jacare',
  basilisco: 'escama_basilisco', escorpiao_ambar: 'ferrao_ambar', esfinge: 'joia_esfinge',
  cogumelo: 'esporo_vivo', lobisomem: 'garra_lobisomem', guardiao_bosque: 'casca_ancia',
  morsa: 'presa_morsa', yeti: 'pelo_yeti', tita_gelo: 'coracao_gelo', rinoceronte: 'chifre_obsidiana', cerbero: 'presa_infernal', tita_magma: 'coracao_magma',
  medusa: 'veu_medusa', cerebro_abissal: 'olho_abissal', tita_fenda: 'coracao_fenda',
  // campeões de evento soltam o troféu do evento
  campeao_ruptura: 'estilhaco_ruptura', campeao_goblin: 'estandarte_goblin', campeao_ossos: 'cranio_maldito',
  campeao_abissal: 'estilhaco_abismo', campeao_osso: 'estandarte_osso', campeao_colosso: 'coroa_colosso',
  campeao_minotauro: 'chifre_estouro', campeao_cerebro: 'olho_colmeia', campeao_lobisomem: 'garra_lua', campeao_escorpiao: 'ferrao_ambar',
  campeao_tita_gelo: 'coracao_tita', campeao_tita_magma: 'coracao_tita', campeao_tita_fenda: 'coracao_tita',
};

export const CONSUMABLES = {
  // poções em 3 tamanhos (pequena, média e grande), estilo Rucoy
  // 3 tamanhos, cura FIXA sorteada na faixa (nada de %): P 100–200, M 200–400, G 400–900 — o mesmo para a mana
  pocao_vida_p: { name: 'Poção de Vida Pequena', price: 10, value: 2,  icon: 'pocao', color: '#ff6b78', healRange: [100, 200], life: true, desc: 'Cura de 100 a 200 de vida.' },
  pocao_vida:   { name: 'Poção de Vida Média',   price: 25, value: 6,  icon: 'pocao', color: '#ff4d5e', healRange: [200, 400], life: true, desc: 'Cura de 200 a 400 de vida.' },
  pocao_vida_g: { name: 'Poção de Vida Grande',  price: 60, value: 15, icon: 'pocao', color: '#ff2a3c', healRange: [400, 900], life: true, desc: 'Cura de 400 a 900 de vida.' },
  tonico_p:     { name: 'Poção de Mana Pequena', price: 15, value: 3,  icon: 'pocao', color: '#7ab8ff', manaRange: [100, 200], mana: true, desc: 'Recupera de 100 a 200 de Mana, Energia ou Fúria.' },
  tonico:       { name: 'Poção de Mana Média',   price: 30, value: 7,  icon: 'pocao', color: '#4fa3ff', manaRange: [200, 400], mana: true, desc: 'Recupera de 200 a 400 de Mana, Energia ou Fúria.' },
  tonico_g:     { name: 'Poção de Mana Grande',  price: 70, value: 17, icon: 'pocao', color: '#2a7aff', manaRange: [400, 900], mana: true, desc: 'Recupera de 400 a 900 de Mana, Energia ou Fúria.' },
  // flechas acabam: o arqueiro gasta 1 por tiro (as habilidades com várias flechas gastam mais)
  flechas:      { name: 'Flechas', price: 1, value: 0, icon: 'flecha', color: '#e8d39a', ammo: true, stack: 9999, desc: 'Munição do arqueiro: cada tiro gasta flechas. Sem flechas, o arco não atira.' },
  // comprado só com diamantes 💎 (conveniência: não dá força). Preso à conta: não vende, não troca.
  pergaminho_tp: { name: 'Pergaminho de Teleporte', price: 0, value: 0, icon: 'pergaminho', color: '#b25cff', teleport: true, bound: true, desc: 'Vá direto para qualquer região já descoberta. Gasta 1 por viagem.' },
  pergaminho:  { name: 'Pergaminho de Retorno', price: 40, value: 10, icon: 'pergaminho', color: '#e8d39a', recall: true, desc: 'Após 2s de concentração, retorna à Vila de Eldoria.' },
};

export const QUEST_ITEMS = {
  lobo_criacao: { name: 'Lobo de Montaria', icon: 'presa', color: '#9fc4ff', desc: 'Lobo cinza gigante com sela. Corre 20× mais rápido que a pé. Use (ou aperte H / o botão da montaria) para montar e desmontar.', sprite: 'lobo', tint: ['#8a94a4', '#4a5260', '#e2e8f0', '#2a2e36'] },
  chave_selo: { name: 'Chave do Selo', icon: 'chave', color: '#5ef0ff', desc: 'Abre a barreira do Planalto da Fenda.' },
  cavalo_criador: { name: 'Cavalo de Montaria', icon: 'bota', color: '#e8b070', desc: 'Corre 20× mais rápido que a pé. Use (ou aperte H / o botão do cavalo) para montar e desmontar.', sprite: 'cavalo', tint: ['#a8683a', '#5a3018', '#f0d0a0', '#2a1a10'] },
};

// Tabelas de saque. Probabilidades são exibidas no Bestiário (sem chances secretas).
// item.classBias: chance de a arma gerada ser da sua classe.
export const LOOT_TABLES = {
  // Estilo Rucoy: ouro SEMPRE cai, cada monstro solta o seu material/troféu e equipamento cai com frequência
  // (monstro fraco solta mais vezes coisa simples; elite e chefe soltam menos vezes, mas coisa melhor).
  slime:    { gold: 1, goldMult: 0.6, drops: [{ id: 'gosma', chance: 0.18, questBoost: 0.6 }, { id: 'pocao_vida', chance: 0.04 }], item: { chance: 0.1, tier: 'normal' } }, // 1 item a cada ~10 slimes (era 1 a cada ~33)
  wolf:     { gold: 1, goldMult: 0.6, drops: [{ id: 'presa_lobo', chance: 0.18, questBoost: 0.6 }, { id: 'pocao_vida', chance: 0.05 }], item: { chance: 0.04, tier: 'normal' } },
  goblin:   { gold: 1, goldMult: 0.65, drops: [{ id: 'insignia_goblin', chance: 0.18, questBoost: 0.55 }, { id: 'pocao_vida', chance: 0.06 }, { id: 'tonico', chance: 0.04 }], item: { chance: 0.05, tier: 'normal' } },
  skeleton: { gold: 1, goldMult: 0.65, drops: [{ id: 'po_osso', chance: 0.18 }, { id: 'tonico', chance: 0.05 }], item: { chance: 0.055, tier: 'bom' } },
  guardian: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 0.5 }, { id: 'pocao_vida', chance: 0.18 }], item: { chance: 0.2, tier: 'elite' } },
  alma:     { gold: 0, drops: [] },
  rift:     { gold: 1, goldMult: 0.6, drops: [{ id: 'fragmento_fenda', chance: 0.12 }, { id: 'pocao_vida', chance: 0.05 }], item: { chance: 0.045, tier: 'bom' } }, // Couraço e Rajado (Planície do Guardião)
  // Chefes: de 1 a 3 itens "Forjados na Fenda" por chefe. Com várias pessoas, cada item é sorteado
  // entre quem lutou (mais dano = mais chance). Ouro e materiais: cada um ganha o seu.
  // chefes: SÓ itens com fundo (verde ou melhor); 1 a 3 itens no total, no máximo 1 muito raro (roxo ou melhor)
  vigia:    { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 1, qty: [3, 4] }, { id: 'pocao_vida', chance: 1, qty: [2, 2] }], item: { chance: 1, tier: 'chefe_menor', count: 3, roll: [1, 3], min: ['raro', 'raro', 'raro'], forged: 'Vigia da Cripta' }, bossLoot: true },
  alpha:    { gold: 1, drops: [{ id: 'presa_lobo', chance: 1, qty: [3, 5] }, { id: 'fragmento_fenda', chance: 1, qty: [1, 2] }], item: { chance: 1, tier: 'chefe_menor', count: 3, roll: [1, 3], min: ['raro', 'raro', 'raro'], forged: 'Alfa da Fenda' }, bossLoot: true },
  boss:     { gold: 1, goldAmount: [250, 350], drops: [{ id: 'fragmento_fenda', chance: 1, qty: [6, 8] }, { id: 'pocao_vida', chance: 1, qty: [3, 3] }], item: { chance: 1, tier: 'chefe', count: 3, roll: [1, 3], min: ['raro', 'raro', 'raro'], forged: 'Guardião da Fenda' }, bossLoot: true,
              special: { legendaryChance: 0.004, mythic: { id: 'coracao_selo', chance: 0.002 } } }, // v0.11: lendário com nome 1 em 250, Coração 1 em 500
  // Monstros da Fenda (Ermos e Confins): o nível do monstro define ouro e nível do item; o troféu vem do próprio monstro
  fenda_fraco: { gold: 1, goldMult: 0.6, drops: [{ id: 'fragmento_fenda', chance: 0.1 }, { id: 'pocao_vida', chance: 0.05 }], item: { chance: 0.04, tier: 'normal' } },
  fenda:       { gold: 1, goldMult: 0.6, drops: [{ id: 'fragmento_fenda', chance: 0.16 }, { id: 'pocao_vida', chance: 0.06 }, { id: 'tonico', chance: 0.04 }], item: { chance: 0.055, tier: 'bom' } },
  fenda_elite: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 0.8, qty: [2, 3] }, { id: 'pocao_vida', chance: 0.4 }], item: { chance: 0.5, tier: 'elite' } },
  ermos:       { gold: 1, goldMult: 0.6, drops: [{ id: 'fragmento_fenda', chance: 0.16 }, { id: 'pocao_vida', chance: 0.06 }], item: { chance: 0.055, tier: 'bom' } },
  confins:       { gold: 1, goldMult: 0.6, drops: [{ id: 'fragmento_fenda', chance: 0.18 }, { id: 'pocao_vida', chance: 0.06 }], item: { chance: 0.055, tier: 'bom' } },
  confins_elite: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 0.8, qty: [2, 3] }, { id: 'pocao_vida', chance: 0.4 }], item: { chance: 0.5, tier: 'elite' } },
  ermos_elite: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 0.7, qty: [1, 3] }, { id: 'pocao_vida', chance: 0.35 }], item: { chance: 0.5, tier: 'elite' } },
  // Eventos: recompensa ao fechar o evento (troféu do próprio evento + itens; mais itens nos eventos mais fortes)
  event:    { gold: 1, goldAmount: [70, 120], drops: [{ id: 'fragmento_fenda', chance: 1, qty: [1, 2] }, { id: 'tonico', chance: 0.6 }], item: { chance: 1, tier: 'bau', count: 1 } },
  event2:   { gold: 1, goldAmount: [120, 200], drops: [{ id: 'fragmento_fenda', chance: 1, qty: [2, 3] }, { id: 'tonico', chance: 0.8 }, { id: 'pocao_vida', chance: 0.8, qty: [1, 2] }], item: { chance: 1, tier: 'bau', count: 2 } },
  event3:   { gold: 1, goldAmount: [200, 320], drops: [{ id: 'fragmento_fenda', chance: 1, qty: [3, 5] }, { id: 'pocao_vida', chance: 1, qty: [2, 3] }], item: { chance: 1, tier: 'elite', count: 2, min: ['raro'] } },
  // Campeão de evento (chefe da última onda): saque de chefe dividido pelo dano
  // chefe de RAID: só itens com fundo e nunca lendário
  raid_chefe: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 1, qty: [2, 4] }, { id: 'pocao_vida', chance: 0.7 }], item: { chance: 1, tier: 'raid_chefe', count: 3, roll: [1, 3], min: ['raro', 'raro', 'raro'], forged: 'Chefe da Raid' }, bossLoot: true },
  // chefes de Natal: só 1 item por vitória — uma peça do Conjunto Natalino (sorteada pelo dano) — e ouro
  natal: { gold: 1, drops: [], item: { chance: 1, tier: 'chefe_menor', count: 1, roll: [1, 1], min: ['raro'], forged: 'Natal' }, bossLoot: true },
  neve: { gold: 0.6, drops: [{ id: 'pocao_vida', chance: 0.08 }] },
  evento_chefe: { gold: 1, drops: [{ id: 'fragmento_fenda', chance: 1, qty: [2, 4] }, { id: 'pocao_vida', chance: 0.7 }], item: { chance: 1, tier: 'chefe_menor', count: 3, roll: [1, 3], min: ['raro', 'raro', 'raro'], forged: 'Campeão do Evento' }, bossLoot: true },
};

Object.assign(MATERIALS, TROPHIES);

// montarias especiais: item -> modelo
export const MOUNT_ITEMS = { cavalo_criador: 'cavalo', lobo_criacao: 'lobo' };
export const ITEM_CLASS_BIAS = 0; // a classe NÃO muda o que cai: as chances são iguais para todos (arma de outra classe serve para vender ou trocar)
