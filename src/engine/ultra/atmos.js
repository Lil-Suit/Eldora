// =============================================================
// Ultra realismo — luz, céu, água e atmosfera (só no "Ultra realismo").
// setUltra(G, on): chamado por Game.applyQuality. update(G, dt): por quadro com o Ultra ligado.
// render(G): se devolver true, já desenhou o quadro (pós-processamento); senão o jogo desenha normal.
//
// O que faz: desenha a cena em HDR e passa pelo pós (post.js): oclusão de ambiente, bloom, raios de sol,
// perspectiva aérea, neblina de altura nos vales, exposição que se adapta (dia/noite/cripta), ACES e
// gradação de cor com a cara de cada mapa. Água realista (water.js), partículas de ambiente (ambient.js).
// O céu físico e a luz do sol/céu/chão ficam em sky.js (updateUltra). Ao desligar, tudo volta como era.
// =============================================================
import * as THREE from 'three';
import { UltraPost } from './post.js';
import { UltraWater } from './water.js';
import { Ambient } from './ambient.js';
import { biomeWeights, CONFINS_BIOMES } from '../confins.js';
import { WORLD, ERMOS, CONFINS, FOREST_PATH, PLATEAU } from '../../config/world.js';
import { distToPolyline } from '../noise.js';

let S = null;
const lin = (hex) => new THREE.Color(hex); // THREE.Color já converte sRGB → linear
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// cara de cada lugar: tom do céu, cor do chão (luz rebatida), gradação (sombra/luz), neblina de altura
const LOOK = {
  vale: { tint: [1, 1, 1], ground: lin(0x80847a), sh: [0.97, 1.0, 1.04], hi: [1.03, 1.0, 0.97], sat: 1.12, hf: 1 },
  guardiao: { tint: [1.02, 0.96, 1.06], ground: lin(0x6a4a7a), sh: [1.0, 0.94, 1.08], hi: [1.05, 0.98, 1.0], sat: 1.06, hf: 0.7 },
  ermos: { tint: [1.0, 0.95, 1.06], ground: lin(0x4a4a3a), sh: [1.0, 0.94, 1.1], hi: [1.04, 0.99, 0.97], sat: 1.04, hf: 1.2 },
  cripta: { tint: [1, 1, 1], ground: lin(0x2a2236), sh: [0.92, 0.96, 1.12], hi: [1.08, 0.99, 0.9], sat: 0.98, hf: 0 },
  planicie: { tint: [1.02, 1.0, 0.96], sh: [0.97, 1.0, 1.04], hi: [1.07, 1.01, 0.92], sat: 1.12, hf: 0.6 },
  pantano: { tint: [0.92, 1.0, 0.9], sh: [0.96, 1.04, 0.98], hi: [1.0, 1.02, 0.94], sat: 0.95, hf: 2.4 },
  deserto: { tint: [1.08, 1.0, 0.88], sh: [1.0, 0.98, 1.02], hi: [1.09, 1.0, 0.88], sat: 1.06, hf: 0.15 },
  floresta: { tint: [0.97, 1.02, 0.98], sh: [0.95, 1.02, 1.03], hi: [1.04, 1.02, 0.93], sat: 1.12, hf: 1.4 },
  tundra: { tint: [0.95, 1.0, 1.08], sh: [0.95, 0.99, 1.08], hi: [1.0, 1.0, 1.02], sat: 0.96, hf: 1.0 },
  vulcao: { tint: [1.12, 0.82, 0.7], sh: [1.02, 0.95, 0.96], hi: [1.1, 0.98, 0.86], sat: 1.05, hf: 1.3 },
  pico: { tint: [0.98, 0.96, 1.06], sh: [0.97, 0.96, 1.08], hi: [1.04, 1.0, 1.0], sat: 1.04, hf: 0.8 },
};
for (const B of CONFINS_BIOMES) if (LOOK[B.id]) LOOK[B.id].ground = lin(B.ground);

function blank() {
  return { tint: new THREE.Color(1, 1, 1), ground: LOOK.vale.ground.clone(), sh: new THREE.Color(1, 1, 1), hi: new THREE.Color(1, 1, 1), sat: 1.1, hf: 1, w: 0 }; // neutro (tela de título)
}

