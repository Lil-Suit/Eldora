import { Teleports, safeSpot } from './teleport.js';
import { Pvp } from './pvp.js';
import { generateEquipment } from '../core/items.js';
import { xpToNext } from '../core/progression.js';
import * as THREE from 'three';
import { World } from '../engine/world.js';
import { Sky } from '../engine/sky.js';
import { FX } from '../engine/fx.js';
import { HurtVignette } from '../engine/hurtvignette.js';
import { setSeeThrough } from '../engine/megastruct.js';
import { Audio } from '../engine/audio.js';
import { smoothstep, distToPolyline, clamp, dampAngle, damp } from '../engine/noise.js';
import { Input, DEFAULT_BINDS } from './input.js';
import { CameraRig } from './camera.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Spawners } from './spawner.js';
import { Party } from './party.js';
import { LootSystem } from './loot.js';
import { Interactions } from './interact.js';
import { WorldEvents } from './events.js';
import { Natal } from './natal.js';
import { HERO3D } from '../engine/hero3d.js';
import { Tutorial } from './tutorial.js';
import { SaveManager } from './save.js';
import { Market } from './market.js';
import { Social } from './social.js';
import { Economy } from './economy.js';
import { Trade } from './trade.js';
import { Net } from './net.js';
import { Cosmetics } from './cosmetics.js';
import { updateProjectiles, autoTarget, hitEnemy, spawnProjectile } from './combat.js';
import { doBasic, doSkill, doDodge } from './skills.js';
import { createNewState } from '../core/state.js';
import { Inventory, bagSize } from '../core/inventory.js';
import { QuestLog } from '../core/quests.js';
import { HuntSigns } from '../engine/huntsigns.js';
import { addXp, xpForKill, scaleRewardXp } from '../core/progression.js';
import { rng } from '../core/rng.js';
import { BALANCE } from '../config/balance.js';
import { SKILL_UNLOCKS } from '../config/classes.js';
import { LOCATIONS, RIVER, WORLD, VILLAGE, PLATEAU, ERMOS, CONFINS, PORTAL_FENDA, GUARDIAO } from '../config/world.js';
import { QUESTS } from '../config/quests.js';
import { CONSUMABLES, MOUNT_ITEMS, ITEM_SETS, setBaseFor } from '../config/items.js';
import { rollLoot, makeStack, scaleNamed } from '../core/items.js';
import * as UltraAtmos from '../engine/ultra/atmos.js';
import { MUNDO } from './mundo.js';

class Bus {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, d) { for (const f of this.h[e] || []) { try { f(d); } catch (err) { console.error(err); globalThis.__eldCapture?.(err, { origem: 'evento:' + e }); } } }
}

export const QUALITY = {
  // Ultra leve: resolução CHEIA da tela (nunca diminui), o resto bem enxuto — sem sombras, sem luzes extras,
  // neblina mais perto (desenha menos coisa longe), sem nuvens, metade das partículas e pouca chuva.
  leve: { pixelRatio: 3, nativeRes: true, shadows: false, shadowMap: 512, fogFar: 120, rainDrops: 260, splash: 40, label: 'Ultra leve (resolução cheia)', leve: true },
  baixa: { pixelRatio: 1, shadows: false, shadowMap: 1024, fogFar: 115, rainDrops: 500, splash: 70, label: 'Baixa' },
  media: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, fogFar: 175, rainDrops: 1000, splash: 140, label: 'Média' },
  alta: { pixelRatio: 2, shadows: true, shadowMap: 2048, fogFar: 215, rainDrops: 1400, splash: 190, label: 'Alta' },
  // Ultra realismo: sombras suaves e grandes, sol com brilho, nuvens macias, tempo fechando antes da chuva,
  // gotas batendo no chão e na água, água com reflexo do sol, golpes/flechas com mais brilho. Pesado: para PC/celular forte.
  ultra: { pixelRatio: 2.5, shadows: true, shadowMap: 4096, fogFar: 260, rainDrops: 3200, splash: 260, label: 'Ultra realismo', ultra: true, shadowExtent: 60, enemyShadow: 55 },
};

