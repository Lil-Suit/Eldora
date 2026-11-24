// =============================================================
// Ultra realismo — ÁRVORES e VEGETAÇÃO GRANDE (só no gráfico "Ultra realismo"; nas outras qualidades nada disto
// existe nem pesa). build(world): monta na 1ª vez que o Ultra liga (cada mapa só quando você entra nele com o Ultra).
// toggle(world, on): esconde as árvores simples e mostra as detalhadas (e o contrário). update(...): por quadro, com o Ultra.
//
// As árvores detalhadas ficam nas MESMAS posições/tamanhos das simples (as colisões não mudam): cada tipo vira um
// modelo procedural (tree_gen.js) desenhado por instâncias, em 2 faixas de distância — perto (casca, raízes, galhos e
// cachos de folhas; 2 variações de carvalho/pinheiro) e longe (modelo leve). A escolha da faixa e o corte do
// que está fora da tela são feitos aqui, por instância, só quando a câmera mexe.
// As simples: Vale = malhas instanciadas (some/volta); Ermos/Confins = fim das malhas de vegetação (setDrawRange);
// árvores mortas do Planalto e da Planície (no lote de estruturas) = vértices recolhidos enquanto o Ultra está ligado.
// =============================================================
import * as THREE from 'three';
import { makeLeafAtlas, makeBarkTex } from './veg_tex.js';
import { makeTemplates } from './tree_gen.js';
import { makeTreeMaterials } from './tree_mat.js';

