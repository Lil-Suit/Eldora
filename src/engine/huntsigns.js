import * as THREE from 'three';
import { HUNTS, huntRange } from '../config/hunts.js';
import { ERMOS, CONFINS } from '../config/world.js';

// Placa de madeira com estandarte vermelho em cada Hunt: "⚔ HUNT — nome — Nível a–b"
function bannerTexture(h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, '#8a1c22'); g.addColorStop(1, '#4a0c12');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 0); x.lineTo(256, 270); x.lineTo(128, 320); x.lineTo(0, 270); x.closePath(); x.fill();
  x.strokeStyle = '#e8c06a'; x.lineWidth = 8; x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#ffe2a0';
  x.font = 'bold 74px serif'; x.fillText('⚔', 128, 92);
  x.font = 'bold 44px Georgia, serif'; x.fillText('HUNT', 128, 148);
  x.fillStyle = '#fff4dc'; x.font = 'bold 25px Georgia, serif';
  const name = h.name.replace(/^Hunt (dos |das |do |da )?/i, '');
  x.fillText(name.length > 15 ? name.slice(0, 15) : name, 128, 196);
  const [a, b] = huntRange(h);
  x.fillStyle = '#ffd36b'; x.font = 'bold 28px sans-serif'; x.fillText(`Nv ${a === b ? a : a + '–' + b}`, 128, 244);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class HuntSigns {
  constructor(scene, world) {
    this.world = world; this.list = []; this.t = 0;
    if (typeof document === 'undefined') return;
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), gold = new THREE.MeshLambertMaterial({ color: 0xd8b25a });
    const post = new THREE.CylinderGeometry(0.16, 0.2, 4.2, 7), bar = new THREE.BoxGeometry(2.4, 0.14, 0.14), knob = new THREE.SphereGeometry(0.16, 8, 6);
    for (const h of HUNTS) {
      const off = h.area === 'ermos' ? ERMOS.offset : h.area === 'confins' ? CONFINS.offset : { x: 0, z: 0 };
      const gx = h.x + off.x, gz = h.z + off.z;
      const grp = new THREE.Group();
      const p = new THREE.Mesh(post, wood); p.position.y = 2.1; grp.add(p);
      const b = new THREE.Mesh(bar, wood); b.position.y = 3.95; grp.add(b);
      for (const s of [-1.2, 1.2]) { const k = new THREE.Mesh(knob, gold); k.position.set(s, 3.95, 0); grp.add(k); }
      const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(h), transparent: true, alphaTest: 0.3 });
      const ban = new THREE.Group(); ban.position.set(0, 2.65, 0);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), mat); f.position.z = 0.03; ban.add(f);
      const bk = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), mat); bk.rotation.y = Math.PI; bk.position.z = -0.03; ban.add(bk);
      grp.add(ban);
      grp.position.set(gx, 0, gz);
      grp.userData = { area: h.area, ban };
      scene.add(grp);
      this.list.push(grp);
    }
    this.place(true);
  }
  // altura do chão (os Confins carregam blocos aos poucos: confere de tempos em tempos)
  place(all = false, P = null) {
    for (const g of this.list) {
      if (!all && P && (g.userData.area !== P.area || Math.hypot(g.position.x - P.pos.x, g.position.z - P.pos.z) > 160)) continue;
      const y = this.world.groundHeight(g.position.x, g.position.z, g.userData.area);
      if (Number.isFinite(y)) g.position.y = y;
    }
  }
  update(dt, P, time) {
    this.t -= dt;
    if (this.t <= 0) { this.t = 2; this.place(false, P); }
    for (const g of this.list) {
      g.visible = g.userData.area === P.area;
      if (g.visible) g.userData.ban.rotation.y = Math.sin(time * 1.3 + g.position.x) * 0.08;
    }
  }
}
