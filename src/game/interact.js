import * as THREE from 'three';
import { MSG_LOCKED } from '../core/guardiao.js';
import { NPCS } from '../config/quests.js';
import { NPC_SPAWNS, RUNES, DUNGEON, WORLD, CRYPT_MOUND, ERMOS, CONFINS, GUARDIAO } from '../config/world.js';
import { buildNpc } from '../engine/models.js';
import { HERO3D, makeHero } from '../engine/hero3d.js';
import { CLASSES } from '../config/classes.js';

// NPCs da vila com o MESMO modelo 3D dos personagens (roupas das skins; o Eco continua espírito)
const NPC_HERO = {
  mestre: { cls: 'mago', g: 'M', skin: 'mago_2', weapon: { wkind: 'cajado', rarity: 'raro' } },
  ferreira: { cls: 'guerreiro', g: 'F', skin: 'campones_2', weapon: { wkind: 'clava', rarity: 'comum' } },
  mercador: { cls: 'guerreiro', g: 'M', skin: 'nobre_3', weapon: null },
  fornecedora: { cls: 'mago', g: 'F', skin: 'mago_3', weapon: { wkind: 'orbe', rarity: 'incomum' } },
  banqueira: { cls: 'mago', g: 'F', skin: 'nobre', weapon: null },
  leiloeira: { cls: 'guerreiro', g: 'F', skin: 'patrulheiro_3', weapon: null },
  exploradora: { cls: 'arqueiro', g: 'F', skin: 'patrulheiro', weapon: { wkind: 'arco_longo', rarity: 'incomum' } },
};
const _cdir = new THREE.Vector3();
function npcRig(look) {
  const h = NPC_HERO[look];
  if (!h || !HERO3D.ok || !CLASSES[h.cls]) return buildNpc(look);
  const rig = makeHero(CLASSES[h.cls], { g: h.g, skin: h.skin });
  if (h.weapon) rig.setEquipment?.({ weapon: h.weapon });
  else { rig.setEquipment?.({ weapon: { wkind: 'adaga', rarity: 'comum' } }); if (rig.weapon) rig.weapon.visible = false; } // mãos livres
  rig.root.scale.multiplyScalar(0.92); // um pouco menores que os heróis
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return rig;
}
import { animate } from './anim.js';
import { dampAngle } from '../engine/noise.js';
export const PLATEAU_LEVEL = 8;
// tempo para um baú aberto se encher de novo
export const CHEST_REFILL_MIN = { bau_vigia: 10, default: 25 };
const chestRefillMs = (id) => (CHEST_REFILL_MIN[id] ?? CHEST_REFILL_MIN.default) * 60000;

// NPCs e objetos interativos (baús, runas, mural, altar, cofre, portas, barreira).
export class Interactions {
  constructor(G) {
    this.G = G;
    this.npcs = {};
    this.nearest = null;
  }

  init() {
    for (const id of Object.keys(NPCS)) {
      if (NPCS[id].hidden && !this.G.state.world.flags.ecoRevealed) continue;
      this.spawnNpc(id);
    }
    const W = this.G.world, st = this.G.state.world;
    // baús se enchem de novo com o tempo (o do Vigia mais rápido, sempre com uma nova Chave do Selo)
    st.chestT = st.chestT || {};
    for (const id of st.chests) { W.setChestOpened(id, true); if (!st.chestT[id]) st.chestT[id] = Date.now(); }
    if (st.flags.vigiaDead) W.chests.bau_vigia.group.visible = true;
    if (st.flags.runasOk) { for (const k of RUNES.order) W.runes[k].active = true; W.setVaultUnsealed(true); }
    if (st.flags.vaultOpen) { W.vault.open = true; W.setVaultUnsealed(true); W.vault.beam.material.opacity = 0; }
    else st.runes.seq = [];
    if (st.flags.gateOpen) W.openGate();
    if (st.flags.ecoRevealed) W.altarCrystal.material.color.set(0xffffff);
  }

