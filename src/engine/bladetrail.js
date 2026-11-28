// =============================================================
// Rastro da lâmina: o efeito do golpe sai de DENTRO da arma, seguindo o fio da lâmina enquanto ela
// varre o ar (não um arco desenhado depois do ataque).
// A cada quadro guarda onde estão a base e a ponta da lâmina (no mundo) e desenha uma fita entre as
// posições recentes. A fita só acende quando a lâmina está girando rápido num ataque — andando ou
// parado ela some sozinha. Os quadros do meio são preenchidos em arco (em volta da mão), então o
// rastro fica redondo mesmo a 30 fps.
// =============================================================
import * as THREE from 'three';

const N = 22;           // amostras guardadas (2 por quadro)
let _tex;
function trailTex() {
  if (_tex !== undefined) return _tex;
  if (typeof document === 'undefined') return (_tex = null);
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const st = new Float32Array(H); for (let j = 0; j < H; j++) st[j] = 0.5 + 0.5 * rnd();
  for (let j = 0; j < H; j++) {
    const v = j / (H - 1); // 0 = base da lâmina, 1 = ponta
    const edge = Math.exp(-Math.pow((v - 0.9) / 0.09, 2));
    const body = Math.pow(v, 1.25) * (1 - Math.pow(Math.max(0, (v - 0.94) / 0.06), 2)) * 0.75; // ar cortado: mais leve que o fio
    for (let i = 0; i < W; i++) {
      const u = i / (W - 1); // 0 = agora (junto da lâmina), 1 = mais antigo
      const tail = Math.pow(1 - u, 1.2);
      const streak = 0.72 + 0.28 * Math.sin(u * 34 + st[j] * 28) * st[j];
      const a = Math.min(1, (edge * (0.7 + 0.3 * (1 - u)) + body * streak) * tail);
      const w = Math.min(1, edge * 1.4 * (1 - u * 0.7));
      const k = (j * W + i) * 4;
      d[k] = 255 * a; d[k + 1] = 255 * Math.min(1, a * (0.4 + 0.6 * w)); d[k + 2] = 255 * w * a; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  return (_tex = t);
}

const _b = new THREE.Vector3(), _t = new THREE.Vector3(), _g = new THREE.Vector3(), _l = new THREE.Vector3();
const _inv = new THREE.Matrix4(), _c = new THREE.Color();

export class BladeTrail {
  // weapon: objeto da arma (preso na mão); a0/a1 = base e ponta da lâmina no espaço da arma
  constructor(weapon, a0, a1, color = 0xfff0c8) {
    this.weapon = weapon; this.a0 = a0.clone(); this.a1 = a1.clone();
    this.color = new THREE.Color(color);
    this.base = new Float32Array(N * 3); this.tip = new Float32Array(N * 3); this.k = new Float32Array(N);
    this.filled = 0; this.on = 0; this.prevTipL = null;
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), col = new Float32Array(N * 2 * 3), idx = [];
    for (let i = 0; i < N; i++) {
      uv[i * 4] = i / (N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 3] = 1;
      if (i < N - 1) { const a = i * 2, b = (i + 1) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const tex = trailTex();
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false;
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }

  // guarda uma amostra (mais nova na frente)
  shift(bx, by, bz, tx, ty, tz, k) {
    this.base.copyWithin(3, 0, (N - 1) * 3); this.tip.copyWithin(3, 0, (N - 1) * 3); this.k.copyWithin(1, 0, N - 1);
    this.base[0] = bx; this.base[1] = by; this.base[2] = bz; this.tip[0] = tx; this.tip[1] = ty; this.tip[2] = tz; this.k[0] = k;
    if (this.filled < N) this.filled++;
  }

  // root: raiz do herói (para medir a velocidade da lâmina sem contar o herói andando); attacking: há golpe agora
  // a fita fica presa na raiz do herói (some junto quando ele sai); as amostras ficam no mundo e são
  // convertidas para o espaço da raiz na hora de desenhar
  update(dt, root, attacking) {
    if (!this.weapon.parent) { this.mesh.visible = false; return; }
    if (this.mesh.parent !== root) root.add(this.mesh);
    const W = this.weapon.matrixWorld;
    _b.copy(this.a0).applyMatrix4(W); _t.copy(this.a1).applyMatrix4(W);
    _g.setFromMatrixPosition(W); // mão (centro do giro)
    // velocidade da ponta em relação ao corpo
    _inv.copy(root.matrixWorld).invert(); _l.copy(_t).applyMatrix4(_inv);
    let spd = 0;
    if (this.prevTipL && dt > 0) spd = _l.distanceTo(this.prevTipL) / dt / (root.scale.x || 1);
    (this.prevTipL ||= new THREE.Vector3()).copy(_l);
    const want = attacking ? Math.min(1, Math.max(0, (spd - 2.2) / 4.5)) : 0;
    this.on += (want - this.on) * Math.min(1, dt * (want > this.on ? 40 : 10));
    // quadro do meio: em arco em volta da mão (base e ponta mantêm a distância até a mão)
    if (this.filled > 0 && this.on > 0.02) {
      const pb = [this.base[0], this.base[1], this.base[2]], pt = [this.tip[0], this.tip[1], this.tip[2]];
      const mid = (p, q) => {
        const ax = p[0] - _g.x, ay = p[1] - _g.y, az = p[2] - _g.z, bx = q.x - _g.x, by = q.y - _g.y, bz = q.z - _g.z;
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
        let mx = ax / (la || 1) + bx / (lb || 1), my = ay / (la || 1) + by / (lb || 1), mz = az / (la || 1) + bz / (lb || 1);
        const lm = Math.hypot(mx, my, mz) || 1, r = (la + lb) / 2;
        return [_g.x + mx / lm * r, _g.y + my / lm * r, _g.z + mz / lm * r];
      };
      const mb = mid(pb, _b), mt = mid(pt, _t);
      this.shift(mb[0], mb[1], mb[2], mt[0], mt[1], mt[2], (this.k[0] + this.on) / 2);
    }
    this.shift(_b.x, _b.y, _b.z, _t.x, _t.y, _t.z, this.on);
    // fita: só desenha se alguma amostra recente estiver acesa
    let any = 0; for (let i = 0; i < this.filled; i++) any = Math.max(any, this.k[i]);
    this.mesh.visible = any > 0.03 && this.filled > 2;
    if (!this.mesh.visible) return;
    const pos = this.mesh.geometry.attributes.position.array, col = this.mesh.geometry.attributes.color.array, e = _inv.elements;
    const put = (q, x, y, z) => { pos[q] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[q + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[q + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; };
    for (let i = 0; i < N; i++) {
      const s = Math.min(i, this.filled - 1), q = i * 6;
      put(q, this.base[s * 3], this.base[s * 3 + 1], this.base[s * 3 + 2]);
      put(q + 3, this.tip[s * 3], this.tip[s * 3 + 1], this.tip[s * 3 + 2]);
      const k = i < this.filled ? this.k[s] : 0;
      _c.copy(this.color).multiplyScalar(k);
      col[q] = col[q + 3] = _c.r; col[q + 1] = col[q + 4] = _c.g; col[q + 2] = col[q + 5] = _c.b;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

// base e ponta da lâmina, medidas na própria arma (o lado mais longe da mão é a ponta)
export function bladeSegment(weapon, kind) {
  const box = new THREE.Box3();
  weapon.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(weapon.matrixWorld).invert(), v = new THREE.Vector3();
  weapon.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(m); box.expandByPoint(v); }
  });
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const far = Math.abs(box.max[ax]) >= Math.abs(box.min[ax]) ? box.max[ax] : box.min[ax];
  const from = { espada: 0.28, montante: 0.26, adaga: 0.3, machado: 0.4, clava: 0.45 }[kind] ?? 0.35;
  const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  a0[ax] = far * from; a1[ax] = far * 1.02;
  return [a0, a1];
}
