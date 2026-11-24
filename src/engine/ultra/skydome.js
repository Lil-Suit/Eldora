// =============================================================
// Ultra realismo — domo do céu: céu físico (skyfn), disco do sol com borda escurecida, lua, estrelas
// que cintilam, Via Láctea, e uma camada alta de nuvens (cirros/estratos) que fecha com a tempestade.
// =============================================================
import * as THREE from 'three';
import { SKY_GLSL, makeSkyUniforms } from './skyfn.js';

export const NOISE_GLSL = /* glsl */`
float uh21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float uh31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float uvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uh21(i), uh21(i + vec2(1.0, 0.0)), f.x), mix(uh21(i + vec2(0.0, 1.0)), uh21(i + vec2(1.0, 1.0)), f.x), f.y); }
float ufbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * uvn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(1.7, 9.2); a *= 0.5; } return s; }
float ufbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * uvn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(1.7, 9.2); a *= 0.5; } return s; }
`;

export function buildUltraDome() {
  const uniforms = Object.assign(makeSkyUniforms(), {
    uTime: { value: 0 }, uCloudOff: { value: new THREE.Vector2() }, uCloudCov: { value: 0.6 },
    uCloudSun: { value: new THREE.Color() }, uCloudAmb: { value: new THREE.Color() }, uSunE: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */`
      ${SKY_GLSL}
      ${NOISE_GLSL}
      uniform float uTime; uniform vec2 uCloudOff; uniform float uCloudCov; uniform vec3 uCloudSun; uniform vec3 uCloudAmb; uniform float uSunE;
      varying vec3 vDir;
      void main() {
        vec3 v = normalize(vDir);
        vec3 c = skyRadiance(vec3(v.x, max(v.y, 0.0), v.z));
        if (v.y < 0.0) c *= mix(1.0, 0.6, smoothstep(0.0, -0.25, v.y)); // abaixo do horizonte: névoa do chão
        float sy = uSunDir.y, mu = dot(v, uSunDir);
        float vis = 1.0 - clamp(uOver, 0.0, 1.0) * 0.94;
        float above = smoothstep(-0.01, 0.06, v.y);
        // ---- noite: estrelas (cintilam) e Via Láctea ----
        float nk = smoothstep(0.35, 0.95, uNight) * (1.0 - clamp(uOver, 0.0, 1.0) * 0.95) * smoothstep(0.0, 0.18, v.y);
        if (nk > 0.001) {
          vec3 sd = v * 150.0, cell = floor(sd), f = fract(sd) - 0.5;
          float hs = uh31(cell);
          vec3 off = vec3(uh31(cell + 7.1), uh31(cell + 3.7), uh31(cell + 1.3)) - 0.5;
          float r = length(f - off * 0.55);
          float big = (hs - 0.9) / 0.1;
          float star = step(0.9, hs) * smoothstep(0.13 + big * 0.07, 0.0, r) * (0.15 + big * big * 1.6);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + hs * 6.0) + hs * 91.0);
          vec3 scol = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.84, 1.0), uh31(cell + 11.0));
          c += scol * star * tw * nk * 1.4;
          vec3 bn = normalize(vec3(0.42, 0.38, 0.82));
          float b = dot(v, bn);
          float band = exp(-b * b * 16.0);
          vec2 q = vec2(atan(v.z, v.x) * 2.4, v.y * 5.0);
          float mw = smoothstep(0.35, 0.85, ufbm(q * 1.7)) * (0.55 + 0.45 * ufbm3(q * 6.0));
          c += vec3(0.045, 0.05, 0.07) * band * mw * nk * 1.6;
          c += vec3(0.11, 0.1, 0.13) * pow(max(ufbm3(q * 14.0) - 0.45, 0.0), 2.0) * band * nk; // poeira de estrelas
        }
        // ---- lua ----
        float md = dot(v, uMoonDir);
        float mk = smoothstep(0.08, 0.55, uNight) * (1.0 - clamp(uOver, 0.0, 1.0) * 0.85);
        if (md > 0.9993 && mk > 0.0) {
          vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uMoonDir);
          vec2 mp = vec2(dot(v, t1), dot(v, t2)) / 0.0328; // raio ~1,9°
          float rr = length(mp);
          float disc = smoothstep(1.0, 0.92, rr);
          float mar = ufbm3(mp * 2.2 + 3.0);
          float lit = smoothstep(-0.55, 0.2, mp.x * 0.9 + 0.35); // fase (um pedaço na sombra)
          c += vec3(0.95, 0.96, 1.0) * disc * (0.55 + 0.45 * smoothstep(0.35, 0.7, mar)) * mix(0.03, 1.0, lit) * 2.2 * mk;
        }
        // ---- sol: disco com borda escurecida + coroa ----
        vec3 sunT = skySunTrans(max(sy, 0.0) + 0.01);
        float sunUp = smoothstep(-0.035, 0.02, sy);
        const float SR = 0.99987; // ~0,9°
        if (mu > SR - 0.00012) {
          float rr = clamp((1.0 - mu) / (1.0 - SR), 0.0, 1.4);
          float limb = 1.0 - 0.6 * (1.0 - sqrt(max(1.0 - rr * rr, 0.0)));
          c += sunT * smoothstep(1.0, 0.86, rr) * limb * 140.0 * uSunE * sunUp * vis * above;
        }
        c += sunT * pow(max(mu, 0.0), 900.0) * 6.0 * sunUp * vis; // coroa
        // ---- camada alta de nuvens ----
        if (v.y > 0.0) {
          vec2 p = v.xz / (v.y + 0.1) * 1.25 + uCloudOff;
          float n1 = ufbm(p);
          float d = smoothstep(uCloudCov, uCloudCov + 0.3, n1);
          float hz = smoothstep(0.0, 0.2, v.y);
          if (d * hz > 0.002) {
            float n2 = ufbm3(p + uSunDir.xz * 0.28);
            float self = clamp(1.0 - (n2 - n1) * 2.6, 0.2, 1.0);          // lado de dentro da nuvem: sombra
            float fwd = pow(max(mu, 0.0), 6.0) * (1.0 - d) * 2.2;          // borda prateada contra o sol
            vec3 cc = uCloudAmb * (0.7 + 0.3 * (1.0 - d)) + uCloudSun * (self * 0.75 + fwd);
            cc = mix(cc, c, 0.35 * (1.0 - hz)); // perto do horizonte some na névoa
            c = mix(c, cc, d * hz * 0.92);
          }
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return mat;
}
