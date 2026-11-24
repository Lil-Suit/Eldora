// =============================================================
// Ultra realismo — material do SOLO (só existe com o Ultra ligado; troca o material do terreno no toggle).
// Por pixel: grama (fios, falhas com terra), terra/cascalho com pedrinhas, rocha nas encostas (estratos,
// rachaduras, líquen), areia (ondinhas, grãos, faixa molhada), neve (montinhos, brilho que cintila),
// lama com poças que refletem o céu, chão rachado/cinza com brasas, chão de floresta (folhas e musgo),
// estradas com marcas de roda e bordas irregulares, margem molhada e relevo fino (normal por derivada).
// Mistura entre superfícies pela "altura" de cada uma (bordas naturais, não um degradê borrado).
// =============================================================
import * as THREE from 'three';

export const MAX_SEG = 48;

const VERT_PARS = `
attribute vec4 aW0; attribute vec4 aW1; attribute vec4 aBase;
#ifdef ULT_NRM
attribute vec3 aNrm;
#endif
varying vec4 vW0; varying vec4 vW1; varying vec4 vBase; varying vec3 vGPos; varying vec3 vGN;
`;
const VERT_MAIN = `
vW0 = aW0; vW1 = aW1; vBase = aBase;
vGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifdef ULT_NRM
vGN = normalize(mat3(modelMatrix) * aNrm);
#else
vGN = normalize(mat3(modelMatrix) * objectNormal);
#endif
`;

const FRAG_PARS = `
uniform sampler2D uTexA; uniform sampler2D uTexB;
uniform float uTime; uniform float uNight;
uniform vec4 uShore; uniform vec3 uShoreCol;         // (y0, y1, quanto, tipo 0 areia / 1 lama)
uniform vec4 uUnder; uniform vec3 uUnderCol; uniform vec3 uDeepCol;
uniform float uWater;
uniform vec4 uSeg[${MAX_SEG}]; uniform int uSegN; uniform vec4 uRoad;  // (borda interna, externa, marca de roda, largura da marca)
uniform vec3 uRoadCol; uniform vec3 uRoadCol2; uniform vec3 uRoadSnow;
uniform vec4 uPath; uniform vec3 uPathCol;          // caminho de lajes em seno (Planície do Guardião)
uniform vec3 uGlowA; uniform vec3 uGlowB; uniform float uGlowK;
uniform vec3 uRockCol; uniform vec3 uLichen; uniform vec3 uSoil; uniform vec3 uLeafTint;
uniform float uRipple; uniform float uDry;
varying vec4 vW0; varying vec4 vW1; varying vec4 vBase; varying vec3 vGPos; varying vec3 vGN;
float gH = 0.0; float gRough = 0.9; vec3 gEmit = vec3(0.0);
float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gMax4(vec4 v) { return max(max(v.x, v.y), max(v.z, v.w)); }
`;

