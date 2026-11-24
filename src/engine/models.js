import * as THREE from 'three';
import { RARITIES, RARITY_INDEX } from '../config/balance.js';
import { gearTheme } from '../config/itemthemes.js';
import { mergeGeometries } from '../../vendor/three/utils/BufferGeometryUtils.js';

// Junta as peças estáticas de cada articulação que usam o mesmo material em uma só malha
// (bem menos chamadas de desenho no celular). Peças animadas individualmente ficam separadas.
export function optimizeRig(rig) {
  const keep = new Set();
  for (const v of Object.values(rig)) {
    if (v?.isMesh) keep.add(v);
    else if (Array.isArray(v)) for (const x of v) if (x?.isMesh) keep.add(x);
  }
  const groups = [];
  rig.root.traverse((o) => { if (o.children.length > 1) groups.push(o); });
  for (const g of groups) {
    const buckets = new Map();
    for (const m of g.children) {
      if (!m.isMesh || m.children.length || keep.has(m) || m.userData.noMerge || !m.visible) continue;
      const key = m.material.uuid + (m.castShadow ? 's' : '');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const ge = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); ge.applyMatrix4(m.matrix); for (const k of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ge.deleteAttribute(k); return ge; });
      // só junta os atributos que TODAS as peças têm (ex.: peça sem "uv" não quebra a junção)
      for (const k of ['normal', 'uv']) if (geos.some((ge) => !ge.attributes[k])) for (const ge of geos) if (ge.attributes[k]) ge.deleteAttribute(k);
      let merged;
      try { merged = mergeGeometries(geos, false); } catch { merged = null; }
      for (const ge of geos) if (ge !== merged) ge.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
  return rig;
}

// Modelos provisórios articulados feitos de primitivas (substituíveis por GLTF no futuro).
const G = {
  sphere: new THREE.SphereGeometry(0.5, 12, 9),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cylZ: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateX(Math.PI / 2),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 3, 8),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.1, 6, 16),
};
export { G as MODEL_GEO };

// ---------- Formas extras (arte dos monstros) ----------
// Tudo em escala 1 (cabe num cubo de 1 m) e guardado: cada forma é criada uma vez só.
const V2 = (x, y) => new THREE.Vector2(x, y);
const lath = (pts, seg, phi = 0) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), seg, phi);
const SH = {
  // gota de gosma: base larga, barriga cheia, ombro e bico (y de 0 a 1)
  drop: lath([[0, 0], [0.44, 0.0], [0.55, 0.08], [0.6, 0.24], [0.58, 0.42], [0.5, 0.6], [0.36, 0.78], [0.2, 0.9], [0.07, 0.98], [0, 1]], 16),
  // bloco chanfrado de 8 lados (pedra lapidada, membros de golem, tábuas)
  block: lath([[0, -0.5], [0.44, -0.5], [0.54, -0.4], [0.54, 0.4], [0.44, 0.5], [0, 0.5]], 8, Math.PI / 8),
  // bloco chanfrado de 4 lados (caixa com quina gasta)
  block4: lath([[0, -0.5], [0.58, -0.5], [0.71, -0.4], [0.71, 0.4], [0.58, 0.5], [0, 0.5]], 4, Math.PI / 4),
  // tronco que afina (pernas, braços, pescoço): base 0,5 → topo 0,36
  limb: lath([[0, -0.5], [0.42, -0.5], [0.5, -0.36], [0.46, 0.2], [0.38, 0.46], [0, 0.5]], 7),
  // pedra irregular
  rock: new THREE.IcosahedronGeometry(0.5, 0),
  rock1: new THREE.DodecahedronGeometry(0.5, 0),
  // prisma de 3 lados (orelha, barbatana, lâmina)
  tri: new THREE.CylinderGeometry(0.5, 0.5, 1, 3),
  // garra/dente curvos (cone de 5 lados)
  fang: new THREE.ConeGeometry(0.5, 1, 5),
  // disco de poça com borda ondulada (y de -0,5 a 0,5)
  puddle: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 0.01) continue; const a = Math.atan2(z, x), k = 1 + Math.sin(a * 6) * 0.07 + Math.sin(a * 11 + 1) * 0.04; p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); return g; })(),
  // gema lapidada
  gem: new THREE.OctahedronGeometry(0.5, 0),
  // folha (losango achatado)
  leaf: (() => { const g = new THREE.SphereGeometry(0.5, 6, 3); g.scale(0.5, 0.06, 1); return g; })(),
  ring: new THREE.TorusGeometry(0.5, 0.14, 5, 10),
};
// tubo que afina seguindo uma curva (chifre, cauda, tentáculo, galho, presa curva)
const _tubeCache = new Map();
function taperTube(pts, r0 = 0.1, r1 = 0, radial = 6, seg = 8) {
  const key = JSON.stringify([pts, r0, r1, radial, seg]);
  if (_tubeCache.has(key)) return _tubeCache.get(key);
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false), pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), r = r0 + (r1 - r0) * t, N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j < radial; j++) { const a = (j / radial) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); pos.push(c.x + r * (cs * N.x + sn * B.x), c.y + r * (cs * N.y + sn * B.y), c.z + r * (cs * N.z + sn * B.z)); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) { const a = i * radial + j, b = i * radial + ((j + 1) % radial), c2 = a + radial, d = b + radial; idx.push(a, c2, b, b, c2, d); }
  const s0 = curve.getPointAt(0), e1 = curve.getPointAt(1), cs0 = pos.length / 3; pos.push(s0.x, s0.y, s0.z); const ce = pos.length / 3; pos.push(e1.x, e1.y, e1.z);
  for (let j = 0; j < radial; j++) { idx.push(cs0, j, (j + 1) % radial); idx.push(ce, seg * radial + ((j + 1) % radial), seg * radial + j); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  _tubeCache.set(key, g); return g;
}
export { SH as MOB_SHAPES, taperTube };

// ---------- Pano que flutua (capas, mantos, estandartes) ----------
// O tecido é uma malha só, dividida na altura; o shader ondula cada faixa conforme o tempo e o movimento:
// parado ele balança devagar, andando/correndo ele sobe para trás e ondula mais rápido. Custa nada a mais de desenho.
function clothState(rig) { return rig.cloth || (rig.cloth = { t: { value: Math.random() * 10 }, move: { value: 0 } }); }
function clothMat(rig, color, extra = {}) {
  const st = clothState(rig);
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClothT = st.t; sh.uniforms.uClothMove = st.move;
    sh.vertexShader = 'uniform float uClothT;\nuniform float uClothMove;\nattribute float aHang;\nattribute float aSide;\nattribute float aLen;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
\tfloat ch = aHang, cm = uClothMove, amp = aLen;
\tfloat w1 = sin(uClothT * (2.6 + cm * 3.5) + ch * 5.5 + aSide * 2.1);
\tfloat w2 = sin(uClothT * (4.1 + cm * 4.0) - ch * 8.0 + aSide * 4.3);
\ttransformed.z += (w1 * 0.075 + w2 * 0.035) * ch * (0.45 + cm * 0.9) * amp;
\ttransformed.z -= ch * ch * cm * 0.32 * amp;
\ttransformed.y += ch * ch * cm * 0.1 * amp;
\ttransformed.x += sin(uClothT * 2.3 + ch * 3.0 + aSide) * 0.03 * ch * amp;`);
  };
  m.customProgramCacheKey = () => 'cloth1';
  (rig.mats || (rig.mats = [])).push(m);
  return m;
}
// cria uma articulação (joelho/cotovelo) no meio do membro: tudo que está abaixo dela passa a dobrar junto
function splitLimb(limb, y) {
  const j = new THREE.Group(); j.position.set(0, y, 0);
  for (const c of [...limb.children]) if (c.position.y < y - 0.04) { limb.remove(c); c.position.y -= y; j.add(c); }
  limb.add(j); return j;
}
// junta peças (geometria + posição/escala/rotação no espaço da capa) num pano só, marcando a altura de cada vértice
const _cm4 = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler();
function clothMesh(pieces, mat, top = 0, len = 1) {
  const geos = pieces.map(([geo, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0]) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(_cm4.compose(new THREE.Vector3(x, y, z), _cq.setFromEuler(_ce.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    return g;
  });
  const g = mergeGeometries(geos, false); geos.forEach((x) => x.dispose());
  const p = g.attributes.position, n = p.count, hang = new Float32Array(n), side = new Float32Array(n), ln = new Float32Array(n).fill(len);
  let w = 0.01; for (let i = 0; i < n; i++) w = Math.max(w, Math.abs(p.getX(i)));
  for (let i = 0; i < n; i++) { hang[i] = Math.min(1, Math.max(0, (top - p.getY(i)) / len)); side[i] = p.getX(i) / w; }
  g.setAttribute('aHang', new THREE.BufferAttribute(hang, 1)); g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aLen', new THREE.BufferAttribute(ln, 1));
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.userData.noMerge = true;
  return mesh;
}
const CLOTH_BOX = new THREE.BoxGeometry(1, 1, 1, 2, 7, 1), CLOTH_TIP = new THREE.ConeGeometry(0.5, 1, 4, 3);
export { clothMat, clothMesh, CLOTH_BOX };
// marca o material como brilhante (0 fosco … 1 espelhado) — vale depois que as peças se juntam
const shiny = (m, k = 0.7) => { m.userData.shine = k; return m; };

class Mats {
  constructor(ghost = false) { this.list = []; this.ghost = ghost; }
  lam(color, extra = {}) {
    const m = this.ghost
      ? new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
    this.list.push(m);
    return m;
  }
  glow(color, opacity = 1) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    return m;
  }
}

function part(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  if (parent) parent.add(m);
  return m;
}
function group(x = 0, y = 0, z = 0, parent = null) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

export function rarityColor(rarity) { return new THREE.Color(RARITIES[RARITY_INDEX[rarity] ?? 0].color); }

// ---------------- Humanoide ----------------
// Esqueleto articulado: quadril → coxa → JOELHO → canela; ombro → braço → COTOVELO → antebraço → mão.
// o.detail (padrão true) adiciona cinto, braçadeiras, rosto, botas com cano etc. Inimigos numerosos usam detail:false.
const chestGeo = new THREE.CylinderGeometry(0.5, 0.4, 1, 8);
const RIB_GEO = new THREE.TorusGeometry(0.5, 0.07, 4, 12, Math.PI * 1.25).rotateZ(-Math.PI * 0.125);
const robeGeo = new THREE.CylinderGeometry(0.34, 0.62, 1, 10, 1, true);
export function buildHumanoid(o = {}) {
  const mats = new Mats(o.ghost);
  const c = {
    skin: 0xe8b98f, tunic: 0x7a5a3a, pants: 0x4a3a2c, trim: 0xd9b25f, hair: 0x5a3a22, boots: 0x3a2a1e, leather: 0x4a3222, ...o.colors,
  };
  const bone = o.style === 'bone';
  const detail = o.detail !== false && !o.ghost;
  const bulk = o.bulk || 1;
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const M = {
    skin: mats.lam(c.skin), tunic: mats.lam(c.tunic), pants: mats.lam(c.pants), trim: mats.lam(c.trim),
    hair: mats.lam(c.hair), boots: mats.lam(c.boots), leather: mats.lam(c.leather),
  };
  const limbR = bone ? 0.055 : 0.115;
  if (bone) shiny(M.skin, 0.3);
  const hips = group(0, 0.92, 0, body);
  const mob = !!o.mob && !o.ghost;
  if (bone) { // bacia: osso do quadril com as duas "asas"
    part(SH.block4, M.skin, 0.2, 0.12, 0.12, 0, 0.0, 0, hips);
    for (const s of [-1, 1]) { const w = part(G.sphereLo, M.skin, 0.2, 0.18, 0.08, s * 0.12, 0.06, -0.01, hips); w.rotation.z = s * 0.5; }
    part(G.cyl, M.skin, 0.07, 0.14, 0.07, 0, 0.14, -0.04, hips);
  } else part(mob ? SH.block : G.box, M.pants, 0.5 * bulk, 0.22, 0.3, 0, 0.02, 0, hips);
  let belt = null;
  if (!bone && detail) {
    belt = part(G.box, M.leather, 0.56 * bulk, 0.09, 0.34, 0, 0.11, 0, hips);
    part(G.box, M.trim, 0.12, 0.09, 0.04, 0, 0.11, 0.17, hips);
  }
  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const leg = group(s * (bone ? 0.12 : 0.15 * bulk), 0, 0, hips);
    if (bone) { // fêmur, rótula, tíbia e pé de ossinhos
      part(G.capsule, M.skin, 0.09, 0.3, 0.09, 0, -0.2, 0, leg);
      part(G.sphereLo, M.skin, 0.13, 0.12, 0.13, 0, -0.03, 0, leg);
    } else if (mob) part(SH.limb, M.pants, limbR * 2.3, 0.44, limbR * 2.3, 0, -0.2, 0, leg).rotation.x = Math.PI;
    else part(G.capsule, M.pants, limbR * 2.15, 0.24, limbR * 2.15, 0, -0.2, 0, leg);
    const knee = group(0, -0.42, 0, leg);
    if (bone) {
      part(G.sphereLo, M.skin, 0.12, 0.11, 0.12, 0, 0, 0.01, knee);
      part(G.capsule, M.skin, 0.075, 0.28, 0.075, -0.015, -0.19, 0, knee); part(G.capsule, M.skin, 0.05, 0.26, 0.05, 0.03, -0.19, 0, knee);
      part(SH.block4, M.skin, 0.1, 0.05, 0.1, 0, -0.4, 0.0, knee);
      for (const t of [-1, 0, 1]) part(G.box, M.skin, 0.025, 0.025, 0.12, t * 0.035, -0.42, 0.1, knee);
    } else {
      part(mob ? SH.limb : G.capsule, M.pants, limbR * 1.9, mob ? 0.4 : 0.22, limbR * 1.9, 0, -0.18, 0, knee).rotation.x = mob ? Math.PI : 0;
      if (mob) { part(SH.block4, M.boots, 0.17, 0.16, 0.3, 0, -0.37, 0.04, knee); part(SH.block, M.boots, 0.17, 0.08, 0.12, 0, -0.42, 0.17, knee); part(SH.block, M.boots, 0.24, 0.14, 0.24, 0, -0.24, 0, knee); }
      else { part(G.box, M.boots, 0.21, 0.17, 0.32, 0, -0.38, 0.05, knee); if (detail) part(G.cyl, M.boots, 0.27, 0.13, 0.27, 0, -0.25, 0, knee); }
    }
    legs.push(leg); knees.push(knee);
  }
  const torso = group(0, 0.08, 0, hips);
  let chest;
  if (bone) { // coluna de vértebras, costelas curvas, esterno e clavículas
    for (let i = 0; i < 7; i++) part(G.cyl, M.skin, 0.09 - i * 0.003, 0.06, 0.09, 0, 0.04 + i * 0.1, -0.08, torso);
    for (let i = 0; i < 5; i++) { const w = 0.46 - Math.abs(i - 1.2) * 0.05 - i * 0.02; const rb = part(RIB_GEO, M.skin, w, w * 0.62, 0.9, 0, 0.62 - i * 0.1, -0.02, torso); rb.rotation.x = Math.PI / 2 + 0.25; }
    part(G.box, M.skin, 0.06, 0.4, 0.04, 0, 0.45, 0.17, torso);
    for (const sd of [-1, 1]) { const cl = part(G.capsule, M.skin, 0.05, 0.22, 0.05, sd * 0.15, 0.7, 0.04, torso); cl.rotation.z = sd * 1.35; }
    chest = torso;
  } else {
    chest = part(chestGeo, M.tunic, 0.72 * bulk, 0.62, 0.44 * bulk, 0, 0.35, 0, torso);
    part(G.box, M.trim, 0.6 * bulk, 0.08, 0.38 * bulk, 0, 0.06, 0, torso);
    if (detail) part(G.box, M.trim, 0.36 * bulk, 0.07, 0.4 * bulk, 0, 0.66, 0, torso); // gola
  }
  let skirt = null;
  if (o.robe) skirt = part(robeGeo, M.tunic, 1.0 * bulk, 0.9, 0.82 * bulk, 0, -0.4, 0, torso);
  const neck = group(0, 0.66, 0, torso);
  const head = group(0, 0, 0, neck);
  const hs = o.headScale || 1;
  part(G.sphere, M.skin, 0.52 * hs, 0.54 * hs, 0.5 * hs, 0, 0.24, 0, head);
  let jaw = null;
  const eyes = [];
  if (bone) { // crânio: órbitas fundas com brilho, maçãs do rosto, nariz vazado e mandíbula com dentes
    const eyeM = mats.glow(o.eyeColor || 0x7fd8ff), hole = mats.glow(0x0c0a10);
    part(G.box, M.skin, 0.4, 0.14, 0.24, 0, 0.12, 0.12, head);
    for (const s of [-1, 1]) {
      part(G.sphereLo, hole, 0.15, 0.13, 0.06, s * 0.1, 0.27, 0.225, head, false);
      eyes.push(part(G.sphereLo, eyeM, 0.05, 0.05, 0.03, s * 0.1, 0.265, 0.25, head, false));
      part(G.box, M.skin, 0.12, 0.05, 0.08, s * 0.16, 0.18, 0.18, head);
    }
    const ns = part(SH.tri, hole, 0.06, 0.03, 0.08, 0, 0.19, 0.245, head, false); ns.rotation.x = Math.PI / 2;
    for (let k = -3; k <= 3; k++) part(G.box, M.skin, 0.03, 0.045, 0.02, k * 0.032, 0.085, 0.24, head);
    jaw = group(0, 0.1, 0.02, head);
    part(SH.block4, M.skin, 0.28, 0.07, 0.22, 0, -0.03, 0.08, jaw);
    for (let k = -3; k <= 3; k++) part(G.box, M.skin, 0.028, 0.04, 0.02, k * 0.03, 0.01, 0.19, jaw);
  } else {
    const white = mats.lam(0xf4efe6), pupil = new THREE.MeshBasicMaterial({ color: o.eyeColor || 0x1d1a20 });
    for (const s of [-1, 1]) {
      if (detail) part(G.box, white, 0.1, 0.09, 0.02, s * 0.1 * hs, 0.26 * hs, 0.238 * hs, head, false);
      eyes.push(part(G.box, pupil, 0.055, 0.075, 0.02, s * 0.095 * hs, 0.255 * hs, 0.25 * hs, head, false));
      if (detail) { const br = part(G.box, M.hair, 0.12, 0.03, 0.03, s * 0.1 * hs, 0.335 * hs, 0.245 * hs, head, false); br.rotation.z = s * 0.18; }
    }
    if (detail) part(G.box, mats.lam(0x8a4a3a), 0.09, 0.02, 0.02, 0, 0.13 * hs, 0.245 * hs, head, false);
    if (!o.bald) part(G.sphere, M.hair, 0.56 * hs, 0.36 * hs, 0.55 * hs, 0, 0.39 * hs, -0.03, head);
    if (o.longHair) part(G.box, M.hair, 0.44, 0.46, 0.12, 0, 0.12, -0.22, head);
    if (o.beard) { const bd = part(G.cone, M.hair, 0.3, 0.42, 0.18, 0, 0.0, 0.17, head); bd.rotation.x = Math.PI; }
    if (o.ears) for (const s of [-1, 1]) { const e = part(G.cone, M.skin, 0.13, 0.5, 0.06, s * 0.31, 0.3, 0, head); e.rotation.z = -s * 1.3; e.rotation.y = s * 0.3; }
    if (o.nose) { const n = part(G.cone, M.skin, 0.09, 0.24, 0.09, 0, 0.2, 0.3, head); n.rotation.x = Math.PI / 2; }
  }
  const arms = [], elbows = [], hands = [];
  for (const s of [-1, 1]) {
    const arm = group(s * (bone ? 0.26 : 0.38 * bulk), 0.56, 0, torso);
    if (!bone) part(G.sphere, M.tunic, 0.25 * bulk, 0.25, 0.25, 0, -0.02, 0, arm);
    else part(G.sphereLo, M.skin, 0.12, 0.12, 0.12, 0, -0.01, 0, arm);
    if (mob && !bone) part(SH.limb, M.tunic, (limbR - 0.005) * 2, 0.32, (limbR - 0.005) * 2, 0, -0.15, 0, arm).rotation.x = Math.PI;
    else part(G.capsule, bone ? M.skin : M.tunic, (limbR - 0.015) * 2, 0.16, (limbR - 0.015) * 2, 0, -0.15, 0, arm);
    const elbow = group(0, -0.32, 0, arm);
    if (bone) { part(G.sphereLo, M.skin, 0.1, 0.1, 0.1, 0, 0, 0, elbow); part(G.capsule, M.skin, 0.045, 0.2, 0.045, -0.02, -0.13, 0, elbow); part(G.capsule, M.skin, 0.045, 0.2, 0.045, 0.02, -0.13, 0, elbow); }
    else if (mob) part(SH.limb, o.sleeves === false ? M.skin : M.tunic, (limbR - 0.02) * 2, 0.28, (limbR - 0.02) * 2, 0, -0.13, 0, elbow).rotation.x = Math.PI;
    else part(G.capsule, o.sleeves === false ? M.skin : M.tunic, (limbR - 0.025) * 2, 0.14, (limbR - 0.025) * 2, 0, -0.12, 0, elbow);
    if (!bone && (detail || mob)) part(mob ? SH.block : G.cyl, M.leather, 0.21, 0.13, 0.21, 0, -0.2, 0, elbow); // braçadeira
    const hand = group(0, -0.28, 0, elbow);
    if (bone) { part(G.sphereLo, M.skin, 0.1, 0.08, 0.1, 0, 0, 0, hand); for (let f = -1; f <= 1; f++) part(G.capsule, M.skin, 0.025, 0.08, 0.025, f * 0.03, -0.07, 0.03, hand); }
    else if (mob) { part(SH.block4, M.skin, 0.12, 0.13, 0.1, 0, 0, 0, hand); const th = part(G.capsule, M.skin, 0.045, 0.06, 0.045, -s * 0.06, -0.01, 0.04, hand); th.rotation.z = s * 0.6; }
    else part(G.box, M.skin, 0.13, 0.14, 0.12, 0, 0, 0, hand);
    const wrist = group(0, 0, 0, hand);
    arms.push(arm); elbows.push(elbow); hands.push(wrist);
  }
  const shoulders = [];
  if (o.shoulders) for (const s of [-1, 1]) {
    const pd = part(G.sphere, M.trim, 0.42 * bulk, 0.3, 0.44, s * 0.41 * bulk, 0.63, 0, torso);
    shoulders.push(pd);
    if (detail) shoulders.push(part(G.box, M.trim, 0.1, 0.06, 0.3, s * 0.52 * bulk, 0.58, 0, torso));
  }
  let cape = null, capeLow = null;
  if (o.cape) {
    cape = group(0, 0.62, -0.22, torso);
    const capeRig = { mats: mats.list };
    M.cape = o.ghost ? mats.lam(o.cape) : clothMat(capeRig, o.cape);
    const wd = 0.6 * bulk, pcs = [];
    if ((bone || mob) && o.capeStyle !== 'full') { // capa rasgada: tiras de tamanhos diferentes com a ponta em farrapos
      const n = 6;
      pcs.push([CLOTH_BOX, wd * 0.92, 0.14, 0.05, 0, -0.05, 0]);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1) - 0.5) * wd, ln = 0.72 + ((i * 7) % 3) * 0.12 - (i % 2) * 0.06; pcs.push([CLOTH_BOX, wd / n * 1.12, ln, 0.035, x, -ln / 2 - 0.08, (i % 2) * 0.008]); pcs.push([CLOTH_TIP, wd / n * 0.75, 0.16, 0.035, x + ((i % 2) - 0.5) * 0.03, -ln - 0.1, 0, Math.PI]); }
    } else if (o.capeStyle === 'full') { pcs.push([CLOTH_BOX, wd * 1.0, 0.16, 0.05, 0, -0.05, 0]); pcs.push([CLOTH_BOX, wd * 1.1, 1.12, 0.04, 0, -0.62, 0]); for (let i = -2; i <= 2; i++) pcs.push([CLOTH_TIP, wd * 0.2, 0.14, 0.04, i * wd * 0.22, -1.24, 0, Math.PI]); }
    else { pcs.push([CLOTH_BOX, wd * 0.98, 1.0, 0.04, 0, -0.5, 0]); pcs.push([CLOTH_BOX, wd * 1.04, 0.04, 0.05, 0, -1.0, 0]); }
    if (o.ghost) for (const [g2, sx, sy, sz, x, y, z, rx] of pcs) part(g2, M.cape, sx, sy, sz, x, y, z, cape).rotation.x = rx || 0;
    else { cape.add(clothMesh(pcs, M.cape, 0, 1.05)); cape.userData.cloth = capeRig.cloth; }
    capeLow = group(0, -0.5, 0, cape);
    if (detail && o.ghost) part(G.box, M.trim, 0.66 * bulk, 0.05, 0.05, 0, -0.5, 0, capeLow);
  }
  const back = group(0, 0.35, -0.22, torso);
  const helmSlot = group(0, 0, 0, head);
  root.traverse((m) => { if (m.isMesh) m.castShadow = !o.ghost; });
  const rig = {
    kind: 'humanoid', root, body, hips, torso, chest, neck, head, jaw, eyes, belt,
    legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1],
    armL: arms[0], armR: arms[1], elbowL: elbows[0], elbowR: elbows[1],
    handL: hands[0], handR: hands[1], cape, capeLow, back, skirt, helmSlot, shoulders, M, mats: mats.list, cloth: cape?.userData.cloth || null,
    height: 1.9 * (o.scale || 1), phase: Math.random() * 6, hunch: o.hunch || 0, blinkT: 1 + Math.random() * 3,
  };
  root.scale.setScalar(o.scale || 1);
  return rig;
}

// ---------------- Armas ----------------
export function buildWeapon(kind, rarity = 'comum', opts = {}) {
  const g = new THREE.Group();
  const rc = rarityColor(rarity);
  const ri = RARITY_INDEX[rarity] ?? 0;
  const steel = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xd8dde3).lerp(rc, 0.18 + ri * 0.04), flatShading: true });
  if (ri >= 4) { steel.emissive = rc.clone().multiplyScalar(0.35); }
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e, flatShading: true });
  const gold = new THREE.MeshLambertMaterial({ color: ri >= 2 ? rc : 0xb89a5a, flatShading: true });
  const gem = new THREE.MeshBasicMaterial({ color: rc });
  // estética do monstro de origem: metal e madeira com as cores dele (a gema continua mostrando a raridade)
  const th = opts.theme || null;
  if (th) {
    steel.color.set(th.metal).lerp(rc, 0.12);
    wood.color.set(th.wood);
    if (ri < 2) gold.color.set(th.metalD);
    if (th.glow) steel.emissive = new THREE.Color(th.fx).multiplyScalar(0.18);
  }
  let tip = new THREE.Vector3(0, 0, 0.8);
  const p = (geo, mat, sx, sy, sz, x, y, z) => part(geo, mat, sx, sy, sz, x, y, z, g);
  switch (kind) {
    case 'espada':
      p(G.cylZ, wood, 0.07, 0.07, 0.24, 0, 0, 0);
      p(G.box, gold, 0.32, 0.06, 0.07, 0, 0, 0.14);
      p(G.box, steel, 0.1, 0.025, 0.82, 0, 0, 0.58);
      p(G.sphere, gem, 0.08, 0.08, 0.08, 0, 0, -0.14);
      tip.set(0, 0, 1.0);
      break;
    case 'machado': // lâmina para baixo (o corte desce no golpe); o esporão fica em cima
      p(G.cylZ, wood, 0.07, 0.07, 0.95, 0, 0, 0.3);
      p(G.box, steel, 0.06, 0.34, 0.26, 0, -0.14, 0.66);
      p(G.box, steel, 0.05, 0.18, 0.08, 0, 0.08, 0.66);
      p(G.sphere, gem, 0.08, 0.08, 0.08, 0, 0, -0.18);
      tip.set(0, -0.2, 0.7);
      break;
    case 'montante':
      p(G.cylZ, wood, 0.08, 0.08, 0.36, 0, 0, -0.04);
      p(G.box, gold, 0.42, 0.07, 0.08, 0, 0, 0.18);
      p(G.box, steel, 0.15, 0.03, 1.25, 0, 0, 0.84);
      p(G.sphere, gem, 0.1, 0.1, 0.1, 0, 0, -0.25);
      tip.set(0, 0, 1.45);
      break;
    case 'arco': case 'arco_longo': {
      // arco recurvo de verdade: braços curvos em segmentos, empunhadura de couro, pontas viradas e corda
      // presa nas pontas. A corda e a flecha encaixada se mexem quando o arqueiro puxa (userData.bow.setDraw).
      const H = kind === 'arco_longo' ? 0.8 : 0.64, D = kind === 'arco_longo' ? 0.2 : 0.17, N = 7;
      const limbM = ri >= 2 ? new THREE.MeshLambertMaterial({ color: new THREE.Color(wood.color).lerp(rc, 0.25), flatShading: true }) : wood;
      const ptAt = (t) => { const y = D * Math.pow(t, 1.7) - (t > 0.86 ? (t - 0.86) * 0.55 : 0); return [y, t * H]; };
      let tipY = 0, tipZ = 0;
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < N; i++) {
          const [y0, z0] = ptAt(i / N), [y1, z1] = ptAt((i + 1) / N);
          const len = Math.hypot(y1 - y0, z1 - z0), th = 1 - (i / N) * 0.5;
          const seg = p(G.box, limbM, 0.05 * th, 0.042 * th, len + 0.012, 0, (y0 + y1) / 2, sgn * (z0 + z1) / 2);
          seg.rotation.x = sgn * -Math.atan2(y1 - y0, z1 - z0);
        }
        const [ty, tz] = ptAt(1); tipY = ty; tipZ = tz;
        p(G.sphereLo, gold, 0.05, 0.05, 0.05, 0, ty, sgn * tz); // ponteira
        if (ri >= 1) { const fl = p(G.box, gold, 0.055, 0.05, 0.06, 0, ptAt(0.35)[0], sgn * ptAt(0.35)[1]); fl.rotation.x = sgn * -0.25; } // anel de reforço
      }
      p(G.cylZ, new THREE.MeshLambertMaterial({ color: 0x4a2f1c, flatShading: true }), 0.085, 0.085, 0.22, 0, 0, 0); // empunhadura de couro
      p(G.box, gold, 0.04, 0.05, 0.05, 0, -0.03, 0.12); // apoio da flecha
      if (ri >= 2) p(G.octa, gem, 0.09, 0.09, 0.09, 0, -0.045, -0.13);
      // corda (2 pedaços: ponta de cima → ponto de puxar ← ponta de baixo)
      const strM = new THREE.MeshBasicMaterial({ color: 0xf2eee0 });
      const sTop = p(G.cylZ, strM, 0.014, 0.014, 1, 0, 0, 0), sBot = p(G.cylZ, strM, 0.014, 0.014, 1, 0, 0, 0);
      sTop.userData.noMerge = sBot.userData.noMerge = true; sTop.castShadow = sBot.castShadow = false;
      // flecha encaixada (aparece só enquanto puxa)
      const nocked = new THREE.Group(); nocked.userData.noMerge = true; g.add(nocked);
      const shaftM = new THREE.MeshLambertMaterial({ color: 0xd9c49a, flatShading: true }), headM = new THREE.MeshLambertMaterial({ color: 0xcfd6dc, flatShading: true }), featM = new THREE.MeshLambertMaterial({ color: 0xe8e2d0, flatShading: true });
      part(G.cyl, shaftM, 0.022, 0.86, 0.022, 0, -0.43, 0, nocked, false);
      const hd = part(G.cone4, headM, 0.07, 0.14, 0.025, 0, -0.9, 0, nocked, false); hd.rotation.z = Math.PI;
      for (const r of [0, 2.09, 4.19]) { const f = part(G.box, featM, 0.006, 0.16, 0.05, Math.cos(r) * 0.03, -0.09, Math.sin(r) * 0.03, nocked, false); f.rotation.y = Math.PI / 2 - r; }
      const setDraw = (k) => {
        const yS = tipY + 0.012 + Math.max(0, Math.min(1, k)) * 0.42;
        for (const [m, sg] of [[sTop, 1], [sBot, -1]]) {
          const dy = yS - tipY, dz = -sg * tipZ, len = Math.hypot(dy, dz);
          m.scale.z = len; m.position.set(0, (tipY + yS) / 2, sg * tipZ / 2);
          m.rotation.x = Math.atan2(-dy, dz);
        }
        nocked.visible = k > 0.03; nocked.position.y = yS;
      };
      setDraw(0);
      g.userData.bow = { setDraw };
      tip.set(0, -0.12, 0);
      break;
    }
    case 'varinha':
      p(G.cylZ, wood, 0.05, 0.05, 0.55, 0, 0, 0.22);
      p(G.octa, gem, 0.14, 0.14, 0.2, 0, 0, 0.55);
      tip.set(0, 0, 0.6);
      break;
    case 'cajado':
      p(G.cylZ, wood, 0.07, 0.07, 1.75, 0, 0, 0.35);
      p(G.torus, gold, 0.28, 0.28, 0.28, 0, 0, 1.2);
      p(G.sphere, gem, 0.2, 0.2, 0.2, 0, 0, 1.25);
      tip.set(0, 0, 1.25);
      break;
    case 'orbe':
      p(G.sphere, gem, 0.26, 0.26, 0.26, 0, 0.0, 0.22);
      p(G.torus, gold, 0.42, 0.42, 0.42, 0, 0, 0.22).rotation.y = Math.PI / 2;
      tip.set(0, 0, 0.22);
      break;
    case 'adaga':
      p(G.cylZ, wood, 0.06, 0.06, 0.14, 0, 0, 0);
      p(G.box, steel, 0.06, 0.02, 0.36, 0, 0, 0.25);
      tip.set(0, 0, 0.45);
      break;
    case 'clava':
      p(G.cylZ, wood, 0.1, 0.1, 0.7, 0, 0, 0.3);
      p(G.dodeca, wood, 0.22, 0.22, 0.3, 0, 0, 0.62);
      tip.set(0, 0, 0.7);
      break;
    case 'escudo':
      p(G.cyl, gold, 0.62, 0.08, 0.62, 0, 0, 0).rotation.x = Math.PI / 2;
      p(G.cyl, new THREE.MeshLambertMaterial({ color: 0x8a2f2a, flatShading: true }), 0.52, 0.1, 0.52, 0, 0, 0.01).rotation.x = Math.PI / 2;
      p(G.sphere, steel, 0.14, 0.14, 0.1, 0, 0, 0.06);
      break;
    default:
      break;
  }
  if (th) addMotif(g, th, kind, tip);
  // linha da arma INTEIRA (do cabo à ponta): os efeitos de arma saem ao longo dela, não só da ponta
  const FX_LINE = { espada: [0.12, 1.0], machado: [-0.1, 0.78], montante: [0.2, 1.45], varinha: [0, 0.62], cajado: [-0.45, 1.3], orbe: [0.05, 0.4], adaga: [0.12, 0.45], clava: [-0.05, 0.75] };
  if (kind === 'arco' || kind === 'arco_longo') { const H = kind === 'arco_longo' ? 0.8 : 0.64; g.userData.fxLine = [new THREE.Vector3(0, 0.05, -H), new THREE.Vector3(0, 0.05, H)]; }
  else if (FX_LINE[kind]) g.userData.fxLine = [new THREE.Vector3(0, 0, FX_LINE[kind][0]), new THREE.Vector3(0, 0, FX_LINE[kind][1])];
  optimizeRig({ root: g });
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.renderOrder = 2; } });
  g.userData.tip = tip;
  g.userData.kind = kind;
  g.userData.rarity = rarity;
  return g;
}

export function buildHelm(kind, rarity = 'comum', th = null) {
  const g = new THREE.Group();
  const rc = rarityColor(rarity), ri = RARITY_INDEX[rarity] ?? 0;
  const metal = new THREE.MeshLambertMaterial({ color: new THREE.Color(th ? th.metal : 0xa8adb5).lerp(rc, th ? 0.12 : 0.2 + ri * 0.05), flatShading: true });
  const cloth = new THREE.MeshLambertMaterial({ color: new THREE.Color(th ? th.wood : 0x5a4630).lerp(rc, 0.25), flatShading: true });
  if (kind === 'elmo') {
    part(G.sphere, metal, 0.6, 0.48, 0.58, 0, 0.36, -0.01, g);
    part(G.box, metal, 0.62, 0.08, 0.6, 0, 0.22, 0, g);
    part(G.box, new THREE.MeshBasicMaterial({ color: rc }), 0.06, 0.18, 0.4, 0, 0.62, -0.02, g);
  } else if (kind === 'capuz') {
    part(G.sphere, cloth, 0.62, 0.58, 0.6, 0, 0.3, -0.04, g);
    const tipc = part(G.cone, cloth, 0.3, 0.35, 0.3, 0, 0.32, -0.32, g); tipc.rotation.x = -1.9;
  } else if (kind === 'tiara') {
    const t = part(G.torus, metal, 0.56, 0.56, 0.56, 0, 0.36, 0, g); t.rotation.x = Math.PI / 2;
    part(G.octa, new THREE.MeshBasicMaterial({ color: rc }), 0.12, 0.16, 0.06, 0, 0.42, 0.27, g);
  } else if (kind === 'chapeu') {
    const brim = part(G.cyl, cloth, 0.9, 0.05, 0.9, 0, 0.38, 0, g);
    const top = part(G.cone, cloth, 0.5, 0.7, 0.5, 0, 0.75, -0.05, g); top.rotation.x = -0.25;
    void brim;
  }
  if (th) {
    // detalhes do monstro no elmo: em cima e dos lados
    const T = motifParts(th);
    for (const [i, [x, y, z]] of [[0, 0.74, -0.02], [0.32, 0.5, 0], [-0.32, 0.5, 0]].entries()) {
      const m = part(T.geo, T.mat, T.s, T.s * (T.tall || 1), T.s, x, y, z, g);
      if (T.spike) m.rotation.z = i === 0 ? 0 : (x > 0 ? -1.2 : 1.2);
    }
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ---------- detalhes (motif) do monstro de origem, nas armas e elmos ----------
function motifParts(th) {
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  switch (th.motif) {
    case 'pedras': return { geo: G.dodeca, mat: lam(th.fx2), s: 0.1 };
    case 'chamas': return { geo: G.cone, mat: glow(th.fx), s: 0.09, tall: 2.2, spike: true, up: true };
    case 'cristais': return { geo: G.octa, mat: glow(th.fx), s: 0.09, tall: 1.8 };
    case 'espinhos': return { geo: G.cone, mat: lam(th.fx), s: 0.07, tall: 2.4, spike: true };
    case 'presas': return { geo: G.cone, mat: lam(th.fx), s: 0.06, tall: 2.6, spike: true };
    case 'gotas': return { geo: G.sphereLo, mat: new THREE.MeshLambertMaterial({ color: th.fx2, transparent: true, opacity: 0.85 }), s: 0.09, tall: 1.3, drop: true };
    case 'folhas': return { geo: G.box, mat: lam(th.fx2), s: 0.12, tall: 0.25, leaf: true };
    case 'musgo': return { geo: G.dodeca, mat: lam(th.fx2), s: 0.08 };
    case 'remendos': return { geo: G.box, mat: lam(th.fx), s: 0.09, tall: 0.6 };
    case 'ambar': return { geo: G.octa, mat: glow(th.fx), s: 0.08, tall: 1.3 };
    case 'bolhas': return { geo: G.sphereLo, mat: lam(th.fx), s: 0.08 };
    case 'runas': return { geo: G.box, mat: glow(th.fx), s: 0.05, tall: 1.6 };
    default: return { geo: G.box, mat: glow(th.fx2), s: 0.04, tall: 2 };
  }
}
function addMotif(g, th, kind, tip) {
  const T = motifParts(th);
  // pontos ao longo da arma (do cabo até a ponta), alternando os lados
  const len = Math.max(0.3, tip.length ? tip.length() : 0.8);
  const n = kind === 'escudo' ? 5 : kind === 'orbe' || kind === 'varinha' ? 3 : 4;
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (kind === 'escudo') { const a = (i / n) * Math.PI * 2; x = Math.cos(a) * 0.42; y = Math.sin(a) * 0.42; z = 0.08; }
    else if (kind === 'orbe') { const a = (i / n) * Math.PI * 2; x = Math.cos(a) * 0.3; y = Math.sin(a) * 0.3; z = 0.22; }
    else if (kind === 'arco' || kind === 'arco_longo') { const k = (i / (n - 1)) * 2 - 1; x = 0; y = -0.1; z = k * len * 0.55; }
    else { const k = 0.35 + (i / Math.max(1, n - 1)) * 0.6; const s = i % 2 ? 1 : -1; x = s * 0.07; y = 0.02 * s; z = tip.z * k; if (kind === 'machado') { x = 0.04 * s; y = -0.14 - 0.12 * (i % 2); z = 0.55 + i * 0.05; } }
    const m = part(T.geo, T.mat, T.s, T.s * (T.tall || 1), T.s, x, y, z, g);
    if (T.spike && kind !== 'escudo') { m.rotation.z = x > 0 ? -1.3 : 1.3; if (T.up) m.rotation.z *= 0.35; }
    if (T.spike && kind === 'escudo') m.rotation.x = Math.PI / 2;
    if (T.leaf) m.rotation.set(0.4, i, 0.3);
    if (T.drop) m.position.y -= 0.06;
    m.userData.noMerge = false;
  }
}

// Monta o protagonista de uma classe
export function buildHero(cls) {
  const c = cls.colors;
  const o = { colors: { skin: c.skin, tunic: c.tunic, pants: c.pants, trim: c.trim, hair: c.hair } };
  if (cls.id === 'guerreiro') Object.assign(o, { bulk: 1.12, shoulders: true, cape: 0x7a2a22 });
  if (cls.id === 'arqueiro') Object.assign(o, { cape: 0x2f4f2c, colors: { ...o.colors, leather: 0x5a3b24 } });
  if (cls.id === 'mago') Object.assign(o, { robe: true, longHair: true, cape: 0x272a6e, colors: { ...o.colors, leather: 0x2a2244 } });
  const rig = buildHumanoid(o);
  rig.cls = cls.id;
  const L = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
  if (cls.id === 'guerreiro') {
    // tabardo na frente e atrás, preso ao cinto
    const tab = L(0x7a2a22); rig.mats.push(tab);
    part(G.box, tab, 0.3, 0.42, 0.03, 0, -0.14, 0.17, rig.hips);
    part(G.box, tab, 0.34, 0.36, 0.03, 0, -0.12, -0.17, rig.hips);
    part(G.box, rig.M.trim, 0.32, 0.04, 0.035, 0, -0.34, 0.17, rig.hips);
    // cotas de malha nos ombros (peitoral)
    part(G.box, rig.M.trim, 0.5, 0.06, 0.03, 0, 0.5, 0.2, rig.torso).rotation.x = 0.2;
  }
  if (cls.id === 'arqueiro') {
    // aljava com penas, alça cruzando o peito e cachecol
    const lea = rig.M.leather;
    const quiver = part(G.cyl, lea, 0.22, 0.66, 0.22, 0.14, 0.04, 0, rig.back);
    quiver.rotation.z = 0.35;
    const fl = L(0xd8f07a), fl2 = L(0xf2f2e6);
    for (let i = 0; i < 4; i++) part(G.box, i % 2 ? fl2 : fl, 0.05, 0.18, 0.02, 0.2 + i * 0.03, 0.44 - i * 0.01, (i - 1.5) * 0.04, rig.back);
    const strap = part(G.box, lea, 0.08, 0.86, 0.03, 0, 0.36, 0.215, rig.torso); strap.rotation.z = 0.72;
    const scarf = L(0x6a8f3a); rig.mats.push(scarf);
    part(G.cyl, scarf, 0.46, 0.12, 0.42, 0, 0.66, 0, rig.torso);
    const tail = part(G.box, scarf, 0.12, 0.34, 0.04, 0.12, 0.48, -0.22, rig.torso); tail.rotation.z = -0.2;
  }
  if (cls.id === 'mago') {
    // manto nos ombros, cinto com gema, grimório e um cristal arcano que flutua ao redor
    const mantle = L(0x272a6e); rig.mats.push(mantle);
    part(G.cone, mantle, 0.98, 0.32, 0.66, 0, 0.6, 0, rig.torso);
    part(G.box, rig.M.trim, 0.12, 0.12, 0.04, 0, 0.11, 0.18, rig.hips);
    const gemM = new THREE.MeshBasicMaterial({ color: 0x5ef0ff });
    part(G.octa, gemM, 0.08, 0.1, 0.04, 0, 0.11, 0.2, rig.hips, false);
    const book = part(G.box, L(0x4a2a6a), 0.08, 0.26, 0.2, 0.3, -0.02, 0.02, rig.hips); book.rotation.z = 0.15;
    const fam = group(0, 1.75, 0, rig.root);
    const crystal = part(G.octa, gemM, 0.16, 0.26, 0.16, 0.75, 0, 0, fam, false);
    part(G.octa, new THREE.MeshBasicMaterial({ color: 0xc79bff, transparent: true, opacity: 0.35 }), 0.3, 0.44, 0.3, 0.75, 0, 0, fam, false);
    rig.familiar = fam; rig.familiarGem = crystal;
  }
  optimizeRig(rig);
  // peças de cada articulação viram uma malha só (cores por vértice): o herói passa de ~70 para ~30 "pinturas"
  // (arma, escudo, capuz, ombreiras e trajes continuam separados — eles mudam durante o jogo)
  mergeRigColors(rig, 0);
  rig.setEquipment = (eq) => applyEquipment(rig, cls, eq);
  return rig;
}

function applyEquipment(rig, cls, eq) {
  // arma
  for (const h of [rig.handR, rig.handL]) while (h.children.length) h.remove(h.children[0]);
  const w = eq.weapon;
  const kind = w?.wkind || (cls.id === 'guerreiro' ? 'espada' : cls.id === 'arqueiro' ? 'arco' : 'varinha');
  const weapon = buildWeapon(kind, w?.rarity || 'comum', { theme: gearTheme(w) });
  if (kind === 'arco' || kind === 'arco_longo') rig.handL.add(weapon); else rig.handR.add(weapon);
  rig.weapon = weapon;
  rig.weaponKind = kind;
  // escudo (todas as classes): na mão esquerda; o arqueiro (arco na esquerda) leva nas costas
  if (rig._shieldBack) { rig._shieldBack.parent?.remove(rig._shieldBack); rig._shieldBack = null; }
  if (eq.shield && kind !== 'montante') {
    const sh = buildWeapon('escudo', eq.shield.rarity || 'comum', { theme: gearTheme(eq.shield) });
    const sc = { broquel: 0.75, escudo_torre: 1.3 }[eq.shield.wkind] || 1;
    sh.scale.setScalar(sc);
    if (kind === 'arco' || kind === 'arco_longo') {
      sh.position.set(0.05, 0.45, -0.3); sh.rotation.set(0, Math.PI, 0); rig.torso.add(sh); rig._shieldBack = sh; rig.shield = null;
    } else { sh.position.set(0, 0, 0.12); rig.handL.add(sh); rig.shield = sh; }
  } else rig.shield = null;
  // armaduras NÃO mudam o visual do personagem (estilo Rucoy): elmo, peitoral, calça, luvas, botas e mochila
  // ficam só nos atributos; quem muda a aparência são as SKINS (roupas) da loja de visuais
  while (rig.helmSlot.children.length) rig.helmSlot.remove(rig.helmSlot.children[0]);
  if (cls.id === 'arqueiro' && !rig.outfitHat) rig.helmSlot.add(buildHelm('capuz', 'comum'));
  rig.M.tunic.color.set(cls.colors.tunic);
  rig.M.trim.color.set(cls.colors.trim);
  for (const s of rig.shoulders) s.visible = cls.id === 'guerreiro';
  rig.legendary = RARITY_INDEX[w?.rarity] >= 4 ? rarityColor(w.rarity) : null;
  for (const o of rig._gear || []) o.parent?.remove(o);
  rig._gear = [];
  rig.helmSlot.visible = !rig.outfit; // traje com chapéu/elmo: esconde o capuz padrão
  // peças novas desenham DEPOIS da silhueta azul (senão o herói aparece azul através delas)
  rig.root.traverse((m) => { if (m.isMesh && !m.renderOrder) m.renderOrder = 2; });
  rig.onEquip?.();
}

// ---------------- NPCs ----------------
export function buildNpc(look) {
  let rig;
  switch (look) {
    case 'mestre':
      rig = buildHumanoid({ colors: { skin: 0xe2b48c, tunic: 0x4a5a7a, pants: 0x3a3a4a, trim: 0xd9b25f, hair: 0xeeeeee }, robe: true, beard: true, cape: 0x2c3a5a });
      rig.handR.add(buildWeapon('cajado', 'raro'));
      break;
    case 'ferreira':
      rig = buildHumanoid({ colors: { skin: 0xd9a07a, tunic: 0x8a4a2a, pants: 0x3a2e26, trim: 0x5a3a22, hair: 0xb8442a }, bulk: 1.15 });
      part(G.box, new THREE.MeshLambertMaterial({ color: 0x4a3426, flatShading: true }), 0.5, 0.6, 0.05, 0, 0.3, 0.2, rig.torso);
      rig.handR.add(buildWeapon('clava', 'comum'));
      break;
    case 'mercador': {
      rig = buildHumanoid({ colors: { skin: 0xe8b98f, tunic: 0x3f7a4a, pants: 0x5a4632, trim: 0xe8c45a, hair: 0x3a2a1e }, bulk: 1.2, beard: true });
      rig.helmSlot.add(buildHelm('chapeu', 'comum'));
      part(G.box, new THREE.MeshLambertMaterial({ color: 0x7a5232, flatShading: true }), 0.5, 0.6, 0.3, 0, 0, -0.1, rig.back);
      break;
    }
    case 'fornecedora':
      rig = buildHumanoid({ colors: { skin: 0xf0c8a0, tunic: 0x5a3a8a, pants: 0x3a2e4a, trim: 0xe8c45a, hair: 0xc84a2a }, longHair: true, cape: 0x3a2a5a });
      rig.helmSlot.add(buildHelm('chapeu', 'incomum'));
      part(G.sphereLo, new THREE.MeshLambertMaterial({ color: 0xff4d5e, flatShading: true }), 0.16, 0.2, 0.16, 0.24, -0.12, 0.2, rig.hips); // poção no cinto
      part(G.sphereLo, new THREE.MeshLambertMaterial({ color: 0x4fa3ff, flatShading: true }), 0.14, 0.18, 0.14, -0.24, -0.12, 0.2, rig.hips);
      rig.handR.add(buildWeapon('orbe', 'incomum'));
      break;
    case 'banqueira':
      rig = buildHumanoid({ colors: { skin: 0xf0c8a0, tunic: 0x2c3a5a, pants: 0x1e2433, trim: 0xd9b25f, hair: 0x6a3a2a }, robe: true, longHair: true });
      part(G.box, new THREE.MeshLambertMaterial({ color: 0xd9b25f, flatShading: true }), 0.18, 0.06, 0.04, 0, 0.5, 0.24, rig.torso); // broche
      part(G.box, new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), 0.3, 0.05, 0.02, 0, 0.3, 0.27, rig.head, false); // óculos
      rig.handL.add(buildWeapon('orbe', 'raro'));
      break;
    case 'leiloeira':
      rig = buildHumanoid({ colors: { skin: 0xc98f6a, tunic: 0x8a3a2a, pants: 0x3a3a2a, trim: 0x7dffa8, hair: 0x1a1210 }, longHair: true, cape: 0x3a8a5a });
      rig.helmSlot.add(buildHelm('chapeu', 'incomum'));
      part(G.box, new THREE.MeshLambertMaterial({ color: 0x6a4a2a, flatShading: true }), 0.42, 0.34, 0.16, 0.22, -0.1, 0.18, rig.hips); // bolsa
      break;
    case 'exploradora':
      rig = buildHumanoid({ colors: { skin: 0xc98f6a, tunic: 0x2f5a3a, pants: 0x4a3a2c, trim: 0xd9b25f, hair: 0x2a1a14 }, cape: 0x24452c, longHair: true });
      rig.helmSlot.add(buildHelm('capuz', 'incomum'));
      rig.handL.add(buildWeapon('arco_longo', 'incomum'));
      break;
    case 'eco':
      rig = buildHumanoid({ ghost: true, robe: true, beard: true, cape: 0x8fe8ff });
      rig.handR.add(buildWeapon('espada', 'lendario'));
      rig.ghost = true;
      break;
    default:
      rig = buildHumanoid({});
  }
  // NPCs: as peças de cada articulação viram uma malha só (sem o brilho leve dos monstros)
  return mergeRigColors(optimizeRig(rig), 0);
}


function golemForm(def, o) {
  const { mats, torso, head, arms, legs, key } = o;
  const strip = () => { for (const g of [torso, head]) for (const m of [...g.children]) if (m.userData?.std) g.remove(m); };
  const glow = GLOW(def.glow ?? 0x6ad0ff), L = (c, x) => mats.lam(c, x);
  // variações sem "form": cada colosso com a sua matéria
  switch (key) {
    case 'guardian': { // guardião corrompido: grilhões de ferro nos punhos e uma placa de runas no peito
      const iron = L(0x4a4654);
      for (const a of arms) { part(G.cyl, iron, 0.78, 0.16, 0.74, 0, -1.08, 0.04, a); for (let i = 0; i < 3; i++) part(SH.ring, iron, 0.16, 0.16, 0.3, 0.1, -1.2 - i * 0.14, -0.3, a).rotation.y = i % 2 ? Math.PI / 2 : 0; }
      part(SH.block, L(0x5a5664), 0.5, 0.36, 0.08, 0, 0.42, 0.58, torso); for (let i = 0; i < 3; i++) part(G.box, glow, 0.05, 0.2, 0.02, (i - 1) * 0.14, 0.42, 0.63, torso, false);
      break;
    }
    case 'colosso_gelo': { // gelo: geleiras nas costas, pingentes nos braços e geada no topo
      strip();
      const ice = L(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.25) }), snow = L(0xf4faff);
      for (const [x, y, z, k, r] of [[-0.45, 1.25, -0.4, 1, 0.4], [0.4, 1.35, -0.45, 1.3, -0.3], [0, 1.45, -0.55, 1.6, 0], [0.75, 1.2, -0.2, 0.8, -0.7], [-0.75, 1.2, -0.2, 0.8, 0.7]]) { const c = part(SH.gem, ice, 0.32 * k, 0.9 * k, 0.32 * k, x, y, z, torso); c.rotation.set(-0.4, 0, r); }
      part(SH.rock, snow, 1.5, 0.3, 1.0, 0, 1.24, 0, torso); part(SH.rock, snow, 0.66, 0.2, 0.56, 0, 0.36, 0, head);
      for (const a of arms) for (let i = 0; i < 4; i++) { const ic = part(G.cone, ice, 0.09, 0.3 + (i % 2) * 0.12, 0.09, (i - 1.5) * 0.15, -1.6, 0.1, a); ic.rotation.x = Math.PI; }
      break;
    }
    case 'colosso_magma': { // magma: rocha preta com rios de lava, fumaça no topo e punhos incandescentes
      strip();
      const lava = GLOW(0xff7a2a), lava2 = GLOW(0xffd24a);
      for (let i = 0; i < 9; i++) { const c = part(G.box, i % 2 ? lava : lava2, 0.05, 0.4 + (i % 3) * 0.15, 0.03, Math.sin(i * 2.1) * 0.7, 0.4 + (i % 4) * 0.22, 0.45 + Math.cos(i * 2.1) * 0.08, torso, false); c.rotation.z = Math.sin(i * 1.3) * 0.9; }
      for (const a of arms) { part(SH.rock, L(0xff6a1a, { emissive: new THREE.Color(0xff5a1a).multiplyScalar(0.7) }), 0.6, 0.36, 0.56, 0, -1.4, 0.06, a); }
      for (let i = 0; i < 5; i++) part(G.cone, i % 2 ? lava : lava2, 0.16, 0.5, 0.16, (i - 2) * 0.22, 1.36, -0.3, torso, false);
      break;
    }
    case 'colosso_astral': { // astral: pedra noturna salpicada de estrelas, anéis e uma lua no peito
      strip();
      const st = GLOW(0xffffff), st2 = GLOW(0xc8a0ff);
      for (let i = 0; i < 22; i++) part(SH.gem, i % 3 ? st : st2, 0.05, 0.08, 0.05, Math.sin(i * 2.4) * 0.8, 0.2 + ((i * 0.37) % 1.2), 0.5 + Math.cos(i * 1.3) * 0.08, torso, false);
      const rg = part(new THREE.TorusGeometry(0.5, 0.012, 3, 28), GLOW(0xe8d8ff), 2.3, 2.3, 2.3, 0, 0.95, 0, torso, false); rg.rotation.set(1.25, 0, 0.25);
      part(new THREE.TorusGeometry(0.5, 0.16, 3, 10, Math.PI * 1.2), GLOW(0xfff4c8), 0.3, 0.3, 0.2, 0, 0.66, 0.6, torso, false).rotation.z = -0.6;
      break;
    }
    case 'touro_rochoso': { // touro rochoso: chifres de pedra, focinho com argola e corcova
      const horn = L(0xe8dcc0);
      for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.3, 0.05, 0.05], [sd * 0.45, 0.3, 0.12], [sd * 0.4, 0.55, 0.05]], 0.1, 0.02, 6, 8), horn, 1, 1, 1, sd * 0.28, 0.2, 0.1, head);
      part(SH.block, L(new THREE.Color(def.color).multiplyScalar(0.85).getHex()), 0.4, 0.28, 0.3, 0, 0.02, 0.32, head);
      for (const sd of [-1, 1]) part(G.box, L(0x1a1410), 0.06, 0.05, 0.03, sd * 0.08, 0.02, 0.48, head);
      part(SH.ring, L(0xd9b25f), 0.18, 0.18, 0.3, 0, -0.06, 0.5, head);
      part(SH.rock, o.stoneD, 1.1, 0.7, 0.8, 0, 1.3, -0.3, torso);
      break;
    }
  }
  const f = def.form; if (!f) return;
  switch (f) {
    case 'runas': { // golem de pedra: blocos lapidados com faixas de runas e um olho só
      strip();
      part(SH.block, o.stone, 1.5, 1.2, 1.05, 0, 0.6, 0, torso);
      for (const y of [0.3, 0.6, 0.9]) part(G.box, glow, 1.2, 0.04, 0.02, 0, y, 0.56, torso, false);
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) part(G.box, glow, 0.04, 0.16, 0.03, sd * (0.25 + i * 0.12), 0.45 + (i % 2) * 0.3, 0.56, torso, false);
      for (const c of [...head.children]) if (c.isMesh && c.material.isMeshBasicMaterial) head.remove(c);
      part(G.sphereLo, glow, 0.2, 0.2, 0.06, 0, 0.14, 0.27, head, false);
      for (const a of arms) { part(SH.block, o.stoneD, 0.8, 0.42, 0.8, 0, -1.3, 0.05, a); for (const sd of [-1, 1]) part(G.box, glow, 0.03, 0.26, 0.02, sd * 0.18, -1.3, 0.47, a, false); }
      break;
    }
    case 'musgo': { // golem de musgo: coberto de musgo, cogumelos, flores e cipós pendurados
      strip();
      const moss = L(0x3a7a32), moss2 = L(0x2a5a26), cap = L(0xc84a3a), stem = L(0xe8e0c8), dot = L(0xf4ecd8);
      part(SH.rock, moss, 1.7, 0.66, 1.24, 0, 1.15, 0, torso);
      for (const a of arms) { part(SH.rock, moss2, 0.76, 0.42, 0.76, 0, 0.18, 0, a); for (let i = 0; i < 3; i++) part(G.box, moss2, 0.04, 0.3 + i * 0.12, 0.03, (i - 1) * 0.14, -0.3, 0.2, a); }
      part(SH.rock, moss, 0.66, 0.32, 0.6, 0, 0.36, 0, head);
      for (const [x, z, sc] of [[-0.4, 0.2, 1], [0.35, -0.2, 1.3], [0.1, 0.35, 0.8], [-0.2, -0.35, 1.1]]) { part(G.cyl, stem, 0.08 * sc, 0.22 * sc, 0.08 * sc, x, 1.52, z, torso); part(new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0.32 * sc, 0.2 * sc, 0.32 * sc, x, 1.6, z, torso); part(G.sphereLo, dot, 0.05, 0.03, 0.05, x + 0.06 * sc, 1.66 + 0.04 * sc, z + 0.04, torso); }
      for (let i = 0; i < 8; i++) part(G.box, moss2, 0.05, 0.5 + (i % 3) * 0.25, 0.04, -0.7 + i * 0.2, 0.2, 0.56, torso);
      for (let i = 0; i < 5; i++) { const fl = group(Math.sin(i * 2.2) * 0.6, 0.9 + (i % 2) * 0.3, 0.55, torso); for (let k = 0; k < 4; k++) part(SH.leaf, L(i % 2 ? 0xffe27a : 0xff9ac0), 0.06, 0.5, 0.12, Math.cos(k * 1.57) * 0.04, 0, Math.sin(k * 1.57) * 0.04, fl).rotation.y = k * 1.57; }
      break;
    }
    case 'arenito': { // colosso de arenito: camadas de pedra, cabeça de obelisco com âmbar e hieróglifos
      strip();
      const s1 = L(0xd8b070), s2 = L(0xb08850), amber = GLOW(0xffb040), ink = L(0x6a4a2a);
      for (let i = 0; i < 4; i++) part(SH.block, i % 2 ? s1 : s2, 1.6 - i * 0.1, 0.3, 1.1 - i * 0.05, 0, 0.15 + i * 0.3, 0, torso);
      for (let i = 0; i < 8; i++) part(G.box, ink, 0.08, 0.12, 0.02, -0.5 + (i % 4) * 0.33, 0.5 + Math.floor(i / 4) * 0.3, 0.56, torso);
      for (const c of [...head.children]) head.remove(c);
      part(SH.block4, s2, 0.5, 0.8, 0.5, 0, 0.35, 0, head); part(G.cone4, s1, 0.5, 0.42, 0.5, 0, 0.96, 0, head).rotation.y = Math.PI / 4;
      part(G.octa, amber, 0.2, 0.3, 0.06, 0, 0.42, 0.26, head, false);
      for (const sd of [-1, 1]) part(G.octa, amber, 0.18, 0.24, 0.06, sd * 0.4, 0.7, 0.56, torso, false);
      for (const l of legs) part(SH.block, s1, 0.66, 0.2, 0.7, 0, -0.55, 0, l);
      break;
    }
    case 'cristal': { // colosso de cristal: corpo de pedra com cristais translúcidos enormes nas costas
      const cm = L(def.color, { transparent: true, opacity: 0.85, emissive: new THREE.Color(def.color).multiplyScalar(0.25) });
      for (const [x, y, z, sc, rz] of [[-0.5, 1.5, -0.3, 1.4, 0.4], [0.5, 1.6, -0.3, 1.6, -0.4], [0, 1.85, -0.5, 2, 0], [0, 0.7, 0.58, 0.8, 0], [-0.85, 1.4, 0, 0.8, 0.8], [0.85, 1.4, 0, 0.8, -0.8]]) { const c = part(SH.gem, cm, 0.4 * sc, 1.0 * sc, 0.4 * sc, x, y, z, torso); c.rotation.z = rz; }
      for (const a of arms) { const c = part(SH.gem, cm, 0.5, 0.9, 0.5, 0, -1.5, 0, a); c.rotation.x = Math.PI; }
      break;
    }
  }
}

// ---------- Formas: monstros que usam o mesmo corpo ganham silhueta própria ----------
const GLOW = (c) => new THREE.MeshBasicMaterial({ color: c });
function humanoidForm(rig, def) {
  const f = def.form; if (!f) return;
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const clearHand = (h) => { while (h.children.length) h.remove(h.children[0]); };
  const glow = def.glow ?? def.ranged?.color ?? 0xff6a2a;
  switch (f) {
    case 'corrompido': { // goblin tocado pela fenda: chifres, cristais nas costas, garras nas duas mãos
      const cr = GLOW(0xd36bff), dk = L(0x3a2a4a);
      for (const sd of [-1, 1]) { const h = part(G.cone, dk, 0.1, 0.36, 0.1, sd * 0.16, 0.5, 0.02, rig.head); h.rotation.z = -sd * 0.5; }
      for (const [x, y, sc] of [[-0.14, 0.62, 1], [0.12, 0.7, 1.3], [0, 0.45, 0.9], [0.24, 0.42, 0.7]]) { const c = part(G.octa, cr, 0.12 * sc, 0.36 * sc, 0.12 * sc, x, y, -0.2, rig.torso, false); c.rotation.x = -0.5; }
      clearHand(rig.handR); clearHand(rig.handL);
      for (const h of [rig.handR, rig.handL]) for (let i = -1; i <= 1; i++) { const c = part(G.cone4, GLOW(0xe8c8ff), 0.04, 0.3, 0.04, i * 0.05, -0.02, 0.16, h, false); c.rotation.x = Math.PI / 2; }
      rig.weaponKind = 'adaga'; break;
    }
    case 'diabrete': { // diabrete das cinzas: asas de morcego, chifres, rabo e brasa na mão
      const wing = L(0x3a1a14), horn = L(0x2a1a10);
      for (const sd of [-1, 1]) {
        const w = group(sd * 0.15, 0.55, -0.18, rig.torso);
        const a = part(G.box, wing, 0.62, 0.42, 0.03, sd * 0.32, 0.1, 0, w); a.rotation.z = sd * 0.35;
        for (let i = 0; i < 3; i++) { const r = part(G.box, horn, 0.05, 0.46, 0.04, sd * (0.18 + i * 0.18), 0.12, 0.01, w); r.rotation.z = sd * (0.6 - i * 0.35); }
        w.rotation.y = -sd * 0.5;
        const h = part(G.cone, horn, 0.08, 0.3, 0.08, sd * 0.14, 0.52, 0.06, rig.head); h.rotation.z = -sd * 0.3; h.rotation.x = -0.4;
      }
      let prev = rig.hips; for (let i = 0; i < 3; i++) { const t = group(0, -0.02, -0.16, prev); t.rotation.x = 0.5; part(G.box, wing, 0.06, 0.06, 0.24, 0, 0, -0.1, t); prev = t; }
      part(G.cone4, horn, 0.14, 0.2, 0.05, 0, 0, -0.26, prev).rotation.x = -Math.PI / 2;
      clearHand(rig.handR); while (rig.helmSlot.children.length) rig.helmSlot.remove(rig.helmSlot.children[0]);
      part(G.sphereLo, GLOW(0xff7a2a), 0.18, 0.18, 0.18, 0, 0, 0.1, rig.handR, false);
      rig.weaponKind = 'sling'; break;
    }
    case 'fundeiro': { // goblin fundeiro: chapéu de palha largo, saco de pedras enorme nas costas
      const straw = L(0xd8b860), sack = L(0x8a7048);
      while (rig.helmSlot.children.length) rig.helmSlot.remove(rig.helmSlot.children[0]);
      part(G.cyl, straw, 0.95, 0.05, 0.95, 0, 0.5, 0, rig.head); part(G.cone, straw, 0.5, 0.3, 0.5, 0, 0.66, 0, rig.head);
      part(G.dodeca, sack, 0.7, 0.8, 0.55, 0, 0.42, -0.42, rig.torso);
      for (let i = 0; i < 4; i++) part(G.dodeca, L(0x8a8478), 0.14, 0.14, 0.14, (i - 1.5) * 0.12, 0.86, -0.42, rig.torso);
      part(G.box, L(0x6a2a2a), 0.4, 0.12, 0.08, 0, 0.14, 0.26, rig.head);
      break;
    }
    case 'cacador': { // caçador goblin: capa de folhas, arco, aljava e penas
      const leaf = L(0x3a7a32), leaf2 = L(0x2a5a26);
      while (rig.helmSlot.children.length) rig.helmSlot.remove(rig.helmSlot.children[0]);
      part(G.sphere, leaf, 0.62, 0.5, 0.62, 0, 0.36, -0.04, rig.head);
      for (let i = 0; i < 7; i++) { const l = part(G.cone4, i % 2 ? leaf : leaf2, 0.22, 0.42, 0.06, (i - 3) * 0.1, 0.3 - Math.abs(i - 3) * 0.04, -0.28, rig.torso); l.rotation.x = Math.PI; }
      part(G.cyl, L(0x5a3a1a), 0.16, 0.6, 0.16, 0.16, 0.42, -0.24, rig.torso).rotation.z = 0.4;
      for (let i = 0; i < 3; i++) part(G.box, GLOW(0xffffff), 0.04, 0.16, 0.02, 0.26 + i * 0.03, 0.76, -0.26, rig.torso, false);
      clearHand(rig.handR); clearHand(rig.handL); rig.handL.add(buildWeapon('arco', 'incomum'));
      rig.weaponKind = 'arco'; break;
    }
    case 'arqueiro': { // arqueiro esquelético: capuz rasgado, arco longo, aljava, sem escudo
      const cloth = L(0x5a6a7a);
      part(G.sphere, cloth, 0.62, 0.5, 0.6, 0, 0.42, -0.06, rig.head);
      const tip = part(G.cone, cloth, 0.3, 0.42, 0.3, 0, 0.5, -0.3, rig.head); tip.rotation.x = -2.0;
      part(G.box, cloth, 0.5, 0.7, 0.03, 0, 0.1, -0.2, rig.torso);
      part(G.cyl, L(0x4a3a2a), 0.16, 0.62, 0.16, 0.14, 0.4, -0.22, rig.torso).rotation.z = 0.35;
      clearHand(rig.handR); clearHand(rig.handL); rig.shield = null; rig.handL.add(buildWeapon('arco_longo', 'raro'));
      rig.weaponKind = 'arco'; break;
    }
    case 'real': { // cavaleiro de osso da guarda real: coroa com chifres, peitoral dourado, machado
      const gold = L(0xc8a040);
      part(G.cyl, gold, 0.5, 0.12, 0.5, 0, 0.56, 0, rig.head);
      for (let i = 0; i < 5; i++) part(G.cone4, gold, 0.07, 0.2, 0.07, Math.cos(i * 1.256) * 0.22, 0.7, Math.sin(i * 1.256) * 0.22, rig.head);
      for (const sd of [-1, 1]) { const h = part(G.cone, L(0xe8e0c8), 0.1, 0.5, 0.1, sd * 0.3, 0.6, 0, rig.head); h.rotation.z = -sd * 0.9; }
      part(G.box, gold, 0.5, 0.42, 0.1, 0, 0.4, 0.16, rig.torso);
      clearHand(rig.handR); rig.handR.add(buildWeapon('machado', 'epico'));
      rig.weaponKind = 'machado'; break;
    }
    case 'afogado': { // conjurador afogado: algas penduradas, coroa de coral, cracas
      const alga = L(0x2a6a4a), coral = L(0xff8a7a);
      for (let i = 0; i < 6; i++) part(G.box, alga, 0.06, 0.5 + (i % 3) * 0.15, 0.03, (i - 2.5) * 0.11, -0.05, 0.3, rig.head);
      for (let i = 0; i < 4; i++) { const c = part(G.cone4, coral, 0.08, 0.3, 0.08, (i - 1.5) * 0.14, 0.7, 0, rig.head); c.rotation.z = (i - 1.5) * 0.3; }
      for (let i = 0; i < 5; i++) part(G.sphereLo, L(0xc8c0b0), 0.1, 0.07, 0.1, Math.cos(i * 2) * 0.24, 0.3 + i * 0.07, 0.22, rig.torso);
      break;
    }
    case 'necro': { // necromante: crânio com chifres na cabeça, costelas no peito, cajado com crânio
      const bone = L(0xe8e0c8);
      part(G.sphere, bone, 0.42, 0.36, 0.4, 0, 0.66, 0.05, rig.head);
      for (const sd of [-1, 1]) { const h = part(G.cone, bone, 0.09, 0.42, 0.09, sd * 0.2, 0.86, 0, rig.head); h.rotation.z = -sd * 0.6; }
      for (let i = 0; i < 4; i++) part(G.box, bone, 0.44 - i * 0.05, 0.04, 0.05, 0, 0.5 - i * 0.1, 0.22, rig.torso);
      part(G.sphere, bone, 0.26, 0.24, 0.26, 0, 0, 1.45, rig.handR);
      for (const sd of [-1, 1]) part(G.box, GLOW(glow), 0.05, 0.04, 0.02, sd * 0.06, 0.02, 1.58, rig.handR, false);
      break;
    }
    case 'arauto': { // arauto flamejante: coroa de chamas, ombros em fogo e cristais orbitando
      const fire = GLOW(0xff7a2a), fire2 = GLOW(0xffd24a);
      for (let i = 0; i < 6; i++) part(G.cone, i % 2 ? fire2 : fire, 0.12, 0.42, 0.12, Math.cos(i * 1.05) * 0.24, 0.72, Math.sin(i * 1.05) * 0.24, rig.head, false);
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) part(G.cone, i % 2 ? fire2 : fire, 0.12, 0.36, 0.12, sd * (0.36 + i * 0.06), 0.72, (i - 1) * 0.1, rig.torso, false);
      for (let i = 0; i < 3; i++) part(G.octa, GLOW(0xd36bff), 0.12, 0.26, 0.12, Math.cos(i * 2.1) * 0.6, 0.9, Math.sin(i * 2.1) * 0.6, rig.torso, false);
      break;
    }
    case 'dunas': { // feiticeiro das dunas: turbante, véu e cajado com disco do sol
      const cloth = L(0xe8d8b0), gold = L(0xd8a83a);
      part(G.sphere, cloth, 0.7, 0.42, 0.68, 0, 0.52, -0.02, rig.head);
      part(G.octa, GLOW(0xffb040), 0.12, 0.16, 0.05, 0, 0.58, 0.33, rig.head, false);
      part(G.box, cloth, 0.42, 0.18, 0.04, 0, 0.12, 0.29, rig.head);
      part(G.cyl, gold, 0.5, 0.05, 0.5, 0, 0, 1.3, rig.handR).rotation.x = Math.PI / 2;
      part(G.torus, gold, 0.5, 0.5, 0.5, 0, 0.42, 0.2, rig.torso).rotation.x = Math.PI / 2;
      break;
    }
    case 'piromante': { // piromante: sem capuz, cabelo de fogo, bolas de fogo nas duas mãos, braços em brasa
      const fire = GLOW(0xff5a1a), fire2 = GLOW(0xffc24a);
      for (let i = 0; i < 7; i++) part(G.cone, i % 2 ? fire2 : fire, 0.16, 0.5, 0.16, (i - 3) * 0.07, 0.62 + (3 - Math.abs(i - 3)) * 0.04, -0.05 - Math.abs(i - 3) * 0.03, rig.head, false);
      clearHand(rig.handR);
      for (const h of [rig.handR, rig.handL]) part(G.sphere, fire2, 0.26, 0.26, 0.26, 0, 0, 0.12, h, false);
      for (const e of [rig.elbowL, rig.elbowR]) part(G.cyl, fire, 0.2, 0.2, 0.2, 0, -0.16, 0, e, false);
      rig.weaponKind = 'orbe'; break;
    }
    case 'negro': { // cavaleiro negro: chifres longos curvos e espinhos nas costas
      const blk = L(0x18141e);
      for (const sd of [-1, 1]) { const h = part(G.cone, blk, 0.12, 0.7, 0.12, sd * 0.34, 0.62, -0.04, rig.head); h.rotation.z = -sd * 1.0; }
      for (let i = 0; i < 4; i++) part(G.cone4, blk, 0.12, 0.4, 0.12, 0, 0.7 - i * 0.18, -0.26, rig.torso).rotation.x = -0.8;
      break;
    }
    case 'fenda': { // cavaleiro da fenda: elmo de cristal, cristais nas ombreiras, machado
      const cr = GLOW(def.glow ?? 0xc8a0ff);
      for (let i = 0; i < 3; i++) part(G.octa, cr, 0.12, 0.44, 0.12, (i - 1) * 0.16, 0.76 + (i === 1 ? 0.1 : 0), 0, rig.head, false);
      for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) { const c = part(G.octa, cr, 0.1, 0.36, 0.1, sd * (0.42 + i * 0.1), 0.86, (i - 0.5) * 0.14, rig.torso, false); c.rotation.z = -sd * 0.4; }
      clearHand(rig.handR); rig.handR.add(buildWeapon('machado', 'lendario'));
      rig.weaponKind = 'machado'; break;
    }
  }
}

// ---------------- Inimigos ----------------
export function buildEnemyModel(def) {
  const rig = buildEnemyBase(def);
  if (def.champLook) dressChampion(rig, def.champLook);
  if (def.natalDress === 'rena') dressRena(rig);
  polishMob(rig, def);
  mergeRigColors(rig);
  return rig;
}

// Junta TODAS as peças paradas de cada articulação do monstro numa malha só, mesmo com cores diferentes
// (a cor vai em cada vértice). Antes cada cor era uma "pintura" separada: um monstro custava ~30–40
// chamadas de desenho; agora custa umas 10–15. O visual é o mesmo (inclusive o brilho leve das cores à noite).
// Acabamento dos monstros (custa nada a mais em desenho):
//  · luz de borda: a silhueta ganha um contorno claro (lê bem contra o chão e à noite)
//  · sombra de contato: a parte de baixo do corpo escurece um pouco (aShade), o topo fica mais claro — dá volume
const RIM_GLSL = `
	vec3 rimV = normalize(vViewPosition);
	float rimK = pow(1.0 - clamp(abs(dot(normal, rimV)), 0.0, 1.0), 2.6);
`;
function rigMergeMat(glow = 0.07) {
  // Phong com brilho por vértice (aShine): metal, gema, osso polido e olhos refletem a luz; o resto fica fosco
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, specular: 0x5a5a5a, shininess: 70 });
  // aGlow = 1: peça que era "sem luz" (olhos, dentes, detalhes que brilham) — fica com a cor pura, sem sombra
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aGlow;\nattribute float aShade;\nattribute float aShine;\nvarying float vGlow;\nvarying float vShade;\nvarying float vShine;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlow = aGlow; vShade = aShade; vShine = aShine;');
    sh.fragmentShader = 'varying float vGlow;\nvarying float vShade;\nvarying float vShine;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.directSpecular *= vShine * (1.0 - vGlow);\n\treflectedLight.indirectSpecular *= 0.0;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= (1.0 - vGlow) * vShade;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * mix(${glow.toFixed(3)}, 1.0, vGlow);${RIM_GLSL}\ttotalEmissiveRadiance += mix(vColor.rgb, vec3(1.0), 0.45) * rimK * 0.3 * (1.0 - vGlow) * vShade;`);
  };
  m.customProgramCacheKey = () => 'rigmerge4_' + glow.toFixed(3);
  return m;
}
// a mesma luz de borda nas peças que ficam separadas (olhos/partes animadas com material próprio)
function rimify(mt) {
  if (!mt || !mt.isMeshLambertMaterial || mt.vertexColors || mt.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mt.blending !== THREE.NormalBlending) return;
  mt.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${RIM_GLSL}\ttotalEmissiveRadiance += mix(diffuseColor.rgb, vec3(1.0), 0.45) * rimK * 0.3;`);
  };
  mt.customProgramCacheKey = () => 'mobrim1';
}
const _ec = new THREE.Color(), _sv = new THREE.Vector3(), _rootInv = new THREE.Matrix4(), _rb = new THREE.Box3();
let _rH = 1;
export function mergeRigColors(rig, glow = 0.07) {
  const keep = new Set();
  for (const v of Object.values(rig)) {
    if (v?.isMesh) keep.add(v);
    else if (Array.isArray(v)) for (const x of v) if (x?.isMesh) keep.add(x);
  }
  // grupos de enfeite (orelha, chapéu, presente…) que não são articulações: as peças sobem para o pai
  // (assim tudo que não se mexe sozinho vira UMA malha por articulação)
  const joints = new Set([rig.root]);
  const addJ = (v, d = 0) => { if (!v || d > 2) return; if (v.isObject3D) { joints.add(v); return; } if (Array.isArray(v)) { for (const x of v) addJ(x, d + 1); return; } if (typeof v === 'object' && !(v instanceof THREE.Material)) for (const x of Object.values(v)) addJ(x, d + 1); };
  for (const [k, v] of Object.entries(rig)) if (k !== 'mats' && k !== 'M') addJ(v);
  rig.root.updateMatrixWorld(true);
  const flatten = (g) => {
    for (const c of [...g.children]) {
      if (c.isGroup && !joints.has(c) && !Object.keys(c.userData).length && c.children.length && c.children.every((m) => m.isMesh && !m.children.length && !joints.has(m) && !m.userData.noMerge)) {
        for (const m of [...c.children]) { m.matrix.compose(m.position, m.quaternion, m.scale); m.matrix.premultiply(c.matrix.compose(c.position, c.quaternion, c.scale)); m.matrix.decompose(m.position, m.quaternion, m.scale); g.add(m); }
        g.remove(c);
      } else if (c.children.length) flatten(c);
    }
  };
  flatten(rig.root);
  // peças que dá para juntar: Lambert opaca (o brilho próprio vira "aGlow" por vértice) e Basic opaca (sem luz)
  const glowOf = (mt) => { if (mt.isMeshBasicMaterial) return 1; const e = mt.emissive, c = mt.color, el = e.r + e.g + e.b, cl = Math.max(0.05, c.r + c.g + c.b); return Math.min(0.8, Math.max(0, el / cl - 0.07)); };
  const okMat = (mt) => mt && !mt.transparent && !mt.map && !mt.vertexColors && mt.side === THREE.FrontSide && mt.depthWrite !== false && mt.blending === THREE.NormalBlending
    && ((mt.isMeshLambertMaterial && mt.emissive) || (mt.isMeshBasicMaterial && mt.opacity >= 1));
  const groups = [];
  rig.root.traverse((o) => { if (o.children.length > 1) groups.push(o); });
  let mat = null;
  rig.root.updateMatrixWorld(true);
  _rootInv.copy(rig.root.matrixWorld).invert();
  _rb.setFromObject(rig.root).applyMatrix4(_rootInv); _rH = _rb.max.y - Math.max(0, _rb.min.y); if (_rb.min.y < 0) _rb.min.y = 0;
  for (const g of groups) {
    const buckets = new Map();
    for (const m of g.children) {
      if (!m.isMesh || m.children.length || keep.has(m) || m.userData.noMerge || !m.visible || !okMat(m.material) || !m.geometry?.attributes?.position) continue;
      const key = m.castShadow ? 's' : 'n';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const ge = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        ge.applyMatrix4(m.matrix);
        for (const k of Object.keys(ge.attributes)) if (k !== 'position' && k !== 'normal') ge.deleteAttribute(k);
        if (!ge.attributes.normal) ge.computeVertexNormals();
        const n = ge.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color, glow = new Float32Array(n).fill(glowOf(m.material));
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        ge.setAttribute('color', new THREE.BufferAttribute(col, 3));
        ge.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
        // sombra de contato: altura do vértice no corpo (pose inicial) → 0,62 no pé … 1,08 no alto
        const shade = new Float32Array(n), pa = ge.attributes.position;
        for (let i = 0; i < n; i++) {
          if (glow[i] >= 1) { shade[i] = 1; continue; }
          _sv.fromBufferAttribute(pa, i).applyMatrix4(g.matrixWorld).applyMatrix4(_rootInv);
          const k = Math.min(1, Math.max(0, (_sv.y - _rb.min.y) / Math.max(0.05, _rH)));
          shade[i] = 0.62 + 0.38 * Math.min(1, k / 0.42) + 0.08 * Math.max(0, (k - 0.6) / 0.4);
        }
        ge.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
        const sk = m.material.userData.shine ?? (m.geometry === SH.gem || m.geometry === G.octa ? 0.9 : m.material.isMeshBasicMaterial ? 0 : 0.06);
        ge.setAttribute('aShine', new THREE.BufferAttribute(new Float32Array(n).fill(sk), 1));
        return ge;
      });
      let merged;
      try { merged = mergeGeometries(geos, false); } catch { merged = null; }
      for (const ge of geos) if (ge !== merged) ge.dispose();
      if (!merged) continue;
      mat ||= rigMergeMat(glow);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = list[0].castShadow;
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
  if (mat) {
    // só os materiais que ainda aparecem (o piscar de dano passa por todos eles a cada quadro)
    const used = new Set();
    rig.root.traverse((o) => { if (o.isMesh && o.material?.emissive) used.add(o.material); });
    rig.mats = [...used];
  }
  rig.root.traverse((o) => { if (o.isMesh) rimify(o.material); });
  return rig;
}

// Acabamento de TODOS os monstros: sombra macia no chão (fica "pisando" no chão), olhos que brilham
// de verdade (halo da cor do olho) e um leve brilho próprio nas cores (lê melhor à noite e na névoa).
let _blobTex = null;
function blobTexture() {
  if (_blobTex || typeof document === 'undefined') return _blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(c); return _blobTex;
}
const _haloGeo = new THREE.SphereGeometry(0.5, 8, 6), _blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function polishMob(rig, def) {
  const root = rig.root; if (!root) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const sc = root.scale.x || 1;
  // sombra macia (independente do sol): um disco escuro esfumado embaixo do monstro
  const tex = blobTexture();
  if (tex && !def.flying) {
    const w = Math.max(size.x, size.z) * 1.05 / sc;
    const blob = new THREE.Mesh(_blobGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    blob.scale.set(w, 1, w); blob.position.y = 0.04 / sc; blob.renderOrder = 1; blob.userData.noMerge = true;
    root.add(blob); rig.blob = blob;
  }
  // olhos coloridos ganham um halo brilhante (olhos pretos de gosma ficam como estão)
  const eyeMeshes = [];
  for (const e of rig.eyes || []) (e.isMesh ? [e] : e.children || []).forEach((m) => { if (m.isMesh) eyeMeshes.push(m); });
  root.traverse((m) => { if (m.isMesh && m.material?.isMeshBasicMaterial && !eyeMeshes.includes(m) && m.scale.x < 0.12 && m.scale.y < 0.1 && m.material.color && m.material.color.getHSL({}).l > 0.45 && m.material.color.getHSL({}).s > 0.5 && m.parent && (m.parent === rig.head || m.parent?.parent === rig.head)) eyeMeshes.push(m); });
  for (const m of eyeMeshes) {
    const c = m.material?.color; if (!c) continue;
    const hsl = c.getHSL({}); if (hsl.l < 0.35 || hsl.s < 0.3) continue;
    const h = new THREE.Mesh(_haloGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    const k = Math.max(m.scale.x, m.scale.y) * 2.6; h.scale.set(k / Math.max(1e-3, m.scale.x), k / Math.max(1e-3, m.scale.y), k / Math.max(1e-3, m.scale.z) * 0.5);
    h.userData.noMerge = true; h.castShadow = false; m.add(h); (rig.halos || (rig.halos = [])).push(h);
  }
  // brilho próprio bem leve nas cores do corpo
  for (const mt of rig.mats || []) if (mt.emissive && mt.color && mt.emissive.getHex() === 0) mt.emissive.copy(mt.color).multiplyScalar(0.07);
}

// ---------- Visual de chefe (campeões): coroa/chifres/auréola, capa, ombreiras, aura no chão e orbes ----------
// Tudo é medido pela caixa do próprio modelo, então serve para qualquer forma (humanoide, quadrúpede, gosma…).
const _bx = new THREE.Box3(), _m4 = new THREE.Matrix4();
function localBox(rig, obj, own = false) {
  // own: só as malhas da própria peça (sem braço/arma/capacete presos nela)
  const b = new THREE.Box3();
  if (own) for (const c of obj.children) if (c.isMesh) b.union(_bx.setFromObject(c));
  if (b.isEmpty()) b.copy(_bx.setFromObject(obj));
  return b.applyMatrix4(_m4.copy(rig.root.matrixWorld).invert());
}
function attachLocal(rig, parent, obj) {
  // obj foi montado nas medidas do modelo (espaço da raiz); converte para o espaço da peça e prende nela
  obj.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(rig.root.matrixWorld));
  parent.add(obj);
}
function crownPiece(style, metal, glow) {
  const c = new THREE.Group(), M = shiny(new THREE.MeshLambertMaterial({ color: metal, flatShading: true, emissive: new THREE.Color(metal).multiplyScalar(0.18) }), 1), Gm = GLOW(glow);
  if (style === 'chifres') {
    part(G.cyl, M, 1.06, 0.18, 1.06, 0, 0.06, 0, c);
    for (const sd of [-1, 1]) {
      const h1 = group(sd * 0.42, 0.12, 0, c); h1.rotation.z = -sd * 0.9;
      part(G.cone, M, 0.3, 0.7, 0.3, 0, 0.32, 0, h1);
      const h2 = group(0, 0.62, 0, h1); h2.rotation.z = sd * 0.75;
      part(G.cone, M, 0.2, 0.6, 0.2, 0, 0.28, 0, h2);
      part(G.octa, Gm, 0.12, 0.12, 0.12, 0, 0.6, 0, h2, false);
    }
  } else if (style === 'cristais') {
    part(G.cyl, M, 1.04, 0.16, 1.04, 0, 0.04, 0, c);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, k = i % 2 ? 0.5 : 0.85; const g = part(G.octa, Gm, 0.2, k, 0.2, Math.sin(a) * 0.44, 0.12 + k * 0.45, Math.cos(a) * 0.44, c, false); g.rotation.z = Math.sin(a) * 0.35; g.rotation.x = -Math.cos(a) * 0.35; }
  } else if (style === 'aureola') {
    part(G.cyl, M, 1.04, 0.14, 1.04, 0, 0.04, 0, c);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(G.cone4, M, 0.14, 0.34, 0.14, Math.sin(a) * 0.45, 0.28, Math.cos(a) * 0.45, c); }
    const h = part(G.torus, Gm, 1.5, 1.5, 1.5, 0, 0.85, -0.05, c, false); h.rotation.x = Math.PI / 2 - 0.25; c.userData.halo = h;
  } else { // coroa real
    part(G.cyl, M, 1.06, 0.26, 1.06, 0, 0.1, 0, c);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, k = i % 2 ? 0.34 : 0.56; part(G.cone4, M, 0.2, k, 0.2, Math.sin(a) * 0.47, 0.22 + k / 2, Math.cos(a) * 0.47, c); if (!(i % 2)) part(G.sphereLo, Gm, 0.11, 0.11, 0.11, Math.sin(a) * 0.47, 0.25 + k, Math.cos(a) * 0.47, c, false); }
    part(G.octa, Gm, 0.2, 0.26, 0.1, 0, 0.12, 0.54, c, false);
  }
  return c;
}
function dressChampion(rig, L) {
  const root = rig.root; root.updateMatrixWorld(true);
  const all = localBox(rig, root), size = all.getSize(new THREE.Vector3());
  const H = size.y, Wd = Math.max(size.x, size.z), metal = L.metal ?? 0xe8b850, glow = L.glow ?? 0xffe08a;
  // cores de chefe: puxa o corpo para o tom do tema (materiais são do próprio modelo)
  if (L.tint != null) { const t = new THREE.Color(L.tint); for (const m of rig.mats || []) if (m.color) m.color.lerp(t, L.tintK ?? 0.3); }
  // coroa / chifres / cristais / auréola no topo da cabeça (ou do corpo, se não tiver cabeça)
  const headObj = rig.head || null, hb = localBox(rig, headObj || root, !!headObj), hs = hb.getSize(new THREE.Vector3()), hc = hb.getCenter(new THREE.Vector3());
  const hw = Math.min(headObj ? Math.max(hs.x, hs.z) * 1.05 : Wd * 0.4, H * 0.24);
  const crown = crownPiece(L.crown || 'coroa', metal, glow);
  crown.scale.setScalar(hw * (L.crownK || 1)); crown.position.set(hc.x, hb.max.y - hw * 0.12, hc.z);
  if (headObj) attachLocal(rig, headObj, crown); else root.add(crown);
  rig.halo = crown.userData.halo || rig.halo;
  // capa e ombreiras (humanoides)
  if (rig.kind === 'humanoid' && rig.torso) {
    const tb = localBox(rig, rig.torso, true), ts = tb.getSize(new THREE.Vector3()), tc = tb.getCenter(new THREE.Vector3());
    if (L.cape != null) {
      const cm = clothMat(rig, L.cape), trim = clothMat(rig, metal);
      const len = Math.min(Math.max(ts.y * 1.6, H * 0.5), H * 0.62), cw = Math.min(ts.x * 1.05, Wd * 0.45), cape = new THREE.Group();
      const pcs = [[CLOTH_BOX, cw, len * 0.98, 0.05, 0, -len * 0.49, 0], [CLOTH_BOX, cw * 1.08, len * 0.06, 0.09, 0, 0, 0.01]];
      for (let i = -2; i <= 2; i++) pcs.push([CLOTH_TIP, cw * 0.18, len * 0.12, 0.05, i * cw * 0.22, -len * 1.02, 0, Math.PI]);
      cape.add(clothMesh(pcs, cm, 0, len));
      cape.add(clothMesh([[CLOTH_BOX, cw * 1.04, len * 0.05, 0.07, 0, -len * 0.95, 0.01]], trim, 0, len));
      cape.position.set(tc.x, tb.max.y - ts.y * 0.08, tb.min.z - 0.03); cape.rotation.x = 0.08;
      attachLocal(rig, rig.torso, cape);
    }
    for (const arm of [rig.armL, rig.armR]) {
      if (!arm) continue;
      const ab = localBox(rig, arm, true), as = ab.getSize(new THREE.Vector3()), ac = ab.getCenter(new THREE.Vector3());
      const k = Math.min(Math.max(Math.max(as.x, as.z) * 1.35, H * 0.085), H * 0.14), pd = new THREE.Group(), M = new THREE.MeshLambertMaterial({ color: L.pauldron ?? metal, flatShading: true });
      part(G.sphereLo, M, 1, 0.62, 1, 0, 0, 0, pd);
      part(G.cyl, new THREE.MeshLambertMaterial({ color: metal, flatShading: true }), 1.04, 0.12, 1.04, 0, -0.16, 0, pd);
      for (let i = 0; i < 3; i++) { const sp = part(G.cone4, M, 0.2, 0.55, 0.2, (i - 1) * 0.24, 0.38, 0, pd); sp.rotation.z = (i - 1) * -0.5 * Math.sign(ac.x || 1); }
      part(G.octa, GLOW(glow), 0.16, 0.16, 0.16, 0, 0.08, 0.45, pd, false);
      pd.scale.setScalar(k); pd.position.set(ac.x, ab.max.y - k * 0.12, ac.z);
      attachLocal(rig, arm, pd);
    }
  } else if (rig.spine || rig.body) {
    // quadrúpedes/gosmas: cristais ou espinhos brilhantes nas costas
    const host = rig.spine || rig.body, bb = localBox(rig, host, true), bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    const Gm = GLOW(glow), n = 5;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) - 0.5, k = (1 - Math.abs(f) * 1.2) * Math.min(bs.x, bs.y) * 0.55;
      const sp = part(G.octa, Gm, k * 0.35, k, k * 0.35, bc.x, bb.max.y + k * 0.3, bc.z + f * bs.z * 0.7, null, false);
      sp.rotation.x = -f * 0.6; attachLocal(rig, host, sp);
    }
  }
  // olhos brilhando na cor do chefe
  const eyeGlow = GLOW(glow);
  for (const e of rig.eyes || []) (e.isMesh ? [e] : e.children || []).forEach((m) => { if (m.isMesh) m.material = eyeGlow; });
  // brilho fraco no corpo inteiro (destaca no meio dos comuns)
  const gcol = new THREE.Color(glow);
  for (const m of rig.mats || []) if (m.emissive) m.emissive.add(gcol.clone().multiplyScalar(0.06));
  if (rig.kind === 'humanoid' && rig.torso) {
    const tb = localBox(rig, rig.torso, true), ts = tb.getSize(new THREE.Vector3()), tc = tb.getCenter(new THREE.Vector3());
    // emblema brilhando no peito (moldura de metal + joia)
    const em = Math.min(ts.x * 0.34, H * 0.075), plate = new THREE.Group(), pm = new THREE.MeshLambertMaterial({ color: metal, flatShading: true });
    const ringE = part(G.torus, pm, em * 1.5, em * 1.5, em * 1.2, 0, 0, 0, plate); ringE.rotation.x = 0;
    part(G.octa, GLOW(glow), em * 0.9, em * 1.15, em * 0.4, 0, 0, 0.02, plate, false);
    for (const sd of [-1, 1]) part(G.cone4, pm, em * 0.3, em * 0.9, em * 0.2, sd * em * 0.95, em * 0.35, 0, plate).rotation.z = -sd * 0.9;
    plate.position.set(tc.x, tc.y + ts.y * 0.1, tb.max.z + 0.02); attachLocal(rig, rig.torso, plate);
    // espinhos nas costas
    const sp = new THREE.Group(), sm = new THREE.MeshLambertMaterial({ color: metal, flatShading: true });
    for (let i = 0; i < 4; i++) { const k = Math.min(ts.y * 0.32, H * 0.1) * (1 - i * 0.16); const c = part(G.cone4, i % 2 ? GLOW(glow) : sm, k * 0.34, k, k * 0.34, 0, ts.y * (0.28 - i * 0.2), -k * 0.3, sp, false); c.position.y = Math.min(ts.y, H * 0.3) * (0.28 - i * 0.2); c.rotation.x = -1.0; }
    sp.position.set(tc.x, tc.y, tb.min.z - 0.02); attachLocal(rig, rig.torso, sp);
    // arma maior
    if (rig.handR) rig.handR.scale.multiplyScalar(1.3);
    if (rig.handL) rig.handL.scale.multiplyScalar(1.15);
  }

  // aura no chão + orbes girando (animados em anim.js via rig.champFx)
  const fx = new THREE.Group(); root.add(fx);
  const ringM = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.55, depthWrite: false });
  const ring = part(G.torus, ringM, Wd * 1.1, Wd * 1.1, Wd * 0.6, 0, 0.04, 0, fx, false); ring.rotation.x = Math.PI / 2;
  const disc = part(G.cyl, new THREE.MeshBasicMaterial({ color: L.aura ?? glow, transparent: true, opacity: 0.18, depthWrite: false }), Wd * 1.05, 0.01, Wd * 1.05, 0, 0.03, 0, fx, false);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(G.cone4, ringM, Wd * 0.07, Wd * 0.16, Wd * 0.07, Math.cos(a) * Wd * 0.56, 0.06, Math.sin(a) * Wd * 0.56, fx, false); }
  const orbs = group(0, H * 0.55, 0, root);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; part(G.octa, GLOW(glow), Wd * 0.09, Wd * 0.14, Wd * 0.09, Math.cos(a) * Wd * 0.75, 0, Math.sin(a) * Wd * 0.75, orbs, false); }
  rig.champFx = { ring, disc, orbs, ringM, t: Math.random() * 6 };
  rig.height = (rig.height || H) * 1.08;
}

function buildEnemyBase(def) {
  switch (def.model) {
    case 'slime': return buildSlime(def);
    case 'wolf': return buildWolf(def);
    case 'goblin': return buildGoblin(def);
    case 'skeleton': return buildSkeleton(def);
    case 'golem': return buildGolem(def, false);
    case 'boss': return buildGolem(def, true);
    case 'quad': return buildQuad(def);
    case 'cultist': return buildCultist(def);
    case 'knight': return buildKnight(def);
    case 'lizardman': return buildLizardman(def);
    case 'treant': return buildTreant(def);
    case 'beastman': return buildBeastman(def);
    case 'titan': return buildTitan(def);
    case 'brain': return buildBrain(def);
    case 'medusa': return buildMedusa(def);
    case 'fungo': return buildFungo(def);
    case 'warden': return buildWarden(def);
    case 'noel': return buildNoel(def);
    case 'boneco': return buildBoneco(def);
    default: return buildSlime(def);
  }
}

function buildSlime(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const key = def.key || '', rift = def.variant === 'rift';
  const col = new THREE.Color(def.color), dark = col.clone().multiplyScalar(0.62), deep = col.clone().multiplyScalar(0.4);
  const light = col.clone().lerp(new THREE.Color(0xffffff), 0.35);
  const m = new THREE.MeshPhongMaterial({ color: def.color, flatShading: true, transparent: true, opacity: 0.8, emissive: col.clone().multiplyScalar(0.18), specular: 0x3a3a3a, shininess: 110 }); mats.list.push(m);
  // poça com borda ondulada, corpo em gota (base larga, bico em cima) e uma gotinha no topo
  const puddle = part(SH_PUDDLE_DOME, mats.lam(dark.getHex(), { transparent: true, opacity: 0.6 }), 1.45, 0.16, 1.45, 0, 0.05, 0, body, false);
  const blob = part(SH.drop, m, 1.0, 1.02, 1.0, 0, 0, 0, body);
  const top = part(G.sphere, m, 0.22, 0.26, 0.22, 0, 1.02, -0.06, body);
  // escorridos na base (gotas que descem pelo corpo)
  // núcleo (gira devagar): miolo mais escuro + o que a gosma engoliu
  const core = group(0, 0.42, -0.04, body);
  part(G.sphereLo, mats.lam(deep.getHex()), 0.34, 0.3, 0.34, 0, 0, 0, core, false);
  // brilho molhado: faixa curva de luz, pontinho de reflexo e bolhas (tudo num material só)
  const bub = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const arc = new THREE.Mesh(SH_GLOSS_ARC, bub); arc.position.set(-0.17, 0.7, 0.36); arc.rotation.set(-0.5, -0.45, 0.6); arc.scale.setScalar(0.42); body.add(arc);
  part(G.sphereLo, bub, 0.07, 0.05, 0.03, -0.36, 0.56, 0.42, body, false);
  for (let i = 0; i < 4; i++) part(G.sphereLo, bub, 0.05 + i * 0.025, 0.05 + i * 0.025, 0.05 + i * 0.025, Math.cos(i * 2.3) * 0.26, 0.24 + i * 0.13, Math.sin(i * 2.3) * 0.2 - 0.05, body, false);
  // rosto: olhos grandes e brilhantes com pálpebra, bochechas coradas e boca com língua
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x15121a }), hl = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lid = mats.lam(dark.getHex());
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = group(s * 0.2, 0.58, 0.45, body);
    e.rotation.y = s * 0.38;
    part(G.sphere, eyeM, 0.22, 0.28, 0.12, 0, 0, 0, e, false);
    part(G.sphereLo, hl, 0.085, 0.085, 0.03, 0.04, 0.07, 0.055, e, false);
    part(G.sphereLo, hl, 0.04, 0.04, 0.02, -0.045, -0.07, 0.055, e, false);
    const ld = part(SH_GLOSS_ARC, lid, 0.26, 0.26, 0.3, 0, 0.1, -0.02, e, false); ld.rotation.z = Math.PI / 2 - 0.65 + s * 0.1;
    eyes.push(e);
  }
  const blush = mats.lam(col.clone().lerp(new THREE.Color(0xff7a9a), 0.55).getHex());
  for (const s of [-1, 1]) { const c = part(G.sphereLo, blush, 0.13, 0.06, 0.03, s * 0.34, 0.42, 0.44, body, false); c.rotation.y = s * 0.65; }
  { const sm = part(SH_GLOSS_ARC, new THREE.MeshBasicMaterial({ color: 0x2a0f1a }), 0.2, 0.2, 0.3, 0, 0.42, 0.52, body, false); sm.rotation.z = Math.PI + 0.9; }
  const mouth = group(0, 0.37, 0.53, body);
  mouth.scale.y = 0.05;
  part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x2a0f1a }), 0.24, 1, 0.08, 0, 0, 0, mouth, false);
  part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0xd8506a }), 0.13, 0.5, 0.06, 0, -0.22, 0.015, mouth, false);
  const R = { kind: 'slime', root, body, blob, core, top, puddle, eyes, mouth, mats: mats.list, height: 1.0 * (def.size || 1), blinkT: Math.random() * 3 };
  slimeLook(R, def, { mats, m, col, dark, deep, light, key, rift });
  root.scale.setScalar(def.size || 1);
  return optimizeRig(R);
}
const SH_PUDDLE_DOME = (() => { const g = new THREE.SphereGeometry(0.43, 18, 3, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x), k = 1 + Math.sin(a * 6) * 0.08 + Math.sin(a * 11 + 1) * 0.05; p.setX(i, x * k); p.setZ(i, z * k); } g.translate(0, -0.22, 0); g.computeVertexNormals(); return g; })();
const SH_GLOSS_ARC = new THREE.TorusGeometry(0.5, 0.07, 3, 10, 1.3);
// v0.12: cúpula (meia esfera), arco por cima do corpo (listras/faixas) e prisma de 6 lados (placas de casco)
const SH_DOME = new THREE.SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
const SH_ARC = new THREE.TorusGeometry(0.5, 0.035, 3, 14, 2.4).rotateZ(Math.PI / 2 - 1.2);
const SH_HEX = new THREE.CylinderGeometry(0.5, 0.56, 1, 6);
// cada gosma tem o seu "recheio" e enfeites (mesma forma, essência de cada uma)
function slimeLook(R, def, c) {
  const { mats, col, dark, light, key } = c, body = R.body, core = R.core;
  const L = (x, o) => mats.lam(x, o), GL = (x) => GLOW(x);
  const sprout = (leafCol, y = 1.08) => { const st = part(G.cyl, L(0x6a8a3a), 0.03, 0.18, 0.03, 0, y, -0.06, body); void st; for (const sd of [-1, 1]) { const lf = part(SH.leaf, L(leafCol), 0.22, 0.6, 0.3, sd * 0.1, y + 0.1, -0.06, body); lf.rotation.set(0.3, sd * 0.5, sd * -0.7); } };
  switch (key) {
    case 'slime': // Slime do Vale: brotinho no topo e uma folha + pedrinha engolidas
      sprout(0x4aa83a); R.top.visible = false;
      { const lf = part(SH.leaf, L(0x3a7a2a), 0.2, 0.6, 0.26, 0.12, 0.05, 0, core); lf.rotation.set(0.6, 0.4, 0.3); part(SH.rock, L(0x8a8478), 0.14, 0.12, 0.14, -0.12, -0.05, 0.05, core); }
      break;
    case 'gosma_brejo': { // vitória-régia no topo com florzinha, algas e lodo dentro
      R.top.visible = false;
      const pad = part(G.cyl, L(0x3a7a32), 0.62, 0.04, 0.62, 0, 1.0, -0.04, body); pad.rotation.z = 0.08;
      part(G.box, L(0x2a5a26), 0.04, 0.045, 0.3, 0, 1.0, 0.16, body);
      for (let i = 0; i < 5; i++) { const pt = part(SH.leaf, L(0xff9ac0), 0.12, 0.5, 0.2, Math.cos(i * 1.26) * 0.06, 1.07, Math.sin(i * 1.26) * 0.06 - 0.06, body); pt.rotation.set(0.9, i * 1.26, 0); }
      part(G.sphereLo, GL(0xffe27a), 0.06, 0.05, 0.06, 0, 1.08, -0.06, body, false);
      for (let i = 0; i < 4; i++) part(G.box, L(0x2a4a1a), 0.03, 0.3 + i * 0.05, 0.03, Math.cos(i * 1.7) * 0.12, 0, Math.sin(i * 1.7) * 0.12, core);
      break;
    }
    case 'gosma_mel': { // gosma de mel: favo dentro, mel escorrendo e uma abelha presa
      const honey = L(0xffb020, { emissive: new THREE.Color(0xffb020).multiplyScalar(0.25) });
      part(SH.drop, honey, 0.74, 0.42, 0.74, 0, 0.7, -0.03, body); R.top.material = honey;
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95) continue; const r = 0.45, L2 = 0.14 + (i % 3) * 0.1; part(SH.drop, honey, 0.1, -L2, 0.1, Math.sin(a) * r, 0.76, Math.cos(a) * r, body); }
      const comb = L(0xe8a830); for (let i = 0; i < 4; i++) { const h = part(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), comb, 0.14, 0.16, 0.14, (i % 2) * 0.13 - 0.06, (i >> 1) * 0.11 - 0.05, 0, core); h.rotation.x = Math.PI / 2; }
      const bee = group(0.18, 0.12, 0.1, core); part(G.sphereLo, L(0xffd030), 0.12, 0.09, 0.09, 0, 0, 0, bee); for (const x of [-0.02, 0.03]) part(G.box, L(0x1a1410), 0.025, 0.1, 0.1, x, 0, 0, bee);
      for (const sd of [-1, 1]) { const w = part(SH.leaf, L(0xe8f4ff), 0.1, 0.5, 0.14, 0, 0.06, sd * 0.06, bee); w.rotation.x = sd * 0.6; }
      break;
    }
    case 'gosma_ambar': { // âmbar: inseto preso no meio e cristais de âmbar na base
      const bug = group(0, 0, 0, core);
      part(G.capsule, L(0x2a1a10), 0.08, 0.16, 0.08, 0, 0, 0, bug).rotation.z = Math.PI / 2;
      for (let i = -1; i <= 1; i++) for (const sd of [-1, 1]) { const lg = part(G.box, L(0x2a1a10), 0.015, 0.14, 0.015, i * 0.06, -0.06, sd * 0.05, bug); lg.rotation.x = sd * 0.6; }
      for (const sd of [-1, 1]) { const w = part(SH.leaf, L(0xd8c8a0), 0.12, 0.5, 0.2, 0.02, 0.07, sd * 0.07, bug); w.rotation.x = sd * 0.5; }
      for (let i = 0; i < 6; i++) { const a = i * 1.05; const g = part(SH.gem, L(0xffa020, { emissive: new THREE.Color(0xffa020).multiplyScalar(0.3) }), 0.16, 0.32, 0.16, Math.sin(a) * 0.62, 0.1, Math.cos(a) * 0.62, body); g.rotation.z = Math.sin(a) * 0.5; g.rotation.x = Math.cos(a) * 0.5; }
      break;
    }
    case 'gosma_esmeralda': { // esmeralda: lascas de gema dentro e uma coroa de cristal no topo
      const em = GL(0x5effa8);
      for (let i = 0; i < 5; i++) part(SH.gem, em, 0.1, 0.2, 0.1, Math.cos(i * 1.3) * 0.14, Math.sin(i * 2) * 0.08, Math.sin(i * 1.3) * 0.14, core, false);
      R.top.visible = false;
      for (let i = 0; i < 3; i++) { const g = part(SH.gem, L(0x3ae08a, { emissive: new THREE.Color(0x3ae08a).multiplyScalar(0.35) }), 0.16, 0.42 - i * 0.08, 0.16, (i - 1) * 0.12, 1.06 - Math.abs(i - 1) * 0.08, -0.06, body); g.rotation.z = (1 - i) * 0.4; }
      break;
    }
    case 'gosma_gelo': { // gelo: capuz de neve, pingentes na base e floco de neve dentro
      const snow = L(0xf4faff), ice = L(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.25) });
      part(SH.drop, snow, 0.74, 0.42, 0.74, 0, 0.7, -0.03, body); for (let i = 0; i < 7; i++) { const a = i * 0.9; part(SH.drop, snow, 0.12, -0.12 - (i % 2) * 0.06, 0.1, Math.sin(a) * 0.45, 0.76, Math.cos(a) * 0.45, body); }
      R.top.material = snow;
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.4; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95) continue; const ic = part(G.cone, ice, 0.07, 0.22 + (i % 3) * 0.08, 0.07, Math.sin(a) * 0.48, 0.66 - (i % 3) * 0.04, Math.cos(a) * 0.48, body); ic.rotation.x = Math.PI; }
      const fl = GL(0xe8f8ff);
      for (let i = 0; i < 3; i++) { const b = part(G.box, fl, 0.03, 0.34, 0.03, 0, 0, 0, core, false); b.rotation.z = i * 1.047; }
      for (let i = 0; i < 5; i++) { const a = i * 1.26; const sp = part(SH.gem, ice, 0.12, 0.3, 0.12, Math.sin(a) * 0.6, 0.12, Math.cos(a) * 0.6, body); sp.rotation.z = Math.sin(a) * 0.6; sp.rotation.x = Math.cos(a) * 0.6; }
      break;
    }
    case 'gosma_magma': { // magma: crosta de rocha com rachaduras de lava e brasas por dentro
      const rock = L(0x2a1a14), lava = GL(0xffb040), lava2 = GL(0xff5a1a);
      for (let i = 0; i < 12; i++) { const a = i * 0.62 + 0.3, ty = i % 3, y = 0.62 + ty * 0.14, r = 0.5 - ty * 0.11; if (ty < 2 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95) continue; const pl = part(SH.rock, rock, 0.34, 0.12, 0.3, Math.sin(a) * r, y, Math.cos(a) * r, body); pl.rotation.set(Math.cos(a) * 0.8, a, -Math.sin(a) * 0.8); }
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.35; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.7) continue; const cr = part(G.box, lava, 0.018, 0.22, 0.012, Math.sin(a) * 0.6, 0.28, Math.cos(a) * 0.6, body, false); cr.rotation.y = a; cr.rotation.z = (i % 2 ? 0.4 : -0.3); }
      for (let i = 0; i < 6; i++) part(G.sphereLo, i % 2 ? lava : lava2, 0.07, 0.07, 0.07, Math.cos(i * 2.2) * 0.2, Math.sin(i * 1.6) * 0.12, Math.sin(i * 2.2) * 0.2, core, false);
      R.top.material = L(0xff6a1a, { emissive: new THREE.Color(0xff5a1a).multiplyScalar(0.6) });
      break;
    }
    case 'gosma_astral': { // astral: uma pequena galáxia dentro (estrelas e um planeta com anel)
      const st = GL(0xffffff), st2 = GL(0xc8a0ff);
      for (let i = 0; i < 9; i++) { const a = i * 0.7; part(SH.gem, i % 3 ? st : st2, 0.05, 0.08, 0.05, Math.cos(a) * (0.12 + (i % 3) * 0.08), Math.sin(i * 1.9) * 0.14, Math.sin(a) * (0.12 + (i % 3) * 0.08), core, false); }
      const pl = group(0.12, 0.05, 0, core); part(G.sphereLo, L(0x6a5ad8), 0.14, 0.14, 0.14, 0, 0, 0, pl); const rg = part(SH.ring, GL(0xe8d8ff), 0.3, 0.3, 0.1, 0, 0, 0, pl, false); rg.rotation.x = 1.2;
      for (let i = 0; i < 4; i++) part(SH.gem, GL(0xffffff), 0.05, 0.1, 0.05, Math.cos(i * 1.57) * 0.22, 1.12 + (i % 2) * 0.06, Math.sin(i * 1.57) * 0.22 - 0.06, body, false);
      break;
    }
    case 'rei_slime': { // Rei Slime: coroa grande com joias, manto curto, sobrancelhas bravas e bigode real
      const gold = L(0xffd24a, { emissive: new THREE.Color(0xffd24a).multiplyScalar(0.12) }), gem = GL(0xff4f6a), gem2 = GL(0x5ef0ff);
      const crown = group(0, 0.84, -0.04, body);
      part(G.cyl, gold, 0.56, 0.16, 0.56, 0, 0, 0, crown);
      part(G.cyl, L(0x8a1a2a), 0.5, 0.1, 0.5, 0, 0.12, 0, crown);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, k = i % 2 ? 0.2 : 0.32; part(G.cone4, gold, 0.1, k, 0.1, Math.cos(a) * 0.27, 0.12 + k / 2, Math.sin(a) * 0.27, crown); if (!(i % 2)) part(G.sphereLo, i % 4 ? gem2 : gem, 0.06, 0.06, 0.06, Math.cos(a) * 0.27, 0.3 + k / 2, Math.sin(a) * 0.27, crown, false); }
      part(SH.gem, gem, 0.12, 0.16, 0.06, 0, 0.03, 0.29, crown, false);
      R.top.visible = false;
      for (const e of R.eyes) e.scale.set(1.15, 0.8, 1);
      for (const sx of [-1, 1]) { const br = part(G.box, L(0x1e4a34), 0.24, 0.06, 0.06, sx * 0.21, 0.76, 0.43, body, false); br.rotation.z = sx * 0.4; }
      for (const sx of [-1, 1]) { const mu = part(taperTube([[0, 0, 0], [sx * 0.12, -0.03, 0.03], [sx * 0.24, 0.04, 0]], 0.04, 0.012, 5, 5), L(0x2a5a3a), 1, 1, 1, 0, 0.44, 0.55, body); void mu; }
      const capeM = clothMat(R, 0x8a1a2a); const cape = clothMesh([[new THREE.CylinderGeometry(0.46, 0.62, 0.56, 14, 5, true, Math.PI * 0.7, Math.PI * 0.6), 1, 1, 1, 0, -0.28, 0]], capeM, 0, 0.56); cape.position.set(0, 0.76, -0.04); body.add(cape);
      part(G.cyl, L(0xffd24a), 0.08, 0.66, 0.08, 0, 0.38, -0.66, body).visible = false;
      for (let i = 0; i < 9; i++) part(G.sphereLo, L(0xf4f0e8), 0.12, 0.1, 0.1, Math.sin((i - 4) * 0.28) * 0.55, 0.74, -Math.cos((i - 4) * 0.28) * 0.45, body); // gola de arminho
      break;
    }
    case 'rift_slime': { // gosma da fenda: grupo de cristais saindo do topo e núcleo-olho da fenda
      const cr = GL(0xd36bff), cr2 = GL(0xf0c8ff);
      for (let i = 0; i < 5; i++) { const a = i * 1.26; const g = part(SH.gem, i % 2 ? cr2 : cr, 0.12, 0.34 + (i % 3) * 0.1, 0.12, Math.cos(a) * 0.22, 0.98, Math.sin(a) * 0.22 - 0.05, body, false); g.rotation.z = Math.cos(a) * 0.5; g.rotation.x = -Math.sin(a) * 0.5; }
      part(G.sphereLo, GL(0x5ef0ff), 0.16, 0.16, 0.16, 0, 0, 0, core, false);
      R.top.visible = false;
      break;
    }
  }
  if (def.form === 'brasa') { // brasa-viva: carvão rachado por fora, lava por dentro e labaredas no topo
    const rock = L(0x2a1a14), rock2 = L(0x3a2418), f1 = GL(0xff7a2a), f2 = GL(0xffd24a), f3 = GL(0xff3a10);
    for (let i = 0; i < 11; i++) { const a = i * 0.8, y = 0.15 + (i % 4) * 0.18, r = 0.56 - (i % 4) * 0.07; if ((i % 4 === 2 || i % 4 === 3) && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.8) continue; const rk = part(SH.rock, i % 2 ? rock : rock2, 0.32, 0.2, 0.3, Math.sin(a) * r, y, Math.cos(a) * r, body); rk.rotation.set(Math.cos(a) * 0.6, a, -Math.sin(a) * 0.6); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.4; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.7) continue; const cr = part(G.box, f2, 0.016, 0.24, 0.012, Math.sin(a) * 0.61, 0.3, Math.cos(a) * 0.61, body, false); cr.rotation.y = a; cr.rotation.z = (i % 2 ? 0.5 : -0.4); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; const fl = part(taperTube([[0, 0, 0], [Math.cos(a) * 0.05, 0.25, Math.sin(a) * 0.05], [-Math.cos(a) * 0.04, 0.5 + (i % 3) * 0.12, 0]], 0.09, 0.0, 5, 5), [f1, f2, f3][i % 3], 1, 1, 1, Math.cos(a) * 0.18, 0.88, Math.sin(a) * 0.18 - 0.04, body, false); void fl; }
    R.top.visible = false;
  }
  if (def.variant === 'alma') { // alma acorrentada: chama fantasma presa por correntes e uma bola de ferro, sem rosto
    for (const e of R.eyes) e.visible = false; R.mouth.visible = false; R.puddle.visible = false;
    body.traverse((o) => { if (o.isMesh && o.material === c.m) o.visible = false; });
    for (const ch of [...body.children]) if (ch.isMesh && ch.material?.isMeshLambertMaterial && ch !== R.blob && ch !== R.top && ch.material !== c.m && ch.material.color?.getHex() === col.clone().lerp(new THREE.Color(0xff7a9a), 0.55).getHex()) ch.visible = false;
    const ghost = new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.42, depthWrite: false });
    R.blob.material = ghost; R.blob.visible = true; R.blob.scale.set(0.9, 1.1, 0.9); R.top.visible = false;
    part(SH.gem, GL(0xe8ffff), 0.32, 0.5, 0.32, 0, 0.5, 0, body, false);
    const fl = new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 5; i++) { const a = i * 1.26; part(taperTube([[0, 0, 0], [Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08], [-Math.cos(a) * 0.06, 0.62 + (i % 2) * 0.2, -Math.sin(a) * 0.04]], 0.12, 0.0, 5, 5), fl, 1, 1, 1, Math.cos(a) * 0.16, 0.85, Math.sin(a) * 0.16, body, false); }
    const iron = L(0x4a4654), iron2 = L(0x6a6676);
    for (let i = 0; i < 10; i++) { const a = i * 0.63; const lk = part(SH.ring, i % 2 ? iron : iron2, 0.16, 0.16, 0.3, Math.sin(a) * 0.5, 0.42 + Math.sin(a * 2) * 0.06, Math.cos(a) * 0.5, body); lk.rotation.set(i % 2 ? 0 : Math.PI / 2, a, 0); }
    part(G.cyl, iron2, 0.6, 0.1, 0.6, 0, 0.42, 0, body);
    for (let i = 0; i < 4; i++) { const lk = part(SH.ring, iron, 0.14, 0.14, 0.26, 0.5 + i * 0.12, 0.3 - i * 0.07, 0.1, body); lk.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, 0.5); }
    part(G.sphereLo, L(0x2a2832), 0.36, 0.36, 0.36, 1.0, 0.1, 0.1, body);
  }
  if (def.form === 'abissal') { // gosma abissal: um olho enorme com pálpebra e tentáculos que se curvam
    for (const e of R.eyes) e.visible = false; R.mouth.visible = false; R.top.visible = false;
    body.traverse((o) => { if (o.isMesh && o.material?.color && o.parent === body && o.scale.x === 0.13) o.visible = false; });
    const eye = group(0, 0.6, 0.42, body);
    part(G.sphere, new THREE.MeshBasicMaterial({ color: 0xf0f0ff }), 0.5, 0.5, 0.3, 0, 0, 0, eye, false);
    part(G.sphereLo, GL(0x5ef0ff), 0.26, 0.3, 0.12, 0, 0, 0.12, eye, false);
    part(G.sphereLo, GL(0x0a0a14), 0.09, 0.2, 0.06, 0, 0, 0.18, eye, false);
    part(G.sphereLo, GL(0xffffff), 0.06, 0.06, 0.03, 0.06, 0.08, 0.2, eye, false);
    for (const sd of [-1, 1]) { const ld = part(G.sphere, L(dark.getHex()), 0.56, 0.22, 0.34, 0, sd * 0.2, -0.02, eye); ld.rotation.x = sd * 0.25; }
    const tm = L(col.clone().multiplyScalar(0.7).getHex()), tip = L(col.clone().lerp(new THREE.Color(0x7ad0ff), 0.5).getHex());
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
      part(taperTube([[0, 0, 0], [ca * 0.35, 0.05, sa * 0.35], [ca * 0.7, 0.3, sa * 0.7], [ca * 0.8, 0.6, sa * 0.8 + 0.1]], 0.13, 0.02, 6, 9), i % 2 ? tm : tip, 1, 1, 1, ca * 0.38, 0.1, sa * 0.38, body);
      for (let k = 0; k < 3; k++) part(G.sphereLo, GL(0x7ad0ff), 0.045, 0.045, 0.045, ca * (0.55 + k * 0.17), 0.13 + k * 0.12, sa * (0.55 + k * 0.17), body, false);
    }
  }
}

function buildWolf(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const key = def.key || '', C = new THREE.Color(def.color);
  const fur = mats.lam(def.color), dark = mats.lam(C.clone().multiplyScalar(0.55).getHex()), mid = mats.lam(C.clone().multiplyScalar(0.78).getHex());
  const light = mats.lam(C.clone().lerp(new THREE.Color(0xf2ece0), 0.5).getHex());
  const nose = shiny(mats.lam(0x161214), 0.9), claw = shiny(mats.lam(0x2a2420), 0.4), fangM = new THREE.MeshBasicMaterial({ color: 0xf6f2e8 }), mouthM = mats.lam(0x3a1418), tongue = mats.lam(0xd0566a), inner = mats.lam(0xc88a8a);
  const spine = group(0, 0.86, 0, body);
  // tronco: peito fundo, cintura fina e anca forte (blocos chanfrados, silhueta de lobo)
  part(SH.block, fur, 0.52, 0.56, 0.5, 0, 0.0, 0.26, spine);
  part(SH.block, fur, 0.42, 0.42, 0.42, 0, 0.04, -0.12, spine);
  part(SH.block, mid, 0.46, 0.46, 0.38, 0, 0.06, -0.45, spine);
  part(SH.block, light, 0.36, 0.2, 0.52, 0, -0.24, 0.12, spine);              // barriga clara
  part(SH.block, light, 0.34, 0.36, 0.22, 0, -0.1, 0.48, spine);               // peito claro
  // juba: tufos em camadas em volta do pescoço e no lombo
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.6; const t = part(SH.fang, i % 2 ? dark : fur, 0.18, 0.42, 0.14, Math.sin(a) * 0.3, 0.12 + Math.cos(a) * 0.18, 0.42, spine); t.rotation.set(-1.9, 0, -a * 0.9); }
  for (let i = 0; i < 7; i++) { const t = part(SH.fang, i % 2 ? dark : mid, 0.13, 0.3, 0.1, (i % 2 - 0.5) * 0.1, 0.3 - i * 0.012, 0.3 - i * 0.14, spine); t.rotation.x = -1.15; }
  for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5) * 2.2; const t = part(SH.fang, light, 0.14, 0.32, 0.1, Math.sin(a) * 0.16, -0.24, 0.5, spine); t.rotation.set(Math.PI - 0.45, 0, a * 0.5); }
  // cabeça: crânio, testa, focinho que afina, nariz, bochechas peludas e orelhas com o lado de dentro rosado
  const head = group(0, 0.2, 0.66, spine);
  part(SH.block, fur, 0.42, 0.36, 0.38, 0, 0.04, 0.02, head);
  part(SH.block, dark, 0.36, 0.08, 0.2, 0, 0.21, 0.08, head);                  // testa/sobrancelha
  const snout = part(SH.limb, light, 0.24, 0.36, 0.2, 0, -0.02, 0.32, head); snout.rotation.x = Math.PI / 2;
  part(SH.block, fur, 0.2, 0.08, 0.3, 0, 0.08, 0.3, head);                     // cana do nariz
  part(SH.block4, nose, 0.1, 0.07, 0.07, 0, 0.06, 0.5, head);
  for (const sd of [-1, 1]) {
    const ck = part(SH.fang, light, 0.14, 0.3, 0.1, sd * 0.23, -0.06, 0.02, head); ck.rotation.set(0, 0, sd * 2.1);
    const ear = group(sd * 0.14, 0.2, -0.02, head); ear.rotation.set(-0.15, 0, -sd * 0.18);
    part(SH.fang, dark, 0.2, 0.24, 0.09, 0, 0.11, 0, ear);
    part(SH.fang, inner, 0.12, 0.16, 0.04, 0, 0.09, 0.035, ear);
  }
  const eyeCol = def.variant === 'rift' ? 0x5ef0ff : def.variant === 'alpha' ? 0x9fd8ff : 0xffd34a;
  const eyeM = new THREE.MeshBasicMaterial({ color: eyeCol }), pup = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
  const eyes = [];
  for (const sd of [-1, 1]) {
    const e = part(G.box, eyeM, 0.09, 0.045, 0.03, sd * 0.12, 0.13, 0.2, head, false); e.rotation.set(0, sd * 0.35, sd * 0.25); eyes.push(e);
    part(G.box, pup, 0.025, 0.04, 0.02, sd * 0.12, 0.13, 0.215, head, false).rotation.z = sd * 0.25;
    part(G.box, dark, 0.13, 0.04, 0.05, sd * 0.12, 0.175, 0.2, head).rotation.z = sd * 0.42; // sobrancelha brava
  }
  // dentes de cima e mandíbula com língua e presas
  for (const sd of [-1, 1]) part(SH.fang, fangM, 0.04, 0.1, 0.04, sd * 0.07, -0.08, 0.44, head, false).rotation.x = Math.PI;
  const jaw = group(0, -0.08, 0.2, head);
  part(SH.block, light, 0.2, 0.07, 0.3, 0, -0.03, 0.15, jaw);
  part(SH.block, mouthM, 0.16, 0.03, 0.24, 0, 0.01, 0.14, jaw);
  part(SH.block, tongue, 0.1, 0.02, 0.2, 0, 0.02, 0.16, jaw);
  for (const sd of [-1, 1]) part(SH.fang, fangM, 0.035, 0.08, 0.035, sd * 0.06, 0.03, 0.28, jaw, false);
  // pernas: coxa forte, canela fina, pata com dedos e garras
  const legs = [], lows = [];
  for (const [x, z, front] of [[-0.19, 0.36, 1], [0.19, 0.36, 1], [-0.19, -0.5, 0], [0.19, -0.5, 0]]) {
    const l = group(x, -0.08, z, spine);
    if (front) part(SH.limb, fur, 0.18, 0.42, 0.22, 0, -0.17, 0, l).rotation.x = Math.PI;
    else { part(SH.block, mid, 0.22, 0.42, 0.34, 0, -0.12, -0.02, l); }
    const lo = group(0, -0.36, front ? 0 : -0.04, l);
    part(SH.limb, dark, 0.12, 0.38, 0.13, 0, -0.17, 0, lo).rotation.x = Math.PI;
    part(SH.block4, dark, 0.15, 0.08, 0.2, 0, -0.37, 0.05, lo);
    for (const cx of [-0.045, 0, 0.045]) { const c = part(SH.fang, claw, 0.03, 0.07, 0.03, cx, -0.39, 0.16, lo, false); c.rotation.x = Math.PI / 2 + 0.3; }
    for (let k = 0; k < 2; k++) { const tf = part(SH.fang, k ? dark : mid, 0.1, 0.22, 0.08, 0, -0.16 - k * 0.12, front ? -0.1 : -0.18, l); tf.rotation.x = Math.PI - 0.6; }
    { const tf = part(SH.fang, dark, 0.08, 0.16, 0.06, 0, -0.06, -0.08, lo); tf.rotation.x = Math.PI - 0.5; }
    legs.push(l); lows.push(lo);
  }
  // cauda cheia: base escura e ponta clara (duas juntas, balançam)
  const tail = group(0, 0.08, -0.62, spine);
  part(G.sphere, fur, 0.17, 0.17, 0.46, 0, -0.02, -0.16, tail);
  for (let i = 0; i < 4; i++) { const tf = part(SH.fang, mid, 0.1, 0.22, 0.08, Math.sin(i * 1.6) * 0.07, Math.cos(i * 1.6) * 0.07, -0.16 - i * 0.05, tail); tf.rotation.set(-Math.PI / 2 - 0.3, i * 1.6, 0); }
  const tail2 = group(0, 0, -0.36, tail);
  part(G.sphere, mid, 0.22, 0.22, 0.38, 0, 0, -0.08, tail2);
  { const tt = part(SH.fang, light, 0.2, 0.3, 0.2, 0, 0, -0.32, tail2); tt.rotation.x = -Math.PI / 2; }
  const R = { kind: 'wolf', style: 'wolf', root, body, spine, head, jaw, legs, lows, tail, tail2, eyes, mats: mats.list, height: 1.3 * (def.size || 1) };
  wolfLook(R, def, { mats, fur, dark, mid, light, C, key });
  root.scale.setScalar(def.size || 1);
  return optimizeRig(R);
}
// marcas próprias de cada lobo
function wolfLook(R, def, c) {
  const { mats, dark, light, key } = c, sp = R.spine, hd = R.head, L = (x, o) => mats.lam(x, o);
  const tailTip = () => R.tail2.children[R.tail2.children.length - 1];
  const backCrystals = (col, n = 5, k = 1) => { for (let i = 0; i < n; i++) { const g = part(SH.gem, GLOW(i % 2 ? col : 0xffffff), 0.12 * k, (0.3 + (i % 3) * 0.12) * k, 0.12 * k, (i % 2 - 0.5) * 0.12, 0.34, 0.3 - i * 0.18, sp, false); g.rotation.x = -0.35; g.rotation.z = (i % 2 - 0.5) * 0.6; } };
  switch (key) {
    case 'wolf': { // lobo selvagem: cicatriz no olho, orelha rasgada e pelo arrepiado
      part(G.box, L(0xd8b8a8), 0.025, 0.2, 0.02, -0.12, 0.14, 0.215, hd, false).rotation.z = 0.35;
      for (let i = 0; i < 3; i++) part(SH.fang, dark, 0.1, 0.24, 0.08, (i - 1) * 0.08, 0.32, -0.42, sp).rotation.x = -0.8;
      break;
    }
    case 'rift_wolf': backCrystals(0xd36bff); part(SH.gem, GLOW(0xd36bff), 0.08, 0.14, 0.04, 0, 0.2, 0.24, hd, false); break;
    case 'alpha_wolf': case 'lobo_gelo': { // lobos brancos: espinhos de gelo no lombo, lua na testa (alfa) e pelo de geada
      const ice = L(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.3) });
      for (let i = 0; i < 6; i++) { const g = part(SH.gem, ice, 0.1, 0.3 + (i % 2) * 0.14, 0.1, (i % 2 - 0.5) * 0.14, 0.34, 0.36 - i * 0.18, sp); g.rotation.x = -0.4; }
      for (let i = 0; i < 4; i++) part(SH.fang, ice, 0.08, 0.2, 0.08, (i - 1.5) * 0.08, -0.32, 0.48, sp).rotation.x = Math.PI;
      if (key === 'alpha_wolf') { const moon = part(new THREE.TorusGeometry(0.5, 0.16, 3, 10, Math.PI * 1.2), GLOW(0xe8f6ff), 0.12, 0.12, 0.1, 0, 0.2, 0.2, hd, false); moon.rotation.z = -0.6; }
      break;
    }
    case 'chacal_areia': { // chacal: orelhonas, focinho fino, lombo escuro e colar de contas
      for (const eg of hd.children) if (eg.isGroup) eg.scale.set(1.35, 1.7, 1.2);
      part(SH.block, L(0x4a3424), 0.36, 0.1, 0.9, 0, 0.27, -0.1, sp);
      const bead = [L(0xd84a2a), L(0x3ab0c8), L(0xffd24a)];
      for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.4; part(G.sphereLo, bead[i % 3], 0.06, 0.06, 0.06, Math.sin(a) * 0.27, 0.0 + Math.cos(a) * 0.1 - 0.12, 0.5 + Math.cos(a) * 0.04, sp); }
      for (let i = 0; i < 4; i++) part(G.box, L(0x2a1a10), 0.04, 0.03, 0.22, 0, 0.27, 0.15 - i * 0.2, sp).rotation.y = 0.5;
      break;
    }
    case 'lobo_esmeralda': { // esmeralda: cipós e folhas no pelo, joia verde na testa e cristais pequenos
      const leaf = L(0x4aa83a), leaf2 = L(0x2a7a2a);
      for (let i = 0; i < 8; i++) { const lf = part(SH.leaf, i % 2 ? leaf : leaf2, 0.14, 0.6, 0.26, (i % 2 - 0.5) * 0.3, 0.3, 0.4 - i * 0.12, sp); lf.rotation.set(0.4, i, (i % 2 - 0.5) * 1.2); }
      part(SH.gem, GLOW(0x5effa8), 0.1, 0.14, 0.05, 0, 0.2, 0.22, hd, false);
      for (let i = 0; i < 3; i++) part(SH.gem, L(0x3ae08a, { emissive: new THREE.Color(0x3ae08a).multiplyScalar(0.35) }), 0.08, 0.22, 0.08, 0, 0.34, -0.1 - i * 0.16, sp).rotation.x = -0.4;
      break;
    }
    case 'lobo_brejo': { // brejo: manchas de lama, juncos e algas pingando
      const mud = L(0x3a2a1a), alga = L(0x3a6a2a);
      for (let i = 0; i < 6; i++) part(SH.rock, mud, 0.22, 0.08, 0.2, (i % 2 - 0.5) * 0.36, -0.1 + (i % 3) * 0.1, 0.3 - i * 0.16, sp);
      for (let i = 0; i < 5; i++) part(G.box, alga, 0.03, 0.22 + (i % 2) * 0.1, 0.02, (i - 2) * 0.08, -0.36, 0.4 - i * 0.18, sp);
      for (let i = 0; i < 3; i++) { const r = part(G.cyl, L(0x8a7a3a), 0.02, 0.22, 0.02, (i - 1) * 0.06, 0.36, -0.25, sp); r.rotation.z = (i - 1) * 0.3; }
      break;
    }
    case 'cao_brasa': { // cão de brasa: rachaduras de lava, juba de fogo e ponta da cauda em chamas
      const f1 = GLOW(0xff7a2a), f2 = GLOW(0xffd24a);
      for (let i = 0; i < 7; i++) { const t = part(taperTube([[0, 0, 0], [0, 0.18, -0.06], [0, 0.34 + (i % 2) * 0.1, 0.02]], 0.07, 0, 5, 5), i % 2 ? f1 : f2, 1, 1, 1, (i % 2 - 0.5) * 0.12, 0.26, 0.42 - i * 0.14, sp, false); void t; }
      for (let i = 0; i < 6; i++) { const cr = part(G.box, f2, 0.02, 0.16, 0.012, (i % 2 ? 1 : -1) * 0.27, -0.02 + (i % 3) * 0.08, 0.3 - i * 0.15, sp, false); cr.rotation.z = (i % 2 ? 0.5 : -0.5); }
      part(taperTube([[0, 0, 0], [0, 0.1, -0.1], [0, 0.3, -0.16]], 0.12, 0, 5, 5), f1, 1, 1, 1, 0, 0, -0.26, R.tail2, false);
      if (tailTip()) tailTip().visible = false;
      break;
    }
    case 'lobo_astral': { // astral: pelo de céu noturno com estrelas, chifres de lua
      const st = GLOW(0xffffff), st2 = GLOW(0xc8a0ff);
      for (let i = 0; i < 14; i++) part(SH.gem, i % 3 ? st : st2, 0.035, 0.05, 0.035, Math.sin(i * 2.4) * 0.26, 0.05 + Math.cos(i * 1.7) * 0.22, 0.4 - (i / 13) * 0.95, sp, false);
      for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.06, 0.16, -0.05], [sd * 0.02, 0.3, -0.16]], 0.04, 0.005, 5, 6), L(0xe8e0ff, { emissive: new THREE.Color(0xc8a0ff).multiplyScalar(0.4) }), 1, 1, 1, sd * 0.1, 0.22, 0.02, hd);
      break;
    }
    case 'campeao_ruptura': backCrystals(0xff4fd8, 6, 1.3); break;
  }
  if (def.form === 'sombrio') { // lobo sombrio: máscara de crânio, espinhos de osso e fumaça escura
    const bone = L(0xe8e0c8), smoke = new THREE.MeshBasicMaterial({ color: 0x1a1420, transparent: true, opacity: 0.5, depthWrite: false });
    part(SH.block, bone, 0.44, 0.3, 0.3, 0, 0.1, 0.18, hd); part(SH.limb, bone, 0.26, 0.34, 0.22, 0, 0.02, 0.36, hd).rotation.x = Math.PI / 2;
    for (const sd of [-1, 1]) { part(G.box, GLOW(0xff3b5a), 0.09, 0.05, 0.03, sd * 0.12, 0.14, 0.33, hd, false); part(SH.block4, L(0x0a0808), 0.12, 0.09, 0.03, sd * 0.12, 0.14, 0.325, hd); }
    for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.05, 0.18, -0.06], [sd * 0.02, 0.36, -0.22]], 0.06, 0.008, 5, 6), bone, 1, 1, 1, sd * 0.14, 0.24, 0.06, hd);
    for (let i = 0; i < 6; i++) part(SH.fang, bone, 0.08, 0.3, 0.08, 0, 0.32, 0.34 - i * 0.17, sp).rotation.x = -0.6;
    for (let i = 0; i < 5; i++) part(G.sphereLo, smoke, 0.4, 0.3, 0.4, (i % 2 - 0.5) * 0.3, -0.1 + (i % 3) * 0.12, -0.5 + i * 0.22, sp, false);
  }
}

function buildGoblin(def) {
  const sling = def.variant === 'sling', key = def.key || '';
  const skin = new THREE.Color(def.color);
  const rig = buildHumanoid({ mob: true, colors: { skin: def.color, tunic: sling ? 0x5a4a2a : 0x6b4a2e, pants: 0x4a3a28, trim: 0x8a6a42, hair: 0x2a2a1a, leather: 0x3a2a1a, boots: skin.clone().multiplyScalar(0.85).getHex() },
    bald: true, headScale: 1.18, scale: def.size || 0.8, hunch: 0.32, detail: false, sleeves: false, eyeColor: 0x0c0a06 });
  rig.kind = 'humanoid';
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const skinM = L(def.color), skinD = L(skin.clone().multiplyScalar(0.7).getHex()), skinL = L(skin.clone().lerp(new THREE.Color(0xf0e8a0), 0.3).getHex());
  const leather = L(0x5a3a22), leatherD = L(0x3a2616), boneM = shiny(L(0xe8e0c8), 0.25), toothM = shiny(L(0xf4ecd8), 0.4), metal = shiny(L(0x8a8478), 0.7), rust = L(0x7a4a2a);
  const H = rig.head, T = rig.torso, hs = 1.18;
  // cabeça: orelhonas caídas com furos, nariz comprido e torto, olhos amarelos de pupila fina, sobrancelha pesada
  for (const sd of [-1, 1]) {
    const ear = group(sd * 0.26 * hs, 0.28 * hs, -0.03, H); ear.rotation.set(0, -sd * 0.35, 0);
    const e1 = part(SH.leaf, skinM, 0.42, 1.6, 0.56, sd * 0.2, 0.04, 0, ear); e1.rotation.set(Math.PI / 2, 0, sd * (Math.PI / 2 + 0.3), 'ZYX');
    const e2 = part(SH.leaf, L(skin.clone().lerp(new THREE.Color(0xd88a7a), 0.45).getHex()), 0.26, 1.2, 0.4, sd * 0.19, 0.04, 0.025, ear); e2.rotation.set(Math.PI / 2, 0, sd * (Math.PI / 2 + 0.3), 'ZYX');
    part(SH.ring, shiny(L(0xd9b25f), 1), 0.06, 0.06, 0.1, sd * 0.3, -0.04, 0.02, ear).rotation.y = Math.PI / 2;
  }
  part(taperTube([[0, 0, 0], [0, -0.02, 0.12], [0, -0.1, 0.2]], 0.065, 0.02, 6, 6), skinD, 1, 1, 1, 0, 0.24 * hs, 0.26 * hs, H);
  const sclera = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (const sd of [-1, 1]) {
    part(G.sphereLo, sclera, 0.13, 0.11, 0.05, sd * 0.11 * hs, 0.28 * hs, 0.235 * hs, H, false);
    const br = part(SH.block, skinD, 0.17, 0.05, 0.08, sd * 0.11 * hs, 0.35 * hs, 0.23 * hs, H); br.rotation.z = -sd * 0.38;
    part(G.sphereLo, skinL, 0.07, 0.05, 0.06, sd * 0.2 * hs, 0.18 * hs, 0.2 * hs, H); // bochecha
  }
  for (const e of rig.eyes) { e.scale.set(0.022, 0.08, 0.02); e.position.z += 0.012; e.position.y = 0.28 * hs; e.position.x *= 1.15; }
  // boca larga com dentões de baixo (dentuço) e dentinhos de cima
  part(SH.block4, L(0x2a1010), 0.26, 0.05, 0.05, 0, 0.12 * hs, 0.255 * hs, H);
  for (const sd of [-1, 1]) { part(SH.fang, toothM, 0.05, 0.11, 0.045, sd * 0.08, 0.15 * hs, 0.27 * hs, H); part(G.box, toothM, 0.03, 0.04, 0.02, sd * 0.03, 0.11 * hs, 0.27 * hs, H); }
  part(SH.block, skinM, 0.3, 0.08, 0.16, 0, 0.08 * hs, 0.2 * hs, H); // queixo pra frente
  for (const [x, y, z] of [[0.15, 0.42, 0.18], [-0.08, 0.5, 0.12], [0.2, 0.3, -0.1]]) part(G.sphereLo, skinD, 0.06, 0.05, 0.06, x * hs, y * hs, z * hs, H); // verrugas
  { const hair = group(0, 0, 0, H); for (let i = 0; i < 4; i++) part(taperTube([[0, 0, 0], [0.02, 0.06, -0.02], [0.05 - i * 0.03, 0.1, -0.06]], 0.012, 0.004, 4, 4), L(0x1a1a10), 1, 1, 1, (i - 1.5) * 0.05, 0.55 * hs, 0.02, hair); }
  // corpo: barrigão, colete de couro aberto, tanga em farrapos, colar com caveirinha e bolsas no cinto
  part(G.sphere, skinM, 0.5, 0.42, 0.36, 0, 0.26, 0.12, T);
  part(G.sphereLo, skinD, 0.06, 0.05, 0.03, 0, 0.22, 0.3, T); // umbigo
  for (const sd of [-1, 1]) { const v = part(SH.block, leather, 0.22, 0.56, 0.42, sd * 0.24, 0.36, -0.02, T); v.rotation.z = sd * 0.08; }
  part(SH.block, leatherD, 0.62, 0.08, 0.42, 0, 0.08, 0, T);
  for (let i = 0; i < 6; i++) { const f = part(G.cone4, leather, 0.12, 0.26, 0.04, (i - 2.5) * 0.08, -0.16, 0.17, rig.hips); f.rotation.x = Math.PI; }
  for (let i = 0; i < 5; i++) { const f = part(G.cone4, leatherD, 0.12, 0.22, 0.04, (i - 2) * 0.09, -0.15, -0.17, rig.hips); f.rotation.x = Math.PI; }
  part(SH.block, leatherD, 0.56, 0.08, 0.36, 0, 0.1, 0, rig.hips);
  part(SH.block4, L(0x7a5a3a), 0.15, 0.16, 0.1, -0.26, 0.02, 0.1, rig.hips); part(SH.block4, L(0x6a4a2a), 0.12, 0.13, 0.09, 0.26, 0.02, 0.08, rig.hips);
  for (let i = 0; i < 5; i++) { const a = (i / 4 - 0.5) * 1.6; const t = part(SH.fang, boneM, 0.04, 0.1, 0.04, Math.sin(a) * 0.2, 0.62 - Math.cos(a) * 0.04 + 0.04, 0.2 + Math.cos(a) * 0.02, T); t.rotation.x = Math.PI; }
  part(G.sphereLo, boneM, 0.1, 0.1, 0.08, 0, 0.5, 0.24, T); for (const sd of [-1, 1]) part(G.box, L(0x1a1410), 0.025, 0.025, 0.02, sd * 0.025, 0.51, 0.285, T);
  // ombreira de couro com espinho num ombro só, faixas nos punhos e joelhos, pés de garra
  { const pd = part(G.sphereLo, leatherD, 0.32, 0.18, 0.3, -0.36, 0.66, 0, T); pd.rotation.z = 0.4; part(SH.fang, boneM, 0.06, 0.18, 0.06, -0.42, 0.78, 0, T).rotation.z = 0.5; }
  for (const e of [rig.elbowL, rig.elbowR]) part(SH.block, L(0xb8a07a), 0.2, 0.1, 0.2, 0, -0.2, 0, e);
  for (const k of [rig.kneeL, rig.kneeR]) { part(SH.block, L(0xb8a07a), 0.22, 0.08, 0.22, 0, -0.02, 0, k); for (const t of [-1, 0, 1]) part(SH.fang, L(0x2a2410), 0.03, 0.07, 0.03, t * 0.05, -0.43, 0.2, k).rotation.x = Math.PI / 2; }
  // arma: adaga enferrujada (saqueador) ou clava com estilingue na cinta (atirador)
  if (sling) { rig.handR.add(buildWeapon('clava', 'comum')); part(taperTube([[0, 0, 0], [0.1, -0.1, 0.05], [0.22, -0.02, 0.08]], 0.015, 0.015, 4, 5), leatherD, 1, 1, 1, 0.12, 0.1, 0.16, rig.hips); }
  else rig.handR.add(buildWeapon('adaga', 'comum'));
  rig.weaponKind = sling ? 'sling' : 'adaga';
  if (key === 'goblin_atirador') { // gorro de couro com pena e bolsa de pedras
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), leather); cap.scale.set(0.66, 0.5, 0.64); cap.position.set(0, 0.36 * hs, -0.02); H.add(cap);
    part(SH.leaf, L(0xd84a2a), 0.12, 0.5, 0.4, 0.18, 0.62 * hs, -0.14, H).rotation.set(-0.6, 0, -0.4);
    for (let i = 0; i < 3; i++) part(SH.rock, L(0x8a8478), 0.08, 0.08, 0.08, 0.27 + (i % 2) * 0.04, 0.12 + i * 0.03, 0.12, rig.hips);
  }
  if (key === 'goblin_lodo') { // goblin do lodo: lama escorrendo, algas na cabeça e um sapinho no ombro
    const mud = L(0x3a2a1a), alga = L(0x3a6a2a);
    for (let i = 0; i < 6; i++) part(SH.drop, mud, 0.12, -0.18 - (i % 3) * 0.06, 0.08, (i - 2.5) * 0.09, 0.3, 0.3, T);
    for (let i = 0; i < 5; i++) part(G.box, alga, 0.04, 0.24 + (i % 2) * 0.1, 0.02, (i - 2) * 0.09, 0.42 * hs, 0.05, H).rotation.z = (i - 2) * 0.2;
    const frog = group(0.34, 0.8, 0.02, T); part(G.sphereLo, L(0x5aa83a), 0.14, 0.1, 0.16, 0, 0, 0, frog); for (const sd of [-1, 1]) part(G.sphereLo, GLOW(0xffe27a), 0.04, 0.04, 0.04, sd * 0.04, 0.05, 0.06, frog, false);
  }
  humanoidForm(rig, def);
  return optimizeRig(rig);
}

const M_BONE = (rig, c) => rig._bone || (rig._bone = (() => { const m = shiny(new THREE.MeshLambertMaterial({ color: c, flatShading: true }), 0.3); rig.mats.push(m); return m; })());
function buildSkeleton(def) {
  const rig = buildHumanoid({ style: 'bone', colors: { skin: def.color, tunic: def.color, pants: def.color, trim: 0x4a4a52, hair: def.color }, cape: 0x2a2630, scale: def.size || 1, detail: false, eyeColor: 0x7fd8ff });
  const rust = new THREE.MeshLambertMaterial({ color: 0x6a5a4a, flatShading: true });
  rig.mats.push(rust);
  // ombreira enferrujada, elmo quebrado e escudo rachado
  // ombreira de placas, elmo de ferro amassado (cúpula, aba, protetor de nariz e rebites) e manchas de ferrugem
  const iron = shiny(new THREE.MeshLambertMaterial({ color: 0x6a6670, flatShading: true }), 0.7), rustSpot = new THREE.MeshLambertMaterial({ color: 0x8a4a2a, flatShading: true }); rig.mats.push(iron, rustSpot);
  for (let i = 0; i < 3; i++) { const pl = part(G.sphereLo, i % 2 ? rust : iron, 0.36 - i * 0.04, 0.16, 0.36, -0.3 - i * 0.03, 0.66 - i * 0.08, 0, rig.torso); pl.rotation.z = 0.4 + i * 0.15; }
  const helmDome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), iron); helmDome.scale.set(0.6, 0.6, 0.58); helmDome.position.set(0, 0.27, -0.01); rig.head.add(helmDome);
  part(G.cyl, iron, 0.66, 0.04, 0.64, 0, 0.28, -0.01, rig.head);
  part(G.box, iron, 0.05, 0.16, 0.04, 0, 0.24, 0.28, rig.head);
  part(G.box, rust, 0.06, 0.07, 0.56, 0, 0.56, -0.02, rig.head);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; part(G.sphereLo, rust, 0.035, 0.035, 0.035, Math.sin(a) * 0.32, 0.3, Math.cos(a) * 0.31, rig.head); }
  part(G.sphereLo, rustSpot, 0.14, 0.06, 0.1, 0.14, 0.45, 0.12, rig.head);
  // cinto de couro podre com fivela enferrujada, tiras de pano caídas e ossinhos pendurados
  const rot = new THREE.MeshLambertMaterial({ color: 0x3a2e26, flatShading: true }), cloth = new THREE.MeshLambertMaterial({ color: 0x4a3e48, flatShading: true }); rig.mats.push(rot, cloth);
  part(G.box, rot, 0.36, 0.06, 0.2, 0, 0.1, 0, rig.hips); part(SH.block4, iron, 0.08, 0.07, 0.04, 0, 0.1, 0.11, rig.hips);
  for (let i = 0; i < 4; i++) { const st = part(G.box, cloth, 0.08, 0.3 - (i % 2) * 0.08, 0.02, (i - 1.5) * 0.08, -0.08, 0.1, rig.hips); st.rotation.z = (i - 1.5) * 0.1; part(G.cone4, cloth, 0.06, 0.08, 0.02, (i - 1.5) * 0.08 + (i % 2 - 0.5) * 0.02, -0.25 + (i % 2) * 0.08, 0.1, rig.hips).rotation.x = Math.PI; }
  for (let i = 0; i < 2; i++) { const bn = part(G.capsule, M_BONE(rig, def.color), 0.03, 0.08, 0.03, 0.15 + i * 0.04, -0.02 - i * 0.04, 0.08, rig.hips); bn.rotation.z = 0.6; }
  const sh = buildWeapon('escudo', 'comum');
  sh.traverse((m) => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0x4a3a2e), 0.6); } });
  sh.position.set(0, 0, 0.12); sh.scale.setScalar(0.85);
  rig.handL.add(sh); rig.shield = sh;
  const sw = buildWeapon('espada', 'comum');
  sw.traverse((m) => {
    if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0x7a5a3a), 0.5); }
  });
  rig.handR.add(sw);
  rig.weaponKind = 'espada';
  // alma presa nas costelas (brilha na cor dos olhos), dentes e rachaduras no crânio
  const soul = new THREE.MeshBasicMaterial({ color: def.variant === 'rei' ? 0x7fd8ff : 0x8fe8ff, transparent: true, opacity: 0.85 });
  part(G.octa, soul, 0.14, 0.2, 0.14, 0, 0.42, 0.02, rig.torso, false);
  part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), 0.36, 0.4, 0.3, 0, 0.42, 0.02, rig.torso, false);
  for (let k = -2; k <= 2; k++) part(G.box, new THREE.MeshLambertMaterial({ color: 0xf4ecd8, flatShading: true }), 0.035, 0.05, 0.02, k * 0.045, 0.14, 0.235, rig.head);
  { const cr = part(G.box, new THREE.MeshBasicMaterial({ color: 0x2a2620 }), 0.02, 0.14, 0.02, 0.12, 0.42, 0.2, rig.head, false); cr.rotation.z = 0.5; }
  if (def.variant === 'rei') { // Lorde dos Ossos: coroa, capa vermelha rasgada, olhos azuis e espadona
    const gold = new THREE.MeshLambertMaterial({ color: 0xd9b25f, flatShading: true }); rig.mats.push(gold);
    const crown = group(0, 0.4, -0.02, rig.head);
    part(G.cyl, gold, 0.5, 0.12, 0.5, 0, 0, 0, crown);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(G.cone4, gold, 0.09, 0.24, 0.09, Math.cos(a) * 0.23, 0.15, Math.sin(a) * 0.23, crown); }
    part(G.octa, new THREE.MeshBasicMaterial({ color: 0x7fd8ff }), 0.1, 0.14, 0.06, 0, 0.06, 0.25, crown, false);
    const capeM = clothMat(rig, 0x6a1418), pcs = [];
    for (let k = 0; k < 4; k++) { const ln = 1.05 - (k % 2) * 0.18; pcs.push([CLOTH_BOX, 0.18, ln, 0.03, -0.26 + k * 0.175, -ln / 2, 0.01]); pcs.push([CLOTH_TIP, 0.13, 0.14, 0.03, -0.26 + k * 0.175, -ln - 0.06, 0.01, Math.PI]); }
    if (rig.cape) rig.cape.add(clothMesh(pcs, capeM, 0, 1.1));
    for (const sd of [-1, 1]) part(G.dodeca, rust, 0.34, 0.26, 0.34, sd * 0.32, 0.62, 0, rig.torso);
    while (rig.handR.children.length) rig.handR.remove(rig.handR.children[0]);
    const big = buildWeapon('montante', 'epico');
    big.traverse((m) => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0x9fd8ff), 0.3); } });
    rig.handR.add(big); rig.sword = big; rig.weaponKind = 'montante';
  }
  humanoidForm(rig, def);
  return optimizeRig(rig);
}

function buildGolem(def, boss) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const C = new THREE.Color(def.color), key = def.key || '';
  const stone = mats.lam(def.color), stoneD = mats.lam(C.clone().multiplyScalar(0.7).getHex()), stoneL = mats.lam(C.clone().lerp(new THREE.Color(0xffffff), 0.18).getHex()), stoneDD = mats.lam(C.clone().multiplyScalar(0.48).getHex());
  const glowCol = boss ? 0xff4fd8 : def.glow ?? 0xc04cff;
  const crystal = new THREE.MeshBasicMaterial({ color: glowCol }), glowM = crystal;
  const std = (m) => { m.userData.std = true; return m; }; // peças padrão (cada forma pode tirar)
  // pernas: coxa de pilar, joelho de pedra e pé largo com dedos
  const legs = [];
  for (const sd of [-1, 1]) {
    const l = group(sd * 0.42, 1.05, 0, body);
    part(SH.block, stoneD, 0.54, 0.62, 0.6, 0, -0.28, 0, l);
    part(SH.rock, stone, 0.5, 0.42, 0.52, 0, -0.56, 0.06, l);
    part(SH.block, stoneD, 0.48, 0.42, 0.52, 0, -0.78, 0, l);
    part(SH.block, stone, 0.66, 0.2, 0.78, 0, -0.98, 0.08, l);
    for (const tx of [-0.2, 0, 0.2]) part(SH.rock, stoneL, 0.18, 0.14, 0.2, tx, -0.98, 0.44, l);
    legs.push(l);
  }
  // tronco: cintura, peito enorme em blocos e placas, pedra das costas e o núcleo brilhando numa fenda do peito
  const torso = group(0, 1.1, 0, body);
  part(SH.block, stoneDD, 1.0, 0.36, 0.72, 0, 0.06, 0, torso);
  part(SH.rock, stone, 1.62, 1.2, 1.12, 0, 0.66, 0, torso);
  part(SH.block, stoneL, 0.62, 0.5, 0.3, -0.36, 0.86, 0.42, torso).rotation.set(-0.1, 0.25, 0.08);
  part(SH.block, stoneL, 0.62, 0.5, 0.3, 0.36, 0.86, 0.42, torso).rotation.set(-0.1, -0.25, -0.08);
  part(SH.block, stone, 0.9, 0.36, 0.32, 0, 0.36, 0.44, torso).rotation.x = 0.12;
  part(SH.rock, stoneD, 1.2, 0.9, 0.7, 0, 0.9, -0.36, torso);
  part(SH.block, stoneDD, 0.36, 0.5, 0.2, 0, 0.66, 0.5, torso);
  const core = part(G.octa, crystal, 0.3, 0.42, 0.18, 0, 0.66, 0.58, torso, false);
  // cabeça pequena afundada nos ombros: testa de laje, olhos em fenda e queixo de pedra
  const head = group(0, 1.35, 0.14, torso);
  part(SH.block, stoneD, 0.58, 0.46, 0.52, 0, 0.1, 0, head);
  part(SH.block, stoneL, 0.66, 0.14, 0.3, 0, 0.3, 0.14, head).rotation.x = -0.15;
  part(SH.block, stoneDD, 0.44, 0.16, 0.36, 0, -0.08, 0.12, head);
  const eyeM = new THREE.MeshBasicMaterial({ color: glowCol });
  for (const sd of [-1, 1]) { const e = part(G.box, eyeM, 0.14, 0.05, 0.03, sd * 0.14, 0.16, 0.27, head, false); e.rotation.z = -sd * 0.18; }
  // braços: pedregulho do ombro, braço, antebraço grosso e punho com nós dos dedos
  const arms = [];
  for (const sd of [-1, 1]) {
    const a = group(sd * 0.98, 1.0, 0, torso);
    part(SH.rock, stoneL, 0.76, 0.66, 0.76, sd * 0.05, 0.08, 0, a);
    part(SH.block, stoneD, 0.42, 0.56, 0.42, 0, -0.42, 0, a);
    part(SH.rock, stone, 0.38, 0.32, 0.4, 0, -0.74, 0.02, a);
    part(SH.block, stone, 0.56, 0.5, 0.54, 0, -1.02, 0.04, a);
    part(SH.block, stoneD, 0.7, 0.42, 0.66, 0, -1.34, 0.06, a);
    for (const kx of [-0.2, -0.07, 0.07, 0.2]) part(SH.rock, stoneL, 0.15, 0.13, 0.16, kx, -1.42, 0.38, a);
    arms.push(a);
  }
  // cristais nas costas e ombros, rachaduras que brilham e musgo por cima
  for (const [x, y, z, sc] of [[-0.5, 1.15, -0.35, 0.5], [0.45, 1.25, -0.4, 0.6], [0, 1.25, -0.55, 0.72], [-0.2, 1.05, -0.6, 0.4], [0.9, 1.25, 0.1, 0.35], [-0.95, 1.25, 0.05, 0.35]]) {
    const cr = std(part(G.octa, crystal, sc * 0.5, sc * 1.3, sc * 0.5, x, y, z, torso, false)); cr.rotation.set(x * 0.6 - 0.3, 0, -x * 0.5);
  }
  for (const [x, y, z, r] of [[-0.35, 0.55, 0.52, 0.5], [0.3, 0.82, 0.5, -0.6], [0.05, 0.28, 0.55, 0.2], [-0.55, 0.9, 0.4, 0.9], [0.6, 0.45, 0.42, -0.4]]) { const cr = part(G.box, glowM, 0.04, 0.38, 0.03, x, y, z, torso, false); cr.rotation.z = r; }
  for (const a of arms) { const cr = part(G.box, glowM, 0.035, 0.3, 0.03, 0, -1.0, 0.31, a, false); cr.rotation.z = 0.5; }
  const moss = mats.lam(boss ? 0x3a5a3a : def.moss ?? 0x4a7a3a), moss2 = mats.lam(new THREE.Color(boss ? 0x3a5a3a : def.moss ?? 0x4a7a3a).multiplyScalar(0.75).getHex());
  for (const sd of [-1, 1]) { std(part(SH.rock, moss, 0.56, 0.18, 0.56, sd * 0.98, 1.36, 0, torso)); for (let i = 0; i < 3; i++) std(part(G.box, moss2, 0.04, 0.2 + i * 0.07, 0.03, sd * (0.8 + i * 0.1), 1.2, 0.3, torso)); }
  std(part(SH.rock, moss, 0.8, 0.2, 0.56, 0, 1.28, -0.22, torso)); std(part(SH.rock, moss2, 0.42, 0.12, 0.36, -0.08, 0.37, 0.02, head));
  let orbit = null;
  if (boss) {
    for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.18, 0.3, -0.05], [sd * 0.14, 0.62, -0.25], [sd * 0.02, 0.8, -0.4]], 0.13, 0.02, 6, 8), stoneDD, 1, 1, 1, sd * 0.28, 0.36, 0, head);
    for (let i = 0; i < 5; i++) part(G.octa, crystal, 0.1, 0.32, 0.1, (i - 2) * 0.12, 0.5 + (2 - Math.abs(i - 2)) * 0.08, -0.1, head, false);
    orbit = group(0, 1.6, 0, body);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(SH.rock, stoneD, 0.4, 0.34, 0.4, Math.cos(a) * 1.9, Math.sin(i * 1.7) * 0.4, Math.sin(a) * 1.9, orbit); part(G.octa, crystal, 0.08, 0.2, 0.08, Math.cos(a) * 1.9, Math.sin(i * 1.7) * 0.4 + 0.24, Math.sin(a) * 1.9, orbit, false); }
  }
  for (const a of arms) for (const sd of [-1, 1]) part(G.box, glowM, 0.025, 0.2, 0.02, sd * 0.16, -1.32, 0.35, a, false);
  const R = { kind: 'golem', root, body, torso, head, arms, legs, core, orbit, mats: mats.list, height: 2.9 * (def.size || 1.5), boss };
  golemForm(def, { mats, torso, head, arms, legs, crystal, stone, stoneD, stoneL, stoneDD, key, R });
  // cotovelos e joelhos de pedra (o antebraço e a canela dobram de verdade)
  R.elbows = arms.map((a) => splitLimb(a, -0.74)); R.knees = legs.map((l) => splitLimb(l, -0.56));
  root.scale.setScalar(def.size || 1.5);
  return optimizeRig(R);
}

// ---------------- Criaturas dos mapas novos ----------------
// Quadrúpedes e artrópodes usam o mesmo esqueleto do lobo (spine, head, jaw, legs, lows, tail, tail2),
// então a animação de corrida/bote funciona; o que muda é o corpo de cada espécie.
function quadBase(def) {
  const mats = new Mats();
  const c = new THREE.Color(def.color);
  const M = {
    body: mats.lam(def.color), dark: mats.lam(c.clone().multiplyScalar(0.55).getHex()),
    light: mats.lam(c.clone().lerp(new THREE.Color(0xf2ece0), 0.45).getHex()),
    glow: new THREE.MeshBasicMaterial({ color: def.glow ?? 0xffd34a }), bone: shiny(mats.lam(0xeee6d2), 0.35), black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  };
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  return { mats, M, root, body };
}
// perna com coxa e canela; splay abre para os lados (aranhas, caranguejos)
// foot: true = pata/casco (M.hoof decide casco), false = ponta de inseto (afina numa garra)
function quadLeg(spine, M, x, y, z, up, low, thick, splay = 0, foot = true) {
  const l = group(x, y, z, spine);
  l.rotation.z = splay;
  const lo = group(0, -up, 0, l);
  lo.rotation.z = -splay * 1.15;
  if (!foot) { // perna de bicho de casca: segmentos que afinam, junta saliente e ponta em garra
    part(SH.limb, M.body, thick * 1.3, up, thick * 1.3, 0, -up / 2, 0, l).rotation.x = Math.PI;
    part(G.sphereLo, M.dark, thick * 1.5, thick * 1.5, thick * 1.5, 0, -up, 0, l);
    part(SH.limb, M.dark, thick * 1.05, low * 0.86, thick * 1.05, 0, -low * 0.43, 0, lo).rotation.x = Math.PI;
    part(SH.fang, M.claw || M.dark, thick * 0.9, low * 0.22, thick * 0.9, 0, -low * 0.94, 0, lo).rotation.x = Math.PI;
  } else {
    part(SH.limb, M.body, thick * 1.15, up * 1.05, thick * 1.25, 0, -up / 2, 0, l).rotation.x = Math.PI;
    part(SH.limb, M.dark, thick * 0.85, low, thick * 0.9, 0, -low / 2, 0, lo).rotation.x = Math.PI;
    if (M.hoof) { part(SH.block4, M.hoof, thick * 1.0, 0.1, thick * 1.15, 0, -low, 0.02, lo); part(G.box, M.black, 0.02, 0.1, thick * 0.6, 0, -low, thick * 0.4, lo, false); }
    else { part(SH.block4, M.dark, thick * 1.05, 0.08, thick * 1.35, 0, -low, 0.05, lo); for (const cx of [-1, 0, 1]) part(SH.fang, M.claw || M.bone, thick * 0.22, 0.09, thick * 0.22, cx * thick * 0.32, -low - 0.01, thick * 0.75, lo).rotation.x = Math.PI / 2 + 0.3; }
  }
  return [l, lo];
}

export function buildQuad(def) {
  const { mats, M, root, body } = quadBase(def);
  const sp = def.species || 'javali', key = def.key || '';
  const C = new THREE.Color(def.color), gl = def.glow ?? 0xffd34a;
  M.claw = mats.lam(0x2a2420); M.mid = mats.lam(C.clone().multiplyScalar(0.78).getHex());
  const legs = [], lows = [], claws = [];
  let H = 0.75, height = 1.2, head, jaw = null, tail, tail2 = null, spine;
  const addLegs = (pos, up, low, thick, splay = 0, extra = false, paw = false) => {
    for (const [x, z] of pos) {
      const s = Math.sign(x) || 1;
      const [l, lo] = quadLeg(spine, M, x, -0.05, z, up, low, thick, splay * s, paw || !splay);
      legs.push(l); lows.push(lo);
      if (extra) { // par extra que acompanha a passada (8 patas)
        const e = group(0, 0, -0.22, l); e.rotation.y = s * 0.45;
        part(SH.limb, M.body, thick * 1.2, up, thick * 1.2, 0, -up / 2, 0, e).rotation.x = Math.PI;
        part(G.sphereLo, M.dark, thick * 1.4, thick * 1.4, thick * 1.4, 0, -up, 0, e);
        const el = group(0, -up, 0, e); el.rotation.z = -splay * s * 1.15;
        part(SH.limb, M.dark, thick, low * 0.86, thick, 0, -low * 0.43, 0, el).rotation.x = Math.PI;
        part(SH.fang, M.claw, thick * 0.85, low * 0.22, thick * 0.85, 0, -low * 0.94, 0, el).rotation.x = Math.PI;
      }
    }
  };
  const eyesGlow = (h, y, z, dx, w = 0.08, ht = 0.05, rz = 0.3) => { for (const s of [-1, 1]) { const e = part(G.box, M.glow, w, ht, 0.03, s * dx, y, z, h, false); e.rotation.z = s * rz; } };
  switch (sp) {
    case 'javali': { // javali: corpo de barril com corcova, crina de cerdas, focinho de disco e presas curvas
      H = 0.72; height = 1.15; spine = group(0, H, 0, body); M.hoof = mats.lam(0x2a2018);
      const gold = key === 'javali_dourado', bristle = gold ? mats.lam(0xffd24a, { emissive: new THREE.Color(0xffb020).multiplyScalar(0.25) }) : M.dark;
      part(G.sphere, M.body, 0.86, 0.74, 1.3, 0, 0.0, -0.04, spine);
      part(G.sphere, M.mid, 0.78, 0.72, 0.7, 0, 0.12, 0.3, spine);                // corcova
      part(SH.block, M.light, 0.44, 0.14, 0.8, 0, -0.28, 0.02, spine);
      for (let i = 0; i < 12; i++) { const b = part(SH.fang, bristle, 0.12, 0.34 - Math.abs(i - 4) * 0.02, 0.1, (i % 2 - 0.5) * 0.08, 0.38 - i * 0.012, 0.5 - i * 0.09, spine); b.rotation.x = -0.75; }
      head = group(0, 0.04, 0.62, spine);
      part(SH.block, M.body, 0.5, 0.44, 0.46, 0, 0.02, 0.02, head);
      part(SH.limb, M.mid, 0.34, 0.32, 0.28, 0, -0.06, 0.3, head).rotation.x = Math.PI / 2;
      part(G.cyl, mats.lam(0xc88a7a), 0.26, 0.06, 0.22, 0, -0.06, 0.47, head).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) part(G.sphereLo, M.black, 0.05, 0.06, 0.03, s * 0.05, -0.06, 0.5, head, false);
      for (const s of [-1, 1]) {
        part(taperTube([[0, 0, 0], [s * 0.06, 0.04, 0.08], [s * 0.1, 0.16, 0.12], [s * 0.06, 0.26, 0.06]], 0.045, 0.008, 6, 8), M.bone, 1, 1, 1, s * 0.14, -0.14, 0.38, head);
        const e = group(s * 0.2, 0.22, -0.04, head); e.rotation.set(0.4, 0, -s * 0.9); part(SH.leaf, M.dark, 0.3, 1, 0.5, 0, 0.1, 0, e).rotation.x = Math.PI / 2;
        part(SH.block, M.dark, 0.14, 0.05, 0.08, s * 0.13, 0.14, 0.23, head).rotation.z = s * 0.4;
      }
      eyesGlow(head, 0.08, 0.24, 0.13, 0.06, 0.05, 0.3);
      jaw = group(0, -0.17, 0.12, head); part(SH.block, M.light, 0.3, 0.07, 0.3, 0, 0, 0.1, jaw);
      addLegs([[-0.24, 0.36], [0.24, 0.36], [-0.24, -0.38], [0.24, -0.38]], 0.28, 0.3, 0.17);
      tail = group(0, 0.12, -0.62, spine); part(taperTube([[0, 0, 0], [0, 0.06, -0.08], [0.05, 0.0, -0.14], [0, -0.06, -0.18]], 0.03, 0.01, 4, 6), M.dark, 1, 1, 1, 0, 0, 0, tail); part(SH.fang, bristle, 0.06, 0.1, 0.06, 0, -0.08, -0.18, tail).rotation.x = Math.PI;
      if (key === 'javali_rei') { for (let i = 0; i < 6; i++) part(SH.fang, mats.lam(0xe8dcc0), 0.1, 0.32, 0.1, (i % 2 - 0.5) * 0.4, 0.3, 0.3 - i * 0.12, spine).rotation.set(-0.5, 0, (i % 2 - 0.5) * 0.8); for (const s of [-1, 1]) part(SH.ring, mats.lam(0xd9b25f), 0.12, 0.12, 0.2, s * 0.2, 0.2, 0.02, head).rotation.y = Math.PI / 2; }
      if (gold) for (let i = 0; i < 5; i++) part(SH.gem, GLOW(0xffe27a), 0.06, 0.12, 0.06, Math.sin(i * 2.2) * 0.38, 0.05 + (i % 3) * 0.12, 0.3 - i * 0.18, spine, false);
      break;
    }
    case 'urso': { // urso: corpanzil com corcova nos ombros, cabeça redonda, focinho e garras grandes
      H = 0.95; height = 1.65; spine = group(0, H, 0, body);
      part(G.sphere, M.body, 1.12, 0.98, 1.55, 0, 0, -0.05, spine);
      part(G.sphere, M.body, 0.96, 0.7, 0.8, 0, 0.28, 0.34, spine);
      for (let i = 0; i < 10; i++) { const a = (i / 9 - 0.5) * 3; const t = part(SH.fang, M.light, 0.16, 0.3, 0.12, Math.sin(a) * 0.44, -0.2 + Math.cos(a) * 0.1, 0.48 + Math.cos(a) * 0.12, spine); t.rotation.set(Math.PI - 0.6, 0, a * 0.4); }
      for (let i = 0; i < 6; i++) { const t = part(SH.fang, M.body, 0.16, 0.3, 0.12, (i % 2 - 0.5) * 0.4, 0.42, 0.2 - i * 0.18, spine); t.rotation.x = -1.2; }
      head = group(0, 0.2, 0.8, spine);
      part(G.sphere, M.body, 0.6, 0.54, 0.58, 0, 0, 0, head);
      part(SH.limb, M.light, 0.3, 0.3, 0.26, 0, -0.08, 0.3, head).rotation.x = Math.PI / 2;
      part(SH.block4, M.black, 0.12, 0.08, 0.07, 0, -0.04, 0.46, head, false);
      for (const s of [-1, 1]) { part(G.sphere, M.body, 0.18, 0.18, 0.1, s * 0.22, 0.26, -0.02, head); part(G.sphere, M.dark, 0.1, 0.1, 0.04, s * 0.22, 0.26, 0.02, head); part(G.box, M.dark, 0.12, 0.04, 0.05, s * 0.12, 0.12, 0.27, head).rotation.z = s * 0.35; }
      eyesGlow(head, 0.06, 0.27, 0.13, 0.06, 0.05, 0.2);
      jaw = group(0, -0.18, 0.2, head); part(SH.block, M.light, 0.24, 0.07, 0.22, 0, 0, 0.1, jaw); for (const s of [-1, 1]) part(SH.fang, M.bone, 0.035, 0.07, 0.035, s * 0.07, 0.04, 0.2, jaw, false);
      addLegs([[-0.33, 0.45], [0.33, 0.45], [-0.33, -0.48], [0.33, -0.48]], 0.42, 0.42, 0.3);
      tail = group(0, 0.15, -0.8, spine); part(G.sphere, M.body, 0.2, 0.2, 0.2, 0, 0, 0, tail);
      if (key === 'urso_polar') { const ice = mats.lam(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.3) }); for (let i = 0; i < 6; i++) part(SH.gem, ice, 0.1, 0.24, 0.1, (i % 2 - 0.5) * 0.3, 0.5, 0.1 - i * 0.16, spine).rotation.x = -0.5; for (let i = 0; i < 5; i++) part(G.cone, ice, 0.06, 0.16, 0.06, (i - 2) * 0.12, -0.42, 0.46, spine).rotation.x = Math.PI; }
      break;
    }
    case 'cavalo': { // cavalo de montaria: pescoço alto, crina, sela com estribos e rabo comprido
      H = 1.15; height = 2.1; spine = group(0, H, 0, body);
      const saddle = mats.lam(0x5a2a1a), gold = mats.lam(0xd9b25f), strap = mats.lam(0x2a1a12);
      part(G.box, M.body, 0.5, 0.52, 1.2, 0, 0, 0, spine);
      part(G.sphere, M.body, 0.56, 0.58, 0.62, 0, 0.02, 0.44, spine);
      part(G.sphere, M.body, 0.58, 0.58, 0.64, 0, 0.04, -0.46, spine);
      part(G.box, M.light, 0.34, 0.12, 0.8, 0, -0.27, 0, spine);
      part(G.box, saddle, 0.58, 0.12, 0.52, 0, 0.3, -0.04, spine);
      part(G.box, saddle, 0.3, 0.14, 0.12, 0, 0.38, 0.16, spine);
      part(G.box, gold, 0.6, 0.04, 0.05, 0, 0.31, 0.2, spine);
      for (const s of [-1, 1]) { part(G.box, strap, 0.03, 0.46, 0.05, s * 0.3, 0.06, -0.04, spine); part(G.box, gold, 0.1, 0.04, 0.12, s * 0.33, -0.18, -0.04, spine); }
      const neck = part(G.box, M.body, 0.24, 0.74, 0.32, 0, 0.42, 0.66, spine); neck.rotation.x = -0.55;
      for (let i = 0; i < 6; i++) part(G.box, M.dark, 0.07, 0.16, 0.14, 0, 0.36 + i * 0.075, 0.5 + i * 0.065, spine);
      head = group(0, 0.84, 0.94, spine);
      part(G.box, M.body, 0.24, 0.26, 0.5, 0, 0, 0.12, head);
      part(G.box, M.dark, 0.2, 0.18, 0.16, 0, -0.05, 0.4, head);
      part(G.box, strap, 0.26, 0.04, 0.04, 0, -0.02, 0.3, head);
      part(G.box, M.dark, 0.12, 0.08, 0.16, 0, 0.15, 0.02, head);
      for (const s of [-1, 1]) {
        part(G.box, M.black, 0.04, 0.05, 0.05, s * 0.125, 0.06, 0.16, head, false);
        const e = part(G.cone4, M.body, 0.07, 0.18, 0.05, s * 0.08, 0.2, -0.08, head); e.rotation.z = -s * 0.15;
      }
      jaw = group(0, -0.12, 0.2, head); part(G.box, M.body, 0.18, 0.06, 0.26, 0, 0, 0.1, jaw);
      addLegs([[-0.17, 0.48], [0.17, 0.48], [-0.17, -0.5], [0.17, -0.5]], 0.5, 0.56, 0.12);
      tail = group(0, 0.12, -0.7, spine);
      part(G.box, M.dark, 0.12, 0.72, 0.14, 0, -0.32, -0.06, tail); tail.rotation.x = 0.45;
      tail2 = group(0, -0.6, -0.04, tail); part(G.box, M.dark, 0.14, 0.3, 0.16, 0, -0.12, 0, tail2);
      break;
    }
    case 'lobo_montaria': { // lobo gigante de montaria: mesma altura do cavalo, juba de pelo, sela, focinho comprido e olhos azuis
      H = 1.15; height = 2.0; spine = group(0, H, 0, body);
      const saddle = mats.lam(0x3a2a22), silver = mats.lam(0xc8d0dc), strap = mats.lam(0x1e1a18);
      part(G.box, M.body, 0.56, 0.56, 1.25, 0, 0, 0, spine);
      part(G.dodeca, M.body, 0.74, 0.72, 0.7, 0, 0.06, 0.44, spine);       // peito largo
      part(G.dodeca, M.body, 0.6, 0.58, 0.64, 0, 0.02, -0.46, spine);
      part(G.box, M.light, 0.38, 0.12, 0.9, 0, -0.29, 0.02, spine);        // barriga clara
      for (let i = 0; i < 7; i++) { const t = part(G.cone4, M.dark, 0.16, 0.34, 0.16, 0, 0.36 - i * 0.02, 0.62 - i * 0.16, spine); t.rotation.x = -0.6; } // pelo eriçado nas costas
      part(G.box, saddle, 0.62, 0.12, 0.5, 0, 0.33, -0.08, spine);
      part(G.box, saddle, 0.32, 0.14, 0.12, 0, 0.41, 0.12, spine);
      part(G.box, silver, 0.64, 0.04, 0.05, 0, 0.34, 0.16, spine);
      for (const sx of [-1, 1]) { part(G.box, strap, 0.03, 0.5, 0.05, sx * 0.33, 0.08, -0.08, spine); part(G.box, silver, 0.1, 0.04, 0.12, sx * 0.36, -0.18, -0.08, spine); }
      const neck = part(G.dodeca, M.body, 0.5, 0.56, 0.5, 0, 0.3, 0.74, spine); neck.rotation.x = -0.4;
      for (let i = 0; i < 5; i++) { const t = part(G.cone4, M.light, 0.2, 0.36, 0.2, (i % 2 ? 0.14 : -0.14), 0.1 - i * 0.04, 0.8 + (i % 3) * 0.04, spine); t.rotation.x = 1.9; } // juba no pescoço
      head = group(0, 0.52, 1.02, spine);
      part(G.box, M.body, 0.42, 0.36, 0.42, 0, 0, 0.04, head);
      part(G.box, M.light, 0.24, 0.2, 0.42, 0, -0.06, 0.36, head);       // focinho
      part(G.box, M.black, 0.12, 0.08, 0.06, 0, 0.0, 0.58, head, false); // nariz
      for (const sx of [-1, 1]) {
        const ear = part(G.cone4, M.body, 0.14, 0.3, 0.1, sx * 0.14, 0.3, -0.04, head); ear.rotation.z = -sx * 0.2;
        part(G.box, new THREE.MeshBasicMaterial({ color: 0x8fd8ff }), 0.08, 0.05, 0.03, sx * 0.12, 0.08, 0.22, head, false);
      }
      part(G.box, strap, 0.44, 0.04, 0.04, 0, 0.02, 0.26, head); // rédea
      jaw = group(0, -0.16, 0.22, head); part(G.box, M.light, 0.22, 0.07, 0.36, 0, 0, 0.14, jaw);
      for (const sx of [-1, 1]) { const f = part(G.cone4, M.bone, 0.04, 0.1, 0.04, sx * 0.07, 0.06, 0.3, jaw); f.rotation.x = Math.PI; }
      addLegs([[-0.2, 0.46], [0.2, 0.46], [-0.2, -0.5], [0.2, -0.5]], 0.52, 0.56, 0.14);
      tail = group(0, 0.1, -0.74, spine);
      part(G.dodeca, M.body, 0.24, 0.24, 0.6, 0, -0.06, -0.26, tail); tail.rotation.x = 0.55;
      tail2 = group(0, -0.08, -0.56, tail); part(G.dodeca, M.light, 0.2, 0.2, 0.36, 0, 0, -0.12, tail2);
      break;
    }
    case 'cervo': { // cervo espinhoso: corpo esguio, pescoço alto, galhada de espinhos que brilham e rabinho branco
      H = 1.05; height = 2.2; spine = group(0, H, 0, body); M.hoof = mats.lam(0x2a2018);
      part(G.sphere, M.body, 0.46, 0.52, 1.0, 0, 0, 0, spine);
      part(G.sphere, M.body, 0.5, 0.56, 0.48, 0, 0.04, 0.32, spine);
      part(SH.block, M.light, 0.32, 0.14, 0.72, 0, -0.24, 0, spine);
      for (let i = 0; i < 6; i++) part(G.sphereLo, M.light, 0.08, 0.06, 0.08, Math.sin(i * 2.1) * 0.18, 0.2 + (i % 2) * 0.04, -0.3 + i * 0.1, spine);
      const rena = key === 'rena_maligna';
      // pescoço reto inclinado para a frente (da base do peito até embaixo da cabeça), com a juba/barba por baixo
      const neck = part(SH.limb, M.body, rena ? 0.34 : 0.24, 0.7, rena ? 0.36 : 0.28, 0, 0.34, 0.46, spine); neck.rotation.x = 0.55;
      for (let i = 0; i < (rena ? 8 : 5); i++) { const tf = part(SH.fang, rena ? mats.lam(0xf0e6d4) : M.light, rena ? 0.16 : 0.12, rena ? 0.3 : 0.2, 0.1, (i % 2 - 0.5) * 0.08, 0.14 + i * 0.055, 0.42 + i * 0.03, spine); tf.rotation.x = Math.PI - 0.35; }
      head = group(0, 0.64, 0.66, spine);
      part(SH.block, M.body, 0.24, 0.24, 0.3, 0, 0, 0.02, head);
      part(SH.limb, M.body, 0.18, 0.28, 0.2, 0, -0.04, 0.24, head).rotation.x = Math.PI / 2;
      part(SH.block4, M.black, 0.08, 0.06, 0.05, 0, -0.03, 0.38, head, false);
      for (const s of [-1, 1]) {
        part(G.box, M.glow, 0.05, 0.04, 0.03, s * 0.11, 0.05, 0.14, head, false);
        const e = group(s * 0.12, 0.1, -0.06, head); e.rotation.z = -s * 1.1; part(SH.leaf, M.dark, 0.2, 1, 0.34, 0, 0.1, 0, e).rotation.x = Math.PI / 2;
        const a = group(s * 0.07, 0.13, -0.02, head); a.rotation.set(-0.3, 0, -s * 0.4);
        if (rena) { // galhada de rena: grossa, escura, que abre para trás e para cima, com várias pontas e brilho vermelho nas pontas
          const ant = shiny(mats.lam(0x3a2418), 0.3), tipG = GLOW(0xff2a2a);
          part(taperTube([[0, 0, 0], [s * 0.1, 0.22, -0.12], [s * 0.26, 0.46, -0.26], [s * 0.3, 0.74, -0.2], [s * 0.22, 0.92, -0.02]], 0.05, 0.016, 6, 10), ant, 1, 1, 1, 0, 0, 0, a);
          for (const [y, z, ln, sx] of [[0.12, -0.06, 0.26, 0.4], [0.36, -0.2, 0.3, 0.8], [0.56, -0.26, 0.26, 1.0], [0.74, -0.18, 0.22, 0.9]]) { part(taperTube([[0, 0, 0], [s * 0.06 * sx, ln * 0.5, 0.08], [s * 0.04 * sx, ln, 0.14]], 0.025, 0.008, 5, 5), ant, 1, 1, 1, s * (0.06 + y * 0.28), y, z, a); part(SH.gem, tipG, 0.04, 0.08, 0.04, s * (0.1 + y * 0.28), y + ln, z + 0.14, a, false); }
          part(new THREE.SphereGeometry(0.5, 6, 3), ant, 0.2, 0.06, 0.14, s * 0.06, 0.12, 0.08, a); // pá da testa
          part(SH.gem, tipG, 0.06, 0.12, 0.06, s * 0.22, 0.96, -0.02, a, false);
          continue;
        }
        part(taperTube([[0, 0, 0], [s * 0.05, 0.25, -0.05], [s * 0.15, 0.5, -0.1], [s * 0.12, 0.72, -0.22]], 0.035, 0.012, 5, 8), M.bone, 1, 1, 1, 0, 0, 0, a);
        for (let k = 0; k < 3; k++) { part(taperTube([[0, 0, 0], [s * 0.04, 0.08, 0.06], [s * 0.02, 0.18, 0.1]], 0.022, 0.006, 4, 4), M.bone, 1, 1, 1, s * (0.04 + k * 0.04), 0.22 + k * 0.17, -0.06 - k * 0.04, a); part(SH.gem, M.glow, 0.05, 0.1, 0.05, s * (0.06 + k * 0.04), 0.4 + k * 0.17, 0.05 - k * 0.04, a, false); }
        part(SH.gem, M.glow, 0.08, 0.18, 0.08, s * 0.12, 0.76, -0.22, a, false);
      }
      addLegs([[-0.15, 0.38], [0.15, 0.38], [-0.15, -0.38], [0.15, -0.38]], 0.46, 0.5, 0.1);
      tail = group(0, 0.16, -0.5, spine); part(SH.drop, mats.lam(0xf4f0e8), 0.14, 0.2, 0.1, 0, -0.04, -0.04, tail).rotation.x = -2.2;
      if (key === 'cervo_espinhoso') for (let i = 0; i < 8; i++) part(SH.fang, M.bone, 0.06, 0.18, 0.06, (i % 2 - 0.5) * 0.24, 0.24, 0.3 - i * 0.1, spine).rotation.set(-0.5, 0, (i % 2 - 0.5) * 0.8);
      break;
    }
    case 'aranha': { // aranha dos galhos: corpo de casca com musgo, patas de galho, olhos brilhando em grupo
      H = 0.62; height = 1.05; spine = group(0, H, 0, body);
      const moss = mats.lam(0x3a6a2a), leaf = mats.lam(0x4a8a3a);
      part(G.sphere, M.body, 1.0, 0.84, 1.18, 0, 0.2, -0.56, spine);
      for (let i = 0; i < 4; i++) part(SH.block, M.dark, 0.08, 0.05, 0.9, (i - 1.5) * 0.18, 0.56 - Math.abs(i - 1.5) * 0.06, -0.52, spine);
      for (let i = 0; i < 3; i++) part(G.box, M.glow, 0.4 - i * 0.08, 0.025, 0.05, 0, 0.6 - i * 0.05, -0.32 - i * 0.24, spine, false);
      part(SH.rock, moss, 0.7, 0.22, 0.8, 0, 0.56, -0.6, spine);
      for (let i = 0; i < 5; i++) part(SH.leaf, leaf, 0.14, 0.6, 0.26, Math.sin(i * 1.3) * 0.25, 0.64, -0.5 - i * 0.08, spine).rotation.set(0.4, i, 0.3);
      part(G.sphere, M.dark, 0.56, 0.42, 0.62, 0, 0.04, 0.18, spine);
      for (let i = 0; i < 5; i++) part(SH.fang, M.dark, 0.06, 0.18, 0.06, (i - 2) * 0.1, 0.22, 0.12 - Math.abs(i - 2) * 0.04, spine).rotation.x = -0.4;
      head = group(0, 0.04, 0.48, spine);
      part(SH.block, M.body, 0.34, 0.24, 0.24, 0, 0.04, 0.0, head);
      for (let i = 0; i < 8; i++) part(G.sphereLo, M.glow, i < 2 ? 0.1 : 0.06, i < 2 ? 0.1 : 0.06, 0.05, i < 2 ? (i - 0.5) * 0.12 : ((i - 2) % 3 - 1) * 0.11, i < 2 ? 0.08 : 0.17 - Math.floor((i - 2) / 3) * 0.12, 0.12, head, false);
      jaw = group(0, -0.08, 0.06, head);
      for (const s of [-1, 1]) part(taperTube([[0, 0, 0], [s * 0.04, -0.06, 0.08], [s * 0.0, -0.16, 0.1]], 0.04, 0.008, 5, 5), M.bone, 1, 1, 1, s * 0.08, -0.02, 0.04, jaw);
      addLegs([[-0.22, 0.32], [0.22, 0.32], [-0.22, 0.04], [0.22, 0.04]], 0.6, 0.62, 0.06, 1.15, true);
      tail = group(0, 0, -0.9, spine);
      break;
    }
    case 'escorpiao': { // escorpião de âmbar: placas de couraça, pinças de duas partes e cauda curva com ferrão aceso
      H = 0.5; height = 1.5; spine = group(0, H, 0, body);
      const plate = mats.lam(C.clone().lerp(new THREE.Color(0xffd27a), 0.25).getHex());
      for (let i = 0; i < 5; i++) { part(SH.block, i % 2 ? M.dark : M.body, 0.66 - i * 0.05, 0.24, 0.24, 0, 0.02, 0.36 - i * 0.2, spine); part(SH.block, plate, 0.5 - i * 0.04, 0.06, 0.2, 0, 0.16, 0.36 - i * 0.2, spine); }
      head = group(0, 0.02, 0.52, spine);
      part(SH.block, M.body, 0.46, 0.22, 0.28, 0, 0, 0.04, head);
      eyesGlow(head, 0.11, 0.17, 0.08, 0.05, 0.04, 0.2);
      for (const s of [-1, 1]) {
        const arm = group(s * 0.22, 0, 0.1, head); arm.rotation.y = s * 0.35; claws.push(arm);
        part(SH.limb, M.body, 0.12, 0.44, 0.12, 0, 0, 0.2, arm).rotation.x = -Math.PI / 2;
        part(G.sphere, M.dark, 0.26, 0.2, 0.32, 0, 0, 0.5, arm);
        const c1 = part(taperTube([[0, 0, 0], [s * 0.05, 0, 0.12], [0, 0, 0.24]], 0.07, 0.01, 5, 5), M.dark, 1, 1, 1, s * 0.05, 0, 0.62, arm); void c1;
        part(taperTube([[0, 0, 0], [-s * 0.04, 0, 0.1], [0, 0, 0.18]], 0.05, 0.008, 5, 5), plate, 1, 1, 1, -s * 0.06, 0, 0.62, arm);
      }
      jaw = group(0, -0.08, 0.14, head);
      addLegs([[-0.26, 0.2], [0.26, 0.2], [-0.26, -0.18], [0.26, -0.18]], 0.4, 0.45, 0.06, 1.05, true);
      tail = group(0, 0.08, -0.52, spine);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 2.3; const sg = part(SH.block, i % 2 ? M.dark : M.body, 0.22 - i * 0.015, 0.2, 0.2, 0, Math.sin(a) * 0.6, -Math.cos(a) * 0.42 + 0.05, tail); sg.rotation.x = -a; }
      tail2 = group(0, 0.62, 0.38, tail);
      part(G.sphere, M.glow, 0.2, 0.18, 0.2, 0, 0, 0, tail2, false);
      const st = part(SH.fang, M.claw, 0.08, 0.3, 0.08, 0, -0.08, 0.16, tail2); st.rotation.x = 2.3;
      break;
    }
    case 'caranguejo': { // caranguejo abissal: casco largo de espinhos com cracas, olhos de antena, pinça grande e pequena
      H = 0.5; height = 0.95; spine = group(0, H, 0, body);
      part(SH.rock, M.body, 1.2, 0.5, 0.9, 0, 0.06, 0, spine);
      part(SH.block, M.light, 0.9, 0.12, 0.66, 0, -0.16, 0, spine);
      for (let i = 0; i < 7; i++) part(SH.fang, M.dark, 0.08, 0.2, 0.08, (i - 3) * 0.17, 0.3 - Math.abs(i - 3) * 0.02, 0.24 - Math.abs(i - 3) * 0.08, spine).rotation.x = 0.3;
      const barn = mats.lam(0xd8d0c0); for (let i = 0; i < 7; i++) { part(G.cyl, barn, 0.1, 0.08, 0.1, Math.sin(i * 2.3) * 0.4, 0.26, -0.1 - (i % 3) * 0.1, spine); part(G.sphereLo, M.glow, 0.04, 0.04, 0.04, Math.sin(i * 2.3) * 0.4, 0.31, -0.1 - (i % 3) * 0.1, spine, false); }
      head = group(0, 0.1, 0.4, spine);
      for (const s of [-1, 1]) {
        part(taperTube([[0, 0, 0], [s * 0.02, 0.14, 0.02], [s * 0.04, 0.24, 0]], 0.03, 0.022, 5, 5), M.dark, 1, 1, 1, s * 0.12, 0.04, 0, head);
        part(G.sphereLo, M.glow, 0.09, 0.09, 0.09, s * 0.16, 0.29, 0, head, false); part(G.sphereLo, M.black, 0.04, 0.05, 0.03, s * 0.16, 0.29, 0.04, head, false);
        const big = s > 0 ? 1.3 : 0.85, arm = group(s * 0.44, -0.06, 0.05, head); arm.rotation.y = s * 0.6; claws.push(arm);
        part(SH.limb, M.body, 0.12, 0.34, 0.12, 0, 0, 0.14, arm).rotation.x = -Math.PI / 2;
        part(G.sphere, M.light, 0.32 * big, 0.26 * big, 0.36 * big, 0, 0.02, 0.42, arm);
        part(taperTube([[0, 0, 0], [0, 0.06, 0.12], [0, 0.0, 0.24]], 0.07 * big, 0.01, 5, 5), M.dark, 1, 1, 1, 0, 0.08, 0.56, arm);
        part(taperTube([[0, 0, 0], [0, -0.04, 0.1], [0, 0.0, 0.18]], 0.05 * big, 0.008, 5, 5), M.light, 1, 1, 1, 0, -0.06, 0.56, arm);
      }
      jaw = group(0, -0.08, 0.06, head);
      addLegs([[-0.4, 0.12], [0.4, 0.12], [-0.4, -0.18], [0.4, -0.18]], 0.32, 0.4, 0.07, 1.2, true);
      tail = group(0, 0, -0.4, spine);
      break;
    }
    case 'besouro': { // besouro de brasa: élitros brilhantes com rachaduras de brasa, chifre e mandíbulas
      H = 0.46; height = 0.95; spine = group(0, H, 0, body);
      // casco único em domo (élitros fechados), com a linha do meio em brasa, frisos e rachaduras acesas
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), M.body); shell.scale.set(0.84, 0.62, 1.22); shell.position.set(0, 0.0, -0.1); spine.add(shell);
      part(G.sphere, M.dark, 0.78, 0.18, 1.14, 0, 0.0, -0.1, spine);
      const seam = part(new THREE.TorusGeometry(0.5, 0.012, 3, 16, Math.PI * 0.86), M.glow, 1.0, 0.62, 1.22, 0, 0.0, -0.1, spine, false); seam.rotation.set(0, Math.PI / 2, 0); seam.rotation.z = Math.PI * 0.07;
      for (const s of [-1, 1]) { const rg = part(new THREE.TorusGeometry(0.5, 0.012, 3, 14, Math.PI * 0.7), M.dark, 0.95, 0.56, 1.18, s * 0.17, 0.0, -0.1, spine); rg.rotation.set(0, Math.PI / 2, Math.PI * 0.15); }
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const x = s * (0.12 + i * 0.06), z = -0.45 + i * 0.22, y = 0.31 * Math.sqrt(Math.max(0, 1 - (x / 0.42) ** 2 - ((z + 0.1) / 0.61) ** 2)); const g2 = part(G.box, M.glow, 0.02, 0.012, 0.16, x, y + 0.005, z, spine, false); g2.rotation.set(0, s * (0.3 + i * 0.25), s * Math.atan2(x, 0.42) * 0.9); }
      part(SH.block, M.dark, 0.58, 0.24, 0.32, 0, 0.08, 0.42, spine); part(SH.block, M.body, 0.5, 0.06, 0.28, 0, 0.21, 0.42, spine);
      head = group(0, 0.06, 0.6, spine);
      part(SH.block, M.dark, 0.38, 0.24, 0.26, 0, 0, 0.04, head);
      part(taperTube([[0, 0, 0], [0, 0.18, 0.14], [0, 0.42, 0.12], [0, 0.52, -0.02]], 0.07, 0.01, 6, 8), M.dark, 1, 1, 1, 0, 0.08, 0.14, head);
      part(SH.fang, M.glow, 0.05, 0.12, 0.05, 0, 0.58, 0.1, head, false);
      eyesGlow(head, 0.06, 0.17, 0.11, 0.05, 0.04, 0.2);
      jaw = group(0, -0.08, 0.14, head);
      for (const s of [-1, 1]) part(taperTube([[0, 0, 0], [s * 0.06, 0, 0.08], [-s * 0.02, 0, 0.16]], 0.035, 0.006, 5, 5), M.dark, 1, 1, 1, s * 0.1, 0, 0.02, jaw);
      addLegs([[-0.3, 0.2], [0.3, 0.2], [-0.3, -0.25], [0.3, -0.25]], 0.26, 0.32, 0.06, 0.9, true);
      tail = group(0, 0, -0.6, spine);
      break;
    }
    case 'salamandra': { // salamandra de magma: corpo comprido e baixo, crista de fogo, manchas de lava e cauda longa
      H = 0.42; height = 0.85; spine = group(0, H, 0, body);
      part(G.sphere, M.body, 0.5, 0.32, 1.4, 0, 0, 0, spine);
      part(SH.block, M.light, 0.36, 0.08, 1.1, 0, -0.14, 0, spine);
      for (let i = 0; i < 7; i++) part(SH.fang, i % 2 ? M.glow : GLOW(0xffd24a), 0.08, 0.22 + (i % 2) * 0.08, 0.06, 0, 0.2, 0.5 - i * 0.16, spine, false);
      for (let i = 0; i < 6; i++) part(G.sphereLo, M.glow, 0.11, 0.04, 0.11, (i % 2 ? 1 : -1) * 0.18, 0.12, 0.36 - i * 0.16, spine, false);
      head = group(0, 0.02, 0.72, spine);
      part(SH.block, M.body, 0.38, 0.18, 0.42, 0, 0.02, 0.1, head);
      for (const s of [-1, 1]) { part(G.sphereLo, M.glow, 0.09, 0.09, 0.07, s * 0.15, 0.12, 0.08, head, false); part(G.sphereLo, M.black, 0.03, 0.06, 0.03, s * 0.15, 0.12, 0.12, head, false); const fr = part(SH.fang, M.glow, 0.08, 0.24, 0.04, s * 0.2, 0.08, -0.08, head, false); fr.rotation.set(0, 0, -s * 1.2); }
      jaw = group(0, -0.06, 0.06, head); part(SH.block, M.light, 0.32, 0.06, 0.38, 0, 0, 0.12, jaw);
      addLegs([[-0.27, 0.4], [0.27, 0.4], [-0.27, -0.36], [0.27, -0.36]], 0.17, 0.2, 0.1, 0.55, false, true);
      for (const l of lows) l.position.y += 0.02;
      tail = group(0, 0, -0.65, spine);
      part(SH.limb, M.body, 0.3, 0.8, 0.22, 0, 0, -0.38, tail).rotation.x = Math.PI / 2;
      tail2 = group(0, 0, -0.75, tail);
      part(SH.fang, M.dark, 0.16, 0.6, 0.12, 0, 0, -0.28, tail2).rotation.x = -Math.PI / 2;
      part(SH.fang, M.glow, 0.08, 0.2, 0.08, 0, 0, -0.62, tail2, false).rotation.x = -Math.PI / 2;
      break;
    }
    case 'cerbero': { // cérbero: cão infernal musculoso de três cabeças com chifres, coleiras de espinhos, juba de fogo e rachaduras de lava
      H = 0.95; height = 1.9; spine = group(0, H, 0, body);
      const iron = shiny(mats.lam(0x2a2626), 0.7), mouthG = new THREE.MeshBasicMaterial({ color: 0xffa040 }), fire1 = GLOW(0xff6a1a), fire2 = GLOW(0xffd24a), horn = shiny(mats.lam(0x1a1412), 0.4), fang = new THREE.MeshBasicMaterial({ color: 0xf4ecd8 });
      M.hoof = null;
      // corpo: peito largo, costelas marcadas, cintura fina e anca forte
      part(G.sphere, M.body, 0.96, 0.82, 0.78, 0, 0.06, 0.24, spine);
      part(SH.block, M.body, 0.62, 0.56, 0.5, 0, 0.0, -0.18, spine);
      part(G.sphere, M.mid, 0.74, 0.66, 0.64, 0, 0.04, -0.46, spine);
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) part(new THREE.TorusGeometry(0.5, 0.05, 3, 8, Math.PI * 0.6), M.dark, 0.36, 0.5, 0.4, sd * 0.24, -0.02, 0.1 - i * 0.12, spine).rotation.set(0, sd * Math.PI / 2, 0);
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const cr = part(G.box, M.glow, 0.02, 0.3 + (i % 2) * 0.1, 0.02, sd * 0.43, 0.06 + (i % 2) * 0.08, 0.36 - i * 0.24, spine, false); cr.rotation.x = (i % 2 ? 0.6 : -0.5); }
      for (let i = 0; i < 7; i++) part(SH.fang, M.bone, 0.08, 0.26 - Math.abs(i - 3) * 0.02, 0.08, 0, 0.4 - Math.abs(i - 3) * 0.01, 0.42 - i * 0.16, spine).rotation.x = -0.7;
      for (let i = 0; i < 9; i++) part(taperTube([[0, 0, 0], [0, 0.18, -0.05], [(i % 2 - 0.5) * 0.08, 0.38 + (i % 3) * 0.08, -0.16]], 0.08, 0, 5, 5), i % 2 ? fire1 : fire2, 1, 1, 1, (i % 2 - 0.5) * 0.14, 0.34, 0.58 - i * 0.08, spine, false);
      // cabeça de cão infernal (usada nas três)
      const mk = (g, main) => {
        part(SH.block, M.body, 0.42, 0.36, 0.4, 0, 0.04, 0.04, g);
        part(SH.block, M.dark, 0.4, 0.08, 0.2, 0, 0.21, 0.12, g).rotation.x = -0.2; // testa franzida
        part(SH.limb, M.mid, 0.26, 0.38, 0.22, 0, -0.02, 0.36, g).rotation.x = Math.PI / 2;
        part(SH.block4, M.black, 0.11, 0.07, 0.06, 0, 0.06, 0.55, g, false);
        for (const s of [-1, 1]) {
          const ey = part(G.box, M.glow, 0.1, 0.045, 0.03, s * 0.12, 0.13, 0.235, g, false); ey.rotation.z = s * 0.35;
          part(G.box, M.black, 0.03, 0.04, 0.02, s * 0.12, 0.13, 0.25, g, false);
          const e = part(SH.fang, M.dark, 0.13, 0.3, 0.07, s * 0.15, 0.3, -0.06, g); e.rotation.set(-0.35, 0, -s * 0.28);
          part(taperTube([[0, 0, 0], [s * 0.1, 0.12, -0.06], [s * 0.16, 0.28, -0.2], [s * 0.1, 0.36, -0.34]], 0.05, 0.008, 5, 7), horn, 1, 1, 1, s * 0.13, 0.22, 0.04, g);
          part(SH.fang, fang, 0.045, 0.12, 0.045, s * 0.08, -0.12, 0.44, g, false).rotation.x = Math.PI;
          for (let k = 0; k < 2; k++) { const fr = part(taperTube([[0, 0, 0], [s * 0.04, 0.12, -0.1], [s * 0.02, 0.26, -0.24]], 0.06, 0, 5, 5), k ? fire1 : fire2, 1, 1, 1, s * (0.1 + k * 0.08), 0.18, -0.16, g, false); void fr; }
        }
        // coleira de espinhos com elo de corrente
        const col = part(SH.ring, iron, 0.66, 0.66, 1.0, 0, -0.04, -0.16, g); void col;
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const sp2 = part(SH.fang, M.bone, 0.06, 0.16, 0.06, Math.cos(a) * 0.36, -0.04 + Math.sin(a) * 0.36, -0.16, g); sp2.rotation.z = a - Math.PI / 2; }
        for (let k = 0; k < 3; k++) part(SH.ring, iron, 0.1, 0.1, 0.18, 0, -0.42 - k * 0.1, -0.16, g).rotation.y = k % 2 ? Math.PI / 2 : 0;
        if (!main) { const j2 = group(0, -0.1, 0.2, g); j2.rotation.x = 0.4; part(SH.block, M.dark, 0.22, 0.07, 0.32, 0, -0.03, 0.15, j2); part(G.box, mouthG, 0.16, 0.03, 0.24, 0, 0.02, 0.14, j2, false); for (const s of [-1, 1]) part(SH.fang, fang, 0.035, 0.09, 0.035, s * 0.07, 0.04, 0.28, j2, false); }
      };
      head = group(0, 0.32, 0.74, spine); mk(head, true);
      jaw = group(0, -0.1, 0.2, head); part(SH.block, M.dark, 0.22, 0.07, 0.32, 0, -0.03, 0.15, jaw); part(G.box, mouthG, 0.16, 0.03, 0.24, 0, 0.02, 0.14, jaw, false); for (const s of [-1, 1]) part(SH.fang, fang, 0.035, 0.09, 0.035, s * 0.07, 0.04, 0.28, jaw, false);
      for (const s of [-1, 1]) { const h2 = group(s * 0.44, 0.2, 0.6, spine); h2.rotation.y = s * 0.5; h2.scale.setScalar(0.86); mk(h2, false); (body.userData.heads ??= []).push(h2); }
      addLegs([[-0.27, 0.38], [0.27, 0.38], [-0.27, -0.52], [0.27, -0.52]], 0.42, 0.42, 0.2);
      for (const l of legs) { part(SH.fang, M.bone, 0.06, 0.18, 0.06, 0, -0.1, -0.16, l).rotation.x = -2.3; }
      // cauda de corrente de ossos terminando numa labareda
      tail = group(0, 0.15, -0.72, spine);
      part(SH.limb, M.body, 0.16, 0.6, 0.16, 0, 0, -0.26, tail).rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) part(SH.fang, M.bone, 0.05, 0.12, 0.05, 0, 0.08, -0.1 - k * 0.16, tail).rotation.x = -0.6;
      tail2 = group(0, 0, -0.55, tail);
      part(taperTube([[0, 0, 0], [0, 0.12, -0.1], [0, 0.32, -0.12], [0, 0.5, -0.04]], 0.14, 0, 6, 7), fire1, 1, 1, 1, 0, 0, -0.05, tail2, false);
      part(taperTube([[0, 0, 0], [0, 0.1, -0.06], [0, 0.26, -0.06]], 0.08, 0, 5, 5), fire2, 1, 1, 1, 0, 0.02, -0.06, tail2, false);
      break;
    }

    // ---------------- v0.12 (pacote 2): famílias novas ----------------
    case 'couraco': { // couraço (Planície do Guardião): tatu de couraça em faixas, cristais da Fenda nas costas, focinho fino e cauda de anéis
      H = 0.56; height = 1.15; spine = group(0, H, 0, body);
      const plate = shiny(mats.lam(C.clone().lerp(new THREE.Color(0xe6ddff), 0.22).getHex()), 0.55), seam = mats.lam(C.clone().multiplyScalar(0.42).getHex()), cyan = GLOW(0x5ef0ff);
      part(G.sphere, M.light, 0.6, 0.36, 0.98, 0, -0.12, 0, spine);
      for (let i = 0; i < 7; i++) {
        const z = 0.4 - i * 0.135, k = 1 - Math.abs(i - 3) * 0.06;
        part(SH_DOME, i % 2 ? M.body : plate, 0.92 * k, 0.78 * k, 0.26, 0, -0.08, z, spine);
        part(SH_DOME, seam, 0.95 * k, 0.81 * k, 0.03, 0, -0.08, z - 0.125, spine, false);
      }
      for (const [x, z, sc, c] of [[0, 0.06, 1.25, 0], [-0.17, -0.12, 0.9, 1], [0.16, -0.18, 0.85, 0], [0.04, -0.34, 0.7, 0], [-0.1, 0.24, 0.72, 1], [0.12, 0.2, 0.6, 0]]) { const g = part(SH.gem, c ? cyan : M.glow, 0.13 * sc, 0.42 * sc, 0.13 * sc, x, 0.34 + 0.05 * sc, z, spine, false); g.rotation.set(-z * 0.9, 0, -x * 2.2); }
      head = group(0, -0.06, 0.56, spine);
      part(SH_DOME, plate, 0.38, 0.3, 0.38, 0, 0.0, -0.02, head);
      part(G.sphere, M.light, 0.3, 0.24, 0.32, 0, -0.04, 0.04, head);
      part(G.cone, M.light, 0.15, 0.4, 0.15, 0, -0.08, 0.3, head).rotation.x = Math.PI / 2;
      part(G.sphereLo, M.black, 0.07, 0.05, 0.05, 0, -0.08, 0.5, head, false);
      for (const sd of [-1, 1]) { const e = part(SH.leaf, M.dark, 0.2, 1.4, 0.32, sd * 0.13, 0.16, -0.08, head); e.rotation.set(0.6, 0, -sd * 0.55); }
      eyesGlow(head, 0.03, 0.17, 0.1, 0.06, 0.04, 0.2);
      jaw = group(0, -0.14, 0.14, head); part(SH.block, M.light, 0.14, 0.05, 0.22, 0, 0, 0.08, jaw);
      addLegs([[-0.27, 0.3], [0.27, 0.3], [-0.27, -0.3], [0.27, -0.3]], 0.2, 0.24, 0.16);
      tail = group(0, -0.04, -0.5, spine);
      for (let i = 0; i < 5; i++) part(G.cyl, i % 2 ? plate : M.body, 0.17 - i * 0.025, 0.13, 0.17 - i * 0.025, 0, -0.04 - i * 0.045, -0.06 - i * 0.11, tail).rotation.x = 1.15;
      break;
    }
    case 'rajado': { // rajado (Planície do Guardião): felino da Fenda com listras acesas, dentes de sabre, tufos nas orelhas e ponta da cauda brilhando
      H = 0.82; height = 1.45; spine = group(0, H, 0, body);
      M.mid = mats.lam(C.clone().lerp(new THREE.Color(0x8a84b0), 0.2).getHex());
      const stripe = GLOW(gl), fang2 = shiny(mats.lam(0xf2ead8), 0.4);
      part(G.sphere, M.body, 0.6, 0.6, 1.15, 0, 0, -0.04, spine);
      part(G.sphere, M.body, 0.68, 0.68, 0.66, 0, 0.05, 0.36, spine);
      part(G.sphere, M.mid, 0.62, 0.62, 0.58, 0, 0.02, -0.44, spine);
      part(SH.block, M.light, 0.34, 0.12, 0.86, 0, -0.27, 0.02, spine);
      for (let i = 0; i < 7; i++) {
        const z = 0.5 - i * 0.16, r = (i === 0 ? 0.35 : 0.31) + 0.005;
        for (const sd of [-1, 1]) { const st = part(G.cone4, stripe, 0.02, 0.3 - (i % 2) * 0.08, 0.075, sd * r, 0.06 + (i % 2) * 0.05, z, spine, false); st.rotation.set(Math.PI + 0.15, 0, sd * 0.25); }
        if (i % 2 === 0) part(G.box, stripe, 0.18, 0.02, 0.05, 0, r + 0.01, z - 0.03, spine, false);
      }
      head = group(0, 0.26, 0.76, spine);
      part(G.sphere, M.body, 0.46, 0.4, 0.44, 0, 0.02, 0, head);
      part(SH.block, M.light, 0.3, 0.18, 0.24, 0, -0.08, 0.2, head);
      part(SH.block4, M.black, 0.09, 0.06, 0.05, 0, -0.01, 0.32, head, false);
      for (const sd of [-1, 1]) {
        const ear = part(G.cone4, M.body, 0.14, 0.24, 0.08, sd * 0.15, 0.24, -0.04, head); ear.rotation.z = -sd * 0.25;
        part(G.cone, stripe, 0.03, 0.16, 0.03, sd * 0.18, 0.4, -0.04, head, false).rotation.z = -sd * 0.3;
        part(taperTube([[0, 0, 0], [0, -0.14, 0.03], [0, -0.3, 0.0]], 0.035, 0.008, 5, 6), fang2, 1, 1, 1, sd * 0.07, -0.12, 0.27, head);
        for (let k = 0; k < 2; k++) part(G.box, mats.lam(0xd8d0e8), 0.22, 0.008, 0.008, sd * 0.2, -0.05 - k * 0.03, 0.27, head, false).rotation.y = sd * 0.3;
      }
      eyesGlow(head, 0.08, 0.19, 0.1, 0.08, 0.04, 0.25);
      for (let i = 0; i < 3; i++) part(G.box, stripe, 0.025, 0.12, 0.03, (i - 1) * 0.07, 0.19, 0.19, head, false).rotation.x = -0.4;
      jaw = group(0, -0.16, 0.12, head); part(SH.block, M.light, 0.22, 0.06, 0.22, 0, 0, 0.08, jaw);
      addLegs([[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.46], [0.2, -0.46]], 0.38, 0.4, 0.14);
      tail = group(0, 0.16, -0.68, spine);
      part(taperTube([[0, 0, 0], [0, -0.2, -0.3], [0, -0.12, -0.68], [0, 0.16, -0.9]], 0.07, 0.04, 6, 10), M.body, 1, 1, 1, 0, 0, 0, tail);
      for (let i = 0; i < 3; i++) part(G.torus, stripe, 0.14, 0.14, 0.4, 0, -0.18 + i * 0.07, -0.34 - i * 0.18, tail, false).rotation.x = 0.4;
      tail2 = group(0, 0.16, -0.9, tail); part(G.sphereLo, stripe, 0.14, 0.2, 0.14, 0, 0.04, 0, tail2, false);
      break;
    }
    case 'jabuti': { // jabuti (Ermos): casco alto de placas com cristais da Fenda, pescoço comprido, bico e patas de coluna
      H = 0.62; height = 1.45; spine = group(0, H, 0, body); M.hoof = mats.lam(0x2a2a26);
      const rim = mats.lam(C.clone().lerp(new THREE.Color(0xe8d8a0), 0.35).getHex()), plt = mats.lam(C.clone().lerp(new THREE.Color(0xa8c8a0), 0.2).getHex()), seamD = mats.lam(C.clone().multiplyScalar(0.45).getHex());
      const skin = mats.lam(0x8a8462), skinD = mats.lam(0x5e5a40), cr2 = GLOW(0xd36bff), up = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3();
      const RX = 0.76, RY = 0.6, RZ = 0.9, Y0 = -0.1;
      part(SH_DOME, seamD, RX * 2, RY * 2, RZ * 2, 0, Y0, 0, spine);
      part(G.cyl, rim, RX * 2.04, 0.12, RZ * 2.04, 0, Y0, 0, spine);
      part(G.cyl, rim, RX * 1.6, 0.14, RZ * 1.6, 0, Y0 - 0.12, 0, spine);
      // placas do casco: cada uma deitada na curva da cúpula; algumas com cristais saindo
      const onDome = (th, ph, k, mat, gem) => {
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        const m = part(SH_HEX, mat, 0.36 * k, 0.07, 0.36 * k, dx * RX, Y0 + dy * RY, dz * RZ, spine);
        nv.set(dx / RX, dy / RY, dz / RZ).normalize(); m.quaternion.setFromUnitVectors(up, nv);
        if (gem) { const g2 = part(SH.gem, gem, 0.14 * k, 0.5 * k, 0.14 * k, dx * (RX + 0.1), Y0 + dy * (RY + 0.14), dz * (RZ + 0.1), spine, false); g2.quaternion.setFromUnitVectors(up, nv); }
      };
      onDome(0, 0, 1.1, plt, M.glow);
      for (let k = 0; k < 6; k++) onDome(0.62, (k / 6) * Math.PI * 2 + 0.5, 0.95, k % 2 ? M.body : plt, k % 3 === 0 ? cr2 : k % 3 === 1 ? M.glow : null);
      for (let k = 0; k < 10; k++) onDome(1.18, (k / 10) * Math.PI * 2, 0.78, k % 2 ? plt : M.body, null);
      const neck = part(SH.limb, skin, 0.3, 0.62, 0.3, 0, 0.0, 0.92, spine); neck.rotation.x = 1.0;
      for (let i = 0; i < 3; i++) part(G.torus, skinD, 0.32 - i * 0.02, 0.32 - i * 0.02, 0.5, 0, 0.02 + i * 0.1, 0.78 + i * 0.12, spine).rotation.x = 1.0;
      head = group(0, 0.22, 1.18, spine);
      part(G.sphere, skin, 0.36, 0.3, 0.42, 0, 0, 0, head);
      part(G.cone4, skinD, 0.24, 0.2, 0.18, 0, -0.06, 0.2, head).rotation.x = Math.PI / 2 + 0.6;
      for (const sd of [-1, 1]) part(G.sphereLo, skinD, 0.12, 0.1, 0.1, sd * 0.12, 0.06, 0.08, head);
      eyesGlow(head, 0.07, 0.15, 0.13, 0.06, 0.04, 0.1);
      jaw = group(0, -0.1, 0.06, head); part(SH.block, skinD, 0.2, 0.05, 0.22, 0, 0, 0.08, jaw);
      addLegs([[-0.48, 0.44], [0.48, 0.44], [-0.48, -0.46], [0.48, -0.46]], 0.24, 0.28, 0.24);
      for (const l of legs) for (let k = 0; k < 3; k++) part(SH.block4, skinD, 0.12, 0.08, 0.1, (k - 1) * 0.07, -0.18 - k * 0.07, 0.1, l);
      tail = group(0, -0.12, -0.92, spine); part(G.cone, skin, 0.14, 0.26, 0.14, 0, 0, -0.08, tail).rotation.x = -Math.PI / 2;
      break;
    }
    case 'sapo': { // sapo-boi (Pântano): corpo largo e baixo cheio de verrugas, olhos saltados, papo amarelo, língua e coxas grandes
      H = 0.44; height = 1.0; spine = group(0, H, 0, body);
      const wart = mats.lam(C.clone().multiplyScalar(0.66).getHex()), wartL = mats.lam(C.clone().lerp(new THREE.Color(0xe8ff9a), 0.4).getHex()), belly = mats.lam(0xe6dea0), sac = mats.lam(0xf2d86a), pink = mats.lam(0xe87a8a), spotD = mats.lam(0x2e3a1a);
      const bd = part(G.sphere, M.body, 1.1, 0.7, 1.05, 0, 0.06, -0.06, spine); bd.rotation.x = -0.18;
      part(G.sphere, belly, 0.92, 0.48, 0.88, 0, -0.08, 0.02, spine);
      for (let i = 0; i < 16; i++) { const a = i * 2.39, r = 0.12 + (i % 5) * 0.08; part(G.sphereLo, i % 3 ? wart : wartL, 0.1, 0.06, 0.1, Math.cos(a) * r, 0.36 - r * 0.32, Math.sin(a) * r * 0.9 - 0.12, spine); }
      for (let i = 0; i < 6; i++) part(G.sphereLo, spotD, 0.16, 0.04, 0.12, (i % 2 ? 1 : -1) * (0.3 + (i % 3) * 0.05), 0.22 - (i % 3) * 0.04, 0.1 - i * 0.12, spine);
      head = group(0, 0.12, 0.42, spine);
      part(G.sphere, M.body, 0.86, 0.4, 0.52, 0, 0.02, 0, head);
      part(SH_ARC, new THREE.MeshBasicMaterial({ color: 0x1a2410 }), 0.74, 0.5, 0.9, 0, -0.06, 0.08, head, false).rotation.x = Math.PI / 2 - 0.1;
      for (const sd of [-1, 1]) {
        part(G.sphere, M.body, 0.26, 0.26, 0.26, sd * 0.24, 0.2, 0.0, head);
        part(G.sphere, M.glow, 0.18, 0.17, 0.09, sd * 0.25, 0.23, 0.11, head, false);
        part(G.box, M.black, 0.1, 0.03, 0.02, sd * 0.25, 0.23, 0.16, head, false);
        part(G.sphereLo, M.black, 0.04, 0.03, 0.03, sd * 0.08, 0.1, 0.25, head, false);
      }
      jaw = group(0, -0.12, 0.06, head); part(G.sphere, sac, 0.52, 0.26, 0.38, 0, -0.03, 0.04, jaw);
      part(G.box, pink, 0.1, 0.03, 0.3, 0, 0.09, 0.1, jaw);
      addLegs([[-0.36, 0.26], [0.36, 0.26], [-0.38, -0.24], [0.38, -0.24]], 0.18, 0.22, 0.1);
      for (const i of [2, 3]) part(G.sphere, M.body, 0.34, 0.42, 0.52, 0, -0.06, 0.04, legs[i]);
      tail = group(0, 0, -0.56, spine);
      break;
    }
    case 'jacare': { // jacaré-açu (Pântano): corpo comprido e baixo com placas, focinho largo cheio de dentes e cauda de crista
      H = 0.4; height = 0.95; spine = group(0, H, 0, body);
      const scute = mats.lam(C.clone().multiplyScalar(0.6).getHex()), belly = mats.lam(C.clone().lerp(new THREE.Color(0xe8dca0), 0.55).getHex()), tooth = mats.lam(0xf4ecd8), eyeY = new THREE.MeshBasicMaterial({ color: gl });
      part(G.sphere, M.body, 0.84, 0.42, 1.75, 0, 0, -0.05, spine);
      part(G.sphere, belly, 0.72, 0.26, 1.5, 0, -0.1, -0.05, spine);
      for (let i = 0; i < 8; i++) for (const sd of [-1, 0, 1]) { if (sd && i > 6) continue; part(SH.block4, scute, 0.11, 0.08, 0.13, sd * 0.15, 0.2 - Math.abs(sd) * 0.03, 0.64 - i * 0.18, spine); }
      head = group(0, 0.03, 0.88, spine);
      part(SH.block, M.body, 0.44, 0.24, 0.34, 0, 0.02, 0, head);
      part(SH.block, M.body, 0.34, 0.14, 0.8, 0, -0.02, 0.5, head);
      part(G.sphereLo, M.dark, 0.16, 0.08, 0.1, 0, 0.06, 0.86, head);
      for (const sd of [-1, 1]) {
        part(G.sphere, M.body, 0.15, 0.12, 0.16, sd * 0.13, 0.13, 0.04, head);
        part(G.box, eyeY, 0.06, 0.035, 0.03, sd * 0.13, 0.16, 0.115, head, false).rotation.z = sd * 0.2;
        for (let k = 0; k < 7; k++) part(SH.fang, tooth, 0.03, 0.07, 0.03, sd * 0.165, -0.09, 0.24 + k * 0.1, head, false).rotation.x = Math.PI;
      }
      jaw = group(0, -0.08, 0.06, head); part(SH.block, scute, 0.32, 0.07, 0.8, 0, -0.03, 0.44, jaw);
      for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) part(SH.fang, tooth, 0.028, 0.06, 0.028, sd * 0.15, 0.02, 0.24 + k * 0.1, jaw, false);
      addLegs([[-0.38, 0.46], [0.38, 0.46], [-0.38, -0.42], [0.38, -0.42]], 0.17, 0.2, 0.1, 0.55, false, true);
      for (const l of lows) l.position.y += 0.02;
      tail = group(0, 0, -0.88, spine);
      part(SH.limb, M.body, 0.42, 0.9, 0.3, 0, 0, -0.42, tail).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) part(SH.fang, scute, 0.06, 0.15, 0.08, sd * 0.07, 0.13 - i * 0.012, -0.12 - i * 0.2, tail);
      tail2 = group(0, 0, -0.86, tail);
      part(SH.fang, M.body, 0.26, 0.8, 0.18, 0, 0, -0.36, tail2).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 4; i++) part(SH.fang, scute, 0.05, 0.12, 0.07, 0, 0.07 - i * 0.015, -0.1 - i * 0.16, tail2);
      break;
    }
    case 'basilisco': { // basilisco (Deserto): lagarto de chifres — coroa de espinhos, babado colorido, escamas em ponta e cauda listrada
      H = 0.46; height = 0.95; spine = group(0, H, 0, body);
      const band = mats.lam(C.clone().multiplyScalar(0.6).getHex()), belly = mats.lam(C.clone().lerp(new THREE.Color(0xfff0c0), 0.5).getHex()), hornM = shiny(mats.lam(0x5a3a22), 0.4), frill = mats.lam(0xd8402a), frill2 = mats.lam(0x2a8ac8);
      part(G.sphere, M.body, 0.86, 0.38, 1.3, 0, 0, 0, spine);
      part(G.sphere, belly, 0.72, 0.22, 1.1, 0, -0.1, 0, spine);
      for (let i = 0; i < 4; i++) part(G.sphere, band, 0.66, 0.1, 0.14, 0, 0.15, 0.36 - i * 0.24, spine);
      for (let i = 0; i < 9; i++) for (const sd of [-1, 1]) part(SH.fang, band, 0.06, 0.13, 0.06, sd * (0.24 + (i % 2) * 0.06), 0.12, 0.5 - i * 0.12, spine).rotation.z = -sd * 0.7;
      for (let i = 0; i < 7; i++) part(SH.fang, hornM, 0.06, 0.14, 0.06, 0, 0.2, 0.42 - i * 0.14, spine);
      head = group(0, 0.04, 0.72, spine);
      part(SH.block, M.body, 0.46, 0.22, 0.42, 0, 0, 0.05, head);
      part(SH.block, M.body, 0.3, 0.14, 0.24, 0, -0.02, 0.32, head);
      for (const sd of [-1, 1]) {
        part(G.sphereLo, M.glow, 0.08, 0.07, 0.05, sd * 0.17, 0.07, 0.16, head, false);
        for (let k = 0; k < 4; k++) { const h = part(SH.fang, hornM, 0.06, 0.26 - k * 0.03, 0.06, sd * (0.06 + k * 0.07), 0.12, -0.12 - k * 0.02, head); h.rotation.set(-1.0, 0, -sd * (0.25 + k * 0.25)); }
      }
      // babado em leque em volta do pescoço (folhas apontando para fora, vermelhas e azuis)
      for (let k = 0; k < 9; k++) { const ph = -0.35 + k * (Math.PI + 0.7) / 8; const f = part(SH.leaf, k % 2 ? frill2 : frill, 0.42, 1, 0.5, Math.cos(ph) * 0.2, 0.04 + Math.sin(ph) * 0.2, -0.16, head); f.rotation.order = 'ZYX'; f.rotation.set(-Math.PI / 2 + 0.25, 0, ph - Math.PI / 2); }
      jaw = group(0, -0.08, 0.1, head); part(SH.block, belly, 0.26, 0.06, 0.3, 0, 0, 0.14, jaw);
      addLegs([[-0.3, 0.36], [0.3, 0.36], [-0.3, -0.34], [0.3, -0.34]], 0.17, 0.22, 0.09, 0.55, false, true);
      for (const l of lows) l.position.y += 0.02;
      tail = group(0, 0, -0.62, spine);
      part(SH.limb, M.body, 0.3, 0.8, 0.22, 0, 0, -0.38, tail).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 3; i++) part(G.torus, band, 0.24 - i * 0.04, 0.24 - i * 0.04, 0.6, 0, 0, -0.16 - i * 0.22, tail);
      tail2 = group(0, 0, -0.76, tail);
      part(SH.fang, M.body, 0.15, 0.6, 0.12, 0, 0, -0.28, tail2).rotation.x = -Math.PI / 2;
      break;
    }
    case 'esfinge': { // esfinge (Deserto): leoa alada com toucado listrado de faraó, joia na testa, colar de ouro e asas douradas e azuis
      H = 0.95; height = 2.05; spine = group(0, H, 0, body);
      const gold = shiny(mats.lam(0xe8c04a), 0.9), blue = mats.lam(0x2a5ab8), feather = mats.lam(C.clone().lerp(new THREE.Color(0xffffff), 0.25).getHex()), featherD = mats.lam(0x3a6ac8);
      part(G.sphere, M.body, 0.72, 0.7, 1.3, 0, 0, -0.05, spine);
      part(G.sphere, M.body, 0.82, 0.78, 0.7, 0, 0.06, 0.38, spine);
      part(G.sphere, M.mid, 0.7, 0.68, 0.62, 0, 0.02, -0.48, spine);
      part(SH.block, M.light, 0.42, 0.12, 1.0, 0, -0.32, 0, spine);
      { const pc = part(G.cyl, gold, 0.6, 0.06, 0.42, 0, 0.12, 0.72, spine); pc.rotation.x = 1.25; for (let k = 0; k < 2; k++) { const b2 = part(G.cyl, blue, 0.5 - k * 0.14, 0.065, 0.32 - k * 0.1, 0, 0.12, 0.72, spine); b2.rotation.x = 1.25; b2.position.z += 0.005 * (k + 1); } }
      part(SH.gem, M.glow, 0.1, 0.16, 0.06, 0, 0.08, 0.92, spine, false);
      head = group(0, 0.44, 0.84, spine);
      part(G.sphere, M.body, 0.48, 0.44, 0.46, 0, 0.02, 0, head);
      part(SH.block, M.light, 0.3, 0.2, 0.22, 0, -0.08, 0.2, head);
      part(SH.block4, M.black, 0.09, 0.06, 0.05, 0, -0.02, 0.31, head, false);
      eyesGlow(head, 0.08, 0.2, 0.1, 0.08, 0.04, 0.2);
      part(SH_DOME, gold, 0.56, 0.34, 0.52, 0, 0.12, -0.02, head);
      part(G.box, gold, 0.54, 0.07, 0.06, 0, 0.18, 0.21, head);
      part(SH.gem, M.glow, 0.08, 0.16, 0.05, 0, 0.28, 0.24, head, false);
      for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) part(G.box, k % 2 ? blue : gold, 0.08, 0.085, 0.24 + k * 0.012, sd * (0.27 + k * 0.012), 0.12 - k * 0.085, -0.02 - k * 0.012, head);
      for (let k = 0; k < 4; k++) part(G.box, k % 2 ? blue : gold, 0.34, 0.08, 0.06, 0, 0.06 - k * 0.08, -0.25, head);
      for (const sd of [-1, 1]) { // asas dobradas, erguidas ao longo das costas: penas de ouro em cima, brancas e azuis nas pontas
        const w = group(sd * 0.24, 0.3, 0.34, spine); w.rotation.set(0.3, 0, -sd * 1.05);
        part(taperTube([[0, 0, 0], [sd * 0.3, 0.02, -0.1], [sd * 0.62, 0.0, -0.36]], 0.06, 0.03, 5, 6), gold, 1, 1, 1, 0, 0.03, 0, w);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 6 - r; k++) {
          const mat = r === 0 ? gold : r === 1 ? feather : (k % 2 ? featherD : feather), ln = 0.32 + r * 0.16 + k * 0.03;
          const f = part(SH.leaf, mat, 0.46, 1.4, ln, sd * (0.06 + k * 0.1), -0.01 * r, -0.12 - r * 0.2 - k * 0.04 - ln * 0.45, w); f.rotation.y = -sd * (0.1 + k * 0.06);
        }
      }
      jaw = group(0, -0.16, 0.12, head); part(SH.block, M.light, 0.22, 0.06, 0.22, 0, 0, 0.08, jaw);
      addLegs([[-0.24, 0.48], [0.24, 0.48], [-0.24, -0.5], [0.24, -0.5]], 0.44, 0.46, 0.16);
      for (let i = 0; i < 2; i++) part(G.cyl, gold, 0.2, 0.06, 0.2, 0, -0.3, 0, lows[i]);
      tail = group(0, 0.16, -0.72, spine);
      part(taperTube([[0, 0, 0], [0, -0.3, -0.2], [0, -0.32, -0.55], [0, -0.1, -0.8]], 0.06, 0.035, 6, 10), M.body, 1, 1, 1, 0, 0, 0, tail);
      tail2 = group(0, -0.1, -0.8, tail); part(G.dodeca, M.dark, 0.16, 0.24, 0.16, 0, 0, 0, tail2);
      break;
    }
    case 'morsa': { // morsa (Tundra): corpanzil de gordura com dobras, bigodão, presas de marfim e nadadeiras; gelo grudado nas costas
      H = 0.5; height = 1.3; spine = group(0, H, 0, body);
      const fold = mats.lam(C.clone().multiplyScalar(0.72).getHex()), pad = mats.lam(C.clone().lerp(new THREE.Color(0xf0d8c0), 0.5).getHex()), ivory = shiny(mats.lam(0xf4efe0), 0.5), ice = mats.lam(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.3) }), whisk = mats.lam(0xf0e8d8);
      part(G.sphere, M.body, 1.2, 0.98, 1.15, 0, 0.14, 0.22, spine);
      part(G.sphere, M.body, 1.02, 0.82, 1.1, 0, 0.0, -0.38, spine);
      part(G.sphere, M.mid, 0.62, 0.5, 0.7, 0, -0.1, -0.88, spine);
      for (let i = 0; i < 4; i++) part(SH_ARC, fold, 1.06 - i * 0.06, 0.86 - i * 0.05, 1.2, 0, 0.0, 0.1 - i * 0.24, spine, false);
      for (let i = 0; i < 5; i++) part(SH.gem, ice, 0.12, 0.26, 0.12, (i % 2 - 0.5) * 0.36, 0.46 - i * 0.03, 0.12 - i * 0.2, spine).rotation.x = -0.4;
      head = group(0, 0.42, 0.74, spine);
      part(G.sphere, M.body, 0.6, 0.52, 0.52, 0, 0, 0, head);
      for (const sd of [-1, 1]) {
        part(G.sphere, pad, 0.3, 0.26, 0.26, sd * 0.12, -0.12, 0.22, head);
        for (let k = 0; k < 5; k++) part(G.cyl, whisk, 0.012, 0.16, 0.012, sd * (0.05 + k * 0.045), -0.1 - (k % 2) * 0.04, 0.34, head, false).rotation.x = 1.25;
        part(taperTube([[0, 0, 0], [0, -0.25, 0.06], [0, -0.55, 0.0]], 0.05, 0.018, 6, 8), ivory, 1, 1, 1, sd * 0.1, -0.2, 0.3, head);
        part(G.sphereLo, M.black, 0.06, 0.06, 0.04, sd * 0.17, 0.1, 0.22, head, false);
        part(G.sphereLo, M.glow, 0.025, 0.025, 0.02, sd * 0.17, 0.11, 0.245, head, false);
      }
      jaw = group(0, -0.22, 0.1, head); part(G.sphere, pad, 0.24, 0.1, 0.2, 0, 0, 0.06, jaw);
      addLegs([[-0.44, 0.44], [0.44, 0.44], [-0.32, -0.6], [0.32, -0.6]], 0.2, 0.24, 0.15);
      for (const lo of lows) part(SH.leaf, M.dark, 0.42, 1.6, 0.56, 0, -0.24, 0.1, lo);
      tail = group(0, -0.1, -1.16, spine);
      for (const sd of [-1, 1]) { const fl = part(SH.leaf, M.dark, 0.36, 1.4, 0.6, sd * 0.16, -0.32, -0.12, tail); fl.rotation.y = sd * 0.5; }
      break;
    }
    case 'rinoceronte': { // rinoceronte (Magma): couro de obsidiana em placas, rachaduras de lava, chifre grande com a ponta em brasa
      H = 0.95; height = 1.9; spine = group(0, H, 0, body); M.hoof = mats.lam(0x1a1414);
      const obs = shiny(mats.lam(0x1c181a), 1.0), obs2 = shiny(mats.lam(0x40363a), 0.8), lava2 = GLOW(0xffd24a), hornM = shiny(mats.lam(0x2a2224), 0.9);
      part(G.sphere, M.body, 1.05, 0.92, 1.7, 0, 0, -0.05, spine);
      part(G.sphere, M.body, 0.96, 0.9, 0.82, 0, 0.14, 0.42, spine);
      part(SH.block, M.mid, 0.62, 0.14, 1.2, 0, -0.38, 0, spine);
      for (const sd of [-1, 1]) for (const [z, y, k] of [[0.46, 0.16, 1], [0, 0.1, 1.1], [-0.5, 0.08, 1]]) {
        const pl = part(SH.block, obs, 0.12, 0.5 * k, 0.48 * k, sd * 0.49, y, z, spine); pl.rotation.z = sd * 0.35;
        part(G.box, M.glow, 0.02, 0.48 * k, 0.03, sd * 0.53, y, z + 0.25 * k, spine, false).rotation.z = sd * 0.35;
      }
      for (let i = 0; i < 6; i++) part(SH.gem, obs2, 0.14, 0.34, 0.14, (i % 2 - 0.5) * 0.2, 0.5 - Math.abs(i - 2) * 0.02, 0.58 - i * 0.22, spine).rotation.x = -0.5;
      head = group(0, 0.14, 0.94, spine);
      part(SH.block, M.body, 0.5, 0.46, 0.6, 0, 0, 0.06, head);
      part(SH.block, M.body, 0.4, 0.34, 0.32, 0, -0.06, 0.4, head);
      part(taperTube([[0, 0, 0], [0, 0.22, 0.06], [0, 0.46, -0.04], [0, 0.6, -0.2]], 0.13, 0.012, 7, 9), hornM, 1, 1, 1, 0, 0.1, 0.48, head);
      part(SH.fang, M.glow, 0.07, 0.18, 0.07, 0, 0.68, 0.3, head, false).rotation.x = -0.9;
      part(SH.fang, lava2, 0.04, 0.1, 0.04, 0, 0.73, 0.27, head, false).rotation.x = -0.9;
      part(taperTube([[0, 0, 0], [0, 0.12, 0.0], [0, 0.22, -0.06]], 0.07, 0.01, 6, 6), hornM, 1, 1, 1, 0, 0.18, 0.2, head);
      for (const sd of [-1, 1]) {
        const ear = part(G.cone4, M.body, 0.12, 0.24, 0.08, sd * 0.2, 0.3, -0.12, head); ear.rotation.z = -sd * 0.4;
        part(G.box, M.glow, 0.02, 0.2, 0.02, sd * 0.24, 0.0, 0.2, head, false).rotation.z = sd * 0.5;
      }
      eyesGlow(head, 0.06, 0.24, 0.2, 0.06, 0.04, 0.2);
      jaw = group(0, -0.2, 0.26, head); part(SH.block, M.dark, 0.3, 0.08, 0.3, 0, 0, 0.1, jaw);
      addLegs([[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.52], [0.3, -0.52]], 0.44, 0.44, 0.24);
      for (const l of legs) part(G.box, M.glow, 0.02, 0.24, 0.02, 0.1, -0.24, 0.12, l, false).rotation.z = 0.3;
      tail = group(0, 0.1, -0.88, spine); part(G.cyl, M.dark, 0.05, 0.4, 0.05, 0, -0.18, -0.04, tail).rotation.x = 0.3; part(G.cone, M.glow, 0.1, 0.16, 0.1, 0, -0.4, -0.1, tail, false).rotation.x = Math.PI;
      break;
    }
    default: return buildWolf(def);
  }
  if (!tail) tail = group(0, 0, -0.5, spine);
  root.scale.setScalar(def.size || 1);
  return optimizeRig({ kind: 'wolf', style: sp, root, body, spine, head, jaw, legs, lows, tail, tail2, claws: claws.length ? claws : null, heads: body.userData.heads || null, mats: mats.list, height: height * (def.size || 1) });
}

// Conjurador encapuzado: manto longo, capuz e cajado com orbe da cor da magia
export function buildCultist(def) {
  const glow = def.ranged?.color ?? def.glow ?? 0xb06bff;
  const rig = buildHumanoid({ mob: true, robe: true, colors: { skin: def.skin ?? 0xb8b0a0, tunic: def.color, pants: new THREE.Color(def.color).multiplyScalar(0.6).getHex(), trim: glow, hair: 0x1a1a1a, boots: 0x1a1a1a, leather: 0x2a2020 },
    bald: true, cape: new THREE.Color(def.color).multiplyScalar(0.5).getHex(), scale: def.size || 1.05, detail: false, eyeColor: glow, hunch: 0.15 });
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const CC = new THREE.Color(def.color), hood = L(CC.clone().multiplyScalar(0.7).getHex()), robeD = L(CC.clone().multiplyScalar(0.5).getHex()), robeL = L(CC.clone().lerp(new THREE.Color(0xffffff), 0.15).getHex());
  const trimM = L(new THREE.Color(glow).lerp(new THREE.Color(0xd9b25f), 0.5).getHex()), rope = L(0x8a7048), runeM = new THREE.MeshBasicMaterial({ color: glow });
  if (def.form !== 'piromante') { // capuz fundo: cúpula atrás, borda que emoldura o rosto escuro e ponta caída
    part(G.sphere, hood, 0.66, 0.64, 0.66, 0, 0.3, -0.05, rig.head);
    const rim = part(new THREE.TorusGeometry(0.5, 0.11, 5, 12, Math.PI * 1.15), hood, 0.62, 0.66, 0.6, 0, 0.24, 0.16, rig.head); rim.rotation.z = -Math.PI * 0.075;
    const tip = part(SH.fang, hood, 0.3, 0.5, 0.3, 0, 0.42, -0.34, rig.head); tip.rotation.x = -2.1;
    part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x0a0a10 }), 0.44, 0.44, 0.1, 0, 0.25, 0.25, rig.head, false); // rosto na sombra
    const mantle = part(new THREE.CylinderGeometry(0.32, 0.56, 0.3, 10, 1, true), hood, 1, 1, 1, 0, 0.66, 0, rig.torso); mantle.material = hood;
  }
  // manto: faixa da frente com runas, barra bordada, cinto de corda com borlas e mangas largas
  part(G.box, robeL, 0.22, 0.6, 0.04, 0, 0.32, 0.23, rig.torso);
  for (let i = 0; i < 4; i++) part(G.box, runeM, 0.06, 0.06, 0.02, 0, 0.5 - i * 0.12, 0.255, rig.torso, false).rotation.z = Math.PI / 4;
  if (rig.skirt) { part(G.box, robeL, 0.22, 0.86, 0.04, 0, -0.42, 0.36, rig.torso).rotation.x = -0.18; for (let i = 0; i < 3; i++) part(G.box, runeM, 0.05, 0.05, 0.02, 0, -0.2 - i * 0.22, 0.4 + i * 0.04, rig.torso, false).rotation.z = Math.PI / 4; }
  part(new THREE.TorusGeometry(0.5, 0.06, 4, 16), rope, 0.64, 0.64, 0.5, 0, 0.06, 0, rig.torso).rotation.x = Math.PI / 2;
  for (const sd of [-1, 1]) { part(G.cyl, rope, 0.03, 0.3, 0.03, sd * 0.1, -0.1, 0.24, rig.torso); part(SH.fang, trimM, 0.07, 0.1, 0.07, sd * 0.1, -0.28, 0.24, rig.torso).rotation.x = Math.PI; }
  part(new THREE.TorusGeometry(0.5, 0.05, 4, 18), trimM, 0.98, 0.98, 0.8, 0, -0.84, 0, rig.torso).rotation.x = Math.PI / 2;
  for (const e of [rig.elbowL, rig.elbowR]) { const sl = part(new THREE.CylinderGeometry(0.1, 0.2, 0.32, 8, 1, true), robeD, 1, 1, 1, 0, -0.18, 0, e); sl.material.side = THREE.DoubleSide; part(new THREE.TorusGeometry(0.5, 0.06, 4, 12), trimM, 0.38, 0.38, 0.38, 0, -0.34, 0, e).rotation.x = Math.PI / 2; }
  part(G.sphereLo, trimM, 0.12, 0.12, 0.05, 0, 0.62, 0.22, rig.torso);
  { const book = group(0.28, 0.0, 0.12, rig.hips); book.rotation.set(0.1, -0.5, 0.2); part(G.box, L(0x3a2418), 0.2, 0.26, 0.07, 0, 0, 0, book); part(G.box, L(0xe8dcc0), 0.18, 0.24, 0.05, 0.012, 0, 0, book); part(G.box, runeM, 0.06, 0.06, 0.02, -0.01, 0, 0.04, book, false); }
  for (let i = 0; i < 3; i++) part(SH.gem, runeM, 0.05, 0.08, 0.05, -0.12 + i * 0.12, -0.32, 0.06, rig.handL, false);
  for (const s of [-1, 1]) part(G.box, new THREE.MeshBasicMaterial({ color: glow }), 0.08, 0.05, 0.03, s * 0.09, 0.27, 0.3, rig.head, false);
  const sigil = part(G.octa, new THREE.MeshBasicMaterial({ color: glow }), 0.12, 0.18, 0.04, 0, 0.42, 0.26, rig.torso, false); void sigil;
  const staff = buildWeapon('cajado', 'raro');
  staff.traverse((m) => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(glow), 0.5); } });
  rig.handR.add(staff);
  part(G.sphere, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.85 }), 0.2, 0.2, 0.2, 0, 0.05, 0.1, rig.handL, false);
  rig.kind = 'humanoid'; rig.weaponKind = 'cajado';
  humanoidForm(rig, def);
  return optimizeRig(rig);
}

// ---------------- NATAL ----------------
// Noel: grandão de casaco vermelho com pelinho branco, barba, gorro com pompom, cinto com fivela dourada,
// saco de presentes nas costas e um bastão listrado de vermelho e branco
export function buildNoel(def) {
  const red = 0xc81e1e, white = 0xf6f4ee;
  const rig = buildHumanoid({ mob: true, bulk: 1.4, colors: { skin: 0xf2c4a0, tunic: red, pants: red, trim: white, hair: white, boots: 0x161616, leather: 0x161616 }, scale: def.size || 1.75, beard: false });
  const L = (col, x) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...x }); rig.mats.push(m); return m; };
  const W = L(white), Wd = L(0xdcd8d0), R = L(red), Rd = L(0x9a1414), K = shiny(L(0x161616), 0.5), Au = shiny(L(0xffd24a), 1), Sa = L(0x8a5a32), SaD = L(0x6a4224), Gr = L(0x2f8a3f), pink = L(0xf08a8a), nose = L(0xe85a5a);
  const H = rig.head, T = rig.torso;
  // rosto: bochechas coradas, nariz de bolinha, óculos redondos dourados e sobrancelhas fofas
  for (const sd of [-1, 1]) { part(G.sphereLo, pink, 0.1, 0.07, 0.05, sd * 0.15, 0.17, 0.22, H); part(SH.ring, Au, 0.13, 0.13, 0.08, sd * 0.1, 0.26, 0.255, H); part(G.sphereLo, W, 0.14, 0.06, 0.08, sd * 0.11, 0.35, 0.23, H).rotation.z = sd * -0.2; }
  part(G.box, Au, 0.06, 0.015, 0.015, 0, 0.27, 0.27, H);
  part(G.sphereLo, nose, 0.09, 0.08, 0.08, 0, 0.2, 0.27, H);
  // barba de nuvem em camadas até o peito e bigode enrolado
  for (const [x, y, z, sx, sy] of [[0, 0.08, 0.2, 0.5, 0.26], [-0.16, -0.04, 0.17, 0.26, 0.3], [0.16, -0.04, 0.17, 0.26, 0.3], [0, -0.12, 0.17, 0.36, 0.34], [-0.1, -0.26, 0.13, 0.22, 0.24], [0.1, -0.26, 0.13, 0.22, 0.24], [0, -0.34, 0.1, 0.18, 0.2]]) part(G.sphere, (x + y) % 0.2 > 0.05 ? Wd : W, sx, sy, 0.22, x, y, z, H);
  for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.1, -0.02, 0.02], [sd * 0.18, 0.04, 0], [sd * 0.2, 0.1, -0.02]], 0.05, 0.015, 5, 6), W, 1, 1, 1, sd * 0.02, 0.15, 0.27, H);
  // gorro molenga caído para trás, borda de pelo e pompom
  const hat = group(0, 0.4, -0.02, H);
  part(SH.ring, W, 0.62, 0.62, 0.9, 0, 0, 0, hat).rotation.x = Math.PI / 2;
  part(taperTube([[0, 0, 0], [0, 0.22, -0.04], [0.04, 0.4, -0.18], [0.12, 0.42, -0.36], [0.2, 0.3, -0.46]], 0.27, 0.05, 9, 10), R, 1, 1, 1, 0, 0.02, 0, hat);
  part(G.sphere, W, 0.2, 0.2, 0.2, 0.22, 0.28, -0.5, hat);
  // barrigão com faixa de pelo e botões, cinto largo com fivela, pelo na barra, nos punhos e nas botas
  part(G.sphere, R, 0.8, 0.66, 0.56, 0, 0.3, 0.14, T);
  part(G.box, W, 0.12, 0.64, 0.06, 0, 0.36, 0.42, T).rotation.x = -0.1;
  for (let i = 0; i < 3; i++) part(G.sphereLo, Au, 0.05, 0.05, 0.03, 0.09, 0.56 - i * 0.16, 0.42 - Math.abs(i - 1) * 0.03, T);
  part(G.box, K, 0.86, 0.13, 0.58, 0, 0.12, 0.03, rig.hips);
  part(G.box, Au, 0.22, 0.18, 0.04, 0, 0.12, 0.33, rig.hips); part(G.box, K, 0.12, 0.08, 0.05, 0, 0.12, 0.34, rig.hips);
  part(SH.ring, W, 0.96, 0.96, 0.7, 0, -0.08, 0.02, rig.hips).rotation.x = Math.PI / 2;
  part(SH.ring, W, 0.82, 0.82, 0.5, 0, 0.68, 0, T).rotation.x = Math.PI / 2;
  for (const e of [rig.elbowL, rig.elbowR]) part(SH.ring, W, 0.3, 0.3, 0.6, 0, -0.24, 0, e).rotation.x = Math.PI / 2;
  for (const k of [rig.kneeL, rig.kneeR]) { part(SH.ring, W, 0.3, 0.3, 0.7, 0, -0.18, 0, k).rotation.x = Math.PI / 2; part(G.box, Au, 0.08, 0.06, 0.03, 0, -0.33, 0.16, k); }
  for (const h of [rig.handL, rig.handR]) part(G.sphereLo, W, 0.17, 0.17, 0.15, 0, 0.0, 0, h);
  // saco de presentes cheio: amarrado com corda, presentes com laço e uma bengala saindo
  const sack = group(0, 0.5, -0.46, T);
  part(SH.rock, Sa, 0.86, 0.96, 0.7, 0, 0.1, -0.12, sack); part(G.sphere, SaD, 0.6, 0.5, 0.5, 0.1, -0.2, -0.1, sack);
  part(G.cyl, L(0xd9b25f), 0.2, 0.14, 0.2, 0, 0.56, -0.1, sack);
  for (const [x, y, z, c, c2, k] of [[0.14, 0.64, -0.04, R, Au, 0.26], [-0.16, 0.62, -0.16, Gr, W, 0.22], [0.0, 0.74, -0.24, L(0x3a6ad8), Au, 0.2]]) { const gb = group(x, y, z, sack); gb.rotation.set(0.2, x * 3, 0.3); part(G.box, c, k, k, k, 0, 0, 0, gb); part(G.box, c2, k * 1.02, k * 1.02, k * 0.2, 0, 0, 0, gb); part(G.box, c2, k * 0.2, k * 1.02, k * 1.02, 0, 0, 0, gb); for (const sd of [-1, 1]) part(SH.ring, c2, k * 0.4, k * 0.4, k * 0.6, sd * k * 0.16, k * 0.6, 0, gb).rotation.y = Math.PI / 2; }
  for (let i = 0; i < 4; i++) part(G.cyl, i % 2 ? R : W, 0.05, 0.12, 0.05, -0.28, 0.6 + i * 0.12, 0.0, sack);
  // bengala listrada com a ponta curva
  const staff = group(0, -0.05, 0.05, rig.handR); staff.rotation.x = Math.PI / 2;
  for (let i = 0; i < 9; i++) { const sg = part(G.cyl, i % 2 ? R : W, 0.1, 0.16, 0.1, 0, -0.6 + i * 0.16, 0, staff); sg.rotation.y = i * 0.4; }
  part(taperTube([[0, 0, 0], [0, 0.18, 0], [0.12, 0.3, 0], [0.26, 0.24, 0], [0.3, 0.1, 0]], 0.05, 0.05, 6, 10), R, 1, 1, 1, 0, 0.82, 0, staff);
  for (let i = 0; i < 4; i++) part(SH.ring, W, 0.12, 0.12, 0.3, i * 0.08, 0.92 + Math.sin(i) * 0.12, 0, staff).rotation.y = Math.PI / 2;
  rig.kind = 'humanoid'; rig.weaponKind = 'machado';
  return optimizeRig(rig);
}

// Boneco de neve: três bolas de neve, olhos e boca de carvão, nariz de cenoura, braços de galho,
// cartola e cachecol. Pula como um slime. O "mini" é o ajudante (sem cartola, só um gorrinho).
export function buildBoneco(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const mini = !!def.mini;
  const snow = mats.lam(0xf4f8ff), snowD = mats.lam(0xd8e4f2), snowB = mats.lam(0xe4eefa), coal = new THREE.MeshBasicMaterial({ color: 0x15151c });
  const ice = mats.lam(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.35) }), iceG = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  const puddle = part(SH_PUDDLE_DOME, mats.lam(0xe8f0fa), 1.3 / 0.86, 0.12, 1.3 / 0.86, 0, 0.04, 0, body, false);
  // três bolas de neve com montinhos e neve acumulada
  part(G.sphere, snow, 1.2, 1.0, 1.2, 0, 0.5, 0, body);
  part(G.sphere, snowD, 0.86, 0.76, 0.86, 0, 1.2, 0, body);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; part(SH.rock, i % 2 ? snowB : snow, 0.26, 0.16, 0.24, Math.sin(a) * 0.52, 0.32 + (i % 3) * 0.2, Math.cos(a) * 0.52, body); }
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.5; part(SH.rock, snowB, 0.2, 0.12, 0.18, Math.sin(a) * 0.38, 1.05 + (i % 2) * 0.18, Math.cos(a) * 0.38, body); }
  const headG = group(0, 1.78, 0, body);
  part(G.sphere, snow, 0.62, 0.58, 0.62, 0, 0, 0, headG);
  const eyes = [];
  if (mini) { // ajudante fofo: olhinhos com brilho, bochechas e sorriso
    const hl = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sd of [-1, 1]) { const e = group(sd * 0.12, 0.08, 0.27, headG); part(G.sphereLo, coal, 0.1, 0.12, 0.06, 0, 0, 0, e, false); part(G.sphereLo, hl, 0.035, 0.035, 0.02, 0.02, 0.03, 0.03, e, false); eyes.push(e); part(G.sphereLo, mats.lam(0xff9aaa), 0.09, 0.05, 0.03, sd * 0.2, -0.05, 0.25, headG); }
  } else { // chefe: olhos de gelo acesos, sobrancelhas de carvão bravas
    for (const sd of [-1, 1]) { const e = group(sd * 0.13, 0.08, 0.27, headG); part(G.sphereLo, coal, 0.13, 0.11, 0.06, 0, 0, 0, e, false); part(G.sphereLo, iceG, 0.07, 0.06, 0.04, 0, 0, 0.025, e, false); eyes.push(e); const br = part(G.box, coal, 0.16, 0.045, 0.05, sd * 0.13, 0.19, 0.26, headG, false); br.rotation.z = -sd * 0.45; }
  }
  // nariz de cenoura torta
  part(taperTube([[0, 0, 0], [0.02, 0.0, 0.16], [0.06, -0.04, 0.32]], 0.07, 0.01, 6, 6), mats.lam(0xff8a2a), 1, 1, 1, 0, 0, 0.28, headG);
  for (let i = 0; i < 3; i++) part(G.box, mats.lam(0xd86a1a), 0.1, 0.012, 0.012, 0.01 + i * 0.02, -0.01 - i * 0.012, 0.36 + i * 0.07, headG);
  const mouth = group(0, -0.12, 0.27, headG);
  if (mini) for (let i = 0; i < 5; i++) part(G.sphereLo, coal, 0.05, 0.05, 0.04, (i - 2) * 0.07, Math.abs(i - 2) * 0.025, 0, mouth, false);
  else for (let i = 0; i < 7; i++) { const t = part(SH.fang, coal, 0.06, 0.09, 0.04, (i - 3) * 0.055, (i % 2 ? -0.02 : 0.02) - Math.abs(i - 3) * 0.012, 0, mouth, false); t.rotation.z = i % 2 ? Math.PI : 0; }
  for (let i = 0; i < 3; i++) part(G.sphereLo, coal, 0.08, 0.08, 0.05, 0, 1.38 - i * 0.2, 0.42 - i * 0.02, body, false); // botões
  // braços de galho tortos com gravetos (o mini usa luvinhas)
  const wood = mats.lam(0x5a3a22), mit = mats.lam(0xd8283a), bArms = [];
  for (const sd of [-1, 1]) {
    const arm = group(sd * 0.38, 1.25, 0, body); arm.rotation.z = sd * -1.0; bArms.push(arm);
    part(taperTube([[0, 0, 0], [0.04, 0.3, 0.02], [-0.03, 0.58, 0], [0.02, 0.84, 0.03]], 0.04, 0.022, 5, 8), wood, 1, 1, 1, 0, 0, 0, arm);
    if (mini) part(G.sphereLo, mit, 0.14, 0.16, 0.12, 0.02, 0.88, 0.03, arm);
    else for (const f of [-0.7, 0, 0.6]) part(taperTube([[0, 0, 0], [f * 0.08, 0.1, 0], [f * 0.16, 0.2, 0.02]], 0.022, 0.006, 4, 4), wood, 1, 1, 1, 0.02, 0.84, 0.03, arm);
    if (!mini) for (let k = 0; k < 2; k++) part(G.cone, ice, 0.04, 0.14, 0.04, 0.04, 0.3 + k * 0.25, 0, arm).rotation.z = Math.PI;
  }
  // cachecol que flutua (pano)
  const R = { kind: 'slime', root, body, core: null, eyes, mouth, puddle, top: null, arms: bArms, mats: mats.list };
  const scM = clothMat(R, 0xd8283a), sc2 = mats.lam(0x2fae4f);
  part(SH.ring, mats.lam(0xd8283a), 0.8, 0.8, 0.5, 0, 1.55, 0, body).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) part(G.box, sc2, 0.03, 0.12, 0.03, Math.sin(i * 1.57) * 0.42, 1.55, Math.cos(i * 1.57) * 0.42, body);
  const tailG = group(0.22, 1.52, 0.32, body); tailG.rotation.set(0.25, 0.3, 0.15);
  tailG.add(clothMesh([[CLOTH_BOX, 0.17, 0.58, 0.05, 0, -0.29, 0], [CLOTH_BOX, 0.18, 0.06, 0.06, 0, -0.46, 0.005], [CLOTH_TIP, 0.16, 0.1, 0.05, 0, -0.62, 0, Math.PI]], scM, 0, 0.6));
  const tail2 = group(-0.24, 1.52, -0.3, body); tail2.rotation.set(-0.5, 0.4, -0.2);
  tail2.add(clothMesh([[CLOTH_BOX, 0.16, 0.5, 0.05, 0, -0.25, 0], [CLOTH_TIP, 0.15, 0.1, 0.05, 0, -0.55, 0, Math.PI]], scM, 0, 0.55));
  if (mini) { // gorrinho de elfo com a ponta caída e guizo
    part(SH.ring, mats.lam(0xf4f8ff), 0.6, 0.6, 0.8, 0, 0.26, 0, headG).rotation.x = Math.PI / 2;
    part(taperTube([[0, 0, 0], [0, 0.25, -0.02], [0.05, 0.45, -0.12], [0.18, 0.5, -0.24]], 0.27, 0.03, 8, 8), sc2, 1, 1, 1, 0, 0.26, 0, headG);
    part(G.sphereLo, mats.lam(0xffd24a), 0.1, 0.1, 0.1, 0.2, 0.74, -0.26, headG);
  } else { // cartola amassada e torta, faixa vermelha, azevinho e coroa de pingentes de gelo
    const blk = mats.lam(0x1a1a22), hatG = group(0.04, 0.28, 0, headG); hatG.rotation.z = -0.18;
    part(G.cyl, blk, 0.8, 0.06, 0.8, 0, 0.02, 0, hatG);
    part(new THREE.CylinderGeometry(0.5, 0.46, 1, 9), blk, 0.5, 0.56, 0.5, 0, 0.32, 0, hatG);
    part(G.cyl, mats.lam(0xd8283a), 0.52, 0.1, 0.52, 0, 0.12, 0, hatG);
    part(G.sphereLo, mats.lam(0xd8283a), 0.08, 0.08, 0.08, 0.2, 0.16, 0.14, hatG, false);
    for (const sd of [-1, 1]) { const lf = part(SH.leaf, sc2, 0.12, 0.6, 0.24, 0.22 + sd * 0.08, 0.18, 0.12, hatG); lf.rotation.set(0.3, sd * 0.6, 0); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; part(G.cone, ice, 0.05, 0.16 + (i % 2) * 0.08, 0.05, Math.sin(a) * 0.4, -0.06, Math.cos(a) * 0.4, hatG).rotation.x = Math.PI; }
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const c = part(SH.gem, iceG, 0.12, 0.3 + k * 0.08, 0.12, sd * (0.45 + k * 0.05), 1.48 + k * 0.05, -0.1 - k * 0.1, body, false); c.rotation.z = -sd * (0.4 + k * 0.2); }
  }
  const core = group(0, 0.5, 0, body);
  R.core = core;
  const sz = def.size || 1;
  root.scale.setScalar(sz);
  R.height = 2.2 * sz;
  return optimizeRig(R);
}

// Rena Maligna: arreio vermelho com sininhos dourados, manta listrada, nariz vermelho aceso e coroa de azevinho
function dressRena(rig) {
  const sp = rig.spine || rig.body; if (!sp) return;
  const L = (col, x) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...x }); rig.mats.push(m); return m; };
  const red = L(0xb8182a), grn = L(0x1e6a34), gold = L(0xffd24a, { emissive: new THREE.Color(0xffd24a).multiplyScalar(0.15) }), wht = L(0xf6f4ee), dk = L(0x2a1a10);
  part(SH.block, red, 0.56, 0.1, 0.16, 0, 0.16, 0.32, sp);
  part(SH.block, red, 0.56, 0.1, 0.16, 0, 0.16, -0.26, sp);
  part(SH.block, grn, 0.6, 0.06, 0.56, 0, 0.27, 0.02, sp);
  for (let i = 0; i < 5; i++) part(G.box, i % 2 ? wht : red, 0.62, 0.065, 0.08, 0, 0.275, -0.2 + i * 0.1, sp);
  for (const sd of [-1, 1]) { part(G.box, grn, 0.04, 0.3, 0.5, sd * 0.3, 0.12, 0.02, sp); for (let k = 0; k < 4; k++) part(SH.fang, gold, 0.05, 0.08, 0.05, sd * 0.31, -0.06, -0.16 + k * 0.12, sp).rotation.x = Math.PI; }
  for (const sd of [-1, 1]) for (const z of [0.32, -0.26]) { part(G.sphere, gold, 0.11, 0.11, 0.11, sd * 0.3, 0.08, z, sp); part(G.box, dk, 0.02, 0.06, 0.02, sd * 0.3, 0.05, z + 0.05, sp); }
  for (let i = 0; i < 5; i++) part(G.sphere, gold, 0.09, 0.09, 0.09, -0.24 + i * 0.12, -0.02 - Math.abs(i - 2) * 0.03, 0.45, sp);
  const cream = L(0xf0e6d4);
  part(G.sphere, cream, 0.36, 0.34, 0.24, 0, -0.02, 0.47, sp); for (let i = 0; i < 7; i++) { const tf = part(SH.fang, cream, 0.09, 0.17, 0.07, (i - 3) * 0.05, -0.15 - Math.abs(i - 3) * -0.012, 0.52 - Math.abs(i - 3) * 0.02, sp); tf.rotation.set(Math.PI - 0.25, 0, (i - 3) * 0.12); } // peito de pelo claro e fofo
  if (rig.tail) { part(G.sphere, cream, 0.22, 0.2, 0.2, 0, 0.02, -0.06, rig.tail); }
  for (const sd of [-1, 1]) part(G.cyl, red, 0.025, 0.7, 0.025, sd * 0.14, 0.42, 0.62, sp).rotation.x = 0.9; // rédeas
  if (rig.head) {
    part(SH.block, red, 0.3, 0.06, 0.32, 0, 0.06, 0.06, rig.head);
    part(G.sphere, GLOW(0xff2a2a), 0.11, 0.1, 0.1, 0, -0.02, 0.4, rig.head, false);
    for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5) * 2.4; const lf = part(SH.leaf, grn, 0.08, 0.5, 0.18, Math.sin(a) * 0.12, 0.15, -0.04 + Math.cos(a) * 0.06, rig.head); lf.rotation.set(0.3, a, 0); }
    for (let i = 0; i < 3; i++) part(G.sphereLo, red, 0.05, 0.05, 0.05, (i - 1) * 0.06, 0.18, 0.04, rig.head);
  }
}

// Cavaleiro de armadura completa: elmo fechado com fresta brilhante, ombreiras, montante
export function buildKnight(def) {
  const metal = def.color, glow = def.glow ?? 0xff3b2f, MC = new THREE.Color(metal), negro = def.form === 'negro';
  const trimC = MC.clone().lerp(new THREE.Color(negro ? 0x8a2a2a : 0xd9b25f), 0.45).getHex();
  const rig = buildHumanoid({ mob: true, capeStyle: negro ? 'rasgada' : 'full', colors: { skin: metal, tunic: metal, pants: MC.clone().multiplyScalar(0.75).getHex(), trim: trimC, hair: metal, boots: MC.clone().multiplyScalar(0.6).getHex(), leather: 0x2a2020 },
    bald: true, bulk: 1.15, cape: def.cape ?? 0x3a1018, scale: def.size || 1.15, detail: false, eyeColor: glow });
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const plate = shiny(L(MC.clone().multiplyScalar(1.15).getHex()), 0.85), plateD = shiny(L(MC.clone().multiplyScalar(0.7).getHex()), 0.6), edge = shiny(L(trimC), 1), dark = L(0x0a0808), gl = new THREE.MeshBasicMaterial({ color: glow });
  const H = rig.head, T = rig.torso;
  // elmo fechado: cúpula, viseira com fenda em T acesa, furos de respiro, crista e gorjal
  for (const e of rig.eyes) e.visible = false;
  part(SH.block, plate, 0.6, 0.6, 0.62, 0, 0.3, 0, H);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), plate); dome.scale.set(0.6, 0.3, 0.62); dome.position.set(0, 0.6, 0); H.add(dome);
  part(SH.block, plateD, 0.5, 0.2, 0.1, 0, 0.28, 0.3, H).rotation.x = -0.1;
  part(G.box, gl, 0.42, 0.045, 0.03, 0, 0.33, 0.33, H, false); part(G.box, gl, 0.05, 0.16, 0.03, 0, 0.24, 0.335, H, false);
  for (let i = 0; i < 6; i++) part(G.box, dark, 0.025, 0.025, 0.02, (i % 3 - 1) * 0.08 + (i < 3 ? -0.14 : 0.14), 0.16 + Math.floor(i / 3) * 0.05 - 0.02, 0.31, H);
  part(G.box, edge, 0.06, 0.14, 0.58, 0, 0.7, -0.02, H);
  part(G.cyl, plateD, 0.66, 0.12, 0.64, 0, 0.02, 0, H);
  // peitoral com aresta no meio, emblema aceso, faixas da barriga, saiote de placas e cinto
  for (const sd of [-1, 1]) { const pc = part(SH.block, plate, 0.4, 0.5, 0.36, sd * 0.17, 0.44, 0.06, T); pc.rotation.y = -sd * 0.28; }
  part(SH.block4, edge, 0.06, 0.5, 0.08, 0, 0.44, 0.24, T);
  for (let i = 0; i < 3; i++) part(SH.block, i % 2 ? plateD : plate, 0.66 - i * 0.03, 0.1, 0.44, 0, 0.14 - i * 0.08, 0.02, T);
  part(SH.block, L(0x2a1a14), 0.7, 0.08, 0.46, 0, -0.08, 0, T); part(SH.block4, edge, 0.1, 0.09, 0.05, 0, -0.08, 0.24, T);
  if (negro) { const sg = part(SH.gem, gl, 0.12, 0.22, 0.04, 0, 0.48, 0.27, T, false); void sg; for (const sd of [-1, 1]) part(G.box, gl, 0.02, 0.18, 0.02, sd * 0.07, 0.44, 0.265, T, false).rotation.z = sd * 0.6; }
  else part(SH.gem, gl, 0.14, 0.24, 0.05, 0, 0.48, 0.27, T, false);
  for (let i = 0; i < 4; i++) { const t2 = part(SH.block, i % 2 ? plateD : plate, 0.2, 0.26, 0.05, (i - 1.5) * 0.17, -0.18, 0.2 - Math.abs(i - 1.5) * 0.04, rig.hips); t2.rotation.y = (i - 1.5) * -0.25; t2.rotation.x = -0.12; }
  for (let i = 0; i < 3; i++) part(SH.block, plateD, 0.2, 0.24, 0.05, (i - 1) * 0.18, -0.18, -0.2, rig.hips).rotation.x = 0.12;
  // ombreiras em camadas com espinho, cotoveleiras, manoplas com dedos de placa
  for (const [arm, sd] of [[rig.armL, -1], [rig.armR, 1]]) {
    for (let k = 0; k < 3; k++) { const pd = part(new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), k % 2 ? plateD : plate, 0.44 - k * 0.05, 0.3, 0.42 - k * 0.04, sd * 0.02, 0.08 - k * 0.09, 0, arm); pd.rotation.z = sd * (0.35 + k * 0.12); }
    part(G.cyl, edge, 0.46, 0.03, 0.44, sd * 0.02, 0.04, 0, arm).rotation.z = sd * 0.35;
    part(SH.fang, plateD, 0.08, 0.26, 0.08, sd * 0.08, 0.24, 0, arm).rotation.z = -sd * 0.4;
    part(SH.block, plate, 0.24, 0.2, 0.24, 0, -0.2, 0, arm);
  }
  for (const e of [rig.elbowL, rig.elbowR]) { part(G.sphereLo, plate, 0.18, 0.16, 0.18, 0, 0.0, -0.02, e); part(SH.fang, plateD, 0.05, 0.12, 0.05, 0, 0.0, -0.14, e).rotation.x = -Math.PI / 2; part(SH.block, plate, 0.22, 0.2, 0.22, 0, -0.16, 0, e); }
  for (const h of [rig.handL, rig.handR]) { part(SH.block, plateD, 0.16, 0.08, 0.14, 0, 0.03, 0, h.parent); }
  // pernas: coxote, joelheira com espinho, caneleira e sapato de placas pontudo
  for (const [leg, knee] of [[rig.legL, rig.kneeL], [rig.legR, rig.kneeR]]) {
    part(SH.block, plate, 0.26, 0.3, 0.28, 0, -0.18, 0.02, leg);
    part(G.sphereLo, plate, 0.2, 0.18, 0.18, 0, -0.02, 0.06, knee); part(SH.fang, plateD, 0.05, 0.12, 0.05, 0, -0.02, 0.17, knee).rotation.x = Math.PI / 2;
    part(SH.block, plate, 0.22, 0.28, 0.24, 0, -0.2, 0.02, knee);
    part(SH.fang, plateD, 0.16, 0.2, 0.12, 0, -0.4, 0.24, knee).rotation.x = Math.PI / 2;
  }
  const sw = buildWeapon('montante', 'epico');
  sw.traverse((m) => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(glow), 0.25); } });
  rig.handR.add(sw);
  if (negro) { // fumaça escura saindo das juntas e uma pluma vermelha
    for (let i = 0; i < 5; i++) part(SH.fang, L(0x8a1a1a), 0.08, 0.36 - i * 0.03, 0.06, 0, 0.72 - i * 0.01, -0.06 - i * 0.07, H).rotation.x = -1.2 - i * 0.12;
  }
  rig.kind = 'humanoid'; rig.weaponKind = 'montante';
  humanoidForm(rig, def);
  return optimizeRig(rig);
}

// Homem-lagarto: corcunda, focinho comprido, cauda e lança
export function buildLizardman(def) {
  const C = new THREE.Color(def.color);
  const rig = buildHumanoid({ mob: true, colors: { skin: def.color, tunic: 0x4a3a22, pants: C.clone().multiplyScalar(0.7).getHex(), trim: 0xb08a4a, hair: def.color, boots: C.clone().multiplyScalar(0.6).getHex(), leather: 0x3a2a1a },
    bald: true, sleeves: false, scale: def.size || 1.05, detail: false, eyeColor: 0x0a0806, hunch: 0.25 });
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const sk = L(def.color), dk = L(C.clone().multiplyScalar(0.6).getHex()), belly = L(C.clone().lerp(new THREE.Color(0xf0e0a0), 0.45).getHex()), frill = L(C.clone().lerp(new THREE.Color(0xd84a2a), 0.5).getHex());
  const leather = L(0x5a3a22), bone = L(0xe8e0c8), H = rig.head, T = rig.torso;
  // cabeça de lagarto: crânio achatado, focinho comprido com narinas, olho amarelo de pupila fina, crista e babados
  for (const ch of [...H.children]) if (ch.isMesh && ch.geometry === G.sphere) ch.scale.set(0.46, 0.42, 0.52);
  part(SH.limb, sk, 0.3, 0.42, 0.22, 0, 0.18, 0.34, H).rotation.x = Math.PI / 2;
  part(SH.block, belly, 0.24, 0.06, 0.36, 0, 0.1, 0.34, H);
  for (const sd of [-1, 1]) part(G.box, L(0x1a1410), 0.03, 0.02, 0.02, sd * 0.05, 0.24, 0.55, H);
  const jawL = part(SH.limb, dk, 0.24, 0.36, 0.08, 0, 0.06, 0.32, H); jawL.rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) part(SH.fang, bone, 0.025, 0.05, 0.025, sd * 0.09, 0.11, 0.2 + i * 0.07, H).rotation.x = Math.PI;
  const eyeY = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (const sd of [-1, 1]) { part(G.sphereLo, eyeY, 0.1, 0.09, 0.06, sd * 0.17, 0.3, 0.16, H, false); part(SH.block, dk, 0.14, 0.04, 0.1, sd * 0.17, 0.36, 0.14, H).rotation.z = -sd * 0.3; }
  for (const e of rig.eyes) { e.scale.set(0.02, 0.07, 0.02); e.position.set(Math.sign(e.position.x) * 0.17, 0.3, 0.2); }
  for (let i = 0; i < 6; i++) part(SH.fang, frill, 0.08, 0.26 - i * 0.02, 0.06, 0, 0.44 - i * 0.03, 0.12 - i * 0.12, H).rotation.x = -0.3;
  for (const sd of [-1, 1]) { const fr = group(sd * 0.2, 0.22, -0.04, H); fr.rotation.set(0, sd * 0.5, sd * -0.4); for (let k = 0; k < 3; k++) part(SH.leaf, frill, 0.2, 0.6, 0.34, sd * 0.1, (k - 1) * 0.1, 0, fr).rotation.set(0, 0, sd * (1.2 + (k - 1) * 0.4)); }
  // corpo: barriga de escamas claras, espinhos nas costas, peitoral de couro com dente pendurado e braçadeiras
  for (let i = 0; i < 5; i++) part(SH.block, belly, 0.42 - i * 0.03, 0.08, 0.1, 0, 0.6 - i * 0.12, 0.2, T);
  for (let i = 0; i < 6; i++) part(SH.fang, frill, 0.1, 0.26, 0.08, 0, 0.7 - i * 0.12, -0.24, T).rotation.x = -0.6;
  const strap = part(G.box, leather, 0.07, 0.8, 0.03, 0, 0.36, 0.24, T); strap.rotation.z = 0.7;
  part(SH.fang, bone, 0.06, 0.16, 0.06, -0.08, 0.36, 0.27, T).rotation.x = Math.PI;
  for (let i = 0; i < 5; i++) { const f = part(G.cone4, leather, 0.14, 0.3, 0.04, (i - 2) * 0.1, -0.14, 0.17, rig.hips); f.rotation.x = Math.PI; }
  for (const e of [rig.elbowL, rig.elbowR]) for (let k = 0; k < 3; k++) part(SH.fang, dk, 0.05, 0.12, 0.05, 0, -0.08 - k * 0.06, -0.08, e).rotation.x = -1.2;
  // cauda grossa de três juntas que afina, com espinhos
  let prev = rig.hips;
  for (let i = 0; i < 4; i++) { const t = group(0, i === 0 ? 0 : -0.03, i === 0 ? -0.18 : -0.34, prev); t.rotation.x = 0.28; part(SH.limb, i % 2 ? dk : sk, 0.26 - i * 0.05, 0.42, 0.24 - i * 0.05, 0, 0, -0.18, t).rotation.x = -Math.PI / 2; part(SH.fang, frill, 0.06, 0.14, 0.05, 0, 0.1 - i * 0.02, -0.18, t).rotation.x = -0.4; prev = t; }
  // lança de osso com penas e amarração
  const spear = new THREE.Group();
  part(G.cyl, L(0x6a4a2a), 0.06, 2.0, 0.06, 0, 0.3, 0, spear);
  part(SH.gem, L(0xd8d0c0), 0.14, 0.42, 0.06, 0, 1.48, 0, spear);
  part(G.cyl, L(0x3a2a1a), 0.09, 0.14, 0.09, 0, 1.26, 0, spear);
  for (let k = 0; k < 3; k++) part(SH.leaf, L(k % 2 ? 0xd84a2a : 0x3ab0c8), 0.08, 0.5, 0.24, 0.05, 1.12 - k * 0.06, 0, spear).rotation.z = 0.3 + k * 0.3;
  spear.rotation.x = Math.PI / 2; spear.position.z = 0.2;
  rig.handR.add(spear);
  rig.kind = 'humanoid'; rig.weaponKind = 'adaga';
  return optimizeRig(rig);
}

// Ente (Guardião do Bosque): esqueleto do golem com tronco, galhos e copa de folhas
export function buildTreant(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const BC = new THREE.Color(def.color), LC = new THREE.Color(def.leaf ?? 0x3a7a3a);
  const bark = mats.lam(def.color), barkD = mats.lam(BC.clone().multiplyScalar(0.65).getHex()), barkL = mats.lam(BC.clone().lerp(new THREE.Color(0xd8c8a0), 0.25).getHex());
  const leaf = mats.lam(LC.getHex()), leafD = mats.lam(LC.clone().multiplyScalar(0.7).getHex()), leafL = mats.lam(LC.clone().lerp(new THREE.Color(0xd8ff8a), 0.3).getHex());
  const moss = mats.lam(0x4a8a3a), sap = new THREE.MeshBasicMaterial({ color: def.glow ?? 0x9aff6a }), flower = mats.lam(0xff9ac0), flower2 = mats.lam(0xffe27a);
  const fs = (n) => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, n, 3); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const k = 1 + Math.sin(Math.atan2(z, x) * 5 + y * 3) * 0.08; p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); return g; };
  const TRUNK = fs(9);
  // pernas: troncos com raízes que se espalham no chão
  const legs = [];
  for (const sd of [-1, 1]) {
    const l = group(sd * 0.4, 1.05, 0, body);
    part(TRUNK, barkD, 0.44, 0.54, 0.44, 0, -0.25, 0, l); part(SH.rock, barkD, 0.44, 0.24, 0.46, 0, -0.52, 0.02, l); part(TRUNK, barkD, 0.4, 0.5, 0.4, 0, -0.76, 0, l);
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; part(taperTube([[0, 0, 0], [Math.cos(a) * 0.2, -0.1, Math.sin(a) * 0.2], [Math.cos(a) * 0.4, -0.04, Math.sin(a) * 0.42]], 0.09, 0.02, 5, 5), barkD, 1, 1, 1, 0, -0.98, 0, l); }
    part(SH.rock, moss, 0.4, 0.14, 0.4, 0, -0.3, 0.12, l);
    legs.push(l);
  }
  // tronco com casca sulcada, buraco do rosto, seiva brilhando e cogumelos de orelha-de-pau
  const torso = group(0, 1.1, 0, body);
  part(TRUNK, bark, 1.12, 1.55, 0.92, 0, 0.65, 0, torso);
  for (let i = 0; i < 8; i++) part(G.box, barkD, 0.07, 1.25, 0.06, Math.cos(i * 0.8) * 0.5, 0.65, Math.sin(i * 0.8) * 0.42, torso).rotation.y = -i * 0.8;
  part(G.sphereLo, mats.lam(0x1a1208), 0.36, 0.48, 0.12, 0, 0.72, 0.44, torso);
  const core = part(G.octa, sap, 0.24, 0.34, 0.12, 0, 0.72, 0.48, torso, false);
  for (let i = 0; i < 4; i++) part(G.box, sap, 0.025, 0.2 + i * 0.05, 0.02, -0.3 + i * 0.2, 0.3 + (i % 2) * 0.25, 0.47, torso, false);
  for (let i = 0; i < 4; i++) part(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8, 1, false, 0, Math.PI), barkL, 0.3, 0.5, 0.3, 0.48, 0.4 + i * 0.12, -0.1 + i * 0.06, torso).rotation.set(0, Math.PI / 2, 0);
  for (const [x, y, z] of [[-0.5, 1.2, 0.2], [0.42, 1.0, 0.32], [0.1, 0.25, 0.46]]) part(SH.rock, moss, 0.36, 0.14, 0.3, x, y, z, torso);
  // cabeça: nó de madeira com sobrancelhas de galho, olhos de seiva e barba de musgo
  const head = group(0, 1.4, 0.2, torso);
  part(SH.rock, barkD, 0.6, 0.5, 0.5, 0, 0.05, 0, head);
  const eyes = [];
  for (const sd of [-1, 1]) { eyes.push(part(G.sphereLo, sap, 0.1, 0.08, 0.04, sd * 0.13, 0.1, 0.24, head, false)); part(taperTube([[0, 0, 0], [sd * 0.1, 0.04, 0.02], [sd * 0.22, 0.1, -0.04]], 0.04, 0.01, 4, 5), barkL, 1, 1, 1, sd * 0.06, 0.17, 0.24, head); }
  for (let i = 0; i < 6; i++) part(G.box, moss, 0.05, 0.22 + (i % 3) * 0.08, 0.03, (i - 2.5) * 0.06, -0.15, 0.24, head);
  // copa: várias bolas de folhas, galhos saindo e flores
  for (const [x, y, z, sc] of [[0, 2.1, -0.3, 1.5], [-0.62, 1.8, -0.2, 0.95], [0.62, 1.85, -0.3, 1.05], [0.2, 2.0, 0.2, 0.75], [-0.25, 2.0, -0.7, 1.05], [0.4, 2.4, -0.45, 0.8], [-0.35, 2.35, -0.1, 0.75]]) part(SH.rock, (x + z) > 0 ? leafL : (x + z) > -0.5 ? leaf : leafD, sc, sc * 0.78, sc, x, y, z, torso);
  for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.2, 0.25, 0], [sd * 0.5, 0.45, -0.1]], 0.08, 0.02, 5, 6), barkD, 1, 1, 1, sd * 0.3, 1.35, -0.1, torso);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; const f = group(Math.sin(a) * 0.62, 1.95 + (i % 3) * 0.2, Math.cos(a) * 0.5 - 0.2, torso); for (let k = 0; k < 5; k++) part(SH.leaf, i % 2 ? flower : flower2, 0.06, 0.5, 0.12, Math.cos(k * 1.26) * 0.05, 0, Math.sin(k * 1.26) * 0.05, f).rotation.y = k * 1.26; }
  // braços de galho com mão de gravetos e folhas
  const arms = [];
  for (const sd of [-1, 1]) {
    const a = group(sd * 0.62, 1.05, 0, torso);
    part(TRUNK, bark, 0.32, 0.5, 0.32, 0, -0.24, 0, a); part(SH.rock, barkD, 0.3, 0.2, 0.32, 0, -0.5, 0, a); part(TRUNK, bark, 0.28, 0.46, 0.28, 0, -0.74, 0, a);
    part(SH.rock, leaf, 0.42, 0.34, 0.42, 0, 0.0, -0.05, a);
    const hand = group(0, -0.95, 0.05, a);
    for (let k = 0; k < 4; k++) part(taperTube([[0, 0, 0], [(k - 1.5) * 0.06, -0.2, 0.06], [(k - 1.5) * 0.12, -0.42, 0.16]], 0.06, 0.012, 5, 5), barkD, 1, 1, 1, (k - 1.5) * 0.06, 0, 0, hand);
    for (let k = 0; k < 3; k++) part(SH.leaf, leafL, 0.14, 0.6, 0.3, sd * 0.18, -0.4 - k * 0.15, 0.1, a).rotation.set(0.3, k, sd * 0.8);
    arms.push(a);
  }
  root.scale.setScalar(def.size || 1.5);
  const elbows = arms.map((a) => splitLimb(a, -0.5)), knees = legs.map((l) => splitLimb(l, -0.52));
  return optimizeRig({ kind: 'golem', root, body, torso, head, arms, legs, elbows, knees, core, eyes, orbit: null, mats: mats.list, height: 3.2 * (def.size || 1.5), boss: false });
}

// ---------------- Monstros: homens-fera, titãs e o cérebro flutuante ----------------
// tira a cabeça padrão do humanoide (esfera, olhos, boca) para montar uma cabeça de monstro
function stripHead(rig) {
  for (const m of [...rig.head.children]) if (m.isMesh) rig.head.remove(m);
  rig.eyes = [];
}
// chifre curvo em 3 segmentos (base grossa → ponta escura). bends = [inclinação lateral, curva 2, curva 3, para frente]
function horn(parent, s, x, y, z, mat, tipMat, size = 1, bends = [1.25, 0.9, 0.55, -0.35]) {
  const g1 = group(s * x, y, z, parent); g1.rotation.z = -s * bends[0];
  part(G.cyl, mat, 0.13 * size, 0.3 * size, 0.13 * size, 0, 0.15 * size, 0, g1);
  const g2 = group(0, 0.29 * size, 0, g1); g2.rotation.z = s * bends[1]; g2.rotation.x = bends[3];
  part(G.cyl, mat, 0.1 * size, 0.26 * size, 0.1 * size, 0, 0.13 * size, 0, g2);
  const g3 = group(0, 0.25 * size, 0, g2); g3.rotation.z = s * bends[2]; g3.rotation.x = bends[3] * 0.6;
  part(G.cone, tipMat, 0.09 * size, 0.3 * size, 0.09 * size, 0, 0.15 * size, 0, g3);
}
const tone = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

// Homens-fera (Minotauro, Lobisomem, Yeti): corpo humanoide forte + cabeça de fera montada peça por peça
export function buildBeastman(def) {
  const kind = def.beast || 'touro';
  const fur = def.color, furD = tone(fur, 0.62), furL = mix(fur, 0xf2e6d0, kind === 'yeti' ? 0.1 : 0.2);
  const glow = def.glow ?? 0xff3b2f;
  const cfg = {
    touro: { pants: furD, boots: 0x231c18, leather: 0x3a2618, trim: 0x7a5a32, bulk: 1.3, hunch: 0.15 },
    lobo: { pants: tone(fur, 0.75), boots: furD, leather: 0x2e2a30, trim: furD, bulk: 1.12, hunch: 0.42 },
    yeti: { pants: fur, boots: 0x4a5a6e, leather: furD, trim: furD, bulk: 1.45, hunch: 0.32 },
    gargula: { pants: furD, boots: furD, leather: 0x3a3438, trim: furD, bulk: 1.12, hunch: 0.4 },
  }[kind];
  const rig = buildHumanoid({ mob: true, colors: { skin: fur, tunic: fur, pants: cfg.pants, trim: cfg.trim, hair: furD, boots: cfg.boots, leather: cfg.leather },
    bald: true, sleeves: false, bulk: cfg.bulk, scale: def.size || 1.3, detail: false, eyeColor: glow, hunch: cfg.hunch });
  const L = (col, extra) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...extra }); rig.mats.push(m); return m; };
  const F = L(fur), D = L(furD), FL = L(furL), bone = L(0xeee6d2), eyeM = new THREE.MeshBasicMaterial({ color: glow });
  const black = new THREE.MeshBasicMaterial({ color: 0x140c0c }), gum = new THREE.MeshBasicMaterial({ color: 0x5a1418 });
  const H = rig.head, T = rig.torso;
  stripHead(rig);
  const eye = (x, y, z, rz, w = 0.085) => { const e = part(G.box, eyeM, w, 0.05, 0.03, x, y, z, H, false); e.rotation.z = rz; rig.eyes.push(e); return e; };
  if (kind === 'touro') { // ---------- Minotauro
    const muzzle = L(mix(fur, 0xd8b890, 0.45)), hornM = L(0xe8dcc0), hornT = L(0x3a2e24), iron = L(0x5c5e66), gold = L(0xd9b25f);
    const cr = part(G.box, F, 0.48, 0.42, 0.46, 0, 0.3, 0.02, H); cr.rotation.x = -0.12;
    part(G.dodeca, D, 0.52, 0.22, 0.34, 0, 0.5, 0.02, H); // topete
    part(G.sphere, muzzle, 0.4, 0.3, 0.36, 0, 0.17, 0.31, H);
    part(G.box, F, 0.3, 0.14, 0.2, 0, 0.27, 0.27, H); // ponte do focinho
    for (const s of [-1, 1]) {
      const ns = part(G.sphereLo, black, 0.075, 0.06, 0.03, s * 0.075, 0.19, 0.48, H, false); ns.rotation.y = s * 0.3; // narinas
      eye(s * 0.17, 0.33, 0.245, s * 0.25);
      const br = part(G.box, D, 0.16, 0.06, 0.1, s * 0.16, 0.39, 0.23, H); br.rotation.z = -s * 0.32;
      const ear = part(G.cone4, F, 0.09, 0.26, 0.15, s * 0.31, 0.33, -0.03, H); ear.rotation.z = -s * 1.5;
      horn(H, s, 0.24, 0.45, 0.0, hornM, hornT, 1.15);
    }
    const ring = part(G.torus, gold, 0.17, 0.17, 0.17, 0, 0.1, 0.48, H, false); ring.rotation.y = Math.PI / 2;
    rig.jaw = group(0, 0.06, 0.2, H); part(G.box, muzzle, 0.3, 0.1, 0.28, 0, -0.03, 0.12, rig.jaw);
    // corpo: corcova de pelo, peito, correia, ombreira de ferro, tanga com caveira, cauda
    part(G.dodeca, D, 0.95, 0.5, 0.66, 0, 0.66, -0.1, T);
    for (const s of [-1, 1]) part(G.box, FL, 0.32, 0.22, 0.08, s * 0.16, 0.47, 0.25, T);
    part(G.box, FL, 0.3, 0.24, 0.06, 0, 0.22, 0.23, T);
    const strap = part(G.box, L(0x3a2618), 0.09, 0.9, 0.04, 0, 0.36, 0.29, T); strap.rotation.z = 0.72;
    part(G.dodeca, iron, 0.14, 0.14, 0.06, 0, 0.36, 0.31, T, false);
    part(G.dodeca, iron, 0.46, 0.32, 0.46, -0.5, 0.66, 0, T);
    for (let k = 0; k < 3; k++) { const sp = part(G.cone, iron, 0.08, 0.26, 0.08, -0.5 - (k - 1) * 0.12, 0.86, (k - 1) * 0.1, T); sp.rotation.z = 0.4; }
    part(G.box, L(0x7a5a32), 0.62, 0.11, 0.4, 0, 0.1, 0, rig.hips);
    part(G.box, L(0x3a2618), 0.34, 0.46, 0.04, 0, -0.18, 0.2, rig.hips); part(G.box, L(0x3a2618), 0.4, 0.42, 0.04, 0, -0.16, -0.2, rig.hips);
    part(G.sphere, bone, 0.15, 0.15, 0.1, 0, 0.1, 0.22, rig.hips, false);
    for (const s of [-1, 1]) part(G.box, black, 0.04, 0.04, 0.02, s * 0.035, 0.11, 0.27, rig.hips, false);
    for (const el of [rig.elbowL, rig.elbowR]) part(G.cyl, iron, 0.25, 0.16, 0.25, 0, -0.18, 0, el);
    for (const kn of [rig.kneeL, rig.kneeR]) part(G.dodeca, D, 0.28, 0.22, 0.3, 0, -0.27, 0, kn);
    const tl = group(0, 0.02, -0.17, rig.hips); tl.rotation.x = 0.45;
    part(G.cyl, F, 0.05, 0.6, 0.05, 0, -0.3, 0, tl); part(G.dodeca, D, 0.14, 0.22, 0.14, 0, -0.64, 0, tl);
    // machado de duas lâminas
    const w = group(0, 0, 0, rig.handR), steel = L(0x8a8e96), edge = L(0xd8dde3);
    part(G.cylZ, L(0x4a3222), 0.08, 0.08, 1.3, 0, 0, 0.35, w);
    for (const s of [-1, 1]) {
      part(G.box, steel, 0.045, 0.34, 0.32, 0, s * 0.22, 0.92, w);
      part(G.box, edge, 0.05, 0.08, 0.42, 0, s * 0.41, 0.92, w);
      for (const z of [-1, 1]) { const t = part(G.cone4, steel, 0.05, 0.16, 0.08, 0, s * 0.42, 0.92 + z * 0.24, w); t.rotation.x = z * Math.PI / 2; }
    }
    const tip = part(G.cone4, steel, 0.08, 0.28, 0.08, 0, 0, 1.2, w); tip.rotation.x = Math.PI / 2;
    w.rotation.z = Math.PI / 2; // lâminas viradas para os lados (aparecem de frente)
    rig.weaponKind = 'machado';
  } else if (kind === 'lobo') { // ---------- Lobisomem
    const cloth = L(0x3a3440), inner = L(0x8a5a5a), nose = L(0x161212);
    part(G.dodeca, F, 0.48, 0.42, 0.46, 0, 0.31, -0.02, H);
    part(G.box, FL, 0.24, 0.17, 0.36, 0, 0.27, 0.3, H);
    part(G.box, FL, 0.18, 0.13, 0.12, 0, 0.28, 0.46, H);
    part(G.box, nose, 0.12, 0.09, 0.07, 0, 0.32, 0.52, H);
    for (const s of [-1, 1]) {
      eye(s * 0.11, 0.37, 0.205, s * 0.3, 0.09);
      const br = part(G.box, D, 0.14, 0.05, 0.1, s * 0.11, 0.41, 0.2, H); br.rotation.z = -s * 0.35;
      const ear = part(G.cone4, D, 0.15, 0.38, 0.08, s * 0.17, 0.62, -0.07, H); ear.rotation.z = -s * 0.22;
      const ein = part(G.cone4, inner, 0.08, 0.24, 0.04, s * 0.17, 0.6, -0.03, H); ein.rotation.z = -s * 0.22;
      const f = part(G.cone, bone, 0.04, 0.11, 0.04, s * 0.075, 0.16, 0.43, H, false); f.rotation.x = Math.PI;
      const ruff = part(G.cone4, F, 0.14, 0.28, 0.1, s * 0.24, 0.2, 0.0, H); ruff.rotation.z = -s * 1.9;
      const ruff2 = part(G.cone4, D, 0.12, 0.24, 0.1, s * 0.2, 0.12, -0.12, H); ruff2.rotation.z = -s * 2.3;
    }
    rig.jaw = group(0, 0.19, 0.14, H);
    part(G.box, D, 0.2, 0.07, 0.32, 0, -0.04, 0.17, rig.jaw);
    part(G.box, gum, 0.15, 0.03, 0.26, 0, 0.0, 0.16, rig.jaw, false);
    for (const s of [-1, 1]) part(G.cone, bone, 0.035, 0.09, 0.035, s * 0.06, 0.02, 0.29, rig.jaw, false);
    // juba nas costas, peito claro, ombros peludos, garras, short rasgado e cauda
    for (let k = 0; k < 6; k++) { const m = part(G.cone4, k % 2 ? F : D, 0.16, 0.36, 0.12, 0, 0.72 - k * 0.11, -0.22, T); m.rotation.x = -0.95; }
    part(G.dodeca, FL, 0.44, 0.42, 0.14, 0, 0.38, 0.2, T);
    for (const s of [-1, 1]) part(G.dodeca, D, 0.36, 0.32, 0.36, s * 0.34, 0.62, 0, T);
    for (const el of [rig.elbowL, rig.elbowR]) { const t = part(G.cone4, F, 0.12, 0.26, 0.1, 0, -0.06, -0.1, el); t.rotation.x = -1.2; }
    for (const hand of [rig.handL, rig.handR]) for (let k = 0; k < 4; k++) { const c = part(G.cone, bone, 0.035, 0.26, 0.035, (k - 1.5) * 0.045, -0.16, 0.05, hand, false); c.rotation.x = Math.PI - 0.35; }
    part(G.box, cloth, 0.5, 0.26, 0.33, 0, -0.08, 0, rig.hips);
    for (const [x, z] of [[-0.15, 0.17], [0.05, 0.17], [0.16, -0.17], [-0.08, -0.17]]) { const r = part(G.cone4, cloth, 0.1, 0.2, 0.04, x, -0.3, z, rig.hips); r.rotation.x = Math.PI; }
    for (const kn of [rig.kneeL, rig.kneeR]) { for (let k = 0; k < 3; k++) { const c = part(G.cone, bone, 0.03, 0.12, 0.03, (k - 1) * 0.06, -0.42, 0.24, kn, false); c.rotation.x = Math.PI / 2; } part(G.dodeca, F, 0.24, 0.2, 0.26, 0, -0.06, 0, kn); }
    const tl = group(0, 0.02, -0.17, rig.hips); tl.rotation.x = 0.95;
    part(G.dodeca, F, 0.2, 0.52, 0.2, 0, -0.22, 0, tl); part(G.dodeca, FL, 0.15, 0.24, 0.15, 0, -0.5, 0, tl);
    rig.weaponKind = 'adaga';
  } else if (kind === 'gargula') { // ---------- Gárgula: pedra viva com asas, chifres para trás, bocarra de presas e rachaduras em brasa
    const hornM = L(tone(fur, 0.5)), lava = eyeM, mouthM = new THREE.MeshBasicMaterial({ color: 0x1a0806 }), wingM = L(tone(fur, 0.78)), crack = L(tone(fur, 0.4));
    part(G.dodeca, F, 0.5, 0.42, 0.5, 0, 0.3, -0.02, H);
    const brow = part(G.box, D, 0.5, 0.1, 0.16, 0, 0.42, 0.18, H); brow.rotation.x = -0.3;
    part(G.dodeca, FL, 0.36, 0.24, 0.3, 0, 0.22, 0.22, H);
    part(G.box, mouthM, 0.32, 0.05, 0.06, 0, 0.13, 0.34, H, false);
    for (const s of [-1, 1]) {
      eye(s * 0.12, 0.33, 0.27, s * 0.35, 0.08);
      part(G.cone, bone, 0.035, 0.11, 0.035, s * 0.12, 0.2, 0.35, H, false).rotation.x = Math.PI;
      const ear = part(G.cone4, F, 0.1, 0.34, 0.06, s * 0.27, 0.42, -0.04, H); ear.rotation.set(-0.3, 0, -s * 1.05);
      horn(H, s, 0.17, 0.44, -0.08, hornM, D, 0.95, [0.7, -0.2, -0.3, -1.0]);
    }
    rig.jaw = group(0, 0.13, 0.2, H); part(G.box, D, 0.3, 0.08, 0.2, 0, -0.03, 0.08, rig.jaw);
    for (const s of [-1, 1]) part(G.cone, bone, 0.035, 0.1, 0.035, s * 0.1, 0.03, 0.16, rig.jaw, false);
    // asas: três dedos de pedra abertos e a membrana entre eles
    for (const s of [-1, 1]) {
      const w = group(s * 0.18, 0.66, -0.24, T); w.rotation.set(0.35, s * 0.55, 0);
      part(G.dodeca, D, 0.2, 0.2, 0.2, 0, 0, 0, w);
      const ang = [1.35, 0.95, 0.55, 0.2], len = [0.95, 1.05, 0.95, 0.75];
      for (let i = 0; i < 4; i++) {
        const a = -s * ang[i], f = group(0, 0, 0, w); f.rotation.z = a;
        part(G.cyl, hornM, 0.055, len[i], 0.055, 0, len[i] / 2, 0, f);
        part(G.cone, hornM, 0.06, 0.16, 0.06, 0, len[i] + 0.06, 0, f);
        if (i < 3) { // membrana entre este dedo e o próximo
          const am = -s * (ang[i] + ang[i + 1]) / 2, lm = Math.min(len[i], len[i + 1]) * 0.92, d = (ang[i] - ang[i + 1]) * lm * 0.9;
          const m2 = part(G.box, wingM, d, lm, 0.02, -Math.sin(am) * lm * 0.5, Math.cos(am) * lm * 0.5, -0.01, w); m2.rotation.z = am;
        }
      }
    }
    // peito de pedra rachado com brasa nas frestas, cinto de pedra, cauda com ponta de lança
    part(G.dodeca, FL, 0.46, 0.4, 0.16, 0, 0.42, 0.18, T);
    for (const [x, y, r] of [[-0.08, 0.5, 0.5], [0.1, 0.38, -0.6], [0.02, 0.26, 0.2], [-0.14, 0.32, -0.3]]) part(G.box, lava, 0.025, 0.18, 0.02, x, y, 0.26, T, false).rotation.z = r;
    for (const s of [-1, 1]) part(G.dodeca, D, 0.34, 0.3, 0.34, s * 0.34, 0.62, 0, T);
    part(G.box, crack, 0.56, 0.12, 0.38, 0, 0.08, 0, rig.hips);
    let prev = rig.hips; for (let i = 0; i < 4; i++) { const t = group(0, -0.02, i ? -0.2 : -0.16, prev); t.rotation.x = 0.35; part(G.dodeca, F, 0.14 - i * 0.02, 0.14 - i * 0.02, 0.26, 0, 0, -0.1, t); prev = t; }
    part(G.cone4, D, 0.16, 0.26, 0.05, 0, 0, -0.26, prev).rotation.x = -Math.PI / 2;
    for (const hand of [rig.handL, rig.handR]) for (let k = 0; k < 3; k++) { const c = part(G.cone, bone, 0.035, 0.2, 0.035, (k - 1) * 0.05, -0.15, 0.05, hand, false); c.rotation.x = Math.PI - 0.35; }
    for (const kn of [rig.kneeL, rig.kneeR]) { part(G.cone, D, 0.06, 0.16, 0.06, 0, -0.02, 0.14, kn).rotation.x = Math.PI / 2; for (let k = 0; k < 3; k++) part(G.cone, bone, 0.03, 0.12, 0.03, (k - 1) * 0.06, -0.42, 0.22, kn, false).rotation.x = Math.PI / 2; }
    rig.weaponKind = 'adaga';
  } else { // ---------- Yeti
    const face = L(0x4a5a6e), hornM = L(0x7a7068), hornT = L(0x3a3430), ice = L(0xbfeaff, { emissive: 0x1a4a6a });
    part(G.dodeca, F, 0.64, 0.58, 0.6, 0, 0.31, -0.05, H);
    part(G.sphere, face, 0.38, 0.32, 0.14, 0, 0.25, 0.24, H);
    part(G.box, F, 0.5, 0.12, 0.16, 0, 0.39, 0.26, H);
    for (const s of [-1, 1]) {
      eye(s * 0.09, 0.31, 0.315, s * 0.2, 0.075);
      horn(H, s, 0.27, 0.46, -0.06, hornM, hornT, 0.85, [1.5, -1.1, -0.9, 0.5]);
      const f = part(G.cone, bone, 0.06, 0.16, 0.06, s * 0.08, 0.12, 0.31, H, false); f.rotation.x = Math.PI;
    }
    rig.jaw = group(0, 0.15, 0.22, H);
    part(G.box, face, 0.3, 0.08, 0.12, 0, -0.04, 0.05, rig.jaw);
    part(G.box, gum, 0.22, 0.03, 0.08, 0, 0.0, 0.05, rig.jaw, false);
    const bd = part(G.cone, F, 0.3, 0.26, 0.16, 0, -0.14, 0.02, rig.jaw); bd.rotation.x = Math.PI;
    part(G.dodeca, F, 1.15, 0.7, 0.85, 0, 0.6, -0.1, T);
    for (const [x, y, z, k] of [[-0.45, 0.62, 0, 0.5], [0.45, 0.62, 0, 0.5], [-0.25, 0.25, 0.18, 0.42], [0.25, 0.25, 0.18, 0.42], [0, -0.02, 0.2, 0.5]]) part(G.dodeca, F, k, k * 0.85, k, x, y, z, T);
    for (let k = 0; k < 4; k++) { const c = part(G.octa, ice, 0.14, 0.42 + (k % 2) * 0.16, 0.14, (k - 1.5) * 0.17, 0.88 - Math.abs(k - 1.5) * 0.08, -0.32, T); c.rotation.x = -0.55; c.rotation.z = (k - 1.5) * 0.35; }
    for (const ar of [rig.armL, rig.armR]) part(G.dodeca, F, 0.38, 0.42, 0.38, 0, -0.12, 0, ar);
    for (const el of [rig.elbowL, rig.elbowR]) part(G.dodeca, F, 0.38, 0.44, 0.38, 0, -0.14, 0, el);
    for (const kn of [rig.kneeL, rig.kneeR]) part(G.dodeca, F, 0.38, 0.36, 0.4, 0, -0.08, 0, kn);
    for (const lg of [rig.legL, rig.legR]) part(G.dodeca, F, 0.42, 0.4, 0.42, 0, -0.18, 0, lg);
    for (const hand of [rig.handL, rig.handR]) { part(G.dodeca, F, 0.4, 0.36, 0.4, 0, -0.05, 0, hand); for (let k = 0; k < 3; k++) { const c = part(G.cone, bone, 0.045, 0.16, 0.045, (k - 1) * 0.08, -0.22, 0.09, hand, false); c.rotation.x = Math.PI - 0.3; } }
    rig.weaponKind = 'clava';
  }
  beastExtras(rig, kind, { L, F, D, FL, bone, fur, glow, black });
  rig.kind = 'humanoid';
  return optimizeRig(rig);
}

// Segunda camada dos homens-fera: pelagem desgrenhada em tufos, pintura de guerra, cascos, cicatrizes e acessórios
function beastExtras(rig, kind, c) {
  if (kind === 'gargula') return; // pedra: sem pelagem
  const { L, F, D, FL, bone } = c, H = rig.head, T = rig.torso, hips = rig.hips;
  const tuft = (par, mat, x, y, z, rx, rz = 0, k = 1) => { const t = part(SH.fang, mat, 0.13 * k, 0.3 * k, 0.1 * k, x, y, z, par); t.rotation.set(rx, 0, rz); return t; };
  // pelos caindo dos braços e das pernas (todos os três)
  for (const [ar, sd] of [[rig.armL, -1], [rig.armR, 1]]) for (let k = 0; k < 3; k++) tuft(ar, k % 2 ? D : F, sd * 0.1, -0.08 - k * 0.1, -0.08, Math.PI - 0.4, sd * 0.5, 0.9);
  for (const el of [rig.elbowL, rig.elbowR]) for (let k = 0; k < 2; k++) tuft(el, F, 0, -0.12 - k * 0.1, -0.1, Math.PI - 0.5, 0, 0.8);
  if (kind === 'touro') {
    const paint = L(0xb82a1a), iron = shiny(L(0x5c5e66), 0.7), hoof = shiny(L(0x2a1e18), 0.4);
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) part(G.box, paint, 0.03, 0.14, 0.02, sd * (0.12 + k * 0.05), 0.24, 0.29, H, false).rotation.z = sd * 0.3;
    for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.6; tuft(T, i % 2 ? D : F, Math.sin(a) * 0.3, 0.78, 0.1 + Math.cos(a) * 0.12, -1.9 + Math.abs(a) * 0.2, -a * 0.7, 1.1); }
    for (let i = 0; i < 5; i++) tuft(T, FL, (i - 2) * 0.07, 0.42 - Math.abs(i - 2) * 0.03, 0.27, Math.PI - 0.3, 0, 0.6);
    for (const kn of [rig.kneeL, rig.kneeR]) { part(SH.block4, hoof, 0.22, 0.12, 0.26, 0, -0.42, 0.04, kn); part(G.box, L(0x0a0808), 0.02, 0.12, 0.2, 0, -0.42, 0.1, kn); for (let k = 0; k < 3; k++) tuft(kn, F, 0, -0.32, (k - 1) * 0.08, Math.PI, 0, 0.6); }
    for (const el of [rig.elbowL, rig.elbowR]) { for (let k = 0; k < 3; k++) part(SH.fang, iron, 0.05, 0.14, 0.05, Math.cos(k * 2.1) * 0.12, -0.18, Math.sin(k * 2.1) * 0.12, el).rotation.set(Math.sin(k * 2.1) * 1.4, 0, -Math.cos(k * 2.1) * 1.4); }
    for (let i = 0; i < 3; i++) { const sk = part(G.sphere, bone, 0.11, 0.11, 0.09, (i - 1) * 0.18, 0.06, 0.24, hips, false); void sk; for (const sd of [-1, 1]) part(G.box, L(0x140c0c), 0.025, 0.025, 0.02, (i - 1) * 0.18 + sd * 0.025, 0.07, 0.285, hips, false); }
    for (let i = 0; i < 4; i++) part(SH.ring, iron, 0.1, 0.1, 0.18, 0.1, -0.22 - i * 0.07, -0.05, rig.handL.parent).rotation.y = i % 2 ? Math.PI / 2 : 0;
    part(G.box, L(0xe8d8c8), 0.02, 0.18, 0.02, 0.18, 0.5, 0.25, T).rotation.z = 0.6; // cicatriz no peito
  } else if (kind === 'lobo') {
    const shirt = L(0x5a4a3a), scar = L(0xd8b8a8);
    for (let i = 0; i < 11; i++) { const a = (i / 10 - 0.5) * 3; tuft(T, i % 2 ? D : F, Math.sin(a) * 0.3, 0.74, 0.05 + Math.cos(a) * 0.14, -2.0 + Math.abs(a) * 0.25, -a * 0.6, 1.15); }
    for (let i = 0; i < 6; i++) tuft(H, i % 2 ? D : F, (i % 2 - 0.5) * 0.12, 0.52 - i * 0.02, -0.12 - i * 0.06, -0.6, 0, 0.9);
    for (let i = 0; i < 5; i++) { const st = part(G.box, shirt, 0.14, 0.34 - (i % 2) * 0.1, 0.03, (i - 2) * 0.12, 0.14, 0.22 - Math.abs(i - 2) * 0.02, T); st.rotation.z = (i - 2) * 0.12; }
    part(G.box, scar, 0.02, 0.2, 0.02, 0.12, 0.38, 0.25, H, false).rotation.z = 0.4;
    for (let i = 0; i < 4; i++) tuft(hips, F, (i - 1.5) * 0.04, -0.2 - i * 0.06, -0.3 - i * 0.12, -0.4, 0, 1.2 - i * 0.15);
  } else { // yeti: pelagem desgrenhada por cima dos montinhos, presas e pingentes de gelo nos braços
    const ice = L(0xbfeaff, { emissive: 0x1a4a6a });
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r * 0.35; const t = tuft(T, (i + r) % 3 ? F : FL, Math.sin(a) * 0.5, 0.82 - r * 0.24, Math.cos(a) * 0.38 - 0.05, Math.PI - 0.08 + Math.cos(a) * 0.12, -Math.sin(a) * 0.15, 0.8); t.scale.z *= 0.6; }
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; tuft(H, F, Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.2 - 0.05, -0.4, -a * 0.5, 1.1); }
    for (const sd of [-1, 1]) part(taperTube([[0, 0, 0], [sd * 0.02, 0.08, 0.02], [sd * 0.05, 0.16, 0]], 0.04, 0.008, 5, 4), bone, 1, 1, 1, sd * 0.1, 0.04, 0.06, rig.jaw);
    for (const el of [rig.elbowL, rig.elbowR]) for (let k = 0; k < 3; k++) part(G.cone, ice, 0.05, 0.18 + k * 0.05, 0.05, (k - 1) * 0.1, -0.36, -0.08, el).rotation.x = Math.PI;
    for (const kn of [rig.kneeL, rig.kneeR]) for (let k = 0; k < 4; k++) tuft(kn, F, (k - 1.5) * 0.09, -0.3, 0.1, Math.PI - 0.15, 0, 1);
  }
}

// Titãs: gigantes de 5 m feitos de rocha (gelo / magma / armadura da Fenda), cabeça baixa entre os ombros,
// punhos enormes, rachaduras brilhando e uma arma do tamanho de uma árvore
export function buildTitan(def) {
  const c = def.color, d = tone(c, 0.62), lt = mix(c, 0xffffff, 0.14), glow = def.glow ?? 0xff6a2a;
  const v = def.titan || 'magma';
  const rig = buildHumanoid({ mob: true, colors: { skin: c, tunic: c, pants: d, trim: d, hair: d, boots: d, leather: d },
    bald: true, bulk: 1.45, scale: def.size || 2.6, detail: false, eyeColor: glow, cape: v === 'fenda' ? (def.cape ?? 0x2a1a4a) : null, hunch: 0.22 });
  const L = (col, extra) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...extra }); rig.mats.push(m); return m; };
  const S = L(c), Dm = L(d), Lt = L(lt), gl = new THREE.MeshBasicMaterial({ color: glow });
  const metal = L(v === 'fenda' ? 0x2a2838 : 0x4a4a52), boneM = L(0xe0d6c0);
  const T = rig.torso, H = rig.head;
  if (rig.chest) { rig.chest.parent.remove(rig.chest); rig.chest = null; }
  stripHead(rig);
  // tronco de rocha: peito enorme, barriga menor, placas e o núcleo brilhando entre elas
  part(G.dodeca, S, 1.0, 0.78, 0.62, 0, 0.46, -0.02, T);
  part(G.dodeca, Dm, 0.62, 0.42, 0.46, 0, 0.13, 0.02, T);
  for (const sx of [-1, 1]) { const pl = part(G.box, Lt, 0.36, 0.3, 0.1, sx * 0.21, 0.52, 0.27, T); pl.rotation.set(-0.12, sx * 0.25, sx * 0.08); }
  part(G.octa, gl, 0.2, 0.26, 0.14, 0, 0.5, 0.3, T, false);
  for (const [x, y, rz, h] of [[-0.12, 0.3, 0.45, 0.26], [0.13, 0.26, -0.6, 0.22], [0.3, 0.6, 0.2, 0.16], [-0.32, 0.56, -0.3, 0.18], [0.02, 0.12, 0.1, 0.18]]) { const k = part(G.box, gl, 0.035, h, 0.03, x, y, 0.3, T, false); k.rotation.z = rz; }
  // ombros de pedrona com pontas
  for (const sx of [-1, 1]) {
    part(G.dodeca, Dm, 0.58, 0.48, 0.58, sx * 0.62, 0.74, 0, T);
    part(G.dodeca, S, 0.36, 0.32, 0.36, sx * 0.7, 0.94, 0.06, T);
    for (let k = 0; k < 2; k++) { const sp = part(G.cone4, Dm, 0.14, 0.42, 0.14, sx * (0.56 + k * 0.2), 1.02, -0.06 + k * 0.1, T); sp.rotation.z = -sx * (0.3 + k * 0.35); }
  }
  // cabeça baixa, testa pesada, mandíbula para frente e olhos fundos
  part(G.dodeca, S, 0.52, 0.48, 0.52, 0, 0.24, 0.06, H);
  const brow = part(G.box, Dm, 0.52, 0.11, 0.18, 0, 0.36, 0.24, H); brow.rotation.x = 0.25;
  for (const sx of [-1, 1]) { const e = part(G.box, gl, 0.11, 0.05, 0.03, sx * 0.11, 0.29, 0.31, H, false); e.rotation.z = sx * 0.22; rig.eyes.push(e); }
  rig.jaw = group(0, 0.13, 0.12, H);
  part(G.box, Dm, 0.44, 0.17, 0.36, 0, -0.06, 0.1, rig.jaw);
  part(G.box, gl, 0.3, 0.03, 0.04, 0, 0.0, 0.27, rig.jaw, false);
  // braços: pedra nos bíceps, manoplas, punhos gigantes e correntes quebradas
  for (const ar of [rig.armL, rig.armR]) part(G.dodeca, Dm, 0.4, 0.44, 0.4, 0, -0.14, 0, ar);
  for (const el of [rig.elbowL, rig.elbowR]) {
    part(G.dodeca, S, 0.44, 0.5, 0.44, 0, -0.15, 0, el);
    const ch = part(G.torus, metal, 0.32, 0.32, 0.5, 0, -0.28, 0, el); ch.rotation.x = Math.PI / 2;
    const l1 = part(G.torus, metal, 0.12, 0.12, 0.3, 0.12, -0.38, 0, el); l1.rotation.y = Math.PI / 2;
    const l2 = part(G.torus, metal, 0.12, 0.12, 0.3, 0.12, -0.5, 0, el); void l2;
  }
  for (const hd of [rig.handL, rig.handR]) part(G.dodeca, S, 0.38, 0.34, 0.38, 0, -0.04, 0, hd);
  // pernas, joelheiras e pés largos
  for (const lg of [rig.legL, rig.legR]) part(G.dodeca, Dm, 0.44, 0.5, 0.44, 0, -0.2, 0, lg);
  for (const kn of [rig.kneeL, rig.kneeR]) { part(G.dodeca, S, 0.34, 0.3, 0.3, 0, 0.0, 0.08, kn); part(G.box, Dm, 0.32, 0.18, 0.44, 0, -0.39, 0.07, kn); }
  // cinto com fivela de caveira e saiote de placas
  part(G.box, metal, 0.72, 0.14, 0.48, 0, 0.08, 0, rig.hips);
  part(G.sphere, boneM, 0.17, 0.17, 0.12, 0, 0.08, 0.25, rig.hips, false);
  for (const sx of [-1, 1]) part(G.box, gl, 0.04, 0.04, 0.02, sx * 0.04, 0.09, 0.31, rig.hips, false);
  for (const x of [-0.22, 0, 0.22]) { const pl = part(G.box, Dm, 0.19, 0.36, 0.05, x, -0.2, 0.22, rig.hips); pl.rotation.x = 0.12; }
  for (const x of [-0.2, 0.2]) { const pl = part(G.box, Dm, 0.22, 0.34, 0.05, x, -0.19, -0.22, rig.hips); pl.rotation.x = -0.12; }
  // detalhes de cada titã
  if (v === 'gelo') {
    const ice = L(0xd8f4ff, { emissive: 0x2a5a7a });
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const ic = part(G.cone, ice, 0.09, 0.34 - k * 0.06, 0.09, sx * (0.48 + k * 0.14), 0.42, 0.12 - k * 0.12, T); ic.rotation.x = Math.PI; }
    for (const el of [rig.elbowL, rig.elbowR]) for (let k = 0; k < 2; k++) { const ic = part(G.cone, ice, 0.07, 0.26, 0.07, (k - 0.5) * 0.14, -0.3, -0.12, el); ic.rotation.x = Math.PI; }
    for (let k = 0; k < 5; k++) { const cr = part(G.octa, ice, 0.12, 0.34 + (k === 2 ? 0.2 : 0), 0.12, (k - 2) * 0.12, 0.56, -0.02, H); cr.rotation.z = (k - 2) * -0.28; }
    for (let k = 0; k < 3; k++) { const ic = part(G.cone, ice, 0.06, 0.2, 0.06, (k - 1) * 0.12, -0.2, 0.18, rig.jaw); ic.rotation.x = Math.PI; }
    part(G.dodeca, L(0xf2f6fa), 0.6, 0.26, 0.5, 0, -0.06, 0, rig.hips); // pelo branco na cintura
  } else if (v === 'magma') {
    const lava = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    for (const sx of [-1, 1]) {
      const tk = part(G.cone, boneM, 0.07, 0.22, 0.07, sx * 0.16, 0.06, 0.26, rig.jaw); tk.rotation.x = -0.3;
      const hr = part(G.cone4, Dm, 0.12, 0.34, 0.12, sx * 0.22, 0.48, 0.0, H); hr.rotation.z = -sx * 0.5;
      for (let k = 0; k < 2; k++) { const dp = part(G.cone, lava, 0.06, 0.2, 0.06, sx * (0.5 + k * 0.2), 0.46, 0.2 - k * 0.2, T, false); dp.rotation.x = Math.PI; }
    }
    for (const el of [rig.elbowL, rig.elbowR]) { const k = part(G.box, gl, 0.03, 0.3, 0.03, 0.1, -0.15, 0.2, el, false); k.rotation.z = 0.3; }
    for (const lg of [rig.legL, rig.legR]) { const k = part(G.box, gl, 0.03, 0.32, 0.03, 0.05, -0.2, 0.21, lg, false); k.rotation.z = -0.25; }
  } else { // fenda: armadura escura, elmo com chifres e um halo de runas atrás da cabeça
    const helm = part(G.dodeca, metal, 0.6, 0.46, 0.58, 0, 0.32, 0.04, H); void helm;
    part(G.box, metal, 0.12, 0.3, 0.1, 0, 0.36, 0.3, H); // nasal
    for (const sx of [-1, 1]) { const vz = part(G.box, gl, 0.15, 0.045, 0.03, sx * 0.13, 0.3, 0.32, H, false); vz.rotation.z = sx * 0.2; }
    for (const sx of [-1, 1]) horn(H, sx, 0.26, 0.42, -0.02, metal, gl, 1.0, [1.3, 1.1, 0.6, -0.15]);
    for (const sx of [-1, 1]) { const pl = part(G.box, metal, 0.6, 0.12, 0.6, sx * 0.62, 0.98, 0, T); pl.rotation.z = -sx * 0.35; }
    const halo = group(0, 1.15, -0.42, T);
    const ring = part(G.torus, gl, 1.1, 1.1, 0.6, 0, 0, 0, halo, false); void ring;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const r = part(G.octa, gl, 0.1, 0.18, 0.06, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, halo, false); r.rotation.z = a; }
    rig.halo = halo;
  }
  // arma do titã: espadona de pedra com fio brilhante (com runas) ou clava de gelo
  const w = group(0, 0, 0, rig.handR);
  const blade = L(v === 'fenda' ? 0x3a3650 : mix(d, 0x6a6a74, 0.5)), grip = L(0x2a1e18);
  if (def.weapon === 'clava') {
    part(G.cylZ, grip, 0.12, 0.12, 0.95, 0, 0, 0.32, w);
    part(G.dodeca, S, 0.55, 0.5, 0.75, 0, 0, 0.95, w);
    for (let k = 0; k < 6; k++) { const a = k * 1.05; const sp = part(G.octa, gl, 0.12, 0.36, 0.12, Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.9 + (k % 2) * 0.18, w, false); sp.rotation.z = -a + Math.PI / 2; }
  } else {
    part(G.cylZ, grip, 0.1, 0.1, 0.42, 0, 0, -0.04, w);
    part(G.box, Dm, 0.66, 0.13, 0.14, 0, 0, 0.2, w);
    for (const sx of [-1, 1]) { const q = part(G.cone4, Dm, 0.1, 0.22, 0.1, sx * 0.38, 0, 0.24, w); q.rotation.z = -sx * Math.PI / 2; }
    part(G.box, blade, 0.28, 0.065, 1.75, 0, 0, 1.14, w);
    part(G.box, gl, 0.05, 0.08, 1.5, 0, 0, 1.05, w, false);
    for (let k = 0; k < 4; k++) part(G.box, gl, 0.12, 0.085, 0.04, 0, 0, 0.5 + k * 0.38, w, false);
    const tp = part(G.cone4, blade, 0.28, 0.32, 0.065, 0, 0, 2.17, w); tp.rotation.x = Math.PI / 2;
    part(G.octa, gl, 0.15, 0.15, 0.15, 0, 0, -0.3, w, false);
  }
  titanExtras(rig, v, { L, S, Dm, Lt, gl, glow, metal });
  rig.kind = 'humanoid'; rig.weaponKind = def.weapon === 'clava' ? 'clava' : 'montante';
  return optimizeRig(rig);
}
// segunda camada dos titãs: veios brilhando pelo corpo, pedras soltas nos ombros e marcas de cada elemento
function titanExtras(rig, v, c) {
  const { L, S, Dm, Lt, gl } = c, T = rig.torso, H = rig.head;
  const vein = (par, x, y, z, len, rz) => { const b = part(G.box, gl, 0.025, len, 0.02, x, y, z, par, false); b.rotation.z = rz; return b; };
  for (let i = 0; i < 9; i++) vein(T, Math.sin(i * 2.3) * 0.36, 0.2 + (i % 4) * 0.16, 0.33 + Math.cos(i * 1.7) * 0.02, 0.16 + (i % 3) * 0.06, Math.sin(i * 1.3) * 1.1);
  for (const ar of [rig.armL, rig.armR]) { vein(ar, 0.08, -0.15, 0.13, 0.22, 0.4); part(SH.rock, S, 0.28, 0.2, 0.3, 0, -0.06, -0.08, ar); }
  for (const el of [rig.elbowL, rig.elbowR]) { vein(el, -0.06, -0.12, 0.12, 0.18, -0.5); part(SH.rock, Dm, 0.24, 0.18, 0.26, 0, -0.04, -0.06, el); }
  for (const lg of [rig.legL, rig.legR]) { vein(lg, 0.07, -0.2, 0.14, 0.2, 0.3); part(SH.rock, Lt, 0.26, 0.2, 0.26, 0, -0.1, 0.06, lg); }
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) part(SH.rock, k % 2 ? Dm : S, 0.14 - k * 0.02, 0.12, 0.14, sd * (0.42 + k * 0.06), 0.82 + k * 0.08, -0.12 + k * 0.08, T);
  if (v === 'gelo') {
    const ice = L(0xbfe8ff, { emissive: new THREE.Color(0x9fd8ff).multiplyScalar(0.3) }), snow = L(0xf4faff);
    for (let i = 0; i < 6; i++) part(G.cone, ice, 0.05, 0.16 + (i % 3) * 0.08, 0.05, (i - 2.5) * 0.06, -0.02, 0.25, H).rotation.x = Math.PI;
    for (const sd of [-1, 1]) part(SH.rock, snow, 0.4, 0.12, 0.36, sd * 0.42, 0.78, 0, T);
    for (let i = 0; i < 5; i++) { const g = part(SH.gem, ice, 0.1, 0.3 + (i % 2) * 0.12, 0.1, (i - 2) * 0.14, 0.62, -0.3, T); g.rotation.x = -0.5; }
  } else if (v === 'magma') {
    const vent = L(0x1a120e), lava = GLOW(0xffb040);
    for (let i = 0; i < 4; i++) { const sd = i % 2 ? 1 : -1; part(G.cyl, vent, 0.12, 0.2, 0.12, sd * (0.2 + (i >> 1) * 0.12), 0.8, -0.24, T); part(G.cyl, lava, 0.08, 0.04, 0.08, sd * (0.2 + (i >> 1) * 0.12), 0.9, -0.24, T, false); }
    for (let i = 0; i < 5; i++) part(SH.drop, lava, 0.06, -0.14 - (i % 2) * 0.08, 0.06, (i - 2) * 0.12, 0.05, 0.3, T, false);
  } else {
    const cr = GLOW(0xc8a0ff);
    for (let i = 0; i < 5; i++) { const g = part(SH.gem, cr, 0.1, 0.36 + (i % 3) * 0.1, 0.1, (i - 2) * 0.14, 0.66 - Math.abs(i - 2) * 0.05, -0.3, T, false); g.rotation.set(-0.5, 0, (i - 2) * 0.25); }
    for (let i = 0; i < 6; i++) part(SH.ring, shiny(L(0x3a3848), 0.6), 0.12, 0.12, 0.22, 0.32 - i * 0.12, 0.6 - i * 0.07, 0.3, T).rotation.y = i % 2 ? Math.PI / 2 : 0;
  }
}

// Cérebro flutuante: dois hemisférios cheios de dobras, um olho enorme, tronco cerebral pendurado e tentáculos
// que ondulam (usa o esqueleto da gosma com float:true; o Abissal tem cristais em órbita)
export function buildBrain(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const float = group(0, 1.3, 0, body);
  const col = new THREE.Color(def.color), glow = def.glow ?? 0xc8a0ff, rot = def.variant === 'podre';
  const pink = mats.lam(def.color, { emissive: col.clone().multiplyScalar(0.12) });
  const fold = mats.lam(col.clone().lerp(new THREE.Color(0xffffff), 0.14).getHex(), { emissive: col.clone().multiplyScalar(0.1) });
  const fold2 = mats.lam(col.clone().multiplyScalar(0.78).getHex());
  const dark = mats.lam(col.clone().multiplyScalar(0.55).getHex());
  const gl = new THREE.MeshBasicMaterial({ color: glow });
  // hemisférios
  const blob = part(G.sphere, pink, 0.64, 0.8, 1.3, -0.31, 0.1, 0, float);
  part(G.sphere, pink, 0.64, 0.8, 1.3, 0.31, 0.1, 0, float);
  // dobras (giros): cápsulas deitadas sobre a superfície, com posições fixas (mesma forma em todos os clientes)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), t = new THREE.Vector3(), r = new THREE.Vector3();
  for (const sx of [-1, 1]) for (let k = 0; k < 20; k++) {
    const th = rnd() * Math.PI * 2, ph = 0.2 + rnd() * 1.45;
    const ex = Math.sin(ph) * Math.cos(th), ey = Math.cos(ph), ez = Math.sin(ph) * Math.sin(th);
    if (ex * sx < -0.55) continue; // não põe dobra dentro da fenda do meio
    const m = part(G.capsule, k % 2 ? fold : fold2, 0.13, 0.17 + rnd() * 0.1, 0.13, sx * 0.31 + ex * 0.3, 0.1 + ey * 0.38, ez * 0.63, float);
    n.set(ex / 0.32, ey / 0.4, ez / 0.65).normalize();
    r.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5); t.crossVectors(n, r).normalize();
    m.quaternion.setFromUnitVectors(up, t);
  }
  // olho enorme na frente
  const eyes = [];
  const e = group(0, -0.02, 0.6, float);
  part(G.dodeca, dark, 0.56, 0.5, 0.26, 0, 0, -0.04, e); // pálpebra
  part(G.sphere, mats.lam(0xf4efe6), 0.44, 0.42, 0.26, 0, 0, 0.02, e, false);
  part(G.sphereLo, gl, 0.24, 0.24, 0.08, 0, 0, 0.13, e, false);
  part(G.box, new THREE.MeshBasicMaterial({ color: 0x110818 }), 0.05, 0.17, 0.04, 0, 0, 0.17, e, false);
  eyes.push(e);
  if (rot) for (const [x, y, k] of [[-0.42, 0.32, 0.5], [0.4, 0.4, 0.42], [0.46, -0.1, 0.36]]) { // olhinhos extras
    const e2 = group(x, y, 0.5, float); e2.rotation.y = x * 0.9;
    part(G.sphere, mats.lam(0xe8e0c8), 0.3 * k, 0.3 * k, 0.16 * k, 0, 0, 0, e2, false);
    part(G.sphereLo, gl, 0.16 * k, 0.16 * k, 0.06 * k, 0, 0, 0.07 * k, e2, false); eyes.push(e2);
  }
  // tronco cerebral e vértebras penduradas
  const stem = group(0, -0.4, -0.3, float); stem.rotation.x = 0.35;
  part(G.cyl, dark, 0.22, 0.4, 0.22, 0, -0.2, 0, stem);
  const vert = mats.lam(0xd8ccb8);
  for (let k = 0; k < 4; k++) part(G.dodeca, vert, 0.16 - k * 0.025, 0.1, 0.16 - k * 0.025, 0, -0.44 - k * 0.13, -k * 0.04, stem);
  // tentáculos de 3 segmentos com ponta brilhante
  const tents = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3, g1 = group(Math.cos(a) * 0.42, -0.42, Math.sin(a) * 0.5, float);
    g1.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    const segs = [g1]; let g = g1;
    for (let j = 0; j < 3; j++) {
      const len = 0.34 - j * 0.05, w = 0.13 - j * 0.03;
      part(G.capsule, j ? fold2 : dark, w, len * 0.5, w, 0, -len / 2, 0, g);
      if (j < 2) { g = group(0, -len * 0.92, 0, g); segs.push(g); }
      else part(G.sphereLo, gl, 0.07, 0.07, 0.07, 0, -len, 0, g, false);
    }
    tents.push(segs);
  }
  if (rot) for (let k = 0; k < 5; k++) { const dp = part(G.cone, gl, 0.06, 0.24, 0.06, (k - 2) * 0.22, -0.34, 0.25 - (k % 2) * 0.4, float, false); dp.rotation.x = Math.PI; } // gotas de gosma
  const core = part(G.sphereLo, gl, 0.26, 0.26, 0.26, 0, -0.36, 0.1, float, false);
  // aura
  const aura = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.scale.set(1.9, 1.6, 2.0); aura.position.set(0, 0.05, 0); aura.userData.noMerge = true; float.add(aura);
  let orbit = null;
  if (!rot) {
    orbit = group(0, 0.15, 0, float);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const sh = part(G.octa, gl, 0.14, 0.3, 0.14, Math.cos(a) * 1.15, Math.sin(a * 2) * 0.2, Math.sin(a) * 1.15, orbit, false); sh.rotation.z = 0.4; }
  }
  // veias acesas correndo pelos hemisférios e gosma pingando
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const a = -0.9 + k * 0.6; part(taperTube([[0, 0, 0], [sx * 0.06, 0.18, 0.1], [sx * 0.04, 0.34, 0.0], [sx * 0.1, 0.46, -0.16]], 0.022, 0.008, 4, 8), gl, 1, 1, 1, sx * (0.36 + Math.abs(a) * 0.1), -0.1 + k * 0.06, a * 0.5, float, false); }
  for (let k = 0; k < 6; k++) part(SH.drop, rot ? gl : fold2, 0.07, -0.16 - (k % 3) * 0.08, 0.07, Math.cos(k * 1.1) * 0.5, -0.36, Math.sin(k * 1.1) * 0.55, float, false);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; part(SH.fang, mats.lam(0xe8e0c8), 0.05, 0.12, 0.05, Math.cos(a) * 0.2, -0.46, Math.sin(a) * 0.2 + 0.1, float).rotation.x = Math.PI; }
  const top = group(0, 0.6, 0, float);
  const puddle = part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }), 1.1, 0.05, 1.1, 0, 0.03, 0, body, false);
  root.scale.setScalar(def.size || 1);
  return optimizeRig({ kind: 'slime', float: true, root, body, blob, core, top, puddle, eyes, tents, stem, orbit, mouth: null, mats: mats.list, height: 2.5 * (def.size || 1), blinkT: 2 });
}

// Medusa (Picos do Fim do Mundo): água-viva do vazio — sino transparente com estrelas dentro, borda de franjas,
// três olhos acesos e tentáculos longos com pontas brilhando. Flutua como o cérebro (mesmo esqueleto de animação).
export function buildMedusa(def) {
  const mats = new Mats();
  const root = new THREE.Group();
  const body = group(0, 0, 0, root);
  const float = group(0, 1.55, 0, body);
  const col = new THREE.Color(def.color), glow = def.glow ?? 0x5ef0ff;
  const bellM = new THREE.MeshPhongMaterial({ color: def.color, flatShading: true, transparent: true, opacity: 0.7, emissive: col.clone().multiplyScalar(0.28), specular: 0x6a6a9a, shininess: 90 }); mats.list.push(bellM);
  const inner = mats.lam(col.clone().lerp(new THREE.Color(0xffffff), 0.3).getHex(), { emissive: col.clone().multiplyScalar(0.3) });
  const rimM = mats.lam(col.clone().multiplyScalar(0.6).getHex()), armM = mats.lam(col.clone().lerp(new THREE.Color(glow), 0.35).getHex());
  const gl = new THREE.MeshBasicMaterial({ color: glow }), star = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blob = part(SH_DOME, bellM, 1.55, 1.2, 1.55, 0, 0, 0, float);
  part(SH_DOME, inner, 0.92, 0.66, 0.92, 0, 0.02, 0, float);
  part(G.torus, rimM, 1.56, 1.56, 0.7, 0, 0.0, 0, float).rotation.x = Math.PI / 2;
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; const f = part(SH.fang, rimM, 0.08, 0.18, 0.06, Math.cos(a) * 0.76, -0.08, Math.sin(a) * 0.76, float); f.rotation.x = Math.PI; }
  const core = part(G.octa, gl, 0.28, 0.4, 0.28, 0, 0.26, 0, float, false);
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 9; k++) { const a = rnd() * Math.PI * 2, r = 0.15 + rnd() * 0.42; part(G.octa, k % 3 ? star : gl, 0.05, 0.08, 0.05, Math.cos(a) * r, 0.12 + rnd() * 0.36, Math.sin(a) * r, float, false); }
  const eyes = [];
  for (const sd of [-1, 0, 1]) {
    const e = group(sd * 0.26, 0.16 + (sd ? 0 : 0.08), 0.64 - Math.abs(sd) * 0.08, float); e.rotation.y = sd * 0.4;
    part(G.sphere, gl, 0.14, 0.14, 0.07, 0, 0, 0, e, false);
    part(G.box, new THREE.MeshBasicMaterial({ color: 0x0a0618 }), 0.035, 0.1, 0.02, 0, 0, 0.035, e, false);
    eyes.push(e);
  }
  const tents = [];
  for (let k = 0; k < 11; k++) {
    const oral = k < 4, a = (k / (oral ? 4 : 7)) * Math.PI * 2 + (oral ? 0.4 : 0), r = oral ? 0.18 : 0.6;
    const g1 = group(Math.cos(a) * r, -0.06, Math.sin(a) * r, float); g1.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
    const segs = [g1]; let g = g1;
    for (let j = 0; j < 4; j++) {
      const len = (oral ? 0.3 : 0.36) - j * 0.02, w = (oral ? 0.16 : 0.07) - j * (oral ? 0.025 : 0.012);
      part(G.capsule, oral ? (j % 2 ? armM : inner) : (j % 2 ? rimM : armM), w, len * 0.5, w, 0, -len / 2, 0, g);
      if (oral) part(SH.leaf, armM, 0.12, 1, 0.3, 0, -len / 2, 0.04, g).rotation.set(1.3, j, 0);
      if (j < 3) { g = group(0, -len * 0.92, 0, g); segs.push(g); } else part(G.sphereLo, gl, 0.07, 0.07, 0.07, 0, -len, 0, g, false);
    }
    tents.push(segs);
  }
  const aura = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.scale.set(2.0, 1.5, 2.0); aura.position.set(0, 0.2, 0); aura.userData.noMerge = true; float.add(aura);
  const orbit = group(0, 0.15, 0, float);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; part(G.octa, gl, 0.08, 0.16, 0.08, Math.cos(a) * 1.05, Math.sin(a * 2) * 0.15, Math.sin(a) * 1.05, orbit, false); }
  const top = group(0, 0.6, 0, float);
  const puddle = part(G.sphereLo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }), 1.1, 0.05, 1.1, 0, 0.03, 0, body, false);
  root.scale.setScalar(def.size || 1);
  return optimizeRig({ kind: 'slime', float: true, root, body, blob, core, top, puddle, eyes, tents, stem: null, orbit, mouth: null, mats: mats.list, height: 2.3 * (def.size || 1), blinkT: 2 });
}

// Cogumelo (Floresta Esmeralda): cogumelo andante — chapéu enorme com pintas e lamelas, rosto no pé, saia de cogumelo,
// cogumelinhos nos ombros, mãos de raiz e uma bola de esporos acesa na mão
export function buildFungo(def) {
  const capC = def.color, stalk = def.skin ?? 0xf0e6d0, glow = def.glow ?? 0x9aff6a;
  const rig = buildHumanoid({ mob: true, colors: { skin: stalk, tunic: stalk, pants: tone(stalk, 0.86), trim: tone(capC, 0.8), hair: stalk, boots: tone(stalk, 0.72), leather: 0x6a5a3a },
    bald: true, sleeves: false, bulk: 1.05, scale: def.size || 1.1, detail: false, eyeColor: glow, hunch: 0.1 });
  const L = (col) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true }); rig.mats.push(m); return m; };
  const cap = L(capC), capD = L(tone(capC, 0.68)), spot = L(0xfff6e8), gill = L(mix(stalk, 0xc89a70, 0.45)), stk = L(stalk), stkD = L(tone(stalk, 0.8)), moss = L(0x5a8a3a);
  const gl = new THREE.MeshBasicMaterial({ color: glow });
  const H = rig.head, T = rig.torso;
  stripHead(rig);
  part(G.cyl, stk, 0.42, 0.44, 0.38, 0, 0.18, 0, H);
  for (const s of [-1, 1]) { const e = part(G.box, gl, 0.09, 0.07, 0.03, s * 0.09, 0.22, 0.19, H, false); e.rotation.z = s * 0.3; rig.eyes.push(e); }
  part(G.box, L(0x3a2a1a), 0.12, 0.03, 0.02, 0, 0.1, 0.19, H, false);
  part(SH_DOME, cap, 1.3, 0.84, 1.3, 0, 0.36, 0, H);
  part(G.cyl, gill, 1.24, 0.04, 1.24, 0, 0.365, 0, H);
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; const ln = part(G.box, capD, 0.018, 0.025, 0.38, Math.cos(a) * 0.4, 0.345, Math.sin(a) * 0.4, H, false); ln.rotation.y = -a + Math.PI / 2; }
  for (const [x, z, k] of [[0, 0, 1.2], [0.36, 0.1, 0.9], [-0.3, 0.26, 0.8], [-0.18, -0.36, 1], [0.26, -0.3, 0.8], [0.05, 0.44, 0.7], [-0.44, -0.04, 0.7]]) {
    const r2 = (x * x + z * z) / (0.65 * 0.65), y = 0.36 + 0.42 * Math.sqrt(Math.max(0, 1 - r2));
    const sp = part(G.sphereLo, spot, 0.16 * k, 0.05, 0.14 * k, x, y, z, H, false); sp.rotation.set(z * 1.4, 0, -x * 1.4);
  }
  part(new THREE.CylinderGeometry(0.34, 0.46, 0.16, 12, 1, true), stkD, 1, 1, 1, 0, 0.62, 0, T).material.side = THREE.DoubleSide;
  for (const [x, y, z, k] of [[-0.28, 0.66, 0.02, 1], [0.3, 0.6, -0.06, 0.8], [0.12, 0.3, -0.24, 0.75], [-0.1, 0.12, 0.22, 0.6]]) { part(G.cyl, stk, 0.06 * k, 0.16 * k, 0.06 * k, x, y, z, T); part(SH_DOME, cap, 0.24 * k, 0.16 * k, 0.24 * k, x, y + 0.07 * k, z, T); }
  for (const [x, y] of [[-0.2, 0.4], [0.16, 0.1], [0.24, 0.48]]) part(SH.rock, moss, 0.18, 0.08, 0.12, x, y, 0.22, T);
  for (const h of [rig.handL, rig.handR]) for (let k = 0; k < 3; k++) part(taperTube([[0, 0, 0], [(k - 1) * 0.04, -0.1, 0.04], [(k - 1) * 0.07, -0.2, 0.06]], 0.03, 0.008, 4, 4), stkD, 1, 1, 1, 0, -0.04, 0, h);
  part(G.sphere, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.85 }), 0.2, 0.2, 0.2, 0, -0.1, 0.12, rig.handR, false);
  for (let k = 0; k < 4; k++) part(G.sphereLo, gl, 0.05, 0.05, 0.05, Math.cos(k * 1.6) * 0.16, -0.06 + (k % 2) * 0.1, 0.12 + Math.sin(k * 1.6) * 0.16, rig.handR, false);
  rig.kind = 'humanoid'; rig.weaponKind = 'cajado';
  return optimizeRig(rig);
}

// O Vigia (chefe da Cripta): carcereiro espectral alto e curvado, capuz com rosto de caveira na sombra,
// coroa de ferro com pontas, correntes cruzando o peito, lanterna de almas na mão esquerda e alabarda na direita.
export function buildWarden(def) {
  const glow = def.glow ?? 0x7af0ff, robe = def.color ?? 0x2c2a3a;
  const rig = buildHumanoid({ mob: true, robe: true, colors: { skin: 0xd8d0bd, tunic: robe, pants: tone(robe, 0.7), trim: 0x6a6474, hair: 0x111111, boots: 0x1a1a22, leather: 0x2a2228 },
    bald: true, shoulders: true, bulk: 1.1, cape: tone(robe, 0.55), scale: def.size || 1.7, detail: false, eyeColor: glow, hunch: 0.14 });
  const L = (col, extra) => { const m = new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...extra }); rig.mats.push(m); return m; };
  const iron = L(0x3a3846), ironL = L(0x5c5868), boneM = L(0xd8d0bd), hood = L(tone(robe, 0.85)), gl = new THREE.MeshBasicMaterial({ color: glow });
  const T = rig.torso, H = rig.head;
  // capuz e rosto de caveira na sombra, olhos acesos
  part(G.sphere, hood, 0.7, 0.66, 0.68, 0, 0.3, -0.05, H);
  const tip = part(G.cone, hood, 0.36, 0.5, 0.36, 0, 0.44, -0.32, H); tip.rotation.x = -2.0;
  part(G.box, new THREE.MeshBasicMaterial({ color: 0x07070c }), 0.44, 0.36, 0.05, 0, 0.24, 0.29, H, false);
  for (let k = 0; k < 4; k++) part(G.box, boneM, 0.05, 0.07, 0.03, -0.09 + k * 0.06, 0.13, 0.31, H, false); // dentes da caveira
  for (const sx of [-1, 1]) { const e = part(G.box, gl, 0.09, 0.06, 0.03, sx * 0.09, 0.27, 0.32, H, false); rig.eyes.push(e); }
  // coroa de ferro com pontas por cima do capuz
  const cr = part(G.torus, iron, 0.62, 0.62, 0.5, 0, 0.58, -0.04, H); cr.rotation.x = Math.PI / 2;
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const sp = part(G.cone4, ironL, 0.08, 0.3, 0.08, Math.cos(a) * 0.3, 0.74, -0.04 + Math.sin(a) * 0.3, H); sp.rotation.z = -Math.cos(a) * 0.25; }
  // ombreiras pesadas com correntes penduradas
  for (const sx of [-1, 1]) {
    part(G.dodeca, iron, 0.46, 0.32, 0.46, sx * 0.44, 0.8, 0, T);
    for (let k = 0; k < 3; k++) { const ln = part(G.torus, ironL, 0.1, 0.1, 0.3, sx * 0.5, 0.6 - k * 0.12, 0.12, T); ln.rotation.y = k % 2 ? Math.PI / 2 : 0; }
  }
  // corrente cruzando o peito (diagonal) e um cadeado
  for (let k = 0; k < 7; k++) { const ln = part(G.torus, ironL, 0.1, 0.1, 0.3, -0.3 + k * 0.1, 0.72 - k * 0.09, 0.27, T); ln.rotation.set(0, k % 2 ? Math.PI / 2 : 0, -0.7); }
  part(G.box, iron, 0.14, 0.16, 0.08, 0.06, 0.38, 0.3, T);
  part(G.box, gl, 0.04, 0.04, 0.02, 0.06, 0.38, 0.35, T, false);
  // lanterna de almas na mão esquerda (gaiola de ferro com a luz dentro)
  const lan = group(0, -0.3, 0.12, rig.handL);
  lan.scale.setScalar(1.7);
  part(G.box, iron, 0.06, 0.24, 0.06, 0, 0.2, 0, lan); // alça
  part(G.cone4, iron, 0.32, 0.16, 0.32, 0, 0.02, 0, lan);
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) part(G.box, iron, 0.03, 0.42, 0.03, x, -0.2, z, lan);
  part(G.box, iron, 0.34, 0.05, 0.34, 0, -0.42, 0, lan);
  const soul = part(G.octa, gl, 0.2, 0.28, 0.2, 0, -0.2, 0, lan, false);
  part(G.sphere, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.35 }), 0.36, 0.4, 0.36, 0, -0.2, 0, lan, false);
  rig.lantern = lan; rig.soul = soul;
  // alabarda na mão direita: haste longa, lâmina de machado, ponta e runas brilhando
  const w = group(0, 0, 0, rig.handR);
  const shaft = L(0x2a1e18);
  part(G.cylZ, shaft, 0.07, 0.07, 2.4, 0, 0, 0.5, w);
  part(G.box, iron, 0.1, 0.1, 0.14, 0, 0, -0.7, w);
  part(G.box, ironL, 0.08, 0.62, 0.5, 0, -0.26, 1.42, w);          // lâmina do machado (corte para baixo)
  part(G.box, gl, 0.09, 0.5, 0.05, 0, -0.3, 1.66, w, false);        // fio brilhante
  const spk = part(G.cone4, ironL, 0.12, 0.5, 0.12, 0, 0, 1.92, w); spk.rotation.x = Math.PI / 2;
  part(G.cone4, iron, 0.08, 0.3, 0.08, 0, 0.2, 1.38, w); // gancho do outro lado (em cima)
  for (let k = 0; k < 3; k++) part(G.box, gl, 0.09, 0.03, 0.03, 0, 0, 0.2 + k * 0.35, w, false);
  // segunda camada: correntes enroladas no corpo, cadeados, almas presas e fiapos espectrais na barra do manto
  { const iron = shiny(new THREE.MeshLambertMaterial({ color: 0x5a5866, flatShading: true }), 0.7); rig.mats.push(iron);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; part(SH.ring, iron, 0.1, 0.1, 0.18, Math.sin(a) * 0.38, 0.12 + Math.sin(a * 2) * 0.04, Math.cos(a) * 0.3, rig.torso).rotation.set(i % 2 ? Math.PI / 2 : 0, a, 0); }
    part(SH.block4, iron, 0.12, 0.14, 0.06, 0.2, 0.06, 0.28, rig.torso);
    const soul = new THREE.MeshBasicMaterial({ color: gl.color, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 6; i++) { const a = i * 1.05; part(taperTube([[0, 0, 0], [Math.cos(a) * 0.05, -0.15, Math.sin(a) * 0.05], [-Math.cos(a) * 0.04, -0.3, 0]], 0.06, 0.0, 5, 5), soul, 1, 1, 1, Math.cos(a) * 0.45, -0.88, Math.sin(a) * 0.4, rig.torso, false); }
  }
  rig.kind = 'humanoid'; rig.weaponKind = 'montante';
  return optimizeRig(rig);
}

// Montarias (Cavalo do Criador e Lobo do Braço Direito): reaproveitam o esqueleto das feras de 4 patas
export function buildHorse(kind = 'cavalo') {
  if (kind === 'lobo') return buildQuad({ species: 'lobo_montaria', color: 0x6e7684, size: 1, glow: 0x111111 });
  return buildQuad({ species: 'cavalo', color: 0x7a4a2a, size: 1, glow: 0x111111 });
}

