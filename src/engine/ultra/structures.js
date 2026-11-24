import * as THREE from 'three';
import { GEO_LIST } from '../batch.js';
import { structMaterial, K, SHAPE } from './structmat.js';
import { buildExtras, buildMegaExtras } from './structextras.js';
import { glowMaterial, crystalMaterial } from './structglow.js';
import { muralUltraMaterial } from '../muralart.js';
import { SEE } from '../megastruct.js';
import { inVillage, villageEdgeDist, ERMOS, CONFINS, WORLD } from '../../config/world.js';
import { natalAtivo } from '../../config/seasonal.js';

// =============================================================
// Ultra realismo — structures (só no gráfico "Ultra realismo"; nas outras qualidades nada disto existe nem pesa).
// build(world): monta tudo na 1ª vez que o Ultra liga (preguiçoso). toggle(world, on): mostra/esconde.
// update(world, dt, t, night, focus): por quadro, só com o Ultra ligado.
//
// O que faz: troca o material das malhas estáticas de construções (lotes 'estatico*', cripta, Ermos, posto e
// megaestruturas dos Confins) por um material com textura procedural de verdade (structmat.js). Para isso monta,
// só no Ultra, 3 atributos por vértice (coordenada local da peça, medida e tipo) a partir do registro de peças do
// Batch. Junta detalhes sem colisão (vigas, molduras, telhas da cumeeira, pedras na base, hera…) em poucas malhas.
// Desligar o Ultra volta o material original — mesmas malhas, mesmas colisões, mesmo mapa.
// =============================================================
const SNOW = natalAtivo();
const DX = WORLD.dungeonOffset.x;
const ST = { recs: [], extras: [], swaps: [], area: null, on: false, night: { value: 0 }, mega: new Map() };

// ---------- geometrias-fonte: posições/normais sem índice, meia-medida, forma e face de cada vértice ----------
const SRC = new Map();
const _m3 = new THREE.Matrix3();
function srcOf(id) {
  let s = SRC.get(id); if (s) return s;
  const geo = GEO_LIST[id];
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, n = g.attributes.position.count;
  const half = [0, 0, 0], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; half[k] = Math.max(half[k], Math.abs(v)); lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }
  const t = geo.type;
  const shape = geo.userData?.ushape ?? (t === 'BoxGeometry' ? SHAPE.BOX : t === 'CylinderGeometry' ? SHAPE.CYL : t === 'ConeGeometry' ? SHAPE.CONE
    : t === 'SphereGeometry' ? SHAPE.SPHERE : t === 'TorusGeometry' ? SHAPE.TORUS : /hedron/.test(t) ? SHAPE.POLY : SHAPE.GEN);
  const face = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2], ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let f;
    if (shape === SHAPE.CYL || shape === SHAPE.CONE) f = ay > 0.9 ? (y > 0 ? 2 : 3) : 6;
    else if (shape === SHAPE.ROOF) f = ax > 0.9 ? (x > 0 ? 0 : 1) : y < -0.9 ? 3 : 6;
    else if (shape === SHAPE.BOX || shape === SHAPE.GEN) f = ax >= ay && ax >= az ? (x > 0 ? 0 : 1) : ay >= az ? (y > 0 ? 2 : 3) : (z > 0 ? 4 : 5);
    else f = 7;
    face[i] = f;
  }
  // 4 vértices não coplanares (para achar a escala de cada peça) e a inversa das diferenças
  const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const p0 = P(0); let i1 = 1, best = -1;
  for (let i = 1; i < n; i++) { const d = P(i).distanceToSquared(p0); if (d > best) { best = d; i1 = i; } }
  const d1 = P(i1).sub(p0); let i2 = 2; best = -1;
  for (let i = 1; i < n; i++) { const a = P(i).sub(p0).cross(d1).lengthSq(); if (a > best) { best = a; i2 = i; } }
  const d2 = P(i2).sub(p0), cr = d1.clone().cross(d2); let i3 = 3; best = -1;
  for (let i = 1; i < n; i++) { const v = Math.abs(P(i).sub(p0).dot(cr)); if (v > best) { best = v; i3 = i; } }
  const d3 = P(i3).sub(p0);
  const inv = new THREE.Matrix3().set(d1.x, d2.x, d3.x, d1.y, d2.y, d3.y, d1.z, d2.z, d3.z);
  const ok = Math.abs(inv.determinant()) > 1e-6; if (ok) inv.invert();
  s = { pos, n, half, shape, face, idx: [0, i1, i2, i3], inv, ok, cen: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), hb: [0, 1, 2].map((k) => (hi[k] - lo[k]) / 2) };
  SRC.set(id, s);
  return s;
}

