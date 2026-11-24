import { ENEMIES } from './enemies.js';
import { MOB_LEVELS } from './moblevels.js';
import { BIOME_SETS } from './biomas.js';

// =============================================================
// Estética dos itens por MONSTRO de origem: cada item lembra quem o deixou cair.
// Ex.: item do Golem de Pedra = cinza com pedrinhas; da Brasa Viva = vermelho com chamas;
// do Yeti = branco-azulado com cristais de gelo; do Esqueleto = osso com espinhos…
// - metal/madeira do item ganham as cores do tema (e um toque da cor do próprio monstro);
// - um "detalhe" (motif) aparece no ícone e na arma/armadura 3D;
// - o fundo (raridade) continua igual: a gema e a moldura mostram a raridade.
// =============================================================
export const THEMES = {
  pedra:   { name: 'Pedra',   metal: '#9a9890', metalD: '#6a6862', dark: '#45433f', wood: '#6e6a63', woodD: '#4c4944', fx: '#b8b6ae', fx2: '#7d7b74', motif: 'pedras' },
  fogo:    { name: 'Fogo',    metal: '#c8553a', metalD: '#8a2c1c', dark: '#4a1610', wood: '#3a2018', woodD: '#24120c', fx: '#ffb43a', fx2: '#ff6a1a', motif: 'chamas', glow: true },
  gelo:    { name: 'Gelo',    metal: '#cfeaff', metalD: '#86b8dc', dark: '#4a7aa0', wood: '#e8f4ff', woodD: '#a8c8e0', fx: '#aaf2ff', fx2: '#ffffff', motif: 'cristais', glow: true },
  osso:    { name: 'Osso',    metal: '#e8dfc6', metalD: '#b8ab88', dark: '#7a6e52', wood: '#d6caa8', woodD: '#9a8c6a', fx: '#f6f0dc', fx2: '#cfc3a2', motif: 'espinhos' },
  gosma:   { name: 'Gosma',   metal: '#7ad86a', metalD: '#3e9a3a', dark: '#1e5a22', wood: '#4e8a3e', woodD: '#2e5a24', fx: '#a6ff8a', fx2: '#5fd04e', motif: 'gotas' },
  goblin:  { name: 'Goblin',  metal: '#9a7a52', metalD: '#6a4e30', dark: '#3a2a18', wood: '#5a6a2a', woodD: '#3a4818', fx: '#8ab83a', fx2: '#c89a4a', motif: 'remendos' },
  lobo:    { name: 'Lobo',    metal: '#b8b2a8', metalD: '#7e776c', dark: '#4a443c', wood: '#6e5a44', woodD: '#4a3a2a', fx: '#f2ece0', fx2: '#8a8070', motif: 'presas' },
  areia:   { name: 'Areia',   metal: '#e2c58a', metalD: '#b08c4a', dark: '#6e5428', wood: '#c8a060', woodD: '#8a6a34', fx: '#ffb43a', fx2: '#d88a1a', motif: 'ambar' },
  brejo:   { name: 'Brejo',   metal: '#6a7a4a', metalD: '#46522e', dark: '#262e18', wood: '#4a4a2a', woodD: '#2e2e18', fx: '#8aa84a', fx2: '#5a6a2a', motif: 'musgo' },
  bosque:  { name: 'Bosque',  metal: '#5ab86a', metalD: '#2e7a3e', dark: '#1a4a24', wood: '#7a5a34', woodD: '#4e3a20', fx: '#8ae86a', fx2: '#3aa84a', motif: 'folhas' },
  cerebro: { name: 'Cérebro', metal: '#e89aa8', metalD: '#b8607a', dark: '#6a2a3e', wood: '#a85a6a', woodD: '#6a3442', fx: '#ffc0cc', fx2: '#d87090', motif: 'bolhas' },
  fenda:   { name: 'Fenda',   metal: '#8a5ad8', metalD: '#5a2ea8', dark: '#2a1458', wood: '#3a2a5a', woodD: '#22183a', fx: '#d36bff', fx2: '#5ef0ff', motif: 'runas', glow: true },
  cristal: { name: 'Cristal', metal: '#9ad8f0', metalD: '#5aa0c8', dark: '#2a5a7a', wood: '#5a7a9a', woodD: '#3a5270', fx: '#c8f4ff', fx2: '#ff9ad8', motif: 'cristais', glow: true },
  sombra:  { name: 'Sombra',  metal: '#3a3448', metalD: '#241e30', dark: '#120e1a', wood: '#2a2434', woodD: '#18141e', fx: '#a86bff', fx2: '#5a3a8a', motif: 'runas', glow: true },
  fera:    { name: 'Fera',    metal: '#a87a4a', metalD: '#6e4a28', dark: '#3a2614', wood: '#7a5230', woodD: '#4e321c', fx: '#f2ece0', fx2: '#a8784a', motif: 'presas' },
  abismo:  { name: 'Abismo',  metal: '#2a6a8a', metalD: '#184a64', dark: '#0a2232', wood: '#1e3a4a', woodD: '#12242e', fx: '#5ef0d0', fx2: '#2aa8a0', motif: 'gotas', glow: true },
  ouro:    { name: 'Ouro',    metal: '#f2c84a', metalD: '#c89a1e', dark: '#7a5a10', wood: '#a87a2a', woodD: '#6e4e18', fx: '#fff0a0', fx2: '#ffd84a', motif: 'ambar' },
};

