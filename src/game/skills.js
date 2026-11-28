import * as THREE from 'three';
import { meleeArc, aoe, lineHits, spawnProjectile, hitEnemy } from './combat.js';
import { basicCooldown } from '../core/stats.js';
import { SKILL_UNLOCKS } from '../config/classes.js';

// Executa ataque básico e habilidades de cada classe. aim: { x, z, yaw, dirX, dirZ, target, ground:{x,z} }

// Direção atualizada no momento do disparo: mira no alvo onde ele ESTÁ (com antecipação do movimento),
// e não onde estava quando o botão foi apertado. Resolve os erros de mira com o analógico.
export function aimNow(G, P, aim, from, speed = 30, maxRange = 99) {
  const t = aim.target;
  if (t && t.alive() && t.area === P.area) {
    let tx = t.pos.x, tz = t.pos.z;
    const d0 = Math.hypot(tx - from.x, tz - from.z);
    if (d0 <= maxRange + 2) {
      const lead = Math.min(0.6, d0 / Math.max(1, speed));
      tx += (t.vx || 0) * lead; tz += (t.vz || 0) * lead;
      const dx = tx - from.x, dz = tz - from.z, l = Math.hypot(dx, dz) || 1;
      P.faceTo(Math.atan2(dx, dz));
      return { dx: dx / l, dz: dz / l, yaw: Math.atan2(dx, dz), target: t };
    }
  }
  return { dx: aim.dirX, dz: aim.dirZ, yaw: aim.yaw, target: null };
}

// ponto no chão limitado ao alcance da habilidade
function groundIn(P, aim, range) {
  const dx = aim.ground.x - P.pos.x, dz = aim.ground.z - P.pos.z, l = Math.hypot(dx, dz);
  if (l <= range || l < 0.01) return { x: aim.ground.x, z: aim.ground.z };
  return { x: P.pos.x + dx / l * range, z: P.pos.z + dz / l * range };
}

// arqueiro: precisa de flechas (compra na Fornecedora da vila)
export function hasArrows(G, P) {
  if (P.cls.id !== 'arqueiro' || G.saver?.serverGm) return true;
  if (G.inv.count('flechas') > 0) return true;
  if (!G._noArrowT || G.time.real - G._noArrowT > 3) { G._noArrowT = G.time.real; G.ui.toastSmall('Sem flechas! Compre na Fornecedora da vila.', 3); G.audio.play('error'); }
  return false;
}

