// =============================================================
// Ultra realismo — ground: SOLO e MATINHOS DO CHÃO (só no gráfico "Ultra realismo"; nas outras qualidades nada
// disto existe nem pesa). build(world): monta na 1ª vez que o Ultra liga (preguiçoso; cada mapa só quando você
// entra nele com o Ultra). toggle(world, on): troca o material do chão e mostra/esconde a cobertura.
// update(world, dt, t, night, focus): por quadro, só com o Ultra ligado.
//
// Solo: material novo por pixel (ground_mat.js) com texturas procedurais (ground_tex.js) e pesos de superfície
// de cada vértice (calculados pelas mesmas funções de cor do terreno — mesma identidade de cada lugar).
// Cobertura: grama com vento, flores, folhagem rasteira, pedrinhas, folhas e gravetos (ground_cover.js).
// Não muda nada do mapa: alturas, colisões, caminhos e interativos ficam iguais (só desenho, sem colisão).
// =============================================================
import * as THREE from 'three';
import { groundTextures } from './ground_tex.js';
import { makeGroundMaterial, setSegments } from './ground_mat.js';
import { GroundCover, smooth } from './ground_cover.js';
import { vnoise } from '../noise.js';
import { confinsRawHeight } from '../confins.js';
import { WORLD, ROADS, VILLAGE, ERMOS, CONFINS } from '../../config/world.js';
import { natalAtivo } from '../../config/seasonal.js';

const SNOW = natalAtivo();
const AREA_IDX = { world: 0, guardiao: 1, ermos: 2, confins: 3 };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const LIN = (list) => list.map(lin);

