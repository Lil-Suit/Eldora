// =============================================================
// Ultra realismo — geometria procedural das árvores e plantas (feita na hora, sem arquivos).
// Cada "modelo" sai em 2 níveis: perto (casca, raízes, galhos, cachos de folhas) e longe (poucos cartões grandes).
// Vértices: position, normal, uv (atlas de folhas ou casca), aV = (tipo, oclusão, vento, acaso), aS = neve.
// Tipo (aV.x): 0 folha da copa (some se a instância não tem copa), 0.2 cartão com cor da folha, 0.35 cartão com cor
// da casca (gravetos), 1 casca sulcada, 2 bétula, 3 placas (pinheiro), 4 cacto, 5 chapéu de cogumelo (brilha), 6 talo liso.
// =============================================================
import * as THREE from 'three';
import { TILE, tileUV } from './veg_tex.js';

const V3 = THREE.Vector3;
function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _n = new V3();
function randUnit(r, out = new V3()) {
  const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(Math.cos(a) * s, u, Math.sin(a) * s);
}

class Geo {
  constructor() { this.P = []; this.N = []; this.U = []; this.A = []; this.S = []; this.I = []; }
  get n() { return this.P.length / 3; }
  v(p, n, u, v, k, ao, w, ph, sn = 0) {
    this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v); this.A.push(k, ao, w, ph); this.S.push(sn);
    return this.n - 1;
  }
  // tubo que afina por uma linha de pontos (casca): anéis com leve irregularidade, costura duplicada para a textura
  tube(pts, rad, sides, o) {
    const n = pts.length, T = [], start = this.n;
    for (let i = 0; i < n; i++) T.push(new V3().subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize());
    let nr = Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0).cross(T[0]).normalize() : new V3(1, 0, 0).cross(T[0]).normalize();
    let L = o.v0 || 0;
    const uRep = o.uRep || Math.max(1, Math.round((2 * Math.PI * rad[0]) / 0.9));
    const seed = o.seed || 0, nz = o.noise || 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) { L += pts[i].distanceTo(pts[i - 1]); nr.addScaledVector(T[i], -nr.dot(T[i])).normalize(); }
      const bn = _b.crossVectors(T[i], nr).normalize();
      const t = n > 1 ? i / (n - 1) : 0;
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        _n.copy(nr).multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
        const k = 1 + nz * (Math.sin(a * 3 + seed + i * 1.3) * 0.55 + Math.sin(a * 5 - seed * 2 + i * 0.7) * 0.3 + Math.sin(a * 2 + seed * 3) * 0.4);
        const p = _a.copy(pts[i]).addScaledVector(_n, rad[i] * k);
        const ao = o.ao ? o.ao(p, t) : 1, w = o.wind ? o.wind(p, t) : 0;
        this.v(p, _n, (j / sides) * uRep, L / (o.vLen || 1.6), o.kind, ao, w, o.ph ?? 0.5, o.snow ? Math.max(0, _n.y) * o.snow : 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
      const a = start + i * (sides + 1) + j, b = a + 1, c = a + sides + 1, d = c + 1;
      this.I.push(a, b, c, b, d, c);
    }
  }
  // cartão de folhas (recorte alfa do atlas): base, eixo "para cima" do quadro, normal desejada.
  // rows > 2 = cartão curvado (o fim cai `droop` metros). nfn(p) devolve a normal "de volume" (esfera da copa).
  card(base, up, nrm, w, l, tile, o) {
    const R = _c.crossVectors(up, nrm).normalize(), U = _d.copy(up).normalize();
    const [u0, v0, u1, v1] = tileUV(tile);
    const rows = o.rows || 2, start = this.n, nk = o.nk ?? 0.6;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      for (let s = 0; s < 2; s++) {
        const p = _a.copy(base).addScaledVector(U, l * t).addScaledVector(R, (s - 0.5) * w * (o.taper ? 1 - o.taper * t : 1));
        if (o.droop) p.y -= o.droop * t * t;
        const vn = o.nfn ? o.nfn(p, _b) : _b.copy(nrm);
        _n.copy(nrm).multiplyScalar(1 - nk).addScaledVector(vn, nk).normalize();
        const ao = o.ao ? o.ao(p, t) : 1, wv = o.wind ? o.wind(p, t) : 0;
        this.v(p, _n, s ? u1 : u0, v1 + (v0 - v1) * t, o.kind ?? 0, ao, wv, o.ph ?? 0.5, o.snow ? o.snow(p, t, nrm) : 0);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.I.push(a, b, c, b, d, c);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(this.A, 4));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.S, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// curva suave entre pontos (para galhos tortos): Catmull-Rom com n pontos
function curve(ctrl, n) {
  const c = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return c.getPoints(n - 1);
}
const lerpR = (r0, r1, n, pw = 1) => Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * Math.pow(i / Math.max(1, n - 1), pw));

