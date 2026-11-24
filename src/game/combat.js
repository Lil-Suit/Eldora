import * as THREE from 'three';
import { rollDamage, mitigate, armorMitigate } from '../core/stats.js';
import { rng } from '../core/rng.js';
import { angleDiff } from '../engine/noise.js';
import { BALANCE } from '../config/balance.js';
import { BOSS } from '../config/enemies.js';

const LD = BALANCE.levelDiff;
export function enemyLevelOf(e) { return e.def?.boss ? BOSS.level : e.level; }

// ---------- dano do jogador nos inimigos ----------
export function hitEnemy(G, e, mult, o = {}) {
  if (!e.alive() || e.area !== G.player.area) return null;
  const P = G.player, st = P.stats;
  const isSkill = !!o.skill;
  const power = st.power * (isSkill ? 1 + st.spow : 1);
  const r = rollDamage(power, mult, Math.min(0.95, st.crit + (o.bonusCrit || 0)), st.critMult, rng);
  const crit = r.crit;
  const diff = enemyLevelOf(e) - G.state.player.level;
  const amount = r.amount * (diff > 0 ? Math.max(LD.playerDmgMin, 1 - LD.playerDmgPerLevel * diff) : 1);
  const dmg = e.evading ? 0 : armorMitigate(amount, st.power, e.stats.armor ?? e.stats.def);
  let hx = o.dirX, hz = o.dirZ; // direção do golpe (para o tremor e as lascas)
  if (!(Math.hypot(hx || 0, hz || 0) > 0.01)) { hx = e.pos.x - P.pos.x; hz = e.pos.z - P.pos.z; }
  const res = e.takeDamage(dmg, { crit, source: 'player', skill: isSkill, knock: o.knock, dirX: o.dirX, dirZ: o.dirZ, hx, hz });
  if (!res) return null;
  // monstro compartilhado: o dano vai para quem simula o mundo (anfitrião)
  if (e.replica && res.dmg > 0) G.net?.sendDamage(e, res.dmg, o);
  const pos = e.pos;
  G.ui.damageNumber(pos.x, pos.y + e.rig.height * 0.9, pos.z, e.evading ? 'Evadiu' : res.dmg, crit ? 'crit' : 'dmg');
  if (res.dmg > 0) {
    // impacto: faíscas/lascas do material do monstro (o monstro já pisca, amassa e treme em takeDamage).
    // Sem micro-pausa (hitstop): congelava o jogo a cada golpe e parecia lag.
    e.impactFx?.(hx, hz, crit, o.color);
  }
  G.audio.play(crit ? 'crit' : 'hit', { gap: 25 });
  if (o.shake) G.cam.shake(o.shake, 0.18);
  P.onDealtDamage(res.dmg, crit, e, o);
  G.state.player.stats.damageDealt += res.dmg;
  if (o.slow) e.applySlow(o.slow, o.slowDur || 2);
  if (o.stun) e.applyStun(o.stun);
  if (o.freeze) e.applyFreeze(o.freeze);
  if (st.natal && res.dmg > 0) natalFreeze(G, e, st.natal);
  return res;
}

// peças natalinas: congelamento leve nos inimigos em volta de quem você acertou (gasta mana por segundo)
function natalFreeze(G, e, N) {
  const P = G.player;
  if (P.natalOff && (P.cls.resource.id === 'mana' ? P.res : P.smana) < N.mana + 1) return; // sem mana
  const now = G.time?.t || 0;
  if (now < (P.natalNext || 0)) return; // no máximo a cada 0,4 s (golpes rápidos não multiplicam)
  P.natalNext = now + 0.4;
  let held = 0;
  for (const o of G.enemies) {
    if (!o.alive() || o.area !== e.area || Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > N.radius) continue;
    o.applySlow(N.k, N.dur);
    if (o.replica) G.net?.sendDamage(o, 0, { slow: N.k, slowDur: N.dur });
    held++;
    if (held <= 6) G.fx.emit(o.pos.x, o.pos.y + 0.6, o.pos.z, 0, 1.2, 0, 0xcff4ff, 0.35, 0.5, -1, 1);
  }
  if (held) { P.natalHeld = Math.max(P.natalHeld || 0, held); G.fx.ring(e.pos.x, e.pos.y, e.pos.z, N.radius, 0x9fe8ff, 0.35); }
}