// qual tema combina com cada monstro (pelo nome/tipo/modelo); os que não combinam com nada ficam com a cor do próprio monstro
const RULES = [
  [/magma|brasa|cinza|piromante|salamandra|cerbero|cao_brasa|diabrete|besouro_brasa/, 'fogo'],
  [/gelo|yeti|polar|neve/, 'gelo'],
  [/cristal/, 'cristal'],
  [/astral|fenda|rift|ruptura|arauto|oraculo|alma/, 'fenda'],
  [/golem|pedra|rochoso|colosso|guardian|touro/, 'pedra'],
  [/esqueleto|skeleton|osso|ossario|necromante|vigia|cavaleiro_cinza|arqueiro_falesias/, 'osso'],
  [/escorpiao|areia|dunas|arenito|chacal|ambar/, 'areia'],
  [/brejo|lodo|lagarto|musgo|afogado/, 'brejo'],
  [/esmeralda|bosque|cervo|aranha_galhos/, 'bosque'],
  [/cerebro/, 'cerebro'],
  [/sombrio|corrompido|cavaleiro_trono|negro/, 'sombra'],
  [/abissal|caranguejo/, 'abismo'],
  [/dourado|mel|javali_rei/, 'ouro'],
  [/goblin|saqueador|atirador|horda/, 'goblin'],
  [/wolf|lobo|lobisomem|alpha/, 'lobo'],
  [/javali|minotauro|urso|fera/, 'fera'],
  [/slime|gosma|enxame/, 'gosma'],
];
const cache = new Map();
// detalhes alternativos (para os itens do mesmo tema com nomes diferentes)
const ALT_MOTIFS = ['runas', 'presas', 'pedras', 'gotas', 'cristais', 'remendos', 'bolhas', 'musgo', 'folhas', 'ambar', 'espinhos', 'chamas'];
const variants = new Map();
const TINTS = ['#4a78d8', '#c8423a', '#3aa868', '#d8a82a', '#9a4ad8', '#2ab8c8', '#d86aa8', '#6a6a7a'];
const dist = (a, b) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); return Math.hypot(((pa >> 16) & 255) - ((pb >> 16) & 255), ((pa >> 8) & 255) - ((pb >> 8) & 255), (pa & 255) - (pb & 255)); };
function variantOf(key, short) {
  let list = variants.get(key);
  if (!list) {
    list = [];
    const ks = Object.keys(ENEMIES).filter((k) => (RULES.find(([re]) => re.test(k)) || [])[1] === key)
      .sort((a, b) => (MOB_LEVELS[a] || ENEMIES[a].level || 0) - (MOB_LEVELS[b] || ENEMIES[b].level || 0) || a.localeCompare(b));
    for (const k of ks) { const n = mobShortName(k); if (n && !list.includes(n)) list.push(n); }
    variants.set(key, list);
  }
  return Math.max(0, list.indexOf(short));
}
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
};