const FRAG_COLOR = `
{
  vec2 gp = vGPos.xz;
  vec3 gV = vGPos - cameraPosition;
  float gDist = length(gV);
  // ---- todas as leituras de textura aqui em cima (fora de "if": mipmap certo) ----
  vec4 tA1 = texture2D(uTexA, gp * 0.29);
  vec4 tA2 = texture2D(uTexA, mat2(0.8, -0.6, 0.6, 0.8) * gp * 0.083 + 0.31);
  vec4 tA3 = texture2D(uTexA, mat2(0.6, 0.8, -0.8, 0.6) * gp * 0.71 + 0.13);
  vec4 tB1 = texture2D(uTexB, gp * 0.017);
  vec4 tB2 = texture2D(uTexB, gp * 0.0043 + 0.53);
  vec4 tBd = texture2D(uTexB, gp * 0.19 + 0.17);
  vec3 gN = normalize(vGN);
  vec3 an = abs(gN);
  vec2 sideUV = an.x > an.z ? vGPos.zy : vGPos.xy;
  vec4 tRs = texture2D(uTexB, sideUV * vec2(0.055, 0.09));
  vec4 tRc = texture2D(uTexA, sideUV * 0.12);
  float macro = tB1.r * 0.65 + tB2.r * 0.35;
  float flatK = smoothstep(0.55, 0.95, gN.y);
  vec3 base = vBase.rgb;

  // ---- estrada por pixel (segmentos) ----
  float road = 0.0, rd = 99.0, along = 0.0;
  if (vBase.a > 0.01 && uSegN > 0) {
    for (int i = 0; i < ${MAX_SEG}; i++) {
      if (i >= uSegN) break;
      vec4 s = uSeg[i]; vec2 ab = s.zw - s.xy; vec2 ap = gp - s.xy;
      float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
      float d = length(ap - ab * t);
      if (d < rd) { rd = d; along = dot(ap, normalize(ab)); }
    }
    float wob = (tA2.b - 0.5) * 0.9 + (tB1.r - 0.5) * 0.9 + (tA1.r - 0.5) * 0.25;
    road = 1.0 - smoothstep(uRoad.x, uRoad.y, rd + wob);
  }
  float path = 0.0;
  if (uPath.x > 0.5 && vBase.a > 0.01) {
    float d = abs(gp.x - uPath.y - sin(gp.y * uPath.w) * uPath.z);
    path = 1.0 - smoothstep(2.4, 3.4, d + (tA2.b - 0.5) * 0.9);
  }
  // ---- margem (areia/lama) por altura do pixel ----
  float shore = 0.0;
  if (uShore.z > 0.0) shore = (1.0 - smoothstep(uShore.x, uShore.y, vGPos.y + (tA2.b - 0.5) * 0.22 + (tA1.g) * 0.05)) * uShore.z * (1.0 - smoothstep(0.2, 0.6, vW1.x));
  float slopeR = smoothstep(0.84, 0.66, gN.y + (tRs.b - 0.5) * 0.14);

  vec4 W0 = vW0, W1 = vW1;
  W0.z = max(W0.z, slopeR * (1.0 - W1.x * 0.6));
  float snowRoad = W1.x;
  float roadAll = max(road, path);
  W0 *= 1.0 - roadAll; W1 *= 1.0 - roadAll; W0.y += roadAll;
  W1.x += roadAll * snowRoad * 0.55; // estrada na neve: neve pisada por cima
  if (uShore.w < 0.5) { W0 *= 1.0 - shore; W1 *= 1.0 - shore; W0.w += shore; }
  else { W0 *= 1.0 - shore; W1 *= 1.0 - shore; W1.y += shore; }

  // ---- "altura" de cada superfície (decide quem aparece por cima na mistura) ----
  float hG = tA1.r * 0.6 + tB1.r * 0.4;
  float hD = max(tA1.g, tA2.g) * 0.8 + tA1.b * 0.35;
  float hR = mix(tRs.b, tBd.b, flatK) * 0.8 + 0.25;
  float hS = 0.35 + tA2.b * 0.3;
  float hN = 0.45 + macro * 0.5;
  float hM = 0.2 + tA1.b * 0.3;
  float hA = tA1.b * 0.6 + 0.2;
  float hF = tBd.g * 0.7 + 0.2;
  vec4 H0 = vec4(hG, hD, hR, hS), H1 = vec4(hN, hM, hA, hF);
  vec4 M0 = step(vec4(0.002), W0), M1 = step(vec4(0.002), W1);
  vec4 S0 = (W0 + H0 * 0.5) * M0, S1 = (W1 + H1 * 0.5) * M1;
  float mx = max(gMax4(S0), gMax4(S1));
  vec4 B0 = max(S0 - mx + 0.16, 0.0) * M0, B1 = max(S1 - mx + 0.16, 0.0) * M1;
  float bs = dot(B0, vec4(1.0)) + dot(B1, vec4(1.0)) + 1e-5;
  B0 /= bs; B1 /= bs;

  vec3 col = vec3(0.0); float rough = 0.0; float H = 0.0;
  float near = 1.0 - smoothstep(4.0, 16.0, gDist);
  // grama
  if (B0.x > 0.001) {
    vec3 c = base;
    float dry = smoothstep(0.52, 0.8, tB2.r * 0.6 + tB1.r * 0.4) * uDry;
    c = mix(c, c * vec3(1.35, 1.12, 0.55), dry * 0.6);
    c *= 0.78 + 0.44 * tB1.r;
    float str = tA1.r * 0.45 + tA2.r * 0.3 + tA3.r * 0.25;
    c *= 0.5 + 0.95 * str;
    c = mix(c, c * vec3(1.3, 1.22, 0.8), smoothstep(0.72, 1.0, str) * 0.55);
    float bare = smoothstep(0.34, 0.14, str + (tB1.r - 0.5) * 0.4);
    c = mix(c, uSoil * (0.6 + 0.8 * tA1.b), bare * 0.65);
    col += B0.x * c; rough += B0.x * 0.93; H += B0.x * (str * 0.035);
  }
  // terra, cascalho e estrada
  if (B0.y > 0.001) {
    float rs = roadAll / max(roadAll + vW0.y * (1.0 - roadAll), 1e-4);
    vec3 rc = mix(uRoadCol, uRoadCol2, smoothstep(0.35, 0.65, tB1.r));
    if (path > road) rc = uPathCol;
    vec3 c = mix(base, rc, rs);
    c *= 0.74 + 0.5 * tA1.b;
    c *= 0.86 + 0.28 * tB1.r;
    float h = tA1.b * 0.025;
    if (road > 0.01) {
      float rdw = rd + (tA2.b - 0.5) * 0.22 + sin(along * 0.37) * 0.06;
      float rut = exp(-pow((rdw - uRoad.z) / uRoad.w, 2.0));
      float crown = 1.0 - smoothstep(0.1, 0.45, rdw);
      c *= 1.0 - rut * 0.32 * rs;
      c = mix(c, c * 1.12, crown * 0.6);
      h -= rut * 0.06 * rs; h += crown * 0.015;
      // marcas de pegadas e cascos bem rasas na faixa do meio
      float hoof = smoothstep(0.82, 0.95, gHash(floor(vec2(along * 2.2, rdw * 4.0)))) * (1.0 - smoothstep(0.6, 1.1, rdw));
      c *= 1.0 - hoof * 0.18 * near; h -= hoof * 0.02;
      c = mix(c, uRoadSnow * (0.82 + 0.25 * tA1.b) * (1.0 - rut * 0.22), snowRoad * 0.85);
    }
    if (path > 0.01) {
      // lajes: células de Worley (canal G = pedrinhas grandes) com juntas escuras de terra e musgo
      float slab = tA2.a; // rachaduras grandes = juntas
      c = mix(c, c * 0.45, smoothstep(0.35, 0.8, slab) * path);
      c = mix(c, uLichen * 0.5, smoothstep(0.6, 0.9, slab) * smoothstep(0.5, 0.7, tBd.a) * path * 0.6);
      h += (1.0 - slab) * 0.03 * path;
    }
    // pedrinhas: pequenas e da cor da terra (mais claras ou mais escuras), as grandes só em manchas
    float pb = max(tA1.g, tA2.g * 0.75 * smoothstep(0.45, 0.75, tB1.r)) * (1.0 - snowRoad * 0.8);
    float pv = fract(pb * 13.7);
    vec3 pc = mix(base * vec3(0.8, 0.78, 0.75), mix(base, vec3(0.45, 0.43, 0.4), 0.5) * 1.3, pv);
    float pk = smoothstep(0.08, 0.3, pb) * (0.3 + 0.7 * smoothstep(0.35, 0.75, tA2.b));  // em grupinhos, não espalhadas por igual
    c = mix(c, pc * (0.8 + 0.4 * pb), pk * 0.65);
    h += pb * 0.05;
    col += B0.y * c; rough += B0.y * mix(0.95, 0.62, pk); H += B0.y * h;
  }
  // rocha
  if (B0.z > 0.001) {
    float st = mix(tRs.b, tBd.b, flatK);
    float cr = mix(tRc.a, tA1.a, flatK);
    vec3 c = mix(base, uRockCol, 0.3);
    c *= 0.5 + 0.9 * st;
    c *= 0.92 + 0.16 * sin(vGPos.y * 2.7 + st * 5.0);
    c *= 1.0 - cr * 0.6;
    float li = smoothstep(0.6, 0.78, tBd.a) * (1.0 - cr) * (0.4 + 0.6 * flatK);
    c = mix(c, uLichen * (0.75 + 0.5 * tA1.b), li * 0.42);
    col += B0.z * c; rough += B0.z * 0.78; H += B0.z * (st * 0.12 - cr * 0.05);
  }
  // areia
  if (B0.w > 0.001) {
    float rip = sin(dot(gp, vec2(0.83, 0.56)) * 6.3 + tA2.b * 5.0 + tB1.r * 14.0) * 0.5 + 0.5;
    float big = sin(dot(gp, vec2(0.6, 0.8)) * 0.55 + tB1.r * 6.0) * 0.5 + 0.5;
    vec3 c = base * (0.9 + 0.12 * tA1.b);
    c *= 0.93 + 0.14 * rip * uRipple + 0.1 * big * uRipple;
    float gr = gHash(floor(gp * 70.0));
    c *= mix(1.0, 0.9 + 0.2 * gr, near);
    col += B0.w * c; rough += B0.w * 0.9; H += B0.w * (rip * 0.025 * uRipple + big * 0.06 * uRipple + tA1.b * 0.006);
  }
  // neve
  if (B1.x > 0.001) {
    vec3 c = mix(base, vec3(0.86, 0.9, 0.96), 0.35);
    c *= 0.9 + 0.12 * tB1.r + 0.06 * tA2.b;
    c = mix(c, c * vec3(0.82, 0.9, 1.06), (1.0 - tA2.b) * 0.35);
    float h0 = gHash(floor(gp * 48.0));
    float tw = fract(h0 * 17.0 + dot(normalize(gV), vec3(9.1, 5.3, 7.7)) * 2.0);
    float sp = step(0.965, h0) * step(0.55, tw) * near;
    gEmit += vec3(0.9, 0.95, 1.0) * sp * B1.x * (1.2 - uNight * 0.8);
    col += B1.x * c; rough += B1.x * 0.55; H += B1.x * (tB1.r * 0.08 + tA2.b * 0.025);
  }
  // lama com poças
  if (B1.y > 0.001) {
    vec3 c = mix(base, uShoreCol, shore) * vec3(0.62, 0.56, 0.5) * (0.72 + 0.5 * tA1.b);
    float pud = smoothstep(0.46, 0.38, tB1.r + (tA2.b - 0.5) * 0.18);
    c = mix(c, c * 0.42, pud);
    float fr = pow(1.0 - clamp(dot(normalize(-gV), vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 4.0) * 0.85 + 0.06;
    #ifdef USE_FOG
    gEmit += fogColor * pud * fr * 0.55 * B1.y;
    #endif
    col += B1.y * c; rough += B1.y * mix(0.85, 0.08, pud); H += B1.y * (tA1.b * 0.02 * (1.0 - pud));
  }
  // chão rachado / cinza (com brilho nas rachaduras)
  if (B1.z > 0.001) {
    // rachaduras só em placas (barro seco), entre elas pó e cascalho; finas bem fracas, grandes mais marcadas
    float plate = smoothstep(0.38, 0.62, tB1.r + (tA2.b - 0.5) * 0.35);
    vec3 c = base * (0.74 + 0.4 * tA1.b) * (0.9 + 0.2 * tB2.r);
    float cr = max(tA1.a * 0.45 * plate, tA2.a * (0.35 + 0.5 * plate));
    c = mix(c, c * vec3(1.12, 1.08, 1.02), (1.0 - plate) * 0.35 * tA1.g);
    c *= 1.0 - cr * 0.5;
    vec3 gc = base.r > base.b ? uGlowA : uGlowB;
    float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + tB1.r * 25.0);
    gEmit += gc * smoothstep(0.62, 0.95, cr) * smoothstep(0.45, 0.72, tB1.r) * pulse * uGlowK * (0.3 + 0.7 * uNight) * B1.z;
    col += B1.z * c; rough += B1.z * 0.95; H += B1.z * (tA1.b * 0.03 - cr * 0.045);
  }
  // chão de floresta: folhas secas, terra escura e musgo
  if (B1.w > 0.001) {
    vec3 c = base * 0.72 * (0.8 + 0.4 * tA1.b);
    float lf = tBd.g;
    vec3 leaf = mix(vec3(0.11, 0.06, 0.025), vec3(0.3, 0.17, 0.06), fract(lf * 9.1));
    leaf = mix(leaf, vec3(0.26, 0.23, 0.08), step(0.72, fract(lf * 3.7)) * 0.5) * uLeafTint;
    c = mix(c, leaf * (0.7 + 0.4 * tB1.r), smoothstep(0.12, 0.2, lf) * (0.4 + 0.3 * tB1.r));
    float moss = smoothstep(0.56, 0.74, tBd.a);
    c = mix(c, base * vec3(0.9, 1.2, 0.65) * 1.05, moss * 0.6);
    col += B1.w * c; rough += B1.w * 0.9; H += B1.w * (lf * 0.025 + moss * 0.02);
  }
  // fundo do rio/lago (Vale): por pixel
  if (uUnder.x > -50.0) {
    col = mix(col, uUnderCol * (0.8 + 0.4 * tA1.b), 1.0 - smoothstep(uUnder.x, uUnder.y, vGPos.y));
    col = mix(col, uDeepCol, 1.0 - smoothstep(uUnder.z, uUnder.w, vGPos.y));
  }
  // faixa molhada na beira da água: mais escura e lisa (brilha com o sol)
  float wet = 1.0 - smoothstep(uWater - 0.05, uWater + 0.4 + tA2.b * 0.2, vGPos.y);
  col *= mix(1.0, 0.6, wet);
  rough = mix(rough, 0.22, wet * 0.85);
  // oclusão fina: fundinhos mais escuros
  col *= 0.86 + 0.28 * smoothstep(-0.03, 0.06, H);
  diffuseColor.rgb = col;
  gRough = rough;
  gH = H * (1.0 - smoothstep(18.0, 70.0, gDist));
}
`;