  spawnNpc(id) {
    const sp = NPC_SPAWNS[id];
    const rig = npcRig(NPCS[id].look);
    const y = this.G.world.groundHeight(sp.x, sp.z, 'world');
    rig.root.position.set(sp.x, y, sp.z);
    rig.root.rotation.y = sp.rot;
    this.G.scene.add(rig.root);
    this.G.world.col.addCircle(sp.x, sp.z, 0.55, { los: false });
    const npc = { id, def: NPCS[id], rig, pos: new THREE.Vector3(sp.x, y, sp.z), yaw: sp.rot, baseYaw: sp.rot, anim: { move: 0, t: Math.random() * 5, action: null, p: 0, emote: null } };
    this.npcs[id] = npc;
    return npc;
  }

  // os modelos 3D carregaram depois: troca os bonecos antigos dos NPCs
  rebuildNpcRigs() {
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.rig.kind === 'skinhero' || !NPC_HERO[n.def.look]) continue;
      const rig = npcRig(n.def.look); if (rig.kind !== 'skinhero') continue;
      rig.root.position.copy(n.rig.root.position); rig.root.rotation.y = n.yaw;
      this.G.scene.remove(n.rig.root); this.G.scene.add(rig.root); n.rig = rig;
    }
  }

  candidates() {
    const out = [];
    for (const it of this.G.world.interactables) out.push(it);
    for (const id in this.npcs) { const n = this.npcs[id]; out.push({ id, kind: 'npc', x: n.pos.x, z: n.pos.z, r: 3, area: 'world', name: n.def.name }); }
    return out;
  }

  label(it) {
    const G = this.G, st = G.state.world;
    switch (it.kind) {
      case 'npc': return `Falar com ${it.name}`;
      case 'chest': return G.world.chests[it.id]?.opened ? null : 'Abrir baú';
      case 'rune': return st.flags.runasOk ? null : `Tocar a ${it.name}`;
      case 'mural': return 'Examinar o Mural das Runas';
      case 'altar': return 'Examinar o Altar dos Selos';
      case 'wanted': return 'Ver o Mural de Procurados (PvP)';
      case 'vault': return st.flags.vaultOpen ? null : 'Abrir o Cofre do Bosque Oculto';
      case 'door': return `Entrar na ${it.name}`;
      case 'exit': return 'Sair da Cripta';
      case 'portal': return G.guardiaoOk() ? 'Atravessar para os Ermos da Fenda (mapa 3)' : `Portal da Fenda (${MSG_LOCKED})`;
      case 'portalBack': return 'Voltar à Planície do Guardião (mapa 2)';
      case 'portalGuardiao': return 'Atravessar para a Planície do Guardião (mapa 2)';
      case 'portalVale': return 'Voltar ao Vale de Eldoria (mapa 1)';
      case 'portalConfins': return `Atravessar para os Confins (recomendado nível ${CONFINS.reqLevel})`;
      case 'portalErmos': return 'Voltar aos Ermos da Fenda';
      case 'gate': return st.flags.gateOpen ? null : 'Tocar a Barreira do Selo';
      case 'teleport': return 'Usar a Pedra de Teleporte (mundos e regiões)';
      default: return it.name;
    }
  }

  // reabastecimento dos baús (tempo real, continua contando com o jogo fechado)
  refillChests() {
    const G = this.G, W = G.world, st = G.state.world, now = Date.now();
    if (!st.chestT) return;
    for (const id of [...st.chests]) {
      const t = st.chestT[id];
      if (!t || now - t < chestRefillMs(id)) continue;
      st.chests = st.chests.filter((x) => x !== id);
      delete st.chestT[id];
      W.setChestClosed(id);
      const c = W.chests[id];
      if (c && G.player.area === (c.area || 'world') && Math.hypot(G.player.pos.x - c.x, G.player.pos.z - c.z) < 40) G.ui.toastSmall(id === 'bau_vigia' ? 'O baú do Vigia se encheu de novo — com uma nova Chave do Selo.' : 'Um baú próximo se encheu de novo.', 4);
    }
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.refillT = (this.refillT || 0) - dt;
    if (this.refillT <= 0) { this.refillT = 5; this.refillChests(); }
    for (const id in this.npcs) {
      const n = this.npcs[id];
      const d = Math.hypot(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
      const want = d < 7 && P.area === 'world' ? Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z) : n.baseYaw;
      n.yaw = dampAngle(n.yaw, want, 4, dt);
      n.rig.root.rotation.y = n.yaw;
      n.anim.t += dt;
      n.anim.emote = id === 'ferreira' && d > 7 ? null : null;
      if (id === 'ferreira' && d > 6) { n.anim.action = 'slash'; n.anim.p = (n.anim.t * 0.8) % 1; n.anim.variant = 0; }
      else n.anim.action = null;
      // fora da tela (atrás da câmera) não desenha: as partes do modelo não se cortam sozinhas
      const cm = G.camera, cx = n.pos.x - cm.position.x, cz = n.pos.z - cm.position.z, cl = Math.hypot(cx, cz) || 1;
      cm.getWorldDirection(_cdir);
      const inView = cl < 4 || (cx * _cdir.x + cz * _cdir.z) / (cl * (Math.hypot(_cdir.x, _cdir.z) || 1)) > -0.05 - 2.2 / cl;
      n.rig.root.visible = P.area === 'world' && inView && d < (G.isTouch ? 60 : 110) * Math.min(1, G.viewMul || 1);
      if (n.rig.root.visible && d < 45) animate(n.rig, n.anim, dt); // longe: não anima (economiza no celular)
    }
    // interação mais próxima
    let best = null, bd = Infinity;
    if (P.alive) {
      for (const it of this.candidates()) {
        if ((it.area || 'world') !== P.area) continue;
        if (it.kind === 'chest' && !G.world.chests[it.id]?.group.visible) continue;
        const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z);
        if (d < it.r && d < bd && this.label(it)) { best = it; bd = d; }
      }
    }
    this.nearest = best;
    G.ui.setPrompt(best ? this.label(best) : null);
  }

  activate() {
    const it = this.nearest;
    if (!it) return false;
    const G = this.G, st = G.state.world, W = G.world;
    G.audio.play('ui');
    switch (it.kind) {
      case 'npc':
        G.ui.openDialog(it.id);
        break;
      case 'chest': {
        const c = W.chests[it.id];
        if (c.opened) break;
        W.setChestOpened(it.id);
        if (!st.chests.includes(it.id)) st.chests.push(it.id);
        st.chestT = st.chestT || {}; st.chestT[it.id] = Date.now();
        G.state.player.stats.chests++;
        G.audio.play('chest');
        G.fx.burst({ x: c.x, y: c.y + 0.8, z: c.z }, { count: 30, color: [0xffd36b, 0xffffff], speed: 4, size: 0.35, life: 0.8, up: 4 });
        G.later(0.35, () => G.loot.giveRewards(c.loot, { x: c.x, y: c.y, z: c.z }, 'Baú'));
        G.giveRewardXp(25, 'Exploração');
        G.saver.requestSave('chest');
        break;
      }
      case 'rune': this.touchRune(it.rune); break;
      case 'mural':
        G.ui.showMessage('Mural das Runas', 'Três símbolos gravados, ligados por setas: <b class="glyph">☾</b> → <b class="glyph">✦</b> → <b class="glyph">☀</b><br><br><i>“Desperte-as como a noite desperta: primeiro a Lua, depois a Estrela e, por fim, o Sol.”</i><br><br><b>A charada:</b> toque nas 3 Pedras-Runa do Vale nesta ordem — <b>1º Lua</b> (Floresta Sussurrante), <b>2º Estrela</b> (Círculo de Pedras), <b>3º Sol</b> (Colina do Velho Carvalho). Se errar, elas apagam e você recomeça. Acertando, o cofre escondido na ilha do lago se abre.');
        st.flags.muralSeen = true;
        G.questEvent({ type: 'interact', id: 'mural' });
        break;
      case 'wanted': G.pvp?.openBoard(); break;
      case 'altar':
        G.questEvent({ type: 'interact', id: 'altar' });
        if (!st.flags.ecoRevealed) {
          st.flags.ecoRevealed = true;
          const n = this.spawnNpc('eco');
          G.fx.burst({ x: n.pos.x, y: n.pos.y + 1, z: n.pos.z }, { count: 50, color: [0x8fe8ff, 0xffffff], speed: 5, size: 0.4, life: 1.2, up: 3 });
          G.fx.beam(n.pos.x, n.pos.y, n.pos.z, 0x8fe8ff, 14, 1.6, 1.6);
          W.altarCrystal.material.color.set(0xffffff);
          G.audio.play('discover');
          G.ui.banner('Um espírito desperta', 'O Eco do Primeiro Guardião se manifesta no altar.');
          G.saver.requestSave('altar');
        } else G.ui.toastSmall('O cristal pulsa em silêncio.');
        break;
      case 'vault':
        if (!st.flags.runasOk) { G.ui.showMessage('Cofre do Bosque Oculto', 'Uma cúpula de luz protege o cofre. Três símbolos ao redor da base parecem alimentá-la: <b class="glyph">☀</b> <b class="glyph">☾</b> <b class="glyph">✦</b>.'); break; }
        if (st.flags.vaultOpen) break;
        st.flags.vaultOpen = true;
        W.vault.open = true; W.vault.beam.material.opacity = 0;
        G.audio.play('chest'); G.audio.play('discover');
        G.fx.burst({ x: it.x, y: W.groundHeight(it.x, it.z) + 1, z: it.z }, { count: 60, color: [0xffd36b, 0xffffff, 0x5ef0ff], speed: 6, size: 0.4, life: 1.2, up: 5 });
        G.loot.giveRewards(RUNES.vault.loot, { x: it.x, y: 1, z: it.z }, 'Cofre do Bosque Oculto');
        G.questEvent({ type: 'interact', id: 'cofre' });
        G.giveRewardXp(80, 'Segredo');
        G.saver.requestSave('vault');
        break;
      case 'door':
        if (G.state.player.level < DUNGEON.reqLevel) { G.ui.showMessage('Cripta do Vigia', `Uma força antiga empurra você para trás.<br><b>Requer nível ${DUNGEON.reqLevel}.</b>`); G.audio.play('error'); break; }
        G.enterDungeon();
        break;
      case 'exit':
        G.exitDungeon();
        break;
      case 'portal':
        // sem trava de nível (só avisa que é perigoso), mas só passa quem derrotou o Guardião ou lutou contra ele
        if (!G.guardiaoOk()) { G.ui.showMessage('Portal da Fenda', `O portal não se abre para você.<br><b>${MSG_LOCKED}.</b>`); G.audio.play('error'); break; }
        G.enterErmos();
        if (G.state.player.level < ERMOS.reqLevel) G.later(2, () => G.ui.toastSmall(`Cuidado: os Ermos são recomendados a partir do nível ${ERMOS.reqLevel}.`, 5));
        break;
      case 'portalBack':
        G.exitErmos();
        break;
      case 'portalGuardiao':
        G.enterGuardiao();
        break;
      case 'portalVale':
        G.exitGuardiao();
        break;
      case 'teleport':
        G.teleports.open();
        break;
      case 'portalConfins':
        G.enterConfins();
        if (G.state.player.level < CONFINS.reqLevel) G.later(2, () => G.ui.toastSmall(`Cuidado: os Confins são recomendados a partir do nível ${CONFINS.reqLevel}.`, 5));
        break;
      case 'portalErmos':
        G.travel('ermos', ERMOS.portal.x + ERMOS.offset.x, ERMOS.portal.z + ERMOS.offset.z + 6, 'Ermos da Fenda', 'Terras selvagens · Nível 25–60');
        break;
      case 'gate':
        if (G.quests.status('q4_cripta', G.questCtx()) === 'done' || G.inv.count('chave_selo') > 0) {
          st.flags.gateOpen = true;
          W.openGate(true);
          G.audio.play('portal');
          // a Fechadura Mágica gira, incha e EXPLODE EM PURPURINA; as portas afundam e os golens se curvam
          const gy = W.groundHeight(35, -129.5) + 2.7, glitter = [0xffd36b, 0xff7ae0, 0x8fe8ff, 0xffffff, 0xc79bff, 0x9affb0];
          G.fx.burst({ x: 35, y: gy, z: -129 }, { count: 30, color: [0xd36bff, 0xffffff], speed: 2, size: 0.3, life: 0.7, gravity: 0, up: 0.5 });
          G.later(0.85, () => {
            G.fx.burst({ x: 35, y: gy, z: -129 }, { count: 220, color: glitter, speed: 11, size: 0.2, life: 2.2, gravity: 2.2, up: 5, drag: 1.2 });
            G.fx.burst({ x: 35, y: gy, z: -129 }, { count: 90, color: glitter, speed: 5, size: 0.32, life: 1.6, gravity: -0.6, up: 2 });
            G.fx.shock?.(35, gy - 2.6, -129, 9, 0xff9ae8, 0.6); G.fx.beam?.(35, gy - 2.7, -129, 0xffd0f4, 12, 1.2, 1.6);
            G.audio.play('magic'); G.cam?.shake?.(0.2, 0.3);
          });
          for (let k = 0; k < 6; k++) G.later(1.1 + k * 0.25, () => G.fx.burst({ x: 35 + (Math.random() - 0.5) * 8, y: gy + 3 + Math.random() * 2, z: -129 + (Math.random() - 0.5) * 4 }, { count: 40, color: glitter, speed: 2, size: 0.16, life: 2.4, gravity: 1.2, up: 0.5 }));
          G.later(1, () => { G.audio.play('quake', { vol: 0.5 }); });
          G.ui.banner('O Portão dos Golens se abre', 'A fechadura mágica explodiu em purpurina! O Planalto da Fenda está aberto. Recomendado: nível 18.');
          G.saver.requestSave('gate');
        } else {
          G.ui.showMessage('Portão dos Golens', 'A Fechadura Mágica brilha, mas não cede. Os golens não se mexem. <br><b>É preciso a Chave do Selo</b> — guardada pelo Vigia na Cripta, a leste das ruínas.');
          G.audio.play('error');
        }
        break;
      default: break;
    }
    return true;
  }

  touchRune(id) {
    const G = this.G, st = G.state.world, W = G.world;
    const stone = RUNES.stones[id];
    if (st.flags.runasOk) return;
    const seq = st.runes.seq;
    const expected = RUNES.order[seq.length];
    G.ui.toastSmall(stone.hint, 4);
    if (seq.includes(id)) return;
    if (id === expected) {
      seq.push(id);
      W.runes[id].active = true;
      G.audio.play('rune', { pitch: 330 + seq.length * 110 });
      G.fx.beam(stone.x, W.groundHeight(stone.x, stone.z), stone.z, W.runes[id].color.getHex(), 12, 1.4, 1.2);
      if (seq.length === RUNES.order.length) {
        st.flags.runasOk = true;
        W.setVaultUnsealed(true);
        G.ui.banner('As runas despertam', 'Um feixe de luz se ergue sobre o Lago Espelhado…', '#ffd36b');
        G.audio.play('discover');
        G.questEvent({ type: 'flag' });
        G.saver.requestSave('runes');
      }
    } else {
      for (const k of RUNES.order) W.runes[k].active = false;
      st.runes.seq = [];
      G.audio.play('error');
      G.ui.toastSmall('As runas se apagam… a ordem parece importar.', 4);
    }
  }

  cryptDoor() { return { x: CRYPT_MOUND.door.x, z: CRYPT_MOUND.door.z + 2.5 }; }
  confinsStart() { return { x: CONFINS.entry.x + CONFINS.offset.x, z: CONFINS.entry.z + CONFINS.offset.z + 6 }; }
  ermosStart() { return { x: ERMOS.entry.x + ERMOS.offset.x, z: ERMOS.entry.z + ERMOS.offset.z + 6 }; }
  guardiaoStart() { return { x: GUARDIAO.entry.x, z: GUARDIAO.entry.z }; }
  dungeonStart() { return { x: DUNGEON.start.x + WORLD.dungeonOffset.x, z: DUNGEON.start.z + WORLD.dungeonOffset.z }; }
}
