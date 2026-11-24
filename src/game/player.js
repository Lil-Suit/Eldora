import { bagSize } from '../core/inventory.js';
import * as THREE from 'three';
import { CLASSES } from '../config/classes.js';
import { BALANCE } from '../config/balance.js';
import { WORLD, inGuardiao } from '../config/world.js';
import { computeStats } from '../core/stats.js';
import { buildHorse } from '../engine/models.js';
import { makeHero } from '../engine/hero3d.js';
import { animate } from './anim.js';
import { dampAngle, damp } from '../engine/noise.js';
import { aoe, bodyHeight } from './combat.js';

export class Player {
  constructor(G) {
    this.G = G;
    this.data = G.state.player;
    this.cls = CLASSES[this.data.classId];
    this.rig = makeHero(this.cls, this.look());
    G.scene.add(this.rig.root);
    const p = this.data.pos || {};
    this.area = ['cripta', 'ermos', 'confins', 'guardiao'].includes(p.area) ? p.area : 'world';
    // save de antes do mapa 2: quem estava na Planície do Guardião (era parte do mapa 1) continua lá, agora no mapa 2
    if (this.area === 'world' && p.x != null && inGuardiao(p.x, p.z)) this.area = 'guardiao';
    this.pos = new THREE.Vector3(p.x ?? WORLD.spawn.x, 0, p.z ?? WORLD.spawn.z);
    this.pos.y = G.world.groundHeight(this.pos.x, this.pos.z, this.area);
    this.yaw = Math.PI;
    this.vel = { x: 0, z: 0 };
    this.radius = 0.5;
    this.cds = { basic: 0, s0: 0, s1: 0, s2: 0, s3: 0, dodge: 0, potion: 0 };
    this.action = null;
    this.moveAction = null;
    this.buffs = { guard: 0 };
    this.barrier = 0; this.barrierMax = 0; this.barrierFlash = 0; this.barrierShow = 0; this.barrierT = 0; // Muralha de Ferro: vida extra da barreira
    this.slowK = 1; this.slowT = 0;
    this.invuln = 0; this.hurtT = 0; this.alive = true; this.deadT = 0;
    this.combo = 0; this.basicCount = 0;
    this.lastCombat = -99; this.lastHurt = -99;
    this.anim = { move: 0, t: 0, action: null, p: 0, variant: 0, hurt: 0, dead: 0, emote: null };
    this.emote = null;
    this.recall = null;
    this.flashT = 0;
    this.faceLock = 0;
    this.recompute(true);
    this.addSilhouette();
    if (this.data.hp == null || this.data.hp <= 0) this.hp = this.stats.maxHp; else this.hp = Math.min(this.stats.maxHp, this.data.hp);
    this.res = this.data.res ?? this.cls.resource.start;
    this.smana = this.data.smana ?? 0; // mana do Conjunto da Prece (Guerreiro e Arqueiro; o Mago usa a própria mana)
    this.syncRig(0);
  }

  recompute(skipHeal = false) {
    // mochila melhorada na forja ou nível novo: a bolsa acompanha na hora (nunca apaga item; teto pelo nível)
    const inv = this.G.inv; if (inv && this.G.state?.player) { const n = bagSize(this.G.state.player); if (n !== inv.cap) inv.setCap(n); }
    const prevMax = this.stats?.maxHp;
    this.stats = computeStats(this.data);
    this.rig.setEquipment(this.data.equipment);
    this.G.cosmetics?.apply();
    if (!skipHeal && prevMax && this.stats.maxHp > prevMax) this.hp += this.stats.maxHp - prevMax;
    this.hp = Math.min(this.hp ?? this.stats.maxHp, this.stats.maxHp);
    this.res = Math.min(this.res ?? 0, this.stats.maxRes);
    this.smana = this.stats.smana ? Math.min(this.smana || 0, this.stats.smana.max) : 0;
  }

  // aparência: gênero (escolhido ao criar) + skin equipada
  look() { return { g: this.data.look?.g === 'F' ? 'F' : 'M', skin: this.G.state.world?.cosmetics?.skin || 'campones' }; }

  // troca o modelo do herói (ex.: os modelos 3D terminaram de carregar, ou mudou o gênero)
  rebuildRig() {
    const G = this.G, old = this.rig;
    const rig = makeHero(this.cls, this.look());
    if (rig.kind === old.kind && old.kind !== 'skinhero') return;
    G.scene.remove(old.root);
    this.rig = rig; G.scene.add(rig.root);
    rig.root.position.copy(this.pos); rig.root.rotation.y = this.yaw;
    rig.setEquipment(this.data.equipment);
    this.G.cosmetics?.apply();
    this.addSilhouette();
  }

