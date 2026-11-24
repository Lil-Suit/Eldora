import * as THREE from 'three';
import { fbm, vnoise, smoothstep, clamp, lerp, dist2 } from './noise.js';
import { Batch, GEO, vcLambert, labelSprite } from './batch.js';
import { Rng, mulberry32 } from '../core/rng.js';
import { CONFINS } from '../config/world.js';
import { Megastructs } from './megastruct.js';
import { W, wLerp } from './terrain.js';

// Confins de Eldoria: mapa enorme (3,7 km) gerado por ruído e carregado em blocos perto do jogador.
const OX = CONFINS.offset.x, OZ = CONFINS.offset.z, HALF = CONFINS.half;
const CH = CONFINS.chunk, RES = CONFINS.res, STEP = CH / RES;
const BIOMES = Object.entries(CONFINS.biomes).map(([id, b]) => ({ id, ...b }));
const E = CONFINS.entry;

export function hash2(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// pesos dos biomas (soma 1), com bordas onduladas por ruído
const _w = new Float32Array(BIOMES.length);
export function biomeWeights(lx, lz) {
  const wx = lx + fbm(lx * 0.0016 + 7, lz * 0.0016, 3) * 300;
  const wz = lz + fbm(lx * 0.0016, lz * 0.0016 - 9, 3) * 300;
  let dmin = Infinity;
  const d = BIOMES.map((b) => { const v = Math.hypot(wx - b.cx, wz - b.cz); if (v < dmin) dmin = v; return v; });
  let sum = 0;
  for (let i = 0; i < BIOMES.length; i++) { _w[i] = Math.exp(-(d[i] - dmin) / 55); sum += _w[i]; }
  for (let i = 0; i < BIOMES.length; i++) _w[i] /= sum;
  return _w;
}
export function biomeAt(lx, lz) {
  const w = biomeWeights(lx, lz);
  let bi = 0; for (let i = 1; i < w.length; i++) if (w[i] > w[bi]) bi = i;
  return BIOMES[bi];
}

function biomeHeight(id, lx, lz) {
  switch (id) {
    case 'planicie': return fbm(lx * 0.006, lz * 0.006, 3) * 5 + 1.6;
    case 'pantano': return fbm(lx * 0.012 + 3, lz * 0.012, 3) * 1.8 - 0.8;
    case 'deserto': return Math.sin(lx * 0.035 + fbm(lx * 0.004, lz * 0.004, 2) * 6) * 1.6 + fbm(lx * 0.005, lz * 0.005, 3) * 6 + 2;
    case 'floresta': return fbm(lx * 0.008 + 11, lz * 0.008, 4) * 8 + 2.5;
    case 'tundra': return fbm(lx * 0.007, lz * 0.007 + 5, 4) * 9 + smoothstep(0.75, 0.95, 1 - Math.abs(vnoise(lx * 0.01, lz * 0.01))) * 8 + 2.5;
    case 'vulcao': {
      const c = vnoise(lx * 0.006 + 1, lz * 0.006);
      return fbm(lx * 0.009, lz * 0.009, 4) * 9 + 3 - smoothstep(0.5, 0.7, c) * 10; // crateras de lava
    }
    case 'pico': return fbm(lx * 0.006 + 2, lz * 0.006 + 2, 5) * 20 + 7;
    default: return 0;
  }
}

const STRUCTS = CONFINS.structs || [];
// altura do platô de cada estrutura: média do terreno natural em volta, nunca abaixo da água
function structBase(S) {
  let sum = 0, n = 0;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; sum += naturalHeight(S.x + Math.cos(a) * S.r * 0.6, S.z + Math.sin(a) * S.r * 0.6); n++; }
  return Math.max(CONFINS.waterLevel + 2.2, Math.min(sum / n, 14));
}
function naturalHeight(lx, lz) { const w = biomeWeights(lx, lz); let h = 0; for (let i = 0; i < BIOMES.length; i++) if (w[i] > 0.01) h += w[i] * biomeHeight(BIOMES[i].id, lx, lz); return h; }
export function structAt(lx, lz, pad = 0) { for (const S of STRUCTS) if (dist2(lx, lz, S.x, S.z) < S.r + pad) return S; return null; }