// monstros + jogadores que você escolheu atacar no PvP (ou que te atacaram)
export function targets(G) { const f = G.pvp?.foes(); return f && f.length ? G.enemies.concat(f) : G.enemies; }

export function enemiesNear(G, x, z, r) {
  const out = [];
  for (const e of targets(G)) {
    if (!e.alive() || e.area !== G.player.area) continue;
    const rr = r + e.radius;
    if ((e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 <= rr * rr) out.push(e);
  }
  return out;
}

export function meleeArc(G, ox, oz, yaw, range, arcDeg, mult, o = {}) {
  const half = (arcDeg * Math.PI) / 360;
  const hits = [];
  for (const e of enemiesNear(G, ox, oz, range + 1.3)) {
    const a = Math.atan2(e.pos.x - ox, e.pos.z - oz);
    const d = Math.hypot(e.pos.x - ox, e.pos.z - oz);
    // em desníveis (morro), a distância na tela parece menor: tolerância proporcional à diferença de altura
    const dy = o.fromY !== undefined ? Math.abs(e.pos.y - o.fromY) : 0;
    if (dy > 1.6 + bodyHeight(e) * 0.5) continue; // em cima do barranco / lá embaixo: a espada não alcança
    if (d > range + e.radius + Math.min(1.3, dy * 0.55)) continue;
    if (d > e.radius + 0.6 && Math.abs(angleDiff(yaw, a)) > half + Math.min(0.35, dy * 0.12)) continue;
    if (!G.world.lineOfSight(ox, oz, e.pos.x, e.pos.z)) continue;
    hits.push({ e, d });
  }
  hits.sort((a, b) => a.d - b.d);
  const max = o.maxTargets || 99;
  let n = 0;
  for (const h of hits.slice(0, max)) {
    const dx = h.e.pos.x - ox, dz = h.e.pos.z - oz, l = Math.hypot(dx, dz) || 1;
    if (hitEnemy(G, h.e, mult, { ...o, dirX: dx / l, dirZ: dz / l })) n++;
  }
  return n;
}

export function aoe(G, x, z, r, mult, o = {}) {
  let n = 0;
  for (const e of enemiesNear(G, x, z, r)) {
    if (o.los !== false && !G.world.lineOfSight(x, z, e.pos.x, e.pos.z)) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, l = Math.hypot(dx, dz) || 1;
    if (hitEnemy(G, e, mult, { ...o, dirX: dx / l, dirZ: dz / l })) n++;
  }
  return n;
}

export function lineHits(G, ax, az, bx, bz, width, mult, o = {}) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  let n = 0;
  for (const e of targets(G)) {
    if (!e.alive() || e.area !== G.player.area || (o.exclude && o.exclude.has(e))) continue;
    const t = Math.max(0, Math.min(1, ((e.pos.x - ax) * dx + (e.pos.z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t;
    if (Math.hypot(e.pos.x - px, e.pos.z - pz) <= width + e.radius) {
      if (hitEnemy(G, e, mult, { ...o, dirX: dx / Math.sqrt(L2), dirZ: dz / Math.sqrt(L2) })) { n++; o.exclude?.add(e); }
    }
  }
  return n;
}

// ---------- dano dos inimigos no jogador ----------
export function hitPlayer(G, rawDmg, src = {}) {
  const P = G.player;
  if (!P.alive || P.area !== (src.area || P.area)) return 0;
  if (P.invuln > 0) { G.ui.damageNumber(P.pos.x, P.pos.y + 2.1, P.pos.z, 'Esquivou', 'miss'); return 0; }
  const v = 1 + (Math.random() * 2 - 1) * 0.1;
  const diff = (src.level ?? G.state.player.level) - G.state.player.level;
  const lm = diff > 0 ? Math.min(LD.enemyDmgMax, 1 + LD.enemyDmgPerLevel * diff) : Math.max(LD.lowerEnemyDmgMin, 1 + LD.lowerEnemyDmgPerLevel * diff);
  let dmg = mitigate(rawDmg * v * lm, P.stats.def, src.level ?? G.state.player.level);
  const got = P.takeDamage(dmg, src);
  // efeitos dos golpes especiais (a esquiva evita tudo)
  const f = src.fx;
  if (got > 0 && f && P.alive) {
    if (Array.isArray(f.slow)) P.applySlow(Math.max(0.2, Math.min(1, +f.slow[0] || 1)), Math.min(4, +f.slow[1] || 0), 'Lento');
    if (+f.root > 0) P.applySlow(0, Math.min(2.5, +f.root), 'Preso! Esquive');
    if (Array.isArray(f.pull) && Number.isFinite(+f.pull[0]) && Number.isFinite(+f.pull[1])) P.pullTo = { x: +f.pull[0], z: +f.pull[1], t: 0.35 }; // corrente puxa
    if (Array.isArray(f.dot)) P.applyDot(Math.min(500, +f.dot[0] || 0), Math.min(6, +f.dot[1] || 0), (+f.dot[2]) | 0 || 0x7aff5a);
  }
  return got;
}

// ---------- projéteis ----------
// p: { owner, kind, x,y,z, dx,dz, speed, range, radius, mult|dmg, pierce, homing, color, trail, onHit, onEnd, skill, area }
const ARC = new Set(['pedra', 'neve', 'presente']); // tiros em arco (caem com a gravidade)
// altura do corpo (para acertar só quem está na altura do tiro) e do peito (para onde o tiro mira)
export function bodyHeight(e) { if (e.remote !== undefined || e.isPlayer || e.cls) return 2.5; return Math.max(1, Math.min(9, (e.rig?.height || 1.5) * Math.max(0.6, e.baseScale || 1))); }
const chestOf = (t) => bodyHeight(t) * 0.62;
const isAlive = (t) => (typeof t.alive === 'function' ? t.alive() : !!t.alive);
export function spawnProjectile(G, p) {
  // cada flecha do arqueiro gasta 1 flecha da bolsa (GM não gasta)
  if (p.owner === 'player' && !p.visual && p.kind === 'flecha' && G.player?.cls?.id === 'arqueiro' && !G.saver?.serverGm) {
    if (G.inv.count('flechas') <= 0) return null;
    G.inv.removeId('flechas', 1); G._arrowsDirty = true;
  }
  if (p.owner === 'player' && !p.visual && G.net?.capturing) { G.net.recordProjectile(p); p.fxCap = true; }
  const mesh = G.fx.projectileMesh(p.kind, p.color);
  // tamanho do tiro acompanha o tamanho de quem atira (gigante joga pedra grande); o acerto cresce um pouco junto
  const ps = p.scale && p.scale !== 1 ? Math.max(0.6, Math.min(4, p.scale)) : 1;
  if (ps !== 1) { mesh.scale.multiplyScalar(ps); if (p.radius && !p.visual) p = { ...p, radius: p.radius * Math.min(1.6, 0.55 + 0.45 * ps) }; }
  const proj = { ...p, traveled: 0, hit: new Set(), mesh, alive: true, vx: p.dx * p.speed, vz: p.dz * p.speed, vy: p.vy || 0 };
  // mira em 3D: com alvo, o tiro vai RETO na direção do peito dele (sobe ou desce o morro) e bate no chão/morro no caminho
  if (!ARC.has(p.kind) && !p.vy) {
    let T = p.target && isAlive(p.target) && p.target.area === p.area ? p.target : null;
    if (!T && p.owner === 'enemy') { // monstro: no jogador mais perto na direção do tiro
      let bd = (p.range || 20) + 4;
      for (const q of (G.net ? G.net.targets(p.area) : [G.player])) { if (!q?.alive || q.area !== p.area) continue; const dx = q.pos.x - p.x, dz = q.pos.z - p.z, d = Math.hypot(dx, dz); if (d < bd && (dx * p.dx + dz * p.dz) / (d || 1) > 0.8) { bd = d; T = q; } }
    }
    if (T) { const d = Math.hypot(T.pos.x - p.x, T.pos.z - p.z) || 1; proj.lineVy = ((T.pos.y + chestOf(T)) - p.y) / d * p.speed; proj.aimT = T; }
  }
  // flecha do jogador voa RETA na altura em que saiu do arco (antes subia/descia até 1,15 m e parecia torta)
  if (p.kind === 'flecha' && p.owner === 'player' && p.height == null) proj.height = Math.max(0.7, Math.min(1.7, p.y - G.world.groundHeight(p.x, p.z, p.area)));
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = Math.atan2(p.dx, p.dz);
  // rastro fino de vento (flechas) ou de energia (magias)
  if (p.owner === 'player' && p.kind === 'flecha') {
    const sc = p.kind === 'flecha' ? (p.trail ? p.color : 0xe8f6ff) : p.kind === 'fogo' ? 0xffa040 : (p.color ?? 0xc79bff);
    proj.streak = G.fx.streak(sc, (p.kind === 'flecha' ? 16 : 10) + (G.ultra ? 10 : 0));
    proj.streak.push(p.x, p.y, p.z);
  }
  G.projectiles.push(proj);
  return proj;
}

export function updateProjectiles(G, dt) {
  const list = G.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!p.alive || (p.owner === 'player' && p.area !== G.player.area)) { endProjectile(G, p, false); list.splice(i, 1); continue; }
    if (p.mesh) p.mesh.visible = p.area === G.player.area;
    // perseguição leve
    if (p.homing && p.target && p.target.alive()) {
      const tx = p.target.pos.x - p.x, tz = p.target.pos.z - p.z, l = Math.hypot(tx, tz) || 1;
      const sp = Math.hypot(p.vx, p.vz);
      p.vx += (tx / l * sp - p.vx) * Math.min(1, p.homing * dt);
      p.vz += (tz / l * sp - p.vz) * Math.min(1, p.homing * dt);
      const s2 = Math.hypot(p.vx, p.vz) || 1; p.vx = p.vx / s2 * sp; p.vz = p.vz / s2 * sp;
    }
    // perseguição leve também na altura (alvo subindo/descendo)
    if (p.lineVy != null && p.homing && p.aimT && isAlive(p.aimT)) { const d = Math.hypot(p.aimT.pos.x - p.x, p.aimT.pos.z - p.z) || 1, want = ((p.aimT.pos.y + chestOf(p.aimT)) - p.y) / d * Math.hypot(p.vx, p.vz); p.lineVy += (want - p.lineVy) * Math.min(1, p.homing * dt); }
    const stepX = p.vx * dt, stepZ = p.vz * dt, stepL = Math.hypot(stepX, stepZ);
    const nx = p.x + stepX, nz = p.z + stepZ;
    p.traveled += stepL;
    // obstáculos (paredes, casas, muralha...)
    if (G.world.col.segment(p.x, p.z, nx, nz, 'los') >= 0) { p.x = nx; p.z = nz; endProjectile(G, p, true); list.splice(i, 1); continue; }
    p.x = nx; p.z = nz;
    if (p.vy) { p.vy -= 14 * dt; p.y += p.vy * dt; }
    const g = G.world.groundHeight(p.x, p.z, p.area);
    const arc = ARC.has(p.kind);
    let blocked = false;
    if (!arc) {
      if (p.lineVy != null) { p.y += p.lineVy * dt; blocked = p.y < g - 0.25; } // reto até o alvo: o morro no meio segura o tiro (raspando no chão ainda passa)
      else {
        // sem alvo: acompanha o chão, mas encosta íngreme (morro, barranco) segura o tiro
        const want = g + (p.height ?? 1.15);
        if (want - p.y > stepL * 0.9 + 0.3) blocked = true;
        else p.y += (want - p.y) * Math.min(1, dt * 3);
      }
    }
    if (blocked || (p.y < g + 0.05 && arc)) { endProjectile(G, p, true); list.splice(i, 1); continue; }
    if (p.kind === 'presente' && p.mesh.userData.ball) { p.mesh.userData.ball.rotation.y += dt * 9; p.mesh.userData.ball.rotation.x += dt * 4; }
    if (p.kind === 'neve' && p.mesh.userData.ball) { p.mesh.userData.ball.rotation.x += dt * 7; if (Math.random() < dt * 25) G.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5), 0.2, (Math.random() - 0.5), 0xffffff, 0.22, 0.45, 3, 1); }
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
    const mu = p.mesh.userData; if (mu.spin) { mu.spin.rotation.z += dt * 13; mu.flick.scale.setScalar(mu.fs * (0.88 + Math.random() * 0.24)); }
    if (p.streak) { p.streak.push(p.x, p.y, p.z); p.streak.line.visible = p.mesh.visible; }
    if (p.owner === 'enemy' && !G.fx.bossLite && (p.kind === 'arcano' || p.kind === 'fogo') && Math.random() < 0.6) G.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, p.color ?? 0xb88cff, 0.35, 0.35, 0, 2);
    if (G.ultra && p.owner === 'player') { // Ultra: rastro brilhante de vento/energia atrás da flecha e da magia
      const tc = p.kind === 'flecha' ? (p.trail || p.color || 0xe8f6ff) : (p.kind === 'fogo' ? 0xffa040 : (p.color ?? 0xc79bff));
      G.fx.emit(p.x - p.vx * 0.012, p.y, p.z - p.vz * 0.012, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25, tc, p.kind === 'flecha' ? 0.2 : 0.42, 0.22, 0, 3);
      if (p.kind === 'flecha' && Math.random() < 0.5) G.fx.emit(p.x, p.y, p.z, -p.vx * 0.03 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, -p.vz * 0.03 + (Math.random() - 0.5) * 0.5, 0xffffff, 0.07, 0.3, 0, 3);
    }
    if (p.kind === 'flecha' && p.owner === 'player' && Math.random() < 0.25) G.fx.emit(p.x, p.y, p.z, -p.vx * 0.02 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, -p.vz * 0.02 + (Math.random() - 0.5) * 0.3, 0xffffff, 0.08, 0.18, 0, 4);
    if (p.kind === 'fogo' && p.mesh.visible && Math.random() < 0.45) G.fx.smoke(p.x - p.vx * 0.02, p.y + 0.1, p.z - p.vz * 0.02, 0, 0.6, 0, 0x3a3230, 0.7, 0.7, 2.2, 0.45); // fumaça atrás da bola de fogo
    if (p.owner === 'player' && p.kind !== 'flecha' && p.mesh.visible) { const tc = p.trail || p.color || 0xc79bff; G.fx.emit(p.x - p.vx * 0.01, p.y, p.z - p.vz * 0.01, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, tc, 0.38, 0.22, 0, 3); if (Math.random() < 0.5) G.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0xffffff, 0.08, 0.3, 0, 2); } // rastro de energia
    if (p.trail && Math.random() < 0.8) G.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, p.trail, p.trailSize || 0.3, 0.35, 0, 2);
    let done = false;
    if (p.owner === 'player' && !p.visual) {
      for (const e of targets(G)) {
        if (!e.alive() || e.area !== G.player.area || p.hit.has(e)) continue;
        const rr = p.radius + e.radius;
        if (p.y < e.pos.y - 0.6 || p.y > e.pos.y + bodyHeight(e) + 0.6) continue; // passou por cima/por baixo (morro)
        if ((e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2 < rr * rr) {
          p.hit.add(e);
          if (p.onHit) p.onHit(e, p);
          else hitEnemy(G, e, p.mult, { skill: p.skill, color: p.color, dirX: p.vx / p.speed, dirZ: p.vz / p.speed, knock: p.knock, slow: p.slow, slowDur: p.slowDur });
          if (p.pierce > 0) p.pierce--; else { done = true; break; }
        }
      }
    } else if (!p.visual) {
      // pedras de inimigos atingem qualquer jogador (o seu herói ou outro jogador conectado)
      for (const P of (G.net ? G.net.targets(p.area) : [G.player])) {
        if (!P.alive || P.area !== p.area) continue;
        if (!ARC.has(p.kind) && (p.y < P.pos.y - 0.6 || p.y > P.pos.y + 3.1)) continue; // tiro passou por cima/por baixo
        if ((P.pos.x - p.x) ** 2 + (P.pos.z - p.z) ** 2 < (p.radius + (P.radius || 0.5)) ** 2) {
          if (P.remote) G.net.sendHit(P.peer, p.dmg, { name: p.srcName, area: p.area, level: p.level, fx: p.fx });
          else hitPlayer(G, p.dmg, { name: p.srcName, area: p.area, level: p.level, fx: p.fx });
          done = true; break;
        }
      }
    }
    if (done || p.traveled >= p.range) { endProjectile(G, p, !done || true); list.splice(i, 1); }
  }
}

