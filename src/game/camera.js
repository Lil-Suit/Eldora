import * as THREE from 'three';
import { clamp, damp } from '../engine/noise.js';

// Câmera em terceira pessoa elevada: segue suave, orbita, evita paredes e treme em impactos.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;            // 0 = câmera ao sul olhando para o norte
    this.pitch = 0.9;
    this.dist = 13;
    this.minDist = 6; this.maxDist = 22;
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this.shakeT = 0; this.shakeAmp = 0;
    this.sens = 1;
    this.curDist = 13;
    this.mode = 'follow';
  }

  snap(pos) { this.smooth.copy(pos); this.target.copy(pos); }

  shake(amp = 0.3, dur = 0.25) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, dur); }

  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }

  update(dt, focus, world, input, settings) {
    const sens = (settings?.camSens ?? 1);
    if (input) {
      this.yaw -= input.drag.dx * 0.005 * sens;
      this.pitch = clamp(this.pitch + input.drag.dy * 0.004 * sens * (settings?.invertY ? -1 : 1), -0.3, 1.3);
      this.yaw -= input.touch.camDx * 0.008 * sens;
      this.pitch = clamp(this.pitch + input.touch.camDy * 0.006 * sens, -0.3, 1.3);
      if (input.held('camLeft')) this.yaw += dt * 1.8 * sens;
      if (input.held('camRight')) this.yaw -= dt * 1.8 * sens;
      this.dist = clamp(this.dist + input.wheel * 1.2 + input.touch.pinch * 0.05, this.minDist, this.maxDist);
    }
    // mira de tiro: câmera mais baixa e perto (atrás do ombro), como nos jogos de tiro
    if ((this.aimK || 0) > 0.5) this.pitch = clamp(this.pitch, -0.2, 0.6);
    this.target.set(focus.x, focus.y + 1.3, focus.z);
    this.smooth.x = damp(this.smooth.x, this.target.x, 9, dt);
    this.smooth.y = damp(this.smooth.y, this.target.y, 6, dt);
    this.smooth.z = damp(this.smooth.z, this.target.z, 9, dt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ox = Math.sin(this.yaw) * cp, oz = Math.cos(this.yaw) * cp;
    // colisão com estruturas: encurta a distância
    this.extraSmooth = damp(this.extraSmooth || 0, this.extraDist || 0, 2, dt);
    let want = (this.dist + this.extraSmooth) * (1 - 0.35 * (this.aimK || 0));
    if (world) {
      const t = world.col.segment(this.smooth.x, this.smooth.z, this.smooth.x + ox * want, this.smooth.z + oz * want, 'cam');
      if (t >= 0) want = Math.max(this.minDist * 0.7, want * t - 0.6);
    }
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 3, dt);
    let cx = this.smooth.x + ox * this.curDist, cz = this.smooth.z + oz * this.curDist;
    let cy = this.smooth.y + sp * this.curDist;
    if (world) {
      const g = world.groundHeight(cx, cz);
      if (cy < g + 0.5) cy = g + 0.5;
    }
    // câmera baixa (perto do chão) = olha para cima: o ponto de mira sobe para mostrar o céu
    const lookUp = this.pitch < 0.35 ? (0.35 - this.pitch) * 9 : 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 4;
      cx += (Math.random() - 0.5) * a; cy += (Math.random() - 0.5) * a; cz += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    let lx = this.smooth.x, ly = this.smooth.y + lookUp, lz = this.smooth.z;
    // mira de tiro: câmera por cima do ombro direito (o herói sai do meio e a mira fica livre)
    const ak = this.aimK || 0;
    if (ak > 0.001) {
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), sh = 1.1 * ak, up = 0.55 * ak;
      cx += rx * sh; cz += rz * sh; lx += rx * sh; lz += rz * sh; cy += up; ly += up;
    }
    // conversa/loja com um NPC: câmera atrás do vendedor (pegando um pedaço do ombro dele) mostrando o rosto do herói
    this.shotK = damp(this.shotK || 0, this.shot ? 1 : 0, this.shot ? 4 : 6, dt);
    if (this.shot) this.lastShot = this.shot;
    const S = this.lastShot;
    const fov0 = this.camera.userData.fov0 || this.camera.fov;
    let fov = fov0;
    if (S && this.shotK > 0.002) {
      const dx = S.p.x - S.v.x, dz = S.p.z - S.v.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; // vendedor → herói
      const rx = -uz, rz = ux; // direita de quem olha do vendedor para o herói
      const sx = S.v.x - ux * 1.5 + rx * 1.0, sz = S.v.z - uz * 1.5 + rz * 1.0, sy = S.v.y + 1.78;
      // mira um pouco à direita do rosto: o rosto fica à esquerda da tela (a janela da loja fica à direita)
      const tall = innerHeight > innerWidth;
      const off = S.side ?? (tall ? 0.2 : innerWidth < 1000 ? 0.85 : 0.55);
      const tx = S.p.x + rx * off, ty = S.p.y + (S.head ?? 2.1) - (tall ? 0.75 : 0), tz = S.p.z + rz * off;
      const k = this.shotK * this.shotK * (3 - 2 * this.shotK);
      cx += (sx - cx) * k; cy += (sy - cy) * k; cz += (sz - cz) * k;
      lx += (tx - lx) * k; ly += (ty - ly) * k; lz += (tz - lz) * k;
      // zoom: o herói aparece da cintura para cima, com o rosto bem visível
      fov = fov0 + ((tall ? 44 : 30) - fov0) * k;
    }
    // primeira pessoa: a câmera fica nos olhos do herói e olha para onde a câmera giraria (some com a conversa/loja)
    this.fpK = damp(this.fpK || 0, settings?.firstPerson && !this.shot ? 1 : 0, 8, dt);
    if (this.fpK > 0.002) {
      const f = this.forward(), el = clamp((0.35 - this.pitch) * 1.1, -1.2, 1.1), ce = Math.cos(el);
      const ex = focus.x + f.x * 0.25, ey = focus.y + 2.25, ez = focus.z + f.z * 0.25;
      const k = this.fpK;
      cx += (ex - cx) * k; cy += (ey - cy) * k; cz += (ez - cz) * k;
      lx += (ex + f.x * ce * 10 - lx) * k; ly += (ey + Math.sin(el) * 10 - ly) * k; lz += (ez + f.z * ce * 10 - lz) * k;
      fov = fov + (Math.max(fov, 70) - fov) * k;
    }
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(lx, ly, lz);
  }

  // Ponto no plano horizontal (altura y) sob o cursor
  groundPoint(nx, ny, y, out) {
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
    const o = this.camera.position;
    const d = v.sub(o).normalize();
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (y - o.y) / d.y;
    if (t < 0) return null;
    return out.set(o.x + d.x * t, y, o.z + d.z * t);
  }
}