export function doBasic(G, P, aim) {
  const b = P.cls.basic;
  if (!hasArrows(G, P)) return;
  P.faceTo(aim.yaw);
  P.cds.basic = basicCooldown(P.cls, P.stats) / (P.buffs.haste > 0 ? 1 + (P.buffs.hasteA || 0) : 1);
  P.basicCount++;
  const uniq = P.stats.effects;
  if (b.type === 'melee') {
    P.combo = (P.combo + 1) % b.comboEvery;
    const heavy = P.combo === 0;
    const mult = b.mult * (heavy ? b.comboMult : 1);
    // passo de ataque: se o alvo está um pouco fora do alcance (ex.: subindo o morro), avança até ele
    let lungeT = 0;
    const tg = aim.target;
    if (tg && tg.alive() && tg.area === P.area) {
      const dx = tg.pos.x - P.pos.x, dz = tg.pos.z - P.pos.z, d = Math.hypot(dx, dz) - tg.radius;
      if (d > b.range * 0.75 && d < b.range + 3.4) {
        const need = d - b.range * 0.55;
        lungeT = Math.min(0.2, need / 17);
        P.startMove({ dirX: dx / (d + tg.radius), dirZ: dz / (d + tg.radius), speed: need / Math.max(0.05, lungeT), dur: lungeT, keepFacing: true, keepAction: true });
      }
    }
    const yaw = aim.yaw;
    P.startAction('slash', 0.44 / Math.max(0.7, P.stats.weaponSpd * (1 + P.stats.aspd)) + lungeT, { variant: heavy ? 2 : P.basicCount % 2, slow: 0.5 });
    G.later(0.12 + lungeT, () => {
      if (!P.alive) return;
      // reorienta para o alvo, caso ele tenha se movido durante o golpe
      let y = yaw;
      if (tg && tg.alive()) { y = Math.atan2(tg.pos.x - P.pos.x, tg.pos.z - P.pos.z); }
      P.faceTo(y);
      const n = meleeArc(G, P.pos.x, P.pos.z, y, b.range, b.arc, mult, { maxTargets: b.maxTargets, heavy, shake: heavy ? 0.18 : 0, basic: true, fromY: P.pos.y });
      if (!(G.ultra && P.rig?.trail)) G.fx.slash(P.pos.x, P.pos.y, P.pos.z, y, b.range, b.arc, heavy ? 0xffd36b : 0xfff0c8, 0.22, G.world.groundHeight(P.pos.x + Math.sin(y) * b.range * 0.8, P.pos.z + Math.cos(y) * b.range * 0.8, P.area) - P.pos.y, heavy);
      G.audio.play('swing');
      if (heavy) {
        // golpe pesado: a lâmina bate no chão, racha e levanta poeira
        const fx = P.pos.x + Math.sin(y) * b.range * 0.75, fz = P.pos.z + Math.cos(y) * b.range * 0.75, fy = G.world.groundHeight(fx, fz, P.area);
        G.fx.cracks(fx, fy, fz, [y, y + 0.9, y - 0.9, y + Math.PI], 1.6, 0xffc061, 1.6, 0.09);
        G.fx.dust(fx, fy, fz, 1.6, 0xb8a68a, 8);
        G.fx.burst({ x: fx, y: fy + 0.2, z: fz }, { count: 10, color: [0xffe2a0, 0xffffff], speed: 5, size: 0.22, life: 0.3, gravity: 14, up: 3 });
      }
      if (n === 0 && heavy) G.audio.play('swing', { gap: 0 });
      if (uniq.has('onda_luz') && P.basicCount % 4 === 0) {
        spawnProjectile(G, { owner: 'player', kind: 'arcano', x: P.pos.x, y: P.pos.y + 1.1, z: P.pos.z, dx: Math.sin(y), dz: Math.cos(y), speed: 30, range: 14, radius: 1.3, mult: 1.5, pierce: 99, color: 0xfff2a8, trail: 0xffe08a, trailSize: 0.6, area: P.area });
      }
    });
  } else {
    const isBow = P.cls.id === 'arqueiro';
    P.startAction(isBow ? 'shoot' : 'cast', isBow ? 0.42 : 0.4, { slow: 0.65 });
    if (!isBow) G.fx.castGlow(() => P.muzzle(), 0xb88cff, 0.15, 0.55); // energia juntando na ponta da varinha
    G.later(isBow ? 0.2 : 0.15, () => {
      if (!P.alive) return;
      const tip = P.muzzle();
      const a = aimNow(G, P, aim, tip, b.speed, b.range);
      const dx = a.dx, dz = a.dz;
      const nevoa = uniq.has('nevoa') && isBow;
      spawnProjectile(G, {
        owner: 'player', kind: b.proj, x: tip.x, y: tip.y, z: tip.z, dx, dz, speed: b.speed, range: b.range, radius: b.radius,
        mult: b.mult, pierce: nevoa ? 2 : 0, homing: a.target ? (b.homing || 2.4) : 0, target: a.target, area: P.area,
        color: isBow ? (nevoa ? 0x6fd0ff : 0xd8f07a) : 0xb88cff, trail: isBow ? (nevoa ? 0x8fd8ff : null) : 0xc79bff,
        slow: nevoa ? 0.6 : 0, slowDur: 1.5,
      });
      G.audio.play(isBow ? 'arrow' : 'magic');
      // brilho no disparo (deixa claro de onde saiu o ataque)
      G.fx.burst(tip, { count: isBow ? 5 : 7, color: isBow ? [0xf2f2e6, 0xd8f07a] : [0xc79bff, 0xffffff], speed: isBow ? 2 : 3, size: isBow ? 0.16 : 0.14, life: 0.25, gravity: 0, up: 0.3 });
      if (!isBow) G.fx.flash(tip.x, tip.y, tip.z, 0xb88cff, 1.3, 0.12);
    });
  }
}

