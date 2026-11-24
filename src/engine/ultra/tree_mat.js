// =============================================================
// Ultra realismo — material das árvores e plantas (um só para casca e folhas: 1 desenho por modelo).
// Lambert + instâncias próprias (iA pos+giro, iB cor da folha+escala, iC cor da casca+escala Y, iD neve/acaso/copa/brilho),
// vento (balança mais nas pontas, folhas tremulam), recorte alfa das folhas, casca com relevo, oclusão (miolo da copa
// mais escuro), luz do sol atravessando as folhas, neve por cima dos ramos, chapéu de cogumelo que brilha à noite.
// =============================================================
import * as THREE from 'three';

const VERT_PARS = `attribute vec4 aV; attribute float aS;
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
uniform float uTime; uniform vec4 uWind;
varying vec4 vV; varying vec2 vUv2; varying vec3 vLeaf; varying vec3 vBark; varying vec4 vD; varying vec3 vWP; varying float vS;
`;
// gira a normal pela instância (escala Y diferente corrige a normal)
const VERT_NORMAL = `
  float ics = cos(iA.w), isn = sin(iA.w);
  vec3 objectNormal = normalize(vec3(normal.x, normal.y / max(iC.w, 0.2), normal.z));
  objectNormal.xz = vec2(ics * objectNormal.x + isn * objectNormal.z, -isn * objectNormal.x + ics * objectNormal.z);
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif`;
const VERT_POS = `
  float jcs = cos(iA.w), jsn = sin(iA.w);
  vec3 jn = normal; jn.xz = vec2(jcs * jn.x + jsn * jn.z, -jsn * jn.x + jcs * jn.z);
  vec3 ip = position * vec3(iB.w, iB.w * iC.w, iB.w);
  if (aV.x < 0.1 && iD.z < 0.5) ip = vec3(0.0); // instância sem copa: folhas da copa somem
  ip.xz = vec2(jcs * ip.x + jsn * ip.z, -jsn * ip.x + jcs * ip.z);
  float tph = iD.y * 6.2831 + dot(iA.xz, vec2(0.071, 0.053));
  float gust = 0.55 + 0.45 * sin(uTime * 0.55 + dot(iA.xz, uWind.xy) * 0.045);
  float sway = sin(uTime * 1.25 + tph) * 0.65 + sin(uTime * 2.1 + tph * 1.7) * 0.35;
  float wk = aV.z * uWind.z * min(iB.w * iC.w, 2.0);
  ip.xz += uWind.xy * wk * gust * (0.32 + sway * 0.3) * 0.55;
  ip.xz += vec2(-uWind.y, uWind.x) * wk * sin(uTime * 0.9 + tph * 1.3) * 0.06;
  if (aV.x < 0.5) {
    float fl = sin(uTime * 4.7 + aV.w * 31.0 + tph) * 0.6 + sin(uTime * 7.3 + aV.w * 17.0) * 0.4;
    ip += jn * fl * 0.05 * aV.z * uWind.z * (0.6 + gust);
  }
  vec3 transformed = ip + iA.xyz;
  vV = aV; vUv2 = uv; vLeaf = iB.rgb; vBark = iC.rgb; vD = iD; vWP = transformed; vS = aS;`;