// pontos espalhados por um elipsoide (copa), mais na parte de cima e de fora
function crownPoints(r, n, C, CR, minY = -0.55, f0 = 0.6, f1 = 0.88) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * (1 - minY);
    const s = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + r() * 0.6;
    const f = f0 + r() * (f1 - f0);
    out.push(new V3(C.x + Math.cos(a) * s * CR.x * f, C.y + (y + (r() - 0.5) * 0.15) * CR.y * f, C.z + Math.sin(a) * s * CR.z * f));
  }
  return out;
}
const ellN = (C, CR) => (p, out) => out.set((p.x - C.x) / (CR.x * CR.x), (p.y - C.y) / (CR.y * CR.y), (p.z - C.z) / (CR.z * CR.z)).normalize();
const ellD = (C, CR, p) => Math.hypot((p.x - C.x) / CR.x, (p.y - C.y) / CR.y, (p.z - C.z) / CR.z);

// copa em "lobos" (cachos grandes, como nuvens): silhueta irregular de árvore de verdade, com vãos onde os galhos aparecem.
// Devolve os cachos { p, L (centro do lobo), rl (raio do lobo) } e a lista de lobos.
function lobes(r, C, CR, nL, perL, rlK = 0.58, yTop = 0.55) {
  const out = [], Ls = [];
  for (let i = 0; i < nL; i++) {
    const y = i === 0 ? yTop : r() * 1.15 - 0.5;
    const a = i * 2.39996 + r() * 0.8, s = Math.sqrt(Math.max(0, 1 - y * y)), f = i === 0 ? 0.3 : 0.45 + r() * 0.2;
    const L = new V3(C.x + Math.cos(a) * s * CR.x * f, C.y + y * CR.y * f, C.z + Math.sin(a) * s * CR.z * f);
    Ls.push({ L, rl: Math.min(CR.x, CR.y) * rlK * (0.8 + r() * 0.4) });
  }
  for (const { L, rl } of Ls) for (let k = 0; k < perL * 2 && out.filter((q) => q.L === L).length < perL; k++) {
    const d = randUnit(r); d.y = d.y * 0.8 + 0.3; d.normalize();
    const p = L.clone().addScaledVector(d, rl * (0.5 + r() * 0.4));
    if (ellD(C, CR, p) < 0.5) continue; // enterrado no miolo: não precisa
    out.push({ p, L, rl });
  }
  return { clusters: out, lobes: Ls };
}

// raízes que saem do pé do tronco e entram no chão
function roots(g, r, n, r0, spread, sides, kind, seed) {
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + r() * 0.7, ca = Math.cos(az), sa = Math.sin(az), L = spread * (0.75 + r() * 0.5);
    const pts = curve([new V3(ca * r0 * 0.4, 0.4 + r() * 0.15, sa * r0 * 0.4), new V3(ca * (r0 + L * 0.3), 0.1, sa * (r0 + L * 0.3)), new V3(ca * (r0 + L), -0.22, sa * (r0 + L))], 4);
    g.tube(pts, [r0 * 0.55, r0 * 0.4, r0 * 0.22, r0 * 0.06], sides, { kind, noise: 0.15, seed: seed + k, ao: (p) => 0.5 + 0.3 * clamp01(p.y * 2), vLen: 1.6, uRep: 1 });
  }
}

