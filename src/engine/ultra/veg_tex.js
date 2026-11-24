// =============================================================
// Ultra realismo — texturas procedurais da vegetação (feitas na hora, sem arquivos):
//  • folhas (atlas 1024² com 16 quadros: carvalho, bétula, agulhas de pinheiro, galhos secos, moita, musgo pendurado, capim, junco…)
//    cor e recorte (alfa) separados → sem borda escura ao filtrar; DataTexture com mipmaps.
//  • casca (512²): R = casca sulcada (carvalho), G = bétula (branca com riscos), B = placas (pinheiro).
// =============================================================
import * as THREE from 'three';

// ruído de valor periódico (repete a cada p células) — para texturas sem emenda
function hashI(i, j, s) {
  let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a, p) => ((a % p) + p) % p;
  const x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
  const a = hashI(x0, y0, s), b = hashI(x1, y0, s), c = hashI(x0, y1, s), d = hashI(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm periódico em [0,1]: (u,v) em [0,1), frequência base fx × fy
function pfbm(u, v, fx, fy, oct, s, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * pnoise(u * fx, v * fy, fx, fy, s + o * 31);
    norm += amp; amp *= gain; fx *= 2; fy *= 2;
  }
  return sum / norm;
}
// células (Voronoi) periódicas: distância à 1ª e 2ª semente
function pcell(u, v, n, s) {
  const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const px = cx + hashI(wx, wy, s), py = cy + hashI(wx, wy, s + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hashI(wx, wy, s + 13); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function dataTex(data, w, h, srgb = true, repeat = false) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.flipY = false;
  t.needsUpdate = true;
  return t;
}

// ---------- atlas de folhas ----------
export const LEAF_TILES = 4; // 4 × 4 quadros de 256 px
export const TILE = { oak: 0, oak2: 1, birch: 2, pine: 3, pine2: 4, twigs: 5, bush: 6, moss: 7, grass: 8, reed: 9, broad: 10, palm: 11, fern: 12, needleTop: 13, ivy: 14, flowers: 15 };

// desenha a mesma lista de formas em dois contextos: cor (com borda dilatada) e alfa (branco)
function leafPath(ctx, L) {
  // folha: base em (0,0), ponta em (0,-len); largura máxima em 40% do comprimento; lobos opcionais
  const { len, wid, lobes = 0, tip = 0.15 } = L;
  const N = 18;
  ctx.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k <= N; k++) {
      const t = side < 0 ? k / N : 1 - k / N;
      let w = Math.sin(Math.pow(t, 0.75) * Math.PI) * wid * 0.5 * (1 - tip * t);
      if (lobes) w *= 0.78 + 0.22 * Math.abs(Math.sin(t * Math.PI * lobes));
      const x = side * w, y = -t * len;
      if (k === 0 && side < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}
function drawShapes(ctx, shapes, alpha) {
  for (const S of shapes) {
    ctx.save();
    ctx.translate(S.x, S.y); ctx.rotate(S.a || 0);
    if (S.t === 'stem') {
      ctx.strokeStyle = alpha ? '#fff' : S.c; ctx.lineCap = 'round';
      ctx.lineWidth = S.w + (alpha ? 0 : 2.5);
      ctx.beginPath(); ctx.moveTo(0, 0);
      if (S.bend) ctx.quadraticCurveTo(S.bend, -S.len * 0.5, 0, -S.len); else ctx.lineTo(0, -S.len);
      ctx.stroke();
    } else if (S.t === 'leaf') {
      if (!alpha) { ctx.lineWidth = 3; ctx.strokeStyle = S.c; leafPath(ctx, S); ctx.stroke(); }
      ctx.fillStyle = alpha ? '#fff' : S.c; leafPath(ctx, S); ctx.fill();
      if (!alpha) {
        // nervura central e sombra numa metade (dá relevo à folha)
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.rect(0, -S.len, S.wid, S.len); ctx.save(); ctx.clip(); leafPath(ctx, S); ctx.fill(); ctx.restore();
        ctx.globalAlpha = 0.35; ctx.strokeStyle = S.vein || '#f4f6dc'; ctx.lineWidth = Math.max(0.8, S.wid * 0.06);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -S.len * 0.92); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (S.t === 'needle') {
      ctx.strokeStyle = alpha ? '#fff' : S.c; ctx.lineCap = 'round';
      ctx.lineWidth = S.w + (alpha ? 0 : 1.5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(S.bend || 0, -S.len * 0.5, 0, -S.len); ctx.stroke();
    } else if (S.t === 'blob') {
      ctx.fillStyle = alpha ? '#fff' : S.c;
      ctx.beginPath(); ctx.ellipse(0, 0, S.rx + (alpha ? 0 : 1.5), S.ry + (alpha ? 0 : 1.5), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
// cor de folha "neutra" (quase branca, a cor de verdade vem de cada árvore) com variação de tom
function leafCol(r, base = 0.86, spread = 0.22, warm = 0) {
  const k = base + (r() - 0.5) * spread;
  const hue = (r() - 0.5) * 0.16 + warm;
  const R = sat(k * (1 + hue * 0.9)), G = sat(k * (1 + hue * 0.15)), B = sat(k * (1 - hue * 0.9) * 0.92);
  return `rgb(${(R * 255) | 0},${(G * 255) | 0},${(B * 255) | 0})`;
}
const stemCol = (r, k = 0.42) => { const v = k + (r() - 0.5) * 0.1; return `rgb(${(v * 255 * 1.05) | 0},${(v * 255 * 0.85) | 0},${(v * 255 * 0.6) | 0})`; };

function tileShapes(kind, r) {
  const S = [], W = 256;
  const twig = (x, y, len, a, w, c, bend = 0) => S.push({ t: 'stem', x, y, len, a, w, c, bend });
  const leaf = (x, y, len, wid, a, c, lobes = 0, tip = 0.15) => S.push({ t: 'leaf', x, y, len, wid, a, c, lobes, tip });
  if (kind === 'oak' || kind === 'oak2' || kind === 'broad' || kind === 'bush') {
    // raminho com MUITAS folhas pequenas (≈10–15 cm num cartão de ~1 m), em 2 camadas: as de trás mais escuras
    const lob = kind === 'oak' ? 4.5 : kind === 'oak2' ? 3.5 : 0;
    const L0 = kind === 'bush' ? 22 : kind === 'broad' ? 34 : 28, W0 = kind === 'bush' ? 14 : kind === 'broad' ? 22 : 17;
    const nB = kind === 'bush' ? 9 : 7;
    twig(W / 2, W - 4, W * 0.8, (r() - 0.5) * 0.15, 4, stemCol(r), (r() - 0.5) * 30);
    const tips = [];
    for (let b = 0; b < nB; b++) {
      const t = 0.12 + (b / nB) * 0.78, y = W - 4 - t * W * 0.8, side = b % 2 ? 1 : -1;
      const a = side * (0.55 + r() * 0.7), len = 44 + r() * 46;
      twig(W / 2, y, len, a, 2, stemCol(r));
      tips.push([W / 2 + Math.sin(a) * len, y - Math.cos(a) * len]);
    }
    tips.push([W / 2, W * 0.18]);
    const n = kind === 'bush' ? 95 : kind === 'broad' ? 55 : 80;
    for (let i = 0; i < n; i++) {
      // folhas em cachinhos nas pontas dos raminhos + espalhadas no miolo (contorno macio, irregular)
      const back = i < n * 0.4;
      let x, y;
      if (r() < 0.6) { const T = tips[Math.floor(r() * tips.length)], a = r() * 6.28, d = Math.pow(r(), 0.6) * 38; x = T[0] + Math.cos(a) * d; y = T[1] + Math.sin(a) * d; }
      else { const a = r() * 6.28, d = Math.pow(r(), 0.8) * 92; x = W / 2 + Math.cos(a) * d; y = W * 0.5 + Math.sin(a) * d * 0.95; }
      x = Math.min(W - 18, Math.max(18, x)); y = Math.min(W - 14, Math.max(22, y));
      const len = L0 * (0.75 + r() * 0.5), wid = W0 * (0.8 + r() * 0.4), ang = Math.atan2(x - W / 2, W - y) + (r() - 0.5) * 1.6;
      leaf(x, y + len * 0.4, len, wid, ang, back ? leafCol(r, 0.6, 0.18) : leafCol(r, 0.88, 0.28), lob, kind === 'broad' ? 0.25 : 0.1);
    }
  } else if (kind === 'birch' || kind === 'ivy') {
    // galhinhos finos caídos com folhinhas pequenas e serrilhadas
    for (let b = 0; b < 7; b++) {
      const x0 = W * (0.12 + b * 0.125) + (r() - 0.5) * 14, len = W * (0.6 + r() * 0.35);
      twig(x0, 6, len, Math.PI + (r() - 0.5) * 0.4, 1.6, stemCol(r, 0.3), (r() - 0.5) * 50);
      for (let k = 0; k < 15; k++) {
        const t = 0.06 + k * (0.9 / 15), y = 6 + t * len, x = x0 + Math.sin(t * 3 + b) * 12;
        const side = k % 2 ? 1 : -1;
        leaf(x, y, 17 + r() * 8, 12 + r() * 5, Math.PI + side * (0.5 + r() * 0.7), b % 3 === 0 ? leafCol(r, 0.66, 0.2, 0.04) : leafCol(r, 0.9, 0.26, 0.04), 0, 0.3);
      }
    }
  } else if (kind === 'pine' || kind === 'pine2' || kind === 'needleTop') {
    // raminho de abeto visto de cima: eixo central, ramos laterais, agulhas curtas e densas
    const dense = kind === 'pine2' ? 1.25 : 1;
    const nd = (x, y, a, len) => S.push({ t: 'needle', x, y, a, len, w: 2.2, c: leafCol(r, 0.78, 0.3, -0.03), bend: (r() - 0.5) * 3 });
    const axis = (x0, y0, len, a, depth) => {
      const steps = Math.floor(len / 5);
      twig(x0, y0, len, a, depth ? 2 : 3.5, stemCol(r, 0.36));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, px = x0 + Math.sin(a) * len * t, py = y0 - Math.cos(a) * len * t;
        const nl = (depth ? 15 : 20) * (1 - t * 0.45) * (0.85 + r() * 0.3);
        for (const sd of [-1, 1]) nd(px, py, a + sd * (0.9 + r() * 0.35), nl);
        if (r() < 0.55 * dense) nd(px, py, a + (r() - 0.5) * 0.6, nl * 0.8);
        if (!depth && k % 3 === 1 && t < 0.8) for (const sd of [-1, 1]) axis(px, py, len * (0.42 - t * 0.25) * (0.8 + r() * 0.4), a + sd * (0.75 + r() * 0.3), 1);
      }
    };
    axis(W / 2, W - 2, W * 0.95, 0, 0);
  } else if (kind === 'twigs') {
    // galhos secos e finos, ramificados
    const br = (x, y, len, a, w, d) => {
      const bend = (r() - 0.5) * len * 0.3;
      twig(x, y, len, a, w, stemCol(r, 0.3), bend);
      if (d > 3 || len < 12) return;
      const n = 2 + (r() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const t = 0.45 + r() * 0.5, px = x + Math.sin(a) * len * t, py = y - Math.cos(a) * len * t;
        br(px, py, len * (0.45 + r() * 0.2), a + (r() - 0.5) * 1.6, Math.max(1, w * 0.62), d + 1);
      }
    };
    br(W / 2, W - 2, W * 0.55, (r() - 0.5) * 0.2, 4.5, 0);
  } else if (kind === 'moss') {
    // barba-de-velho: fios pendurados (o topo do quadro é onde prende)
    for (let i = 0; i < 70; i++) {
      const x = 20 + r() * (W - 40), len = 80 + r() * 160;
      S.push({ t: 'needle', x, y: 4 + r() * 20, a: Math.PI + (r() - 0.5) * 0.12, len, w: 1.6 + r() * 1.6, c: leafCol(r, 0.82, 0.25), bend: (r() - 0.5) * 20 });
    }
  } else if (kind === 'grass' || kind === 'reed') {
    // touceira: lâminas saindo de baixo, curvadas
    const n = kind === 'grass' ? 60 : 26;
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (r() - 0.5) * (kind === 'grass' ? 120 : 70), len = (kind === 'grass' ? 120 : 200) + r() * 50;
      const a = (x - W / 2) * 0.005 + (r() - 0.5) * 0.35;
      S.push({ t: 'needle', x, y: W - 2, a, len, w: kind === 'grass' ? 3 + r() * 2 : 4 + r() * 2.5, c: leafCol(r, 0.84, 0.3, 0.03), bend: (r() - 0.5) * 60 });
    }
    if (kind === 'reed') for (let i = 0; i < 5; i++) { const x = W / 2 + (r() - 0.5) * 60; S.push({ t: 'blob', x, y: 60 + r() * 30, rx: 5, ry: 20, c: 'rgb(110,78,50)' }); }
  } else if (kind === 'fern' || kind === 'palm') {
    const axisLen = W * 0.95;
    twig(W / 2, W - 2, axisLen, 0, 3, stemCol(r, 0.5), 0);
    for (let k = 2; k < 26; k++) {
      const t = k / 26, y = W - 2 - t * axisLen, ln = 70 * Math.sin(t * Math.PI) + 12;
      for (const sd of [-1, 1]) leaf(W / 2, y, ln, 13, sd * (1.2 - t * 0.4), leafCol(r, 0.84, 0.22), 0, 0.3);
    }
  } else if (kind === 'flowers') {
    for (let i = 0; i < 22; i++) {
      const x = 30 + r() * 196, y = 30 + r() * 196;
      for (let p = 0; p < 5; p++) leaf(x, y, 16, 12, (p / 5) * Math.PI * 2, leafCol(r, 0.95, 0.1), 0, 0.2);
      S.push({ t: 'blob', x, y, rx: 4, ry: 4, c: 'rgb(240,200,80)' });
    }
  }
  return S;
}

export function makeLeafAtlas() {
  const N = 256 * LEAF_TILES;
  const cc = document.createElement('canvas'); cc.width = cc.height = N;
  const ca = document.createElement('canvas'); ca.width = ca.height = N;
  const c1 = cc.getContext('2d', { willReadFrequently: true }), c2 = ca.getContext('2d', { willReadFrequently: true });
  c2.fillStyle = '#000'; c2.fillRect(0, 0, N, N);
  const names = Object.keys(TILE);
  for (const name of names) {
    const i = TILE[name], tx = (i % LEAF_TILES) * 256, ty = Math.floor(i / LEAF_TILES) * 256;
    const r = mulberry(1000 + i * 77);
    const shapes = tileShapes(name, r);
    // fundo de cor do quadro = tom médio (o filtro mistura com ele, nunca com preto)
    c1.fillStyle = name === 'twigs' ? 'rgb(90,72,58)' : 'rgb(170,176,140)'; c1.fillRect(tx, ty, 256, 256);
    for (const [ctx, al] of [[c1, false], [c2, true]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(tx + 2, ty + 2, 252, 252); ctx.clip(); ctx.translate(tx, ty);
      drawShapes(ctx, shapes, al);
      ctx.restore();
    }
  }
  const a = c1.getImageData(0, 0, N, N).data, b = c2.getImageData(0, 0, N, N).data;
  const out = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) { out[k * 4] = a[k * 4]; out[k * 4 + 1] = a[k * 4 + 1]; out[k * 4 + 2] = a[k * 4 + 2]; out[k * 4 + 3] = b[k * 4]; }
  const t = dataTex(out, N, N, true, false);
  t.anisotropy = 8;
  return t;
}
// coordenadas (u0,v0,u1,v1) do quadro no atlas (v com flipY=false: linha 0 em cima → v pequeno = topo)
export function tileUV(i) {
  const s = 1 / LEAF_TILES, u0 = (i % LEAF_TILES) * s, v0 = Math.floor(i / LEAF_TILES) * s, pad = 3 / (256 * LEAF_TILES);
  return [u0 + pad, v0 + pad, u0 + s - pad, v0 + s - pad];
}

// ---------- casca ----------
export function makeBarkTex() {
  const W = 256, H = 512, d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, k = (y * W + x) * 4;
    // R: casca sulcada — cristas verticais onduladas (ruído esticado) + rachaduras horizontais raras
    const warp = pfbm(u, v, 4, 4, 3, 11) * 0.35;
    const ridge = 1 - Math.abs(pfbm(u + warp, v * 0.25, 9, 3, 4, 3) * 2 - 1);
    const grain = pfbm(u, v, 32, 16, 3, 5);
    let R = 0.25 + Math.pow(ridge, 1.6) * 0.62 + (grain - 0.5) * 0.22;
    R *= 0.85 + 0.3 * pfbm(u, v, 3, 6, 2, 9);
    // G: bétula — branca, riscos horizontais escuros (lenticelas) e manchas pretas
    const len = pfbm(u, v, 6, 48, 2, 21), lent = sstep(0.62, 0.72, len) * sstep(0.35, 0.6, pfbm(u, v, 18, 6, 2, 23));
    const patch = sstep(0.66, 0.74, pfbm(u, v, 4, 3, 4, 27));
    let G = 0.9 + (grain - 0.5) * 0.12 - lent * 0.65 - patch * 0.7;
    // B: placas (pinheiro) — células com rachaduras escuras entre elas
    const [d1, d2, id] = pcell(u, v * 0.55, 7, 31);
    const crack = sstep(0.02, 0.12, d2 - d1);
    let B = (0.45 + id * 0.35 + (grain - 0.5) * 0.25) * (0.3 + 0.7 * crack);
    d[k] = sat(R) * 255; d[k + 1] = sat(G) * 255; d[k + 2] = sat(B) * 255; d[k + 3] = 255;
  }
  return dataTex(d, W, H, false, true);
}