// escala (sx, sy, sz) da peça a partir dos vértices no mundo
const _w = new THREE.Matrix3();
function partScale(P, v, s, out) {
  if (!s.ok) { out[0] = out[1] = out[2] = 1; return; }
  const [a, b, c, d] = s.idx, o = (v + a) * 3;
  const e = (i, k) => P[(v + i) * 3 + k] - P[o + k];
  _w.set(e(b, 0), e(c, 0), e(d, 0), e(b, 1), e(c, 1), e(d, 1), e(b, 2), e(c, 2), e(d, 2));
  _m3.multiplyMatrices(_w, s.inv);
  const m = _m3.elements; // coluna-maior
  out[0] = Math.hypot(m[0], m[1], m[2]); out[1] = Math.hypot(m[3], m[4], m[5]); out[2] = Math.hypot(m[6], m[7], m[8]);
}

// peças de uma malha de lote no mundo: centro, eixos (com escala), meia-medida, cor, forma e tipo (para os extras)
function partsOf(mesh, over) {
  const ub = mesh.userData.ub, g = mesh.geometry; if (!ub) return [];
  const P = g.attributes.position.array, C = g.attributes.color?.array, n = g.attributes.position.count, out = [];
  let v = 0;
  for (let p = 0; p < ub.ids.length && v < n; p++) {
    const s = srcOf(ub.ids[p]); if (v + s.n > n) break;
    if (s.ok && C) {
      const [a, b, c, d] = s.idx, o = (v + a) * 3;
      const e = (i, k) => P[(v + i) * 3 + k] - P[o + k];
      _w.set(e(b, 0), e(c, 0), e(d, 0), e(b, 1), e(c, 1), e(d, 1), e(b, 2), e(c, 2), e(d, 2));
      _m3.multiplyMatrices(_w, s.inv);
      const m = _m3.elements, sp = s.pos, a3 = a * 3;
      const t = [0, 1, 2].map((k) => P[o + k] - (m[k] * sp[a3] + m[3 + k] * sp[a3 + 1] + m[6 + k] * sp[a3 + 2]));
      const cc = s.cen, ctr = [0, 1, 2].map((k) => t[k] + m[k] * cc[0] + m[3 + k] * cc[1] + m[6 + k] * cc[2]);
      const sc = [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[3], m[4], m[5]), Math.hypot(m[6], m[7], m[8])];
      _c.setRGB(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
      const hex = _c.getHex(), h = [s.hb[0] * sc[0], s.hb[1] * sc[1], s.hb[2] * sc[2]];
      const kind = ub.ks[p] || over?.get(hex) || classify(hex, s.shape, s.half[0] * sc[0], s.half[1] * sc[1], s.half[2] * sc[2]);
      if (sc[0] > 1e-4 && sc[1] > 1e-4) out.push({ shape: s.shape, kind, hex, c: ctr, ax: [m[0], m[1], m[2]], ay: [m[3], m[4], m[5]], az: [m[6], m[7], m[8]], h });
    }
    v += s.n;
  }
  return out;
}

// ---------- tipo de material de cada peça (pela cor do lote; dá para forçar com batch.k) ----------
const TBL = new Map();
const put = (k, list) => { for (const h of list) TBL.set(h, k); };
put(K.STONE, [0x7b766e, 0x9a958c, 0x8f8a82, 0x857f77, 0x99948b, 0x7d786f, 0x6f6a62, 0x5e5a53, 0x8a857c, 0xa7a196, 0xb4aea2, 0x7d776e, 0x9a9488, 0xa39d91,
  0x6e685f, 0xa39f95, 0x857f75, 0xbab4a6, 0x8f897d, 0xa8a090, 0x8a8478, 0x7a756d, 0x55504a, 0x5c5862, 0x77737d, 0x6f6b75, 0x4a4458, 0x5a5468, 0x56506a,
  0x5a5266, 0x8a8298, 0x6a6478, 0x4a3e52, 0x5a4a62, 0x8a8078, 0x6a6458, 0x3a3448, 0x5d5866, 0x544f5d, 0x625c6a, 0x58535f, 0x48444f, 0x6e6878, 0x67616f,
  0x6a6474, 0x5a5464, 0x4f4a58, 0x5c5666, 0x77707f, 0x8a8394, 0x5a4a44, 0x3d3a42, 0x4a4040, 0x8e8a84, 0x6e6a64, 0x7b766e]);
