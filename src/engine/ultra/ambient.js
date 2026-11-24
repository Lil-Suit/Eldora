// =============================================================
// Ultra realismo — partículas de ambiente, leves: UM desenho só, tudo calculado na placa de vídeo
// (nenhuma conta por partícula no processador). Cada tipo vive numa caixa que acompanha a câmera.
//   0 poeira/pólen brilhando contra o sol · 1 vaga-lumes à noite · 2 folhas caindo · 3 neve
//   4 brasas subindo · 5 esporos flutuando (Ermos/pântano)
// O atmos.js decide quanto de cada tipo aparece (weights) pelo lugar, hora e tempo.
// =============================================================
import * as THREE from 'three';

const T = 6;
// por tipo: tamanho da caixa (m), tamanho da partícula (m), velocidade (x, y, z), balanço
const BOX = [22, 34, 30, 40, 26, 30];
const SIZE = [0.045, 0.13, 0.16, 0.07, 0.06, 0.09];
const VEL = [[0.15, 0.04, 0.1], [0.1, 0.05, 0.08], [0.35, -0.75, 0.2], [0.3, -1.1, 0.15], [0.2, 1.3, 0.1], [0.06, 0.08, 0.05]];
const SWAY = [0.6, 1.4, 1.1, 0.5, 0.5, 0.7];

