import * as THREE from 'three';
import { rollLoot, makeStack, createNamed, rollEquipment, rarityOf, displayName, trophyChance, sanitizeEntry, stackDef } from '../core/items.js';
import { rng } from '../core/rng.js';
import { rollBossWinners } from '../core/bossloot.js';
import { BALANCE, RARITY_INDEX } from '../config/balance.js';
import { MATERIALS, CONSUMABLES, LOOT_TABLES, TROPHY_OF } from '../config/items.js';
import { QUESTS } from '../config/quests.js';
import { MODEL_GEO } from '../engine/models.js';
import { pixelIcon } from '../ui/pixelicons.js';


// Itens no chão, coleta automática, feixes de raridade e entrega de recompensas.
export class LootSystem {
  constructor(G) {
    this.G = G;
    this.drops = [];
    this.fullWarnT = 0;
  }

  ownedUniques() { return new Set(this.G.state.world.uniques); }

  questNeeds() {
    const s = new Set();
    for (const id of this.G.quests.activeIds()) {
      for (const st of QUESTS[id].stages) for (const o of st.objectives) if (o.type === 'collect') s.add(o.item);
    }
    return s;
  }

  static rollBossWinners(e, selfId = 'self') { return rollBossWinners(e, selfId); }

  // quais itens do saque do chefe são meus
  bossSlots(e) {
    const T = LOOT_TABLES[e.def.loot];
    if (!T?.bossLoot || !T.item) return null;
    const me = this.G.net?.selfPeer || 'self';
    let lw = e.lootWinners;
    if (!lw) lw = e.lootWinners = LootSystem.rollBossWinners(e, me); // sem dados do anfitrião: sorteia aqui
    const slots = [];
    lw.w.forEach((k, i) => { if (k === me || (k === 'self' && !e.replica)) slots.push(i); });
    const many = Object.keys(lw.pct || {}).length > 1;
    const myPct = lw.pct?.[me] ?? lw.pct?.self ?? 100;
    if (many && !slots.length) this.G.ui.toastSmall(`Saque de ${e.def.name}: ${lw.w.length} ${lw.w.length > 1 ? 'itens' : 'item'} sorteado(s) pelo dano. Não foi dessa vez (seu dano: ${myPct}%).`, 6);
    return slots;
  }

  // ---------- saque COMPARTILHADO (online): o anfitrião sorteia UMA vez e todos veem os mesmos itens ----------
  // itens normais caem no chão para todos (quem chegar primeiro leva); itens de chefe vão direto para a bolsa
  // de quem ganhou (sorteio pelo dano) e só ele vê no chat. Monstros de raid não soltam nada; só o chefe da raid.
  sharedOnline() { const n = this.G.net; return !!(n?.room && n.peers?.size > 0); }
  lootTable(e, shared = false) {
    if (e.noLoot) return null;
    if (shared && e.type === 'vigia') return null; // o Vigia: saque individual só na primeira vitória
    if (e.raid) return e.def.eventBoss || e.def.miniboss ? 'raid_chefe' : null;
    return e.def.loot;
  }
  // nível máximo dos itens: o de quem mais lutou (nunca muito acima de quem vai usar)
  topLevel(e) {
    const G = this.G, n = G.net;
    let best = 0, lvl = G.state.player.level;
    for (const [k, d] of e.dmgBy || []) {
      if (d <= best) continue;
      const L = k === 'self' || k === n?.selfPeer ? G.state.player.level : +(n?.peers?.get(String(k))?.pr?.l) || 0;
      if (L) { best = d; lvl = L; }
    }
    return lvl;
  }
  dropShared(e) {
    const G = this.G, table = this.lootTable(e, true);
    if (!table) return;
    const T = LOOT_TABLES[table];
    const tr = TROPHY_OF[e.type];
    const trophy = tr ? { id: tr, ...trophyChance(e.def) } : null;
    const lw = T?.bossLoot ? (e.lootWinners || (e.lootWinners = LootSystem.rollBossWinners(e, G.net?.selfPeer || 'self'))) : null;
    const slots = lw ? lw.w.map((_, i) => i) : null;
    const res = rollLoot(table, e.level, { cls: G.player.cls.id, playerLevel: this.topLevel(e), owned: new Set(), questNeeds: new Set(), goldRange: e.def.gold, trophy, slots, src: e.type }, rng);
    const me = G.net?.selfPeer || 'self';
    if (lw) {
      // cada item do chefe vai para quem ganhou o sorteio daquele item (o extra lendário vai para quem mais bateu)
      res.items.forEach((it, i) => {
        const w = lw.w[i] ?? lw.w[0];
        if (w === me || w === 'self') this.giveBossItem(it, e.def.name, e);
        else this.gsend({ type: 'g_boss', to: w, e: JSON.stringify(it), b: String(e.def.name).slice(0, 40) });
      });
      res.items = [];
    }
    if (res.gold) this.shareDrop({ kind: 'gold', qty: res.gold }, e);
    for (const s of res.stacks) this.shareDrop(makeStack(s.id, s.qty, rng), e);
    for (const it of res.items) this.shareDrop(it, e);
  }
  shareDrop(entry, e) {
    const G = this.G, r = e.def.boss || e.def.miniboss ? 2 + Math.random() * 2.5 : 0.6 + Math.random() * 1.4, a = Math.random() * Math.PI * 2;
    let x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (!G.world.walkable(x, z, e.area)) { x = e.pos.x; z = e.pos.z; }
    const d = this.spawnDrop(entry, x, z, e.area, e.pos);
    d.gid = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    this.gsend({ type: 'g_drop', gid: d.gid, e: JSON.stringify(entry), x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100, ar: e.area });
  }
  giveBossItem(it, bossName, e) {
    const G = this.G, nm = displayName(it), col = rarityOf(it);
    G.lastLootSource = bossName;
    if (G.inv.add(it) === 0) { this.onObtained(it, 1, bossName); this.noteTeam(it, 1, bossName); }
    else { const P = G.player; this.spawnDrop(it, P.pos.x, P.pos.z, P.area, P.pos); G.ui.toastSmall('Bolsa cheia: o item do chefe caiu no chão.', 4); }
    G.ui.chatMessage({ name: G.state.player.name, text: `dropou: ${nm} (${col.name}) de ${bossName}`, system: true, kind: 'boss' });
    G.ui.toastSmall(`Você dropou: ${nm} (${col.name})`, 6);
    void e;
  }

