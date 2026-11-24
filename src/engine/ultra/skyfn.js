// =============================================================
// Ultra realismo — modelo de céu "físico" barato (espalhamento Rayleigh + Mie de uma volta),
// o MESMO em GLSL (domo do céu, reflexo da água, neblina do pós) e em JS (cor do sol, luz do céu, neblina).
// Tudo em luz linear HDR: o pós-processamento faz a exposição e o tone mapping.
// =============================================================
import * as THREE from 'three';

// espessura óptica no zênite (ajustada a olho): azul forte no alto, horizonte claro, pôr do sol laranja
export const SKY = {
  R: [0.050, 0.118, 0.300], // Rayleigh por canal (vermelho, verde, azul)
  M: 0.040,                 // Mie (névoa/poeira) — halo branco em volta do sol
  O: [0.026, 0.068, 0.003], // "ozônio": tira um pouco de laranja e deixa o zênite azul no crepúsculo
  E: 14.0,                  // força do sol no céu
};

export const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir;   // direção do sol (pode estar abaixo do horizonte à noite)
uniform vec3 uMoonDir;  // direção da lua (a mesma da luz da noite)
uniform float uNight;   // 0 dia, 1 noite
uniform float uOver;    // tempo fechado (0–1)
uniform float uRain;    // chuva (0–1)
uniform float uCorrupt; // região corrompida (roxa)
uniform vec3 uSkyTint;  // tom do mapa (multiplica o céu)
uniform float uFlash;   // relâmpago
const vec3 SKY_R = vec3(${SKY.R.join(', ')});
const float SKY_M = ${SKY.M.toFixed(4)};
const vec3 SKY_O = vec3(${SKY.O.join(', ')});
float skyAirmass(float cy) {
  cy = clamp(cy, 0.0, 1.0);
  float z = degrees(acos(cy));
  return 1.0 / (cy + 0.50572 * pow(max(96.07995 - z, 0.5), -1.6364));
}
// sol baixo: ar mais grosso e poeirento que a conta "limpa" (deixa a hora dourada e o pôr do sol bem quentes)
float sunAirmass(float sy) { return skyAirmass(sy) * (1.0 + 1.3 * (1.0 - smoothstep(0.0, 0.6, sy))); }
vec3 skySunTrans(float sy) { // cor do sol depois de atravessar o ar
  float m = sunAirmass(sy);
  return exp(-(SKY_R + SKY_M + SKY_O) * m);
}
// céu sem o disco do sol (radiância linear)
vec3 skyRadiance(vec3 v) {
  float cy = max(v.y, 0.0);
  float mv = skyAirmass(cy + 0.02);
  float sy = uSunDir.y;
  float sunUp = smoothstep(-0.16, 0.04, sy);
  // olhar para cima: o ar lá no alto recebe sol que passou por menos atmosfera (zênite azul no crepúsculo)
  float ms = skyAirmass(max(sy, 0.0)) * mix(1.0, 0.45, sqrt(cy));
  vec3 sunT = exp(-(SKY_R + SKY_M + SKY_O) * ms);
  vec3 tau = SKY_R + SKY_M;
  vec3 extV = exp(-tau * mv);
  float mu = dot(v, uSunDir);
  float pR = 0.0597 * (1.0 + mu * mu);
  const float g = 0.78;
  float pM = 0.0716 * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5));
  vec3 lin = (SKY_R * pR + SKY_M * pM) / tau * (1.0 - extV) * sunT;
  // luz que já espalhou várias vezes (sem ela o céu baixo do crepúsculo fica preto)
  // (essa luz vem do alto do céu, que recebe o sol menos avermelhado: o céu baixo fica azul-claro, não "oliva")
  vec3 sunTh = exp(-(SKY_R + SKY_M + SKY_O) * skyAirmass(max(sy, 0.0)) * 0.4);
  lin += sunTh * SKY_R * (0.05 + 0.07 * (1.0 - cy)) * (1.0 - extV * 0.5);
  vec3 day = lin * ${SKY.E.toFixed(2)} * sunUp;
  // crepúsculo: faixa quente no horizonte do lado do sol, mesmo com o sol já escondido
  float tw = smoothstep(-0.2, -0.02, sy) * (1.0 - smoothstep(0.08, 0.42, sy));
  day += vec3(0.9, 0.38, 0.16) * tw * pow(1.0 - cy, 6.0) * (0.25 + 0.75 * pow(max(mu, 0.0), 2.0)) * 0.55;
  // noite: azul fundo, horizonte um pouco mais claro, halo da lua
  float md = max(dot(v, uMoonDir), 0.0);
  vec3 nite = mix(vec3(0.0035, 0.0062, 0.018), vec3(0.016, 0.024, 0.052), pow(1.0 - cy, 3.0));
  nite += vec3(0.05, 0.065, 0.11) * (pow(md, 6.0) * 0.18 + pow(md, 60.0) * 0.6);
  vec3 c = day + nite * smoothstep(0.0, 1.0, uNight);
  // tempo fechado: cinza (mantém o brilho médio, perde a cor) e escurece
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 grey = vec3(lum) * vec3(0.92, 0.96, 1.04) * mix(0.75, 0.42, uRain);
  c = mix(c, grey, clamp(uOver, 0.0, 1.0) * 0.9);
  // região corrompida: horizonte violeta
  c = mix(c, c * vec3(1.05, 0.62, 1.25) + vec3(0.02, 0.0, 0.035) * (1.0 - uNight * 0.7), uCorrupt * 0.6 * (1.0 - cy * 0.6));
  c *= uSkyTint;
  c += vec3(0.75, 0.8, 1.0) * uFlash * (0.6 + cy);
  return c;
}
`;

// ----- espelho em JS (para a cor do sol, luz do céu/hemisfério e neblina) -----
const deg = 180 / Math.PI;
export function airmass(cy) {
  cy = Math.min(1, Math.max(0, cy));
  const z = Math.acos(cy) * deg;
  return 1 / (cy + 0.50572 * Math.pow(Math.max(96.07995 - z, 0.5), -1.6364));
}
const sm0 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const sunAirmass = (sy) => airmass(sy) * (1 + 1.3 * (1 - sm0(0, 0.6, sy)));
const _t = [0, 0, 0];
export function sunTrans(sy, out = _t) {
  const m = sunAirmass(sy);
  for (let i = 0; i < 3; i++) out[i] = Math.exp(-(SKY.R[i] + SKY.M + SKY.O[i]) * m);
  return out;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// radiância do céu numa direção (mesma conta do GLSL, sem relâmpago/estrelas)
export function skyRadiance(vx, vy, vz, S, out) {
  const cy = Math.max(vy, 0), mv = airmass(cy + 0.02), sy = S.sun.y, sunUp = sm(-0.16, 0.04, sy);
  const mh = airmass(Math.max(sy, 0)), ms = mh * (1 + (0.45 - 1) * Math.sqrt(cy));
  const mu = vx * S.sun.x + vy * S.sun.y + vz * S.sun.z;
  const pR = 0.0597 * (1 + mu * mu), g = 0.78;
  const pM = 0.0716 * (1 - g * g) * (1 + mu * mu) / ((2 + g * g) * Math.pow(Math.max(1 + g * g - 2 * g * mu, 1e-4), 1.5));
  const tw = sm(-0.2, -0.02, sy) * (1 - sm(0.08, 0.42, sy)), twk = tw * Math.pow(1 - cy, 6) * (0.25 + 0.75 * Math.max(mu, 0) ** 2) * 0.55;
  const md = Math.max(0, vx * S.moon.x + vy * S.moon.y + vz * S.moon.z);
  const nk = sm(0, 1, S.night), ph = Math.pow(1 - cy, 3), halo = Math.pow(md, 6) * 0.18 + Math.pow(md, 60) * 0.6;
  const NL = [0.0035, 0.0062, 0.018], NH = [0.016, 0.024, 0.052], NM = [0.05, 0.065, 0.11], TW = [0.9, 0.38, 0.16];
  let lum = 0;
  for (let i = 0; i < 3; i++) {
    const R = SKY.R[i], tau = R + SKY.M, sunT = Math.exp(-(R + SKY.M + SKY.O[i]) * ms), extV = Math.exp(-tau * mv);
    let lin = (R * pR + SKY.M * pM) / tau * (1 - extV) * sunT;
    const sunTh = Math.exp(-(R + SKY.M + SKY.O[i]) * mh * 0.4);
    lin += sunTh * R * (0.05 + 0.07 * (1 - cy)) * (1 - extV * 0.5);
    out[i] = lin * SKY.E * sunUp + TW[i] * twk + (NL[i] + (NH[i] - NL[i]) * ph + NM[i] * halo) * nk;
  }
  lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  const GK = [0.92, 0.96, 1.04], gm = 0.75 + (0.42 - 0.75) * S.rain, ov = Math.min(1, Math.max(0, S.over)) * 0.9;
  const cor = S.corrupt * 0.6 * (1 - cy * 0.6), CM = [1.05, 0.62, 1.25], CA = [0.02, 0, 0.035];
  for (let i = 0; i < 3; i++) {
    let c = out[i] + (lum * GK[i] * gm - out[i]) * ov;
    c = c + (c * CM[i] + CA[i] * (1 - S.night * 0.7) - c) * cor;
    out[i] = c * S.tint[i];
  }
  return out;
}

// média do céu (para a luz do hemisfério e a cor da neblina)
const _o = [0, 0, 0];
export function skyAverages(S, sky, hor) {
  sky[0] = sky[1] = sky[2] = 0; hor[0] = hor[1] = hor[2] = 0;
  const dirs = [[0, 1, 0, 2], [0.7, 0.7, 0, 1], [-0.7, 0.7, 0, 1], [0, 0.7, 0.7, 1], [0, 0.7, -0.7, 1]];
  let w = 0;
  for (const [x, y, z, k] of dirs) { skyRadiance(x, y, z, S, _o); for (let i = 0; i < 3; i++) sky[i] += _o[i] * k; w += k; }
  for (let i = 0; i < 3; i++) sky[i] /= w;
  // horizonte: média em 6 direções (com e sem o sol)
  for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2; skyRadiance(Math.cos(t), 0.04, Math.sin(t), S, _o); for (let i = 0; i < 3; i++) hor[i] += _o[i] / 6; }
}

export function makeSkyUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uOver: { value: 0 }, uRain: { value: 0 },
    uCorrupt: { value: 0 }, uSkyTint: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 },
  };
}