export function confinsRawHeight(lx, lz) {
  const w = biomeWeights(lx, lz);
  let h = 0;
  for (let i = 0; i < BIOMES.length; i++) if (w[i] > 0.01) h += w[i] * biomeHeight(BIOMES[i].id, lx, lz);
  // rios: vales rasos que cruzam o mapa
  const r = Math.abs(fbm(lx * 0.0025 + 40, lz * 0.0025 - 40, 3));
  h = lerp(h, Math.min(h, -1.6), 1 - smoothstep(0.012, 0.03, r));
  // posto de entrada plano
  const camp = 1 - smoothstep(22, 40, dist2(lx, lz, E.x, E.z));
  h = lerp(h, 1, camp);
  // estrada até o posto, para não nascer dentro de um rio
  const road = 1 - smoothstep(4, 9, Math.abs(lx - E.x)) * 1;
  if (lz > E.z - 140) h = lerp(h, Math.max(h, 0.4), road * smoothstep(E.z - 140, E.z - 60, lz));
  // megaestruturas: chão plano (sem rio e sem morro) dentro e uma rampa suave em volta
  for (const S of STRUCTS) {
    const d = dist2(lx, lz, S.x, S.z);
    if (d > S.r + 45) continue;
    if (S.h === undefined) S.h = structBase(S);
    h = lerp(h, S.h, 1 - smoothstep(S.r + 4, S.r + 45, d));
  }
  // bordas: paredões de rocha
  const e = Math.max(Math.abs(lx), Math.abs(lz)) / HALF;
  h += smoothstep(0.975, 1, e) * 40;
  return h;
}

export class Confins {
  constructor() {
    this.chunks = new Map();   // "i,j" -> { h, mesh, col: [...] }
    this.group = null;
    this.queue = [];
    this.mapCanvas = null;
    this.mats = { ground: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), veg: vcLambert(), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    this.waterMats = {};
    this.ultraHook = null; // Ultra realismo: ultra/ground.js põe aqui { chunk(c, malha, pesos, x0, z0), unload(c) }
    this.ultraTrees = null; // Ultra realismo: ultra/trees.js põe aqui { chunk(c), unload(c) }
  }

  key(i, j) { return i + ',' + j; }
  chunkOf(lx, lz) { return [Math.floor((lx + HALF) / CH), Math.floor((lz + HALF) / CH)]; }
  get nChunks() { return Math.ceil(CONFINS.size / CH); }