// tema de um tipo de monstro: { key, name, mob, metal, metalD, dark, wood, woodD, fx, fx2, motif, glow }
export function themeOfMob(type) {
  if (!type) return null;
  if (cache.has(type)) return cache.get(type);
  const d = ENEMIES[type];
  if (!d) { cache.set(type, null); return null; }
  const key = (RULES.find(([re]) => re.test(type)) || [])[1];
  const own = typeof d.color === 'number' ? hex(d.color) : null;
  let t;
  if (key) {
    const b = THEMES[key];
    // toque da cor do monstro: dois monstros do mesmo tema ainda ficam um pouco diferentes
    t = { ...b, key, metal: own ? mix(b.metal, own, 0.28) : b.metal, metalD: own ? mix(b.metalD, own, 0.2) : b.metalD };
    // nome diferente = aparência diferente: no mesmo tema, cada "sobrenome" de item (Osso, Ossário, Falésias…)
    // ganha um detalhe próprio e bem mais da cor do monstro. O primeiro do tema fica com o visual base.
    const vi = variantOf(key, mobShortName(type));
    if (vi > 0) {
      // cor do monstro; se ela for parecida com a do tema (ex.: osso bege), usa uma cor de destaque própria da variação
      const alts = ALT_MOTIFS.filter((m) => m !== b.motif);
      const oc = own && dist(own, b.wood) > 110 && dist(own, b.metal) > 110 ? own : TINTS[(vi - 1) % TINTS.length];
      Object.assign(t, {
        metal: mix(b.metal, oc, 0.5), metalD: mix(b.metalD, oc, 0.45), dark: mix(b.dark, oc, 0.35),
        wood: mix(b.wood, oc, 0.6), woodD: mix(b.woodD, oc, 0.55),
        motif: alts[(vi - 1) % alts.length],
        ...(vi % 2 === 0 ? { fx: b.fx2, fx2: b.fx } : {}),
      });
    }
  } else if (own) {
    t = { key: 'cor', name: d.name, metal: mix('#c0c4ca', own, 0.6), metalD: mix('#7d838f', own, 0.6), dark: mix('#3a3a44', own, 0.4), wood: mix('#6e4524', own, 0.35), woodD: mix('#4a2e18', own, 0.35), fx: mix('#ffffff', own, 0.5), fx2: own, motif: 'riscos' };
  } else t = null;
  if (t) { t.mob = d.name; t.type = type; }
  cache.set(type, t);
  return t;
}
// conjuntos de chefe têm a estética própria (branco e dourado, brilho verde de cura)
const SET_THEMES = {
  natal: { key: 'natal', type: 'set:natal', set: true, name: 'Natal', mob: 'Natal', metal: '#f6f6f2', metalD: '#c9c9c0', dark: '#1e6a34', wood: '#d8283a', woodD: '#8a1420', fx: '#e8283a', fx2: '#2fae4f', motif: 'natal', glow: false },
  prece: { key: 'prece', type: 'set:prece', set: true, name: 'Prece', mob: 'Conjunto da Prece', metal: '#f4efdc', metalD: '#c8b47a', dark: '#7a6630', wood: '#efe4c4', woodD: '#b8a272', fx: '#a6ffd6', fx2: '#ffe9a0', motif: 'runas', glow: true } };
// v0.12 (pacote 2): sets por BIOMA. A peça "Capacete da Geada" tem as cores e o detalhe do Set da Geada.
const biomeCache = new Map();
export function biomeTheme(b) {
  if (!b || !BIOME_SETS[b]) return null;
  if (!biomeCache.has(b)) { const S = BIOME_SETS[b]; biomeCache.set(b, { glow: false, ...S.theme, key: 'set_' + b, bset: b, type: 'b:' + b, name: S.bioma, mob: S.name }); }
  return biomeCache.get(b);
}
// item na bolsa/equipado: conjunto de chefe (Prece/Natal) > set do bioma > item antigo (monstro) > item solto (sem estética)
export function itemTheme(it) {
  if (!it || it.kind !== 'equip') return null;
  if (it.set && SET_THEMES[it.set]) return SET_THEMES[it.set];
  if (it.bset) return biomeTheme(it.bset);
  return it.src ? themeOfMob(it.src) : null;
}
// peça vista de longe (herói de outro jogador): chega só "b:<set>" ou o monstro antigo
export function gearTheme(w) {
  if (!w) return null;
  if (w.bset) return biomeTheme(w.bset);
  if (typeof w.src === 'string' && w.src.startsWith('b:')) return biomeTheme(w.src.slice(2));
  return themeOfMob(w.src);
}
// o que vai na rede para os outros verem a cor da peça
export const gearKey = (w) => (w?.bset ? 'b:' + w.bset : w?.src || null);