// cachos de folhas numa copa (elipsoide C/CR): cards por cacho, tamanho, quadro do atlas
function leafClusters(g, r, centers, C, CR, o) {
  const nfc = ellN(C, CR), top = C.y + CR.y, _t = new V3();
  for (const q0 of centers) {
    const Q = q0.isVector3 ? q0 : q0.p, LC = q0.isVector3 ? null : q0.L, RL = q0.isVector3 ? 1 : q0.rl;
    // normal "de volume": metade da copa inteira, metade do lobo (sombreado em bolotas)
    const nfn = LC ? (q, out) => { nfc(q, out); _t.subVectors(q, LC).normalize(); return out.multiplyScalar(0.45).addScaledVector(_t, 0.55).normalize(); } : nfc;
    const lobeAO = (q) => (LC ? 0.72 + 0.28 * sstep(0.2, 1.0, q.distanceTo(LC) / RL) : 1);
    const ph = r();
    for (let i = 0; i < o.per; i++) {
      const p = new V3().copy(Q).addScaledVector(randUnit(r), o.spread * Math.cbrt(r()));
      const out = nfc(p, new V3());
      const N = new V3().copy(out).multiplyScalar(o.out ?? 0.75).add(randUnit(r).multiplyScalar(0.75)).normalize();
      let U = new V3(0, 1, 0).multiplyScalar(o.upK ?? 0.7).addScaledVector(out, 0.35).add(randUnit(r).multiplyScalar(0.45));
      U.addScaledVector(N, -U.dot(N)); if (U.lengthSq() < 1e-4) U.set(1, 0, 0).addScaledVector(N, -N.x); U.normalize();
      const w = o.size * (0.8 + r() * 0.4), l = w * (o.aspect || 1);
      const hang = o.hang ? 1 : 0.5;
      const base = new V3().copy(p).addScaledVector(U, -l * hang);
      const tile = Array.isArray(o.tile) ? o.tile[Math.floor(r() * o.tile.length)] : o.tile;
      g.card(base, U, N, w, l, tile, {
        nk: o.nk ?? 0.7, kind: o.kind ?? 0, ph: (ph + r() * 0.25) % 1,
        nfn,
        ao: (q) => { const d = ellD(C, CR, q); return (0.3 + 0.7 * sstep(0.25, 1.05, d)) * (0.68 + 0.32 * sstep(C.y - CR.y, top, q.y)) * lobeAO(q); },
        wind: (q) => 0.45 + 0.55 * clamp01(ellD(C, CR, q)) * (0.5 + 0.5 * clamp01(q.y / top)),
        snow: o.snow ? (q, t, nn) => Math.max(0, nn.y) : null,
      });
    }
  }
}

// ---------------- modelos ----------------
// carvalho (também a árvore corrompida e a dourada: muda só a cor de cada instância)
function oak(seed, far) {
  const r = rnd(seed), g = new Geo();
  const C = new V3(0, 3.2, 0), CR = new V3(1.9, 1.65, 1.9);
  const fork = 1.85 + r() * 0.35, lx = (r() - 0.5) * 0.3, lz = (r() - 0.5) * 0.3;
  const nT = far ? 3 : 7, tp = [], tr = [];
  for (let i = 0; i <= nT; i++) {
    const t = i / nT, y = -0.35 + t * (fork + 0.35);
    tp.push(new V3(lx * t * t + Math.sin(t * 3 + seed) * 0.05, y, lz * t * t + Math.cos(t * 2.3 + seed) * 0.05));
    tr.push(0.25 * (1 - 0.3 * t) + 0.24 * Math.pow(Math.max(0, 1 - (y + 0.35) / 0.8), 2));
  }
  const H = C.y + CR.y;
  const ao = (p) => 0.55 + 0.45 * sstep(-0.3, 1.4, p.y) * (1 - 0.35 * sstep(1.6, 3.2, p.y));
  const wind = (p) => Math.pow(clamp01(p.y / H), 2) * (0.35 + 0.65 * clamp01(Math.hypot(p.x, p.z) / CR.x));
  g.tube(tp, tr, far ? 5 : 10, { kind: 1, noise: far ? 0 : 0.09, seed, ao, wind, vLen: 1.5 });
  if (!far) roots(g, r, 5, 0.28, 0.75, 5, 1, seed);
  // copa em lobos; um galho grosso da forquilha até cada lobo e raminhos até os cachos
  const F = tp[tp.length - 1], LB = lobes(rnd(seed + 99), C, CR, 7, 5, 0.56);
  for (let k = 0; k < LB.lobes.length; k++) {
    const E = LB.lobes[k].L;
    const M = new V3().lerpVectors(F, E, 0.5); M.y += 0.2; M.x += (r() - 0.5) * 0.35; M.z += (r() - 0.5) * 0.35;
    const pts = curve([F.clone(), M, E.clone()], far ? 3 : 5);
    g.tube(pts, lerpR(k === 0 ? 0.17 : 0.14, 0.05, pts.length), far ? 3 : 6, { kind: 1, noise: far ? 0 : 0.1, seed: seed + k, ao, wind, vLen: 1.5, uRep: 1 });
  }
  if (!far) for (let k = 0; k < LB.clusters.length; k += 1) {
    const { p: Q, L: E } = LB.clusters[k];
    const M = new V3().lerpVectors(E, Q, 0.5); M.y += 0.1; M.x += (r() - 0.5) * 0.2;
    g.tube([E.clone(), M, Q.clone()], [0.05, 0.03, 0.01], 3, { kind: 1, seed, ao, wind, vLen: 1.5, uRep: 1 });
  }
  leafClusters(g, r, LB.clusters, C, CR, far ? { per: 1, spread: 0.2, size: 1.75, tile: [TILE.oak, TILE.oak2], nk: 0.8 } : { per: 8, spread: 0.5, size: 0.92, tile: [TILE.oak, TILE.oak2] });
  return g.build();
}