export function setUltra(G, on) {
  on = !!on;
  if (on) {
    if (!S) {
      S = {
        on: false, post: new UltraPost(G.renderer, { touch: G.isTouch }), water: new UltraWater(G), amb: new Ambient(G),
        look: blank(), tmp: blank(), expo: 1, last: performance.now(), glow: new Map(), glowScan: 0, P: null, t: 0,
      };
      S.P = {
        expo: 1, ao: 0.85, aoRadius: 0.9, aoPow: 1.5, bloom: 0.06, bloomThr: 1.1, rays: 0.5, sharp: 0.22, vig: 0.22, sat: 1.1, con: 1.04,
        sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color(), hor: new THREE.Color(), hfCol: new THREE.Color(),
        mie: 1, ap: 0.0028, hf: 0, hfBase: 0, hfFall: 0.3, time: 0, shadowTint: new THREE.Color(1, 1, 1), highTint: new THREE.Color(1, 1, 1),
      };
    }
    if (S.on) return;
    S.on = true;
    G.atmos = { render: () => render(G), state: S };
    G.renderer.info.autoReset = !S.post.ok; // o quadro tem vários desenhos (cena + passes): a contagem soma tudo
    if (!S.post.ok) { G.renderer.toneMapping = THREE.ACESFilmicToneMapping; G.renderer.toneMappingExposure = 1.0; } // sem meio-float: só o tone mapping
    const hm = G.hurtFx?.mesh; if (S.post.ok && hm && hm.parent === G.scene) { G.scene.remove(hm); S.post.overlay.add(hm); } // tela de dano por cima do pós
    S.water.enable(); S.amb.enable();
    S.glowScan = 0;
  } else if (S && S.on) {
    S.on = false;
    S.post.disposeTargets();
    G.renderer.setRenderTarget(null);
    G.renderer.info.autoReset = true;
    G.renderer.toneMapping = THREE.NoToneMapping; G.renderer.toneMappingExposure = 1;
    const hm = G.hurtFx?.mesh; if (hm && hm.parent === S.post.overlay) { S.post.overlay.remove(hm); G.scene.add(hm); }
    S.water.disable(); S.amb.disable();
    for (const [m, c] of S.glow) m.color.copy(c);
    S.glow.clear();
  }
}

// brilhos (janelas, cristais, lava, runas): em HDR para o bloom pegar, sem estourar (o ACES comprime)
function scanGlow(G) {
  const W = G.world, groups = [W.group, W.plainGroup, W.ermosGroup, W.dungeon, W.confins?.group];
  const keep = (m) => m && m.isMeshBasicMaterial && m.vertexColors && !m.transparent && m !== W.glowMat;
  for (const g of groups) {
    if (!g) continue;
    for (const o of g.children) {
      const list = o.isMesh ? [o] : o.children || [];
      for (const c of list) { const m = c.material; if (keep(m) && !S.glow.has(m)) { S.glow.set(m, m.color.clone()); m.color.multiplyScalar(1.9); } }
    }
  }
}

function areaLook(G, out) {
  const P = G.player, area = P ? P.area : 'world';
  const L = (k) => LOOK[k];
  const mixIn = (k, w) => {
    const l = L(k); if (!l || w <= 0) return;
    out.tint.r += l.tint[0] * w; out.tint.g += l.tint[1] * w; out.tint.b += l.tint[2] * w;
    out.ground.r += l.ground.r * w; out.ground.g += l.ground.g * w; out.ground.b += l.ground.b * w;
    out.sh.r += l.sh[0] * w; out.sh.g += l.sh[1] * w; out.sh.b += l.sh[2] * w;
    out.hi.r += l.hi[0] * w; out.hi.g += l.hi[1] * w; out.hi.b += l.hi[2] * w;
    out.sat += l.sat * w; out.hf += l.hf * w; out.w += w;
  };
  out.tint.setRGB(0, 0, 0); out.ground.setRGB(0, 0, 0); out.sh.setRGB(0, 0, 0); out.hi.setRGB(0, 0, 0); out.sat = 0; out.hf = 0; out.w = 0;
  if (area === 'confins' && P) {
    const w = biomeWeights(P.pos.x - CONFINS.offset.x, P.pos.z - CONFINS.offset.z);
    for (let i = 0; i < CONFINS_BIOMES.length; i++) mixIn(CONFINS_BIOMES[i].id, w[i]);
  } else mixIn(area === 'world' ? 'vale' : area, 1);
  if (out.w <= 0) mixIn('vale', 1);
  const k = 1 / out.w;
  out.tint.multiplyScalar(k); out.ground.multiplyScalar(k); out.sh.multiplyScalar(k); out.hi.multiplyScalar(k); out.sat *= k; out.hf *= k;
  return out;
}