// ---------- regras da cobertura (o que nasce onde) ----------
// s = pesos amostrados: 0 grama 1 terra 2 rocha 3 areia 4 neve 5 lama 6 cinza 7 floresta, 8..10 cor de base (linear)
function mkRules(cfg) {
  const flowers = LIN(cfg.flowers || []), leaves = LIN(cfg.leaves || [0x7a4a1c, 0x9a6020, 0x6a3a14, 0xa88a30, 0x5a4020]);
  const twig = lin(cfg.twig || 0x3a2a1c), stalk = lin(cfg.stalk || 0xb9a77a);
  const out = { c: [0, 0, 0], s: 1, h: 1, v: 0, dy: 0 };
  const ret = (r, g, b, s, h, v = 0, dy = 0) => { out.c[0] = r; out.c[1] = g; out.c[2] = b; out.s = s; out.h = h; out.v = v; out.dy = dy; return out; };
  return (type, s, roadM, edge, u1, u2, x, z) => {
    const g = s[0], d = s[1], rk = s[2], sa = s[3], sn = s[4], mu = s[5], as = s[6], fo = s[7];
    const br = s[8], bg = s[9], bb = s[10];
    const free = 1 - roadM;
    switch (type) {
      case 'grama': {
        const patch = 0.62 + 0.38 * vnoise(x * 0.11 + 7, z * 0.11 - 3);
        let p = (g + fo * 0.42 + mu * cfg.sedge + as * cfg.ashGrass - rk * 1.7 - sn * 1.5 - sa * 1.7 - d * 1.25) * free * patch;
        if (u1 < p) {
          const tall = mu > 0.35 ? 1.9 : 1, h = cfg.grassH * (0.55 + u2 * 0.9) * tall * (1 - 0.45 * edge) / 0.85;
          // cor: a do chão, mais viva; em cinza/corrupção, morta e acinzentada
          const dead = Math.min(1, as * 1.3 + cfg.dead), l = (br + bg + bb) / 3;
          let r = br * cfg.gMul[0], gg = bg * cfg.gMul[1], b = bb * cfg.gMul[2];
          r += (l * 1.25 - r) * dead; gg += (l * 1.2 - gg) * dead; b += (l * 0.95 - b) * dead;
          if (mu > 0.35) { r *= 0.7; gg *= 0.85; b *= 0.6; }
          return ret(r, gg, b, 0.8 + u2 * 0.35, h, 0, -0.045); // raiz um pouco enterrada
        }
        // talos secos furando a neve / na areia
        const st = (sn > 0.2 ? cfg.snowStalk * (sn < 0.92 ? 1 : 0.35) : 0) + sa * cfg.sandTuft;
        if (u1 < p + st && free > 0.9) return ret(stalk[0] * (0.8 + u2 * 0.4), stalk[1] * (0.8 + u2 * 0.4), stalk[2] * (0.8 + u2 * 0.4), 0.6 + u2 * 0.4, (0.35 + u2 * 0.4) / 0.85);
        return null;
      }
      case 'flores': {
        if (!flowers.length) return null;
        const patch = smooth(0.1, 0.55, vnoise(x * 0.055 + 3, z * 0.055 - 7)) + (cfg.meadow ? cfg.meadow(x, z) : 0);
        const p = (g - sn - sa - rk - d * 0.8) * free * patch * cfg.flowerK;
        if (u1 >= p) return null;
        const f = flowers[Math.floor(u2 * flowers.length * 0.999)];
        return ret(f[0], f[1], f[2], 0.24 + u2 * 0.22, 1);
      }
      case 'folhagem': {
        const p = (g * 0.3 + fo * 0.85 + mu * 0.25 + as * 0.06) * free * (1 - sn) * (1 - sa) * (1 - rk) * cfg.roseK;
        if (u1 >= p) return null;
        const k = 0.72 + u2 * 0.3;
        return ret(br * cfg.rMul[0] * k, bg * cfg.rMul[1] * k, bb * cfg.rMul[2] * k, 0.7 + u2 * 0.8, 1);
      }
      case 'pedrinhas': {
        const p = (d * 0.5 + rk * 0.8 + sa * 0.12 + as * 0.42 + mu * 0.1 + g * 0.035 + fo * 0.05 + sn * 0.04 + edge * 0.6 + roadM * 0.05) * cfg.pebK;
        if (u1 >= p) return null;
        const pc = cfg.pebble, m = 0.62 + u2 * 0.7, sz = (0.025 + u2 * u2 * 0.11) * (1 + rk * 0.8);
        const cr = (br * 0.5 + pc[0] * 0.5) * m, cg = (bg * 0.5 + pc[1] * 0.5) * m, cb = (bb * 0.5 + pc[2] * 0.5) * m;
        return ret(cr, cg, cb, sz, 1, 0, -sz * 0.22);
      }
      case 'folhas': {
        const p = (fo * 1.0 + g * 0.025 + as * cfg.ashTwig) * free * (1 - sn) * cfg.litterK;
        if (u1 >= p) return null;
        if (u2 < cfg.twigK) return ret(twig[0], twig[1], twig[2], 0.6 + u1 * 2.2, 1, 1, 0);
        const lf = leaves[Math.floor(((u2 * 13.7) % 1) * leaves.length * 0.999)], k = 0.75 + ((u2 * 7.3) % 1) * 0.4;
        return ret(lf[0] * k, lf[1] * k, lf[2] * k, 0.7 + u1 * 3.0, 1, 0, 0);
      }
    }
    return null;
  };
}