const FRAG_NORMAL = `
{
  // relevo fino: derivadas da altura na tela (mesma ideia do bump map)
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  float dhx = dFdx(gH), dhy = dFdy(gH);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * 1.6);
}
`;

// Material do solo Ultra para uma área. opts: { nrm (usa aNrm), uniforms extras }
export function makeGroundMaterial(world, tex, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const C = (h) => new THREE.Color(h);
  const segs = []; for (let i = 0; i < MAX_SEG; i++) segs.push(new THREE.Vector4());
  const U = {
    uTexA: { value: tex.A }, uTexB: { value: tex.B }, uTime: world.uniforms.uTime, uNight: opts.night || { value: 0 },
    uShore: { value: new THREE.Vector4(-100, -99, 0, 0) }, uShoreCol: { value: C(0xd1bd88) },
    uUnder: { value: new THREE.Vector4(-100, -99, -100, -99) }, uUnderCol: { value: C(0x6b8a74) }, uDeepCol: { value: C(0x3c6466) },
    uWater: { value: -100 },
    uSeg: { value: segs }, uSegN: { value: 0 }, uRoad: { value: new THREE.Vector4(1.3, 2.9, 0.85, 0.24) },
    uRoadCol: { value: C(0xb39466) }, uRoadCol2: { value: C(0x9e8056) }, uRoadSnow: { value: C(0xc9ced6) },
    uPath: { value: new THREE.Vector4(0, 0, 0, 0) }, uPathCol: { value: C(0xa8a294) },
    uGlowA: { value: C(0xff6a1a).multiplyScalar(1.6) }, uGlowB: { value: C(0xb04cff).multiplyScalar(1.2) }, uGlowK: { value: 1 },
    uRockCol: { value: C(0x8b857b) }, uLichen: { value: C(0x9aa05a) }, uSoil: { value: C(0x4a3826) }, uLeafTint: { value: new THREE.Vector3(1, 1, 1) },
    uRipple: { value: 0.4 }, uDry: { value: 0.5 },
  };
  // ajustes da área: cores em hex, vetores em lista, números direto
  for (const k in opts.u || {}) {
    const v = opts.u[k], u = U[k]; if (!u) continue;
    if (u.value?.isColor) u.value.set(v);
    else if (Array.isArray(v)) u.value.set(...v);
    else u.value = v;
  }
  m.userData.U = U;
  if (opts.nrm) m.defines = { ULT_NRM: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit;');
  };
  m.customProgramCacheKey = () => 'ult-chao-solo-v1' + (opts.nrm ? 'n' : '');
  return m;
}

// estradas (polilinhas) → segmentos no uniform
export function setSegments(mat, polylines) {
  const U = mat.userData.U; let n = 0;
  for (const pl of polylines) for (let i = 0; i < pl.length - 1 && n < MAX_SEG; i++) U.uSeg.value[n++].set(pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]);
  U.uSegN.value = n;
}
