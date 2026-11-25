// =============================================================
// Ultra realismo — COBERTURA DO CHÃO: tufos de grama com vento, flores, folhagem rasteira, pedrinhas,
// folhas secas e gravetos. Tudo instanciado (1 desenho por tipo), montado em células de 8 m em volta da
// câmera, só as células na tela, mais ralo e menor ao longe (some aos poucos, sem "estourar").
// Nada tem colisão. Nada nasce em cima de estrada (só nas bordas, ralo), dentro d'água, dentro de casa/
// muro/pedra (colisores), em plantação, na ponte ou em cima de baú/NPC.
// =============================================================
import * as THREE from 'three';

const CELL = 8;
const STRIDE = 12; // x y z rot | r g b escala | rank variante alturaMul fase

// ---------------- geometrias ----------------
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function geoFrom(P, N, T, R, PART, idx) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(R, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(PART, 1));
  g.setIndex(idx);
  return g;
}

// tufo: 12 lâminas finas e curvas (3 segmentos + ponta), base escura, inclinadas para fora
function grassGeo() {
  const r = rnd(5), P = [], N = [], T = [], R = [], PART = [], I = [];
  const NB = 12;
  for (let b = 0; b < NB; b++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.2;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const h = 0.5 + r() * 0.5, w = 0.015 + r() * 0.013;
    const face = a + (r() - 0.5) * 1.2, nx = Math.cos(face), nz = Math.sin(face); // normal da lâmina (também para onde ela curva)
    const lean = 0.18 + r() * 0.42, rv = r();
    const wx = -nz, wz = nx;
    const rows = [0, 0.38, 0.72], base = P.length / 3;
    for (const t of rows) {
      const cx = bx + nx * lean * h * t * t, cy = h * t * (1 - 0.18 * t * t), cz = bz + nz * lean * h * t * t;
      const ww = w * Math.pow(1 - t, 0.7);
      for (const s of [-1, 1]) { P.push(cx + wx * ww * s, cy, cz + wz * ww * s); N.push(nx, 0.35, nz); T.push(t); R.push(rv); PART.push(0); }
    }
    const tt = 1; P.push(bx + nx * lean * h, h * (1 - 0.18), bz + nz * lean * h); N.push(nx, 0.35, nz); T.push(tt); R.push(rv); PART.push(0);
    for (let k = 0; k < 2; k++) { const i0 = base + k * 2; I.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); }
    I.push(base + 4, base + 5, base + 6);
  }
  return geoFrom(P, N, T, R, PART, I);
}

// flor: haste fina + 6 pétalas em leque + miolo (aPart 0 haste, 1 pétala, 2 miolo); altura 1 (escala na instância)
function flowerGeo() {
  const P = [], N = [], T = [], R = [], PART = [], I = [];
  const v = (x, y, z, nx, ny, nz, t, part) => { P.push(x, y, z); N.push(nx, ny, nz); T.push(t); R.push(0); PART.push(part); return P.length / 3 - 1; };
  // haste (duas faces em cruz) com leve curva
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const a = v(-0.012 * ax, 0, -0.012 * az, az, 0.2, ax, 0, 0), b = v(0.012 * ax, 0, 0.012 * az, az, 0.2, ax, 0, 0);
    const c = v(-0.008 * ax + 0.03, 0.95, -0.008 * az, az, 0.2, ax, 1, 0), d = v(0.008 * ax + 0.03, 0.95, 0.008 * az, az, 0.2, ax, 1, 0);
    I.push(a, b, c, b, d, c);
  }
  // folhinha na haste
  { const a = v(0.0, 0.32, 0, 0, 1, 0, 0.3, 0), b = v(0.13, 0.42, 0.03, 0, 1, 0, 0.4, 0), c = v(0.09, 0.38, -0.04, 0, 1, 0, 0.4, 0); I.push(a, b, c); }
  // pétalas: leque de 6 em volta do topo, um pouco inclinado
  const cx = 0.03, cy = 0.97, R0 = 0.11, n = 6;
  const ctr = v(cx, cy + 0.01, 0, 0, 1, 0, 1, 1);
  const ring = [];
  for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? R0 * 0.55 : R0; ring.push(v(cx + Math.cos(a) * rr, cy + (k % 2 ? 0.0 : 0.025), Math.sin(a) * rr, 0, 1, 0, 1, 1)); }
  for (let k = 0; k < ring.length; k++) I.push(ctr, ring[(k + 1) % ring.length], ring[k]);
  // miolo
  const top = v(cx, cy + 0.045, 0, 0, 1, 0, 1, 2), mr = [];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; mr.push(v(cx + Math.cos(a) * 0.032, cy + 0.02, Math.sin(a) * 0.032, Math.cos(a), 0.6, Math.sin(a), 1, 2)); }
  for (let k = 0; k < 5; k++) I.push(top, mr[(k + 1) % 5], mr[k]);
  return geoFrom(P, N, T, R, PART, I);
}

