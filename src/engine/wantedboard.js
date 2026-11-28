// =============================================================
// Mural de Procurados da vila: quadro de tábuas com moldura, telhadinho de duas águas, placa entalhada
// no topo, cartazes de "PROCURADO" de verdade (pergaminho, retrato em silhueta, recompensa em ouro),
// pregos, bilhetes soltos e um lampião aceso. Tudo desenhado aqui (canvas), sem arte de fora.
// Frente do mural = +Z local (de onde o jogador lê).
// =============================================================
import * as THREE from 'three';

let _tex = null, _glow = null;
// fonte que cabe na largura (os nomes de fonte variam de celular para celular)
function fit(g, txt, w8, px, maxW, fam) { g.font = `${w8} ${px}px ${fam}`; const w = g.measureText(txt).width; if (w > maxW) g.font = `${w8} ${Math.floor(px * maxW / w)}px ${fam}`; }
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c));
}
// 3 cartazes lado a lado numa textura só (uma chamada de desenho para os três)
function posterAtlas() {
  if (_tex) return _tex;
  const W = 256, H = 352, c = document.createElement('canvas');
  c.width = W * 3; c.height = H;
  const g = c.getContext('2d');
  const faces = ['capuz', 'chifres', 'mascara'];
  const rewards = ['1.500', '3.000', '800'];
  for (let i = 0; i < 3; i++) {
    const x0 = i * W;
    g.save(); g.translate(x0, 0);
    // pergaminho com bordas queimadas
    const grd = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.8);
    grd.addColorStop(0, '#efdcae'); grd.addColorStop(0.7, '#dcc08a'); grd.addColorStop(1, '#8a6436');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // manchas e fibras do papel
    for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(110,70,30,${Math.random() * 0.06})`; const r = 2 + Math.random() * 14; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(80,50,20,.55)'; g.lineWidth = 4; g.strokeRect(12, 12, W - 24, H - 24);
    g.lineWidth = 1.5; g.strokeRect(19, 19, W - 38, H - 38);
    // título
    g.fillStyle = '#3a1a0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, 'PROCURADO', 'bold', 40, W - 52, 'Georgia, "Times New Roman", serif');
    g.fillText('PROCURADO', W / 2, 50);
    g.font = 'italic 17px Georgia, serif'; g.fillStyle = '#5a2e14';
    g.fillText('vivo ou morto', W / 2, 80);
    // retrato: moldura + silhueta
    const px = 48, py = 96, pw = W - 96, ph = 132;
    g.fillStyle = '#c9ab72'; g.fillRect(px, py, pw, ph);
    g.strokeStyle = '#4a2a12'; g.lineWidth = 3; g.strokeRect(px, py, pw, ph);
    g.fillStyle = '#2a1a10';
    const cx = W / 2, cy = py + ph * 0.52;
    g.beginPath(); g.ellipse(cx, py + ph + 6, 64, 46, 0, Math.PI, 0); g.fill(); // ombros
    if (faces[i] === 'capuz') {
      g.beginPath(); g.moveTo(cx - 40, py + ph); g.quadraticCurveTo(cx - 46, cy - 50, cx, cy - 58); g.quadraticCurveTo(cx + 46, cy - 50, cx + 40, py + ph); g.fill();
      g.fillStyle = '#c9ab72'; g.beginPath(); g.ellipse(cx, cy - 4, 20, 26, 0, 0, 7); g.fill(); g.fillStyle = '#2a1a10';
      g.beginPath(); g.ellipse(cx, cy - 2, 17, 23, 0, 0, 7); g.fill();
      g.fillStyle = '#d23a2a'; g.fillRect(cx - 12, cy - 8, 8, 4); g.fillRect(cx + 4, cy - 8, 8, 4); // olhos
    } else if (faces[i] === 'chifres') {
      g.beginPath(); g.ellipse(cx, cy, 30, 36, 0, 0, 7); g.fill();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 22, cy - 24); g.quadraticCurveTo(cx + s * 52, cy - 40, cx + s * 46, cy - 66); g.quadraticCurveTo(cx + s * 38, cy - 40, cx + s * 12, cy - 30); g.fill(); }
      g.fillStyle = '#c9ab72'; g.fillRect(cx - 18, cy - 6, 36, 5); g.fillRect(cx - 2, cy - 6, 4, 22); // fenda do elmo
    } else {
      g.beginPath(); g.ellipse(cx, cy, 29, 35, 0, 0, 7); g.fill();
      g.fillStyle = '#7a1e16'; g.fillRect(cx - 30, cy + 2, 60, 18); // lenço
      g.fillStyle = '#c9ab72'; g.beginPath(); g.ellipse(cx - 11, cy - 8, 6, 3, 0, 0, 7); g.ellipse(cx + 11, cy - 8, 6, 3, 0, 0, 7); g.fill();
      g.strokeStyle = '#c9ab72'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 18, cy - 24); g.lineTo(cx + 6, cy + 2); g.stroke(); // cicatriz
    }
    // caveira de PvP no canto do retrato
    g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(px + pw - 20, py + 20, 11, 0, 7); g.fill(); g.fillRect(px + pw - 26, py + 26, 12, 8);
    g.fillStyle = '#1a1010'; g.beginPath(); g.arc(px + pw - 24, py + 20, 3, 0, 7); g.arc(px + pw - 16, py + 20, 3, 0, 7); g.fill();
    // recompensa
    g.fillStyle = '#3a1a0c'; g.font = 'bold 22px Georgia, serif'; g.fillText('RECOMPENSA', W / 2, 260);
    g.fillStyle = '#8a5a10'; g.font = 'bold 34px Georgia, serif'; g.fillText(rewards[i], W / 2 - 14, 298);
    const gx = W / 2 + 14 + g.measureText(rewards[i]).width / 2, gy = 298;
    const cg = g.createRadialGradient(gx - 3, gy - 3, 2, gx, gy, 13); cg.addColorStop(0, '#fff1a0'); cg.addColorStop(1, '#b8860b');
    g.fillStyle = cg; g.beginPath(); g.arc(gx, gy, 12, 0, 7); g.fill(); g.strokeStyle = '#6a4a08'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(58,26,12,.7)'; g.font = '13px Georgia, serif'; g.fillText('peças de ouro · procure o mural', W / 2, 328);
    g.restore();
  }
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace; _tex.anisotropy = 4;
  return _tex;
}

// placa entalhada "MURAL DE PROCURADOS"
function signTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, '#6e4428'); grd.addColorStop(1, '#4a2c18');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = 'rgba(30,16,8,.35)'; g.lineWidth = 1;
  for (let k = 0; k < 26; k++) { g.beginPath(); const y = Math.random() * 96; g.moveTo(0, y); g.bezierCurveTo(170, y + Math.random() * 8 - 4, 340, y + Math.random() * 8 - 4, 512, y); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, 'MURAL DE PROCURADOS', 'bold', 44, 470, 'Georgia, "Times New Roman", serif');
  g.fillStyle = '#24130a'; g.fillText('MURAL DE PROCURADOS', 257, 51);
  g.fillStyle = '#f0c35a'; g.fillText('MURAL DE PROCURADOS', 256, 49);
  g.strokeStyle = '#2a170c'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 90);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildWantedBoard(parent, x, y, z, yaw = 0) {
  const G = new THREE.Group(); G.name = 'mural_procurados';
  G.position.set(x, y, z); G.rotation.y = yaw;
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dark = L(0x3f2716), wood = L(0x6e4a2d), woodB = L(0x7c5534), stone = L(0x8a8478), shingle = L(0x7a3322), iron = L(0x2a2a2e);
  const box = (w, h, d, m, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.rotation.set(rx, ry, rz);
    o.castShadow = true; o.receiveShadow = true; G.add(o); return o;
  };
  // postes com pé de pedra
  for (const s of [-1, 1]) {
    box(0.26, 3.3, 0.26, dark, s * 1.9, 1.65, 0);
    box(0.46, 0.34, 0.46, stone, s * 1.9, 0.17, 0);
    box(0.12, 0.5, 0.12, dark, s * 1.72, 0.95, 0, 0, 0, s * 0.7); // mão-francesa
  }
  // tábuas (com frestas) + moldura
  for (let k = 0; k < 5; k++) box(3.5, 0.37, 0.1, k % 2 ? wood : woodB, 0, 1.12 + k * 0.39, 0);
  box(3.8, 0.16, 0.2, dark, 0, 0.92, 0.02); box(3.8, 0.16, 0.2, dark, 0, 3.0, 0.02);
  // telhadinho de duas águas
  box(4.5, 0.09, 0.82, shingle, 0, 3.32, 0.34, 0.5);
  box(4.5, 0.09, 0.82, shingle, 0, 3.32, -0.34, -0.5);
  box(4.6, 0.12, 0.12, dark, 0, 3.52, 0);
  for (let k = -4; k <= 4; k++) box(0.03, 0.02, 0.8, dark, k * 0.5, 3.38, 0.36, 0.5); // ripas das telhas
  // placa entalhada no topo
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.5), new THREE.MeshLambertMaterial({ map: signTex() }));
  sign.position.set(0, 2.68, 0.065); G.add(sign);
  // cartazes (atlas de 3), levemente tortos, com pregos
  const atlas = posterAtlas(), pm = new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide });
  const spots = [[-1.12, 1.72, 0.05], [0, 1.66, -0.03], [1.12, 1.76, 0.04]];
  spots.forEach(([px, py, rz], i) => {
    const geo = new THREE.PlaneGeometry(0.8, 1.1);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    const p = new THREE.Mesh(geo, pm); p.position.set(px, py, 0.062 + i * 0.002); p.rotation.z = rz; G.add(p);
    for (const s of [-1, 1]) box(0.05, 0.05, 0.04, iron, px + s * 0.33, py + 0.48, 0.08);
  });
  // bilhetes soltos e um cartaz rasgado
  const paper = new THREE.MeshLambertMaterial({ color: 0xe2cf9e, side: THREE.DoubleSide });
  for (const [px, py, w, h, rz] of [[-1.62, 1.25, 0.26, 0.34, 0.12], [1.6, 1.3, 0.24, 0.3, -0.1], [0.55, 1.12, 0.3, 0.2, 0.06]]) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper); n.position.set(px, py, 0.061); n.rotation.z = rz; G.add(n);
  }
  // lampião pendurado na ponta do telhado (aceso, sem luz real para não pesar)
  box(0.05, 0.36, 0.05, iron, 2.05, 3.08, 0.55);
  box(0.22, 0.04, 0.22, iron, 2.05, 2.88, 0.55);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshBasicMaterial({ color: 0xffc56b }));
  flame.position.set(2.05, 2.74, 0.55); G.add(flame);
  box(0.24, 0.04, 0.24, iron, 2.05, 2.61, 0.55);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb04a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9); halo.position.copy(flame.position); G.add(halo);
  parent.add(G);
  return G;
}
