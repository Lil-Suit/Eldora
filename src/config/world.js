import { MOB_LEVELS } from './moblevels.js';
// =============================================================
// ELDORIA — Vale de Eldoria: layout do mundo (norte = -z)
// =============================================================

export const WORLD = {
  size: 400,          // terreno de -200 a 200
  grid: 200,          // células do terreno (2u cada)
  playable: 172,      // limite |x|,|z| jogável
  waterLevel: -0.45,
  deepWater: -1.05,   // abaixo disso não é possível andar
  slopeLimit: 1.35,   // subida máxima por unidade
  spawn: { x: 4, z: 77 },
  safeZone: { x: 0, z: 96, r: 67 },
  dungeonOffset: { x: 600, z: 0 },
};

// Acampamento Goblin: a paliçada deixou de ser redonda (pacote 3). Continua no mesmo lugar ao sul (portão leste na estrada)
// e se alonga para o norte/nordeste até perto do morro do fim do mapa — área ~2× maior, com mais goblins.
// Contorno (x, z) e portões (aberturas na paliçada: centro e largura).
export const CAMP = {
  x: -106, z: -42, R: 38, // centro e raio da parte antiga (praça, fogueira grande)
  poly: [[-68, -24], [-76, -10], [-92, -3], [-112, -2], [-130, -9], [-142, -24], [-146, -46], [-146, -80], [-144, -110], [-136, -132],
    [-118, -142], [-96, -142], [-84, -132], [-82, -104], [-86, -88], [-76, -66], [-68, -56]],
  gates: [{ x: -68, z: -40, w: 7 }, { x: -122, z: -6, w: 5 }, { x: -83, z: -118, w: 6 }],
};
function polyInside(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyEdgeDist(P, x, z) {
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
// dentro da paliçada do acampamento? (m > 0: um pouco para fora também; m < 0: só bem dentro)
export function inCamp(x, z, m = 0) {
  const inside = polyInside(CAMP.poly, x, z);
  if (!m) return inside;
  const d = polyEdgeDist(CAMP.poly, x, z);
  return m > 0 ? inside || d < m : inside && d > -m;
}
export const campEdgeDist = (x, z) => polyEdgeDist(CAMP.poly, x, z);
export function campArea() { const P = CAMP.poly; let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return Math.abs(a) / 2; }

export const LOCATIONS = {
  vila:        { name: 'Vila de Eldoria',          x: 0,    z: 96,   r: 66, xp: 0,  safe: true, levels: 'Segura' },
  ponte:       { name: 'Ponte de Pedra',           x: 0,    z: 22,   r: 9,  xp: 20 },
  prado:       { name: 'Prado das Gosmas',         x: 12,   z: -16,  r: 28, xp: 25, levels: '1' },
  colina:      { name: 'Colina do Velho Carvalho', x: -36,  z: -36,  r: 11, xp: 40 },
  floresta:    { name: 'Floresta Sussurrante',     x: 100,  z: -45,  r: 62, xp: 40, levels: '8' },
  poco_lua:    { name: 'Poço da Lua',              x: 132,  z: -48,  r: 9,  xp: 45 },
  acampamento: { name: 'Acampamento Goblin',       x: -110, z: -70,  r: 74, xp: 50, levels: '5–6 · chefe 1' },
  circulo:     { name: 'Círculo de Pedras',        x: -72,  z: -78,  r: 9,  xp: 45 },
  ruinas:      { name: "Ruínas de Vel'Thar",       x: -26,  z: -102, r: 38, xp: 60, levels: '12 · chefe 14' },
  cripta:      { name: 'Cripta do Vigia',          x: 148,  z: -112, r: 9,  xp: 60, levels: '12–17' },
  planalto:    { name: 'Planalto da Fenda',        x: 35,   z: -156, r: 30, xp: 80, levels: '18' },
  // estes dois ficam no MAPA 2 (área 'guardiao'), nas mesmas coordenadas de antes
  planicie_guardiao: { name: 'Planície do Guardião', x: 35, z: -312, r: 150, xp: 120, levels: '12–18', area: 'guardiao' },
  arena_guardiao: { name: 'Trono do Guardião', x: 35, z: -400, r: 34, xp: 60, levels: 'Chefe · 25', area: 'guardiao' },
  lago:        { name: 'Lago Espelhado',           x: -95,  z: 32,   r: 25, xp: 30 },
  fazenda_oeste: { name: 'Fazendas do Oeste',      x: -102, z: 108,  r: 30, xp: 15, safe: true, levels: 'Segura' },
  fazenda_leste: { name: 'Fazendas do Leste',      x: 100,  z: 102,  r: 30, xp: 15, safe: true, levels: 'Segura' },
  ilha:        { name: 'Ilha do Bosque Oculto',    x: -95,  z: 32,   r: 7,  xp: 70, secret: true },
};

// Linhas centrais das estradas
export const ROADS = [
  [[0, 150], [0, 104], [0, 78], [0, 46], [0, 30], [0, 12], [0, -8]],
  [[-127, 108], [-90, 108], [-58, 108], [-30, 106], [0, 104], [30, 106], [58, 108], [90, 108], [125, 108]],
  [[0, -8], [30, -14], [62, -18], [90, -26], [112, -52], [134, -80], [148, -108]],
  [[0, -8], [-30, -16], [-60, -30], [-90, -42], [-104, -42]],
  [[0, -8], [-8, -40], [-18, -70], [-24, -94]],
  [[-24, -94], [-4, -102], [20, -106], [35, -110], [35, -130]],
];

export const RIVER = [
  [-215, 30], [-160, 24], [-118, 32], [-95, 32], [-72, 30], [-40, 22], [-14, 24],
  [0, 22], [24, 18], [52, 24], [84, 18], [118, 26], [150, 20], [215, 26],
];
export const LAKE = { x: -95, z: 32, r: 23, island: 7.5 };
export const POND = { x: 132, z: -52, r: 6.5 };
export const BRIDGE = { x: 0, z0: 9, z1: 35, half: 4.6, y0: 3.15, y1: 1.62, arch: 1.25 }; // ponte de pedra larga: sai do barranco sul (y0) e chega no norte (y1)
// Pedras para atravessar o lago até a ilha (caminho alternativo)
export const STEPPING_STONES = [
  [-95, 9.5], [-94.2, 11.6], [-95.4, 13.7], [-94.6, 15.8], [-95.6, 17.9], [-94.8, 20], [-95.3, 22.1], [-94.9, 24.2],
];

export const PLATEAU = { x: 35, z: -158, r: 28, h: 7, ramp: { x0: 31, x1: 39, zTop: -131, zBottom: -112 }, gateZ: -129.5 };
export const HILL = { x: -36, z: -36, amp: 8, sigma: 11 };
// Floresta Sussurrante: do bosque até a entrada da Cripta (distância à linha)
export const FOREST_PATH = [[96, -22], [118, -56], [144, -98]];
export const CRYPT_MOUND = { x: 148, z: -126, amp: 9, sigma: 8, door: { x: 148, z: -116.5 } };

export const VILLAGE = {
  center: { x: 0, z: 70 },
  houses: [
    { x: -17, z: 80, rot: 0.4, w: 7, d: 6, color: 0xe8dcc0, roof: 0x9b3d2c },
    { x: -7,  z: 88, rot: 0.1, w: 6, d: 5, color: 0xdccfb0, roof: 0x7a4b2a },
    { x: 10,  z: 87, rot: -0.2, w: 7, d: 6, color: 0xeee2c8, roof: 0x9b3d2c },
    { x: 21,  z: 77, rot: -0.6, w: 6, d: 6, color: 0xe2d4b6, roof: 0x5e6b7c },
    { x: 22,  z: 58, rot: -1.2, w: 6, d: 5, color: 0xe8dcc0, roof: 0x7a4b2a },
    { x: -23, z: 62, rot: 1.25, w: 6, d: 5, color: 0xdccfb0, roof: 0x5e6b7c },
    { x: -12, z: 52, rot: 0.9, w: 5, d: 5, color: 0xeee2c8, roof: 0x9b3d2c },
    // casas da vila nova (5× maior)
    { x: -20, z: 120, rot: 0.05, w: 6, d: 5, color: 0xe8dcc0, roof: 0x9b3d2c },
    { x: 21, z: 122, rot: -0.08, w: 7, d: 6, color: 0xdccfb0, roof: 0x7a4b2a },
    { x: -36, z: 128, rot: 0.3, w: 8, d: 5, color: 0xeee2c8, roof: 0x5e6b7c },
    { x: 36, z: 130, rot: -0.3, w: 6, d: 6, color: 0xe2d4b6, roof: 0x9b3d2c },
    { x: -15, z: 140, rot: 0.02, w: 7, d: 5, color: 0xe8dcc0, roof: 0x9b3d2c },
    { x: 16, z: 142, rot: -0.04, w: 8, d: 6, color: 0xdccfb0, roof: 0x7a4b2a },
    { x: -46, z: 94, rot: 1.25, w: 6, d: 5, color: 0xeee2c8, roof: 0x5e6b7c },
    { x: 46, z: 92, rot: -1.25, w: 7, d: 6, color: 0xe2d4b6, roof: 0x9b3d2c },
    { x: -48, z: 78, rot: 1.45, w: 8, d: 5, color: 0xe8dcc0, roof: 0x9b3d2c },
    { x: 48, z: 76, rot: -1.45, w: 6, d: 6, color: 0xdccfb0, roof: 0x7a4b2a },
    { x: -29, z: 145, rot: 0.2, w: 7, d: 5, color: 0xeee2c8, roof: 0x5e6b7c },
    { x: 31, z: 146, rot: -0.2, w: 8, d: 6, color: 0xe2d4b6, roof: 0x9b3d2c },
    { x: -50, z: 116, rot: 0.9, w: 6, d: 5, color: 0xe8dcc0, roof: 0x9b3d2c },
    { x: 52, z: 118, rot: -0.9, w: 7, d: 6, color: 0xdccfb0, roof: 0x7a4b2a },
    { x: -34, z: 88, rot: 1.1, w: 8, d: 5, color: 0xeee2c8, roof: 0x5e6b7c },
    { x: 36, z: 96, rot: -1.1, w: 6, d: 6, color: 0xe2d4b6, roof: 0x9b3d2c },
  ],
  forge: { x: -13, z: 64, rot: 1.4 },
  stall: { x: 13, z: 64, rot: -1.4 },
  supply: { x: -13.5, z: 72.5, rot: 1.4 }, // barraca da Fornecedora (poções e flechas)
  // balcões do Banco e da Loja dos Jogadores (na frente das NPCs, virados para a estátua)
  bank: { x: -7.6, z: 78.4, rot: -0.834 },
  pshop: { x: 7.6, z: 78.4, rot: 0.834 },
  well: { x: 0, z: 70 },
  fenceR: 67,
  // cerca 5× maior (área) que a antiga; a praça (NPCs) continua no mesmo lugar, perto do portão sul
  wall: { x: 0, z: 96 },
  gates: [-Math.PI / 2], // ângulos sem cerca (norte)
  // muralha de castelo (no lugar da cerca redonda): contorno reto, cidade maior para o leste e o oeste
  // (o lado oeste desvia do Lago Espelhado). Os portões são aberturas nos lados (centro e largura).
  wallPoly: [[-62, 40], [62, 40], [124, 46], [126, 153], [-126, 153], [-128, 62], [-74, 62]],
  wallGates: [{ x: 0, z: 40, w: 11 }, { x: 125, z: 108, w: 9 }, { x: -127, z: 108, w: 9 }],
  // plantações das partes novas (campos: centro, tamanho, rotação e cultura)
  farms: [
    { x: -104, z: 80, w: 26, d: 18, rot: 0.05, crop: 'trigo' }, { x: -104, z: 128, w: 30, d: 22, rot: -0.04, crop: 'milho' },
    { x: -78, z: 128, w: 14, d: 22, rot: 0, crop: 'horta' }, { x: -84, z: 86, w: 14, d: 14, rot: 0.1, crop: 'abobora' },
    { x: 100, z: 70, w: 30, d: 18, rot: -0.05, crop: 'milho' }, { x: 104, z: 130, w: 28, d: 24, rot: 0.04, crop: 'trigo' },
    { x: 78, z: 132, w: 14, d: 20, rot: 0, crop: 'horta' }, { x: 80, z: 86, w: 12, d: 14, rot: -0.08, crop: 'abobora' },
  ],
  barns: [{ x: -110, z: 95, rot: 0.02 }, { x: 108, z: 96, rot: -0.03 }],
  mills: [{ x: -84, z: 146 }, { x: 116, z: 54 }],
};

// dentro da muralha da vila? (polígono; margem > 0 = um pouco para fora, < 0 = só bem dentro)
export function inVillage(x, z, m = 0) {
  const inside = polyInside(VILLAGE.wallPoly, x, z);
  if (!m) return inside;
  const d = villageEdgeDist(x, z);
  return m > 0 ? inside || d < m : inside && d > -m;
}
// distância até o contorno da muralha
export function villageEdgeDist(x, z) { return polyEdgeDist(VILLAGE.wallPoly, x, z); }

export const NPC_SPAWNS = {
  mestre:      { x: 3.2,  z: 67, rot: Math.PI },
  ferreira:    { x: -10.5, z: 63.5, rot: -Math.PI / 2 },
  mercador:    { x: 10.5, z: 64, rot: Math.PI / 2 },
  fornecedora: { x: -10.6, z: 72, rot: -Math.PI / 2 },
  banqueira:   { x: -7.6, z: 78.4, rot: -0.834 },
  leiloeira:   { x: 7.6, z: 78.4, rot: 0.834 },
  exploradora: { x: -4.5, z: 46.5, rot: Math.PI },
  cronista:    { x: 0, z: 104, rot: Math.PI }, // Livro dos Itens: longe dos comerciantes, na parte norte da vila
  eco:         { x: -26,  z: -98.5, rot: 0 },
};

// Grupos de inimigos no mundo
export const SPAWNERS = [
  { id: 'prado0', type: 'slime', count: 3, x: 10, z: 1, r: 5, lvl: [1, 1] },
  { id: 'prado1', type: 'slime', count: 4, x: 24, z: -16, r: 7, lvl: [1, 2] },
  { id: 'prado2', type: 'slime', count: 4, x: -12, z: -22, r: 7, lvl: [2, 3] },
  { id: 'prado3', type: 'slime', count: 3, x: 30, z: -38, r: 6, lvl: [2, 3] },
  // primeiro chefe: Rei Slime (passivo: só luta se for atacado; volta 10 min depois de derrotado)
  // chefe das Ruínas: Lorde dos Ossos (volta 10 min depois de derrotado)
  { id: 'rei_esqueleto', type: 'rei_esqueleto', count: 1, x: -26, z: -110, r: 1, lvl: [8, 8], respawnSec: 600 },
  { id: 'rei_slime', type: 'rei_slime', count: 1, x: -106, z: -28, r: 1, lvl: [1, 1], respawnSec: 600 }, // dentro do Acampamento Goblin
  { id: 'chefe_goblin', type: 'campeao_goblin', count: 1, x: -112, z: -66, r: 1, lvl: [8, 8], respawnSec: 600 }, // chefe solo do Acampamento Goblin
  // ---- pacote 3: ZONAS (zone: true) — o jogo divide cada zona em grupinhos de 1 a 3 monstros, espalhados pela área toda
  // (ver Spawners.spreadGroups). camp: só dentro da paliçada. Total do acampamento: 34 goblins (antes 21).
  { id: 'gobA', type: 'goblin', count: 8, x: -106, z: -28, r: 30, lvl: [4, 5], zone: true, camp: true },
  { id: 'gobAa', type: 'goblin_atirador', count: 4, x: -112, z: -40, r: 30, lvl: [4, 5], zone: true, camp: true },
  { id: 'gobB', type: 'goblin', count: 7, x: -114, z: -76, r: 30, lvl: [5, 6], zone: true, camp: true },
  { id: 'gobBa', type: 'goblin_atirador', count: 4, x: -114, z: -76, r: 30, lvl: [5, 6], zone: true, camp: true },
  { id: 'gobC', type: 'goblin', count: 7, x: -114, z: -118, r: 28, lvl: [5, 6], zone: true, camp: true },
  { id: 'gobCa', type: 'goblin_atirador', count: 4, x: -114, z: -118, r: 28, lvl: [5, 6], zone: true, camp: true },
  // Ruínas de Vel'Thar: 22 esqueletos espalhados pelo anel e em volta (fora da estrada para o Guardião)
  { id: 'ruiA', type: 'skeleton', count: 9, x: -30, z: -92, r: 26, lvl: [6, 7], zone: true },
  { id: 'ruiB', type: 'skeleton', count: 8, x: -20, z: -114, r: 24, lvl: [7, 8], zone: true },
  { id: 'ruiC', type: 'skeleton', count: 3, x: -62, z: -118, r: 10, lvl: [7, 8], zone: true },
  { id: 'ruiD', type: 'skeleton', count: 2, x: 8, z: -88, r: 9, lvl: [6, 7], zone: true },
  // Floresta Sussurrante (do bosque até a Cripta): 34 lobos em grupinhos pela floresta toda
  { id: 'floA', type: 'wolf', count: 10, x: 82, z: -6, r: 24, lvl: [3, 4], zone: true },
  { id: 'floB', type: 'wolf', count: 12, x: 116, z: -34, r: 28, lvl: [4, 5], zone: true },
  { id: 'floC', type: 'wolf', count: 12, x: 110, z: -74, r: 26, lvl: [5, 6], zone: true },
  { id: 'pla1', type: 'guardian', count: 1, x: 27, z: -110, r: 1, lvl: [8, 8] },
  { id: 'pla2', type: 'guardian', count: 1, x: 43, z: -110, r: 1, lvl: [8, 9] },
  { id: 'pla3', type: 'guardian', count: 1, x: 18, z: -150, r: 2, lvl: [9, 9] },
  { id: 'pla4', type: 'guardian', count: 1, x: 52, z: -150, r: 2, lvl: [9, 10] },
  // Planície do Guardião (mapa 2): Guardiões Corrompidos, Couraços e Rajados (crias da Fenda)
  // floresta estendida até a Cripta
  { id: 'flo10', type: 'alpha_wolf', count: 1, x: 126, z: -84, r: 2, lvl: [6, 6] },
  { id: 'pg1', type: 'couraco', count: 4, x: 35, z: -232, r: 10, lvl: [8, 9] }, // longe da chegada pelo portal
  { id: 'pg2', type: 'guardian', count: 2, x: -10, z: -215, r: 8, lvl: [8, 9] },
  { id: 'pg3', type: 'guardian', count: 2, x: 85, z: -215, r: 8, lvl: [8, 9] },
  { id: 'pg4', type: 'couraco', count: 4, x: -50, z: -245, r: 10, lvl: [8, 9] },
  { id: 'pg5', type: 'couraco', count: 4, x: 125, z: -245, r: 10, lvl: [9, 10] },
  { id: 'pg6', type: 'guardian', count: 3, x: 35, z: -255, r: 10, lvl: [9, 9] },
  { id: 'pg7', type: 'rajado', count: 4, x: -20, z: -280, r: 10, lvl: [9, 10] },
  { id: 'pg8', type: 'rajado', count: 4, x: 95, z: -285, r: 10, lvl: [9, 10] },
  { id: 'pg9', type: 'couraco', count: 5, x: -60, z: -310, r: 12, lvl: [9, 10] },
  { id: 'pg10', type: 'guardian', count: 3, x: 130, z: -315, r: 10, lvl: [9, 10] },
  { id: 'pg11', type: 'couraco', count: 5, x: 35, z: -305, r: 12, lvl: [9, 10] },
  { id: 'pg12', type: 'guardian', count: 2, x: -30, z: -345, r: 8, lvl: [10, 10] },
  { id: 'pg13', type: 'couraco', count: 5, x: 100, z: -345, r: 12, lvl: [10, 10] },
  { id: 'pg14', type: 'rajado', count: 4, x: -70, z: -380, r: 10, lvl: [9, 10] },
  { id: 'pg15', type: 'couraco', count: 3, x: 140, z: -380, r: 8, lvl: [9, 10] },
  { id: 'pg16', type: 'guardian', count: 2, x: 0, z: -400, r: 6, lvl: [10, 11] },
  { id: 'pg17', type: 'guardian', count: 2, x: 70, z: -400, r: 6, lvl: [10, 11] },
  { id: 'pg18', type: 'couraco', count: 4, x: -45, z: -415, r: 8, lvl: [10, 11] },
  { id: 'pg19', type: 'couraco', count: 4, x: 115, z: -415, r: 8, lvl: [10, 11] },
  { id: 'pg20', type: 'rajado', count: 3, x: 35, z: -340, r: 8, lvl: [10, 10] },
  { id: 'pg21', type: 'rajado', count: 3, x: -75, z: -270, r: 8, lvl: [10, 10] },
  { id: 'pg22', type: 'guardian', count: 2, x: 145, z: -270, r: 4, lvl: [10, 10] },
  // mais monstros espalhados pelo vale
  { id: 'prado4', type: 'slime', count: 4, x: -28, z: 2, r: 8, lvl: [1, 2] },
  { id: 'prado5', type: 'slime', count: 4, x: 44, z: 6, r: 8, lvl: [2, 3] },
  { id: 'prado6', type: 'slime', count: 3, x: 8, z: -44, r: 7, lvl: [2, 3] },
  { id: 'lago1', type: 'slime', count: 4, x: -66, z: 40, r: 9, lvl: [2, 3] },
  { id: 'lago2', type: 'wolf', count: 3, x: -128, z: 54, r: 9, lvl: [3, 4] },
  { id: 'flo6', type: 'wolf', count: 3, x: 150, z: 30, r: 9, lvl: [5, 6] },
  { id: 'gob5', type: 'goblin_atirador', count: 2, x: -140, z: 10, r: 6, lvl: [4, 5] },
  { id: 'sul1', type: 'wolf', count: 3, x: 150, z: -150, r: 8, lvl: [7, 8] },
  { id: 'sul2', type: 'wolf', count: 3, x: 90, z: -150, r: 8, lvl: [8, 9] },
  { id: 'les1', type: 'wolf', count: 4, x: 170, z: -80, r: 9, lvl: [6, 7] },
];

// Planície do Guardião: o topo do planalto continua para o norte, plano e enorme (~23x a área do topo antigo).
// O Guardião da Fenda fica no fundo; o portal para os Ermos, atrás dele.
export const PLATEAU_EXT = { x0: -96, x1: 166, z0: -446, z1: -178, h: 7, rim: 15 };
// ---------- MAPA 2: Planície do Guardião ----------
// Antes era a continuação do Planalto (mapa 1). Agora é um mapa à parte (área 'guardiao'), nas MESMAS coordenadas:
// paredão de rocha em volta (inclusive ao sul), entra-se pelo portal no topo do Planalto da Fenda.
// Mapas: 1 Vale de Eldoria · 2 Planície do Guardião · 3 Ermos da Fenda · 4 Confins de Eldoria.
export const GUARDIAO = {
  zSouth: -180,                    // paredão sul do mapa 2
  entry: { x: 35, z: -206 },       // onde se chega pelo portal
  portalBack: { x: 35, z: -197 },  // portal de volta ao Planalto (mapa 1)
  portalGo: { x: 35, z: -177 },    // portal no topo do Planalto da Fenda (mapa 1) → mapa 2
  arrive: { x: 35, z: -170 },      // chegando de volta ao Planalto
};
// ponto do mapa 1 que agora pertence ao mapa 2 (para monstros, saves antigos, eventos)
export const inGuardiao = (x, z) => z < GUARDIAO.zSouth - 4 && x > PLATEAU_EXT.x0 - 40 && x < PLATEAU_EXT.x1 + 40;
export const MAP_NUM = { world: 1, cripta: 1, guardiao: 2, ermos: 3, confins: 4 };
export const AREA_NAME = { world: 'Vale de Eldoria', cripta: 'Cripta do Vigia', guardiao: 'Planície do Guardião', ermos: 'Ermos da Fenda', confins: 'Confins de Eldoria' };
export const BOSS_SPAWN = { x: 35, z: -392, arena: 21 };
export const PORTAL_FENDA = { x: 35, z: -424 };

// Baús escondidos (recompensas de exploração)
export const CHESTS = [
  { id: 'bau_ponte', x: 8.6, z: 11.2, rot: 0.3, loot: { gold: 30, items: [{ consumable: 'pocao_vida', qty: 3 }] } },
  { id: 'bau_floresta', x: 142, z: 2, rot: -0.8, loot: { gold: 60, items: [{ roll: { rarity: 'raro', ilvl: 5 } }] } },
  { id: 'bau_acampamento', x: -126, z: -60, rot: 0.6, loot: { gold: 50, items: [{ consumable: 'tonico', qty: 2 }, { roll: { rarity: 'incomum', ilvl: 5 } }] } },
  { id: 'bau_ruinas', x: -6, z: -122, rot: 2.6, loot: { gold: 45, items: [{ roll: { rarity: 'raro', ilvl: 7, slot: 'helm' } }, { material: 'po_osso', qty: 3 }] } },
  { id: 'bau_canto', x: 158, z: -128, rot: -2.2, loot: { gold: 90, items: [{ roll: { rarity: 'raro', ilvl: 8 } }] } }, // v0.11: Vale não dá roxo
  { id: 'bau_oeste', x: -150, z: -6, rot: 1.2, loot: { gold: 40, items: [{ roll: { rarity: 'incomum', ilvl: 3 } }] } },
  { id: 'bau_colina', x: -42, z: -30, rot: 0.9, loot: { gold: 25, items: [{ consumable: 'pocao_vida', qty: 1 }, { consumable: 'pergaminho', qty: 1 }] } },
];

// Cadeia de exploração: Lyra -> Mural -> Runas (ordem) -> Cofre na ilha
export const RUNES = {
  order: ['lua', 'estrela', 'sol'],
  stones: {
    lua:     { name: 'Pedra-Runa da Lua',     x: 132,  z: -45.5, glyph: '☾', hint: 'Gravado: "Eu desperto primeiro, quando o sol dorme."' },
    estrela: { name: 'Pedra-Runa da Estrela', x: -72,  z: -78,   glyph: '✦', hint: 'Gravado: "Sigo a lua, antes da aurora."' },
    sol:     { name: 'Pedra-Runa do Sol',     x: -33,  z: -37,   glyph: '☀', hint: 'Gravado: "Eu encerro a noite."' },
  },
  mural: { x: -42, z: -90, rot: 0.35 },
  altar: { x: -26, z: -103 },
  vault: { x: -95, z: 33, loot: { gold: 120, items: [{ named: 'anel_aurora' }] } },
};

// Cripta do Vigia — uma FORTALEZA em ruínas (coordenadas locais, somadas a WORLD.dungeonOffset).
// Portão → pátio aberto → quartel (oeste) e arsenal (leste) → grande salão → catacumbas → trono do Vigia.
// Cada retângulo é chão andável; as paredes saem sozinhas nas bordas que não encostam em outro retângulo.
export const DUNGEON = {
  id: 'cripta',
  name: 'Cripta do Vigia',
  reqLevel: 12,
  wallH: 6.2,
  rects: [
    { id: 'portao',   x0: -10, x1: 10,  z0: -12,  z1: 6,    floor: 'pedra' },
    { id: 'passagem', x0: -4,  x1: 4,   z0: -24,  z1: -12,  floor: 'pedra' },
    { id: 'patio',    x0: -32, x1: 32,  z0: -80,  z1: -24,  floor: 'patio' },
    { id: 'cor_o',    x0: -44, x1: -32, z0: -58,  z1: -48,  floor: 'pedra' },
    { id: 'quartel',  x0: -84, x1: -44, z0: -76,  z1: -30,  floor: 'madeira' },
    { id: 'cor_l',    x0: 32,  x1: 44,  z0: -58,  z1: -48,  floor: 'pedra' },
    { id: 'arsenal',  x0: 44,  x1: 84,  z0: -76,  z1: -30,  floor: 'pedra' },
    { id: 'alcova',   x0: 84,  x1: 92,  z0: -58,  z1: -50,  floor: 'pedra' },
    { id: 'cor_n',    x0: -5,  x1: 5,   z0: -96,  z1: -80,  floor: 'pedra' },
    { id: 'salao',    x0: -26, x1: 26,  z0: -150, z1: -96,  floor: 'salao' },
    { id: 'cor_cat',  x0: -38, x1: -26, z0: -128, z1: -118, floor: 'pedra' },
    { id: 'catacumba',x0: -70, x1: -38, z0: -150, z1: -100, floor: 'cripta' },
    { id: 'cor_trono',x0: -5,  x1: 5,   z0: -168, z1: -150, floor: 'pedra' },
    { id: 'trono',    x0: -30, x1: 30,  z0: -220, z1: -168, floor: 'salao' },
  ],
  pillars: [
    // pátio: colunata ao redor
    [-24, -32], [24, -32], [-24, -42], [24, -42], [-24, -64], [24, -64], [-24, -74], [24, -74],
    // grande salão: duas fileiras
    [-14, -104], [14, -104], [-14, -116], [14, -116], [-14, -128], [14, -128], [-14, -140], [14, -140],
    // catacumbas
    [-54, -112], [-54, -138],
    // trono
    [-20, -176], [20, -176], [-20, -192], [20, -192], [-20, -208], [20, -208],
  ],
  // decoração com colisão: [tipo, x, z, giro]
  props: [
    ['estatua', 0, -52, 0], ['poco', -12, -66, 0],
    ['beliche', -80, -36, 0], ['beliche', -80, -46, 0], ['beliche', -80, -60, 0], ['beliche', -80, -70, 0],
    ['beliche', -48, -36, 0], ['beliche', -48, -70, 0], ['mesa', -64, -53, 1.57],
    ['estante', 80, -36, 0], ['estante', 80, -46, 0], ['estante', 80, -60, 0], ['estante', 80, -70, 0],
    ['bigorna', 58, -40, 0], ['forja', 70, -72, 0],
    ['sarcofago', -66, -106, 0], ['sarcofago', -66, -118, 0], ['sarcofago', -66, -132, 0], ['sarcofago', -66, -144, 0],
    ['sarcofago', -42, -106, 0], ['sarcofago', -42, -144, 0],
    ['caixas', -28, -28, 0], ['caixas', 28, -76, 0], ['barril', 26, -28, 0], ['barril', -28, -76, 0],
    ['barril', 48, -34, 0], ['caixas', 50, -74, 0], ['barril', -50, -34, 0],
    ['sarcofago', -22, -214, 0], ['sarcofago', 22, -214, 0],
  ],
  carpets: [[0, -123, 6, 52], [0, -194, 8, 50]],
  start: { x: 0, z: 2 },
  exit: { x: 0, z: 4.5 },
  spawners: [
    { id: 'd1', type: 'skeleton', count: 4, x: 0, z: -40, r: 10, lvl: [5, 6] },
    { id: 'd1b', type: 'skeleton', count: 2, x: -16, z: -64, r: 6, lvl: [5, 5] },
    { id: 'd1c', type: 'skeleton', count: 2, x: 16, z: -64, r: 6, lvl: [5, 6] },
    { id: 'd2', type: 'skeleton', count: 4, x: -62, z: -53, r: 10, lvl: [6, 6] },
    { id: 'd2b', type: 'skeleton', count: 3, x: 62, z: -53, r: 9, lvl: [6, 6] },
    { id: 'd2c', type: 'skeleton', count: 2, x: 66, z: -40, r: 4, lvl: [6, 6] },
    { id: 'd4', type: 'skeleton', count: 5, x: 0, z: -123, r: 12, lvl: [6, 7] },
    { id: 'd5', type: 'skeleton', count: 3, x: -54, z: -125, r: 9, lvl: [6, 7] },
    { id: 'd5b', type: 'skeleton', count: 3, x: -54, z: -140, r: 5, lvl: [6, 6] },
    { id: 'd6', type: 'skeleton', count: 2, x: 0, z: -178, r: 5, lvl: [7, 7] },
    { id: 'd3', type: 'vigia', count: 1, x: 0, z: -200, r: 1, lvl: [7, 7], respawnSec: 60 }, // renasce em 1 min (só a 1ª vitória dá recompensa)
  ],
  finalChest: { id: 'bau_vigia', x: 0, z: -214, loot: { gold: 120, items: [{ quest: 'chave_selo' }, { named: 'elmo_vigia' }, { roll: { rarity: 'raro', ilvl: 7 } }] } },
  alcoveChest: { id: 'bau_alcova', x: 89, z: -54, loot: { gold: 40, items: [{ roll: { rarity: 'raro', ilvl: 6 } }, { consumable: 'tonico', qty: 2 }] } },
};

// Locais possíveis do evento mundial (local) "Ruptura"
export const EVENT_SITES = [
  { id: 'prado', name: 'Prado das Gosmas', x: 20, z: -6, minLevel: 2 },
  { id: 'estrada', name: 'Estrada Oeste', x: -42, z: -20, minLevel: 3 },
  { id: 'floresta', name: 'Borda da Floresta', x: 58, z: -30, minLevel: 4 },
];


// ---------- Ermos da Fenda: segundo mapa, depois do portal do Planalto (sem cidades, monstros fortes) ----------
// Coordenadas locais (−320..320) somadas a ERMOS.offset. Norte = −z.
export const ERMOS = {
  offset: { x: 1500, z: 0 },
  size: 960, grid: 240, half: 480, playable: 456,
  waterLevel: -1.2, deep: -1.9,
  entry: { x: 0, z: 420 },            // onde se chega pelo portal (sul do mapa)
  reqLevel: 22,
  // 8 regiões; a família dos Ermos: bichos de casca, a gárgula, o jabuti e a corte do Trono Partido
  locations: {
    acampamento: { name: 'Acampamento dos Exilados', x: 0, z: 415, r: 24, levels: 'Ponto de retorno', safe: true },
    cinzas:      { name: 'Campos de Cinza',            x: -175, z: 285, r: 100, levels: '25–30' },
    bosque:      { name: 'Bosque dos Galhos Mortos',   x: 185, z: 265, r: 105, levels: '33' },
    charneca:    { name: 'Charneca dos Uivos Eternos', x: -335, z: 80, r: 105, levels: '38–43' },
    lago:        { name: 'Lago Violeta',               x: 0, z: 95, r: 90, levels: '35–46' },
    falesias:    { name: 'Falésias do Vento Cortante', x: 335, z: 60, r: 105, levels: '48' },
    ossario:     { name: 'Ossário dos Reis',           x: -250, z: -130, r: 105, levels: '50–53' },
    cristais:    { name: 'Vale dos Cristais',          x: 245, z: -140, r: 105, levels: '56' },
    trono:       { name: 'Trono Partido',              x: 0, z: -300, r: 115, levels: '58–60' },
  },
  // Monstros espalhados pelo mapa inteiro; cada um tem nível FIXO (como no Rucoy) e o nível sobe
  // conforme você se afasta do acampamento (sul → norte). Muito fortes aparecem em grupos menores.
  // home: região onde ele aparece com mais frequência (tema), mas pode surgir fora dela.
  levelRange: [25, 60], levelDist: 820, cell: 56, activeDist: 150, sleepDist: 230,
  mobs: [
    { type: 'besouro_brasa', lvl: MOB_LEVELS.besouro_brasa, home: 'cinzas' },
    { type: 'aranha_galhos', lvl: MOB_LEVELS.aranha_galhos, home: 'bosque' },
    { type: 'caranguejo_abissal', lvl: MOB_LEVELS.caranguejo_abissal, home: 'lago' },
    { type: 'conjurador_afogado', lvl: MOB_LEVELS.conjurador_afogado, home: 'lago' },
    { type: 'gargula', lvl: MOB_LEVELS.gargula, home: 'falesias' },
    { type: 'gargula', lvl: MOB_LEVELS.gargula, home: 'ossario' },
    { type: 'jabuti', lvl: MOB_LEVELS.jabuti, home: 'cristais' },
    { type: 'cavaleiro_trono', lvl: MOB_LEVELS.cavaleiro_trono, home: 'trono' },
    { type: 'arauto_fenda', lvl: MOB_LEVELS.arauto_fenda, home: 'trono' },
  ],
  chests: [
    { id: 'bau_cinzas', x: -215, z: 340, rot: 0.4, loot: { gold: 160, items: [{ roll: { rarity: 'raro', ilvl: 12 } }, { consumable: 'pocao_vida', qty: 4 }] } },
    { id: 'bau_charneca', x: -400, z: 100, rot: 1.2, loot: { gold: 200, items: [{ roll: { rarity: 'raro', ilvl: 14 } }, { consumable: 'tonico', qty: 3 }] } },
    { id: 'bau_falesias', x: 400, z: 70, rot: -1.4, loot: { gold: 230, items: [{ roll: { rarity: 'epico', ilvl: 15 } }] } },
    { id: 'bau_ossario', x: -290, z: -200, rot: 1.8, loot: { gold: 260, items: [{ roll: { rarity: 'epico', ilvl: 16 } }] } },
    { id: 'bau_cristais', x: 285, z: -215, rot: -0.6, loot: { gold: 300, items: [{ roll: { rarity: 'epico', ilvl: 17 } }, { material: 'fragmento_fenda', qty: 5 }] } },
    { id: 'bau_trono', x: 0, z: -395, rot: 3.1, loot: { gold: 600, items: [{ roll: { rarity: 'epico', ilvl: 19 } }] } }, // v0.11: branco só de farm de verdade
  ],
  // portal para os Confins (nível 62), atrás do Trono Partido
  portal: { x: 60, z: -400 },
};

// ---------- Confins de Eldoria: terceiro mapa, ~30x maior que os Ermos, carregado em blocos ----------
// Coordenadas locais (−1860..1860) somadas a CONFINS.offset. Norte = −z. Biomes em volta do centro.
export const CONFINS = {
  offset: { x: 6000, z: 0 },
  size: 3720, half: 1860, playable: 1835,
  chunk: 120, res: 30,                 // bloco de 120 m com vértices a cada 4 m
  loadDist: 250, unloadDist: 380,
  waterLevel: -1.2, deep: -1.9,
  entry: { x: 0, z: 1760 },
  reqLevel: 62,
  cell: 72, activeDist: 170, sleepDist: 270, // grupos de monstros criados conforme os jogadores chegam perto
  levelRange: [65, 165], levelDist: 3300,
  mobs: [
    { type: 'javali', lvl: MOB_LEVELS.javali, home: 'planicie' },
    { type: 'javali_dourado', lvl: MOB_LEVELS.javali_dourado, home: 'planicie' },
    { type: 'minotauro', lvl: MOB_LEVELS.minotauro, home: 'planicie' },
    { type: 'sapo', lvl: MOB_LEVELS.sapo, home: 'pantano' },
    { type: 'homem_lagarto', lvl: MOB_LEVELS.homem_lagarto, home: 'pantano' },
    { type: 'basilisco', lvl: MOB_LEVELS.basilisco, home: 'deserto' },
    { type: 'escorpiao_ambar', lvl: MOB_LEVELS.escorpiao_ambar, home: 'deserto' },
    { type: 'cogumelo', lvl: MOB_LEVELS.cogumelo, home: 'floresta' },
    { type: 'cervo_espinhoso', lvl: MOB_LEVELS.cervo_espinhoso, home: 'floresta' },
    { type: 'lobisomem', lvl: MOB_LEVELS.lobisomem, home: 'floresta' },
    { type: 'morsa', lvl: MOB_LEVELS.morsa, home: 'tundra' },
    { type: 'urso_polar', lvl: MOB_LEVELS.urso_polar, home: 'tundra' },
    { type: 'yeti', lvl: MOB_LEVELS.yeti, home: 'tundra' },
    { type: 'rinoceronte', lvl: MOB_LEVELS.rinoceronte, home: 'vulcao' },
    { type: 'salamandra_magma', lvl: MOB_LEVELS.salamandra_magma, home: 'vulcao' },
    { type: 'cerbero', lvl: MOB_LEVELS.cerbero, home: 'vulcao' },
    { type: 'medusa', lvl: MOB_LEVELS.medusa, home: 'pico' },
    { type: 'cerebro_abissal', lvl: MOB_LEVELS.cerebro_abissal, home: 'pico' },
  ],
  biomes: {
    planicie: { name: 'Planícies Douradas',  cx: 0,     cz: 1250, levels: [65, 76], ground: 0x8aa04a, ground2: 0xc4b25a, rock: 0x8a7e6a, water: 0x3b93bd,
      mobs: ['javali', 'minotauro', 'javali_dourado'], elites: ['javali_rei'], boss: 'campeao_minotauro', elite: 'javali_rei' },
    pantano:  { name: 'Pântano Sombrio',     cx: -1150, cz: 520,  levels: [82, 96], ground: 0x3e5232, ground2: 0x2e3a2a, rock: 0x4a4a3a, water: 0x3a5a3a,
      mobs: ['sapo', 'homem_lagarto'], elites: ['jacare'], boss: 'campeao_lagarto', elite: 'jacare' },
    deserto:  { name: 'Deserto de Âmbar',    cx: 1150,  cz: 520,  levels: [82, 96], ground: 0xd8b26a, ground2: 0xc4924a, rock: 0xa87a4a, water: 0x3aa0a8,
      mobs: ['escorpiao_ambar', 'basilisco'], elites: ['esfinge'], boss: 'campeao_escorpiao', elite: 'esfinge' },
    floresta: { name: 'Floresta Esmeralda',  cx: 0,     cz: 250,  levels: [100, 115], ground: 0x2f6a34, ground2: 0x3e7a3a, rock: 0x5a6a5a, water: 0x2a7a8a,
      mobs: ['lobisomem', 'cogumelo', 'cervo_espinhoso'], elites: ['guardiao_bosque'], boss: 'campeao_lobisomem', elite: 'guardiao_bosque' },
    tundra:   { name: 'Tundra Gélida',       cx: -1000, cz: -900, levels: [120, 138], ground: 0xdce8f0, ground2: 0xaac0d0, rock: 0x7a8a9a, water: 0x9fd0ea,
      mobs: ['yeti', 'morsa', 'urso_polar'], elites: ['tita_gelo'], boss: 'campeao_tita_gelo', elite: 'tita_gelo' },
    vulcao:   { name: 'Terras de Magma',     cx: 1000,  cz: -900, levels: [125, 142], ground: 0x3a3030, ground2: 0x5a3a2a, rock: 0x2a2424, water: 0xff6a20,
      mobs: ['cerbero', 'rinoceronte', 'salamandra_magma'], elites: ['tita_magma'], boss: 'campeao_tita_magma', elite: 'tita_magma' },
    pico:     { name: 'Picos do Fim do Mundo', cx: 0,   cz: -1450, levels: [145, 165], ground: 0x5a5470, ground2: 0x8a84a0, rock: 0x4a4458, water: 0x7a4ac0,
      mobs: ['medusa', 'cerebro_abissal'], elites: ['tita_fenda'], boss: 'campeao_cerebro', elite: 'tita_fenda' },
  },
  camp: { name: 'Posto da Fronteira', r: 26 },
  // ---------- Megaestruturas: castelos, cavernas e templos gigantes (sem teto, corredores largos) ----------
  // x/z locais (como cx/cz dos biomas); r = raio da área plana. A primeira Cripta tinha ~30 m; estas têm 180–250 m.
  structs: [
    { id: 'castelo_dourado', kind: 'castelo', biome: 'planicie', x: 300, z: 1150, r: 110, name: 'Castelo Dourado', sub: 'Fortaleza dos reis das planícies',
      theme: { wall: 0xc9b48a, wall2: 0xb09a70, roof: 0x8a2a22, trim: 0xe8c860, banner: 0xb02a2a, glow: 0xffc860 } },
    { id: 'fortaleza_gelo', kind: 'castelo', biome: 'tundra', x: -980, z: -820, r: 120, name: 'Fortaleza do Inverno Eterno', sub: 'Muralhas de gelo dos titãs',
      theme: { wall: 0xcfe2f0, wall2: 0xa8c4da, roof: 0x5a8ab0, trim: 0x9fe8ff, banner: 0x2a5a9a, glow: 0x9fe8ff, ice: true } },
    { id: 'caverna_magma', kind: 'caverna', biome: 'vulcao', x: 1010, z: -820, r: 125, name: 'Caverna do Coração de Magma', sub: 'Uma cratera-caverna gigante de lava',
      theme: { rock: 0x2a2020, rock2: 0x3a2a24, glow: 0xff6a1a, pool: 0xff5a10, crystal: 0xffa040 } },
    { id: 'caverna_cristal', kind: 'caverna', biome: 'pico', x: 40, z: -1380, r: 125, name: 'Grande Caverna de Cristal', sub: 'Onde a Fenda nasceu',
      theme: { rock: 0x3a3450, rock2: 0x4a4466, glow: 0xc86bff, pool: 0x7a4ac0, crystal: 0x5ef0ff } },
    { id: 'templo_ambar', kind: 'templo', biome: 'deserto', x: 1120, z: 560, r: 120, name: 'Pirâmide de Âmbar', sub: 'Templo dos reis-escorpião',
      theme: { wall: 0xd8b06a, wall2: 0xc0904a, trim: 0xffd36b, glow: 0xffb02a } },
    { id: 'circulo_ancestral', kind: 'circulo', biome: 'floresta', x: 220, z: 230, r: 105, name: 'Círculo dos Anciões', sub: 'Pedras gigantes no coração da floresta',
      theme: { wall: 0x7a8278, wall2: 0x5a6a5a, moss: 0x3a7a3a, glow: 0x7affd0 } },
    { id: 'gruta_brejo', kind: 'caverna', biome: 'pantano', x: -1120, z: 560, r: 110, name: 'Gruta Afundada do Brejo', sub: 'Caverna de raízes e névoa',
      theme: { rock: 0x3a3a2c, rock2: 0x4a4a36, glow: 0x7aff9a, pool: 0x3a5a3a, crystal: 0x9aff5a } },
  ],
};