// folhagem rasteira: roseta de 6 folhas largas, quase encostadas no chão (trevos, tanchagem, brotos)
function rosetteGeo() {
  const r = rnd(9), P = [], N = [], T = [], R = [], PART = [], I = [];
  const v = (x, y, z, t, rv) => { P.push(x, y, z); N.push(0, 1, 0); T.push(t); R.push(rv); PART.push(0); return P.length / 3 - 1; };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r() * 0.5, L = 0.09 + r() * 0.07, W = 0.035 + r() * 0.02, rv = r();
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const b = v(ca * 0.01, 0.01, sa * 0.01, 0, rv);
    const m1 = v(ca * L * 0.5 + px * W, 0.035 + r() * 0.02, sa * L * 0.5 + pz * W, 0.6, rv);
    const m2 = v(ca * L * 0.5 - px * W, 0.035 + r() * 0.02, sa * L * 0.5 - pz * W, 0.6, rv);
    const tip = v(ca * L, 0.03 + r() * 0.03, sa * L, 1, rv);
    I.push(b, m1, m2, m1, tip, m2);
  }
  return geoFrom(P, N, T, R, PART, I);
}

// pedrinha: icosaedro amassado com normais suaves (parece arredondada)
function pebbleGeo() {
  const g0 = new THREE.IcosahedronGeometry(1, 1), r = rnd(13);
  const pos = g0.attributes.position;
  // amassa de forma coerente (mesmo vértice repetido recebe o mesmo deslocamento)
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`, off = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!off.has(k)) off.set(k, 0.78 + r() * 0.4);
    const s = off.get(k); pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.62, pos.getZ(i) * s);
  }
  const merged = mergeVerts(g0);
  merged.computeVertexNormals();
  const n = merged.attributes.position.count, T = new Float32Array(n), R = new Float32Array(n), PART = new Float32Array(n);
  for (let i = 0; i < n; i++) { T[i] = merged.attributes.position.getY(i) > 0 ? 1 : 0; R[i] = r(); }
  return geoFrom(Array.from(merged.attributes.position.array), Array.from(merged.attributes.normal.array), T, R, PART, Array.from(merged.index.array));
}
function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), P = [], I = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k); if (j === undefined) { j = P.length / 3; map.set(k, j); P.push(p.getX(i), p.getY(i), p.getZ(i)); }
    I.push(j);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setIndex(I); return o;
}

// folha seca (parte 0: losango curvo) e graveto (parte 1: dois planos em cruz) — a instância escolhe uma
function litterGeo() {
  const P = [], N = [], T = [], R = [], PART = [], I = [];
  const v = (x, y, z, nx, ny, nz, t, part) => { P.push(x, y, z); N.push(nx, ny, nz); T.push(t); R.push(0); PART.push(part); return P.length / 3 - 1; };
  { // folha ~10 cm, bordas levantadas (curvada)
    const a = v(-0.06, 0.004, 0, 0, 1, 0, 0, 0), b = v(0.06, 0.012, 0, 0, 1, 0, 1, 0);
    const l1 = v(-0.01, 0.018, 0.026, -0.2, 1, 0.3, 0.5, 0), l2 = v(-0.01, 0.018, -0.026, -0.2, 1, -0.3, 0.5, 0), m = v(-0.005, 0.006, 0, 0, 1, 0, 0.5, 0);
    I.push(a, l1, m, m, l1, b, a, m, l2, m, b, l2);
  }
  { // graveto ~35 cm
    for (const [dy, dz] of [[0.012, 0], [0, 0.012]]) {
      const a = v(-0.18, 0.008 - dy, -dz, 0, 1, 0, 0, 1), b = v(0.18, 0.006 - dy, -dz, 0, 1, 0, 1, 1);
      const c = v(-0.18, 0.008 + dy, dz, 0, 1, 0, 0, 1), d = v(0.18, 0.006 + dy, dz, 0, 1, 0, 1, 1);
      I.push(a, b, c, b, d, c);
    }
    const a = v(0.02, 0.008, 0, 0, 1, 0, 0.5, 1), b = v(0.1, 0.01, 0.07, 0, 1, 0, 1, 1), c = v(0.04, 0.012, 0.0, 0, 1, 0, 0.5, 1); I.push(a, b, c);
  }
  return geoFrom(P, N, T, R, PART, I);
}

// ---------------- material (Lambert + instâncias + vento + luz atravessando a folha) ----------------
function coverMaterial(U, o) {
  const m = new THREE.MeshLambertMaterial({ side: o.double ? THREE.DoubleSide : THREE.FrontSide });
  const defs = {}; for (const d of o.defs || []) defs[d] = '';
  m.defines = defs;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uLod: { value: o.lod }, uNormUp: { value: o.normUp }, uTrans: { value: o.trans || 0 } });
    sh.vertexShader = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute float aT; attribute float aRnd; attribute float aPart;
uniform float uTime; uniform vec3 uCam; uniform vec4 uLod; uniform float uNormUp; uniform vec4 uWind; uniform vec4 uPush[8];
varying vec3 vIC; varying float vT; varying float vRnd; varying float vPart; varying vec3 vWP;
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float ics = cos(iA.w), isn = sin(iA.w);
        vec3 objectNormal = vec3(normal);
        objectNormal.xz = vec2(ics * objectNormal.x + isn * objectNormal.z, -isn * objectNormal.x + ics * objectNormal.z);
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), uNormUp));`)
      .replace('#include <begin_vertex>', `
        float idist = distance(iA.xyz, uCam);
        float ithr = mix(uLod.z, uLod.w, smoothstep(uLod.x, uLod.y, idist));
        float ifade = (1.0 - smoothstep(ithr - 0.1, ithr, iC.x)) * (1.0 - smoothstep(uLod.y * 0.45, uLod.y, idist)); // longe: vão afundando aos poucos (sem borda em círculo)
        float isc = iB.w * ifade * mix(1.0, 1.2, smoothstep(uLod.x, uLod.y, idist));
        #ifdef PARTS
        if (abs(aPart - iC.y) > 0.5) isc = 0.0;
        #endif
        vec3 ip = position * vec3(isc, isc * iC.z, isc);
        ip.xz = vec2(ics * ip.x + isn * ip.z, -isn * ip.x + ics * ip.z);
        #ifdef WIND
        float igust = sin(dot(iA.xz, uWind.xy) * 0.16 - uTime * 1.7) * 0.5 + 0.5;
        igust *= 0.6 + 0.4 * sin(dot(iA.xz, vec2(-uWind.y, uWind.x)) * 0.05 + uTime * 0.4);
        float iflut = sin(uTime * 5.3 + iC.w * 6.28 + aRnd * 3.0) * 0.22 + sin(uTime * 8.1 + iC.w * 11.0) * 0.08;
        vec2 iwv = uWind.xy * (0.25 + igust * 1.0 + iflut) * uWind.z;
        float ibend = aT * aT * isc * iC.z;
        ip.xz += iwv * ibend; ip.y -= dot(iwv, iwv) * ibend * 0.35;
        // herói e monstros por perto deitam a grama (abre espaço e nunca esconde quem está nela)
        for (int i = 0; i < 8; i++) {
          vec4 pp = uPush[i]; vec2 pd = iA.xz - pp.xz; float pl = length(pd);
          float pk = (1.0 - smoothstep(pp.w * 0.45, pp.w, pl)) * step(abs(iA.y - pp.y), 2.5) * aT;
          ip.y *= 1.0 - 0.72 * pk; ip.xz += pd / max(pl, 0.05) * pk * isc * iC.z * 0.75;
        }
        #endif
        vec3 transformed = ip + iA.xyz;
        vIC = iB.rgb; vT = aT; vRnd = aRnd; vPart = aPart; vWP = transformed;`);
    sh.fragmentShader = `uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTrans; uniform vec3 uStem; uniform vec3 uCenter;
varying vec3 vIC; varying float vT; varying float vRnd; varying float vPart; varying vec3 vWP;
` + sh.fragmentShader
      .replace('#include <color_fragment>', `
        vec3 ic = vIC;
        #ifdef GRASS
        ic *= mix(0.74, 1.1, pow(vT, 0.8)); // raiz quase da cor do chão: a grama "sai" do solo em vez de ficar por cima
        ic = mix(ic, ic * vec3(1.22, 1.15, 0.7), smoothstep(0.7, 1.0, vT) * 0.55);
        ic *= 0.8 + 0.4 * vRnd;
        #endif
        #ifdef FLOWER
        if (vPart < 0.5) ic = uStem * (0.55 + 0.6 * vT);
        else if (vPart > 1.5) ic = uCenter;
        #endif
        #ifdef ROSETTE
        ic *= (0.55 + 0.6 * vT) * (0.8 + 0.4 * vRnd);
        #endif
        #ifdef PEBBLE
        ic *= 0.55 + 0.6 * vT * (0.7 + 0.6 * vRnd);
        #endif
        #ifdef PARTS
        ic *= 0.75 + 0.35 * vT;
        #endif
        diffuseColor.rgb = ic;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vWP - cameraPosition);
          float back = pow(max(dot(vd, uSunDir), 0.0), 4.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * back * uTrans * (0.3 + 0.7 * vT);
        }`);
  };
  m.customProgramCacheKey = () => 'ult-chao-cob-' + o.name;
  return m;
}

