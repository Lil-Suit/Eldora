// Hunts: pontos de farm com MUITOS monstros juntos (espalhados, sem grupinhos) que voltam rápido.
// Cada mapa tem os seus, do mais fraco ao mais forte. Aparecem no mapa (⚔) e têm uma placa no chão.
// area 'world': x/z do mundo; 'ermos' e 'confins': x/z locais do mapa (o deslocamento é somado no jogo).
import { MOB_LEVELS } from './moblevels.js';

const L = (t) => MOB_LEVELS[t] || 1;

export const HUNTS = [
  // ---------- Vale de Eldoria ----------
  { id: 'h_slime',   name: 'Hunt dos Slimes',    area: 'world', x: 56,   z: -6,   r: 15, mobs: ['slime'], count: 10, lvl: [2, 3] },
  { id: 'h_lobo',    name: 'Hunt dos Lobos',     area: 'world', x: 152,  z: -42,  r: 16, mobs: ['wolf'], count: 9, lvl: [5, 6] },
  { id: 'h_goblin',  name: 'Hunt Goblin',        area: 'world', x: -126, z: -40,  r: 16, mobs: ['goblin', 'goblin_atirador'], count: 9, lvl: [5, 6] },
  { id: 'h_osso',    name: 'Hunt dos Ossos',     area: 'world', x: -62,  z: -150, r: 16, mobs: ['skeleton'], count: 9, lvl: [7, 8] },
  { id: 'h_planice', name: 'Hunt da Planície',   area: 'guardiao', x: -60,  z: -312, r: 18, mobs: ['couraco', 'guardian', 'rajado'], count: 10, lvl: [9, 10] },
  // ---------- Ermos (nível fixo de cada monstro) ----------
  { id: 'h_brasa',   name: 'Hunt das Brasas',    area: 'ermos', x: -150, z: 300, r: 22, mobs: ['besouro_brasa'], count: 8 },
  { id: 'h_lago',    name: 'Hunt do Lago',       area: 'ermos', x: -60,  z: 150, r: 22, mobs: ['caranguejo_abissal', 'conjurador_afogado'], count: 8 },
  { id: 'h_ossario', name: 'Hunt do Ossário',    area: 'ermos', x: -250, z: -100, r: 22, mobs: ['gargula'], count: 7 },
  { id: 'h_trono',   name: 'Hunt do Trono',      area: 'ermos', x: 60,   z: -280, r: 22, mobs: ['cavaleiro_trono', 'arauto_fenda'], count: 6 },
  // ---------- Confins ----------
  { id: 'h_dourada', name: 'Hunt Dourada',       area: 'confins', x: -200,  z: 1280, r: 26, mobs: ['minotauro', 'javali_dourado', 'javali'], count: 7 },
  { id: 'h_brejo',   name: 'Hunt do Brejo',      area: 'confins', x: -880,  z: 480,  r: 26, mobs: ['homem_lagarto', 'sapo'], count: 7 },
  { id: 'h_ambar',   name: 'Hunt do Âmbar',      area: 'confins', x: 880,   z: 480,  r: 26, mobs: ['escorpiao_ambar', 'basilisco'], count: 7 },
  { id: 'h_esmeralda', name: 'Hunt Esmeralda',   area: 'confins', x: -180,  z: 250,  r: 26, mobs: ['lobisomem', 'cervo_espinhoso'], count: 6 },
  { id: 'h_gelo',    name: 'Hunt do Gelo',       area: 'confins', x: -740,  z: -960, r: 26, mobs: ['yeti', 'morsa'], count: 6 },
  { id: 'h_magma',   name: 'Hunt do Magma',      area: 'confins', x: 760,   z: -980, r: 26, mobs: ['salamandra_magma', 'rinoceronte'], count: 6 },
];

// nível de cada monstro da hunt (Vale: faixa da hunt; Ermos/Confins: nível fixo do monstro)
export function huntLevels(h, type) { return h.lvl || [L(type), L(type)]; }
export function huntRange(h) {
  if (h.lvl) return h.lvl;
  const ls = h.mobs.map(L); return [Math.min(...ls), Math.max(...ls)];
}
// quanto tempo o monstro de uma hunt demora para voltar (bem mais rápido que o normal)
export function huntRespawn(level) { return Math.round(Math.min(60, 14 + level * 0.3)); }
