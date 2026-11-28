// =============================================================
// Heróis com modelo 3D de verdade (Quaternius, CC0): corpo com esqueleto, roupas (skins) e animações.
// Os arquivos ficam em chars/ ao lado do index.html. Se não carregarem (ex.: arquivo aberto direto do disco),
// o jogo continua com o boneco antigo (buildHero).
// rig.kind = 'skinhero' → anim.js chama rig.update(estado, dt).
// =============================================================
import * as THREE from 'three';
import { RoyalCape } from './cape.js';
import { BladeTrail, bladeSegment } from './bladetrail.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from '../../vendor/three/addons/utils/SkeletonUtils.js';
import { buildHero, buildWeapon, mergeRigColors } from './models.js';
// junta as peças de uma arma (opacas, mesma luz) numa malha só — só peças sem filhos, direto no grupo
function mergeWeapon(g) { try { const r = { root: g }; mergeRigColors(r, 0); } catch (e) { /* fica como estava */ } }
import { gearTheme } from '../config/itemthemes.js';
import { RARITY_INDEX, RARITIES } from '../config/balance.js';
import { HERO_SKINS, skinOf } from '../config/heroskins.js';
import { VERSION } from '../version.js';

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const files = {};   // nome → Promise<gltf>
const ready = {};   // nome → gltf (já carregado)
const texs = {};
let clips = null;   // nome → AnimationClip
const url = (f) => `chars/${f}?v=${VERSION}`;

export const HERO3D = {
  ok: false, failed: false,
  load(name) {
    if (!files[name]) files[name] = loader.loadAsync(url(name + '.wasm')).then((g) => { ready[name] = g; return g; });
    return files[name];
  },
  tex(name) {
    if (!texs[name]) texs[name] = texLoader.loadAsync(url('tex/' + name + '.jpg')).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; });
    return texs[name];
  },
  // carrega o básico (animações + os dois modelos padrão). Chamado na abertura do jogo.
  preload() {
    if (this._pre) return this._pre;
    this._pre = Promise.all([loader.loadAsync(url('anim.wasm')), this.load('M_peasant'), this.load('F_peasant')])
      .then(([a]) => { clips = {}; for (const c of a.animations) clips[c.name] = c; this.ok = true; return true; })
      .catch((e) => { this.failed = true; console.warn('modelos 3D dos heróis não carregaram; usando o boneco antigo', e?.message || e); return false; });
    return this._pre;
  },
};

// herói: modelo novo se já carregou; senão o boneco antigo
export function makeHero(cls, look) {
  if (!HERO3D.ok) return buildHero(cls);
  return new SkinHero(cls, look);
}

const _v = new THREE.Vector3();