  dropFromEnemy(e) {
    const G = this.G;
    if (!this.lootTable(e)) return;
    if (e.raid) e = Object.assign(Object.create(Object.getPrototypeOf(e)), e, { def: { ...e.def, loot: this.lootTable(e) } });
    const firstKill = e.def.boss && !G.state.world.flags.bossKilled;
    const tr = TROPHY_OF[e.type];
    const trophy = tr ? { id: tr, ...trophyChance(e.def) } : null;
    const slots = this.bossSlots(e);
    const res = rollLoot(e.def.loot, e.level, { cls: G.player.cls.id, playerLevel: G.state.player.level, owned: this.ownedUniques(), questNeeds: this.questNeeds(), firstKill, goldRange: e.def.gold, trophy, slots, src: e.type }, rng);
    // cada item lembra o monstro que o deixou cair (cores e detalhes do monstro)
    // ouro cai no chão como os itens (moedinhas que o herói recolhe ao passar)
    if (res.gold) this.spawnDrop({ kind: 'gold', qty: res.gold }, e.pos.x + (Math.random() - 0.5) * 1.4, e.pos.z + (Math.random() - 0.5) * 1.4, e.area, e.pos);
    // chefe: os itens vão direto para a bolsa de quem ganhou; só quem ganhou vê o aviso (os outros não veem o que você pegou)
    if (slots) {
      const me = G.state.player.name;
      for (const it of res.items) {
        const nm = displayName(it), col = rarityOf(it);
        if (G.inv.add(it) === 0) { this.onObtained(it, 1, e.def.name); this.noteTeam(it, 1, e.def.name); }
        else { this.spawnDrop(it, e.pos.x, e.pos.z, e.area, e.pos).srcName = e.def.name; G.ui.toastSmall('Bolsa cheia: o item caiu no chão.', 4); }
        G.ui.chatMessage({ name: me, text: `dropou: ${nm} (${col.name}) de ${e.def.name}`, system: true });
        G.ui.toastSmall(`Você dropou: ${nm} (${col.name})`, 6);
      }
      res.items = [];
    }
    const all = [...res.stacks.map((s) => makeStack(s.id, s.qty, rng)), ...res.items];
    all.forEach((entry, i) => {
      const a = (i / Math.max(1, all.length)) * Math.PI * 2 + Math.random();
      const r = e.def.boss ? 2.5 + Math.random() * 2 : 0.6 + Math.random() * 1.2;
      this.spawnDrop(entry, e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, e.area, e.pos);
    });
  }