export function skillState(P, i) {
  const s = P.cls.skills[i];
  const lvl = SKILL_UNLOCKS[i];
  if (P.data.level < lvl) return { ok: false, reason: `Desbloqueia no nível ${lvl}`, locked: true };
  if (P.cds['s' + i] > 0) return { ok: false, reason: 'Em recarga' };
  if (P.res < (s.cost || 0)) return { ok: false, reason: `${P.cls.resource.name} insuficiente` };
  // barreira (Muralha de Ferro): só renova quando a vida dela cair para a metade ou menos
  if (s.type === 'guard' && P.barrier > 0) return { ok: false, reason: 'A barreira ainda está ativa' };
  return { ok: true };
}

export function doSkill(G, P, i, aim) {
  const s = P.cls.skills[i];
  const chk = skillState(P, i);
  if (!chk.ok) { G.ui.toastSmall(chk.reason); G.audio.play('error'); return false; }
  if (!hasArrows(G, P)) return false;
  P.res -= s.cost || 0;
  P.cds['s' + i] = s.cd * (1 - P.stats.cdr);
  P.faceTo(aim.yaw);
  P.lastCombat = G.time.t;
  G.bus.emit('skillUsed', { i, id: s.id });
  const fn = SKILL_FN[s.type];
  fn(G, P, s, aim);
  return true;
}