put(K.PAVE, [0x4a4650, 0x3f3b45, 0x534e58, 0x46424c, 0x55524a, 0x4c4a42, 0x5c5850, 0x4f5046, 0x48503f, 0x3c3846, 0x45404f, 0x36323f, 0x4a4454,
  0x3a3940, 0x323138, 0x403e46, 0x2f2e34]);
put(K.WOOD, [0x5a3b24, 0x7a5232, 0x6b4a33, 0x8a6a42, 0x6e4a2c, 0x7a5a3a, 0x4a3426, 0x5e4430, 0x4a3424, 0x6a4c34, 0x4e3a2a, 0x6e5034, 0x84643f, 0x6a4a30,
  0x3a2a1e, 0x5a4232, 0x4e3a2c, 0x634836, 0x553e2f, 0x3d2a1c, 0x5a4030, 0x6a4a2a, 0x8a3a2a, 0x3a2a5a, 0x2a5a3a, 0xeee4d0, 0x7a4b2a, 0x9c3b2e, 0x5a7a2a,
  0x6b3a22, 0x5a3d24, 0x4a3020]);
put(K.WOODV, [0x9a2f24, 0x6e2018]);
put(K.METAL, [0x2f2b28, 0x3a3a3a, 0x3d3a38, 0x4d4a48, 0x4a4a52, 0x6a6a74, 0x9aa3ad, 0x2a2a2a, 0x4a4038, 0x3a3430, 0x3a3a40, 0x9aa0a8, 0x3a3030, 0x2a2424, 0xdedad0]);
put(K.GOLD, [0xd9b25f, 0xffd36b]);
put(K.CLOTH, [0xb8402f, 0xf2e6c8, 0x5a3a8a, 0x3a8a5a, 0x2c3a5a, 0x3d6aa0, 0x2c2f6b, 0x5ef0ff, 0x8a5a3a, 0x6b4f35, 0x2a1f18, 0x6a1e24, 0xc89a3a, 0x7a1e2a,
  0xd8b04a, 0x8a7a64, 0xe8e0cc, 0x6a4a3a, 0x5a4a6a, 0x4a5a3a, 0x6e4524]);
