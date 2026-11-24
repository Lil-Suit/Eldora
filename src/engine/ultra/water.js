// =============================================================
// Ultra realismo — água de verdade (Vale, Ermos e Confins; a lava do vulcão fica como era).
// Um só shader barato: ondas por pixel (textura de normais feita aqui, 3 camadas que andam),
// fresnel (de frente vê o fundo, de lado vira espelho), reflexo do céu físico (o mesmo do domo),
// margem escura onde o reflexo seria dos morros/árvores, cor pela profundidade (raso claro, fundo escuro),
// espuma nas margens, brilho do sol (ou trilha da lua) em HDR para o bloom.
// Profundidade: uma janela de 240 m em volta da câmera com a altura do chão (refeita aos poucos ao andar).
// Cada mapa mantém a cor da sua água (azul no Vale, violeta nos Ermos, a do bioma nos Confins).
// =============================================================
import * as THREE from 'three';
import { SKY_GLSL } from './skyfn.js';
import { WORLD, ERMOS, CONFINS } from '../../config/world.js';
import { CONFINS_BIOMES } from '../confins.js';

const WN = 160, WS = 1.5, WSIZE = WN * WS, DMAX = 8; // janela de profundidade: 160×160 texels de 1,5 m

// textura de ondas que emenda nas bordas (soma de ondas com frequência inteira) + ruído para a espuma
function waveTexture() {
  const S = 128, d = new Uint8Array(S * S * 4);
  let s = 99; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = [];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, f = 1 + Math.floor(rnd() * (i < 8 ? 4 : 11));
    const kx = Math.round(Math.cos(a) * f), kz = Math.round(Math.sin(a) * f);
    if (!kx && !kz) continue;
    W.push([kx, kz, 1 / Math.pow(Math.hypot(kx, kz), 1.15), rnd() * 6.283]);
  }
  const F = [];
  for (let i = 0; i < 18; i++) { const a = rnd() * 6.283, f = 3 + Math.floor(rnd() * 9); F.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), rnd() * 6.283]); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dz = 0, fo = 0;
    for (const [kx, kz, A, p] of W) { const t = ((kx * x + kz * y) / S) * 6.2832 + p, c = Math.cos(t) * A; dx += c * kx; dz += c * kz; }
    for (const [kx, kz, p] of F) fo += Math.sin(((kx * x + kz * y) / S) * 6.2832 + p);
    const i = (y * S + x) * 4;
    d[i] = Math.max(0, Math.min(255, 128 + dx * 9)); d[i + 1] = Math.max(0, Math.min(255, 128 + dz * 9));
    d[i + 2] = Math.max(0, Math.min(255, 128 + fo * 30)); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