const VALE = {
  dens: { grama: 10, flores: 0.8, folhagem: 1.4, pedrinhas: 1.2, folhas: 2.2 },
  grassH: 0.32, gMul: [1.0, 1.08, 0.85], dead: 0, sedge: 0.6, ashGrass: 0.35, snowStalk: SNOW ? 0.07 : 0, sandTuft: 0.03,
  flowers: [0xf6f3ea, 0xffd84a, 0xff8fb0, 0x8fb5ff, 0xb48cff, 0xff6a4a, 0xffffff], flowerK: 0.55,
  meadow: (x, z) => 1 - smooth(18, 46, Math.hypot(x - 14, z + 16)), // Prado das Gosmas: campo florido
  roseK: 1, rMul: [0.8, 1.0, 0.7], pebK: 1, pebble: lin(0x8b857b), litterK: 1, twigK: 0.22, ashTwig: 0.05,
};
const GUARD = {
  dens: { grama: 4, flores: 0.3, folhagem: 0.6, pedrinhas: 1.6, folhas: 0.6 },
  grassH: 0.3, gMul: [0.95, 0.95, 1.0], dead: 0.55, sedge: 0.3, ashGrass: 0.18, snowStalk: 0.04, sandTuft: 0,
  flowers: [0xb48cff, 0xd8b8ff], flowerK: 0.12, roseK: 0.4, rMul: [0.7, 0.75, 0.75], pebK: 1, pebble: lin(0x5a5262), litterK: 0.5, twigK: 0.8, ashTwig: 0.08,
  leaves: [0x4a3a3a, 0x5a4a44], twig: 0x2a2228,
};
const ERMOS_P = {
  dens: { grama: 5, flores: 0.3, folhagem: 0.6, pedrinhas: 1.4, folhas: 1.6 },
  grassH: 0.34, gMul: [1.0, 0.98, 0.9], dead: 0.45, sedge: 0.5, ashGrass: 0.3, snowStalk: 0, sandTuft: 0,
  flowers: [0xc8a8ff, 0xe8dcff], flowerK: 0.1, roseK: 0.5, rMul: [0.75, 0.8, 0.75], pebK: 1, pebble: lin(0x4c4458), litterK: 0.8, twigK: 0.6, ashTwig: 0.12,
  leaves: [0x4a3e36, 0x5a4a3a, 0x3a3030], twig: 0x2e2630, stalk: 0x8a8070,
};
// Confins: um jeito por bioma (a célula usa o bioma do centro)
const CONF_B = {
  planicie: { dens: { grama: 7, flores: 0.6, folhagem: 0.8, pedrinhas: 0.8, folhas: 0.4 }, grassH: 0.62, gMul: [1.05, 1.02, 0.8], dead: 0, sedge: 0.5, ashGrass: 0, snowStalk: 0, sandTuft: 0,
    flowers: [0xffd84a, 0xffffff, 0xff9a3a, 0xf6e27a], flowerK: 0.45, roseK: 0.6, rMul: [0.8, 0.95, 0.6], pebK: 0.8, pebble: lin(0x8a7e6a), litterK: 0.4, twigK: 0.4, ashTwig: 0 },
  pantano: { dens: { grama: 6, flores: 0.25, folhagem: 1.4, pedrinhas: 0.6, folhas: 1.6 }, grassH: 0.5, gMul: [0.95, 1.05, 0.8], dead: 0, sedge: 1.1, ashGrass: 0, snowStalk: 0, sandTuft: 0,
    flowers: [0xf2f0e0, 0xd8d070], flowerK: 0.15, roseK: 1, rMul: [0.75, 0.95, 0.65], pebK: 0.6, pebble: lin(0x4a4a3a), litterK: 0.8, twigK: 0.4, ashTwig: 0, leaves: [0x4a3a1c, 0x5a4a24, 0x3a3018] },
  deserto: { dens: { grama: 1.2, flores: 0, folhagem: 0, pedrinhas: 1.4, folhas: 0.3 }, grassH: 0.35, gMul: [1, 1, 1], dead: 0.4, sedge: 0, ashGrass: 0, snowStalk: 0, sandTuft: 0.05,
    flowers: [], flowerK: 0, roseK: 0, rMul: [1, 1, 1], pebK: 1.1, pebble: lin(0xa87a4a), litterK: 0.3, twigK: 1, ashTwig: 0, twig: 0x8a6a4a, stalk: 0xc8a870 },
  floresta: { dens: { grama: 5, flores: 0.4, folhagem: 2.2, pedrinhas: 0.8, folhas: 3 }, grassH: 0.36, gMul: [0.95, 1.1, 0.8], dead: 0, sedge: 0.6, ashGrass: 0, snowStalk: 0, sandTuft: 0,
    flowers: [0xffffff, 0x9fc8ff, 0xd8b0ff], flowerK: 0.2, roseK: 1, rMul: [0.75, 1.0, 0.65], pebK: 0.8, pebble: lin(0x5a6a5a), litterK: 1, twigK: 0.25, ashTwig: 0 },
  tundra: { dens: { grama: 1.5, flores: 0, folhagem: 0, pedrinhas: 0.9, folhas: 0 }, grassH: 0.3, gMul: [1, 1, 1], dead: 0.3, sedge: 0, ashGrass: 0, snowStalk: 0.12, sandTuft: 0,
    flowers: [], flowerK: 0, roseK: 0, rMul: [1, 1, 1], pebK: 0.9, pebble: lin(0x8a9aaa), litterK: 0, twigK: 1, ashTwig: 0, stalk: 0xa8a090 },
  vulcao: { dens: { grama: 0.6, flores: 0, folhagem: 0, pedrinhas: 1.8, folhas: 0.4 }, grassH: 0.25, gMul: [1, 1, 1], dead: 1, sedge: 0, ashGrass: 0.05, snowStalk: 0, sandTuft: 0,
    flowers: [], flowerK: 0, roseK: 0, rMul: [1, 1, 1], pebK: 1.2, pebble: lin(0x1e1a1a), litterK: 0.6, twigK: 1, ashTwig: 0.15, twig: 0x141010 },
  pico: { dens: { grama: 0.8, flores: 0.1, folhagem: 0.2, pedrinhas: 1.8, folhas: 0 }, grassH: 0.25, gMul: [1, 1, 1], dead: 0.6, sedge: 0, ashGrass: 0, snowStalk: 0.05, sandTuft: 0,
    flowers: [0xc04cff], flowerK: 0.05, roseK: 0.2, rMul: [0.8, 0.8, 0.9], pebK: 1.2, pebble: lin(0x5a5470), litterK: 0, twigK: 1, ashTwig: 0 },
};
for (const P of [VALE, GUARD, ERMOS_P, ...Object.values(CONF_B)]) P.rule = mkRules(P);

