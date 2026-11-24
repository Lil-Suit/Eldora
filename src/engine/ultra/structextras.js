import * as THREE from 'three';
import { Batch, GEO, vcLambert } from '../batch.js';
import { VILLAGE } from '../../config/world.js';
import { natalAtivo } from '../../config/seasonal.js';
import { K, SHAPE } from './structmat.js';

// =============================================================
// Ultra realismo — DETALHES EXTRAS das estruturas (sem colisão, só no Ultra, poucas malhas):
//  • casas da vila: enxaimel (soleira, frechal, montantes e mãos-francesas), molduras/peitoris/venezianas das janelas,
//    batente e ferragens da porta, degrau de pedra, testeiras e cumeeira do telhado, chapéu da chaminé,
//    neve na beirada com pingentes de gelo (Natal) e pedrinhas no pé;
//  • paredes de pedra de todos os mapas: pedras soltas/entulho no pé; hera subindo nas do Vale.
// Tudo a partir das MESMAS posições do mapa (casas do config e as peças já existentes do lote).
// =============================================================
const SNOW = natalAtivo();
const L = (x, z, rot, lx, lz) => { const c = Math.cos(rot), s = Math.sin(rot); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const TIMBER = 0x4a3426, FRAME = 0xd8cfbc, IRON = 0x2f2b28, STEP = 0x8a857c, SNOWC = 0xeef3f8, ICE = 0xdfeaf2;
const SHUT = [0x3e5a3a, 0x34506a, 0x4a5a40, 0x2f4660];

// ---------- casas da vila ----------
function house(b, world, hs, idx) {
  const { x, z, rot, w, d } = hs;
  const y = world.groundHeight(x, z, 'world');
  const R = rnd(1000 + idx * 77);
  // peça numa face: f = 0 frente (+z), 1 fundos (-z), 2 lado +x, 3 lado -x; u = ao longo da face, ly = altura, o = para fora
  const face = (f, u, ly, o, sT, sY, sN, col, tilt = 0, k = K.WOOD) => {
    b.k = k;
    let lx, lz;
    if (f === 0) { lx = u; lz = d / 2 + o; } else if (f === 1) { lx = -u; lz = -d / 2 - o; } else if (f === 2) { lx = w / 2 + o; lz = -u; } else { lx = -w / 2 - o; lz = u; }
    const [px, pz] = L(x, z, rot, lx, lz);
    if (f < 2) b.addGeo(GEO.box, px, y + ly, pz, sT, sY, sN, 0, rot, f === 0 ? tilt : -tilt, col);
    else b.addGeo(GEO.box, px, y + ly, pz, sN, sY, sT, f === 2 ? tilt : -tilt, rot, 0, col);
  };
  // viga diagonal entre (u0, v0) e (u1, v1) numa face
  const brace = (f, u0, v0, u1, v1) => {
    const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv);
    face(f, (u0 + u1) / 2, (v0 + v1) / 2, 0.035, 0.13, len, 0.07, TIMBER, Math.atan2(-du, dv));
  };
  const shut = SHUT[idx % SHUT.length];
  for (let f = 0; f < 4; f++) {
    const Lf = f < 2 ? w : d, e = Lf / 2 - 0.14;
    // soleira e frechal (a porta corta a soleira na frente)
    if (f === 0) { const a = (e + 0.62) / 2, len = e - 0.62; face(f, -a, 0.52, 0.035, len, 0.14, 0.07, TIMBER); face(f, a, 0.52, 0.035, len, 0.14, 0.07, TIMBER); }
    else face(f, 0, 0.52, 0.035, 2 * e, 0.14, 0.07, TIMBER);
    face(f, 0, 3.08, 0.035, 2 * e, 0.16, 0.07, TIMBER);
    // painel de baixo: mãos-francesas nos cantos + montantes
    for (const s of [-1, 1]) brace(f, s * e, 0.59, s * (e - 1.05), 1.76);
    const studs = [];
    if (f === 1) for (let u = -e + 1.3; u < e - 1.2; u += 1.15) studs.push(u);
    else if (f === 0) studs.push(-0.62, 0.62); else studs.push(...(e > 1.6 ? [-e + 1.2, e - 1.2] : []));
    for (const u of studs) face(f, u, 1.175, 0.035, 0.13, 1.17, 0.07, TIMBER);
    // painel de cima
    if (f === 1) { for (const s of [-1, 1]) brace(f, s * e, 1.95, s * (e - 0.95), 3.0); face(f, 0, 2.47, 0.035, 0.13, 1.06, 0.07, TIMBER); }
    else if (f === 0) face(f, 0, 2.6, 0.035, 0.13, 0.9, 0.07, TIMBER);
    else for (const s of [-1, 1]) if (e > 1.4) face(f, s * (e - 0.55), 2.47, 0.035, 0.13, 1.06, 0.07, TIMBER);
    // janelas (onde o mapa já tem o vidro): moldura, verga, peitoril e venezianas abertas
    const wins = f === 0 ? [-w * 0.3, w * 0.3] : f === 1 ? [] : [0];
    for (const u of wins) {
      for (const s of [-1, 1]) face(f, u + s * 0.41, 2.25, 0.06, 0.07, 0.72, 0.1, FRAME);
      face(f, u, 2.6, 0.065, 0.95, 0.09, 0.12, FRAME);
      face(f, u, 1.905, 0.1, 1.0, 0.07, 0.2, FRAME);
      for (const s of [-1, 1]) { face(f, u + s * 0.64, 2.25, 0.035, 0.36, 0.68, 0.04, shut); face(f, u + s * 0.64, 2.25, 0.06, 0.3, 0.06, 0.02, shut); }
    }
  }
  // porta: batente, verga, dobradiças, argola e degrau
  for (const s of [-1, 1]) face(0, s * 0.56, 1.15, 0.07, 0.11, 2.0, 0.12, TIMBER);
  face(0, 0, 2.17, 0.075, 1.3, 0.13, 0.14, TIMBER);
  for (const hy of [0.55, 1.7]) face(0, -0.18, hy, 0.105, 0.6, 0.06, 0.02, IRON, 0, K.METAL);
  face(0, 0.33, 1.15, 0.11, 0.06, 0.12, 0.03, IRON, 0, K.METAL);
  { const [px, pz] = L(x, z, rot, 0, d / 2 + 0.5); b.k = K.STONE; b.box(px, world.groundHeight(px, pz, 'world') + 0.04, pz, 1.5, 0.16, 0.62, STEP, rot); }
  // telhado: testeiras nos oitões, cumeeira, neve na beirada e pingentes de gelo
  const RW = w + 1.0, RD = (d + 1.1) / 2, RH = 2.2, ry = y + 3.2, sl = Math.hypot(RD, RH);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px, pz] = L(x, z, rot, sx * (RW / 2 + 0.03), sz * RD / 2);
    const th = Math.atan2(-sz * RD, RH);
    // um pouco acima da linha do telhado (normal da água)
    const nY = RD / sl * 0.07, nZ = sz * RH / sl * 0.07;
    const [qx, qz] = L(x, z, rot, sx * (RW / 2 + 0.03), sz * RD / 2 + nZ);
    void px; void pz;
    b.k = K.WOOD; b.addGeo(GEO.box, qx, ry + RH / 2 + nY, qz, 0.07, sl + 0.12, 0.24, th, rot, 0, TIMBER);
  }
  { const [px, pz] = L(x, z, rot, 0, 0); b.k = SNOW ? K.SNOW : K.WOOD; b.addGeo(GEO.box, px, ry + RH + 0.04, pz, RW + 0.16, 0.16, 0.3, 0, rot, 0, SNOW ? SNOWC : TIMBER); }
  if (SNOW) for (const sz of [-1, 1]) {
    // rolo de neve na beirada (segue a água do telhado)
    const [px, pz] = L(x, z, rot, 0, sz * (RD - 0.02));
    b.k = K.SNOW; b.addGeo(GEO.cyl8, px, ry + 0.07, pz, 0.24, RW - 0.05, 0.2, 0, rot, Math.PI / 2, SNOWC);
    const n = Math.floor(RW / 0.32);
    for (let i = 0; i < n; i++) {
      if (R() < 0.35) continue;
      const u = -RW / 2 + 0.2 + i * ((RW - 0.4) / Math.max(1, n - 1)) + (R() - 0.5) * 0.12, h = 0.08 + R() * R() * 0.42;
      const [ix, iz] = L(x, z, rot, u, sz * (RD + 0.01));
      b.k = K.GLASS; b.addGeo(GEO.cone4, ix, ry - 0.02 - h / 2, iz, 0.05 + R() * 0.04, h, 0.05 + R() * 0.04, Math.PI, R() * 3, 0, ICE);
    }
  }
  // chaminé: chapéu de pedra e pote de barro
  {
    const [cx, cz] = L(x, z, rot, w * 0.28, -d * 0.12);
    b.k = K.STONE; b.addGeo(GEO.box, cx, y + 5.56, cz, 0.82, 0.12, 0.82, 0, rot, 0, 0x6f6a62);
    b.k = K.GEN; b.addGeo(GEO.cyl8, cx + 0.08, y + 5.76, cz, 0.24, 0.3, 0.24, 0, 0, 0, 0x8a4a32);
    if (SNOW) { b.k = K.SNOW; b.addGeo(GEO.box, cx, y + 5.65, cz, 0.84, 0.07, 0.84, 0, rot, 0, SNOWC); }
  }
  // pedrinhas no pé da casa
  b.k = 0;
  for (let i = 0; i < 6; i++) {
    const f = Math.floor(R() * 4), Lf = f < 2 ? w : d, u = (R() - 0.5) * Lf;
    let lx, lz; if (f === 0) { lx = u; lz = d / 2 + 0.32; } else if (f === 1) { lx = u; lz = -d / 2 - 0.32; } else { lx = (f === 2 ? 1 : -1) * (w / 2 + 0.32); lz = u; }
    if (f === 0 && Math.abs(u) < 1.0) continue;
    const [px, pz] = L(x, z, rot, lx, lz), s = 0.1 + R() * 0.16;
    b.rock(px, world.groundHeight(px, pz, 'world') + s * 0.15, pz, s, 0x7d786f, R() * 6, 0.6);
  }
  b.k = 0;
}

