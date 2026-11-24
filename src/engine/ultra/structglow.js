import * as THREE from 'three';

// =============================================================
// Ultra realismo — vidros das janelas (de dia: vidro escuro refletindo o céu, com caixilhos; à noite: luz quente de
// dentro, cortinas e caixilhos em silhueta) e cristais (facetas, borda brilhante e cintilado). Só existe com o Ultra.
// As outras peças do lote de brilho (lampiões, tochas, forja, runas) continuam iguais ao material original.
// =============================================================

// janela = caixa fina (uma medida < 6 cm, as outras > 20 cm) na cor quente das janelas (0xffc66b)
const GLOW_FRAG = /* glsl */`
  vec3 gE = max(vUH, vec3(0.001)), gP = vUL;
  vec2 gUV, gX;
  if (gE.x <= gE.y && gE.x <= gE.z) { gUV = gP.zy; gX = gE.zy; } else if (gE.z <= gE.y) { gUV = gP.xy; gX = gE.xy; } else { gUV = gP.xz; gX = gE.xz; }
  float gThin = min(gE.x, min(gE.y, gE.z));
  vec3 gC = vColor.rgb;
  bool gWin = gThin < 0.06 && gX.x > 0.2 && gX.y > 0.2 && gC.r > 0.9 && gC.g > 0.48 && gC.g < 0.62 && gC.b < 0.22;
  vec3 gOut = gC * uGlowC;
  if (gWin) {
    vec2 q = gUV / gX; // -1..1
    vec2 a = abs(q);
    // caixilhos: moldura + cruz (2 x 2 vidraças) + travessa fina (vidraças pequenas em cima)
    vec2 m = gX - abs(gUV);
    float frame = 1.0 - smoothstep(0.035, 0.045, min(m.x, m.y));
    float cross_ = 1.0 - smoothstep(0.016, 0.024, min(abs(gUV.x), abs(gUV.y)));
    float bar = 1.0 - smoothstep(0.009, 0.014, abs(gUV.y - gX.y * 0.45));
    float pane = clamp(frame + cross_ + bar, 0.0, 1.0);
    float pid = floor(q.x + 1.0) + 2.0 * floor((q.y + 1.0) * 0.5 / 0.725);
    float pr = fract(sin(pid * 12.9898 + vUL.x * 3.1 + vUL.z * 7.7) * 43758.5453);
    // de dia: vidro antigo (levemente esverdeado), escuro por dentro, refletindo o céu e com reflexo diagonal
    float yy = q.y * 0.5 + 0.5;
    vec3 day = mix(vec3(0.035, 0.04, 0.045), vec3(0.20, 0.25, 0.30), yy * 0.8 + 0.1);
    day += vec3(0.16, 0.18, 0.2) * smoothstep(0.08, 0.0, abs(q.x * 0.8 + q.y * 0.5 - 0.35 + pr * 0.3)) * 0.8;
    day *= 0.85 + 0.3 * pr;
    // à noite: cômodo iluminado (mais claro no meio, cortinas nos lados, pé do cômodo mais escuro)
    float cur = smoothstep(0.55, 0.85, a.x) * (0.7 + 0.3 * sin(gUV.x * 70.0));
    vec3 night = vec3(1.0, 0.58, 0.24) * (1.15 - 0.45 * a.x * a.x) * (0.75 + 0.35 * yy) * (0.85 + 0.3 * pr);
    night = mix(night, vec3(0.55, 0.16, 0.08) * 0.7, cur * 0.8);
    vec3 wood = vec3(0.07, 0.045, 0.03);
    vec3 col = mix(day, night * 1.25, uNightG);
    col = mix(col, wood * (0.6 + 0.6 * (1.0 - uNightG)), pane);
    gOut = col;
  }
  diffuseColor.rgb = gOut;
`;

export function glowMaterial(world, night) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  const U = { uGlowC: { value: world.glowMat.color }, uNightG: night || { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aUL; attribute vec3 aUH; varying vec3 vUL; varying vec3 vUH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUL = aUL; vUH = aUH;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlowC; uniform float uNightG; varying vec3 vUL; varying vec3 vUH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLOW_FRAG);
  };
  m.customProgramCacheKey = () => 'ultra-vidro-v1';
  return m;
}

// cristais: facetas com luz própria, borda clara (fresnel) e cintilado
export function crystalMaterial(world) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  const U = { uTime: world.uniforms.uTime };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW; varying vec3 vCN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz; vCN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vCW; varying vec3 vCN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 n = normalize(vCN), v = normalize(cameraPosition - vCW);
          float fa = dot(n, normalize(vec3(0.4, 0.8, 0.3))) * 0.5 + 0.5;
          float fr = pow(1.0 - abs(dot(n, v)), 3.0);
          float hs = fract(sin(dot(floor(vCW * 6.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float tw = smoothstep(0.985, 1.0, sin(uTime * 2.0 + hs * 40.0) * 0.5 + 0.5) * step(0.7, hs);
          float core = 0.5 + 0.5 * sin(dot(vCW, vec3(1.7, 2.3, 1.1)) + uTime * 0.6);
          vec3 c = diffuseColor.rgb;
          diffuseColor.rgb = c * (0.42 + 0.62 * fa) * (0.9 + 0.2 * core) + mix(c, vec3(1.0), 0.5) * fr * 0.7 + vec3(1.0) * tw * 0.8; }`);
  };
  m.customProgramCacheKey = () => 'ultra-cristal-v1';
  return m;
}
