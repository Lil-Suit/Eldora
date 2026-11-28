import * as THREE from 'three';
import { muralTextures } from './muralart.js';
import { Ermos } from './ermos.js';
import { Confins } from './confins.js';
import { PADS, padHeight } from './campdeco.js';
import { Terrain, roadDistance, PlainExt } from './terrain.js';
import { CollisionWorld } from './colliders.js';
import { Batch, GEO, labelSprite, vcLambert, lambert } from './batch.js';
import { Rng, mulberry32 } from '../core/rng.js';
import { dist2, smoothstep, distToPolyline, clamp } from './noise.js';
import {
  WORLD, LOCATIONS, VILLAGE, ROADS, BRIDGE, STEPPING_STONES, LAKE, POND, PLATEAU, RIVER, CHESTS, RUNES, DUNGEON, CRYPT_MOUND, FOREST_PATH, ERMOS, CONFINS, PLATEAU_EXT, PORTAL_FENDA, BOSS_SPAWN, GUARDIAO,
  inVillage, villageEdgeDist, CAMP, inCamp,
} from '../config/world.js';
import { natalAtivo } from '../config/seasonal.js';
import { buildWantedBoard } from './wantedboard.js';
import * as UltraGround from './ultra/ground.js';
import * as UltraTrees from './ultra/trees.js';
import * as UltraStructures from './ultra/structures.js';
// Ultra realismo: cada parte num módulo próprio (montado só quando o Ultra liga)
const ULTRA_MODS = [UltraGround, UltraTrees, UltraStructures];
// Natal: a vila e os arredores ficam com neve (chão, telhados, plantações) e as árvores perto viram pinheiros nevados
const SNOW = natalAtivo();
const snowRoof = (c) => (SNOW ? new THREE.Color(c).lerp(new THREE.Color(0xf2f6fb), 0.82).getHex() : c);
const CRYPT_ROAD = ROADS.find((r) => r[r.length - 1][0] === CRYPT_MOUND.door.x) || ROADS[0];

const DX = WORLD.dungeonOffset.x, DZ = WORLD.dungeonOffset.z;

