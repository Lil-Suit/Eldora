import * as THREE from 'three';

// =============================================================
// Ultra realismo — material das ESTRUTURAS (só existe com o Ultra ligado).
// MeshStandardMaterial + textura procedural no shader (sem imagens): pedra em blocos com argamassa, madeira com
// veios e tábuas, telhas (barro, tabuinha, ardósia) com neve, reboco gasto com tijolos aparecendo, metal com
// ferrugem, pano, palha, terra, casca, musgo, osso, vidro, cristal, mármore, água, papel, gelo, arenito.
// Cada vértice traz (atributos montados só quando o Ultra liga):
//   aUL = posição local da peça em metros, aUH = meia-medida da peça, aUK = (código, semente, altura do chão, neve)
//   código = tipo + 32*forma + 256*face
// Relevo fino: "bump" procedural (3 amostras na tela, como o bumpMap do three) que some com a distância.
// =============================================================
export const K = {
  GEN: 0, STONE: 1, ROCK: 2, WOOD: 3, PLASTER: 4, ROOF: 5, METAL: 6, GOLD: 7, CLOTH: 8, STRAW: 9, SOIL: 10, LEAF: 11,
  BARK: 12, MOSS: 13, BONE: 14, GLASS: 15, CRYSTAL: 16, MARBLE: 17, WATER: 18, PAPER: 19, VOID: 20, SNOW: 21, ICE: 22,
  SAND: 23, WOODV: 24, PAVE: 25, LAVA: 26,
};
export const SHAPE = { GEN: 0, BOX: 1, CYL: 2, CONE: 3, SPHERE: 4, POLY: 5, ROOF: 6, TORUS: 7 };

const NOISE = /* glsl */`
#define UPI2 6.2831853
float uHs(vec3 p) { // hash sem inteiros (barato em qualquer placa)
  p = fract(floor(p) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float uH2(vec2 p) { return uHs(vec3(p, 17.0)); }
float uH1(float p) { return uHs(vec3(p, 3.0, 29.0)); }
float uVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uH2(i), uH2(i + vec2(1.0, 0.0)), f.x), mix(uH2(i + vec2(0.0, 1.0)), uH2(i + vec2(1.0, 1.0)), f.x), f.y); }
float uVN3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(uHs(i), uHs(i + vec3(1.0, 0.0, 0.0)), f.x), mix(uHs(i + vec3(0.0, 1.0, 0.0)), uHs(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(uHs(i + vec3(0.0, 0.0, 1.0)), uHs(i + vec3(1.0, 0.0, 1.0)), f.x), mix(uHs(i + vec3(0.0, 1.0, 1.0)), uHs(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z); }
float uFbm(vec2 p) { return (uVN(p) * 0.6667 + uVN(p * 2.07 + vec2(3.1, 1.7)) * 0.3333); }
float uFbm3(vec3 p) { return (uVN3(p) * 0.6667 + uVN3(p * 2.11 + vec3(1.3, 4.1, 2.7)) * 0.3333); }
float uLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const FRAG_PARS = /* glsl */`
varying vec3 vUL; varying vec3 vUH; varying vec4 vUK; varying vec3 vUW;
uniform float uTime; uniform float uNight; uniform vec4 uClim; uniform vec3 uOrigin; uniform vec3 uMossC; uniform vec3 uDirtC;
${NOISE}
int uK, uS, uF; vec2 fUV, fExt; float fWrap, fTop, fVert, fGrain, fSeed, fHg, fSnow, fFw, fCone;
vec3 fP; vec3 fNW;
// máscaras de baixa frequência (calculadas 1 vez)
float mA, mB, mC;
// saídas do padrão (da amostra central)
float pR, pR2, pX, pY;

