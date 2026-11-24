import * as THREE from 'three';
import { CLASSES } from '../config/classes.js';
import { buildHorse } from '../engine/models.js';
import { makeHero } from '../engine/hero3d.js';
import { animate } from './anim.js';
import { dampAngle } from '../engine/noise.js';
import { applySkin, emitCosmetics } from './cosmetics.js';
import { ENEMIES } from '../config/enemies.js';
import { gearKey } from '../config/itemthemes.js';
import { Enemy, spikeBurst } from './enemy.js';
import { hitPlayer, spawnProjectile } from './combat.js';
import { makeWsLobby, wsServerUrl } from './wsroom.js';
import { getServer } from './servers.js';
import { MUNDO } from './mundo.js';
import { VERSION } from '../version.js';
import { isAdult } from '../core/chatfilter.js';
import { WORLD } from '../config/world.js';
import { isGated, MSG_LOCKED } from '../core/guardiao.js';

const TYPES = Object.keys(ENEMIES);
const STATES = ['idle', 'patrol', 'alert', 'chase', 'attack', 'hurt', 'flee', 'return', 'dead', 'spawn', 'special'];
const ACTS = [null, 'attack', 'slash', 'throw', 'slam', 'swipe', 'charge', 'chargeWind', 'cast', 'roar', 'swipe2', 'hurl']; // novos sempre no fim
const AREAS = ['world', 'cripta', 'ermos', 'confins', 'guardiao']; // índice vai na rede: novos sempre no fim
const PKINDS = ['pedra', 'flecha', 'arcano', 'fogo', 'neve', 'cristal', 'presente'];
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// Multiplayer em tempo real (capacidade "room" da página publicada).
// Presença: posição, classe, nível, animação, gestos, bate-papo e anúncios.
// MUNDO COMPARTILHADO: um dos jogadores (o que entrou primeiro) é o "anfitrião" e simula todos os
// monstros, eventos e o horário do dia; os demais recebem esse estado ~6x por segundo e enviam o dano
// que causam. Assim todos veem e enfrentam OS MESMOS monstros, no vale e dentro da cripta.
// Se o anfitrião sair, o próximo da fila assume automaticamente.
export const ROOM_NAME = 'vale-eldoria-1'; // servidor 1 (o 2 usa 'vale-eldoria-2', e assim por diante)
const roomOf = (sv) => 'vale-eldoria-' + sv;

export class Net {
  constructor(G) {
    this.G = G;
    this.room = null;
    this.status = 'offline';
    this.peers = new Map();
    this.lastSend = 0;
    this.lastSent = null;
    this.unsubs = [];
    this.chat = [];
    this.selfPeer = null;
    this.joinedAt = Date.now();
    this.capturing = false;        // golpe/habilidade do meu herói em andamento: efeitos vão para os outros
    this.vfxQ = []; this.vfxT = 0; this.fxWrapped = false;
    this.hostPeer = null;          // null = eu sou o anfitrião (ou estou sozinho)
    this.role = 'host';
    this.snapT = 0;
    this.dmgQ = [];
    this.dmgT = 0;
  }

  // pacote 3: o servidor diz se o Portal da Fenda está liberado para este personagem (e manda de volta quem entrou sem)
  onGuardiao(d) {
    const G = this.G;
    this.gdCid = G.state?.charId; // vale só para o personagem em jogo
    if (d.type === 's_gd') { this.gdSrv = d.ok ? 1 : 0; if (d.ok && G.state?.world?.flags) G.state.world.flags.guardiaoOk = 1; return; }
    this.gdSrv = 0;
    if (G.mode !== 'play' || !isGated(G.player?.area)) return;
    G.travel('world', WORLD.spawn.x, WORLD.spawn.z, 'Vale de Eldoria', MSG_LOCKED);
    G.later?.(1.5, () => G.ui.showMessage('Portal da Fenda', `Você voltou ao Vale.<br><b>${MSG_LOCKED}.</b>`));
  }
  // ---------- mundo compartilhado ----------
  isClient() { return this.role === 'client'; }
  // jogadores que os monstros podem atacar: o seu herói + os outros conectados (na mesma área)
  // aliados do MESMO TIME, vivos, na mesma área, a até r metros e sem a vida cheia — para a cura da Prece
  alliesNear(area, pos, r, needHp = true) {
    const out = [], pt = this.G.party?.id;
    if (!pt) return out; // sem time: a Prece não cura ninguém além de você
    for (const g of this.peers.values()) {
      if (!g.proxy || this.stale(g) || g.pr?.pt !== pt || g.proxy.area !== area || !g.proxy.alive) continue;
      if (needHp && (+g.pr?.hp || 0) >= 100) continue;
      if (Math.hypot(g.pos.x - pos.x, g.pos.z - pos.z) <= r) out.push(g);
    }
    return out;
  }
  sendHeal(ids, v, r, kind = 'h') {
    if (!this.room || !ids.length) return;
    const P = this.G.player;
    this.room.emit('fx', { type: 'hl', k: kind, to: ids.slice(0, 20), v: Math.round(v), r: Math.round(r * 10) / 10, n: this.G.state.player.name, x: Math.round(P.pos.x * 10) / 10, z: Math.round(P.pos.z * 10) / 10, ar: AREAS.indexOf(P.area) }).catch(() => {});
  }