// ---------------- sistema ----------------
export class GroundCover {
  constructor(world, U) {
    this.world = world; this.U = U;
    this.cells = new Map(); this.sig = ''; this.tick = 0; this.camera = null; this.parent = null;
    this.frustum = new THREE.Frustum(); this.m4 = new THREE.Matrix4();
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const T = (name, geo, cap, lod0, mo) => {
      const lod = coarse ? [lod0[0] * 0.75, lod0[1] * 0.75, lod0[2], lod0[3]] : lod0; // celular: plantinhas até 75% da distância
      const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * STRIDE), STRIDE, 1);
      buf.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0));
      geo.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
      geo.setAttribute('iC', new THREE.InterleavedBufferAttribute(buf, 4, 8));
      geo.instanceCount = 0;
      const mat = coverMaterial(U, { name, lod: new THREE.Vector4(...lod), ...mo });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'ultra-chao-' + name;
      mesh.onBeforeRender = (r, s, cam) => { this.camera = cam; };
      return { name, geo, buf, cap, lod, mesh, n: 0 };
    };
    // lod: (distância onde começa a rarear, distância máxima, densidade perto, densidade longe)
    this.types = [
      T('grama', grassGeo(), 85000, [16, 84, 0.9, 0.3], { defs: ['GRASS', 'WIND'], double: true, normUp: 0.55, trans: 0.55 }),
      T('flores', flowerGeo(), 10000, [14, 62, 1, 0.3], { defs: ['FLOWER', 'WIND'], double: true, normUp: 0.4, trans: 0.4 }),
      T('folhagem', rosetteGeo(), 18000, [10, 44, 1, 0.3], { defs: ['ROSETTE'], double: true, normUp: 0.2, trans: 0.3 }),
      T('pedrinhas', pebbleGeo(), 12000, [8, 36, 1, 0.3], { defs: ['PEBBLE'], double: false, normUp: 0, trans: 0 }),
      T('folhas', litterGeo(), 14000, [6, 30, 1, 0.3], { defs: ['PARTS'], double: true, normUp: 0.3, trans: 0.25 }),
    ];
    this.maxR = Math.max(...this.types.map((t) => t.lod[1]));
    // celular/tablet: metade das plantinhas (mesmo visual de longe, bem menos triângulos)
    this.densMul = coarse ? 0.4 : 1;
    this.meshes = this.types.map((t) => t.mesh);
  }

  setParent(g) {
    if (this.parent === g) return;
    for (const m of this.meshes) { if (m.parent) m.parent.remove(m); if (g) g.add(m); }
    this.parent = g; this.sig = '';
  }
  setVisible(v) { for (const m of this.meshes) m.visible = v; }

  // ---------- geração de uma célula (determinística) ----------
  genCell(A, ci, cj) {
    const W = this.world, x0 = ci * CELL, z0 = cj * CELL;
    const seed = (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ Math.imul(A.idx + 1, 83492791)) >>> 0;
    const r = rnd(seed);
    const cols = W.col.query(x0 - 1, z0 - 1, x0 + CELL + 1, z0 + CELL + 1, []).slice();
    const inter = W.interactables.filter((o) => (o.area || 'world') === A.area && o.x > x0 - 3 && o.x < x0 + CELL + 3 && o.z > z0 - 3 && o.z < z0 + CELL + 3);
    const segs = A.segs ? A.segs.filter((s) => Math.min(s[0], s[2]) < x0 + CELL + 6 && Math.max(s[0], s[2]) > x0 - 6 && Math.min(s[1], s[3]) < z0 + CELL + 6 && Math.max(s[1], s[3]) > z0 - 6) : [];
    const blocked = (x, z, pad) => {
      for (const c of cols) {
        if (c.t === 'c') { if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true; }
        else { const dx = x - c.x, dz = z - c.z, lx = dx * c.cs + dz * c.sn, lz = -dx * c.sn + dz * c.cs; if (Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad) return true; }
      }
      for (const o of inter) if ((x - o.x) ** 2 + (z - o.z) ** 2 < 1.1) return true;
      return A.blocked ? A.blocked(x, z) : false;
    };
    const roadD = (x, z) => {
      let d = 99;
      for (const s of segs) { const abx = s[2] - s[0], abz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * abx + (z - s[1]) * abz) / (abx * abx + abz * abz))); const v = Math.hypot(x - s[0] - abx * t, z - s[1] - abz * t); if (v < d) d = v; }
      if (A.path) d = Math.min(d, Math.max(0, A.path(x, z) - (A.pathW - A.roadW[0])));
      return d;
    };
    const P = A.cellParams ? A.cellParams(x0 + CELL / 2, z0 + CELL / 2) : A.params;
    const s = new Float32Array(12);
    const out = [];
    for (const T of this.types) {
      const dens = P.dens[T.name] || 0, N = Math.round(dens * CELL * CELL), arr = [];
      for (let k = 0; k < N; k++) {
        const x = x0 + r() * CELL, z = z0 + r() * CELL, u1 = r(), u2 = r(), u3 = r(), u4 = r();
        if (!A.sample(x, z, s)) continue;
        const rd = segs.length || A.path ? roadD(x, z) : 99;
        const roadM = 1 - smooth(A.roadW[0], A.roadW[1], rd + (u4 - 0.5) * 0.8);
        const edge = roadM > 0.04 && roadM < 0.75 ? 1 : 0;
        const res = P.rule(T.name, s, roadM, edge, u1, u2, x, z);
        if (!res) continue;
        const y = W.groundHeight(x, z, A.area);
        if (y < A.water + (T.name === 'pedrinhas' ? -0.05 : 0.12)) continue;
        if (blocked(x, z, T.name === 'pedrinhas' ? 0.05 : 0.15)) continue;
        let sc = res.s, hm = res.h || 1;
        if (T.name === 'grama' && this.densMul < 1) { sc *= 1.3; hm /= 1.3; } // celular: tufos mais largos e baixos cobrem o chão sem buracos
        arr.push(x, y + (res.dy || 0), z, u3 * 6.2832, res.c[0], res.c[1], res.c[2], sc, k / N, res.v || 0, hm, u2);
      }
      out.push(new Float32Array(arr));
    }
    return out;
  }

  // ---------- por quadro ----------
  update(A, camera, budgetMs = 3) {
    if (!A || !camera) return;
    camera.updateMatrixWorld();
    const cp = camera.position;
    this.U.uCam.value.copy(cp);
    this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.m4);
    const R = this.maxR, ci0 = Math.floor((cp.x - R) / CELL), ci1 = Math.floor((cp.x + R) / CELL), cj0 = Math.floor((cp.z - R) / CELL), cj1 = Math.floor((cp.z + R) / CELL);
    const vis = [], sph = this._s || (this._s = new THREE.Sphere()), W = this.world;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
      if (!A.inside(cx, cz)) continue;
      const gy = W.groundHeight(cx, cz, A.area);
      const dh = Math.hypot(cx - cp.x, cz - cp.z), dv = cp.y - gy;
      const dn = Math.max(0, Math.hypot(Math.max(0, dh - CELL * 0.71), dv));
      if (dn > R) continue;
      sph.center.set(cx, gy, cz); sph.radius = CELL * 0.75 + 3;
      if (!this.frustum.intersectsSphere(sph)) continue;
      vis.push({ key: A.area + ':' + ci + ',' + cj, ci, cj, dn });
    }
    vis.sort((a, b) => a.dn - b.dn);
    // gera as que faltam (mais perto primeiro), sem passar do orçamento de tempo
    const t0 = performance.now(); let made = 0, missing = false;
    for (const v of vis) {
      let c = this.cells.get(v.key);
      if (!c) {
        if (performance.now() - t0 > budgetMs && made > 0) { missing = true; continue; }
        if (A.ready && !A.ready(v.ci, v.cj)) { missing = true; continue; }
        c = { data: this.genCell(A, v.ci, v.cj), used: 0 }; this.cells.set(v.key, c); made++;
      }
      c.used = this.tick; v.c = c;
    }
    this.tick++;
    // assinatura: células + faixa de densidade de cada uma (só reenche quando muda)
    let sig = A.area;
    for (const v of vis) if (v.c) sig += '|' + v.key + ':' + Math.ceil(v.dn / 4);
    if (sig !== this.sig || made) {
      this.sig = sig;
      for (let ti = 0; ti < this.types.length; ti++) {
        const T = this.types[ti], arr = T.buf.array, [r0, r1, dN, dF] = T.lod;
        let n = 0;
        for (const v of vis) {
          if (!v.c || v.dn > r1) continue;
          const thr = (dN + (dF - dN) * smooth(r0, r1, v.dn)) * this.densMul + 0.02, src = v.c.data[ti];
          const cnt = src.length / STRIDE;
          // instâncias guardadas em ordem de "rank": copia só o começo (as que ficam nessa distância)
          let lo = 0, hi = cnt; while (lo < hi) { const mid = (lo + hi) >> 1; if (src[mid * STRIDE + 8] < thr) lo = mid + 1; else hi = mid; }
          const take = Math.min(lo, T.cap - n);
          if (take <= 0) continue;
          arr.set(src.subarray(0, take * STRIDE), n * STRIDE); n += take;
        }
        T.n = n; T.geo.instanceCount = n;
        T.buf.clearUpdateRanges(); T.buf.addUpdateRange(0, Math.max(1, n) * STRIDE); T.buf.needsUpdate = true;
      }
    }
    if (missing) this.sig = '';
    // limpa células velhas
    if (this.cells.size > 320) {
      const old = [...this.cells.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < old.length - 260; i++) this.cells.delete(old[i][0]);
    }
  }
  counts() { const o = {}; for (const T of this.types) o[T.name] = T.n; return o; }
}

function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
export { smooth, CELL };
