import * as THREE from 'three';
import { GEO } from './batch.js';

// Enfeites de acampamento e de portal (Ermos, Confins). Tudo vai para Batches (1 desenho só por batch).
// b = batch normal, g = batch de brilho (sem sombra), col = colisões do mundo.

const rot = (ox, oz, ry) => [ox * Math.cos(ry) + oz * Math.sin(ry), -ox * Math.sin(ry) + oz * Math.cos(ry)];

// barraca em "A": duas lonas inclinadas, cumeeira, varas, entrada escura e um colchonete na frente
export function campTent(b, x, y, z, ry, color, s = 1) {
  const L = 3.6 * s, a = 1.7 * s, h = 2.3 * s, sl = Math.hypot(a, h), th = Math.atan2(h, a);
  const dark = new THREE.Color(color).multiplyScalar(0.62).getHex();
  for (const sg of [1, -1]) {
    const [ox, oz] = rot(0, sg * a / 2, ry);
    b.box(x + ox, y + h / 2, z + oz, L, 0.07, sl, sg > 0 ? color : dark, ry, sg * th);
  }
  b.cyl(x, y + h, z, 0.07 * s, L + 0.5 * s, 0x5a4030, 6, 0, ry, Math.PI / 2); // cumeeira
  for (const e of [1, -1]) {
    const [ox, oz] = rot(e * (L / 2 + 0.1), 0, ry);
    b.cyl(x + ox, y + h / 2 + 0.15, z + oz, 0.06 * s, h + 0.3, 0x5a4030, 6);
  }
  // fundo fechado (triângulo) e entrada escura na frente
  { const [ox, oz] = rot(-L / 2, 0, ry); b.addGeo(GEO.prism, x + ox, y + h * 0.42, z + oz, 0.12, a * 2.05, h * 1.15, Math.PI / 2, ry + Math.PI / 2, 0, dark); }
  { const [ox, oz] = rot(L / 2 + 0.02, 0, ry); b.addGeo(GEO.prism, x + ox, y + h * 0.3, z + oz, 0.06, a * 1.1, h * 0.8, Math.PI / 2, ry + Math.PI / 2, 0, 0x1e1a1c); }
  { const [ox, oz] = rot(L / 2 + 1.2 * s, 0.3, ry); b.box(x + ox, y + 0.06, z + oz, 1.6 * s, 0.12, 0.8 * s, 0x7a3a2a, ry + 0.2); }
}

// fogueira completa: anel de pedras, lenha cruzada, chama, espeto e bancos de tronco em volta
export function campfire(b, g, x, y, z) {
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.rock(x + Math.cos(a) * 1.05, y + 0.15, z + Math.sin(a) * 1.05, 0.5, i % 2 ? 0x6a6660 : 0x575450, a); }
  for (let i = 0; i < 4; i++) b.cyl(x, y + 0.18, z, 0.11, 1.5, 0x4a3020, 6, 0, (i / 4) * Math.PI, Math.PI / 2 - 0.25);
  g.cone(x, y + 0.75, z, 0.55, 1.3, 0xffa040, 6);
  g.cone(x + 0.15, y + 0.6, z - 0.1, 0.35, 0.9, 0xffd27a, 6, 0.6);
  // espeto
  for (const sg of [1, -1]) { b.cyl(x + sg * 1.25, y + 0.7, z, 0.06, 1.4, 0x3a2a1a, 6); b.box(x + sg * 1.25, y + 1.38, z, 0.08, 0.25, 0.3, 0x3a2a1a); }
  b.cyl(x, y + 1.35, z, 0.04, 2.7, 0x2a2a2a, 6, 0, 0, Math.PI / 2);
  b.addGeo(GEO.sphere, x, y + 1.2, z, 0.9, 0.45, 0.45, 0, 0, 0, 0x8a4a2a);
  // bancos de tronco
  for (const [a, len] of [[0.4, 2.4], [2.3, 2.0], [4.2, 2.6]]) {
    const bx = x + Math.cos(a) * 2.9, bz = z + Math.sin(a) * 2.9;
    b.cyl(bx, y + 0.28, bz, 0.28, len, 0x6a4a2e, 8, 0, -a, Math.PI / 2);
  }
}