// ---- IK de 2 ossos (ombro → cotovelo → pulso): leva o pulso até o alvo, com o cotovelo virado para o "pole" ----
const T = [...Array(10)].map(() => new THREE.Vector3()), U = [...Array(10)].map(() => new THREE.Vector3()); // T: dentro do IK; U: de quem chama
const Qa = new THREE.Quaternion(), Qb = new THREE.Quaternion(), Qc = new THREE.Quaternion();
const _tq = new THREE.Quaternion(), _tUp = new THREE.Vector3(), _tPq = new THREE.Quaternion();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// gira um osso em volta do "para cima" do mundo (no espaço do pai), sem mexer nos outros eixos
function twistBone(b, ang) {
  if (!b || Math.abs(ang) < 1e-4) return;
  b.parent.updateWorldMatrix(true, false);
  b.parent.getWorldQuaternion(_tPq).invert();
  _tUp.set(0, 1, 0).applyQuaternion(_tPq).normalize();
  b.quaternion.premultiply(_tq.setFromAxisAngle(_tUp, ang));
}
function aimBone(bone, childNow, want, w) { // gira o osso (no mundo) para que o filho vá de childNow para want
  const P = bone.getWorldPosition(T[8]);
  const from = T[9].subVectors(childNow, P).normalize(), to = T[7].subVectors(want, P).normalize();
  Qa.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(Qb); Qa.multiply(Qb);                  // rotação desejada no mundo
  bone.parent.getWorldQuaternion(Qc).invert(); Qc.multiply(Qa);   // no espaço do pai
  bone.quaternion.slerp(Qc, w);
  bone.updateMatrixWorld(true);
}
function ik2(up, lo, hand, target, pole, w) {
  const A = up.getWorldPosition(T[0]), B = lo.getWorldPosition(T[1]), C = hand.getWorldPosition(T[2]);
  const a = A.distanceTo(B), b = B.distanceTo(C);
  const dir = T[3].subVectors(target, A); let d = dir.length(); dir.normalize();
  d = Math.max(Math.abs(a - b) + 1e-3, Math.min(d, (a + b) * 0.999));
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pp = T[4].subVectors(pole, A); pp.addScaledVector(dir, -pp.dot(dir)).normalize();
  const E = T[5].copy(A).addScaledVector(dir, cosA * a).addScaledVector(pp, sinA * a); // cotovelo novo
  aimBone(up, B, E, w);
  const B2 = lo.getWorldPosition(T[1]), C2 = hand.getWorldPosition(T[2]);
  const want = T[6].copy(A).addScaledVector(dir, d);
  aimBone(lo, C2, want, w);
}
const BOW_REST = 0.105; // corda parada (y do arco)
// arco na mão parada/andando: em pé ao lado do corpo (gira o arco em relação à palma)
// eixos da mão (iguais nas duas): +Y = dedos, +Z = lado do indicador (o furo do punho fechado), +X = palma (esq.)
// arco no punho: eixo do arco = +Z da mão; corda para o lado do pulso (gira 180° em Z)
const BOW_IN_FIST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
// mirando: mão esquerda com os nós dos dedos para a frente, indicador para cima e palma para dentro
// mira para cima/baixo: gira em volta do eixo "direita" do herói
const PITCH_Q = new THREE.Quaternion(), AIM_HAND_P = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0), _bAx = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bPq = new THREE.Quaternion();
function bendBone(b, axisWorld, ang) { // inclina o osso (eixo no mundo)
  if (!b || Math.abs(ang) < 1e-4) return;
  b.parent.updateWorldMatrix(true, false);
  b.parent.getWorldQuaternion(_bPq).invert();
  _bAx.copy(axisWorld).applyQuaternion(_bPq).normalize();
  b.quaternion.premultiply(_bq.setFromAxisAngle(_bAx, ang));
}
const AIM_HAND_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
const REST_UP = new THREE.Vector3(0, Math.cos(0.6), Math.sin(0.6)); // parado/andando: arco quase em pé, ponta de cima um pouco para a frente
const M4 = new THREE.Matrix4();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LEGS = /^(root|pelvis|thigh_|calf_|foot_|ball_)/;
const NO_SPLIT = new Set(['Roll', 'NinjaJump_Start', 'NinjaJump_Land', 'Shield_Dash', 'Sword_Dash']); // movimentos do corpo todo // ossos das pernas (e da raiz)
const ANIM_OF_EMOTE = { sit: 'Sitting_Idle_Loop', dance: 'Dance_Loop', cheer: 'Yes', victory: 'Yes', wave: 'Idle_Talking_Loop' };

// os modelos têm 1,8 m; com 1,38 o herói fica com ~2,5 m (um pouco maior que os NPCs, como o dono pediu)
export const HERO_SCALE = 1.38;