// amostra bilinear de uma grade de pesos (12 por vértice)
function gridSample(G, x, z, s) {
  const gx = (x - G.x0) / G.step, gz = (z - G.z0) / G.step;
  if (!(gx >= 0 && gz >= 0 && gx < G.VX - 1 && gz < G.VZ - 1)) return false;
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, w = G.wts;
  const a = (j * G.VX + i) * 12, b = a + 12, c = a + G.VX * 12, d = c + 12;
  const ka = (1 - fx) * (1 - fz), kb = fx * (1 - fz), kc = (1 - fx) * fz, kd = fx * fz;
  for (let k = 0; k < 12; k++) s[k] = w[a + k] * ka + w[b + k] * kb + w[c + k] * kc + w[d + k] * kd;
  return true;
}

function weightAttrs(geo, wts, n) {
  const a0 = new Float32Array(n * 4), a1 = new Float32Array(n * 4), ab = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { a0[i * 4 + k] = wts[i * 12 + k]; a1[i * 4 + k] = wts[i * 12 + 4 + k]; ab[i * 4 + k] = wts[i * 12 + 8 + k]; }
  geo.setAttribute('aW0', new THREE.BufferAttribute(a0, 4));
  geo.setAttribute('aW1', new THREE.BufferAttribute(a1, 4));
  geo.setAttribute('aBase', new THREE.BufferAttribute(ab, 4));
}

const ST = new WeakMap();
const st = (world) => ST.get(world);