void uFaceSetup() {
  float code = floor(vUK.x + 0.5);
  uK = int(mod(code, 32.0)); uS = int(mod(floor(code / 32.0), 8.0)); uF = int(floor(code / 256.0 + 0.001));
  fSeed = vUK.y; fHg = vUK.z; fSnow = vUK.w; fP = vUL;
  vec3 p = vUL, e = max(vUH, vec3(0.001));
  fWrap = 0.0; fTop = 0.0; fVert = 1.0; fGrain = 0.0; fCone = 0.0;
  int ga = (e.y >= e.x && e.y >= e.z) ? 1 : (e.x >= e.z ? 0 : 2);
  if (uS == 2 || uS == 3) {
    if (uF == 6) {
      float r = uS == 2 ? e.x : max(length(p.xz), 0.05);
      fWrap = UPI2 * max(r, 0.05);
      fUV = vec2(atan(p.z, p.x) / UPI2 * fWrap, p.y);
      fExt = vec2(fWrap * 0.5, e.y);
      if (uS == 3) { float L = length(vec2(2.0 * e.y, e.x)); fUV.y = length(vec2(e.y - p.y, length(p.xz))) - L * 0.5; fExt.y = L * 0.5; fCone = 1.0; fVert = 0.5; }
      fGrain = (ga == 1) ? 1.0 : 0.0;
    } else { fUV = p.xz; fExt = e.xz; fTop = uF == 2 ? 1.0 : 0.0; fVert = 0.0; fGrain = 2.0; }
  } else if (uS == 6) {
    if (uF == 6) { float L = length(e.yz); fUV = vec2(p.x, length(vec2(e.y - p.y, p.z)) - L * 0.5); fExt = vec2(e.x, L * 0.5); fVert = 0.5; fGrain = 1.0; }
    else if (uF < 2) { fUV = vec2(p.z, p.y - e.y * 0.5); fExt = vec2(e.z, e.y * 0.5); fGrain = 1.0; }
    else { fUV = p.xz; fExt = e.xz; fVert = 0.0; }
  } else if (uS == 1 || uS == 0) {
    if (uF < 2) { fUV = p.zy; fExt = e.zy; fGrain = ga == 2 ? 0.0 : (ga == 1 ? 1.0 : 2.0); }
    else if (uF < 4) { fUV = p.xz; fExt = e.xz; fTop = uF == 2 ? 1.0 : 0.0; fVert = 0.0; fGrain = ga == 0 ? 0.0 : (ga == 2 ? 1.0 : 2.0); }
    else { fUV = p.xy; fExt = e.xy; fGrain = ga == 0 ? 0.0 : (ga == 1 ? 1.0 : 2.0); }
  } else { fUV = vec2(p.x + p.z * 0.7, p.y); fExt = vec2(1000.0); fVert = 0.5; fGrain = 1.0; }
}

float uEdge(vec2 uv) {
  if (uS == 2 && uF != 6) return fExt.x - length(uv);
  return min(fExt.x - abs(uv.x), fExt.y - abs(uv.y));
}

// ---------- padrões (devolvem altura 0..1) ----------
float uMason(vec2 uv, vec2 ext, float wrap, float rowN, float lenN) {
  float H = 2.0 * ext.y;
  float rh = H < 30.0 ? H / max(1.0, floor(H / rowN + 0.5)) : rowN;
  float y = uv.y + ext.y;
  float row = floor(y / rh);
  float len = lenN * (0.8 + 0.4 * uH1(row + fSeed * 131.0));
  float n = 1.0;
  if (wrap > 0.0) { n = max(1.0, floor(wrap / len + 0.5)); len = wrap / n; }
  float off = (mod(row, 2.0) * 0.5 + (uH1(row * 7.0 + 3.0) - 0.5) * 0.3) * len;
  float x = uv.x + off + (wrap > 0.0 ? 0.0 : ext.x);
  float col = floor(x / len);
  if (wrap > 0.0) col = mod(col, n);
  vec2 fr = vec2(fract(x / len), fract(y / rh));
  vec2 d = min(fr, 1.0 - fr) * vec2(len, rh);
  pR = uHs(vec3(col, row, fSeed * 977.0)); pR2 = uHs(vec3(col + 7.0, row + 3.0, 11.0));
  float hd = min(d.x, d.y) - uVN(uv * 7.0 + pR * 40.0) * min(0.03, rh * 0.1) * smoothstep(0.0, 0.05, fFw * -1.0 + 0.05);
  pX = hd;
  float m = 0.009 + fFw * 0.7;
  float bulge = 0.75 + 0.25 * sin(fr.x * 3.14159) * sin(fr.y * 3.14159);
  return smoothstep(m, m + 0.035 + fFw, hd) * bulge;
}

float uWoodP(vec2 uv, vec2 ext, float planks) {
  // fGrain: 0 veio ao longo de x, 1 ao longo de y, 2 topo (anéis)
  if (fGrain > 1.5) { float r = length(uv) * 9.0 + uVN(uv * 3.0) * 1.5; pR = uH1(fSeed * 91.0); pX = 1.0; pY = fract(r);
    return 0.7 + 0.3 * (sin(r * 6.2831) * 0.5 + 0.5); }
  float a = fGrain < 0.5 ? uv.x : uv.y, c = fGrain < 0.5 ? uv.y : uv.x;
  float eA = fGrain < 0.5 ? ext.x : ext.y, eC = fGrain < 0.5 ? ext.y : ext.x;
  float bw = 1000.0, b = 0.0, fc = 0.5;
  if (planks > 0.5 && eC > 0.14) { float wrapC = (fWrap > 0.0 && fGrain > 0.5) ? fWrap : 0.0;
    float span = wrapC > 0.0 ? wrapC : 2.0 * eC; float n = max(1.0, floor(span / 0.21 + 0.5)); bw = span / n;
    float y = c + (wrapC > 0.0 ? 0.0 : eC); b = floor(y / bw); if (wrapC > 0.0) b = mod(b, n); fc = fract(y / bw); }
  float segL = 1.4 + uH1(b + fSeed * 61.0) * 2.6;
  float aa = a + eA + uH1(b * 3.0 + fSeed) * segL;
  float seg = floor(aa / segL), fa = fract(aa / segL);
  pR = uHs(vec3(b, seg, fSeed * 311.0));
  float w = bw < 100.0 ? min(fc, 1.0 - fc) * bw : 1.0;
  float wa = (bw < 100.0 && eA > 1.2) ? min(fa, 1.0 - fa) * segL : 1.0;
  float gap = smoothstep(0.003 + fFw * 0.6, 0.011 + fFw, min(w, wa));
  float fine = 1.0 - smoothstep(0.004, 0.03, fFw);
  float cc = c + pR * 10.0;
  float g1 = uVN(vec2(a * 0.6, cc * 30.0));
  float rings = sin((cc + uVN(vec2(a * 0.3, cc * 2.0)) * 0.4) * 80.0) * 0.5 + 0.5;
  float g = mix(0.5, g1 * 0.55 + rings * 0.45, fine);
  vec2 kp = vec2(a * 1.1, cc * 5.0); vec2 kf = fract(kp) - 0.5;
  float knot = uH2(floor(kp) + 5.0) > 0.86 ? smoothstep(0.2, 0.0, length(kf * vec2(1.0, 1.5))) : 0.0;
  pY = g * (1.0 - knot * 0.85); pX = gap;
  return gap * (0.8 + pY * 0.2);
}