// ---------- pedras soltas e hera no pé das paredes de pedra (qualquer mapa) ----------
const UP = new THREE.Vector3();
function rubbleAndIvy(b, parts, ground, opt) {
  const R = rnd(opt.seed || 7);
  let budget = opt.max || 900, ivyBudget = opt.ivy ? (opt.ivyMax || 70) : 0;
  const big = opt.big || 1;
  for (const q of parts) {
    if (budget <= 0) break;
    if (q.shape !== SHAPE.BOX || (q.kind !== K.STONE && q.kind !== K.MARBLE && q.kind !== K.SAND)) continue;
    // só caixas "em pé" (eixo y da peça quase vertical)
    UP.set(q.ay[0], q.ay[1], q.ay[2]).normalize(); if (UP.y < 0.97) continue;
    const [hx, hy, hz] = q.h;
    if (hy < 0.55 || Math.max(hx, hz) < 0.8 * big) continue;
    const g = ground(q.c[0], q.c[2]);
    const bot = q.c[1] - hy;
    if (bot > g + 0.4 || bot < g - 2.5) continue;
    const ex = [q.ax[0], q.ax[2]], ez = [q.az[0], q.az[2]];
    const nx = Math.hypot(ex[0], ex[1]) || 1, nz = Math.hypot(ez[0], ez[1]) || 1;
    ex[0] /= nx; ex[1] /= nx; ez[0] /= nz; ez[1] /= nz;
    const per = 4 * (hx + hz);
    const cnt = Math.min(10, Math.round(per * 0.32 * (0.5 + R())));
    for (let i = 0; i < cnt && budget > 0; i++) {
      const f = Math.floor(R() * 4), sx = f === 0 ? 1 : f === 1 ? -1 : 0, sz = f === 2 ? 1 : f === 3 ? -1 : 0;
      const t = R() * 2 - 1, o = 0.08 + R() * 0.45 * big;
      const lx = sx ? sx * (hx + o) : t * hx, lz = sz ? sz * (hz + o) : t * hz;
      const px = q.c[0] + ex[0] * lx + ez[0] * lz, pz = q.c[2] + ex[1] * lx + ez[1] * lz;
      const s = (0.12 + R() * R() * 0.4) * big, gy = ground(px, pz);
      const c = new THREE.Color(q.hex).multiplyScalar(0.78 + R() * 0.2).getHex();
      b.k = K.ROCK; b.rock(px, gy + s * 0.12, pz, s, c, R() * 6, 0.45 + R() * 0.35);
      budget--;
    }
    // hera: sobe de um ponto do pé da parede, espalhando para os lados
    if (ivyBudget > 0 && hy > 0.9 && R() < (opt.ivyP || 0.3)) {
      ivyBudget--;
      const f = Math.floor(R() * 4), sx = f === 0 ? 1 : f === 1 ? -1 : 0, sz = f === 2 ? 1 : f === 3 ? -1 : 0;
      const half = sx ? hz : hx, t0 = (R() * 2 - 1) * Math.max(0, half - 0.6);
      const nrm = sx ? [ex[0] * sx, ex[1] * sx] : [ez[0] * sz, ez[1] * sz], tan = sx ? ez : ex;
      const off = (sx ? hx : hz) + 0.025;
      const top = Math.min(2 * hy - 0.2, 0.9 + R() * (2 * hy - 0.9)), base = Math.max(bot, g - 0.1);
      const ry = Math.atan2(nrm[0], nrm[1]);
      const N = Math.floor(22 + top * 16);
      for (let i = 0; i < N; i++) {
        const v = Math.pow(R(), 0.8) * top, spread = 0.18 + (1 - v / Math.max(top, 0.01)) * 0.25 + R() * 0.55 * Math.sqrt(v / Math.max(top, 0.01));
        const u = t0 + Math.sin(v * 2.3 + t0) * 0.25 + (R() * 2 - 1) * spread;
        if (Math.abs(u) > half - 0.05) continue;
        const ox = q.c[0] + nrm[0] * off + tan[0] * u, oz = q.c[2] + nrm[1] * off + tan[1] * u;
        const s = 0.09 + R() * 0.07;
        const col = new THREE.Color().setHSL(0.24 + R() * 0.08, 0.5 + R() * 0.2, 0.06 + R() * 0.07).getHex();
        b.k = K.LEAF; b.addGeo(GEO.octa, ox, base + v + 0.05, oz, s * 1.2, s, 0.035, (R() - 0.5) * 0.7, ry + (R() - 0.5) * 0.5, R() * 3, col);
      }
      // ramos
      for (let j = 0; j < 3; j++) {
        const u = t0 + (j - 1) * 0.18, hh = top * (0.6 + R() * 0.35);
        const ox = q.c[0] + nrm[0] * (off - 0.01) + tan[0] * u, oz = q.c[2] + nrm[1] * (off - 0.01) + tan[1] * u;
        b.k = K.BARK; b.addGeo(GEO.cyl6, ox, base + hh / 2, oz, 0.035, hh, 0.035, 0, ry, (R() - 0.5) * 0.3, 0x3a2a1e);
      }
    }
  }
  b.k = 0;
}