function endProjectile(G, p, impact) {
  if (!p.mesh) return;
  G.fx.remove(p.mesh);
  p.mesh = null;
  p.alive = false;
  if (p.streak) { p.streak.end(); p.streak = null; }
  if (p.onEnd) { try { p.onEnd(p); } catch { /* ok */ } }
  if (impact && p.kind === 'flecha' && p.owner === 'player') G.fx.burst({ x: p.x, y: p.y, z: p.z }, { count: 5, color: [0xffffff, 0xd8c8a0], speed: 3, size: 0.14, life: 0.22, gravity: 6, up: 1 });
  if (impact && p.onEnd) { if (p.fxCap && G.net) G.net.capture(() => p.onEnd(p)); else p.onEnd(p); }
  else if (impact && p.kind !== 'flecha') G.fx.burst({ x: p.x, y: p.y, z: p.z }, { count: 6, color: p.color || 0xffffff, speed: 3, size: 0.25, life: 0.3 });
}

// Alvo automático (toque / assistência de mira)
export function autoTarget(G, fromX, fromZ, facing, range, cone = 1.9, strict = false) {
  let best = null, bestScore = Infinity;
  for (const e of targets(G)) {
    if (!e.alive() || e.area !== G.player.area || !e.visibleToPlayer) continue;
    const d = Math.hypot(e.pos.x - fromX, e.pos.z - fromZ);
    if (d > range) continue;
    const a = Math.abs(angleDiff(facing, Math.atan2(e.pos.x - fromX, e.pos.z - fromZ)));
    if (a > cone && (strict || d > 3)) continue; // strict (mira de tiro): só o que está na mira, nem o colado de lado
    const score = d + a * 4 - (e === G.target ? 5 : 0) - (e.def.boss ? 3 : 0);
    if (score < bestScore && G.world.lineOfSight(fromX, fromZ, e.pos.x, e.pos.z) && G.world.terrainClear(fromX, (G.player?.pos.y ?? 0) + 1.5, fromZ, e.pos.x, e.pos.y + bodyHeight(e) * 0.55, e.pos.z, G.player?.area)) { best = e; bestScore = score; }
  }
  return best;
}

export const _v = new THREE.Vector3();