float uTileP(vec2 uv, vec2 ext, float style) {
  float rh = style < 0.5 ? 0.30 : (style < 1.5 ? 0.25 : 0.21);
  float tw = style < 0.5 ? 0.25 : (style < 1.5 ? 0.20 : 0.30);
  float y = uv.y + ext.y;
  float row = floor(y / rh), fy = fract(y / rh);
  float x = uv.x + (fCone > 0.5 ? 0.0 : ext.x) + mod(row, 2.0) * 0.5 * tw + (uH1(row + fSeed * 17.0) - 0.5) * tw * 0.3;
  float col = floor(x / tw), fx = fract(x / tw);
  pR = uHs(vec3(col, row, fSeed * 53.0)); pY = fy;
  float h;
  if (style < 0.5) { float pr = sin(fx * 3.14159); h = 0.3 + 0.7 * pr; }
  else h = smoothstep(0.003 + fFw * 0.5, 0.011 + fFw, min(fx, 1.0 - fx) * tw);
  h *= 0.4 + 0.6 * smoothstep(0.0, 0.85, fy);
  h *= 1.0 - smoothstep(0.9, 1.0, fy) * 0.4;
  h -= step(0.94, pR) * smoothstep(0.5, 1.0, fy) * 0.35;
  return clamp(h, 0.0, 1.0);
}

float uRockP(vec3 p) {
  float n = uFbm3(p * 0.9);
  vec3 pw = p + (vec3(uVN3(p * 1.3), uVN3(p * 1.3 + 5.0), uVN3(p * 1.3 + 9.0)) - 0.5) * 0.6;
  float c = abs(uVN3(pw * 1.7 + 7.0) * 2.0 - 1.0);
  pX = (1.0 - smoothstep(0.0, 0.03 + fFw * 1.5, c)) * smoothstep(0.5, 0.7, uVN3(p * 0.6 + 19.0));
  pY = uVN3(p * 3.7 + 3.0);
  return n * 0.85 + uVN3(p * 6.5) * 0.15 - pX * 0.45;
}

float uBarkP(vec2 uv) {
  float u = uv.x * 7.0 + uVN(uv * vec2(1.5, 0.5)) * 2.5;
  float r = abs(fract(u) - 0.5) * 2.0;
  float n = uVN(vec2(u * 0.7, uv.y * 3.0));
  pY = n;
  return smoothstep(0.05, 0.85, r * 0.65 + n * 0.45);
}