  // altura (coordenadas do mundo) seguindo os mesmos triângulos da malha
  heightAt(x, z) {
    const lx = x - OX, lz = z - OZ;
    const gx = (lx + HALF) / STEP, gz = (lz + HALF) / STEP;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const ci = Math.floor(i / RES), cj = Math.floor(j / RES);
    const c = this.chunks.get(this.key(ci, cj));
    let a, b, cc, d;
    if (c) {
      const V = RES + 1, ii = i - ci * RES, jj = j - cj * RES;
      a = c.h[jj * V + ii]; b = c.h[jj * V + ii + 1]; cc = c.h[(jj + 1) * V + ii]; d = c.h[(jj + 1) * V + ii + 1];
    } else {
      const x0 = -HALF + i * STEP, z0 = -HALF + j * STEP;
      a = confinsRawHeight(x0, z0); b = confinsRawHeight(x0 + STEP, z0); cc = confinsRawHeight(x0, z0 + STEP); d = confinsRawHeight(x0 + STEP, z0 + STEP);
    }
    if (fx + fz <= 1) return a + (b - a) * fx + (cc - a) * fz;
    return d + (cc - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  inBounds(x, z) { return Math.abs(x - OX) < CONFINS.playable && Math.abs(z - OZ) < CONFINS.playable; }
  biomeAtWorld(x, z) { return biomeAt(x - OX, z - OZ); }

  // wt (opcional, só no Ultra realismo): pesos de superfície por bioma e cor de base sem beira d'água/estrada
  // (o shader do Ultra faz as duas por pixel) — ver W em terrain.js
  colorLocal(lx, lz, h, slope, out, tmp = new THREE.Color(), wt = null) {
    const w = biomeWeights(lx, lz);
    const n = fbm(lx * 0.04, lz * 0.04, 2) * 0.5 + 0.5;
    out.setRGB(0, 0, 0);
    if (wt) for (let j = 0; j < 12; j++) wt[j] = 0;
    for (let i = 0; i < BIOMES.length; i++) {
      if (w[i] < 0.01) continue;
      const B = BIOMES[i];
      tmp.set(B.ground).lerp(_c2.set(B.ground2), n);
      const rk = slope > 1.0 || h > 16 ? 0.75 : 0;
      if (slope > 1.0 || h > 16) tmp.lerp(_c2.set(B.rock), 0.75);
      const sn = B.id === 'pico' && h > 14 ? smoothstep(14, 22, h) : 0;
      if (B.id === 'pico' && h > 14) tmp.lerp(_c2.set(0xeef2ff), smoothstep(14, 22, h));
      out.r += tmp.r * w[i]; out.g += tmp.g * w[i]; out.b += tmp.b * w[i];
      if (wt) {
        const S = BIOME_SURF[B.id] || BIOME_SURF.planicie, k = w[i] * (1 - rk) * (1 - sn);
        for (let j = 0; j < 8; j++) wt[j] += S[j] * k;
        wt[W.ROCK] += w[i] * rk * (1 - sn); wt[W.SNOW] += w[i] * sn;
      }
    }
    if (wt) _A2.copy(out);
    if (h < CONFINS.waterLevel + 0.25) out.lerp(_c2.set(0x6a6a5a), 0.5);
    if (dist2(lx, lz, E.x, E.z) < 30) { out.lerp(_c2.set(0x8a7050), 0.5); if (wt) { _A2.lerp(_c2, 0.5); wLerp(wt, W.DIRT, 0.6); } }
    if (Math.abs(lx - E.x) < 4 && lz > E.z - 140) out.lerp(_c2.set(0x9a8058), 0.6);
    if (wt) { _A2.multiplyScalar(0.92 + n * 0.16); wt[8] = _A2.r; wt[9] = _A2.g; wt[10] = _A2.b; wt[11] = Math.abs(lx - E.x) < 10 && lz > E.z - 150 ? 1 : 0; }
    return out.multiplyScalar(0.92 + n * 0.16);
  }

  attach(world) {
    this.world = world;
    this.group = new THREE.Group(); this.group.name = 'confins'; this.group.visible = false;
    world.scene.add(this.group);
    this.mega = new Megastructs(world);
    // posto da fronteira: fogueira, barracas e portal de volta (sempre presentes)
    const ey = confinsRawHeight(E.x, E.z), b = new Batch(), glow = new Batch(), col = world.col;
    for (const [dx, dz, ry, c] of [[-10, -4, 0.4, 0x7a5a3a], [10, -6, -0.5, 0x5a6a8a], [-8, 9, 2.2, 0x6a5a3a], [11, 8, -2, 0x8a4a3a]]) {
      b.cone(E.x + dx + OX, ey + 1.4, E.z + dz + OZ, 2.4, 2.8, c, 4, ry);
      col.addCircle(E.x + dx + OX, E.z + dz + OZ, 2);
    }
    b.cyl(E.x + OX, ey + 0.2, E.z - 2 + OZ, 1.1, 0.4, 0x4a4040, 8);
    glow.cone(E.x + OX, ey + 0.9, E.z - 2 + OZ, 0.6, 1.4, 0xffa040, 6);
    // estandarte
    b.cyl(E.x + 4 + OX, ey + 3, E.z - 12 + OZ, 0.12, 6, 0x5a4030, 6);
    b.box(E.x + 4.9 + OX, ey + 4.8, E.z - 12 + OZ, 1.6, 2.2, 0.08, 0xd8b25a);
    const pz = E.z + 15;
    b.box(E.x - 4 + OX, ey + 3, pz + OZ, 1, 6, 1, 0x4a4458); b.box(E.x + 4 + OX, ey + 3, pz + OZ, 1, 6, 1, 0x4a4458);
    b.addGeo(GEO.torus, E.x + OX, ey + 5.6, pz + OZ, 8.5, 8.5, 5, 0, 0, 0, 0x5a5468);
    col.addCircle(E.x - 4 + OX, pz + OZ, 0.8); col.addCircle(E.x + 4 + OX, pz + OZ, 0.8);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ color: 0x6bd8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    disc.position.set(E.x + OX, ey + 5.6, pz + OZ);
    this.group.add(disc);
    world.animated.push((t) => { if (!this.group.visible) return; disc.material.opacity = 0.45 + Math.sin(t * 2) * 0.15; });
    world.lightSources.push({ x: E.x + OX, y: ey + 1.4, z: E.z - 2 + OZ, color: 0xffa040, intensity: 2.2, night: 7, dist: 18, flicker: true, area: 'confins', kind: 'fogueira' });
    { const sg = labelSprite('ERMOS DA FENDA', 'Portal de volta', '#e7a6ff'); sg.position.set(E.x + OX, ey + 11, pz + OZ); sg.scale.set(7, 2.2, 1); this.group.add(sg); }
    world.addInteract({ id: 'portal_confins_volta', kind: 'portalErmos', x: E.x + OX, z: pz + OZ - 1.5, r: 3.6, area: 'confins', name: 'Portal para os Ermos' });
    const m1 = b.build(this.mats.veg, { name: 'posto' }); if (m1) this.group.add(m1);
    const m2 = glow.build(this.mats.glow, { castShadow: false, name: 'posto-brilho' }); if (m2) this.group.add(m2);
    return this.group;
  }

  // Carrega blocos perto de (x,z). force: monta tudo já (ao chegar pelo portal).
  update(x, z, force = false) {
    if (!this.group) return;
    const lx = x - OX, lz = z - OZ;
    const [pi, pj] = this.chunkOf(lx, lz);
    const R = Math.ceil(CONFINS.loadDist / CH), N = this.nChunks;
    const want = [];
    for (let j = pj - R; j <= pj + R; j++) for (let i = pi - R; i <= pi + R; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const cx = -HALF + (i + 0.5) * CH, cz = -HALF + (j + 0.5) * CH;
      const d = Math.hypot(cx - lx, cz - lz);
      if (d > CONFINS.loadDist + CH * 0.7) continue;
      if (!this.chunks.has(this.key(i, j))) want.push({ i, j, d });
    }
    want.sort((a, b) => a.d - b.d);
    this.mega?.update(x, z, this.group);
    const budget = force ? want.length : 1;
    for (let k = 0; k < Math.min(budget, want.length); k++) this.buildChunk(want[k].i, want[k].j);
    // descarrega os distantes
    for (const [k, c] of this.chunks) {
      const cx = -HALF + (c.i + 0.5) * CH, cz = -HALF + (c.j + 0.5) * CH;
      if (Math.hypot(cx - lx, cz - lz) > CONFINS.unloadDist) this.unloadChunk(k, c);
    }
  }

  unloadChunk(k, c) {
    for (const o of c.objs) { this.group.remove(o); o.geometry.dispose(); }
    for (const cl of c.cols) this.world.col.remove(cl);
    this.chunks.delete(k);
    this.ultraHook?.unload?.(c);
    this.ultraTrees?.unload?.(c);
  }
  unloadAll() { for (const [k, c] of [...this.chunks]) this.unloadChunk(k, c); this.mega?.unloadAll(); }

  waterMat(B) {
    const um = this.ultraWater?.(B); if (um) return um; // Ultra realismo: água de verdade (ultra/water.js)
    if (!this.waterMats[B.id]) {
      const lava = B.id === 'vulcao';
      this.waterMats[B.id] = lava ? new THREE.MeshBasicMaterial({ color: 0xff5a1a })
        : new THREE.MeshLambertMaterial({ color: B.water, transparent: true, opacity: B.id === 'tundra' ? 0.92 : 0.78 });
    }
    return this.waterMats[B.id];
  }

  buildChunk(ci, cj) {
    const V = RES + 1, x0 = -HALF + ci * CH, z0 = -HALF + cj * CH;
    const h = new Float32Array(V * V);
    let minH = Infinity;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const v = confinsRawHeight(x0 + i * STEP, z0 + j * STEP); h[j * V + i] = v; if (v < minH) minH = v; }
    const c = { i: ci, j: cj, h, objs: [], cols: [] };
    this.chunks.set(this.key(ci, cj), c);
    // malha do chão
    const pos = new Float32Array(V * V * 3), colA = new Float32Array(V * V * 3), col = new THREE.Color(), tmp = new THREE.Color();
    const H = (ii, jj) => h[clamp(jj, 0, RES) * V + clamp(ii, 0, RES)];
    // Ultra realismo (só se já foi ligado alguma vez): pesos de superfície de cada vértice, na mesma passada
    const U = this.ultraHook, wts = U ? new Float32Array(V * V * 12) : null, wt = U ? new Float32Array(12) : null;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, lx = x0 + i * STEP, lz = z0 + j * STEP;
      pos[k * 3] = lx + OX; pos[k * 3 + 1] = h[k]; pos[k * 3 + 2] = lz + OZ;
      const slope = Math.hypot(H(i + 1, j) - H(i - 1, j), H(i, j + 1) - H(i, j - 1)) / (2 * STEP);
      this.colorLocal(lx, lz, h[k], slope, col, tmp, wt);
      colA[k * 3] = col.r; colA[k * 3 + 1] = col.g; colA[k * 3 + 2] = col.b;
      if (wts) wts.set(wt, k * 12);
    }
    const idx = new Uint16Array(RES * RES * 6);
    let p = 0;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const a = j * V + i, b = a + 1, cc = a + V, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const ground = new THREE.Mesh(g, this.mats.ground); ground.receiveShadow = true; ground.name = 'confins-chao';
    this.group.add(ground); c.objs.push(ground);
    if (U) U.chunk(c, ground, wts, x0, z0);
    const mid = biomeAt(x0 + CH / 2, z0 + CH / 2);
    if (minH < CONFINS.waterLevel) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(CH, CH).rotateX(-Math.PI / 2), this.waterMat(mid));
      w.position.set(x0 + CH / 2 + OX, CONFINS.waterLevel, z0 + CH / 2 + OZ); w.renderOrder = 1; w.name = 'confins-agua';
      this.group.add(w); c.objs.push(w);
    }
    // vegetação e rochas (determinístico por bloco)
    const rng = new Rng(mulberry32((ci * 7919 + cj * 104729) >>> 0));
    const veg = new Batch(), glow = new Batch(), W = this.world.col;
    // Ultra realismo: árvores/plantas vão para o fim das malhas (mesmo desenho); o Ultra corta essa parte e põe as detalhadas
    const T = { tv: new Batch(), tg: new Batch(), list: [] };
    const addCol = (cl) => { c.cols.push(cl); };
    const HL = (lx, lz) => this.heightAt(lx + OX, lz + OZ);
    for (let n = 0; n < 150; n++) {
      const lx = x0 + rng.next() * CH, lz = z0 + rng.next() * CH;
      const y = HL(lx, lz);
      if (y < CONFINS.waterLevel + 0.3 || dist2(lx, lz, E.x, E.z) < 34 || (Math.abs(lx - E.x) < 6 && lz > E.z - 150)) { rng.next(); continue; }
      if (Math.abs(lx) > CONFINS.playable - 4 || Math.abs(lz) > CONFINS.playable - 4) continue;
      if (structAt(lx, lz, 8)) continue; // dentro das megaestruturas: só o que a estrutura tem
      const B = biomeAt(lx, lz), r = rng.next(), X = lx + OX, Z = lz + OZ;
      this.prop(B.id, r, rng, veg, glow, X, y, Z, (x, z, rr, o) => addCol(W.addCircle(x, z, rr, o)), T);
    }
    const nv = (b) => { let n = 0; for (const g of b.parts) n += g.attributes.position.count; return n; };
    const v0 = nv(veg), g0 = nv(glow);
    veg.parts.push(...T.tv.parts); glow.parts.push(...T.tg.parts);
    const vm = veg.build(this.mats.veg, { name: 'confins-veg' }); if (vm) { this.group.add(vm); c.objs.push(vm); vm.userData.ultraStart = v0; }
    const gm = glow.build(this.mats.glow, { castShadow: false, name: 'confins-brilho' }); if (gm) { this.group.add(gm); c.objs.push(gm); gm.userData.ultraStart = g0; }
    c.ultraList = new Float32Array(T.list);
    this.ultraTrees?.chunk?.(c);
  }

  // um objeto de cenário típico do bioma
  // T (Ultra realismo): tv/tg = fim das malhas de vegetação/brilho; list = [tipo, x, y, z, s, giro, cor] de cada planta
  prop(id, r, rng, veg0, glow, X, y, Z, col, T) {
    const veg = T.tv, rec = (k, s, ry, c) => T.list.push(k, X, y, Z, s, ry, c);
    const tree = (s, trunk, crown, kind) => {
      veg.cyl(X, y + 1.6 * s, Z, 0.26 * s, 3.2 * s, trunk, 6);
      if (kind === 'pine') { veg.cone(X, y + 3.6 * s, Z, 1.7 * s, 3.4 * s, crown, 6); veg.cone(X, y + 5.4 * s, Z, 1.2 * s, 2.6 * s, crown, 6); rec(12, s, 0, crown); }
      else { const ry = rng.range(0, 6); veg.addGeo(GEO.ico, X, y + 4 * s, Z, 3.4 * s, 2.8 * s, 3.4 * s, 0, ry, 0, crown); rec(id === 'floresta' ? 11 : 10, s, ry, crown); }
      col(X, Z, 0.4 * s, { los: false });
    };
    const rock = (s, c) => { veg0.rock(X, y + s * 0.2, Z, s, c, rng.range(0, 6)); if (s > 1.3) col(X, Z, s * 0.42); };
    switch (id) {
      case 'planicie':
        if (r < 0.12) tree(rng.range(0.9, 1.4), 0x6a4a2a, rng.chance(0.5) ? 0x5a8a2a : 0x7a9a3a, 'oak');
        else if (r < 0.2) rock(rng.range(0.6, 1.8), 0x8a7e6a);
        else if (r < 0.62) { const ry = rng.range(0, 6), c = rng.chance(0.5) ? 0xc4b25a : 0x9ab04a; veg.addGeo(GEO.cone4, X, y + 0.3, Z, 0.35, 0.7, 0.35, 0, ry, 0, c); rec(17, 1, ry, c); }
        else if (r < 0.7) glow.addGeo(GEO.sphere, X, y + 0.3, Z, 0.22, 0.22, 0.22, 0, 0, 0, rng.pick([0xffe066, 0xff8ab0, 0xffffff]));
        break;
      case 'pantano':
        if (r < 0.16) { const s = rng.range(0.8, 1.3); veg.cyl(X, y + 2 * s, Z, 0.3 * s, 4 * s, 0x3a3428, 6); veg.addGeo(GEO.ico, X, y + 4.2 * s, Z, 2.4 * s, 1.4 * s, 2.4 * s, 0, 0, 0, 0x4a5a2a); col(X, Z, 0.4 * s, { los: false }); rec(13, s, r * 39, 0x4a5a2a); }
        else if (r < 0.55) { for (let k = 0; k < 3; k++) veg.addGeo(GEO.cone4, X + rng.range(-0.5, 0.5), y + 0.6, Z + rng.range(-0.5, 0.5), 0.12, 1.4, 0.12, rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2), 0x6a7a3a); rec(18, 1, r * 57, 0x6a7a3a); }
        else if (r < 0.66) { veg.cyl(X, y + 0.25, Z, 0.08, 0.5, 0xd8d0b0, 6); T.tg.addGeo(GEO.sphere, X, y + 0.5, Z, 0.5, 0.25, 0.5, 0, 0, 0, 0x7aff9a); rec(19, 1, r * 91, 0x7aff9a); }
        else if (r < 0.72) rock(rng.range(0.6, 1.4), 0x4a4a3a);
        break;
      case 'deserto':
        if (r < 0.08) { const s = rng.range(0.8, 1.3); veg.cyl(X, y + 1.4 * s, Z, 0.32 * s, 2.8 * s, 0x5a8a3a, 8); veg.cyl(X + 0.55 * s, y + 1.8 * s, Z, 0.18 * s, 1.1 * s, 0x5a8a3a, 6); veg.cyl(X - 0.5 * s, y + 1.4 * s, Z, 0.16 * s, 0.9 * s, 0x5a8a3a, 6); col(X, Z, 0.4 * s); rec(14, s, 0, 0x5a8a3a); }
        else if (r < 0.2) rock(rng.range(0.8, 2.6), rng.chance(0.5) ? 0xa87a4a : 0xc89a5a);
        else if (r < 0.24) { for (let k = 0; k < 4; k++) veg0.box(X + k * 0.35 - 0.5, y + 0.1, Z, 0.12, 0.12, 0.9, 0xe8e0c8, 0.3); }
        break;
      case 'floresta':
        if (r < 0.45) tree(rng.range(1, 1.8), 0x4a3424, rng.pick([0x2a5a2a, 0x3a6a2a, 0x2a4a2a]), rng.chance(0.6) ? 'pine' : 'oak');
        else if (r < 0.55) rock(rng.range(0.6, 1.6), 0x5a6a5a);
        else if (r < 0.75) { const ry = rng.range(0, 6); veg.addGeo(GEO.ico, X, y + 0.4, Z, 1.1, 0.8, 1.1, 0, ry, 0, 0x3a7a3a); rec(20, 1, ry, 0x3a7a3a); }
        else if (r < 0.8) { T.tg.addGeo(GEO.sphere, X, y + 0.25, Z, 0.4, 0.3, 0.4, 0, 0, 0, 0x7affd0); rec(21, 1, r * 77, 0x7affd0); }
        break;
      case 'tundra':
        if (r < 0.16) { const s = rng.range(0.9, 1.5); veg.cyl(X, y + 1.4 * s, Z, 0.24 * s, 2.8 * s, 0x4a3a30, 6); veg.cone(X, y + 3.4 * s, Z, 1.6 * s, 3.2 * s, 0x3a5a4a, 6); veg.cone(X, y + 4.6 * s, Z, 1.1 * s, 1.8 * s, 0xf0f6ff, 6); col(X, Z, 0.4 * s, { los: false }); rec(15, s, r * 61, 0x3a5a4a); }
        else if (r < 0.28) rock(rng.range(0.8, 2.2), rng.chance(0.5) ? 0x8a9aaa : 0xdce8f0);
        else if (r < 0.34) { const s = rng.range(0.5, 1.2); for (let k = 0; k < 3; k++) glow.addGeo(GEO.octa, X + rng.range(-0.6, 0.6), y + s, Z + rng.range(-0.6, 0.6), s * 0.5, s * 2, s * 0.5, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3), 0x9fe0ff); }
        break;
      case 'vulcao':
        if (r < 0.1) { const s = rng.range(0.8, 1.3); veg.cyl(X, y + 1.6 * s, Z, 0.22 * s, 3.2 * s, 0x1a1414, 6); veg.addGeo(GEO.cyl6, X + 0.5 * s, y + 2.6 * s, Z, 0.14 * s, 1.4 * s, 0.14 * s, 0, 0, 0.8, 0x1a1414); col(X, Z, 0.35 * s, { los: false }); rec(16, s, 0, 0x1a1414); }
        else if (r < 0.3) rock(rng.range(0.8, 2.6), rng.chance(0.6) ? 0x2a2424 : 0x4a3030);
        else if (r < 0.38) { const s = rng.range(0.4, 1); glow.addGeo(GEO.dodeca, X, y + 0.2, Z, s, s * 0.5, s, 0, rng.range(0, 6), 0, 0xff7a2a); }
        break;
      case 'pico':
        if (r < 0.28) rock(rng.range(1, 3), rng.chance(0.5) ? 0x4a4458 : 0x6a6480);
        else if (r < 0.4) { const s = rng.range(0.6, 1.5); for (let k = 0; k < 3; k++) glow.addGeo(GEO.octa, X + rng.range(-0.8, 0.8), y + s * 1.1, Z + rng.range(-0.8, 0.8), s * 0.6, s * 2.4, s * 0.6, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3), rng.chance(0.5) ? 0xc04cff : 0x5ef0ff); if (s > 1) col(X, Z, s * 0.5); }
        break;
      default: break;
    }
  }

  // mapa inteiro em baixa resolução (para o mapa completo); montado na 1ª vez
  fullMap(N = 192) {
    if (this.mapCanvas) return this.mapCanvas;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), col = new THREE.Color(), tmp = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const lx = -HALF + ((i + 0.5) / N) * CONFINS.size, lz = -HALF + ((j + 0.5) / N) * CONFINS.size;
      const h = confinsRawHeight(lx, lz);
      if (h < CONFINS.waterLevel) col.set(biomeAt(lx, lz).water); else this.colorLocal(lx, lz, h, 0, col, tmp);
      col.convertLinearToSRGB();
      const k = (j * N + i) * 4;
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = c;
    return c;
  }
}
const _c2 = new THREE.Color(), _A2 = new THREE.Color();
// Ultra realismo: de que é feito o chão de cada bioma (grama, terra, rocha, areia, neve, lama, cinza, floresta)
const BIOME_SURF = {
  planicie: [1, 0, 0, 0, 0, 0, 0, 0],
  pantano: [0.25, 0, 0, 0, 0, 0.55, 0, 0.2],
  deserto: [0, 0, 0, 1, 0, 0, 0, 0],
  floresta: [0.45, 0, 0, 0, 0, 0, 0, 0.55],
  tundra: [0, 0, 0, 0, 1, 0, 0, 0],
  vulcao: [0, 0, 0, 0, 0, 0, 1, 0],
  pico: [0, 0.5, 0.5, 0, 0, 0, 0, 0],
};
export { BIOMES as CONFINS_BIOMES };