export function update(G, dt) {
  if (!S || !S.on) return;
  const W = G.world, P = G.player;
  // brilho das janelas à noite (o mundo recalcula a cor a cada quadro; aqui só vira HDR)
  W.glowMat.color.multiplyScalar(1.15 + G.night * 1.6);
  if ((S.glowScan -= dt) <= 0) { S.glowScan = 1.5; scanGlow(G); }
  // cara do lugar (suave ao trocar de bioma)
  const want = areaLook(G, S.tmp), L = S.look, k = Math.min(1, dt * 0.8);
  if (!S.lookInit) { S.lookInit = true; L.tint.copy(want.tint); L.ground.copy(want.ground); L.sh.copy(want.sh); L.hi.copy(want.hi); L.sat = want.sat; L.hf = want.hf; }
  L.tint.lerp(want.tint, k); L.ground.lerp(want.ground, k); L.sh.lerp(want.sh, k); L.hi.lerp(want.hi, k); L.sat += (want.sat - L.sat) * k; L.hf += (want.hf - L.hf) * k;
  if (G.sky.skyTint) { G.sky.skyTint.copy(L.tint); G.sky.groundAlbedo.copy(L.ground); }
  S.water.update(dt);
  // partículas de ambiente: o que aparece depende do lugar, da hora e do tempo
  const st = G.sky.ultraState, area = P ? P.area : 'world';
  const night = G.night || 0, rain = G.sky.rainK || 0, day = st ? st.sunUp : 1 - night;
  const wts = S.amb.weights;
  wts.fill(0);
  if (area === 'cripta') { wts[0] = 0.8; }
  else if (P) {
    let forest = 0, grass = 0;
    if (area === 'world') {
      forest = 1 - sm(30, 60, distToPolyline(P.pos.x, P.pos.z, FOREST_PATH));
      grass = 1 - sm(40, 75, Math.hypot(P.pos.x - PLATEAU.x, P.pos.z - PLATEAU.z)) > 0.5 ? 0 : 1;
    }
    let bw = null;
    if (area === 'confins') bw = biomeWeights(P.pos.x - CONFINS.offset.x, P.pos.z - CONFINS.offset.z);
    const bk = (id) => { if (!bw) return 0; const i = CONFINS_BIOMES.findIndex((b) => b.id === id); return i >= 0 ? bw[i] : 0; };
    const dry = 1 - rain;
    wts[0] = day * dry * (area === 'ermos' ? 0.5 : 1) * (1 - bk('tundra') - bk('vulcao') * 0.6); // poeira/pólen no sol
    wts[1] = night * dry * (area === 'world' ? grass * 1 : area === 'confins' ? bk('floresta') + bk('pantano') + bk('planicie') * 0.6 : 0); // vaga-lumes
    wts[2] = dry * (area === 'world' ? Math.max(forest, 0.12) : area === 'confins' ? bk('floresta') + bk('planicie') * 0.3 : 0); // folhas
    wts[3] = area === 'confins' ? bk('tundra') + bk('pico') * 0.4 : 0; // neve
    wts[4] = area === 'confins' ? bk('vulcao') : area === 'guardiao' ? 0.35 : 0; // brasas / centelhas
    wts[5] = (area === 'ermos' ? 1 : area === 'guardiao' ? 0.6 : area === 'confins' ? bk('pantano') : 0) * dry; // esporos
  }
  S.amb.update(dt, G.camera, P ? P.pos.y : 0, area);
}