// pinheiro (também o nevado do Natal, o da floresta e o da tundra: neve por instância)
function pine(seed, far) {
  const r = rnd(seed), g = new Geo();
  const H = 4.95, y0 = 0.72, R0 = 1.6;
  const nT = far ? 3 : 9, tp = [], tr = [];
  for (let i = 0; i <= nT; i++) { const t = i / nT, y = -0.3 + t * (H - 0.35); tp.push(new V3(Math.sin(t * 2 + seed) * 0.03, y, Math.cos(t * 2.6 + seed) * 0.03)); tr.push(0.19 * (1 - t) + 0.012 + 0.12 * Math.pow(Math.max(0, 1 - (y + 0.3) / 0.6), 2)); }
  const wind = (p) => Math.pow(clamp01(p.y / H), 1.6) * 0.8 + 0.25 * clamp01(Math.hypot(p.x, p.z) / R0);
  g.tube(tp, tr, far ? 5 : 8, { kind: 3, noise: far ? 0 : 0.06, seed, ao: (p) => 0.45 + 0.5 * sstep(-0.3, 1.2, p.y), wind, vLen: 1.2 });
  const coneN = (p, out) => out.set(p.x, R0 / (H - y0) * Math.hypot(p.x, p.z) + 0.25, p.z).normalize();
  const step = far ? 0.62 : 0.34, nB = far ? 4 : 6;
  let wi = 0;
  for (let y = y0; y < H - 0.3; y += step * (0.85 + r() * 0.3), wi++) {
    const t = (y - y0) / (H - y0);
    for (let b = 0; b < nB; b++) {
      const az = wi * 2.4 + (b / nB) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const L = (R0 * Math.pow(1 - t, 0.92) + 0.22) * (0.85 + r() * 0.3);
      const dir = new V3(Math.cos(az), 0, Math.sin(az));
      const tR = 0.19 * (1 - (y + 0.3) / (H + 0.3)) + 0.015;
      const base = new V3().copy(dir).multiplyScalar(tR * 0.7); base.y = y;
      const droop = 0.12 + L * 0.2;
      if (!far && t < 0.55 && b % 2 === 0) { // galho por baixo das agulhas (só o começo aparece)
        const tip = new V3().copy(dir).multiplyScalar(L * 0.45); tip.y = y - droop * 0.2 - 0.04;
        g.tube([base.clone(), tip], [0.03 * (1 - t * 0.5) + 0.01, 0.008], 3, { kind: 3, seed, ao: () => 0.35, wind, vLen: 1.2, uRep: 1 });
      }
      const U = new V3().copy(dir); U.y = -0.12; U.normalize();
      const side = new V3(0, 1, 0).cross(U).normalize();
      const Nh = new V3().crossVectors(U, side).normalize(); if (Nh.y < 0) Nh.negate();
      for (const sg of far ? [-1, 1] : [-1, 1]) {
        const th = sg * (far ? 0.6 : 0.5) + (r() - 0.5) * 0.2;
        const N = new V3().copy(Nh).multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th)).normalize();
        const w = (0.55 + L * 0.42) * (far ? 1.35 : 1) * (0.9 + r() * 0.2);
        g.card(base, U, N, w, L * 1.12, r() < 0.5 ? TILE.pine : TILE.pine2, {
          rows: far ? 2 : 3, droop, taper: 0.25, nk: 0.5, kind: 0, ph: r(), nfn: coneN,
          ao: (p, tt) => (0.42 + 0.58 * sstep(0.0, 0.9, tt)) * (0.72 + 0.28 * t),
          wind: (p, tt) => 0.35 + 0.65 * tt * (0.6 + 0.4 * t),
          snow: (p, tt, nn) => Math.max(0, nn.y) * (0.65 + 0.35 * tt),
        });
      }
      if (!far && t < 0.72 && L > 0.5) { // "cortina": raminhos pendentes por baixo do ramo (abeto de verdade)
        const mid = new V3().copy(base).addScaledVector(U, L * (0.45 + r() * 0.2)); mid.y -= droop * 0.25;
        const N = new V3().copy(side).multiplyScalar(r() < 0.5 ? 1 : -1);
        const l = 0.35 + L * 0.3;
        g.card(mid.clone().add(new V3(0, -l, 0)), new V3(0, 1, 0), N, 0.42 + L * 0.2, l, TILE.pine2, {
          kind: 0, nk: 0.55, nfn: coneN, ph: r(), ao: (p, tt) => 0.35 + 0.35 * tt, wind: () => 0.8, snow: () => 0,
        });
      }
    }
  }
  // ponta (broto) com dois cartões cruzados
  for (let k = 0; k < 2; k++) {
    const N = new V3(Math.cos(k * 1.57 + 0.4), 0, Math.sin(k * 1.57 + 0.4));
    g.card(new V3(0, H - 0.75, 0), new V3(0, 1, 0), N, 0.62, 0.95, TILE.needleTop, { kind: 0, nk: 0.3, nfn: coneN, ao: () => 0.95, wind: () => 1, ph: r(), snow: () => 0.5 });
  }
  return g.build();
}