put(K.STRAW, [0xd8c070, 0xe8e2c8, 0xd9b54a, 0xe2c25a, 0xcfa83e, 0xe8d36a, 0xe8d39a, 0x6a4a2a]);
put(K.SOIL, [0x6b4a2e, 0x5a3d25]);
put(K.SNOW, [0xe9eef4, 0xdfe6ee, 0xeef3f8, 0xf4f8fc, 0xeef3f8]);
put(K.LEAF, [0x4f8a32, 0x5a9638, 0x467d2c, 0x4f9a3a, 0x3e7f2e, 0x6aae48, 0x4a8a34, 0xd09a35, 0xf0c95a]);
put(K.BARK, [0x2e2633, 0x4a3826]);
put(K.MOSS, [0x6e8a4a, 0x6d8a4a, 0x5a7a3a]);
put(K.BONE, [0xe8e1cf, 0xd8d0bd]);
put(K.WATER, [0x2a4e66, 0x1a2a3a]);
put(K.PAPER, [0xe6d3a3]);
put(K.VOID, [0x0b0a10, 0x1c1a18, 0x161616]);
put(K.MARBLE, [0xc9c4b8, 0xb8b0a0]);
put(K.PLASTER, [0xe8dcc0, 0xdccfb0, 0xeee2c8, 0xe2d4b6, 0xd8cfbc]);
put(K.GLASS, [0xff4d5e, 0x4fa3ff, 0xff2a3c]);
put(K.CRYSTAL, [0x6a5ac8]);
const _hsl = {};
const _c = new THREE.Color();
function classify(hex, shape, hx, hy, hz) {
  let k = TBL.get(hex);
  const big = Math.max(hx, hy, hz);
  if (k === K.PLASTER && big < 0.45) k = K.BONE; // ossos (mesma cor do reboco)
  if ((k === K.WOOD || k === K.SOIL) && (shape === SHAPE.CYL) && big > 0.9 && hex !== 0x6e4a2c && hex !== 0x6a4a30 && hex !== 0x7a5232) k = K.BARK; // troncos
  if (k === K.WOOD && shape === SHAPE.CONE && hex !== 0x8a6a42) k = K.CLOTH; // barracas
  if (shape === SHAPE.ROOF) return K.ROOF;
  if (shape === SHAPE.CONE && (hex === 0x7a4b2a || TBL.get(hex) === K.SNOW || hex === 0xe2d8cd)) return K.ROOF;
  if (k === K.STONE && shape === SHAPE.POLY) k = K.ROCK;
  if (k !== undefined) return k;
  if (shape === SHAPE.POLY) return K.ROCK;
  _c.setHex(hex).getHSL(_hsl, THREE.SRGBColorSpace);
  const { h, s, l } = _hsl;
  if (l > 0.84 && s < 0.35) return K.SNOW;
  if (s < 0.14) return K.STONE;
  if (h > 0.04 && h < 0.12 && s > 0.25 && l < 0.45) return K.WOOD;
  if (h > 0.11 && h < 0.17 && l > 0.5) return big > 1.5 ? K.SAND : K.STRAW; // peças grandes claras = arenito
  if (h > 0.2 && h < 0.45) return K.LEAF;
  return big > 1.5 && (shape === SHAPE.BOX || shape === SHAPE.CYL) ? K.STONE : K.GEN;
}

// ---------- monta os atributos do Ultra numa malha de lote ----------
const toH = THREE.DataUtils.toHalfFloat;
const _sc = [1, 1, 1];
function prepare(mesh, ground, snowAt, over) {
  const ub = mesh.userData.ub, g = mesh.geometry;
  if (!ub || g.attributes.aUK) return;
  const P = g.attributes.position.array, C = g.attributes.color?.array, n = g.attributes.position.count;
  // 4 componentes (meia-precisão com 3 componentes não existe nativo em várias placas: o ANGLE converteria na CPU)
  const aUL = new Uint16Array(n * 4), aUH = new Uint16Array(n * 4), aUK = new Uint16Array(n * 4);
  let v = 0;
  for (let p = 0; p < ub.ids.length && v < n; p++) {
    const s = srcOf(ub.ids[p]), cnt = s.n;
    if (v + cnt > n) break;
    partScale(P, v, s, _sc);
    const hx = s.half[0] * _sc[0], hy = s.half[1] * _sc[1], hz = s.half[2] * _sc[2];
    let kind = ub.ks[p];
    if (!kind) { _c.setRGB(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]); const hx6 = _c.getHex(); kind = over?.get(hx6) ?? classify(hx6, s.shape, hx, hy, hz); }
    const seed = (p * 0.6180339887 + 0.13) % 1;
    const base = kind + 32 * s.shape;
    const H = [toH(hx), toH(hy), toH(hz)], hs = toH(seed);
    for (let i = 0; i < cnt; i++) {
      const vi = v + i, o3 = vi * 3, o4 = vi * 4;
      aUL[o4] = toH(s.pos[i * 3] * _sc[0]); aUL[o4 + 1] = toH(s.pos[i * 3 + 1] * _sc[1]); aUL[o4 + 2] = toH(s.pos[i * 3 + 2] * _sc[2]);
      aUH[o4] = H[0]; aUH[o4 + 1] = H[1]; aUH[o4 + 2] = H[2];
      const x = P[o3], y = P[o3 + 1], z = P[o3 + 2];
      aUK[o4] = toH(base + 256 * s.face[i]); aUK[o4 + 1] = hs;
      aUK[o4 + 2] = toH(Math.max(-50, Math.min(500, y - ground(x, z))));
      aUK[o4 + 3] = toH(snowAt ? snowAt(x, z) : 0);
    }
    v += cnt;
  }
  g.setAttribute('aUL', new THREE.Float16BufferAttribute(aUL, 4));
  g.setAttribute('aUH', new THREE.Float16BufferAttribute(aUH, 4));
  g.setAttribute('aUK', new THREE.Float16BufferAttribute(aUK, 4));
}