const SKILL_FN = {
  whirl(G, P, s) {
    P.startAction('whirl', s.ticks * s.tickGap + 0.2, { slow: 0.7 });
    for (let k = 0; k < s.ticks; k++) {
      G.later(0.08 + k * s.tickGap, () => {
        if (!P.alive) return;
        aoe(G, P.pos.x, P.pos.z, s.radius, s.mult, { skill: true, knock: 1.2, color: 0xffc061 });
        G.fx.ring(P.pos.x, P.pos.y, P.pos.z, s.radius, s.color, 0.3);
        // dois arcos de lâmina girando + vento rente ao chão
        G.fx.slash(P.pos.x, P.pos.y - 0.2, P.pos.z, P.yaw + k * 2.2, s.radius, 120, s.color, 0.22, 0, true);
        G.fx.shock(P.pos.x, P.pos.y, P.pos.z, s.radius * 1.1, 0xffe2a0, 0.3);
        G.fx.dust(P.pos.x, P.pos.y, P.pos.z, s.radius * 0.9, 0xc8b89a, 10);
        G.fx.burst({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z }, { count: 12, color: [s.color, 0xffffff], speed: 7, size: 0.3, life: 0.35, gravity: 2, up: 0 });
        if (k === s.ticks - 1) G.fx.cracks(P.pos.x, P.pos.y, P.pos.z, [0, 1.25, 2.5, 3.75, 5], s.radius * 0.8, s.color, 1.8, 0.1);
        G.audio.play('swing', { gap: 0 });
      });
    }
  },
  charge(G, P, s, aim) {
    const hitSet = new Set();
    let lx = P.pos.x, lz = P.pos.z;
    P.res = Math.min(P.stats.maxRes, P.res + (s.gain || 0));
    P.startMove({ dirX: aim.dirX, dirZ: aim.dirZ, speed: s.dist / s.dur, dur: s.dur, anim: 'charge', invuln: 0.15,
      onStep: () => {
        lineHits(G, lx, lz, P.pos.x, P.pos.z, s.width, s.mult, { skill: true, stun: s.stun, exclude: hitSet, knock: 2.5, heavy: true });
        G.fx.emit(P.pos.x, P.pos.y + 0.3, P.pos.z, 0, 1, 0, 0xffe2a0, 0.5, 0.4, 0, 2);
        G.fx.emit(P.pos.x, P.pos.y + 0.2, P.pos.z, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, 0xb8a68a, 1.0, 0.7, -0.3, 2.5);
        lx = P.pos.x; lz = P.pos.z;
      },
      onEnd: () => {
        G.fx.ring(P.pos.x, P.pos.y, P.pos.z, 2.5, s.color, 0.3); G.cam.shake(0.25, 0.18);
        G.fx.shock(P.pos.x, P.pos.y, P.pos.z, 3.5, 0xffe2a0, 0.35);
        const fx = P.pos.x + aim.dirX * 1.2, fz = P.pos.z + aim.dirZ * 1.2;
        G.fx.cracks(fx, P.pos.y, fz, [P.yaw, P.yaw + 1, P.yaw - 1, P.yaw + 2.4, P.yaw - 2.4], 2.2, 0xffc061, 2, 0.11);
        G.fx.debris(fx, P.pos.y, fz, 6, 0x7a6a55, 5); G.fx.dust(fx, P.pos.y, fz, 2, 0xb8a68a, 12);
      },
    });
    G.audio.play('dash');
  },
  guard(G, P, s) {
    // barreira = 10% da vida máxima; absorve o dano até quebrar ou até acabar o tempo (10 s)
    P.barrierMax = Math.max(1, Math.round(P.stats.maxHp * s.shield));
    P.barrier = P.barrierMax;
    P.barrierT = s.shieldDur || 10;
    P.barrierFlash = 1;
    P.barrierShow = 3; // a bolha aparece só 3 s
    P.startAction('guard', 0.6, { slow: 0.4 });
    G.fx.shock(P.pos.x, P.pos.y, P.pos.z, s.taunt, s.color, 0.5);
    G.fx.beam(P.pos.x, P.pos.y, P.pos.z, s.color, 6, 0.6, 1.4);
    G.ui.damageNumber(P.pos.x, P.pos.y + 2.6, P.pos.z, `Barreira +${P.barrier}`, 'xp');
    for (const e of G.enemies) {
      if (e.alive() && e.area === P.area && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < s.taunt) e.taunt(P, s.tauntDur || 4);
    }
    G.audio.play('shield');
    G.ui.refreshHud();
  },
  quake(G, P, s) {
    P.startAction('slam', 0.72, { slow: 0.15 });
    G.later(0.34, () => {
      if (!P.alive) return;
      meleeArc(G, P.pos.x, P.pos.z, P.yaw, s.range, s.arc, s.mult, { skill: true, knock: s.knock, slow: s.slow, slowDur: s.slowDur, heavy: true, shake: 0.4 });
      // o chão racha em leque à frente e as pedras saltam ao longo da fenda
      const yaw0 = P.yaw, ox = P.pos.x + Math.sin(yaw0) * 0.9, oz = P.pos.z + Math.cos(yaw0) * 0.9;
      const half = (s.arc * Math.PI) / 360;
      G.fx.cracks(ox, P.pos.y, oz, [yaw0, yaw0 - half * 0.6, yaw0 + half * 0.6, yaw0 - half, yaw0 + half], s.range, 0xffa040, 3.2, 0.17);
      G.fx.shock(ox, P.pos.y, oz, s.range * 0.7, 0xffd28a, 0.4);
      for (let k = 1; k <= 6; k++) {
        G.later(k * 0.045, () => {
          const d = (k / 6) * s.range;
          for (const off of [-half * 0.5, 0, half * 0.5]) {
            const x = P.pos.x + Math.sin(yaw0 + off) * d, z = P.pos.z + Math.cos(yaw0 + off) * d, y = G.world.groundHeight(x, z, P.area);
            if (off === 0) G.fx.ring(x, y, z, 1 + k * 0.4, s.color, 0.35);
            G.fx.burst({ x, y: y + 0.2, z }, { count: 6, color: [0x9a7d55, 0xffb04a], speed: 5, size: 0.4, life: 0.5, gravity: 14, up: 5 });
            if (k % 2 === 0) G.fx.debris(x, y, z, 3, 0x6a5a48, 6);
          }
          if (k % 2 === 1) { const x = P.pos.x + Math.sin(yaw0) * d, z = P.pos.z + Math.cos(yaw0) * d; G.fx.dust(x, G.world.groundHeight(x, z, P.area), z, 1.6, 0xb8a68a, 8); }
        });
      }
      G.audio.play('quake');
    });
  },
  fan(G, P, s, aim) {
    P.startAction('shoot', 0.4, { slow: 0.6 });
    G.later(0.2, () => {
      if (!P.alive) return;
      const tip = P.muzzle();
      const spread = (s.spread * Math.PI) / 180;
      const c = aimNow(G, P, aim, tip, s.speed, s.range).yaw;
      for (let k = 0; k < s.count; k++) {
        const a = c - spread / 2 + (spread * k) / (s.count - 1);
        spawnProjectile(G, { owner: 'player', kind: 'flecha', x: tip.x, y: tip.y, z: tip.z, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, range: s.range, radius: 0.55, mult: s.mult, skill: true, color: s.color, area: P.area });
      }
      G.audio.play('arrow', { gap: 0 });
    });
  },
  // Rajada Tripla: 3 flechas uma atrás da outra, bem rápido (puxa e solta a corda a cada uma)
  burst(G, P, s, aim) {
    for (let k = 0; k < s.count; k++) {
      G.later(k * s.gap, () => {
        if (!P.alive) return;
        P.startAction('shoot', s.gap + 0.02, { slow: 0.6 });
        G.later(s.gap * 0.5, () => {
          if (!P.alive) return;
          const tip = P.muzzle(), a = aimNow(G, P, aim, tip, s.speed, s.range);
          spawnProjectile(G, { owner: 'player', kind: 'flecha', x: tip.x, y: tip.y, z: tip.z, dx: a.dx, dz: a.dz, dy: a.dy, target: a.target, speed: s.speed, range: s.range, radius: 0.55, mult: s.mult, skill: true, color: s.color, trail: k === s.count - 1 ? s.color : null, area: P.area });
          G.audio.play('arrow', { gap: 0 });
        });
      });
    }
  },
  pierce(G, P, s, aim) {
    P.startAction('shoot', 0.6, { slow: 0.3 });
    G.fx.burst(P.muzzle(), { count: 10, color: s.color, speed: 1.5, size: 0.3, life: 0.4, gravity: 0, up: 0.5 });
    G.later(0.38, () => {
      if (!P.alive) return;
      const tip = P.muzzle();
      const a = aimNow(G, P, aim, tip, s.speed, s.range);
      spawnProjectile(G, { owner: 'player', kind: 'flecha', x: tip.x, y: tip.y, z: tip.z, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, radius: s.radius, mult: s.mult, skill: true, pierce: 99, color: s.color, trail: s.color, trailSize: 0.5, area: P.area, knock: 1.5 });
      G.audio.play('arrow', { gap: 0 }); G.audio.play('magic', { gap: 0, vol: 0.6 });
      G.cam.shake(0.1, 0.1);
    });
  },
  // Agilidade do Vento: 5 s mais rápido (andar e atirar), com um redemoinho verde nos pés
  haste(G, P, s) {
    P.buffs.haste = s.dur; P.buffs.hasteK = 1 + (s.speed || 0.1); P.buffs.hasteA = s.aspd || 0.1;
    P.startAction('castUp', 0.3, { slow: 0.9 });
    G.fx.ring(P.pos.x, P.pos.y, P.pos.z, 2.2, s.color, 0.5);
    G.fx.burst({ x: P.pos.x, y: P.pos.y + 0.4, z: P.pos.z }, { count: 26, color: [s.color, 0xffffff, 0x6fe8b0], speed: 5, size: 0.24, life: 0.55, gravity: -2, up: 2.5 });
    for (let k = 0; k < 3; k++) G.later(k * 0.08, () => G.fx.ring(P.pos.x, P.pos.y + 0.05 + k * 0.5, P.pos.z, 1 + k * 0.35, 0xd8ffe8, 0.35));
    G.audio.play('dash'); G.audio.play('magic', { gap: 0, vol: 0.5 });
  },
  leapBack(G, P, s, aim) {
    const ox = P.pos.x, oz = P.pos.z;
    G.addZone({ x: ox, z: oz, r: s.slowRadius, dur: s.slowDur, area: P.area, color: s.color, tick: 0.25,
      onTick: (z) => { for (const e of G.enemies) if (e.alive() && e.area === P.area && Math.hypot(e.pos.x - z.x, e.pos.z - z.z) < z.r) e.applySlow(s.slow, 0.5); } });
    G.fx.ring(ox, P.pos.y, oz, s.slowRadius, s.color, s.slowDur);
    G.fx.burst({ x: ox, y: P.pos.y + 0.2, z: oz }, { count: 14, color: s.color, speed: 4, size: 0.25, life: 0.5, gravity: 10, up: 2 });
    P.startMove({ dirX: -aim.dirX, dirZ: -aim.dirZ, speed: s.dist / s.dur, dur: s.dur, anim: 'leap', invuln: s.dur, keepFacing: true });
    G.audio.play('dash');
  },
  rain(G, P, s, aim) {
    const gp = groundIn(P, aim, s.range), gx = gp.x, gz = gp.z, gy = G.world.groundHeight(gx, gz);
    P.startAction('castUp', 0.45, { slow: 0.5 });
    G.fx.telegraphCircle(gx, gy, gz, s.radius, s.ticks * s.tickGap, 0xd8f07a);
    for (let k = 0; k < s.ticks; k++) {
      G.later(0.25 + k * s.tickGap, () => {
        aoe(G, gx, gz, s.radius, s.mult, { skill: true, los: false, color: s.color });
        for (let j = 0; j < 5; j++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.radius;
          G.fx.fallingArrow(gx + Math.cos(a) * r, gz + Math.sin(a) * r, s.color);
        }
        for (let j = 0; j < 6; j++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * s.radius;
          G.fx.emit(gx + Math.cos(a) * r, gy + 9, gz + Math.sin(a) * r, 0, -34, 0, 0xe6ff9a, 0.22, 0.28, 0, 0);
        }
        G.audio.play('arrow', { gap: 0, vol: 0.6 });
      });
    }
  },
  fireball(G, P, s, aim) {
    P.startAction('cast', 0.42, { slow: 0.55 });
    G.fx.castGlow(() => P.muzzle(), 0xff8a2a, 0.16, 0.85);
    G.later(0.16, () => {
      if (!P.alive) return;
      const tip = P.muzzle();
      G.fx.flash(tip.x, tip.y, tip.z, 0xffa040, 1.8, 0.14);
      const burst = (x, z) => {
        const y = G.world.groundHeight(x, z);
        G.fx.explosion(x, y, z, s.radius, 0xff7a2a);
        G.fx.shock(x, y, z, s.radius * 1.3, 0xffc070, 0.3);
        G.fx.scorch(x, y, z, s.radius * 0.55, 0xff6a20, 3.5);
        aoe(G, x, z, s.radius, s.mult, { skill: true, knock: 1.5, color: 0xffa040, shake: 0.25 });
        G.audio.play('explosion');
        if (P.stats.effects.has('fenda_fogo')) {
          G.addZone({ x, z, r: 2.6, dur: 3, area: P.area, tick: 0.5, color: 0xff4fd8,
            onTick: (zn) => aoe(G, zn.x, zn.z, zn.r, 0.3, { skill: true, los: false, color: 0xff4fd8 }) });
          G.fx.ring(x, y, z, 2.6, 0xff4fd8, 3);
        }
      };
      const a = aimNow(G, P, aim, tip, s.speed, s.range);
      spawnProjectile(G, { owner: 'player', kind: 'fogo', x: tip.x, y: tip.y, z: tip.z, dx: a.dx, dz: a.dz, speed: s.speed, range: s.range, radius: 0.8, mult: s.mult, skill: true, color: 0xff7a2a, trail: 0xffa040, trailSize: 0.55, area: P.area,
        onHit: (e, p) => { p.pierce = 0; burst(p.x, p.z); }, onEnd: (p) => burst(p.x, p.z), target: a.target, homing: a.target ? 2.2 : 0 });
      G.audio.play('fire');
    });
  },
  nova(G, P, s) {
    P.startAction('castUp', 0.5, { slow: 0.2 });
    G.later(0.18, () => {
      if (!P.alive) return;
      G.fx.ring(P.pos.x, P.pos.y, P.pos.z, s.radius, s.color, 0.5);
      G.fx.shock(P.pos.x, P.pos.y, P.pos.z, s.radius, 0xdff6ff, 0.45);
      G.fx.cracks(P.pos.x, P.pos.y, P.pos.z, [0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4], s.radius * 0.9, 0x9fe8ff, 2.6, 0.11);
      G.fx.burst({ x: P.pos.x, y: P.pos.y + 0.5, z: P.pos.z }, { count: 40, color: [s.color, 0xffffff], speed: s.radius * 2.2, size: 0.35, life: 0.5, gravity: 0, up: 0.5, spread: 0.3 });
      for (const e of G.enemies) {
        if (!e.alive() || e.area !== P.area) continue;
        if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > s.radius + e.radius) continue;
        hitEnemy(G, e, s.mult, { skill: true, freeze: s.freeze, color: s.color });
        G.fx.shards(e.pos.x, e.pos.y, e.pos.z, e.radius + 0.4, s.color, e.def.boss ? 1 : s.freeze);
      }
      G.audio.play('ice');
    });
  },
  blink(G, P, s, aim) {
    const ox = P.pos.x, oz = P.pos.z, oy = P.pos.y;
    let bx = ox, bz = oz;
    for (let d = 0.5; d <= s.dist; d += 0.5) {
      const x = ox + aim.dirX * d, z = oz + aim.dirZ * d;
      if (!G.world.walkable(x, z, P.area) || G.world.col.pointBlocked(x, z, P.radius)) break;
      bx = x; bz = z;
    }
    G.fx.burst({ x: ox, y: oy + 1, z: oz }, { count: 22, color: [s.color, 0xffffff], speed: 4, size: 0.35, life: 0.5, gravity: 0, up: 1 });
    P.teleport(bx, bz);
    P.invuln = Math.max(P.invuln, 0.3);
    P.startAction('phase', 0.25, {});
    G.fx.burst({ x: bx, y: P.pos.y + 1, z: bz }, { count: 22, color: [s.color, 0xffffff], speed: 4, size: 0.35, life: 0.5, gravity: 0, up: 1 });
    G.audio.play('blink');
  },
  meteor(G, P, s, aim) {
    // bola de magia que DESPENCA do céu, rápida, e explode em cima do inimigo (segue o alvo até cair)
    const gp = groundIn(P, aim, s.range); let gx = gp.x, gz = gp.z, gy = G.world.groundHeight(gx, gz);
    const tg = aim.target && aim.target.alive?.() ? aim.target : null;
    if (tg && Math.hypot(tg.pos.x - P.pos.x, tg.pos.z - P.pos.z) <= s.range + 2) { gx = tg.pos.x; gz = tg.pos.z; gy = G.world.groundHeight(gx, gz); }
    P.startAction('castUp', 0.55, { slow: 0.4 });
    const tele = G.fx.telegraphCircle(gx, gy, gz, s.radius, s.delay, 0xff4fd8);
    // círculo mágico no chão e brilho na mão do mago
    G.fx.ring(P.pos.x, P.pos.y + 0.05, P.pos.z, 1.6, 0xff4fd8, 0.6);
    const tip = P.muzzle(); G.fx.burst(tip, { count: 18, color: [0xff4fd8, 0xffffff], speed: 3, size: 0.3, life: 0.5, gravity: -4, up: 4 });
    const ball = G.fx.skyOrb(0xff4fd8); ball.visible = false;
    const fallT = 0.4, wait = Math.max(0.1, s.delay - fallT - 0.05);
    const st = G.fx.streak(0xffb0ec, 18);
    let t = 0, sx = 0, sy = 0, sz = 0, dir = new THREE.Vector3(0, -1, 0);
    G.addZone({ x: gx, z: gz, r: 0, dur: s.delay + 0.1, area: P.area, tick: 0.016, onTick: () => {
      t += 0.016;
      if (!ball.parent) return;
      if (tg && tg.alive() && t < s.delay - 0.12) { gx = tg.pos.x; gz = tg.pos.z; gy = G.world.groundHeight(gx, gz); if (tele?.mesh) tele.mesh.position.set(gx, gy + 0.06, gz); }
      if (t < wait) return;
      if (!ball.visible) {
        ball.visible = true;
        const bx = P.pos.x - gx, bz = P.pos.z - gz, bl = Math.hypot(bx, bz) || 1;
        sx = gx + bx / bl * 3.5; sy = gy + 15; sz = gz + bz / bl * 3.5; // vem do alto, um pouco de trás do mago
      }
      const k = Math.min(1, (t - wait) / fallT), e = k * k; // despenca acelerando
      ball.position.set(sx + (gx - sx) * e, sy + (gy + 0.7 - sy) * e, sz + (gz - sz) * e);
      dir.set(gx - sx, gy - sy, gz - sz).normalize();
      ball.userData.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      ball.userData.tail2.quaternion.copy(ball.userData.tail.quaternion);
      ball.userData.ring.rotation.x += 0.35; ball.userData.ring.rotation.y += 0.22;
      ball.userData.fire.scale.setScalar(1.2 + Math.random() * 0.25);
      ball.scale.setScalar(0.85 + k * 0.3);
      const q = ball.position; st.push(q.x, q.y, q.z);
      for (let j = 0; j < 4; j++) G.fx.emit(q.x + (Math.random() - 0.5) * 1.1, q.y + (Math.random() - 0.5) * 1.1, q.z + (Math.random() - 0.5) * 1.1, -dir.x * 4 + (Math.random() - 0.5) * 2, -dir.y * 4, -dir.z * 4 + (Math.random() - 0.5) * 2, j % 2 ? 0xffa040 : 0xff4fd8, 0.8, 0.45, 0, 1.5);
    } });
    G.later(s.delay, () => {
      G.fx.remove(ball); G.fx.remove(st.line);
      G.fx.explosion(gx, gy, gz, s.radius, 0xff4fd8, 0.7);
      G.fx.explosion(gx, gy, gz, s.radius * 0.7, 0xffa040, 0.5);
      G.fx.shock(gx, gy, gz, s.radius * 1.8, 0xffe2c0, 0.45);
      G.fx.cracks(gx, gy, gz, [0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4].map((a) => a + Math.random() * 0.4), s.radius * 1.15, 0xff7a2a, 6, 0.18);
      G.fx.scorch(gx, gy, gz, s.radius * 0.75, 0xff6a20, 7);
      G.fx.debris(gx, gy, gz, 12, 0x4a3a34, 9);
      G.fx.dust(gx, gy, gz, s.radius * 0.8, 0x6a5a50, 22);
      G.fx.beam(gx, gy, gz, 0xff8a3a, 10, 0.5, 2.2);
      G.fx.burst({ x: gx, y: gy + 0.6, z: gz }, { count: 46, color: [0xff4fd8, 0xffffff, 0xffa040], speed: 11, size: 0.45, life: 0.7, gravity: 8, up: 7 });
      aoe(G, gx, gz, s.radius, s.mult, { skill: true, los: false, knock: 3, heavy: true, shake: 0.55, color: 0xff4fd8 });
      G.audio.play('explosion'); G.audio.play('quake', { gap: 0, vol: 0.6 });
    });
    G.audio.play('portal');
  },
};

export function doDodge(G, P) {
  const d = P.cls.dodge;
  if (P.cds.dodge > 0) return false;
  const mv = G.moveDir();
  let dx = mv.x, dz = mv.z;
  if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
  const l = Math.hypot(dx, dz) || 1;
  P.cds.dodge = d.cd;
  P.startMove({ dirX: dx / l, dirZ: dz / l, speed: d.dist / d.dur, dur: d.dur, anim: d.anim, invuln: d.iframes });
  if (d.anim === 'phase') G.fx.burst({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z }, { count: 14, color: [0xc79bff, 0x5ef0ff], speed: 3, size: 0.3, life: 0.4, gravity: 0 });
  G.audio.play('dash');
  return true;
}
