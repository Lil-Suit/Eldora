import * as THREE from 'three';
import { fbm, vnoise, smoothstep, lerp, clamp, distToPolyline, dist2 } from './noise.js';
import { WORLD, ROADS, RIVER, LAKE, POND, PLATEAU, HILL, CRYPT_MOUND, LOCATIONS, VILLAGE, RUNES, PLATEAU_EXT, BOSS_SPAWN, FOREST_PATH, GUARDIAO, inVillage, villageEdgeDist, inCamp, campEdgeDist } from '../config/world.js';
import { natalAtivo } from '../config/seasonal.js';
const SNOW = natalAtivo(); // Natal: neve na vila e em volta dela
const SNOW_A = new THREE.Color(0xeef3f8), SNOW_B = new THREE.Color(0xdfe7f0), SNOW_ROAD = new THREE.Color(0xc9ced6);

const FLATS = [
  { x: VILLAGE.center.x, z: VILLAGE.center.z, r: 31, f: 10, h: 1.6 },
  { x: -106, z: -42, r: 38, f: 12, h: 2.3 },
  { x: -114, z: -86, r: 30, f: 12, h: 2.3 }, // acampamento goblin: parte nova (norte)
  { x: -116, z: -122, r: 22, f: 10, h: 2.3 },
  { x: -26, z: -102, r: 34, f: 11, h: 2.8 },
  { x: -72, z: -78, r: 8, f: 6, h: 2.6 },
  { x: 148, z: -111, r: 6, f: 5, h: 2.6 },
  { x: 0, z: 100, r: 62, f: 12, h: 1.6 }, // vila nova (cerca grande)
  { x: RUNES.mural.x, z: RUNES.mural.z, r: 5, f: 4, h: 2.8 },
];

// Planície do Guardião (MAPA 2): chão plano na altura do planalto, cercado por paredões de rocha dos 4 lados
export function plateauExtH(x, z) {
  const X = PLATEAU_EXT;
  let h = X.h + fbm(x * 0.05, z * 0.05, 2) * 0.22;
  const d = Math.min(x - X.x0, X.x1 - x, z - X.z0, GUARDIAO.zSouth - z);
  if (d < X.rim) { const k = 1 - Math.max(0, d) / X.rim; h += Math.pow(k, 1.6) * 30 + fbm(x * 0.06, z * 0.06, 3) * 5 * k; }
  return h;
}
export function inPlateauExt(x, z, m = 0) { const X = PLATEAU_EXT; return x > X.x0 + m && x < X.x1 - m && z > X.z0 + m && z < X.z1 + 10; }

function lowFreq(x, z) { return fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 3) * 5.5 + 1.8; }