  addGold(n, pos) {
    const G = this.G;
    G.state.player.gold += n;
    if (pos) G.ui.damageNumber(pos.x, (pos.y || 0) + 1.6, pos.z, `+${n} ouro`, 'gold');
    G.audio.play('coin');
    G.ui.refreshHud();
  }

  // Ícone do item no chão, igual ao do inventário: quadro com a cor da raridade + ícone em pixel art
  iconTexture(entry) {
    if (entry.kind === 'gold') return this.goldTexture();
    const url = pixelIcon(entry);
    if (!url) return null;
    const rar = entry.kind === 'equip' ? (entry.rarity || 'comum') : 'comum';
    const key = url.length + '|' + url.slice(-40) + '|' + rar;
    this.texCache = this.texCache || new Map();
    if (this.texCache.has(key)) return this.texCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const col = entry.kind === 'equip' && rar !== 'comum' ? rarityOf(entry).color : null;
    // só o item, sem quadro de fundo (a raridade aparece no anel do chão e no brilho)
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const img = new Image();
    img.onload = () => { x.imageSmoothingEnabled = false; x.drawImage(img, 2, 2, 60, 60); tex.needsUpdate = true; };
    img.src = url;
    this.texCache.set(key, tex);
    return tex;
  }

  goldTexture() {
    if (this._goldTex) return this._goldTex;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const P = ['....kkkkk.......', '...kyyyyyk......', '..kyywwyyyk.....', '..kyyyyyyyk.kkk.', '..kyyyyyyyk kyyk', '...kyyyyyk.kywyk', '....kkkkk..kyyyk', '...........kyyk.', '....kkkkk...kk..', '...kyyyyyk......', '..kyywwyyyk.....', '..kyyyyyyyk.....', '..koyyyyyok.....', '...koooook......', '....kkkkk.......', '................'];
    const col = { k: '#5a3a08', y: '#ffd36b', w: '#fff6c8', o: '#d89a28' };
    P.forEach((row, j) => [...row].forEach((ch, i) => { if (col[ch]) { x.fillStyle = col[ch]; x.fillRect(i * 2, j * 2, 2, 2); } }));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return (this._goldTex = t);
  }