const STRIDE = 16;
const ST = new WeakMap();
// famílias: modelo(s) de perto (variações) e o de longe (null = some além de maxD)
const FAM = {
  oak: { near: ['oak', 'oak2'], far: 'oak' }, pine: { near: ['pine', 'pine2'], far: 'pine' }, birch: { near: ['birch'], far: 'birch' },
  bush: { near: ['bush'], far: 'bush' }, dead: { near: ['dead'], far: 'dead' }, swamp: { near: ['swamp'], far: 'swamp' },
  cactus: { near: ['cactus'], far: 'cactus' }, twig: { near: ['twig'], far: null }, tuft: { near: ['tuft'], far: null },
  reeds: { near: ['reeds'], far: null }, mush: { near: ['mush'], far: null },
};
const FAM_N = Object.keys(FAM), FAM_I = Object.fromEntries(FAM_N.map((k, i) => [k, i]));
const _c = new THREE.Color(), _c2 = new THREE.Color();
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// ---------------- área: lista de instâncias + malhas por família/faixa ----------------
class Area {
  constructor(S, name, group) {
    this.S = S; this.name = name; this.group = group; this.n = 0; this.cap = 0;
    this.recs = null; this.fam = null; this.vari = null; this.cy = null; this.rad = null;
    this.buckets = []; this.dirty = true; this.last = new Float32Array(6).fill(1e9); this.hideOld = () => {};
    this.grow(512);
  }
  grow(n) {
    if (n <= this.cap) return;
    const cap = Math.max(n, this.cap * 2), r = new Float32Array(cap * STRIDE), f = new Uint8Array(cap), v = new Uint8Array(cap), cy = new Float32Array(cap), rad = new Float32Array(cap);
    if (this.recs) { r.set(this.recs); f.set(this.fam); v.set(this.vari); cy.set(this.cy); rad.set(this.rad); }
    Object.assign(this, { recs: r, fam: f, vari: v, cy, rad, cap });
  }
  // fam, posição, giro, cor da folha (Color linear), escala, cor da casca, escala Y, neve, copa (0/1), brilho
  add(fam, x, y, z, rot, leaf, s, bark, sy = 1, snow = 0, crown = 1, glow = 0) {
    this.grow(this.n + 1);
    const i = this.n++, o = i * STRIDE, R = this.recs, T = this.S.tpl, F = FAM[fam], h = hash(x, z);
    R[o] = x; R[o + 1] = y; R[o + 2] = z; R[o + 3] = rot;
    R[o + 4] = leaf.r; R[o + 5] = leaf.g; R[o + 6] = leaf.b; R[o + 7] = s;
    R[o + 8] = bark.r; R[o + 9] = bark.g; R[o + 10] = bark.b; R[o + 11] = sy;
    R[o + 12] = snow; R[o + 13] = h; R[o + 14] = crown; R[o + 15] = glow;
    this.fam[i] = FAM_I[fam]; this.vari[i] = Math.floor(hash(z * 1.7, x * 0.9) * F.near.length) % F.near.length;
    const t = T[F.near[0]];
    this.cy[i] = t.cy * s * sy; this.rad[i] = t.rad * s * Math.max(1, sy);
  }
  bucket(fi, k, geo, cap, shadow) {
    // k: 0..n variações de perto, 8 = longe
    const key = fi * 16 + k;
    let B = this.buckets[key];
    if (B && B.cap >= cap) return B;
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index; for (const a in geo.attributes) g.setAttribute(a, geo.attributes[a]);
    const c2 = Math.max(32, 1 << Math.ceil(Math.log2(cap * 1.2)));
    const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(c2 * STRIDE), STRIDE, 1); buf.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', new THREE.InterleavedBufferAttribute(buf, 4, 0)); g.setAttribute('iB', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(buf, 4, 8)); g.setAttribute('iD', new THREE.InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    if (B) { // aumentou: troca a geometria e solta só o buffer antigo (os atributos do modelo são compartilhados)
      const og = B.mesh.geometry; for (const a of Object.keys(og.attributes)) if (!a.startsWith('i')) og.deleteAttribute(a); og.setIndex(null); og.dispose();
      B.mesh.geometry = g; Object.assign(B, { g, buf, cap: c2, n: 0 });
      return B;
    }
    const mesh = new THREE.Mesh(g, this.S.mat.main);
    mesh.customDepthMaterial = this.S.mat.depth; mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.name = 'ultra-arvore-' + FAM_N[fi] + '-' + k; mesh.visible = false;
    this.group.add(mesh);
    B = this.buckets[key] = { mesh, g, buf, cap: c2, n: 0 };
    return B;
  }
  // garante as malhas para o que existe na área (perto: cada variação; longe: o modelo leve)
  ensure() {
    const cnt = new Array(FAM_N.length).fill(0);
    for (let i = 0; i < this.n; i++) cnt[this.fam[i]]++;
    const T = this.S.tpl;
    this.slots = [];
    for (let fi = 0; fi < FAM_N.length; fi++) {
      if (!cnt[fi]) { this.slots[fi] = null; continue; }
      const F = FAM[FAM_N[fi]];
      const small = !F.far; // capim, juncos, cogumelos, gravetos: sem sombra própria (1 desenho só)
      const near = F.near.map((nm, k) => this.bucket(fi, k, T[nm].near, cnt[fi], !small));
      const far = F.far ? this.bucket(fi, 8, T[F.far].far, cnt[fi], true) : null;
      this.slots[fi] = { near, far, maxD: T[F.near[0]].maxD || 0 };
    }
    this.dirty = true;
  }
  setVisible(v) { for (const B of this.buckets) if (B) B.mesh.visible = v && B.n > 0; }
}

// ---------------- montagem de cada mapa ----------------
const lin = (hex, k = 1) => _c.set(hex).multiplyScalar(k).clone();
function vary(hex, x, z, amt) { return lin(hex, 1 + Math.sin(x * 12.9 + z * 78.2) * 0.5 * amt); }