  // lista de alvos por área, montada no máximo uma vez por quadro (era refeita centenas de vezes por quadro)
  // quem chama só lê a lista — não modificar
  targets(area) {
    const fn = this.G.frameNo || 0;
    if (this._tcF !== fn) { this._tcF = fn; this._tc = new Map(); }
    const key = area || '*';
    let out = this._tc.get(key);
    if (!out) { out = this.targetsRaw(area); this._tc.set(key, out); }
    return out;
  }
  // só os jogadores de outras telas (para acordar monstros perto deles)
  remotes() {
    const fn = this.G.frameNo || 0;
    if (this._rcF === fn) return this._rc;
    this._rcF = fn; const out = this._rc = [];
    for (const g of this.peers.values()) if (g.proxy && !this.stale(g) && g.proxy.alive) out.push(g.proxy);
    return out;
  }
  targetsRaw(area) {
    const out = [];
    const P = this.G.player;
    if (P && !MUNDO && (!area || P.area === area)) out.push(P); // mundo no servidor: ele mesmo não é alvo
    for (const g of this.peers.values()) if (g.proxy && !this.stale(g) && (!area || g.proxy.area === area) && g.proxy.alive) out.push(g.proxy);
    return out;
  }
  electHost() {
    if (!this.room || !this.selfPeer) return;
    // anfitrião = quem entrou primeiro ENTRE os que estão com o jogo aberto na tela
    // (aba em segundo plano congela no navegador, então passa a vez)
    // servidor próprio: vale a escolha dele (um anfitrião só, o mesmo para todo mundo)
    if (this.srvHost !== undefined && this.srvHost !== null) {
      const h = this.srvHost === this.selfPeer ? null : this.srvHost;
      if (h !== this.hostPeer) { this.hostPeer = h; this.setRole(h ? 'client' : 'host'); }
      return;
    }
    const meVis = document.visibilityState !== 'hidden';
    let best = { peer: this.selfPeer, j: this.joinedAt, v: meVis };
    for (const [id, g] of this.peers) {
      const j = num(g.pr.j, Infinity), v = g.pr.v !== 0;
      if ((v && !best.v) || (v === best.v && (j < best.j || (j === best.j && id < best.peer)))) best = { peer: id, j, v };
    }
    const host = best.peer === this.selfPeer ? null : best.peer;
    if (host === this.hostPeer) return;
    this.hostPeer = host;
    this.setRole(host ? 'client' : 'host');
  }
  setRole(role) {
    if (role === this.role) return;
    const G = this.G;
    this.role = role;
    if (G.mode !== 'play' || !G.spawners) return;
    // troca de papel: limpa os monstros atuais e recomeça a partir da fonte certa
    for (const e of [...G.enemies]) { if (!e.removed) { G.scene.remove(e.rig.root); e.removed = true; } }
    G.enemies.length = 0;
    G.projectiles.filter((p) => p.owner === 'enemy').forEach((p) => { p.alive = false; });
    if (G.events.active) { G.events.active = null; G.ui.eventBanner(null); }
    if (G.bossEngaged) { G.bossEngaged = null; G.ui.bossBar(null); }
    this.replicas = new Map();
    if (role === 'host') { G.spawners.init(); G.ui.toastSmall('Você agora é o anfitrião do vale.'); }
  }
  // anfitrião → todos: estado compacto dos monstros perto de qualquer jogador
  sendSnapshot() {
    const G = this.G, list = [];
    // todos os jogadores (vivos ou caídos) recebem os monstros ao redor
    const players = [G.player, ...[...this.peers.values()].map((g) => g.proxy).filter(Boolean)];
    for (const e of G.enemies) {
      if (e.removed) continue;
      let near = false;
      for (const q of players) if (q.area === e.area && Math.abs(q.pos.x - e.pos.x) < 75 && Math.abs(q.pos.z - e.pos.z) < 75) { near = true; break; }
      if (!near) continue;
      const fl = (e.dead ? 1 : 0) | (e.boss?.engaged ? 2 : 0) | (e.stun > 0 || e.freeze > 0 ? 4 : 0) | (e.minion ? 8 : 0); // 8 = chamado por chefe (sem placa de nome)
      list.push([e.nid, TYPES.indexOf(e.type), e.level, AREAS.indexOf(e.area), Math.round(e.pos.x * 10), Math.round(e.pos.z * 10), Math.round(e.yaw * 100),
        Math.round((e.hp / e.stats.maxHp) * 1000), STATES.indexOf(e.state), Math.max(0, ACTS.indexOf(e.anim.action)), Math.round((e.anim.p || 0) * 100),
        Math.round((e._wind || 0) * 100), fl, Math.round((e.anim.move || 0) * 10), e.state === 'spawn' ? Math.round(Math.max(0, e.st / 0.7) * 100) : 0]);
    }
    const ev = G.events.active;
    const evo = ev ? { ti: ev.title || ev.def?.name || 'Evento', st: ev.status || '', x: ev.site ? Math.round(ev.site.x) : null, z: ev.site ? Math.round(ev.site.z) : null, ar: AREAS.indexOf(ev.area || 'world') } : null;
    if (evo && ev.visual && ev.site) { evo.px = Math.round(ev.visual.mx * 10) / 10; evo.pz = Math.round(ev.visual.mz * 10) / 10; evo.py = Math.round(ev.visual.yaw * 100) / 100; evo.pc = ev.color || 0xd36bff; } // portal da fenda
    // um pacote por mapa onde há jogador: o servidor entrega cada um só para quem está naquele mapa
    const tod = Math.round(G.state.world.timeOfDay * 1e4) / 1e4, areas = new Set(players.map((q) => q.area));
    for (const ar of areas) {
      const ai = AREAS.indexOf(ar), part = list.filter((r) => r[3] === ai);
      this.room.emit('mob', { s: part, tod, ev: evo, ar }).catch(() => {});
    }
  }
  onMob(m) {
    if (m.sameTab) return;
    const d = m.data || {}, G = this.G;
    if (G.mode !== 'play') return;
    // estado do mundo: só aceito do anfitrião eleito
    if (d.s && d.ar && G.player && d.ar !== G.player.area) return; // monstros de outro mapa: não interessam aqui
    if (d.s && this.isClient() && m.peer === this.hostPeer) this.applySnapshot(d);
    else if (d.k !== undefined && this.isClient() && m.peer === this.hostPeer) {
      const e = this.replicas?.get(num(d.k));
      if (e) {
        if (!e.dead) { e.dead = true; e.state = 'dead'; e.deadT = 0; }
        if (Array.isArray(d.w) && d.w.length) {
          const pct = {};
          if (d.dp && typeof d.dp === 'object') for (const [k, v] of Object.entries(d.dp).slice(0, 40)) pct[String(k)] = Math.max(0, Math.min(100, num(v)));
          e.lootWinners = { w: d.w.slice(0, 3).map(String), pct };
        }
        if (!e.rewarded) {
          const c = new Set(Array.isArray(d.c) ? d.c.slice(0, 40).map(String) : []);
          const cr = G.party ? G.party.credit(e, c) : (G.time.t - e.localHit < 60 ? { share: 1 } : null);
          if (cr) { e.rewarded = true; G.onEnemyKilled(e, true, cr); }
        }
      }
    } else if (Array.isArray(d.say) && this.isClient() && m.peer === this.hostPeer) {
      // aviso de chefe (ex.: "Olhar da Lanterna! Esconda-se atrás de uma coluna")
      const [ar, title, text, x, z] = d.say, P = G.player;
      if (AREAS[ar] === P.area && Math.hypot(P.pos.x - num(x), P.pos.z - num(z)) < 45) G.ui.notice(`${String(title).slice(0, 40)} ${String(text).slice(0, 80)}`);
    } else if (d.t && this.isClient() && m.peer === this.hostPeer) {
      const [ar, kind, x, z, r, dur, col, yaw, w] = d.t;
      if (AREAS[ar] !== G.player.area) return;
      const y = G.world.groundHeight(num(x), num(z));
      if (kind === 'w') { G.fx.shock(num(x), y, num(z), num(r), num(col, 0xff4fd8), num(dur, 1)); G.fx.shock(num(x), y + 0.4, num(z), num(r), 0xffffff, num(dur, 1)); }
      if (kind === 'k' || kind === 'b' || kind === 'i') { spikeBurst(G, num(x), num(z), num(r), AREAS[ar], kind === 'i' ? 'gelo' : kind === 'b'); return; }
      if (kind === 'r') G.fx.telegraphRect(num(x), y, num(z), num(yaw), num(r), num(w, 3), num(dur, 1), num(col, 0xff3b2f));
      else G.fx.telegraphCircle(num(x), y, num(z), num(r), num(dur, 1), num(col, 0xff3b2f));
    } else if (d.p && this.isClient() && m.peer === this.hostPeer) {
      const [ar, x, y, z, dx, dz, sp, range, vy, pk, pc, ps] = d.p.map((v) => num(v));
      if (AREAS[ar] !== G.player.area) return;
      spawnProjectile(G, { owner: 'enemy', kind: PKINDS[pk] || 'pedra', color: pc || undefined, x, y, z, dx, dz, speed: sp, range, radius: 0.5, dmg: 0, visual: true, area: AREAS[ar], vy, scale: ps || 1 });
    } else if (d.h && d.h === this.selfPeer && m.peer === this.hostPeer) {
      // um monstro (simulado pelo anfitrião) acertou o meu herói
      hitPlayer(G, Math.min(5000, Math.max(0, num(d.dmg))), { name: String(d.n || 'Monstro').slice(0, 40), area: G.player.area, level: num(d.l, 1), fx: d.x && typeof d.x === 'object' ? d.x : null });
    } else if (d.d && d.to === this.selfPeer && !this.isClient()) {
      // dano que outro jogador causou nos monstros que eu simulo
      for (const it of d.d.slice(0, 40)) {
        const e = G.enemies.find((x) => x.nid === num(it[0]));
        if (!e || e.dead) continue;
        const dmg = Math.min(5000, Math.max(0, num(it[1])));
        e.takeDamage(dmg, { peer: m.peer, knock: num(it[6]), dirX: num(it[7]), dirZ: num(it[8]) });
        if (num(it[2]) > 0) e.applyStun(Math.min(4, num(it[2])));
        if (num(it[3]) > 0) e.applySlow(Math.max(0.2, num(it[3])), Math.min(6, num(it[4], 2)));
        if (num(it[5]) > 0) e.applyFreeze(Math.min(4, num(it[5])));
      }
    }
  }
  applySnapshot(d) {
    const G = this.G;
    if (!this.replicas) this.replicas = new Map();
    const seen = new Set();
    for (const r of (d.s || []).slice(0, 220)) {
      const [nid, ti, lvl, ar, x, z, yaw, hp, st, act, p, wind, fl, mv, spawn] = r.map((v) => num(v));
      const type = TYPES[ti], area = AREAS[ar];
      if (!type || !area) continue;
      seen.add(nid);
      let e = this.replicas.get(nid);
      if (e && e.removed && !(fl & 1)) { this.replicas.delete(nid); e = null; }
      if (!e) {
        if (fl & 1) continue; // já morto: não cria
        e = new Enemy(G, type, Math.max(1, Math.min(500, lvl)), { x: x / 10, z: z / 10, area, replica: true, nid, spawnAnim: spawn > 0 });
        G.enemies.push(e);
        this.replicas.set(nid, e);
      }
      e.netApply({ x: x / 10, z: z / 10, yaw: yaw / 100, hp: Math.max(0, Math.min(1, hp / 1000)), st: STATES[st] || 'idle', act: ACTS[act] || null, p: p / 100, wind: wind / 100, dead: !!(fl & 1), eng: !!(fl & 2), stun: !!(fl & 4), minion: !!(fl & 8), mv: mv / 10, spawn: spawn / 100 });
    }
    // some do estado (longe de todos ou removido pelo anfitrião)
    for (const [nid, e] of this.replicas) {
      if (seen.has(nid)) continue;
      if (G.time.t - (e.netSeen || 0) > 3 && !e.removed) { G.scene.remove(e.rig.root); e.removed = true; G.onEnemyRemoved(e); }
      if (e.removed) this.replicas.delete(nid);
    }
    // horário do dia e evento do anfitrião
    if (Number.isFinite(d.tod)) {
      const w = G.state.world;
      if (this.room?.clockOff != null) { /* dia/noite já vem do relógio do servidor */ } else {
      let diff = d.tod - w.timeOfDay; if (diff > 0.5) diff -= 1; if (diff < -0.5) diff += 1;
      w.timeOfDay = (w.timeOfDay + diff * 0.2 + 1) % 1;
      }
    }
    if (d.ev) {
      const ev = { title: String(d.ev.ti || 'Evento').slice(0, 60), status: String(d.ev.st || '').slice(0, 80), def: { name: 'Evento' }, remote: true, area: AREAS[num(d.ev.ar)] || 'world', site: d.ev.x !== null ? { x: num(d.ev.x), z: num(d.ev.z) } : null };
      G.events.active = ev; G.ui.eventBanner(ev);
      // o portal da fenda aparece também para quem não é o anfitrião
      G.events.syncRemotePortal(d.ev.px != null ? { area: ev.area, x: num(d.ev.px), z: num(d.ev.pz), yaw: num(d.ev.py), color: num(d.ev.pc) | 0 } : null);
    } else if (G.events.active?.remote) { G.events.active = null; G.ui.eventBanner(null); G.events.syncRemotePortal(null); }
    // chefe: barra de vida para quem está perto
    const boss = [...this.replicas.values()].find((e) => e.boss && !e.dead && e.boss.engaged && e.area === G.player.area && Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z) < 45);
    if (boss && G.bossEngaged !== boss) { G.bossEngaged = boss; G.ui.bossBar(boss); }
    else if (!boss && G.bossEngaged?.replica) { G.bossEngaged = null; G.ui.bossBar(null); }
  }
  // cliente → anfitrião
  sendDamage(e, dmg, o = {}) {
    if (!this.isClient() || !this.room) return;
    this.dmgQ.push([e.nid, Math.round(dmg), o.stun || 0, o.slow || 0, o.slowDur || 0, o.freeze || 0, o.knock || 0, Math.round((o.dirX || 0) * 100) / 100, Math.round((o.dirZ || 0) * 100) / 100]);
  }
  // anfitrião → jogador atingido
  sendHit(peer, dmg, src = {}) {
    if (!this.room) return;
    this.room.emit('mob', { h: peer, dmg: Math.round(dmg * 10) / 10, n: src.name || '', l: src.level || 1, x: src.fx || undefined }).catch(() => {});
  }
  mobKilled(e) {
    if (!this.room || this.isClient() || !this.peers.size) return;
    // junto com o abate vai a lista de quem causou dano (para o time dividir XP e ganhar o abate)
    const c = [...e.contrib].slice(0, 40);
    if (this.G.time.t - e.localHit < 60 && this.selfPeer) c.push(this.selfPeer);
    const lw = e.lootWinners;
    this.room.emit('mob', { k: e.nid, c, w: lw ? lw.w.slice(0, 3) : undefined, dp: lw ? lw.pct : undefined, gb: e.type === 'boss_fenda' ? 1 : undefined }).catch(() => {});
  }
  say(area, title, text, x, z) {
    if (!this.room || this.isClient() || !this.peers.size) return;
    this.room.emit('mob', { say: [AREAS.indexOf(area), title, text, Math.round(x), Math.round(z)] }).catch(() => {});
  }
  tele(area, kind, x, z, r, dur, color, yaw = 0, w = 0) {
    if (!this.room || this.isClient() || !this.peers.size) return;
    this.room.emit('mob', { t: [AREAS.indexOf(area), kind, Math.round(x * 10) / 10, Math.round(z * 10) / 10, r, Math.round(dur * 100) / 100, color, Math.round(yaw * 100) / 100, w] }).catch(() => {});
  }
  proj(area, x, y, z, dx, dz, sp, range, vy, kind = 'pedra', color = 0, scale = 1) {
    if (!this.room || this.isClient() || !this.peers.size) return;
    const R = (v) => Math.round(v * 100) / 100;
    this.room.emit('mob', { p: [AREAS.indexOf(area), R(x), R(y), R(z), R(dx), R(dz), R(sp), R(range), R(vy), PKINDS.indexOf(kind), color || 0, R(scale)] }).catch(() => {});
  }

  async connect() {
    try {
      let lobby = null;
      this.server = getServer(); // cada servidor é um mundo separado (jogadores, monstros, eventos e bate-papo)
      if (window.claude?.use) lobby = await window.claude.use('room');
      else {
        // fora do Claude: servidor próprio do jogo (server/server.js) no mesmo endereço do site
        const url = wsServerUrl(this.server);
        if (!url) { this.status = 'offline'; return false; }
        lobby = makeWsLobby(url); this.fast = true; this._pingHook = true;
      }
      if (!lobby) { this.status = 'indisponível'; return false; }
      this.lobby = lobby;
      this.room = await lobby.join(roomOf(this.server));
      if (this.room.auth && this.G.saver?.serverToken) this.room.auth(this.G.saver.serverToken); // servidor descobre a conta (selo de GM)
      if (this._pingHook) { let last = 0; this.room.onPing = () => { if (performance.now() - last > 4000) { last = performance.now(); this.G.ui?.refreshNet?.(); } }; }
      this.status = 'conectado';
      this.unsubs.push(this.room.onPeers((ch) => this.onPeers(ch), () => { this.status = 'desconectado'; }));
      this.unsubs.push(this.room.on('chat', (m) => this.onChat(m)));
      this.unsubs.push(this.room.on('fx', (m) => this.onFx(m)));
      this.unsubs.push(this.room.on('mob', (m) => this.onMob(m)));
      // saiu da tela (trocou de app/aba): avisa na hora para outro jogador assumir o mundo
      document.addEventListener('visibilitychange', () => { this.lastSent = null; this.lastSend = 1; this.update(0); this.electHost(); });
      this.unsubs.push(this.room.onConnection((c) => { this.status = c ? 'conectado' : 'reconectando'; this.G.ui.refreshNet?.(); }));
      this.G.ui.refreshNet?.();
      return true;
    } catch (e) {
      this.status = 'indisponível';
      return false;
    }
  }

  onPeers(ch) {
    if ('host' in ch) this.srvHost = ch.host; // servidor próprio: ele escolhe o anfitrião (igual para todos)
    const seen = new Set();
    for (const p of ch.peers) {
      if (p.sameTab) { this.selfPeer = p.peer; continue; }
      if (p.kind !== 'viewer') continue;
      seen.add(p.peer);
      const pr = p.presence || {};
      if (!pr.c || !CLASSES[pr.c]) continue;
      // o MESMO personagem (sessão antiga que ainda não caiu, outra aba ou aparelho): não desenha um "clone"
      if (pr.id && pr.id === this.G.state?.charId) {
        if (!p.isMe) continue; // sessão velha do servidor: o servidor derruba sozinho
        if (!this.warnedDup) { this.warnedDup = true; this.G.ui.toastSmall('Este personagem também está aberto em outra aba ou aparelho. Feche a outra para não misturar o progresso.'); }
        continue;
      }
      // outro jogador com duas sessões do mesmo personagem (saiu e entrou): fica só a mais nova
      if (pr.id) { const dup = ch.peers.find((q) => q !== p && !q.sameTab && q.presence?.id === pr.id && (q.updatedAt || 0) > (p.updatedAt || 0)); if (dup) continue; }
      let ghost = this.peers.get(p.peer);
      if (!ghost) ghost = this.addGhost(p.peer, pr);
      if (!ghost.pr || ghost.pr.hb !== pr.hb || ghost.pr.x !== pr.x || ghost.pr.z !== pr.z) ghost.seenAt = Date.now();
      ghost.pr = pr;
      ghost.guest = p.guest;
      ghost.isMe = p.isMe;
      ghost.updatedAt = p.updatedAt;
    }
    for (const [id, g] of this.peers) if (!seen.has(id)) this.removeGhost(id);
    this.electHost();
    this.G.ui.refreshNet?.();
  }

  // selo "GM": só vale vindo do servidor próprio (ele confere a conta pelo token; o jogador não consegue fingir)
  isGm(g) { return !!(this.fast && g?.pr?.gm === 1); }

  // jogador parado sem sinal há mais de 12 s (conexão morta que ainda não caiu): some da tela
  stale(g) { if (g.pr?.lg) return false; /* personagem que ficou no mundo (block do PvP) */ return g.pr?.hb !== undefined && Date.now() - (g.seenAt || 0) > 12000; }

  // armadura que os outros veem: "slot:tipo:raridade" separados por |
  eqCode(e) { if (!e) return ''; return ['helm', 'chest', 'shield', 'legs', 'boots', 'back', 'gloveL', 'gloveR'].map((k) => e[k] ? `${k}:${e[k].wkind || ''}:${e[k].rarity || 'comum'}:${gearKey(e[k]) || ''}` : '').filter(Boolean).join('|'); }
  eqOf(pr) {
    const o = { weapon: pr.w ? { wkind: pr.w, rarity: pr.wr || 'comum', src: pr.wt || undefined } : null, helm: null, chest: null, ring: null };
    for (const part of String(pr.eq || '').split('|')) { const [k, wk, r, src] = part.split(':'); if (['helm', 'chest', 'shield', 'legs', 'boots', 'back', 'gloveL', 'gloveR'].includes(k)) o[k] = { wkind: wk || undefined, rarity: r || 'comum', slot: k, src: src || undefined }; }
    return o;
  }
  addGhost(id, pr) {
    const rig = makeHero(CLASSES[pr.c], { g: pr.gd === 'F' ? 'F' : 'M', skin: typeof pr.sk === 'string' ? pr.sk : 'campones' });
    rig.setEquipment(this.eqOf(pr));
    applySkin(rig, typeof pr.sk === 'string' ? pr.sk : 'campones', pr.gd === 'F' ? 'F' : 'M');
    this.G.scene.add(rig.root);
    const g = { id, rig, pr, pos: new THREE.Vector3(pr.x || 0, pr.y || 0, pr.z || 0), yaw: pr.r || 0, anim: { move: 0, t: 0, action: null, p: 0, emote: null, hurt: 0, dead: 0 }, actT: 0, lastAct: null, equipKey: (pr.w || '') + (pr.wr || '') + (pr.wt || '') + (pr.sk || '') + (pr.gd || '') + (pr.eq || '') };
    // "alvo" que os monstros do anfitrião podem perseguir e atacar
    g.proxy = { remote: true, peer: id, pos: g.pos, vel: new THREE.Vector3(), radius: 0.5, invuln: 0, get alive() { return !g.pr.d && g.pr.c; }, get area() { return g.pr.ar || 'world'; }, get lure() { return Math.max(0, Math.min(0.25, (+g.pr.lu || 0) / 100)); } };
    this.peers.set(id, g);
    return g;
  }

  // os modelos 3D terminaram de carregar: troca o boneco antigo dos outros jogadores
  rebuildRigs() {
    for (const g of this.peers.values()) {
      if (g.rig.kind === 'skinhero' || !g.pr?.c) continue;
      const pr = g.pr, gd = pr.gd === 'F' ? 'F' : 'M', sk = typeof pr.sk === 'string' ? pr.sk : 'campones';
      const rig = makeHero(CLASSES[pr.c], { g: gd, skin: sk });
      if (rig.kind !== 'skinhero') return;
      rig.setEquipment(this.eqOf(pr)); applySkin(rig, sk, gd);
      rig.root.visible = g.rig.root.visible; rig.root.position.copy(g.rig.root.position); rig.root.rotation.y = g.rig.root.rotation.y;
      this.G.scene.remove(g.rig.root); this.G.scene.add(rig.root); g.rig = rig;
    }
  }

  removeGhost(id) {
    this.G.loot?.onPeerLeft?.(id);
    const g = this.peers.get(id);
    if (!g) return;
    this.G.scene.remove(g.rig.root);
    if (g.horse) this.G.scene.remove(g.horse.root);
    this.peers.delete(id);
  }

  onChat(m) {
    const text = String(m.data?.text || '').slice(0, 140);
    if (!text || isAdult(text)) return; // +18 não aparece para ninguém
    const name = String(m.data?.n || 'Viajante').slice(0, 16);
    const gm = this.fast && m.data?.gm === 1; // selo só vale vindo do servidor próprio
    this.chat.push({ name, text, me: m.sameTab, t: Date.now(), gm });
    if (this.chat.length > 40) this.chat.shift();
    this.G.ui.chatMessage({ name, text, me: m.sameTab, guest: m.guest, gm });
    const ghost = this.peers.get(m.peer);
    if (ghost) ghost.bubble = { text, t: 5 };
  }

  onFx(m) {
    if (m.sameTab) return;
    const d = m.data || {};
    const name = String(d.n || 'Viajante').slice(0, 16);
    if (d.type === 'pa') { const gh = this.peers.get(m.peer); if (gh && typeof d.a === 'string') { gh.act = { name: d.a.slice(0, 16), t: 0, dur: Math.max(0.1, Math.min(4, num(d.d, 0.4))), v: num(d.v) | 0 }; gh.actFromEvent = this.G.time.t; } return; }
    if (d.type === 'vx') { this.onRemoteVfx(m, d); return; }
    if (m.peer === 'server' && (d.type === 's_gd' || d.type === 's_gdvolta')) { this.onGuardiao(d); return; }
    if (d.type === 'hl') { // cura da Prece vinda de outro jogador: só vale se for para mim, na mesma área e perto de verdade
      const P = this.G.player;
      if (this.G.mode !== 'play' || !Array.isArray(d.to) || !d.to.includes(this.selfPeer) || AREAS[num(d.ar)] !== P.area) return;
      const gh = this.peers.get(m.peer), pt = this.G.party?.id;
      if (!pt || !gh || gh.pr?.pt !== pt) return; // só vale entre jogadores do mesmo time
      const r = Math.min(13, num(d.r, 6)), sx = gh.pos.x, sz = gh.pos.z;
      if (Math.hypot(P.pos.x - sx, P.pos.z - sz) > r + 4) return;
      const v = Math.max(1, Math.min(1500, Math.round(num(d.v)))); // a maior poção cura 900
      this.G.receivePrece(name, v, d.k === 'r' ? 'r' : 'h');
      return;
    }
    if (d.type === 'natal') { if (m.peer === this.hostPeer && this.G.mode === 'play') this.G.natal?.onMsg(d); return; }
    if (d.type === 'announce') { const tx = String(d.text || '').slice(0, 120); if (tx.startsWith('dropou:')) return; /* o que os outros ganham não aparece para você */ this.G.ui.chatMessage({ name, text: tx, system: true }); }
    if (typeof d.type === 'string' && d.type.startsWith('tr_') && this.G.trade) { if (this.G.mode === 'play') this.G.trade.onFx(m, d); return; }
    if (typeof d.type === 'string' && d.type.startsWith('g_') && this.G.loot) { if (this.G.mode === 'play') this.G.loot.onFx(m, d); return; }
    if (typeof d.type === 'string' && d.type.startsWith('s_') && this.G.social) { if (this.G.mode === 'play') this.G.social.onFx(m, d); return; }
    if (typeof d.type === 'string' && d.type.startsWith('v_') && this.G.pvp) { if (this.G.mode === 'play') this.G.pvp.onMsg(m, d); return; }
    if (typeof d.type === 'string' && d.type[0] === 'p' && this.G.party) { this.G.party.onFx(m, d); return; }
    if (d.type === 'evr' && d.r && m.peer === this.hostPeer && this.G.mode === 'play') {
      const r = d.r, area = AREAS[num(r.ar)], P = this.G.player;
      const ok = area && P.area === area && P.alive !== false && Math.hypot(P.pos.x - num(r.x), P.pos.z - num(r.z)) < 70;
      const tables = ['event', 'event2', 'event3'];
      if (ok) this.G.events.giveReward({ name: String(r.name || 'Evento').slice(0, 40), tier: Math.max(1, Math.min(5, num(r.tier, 1))), level: Math.max(1, Math.min(60, num(r.level, 1))), trophy: String(r.trophy || ''), table: tables.includes(r.table) ? r.table : 'event', x: num(r.x), z: num(r.z), area });
      return;
    }
    const ghost = this.peers.get(m.peer);
    if (ghost && d.type === 'levelup') this.G.fx.beam(ghost.pos.x, ghost.pos.y, ghost.pos.z, 0xffd36b, 14, 1.4, 1.2);
  }

  sendChat(text) {
    const t = String(text || '').trim().slice(0, 140);
    if (!t || !this.room) return false;
    if (this.G.social && !this.G.social.checkMessage(t)) return true; // +18: bloqueia (e o chat fica 30 min fechado)
    this.room.emit('chat', { text: t, n: this.G.state.player.name }).catch(() => this.G.ui.toastSmall('Bate-papo indisponível para seu nível de acesso.'));
    return true;
  }

  // fim de evento: o anfitrião avisa e cada jogador perto do evento ganha a sua recompensa
  eventReward(r) {
    if (!this.room || this.isClient() || !this.peers.size) return;
    this.room.emit('fx', { type: 'evr', r: { name: r.name, tier: r.tier, level: r.level, trophy: r.trophy, table: r.table, x: Math.round(r.x), z: Math.round(r.z), ar: AREAS.indexOf(r.area) } }).catch(() => {});
  }

  announce(text) {
    if (!this.room) return;
    this.room.emit('fx', { type: 'announce', text, n: this.G.state.player.name }).catch(() => {});
  }

  levelUp() {
    if (!this.room) return;
    this.room.emit('fx', { type: 'levelup', n: this.G.state.player.name }).catch(() => {});
    this.announce(`alcançou o nível ${this.G.state.player.level}!`);
  }

  update(dt) {
    const G = this.G, P = G.player;
    if (this.vfxQ.length) this.flushVfx(dt);
    if (this.room && P && G.mode === 'play') {
      this.lastSend += dt;
      if (this.lastSend > (this.fast ? 0.1 : 0.12)) { // 10 vezes por segundo (antes 20): metade do tráfego
        this.lastSend = 0;
        const w = G.state.player.equipment.weapon;
        const pr = {
          vv: VERSION, // o servidor isola quem está numa versão antiga
          n: G.state.player.name, c: P.cls.id, l: G.state.player.level,
          x: Math.round(P.pos.x * 100) / 100, y: Math.round(P.pos.y * 100) / 100, z: Math.round(P.pos.z * 100) / 100,
          r: Math.round(P.yaw * 100) / 100, a: P.action?.name || (P.anim.move > 0.1 ? 'run' : 'idle'), m: Math.round(P.anim.move * 10) / 10,
          e: P.emote || null, ar: P.area, d: P.alive ? 0 : 1, w: w?.wkind || null, wr: w?.rarity || null, wt: gearKey(w),
          eq: this.eqCode(G.state.player.equipment),
          sk: G.cosmetics?.equipped('skin'), gd: G.state.player.look?.g === 'F' ? 'F' : 'M', fx: G.cosmetics?.equipped('fx'),
          id: G.state.charId || null, j: this.joinedAt, v: document.visibilityState === 'hidden' ? 0 : 1, mb: G.isTouch ? 1 : 0,
          pt: G.party?.id || null, hb: Math.floor(Date.now() / 2000) % 1000, lu: Math.round((P.stats.lure || 0) * 100), hp: Math.round((P.hp / P.stats.maxHp) * 100), mt: P.mounted ? (P.horseKind === 'lobo' ? 2 : 1) : 0, sw: P.swimming ? 1 : 0, ...(G.pvp?.presence() || { pk: 0 }),
        };
        if (MUNDO) { for (const k of Object.keys(pr)) delete pr[k]; Object.assign(pr, { srv: 1, vv: VERSION, j: this.joinedAt, v: 1, hb: Math.floor(Date.now() / 2000) % 1000 }); } // invisível: não é jogador
        const key = JSON.stringify(pr);
        if (key !== this.lastSent) { this.lastSent = key; this.room.presence(pr).catch(() => {}); }
      }
    }
    // mundo compartilhado
    if (this.room && G.mode === 'play') {
      if (!this.isClient() && this.peers.size) { this.snapT += dt; if (this.snapT >= (this.fast ? 0.066 : 0.16)) { this.snapT = 0; this.sendSnapshot(); } }
      if (this.isClient() && this.dmgQ.length) { this.dmgT += dt; if (this.dmgT >= (this.fast ? 0.033 : 0.08)) { this.dmgT = 0; this.room.emit('mob', { d: this.dmgQ.splice(0, 40), to: this.hostPeer }).catch(() => {}); } }
    }
    // fantasmas interpolados
    for (const g of this.peers.values()) {
      if (g.proxy && dt > 0) { const px = g.pos.x, pz = g.pos.z; g._lx ??= px; g._lz ??= pz; g.proxy.vel.set((px - g._lx) / dt, 0, (pz - g._lz) / dt); g._lx = px; g._lz = pz; }
      const pr = g.pr;
      // longe (além de ~65 m, dentro da neblina) não desenha nem anima o outro jogador — pesava muito com gente na vila
      const vis = pr.ar === P?.area && G.mode === 'play' && !this.stale(g) && Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) < 65 * Math.min(1.3, G.viewMul || 1);
      g.rig.root.visible = vis;
      // previsão: anda um pouco à frente na direção em que o outro jogador está indo (tira o atraso da rede)
      if (g._lastPrX !== pr.x || g._lastPrZ !== pr.z) {
        const now = G.time.t, dtp = Math.min(0.5, Math.max(0.02, now - (g._lastPrT || now - 0.1)));
        if (g._lastPrX !== undefined) { const vx = ((pr.x || 0) - g._lastPrX) / dtp, vz = ((pr.z || 0) - g._lastPrZ) / dtp; const sp = Math.hypot(vx, vz); g.vx = sp < 30 ? vx : 0; g.vz = sp < 30 ? vz : 0; }
        g._lastPrX = pr.x; g._lastPrZ = pr.z; g._lastPrT = now;
      }
      const age = Math.min(0.15, G.time.t - (g._lastPrT || 0)), moving = (pr.m || 0) > 0.05;
      const tx = (pr.x || 0) + (moving ? (g.vx || 0) * age : 0), tz = (pr.z || 0) + (moving ? (g.vz || 0) * age : 0);
      const k = 1 - Math.exp(-14 * dt);
      if (Math.hypot(tx - g.pos.x, tz - g.pos.z) > 12) { g.pos.x = tx; g.pos.z = tz; }
      g.pos.x += (tx - g.pos.x) * k; g.pos.z += (tz - g.pos.z) * k; g.pos.y += ((pr.y || 0) - g.pos.y) * k;
      if (!vis) continue;
      g.yaw = dampAngle(g.yaw, pr.r || 0, 12, dt);
      const key = (pr.w || '') + (pr.wr || '') + (pr.wt || '') + (pr.sk || '') + (pr.gd || '') + (pr.eq || '');
      if (key !== g.equipKey) { g.equipKey = key; g.rig.setEquipment(this.eqOf(pr)); applySkin(g.rig, typeof pr.sk === 'string' ? pr.sk : 'campones', pr.gd === 'F' ? 'F' : 'M'); }
      if ((pr.fx || pr.au) && Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) < 45) {
        if (g.rig.weapon && pr.fx) g.rig.root.updateMatrixWorld(true);
        // outros jogadores: metade das partículas (o jogo fica leve com muita gente) e o rastro nas costas quando se mexem
        g._mv = g._mv || {}; g._mv.moving = (pr.m || 0) > 0.12 || !!g.act || !!g.anim.action; g._mv.yaw = g.yaw; g._mv.rate = 0.5;
        emitCosmetics(G, g.pos, g.rig.weapon || null, String(pr.fx || ''), '', G.time.t, dt, g._mv);
      }
      g.anim.t += dt;
      g.anim.move = pr.m || 0;
      { // outro jogador andando de lado/de costas enquanto ataca: pernas para onde ele vai
        const vx = g.vx || 0, vz = g.vz || 0;
        g.anim.mvRel = (pr.m || 0) > 0.12 && Math.hypot(vx, vz) > 0.8 ? Math.atan2(vx, vz) - g.yaw : 0;
      }
      if (g.act) {
        // ação recebida na hora (golpe, habilidade, esquiva): toca com a duração e a variação certas
        g.act.t += dt;
        g.anim.action = g.act.name; g.anim.p = Math.min(1, g.act.t / g.act.dur); g.anim.variant = g.act.v;
        if (g.act.t >= g.act.dur) { g.act = null; g.actFromEvent = G.time.t; }
      } else {
        const act = ['run', 'idle'].includes(pr.a) || G.time.t - (g.actFromEvent || -9) < 0.6 ? null : pr.a;
        if (act !== g.lastAct) { g.lastAct = act; g.actT = 0; }
        g.actT += dt;
        g.anim.action = act;
        g.anim.p = act ? Math.min(1, g.actT / 0.45) : 0;
      }
      g.anim.emote = pr.e;
      g.anim.swim = (g.anim.swim || 0) + ((pr.sw ? 1 : 0) - (g.anim.swim || 0)) * Math.min(1, dt * 6); if (!pr.sw && g.anim.swim < 0.03) g.anim.swim = 0;
      g.anim.dead = pr.d ? Math.min(1, (g.anim.dead || 0) + dt * 2) : 0;
      g.rig.root.position.copy(g.pos);
      g.rig.root.rotation.y = g.yaw;
      // outro jogador montado no cavalo
      if (pr.mt && vis) {
        const hk = pr.mt === 2 ? 'lobo' : 'cavalo';
        if (g.horse && g.horseKind !== hk) { G.scene.remove(g.horse.root); g.horse = null; }
        if (!g.horse) { g.horse = buildHorse(hk); g.horseKind = hk; g.horseAnim = { move: 0, t: 0, action: null, p: 0 }; }
        if (!g.horse.root.parent) G.scene.add(g.horse.root);
        g.horse.root.position.copy(g.pos); g.horse.root.rotation.y = g.yaw;
        g.horseAnim.move = Math.min(1, pr.m || 0); g.horseAnim.t += dt;
        animate(g.horse, g.horseAnim, dt);
        g.rig.root.position.y += 0.62 + g.horse.body.position.y;
        const mv = g.anim.move; g.anim.move = 0;
        animate(g.rig, g.anim, dt);
        g.anim.move = mv;
        const R = g.rig;
        if (R.legL && R.legR) { R.legL.rotation.set(-1.35, 0, 0.32); R.legR.rotation.set(-1.35, 0, -0.32); }
        if (R.kneeL && R.kneeR) { R.kneeL.rotation.set(1.45, 0, 0); R.kneeR.rotation.set(1.45, 0, 0); }
      } else {
        if (g.horse?.root.parent) G.scene.remove(g.horse.root);
        animate(g.rig, g.anim, dt);
      }
      if (g.bubble) { g.bubble.t -= dt; if (g.bubble.t <= 0) g.bubble = null; }
    }
  }

  count() { return this.peers.size; }

  // ---------- animações e efeitos do meu herói para os outros jogadores ----------
  sendAction(name, dur, variant) {
    if (!this.room || !this.peers.size || !name) return;
    this.room.emit('fx', { type: 'pa', a: String(name).slice(0, 16), d: Math.round(dur * 100) / 100, v: variant | 0 }).catch(() => {});
  }

  // roda fn registrando os efeitos visuais que ela cria (e os que ela agenda) para mandar aos outros
  capture(fn) {
    this.wrapFx();
    const was = this.capturing;
    this.capturing = !!(this.room && this.peers.size);
    try { return fn(); } finally { this.capturing = was; }
  }

  wrapFx() {
    if (this.fxWrapped || !this.G.fx) return;
    this.fxWrapped = true;
    const fx = this.G.fx, self = this;
    for (const m of VFX_METHODS) {
      const orig = fx[m];
      if (typeof orig !== 'function') continue;
      fx[m] = function (...args) {
        if (self.capturing && self.vfxQ.length < 80) {
          const a = args.map(packArg);
          if (a.every((v) => v !== undefined)) self.vfxQ.push([VFX_METHODS.indexOf(m), a]);
        }
        return orig.apply(this, args);
      };
    }
  }

  recordProjectile(p) {
    if (this.vfxQ.length >= 80) return;
    const R = (v) => Math.round((v || 0) * 100) / 100;
    this.vfxQ.push([-1, [p.kind, R(p.x), R(p.y), R(p.z), R(p.dx), R(p.dz), R(p.speed), R(p.range), p.color ?? null, p.trail ?? null, R(p.trailSize), R(p.radius), R(p.vy), p.homing ? 1 : 0]]);
  }

  flushVfx(dt) {
    this.vfxT += dt;
    if (!this.vfxQ.length || this.vfxT < 0.05) return;
    this.vfxT = 0;
    const l = this.vfxQ.splice(0, 40);
    if (!this.room || !this.peers.size) return;
    this.room.emit('fx', { type: 'vx', ar: AREAS.indexOf(this.G.player.area), l }).catch(() => {});
  }

  onRemoteVfx(m, d) {
    const G = this.G, P = G.player;
    if (!P || G.mode !== 'play' || AREAS[num(d.ar)] !== P.area || !Array.isArray(d.l)) return;
    const ghost = this.peers.get(m.peer);
    if (ghost && Math.hypot(ghost.pos.x - P.pos.x, ghost.pos.z - P.pos.z) > 90) return; // longe demais: não desenha
    for (const it of d.l.slice(0, 40)) {
      if (!Array.isArray(it) || !Array.isArray(it[1])) continue;
      const [mi, a] = it;
      try {
        if (mi === -1) {
          const [kind, x, y, z, dx, dz, speed, range, color, trail, trailSize, radius, vy] = a;
          if (!PKINDS.includes(kind)) continue;
          spawnProjectile(G, { owner: 'player', visual: true, kind, x: num(x), y: num(y), z: num(z), dx: num(dx), dz: num(dz), speed: Math.min(80, num(speed, 30)), range: Math.min(40, num(range, 14)), color: color ?? undefined, trail: trail ?? undefined, trailSize: num(trailSize, 0.3), radius: num(radius, 0.5), vy: num(vy), area: P.area });
        } else {
          const name = VFX_METHODS[mi];
          if (name && typeof G.fx[name] === 'function') G.fx[name](...a.map(unpackArg));
        }
      } catch { /* efeito inválido: ignora */ }
    }
  }
}

// efeitos que podem ser repetidos nos outros aparelhos (todos recebem só números, cores e posições)
const VFX_METHODS = ['ring', 'slash', 'telegraphCircle', 'telegraphRect', 'explosion', 'beam', 'dome', 'shards', 'cracks', 'scorch', 'debris', 'dust', 'shock', 'burst', 'fallingArrow', 'emit', 'hit'];
function packArg(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Math.round(v * 1000) / 1000;
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  if (Array.isArray(v)) return v.every((x) => typeof x === 'number') ? v.map((x) => Math.round(x * 1000) / 1000) : undefined;
  if (typeof v === 'object') {
    if ('x' in v && 'z' in v && typeof v.x === 'number') return { x: Math.round(v.x * 100) / 100, y: Math.round((v.y || 0) * 100) / 100, z: Math.round(v.z * 100) / 100 };
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (typeof x === 'function' || (x && typeof x === 'object' && !Array.isArray(x))) return undefined; o[k] = Array.isArray(x) ? x.slice(0, 6) : x; }
    return o;
  }
  return undefined;
}
function unpackArg(v) { return v && typeof v === 'object' && !Array.isArray(v) && 'x' in v && 'z' in v ? new THREE.Vector3(v.x, v.y || 0, v.z) : v; }