export function rawHeight(x, z) {
  let h = lowFreq(x, z) + fbm(x * 0.045, z * 0.045, 2) * 1.1;
  // estradas suaves
  const rd = roadDistance(x, z);
  if (rd < 4.5) h = lerp(h, lowFreq(x, z), (1 - smoothstep(1.5, 4.5, rd)) * 0.75);
  // vales suaves: o relevo natural nunca afunda abaixo da água (só rio, lago e poço são escavados)
  if (h < 0.9) h = 0.9 - (0.9 - h) * 0.12;
  // colina e monte da cripta
  h += HILL.amp * Math.exp(-((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (2 * HILL.sigma ** 2));
  h += CRYPT_MOUND.amp * Math.exp(-((x - CRYPT_MOUND.x) ** 2 + (z - CRYPT_MOUND.z) ** 2) / (2 * CRYPT_MOUND.sigma ** 2));
  // áreas planas
  for (const f of FLATS) {
    const d = dist2(x, z, f.x, f.z);
    if (d < f.r + f.f) h = lerp(h, f.h + vnoise(x * 0.2, z * 0.2) * 0.12, 1 - smoothstep(f.r, f.r + f.f, d));
  }
  // planalto com rampa ao sul
  const dp = dist2(x, z, PLATEAU.x, PLATEAU.z);
  const pm = 1 - smoothstep(PLATEAU.r - 1, PLATEAU.r + 1.6, dp);
  if (pm > 0) h = lerp(h, PLATEAU.h + fbm(x * 0.08, z * 0.08, 2) * 0.35, pm);
  const R = PLATEAU.ramp;
  if (z > R.zTop - 4 && z < R.zBottom + 4 && x > R.x0 - 5 && x < R.x1 + 5) {
    const t = clamp((z - R.zTop) / (R.zBottom - R.zTop), 0, 1);
    const target = lerp(PLATEAU.h, h, t * t * (3 - 2 * t));
    const cx = (R.x0 + R.x1) / 2, half = (R.x1 - R.x0) / 2;
    const lat = 1 - smoothstep(half, half + 2.5, Math.abs(x - cx));
    const along = 1 - smoothstep(R.zBottom, R.zBottom + 4, z);
    h = lerp(h, Math.max(h, target), lat * along);
  }
  // rio, lago e poço
  const dr = distToPolyline(x, z, RIVER);
  if (dr < 9) h = lerp(h, -2.4, 1 - smoothstep(2.2, 8.5, dr));
  const dl = dist2(x, z, LAKE.x, LAKE.z);
  if (dl < LAKE.r + 3) h = lerp(h, -2.7, 1 - smoothstep(LAKE.r - 6, LAKE.r + 2, dl));
  if (dl < LAKE.island + 2) h = lerp(h, 0.85 + vnoise(x * 0.5, z * 0.5) * 0.1, 1 - smoothstep(LAKE.island - 2.2, LAKE.island + 1.2, dl));
  const dpo = dist2(x, z, POND.x, POND.z);
  if (dpo < POND.r + 3) h = lerp(h, -1.8, 1 - smoothstep(POND.r - 3, POND.r + 1.5, dpo));
  // montanhas nas bordas (o topo do Planalto fica plano; ao norte dele o mapa 1 termina em montanha —
  // a Planície do Guardião virou o mapa 2, com terreno próprio)
  const flat = 1 - smoothstep(PLATEAU.r - 1, PLATEAU.r + 4, dp);
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 148) {
    const k = (e - 148) / 9;
    h += (Math.pow(k, 1.7) * 4 + fbm(x * 0.05, z * 0.05, 3) * 4 * Math.min(1, k / 3)) * (1 - flat);
  }
  return h;
}

// Terreno do MAPA 2 (Planície do Guardião): retângulo inteiro, com o paredão sul
export class PlainExt {
  constructor() {
    const X = PLATEAU_EXT;
    this.x0 = Math.floor(X.x0 / 2) * 2; this.x1 = Math.ceil(X.x1 / 2) * 2;
    this.z0 = Math.floor(X.z0 / 2) * 2; this.z1 = GUARDIAO.zSouth + 14;
    this.step = 2;
    this.NX = (this.x1 - this.x0) / 2; this.NZ = (this.z1 - this.z0) / 2;
    const VX = this.NX + 1, VZ = this.NZ + 1;
    this.h = new Float32Array(VX * VZ);
    for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
      const x = this.x0 + i * 2, z = this.z0 + j * 2;
      this.h[j * VX + i] = plateauExtH(x, z);
    }
  }
  contains(x, z) { return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1; }
  inBounds(x, z) { return x > this.x0 + 3 && x < this.x1 - 3 && z > this.z0 + 3 && z < this.z1 - 3; }
  heightAt(x, z) {
    const VX = this.NX + 1;
    let gx = (x - this.x0) / 2, gz = (z - this.z0) / 2;
    gx = clamp(gx, 0, this.NX - 0.0001); gz = clamp(gz, 0, this.NZ - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = this.h[j * VX + i], b = this.h[j * VX + i + 1], c = this.h[(j + 1) * VX + i], d = this.h[(j + 1) * VX + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  slopeAt(x, z) { return Math.hypot(this.heightAt(x + 1, z) - this.heightAt(x - 1, z), this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2; }
  // wt (opcional, só no Ultra realismo): pesos de superfície + cor de base sem o caminho de pedra (ver wLerp)
  colorAt(x, z, h, slope, out, wt) {
    const n = vnoise(x * 0.06, z * 0.06) * 0.5 + 0.5, n2 = vnoise(x * 0.21 + 5, z * 0.21 - 3) * 0.5 + 0.5;
    const ash = smoothstep(0.45, 0.8, vnoise(x * 0.015 + 4, z * 0.015 - 6) * 0.5 + 0.5);
    out.copy(n2 > 0.45 ? PAL.corrupt : PAL.corruptB).lerp(PAL.moss, ash * 0.45 * n);
    const ru = smoothstep(0.7, 0.9, vnoise(x * 0.03 - 2, z * 0.03 + 7) * 0.5 + 0.5) * 0.5;
    out.lerp(PAL.ruins, ru);
    if (wt) { wReset(wt, W.ASH, 0.62); wt[W.DIRT] = 0.38; wLerp(wt, W.GRASS, ash * 0.45 * n); wLerp(wt, W.ROCK, ru * 0.7); _A.copy(out); }
    // caminho de pedra do planalto até o trono
    if (Math.abs(x - 35 - Math.sin(z * 0.02) * 6) < 3.2) out.lerp(PAL.ruins, 0.7 * (0.7 + n2 * 0.3));
    // arena do chefe
    const da = dist2(x, z, BOSS_SPAWN.x, BOSS_SPAWN.z);
    if (da < BOSS_SPAWN.arena + 2) { const k = (1 - smoothstep(BOSS_SPAWN.arena - 4, BOSS_SPAWN.arena + 2, da)) * 0.75; out.lerp(PAL.rockDark, k); if (wt) { _A.lerp(PAL.rockDark, k); wLerp(wt, W.ROCK, k * 0.6); } }
    if (slope > 0.7) { const c = n2 > 0.5 ? PAL.rock : PAL.rockDark, k = smoothstep(0.7, 1.3, slope); out.lerp(c, k); if (wt) { _A.lerp(c, k); wLerp(wt, W.ROCK, k); } }
    if (h > 18) { const k = smoothstep(18, 26, h); out.lerp(PAL.rock, k); if (wt) { _A.lerp(PAL.rock, k); wLerp(wt, W.ROCK, k); } }
    if (h > 30) { const k = smoothstep(30, 38, h + n * 4); out.lerp(PAL.snow, k); if (wt) { _A.lerp(PAL.snow, k); wLerp(wt, W.SNOW, k); } }
    if (wt) { _A.multiplyScalar(0.92 + n * 0.12); wt[8] = _A.r; wt[9] = _A.g; wt[10] = _A.b; wt[11] = Math.abs(x - 35 - Math.sin(z * 0.02) * 6) < 9 ? 1 : 0; }
    return out.multiplyScalar(0.92 + n * 0.12);
  }
  buildMesh() {
    const VX = this.NX + 1, VZ = this.NZ + 1;
    const pos = new Float32Array(VX * VZ * 3), col = new Float32Array(VX * VZ * 3), c = new THREE.Color();
    for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
      const k = j * VX + i, x = this.x0 + i * 2, z = this.z0 + j * 2, h = this.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.colorAt(x, z, h, this.slopeAt(x, z), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array(this.NX * this.NZ * 6);
    let p = 0;
    for (let j = 0; j < this.NZ; j++) for (let i = 0; i < this.NX; i++) {
      const a = j * VX + i, b = a + 1, cc = a + VX, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true; m.name = 'planicie-guardiao';
    return m;
  }
}

let roadSegs = null;
function roadDistance(x, z) {
  if (!roadSegs) roadSegs = ROADS;
  let d = Infinity;
  for (const r of roadSegs) { const v = distToPolyline(x, z, r); if (v < d) d = v; }
  return d;
}
export { roadDistance };

// ---------- Ultra realismo: pesos de superfície do chão (só calculados quando o Ultra pede; ver ultra/ground.js) ----------
// 0 grama · 1 terra/cascalho · 2 rocha · 3 areia · 4 neve · 5 lama · 6 cinza/rachado · 7 chão de floresta (folhas/musgo)
// wt[8..10] = cor de base (sem estrada/areia/fundo d'água, que o shader faz por pixel) · wt[11] = estrada perto
export const W = { GRASS: 0, DIRT: 1, ROCK: 2, SAND: 3, SNOW: 4, MUD: 5, ASH: 6, FOREST: 7 };
export function wReset(wt, i, k = 1) { for (let j = 0; j < 12; j++) wt[j] = 0; wt[i] = k; }
// mesma regra do "lerp" de cor: o que já havia encolhe (1-k) e a superfície i ganha k
export function wLerp(wt, i, k) { if (!(k > 0)) return; for (let j = 0; j < 8; j++) wt[j] *= 1 - k; wt[i] += k; }
const _A = new THREE.Color();

const C = (hex) => new THREE.Color(hex);
const PAL = {
  grassA: C(0x6aa84f), grassB: C(0x93c264), grassGold: C(0xb9b65a), forest: C(0x47733a), forestB: C(0x55823f),
  road: C(0xb39466), roadB: C(0x9e8056), plaza: C(0xb7a98c), sand: C(0xd1bd88), under: C(0x6b8a74), deep: C(0x3c6466),
  rock: C(0x8b857b), rockDark: C(0x6f6a64), snow: C(0xeef2f5), corrupt: C(0x5b3f73), corruptB: C(0x7a4a8f),
  camp: C(0x9a7d55), ruins: C(0xa8a294), moss: C(0x7d8f5a),
};

export class Terrain {
  constructor() {
    const N = WORLD.grid, S = WORLD.size;
    this.N = N; this.S = S; this.step = S / N; this.half = S / 2;
    const V = N + 1;
    this.h = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      this.h[j * V + i] = rawHeight(-this.half + i * this.step, -this.half + j * this.step);
    }
  }

  // Altura exata da malha (interpolação por triângulo, igual à renderização)
  heightAt(x, z) {
    const V = this.N + 1;
    let gx = (x + this.half) / this.step, gz = (z + this.half) / this.step;
    gx = clamp(gx, 0, this.N - 0.0001); gz = clamp(gz, 0, this.N - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = this.h[j * V + i], b = this.h[j * V + i + 1], c = this.h[(j + 1) * V + i], d = this.h[(j + 1) * V + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  slopeAt(x, z) {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // wt (opcional, só no Ultra realismo): 8 pesos de superfície (ver W), a cor de base SEM estradas/areia/fundo
  // (o shader do Ultra desenha estrada, margem e fundo do rio por pixel) e se há estrada perto (wt[11]).
  colorAt(x, z, h, slope, out, wt) {
    const n = vnoise(x * 0.06, z * 0.06) * 0.5 + 0.5;
    const n2 = vnoise(x * 0.21 + 5, z * 0.21 - 3) * 0.5 + 0.5;
    out.copy(PAL.grassA).lerp(PAL.grassB, n * 0.8);
    out.lerp(PAL.grassGold, smoothstep(0.62, 0.9, vnoise(x * 0.018 - 8, z * 0.018 + 2) * 0.5 + 0.5) * 0.55);
    if (wt) wReset(wt, W.GRASS, 1);
    // floresta
    const fo = 1 - smoothstep(24, 48, distToPolyline(x, z, FOREST_PATH));
    if (fo > 0) { out.lerp(n2 > 0.5 ? PAL.forest : PAL.forestB, fo * 0.85); if (wt) wLerp(wt, W.FOREST, fo * 0.85); }
    // corrupção do planalto
    let co = 1 - smoothstep(22, 62, dist2(x, z, PLATEAU.x, PLATEAU.z));
    if (z < -176 && x > PLATEAU_EXT.x0 && x < PLATEAU_EXT.x1) co = Math.max(co, smoothstep(-176, -186, z));
    if (co > 0) { out.lerp(n2 > 0.45 ? PAL.corrupt : PAL.corruptB, co * 0.8); if (wt) { wLerp(wt, W.ASH, co * 0.5); wLerp(wt, W.DIRT, co * 0.3); } }
    // acampamento e ruínas
    if (x < -60 && x > -156 && z < 8 && z > -152) { // terra batida dentro da paliçada (contorno do acampamento)
      const ce = inCamp(x, z) ? campEdgeDist(x, z) : -campEdgeDist(x, z);
      if (ce > -3) { const k = smoothstep(-3, 9, ce) * (0.6 + n2 * 0.4); out.lerp(PAL.camp, k); if (wt) wLerp(wt, W.DIRT, k); }
    }
    const dru = dist2(x, z, -26, -102);
    if (dru < 36) { const k = (1 - smoothstep(14, 36, dru)) * 0.85; out.lerp(n2 > 0.35 ? PAL.ruins : PAL.moss, k); if (wt && n2 > 0.35) { wLerp(wt, W.DIRT, k * 0.6); wLerp(wt, W.ROCK, k * 0.3); } }
    // praça da vila
    const dv = dist2(x, z, VILLAGE.center.x, VILLAGE.center.z);
    if (dv < 12) { const k = (1 - smoothstep(7, 12, dv)) * 0.9; out.lerp(PAL.plaza, k); if (wt) wLerp(wt, W.DIRT, k); }
    if (wt) _A.copy(out);
    // estradas
    const rd = roadDistance(x, z);
    if (rd < 3) out.lerp(n2 > 0.5 ? PAL.road : PAL.roadB, (1 - smoothstep(1.3, 2.9, rd)) * 0.95);
    // Natal: neve dentro da muralha e um pouco em volta (as estradas ficam cinza-claro, pisadas)
    if (SNOW && h > -0.3) {
      const sn = inVillage(x, z) ? 1 : 1 - smoothstep(6, 46, villageEdgeDist(x, z) + n2 * 8);
      if (sn > 0) out.lerp(rd < 2.6 ? SNOW_ROAD : n2 > 0.5 ? SNOW_A : SNOW_B, sn * (rd < 2.6 ? 0.8 : 0.96));
      if (wt && sn > 0) { _A.lerp(n2 > 0.5 ? SNOW_A : SNOW_B, sn * 0.96); wLerp(wt, W.SNOW, sn * 0.96); }
    }
    // margens e água
    if (h < 0.5 && !(SNOW && h > -0.3 && villageEdgeDist(x, z) < 30)) out.lerp(PAL.sand, 1 - smoothstep(-0.25, 0.5, h));
    if (h < -0.5) out.lerp(PAL.under, 1 - smoothstep(-1.2, -0.5, h));
    if (h < -1.3) out.lerp(PAL.deep, 1 - smoothstep(-2.4, -1.3, h));
    // encostas e montanhas
    if (slope > 0.75) { const c = n2 > 0.5 ? PAL.rock : PAL.rockDark, k = smoothstep(0.75, 1.4, slope); out.lerp(c, k); if (wt) { _A.lerp(c, k); wLerp(wt, W.ROCK, k); } }
    if (h > 14) { const k = smoothstep(14, 22, h); out.lerp(PAL.rock, k); if (wt) { _A.lerp(PAL.rock, k); wLerp(wt, W.ROCK, k); } }
    if (h > 32) { const k = smoothstep(32, 40, h + n * 4); out.lerp(PAL.snow, k); if (wt) { _A.lerp(PAL.snow, k); wLerp(wt, W.SNOW, k); } }
    if (wt) { wt[8] = _A.r; wt[9] = _A.g; wt[10] = _A.b; wt[11] = rd < 8 ? 1 : 0; }
    return out;
  }

  buildMesh() {
    const N = this.N, V = N + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    const c = new THREE.Color();
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i;
      const x = -this.half + i * this.step, z = -this.half + j * this.step, h = this.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.colorAt(x, z, h, this.slopeAt(x, z), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array(N * N * 6);
    let p = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, cc = a + V, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b;
      idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }
}