// ---------- montagem de cada mapa (preguiçosa) ----------
function prepArea(world, area) {
  const S = st(world);
  if (S.areas[area] !== undefined) return S.areas[area];
  S.areas[area] = null;
  const t0 = performance.now();
  let A = null;
  const wt = new Float32Array(12), col = new THREE.Color();
  if (area === 'world') {
    const T = world.terrain, mesh = world.group.getObjectByName('terrain');
    if (!mesh) return null;
    const V = T.N + 1, wts = new Float32Array(V * V * 12);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, x = -T.half + i * T.step, z = -T.half + j * T.step;
      T.colorAt(x, z, T.h[k], T.slopeAt(x, z), col, wt); wts.set(wt, k * 12);
    }
    weightAttrs(mesh.geometry, wts, V * V);
    const mat = makeGroundMaterial(world, S.tex, { night: S.night, u: {
      uShore: [-0.25, 0.5, 1, 0], uShoreCol: 0xd1bd88, uUnder: [-1.2, -0.5, -2.4, -1.3], uWater: WORLD.waterLevel,
      uRipple: 0.35, uDry: 0.55, uGlowK: 0.8,
    } });
    setSegments(mat, ROADS);
    const segs = []; for (const pl of ROADS) for (let i = 0; i < pl.length - 1; i++) segs.push([pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]]);
    const G = { x0: -T.half, z0: -T.half, step: T.step, VX: V, VZ: V, wts };
    const farms = VILLAGE.farms;
    A = { area, mesh, mat, orig: mesh.material, G, sample: (x, z, s) => gridSample(G, x, z, s), water: WORLD.waterLevel, segs, roadW: [1.3, 2.9],
      params: VALE, inside: (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182,
      blocked: (x, z) => {
        if (world.onBridge(x, z)) return true;
        for (const f of farms) { const c = Math.cos(f.rot), sn = Math.sin(f.rot), dx = x - f.x, dz = z - f.z; if (Math.abs(dx * c - dz * sn) < f.w / 2 + 0.8 && Math.abs(dx * sn + dz * c) < f.d / 2 + 0.8) return true; }
        return false;
      } };
  } else if (area === 'guardiao') {
    const P = world.plain, mesh = world.plainGroup?.getObjectByName('planicie-guardiao');
    if (!mesh) return null;
    const VX = P.NX + 1, VZ = P.NZ + 1, wts = new Float32Array(VX * VZ * 12);
    for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
      const k = j * VX + i, x = P.x0 + i * 2, z = P.z0 + j * 2;
      P.colorAt(x, z, P.h[k], P.slopeAt(x, z), col, wt); wts.set(wt, k * 12);
    }
    weightAttrs(mesh.geometry, wts, VX * VZ);
    const mat = makeGroundMaterial(world, S.tex, { night: S.night, u: { uPath: [1, 35, 6, 0.02], uPathCol: 0xa8a294, uRoadSnow: 0xa8a294, uDry: 0.3, uGlowK: 1.1, uLichen: 0x8a7a9a, uSoil: 0x2a2030, uRockCol: 0x6f6a64 } });
    const G = { x0: P.x0, z0: P.z0, step: 2, VX, VZ, wts };
    A = { area, mesh, mat, orig: mesh.material, G, sample: (x, z, s) => gridSample(G, x, z, s), water: -100, segs: null, roadW: [2.4, 3.4],
      path: (x, z) => Math.abs(x - 35 - Math.sin(z * 0.02) * 6), pathW: 2.6, params: GUARD, inside: (x, z) => P.contains(x, z) };
  } else if (area === 'ermos') {
    const E = world.ermos, mesh = world.ermosGroup?.getObjectByName('ermos-terreno');
    if (!mesh) return null;
    const V = E.N + 1, wts = new Float32Array(V * V * 12), OX = ERMOS.offset.x, OZ = ERMOS.offset.z;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, lx = -E.half + i * E.step, lz = -E.half + j * E.step;
      E.colorLocal(lx, lz, E.h[k], E.slopeLocal(lx, lz), col, wt); wts.set(wt, k * 12);
    }
    weightAttrs(mesh.geometry, wts, V * V);
    const mat = makeGroundMaterial(world, S.tex, { night: S.night, u: {
      uShore: [ERMOS.waterLevel + 0.15, ERMOS.waterLevel + 0.5, 1, 1], uShoreCol: 0x6a5a86, uWater: ERMOS.waterLevel,
      uDry: 0.9, uGlowK: 0.9, uLichen: 0x7a7a6a, uSoil: 0x2a2428, uRockCol: 0x5a5264, uLeafTint: [0.55, 0.5, 0.5],
    } });
    const G = { x0: -E.half + OX, z0: -E.half + OZ, step: E.step, VX: V, VZ: V, wts };
    A = { area, mesh, mat, orig: mesh.material, G, sample: (x, z, s) => gridSample(G, x, z, s), water: ERMOS.waterLevel, segs: null, roadW: [1, 2],
      params: ERMOS_P, inside: (x, z) => Math.abs(x - OX) < E.half - 6 && Math.abs(z - OZ) < E.half - 6 };
  } else if (area === 'confins') {
    const C = world.confins, OX = CONFINS.offset.x, OZ = CONFINS.offset.z, HALF = CONFINS.half, CH = CONFINS.chunk, RES = CONFINS.res, STEP = CH / RES, V = RES + 1;
    const E = CONFINS.entry;
    const mat = makeGroundMaterial(world, S.tex, { night: S.night, nrm: true, u: {
      uShore: [CONFINS.waterLevel + 0.05, CONFINS.waterLevel + 0.3, 0.5, 1], uShoreCol: 0x6a6a5a, uWater: CONFINS.waterLevel,
      uRoad: [3.0, 4.6, 1.0, 0.3], uRoadCol: 0x9a8058, uRoadCol2: 0x8a7050, uRipple: 1, uDry: 0.6, uGlowK: 1.4,
    } });
    const roadPl = [[[E.x + OX, E.z - 140 + OZ], [E.x + OX, HALF + OZ]]];
    setSegments(mat, roadPl);
    const grids = new Map();
    const chunkPrep = (c, mesh, wts, x0, z0) => {
      // normais suaves que não "quebram" na emenda dos blocos (usa a altura de fora do bloco nas bordas)
      const g = mesh.geometry, h = c.h, nrm = new Float32Array(V * V * 3);
      const HH = (i, j) => (i >= 0 && j >= 0 && i <= RES && j <= RES ? h[j * V + i] : confinsRawHeight(x0 + i * STEP, z0 + j * STEP));
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const nx = HH(i - 1, j) - HH(i + 1, j), nz = HH(i, j - 1) - HH(i, j + 1), ny = 2 * STEP, l = Math.hypot(nx, ny, nz), k = (j * V + i) * 3;
        nrm[k] = nx / l; nrm[k + 1] = ny / l; nrm[k + 2] = nz / l;
      }
      g.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 3));
      weightAttrs(g, wts, V * V);
      grids.set(c.i + ',' + c.j, { x0: x0 + OX, z0: z0 + OZ, step: STEP, VX: V, VZ: V, wts });
      if (S.on) mesh.material = mat;
    };
    C.ultraHook = {
      chunk: chunkPrep,
      unload: (c) => grids.delete(c.i + ',' + c.j),
    };
    // blocos já carregados: calcula os pesos agora
    for (const c of C.chunks.values()) {
      const mesh = c.objs.find((o) => o.name === 'confins-chao'); if (!mesh) continue;
      const x0 = -HALF + c.i * CH, z0 = -HALF + c.j * CH, wts = new Float32Array(V * V * 12), tmp = new THREE.Color();
      const H = (ii, jj) => c.h[Math.min(RES, Math.max(0, jj)) * V + Math.min(RES, Math.max(0, ii))];
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const k = j * V + i, slope = Math.hypot(H(i + 1, j) - H(i - 1, j), H(i, j + 1) - H(i, j - 1)) / (2 * STEP);
        C.colorLocal(x0 + i * STEP, z0 + j * STEP, c.h[k], slope, col, tmp, wt); wts.set(wt, k * 12);
      }
      chunkPrep(c, mesh, wts, x0, z0);
    }
    const gridAt = (x, z) => grids.get(Math.floor((x - OX + HALF) / CH) + ',' + Math.floor((z - OZ + HALF) / CH));
    const sample = (x, z, s) => { const G = gridAt(x, z); return G ? gridSample(G, x, z, s) : false; };
    const segs = [[E.x + OX, E.z - 140 + OZ, E.x + OX, HALF + OZ]];
    A = { area, mesh: null, mat, orig: C.mats.ground, sample, water: CONFINS.waterLevel, segs, roadW: [3.0, 4.6],
      inside: (x, z) => Math.abs(x - OX) < CONFINS.playable && Math.abs(z - OZ) < CONFINS.playable,
      ready: (ci, cj) => { const x = ci * 8, z = cj * 8; return !!(gridAt(x, z) && gridAt(x + 7.9, z) && gridAt(x, z + 7.9) && gridAt(x + 7.9, z + 7.9)); },
      cellParams: (x, z) => CONF_B[C.biomeAtWorld(x, z).id] || CONF_B.planicie,
      setOn: (on) => { for (const c of C.chunks.values()) for (const o of c.objs) if (o.name === 'confins-chao' && o.geometry.attributes.aW0) o.material = on ? mat : C.mats.ground; } };
  }
  if (A) { A.idx = AREA_IDX[area]; S.areas[area] = A; S.buildMs[area] = Math.round(performance.now() - t0); if (S.on) setAreaOn(A, true); }
  return A;
}

