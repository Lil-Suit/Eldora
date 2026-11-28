// =============================================================
// Estátua do Primeiro Guardião (praça da vila), feita com o MESMO modelo dos heróis novos:
// um cavaleiro de pedra com espada e escudo, numa pose firme, em cima do pedestal.
// É montada uma vez (pose parada, sem animar a cada quadro) e pintada de pedra clara com veios,
// detalhes em bronze e um brilho azul nos olhos do elmo. Se o modelo novo não carregar, a praça
// continua só com o pedestal.
// =============================================================
import * as THREE from 'three';
import { SkinHero } from './hero3d.js';

const NOISE = `
float stH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float stN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(stH(i), stH(i + vec3(1,0,0)), f.x), mix(stH(i + vec3(0,1,0)), stH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(stH(i + vec3(0,0,1)), stH(i + vec3(1,0,1)), f.x), mix(stH(i + vec3(0,1,1)), stH(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

// pedra: tom do material antigo (claro/escuro) vira pedra clara com veios e manchas de tempo
function stoneMat(src, bronze) {
  const lum = src?.color ? (src.color.r * 0.3 + src.color.g * 0.59 + src.color.b * 0.11) : 0.6;
  const m = new THREE.MeshStandardMaterial({
    color: bronze ? new THREE.Color(0xc09a58) : new THREE.Color(0xcfc9bc).multiplyScalar(0.78 + lum * 0.35),
    roughness: bronze ? 0.45 : 0.9, metalness: bronze ? 0.3 : 0,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vSP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = position;');
    sh.fragmentShader = 'varying vec3 vSP;\n' + NOISE + '\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 p = vSP * 6.0; float n = stN(p) * 0.6 + stN(p * 3.1) * 0.3 + stN(p * 9.0) * 0.1;
        float vein = smoothstep(0.03, 0.0, abs(stN(p * 0.8 + vec3(3.0)) - 0.5));
        diffuseColor.rgb *= mix(0.82, 1.08, n) * (1.0 - vein * 0.25);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.82, 0.74), smoothstep(0.55, 0.8, stN(p * 0.5)) * 0.35); }`);
  };
  m.customProgramCacheKey = () => 'statue1' + (bronze ? 'b' : 's');
  return m;
}

export function buildGuardianStatue(parent, x, y, z, yaw = Math.PI) {
  let hero;
  try { hero = new SkinHero({ id: 'guerreiro', name: 'Guerreiro' }, { g: 'M', skin: 'cavaleiro' }); } catch { return null; }
  hero.setEquipment({ weapon: { wkind: 'espada', rarity: 'lendario' }, shield: { wkind: 'escudo', rarity: 'lendario' } });
  const root = hero.root;
  root.position.set(x, y, z); root.rotation.y = yaw;
  root.scale.multiplyScalar(1.55); // maior que um herói de verdade
  parent.add(root); // no grupo do Vale: some junto quando o jogador está em outro mapa
  let tries = 0, last = null, still = 0;
  const finish = () => {
    // espera o modelo do cavaleiro terminar de trocar (primeiro entra o padrão, depois a roupa)
    if (hero.model !== last) { last = hero.model; still = 0; } else if (hero.model) still++;
    if (!hero.model || still < 4) { if (++tries < 120) setTimeout(finish, 250); return; }
    // pose: em guarda com a espada (alguns quadros da animação e congela)
    for (let k = 0; k < 24; k++) hero.update({ t: k / 30, move: 0, combat: 1, action: null }, 1 / 30);
    // (não chama stopAllAction: isso devolve o esqueleto para a pose T)
    // pedra + bronze; sem sombra própria animada e sem silhueta
    const swap = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const bronze = !o.isSkinnedMesh; // espada e escudo
      let m = swap.get(o.material);
      if (!m) { m = stoneMat(Array.isArray(o.material) ? o.material[0] : o.material, bronze); swap.set(o.material, m); }
      o.material = m; o.castShadow = true; o.receiveShadow = true;
    });
    hero.mats = [...swap.values()];
    // olhos do elmo com brilho azul (o "Guardião")
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: 0x5ef0ff }));
    const head = hero.bones?.Head;
    if (head) { eyes.position.set(0, 0.07, 0.11); head.add(eyes); }
    root.updateMatrixWorld(true);
    root.userData.statue = true;
  };
  finish();
  return hero;
}