// árvores mortas no lote de estruturas (cor 0x2e2633, 3 cilindros de 8 lados = 288 vértices cada): acha e recolhe
function scanDead(mesh) {
  const g = mesh?.geometry; if (!g || g.index || !g.attributes.color) return null;
  const P = g.attributes.position, C = g.attributes.color, tc = new THREE.Color(0x2e2633), n = P.count;
  const m = (i) => Math.abs(C.getX(i) - tc.r) < 1e-4 && Math.abs(C.getY(i) - tc.g) < 1e-4 && Math.abs(C.getZ(i) - tc.b) < 1e-4;
  const trees = [], runs = [];
  for (let i = 0; i < n;) {
    if (!m(i)) { i++; continue; }
    let j = i; while (j < n && m(j)) j++;
    if ((j - i) % 288 === 0) {
      runs.push([i, j, P.array.slice(i * 3, j * 3)]);
      for (let k = i; k < j; k += 288) {
        let x = 0, z = 0, y0 = 1e9, y1 = -1e9;
        for (let q = k; q < k + 96; q++) { x += P.getX(q); z += P.getZ(q); y0 = Math.min(y0, P.getY(q)); y1 = Math.max(y1, P.getY(q)); }
        trees.push({ x: x / 96, z: z / 96, y: y0, h: y1 - y0 });
      }
    }
    i = j;
  }
  if (!trees.length) return null;
  return {
    trees,
    set(on) {
      if (mesh.geometry !== g) return;
      for (const [a, b, orig] of runs) {
        if (on) for (let q = a; q < b; q++) P.setXYZ(q, orig[0], orig[1], orig[2]);
        else P.array.set(orig, a * 3);
      }
      P.needsUpdate = true;
    },
  };
}

// árvore de marco no lote de estruturas: tronco (cilindro de 8 lados, 96 vértices) logo antes da copa (icosaedros)
function scanLandmark(mesh, trunkHex, crownHex) {
  const g = mesh?.geometry; if (!g || g.index || !g.attributes.color) return null;
  const P = g.attributes.position, C = g.attributes.color, n = P.count, t = new THREE.Color(trunkHex), c = new THREE.Color(crownHex);
  const is = (i, k) => Math.abs(C.getX(i) - k.r) < 1e-4 && Math.abs(C.getY(i) - k.g) < 1e-4 && Math.abs(C.getZ(i) - k.b) < 1e-4;
  for (let i = 96; i < n; i++) {
    if (!is(i, c) || is(i - 1, c) || !is(i - 1, t) || !is(i - 96, t)) continue;
    let j = i; while (j < n && is(j, c)) j++;
    const a = i - 96, orig = P.array.slice(a * 3, j * 3);
    let x = 0, z = 0, y0 = 1e9, top = -1e9, rx = 0;
    for (let q = a; q < i; q++) { x += P.getX(q); z += P.getZ(q); y0 = Math.min(y0, P.getY(q)); }
    x /= 96; z /= 96;
    for (let q = i; q < j; q++) { top = Math.max(top, P.getY(q)); rx = Math.max(rx, Math.hypot(P.getX(q) - x, P.getZ(q) - z)); }
    return { x, z, y: y0, top, rx, set(on) { if (mesh.geometry !== g) return; if (on) for (let q = a; q < j; q++) P.setXYZ(q, orig[0], orig[1], orig[2]); else P.array.set(orig, a * 3); P.needsUpdate = true; } };
  }
  return null;
}

