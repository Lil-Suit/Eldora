// =============================================================
// Ultra realismo nos MONSTROS (todos, os que já existem e os que nascerem):
//  · material físico (PBR) com sombreamento liso: as formas arredondadas deixam de parecer "facetadas"
//  · detalhe de superfície gerado na hora, preso ao corpo (não escorrega quando o bicho se mexe):
//      pele/pelo (orgânico, cor saturada) → manchas, poros e fibras finas
//      pedra/osso (cor neutra)              → manchas, rachaduras e grão
//      metal/gema (brilho alto)             → riscos finos, pouca aspereza, reflexo do céu
//  · relevo de verdade (a luz "pega" nos poros/fibras), aspereza variando pelo corpo
//  · reflexo do céu (um mapa de ambiente pequeno, feito uma vez) e luz de borda (silhueta)
//  · gosmas: gelatina brilhante e molhada (verniz por cima, reflexo forte)
// Não muda tamanho, forma, animação nem quantas vezes o monstro é desenhado; liga e desliga junto com o Ultra.
// =============================================================
import * as THREE from 'three';

const NOISE = /* glsl */`
float umH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float umN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(umH(i), umH(i + vec3(1, 0, 0)), f.x), mix(umH(i + vec3(0, 1, 0)), umH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(umH(i + vec3(0, 0, 1)), umH(i + vec3(1, 0, 1)), f.x), mix(umH(i + vec3(0, 1, 1)), umH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float umF(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * umN(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.875; }
`;

// mapa de ambiente: céu claro em cima, horizonte quente, chão escuro embaixo (dá reflexo e luz ambiente realistas)
let _env = null;
function envMap(renderer) {
  if (_env !== null || !renderer) return _env;
  try {
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
        vec3 sky = mix(vec3(0.78, 0.82, 0.86), vec3(0.42, 0.58, 0.86), smoothstep(0.0, 0.7, h));
        vec3 hor = vec3(0.95, 0.86, 0.72); vec3 gnd = vec3(0.16, 0.15, 0.12);
        vec3 c = h > 0.0 ? mix(hor, sky, smoothstep(0.0, 0.25, h)) : mix(hor * 0.55, gnd, smoothstep(0.0, -0.3, h));
        float sun = pow(max(0.0, dot(normalize(vP), normalize(vec3(0.5, 0.65, 0.4)))), 64.0) * 6.0;
        gl_FragColor = vec4(c + sun, 1.0); }`,
    });
    sc.add(new THREE.Mesh(geo, mat));
    const pm = new THREE.PMREMGenerator(renderer);
    _env = pm.fromScene(sc, 0.02).texture;
    pm.dispose(); geo.dispose(); mat.dispose();
  } catch { _env = false; }
  return _env || null;
}

// liga o shader de detalhe num material físico. attr = a malha juntada tem aGlow/aShade/aShine por vértice
function upgrade(m, { attr, glow = 0, shine = 0.06, gloss = false, detail = 1 }) {
  m.userData.ultraMob = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowU = { value: glow }; sh.uniforms.uShineU = { value: shine }; sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = (attr ? 'attribute float aGlow;\nattribute float aShade;\nattribute float aShine;\n' : 'uniform float uGlowU;\nuniform float uShineU;\n')
      + 'varying float vGlow;\nvarying float vShade;\nvarying float vShine;\nvarying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n\tvOP = position;\n' + (attr ? '\tvGlow = aGlow; vShade = aShade; vShine = aShine;' : '\tvGlow = uGlowU; vShade = 1.0; vShine = uShineU;'));
    sh.fragmentShader = 'uniform float uDetail;\nvarying float vGlow;\nvarying float vShade;\nvarying float vShine;\nvarying vec3 vOP;\n' + NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
	vec3 bc = diffuseColor.rgb;
	float umx = max(bc.r, max(bc.g, bc.b)), umn = min(bc.r, min(bc.g, bc.b));
	float sat = (umx - umn) / max(umx, 0.001);
	float metal = smoothstep(0.35, 0.8, vShine);
	vec3 P = vOP * uDetail;
	// detalhe sem "chuvisco": cada camada some sozinha quando fica menor que um pixel na tela (de longe fica liso)
	float fw = length(fwidth(P)) + 1e-5;
	float aHi = 1.0 - smoothstep(0.08, 0.3, fw * 9.0), aFi = 1.0 - smoothstep(0.08, 0.3, fw * 26.0);
	float nLo = umF(P * 2.2), nHi = mix(0.5, umN(P * 9.0), aHi), nFi = mix(0.5, umN(vec3(P.x * 26.0, P.y * 5.0, P.z * 26.0)), aFi);
	float organic = (1.0 - metal) * smoothstep(0.08, 0.3, sat), stony = (1.0 - metal) * (1.0 - smoothstep(0.08, 0.3, sat));
	float crack = smoothstep(0.03, 0.0, abs(umN(P * 3.5) - 0.5)) * stony * aHi;
	float tone = mix(0.88, 1.1, nLo) * mix(0.96, 1.04, nHi);
	tone *= mix(1.0, mix(0.92, 1.05, nFi), organic * 0.8);
	tone *= 1.0 - crack * 0.35;
	vec3 col = bc * tone;
	col = mix(col, col * vec3(1.06, 0.98, 0.92), organic * (nLo - 0.5));
	${gloss ? 'col = bc * mix(0.92, 1.08, nLo); col = max(vec3(0.0), mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 1.25));' : ''}
	diffuseColor.rgb = col * (1.0 - vGlow) * mix(vShade, 1.0, 0.2);
	float umRough = ${gloss ? '0.1 + 0.08 * nHi' : 'mix(mix(0.6 + 0.12 * nHi, 0.86, stony), 0.26 + 0.24 * nHi, metal)'};
	float umBump = ${gloss ? '0.1 * nLo' : '0.4 * nLo + 0.22 * nHi + 0.16 * nFi * organic - crack * 0.4'};`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = umRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metal * 0.8;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
	{ // relevo (poros, fibras, rachaduras) pela variação do detalhe na tela
		vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
		float hx = dFdx(umBump), hy = dFdy(umBump);
		vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx);
		float det = dot(dpx, R1);
		vec3 grad = sign(det) * (hx * R1 + hy * R2);
		normal = normalize(abs(det) * normal - grad * ${gloss ? '0.12' : '0.45'} * (1.0 - vGlow));
	}`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	totalEmissiveRadiance += bc * mix(0.04, 1.0, vGlow);
	{ vec3 rv = normalize(vViewPosition); float rk = pow(1.0 - clamp(abs(dot(normal, rv)), 0.0, 1.0), 2.8);
	  totalEmissiveRadiance += mix(bc, vec3(1.0), 0.35) * rk * ${gloss ? '0.18' : '0.16'} * (1.0 - vGlow); }`);
  };
  m.customProgramCacheKey = () => `ultramob4_${attr ? 'a' : 'u'}${gloss ? 'g' : ''}`;
  return m;
}