const snowVale = SNOW ? (x, z) => (inVillage(x, z) ? 1 : Math.max(0, 1 - Math.max(0, Math.min(1, (villageEdgeDist(x, z) - 6) / 40)))) : null;

// registra uma malha: material do Ultra + como achar o chão
function addRec(world, mesh, area, climate, origin, ground, snowAt) {
  if (!mesh || !mesh.userData.ub || ST.recs.some((r) => r.mesh === mesh)) return null;
  const rec = { mesh, area, climate, origin, orig: mesh.material, mat: structMaterial(world, { climate, origin, night: ST.night }), ground, snowAt, ready: false };
  ST.recs.push(rec);
  return rec;
}

function ensure(rec) {
  if (rec.ready) return;
  const t0 = performance.now();
  prepare(rec.mesh, rec.ground, rec.snowAt);
  rec.ready = true;
  ST.prepMs = (ST.prepMs || 0) + performance.now() - t0;
}

// troca simples de material de malhas soltas (baús, golens, mural, brilho, cristais)
function addSwap(mesh, mat) { if (mesh && mat && !ST.swaps.some((s) => s.mesh === mesh)) ST.swaps.push({ mesh, orig: mesh.material, mat }); }

export function build(world) {
  const G = (x, z) => world.groundHeight(x, z, 'world');
  for (const m of world.group.children) if (m.name === 'estatico') addRec(world, m, 'world', 'vale', null, G, snowVale);
  if (world.plainGroup) for (const m of world.plainGroup.children) if (m.name === 'estatico-guardiao') addRec(world, m, 'guardiao', 'guardiao', null, (x, z) => world.groundHeight(x, z, 'guardiao'));
  if (world.ermosGroup) for (const m of world.ermosGroup.children) if (m.name === 'ermos-estrutura' && m.material?.vertexColors && m.material.type === 'MeshLambertMaterial') addRec(world, m, 'ermos', 'ermos', [ERMOS.offset.x, 0, ERMOS.offset.z], (x, z) => world.groundHeight(x, z, 'ermos'));
  for (const m of world.dungeon.children) if (m.name === 'cripta_estatico') addRec(world, m, 'cripta', 'cripta', [DX, 0, 0], () => 0);
  const cg = world.confins?.group;
  if (cg) for (const m of cg.children) if (m.name === 'posto') addRec(world, m, 'confins', 'planicie', [CONFINS.offset.x, 0, CONFINS.offset.z], (x, z) => world.confins.heightAt(x, z));
  // detalhes extras (sem colisão)
  const base = ST.recs.map((r) => ({ mesh: r.mesh, area: r.area, climate: r.climate, origin: r.origin, ground: r.ground, snowAt: r.snowAt }));
  for (const e of buildExtras(world, base, partsOf)) {
    e.mesh.visible = false; e.parent.add(e.mesh); ST.extras.push(e.mesh);
    if (e.mesh.userData.ub) { const r = addRec(world, e.mesh, e.area, e.climate, e.origin, e.ground, e.snowAt); if (r) r.extra = true; }
  }
  // baús (madeira e ferragens)
  for (const id in world.chests) {
    const c = world.chests[id];
    c.group.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material.color.getHex();
      const gold = hex === 0xd9b25f;
      addSwap(o, structMaterial(world, { konst: gold ? K.GOLD : K.WOOD, color: hex, ground: c.y, seed: (c.x * 0.37) % 1, climate: c.area === 'cripta' ? 'cripta' : 'vale' }));
    });
  }
  // Portão dos Golens (pedra)
  world.gate?.mesh?.traverse((o) => {
    if (!o.isMesh || o.material.type !== 'MeshLambertMaterial') return;
    if (o.material.emissive && o.material.emissive.getHex() !== 0) return; // fechadura dourada fica igual
    addSwap(o, structMaterial(world, { konst: K.STONE, color: o.material.color.getHex(), ground: world.groundHeight(35, -129.5), climate: 'guardiao' }));
  });
  // mural das runas: relevo entalhado
  const mural = world.group.children.find((o) => o.name === 'mural-face');
  if (mural) addSwap(mural, muralUltraMaterial(mural.material));
  // janelas (vidro de dia, luz quente à noite) e cristais
  const glowM = glowMaterial(world, ST.night);
  for (const grp of [world.group, world.plainGroup, world.dungeon, world.ermosGroup]) for (const m of grp?.children || []) if (m.material === world.glowMat && m.userData.ub) { addSwap(m, glowM); ST.glowMeshes = (ST.glowMeshes || []).concat(m); }
  const crM = crystalMaterial(world);
  for (const grp of [world.group, world.plainGroup, world.ermosGroup]) for (const m of grp?.children || []) if (m.material === world.crystalMat) addSwap(m, crM);
}