// bétula: tronco branco fino e levemente torto, galhos que sobem, folhinhas penduradas
function birch(seed, far) {
  const r = rnd(seed), g = new Geo();
  const C = new V3(0, 3.5, 0), CR = new V3(1.2, 1.6, 1.2), H = C.y + CR.y;
  const lean = (r() - 0.5) * 0.35, nT = far ? 3 : 8, tp = [], tr = [];
  for (let i = 0; i <= nT; i++) { const t = i / nT, y = -0.3 + t * (H - 0.15); tp.push(new V3(lean * t + Math.sin(t * 4 + seed) * 0.06, y, Math.cos(t * 3 + seed) * 0.06)); tr.push(0.15 * (1 - 0.8 * t) + 0.012 + 0.07 * Math.pow(Math.max(0, 1 - (y + 0.3) / 0.6), 2)); }
  const wind = (p) => Math.pow(clamp01(p.y / H), 1.7) * (0.6 + 0.6 * clamp01(Math.hypot(p.x, p.z) / CR.x));
  const ao = (p) => 0.6 + 0.4 * sstep(-0.3, 1.2, p.y);
  g.tube(tp, tr, far ? 5 : 8, { kind: 2, noise: far ? 0 : 0.04, seed, ao, wind, vLen: 1.3 });
  const centers = lobes(rnd(seed + 99), C, CR, 5, 4, 0.5, 0.6).clusters;
  if (!far) for (let k = 0; k < centers.length; k++) {
    const Q = centers[k].p, t = clamp01((Q.y - 1.9) / (H - 1.9));
    const i = Math.min(tp.length - 2, Math.round(t * 0.7 * nT + 0.2 * nT)), B = tp[i];
    const M = new V3().lerpVectors(B, Q, 0.45); M.y += 0.25;
    g.tube(curve([B.clone(), M, Q.clone()], 4), lerpR(0.045, 0.01, 4), 4, { kind: 2, seed: seed + k, ao, wind, vLen: 1.3, uRep: 1 });
  }
  leafClusters(g, r, centers, C, CR, far ? { per: 2, spread: 0.35, size: 1.4, aspect: 1.2, tile: TILE.birch, hang: true, upK: 2.5, nk: 0.75 } : { per: 7, spread: 0.45, size: 0.85, aspect: 1.15, tile: TILE.birch, hang: true, upK: 2.5 });
  return g.build();
}

// moita (arbusto de folhas)
function bush(seed, far) {
  const r = rnd(seed), g = new Geo();
  const C = new V3(0, 0.35, 0), CR = new V3(0.9, 0.62, 0.9);
  const centers = lobes(rnd(seed + 99), C, CR, 4, 3, 0.72, 0.3).clusters;
  if (!far) for (let k = 0; k < Math.min(6, centers.length); k++) { const Q = centers[k].p; g.tube([new V3(Q.x * 0.1, -0.1, Q.z * 0.1), new V3(Q.x * 0.5, Q.y * 0.6, Q.z * 0.5), Q.clone()], [0.03, 0.02, 0.008], 3, { kind: 1, seed: seed + k, ao: () => 0.4, wind: (p) => clamp01(p.y), uRep: 1 }); }
  leafClusters(g, r, centers, C, CR, far ? { per: 2, spread: 0.3, size: 0.95, tile: TILE.bush, nk: 0.75 } : { per: 7, spread: 0.36, size: 0.62, tile: [TILE.bush, TILE.oak2] });
  return g.build();
}

