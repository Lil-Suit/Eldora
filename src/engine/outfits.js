import * as THREE from 'three';
import { MODEL_GEO as G } from './models.js';

// Trajes de verdade (roupa, chapéu, ombreiras, capa…) presos nas juntas do boneco.
// Cada visual da loja/conquista monta peças próprias; as cores vêm do próprio visual.
// rig.outfit guarda as peças para trocar/remover; nada aqui altera os status do personagem.

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
function put(list, parent, geo, mat, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.userData.noMerge = true; m.renderOrder = 2; // depois da silhueta azul do herói
  parent.add(m); list.push(m);
  return m;
}
const horn = (() => { // chifre curvo (tubo em arco)
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, 0.16, -0.04), new THREE.Vector3(0.1, 0.32, -0.16), new THREE.Vector3(0.04, 0.42, -0.32)]);
  return new THREE.TubeGeometry(path, 8, 0.05, 6, false);
})();
const wingGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.55, 0.35); s.lineTo(0.75, 0.05); s.lineTo(0.6, -0.05); s.lineTo(0.5, -0.3); s.lineTo(0.3, -0.12); s.lineTo(0.15, -0.35); s.lineTo(0, -0.1); return new THREE.ShapeGeometry(s); })();
const star4 = (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.035 : 0.1, a = (i / 8) * Math.PI * 2; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(r, 0); } return new THREE.ShapeGeometry(s); })();

