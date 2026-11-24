import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { EVENT_SITES, LOCATIONS, ERMOS } from '../config/world.js';
import { MATERIALS, TROPHY_OF } from '../config/items.js';
import { xpToNext } from '../core/progression.js';
import { makeStack, rollLoot } from '../core/items.js';
import { rng } from '../core/rng.js';
import { randomSpot, awayFromFights } from './sites.js';

// Portal da fenda: arco de pedra com runas e um véu brilhante. Fica PARADO, virado para quem abriu.
export function buildPortal(G, x, y, z, yaw, color) {
  const group = new THREE.Group();
  group.position.set(x, y, z); group.rotation.y = yaw;
  const stone = new THREE.MeshLambertMaterial({ color: 0x4a4458, flatShading: true });
  const stoneD = new THREE.MeshLambertMaterial({ color: 0x2e2a38, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color });
  const add = (geo, mat, px, py, pz, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.z = rz; group.add(m); return m; };
  // base, colunas e arco de blocos
  add(new THREE.BoxGeometry(6.4, 0.5, 2.2), stoneD, 0, 0.25, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.9, 4.6, 1.2), stone, s * 2.6, 2.6, 0);
    add(new THREE.BoxGeometry(1.2, 0.5, 1.5), stoneD, s * 2.6, 0.6, 0);
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.22, 0.22, 0.05), glow, s * 2.6, 1.6 + k * 1.1, 0.62);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * (i / 6);
    add(new THREE.BoxGeometry(1.0, 0.8, 1.2), i % 2 ? stoneD : stone, Math.cos(a) * 2.6, 4.9 + Math.sin(a) * 1.4, 0, a - Math.PI / 2);
  }
  add(new THREE.OctahedronGeometry(0.45), glow, 0, 6.6, 0.2);
  // véu da fenda + ondas que pulsam (não giram)
  const veil = add(new THREE.CircleGeometry(2.1, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 3.2, 0);
  veil.scale.set(1.05, 1.45, 1);
  const waves = [];
  for (let i = 0; i < 3; i++) { const w = add(new THREE.RingGeometry(1.7, 2.0, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 3.2, 0.02 + i * 0.01); w.scale.y = 1.4; waves.push(w); }
  // enfeites: braseiros nas colunas, círculo de runas no chão, pedras e cristais que orbitam
  const fire = new THREE.MeshBasicMaterial({ color: 0xffa850 });
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.55, 0.4, 0.4, 8), stoneD, s * 2.6, 5.1, 0); add(new THREE.ConeGeometry(0.35, 0.9, 6), fire, s * 2.6, 5.7, 0); }
  const addMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const rune = add(new THREE.RingGeometry(3.9, 4.3, 48), addMat(color, 0.45), 0, 0.08, 0); rune.rotation.x = -Math.PI / 2;
  const rune2 = add(new THREE.RingGeometry(2.6, 2.75, 6), addMat(color, 0.35), 0, 0.09, 0); rune2.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; if (Math.abs(Math.cos(a)) > 0.8) continue; const r = add(new THREE.BoxGeometry(0.7, 1.6, 0.4), stone, Math.cos(a) * 5, 0.8, Math.sin(a) * 5); r.rotation.y = -a; add(new THREE.BoxGeometry(0.16, 0.5, 0.16), glow, Math.cos(a) * 5.2, 1.0, Math.sin(a) * 5.2); }
  const shards = [];
  for (let i = 0; i < 4; i++) { const m = add(new THREE.OctahedronGeometry(0.3, 0), glow, 0, 0, 0); m.scale.y = 1.8; shards.push(m); }
  G.scene.add(group);
  return { group, veil, waves, rune, rune2, shards, y, yaw, mx: x, mz: z };
}

