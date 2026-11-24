import { mobLevel } from '../config/moblevels.js';
import { SPAWNERS, DUNGEON, WORLD, BOSS_SPAWN, ERMOS, CONFINS, GUARDIAO, PORTAL_FENDA, PLATEAU, RUNES, NPC_SPAWNS, CHESTS, inGuardiao, inCamp, inVillage } from '../config/world.js';
import { roadDistance } from '../engine/terrain.js';
import { seeded, splitSizes, pickAnchors, spacingFor, respawnDelay, groupGap, SPAWN_CLEAR } from './spread.js';
import { biomeAt, hash2 } from '../engine/confins.js';
import { BALANCE } from '../config/balance.js';
import { BOSS, ENEMIES } from '../config/enemies.js';
import { Enemy } from './enemy.js';
import { HUNTS, huntLevels, huntRespawn } from '../config/hunts.js';

// Grupos de inimigos com reaparecimento controlado.
export class Spawners {
  constructor(G) {
    this.G = G;
    this.groups = [];
    this.pending = [];
    this.boss = null;
    this.rare = [];
  }

  // chefes e mini-chefes do mapa (o Vigia da Cripta não: ele faz parte da história)
  isRare(g) { const d = ENEMIES[g.cfg.type]; return !!(d && (d.miniboss || d.boss) && g.cfg.type !== 'vigia'); }
  rareWait(type, level) { const R = BALANCE.rareSpawn; return Math.min(R.waitMax, R.wait + mobLevel(type, level) * R.waitPerLevel); }
  rareKills() { const w = this.G.state.world; return (w.rareKills ||= {}); }
  rareChance(type, level) { const R = BALANCE.rareSpawn; return Math.max(R.min, R.base / (1 + mobLevel(type, level) / R.perLevel)); }

  init() {
    const G = this.G;
    this.groups = []; this.pending = []; this.boss = null; this.dyn = null; this.rare = []; this.rareNext = 0; this.lastMin = null;
    // os da Planície do Guardião (mesmas coordenadas) agora são do mapa 2 (área 'guardiao')
    for (const s of SPAWNERS) this.groups.push({ cfg: s, area: inGuardiao(s.x, s.z) ? 'guardiao' : 'world', cx: s.x, cz: s.z, members: [] });
    this.huntGroups = new Map();
    for (const h of HUNTS) if (h.area === 'world' || h.area === 'guardiao') this.groups.push(...this.huntGroupsOf(h, 0, 0));
    for (const s of DUNGEON.spawners) {
      // o Vigia existe para todos no mundo compartilhado (o baú dele é individual)
      this.groups.push({ cfg: s, area: 'cripta', cx: s.x + WORLD.dungeonOffset.x, cz: s.z + WORLD.dungeonOffset.z, members: [] });
    }
    this.groups = this.spreadGroups(this.groups);
    // Ermos e Confins: grupos criados por células conforme os jogadores chegam perto (ver wildGroup)
    // chefes começam ausentes: aparecem por sorte (ver rollRare)
    for (const g of this.groups) { if (this.isRare(g)) { this.rare.push(g); continue; } for (let i = 0; i < g.cfg.count; i++) this.spawnOne(g, false); }
    this.checkBoss(true);
    // chefe que nasceu nos últimos minutos (com outro anfitrião) continua lá
    this.rollRare(8);
  }

  allHunts() { return HUNTS; }
  // Hunt: um grupo por tipo de monstro, todos no mesmo lugar; nascem espalhados e voltam rápido
  huntGroupsOf(h, ox, oz) {
    const out = [];
    h.mobs.forEach((type, k) => {
      const n = Math.floor(h.count / h.mobs.length) + (k < h.count % h.mobs.length ? 1 : 0);
      if (!n || !ENEMIES[type]) return;
      const lvl = huntLevels(h, type);
      const g = { cfg: { id: h.id + '_' + k, type, count: n, x: h.x + ox, z: h.z + oz, r: h.r, lvl, respawnSec: huntRespawn(lvl[1]), hunt: h.id }, area: h.area, cx: h.x + ox, cz: h.z + oz, members: [], hunt: h.id };
      out.push(g);
    });
    this.huntGroups.set(h.id, out);
    return out;
  }