function setAreaOn(A, on) {
  if (A.setOn) A.setOn(on);
  else if (A.mesh) A.mesh.material = on ? A.mat : A.orig;
}

function areaGroup(world, area) {
  return area === 'world' ? world.group : area === 'guardiao' ? world.plainGroup : area === 'ermos' ? world.ermosGroup : area === 'confins' ? world.confins.group : null;
}

export function build(world) {
  const t0 = performance.now();
  const tex = groundTextures();
  const U = {
    uTime: world.uniforms.uTime, uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uWind: { value: new THREE.Vector4(0.95, 0.31, 0.2, 0) }, uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0.01)) }, uStem: { value: new THREE.Color(0x4a7a2a) }, uCenter: { value: new THREE.Color(0xe8b020) },
  };
  const S = { tex, night: { value: 0 }, areas: {}, buildMs: {}, on: false, U, cover: null, sun: null };
  ST.set(world, S);
  S.cover = new GroundCover(world, U);
  S.sun = world.scene.children.find((o) => o.isDirectionalLight) || null;
  prepArea(world, world.area);
  world.ultraGround = { toggle: (on) => toggle(world, on), stats: () => ({ tex: tex.ms, build: S.buildMs, cover: S.cover.counts(), cells: S.cover.cells.size }) };
  S.buildMs.total = Math.round(performance.now() - t0);
}