function angleDiffRad(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class Game {
  constructor(canvas, UIClass) {
    this.canvas = canvas;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const saved = SaveManager.readSettings();
    this.settings = Object.assign({
      viewDist: this.isTouch ? 'curta' : 'media', ultraGrass: true, particles: false, gameKeyboard: true, quality: this.isTouch ? 'baixa' : 'media', master: 0.8, sfx: 0.9, music: 0.45, amb: 0.6, // primeira vez: celular começa na Baixa, PC na Média (depois cada um escolhe)
      rain: true, camSens: 1, invertY: false, damageNumbers: true, hurtFx: 'auto', hurtIntensity: 0.7, pauseMenus: this.isTouch, showFps: false, autoRes: true, showPeers: true, cleanScreen: false, touchScale: 1, joyFloat: false, crosshair: false, camFollow: false,
    }, saved || {});
    // modelos 3D dos heróis: começam a carregar já na tela de título; quando chegam, trocam os bonecos antigos
    HERO3D.preload().then((ok) => { if (ok) this.interact?.rebuildNpcRigs?.(); if (ok && this.mode === 'play' && this.player) { this.player.rebuildRig(); this.net?.rebuildRigs?.(); } });
    const q = QUALITY[this.settings.quality] || QUALITY.media;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isTouch, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // celular: a tela já é muito densa; acima de ~1.5 o custo dobra e quase não se vê diferença (Alta/Ultra travavam em 20-30 fps)
    const touchCap = this.isTouch && !q.nativeRes ? ({ ultra: 1.5, alta: 1.35, media: 1.25 }[this.settings.quality] || q.pixelRatio) : q.pixelRatio;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio, touchCap);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.enemyViewDist = 120;
    this.scene.matrixAutoUpdate = false; // a cena nunca se mexe: assim o que está escondido longe não recalcula matrizes
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
    this.bus = new Bus();
    this.world = new World(this.scene).build();
    this.huntSigns = new HuntSigns(this.scene, this.world);
    this.sky = new Sky(this.scene, q);
    this.fx = new FX(this.scene);
    this.hurtFx = new HurtVignette(this.scene);
    this.fx.ground = (x, z) => this.world.groundHeight(x, z, this.player ? this.player.area : 'world');
    // chuva do Ultra: gotas batem no chão de verdade e fazem ondinhas na água
    this.sky.ground = this.fx.ground;
    this.sky.waterY = () => this.world.waterAt(this.player ? this.player.area : 'world');
    this.sky.fx = this.fx;
    this.sky.onThunder = (d) => this.audio.play('thunder', { delay: d });
    this.audio = new Audio();
    Object.assign(this.audio.vol, { master: this.settings.master, sfx: this.settings.sfx, music: this.settings.music, amb: this.settings.amb });
    this.input = new Input(canvas);
    this.input.canLock = () => this.mode === 'play' && !this.ui?.blocking() && (this.ui?.panelCount() || 0) === 0 && this.settings?.mouseLock !== false;
    this.input.onLockFail = () => this.ui?.toastSmall?.('Não deu para prender o mouse aqui. Clique no jogo de novo, ou gire a câmera segurando o botão direito.', 5);
    this.input.onLockChange = (on) => { if (on && !this._lockHint) { this._lockHint = true; this.ui?.toastSmall?.('Mouse preso na câmera · Caps Lock solta o mouse'); } };
    this.cam = new CameraRig(this.camera);
    this.saver = new SaveManager(this);
    this.market = new Market(this);
    this.economy = new Economy(this);
    this.trade = new Trade(this);
    // ganchos para testes automatizados (não alteram o jogo)
    this.testing = { rollLoot: (t, lvl, ctx) => rollLoot(t, lvl, { cls: this.player?.cls.id, playerLevel: this.state?.player.level, owned: new Set(), ...ctx }, rng), makeStack: (id, q) => makeStack(id, q, rng), genEquip: (baseId, rarity, ilvl) => generateEquipment({ baseId, rarity, ilvl, rng }), hit: (e, mult = 1, o = {}) => hitEnemy(this, e, mult, o), proj: (p) => spawnProjectile(this, p), autoTarget: (...a) => autoTarget(this, ...a), basic: (aim) => doBasic(this, this.player, aim || this.computeAim()), skill: (i, aim) => doSkill(this, this.player, i, aim || this.computeAim()) };
    this.net = new Net(this);
    this.time = { t: 0, real: 0, hitstop: 0, slowmo: 0 };
    this.timers = [];
    this.zones = [];
    this.enemies = [];
    this.projectiles = [];
    this.mode = 'title';
    this.state = null;
    this.night = 0;
    this.dayCount = 0;
    this.target = null; this.hover = null;
    this.bossEngaged = null;
    this.zoneName = '';
    this.discoverT = 0;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0; this.lowFpsT = 0;
    this.titleT = 0;
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa66, 0, 16, 1.6); this.scene.add(l); this.lights.push(l); }
    this.lightT = 0;
    this.ui = new UIClass(this);
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    this.resize();
    // proteção: se o jogo travou/fechou logo depois de abrir num gráfico pesado, abre no Baixo desta vez
    try {
      const GK = 'rift.gfxguard', g = localStorage.getItem(GK), heavy = ['ultra', 'alta', 'media'];
      if (g && g === this.settings.quality && heavy.includes(g)) {
        this.settings.quality = 'baixa'; this.saveSettings();
        setTimeout(() => this.ui?.toastSmall?.(`Da última vez o jogo travou no gráfico ${QUALITY[g]?.label || g}: voltamos para o Baixo. Dá para mudar em Gráficos.`, 7, true), 2500);
      }
      if (heavy.includes(this.settings.quality)) { localStorage.setItem(GK, this.settings.quality); this._gfxGuard = 0; } else localStorage.removeItem(GK);
    } catch {}
    this.applyQuality(); // liga os extras da qualidade salva (Ultra realismo) já na abertura
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.userData.fov0 = w < h ? 68 : 55;
    this.camera.updateProjectionMatrix();
    this.ui?.fitHurt?.();
  }

  // Perfil de desempenho (aparece com "Mostrar FPS"): ms por quadro de cada parte, média suave
  profAdd(k, ms) {
    if (!this.settings.showFps) return;
    const P = this.prof || (this.prof = {});
    P[k] = P[k] == null ? ms : P[k] * 0.95 + ms * 0.05;
    if (!this._profWrapped) {
      this._profWrapped = true;
      const wrap = (obj, fn, name) => { const f = obj?.[fn]; if (typeof f !== 'function') return; obj[fn] = (...a) => { const t = performance.now(); try { return f.apply(obj, a); } finally { this.profAdd(name, performance.now() - t); } }; };
      wrap(this.world, 'update', 'mundo'); wrap(this.fx, 'update', 'efeitos'); wrap(this.ui, 'update', 'tela'); wrap(this.net, 'update', 'rede');
      wrap(this.sky, 'update', 'céu'); wrap(this.cam, 'update', 'câmera'); wrap(this.player, 'update', 'herói'); wrap(this.loot, 'update', 'itens');
      wrap(this.spawners, 'update', 'spawn'); wrap(this.events, 'update', 'eventos'); wrap(this.interact, 'update', 'interação');
    }
  }
  profText() {
    const P = this.prof || {}, top = Object.entries(P).filter(([k]) => k !== 'jogo' && k !== 'desenho').sort((a, b) => b[1] - a[1]).slice(0, 4);
    return `jogo ${(P.jogo || 0).toFixed(1)} · desenho ${(P.desenho || 0).toFixed(1)} ms | ` + top.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ') + (this.net?.role === 'host' ? ' | anfitrião' : '');
  }

  // Ajuste automático ("Resolução automática" ligada, em qualquer modo): travando (<28 FPS por 4 s) primeiro tira as sombras, depois baixa a
  // nitidez em degraus; folgado (>50 FPS por 10 s) volta um degrau de cada vez (nitidez antes, sombra por último).
  autoQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.media, base = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    if (this.fps < 28) { this.lowFpsT += 0.5; this.okFpsT = 0; } else { this.lowFpsT = Math.max(0, this.lowFpsT - 0.5); this.okFpsT = this.fps > 50 ? (this.okFpsT || 0) + 0.5 : 0; }
    if (this.lowFpsT > 4) {
      this.lowFpsT = 0;
      if (this.sky.sun.castShadow) { this.sky.sun.castShadow = false; this.autoNoShadow = true; }
      else if (this.pixelRatio > 0.75) { this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25); this.renderer.setPixelRatio(this.pixelRatio); this.resize(); }
    } else if (this.okFpsT > 10) {
      this.okFpsT = 0;
      if (this.pixelRatio < base - 0.01) { this.pixelRatio = Math.min(base, this.pixelRatio + 0.25); this.renderer.setPixelRatio(this.pixelRatio); this.resize(); }
      else if (this.autoNoShadow && q.shadows) { this.sky.sun.castShadow = true; this.autoNoShadow = false; }
    }
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.media;
    this.autoNoShadow = false; this.lowFpsT = 0; this.okFpsT = 0;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    const leve = !!q.leve;
    this.leve = leve; this.fx.leve = leve;
    this.lowGfx = leve || this.settings.quality === 'baixa';
    for (const e of this.enemies || []) e._hl = undefined; // reavalia o brilho dos olhos
    this.fx.bossLite = leve || this.settings.quality === 'baixa'; // sem partículas de chefes/elites nos gráficos leves
    for (const l of this.lights) l.visible = !leve && this.settings.quality !== 'baixa'; // tochas/fogueiras sem luz própria (o brilho do fogo continua)
    this.sky.setLeve?.(leve);
    if (!leve && !this.isTouch && this.settings.viewDist === 'longa' && this.camera.far !== 900) { this.camera.far = 900; this.camera.updateProjectionMatrix(); this.sky.fitFar?.(900); }
    // distância de visão (opção): multiplica a neblina — e nada além dela é desenhado
    const vd = { curta: 0.6, media: 1, longa: 1.35 }[this.settings.viewDist] || 1;
    this.sky.fogFar = q.fogFar * vd;
    this.viewMul = vd;
    this.enemyViewDist = Math.min(this.isTouch ? 48 : 130, this.sky.fogFar * 0.55); // celular: monstro longe custava 11–16 desenhos cada // monstros além disso estão dentro da neblina
    if (this.sky) this.sky.rainOff = this.settings.rain === false; // opção de chuva (gráficos)
    const ultra = !!q.ultra, type = THREE.PCFShadowMap; // (o three novo faz a sombra suave pelo raio do PCF)
    this.ultra = ultra; this.fx.ultra = ultra;
    this.enemyShadowDist = q.enemyShadow || 26;
    this.sky.setUltra?.(ultra, q);
    if (this.world?.uniforms?.uUltra) this.world.uniforms.uUltra.value = ultra ? 1 : 0;
    this.world?.setUltra?.(ultra);
    UltraAtmos.setUltra(this, ultra);
    if (this.world?.waterMat) this.world.waterMat.shininess = ultra ? 220 : 70;
    if (q.shadows) this.sky.sun.castShadow = true; // o ajuste automático pode ter desligado
    if (this.renderer.shadowMap.enabled !== q.shadows || this.renderer.shadowMap.type !== type) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.renderer.shadowMap.type = type;
      this.sky.sun.castShadow = q.shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
  }

  saveSettings() {
    Object.assign(this.audio.vol, { master: this.settings.master, sfx: this.settings.sfx, music: this.settings.music, amb: this.settings.amb });
    this.audio.applyVolumes();
    SaveManager.writeSettings(this.settings);
  }

  // ---------- início de jogo ----------
  startNew(name, classId, gender) {
    this.state = createNewState(name, classId, rng);
    this.state.player.look = { g: gender === 'F' ? 'F' : 'M' };
    this.beginPlay(true);
  }

  continueGame(state) {
    this.state = state;
    this.beginPlay(false);
  }

  beginPlay(isNew) {
    const st = this.state;
    this.audio.init();
    // personagens antigos ganham o escudo inicial (todas as classes começam com o mais fraco)
    if (!st.player.equipment.shield && !st.player.gotShield) { st.player.gotShield = true; st.player.equipment.shield = generateEquipment({ baseId: 'escudo_madeira', rarity: 'comum', ilvl: 1, rng }); }
    this.inv = new Inventory(bagSize(st.player), st.player.inventory);
    st.player.inventory = this.inv.slots;
    // regra nova de pontos (metade) e itens 2+2: os pontos foram devolvidos para distribuir de novo
    if (st.player.respec) { delete st.player.respec; this.later(2.5, () => { this.ui.banner('Pontos devolvidos', `Regra nova: ${st.player.freePoints} pontos de atributo para distribuir de novo (Personagem).`, '#ffd36b', true); this.ui.chatMessage({ name: 'Sistema', text: `Seus pontos de atributo foram devolvidos (${st.player.freePoints}). Distribua em Personagem.`, system: true }); }); }
    this.quests = new QuestLog(st.quests);
    this.input.binds = { ...DEFAULT_BINDS, ...(st.player.binds || {}) };
    { const lvl = st.player.level; for (const it of [...Object.values(st.player.equipment), ...this.inv.slots]) if (it && it.kind === 'equip' && it.named && (it.ilvl || 0) <= lvl) scaleNamed(it, lvl); }
    this.player = new Player(this);
    this.cosmetics = new Cosmetics(this);
    this.cosmetics.apply();
    this.world.setArea(this.player.area);
    if (this.player.area === 'ermos' && (!this.world.walkable(this.player.pos.x, this.player.pos.z, 'ermos') || this.state.player.ermosV !== 2)) { const e = this.interact.ermosStart(); this.player.teleport(e.x, e.z, 'ermos'); }
    this.state.player.ermosV = 2;
    { // mapa 2 separado: quem ficou num lugar que deixou de existir (borda norte do Planalto) vai para um lugar seguro
      const P = this.player;
      if (P.area === 'guardiao' && !this.world.walkable(P.pos.x, P.pos.z, 'guardiao')) P.teleport(GUARDIAO.entry.x, GUARDIAO.entry.z, 'guardiao');
      else if (P.area === 'world' && P.pos.z < -160 && !this.world.walkable(P.pos.x, P.pos.z, 'world')) P.teleport(GUARDIAO.arrive.x, GUARDIAO.arrive.z, 'world');
    }
    if (this.player.area === 'confins') { this.world.confins.update(this.player.pos.x, this.player.pos.z, true); this.player.pos.y = this.world.groundHeight(this.player.pos.x, this.player.pos.z, 'confins'); }
    this.sky.setIndoor(this.player.area === 'cripta');
    this.spawners = new Spawners(this);
    this.spawners.init();
    this.loot = new LootSystem(this);
    this.interact = new Interactions(this);
    this.interact.init();
    this.events = new WorldEvents(this);
    this.natal = new Natal(this);
    this.tutorial = new Tutorial(this);
    // versões antigas: o baú do Vigia não tinha a chave — quem já abriu recebe agora
    if (st.world.chests.includes('bau_vigia') && !st.world.flags.gateOpen && this.inv.count('chave_selo') === 0) { this.inv.add(makeStack('chave_selo', 1, rng)); this.later(2, () => this.ui.toastSmall('Você recebeu a Chave do Selo (estava faltando no baú do Vigia).', 5)); }
    // v0.12: os itens dos sets antigos (de monstro) viraram peças dos sets dos biomas (uma vez só)
    if (st.world.flags.setsTrocados) { const n = st.world.flags.setsTrocados; delete st.world.flags.setsTrocados; this.later(3, () => this.ui.banner?.('Sets por bioma', `${n} ${n > 1 ? 'peças antigas viraram peças' : 'peça antiga virou peça'} do set do bioma de onde ${n > 1 ? 'vieram' : 'veio'} (mesmo fundo e mesma peça).`, '#ffd36b')); }
    // quem ficou dentro do Planalto sem ter aberto a Barreira (versões antigas permitiam contornar) volta para a rampa
    if (this.player.area === 'world' && !st.world.flags.gateOpen && (Math.hypot(this.player.pos.x - PLATEAU.x, this.player.pos.z - PLATEAU.z) < PLATEAU.r + 2 || this.player.pos.z < -176)) this.player.teleport(35, -117);
    // a Cripta virou fortaleza (v0.9.16): quem salvou num ponto que agora é parede volta para a entrada
    if (this.player.area === 'cripta' && (!this.world.walkable(this.player.pos.x, this.player.pos.z, 'cripta') || this.world.col.pointBlocked(this.player.pos.x, this.player.pos.z, 0.5))) { const s0 = this.interact.dungeonStart(); this.player.teleport(s0.x, s0.z, 'cripta'); }
    this.cam.snap(this.player.pos);
    this.cam.yaw = this.player.area === 'cripta' ? 0 : 0;
    this.mode = 'play';
    globalThis.__eldCrumb?.('entrou no jogo: ' + (this.state?.player?.classId || '?') + ' nv ' + (this.state?.player?.level || 1), 'navegação');
    this.ui.enterGame(isNew);
    if (!st.player.look?.g) setTimeout(() => this.ui.askGender?.(), 600); // personagens antigos escolhem uma vez: homem ou mulher
    this.party = new Party(this);
    this.social = new Social(this);
    this.teleports = new Teleports(this);
    this.pvp = new Pvp(this);
    if (!this._pvpDeadL) { this._pvpDeadL = true; window.addEventListener('eldoria-pvpdead', (e) => this.pvp?.onOfflineDeath(e.detail || {})); }
    if (this.trade.s) this.trade.s = null;
    this.later(4, () => this.checkGrant());
    this.later(3.5, () => this.grantAccountMount());
    this.later(2.5, () => this.checkName());
    this.later(3.2, () => this.gmBoost());
    this.later(3, () => this.economy.init());
    if (!this._netStarted) { this._netStarted = true; this.net.connect(); }
    this.saver.saveNow('início', true);
  }

  // contas GM (o servidor diz quem é): personagem vai para o nível 1000 e ganha +500 pontos de atributo (uma vez só)
  gmBoost() {
    if (this.mode !== 'play' || !this.saver.serverGm || !this.saver.serverChecked) return;
    const p = this.state.player;
    if (!p.gmArmor) {
      // as melhores armaduras do jogo, míticas, no nível do GM (uma vez por personagem; as antigas vão para a bolsa)
      p.gmArmor = true;
      const best = { helm: 'elmo_ferro', chest: 'cota_malha', legs: 'grevas_ferro', gloveL: 'manopla_e', gloveR: 'manopla_d', boots: 'botas_ferro', shield: 'escudo_torre', ring: 'anel_gravado', back: 'mochila_viajante' };
      const lvl = Math.max(p.level, BALANCE.gmLevel);
      const olds = [];
      for (const [slot, baseId] of Object.entries(best)) {
        if (p.equipment[slot]) olds.push(p.equipment[slot]);
        p.equipment[slot] = generateEquipment({ baseId, rarity: 'mitico', ilvl: lvl, rng });
      }
      this.inv.resize(bagSize(p)); p.inventory = this.inv.slots; // mochila nova primeiro (mais espaço)
      for (const old of olds) if (this.inv.add(old)) this.loot?.dropFromBag?.(old); // add devolve 1 quando a bolsa está cheia: aí cai no chão
      this.player.recompute();
      this.ui.refreshPanels?.();
      this.ui.toastSmall('GM: você recebeu as melhores armaduras do jogo (míticas).', 6, true);
      this.saver.saveNow('gm', true);
    }
    if (!p.gmPrece2) {
      // GM: o Conjunto da Prece completo (10 peças da sua classe, fundo branco, no nível do GM) vai para a bolsa — uma vez por personagem
      p.gmPrece2 = true; // (v0.9.78: conjunto novo com escudo e versões por classe)
      const lvl = Math.max(1, p.level), S = ITEM_SETS.prece;
      for (const baseId of Object.keys(S.bases).map((slot) => setBaseFor(S, slot, this.player.cls.id))) {
        const it = generateEquipment({ baseId, rarity: 'lendario', ilvl: lvl, rng });
        if (this.inv.add(it)) this.loot?.dropFromBag?.(it); // bolsa cheia: cai no chão ao seu lado
      }
      p.inventory = this.inv.slots;
      this.ui.refreshPanels?.();
      this.ui.toastSmall('GM: o Conjunto da Prece completo foi para a sua bolsa.', 6, true);
      this.saver.saveNow('gm', true);
    }
    if (p.gmBoost) return;
    p.gmBoost = true;
    if (p.level < BALANCE.gmLevel) p.level = BALANCE.gmLevel;
    p.xp = 0;
    p.freePoints = (p.freePoints || 0) + BALANCE.gmPoints;
    this.player.recompute();
    this.player.hp = this.player.stats.maxHp;
    this.ui.banner('Poderes de GM', `Nível ${p.level} e +${BALANCE.gmPoints} pontos de atributo para distribuir.`, '#ffd36b', true);
    this.ui.refreshHud?.(); this.ui.enterGame?.(false);
    this.saver.saveNow('gm', true);
  }

  // nomes únicos: personagens antigos com nome repetido (ou igual ao nome da conta de outra pessoa) escolhem outro
  async checkName() {
    const tok = this.saver.serverToken; if (!tok || this.mode !== 'play' || this._nameOk === this.state.charId) return;
    const SA = await import('./serverauth.js');
    const st = this.state, r = await SA.reserveName(tok, st.player.name, st.charId);
    if (r.ok) { this._nameOk = st.charId; return; }
    if (!r.taken) return; // servidor fora do ar: confere na próxima vez
    const nm = await SA.renameOverlay(tok, st.player.name, st.charId, r.error);
    st.player.name = nm; this._nameOk = st.charId;
    this.ui.enterGame?.(false); this.net?.update?.(0);
    this.ui.toastSmall(`Agora seu personagem se chama ${nm}.`, 5);
    this.saver.saveNow('nome novo', true);
  }

  // tira da bolsa as montarias que esta conta não pode ter, e desmonta
  revokeMounts(keep) {
    let n = 0;
    for (const mid of Object.keys(MOUNT_ITEMS)) {
      if (mid === keep) continue;
      const c = this.inv.count(mid); if (c > 0) n += this.inv.removeId(mid, c);
    }
    if (n && this.player.mounted && !this.player.hasHorse()) this.player.setMount(false);
    if (n) { this.saver.saveNow('montaria removida', true); this.ui.refreshHud?.(); }
    return n;
  }

  // ---------- utilidades ----------
  later(delay, fn) {
    // efeitos agendados por um golpe do jogador também são mostrados aos outros jogadores
    const cap = this.net?.capturing;
    this.timers.push({ at: this.time.t + delay, fn: cap ? () => this.net.capture(fn) : fn, mute: this.fx.mute }); // golpe atrasado de chefe também sem partículas
  }
  addZone(z) { const zone = { t: 0, tickT: 0, ...z }; this.zones.push(zone); return zone; }
  hitstop(d) { this.time.hitstop = Math.max(this.time.hitstop, d); }

  moveDir() {
    const mv = this.input.moveVector();
    const f = this.cam.forward(), r = this.cam.right();
    const x = r.x * mv.x - f.x * mv.z, z = r.z * mv.x - f.z * mv.z;
    const l = Math.hypot(x, z);
    return l > 0.001 ? { x: x / l, z: z / l, mag: mv.mag } : { x: 0, z: 0, mag: 0 };
  }

  questCtx() {
    const w = this.state.world;
    return {
      level: this.state.player.level,
      countItem: (id) => this.inv.count(id),
      consume: (id, n) => this.inv.removeId(id, n),
      flags: w.flags,
      discovered: new Set(w.discovered),
    };
  }

  questEvent(evt) {
    const ch = this.quests.handle(evt, this.questCtx());
    for (const c of ch) {
      const def = QUESTS[c.id];
      if (c.kind === 'ready') { this.ui.questToast(`Missão pronta: ${def.name}`, 'Volte para entregar.'); this.audio.play('quest'); this.saver.requestSave('quest'); }
      else if (c.kind === 'stage') { this.ui.questToast(def.name, 'Novo objetivo!'); this.audio.play('quest'); this.saver.requestSave('quest'); }
      else if (c.kind === 'progress') {
        const o = this.quests.objectives(c.id).find((x) => x.type === evt.type && !x.done) || this.quests.objectives(c.id)[0];
        if (o && o.need > 1) this.ui.toastSmall(`${o.text}: ${o.have}/${o.need}`);
      }
    }
    this.onQuestChanged();
  }

  onQuestChanged() { this.ui.refreshQuests(); }

  acceptQuest(id) {
    if (this.quests.accept(id, this.questCtx())) {
      this.audio.play('quest');
      this.ui.questToast('Nova missão', QUESTS[id].name);
      this.onQuestChanged();
      this.saver.requestSave('quest');
      return true;
    }
    return false;
  }

  turnInQuest(id) {
    const rw = this.quests.turnIn(id, this.questCtx());
    if (!rw) return false;
    const P = this.player;
    this.ui.banner('Missão concluída', QUESTS[id].name, '#ffd36b');
    this.audio.play('quest');
    this.loot.giveRewards({ gold: rw.gold, items: rw.items }, P.pos, 'Missão: ' + QUESTS[id].name);
    if (id === 'q2_presas') this.state.world.flags.upgradeUnlocked = true;
    if (id === 'q5_guardiao') this.state.world.flags.campaignDone = true;
    if (rw.xp) this.giveRewardXp(rw.xp, 'Missão');
    this.onQuestChanged();
    this.ui.refreshPanels();
    this.saver.requestSave('quest');
    return true;
  }

  // XP de recompensa fixa (missão, descoberta, segredo) convertida para a curva atual
  giveRewardXp(n, src = '') { const x = scaleRewardXp(n, this.state.player.level); if (x > 0) this.giveXp(x, src); }

  giveXp(n, src = '', share = 0) {
    const p = this.state.player;
    const before = p.level;
    const gained = addXp(p, n);
    const P = this.player;
    this.ui.damageNumber(P.pos.x, P.pos.y + 2.6, P.pos.z, share > 1 ? `+${Math.round(n)} XP (time ÷${share})` : `+${Math.round(n)} XP`, 'xp');
    if (gained > 0) this.onLevelUp(before, p.level);
    this.ui.refreshHud();
    void src;
  }

  // presente de nível deixado na nuvem (doc rift_grant: { level, names: [...] }); aplicado uma vez por personagem
  // Montaria da conta (definida no servidor): lil = Cavalo do Criador, pedrocas = Lobo do Braço Direito
  grantAccountMount() {
    // montaria só para as contas da lista do servidor (padrão: lil = cavalo). As outras perdem a montaria que tinham.
    const kind = this.saver.serverMount || BALANCE.mountForAll || null, id = kind === 'lobo' ? 'lobo_criacao' : kind === 'cavalo' ? 'cavalo_criador' : null;
    if (this.mode !== 'play') return;
    if (this.saver.serverChecked || !this.saver.serverToken) this.revokeMounts(id);
    if (!id || this.inv.count(id) > 0) return;
    const item = { uid: id + '-' + Date.now().toString(36), kind: 'quest', id, qty: 1 };
    // bolsa cheia (ou acima do limite do nível): a montaria entra mesmo assim — nada vai para o chão
    if (this.inv.add(item, true) > 0) return;
    this.ui.banner(kind === 'lobo' ? 'Lobo de Montaria' : 'Cavalo de Montaria', 'Sua montaria está na bolsa! Aperte H (ou o botão da montaria) para montar: corre 20× mais rápido.', kind === 'lobo' ? '#9fc4ff' : '#e8b070');
    this.audio.play('discover');
    this.saver.saveNow('montaria', true);
    this.ui.refreshHud?.();
  }

  async checkGrant() {
    const C = this.saver.cloud;
    if (!C) { if ((this._grantTry = (this._grantTry || 0) + 1) < 4) this.later(10, () => this.checkGrant()); return; }
    try {
      const ref = C.db.doc('data/users/' + C.uid + '/rift_grant');
      const snap = await ref.get();
      if (!snap.exists) return;
      const g = snap.data(), p = this.state.player;
      const names = Array.isArray(g.names) ? g.names : [];
      if (!names.includes(p.name) || !(g.level > p.level)) return;
      let need = -p.xp;
      for (let l = p.level; l < g.level; l++) need += xpToNext(l);
      this.giveXp(Math.max(1, need), 'Presente');
      this.ui.banner('Presente recebido!', `${p.name} subiu para o nível ${p.level}.`, '#ffd36b');
      const rest = names.filter((n) => n !== p.name);
      if (rest.length) await ref.update({ names: rest }); else await ref.delete();
      this.saver.saveNow('presente', true);
    } catch { /* sem nuvem */ }
  }

  // lendários acompanham o nível do herói
  growNamed() {
    const sp = this.state.player, lvl = sp.level;
    const all = [...Object.values(sp.equipment), ...this.inv.slots];
    let changed = false;
    for (const it of all) if (it && it.kind === 'equip' && it.named && (it.ilvl || 0) < lvl) { scaleNamed(it, lvl); changed = true; }
    return changed;
  }

  onLevelUp(from, to) {
    const P = this.player;
    if (this.growNamed()) this.later(1.5, () => this.ui.toastSmall('Seus itens lendários ficaram mais fortes com o seu nível.', 4));
    P.recompute();
    P.hp = P.stats.maxHp;
    if (P.cls.resource.id !== 'furia') P.res = P.stats.maxRes;
    this.fx.beam(P.pos.x, P.pos.y, P.pos.z, 0xffd36b, 18, 1.6, 1.6);
    this.fx.ring(P.pos.x, P.pos.y, P.pos.z, 6, 0xffd36b, 0.8);
    this.fx.burst({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z }, { count: 50, color: [0xffd36b, 0xffffff, 0x5ef0ff], speed: 6, size: 0.4, life: 1.2, up: 6, gravity: 4 });
    if (P.stats.effects.has('aurora')) this.fx.beam(P.pos.x, P.pos.y, P.pos.z, 0xffe8a0, 40, 3, 5);
    this.audio.play('levelup');
    if (!P.action && !P.moveAction) P.startAction('victory', 1.4, { slow: 0.3 });
    const unlocked = [];
    SKILL_UNLOCKS.forEach((lvl, i) => { if (lvl > from && lvl <= to) unlocked.push(P.cls.skills[i].name); });
    this.ui.levelUp(to, unlocked);
    this.net.levelUp();
    this.saver.requestSave('nível');
  }

  spawnTemporary(type, level, x, z, area, keepLevel = false) {
    const e = new Enemy(this, type, level, { x, z, area, temporary: true, noRespawn: true, spawnAnim: true, keepLevel });
    e.aggroed = true;
    this.enemies.push(e);
    return e;
  }

  // reward = o jogador local participou da luta (XP, saque e missões são individuais, como num MMO)
  onEnemyKilled(e, reward = true, cr = null) {
    const st = this.state;
    if (!e.replica) this.spawners.onDeath(e);
    if (!e.replica && e.def.natal && !e.natalDone) { e.natalDone = true; this.natal?.onKilled(e); }
    if (this.target === e) this.target = null;
    if (e.area === this.player.area && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 60) {
      if (e.def.model === 'slime') this.audio.play('squelch');
      if (e.def.model === 'skeleton') this.audio.play('rattle');
      this.fx.burst({ x: e.pos.x, y: e.pos.y + 0.6, z: e.pos.z }, { count: e.def.elite ? (this.fx.bossLite ? 10 : 40) : 16, color: [new THREE.Color(e.def.color).getHex(), 0xffffff], speed: 4, size: 0.4, life: 0.7 });
    }
    if (!reward) { if (e.boss && this.bossEngaged === e) { this.bossEngaged = null; this.ui.bossBar(null); } return; }
    // Vigia (chefe da chave): só a PRIMEIRA vitória dá XP, chave, saque e ouro; ele renasce em 1 minuto para os outros
    if (e.type === 'vigia' && st.world.flags.vigiaDead) { this.ui.toastSmall('Você já derrotou o Vigia: ele não dá mais recompensa para você.', 4); return; }
    st.player.stats.kills[e.type] = (st.player.stats.kills[e.type] || 0) + 1;
    if (!st.world.bestiary.includes(e.type)) st.world.bestiary.push(e.type);
    this.lastLootSource = e.def.name;
    const share = Math.max(1, cr?.share || 1);
    const xp = Math.max(1, Math.round(xpForKill(e.def, e.level, st.player.level) / share));
    this.giveXp(xp, e.def.name, share > 1 ? share : 0);
    // quem só ajudou (time) ganha XP, abate e conquistas; o saque fica com quem bateu
    // offline: o saque é seu; online: quem sorteia é o anfitrião (mesmos itens para todos)
    if (!cr?.assist && (!this.loot.sharedOnline() || e.type === 'vigia')) this.loot.dropFromEnemy(e);
    else if (e.boss || e.def.elite) this.ui.toastSmall(`Ajuda do time: ${e.def.name} derrotado!`, 4);
    if (e.type === 'vigia') {
      st.world.flags.vigiaDead = true;
      const c = this.world.chests.bau_vigia;
      c.group.visible = true;
      this.fx.beam(c.x, 0, c.z, 0xffd36b, 14, 2, 2);
      this.ui.notice('Vigia Corrompido derrotado! Um baú surgiu no salão final — a Chave do Selo está nele.');
    }
    if (e.boss) this.onBossKilled(e);
    this.questEvent({ type: 'kill', target: e.type });
  }

  onEnemyRemoved(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  onBossEngage(e) {
    this.bossEngaged = e;
    this.ui.bossBar(e);
    this.ui.notice('Guardião: ataques fortes são anunciados no chão. Esquive-se!');
    this.audio.play('roar');
  }

  onBossDisengage() {
    this.bossEngaged = null;
    this.ui.bossBar(null);
  }

  onBossKilled(e) {
    const st = this.state;
    this.bossEngaged = null;
    this.ui.bossBar(null);
    st.player.stats.bossKills++;
    const first = !st.world.flags.bossKilled;
    st.world.flags.bossKilled = true;
    st.world.flags.guardiaoOk = 1; // participou da vitória: o Portal da Fenda abre (o servidor anota pela luta que viu)
    this.time.slowmo = 1.6;
    this.cam.shake(0.8, 0.8);
    this.fx.explosion(e.pos.x, e.pos.y, e.pos.z, 9, 0xff4fd8, 1.2);
    this.fx.beam(e.pos.x, e.pos.y, e.pos.z, 0xff4fd8, 60, 3, 4);
    this.audio.play('explosion'); this.audio.play('roar', { gap: 0 });
    this.ui.notice(first ? 'VITÓRIA! O Guardião caiu. O Selo de Eldoria resiste.' : 'Guardião derrotado. Ele voltará a se erguer.');
    this.net.announce('derrotou o Guardião!');
    if (!this.player.action) this.later(1.2, () => this.player.alive && this.player.startAction('victory', 1.6, { slow: 0 }));
    this.saver.requestSave('chefe');
  }

  onPlayerDeath() {
    this.ui.showDeath();
    if (this.bossEngaged) { /* o chefe se reinicia sozinho se o jogador sair */ }
  }

  respawnPlayer() {
    const P = this.player;
    if (P.area === 'cripta') {
      const s = this.interact.dungeonStart();
      P.respawn(s.x, s.z, 'cripta');
    } else if (P.area === 'confins') {
      const s = this.interact.confinsStart();
      this.world.confins.update(s.x, s.z, true);
      P.respawn(s.x, s.z, 'confins');
    } else if (P.area === 'ermos') {
      const s = this.interact.ermosStart();
      P.respawn(s.x, s.z, 'ermos');
    } else if (P.area === 'guardiao') {
      const s = this.interact.guardiaoStart(); // renasce na chegada do mapa 2 (junto do portal de volta)
      P.respawn(s.x, s.z, 'guardiao');
    } else P.respawn(WORLD.spawn.x, WORLD.spawn.z, 'world');
    this.cam.snap(P.pos);
    for (const e of this.enemies) if (!e.dead && ['chase', 'attack', 'special', 'alert'].includes(e.state)) e.setState('return');
    this.ui.hideDeath();
    this.saver.requestSave('respawn');
  }

  // botão de poção: escolhe a poção de VIDA certa (grande se falta muita vida, pequena se falta pouca); idem para o tônico
  lifeCount() { return ['pocao_vida_p', 'pocao_vida', 'pocao_vida_g'].reduce((s, id) => s + this.inv.count(id), 0); }
  manaCount() { return ['tonico_p', 'tonico', 'tonico_g'].reduce((s, id) => s + this.inv.count(id), 0); }
  pickPotion(kind) {
    const P = this.player, ids = kind === 'life' ? ['pocao_vida_p', 'pocao_vida', 'pocao_vida_g'] : ['tonico_p', 'tonico', 'tonico_g'];
    // escolhe a poção que mais cura SEM desperdiçar: a maior cuja cura média cabe no que falta; senão a menor que tiver
    const miss = kind === 'life' ? P.stats.maxHp - P.hp : P.stats.maxRes - P.res;
    const have = ids.filter((id) => this.inv.count(id) > 0);
    if (!have.length) return ids[1];
    const avg = (id) => { const r = CONSUMABLES[id].healRange || CONSUMABLES[id].manaRange; return r ? (r[0] + r[1]) / 2 : 0; };
    const fit = have.filter((id) => avg(id) <= miss * 1.1);
    return fit.length ? fit[fit.length - 1] : have[0];
  }
  usePotion(id = 'pocao_vida') {
    const P = this.player;
    if (!P.alive) return;
    if (id === 'life' || id === 'mana') id = (id === 'life' && this.saver.serverGm) ? 'pocao_vida_g' : this.pickPotion(id);
    if (P.cds.potion > 0) { this.ui.toastSmall('Poção em recarga'); return; }
    const gmInf = CONSUMABLES[id]?.life && this.saver.serverGm; // GM: poção de vida infinita (não gasta, nem precisa ter)
    if (!gmInf && this.inv.count(id) <= 0) { this.ui.toastSmall(`Sem ${CONSUMABLES[id].name}`); this.audio.play('error'); return; }
    const c = CONSUMABLES[id];
    if (c.ammo) { this.ui.toastSmall('As flechas são usadas sozinhas quando o arco atira.', 3); return; }
    if (c.recall) { this.inv.removeId(id, 1); P.startRecall(); this.ui.refreshPanels(); return; }
    if (c.teleport) { this.ui.closeJournal?.(); this.teleports.open({ scroll: true }); return; }
    if (!gmInf) this.inv.removeId(id, 1);
    P.cds.potion = BALANCE.potionCooldown;
    const roll = (r) => Math.round(r[0] + Math.random() * (r[1] - r[0]));
    if (c.healRange) { const v = roll(c.healRange); P.heal(v); this.ui.damageNumber(P.pos.x, P.pos.y + 2.2, P.pos.z, `+${v}`, 'heal'); this.precePotion(v); }
    else if (c.heal || c.healFlat) { const v = Math.round((c.healFlat || 0) + P.stats.maxHp * (c.heal || 0)); P.heal(v); this.precePotion(v); }
    if (c.manaRange) {
      const v = roll(c.manaRange); P.res = Math.min(P.stats.maxRes, P.res + v); this.ui.damageNumber(P.pos.x, P.pos.y + 1.9, P.pos.z, `+${v}`, 'manav');
      if (P.stats.smana && P.cls.resource.id !== 'mana') P.smana = Math.min(P.stats.smana.max, (P.smana || 0) + v); // o tônico também enche a barra de mana do conjunto
      this.precePotion(v, 'r');
    }
    else if (c.resource) P.res = Math.min(P.stats.maxRes, P.res + P.stats.maxRes * c.resource);
    this.fx.burst({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z }, { count: 18, color: [new THREE.Color(c.color).getHex(), 0xffffff], speed: 2, size: 0.3, life: 0.8, up: 3, gravity: -1 });
    this.audio.play('magic', { vol: 0.6 });
    this.questEvent({ type: 'inventory' });
    this.ui.refreshPanels();
  }

  // Conjunto da Prece: a poção de vida cura também os aliados perto (gasta mana; o alcance vem do fundo da melhor peça)
  precePotion(v, kind = 'h') {
    const P = this.player, S = P.stats.prece;
    if (!S || !v) return;
    const res = kind === 'r'; // tônico: devolve Mana/Energia/Fúria para o time
    const allies = this.net.alliesNear(P.area, P.pos, S.radius, !res);
    if (!allies.length) return; // ninguém precisando por perto: não gasta mana
    const mage = P.cls.resource.id === 'mana';
    if ((mage ? P.res : P.smana) < S.cost) { this.ui.toastSmall(`Mana insuficiente para curar os aliados (precisa de ${S.cost})`); return; }
    if (mage) P.res -= S.cost; else P.smana -= S.cost;
    const amt = Math.max(1, Math.round(v * S.mult));
    this.net.sendHeal(allies.map((g) => g.id), amt, S.radius, res ? 'r' : 'h');
    const col = res ? 0x7ab8ff : 0x9fffd0;
    this.fx.ring(P.pos.x, P.pos.y, P.pos.z, S.radius, col, 0.7);
    for (const g of allies) {
      this.fx.beam(g.pos.x, g.pos.y, g.pos.z, col, 4, 0.7, 0.7);
      this.fx.burst({ x: g.pos.x, y: g.pos.y + 1, z: g.pos.z }, { count: 12, color: [col, 0xffffff], speed: 2, size: 0.28, life: 0.7, up: 3, gravity: -1 });
      this.ui.damageNumber(g.pos.x, g.pos.y + 2.2, g.pos.z, `+${amt}`, res ? 'manav' : 'heal');
    }
    this.ui.toastSmall(`Prece: +${amt} de ${res ? 'mana' : 'vida'} em ${allies.length} aliado${allies.length > 1 ? 's' : ''}`);
  }
  // recebeu a cura da Prece de outro jogador
  receivePrece(from, amt, kind = 'h') {
    const P = this.player;
    if (!P.alive) return;
    const res = kind === 'r', col = res ? 0x7ab8ff : 0x9fffd0;
    if (res) { amt = Math.min(900, amt); P.res = Math.min(P.stats.maxRes, P.res + amt); if (P.stats.smana && P.cls.resource.id !== 'mana') P.smana = Math.min(P.stats.smana.max, (P.smana || 0) + amt); }
    else P.heal(amt);
    this.ui.damageNumber(P.pos.x, P.pos.y + 2.2, P.pos.z, `+${amt}`, res ? 'manav' : 'heal');
    this.fx.burst({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z }, { count: 14, color: [col, 0xffffff], speed: 2, size: 0.3, life: 0.8, up: 3, gravity: -1 });
    this.fx.ring(P.pos.x, P.pos.y, P.pos.z, 1.6, col, 0.5);
    this.ui.toastSmall(res ? `${from} devolveu ${P.cls.resource.name.toLowerCase()} para você com a Prece (+${amt})` : `${from} curou você com a Prece (+${amt})`);
  }

  recallToVillage() {
    const P = this.player;
    this.ui.loadScreen({ scene: 'vila', title: 'Vila de Eldoria', sub: 'Zona segura', minMs: 900 }, () => {
      if (P.area !== 'world') { this.world.setArea('world'); this.sky.setIndoor(false); }
      P.teleport(WORLD.spawn.x, WORLD.spawn.z, 'world');
      this.cam.snap(P.pos);
      this.audio.musicMode = 'explore';
    });
  }

  enterDungeon() {
    const P = this.player;
    this.ui.loadScreen({ area: 'cripta', title: 'Cripta do Vigia', sub: 'Masmorra · Nível 5–7' }, () => {
      const s = this.interact.dungeonStart();
      P.teleport(s.x, s.z, 'cripta');
      this.world.setArea('cripta');
      this.sky.setIndoor(true);
      this.cam.snap(P.pos); this.cam.yaw = 0;
      this.audio.musicMode = 'dungeon';
      this.ui.zoneLabel('Cripta do Vigia', 'Masmorra · Nível 5–7');
      this.questEvent({ type: 'reach', poi: 'cripta_interior' });
      if (!this.state.world.discovered.includes('cripta_interior')) this.state.world.discovered.push('cripta_interior');
    });
  }

  // viagem genérica entre mapas (com fade)
  travel(area, x, z, title, sub, after) {
    const P = this.player;
    this.audio.play('portal');
    this.ui.loadScreen({ area, title: title || '', sub: sub || '' }, () => {
      if (this.bossEngaged) this.onBossDisengage();
      this.world.setArea(area);
      if (area === 'confins') this.world.confins.update(x, z, true);
      P.teleport(x, z, area);
      this.sky.setIndoor(area === 'cripta');
      this.cam.snap(P.pos);
      this.zoneName = null;
      this.audio.musicMode = area === 'cripta' ? 'dungeon' : 'explore';
      if (title) this.ui.zoneLabel(title, sub || '');
      after?.();
      this.saver.requestSave('viagem');
    });
  }

  // Pedra de Teleporte: vai para o mundo e a região escolhidos (com tela de carregamento)
  teleportPlace(area, x, z, title, sub) {
    const P = this.player;
    this.audio.play('portal');
    this.ui.loadScreen({ area, title, sub }, () => {
      if (this.bossEngaged) this.onBossDisengage();
      this.world.setArea(area);
      if (area === 'confins') this.world.confins.update(x, z, true);
      const s = safeSpot(this.world, area, x, z);
      if (area === 'confins') this.world.confins.update(s.x, s.z, true);
      P.teleport(s.x, s.z, area);
      P.invuln = Math.max(P.invuln, 2); // chegada protegida
      this.sky.setIndoor(area === 'cripta');
      this.cam.snap(P.pos);
      this.zoneName = null;
      this.audio.musicMode = area === 'cripta' ? 'dungeon' : 'explore';
      if (title) this.ui.zoneLabel(title, sub || '');
      this.fx.beam(s.x, P.pos.y, s.z, 0x7fe9ff, 10, 1.4, 1.4);
      this.saver.requestSave('teleporte');
    });
  }

  enterConfins() {
    const s = this.interact.confinsStart();
    this.travel('confins', s.x, s.z, 'Confins de Eldoria', 'Muitos biomas · Nível 65–165', () => {
      const st = this.state.world;
      if (!st.discovered.includes('confins')) { st.discovered.push('confins'); this.giveRewardXp(300, 'Descoberta'); }
      this.cam.yaw = 0;
    });
  }

  // Portal da Fenda liberado? Online, quem decide é o servidor (livro); sem servidor, o save
  guardiaoOk() {
    const s = this.net && this.net.gdCid === this.state.charId ? this.net.gdSrv : undefined;
    if (s === 1) return true;
    if (s === 0) return false;
    return !!this.state.world.flags.guardiaoOk;
  }

  enterErmos() {
    const s = this.interact.ermosStart();
    this.travel('ermos', s.x, s.z, 'Ermos da Fenda', 'Terras selvagens · Nível 25–60', () => {
      const st = this.state.world;
      if (!st.discovered.includes('ermos')) { st.discovered.push('ermos'); this.giveRewardXp(150, 'Descoberta'); }
      this.cam.yaw = 0;
    });
  }

  exitErmos() { this.travel('guardiao', PORTAL_FENDA.x, PORTAL_FENDA.z + 7, 'Planície do Guardião', 'Mapa 2 · Trono do Guardião'); }

  // MAPA 2: Planície do Guardião (portal no topo do Planalto da Fenda)
  enterGuardiao() {
    const s = this.interact.guardiaoStart();
    this.travel('guardiao', s.x, s.z, 'Planície do Guardião', 'Mapa 2 · Nível 5–18 · Chefe 25', () => {
      const st = this.state.world;
      if (!st.discovered.includes('guardiao')) { st.discovered.push('guardiao'); this.giveRewardXp(100, 'Descoberta'); }
      this.cam.yaw = 0;
    });
  }
  exitGuardiao() { this.travel('world', GUARDIAO.arrive.x, GUARDIAO.arrive.z, 'Planalto da Fenda', 'Mapa 1 · Vale de Eldoria'); }

  exitDungeon() {
    const P = this.player;
    this.ui.loadScreen({ area: 'world', title: 'Vale de Eldoria', sub: 'Saindo da cripta', minMs: 900 }, () => {
      const d = this.interact.cryptDoor();
      P.teleport(d.x, d.z, 'world');
      this.world.setArea('world');
      this.sky.setIndoor(false);
      this.cam.snap(P.pos);
      this.audio.musicMode = 'explore';
    });
  }

  // ---------- mira ----------
  // modo mira de tiro: classes de longe, a pé, jogando (o tiro segue a câmera)
  aimMode() {
    const P = this.player;
    return !!(this.settings.crosshair && P && P.alive && P.cls.basic.type !== 'melee' && !P.mounted && this.mode === 'play' && !this.cam.shot);
  }
  computeAim() {
    const P = this.player;
    const b = P.cls.basic;
    const range = b.range || 20;
    const useMouse = !this.isTouch || this.input.lastDevice === 'mouse';
    let dirX = Math.sin(P.yaw), dirZ = Math.cos(P.yaw), target = null, ground = null;
    const am = this.aimMode();
    if ((useMouse && this.input.locked) || am) {
      // mouse preso / mira de tiro: mira para onde a câmera olha, com ajuda para pegar o inimigo nessa direção
      const f = this.cam.forward(), facing = Math.atan2(f.x, f.z), melee = b.type === 'melee';
      const keep = am ? 0.22 : 0.5;
      target = this.target && this.target.alive?.() && this.target.area === P.area && Math.abs(angleDiffRad(Math.atan2(this.target.pos.x - P.pos.x, this.target.pos.z - P.pos.z), facing)) < keep && Math.hypot(this.target.pos.x - P.pos.x, this.target.pos.z - P.pos.z) < range + 2 ? this.target : null;
      if (!target) target = autoTarget(this, P.pos.x, P.pos.z, facing, melee ? b.range + 3 : range, melee ? 1.4 : am ? 0.2 : 0.55, am);
      if (target) { const dx = target.pos.x - P.pos.x, dz = target.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; dirX = dx / l; dirZ = dz / l; ground = { x: target.pos.x, z: target.pos.z }; }
      else { dirX = f.x; dirZ = f.z; ground = { x: P.pos.x + dirX * Math.min(range, 10), z: P.pos.z + dirZ * Math.min(range, 10) }; }
    } else if (useMouse && this.input.mouse.inside) {
      const gp = this.cam.groundPoint(this.input.mouse.nx, this.input.mouse.ny, P.pos.y + 1.0, new THREE.Vector3());
      target = this.hover && this.hover.alive() ? this.hover : null;
      if (gp) {
        if (!target) {
          // assistência: inimigo perto do ponto mirado
          let best = null, bd = 2.6;
          for (const e of this.enemies) { if (!e.alive() || e.area !== P.area) continue; const d = Math.hypot(e.pos.x - gp.x, e.pos.z - gp.z) - e.radius; if (d < bd) { bd = d; best = e; } }
          target = best;
        }
        const tx = target ? target.pos.x : gp.x, tz = target ? target.pos.z : gp.z;
        const dx = tx - P.pos.x, dz = tz - P.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.3) { dirX = dx / l; dirZ = dz / l; }
        const gl = Math.min(l, range);
        ground = { x: P.pos.x + dirX * gl, z: P.pos.z + dirZ * gl };
        if (target) ground = { x: target.pos.x, z: target.pos.z };
      }
    } else {
      // analógico: alvo automático. Corpo a corpo olha à frente; à distância considera qualquer direção
      // (preferindo o que está à frente e o alvo atual), sempre dentro do alcance real do ataque.
      const mv = this.moveDir();
      const facing = mv.mag > 0.2 ? Math.atan2(mv.x, mv.z) : P.yaw;
      const melee = P.cls.basic.type === 'melee';
      target = autoTarget(this, P.pos.x, P.pos.z, facing, melee ? b.range + 3.4 : range, melee ? 2.2 : Math.PI);
      if (target) { const dx = target.pos.x - P.pos.x, dz = target.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; dirX = dx / l; dirZ = dz / l; ground = { x: target.pos.x, z: target.pos.z }; }
      else { dirX = Math.sin(facing); dirZ = Math.cos(facing); ground = { x: P.pos.x + dirX * 8, z: P.pos.z + dirZ * 8 }; }
    }
    if (!ground) ground = { x: P.pos.x + dirX * 8, z: P.pos.z + dirZ * 8 };
    if (target) this.target = target;
    return { dirX, dirZ, yaw: Math.atan2(dirX, dirZ), target, ground };
  }

  // mira na tela: no monstro travado (vermelha) ou no ponto à frente para onde a flecha vai
  drawCrosshair(on) {
    const el = this.ui.el.mira;
    if (!el) return;
    if (!on || this.ui.blocking()) { if (!el._h) { el._h = true; el.classList.add('hidden'); } return; }
    if (el._h !== false) { el._h = false; el.classList.remove('hidden'); }
    const P = this.player, aim = this.computeAimCached();
    const v = this._mv || (this._mv = new THREE.Vector3());
    const T = aim.target;
    if (T) v.set(T.pos.x, T.pos.y + (T.rig?.height || 1.6) * 0.55, T.pos.z);
    else { const range = Math.min(P.cls.basic.range || 20, 16); v.set(P.pos.x + aim.dirX * range, P.pos.y + 1.4, P.pos.z + aim.dirZ * range); }
    v.project(this.camera);
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const x = Math.round(clamp((v.x * 0.5 + 0.5) * w, 20, w - 20)), y = Math.round(clamp((-v.y * 0.5 + 0.5) * h, 20, h - 20));
    const tr = `translate(${x}px,${y}px)`;
    if (el._tr !== tr) { el._tr = tr; el.style.transform = tr; }
    const cls = T ? 'mira lock' : 'mira far';
    if (el._c !== cls || el._t !== T) { el._c = cls; el._t = T; el.className = cls; }
  }
  computeAimCached() {
    if (this._aimF !== this.frameNo || !this._aimC) { this._aimF = this.frameNo; this._aimC = this.computeAim(); }
    return this._aimC;
  }

  updateHover() {
    this.hover = null;
    if (this.input.locked) return;
    if (this.isTouch && this.input.lastDevice !== 'mouse') return;
    if (!this.input.mouse.inside) return;
    const v = new THREE.Vector3();
    let best = null, bd = 48;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    for (const e of this.enemies) {
      if (!e.alive() || e.area !== this.player.area || !e.visibleToPlayer) continue;
      v.set(e.pos.x, e.pos.y + e.rig.height * 0.5, e.pos.z).project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const d = Math.hypot(sx - mx, sy - my) - (e.def.boss ? 40 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    this.hover = best;
  }

  handleInput(dt = 1 / 60) {
    const I = this.input, P = this.player, ui = this.ui;
    if (I.justPressed('menu')) ui.escape();
    if (ui.blocking()) return;
    if (I.justPressed('inventory')) ui.togglePanel('inventory');
    if (I.justPressed('character')) ui.togglePanel('character');
    if (I.justPressed('skills')) ui.togglePanel('skills');
    if (I.justPressed('quests')) ui.togglePanel('quests');
    if (I.justPressed('map')) ui.togglePanel('map');
    if (I.justPressed('photo')) ui.togglePhoto();
    if (I.justPressed('emote')) ui.toggleEmotes();
    if (I.justPressed('chat')) ui.focusChat();
    if (!P.alive || this.mode !== 'play') return;
    if (I.justPressed('interact') || I.touch.interact) this.interact.activate();
    if (I.justPressed('potion') || I.touch.potion) this.usePotion('life');
    if (I.justPressed('mount') || I.touch.mount) this.player.toggleMount();
    if (I.justPressed('tonic') || I.touch.tonic) this.usePotion('mana');
    if (P.moveAction) return;
    const aim = this.computeAim();
    if (I.justPressed('dodge') || I.touch.dodge) this.net.capture(() => doDodge(this, P));
    if (P.moveAction) return;
    for (let i = 0; i < 4; i++) if (I.justPressed('skill' + (i + 1)) || I.touch.skill[i]) { this.net.capture(() => doSkill(this, P, i, aim)); return; }
    // clicar em outro jogador abre a ficha dele (e não ataca enquanto o botão estiver apertado)
    if (I.mouse.leftPressed && !ui.pointerOverUi && this.social?.tryOpenAt(I.mouse.x, I.mouse.y)) this._noAtk = true;
    if (this._noAtk && !I.mouse.left) this._noAtk = false;
    const wantAttack = !this._noAtk && ((I.mouse.left && !ui.pointerOverUi && ui.panelCount() === 0) || I.touch.attack || (I.mouse.left && ui.panelCount() > 0 && !ui.pointerOverUi));
    // celular (mira automática): arqueiro e mago só atiram quando há um alvo no alcance. Antes, segurando o botão
    // e andando, as flechas saíam para todo lado (para onde você estava andando) sem nada para acertar.
    const rangedNoTarget = I.touch.attack && !I.mouse.left && P.cls.basic.type !== 'melee' && !aim.target;
    this._ntT = Math.max(0, (this._ntT || 0) - dt);
    if (wantAttack && rangedNoTarget && this._ntT <= 0) { this._ntT = 3; ui.toastSmall('Nenhum alvo no alcance', 1.5); }
    if (wantAttack && !rangedNoTarget && P.cds.basic <= 0 && (!P.action || P.action.t > P.action.dur * 0.7 || ['victory'].includes(P.action.name))) this.net.capture(() => doBasic(this, P, aim));
  }

  checkErmosZone() {
    const P = this.player, st = this.state.world;
    let zone = 'Ermos da Fenda', best = Infinity, zoneDef = null;
    for (const [id, L] of Object.entries(ERMOS.locations)) {
      const d = Math.hypot(P.pos.x - (L.x + ERMOS.offset.x), P.pos.z - (L.z + ERMOS.offset.z));
      if (d < L.r && L.r < best) { best = L.r; zone = L.name; zoneDef = L; }
      const key = 'ermos_' + id;
      if (d < L.r && !st.discovered.includes(key)) {
        st.discovered.push(key);
        this.giveRewardXp(60, 'Descoberta'); this.ui.zoneLabel(L.name, 'Ermos da Fenda' + (L.levels ? ' · ' + (/\d/.test(L.levels) ? 'Nível ' : '') + L.levels : '')); this.audio.play('discover');
        this.saver.requestSave('descoberta');
      }
    }
    if (zone !== this.zoneName) {
      this.zoneName = zone; this.ui.setZone(zone);
      const min = zoneDef?.levels ? parseInt(zoneDef.levels, 10) : NaN;
      if (Number.isFinite(min) && this.state.player.level < min - 1) {
        this.ui.banner('Região perigosa', `${zone}: inimigos de nível ${zoneDef.levels}. Você é nível ${this.state.player.level}.`, '#ff6b5e');
        this.audio.play('error');
      }
    }
  }

  checkConfinsZone() {
    const P = this.player, st = this.state.world, C = this.world.confins;
    const inCamp = this.world.isSafe(P.pos.x, P.pos.z, 'confins');
    const B = C.biomeAtWorld(P.pos.x, P.pos.z);
    // megaestrutura (castelo, caverna, templo…): nome próprio e descoberta
    const S = (CONFINS.structs || []).find((s) => Math.hypot(P.pos.x - s.x - CONFINS.offset.x, P.pos.z - s.z - CONFINS.offset.z) < s.r);
    if (S && !st.discovered.includes('est_' + S.id)) {
      st.discovered.push('est_' + S.id);
      this.giveRewardXp(400, 'Descoberta'); this.ui.zoneLabel(S.name, S.sub); this.audio.play('discover');
      this.saver.requestSave('descoberta');
    }
    const zone = inCamp ? CONFINS.camp.name : S ? S.name : B.name;
    const key = 'confins_' + B.id;
    if (!inCamp && !st.discovered.includes(key)) {
      st.discovered.push(key);
      this.giveRewardXp(120, 'Descoberta'); this.ui.zoneLabel(B.name, `Confins de Eldoria · Nível ${B.levels[0]}–${B.levels[1]}`); this.audio.play('discover');
      this.saver.requestSave('descoberta');
    }
    if (zone !== this.zoneName) {
      this.zoneName = zone; this.ui.setZone(zone);
      if (!inCamp && this.state.player.level < B.levels[0] - 1) {
        this.ui.banner('Região perigosa', `${zone}: inimigos de nível ${B.levels[0]}–${B.levels[1]}. Você é nível ${this.state.player.level}.`, '#ff6b5e');
        this.audio.play('error');
      }
    }
  }

  // ---------- mundo vivo ----------
  checkDiscovery(dt) {
    this.discoverT -= dt;
    if (this.discoverT > 0) return;
    this.discoverT = 0.4;
    const P = this.player, st = this.state.world;
    if (P.area === 'cripta') { this.zoneName = 'Cripta do Vigia'; return; }
    if (P.area === 'ermos') return this.checkErmosZone();
    if (P.area === 'confins') return this.checkConfinsZone();
    let zone = P.area === 'guardiao' ? 'Planície do Guardião' : 'Vale de Eldoria', best = Infinity, zoneDef = null;
    for (const [id, L] of Object.entries(LOCATIONS)) {
      if ((L.area || 'world') !== P.area) continue; // cada mapa com os seus lugares
      const d = Math.hypot(P.pos.x - L.x, P.pos.z - L.z);
      if (d < L.r && L.r < best) { best = L.r; zone = L.name; zoneDef = L; }
      if (d < L.r && !st.discovered.includes(id)) {
        st.discovered.push(id);
        if (L.xp) { this.giveRewardXp(L.xp, 'Descoberta'); this.ui.zoneLabel(L.name, 'Local descoberto' + (L.levels ? ' · Nível ' + L.levels : '')); this.audio.play('discover'); }
        this.questEvent({ type: 'reach', poi: id });
        this.saver.requestSave('descoberta');
      }
    }
    if (zone !== this.zoneName) {
      this.zoneName = zone; this.ui.setZone(zone);
      if (zoneDef === LOCATIONS.planalto && !this._portalHint && (this.state.player.level >= ERMOS.reqLevel || st.flags.bossKilled)) {
        this._portalHint = true;
        this.later(1.5, () => this.ui.banner('Próximo mapa: Planície do Guardião', 'O portal fica no norte do topo do Planalto (◎ no minimapa). Lá, atrás do trono do chefe, fica o portal para os Ermos.', '#e7a6ff'));
      }
      const min = zoneDef?.levels ? parseInt(zoneDef.levels, 10) : NaN;
      if (Number.isFinite(min) && this.state.player.level < min - 1) {
        this.ui.banner('Região perigosa', `${zone}: inimigos de nível ${zoneDef.levels}. Você é nível ${this.state.player.level}.`, '#ff6b5e');
        this.audio.play('error');
      }
    }
  }

  updateLights(dt) {
    this.lightT -= dt;
    const P = this.player;
    const focus = P ? P.pos : this.cam.smooth;
    const area = P ? P.area : 'world';
    if (this.lightT <= 0) {
      this.lightT = 0.3;
      const cand = this.world.lightSources.filter((s) => (s.area || 'world') === area)
        .map((s) => ({ s, d: Math.hypot(s.x - focus.x, s.z - focus.z) }))
        .filter((o) => o.d < o.s.dist + 25 && (o.s.intensity > 0 || this.night > 0.1))
        .sort((a, b) => a.d - b.d);
      this.lightPick = cand.slice(0, area === 'cripta' ? 2 : 3).map((o) => o.s);
    }
    const pick = this.lightPick || [];
    const t = this.time.t;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      if (area === 'cripta' && i === 2 && P) {
        L.position.set(P.pos.x, P.pos.y + 2.6, P.pos.z); L.color.set(0xffc080); L.intensity = 6; L.distance = 15;
        continue;
      }
      const s = pick[i];
      if (!s) { L.intensity = 0; continue; }
      const base = s.intensity + (s.night - s.intensity) * this.night;
      const fl = s.flicker ? 0.85 + Math.sin(t * 13 + i) * 0.08 + Math.sin(t * 29 + i * 2) * 0.07 : 1;
      L.position.set(s.x, s.y, s.z); L.color.set(s.color); L.intensity = Math.max(0, base) * fl * 1.6; L.distance = s.dist;
    }
  }

  // Ultra leve: as pecinhas do monstro (olhos, dentes, botões, chifrinhos) que ficariam com menos de 3 pixels na tela
  // não são desenhadas — de longe não dá para ver mesmo, e cada peça é uma "pintura" a menos para o celular.
  enemyLod(e, lim) {
    let L = e._lod;
    if (!L) {
      L = e._lod = { parts: [], n: 0 };
      const root = e.rig.root, s0 = e.baseScale || 1;
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || !m.visible || !m.geometry) return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        // tamanho da peça no monstro em tamanho normal: a escala da raiz fica de fora. Antes usava a escala do mundo,
        // e um monstro medido no meio do "nascer" (raiz quase 0) tinha TODAS as peças "pequenas" → ficava invisível
        let det = 1; for (let o = m; o && o !== root; o = o.parent) det *= o.matrix.determinant();
        const r = m.geometry.boundingSphere.radius * Math.cbrt(Math.abs(det)) * s0;
        if (r > 0 && r < 0.35) L.parts.push({ m, r });
      });
      L.parts.sort((a, b) => a.r - b.r);
    }
    let want = 0;
    while (want < L.parts.length && L.parts[want].r < lim) want++;
    if (want === L.n) return;
    for (let i = 0; i < L.parts.length; i++) {
      const q = L.parts[i];
      if (i < want) { if (q.m.visible) { q.m.visible = false; q.hid = true; } }
      else if (q.hid) { q.m.visible = true; q.hid = false; }
    }
    L.n = want;
  }

  updateFlames(dt) {
    if (!this.settings.particles) return; // partículas desligadas: sem faíscas e fumaça de enfeite
    for (const f of this.world.flames) {
      if ((f.area || 'world') !== (this.player?.area || 'world')) continue;
      if (Math.random() < dt * (f.kind === 'fogueira' ? 30 : 10)) this.fx.emit(f.x + (Math.random() - 0.5) * 0.5, f.y, f.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, Math.random() < 0.5 ? 0xffa040 : 0xffd36b, 0.35, 0.6, -0.5, 1);
      if (f.smoke && Math.random() < dt * 4) this.fx.emit(f.x, f.y + 1.5, f.z, 0.3, 1.5, 0.1, 0x3a3a40, 1.2, 4, -0.1, 0.1);
    }
  }

  // ---------- laço principal ----------
  frame() {
    const nowT = performance.now();
    // celular: no máximo 60 quadros por segundo (telas de 90/120 Hz faziam o dobro de trabalho e esquentavam)
    if (this.isTouch) {
      const el = nowT - (this._capLast || 0); this._capLast = nowT;
      this._capAcc = Math.min(50, (this._capAcc || 0) + el);
      if (this._capAcc < 1000 / 60 - 1) return;
      this._capAcc = Math.max(0, Math.min(1000 / 60, this._capAcc - 1000 / 60));
    }
    let rdt = Math.min(0.05, (nowT - this.lastFrame) / 1000); this.lastFrame = nowT;
    this.time.real += rdt;
    this.fpsAcc += rdt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      // rodou bem por ~15 s: o gráfico escolhido aguenta (tira a proteção de travamento)
      if (this._gfxGuard !== undefined) { if (this.fps >= 8) this._gfxGuard += 0.5; if (this._gfxGuard >= 15) { try { localStorage.removeItem('rift.gfxguard'); } catch {} this._gfxGuard = undefined; } }
      if (this.settings.autoRes && this.mode === 'play') this.autoQuality(); // também no Ultra leve: só cai se travar e volta sozinha
    }
    let dt = rdt;
    if (this.time.hitstop > 0) { this.time.hitstop -= rdt; dt *= 0.08; }
    if (this.time.slowmo > 0) { this.time.slowmo -= rdt; dt *= 0.32; }
    if (this.mode === 'play' && this.ui.isPaused()) dt = 0;
    try {
      if (this.mode === 'title') this.updateTitle(rdt);
      else if (this.mode === 'play') { const t0 = performance.now(); this.updatePlay(dt, rdt); this.profAdd('jogo', performance.now() - t0); }
    } catch (e) {
      console.error(e);
      globalThis.__eldCapture?.(e, { origem: 'frame' });
      this.ui.reportError?.(e);
    }
    this.input.endFrame();
    if (MUNDO) return; // mundo no servidor: não desenha nada
    this.hurtFx.update(rdt, this.renderer);
    { const t0 = performance.now(); if (!(this.ultra && UltraAtmos.render(this))) this.renderer.render(this.scene, this.camera); this.profAdd('desenho', performance.now() - t0); }
    // Shader nunca é jogado fora: antes, cada efeito que sumia descartava o shader e o próximo igual compilava
    // de novo — eram as "travadinhas" no meio da luta. Agora cada tipo compila uma vez só por sessão.
    const progs = this.renderer.info.programs;
    if (progs && progs.length !== this._pinN) { for (const pr of progs) if (!pr._pin) { pr._pin = 1; pr.usedTimes++; } this._pinN = progs.length; }
    if (this.mode === 'play' && !this._warm) { this._warm = true; this.fx.warmup(this.renderer, this.camera); }
  }

  updateTitle(dt) {
    this.titleT += dt;
    const a = this.titleT * 0.04 + 2.2;
    const cx = 0, cz = 40;
    this.camera.position.set(cx + Math.sin(a) * 48, 24, cz + Math.cos(a) * 48);
    this.camera.lookAt(cx, 4, cz - 10);
    const tod = 0.69;
    const r = this.sky.update(dt, tod, { x: cx, y: 2, z: cz }, this.camera);
    this.night = r.night;
    this.world.update(dt, this.titleT, r.night, null);
    this.fx.update(dt, this.camera);
    this.updateLights(dt);
    this.updateFlames(dt);
  }

  updatePlay(dt, rdt) {
    // mouse preso solta sozinho quando abre janela, diálogo ou menu
    if (this.input.locked && (this.ui.panelCount() > 0 || this.ui.blocking())) this.input.unlock();
    const P = this.player, st = this.state;
    this.time.t += dt;
    st.player.stats.playTime += dt;
    // timers e zonas
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; if (this.time.t >= t.at) { this.timers.splice(i, 1); this.fx.mute = !!t.mute; try { t.fn(); } catch (e) { console.error(e); globalThis.__eldCapture?.(e, { origem: 'timer' }); } this.fx.mute = false; } }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t += dt; z.tickT -= dt;
      if (z.tickT <= 0) { z.tickT = z.tick || 0.5; z.onTick?.(z); }
      if (z.t >= z.dur) this.zones.splice(i, 1);
    }
    // tempo do dia
    const off = this.net?.room?.clockOff;
    if (off != null) {
      // online: um relógio só para todos (hora do servidor) — todo mundo vê o mesmo dia/noite
      const t = ((Date.now() + off) / 1000 / BALANCE.dayLengthSec + 0.32) % 1;
      if (t < st.world.timeOfDay - 0.5) this.dayCount++;
      st.world.timeOfDay = t;
    } else if (dt > 0) {
      st.world.timeOfDay += dt / BALANCE.dayLengthSec;
      if (st.world.timeOfDay >= 1) { st.world.timeOfDay -= 1; this.dayCount++; }
    }
    this.updateHover();
    this.handleInput(dt);
    P.update(dt);
    // inimigos (dormentes quando longe)
    const _tE = performance.now(); // perfil: monstros
    const active = [];
    const client = this.net.isClient();
    // pecinhas de monstro com menos de ~2,5 px na tela (3 px no Ultra leve) não são desenhadas: invisíveis de longe, e cada uma é uma "pintura" a menos
    this.frameNo = (this.frameNo || 0) + 1;
    const rem = client ? null : this.net.remotes();
    const dormD = this.isTouch ? 55 : BALANCE.enemyDormantDist, dormD2 = dormD * dormD, viewD2 = this.enemyViewDist * this.enemyViewDist;
    const lodK = ((this.leve ? 3 : this.lowGfx ? 5 : 2.5) * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(200, window.innerHeight);
    for (const e of this.enemies) {
      const ex = e.pos.x - P.pos.x, ez = e.pos.z - P.pos.z, d2 = ex * ex + ez * ez;
      const same = e.area === P.area;
      // monstros acordam perto de QUALQUER jogador (mundo compartilhado), não só do seu herói
      if (!client) {
        let dn2 = same ? d2 : Infinity;
        if (dn2 > dormD2) for (let i = 0; i < rem.length; i++) { const q = rem[i]; if (q.area !== e.area) continue; const qx = e.pos.x - q.pos.x, qz = e.pos.z - q.pos.z, q2 = qx * qx + qz * qz; if (q2 < dn2) dn2 = q2; }
        e.dormant = dn2 > dormD2 && !(e.boss && e.boss.engaged); // celular anfitrião: só simula os monstros mais perto
      } else e.dormant = false;
      // longe (dentro da neblina) não desenha nem recalcula os ossos do modelo: bem mais leve no celular
      const vis = same && d2 < viewD2 && !e.removed;
      if (!vis && !e.rig.root.visible && e._sh === false) { e.visibleToPlayer = false; if (!e.dormant || e.dead) active.push(e); continue; } // longe e já escondido: nada a mexer
      const d = Math.sqrt(d2);
      // sombra redonda e brilho dos olhos só de perto (cada um é mais um desenho por monstro)
      const blobOn = vis && d < 24, haloOn = vis && d < 18 && !this.lowGfx;
      if (e._bl !== blobOn) { e._bl = blobOn; if (e.rig.blob) e.rig.blob.visible = blobOn; }
      if (e._hl !== haloOn) { e._hl = haloOn; if (e.rig.halos) for (const h of e.rig.halos) h.visible = haloOn; }
      e.rig.root.visible = vis; e.rig.root.matrixWorldAutoUpdate = vis;
      if (vis && (lodK || e._lod?.n)) this.enemyLod(e, d * lodK);
      // sombra só dos monstros perto (a sombra de cada monstro custava outra "pintura" inteira dele — era o que mais pesava)
      const sh = vis && d < (this.enemyShadowDist || 26);
      if (e._sh !== sh) { e._sh = sh; e.rig.root.traverse((m) => { if (!m.isMesh) return; if (m.userData.cs0 === undefined) m.userData.cs0 = m.castShadow; m.castShadow = sh && m.userData.cs0; }); }
      e.visibleToPlayer = same && d < 60;
      if (!e.dormant || e.dead) active.push(e);
    }
    const lite = this.fx.bossLite, big = (e) => lite && !!(e.boss || e.def.boss || e.def.miniboss || e.def.eventBoss || e.def.elite || e.def.worldBoss);
    if (client) for (const e of active) { this.fx.mute = big(e); e.netUpdate(dt); }
    else {
      // vizinhos (para não se amontoarem) por uma grade de 4 m — antes era uma busca em todos contra todos
      // chave numérica (texto montado 10x por monstro pesava): área×1e6 + célula
      const grid = this._eg || (this._eg = new Map());
      for (const c of grid.values()) c.length = 0;
      const AK = { world: 0, cripta: 1, ermos: 2, confins: 3, guardiao: 4 };
      const gk = (a, cx, cz) => (AK[a] || 0) * 1e6 + (cx + 500) * 1000 + (cz + 500);
      for (const e of active) { const k = gk(e.area, Math.floor(e.pos.x / 4), Math.floor(e.pos.z / 4)); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(e); }
      if (grid.size > 4000) grid.clear();
      const fn = this.frameNo;
      for (const e of active) {
        // monstro calmo e longe de todos (parado/passeando a >25 m): pensa 1 a cada 3 quadros, com o tempo somado
        const calm = !e.dead && (e.state === 'idle' || e.state === 'patrol') && !e.boss && !e.def.boss && !e.def.worldBoss && !e.flashT && !e.hurtT;
        if (calm) {
          let far = true;
          const px = e.pos.x - P.pos.x, pz = e.pos.z - P.pos.z;
          if (e.area === P.area && px * px + pz * pz < 625) far = false;
          if (far && rem) for (let i = 0; i < rem.length; i++) { const q = rem[i]; if (q.area !== e.area) continue; const qx = e.pos.x - q.pos.x, qz = e.pos.z - q.pos.z; if (qx * qx + qz * qz < 625) { far = false; break; } }
          if (far) { e._skipDt = (e._skipDt || 0) + dt; if ((fn + (e.id | 0)) % 3 !== 0) continue; }
        }
        const edt = dt + (e._skipDt || 0); e._skipDt = 0;
        const near = e._near || (e._near = []); near.length = 0;
        const cx = Math.floor(e.pos.x / 4), cz = Math.floor(e.pos.z / 4);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = grid.get(gk(e.area, cx + i, cz + j)); if (c) for (const o of c) if (Math.abs(o.pos.x - e.pos.x) < 4 && Math.abs(o.pos.z - e.pos.z) < 4) near.push(o); }
        this.fx.mute = big(e); e.update(Math.min(0.1, edt), near);
      }
    }
    this.fx.mute = false;
    this.profAdd?.('monstros', performance.now() - _tE);
    if (this.target && (!this.target.alive() || Math.hypot(this.target.pos.x - P.pos.x, this.target.pos.z - P.pos.z) > 40)) this.target = null;
    updateProjectiles(this, dt);
    if (!client) this.spawners.update(dt);
    this.huntSigns?.update(dt, P, this.time.t);
    this.loot.update(dt);
    this.pvp?.update(dt);
    this.interact.update(dt);
    if (!client) this.events.update(dt);
    else this.events.updateRemote(dt);
    this.natal?.update(dt);
    this.tutorial.update(dt);
    this.cosmetics.update(dt);
    this.economy.update(dt);
    this.trade.update(dt);
    this.checkDiscovery(dt);
    // câmera, céu, mundo
    let focus = P.pos;
    const B = this.bossEngaged;
    if (B && !B.dead) {
      const d = Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z);
      const k = d < 26 ? 0.35 : 0;
      this._focus = this._focus || new THREE.Vector3();
      focus = this._focus.set(P.pos.x + (B.pos.x - P.pos.x) * k, P.pos.y, P.pos.z + (B.pos.z - P.pos.z) * k);
      this.cam.extraDist = 6;
    } else this.cam.extraDist = 0;
    // loja/conversa com NPC: câmera por cima do ombro do vendedor, olhando o rosto do herói
    const dn = this.ui.dialogNpc && this.interact.npcs[this.ui.dialogNpc];
    if (dn && P.area === 'world' && Math.hypot(dn.pos.x - P.pos.x, dn.pos.z - P.pos.z) < 6) {
      if (!this.cam.shot || this.cam.shot.v !== dn.pos) { this.cam.shot = { v: dn.pos, p: P.pos }; P.faceTo(Math.atan2(dn.pos.x - P.pos.x, dn.pos.z - P.pos.z)); P.faceLock = 999; }
      document.body.classList.add('dlgshot'); P.rig.silHide = true;
    } else if (this.cam.shot) { this.cam.shot = null; P.faceLock = 0; document.body.classList.remove('dlgshot'); P.rig.silHide = false; }
    // câmera fixa no personagem: volta sozinha para as costas do herói enquanto anda (não briga com o dedo)
    const I = this.input;
    if (I.touch.camDx || I.touch.camDy || I.drag.dx || I.drag.dy || I.held('camLeft') || I.held('camRight')) this._camHand = this.time.t;
    const am = this.aimMode();
    if (am && !this._amOn) this.cam.pitch = Math.min(this.cam.pitch, 0.32); // entrou na mira: abaixa a câmera
    this._amOn = am;
    this.cam.aimK = damp(this.cam.aimK || 0, am ? 1 : 0, 7, rdt);
    if (this.settings.camFollow && !am && !this.cam.shot && P.alive && this.time.t - (this._camHand || -9) > 0.8) {
      const mv = this.moveDir();
      if (mv.mag > 0.2 && P.anim.move > 0.2) this.cam.yaw = dampAngle(this.cam.yaw, P.yaw + Math.PI, 2.6 * Math.min(1, mv.mag), rdt);
    }
    this.cam.update(rdt, focus, this.world, this.ui.blocking() ? null : this.input, this.settings);
    this.drawCrosshair(am);
    setSeeThrough(this.camera.position, P.pos); // castelos dos Confins: buraco só onde a parede tapa o herói
    // vista: nos mapas novos, estar no alto (morro do acampamento, cristas) abre a neblina
    const vt = P.area === 'ermos' || P.area === 'confins' ? smoothstep(5, 10, P.pos.y) : 0;
    this.sky.vista = (this.sky.vista || 0) + (vt - (this.sky.vista || 0)) * Math.min(1, dt * 1.5);
    const r = this.sky.update(dt, st.world.timeOfDay, P.pos, this.camera);
    this.night = r.night;
    if (this.leve || this.isTouch || this.settings.viewDist !== 'longa') { // nada além da neblina é desenhado (menos desenho por quadro); "Longa" no PC enxerga tudo
      const far = Math.round(this.sky.fog.far + 20);
      if (Math.abs(this.camera.far - far) > 4) { this.camera.far = far; this.camera.updateProjectionMatrix(); this.sky.fitFar(far); }
    }
    this.world.update(dt, this.time.t, r.night, P.pos);
    if (this.ultra) UltraAtmos.update(this, dt);
    this.fx.update(dt, this.camera);
    this.updateLights(dt);
    this.updateFlames(dt);
    // áudio ambiente
    const A = this.audio.ambient;
    A.day = 1 - r.night; A.rain = r.rain; A.corrupt = r.corrupt;
    A.dungeon = P.area === 'cripta' ? 1 : 0;
    A.river = P.area === 'world' ? 1 - smoothstep(6, 28, distToPolyline(P.pos.x, P.pos.z, RIVER)) : 0;
    A.fire = P.area === 'ermos' ? 1 - smoothstep(3, 14, Math.hypot(P.pos.x - ERMOS.offset.x, P.pos.z - ERMOS.offset.z - ERMOS.entry.z + 3)) : P.area === 'world' ? Math.max(1 - smoothstep(3, 14, Math.hypot(P.pos.x - VILLAGE.forge.x, P.pos.z - VILLAGE.forge.z)), 1 - smoothstep(3, 16, Math.hypot(P.pos.x + 96, P.pos.z + 44))) : 0.4;
    this.audio.musicMode = this.bossEngaged ? 'boss' : P.area === 'cripta' ? 'dungeon' : 'explore';
    this.audio.update(rdt);
    this.net.update(rdt);
    this.social?.update(rdt);
    this.saver.update(rdt);
    this.ui.update(rdt);
  }
}

export { clamp };