export class Ambient {
  constructor(G) {
    this.G = G; this.on = false;
    const per = G.isTouch ? 60 : 130, N = per * T;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
    let s = 4242; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) { sd.set([r(), r(), r(), (i % T) + r() * 0.98], i * 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    this.weights = new Float32Array(T);
    this.u = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBaseY: { value: 0 }, uW: { value: this.weights }, uPx: { value: 400 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uWind: { value: new THREE.Vector2() },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 },
    };
    const f = (a) => `float[${T}](${a.map((x) => x.toFixed(3)).join(', ')})`;
    const v3 = (a) => `vec3[${T}](${a.map((x) => `vec3(${x.map((y) => y.toFixed(3)).join(', ')})`).join(', ')})`;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, fog: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uBaseY; uniform float uW[${T}]; uniform float uPx; uniform vec2 uWind;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
        varying vec4 vCol; varying float vType; varying float vRot; varying float vA;
        #include <fog_pars_vertex>
        const float BOX[${T}] = ${f(BOX)}; const float SZ[${T}] = ${f(SIZE)}; const vec3 VEL[${T}] = ${v3(VEL)}; const float SW[${T}] = ${f(SWAY)};
        void main() {
          int ty = int(aSeed.w); float rr = fract(aSeed.w);
          vType = float(ty); vRot = 0.0;
          float w = uW[ty];
          float B = BOX[ty];
          vec3 v = VEL[ty] * (0.6 + 0.8 * aSeed.yzx);
          vec3 drift = v * uTime + vec3(uWind.x, 0.0, uWind.y) * uTime * (ty == 2 ? 0.25 : ty == 3 ? 0.18 : 0.04);
          float ph = aSeed.x * 40.0;
          vec3 sway = SW[ty] * vec3(sin(uTime * 0.7 + ph), sin(uTime * 0.9 + ph * 1.3) * 0.5, cos(uTime * 0.6 + ph * 0.7));
          vec3 base = vec3(uCam.x, ty == 1 || ty == 5 ? uBaseY + B * 0.06 : uCam.y, uCam.z);
          float H = ty == 1 ? 0.18 : ty == 5 ? 0.3 : 1.0; // vaga-lumes e esporos ficam perto do chão
          vec3 loc = mod(aSeed.xyz * B + drift + sway - base * vec3(1.0, 0.0, 1.0), B) - B * 0.5;
          loc.y *= H;
          vec3 wp = vec3(base.x, base.y, base.z) + loc;
          float edge = (1.0 - smoothstep(0.3, 0.5, abs(loc.x) / B)) * (1.0 - smoothstep(0.3, 0.5, abs(loc.z) / B)) * (1.0 - smoothstep(0.3, 0.5, abs(loc.y) / (B * H)));
          float vis = smoothstep(rr, rr + 0.15, w) * edge;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float dz = max(-mvPosition.z, 0.3);
          gl_PointSize = clamp(SZ[ty] * uPx / dz, 1.0, 40.0);
          vec3 vd = normalize(wp - cameraPosition);
          float mu = max(dot(vd, uSunDir), 0.0);
          vec3 c; float a = 1.0;
          if (ty == 0) { c = uSunCol * (0.04 + 1.6 * pow(mu, 10.0)) + uAmb * 0.05; a = 0.0; }                  // poeira: brilha contra o sol
          else if (ty == 1) { float bl = pow(max(sin(uTime * (0.8 + aSeed.y) + ph), 0.0), 6.0); c = vec3(0.75, 1.0, 0.25) * (0.15 + 3.5 * bl); a = 0.0; }
          else if (ty == 2) { c = mix(vec3(0.33, 0.42, 0.1), vec3(0.55, 0.36, 0.1), aSeed.z) * (uSunCol * 0.25 + uAmb * 0.3); vRot = uTime * (1.0 + aSeed.x * 2.0) + ph; }
          else if (ty == 3) { c = vec3(0.95, 0.97, 1.0) * (uSunCol * 0.3 + uAmb * 0.35); }
          else if (ty == 4) { float fl = 0.5 + 0.5 * sin(uTime * 9.0 + ph); c = vec3(1.0, 0.42, 0.1) * (1.2 + 2.0 * fl) * (1.0 - smoothstep(0.2, 0.5, loc.y / B + 0.25)); a = 0.0; }
          else { float bl = 0.5 + 0.5 * sin(uTime * 0.9 + ph); c = mix(vec3(0.55, 0.35, 1.0), vec3(0.4, 0.9, 0.7), aSeed.z) * (0.25 + 0.7 * bl); a = 0.0; }
          // perto demais da câmera some (não vira borrão na cara)
          vis *= smoothstep(0.6, 2.0, dz) * (ty == 0 ? 1.0 - smoothstep(8.0, 12.0, dz) : 1.0);
          vCol = vec4(c, a); vA = vis;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol; varying float vType; varying float vRot; varying float vA;
        #include <fog_pars_fragment>
        void main() {
          vec2 q = gl_PointCoord - 0.5; float m;
          if (vType > 1.5 && vType < 2.5) { // folha: elipse girando
            float c = cos(vRot), s = sin(vRot); vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
            m = smoothstep(0.25, 0.2, length(r * vec2(1.0, 2.2 + 1.2 * abs(sin(vRot * 0.7)))));
          } else { float d = length(q) * 2.0; m = vCol.a > 0.5 ? smoothstep(1.0, 0.6, d) : exp(-d * d * 5.0); }
          float k = m * vA; if (k < 0.004) discard;
          vec3 c = vCol.rgb * k;
          float a = vCol.a * k;
          #ifdef USE_FOG
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
            c = mix(c, fogColor * a, fogFactor);
          #endif
          gl_FragColor = vec4(c, a); // pré-multiplicado: brilhos somam, folhas/neve cobrem
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 4; this.points.visible = false; this.points.name = 'ambiente-ultra';
    G.scene.add(this.points);
  }

  enable() { this.on = true; }
  disable() { this.on = false; this.points.visible = false; }

  update(dt, camera, baseY) {
    if (!this.on) return;
    const u = this.u, G = this.G, sky = G.sky;
    if (!G.settings?.particles) { this.points.visible = false; return; } // partículas desligadas
    let any = 0; for (const w of this.weights) any = Math.max(any, w);
    this.points.visible = any > 0.01; // (na cripta também: poeira no ar)
    if (!this.points.visible) return;
    u.uTime.value += dt;
    u.uCam.value.copy(camera.position); u.uBaseY.value = baseY;
    const h = G.renderer.getDrawingBufferSize(this._v ||= new THREE.Vector2()).y;
    u.uPx.value = h * camera.projectionMatrix.elements[5] * 0.5;
    const L = sky.sun;
    u.uSunDir.value.copy(L.position).sub(L.target.position).normalize();
    u.uSunCol.value.copy(L.color).multiplyScalar(L.intensity);
    u.uAmb.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity);
    u.uWind.value.set(sky.wind.x, sky.wind.z);
  }
}
