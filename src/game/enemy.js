import { BALANCE } from '../config/balance.js';
import { LOOT_TABLES } from '../config/items.js';
import { LootSystem } from './loot.js';
import * as THREE from 'three';
import { ENEMIES, BOSS } from '../config/enemies.js';
import { mobLevel } from '../config/moblevels.js';
import { enemyStats } from '../core/stats.js';
import { buildEnemyModel } from '../engine/models.js';
import { animate } from './anim.js';
import { dampAngle, angleDiff } from '../engine/noise.js';
import { hitPlayer, spawnProjectile } from './combat.js';
import { BOSS_SPAWN } from '../config/world.js';

// Estados: idle, patrol, alert, chase, attack, hurt, flee, return, dead, spawn
let ENEMY_ID = 1;
const PROBE_OFFS = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

// Espinhos pretos saindo do chão (Titã de Magma): só visual, some sozinho
const _spikeGeo = new THREE.ConeGeometry(0.28, 1.6, 5);
const _spikeMat = new THREE.MeshLambertMaterial({ color: 0x15100e, emissive: 0x3a0a04, flatShading: true });
const _boneMat = new THREE.MeshLambertMaterial({ color: 0xe8e0cc, emissive: 0x1a2a3a, flatShading: true });
const _iceMat = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x2a6a9a, flatShading: true, transparent: true, opacity: 0.92 });
const _shardGeo = new THREE.OctahedronGeometry(0.42, 0).scale(0.7, 1.5, 0.7);
const _shardMat = new THREE.MeshLambertMaterial({ color: 0xcff2ff, emissive: 0x3aa8e8, flatShading: true });
export function spikeBurst(G, x, z, r, area, bone = false) {
  const grp = new THREE.Group(), y = G.world.groundHeight(x, z, area), ice = bone === 'gelo';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, d = i === 0 ? 0 : r * (0.35 + Math.random() * 0.55);
    const m = new THREE.Mesh(_spikeGeo, ice ? _iceMat : bone ? _boneMat : _spikeMat);
    const h = i === 0 ? 1.8 : 0.8 + Math.random() * 0.9;
    m.scale.set(1, h, 1); m.position.set(x + Math.cos(a) * d, y + 0.8 * h - 0.2, z + Math.sin(a) * d);
    m.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
    grp.add(m);
  }
  G.scene.add(grp);
  G.fx.burst({ x, y: y + 0.4, z }, { count: 16, color: ice ? [0xdff6ff, 0x7fd8ff, 0xffffff] : bone ? [0xe8e0cc, 0x7fd8ff] : [0x2a1a14, 0xff5a1a], speed: 6, size: 0.35, life: 0.5, gravity: 10, up: 7 });
  let t = 0;
  const tick = () => { t += 0.05; grp.scale.y = t < 0.15 ? t / 0.15 : t > 1.1 ? Math.max(0.01, 1 - (t - 1.1) / 0.3) : 1; if (t < 1.4) setTimeout(tick, 50); else G.scene.remove(grp); };
  tick();
}
const _warn = new THREE.Color(0.75, 0.16, 0.05);
const _white = new THREE.Color(1, 1, 1);
const JUICE_T = 0.26; // duração do "amassa e treme" quando o monstro leva um golpe

// do que o monstro é feito: decide os pedaços que voam no golpe (gosma, osso, pedra, madeira, neve, faísca de metal…)
function hitMaterial(def, type) {
  const m = def.model, k = String(type || '') + ' ' + String(def.species || '') + ' ' + String(def.name || '').toLowerCase();
  if (m === 'slime') return 'goo';
  if (m === 'skeleton' || /esquelet|osso|ossár|ossar/.test(k)) return 'bone';
  if (m === 'golem' || m === 'titan' || /pedra|rocha|cristal|gárgula|gargula/.test(k)) return 'stone';
  if (m === 'treant' || /galho|árvore|arvore|tronco/.test(k)) return 'wood';
  if (m === 'boneco') return 'snow';
  if (m === 'knight' || m === 'warden') return 'metal';
  if (/besouro|caranguejo|escorpi|aranha|couraco|jabuti/.test(k)) return 'shell';
  if (m === 'brain' || m === 'cultist' || m === 'medusa') return 'arcane';
  if (m === 'fungo') return 'wood';
  return 'flesh';
}
const shade = (hex, k) => { const c = new THREE.Color(hex); return k > 1 ? c.lerp(_white, k - 1).getHex() : c.multiplyScalar(k).getHex(); };

export class Enemy {
  constructor(G, type, level, o = {}) {
    this.G = G;
    this.id = ENEMY_ID++;
    this.type = type;
    this.def = ENEMIES[type];
    if (this.def && !this.def.key) this.def.key = type; // a arte de cada monstro usa o tipo
    // nível fixo por tipo (Rucoy); réplicas recebem o nível do anfitrião e eventos escalam com o jogador
    if (!o.replica && !o.keepLevel) level = mobLevel(type, level);
    this.level = level;
    this.stats = enemyStats(this.def, level);
    this.hp = this.stats.maxHp;
    this.area = o.area || 'world';
    this.home = { x: o.x, z: o.z };
    this.patrolR = o.patrolR ?? 6;
    this.spawner = o.spawner || null;
    this.rig = buildEnemyModel(this.def);
    G.scene.add(this.rig.root);
    this.radius = this.def.model === 'boss' ? 2.4 : this.def.model === 'golem' || this.def.model === 'treant' ? 0.75 * this.def.size : this.def.model === 'titan' ? 0.42 * this.def.size : this.def.model === 'wolf' ? 0.7 * this.def.size : this.def.model === 'quad' ? 0.62 * (this.def.size || 1) : this.def.model === 'medusa' ? 0.6 * (this.def.size || 1) : 0.5 * (this.def.size || 1);
    this.pos = new THREE.Vector3(o.x, G.world.groundHeight(o.x, o.z, this.area), o.z);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = o.spawnAnim ? 'spawn' : 'idle';
    this.st = o.spawnAnim ? 0.7 : Math.random() * 3;
    this.atkCd = 0;
    this.attack = null;
    this.aggroed = this.def.aggro === 'aggressive';
    this.anim = { move: 0, t: Math.random() * 10, action: null, p: 0, hurt: 0, dead: 0, alert: 0 };
    this.stun = 0; this.freeze = 0; this.slowK = 1; this.slowT = 0; this.tauntT = 0;
    this.spCd = 2 + Math.random() * 3; this.shellT = 0;
    this.hurtT = 0; this.flashT = 0;
    this.dead = false; this.deadT = 0; this.removed = false;
    this.evading = false;
    this.fled = false;
    this.temporary = !!o.temporary;
    this.noRespawn = !!o.noRespawn;
    this.visibleToPlayer = false;
    this.dormant = false;
    this.lastHitBy = 0;
    this.patrolPt = null;
    this.waypoints = o.waypoints || null;
    this.wpI = 0;
    this.boss = this.def.boss ? { phase: 0, engaged: false, cds: { swipe: 0, slam: 3, charge: 5, shards: 6, wave: 4 }, gcd: 1.5, summoned: false, disengageT: 0 } : null;
    this.miniCount = 0;
    // multiplayer: id de rede, alvo atual (jogador local ou remoto), quem causou dano
    this.nid = o.nid || this.id;
    this.replica = !!o.replica;
    this._T = null; this.tgtT = 0;
    this.contrib = new Set();
    this.dmgBy = new Map(); // dano por jogador (divide o saque dos chefes)
    this.localHit = -1e9;
    this.rewarded = false;
    if (o.spawnAnim) this.rig.root.scale.multiplyScalar(0.01);
    this.baseScale = this.def.size || 1;
    this.rig.root.position.copy(this.pos);
  }

  alive() { return !this.dead; }

