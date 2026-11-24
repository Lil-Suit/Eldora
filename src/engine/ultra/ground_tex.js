// =============================================================
// Ultra realismo — texturas procedurais do chão (feitas uma vez, em canvas de memória, sem arquivos).
// Duas texturas 512² que repetem sem emenda (ruído periódico), com mipmaps e filtro anisotrópico:
//  A: R = fios de grama vistos de cima · G = pedrinhas (altura) · B = terra granulada · A = rachaduras
//  B: R = manchas grandes (macro) · G = folhas secas no chão · B = rocha (estratos/cristas) · A = musgo/líquen
// =============================================================
import * as THREE from 'three';

const S = 512;

// gerador pseudoaleatório pequeno e determinístico
function rand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ruído de valor PERIÓDICO (repete a cada P células): tabela P×P e interpolação suave
function lattice(P, r) { const t = new Float32Array(P * P); for (let i = 0; i < t.length; i++) t[i] = r(); return t; }
function vperiodic(t, P, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = t[y0 * P + x0], b = t[y0 * P + x1], c = t[y1 * P + x0], d = t[y1 * P + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm periódico: oitavas com frequência inteira (base F, dobra a cada oitava)
function fbmField(F, oct, seed, ridged = false) {
  const r = rand(seed), out = new Float32Array(S * S), tabs = [];
  for (let o = 0; o < oct; o++) tabs.push(lattice(F << o, r));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, a = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      const P = F << o; let v = vperiodic(tabs[o], P, (x / S) * P, (y / S) * P);
      if (ridged) v = 1 - Math.abs(v * 2 - 1);
      s += v * a; n += a; a *= 0.5;
    }
    out[y * S + x] = s / n;
  }
  return out;
}
function normalize(f, lo = 0.01, hi = 0.99) {
  // estica para 0..1 usando percentis (sem que um pixel extremo achate tudo)
  const s = Float32Array.from(f).sort();
  const a = s[Math.floor(s.length * lo)], b = s[Math.floor(s.length * hi)], k = 1 / Math.max(1e-6, b - a);
  for (let i = 0; i < f.length; i++) f[i] = Math.min(1, Math.max(0, (f[i] - a) * k));
  return f;
}
// Worley periódico (G×G células, 1 ponto por célula): devolve F1, F2 e o id da célula mais próxima
function worley(G, seed) {
  const r = rand(seed), px = new Float32Array(G * G), py = new Float32Array(G * G), id = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) { px[i] = r(); py[i] = r(); id[i] = r(); }
  const F1 = new Float32Array(S * S), F2 = new Float32Array(S * S), ID = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = (x / S) * G, gy = (y / S) * G, cx = Math.floor(gx), cy = Math.floor(gy);
    let d1 = 9, d2 = 9, best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ci = ((cx + i) % G + G) % G, cj = ((cy + j) % G + G) % G, k = cj * G + ci;
      const dx = cx + i + px[k] - gx, dy = cy + j + py[k] - gy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = id[k]; } else if (d < d2) d2 = d;
    }
    F1[y * S + x] = d1; F2[y * S + x] = d2; ID[y * S + x] = best;
  }
  return { F1, F2, ID };
}
const wrap = (v) => ((v % S) + S) % S;

function grassStrands() {
  const f = fbmField(48, 3, 11);
  for (let i = 0; i < f.length; i++) f[i] = 0.3 + f[i] * 0.25;
  const r = rand(77);
  // milhares de "fios" curtos sobrepostos: de cima, grama é isso — riscos claros e escuros em todas as direções
  for (let k = 0; k < 30000; k++) {
    const x0 = r() * S, y0 = r() * S, ang = r() * Math.PI * 2, len = 3 + r() * 9, br = Math.pow(r(), 0.8);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = 0; t < len; t += 0.7) {
      const fade = 1 - t / len * 0.5, x = wrap(Math.round(x0 + dx * t)), y = wrap(Math.round(y0 + dy * t)), i = y * S + x;
      f[i] = f[i] * 0.25 + br * fade * 0.75;
    }
  }
  return normalize(f);
}

function pebbles() {
  const { F1, ID } = worley(40, 23), n = fbmField(64, 2, 29), out = new Float32Array(S * S);
  for (let i = 0; i < out.length; i++) {
    const id = ID[i];
    if (id > 0.42) { out[i] = 0; continue; }               // só ~42% das células têm pedrinha
    const rad = 0.18 + (id / 0.42) * 0.3;                    // tamanhos variados
    const d = F1[i] + (n[i] - 0.5) * 0.12;                   // borda irregular
    const k = 1 - d / rad;
    out[i] = k > 0 ? Math.sqrt(k) * (0.55 + 0.45 * (id / 0.42)) : 0;
  }
  return out;
}

function cracks() {
  const a = worley(9, 41), b = worley(22, 43), n = fbmField(32, 3, 47), out = new Float32Array(S * S);
  for (let i = 0; i < out.length; i++) {
    const e1 = a.F2[i] - a.F1[i] + (n[i] - 0.5) * 0.08, e2 = b.F2[i] - b.F1[i] + (n[i] - 0.5) * 0.1;
    const c1 = 1 - Math.min(1, Math.max(0, e1 / 0.06)), c2 = 1 - Math.min(1, Math.max(0, e2 / 0.07));
    out[i] = Math.max(c1, c2 * 0.6);
  }
  return out;
}

function leafLitter() {
  const out = new Float32Array(S * S), r = rand(91);
  // folhas: elipses pequenas em camadas (o valor guarda a "cor" de cada folha; 0 = vão entre elas)
  for (let k = 0; k < 4200; k++) {
    const cx = r() * S, cy = r() * S, L = 5 + r() * 9, W = 2 + r() * 3.2, a = r() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), v = 0.25 + r() * 0.75;
    const R = Math.ceil(L) + 1;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const u = (x * ca + y * sa) / L, w = (-x * sa + y * ca) / W;
      const q = u * u + w * w * (1 + Math.abs(u) * 0.8);
      if (q > 1) continue;
      const vein = Math.abs(w) < 0.18 ? 0.88 : 1;
      out[wrap(Math.round(cy + y)) * S + wrap(Math.round(cx + x))] = v * vein;
    }
  }
  return out;
}

function rock() {
  const ridge = fbmField(6, 5, 61, true), base = fbmField(12, 4, 67), out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const strata = Math.sin((y / S) * Math.PI * 2 * 9 + base[i] * 7) * 0.5 + 0.5;
    out[i] = ridge[i] * 0.6 + base[i] * 0.25 + strata * 0.15;
  }
  return normalize(out);
}

let cached = null;
export function groundTextures() {
  if (cached) return cached;
  const t0 = performance.now();
  const A = new Uint8Array(S * S * 4), B = new Uint8Array(S * S * 4);
  const ch = [grassStrands(), pebbles(), normalize(fbmField(24, 5, 31)), cracks()];
  const cb = [normalize(fbmField(4, 6, 53)), leafLitter(), rock(), normalize(fbmField(10, 5, 71))];
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 4; c++) { A[i * 4 + c] = Math.round(ch[c][i] * 255); B[i * 4 + c] = Math.round(cb[c][i] * 255); }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };
  cached = { A: mk(A), B: mk(B), ms: Math.round(performance.now() - t0) };
  return cached;
}