// árvore morta (Ermos, Planície, Planalto, Vulcão): tronco torto, galhos secos, gravetos; copa rala opcional
function dead(seed, far) {
  const r = rnd(seed), g = new Geo();
  const H = 4.5, nT = far ? 3 : 8, tp = [], tr = [];
  for (let i = 0; i <= nT; i++) { const t = i / nT, y = -0.35 + t * (H + 0.35); tp.push(new V3(Math.sin(t * 5 + seed) * 0.12 * t, y, Math.cos(t * 4 + seed * 2) * 0.12 * t)); tr.push(0.3 * (1 - 0.78 * t) + 0.03 + 0.2 * Math.pow(Math.max(0, 1 - (y + 0.35) / 0.8), 2)); }
  const wind = (p) => Math.pow(clamp01(p.y / H), 2) * 0.35;
  const ao = (p) => 0.5 + 0.5 * sstep(-0.3, 1.6, p.y);
  g.tube(tp, tr, far ? 5 : 9, { kind: 1, noise: far ? 0 : 0.14, seed, ao, wind, vLen: 1.4 });
  if (!far) roots(g, r, 4, 0.3, 0.8, 5, 1, seed);
  const tips = [];
  const branch = (P, dir, L, rad, depth) => {
    const n = far ? 2 : 4, pts = [P.clone()];
    const d = dir.clone();
    for (let i = 1; i <= n; i++) { d.add(randUnit(r).multiplyScalar(0.35)).normalize(); if (d.y < -0.2) d.y = -0.2; pts.push(pts[i - 1].clone().addScaledVector(d, L / n)); }
    g.tube(pts, lerpR(rad, rad * 0.25, pts.length), far ? 3 : depth ? 4 : 5, { kind: 1, noise: 0.08, seed: seed + depth, ao, wind, vLen: 1.4, uRep: 1 });
    if (depth < (far ? 0 : 1)) for (let k = 0; k < 2; k++) { const q = pts[2 + k] || pts[pts.length - 1]; const nd = d.clone().add(randUnit(r).multiplyScalar(0.9)).normalize(); nd.y = Math.abs(nd.y) * 0.8 + 0.2; branch(q, nd.normalize(), L * 0.5, rad * 0.45, depth + 1); }
    tips.push({ p: pts[pts.length - 1], d: d.clone() });
  };
  // galho principal (para +z local, como o antigo) e outros
  branch(new V3(0.05, 3.3, 0.1), new V3(0, 0.62, 0.78).normalize(), 2.0, 0.13, 0);
  for (let k = 0; k < 4; k++) {
    const y = 2.4 + k * 0.5 + r() * 0.3, az = k * 2.1 + 1 + r() * 0.8;
    branch(new V3(Math.cos(az) * 0.08, y, Math.sin(az) * 0.08), new V3(Math.cos(az), 0.75 + r() * 0.4, Math.sin(az)).normalize(), 1.1 + r() * 0.6, 0.09, 0);
  }
  if (!far) for (const T of tips) for (let k = 0; k < 2; k++) {
    const N = randUnit(r); N.y *= 0.4; N.normalize();
    const U = T.d.clone().addScaledVector(N, -T.d.dot(N)).normalize();
    g.card(T.p.clone().addScaledVector(U, -0.15), U, N, 0.75, 0.75, TILE.twigs, { kind: 0.35, nk: 0.2, ao: () => 0.85, wind: () => 0.6, ph: r() });
  }
  // copa rala (só nas instâncias "com copa")
  const C = new V3(0, 4.7, 0.3), CR = new V3(1.4, 0.95, 1.4);
  leafClusters(g, r, crownPoints(r, far ? 7 : 9, C, CR, -0.4, 0.5, 0.85), C, CR, far ? { per: 2, spread: 0.4, size: 1.3, tile: TILE.ivy, nk: 0.7 } : { per: 5, spread: 0.5, size: 0.9, tile: TILE.ivy, hang: true, upK: 2 });
  return g.build();
}

// arbusto seco (Ermos): estrela de cartões de gravetos
function twigBush(seed) {
  const r = rnd(seed), g = new Geo();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + r() * 0.3, N = new V3(Math.cos(a), 0.15, Math.sin(a)).normalize();
    const U = new V3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3); U.addScaledVector(N, -U.dot(N)).normalize();
    g.card(new V3(0, -0.08, 0), U, N, 0.95, 0.85, TILE.twigs, { kind: 0.35, nk: 0.15, ao: (p, t) => 0.6 + 0.4 * t, wind: (p, t) => t * 0.5, ph: r() });
  }
  return g.build();
}