${SKY_GLSL}
uniform sampler2D tN; uniform sampler2D tDepth; uniform vec3 uWin; uniform float uTime;
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uAmb; uniform vec3 uShore;
uniform vec3 uScatter; uniform vec3 uAbsorb; uniform float uFoam; uniform float uRough; uniform float uIce;
varying vec3 vW;
#include <fog_pars_fragment>
vec2 wn(vec2 uv) { return texture2D(tN, uv).rg * 2.0 - 1.0; }
void main() {
  vec2 p = vW.xz;
  vec3 V0 = cameraPosition - vW; float dist = length(V0); vec3 V = V0 / dist;
  // ondas: três camadas andando em direções diferentes (longe: mais lisas, sem chiar)
  vec2 nn = wn(p * 0.035 + uTime * vec2(0.010, 0.006)) * 0.55 + wn(p * 0.09 + uTime * vec2(-0.013, 0.017)) * 0.35 + wn(p * 0.27 + uTime * vec2(0.026, -0.021)) * 0.22;
  nn *= mix(1.0, 0.3, smoothstep(25.0, 160.0, dist)) * uRough;
  vec3 N = normalize(vec3(nn.x, 1.0, nn.y));
  float cv = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.62 * pow(1.0 - cv, 5.0); // (ondas miúdas espalham o reflexo: menos espelho que o fresnel liso)
  F = mix(F, 0.06 + 0.5 * pow(1.0 - cv, 3.0), uIce);
  // reflexo: céu físico; perto do horizonte o que se reflete são os morros e as árvores da margem
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyRadiance(normalize(vec3(R.x, max(R.y, 0.0), R.z)));
  refl = mix(uShore, refl, smoothstep(0.02, 0.38, R.y) * 0.88 + 0.12);
  // profundidade (janela em volta da câmera; fora dela, água funda)
  vec2 wuv = (p - uWin.xy) / uWin.z + 0.5;
  float inW = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
  float d = mix(${DMAX.toFixed(1)}, texture2D(tDepth, wuv).r * ${DMAX.toFixed(1)}, inW);
  float path = d / max(V.y, 0.1) + d;
  vec3 T = exp(-uAbsorb * path);
  float tr = dot(T, vec3(0.25, 0.5, 0.25));
  // luz que entra e volta espalhada (cor da água do mapa): mais forte no fundo
  vec3 E = uLightCol * max(uLightDir.y, 0.0) + uAmb;
  vec3 scat = uScatter * E * (1.0 - T) * 0.48;
  // espuma: faixa na margem que respira, quebrada pelo ruído
  float fn = texture2D(tN, p * 0.16 + vec2(uTime * 0.013, -uTime * 0.009)).b + texture2D(tN, p * 0.41 - uTime * 0.02).b * 0.5 - 0.75;
  float edge = d + fn * 0.18 + sin(d * 12.0 - uTime * 1.3) * 0.03;
  float foam = (smoothstep(0.16, 0.02, edge) * 0.7 + smoothstep(0.4, 0.15, edge) * smoothstep(0.2, 0.5, fn) * 0.25) * uFoam;
  foam *= smoothstep(0.0, 0.03, d) * (1.0 - smoothstep(60.0, 140.0, dist));
  // brilho do sol/lua na água (Blinn normalizado: pico forte para o bloom e a trilha larga)
  vec3 H = normalize(V + uLightDir);
  float nh = max(dot(N, H), 0.0), nl = max(dot(N, uLightDir), 0.0);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  float spec = (36.0 * pow(nh, 900.0) + 1.3 * pow(nh, 70.0)) * Fh * nl;
  vec3 col = refl * F + scat * (1.0 - F) + uLightCol * spec * (1.0 - foam);
  float a = 1.0 - tr * (1.0 - F);
  vec3 fcol = (uLightCol * (nl * 0.8 + 0.2) + uAmb) * 0.26;
  col = mix(col, fcol, foam); a = mix(a, 1.0, foam * 0.85);
  a = mix(a, 1.0, uIce * 0.6);
  a *= smoothstep(0.0, 0.025, d + 0.01); // sem linha dura onde a água encosta no chão
  col *= smoothstep(0.0, 0.025, d + 0.01);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col = mix(col, fogColor * a, fogFactor);
  #endif
  gl_FragColor = vec4(col, a); // pré-multiplicado
}`;

export class UltraWater {
  constructor(G) {
    this.G = G; this.on = false;
    this.tN = waveTexture();
    this.depth = new Uint8Array(WN * WN); this.build = new Uint8Array(WN * WN);
    this.tDepth = new THREE.DataTexture(this.depth, WN, WN, THREE.RedFormat, THREE.UnsignedByteType);
    this.tDepth.magFilter = this.tDepth.minFilter = THREE.LinearFilter; this.tDepth.needsUpdate = true;
    this.win = new THREE.Vector3(1e9, 1e9, WSIZE);
    this.job = null; this.winArea = null;
    this.mats = new Map(); this.swapped = [];
    this.time = { value: 0 };
    this.lightDir = { value: new THREE.Vector3(0, 1, 0) }; this.lightCol = { value: new THREE.Color() };
    this.amb = { value: new THREE.Color() }; this.shore = { value: new THREE.Color() };
  }

  // material para uma água (cor da água do lugar; nitidez; gelo da tundra)
  material(key, color, o = {}) {
    if (this.mats.has(key)) return this.mats.get(key);
    const U = this.G.sky.uU, c = new THREE.Color(color);
    const sc = c.clone().multiplyScalar(o.bright ?? 1);
    // a água absorve o vermelho primeiro; a cor do mapa decide quanto de cada canal some
    const ab = new THREE.Vector3(0.42 - c.r * 0.3, 0.16 - c.g * 0.08, 0.1 - c.b * 0.05).multiplyScalar(o.murk ?? 1);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uNight: U.uNight, uOver: U.uOver, uRain: U.uRain, uCorrupt: U.uCorrupt, uSkyTint: U.uSkyTint, uFlash: U.uFlash,
        tN: { value: this.tN }, tDepth: { value: this.tDepth }, uWin: { value: this.win }, uTime: this.time,
        uLightDir: this.lightDir, uLightCol: this.lightCol, uAmb: this.amb, uShore: this.shore,
        uScatter: { value: sc }, uAbsorb: { value: ab }, uFoam: { value: o.foam ?? 1 }, uRough: { value: o.rough ?? 1 }, uRoughBase: { value: o.rough ?? 1 }, uIce: { value: o.ice ?? 0 },
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    m.name = 'agua-ultra'; m.userData.B = o.B; this.mats.set(key, m);
    return m;
  }

  swap(mesh, m) { if (!mesh || mesh.material === m) return; mesh.userData.mat0 = mesh.material; mesh.material = m; this.swapped.push(mesh); }

  enable() {
    if (this.on) return; this.on = true;
    const W = this.G.world;
    // Vale (o lago e o rio)
    const vale = W.group?.getObjectByName('agua');
    this.swap(vale, this.material('vale', 0x3b93bd, { foam: 1 }));
    // Ermos (água violeta, parada e turva)
    const eg = W.ermosGroup;
    if (eg) for (const o of eg.children) if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && Math.abs(o.position.y - ERMOS.waterLevel) < 0.01) this.swap(o, this.material('ermos', 0x5a3a8a, { murk: 1.5, rough: 0.6, foam: 0.6, bright: 1.2 }));
    // Confins: cada bioma com a sua cor (a lava continua lava); pedaços novos já nascem com a água nova
    const C = W.confins;
    if (C) {
      C.ultraWater = (B) => B.id === 'vulcao' ? null : this.material('c-' + B.id, B.water, B.id === 'tundra' ? { B, ice: 1, rough: 0.35, foam: 0.3 } : B.id === 'pantano' ? { B, murk: 2.2, rough: 0.5, foam: 0.4 } : { B });
      for (const B of CONFINS_BIOMES) {
        const m0 = C.waterMats?.[B.id], um = m0 && C.ultraWater(B);
        if (um) C.group?.traverse((o) => { if (o.isMesh && o.material === m0) this.swap(o, um); });
      }
    }
    this.winArea = null; this.job = null;
  }

  disable() {
    if (!this.on) return; this.on = false;
    for (const m of this.swapped) if (m.userData.mat0) { m.material = m.userData.mat0; delete m.userData.mat0; }
    this.swapped.length = 0;
    const C = this.G.world.confins;
    if (C) { // pedaços que nasceram com o Ultra ligado voltam para a água normal do bioma
      C.ultraWater = null;
      C.group?.traverse((o) => { if (o.isMesh && o.material?.name === 'agua-ultra' && o.material.userData.B) o.material = C.waterMat(o.material.userData.B); });
    }
  }

  // altura do chão SEM pontes (a ponte por cima do rio não vira "margem")
  heightFn(area) {
    const W = this.G.world;
    if (area === 'world') return (x, z) => W.terrain.heightAt(x, z);
    if (area === 'ermos') return (x, z) => W.ermos.heightAt(x, z);
    if (area === 'confins') return (x, z) => W.confins.heightAt(x, z);
    return null;
  }

  // janela de profundidade em volta da câmera: refeita aos poucos quando você se afasta 50 m
  updateDepth(force) {
    const G = this.G, area = G.player?.area || 'world';
    const wl = area === 'world' ? WORLD.waterLevel : area === 'ermos' ? ERMOS.waterLevel : area === 'confins' ? CONFINS.waterLevel : null;
    if (wl == null) return;
    const cam = G.camera.position;
    const cx = Math.round(cam.x / 12) * 12, cz = Math.round(cam.z / 12) * 12;
    const far = Math.max(Math.abs(cam.x - this.win.x), Math.abs(cam.z - this.win.y)) > 50;
    if (!this.job && (area !== this.winArea || far)) this.job = { cx, cz, row: 0, area, wl, h: this.heightFn(area), sync: area !== this.winArea || force };
    const J = this.job; if (!J || !J.h) { this.job = null; return; }
    const rows = J.sync ? WN : 14, x0 = J.cx - WSIZE / 2 + WS / 2, z0 = J.cz - WSIZE / 2 + WS / 2;
    const end = Math.min(WN, J.row + rows), B = this.build, k = 255 / DMAX;
    for (let j = J.row; j < end; j++) {
      const z = z0 + j * WS;
      for (let i = 0; i < WN; i++) { const d = J.wl - J.h(x0 + i * WS, z); B[j * WN + i] = d <= 0 ? 0 : Math.min(255, d * k + 0.5); }
    }
    J.row = end;
    if (J.row >= WN) {
      this.depth.set(B); this.tDepth.needsUpdate = true;
      this.win.set(J.cx, J.cz, WSIZE); this.winArea = J.area; this.job = null;
    }
  }

  update(dt) {
    if (!this.on) return;
    const G = this.G, sky = G.sky, st = sky.ultraState;
    this.time.value += dt;
    this.updateDepth(false);
    // luz direta: o sol (ou a lua à noite) com a cor e a força de verdade
    const L = sky.sun;
    this.lightDir.value.copy(L.position).sub(L.target.position).normalize();
    this.lightCol.value.copy(L.color).multiplyScalar(L.intensity);
    this.amb.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.5);
    // margem refletida: o chão/árvores em volta com a luz do céu, mais a neblina do horizonte
    if (st) this.shore.value.copy(sky.groundAlbedo || st.hor).multiply(this.amb.value).multiplyScalar(1.2).lerp(sky.fog.color, 0.18);
    const rain = sky.rainK || 0;
    for (const m of this.mats.values()) m.uniforms.uRough.value = m.uniforms.uRoughBase.value * (1 + rain * 0.9);
  }
}