// Prisma triangular unitário (telhados): cumeeira ao longo de X, base em y=0, topo em y=1
function makeRoofGeo() {
  const P = { a: [-0.5, 0, -0.5], b: [-0.5, 1, 0], c: [-0.5, 0, 0.5], d: [0.5, 0, -0.5], e: [0.5, 1, 0], f: [0.5, 0, 0.5] };
  const tris = [['a', 'b', 'c'], ['d', 'e', 'f'], ['a', 'd', 'e'], ['a', 'e', 'b'], ['c', 'b', 'e'], ['c', 'e', 'f'], ['a', 'c', 'f'], ['a', 'f', 'd']];
  const center = [0, 0.33, 0];
  const v = [];
  for (const t of tris) {
    let [p0, p1, p2] = t.map((k) => P[k]);
    const u = p1.map((x, i) => x - p0[i]), w = p2.map((x, i) => x - p0[i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const cen = [0, 1, 2].map((i) => (p0[i] + p1[i] + p2[i]) / 3 - center[i]);
    if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] < 0) [p1, p2] = [p2, p1];
    v.push(...p0, ...p1, ...p2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const ROOF = makeRoofGeo(); ROOF.userData.ushape = 6; // (Ultra realismo: forma 'telhado')
const OBELISK = new THREE.CylinderGeometry(0.32, 0.55, 1, 4);

// altura do tabuleiro da ponte (t = 0 no barranco sul, 1 no norte): sobe em arco por cima do rio
// números fixos da ponte e das pedras (acesso rápido: groundHeight roda centenas de vezes por quadro)
const BR_X0 = BRIDGE.x - BRIDGE.half - 0.4, BR_X1 = BRIDGE.x + BRIDGE.half + 0.4, BR_Z0 = BRIDGE.z0, BR_Z1 = BRIDGE.z1;
const ST_N = STEPPING_STONES.length, ST_XS = new Float64Array(STEPPING_STONES.map((s) => s[0])), ST_ZS = new Float64Array(STEPPING_STONES.map((s) => s[1]));
const ST_X0 = Math.min(...ST_XS) - 1.2, ST_X1 = Math.max(...ST_XS) + 1.2, ST_Z0 = Math.min(...ST_ZS) - 1.2, ST_Z1 = Math.max(...ST_ZS) + 1.2;
const WATER_Y = WORLD.waterLevel;
export function bridgeDeck(t) { const B = BRIDGE; return B.y0 + (B.y1 - B.y0) * t + Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * B.arch; }

export class World {
  constructor(scene) {
    this.scene = scene;
    this.terrain = new Terrain();
    this.plain = new PlainExt();
    this.col = new CollisionWorld(8);
    this.group = new THREE.Group(); this.group.name = 'mundo';
    this.dungeon = new THREE.Group(); this.dungeon.name = 'cripta'; this.dungeon.visible = false;
    scene.add(this.group, this.dungeon);
    this.interactables = [];
    this.chests = {};
    this.runes = {};
    this.animated = [];
    this.lightSources = [];
    this.flames = [];
    this.uniforms = { uTime: { value: 0 }, uUltra: { value: 0 } };
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x555555 });
    this.crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.area = 'world';
    this._hArea = 'world';
    this.ermos = new Ermos();
    this.ermosGroup = null;
    this.confins = new Confins();
    this.ultraOn = false; this._ultraBuilt = false; this._built = false;
  }

  // Ultra realismo ligado/desligado (Game.applyQuality). Monta os extras na 1ª vez; depois só mostra/esconde.
  setUltra(on) {
    this.ultraOn = !!on;
    if (!this._built) return;
    if (this.ultraOn && !this._ultraBuilt) { this._ultraBuilt = true; for (const m of ULTRA_MODS) m.build?.(this); }
    if (this._ultraBuilt) for (const m of ULTRA_MODS) m.toggle?.(this, this.ultraOn);
  }

  // ---------- consulta de terreno ----------
  groundHeight(x, z, area = this.area) {
    if (area === 'cripta') return 0;
    if (area === 'ermos') return Math.max(this.ermos.heightAt(x, z), PADS.length ? padHeight(x, z) : -Infinity);
    if (area === 'confins') return Math.max(this.confins.heightAt(x, z), PADS.length ? padHeight(x, z) : -Infinity);
    if (area === 'guardiao') return this.plain.heightAt(x, z);
    let h = this.terrain.heightAt(x, z);
    if (x > BR_X0 && x < BR_X1 && z > BR_Z0 && z < BR_Z1) h = Math.max(h, bridgeDeck((z - BR_Z0) / (BR_Z1 - BR_Z0)) + 0.28);
    if (x > ST_X0 && x < ST_X1 && z > ST_Z0 && z < ST_Z1) {
      for (let i = 0; i < ST_N; i++) { const dx = x - ST_XS[i], dz = z - ST_ZS[i]; if (dx * dx + dz * dz < 1.32) { h = Math.max(h, WATER_Y + 0.28); break; } }
    }
    return h;
  }

  onBridge(x, z) { return x > BR_X0 && x < BR_X1 && z > BR_Z0 && z < BR_Z1; }

  // nível da água em cada mapa (null = sem água)
  waterAt(area = this.area) { return area === 'ermos' ? ERMOS.waterLevel : area === 'confins' ? CONFINS.waterLevel : area === 'world' ? WORLD.waterLevel : null; }
  // dentro dos limites do mapa e coberto de água funda (dá para nadar)
  swimmable(x, z, area = this.area) {
    const wl = this.waterAt(area);
    if (wl == null || this.groundHeight(x, z, area) >= wl - 0.05) return false;
    if (area === 'ermos') return this.ermos.inBounds(x, z);
    if (area === 'confins') return this.confins.inBounds(x, z);
    return Math.abs(x) <= WORLD.playable && Math.abs(z) <= WORLD.playable;
  }

  walkable(x, z, area = this.area) {
    if (area === 'cripta') {
      for (const r of DUNGEON.rects) if (x > DX + r.x0 && x < DX + r.x1 && z > DZ + r.z0 && z < DZ + r.z1) return true;
      return false;
    }
    if (area === 'ermos') return this.ermos.inBounds(x, z) && this.ermos.heightAt(x, z) > ERMOS.deep;
    if (area === 'confins') return this.confins.inBounds(x, z) && this.confins.heightAt(x, z) > CONFINS.deep;
    if (area === 'guardiao') return this.plain.inBounds(x, z); // mapa 2: o paredão em volta segura (inclinação)
    // ao norte do Planalto o mapa 1 acaba (montanha): ninguém sobe a borda pela faixa ao lado do planalto
    if (z < -166 && dist2(x, z, PLATEAU.x, PLATEAU.z) > PLATEAU.r - 1.5 && z > -200) return false;
    if (z <= -200) return false;
    if (Math.abs(x) > WORLD.playable || Math.abs(z) > WORLD.playable) return false;
    return this.groundHeight(x, z, area) > WORLD.deepWater;
  }

  inWater(x, z) {
    if (this.area === 'ermos') return this.ermos.heightAt(x, z) < ERMOS.waterLevel - 0.15;
    if (this.area === 'confins') return this.confins.heightAt(x, z) < CONFINS.waterLevel - 0.15;
    return this.area === 'world' && this.groundHeight(x, z) < WORLD.waterLevel - 0.15;
  }

  isSafe(x, z, area = this.area) {
    if (area === 'confins') return dist2(x, z, CONFINS.entry.x + CONFINS.offset.x, CONFINS.entry.z + CONFINS.offset.z) < CONFINS.camp.r;
    if (area === 'ermos') { const L = ERMOS.locations.acampamento; return dist2(x, z, L.x + ERMOS.offset.x, L.z + ERMOS.offset.z) < L.r; }
    if (area === 'guardiao') return dist2(x, z, GUARDIAO.entry.x, GUARDIAO.entry.z) < 9; // chegada pelo portal
    return area === 'world' && inVillage(x, z); // dentro da muralha da vila (com as fazendas)
  }

  // Move uma entidade com colisão, água profunda e limite de inclinação.
  tryMove(pos, dx, dz, r, area = this.area, swim = false) {
    const ox = pos.x, oz = pos.z;
    // nadando, a "altura" que importa é a do corpo: o chão ou a superfície da água (o que for maior)
    const wl = swim ? this.waterAt(area) : null;
    const eff = (x, z) => { const g = this.groundHeight(x, z, area); return wl != null ? Math.max(g, wl - 0.9) : g; };
    const h0 = eff(ox, oz);
    const ok = (x, z) => {
      if (!this.walkable(x, z, area) && !(swim && this.swimmable(x, z, area))) return false;
      const step = Math.hypot(x - ox, z - oz) || 1e-4;
      return eff(x, z) - h0 <= WORLD.slopeLimit * step + 0.08 + (swim ? 0.5 : 0);
    };
    let nx = ox + dx, nz = oz + dz;
    if (!ok(nx, nz)) {
      if (ok(ox + dx, oz)) nz = oz;
      else if (ok(ox, oz + dz)) nx = ox;
      else return false;
    }
    pos.x = nx; pos.z = nz;
    this.col.resolve(pos, r);
    if (!this.walkable(pos.x, pos.z, area) && !(swim && this.swimmable(pos.x, pos.z, area))) { pos.x = ox; pos.z = oz; return false; }
    return true;
  }

  lineOfSight(ax, az, bx, bz) { return this.col.segment(ax, az, bx, bz, 'los') < 0; }
  // o terreno (morro, barranco) não tapa a linha entre os dois pontos? (amostra a cada ~1,5 m)
  terrainClear(ax, ay, az, bx, by, bz, area = this.area) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 1.5));
    for (let i = 1; i < n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (this.groundHeight(x, z, area) > ay + (by - ay) * t + 0.25) return false; }
    return true;
  }

  setArea(area) {
    globalThis.__eldCrumb?.('área: ' + area, 'navegação');
    this.area = area;
    this.group.visible = area === 'world';
    this.dungeon.visible = area === 'cripta';
    if (this.ermosGroup) this.ermosGroup.visible = area === 'ermos';
    if (this.plainGroup) this.plainGroup.visible = area === 'guardiao';
    if (this.confins.group) this.confins.group.visible = area === 'confins';
    if (area !== 'confins') this.confins.unloadAll();
  }

  addInteract(o) { this.interactables.push({ r: 2.6, area: 'world', ...o }); return o; }

  // ---------- construção ----------
  build() {
    const t0 = performance.now();
    this.group.add(this.terrain.buildMesh());
    // MAPA 2 (Planície do Guardião): grupo próprio, só aparece quando você está nele
    this.plainGroup = new THREE.Group(); this.plainGroup.name = 'guardiao'; this.plainGroup.visible = false;
    this.scene.add(this.plainGroup);
    this.plainGroup.add(this.plain.buildMesh());
    this.buildWater();
    const b = new Batch(), glow = new Batch(), crystal = new Batch();
    this.buildVillage(b, glow);
    this.buildBridgeAndStones(b, glow);
    this.buildCamp(b, glow);
    this.buildRuins(b, glow);
    this.buildCircleAndRunes(b);
    this.buildIsland(b);
    this.buildCryptEntrance(b, glow);
    this.buildPlateau(b, crystal);
    {
      const pb = new Batch(), pglow = new Batch(), pcrystal = new Batch();
      this.buildPlain(pb, pcrystal, pglow);
      const a = pb.build(vcLambert(), { name: 'estatico-guardiao' }); if (a) this.plainGroup.add(a);
      const g2 = pglow.build(this.glowMat, { castShadow: false, receiveShadow: false, name: 'brilho-guardiao' }); if (g2) this.plainGroup.add(g2);
      const c2 = pcrystal.build(this.crystalMat, { castShadow: false, receiveShadow: false, name: 'cristais-guardiao' }); if (c2) this.plainGroup.add(c2);
    }
    this.ermosGroup = this.ermos.build(this);
    this.scene.add(this.ermosGroup);
    this.confins.attach(this);
    this.buildChests();
    const sm = b.build(vcLambert(), { name: 'estatico' }); if (sm) this.group.add(sm);
    const gm = glow.build(this.glowMat, { castShadow: false, receiveShadow: false, name: 'brilho' }); if (gm) this.group.add(gm);
    const cm = crystal.build(this.crystalMat, { castShadow: false, receiveShadow: false, name: 'cristais' }); if (cm) this.group.add(cm);
    this.buildVegetation();
    this.buildDungeon();
    this.buildTime = performance.now() - t0;
    this._built = true; if (this.ultraOn) this.setUltra(true);
    return this;
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 120, 120);
    const m = new THREE.MeshPhongMaterial({ color: 0x3b93bd, specular: 0xbfe8ff, shininess: 70, transparent: true, opacity: 0.8, flatShading: true });
    const U = this.uniforms;
    this.waterMat = m;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uUltra = U.uUltra;
      sh.vertexShader = 'uniform float uTime;\nvarying vec3 vWW;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          float wx = position.x * 0.33 + uTime * 1.2, wy = position.y * 0.41 - uTime * 0.9;
          vec3 objectNormal = normalize(vec3(-cos(wx) * 0.33 * 0.07, -cos(wy) * 0.41 * 0.07, 1.0));`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.z += sin(wx) * 0.07 + sin(wy) * 0.07;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      // Ultra realismo: ondinhas finas por pixel (o sol brilha e "quebra" na água) e cor mais funda nas partes viradas para cima
      sh.fragmentShader = 'uniform float uTime; uniform float uUltra; varying vec3 vWW;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (uUltra > 0.5) {
            vec2 q = vWW.xz;
            float n1 = sin(q.x * 1.7 + uTime * 1.9) * cos(q.y * 1.3 - uTime * 1.4);
            float n2 = sin(q.x * 4.3 - uTime * 2.7 + q.y * 2.1) * 0.5 + sin(q.y * 5.1 + uTime * 3.3) * 0.5;
            vec3 pn = vec3(n1 * 0.18 + n2 * 0.09, 0.0, cos(q.x * 2.3 + uTime) * 0.12 + n2 * 0.08);
            normal = normalize(normal + (viewMatrix * vec4(pn, 0.0)).xyz);
          }`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          if (uUltra > 0.5) { gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.78, 0.92, 1.05), 0.35); gl_FragColor.a = min(0.92, gl_FragColor.a + 0.08); }`);
    };
    m.customProgramCacheKey = () => 'agua-v2';
    const w = new THREE.Mesh(g, m);
    w.rotation.x = -Math.PI / 2;
    w.position.y = WORLD.waterLevel;
    w.receiveShadow = true;
    w.name = 'agua';
    w.renderOrder = 1;
    this.group.add(w);
  }

  h(x, z) { return this.groundHeight(x, z, this._hArea); }

  // Converte offset local (lx, lz) de um objeto rotacionado (rotation.y = rot) para mundo
  static L(x, z, rot, lx, lz) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  }

  buildVillage(b, glow) {
    const L = World.L;
    const wood = 0x5a3b24, woodL = 0x7a5232, stone = 0x9a958c, stoneD = 0x7b766e;
    for (const hs of VILLAGE.houses) {
      const { x, z, rot, w, d } = hs;
      const y = this.h(x, z);
      b.box(x, y + 0.2, z, w + 0.4, 0.45, d + 0.4, stoneD, rot);
      b.box(x, y + 1.7, z, w, 3, d, hs.color, rot);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const [px, pz] = L(x, z, rot, sx * (w / 2), sz * (d / 2));
        b.box(px, y + 1.7, pz, 0.28, 3.05, 0.28, wood, rot);
      }
      b.box(x, y + 1.85, z, w + 0.06, 0.18, d + 0.06, wood, rot);
      b.addGeo(ROOF, x, y + 3.2, z, w + 1.0, 2.2, d + 1.1, 0, rot, 0, snowRoof(hs.roof));
      const [cx, cz] = L(x, z, rot, w * 0.28, -d * 0.12);
      b.box(cx, y + 4.6, cz, 0.6, 1.8, 0.6, stone, rot);
      const [dx, dz] = L(x, z, rot, 0, d / 2 + 0.04);
      b.box(dx, y + 1.15, dz, 1.0, 1.9, 0.1, wood, rot);
      for (const s of [-1, 1]) {
        const [wx, wz] = L(x, z, rot, s * w * 0.3, d / 2 + 0.05);
        glow.box(wx, y + 2.25, wz, 0.75, 0.62, 0.08, 0xffc66b, rot);
        const [sx2, sz2] = L(x, z, rot, s * (w / 2 + 0.05), 0);
        glow.box(sx2, y + 2.25, sz2, 0.08, 0.62, 0.75, 0xffc66b, rot);
      }
      this.col.addBox(x, z, w / 2 + 0.25, d / 2 + 0.25, rot, { cam: true });
      this.lightSources.push({ x, z, y: y + 2.5, color: 0xffb35c, intensity: 0, night: 6, dist: 12, kind: 'janela' });
    }
    // Ferraria
    {
      const { x, z, rot } = VILLAGE.forge; const y = this.h(x, z);
      for (const [sx, sz] of [[-2.5, -2], [2.5, -2], [-2.5, 2], [2.5, 2]]) {
        const [px, pz] = L(x, z, rot, sx, sz);
        b.box(px, y + 1.6, pz, 0.3, 3.2, 0.3, wood, rot);
        this.col.addCircle(px, pz, 0.3, { los: true });
      }
      b.box(x, y + 3.35, z, 5.9, 0.25, 4.9, 0x6b4a33, rot, 0.08);
      const [fx, fz] = L(x, z, rot, 0, -1.4);
      b.box(fx, y + 0.9, fz, 2.2, 1.8, 1.5, stoneD, rot);
      const [gx, gz] = L(x, z, rot, 0, -0.62);
      glow.box(gx, y + 0.75, gz, 1.0, 0.6, 0.08, 0xff7a2a, rot);
      const [chx, chz] = L(x, z, rot, 0.4, -1.6);
      b.box(chx, y + 3.4, chz, 0.8, 4.6, 0.8, stone, rot);
      const [ax, az] = L(x, z, rot, 0.6, 0.9);
      b.box(ax, y + 0.45, az, 0.5, 0.9, 0.5, 0x3d3a38, rot);
      b.box(ax, y + 1.0, az, 1.2, 0.3, 0.5, 0x4d4a48, rot);
      this.col.addBox(fx, fz, 1.2, 0.85, rot);
      this.col.addCircle(ax, az, 0.6);
      this.lightSources.push({ x: fx, z: fz, y: y + 1.4, color: 0xff7a2a, intensity: 2.2, night: 7, dist: 14, flicker: true, kind: 'forja' });
      this.flames.push({ x: fx, y: y + 0.9, z: fz, kind: 'brasa' });
    }
    // Barracas da vila: um pouco maiores e mais caprichadas (balcão, toldo listrado com franja, prateleiras e lampião)
    const stand = (x, z, rot, o) => {
      const y = this.h(x, z), S = 1.25;
      const at = (lx, lz) => L(x, z, rot, lx * S, lz * S);
      // balcão com tampo e painel da frente
      { const [px, pz] = at(0, -0.15); b.box(px, y + 0.55, pz, 3.4 * S, 1.1, 1.2 * S, woodL, rot); b.box(px, y + 1.13, pz, 3.6 * S, 0.12, 1.35 * S, wood, rot); }
      { const [px, pz] = at(0, -0.8); b.box(px, y + 0.6, pz, 3.3 * S, 0.7, 0.06, o.panel, rot); }
      // postes e toldo listrado (com franja ondulada)
      for (const sx of [-1, 1]) for (const sz of [-0.85, 0.75]) { const [px, pz] = at(sx * 1.72, sz); b.box(px, y + 1.5, pz, 0.18, 3.0, 0.18, wood, rot); this.col.addCircle(px, pz, 0.22, { los: true }); }
      for (let i = 0; i < 6; i++) {
        const lx = -1.75 + i * 0.7, c = i % 2 ? o.stripe2 : o.stripe;
        { const [px, pz] = at(lx + 0.35, -0.05); b.box(px, y + 3.05, pz, 0.7 * S, 0.1, 2.1 * S, c, rot, -0.2); }
        { const [px, pz] = at(lx + 0.35, -1.12); b.box(px, y + 2.62, pz, 0.68 * S, 0.34, 0.05, c, rot); b.addGeo(GEO.sphere, px, y + 2.44, pz, 0.16 * S, 0.12, 0.05, 0, rot, 0, c); }
      }
      // prateleira atrás com mercadorias
      { const [px, pz] = at(0, 0.62); b.box(px, y + 1.55, pz, 3.1 * S, 0.08, 0.4, wood, rot); b.box(px, y + 2.15, pz, 3.1 * S, 0.08, 0.4, wood, rot); }
      o.goods(at, y);
      // lampião pendurado e placa
      { const [px, pz] = at(1.5, -1.0); b.cyl(px, y + 2.25, pz, 0.03, 0.4, 0x2a2a2a, 4); glow.box(px, y + 1.95, pz, 0.2, 0.26, 0.2, 0xffd88a, rot); this.lightSources.push({ x: px, z: pz, y: y + 2, color: 0xffc070, intensity: 0, night: 4, dist: 9, kind: 'lampiao' }); }
      if (o.sign) { const sg = labelSprite(o.sign[0], o.sign[1], o.sign[2]); const [px, pz] = at(0, 0); sg.position.set(px, y + 4.1, pz); sg.scale.multiplyScalar(0.27); this.group.add(sg); }
      { const [px, pz] = at(0, -0.15); this.col.addBox(px, pz, 1.8 * S, 0.7 * S, rot); }
    };
    // Barraca do mercador (vende e compra equipamentos)
    {
      const { x, z, rot } = VILLAGE.stall;
      stand(x, z, rot, { stripe: 0xb8402f, stripe2: 0xf2e6c8, panel: 0x8a3a2a, sign: ['MERCADOR', 'Compra e vende itens', '#ffd36b'], goods: (at, y) => {
        for (const [lx, c] of [[-1.1, 0xd96b3a], [-0.4, 0x6bb24a], [0.3, 0xe8c45a], [1.0, 0xc84a3a]]) { const [px, pz] = at(lx, -0.2); b.addGeo(GEO.sphere, px, y + 1.32, pz, 0.3, 0.26, 0.3, 0, 0, 0, c); }
        for (const lx of [-1.2, -0.4, 0.4, 1.2]) { const [px, pz] = at(lx, 0.62); b.box(px, y + 1.8, pz, 0.34, 0.4, 0.3, 0x9aa3ad, 0); b.box(px, y + 2.36, pz, 0.12, 0.38, 0.06, 0xd9b25f, 0); }
        const [bx, bz] = at(2.25, -0.2); b.cyl(bx, y + 0.55, bz, 0.45, 1.1, 0x7a5232, 8); this.col.addCircle(bx, bz, 0.5);
      } });
    }
    // Barraca da Fornecedora (poções e flechas)
    {
      const { x, z, rot } = VILLAGE.supply;
      stand(x, z, rot, { stripe: 0x5a3a8a, stripe2: 0xf2e6c8, panel: 0x3a2a5a, sign: ['FORNECEDORA', 'Poções e flechas', '#c8a8ff'], goods: (at, y) => {
        for (let i = 0; i < 7; i++) { const [px, pz] = at(-1.35 + i * 0.45, -0.25); const c = [0xff4d5e, 0x4fa3ff][i % 2]; const big = i % 3 === 0; b.addGeo(GEO.sphere, px, y + 1.3, pz, big ? 0.2 : 0.14, big ? 0.22 : 0.16, big ? 0.2 : 0.14, 0, 0, 0, c); b.cyl(px, y + 1.5 + (big ? 0.08 : 0), pz, 0.05, 0.12, 0xe8e0cc, 6); }
        for (let i = 0; i < 6; i++) { const [px, pz] = at(-1.25 + i * 0.5, 0.62); const c = [0xff4d5e, 0x4fa3ff, 0xff2a3c][i % 3]; b.addGeo(GEO.sphere, px, y + 1.75, pz, 0.15, 0.18, 0.15, 0, 0, 0, c); }
        // aljavas com flechas
        for (const lx of [-0.8, 0.0, 0.8]) { const [px, pz] = at(lx, 0.62); b.cyl(px, y + 2.42, pz, 0.12, 0.42, 0x6e4524, 8); for (const k of [-0.05, 0.05]) b.cyl(px + k, y + 2.75, pz, 0.015, 0.3, 0xe8d39a, 4); }
      } });
    }
    // Banco de Eldoria: balcão de pedra, cofre atrás da banqueira e placa
    {
      const { x, z, rot } = VILLAGE.bank; const y = this.h(x, z);
      const [cx, cz] = L(x, z, rot, 0, -1.15);
      b.box(cx, y + 0.55, cz, 2.8, 1.1, 0.8, 0x8a8478, rot);
      b.box(cx, y + 1.14, cz, 3.0, 0.12, 0.95, 0xb8b0a0, rot);
      for (const sx of [-1, 1]) { const [px, pz] = L(x, z, rot, sx * 1.35, -1.15); b.cyl(px, y + 1.75, pz, 0.09, 1.2, 0xd9b25f, 6); }
      const [rx, rz] = L(x, z, rot, 0, -1.15); b.box(rx, y + 2.38, rz, 3.0, 0.1, 1.0, 0x2c3a5a, rot);
      for (const [lx, h] of [[-0.9, 0.18], [-0.6, 0.3], [0.7, 0.24], [0.95, 0.12]]) { const [px, pz] = L(x, z, rot, lx, -1.15); b.cyl(px, y + 1.2 + h / 2, pz, 0.13, h, 0xffd36b, 8); }
      const [kx, kz] = L(x, z, rot, 0, 1.0);
      b.box(kx, y + 1.1, kz, 2.2, 2.2, 0.8, 0x4a4a52, rot);
      b.box(kx, y + 1.1, kz, 1.2, 1.2, 0.85, 0x6a6a74, rot);
      const [dx, dz] = L(x, z, rot, 0, 0.55); b.cyl(dx, y + 1.1, dz, 0.32, 0.12, 0xd9b25f, 12, Math.PI / 2, rot, 0);
      this.col.addBox(cx, cz, 1.55, 0.55, rot);
      this.col.addBox(kx, kz, 1.15, 0.5, rot);
      const sign = labelSprite('BANCO', 'Guardar e transferir ouro', '#ffd36b');
      sign.position.set(cx, y + 3.6, cz); sign.scale.multiplyScalar(0.27); this.group.add(sign);
    }
    // Loja dos Jogadores: barraca nova (toldo verde), caixotes e placa
    {
      const { x, z, rot } = VILLAGE.pshop;
      const [cx, cz] = L(x, z, rot, 0, -0.6);
      stand(cx, cz, rot, { stripe: 0x3a8a5a, stripe2: 0xf2e6c8, panel: 0x2a5a3a, sign: ['LOJA DOS JOGADORES', 'Compre e venda com outros jogadores', '#7dffa8'], goods: (at, y) => {
        for (const [lx, c] of [[-1.0, 0x8a6aff], [-0.3, 0xffb040], [0.4, 0x5ef0ff], [1.05, 0xff6a6a]]) { const [px, pz] = at(lx, -0.2); b.addGeo(GEO.box, px, y + 1.36, pz, 0.32, 0.32, 0.32, 0, rot + lx, 0, c); }
        for (const lx of [-1.0, 1.0]) { const [px, pz] = at(lx, 1.6); b.box(px, y + 0.35, pz, 0.7, 0.7, 0.7, wood, rot + lx * 0.3); }
      } });
    }
    // Estátua do Primeiro Guardião: pedestal de três degraus com placa de bronze; a figura (modelo novo
    // dos heróis, em pedra) entra por cima quando os modelos carregam (engine/statue.js)
    {
      const x = 0, z = 71.5, y = this.h(x, z);
      b.box(x, y + 0.35, z, 3.4, 0.7, 3.4, stoneD);
      b.box(x, y + 0.95, z, 2.8, 0.5, 2.8, stone);
      b.box(x, y + 1.35, z, 2.3, 0.3, 2.3, stoneD);
      for (const [dx, dz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) b.box(x + dx, y + 0.9, z + dz, 0.4, 1.8, 0.4, stone); // colunas nos cantos
      b.box(x, y + 0.95, z - 1.41, 1.3, 0.34, 0.04, 0x9a7a42); // placa de bronze
      glow.box(x, y + 0.95, z - 1.44, 1.0, 0.05, 0.02, 0x5ef0ff);
      this.statueAt = { x, y: y + 1.5, z };
      this.col.addCircle(x, z, 1.9);
    }
    // Poço
    {
      const x = -6.5, z = 76, y = this.h(x, z);
      b.cyl(x, y + 0.45, z, 1.2, 0.9, stone, 12);
      b.cyl(x, y + 0.92, z, 0.95, 0.06, 0x2a4e66, 12);
      for (const s of [-1, 1]) b.box(x + s * 1.0, y + 1.5, z, 0.18, 2.0, 0.18, wood);
      b.addGeo(ROOF, x, y + 2.4, z, 2.6, 0.9, 1.6, 0, 0, 0, 0x7a4b2a);
      this.col.addCircle(x, z, 1.3);
    }
    const cx = VILLAGE.wall.x, cz = VILLAGE.wall.z;
    this.buildCityWall(b, glow);
    this.buildFarms(b);
    // Mural de Procurados (PvP): quadro com cartazes, ao norte da praça
    {
      const x = 7, z = 96, y = this.h(x, z);
      try { buildWantedBoard(this.group, x, y, z, 0); } catch (e) { console.warn('mural', e); }
      this.col.addBox(x, z, 2.1, 0.3, 0);
      this.addInteract({ id: 'procurados', kind: 'wanted', x, z: z + 1.4, r: 3, name: 'Mural de Procurados' });
    }
    // Lampiões da praça
    const lamps = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; lamps.push([VILLAGE.center.x + Math.cos(a) * 11.5, VILLAGE.center.z + Math.sin(a) * 11.5]); }
    // lampiões nas ruas da vila nova
    for (const z of [88, 118, 132, 146]) for (const sx of [-3.6, 3.6]) lamps.push([sx, z]);
    for (const x of [-46, -32, -16, 16, 32, 46]) lamps.push([x, 107 + Math.abs(x) * 0.07 + 3.4]);
    for (const [px, pz] of lamps) {
      const y = this.h(px, pz);
      b.box(px, y + 1.4, pz, 0.16, 2.8, 0.16, 0x2f2b28);
      b.box(px, y + 2.9, pz, 0.5, 0.12, 0.5, 0x2f2b28);
      glow.box(px, y + 2.6, pz, 0.34, 0.45, 0.34, 0xffd27a);
      this.col.addCircle(px, pz, 0.25, { los: false });
    }
    this.lightSources.push({ x: 0, z: 66, y: 4, color: 0xffc078, intensity: 0, night: 9, dist: 26, kind: 'praca' });
    // Bandeiras com o emblema da Fenda no portão norte
    for (const s of [-1, 1]) {
      // ficam ao lado da cabeceira norte da ponte larga (antes ficavam em cima dela)
      const px = s * 6.6, pz = BRIDGE.z1 + 1.6, y = this.h(px, pz);
      b.box(px, y + 2.5, pz, 0.2, 5, 0.2, wood);
      b.box(px + s * 0.55, y + 3.9, pz, 1.0, 1.9, 0.06, 0x2c2f6b);
      b.box(px + s * 0.55, y + 3.9, pz + 0.04, 0.14, 1.3, 0.02, 0x5ef0ff, 0, 0, s * 0.3);
      this.col.addCircle(px, pz, 0.3, { los: false });
    }
    // Detalhes: caixas, barris, fardos de feno
    const rng = new Rng(mulberry32(7));
    for (let i = 0; i < 60; i++) {
      const a = rng.range(0, Math.PI * 2), r = i < 18 ? rng.range(13, 26) : rng.range(20, 62);
      const ox = i < 18 ? VILLAGE.center.x : cx, oz = i < 18 ? VILLAGE.center.z : cz;
      const px = ox + Math.cos(a) * r, pz = oz + Math.sin(a) * r;
      if (this.col.pointBlocked(px, pz, 1.4) || Math.abs(px) < 3.5) continue;
      const y = this.h(px, pz);
      const k = rng.int(0, 2);
      if (k === 0) { b.box(px, y + 0.45, pz, 0.9, 0.9, 0.9, 0x8a6a42, rng.range(0, 3)); this.col.addCircle(px, pz, 0.6); }
      else if (k === 1) { b.cyl(px, y + 0.5, pz, 0.42, 1.0, 0x6e4a2c, 8); this.col.addCircle(px, pz, 0.5); }
      else { b.cyl(px, y + 0.55, pz, 0.6, 1.4, 0xd8c070, 8, 0, rng.range(0, 3), Math.PI / 2); this.col.addCircle(px, pz, 0.75); }
    }
  }

  // Ponte de pedra do Vale: larga, com arcos, parapeito com balaústres, pilares com braseiros e lampiões
  buildBridgeAndStones(b, glow) {
    const B = BRIDGE, n = 16, stone = 0xa7a196, stone2 = 0xb4aea2, dark = 0x7d776e, moss = 0x6e8a4a;
    const L = B.z1 - B.z0, deckY = bridgeDeck;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
      const z = B.z0 + L * tm, y = deckY(tm);
      const slope = Math.atan2(deckY(t1) - deckY(t0), L / n);
      b.box(B.x, y, z, B.half * 2, 0.55, L / n + 0.06, i % 2 ? stone : stone2, 0, -slope);
      b.box(B.x, y - 0.75, z, B.half * 2 - 0.2, 1.0, L / n + 0.04, dark, 0, -slope); // laje grossa por baixo
      b.box(B.x, y + 0.29, z, B.half * 0.9, 0.02, L / n + 0.04, i % 2 ? 0x9a9488 : 0xa39d91, 0, -slope); // faixa central gasta
      for (const s of [-1, 1]) {
        b.box(B.x + s * (B.half + 0.2), y + 0.3, z, 0.42, 0.22, L / n + 0.05, dark, 0, -slope); // meio-fio
        b.box(B.x + s * (B.half + 0.2), y + 1.12, z, 0.46, 0.16, L / n + 0.05, stone2, 0, -slope); // corrimão
        if (i % 2 === 0) b.cyl(B.x + s * (B.half + 0.2), y + 0.72, z, 0.12, 0.66, dark, 6); // balaústre
        if (i % 4 === 1) b.box(B.x + s * (B.half + 0.42), y - 0.1, z, 0.06, 0.4, 0.6, moss); // musgo pendurado
      }
    }
    for (const s of [-1, 1]) {
      this.col.addBox(B.x + s * (B.half + 0.25), (B.z0 + B.z1) / 2, 0.24, L / 2 - 1.4, 0, { los: false, cam: false });
      // pilares das pontas com braseiro aceso
      for (const zz of [B.z0 + 0.5, B.z1 - 0.5]) {
        const px = B.x + s * (B.half + 0.45), y = Math.max(this.h(px, zz), deckY((zz - B.z0) / L) - 0.2);
        b.box(px, y + 1.0, zz, 0.95, 2.2, 0.95, dark);
        b.box(px, y + 2.2, zz, 1.15, 0.22, 1.15, stone);
        b.cyl(px, y + 2.45, zz, 0.42, 0.3, 0x4a4038, 8);
        glow?.cone(px, y + 2.85, zz, 0.3, 0.6, 0xffb040, 6);
        this.lightSources.push({ x: px, z: zz, y: y + 2.9, color: 0xffa040, intensity: 0, night: 5, dist: 12, kind: 'braseiro' });
        this.flames.push({ x: px, y: y + 2.75, z: zz, kind: 'brasa' });
        this.col.addCircle(px, zz, 0.62);
      }
      // lampiões no meio da ponte
      { const zz = (B.z0 + B.z1) / 2, px = B.x + s * (B.half + 0.2), y = deckY(0.5);
        b.cyl(px, y + 1.9, zz, 0.07, 1.6, 0x3a3a3a, 6); b.box(px - s * 0.25, y + 2.7, zz, 0.55, 0.06, 0.06, 0x3a3a3a);
        glow?.box(px - s * 0.45, y + 2.45, zz, 0.26, 0.34, 0.26, 0xffd88a);
        this.lightSources.push({ x: px - s * 0.45, z: zz, y: y + 2.4, color: 0xffc070, intensity: 0, night: 4, dist: 10, kind: 'lampiao' }); }
    }
    // arcos: 3 pilares grossos dentro do rio, com quebra-mar de pedra
    for (const t of [0.3, 0.5, 0.7]) {
      const z = B.z0 + L * t, y = deckY(t);
      const hh = y + 2.2; b.box(B.x, y - hh / 2, z, B.half * 2 + 0.3, hh, 1.6, dark);
      for (const s of [-1, 1]) b.box(B.x + s * (B.half + 0.5), -1.2, z, 0.9, 2.2, 1.1, 0x6e685f, Math.PI / 4);
    }
    for (const [x, z] of STEPPING_STONES) {
      b.cyl(x, WORLD.waterLevel - 0.25, z, 0.95, 0.9, 0x8e8a80, 8, 0, x * 3);
    }
  }

  buildCamp(b, glow) {
    // Acampamento Goblin: paliçada pelo contorno CAMP.poly (pacote 3: alongada para o norte, até perto do morro)
    const cx = -106, cz = -42;
    const rng = new Rng(mulberry32(21)), P = CAMP.poly;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.85));
      for (let k = 0; k < n; k++) {
        const t = k / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (CAMP.gates.some((gt) => Math.hypot(px - gt.x, pz - gt.z) < gt.w / 2 + 0.6)) continue; // portões
        const y = this.h(px, pz), hh = rng.range(2.6, 3.6);
        b.cyl(px, y + hh / 2, pz, 0.36, hh, 0x6b4a2e, 6);
        b.cone(px, y + hh + 0.3, pz, 0.36, 0.6, 0x8a6a42, 6);
        this.col.addCircle(px, pz, 0.46);
      }
    }
    // torres de vigia nos dois lados do portão
    for (const s of [-1, 1]) {
      const G0 = CAMP.gates[0], px = G0.x - 1.8, pz = G0.z + s * (G0.w / 2 + 1.8), y = this.h(px, pz);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(px + ox, y + 3, pz + oz, 0.18, 6, 0x5a3d24, 6);
      b.box(px, y + 6.1, pz, 2.8, 0.25, 2.8, 0x7a5a3a);
      b.cone(px, y + 7.4, pz, 2.2, 2.2, 0x9c3b2e, 4, 0.78);
      this.col.addCircle(px, pz, 1.6);
    }
    const tents = [
      [-119, -51, 5.4, 6.0, 0x8a5a3a], // tenda maior (o baú fica atrás dela)
      [-88, -56, 3.8, 4.6, 0x6b4f35], [-122, -22, 4.0, 4.8, 0x9c3b2e], [-92, -22, 3.6, 4.4, 0x7a5a3a],
      [-132, -38, 3.4, 4.2, 0x6b4f35], [-104, -68, 3.6, 4.4, 0x9c3b2e], [-80, -44, 3.0, 3.8, 0x8a5a3a],
      [-108, -14, 3.2, 4.0, 0x6b4f35], [-136, -58, 3.0, 3.8, 0x7a5a3a], [-84, -66, 2.8, 3.6, 0x8a5a3a],
      // parte nova (norte)
      [-132, -88, 3.8, 4.6, 0x9c3b2e], [-102, -94, 3.4, 4.2, 0x6b4f35], [-126, -116, 4.2, 5.0, 0x8a5a3a], [-98, -124, 3.2, 4.0, 0x7a5a3a],
      [-118, -136, 3.0, 3.8, 0x9c3b2e], [-138, -104, 3.0, 3.8, 0x6b4f35],
    ];
    for (const [x, z, r, hh, c] of tents) {
      const y = this.h(x, z);
      b.cone(x, y + hh / 2, z, r, hh, c, 6, rng.range(0, 3));
      b.box(x, y + 0.8, z + r * 0.62, 1.1, 1.6, 0.3, 0x2a1f18, Math.atan2(cx - x, cz - z));
      b.cyl(x, y + hh + 0.4, z, 0.08, 1.2, 0x3d2a1c, 6);
      this.col.addCircle(x, z, r * 0.85);
    }
    // fogueiras: a grande no centro e duas menores
    const fire = (fx, fz, s) => {
      const y = this.h(fx, fz);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.rock(fx + Math.cos(a) * 1.25 * s, y + 0.15, fz + Math.sin(a) * 1.25 * s, 0.55 * s, 0x77726b, a); }
      b.cyl(fx, y + 0.25, fz, 0.12 * s, 1.8 * s, 0x4a3020, 6, Math.PI / 2, 0.5);
      b.cyl(fx, y + 0.25, fz, 0.12 * s, 1.8 * s, 0x4a3020, 6, Math.PI / 2, 2.1);
      glow.cone(fx, y + 0.8 * s, fz, 0.6 * s, 1.4 * s, 0xff8a2a, 6);
      glow.cone(fx, y + 0.7 * s, fz, 0.35 * s, 1.8 * s, 0xffd36b, 6, 0.6);
      this.col.addCircle(fx, fz, 1.4 * s, { los: false });
      this.lightSources.push({ x: fx, z: fz, y: y + 1.5, color: 0xff8a3a, intensity: 1.5, night: 7, dist: 18 * s, flicker: true, kind: 'fogueira' });
      this.flames.push({ x: fx, y: y + 0.8 * s, z: fz, kind: 'fogueira', smoke: true });
    };
    fire(cx, cz, 1.5); fire(-96, -60, 1); fire(-124, -36, 1); fire(-114, -106, 1.2);
    // totem
    const tx = -110, tz = -68, ty = this.h(tx, tz);
    for (let i = 0; i < 3; i++) b.box(tx, ty + 0.9 + i * 1.4, tz, 1.2, 1.3, 1.2, [0x7a4b2a, 0x9c3b2e, 0x5a7a2a][i], i * 0.4);
    b.addGeo(GEO.sphere, tx, ty + 5.1, tz, 0.9, 0.8, 0.9, 0, 0, 0, 0xe8e1cf);
    glow.box(tx - 0.24, ty + 5.1, tz + 0.43, 0.16, 0.13, 0.05, 0xff3d3d); glow.box(tx + 0.24, ty + 5.1, tz + 0.43, 0.16, 0.13, 0.05, 0xff3d3d);
    this.col.addCircle(tx, tz, 0.9);
    // caixas e barris espalhados
    for (const [x, z] of [[-86, -38], [-87, -39.6], [-100, -34], [-78, -50], [-130, -44], [-131.2, -45.4], [-114, -60], [-98, -26], [-118, -12], [-90, -70], [-136, -26], [-110, -88], [-111.4, -89.2], [-134, -126], [-92, -110], [-140, -92]]) {
      const yy = this.h(x, z);
      b.box(x, yy + 0.45, z, 0.9, 0.9, 0.9, 0x8a6a42, x);
      this.col.addCircle(x, z, 0.6);
    }
  }

  buildRuins(b, glow) {
    const cx = -26, cz = -102, rng = new Rng(mulberry32(33));
    const st = 0xa39f95, stD = 0x857f75, moss = 0x6d8a4a;
    // anel de colunas bem largo (raio 30): o miolo das ruínas fica livre para lutar
    const RR = 30, NC = 22;
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * Math.PI * 2 + 0.1;
      const px = cx + Math.cos(a) * RR, pz = cz + Math.sin(a) * RR, y = this.h(px, pz);
      if (Math.hypot(px + 6, pz + 122) < 5) continue; // não invade a alcova do baú
      if (i === 7 || i === 16) { // colunas caídas, deitadas ao longo do anel (não atrapalham o caminho)
        const rot = -(a + Math.PI / 2);
        b.cyl(px, y + 0.5, pz, 0.6, 4.5, st, 8, 0, rot, Math.PI / 2);
        this.col.addBox(px, pz, 2.2, 0.6, rot);
        continue;
      }
      const hh = i === 11 ? 10 : rng.range(1.8, 5.6);
      b.cyl(px, y + hh / 2, pz, 0.6, hh, i % 3 ? st : stD, 8);
      b.box(px, y + 0.25, pz, 1.6, 0.5, 1.6, stD);
      if (hh > 4) b.box(px, y + hh + 0.2, pz, 1.5, 0.4, 1.5, st);
      if (rng.chance(0.5)) b.box(px, y + hh * 0.4, pz + 0.55, 0.9, 0.5, 0.15, moss);
      this.col.addCircle(px, pz, 0.85);
    }
    // muros quebrados: só na borda (raio 33), acompanhando o anel; entradas livres nas estradas
    for (const a of [0.55, 1.8, 2.45, 3.1, 3.9, 4.6, 5.2]) {
      const x = cx + Math.cos(a) * 33.5, z = cz + Math.sin(a) * 33.5, rot = -(a + Math.PI / 2), y = this.h(x, z), k = 0.4 + ((a * 7) % 1) * 0.3;
      for (let j = 0; j < 6; j++) {
        const [px, pz] = World.L(x, z, rot, -3.75 + j * 1.5, 0);
        const hh = 1 + Math.abs(Math.sin(j * 1.7 + x)) * 2.2 * (k + 0.5);
        b.box(px, this.h(px, pz) + hh / 2, pz, 1.45, hh, 0.9, j % 2 ? st : stD, rot);
      }
      this.col.addBox(x, z, 4.5, 0.55, rot);
    }
    // alcova escondida (baú)
    {
      const x = -6, z = -122, y = this.h(x, z);
      b.box(x - 2.2, y + 1.4, z, 0.8, 2.8, 4.6, stD); this.col.addBox(x - 2.2, z, 0.45, 2.3, 0);
      b.box(x, y + 1.4, z - 2.2, 4.4, 2.8, 0.8, st); this.col.addBox(x, z - 2.2, 2.2, 0.45, 0);
      b.box(x + 0.6, y + 1.2, z + 2.2, 3.2, 2.4, 0.8, stD); this.col.addBox(x + 0.6, z + 2.2, 1.6, 0.45, 0);
    }
    // altar dos selos
    {
      const { x, z } = RUNES.altar, y = this.h(x, z);
      b.cyl(x, y + 0.15, z, 4.2, 0.3, stD, 12);
      b.cyl(x, y + 0.45, z, 3.1, 0.3, st, 12);
      b.cyl(x, y + 0.75, z, 2.0, 0.3, stD, 12);
      b.box(x, y + 1.3, z, 1.6, 0.8, 1.0, 0xbab4a6);
      this.col.addCircle(x, z, 1.4);
      const crystal = new THREE.Mesh(GEO.octa, new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.85 }));
      crystal.scale.set(0.6, 1.1, 0.6);
      crystal.position.set(x, y + 2.4, z);
      this.group.add(crystal);
      this.altarCrystal = crystal;
      this.animated.push((t) => { crystal.rotation.y = t * 0.8; crystal.position.y = y + 2.4 + Math.sin(t * 1.6) * 0.15; });
      this.addInteract({ id: 'altar', kind: 'altar', x, z, r: 3.2, name: 'Altar dos Selos' });
    }
    // mural das runas
    {
      // pedra entalhada com moldura, colunas e lintel; a face é uma pintura (medalhões + a charada explicada embaixo)
      const { x, z, rot } = RUNES.mural, y = this.h(x, z);
      b.box(x, y + 0.3, z, 7.2, 0.6, 1.6, stD, rot);                 // degrau
      b.box(x, y + 2.55, z, 6.0, 4.1, 0.6, 0x8f897d, rot);           // laje
      for (const s of [-1, 1]) {
        const [cx, cz] = World.L(x, z, rot, s * 3.25, 0.05);
        b.box(cx, y + 2.6, cz, 0.75, 4.6, 0.95, 0xa8a090, rot);      // colunas
        b.box(cx, y + 4.95, cz, 1.0, 0.3, 1.15, stD, rot);
        b.box(cx, y + 0.75, cz, 1.0, 0.3, 1.15, stD, rot);
      }
      b.box(x, y + 4.95, z, 7.4, 0.45, 1.25, stD, rot);              // lintel
      b.box(x, y + 5.4, z, 4.2, 0.45, 1.0, 0x9a9488, rot);           // frontão
      b.box(x, y + 5.78, z, 2.0, 0.32, 0.9, stD, rot);
      {
        const T = muralTextures();
        const face = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.76), new THREE.MeshLambertMaterial({ map: T.map, emissive: 0xffffff, emissiveMap: T.emissive, emissiveIntensity: 0.85 }));
        const [fx, fz] = World.L(x, z, rot, 0, 0.305);
        face.position.set(fx, y + 2.55, fz); face.rotation.y = rot; face.name = 'mural-face';
        this.group.add(face);
      }
      // brasas nos dois lados para iluminar à noite
      for (const s of [-1, 1]) { const [lx, lz] = World.L(x, z, rot, s * 3.25, 1.0); glow.box(lx, y + 1.05, lz, 0.3, 0.12, 0.3, 0xffb347, rot); }
      this.col.addBox(x, z, 3.7, 0.6, rot);
      const [ix, iz] = World.L(x, z, rot, 0, 1.6);
      this.addInteract({ id: 'mural', kind: 'mural', x: ix, z: iz, r: 3, name: 'Mural das Runas' });
    }
    // escombros
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(25, 35);
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      if (this.col.pointBlocked(px, pz, 1.2)) continue;
      const s = rng.range(0.4, 1.0);
      b.box(px, this.h(px, pz) + s * 0.3, pz, s, s * 0.6, s * 0.8, rng.chance(0.5) ? st : stD, rng.range(0, 3), rng.range(-0.3, 0.3));
    }
    this.lightSources.push({ x: cx, z: cz, y: 4, color: 0x5ef0ff, intensity: 0.6, night: 3, dist: 16, kind: 'altar' });
  }

  buildCircleAndRunes(b) {
    const { x: cx, z: cz } = RUNES.stones.estrela;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = cx + Math.cos(a) * 6, pz = cz + Math.sin(a) * 6, y = this.h(px, pz);
      b.box(px, y + 1.5, pz, 1.1, 3.2, 0.7, 0x8f8a82, -a + Math.PI / 2, 0.05 * Math.sin(i * 3));
      this.col.addCircle(px, pz, 0.75);
    }
    for (const [id, r] of Object.entries(RUNES.stones)) {
      const y = this.h(r.x, r.z);
      b.addGeo(OBELISK, r.x, y + 1.1, r.z, 1, 2.2, 1, 0, Math.PI / 4, 0, 0x6f6b75);
      b.box(r.x, y + 0.12, r.z, 1.6, 0.24, 1.6, 0x5c5862);
      const col = id === 'lua' ? 0x9fd0ff : id === 'estrela' ? 0xffe08a : 0xffb347;
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 });
      const glyph = new THREE.Mesh(id === 'lua' ? GEO.torus : id === 'estrela' ? GEO.octa : GEO.sphere, mat);
      glyph.scale.setScalar(id === 'lua' ? 0.7 : 0.55);
      glyph.position.set(r.x, y + 2.7, r.z);
      this.group.add(glyph);
      this.runes[id] = { glyph, mat, color: new THREE.Color(col), active: false, y: y + 2.7 };
      this.col.addCircle(r.x, r.z, 0.6);
      this.addInteract({ id: 'runa_' + id, kind: 'rune', rune: id, x: r.x, z: r.z, r: 2.8, name: r.name });
    }
    // árvore antiga da colina
    const { x, z } = { x: -36, z: -38 };
    const y = this.h(x, z);
    b.cyl(x, y + 2.5, z, 0.9, 5, 0x5a3b24, 8);
    for (const [ox, oy, oz, s] of [[0, 6.5, 0, 4.2], [2.2, 5.6, 1, 2.8], [-2, 5.8, -1.2, 3], [0.8, 7.8, -0.6, 2.6]]) {
      b.addGeo(GEO.ico, x + ox, y + oy, z + oz, s * 1.2, s, s * 1.2, 0, ox, 0, 0xd09a35);
    }
    this.col.addCircle(x, z, 1.1);
  }

  buildIsland(b) {
    const { x, z } = RUNES.vault, y = this.h(x, z);
    b.box(x, y + 0.5, z, 2.0, 1.0, 1.4, 0x5c5862);
    b.box(x, y + 1.15, z, 2.1, 0.3, 1.5, 0x77737d);
    b.box(x, y + 0.6, z + 0.72, 0.5, 0.5, 0.06, 0xd9b25f);
    // árvore dourada
    const tx = x - 3.2, tz = z - 1.5, ty = this.h(tx, tz);
    b.cyl(tx, ty + 2, tz, 0.5, 4, 0x6b4a2e, 8);
    b.addGeo(GEO.ico, tx, ty + 5, tz, 4.6, 3.6, 4.6, 0, 0.3, 0, 0xf0c95a);
    this.col.addCircle(tx, tz, 0.7);
    this.col.addBox(x, z, 1.05, 0.75, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    dome.position.set(x, y, z);
    this.group.add(dome);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beam.position.set(x, y + 30, z);
    this.group.add(beam);
    this.vault = { dome, beam, sealed: true, open: false };
    this.addInteract({ id: 'cofre', kind: 'vault', x, z, r: 3.2, name: 'Cofre do Bosque Oculto' });
  }

  setVaultUnsealed(on) {
    this.vault.sealed = !on;
    this.vault.dome.visible = !on;
    this.vault.beam.material.opacity = on && !this.vault.open ? 0.28 : 0;
  }

  // Entrada da Cripta (a "toca dos lobos" na Floresta Sussurrante): portal de pedra em arco, escadaria,
  // muralhas em ruínas dos lados, dois lobos de pedra de guarda, raízes caindo, ossos e braseiros.
  buildCryptEntrance(b, glow) {
    const { x, z } = CRYPT_MOUND.door, y = this.h(x, z + 1.5);
    const rock = 0x6e6a66, st = 0x8a857c, st2 = 0x7a756d, dk = 0x55504a, moss = 0x5a7a3a, root = 0x4a3826;
    // montes de pedra da colina (base)
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.rock(x + s * 3.6, y + 0.9 + i * 1.3, z - 1.2, 2.6 - i * 0.3, i % 2 ? rock : 0x7d7873, i + s, 0.75);
    b.rock(x, y + 6.2, z - 2.8, 7.4, 0x75716c, 0.4, 0.45);
    // escadaria de 3 degraus
    for (let k = 0; k < 3; k++) b.box(x, y + 0.12 + k * 0.22, z + 2.4 - k * 0.7, 5.2 - k * 0.4, 0.24, 0.8, k % 2 ? st : st2);
    // colunas + capitel + arco de aduelas
    for (const s of [-1, 1]) {
      b.box(x + s * 2.1, y + 0.35, z + 0.2, 1.2, 0.7, 1.2, dk);
      b.cyl(x + s * 2.1, y + 2.2, z + 0.2, 0.42, 3.2, st, 8);
      b.box(x + s * 2.1, y + 3.95, z + 0.2, 1.1, 0.35, 1.1, st2);
      this.col.addCircle(x + s * 2.1, z + 0.2, 0.7);
    }
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * (k / 8), ax = x + Math.cos(a) * 2.1, ay = y + 4.1 + Math.sin(a) * 1.5;
      b.box(ax, ay, z + 0.2, 0.75, 0.55, 1.0, k === 4 ? 0x9a948a : k % 2 ? st : st2, 0, 0, a - Math.PI / 2);
    }
    glow.box(x, y + 5.65, z + 0.72, 0.5, 0.5, 0.05, 0xffa040, Math.PI / 4); // pedra-chave com runa acesa
    b.box(x, y + 2.0, z - 0.5, 3.4, 4.0, 0.3, 0x0b0a10); // escuridão da porta
    b.box(x, y + 0.05, z + 0.6, 3.4, 0.1, 1.6, 0x55504a);
    // raízes e musgo caindo do arco
    for (let k = 0; k < 7; k++) { const rx = x - 1.8 + k * 0.6, len = 0.6 + ((k * 37) % 5) * 0.25; b.box(rx, y + 5.3 - len / 2, z + 0.75, 0.08, len, 0.08, k % 3 ? root : moss, 0, 0, (k - 3) * 0.06); }
    for (const s of [-1, 1]) b.box(x + s * 2.1, y + 3.7, z + 0.64, 0.9, 0.3, 0.2, moss);
    // muralhas em ruínas dos dois lados (com ameias, uma parte desabada)
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const wx = x + s * (3.6 + k * 2.1), wz = z - 0.3 - k * 0.55, wy = this.h(wx, wz), hh = (k === 2 ? 1.4 : 3.2 - k * 0.35);
        b.box(wx, wy + hh / 2, wz, 2.2, hh, 1.1, k % 2 ? st : st2, s * 0.25);
        if (k !== 2) for (const c of [-0.6, 0.6]) b.box(wx + c, wy + hh + 0.3, wz, 0.55, 0.6, 1.1, st, s * 0.25);
        if (k === 1) b.box(wx, wy + hh * 0.6, wz + 0.58, 1.6, 0.25, 0.1, moss, s * 0.25);
        this.col.addBox(wx, wz, 1.1, 0.6, -s * 0.25);
      }
      // pedras caídas da muralha
      for (let k = 0; k < 3; k++) b.rock(x + s * (7.2 + k * 0.9), this.h(x + s * 7.2, z + 1.6) + 0.25, z + 1.4 + k * 0.6, 0.7 - k * 0.12, st2, k * 1.7);
    }
    // lobos de pedra sentados nos pedestais (guardiões da toca)
    for (const s of [-1, 1]) {
      const wx = x + s * 3.9, wz = z + 2.3, wy = this.h(wx, wz), face = s * 0.35;
      b.box(wx, wy + 0.5, wz, 1.5, 1.0, 1.7, dk, face);
      const W0 = wy + 1.0, wolf = 0x8e8a84, wolfD = 0x6e6a64;
      b.addGeo(GEO.dodeca, wx, W0 + 0.6, wz - 0.25, 0.9, 1.0, 1.1, -0.35, face, 0, wolf); // peito/corpo sentado
      b.addGeo(GEO.dodeca, wx, W0 + 0.3, wz - 0.55, 1.0, 0.7, 0.9, 0, face, 0, wolfD); // quadril
      for (const k of [-1, 1]) b.box(wx + Math.cos(face) * k * 0.25, W0 + 0.35, wz + 0.25, 0.2, 0.7, 0.2, wolf, face); // patas da frente
      b.addGeo(GEO.dodeca, wx, W0 + 1.35, wz + 0.05, 0.62, 0.6, 0.66, 0, face, 0, wolf); // cabeça
      b.box(wx + Math.sin(face) * 0.38, W0 + 1.25, wz + 0.42, 0.32, 0.26, 0.5, wolfD, face); // focinho
      for (const k of [-1, 1]) b.cone(wx + Math.cos(face) * k * 0.2, W0 + 1.75, wz - 0.02, 0.1, 0.32, wolfD, 4, face); // orelhas
      glow.box(wx + Math.sin(face) * 0.3 + Math.cos(face) * 0.13, W0 + 1.42, wz + 0.36, 0.08, 0.05, 0.03, 0xffb040, face);
      glow.box(wx + Math.sin(face) * 0.3 - Math.cos(face) * 0.13, W0 + 1.42, wz + 0.36, 0.08, 0.05, 0.03, 0xffb040, face);
      b.cyl(wx - Math.sin(face) * 0.1, W0 + 0.15, wz - 0.85, 0.08, 0.6, wolfD, 5, 1.2, face); // cauda
      this.col.addCircle(wx, wz, 1.0);
    }
    // braseiros, ossos e uma coluna caída
    for (const s of [-1, 1]) {
      const bx = x + s * 2.9, bz = z + 3.8, by = this.h(bx, bz);
      b.cyl(bx, by + 0.45, bz, 0.12, 0.9, 0x3d2a1c, 6); b.cyl(bx, by + 0.95, bz, 0.38, 0.22, 0x3a3430, 8);
      glow.cone(bx, by + 1.35, bz, 0.26, 0.6, 0xffa040, 5);
      this.flames.push({ x: bx, y: by + 1.2, z: bz, kind: 'brasa' });
      this.lightSources.push({ x: bx, z: bz, y: by + 1.5, color: 0xff9a3a, intensity: 0, night: 3, dist: 9, flicker: true, kind: 'braseiro' });
    }
    for (let k = 0; k < 6; k++) { const bx = x - 2.5 + ((k * 53) % 50) / 10, bz = z + 3 + ((k * 31) % 30) / 10; b.box(bx, this.h(bx, bz) + 0.05, bz, 0.5, 0.08, 0.1, 0xe8dcc0, k * 0.9); }
    b.addGeo(GEO.sphere, x + 1.4, this.h(x + 1.4, z + 4.6) + 0.15, z + 4.6, 0.3, 0.26, 0.36, 0, 0.6, 0, 0xe8dcc0); // crânio de lobo
    { const cx = x - 5.6, cz = z + 4.4, cy = this.h(cx, cz); b.cyl(cx, cy + 0.38, cz, 0.38, 3.0, st, 8, 0, 0.4, Math.PI / 2); this.col.addCircle(cx, cz, 0.6); }
    this.col.addBox(x, z - 1.4, 1.8, 0.7, 0);
    this.addInteract({ id: 'cripta_porta', kind: 'door', x, z: z + 0.8, r: 3, name: 'Cripta do Vigia' });
    this.lightSources.push({ x, z: z + 1.5, y: y + 2.6, color: 0xff9a3a, intensity: 1.2, night: 4, dist: 12, flicker: true, kind: 'tocha' });
  }

  // Portal de pedra com redemoinho (Ermos, mapa 2, volta): pilares, aro, disco girando, feixe de luz, placa e seta.
  // k = tamanho (1 = o grande portal dos Ermos). Entra-se pelo lado sul (+z).
  buildPortalGate(b, group, px, pz, py, col, title, sub, interact, k = 1) {
    const W = 6.3 * k, T = 7.2 * k;
    b.box(px - W, py + 3.5 * k, pz, 1.4 * k, 7 * k, 1.4 * k, 0x4a4458); b.box(px + W, py + 3.5 * k, pz, 1.4 * k, 7 * k, 1.4 * k, 0x4a4458);
    b.addGeo(GEO.torus, px, py + T, pz, 12.5 * k, 12.5 * k, 6 * k, 0, 0, 0, 0x5a5468);
    this.col.addCircle(px - W, pz, 1.1 * k); this.col.addCircle(px + W, pz, 1.1 * k);
    this.col.addBox(px, pz - 0.6, 6 * k, 0.6, 0);
    const U = this.uniforms;
    const swirl = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, cA: { value: new THREE.Color(col.cA) }, cB: { value: new THREE.Color(col.cB) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 cA; uniform vec3 cB; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
          float s = sin(a*5.0 + r*14.0 - uTime*3.0)*0.5+0.5; float s2 = sin(a*3.0 - r*9.0 + uTime*2.0)*0.5+0.5;
          vec3 col = mix(cA, cB, s*s2); float alpha = smoothstep(1.0, 0.75, r) * (0.45 + 0.55*s) * (0.6+0.4*smoothstep(0.0,0.6,r));
          gl_FragColor = vec4(col*1.4, alpha);
          #include <colorspace_fragment>
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6 * k, 48), swirl);
    disc.position.set(px, py + T, pz);
    group.add(disc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * k, 2.4 * k, 30 * k, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: col.beam, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(px, py + 15 * k, pz);
    group.add(beam);
    this.addInteract({ x: px, z: pz + 3 * k, r: 6.5 * Math.max(0.75, k), ...interact });
    const sign = labelSprite(title, sub, col.sign);
    sign.position.set(px, py + 17 * k + 1, pz); group.add(sign);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col.sign) }));
    const ay = py + 12.6 * k + 0.5;
    arrow.rotation.x = Math.PI; arrow.position.set(px, ay, pz); group.add(arrow);
    this.animated.push((t) => { arrow.position.y = ay + Math.sin(t * 3) * 0.5; arrow.rotation.y = t * 1.5; });
    // portal parado: só o brilho pulsa (não gira)
    this.animated.push((t) => { disc.scale.setScalar(1 + Math.sin(t * 1.6) * 0.03); beam.material.opacity = 0.16 + Math.sin(t * 1.3) * 0.06; });
    return { disc, beam, x: px, z: pz, y: py + T };
  }

  buildPlateau(b, crystal) {
    const P = PLATEAU, rng = new Rng(mulberry32(55));
    const y = P.h;
    // pilares quebrados ao redor da arena
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      const px = 35 + Math.cos(a) * 22, pz = -164 + Math.sin(a) * 22;
      if (Math.abs(px - 35) < 6 && pz > -150) continue;
      const hh = rng.range(2, 6);
      b.cyl(px, this.h(px, pz) + hh / 2, pz, 0.8, hh, 0x56506a, 6);
      this.col.addCircle(px, pz, 1.0);
    }
    // cristais corrompidos
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(8, 34);
      const px = P.x + Math.cos(a) * r, pz = P.z + Math.sin(a) * r;
      if (dist2(px, pz, 35, -166) < 15 || (Math.abs(px - 35) < 6 && pz > -140)) continue;
      const s = rng.range(0.6, 1.8);
      const yy = this.h(px, pz);
      crystal.addGeo(GEO.octa, px, yy + s, pz, s * 0.7, s * 2.6, s * 0.7, rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3), rng.chance(0.5) ? 0xc04cff : 0x7a3cff);
      if (s > 1) this.col.addCircle(px, pz, s * 0.45);
    }
    // portal para o MAPA 2 (Planície do Guardião), no norte do topo do Planalto
    {
      const g = GUARDIAO.portalGo;
      this.portalGo = this.buildPortalGate(b, this.group, g.x, g.z, this.h(g.x, g.z), { cA: 0xb46bff, cB: 0x5ef0ff, beam: 0xa05cff, sign: '#d8b4ff' },
        'PLANÍCIE DO GUARDIÃO', 'Mapa 2 · Nível 5–18 · Chefe 25', { id: 'portal_guardiao', kind: 'portalGuardiao', area: 'world', name: 'Portal da Planície do Guardião' }, 0.72);
    }
    // muralha de pedra ao redor do planalto: a única entrada é a rampa com a Barreira do Selo
    {
      const R = P.r + 0.9, n = 60;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wx = P.x + Math.cos(a) * R, wz = P.z + Math.sin(a) * R;
        if (Math.abs(wx - 35) < 5.6 && wz > P.z) continue; // abertura da rampa (fechada pela barreira)
        const seg = (2 * Math.PI * R) / n + 0.35;
        const wy = Math.min(this.h(wx, wz), P.h);
        const hh = 2.6 + Math.sin(i * 1.7) * 0.6;
        b.box(wx, wy + hh / 2 - 0.4, wz, seg, hh, 1.1, i % 3 ? 0x4a4458 : 0x5a5266, -a + Math.PI / 2);
        if (i % 4 === 0) crystal.addGeo(GEO.octa, wx, wy + hh + 0.4, wz, 0.35, 1.0, 0.35, 0, a, 0, 0xc04cff);
        this.col.addBox(wx, wz, seg / 2, 0.75, -a + Math.PI / 2, { los: false, cam: false });
      }
    }
    // Portão dos Golens: dois golens de pedra ajoelhados seguram as portas; no meio, a Fechadura Mágica.
    // Com a Chave do Selo a fechadura gira, explode em purpurina e as portas afundam no chão.
    const gz = P.gateZ;
    const stoneM = new THREE.MeshLambertMaterial({ color: 0x8e889a, flatShading: true }), stoneD = new THREE.MeshLambertMaterial({ color: 0x66606f, flatShading: true });
    const runeM = new THREE.MeshBasicMaterial({ color: 0x8fe8ff }), eyeM = new THREE.MeshBasicMaterial({ color: 0x5a6a7a });
    const gateG = new THREE.Group(); gateG.position.set(35, y, gz); this.group.add(gateG);
    const mk = (geo, m, sx, sy, sz, x, yy, z, par = gateG, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, yy, z); o.rotation.set(rx, ry, rz); o.castShadow = true; par.add(o); return o; };
    const golems = [];
    for (const s of [-1, 1]) {
      const gg = new THREE.Group(); gg.position.set(s * 6.1, 0, 0.6); gateG.add(gg); golems.push(gg);
      mk(GEO.box, stoneD, 2.2, 0.6, 2.2, 0, 0.3, 0, gg); // base
      mk(GEO.dodeca, stoneM, 2.4, 2.6, 2.0, 0, 2.2, 0, gg); // tronco
      mk(GEO.dodeca, stoneM, 1.3, 1.1, 1.2, 0, 3.9, 0.15, gg); // cabeça
      for (const k of [-1, 1]) mk(GEO.box, eyeM, 0.22, 0.12, 0.05, k * 0.25, 3.95, 0.72, gg);
      mk(GEO.dodeca, stoneD, 1.1, 1.1, 1.1, s * 1.5, 3.2, 0, gg); // ombro
      mk(GEO.box, stoneM, 0.75, 2.2, 0.8, -s * 0.9, 2.7, 0.75, gg, 0, 0, s * 0.85); // braço segurando a porta
      mk(GEO.dodeca, stoneD, 0.9, 0.8, 0.9, -s * 1.75, 3.4, 0.8, gg); // mão na borda da porta
      for (const k of [-1, 1]) mk(GEO.box, stoneD, 0.9, 1.0, 1.4, k * 0.6, 0.75, 0.5, gg); // joelhos
      for (let k = 0; k < 3; k++) mk(GEO.box, runeM, 0.12, 0.5, 0.04, -0.5 + k * 0.5, 2.3 + (k % 2) * 0.3, 1.0, gg);
      for (let k = 0; k < 4; k++) mk(GEO.octa, new THREE.MeshBasicMaterial({ color: 0xc04cff }), 0.3, 0.6, 0.3, (k - 1.5) * 0.5, 2.0 + k * 0.6, -0.9, gg); // cristais nas costas
      this.col.addCircle(35 + s * 6.1, gz + 0.6, 1.5);
    }
    const doors = [];
    for (const s of [-1, 1]) {
      const d = new THREE.Group(); d.position.set(s * 2.35, 0, 0); gateG.add(d); doors.push(d);
      mk(GEO.box, stoneM, 4.6, 5.2, 0.7, 0, 2.6, 0, d);
      mk(GEO.box, stoneD, 4.7, 0.35, 0.8, 0, 5.1, 0, d);
      mk(GEO.box, stoneD, 4.7, 0.3, 0.8, 0, 0.15, 0, d);
      for (let k = 0; k < 3; k++) mk(GEO.box, runeM, 0.1, 3.4, 0.05, s * (0.6 + k * 1.1), 2.6, 0.37, d); // runas verticais
      mk(GEO.box, runeM, 3.6, 0.1, 0.05, s * 0.1, 4.4, 0.37, d);
      mk(GEO.box, runeM, 3.6, 0.1, 0.05, s * 0.1, 0.8, 0.37, d);
    }
    // Fechadura Mágica: anel dourado, disco de runas girando e o buraco da chave brilhando
    const lock = new THREE.Group(); lock.position.set(0, 2.7, 0.55); gateG.add(lock);
    const goldM = new THREE.MeshLambertMaterial({ color: 0xffd36b, emissive: 0x6a4a00, flatShading: true });
    mk(GEO.torus, goldM, 1.5, 1.5, 2.2, 0, 0, 0, lock);
    const runeDisc = new THREE.Group(); lock.add(runeDisc);
    mk(GEO.cyl12, new THREE.MeshBasicMaterial({ color: 0x2a1a4a }), 1.2, 0.08, 1.2, 0, 0, -0.02, runeDisc, Math.PI / 2);
    for (let k = 0; k < 8; k++) { const a2 = (k / 8) * Math.PI * 2; mk(GEO.box, new THREE.MeshBasicMaterial({ color: k % 2 ? 0xff7ae0 : 0x8fe8ff }), 0.1, 0.24, 0.04, Math.cos(a2) * 0.48, Math.sin(a2) * 0.48, 0.04, runeDisc, 0, 0, a2); }
    const keyM = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
    mk(GEO.cyl8, keyM, 0.22, 0.06, 0.22, 0, 0.1, 0.07, lock, Math.PI / 2); mk(GEO.box, keyM, 0.1, 0.28, 0.05, 0, -0.1, 0.07, lock);
    const lockGlow = mk(GEO.sphere, new THREE.MeshBasicMaterial({ color: 0xd36bff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), 2.2, 2.2, 0.6, 0, 0, 0, lock);
    const gateState = { t: -1, golems, doors, lock, runeDisc, lockGlow, eyeM };
    this.animated.push((t, dt) => {
      runeDisc.rotation.z = t * (gateState.t >= 0 ? 6 : 0.6);
      lockGlow.material.opacity = 0.18 + Math.sin(t * 2.4) * 0.08;
      if (gateState.t < 0) return;
      gateState.t += dt || 0.016;
      const k = gateState.t;
      lock.scale.setScalar(k < 0.7 ? 1 + k * 0.4 : Math.max(0.001, 1.28 - (k - 0.7) * 6)); // incha e some (explode)
      if (k > 0.9) lock.visible = false;
      const o = Math.min(1, Math.max(0, (k - 0.8) / 1.6)), e = o * o * (3 - 2 * o);
      doors[0].position.y = doors[1].position.y = -5.6 * e; // portas afundam no chão
      for (const g2 of golems) g2.rotation.x = 0.18 * e; // os golens se curvam
      eyeM.color.setRGB(0.35 + 0.65 * e, 0.42 + 0.5 * e, 0.48 + 0.52 * e);
      if (k > 2.6) { for (const d of doors) d.visible = false; gateState.t = -2; }
    });
    const gate = gateG;
    this.gate = { mesh: gate, collider: this.col.addBox(35, gz, 4.7, 0.45, 0, { los: true, cam: false }), open: false, anim: gateState };
    this.addInteract({ id: 'barreira', kind: 'gate', x: 35, z: gz + 2.2, r: 3.4, name: 'Portão dos Golens' });
    // árvores mortas
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(34, 52);
      const tx = P.x + Math.cos(a) * r, tz = P.z + Math.sin(a) * r;
      if (Math.abs(tx) > 150 || tz < -170) continue;
      const ty = this.h(tx, tz);
      b.cyl(tx, ty + 1.6, tz, 0.28, 3.2, 0x2e2633, 5);
      b.cyl(tx + 0.5, ty + 2.6, tz, 0.1, 1.6, 0x2e2633, 5, 0, a, 0.9);
      b.cyl(tx - 0.4, ty + 2.9, tz, 0.09, 1.3, 0x2e2633, 5, 0, a, -0.8);
      this.col.addCircle(tx, tz, 0.35, { los: false });
    }
  }

  // Planície do Guardião: ruínas, cristais, árvores mortas e o trono do chefe
  // MAPA 2 (área 'guardiao'): tudo vai para o grupo da Planície, com a altura do terreno dela
  buildPlain(b, crystal, glow) {
    const X = PLATEAU_EXT, rng = new Rng(mulberry32(909));
    this._hArea = 'guardiao'; // durante a construção: chão do mapa 2 (depois volta ao normal)
    const E = GUARDIAO.portalBack;
    const free = (x, z) => dist2(x, z, BOSS_SPAWN.x, BOSS_SPAWN.z) > BOSS_SPAWN.arena + 4 && dist2(x, z, PORTAL_FENDA.x, PORTAL_FENDA.z) > 12 && dist2(x, z, E.x, E.z - 6) > 16 && Math.abs(x - 35 - Math.sin(z * 0.02) * 6) > 5;
    for (let i = 0; i < 520; i++) {
      const x = rng.range(X.x0 + 16, X.x1 - 16), z = rng.range(X.z0 + 16, GUARDIAO.zSouth - 16);
      if (!free(x, z)) { rng.next(); continue; }
      const y = this.h(x, z), r = rng.next();
      if (r < 0.2) { // cristal corrompido
        const s = rng.range(0.6, 1.9);
        crystal.addGeo(GEO.octa, x, y + s, z, s * 0.7, s * 2.6, s * 0.7, rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3), rng.chance(0.5) ? 0xc04cff : 0x7a3cff);
        if (s > 1) this.col.addCircle(x, z, s * 0.45);
      } else if (r < 0.36) { // rocha
        const s = rng.range(0.8, 2.6);
        b.rock(x, y + s * 0.2, z, s, rng.chance(0.5) ? 0x56506a : 0x6a6478, rng.range(0, 6));
        if (s > 1.3) this.col.addCircle(x, z, s * 0.42);
      } else if (r < 0.5) { // árvore morta
        b.cyl(x, y + 1.7, z, 0.3, 3.4, 0x2e2633, 5);
        b.cyl(x + 0.5, y + 2.8, z, 0.1, 1.7, 0x2e2633, 5, 0, r * 40, 0.9);
        b.cyl(x - 0.4, y + 3.1, z, 0.09, 1.3, 0x2e2633, 5, 0, r * 40, -0.8);
        this.col.addCircle(x, z, 0.35, { los: false });
      } else if (r < 0.58) { // pilar quebrado
        const hh = rng.range(1.5, 6);
        b.cyl(x, y + hh / 2, z, 0.7, hh, rng.chance(0.5) ? 0x56506a : 0x8a8298, 6);
        this.col.addCircle(x, z, 0.85);
      } else if (r < 0.62) { // muro em ruína
        const rot = rng.range(0, 3.14), len = rng.range(4, 9), hh = rng.range(1, 2.6);
        b.box(x, y + hh / 2, z, len, hh, 0.9, 0x6a6478, rot);
        this.col.addBox(x, z, len / 2, 0.5, rot);
      } else if (r < 0.7) {
        b.addGeo(GEO.cone4, x, y + 0.3, z, 0.4, 0.6, 0.4, 0, rng.range(0, 6), 0, 0x6a5a7a);
      }
    }
    // colunata do caminho até o trono (começa depois do portal de chegada)
    for (let z = -216; z > BOSS_SPAWN.z + BOSS_SPAWN.arena + 6; z -= 16) {
      for (const s of [-1, 1]) {
        const x = 35 + Math.sin(z * 0.02) * 6 + s * 7, y = this.h(x, z), hh = 4 + Math.sin(z) * 1.5;
        b.cyl(x, y + hh / 2, z, 0.6, hh, 0x8a8298, 8); this.col.addCircle(x, z, 0.7);
        if (((z / 16) | 0) % 2 === 0) glow.cone(x, y + hh + 0.5, z, 0.25, 0.7, 0xc04cff, 5);
      }
    }
    // trono do Guardião: anel de pilares altos com cristais
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = BOSS_SPAWN.x + Math.cos(a) * (BOSS_SPAWN.arena + 2), z = BOSS_SPAWN.z + Math.sin(a) * (BOSS_SPAWN.arena + 2);
      if (Math.abs(x - 35) < 7 && z > BOSS_SPAWN.z) continue; // entrada ao sul
      if (Math.abs(x - 35) < 7 && z < BOSS_SPAWN.z) continue; // passagem para o portal ao norte
      const y = this.h(x, z), hh = 6 + (i % 3) * 2;
      b.cyl(x, y + hh / 2, z, 1, hh, 0x4a4458, 6); this.col.addCircle(x, z, 1.1);
      crystal.addGeo(GEO.octa, x, y + hh + 1.2, z, 0.6, 2.2, 0.6, 0, a, 0, 0xc04cff);
    }
    this.lightSources.push({ x: BOSS_SPAWN.x, y: this.h(BOSS_SPAWN.x, BOSS_SPAWN.z) + 3, z: BOSS_SPAWN.z, color: 0xc04cff, intensity: 2, night: 5, dist: 30, area: 'guardiao', kind: 'cristal' });
    // portal para os Ermos (mapa 3), atrás do trono
    this.portal = this.buildPortalGate(b, this.plainGroup, PORTAL_FENDA.x, PORTAL_FENDA.z, this.h(PORTAL_FENDA.x, PORTAL_FENDA.z), { cA: 0xff4fd8, cB: 0x5ef0ff, beam: 0xc04cff, sign: '#e7a6ff' },
      'ERMOS DA FENDA', 'Mapa 3 · recomendado nível 22', { id: 'portal_fenda', kind: 'portal', area: 'guardiao', name: 'Portal da Fenda' });
    // portal de volta ao Planalto (mapa 1), na chegada
    this.portalBack = this.buildPortalGate(b, this.plainGroup, E.x, E.z, this.h(E.x, E.z), { cA: 0xffd36b, cB: 0x7fe9ff, beam: 0xffc46b, sign: '#ffd98a' },
      'VALE DE ELDORIA', 'Mapa 1 · volta ao Planalto da Fenda', { id: 'portal_vale', kind: 'portalVale', area: 'guardiao', name: 'Portal para o Vale de Eldoria' }, 0.72);
    this.lightSources.push({ x: E.x, y: this.h(E.x, E.z) + 3, z: E.z + 2, color: 0xffc46b, intensity: 1.6, night: 4, dist: 16, area: 'guardiao', kind: 'cristal' });
    this._hArea = 'world'; // (sem delete: não deixa o objeto lento)
  }

  // animated: a fechadura explode em purpurina e as portas afundam (sem animação = já aberto ao carregar o jogo)
  openGate(animated = false) {
    if (this.gate.open) return;
    this.gate.open = true;
    this.col.remove(this.gate.collider);
    const A = this.gate.anim;
    if (animated && A) { A.t = 0; return; }
    if (A) { A.lock.visible = false; for (const d of A.doors) d.visible = false; for (const g of A.golems) g.rotation.x = 0.18; A.eyeM.color.setRGB(1, 0.92, 1); A.t = -2; }
    else this.gate.mesh.visible = false;
  }

  buildChests() {
    const all = [...CHESTS.map((c) => ({ ...c, area: 'world' })),
      { ...DUNGEON.finalChest, x: DUNGEON.finalChest.x + DX, z: DUNGEON.finalChest.z + DZ, area: 'cripta', hidden: true },
      { ...DUNGEON.alcoveChest, x: DUNGEON.alcoveChest.x + DX, z: DUNGEON.alcoveChest.z + DZ, area: 'cripta' },
      ...ERMOS.chests.map((c) => ({ ...c, x: c.x + ERMOS.offset.x, z: c.z + ERMOS.offset.z, area: 'ermos' }))];
    const wood = lambert(0x7a4b2a), gold = lambert(0xd9b25f), dark = lambert(0x4a2f1c);
    for (const c of all) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(GEO.box, wood); base.scale.set(1.1, 0.62, 0.74); base.position.y = 0.31;
      const band = new THREE.Mesh(GEO.box, gold); band.scale.set(1.14, 0.1, 0.78); band.position.y = 0.5;
      const lid = new THREE.Group(); lid.position.set(0, 0.62, -0.37);
      const lm = new THREE.Mesh(GEO.box, dark); lm.scale.set(1.12, 0.3, 0.76); lm.position.set(0, 0.15, 0.37);
      const lock = new THREE.Mesh(GEO.box, gold); lock.scale.set(0.2, 0.22, 0.06); lock.position.set(0, 0.05, 0.76);
      lid.add(lm, lock);
      g.add(base, band, lid);
      for (const m of [base, band, lm]) { m.castShadow = true; }
      const y = c.area === 'cripta' ? 0 : this.groundHeight(c.x, c.z, c.area);
      g.position.set(c.x, y, c.z);
      g.rotation.y = c.rot || 0;
      (c.area === 'cripta' ? this.dungeon : c.area === 'ermos' ? this.ermosGroup : this.group).add(g);
      if (c.hidden) g.visible = false;
      this.chests[c.id] = { group: g, lid, x: c.x, z: c.z, y, area: c.area, loot: c.loot, opened: false };
      this.col.addCircle(c.x, c.z, 0.65, { los: false });
      this.addInteract({ id: c.id, kind: 'chest', x: c.x, z: c.z, r: 2.4, area: c.area, name: 'Baú' });
    }
  }

  setChestClosed(id) {
    const c = this.chests[id];
    if (!c) return;
    c.opened = false; c.openT = undefined;
    c.lid.rotation.x = 0;
  }

  setChestOpened(id, instant = false) {
    const c = this.chests[id];
    if (!c) return;
    c.opened = true;
    if (instant) c.lid.rotation.x = -1.9;
    else { c.openT = 0; }
  }

  // ---------- muralha de castelo da vila: trechos de pedra com ameias, torres nos cantos e nos portões ----------
  buildCityWall(b, glow) {
    const P = VILLAGE.wallPoly, H = 3.6, T = 1.4, SEG = 4;
    const stones = [0x8f8a82, 0x857f77, 0x99948b, 0x7d786f], cap = 0x6f6a62, dark = 0x5e5a53;
    const rng = new Rng(mulberry32(41));
    const tower = (x, z, rot, s = 1) => {
      const y = this.h(x, z), w = 4.4 * s, th = 7.2 * s;
      b.box(x, y + th / 2 - 0.4, z, w, th, w, 0x8a857c, rot);
      b.box(x, y + th - 0.25, z, w + 0.6, 0.5, w + 0.6, cap, rot);
      for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const [px, pz] = World.L(x, z, rot, i * (w / 2), j * (w / 2));
        b.box(px, y + th + 0.45, pz, 0.9, 0.9, 0.9, cap, rot);
      }
      for (const j of [-1, 1]) { const [px, pz] = World.L(x, z, rot, 0, j * (w / 2 + 0.02)); b.box(px, y + th * 0.62, pz, 0.45, 1.0, 0.08, 0x1c1a18, rot); } // seteiras
      this.col.addBox(x, z, w / 2, w / 2, rot, { cam: false });
    };
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rot = Math.atan2(-uz, ux);
      // portões neste lado (aberturas)
      const gates = VILLAGE.wallGates.map((g) => ({ g, t: (g.x - ax) * ux + (g.z - az) * uz, off: Math.abs((g.x - ax) * -uz + (g.z - az) * ux) })).filter((o) => o.off < 3 && o.t > 0 && o.t < L);
      const open = (t) => gates.some((o) => Math.abs(t - o.t) < o.g.w / 2 + 2.2);
      const n = Math.ceil((L - 4) / SEG);
      for (let k = 0; k < n; k++) {
        const t0 = 2.2 + k * ((L - 4.4) / n), t1 = 2.2 + (k + 1) * ((L - 4.4) / n), tm = (t0 + t1) / 2, len = t1 - t0 + 0.05;
        if (open(tm)) continue;
        const x = ax + ux * tm, z = az + uz * tm, y = Math.min(this.h(ax + ux * t0, az + uz * t0), this.h(ax + ux * t1, az + uz * t1), this.h(x, z));
        b.box(x, y + H / 2 - 0.5, z, len, H + 1, T, rng.pick(stones), rot);
        b.box(x, y + H - 0.4, z, len, 0.3, T + 0.25, cap, rot);
        // ameias dos dois lados do passadiço
        for (let m = 0; m < Math.floor(len / 1.7); m++) {
          const tt = t0 + 0.85 + m * 1.7;
          for (const side of [-1, 1]) b.box(ax + ux * tt - uz * side * (T / 2 - 0.2), y + H + 0.15, az + uz * tt + ux * side * (T / 2 - 0.2), 0.85, 0.8, 0.35, dark, rot);
        }
        this.col.addBox(x, z, len / 2, T / 2 + 0.1, rot, { cam: false });
      }
      tower(ax, az, rot);
      // torres e arco dos portões
      for (const o of gates) {
        for (const sd of [-1, 1]) tower(ax + ux * (o.t + sd * (o.g.w / 2 + 2.2)), az + uz * (o.t + sd * (o.g.w / 2 + 2.2)), rot, 0.9);
        const gx = ax + ux * o.t, gz = az + uz * o.t, gy = this.h(gx, gz);
        b.box(gx, gy + 5.9, gz, o.g.w + 1.2, 1.3, T + 0.3, 0x8a857c, rot);
        for (let m = 0; m < Math.floor((o.g.w + 1) / 1.7); m++) { const tt = o.t - (o.g.w + 1) / 2 + 0.85 + m * 1.7; b.box(ax + ux * tt, gy + 6.95, az + uz * tt, 0.85, 0.8, T + 0.3, dark, rot); }
        for (const sd of [-1, 1]) { const tx = gx + ux * sd * (o.g.w / 2 - 0.3) - uz * 1.2, tz = gz + uz * sd * (o.g.w / 2 - 0.3) + ux * 1.2; glow.box(tx, gy + 3.4, tz, 0.3, 0.45, 0.3, 0xffb44a); this.lightSources.push({ x: tx, z: tz, y: gy + 3.6, color: 0xffa040, intensity: 0, night: 4, dist: 10, kind: 'tocha' }); }
      }
    }
  }

  // ---------- plantações (partes novas da vila): campos com fileiras, espantalhos, celeiros, moinhos e feno ----------
  buildFarms(b) {
    const L = World.L, rng = new Rng(mulberry32(58));
    const soil = SNOW ? 0xe9eef4 : 0x6b4a2e, soilD = SNOW ? 0xdfe6ee : 0x5a3d25;
    for (const f of VILLAGE.farms) {
      const { x, z, w, d, rot, crop } = f, y = this.h(x, z);
      b.box(x, y + 0.04, z, w + 0.8, 0.16, d + 0.8, soilD, rot);
      for (let r = -d / 2 + 1; r <= d / 2 - 1; r += 1.4) {
        const [rx, rz] = L(x, z, rot, 0, r), ry = this.h(rx, rz);
        b.box(rx, ry + 0.12, rz, w - 1, 0.18, 0.7, soil, rot); // leira
        if (crop === 'trigo') b.box(rx, ry + 0.55, rz, w - 1.6, 0.75, 0.62, rng.pick([0xd9b54a, 0xe2c25a, 0xcfa83e]), rot);
        else if (crop === 'milho') {
          b.box(rx, ry + 0.95, rz, w - 1.6, 1.6, 0.5, rng.pick([0x4f8a32, 0x5a9638, 0x467d2c]), rot);
          for (let c = -w / 2 + 1.5; c < w / 2 - 1.2; c += 2.1) { const [cxp, czp] = L(x, z, rot, c, r); b.box(cxp, ry + 1.85, czp, 0.22, 0.4, 0.22, 0xe8d36a, rot); }
        } else if (crop === 'horta') {
          for (let c = -w / 2 + 1.2; c < w / 2 - 0.8; c += 1.15) { const [cxp, czp] = L(x, z, rot, c, r); b.box(cxp, ry + 0.38, czp, 0.62, 0.42, 0.62, rng.pick([0x4f9a3a, 0x3e7f2e, 0x6aae48]), rot + c); if (rng.chance(0.25)) b.box(cxp, ry + 0.62, czp, 0.2, 0.2, 0.2, 0xd8432f); }
        } else if (crop === 'abobora') {
          b.box(rx, ry + 0.3, rz, w - 1.6, 0.3, 0.75, 0x4a8a34, rot);
          for (let c = -w / 2 + 1.5; c < w / 2 - 1; c += 1.9) { if (!rng.chance(0.7)) continue; const [cxp, czp] = L(x, z, rot, c, r); b.addGeo(GEO.dodeca, cxp, ry + 0.5, czp, 0.8, 0.6, 0.8, 0, 0, 0, rng.pick([0xe0731e, 0xd8641a, 0xeb8a2a])); }
        }
      }
      // espantalho
      if (crop === 'trigo' || crop === 'milho') {
        const [sx, sz] = L(x, z, rot, w * 0.18, 0), sy = this.h(sx, sz);
        b.box(sx, sy + 1.3, sz, 0.14, 2.6, 0.14, 0x5a3b24); b.box(sx, sy + 2.0, sz, 1.8, 0.12, 0.12, 0x5a3b24, rot);
        b.box(sx, sy + 1.75, sz, 0.75, 0.9, 0.45, 0x8a5a3a, rot); b.box(sx, sy + 2.45, sz, 0.45, 0.45, 0.45, 0xd8c070, rot);
        b.addGeo(GEO.cone8, sx, sy + 2.85, sz, 0.9, 0.5, 0.9, 0, rot, 0, SNOW ? 0xeef3f8 : 0x6a4a2a);
      }
    }
    // celeiros (vermelhos, com porta grande) e feno
    for (const br of VILLAGE.barns) {
      const { x, z, rot } = br, y = this.h(x, z), w = 11, d = 8;
      b.box(x, y + 0.2, z, w + 0.4, 0.45, d + 0.4, 0x7b766e, rot);
      b.box(x, y + 2.2, z, w, 4, d, 0x9a2f24, rot);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = L(x, z, rot, sx * (w / 2), sz * (d / 2)); b.box(px, y + 2.2, pz, 0.3, 4.05, 0.3, 0xeee4d0, rot); }
      b.addGeo(ROOF, x, y + 4.2, z, w + 1.2, 2.8, d + 1.2, 0, rot, 0, snowRoof(0x4a3a30));
      const [dx, dz] = L(x, z, rot, 0, d / 2 + 0.05); b.box(dx, y + 1.7, dz, 3.4, 3.2, 0.12, 0x6e2018, rot);
      b.box(dx, y + 1.7, dz, 3.5, 0.16, 0.16, 0xeee4d0, rot);
      this.col.addBox(x, z, w / 2 + 0.25, d / 2 + 0.25, rot, { cam: true });
      for (let k = 0; k < 5; k++) { const [hx, hz] = L(x, z, rot, -w / 2 + 1 + k * 1.6 + rng.range(-0.2, 0.2), d / 2 + 3.2 + (k % 2) * 1.3); const hy = this.h(hx, hz); b.cyl(hx, hy + 0.55, hz, 0.6, 1.4, SNOW ? 0xe8e2c8 : 0xd8c070, 8, 0, rng.range(0, 3), Math.PI / 2); this.col.addCircle(hx, hz, 0.75); }
    }
    // moinhos de vento
    for (const m of VILLAGE.mills) {
      const { x, z } = m, y = this.h(x, z);
      b.cyl(x, y + 4.2, z, 2.3, 8.4, 0xd8cfbc, 8);
      b.addGeo(GEO.cone8, x, y + 9.4, z, 5.4, 2.4, 5.4, 0, 0, 0, snowRoof(0x7a4b2a));
      const fx = x, fz = z + 2.45;
      b.box(fx, y + 7.2, fz, 0.5, 0.5, 0.6, 0x4a3426);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; b.box(fx + Math.cos(a) * 2.6, y + 7.2 + Math.sin(a) * 2.6, fz + 0.35, 5.0, 0.7, 0.08, 0xe8e0cc, 0, 0, a); b.box(fx + Math.cos(a) * 2.6, y + 7.2 + Math.sin(a) * 2.6, fz + 0.3, 5.0, 0.12, 0.12, 0x5a3b24, 0, 0, a); }
      b.box(x, y + 1.0, z + 2.32, 1.1, 2.0, 0.1, 0x5a3b24);
      this.col.addCircle(x, z, 2.4);
    }
  }

  // ---------- vegetação instanciada ----------
  buildVegetation() {
    const rng = new Rng(mulberry32(99));
    const trees = { pine: [], oak: [], birch: [], corrupt: [], snowpine: [] };
    const rocks = [], bushes = [], grass = [], flowers = [], reeds = [];
    const excl = [
      [VILLAGE.center.x, VILLAGE.center.z, 34], [-26, -102, 38], [-72, -78, 9], [CRYPT_MOUND.door.x, CRYPT_MOUND.door.z, 16],
      [LAKE.x, LAKE.z, LAKE.r + 2], [POND.x, POND.z, POND.r + 3], [35, -158, 31], [-36, -38, 4], [35, -120, 10],
    ];
    const inField = (x, z) => VILLAGE.farms.some((f) => { const c = Math.cos(f.rot), sn = Math.sin(f.rot), dx = x - f.x, dz = z - f.z; return Math.abs(dx * c - dz * sn) < f.w / 2 + 1 && Math.abs(dx * sn + dz * c) < f.d / 2 + 1; });
    const blocked = (x, z, pad = 0) => {
      for (const [ex, ez, er] of excl) if (dist2(x, z, ex, ez) < er + pad) return true;
      if (pad >= 0 ? inCamp(x, z, 3 + pad) : inCamp(x, z, pad - 1)) return true; // acampamento goblin (paliçada)
      if (pad >= 0 ? inVillage(x, z, 4 + pad) : inField(x, z)) return true; // muralha da vila: árvores só do lado de fora
      if (Math.abs(x) < 7 && z > 6 && z < 38) return true;
      return false;
    };
    const step = 3.1, lim = 168;
    const tgrid = new Map(), tkey = (i, j) => i * 4096 + j; // grade de 6 m para medir a distância entre árvores
    const treeAdd = (x, z) => { const k = tkey(Math.floor(x / 6), Math.floor(z / 6)); let a = tgrid.get(k); if (!a) tgrid.set(k, (a = [])); a.push(x, z); };
    const treeNear = (x, z, d) => {
      const i0 = Math.floor(x / 6), j0 = Math.floor(z / 6);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = tgrid.get(tkey(i, j)); if (a) for (let k = 0; k < a.length; k += 2) if ((a[k] - x) ** 2 + (a[k + 1] - z) ** 2 < d * d) return true; }
      return false;
    };
    for (let gx = -lim; gx < lim; gx += step) for (let gz = -lim; gz < lim; gz += step) {
      const x = gx + rng.range(0, step), z = gz + rng.range(0, step);
      if (blocked(x, z)) continue;
      const h = this.h(x, z);
      if (h < 0.35) continue;
      const rd = roadDistance(x, z);
      if (rd < 3.6) continue;
      const crd = distToPolyline(x, z, CRYPT_ROAD);
      if (crd < 9) continue; // estrada da cripta: árvores mais afastadas
      const slope = this.terrain.slopeAt(x, z);
      const df = distToPolyline(x, z, FOREST_PATH);
      const forest = (1 - smoothstep(22, 44, df)) * smoothstep(9, 16, dist2(x, z, CRYPT_MOUND.door.x, CRYPT_MOUND.door.z + 4));
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const mountain = smoothstep(135, 160, edge);
      const dp = dist2(x, z, 35, -158);
      const corrupt = 1 - smoothstep(32, 58, dp);
      const river = distToPolyline(x, z, RIVER);
      let density = 0.055 + forest * 0.42 + mountain * 0.35 + (river < 16 ? 0.08 : 0); // pacote 3: floresta mais aberta
      if (dist2(x, z, 14, -16) < 26) density *= 0.45; // prado aberto
      if (slope > 1.4) density *= 0.3;
      if (corrupt > 0.2) density *= 0.5;
      const roll = rng.next();
      // pacote 3: árvores longe da estrada (a estrada continua da mesma largura) e com espaço entre elas
      const treeOk = rd >= 7.5 && crd >= 12 && !treeNear(x, z, forest > 0.25 ? 4.2 : 2.8);
      if (roll < density && treeOk) {
        const s = rng.range(0.8, 1.35) * (forest > 0.5 ? 1.15 : 1);
        treeAdd(x, z);
        let type;
        if (corrupt > 0.3) type = 'corrupt';
        else if (mountain > 0.3 || h > 12) type = 'pine';
        else if (river < 15 && rng.chance(0.5)) type = 'birch';
        else if (forest > 0.4) type = rng.chance(0.55) ? 'pine' : rng.chance(0.85) ? 'oak' : 'birch';
        else type = rng.chance(0.75) ? 'oak' : 'pine';
        if (SNOW && type !== 'corrupt' && villageEdgeDist(x, z) < 48) type = 'snowpine'; // Natal: perto da vila, pinheiros nevados
        trees[type].push({ x, z, y: h, s, r: rng.range(0, 6.28), gold: type === 'oak' && rng.chance(forest > 0.4 ? 0.08 : 0.28) });
        this.col.addCircle(x, z, 0.38 * s, { los: false });
      } else if (roll >= density && roll < density + 0.05 && slope < 1.6 && rd >= 4.5) {
        bushes.push({ x, z, y: h, s: rng.range(0.6, 1.3) });
      } else if (roll > 0.985 || (mountain > 0.2 && roll > 0.93)) {
        const s = rng.range(0.7, 2.6) * (1 + mountain);
        rocks.push({ x, z, y: h, s, r: rng.range(0, 6) });
        if (s > 0.9) this.col.addCircle(x, z, s * 0.42);
      }
    }
    // grama, flores e juncos (sem colisão)
    for (let i = 0; i < 4200; i++) {
      const x = rng.range(-160, 160), z = rng.range(-160, 160);
      if (blocked(x, z, -6) && dist2(x, z, VILLAGE.center.x, VILLAGE.center.z) > 34) continue;
      const h = this.h(x, z);
      if (h < 0.2 || h > 14) continue;
      if (roadDistance(x, z) < 2.2 || dist2(x, z, VILLAGE.center.x, VILLAGE.center.z) < 12) continue;
      if (dist2(x, z, 35, -158) < 40) continue;
      if (rng.chance(0.15) && dist2(x, z, 14, -16) < 40) flowers.push({ x, z, y: h, c: rng.pick([0xf4f1e8, 0xffd84a, 0xff8fb0, 0x8fb5ff, 0xff6a4a]) });
      else grass.push({ x, z, y: h, s: rng.range(0.7, 1.4), r: rng.range(0, 6) });
    }
    for (let i = 0; i < 900; i++) {
      const x = rng.range(-170, 170), z = rng.range(-60, 80);
      const h = this.h(x, z);
      if (h > -0.35 && h < 0.35 && !this.onBridge(x, z)) reeds.push({ x, z, y: h, s: rng.range(0.7, 1.3) });
    }
    for (let i = 0; i < 160; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(LAKE.r - 3, LAKE.r + 2);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r, h = this.h(x, z);
      if (h > -0.4 && h < 0.4) reeds.push({ x, z, y: h, s: rng.range(0.8, 1.4) });
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const inst = (geo, list, colorFn, xf, cast = true) => {
      if (!list.length) return null;
      const mat = new THREE.MeshLambertMaterial({ flatShading: true });
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => {
        xf(dummy, o); dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, col.set(colorFn(o, i)));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = cast; m.receiveShadow = true;
      m.computeBoundingSphere();
      this.group.add(m);
      return m;
    };
    const vary = (base, o, amt = 0.12) => { col.set(base); const k = 1 + (Math.sin(o.x * 12.9 + o.z * 78.2) * 0.5) * amt; return col.multiplyScalar(k).getHex(); };
    // geometrias
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1, 6); trunk.translate(0, 0.5, 0);
    const pineCanopy = (() => {
      const parts = [0, 1, 2].map((i) => { const c = new THREE.ConeGeometry(1.5 - i * 0.38, 1.9, 7); c.translate(0, 1.8 + i * 1.05, 0); return c.toNonIndexed(); });
      return mergeSimple(parts);
    })();
    const oakCanopy = new THREE.IcosahedronGeometry(1.6, 0); oakCanopy.translate(0, 3.1, 0);
    const birchCanopy = new THREE.IcosahedronGeometry(1.1, 0); birchCanopy.scale(1, 1.4, 1); birchCanopy.translate(0, 3.4, 0);
    const allTrees = [...trees.pine.map((t) => ({ ...t, k: 'pine' })), ...trees.snowpine.map((t) => ({ ...t, k: 'pine' })), ...trees.oak.map((t) => ({ ...t, k: 'oak' })), ...trees.birch.map((t) => ({ ...t, k: 'birch' })), ...trees.corrupt.map((t) => ({ ...t, k: 'corrupt' }))];
    const simple = []; // Ultra realismo (ultra/trees.js): estas malhas simples somem e entram as árvores detalhadas, nas mesmas posições
    simple.push(inst(trunk, allTrees, (o) => (o.k === 'birch' ? 0xe8e4da : o.k === 'corrupt' ? 0x2e2633 : vary(0x5a3b24, o)),
      (d, o) => { d.position.set(o.x, o.y - 0.1, o.z); d.rotation.set(0, o.r, 0); d.scale.set(o.s, o.s * (o.k === 'pine' ? 1.6 : o.k === 'birch' ? 2.6 : 2.2), o.s); }));
    simple.push(inst(pineCanopy, trees.pine, (o) => vary(o.y > 12 ? 0x2e5a3c : 0x2f6b3a, o, 0.25), (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, o.r, 0); d.scale.setScalar(o.s); }));
    if (trees.snowpine.length) {
      // pinheiro nevado: o mesmo pinheiro (verde-escuro) com neve nas pontas de cada andar
      const snowCaps = mergeSimple([0, 1, 2].map((i) => { const c = new THREE.ConeGeometry((1.5 - i * 0.38) * 0.78, 1.0, 7); c.translate(0, 2.32 + i * 1.05, 0); return c.toNonIndexed(); }));
      const xf = (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, o.r, 0); d.scale.setScalar(o.s); };
      simple.push(inst(pineCanopy, trees.snowpine, (o) => vary(0x24503a, o, 0.2), xf));
      simple.push(inst(snowCaps, trees.snowpine, (o) => vary(0xf4f8fc, o, 0.04), xf));
    }
    simple.push(inst(oakCanopy, [...trees.oak, ...trees.corrupt], (o) => (o.gold ? vary(0xd09a35, o, 0.3) : trees.corrupt.includes(o) ? vary(0x6a3d8a, o, 0.3) : vary(0x4f8f3a, o, 0.3)),
      (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, o.r, 0); d.scale.set(o.s * 1.1, o.s, o.s * 1.1); }));
    simple.push(inst(birchCanopy, trees.birch, (o) => vary(0x8cc063, o, 0.25), (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, o.r, 0); d.scale.setScalar(o.s); }));
    inst(new THREE.DodecahedronGeometry(0.5, 0), rocks, (o) => vary(0x8b857b, o, 0.25), (d, o) => { d.position.set(o.x, o.y + o.s * 0.15, o.z); d.rotation.set(o.r, o.r * 2, 0); d.scale.set(o.s, o.s * 0.7, o.s * 0.9); });
    simple.push(inst(new THREE.IcosahedronGeometry(0.7, 0), bushes, (o) => vary(0x4f8a3a, o, 0.3), (d, o) => { d.position.set(o.x, o.y + 0.3 * o.s, o.z); d.rotation.set(0, o.x, 0); d.scale.set(o.s, o.s * 0.75, o.s); }));
    const tuft = (() => {
      const parts = [[0, 0], [0.18, 0.1], [-0.15, 0.12]].map(([ox, oz], i) => { const c = new THREE.ConeGeometry(0.07, 0.55 - i * 0.08, 3); c.translate(ox, 0.25, oz); return c.toNonIndexed(); });
      return mergeSimple(parts);
    })();
    inst(tuft, grass, (o) => vary(0x7fb552, o, 0.3), (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, o.r, 0); d.scale.setScalar(o.s); }, false);
    const flowerGeo = new THREE.OctahedronGeometry(0.13, 0); flowerGeo.translate(0, 0.28, 0);
    inst(flowerGeo, flowers, (o) => o.c, (d, o) => { d.position.set(o.x, o.y, o.z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); }, false);
    const reedGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.3, 3); reedGeo.translate(0, 0.65, 0);
    inst(reedGeo, reeds, (o) => vary(0x8a9a4a, o, 0.3), (d, o) => { d.position.set(o.x, o.y - 0.1, o.z); d.rotation.set(Math.sin(o.x) * 0.15, 0, Math.cos(o.z) * 0.15); d.scale.setScalar(o.s); }, false);
    this.vegUltra = { trees, bushes, simple: simple.filter(Boolean) };
    this.stats = { trees: allTrees.length, rocks: rocks.length, bushes: bushes.length, grass: grass.length };
  }

  // ---------- masmorra: a fortaleza do Vigia ----------
  buildDungeon() {
    const b = new Batch(), glow = new Batch();
    const rects = DUNGEON.rects;
    const H = DUNGEON.wallH || 3.6, T = 1.2;
    const rng = new Rng(mulberry32(77));
    const FLOORS = {
      pedra: [0x4a4650, 0x3f3b45, 0x534e58, 0x46424c],
      patio: [0x55524a, 0x4c4a42, 0x5c5850, 0x4f5046, 0x48503f],
      madeira: [0x5a4232, 0x4e3a2c, 0x634836, 0x553e2f],
      salao: [0x3c3846, 0x45404f, 0x36323f, 0x4a4454],
      cripta: [0x3a3940, 0x323138, 0x403e46, 0x2f2e34],
    };
    // chão em lajotas (madeira = tábuas compridas)
    for (const r of rects) {
      const pal = FLOORS[r.floor] || FLOORS.pedra, plank = r.floor === 'madeira';
      const sx = plank ? 4 : 2, sz = 2;
      for (let x = r.x0; x < r.x1 - 0.01; x += sx) for (let z = r.z0; z < r.z1 - 0.01; z += sz) {
        const w = Math.min(sx, r.x1 - x), d = Math.min(sz, r.z1 - z);
        b.box(DX + x + w / 2, -0.1, DZ + z + d / 2, w - 0.06, 0.2, d - 0.06, rng.pick(pal));
      }
    }
    // paredes: cada borda menos as aberturas para retângulos vizinhos
    const touching = (r, edge) => {
      const out = [];
      for (const o of rects) {
        if (o === r) continue;
        if (edge === 'n' && Math.abs(o.z1 - r.z0) < 0.01) out.push([Math.max(r.x0, o.x0), Math.min(r.x1, o.x1)]);
        if (edge === 's' && Math.abs(o.z0 - r.z1) < 0.01) out.push([Math.max(r.x0, o.x0), Math.min(r.x1, o.x1)]);
        if (edge === 'w' && Math.abs(o.x1 - r.x0) < 0.01) out.push([Math.max(r.z0, o.z0), Math.min(r.z1, o.z1)]);
        if (edge === 'e' && Math.abs(o.x0 - r.x1) < 0.01) out.push([Math.max(r.z0, o.z0), Math.min(r.z1, o.z1)]);
      }
      return out.filter(([a, c]) => c - a > 0.01);
    };
    const pieces = (a0, a1, gaps) => {
      let segs = [[a0, a1]];
      for (const [g0, g1] of gaps) {
        const next = [];
        for (const [s0, s1] of segs) {
          if (g1 <= s0 || g0 >= s1) { next.push([s0, s1]); continue; }
          if (g0 > s0) next.push([s0, g0]);
          if (g1 < s1) next.push([g1, s1]);
        }
        segs = next;
      }
      return segs.filter(([s0, s1]) => s1 - s0 > 0.05);
    };
    const wallCol = [0x5d5866, 0x544f5d, 0x625c6a, 0x58535f];
    let torchI = 0;
    // parede em fiadas de pedra + ameias no topo + tochas a cada 10 m
    const addWall = (cx, cz, w, d, horiz) => {
      const len = horiz ? w : d, rows = 3, rh = H / rows;
      for (let i = 0; i < rows; i++) b.box(DX + cx, rh * (i + 0.5), DZ + cz, horiz ? w : w + (i % 2) * 0.08, rh - 0.04, horiz ? d + (i % 2) * 0.08 : d, rng.pick(wallCol));
      b.box(DX + cx, 0.35, DZ + cz, horiz ? w : w + 0.3, 0.7, horiz ? d + 0.3 : d, 0x48444f); // rodapé
      b.box(DX + cx, H + 0.12, DZ + cz, horiz ? w + 0.1 : w + 0.4, 0.24, horiz ? d + 0.4 : d + 0.1, 0x6e6878);
      for (let t = 0.6; t < len - 0.4; t += 2.2) {
        const mx = horiz ? cx - w / 2 + t : cx, mz = horiz ? cz : cz - d / 2 + t;
        b.box(DX + mx, H + 0.75, DZ + mz, horiz ? 1.1 : T, 1.0, horiz ? T : 1.1, 0x67616f);
      }
      this.col.addBox(DX + cx, DZ + cz, w / 2, d / 2, 0, { cam: true });
      for (let t = 5; t < len - 3; t += 10) {
        torchI++;
        const tx = horiz ? cx - w / 2 + t : cx, tz = horiz ? cz : cz - d / 2 + t;
        b.box(DX + tx, 2.1, DZ + tz, 0.22, 0.6, 0.22, 0x3a2a1e);
        glow.cone(DX + tx, 2.65, DZ + tz, 0.16, 0.45, 0xffa040, 5);
        this.lightSources.push({ x: DX + tx, z: DZ + tz, y: 2.7, color: 0xff9a3a, intensity: 2.2, night: 0, dist: 16, flicker: true, kind: 'tocha', area: 'cripta' });
        if (torchI % 3 === 0) this.flames.push({ x: DX + tx, y: 2.7, z: DZ + tz, kind: 'tocha', area: 'cripta' });
      }
    };
    // arco de pedra sobre cada passagem (só visual, acima da cabeça)
    const arch = (cx, cz, span, horiz) => {
      const w = horiz ? span + 1.6 : T + 0.5, d = horiz ? T + 0.5 : span + 1.6;
      b.box(DX + cx, H - 0.55, DZ + cz, w, 1.1, d, 0x6a6474);
      b.box(DX + cx, H - 1.25, DZ + cz, horiz ? span : T + 0.2, 0.3, horiz ? T + 0.2 : span, 0x5a5464);
    };
    const arches = new Set();
    for (const r of rects) {
      for (const [s0, s1] of pieces(r.x0, r.x1, touching(r, 'n'))) addWall((s0 + s1) / 2, r.z0 - T / 2, s1 - s0 + T, T, true);
      for (const [s0, s1] of pieces(r.x0, r.x1, touching(r, 's'))) addWall((s0 + s1) / 2, r.z1 + T / 2, s1 - s0 + T, T, true);
      for (const [s0, s1] of pieces(r.z0, r.z1, touching(r, 'w'))) addWall(r.x0 - T / 2, (s0 + s1) / 2, T, s1 - s0 + T, false);
      for (const [s0, s1] of pieces(r.z0, r.z1, touching(r, 'e'))) addWall(r.x1 + T / 2, (s0 + s1) / 2, T, s1 - s0 + T, false);
      for (const [g0, g1] of touching(r, 'n')) { const k = `n${(g0 + g1) / 2},${r.z0}`; if (!arches.has(k)) { arches.add(k); arch((g0 + g1) / 2, r.z0, g1 - g0, true); } }
      for (const [g0, g1] of touching(r, 'w')) { const k = `w${r.x0},${(g0 + g1) / 2}`; if (!arches.has(k)) { arches.add(k); arch(r.x0, (g0 + g1) / 2, g1 - g0, false); } }
    }
    // colunas
    for (const [x, z] of DUNGEON.pillars) {
      b.box(DX + x, 0.3, DZ + z, 2.0, 0.6, 2.0, 0x4f4a58);
      b.cyl(DX + x, H / 2, DZ + z, 0.8, H, 0x6a6474, 8);
      b.box(DX + x, H - 0.2, DZ + z, 1.9, 0.4, 1.9, 0x5c5666);
      this.col.addCircle(DX + x, DZ + z, 0.9);
    }
    // tapetes (passadeiras vermelhas do salão e do trono)
    for (const [x, z, w, d] of DUNGEON.carpets || []) {
      b.box(DX + x, 0.012, DZ + z, w, 0.02, d, 0x6a1e24);
      b.box(DX + x - w / 2 + 0.3, 0.02, DZ + z, 0.25, 0.02, d, 0xc89a3a);
      b.box(DX + x + w / 2 - 0.3, 0.02, DZ + z, 0.25, 0.02, d, 0xc89a3a);
    }
    // estandartes pendurados nas paredes do salão e do trono
    for (const r of rects.filter((q) => q.floor === 'salao')) {
      for (let z = r.z0 + 8; z < r.z1 - 6; z += 12) for (const x of [r.x0 + 0.1, r.x1 - 0.1]) {
        b.box(DX + x, H - 2.0, DZ + z, 0.08, 3.0, 1.6, 0x7a1e2a);
        b.box(DX + x, H - 2.1, DZ + z, 0.1, 0.7, 0.7, 0xd8b04a);
      }
    }
    // móveis e restos, todos com colisão
    const P = { // [largura, altura, profundidade]
      sarcofago: [1.3, 1.0, 2.7], beliche: [2.8, 1.6, 1.4], mesa: [5, 0.9, 1.6], estante: [2.8, 2.2, 0.9],
      bigorna: [1.2, 0.9, 0.7], forja: [3.0, 1.5, 2.2], caixas: [1.6, 1.4, 1.6], barril: [1, 1.1, 1], poco: [3.2, 0.9, 3.2], estatua: [2.4, 1.0, 2.4],
    };
    for (const [k, x, z, rot] of DUNGEON.props || []) {
      const [w, h, d] = P[k] || [1, 1, 1], X = DX + x, Z = DZ + z;
      if (k === 'sarcofago') {
        b.box(X, 0.5, Z, w, 1.0, d, 0x77707f, rot); b.box(X, 1.08, Z, w + 0.1, 0.16, d + 0.1, 0x8a8394, rot);
      } else if (k === 'beliche') {
        for (const y of [0.45, 1.35]) { b.box(X, y, Z, w, 0.18, d, 0x5e4430, rot); b.box(X, y + 0.14, Z, w - 0.3, 0.12, d - 0.2, 0x8a7a64, rot); }
        b.box(X, 0.9, Z, w, 1.8, 0.12, 0x4a3424, rot);
      } else if (k === 'mesa') {
        b.box(X, 0.85, Z, w, 0.14, d, 0x6a4c34, rot); b.box(X, 0.4, Z, w - 0.6, 0.8, 0.25, 0x4a3424, rot);
      } else if (k === 'estante') {
        b.box(X, 1.1, Z, w, 2.2, d, 0x4e3a2a, rot);
        for (let i = 0; i < 3; i++) b.box(X - 0.9 + i * 0.9, 1.6, Z + 0.3, 0.12, 1.4, 0.12, 0x9aa0a8, 0, 0.15); // lanças encostadas
      } else if (k === 'bigorna') {
        b.box(X, 0.35, Z, 0.6, 0.7, 0.5, 0x3a3a40); b.box(X, 0.78, Z, w, 0.22, d, 0x4a4a52);
      } else if (k === 'forja') {
        b.box(X, 0.75, Z, w, 1.5, d, 0x5a4a44); glow.box(X, 1.52, Z, w - 0.8, 0.06, d - 0.8, 0xff6a2a);
        this.lightSources.push({ x: X, z: Z, y: 2, color: 0xff6a2a, intensity: 2.4, night: 0, dist: 14, flicker: true, kind: 'tocha', area: 'cripta' });
      } else if (k === 'caixas') {
        b.box(X, 0.4, Z, 0.8, 0.8, 0.8, 0x7a5a3a, 0.2); b.box(X + 0.5, 0.35, Z + 0.4, 0.7, 0.7, 0.7, 0x6e5034, -0.3); b.box(X + 0.2, 1.05, Z + 0.1, 0.6, 0.6, 0.6, 0x84643f, 0.5);
      } else if (k === 'barril') {
        b.cyl(X, 0.55, Z, 0.5, 1.1, 0x6a4a30, 8); b.cyl(X, 0.3, Z, 0.53, 0.08, 0x3a3a3a, 8); b.cyl(X, 0.85, Z, 0.53, 0.08, 0x3a3a3a, 8);
      } else if (k === 'poco') {
        b.cyl(X, 0.45, Z, 1.6, 0.9, 0x6a6474, 12); b.cyl(X, 0.86, Z, 1.15, 0.06, 0x1a2a3a, 12);
      } else if (k === 'estatua') {
        b.box(X, 0.5, Z, w, 1.0, d, 0x5c5666); b.cyl(X, 2.4, Z, 0.55, 2.8, 0x77707f, 8); b.cyl(X, 4.1, Z, 0.4, 0.7, 0x77707f, 8);
        b.box(X + 0.7, 3.0, Z, 0.15, 3.4, 0.15, 0x8a8394); // espada da estátua
      }
      this.col.addBox(X, Z, w / 2 + 0.05, d / 2 + 0.05, rot);
    }
    // ossos espalhados
    for (let i = 0; i < 90; i++) {
      const r = rng.pick(rects);
      const x = rng.range(r.x0 + 1, r.x1 - 1), z = rng.range(r.z0 + 1, r.z1 - 1);
      b.box(DX + x, 0.06, DZ + z, rng.range(0.15, 0.5), 0.08, 0.08, 0xd8d0bd, rng.range(0, 3));
    }
    // cristais da fenda (marcam as áreas de cada grupo)
    for (const sp of DUNGEON.spawners) {
      if (sp.type === 'vigia') continue;
      b.cyl(DX + sp.x - 4, 0.5, DZ + sp.z + 3, 0.35, 1.0, 0x3d3a42, 6);
      glow.cone(DX + sp.x - 4, 1.25, DZ + sp.z + 3, 0.35, 0.6, 0x5ef0ff, 6);
    }
    // saída
    const ex = DX + DUNGEON.exit.x, ez = DZ + DUNGEON.exit.z;
    glow.addGeo(GEO.torus, ex, 0.05, ez, 2.4, 2.4, 2.4, Math.PI / 2, 0, 0, 0x5ef0ff);
    this.addInteract({ id: 'cripta_saida', kind: 'exit', x: ex, z: ez, r: 2.4, area: 'cripta', name: 'Saída da Cripta' });
    const m = b.build(vcLambert(), { name: 'cripta_estatico' });
    if (m) this.dungeon.add(m);
    const g = glow.build(new THREE.MeshBasicMaterial({ vertexColors: true }), { castShadow: false, receiveShadow: false });
    if (g) this.dungeon.add(g);
  }

  // ---------- atualização ----------
  update(dt, t, night, focus) {
    if (this.area === 'confins' && focus) this.confins.update(focus.x, focus.z);
    this.uniforms.uTime.value = t;
    for (const f of this.animated) f(t, dt);
    this.glowMat.color.setScalar(0.35 + night * 0.65);
    for (const id in this.chests) {
      const c = this.chests[id];
      if (c.openT !== undefined && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 2.5); c.lid.rotation.x = -1.9 * (1 - (1 - c.openT) ** 3); }
    }
    for (const id in this.runes) {
      const r = this.runes[id];
      const target = r.active ? 1 : 0.32 + Math.sin(t * 2 + r.y) * 0.05;
      r.mat.opacity += (target - r.mat.opacity) * Math.min(1, dt * 4);
      r.glyph.rotation.y = t * (r.active ? 1.6 : 0.4);
      r.glyph.position.y = r.y + Math.sin(t * 1.4 + r.y) * 0.12;
    }
    if (this.vault && !this.vault.sealed && !this.vault.open) this.vault.beam.material.opacity = 0.22 + Math.sin(t * 2) * 0.08;
    if (this.ultraOn && this._ultraBuilt) for (const m of ULTRA_MODS) m.update?.(this, dt, t, night, focus);
  }
}

// Junta geometrias não indexadas simples (somente position/normal)
function mergeSimple(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