function buildVale(S, W) {
  const A = new Area(S, 'world', W.group), V = W.vegUltra;
  const hides = [];
  if (V) {
    const T = V.trees;
    for (const o of T.pine) A.add('pine', o.x, o.y, o.z, o.r, vary(o.y > 12 ? 0x2e5a3c : 0x2f6b3a, o.x, o.z, 0.25), o.s, vary(0x4a3c32, o.x, o.z, 0.12));
    for (const o of T.snowpine) A.add('pine', o.x, o.y, o.z, o.r, vary(0x24503a, o.x, o.z, 0.2), o.s, vary(0x4a3c32, o.x, o.z, 0.12), 1, 1);
    for (const o of T.oak) A.add('oak', o.x, o.y, o.z, o.r, o.gold ? vary(0xd09a35, o.x, o.z, 0.3) : vary(0x4f8f3a, o.x, o.z, 0.3), o.s, vary(0x5a3b24, o.x, o.z, 0.12));
    for (const o of T.corrupt) A.add('oak', o.x, o.y, o.z, o.r, vary(0x6a3d8a, o.x, o.z, 0.3), o.s, lin(0x2e2633));
    for (const o of T.birch) A.add('birch', o.x, o.y, o.z, o.r, vary(0x8cc063, o.x, o.z, 0.25), o.s, lin(0xe8e4da));
    for (const o of V.bushes) A.add('bush', o.x, o.y, o.z, o.x, vary(0x4f8a3a, o.x, o.z, 0.3), o.s, lin(0x4a3424));
    hides.push((on) => { for (const m of V.simple) m.visible = !on; });
  }
  const sd = scanDead(W.group.getObjectByName('estatico'));
  if (sd) {
    for (const t of sd.trees) A.add('dead', t.x, t.y, t.z, hash(t.x, t.z) * 6.28, lin(0x3a3a4a), t.h / 4.1, lin(0x2e2633), 1, 0, 0);
    hides.push((on) => sd.set(on));
  }
  // árvore antiga da colina (dourada) e a árvore dourada da ilha: carvalhos grandes no mesmo lugar e tamanho
  for (const [tr, cr, leaf, bark] of [[0x5a3b24, 0xd09a35, 0xd09a35, 0x5a3b24], [0x6b4a2e, 0xf0c95a, 0xe8c050, 0x6b4a2e]]) {
    const L = scanLandmark(W.group.getObjectByName('estatico'), tr, cr); if (!L) continue;
    const s = (L.rx * 0.92) / 1.95, sy = (L.top - L.y) / (4.95 * s);
    A.add('oak', L.x, L.y, L.z, hash(L.x, L.z) * 6.28, lin(leaf), s, lin(bark), sy);
    hides.push((on) => L.set(on));
  }
  A.hideOld = (on) => { for (const f of hides) f(on); };
  return A;
}

function buildGuardiao(S, W) {
  if (!W.plainGroup) return null;
  const A = new Area(S, 'guardiao', W.plainGroup);
  const sd = scanDead(W.plainGroup.getObjectByName('estatico-guardiao'));
  if (sd) {
    for (const t of sd.trees) A.add('dead', t.x, t.y, t.z, hash(t.x, t.z) * 6.28, lin(0x3a3a4a), t.h / 4.1, lin(0x2e2633), 1, 0, 0);
    A.hideOld = (on) => sd.set(on);
  }
  return A;
}

function buildErmos(S, W) {
  const G = W.ermosGroup; if (!G) return null;
  const A = new Area(S, 'ermos', G), meshes = [];
  for (const m of G.children) {
    const U = m.userData.ultraVeg; if (!U) continue;
    meshes.push(m);
    const L = U.list;
    for (let k = 0; k < L.length; k += 7) {
      const [kind, x, y, z, s, rot, col] = L.subarray(k, k + 7);
      if (kind === 0) A.add('dead', x, y, z, rot, lin(col || 0x3a3a4a, 1.6), s, lin(0x2e2630), 1, 0, col ? 1 : 0);
      else A.add('twig', x, y, z, rot, lin(col), 1, lin(col, 0.8));
    }
  }
  A.hideOld = (on) => { for (const m of meshes) m.geometry.setDrawRange(0, on ? m.userData.ultraVeg.start : Infinity); };
  return A;
}