// altura (metros) do relevo — chamada 3x para o bump
float uHeight(vec2 uv, vec3 p) {
  float h = 0.0;
  if (uK == 1 || uK == 23 || uK == 22 || uK == 17) {
    if (fTop > 0.5) h = uMason(uv, fExt, 0.0, uK == 17 ? 1.2 : 0.6, uK == 17 ? 1.2 : 0.85) * 0.03;
    else h = uMason(uv, fExt, fWrap, fExt.y > 3.0 ? 0.62 : 0.4, fExt.y > 3.0 ? 1.3 : 0.75) * (uK == 17 ? 0.012 : 0.035);
    if (uK == 1 || uK == 23) h += (uVN(uv * 6.0 + 13.0) - 0.5) * 0.008;
  } else if (uK == 25) {
    h = uMason(uv, fExt, 0.0, 0.55, 0.8) * 0.03 + (uVN(uv * 5.0) - 0.5) * 0.006;
  } else if (uK == 2) {
    h = uRockP(p) * 0.09;
  } else if (uK == 3 || uK == 24) {
    vec2 u2 = uK == 24 ? uv.yx : uv;
    float gs = fGrain; if (uK == 24 && fGrain < 1.5) fGrain = 1.0 - fGrain;
    h = uWoodP(u2, uK == 24 ? fExt.yx : fExt, 1.0) * 0.012;
    fGrain = gs;
  } else if (uK == 4) {
    float st = uVN(uv * 12.0) * 0.6 + uVN(uv * 31.0) * 0.4;
    float br = uMason(uv, fExt, 0.0, 0.075, 0.24);
    h = mix(0.012 + st * 0.004, br * 0.008, mA);
  } else if (uK == 5) {
    if (uF == 6) h = mC > 0.5 ? uVN(uv * vec2(0.9, 1.6) + fSeed * 3.0) * 0.05 + uVN(uv * 6.0) * 0.006 : uTileP(uv, fExt, mB) * 0.045;
    else h = uWoodP(uv, fExt, 1.0) * 0.01;
  } else if (uK == 12) {
    h = uBarkP(uv) * 0.04;
  } else if (uK == 8) {
    h = (sin(uv.x * 11.0 + uVN(uv * 1.7) * 4.0) * 0.5 + 0.5) * 0.02 + uVN(uv * 25.0) * 0.002;
  } else if (uK == 9) {
    h = uVN(vec2(uv.x * 2.0, uv.y * 38.0) + p.xz * 3.0) * 0.012;
  } else if (uK == 10) {
    h = uFbm(uv * 4.0) * 0.03;
  } else if (uK == 11 || uK == 13) {
    h = uVN3(p * 9.0) * 0.02;
  } else if (uK == 6 || uK == 7) {
    h = uVN(uv * 18.0) * 0.0015;
  } else if (uK == 14) {
    h = uVN3(p * 30.0) * 0.003;
  } else if (uK == 18) {
    h = (sin(uv.x * 9.0 + uTime * 1.3) + sin(uv.y * 7.0 - uTime * 1.1)) * 0.003;
  } else if (uK == 21) {
    h = uVN(uv * 3.0) * 0.02;
  }
  // bordas gastas/arredondadas (caixas)
  if ((uS == 1 || uS == 6) && uK != 20 && uK != 18) h -= (1.0 - smoothstep(0.0, uK == 3 || uK == 24 ? 0.025 : 0.05, uEdge(uv))) * 0.02;
  return h;
}

float wearE(vec2 uv) { return (uS == 1 || uS == 6) ? 1.0 - smoothstep(0.0, 0.35, uEdge(uv)) : 0.0; }
vec3 uSat(vec3 c, float s) { float l = uLum(c); return mix(vec3(l), c, s); }