const glowOf = (mt) => { const e = mt.emissive, c = mt.color; if (!e || !c) return 0; const el = e.r + e.g + e.b, cl = Math.max(0.05, c.r + c.g + c.b); return Math.min(0.8, Math.max(0, el / cl - 0.07)); };

function convert(m, geo, env) {
  if (!m || Array.isArray(m) || m.userData.ultraMob || m.isMeshBasicMaterial || m.isShaderMaterial || m.map || m.blending !== THREE.NormalBlending) return null;
  if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return null;
  const attr = !!(m.vertexColors && geo?.attributes?.aShade);
  if (m.vertexColors && !attr) return null;
  const gloss = !!(m.isMeshPhongMaterial && m.transparent); // gosma (gelatina transparente)
  const base = {
    color: m.color.clone(), emissive: (m.userData.base || m.emissive || new THREE.Color(0)).clone(), vertexColors: m.vertexColors,
    transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, flatShading: false,
    envMap: env, envMapIntensity: gloss ? 0.22 : 0.5,
  };
  const u = gloss
    ? new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.25, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.15, specularIntensity: 0.6, opacity: Math.min(0.9, m.opacity + 0.06) })
    : new THREE.MeshStandardMaterial({ ...base, roughness: 0.7, metalness: 0 });
  // glow/brilho: na malha juntada vêm por vértice; nas peças soltas, do material antigo
  upgrade(u, { attr, glow: attr ? 0 : glowOf(m), shine: m.userData.shine ?? (m.isMeshPhongMaterial ? 0.3 : 0.06), gloss });
  if (m.userData.shine != null) u.userData.shine = m.userData.shine;
  return u;
}

// liga/desliga o visual ultra de um monstro (rig de buildEnemyModel)
export function ultraMob(rig, on, renderer) {
  if (!rig?.root) return;
  if (on) {
    if (rig._ultra) return;
    const env = envMap(renderer);
    const swaps = new Map(), meshes = [];
    rig.root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const m = o.material;
      let u = swaps.get(m);
      if (u === undefined) { u = convert(m, o.geometry, env); swaps.set(m, u); }
      if (!u) return;
      meshes.push([o, m]); o.material = u;
    });
    rig._ultra = { meshes, mats: rig.mats, swaps };
    if (rig.mats) rig.mats = rig.mats.map((m) => swaps.get(m) || m);
  } else {
    const U = rig._ultra; if (!U) return;
    for (const [o, m] of U.meshes) o.material = m;
    if (U.mats) rig.mats = U.mats;
    for (const u of U.swaps.values()) u?.dispose();
    rig._ultra = null;
  }
}