// pulsar do véu, ondas e faíscas (o mesmo no anfitrião e nos outros jogadores)
export function animatePortal(G, v, t, dt, color) {
  v.veil.material.opacity = 0.62 + Math.sin(t * 3) * 0.12;
  for (let i = 0; i < v.waves.length; i++) { const k = ((t * 0.6 + i / v.waves.length) % 1); v.waves[i].scale.setScalar(0.25 + k * 0.85); v.waves[i].material.opacity = 0.55 * (1 - k); }
  if (v.rune) { v.rune.material.opacity = 0.3 + Math.sin(t * 1.6) * 0.15; v.rune2.rotation.z = t * 0.4; }
  if (v.shards) for (let i = 0; i < v.shards.length; i++) { const a = t * 0.7 + (i / v.shards.length) * Math.PI * 2; v.shards[i].position.set(Math.cos(a) * 3.6, 3.4 + Math.sin(t * 1.5 + i) * 0.7, Math.sin(a) * 1.4); v.shards[i].rotation.y = t * 2 + i; }
  if (G.settings?.particles && Math.random() < dt * 14) G.fx.emit(v.mx + (Math.random() - 0.5) * 3, v.y + 1 + Math.random() * 3.6, v.mz + (Math.random() - 0.5) * 3, Math.sin(v.yaw) * 1.5, 0.6, Math.cos(v.yaw) * 1.5, color, 0.35, 0.8, 0, 0.4);
}
export function disposePortal(G, v) {
  if (!v) return;
  G.scene.remove(v.group);
  v.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

// Eventos de ondas. Rodam no anfitrião (os monstros são do mundo, todos veem e lutam juntos).
// tier = força do evento (1 comum … 5 raríssimo). Chance de sair ∝ 1 / tier^1.6:
// quanto mais forte o monstro do evento, mais raro ele é.
// Cada evento tem o seu troféu (com arte própria) e um campeão na última onda, que solta saque de chefe
// dividido pelo dano entre quem lutou.
const W = (...g) => g; // onda = lista de [tipo, quantidade]
export const WAVE_EVENTS = {
  // ---------- Vale de Eldoria ----------
  ruptura: {
    name: 'Ruptura da Fenda', area: 'world', tier: 1, minLevel: 2, color: 0xd36bff, trophy: 'estilhaco_ruptura', reward: 'event',
    intro: 'Uma fenda se abriu', waves: [
      W(['slime', 4]), W(['slime', 4], ['wolf', 2]), W(['wolf', 4], ['slime', 2]),
      W(['wolf', 3], ['goblin_atirador', 2], ['slime', 2]), W(['wolf', 5], ['slime', 3]),
      W(['campeao_ruptura', 1], ['wolf', 3]),
    ],
  },
  invasao_goblin: {
    name: 'Invasão Goblin', area: 'world', tier: 2, minLevel: 3, color: 0xffb040, trophy: 'estandarte_goblin', reward: 'event2',
    intro: 'Goblins estão invadindo', waves: [
      W(['goblin', 4]), W(['goblin', 3], ['goblin_atirador', 2]), W(['goblin', 5], ['goblin_atirador', 1]),
      W(['goblin_atirador', 4], ['goblin', 2]), W(['goblin', 5], ['goblin_atirador', 3]), W(['goblin', 4], ['goblin_atirador', 2], ['wolf', 2]),
      W(['campeao_horda', 1], ['goblin', 3], ['goblin_atirador', 2]),
    ],
  },
  horda_ossos: {
    name: 'Horda de Ossos', area: 'world', tier: 3, minLevel: 5, night: 2.5, color: 0x9affb0, trophy: 'cranio_maldito', reward: 'event2',
    intro: 'Os mortos se levantaram', waves: [
      W(['skeleton', 3]), W(['skeleton', 4]), W(['skeleton', 3], ['wolf', 2]), W(['skeleton', 5]),
      W(['skeleton', 6]), W(['skeleton', 5], ['wolf', 2]), W(['campeao_ossos', 1], ['skeleton', 4]),
    ],
  },
  // ---------- Ermos da Fenda ----------
  ruptura_abissal: {
    name: 'Ruptura Abissal', area: 'ermos', tier: 1, color: 0x5a6aff, trophy: 'estilhaco_abismo', reward: 'event2',
    intro: 'O abismo se abriu', waves: [
      W(['caranguejo_abissal', 4]), W(['caranguejo_abissal', 3], ['besouro_brasa', 2]), W(['aranha_galhos', 3], ['caranguejo_abissal', 2]),
      W(['besouro_brasa', 4], ['aranha_galhos', 2]), W(['aranha_galhos', 4], ['caranguejo_abissal', 3]), W(['campeao_abissal', 1], ['aranha_galhos', 3]),
    ],
  },
  marcha_osso: {
    name: 'Marcha dos Cavaleiros Negros', area: 'ermos', tier: 3, night: 1.8, color: 0x9affb0, trophy: 'estandarte_osso', reward: 'event3',
    intro: 'Os cavaleiros do trono marcham', waves: [
      W(['cavaleiro_trono', 2], ['gargula', 1]), W(['cavaleiro_trono', 3]), W(['arauto_fenda', 2], ['cavaleiro_trono', 2]),
      W(['cavaleiro_trono', 3], ['gargula', 2]), W(['arauto_fenda', 2], ['cavaleiro_trono', 3]),
      W(['cavaleiro_trono', 4], ['gargula', 2]), W(['campeao_osso', 1], ['cavaleiro_trono', 2], ['arauto_fenda', 1]),
    ],
  },
  colosso_desperto: {
    name: 'Despertar do Jabuti', area: 'ermos', tier: 4, color: 0xc050ff, trophy: 'coroa_colosso', reward: 'event3',
    intro: 'O chão treme: um jabuti gigante acordou', waves: [
      W(['arauto_fenda', 2], ['gargula', 2]), W(['gargula', 4]), W(['conjurador_afogado', 2], ['arauto_fenda', 2]),
      W(['gargula', 3], ['arauto_fenda', 2]), W(['jabuti', 1], ['arauto_fenda', 2]),
      W(['gargula', 4], ['conjurador_afogado', 2]), W(['arauto_fenda', 3], ['gargula', 3]),
      W(['campeao_colosso', 1], ['arauto_fenda', 2]),
    ],
  },
  // ---------- Confins de Eldoria ----------
  ninho_escorpioes: {
    name: 'Ninho de Escorpiões', area: 'confins', biomes: ['deserto'], tier: 1, color: 0xe8a040, trophy: 'ferrao_ambar', reward: 'event2',
    intro: 'Um ninho de escorpiões se abriu', waves: [
      W(['escorpiao_ambar', 3]), W(['escorpiao_ambar', 3], ['basilisco', 1]), W(['escorpiao_ambar', 4]),
      W(['basilisco', 2], ['escorpiao_ambar', 3]), W(['escorpiao_ambar', 5]), W(['campeao_escorpiao', 1], ['escorpiao_ambar', 3]),
    ],
  },
  estouro_minotauros: {
    name: 'Estouro de Minotauros', area: 'confins', biomes: ['planicie'], tier: 2, color: 0xffd45c, trophy: 'chifre_estouro', reward: 'event3',
    intro: 'Uma manada de minotauros vem aí', waves: [
      W(['minotauro', 2]), W(['minotauro', 2], ['javali', 2]), W(['minotauro', 3]), W(['minotauro', 3], ['javali_dourado', 2]),
      W(['minotauro', 4]), W(['minotauro', 3], ['javali', 3]), W(['campeao_minotauro', 1], ['minotauro', 2]),
    ],
  },
  enxame_cerebros: {
    name: 'Enxame de Cérebros', area: 'confins', biomes: ['pico'], tier: 2, color: 0xff80c0, trophy: 'olho_colmeia', reward: 'event3',
    intro: 'Cérebros flutuam para fora da névoa', waves: [
      W(['medusa', 3]), W(['medusa', 2], ['cerebro_abissal', 1]), W(['medusa', 3], ['cerebro_abissal', 1]),
      W(['cerebro_abissal', 2], ['medusa', 2]), W(['medusa', 3], ['cerebro_abissal', 2]),
      W(['cerebro_abissal', 3], ['medusa', 3]), W(['campeao_cerebro', 1], ['medusa', 3]),
    ],
  },
  cacada_lobisomem: {
    name: 'Caçada do Lobisomem', area: 'confins', biomes: ['floresta'], tier: 3, night: 2.5, color: 0xdfe8ff, trophy: 'garra_lua', reward: 'event3',
    intro: 'Uivos na floresta: começou a caçada', waves: [
      W(['lobisomem', 2]), W(['lobisomem', 2], ['cogumelo', 2]), W(['lobisomem', 3]), W(['cogumelo', 3], ['lobisomem', 2]),
      W(['lobisomem', 4]), W(['lobisomem', 3], ['cogumelo', 3]), W(['lobisomem', 4], ['cervo_espinhoso', 2]),
      W(['campeao_lobisomem', 1], ['lobisomem', 3]),
    ],
  },
  // horda comum de qualquer bioma dos Confins (monstros do próprio bioma; o elite do bioma fecha a última onda)
  horda_bioma: {
    name: 'Horda', area: 'confins', tier: 1, color: 0xff8a5a, reward: 'event2', biomeHorde: true,
    intro: 'Uma horda está se juntando',
  },
  furia_tita: {
    name: 'Fúria do Titã', area: 'confins', biomes: ['tundra', 'vulcao', 'pico'], tier: 5, color: 0xffd45c, trophy: 'coracao_tita', reward: 'event3',
    intro: 'A terra racha: um titã furioso se aproxima',
    byBiome: {
      tundra: { mobs: ['yeti', 'morsa'], elite: 'tita_gelo', champ: 'campeao_tita_gelo' },
      vulcao: { mobs: ['cerbero', 'rinoceronte'], elite: 'tita_magma', champ: 'campeao_tita_magma' },
      pico: { mobs: ['medusa', 'cerebro_abissal'], elite: 'tita_fenda', champ: 'campeao_tita_fenda' },
    },
  },
};

// horda de um bioma: os monstros dele em 6 ondas, e o elite do bioma na última
function hordeWaves(B) {
  const [a, c = a] = B.mobs;
  return [W([a, 3]), W([a, 2], [c, 2]), W([c, 3], [a, 1]), W([a, 4], [c, 1]), W([a, 3], [c, 3]), W([B.elite, 1], [a, 2], [c, 1])];
}

// ondas da Fúria do Titã, montadas pelo bioma onde ela acontece
function titanWaves(b) {
  const [a, c = a] = b.mobs;
  return [W([a, 2]), W([a, 2], [c, 1]), W([a, 3], [c, 1]), W([c, 2], [a, 2]), W([b.elite, 1], [a, 2]), W([a, 3], [c, 2]), W([a, 4], [c, 2]), W([b.champ, 1], [a, 2], [c, 1])];
}

const levelsOf = (L) => { const m = String(L?.levels || '').match(/(\d+)\D+(\d+)/); return m ? [+m[1], +m[2]] : null; };

export class WorldEvents {
  constructor(G) {
    this.G = G;
    this.defs = {};
    this.active = null;
    this.nextAt = BALANCE.eventFirstDelaySec;
    this.alphaNight = -1;
    for (const [id, d] of Object.entries(WAVE_EVENTS)) this.register(waveEvent(id, d));
    this.register(loboAlfa);
  }

  register(def) { this.defs[def.id] = def; }

  start(id, opts = {}) {
    if (this.active) return false;
    const def = this.defs[id];
    if (!def) return false;
    const inst = { id, def, t: 0, source: opts.source || 'local', data: {} };
    if (def.start(this.G, inst, opts) === false) return false;
    this.active = inst;
    this.G.ui.eventBanner(inst);
    return true;
  }

  end(success) {
    const a = this.active;
    if (!a) return;
    a.def.end?.(this.G, a, success);
    this.active = null;
    this.G.ui.eventBanner(null);
    const [c0, c1] = BALANCE.eventCooldownSec, k = this.G.player?.area === 'confins' ? BALANCE.eventRareCooldownMult : 1;
    this.nextAt = this.G.time.t + (c0 + Math.random() * (c1 - c0)) * k;
  }

  // sorteia um evento da região onde o jogador está (mais forte = menos chance)
  pick() {
    const G = this.G, P = G.player, lvl = G.state.player.level;
    const pool = [];
    for (const [id, d] of Object.entries(WAVE_EVENTS)) {
      if (d.area !== (P.area === 'guardiao' ? 'world' : P.area)) continue; // mapa 2 usa as raids do Vale
      if (d.minLevel && lvl < d.minLevel) continue;
      if (d.biomes) { const B = G.world.confins?.biomeAtWorld(P.pos.x, P.pos.z); if (!B || !d.biomes.includes(B.id)) continue; }
      // cada estrela a mais é bem mais rara (1★ 100 · 2★ 19 · 3★ 7 · 4★ 3,6 · 5★ 2): nada de vir em "sequência"
      let w = 1 / Math.pow(d.tier, 2.4);
      if (d.night) w *= 1 + (d.night - 1) * (G.night || 0);
      pool.push([id, w]);
    }
    if (!pool.length) return null;
    let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
    for (const [id, w] of pool) { r -= w; if (r <= 0) return id; }
    return pool[pool.length - 1][0];
  }

  // ---- outros jogadores: o portal da fenda (aberto pelo anfitrião) aparece igual para todos ----
  syncRemotePortal(p) {
    const G = this.G, R = this.remotePortal;
    const key = p ? `${p.area}:${p.x}:${p.z}:${p.color}` : '';
    if (R && R.key === key) return;
    if (R) { disposePortal(G, R.v); this.remotePortal = null; }
    if (!p) return;
    const y = G.world.groundHeight(p.x, p.z, p.area);
    const v = buildPortal(G, p.x, y, p.z, p.yaw, p.color);
    v.group.visible = G.player?.area === p.area;
    this.remotePortal = { key, v, color: p.color, area: p.area, t: 0 };
    G.fx.beam(p.x, y, p.z, p.color, 30, 2.5, 2.5);
  }
  updateRemote(dt) {
    const R = this.remotePortal; if (!R) return;
    R.t += dt;
    R.v.group.visible = this.G.player?.area === R.area;
    if (R.v.group.visible) animatePortal(this.G, R.v, R.t, dt, R.color);
  }

  update(dt) {
    const G = this.G;
    if (this.remotePortal) this.syncRemotePortal(null); // virei o anfitrião: o portal "remoto" sai (o meu evento manda)
    if (this.active) {
      this.active.t += dt;
      const r = this.active.def.update(G, this.active, dt);
      if (r === 'success') this.end(true);
      else if (r === 'fail') this.end(false);
      else G.ui.eventBanner(this.active);
      return;
    }
    const A = G.player.area;
    if (!['world', 'guardiao', 'ermos', 'confins'].includes(A) || !G.player.alive || G.bossEngaged) return;
    if (G.time.t >= this.nextAt) {
      this.nextAt = G.time.t + 30;
      // do 3º mapa (Confins) em diante as raids são mais raras, até as mais fracas
      if (G.state.player.level >= 2 && !(A === 'confins' && Math.random() < BALANCE.eventRareSkip)) { const id = this.pick(); if (id) this.start(id); }
    }
    // chefe raro noturno
    const nightId = Math.floor(G.dayCount);
    if (A === 'world' && G.night > 0.75 && this.alphaNight !== nightId && G.state.player.level >= 4) {
      this.alphaNight = nightId;
      if (Math.random() < 0.45) this.start('lobo_alfa');
    }
  }

  // recompensa ao fechar um evento (o anfitrião manda para quem estava perto, cada um ganha a sua)
  giveReward(r) {
    const G = this.G, P = G.player, st = G.state.player;
    const base = Math.min(st.level, r.level + 2);
    const xp = Math.round(xpToNext(base) * (0.3 + 0.12 * r.tier));
    if (Number.isFinite(xp) && xp > 0) G.giveXp(xp, 'Evento');
    const x = r.x, z = r.z, y = G.world.groundHeight(x, z, r.area);
    G.fx.beam(x, y, z, 0xffd36b, 20, 2, 2);
    G.lastLootSource = r.name;
    // raid: os monstros não soltam itens; a recompensa (ouro e materiais) vai direto para a bolsa de cada um
    const res = rollLoot(r.table, r.level + 1, { cls: G.player.cls.id, playerLevel: st.level, owned: new Set(), goldRange: [0, 0] }, rng);
    if (res.gold) G.loot.addGold(res.gold, P.pos);
    const stacks = [...res.stacks.map((s) => makeStack(s.id, s.qty, rng))];
    if (MATERIALS[r.trophy]) stacks.push(makeStack(r.trophy, 1 + (r.tier >= 3 ? 1 : 0), rng));
    for (const s of stacks) { const left = G.inv.add(s); if (left > 0) { s.qty = left; G.loot.spawnDrop(s, P.pos.x, P.pos.z, P.area, P.pos); } else G.loot.onObtained(s, s.qty); }
    void x; void y; void z;
    st.stats.events = (st.stats.events || 0) + 1;
    G.ui.chatMessage({ name: 'Raid', text: `${r.name} concluída! Recompensa na sua bolsa.`, system: true, kind: 'rift' });
    G.audio.play('quest');
    void P;
  }
}

// Onde o evento (fenda) acontece: num lugar ALEATÓRIO do mapa (não perto de quem abriu), sempre em chão aberto,
// fora da cidade e longe de construções. As ondas só começam quando alguém chega perto do portal.
function pickSite(G, d) {
  const P = G.player, A = P.area, W = G.world;
  let levels = null;
  const nameAt = (x, z) => {
    if (A === 'world' || A === 'guardiao') {
      let best = null, br = Infinity;
      for (const L of Object.values(LOCATIONS)) {
        if ((L.area || 'world') !== A) continue; const dd = Math.hypot(x - L.x, z - L.z); if (dd < (L.r || 30) && (L.r || 30) < br) { br = L.r || 30; best = L; } }
      return best?.name || (A === 'guardiao' ? 'Planície do Guardião' : 'Vale de Eldoria');
    }
    if (A === 'ermos') {
      let nm = 'Ermos da Fenda', best = Infinity;
      for (const L of Object.values(ERMOS.locations)) { const dd = Math.hypot(x - (L.x + ERMOS.offset.x), z - (L.z + ERMOS.offset.z)); if (dd < L.r && L.r < best) { best = L.r; nm = L.name; levels = levelsOf(L) || levels; } }
      return nm;
    }
    const B = W.confins.biomeAtWorld(x, z); levels = B.levels; return B.name;
  };
  // Vale e Ermos: qualquer lugar aberto do mapa todo. Confins (enormes): de 120 a 650 m de quem abriu,
  // no bioma certo quando o evento é de um bioma só
  const filter = (x, z) => {
    if (A === 'world' && !G.state.world.flags.gateOpen && Math.hypot(x - 35, z + 150) < 60) return false; // não abre atrás da Barreira fechada
    if (A === 'confins' && d.biomes) { const B = W.confins.biomeAtWorld(x, z); if (!B || !d.biomes.includes(B.id)) return false; }
    // nunca em cima de alguém nem de uma luta com chefe (ex.: chefe de Natal)
    return awayFromFights(G, x, z, A, { players: 45, bosses: 70, fenda: 0 });
  };
  const p = randomSpot(G, A, { near: { x: P.pos.x, z: P.pos.z }, filter, R: 10 });
  if (p) return { x: p.x, z: p.z, name: nameAt(p.x, p.z), levels: levels || (A === 'world' ? [2, 12] : A === 'guardiao' ? [8, 18] : A === 'ermos' ? [25, 60] : [65, 165]) };
  void d;
  return null;
}

function waveEvent(id, d) {
  return {
    id, name: d.name,
    start(G, inst) {
      const site = pickSite(G, d);
      if (!site) return false;
      const P = G.player, lvl = G.state.player.level;
      inst.site = site; inst.area = P.area;
      const up = d.tier >= 3 ? 1 : 0;
      inst.level = Math.max(site.levels[0], Math.min(site.levels[1] + (P.area === 'world' ? 0 : 1), lvl + up + (P.area === 'world' ? d.tier - 1 : 0)));
      inst.name = d.name; inst.trophy = d.trophy;
      if (d.byBiome) {
        const B = G.world.confins.biomeAtWorld(site.x, site.z);
        const b = d.byBiome[B.id] || Object.values(d.byBiome)[0];
        inst.waves = titanWaves(b);
      } else if (d.biomeHorde) {
        const B = G.world.confins.biomeAtWorld(site.x, site.z);
        inst.waves = hordeWaves(B); inst.name = `Horda de ${B.name}`; inst.trophy = TROPHY_OF[B.elite] || 'fragmento_fenda';
      } else inst.waves = d.waves;
      inst.wave = -1; inst.mobs = []; inst.waveDelay = 3;
      inst.timeLimit = 80 + inst.waves.length * 38;
      inst.waiting = true; inst.waitLimit = BALANCE.eventWaitSec || 480; inst.t0 = 0; // portal aberto esperando alguém chegar
      inst.title = d.biomeHorde ? inst.name : `${d.name} — ${site.name}`;
      inst.tier = d.tier;
      // portal visual
      // portal PARADO (não gira): moldura de pedra com o véu da fenda; os monstros saem dele andando
      const y = G.world.groundHeight(site.x, site.z, inst.area);
      const yaw = Math.atan2(G.player.pos.x - site.x, G.player.pos.z - site.z) || 0;
      inst.visual = buildPortal(G, site.x, y, site.z, yaw, d.color);
      inst.color = d.color; // vai junto no estado do mundo: os outros jogadores montam o mesmo portal
      inst.queue = []; inst.spawnT = 0;
      G.fx.beam(site.x, y, site.z, d.color, 30, 2.5, 2.5);
      G.audio.play('portal');
      const stars = '★'.repeat(d.tier);
      G.ui.notice(`${stars} ${d.intro || d.name}: ${site.name}! ${inst.waves.length} ondas e ${d.biomeHorde ? 'um elite' : 'um campeão'} no fim. As ondas começam quando alguém chegar perto. Marcado no mapa ✦`, 'rift', 'Raid');
      return true;
    },
    update(G, inst, dt) {
      const v = inst.visual;
      // o véu pulsa (brilho e ondas), mas o portal não gira
      animatePortal(G, v, inst.t, dt, d.color);
      inst.mobs = inst.mobs.filter((e) => !e.dead && !e.removed);
      // portal aberto esperando: as ondas só começam quando alguém (eu ou outro jogador) chega perto
      if (inst.waiting) {
        const R = 30, P = G.player, S = inst.site;
        const here = (P.alive && P.area === inst.area && Math.hypot(P.pos.x - S.x, P.pos.z - S.z) < R)
          || [...(G.net?.peers?.values() || [])].some((g) => (g.pr?.ar || 'world') === inst.area && Math.hypot(g.pos.x - S.x, g.pos.z - S.z) < R);
        const left = Math.max(0, Math.ceil(inst.waitLimit - inst.t));
        inst.status = `Portal aberto · as ondas começam quando alguém chegar · fecha em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${'★'.repeat(d.tier)}`;
        if (here) { inst.waiting = false; inst.t0 = inst.t; inst.waveDelay = 2.5; G.ui.notice(`A fenda despertou: ${inst.waves.length} ondas!`, 'rift', 'Raid'); G.audio.play('portal'); }
        else if (inst.t > inst.waitLimit) { inst.noShow = true; return 'fail'; }
        return null;
      }
      // fila: os monstros da onda saem do portal UM POR VEZ (evita travar com muitos de uma vez)
      if (inst.queue.length) {
        inst.spawnT -= dt;
        if (inst.spawnT <= 0 && inst.mobs.length < 28) {
          const q = inst.queue.shift();
          const side = (Math.random() - 0.5) * 2.2, fwd = 5 + Math.random() * 4;
          const ox = Math.sin(v.yaw) * fwd + Math.cos(v.yaw) * side * 2.5, oz = Math.cos(v.yaw) * fwd - Math.sin(v.yaw) * side * 2.5;
          let tx = v.mx + ox, tz = v.mz + oz;
          if (!G.world.walkable(tx, tz, inst.area)) { tx = v.mx; tz = v.mz; }
          const e = G.spawnTemporary(q.type, q.lvl, v.mx, v.mz, inst.area, true);
          e.aggroed = true; e.raid = true; // raid: só o chefe solta itens
          e.exitTo = { x: tx, z: tz }; e.st = q.champ ? 1.6 : 1.1; e.yaw = v.yaw;
          inst.mobs.push(e);
          if (q.champ) { G.fx.beam(v.mx, v.y, v.mz, d.color, 26, 3, 3); G.cam?.shake?.(0.4, 0.5); }
          G.fx.burst({ x: v.mx, y: v.y + 1.6, z: v.mz }, { count: 10, color: [d.color, 0xffffff], speed: 3, size: 0.3, life: 0.5, up: 1 });
          inst.spawnT = q.champ ? 0.9 : 0.4;
        }
      }
      if (!inst.mobs.length && !inst.queue.length) {
        if (inst.wave >= inst.waves.length - 1) return 'success';
        inst.waveDelay -= dt;
        if (inst.waveDelay <= 0) {
          inst.wave++;
          inst.waveDelay = 4;
          // mais jogadores perto = ondas maiores (o campeão continua sendo um só)
          const near = [...(G.net?.peers?.values() || [])].filter((g) => (g.pr.ar || 'world') === inst.area && Math.hypot(g.pos.x - inst.site.x, g.pos.z - inst.site.z) < 70).length;
          const mul = 1 + 0.35 * near;
          const last = inst.wave === inst.waves.length - 1;
          for (const [type, n0] of inst.waves[inst.wave]) {
            const champ = type.startsWith('campeao_');
            const n = champ ? n0 : Math.max(1, Math.round(n0 * mul));
            for (let i = 0; i < n; i++) inst.queue.push({ type, lvl: inst.level + (champ ? 1 : 0), champ });
          }
          if (last) G.ui.notice(d.biomeHorde ? 'Última onda: o líder da horda chegou!' : 'Última onda: o chefe da raid chegou! Só ele solta itens (sorteados pelo dano).', 'rift', 'Raid');
          else G.ui.notice(`Onda ${inst.wave + 1} de ${inst.waves.length}`, 'rift', 'Raid');
        }
      }
      inst.status = `Onda ${Math.max(1, inst.wave + 1)}/${inst.waves.length} · ${Math.max(0, Math.ceil(inst.timeLimit - (inst.t - inst.t0)))}s · ${'★'.repeat(d.tier)}`;
      if (inst.t - inst.t0 > inst.timeLimit) return 'fail';
      return null;
    },
    end(G, inst, success) {
      disposePortal(G, inst.visual);
      for (const e of inst.mobs) if (!e.dead) { e.hp = 0; e.dead = true; e.setState('dead'); e.remove(); }
      if (success) {
        const r = { name: inst.name, tier: d.tier, level: inst.level, trophy: inst.trophy, table: d.reward, x: inst.site.x, z: inst.site.z, area: inst.area };
        G.events.giveReward(r);
        G.net?.eventReward?.(r);
        G.net?.announce(`fechou o evento ${inst.name}!`);
      } else {
        G.ui.notice(inst.noShow ? 'Ninguém chegou a tempo: a fenda se fechou.' : 'O tempo acabou e as criaturas voltaram para o vazio.', 'rift', 'Raid');
      }
    },
  };
}

const loboAlfa = {
  id: 'lobo_alfa',
  name: 'Chefe raro: Lobo roxo',
  start(G, inst) {
    const f = LOCATIONS.floresta;
    const e = G.spawnTemporary('alpha_wolf', 7, f.x + 8, f.z - 10, 'world');
    e.temporary = true;
    inst.mob = e;
    inst.area = 'world';
    inst.site = { x: e.pos.x, z: e.pos.z, name: 'Lobo roxo', moving: true };
    inst.title = 'Chefe raro: Lobo roxo';
    G.audio.play('howl', { gap: 0, vol: 1.5 });
    G.ui.notice('Um uivo ecoa pela Floresta Sussurrante… O Lobo roxo, alfa da matilha, caça esta noite. Marcado no mapa ✦');
    return true;
  },
  update(G, inst) {
    if (!inst.mob.dead) { inst.site.x = inst.mob.pos.x; inst.site.z = inst.mob.pos.z; }
    inst.status = inst.mob.dead ? 'Derrotado' : 'Floresta Sussurrante · até o amanhecer';
    if (inst.mob.dead) return 'success';
    if (G.night < 0.3) return 'fail';
    return null;
  },
  end(G, inst, success) {
    if (!success && !inst.mob.dead) { inst.mob.dead = true; inst.mob.remove(); G.ui.toastSmall('O Lobo roxo desapareceu com o amanhecer.'); }
    if (success) { G.ui.notice('Lobo roxo derrotado! Uma lenda da floresta caiu.'); }
  },
};
