import * as THREE from 'three';
import { Batch, GEO, vcLambert } from './batch.js';
import { Rng, mulberry32 } from '../core/rng.js';
import { CONFINS } from '../config/world.js';
import { confinsRawHeight } from './confins.js';

// =============================================================
// Megaestruturas dos Confins: castelos, cavernas, templo e círculo de pedras GIGANTES.
// - sem teto (a câmera de cima sempre vê o herói) e passagens largas (nada de corredor fino);
// - paredes sempre sólidas: só o pedaço que fica entre a câmera e o herói abre um buraco (não esconde o personagem);
// - montadas quando alguém chega perto e desmontadas longe (como os blocos do mapa).
// =============================================================
const OX = CONFINS.offset.x, OZ = CONFINS.offset.z;

// Paredes SEMPRE sólidas. Só abre um "buraco" redondo no pedaço de parede que fica ENTRE a câmera e o herói
// (para nunca esconder o personagem) — antes o castelo inteiro ficava meio invisível quando você chegava perto.
export const SEE = { uCam: { value: new THREE.Vector3(0, -9999, 0) }, uHero: { value: new THREE.Vector3(0, -9999, 0) } };
export function setSeeThrough(camPos, hero) { SEE.uCam.value.copy(camPos); SEE.uHero.value.set(hero.x, hero.y + 1.1, hero.z); }
function seeThrough(mat) {
  // v0.12.4: em vez de um círculo quadriculado, some a PEÇA inteira (pedra, parede, coluna) que está entre a câmera
  // e o herói. Só as que tapam; o chão (peças abaixo dos pés) nunca some.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = SEE.uCam; sh.uniforms.uHero = SEE.uHero;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPiece; varying vec4 vPiece;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPiece = aPiece;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPiece; uniform vec3 uCam; uniform vec3 uHero;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { vec3 ab = uHero - uCam; float L = length(ab); vec3 dr = ab / max(L, 0.001); vec3 pc = vPiece.xyz; float s = dot(pc - uCam, dr);
          if (vPiece.w > 0.0 && s > -vPiece.w && s < L - 0.4 && pc.y + vPiece.w * 0.5 > uHero.y - 0.6) {
            float r = length(pc - (uCam + dr * clamp(s, 0.0, L)));
            if (r < vPiece.w * 0.9 + 0.5) discard; } }`);
  };
  mat.customProgramCacheKey = () => 'see-piece-v1';
  return mat;
}
const LOAD = 330, UNLOAD = 520;

export class Megastructs {
  constructor(world) {
    this.world = world;
    this.built = new Map(); // id -> { group, cols, lights, wallMat, fade }
    this.list = CONFINS.structs || [];
  }

  update(px, pz, group) {
    for (const S of this.list) {
      const X = S.x + OX, Z = S.z + OZ, d = Math.hypot(px - X, pz - Z);
      const B = this.built.get(S.id);
      if (!B && d < S.r + LOAD) this.build(S, group);
      else if (B && d > S.r + UNLOAD) this.unload(S.id);
    }
  }

  unload(id) {
    const b = this.built.get(id); if (!b) return;
    b.group.parent?.remove(b.group);
    b.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const c of b.cols) this.world.col.remove(c);
    const L = this.world.lightSources; for (const s of b.lights) { const i = L.indexOf(s); if (i >= 0) L.splice(i, 1); }
    this.built.delete(id);
  }
  unloadAll() { for (const id of [...this.built.keys()]) this.unload(id); }

  build(S, parent) {
    if (S.h === undefined) confinsRawHeight(S.x, S.z); // calcula o platô
    const ctx = {
      S, X: S.x + OX, Z: S.z + OZ, y: S.h, T: S.theme, rng: new Rng(mulberry32(hashId(S.id))),
      walls: Object.assign(new Batch(), { piece: true }), deco: Object.assign(new Batch(), { piece: true }), glow: new Batch(), cols: [], lights: [],
    };
    const col = this.world.col;
    ctx.box = (x, z, hw, hd, rot = 0) => ctx.cols.push(col.addBox(ctx.X + x, ctx.Z + z, hw, hd, rot));
    ctx.circle = (x, z, r) => ctx.cols.push(col.addCircle(ctx.X + x, ctx.Z + z, r));
    ctx.light = (x, yy, z, color, dist = 24) => { const s = { x: ctx.X + x, y: ctx.y + yy, z: ctx.Z + z, color, intensity: 2.6, night: 6, dist, flicker: true, area: 'confins', kind: 'tocha' }; this.world.lightSources.push(s); ctx.lights.push(s); };
    if (S.kind === 'castelo') buildCastle(ctx);
    else if (S.kind === 'caverna') buildCavern(ctx);
    else if (S.kind === 'templo') buildTemple(ctx);
    else buildCircle(ctx);
    const group = new THREE.Group(); group.name = 'estrutura-' + S.id;
    const wallMat = seeThrough(vcLambert());
    const w = ctx.walls.build(wallMat, { name: S.id + '-paredes' }); if (w) group.add(w);
    const d = ctx.deco.build(seeThrough(vcLambert()), { name: S.id + '-deco' }); if (d) group.add(d);
    const g = ctx.glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }), { castShadow: false, receiveShadow: false, name: S.id + '-brilho' }); if (g) group.add(g);
    parent.add(group);
    this.built.set(S.id, { group, cols: ctx.cols, lights: ctx.lights, wallMat, fade: 1 });
  }
}

function hashId(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// parede reta de (x0,z0) a (x1,z1) com ameias no topo
function wall(c, x0, z0, x1, z1, H, T, color, color2, merlon = true) {
  const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) return;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rot = -Math.atan2(z1 - z0, x1 - x0);
  c.walls.box(c.X + mx, c.y + H / 2, c.Z + mz, len, H, T, color, rot);
  c.walls.box(c.X + mx, c.y + 0.6, c.Z + mz, len + 0.2, 1.2, T + 0.5, color2, rot); // rodapé
  if (merlon) for (let k = 1.5; k < len - 1; k += 3.2) {
    const f = k / len; c.walls.box(c.X + x0 + (x1 - x0) * f, c.y + H + 0.7, c.Z + z0 + (z1 - z0) * f, 1.5, 1.4, T + 0.2, color2, rot);
  }
  c.box(mx, mz, len / 2, T / 2 + 0.2, rot);
}
// lado do quadrado com portão no meio
function sideWithGate(c, ax, az, bx, bz, gate, H, T, col, col2) {
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, g0 = (len - gate) / 2;
  wall(c, ax, az, ax + ux * g0, az + uz * g0, H, T, col, col2);
  wall(c, ax + ux * (g0 + gate), az + uz * (g0 + gate), bx, bz, H, T, col, col2);
  return [ax + ux * g0, az + uz * g0, ax + ux * (g0 + gate), az + uz * (g0 + gate)];
}
function tower(c, x, z, r, H, col, roof, trim, ice) {
  c.walls.cyl(c.X + x, c.y + H / 2, c.Z + z, r, H, col, 12);
  c.walls.cyl(c.X + x, c.y + H + 0.6, c.Z + z, r + 0.8, 1.2, trim, 12);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; c.walls.box(c.X + x + Math.cos(a) * (r + 0.4), c.y + H + 1.8, c.Z + z + Math.sin(a) * (r + 0.4), 1.4, 1.4, 1.4, col, -a); }
  c.walls.cone(c.X + x, c.y + H + 2.2 + r * 0.75, c.Z + z, r + 1.2, r * 1.5, roof, 8);
  if (ice) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; c.glow.addGeo(GEO.octa, c.X + x + Math.cos(a) * r * 0.9, c.y + H * (0.4 + (k % 2) * 0.2), c.Z + z + Math.sin(a) * r * 0.9, 1.2, 5, 1.2, 0, a, 0.3, 0x9fe8ff); }
  c.circle(x, z, r + 0.3);
}
function banner(c, x, z, rot, H, colr, trim) {
  c.deco.box(c.X + x, c.y + H, c.Z + z, 2.4, 5, 0.15, colr, rot);
  c.deco.box(c.X + x, c.y + H + 2.6, c.Z + z, 2.8, 0.3, 0.3, trim, rot);
  c.deco.cone(c.X + x, c.y + H - 2.9, c.Z + z, 1.2, 0.8, colr, 4, rot, Math.PI);
}
function brazier(c, x, z, glowC, light) {
  c.deco.cyl(c.X + x, c.y + 0.9, c.Z + z, 0.5, 1.8, 0x3a3030, 8);
  c.deco.cyl(c.X + x, c.y + 1.9, c.Z + z, 1.1, 0.5, 0x2a2424, 8);
  c.glow.cone(c.X + x, c.y + 2.6, c.Z + z, 0.8, 1.6, glowC, 6);
  c.circle(x, z, 1.1);
  if (light) c.light(x, 3, z, glowC);
}

// ---------------- Castelo (dourado nas Planícies, de gelo na Tundra) ----------------
function buildCastle(c) {
  const { S, T, rng } = c, A = S.r * 0.78, H = T.ice ? 10.5 : 9, Th = 3.2, gate = 22;
  // pátio calçado
  for (let i = -A + 6; i < A; i += 12) for (let j = -A + 6; j < A; j += 12) c.deco.box(c.X + i, c.y + 0.05, c.Z + j, 11.6, 0.12, 11.6, rng.chance(0.5) ? T.wall2 : T.wall, 0);
  // muralha externa com 4 portões largos
  const gates = [
    sideWithGate(c, -A, A, A, A, gate, H, Th, T.wall, T.wall2),     // sul (entrada)
    sideWithGate(c, A, -A, -A, -A, gate, H, Th, T.wall, T.wall2),   // norte
    sideWithGate(c, A, A, A, -A, gate - 4, H, Th, T.wall, T.wall2), // leste
    sideWithGate(c, -A, -A, -A, A, gate - 4, H, Th, T.wall, T.wall2), // oeste
  ];
  for (const [x, z] of [[-A, -A], [A, -A], [A, A], [-A, A]]) tower(c, x, z, 8, H + 7, T.wall, T.roof, T.trim, T.ice);
  for (const [ax, az, bx, bz] of gates) { tower(c, ax, az, 4.6, H + 4, T.wall, T.roof, T.trim, T.ice); tower(c, bx, bz, 4.6, H + 4, T.wall, T.roof, T.trim, T.ice); }
  // estandartes na face interna das muralhas
  for (let k = -A + 18; k < A - 10; k += 26) { if (Math.abs(k) < gate) continue; banner(c, k, A - Th, 0, H - 2, T.banner, T.trim); banner(c, k, -A + Th, Math.PI, H - 2, T.banner, T.trim); }
  // fortaleza central (aberta em cima), porta larga ao sul
  const kw = 34, kd = 28, kz = -14, kH = H - 1;
  wall(c, -kw, kz - kd, kw, kz - kd, kH, 2.6, T.wall, T.wall2);
  wall(c, -kw, kz - kd, -kw, kz + kd, kH, 2.6, T.wall, T.wall2);
  wall(c, kw, kz - kd, kw, kz + kd, kH, 2.6, T.wall, T.wall2);
  wall(c, -kw, kz + kd, -9, kz + kd, kH, 2.6, T.wall, T.wall2);
  wall(c, 9, kz + kd, kw, kz + kd, kH, 2.6, T.wall, T.wall2);
  for (const [x, z] of [[-kw, kz - kd], [kw, kz - kd], [-kw, kz + kd], [kw, kz + kd]]) tower(c, x, z, 5, kH + 6, T.wall, T.roof, T.trim, T.ice);
  // salão do trono: colunas, tapete, trono
  for (let z = kz - kd + 9; z < kz + kd - 4; z += 11) for (const x of [-16, 16]) { c.walls.cyl(c.X + x, c.y + 3.8, c.Z + z, 1.3, 7.6, T.wall2, 8); c.walls.box(c.X + x, c.y + 7.8, c.Z + z, 3.2, 0.8, 3.2, T.trim, 0); c.circle(x, z, 1.4); }
  c.deco.box(c.X, c.y + 0.12, c.Z + kz + 4, 7, 0.1, kd * 2 - 12, T.banner, 0);
  c.deco.box(c.X, c.y + 0.35, c.Z + kz - kd + 7, 22, 0.6, 9, T.wall2, 0);
  c.walls.box(c.X, c.y + 2.4, c.Z + kz - kd + 6, 3.4, 4.2, 2.4, T.trim, 0); c.walls.box(c.X, c.y + 5.2, c.Z + kz - kd + 5.4, 3.8, 2, 0.8, T.trim, 0); c.box(0, kz - kd + 6, 1.8, 1.4);
  c.glow.addGeo(GEO.octa, c.X, c.y + 7.4, c.Z + kz - kd + 5.6, 1.2, 1.6, 1.2, 0, 0, 0, T.glow); c.light(0, 6, kz - kd + 8, T.glow, 30);
  // pátio: fonte, braseiros, casas sem teto (paredes baixas) e estátuas
  c.walls.cyl(c.X, c.y + 0.6, c.Z + 48, 7, 1.2, T.wall2, 16); c.glow.cyl(c.X, c.y + 1.05, c.Z + 48, 6, 0.2, T.ice ? 0xbfefff : 0x6ac8ff, 16);
  c.walls.cyl(c.X, c.y + 2.5, c.Z + 48, 1, 4, T.wall, 8); c.glow.addGeo(GEO.sphere, c.X, c.y + 4.8, c.Z + 48, 1.4, 1.4, 1.4, 0, 0, 0, T.glow); c.circle(0, 48, 7.2); c.light(0, 4, 48, T.glow);
  for (const [x, z, l] of [[-24, 66, 1], [24, 66, 0], [-58, 20, 1], [58, 20, 0], [-58, -50, 0], [58, -50, 1], [-24, 30, 0], [24, 30, 0]]) brazier(c, x, z, T.glow, !!l);
  for (const [x, z, w, d] of [[-62, 58, 16, 12], [62, 58, 16, 12], [-62, -24, 14, 18], [62, -24, 14, 18]]) {
    const hH = 3.4; // casinhas abertas (paredes baixas, sem teto)
    wall(c, x - w / 2, z - d / 2, x + w / 2, z - d / 2, hH, 1.2, T.wall2, T.wall, false);
    wall(c, x - w / 2, z - d / 2, x - w / 2, z + d / 2, hH, 1.2, T.wall2, T.wall, false);
    wall(c, x + w / 2, z - d / 2, x + w / 2, z + d / 2, hH, 1.2, T.wall2, T.wall, false);
    wall(c, x - w / 2, z + d / 2, x - 2, z + d / 2, hH, 1.2, T.wall2, T.wall, false);
    for (let k = 0; k < 3; k++) c.deco.box(c.X + x + rng.range(-w / 3, w / 3), c.y + 0.6, c.Z + z + rng.range(-d / 3, d / 3), 1.4, 1.2, 1.4, 0x6a4a2a, rng.range(0, 3)); // caixotes
  }
  for (const [x, z] of [[-14, 64], [14, 64]]) { c.walls.box(c.X + x, c.y + 1, c.Z + z, 3, 2, 3, T.wall2, 0); c.walls.box(c.X + x, c.y + 4.4, c.Z + z, 1.8, 4.8, 1.8, T.wall, 0); c.walls.box(c.X + x, c.y + 7.4, c.Z + z, 1.4, 1.4, 1.4, T.trim, 0); c.box(x, z, 1.6, 1.6); }
}

// ---------------- Caverna gigante (aberta em cima): magma, cristal ou brejo ----------------
function buildCavern(c) {
  const { S, T, rng } = c, R = S.r * 0.9, N = 44;
  const openAt = [Math.PI / 2, -Math.PI / 2], openW = 0.13; // sul e norte, ~30 m de largura
  const isOpen = (a) => openAt.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < openW);
  c.deco.cyl(c.X, c.y + 0.06, c.Z, R + 4, 0.1, T.rock2, 24); // chão de pedra escura
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    if (isOpen(a)) continue;
    const x = Math.cos(a) * R, z = Math.sin(a) * R, w = rng.range(22, 30), h = rng.range(26, 44);
    c.walls.addGeo(GEO.dodeca, c.X + x, c.y + h * 0.42, c.Z + z, w, h, rng.range(16, 22), rng.range(-0.15, 0.15), -a + Math.PI / 2, rng.range(-0.1, 0.1), rng.chance(0.5) ? T.rock : T.rock2);
    c.walls.addGeo(GEO.dodeca, c.X + Math.cos(a) * (R + 16), c.y + h * 0.5, c.Z + Math.sin(a) * (R + 16), w * 1.2, h * 1.25, 20, 0, -a, 0, T.rock); // anel de fora (silhueta)
    c.circle(x, z, 10.5);
    if (k % 3 === 0) { c.glow.addGeo(GEO.octa, c.X + Math.cos(a) * (R - 9), c.y + rng.range(3, 9), c.Z + Math.sin(a) * (R - 9), 1.6, 6, 1.6, rng.range(-0.4, 0.4), a, rng.range(-0.4, 0.4), T.crystal); }
  }
  // entradas: rochas enormes dos lados formando a "boca" da caverna
  for (const o of openAt) for (const sd of [-1, 1]) {
    const a = o + sd * (openW + 0.03), x = Math.cos(a) * (R + 6), z = Math.sin(a) * (R + 6);
    c.walls.addGeo(GEO.dodeca, c.X + x, c.y + 18, c.Z + z, 20, 46, 20, 0, a, sd * 0.12, T.rock); c.circle(x, z, 9);
    c.glow.addGeo(GEO.octa, c.X + Math.cos(o) * (R - 2) + sd * 14 * -Math.sin(o), c.y + 4, c.Z + Math.sin(o) * (R - 2) + sd * 14 * Math.cos(o), 2, 7, 2, 0, 0, 0, T.glow);
    c.light(Math.cos(o) * (R - 6), 5, Math.sin(o) * (R - 6), T.glow, 26);
  }
  // coluna central gigante
  c.walls.addGeo(GEO.dodeca, c.X, c.y + 20, c.Z, 20, 48, 20, 0, 0.4, 0, T.rock); c.circle(0, 0, 9.5);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; c.glow.addGeo(GEO.octa, c.X + Math.cos(a) * 9, c.y + 10 + k * 3, c.Z + Math.sin(a) * 9, 2.2, 9, 2.2, Math.cos(a) * 0.5, a, Math.sin(a) * 0.5, T.crystal); }
  c.light(0, 10, 14, T.crystal, 32);
  // poças (lava / água) — não dá para entrar
  const pools = [[-48, -30, 13], [52, 26, 11], [-30, 58, 9], [44, -58, 12], [70, -12, 8]];
  for (const [x, z, r] of pools) {
    c.walls.cyl(c.X + x, c.y + 0.35, c.Z + z, r + 1.6, 0.7, T.rock2, 16);
    c.glow.cyl(c.X + x, c.y + 0.55, c.Z + z, r, 0.2, T.pool, 16);
    c.circle(x, z, r + 1.2); c.light(x, 2, z, T.pool, 22);
  }
  // estalagmites e cristais espalhados (deixando caminhos largos)
  for (let n = 0; n < 34; n++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(22, R - 20), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (pools.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + 8) || Math.abs(x) < 10) continue;
    const s = rng.range(1.6, 3.6), h = rng.range(6, 16);
    c.walls.cone(c.X + x, c.y + h / 2, c.Z + z, s, h, rng.chance(0.5) ? T.rock : T.rock2, 6, rng.range(0, 3));
    c.circle(x, z, s * 0.8);
    if (rng.chance(0.45)) c.glow.addGeo(GEO.octa, c.X + x + s, c.y + 1.4, c.Z + z, 0.8, 2.6, 0.8, 0.3, 0, 0.2, T.crystal);
  }
}

// ---------------- Templo-pirâmide (Deserto) ----------------
function buildTemple(c) {
  const { S, T, rng } = c, A = S.r * 0.8, H = 6.5, gate = 26;
  for (let i = -A + 8; i < A; i += 16) for (let j = -A + 8; j < A; j += 16) c.deco.box(c.X + i, c.y + 0.05, c.Z + j, 15.5, 0.1, 15.5, rng.chance(0.5) ? T.wall : T.wall2, 0);
  sideWithGate(c, -A, A, A, A, gate, H, 3, T.wall, T.wall2); sideWithGate(c, A, -A, -A, -A, gate, H, 3, T.wall, T.wall2);
  sideWithGate(c, A, A, A, -A, gate, H, 3, T.wall, T.wall2); sideWithGate(c, -A, -A, -A, A, gate, H, 3, T.wall, T.wall2);
  for (const [x, z] of [[-A, -A], [A, -A], [A, A], [-A, A]]) { c.walls.box(c.X + x, c.y + 9, c.Z + z, 4, 18, 4, T.wall2, 0); c.walls.cone(c.X + x, c.y + 19.5, c.Z + z, 2.8, 3, T.trim, 4, Math.PI / 4); c.box(x, z, 2.2, 2.2); }
  // pirâmide em degraus (sólida) com escadaria ao sul
  const tiers = 6; let w = 62;
  for (let t = 0; t < tiers; t++) { c.walls.box(c.X, c.y + 2.6 + t * 5.2, c.Z - 10, w, 5.2, w, t % 2 ? T.wall2 : T.wall, 0); w -= 9; }
  // escadaria: rampa de 45° na face sul + degraus marcados
  c.walls.box(c.X, c.y + 15.2, c.Z + 5.6, 14, 2, 44, T.wall2, 0, Math.PI / 4);
  for (let k = 1; k < 15; k++) c.walls.box(c.X, c.y + k * 2.08, c.Z + 21 - k * 2.08 + 0.5, 14.4, 0.4, 1.2, T.trim, 0);
  c.walls.box(c.X, c.y + 33.6, c.Z - 10, 8, 4, 8, T.trim, 0);
  c.glow.addGeo(GEO.octa, c.X, c.y + 39, c.Z - 10, 3.2, 6, 3.2, 0, 0.5, 0, T.glow); c.light(0, 34, -6, T.glow, 40);
  c.box(0, -10, 31, 31);
  // avenida de obeliscos e estátuas de escorpião
  for (let z = 30; z < A - 8; z += 13) for (const sd of [-1, 1]) {
    c.walls.box(c.X + sd * 14, c.y + 5, c.Z + z, 2.2, 10, 2.2, T.wall2, 0); c.walls.cone(c.X + sd * 14, c.y + 10.8, c.Z + z, 1.6, 1.6, T.trim, 4, Math.PI / 4); c.circle(sd * 14, z, 1.6);
  }
  for (const [x, z] of [[-44, 44], [44, 44], [-44, -60], [44, -60]]) {
    c.walls.box(c.X + x, c.y + 1.5, c.Z + z, 8, 3, 12, T.wall2, 0); c.walls.box(c.X + x, c.y + 4, c.Z + z - 4, 5, 3, 4, T.wall, 0);
    for (const sd of [-1, 1]) c.walls.box(c.X + x + sd * 5, c.y + 2.6, c.Z + z - 7, 1.6, 1.2, 5, T.wall, sd * 0.4);
    c.walls.box(c.X + x, c.y + 7, c.Z + z + 6, 1.4, 6, 1.4, T.wall, 0, -0.5); c.box(x, z, 4.4, 6.4);
    brazier(c, x, z + 10, T.glow, true);
  }
  // espelhos d'água
  for (const sd of [-1, 1]) { c.walls.box(c.X + sd * 46, c.y + 0.3, c.Z + 12, 18, 0.6, 30, T.wall2, 0); c.glow.box(c.X + sd * 46, c.y + 0.55, c.Z + 12, 16, 0.2, 28, 0x3aa8b8, 0); c.box(sd * 46, 12, 9, 15); }
}

// ---------------- Círculo de pedras gigante (Floresta) ----------------
function buildCircle(c) {
  const { S, T, rng } = c;
  c.deco.cyl(c.X, c.y + 0.05, c.Z, S.r * 0.92, 0.1, 0x4a5a3a, 28);
  const ring = (R, n, h) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.2, cx = Math.cos(a) * R, cz = Math.sin(a) * R, tx = -Math.sin(a), tz = Math.cos(a);
      if (rng.chance(0.12)) { c.walls.box(c.X + cx, c.y + 1.6, c.Z + cz, 12, 3.2, 3.4, T.wall2, -a + 0.4, 0, 0.1); c.box(cx, cz, 6, 1.8, -a + 0.4); continue; } // caída
      for (const sd of [-1, 1]) { const x = cx + tx * sd * 4.2, z = cz + tz * sd * 4.2; c.walls.box(c.X + x, c.y + h / 2, c.Z + z, 3.4, h, 3.4, rng.chance(0.5) ? T.wall : T.wall2, -a); c.circle(x, z, 2.1); }
      c.walls.box(c.X + cx, c.y + h + 1.2, c.Z + cz, 12.5, 2.4, 3.8, T.wall, -a + Math.PI / 2);
      c.deco.box(c.X + cx, c.y + h + 2.5, c.Z + cz, 11, 0.4, 3.2, T.moss, -a + Math.PI / 2);
      c.glow.addGeo(GEO.box, c.X + cx + tx * 4.2, c.y + h * 0.55, c.Z + cz + tz * 4.2, 0.4, 2.4, 3.5, 0, -a, 0, T.glow);
    }
  };
  ring(S.r * 0.8, 16, 15); ring(S.r * 0.45, 9, 12);
  // altar central
  c.walls.cyl(c.X, c.y + 0.8, c.Z, 12, 1.6, T.wall2, 16); c.walls.cyl(c.X, c.y + 2, c.Z, 7, 1, T.wall, 16);
  c.glow.addGeo(GEO.octa, c.X, c.y + 9, c.Z, 4.5, 11, 4.5, 0, 0.3, 0, T.glow); c.circle(0, 0, 7.5);
  c.light(0, 8, 0, T.glow, 36);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.glow.addGeo(GEO.sphere, c.X + Math.cos(a) * 16, c.y + 0.5, c.Z + Math.sin(a) * 16, 1.2, 0.8, 1.2, 0, 0, 0, T.glow); }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; c.light(Math.cos(a) * S.r * 0.62, 3, Math.sin(a) * S.r * 0.62, T.glow, 22); brazier(c, Math.cos(a) * S.r * 0.62, Math.sin(a) * S.r * 0.62, T.glow, false); }
}