// cor, aspereza, metal, brilho
void uSurface(inout vec3 alb, out float rough, out float metal, out vec3 emis, out float hc) {
  rough = 0.85; metal = 0.0; emis = vec3(0.0);
  vec2 uv = fUV; vec3 p = fP;
  vec3 W = vUW - uOrigin;
  float nY = fNW.y;
  // máscaras de baixa frequência
  mA = 0.0; mB = 0.0; mC = 0.0;
  if (uK == 4) mA = smoothstep(0.735, 0.76, uFbm(uv * 1.5 + fSeed * 9.0) + (1.0 - smoothstep(0.0, 1.0, fHg)) * 0.08 + wearE(uv) * 0.12);
  if (uK == 5) {
    float sat = length(alb - vec3(uLum(alb)));
    vec3 a2 = alb;
    // neve do Natal: a cor do telhado já veio clareada 82% para o branco — recupera a cor original da telha
    float isSnow = (uLum(alb) > 0.6 && sat < 0.08) ? 1.0 : 0.0;
    if (isSnow > 0.5) { a2 = clamp((alb - 0.82 * vec3(0.887, 0.922, 0.965)) / 0.18, 0.0, 1.0); sat = length(a2 - vec3(uLum(a2))); }
    mB = (a2.r > a2.g * 1.6 && sat > 0.08) ? 0.0 : (a2.b > a2.r * 0.95 ? 2.0 : 1.0);
    mC = isSnow;
    pY = 0.0;
  }
  hc = uHeight(uv, p);
  float wear = 1.0 - smoothstep(0.0, 0.06, uEdge(uv));
  if (uS != 1 && uS != 6) wear = 0.0;
  float n1 = uVN(uv * 2.3 + fSeed * 7.0), n2 = uVN(uv * 9.0 + 3.0);
  float fine = 1.0 - smoothstep(0.01, 0.05, fFw);

  if (uK == 1 || uK == 23 || uK == 22 || uK == 25) { // pedra lavrada / arenito / gelo / lajes
    float mortar = 1.0 - smoothstep(0.012, 0.05, pX);
    vec3 tint = vec3(1.0 + (pR2 - 0.5) * 0.22, 1.0 + (pR2 - 0.5) * 0.04, 1.0 - (pR2 - 0.5) * 0.2);
    vec3 st = alb * (0.7 + 0.5 * pR) * tint;
    st *= 0.84 + 0.32 * mix(0.5, uFbm(uv * 3.5 + pR * 9.0), fine);
    if (fine > 0.0) st *= 1.0 - 0.12 * smoothstep(0.62, 0.8, uVN(uv * 17.0 + pR * 5.0)) * fine; // poros/manchinhas
    st *= mix(0.72, 1.0, smoothstep(0.0, 0.07, pX)); // quina da pedra entrando na junta
    if (uK == 23) st *= 0.9 + 0.12 * sin(uv.y * 22.0 + n1 * 3.0); // estratos do arenito
    vec3 mo = mix(alb * 0.5, vec3(0.34, 0.32, 0.29) * (uLum(alb) * 2.2 + 0.2), 0.45);
    alb = mix(st, mo, mortar * fine * 0.85 + mortar * 0.15);
    alb = mix(alb, alb * 1.2 + 0.03, wear * (0.4 + 0.6 * n2));
    // líquen claro em manchas redondas
    if (fine > 0.0 && uClim.x > 0.0) { float lc = smoothstep(0.74, 0.79, uVN(uv * 5.0 + fSeed * 31.0 + pR * 3.0)) * (1.0 - mortar) * uClim.x * fine;
      alb = mix(alb, vec3(0.52, 0.52, 0.42) * (0.6 + 0.5 * n2), lc * 0.45); }
    // encardido escorrendo de cima (faces verticais)
    if (fTop < 0.5) { float fromTop = fExt.y - uv.y;
      float sk = smoothstep(0.45, 0.8, uVN(vec2(uv.x * 3.3 + fSeed * 7.0, uv.y * 0.22))) * (1.0 - smoothstep(0.0, 2.6, fromTop));
      alb *= 1.0 - (sk * 0.35 + (1.0 - smoothstep(0.0, 0.35, fromTop)) * 0.18) * uClim.z; }
    rough = 0.82 + 0.1 * pR - mortar * 0.05;
    if (uK == 22) { rough = 0.12 + 0.2 * mortar; alb = mix(alb, alb * vec3(0.85, 0.95, 1.1), 0.5); emis = alb * 0.05; }
  } else if (uK == 17) { // mármore
    float v = sin(uv.x * 2.5 + uv.y * 1.3 + uFbm(uv * 1.5 + fSeed) * 6.0);
    float vein = smoothstep(0.92, 1.0, abs(v)) * 0.5;
    alb = alb * (0.92 + 0.12 * n1) * (1.0 - vein * 0.4);
    rough = 0.28;
  } else if (uK == 2) { // rocha
    float n = uFbm3(p * 0.45);
    alb *= 0.68 + 0.55 * n;
    alb *= vec3(1.0 + (uVN3(p * 0.3 + 4.0) - 0.5) * 0.2, 1.0, 1.0 - (uVN3(p * 0.3 + 4.0) - 0.5) * 0.15);
    alb *= 1.0 - 0.15 * smoothstep(0.6, 0.8, uVN3(p * 11.0)) * fine;
    alb = mix(alb, alb * 0.5, pX * 0.6);
    float lich = smoothstep(0.72, 0.8, pY) * (0.3 + 0.7 * uClim.x);
    alb = mix(alb, vec3(0.55, 0.56, 0.45) * uLum(alb) * 2.2, lich * 0.6);
    rough = 0.9;
  } else if (uK == 3 || uK == 24) { // madeira
    float sat = length(alb - vec3(uLum(alb)));
    float painted = (alb.r < alb.g * 1.15 || sat > 0.22 || uLum(alb) > 0.45) ? 1.0 : 0.0;
    vec3 wood = alb * (0.7 + 0.55 * pY) * (0.85 + 0.3 * pR);
    vec3 gapC = alb * 0.3;
    if (painted > 0.5) {
      float chip = smoothstep(0.55, 0.62, uVN(uv * 6.0 + fSeed * 5.0) + wear * 0.45 + (1.0 - smoothstep(0.0, 0.6, fHg)) * 0.2);
      vec3 paint = alb * (0.88 + 0.12 * pR) * (0.95 + 0.08 * pY);
      wood = mix(paint, vec3(0.32, 0.24, 0.17) * (0.7 + 0.5 * pY), chip);
      rough = mix(0.6, 0.85, chip);
    } else rough = 0.72;
    alb = mix(gapC, wood, pX);
    alb = mix(alb, alb * 1.25 + 0.02, wear * 0.5 * (1.0 - painted));
  } else if (uK == 4) { // reboco de cal: manchado, grão fino, umidade subindo do chão e remendos com tijolo à mostra
    float big = uFbm(uv * 0.45 + fSeed * 9.0);
    vec3 pl = alb * (0.86 + 0.2 * big) * (0.96 + 0.07 * n2);
    pl *= 1.0 + (uH2(floor(uv * 140.0)) - 0.5) * 0.07 * fine;
    float damp = 1.0 - smoothstep(0.15, 0.75 + n1 * 0.6, fHg);
    pl = mix(pl, pl * vec3(0.74, 0.72, 0.68), damp * 0.55);
    float br = smoothstep(0.012, 0.03, pX);
    vec3 brick = mix(vec3(0.30, 0.13, 0.07), vec3(0.42, 0.2, 0.11), pR) * (0.8 + 0.3 * pR2);
    brick = mix(vec3(0.42, 0.40, 0.36), brick, br);
    float rim = smoothstep(0.0, 0.15, mA) * (1.0 - smoothstep(0.5, 1.0, mA));
    alb = mix(pl, brick, mA);
    alb *= 1.0 - rim * 0.3;
    rough = 0.93;
  } else if (uK == 5) { // telhado
    if (uF == 6) {
      vec3 base = alb;
      if (mC > 0.5) base = clamp((alb - 0.82 * vec3(0.887, 0.922, 0.965)) / 0.18, 0.0, 1.0);
      vec3 tile = base * (0.72 + 0.5 * pR) * (0.75 + 0.35 * smoothstep(0.0, 0.8, pY));
      if (mB < 0.5) tile *= vec3(1.0 + (pR - 0.5) * 0.15, 1.0, 1.0 - (pR - 0.5) * 0.1);
      if (mB > 1.5) tile = mix(tile, tile * vec3(0.9, 0.92, 1.12), pR);
      tile = mix(tile * 0.35, tile, smoothstep(0.15, 0.6, hc / 0.045));
      float moss = smoothstep(0.62, 0.75, uFbm(uv * 0.8 + fSeed * 4.0) + smoothstep(0.0, 1.0, uv.y / max(fExt.y, 0.1)) * 0.15) * uClim.x * (1.0 - mC);
      tile = mix(tile, uMossC * (0.6 + 0.6 * n2), moss * 0.8);
      alb = tile; rough = mB > 1.5 ? 0.5 : (mB > 0.5 ? 0.8 : 0.7);
      if (mC > 0.5) { // neve fofa cobrindo o telhado (montes do vento), só a última fiada de telhas aparece na beirada
        alb *= 0.6; rough = 0.35; // telha molhada
        float eave = smoothstep(fExt.y - 0.32, fExt.y - 0.04, uv.y);
        float cover = clamp(1.0 - eave * 0.9, 0.0, 1.0);
        cover = smoothstep(0.2, 0.5, cover + (n2 - 0.5) * 0.2);
        float drift = uVN(uv * vec2(0.9, 1.6) + fSeed * 3.0);
        vec3 snow = vec3(0.86, 0.89, 0.94) * (0.84 + 0.16 * drift) * (0.97 + 0.04 * uVN(uv * 7.0));
        alb = mix(alb, snow, cover);
        rough = mix(rough, 0.62, cover);
        float sp = step(0.985, uH2(floor(uv * 90.0))) * cover * fine;
        rough = mix(rough, 0.1, sp);
      }
    } else {
      alb = alb * (0.75 + 0.4 * pY) * (0.85 + 0.3 * pR); rough = 0.8;
    }
  } else if (uK == 6) { // metal (ferro)
    float rust = smoothstep(0.55, 0.75, uFbm(uv * 3.0 + fSeed * 3.0) + (1.0 - smoothstep(0.0, 0.8, fHg)) * 0.3);
    alb = mix(alb * (0.9 + 0.2 * n2), vec3(0.32, 0.16, 0.08), rust * 0.75);
    rough = mix(0.42, 0.9, rust); metal = mix(0.55, 0.1, rust);
    alb = mix(alb, alb * 1.6 + 0.04, wear * 0.6);
  } else if (uK == 7) { // ouro / latão
    alb *= 0.9 + 0.15 * n1; rough = 0.28 + 0.15 * n2; metal = 0.85;
  } else if (uK == 8) { // pano
    float fold = hc / 0.02;
    alb *= (0.72 + 0.4 * fold) * (0.92 + 0.12 * n2);
    alb = mix(alb, alb * 0.6, (1.0 - smoothstep(0.0, 0.9, fHg)) * 0.4);
    rough = 0.95;
  } else if (uK == 9) { // palha / feno / trigo
    float s = uVN(vec2(uv.x * 2.0, uv.y * 38.0) + p.xz * 3.0);
    alb *= 0.7 + 0.55 * s; rough = 0.95;
  } else if (uK == 10) { // terra
    alb *= 0.7 + 0.5 * uFbm(uv * 4.0);
    float pb = step(0.93, uH2(floor(uv * 14.0)));
    alb = mix(alb, vec3(0.42, 0.4, 0.37), pb * 0.6 * fine);
    rough = 0.97;
  } else if (uK == 11 || uK == 13) { // folhas / musgo
    float n = uVN3(p * 9.0);
    alb *= 0.6 + 0.7 * n; rough = 0.9;
  } else if (uK == 12) { // casca
    float f = hc / 0.04;
    alb *= 0.45 + 0.75 * f; alb *= 0.9 + 0.2 * pY;
    float moss = smoothstep(0.6, 0.75, uFbm(uv * 1.2) + (1.0 - smoothstep(0.0, 1.5, fHg)) * 0.25) * uClim.x;
    alb = mix(alb, uMossC, moss * 0.7);
    rough = 0.95;
  } else if (uK == 14) { // osso
    alb *= 0.85 + 0.2 * uVN3(p * 25.0); rough = 0.7;
  } else if (uK == 15) { rough = 0.06; alb *= 0.85; emis = alb * 0.08; } // vidro
  else if (uK == 16) { rough = 0.1; emis = alb * (0.25 + 0.15 * uVN3(p * 2.0 + uTime * 0.2)); alb *= 0.8; metal = 0.1; } // cristal
  else if (uK == 18) { alb *= 0.6; rough = 0.04; } // água
  else if (uK == 19) { // papel (cartazes): linhas de texto
    float ln = step(0.5, fract(uv.y * 9.0)) * step(abs(uv.x), fExt.x * 0.7) * step(uv.y, -fExt.y * 0.05) * step(0.35, uVN(vec2(uv.x * 14.0, floor(uv.y * 9.0))));
    alb *= (0.9 + 0.1 * n2) * (1.0 - ln * 0.55); alb = mix(alb, alb * 0.7, wear); rough = 0.9;
  } else if (uK == 21) { alb *= 0.95 + 0.06 * n2; rough = 0.6; } // neve
  else if (uK == 26) { emis = alb * (0.6 + 0.4 * uVN(uv * 0.7 + uTime * 0.3)); rough = 0.6; } // lava
  else if (uK == 0) { alb *= 0.92 + 0.12 * n1; rough = 0.7; }

  // ---------- camadas de tempo (sujeira, escorridos, musgo, neve, sombra de contato) ----------
  if (uK != 20 && uK != 15 && uK != 16 && uK != 18 && uK != 26) {
    float vert = 1.0 - smoothstep(0.35, 0.7, abs(nY));
    // sujeira e respingo de barro perto do chão
    float g = (1.0 - smoothstep(0.0, 0.7 + n1 * 0.7, fHg)) * vert;
    alb = mix(alb, alb * uDirtC * 1.7, g * 0.55);
    // escorridos de chuva nas paredes
    if (uK == 1 || uK == 4 || uK == 23 || uK == 3 || uK == 25) {
      float s = smoothstep(0.58, 0.85, uVN(vec2(uv.x * 2.2 + fSeed * 3.0, uv.y * 0.25 + fSeed)));
      alb *= 1.0 - s * 0.22 * vert * uClim.z;
    }
    // musgo: nas pedras de baixo e nos topos
    if (uK == 1 || uK == 2 || uK == 25 || uK == 23) {
      float top = smoothstep(0.55, 0.9, nY);
      float low = 1.0 - smoothstep(0.0, 1.1, fHg);
      float m = smoothstep(0.62, 0.8, uFbm(W.xz * 0.35 + W.y * 0.4) * 0.8 + n2 * 0.22 + top * 0.25 + low * 0.14) * uClim.x * (1.0 - fSnow * 0.8);
      alb = mix(alb, uMossC * (0.55 + 0.7 * n2), m * 0.85);
      rough = mix(rough, 0.95, m);
      hc += m * 0.006;
    }
    // sombra de contato: base de cada face vertical (encaixe entre peças) e pé no chão
    if (uS == 1 && fTop < 0.5 && uF != 3) {
      float base = uv.y + fExt.y;
      alb *= mix(0.72, 1.0, smoothstep(0.0, 0.35, base));
    }
    alb *= mix(0.68, 1.0, smoothstep(0.0, 0.45, fHg + (1.0 - vert)));
    // neve do Natal (vila): topos brancos
    if (fSnow > 0.01 && uK != 5 && uK != 21) {
      float sn = smoothstep(0.55, 0.85, nY + (n1 - 0.5) * 0.3) * fSnow;
      alb = mix(alb, vec3(0.9, 0.93, 0.97) * (0.93 + 0.07 * n2), sn);
      rough = mix(rough, 0.6, sn);
    }
  }
}