// pilha de suprimentos: caixotes, barris, sacos
export function supplies(b, x, y, z, ry = 0) {
  const P = (ox, oz) => { const [a, c] = rot(ox, oz, ry); return [x + a, z + c]; };
  let [px, pz] = P(0, 0); b.box(px, y + 0.45, pz, 0.9, 0.9, 0.9, 0x8a6a42, ry);
  [px, pz] = P(0.95, 0.1); b.box(px, y + 0.4, pz, 0.8, 0.8, 0.8, 0x7a5a36, ry + 0.3);
  [px, pz] = P(0.4, 0.05); b.box(px, y + 1.25, pz, 0.7, 0.7, 0.7, 0x96754a, ry + 0.7);
  [px, pz] = P(-1.0, 0.3); b.cyl(px, y + 0.55, pz, 0.42, 1.1, 0x6a4428, 8); b.cyl(px, y + 0.75, pz, 0.44, 0.08, 0x3a3a3a, 8); b.cyl(px, y + 0.3, pz, 0.44, 0.08, 0x3a3a3a, 8);
  [px, pz] = P(-0.6, -0.9); b.addGeo(GEO.sphere, px, y + 0.3, pz, 0.7, 0.6, 0.55, 0, ry, 0, 0xb8a27a);
}

// poste com lanterna (brilho) e estandarte com pano
export function lanternPost(b, g, x, y, z) {
  b.cyl(x, y + 1.4, z, 0.08, 2.8, 0x4a3424, 6);
  b.box(x + 0.35, y + 2.7, z, 0.7, 0.07, 0.07, 0x4a3424);
  b.box(x + 0.65, y + 2.35, z, 0.32, 0.42, 0.32, 0x2a2a2a);
  g.box(x + 0.65, y + 2.35, z, 0.22, 0.32, 0.22, 0xffc070);
}
export function banner(b, x, y, z, ry, cloth, s = 1) {
  b.cyl(x, y + 2.6 * s, z, 0.09, 5.2 * s, 0x4a3424, 6);
  const [ox, oz] = rot(0.75 * s, 0, ry);
  b.box(x + ox, y + 4.2 * s, z + oz, 1.4 * s, 2.0 * s, 0.06, cloth, ry);
  b.box(x + ox, y + 3.15 * s, z + oz, 1.4 * s, 0.14, 0.07, 0xd8b25a, ry);
  b.cone(x, y + 5.35 * s, z, 0.14, 0.4, 0xd8b25a, 4);
}

// acampamento inteiro em volta de (x,z). tents = [[dx, dz, ry, cor]]
export function buildCampScene(b, g, col, x, y, z, tents, opts = {}) {
  for (const [dx, dz, ry, c] of tents) { campTent(b, x + dx, y, z + dz, ry, c); col?.addCircle(x + dx, z + dz, 2); }
  campfire(b, g, x, y, z);
  const sp = opts.supplies || [[5, 3, 0.3], [-5, -9, 2.1]];
  for (const [dx, dz, ry] of sp) { supplies(b, x + dx, y, z + dz, ry); col?.addCircle(x + dx, z + dz, 1.1); }
  for (const [dx, dz] of opts.lanterns || [[-4, 4], [4, -6], [3, 7]]) lanternPost(b, g, x + dx, y, z + dz);
  for (const [dx, dz, ry, c] of opts.banners || [[6, -10, 0.2, 0x6a2a4a]]) banner(b, x + dx, y, z + dz, ry, c);
}

