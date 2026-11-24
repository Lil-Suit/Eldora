import * as THREE from 'three';
import { fbm, vnoise, smoothstep, clamp, lerp, dist2 } from './noise.js';
import { Batch, GEO, vcLambert, labelSprite } from './batch.js';
import { Rng, mulberry32 } from '../core/rng.js';
import { ERMOS, CONFINS } from '../config/world.js';
import { W, wReset, wLerp } from './terrain.js';
const CONFINS_REQ = CONFINS.reqLevel;

// Ermos da Fenda: segundo mapa (680x680 m), gerado por ruído. Sem cidades; só um acampamento de retorno.
const OX = ERMOS.offset.x, OZ = ERMOS.offset.z, HALF = ERMOS.half, L = ERMOS.locations;

export function ermosRawHeight(lx, lz) {
  let h = fbm(lx * 0.007 + 31, lz * 0.007 - 17, 4) * 9 + 2.2;
  // morros e mesas
  const ridge = 1 - Math.abs(vnoise(lx * 0.012 + 5, lz * 0.012 + 9));
  h += smoothstep(0.8, 0.97, ridge) * 6;
  // lago central
  const lake = 1 - smoothstep(32, 78, dist2(lx, lz, L.lago.x, L.lago.z));
  h = lerp(h, -3.2, lake);
  // trono partido: platô alto ao norte
  const throne = 1 - smoothstep(60, 95, dist2(lx, lz, L.trono.x, L.trono.z));
  h = lerp(h, 9 + fbm(lx * 0.05, lz * 0.05, 2) * 0.3, throne);
  // falésias: cristas altas de pedra a leste
  const fal = 1 - smoothstep(60, 110, dist2(lx, lz, L.falesias.x, L.falesias.z));
  if (fal > 0) h += fal * smoothstep(0.55, 0.85, 1 - Math.abs(vnoise(lx * 0.03 + 3, lz * 0.03))) * 9;
  // acampamento de entrada plano
  // acampamento no alto de um morro: de lá se vê o mapa inteiro (Mirante dos Exilados)
  const dc = dist2(lx, lz, ERMOS.entry.x, ERMOS.entry.z - 10);
  const hill = 1 - smoothstep(40, 120, dc);
  h = Math.max(h, lerp(h, 11 + fbm(lx * 0.03, lz * 0.03, 2) * 1.2, hill * hill * (3 - 2 * hill)));
  const camp = 1 - smoothstep(26, 42, dc);
  h = lerp(h, 11.5, camp);
  // bordas: paredões de rocha
  const e = Math.max(Math.abs(lx), Math.abs(lz)) / HALF;
  h += smoothstep(0.9, 1, e) * 34;
  return h;
}

