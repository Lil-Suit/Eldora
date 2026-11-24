// =============================================================
// Lugares abertos para coisas que nascem no mapa (fendas/raids, chefes de Natal):
// andável, fora de vila/acampamento, longe de construções, portais, baús e pedras de teleporte,
// e com espaço livre em volta (não fica preso num canto nem dentro de ruína).
// =============================================================
import { LOCATIONS, ERMOS, CONFINS, PLATEAU_EXT, GUARDIAO, BOSS_SPAWN } from '../config/world.js';

// lugares do Vale que são campo aberto (os outros têm construção: ponte, ruínas, cripta, acampamento…)
const OPEN_WORLD = new Set(['prado', 'floresta']);

export function openSpot(G, x, z, area, R = 12) {
  const W = G.world, C = W.col;
  if (!W.walkable(x, z, area) || W.isSafe(x, z, area) || W.swimmable?.(x, z, area)) return false;
  if (area === 'world') {
    for (const [k, L] of Object.entries(LOCATIONS)) if (!L.area && !OPEN_WORLD.has(k) && Math.hypot(x - L.x, z - L.z) < L.r + 10) return false;
  } else if (area === 'guardiao') {
    // mapa 2: longe do trono do chefe e da chegada
    if (Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) < BOSS_SPAWN.arena + 30) return false;
    if (Math.hypot(x - GUARDIAO.entry.x, z - GUARDIAO.entry.z) < 30) return false;
  } else if (area === 'ermos') {
    const ex = x - ERMOS.offset.x, ez = z - ERMOS.offset.z, Ls = ERMOS.locations || {};
    if (Ls.acampamento && Math.hypot(ex - Ls.acampamento.x, ez - Ls.acampamento.z) < Ls.acampamento.r + 25) return false;
    // ruínas em anel (Ossário: 40 m, Trono: 45 m) e o portal dos Confins
    for (const [k, rr] of [['ossario', 56], ['trono', 62]]) { const L = Ls[k]; if (L && Math.hypot(ex - L.x, ez - L.z) < rr) return false; }
    if (ERMOS.portal && Math.hypot(ex - ERMOS.portal.x, ez - ERMOS.portal.z) < 22) return false;
  } else if (area === 'confins') {
    const cx = x - CONFINS.offset.x, cz = z - CONFINS.offset.z;
    if (Math.hypot(cx - CONFINS.entry.x, cz - CONFINS.entry.z) < (CONFINS.camp?.r || 26) + 30) return false;
    // castelos, cavernas, templos e círculos gigantes (só existem perto de quem está jogando: usa a lista)
    for (const S of CONFINS.structs || []) if (Math.hypot(cx - S.x, cz - S.z) < S.r + 25) return false;
  }
  // portais, pedras de teleporte, baús, placas e quem mais dá para usar: longe deles
  for (const it of W.interactables || []) if ((it.area || 'world') === area && Math.hypot(x - it.x, z - it.z) < 18) return false;
  // nenhuma parede, casa, cerca ou pedra grande perto
  for (const c of C.query(x - R, z - R, x + R, z + R, [])) {
    if (c.t === 'b') {
      const dx = x - c.x, dz = z - c.z, lx = dx * c.cs + dz * c.sn, lz = -dx * c.sn + dz * c.cs;
      if (Math.abs(lx) < c.hw + R && Math.abs(lz) < c.hd + R) return false;
    } else if (c.r > 1.8 && Math.hypot(c.x - x, c.z - z) < c.r + R) return false;
  }
  // espaço livre em volta: dá para andar R metros para todos os lados
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4;
    for (const d of [R / 3, (2 * R) / 3, R]) {
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!W.walkable(px, pz, area) || W.swimmable?.(px, pz, area) || C.pointBlocked(px, pz, 0.8)) return false;
    }
  }
  return true;
}

// um lugar aberto sorteado no mapa TODO da área (Vale ou Ermos). Nos Confins (enormes) fica num anel em volta de `near`.
export function randomSpot(G, area, { near = null, minR = 120, maxR = 650, tries = 250, filter = null, R = 12 } = {}) {
  for (let i = 0; i < tries; i++) {
    let x, z;
    if (area === 'ermos') { const h = ERMOS.playable - 30; x = ERMOS.offset.x + (Math.random() - 0.5) * 2 * h; z = ERMOS.offset.z + (Math.random() - 0.5) * 2 * h; }
    else if (area === 'confins') {
      const c = near || { x: CONFINS.offset.x + CONFINS.entry.x, z: CONFINS.offset.z + CONFINS.entry.z };
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
    } else if (area === 'guardiao') { const X = PLATEAU_EXT; x = X.x0 + 22 + Math.random() * (X.x1 - X.x0 - 44); z = X.z0 + 22 + Math.random() * (GUARDIAO.zSouth - 22 - X.z0 - 22); }
    else { x = (Math.random() - 0.5) * 300; z = (Math.random() - 0.5) * 300; }
    if (filter && !filter(x, z)) continue;
    if (openSpot(G, x, z, area, R)) return { x, z };
  }
  return null;
}

// longe de gente e de chefe: nada de fenda (ou chefe de Natal) nascendo em cima de quem já está lutando
export function awayFromFights(G, x, z, area, { players = 45, bosses = 60, fenda = 70 } = {}) {
  const P = G.player;
  if (players && P && P.area === area && Math.hypot(P.pos.x - x, P.pos.z - z) < players) return false;
  if (players) for (const g of G.net?.peers?.values() || []) if ((g.pr?.ar || 'world') === area && g.pos && Math.hypot(g.pos.x - x, g.pos.z - z) < players) return false;
  if (bosses) for (const e of G.enemies) if (e.area === area && (e.def.boss || e.def.miniboss || e.def.worldBoss) && e.alive() && !e.removed && Math.hypot(e.pos.x - x, e.pos.z - z) < bosses) return false;
  const ev = G.events?.active, R = G.events?.remotePortal;
  if (fenda && ev?.site && (ev.area || 'world') === area && Math.hypot(ev.site.x - x, ev.site.z - z) < fenda) return false;
  if (fenda && R && R.area === area && Math.hypot(R.v.mx - x, R.v.mz - z) < fenda) return false;
  return true;
}