// Confins: registros [tipo, x, y, z, s, giro, cor] de cada bloco (confins.js prop())
function addConfins(A, L) {
  for (let k = 0; k < L.length; k += 7) {
    const kind = L[k], x = L[k + 1], y = L[k + 2], z = L[k + 3], s = L[k + 4], rot = L[k + 5], col = L[k + 6], h = hash(x, z) * 6.28;
    switch (kind) {
      case 10: case 11: A.add('oak', x, y, z, h, lin(col), s * 0.92, lin(kind === 10 ? 0x6a4a2a : 0x4a3424), 1.21); break;
      case 12: A.add('pine', x, y, z, h, lin(col), s * 1.06, lin(0x4a3424), 1.28); break;
      case 13: A.add('swamp', x, y, z, h, lin(col), s, lin(0x3a3428)); break;
      case 14: A.add('cactus', x, y, z, 0, lin(0x5a8a3a), s, lin(0x5a8a3a)); break;
      case 15: A.add('pine', x, y, z, h, lin(col), s, lin(0x4a3a30), 1.11, 1); break;
      case 16: A.add('dead', x, y, z, h, lin(0x222222), s * 0.72, lin(0x1a1414), 1, 0, 0); break;
      case 17: A.add('tuft', x, y, z, rot, lin(col), 1, lin(col)); break;
      case 18: A.add('reeds', x, y, z, rot, lin(col), 1, lin(col)); break;
      case 19: A.add('mush', x, y, z, rot, lin(col), 1, lin(0xd8d0b0), 1, 0, 1, 1); break;
      case 20: A.add('bush', x, y, z, rot, lin(col), 0.68, lin(0x3a3020)); break;
      case 21: A.add('mush', x, y, z, rot, lin(col), 0.62, lin(0xd8d8c8), 1, 0, 1, 1); break;
      default: break;
    }
  }
}
function buildConfins(S, W) {
  const C = W.confins; if (!C?.group) return null;
  const A = new Area(S, 'confins', C.group);
  const each = (on) => { for (const c of C.chunks.values()) for (const o of c.objs) if (o.userData.ultraStart !== undefined) o.geometry.setDrawRange(0, on ? o.userData.ultraStart : Infinity); };
  A.rebuild = () => { A.n = 0; for (const c of C.chunks.values()) if (c.ultraList) addConfins(A, c.ultraList); A.ensure(); if (S.on) each(true); };
  A.hideOld = each;
  C.ultraTrees = { chunk: () => { S.confDirty = true; }, unload: () => { S.confDirty = true; } };
  A.rebuild();
  return A;
}

function getArea(S, W, area) {
  if (area in S.areas) return S.areas[area];
  const A = area === 'world' ? buildVale(S, W) : area === 'guardiao' ? buildGuardiao(S, W) : area === 'ermos' ? buildErmos(S, W) : area === 'confins' ? buildConfins(S, W) : null;
  if (A && area !== 'confins') A.ensure();
  if (A && S.on) A.hideOld(true);
  S.areas[area] = A;
  return A;
}

// ---------------- escolha de faixa + corte por instância (só quando a câmera mexe) ----------------
const _m = new THREE.Matrix4(), _fr = new THREE.Frustum();
function cull(S, A, cam) {
  const p = cam.position, e = cam.matrixWorld.elements, L = A.last;
  const moved = Math.abs(p.x - L[0]) + Math.abs(p.y - L[1]) + Math.abs(p.z - L[2]) > 0.15 || Math.abs(e[8] - L[3]) + Math.abs(e[9] - L[4]) + Math.abs(e[10] - L[5]) > 0.004;
  if (!moved && !A.dirty) return;
  L[0] = p.x; L[1] = p.y; L[2] = p.z; L[3] = e[8]; L[4] = e[9]; L[5] = e[10];
  A.dirty = false;
  _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_m);
  const pl = _fr.planes, R = A.recs, n = A.n, slots = A.slots;
  for (const B of A.buckets) if (B) B.n = 0;
  const nearD = S.nearD, midD = S.midD, farD = Math.min(cam.far, (globalThis.__RIFT?.sky?.fog?.far ?? 300) + 20);
  const nearD2 = nearD * nearD, midD2 = midD * midD, farD2 = farD * farD;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, x = R[o], z = R[o + 2], dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
    const sl = slots[A.fam[i]]; if (!sl) continue;
    if (d2 > farD2) continue;
    if (sl.maxD && d2 > sl.maxD * sl.maxD * S.smallK) continue;
    const cy = R[o + 1] + A.cy[i], r = A.rad[i] + (d2 < midD2 ? 9 : 2); // margem: sombra de quem está logo fora da tela (perto)
    let inside = true;
    for (let k = 0; k < 6; k++) { const P = pl[k]; if (P.normal.x * x + P.normal.y * cy + P.normal.z * z + P.constant < -r) { inside = false; break; } }
    if (!inside) continue;
    const B = d2 < nearD2 || !sl.far ? sl.near[A.vari[i]] : sl.far;
    B.buf.array.set(R.subarray(o, o + STRIDE), B.n * STRIDE); B.n++;
  }
  for (const B of A.buckets) {
    if (!B) continue;
    B.g.instanceCount = B.n; B.mesh.visible = S.on && B.n > 0;
    if (B.n) { B.buf.clearUpdateRanges(); B.buf.addUpdateRange(0, B.n * STRIDE); B.buf.needsUpdate = true; }
  }
}