export class Ermos {
  constructor() {
    const N = ERMOS.grid, S = ERMOS.size;
    this.N = N; this.step = S / N; this.half = S / 2;
    const V = N + 1;
    this.h = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) this.h[j * V + i] = ermosRawHeight(-this.half + i * this.step, -this.half + j * this.step);
  }

  // altura em coordenadas do MUNDO (com o deslocamento)
  heightAt(x, z) { return this.heightLocal(x - OX, z - OZ); }
  heightLocal(lx, lz) {
    const V = this.N + 1;
    let gx = (lx + this.half) / this.step, gz = (lz + this.half) / this.step;
    gx = clamp(gx, 0, this.N - 0.0001); gz = clamp(gz, 0, this.N - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = this.h[j * V + i], b = this.h[j * V + i + 1], c = this.h[(j + 1) * V + i], d = this.h[(j + 1) * V + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  slopeLocal(lx, lz) {
    const dx = this.heightLocal(lx + 1, lz) - this.heightLocal(lx - 1, lz), dz = this.heightLocal(lx, lz + 1) - this.heightLocal(lx, lz - 1);
    return Math.hypot(dx, dz) / 2;
  }
  inBounds(x, z) { return Math.abs(x - OX) < ERMOS.playable && Math.abs(z - OZ) < ERMOS.playable; }

  // wt (opcional, só no Ultra realismo): pesos de superfície e cor de base (ver W em terrain.js).
  // A beira d'água violeta o shader do Ultra faz por pixel; aqui a base é o chão normal.
  colorLocal(lx, lz, h, slope, out, wt) {
    const n = fbm(lx * 0.05, lz * 0.05, 2) * 0.5 + 0.5;
    if (h < ERMOS.waterLevel + 0.3 && !wt) return out.set(0x6a5a86).lerp(new THREE.Color(0x8a78a8), n * 0.5);
    if (slope > 1.1 || h > 14) { out.set(0x4c4458).lerp(new THREE.Color(0x6a6078), n); if (wt) { wReset(wt, W.ROCK, 1); wt[8] = out.r; wt[9] = out.g; wt[10] = out.b; } return out; }
    const ash = smoothstep(-0.2, 0.3, fbm(lx * 0.012 + 3, lz * 0.012, 3));
    out.set(0x3e4a3a).lerp(new THREE.Color(0x5a4c62), ash);       // grama escura → cinza violeta
    if (wt) { wReset(wt, W.GRASS, 1); wLerp(wt, W.ASH, ash * 0.85); const bq = 1 - smoothstep(60, 120, dist2(lx, lz, L.bosque.x, L.bosque.z)); wLerp(wt, W.FOREST, bq * 0.5); }
    // sem manchas redondas por região: o chão escurece aos poucos para o norte (onde os monstros são mais fortes)
    const north = smoothstep(380, -420, lz), blot = smoothstep(0.1, 0.6, fbm(lx * 0.006 - 7, lz * 0.006 + 2, 3));
    out.lerp(new THREE.Color(0x6a6466), 0.25 * blot * (1 - north));
    out.lerp(new THREE.Color(0x4a3452), 0.5 * north);
    if (dist2(lx, lz, ERMOS.entry.x, ERMOS.entry.z) < 26) { out.lerp(new THREE.Color(0x6a5a40), 0.5); if (wt) wLerp(wt, W.DIRT, 0.6); } // terra do acampamento
    out.multiplyScalar(0.9 + n * 0.2);
    if (wt) { wt[8] = out.r; wt[9] = out.g; wt[10] = out.b; wt[11] = 0; }
    return out;
  }

  buildTerrainMesh() {
    const N = this.N, V = N + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    const c = new THREE.Color();
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, lx = -this.half + i * this.step, lz = -this.half + j * this.step, h = this.h[k];
      pos[k * 3] = lx + OX; pos[k * 3 + 1] = h; pos[k * 3 + 2] = lz + OZ;
      this.colorLocal(lx, lz, h, this.slopeLocal(lx, lz), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = new Uint32Array(N * N * 6);
    let p = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, cc = a + V, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true; m.name = 'ermos-terreno';
    return m;
  }

  // Monta tudo: terreno, água, vegetação morta, cristais, ruínas, acampamento. Colisões vão para world.col.
  build(world) {
    const group = new THREE.Group(); group.name = 'ermos'; group.visible = false;
    group.add(this.buildTerrainMesh());
    // água violeta
    const water = new THREE.Mesh(new THREE.PlaneGeometry(ERMOS.size, ERMOS.size).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5a3a8a, transparent: true, opacity: 0.78 }));
    water.position.set(OX, ERMOS.waterLevel, OZ);
    group.add(water);
    const rng = new Rng(mulberry32(777));
    const col = world.col;
    // vegetação e rochas em blocos de 85 m (para o celular só desenhar o que está na tela)
    const CH = 85, chunks = new Map();
    const chunk = (lx, lz) => {
      const k = Math.floor((lx + HALF) / CH) + ',' + Math.floor((lz + HALF) / CH);
      if (!chunks.has(k)) chunks.set(k, { veg: new Batch(), glow: new Batch(), tv: new Batch(), list: [] });
      return chunks.get(k);
    };
    const H = (lx, lz) => this.heightLocal(lx, lz);
    const clear = (lx, lz) => dist2(lx, lz, ERMOS.entry.x, ERMOS.entry.z) > 30 && H(lx, lz) > ERMOS.waterLevel + 0.4 && this.slopeLocal(lx, lz) < 0.9 && Math.abs(lx) < ERMOS.playable - 6 && Math.abs(lz) < ERMOS.playable - 6;
    for (let gx = -HALF + 6; gx < HALF - 6; gx += 8) for (let gz = -HALF + 6; gz < HALF - 6; gz += 8) {
      const lx = gx + rng.range(-3, 3), lz = gz + rng.range(-3, 3);
      if (!clear(lx, lz)) continue;
      const dens = fbm(lx * 0.02 + 40, lz * 0.02 - 11, 2) * 0.5 + 0.5;
      const forest = dist2(lx, lz, L.bosque.x, L.bosque.z) < 110 ? 0.45 : 0;
      const y = H(lx, lz), c = chunk(lx, lz);
      const r = rng.next();
      if (r < 0.1 + dens * 0.25 + forest) {
        // árvore morta: tronco escuro e copa violeta rala
        const s = rng.range(0.8, 1.5);
        // (vai para o fim da malha do bloco: o Ultra realismo esconde só essa parte e põe a árvore detalhada no lugar)
        c.tv.cyl(lx + OX, y + 2.2 * s, lz + OZ, 0.28 * s, 4.4 * s, 0x2e2630, 6);
        const br = rng.range(0, 6);
        c.tv.addGeo(GEO.cyl6, lx + OX + Math.sin(br) * 0.8 * s, y + 3.6 * s, lz + OZ + Math.cos(br) * 0.8 * s, 0.22 * s, 2 * s, 0.22 * s, 0.8, br, 0, 0x2e2630);
        let crown = 0;
        if (rng.chance(0.6)) { crown = rng.chance(0.5) ? 0x4a3060 : 0x3a3a4a; c.tv.addGeo(GEO.ico, lx + OX, y + 4.8 * s, lz + OZ, 2.6 * s, 2 * s, 2.6 * s, 0, br, 0, crown); }
        c.list.push(0, lx + OX, y, lz + OZ, s, br, crown);
        col.addCircle(lx + OX, lz + OZ, 0.42 * s, { los: false });
      } else if (r < 0.2 + dens * 0.3) {
        const s = rng.range(0.8, 2.4);
        c.veg.rock(lx + OX, y + s * 0.25, lz + OZ, s, rng.chance(0.5) ? 0x4c4458 : 0x5a5264, rng.range(0, 6));
        if (s > 1.4) col.addCircle(lx + OX, lz + OZ, s * 0.4);
      } else if (r < 0.26 || (dist2(lx, lz, L.cristais.x, L.cristais.z) < 105 && r < 0.42)) {
        // aglomerado de cristais da Fenda
        const s = rng.range(0.5, 1.4), hue = rng.chance(0.5) ? 0xc04cff : 0x5ef0ff;
        for (let k = 0; k < 3; k++) c.glow.addGeo(GEO.octa, lx + OX + rng.range(-0.8, 0.8), y + s * 1.2, lz + OZ + rng.range(-0.8, 0.8), s * 0.6, s * 2.4, s * 0.6, rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3), hue);
        if (s > 1) col.addCircle(lx + OX, lz + OZ, s * 0.5);
      } else if (r < 0.3) {
        const ry = rng.range(0, 6);
        c.tv.addGeo(GEO.cone4, lx + OX, y + 0.3, lz + OZ, 0.5, 0.7, 0.5, 0, ry, 0, 0x6a5a4a); // arbusto seco
        c.list.push(1, lx + OX, y, lz + OZ, 1, ry, 0x6a5a4a);
      }
    }
    // ruínas: Ossário e Trono
    const ruin = new Batch();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, lx = L.ossario.x + Math.cos(a) * 40, lz = L.ossario.z + Math.sin(a) * 40;
      const hh = rng.range(2, 6), y = H(lx, lz);
      ruin.box(lx + OX, y + hh / 2, lz + OZ, 1.6, hh, 1.6, 0x8a8078, rng.range(0, 1));
      col.addBox(lx + OX, lz + OZ, 0.8, 0.8, 0);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, lx = L.trono.x + Math.cos(a) * 45, lz = L.trono.z + Math.sin(a) * 45;
      const hh = rng.range(4, 10), y = H(lx, lz);
      ruin.cyl(lx + OX, y + hh / 2, lz + OZ, 1.1, hh, 0x5a4a62, 8);
      col.addCircle(lx + OX, lz + OZ, 1.2);
    }
    { // trono partido
      const TZ = L.trono.z - 30, y = H(0, TZ);
      ruin.box(OX, y + 1, OZ + TZ, 8, 2, 6, 0x4a3e52); ruin.box(OX, y + 5, OZ + TZ - 3, 8, 8, 1.4, 0x4a3e52, 0, 0, 0.12);
      ruin.box(OX - 3.4, y + 3, OZ + TZ, 1.2, 3, 5, 0x4a3e52); ruin.box(OX + 3.4, y + 2.2, OZ + TZ, 1.2, 2.4, 5, 0x4a3e52);
      col.addBox(OX, OZ + TZ - 1, 4.2, 3.2, 0);
    }
    // acampamento dos exilados (ponto de retorno): fogueira, barracas, portal de volta
    const E = ERMOS.entry, ey = H(E.x, E.z);
    const camp = new Batch();
    for (const [dx, dz, ry, c] of [[-9, -4, 0.5, 0x6a4a3a], [9, -6, -0.6, 0x5a4a6a], [-7, 8, 2.4, 0x4a5a3a]]) {
      camp.cone(E.x + dx + OX, ey + 1.4, E.z + dz + OZ, 2.4, 2.8, c, 4, ry);
      col.addCircle(E.x + dx + OX, E.z + dz + OZ, 2);
    }
    camp.cyl(E.x + OX, ey + 0.2, E.z - 3 + OZ, 1.1, 0.4, 0x4a4040, 8);
    const glow = new Batch();
    glow.cone(E.x + OX, ey + 0.9, E.z - 3 + OZ, 0.6, 1.4, 0xffa040, 6);
    // portal de volta (anel com espiral)
    const pz = E.z + 14;
    camp.box(E.x - 4 + OX, ey + 3, pz + OZ, 1, 6, 1, 0x4a4458); camp.box(E.x + 4 + OX, ey + 3, pz + OZ, 1, 6, 1, 0x4a4458);
    camp.addGeo(GEO.torus, E.x + OX, ey + 5.6, pz + OZ, 8.5, 8.5, 5, 0, 0, 0, 0x5a5468);
    col.addCircle(E.x - 4 + OX, pz + OZ, 0.8); col.addCircle(E.x + 4 + OX, pz + OZ, 0.8);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ color: 0x9f6bff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    disc.position.set(E.x + OX, ey + 5.6, pz + OZ);
    group.add(disc);
    world.animated.push((t) => { disc.material.opacity = 0.45 + Math.sin(t * 2) * 0.15; disc.scale.setScalar(1 + Math.sin(t * 1.6) * 0.03); });
    world.lightSources.push({ x: E.x + OX, y: ey + 1.4, z: E.z - 3 + OZ, color: 0xffa040, intensity: 2.2, night: 7, dist: 18, flicker: true, area: 'ermos', kind: 'fogueira' });
    { const sg = labelSprite('PLANÍCIE DO GUARDIÃO', 'Mapa 2 · portal de volta', '#9fd8ff'); sg.position.set(E.x + OX, ey + 11, pz + OZ); sg.scale.set(7, 2.2, 1); group.add(sg); }
    world.addInteract({ id: 'portal_volta', kind: 'portalBack', x: E.x + OX, z: pz + OZ - 1.5, r: 3.6, area: 'ermos', name: 'Portal para a Planície do Guardião' });
    // baús
    // portal para os Confins, atrás do Trono Partido
    {
      const P = ERMOS.portal, py = H(P.x, P.z);
      ruin.box(P.x - 5 + OX, py + 3.5, P.z + OZ, 1.2, 7, 1.2, 0x3a3448); ruin.box(P.x + 5 + OX, py + 3.5, P.z + OZ, 1.2, 7, 1.2, 0x3a3448);
      ruin.addGeo(GEO.torus, P.x + OX, py + 6.4, P.z + OZ, 10.5, 10.5, 6, 0, 0, 0, 0x4a4458);
      col.addCircle(P.x - 5 + OX, P.z + OZ, 0.9); col.addCircle(P.x + 5 + OX, P.z + OZ, 0.9);
      const d2 = new THREE.Mesh(new THREE.CircleGeometry(4.6, 44), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      d2.position.set(P.x + OX, py + 6.4, P.z + OZ);
      group.add(d2);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 26, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.set(P.x + OX, py + 13, P.z + OZ);
      group.add(beam);
      world.animated.push((t) => { d2.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.15; d2.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03); beam.material.opacity = 0.14 + Math.sin(t * 1.3) * 0.06; });
      world.addInteract({ id: 'portal_confins', kind: 'portalConfins', x: P.x + OX, z: P.z + OZ + 2.5, r: 6, area: 'ermos', name: 'Portal dos Confins' });
      const sign = labelSprite('CONFINS DE ELDORIA', `Próxima região · recomendado nível ${CONFINS_REQ}`, '#ffc46b');
      sign.position.set(P.x + OX, py + 14, P.z + OZ); group.add(sign);
    }
    // Mirante dos Exilados: beirada de pedra ao norte do acampamento, de frente para o vale
    {
      const mz = ERMOS.entry.z - 44, my = H(0, mz);
      ruin.box(OX, my + 0.2, OZ + mz, 14, 0.4, 5, 0x6a6458);
      for (let i = -3; i <= 3; i++) { ruin.cyl(OX + i * 2.2, my + 0.8, OZ + mz - 2.2, 0.18, 1.2, 0x4a4458, 6); }
      ruin.box(OX, my + 1.35, OZ + mz - 2.2, 14, 0.18, 0.25, 0x5a5468);
      col.addBox(OX, OZ + mz - 2.3, 7, 0.3, 0);
      const sg = labelSprite('MIRANTE DOS EXILADOS', 'Vista dos Ermos da Fenda', '#ffd36b'); sg.position.set(OX - 9, my + 5, OZ + mz); sg.scale.set(8, 2.5, 1); group.add(sg);
    }
    // marcos que se veem de longe: feixes no Trono e no Vale dos Cristais, torre no Ossário
    const beamAt = (x, z, color, hgt, rad) => {
      const y = H(x, z), b = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.6, hgt, 14, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      b.position.set(x + OX, y + hgt / 2, z + OZ); group.add(b);
      world.animated.push((t) => { if (group.visible) b.material.opacity = 0.16 + Math.sin(t * 1.2 + x) * 0.06; });
    };
    for (const [dx, dz, s] of [[0, 0, 1.6], [14, 10, 1.1], [-12, 8, 1.2], [6, -14, 0.9]]) {
      const x = L.cristais.x + dx, z = L.cristais.z + dz, y = H(x, z);
      ruin.addGeo(GEO.octa, x + OX, y + 9 * s, z + OZ, 3 * s, 18 * s, 3 * s, 0.1, dx, 0, 0x6a5ac8);
      col.addCircle(x + OX, z + OZ, 2.2 * s);
    }
    { // torre partida do Ossário
      const x = L.ossario.x, z = L.ossario.z, y = H(x, z);
      ruin.cyl(x + OX, y + 11, z + OZ, 3.2, 22, 0x8a8078, 8); ruin.cyl(x + OX + 0.6, y + 24, z + OZ, 2.6, 5, 0x8a8078, 8, 0, 0, 0.2);
      col.addCircle(x + OX, z + OZ, 3.4);
    }
    // monta as malhas
    const mats = { veg: vcLambert(), glow: world.crystalMat };
    for (const c of chunks.values()) {
      // árvores e arbustos no fim da malha (mesma malha, mesmo desenho): o Ultra realismo corta essa parte (setDrawRange)
      let nv = 0; for (const g of c.veg.parts) nv += g.attributes.position.count;
      c.veg.parts.push(...c.tv.parts);
      const m1 = c.veg.build(mats.veg, { name: 'ermos-veg' }); if (m1) { group.add(m1); m1.userData.ultraVeg = { start: nv, list: new Float32Array(c.list) }; }
      const m2 = c.glow.build(mats.glow, { castShadow: false, name: 'ermos-cristal' }); if (m2) group.add(m2);
    }
    for (const [b, m] of [[ruin, vcLambert()], [camp, vcLambert()], [glow, world.glowMat]]) { const mesh = b.build(m, { name: 'ermos-estrutura' }); if (mesh) group.add(mesh); }
    return group;
  }
}

export const ERMOS_OFFSET = { x: OX, z: OZ };
