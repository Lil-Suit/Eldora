import * as THREE from 'three';
import { HUNTS, huntRange } from '../config/hunts.js';
import { LOCATIONS, WORLD, ROADS, CRYPT_MOUND, DUNGEON, RUNES, BOSS_SPAWN, ERMOS, CONFINS, PORTAL_FENDA, GUARDIAO, inGuardiao } from '../config/world.js';
import { ermosRawHeight } from '../engine/ermos.js';
import { confinsRawHeight, biomeAt, CONFINS_BIOMES } from '../engine/confins.js';
import { QUESTS } from '../config/quests.js';
import { ENEMIES } from '../config/enemies.js';

// Minimapa e mapa completo desenhados em canvas 2D a partir das cores do terreno.
export class MapRenderer {
  constructor(G) {
    this.G = G;
    this.bg = null;
    this.res = 256;
  }

  buildBackground() {
    this.bg = this.bgFor('world');
    this.bgG = this.bgFor('guardiao');
    // fundo da cripta
    const d = document.createElement('canvas'); d.width = d.height = 256;
    const dc = d.getContext('2d');
    dc.fillStyle = '#0d0b14'; dc.fillRect(0, 0, 256, 256);
    dc.fillStyle = '#4a4458';
    for (const r of DUNGEON.rects) { const s = 1.05; dc.fillRect(128 + r.x0 * s, 8 + (r.z0 + 222) * s, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); }
    this.dbg = d;
  }
  // imagem x −200..200, z −450..200: mapa 1 (Vale) ou mapa 2 (Planície do Guardião), cada um só com o seu terreno
  bgFor(area) {
    const W = this.G.world, T = W.terrain, X = W.plain, N = this.res, NH = Math.round(N * 650 / 400);
    const c = document.createElement('canvas');
    c.width = N; c.height = NH;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, NH);
    const col = new THREE.Color();
    for (let j = 0; j < NH; j++) for (let i = 0; i < N; i++) {
      const x = -200 + ((i + 0.5) / N) * 400, z = -450 + ((j + 0.5) / N) * 400;
      const k = (j * N + i) * 4;
      const mine = area === 'guardiao' ? X.contains(x, z) : z >= -200;
      if (!mine) { img.data[k] = 13; img.data[k + 1] = 11; img.data[k + 2] = 20; img.data[k + 3] = 255; continue; }
      const S = area === 'guardiao' ? X : T;
      const h = S.heightAt(x, z);
      if (h < WORLD.waterLevel) col.set(0x3b86b0);
      else S.colorAt(x, z, h, S.slopeAt(x, z), col);
      const shade = 0.85 + Math.max(-0.15, Math.min(0.15, (S.heightAt(x + 2, z - 2) - h) * -0.08));
      col.convertLinearToSRGB();
      img.data[k] = Math.min(255, col.r * 255 * shade); img.data[k + 1] = Math.min(255, col.g * 255 * shade); img.data[k + 2] = Math.min(255, col.b * 255 * shade); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(120,90,50,.55)'; ctx.lineWidth = 1.4;
    if (area === 'world') for (const r of ROADS) { ctx.beginPath(); r.forEach(([x, z], i) => { const px = ((x + 200) / 400) * N, pz = ((z + 450) / 400) * N; i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); }); ctx.stroke(); }
    return c;
  }

  // cor do terreno nos mapas novos (coordenadas do mundo)
  wildColor(area, x, z, col, tmp) {
    const W = this.G.world;
    if (area === 'ermos') {
      const lx = x - ERMOS.offset.x, lz = z - ERMOS.offset.z, h = ermosRawHeight(lx, lz);
      if (h < ERMOS.waterLevel) return col.set(0x5a3a8a);
      return W.ermos.colorLocal(lx, lz, h, W.ermos.slopeLocal(lx, lz), col);
    }
    const lx = x - CONFINS.offset.x, lz = z - CONFINS.offset.z, h = confinsRawHeight(lx, lz);
    if (h < CONFINS.waterLevel) return col.set(biomeAt(lx, lz).water);
    return W.confins.colorLocal(lx, lz, h, 0, col, tmp);
  }

  // fundo local do minimapa nos mapas novos: refeito aos poucos (algumas linhas por quadro) quando o jogador anda
  localBg(area, x, z) {
    const N = 80, span = 230;
    const mk = (cx, cz) => { const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); return { area, cx, cz, span, canvas: c, ctx, img: ctx.createImageData(N, N), row: 0 }; };
    const fill = (J, rows) => {
      const col = this._c1 || (this._c1 = new THREE.Color()), tmp = this._c2 || (this._c2 = new THREE.Color());
      for (let r = 0; r < rows && J.row < N; r++, J.row++) {
        const j = J.row;
        for (let i = 0; i < N; i++) {
          this.wildColor(J.area, J.cx - span / 2 + ((i + 0.5) / N) * span, J.cz - span / 2 + ((j + 0.5) / N) * span, col, tmp);
          col.convertLinearToSRGB();
          const k = (j * N + i) * 4;
          J.img.data[k] = col.r * 255; J.img.data[k + 1] = col.g * 255; J.img.data[k + 2] = col.b * 255; J.img.data[k + 3] = 255;
        }
      }
      if (J.row >= N) J.ctx.putImageData(J.img, 0, 0);
    };
    let L = this.local;
    if (!L || L.area !== area || Math.hypot(L.cx - x, L.cz - z) > 85) { L = this.local = mk(x, z); fill(L, N); this.job = null; }
    else if (!this.job && Math.hypot(L.cx - x, L.cz - z) > 28) this.job = mk(x, z);
    if (this.job) { fill(this.job, 6); if (this.job.row >= N) { this.local = this.job; this.job = null; } }
    return this.local;
  }

  wildFull(area) {
    this.full = this.full || {};
    if (this.full[area]) return this.full[area];
    const N = area === 'ermos' ? 160 : 192;
    const cfg = area === 'ermos' ? ERMOS : CONFINS;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), col = new THREE.Color(), tmp = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      this.wildColor(area, cfg.offset.x - cfg.half + ((i + 0.5) / N) * cfg.size, cfg.offset.z - cfg.half + ((j + 0.5) / N) * cfg.size, col, tmp);
      col.convertLinearToSRGB();
      const k = (j * N + i) * 4;
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return (this.full[area] = c);
  }

  // Objetivo rastreado atual {x,z} no mundo
  objective() {
    const o = this.objectiveRaw();
    if (!o) return o;
    // mapa 1 ↔ mapa 2: o objetivo está no outro mapa → aponta para o portal que leva até lá
    const P = this.G.player, tArea = o.area || (inGuardiao(o.x, o.z) ? 'guardiao' : 'world');
    if (P.area === 'world' && tArea === 'guardiao') return { x: GUARDIAO.portalGo.x, z: GUARDIAO.portalGo.z, label: 'Portal → Planície do Guardião (' + o.label + ')' };
    if (P.area === 'guardiao' && tArea === 'world') return { x: GUARDIAO.portalBack.x, z: GUARDIAO.portalBack.z, label: 'Portal → Vale de Eldoria (' + o.label + ')' };
    return o;
  }
  objectiveRaw() {
    const G = this.G, Q = G.quests;
    if (!Q) return null;
    const id = Q.tracked || Q.nextTrackable();
    if (!id) {
      // sem missão: aponta para o portal da próxima região
      const P = G.player, lv = G.state.player.level;
      if (P.area === 'world') return { x: GUARDIAO.portalGo.x, z: GUARDIAO.portalGo.z, label: 'Portal → Planície do Guardião' };
      if (P.area === 'guardiao') return { x: PORTAL_FENDA.x, z: PORTAL_FENDA.z, label: 'Portal → Ermos da Fenda' };
      if (P.area === 'ermos') return { x: ERMOS.portal.x + ERMOS.offset.x, z: ERMOS.portal.z + ERMOS.offset.z, label: 'Portal → Confins' };
      return null;
    }
    const st = Q.q[id];
    const def = QUESTS[id];
    if (st.state === 'ready') {
      const npc = G.interact?.npcs[def.turnIn];
      return npc ? { x: npc.pos.x, z: npc.pos.z, label: 'Entregar', area: 'world' } : null;
    }
    const obj = Q.objectives(id).find((o) => !o.done);
    if (obj?.where) return { x: obj.where[0], z: obj.where[1], label: obj.text };
    if (obj?.type === 'flag') {
      const seq = G.state.world.runes.seq;
      const next = RUNES.order[seq.length];
      if (next && G.state.world.flags.muralSeen) { const s = RUNES.stones[next]; return { x: s.x, z: s.z, label: s.name, fuzzy: 12 }; }
    }
    return null;
  }

  drawMini(ctx, size, radius = 55) {
    const G = this.G, P = G.player;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const scale = size / (radius * 2);
    const inD = P.area === 'cripta';
    if (inD) {
      ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);
      ctx.fillStyle = '#4a4458';
      for (const r of DUNGEON.rects) {
        const x0 = r.x0 + WORLD.dungeonOffset.x - P.pos.x, z0 = r.z0 + WORLD.dungeonOffset.z - P.pos.z;
        ctx.fillRect(x0 * scale, z0 * scale, (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      }
    } else if (P.area === 'ermos' || P.area === 'confins') {
      const L = this.localBg(P.area, P.pos.x, P.pos.z), k = L.canvas.width / L.span;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(L.canvas, (P.pos.x - radius - (L.cx - L.span / 2)) * k, (P.pos.z - radius - (L.cz - L.span / 2)) * k, radius * 2 * k, radius * 2 * k, 0, 0, size, size);
      ctx.translate(size / 2, size / 2);
    } else {
      const N = this.res, k = N / 400;
      const sx = (P.pos.x - radius + 200) * k, sz = (P.pos.z - radius + 450) * k;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(P.area === 'guardiao' ? this.bgG : this.bg, sx, sz, radius * 2 * k, radius * 2 * k, 0, 0, size, size);
      ctx.translate(size / 2, size / 2);
    }
    const toS = (x, z) => [(x - P.pos.x) * scale, (z - P.pos.z) * scale];
    // NPCs
    if (P.area === 'world') for (const id in G.interact.npcs) {
      const n = G.interact.npcs[id];
      const [x, y] = toS(n.pos.x, n.pos.z);
      const mk = G.quests.npcMarker(id, G.questCtx());
      dot(ctx, x, y, 3.2, mk === 'ready' ? '#ffd36b' : mk === 'available' ? '#ffe9a8' : '#e8e0cc');
      if (mk === 'ready' || mk === 'available') { ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 11px Nunito Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mk === 'ready' ? '?' : '!', x, y - 5); }
    }
    for (const e of G.enemies) {
      if (!e.alive() || e.area !== P.area) continue;
      const [x, y] = toS(e.pos.x, e.pos.z);
      if (Math.abs(x) > size / 2 || Math.abs(y) > size / 2) continue;
      dot(ctx, x, y, e.def.boss ? 5 : e.def.elite ? 3 : 2.2, e.def.boss ? '#ff4fd8' : e.aggroed && e.def.aggro === 'aggressive' ? '#ff5a4a' : '#ffb08a');
    }
    for (const g of G.net.peers.values()) {
      if (g.pr.ar !== P.area) continue;
      const [x, y] = toS(g.pos.x, g.pos.z);
      const mate = G.party?.isMate(g.id);
      if (mate) edgeMarker(ctx, x, y, size, '#7dffa8', '●'); else dot(ctx, x, y, 3.5, '#5ef0ff');
    }
    const ev = G.events?.active;
    if (ev?.site && (ev.area || 'world') === P.area) {
      const [x, y] = toS(ev.site.x, ev.site.z);
      const pulse = (performance.now() % 1200) / 1200;
      if (Math.hypot(x, y) < size / 2 - 6) {
        ctx.strokeStyle = `rgba(211,107,255,${1 - pulse})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
      }
      edgeMarker(ctx, x, y, size, '#e7a6ff', '✦');
    }
    // chefe de Natal (posição de quando nasceu)
    const nm = G.natal?.mark;
    if (nm && nm.until > Date.now() && nm.ar === P.area) { const [x, y] = toS(nm.x, nm.z); edgeMarker(ctx, x, y, size, '#ff6b6b', '❄'); }
    // portais para a próxima região (sempre visíveis no minimapa)
    {
      const pt = P.area === 'world' ? [GUARDIAO.portalGo.x, GUARDIAO.portalGo.z, '#d8b4ff'] : P.area === 'guardiao' ? [PORTAL_FENDA.x, PORTAL_FENDA.z, '#e7a6ff'] : P.area === 'ermos' ? [ERMOS.portal.x + ERMOS.offset.x, ERMOS.portal.z + ERMOS.offset.z, '#ffc46b'] : null;
      if (pt) { const [x, y] = toS(pt[0], pt[1]); edgeMarker(ctx, x, y, size, pt[2], '◎'); }
    }
    const ob = this.objective();
    if (ob && (P.area === 'world' || P.area === 'guardiao')) { const [x, y] = toS(ob.x, ob.z); edgeMarker(ctx, x, y, size, '#ffd36b', '◆'); }
    // jogador
    ctx.save();
    ctx.rotate(-P.yaw + Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1a2a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // cone de visão da câmera
    ctx.rotate(-G.cam.yaw);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size * 0.42, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  zoomFull(k) { if (!this.view) return; this.view.z = Math.max(1, Math.min(6, this.view.z * k)); }
  centerFull() { const P = this.G.player, [fx, fy] = this.fracOf(P.pos.x, P.pos.z); if (this.view) { this.view.fx = fx; this.view.fy = fy; } }
  // arrastar = mover; pinça (2 dedos) ou roda do mouse = zoom
  bindFull(c, redraw) {
    if (c._bound) return; c._bound = true;
    const pts = new Map(); let d0 = 0;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); } });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p || !this.view) return;
      const r = c.getBoundingClientRect(), k = c.width / (r.width || 1);
      if (pts.size === 1) { const S = this._fullS || c.width; this.view.fx -= ((e.clientX - p.x) * k) / S; this.view.fy -= ((e.clientY - p.y) * k) / S; }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d0 > 0) this.zoomFull(d / d0); d0 = d; }
      redraw();
    });
    const up = (e) => { pts.delete(e.pointerId); d0 = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomFull(e.deltaY < 0 ? 1.15 : 1 / 1.15); redraw(); }, { passive: false });
  }

  // posição no mapa grande (0–1) de um ponto do mundo — usado para centralizar no jogador
  fracOf(x, z) {
    const P = this.G.player;
    if (P.area === 'ermos' || P.area === 'confins') { const c = P.area === 'ermos' ? ERMOS : CONFINS; return [(x - c.offset.x + c.half) / c.size, (z - c.offset.z + c.half) / c.size]; }
    const north = P.area === 'guardiao', cx0 = north ? 35 : 0, cz0 = north ? -306 : 0;
    return [(x - cx0 + 180) / 360, (z - cz0 + 180) / 360];
  }

  // Mapa grande: abre AMPLIADO na sua região (menos informação de uma vez). Pinça/roda/botões dão zoom e dá para arrastar.
  // view = { z: zoom 1–6, fx, fy: ponto do mapa (0–1) no centro da tela }
  drawFull(ctx, W, H) {
    const G = this.G, P = G.player, st = G.state.world;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, W, H);
    const F = Math.min(W, H);
    if (!this.view || this.view.area !== P.area) { const [fx, fy] = this.fracOf(P.pos.x, P.pos.z); this.view = { area: P.area, z: Math.min(3.2, Math.max(2.2, 1.15 * W / F)), fx, fy }; }
    const v = this.view, Z = v.z, S = F * Z;
    const hx = W / (2 * S), hy = H / (2 * S);
    v.fx = hx >= 0.5 ? 0.5 : Math.max(hx, Math.min(1 - hx, v.fx));
    v.fy = hy >= 0.5 ? 0.5 : Math.max(hy, Math.min(1 - hy, v.fy));
    this._fullS = S;
    const ox = W / 2 - v.fx * S, oy = H / 2 - v.fy * S;
    if (P.area === 'ermos' || P.area === 'confins') return this.drawWild(ctx, W, H, S, ox, oy, F, Z);
    // mapa 1 (Vale): −180..180 · mapa 2 (Planície do Guardião): só a planície
    const north = P.area === 'guardiao', view = 360, cx0 = north ? 35 : 0, cz0 = north ? -306 : 0;
    const toS = (x, z) => [ox + ((x - cx0 + view / 2) / view) * S, oy + ((z - cz0 + view / 2) / view) * S];
    const k = this.res / 400;
    ctx.fillStyle = '#0d0b14'; ctx.fillRect(ox, oy, S, S);
    ctx.imageSmoothingEnabled = Z < 1.8; // perto: pixels nítidos (sem borrão)
    ctx.drawImage(north ? this.bgG : this.bg, (cx0 - view / 2 + 200) * k, (cz0 - view / 2 + 450) * k, view * k, view * k, ox, oy, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(10,10,20,.12)'; ctx.fillRect(ox, oy, S, S);
    ctx.textAlign = 'center';
    for (const [id, L] of Object.entries(LOCATIONS)) {
      if (L.secret && !st.discovered.includes(id)) continue;
      if ((L.area || 'world') !== P.area) continue; // cada mapa mostra só os seus lugares
      const known = st.discovered.includes(id);
      const [x, y] = toS(L.x, L.z);
      ctx.font = `${known ? 700 : 600} ${Math.max(10, F / 52)}px Cinzel, Georgia, serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.75)';
      const name = known ? L.name : '???';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = known ? (L.safe ? '#bfffc8' : '#fff4dc') : 'rgba(255,255,255,.55)';
      ctx.fillText(name, x, y);
      if (known && L.levels && !L.safe) {
        ctx.font = `600 ${Math.max(9, F / 70)}px Nunito Sans, sans-serif`;
        ctx.strokeText('Nível ' + L.levels, x, y + F / 42); ctx.fillStyle = '#ffd36b'; ctx.fillText('Nível ' + L.levels, x, y + F / 42);
      }
    }
    drawHunts(ctx, P.area, toS, F, 0, 0, Z);
    if (!north) {
      // entrada da cripta
      const [cx, cy] = toS(CRYPT_MOUND.door.x, CRYPT_MOUND.door.z);
      ctx.fillStyle = '#ffb04a'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
      for (const id in G.interact.npcs) { const n = G.interact.npcs[id]; const [x, y] = toS(n.pos.x, n.pos.z); dot(ctx, x, y, 3, '#ffe9a8'); }
    }
    const ob = this.objective();
    if (ob) { const [x, y] = toS(ob.x, ob.z); ctx.fillStyle = '#ffd36b'; ctx.font = `bold ${Math.max(12, F / 40)}px sans-serif`; ctx.fillText('◆', x, y + 4); }
    // portais: mapa 1 → mapa 2 (no Planalto); mapa 2 → Ermos (mapa 3) e volta ao Vale
    const portal = (px, pz, text, color) => {
      const [qx, qy] = toS(px, pz);
      ctx.font = `bold ${Math.max(14, F / 30)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)';
      ctx.strokeText('◎', qx, qy); ctx.fillStyle = color; ctx.fillText('◎', qx, qy);
      ctx.font = `700 ${Math.max(10, F / 56)}px Nunito Sans, sans-serif`;
      ctx.strokeText(text, qx, qy - F / 34); ctx.fillText(text, qx, qy - F / 34);
    };
    if (north) {
      portal(PORTAL_FENDA.x, PORTAL_FENDA.z - 6, 'Portal → Ermos (mapa 3)', '#e7a6ff');
      portal(GUARDIAO.portalBack.x, GUARDIAO.portalBack.z, 'Portal → Vale (mapa 1)', '#ffd98a');
      // chefe regional
      const [bx, by] = toS(BOSS_SPAWN.x, BOSS_SPAWN.z);
      ctx.font = `bold ${Math.max(12, F / 38)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.8)';
      ctx.strokeText('☠', bx, by + 5); ctx.fillStyle = '#ff6b8a'; ctx.fillText('☠', bx, by + 5);
    } else portal(GUARDIAO.portalGo.x, GUARDIAO.portalGo.z, 'Portal → Planície (mapa 2)', '#d8b4ff');
    const ev = G.events?.active;
    if (ev?.site && (ev.area || 'world') === P.area) {
      const [x, y] = toS(ev.site.x, ev.site.z);
      const pulse = (performance.now() % 1200) / 1200;
      ctx.strokeStyle = `rgba(211,107,255,${1 - pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 8 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(211,107,255,.25)'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.font = `bold ${Math.max(14, F / 34)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)';
      ctx.strokeText('✦', x, y + 5); ctx.fillStyle = '#f0c2ff'; ctx.fillText('✦', x, y + 5);
      const label = 'EVENTO: ' + (ev.title || ev.def?.name || 'Evento');
      ctx.font = `700 ${Math.max(10, F / 56)}px Nunito Sans, sans-serif`;
      ctx.strokeText(label, x, y - 16); ctx.fillStyle = '#f0c2ff'; ctx.fillText(label, x, y - 16);
    }
    const nm = G.natal?.mark;
    if (nm && nm.until > Date.now() && nm.ar === P.area) {
      const [x, y] = toS(nm.x, nm.z);
      ctx.font = `bold ${Math.max(14, F / 34)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)';
      ctx.strokeText('❄', x, y + 5); ctx.fillStyle = '#ff8080'; ctx.fillText('❄', x, y + 5);
      const label = 'NATAL: ' + (ENEMIES[nm.t]?.name || 'Chefe');
      ctx.font = `700 ${Math.max(10, F / 56)}px Nunito Sans, sans-serif`;
      ctx.strokeText(label, x, y - 16); ctx.fillStyle = '#ffb0b0'; ctx.fillText(label, x, y - 16);
    }
    for (const g of G.net.peers.values()) { if (g.pr.ar !== P.area) continue; const [x, y] = toS(g.pos.x, g.pos.z); dot(ctx, x, y, 4, G.party?.isMate(g.id) ? '#7dffa8' : '#5ef0ff'); }
    if (P.area === 'world' || P.area === 'guardiao') {
      const [px, py] = toS(P.pos.x, P.pos.z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-P.yaw + Math.PI);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 6.5); ctx.lineTo(0, 3); ctx.lineTo(-6.5, 6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}


// Hunts no mapa: ⚔ vermelho + nome e nível
function drawHunts(ctx, area, toS, F, ox = 0, oz = 0, Z = 3) {
  for (const h of HUNTS) {
    if (h.area !== area) continue;
    const [x, y] = toS(h.x + ox, h.z + oz), [a, b] = huntRange(h);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)';
    ctx.font = `bold ${Math.max(13, F / 34)}px sans-serif`; ctx.strokeText('⚔', x, y + 5); ctx.fillStyle = '#ff6b5a'; ctx.fillText('⚔', x, y + 5);
    if (Z < 1.6) continue; // mapa afastado: só o ⚔ (menos poluição)
    const t = `${h.name} · Nv ${a === b ? a : a + '–' + b}`;
    ctx.font = `700 ${Math.max(9, F / 66)}px Nunito Sans, sans-serif`; ctx.strokeText(t, x, y + 5 + F / 40); ctx.fillStyle = '#ffb4a8'; ctx.fillText(t, x, y + 5 + F / 40);
  }
}

MapRenderer.prototype.drawWild = function (ctx, W, H, S, ox, oy, F = Math.min(W, H), Z = 1) {
  const G = this.G, P = G.player, area = P.area, st = G.state.world;
  const cfg = area === 'ermos' ? ERMOS : CONFINS;
  const toS = (x, z) => [ox + ((x - cfg.offset.x + cfg.half) / cfg.size) * S, oy + ((z - cfg.offset.z + cfg.half) / cfg.size) * S];
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(this.wildFull(area), ox, oy, S, S);
  ctx.fillStyle = 'rgba(10,10,20,.12)'; ctx.fillRect(ox, oy, S, S);
  ctx.textAlign = 'center';
  const label = (x, z, name, sub, known, safe) => {
    const [sx, sy] = toS(x, z);
    ctx.font = `${known ? 700 : 600} ${Math.max(10, F / 52)}px Cinzel, Georgia, serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.75)';
    const n = known ? name : '???';
    ctx.strokeText(n, sx, sy); ctx.fillStyle = known ? (safe ? '#bfffc8' : '#fff4dc') : 'rgba(255,255,255,.55)'; ctx.fillText(n, sx, sy);
    if (known && sub) { ctx.font = `600 ${Math.max(9, F / 70)}px Nunito Sans, sans-serif`; ctx.strokeText(sub, sx, sy + F / 42); ctx.fillStyle = '#ffd36b'; ctx.fillText(sub, sx, sy + F / 42); }
  };
  if (area === 'ermos') {
    for (const [id, L] of Object.entries(ERMOS.locations)) label(L.x + cfg.offset.x, L.z + cfg.offset.z, L.name, '', st.discovered.includes('ermos_' + id) || L.safe, L.safe);
    const [px, py] = toS(ERMOS.portal.x + cfg.offset.x, ERMOS.portal.z + cfg.offset.z);
    ctx.font = `bold ${Math.max(14, F / 30)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)'; ctx.fillStyle = '#ffc46b'; ctx.strokeText('◎', px, py + 5); ctx.fillText('◎', px, py + 5);
    ctx.font = `700 ${Math.max(10, F / 56)}px Nunito Sans, sans-serif`; ctx.strokeText(`Portal → Confins`, px, py - F / 34); ctx.fillText(`Portal → Confins`, px, py - F / 34);
  } else {
    for (const B of CONFINS_BIOMES) label(B.cx + cfg.offset.x, B.cz + cfg.offset.z, B.name, '', st.discovered.includes('confins_' + B.id), false);
    label(CONFINS.entry.x + cfg.offset.x, CONFINS.entry.z + cfg.offset.z - 60, CONFINS.camp.name, '', true, true);
    for (const S of CONFINS.structs || []) {
      const known = st.discovered.includes('est_' + S.id), [sx, sy] = toS(S.x + cfg.offset.x, S.z + cfg.offset.z);
      ctx.font = `bold ${Math.max(13, S.r / 8)}px sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,20,.85)'; ctx.fillStyle = known ? '#ffd36b' : 'rgba(255,211,107,.55)';
      const ic = S.kind === 'castelo' ? '♜' : S.kind === 'caverna' ? '◉' : S.kind === 'templo' ? '▲' : '◎';
      ctx.strokeText(ic, sx, sy + 4); ctx.fillText(ic, sx, sy + 4);
      label(S.x + cfg.offset.x, S.z + cfg.offset.z + 22, S.name, '', known, false);
    }
  }
  drawHunts(ctx, area, toS, F, cfg.offset.x, cfg.offset.z, Z);
  for (const g of G.net.peers.values()) { if (g.pr.ar !== area) continue; const [x, y] = toS(g.pos.x, g.pos.z); dot(ctx, x, y, 4, G.party?.isMate(g.id) ? '#7dffa8' : '#5ef0ff'); }
  const [px, py] = toS(P.pos.x, P.pos.z);
  ctx.save(); ctx.translate(px, py); ctx.rotate(-P.yaw + Math.PI);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 6.5); ctx.lineTo(0, 3); ctx.lineTo(-6.5, 6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
};

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function edgeMarker(ctx, x, y, size, color, glyph) {
  const R = size / 2 - 9;
  const d = Math.hypot(x, y);
  if (d > R) { x = (x / d) * R; y = (y / d) * R; }
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
  ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeText(glyph, x, y); ctx.fillText(glyph, x, y);
  ctx.textBaseline = 'alphabetic';
}