// recs: [{ mesh, area, climate, origin, ground, snowAt }] das malhas de estrutura; partsOf(mesh) -> peças
export function buildExtras(world, recs, partsOf) {
  const out = [];
  const PARENT = { world: world.group, guardiao: world.plainGroup, ermos: world.ermosGroup, cripta: world.dungeon, confins: world.confins?.group };
  const byArea = new Map();
  for (const r of recs) { if (!byArea.has(r.area)) byArea.set(r.area, []); byArea.get(r.area).push(r); }
  for (const [area, list] of byArea) {
    const parent = PARENT[area]; if (!parent) continue;
    const b = new Batch();
    if (area === 'world') VILLAGE.houses.forEach((hs, i) => house(b, world, hs, i));
    for (const r of list) rubbleAndIvy(b, partsOf(r.mesh), r.ground, {
      seed: area.length * 131 + 5, ivy: area === 'world', ivyP: 0.32, ivyMax: 60, max: area === 'world' ? 800 : 500,
    });
    const mesh = b.build(vcLambert(), { name: 'ultra-estr-extras-' + area, castShadow: false, receiveShadow: true });
    if (!mesh) continue;
    const r0 = list[0];
    out.push({ mesh, parent, area, climate: r0.climate, origin: r0.origin, ground: r0.ground, snowAt: r0.snowAt });
  }
  return out;
}

// megaestruturas dos Confins: entulho no pé das paredes gigantes
export function buildMegaExtras(world, S, B, partsOf) {
  const b = new Batch();
  const base = S.h ?? 0;
  const gfn = world.confins?.heightAt ? (x, z) => world.confins.heightAt(x, z) : () => base;
  for (const m of B.group.children) if (m.userData.ub && m.material?.type === 'MeshLambertMaterial') rubbleAndIvy(b, partsOf(m), gfn, { seed: S.x | 0, max: 500, big: 1.6 });
  return b.build(vcLambert(), { name: 'ultra-mega-extras', castShadow: false, receiveShadow: true });
}
