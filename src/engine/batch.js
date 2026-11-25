import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/utils/BufferGeometryUtils.js';

// Junta geometria estática colorida em poucas malhas (poucas draw calls).
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  prism: new THREE.CylinderGeometry(0.5, 0.5, 1, 3),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 18),
};
export { GEO };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

// Registro das geometrias-fonte (para o Ultra realismo saber, peça por peça, de que forma ela veio e
// reconstruir as coordenadas locais). Fora do Ultra só guarda 1 id + 1 tipo por peça (bytes).
export const GEO_LIST = [];
const GEO_ID = new Map();
function geoId(geo) { let id = GEO_ID.get(geo); if (id === undefined) { id = GEO_LIST.length; GEO_ID.set(geo, id); GEO_LIST.push(geo); } return id; }

export class Batch {
  // k: tipo de material para o Ultra (0 = automático pela cor); fica valendo para as próximas peças
  constructor() { this.parts = []; this.ids = []; this.ks = []; this.k = 0; }

  addGeo(geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, color = 0xffffff) {
    this.ids.push(geoId(geo)); this.ks.push(this.k | 0);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.piece) { // centro + raio da peça (para sumir a peça INTEIRA quando tapa o herói)
      const pc = new Float32Array(n * 4), r = 0.5 * Math.max(sx, sy, sz);
      for (let i = 0; i < n; i++) { pc[i * 4] = x; pc[i * 4 + 1] = y; pc[i * 4 + 2] = z; pc[i * 4 + 3] = r; }
      g.setAttribute('aPiece', new THREE.BufferAttribute(pc, 4));
    }
    this.parts.push(g);
    return g;
  }

  box(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) { return this.addGeo(GEO.box, x, y, z, w, h, d, rx, ry, rz, color); }
  cyl(x, y, z, r, h, color, seg = 8, rx = 0, ry = 0, rz = 0) { return this.addGeo(GEO['cyl' + seg] || GEO.cyl8, x, y, z, r * 2, h, r * 2, rx, ry, rz, color); }
  cone(x, y, z, r, h, color, seg = 6, ry = 0, rx = 0, rz = 0) { return this.addGeo(GEO['cone' + seg] || GEO.cone6, x, y, z, r * 2, h, r * 2, rx, ry, rz, color); }
  rock(x, y, z, s, color, ry = 0, sy = 0.7) { return this.addGeo(GEO.dodeca, x, y, z, s, s * sy, s, 0, ry, 0, color); }

  build(material, { castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; mesh.name = name;
    mesh.userData.ub = { ids: Uint16Array.from(this.ids), ks: Uint8Array.from(this.ks) }; // peças (Ultra realismo)
    this.ids = []; this.ks = [];
    return mesh;
  }
}

export function lambert(color = 0xffffff, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}
export function vcLambert(extra = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...extra });
}

// Placas flutuantes foram retiradas (poluíam a tela): devolve um objeto vazio para manter as chamadas antigas.
export function labelSprite() {
  const o = new THREE.Object3D(); o.visible = false;
  return o;
}