// árvore do pântano: tronco com raízes-escora, copa achatada e barba-de-velho pendurada
function swamp(seed, far) {
  const r = rnd(seed), g = new Geo();
  const C = new V3(0, 4.3, 0), CR = new V3(1.5, 0.72, 1.5), H = C.y + CR.y;
  const nT = far ? 3 : 7, tp = [], tr = [];
  for (let i = 0; i <= nT; i++) { const t = i / nT, y = -0.3 + t * 4.4; tp.push(new V3(Math.sin(t * 3 + seed) * 0.15, y, Math.cos(t * 2 + seed) * 0.1)); tr.push(0.28 * (1 - 0.5 * t) + 0.3 * Math.pow(Math.max(0, 1 - (y + 0.3) / 1.4), 2)); }
  const wind = (p) => Math.pow(clamp01(p.y / H), 2) * 0.6;
  const ao = (p) => 0.45 + 0.55 * sstep(-0.3, 1.5, p.y);
  g.tube(tp, tr, far ? 5 : 9, { kind: 1, noise: far ? 0 : 0.18, seed, ao, wind, vLen: 1.4 });
  if (!far) roots(g, r, 7, 0.45, 1.1, 5, 1, seed);
  const centers = lobes(rnd(seed + 99), C, CR, 6, 4, 0.75, 0.3).clusters;
  if (!far) for (let k = 0; k < 6; k++) { const Q = centers[(k * 3) % centers.length].p; const F = tp[nT - 1]; g.tube(curve([F.clone(), new V3((F.x + Q.x) / 2, Q.y + 0.2, (F.z + Q.z) / 2), Q.clone()], 4), lerpR(0.12, 0.03, 4), 5, { kind: 1, seed: seed + k, ao, wind, uRep: 1 }); }
  leafClusters(g, r, centers, C, CR, far ? { per: 3, spread: 0.5, size: 1.7, tile: TILE.broad, nk: 0.75 } : { per: 8, spread: 0.6, size: 1.05, tile: [TILE.broad, TILE.oak2] });
  // barba-de-velho
  for (let k = 0; k < (far ? 4 : 10); k++) {
    const a = r() * Math.PI * 2, d = 0.4 + r() * 0.9, N = new V3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57));
    const top = new V3(Math.cos(a) * d * CR.x, C.y - CR.y * 0.35, Math.sin(a) * d * CR.z), l = 1.1 + r() * 0.9;
    g.card(top.clone().add(new V3(0, -l, 0)), new V3(0, 1, 0), N, 0.7, l, TILE.moss, { kind: 0.2, nk: 0.3, ao: (p, t) => 0.55 + 0.35 * t, wind: () => 0.9, ph: r() });
  }
  return g.build();
}

// cacto (saguaro) com gomos (o sombreado dos gomos é feito no material)
function cactus(seed, far) {
  const r = rnd(seed), g = new Geo(), sides = far ? 6 : 14;
  const ao = (p) => 0.6 + 0.4 * sstep(-0.1, 1.0, p.y);
  const body = (pts, r0) => {
    const n = pts.length, rad = pts.map((_, i) => r0 * (i === n - 1 ? 0.25 : i === n - 2 ? 0.8 : 1));
    g.tube(pts, rad, sides, { kind: 4, seed, ao, wind: () => 0, uRep: 1, vLen: 1 });
  };
  const ny = far ? 3 : 7;
  body([...Array.from({ length: ny }, (_, i) => new V3(0, -0.2 + (i / (ny - 1)) * 2.75, 0)), new V3(0, 2.83, 0)], 0.33);
  const arm = (sx, y0, out, up, rr) => {
    const pts = far ? [new V3(0, y0, 0), new V3(sx * out, y0 + 0.15, 0), new V3(sx * out, y0 + up, 0), new V3(sx * out, y0 + up + rr * 0.6, 0)]
      : curve([new V3(0, y0, 0), new V3(sx * out * 0.7, y0 + 0.02, 0), new V3(sx * out, y0 + 0.3, 0), new V3(sx * out, y0 + up, 0)], 7).concat([new V3(sx * out, y0 + up + rr * 0.55, 0)]);
    body(pts, rr);
  };
  arm(1, 1.25 + r() * 0.2, 0.58, 1.0, 0.19);
  arm(-1, 1.0 + r() * 0.2, 0.5, 0.75, 0.17);
  return g.build();
}