  // Silhueta visível através de árvores e paredes: desenhada só onde o herói está oculto.
  addSilhouette() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x6fd8f0, depthWrite: false, depthFunc: THREE.GreaterDepth });
    if (this.rig.kind === 'skinhero') return this.rig.addSilhouette(mat);
    const list = [];
    // pernas ficam de fora: em encostas os pés entram um pouco no terreno e a silhueta azul apareceria
    const legs = new Set();
    for (const l of [this.rig.legL, this.rig.legR]) l?.traverse((m) => legs.add(m));
    // todas as peças do herói desenham depois das silhuetas (senão a silhueta aparece através das próprias pernas)
    this.rig.root.traverse((m) => { if (m.isMesh) { m.renderOrder = 2; if (m.castShadow && !legs.has(m)) list.push(m); } });
    for (const m of list) {
      m.renderOrder = 2;
      const s = new THREE.Mesh(m.geometry, mat);
      s.renderOrder = 1;
      s.castShadow = false;
      s.position.copy(m.position); s.rotation.copy(m.rotation); s.scale.copy(m.scale);
      m.parent.add(s);
    }
  }

  get inCombat() { return this.G.time.t - this.lastCombat < BALANCE.outOfCombatSec; }

  faceTo(yaw) { this.yaw = yaw; this.faceLock = 0.45; }

  startAction(name, dur, o = {}) {
    this.action = { name, t: 0, dur, variant: o.variant || 0, slow: o.slow ?? 1 };
    this.G.net?.sendAction?.(name, dur, o.variant || 0);
    this.emote = null;
    this.cancelRecall();
  }

  startMove(m) {
    this.moveAction = { t: 0, ...m };
    if (m.invuln) this.invuln = Math.max(this.invuln, m.invuln);
    if (!m.keepAction) { this.action = { name: m.anim, t: 0, dur: m.dur, slow: 0 }; this.G.net?.sendAction?.(m.anim, m.dur, 0); }
    this.emote = null;
    this.cancelRecall();
  }

  // ---------- Cavalo do Criador ----------
  hasHorse() { return this.mountKind() !== null; }
  // cavalo (criador) ou lobo (braço direito); quem tiver o item na bolsa pode montar
  mountKind() {
    const inv = this.G.inv;
    if (inv.count('lobo_criacao') > 0) return 'lobo';
    if (inv.count('cavalo_criador') > 0 || this.G.economy?.owner) return 'cavalo';
    return null;
  }
  setMount(on) {
    const G = this.G;
    on = !!on && this.alive && this.hasHorse() && this.area !== 'cripta' && !this.swimming;
    if (on === !!this.mounted) return false;
    this.mounted = on;
    if (on) {
      const mk = this.mountKind();
      if (this.horse && this.horseKind !== mk) { G.scene.remove(this.horse.root); this.horse = null; }
      if (!this.horse) { this.horse = buildHorse(mk); this.horseKind = mk; this.horseAnim = { move: 0, t: 0, action: null, p: 0 }; }
      G.scene.add(this.horse.root);
      this.action = null; this.emote = null;
      G.fx.dust?.(this.pos.x, this.pos.y, this.pos.z, 1.2);
    } else if (this.horse) {
      G.scene.remove(this.horse.root);
    }
    G.ui.refreshMount?.();
    return true;
  }
  toggleMount() {
    if (!this.mounted && this.G.pvp?.blocked()) { this.G.ui.toastSmall(`Em combate (block): sem montaria por ${this.G.pvp.blockLeft()} s.`, 3); return; }
    if (!this.hasHorse()) return this.G.ui.toastSmall('Você não tem uma montaria.');
    if (this.area === 'cripta') return this.G.ui.toastSmall('A montaria não cabe dentro da Cripta.');
    this.setMount(!this.mounted);
  }

  teleport(x, z, area = this.area) {
    if (this.mounted && area === 'cripta') this.setMount(false);
    this.pos.x = x; this.pos.z = z; this.area = area;
    this.pos.y = this.G.world.groundHeight(x, z, area);
    this.vel.x = this.vel.z = 0;
    this.syncRig(0);
  }

  muzzle() {
    const tip = new THREE.Vector3();
    if (this.rig.weapon) { this.rig.root.updateMatrixWorld(true); this.rig.weapon.localToWorld(tip.copy(this.rig.weapon.userData.tip)); }
    else tip.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
    tip.y = Math.max(tip.y, this.pos.y + 0.9);
    return tip;
  }

  heal(n, show = true) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    const d = Math.round(this.hp - before);
    if (show && d > 0) this.G.ui.damageNumber(this.pos.x, this.pos.y + 2.2, this.pos.z, '+' + d, 'heal');
    return d;
  }

  applySlow(k, dur, label) {
    const was = this.slowK;
    this.slowK = Math.min(this.slowK, k); this.slowT = Math.max(this.slowT, dur);
    if (label && was > k) this.G.ui.damageNumber(this.pos.x, this.pos.y + 2.6, this.pos.z, label, 'miss');
  }
  applyDot(dps, dur, color = 0x7aff5a) {
    if (!this.dot) this.G.ui.damageNumber(this.pos.x, this.pos.y + 2.6, this.pos.z, color === 0x7aff5a ? 'Envenenado' : 'Queimando', 'miss');
    this.dot = { dps, t: dur, acc: 0, color, name: (() => { const c = new THREE.Color(color ?? 0xff6a2a); return c.g > c.r ? 'Veneno' : 'Queimadura'; })() };
  }

  takeDamage(dmg, src = {}) {
    if (!this.alive) return 0;
    // barreira da Muralha de Ferro: a vida extra apanha primeiro
    if (this.barrier > 0 && dmg > 0) {
      const ab = Math.min(this.barrier, dmg);
      this.barrier -= ab; dmg -= ab; this.barrierFlash = 1;
      const G = this.G;
      G.ui.damageNumber(this.pos.x, this.pos.y + 2.2, this.pos.z, `🛡${Math.round(ab)}`, 'miss');
      if (this.barrier <= 0.5) {
        this.barrier = 0;
        G.fx.burst({ x: this.pos.x, y: this.pos.y + 1.1, z: this.pos.z }, { count: 26, color: [0xffd36b, 0xfff2c0], speed: 5, size: 0.3, life: 0.6 });
        G.audio.play('error');
      }
      G.ui.refreshHud();
      this.lastCombat = G.time.t;
      if (dmg <= 0) return 0;
    }
    this.hp -= dmg;
    if (this.hurtT < 0.1) this.anim.hurtSide = Math.random() < 0.5 ? -1 : 1; // tranco para um lado ou para o outro
    this.hurtT = 0.28; this.flashT = 0.12;
    this.lastCombat = this.lastHurt = this.G.time.t;
    this.cancelRecall();
    if (this.cls.resource.id === 'furia') this.res = Math.min(this.stats.maxRes, this.res + this.cls.resource.onHurt);
    this.G.ui.damageNumber(this.pos.x, this.pos.y + 2.2, this.pos.z, dmg, 'hurt');
    this.G.ui.flashHurt(Math.min(1, dmg / (this.stats.maxHp * 0.25)));
    this.G.audio.play('hurt', { gap: 90 });
    if (dmg > this.stats.maxHp * 0.15) this.G.cam.shake(0.25, 0.2);
    if (this.hp <= 0) { this.hp = 0; this.die(src); }
    return dmg;
  }

  onDealtDamage(dmg, crit, enemy, o) {
    this.lastCombat = this.G.time.t;
    if (this.cls.resource.id === 'furia' && o.basic) this.res = Math.min(this.stats.maxRes, this.res + this.cls.resource.onHit);
    const fx = this.stats.effects;
    if (crit && fx.has('dreno')) this.heal(Math.max(1, Math.round(dmg * 0.08)));
    if (crit && fx.has('selo') && !o.proc) {
      aoe(this.G, enemy.pos.x, enemy.pos.z, 2.6, 0.6, { skill: true, proc: true, los: false, color: 0xff4778 });
      this.G.fx.ring(enemy.pos.x, enemy.pos.y, enemy.pos.z, 2.6, 0xff4778, 0.35);
    }
  }

  die() {
    this.alive = false;
    this.deadT = 0;
    this.action = null; this.moveAction = null;
    this.data.stats.deaths++;
    this.G.audio.play('death');
    this.G.onPlayerDeath();
  }

  respawn(x, z, area) {
    this.setMount(false);
    this.dot = null; this.slowK = 1; this.slowT = 0;
    this.alive = true;
    this.hp = this.stats.maxHp;
    this.res = this.cls.resource.id === 'furia' ? 0 : this.stats.maxRes;
    this.invuln = 2;
    this.barrier = 0; this.barrierMax = 0;
    this.anim.dead = 0;
    this.teleport(x, z, area);
    for (const k in this.cds) this.cds[k] = 0;
  }

  startRecall() {
    if (this.recall) return;
    this.recall = { t: 0, dur: 2 };
    this.G.ui.toastSmall('Concentrando… (mova-se para cancelar)');
  }
  cancelRecall() {
    if (this.recall) { this.recall = null; this.G.ui.toastSmall('Retorno cancelado'); }
  }

  update(dt) {
    const G = this.G;
    this.anim.t += dt;
    if (!this.alive) {
      this.deadT += dt;
      this.anim.dead = Math.min(1, this.deadT / 0.8);
      this.anim.move = 0; this.anim.action = null; this.anim.hurt = 0;
      this.syncRig(dt);
      return;
    }
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] = Math.max(0, this.cds[k] - dt);
    // puxado por corrente: desliza rápido até o ponto, sem atravessar paredes
    if (this.pullTo) {
      const pt = this.pullTo, dx = pt.x - this.pos.x, dz = pt.z - this.pos.z, l = Math.hypot(dx, dz);
      pt.t -= dt;
      if (l < 0.4 || pt.t <= 0) this.pullTo = null;
      else { const st = Math.min(l, 28 * dt); G.world.tryMove(this.pos, dx / l * st, dz / l * st, this.radius || 0.5, this.area); }
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.faceLock = Math.max(0, this.faceLock - dt);
    // mira de tiro: o herói olha para onde a câmera aponta (anda de lado/de costas mirando)
    this.aiming = G.aimMode?.() && !this.moveAction;
    if (this.aiming && this.faceLock <= 0) { const f = G.cam.forward(); this.yaw = dampAngle(this.yaw, Math.atan2(f.x, f.z), 16, dt); }
    if (this.buffs.haste > 0) { // Agilidade do Vento: rastro de vento nos pés
      this.buffs.haste -= dt;
      if (Math.random() < dt * 22) { const a = Math.random() * Math.PI * 2; G.fx.emit(this.pos.x + Math.cos(a) * 0.5, this.pos.y + 0.15 + Math.random() * 0.6, this.pos.z + Math.sin(a) * 0.5, -Math.sin(a) * 1.4, 0.9, Math.cos(a) * 1.4, Math.random() < 0.5 ? 0xa9ffd0 : 0xffffff, 0.2, 0.45, 0, 2); }
    }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowK = 1; }
    if (this.dot) { // veneno/queimadura: dano a cada 0,5 s
      const D = this.dot; D.t -= dt; D.acc += dt;
      if (Math.random() < dt * 8) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + 1 + Math.random(), this.pos.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, D.color, 0.25, 0.5, 0, 1);
      if (D.acc >= 0.5) { D.acc -= 0.5; if (this.alive) this.takeDamage(Math.max(1, Math.round(D.dps * 0.5)), { name: D.name || 'Veneno' }); }
      if (D.t <= 0 || !this.alive) this.dot = null;
    }
    // regeneração
    const safe = G.world.isSafe(this.pos.x, this.pos.z, this.area);
    let regen = this.stats.regen * (safe ? BALANCE.safeZoneRegenMult : 1) * (this.inCombat ? 0.35 : 1);
    if (!this.inCombat && this.stats.effects.has('aurora')) regen += this.stats.maxHp * 0.03;
    this.hp = Math.min(this.stats.maxHp, this.hp + regen * dt);
    const R = this.cls.resource;
    if (R.id === 'furia') { if (!this.inCombat) this.res = Math.max(0, this.res - R.decayOutOfCombat * dt); }
    else this.res = Math.min(this.stats.maxRes, this.res + R.regen * dt * (safe ? 2 : 1));
    const SM = this.stats.smana; if (SM) this.smana = Math.min(SM.max, (this.smana || 0) + SM.regen * dt * (safe ? 2 : 1));
    // Natal: o congelamento gasta mana a cada segundo enquanto está segurando inimigos (mais fundo e mais inimigos = mais mana)
    const NT = this.stats.natal;
    if (NT && this.natalHeld > 0) {
      this.natalT = (this.natalT || 0) + dt;
      if (this.natalT >= 1) {
        this.natalT -= 1;
        const cost = NT.mana + Math.min(8, this.natalHeld), mage = this.cls.resource.id === 'mana';
        if ((mage ? this.res : this.smana) >= cost) { if (mage) this.res -= cost; else this.smana -= cost; this.natalOff = false; }
        else { this.natalOff = true; }
        this.natalHeld = 0; // recontado nos próximos golpes
      }
    } else this.natalT = 0;
    // ação atual
    if (this.action) {
      this.action.t += dt;
      if (this.action.t >= this.action.dur) this.action = null;
    }
    // movimento
    let speedFrac = 0;
    if (this.moveAction) {
      const m = this.moveAction;
      m.t += dt;
      const ok = G.world.tryMove(this.pos, m.dirX * m.speed * dt, m.dirZ * m.speed * dt, this.radius, this.area);
      if (!m.keepFacing) this.yaw = Math.atan2(m.dirX, m.dirZ);
      m.onStep?.();
      speedFrac = 1;
      if (!ok || m.t >= m.dur) { this.moveAction = null; if (!m.keepAction) this.action = null; m.onEnd?.(); }
    } else {
      const mv = G.moveDir();
      const inWater = G.world.inWater(this.pos.x, this.pos.z);
      // água acima da metade do corpo: nada (mais devagar, sem montaria)
      const wl = G.world.waterAt(this.area), depth = wl == null ? 0 : wl - G.world.groundHeight(this.pos.x, this.pos.z, this.area);
      this.swimming = depth > 0.95;
      if (this.swimming && this.mounted) this.setMount(false);
      const slow = (this.action ? this.action.slow : 1) * this.slowK * (this.swimming ? 0.55 : inWater ? 0.62 : 1) * (this.recall ? 0 : 1);
      if (this.mounted && (this.action || !this.alive)) this.setMount(false); // atacar ou usar habilidade desmonta
      const I = G.input;
      this.running = !this.mounted && !this.action && mv.mag > 0.2 && (I.held('sprint') || I.down.has('ShiftRight') || I.touch.run);
      const sp = this.stats.moveSpeed * slow * mv.mag * (this.mounted ? BALANCE.mountSpeed : this.running ? BALANCE.runSpeed : 1) * (this.buffs.haste > 0 ? this.buffs.hasteK || 1.1 : 1);
      this.vel.x = damp(this.vel.x, mv.x * sp, this.mounted ? 6 : 14, dt);
      this.vel.z = damp(this.vel.z, mv.z * sp, this.mounted ? 6 : 14, dt);
      const moved = Math.hypot(this.vel.x, this.vel.z);
      if (moved > 0.05) {
        // em alta velocidade anda em passinhos de meio metro (não atravessa parede nem pula buraco)
        const dist = moved * dt, n = Math.min(60, Math.max(1, Math.ceil(dist / 0.5)));
        const sx = (this.vel.x * dt) / n, sz = (this.vel.z * dt) / n, want = Math.hypot(sx, sz);
        for (let k = 0; k < n; k++) {
          const px = this.pos.x, pz = this.pos.z;
          const ok = G.world.tryMove(this.pos, sx, sz, this.radius, this.area, true);
          // bateu em algo (parede empurrou de volta ou bloqueou): para neste quadro, senão "escorrega" para dentro da parede
          if (!ok || (n > 1 && Math.hypot(this.pos.x - px, this.pos.z - pz) < want * 0.7)) { if (this.mounted) { this.vel.x *= 0.4; this.vel.z *= 0.4; } break; }
        }
        if (this.mounted && Math.random() < dt * 30) G.fx.emit(this.pos.x - this.vel.x * 0.02, this.pos.y + 0.15, this.pos.z - this.vel.z * 0.02, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0xc8b48a, 0.5, 0.6, 0, 2);
        if (this.faceLock <= 0 && !this.aiming && mv.mag > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(mv.x, mv.z), 14, dt);
        if (mv.mag > 0.2) { this.emote = null; if (this.recall) this.cancelRecall(); }
        if (this.swimming && Math.random() < dt * 14) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 0.8, (wl ?? this.pos.y) + 0.05, this.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5, 0xe8f8ff, 0.3, 0.45, 7, 1);
        else if (inWater && Math.random() < dt * 8) G.fx.emit(this.pos.x, this.pos.y + 0.1, this.pos.z, (Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2, 0xcfefff, 0.25, 0.4, 9, 1);
        else if (moved > 4 && Math.random() < dt * 3) G.fx.emit(this.pos.x, this.pos.y + 0.1, this.pos.z, 0, 0.6, 0, 0xc8b48a, 0.4, 0.5, 0, 2);
      }
      speedFrac = Math.min(this.running ? 1.35 : 1, moved / (this.cls.moveSpeed * (this.mounted ? BALANCE.mountSpeed : 1)));
    }
    // nadando: o corpo boia (cabeça para fora d'água)
    { const gh = G.world.groundHeight(this.pos.x, this.pos.z, this.area), wl2 = G.world.waterAt(this.area);
      const sw = wl2 != null && wl2 - gh > 0.95; this.swimming = sw;
      this.pos.y = damp(this.pos.y, sw ? wl2 - 0.95 : gh, sw ? 6 : 20, dt);
      this.anim.swim = damp(this.anim.swim || 0, sw ? 1 : 0, sw ? 6 : 10, dt);
      if (!sw && this.anim.swim < 0.03) this.anim.swim = 0; } // fora d'água zera de vez (senão a pose de nado nunca solta)
    // canalização do pergaminho de retorno
    if (this.recall) {
      this.recall.t += dt;
      if (Math.random() < dt * 30) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 1.5, this.pos.y + 0.2, this.pos.z + (Math.random() - 0.5) * 1.5, 0, 3, 0, 0x5ef0ff, 0.3, 0.6, 0, 0);
      if (this.recall.t >= this.recall.dur) { this.recall = null; G.recallToVillage(); }
    }
    // aura lendária
    if (this.rig.legendary && G.settings.particles && Math.random() < dt * 22) { // brilho lendário ao longo da arma inteira
      const w = this.rig.weapon, L = w?.userData?.fxLine;
      let tip;
      if (L) { this.rig.root.updateMatrixWorld(true); tip = w.localToWorld(new THREE.Vector3().lerpVectors(L[0], L[1], Math.random())); } else tip = this.muzzle();
      G.fx.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 0.5, 0.8, (Math.random() - 0.5) * 0.5, this.rig.legendary.getHex(), 0.25, 0.5, -0.5, 1);
    }
    // animação
    this.anim.move = speedFrac;
    // direção em que está andando, relativa para onde o corpo olha (mirando/atacando de lado ou de costas)
    this.anim.mvRel = Math.hypot(this.vel.x, this.vel.z) > 0.5 ? Math.atan2(this.vel.x, this.vel.z) - this.yaw : 0;
    // arqueiro: ângulo para cima/baixo até o peito do alvo (a flecha sobe/desce até ele; o arco acompanha)
    if (this.rig?.weapon?.userData?.bow) {
      const T = G.target; let pit = 0;
      if (T && T.alive?.() && T.area === this.area) {
        const dx = T.pos.x - this.pos.x, dz = T.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 1 && d < 45) pit = Math.max(-0.7, Math.min(1.0, Math.atan2(T.pos.y + bodyHeight(T) * 0.62 - (this.pos.y + 1.45), d)));
      }
      this.rig.aimPitch = pit;
    }
    this.anim.action = this.action?.name || null;
    this.anim.p = this.action ? this.action.t / this.action.dur : 0;
    this.anim.variant = this.action?.variant || 0;
    this.anim.hurt = this.hurtT / 0.28;
    this.anim.emote = this.emote;
    this.anim.combat = (this.anim.combat || 0) + ((this.inCombat && this.alive ? 1 : 0) - (this.anim.combat || 0)) * Math.min(1, dt * 4);
    // parado à toa conta o tempo para os gestos (alongar, arma no ombro, testar a corda...)
    const idle = !this.action && !this.moveAction && speedFrac < 0.05 && this.anim.combat < 0.05 && !this.emote && !this.swimming && !this.mounted && !this.recall;
    this.anim.idleT = idle ? (this.anim.idleT || 0) + dt : 0;
    this.syncRig(dt);
    if (this.rig.flourishFx === 'palm' && this.rig.handL && Math.random() < dt * 26) { // faíscas na palma do mago
      const h = this.rig.handL.getWorldPosition(new THREE.Vector3());
      G.fx.emit(h.x + (Math.random() - 0.5) * 0.12, h.y + 0.08, h.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.3, 0.9, (Math.random() - 0.5) * 0.3, Math.random() < 0.5 ? 0x9fd8ff : 0xd6a8ff, 0.18, 0.55, -0.6, 1);
    }
  }

  // bolha dourada da barreira: mais forte quanto mais vida ela tem; pisca quando apanha
  drawBarrier(dt) {
    // a barreira dura no máximo 10 s (se não quebrar antes)
    if (this.barrier > 0) {
      this.barrierT = (this.barrierT ?? 10) - dt;
      if (this.barrierT <= 0) { this.barrier = 0; this.barrierT = 0; }
      const sec = Math.ceil(this.barrierT); if (sec !== this._bSec) { this._bSec = sec; this.G.ui.refreshHud?.(); } // contagem no ícone
    }
    const k = this.barrierMax > 0 ? this.barrier / this.barrierMax : 0;
    if (!this.barrierMesh) {
      if (k <= 0) return;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false }));
      const w = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.35, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.add(w); m.renderOrder = 3; w.renderOrder = 3;
      this.G.scene.add(m); this.barrierMesh = m; this.barrierWire = w;
    }
    const m = this.barrierMesh;
    // efeito visual temporário: 3 s depois de erguer a barreira a bolha some (a defesa continua; a faixa dourada
    // na barra de vida mostra quanto ainda resta)
    this.barrierShow = Math.max(0, (this.barrierShow || 0) - dt);
    const fade = Math.min(1, this.barrierShow / 0.5);
    m.visible = k > 0 && this.alive && this.rig.root.visible && fade > 0;
    if (!m.visible) return;
    this.barrierFlash = Math.max(0, this.barrierFlash - dt * 3);
    const t = this.anim.t;
    m.position.set(this.pos.x, this.rig.root.position.y + 1.05, this.pos.z);
    m.rotation.y = t * 0.6; m.scale.setScalar(1 + Math.sin(t * 3) * 0.02 + this.barrierFlash * 0.08);
    m.material.opacity = (0.06 + 0.16 * k + this.barrierFlash * 0.25) * fade;
    this.barrierWire.material.opacity = (0.12 + 0.3 * k + this.barrierFlash * 0.3) * fade;
  }

  syncRig(dt) {
    this.drawBarrier(dt);
    const r = this.rig.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    if (this.mounted && this.horse) {
      const H = this.horse, ha = this.horseAnim;
      H.root.position.copy(this.pos); H.root.rotation.y = this.yaw;
      ha.move = this.anim.move; ha.t += dt;
      animate(H, ha, dt);
      const bob = H.body.position.y;
      r.position.y += 0.62 + bob;
      const move = this.anim.move; this.anim.move = 0; this.anim.mounted = true;
      if (this.rig.kind === 'skinhero') r.position.y -= 0.18; // sentado na sela
      animate(this.rig, this.anim, dt);
      this.anim.move = move; this.anim.mounted = false;
      // sentado na sela: coxas para a frente e abertas, canelas para baixo
      const R = this.rig;
      if (R.legL && R.legR) { R.legL.rotation.set(-1.35, 0, 0.32); R.legR.rotation.set(-1.35, 0, -0.32); }
      if (R.kneeL && R.kneeR) { R.kneeL.rotation.set(1.45, 0, 0); R.kneeR.rotation.set(1.45, 0, 0); }
      if (R.hips) R.hips.position.y = R.hips.userData.y0 ?? R.hips.position.y;
    } else animate(this.rig, this.anim, dt);
    const f = this.flashT > 0 ? this.flashT / 0.12 : 0;
    const ph = this.action?.name === 'phase' ? 0.35 : 1;
    const inv = this.invuln > 0 && this.alive && !this.moveAction ? 0.55 + Math.sin(this.anim.t * 30) * 0.25 : 1;
    for (const m of this.rig.mats) {
      if (m.emissive) m.emissive.setRGB(f * 0.8, f * 0.15, f * 0.1);
      const op = Math.min(ph, inv);
      if (op < 1) { m.transparent = true; m.opacity = op; } else if (m.transparent && m.opacity !== 1) { m.opacity = 1; m.transparent = false; }
    }
  }

  saveTo(data) {
    data.hp = Math.round(this.hp);
    data.res = Math.round(this.res);
    data.smana = Math.round(this.smana || 0);
    data.pos = { x: Math.round(this.pos.x * 10) / 10, z: Math.round(this.pos.z * 10) / 10, area: this.area };
  }
}