// opção "Grama e matinhos do Ultra" (Configurações > Gráficos): desligada, só o chão realista fica
const grassOn = () => globalThis.__RIFT?.settings?.ultraGrass !== false;

export function toggle(world, on) {
  const S = st(world); if (!S) return;
  S.on = !!on;
  for (const k in S.areas) if (S.areas[k]) setAreaOn(S.areas[k], S.on);
  S.gOn = S.on && grassOn();
  S.cover.setVisible(S.gOn);
  if (!S.gOn) S.cover.setParent(null);
  else S.cover.sig = '';
}

const _v = new THREE.Vector3();
export function update(world, dt, t, night, focus) {
  const S = st(world); if (!S || !S.on) return;
  S.night.value = night;
  const area = world.area, A = AREA_IDX[area] !== undefined ? prepArea(world, area) : null;
  const gOn = grassOn();
  if (gOn !== S.gOn) { S.gOn = gOn; S.cover.setVisible(gOn); if (gOn) S.cover.sig = ''; }
  S.cover.setParent(A && gOn ? areaGroup(world, area) : null);
  if (!gOn) return; // sem grama: nada de montar células nem deitar capim
  // sol (para a luz que atravessa a grama) e vento (mais forte com tempo fechado)
  if (S.sun) {
    _v.copy(S.sun.position).sub(S.sun.target.position).normalize();
    S.U.uSunDir.value.copy(_v); // para onde fica o sol (olhar contra o sol = grama acesa por trás)
    S.U.uSunCol.value.copy(S.sun.color).multiplyScalar(S.sun.intensity * 0.35);
  }
  const sky = globalThis.__RIFT?.sky;
  const wk = 0.2 + (sky ? (sky.rainK || 0) * 0.35 + (sky.overK || 0) * 0.15 : 0);
  S.U.uWind.value.z += (wk - S.U.uWind.value.z) * Math.min(1, dt * 0.8);
  // quem deita a grama: o herói (focus) e os monstros mais perto dele
  const PU = S.U.uPush.value, G = globalThis.__RIFT; let np = 0;
  if (focus) PU[np++].set(focus.x, focus.y ?? world.groundHeight(focus.x, focus.z, area), focus.z, 1.1);
  if (G?.enemies) {
    const near = [];
    for (const e of G.enemies) {
      if (e.dead || (e.area || 'world') !== area || !e.pos) continue;
      const d = focus ? Math.hypot(e.pos.x - focus.x, e.pos.z - focus.z) : 0;
      if (d < 40) near.push([d, e]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, e] of near) { if (np >= 8) break; PU[np++].set(e.pos.x, e.pos.y, e.pos.z, 0.9 + (e.def?.radius || e.radius || 0.7) * 1.2); }
  }
  for (let i = np; i < 8; i++) PU[i].set(0, -999, 0, 0.01);
  const cam = S.cover.camera || globalThis.__RIFT?.camera;
  if (A && cam) S.cover.update(A, cam, 3);
  void focus; void t;
}