vec3 uPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// injeção no fragment shader (depois da cor por vértice)
const FRAG_SURF = /* glsl */`
  uFaceSetup();
  vec2 uDx = dFdx(fUV), uDy = dFdy(fUV);
  vec3 wDx = dFdx(vUW), wDy = dFdy(vUW);
  fNW = normalize(cross(wDx, wDy));
  if (dot(fNW, cameraPosition - vUW) < 0.0) fNW = -fNW;
  fFw = max(length(uDx), length(uDy));
  float uDist = length(vUW - cameraPosition);
  float uLod = 1.0 - smoothstep(30.0, 70.0, uDist);
  vec3 uAlb = diffuseColor.rgb; float uRough, uMetal, uHc; vec3 uEmis;
  uSurface(uAlb, uRough, uMetal, uEmis, uHc);
  diffuseColor.rgb = uAlb;
  // relevo: derivada na tela da altura já calculada (barato: sem reavaliar o padrão), some com a distância
  vec2 uDH = uK != 20 ? vec2(dFdx(uHc), dFdy(uHc)) * uLod : vec2(0.0);
`;

const VERT_PARS = /* glsl */`
#ifdef UCONST
uniform vec3 uCK; // tipo, semente, chão (altura y)
#else
attribute vec3 aUL; attribute vec3 aUH; attribute vec4 aUK;
#endif
varying vec3 vUL; varying vec3 vUH; varying vec4 vUK; varying vec3 vUW;
`;
const VERT_MAIN = /* glsl */`
  vUW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifdef UCONST
  vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  vUL = position * sc; vUH = 0.5 * sc;
  vec3 an = abs(normal);
  float face = an.x > an.y && an.x > an.z ? (normal.x > 0.0 ? 0.0 : 1.0) : (an.y > an.z ? (normal.y > 0.0 ? 2.0 : 3.0) : (normal.z > 0.0 ? 4.0 : 5.0));
  vUK = vec4(uCK.x + 32.0 + 256.0 * face, uCK.y, vUW.y - uCK.z, 0.0);
#else
  vUL = aUL; vUH = aUH; vUK = aUK;
#endif
`;