// parâmetros da composição (exposição que se adapta, neblina, gradação)
function params(G, dt) {
  const P = S.P, st = G.sky.ultraState, indoor = G.sky.indoor, L = S.look;
  const night = st ? st.night : G.night || 0, over = st ? st.over : 0, rain = st ? st.rain : 0;
  const sunUp = st ? st.sunUp : 1;
  // exposição: o olho se acostuma com o escuro (noite jogável), cripta um pouco mais clara
  // (dia = 1; sol baixo abre só um pouco: nascer/pôr do sol continuam com cara de fim de tarde; noite 2,5×)
  const sy = st ? st.sunDir.y : 1, dayE = 1.3 - 0.3 * sm(0.15, 0.6, sy);
  let target = indoor ? 1.55 : dayE + (2.5 - dayE) * Math.pow(night, 0.8) + over * 0.3;
  target *= 1 + (G.sky.flash || 0) * 0.15;
  S.expo += (target - S.expo) * (1 - Math.exp(-dt * (S.expo < target ? 1.2 : 2.5)));
  if (!S.expoInit) { S.expoInit = true; S.expo = target; }
  P.expo = S.expo;
  P.time = S.t;
  P.ao = indoor ? 1.0 : 0.85; P.aoRadius = indoor ? 1.1 : 0.95; P.aoPow = indoor ? 1.8 : 1.5;
  P.bloom = 0.055 + night * 0.04 + (indoor ? 0.04 : 0); P.bloomThr = 1.05;
  P.sharp = G.isTouch ? 0.12 : 0.22;
  if (st && !indoor) {
    P.sunDir.copy(st.sunDir); P.sunCol.copy(st.sunCol); P.hor.copy(st.hor);
    P.rays = 0.55 * sunUp * (1 - over) * (1 - night);
    P.mie = 1.0 * (1 - over * 0.7); P.ap = (0.0009 + over * 0.0015 + rain * 0.0025) * (G.sky.vista ? 1 - G.sky.vista * 0.6 : 1);
    // neblina de altura: forte de manhã cedo, leve à tarde/noite, quase nada ao meio-dia
    const tod = G.state?.world?.timeOfDay ?? 0.5;
    const morning = sm(0.19, 0.25, tod) * (1 - sm(0.31, 0.4, tod)), evening = sm(0.68, 0.76, tod) * (1 - sm(0.84, 0.95, tod));
    const base = 0.0012 + morning * 0.009 + evening * 0.005 + night * 0.005 + rain * 0.014;
    P.hf = base * L.hf;
    const area = G.player?.area || 'world';
    P.hfBase = (area === 'ermos' ? ERMOS.waterLevel : area === 'confins' ? CONFINS.waterLevel : WORLD.waterLevel) + 0.2;
    P.waterY = G.world.waterAt(area) ?? -1e4;
    P.hfFall = 0.55; // a neblina deita rente à água e ao fundo dos vales
    P.hfCol.copy(G.sky.fog.color).multiplyScalar(1.15);
    P.vig = 0.2 + night * 0.08; P.sat = L.sat * 1.04 * (1 - night * 0.22) * (1 - rain * 0.15); P.con = 1.09;
    P.shadowTint.copy(L.sh).lerp(_n1, night * 0.7); P.highTint.copy(L.hi).lerp(_n2, night * 0.6);
    // hora dourada: luzes puxam para o laranja do sol baixo (nascer/pôr do sol com cara de foto)
    const gold = (1 - sm(0.12, 0.5, st.sunDir.y)) * sunUp * (1 - over);
    P.highTint.lerp(_g1, gold * 0.6); P.shadowTint.lerp(_g2, gold * 0.4);
  } else {
    P.sunDir.set(0.3, 1, 0.4).normalize(); P.sunCol.setRGB(0, 0, 0); P.hor.copy(G.sky.fog.color);
    P.rays = 0; P.mie = 0; P.ap = 0.006; P.hf = 0; P.hfCol.setRGB(0, 0, 0); P.waterY = -1e4;
    P.vig = 0.28; P.sat = LOOK.cripta.sat; P.con = 1.06;
    P.shadowTint.setRGB(...LOOK.cripta.sh); P.highTint.setRGB(...LOOK.cripta.hi);
  }
  if (G.isTouch) { P.ao = 0; P.rays = 0; } // celular: sem oclusão nem raios (os passes caros)
  return P;
}
const _g1 = new THREE.Color(1.1, 0.97, 0.84), _g2 = new THREE.Color(0.96, 0.95, 1.06);
const _c = new THREE.Color(), _n1 = new THREE.Color(0.88, 0.96, 1.16), _n2 = new THREE.Color(1.0, 1.0, 1.02);

export function render(G) {
  if (!S || !S.on || !S.post.ok) return false;
  const now = performance.now(), dt = Math.min(0.1, (now - S.last) / 1000); S.last = now; S.t += dt;
  G.renderer.info.reset();
  S.post.render(G.scene, G.camera, params(G, dt));
  return true;
}