  // ---- pacote 3: grupinhos espalhados ----
  // lugar onde pode haver um grupinho: chão andável, fora de estrada, casa, área segura e do caminho para o Guardião
  spotOk(x, z, area, s) {
    const W = this.G.world;
    if (!W.walkable(x, z, area) || W.col.pointBlocked(x, z, 1.4) || W.isSafe(x, z, area)) return false;
    if (s?.camp && !inCamp(x, z, -3)) return false;
    if (area === 'world') {
      if (roadDistance(x, z) < 6.5 || inVillage(x, z, 10)) return false;
      if (W.groundHeight(x, z, area) < WORLD.waterLevel + 0.3) return false; // nada dentro d'água
      if (!s?.camp && inCamp(x, z, 4)) return false; // a paliçada é só dos goblins
      // caminho para o Guardião: rampa e topo do Planalto até o portal
      if (Math.abs(x - PLATEAU.x) < 10 && z < PLATEAU.ramp.zBottom + 6 && z > GUARDIAO.portalGo.z - 6) return false;
      for (const k of ['mural', 'altar']) if (Math.hypot(x - RUNES[k].x, z - RUNES[k].z) < 6) return false;
      for (const r of Object.values(RUNES.stones)) if (Math.hypot(x - r.x, z - r.z) < 8) return false;
      for (const n of Object.values(NPC_SPAWNS)) if (Math.hypot(x - n.x, z - n.z) < 7) return false;
      for (const c of CHESTS) if (Math.hypot(x - c.x, z - c.z) < 5) return false;
    }
    if (area === 'guardiao') {
      if (Math.hypot(x - GUARDIAO.entry.x, z - GUARDIAO.entry.z) < 20) return false; // chegada do portal
      if (Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) < BOSS_SPAWN.arena + 6 || Math.hypot(x - PORTAL_FENDA.x, z - PORTAL_FENDA.z) < 12) return false;
      if (Math.abs(x - 35 - Math.sin(z * 0.02) * 6) < 6) return false; // trilha até o trono
    }
    return true;
  }
  // divide cada grupo grande (e cada zona) em grupinhos de 1 a 3, o mais longe possível uns dos outros e dos outros
  // grupos do mesmo mapa (cobre a área toda, mesma quantidade de monstros). Chefes e hunts não mudam.
  spreadGroups(groups) {
    const out = [], placed = new Map(), occ = (a) => (placed.has(a) ? placed.get(a) : (placed.set(a, []), placed.get(a)));
    // primeiro os que não mudam (chefes, hunts, grupos pequenos): os grupinhos novos se afastam deles
    const keep = (g) => this.isRare(g) || g.hunt || g.cfg.noRespawn || (!g.cfg.zone && g.cfg.count <= 3);
    for (const g of groups) if (keep(g)) { out.push(g); if (!this.isRare(g)) occ(g.area).push({ x: g.cx, z: g.cz }); }
    for (const g of groups) {
      if (keep(g)) continue;
      const s = g.cfg, rnd = seeded(s.id), sizes = splitSizes(s.count, rnd);
      const R = s.zone ? s.r : Math.max(s.r, 6 + 6 * Math.sqrt(sizes.length));
      const cands = [];
      for (let k = 0; k < 220 && cands.length < 90; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R, x = g.cx + Math.cos(a) * r, z = g.cz + Math.sin(a) * r;
        if (this.spotOk(x, z, g.area, s)) cands.push({ x, z });
      }
      if (!cands.length) { out.push(g); continue; } // nada serve: fica como era
      const an = pickAnchors(cands, sizes.length, occ(g.area), Math.min(22, spacingFor(R, sizes.length)));
      const subR = Math.max(3.5, Math.min(s.zone ? 6 : s.r, 6));
      an.forEach((p, i) => {
        const n = i === an.length - 1 ? sizes.slice(i).reduce((a, b) => a + b, 0) : sizes[i];
        out.push({ cfg: { ...s, id: s.id + '_' + i, count: Math.min(3, n), x: p.x, z: p.z, r: subR, zone: undefined }, area: g.area, cx: p.x, cz: p.z, members: [] });
        occ(g.area).push(p);
      });
    }
    return out;
  }

  // Ermos/Confins: grupo de 3+ de uma célula vira grupinhos (pontos) afastados dentro da célula
  addSpots(g) {
    if (g.cfg.count < 3 || this.isRare(g)) return;
    const rnd = seeded(g.cfg.id), sizes = splitSizes(g.cfg.count, rnd);
    if (sizes.length < 2) return;
    const cands = [];
    for (let k = 0; k < 60 && cands.length < 30; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * g.cfg.r, x = g.cx + Math.cos(a) * r, z = g.cz + Math.sin(a) * r;
      if (this.G.world.walkable(x, z, g.area) && !this.G.world.isSafe(x, z, g.area)) cands.push({ x, z });
    }
    if (cands.length < sizes.length) return;
    g.spots = pickAnchors(cands, sizes.length, [], spacingFor(g.cfg.r, sizes.length)).map((p, i) => ({ x: p.x, z: p.z, n: sizes[i] }));
    g.spotR = 6;
  }

  // lugar para nascer: espalhado pela área do grupo e LONGE dos outros do grupo (nada de "grupinhos" grudados)
  // e longe de TODOS os jogadores daquele mapa (nunca nasce em cima de você). null = agora não dá (tenta depois)
  findSpot(g, strict = false, wide = false) {
    const W = this.G.world, G = this.G;
    const sep = g.hunt ? 4.5 : g.dyn ? 7 : Math.min(5, Math.max(2.5, g.cfg.r * 0.45));
    const others = g.hunt ? (this.huntGroups.get(g.hunt) || [g]).flatMap((x) => x.members) : g.members;
    const players = (G.net ? G.net.targets(g.area) : [G.player]).filter((p) => p && (p.area || g.area) === g.area && p.pos);
    const clear = g.hunt ? 8 : SPAWN_CLEAR;
    // grupo com pontos (Ermos/Confins): nasce no ponto com menos monstros vivos
    let cx = g.cx, cz = g.cz, rr = g.cfg.r;
    if (g.spots) {
      let best = null, bv = Infinity;
      for (const s of g.spots) { const alive = g.members.filter((m) => !m.dead && m.spot === s).length, v = alive / s.n; if (v < bv) { bv = v; best = s; } }
      cx = best.x; cz = best.z; rr = g.spotR; g._spot = best;
    }
    if (wide) rr = rr * 2 + 10; // jogador parado no lugar: nasce um pouco mais longe (fora da vista), não some de vez
    let best = null, bestD = -1, byPlayer = false;
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rr;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!(W.walkable(x, z, g.area) && !W.col.pointBlocked(x, z, 0.9) && !W.isSafe(x, z, g.area))) continue;
      if (players.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < clear)) { byPlayer = true; continue; }
      let dmin = 1e9; for (const m of others) if (!m.dead) dmin = Math.min(dmin, Math.hypot(m.pos.x - x, m.pos.z - z));
      if (dmin >= sep) return { x, z };
      if (dmin > bestD) { bestD = dmin; best = { x, z }; }
    }
    if (best || !strict) return best || { x: cx, z: cz };
    if (byPlayer && !wide && !g.hunt) return this.findSpot(g, true, true);
    // nenhum ponto andável sorteado (grupo apertado): o centro, se ninguém estiver perto
    return byPlayer || players.some((p) => Math.hypot(p.pos.x - cx, p.pos.z - cz) < clear) ? null : { x: cx, z: cz };
  }

  spawnOne(g, anim, at = null) {
    const { x, z } = at || this.findSpot(g);
    const spot = g._spot; g._spot = null;
    const [l0, l1] = g.cfg.lvl;
    const lvl = l0 + Math.floor(Math.random() * (l1 - l0 + 1));
    const e = new Enemy(this.G, g.cfg.type, lvl, { x, z, area: g.area, spawner: g, patrolR: g.spots ? g.spotR : Math.max(3, g.cfg.r), spawnAnim: anim, noRespawn: g.cfg.noRespawn });
    if (spot) e.spot = spot;
    if (g.cfg.type === 'skeleton' && (g.area === 'world' || g.area === 'guardiao')) {
      // rotas fixas pelas ruínas
      const pts = [];
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.random(); pts.push([g.cx + Math.cos(a) * g.cfg.r, g.cz + Math.sin(a) * g.cfg.r]); }
      e.waypoints = pts;
    }
    this.G.enemies.push(e);
    g.members.push(e);
    return e;
  }

  onDeath(e) {
    if (e.boss) { this.boss = null; this.rareKills().boss_fenda = Math.floor(Date.now() / 60000); return; }
    const g = e.spawner;
    if (!g) return;
    g.members = g.members.filter((m) => m !== e);
    if (e.noRespawn || e.temporary) return;
    if (this.isRare(g)) { if (!g.members.length) { this.rareKills()[g.cfg.id] = Math.floor(Date.now() / 60000); if (!this.rare.includes(g)) this.rare.push(g); } return; }
    // cada um no seu tempo (não volta o grupo todo junto)
    this.pending.push({ g, at: this.G.time.t + respawnDelay(g.cfg.respawnSec ?? this.respawnSec(g)) });
  }
  // quanto mais forte o monstro, mais demora para nascer de novo (slime ~45 s, nível 50 ~2 min, nível 100+ ~3–5 min)
  respawnSec(g) { const R = BALANCE.respawn, L = g.cfg.lvl?.[1] ?? g.cfg.lvl?.[0] ?? 1; return Math.min(R.max, R.base + L * R.perLevel); }

  // Guardião da Fenda: fica no Trono até a primeira vitória (missão principal); depois só volta por sorte
  checkBoss(initial = false, lucky = false) {
    const G = this.G;
    if (this.boss) return;
    if (G.state.world.flags.bossKilled && !lucky) return;
    const e = new Enemy(G, 'boss_fenda', BOSS.level, { x: BOSS_SPAWN.x, z: BOSS_SPAWN.z, area: 'guardiao', spawnAnim: !initial });
    e.yaw = 0;
    G.enemies.push(e);
    this.boss = e;
    if (!initial && G.state.world.flags.bossKilled) G.ui.notice('O Guardião voltou a se erguer no Trono (Planície do Guardião, mapa 2).');
  }

  // a cada minuto, cada chefe ausente tem uma chance de nascer (sem relógio: pode vir logo ou demorar muito)
  // Sorteio dos chefes preso ao RELÓGIO de verdade: cada minuto tem um número da sorte fixo para cada chefe,
  // igual em todos os aparelhos. Trocar de anfitrião, recarregar ou alguém sair não zera a espera
  // (antes o sorteio recomeçava do zero e, online, o chefe quase nunca nascia).
  luck(id, minute) { const f = this.rollFn || globalThis.__eldRollFn; if (f) return f(); let h = 2166136261 ^ minute; for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  rollRare(lookback = 0) {
    const G = this.G, P = G.player;
    const now = Math.floor(Date.now() / 60000);
    if (!lookback && G.time.t < this.rareNext && this.lastMin === now) return;
    this.rareNext = G.time.t + 5;
    if (this.lastMin === now && !lookback) return;
    const from = lookback ? now - lookback : now; this.lastMin = now;
    for (let i = this.rare.length - 1; i >= 0; i--) {
      const g = this.rare[i];
      if (g.members.some((m) => !m.dead)) { this.rare.splice(i, 1); continue; }
      // Ermos e Confins: chefe aparece bem mais (antes era ~1 vez a cada 2–4 horas perto dele)
      const wild = g.dyn && (g.area === 'ermos' || g.area === 'confins'), RW = BALANCE.rareSpawn;
      const ch = wild ? RW.wildChance : this.rareChance(g.cfg.type, g.cfg.lvl[0]);
      const k = this.rareKills()[g.cfg.id], ready = k != null ? k + Math.ceil(wild ? RW.wildWait : this.rareWait(g.cfg.type, g.cfg.lvl[0])) : -Infinity;
      if (now < ready) continue; // ainda descansando depois da última morte
      let hit = false; for (let m = Math.max(from, ready); m <= now && !hit; m++) hit = this.luck(g.cfg.id, m) < ch;
      if (!hit) continue;
      this.rare.splice(i, 1);
      for (let n = 0; n < g.cfg.count; n++) this.spawnOne(g, true);
      const st = g.struct && (CONFINS.structs || []).find((x) => x.id === g.struct);
      if (st && P.area === g.area && Math.hypot(P.pos.x - g.cx, P.pos.z - g.cz) < 500) G.ui.notice(`${ENEMIES[g.cfg.type].name} apareceu: ${st.name}!`);
      else if (P.area === g.area && Math.hypot(P.pos.x - g.cx, P.pos.z - g.cz) < 150) G.ui.notice(`${ENEMIES[g.cfg.type].name} apareceu por perto!`);
    }
    const kb = this.rareKills().boss_fenda, readyB = kb != null ? kb + Math.ceil(this.rareWait('boss_fenda', BOSS.level)) : -Infinity;
    if (!this.boss && G.state.world.flags.bossKilled && now >= readyB) { const ch = this.rareChance('boss_fenda', BOSS.level); let hit = false; for (let m = Math.max(from, readyB); m <= now && !hit; m++) hit = this.luck('boss_fenda', m) < ch; if (hit) this.checkBoss(false, true); }
  }

  update() {
    const G = this.G, P = G.player;
    // renascimento INDIVIDUAL: cada monstro tem o seu tempo; do mesmo grupo nasce no máximo um a cada 5–11 s,
    // e só num ponto longe de todos os jogadores (se não houver, tenta de novo daqui a pouco, cada um no seu tempo)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i], g = p.g;
      if (G.time.t < p.at) continue;
      if (!g.hunt && G.time.t < (g.nextOk || 0)) { p.at = g.nextOk + Math.random() * 3; continue; }
      const at = this.findSpot(g, true);
      if (!at) { p.at = G.time.t + 4 + Math.random() * 8; continue; }
      this.spawnOne(g, true, at);
      if (!g.hunt) g.nextOk = G.time.t + groupGap();
      this.pending.splice(i, 1);
    }
    if (!this.boss && !G.state.world.flags.bossKilled && Math.random() < 0.02) this.checkBoss();
    this.rollRare();
    this.updateConfins();
  }

  // Ermos e Confins: o mapa é dividido em células; cada célula pode ter um grupo pequeno.
  // O nível esperado sobe com a distância da entrada; cada tipo de monstro tem nível fixo.
  wildGroup(area, ci, cj) {
    const C = area === 'ermos' ? ERMOS : CONFINS, H = C.half;
    if (hash2(ci, cj, 1) > 0.82) return null;
    const lx = -H + (ci + 0.15 + 0.7 * hash2(ci, cj, 2)) * C.cell, lz = -H + (cj + 0.15 + 0.7 * hash2(ci, cj, 3)) * C.cell;
    const lim = (C.playable || H) - 20;
    if (Math.abs(lx) > lim || Math.abs(lz) > lim) return null;
    const dEntry = Math.hypot(lx - C.entry.x, lz - C.entry.z);
    if (dEntry < (area === 'ermos' ? 60 : 75)) return null;
    if (area === 'ermos' && !this.G.world.walkable(lx + C.offset.x, lz + C.offset.z, 'ermos')) return null;
    const [L0, L1] = C.levelRange;
    const target = L0 + (L1 - L0) * Math.min(1, dEntry / C.levelDist) + (hash2(ci, cj, 8) - 0.5) * Math.max(1.4, (L1 - L0) * 0.08);
    const home = area === 'ermos' ? nearestErmos(lx, lz) : biomeAt(lx, lz).id;
    // Confins: cada região só tem os monstros DELA (nada de yeti no magma). Nível segue a distância da entrada,
    // dentro da faixa da região. Raramente aparece o mini-chefe da região (volta depois de 10 min).
    if (area === 'confins') {
      const B = C.biomes[home];
      if (B?.mobs?.length) {
        const [a, b] = B.levels, lv = Math.round(Math.max(a, Math.min(b, target)));
        const roll = hash2(ci, cj, 4);
        let type, kind = 'normal';
        // biomas com megaestrutura: o chefe só nasce lá dentro (ver guardas das estruturas)
        const inStruct = (C.structs || []).some((s) => s.biome === home);
        if (B.boss && roll < (inStruct ? 0.035 : 0.06) && ENEMIES[B.boss]) { type = B.boss; kind = 'boss'; } // o chefe também anda pela região (não só dentro da estrutura)
        else if (roll < 0.14 && B.elites?.length) { type = B.elites[Math.floor(hash2(ci, cj, 6) * B.elites.length)]; kind = 'elite'; }
        else type = B.mobs[Math.floor(hash2(ci, cj, 5) * B.mobs.length)];
        if (!ENEMIES[type]) return null;
        // nível fixo de cada monstro (config/moblevels.js); o mini-chefe da região fica 3 acima do mais forte dela
        const L = kind === 'boss' ? b + 3 : mobLevel(type, lv);
        const f = (Math.min(L, b) - C.levelRange[0]) / Math.max(1, C.levelRange[1] - C.levelRange[0]);
        const count = kind !== 'normal' ? 1 : Math.max(1, Math.round(4 - f * 2.4 + (hash2(ci, cj, 7) - 0.5)));
        return { cfg: { id: 'cw' + ci + '_' + cj, type, count, x: lx + C.offset.x, z: lz + C.offset.z, r: kind !== 'normal' ? 9 : 22, lvl: [L, L], respawnSec: kind === 'boss' ? 600 : undefined }, area, cx: lx + C.offset.x, cz: lz + C.offset.z, members: [], dyn: true };
      }
    }
    // Ermos: campeões da região também andam pelo mapa (antes só apareciam no fim dos eventos)
    if (area === 'ermos' && ERMOS_BOSS[home] && ENEMIES[ERMOS_BOSS[home]] && hash2(ci, cj, 9) < 0.045) {
      const L = Math.round(target) + 3;
      return { cfg: { id: 'ew' + ci + '_' + cj + 'c', type: ERMOS_BOSS[home], count: 1, x: lx + C.offset.x, z: lz + C.offset.z, r: 9, lvl: [L, L], respawnSec: 600 }, area, cx: lx + C.offset.x, cz: lz + C.offset.z, members: [], dyn: true };
    }
    const wantElite = hash2(ci, cj, 4) < 0.12;
    const pick = (list) => {
      if (!list.length) return null;
      let tot = 0; const w = list.map((m) => { const d = Math.abs(m.lvl - target); const v = d <= 4 ? (1 / (1 + d)) * (m.home === home ? 3 : 1) : 0; tot += v; return v; });
      if (!tot) return list.reduce((b, m) => (Math.abs(m.lvl - target) < Math.abs(b.lvl - target) ? m : b));
      let r = hash2(ci, cj, 5) * tot;
      for (let k = 0; k < list.length; k++) { r -= w[k]; if (r <= 0) return list[k]; }
      return list[list.length - 1];
    };
    const elites = C.mobs.filter((m) => ENEMIES[m.type]?.elite), normal = C.mobs.filter((m) => !ENEMIES[m.type]?.elite);
    let m = wantElite ? pick(elites.filter((x) => Math.abs(x.lvl - target) <= 6)) : null;
    if (!m) m = pick(normal);
    if (!m || !ENEMIES[m.type]) return null;
    const elite = !!ENEMIES[m.type].elite;
    // monstros fortes: grupos menores (de 4 nos mais fracos até 1–2 nos mais fortes do mapa)
    const f = (m.lvl - L0) / Math.max(1, L1 - L0);
    const count = elite ? 1 : Math.max(1, Math.round(4 - f * 2.4 + (hash2(ci, cj, 7) - 0.5)));
    return { cfg: { id: area[0] + 'w' + ci + '_' + cj, type: m.type, count, x: lx + C.offset.x, z: lz + C.offset.z, r: elite ? 9 : 22, lvl: [m.lvl, m.lvl] }, area, cx: lx + C.offset.x, cz: lz + C.offset.z, members: [], dyn: true };
  }

  updateConfins() {
    const G = this.G;
    if (G.time.t < (this.cNext || 0)) return;
    this.cNext = G.time.t + 1;
    this.dyn = this.dyn || new Map();
    for (const area of ['ermos', 'confins']) {
      const C = area === 'ermos' ? ERMOS : CONFINS;
      const ps = G.net ? G.net.targets(area) : (G.player.area === area ? [G.player] : []);
      for (const p of ps) {
        const lx = p.pos.x - C.offset.x + C.half, lz = p.pos.z - C.offset.z + C.half;
        const R = Math.ceil(C.activeDist / C.cell);
        const pi = Math.floor(lx / C.cell), pj = Math.floor(lz / C.cell);
        for (let j = pj - R; j <= pj + R; j++) for (let i = pi - R; i <= pi + R; i++) {
          const k = area + i + ',' + j;
          if (this.dyn.has(k)) continue;
          const cx = (i + 0.5) * C.cell, cz = (j + 0.5) * C.cell;
          if (Math.hypot(cx - lx, cz - lz) > C.activeDist) continue;
          const g = this.wildGroup(area, i, j);
          this.dyn.set(k, g || { none: true, area, cx: cx - C.half + C.offset.x, cz: cz - C.half + C.offset.z });
          if (g && this.isRare(g)) { // mini-chefe do bioma: nasce por sorte — e às vezes já está lá quando você chega
            this.rare.push(g);
            const now = Math.floor(Date.now() / 60000), kk = this.rareKills()[g.cfg.id];
            if ((kk == null || now >= kk + BALANCE.rareSpawn.wildWait) && this.luck(g.cfg.id + 'p', Math.floor(now / 20)) < BALANCE.rareSpawn.wildPresent) { this.rare.pop(); for (let n = 0; n < g.cfg.count; n++) this.spawnOne(g, false); }
          }
          else if (g) { this.addSpots(g); for (let n = 0; n < g.cfg.count; n++) this.spawnOne(g, false); }
        }
      }
      // hunts dos Ermos e dos Confins: aparecem quando alguém chega perto (e dormem como as outras células)
      for (const h of HUNTS) {
        if (h.area !== area) continue;
        const X = h.x + C.offset.x, Z = h.z + C.offset.z, key0 = 'hunt_' + h.id;
        if (this.dyn.has(key0 + '_0') || !ps.some((p) => Math.hypot(p.pos.x - X, p.pos.z - Z) < C.activeDist + h.r)) continue;
        this.huntGroupsOf(h, C.offset.x, C.offset.z).forEach((g, k) => { g.dyn = true; this.dyn.set(key0 + '_' + k, g); for (let n = 0; n < g.cfg.count; n++) this.spawnOne(g, false); });
      }
      // guardas das megaestruturas (castelos, cavernas…): grupos extras do bioma dentro delas
      if (area === 'confins') for (const S of C.structs || []) {
        const X = S.x + C.offset.x, Z = S.z + C.offset.z;
        if (!ps.some((p) => Math.hypot(p.pos.x - X, p.pos.z - Z) < S.r + C.activeDist * 0.6)) continue;
        const B = C.biomes[S.biome]; if (!B) continue;
        const spots = [[0.45, 0.35], [-0.45, 0.35], [0.45, -0.4], [-0.45, -0.4], [0, 0.62], [0, -0.62]];
        // chefe do bioma: nasce por sorte DENTRO da estrutura (salão do trono, frente da pirâmide, arena da caverna…)
        const bk = 'est_' + S.id + '_chefe';
        if (B.boss && ENEMIES[B.boss] && !this.dyn.has(bk)) {
          const [bx, bz] = S.kind === 'castelo' ? [0, -22] : S.kind === 'templo' ? [0, 36] : S.kind === 'circulo' ? [0, 16] : [0, 30];
          const L = B.levels[1] + 3;
          const g = { cfg: { id: bk, type: B.boss, count: 1, x: X + bx, z: Z + bz, r: 5, lvl: [L, L] }, area, cx: X + bx, cz: Z + bz, members: [], dyn: true, struct: S.id };
          this.dyn.set(bk, g); this.rare.push(g);
          const now = Math.floor(Date.now() / 60000), kk = this.rareKills()[bk];
          if ((kk == null || now >= kk + BALANCE.rareSpawn.wildWait) && this.luck(bk + 'p', Math.floor(now / 20)) < BALANCE.rareSpawn.wildPresent) { this.rare.pop(); this.spawnOne(g, false); }
        }
        spots.forEach(([fx, fz], k) => {
          const key = 'est_' + S.id + '_' + k;
          if (this.dyn.has(key)) return;
          const elite = k >= 4, type = elite ? (B.elites?.[k % B.elites.length] || B.elite) : B.mobs[k % B.mobs.length];
          if (!ENEMIES[type]) return;
          const g = { cfg: { id: key, type, count: elite ? 1 : 3, x: X + fx * S.r, z: Z + fz * S.r, r: elite ? 8 : 14, lvl: [mobLevel(type, 100), mobLevel(type, 100)] }, area, cx: X + fx * S.r, cz: Z + fz * S.r, members: [], dyn: true };
          this.dyn.set(key, g);
          for (let n = 0; n < g.cfg.count; n++) this.spawnOne(g, false);
        });
      }
      for (const [k, g] of this.dyn) {
        if ((g.area || 'confins') !== area) continue;
        let near = false;
        for (const p of ps) if (Math.hypot(p.pos.x - g.cx, p.pos.z - g.cz) < C.sleepDist) { near = true; break; }
        if (near) continue;
        if (!g.none) {
          if (g.members.some((e) => !e.dead && ['chase', 'attack', 'special', 'alert'].includes(e.state))) continue;
          for (const e of g.members) if (!e.removed) e.remove();
          g.members = [];
          this.pending = this.pending.filter((p) => p.g !== g);
          this.rare = this.rare.filter((r) => r !== g);
        }
        this.dyn.delete(k);
      }
    }
  }
}

// chefe (campeão) de cada região dos Ermos
const ERMOS_BOSS = { cinzas: 'campeao_abissal', bosque: 'campeao_abissal', charneca: 'campeao_abissal', lago: 'campeao_abissal', falesias: 'campeao_osso', ossario: 'campeao_osso', cristais: 'campeao_colosso', trono: 'campeao_colosso' };
function nearestErmos(lx, lz) {
  let best = null, bd = Infinity;
  for (const [k, L] of Object.entries(ERMOS.locations)) { if (L.safe) continue; const d = Math.hypot(lx - L.x, lz - L.z) / (L.r || 100); if (d < bd) { bd = d; best = k; } }
  return best;
}