const SEE_FRAG = /* glsl */`
  { vec3 ab = uHero - uCam; float L = length(ab); vec3 dr = ab / max(L, 0.001); float s = dot(vUW - uCam, dr);
    if (s > 0.0 && s < L - 0.7 && vUW.y > uHero.y - 0.85) { float r = length(vUW - (uCam + dr * s)); float R = mix(0.6, 2.6, clamp(s / L, 0.0, 1.0));
      float n = fract(sin(dot(floor(gl_FragCoord.xy * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
      if (r < R - 0.5 + n * 0.5) discard; } }
`;

// clima por material: x = musgo, y = poeira, z = escorridos; cores do musgo e da sujeira
export const CLIMATES = {
  vale: { clim: [0.8, 0.2, 1, 0], moss: 0x4e6a2c, dirt: 0x5a4a38 },
  vila: { clim: [0.35, 0.2, 0.8, 0], moss: 0x4e6a2c, dirt: 0x5a4a38 },
  guardiao: { clim: [0.45, 0.3, 0.8, 0], moss: 0x5a4a6a, dirt: 0x3e3446 },
  ermos: { clim: [0.3, 0.6, 0.6, 0], moss: 0x4a3e5a, dirt: 0x3a3236 },
  cripta: { clim: [0.6, 0.1, 1, 0], moss: 0x3e5230, dirt: 0x2c2620 },
  deserto: { clim: [0.0, 0.8, 0.3, 0], moss: 0x8a7040, dirt: 0x8a6a40 },
  tundra: { clim: [0.1, 0.1, 0.6, 0], moss: 0x8aa0b0, dirt: 0x6a7480 },
  vulcao: { clim: [0.0, 0.8, 0.4, 0], moss: 0x2a1a14, dirt: 0x1e1612 },
  floresta: { clim: [1.0, 0.1, 1, 0], moss: 0x3e6a2a, dirt: 0x3e3424 },
  pantano: { clim: [1.0, 0.1, 1, 0], moss: 0x4a5a26, dirt: 0x34301e },
  planicie: { clim: [0.5, 0.3, 0.8, 0], moss: 0x5a6a2c, dirt: 0x6a5838 },
  pico: { clim: [0.2, 0.2, 0.6, 0], moss: 0x5a5a7a, dirt: 0x4a4458 },
};

