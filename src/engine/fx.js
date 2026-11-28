import * as THREE from 'three';

// Efeitos visuais com pools (partículas, anéis, avisos no chão, explosões, feixes).
const MAXP = 3200;

export class FX {
  constructor(scene) {
    this.scene = scene;
    // partículas aditivas
    this.p = { pos: new Float32Array(MAXP * 3), vel: new Float32Array(MAXP * 3), col: new Float32Array(MAXP * 3), size: new Float32Array(MAXP), alpha: new Float32Array(MAXP),
      life: new Float32Array(MAXP), max: new Float32Array(MAXP), grav: new Float32Array(MAXP), drag: new Float32Array(MAXP), s0: new Float32Array(MAXP), next: 0 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.p.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.p.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.p.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pmat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * (0.6 + a), a * vA);
        #include <colorspace_fragment>
      }`,
    });
    this.points = new THREE.Points(g, this.pmat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.active = [];
    this.geo = {
      ring: new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
      disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      sphere: new THREE.SphereGeometry(1, 16, 10),
      beam: new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true).translate(0, 0.5, 0),
      dome: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      shard: new THREE.ConeGeometry(0.25, 1.2, 5),
      arrow: new THREE.CylinderGeometry(0.022, 0.022, 1.05, 6).rotateX(Math.PI / 2),
      arrowTip: new THREE.ConeGeometry(0.075, 0.26, 4).rotateX(Math.PI / 2).scale(1, 0.38, 1).translate(0, 0, 0.64),
      arrowNeck: new THREE.CylinderGeometry(0.03, 0.026, 0.07, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      arrowVane: new THREE.BoxGeometry(0.008, 0.09, 0.26).translate(0, 0.062, -0.38),
      arrowGlow: new THREE.SphereGeometry(0.12, 8, 6).scale(0.8, 0.8, 1.9).translate(0, 0, 0.55),
      orb: new THREE.SphereGeometry(0.22, 10, 8),
      rock: new THREE.DodecahedronGeometry(0.2, 0),
    };
    this.c = new THREE.Color();
    // fumaça (mistura normal, não aditiva): aparece escura até em cima da grama clara
    const MS = 320;
    this.s = { n: MS, pos: new Float32Array(MS * 3), vel: new Float32Array(MS * 3), col: new Float32Array(MS * 3), size: new Float32Array(MS), alpha: new Float32Array(MS),
      life: new Float32Array(MS), max: new Float32Array(MS), s0: new Float32Array(MS), grow: new Float32Array(MS), a0: new Float32Array(MS), next: 0 };
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.s.pos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.s.col, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('size', new THREE.BufferAttribute(this.s.size, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('alpha', new THREE.BufferAttribute(this.s.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.smat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 }, map: { value: null } },
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: this.pmat.vertexShader,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a);
        #include <colorspace_fragment>
      }`,
    });
    this.smokePts = new THREE.Points(sg, this.smat);
    this.smokePts.frustumCulled = false; this.smokePts.renderOrder = 4;
    scene.add(this.smokePts);
  }

  // ---------- texturas macias (feitas uma vez, num canvas pequeno) ----------
  softTex(kind) {
    this._tex ||= {};
    if (this._tex[kind]) return this._tex[kind];
    const S = kind === 'glow' ? 64 : 128, h = S / 2;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    let seed = kind.length * 977 + 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const blob = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.29); c.fill(); };
    const mask = (inner) => { c.globalCompositeOperation = 'destination-in'; const g = c.createRadialGradient(h, h, 0, h, h, h); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(inner, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); c.globalCompositeOperation = 'source-over'; };
    if (kind === 'glow') { // brilho: centro forte e queda suave (sem borda dura)
      const g = c.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(0.7, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    } else if (kind === 'puff') { // bolha de fogo/fumaça: várias manchas macias juntas
      blob(h, h, h * 0.62, 'rgba(255,255,255,0.75)');
      for (let i = 0; i < 11; i++) { const a = rnd() * 6.28, r = rnd() * h * 0.38; blob(h + Math.cos(a) * r, h + Math.sin(a) * r, h * (0.22 + rnd() * 0.3), 'rgba(255,255,255,0.45)'); }
      mask(0.45);
    } else if (kind === 'ring') { // onda de choque: faixa fina com bordas macias
      const g = c.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(0.84, 'rgba(255,255,255,0.9)'); g.addColorStop(0.9, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    } else if (kind === 'scorch') { // chão queimado: manchas escuras irregulares, borda que some aos poucos
      blob(h, h, h * 0.55, 'rgba(18,11,7,0.85)');
      for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, r = h * (0.15 + rnd() * 0.42); blob(h + Math.cos(a) * r, h + Math.sin(a) * r, h * (0.12 + rnd() * 0.22), 'rgba(28,18,12,0.55)'); }
      for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = h * (0.05 + rnd() * 0.5); blob(h + Math.cos(a) * r, h + Math.sin(a) * r, 1.5 + rnd() * 3, 'rgba(90,80,70,0.35)'); } // cinza clara
      mask(0.35);
    } else if (kind === 'ember') { // brasas: pontinhos e rachaduras que brilham (tingidas pela cor)
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineCap = 'round';
      for (let i = 0; i < 9; i++) { let a = rnd() * 6.28, x = h + Math.cos(a) * h * 0.12, y = h + Math.sin(a) * h * 0.12; c.lineWidth = 1.2 + rnd() * 1.6; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 4; j++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * h * 0.12; y += Math.sin(a) * h * 0.12; c.lineTo(x, y); } c.stroke(); }
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, r = h * (0.05 + rnd() * 0.55); blob(h + Math.cos(a) * r, h + Math.sin(a) * r, 1 + rnd() * 3.5, 'rgba(255,255,255,0.9)'); }
      blob(h, h, h * 0.3, 'rgba(255,255,255,0.5)');
      mask(0.4);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return (this._tex[kind] = t);
  }

  // brilho de frente para a câmera (sprite) com textura macia
  spr(color, opacity = 1, tex = 'glow', additive = true) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex(tex), color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    return s;
  }

  // fumaça escura (ou vapor claro) que sobe e se espalha
  smoke(x, y, z, vx, vy, vz, color, size, life, grow = 2, alpha = 0.7) {
    if (this.mute) return;
    if (this.leve && (this._sskip = !this._sskip)) return;
    const s = this.s, i = s.next; s.next = (s.next + 1) % s.n;
    s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z;
    s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
    this.c.set(color); s.col[i * 3] = this.c.r; s.col[i * 3 + 1] = this.c.g; s.col[i * 3 + 2] = this.c.b;
    s.s0[i] = size; s.size[i] = size * 0.5; s.grow[i] = grow; s.a0[i] = alpha; s.alpha[i] = 0; s.life[i] = life; s.max[i] = life;
  }

  // clarão rápido (disparo, impacto)
  flash(x, y, z, color = 0xffffff, size = 1.5, dur = 0.14) {
    const g = new THREE.Group(), a = this.spr(color, 1), b = this.spr(0xffffff, 0.9);
    g.add(a, b); g.position.set(x, y, z);
    return this._add(g, dur, (f, k) => { const s = size * (0.6 + 0.6 * Math.sqrt(k)); a.scale.setScalar(s); b.scale.setScalar(s * 0.45); a.material.opacity = 1 - k; b.material.opacity = 0.9 * (1 - k) * (1 - k); }, { order: 6 });
  }

  // energia se juntando na mão/ponta do cajado antes de soltar a magia (segue a mão)
  castGlow(follow, color = 0xc79bff, dur = 0.16, size = 0.8) {
    const g = new THREE.Group(), a = this.spr(color, 0.9), b = this.spr(0xffffff, 0.8);
    g.add(a, b);
    const p0 = follow(); if (p0) g.position.copy(p0);
    return this._add(g, dur, (f, k) => {
      const p = follow(); if (p) g.position.copy(p);
      const s = size * (0.35 + 0.9 * k); a.scale.setScalar(s * 1.7); b.scale.setScalar(s * 0.55);
      a.material.opacity = 0.95; b.material.opacity = 0.6 + 0.4 * k;
      if (Math.random() < 0.7) { const an = Math.random() * 6.28, el = (Math.random() - 0.5) * 2, r = 0.55 * size; const ox = Math.cos(an) * r, oy = el * r * 0.6, oz = Math.sin(an) * r; this.emit(g.position.x + ox, g.position.y + oy, g.position.z + oz, -ox * 5, -oy * 5, -oz * 5, Math.random() < 0.5 ? 0xffffff : color, 0.13, 0.16, 0, 0); }
    }, { order: 6 });
  }

  // ---------- partículas ----------
  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0) {
    if (this.mute) return; // gráficos Baixa/Ultra leve: chefes e elites não soltam partículas
    if (this.leve && (this._skip = !this._skip)) return; // Ultra leve: metade das partículas
    const p = this.p;
    const i = p.next; p.next = (p.next + 1) % MAXP;
    p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
    p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
    this.c.set(color);
    p.col[i * 3] = this.c.r; p.col[i * 3 + 1] = this.c.g; p.col[i * 3 + 2] = this.c.b;
    p.size[i] = size; p.s0[i] = size; p.alpha[i] = 1; p.life[i] = life; p.max[i] = life; p.grav[i] = grav; p.drag[i] = drag;
  }

  burst(pos, o = {}) {
    const n = o.count ?? 14, sp = o.speed ?? 5, col = o.color ?? 0xffffff;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * (o.spread ?? 1.4);
      const s = sp * (0.4 + Math.random() * 0.8);
      this.emit(pos.x + (Math.random() - 0.5) * (o.jitter ?? 0.3), pos.y + (Math.random() - 0.5) * (o.jitter ?? 0.3), pos.z + (Math.random() - 0.5) * (o.jitter ?? 0.3),
        Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + (o.up ?? 1.5), Math.sin(a) * s * Math.cos(e),
        Array.isArray(col) ? col[k % col.length] : col, (o.size ?? 0.35) * (0.6 + Math.random() * 0.8), (o.life ?? 0.6) * (0.6 + Math.random() * 0.7), o.gravity ?? 9, o.drag ?? 1.5);
    }
  }

  hit(pos, color = 0xffe2a0, big = false) {
    this.burst(pos, { count: big ? 22 : 10, speed: big ? 8 : 5, color: [color, 0xffffff], size: big ? 0.45 : 0.3, life: 0.4, gravity: 12 });
    if (this.ultra) { // clarão no ponto do golpe + faíscas finas e rápidas
      this.emit(pos.x, pos.y, pos.z, 0, 0, 0, color, big ? 1.5 : 1.0, 0.13, 0, 0);
      this.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0xffffff, big ? 0.8 : 0.55, 0.09, 0, 0);
      this.burst(pos, { count: big ? 12 : 6, speed: big ? 13 : 9, color: [0xffffff, color], size: 0.09, life: 0.3, gravity: 16, drag: 0.5 });
    }
  }

  // ---------- malhas temporárias ----------
  _add(mesh, dur, update, opts = {}) {
    mesh.renderOrder = opts.order ?? 4;
    this.scene.add(mesh);
    const fx = { mesh, t: 0, dur, update, done: false, onEnd: opts.onEnd };
    this.active.push(fx);
    return fx;
  }

  addMat(color, opacity = 1, additive = true) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
  }

  ring(x, y, z, radius, color = 0xffffff, dur = 0.45, width = 1) {
    const m = new THREE.Mesh(this.geo.ring, this.addMat(color, 0.9));
    m.position.set(x, y + 0.08, z);
    return this._add(m, dur, (f, k) => { const s = radius * (0.25 + 0.75 * Math.sqrt(k)); m.scale.set(s, 1, s); m.material.opacity = 0.9 * (1 - k); void width; });
  }

  // Arco do golpe. dh = diferença de altura do chão à frente (inclina o arco acompanhando o morro).
  // Golpe de lâmina: meia-lua brilhante que VARRE o arco (ponta branca, rastro da cor sumindo),
  // inclinada como um golpe de espada de verdade, com faíscas saindo da ponta.
  // textura do corte: meia-lua macia (borda de fora afiada e brilhante, por dentro esfumada) com riscos de velocidade
  slashTex() {
    if (this._slashTex !== undefined) return this._slashTex;
    if (typeof document === 'undefined') return (this._slashTex = null);
    const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const streak = new Float32Array(H); for (let j = 0; j < H; j++) streak[j] = 0.55 + 0.45 * rnd();
    for (let j = 0; j < H; j++) {
      const v = j / (H - 1); // 0 = dentro, 1 = fio da lâmina
      const edge = Math.exp(-Math.pow((v - 0.86) / 0.07, 2)); // fio fino e forte
      const body = Math.pow(Math.max(0, v), 1.3) * (1 - Math.pow(Math.max(0, (v - 0.9) / 0.1), 2)) * 0.95; // corpo do corte mais cheio
      for (let i = 0; i < W; i++) {
        const u = i / (W - 1); // 0 = ponta (onde a lâmina está), 1 = cauda
        const tail = Math.pow(1 - u, 1.15) * Math.min(1, u * 25 + 0.25);
        const sl = 0.7 + 0.3 * Math.sin(u * 40 + streak[j] * 30) * streak[j];
        const a = Math.min(1, (edge * (0.6 + 0.4 * (1 - u)) + body * sl) * tail);
        const w = Math.min(1, edge * 1.3 * (1 - u * 0.6)); // fio quase branco, o resto fica da cor do golpe
        const k = (j * W + i) * 4;
        d[k] = 255 * a; d[k + 1] = 255 * Math.min(1, a * (0.35 + 0.65 * w)); d[k + 2] = 255 * w * a; d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; // linha 0 = dentro do arco, última = fio
    return (this._slashTex = t);
  }

  // Arco do golpe. dh = diferença de altura do chão à frente (inclina o arco acompanhando o morro).
  // Golpe de lâmina: meia-lua com fio branco e afiado que VARRE o arco, rastro macio da cor do golpe sumindo
  // para trás com riscos de velocidade, clarão na ponta e faíscas. Inclinado como golpe de espada de verdade.
  slash(x, y, z, yaw, radius, arcDeg, color = 0xffe2a0, dur = 0.22, dh = 0, heavy = false) {
    const arc = (arcDeg * Math.PI) / 180, trail = Math.min(arc * 0.8, 2.6), N = 28;
    const r0 = radius * 0.3, r2 = radius * 1.04;
    const tex = this.slashTex();
    const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = -u * trail;
      [[r0, 0], [r2, 1]].forEach(([r, v], j) => {
        const k = i * 2 + j;
        pos[k * 3] = Math.sin(ang) * r; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = Math.cos(ang) * r;
        uv[k * 2] = u; uv[k * 2 + 1] = v;
      });
      if (i < N) { const a0 = i * 2, b0 = (i + 1) * 2; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const c = new THREE.Color(color);
    const tint = c.clone().lerp(new THREE.Color(0xffffff), 0.15);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    if (!tex) { mat.map = null; mat.opacity = 0.7; }
    const sweep = new THREE.Group(), tiltG = new THREE.Group(), g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat); sweep.add(m); tiltG.add(sweep); g.add(tiltG);
    // corpo do golpe: um brilho largo e fraco por fora + um segundo fio logo abaixo (dá espessura de "onda de ar")
    const mat2 = mat.clone();
    const outer = new THREE.Mesh(geo, mat2); outer.scale.set(1.1, 1, 1.1); outer.position.y = 0.06; sweep.add(outer);
    let mat3 = null;
    if (this.ultra) { mat3 = mat.clone(); const inner = new THREE.Mesh(geo, mat3); inner.scale.set(0.93, 1, 0.93); inner.position.y = -0.07; sweep.add(inner); }
    // clarão macio que corre junto com a ponta da lâmina
    const flare = this.spr(color, 0.9); flare.scale.setScalar(radius * 0.55); flare.position.set(0, 0, r2 * 0.97); sweep.add(flare);
    const flare2 = this.spr(0xffffff, 0.9); flare2.scale.setScalar(radius * 0.22); flare2.position.set(0, 0, r2 * 0.97); sweep.add(flare2);
    const pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(dh || 0, radius * 0.8)));
    this._slashN = (this._slashN || 0) + 1;
    const side = this._slashN % 2 ? 1 : -1;
    tiltG.rotation.x = -pitch;
    tiltG.rotation.z = heavy ? 0 : side * (arcDeg >= 300 ? 0.08 : 0.38); // golpe na diagonal (alterna os lados)
    g.position.set(x, y + (heavy ? 0.9 : 1.05), z);
    g.rotation.y = yaw;
    const from = side > 0 ? arc / 2 : -arc / 2, to = -from + (side > 0 ? trail : -trail) * 0.5;
    if (side < 0) sweep.scale.x = -1; // varre da direita para a esquerda no golpe seguinte
    const tip = new THREE.Vector3();
    return this._add(g, dur * 1.3, (f, k) => {
      const e = 1 - Math.pow(1 - Math.min(1, k * 1.4), 3);
      sweep.rotation.y = side > 0 ? from - (from - to) * e : -(from - (from - to) * e);
      const op = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
      mat.opacity = op; mat2.opacity = op * 0.3; if (mat3) mat3.opacity = op * 0.5;
      flare.material.opacity = 0.75 * op * (1 - k * 0.5); flare2.material.opacity = op * (k < 0.7 ? 1 : 0);
      const sc = 0.94 + k * 0.1; g.scale.set(sc, 1, sc);
      if (k < 0.72 && Math.random() < 0.85) { // faíscas soltando do fio da lâmina
        m.updateWorldMatrix(true, false); tip.set(0, 0, r2 * 0.95).applyMatrix4(m.matrixWorld);
        this.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4, Math.random() < 0.5 ? 0xffffff : color, 0.13, 0.32, 5, 2);
        if (this.ultra) for (let q = 0; q < 2; q++) this.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 4.5, Math.random() * 2.6, (Math.random() - 0.5) * 4.5, q ? 0xffffff : color, 0.09, 0.42, 8, 1.5);
      }
    }, { onEnd: () => { geo.dispose(); mat.dispose(); mat2.dispose(); mat3?.dispose(); flare.material.dispose?.(); flare2.material.dispose?.(); } });
  }

  // rastro de fita (sempre virado para a câmera): mais grosso e macio que uma linha de 1 pixel
  // mesma interface do streak: push(x,y,z) a cada quadro e end() quando acaba
  ribbon(color = 0xffffff, n = 18, width = 0.14) {
    const cam = this.camera;
    if (!cam) return this.streak(color, n);
    const pts = new Float32Array(n * 3), pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), idx = [];
    const c = new THREE.Color(color), w = new THREE.Color(0xffffff);
    for (let i = 0; i < n; i++) {
      const k = 1 - i / (n - 1), a = Math.pow(k, 1.3);
      const cc = c.clone().lerp(w, Math.pow(k, 4) * 0.7).multiplyScalar(a);
      for (let j = 0; j < 2; j++) { const q = (i * 2 + j) * 3; col[q] = cc.r; col[q + 1] = cc.g; col[q + 2] = cc.b; }
      if (i < n - 1) { const a0 = i * 2, b0 = (i + 1) * 2; idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    this.scene.add(mesh);
    const d = new THREE.Vector3(), v = new THREE.Vector3(), o = new THREE.Vector3();
    let filled = 0, scale = 1;
    const build = () => {
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        d.set(pts[i1 * 3] - pts[i0 * 3], pts[i1 * 3 + 1] - pts[i0 * 3 + 1], pts[i1 * 3 + 2] - pts[i0 * 3 + 2]);
        v.set(cam.position.x - pts[i * 3], cam.position.y - pts[i * 3 + 1], cam.position.z - pts[i * 3 + 2]);
        o.crossVectors(d, v); const L = o.length();
        if (L < 1e-6) o.set(0, 1, 0); else o.multiplyScalar(1 / L);
        const hw = width * 0.5 * scale * (1 - i / (n - 1) * 0.75); // afina para trás
        for (let j = 0; j < 2; j++) {
          const s = j ? hw : -hw, q = (i * 2 + j) * 3;
          pos[q] = pts[i * 3] + o.x * s; pos[q + 1] = pts[i * 3 + 1] + o.y * s; pos[q + 2] = pts[i * 3 + 2] + o.z * s;
        }
      }
      g.attributes.position.needsUpdate = true;
    };
    const S = { line: mesh, n, push: (x, y, z) => {
      pts.copyWithin(3, 0, (n - 1) * 3);
      pts[0] = x; pts[1] = y; pts[2] = z;
      if (filled < n) { for (let i = filled; i < n; i++) { pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z; } filled++; }
      build();
    }, end: () => this._add(mesh, 0.22, (f, k) => {
      const hx = pts[0], hy = pts[1], hz = pts[2];
      for (let i = 1; i < n; i++) { pts[i * 3] += (hx - pts[i * 3]) * k; pts[i * 3 + 1] += (hy - pts[i * 3 + 1]) * k; pts[i * 3 + 2] += (hz - pts[i * 3 + 2]) * k; }
      scale = 1 - k; build(); mesh.material.opacity = 1 - k;
    }, { order: 5, onEnd: () => { g.dispose(); mesh.material.dispose(); } }) };
    return S;
  }

  // flecha acertando: estilhaços de madeira, faíscas da cor do disparo, anel de choque e um clarão rápido
  arrowHit(x, y, z, color = 0xe8f6ff, dirX = 0, dirZ = 0, heavy = false) {
    const n = this.leve ? 4 : this.ultra ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 3.5;
      this.emit(x, y, z, Math.cos(a) * sp - dirX * 2, Math.random() * 2.5 + 0.5, Math.sin(a) * sp - dirZ * 2, i % 3 ? color : 0xffffff, 0.1 + Math.random() * 0.08, 0.28 + Math.random() * 0.2, 9, 2.5);
    }
    for (let i = 0; i < (this.leve ? 2 : 4); i++) this.emit(x, y, z, (Math.random() - 0.5) * 3 - dirX * 1.5, Math.random() * 2.2, (Math.random() - 0.5) * 3 - dirZ * 1.5, 0xc9a46a, 0.09, 0.45, 12, 1); // lascas de madeira
    const fl = this.spr(color, 1); fl.position.set(x, y, z); fl.scale.setScalar(heavy ? 1.6 : 1.05);
    const fw = this.spr(0xffffff, 1); fw.position.set(x, y, z); fw.scale.setScalar(heavy ? 0.7 : 0.45);
    const g = new THREE.Group(); g.add(fl, fw);
    this._add(g, 0.16, (f, k) => { fl.material.opacity = 1 - k; fw.material.opacity = 1 - k; const s = 1 + k * 0.8; fl.scale.setScalar((heavy ? 1.6 : 1.05) * s); }, { onEnd: () => { fl.material.dispose?.(); fw.material.dispose?.(); } });
    if (this.ultra || heavy) this.shock(x, y - 0.4, z, heavy ? 1.3 : 0.8, color, 0.22, 0.7);
  }

  // Aviso no chão: anel externo + preenchimento que cresce até o momento do impacto
  telegraphCircle(x, y, z, radius, dur, color = 0xff3b2f) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.geo.ring, this.addMat(color, 0.9, false));
    const fill = new THREE.Mesh(this.geo.disc, this.addMat(color, 0.28, false));
    ring.scale.set(radius, 1, radius);
    g.add(ring, fill);
    g.position.set(x, y + 0.1, z);
    return this._add(g, dur, (f, k) => { const s = radius * Math.max(0.02, k); fill.scale.set(s, 1, s); ring.material.opacity = 0.6 + 0.4 * Math.sin(k * 30); }, { order: 3 });
  }

  telegraphRect(x, y, z, yaw, length, width, dur, color = 0xff3b2f) {
    const g = new THREE.Group();
    const back = new THREE.Mesh(this.geo.plane, this.addMat(color, 0.18, false));
    const fill = new THREE.Mesh(this.geo.plane, this.addMat(color, 0.35, false));
    back.scale.set(width, 1, length); back.position.z = length / 2;
    fill.position.z = 0;
    g.add(back, fill);
    g.position.set(x, y + 0.12, z);
    g.rotation.y = yaw;
    return this._add(g, dur, (f, k) => { fill.scale.set(width, 1, Math.max(0.01, length * k)); fill.position.z = (length * k) / 2; }, { order: 3 });
  }

  // Explosão: clarão, bolas de fogo macias que crescem e sobem esfriando, fumaça escura, faíscas e onda no chão
  explosion(x, y, z, radius, color = 0xff7a2a, dur = 0.5) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const c0 = new THREE.Color(color), hot = c0.clone().lerp(new THREE.Color(0xfff2c8), 0.6), dark = c0.clone().lerp(new THREE.Color(0x3a0c04), 0.75);
    const flash = this.spr(0xffffff, 1); flash.position.y = 0.7; g.add(flash);
    const puffs = [], n = this.leve || this.mute ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const s = this.spr(i < 2 ? hot : c0, 1, 'puff'); s.material.rotation = Math.random() * 6.28;
      const a = Math.random() * 6.28, r = radius * 0.3 * Math.random(), out = radius * (0.25 + Math.random() * 0.45);
      puffs.push({ s, x0: Math.cos(a) * r, z0: Math.sin(a) * r, dx: Math.cos(a) * out, dz: Math.sin(a) * out, y0: 0.35 + Math.random() * 0.5, up: 0.8 + Math.random() * 1.6, sz: radius * (0.55 + Math.random() * 0.5), d: 0.75 + Math.random() * 0.5, rot: (Math.random() - 0.5) * 2 });
      g.add(s);
    }
    const T = Math.max(0.5, dur) * 1.25;
    for (let i = 0; i < (this.leve ? 4 : 7); i++) { const a = Math.random() * 6.28, r = radius * 0.35 * Math.random(); this.smoke(x + Math.cos(a) * r, y + 0.5 + Math.random() * 0.6, z + Math.sin(a) * r, Math.cos(a) * radius * 0.5, 1 + Math.random() * 1.4, Math.sin(a) * radius * 0.5, Math.random() < 0.5 ? 0x4a433d : 0x6a625a, radius * (0.55 + Math.random() * 0.35), 0.9 + Math.random() * 0.7, 1.9, 0.42); }
    this.burst({ x, y: y + 0.6, z }, { count: this.leve ? 12 : 22, speed: radius * 3.2, color: [hot.getHex(), color, 0xffd36b], size: 0.26, life: 0.7, gravity: 10, up: 4, drag: 1 });
    this.shock(x, y, z, radius * 1.2, c0.getHex(), 0.3, 0.55);
    return this._add(g, T, (f) => {
      const t = f.t, kf = Math.min(1, t / 0.16);
      flash.scale.setScalar(radius * (0.9 + 1.0 * kf)); flash.material.opacity = 0.8 * Math.max(0, 1 - kf);
      for (const P of puffs) {
        const k = Math.min(1, t / (T * P.d)), e = 1 - Math.pow(1 - k, 3);
        P.s.position.set(P.x0 + P.dx * e, P.y0 + P.up * e + k * k * 0.8, P.z0 + P.dz * e);
        P.s.scale.setScalar(P.sz * (0.35 + 0.85 * e));
        P.s.material.opacity = k < 0.1 ? 1 : Math.pow(1 - k, 1.6);
        P.s.material.color.copy(hot).lerp(c0, Math.min(1, k * 2.2)).lerp(dark, Math.max(0, k * 1.4 - 0.4));
        P.s.material.rotation += P.rot * 0.016;
      }
    }, { order: 5 });
  }

  beam(x, y, z, color, height = 12, dur = 1.2, radius = 1) {
    const m = new THREE.Mesh(this.geo.beam, this.addMat(color, 0.6));
    m.position.set(x, y, z);
    m.material.fog = false;
    return this._add(m, dur, (f, k) => { m.scale.set(radius * (1 - k * 0.6), height * Math.min(1, k * 4), radius * (1 - k * 0.6)); m.material.opacity = 0.6 * (1 - k); });
  }

  dome(target, radius, color, dur) {
    const m = new THREE.Mesh(this.geo.dome, this.addMat(color, 0.25));
    return this._add(m, dur, (f, k) => {
      m.position.set(target.x, target.y, target.z);
      const s = radius * (k < 0.1 ? k * 10 : 1);
      m.scale.set(s, s * 0.95, s);
      m.material.opacity = 0.25 * (k > 0.85 ? (1 - k) / 0.15 : 1) * (0.8 + Math.sin(f.t * 12) * 0.2);
    });
  }

  shards(x, y, z, radius, color = 0x9fe8ff, dur = 2.5) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(this.geo.shard, this.addMat(color, 0.75, false));
      const a = (i / 9) * Math.PI * 2, r = radius * (0.4 + Math.random() * 0.6);
      s.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
      s.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      g.add(s);
    }
    g.position.set(x, y, z);
    return this._add(g, dur, (f, k) => { g.scale.setScalar(k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1); });
  }

  // feixe persistente de saque (removido manualmente)
  lootBeam(x, y, z, color) {
    const m = new THREE.Mesh(this.geo.beam, this.addMat(color, 0.35));
    m.material.fog = false;
    m.position.set(x, y, z);
    m.scale.set(0.5, 9, 0.5);
    this.scene.add(m);
    return m;
  }

  // ---------- efeitos de chão e de impacto ----------
  gy(x, z, y) { return this.ground ? this.ground(x, z) : y; }

  // Rachaduras no chão: linhas quebradas que brilham e apagam devagar, seguindo o relevo.
  // dirs: lista de ângulos (yaw) das rachaduras principais; len: comprimento.
  cracks(x, y, z, dirs, len, color = 0xffb04a, dur = 2.6, width = 0.22) {
    const dark = [], glow = [];
    const quad = (arr, ax, az, bx, bz, w) => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * w, nz = (dx / l) * w;
      const ya = this.gy(ax, az, y) + 0.07, yb = this.gy(bx, bz, y) + 0.07;
      arr.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx - nx, yb, bz - nz, bx + nx, yb, bz + nz);
    };
    const branch = (sx, sz, a, L, w, depth) => {
      let px = sx, pz = sz;
      const n = Math.max(3, Math.round(L / 0.6));
      for (let i = 1; i <= n; i++) {
        a += (Math.random() - 0.5) * 0.9;
        const t = i / n, ww = w * (1 - t * 0.75);
        const qx = sx + Math.sin(a) * L * t + (Math.random() - 0.5) * 0.25, qz = sz + Math.cos(a) * L * t + (Math.random() - 0.5) * 0.25;
        quad(dark, px, pz, qx, qz, ww * 1.25);
        quad(glow, px, pz, qx, qz, ww * 0.4);
        if (depth < 1 && Math.random() < 0.2) branch(qx, qz, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), L * (1 - t) * 0.6, ww * 0.8, depth + 1);
        px = qx; pz = qz;
      }
    };
    for (const a of dirs) branch(x, z, a, len * (0.75 + Math.random() * 0.4), width, 0);
    const mk = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
    const gd = mk(dark), gg = mk(glow);
    const md = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0x0a0604), 0.72), transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const mg = this.addMat(color, 1);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(gd, md), new THREE.Mesh(gg, mg));
    grp.children[1].renderOrder = 4;
    return this._add(grp, dur, (f, k) => {
      const grow = Math.min(1, k * 9);                  // a rachadura "corre" pelo chão
      gd.setDrawRange(0, Math.floor((dark.length / 3) * grow)); gg.setDrawRange(0, Math.floor((glow.length / 3) * grow));
      md.opacity = 0.45 * (k > 0.6 ? (1 - k) / 0.4 : 1);
      mg.opacity = Math.max(0, 1 - k * 1.6) * (0.85 + Math.sin(f.t * 30) * 0.15);
    }, { order: 3, onEnd: () => { gd.dispose(); gg.dispose(); md.dispose(); } });
  }

  // Marca queimada no chão (meteoro, bola de fogo): disco escuro com borda em brasa que esfria
  scorch(x, y, z, radius, ember = 0xff6a20, dur = 6) {
    // marca macia e irregular (textura), sem borda dura de disco; as brasas apagam rápido e a marca some devagar
    const g = new THREE.Group();
    const dm = new THREE.MeshBasicMaterial({ map: this.softTex('scorch'), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const disc = new THREE.Mesh(this.geo.plane, dm); disc.scale.set(radius * 2.4, 1, radius * 2.4);
    const em = new THREE.MeshBasicMaterial({ map: this.softTex('ember'), color: ember, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
    const glow = new THREE.Mesh(this.geo.plane, em); glow.scale.set(radius * 2.1, 1, radius * 2.1); glow.position.y = 0.01;
    g.add(disc, glow);
    g.position.set(x, this.gy(x, z, y) + 0.05, z);
    g.rotation.y = Math.random() * 6;
    return this._add(g, dur, (f, k) => {
      dm.opacity = 0.72 * Math.min(1, f.t / 0.12) * (k > 0.45 ? Math.max(0, (1 - k) / 0.55) : 1);
      const heat = Math.max(0, 1 - f.t / Math.min(1.6, dur * 0.45));
      em.opacity = heat * heat * (0.8 + Math.sin(f.t * 11) * 0.2);
      if (heat > 0.2 && Math.random() < 0.35) { const a = Math.random() * 6.28, r = Math.random() * radius * 0.8; this.emit(x + Math.cos(a) * r, g.position.y + 0.1, z + Math.sin(a) * r, 0, 1 + Math.random(), 0, ember, 0.14, 0.7, -0.5, 1); }
    }, { order: 3, onEnd: () => { dm.dispose(); em.dispose(); } });
  }

  // Pedaços de rocha/terra que voam e caem quicando
  debris(x, y, z, count = 8, color = 0x7a6a55, power = 6) {
    if (this.mute) return null;
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const g = new THREE.Group();
    const bits = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo.rock, mat);
      const s = 0.6 + Math.random() * 1.4; m.scale.setScalar(s);
      const a = Math.random() * 6.28, sp = power * (0.4 + Math.random() * 0.7);
      bits.push({ m, x: x + Math.cos(a) * 0.4, y: y + 0.3, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp * 0.6, vy: sp * (0.8 + Math.random() * 0.6), vz: Math.sin(a) * sp * 0.6, r: Math.random() * 6 });
      g.add(m);
    }
    let last = 0;
    return this._add(g, 1.4, (f, k) => {
      const dt = f.t - last; last = f.t;
      for (const b of bits) {
        b.vy -= 22 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.r += dt * 8;
        const gy = this.gy(b.x, b.z, y);
        if (b.y < gy + 0.1) { b.y = gy + 0.1; b.vy = Math.abs(b.vy) * 0.3; b.vx *= 0.6; b.vz *= 0.6; }
        b.m.position.set(b.x, b.y, b.z); b.m.rotation.set(b.r, b.r * 0.7, 0);
        if (k > 0.75) b.m.scale.setScalar(Math.max(0.01, b.m.scale.x * 0.9));
      }
    }, { onEnd: () => mat.dispose() });
  }

  // Poeira que se espalha rente ao chão
  dust(x, y, z, radius, color = 0xb8a68a, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, s = radius * (1.2 + Math.random());
      this.emit(x + Math.cos(a) * 0.3, y + 0.25, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.6 + Math.random(), Math.sin(a) * s, color, 0.9 + Math.random() * 0.6, 0.7 + Math.random() * 0.4, -0.3, 3.2);
    }
  }

  // Onda de choque: anel fino e rápido
  shock(x, y, z, radius, color = 0xffffff, dur = 0.35, op = 0.85) {
    const m = new THREE.Mesh(this.geo.plane, new THREE.MeshBasicMaterial({ map: this.softTex('ring'), color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, this.gy(x, z, y) + 0.15, z);
    return this._add(m, dur, (f, k) => { const s = radius * 2 * (0.15 + 0.85 * Math.pow(k, 0.6)); m.scale.set(s, 1, s); m.material.opacity = op * Math.pow(1 - k, 1.3); });
  }

  // Rastro de vento: linha fina (1 px) que segue o projétil e some aos poucos
  streak(color = 0xffffff, n = 14) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { const k = 1 - i / (n - 1); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; line.renderOrder = 5;
    this.scene.add(line);
    const S = { line, n, filled: 0, push: (x, y, z) => {
      pos.copyWithin(3, 0, (n - 1) * 3);
      pos[0] = x; pos[1] = y; pos[2] = z;
      if (S.filled < n) { for (let i = S.filled; i < n; i++) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; } S.filled++; }
      g.attributes.position.needsUpdate = true;
    }, end: () => {
      // a linha encolhe até a ponta e some
      const fx = this._add(line, 0.18, (f, k) => {
        const hx = pos[0], hy = pos[1], hz = pos[2];
        for (let i = 1; i < n; i++) { pos[i * 3] += (hx - pos[i * 3]) * k; pos[i * 3 + 1] += (hy - pos[i * 3 + 1]) * k; pos[i * 3 + 2] += (hz - pos[i * 3 + 2]) * k; }
        g.attributes.position.needsUpdate = true;
        line.material.opacity = 1 - k;
      }, { order: 5, onEnd: () => g.dispose() });
      return fx;
    } };
    return S;
  }

  // Flecha caindo do céu (Chuva de Flechas): risco fino, crava no chão e levanta poeira
  fallingArrow(x, z, color = 0xd8f07a) {
    const gy = this.gy(x, z, 0);
    const m = this.projectileMesh('flecha', color);
    m.rotation.x = Math.PI / 2; // aponta para baixo
    const U = this.ultra;
    const st = this.streak(U ? color : 0xeefad0, U ? 14 : 8);
    const h0 = 14 + Math.random() * 4, fall = 0.32;
    let landed = false;
    return this._add(m, fall + (U ? 1.8 : 1.1), (f, k) => {
      const t = f.t;
      if (t < fall) {
        const y = gy + h0 * (1 - t / fall) + 0.4;
        m.position.set(x + (1 - t / fall) * 1.2, y, z + (1 - t / fall) * 0.6);
        st.push(m.position.x, m.position.y + 0.45, m.position.z);
        if (U && Math.random() < 0.7) this.emit(m.position.x, m.position.y + 0.3, m.position.z, 0, 2, 0, color, 0.24, 0.18, 0, 2);
      } else if (!landed) {
        landed = true;
        m.position.set(x, gy + 0.25, z);
        m.rotation.z = (Math.random() - 0.5) * 0.4;
        st.end();
        this.burst({ x, y: gy + 0.1, z }, { count: 5, color: [0xb8a68a, 0xffffff], speed: 2.5, size: 0.3, life: 0.35, gravity: 8, up: 1.5 });
        if (U) { // impacto: anel de choque da cor da flecha, faíscas e terra levantando
          this.shock(x, gy, z, 1.1, color, 0.3);
          this.burst({ x, y: gy + 0.2, z }, { count: 7, color: [color, 0xffffff], speed: 3.5, size: 0.14, life: 0.4, gravity: 10, up: 2.5 });
          this.dust(x, gy, z, 0.6, 0xb8a68a, 4);
        }
      } else if (k > 0.8) m.scale.setScalar(Math.max(0.01, (1 - k) / 0.2));
    });
  }

  // Meteoro: rocha em brasa caindo do céu com cauda de fogo
  // bola de magia que cai do céu (Meteoro do mago): núcleo branco, corpo rosa, chamas e anel girando
  skyOrb(color = 0xff4fd8) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo.sphere, this.addMat(0xffffff, 1)); core.scale.setScalar(0.55);
    const body = new THREE.Mesh(this.geo.sphere, this.addMat(color, 0.85)); body.scale.setScalar(0.95);
    const fire = new THREE.Mesh(this.geo.sphere, this.addMat(0xffa040, 0.45)); fire.scale.setScalar(1.3);
    const halo = new THREE.Mesh(this.geo.sphere, this.addMat(color, 0.22)); halo.scale.setScalar(2.1);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 14, 1, true).translate(0, 3.5, 0), this.addMat(color, 0.35));
    const tail2 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 5, 10, 1, true).translate(0, 2.5, 0), this.addMat(0xffe0f4, 0.5));
    const ring = new THREE.Mesh(this.geo.ring, this.addMat(0xffd0f0, 0.8)); ring.scale.setScalar(1.6);
    g.add(halo, fire, body, core, tail, tail2, ring);
    g.userData = { tail, tail2, ring, fire };
    this.scene.add(g);
    return g;
  }

  meteorMesh(color = 0xff4fd8) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: 0x3a2a2a, emissive: new THREE.Color(0xff5a1a).multiplyScalar(0.6), flatShading: true }));
    const shell = new THREE.Mesh(this.geo.sphere, this.addMat(0xffa040, 0.55)); shell.scale.setScalar(1.05);
    const halo = new THREE.Mesh(this.geo.sphere, this.addMat(color, 0.3)); halo.scale.setScalar(1.7);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 12, 1, true).translate(0, 3, 0), this.addMat(0xff8a3a, 0.4));
    g.add(rock, shell, halo, tail);
    g.userData = { rock, tail };
    this.scene.add(g);
    return g;
  }

  // materiais das flechas por cor (reaproveitados: não são descartados quando a flecha some)
  arrowMats(c) {
    this._am ||= new Map();
    let M = this._am.get(c);
    if (!M) {
      const col = new THREE.Color(c);
      // madeira e aço recebem luz (antes eram chapados); a ponta brilha um pouco da cor do disparo
      M = { shaft: new THREE.MeshLambertMaterial({ color: 0xb98a52, emissive: 0x2a1a0a }),
        head: new THREE.MeshPhongMaterial({ color: new THREE.Color(0xd9e2ea).lerp(col, 0.25), emissive: col.clone().multiplyScalar(0.25), specular: 0xffffff, shininess: 90 }),
        vane: new THREE.MeshLambertMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.3), emissive: col.clone().multiplyScalar(0.3), side: THREE.DoubleSide }), glow: this.addMat(c, 0.6) };
      for (const m of Object.values(M)) m.userData.keep = true;
      this._am.set(c, M);
    }
    return M;
  }

  projectileMesh(kind, color) {
    const g = new THREE.Group();
    if (kind === 'flecha') {
      // flecha bonita: haste de madeira reta, ponta de aço larga, 3 penas da cor do disparo e um brilho na ponta
      const c = color ?? 0xd8f07a, M = this.arrowMats(c);
      g.add(new THREE.Mesh(this.geo.arrow, M.shaft), new THREE.Mesh(this.geo.arrowTip, M.head), new THREE.Mesh(this.geo.arrowNeck, M.head), new THREE.Mesh(this.geo.arrowGlow, M.glow));
      for (let k = 0; k < 3; k++) { const v = new THREE.Mesh(this.geo.arrowVane, M.vane); v.rotation.z = (k / 3) * Math.PI * 2; g.add(v); }
    } else if (kind === 'presente') {
      // presente: caixinha vermelha com fita dourada em cruz e laço (gira no ar)
      const ball = new THREE.Group();
      const box = new THREE.MeshLambertMaterial({ color: color ?? 0xd8283a, emissive: 0x2a0606, flatShading: true }), rib = new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x3a2a00, flatShading: true });
      ball.add(new THREE.Mesh(this.geo.gift ||= new THREE.BoxGeometry(0.7, 0.6, 0.7), box));
      const r1 = new THREE.Mesh(this.geo.giftR ||= new THREE.BoxGeometry(0.74, 0.64, 0.14), rib); ball.add(r1);
      const r2 = r1.clone(); r2.rotation.y = Math.PI / 2; ball.add(r2);
      for (const s of [-1, 1]) { const b = new THREE.Mesh(this.geo.giftB ||= new THREE.TorusGeometry(0.13, 0.05, 4, 8), rib); b.position.set(s * 0.12, 0.38, 0); b.rotation.y = Math.PI / 2; ball.add(b); }
      g.add(ball); g.userData = { ball };
    } else if (kind === 'neve') {
      // bola de neve: branca, cheia de calombos (gira no ar)
      const ball = new THREE.Group();
      const sm = new THREE.MeshLambertMaterial({ color: 0xf6faff, emissive: 0x1a2a3a, flatShading: true });
      ball.add(new THREE.Mesh(this.geo.snow ||= new THREE.IcosahedronGeometry(0.55, 1), sm));
      for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(this.geo.snowLump ||= new THREE.IcosahedronGeometry(0.2, 0), sm); const a = k * 2.4, b = k * 1.3; l.position.set(Math.cos(a) * Math.sin(b) * 0.46, Math.cos(b) * 0.46, Math.sin(a) * Math.sin(b) * 0.46); ball.add(l); }
      g.add(ball); g.userData = { ball };
    } else if (kind === 'cristal') {
      // pedra de gelo do Titã: cristal comprido azul com brilho
      const core = new THREE.Mesh(this.geo.iceShard ||= new THREE.OctahedronGeometry(0.42, 0).scale(0.7, 0.7, 1.7), new THREE.MeshLambertMaterial({ color: 0xcff2ff, emissive: 0x3aa8e8, flatShading: true }));
      const halo = new THREE.Mesh(this.geo.orb, this.addMat(color ?? 0x9fe8ff, 0.3)); halo.scale.setScalar(2.2);
      g.add(core, halo); g.userData = { flick: halo, fs: 2.2 };
    } else if (kind === 'pedra') {
      g.add(new THREE.Mesh(this.geo.rock, new THREE.MeshLambertMaterial({ color: 0x8b857b, flatShading: true })));
    } else {
      // magia viva: núcleo pequeno e firme, brilho macio da cor, véu de cor (mistura normal: não vira bola branca
      // em cima da grama clara) e faíscas girando em volta
      const c = color ?? 0xb88cff, fire = kind === 'fogo' || kind === 'chefe', col = new THREE.Color(c);
      const core = new THREE.Mesh(this.geo.orb, new THREE.MeshBasicMaterial({ color: fire ? 0xfff0b0 : col.clone().lerp(new THREE.Color(0xffffff), 0.5) }));
      core.scale.setScalar(fire ? 0.8 : 0.55);
      const glow = this.spr(fire ? 0xffa040 : c, 1); glow.scale.setScalar(fire ? 1.7 : 1.6);
      const tint = this.spr(fire ? 0xff4a10 : c, fire ? 0.55 : 0.62, 'glow', false); tint.scale.setScalar(fire ? 2.3 : 2.1);
      const spin = new THREE.Group();
      const n = fire ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, sp = this.spr(fire ? 0xffd070 : col.clone().lerp(new THREE.Color(0xffffff), 0.6), 1);
        sp.scale.setScalar(fire ? 0.42 : 0.32); sp.position.set(Math.cos(a) * (fire ? 0.5 : 0.4), Math.sin(a) * (fire ? 0.5 : 0.4), -0.1);
        spin.add(sp);
      }
      g.add(tint, glow, core, spin);
      g.userData = { spin, flick: glow, fs: glow.scale.x, fire };
    }
    this.scene.add(g);
    return g;
  }

  // Pré-compila os shaders dos efeitos ANTES de jogar: sem isso, o 1º golpe/explosão/anel de cada tipo
  // trava o celular por um instante (compilação de shader). Tudo nasce bem abaixo do chão e some sozinho.
  warmup(renderer, camera) {
    const y = -400, x = camera.position.x, z = camera.position.z;
    try {
      this.ring(x, y, z, 1, 0xffffff, 0.05); this.slash(x, y, z, 0, 2, 120, 0xffe2a0, 0.05); this.telegraphCircle(x, y, z, 1, 0.05); this.telegraphRect(x, y, z, 0, 2, 1, 0.05);
      this.explosion(x, y, z, 1, 0xff7a2a, 0.05); this.beam(x, y, z, 0xffffff, 2, 0.05); this.shards(x, y, z, 1, 0x9fe8ff, 0.05); this.cracks(x, y, z, [0], 1, 0xffb04a, 0.05);
      this.scorch(x, y, z, 1, 0xff6a20, 0.05); this.shock(x, y, z, 1, 0xffffff, 0.05);
      const tmp = [this.lootBeam(x, y, z, 0xffffff)];
      for (const k of ['flecha', 'neve', 'pedra', 'fogo', 'magia', 'cristal', 'presente']) { const m = this.projectileMesh(k, 0x9fe8ff); m.position.set(x, y, z); this.scene.add(m); tmp.push(m); }
      renderer.compile(this.scene, camera);
      for (const m of tmp) this.scene.remove(m);
    } catch { /* aquecimento é opcional */ }
  }

  remove(obj) {
    if (!obj) return;
    this.scene.remove(obj);
    obj.traverse?.((m) => { if (m.material && m.material !== this.pmat && !m.material.userData?.keep) m.material.dispose?.(); });
  }

  update(dt, camera) {
    if (camera) this.camera = camera;
    // partículas
    const p = this.p;
    let lo = MAXP, hi = -1; // faixa mexida neste quadro: só ela sobe para a placa de vídeo
    for (let i = 0; i < MAXP; i++) {
      if (p.life[i] <= 0) { if (p.alpha[i] !== 0) { p.alpha[i] = 0; p.size[i] = 0; if (i < lo) lo = i; if (i > hi) hi = i; } continue; }
      if (i < lo) lo = i; if (i > hi) hi = i;
      p.life[i] -= dt;
      const k = Math.max(0, p.life[i] / p.max[i]);
      const d = Math.max(0, 1 - p.drag[i] * dt);
      p.vel[i * 3] *= d; p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * d - p.grav[i] * dt; p.vel[i * 3 + 2] *= d;
      p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      p.alpha[i] = k < 0.5 ? k * 2 : 1;
      p.size[i] = p.s0[i] * (0.4 + 0.6 * k);
    }
    const ga = this.points.geometry.attributes;
    if (hi >= lo) {
      for (const [a, n] of [[ga.position, 3], [ga.color, 3], [ga.size, 1], [ga.alpha, 1]]) {
        a.clearUpdateRanges(); a.addUpdateRange(lo * n, (hi - lo + 1) * n); a.needsUpdate = true;
      }
    }
    this.pmat.uniforms.scale.value = window.innerHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    // fumaça: sobe devagar, cresce e some
    const S = this.s; let slo = S.n, shi = -1;
    for (let i = 0; i < S.n; i++) {
      if (S.life[i] <= 0) { if (S.alpha[i] !== 0) { S.alpha[i] = 0; S.size[i] = 0; if (i < slo) slo = i; if (i > shi) shi = i; } continue; }
      if (i < slo) slo = i; if (i > shi) shi = i;
      S.life[i] -= dt;
      const k = 1 - Math.max(0, S.life[i] / S.max[i]), d = Math.max(0, 1 - 1.6 * dt);
      S.vel[i * 3] *= d; S.vel[i * 3 + 1] = S.vel[i * 3 + 1] * d + 0.5 * dt; S.vel[i * 3 + 2] *= d;
      S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
      S.size[i] = S.s0[i] * (0.5 + (S.grow[i] - 0.5) * Math.sqrt(k));
      S.alpha[i] = S.a0[i] * (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.4));
    }
    if (shi >= slo) {
      const sa = this.smokePts.geometry.attributes;
      for (const [a, n] of [[sa.position, 3], [sa.color, 3], [sa.size, 1], [sa.alpha, 1]]) { a.clearUpdateRanges(); a.addUpdateRange(slo * n, (shi - slo + 1) * n); a.needsUpdate = true; }
    }
    this.smat.uniforms.scale.value = this.pmat.uniforms.scale.value;
    if (!this.smat.uniforms.map.value) this.smat.uniforms.map.value = this.softTex('puff');
    // malhas
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update?.(f, k);
      if (k >= 1 || f.done) {
        this.remove(f.mesh);
        f.onEnd?.();
        this.active.splice(i, 1);
      }
    }
  }

  clearAll() {
    for (const f of this.active) this.remove(f.mesh);
    this.active.length = 0;
    this.p.life.fill(0);
    this.s.life.fill(0);
  }
}