class SkinHero {
  static trailOn = false;
  constructor(cls, look = {}) {
    this.kind = 'skinhero';
    this.cls = cls.id; this.clsDef = cls;
    this.root = new THREE.Group(); this.root.name = 'hero';
    this.root.scale.setScalar(HERO_SCALE);
    this.mats = [];
    this.handR = new THREE.Group(); this.handL = new THREE.Group(); this.backSlot = new THREE.Group();
    this.helmSlot = new THREE.Group(); // compatibilidade (trajes antigos)
    this.shoulders = [];
    this.look = { g: look.g === 'F' ? 'F' : 'M', skin: look.skin || 'campones' };
    this.cur = {}; this.base = null; this.act = null; this.hurtAct = null;
    this.phase = 0; this._dead = false;
    this.silMat = null; this.sils = [];
    // mago: cristal arcano flutuando (igual ao boneco antigo)
    if (cls.id === 'mago') {
      const gemM = new THREE.MeshBasicMaterial({ color: 0x5ef0ff });
      const fam = new THREE.Group(); fam.position.set(0, 1.85, 0); this.root.add(fam);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), gemM); c.scale.set(1, 1.6, 1); c.position.x = 0.75; fam.add(c);
      const h = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xc79bff, transparent: true, opacity: 0.35 })); h.position.x = 0.75; fam.add(h);
      this.familiar = fam; this.familiarGem = c;
    }
    this.mountModel(HERO3D_model(this.look), null);
    this.setLook(this.look, true);
  }

  // coloca um modelo (clone do GLB) no lugar do atual, mantendo armas, animação e silhueta
  mountModel(gltf, texName) {
    if (!gltf) return;
    const old = this.model;
    const m = skClone(gltf.scene);
    const mats = [];
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 2;
      mats.push(o.material);
    });
    this.model = m; this.mats.length = 0; this.mats.push(...mats);
    this.root.add(m);
    if (old) this.root.remove(old);
    this.bones = {}; m.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.head = this.bones.Head; this.torso = this.bones.spine_03; this.hips = this.bones.pelvis;
    // encaixes das mãos (eixo +Z = lado do indicador, como as armas do jogo)
    this.bones.hand_r.add(this.handR); this.handR.position.set(-0.03, 0.08, 0);
    this.bones.hand_l.add(this.handL); this.handL.position.set(0.03, 0.08, 0);
    this.bones.spine_03.add(this.backSlot); this.backSlot.position.set(0, 0.1, -0.22);
    // animações
    this.mixer = new THREE.AnimationMixer(m);
    this.actions = {};
    this.bases = new Map(); this.act = null; this.curAct = null; this.aw = 0;
    // dedos: direita sempre fechada na arma; esquerda fechada em volta do arco/alça do escudo, ou solta
    for (const n of ['GripR', 'Grip']) if (clips?.[n]) { this.mixer.clipAction(clips[n]).play(); break; }
    this.setLeftGrip(this._fist, true);
    if (texName) this.applyTex(texName);
    if (this.silMat) this.addSilhouette(this.silMat);
    this._mounted = gltf;
    this.setRegal(!!this._regalOn);
  }

  // skin de Rei/Rainha: manto vermelho nas costas + ouro da roupa (coroa) brilhando
  setRegal(on) {
    if (this.cape) { const ix = this.mats.indexOf(this.cape.mesh.material); if (ix >= 0) this.mats.splice(ix, 1); this.cape.dispose(); this.cape = null; }
    this.regal = !!on;
    for (const mt of this.mats) if (mt.name === 'outfit' && mt.userData.regal && !on) { mt.emissiveMap = null; mt.emissive.setHex(0); mt.emissiveIntensity = 1; mt.userData.regal = false; mt.needsUpdate = true; }
    if (!on) return;
    HERO3D.tex('rei_glow').then((t) => {
      if (!this._regalOn) return;
      for (const mt of this.mats) if (mt.name === 'outfit') { mt.emissiveMap = t; mt.emissive.setHex(0xffd36b); mt.emissiveIntensity = 0.8; mt.userData.regal = true; mt.needsUpdate = true; }
    }).catch(() => {});
    // manto de verdade: tecido simulado preso nos ombros que desvia do corpo (engine/cape.js)
    if (this.model) { this.cape = new RoyalCape(this); this.model.add(this.cape.mesh); this.mats.push(this.cape.mesh.material); this.root.updateMatrixWorld(true); this.cape.calibrate(); }
  }

  applyTex(name) {
    HERO3D.tex(name).then((t) => { for (const mt of this.mats) if (mt.name === 'outfit') { mt.map = t; mt.needsUpdate = true; } }).catch(() => {});
  }

  // gênero + skin (roupa e cor). Carrega a roupa se precisar; até lá fica a padrão.
  setLook(look, force = false) {
    const g = look.g === 'F' ? 'F' : 'M';
    let sk = skinOf(look.skin, g);
    const key = g + ':' + sk.id;
    if (!force && key === this._lookKey) return;
    this._lookKey = key; this.look = { g, skin: sk.id };
    const regalChanged = !!sk.regal !== !!this._regalOn;
    this._regalOn = !!sk.regal;
    const file = `${g}_${sk.outfit}`;
    const want = this._want = key;
    // manto do Rei liga/desliga: remonta o modelo (pose de descanso) para o manto se encaixar no peito
    if (ready[file]) { if (this._mounted !== ready[file] || force || regalChanged) this.mountModel(ready[file], sk.tex); else this.restoreTex(sk.tex); return; }
    HERO3D.load(file).then((gl) => { if (this._want === want) this.mountModel(gl, sk.tex); }).catch(() => {});
  }
  restoreTex(tex) {
    if (tex) return this.applyTex(tex);
    const base = this._mounted; if (!base) return;
    let orig = null; base.scene.traverse((o) => { if (o.isMesh && o.material.name === 'outfit') orig = o.material.map; });
    for (const mt of this.mats) if (mt.name === 'outfit' && orig) { mt.map = orig; mt.needsUpdate = true; }
  }

  // silhueta azul através de paredes (mesma pele/esqueleto)
  addSilhouette(mat) {
    // só do joelho para cima: em encostas os pés entram no terreno e a silhueta apareceria lá
    if (!mat.userData.cut) {
      mat = mat.clone(); mat.userData.cut = this.silCut = { value: 0 };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uMinY = this.silCut;
        sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = 'uniform float uMinY;\nvarying float vWY;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\nif (vWY < uMinY) discard;');
      };
      mat.customProgramCacheKey = () => 'heroSilCut';
    }
    this.silMat = mat;
    for (const s of this.sils) s.parent?.remove(s);
    this.sils = [];
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh || o.userData.sil || o.material.name === 'eyes') return;
      const s = new THREE.SkinnedMesh(o.geometry, mat); s.userData.sil = true;
      s.bind(o.skeleton, o.bindMatrix); s.renderOrder = 1; s.castShadow = false; s.frustumCulled = false;
      o.parent.add(s); this.sils.push(s);
    });
  }

  setEquipment(eq) {
    const cls = this.clsDef;
    for (const h of [this.handR, this.handL, this.backSlot, this.bowHold].filter(Boolean)) while (h.children.length) h.remove(h.children[0]);
    const w = eq.weapon;
    const kind = w?.wkind || (cls.id === 'guerreiro' ? 'espada' : cls.id === 'arqueiro' ? 'arco' : 'varinha');
    const weapon = buildWeapon(kind, w?.rarity || 'comum', { theme: gearTheme(w) });
    const bow = kind === 'arco' || kind === 'arco_longo';
    if (!bow) mergeWeapon(weapon); // peças da arma numa pintura só (eram ~7 por herói); o arco não, a corda se mexe
    // arco: fica num suporte que segue a palma ESQUERDA; ao atirar, o braço esquerdo estica com o arco em pé
    // e a mão direita puxa a corda até o queixo (ver archerPose)
    if (bow) { (this.bowHold ||= new THREE.Group()).add(weapon); if (!this.bowHold.parent) this.root.add(this.bowHold); }
    else {
      this.handR.add(weapon); this.bowHold?.parent?.remove(this.bowHold);
      // machado: na mão, inclinado para baixo/frente: lâmina grande para baixo, parte menor para cima
      const TILT = globalThis.__WTILT || { machado: [-0.9, Math.PI], clava: [0, 0] };
      if (TILT[kind]) { weapon.rotation.x = TILT[kind][0]; weapon.rotation.z = TILT[kind][1]; }
    }
    this.weapon = weapon; this.weaponKind = kind; this.aimW = 0;
    // rastro do golpe saindo da própria lâmina (armas de corpo a corpo); cor puxada da raridade
    if (this.trail) { this.trail.dispose(); this.trail = null; }
    if (['espada', 'montante', 'machado', 'clava', 'adaga'].includes(kind)) {
      const seg = bladeSegment(weapon, kind);
      if (seg) {
        const rc = new THREE.Color(RARITIES[RARITY_INDEX[w?.rarity || 'comum'] ?? 0].color).lerp(new THREE.Color(0xfff0c8), 0.55);
        this.trail = new BladeTrail(weapon, seg[0], seg[1], rc);
      }
    }
    this.setLeftGrip(bow || (!!eq.shield && kind !== 'montante'));
    if (eq.shield && kind !== 'montante') {
      const sh = buildWeapon('escudo', eq.shield.rarity || 'comum', { theme: gearTheme(eq.shield) });
      mergeWeapon(sh);
      sh.scale.setScalar(({ broquel: 0.75, escudo_torre: 1.3 }[eq.shield.wkind] || 1) * 0.72); // menor: o escudo grande atravessava o corpo andando
      if (bow) this.shield = null; // arqueiro: sem escudo nas costas (o escudo continua dando defesa)
      else { const SP = globalThis.__SHP || [-0.06, -0.02, 0]; /* escudo para fora da mão: a mão fica atrás dele */ sh.position.set(SP[0], SP[1], SP[2]); sh.rotation.set(0, -Math.PI / 2, 0); this.handL.add(sh); this.shield = sh; }
    } else this.shield = null;
    this.legendary = RARITY_INDEX[w?.rarity] >= 4 ? new THREE.Color(RARITIES[w.rarity]?.color || 0xffffff) : null;
    for (const h of [this.handR, this.handL, this.backSlot, this.bowHold].filter(Boolean)) h.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.renderOrder = 2; } });
    this.onEquip?.();
  }

  // mão esquerda: punho fechado (arco, escudo) ou solta
  setLeftGrip(fist, force = false) {
    if (!this.mixer || (!force && this._fist === fist)) return;
    this._fist = fist;
    const on = clips?.[fist ? 'GripLFist' : 'GripLOpen'], off = clips?.[fist ? 'GripLOpen' : 'GripLFist'];
    if (off) this.mixer.clipAction(off).stop();
    if (on) this.mixer.clipAction(on).play();
  }

  // ---- animação: escolhe o clipe pelo estado do jogo ----
  action(name) {
    if (name.endsWith('#up')) { // só da cintura para cima (as pernas continuam andando: sem "arrastar os pés")
      const base = name.slice(0, -3);
      if (!clips?.[base]) return null;
      if (!clips[name]) clips[name] = new THREE.AnimationClip(name, clips[base].duration, clips[base].tracks.filter((t) => !LEGS.test(t.name)));
    }
    if (!clips?.[name]) return null;
    return (this.actions[name] ||= this.mixer.clipAction(clips[name]));
  }
  baseClip(st) {
    const k = this.weaponKind, cls = this.cls;
    if (st.dead > 0) return ['Death01', 1, false];
    if (st.mounted) return ['Driving_Loop', 1, true];
    if ((st.swim || 0) > 0.5) return [(st.move || 0) > 0.1 ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop', 1, true];
    if (st.emote && ANIM_OF_EMOTE[st.emote]) return [ANIM_OF_EMOTE[st.emote], 1, true];
    const w = st.move || 0;
    if (w > 0.06) {
      // atacando/mirando enquanto se move: ANDA (não corre) — o passo acompanha a velocidade
      if (st.action || (this.aimW || 0) > 0.3) return ['Walk_Loop', Math.min(1.7, Math.max(0.7, w / 0.45)), true];
      // andar normal (sem o botão de correr) = ANDANDO; só o botão de correr usa a corrida
      if (w <= 1.03) return ['Walk_Loop', Math.min(1.95, Math.max(0.6, w / 0.5)), true];
      return ['Sprint_Loop', w / 1.3, true];
    }
    if ((st.combat || 0) > 0.5) {
      if (cls === 'mago') return ['Spell_Simple_Idle_Loop', 1, true];
      if (cls === 'arqueiro') return ['Idle_Loop', 1, true]; // arco baixo na mão esquerda; ao atirar, archerPose levanta
      return [this.shield ? 'Idle_Shield_Loop' : 'Sword_Idle', 1, true];
    }
    if ((st.idleT || 0) > 9) return [Math.floor(st.idleT / 9) % 2 ? 'Idle_FoldArms_Loop' : 'Idle_Loop', 1, true];
    return ['Idle_Loop', 1, true];
  }
  actionClip(st) {
    const a = st.action, k = this.weaponKind, v = st.variant || 0;
    switch (a) {
      case 'slash': case 'swipe':
        if (k === 'montante') return 'Sword_Attack';
        if (k === 'cajado' || k === 'varinha' || k === 'orbe') return 'Spell_Simple_Shoot';
        if (k === 'arco' || k === 'arco_longo') return 'Punch_Jab';
        return ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_A'][v % 3];
      case 'slam': return 'Sword_Attack';
      case 'whirl': return 'Sword_Regular_C';
      case 'charge': return this.shield ? 'Shield_Dash' : 'Sword_Dash';
      case 'leap': return (st.p || 0) < 0.55 ? 'NinjaJump_Start' : 'NinjaJump_Land';
      case 'roll': return 'Roll';
      case 'phase': return 'Spell_Simple_Enter';
      case 'guard': return this.shield ? 'Idle_Shield_Loop' : 'Sword_Block';
      case 'shoot': case 'bow': return 'Pistol_Shoot';
      case 'cast': case 'castUp': return 'Spell_Simple_Shoot';
      case 'chargeWind': return 'Spell_Simple_Enter';
      case 'sling': case 'throw': return 'OverhandThrow';
      case 'roar': return 'Idle_Shield_Break';
      case 'victory': return 'Yes';
      default: return null; // ação sem clipe: segue andando/parado normal
    }
  }

  update(st, dt) {
    if (!this.mixer) return;
    if (this.silCut) this.silCut.value = this.root.position.y + 0.55 * HERO_SCALE;
    if (this.sils?.length && this._silOff !== !!this.silHide) { this._silOff = !!this.silHide; for (const m of this.sils) m.visible = !this._silOff; } // na loja (câmera no rosto) sem a silhueta azul
    if (!this.root.visible) return; // fora da tela/área: não gasta tempo animando
    const t = st.t || 0;
    const damp = (x, y, k) => x + (y - x) * (1 - Math.exp(-k * dt));
    if (this.regal) for (const mt of this.mats) if (mt.userData.regal) mt.emissiveIntensity = 0.65 + Math.sin(t * 2.4) * 0.25; // coroa brilhando
    if (this.familiar) { this.familiar.rotation.y += dt * 1.6; this.familiar.position.y = 1.85 + Math.sin(t * 2.3) * 0.12; this.familiarGem.rotation.y += dt * 3; }
    // ---- base (andar, parado, nadar...): pesos misturados à mão (troca suave entre clipes) ----
    const [bn, speed, loop] = this.baseClip(st);
    this.bases ||= new Map();
    if (!this.bases.has(bn)) {
      const a = this.action(bn);
      if (a) { a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.enabled = true; a.setEffectiveWeight(0); a.play(); this.bases.set(bn, { a, w: this.bases.size ? 0 : 1 }); }
    }
    // ---- ação (ataque, golpe, magia...): o tempo do clipe segue o progresso da ação do jogo ----
    let an = st.action && !(st.dead > 0) ? this.actionClip(st) : null;
    // andando/correndo e atacando: o golpe só no tronco e nos braços; as pernas seguem o passo
    if (an && (st.move || 0) > 0.12 && !NO_SPLIT.has(an)) an += '#up';
    if (an && an !== this.curAct) {
      if (this.act && this.act !== this.action(an)) this.act.stop();
      this.act = this.action(an);
      if (this.act) { this.act.reset(); this.act.setLoop(THREE.LoopOnce, 1); this.act.clampWhenFinished = true; this.act.enabled = true; this.act.play(); this.act.paused = true; }
      this.curAct = an;
    } else if (!an) this.curAct = null;
    this.aw = damp(this.aw || 0, an && this.act ? 1 : 0, an ? 30 : 10);
    if (this.act) {
      if (an) {
        const d = this.act.getClip().duration, p = Math.min(0.999, Math.max(0, st.p || 0));
        const span = /Sword_Regular|Punch/.test(an) ? 0.85 : 1; // golpes de espada: o jogo usa o golpe, não a volta
        this.act.time = p * d * span;
      }
      // golpe só de cima: as pernas ficam 100% no passo (base com peso inteiro) e o tronco/braços ~92% no golpe
      // (o mixer faz a média ponderada: 1 da base contra 12 do golpe)
      this.upperAct = this.act.getClip().name.endsWith('#up');
      this.act.setEffectiveWeight(this.upperAct ? this.aw * 12 : this.aw);
      if (!an && this.aw < 0.02) { this.act.stop(); this.act = null; this.aw = 0; this.upperAct = false; }
    } else this.upperAct = false;
    const kb = bn === 'Death01' ? 16 : 9;
    for (const [n, o] of this.bases) {
      o.w = damp(o.w, n === bn ? 1 : 0, kb);
      if (n === bn) o.a.timeScale = speed * (this.backpedal && /Walk|Jog|Sprint/.test(n) ? -1 : 1);
      o.a.setEffectiveWeight(o.w * (this.upperAct ? 1 : 1 - this.aw));
      if (n !== bn && o.w < 0.01) { o.a.stop(); this.bases.delete(n); }
    }
    // apanhou: tranco rápido por cima (sem atrapalhar o ataque)
    const hurt = st.hurt || 0;
    if (hurt > 0.85 && !this._hurtOn && !an && !(st.dead > 0)) {
      const h = this.action(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head');
      if (h) { h.reset(); h.setLoop(THREE.LoopOnce, 1); h.clampWhenFinished = false; h.setEffectiveWeight(0.8); h.play(); h.fadeOut(0.4); }
      this._hurtOn = true;
    } else if (hurt < 0.3) this._hurtOn = false;
    this.flourishFx = null;
    this.mixer.update(dt);
    this.legTurn(st, dt);
    if (this.weapon?.userData?.bow && this.bowHold) this.archerPose(an && an.startsWith('Pistol_Shoot') && !(st.dead > 0) ? st.p || 0 : -1, dt);
    // manto do Rei: depois da pose final do quadro (ossos já no lugar)
    if (this.cape || this.trail) this.root.updateMatrixWorld(true);
    if (this.cape) this.cape.step(dt);
    if (this.trail) this.trail.update(dt, this.root, SkinHero.trailOn && ['slash', 'whirl', 'slam'].includes(st.action) && !(st.dead > 0));
  }

  // Andando para o lado ou para trás enquanto mira/ataca (o corpo fica virado para o alvo):
  // as PERNAS viram para onde ele está indo e o tronco gira de volta para o alvo (não "corre para a frente indo de lado").
  // Indo para trás: anda de costas (o passo toca ao contrário) com o corpo de frente para o alvo.
  legTurn(st, dt) {
    const B = this.bones, moving = (st.move || 0) > 0.12 && !st.mounted && !((st.swim || 0) > 0.5) && !(st.dead > 0);
    let want = 0, back = false;
    if (moving && Number.isFinite(st.mvRel)) {
      const d = wrapA(st.mvRel);
      // histerese: vira "de costas" passando de 120° e só volta abaixo de 100° (sem estalar no analógico)
      const lim = this.backpedal ? 1.75 : 2.09;
      if (Math.abs(d) > lim) { back = true; want = wrapA(d - Math.PI); } else want = d;
    }
    if (back !== !!this.backpedal) { this.backpedal = back; this.legT = wrapA((this.legT || 0) + Math.PI) * 0; } // troca de frente/costas: recomeça do centro, suave
    const k = 1 - Math.exp(-9 * dt);
    this.legT = (this.legT || 0) + wrapA(want - (this.legT || 0)) * k;
    const a = Math.max(-0.87, Math.min(0.87, this.legT)); // no máximo ~50°: quadril não gira mais do que um corpo gira
    if (Math.abs(a) < 0.01 || !B.pelvis || !B.spine_01) return;
    twistBone(B.pelvis, a);                 // quadril e pernas para onde está indo
    twistBone(B.spine_01, -a * 0.55);       // tronco volta para o alvo (dividido pela coluna, fica natural)
    twistBone(B.spine_02 || B.spine_01, -a * 0.3);
    twistBone(B.spine_03 || B.spine_01, -a * 0.15);
  }

  // arqueiro: braço esquerdo esticado com o arco em pé na frente do rosto; a mão direita pega a corda e puxa até o
  // queixo, solta (a flecha sai em ~48% do golpe, igual ao jogo) e volta. p < 0 = não está atirando.
  archerPose(p, dt) {
    const B = this.bones, R = this.root, bow = this.weapon.userData.bow;
    this.aimW += ((p >= 0 ? 1 : 0) - this.aimW) * (1 - Math.exp(-(p >= 0 ? 22 : 7) * dt));
    const w = this.aimW;
    // mira para cima/baixo (alvo alto ou baixo): o tronco inclina um pouco e os braços levam o arco até o ângulo
    this.pitchS = (this.pitchS || 0) + ((this.aimPitch || 0) - (this.pitchS || 0)) * (1 - Math.exp(-10 * dt));
    const pit = this.pitchS * w;
    PITCH_Q.setFromAxisAngle(_X, -pit);
    AIM_HAND_P.copy(PITCH_Q).multiply(AIM_HAND_Q);
    if (Math.abs(pit) > 0.01 && B.spine_02 && B.spine_01) {
      R.getWorldQuaternion(Qa); const ax = U[8].set(1, 0, 0).applyQuaternion(Qa);
      // a coluna faz a maior parte (o braço não sobe sozinho): ~65% no tronco, o resto nos braços e no pescoço
      bendBone(B.spine_01, ax, -pit * 0.2); bendBone(B.spine_02, ax, -pit * 0.25); bendBone(B.spine_03 || B.spine_02, ax, -pit * 0.2);
      if (B.neck_01) bendBone(B.neck_01, ax, -pit * 0.1);
    }
    R.updateMatrixWorld(true);
    let k = 0;
    if (w > 0.01) {
      const L = (v) => R.worldToLocal(v), W = (v) => R.localToWorld(v);
      const C = L(B.Head.getWorldPosition(U[0])).add(U[1].set(-0.03, -0.04, 0.1));       // queixo (no corpo do herói)
      const S = L(B.upperarm_l.getWorldPosition(U[1]));
      const G = U[2].set(C.x + 0.02, C.y - 0.03, S.z + 0.47);                            // empunhadura do arco
      if (pit) G.sub(C).applyQuaternion(PITCH_Q).add(C);                                  // mirando para cima/baixo
      // braço esquerdo: pulso vai para a empunhadura (descontando a palma), cotovelo para fora e para baixo
      // pulso = empunhadura − (palma girada como a mão vai ficar mirando)
      const wrist = W(U[5].copy(G).sub(U[3].set(0.03, 0.08, 0).applyQuaternion(AIM_HAND_P))), poleL = W(U[6].copy(S).add(U[7].set(0.45, -0.35, 0)));
      ik2(B.upperarm_l, B.lowerarm_l, B.hand_l, wrist, poleL, w);
      // puxada: pega a corda, puxa até o queixo, segura um instante, solta em 0,48 e a mão vai um pouco para trás
      const full = Math.max(0, Math.min(1, (G.z - (C.z + 0.03) - BOW_REST) / 0.42));
      k = p < 0 ? 0 : p < 0.48 ? full * smooth(0.06, 0.4, p) : 0;
      this._kDraw = k;
    }
    // mão esquerda virada para segurar o arco: o punho fecha em volta da empunhadura
    // (mirando: indicador para cima e nós para a frente; parado/andando: o furo do punho quase em pé, seguindo o braço)
    const H = B.hand_l;
    R.getWorldQuaternion(Qc);
    const fing = U[0].set(0, 1, 0).applyQuaternion(H.getWorldQuaternion(Qb)).applyQuaternion(Qa.copy(Qc).invert()); // dedos (no espaço do herói)
    const up = U[1].copy(REST_UP); fing.addScaledVector(up, -fing.dot(up)).normalize();
    if (fing.lengthSq() < 0.5) fing.set(0, -Math.sin(0.6), Math.cos(0.6));
    const restQ = Qa.setFromRotationMatrix(M4.makeBasis(U[2].crossVectors(fing, up), fing, up));
    restQ.slerp(AIM_HAND_P, w);                                       // orientação da mão no espaço do herói
    const want = Qb.copy(Qc).multiply(restQ);                          // no mundo
    H.parent.getWorldQuaternion(Qc).invert(); H.quaternion.copy(Qc.multiply(want)); H.updateMatrixWorld(true);
    // o arco no punho esquerdo
    const hold = this.bowHold;
    hold.position.copy(R.worldToLocal(this.handL.getWorldPosition(U[0])));
    R.getWorldQuaternion(Qa).invert(); this.handL.getWorldQuaternion(Qb); hold.quaternion.copy(Qa.multiply(Qb)).multiply(BOW_IN_FIST);
    bow.setDraw(k * w);
    if (w > 0.01) {
      // mão direita no ponto da corda (onde a flecha encaixa)
      hold.updateMatrixWorld(true);
      const S2 = R.worldToLocal(B.upperarm_r.getWorldPosition(U[1]));
      const p01 = p < 0 ? 1 : p;
      const nock = this.weapon.localToWorld(U[2].set(0, BOW_REST + 0.012 + k * 0.42 + (p01 >= 0.48 ? 0.12 * smooth(0.48, 0.6, p01) * (1 - smooth(0.75, 1, p01)) : 0), 0));
      const palm = U[3].subVectors(this.handR.getWorldPosition(U[3]), B.hand_r.getWorldPosition(U[4]));
      const poleR = R.localToWorld(U[6].copy(S2).add(U[7].set(-0.5, 0.05, -0.35)));
      ik2(B.upperarm_r, B.lowerarm_r, B.hand_r, nock.sub(palm), poleR, w);
    }
  }
}

// modelo inicial: a roupa pedida se já estiver na memória; senão a padrão do gênero
function HERO3D_model(look) {
  const g = look.g === 'F' ? 'F' : 'M';
  const sk = skinOf(look.skin, g);
  return ready[`${g}_${sk.outfit}`] || ready[`${g}_peasant`] || ready.M_peasant;
}

export { SkinHero };