  // ---- alvos: todos os jogadores na mesma área (o seu herói + os outros jogadores conectados) ----
  get T() { return this._T || this.G.player; }
  players() { return this.G.net ? this.G.net.targets(this.area) : [this.G.player]; }
  pickTarget(dt) {
    this.tgtT -= dt;
    const cur = this._T;
    const valid = (p) => p && p.alive && p.area === this.area && !this.G.world.isSafe(p.pos.x, p.pos.z, p.area);
    if (this.lureRoll(dt, valid)) return;
    if (cur && valid(cur) && this.tgtT > 0) return;
    this.tgtT = 0.6;
    let best = null, bd = Infinity;
    for (const p of this.players()) {
      if (!valid(p)) continue;
      let d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (p === cur) d -= 3; // mantém o alvo atual se estiver perto
      if (d < bd) { bd = d; best = p; }
    }
    this._T = best || null;
  }
  // Escudo épico/lendário: de tempos em tempos, cada monstro perto tem X% de chance de vir atrás de quem usa
  // (chance, nunca certeza). Puxa o monstro mesmo que ele estivesse em outro jogador.
  lureRoll(dt, valid) {
    if (this.replica || this.def.boss || this.state === 'return' || this.state === 'spawn' || this.state === 'flee') return false;
    this.lureT = (this.lureT ?? Math.random() * 2.5) - dt;
    if (this.lureT > 0) return false;
    this.lureT = BALANCE.shieldLure.every;
    const R = Math.max(10, (this.def.detect || 8) * 1.5);
    for (const p of this.players()) {
      const lure = p.remote ? p.lure : p.stats?.lure;
      if (!lure || !valid(p) || p === this._T) continue;
      if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) > R) continue;
      if (Math.random() >= lure) continue;
      this._T = p; this.tgtT = 5; this.aggroed = true;
      if (['idle', 'patrol'].includes(this.state)) this.alertStart();
      else if (this.state === 'alert') this.setState('chase');
      return true;
    }
    return false;
  }
  // golpe em um jogador: local aplica direto; remoto recebe pela rede
  hitP(P, dmg, src) {
    if (!P || !P.alive) return;
    if (P.remote) this.G.net.sendHit(P.peer, dmg, src);
    else hitPlayer(this.G, dmg, src);
  }
  // golpes em área atingem todos os jogadores dentro do raio
  hitArea(x, z, r, dmg, src, pad = 0.5) {
    for (const P of this.players()) {
      if (!P.alive || P.area !== this.area) continue;
      if (Math.hypot(P.pos.x - x, P.pos.z - z) <= r + (P.radius || 0.5) * pad) this.hitP(P, dmg, src);
    }
  }
  get name() { return this.def.name; }

  distToPlayer() { const P = this.T; return Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z); }
  yawToPlayer() { const P = this.T; return Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); }

  canSeePlayer() {
    const G = this.G, P = this.T;
    if (!P.alive || P.area !== this.area) return false;
    if (G.world.isSafe(P.pos.x, P.pos.z, P.area)) return false;
    const night = G.night > 0.6 ? (this.def.nightDetectBonus || 0) : 0;
    const d = this.distToPlayer();
    if (d > this.def.detect + night) return false;
    return G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
  }

  setState(s, t = 0) { if (s !== 'special' && this.attack?.orb) { this.G.scene.remove(this.attack.orb); this.attack.orb = null; } if (s !== 'special' && this.rig?.sword && !this.rig.sword.visible) this.rig.sword.visible = true; this.state = s; this.st = t; if (this.attack?.ball && s !== 'special') { this.G.scene.remove(this.attack.ball); this.attack.ball = null; } if (s !== 'attack' && s !== 'special') this.attack = null; if (s !== 'special') this.shellT = 0; }

  taunt(target, dur) {
    if (this.dead || this.state === 'return') return;
    this.tauntT = dur; this.aggroed = true;
    if (['idle', 'patrol', 'alert', 'flee'].includes(this.state)) this.setState('chase');
  }

  applySlow(k, dur) { if (this.def.boss) k = Math.max(k, 0.75); this.slowK = Math.min(this.slowK, k); this.slowT = Math.max(this.slowT, dur); }
  applyStun(t) { if (this.def.boss || this.def.miniboss) t *= 0.25; this.stun = Math.max(this.stun, t); if (this.attack?.ball) { this.G.scene.remove(this.attack.ball); } if (this.attack?.orb) { this.G.scene.remove(this.attack.orb); } this.attack = null; if (this.state === 'attack' || this.state === 'special') this.setState('chase'); }
  applyFreeze(t) {
    if (this.def.boss) { this.applySlow(0.5, t); return; }
    if (this.def.miniboss) t *= 0.4;
    this.freeze = Math.max(this.freeze, t); this.attack = null; if (this.state === 'attack' || this.state === 'special') this.setState('chase');
  }

  // Assistência: inimigos próximos do mesmo tipo entram no combate
  // quantos monstros estão colados no mesmo herói
  crowdNear(P) {
    let n = 0;
    for (const e of this.G.enemies) if (e !== this && !e.dead && e.area === this.area && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 4) n++;
    return n;
  }

  // conjuradores curam o aliado mais ferido por perto (a cada ~9 s)
  tryHealAlly(dt) {
    this.healCd = (this.healCd ?? 4 + Math.random() * 3) - dt;
    if (this.healCd > 0) return;
    let best = null, bk = 0.6;
    for (const e of this.G.enemies) {
      if (e.dead || e.replica || e.area !== this.area || e.boss || Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) > 11) continue;
      const k = e.hp / e.stats.maxHp;
      if (k < bk) { bk = k; best = e; }
    }
    this.healCd = best ? 9 : 2;
    if (!best) return;
    const G = this.G, amt = Math.round(best.stats.maxHp * 0.2);
    best.hp = Math.min(best.stats.maxHp, best.hp + amt);
    G.fx.beam(best.pos.x, best.pos.y, best.pos.z, 0x7aff9a, 4, 0.5, 0.6);
    G.fx.ring(best.pos.x, best.pos.y + 0.1, best.pos.z, 1.4, 0x7aff9a, 0.5);
    G.net?.tele(this.area, 'w', best.pos.x, best.pos.z, 1.4, 0.4, 0x7aff9a);
    if (Math.hypot(G.player.pos.x - best.pos.x, G.player.pos.z - best.pos.z) < 30) G.ui.damageNumber(best.pos.x, best.pos.y + 2, best.pos.z, '+' + amt, 'heal');
    this.anim.alert = 1;
  }

  callAssist(radius) {
    for (const e of this.G.enemies) {
      if (e === this || e.dead || e.area !== this.area) continue;
      if (e.def.model !== this.def.model && !(this.def.model === 'goblin' && e.def.model === 'goblin')) continue;
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) > radius) continue;
      if (['idle', 'patrol'].includes(e.state)) { e.aggroed = true; e.setState('alert', 0.3 + Math.random() * 0.3); }
    }
  }

  takeDamage(dmg, info = {}) {
    if (this.dead) return null;
    if (this.state === 'return' || this.state === 'spawn') { this.evading = true; return { dmg: 0 }; }
    this.evading = false;
    if (this.punishT > 0) dmg = Math.round(dmg * 1.5); // brecha: inimigo exausto leva +50%
    if (this.wardShield) { dmg = Math.max(1, Math.round(dmg * 0.15)); if (Math.random() < 0.5) this.G.fx.ring(this.pos.x, this.pos.y + 0.2, this.pos.z, 2.2, this.def.glow ?? 0x7af0ff, 0.25); } // almas protegem o Vigia
    if (this.shellT > 0) { dmg = Math.max(1, Math.round(dmg * 0.25)); this.G.fx.burst({ x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, { count: 5, color: [0xdff6ff, 0xffffff], speed: 4, size: 0.18, life: 0.2, gravity: 0, up: 1 }); }
    if (!this.replica) { const who = info.peer ? String(info.peer) : 'self'; this.dmgBy.set(who, (this.dmgBy.get(who) || 0) + Math.max(0, Math.min(dmg, this.hp))); }
    this.hp -= dmg;
    this.impact(info);
    if (info.peer) this.impactFx(0, 0, false, 0, true); // golpe de outro jogador (quem simula o mundo vê)
    this.lastHitBy = this.G.time.t;
    if (info.peer) this.contrib.add(info.peer);
    else { this.localHit = this.G.time.t; this.G.target = this; }
    if (this.replica) {
      this.predT = 0.8;
      // morte PREVISTA: cai na hora em que o seu golpe zera a vida (antes esperava o anfitrião confirmar → atraso
      // de meio segundo com 200 ms de ping). Se o anfitrião discordar, o monstro volta (ver netUpdate).
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.state = 'dead'; this.deadT = 0; this.predDead = true; if (this.G.target === this) this.G.target = null; this.deathFx?.(); }
      return { dmg };
    }
    if (!this.aggroed) { this.aggroed = true; this.callAssist(this.def.assist || 6); }
    if (['idle', 'patrol', 'alert'].includes(this.state)) this.setState('chase');
    if (this.boss && !this.boss.engaged) this.engageBoss();
    if (info.knock && !this.def.elite) {
      const k = info.knock * (this.def.model === 'golem' || this.def.model === 'titan' || this.def.model === 'treant' ? 0.3 : 1);
      this.G.world.tryMove(this.pos, (info.dirX || 0) * k, (info.dirZ || 0) * k, this.radius, this.area);
    }
    const big = dmg > this.stats.maxHp * 0.12 || info.crit;
    if (this.def.staggerable && big && this.state !== 'flee') {
      this.hurtT = 0.22;
      if (this.state === 'attack' && this.attack && this.attack.phase === 'windup') this.setState('hurt', 0.22);
    } else this.hurtT = Math.max(this.hurtT, 0.12);
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    else if ((this.def.fleeAt ?? (!this.def.elite && !this.def.miniboss && !this.def.boss && ['goblin', 'wolf', 'slime'].includes(this.def.model) ? 0.15 : 0)) && !this.fled && this.hp > 0 && this.hp / this.stats.maxHp < (this.def.fleeAt ?? 0.15)) { this.fled = true; this.setState('flee', 2.6); this.G.ui.damageNumber(this.pos.x, this.pos.y + 2, this.pos.z, 'Fugindo!', 'miss'); }
    return { dmg };
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.setState('dead', 0);
    this.deadT = 0;
    this.deathFx();
    if (this.souls) this.clearSouls();
    if (this.attack?.ball) { this.G.scene.remove(this.attack.ball); this.attack.ball = null; }
    // recompensa só para quem lutou (cada jogador ganha seu XP e saque, como num MMO)
    // em time: o XP é dividido e quem ajudou (lutou ou estava perto) também ganha o abate
    const G = this.G, mine = G.time.t - this.localHit < 60;
    if (!this.replica && LOOT_TABLES[this.def.loot]?.bossLoot) this.lootWinners = LootSystem.rollBossWinners(this, G.net?.selfPeer || 'self');
    const cr = G.party ? G.party.credit(this, new Set([...this.contrib].map(String))) : (mine ? { share: 1 } : null);
    if (cr && !this.rewarded) { this.rewarded = true; G.onEnemyKilled(this, true, cr); }
    else if (!this.replica) this.G.onEnemyKilled(this, false);
    if (!this.replica) this.G.net?.mobKilled(this);
    // online: o anfitrião sorteia o saque uma vez só e todos veem os mesmos itens
    if (!this.replica && G.loot?.sharedOnline()) G.loot.dropShared(this);
  }

  // ---- golpe recebido: pisca branco, "amassa" elástico e treme no lugar (NÃO empurra) ----
  impact(info = {}) {
    this.flashT = 0.12;
    this.juiceT = JUICE_T;
    this.juiceAmp = (this.boss || this.def.boss ? 0.45 : this.def.miniboss || this.def.elite ? 0.75 : 1) * (info.crit ? 1.35 : 1);
    let dx = +(info.hx ?? info.dirX) || 0, dz = +(info.hz ?? info.dirZ) || 0;
    if (Math.hypot(dx, dz) < 0.01) { const a = Math.random() * 6.28; dx = Math.sin(a); dz = Math.cos(a); }
    const l = Math.hypot(dx, dz); this.jdx = dx / l; this.jdz = dz / l;
  }

  // faíscas e lascas no ponto do golpe, do material do monstro
  impactFx(dirX, dirZ, big = false, color = 0, light = false) {
    const G = this.G, P = G.player, fx = G.fx;
    if (!P || !fx || this.area !== P.area || Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) > 45) return;
    let dx = +dirX || 0, dz = +dirZ || 0;
    if (Math.hypot(dx, dz) < 0.01) { dx = this.pos.x - P.pos.x; dz = this.pos.z - P.pos.z; if (light || Math.hypot(dx, dz) < 0.01) { const a = Math.random() * 6.28; dx = Math.sin(a); dz = Math.cos(a); } }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sc = Math.min(1.8, Math.sqrt(this.baseScale || 1)), h = (this.rig?.height || 1.6) * (this.def.model === 'slime' ? 0.45 : 0.55);
    const x = this.pos.x - dx * this.radius * 0.6, y = this.pos.y + h, z = this.pos.z - dz * this.radius * 0.6;
    const c = this._hc ??= new THREE.Color(this.def.color ?? 0xcccccc).getHex(), glow = this.def.glow ?? 0xfff0c8;
    const mat = this.hitMat ||= hitMaterial(this.def, this.type);
    const N = (n) => Math.max(1, Math.round(n * (big ? 1.6 : 1) * (light ? 0.5 : 1)));
    // clarão no ponto do golpe
    fx.emit(x, y, z, 0, 0, 0, 0xffffff, (big ? 1.25 : 0.85) * sc, 0.09, 0, 0);
    fx.emit(x, y, z, 0, 0, 0, color || (big ? 0xffe66b : 0xffd2a0), (big ? 1.8 : 1.2) * sc, 0.13, 0, 0);
    const spray = (cols, n, sp, size, life, grav, up, spread = 2.2, drag = 1.2) => {
      const base = Math.atan2(dx, dz);
      for (let i = 0; i < n; i++) {
        const a = base + (Math.random() - 0.5) * spread, s = sp * sc * (0.5 + Math.random() * 0.8);
        const back = Math.random() < 0.45 ? -1 : 1; // parte volta para quem bateu, parte espirra para trás do monstro
        fx.emit(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, z + (Math.random() - 0.5) * 0.2,
          Math.sin(a) * s * back, up * (0.4 + Math.random()), Math.cos(a) * s * back,
          cols[i % cols.length], size * sc * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), grav, drag);
      }
    };
    const sparks = (n, cols = [0xffffff, 0xfff0a0, 0xffc860]) => spray(cols, N(n), 10, 0.08, 0.28, 18, 3, 2.6, 0.6);
    switch (mat) {
      case 'goo': spray([c, shade(c, 1.35), shade(c, 0.75)], N(10), 4.5, 0.26, 0.55, 14, 3.2); break;
      case 'bone': spray([0xf1ead6, 0xd9cdb0, 0xbfb291], N(9), 6.5, 0.13, 0.55, 20, 3.5); sparks(3); break;
      case 'stone': spray([0x8f887c, 0xb8b0a0, 0x6c665c, shade(c, 0.9)], N(9), 6, 0.15, 0.6, 22, 3.5); sparks(4); break;
      case 'wood': spray(this.def.model === 'treant' ? [0x7a5530, 0xa67c4a, 0x5f9a3a, 0x7cbf4a] : [0x7a5530, 0xa67c4a, 0x5c3f22], N(9), 5.5, 0.14, 0.6, 16, 3.5); break;
      case 'snow': spray([0xffffff, 0xe6f4ff, 0xcfe6ff], N(12), 5, 0.2, 0.6, 12, 3.5); break;
      case 'metal': sparks(12); spray([0xfff6d0], N(2), 3, 0.3, 0.12, 0, 0); break;
      case 'shell': spray([c, shade(c, 0.6), shade(c, 1.3)], N(8), 6, 0.12, 0.5, 20, 3); sparks(4); break;
      case 'arcane': spray([glow, shade(glow, 1.4), 0xffffff], N(10), 4, 0.16, 0.5, -1, 1.5); sparks(3, [0xffffff, glow]); break;
      default: sparks(7); spray([c, shade(c, 1.3)], N(5), 4, 0.17, 0.4, 14, 2.5); // carne/pelo: faíscas + pedacinhos na cor do bicho
    }
  }

  // estouro de partículas na cor do monstro + alma subindo; elites e chefes fazem um efeito maior
  deathFx() {
    const G = this.G, P = G.player;
    if (!P || this.area !== P.area || Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) > 70) return;
    const big = this.def.elite || this.def.miniboss || this.boss, h = (this.rig?.height || 1.6) * 0.5;
    const c = new THREE.Color(this.def.color ?? 0xcccccc).getHex(), glow = this.def.glow ?? (this.def.variant === 'rift' ? 0xd36bff : 0xfff0c8);
    G.fx.burst({ x: this.pos.x, y: this.pos.y + h, z: this.pos.z }, { count: big ? 34 : 16, color: [c, glow, 0xffffff], speed: big ? 7 : 4.5, size: big ? 0.32 : 0.22, life: 0.6, gravity: 9, up: 4 });
    G.fx.ring(this.pos.x, this.pos.y + 0.05, this.pos.z, big ? 3.2 : 1.5, glow, 0.45);
    for (let i = 0; i < (big ? 10 : 4); i++) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 0.8, this.pos.y + h, this.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 2.2 + Math.random(), (Math.random() - 0.5) * 0.4, glow, 0.3, 1.1, 0, 1);
    if (big) { G.fx.shock?.(this.pos.x, this.pos.y, this.pos.z, 5, glow, 0.5); G.cam?.shake?.(0.25, 0.25); }
  }

  // ---------- movimento com desvio simples de obstáculos ----------
  moveToward(tx, tz, mul, dt, away = false) {
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    if (away) { dx = -dx; dz = -dz; }
    const l = Math.hypot(dx, dz);
    if (l < 0.05) return 0;
    dx /= l; dz /= l;
    const W = this.G.world;
    const probe = (ax, az) => {
      const px = this.pos.x + ax * 1.4, pz = this.pos.z + az * 1.4;
      return W.walkable(px, pz, this.area) && !W.col.pointBlocked(px, pz, this.radius * 0.8) && (this.area !== 'world' || !W.isSafe(px, pz) || this.temporary);
    };
    let ax = dx, az = dz;
    if (!probe(ax, az)) {
      const base = Math.atan2(dx, dz);
      let found = false;
      for (const off of PROBE_OFFS) {
        const a = base + off;
        if (probe(Math.sin(a), Math.cos(a))) { ax = Math.sin(a); az = Math.cos(a); found = true; break; }
      }
      if (!found) return 0;
    }
    const sp = this.def.speed * mul * this.slowK * (this.rage || 1);
    W.tryMove(this.pos, ax * sp * dt, az * sp * dt, this.radius, this.area);
    this.yaw = dampAngle(this.yaw, away ? Math.atan2(-ax, -az) + Math.PI : Math.atan2(ax, az), 10, dt);
    return sp / this.def.speed;
  }

  separate(neighbors, dt) {
    for (const o of neighbors) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const rr = this.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        this.G.world.tryMove(this.pos, (dx / d) * push * Math.min(1, dt * 10), (dz / d) * push * Math.min(1, dt * 10), this.radius, this.area);
      }
    }
  }

  // ---------- atualização ----------
  update(dt, neighbors) {
    const G = this.G, P = this.T;
    // velocidade estimada (para a mira com antecipação dos projéteis do jogador)
    if (dt > 0 && this._px !== undefined) {
      const ivx = (this.pos.x - this._px) / dt, ivz = (this.pos.z - this._pz) / dt;
      this.vx = (this.vx || 0) * 0.6 + (Math.abs(ivx) < 40 ? ivx : 0) * 0.4;
      this.vz = (this.vz || 0) * 0.6 + (Math.abs(ivz) < 40 ? ivz : 0) * 0.4;
    }
    this._px = this.pos.x; this._pz = this.pos.z;
    this.anim.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.juiceT = Math.max(0, (this.juiceT || 0) - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowK = 1; }
    if (this.tauntT > 0) this.tauntT -= dt;
    let move = 0;
    if (this.dead) {
      this.deadT += dt;
      this.anim.dead = Math.min(1, this.deadT / 0.7);
      if (this.deadT > 1.4) {
        const k = Math.max(0, 1 - (this.deadT - 1.4) / 0.6);
        this.rig.root.scale.setScalar(this.baseScale * (0.2 + 0.8 * k));
        if (this.deadT > 2.0 && !this.removed) {
          if (this.area === this.G.player.area) this.G.fx.burst({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }, { count: 8, color: [0xd8d0c0, 0x9a9488], speed: 2, size: 0.3, life: 0.5, gravity: -1, up: 1.5 });
          this.remove();
        }
      }
      this.sync(dt, 0);
      return;
    }
    if (this.state === 'spawn') {
      this.st -= dt;
      let k = 1 - Math.max(0, this.st / 0.7);
      // monstro de raid: sai do portal andando até a frente dele
      if (this.exitTo) {
        k = Math.min(1, 0.35 + (1 - Math.max(0, this.st) / 1.1) * 0.65);
        const dx = this.exitTo.x - this.pos.x, dz = this.exitTo.z - this.pos.z, dd = Math.hypot(dx, dz);
        if (dd > 0.3) { const sp = Math.min(dd, (this.stats?.speed || this.def.speed || 3) * 1.2 * dt); this.pos.x += (dx / dd) * sp; this.pos.z += (dz / dd) * sp; this.yaw = Math.atan2(dx, dz); }
        this.pos.y = G.world.groundHeight(this.pos.x, this.pos.z, this.area);
        if (this.st <= 0) this.exitTo = null;
        this.rig.root.scale.setScalar(this.baseScale * k);
        if (this.st <= 0) { this.rig.root.scale.setScalar(this.baseScale); this.setState(this.aggroed && this.temporary ? 'chase' : 'idle', 1); }
        this.sync(dt, 1);
        return;
      }
      this.rig.root.scale.setScalar(this.baseScale * Math.max(0.01, k));
      if (Math.random() < dt * 20) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 1.2, this.pos.y + 0.2, this.pos.z + (Math.random() - 0.5) * 1.2, 0, 3, 0, this.def.variant === 'rift' ? 0xd36bff : 0xfff0c8, 0.35, 0.5, 0, 1);
      if (this.st <= 0) { this.rig.root.scale.setScalar(this.baseScale); this.setState(this.aggroed && this.temporary ? 'chase' : 'idle', 1); }
      this.sync(dt, 0);
      return;
    }
    if (this.punishT > 0) {
      this.punishT = Math.max(0, this.punishT - dt);
      if (Math.random() < dt * 10) G.fx.emit(this.pos.x + (Math.random() - 0.5), this.pos.y + this.rig.height + 0.3, this.pos.z + (Math.random() - 0.5), 0, 0.8, 0, 0xffd36b, 0.3, 0.5, 0, 1);
    }
    if (this.freeze > 0 || this.stun > 0) {
      this.freeze = Math.max(0, this.freeze - dt); this.stun = Math.max(0, this.stun - dt);
      if (this.stun > 0 && Math.random() < dt * 6) G.fx.emit(this.pos.x, this.pos.y + this.rig.height + 0.2, this.pos.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0xffe066, 0.25, 0.5, 0, 1);
      this.sync(dt, 0);
      return;
    }
    this.pickTarget(dt);
    if (this.boss) return this.updateBoss(dt, neighbors);
    this.updatePhases(dt);
    // monstros não curam a si mesmos nem aos outros (sem regeneração de vida)
    this.atkCd = Math.max(0, this.atkCd - dt * (this.rage || 1));
    this.spCd = Math.max(0, this.spCd - dt);
    this.shotCd = Math.max(0, (this.shotCd ?? 1.5) - dt * (this.rage || 1));
    this.st -= dt;
    const d = this.distToPlayer();
    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    // distância de perseguição: medida a partir do centro do grupo (não do ponto exato onde nasceu)
    // e bem maior que antes, para o monstro não "evadir" depois de poucos passos
    const sp = this.spawner, ax = sp ? sp.cx ?? sp.cfg.x : this.home.x, az = sp ? sp.cz ?? sp.cfg.z : this.home.z;
    const leashD = Math.hypot(this.pos.x - ax, this.pos.z - az);
    const leash = this.def.leash * BALANCE.leashMult + (sp?.cfg.r || 0);
    const playerOk = P.alive && P.area === this.area && !G.world.isSafe(P.pos.x, P.pos.z, P.area);
    switch (this.state) {
      case 'idle':
        if (this.aggroed && this.def.aggro === 'aggressive' && this.canSeePlayer()) { this.alertStart(); break; }
        if (this.st <= 0) {
          if (this.waypoints) { this.wpI = (this.wpI + 1) % this.waypoints.length; const w = this.waypoints[this.wpI]; this.patrolPt = { x: w[0], z: w[1] }; }
          else {
            const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrolR;
            this.patrolPt = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
          }
          this.setState('patrol', 8);
        }
        break;
      case 'patrol': {
        if (this.aggroed && this.def.aggro === 'aggressive' && this.canSeePlayer()) { this.alertStart(); break; }
        const pd = Math.hypot(this.patrolPt.x - this.pos.x, this.patrolPt.z - this.pos.z);
        if (pd < 0.8 || this.st <= 0) this.setState('idle', 1.5 + Math.random() * 3.5);
        else move = this.moveToward(this.patrolPt.x, this.patrolPt.z, this.def.patrol ? 0.42 : 0.3, dt) * 0.42;
        break;
      }
      case 'alert':
        this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 10, dt);
        this.anim.alert = Math.min(1, this.anim.alert + dt * 5);
        if (this.st <= 0) { this.anim.alert = 0; this.setState('chase'); }
        break;
      case 'chase': {
        if (!playerOk || (leashD > leash && this.tauntT <= 0)) { this.setState('return'); break; }
        if (this.def.warden && this.atkCd < 0.6 && this.tryWarden(d)) break;
        if (this.def.magmaSkills && this.atkCd < 0.6 && this.tryMagma(d)) break;
        if (this.def.yetiSkills && this.atkCd < 0.6 && this.tryYeti(d)) break;
        if (this.def.iceTitan && this.atkCd < 0.6 && this.tryIceTitan(d)) break;
        if (this.def.kingSlime && this.atkCd < 0.6 && this.tryKing(d)) break;
        if (this.def.boneLord && this.atkCd < 0.6 && this.tryBone(d)) break;
        if (this.def.brainDash && this.atkCd < 0.6 && this.tryBrain(d)) break;
        if ((this.def.special || this.def.specials) && this.spCd <= 0 && (this.atkCd < 0.6 || (this.def.specials && d > 5.5)) && this.trySpecial(d)) break; // chefes com vários golpes: longe, já pode avançar
        if (this.bossShotOk(d)) { this.beginBossShot(); break; }
        if (this.rig.kind === 'golem' && !this.boss && !this.def.warden && this.atkCd < 0.6 && this.tryGolem(d)) break;
        const kite = this.def.kite;
        if (this.def.ranged) {
          // fugindo: se a recarga acabou, para, vira para o herói, atira e volta a correr
          if (kite && d < kite && !(this.atkCd <= 0 && d > 2.5 && G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z))) { move = this.moveToward(P.pos.x, P.pos.z, 0.8, dt, true); }
          else if (kite && d < kite) this.beginAttack();
          else if (d <= this.def.range && G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
            if (this.atkCd <= 0) this.beginAttack();
            else {
              // entre um tiro e outro anda de lado (fica mais difícil de acertar)
              this.strafeT = (this.strafeT ?? Math.random() * 2) - dt;
              if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.4; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
              const a = this.yawToPlayer() + Math.PI / 2 * (this.strafeDir || 1);
              move = this.moveToward(this.pos.x + Math.sin(a) * 2, this.pos.z + Math.cos(a) * 2, 0.5, dt) * 0.6;
              this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 10, dt);
            }
          }
          else move = this.moveToward(P.pos.x, P.pos.z, 1, dt);
        } else if (d <= this.def.range + P.radius) {
          this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 12, dt);
          if (this.atkCd <= 0) this.beginAttack();
          else if (!this.def.elite && this.atkCd > 0.5 && this.crowdNear(P) >= 2) {
            // em bando: enquanto espera o próximo golpe, anda de lado para cercar o herói
            const a = this.yawToPlayer() + Math.PI / 2 * (this.nid % 2 ? 1 : -1);
            move = this.moveToward(this.pos.x + Math.sin(a) * 2, this.pos.z + Math.cos(a) * 2, 0.45, dt) * 0.5;
          }
        } else if (d > this.def.range + 1.2 && d < 12 && !this.def.elite) {
          // cerco: cada monstro mira um lado diferente do herói em vez de todos chegarem pela frente
          const slot = ((this.nid * 2.399) % (Math.PI * 2)), r = this.def.range * 0.85;
          const tx = P.pos.x + Math.sin(slot) * r, tz = P.pos.z + Math.cos(slot) * r;
          move = this.moveToward(d < 4 ? P.pos.x : tx, d < 4 ? P.pos.z : tz, 1, dt);
        } else move = this.moveToward(P.pos.x, P.pos.z, 1, dt);
        break;
      }
      case 'attack': move = this.updateAttack(dt); break;
      case 'special': move = this.def.warden ? this.updateWarden(dt) : this.attack?.ms ? this.updateMagma(dt) : this.updateSpecial(dt); break;
      case 'hurt': if (this.st <= 0) this.setState('chase'); break;
      case 'flee':
        move = this.moveToward(P.pos.x, P.pos.z, 1.15, dt, true);
        if (this.st <= 0) { this.callAssist(14); this.setState('chase'); }
        break;
      case 'return': {
        this.evading = true;
        move = this.moveToward(this.home.x, this.home.z, 1.35, dt) || 0.6;
        if (homeD < 1.5 || this.st < -12) {
          this.evading = false; this.fled = false; this.aggroed = this.def.aggro === 'aggressive';
          if (this.def.warden) { this.phase = 0; this.rage = 1; this.clearSouls(); }
          if (homeD >= 1.5) this.teleportHome();
          this.setState('idle', 2);
        }
        break;
      }
      default: break;
    }
    this.separate(neighbors, dt);
    this.sync(dt, move);
  }

  teleportHome() { this.pos.set(this.home.x, this.G.world.groundHeight(this.home.x, this.home.z, this.area), this.home.z); }

  alertStart() {
    this.setState('alert', this.def.model === 'wolf' ? 0.55 : 0.4);
    this.G.ui.alertMark(this);
    if (this.def.pack) { this.G.audio.play('howl', { gap: 1200 }); this.callAssist(this.def.assist); }
    if (this.def.model === 'skeleton') this.G.audio.play('rattle', { gap: 400 });
  }

  // ---------- golpes especiais de cada espécie ----------
  // def.special = { kind, cd, windup, ... }. Cada espécie tem o seu: ferroada, teia, carga, salto, sopro,
  // patada, rolar, casco, raízes, lança, círculo mágico. Todos avisam no chão antes de acertar.
  teleCircle(x, z, r, dur, color) { const G = this.G, y = G.world.groundHeight(x, z, this.area); G.fx.telegraphCircle(x, y, z, r, dur, color); G.net?.tele(this.area, 'c', x, z, r, dur, color); }
  teleRect(len, w, dur, color, yaw = this.yaw) { const G = this.G; G.fx.telegraphRect(this.pos.x, this.pos.y, this.pos.z, yaw, len, w, dur, color); G.net?.tele(this.area, 'r', this.pos.x, this.pos.z, len, dur, color, yaw, w); }

  trySpecial(d) {
    // chefes com vários golpes (def.specials): sorteia um que dê para usar agora
    if (this.def.specials) {
      // longe: prefere os golpes que encurtam a distância (investida, salto, rolar, bola de neve); perto: os de área
      const gap = { carga: 1, salto: 1, rolar: 1, teia: 1 }, far = d > 5.5;
      const list = [...this.def.specials].map((S) => [S, Math.random() + (far === !!gap[S.kind] ? 1 : 0)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      const now = this.G.time?.t || 0;
      for (const S of list) if ((this.spReady?.[S.kind] || 0) <= now && this.trySpecialOne(S, d)) return true;
      return false;
    }
    return this.trySpecialOne(this.def.special, d);
  }
  trySpecialOne(S, d) {
    const G = this.G, P = this.T;
    const los = () => G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let ok = false;
    switch (S.kind) {
      case 'ferroada': ok = d < 3.6; break;
      case 'patada': ok = d < (S.radius || 4) - 0.3; break;
      case 'teia': ok = d > 4 && d < 13 && los(); break;
      case 'carga': case 'rolar': ok = d > 5 && d < (S.dist || 13) - 1 && los(); break;
      case 'salto': ok = d > 4 && d < 12 && los(); break;
      case 'sopro': ok = d < 6 && los(); break;
      case 'casco': ok = d < 5 && this.hp < this.stats.maxHp * 0.8; break;
      case 'raizes': case 'circulo': ok = d > 3 && d < 15 && los(); break;
      case 'lanca': ok = d > 2.2 && d < 5 && los(); break;
      case 'invocar': ok = d < 18 && !this.G.enemies.some((o) => o.summoner === this && o.alive()); break; // só chama mais quando os anteriores caírem
      default: break;
    }
    if (!ok) return false;
    this.curSp = S;
    // cada golpe tem a própria recarga; entre um golpe e outro, 3–5 s
    this.spCd = this.def.specials ? 3 + Math.random() * 2 : S.cd * (0.85 + Math.random() * 0.3);
    if (this.def.specials) { (this.spReady ||= {})[S.kind] = (G.time?.t || 0) + S.cd; }
    this.yaw = this.yawToPlayer();
    const W = S.windup ?? 0.6, col = S.color ?? 0xff3b2f;
    const rk = this.rig.kind;
    const defAnim = rk === 'humanoid' ? ({ carga: 'charge', salto: 'leap', patada: 'slam', sopro: 'cast', raizes: 'cast', circulo: 'cast', casco: 'guard', teia: 'throw', lanca: 'slash', ferroada: 'slash' }[S.kind] || 'slash') : rk === 'golem' ? 'slam' : 'attack';
    const a = { kind: S.anim || defAnim, t: 0, windup: W, phase: 'windup', recover: S.recover ?? 0.45, sp: S.kind, yaw: this.yaw, tx: P.pos.x, tz: P.pos.z, sx: this.pos.x, sz: this.pos.z, hit: new Set(), traveled: 0 };
    this.attack = a; this.setState('special');
    switch (S.kind) {
      case 'carga': case 'rolar': this.teleRect(S.dist || 13, 2.2, W, col); break;
      case 'sopro': this.teleRect(6, 3.4, W, col); break;
      case 'lanca': this.teleRect(5, 1.3, W, col); break;
      case 'patada': this.teleCircle(this.pos.x, this.pos.z, S.radius || 4, W, col); break;
      case 'salto': this.teleCircle(a.tx, a.tz, 2.6, W + 0.55, col); break;
      case 'raizes': this.teleCircle(a.tx, a.tz, 2.4, W + 0.9, 0x7aff5a); break;
      case 'circulo': {
        a.spots = [[a.tx, a.tz]];
        for (let i = 0; i < (S.count || 2); i++) { const ang = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 2.5; a.spots.push([a.tx + Math.cos(ang) * r, a.tz + Math.sin(ang) * r]); }
        for (const [x, z] of a.spots) this.teleCircle(x, z, 2.2, W + 0.8, col);
        break;
      }
      case 'casco': G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 1.6, 0x9fe8ff, 0.4); break;
      case 'invocar': G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 3, col, W); break;
      default: this._warn = W; break;
    }
    if (S.name && this.def.natal) G.ui?.toastSmall?.(`${this.def.name}: ${S.name}!`, 2);
    return true;
  }

  updateSpecial(dt) {
    const G = this.G, P = this.T, a = this.attack, S = this.curSp || this.def.special;
    if (!a || !S) { this.setState('chase'); return 0; }
    a.t += dt;
    const dmg = this.stats.dmg, src = { name: this.def.name, area: this.area, level: this.level };
    if (a.phase === 'windup') {
      if (!['carga', 'rolar', 'salto', 'raizes', 'circulo'].includes(a.sp)) this.yaw = dampAngle(this.yaw, this.yawToPlayer(), a.sp === 'sopro' ? 3 : 7, dt);
      if (a.t >= a.windup) { a.phase = 'act'; a.t = 0; a.yaw = a.sp === 'carga' || a.sp === 'rolar' ? a.yaw : this.yaw; }
      return 0;
    }
    if (a.phase === 'act') {
      const done = this.specialAct(a, S, dmg, src, dt);
      if (done) { a.phase = 'recover'; a.t = 0; }
      return a.moving ? 1 : 0;
    }
    if (a.t >= a.recover) {
      this.attack = null; this.setState('chase');
      if (a.sp === 'casco' && this.distToPlayer() < this.def.range + 2) this.beginAttack();
      else if (a.blocked) this.openPunish(1.4);
      else if (S.punish) this.openPunish(S.punish);
    }
    return 0;
  }

  // ---------- Fases de chefes (campeões de evento, chefes de Fenda e mini-chefes) ----------
  // 66% e 33% de vida: fúria (mais rápido), chama ajudantes e solta uma onda de choque.
  // Durante a luta: marca o chão embaixo de um jogador e explode (fase 2+ marca vários pontos).
  updatePhases(dt) {
    const d = this.def, G = this.G;
    if (!(d.miniboss || d.eventBoss) || this.replica || this.dead || !['chase', 'attack', 'special'].includes(this.state)) return;
    const r = this.hp / this.stats.maxHp, ph = this.phase || 0;
    if ((ph === 0 && r < 0.66) || (ph === 1 && r < 0.33)) this.enterPhase(ph + 1);
    if (d.warden) { this.updateSouls(dt); return; }
    if (d.kingSlime || d.boneLord) return; // o Rei Slime tem os golpes dele (sem as marcas no chão genéricas)
    this.novaCd = (this.novaCd ?? 5) - dt;
    if (this.novaCd <= 0 && !this.novas?.length) {
      this.novaCd = this.phase >= 2 ? 5.5 : this.phase === 1 ? 7 : 9;
      const ps = this.players().filter((Q) => Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 20);
      if (ps.length) {
        const n = this.phase >= 2 ? 3 : 1, rad = 2.6 + (this.phase || 0) * 0.4;
        this.novas = [];
        for (let i = 0; i < n; i++) {
          const Q = ps[i % ps.length], off = i === 0 ? [0, 0] : [Math.cos(i * 2.1) * 4, Math.sin(i * 2.1) * 4];
          const x = Q.pos.x + off[0], z = Q.pos.z + off[1], t = 1.15 + i * 0.25;
          this.novas.push({ x, z, t, r: rad });
          this.teleCircle(x, z, rad, t, 0xff3b2f);
        }
      }
    }
    if (this.novas?.length) {
      for (const N of this.novas) {
        N.t -= dt;
        if (N.t > 0 || N.done) continue;
        N.done = true;
        const y = G.world.groundHeight(N.x, N.z, this.area);
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - N.x, Q.pos.z - N.z) < N.r + 0.3) this.hitP(Q, this.stats.dmg * 1.7, { name: this.def.name, area: this.area, level: this.level });
        G.fx.explosion(N.x, y, N.z, N.r, this.def.glow ?? 0xff7a2a); G.fx.cracks(N.x, y, N.z, [0, 1.6, 3.2, 4.8], N.r, 0xffa040, 2, 0.12);
        G.net?.tele(this.area, 'w', N.x, N.z, N.r, 0.5, this.def.glow ?? 0xff7a2a);
        G.audio?.play?.('slam');
      }
      if (this.novas.every((N) => N.done)) this.novas = null;
    }
  }

  enterPhase(n) {
    const G = this.G, y = this.pos.y;
    this.phase = n;
    this.rage = 1 + 0.15 * n;
    // onda de choque: empurra e machuca quem está colado
    for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 6) this.hitP(Q, this.stats.dmg * 1.2, { name: this.def.name, area: this.area, level: this.level, fx: { slow: [0.5, 2] } });
    G.fx.shock(this.pos.x, y, this.pos.z, 7, 0xff5a3a, 0.5); G.fx.ring(this.pos.x, y, this.pos.z, 6, 0xff5a3a, 0.6); G.fx.beam(this.pos.x, y, this.pos.z, 0xff5a3a, 10, 0.8, 1.6);
    G.net?.tele(this.area, 'w', this.pos.x, this.pos.z, 7, 0.6, 0xff5a3a);
    G.cam?.shake?.(0.35, 0.3); G.audio?.play?.('roar');
    if (Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z) < 40) G.ui.notice(`${this.def.name} entrou em fúria!`);
    if (this.def.warden) { this.summonSouls(n); return; }
    // ajudantes: 2 (fase 1) ou 3 (fase 2) monstros comuns do mesmo tipo do campeão
    const base = this.def.base && ENEMIES[this.def.base] && !ENEMIES[this.def.base].elite ? this.def.base : null;
    // um ajudante por vez (0,3 s entre eles): criar vários monstros no mesmo quadro dava uma travadinha na fúria
    if (base && G.spawnTemporary) for (let i = 0; i < n + 1; i++) {
      const a = i * 2.4 + Math.random(), x = this.pos.x + Math.cos(a) * 3.5, z = this.pos.z + Math.sin(a) * 3.5;
      if (G.world.walkable && !G.world.walkable(x, z, this.area)) continue;
      G.later(0.3 + i * 0.3, () => { if (!this.dead && !this.removed) { const m = G.spawnTemporary(base, Math.max(1, this.level - 2), x, z, this.area); m.minion = true; } });
    }
  }

  // ---------- Lorde dos Ossos: espada giratória (vai e volta), mãos do túmulo, investida de escudo ----------
  tryBone(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.bc || (this.bc = { sword: 3, hands: 6, dash: 9 });
    const now = G.time.t, dtc = now - (this.bcT ?? now); this.bcT = now;
    for (const k in W) W[k] -= dtc * (this.rage || 1);
    const los = G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let kind = null;
    if (W.dash <= 0 && d > 5 && d < 14 && los) kind = 'dash';
    else if (W.sword <= 0 && d > 3.5 && d < 15 && los) kind = 'sword';
    else if (W.hands <= 0 && d < 18) kind = 'hands';
    if (!kind) return false;
    this.yaw = this.yawToPlayer();
    const glow = this.def.glow;
    if (kind === 'sword') {
      W.sword = 8;
      this.attack = { kind: 'throw', ms: 'bsword', t: 0, windup: 0.7, phase: 'windup', recover: 0.3, yaw: this.yaw, hit: new Set() };
      this.teleRect(13, 1.8, 0.7, glow);
    } else if (kind === 'hands') {
      W.hands = 10;
      const spots = [];
      for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 20) spots.push([Q.pos.x, Q.pos.z]);
      for (let i = 0; i < 3 + (this.phase || 0) * 2; i++) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6; spots.push([P.pos.x + Math.cos(a) * r, P.pos.z + Math.sin(a) * r]); }
      this.attack = { kind: 'cast', ms: 'bhands', t: 0, windup: 1.0, phase: 'windup', recover: 0.5, spots };
      for (const [x, z] of spots) this.teleCircle(x, z, 1.9, 1.0, 0xe8e0cc);
    } else {
      W.dash = 11;
      this.attack = { kind: 'charge', ms: 'bdash', t: 0, windup: 0.75, phase: 'windup', recover: 0.5, yaw: this.yaw, hit: new Set(), go: 0 };
      this.teleRect(13, 2.4, 0.75, 0xff5a3a);
    }
    this.setState('special');
    return true;
  }

  // ---------- Cérebros: rajada de 3 investidas seguidas (parece um golpe só) ----------
  tryBrain(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T;
    const now = G.time.t, dtc = now - (this.rcT ?? now); this.rcT = now;
    this.rc = (this.rc ?? 2.5) - dtc * (this.rage || 1);
    if (this.rc > 0 || d < 3 || d > 16 || !G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) return false;
    this.rc = 7;
    this.yaw = this.yawToPlayer();
    this.attack = { kind: 'charge', ms: 'rdash', t: 0, windup: 0.55, phase: 'windup', recover: 0.45, yaw: this.yaw, n: 0, go: 0, gap: 0, hit: new Set() };
    this.teleRect(6.5, 2.2, 0.55, this.def.glow);
    this.setState('special');
    return true;
  }

  // ---------- Rei Slime: super salto e chuva de gosma ----------
  tryKing(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.kc || (this.kc = { slam: 3, spit: 6 });
    const now = G.time.t, dtc = now - (this.kcT ?? now); this.kcT = now;
    for (const k in W) W[k] -= dtc * (this.rage || 1);
    let kind = null;
    if (W.slam <= 0 && d > 3 && d < 16) kind = 'slam';
    else if (W.spit <= 0 && d < 18) kind = 'spit';
    if (!kind) return false;
    this.yaw = this.yawToPlayer();
    if (kind === 'slam') {
      W.slam = 7;
      this.attack = { kind: 'attack', ms: 'kslam', t: 0, windup: 0.8, phase: 'windup', recover: 0.8, sx: this.pos.x, sz: this.pos.z, tx: P.pos.x, tz: P.pos.z };
      this.teleCircle(P.pos.x, P.pos.z, 4.8, 0.8 + 0.75, 0x5fe8a8);
    } else {
      W.spit = 9;
      const spots = [[P.pos.x, P.pos.z]];
      const n = 4 + (this.phase || 0) * 2;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 5; spots.push([P.pos.x + Math.cos(a) * r, P.pos.z + Math.sin(a) * r]); }
      this.attack = { kind: 'attack', ms: 'kspit', t: 0, windup: 0.6, phase: 'windup', recover: 0.6, spots };
      for (const [x, z] of spots) this.teleCircle(x, z, 2.2, 0.6 + 1.0, 0x7aff5a);
    }
    this.setState('special');
    return true;
  }

  // ---------- Yeti: bola de gelo gigante (deixa lento) e salto carregado para a frente ----------
  tryYeti(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.yc || (this.yc = { ball: 2.5, leap: 6 });
    const now = G.time.t, dtc = now - (this.ycT ?? now); this.ycT = now;
    for (const k in W) W[k] -= dtc;
    const los = G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let kind = null;
    // bola de neve: de vez em quando, perto ou longe (antes só longe — e o yeti quase nunca ficava longe)
    if (W.ball <= 0 && d > 2.2 && d < 20 && los) kind = 'ball';
    else if (W.leap <= 0 && d > 6 && d < 14 && los) kind = 'leap';
    if (!kind) return false;
    this.yaw = this.yawToPlayer();
    if (kind === 'ball') {
      W.ball = 6.5 + Math.random() * 3;
      this.attack = { kind: 'cast', ms: 'iceball', t: 0, windup: 1.15, phase: 'windup', recover: 0.5 };
      // arranca uma BOLA DE NEVE do chão na frente dele: ela sai da neve, cresce e sobe para cima da cabeça
      const ball = G.fx.projectileMesh('neve');
      ball.scale.setScalar(0.25); this.attack.ball = ball;
    } else {
      W.leap = 10;
      const dist = Math.min(12, d), tx = this.pos.x + Math.sin(this.yaw) * dist, tz = this.pos.z + Math.cos(this.yaw) * dist;
      this.attack = { kind: 'slam', ms: 'leap', t: 0, windup: 0.9, phase: 'windup', recover: 0.6, sx: this.pos.x, sz: this.pos.z, tx, tz };
      this.teleCircle(tx, tz, 3.4, 0.9 + 0.6, 0x9fe8ff);
    }
    this.setState('special');
    return true;
  }

  // ---------- Titã de Magma (nível 142): giro de espada, bola de fogo, espinhos pretos e fúria ----------
  tryMagma(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.mc || (this.mc = { spin: 4, fire: 2.5, spikes: 7 });
    const now = G.time.t; const dtc = now - (this.mcT ?? now); this.mcT = now;
    for (const k in W) W[k] -= dtc * (this.rage || 1);
    // fúria: com pouca vida fica mais rápido (anda, ataca e recarrega)
    if (!this.mfury && this.hp < this.stats.maxHp * 0.35) {
      this.mfury = true; this.rage = Math.max(this.rage || 1, 1.4);
      G.fx.shock(this.pos.x, this.pos.y, this.pos.z, 6, 0xff6a1a, 0.5); G.audio?.play?.('roar');
      if (Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z) < 40) G.ui.notice(`${this.def.name} entrou em fúria: está mais rápido!`);
    }
    const los = G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let kind = null;
    if (W.spin <= 0 && d < 6) kind = 'spin';
    else if (W.spikes <= 0 && d < 18) kind = 'spikes';
    else if (W.fire <= 0 && d > 5 && d < 22 && los) kind = 'fire';
    if (!kind) return false;
    this.yaw = this.yawToPlayer();
    const glow = this.def.glow ?? 0xff6a1a;
    if (kind === 'spin') {
      W.spin = 11;
      this.attack = { kind: 'slam', ms: 'spin', t: 0, windup: 0.7, phase: 'windup', recover: 0.4, dur: 3, tick: 0 };
      this.teleCircle(this.pos.x, this.pos.z, 4.6, 0.7, glow);
    } else if (kind === 'fire') {
      W.fire = 6.5;
      this.attack = { kind: 'cast', ms: 'fire', t: 0, windup: 0.75, phase: 'windup', recover: 0.5 };
    } else {
      W.spikes = 12;
      const spots = [];
      for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 20) spots.push([Q.pos.x, Q.pos.z]);
      for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 7; spots.push([this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r]); }
      this.attack = { kind: 'slam', ms: 'spikes', t: 0, windup: 1.1, phase: 'windup', recover: 0.6, spots };
      for (const [x, z] of spots) this.teleCircle(x, z, 1.9, 1.1, 0x5a1a0a);
    }
    this.setState('special');
    return true;
  }
  // ---------- Titã de Gelo: 5 pedras de gelo que giram em volta dele e são lançadas em você, uma atrás da outra;
  // e cristais de gelo arrancados do chão numa linha até você (na fúria, também um anel em volta de você) ----------
  tryIceTitan(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.ic || (this.ic = { shards: 3, crystals: 6 });
    const now = G.time.t, dtc = now - (this.icT ?? now); this.icT = now;
    for (const k in W) W[k] -= dtc * (this.rage || 1);
    const los = G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let kind = null;
    if (W.shards <= 0 && d > 3 && d < 24 && los) kind = 'shards';
    else if (W.crystals <= 0 && d < 20) kind = 'crystals';
    if (!kind) return false;
    this.yaw = this.yawToPlayer();
    const champ = !!this.def.eventBoss;
    if (kind === 'shards') {
      W.shards = champ ? 8 : 11;
      // as 5 pedras aparecem girando em volta dele (aviso), depois saem uma a uma
      const orb = new THREE.Group(), list = [];
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(_shardGeo, _shardMat); orb.add(m); list.push(m); }
      orb.position.set(this.pos.x, this.pos.y + this.rig.height * 0.62, this.pos.z);
      G.scene.add(orb);
      this.attack = { kind: 'cast', ms: 'ishards', t: 0, windup: 0.9, phase: 'windup', recover: 0.5, orb, list, n: 0, gap: 0, spin: 0 };
      this.callout('Pedras de Gelo!', 'Ele vai lançar 5 pedras em você: continue se mexendo!');
    } else {
      W.crystals = champ ? 9 : 13;
      const spots = [], yw = this.yaw;
      for (let i = 0; i < 8; i++) { const dd = 2.6 + i * 1.9; spots.push([this.pos.x + Math.sin(yw) * dd, this.pos.z + Math.cos(yw) * dd, 0.95 + i * 0.09]); }
      if ((this.phase || 0) >= 1 || !champ) { // fúria: anel de cristais em volta de você também
        const n = (this.phase || 0) >= 2 ? 7 : 5;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 3.2; spots.push([P.pos.x + Math.cos(a) * r, P.pos.z + Math.sin(a) * r, 1.25]); }
        spots.push([P.pos.x, P.pos.z, 1.45]);
      }
      this.attack = { kind: 'slam', ms: 'icrystal', t: 0, windup: 0.75, phase: 'windup', recover: 0.6, spots: spots.map(([x, z, t]) => ({ x, z, t, done: false })) };
      for (const s of this.attack.spots) this.teleCircle(s.x, s.z, 1.5, s.t, 0x9fe8ff);
    }
    this.setState('special');
    return true;
  }
  updateIceTitan(dt) {
    const G = this.G, a = this.attack, src = { name: this.def.name, area: this.area, level: this.level }, dmg = this.stats.dmg;
    a.t += dt;
    if (a.ms === 'ishards') {
      // pedras girando em volta dele (cada vez mais rápido até sair)
      a.spin += dt * (a.phase === 'windup' ? 2 + a.t * 5 : 7);
      a.orb.position.set(this.pos.x, this.pos.y + this.rig.height * 0.62, this.pos.z);
      a.list.forEach((m, i) => { const ang = a.spin + (i / 5) * Math.PI * 2, r = 2.3; m.position.set(Math.cos(ang) * r, Math.sin(a.spin * 2 + i) * 0.3, Math.sin(ang) * r); m.rotation.y += dt * 4; });
      if (Math.random() < dt * 20) { const m = a.list.find((x) => x.visible); if (m) { const w = m.getWorldPosition(new THREE.Vector3()); G.fx.emit(w.x, w.y, w.z, 0, 0.3, 0, 0x9fe8ff, 0.3, 0.35, 0, 1); } }
      this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 8, dt);
      if (a.phase === 'windup') { if (a.t >= a.windup) { a.phase = 'act'; a.t = 0; } return 0; }
      a.gap -= dt;
      if (a.n < 5 && a.gap <= 0) {
        // lança a próxima pedra (mira onde você vai estar daqui a pouco)
        const P = this.T, m = a.list[a.n], w = m.getWorldPosition(new THREE.Vector3());
        const lead = 0.25, tx = P.pos.x + (P.vel?.x || 0) * lead, tz = P.pos.z + (P.vel?.z || 0) * lead;
        const dx = tx - w.x, dz = tz - w.z, l = Math.hypot(dx, dz) || 1;
        m.visible = false;
        spawnProjectile(G, { scale: this.projScale(), owner: 'enemy', kind: 'cristal', color: 0x9fe8ff, x: w.x, y: w.y, z: w.z, dx: dx / l, dz: dz / l, speed: 20, range: 30, radius: 1.0, dmg: dmg * 0.75, area: this.area, srcName: this.def.name, level: this.level, vy: -Math.max(0, (w.y - P.pos.y - 1) / Math.max(0.3, l / 20)), fx: { slow: [0.7, 1.6] },
          onEnd: (p) => { const gy = G.world.groundHeight(p.x, p.z, this.area); G.fx.burst({ x: p.x, y: gy + 0.6, z: p.z }, { count: 14, color: [0xdff6ff, 0x9fe8ff, 0xffffff], speed: 5, size: 0.35, life: 0.5, gravity: 10, up: 3 }); } });
        G.net?.proj(this.area, w.x, w.y, w.z, dx / l, dz / l, 20, 30, 0, 'cristal', 0x9fe8ff, this.projScale());
        G.audio.play('swing', { vol: 0.7 });
        a.n++; a.gap = 0.32;
      }
      if (a.n >= 5 && a.gap <= -a.recover) { G.scene.remove(a.orb); a.orb = null; this.attack = null; this.setState('chase'); this.openPunish(1.1); }
      return 0;
    }
    if (a.ms === 'icrystal') {
      // batida no chão e os cristais vão saindo em sequência (a linha "corre" até você)
      if (a.phase === 'windup') { if (a.t >= a.windup) { a.phase = 'act'; G.fx.shock(this.pos.x, this.pos.y, this.pos.z, 4, 0x9fe8ff, 0.35); G.audio.play('slam'); G.cam?.shake?.(0.25, 0.2); } return 0; }
      const T = a.t + a.windup;
      for (const s of a.spots) {
        if (s.done || T < s.t) continue;
        s.done = true;
        spikeBurst(G, s.x, s.z, 1.5, this.area, 'gelo');
        G.net?.tele(this.area, 'i', s.x, s.z, 1.5, 1, 0x9fe8ff);
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - s.x, Q.pos.z - s.z) < 1.7) { if (!s.hit) s.hit = new Set(); if (s.hit.has(Q)) continue; s.hit.add(Q); this.hitP(Q, dmg * 1.15, { ...src, fx: { slow: [0.6, 1.8] } }); }
        G.audio.play('quake', { vol: 0.35 });
      }
      if (a.spots.every((s) => s.done) && T > Math.max(...a.spots.map((s) => s.t)) + a.recover) { this.attack = null; this.setState('chase'); this.openPunish(0.9); }
      return 0;
    }
    return 0;
  }

  updateMagma(dt) {
    if (this.attack?.ms === 'ishards' || this.attack?.ms === 'icrystal') return this.updateIceTitan(dt);
    const G = this.G, a = this.attack, y = this.pos.y, glow = this.def.glow ?? 0xff6a1a;
    const src = { name: this.def.name, area: this.area, level: this.level }, dmg = this.stats.dmg;
    a.t += dt;
    if (a.phase === 'windup') {
      if (a.ms === 'fire' || a.ms === 'iceball') this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 8, dt);
      if (a.ms === 'bsword' || a.ms === 'bdash') this.yaw = a.yaw;
      if (a.ms === 'rdash') { a.yaw = dampAngle(a.yaw, this.yawToPlayer(), 6, dt); this.yaw = a.yaw; if (Math.random() < dt * 30) G.fx.emit(this.pos.x, y + 1, this.pos.z, (Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3, this.def.glow, 0.35, 0.4, 0, 1); }
      if (a.ball) { // bola de neve: sai do chão na frente dele (0–40%), depois sobe para cima da cabeça
        const k = Math.min(1, a.t / a.windup), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const gy = G.world.groundHeight(this.pos.x + fx * 1.3, this.pos.z + fz * 1.3, this.area);
        if (k < 0.4) {
          const u = k / 0.4; a.ball.scale.setScalar(0.3 + 0.7 * u);
          a.ball.position.set(this.pos.x + fx * 1.3, gy - 0.3 + 0.6 * u, this.pos.z + fz * 1.3);
          if (Math.random() < dt * 40) G.fx.emit(this.pos.x + fx * 1.3 + (Math.random() - 0.5), gy + 0.2, this.pos.z + fz * 1.3 + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3, Math.random() < 0.5 ? 0xffffff : 0xdff6ff, 0.3, 0.5, 9, 1);
        } else {
          const u = Math.min(1, (k - 0.4) / 0.45), e = u * u * (3 - 2 * u);
          a.ball.scale.setScalar(1 + 0.25 * u);
          a.ball.position.set(this.pos.x + fx * 1.3 * (1 - e), gy + 0.3 + (this.rig.height + 0.9 - 0.3) * e, this.pos.z + fz * 1.3 * (1 - e));
        }
        a.ball.rotation.x += dt * 2.5;
      }
      if (a.ms === 'leap' && Math.random() < dt * 25) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 2, y + 0.1, this.pos.z + (Math.random() - 0.5) * 2, 0, 2, 0, 0xdff6ff, 0.3, 0.4, 0, 1);
      if (a.t < a.windup) return 0;
      a.phase = 'act'; a.t = 0;
      if (a.ms === 'iceball') {
        if (a.ball) { G.fx.remove(a.ball); a.ball = null; }
        const P = this.T, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1, py = y + this.rig.height + 0.9;
        const area = this.area, self = this, sp = 15, vy = Math.min(9, Math.max(2.5, l * 14 / sp / 2 - (py - y - 1) * 0.8));
        spawnProjectile(G, { scale: this.projScale(), owner: 'enemy', kind: 'neve', color: 0xffffff, x: this.pos.x + dx / l, y: py, z: this.pos.z + dz / l, dx: dx / l, dz: dz / l, speed: sp, range: 24, radius: 1.3, dmg: dmg * 1.25, area, srcName: this.def.name, level: this.level, vy, fx: { slow: [0.6, 2.5] },
          onEnd: (p) => { // a bola de neve estoura: neve para todo lado, quem está perto fica lento
            const gy = G.world.groundHeight(p.x, p.z, area);
            G.fx.burst({ x: p.x, y: gy + 0.6, z: p.z }, { count: 34, color: [0xffffff, 0xeef6ff, 0xdff6ff], speed: 7, size: 0.5, life: 0.75, gravity: 12, up: 5 });
            G.fx.dust?.(p.x, gy, p.z, 2.2, 0xf4f8ff, 10);
            G.fx.ring(p.x, gy, p.z, 2.8, 0x9fe8ff, 0.4);
            for (const Q of self.players()) if (Q.alive && Q.area === area && Math.hypot(Q.pos.x - p.x, Q.pos.z - p.z) < 2.8) self.hitP(Q, dmg * 0.4, { ...src, fx: { slow: [0.65, 2] } });
            G.net?.tele(area, 'w', p.x, p.z, 2.8, 0.4, 0x9fe8ff);
          } });
        G.net?.proj(this.area, this.pos.x, py, this.pos.z, dx / l, dz / l, sp, 24, vy, 'neve', 0xffffff, this.projScale());
        G.audio.play('swing', { vol: 0.8 });
        return 0;
      }
      if (a.ms === 'fire') {
        const P = this.T, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1, py = y + 2.4;
        const area = this.area, lv = this.level, name = this.def.name, self = this;
        spawnProjectile(G, { scale: this.projScale(), owner: 'enemy', kind: 'fogo', color: 0xff6a1a, x: this.pos.x + dx / l * 1.5, y: py, z: this.pos.z + dz / l * 1.5, dx: dx / l, dz: dz / l, speed: 15, range: 24, radius: 1.1, dmg: dmg * 1.2, area, srcName: name, level: lv, fx: { dot: [dmg * 0.12, 3, 0xff7a2a] },
          onEnd: (p) => { // explode onde cai: queima quem está perto
            const gy = G.world.groundHeight(p.x, p.z, area);
            G.fx.explosion(p.x, gy, p.z, 3.2, 0xff6a1a, 0.5); G.fx.scorch(p.x, gy, p.z, 2, 0xff6a20, 4); G.audio.play('explosion', { vol: 0.6 });
            for (const Q of self.players()) if (Q.alive && Q.area === area && Math.hypot(Q.pos.x - p.x, Q.pos.z - p.z) < 3.2) self.hitP(Q, dmg * 0.7, { ...src, fx: { dot: [dmg * 0.1, 3, 0xff7a2a] } });
            G.net?.tele(area, 'w', p.x, p.z, 3.2, 0.5, 0xff6a1a);
          } });
        G.net?.proj(this.area, this.pos.x, py, this.pos.z, dx / l, dz / l, 15, 24, 0, 'fogo', 0xff6a1a, this.projScale());
        G.fx.burst({ x: this.pos.x, y: py, z: this.pos.z }, { count: 14, color: [0xff6a1a, 0xffd24a], speed: 4, size: 0.4, life: 0.4, gravity: 0, up: 1 });
        G.audio.play('cast', { vol: 0.7 });
      } else if (a.ms === 'spikes') {
        for (const [x, z] of a.spots) { spikeBurst(G, x, z, 1.9, this.area); G.net?.tele(this.area, 'k', x, z, 1.9, 1, 0x15100e); }
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && a.spots.some(([x, z]) => Math.hypot(Q.pos.x - x, Q.pos.z - z) < 2.1)) this.hitP(Q, dmg * 1.15, { ...src, fx: { root: 0.6 } });
        G.audio.play('quake', { vol: 0.6 }); G.cam?.shake?.(0.25, 0.2);
      }
      return 0;
    }
    if (a.phase === 'act' && a.ms === 'bsword') {
      // a espada voa girando 13 m e volta para a mão (acerta na ida e na volta)
      const T = 1.4, k = Math.min(1, a.t / T), out = k < 0.5 ? k / 0.5 : (1 - k) / 0.5, dist = 13 * Math.sin(out * Math.PI / 2);
      const sx = this.pos.x + Math.sin(a.yaw) * dist, sz = this.pos.z + Math.cos(a.yaw) * dist;
      if (this.rig.sword) this.rig.sword.visible = false;
      G.fx.slash(sx, y + 1.3, sz, a.t * 25, 1.6, 360, this.def.glow, 0.12);
      if (Math.random() < 0.6) G.fx.emit(sx, y + 1.3, sz, 0, 0.5, 0, this.def.glow, 0.35, 0.3, 0, 2);
      const back = k >= 0.5;
      for (const Q of this.players()) {
        const key = (back ? 'b' : 'f') + (Q.peer || 'me');
        if (!Q.alive || Q.area !== this.area || a.hit.has(key) || Math.hypot(Q.pos.x - sx, Q.pos.z - sz) > 1.8) continue;
        a.hit.add(key); this.hitP(Q, dmg * 0.9, src);
      }
      if (Math.floor(a.t * 8) !== Math.floor((a.t - dt) * 8)) G.audio.play('swing', { vol: 0.5 });
      if (k >= 1) { if (this.rig.sword) this.rig.sword.visible = true; this.attack = null; this.setState('chase'); }
      return 0;
    }
    if (a.phase === 'act' && a.ms === 'bhands') {
      if (!a.done) {
        a.done = true;
        for (const [x, z] of a.spots) { spikeBurst(G, x, z, 1.9, this.area, true); G.net?.tele(this.area, 'b', x, z, 1.9, 1, 0xe8e0cc); }
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && a.spots.some(([x, z]) => Math.hypot(Q.pos.x - x, Q.pos.z - z) < 2.1)) this.hitP(Q, dmg * 1.1, { ...src, fx: { root: 1.0 } });
        G.audio.play('rattle'); G.audio.play('quake', { vol: 0.5 });
      }
      if (a.t >= a.recover) { this.attack = null; this.setState('chase'); }
      return 0;
    }
    if (a.phase === 'act' && a.ms === 'bdash') {
      // investida com o escudo: corre reto, derruba quem estiver no caminho e para se bater em algo
      const st = 18 * dt; this.yaw = a.yaw;
      const ok = G.world.tryMove(this.pos, Math.sin(a.yaw) * st, Math.cos(a.yaw) * st, this.radius, this.area);
      a.go += st;
      for (const Q of this.players()) if (Q.alive && Q.area === this.area && !a.hit.has(Q) && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 2.2) { a.hit.add(Q); this.hitP(Q, dmg * 1.4, { ...src, fx: { slow: [0.4, 1.2] } }); G.cam?.shake?.(0.3, 0.2); }
      G.fx.emit(this.pos.x, y + 0.3, this.pos.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0xb8a68a, 0.8, 0.6, -0.3, 2);
      if (!ok || a.go >= 13) { this.attack = null; this.setState('chase'); if (!ok) { G.fx.ring(this.pos.x, y, this.pos.z, 2.5, 0xffd36b, 0.3); G.audio.play('slam'); this.openPunish(1.8); } }
      return 1;
    }
    if (a.phase === 'act' && a.ms === 'rdash') {
      // 3 investidas coladas: cada uma corre ~6 m e já mira de novo no herói, sem parar
      if (a.gap > 0) { a.gap -= dt; return 0; }
      const st = 30 * dt; this.yaw = a.yaw;
      const ok = G.world.tryMove(this.pos, Math.sin(a.yaw) * st, Math.cos(a.yaw) * st, this.radius, this.area);
      a.go += st;
      for (const Q of this.players()) {
        const key = a.n + (Q.peer || 'me');
        if (!Q.alive || Q.area !== this.area || a.hit.has(key) || Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) > 1.4 + this.radius) continue;
        a.hit.add(key); this.hitP(Q, dmg * 0.85, a.n === 2 ? { ...src, fx: { slow: [0.4, 1] } } : src); G.cam?.shake?.(0.15, 0.12);
      }
      G.fx.emit(this.pos.x, y + 1.1, this.pos.z, 0, 0.3, 0, this.def.glow, 0.6, 0.35, 0, 2);
      if (Math.random() < 0.5) G.fx.emit(this.pos.x, y + 1.1, this.pos.z, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 0xffffff, 0.3, 0.3, 0, 1);
      if (!ok || a.go >= 6) {
        a.n++; a.go = 0;
        G.audio.play('swing', { vol: 0.6 });
        if (a.n >= 3) { this.attack = null; this.setState('chase'); this.openPunish(0.9); return 1; }
        // mira de novo e emenda na hora (pausa quase imperceptível)
        a.yaw = this.yawToPlayer(); a.gap = 0.07;
        this.teleRect(6, 2, 0.12, this.def.glow, a.yaw);
      }
      return 1;
    }
    if (a.phase === 'act' && a.ms === 'kslam') {
      // super salto: sobe bem alto e cai em cima do lugar marcado
      const k = Math.min(1, a.t / 0.75), nx = a.sx + (a.tx - a.sx) * k, nz = a.sz + (a.tz - a.sz) * k;
      if (G.world.walkable(nx, nz, this.area)) { this.pos.x = nx; this.pos.z = nz; }
      if (k >= 1 && !a.landed) {
        a.landed = true;
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - a.tx, Q.pos.z - a.tz) < 5) this.hitP(Q, dmg * 1.6, { ...src, fx: { slow: [0.5, 1.6] } });
        G.fx.shock(a.tx, this.pos.y, a.tz, 6.5, 0x5fe8a8, 0.45); G.fx.ring(a.tx, this.pos.y, a.tz, 5, 0xffffff, 0.35);
        G.fx.burst({ x: a.tx, y: this.pos.y + 0.5, z: a.tz }, { count: 30, color: [0x5fe8a8, 0x2c9a64, 0xffffff], speed: 8, size: 0.45, life: 0.6, gravity: 12, up: 6 });
        G.audio.play('squelch'); G.audio.play('slam'); G.cam?.shake?.(0.4, 0.28);
        G.net?.tele(this.area, 'w', a.tx, a.tz, 5, 0.5, 0x5fe8a8);
      }
      if (a.t >= 0.75 + a.recover) { this.attack = null; this.setState('chase'); this.openPunish(1.3); }
      return k < 1 ? 1 : 0;
    }
    if (a.phase === 'act' && a.ms === 'kspit') {
      // bolas de gosma em arco caindo nos círculos (deixam lento)
      if (!a.thrown) { a.thrown = true; for (let i = 0; i < 18; i++) G.fx.emit(this.pos.x, y + this.rig.height, this.pos.z, (Math.random() - 0.5) * 6, 9 + Math.random() * 4, (Math.random() - 0.5) * 6, 0x5fe8a8, 0.5, 0.9, 18, 0); G.audio.play('squelch'); }
      if (a.t >= 1.0 && !a.landed) {
        a.landed = true;
        for (const [x, z] of a.spots) { const gy = G.world.groundHeight(x, z, this.area); G.fx.explosion(x, gy, z, 2.2, 0x5fe8a8, 0.4); G.fx.burst({ x, y: gy + 0.3, z }, { count: 10, color: [0x5fe8a8, 0x2c9a64], speed: 4, size: 0.3, life: 0.5, gravity: 10, up: 3 }); G.net?.tele(this.area, 'w', x, z, 2.2, 0.4, 0x5fe8a8); }
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && a.spots.some(([x, z]) => Math.hypot(Q.pos.x - x, Q.pos.z - z) < 2.4)) this.hitP(Q, dmg * 1.1, { ...src, fx: { slow: [0.45, 2.5] } });
        G.audio.play('squelch');
      }
      if (a.t >= 1.0 + a.recover) { this.attack = null; this.setState('chase'); }
      return 0;
    }
    if (a.phase === 'act' && a.ms === 'leap') {
      // salto carregado: voa em arco até o ponto marcado e cai esmagando (gelo deixa lento)
      const k = Math.min(1, a.t / 0.7), nx = a.sx + (a.tx - a.sx) * k, nz = a.sz + (a.tz - a.sz) * k;
      if (G.world.walkable(nx, nz, this.area)) { this.pos.x = nx; this.pos.z = nz; }
      if (k >= 1 && !a.landed) {
        a.landed = true;
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - a.tx, Q.pos.z - a.tz) < 3.6) this.hitP(Q, dmg * 1.5, { ...src, fx: { slow: [0.55, 2] } });
        G.fx.shock(a.tx, this.pos.y, a.tz, 5, 0x9fe8ff, 0.4); G.fx.cracks(a.tx, this.pos.y, a.tz, [0, 1.3, 2.6, 3.9, 5.2], 3.4, 0x9fe8ff, 2, 0.12);
        G.fx.dust(a.tx, this.pos.y, a.tz, 3.2, 0xdce8f0, 16); G.audio.play('slam'); G.cam?.shake?.(0.3, 0.22);
        G.net?.tele(this.area, 'w', a.tx, a.tz, 3.6, 0.5, 0x9fe8ff);
      }
      if (a.t >= 0.7 + a.recover) { this.attack = null; this.setState('chase'); this.openPunish(1.0); }
      return k < 1 ? 1 : 0;
    }
    if (a.phase === 'act' && a.ms === 'spin' && a.t < a.dur) {
      // gira a espadona por 3 s: anda devagar atrás do alvo e corta tudo em volta
      a.spinY = (a.spinY ?? this.yaw) + dt * 13;
      this.yaw = a.spinY;
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick = 0.4;
        G.fx.slash(this.pos.x, y + 1.6, this.pos.z, this.yaw, 4.6, 360, glow, 0.3);
        for (let i = 0; i < 6; i++) { const ang = Math.random() * Math.PI * 2; G.fx.emit(this.pos.x + Math.cos(ang) * 4, y + 1.2, this.pos.z + Math.sin(ang) * 4, Math.cos(ang) * 3, 1.5, Math.sin(ang) * 3, Math.random() < 0.5 ? 0xff6a1a : 0xffd24a, 0.4, 0.4, 2, 1); }
        for (const Q of this.players()) if (Q.alive && Q.area === this.area && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 4.6) this.hitP(Q, dmg * 0.5, { ...src, fx: { dot: [dmg * 0.08, 2, 0xff7a2a] } });
        G.net?.tele(this.area, 'w', this.pos.x, this.pos.z, 4.6, 0.35, glow);
        G.audio.play('swing', { vol: 0.8 });
      }
      const P = this.T, mv = this.moveToward(P.pos.x, P.pos.z, 0.45, dt);
      this.yaw = a.spinY; // andar não desfaz o giro
      return mv;
    }
    if (a.t >= (a.ms === 'spin' ? a.dur + a.recover : a.recover)) { this.attack = null; this.setState('chase'); if (a.ms === 'spin') this.openPunish(1.2); }
    return 0;
  }

  // ---------- O Vigia (chefe da Cripta) ----------
  // Correntes: linha marcada no chão; quem ficar nela é preso e puxado para perto da alabarda.
  // Olhar da Lanterna: 2,6 s de aviso; acerta todo mundo que ele ENXERGA (coluna na frente protege).
  // Almas (66% e 33%): almas acorrentadas protegem o Vigia; destruí-las abre uma brecha de 3,5 s.
  callout(title, text) {
    const G = this.G, P = G.player;
    if (P.area === this.area && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 45) G.ui.notice(`${title} ${text}`);
    G.net?.say?.(this.area, title, text, this.pos.x, this.pos.z);
  }
  tryWarden(d) {
    if (this.replica) return false;
    const G = this.G, P = this.T, W = this.wc || (this.wc = { corrente: 5, olhar: 11 });
    const los = G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    let kind = null;
    if (W.olhar <= 0 && d < 26) kind = 'olhar';
    else if (W.corrente <= 0 && d > 4 && d < 14 && los) kind = 'corrente';
    if (!kind) return false;
    const rage = this.phase || 0;
    this.yaw = this.yawToPlayer();
    if (kind === 'olhar') {
      W.olhar = 17 - rage * 2.5;
      this.attack = { kind: 'cast', ws: 'olhar', t: 0, windup: 2.6, phase: 'windup', recover: 0.8, hit: new Set() };
      this.teleCircle(this.pos.x, this.pos.z, 26, 2.6, this.def.glow);
      this.callout('Olhar da Lanterna!', 'Esconda-se atrás de uma coluna!');
      this.G.audio.play('roar', { vol: 0.6 });
    } else {
      W.corrente = 7.5 - rage * 1.2;
      this.attack = { kind: 'throw', ws: 'corrente', t: 0, windup: 0.85, phase: 'windup', recover: 0.45, hit: new Set(), yaw: this.yaw };
      this.teleRect(15, 1.5, 0.85, this.def.glow);
    }
    this.setState('special');
    return true;
  }
  updateWarden(dt) {
    const G = this.G, a = this.attack, y = this.pos.y, glow = this.def.glow;
    if (!a || !a.ws) { this.setState('chase'); return 0; }
    a.t += dt;
    const src = { name: this.def.name, area: this.area, level: this.level }, dmg = this.stats.dmg;
    if (a.phase === 'windup') {
      if (a.ws === 'olhar') {
        if (this.rig.soul) this.rig.soul.scale.setScalar(1 + a.t * 0.8);
        if (Math.random() < dt * 30) G.fx.emit(this.pos.x + (Math.random() - 0.5) * 2, y + 2.4, this.pos.z + (Math.random() - 0.5) * 2, 0, 1.5, 0, glow, 0.5, 0.6, 0, 1);
      } else this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 2.5, dt);
      if (a.t >= a.windup) { a.phase = 'act'; a.t = 0; this.wardenStrike(a, dmg, src); }
      return 0;
    }
    if (a.phase === 'act' && a.t >= a.recover) {
      if (this.rig.soul) this.rig.soul.scale.setScalar(1);
      this.attack = null; this.atkCd = 0; this.setState('chase');
    }
    return 0;
  }
  wardenStrike(a, dmg, src) {
    const G = this.G, y = this.pos.y, glow = this.def.glow;
    if (a.ws === 'olhar') {
      // luz forte da lanterna: quem estiver à vista leva o golpe; atrás de coluna fica protegido
      G.fx.shock(this.pos.x, y, this.pos.z, 26, glow, 0.6); G.fx.beam(this.pos.x, y, this.pos.z, glow, 14, 1.2, 0.8);
      G.cam?.shake?.(0.3, 0.25); G.audio.play('explosion', { vol: 0.7 });
      for (const Q of this.players()) {
        if (!Q.alive || Q.area !== this.area || Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) > 26.5) continue;
        if (G.world.lineOfSight(this.pos.x, this.pos.z, Q.pos.x, Q.pos.z)) {
          this.hitP(Q, dmg * 2.1, { ...src, fx: { slow: [0.5, 2.2] } });
          G.fx.burst({ x: Q.pos.x, y: (Q.pos.y || y) + 1, z: Q.pos.z }, { count: 14, color: [glow, 0xffffff], speed: 5, size: 0.3, life: 0.4, gravity: 0, up: 1 });
        } else if (Q === G.player) G.ui.damageNumber(Q.pos.x, Q.pos.y + 2.4, Q.pos.z, 'Protegido!', 'miss');
      }
      return;
    }
    // correntes: acerta quem está na linha e puxa para a frente do Vigia
    const fx0 = this.pos.x + Math.sin(this.yaw) * 2.6, fz0 = this.pos.z + Math.cos(this.yaw) * 2.6;
    for (let k = 1; k <= 14; k++) G.fx.emit(this.pos.x + Math.sin(a.yaw) * k, y + 1.1, this.pos.z + Math.cos(a.yaw) * k, 0, 0.3, 0, k % 2 ? 0x8a8698 : glow, 0.35, 0.45, 0, 1);
    G.audio.play('swing');
    for (const Q of this.players()) {
      if (!Q.alive || Q.area !== this.area || !this.inRect(Q, 15, 0.8)) continue;
      this.hitP(Q, dmg * 0.9, { ...src, fx: { root: 0.7, pull: [Math.round(fx0 * 10) / 10, Math.round(fz0 * 10) / 10] } });
    }
  }
  summonSouls(n) {
    const G = this.G, hx = this.home.x, hz = this.home.z;
    const spots = n >= 2 ? [[-12, 14], [12, 14], [-24, 0], [24, 0], [0, -12]] : [[-12, 14], [12, 14], [0, -12]];
    this.clearSouls();
    this.souls = [];
    for (const [ox, oz] of spots) {
      const x = hx + ox, z = hz + oz;
      if (!G.world.walkable(x, z, this.area)) continue;
      const e = G.spawnTemporary?.('alma_acorrentada', this.level, x, z, this.area);
      if (e) { e.minion = true; this.souls.push(e); }
    }
    if (this.souls.length) { this.wardShield = true; this.callout('Almas acorrentadas!', 'Destrua as almas para quebrar a proteção do Vigia.'); }
  }
  updateSouls(dt) {
    const W = this.wc || (this.wc = { corrente: 5, olhar: 11 });
    W.corrente -= dt; W.olhar -= dt;
    if (!this.souls) return;
    const G = this.G, alive = this.souls.filter((e) => !e.dead);
    // correntes de luz ligando cada alma ao Vigia
    this.tetherT = (this.tetherT || 0) - dt;
    if (this.tetherT <= 0 && this.area === G.player.area) {
      this.tetherT = 0.08;
      for (const e of alive) { const k = Math.random(); G.fx.emit(e.pos.x + (this.pos.x - e.pos.x) * k, 1.2 + k * 1.2, e.pos.z + (this.pos.z - e.pos.z) * k, 0, 0, 0, this.def.glow, 0.3, 0.35, 0, 1); }
    }
    if (!alive.length) {
      this.souls = null; this.wardShield = false;
      this.openPunish(3.5);
      G.fx.shock(this.pos.x, this.pos.y, this.pos.z, 6, this.def.glow, 0.5);
      this.callout('A proteção quebrou!', 'O Vigia está atordoado: ataque agora!');
    }
  }
  clearSouls() {
    for (const e of this.souls || []) if (!e.dead) { e.dead = true; e.deadT = 1.2; e.setState('dead', 0); }
    this.souls = null; this.wardShield = false;
  }

  // quem está à frente (num cone) ou dentro de um retângulo/círculo
  inCone(Q, range, halfAng) { const dx = Q.pos.x - this.pos.x, dz = Q.pos.z - this.pos.z, d = Math.hypot(dx, dz); return d <= range + (Q.radius || 0.5) && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < halfAng; }
  inRect(Q, len, halfW) { const dx = Q.pos.x - this.pos.x, dz = Q.pos.z - this.pos.z, f = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw), s = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw); return f > -0.5 && f < len && Math.abs(s) < halfW + (Q.radius || 0.5) * 0.5; }

  specialAct(a, S, dmg, src, dt) {
    const G = this.G, y = this.pos.y;
    const each = (fn) => { for (const Q of this.players()) { if (!Q.alive || Q.area !== this.area || a.hit.has(Q)) continue; if (fn(Q)) a.hit.add(Q); } };
    const fwd = (k) => [this.pos.x + Math.sin(this.yaw) * k, this.pos.z + Math.cos(this.yaw) * k];
    switch (a.sp) {
      case 'ferroada': { // ferrão: golpe curto à frente que envenena
        each((Q) => this.inCone(Q, 3.6, 0.7) && (this.hitP(Q, dmg * 1.15, { ...src, fx: { dot: [dmg * 0.14, 4, 0x7aff5a] } }), true));
        const [fx, fz] = fwd(2); G.fx.burst({ x: fx, y: y + 1, z: fz }, { count: 12, color: [0x7aff5a, 0xffffff], speed: 4, size: 0.25, life: 0.35, gravity: 4, up: 1 });
        G.fx.slash(this.pos.x, y + 1, this.pos.z, this.yaw, 3.4, 50, 0x7aff5a, 0.2); G.audio.play('swing');
        return true;
      }
      case 'teia': { // teia: projétil branco que deixa lento
        const P = this.T, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        spawnProjectile(G, { scale: this.projScale(), owner: 'enemy', kind: 'arcano', color: 0xf2f2ff, x: this.pos.x, y: y + 0.8, z: this.pos.z, dx: dx / l, dz: dz / l, speed: 17, range: 15, radius: 0.7, dmg: dmg * 0.45, area: this.area, srcName: this.def.name, level: this.level, fx: { slow: [0.4, 2.6] } });
        G.net?.proj(this.area, this.pos.x, y + 0.8, this.pos.z, dx / l, dz / l, 17, 15, 0, 'arcano', 0xf2f2ff, this.projScale());
        return true;
      }
      case 'lanca': { // estocada longa
        each((Q) => this.inRect(Q, 5, 0.65) && (this.hitP(Q, dmg * 1.25, src), true));
        G.fx.slash(this.pos.x, y + 1.1, this.pos.z, this.yaw, 5, 18, 0xffe2a0, 0.18); G.audio.play('swing');
        return true;
      }
      case 'patada': { // fica de pé e bate no chão: área + atordoa um pouco
        const r = S.radius || 4;
        each((Q) => Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < r + 0.4 && (this.hitP(Q, dmg * 1.5, { ...src, fx: { slow: [0.45, 1.4] } }), true));
        G.fx.shock(this.pos.x, y, this.pos.z, r * 1.3, 0xdff6ff, 0.4); G.fx.cracks(this.pos.x, y, this.pos.z, [0, 1.3, 2.6, 3.9, 5.2], r, 0x9fe8ff, 2, 0.12);
        G.fx.dust(this.pos.x, y, this.pos.z, r, 0xdce8f0, 14); G.audio.play('slam'); G.cam.shake(0.25, 0.2);
        return true;
      }
      case 'carga': case 'rolar': { // investida em linha reta (o besouro rola em brasa)
        a.moving = true;
        const sp = S.speed || 15, st = sp * dt;
        this.yaw = a.yaw;
        const ok = G.world.tryMove(this.pos, Math.sin(a.yaw) * st, Math.cos(a.yaw) * st, this.radius, this.area);
        a.traveled += st;
        const burn = a.sp === 'rolar';
        each((Q) => Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 1.7 && (this.hitP(Q, dmg * (S.mult || 1.3), burn ? { ...src, fx: { dot: [dmg * 0.12, 3, 0xff7a2a] } } : src), true));
        G.fx.emit(this.pos.x, y + 0.3, this.pos.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, burn ? 0xff7a2a : 0xb8a68a, burn ? 0.5 : 0.9, 0.6, -0.3, 2);
        if (!ok || a.traveled >= (S.dist || 13)) { a.moving = false; if (!ok) { a.blocked = true; G.fx.ring(this.pos.x, y, this.pos.z, 2.5, 0xffd36b, 0.3); G.audio.play('slam'); } return true; }
        return false;
      }
      case 'salto': { // salta e cai em cima do alvo marcado
        const k = Math.min(1, a.t / 0.55);
        const nx = a.sx + (a.tx - a.sx) * k, nz = a.sz + (a.tz - a.sz) * k;
        if (G.world.walkable(nx, nz, this.area)) { this.pos.x = nx; this.pos.z = nz; }
        a.moving = true;
        if (k >= 1) {
          a.moving = false;
          each((Q) => Math.hypot(Q.pos.x - a.tx, Q.pos.z - a.tz) < 2.9 && (this.hitP(Q, dmg * (S.mult || 1.35), src), true));
          G.fx.shock(a.tx, this.pos.y, a.tz, 4, 0x7affb0, 0.35); G.fx.cracks(a.tx, this.pos.y, a.tz, [0, 1.6, 3.2, 4.8], 2.6, 0x7affb0, 1.6, 0.1); G.fx.dust(a.tx, this.pos.y, a.tz, 2.4, 0xb8a68a, 12);
          G.audio.play('slam'); return true;
        }
        return false;
      }
      case 'sopro': { // sopro de fogo em cone por 1,2 s
        a.tick = (a.tick || 0) - dt;
        for (let i = 0; i < 4; i++) { const ang = this.yaw + (Math.random() - 0.5) * 0.9, sp = 7 + Math.random() * 4; G.fx.emit(this.pos.x + Math.sin(this.yaw) * 0.8, y + 0.6, this.pos.z + Math.cos(this.yaw) * 0.8, Math.sin(ang) * sp, 0.6 + Math.random(), Math.cos(ang) * sp, Math.random() < 0.5 ? 0xff7a2a : 0xffd36b, 0.55, 0.55, -0.5, 1); }
        if (a.tick <= 0) {
          a.tick = 0.25; a.hit.clear();
          each((Q) => this.inCone(Q, 6.2, 0.5) && (this.hitP(Q, dmg * 0.28, { ...src, fx: { dot: [dmg * 0.1, 2.5, 0xff7a2a] } }), true));
        }
        return a.t >= 1.2;
      }
      case 'casco': { // fecha o casco: leva 75% menos dano por 2,2 s e depois revida
        if (a.t < dt * 1.5) this.shellT = 2.2;
        this.shellT = Math.max(0, this.shellT - dt);
        if (Math.random() < dt * 6) G.fx.ring(this.pos.x, y, this.pos.z, 1.4, 0x9fe8ff, 0.3);
        return this.shellT <= 0;
      }
      case 'raizes': { // raízes saem do chão no lugar marcado e prendem
        if (a.t < 0.9) return false;
        each((Q) => Math.hypot(Q.pos.x - a.tx, Q.pos.z - a.tz) < 2.6 && (this.hitP(Q, dmg * 0.9, { ...src, fx: { root: 1.6 } }), true));
        const gy = G.world.groundHeight(a.tx, a.tz, this.area);
        G.fx.cracks(a.tx, gy, a.tz, [0, 1, 2, 3, 4, 5], 2.4, 0x7aff5a, 2, 0.12);
        G.fx.burst({ x: a.tx, y: gy + 0.3, z: a.tz }, { count: 22, color: [0x5a4a2e, 0x7aff5a], speed: 5, size: 0.4, life: 0.6, gravity: 10, up: 6 });
        G.audio.play('quake', { vol: 0.5 });
        return true;
      }
      case 'circulo': { // círculos mágicos explodem no chão (fogo queima, gelo/arcano deixa lento)
        if (a.t < 0.8) return false;
        const fire = S.element === 'fogo', col = S.color ?? 0xff6a2a;
        for (const [x, z] of a.spots) {
          const gy = G.world.groundHeight(x, z, this.area);
          G.fx.explosion(x, gy, z, 2.2, col, 0.45);
          if (fire) G.fx.scorch(x, gy, z, 1.4, col, 3);
        }
        each((Q) => a.spots.some(([x, z]) => Math.hypot(Q.pos.x - x, Q.pos.z - z) < 2.4) && (this.hitP(Q, dmg * 1.0, { ...src, fx: fire ? { dot: [dmg * 0.12, 3, col] } : S.element === 'veneno' ? { dot: [dmg * 0.1, 4, col] } : { slow: [0.5, 2] } }), true));
        G.audio.play('explosion', { vol: 0.6 });
        return true;
      }
      case 'invocar': { // chama mini bonecos de neve em volta (um por vez, para não travar)
        const n = S.count || 2, type = this.def.base || 'mini_boneco';
        G.fx.burst({ x: this.pos.x, y: y + 1.2, z: this.pos.z }, { count: 20, color: [0xffffff, 0x9fe8ff], speed: 5, size: 0.35, life: 0.7, gravity: 3, up: 3 });
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + Math.random(), x = this.pos.x + Math.cos(ang) * 3.5, z = this.pos.z + Math.sin(ang) * 3.5;
          if (G.world.walkable && !G.world.walkable(x, z, this.area)) continue;
          G.later(0.15 + i * 0.25, () => { if (this.dead || this.removed || !G.spawnTemporary) return; const m = G.spawnTemporary(type, Math.max(1, this.level - 3), x, z, this.area); m.summoner = this; m.minion = true; });
        }
        G.audio.play('portal', { vol: 0.5 });
        return true;
      }
      default: return true;
    }
  }

  // Brecha: depois de um combo (ou de errar uma investida) o inimigo fica exausto — hora do contra-ataque
  openPunish(dur) {
    const G = this.G;
    this.punishT = dur; this.stun = Math.max(this.stun, dur); this.attack = null; this.comboLeft = 0;
    if (this.state === 'attack') this.setState('chase');
    G.ui.damageNumber(this.pos.x, this.pos.y + this.rig.height + 0.8, this.pos.z, 'BRECHA!', 'crit');
    G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 2.2, 0xffd36b, 0.4);
  }

  // ---------- ataque básico à distância dos chefes ----------
  // Chefe corpo a corpo não fica parado olhando quem ataca de longe: a cada ~2,8 s (um pouco menos na fúria)
  // atira um golpe básico lento e fácil de desviar (60% do dano dele), do jeito do chefe.
  bossShotOk(d) {
    const def = this.def;
    if (def.ranged || def.boss || !(def.miniboss || def.eventBoss) || this.shotCd > 0 || this.atkCd > 0.8) return false;
    if (d <= def.range + (this.T.radius || 0.5) + 1.2 || d > 15) return false;
    const P = this.T;
    return this.G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
  }
  // tamanho dos tiros: proporcional à altura de quem atira (goblin = pedrinha, colosso = pedregulho)
  projScale() { const h = this.rig?.height || 1.9; return Math.max(0.8, Math.min(3.6, h / 2.1)); }
  shotStyle() {
    const d = this.def;
    if (this.type === 'noel') return { proj: 'presente', speed: 14, color: 0xd8283a };
    if (this.type === 'boneco_neve') return { proj: 'neve', speed: 14, color: 0xffffff };
    if (this.type === 'rena_maligna') return { proj: 'arcano', speed: 15, color: 0xff2a2a };
    if (d.iceTitan || /gelo/.test(this.type)) return { proj: 'cristal', speed: 14, color: 0x9fe8ff };
    if (d.magmaSkills || /magma|brasa/.test(this.type)) return { proj: 'fogo', speed: 13, color: 0xff7a2a };
    if (d.model === 'goblin' || /goblin|minotauro|colosso/.test(this.type)) return { proj: 'pedra', speed: 15 };
    if (d.model === 'slime' || d.kingSlime || /gosma|abissal/.test(this.type)) return { proj: 'arcano', speed: 13, color: 0x7aff5a };
    return { proj: 'arcano', speed: 14, color: d.glow ?? d.champLook?.glow ?? 0xff4fd8 };
  }
  beginBossShot() {
    this.shotCd = 2.8;
    this.attack = { kind: 'throw', t: 0, windup: 0.55, phase: 'windup', recover: 0.35, struck: false, radius: 0, mul: 0.6, bshot: true };
    this.setState('attack');
  }

  // golens: além do pisão no chão, arremessam pedra de longe e dão investida (cada um com sua recarga)
  tryGolem(d) {
    const G = this.G, P = this.T, now = G.time.t;
    if (!P.alive || P.area !== this.area) return false;
    if (this._gHurl == null) { this._gHurl = now + 2 + Math.random() * 3; this._gCharge = now + 4 + Math.random() * 4; }
    const los = () => G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z);
    if (now >= this._gCharge && d > 5 && d < 11 && los()) {
      this._gCharge = now + 9 + Math.random() * 4;
      this.yaw = this.yawToPlayer();
      this.attack = { kind: 'charge', gk: 'charge', t: 0, windup: 0.75, phase: 'windup', recover: 0.55, struck: false, mul: 1.2, go: 0 };
      G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 2.2, 0xff3b2f, 0.75);
      this.setState('attack');
      return true;
    }
    if (now >= this._gHurl && d > 6 && d < 18 && los()) {
      this._gHurl = now + 6 + Math.random() * 4;
      this.attack = { kind: 'throw', gk: 'hurl', t: 0, windup: 0.85, phase: 'windup', recover: 0.5, struck: false, mul: 0.9 };
      this.setState('attack');
      return true;
    }
    return false;
  }

  beginAttack(o = {}) {
    const def = this.def;
    if (!o.chain) this.comboLeft = (def.combo || 1) - 1;
    const rk = this.rig.kind;
    let kind = rk === 'golem' ? 'slam' : def.ranged ? 'throw' : def.slam ? 'slam' : rk === 'slime' || rk === 'wolf' ? 'attack' : 'slash';
    let windup = o.windup ?? def.windup;
    let radius = def.slam?.radius || 0;
    let anim = null;
    // golem: socos (direita/esquerda) e o pisão; no combo soca e fecha com o pisão pesado
    if (rk === 'golem' && !this.boss && !def.warden) {
      if (o.chain) kind = o.heavy ? 'slam' : 'swipe';
      else if (Math.random() < 0.6) { kind = 'swipe'; windup *= 0.7; }
      if (kind === 'swipe') { this._sw = !this._sw; anim = this._sw ? 'swipe2' : 'swipe'; }
      if (kind === 'slam' && !radius) radius = 3.5;
    }
    if (def.miniboss) {
      this.miniCount++;
      if (this.miniCount % 3 === 0) { if (def.warden) { kind = 'slam'; windup = 1.0; radius = 4.8; } else { kind = 'shock'; windup = 1.25; radius = 7.5; } }
    }
    this.atkN = (this.atkN || 0) + 1; // cada golpe do combo usa uma animação diferente
    this.attack = { kind, anim, var: this.atkN, t: 0, windup, phase: 'windup', recover: o.chain ? 0.22 : 0.35, struck: false, radius, mul: o.mul || 1, heavy: !!o.heavy, combo: !!o.chain || (def.combo || 1) > 1 };
    if (o.heavy) { this.G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 1.8, 0xff3b2f, windup); this._warn = windup; }
    this.setState('attack');
    if (kind === 'slam' || kind === 'shock') {
      this.attack.tele = this.G.fx.telegraphCircle(this.pos.x, this.pos.y, this.pos.z, radius, windup, kind === 'shock' ? 0xc04cff : 0xff3b2f);
      this.G.net?.tele(this.area, 'c', this.pos.x, this.pos.z, radius, windup, kind === 'shock' ? 0xc04cff : 0xff3b2f);
      this.attack.cx = this.pos.x; this.attack.cz = this.pos.z;
    }
  }

  updateAttack(dt) {
    const a = this.attack, G = this.G, P = this.T, def = this.def;
    if (!a) { this.setState('chase'); return 0; }
    a.t += dt;
    let move = 0;
    if (a.phase === 'windup') {
      if (a.kind !== 'slam' && a.kind !== 'shock') this.yaw = dampAngle(this.yaw, this.yawToPlayer(), a.kind === 'throw' ? 14 : 6, dt);
      if (a.t >= a.windup) { a.phase = 'strike'; a.t = 0; this.strike(); }
    } else if (a.phase === 'strike' && a.gk === 'charge') {
      // investida: corre reto ~8 m; quem estiver no caminho leva o golpe (uma vez) e o golem para
      const st = Math.min(16 * dt, 8 - a.go);
      if (st > 0 && a.t < 0.6) {
        const ok = G.world.tryMove(this.pos, Math.sin(this.yaw) * st, Math.cos(this.yaw) * st, this.radius, this.area); a.go += st; move = 1;
        if (!a.struck && P.alive && P.area === this.area && this.distToPlayer() < this.radius + (P.radius || 0.5) + 1.0) {
          a.struck = true; this.hitP(P, this.stats.dmg * a.mul, { name: def.name, area: this.area, level: this.level });
          G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 2.5, 0xb8a080, 10); G.audio.play('slam'); a.go = 8;
        }
        if (!ok) { a.go = 8; G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 2.2, 0xffd36b, 0.3); G.audio.play('slam'); }
        if (Math.random() < dt * 25) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1.2, 0xb8a080, 2);
      }
      if (a.t >= 0.6 + a.recover) { this.atkCd = def.atkCd; this.setState('chase'); if (!a.struck) this.openPunish(1.2); }
    } else if (a.phase === 'strike') {
      if (def.lunge && a.t < 0.18) { G.world.tryMove(this.pos, Math.sin(this.yaw) * def.lunge * dt / 0.18, Math.cos(this.yaw) * def.lunge * dt / 0.18, this.radius, this.area); move = 1; }
      if (a.t >= a.recover) {
        // combo: emenda o próximo golpe (o último é atrasado e pesado, para enganar quem esquiva cedo)
        if (this.comboLeft > 0 && P.alive && this.distToPlayer() < def.range + 2.2 + (def.slam ? def.slam.radius : 0)) {
          this.comboLeft--;
          const last = this.comboLeft === 0;
          this.beginAttack({ chain: true, windup: last ? def.windup * 1.55 : def.windup * 0.45, mul: last ? 1.35 : 0.85, heavy: last });
          return 0;
        }
        const wasCombo = a.combo;
        this.atkCd = def.atkCd; this.setState('chase');
        if (wasCombo && !def.ranged) this.openPunish(def.elite ? 1.5 : 1.1);
      }
    }
    return move;
  }

  strike() {
    const a = this.attack, G = this.G, P = this.T, def = this.def;
    const dmg = this.stats.dmg * (a.mul || 1);
    if (a.kind === 'slam' || a.kind === 'shock') {
      const r = a.radius;
      this.hitArea(a.cx, a.cz, r, dmg * (a.kind === 'shock' ? 0.9 : 1.15), { name: def.name, area: this.area, level: this.level });
      G.fx.explosion(a.cx, this.pos.y, a.cz, r * 0.9, a.kind === 'shock' ? 0xc04cff : def.warden ? def.glow : 0xb8a080, 0.4);
      if (def.warden) G.fx.slash(this.pos.x, this.pos.y + 1.1, this.pos.z, this.yaw, r, 360, def.glow, 0.25);
      G.audio.play('slam');
      if (Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z) < 18) G.cam.shake(0.35, 0.22);
      return;
    }
    if (a.gk === 'charge') { G.audio.play('swing', { vol: 0.8 }); return; }
    if (a.gk === 'hurl') {
      // arremesso de rocha: sai de cima da cabeça, em arco, mirando onde o herói vai estar
      this.yaw = this.yawToPlayer();
      const tx = P.pos.x + P.vel.x * 0.35, tz = P.pos.z + P.vel.z * 0.35;
      const dx = tx - this.pos.x, dz = tz - this.pos.z, l = Math.hypot(dx, dz) || 1, sp = 17;
      const py = this.pos.y + 2.4 * (this.baseScale || 1), vy = Math.min(10, l * 7 / sp);
      spawnProjectile(G, { scale: this.projScale() * 1.35, owner: 'enemy', kind: 'pedra', x: this.pos.x, y: py, z: this.pos.z, dx: dx / l, dz: dz / l, speed: sp, range: l + 6, radius: 0.9, dmg, area: this.area, vy, srcName: def.name, level: this.level });
      G.net?.proj(this.area, this.pos.x, py, this.pos.z, dx / l, dz / l, sp, l + 6, vy, 'pedra', 0, this.projScale() * 1.35);
      G.audio.play('swing', { vol: 0.8 });
      return;
    }
    if (a.kind === 'swipe') G.fx.slash(this.pos.x, this.pos.y + 1.2 * (this.baseScale || 1), this.pos.z, this.yaw + (a.anim === 'swipe2' ? 0.4 : -0.4), def.range + 0.6, 150, def.glow ?? 0xd8c8a0, 0.2);
    if (a.kind === 'throw') {
      this.yaw = this.yawToPlayer(); // sempre de frente para o alvo na hora do tiro
      const lead = 0.25;
      const tx = P.pos.x + P.vel.x * lead, tz = P.pos.z + P.vel.z * lead;
      const dx = tx - this.pos.x, dz = tz - this.pos.z, l = Math.hypot(dx, dz) || 1;
      const RG = a.bshot ? this.shotStyle() : def.ranged;
      const sp = RG.speed, pk = RG.proj || 'pedra', pc = RG.color, rng0 = a.bshot ? 17 : def.range + 3;
      // pedra faz arco; flecha e magia vão retas na altura do peito
      const vy = pk === 'pedra' ? Math.min(9, l * 14 / sp / 2) : 0, py = this.pos.y + (pk === 'pedra' ? 1.2 : 1.1) * Math.max(1, this.projScale()); // gigante solta da altura da mão
      spawnProjectile(G, { scale: this.projScale(), owner: 'enemy', kind: pk, color: pc, x: this.pos.x, y: py, z: this.pos.z, dx: dx / l, dz: dz / l, speed: sp, range: rng0, radius: pk === 'flecha' ? 0.4 : 0.55, dmg, area: this.area, vy, srcName: def.name, level: this.level });
      G.net?.proj(this.area, this.pos.x, py, this.pos.z, dx / l, dz / l, sp, rng0, vy, pk, pc, this.projScale());
      if (pk !== 'pedra') G.fx.burst({ x: this.pos.x + dx / l * 0.8, y: py, z: this.pos.z + dz / l * 0.8 }, { count: 6, color: [pc ?? 0xb88cff, 0xffffff], speed: 3, size: 0.2, life: 0.25, gravity: 0, up: 0.5 });
      G.audio.play('swing', { vol: 0.5 });
      return;
    }
    const reach = def.range + P.radius + 0.5 + (def.lunge || 0) * 0.6;
    const d = this.distToPlayer();
    const facing = Math.abs(angleDiff(this.yaw, this.yawToPlayer())) < 1.0;
    if (P.alive && P.area === this.area && d <= reach && facing && G.world.lineOfSight(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
      this.hitP(P, dmg, { name: def.name, area: this.area, level: this.level });
    }
    if (def.model === 'slime') G.audio.play('squelch'); else G.audio.play('swing', { vol: 0.7 });
  }

  // ---------- chefe: Guardião da Fenda ----------
  engageBoss() {
    const b = this.boss;
    if (b.engaged) return;
    b.engaged = true; b.disengageT = 0;
    this.aggroed = true;
    this.setState('chase');
    this.G.onBossEngage(this);
  }

  updateBoss(dt, neighbors) {
    const G = this.G, P = this.T, b = this.boss, A = BOSS.attacks;
    const d = this.distToPlayer();
    const homeD = Math.hypot(this.pos.x - BOSS_SPAWN.x, this.pos.z - BOSS_SPAWN.z);
    for (const k in b.cds) b.cds[k] = Math.max(0, b.cds[k] - dt);
    b.gcd = Math.max(0, b.gcd - dt);
    let move = 0;
    const playerIn = P.alive && P.area === this.area && Math.hypot(P.pos.x - BOSS_SPAWN.x, P.pos.z - BOSS_SPAWN.z) < BOSS_SPAWN.arena;
    if (!b.engaged) {
      this.anim.action = null;
      // ninguém lutando com ele há 1 minuto: recupera a vida toda (acaba o "morre, renasce e volta" até vencer)
      if (b.leftAt != null && G.time.t - b.leftAt > 60 && this.hp < this.stats.maxHp) { this.hp = this.stats.maxHp; b.leftAt = null; }
      if (playerIn) { b.leftAt = null; this.engageBoss(); }
      else if (homeD > 1) move = this.moveToward(BOSS_SPAWN.x, BOSS_SPAWN.z, 0.6, dt) * 0.5;
      else this.yaw = dampAngle(this.yaw, 0, 2, dt);
      this.sync(dt, move);
      return;
    }
    // desengajar se o jogador sair ou morrer
    const far = !P.alive || P.area !== this.area || Math.hypot(P.pos.x - BOSS_SPAWN.x, P.pos.z - BOSS_SPAWN.z) > BOSS_SPAWN.arena + 14;
    if (far) {
      b.disengageT += dt;
      if (b.disengageT > 4) { this.resetBoss(); this.sync(dt, 0); return; }
    } else b.disengageT = 0;
    // fases
    const ratio = this.hp / this.stats.maxHp;
    const ph = BOSS.phases;
    const want = ratio <= ph[2].at ? 2 : ratio <= ph[1].at ? 1 : 0;
    if (want > b.phase) {
      b.phase = want;
      this.anim.enraged = true;
      this.attack = { kind: 'roar', t: 0, dur: 1.3 };
      this.state = 'attack';
      G.audio.play('roar');
      G.cam.shake(0.5, 0.6);
      G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 10, 0xff4fd8, 0.8);
      G.ui.notice(`${ph[want].name}: o Guardião se enfurece!`);
    }
    if (!b.summoned && ratio <= A.summon.atHp) {
      b.summoned = true;
      for (let i = 0; i < A.summon.count; i++) {
        const a = (i / A.summon.count) * Math.PI * 2, x = this.pos.x + Math.cos(a) * 5, z = this.pos.z + Math.sin(a) * 5;
        G.later(i * 0.25, () => { if (!this.dead) { const m = G.spawnTemporary(A.summon.type, BOSS.level - 1, x, z, this.area); m.minion = true; } }); // um por vez: sem travar
      }
      G.ui.notice('Slimes da Fenda surgem!');
    }
    const speedMult = (ph[b.phase].speedMult || 1);
    const wm = ph[b.phase].windupMult || 1;
    if (this.state === 'attack' && this.attack) {
      move = this.updateBossAttack(dt, wm);
    } else if (!far) {
      // escolha de ataque
      let pick = null;
      if (b.gcd <= 0) {
        if (d < A.swipe.range + 0.5 && b.cds.swipe <= 0) pick = 'swipe';
        if (d < 7 && b.cds.slam <= 0 && Math.random() < 0.7) pick = 'slam';
        if (d > 7.5 && d < 24 && b.cds.charge <= 0) pick = 'charge';
        if (b.phase >= A.shards.minPhase && b.cds.shards <= 0 && Math.random() < 0.6) pick = 'shards';
        if (b.phase >= A.wave.minPhase && b.cds.wave <= 0 && d < 12 && Math.random() < 0.5) pick = 'wave';
      }
      if (pick) this.beginBossAttack(pick, wm);
      else if (d > A.swipe.range - 0.5) move = this.moveToward(P.pos.x, P.pos.z, speedMult, dt);
      else this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 6, dt);
    }
    this.sync(dt, move);
  }

  resetBoss() {
    const b = this.boss;
    b.engaged = false; b.phase = 0; b.summoned = false; b.gcd = 1.5;
    this.anim.enraged = false;
    this.attack = null; this.state = 'idle';
    // a vida perdida continua perdida por 1 minuto; sem ninguém voltar nesse tempo, ele se cura (ver updateBoss)
    b.leftAt = this.G.time.t;
    this.pos.set(BOSS_SPAWN.x, this.G.world.groundHeight(BOSS_SPAWN.x, BOSS_SPAWN.z), BOSS_SPAWN.z);
    this.G.onBossDisengage(this);
  }

  beginBossAttack(kind, wm) {
    const G = this.G, P = this.T, A = BOSS.attacks, b = this.boss;
    const cfg = A[kind];
    b.cds[kind] = cfg.cd;
    b.gcd = 0.7 + Math.random() * 0.5;
    // na fase final o golpe no chão tem tempo variável (finta): não dá para esquivar no automático
    const feint = kind === 'slam' && b.phase >= 2 ? 0.75 + Math.random() * 0.85 : 1;
    const a = { kind, t: 0, windup: cfg.windup * wm * feint, phase: 'windup', struck: false };
    if (kind === 'wave') { a.tele = G.fx.telegraphCircle(this.pos.x, this.pos.y, this.pos.z, 3.5, a.windup, 0xff4fd8); this._warn = a.windup; }
    this.state = 'attack'; this.attack = a;
    if (kind === 'slam') { a.tele = G.fx.telegraphCircle(this.pos.x, this.pos.y, this.pos.z, cfg.radius, a.windup); G.net?.tele(this.area, 'c', this.pos.x, this.pos.z, cfg.radius, a.windup, 0xff3b2f); }
    if (kind === 'charge') {
      a.yaw = this.yawToPlayer(); this.yaw = a.yaw;
      a.tele = G.fx.telegraphRect(this.pos.x, this.pos.y, this.pos.z, a.yaw, cfg.dist, cfg.width, a.windup);
      G.net?.tele(this.area, 'r', this.pos.x, this.pos.z, cfg.dist, a.windup, 0xff3b2f, a.yaw, cfg.width);
      a.traveled = 0;
    }
    if (kind === 'shards') {
      a.points = [];
      for (let i = 0; i < cfg.count; i++) {
        const r = i === 0 ? 0 : 2.5 + Math.random() * 5, an = Math.random() * Math.PI * 2;
        const x = P.pos.x + Math.cos(an) * r + P.vel.x * 0.4, z = P.pos.z + Math.sin(an) * r + P.vel.z * 0.4;
        a.points.push({ x, z });
        G.fx.telegraphCircle(x, G.world.groundHeight(x, z), z, cfg.radius, a.windup + i * 0.06, 0xc04cff);
        G.net?.tele(this.area, 'c', x, z, cfg.radius, a.windup + i * 0.06, 0xc04cff);
      }
      G.audio.play('portal');
    }
  }

  updateBossAttack(dt, wm) {
    const G = this.G, P = this.T, a = this.attack, A = BOSS.attacks;
    a.t += dt;
    if (a.kind === 'roar') {
      if (a.t >= a.dur) this.setState('chase');
      return 0;
    }
    const cfg = A[a.kind];
    if (a.phase === 'windup') {
      if (a.kind === 'swipe') this.yaw = dampAngle(this.yaw, this.yawToPlayer(), 5, dt);
      if (a.t >= a.windup) { a.phase = 'strike'; a.t = 0; this.bossStrike(); }
      return 0;
    }
    if (a.kind === 'charge') {
      const step = cfg.speed * dt;
      const ok = G.world.tryMove(this.pos, Math.sin(a.yaw) * step, Math.cos(a.yaw) * step, this.radius, this.area);
      a.traveled += step;
      if (Math.random() < dt * 30) G.fx.emit(this.pos.x, this.pos.y + 0.3, this.pos.z, 0, 2, 0, 0xc04cff, 0.6, 0.5, 0, 1);
      if (!a.struck && P.alive && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < cfg.width / 2 + this.radius) {
        a.struck = true;
        G.cam.shake(0.4, 0.25);
      }
      if (!a.hitSet) a.hitSet = new Set();
      for (const Q of this.players()) {
        if (a.hitSet.has(Q) || !Q.alive || Q.area !== this.area) continue;
        if (Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < cfg.width / 2 + this.radius) { a.hitSet.add(Q); this.hitP(Q, this.stats.dmg * cfg.mult, { name: this.def.name, area: this.area, level: BOSS.level }); }
      }
      if (!ok || a.traveled >= cfg.dist) { G.fx.ring(this.pos.x, this.pos.y, this.pos.z, 4, 0xc04cff, 0.4); G.audio.play('slam'); this.setState('chase'); this.openPunish(ok ? 1.3 : 2.2); }
      return 1;
    }
    if (a.kind === 'wave') {
      // anel que se espalha pelo chão: atravesse com a esquiva (dash) no momento certo
      const k = Math.min(1, a.t / a.dur), r = cfg.maxR * (0.15 + 0.85 * Math.pow(k, 0.6));
      if (!a.hitSet) a.hitSet = new Set();
      for (const Q of this.players()) {
        if (a.hitSet.has(Q) || !Q.alive || Q.area !== this.area) continue;
        const dq = Math.hypot(Q.pos.x - a.cx, Q.pos.z - a.cz);
        if (Math.abs(dq - r) < cfg.width) { a.hitSet.add(Q); this.hitP(Q, this.stats.dmg * cfg.mult, { name: this.def.name, area: this.area, level: BOSS.level }); }
      }
      if (k >= 1) { a.waves = (a.waves || 1); if (a.waves < (this.boss.phase >= 2 ? 3 : 2)) { a.waves++; a.t = 0; a.hitSet = new Set(); this.waveFx(cfg); } else this.setState('chase'); }
      return 0;
    }
    if (a.t >= 0.55) {
      // combo de garras: 3 golpes, o terceiro atrasado e pesado; depois o chefe fica exausto
      if (a.kind === 'swipe' && (a.chain || 0) < 2 && P.alive && this.distToPlayer() < cfg.range + 2.5) {
        const n = (a.chain || 0) + 1, last = n === 2;
        this.attack = { kind: 'swipe', t: 0, windup: last ? 1.0 * wm : 0.32 * wm, phase: 'windup', struck: false, chain: n, mul: last ? 1.7 : 0.9, arc: last ? 170 : cfg.arc };
        if (last) { G.fx.ring(this.pos.x, this.pos.y, this.pos.z, cfg.range, 0xff3b2f, this.attack.windup); this._warn = this.attack.windup; }
        return 0;
      }
      if (a.kind === 'swipe' && a.chain === 2) { this.openPunish(1.6); return 0; }
      this.setState('chase');
    }
    return 0;
  }

  waveFx(cfg) {
    const G = this.G, a = this.attack;
    G.fx.shock(a.cx, this.pos.y, a.cz, cfg.maxR, 0xff4fd8, a.dur);
    G.fx.shock(a.cx, this.pos.y + 0.4, a.cz, cfg.maxR, 0xffffff, a.dur);
    G.net?.tele(this.area, 'w', a.cx, a.cz, cfg.maxR, a.dur, 0xff4fd8);
    G.audio.play('slam'); G.cam.shake(0.3, 0.2);
  }

  bossStrike() {
    const G = this.G, P = this.T, a = this.attack, A = BOSS.attacks;
    const cfg = A[a.kind];
    const dmg = this.stats.dmg * (a.mul || cfg.mult || 1);
    if (a.kind === 'wave') { a.cx = this.pos.x; a.cz = this.pos.z; a.dur = cfg.maxR / cfg.speed; this.waveFx(cfg); return; }
    if (a.kind === 'swipe') {
      void P;
      for (const Q of this.players()) {
        if (!Q.alive || Q.area !== this.area) continue;
        const d = Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z);
        const ang = Math.atan2(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z);
        if (d <= cfg.range + (Q.radius || 0.5) && Math.abs(angleDiff(this.yaw, ang)) < ((a.arc || cfg.arc) * Math.PI) / 360) this.hitP(Q, dmg, { name: this.def.name, area: this.area, level: BOSS.level });
      }
      G.fx.slash(this.pos.x, this.pos.y + 1.2, this.pos.z, this.yaw, cfg.range, a.arc || cfg.arc, a.chain === 2 ? 0xff3b2f : 0xff4fd8, 0.25);
      if (a.chain === 2) { G.fx.cracks(this.pos.x + Math.sin(this.yaw) * 3, this.pos.y, this.pos.z + Math.cos(this.yaw) * 3, [this.yaw, this.yaw + 0.8, this.yaw - 0.8], 4, 0xff6a3a, 1.8, 0.12); G.cam.shake(0.35, 0.2); }
      G.audio.play('swing');
    } else if (a.kind === 'slam') {
      this.hitArea(this.pos.x, this.pos.z, cfg.radius, dmg, { name: this.def.name, area: this.area, level: BOSS.level });
      G.fx.explosion(this.pos.x, this.pos.y, this.pos.z, cfg.radius, 0xc04cff, 0.55);
      G.audio.play('slam'); G.audio.play('explosion', { gap: 0, vol: 0.5 });
      G.cam.shake(0.6, 0.35);
    } else if (a.kind === 'shards') {
      a.points.forEach((pt, i) => {
        G.later(i * 0.06, () => {
          const y = G.world.groundHeight(pt.x, pt.z);
          this.hitArea(pt.x, pt.z, cfg.radius, dmg, { name: this.def.name, area: this.area, level: BOSS.level }, 0.4);
          G.fx.shards(pt.x, y, pt.z, cfg.radius * 0.7, 0xd36bff, 0.9);
          G.fx.burst({ x: pt.x, y: y + 0.5, z: pt.z }, { count: 14, color: [0xd36bff, 0x5ef0ff], speed: 6, size: 0.35, life: 0.5 });
          G.audio.play('ice', { gap: 0, vol: 0.6 });
        });
      });
    }
  }

  // ---------- render ----------
  sync(dt, move) {
    const r = this.rig.root;
    r.position.set(this.pos.x, this.G.world.groundHeight(this.pos.x, this.pos.z, this.area), this.pos.z);
    this.pos.y = r.position.y;
    const ja = this.attack;
    if (this.state === 'special' && ja && ja.sp === 'salto' && ja.phase === 'act') r.position.y += Math.sin(Math.min(1, ja.t / 0.55) * Math.PI) * 3.2; // salto
    if (this.state === 'special' && ja && ja.ms === 'kslam') {
      const bs = this.baseScale;
      if (ja.phase === 'windup') { const k = Math.min(1, ja.t / ja.windup); r.scale.set(bs * (1 + 0.2 * k), bs * (1 - 0.3 * k), bs * (1 + 0.2 * k)); }
      else { r.position.y += Math.sin(Math.min(1, ja.t / 0.75) * Math.PI) * 7; r.scale.set(bs * 0.9, bs * 1.15, bs * 0.9); }
      this._kSq = true;
    } else if (this._kSq) { this._kSq = false; r.scale.setScalar(this.baseScale); }
    if (this.state === 'special' && ja && ja.ms === 'leap' && ja.phase === 'act') r.position.y += Math.sin(Math.min(1, ja.t / 0.7) * Math.PI) * 4.5; // salto do yeti
    if (this.state === 'special' && ja && ja.ms === 'leap' && ja.phase === 'windup') r.position.y -= Math.min(1, ja.t / ja.windup) * 0.35; // agacha para pular
    if (this.state === 'special' && ja && ja.sp === 'casco' && ja.phase === 'act') { r.scale.set(this.baseScale * 1.15, this.baseScale * 0.7, this.baseScale * 1.15); this._shellS = true; }
    else if (this._shellS) { this._shellS = false; r.scale.setScalar(this.baseScale); }
    // golpe: "amassa" elástico (achata, estica, assenta) + tremidinha no lugar — oscila em volta da posição, sem empurrar
    if (this.juiceT > 0 && !this.dead && this.state !== 'spawn' && !this._kSq && !this._shellS) {
      const u = 1 - this.juiceT / JUICE_T, amp = this.juiceAmp || 1, bs = this.baseScale;
      const sq = Math.sin(u * Math.PI * 3) * (1 - u) * (1 - u) * 0.22 * amp;
      r.scale.set(bs * (1 + sq * 0.75), bs * (1 - sq), bs * (1 + sq * 0.75)); this._jSq = true;
      const sh = (1 - u) * 0.07 * amp * Math.min(1.6, bs) * Math.sin(u * 26);
      r.position.x += (this.jdx || 0) * sh; r.position.z += (this.jdz || 0) * sh;
    } else if (this._jSq) { this._jSq = false; r.scale.setScalar(this.baseScale); }
    r.rotation.y = this.yaw;
    const a = this.attack;
    const an = this.anim;
    an.move = move;
    an.hurt = this.hurtT / 0.22;
    an.action = null; an.p = 0;
    if (this.replica) { an.action = this.netAct || null; an.p = this.netP || 0; }
    else if ((this.state === 'attack' || this.state === 'special') && a) {
      if (a.kind === 'roar') { an.action = 'roar'; an.p = a.t / a.dur; }
      else if (this.boss) {
        const map = { swipe: 'swipe', slam: 'slam', wave: 'slam', charge: a.phase === 'windup' ? 'chargeWind' : 'charge', shards: 'cast' };
        an.action = map[a.kind];
        an.p = a.phase === 'windup' ? (a.t / a.windup) * (a.kind === 'slam' ? 0.7 : 0.6) : (a.kind === 'slam' ? 0.7 : 0.6) + Math.min(1, a.t / 0.4) * 0.4;
        if (a.kind === 'charge' && a.phase === 'windup') an.p = a.t / a.windup;
      } else {
        const kind = a.kind === 'shock' ? 'slam' : a.kind;
        an.action = a.gk === 'charge' ? (a.phase === 'windup' ? 'chargeWind' : 'charge') : a.gk === 'hurl' ? 'hurl' : a.anim || kind;
        const rk = this.rig.kind, split = rk === 'golem' || kind === 'slam' ? 0.7 : rk === 'slime' || rk === 'wolf' ? 0.6 : 0.28;
        an.p = a.phase === 'windup' ? (a.t / a.windup) * split : split + Math.min(1, a.t / a.recover) * (1 - split);
        if (a.gk === 'charge') an.p = a.phase === 'windup' ? a.t / a.windup : 0.5;
        an.variant = a.heavy ? 2 : (a.var || 0);
      }
    }
    if (!this.replica && a?.ms === 'spin' && a.phase === 'act' && a.t < a.dur) { an.action = 'slash'; an.p = 0.42; }
    if (this.state !== 'alert') an.alert = Math.max(0, an.alert - dt * 4);
    const fighting = !this.dead && ['chase', 'attack', 'special', 'alert', 'hurt'].includes(this.state) ? 1 : 0;
    an.combat = (an.combat || 0) + (fighting - (an.combat || 0)) * Math.min(1, dt * 5);
    if (!r.visible) return; // longe/fora do mapa: não calcula ossos nem brilho (só a posição acima)
    animate(this.rig, an, dt);
    const f = this.flashT > 0 ? Math.min(1, this.flashT / 0.1) : 0;
    const frozen = this.freeze > 0;
    // aviso de ataque: o monstro esquenta (brilho avermelhado) durante a preparação do golpe
    const wind = this.replica ? (this.netWind || 0) : (this.state === 'attack' || this.state === 'special') && a && a.phase === 'windup' && a.kind !== 'roar' ? Math.min(1, a.t / Math.max(0.05, a.windup)) : 0;
    this._wind = wind;
    for (const m of this.rig.mats) {
      if (!m.emissive) continue;
      if (!m.userData.base) m.userData.base = m.emissive.clone();
      if (frozen) m.emissive.setRGB(0.15, 0.35, 0.55);
      else {
        m.emissive.copy(m.userData.base);
        if (wind > 0) m.emissive.lerp(_warn, wind * wind * 0.55);
        if (f > 0) m.emissive.lerp(_white, f * 0.95);
      }
    }
  }

  // ---- réplica: em quem não é o anfitrião, o monstro só segue o estado recebido pela rede ----
  netApply(n) {
    this.minion = !!n.minion;
    // velocidade estimada entre dois estados do anfitrião: deixa o movimento suave e sem atraso (previsão curta)
    const now = this.G.time.t, prev = this.netS;
    if (prev && now > this.netSeen) {
      const dtS = Math.min(0.5, now - this.netSeen);
      const vx = (n.x - prev.x) / dtS, vz = (n.z - prev.z) / dtS;
      n.vx = Math.hypot(vx, vz) < 25 ? vx : 0; n.vz = Math.hypot(vx, vz) < 25 ? vz : 0;
    } else { n.vx = 0; n.vz = 0; }
    this.netS = n; this.netSeen = now;
    if (!this.netInit) { this.netInit = true; this.pos.x = n.x; this.pos.z = n.z; this.yaw = n.yaw; if (this.state === 'spawn' && !n.spawn) { this.state = 'idle'; this.rig.root.scale.setScalar(this.baseScale); } }
  }
  netUpdate(dt) {
    const G = this.G, n = this.netS;
    if (dt > 0 && this._px !== undefined) {
      this.vx = (this.vx || 0) * 0.6 + ((this.pos.x - this._px) / dt) * 0.4;
      this.vz = (this.vz || 0) * 0.6 + ((this.pos.z - this._pz) / dt) * 0.4;
    }
    this._px = this.pos.x; this._pz = this.pos.z;
    this.anim.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.juiceT = Math.max(0, (this.juiceT || 0) - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.predT = Math.max(0, (this.predT || 0) - dt);
    if (this.dead) {
      this.deadT += dt;
      this.anim.dead = Math.min(1, this.deadT / 0.7);
      // o anfitrião discordou (ex.: o golpe não matou lá) → volta a viver
      if (n && !n.dead && this.deadT > 1.2 && G.time.t - this.netSeen < 0.6 && this.deadT < 1.3) { this.dead = false; this.anim.dead = 0; this.state = 'chase'; this.rig.root.scale.setScalar(this.baseScale); }
      else if (this.deadT > 1.4) {
        const k = Math.max(0, 1 - (this.deadT - 1.4) / 0.6);
        this.rig.root.scale.setScalar(this.baseScale * (0.2 + 0.8 * k));
        if (this.deadT > 2.0 && !this.removed) this.remove();
      }
      this.sync(dt, 0);
      return;
    }
    if (!n) { this.sync(dt, 0); return; }
    if (n.spawn) {
      this.rig.root.scale.setScalar(this.baseScale * Math.max(0.01, 1 - n.spawn));
    } else if (this.state === 'spawn') { this.state = 'idle'; this.rig.root.scale.setScalar(this.baseScale); }
    const k = 1 - Math.exp(-16 * dt);
    const lead = Math.min(0.2, G.time.t - this.netSeen) + 0.05, moving = !n.dead && ['chase', 'attack', 'special', 'return', 'flee', 'patrol', 'alert'].includes(n.st);
    const tx = n.x + (moving ? (n.vx || 0) * lead : 0), tz = n.z + (moving ? (n.vz || 0) * lead : 0);
    const jump = Math.hypot(tx - this.pos.x, tz - this.pos.z) > 8;
    this.pos.x = jump ? tx : this.pos.x + (tx - this.pos.x) * k;
    this.pos.z = jump ? tz : this.pos.z + (tz - this.pos.z) * k;
    this.yaw = dampAngle(this.yaw, n.yaw, 12, dt);
    const nh = n.hp * this.stats.maxHp; // outro jogador acertou este monstro: mostra o golpe aqui também
    if (this._nh != null && nh < this._nh - 0.5 && !n.dead && G.time.t - (this.localHit ?? -9) > 0.9) { this.impact({}); this.impactFx(0, 0, false, 0, true); }
    this._nh = nh;
    if (this.predT <= 0) this.hp = n.hp * this.stats.maxHp;
    else this.hp = Math.min(this.hp, n.hp * this.stats.maxHp);
    if (n.dead && !this.dead) { this.dead = true; this.state = 'dead'; this.deadT = 0; if (this.G.target === this) this.G.target = null; this.deathFx?.(); }
    this.state = this.dead ? 'dead' : n.st;
    this.netAct = n.act; this.netP = n.p; this.netWind = n.wind;
    this.stun = n.stun ? 0.2 : 0;
    if (this.boss) this.boss.engaged = !!n.eng;
    if (this.stun && Math.random() < dt * 6) G.fx.emit(this.pos.x, this.pos.y + this.rig.height + 0.2, this.pos.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0xffe066, 0.25, 0.5, 0, 1);
    this.sync(dt, n.mv);
  }

  remove() {
    this.removed = true;
    this.G.scene.remove(this.rig.root);
    this.G.onEnemyRemoved(this);
  }
}