// capim alto e juncos: cartões cruzados
function tuft(seed, tile, h, w, n = 3) {
  const r = rnd(seed), g = new Geo();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI + r() * 0.4, N = new V3(Math.cos(a), 0.1, Math.sin(a)).normalize();
    const U = new V3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2); U.addScaledVector(N, -U.dot(N)).normalize();
    g.card(new V3((r() - 0.5) * 0.2, -0.08, (r() - 0.5) * 0.2), U, N, w, h, tile, { kind: 0.2, nk: 0.35, nfn: (p, o) => o.set(0, 1, 0), ao: (p, t) => 0.55 + 0.45 * t, wind: (p, t) => t * t, ph: r() });
  }
  return g.build();
}

// cogumelos (o chapéu brilha à noite com a cor da instância)
function mushrooms(seed) {
  const r = rnd(seed), g = new Geo();
  const one = (x, z, s) => {
    const lean = (r() - 0.5) * 0.12;
    g.tube([new V3(x, -0.05, z), new V3(x + lean * 0.5, 0.25 * s, z), new V3(x + lean, 0.48 * s, z)], [0.075 * s, 0.06 * s, 0.055 * s], 7, { kind: 6, seed, ao: (p) => 0.6 + 0.4 * clamp01(p.y / (0.5 * s)), wind: () => 0, uRep: 1, vLen: 0.5 });
    // chapéu: cúpula (por cima) + lamelas (por baixo)
    const cx = x + lean, cy = 0.46 * s, R = 0.3 * s, rows = 5, seg = 12, st = g.n;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, ang = t * Math.PI * 0.5, rr = Math.sin(ang) * R, yy = cy + Math.cos(ang) * R * 0.55;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2, p = new V3(cx + Math.cos(a) * rr * (1 + 0.04 * Math.sin(a * 3 + seed)), yy, z + Math.sin(a) * rr);
        const nn = new V3(Math.cos(a) * Math.sin(ang), Math.cos(ang) * 1.6, Math.sin(a) * Math.sin(ang)).normalize();
        g.v(p, nn, j / seg, t, 5, 0.9 + 0.1 * (1 - t), 0, r(), 0);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = st + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1; g.I.push(a, c, b, b, c, d); }
    const c0 = g.v(new V3(cx, cy + 0.02, z), new V3(0, -1, 0), 0.5, 0.5, 6, 0.35, 0, 0, 0), st2 = g.n;
    for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2; g.v(new V3(cx + Math.cos(a) * R, cy, z + Math.sin(a) * R), new V3(0, -1, 0), j / seg, 1, 6, 0.55, 0, 0, 0); }
    for (let j = 0; j < seg; j++) g.I.push(c0, st2 + j, st2 + j + 1);
  };
  one(0, 0, 1.15);
  one(0.32, 0.18, 0.62);
  one(-0.22, 0.3, 0.45);
  return g.build();
}

// todos os modelos: { near, far } (far = null → some de longe; maxD = distância máxima)
export function makeTemplates(mobile) {
  void mobile;
  const T = {};
  const mk = (name, fn, opts = {}) => { const t0 = performance.now(); T[name] = { name, near: fn(false), far: opts.noFar ? null : fn(true), ...opts }; T[name].ms = Math.round(performance.now() - t0); };
  mk('oak', (f) => oak(11, f), { cy: 2.6, rad: 3.4 });
  mk('oak2', (f) => oak(23, f), { cy: 2.6, rad: 3.4, farOf: 'oak' });
  mk('pine', (f) => pine(7, f), { cy: 2.4, rad: 3.2 });
  mk('pine2', (f) => pine(31, f), { cy: 2.4, rad: 3.2, farOf: 'pine' });
  mk('birch', (f) => birch(5, f), { cy: 2.8, rad: 3.1 });
  mk('bush', (f) => bush(3, f), { cy: 0.3, rad: 1.2 });
  mk('dead', (f) => dead(17, f), { cy: 2.6, rad: 3.6 });
  mk('swamp', (f) => swamp(13, f), { cy: 2.6, rad: 3.4 });
  mk('cactus', (f) => cactus(19, f), { cy: 1.4, rad: 1.9 });
  mk('twig', () => twigBush(29), { cy: 0.35, rad: 0.8, noFar: true, maxD: 90 });
  mk('tuft', () => tuft(37, TILE.grass, 0.8, 0.85), { cy: 0.35, rad: 0.7, noFar: true, maxD: 75 });
  mk('reeds', () => tuft(41, TILE.reed, 1.65, 0.95), { cy: 0.8, rad: 1.0, noFar: true, maxD: 85 });
  mk('mush', () => mushrooms(43), { cy: 0.3, rad: 0.6, noFar: true, maxD: 80 });
  // o 2º modelo de carvalho/pinheiro só existe de perto (de longe usa o 1º)
  T.oak2.far = null; T.pine2.far = null;
  return T;
}
