// =============================================================
// Manto real com física de tecido (PBD: partículas + restrições de distância)
// - preso em arco por cima dos ombros e atrás da nuca (segue os ossos a cada quadro)
// - desvia do corpo: cápsulas nos ossos (tronco, quadril, ombros, braços, pernas, cabeça)
// - cai com a gravidade, abre embaixo (corte em "A") e ondula com o vento e com o movimento
// - grosso: duas faces (veludo vermelho por fora, forro escuro por dentro) + bordas douradas,
//   gola de arminho branca e barra dourada embaixo
// Tudo é simulado no espaço do mundo e escrito na malha no espaço local do modelo.
// =============================================================
import * as THREE from 'three';

const NX = 15, NY = 18;            // colunas (de um ombro ao outro) × linhas (de cima para baixo)
const N = NX * NY;
const K_ITER = 5;                  // iterações das restrições por passo
const MAX_H = 1 / 50;              // passo máximo da simulação (s)
const GRAV = 12;                   // gravidade (unidades do mundo / s²; o herói tem ~2,5 de altura)

const v3 = () => new THREE.Vector3();
const _a = v3(), _b = v3(), _c = v3(), _d = v3();

export class RoyalCape {
  constructor(hero, opts = {}) {
    this.hero = hero;
    this.len = opts.len ?? 1.86;     // comprimento (mundo): dos ombros até perto dos tornozelos
    this.flare = opts.flare ?? 1.0;  // quanto abre embaixo (1 = o dobro da largura de cima)
    this.thick = opts.thick ?? 0.044;
    this.x = new Float32Array(N * 3);   // posição (mundo)
    this.v = new Float32Array(N * 3);   // velocidade
    this.pp = new Float32Array(N * 3);  // posição prevista no passo
    this.nw = new Float32Array(N * 3);  // normais (mundo), para o arrasto do ar
    this.anc = new Float32Array(NX * 3); this.anc0 = new Float32Array(NX * 3);
    this.ready = false; this.t = 0;
    this.frame = { right: v3(), up: v3(), back: v3(), root: v3() };
    this.cols = []; // cápsulas do corpo: { a, b, r, keepBack }
    for (let i = 0; i < 16; i++) this.cols.push({ a: v3(), b: v3(), r: 0, keepBack: false, on: false });
    this.buildMesh();
  }