function areaOf(rec) { return rec.area; }

export function toggle(world, on) {
  ST.on = on;
  for (const r of ST.recs) {
    if (on && areaOf(r) === world.area) ensure(r);
    if (r.ready) r.mesh.material = on ? r.mat : r.orig;
  }
  for (const m of ST.extras) m.visible = on && (ST.recs.find((r) => r.mesh === m)?.ready ?? true);
  for (const s of ST.swaps) s.mesh.material = on ? s.mat : s.orig;
  for (const s of ST.glowMeshes || []) prepareGlow(s);
  megaToggle(world, on);
  ST.area = world.area;
}

function prepareGlow(m) {
  if (m.geometry.attributes.aUK) return;
  prepare(m, () => 0, null);
}

// megaestruturas dos Confins: montadas e desmontadas conforme o jogador anda
const BIOME_CLIM = { castelo_dourado: 'planicie', fortaleza_gelo: 'tundra', caverna_magma: 'vulcao', caverna_cristal: 'pico', templo_ambar: 'deserto', circulo_ancestral: 'floresta', gruta_brejo: 'pantano' };
function megaToggle(world, on) {
  const M = world.confins?.mega; if (!M) return;
  for (const [id, B] of M.built) {
    let rec = ST.mega.get(B.group);
    if (!rec && on) {
      const S = M.list.find((s) => s.id === id); if (!S) continue;
      rec = { items: [] };
      const T = S.theme || {}, over = new Map(), wk = T.ice ? K.ICE : (id === 'castelo_dourado' || id === 'templo_ambar') ? K.SAND : K.STONE;
      for (const h of [T.wall, T.wall2]) if (h != null) over.set(h, wk);
      if (T.roof != null) over.set(T.roof, K.ROOF);
      if (T.trim != null) over.set(T.trim, T.ice ? K.ICE : K.GOLD);
      for (const m of B.group.children) {
        if (!m.userData.ub || m.material.type !== 'MeshLambertMaterial') continue;
        const X = S.x + CONFINS.offset.x, Z = S.z + CONFINS.offset.z, base = S.h ?? 0;
        prepare(m, () => base, null, over);
        rec.items.push({ mesh: m, orig: m.material, mat: structMaterial(world, { climate: BIOME_CLIM[id] || 'planicie', origin: [X, 0, Z], see: SEE, night: ST.night }) });
      }
      const ex = buildMegaExtras(world, S, B, (mm) => partsOf(mm, over));
      if (ex) { B.group.add(ex); prepare(ex, () => S.h ?? 0, null); ex.material = structMaterial(world, { climate: BIOME_CLIM[id] || 'planicie', origin: [S.x + CONFINS.offset.x, 0, S.z + CONFINS.offset.z], see: SEE, night: ST.night }); rec.extra = ex; }
      ST.mega.set(B.group, rec);
    }
    if (rec) { for (const it of rec.items) it.mesh.material = on ? it.mat : it.orig; if (rec.extra) rec.extra.visible = on; }
  }
  // esquece as que foram desmontadas
  for (const g of [...ST.mega.keys()]) if (!g.parent) ST.mega.delete(g);
}

export function update(world, dt, t, night, focus) {
  ST.night.value = night;
  if (world.area !== ST.area) { ST.area = world.area; toggle(world, true); }
  if (world.area === 'confins') {
    const M = world.confins?.mega;
    if (M) for (const B of M.built.values()) if (!ST.mega.has(B.group)) { megaToggle(world, true); break; }
  }
  void dt; void t; void focus;
}

// para os testes/medições
export function stats() { return { recs: ST.recs.length, prontas: ST.recs.filter((r) => r.ready).length, extras: ST.extras.length, prepMs: Math.round(ST.prepMs || 0), mega: ST.mega.size }; }