const BUILD = {
  // Guarda de Eldoria: elmo de aço com pluma azul, ombreiras de placa com borda dourada, tabardo com brasão
  guarda(rig, L, c) {
    const steel = lam(0xc8d0d8), gold = lam(0xd9b25f), blue = lam(c.tunic);
    const h = rig.helmSlot;
    put(L, h, G.sphere, steel, 0.6, 0.42, 0.58, 0, 0.38, -0.01);
    put(L, h, G.box, steel, 0.62, 0.06, 0.6, 0, 0.27, -0.01);
    put(L, h, G.box, gold, 0.08, 0.2, 0.1, 0, 0.45, 0.27);
    for (let k = 0; k < 5; k++) put(L, h, G.sphere, blue, 0.14, 0.2, 0.14, 0, 0.62 - k * 0.02, -0.06 - k * 0.09);
    for (const s of [-1, 1]) {
      put(L, rig.torso, G.sphere, steel, 0.4, 0.26, 0.42, s * 0.4, 0.66, 0, 0, 0, -s * 0.25);
      put(L, rig.torso, G.box, gold, 0.36, 0.04, 0.4, s * 0.43, 0.6, 0, 0, 0, -s * 0.5);
    }
    put(L, rig.torso, G.box, blue, 0.38, 0.62, 0.03, 0, 0.12, 0.23);
    put(L, rig.torso, G.octa, gold, 0.16, 0.2, 0.05, 0, 0.32, 0.25);
  },
  // Floresta Antiga: capuz de folhas, ombreiras de folha, cinto de cipó com flores
  floresta(rig, L, c) {
    const leaf = lam(0x4f8a34), leaf2 = lam(0x86b84a), bark = lam(0x6b4a2e), flower = lam(0xffd0e0);
    const h = rig.helmSlot;
    put(L, h, G.sphere, leaf, 0.66, 0.5, 0.64, 0, 0.36, -0.06);
    put(L, h, G.cone, leaf, 0.34, 0.5, 0.3, 0, 0.62, -0.26, -0.9);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; put(L, h, G.cone4, k % 2 ? leaf2 : leaf, 0.14, 0.3, 0.05, Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3 - 0.04, 0, -a, Math.PI / 2 + 0.3); }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) put(L, rig.torso, G.cone4, k % 2 ? leaf2 : leaf, 0.2, 0.42, 0.06, s * (0.36 + k * 0.06), 0.66 - k * 0.04, -0.08 + k * 0.08, 0.3, 0, -s * (1.2 + k * 0.2));
    put(L, rig.torso, G.torus, bark, 0.78, 0.78, 1.2, 0, 0.06, 0, Math.PI / 2);
    for (const x of [-0.18, 0.12]) put(L, rig.torso, G.sphere, flower, 0.1, 0.1, 0.06, x, 0.08, 0.24);
  },
  // Aurora Dourada: tiara de sol, manto branco nos ombros, sol dourado no peito
  aurora(rig, L, c) {
    const gold = lam(0xffd36b, { emissive: 0x4a3200 }), white = lam(0xfff6e0), gem = glow(0xfff2a8);
    const h = rig.helmSlot;
    put(L, h, G.torus, gold, 0.56, 0.56, 0.9, 0, 0.42, -0.02, Math.PI / 2);
    for (let k = -2; k <= 2; k++) put(L, h, G.cone4, gold, 0.07, 0.2 - Math.abs(k) * 0.04, 0.04, k * 0.1, 0.53 - Math.abs(k) * 0.02, 0.24 - Math.abs(k) * 0.02, 0, 0, -k * 0.25);
    put(L, h, G.octa, gem, 0.1, 0.12, 0.05, 0, 0.45, 0.28);
    for (const s of [-1, 1]) put(L, rig.torso, G.sphere, white, 0.46, 0.22, 0.5, s * 0.36, 0.66, -0.02, 0, 0, -s * 0.3);
    put(L, rig.torso, G.box, white, 0.7, 0.12, 0.46, 0, 0.66, 0);
    put(L, rig.torso, G.sphere, gold, 0.18, 0.18, 0.05, 0, 0.36, 0.24);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; put(L, rig.torso, G.cone4, gold, 0.05, 0.12, 0.03, Math.cos(a) * 0.15, 0.36 + Math.sin(a) * 0.15, 0.24, 0, 0, a - Math.PI / 2); }
  },
  // Sombra da Fenda: capuz escuro com olhos brilhando, cachecol roxo e cristais flutuando
  sombra(rig, L, c) {
    const dark = lam(0x1c1628), purple = lam(0x8b3cff, { emissive: 0x2a0a50 }), eye = glow(0x5ef0ff);
    const h = rig.helmSlot;
    put(L, h, G.sphere, dark, 0.68, 0.62, 0.66, 0, 0.3, -0.05);
    put(L, h, G.cone, dark, 0.4, 0.45, 0.35, 0, 0.6, -0.22, -0.7);
    put(L, h, G.box, glow(0x050208), 0.42, 0.3, 0.06, 0, 0.24, 0.27);
    for (const s of [-1, 1]) put(L, h, G.box, eye, 0.1, 0.035, 0.02, s * 0.09, 0.27, 0.3);
    put(L, rig.torso, G.torus, purple, 0.62, 0.62, 2.2, 0, 0.62, 0.02, Math.PI / 2);
    put(L, rig.torso, G.box, purple, 0.14, 0.42, 0.04, 0.12, 0.38, 0.25, 0, 0, 0.15);
    const orb = new THREE.Group(); orb.position.set(0, 0.5, 0); rig.torso.add(orb); L.push(orb);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; put(L, orb, G.octa, glow(0xd36bff), 0.1, 0.18, 0.1, Math.cos(a) * 0.62, 0.1 * k, Math.sin(a) * 0.62); }
    rig.outfitSpin = orb;
  },
  // Rubi Real: coroa com rubis, gola de pele branca e corrente dourada
  rubi(rig, L, c) {
    const gold = lam(0xf2c65a, { emissive: 0x3a2400 }), ruby = glow(0xff2a4a), fur = lam(0xf4f0ea);
    const h = rig.helmSlot;
    put(L, h, G.cyl, gold, 0.5, 0.14, 0.5, 0, 0.5, -0.02);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; put(L, h, G.cone4, gold, 0.1, 0.18, 0.06, Math.cos(a) * 0.23, 0.63, Math.sin(a) * 0.23 - 0.02); put(L, h, G.sphere, ruby, 0.06, 0.06, 0.06, Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25 - 0.02); }
    for (let k = 0; k < 9; k++) { const a = -Math.PI * 0.9 + (k / 8) * Math.PI * 1.8; put(L, rig.torso, G.sphere, fur, 0.2, 0.17, 0.2, Math.sin(a) * 0.36, 0.66, Math.cos(a) * 0.22); }
    put(L, rig.torso, G.torus, gold, 0.42, 0.42, 0.5, 0, 0.42, 0.22, 0.2);
    put(L, rig.torso, G.octa, ruby, 0.1, 0.14, 0.06, 0, 0.24, 0.26);
  },
  // Coroa de Gelo: coroa de cristais azuis e ombreiras de gelo
  geada(rig, L, c) {
    const ice = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x2a6a9a, flatShading: true, transparent: true, opacity: 0.92 }), white = lam(0xf4fbff);
    const h = rig.helmSlot;
    put(L, h, G.torus, white, 0.54, 0.54, 0.8, 0, 0.44, -0.02, Math.PI / 2);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, t = k % 2 ? 0.26 : 0.4; put(L, h, G.octa, ice, 0.08, t, 0.08, Math.cos(a) * 0.26, 0.52 + t * 0.3, Math.sin(a) * 0.26 - 0.02, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) put(L, rig.torso, G.octa, ice, 0.1, 0.34 - k * 0.06, 0.1, s * (0.36 + k * 0.08), 0.74 + k * 0.02, -0.06 + k * 0.06, 0, 0, -s * (0.5 + k * 0.25));
    put(L, rig.torso, G.box, white, 0.7, 0.1, 0.46, 0, 0.66, 0);
  },
  // Abismo Estelar: auréola de estrelas girando sobre a cabeça e ombreiras com pontos de luz
  abismo(rig, L, c) {
    const night = lam(0x14143a, { emissive: 0x0a0a2a }), star = glow(0xfff2ff), pink = glow(0xff4fd8, 0.8);
    const halo = new THREE.Group(); halo.position.set(0, 0.78, -0.02); rig.helmSlot.add(halo); L.push(halo);
    put(L, halo, G.torus, pink, 0.5, 0.5, 0.4, 0, 0, 0, Math.PI / 2);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const st = put(L, halo, star4, star, 1, 1, 1, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25); st.rotation.y = -a; }
    rig.outfitSpin = halo;
    for (const s of [-1, 1]) {
      put(L, rig.torso, G.sphere, night, 0.44, 0.28, 0.46, s * 0.4, 0.66, 0, 0, 0, -s * 0.25);
      for (let k = 0; k < 3; k++) put(L, rig.torso, G.sphere, star, 0.05, 0.05, 0.05, s * (0.34 + k * 0.06), 0.76 - k * 0.03, 0.12 - k * 0.1);
    }
  },
  // Jade Imperial: chapéu de palha largo, faixa no peito e borlas
  jade(rig, L, c) {
    const straw = lam(0xd8b878), jade = lam(c.tunic), gold = lam(0xf2c65a);
    const h = rig.helmSlot;
    put(L, h, G.cone, straw, 1.2, 0.34, 1.2, 0, 0.62, -0.02);
    put(L, h, G.cyl, jade, 0.58, 0.06, 0.58, 0, 0.5, -0.02);
    put(L, h, G.sphere, gold, 0.08, 0.08, 0.08, 0, 0.8, -0.02);
    put(L, rig.torso, G.box, gold, 0.16, 0.86, 0.48, 0, 0.36, 0, 0, 0, 0.75);
    put(L, rig.torso, G.box, jade, 0.76, 0.12, 0.48, 0, 0.06, 0);
    for (const x of [-0.12, 0.12]) put(L, rig.torso, G.cone, gold, 0.06, 0.2, 0.06, x, -0.06, 0.24, Math.PI);
  },
  // Dragão Carmesim: elmo com chifres, ombreiras de escamas com espinhos e asinhas nas costas
  dragao(rig, L, c) {
    const scale = lam(0xa81e14), gold = lam(0xffb02a, { emissive: 0x3a1800 }), bone = lam(0xf0e2c0), wing = new THREE.MeshLambertMaterial({ color: 0x6a0e0a, side: THREE.DoubleSide, flatShading: true });
    const h = rig.helmSlot;
    put(L, h, G.sphere, scale, 0.6, 0.4, 0.58, 0, 0.4, -0.02);
    put(L, h, G.box, gold, 0.5, 0.05, 0.05, 0, 0.36, 0.27);
    for (const s of [-1, 1]) { const hr = put(L, h, horn, bone, 1, 1, 1, s * 0.2, 0.5, 0.02); hr.scale.x = s; }
    for (const s of [-1, 1]) {
      put(L, rig.torso, G.sphere, scale, 0.44, 0.3, 0.46, s * 0.4, 0.66, 0, 0, 0, -s * 0.25);
      for (let k = 0; k < 3; k++) put(L, rig.torso, G.cone4, gold, 0.08, 0.22, 0.08, s * (0.38 + k * 0.05), 0.82, -0.1 + k * 0.1, 0, 0, -s * 0.5);
    }
    const back = rig.back || rig.torso;
    for (const s of [-1, 1]) { const w = put(L, back, wingGeo, wing, s, 1, 1, s * 0.08, 0.22, -0.06, 0, s * 0.5, 0); w.castShadow = false; }
  },
};

export const OUTFIT_IDS = Object.keys(BUILD);

// coloca (ou tira) o traje do visual no boneco
export function applyOutfit(rig, skinId, colors) {
  if (rig.kind !== 'humanoid' || !rig.helmSlot) return;
  if (rig.outfit) { for (const m of rig.outfit) { m.parent?.remove(m); m.material?.dispose?.(); } rig.outfit = null; rig.outfitSpin = null; }
  if (rig.outfitHead) { rig.outfitHead.parent?.remove(rig.outfitHead); rig.outfitHead = null; }
  const fn = BUILD[skinId];
  rig.helmSlot.visible = !fn;
  if (!fn) return;
  // a cabeça do traje fica num grupo próprio (trocar equipamento não apaga o chapéu)
  const head = new THREE.Group(); rig.head.add(head); rig.outfitHead = head;
  const L = [];
  const view = Object.create(rig); view.helmSlot = head; view.outfitSpin = null;
  fn(view, L, colors || {});
  rig.outfitSpin = view.outfitSpin;
  rig.outfit = L;
}