  // ---------------- malha grossa (frente, verso e bordas) ----------------
  buildMesh() {
    const nTop = NX * NY, side = NY * 2 * 2 + NX * 2; // bordas: esquerda, direita (2 vértices por linha) e barra de baixo
    const nv = nTop * 2 + side;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = [];
    const O = (i, j) => j * NX + i, I = (i, j) => nTop + j * NX + i; // frente (fora) e verso (dentro)
    // cores: veludo vermelho, forro escuro, arminho branco na gola, ouro na barra e nas bordas
    const RED = new THREE.Color(0xa0101c), LIN = new THREE.Color(0x4e070d), FUR = new THREE.Color(0xf4f1e8), GOLD = new THREE.Color(0xf2b632);
    const setC = (k, c, f = 1) => { col[k * 3] = c.r * f; col[k * 3 + 1] = c.g * f; col[k * 3 + 2] = c.b * f; };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const fur = j <= 1, hem = j >= NY - 1;
      const jit = 0.94 + 0.06 * Math.sin(i * 12.9898 + j * 78.233); // leve variação (pelo/veludo)
      setC(O(i, j), fur ? FUR : hem ? GOLD : RED, fur ? jit : 1);
      setC(I(i, j), fur ? FUR : hem ? GOLD : LIN, fur ? jit : 1);
    }
    // vértices das bordas (duplicados para terem normal própria): cor dourada (debrum)
    let k = nTop * 2;
    this.sideL = k; for (let j = 0; j < NY; j++) { setC(k, j <= 1 ? FUR : GOLD); setC(k + 1, j <= 1 ? FUR : GOLD); k += 2; }
    this.sideR = k; for (let j = 0; j < NY; j++) { setC(k, j <= 1 ? FUR : GOLD); setC(k + 1, j <= 1 ? FUR : GOLD); k += 2; }
    this.sideB = k; for (let i = 0; i < NX; i++) { setC(k, GOLD); setC(k + 1, GOLD); k += 2; }
    // triângulos com a frente virada para fora (conferido numa folha de referência: direita=+x, baixo=-y, fora=+z)
    const ref = (vi) => { // posição de referência do vértice vi na folha plana
      if (vi < nTop) return [vi % NX, -Math.floor(vi / NX), 0.5];
      if (vi < nTop * 2) { const q = vi - nTop; return [q % NX, -Math.floor(q / NX), -0.5]; }
      if (vi < this.sideR) { const q = vi - this.sideL; return [-0.001, -Math.floor(q / 2), q % 2 ? -0.5 : 0.5]; }
      if (vi < this.sideB) { const q = vi - this.sideR; return [NX - 1 + 0.001, -Math.floor(q / 2), q % 2 ? -0.5 : 0.5]; }
      const q = vi - this.sideB; return [Math.floor(q / 2), -(NY - 1) - 0.001, q % 2 ? -0.5 : 0.5];
    };
    const tri = (a, b, c, want) => {
      const A = ref(a), B = ref(b), C = ref(c);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      const n = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) idx.push(a, c, b); else idx.push(a, b, c);
    };
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      tri(O(i, j), O(i, j + 1), O(i + 1, j + 1), [0, 0, 1]); tri(O(i, j), O(i + 1, j + 1), O(i + 1, j), [0, 0, 1]);
      tri(I(i, j), I(i, j + 1), I(i + 1, j + 1), [0, 0, -1]); tri(I(i, j), I(i + 1, j + 1), I(i + 1, j), [0, 0, -1]);
    }
    for (let j = 0; j < NY - 1; j++) {
      const l = this.sideL + j * 2, r = this.sideR + j * 2;
      tri(l, l + 2, l + 3, [-1, 0, 0]); tri(l, l + 3, l + 1, [-1, 0, 0]);
      tri(r, r + 2, r + 3, [1, 0, 0]); tri(r, r + 3, r + 1, [1, 0, 0]);
    }
    for (let i = 0; i < NX - 1; i++) { const b = this.sideB + i * 2; tri(b, b + 2, b + 3, [0, -1, 0]); tri(b, b + 3, b + 1, [0, -1, 0]); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.04, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'manto-real'; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.renderOrder = 2;
    this.lp = new Float32Array(N * 3); // posições no espaço local (para montar a malha)
    this.ln = new Float32Array(N * 3);
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }

  // ---------------- corpo: referencial, âncoras e cápsulas ----------------
  // posição do osso direto da matriz (o herói já atualizou as matrizes neste quadro: bem mais barato que getWorldPosition)
  bone(n, out) { const b = this.hero.bones[n]; if (!b) return null; const e = b.matrixWorld.elements; return out.set(e[12], e[13], e[14]); }

  readBody() {
    const F = this.frame, B = this.hero.bones;
    if (!B?.upperarm_l || !B.neck_01 || !B.pelvis) return false;
    const L = this.bone('upperarm_l', _a), R = this.bone('upperarm_r', _b), Nk = this.bone('neck_01', _c), P = this.bone('pelvis', _d);
    F.right.subVectors(R, L); const sw = F.right.length() || 0.5; F.right.multiplyScalar(1 / sw);
    F.up.subVectors(Nk, P); F.up.addScaledVector(F.right, -F.up.dot(F.right)).normalize();
    F.back.crossVectors(F.right, F.up).normalize(); // direita × cima = costas (ossos _r = lado direito do herói)
    { const e = this.hero.root.matrixWorld.elements; F.root.set(e[12], e[13], e[14]); }
    // costas do corpo inteiro (direção do herói, sem a torção dos ombros ao correr): usada no plano e no peso do tecido
    const e = this.hero.root.matrixWorld.elements; (F.rb ||= new THREE.Vector3()).set(-e[8], 0, -e[10]).normalize();
    (this.pel ||= new THREE.Vector3()).copy(P);
    const s = this.hero.root.scale.x || 1;
    // âncoras presas no osso do peito (calibradas na pose de descanso): o manto segue o tronco,
    // sem escorregar quando os ombros balançam andando/correndo
    if (this.ancLocal) {
      const m = B.spine_03.matrixWorld.elements, A = this.ancLocal;
      for (let i = 0; i < NX * 3; i += 3) {
        const x = A[i], y = A[i + 1], z = A[i + 2];
        this.anc[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
        this.anc[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        this.anc[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
    } else this.shoulderArc(_a, _b, _c, F, s);
    this.colliders(F, s);
    return true;
  }

  // arco por cima dos ombros, passando atrás da nuca (centro mais para trás, pontas por cima dos ombros)
  shoulderArc(L, R, Nk, F, s) {
    const SL = L.clone().addScaledVector(F.up, 0.1 * s).addScaledVector(F.back, 0.03 * s).addScaledVector(F.right, 0.02 * s);
    const SR = R.clone().addScaledVector(F.up, 0.1 * s).addScaledVector(F.back, 0.03 * s).addScaledVector(F.right, -0.02 * s);
    const NB = Nk.clone().addScaledVector(F.up, -0.015 * s).addScaledVector(F.back, 0.15 * s);
    const ctrl = NB.clone().multiplyScalar(2).addScaledVector(SL, -0.5).addScaledVector(SR, -0.5);
    for (let i = 0; i < NX; i++) {
      const u = i / (NX - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      this.anc[i * 3] = SL.x * a + ctrl.x * b + SR.x * c;
      this.anc[i * 3 + 1] = SL.y * a + ctrl.y * b + SR.y * c;
      this.anc[i * 3 + 2] = SL.z * a + ctrl.z * b + SR.z * c;
    }
  }

  // calibra as âncoras no espaço do osso do peito (chamado com o modelo recém-montado, na pose de descanso)
  calibrate() {
    this.ancLocal = null;
    if (!this.readBody() || !this.hero.bones.spine_03) return;
    const inv = _m.copy(this.hero.bones.spine_03.matrixWorld).invert(), e = inv.elements, A = (this.ancLocal = new Float32Array(NX * 3));
    for (let i = 0; i < NX * 3; i += 3) {
      const x = this.anc[i], y = this.anc[i + 1], z = this.anc[i + 2];
      A[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      A[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      A[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }

  colliders(F, s) {
    const B = this.hero.bones;
    // cápsulas (raios em unidades do modelo × escala): o manto nunca entra no corpo
    let ci = 0;
    const cap = (n1, n2, r, keepBack, off = 0) => {
      const C = this.cols[ci++]; C.on = false;
      if (!B[n1] || !B[n2]) return;
      this.bone(n1, C.a); this.bone(n2, C.b);
      if (off) { C.a.addScaledVector(F.right, off * s); C.b.addScaledVector(F.right, off * s); }
      C.r = r * s; C.keepBack = keepBack; C.on = true;
    };
    cap('pelvis', 'spine_03', 0.125, true, -0.055); cap('pelvis', 'spine_03', 0.125, true, 0.055); // tronco (2 cápsulas lado a lado = mais largo que fundo)
    cap('spine_03', 'neck_01', 0.14, false, -0.06); cap('spine_03', 'neck_01', 0.14, false, 0.06); // alto das costas
    cap('pelvis', 'pelvis', 0.15, true, -0.07); cap('pelvis', 'pelvis', 0.15, true, 0.07);           // quadril e aba do casaco
    cap('upperarm_l', 'upperarm_r', 0.07, false);                                                     // linha dos ombros
    cap('upperarm_l', 'lowerarm_l', 0.065, false); cap('upperarm_r', 'lowerarm_r', 0.065, false);     // braços
    cap('lowerarm_l', 'hand_l', 0.055, false); cap('lowerarm_r', 'hand_r', 0.055, false);
    cap('thigh_l', 'calf_l', 0.095, false); cap('thigh_r', 'calf_r', 0.095, false);                     // pernas
    cap('calf_l', 'foot_l', 0.075, false); cap('calf_r', 'foot_r', 0.075, false);
    cap('Head', 'Head', 0.12, false);
    this.nCols = ci;
  }

  // ---------------- começo / teletransporte: pendura reto atrás ----------------
  reset() {
    const F = this.frame, s = this.hero.root.scale.x || 1;
    // altura de cada linha: as 2 primeiras curtas (gola de arminho), o resto igual
    const C0 = 0.075 * s, C1 = 0.06 * s, rest = (this.len - C0 - C1) / (NY - 3);
    this.yOf = new Float32Array(NY); for (let j = 1; j < NY; j++) this.yOf[j] = this.yOf[j - 1] + (j === 1 ? C0 : j === 2 ? C1 : rest);
    // molde do manto: meio cone (arco em cima, em volta da nuca, abrindo embaixo) → o tecido "lembra" a curva
    let top = 0;
    for (let i = 0; i < NX - 1; i++) { const a = i * 3, b = a + 3; top += Math.hypot(this.anc[b] - this.anc[a], this.anc[b + 1] - this.anc[a + 1], this.anc[b + 2] - this.anc[a + 2]); }
    const TH = Math.PI * 0.82, r0 = top / TH, r1 = r0 * (1 + this.flare);
    const Cn = this.canon = new Float32Array(N * 3);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = (j * NX + i) * 3, f = this.yOf[j] / this.len, r = r0 + (r1 - r0) * f, ph = TH * (i / (NX - 1) - 0.5);
      // pregas: o raio ondula de leve em volta (mais fundo embaixo) → dobras de tecido pesado que a física mantém
      const pl = 1 + 0.13 * f * Math.cos(ph * (2 * Math.PI / (TH / 3)));
      Cn[k] = r * pl * Math.sin(ph); Cn[k + 1] = -this.yOf[j]; Cn[k + 2] = r * pl * Math.cos(ph); // x = lado, y = altura, z = costas
    }
    const dist = (a, b) => Math.hypot(Cn[b] - Cn[a], Cn[b + 1] - Cn[a + 1], Cn[b + 2] - Cn[a + 2]);
    const id = (i, j) => (j * NX + i) * 3;
    this.hR = new Float32Array(N); this.vR = new Float32Array(N); this.d1R = new Float32Array(N); this.d2R = new Float32Array(N);
    this.bhR = new Float32Array(N); this.bvR = new Float32Array(N); this.tR = new Float32Array(N);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const q = j * NX + i, a = id(i, j);
      if (i < NX - 1) this.hR[q] = dist(a, id(i + 1, j));
      if (j < NY - 1) this.vR[q] = dist(a, id(i, j + 1));
      if (i < NX - 1 && j < NY - 1) { this.d1R[q] = dist(a, id(i + 1, j + 1)); this.d2R[q] = dist(id(i + 1, j), id(i, j + 1)); }
      if (i < NX - 2) this.bhR[q] = dist(a, id(i + 2, j));
      if (j < NY - 2) this.bvR[q] = dist(a, id(i, j + 2));
      this.tR[q] = dist(a, id(i, 0)) * 1.03;
    }
    this.buildLinks();
    // coloca o molde no corpo: centro do arco atrás da nuca
    const c = (NX >> 1) * 3, ox = this.anc[c] - F.back.x * r0, oy = this.anc[c + 1] - F.back.y * r0, oz = this.anc[c + 2] - F.back.z * r0;
    for (let k = 0; k < N * 3; k += 3) {
      const X = Cn[k], Y = Cn[k + 1], Z = Cn[k + 2];
      this.x[k] = ox + F.right.x * X + F.up.x * Y + F.back.x * Z;
      this.x[k + 1] = oy + F.right.y * X + F.up.y * Y + F.back.y * Z;
      this.x[k + 2] = oz + F.right.z * X + F.up.z * Y + F.back.z * Z;
      this.v[k] = this.v[k + 1] = this.v[k + 2] = 0;
    }
    this.anc0.set(this.anc);
    this.ready = true;
  }

  // ---------------- um quadro ----------------
  step(dt) {
    if (!this.readBody()) return;
    const ci = (NX >> 1) * 3;
    // nível de detalhe pela distância da câmera: perto = tecido completo; longe = menos contas; muito longe = parado
    const eye = RoyalCape.eye, far = eye ? Math.hypot(this.anc[ci] - eye.x, this.anc[ci + 1] - eye.y, this.anc[ci + 2] - eye.z) : 0;
    if (far > 70 && this.ready) { this.anc0.set(this.anc); this.writeMesh(); return; }
    this.iters = far < 20 ? K_ITER : far < 40 ? 3 : 2;
    const now = performance.now(); if (now - (this.lastT || 0) > 400) this.ready = false; this.lastT = now; // ficou um tempo sem simular (fora da tela): recomeça
    if (!this.ready || dt > 0.5 || Math.hypot(this.anc[ci] - this.anc0[ci], this.anc[ci + 1] - this.anc0[ci + 1], this.anc[ci + 2] - this.anc0[ci + 2]) > 2.5) this.reset();
    dt = Math.min(dt, 0.1);
    const n = Math.max(1, Math.min(4, Math.ceil(dt / MAX_H))), h = dt / n;
    for (let s = 1; s <= n; s++) this.substep(h, s / n);
    this.anc0.set(this.anc);
    this.writeMesh();
  }

  substep(h, f) {
    const X = this.x, V = this.v, P = this.pp, NW = this.nw, F = this.frame;
    this.t += h;
    const t = this.t, s = this.hero.root.scale.x || 1;
    this.normals(X, NW);
    // vento suave que muda de direção e rajadas (o manto nunca fica parado demais)
    const ew = this.extraWind; // (testes) vento extra = correr parado no lugar
    const wx = Math.sin(t * 0.31) * 0.9 + Math.sin(t * 1.7) * 0.35 + (ew ? ew.x : 0), wz = Math.cos(t * 0.23) * 0.9 + Math.sin(t * 1.3 + 1) * 0.35 + (ew ? ew.z : 0);
    const damp = Math.exp(-0.9 * h), kn = Math.min(1, 2.2 * h), kt = Math.min(1, 0.35 * h);
    const bx = F.rb.x, bz = F.rb.z, L = this.len;
    for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = (j * NX + i) * 3;
      // peso do tecido encorpado: a barra tende a ficar um pouco para trás (perfil em "A", como manto de rei)
      const fb = 2.6 * (this.yOf[j] / L) * h;
      let vx = V[k] + bx * fb, vy = V[k + 1] - GRAV * h, vz = V[k + 2] + bz * fb;
      // arrasto do ar: forte na direção da normal (o tecido "pega vento"), fraco de lado
      const gust = 1 + 0.35 * Math.sin(t * 3.1 + i * 0.7 + j * 0.45);
      const rx = vx - wx * gust, ry = vy, rz = vz - wz * gust;
      const nx = NW[k], ny = NW[k + 1], nz = NW[k + 2], dn = rx * nx + ry * ny + rz * nz;
      vx -= dn * nx * kn + rx * kt; vy -= dn * ny * kn + ry * kt; vz -= dn * nz * kn + rz * kt;
      vx *= damp; vy *= damp; vz *= damp;
      V[k] = vx; V[k + 1] = vy; V[k + 2] = vz;
      P[k] = X[k] + vx * h; P[k + 1] = X[k + 1] + vy * h; P[k + 2] = X[k + 2] + vz * h;
    }
    // linha de cima presa nos ombros (posição entre o quadro anterior e o atual)
    for (let i = 0; i < NX; i++) {
      const a = i * 3;
      P[a] = this.anc0[a] + (this.anc[a] - this.anc0[a]) * f;
      P[a + 1] = this.anc0[a + 1] + (this.anc[a + 1] - this.anc0[a + 1]) * f;
      P[a + 2] = this.anc0[a + 2] + (this.anc[a + 2] - this.anc0[a + 2]) * f;
    }
    const groundY = F.root.y + (this.thick * 0.6 + 0.02) * s;
    const KI = this.iters || K_ITER;
    for (let it = 0; it < KI; it++) {
      this.solveDistances(P);
      this.tethers(P);
      if (it === 1 || it === KI - 1) { this.collide(P, s); this.behind(P, s); }
      for (let k = NX * 3 + 1; k < N * 3; k += 3) if (P[k] < groundY) P[k] = groundY;
    }
    // velocidade nova = quanto andou; posição = prevista
    const ih = 1 / h;
    for (let k = 0; k < N * 3; k++) { V[k] = (P[k] - X[k]) * ih; X[k] = P[k]; }
    // segurança: se algo explodir, recomeça pendurado
    if (!Number.isFinite(X[N * 3 - 1])) this.reset();
  }

  // lista de restrições (montada uma vez no reset): estrutura, diagonais e dobra, com o comprimento do molde
  buildLinks() {
    const L = [], R = 3 * NX;
    const add = (a, b, rest, k, pin) => L.push(a, b, rest, k, pin ? 1 : 0);
    for (let j = 0; j < NY; j++) {
      const top = j === 0;
      for (let i = 0; i < NX; i++) {
        const q = j * NX + i, a = q * 3;
        if (i < NX - 1 && !top) add(a, a + 3, this.hR[q], 1, false);
        if (j < NY - 1) {
          add(a, a + R, this.vR[q], 1, top);
          if (i < NX - 1) { add(a, a + R + 3, this.d1R[q], 0.7, top); add(a + 3, a + R, this.d2R[q], 0.7, top); }
        }
        if (i < NX - 2 && !top) add(a, a + 6, this.bhR[q], 0.22, false); // dobra lateral: segura a curva do manto
        if (j < NY - 2) add(a, a + 2 * R, this.bvR[q], 0.35, top);       // dobra vertical: tecido encorpado
      }
    }
    const n = L.length / 5;
    this.lA = new Int32Array(n); this.lB = new Int32Array(n); this.lR = new Float32Array(n); this.lK = new Float32Array(n); this.lP = new Uint8Array(n);
    for (let c = 0; c < n; c++) { this.lA[c] = L[c * 5]; this.lB[c] = L[c * 5 + 1]; this.lR[c] = L[c * 5 + 2]; this.lK[c] = L[c * 5 + 3]; this.lP[c] = L[c * 5 + 4]; }
    this.nLinks = n;
  }

  solveDistances(P) {
    const A = this.lA, B = this.lB, RL = this.lR, K = this.lK, PIN = this.lP, n = this.nLinks;
    for (let c = 0; c < n; c++) {
      const a = A[c], b = B[c];
      const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (d - RL[c]) / d * K[c];
      if (PIN[c]) { P[b] -= dx * f; P[b + 1] -= dy * f; P[b + 2] -= dz * f; continue; }
      const h = f * 0.5;
      P[a] += dx * h; P[a + 1] += dy * h; P[a + 2] += dz * h;
      P[b] -= dx * h; P[b + 1] -= dy * h; P[b + 2] -= dz * h;
    }
  }

  // corda invisível até o ombro: o tecido não estica além do comprimento (fica firme como pano grosso)
  tethers(P) {
    for (let j = 2; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3, a = i * 3, max = this.tR[j * NX + i];
        const dx = P[k] - P[a], dy = P[k + 1] - P[a + 1], dz = P[k + 2] - P[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > max) { const c = max / d; P[k] = P[a] + dx * c; P[k + 1] = P[a + 1] + dy * c; P[k + 2] = P[a + 2] + dz * c; }
      }
    }
  }

  // empurra as partículas para fora das cápsulas do corpo; em quadril/pernas/tronco o manto fica sempre do lado das costas
  collide(P, s) {
    const back = this.frame.rb, pad = this.thick * 0.5 * s + 0.012 * s;
    for (let c = 0; c < this.nCols; c++) {
      const C = this.cols[c]; if (!C.on) continue;
      const ax = C.a.x, ay = C.a.y, az = C.a.z, bx = C.b.x - ax, by = C.b.y - ay, bz = C.b.z - az;
      const bb = bx * bx + by * by + bz * bz, R = C.r + pad, R2 = R * R;
      const x0 = Math.min(ax, ax + bx) - R, x1 = Math.max(ax, ax + bx) + R, y0 = Math.min(ay, ay + by) - R, y1 = Math.max(ay, ay + by) + R, z0 = Math.min(az, az + bz) - R, z1 = Math.max(az, az + bz) + R;
      for (let k = NX * 3; k < N * 3; k += 3) {
        const qx = P[k], qy = P[k + 1], qz = P[k + 2];
        if (qx < x0 || qx > x1 || qy < y0 || qy > y1 || qz < z0 || qz > z1) continue; // longe da cápsula
        const j = (k / (NX * 3)) | 0;
        let px = qx - ax, py = qy - ay, pz = qz - az;
        const tt = bb > 1e-8 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
        px -= bx * tt; py -= by * tt; pz -= bz * tt; // do ponto mais perto do eixo até a partícula
        let d2 = px * px + py * py + pz * pz;
        if (d2 >= R2) continue;
        if (C.keepBack && j >= 3) { // passou para a frente do corpo: volta para trás (nunca prende entre as pernas)
          const db = px * back.x + py * back.y + pz * back.z;
          if (db < 0) { px -= 2 * db * back.x; py -= 2 * db * back.y; pz -= 2 * db * back.z; }
        }
        d2 = px * px + py * py + pz * pz;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { px = back.x; py = back.y; pz = back.z; d = 1; }
        const m = R / d, cx = ax + bx * tt, cy = ay + by * tt, cz = az + bz * tt;
        P[k] = cx + px * m; P[k + 1] = cy + py * m; P[k + 2] = cz + pz * m;
      }
    }
  }

  // o manto não passa para a frente do corpo (só abraça os lados); quanto mais baixo, mais para trás
  behind(P, s) {
    const B = this.frame.rb, o = this.pel;
    if (!o) return;
    for (let j = 3; j < NY; j++) {
      const min = (0.02 + 0.05 * this.yOf[j] / this.len) * s;
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3, d = (P[k] - o.x) * B.x + (P[k + 1] - o.y) * B.y + (P[k + 2] - o.z) * B.z;
        if (d < min) { const c = min - d; P[k] += B.x * c; P[k + 1] += B.y * c; P[k + 2] += B.z * c; }
      }
    }
  }

  // normais da grade (para fora = costas)
  normals(X, out) {
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = (j * NX + i) * 3;
      const l = (j * NX + Math.max(0, i - 1)) * 3, r = (j * NX + Math.min(NX - 1, i + 1)) * 3;
      const u = (Math.max(0, j - 1) * NX + i) * 3, d = (Math.min(NY - 1, j + 1) * NX + i) * 3;
      const ux = X[r] - X[l], uy = X[r + 1] - X[l + 1], uz = X[r + 2] - X[l + 2];   // para a direita
      const vx = X[d] - X[u], vy = X[d + 1] - X[u + 1], vz = X[d + 2] - X[u + 2];   // para baixo
      let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;   // baixo × direita = costas
      const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out[k] = nx / L; out[k + 1] = ny / L; out[k + 2] = nz / L;
    }
  }

  // ---------------- malha: mundo → local do modelo, com espessura ----------------
  writeMesh() {
    const parent = this.mesh.parent; if (!parent) return;
    const inv = _m.copy(parent.matrixWorld).invert(), e = inv.elements;
    const X = this.x, LP = this.lp, LN = this.ln;
    for (let k = 0; k < N * 3; k += 3) {
      const x = X[k], y = X[k + 1], z = X[k + 2];
      LP[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      LP[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      LP[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    this.normals(LP, LN);
    const sc = Math.hypot(e[0], e[1], e[2]) || 1; // mundo → local
    const g = this.mesh.geometry, pos = g.attributes.position.array, nrm = g.attributes.normal.array;
    const nTop = N;
    const th = (j) => (j === 0 ? 2.9 : j === 1 ? 2.1 : j === 2 ? 1.25 : 1) * this.thick * 0.5 * sc; // gola de arminho mais fofa
    for (let j = 0; j < NY; j++) {
      const hw = th(j);
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3, o = k, q = (nTop + j * NX + i) * 3;
        const nx = LN[k], ny = LN[k + 1], nz = LN[k + 2];
        pos[o] = LP[k] + nx * hw; pos[o + 1] = LP[k + 1] + ny * hw; pos[o + 2] = LP[k + 2] + nz * hw;
        pos[q] = LP[k] - nx * hw; pos[q + 1] = LP[k + 1] - ny * hw; pos[q + 2] = LP[k + 2] - nz * hw;
        nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz; nrm[q] = -nx; nrm[q + 1] = -ny; nrm[q + 2] = -nz;
      }
    }
    // bordas: copiam frente/verso e apontam para fora da borda
    const edge = (base, cnt, at, dirFrom) => {
      for (let m = 0; m < cnt; m++) {
        const [i, j] = at(m), k = (j * NX + i) * 3, [i2, j2] = dirFrom(m), k2 = (j2 * NX + i2) * 3;
        let dx = LP[k] - LP[k2], dy = LP[k + 1] - LP[k2 + 1], dz = LP[k + 2] - LP[k2 + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= L; dy /= L; dz /= L;
        const a = (base + m * 2) * 3, b = a + 3, o = k, q = (nTop + j * NX + i) * 3;
        pos[a] = pos[o]; pos[a + 1] = pos[o + 1]; pos[a + 2] = pos[o + 2];
        pos[b] = pos[q]; pos[b + 1] = pos[q + 1]; pos[b + 2] = pos[q + 2];
        nrm[a] = nrm[b] = dx; nrm[a + 1] = nrm[b + 1] = dy; nrm[a + 2] = nrm[b + 2] = dz;
      }
    };
    edge(this.sideL, NY, (m) => [0, m], (m) => [1, m]);
    edge(this.sideR, NY, (m) => [NX - 1, m], (m) => [NX - 2, m]);
    edge(this.sideB, NX, (m) => [m, NY - 1], (m) => [m, NY - 2]);
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
}
const _m = new THREE.Matrix4();
RoyalCape.eye = null; // posição da câmera (o jogo aponta para camera.position)