// portal de pedra bonito: plataforma em degraus, colunas com runas, arco, pedras rúnicas, braseiros e cristais.
// Devolve { ring, inner, shards } para animar (giram/pulsam). parent = grupo onde os meshes animados entram.
export function buildFancyPortal(b, g, col, parent, x, y, z, color, s = 1) {
  const stone = 0x4e4860, stoneD = 0x34303f, trim = 0x6a6280;
  b.cyl(x, y + 0.2, z, 6.2 * s, 0.4, stoneD, 12);
  b.cyl(x, y + 0.5, z, 5.0 * s, 0.3, stone, 12);
  for (const sg of [-1, 1]) {
    const cx = x + sg * 4.1 * s;
    b.box(cx, y + 0.95, z, 1.6 * s, 0.6, 1.6 * s, trim);
    b.box(cx, y + 3.9, z, 1.1 * s, 5.4, 1.1 * s, stone);
    b.box(cx, y + 6.75, z, 1.5 * s, 0.4, 1.5 * s, trim);
    for (let k = 0; k < 4; k++) g.box(cx, y + 1.9 + k * 1.15, z + 0.57 * s, 0.26, 0.26, 0.04, color);
    // braseiro em cima da coluna
    b.cyl(cx, y + 7.15, z, 0.55 * s, 0.4, 0x2a2630, 8);
    g.cone(cx, y + 7.75, z, 0.38 * s, 0.9, 0xffa850, 6);
    col?.addCircle(cx, z, 0.9 * s);
  }
  // arco de blocos
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (i / 8);
    b.box(x + Math.cos(a) * 4.1 * s, y + 6.6 + Math.sin(a) * 2.4 * s, z, 1.1 * s, 0.9, 1.2 * s, i % 2 ? stoneD : stone, 0, 0, a - Math.PI / 2);
  }
  g.addGeo(GEO.octa, x, y + 9.4 * s, z, 0.9, 1.4, 0.9, 0, 0, 0, color);
  // pedras rúnicas em volta
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26, rx = x + Math.cos(a) * 7.4 * s, rz = z + Math.sin(a) * 7.4 * s;
    if (Math.abs(Math.sin(a)) < 0.35) continue; // deixa a frente e o fundo livres
    b.box(rx, y + 1.1, rz, 0.9, 2.2, 0.5, stone, -a + Math.PI / 2, 0, 0.12 * (i % 2 ? 1 : -1));
    g.box(rx + Math.cos(a) * 0.27, y + 1.3, rz + Math.sin(a) * 0.27, 0.22, 0.6, 0.22, color);
    col?.addCircle(rx, rz, 0.6);
  }
  // véu, anel que gira por dentro e cristais flutuando
  const cy = y + 4.3;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(3.3 * s, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), transparent: true, opacity: 0.65, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.set(x, cy, z); inner.scale.y = 1.25; parent.add(inner);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2 * s, 3.2 * s, 6, 1, 0, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.set(x, cy, z + 0.05); ring.scale.y = 1.25; parent.add(ring);
  const ground = new THREE.Mesh(new THREE.RingGeometry(4.2 * s, 4.6 * s, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(x, y + 0.67, z); parent.add(ground);
  const shards = [];
  const shardGeo = new THREE.OctahedronGeometry(0.35 * s, 0), shardMat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(shardGeo, shardMat); m.scale.y = 1.8; parent.add(m); shards.push(m); }
  const anim = (t) => {
    inner.material.opacity = 0.5 + Math.sin(t * 2) * 0.15;
    ring.rotation.z = -t * 0.9;
    ground.material.opacity = 0.32 + Math.sin(t * 1.4) * 0.12;
    for (let i = 0; i < shards.length; i++) {
      const a = t * 0.5 + (i / shards.length) * Math.PI * 2;
      shards[i].position.set(x + Math.cos(a) * 5.6 * s, cy + 1.5 + Math.sin(t * 1.3 + i) * 0.6, z + Math.sin(a) * 2.2 * s);
      shards[i].rotation.y = t * 2 + i;
    }
  };
  return { inner, ring, ground, shards, anim, cy };
}