// =============================================================
// Nome simples do item pelo monstro: "Capacete Slime", "Espada Goblin", "Peitoral Lobo", "Botas Golem"…
// =============================================================
const GENERIC = new Set(['homem', 'rei', 'rainha', 'chefe', 'grande', 'comandante', 'arauto', 'sentinela', 'guardião', 'caçador', 'conjurador', 'feiticeiro', 'arqueiro', 'necromante', 'cavaleiro', 'batedor', 'colosso', 'titã', 'oráculo', 'alma', 'vigia']);
const NOUN_BY_KIND = { espada: 'Espada', machado: 'Machado', montante: 'Montante', arco: 'Arco', arco_longo: 'Arco Longo', varinha: 'Varinha', cajado: 'Cajado', orbe: 'Orbe', adaga: 'Adaga', clava: 'Clava', capuz: 'Capuz', elmo: 'Capacete', tiara: 'Chapéu', chapeu: 'Chapéu', couro: 'Peitoral', malha: 'Peitoral', manto: 'Manto', calca: 'Calça', grevas: 'Calça', escudo: 'Escudo', broquel: 'Escudo', escudo_runico: 'Escudo', escudo_torre: 'Escudo', bota: 'Botas', mochila: 'Mochila' };
const NOUN_BY_SLOT = { weapon: 'Arma', helm: 'Capacete', chest: 'Peitoral', legs: 'Calça', boots: 'Botas', gloveL: 'Luva Esq.', gloveR: 'Luva Dir.', shield: 'Escudo', back: 'Mochila', ring: 'Anel', neck: 'Cordão' };
// v0.11: os monstros ganharam nomes curtos; a palavra dos itens continua a de antes (ninguém vê o nome do item mudar)
const ITEM_WORD = { rei_esqueleto: 'Lorde', boss_fenda: 'Fenda', batedor_cinzas: 'Cinzas', conjurador_afogado: 'Afogado', arqueiro_falesias: 'Falésias', cavaleiro_osso: 'Osso', necromante_ossario: 'Ossário', colosso_cristal: 'Cristal', esqueleto_areia: 'Dunas', colosso_areia: 'Arenito', tita_gelo: 'Gelo', tita_magma: 'Magma', cavaleiro_fenda: 'Fenda', tita_fenda: 'Fenda', colosso_gelo: 'Gelo', colosso_magma: 'Magma', cavaleiro_cinza: 'Cinzas', campeao_ossos: 'Mortos', campeao_osso: 'Osso', campeao_tita_gelo: 'Gelo', campeao_tita_magma: 'Magma', campeao_tita_fenda: 'Fenda' };
export function mobShortName(type) {
  if (ITEM_WORD[type]) return ITEM_WORD[type];
  const d = ENEMIES[type]; if (!d) return '';
  const words = d.name.replace(/-/g, ' ').split(/\s+/);
  const first = words[0];
  if (!GENERIC.has(first.toLowerCase())) return first;
  if (words[1] && !['de', 'do', 'da', 'dos', 'das'].includes(words[1].toLowerCase())) return words[1]; // "Rei Minotauro" → Minotauro
  // "Homem de Gelo" → Gelo, "Cavaleiro de Osso" → Osso, "Colosso de Cristal" → Cristal
  const i = words.findIndex((w) => ['de', 'do', 'da', 'dos', 'das'].includes(w.toLowerCase()));
  return i >= 0 && words[i + 1] ? words[i + 1] : words[words.length - 1];
}
export function themedItemName(it) {
  if (!it?.src || it.named) return it?.name;
  const noun = NOUN_BY_KIND[it.wkind] || NOUN_BY_SLOT[it.slot] || 'Item';
  return `${noun} ${mobShortName(it.src)}`;
}

// =============================================================
// Itens antigos (de antes da estética por monstro) não sabiam de quem caíram: ganham um monstro
// do mesmo nível do item (de preferência um que solta mais aquela peça). Sempre o mesmo para o mesmo item.
// O equipamento inicial (comum, nível 1, da loja/começo do jogo) continua simples.
// =============================================================
const STARTER_BASES = new Set(['espada_curta', 'arco_curto', 'varinha', 'escudo_madeira', 'capuz_couro', 'gibao_couro', 'calca_couro', 'luva_couro_e', 'luva_couro_d', 'botas_couro', 'mochila_couro']);
const NOT_SOURCE = /^(rei_|campeao|boss)|^(vigia|javali_rei)$/;
let sources = null;
function sourceList() {
  if (!sources) sources = Object.entries(MOB_LEVELS).filter(([k]) => ENEMIES[k] && !ENEMIES[k].boss && !ENEMIES[k].miniboss && !NOT_SOURCE.test(k) && themeOfMob(k)).map(([k, lv]) => ({ k, lv }));
  return sources;
}
const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function needsSrc(it) {
  if (!it || it.kind !== 'equip' || it.named || it.src || it.set) return false;
  if (STARTER_BASES.has(it.base) && (it.ilvl || 1) <= 1 && (it.rarity || 'comum') === 'comum') return false;
  return true;
}
export function guessSrc(it) {
  const L = Math.max(1, +it.ilvl || 1), list = sourceList();
  const best = Math.min(...list.map((x) => Math.abs(x.lv - L)));
  const pool = list.filter((x) => Math.abs(x.lv - L) <= best + 2);
  return pool[hashStr(String(it.uid || it.base + L)) % pool.length].k;
}
// dá a estética (e o nome "Peça Monstro") a um item antigo; devolve true se mudou
export function themeOldItem(it) {
  if (!needsSrc(it)) return false;
  it.src = guessSrc(it);
  it.name = themedItemName(it);
  return true;
}