const CACHE = new Map();
// opts: { climate, see (atravessar parede dos Confins), konst (tipo fixo p/ malhas soltas), origin, uni (uTime/uUltra do mundo) }
export function structMaterial(world, opts = {}) {
  const key = JSON.stringify([opts.climate || 'vale', !!opts.see, opts.konst ?? null, opts.origin || null, opts.color ?? null]);
  if (CACHE.has(key) && !opts.fresh) return CACHE.get(key);
  const C = CLIMATES[opts.climate || 'vale'] || CLIMATES.vale;
  const konst = opts.konst != null;
  const m = new THREE.MeshStandardMaterial({ vertexColors: !konst, roughness: 1, metalness: 0, color: opts.color ?? 0xffffff });
  const U = {
    uTime: world.uniforms.uTime, uNight: opts.night || { value: 0 },
    uClim: { value: new THREE.Vector4(...C.clim) }, uOrigin: { value: new THREE.Vector3(...(opts.origin || [0, 0, 0])) },
    uMossC: { value: new THREE.Color(C.moss) }, uDirtC: { value: new THREE.Color(C.dirt) },
    uCK: { value: new THREE.Vector3(opts.konst || 0, opts.seed || 0.37, opts.ground || 0) },
  };
  m.userData.U = U;
  if (konst) m.defines = { UCONST: '' };
  if (opts.see) { m.defines = { ...(m.defines || {}), USEE: '' }; U.uCam = opts.see.uCam; U.uHero = opts.see.uHero; }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS + (opts.see ? '\nuniform vec3 uCam; uniform vec3 uHero;\n' : ''))
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + (opts.see ? SEE_FRAG : ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SURF)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = uRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = uMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uS == 3 || uS == 5) normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));\nnormal = uPerturb(-vViewPosition, normal, uDH, faceDirection);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEmis;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if !defined( USE_ENVMAP ) && NUM_HEMI_LIGHTS > 0
        { vec3 rv = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
          float w = smoothstep(-0.25, 0.5, rv.y);
          radiance += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, w) * 0.32; }
        #endif`);
  };
  m.customProgramCacheKey = () => 'ultra-estr-v2' + (konst ? 'k' : '') + (opts.see ? 's' : '');
  CACHE.set(key, m);
  return m;
}