const FRAG_PARS = `uniform sampler2D uLeafTex; uniform sampler2D uBarkTex; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uLeafK; uniform float uTrans; uniform float uNight; uniform float uBump;
varying vec4 vV; varying vec2 vUv2; varying vec3 vLeaf; varying vec3 vBark; varying vec4 vD; varying vec3 vWP; varying float vS;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y); }
vec3 tPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;
const FRAG_COLOR = `
  float gH = 0.5; bool gLeaf = vV.x < 0.5;
  float gDist = length(vWP - cameraPosition);
  if (gLeaf) {
    vec4 tl = texture2D(uLeafTex, vUv2);
    // neve: só por cima (frente do cartão), em montinhos (ruído), mais no eixo do ramo; o verde aparece entre eles
    float sn = 0.0, al = tl.a;
    if (vD.x > 0.0) {
    float lu = abs(fract(vUv2.x * 4.0) - 0.5);
    sn = vD.x * smoothstep(0.5, 0.68, vS * (0.2 + 0.6 * tNoise(vWP.xz * 4.3 + vWP.y * 2.9) + 0.45 * tNoise(vWP.xz * 1.3 - vWP.y)) * (1.2 - 1.7 * lu)) * (gl_FrontFacing ? 1.0 : 0.1);
    // onde tem neve o recorte fica "cheio" (montinho em cima das agulhas), não um contorno de agulhas brancas
    al = mix(tl.a, smoothstep(0.12, 0.45, texture2D(uLeafTex, vUv2, 3.0).a), sn * 0.9);
    }
    if (al < mix(0.5, 0.3, smoothstep(20.0, 140.0, gDist))) discard;
    vec3 base = vV.x > 0.3 ? vBark * 2.4 : vLeaf;
    float var = 0.78 + 0.4 * fract(vV.w * 7.13), hv = fract(vV.w * 3.71);
    vec3 c = tl.rgb * base * var * uLeafK;
    c = mix(c, c * vec3(1.12, 1.04, 0.7), smoothstep(0.55, 1.0, hv) * 0.5);  // cachos mais amarelados
    c = mix(c, c * vec3(0.8, 0.92, 1.05), smoothstep(0.45, 0.0, hv) * 0.45); // e outros mais azulados/escuros
    c = mix(c, c * vec3(1.15, 1.1, 0.72), 0.4 * smoothstep(0.75, 1.0, vV.y)); // pontas ao sol: mais claras e quentes
    c *= vV.y;
    c = mix(c, vec3(0.84, 0.88, 0.95) * (0.72 + 0.28 * vV.y) * (0.88 + 0.12 * tNoise(vUv2 * 300.0)), sn);
    diffuseColor.rgb = c;
  } else {
    vec4 bt = texture2D(uBarkTex, vUv2);
    float k = vV.x; vec3 c;
    if (k < 1.5) { gH = bt.r; c = vBark * mix(0.38, 1.5, bt.r); c = mix(c, c * vec3(0.75, 1.0, 0.6), 0.35 * smoothstep(0.55, 0.8, tNoise(vWP.xz * 3.0 + vWP.y * 2.0)) * (1.0 - smoothstep(0.62, 0.92, vV.y))); }
    else if (k < 2.5) { gH = bt.g; c = mix(vec3(0.035, 0.03, 0.03), vBark, bt.g); }
    else if (k < 3.5) { gH = bt.b; c = vBark * mix(0.32, 1.45, bt.b); }
    else if (k < 4.5) { float rib = 0.5 + 0.5 * cos(vUv2.x * 6.2831 * 12.0); gH = rib; c = vBark * (0.62 + 0.5 * rib) * (0.85 + 0.3 * bt.r);
      c = mix(c, vec3(0.9, 0.85, 0.7), step(0.985, tHash(floor(vec2(vUv2.x * 24.0, vUv2.y * 30.0)))) * step(0.8, rib)); }
    else if (k < 5.5) { gH = bt.g; c = vLeaf * (0.5 + 0.5 * bt.g) * (0.65 + 0.35 * tNoise(vUv2 * vec2(18.0, 6.0))); }
    else { gH = bt.g; c = vBark * (0.75 + 0.3 * bt.g); }
    c *= vV.y;
    c = mix(c, vec3(0.84, 0.88, 0.95), vD.x * smoothstep(0.55, 0.85, vS * (0.6 + 0.7 * tNoise(vWP.xz * 3.0))));
    diffuseColor.rgb = c;
  }`;
const FRAG_NORMAL = `
  if (gLeaf) normal = normalize(vNormal); // folha: a mesma normal "de volume" dos dois lados
  else if (vV.x < 4.5) normal = tPerturb(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)) * uBump, faceDirection);`;
const FRAG_EMIT = `
  if (gLeaf) {
    vec3 vd = normalize(vWP - cameraPosition);
    float back = pow(max(dot(vd, uSunDir), 0.0), 3.0);
    totalEmissiveRadiance += diffuseColor.rgb * uSunCol * (back * 0.9 + 0.1) * uTrans * (1.0 - vD.x * 0.6);
  } else if (vV.x > 4.5 && vV.x < 5.5) totalEmissiveRadiance += vLeaf * vD.w * (0.3 + 1.1 * uNight);`;

export function makeTreeMaterials(U) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.shadowSide = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_PARS + sh.vertexShader
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_POS);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  };
  m.customProgramCacheKey = () => 'ult-arvores-v1';
  // sombra: mesmo vento e mesmo recorte das folhas
  const d = new THREE.MeshDepthMaterial();
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', VERT_POS);
    sh.fragmentShader = 'uniform sampler2D uLeafTex; varying vec4 vV; varying vec2 vUv2;\n' + sh.fragmentShader
      .replace('#include <alphatest_fragment>', 'if (vV.x < 0.5 && texture2D(uLeafTex, vUv2).a < 0.5) discard;');
  };
  d.customProgramCacheKey = () => 'ult-arvores-sombra-v1';
  return { main: m, depth: d };
}
