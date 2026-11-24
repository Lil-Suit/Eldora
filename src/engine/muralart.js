import * as THREE from 'three';

// Arte do Mural das Runas: pedra entalhada com os 3 medalhões (Lua → Estrela → Sol) e, embaixo,
// a explicação da charada. Duas texturas: a cor (pedra) e o brilho (símbolos e letras acesas à noite).
const W = 1024, H = 700;
const COLORS = { lua: '#9fd0ff', estrela: '#ffe08a', sol: '#ffb347' };

function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function glyph(g, id, x, y, r, fill) {
  g.save(); g.translate(x, y); g.fillStyle = fill; g.strokeStyle = fill;
  if (id === 'lua') { // lua crescente
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.arc(r * 0.42, -r * 0.18, r * 0.86, 0, Math.PI * 2, true); g.fill('evenodd');
  } else if (id === 'estrela') { // estrela de 4 pontas
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.3 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
  } else { // sol: disco + raios
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = r * 0.14; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  }
  g.restore();
}

function text(g, s, x, y, size, font, color, align = 'center') {
  g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(s, x, y);
}

export function muralTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cA = mk(), cE = mk(), a = cA.getContext('2d'), e = cE.getContext('2d');
  const r = rnd(7);
  // ---- pedra
  const grad = a.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#9d968a'); grad.addColorStop(1, '#7c766b');
  a.fillStyle = grad; a.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = r(); a.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.08})` : `rgba(255,255,255,${0.04 + r() * 0.06})`; a.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 5); }
  a.strokeStyle = 'rgba(40,36,30,.45)'; a.lineWidth = 2;
  for (let i = 0; i < 7; i++) { let x = r() * W, y = r() * H; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 70; y += r() * 40; a.lineTo(x, y); } a.stroke(); } // rachaduras
  // moldura entalhada
  const frame = (ctx, inset, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2); };
  frame(a, 14, 10, 'rgba(45,40,34,.7)'); frame(a, 26, 3, 'rgba(255,255,255,.18)'); frame(a, 34, 4, 'rgba(45,40,34,.55)');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // ---- título
  text(a, 'MURAL DAS RUNAS', W / 2 + 2, 76 + 2, 46, 'Cinzel, Georgia, serif', 'rgba(255,255,255,.25)');
  text(a, 'MURAL DAS RUNAS', W / 2, 76, 46, 'Cinzel, Georgia, serif', '#3a342c');
  // ---- 3 medalhões com setas
  const ids = ['lua', 'estrela', 'sol'], names = ['LUA', 'ESTRELA', 'SOL'], cx = [220, 512, 804], cy = 236, R = 92;
  ids.forEach((id, i) => {
    const col = COLORS[id];
    a.fillStyle = '#24222c'; a.beginPath(); a.arc(cx[i], cy, R, 0, Math.PI * 2); a.fill();
    a.strokeStyle = '#5c564c'; a.lineWidth = 10; a.beginPath(); a.arc(cx[i], cy, R + 6, 0, Math.PI * 2); a.stroke();
    glyph(a, id, cx[i], cy, R * 0.6, col);
    // brilho
    const gl = e.createRadialGradient(cx[i], cy, R * 0.2, cx[i], cy, R * 1.05); gl.addColorStop(0, col + '55'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = gl; e.beginPath(); e.arc(cx[i], cy, R * 1.05, 0, Math.PI * 2); e.fill();
    glyph(e, id, cx[i], cy, R * 0.6, col);
    e.strokeStyle = col; e.lineWidth = 4; e.beginPath(); e.arc(cx[i], cy, R + 2, 0, Math.PI * 2); e.stroke();
    // número e nome
    a.fillStyle = '#2c2822'; a.beginPath(); a.arc(cx[i] - R * 0.78, cy - R * 0.78, 24, 0, Math.PI * 2); a.fill();
    text(a, String(i + 1), cx[i] - R * 0.78, cy - R * 0.76, 30, 'Georgia, serif', '#ffe6b0');
    text(e, String(i + 1), cx[i] - R * 0.78, cy - R * 0.76, 30, 'Georgia, serif', '#ffe6b0');
    text(a, names[i], cx[i], cy + R + 34, 32, 'Cinzel, Georgia, serif', '#2f2a23');
    if (i < 2) { // seta entre os medalhões
      const x0 = cx[i] + R + 14, x1 = cx[i + 1] - R - 14;
      for (const ctx of [a, e]) {
        ctx.strokeStyle = ctx === a ? '#3a342c' : '#d8d0ff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x1 - 16, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x1 - 22, cy - 14); ctx.lineTo(x1 - 22, cy + 14); ctx.closePath(); ctx.fill();
      }
    }
  });
  // ---- explicação da charada (placa escura embaixo)
  const px = 60, py = 410, pw = W - 120, ph = 250;
  a.fillStyle = 'rgba(28,24,20,.82)'; a.fillRect(px, py, pw, ph);
  a.strokeStyle = 'rgba(255,214,140,.45)'; a.lineWidth = 3; a.strokeRect(px + 6, py + 6, pw - 12, ph - 12);
  const lines = [
    ['A CHARADA', 34, 'Cinzel, Georgia, serif', '#ffd36b'],
    ['Toque nas 3 Pedras-Runa do Vale nesta ordem:', 30, 'Georgia, serif', '#f3ead2'],
    ['1º Lua (Floresta)  →  2º Estrela (Círculo de Pedras)  →  3º Sol (Colina)', 27, 'Georgia, serif', '#ffe6b0'],
    ['Errou? Elas apagam e você recomeça.', 26, 'Georgia, serif', '#d6ccb4'],
    ['Acertou? O cofre escondido na ilha do lago se abre.', 26, 'Georgia, serif', '#d6ccb4'],
  ];
  lines.forEach(([s, sz, f, c], i) => { const y = py + 38 + i * 46; text(a, s, W / 2, y, sz, f, c); text(e, s, W / 2, y, sz, f, c); });
  const tA = new THREE.CanvasTexture(cA), tE = new THREE.CanvasTexture(cE);
  tA.colorSpace = THREE.SRGBColorSpace; tE.colorSpace = THREE.SRGBColorSpace;
  tA.anisotropy = 4; tE.anisotropy = 4;
  return { map: tA, emissive: tE };
}

// Ultra realismo: o mesmo mural, agora com relevo entalhado (o próprio desenho vira o relevo) e pedra fosca.
export function muralUltraMaterial(orig) {
  if (!orig?.map) return null;
  return new THREE.MeshStandardMaterial({
    map: orig.map, emissive: orig.emissive, emissiveMap: orig.emissiveMap, emissiveIntensity: orig.emissiveIntensity,
    bumpMap: orig.map, bumpScale: 2.2, roughness: 0.9, metalness: 0,
  });
}
