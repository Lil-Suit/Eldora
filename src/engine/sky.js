import * as THREE from 'three';
import { smoothstep, clamp, lerp } from './noise.js';
import { PLATEAU } from '../config/world.js';
import { sunTrans, skyAverages, skyRadiance } from './ultra/skyfn.js';
import { buildUltraDome } from './ultra/skydome.js';

// Ciclo dia/noite, céu, luzes globais, neblina e clima localizado.
const K = (t, top, hor, fog, hs, hg, sc, si, hi) => ({ t, top: new THREE.Color(top), hor: new THREE.Color(hor), fog: new THREE.Color(fog), hs: new THREE.Color(hs), hg: new THREE.Color(hg), sc: new THREE.Color(sc), si, hi });
const KEYS = [
  K(0.0, 0x0a0f2c, 0x1c2550, 0x161c3a, 0x5a6aa8, 0x1e1e30, 0x9fb4ff, 0.75, 0.95),
  K(0.21, 0x181c4c, 0x5e4778, 0x433958, 0x7a76a8, 0x2a2432, 0xffb070, 0.45, 0.95),
  K(0.28, 0x4676bd, 0xffb37a, 0xe6b090, 0xb0c4e8, 0x5a4a3a, 0xffc58a, 1.7, 1.2),
  K(0.4, 0x4c98e6, 0xc2e4ff, 0xbcd9f0, 0xd2e8ff, 0x6a5a3a, 0xfff2dc, 2.7, 1.35),
  K(0.6, 0x4891df, 0xd0e6ff, 0xc4ddf2, 0xd8e8ff, 0x6a5a3a, 0xfff0d2, 2.6, 1.35),
  K(0.71, 0x585aa8, 0xff9e6c, 0xe2987c, 0xd0b0d4, 0x5a3a3a, 0xffa060, 1.55, 1.1),
  K(0.79, 0x262866, 0xa45a88, 0x5e4470, 0x7a68a8, 0x2a2030, 0xc07aa0, 0.6, 0.95),
  K(1.0, 0x0a0f2c, 0x1c2550, 0x161c3a, 0x5a6aa8, 0x1e1e30, 0x9fb4ff, 0.75, 0.95),
];

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5a3a, 1.3);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowMap || 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const S = this.shadowExtent = 40;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.35;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xbcd9f0, 60, quality.fogFar || 190);
    scene.fog = this.fog;
    this.fogFar = quality.fogFar || 190;
    this.uni = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bottom: { value: new THREE.Color(0x2a3a2a) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 },
      ultra: { value: 0 }, over: { value: 0 }, flash: { value: 0 },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform float ultra; uniform float over; uniform float flash; varying vec3 vDir;
        void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y,0.0,1.0), 0.55)) : mix(hor, bottom, clamp(-y*3.0,0.0,1.0));
          float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          float disc = smoothstep(0.9975, 0.9988, sd); float glow = pow(sd, 18.0) * 0.55 + pow(sd, 3.0)*0.12;
          if (ultra > 0.5) { // Ultra: halo grande do sol, coroa forte em volta do disco e o horizonte aceso do lado do sol
            glow += pow(sd, 7.0) * 0.2 + pow(sd, 120.0) * 1.0;
            c += sunCol * pow(1.0 - abs(y), 5.0) * pow(sd, 2.0) * 0.22 * (1.0 - night);
          }
          float sunVis = 1.0 - over * 0.85; // tempo fechado esconde o sol atrás das nuvens
          vec3 moonDir = -normalize(sunDir); float md = max(dot(normalize(vDir), moonDir), 0.0);
          float moon = smoothstep(0.9985, 0.9992, md) * night * (1.0 - over * 0.8);
          c += sunCol * (disc * (1.0-night) * 2.0 + glow * (1.0 - night*0.8)) * sunVis + vec3(0.85,0.9,1.0)*moon*1.4 + vec3(0.4,0.5,0.9)*pow(md,40.0)*night*0.25;
          c += vec3(0.75, 0.8, 1.0) * flash * (0.3 + max(y, 0.0) * 0.5); // relâmpago
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);
    // estrelas
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2, y = v;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 360, y * 360, Math.sin(th) * r * 360], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    // nuvens: 18 nuvens de 4 bolos cada, desenhadas DE UMA VEZ (antes eram 72 malhas = 72 "pinturas" por quadro)
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.9 });
    this.clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), cm, 18 * 4);
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    for (let i = 0; i < 18; i++) {
      const puffs = [];
      for (let j = 0; j < 4; j++) puffs.push({ x: j * 7 - 10, y: Math.random() * 2, z: Math.random() * 6 - 3, sx: 8 + Math.random() * 8, sy: 2.5 + Math.random() * 2, sz: 6 + Math.random() * 5 });
      this.cloudData.push({ x: Math.random() * 500 - 250, y: 85 + Math.random() * 25, z: Math.random() * 500 - 250, speed: 1.5 + Math.random() * 2, puffs });
    }
    this.placeClouds();
    scene.add(this.clouds);
    this.cloudMat = cm;
    // chuva
    const rn = quality.rainDrops || 1400;
    this.rain = null; this.buildRain(rn); // gotas no mundo de verdade: batem no chão (respingo) e na água (ondinha)
    this.splashRate = quality.ultra ? quality.splash ?? 110 : 0; // respingos e ondinhas na água só no Ultra realismo
    this.rainOff = false; // opção "Chuva" desligada: não chove para este jogador
    this.rainK = 0;
    this.storm = { x: 400, z: 0, cx: 0, cz: 0, vx: 0, vz: 0, r: 60, active: false, timer: 60 + Math.random() * 90 };
    this.indoor = false;
    this.tmp = { top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), sc: new THREE.Color() };
    this.night = 0;
    this.sunY = 1;
    this.quality = quality;
    this.rainN = rn;
    this.ultra = false; this.overK = 0; this.flash = 0; this.flash2 = 0; this.boltT = 6; this.cloudT = 0; this.splashAcc = 0;
    this.wind = { x: 2.5, z: 0.8 };
  }

  // ---------- Ultra realismo ----------
  // Liga/desliga: sombra grande e macia, nuvens de algodão, tempo fechando antes da chuva, relâmpagos,
  // chuva inclinada pelo vento com gotas que batem no chão (respingos) e na água (ondinhas).
  setUltra(ultra, q) {
    this.ultra = !!ultra;
    const touch = !!globalThis.__RIFT?.isTouch, sm = Math.min(q.shadowMap || 2048, touch ? (q.ultra ? 2048 : 1024) : 8192), S = q.shadowExtent || 40; // celular: sombra 2048 (4096 pesava muito)
    if (this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.shadowExtent = S;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.radius = ultra ? 3.2 : 1; // borda da sombra macia (mobs, árvores, casas)
    // Ultra: mapa de sombra bem fino (4096 em 120 m) → desvio pequeno: sombra colada no pé (sem "flutuar") e sem listras
    this.sun.shadow.bias = ultra ? -0.00025 : -0.0005;
    this.sun.shadow.normalBias = ultra ? 0.07 : 0.35;
    this.uni.ultra.value = ultra ? 1 : 0;
    // Ultra: céu físico (Rayleigh/Mie), sol de verdade, lua, estrelas cintilando, Via Láctea e nuvens altas
    if (ultra && !this.domeU) { this.domeMat0 = this.dome.material; this.domeU = buildUltraDome(); this.uU = this.domeU.uniforms; this.skyTint = new THREE.Color(1, 1, 1); this.groundAlbedo = new THREE.Color(0.2, 0.22, 0.12); }
    if (this.domeU) this.dome.material = ultra ? this.domeU : this.domeMat0;
    if (ultra && !this.softClouds) this.buildSoftClouds();
    this.splashRate = ultra ? q.splash ?? 260 : 0; // chuva realista (respingos no chão e ondinhas na água) só no Ultra realismo
    if (this.splashRate > 0 && !this.ripples) this.buildRipples();
    const n = q.rainDrops || 1400;
    if (n !== this.rainN) this.buildRain(n);
    if (!ultra) { this.overK = 0; this.flash = 0; this.uni.over.value = 0; this.uni.flash.value = 0; }
    this.setIndoor(this.indoor);
  }

  // Ultra leve: sem as nuvens (72 peças a menos para desenhar)
  setLeve(on) { this.leve = !!on; this.setIndoor(this.indoor); }

  // a câmera do Ultra leve enxerga só até a neblina: céu e estrelas encolhem para caber nesse alcance
  fitFar(far) {
    this.dome.scale.setScalar(Math.min(1, (far * 0.85) / 380));
    this.stars.scale.setScalar(Math.min(1, (far * 0.82) / 360));
    // nuvens também: aproximam da câmera (mesma direção, menor) para não serem cortadas com a visão curta
    this.cloudScale = Math.min(1, (far * 0.8) / 240);
  }

  buildRain(n) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain.material.dispose(); }
    this.rainN = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    let mat;
    {
      // cada gota: ponta clara embaixo, cauda que some em cima (risco afinando)
      const col = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) { const b = 0.7 + Math.random() * 0.3; col.set([0.8 * b, 0.87 * b, 0.97 * b, 0.95, 0.72 * b, 0.8 * b, 0.92 * b, 0.0], i * 8); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
      this.rainData = new Float32Array(n * 6); // x, y, z, chão, velocidade, água?
      for (let i = 0; i < n; i++) this.rainData[i * 6 + 1] = -1e9; // nasce no 1º quadro
    }
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = !this.indoor;
    this.scene.add(this.rain);
  }

  // nuvens macias: um só desenho (instâncias) de "algodões" virados para a câmera
  placeClouds() {
    const M = this._cm || (this._cm = new THREE.Matrix4()), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    let k = 0;
    for (const c of this.cloudData) for (const p of c.puffs) { M.compose(P.set(c.x + p.x, c.y + p.y, c.z + p.z), Q, S.set(p.sx, p.sy, p.sz)); this.clouds.setMatrixAt(k++, M); }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  buildSoftClouds() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const r = 16 + Math.random() * 26, px = 64 + (Math.random() - 0.5) * 56, py = 70 + (Math.random() - 0.5) * 34;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(cv);
    const CL = 34, PU = 9, N = CL * PU;
    this.cloudU = { map: { value: tex }, uT: { value: 0 }, lit: { value: new THREE.Color(1, 1, 1) }, shade: { value: new THREE.Color(0.7, 0.74, 0.82) }, over: this.uni.over, flash: this.uni.flash,
      sunV: { value: new THREE.Vector3(0, 1, 0) }, sunW: { value: new THREE.Vector3(0, 1, 0) }, sunC: { value: new THREE.Color(1, 1, 1) }, fogC: { value: new THREE.Color(1, 1, 1) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute float aSpeed; attribute float aSeed; uniform float uT; uniform vec3 sunW; varying vec2 vUv; varying float vA; varying float vSeed; varying float vMu; varying float vHz;
        void main(){ vec3 c = vec3(instanceMatrix[3]); float s = length(vec3(instanceMatrix[0]));
          c.x = mod(c.x + uT * aSpeed + 280.0, 560.0) - 280.0;
          vA = (1.0 - smoothstep(200.0, 275.0, abs(c.x))) * (1.0 - smoothstep(200.0, 275.0, abs(c.z)));
          vec4 wp = modelMatrix * vec4(c, 1.0); vec3 vd = normalize(wp.xyz - cameraPosition);
          vMu = dot(vd, sunW); vHz = smoothstep(0.02, 0.25, vd.y);
          vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * vec2(s * 1.7, s);
          gl_Position = projectionMatrix * mv; vUv = uv; vSeed = aSeed; }`,
      // nuvem "de verdade": volume falso pelo relevo da textura (lado do sol claro, lado de lá escuro),
      // borda prateada quando o sol está atrás dela, e some na névoa perto do horizonte
      fragmentShader: `uniform sampler2D map; uniform vec3 lit; uniform vec3 shade; uniform float over; uniform float flash; uniform vec3 sunV; uniform vec3 sunC; uniform vec3 fogC;
        varying vec2 vUv; varying float vA; varying float vSeed; varying float vMu; varying float vHz;
        void main(){ float a0 = texture2D(map, vUv).a; float a = a0 * vA * step(vSeed, 0.55 + over * 0.45) * (0.8 + over * 0.2);
          if (a < 0.01) discard;
          float ax = texture2D(map, vUv + vec2(0.03, 0.0)).a, ay = texture2D(map, vUv + vec2(0.0, 0.03)).a;
          vec3 n = normalize(vec3((a0 - ax) * 7.0, (a0 - ay) * 7.0 + 0.25, 0.55));
          float ndl = clamp(dot(n, normalize(sunV)) * 0.5 + 0.5, 0.0, 1.0);
          float dens = smoothstep(0.0, 0.5, a0);
          float silver = pow(max(vMu, 0.0), 5.0) * (1.0 - dens) * 2.5;
          vec3 col = mix(shade, lit, smoothstep(0.1, 0.9, vUv.y) * 0.45 + ndl * 0.55) + sunC * (ndl * ndl * 0.35 + silver) * (1.0 - over * 0.8);
          col = mix(fogC, col, 0.35 + 0.65 * vHz) + flash * vec3(0.55, 0.6, 0.75);
          gl_FragColor = vec4(col, a * (0.55 + 0.45 * vHz));
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const speed = new Float32Array(N), seed = new Float32Array(N);
    const m = new THREE.InstancedMesh(geo, mat, N), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
    for (let c = 0; c < CL; c++) {
      const cx = Math.random() * 540 - 270, cy = 92 + Math.random() * 30, cz = Math.random() * 540 - 270, sp = 1.4 + Math.random() * 2.2, sd = Math.random();
      for (let k = 0; k < PU; k++) {
        const i = c * PU + k, s = 12 + Math.random() * 16;
        P.set(cx + (Math.random() - 0.5) * 34, cy + Math.random() * 6 - (k % 3 === 0 ? 2 : 0), cz + (Math.random() - 0.5) * 18);
        m.setMatrixAt(i, M.compose(P, Q, Sc.set(s, s, s)));
        speed[i] = sp; seed[i] = Math.min(0.99, sd + (k > 6 ? 0.25 : 0)); // nuvem inteira some/aparece junto
      }
    }
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    m.frustumCulled = false; m.renderOrder = -5;
    this.softClouds = m;
    this.scene.add(m);
  }

  // ondinhas de gota na água (um só desenho, 280 anéis reaproveitados)
  buildRipples() {
    const N = 280;
    const m = new THREE.InstancedMesh(new THREE.RingGeometry(0.86, 1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.renderOrder = 3;
    const a = m.instanceMatrix.array;
    for (let i = 0; i < N; i++) a.set([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, -999, 0, 1], i * 16);
    this.ripples = m; this.ripLife = new Float32Array(N); this.ripMax = new Float32Array(N); this.ripNext = 0; this.ripActive = 0;
    this.scene.add(m);
  }

  ripple(x, y, z, size) {
    if (!this.ripples) return;
    const i = this.ripNext; this.ripNext = (i + 1) % this.ripLife.length;
    if (this.ripLife[i] <= 0) this.ripActive++;
    this.ripLife[i] = 0.75; this.ripMax[i] = size; const a = this.ripples.instanceMatrix.array, o = i * 16;
    a[o + 12] = x; a[o + 13] = y + 0.04; a[o + 14] = z;
  }
  splash(x, y, z, water) {
    if (water) {
      this.ripple(x, y, z, 0.42);
      if (Math.random() < 0.6) this.fx?.emit(x, y + 0.05, z, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 0xd6ecff, 0.08, 0.22, 10, 1);
    } else if (this.fx) {
      // gotícula batendo no chão: coroinha de 3–4 gotinhas que pulam e um anelzinho de poça
      const n = 3 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * 6.28, s = 0.6 + Math.random() * 0.9;
        this.fx.emit(x, y + 0.05, z, Math.cos(ang) * s, 1.5 + Math.random() * 1.4, Math.sin(ang) * s, 0xd8e8ff, 0.09, 0.26 + Math.random() * 0.12, 11, 1);
      }
      if (Math.random() < 0.35) this.ripple(x, y + 0.02, z, 0.2);
    }
  }

  updateRipples(dt) {
    if (!this.ripples || !this.ripActive) return;
    const a = this.ripples.instanceMatrix.array, c = this.ripples.instanceColor.array, L = this.ripLife;
    for (let i = 0; i < L.length; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      const o = i * 16;
      if (L[i] <= 0) { a[o] = a[o + 10] = 0; a[o + 13] = -999; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0; this.ripActive--; continue; }
      const k = 1 - L[i] / 0.75, s = 0.05 + Math.sqrt(k) * (this.ripMax[i] || 0.42), f = (1 - k) * (1 - k) * 0.45;
      a[o] = s; a[o + 10] = s;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f;
    }
    this.ripples.instanceMatrix.needsUpdate = true; this.ripples.instanceColor.needsUpdate = true;
  }

  updateRainUltra(dt, camera, rk) {
    const rd = this.rainData, pa = this.rain.geometry.attributes.position.array, n = this.rainN;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, wx = this.wind.x, wz = this.wind.z;
    const wY = this.waterY ? this.waterY() : null;
    this.splashAcc = Math.min(40, this.splashAcc + dt * (this.splashRate || 0) * rk);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      let x = rd[o], y = rd[o + 1], z = rd[o + 2];
      const sp = rd[o + 4];
      y -= sp * dt; x += wx * dt; z += wz * dt;
      const dx = x - cx, dz = z - cz;
      let re = false;
      if (y <= rd[o + 3]) {
        if (rk > 0.12 && this.splashAcc >= 1 && dx * dx + dz * dz < 900) { this.splashAcc--; this.splash(x, rd[o + 3], z, rd[o + 5] > 0.5); }
        re = true;
      } else if (dx > 28 || dx < -28 || dz > 28 || dz < -28) re = true;
      if (re) {
        x = cx + Math.random() * 56 - 28 - wx * 0.5; z = cz + Math.random() * 56 - 28 - wz * 0.5;
        let gh = this.ground ? this.ground(x, z) : cy - 8, w = 0;
        if (wY != null && wY > gh) { gh = wY; w = 1; }
        y = Math.max(gh, cy - 12) + 2 + Math.random() * 28;
        rd[o + 3] = gh; rd[o + 4] = 28 + Math.random() * 14; rd[o + 5] = w;
      }
      rd[o] = x; rd[o + 1] = y; rd[o + 2] = z;
      const L = 0.03; // risco = velocidade × 30 ms (um pouco de "motion blur")
      const p = i * 6;
      pa[p] = x; pa[p + 1] = y; pa[p + 2] = z;
      pa[p + 3] = x - wx * L; pa[p + 4] = y + rd[o + 4] * L; pa[p + 5] = z - wz * L;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    // ondinhas na água LONGE também (até ~70 m): a superfície toda do lago/rio fica "pipocando" com a chuva
    if (wY != null && this.splashRate > 0 && this.ground && rk > 0.12) {
      this.farAcc = Math.min(30, (this.farAcc || 0) + dt * this.splashRate * 0.9 * rk);
      for (let tries = 0; this.farAcc >= 1 && tries < 40; tries++) {
        const ang = Math.random() * 6.283, d = 12 + Math.sqrt(Math.random()) * 58;
        const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
        if (this.ground(x, z) < wY - 0.05) { this.farAcc--; this.ripple(x, wY, z, 0.4 + d * 0.012); }
      }
    }
  }

  sample(t) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t), 0, 1);
    const o = this.tmp;
    o.top.copy(a.top).lerp(b.top, k); o.hor.copy(a.hor).lerp(b.hor, k); o.fog.copy(a.fog).lerp(b.fog, k);
    o.hs.copy(a.hs).lerp(b.hs, k); o.hg.copy(a.hg).lerp(b.hg, k); o.sc.copy(a.sc).lerp(b.sc, k);
    o.si = lerp(a.si, b.si, k); o.hi = lerp(a.hi, b.hi, k);
    return o;
  }

  setIndoor(on) {
    this.indoor = on;
    this.dome.visible = !on; this.stars.visible = !on && !this.ultra; // Ultra: estrelas desenhadas no próprio céu
    this.clouds.visible = !on && !this.ultra && !this.leve; this.rain.visible = !on;
    if (this.softClouds) this.softClouds.visible = !on && this.ultra;
    if (this.ripples) this.ripples.visible = !on;
  }

  isRaining() { return this.rainK > 0.4; }

  // ---------- Ultra realismo: luz física ----------
  // Sol com a cor certa pela altura (o ar tira o azul perto do horizonte), luz do céu = média do céu de verdade,
  // luz rebatida do chão (cor do chão do mapa), lua azulada à noite, neblina com a cor do horizonte.
  updateUltra(dt, dir, lightDir, night, rk, ov, corrupt, camera) {
    const U = this.uU; if (!U) return;
    const sy = dir.y;
    const moon = (this._moon ||= new THREE.Vector3()).set(-dir.x, Math.max(0.35, -dir.y), -dir.z).normalize();
    U.uSunDir.value.copy(dir); U.uMoonDir.value.copy(moon);
    U.uNight.value = night; U.uOver.value = ov; U.uRain.value = rk; U.uCorrupt.value = corrupt; U.uFlash.value = this.flash;
    // céu na tela um pouco mais escuro que a conta física (mais ainda com o sol baixo): azul fundo em vez de
    // branco estourado, e o chão não fica "lavado". A luz do céu (hemisfério) continua com o valor cheio.
    const fK = lerp(1, lerp(0.5, 0.78, smoothstep(0.05, 0.7, sy)), 1 - night);
    U.uSkyTint.value.copy(this.skyTint).multiplyScalar(fK);
    U.uTime.value += dt;
    U.uCloudOff.value.x += this.wind.x * dt * 0.0009; U.uCloudOff.value.y += this.wind.z * dt * 0.0009;
    U.uCloudCov.value = lerp(0.6, 0.12, Math.max(ov, rk * 0.9));
    const S = this._S ||= { sun: null, moon: null, tint: [1, 1, 1] };
    S.sun = dir; S.moon = moon; S.night = night; S.over = ov; S.rain = rk; S.corrupt = corrupt;
    S.tint[0] = this.skyTint.r * fK; S.tint[1] = this.skyTint.g * fK; S.tint[2] = this.skyTint.b * fK;
    const sky = this._sk ||= [0, 0, 0], hor = this._hr ||= [0, 0, 0];
    skyAverages(S, sky, hor);
    // sol / lua
    const T = sunTrans(Math.max(sy, 0) + 0.01), mx = Math.max(T[0], T[1], T[2]);
    const sunUp = smoothstep(-0.05, 0.12, sy), moonK = smoothstep(-0.05, -0.24, sy);
    const wet = (1 - rk * 0.72) * (1 - ov * 0.6);
    const SUN_I = 4.1, MOON_I = 0.75;
    if (sy > -0.05) { this.sun.color.setRGB(T[0] / mx, T[1] / mx, T[2] / mx); this.sun.intensity = SUN_I * mx * sunUp * wet; }
    else { this.sun.color.setRGB(0.62, 0.72, 1.0); this.sun.intensity = MOON_I * moonK * (1 - rk * 0.6) * (1 - ov * 0.5); }
    if (lightDir.y < 0.14) { lightDir.y = 0.14; lightDir.normalize(); }
    // céu: irradiância ≈ π × radiância média (+ um pouco de rebatida múltipla)
    // (o céu de verdade é bem azul, mas a luz que chega na sombra também vem das nuvens, do chão e do ar: tira 40% da cor)
    const AMB = 0.9 * Math.PI / fK, nightFloor = night * 0.15, sl = (sky[0] * 0.2126 + sky[1] * 0.7152 + sky[2] * 0.0722) * 0.4;
    const hs = this.hemi.color.setRGB((sky[0] * 0.6 + sl) * AMB + nightFloor * 0.55, (sky[1] * 0.6 + sl) * AMB + nightFloor * 0.7, (sky[2] * 0.6 + sl) * AMB + nightFloor * 1.15);
    // chão: luz do sol + céu batendo no chão e voltando com a cor dele
    const sI = this.sun.intensity * Math.max(0.1, lightDir.y), ga = this.groundAlbedo;
    const sc = this.sun.color;
    this.hemi.groundColor.setRGB(ga.r * (sI * sc.r + hs.r * 0.6), ga.g * (sI * sc.g + hs.g * 0.6), ga.b * (sI * sc.b + hs.b * 0.6));
    this.hemi.intensity = 1 + this.flash * 2.2;
    // neblina: cor do horizonte (o pós soma o brilho do lado do sol)
    // (a névoa de longe é mais neutra que o horizonte puro: sem o "verde-oliva" do sol baixo)
    const hl = (hor[0] * 0.2126 + hor[1] * 0.7152 + hor[2] * 0.0722) * 0.3;
    this.fog.color.setRGB(hor[0] * 0.56 + hl + sky[0] * 0.2, hor[1] * 0.56 + hl + sky[1] * 0.2, hor[2] * 0.56 + hl + sky[2] * 0.2);
    // hora dourada: a névoa pega a cor do horizonte do lado do sol (rosado/dourado, como antes no pôr do sol)
    const gold = (1 - smoothstep(0.1, 0.5, sy)) * smoothstep(-0.06, 0.06, sy) * (1 - ov);
    if (gold > 0.01) {
      const hz = Math.hypot(dir.x, dir.z) || 1, ss = skyRadiance(dir.x / hz, 0.06, dir.z / hz, S, this._ss ||= [0, 0, 0]);
      const fl = this.fog.color.r * 0.2126 + this.fog.color.g * 0.7152 + this.fog.color.b * 0.0722, sl2 = ss[0] * 0.2126 + ss[1] * 0.7152 + ss[2] * 0.0722;
      const k = Math.min(1.15 * fl / Math.max(sl2, 1e-4), 1);
      this.fog.color.lerp(this._gc ||= new THREE.Color(), 0).lerp(this._gc.setRGB(ss[0] * k, ss[1] * k, ss[2] * k), gold * 0.6);
    }
    // nuvens (as de algodão e a camada alta)
    const cs = U.uCloudSun.value.setRGB(T[0], T[1], T[2]).multiplyScalar(2.6 * sunUp * (1 - ov * 0.9));
    cs.r += moonK * 0.05; cs.g += moonK * 0.06; cs.b += moonK * 0.09;
    const ca = U.uCloudAmb.value.setRGB(sky[0] * 1.9 + nightFloor * 0.2, sky[1] * 1.9 + nightFloor * 0.25, sky[2] * 1.9 + nightFloor * 0.4);
    ca.multiplyScalar(1 - ov * 0.45 - rk * 0.25); // tempestade: nuvem baixa e escura
    U.uSunE.value = 1 - night;
    if (this.cloudU) {
      this.cloudU.lit.value.copy(ca).multiplyScalar(1.05); this.cloudU.shade.value.copy(ca).multiplyScalar(0.62);
      this.cloudU.sunC.value.copy(cs); this.cloudU.fogC.value.setRGB(hor[0], hor[1], hor[2]);
      this.cloudU.sunW.value.copy(dir);
      if (camera) this.cloudU.sunV.value.copy(dir).transformDirection(camera.matrixWorldInverse);
    }
    // estado para o pós-processamento e a água
    const st = this.ultraState ||= { sunCol: new THREE.Color(), hor: new THREE.Color(), sky: new THREE.Color(), sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3() };
    st.sunCol.setRGB(T[0], T[1], T[2]).multiplyScalar(sunUp * (1 - ov * 0.85));
    st.hor.setRGB(hor[0], hor[1], hor[2]); st.sky.setRGB(sky[0], sky[1], sky[2]);
    st.sunDir.copy(dir); st.moonDir.copy(moon); st.night = night; st.sunUp = sunUp; st.moonK = moonK; st.over = ov; st.rain = rk; st.corrupt = corrupt;
  }

  update(dt, tod, focus, camera) {
    // posição do sol (tod: 0 meia-noite, 0.5 meio-dia)
    const ang = (tod - 0.25) * Math.PI * 2;
    const sy = Math.sin(ang);
    this.sunY = sy;
    const dir = new THREE.Vector3(Math.cos(ang) * 0.75, Math.max(sy, -1), 0.45).normalize();
    const night = this.night = 1 - smoothstep(-0.12, 0.16, sy);
    const lightDir = sy > -0.05 ? dir.clone() : new THREE.Vector3(-dir.x, Math.max(0.35, -dir.y), -dir.z).normalize();
    if (lightDir.y < 0.18) lightDir.y = 0.18, lightDir.normalize();
    const c = this.sample(tod);
    // tempestade localizada que atravessa o mapa
    const st = this.storm;
    st.timer -= dt;
    // a chuva nasce perto de onde você está (Vale, Ermos ou Confins), é larga e anda devagar: chove ~2 min seguidos
    if (!st.active && st.timer <= 0 && !this.indoor) {
      const a = Math.random() * Math.PI * 2;
      st.cx = focus.x; st.cz = focus.z;
      st.x = focus.x + Math.cos(a) * 230; st.z = focus.z + Math.sin(a) * 230;
      const tx = focus.x + (Math.random() - 0.5) * 80, tz = focus.z + (Math.random() - 0.5) * 80;
      const L = Math.hypot(tx - st.x, tz - st.z), sp = 1.8 + Math.random() * 0.6;
      st.vx = ((tx - st.x) / L) * sp; st.vz = ((tz - st.z) / L) * sp;
      st.active = true; st.r = 95 + Math.random() * 40;
    }
    if (st.active) {
      st.x += st.vx * dt; st.z += st.vz * dt;
      // mudou de mapa (longe demais) ou a tempestade já passou: termina
      if (Math.hypot(st.x - st.cx, st.z - st.cz) > 270 || Math.hypot(focus.x - st.cx, focus.z - st.cz) > 900) { st.active = false; st.timer = 90 + Math.random() * 150; }
    }
    const inStorm = st.active && !this.indoor && !this.rainOff ? 1 - smoothstep(st.r * 0.7, st.r, Math.hypot(focus.x - st.x, focus.z - st.z)) : 0;
    this.rainK += (inStorm - this.rainK) * Math.min(1, dt * 0.5);
    const rk = this.rainK;
    const gray = this._gray ||= new THREE.Color(0x7d8794);
    // Ultra: o tempo FECHA antes da chuva chegar (céu escurece aos poucos conforme a tempestade se aproxima) e relampeja
    let ov = 0;
    if (this.ultra) {
      const dS = st.active ? Math.hypot(focus.x - st.x, focus.z - st.z) : 1e9;
      const appr = st.active && !this.indoor ? 1 - smoothstep(st.r * 0.8, st.r + 150, dS) : 0;
      this.overK += (Math.max(appr * 0.85, rk) - this.overK) * Math.min(1, dt * 0.35);
      ov = this.overK;
      if (st.active) { this.wind.x += (st.vx * 1.1 + 1.2 - this.wind.x) * Math.min(1, dt * 0.2); this.wind.z += (st.vz * 1.1 + 0.5 - this.wind.z) * Math.min(1, dt * 0.2); }
      if (rk > 0.55 && !this.indoor) {
        this.boltT -= dt;
        if (this.boltT <= 0) { this.boltT = 8 + Math.random() * 14; this.flash = 0.9; this.flash2 = 0.11 + Math.random() * 0.08; this.onThunder?.(0.5 + Math.random() * 1.8); }
      }
      if (this.flash2 > 0) { this.flash2 -= dt; if (this.flash2 <= 0) this.flash = Math.max(this.flash, 0.75); } // pisca duas vezes
      this.flash = Math.max(0, this.flash - dt * 4.5);
      this.uni.over.value = ov; this.uni.flash.value = this.flash;
    }
    const dark = this._dark ||= new THREE.Color(0x4a525e);
    // região corrompida tinge a neblina de roxo
    const corrupt = 1 - smoothstep(30, 75, Math.hypot(focus.x - PLATEAU.x, focus.z - PLATEAU.z));
    const purple = new THREE.Color(0x5a2f7a);
    if (this.indoor) {
      this.scene.background = new THREE.Color(0x07060c);
      this.fog.color.set(0x14111e); this.fog.near = 18; this.fog.far = 78; // fortaleza grande: enxerga as salas
      this.hemi.color.set(0x8a7aba); this.hemi.groundColor.set(0x2a2236); this.hemi.intensity = 1.05;
      this.sun.color.set(0xa898c8); this.sun.intensity = 0.85;
      lightDir.set(0.3, 1, 0.4).normalize();
    } else {
      this.scene.background = null;
      this.uni.top.value.copy(c.top).lerp(gray, rk * 0.55).lerp(dark, ov * 0.5 * (1 - night * 0.6));
      this.uni.hor.value.copy(c.hor).lerp(gray, rk * 0.5).lerp(gray, ov * 0.35).lerp(purple, corrupt * 0.35);
      this.uni.sunDir.value.copy(dir);
      this.uni.sunCol.value.copy(c.sc);
      this.uni.night.value = night;
      this.fog.color.copy(c.fog).lerp(gray, rk * 0.6).lerp(gray, ov * 0.3).lerp(purple, corrupt * 0.3);
      const v = this.vista || 0; // no alto de um mirante a neblina abre e se vê longe
      this.fog.near = lerp(lerp(Math.min(55, this.fogFar * 0.6), 22, Math.max(rk * 0.8, corrupt * 0.25)), 120, v);
      this.fog.far = lerp(this.fogFar, this.fogFar * 0.6, Math.max(rk, corrupt * 0.2)) * (1 + v * 1.1);
      this.hemi.color.copy(c.hs).lerp(gray, rk * 0.4); this.hemi.groundColor.copy(c.hg);
      this.hemi.intensity = c.hi * (1 - rk * 0.25) * (1 - ov * 0.15) + this.flash * 1.5;
      this.sun.color.copy(c.sc); this.sun.intensity = c.si * (1 - rk * 0.6) * (1 - ov * 0.45);
      this.stars.material.opacity = night * (1 - rk);
      if (this.ultra && this.softClouds) {
        // nuvens de algodão: topo iluminado pelo sol/céu, base mais escura; tempo fechado = mais nuvens e mais cinzas
        this.cloudT += dt; this.cloudU.uT.value = this.cloudT;
        const L = this.cloudU.lit.value.setRGB(1, 1, 1).lerp(c.hor, 0.3).lerp(c.sc, 0.15).lerp(gray, Math.max(rk * 0.7, ov * 0.55));
        L.multiplyScalar(1 - night * 0.78);
        this.cloudU.shade.value.copy(L).multiplyScalar(0.68).lerp(dark, ov * 0.4);
        this.updateUltra(dt, dir, lightDir, night, rk, ov, corrupt, camera);
      } else {
        this.cloudMat.color.copy(new THREE.Color(0xffffff).lerp(c.hor, 0.35).lerp(gray, rk * 0.6));
        for (const cl of this.cloudData) {
          cl.x += cl.speed * dt;
          if (cl.x > 260) cl.x = -260;
        }
        if (this.clouds.visible) this.placeClouds();
      }
    }
    // sombras seguem o foco (com ajuste à grade de texels para evitar tremulação)
    const S = this.shadowExtent, texel = (2 * S) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 120, focus.y + lightDir.y * 120, fz + lightDir.z * 120);
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    const cs = this.cloudScale ?? 1;
    if (cs < 1 || this.clouds.scale.x !== 1) { this.clouds.scale.setScalar(cs); this.clouds.position.copy(camera.position).multiplyScalar(1 - cs); }
    // chuva ao redor da câmera
    this.rain.material.opacity = rk * (this.ultra ? 0.8 : 0.7);
    this.rain.visible = rk > 0.02 && !this.indoor; // sem chuva: nem desenha
    if (rk > 0.02 && !this.indoor) this.updateRainUltra(dt, camera, rk);
    this.updateRipples(dt);
    return { night, rain: rk, corrupt };
  }
}