export function build(world) {
  const t0 = performance.now();
  const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const leafTex = makeLeafAtlas(), barkTex = makeBarkTex();
  const tTex = Math.round(performance.now() - t0);
  const U = {
    uTime: world.uniforms.uTime, uWind: { value: new THREE.Vector4(0.95, 0.31, 0.25, 0) },
    uLeafTex: { value: leafTex }, uBarkTex: { value: barkTex }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uLeafK: { value: 1.22 }, uTrans: { value: 0.55 }, uNight: { value: 0 }, uBump: { value: 1.6 },
  };
  const S = {
    on: false, mobile, U, tpl: makeTemplates(mobile), mat: makeTreeMaterials(U), areas: {}, confDirty: false,
    nearD: mobile ? 24 : 44, midD: mobile ? 46 : 72, smallK: mobile ? 0.45 : 1,
    sun: world.scene.children.find((o) => o.isDirectionalLight) || null,
  };
  ST.set(world, S);
  world.ultraTrees = {
    // refaz a escolha/corte com outra câmera (ex.: fotos de teste que mudam a câmera depois do update)
    refresh: (cam) => { const A = S.on && S.areas[world.area]; if (A && cam) { A.dirty = true; cull(S, A, cam); } },
    stats: () => {
      const out = { tex: tTex, build: S.buildMs, tpl: {} };
      for (const k in S.tpl) { const t = S.tpl[k]; out.tpl[k] = [t.near.index.count / 3, t.far ? t.far.index.count / 3 : 0, t.ms]; }
      for (const a in S.areas) { const A = S.areas[a]; if (A) out[a] = { n: A.n, drawn: A.buckets.filter(Boolean).map((B) => B.mesh.name + ':' + B.n).filter((s) => !s.endsWith(':0')) }; }
      return out;
    },
  };
  getArea(S, world, world.area);
  S.buildMs = Math.round(performance.now() - t0);
}

export function toggle(world, on) {
  const S = ST.get(world); if (!S) return;
  S.on = !!on;
  for (const k in S.areas) { const A = S.areas[k]; if (!A) continue; A.hideOld(S.on); A.setVisible(S.on); A.dirty = true; }
}

const _v = new THREE.Vector3();
export function update(world, dt, t, night, focus) {
  const S = ST.get(world); if (!S || !S.on) return;
  void t; void focus;
  const A = getArea(S, world, world.area); if (!A) return;
  if (A.name === 'confins' && S.confDirty) { S.confDirty = false; A.rebuild(); }
  const U = S.U;
  U.uNight.value = night;
  if (S.sun) {
    _v.copy(S.sun.position).sub(S.sun.target.position).normalize();
    U.uSunDir.value.copy(_v);
    U.uSunCol.value.copy(S.sun.color).multiplyScalar(S.sun.intensity * 0.4);
  }
  const sky = globalThis.__RIFT?.sky;
  const wk = 0.28 + (sky ? (sky.rainK || 0) * 0.5 + (sky.overK || 0) * 0.2 : 0);
  U.uWind.value.z += (wk - U.uWind.value.z) * Math.min(1, dt * 0.8);
  const cam = globalThis.__RIFT?.camera;
  if (cam) cull(S, A, cam);
}