  dropMesh(entry) {
    const tex = this.iconTexture(entry);
    if (tex) {
      const g = new THREE.Group();
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const sc = entry.kind === 'gold' ? 0.6 : 0.95;
      sp.scale.set(sc, sc, 1); sp.renderOrder = 3;
      g.add(sp);
      const color = entry.kind === 'equip' ? new THREE.Color(rarityOf(entry).color).getHex() : entry.kind === 'gold' ? 0xffd36b : 0xffffff;
      const ring = new THREE.Mesh(MODEL_GEO.torus, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2; ring.scale.setScalar(1.1); ring.position.y = -0.45;
      void ring;
      g.userData.sprite = true;
      return g;
    }
    const g = new THREE.Group();
    let color = 0xffffff, geo = MODEL_GEO.box, s = [0.4, 0.4, 0.4];
    if (entry.kind === 'equip') {
      color = new THREE.Color(rarityOf(entry).color).getHex();
      const jew = entry.slot === 'ring' || entry.slot === 'neck';
      geo = entry.slot === 'weapon' ? MODEL_GEO.box : jew ? MODEL_GEO.torus : MODEL_GEO.dodeca;
      s = entry.slot === 'weapon' ? [0.12, 0.12, 0.85] : jew ? [0.45, 0.45, 0.45] : [0.55, 0.45, 0.5];
    } else if (entry.kind === 'consumable') { color = new THREE.Color(CONSUMABLES[entry.id].color).getHex(); geo = MODEL_GEO.sphere; s = [0.34, 0.42, 0.34]; }
    else if (entry.kind === 'material') { color = new THREE.Color(MATERIALS[entry.id].color).getHex(); geo = MODEL_GEO.octa; s = [0.32, 0.42, 0.32]; }
    else { color = 0x5ef0ff; geo = MODEL_GEO.octa; s = [0.4, 0.5, 0.4]; }
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.35), flatShading: true }));
    m.scale.set(...s);
    m.castShadow = true;
    g.add(m);
    const ring = new THREE.Mesh(MODEL_GEO.torus, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
    ring.rotation.x = Math.PI / 2; ring.scale.setScalar(1.1); ring.position.y = -0.45;
    void ring;
    return g;
  }

  spawnDrop(entry, x, z, area, from) {
    const G = this.G;
    const y = G.world.groundHeight(x, z, area);
    const mesh = this.dropMesh(entry);
    G.scene.add(mesh);
    const ri = entry.kind === 'equip' ? RARITY_INDEX[entry.rarity] : 0;
    const beam = ri >= 3 ? G.fx.lootBeam(x, y, z, new THREE.Color(rarityOf(entry).color).getHex()) : null;
    if (beam) beam.visible = area === G.player.area;
    const d = { entry, x, z, y, area, mesh, beam, t: 0, sx: from ? from.x : x, sz: from ? from.z : z, sy: from ? from.y + 1 : y, fly: from ? 0 : 1, magnet: false };
    mesh.position.set(d.sx, d.sy, d.sz);
    this.drops.push(d);
    if (ri >= 3) { G.audio.play('loot', { rarity: ri, gap: 0 }); G.fx.beam(x, y, z, new THREE.Color(rarityOf(entry).color).getHex(), 16, 1.4, 1.6); }
    return d;
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.fullWarnT = Math.max(0, this.fullWarnT - dt);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const vis = d.area === P.area;
      d.mesh.visible = vis;
      if (d.beam) { d.beam.visible = vis; d.beam.material.opacity = 0.22 + Math.sin(d.t * 3) * 0.08; }
      if (d.fly < 1) {
        d.fly = Math.min(1, d.fly + dt * 2.2);
        const k = d.fly;
        d.mesh.position.set(d.sx + (d.x - d.sx) * k, d.sy + (d.y + 0.6 - d.sy) * k + Math.sin(k * Math.PI) * 1.6, d.sz + (d.z - d.sz) * k);
        continue;
      }
      if (!P.alive || !vis) { this.bob(d); continue; }
      const dist = Math.hypot(P.pos.x - d.mesh.position.x, P.pos.z - d.mesh.position.z);
      // item que você largou: só volta para a bolsa depois que você se afastar e voltar
      if (d.hold) { if (dist > BALANCE.magnetRadius + 1.5) d.hold = false; else { this.bob(d); if (d.t > 300) { this.expire(d); this.drops.splice(i, 1); } continue; } }
      // item que outro jogador largou: pede para o dono (quem pedir primeiro leva)
      if (d.remote && dist < BALANCE.magnetRadius) {
        if (G.inv.capacityFor(d.entry) <= 0) { this.bob(d); continue; }
        if (!d.claimT || G.time.real - d.claimT > 3) { d.claimT = G.time.real; this.gsend({ type: 'g_claim', to: d.owner, gid: d.gid }); }
        this.bob(d); continue;
      }
      if (dist < BALANCE.magnetRadius || d.magnet) {
        const cap = d.entry.kind === 'gold' ? 1 : G.inv.capacityFor(d.entry);
        if (cap <= 0 && d.entry.kind === 'equip') {
          if (this.fullWarnT <= 0 && dist < BALANCE.pickupRadius + 0.5) { G.ui.toastSmall(G.inv.over() ? 'Bolsa acima do limite do seu nível: venda ou guarde itens para pegar novos.' : 'Inventário cheio!', 4); this.fullWarnT = 4; G.audio.play('error'); }
          this.bob(d); continue;
        }
        if (cap <= 0) { this.bob(d); continue; }
        d.magnet = true;
        const k = Math.min(1, dt * 9);
        d.mesh.position.x += (P.pos.x - d.mesh.position.x) * k;
        d.mesh.position.z += (P.pos.z - d.mesh.position.z) * k;
        d.mesh.position.y += (P.pos.y + 1 - d.mesh.position.y) * k;
        if (dist < BALANCE.pickupRadius * 0.6) { if (this.pickup(d)) { if (d.gid) this.gsend({ type: 'g_gone', gid: d.gid }); this.removeDrop(d); this.drops.splice(i, 1); } }
      } else this.bob(d);
      if (d.t > 300) { this.expire(d); this.drops.splice(i, 1); }
    }
  }

  bob(d) {
    d.mesh.position.set(d.x, d.y + 0.65 + Math.sin(d.t * 2.5) * 0.12, d.z);
    d.mesh.rotation.y = d.t * 1.5;
    if (!d.landed) {
      // ao cair no chão: poeira e, se for item raro ou melhor, brilho na cor da raridade
      d.landed = true;
      const G = this.G;
      if (d.area === G.player.area) {
        const ri = d.entry.kind === 'equip' ? RARITY_INDEX[d.entry.rarity] : 0, col = d.entry.kind === 'gold' ? 0xffd36b : new THREE.Color(rarityOf(d.entry).color).getHex();
        G.fx.burst({ x: d.x, y: d.y + 0.1, z: d.z }, { count: 6, color: [0xb8a888, 0x8a7a5a], speed: 2, size: 0.18, life: 0.35, gravity: 6, up: 1.2 });
        if (ri >= 2) G.fx.ring(d.x, d.y + 0.05, d.z, 0.9 + ri * 0.2, col, 0.5);
      }
    }
  }

  // ---------- itens largados no chão (compartilhados com quem está online) ----------
  gsend(o) { this.G.net?.room?.emit('fx', { ...o, n: this.G.state.player.name }).catch(() => {}); }
  expire(d) { if (d.gid && !d.remote) this.gsend({ type: 'g_gone', gid: d.gid }); this.removeDrop(d); }
  dropFromBag(entry) {
    const G = this.G, P = G.player;
    if (!entry) return;
    const x = P.pos.x + Math.sin(P.yaw) * 1.3, z = P.pos.z + Math.cos(P.yaw) * 1.3;
    const ok = G.world.walkable(x, z, P.area);
    const d = this.spawnDrop(entry, ok ? x : P.pos.x, ok ? z : P.pos.z, P.area, P.pos);
    d.hold = true; d.fromBag = true; d.gid = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    this.gsend({ type: 'g_drop', gid: d.gid, e: JSON.stringify(entry), x: Math.round(d.x * 100) / 100, z: Math.round(d.z * 100) / 100, ar: P.area });
    G.saver?.requestSave('largou');
  }
  findG(gid) { return this.drops.findIndex((d) => d.gid === gid); }
  onFx(m, d) {
    const G = this.G, me = G.net?.selfPeer;
    if (d.to && d.to !== me) return;
    const gid = String(d.gid || '').slice(0, 40);
    if (d.type === 'g_drop') {
      if (!gid || this.findG(gid) >= 0 || !['world', 'cripta', 'guardiao', 'ermos', 'confins'].includes(d.ar)) return;
      const entry = sanitizeEntry(d.e, rng);
      if (!entry || this.drops.filter((x) => x.remote).length > 80) return;
      const x = +d.x, z = +d.z; if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const dd = this.spawnDrop(entry, x, z, d.ar);
      dd.gid = gid; dd.remote = true; dd.owner = m.peer; dd.fromBag = gid[0] === 'g';
    } else if (d.type === 'g_boss') {
      // o anfitrião sorteou: este item do chefe é seu
      const entry = sanitizeEntry(d.e, rng);
      if (entry) this.giveBossItem(entry, String(d.b || 'Chefe').slice(0, 40), null);
    } else if (d.type === 'g_claim') {
      // sou o dono: o primeiro que pedir leva; os outros veem o item sumir
      const i = this.findG(gid); if (i < 0) return;
      const dd = this.drops[i]; if (dd.remote) return;
      this.removeDrop(dd); this.drops.splice(i, 1);
      this.gsend({ type: 'g_grant', to: m.peer, gid, e: JSON.stringify(dd.entry) });
      this.gsend({ type: 'g_gone', gid });
      // só avisa quando o item foi LARGADO da sua bolsa (gid "g…"); saque de monstro (gid "m…") é de quem pegar primeiro
      if (gid[0] === 'g') G.ui.toastSmall(`${String(d.n || 'Alguém').slice(0, 16)} pegou o item que você largou.`, 4);
    } else if (d.type === 'g_grant') {
      const i = this.findG(gid); if (i < 0) return;
      const dd = this.drops[i];
      if (m.peer !== dd.owner) return;
      if (this.pickup(dd)) { this.removeDrop(dd); this.drops.splice(i, 1); }
      else { dd.remote = false; dd.gid = null; } // bolsa encheu no meio do caminho: o item fica no chão para você
    } else if (d.type === 'g_gone') {
      const i = this.findG(gid); if (i < 0) return;
      if (this.drops[i].remote && this.drops[i].owner === m.peer) { this.removeDrop(this.drops[i]); this.drops.splice(i, 1); }
    }
  }
  // quem largou saiu do jogo: os itens dele somem para os outros
  onPeerLeft(id) {
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i].remote && this.drops[i].owner === id) { this.removeDrop(this.drops[i]); this.drops.splice(i, 1); }
  }

  removeDrop(d) {
    this.G.scene.remove(d.mesh);
    if (d.beam) this.G.scene.remove(d.beam);
  }

  // Coloca no inventário; retorna true se a pilha inteira entrou.
  pickup(d) {
    const G = this.G;
    if (d.entry.kind === 'gold') { this.addGold(d.entry.qty, G.player.pos); if (!d.fromBag) G.party?.noteLoot('g', 'Ouro', null, d.entry.qty, ''); return true; }
    const left = G.inv.add(d.entry);
    const taken = d.entry.kind === 'equip' ? (left ? 0 : 1) : d.entry.qty - left;
    if (taken > 0) this.onObtained(d.entry, taken);
    if (taken > 0 && !d.fromBag) this.noteTeam(d.entry, taken, d.srcName);
    if (left > 0 && d.entry.kind !== 'equip') { d.entry.qty = left; d.magnet = false; return false; }
    return left === 0;
  }

  // saque do time: o que você pegou de monstros e chefes aparece para todo o time
  noteTeam(entry, qty, src) {
    const Pt = this.G.party; if (!Pt?.id) return;
    if (entry.kind === 'equip') Pt.noteLoot('e', displayName(entry), entry.rarity, 1, src || this.G.lastLootSource || '');
    else Pt.noteLoot('s', stackDef(entry)?.name || entry.id, null, qty, '');
  }

  onObtained(entry, qty = 1, source = null) {
    const G = this.G;
    G.ui.lootFeed(entry, qty);
    const ri = entry.kind === 'equip' ? RARITY_INDEX[entry.rarity] : 0;
    G.audio.play('loot', { rarity: ri, gap: 60 });
    if (entry.kind === 'equip') {
      if (entry.named && !G.state.world.uniques.includes(entry.named)) G.state.world.uniques.push(entry.named);
      if (ri >= 2) {
        G.state.world.lootLog.unshift({ name: displayName(entry), rarity: entry.rarity, t: Date.now(), src: source || G.lastLootSource || '' });
        G.state.world.lootLog.length = Math.min(G.state.world.lootLog.length, 25);
        if (ri >= 4) G.ui.banner(rarityOf(entry).name.toUpperCase() + '!', displayName(entry), rarityOf(entry).color);
        G.saver.requestSave('loot');
      }
    }
    G.quests.handle({ type: 'inventory' }, G.questCtx());
    G.onQuestChanged();
    G.ui.refreshPanels();
  }

  // Recompensas de missão ou baú: entra direto no inventário; o que não couber cai no chão.
  giveRewards(rw, pos, source = '') {
    const G = this.G;
    if (!rw) return;
    G.lastLootSource = source;
    if (rw.gold) this.addGold(rw.gold, pos);
    for (const it of rw.items || []) {
      let entry;
      if (it.consumable) entry = makeStack(it.consumable, it.qty || 1, rng);
      else if (it.material) entry = makeStack(it.material, it.qty || 1, rng);
      else if (it.quest) entry = makeStack(it.quest, 1, rng);
      else if (it.named) {
        if (G.state.world.uniques.includes(it.named)) { this.addGold(150, pos); continue; }
        entry = createNamed(it.named, rng, G.state.player.level);
      } else if (it.roll) {
        const ilvl = it.roll.ilvl ?? Math.max(1, G.state.player.level);
        entry = rollEquipment({ rarity: it.roll.rarity, ilvl, slot: it.roll.slot, cls: G.player.cls.id, rng, classBias: it.roll.slot === 'weapon' ? 1 : undefined });
        entry.soul = true; // prêmio fixo (baú do mapa, missão, baú diário): preso ao personagem
      }
      if (!entry) continue;
      const qty = entry.kind === 'equip' ? 1 : entry.qty;
      const left = G.inv.add(entry);
      if (left > 0) {
        if (entry.kind !== 'equip') entry.qty = left;
        this.spawnDrop(entry, pos.x + (Math.random() - 0.5) * 2, pos.z + (Math.random() - 0.5) * 2, G.player.area);
        G.ui.toastSmall('Inventário cheio — o item caiu no chão.');
      }
      if (qty - (entry.kind === 'equip' ? left : left) > 0) this.onObtained(entry, entry.kind === 'equip' ? 1 : qty - left, source);
    }
  }

  clearArea(area) {
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i].area !== area && this.drops[i].t > 120) { this.removeDrop(this.drops[i]); this.drops.splice(i, 1); }
  }
}
