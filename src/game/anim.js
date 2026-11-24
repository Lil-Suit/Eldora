// Animação procedural dos modelos articulados.
// st: { move 0..1, t, action, p (0..1), variant, hurt 0..1, dead 0..1, emote, alert }

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const seg = (p, a, b) => ease((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

export function animate(rig, st, dt) {
  if (rig.kind === 'skinhero') return rig.update(st, dt); // herói com modelo 3D (engine/hero3d.js)
  if (rig.cloth) { const c = rig.cloth; c.t.value += dt; const mv = Math.min(1, (st.move || 0) + (st.action ? 0.35 : 0)); c.move.value += (mv - c.move.value) * Math.min(1, dt * 3); } // capas que flutuam
  if (rig.halo) rig.halo.rotation.z += dt * 0.6;
  if (rig.outfitSpin) rig.outfitSpin.rotation.y += dt * 1.3;
  if (rig.champFx) { const f = rig.champFx; f.t += dt; f.ring.rotation.z += dt * 0.5; f.orbs.rotation.y += dt * 1.4; f.orbs.position.y += Math.sin(f.t * 2) * dt * 0.15; f.ringM.opacity = 0.4 + Math.sin(f.t * 3) * 0.18; }
  if (rig.kind === 'humanoid') {
    rig.bowDraw = 0; humanoid(rig, st, dt);
    const bw = rig.weapon?.userData?.bow; if (bw) { const k = rig.bowDraw || 0; rig._bd = k > (rig._bd || 0) ? k : Math.max(0, (rig._bd || 0) - dt * 14); bw.setDraw(rig._bd); }
    return blend(rig, st, dt, H_JOINTS);
  }
  if (rig.kind === 'slime') return slime(rig, st, dt);
  if (rig.kind === 'wolf') { wolf(rig, st, dt); return blend(rig, st, dt, W_JOINTS); }
  if (rig.kind === 'golem') { golem(rig, st, dt); return blend(rig, st, dt, G_JOINTS); }
}

// ---- Camada de suavização ----
// As funções de pose calculam a pose "alvo" a cada quadro; aqui cada articulação persegue esse alvo com
// amortecimento exponencial. Isso elimina os "estalos" ao começar/terminar ações, dá peso aos membros e
// faz capa, cauda e mandíbula reagirem com atraso natural (movimento secundário).
const H_JOINTS = [
  ['body', 22, true], ['hips', 20, true], ['torso', 18, true], ['neck', 12], ['head', 11], ['legL', 34], ['legR', 34], ['kneeL', 34], ['kneeR', 34],
  ['armL', 20], ['armR', 20], ['elbowL', 22], ['elbowR', 22], ['handL', 22], ['handR', 22], ['cape', 6], ['capeLow', 4.5], ['jaw', 18], ['skirt', 9],
];
const W_JOINTS = [['body', 20, true], ['spine', 16], ['head', 12], ['jaw', 22], ['tail', 7], ['tail2', 5], ['legs', 30], ['lows', 30], ['claws', 18]];
const G_JOINTS = [['body', 14, true], ['torso', 12], ['head', 8], ['arms', 14], ['legs', 18], ['elbows', 16], ['knees', 20]];
const FAST = new Set(['roll', 'leap', 'whirl', 'phase', 'charge']);
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function blend(R, s, dt, joints) {
  if (dt <= 0) return;
  const fast = FAST.has(s.action);
  const boost = s.action ? 1.35 : 1;
  // estado da suavização guardado na própria peça (sem montar texto/lista por junta a cada quadro)
  for (let j = 0; j < joints.length; j++) {
    const jt = joints[j], name = jt[0], rate = jt[1], pos = jt[2];
    const v = R[name], arr = Array.isArray(v), n = arr ? v.length : 1;
    for (let i = 0; i < n; i++) {
      const o = arr ? v[i] : v;
      if (!o) continue;
      let st = o._sm;
      if (!st) { o._sm = { x: o.rotation.x, y: o.rotation.y, z: o.rotation.z, px: o.position.x, py: o.position.y, pz: o.position.z }; continue; }
      // rolamento/salto/giro não podem ficar para trás: quase sem suavização
      const r = (fast && (name === 'body' || name === 'hips')) ? 60 : rate * boost;
      const k = 1 - Math.exp(-r * dt);
      st.x = wrapA(st.x + wrapA(o.rotation.x - st.x) * k);
      st.y = wrapA(st.y + wrapA(o.rotation.y - st.y) * k);
      st.z = wrapA(st.z + wrapA(o.rotation.z - st.z) * k);
      o.rotation.set(st.x, st.y, st.z); // uma conta de rotação por junta (antes eram três)
      if (pos) {
        st.px += (o.position.x - st.px) * k; o.position.x = st.px;
        st.py += (o.position.y - st.py) * k; o.position.y = st.py;
        st.pz += (o.position.z - st.pz) * k; o.position.z = st.pz;
      }
    }
  }
}

function restPose(rig, kind, w, sw) {
  const R = rig;
  R.handR.rotation.set(0, 0, 0); R.handL.rotation.set(0, 0, 0);
  R.armR.rotation.set(0, 0, 0); R.armL.rotation.set(0, 0, 0);
  // braços balançam com cotovelos dobrados ao correr
  const run = ease((w - 0.45) / 0.45);
  const pump = -0.18 - 0.3 * w - 0.75 * run;
  R.armL.rotation.z = -0.07; R.armR.rotation.z = 0.07; // braços levemente afastados do corpo
  if (R.elbowL) { R.elbowL.rotation.set(pump, 0, 0); R.elbowR.rotation.set(pump, 0, 0); }
  switch (kind) {
    case 'espada': case 'machado': case 'adaga': case 'clava':
      R.armR.rotation.x = -0.3 + sw * 0.45; if (R.elbowR) R.elbowR.rotation.x = -0.45 - 0.5 * w;
      R.handR.rotation.x = 0.25;
      R.armL.rotation.x = rig.shield ? -0.45 : -sw * 0.7;
      if (rig.shield) { R.armL.rotation.z = 0.12; if (R.elbowL) R.elbowL.rotation.x = -0.85; R.handL.rotation.x = 0.5; }
      break;
    case 'montante':
      R.armR.rotation.x = -0.45; R.armL.rotation.x = -0.6; R.armL.rotation.z = -0.3; R.armR.rotation.z = 0.22;
      if (R.elbowL) { R.elbowR.rotation.x = -0.5; R.elbowL.rotation.x = -0.55; }
      R.handR.rotation.x = -0.35;
      break;
    case 'arco': case 'arco_longo':
      R.armL.rotation.x = -0.1 + sw * 0.45; if (R.elbowL) R.elbowL.rotation.x = -0.25; R.handL.rotation.x = -1.42;
      R.armR.rotation.x = -sw * 0.7;
      break;
    case 'varinha': case 'cajado':
      R.armR.rotation.x = -0.2 + sw * 0.3; if (R.elbowR) R.elbowR.rotation.x = -0.35; R.handR.rotation.x = -1.0;
      R.armL.rotation.x = -sw * 0.7;
      break;
    case 'orbe':
      R.armR.rotation.x = -0.55; if (R.elbowR) R.elbowR.rotation.x = -0.8; R.handR.rotation.x = 0;
      R.armL.rotation.x = -sw * 0.7;
      break;
    case 'sling':
      R.armR.rotation.x = -0.3 + sw * 0.45;
      R.armL.rotation.x = -sw * 0.7;
      break;
    default:
      R.armR.rotation.x = sw * (0.6 + 0.3 * run); R.armL.rotation.x = -sw * (0.6 + 0.3 * run);
  }
}

// postura de combate parado: base mais baixa e arma em guarda
function guardStance(R, kind, c, t) {
  const sway = Math.sin(t * 3.1) * 0.04;
  const L = (o, a, v) => { o.rotation[a] = lerp(o.rotation[a], v, c); };
  switch (kind) {
    case 'espada': case 'machado': case 'clava': case 'adaga':
      L(R.armR, 'x', -0.75 + sway); L(R.armR, 'z', 0.15); if (R.elbowR) L(R.elbowR, 'x', -1.05); L(R.handR, 'x', 0.55);
      if (R.shield) { L(R.armL, 'x', -0.95); if (R.elbowL) L(R.elbowL, 'x', -1.1); L(R.handL, 'x', 0.9); }
      else { L(R.armL, 'x', -0.5); if (R.elbowL) L(R.elbowL, 'x', -0.9); }
      L(R.torso, 'y', -0.25);
      break;
    case 'montante':
      L(R.armR, 'x', -0.85 + sway); L(R.armL, 'x', -0.95 + sway); if (R.elbowR) { L(R.elbowR, 'x', -0.8); L(R.elbowL, 'x', -0.7); }
      L(R.handR, 'x', -0.9); L(R.torso, 'y', -0.35);
      break;
    case 'arco': case 'arco_longo':
      L(R.armL, 'x', -0.85 + sway); if (R.elbowL) L(R.elbowL, 'x', -0.35); L(R.handL, 'x', -0.9);
      L(R.armR, 'x', -0.6); if (R.elbowR) L(R.elbowR, 'x', -1.2);
      L(R.torso, 'y', -0.3);
      break;
    case 'varinha': case 'cajado': case 'orbe':
      L(R.armR, 'x', -0.7 + sway); if (R.elbowR) L(R.elbowR, 'x', -0.6); L(R.handR, 'x', kind === 'orbe' ? 0 : -0.6);
      L(R.armL, 'x', -0.65 - sway); L(R.armL, 'z', -0.35); if (R.elbowL) L(R.elbowL, 'x', -1.0);
      break;
    default:
      L(R.armR, 'x', -0.6 + sway); L(R.armL, 'x', -0.6 - sway); if (R.elbowL) { L(R.elbowL, 'x', -1.3); L(R.elbowR, 'x', -1.3); }
  }
}

const setElb = (R, l, r) => { if (!R.elbowL) return; if (l !== null) R.elbowL.rotation.x = l; if (r !== null) R.elbowR.rotation.x = r; };
const setKnee = (R, l, r) => { if (!R.kneeL) return; R.kneeL.rotation.x = l; R.kneeR.rotation.x = r; };

function humanoid(R, s, dt) {
  const w = s.move || 0;
  const running = w > 0.04;
  // passada proporcional à velocidade real (pés não "patinam")
  R.phase += dt * (running ? 2.0 + w * 11.5 : 0.6);
  const ph = R.phase;
  const sw = Math.sin(ph) * w, cw = Math.cos(ph);
  const t = s.t || 0;
  const breathe = Math.sin(t * 2.1);
  const kind = R.weaponKind;
  const hunch = R.hunch || 0;
  // inclinação nas curvas e ao acelerar/frear
  const yaw = R.root.rotation.y;
  const yawRate = dt > 0 && R._ly !== undefined ? wrapA(yaw - R._ly) / dt : 0;
  R._ly = yaw;
  R._turn = (R._turn || 0) + (clamp(yawRate, -8, 8) - (R._turn || 0)) * Math.min(1, dt * 8);
  const accel = dt > 0 && R._lw !== undefined ? (w - R._lw) / dt : 0;
  R._lw = w;
  R._acc = (R._acc || 0) + (clamp(accel, -6, 6) - (R._acc || 0)) * Math.min(1, dt * 6);
  const combat = Math.min(1, s.combat || 0) * (1 - Math.min(1, w * 1.5));
  const idle = (1 - Math.min(1, w * 3)) * (1 - combat);
  const shift = Math.sin(t * 0.55);
  // ---- base: caminhada/corrida com porte ereto ----
  // run 0 = caminhada (passos curtos, braços soltos, cabeça erguida); 1 = corrida (inclina, joelhos altos, cotovelos dobrados)
  const run = ease((w - 0.45) / 0.45);
  const sp = Math.sin(ph), cp = cw;
  const stride = (0.5 + 0.34 * run) * Math.min(1, w * 1.7);
  const lean = (0.05 + 0.13 * run) * w;                      // inclinação do tronco para frente
  const bob = (Math.abs(cp) * 0.055 * (1 - run) + (Math.abs(sp) * 0.12 - 0.035) * run) * Math.min(1, w * 1.6);
  R.body.rotation.set(0, 0, sp * 0.03 * w - R._turn * 0.035 * w + shift * 0.012 * idle);
  R.body.position.set(sp * 0.035 * w * (1 - run * 0.6) + shift * 0.035 * idle, bob + breathe * 0.006 * (1 - w), 0);
  R.hips.position.y = 0.92 - 0.02 * w - 0.04 * run * w - 0.07 * combat;
  // quadril gira contra os ombros e cai para o lado da perna que balança
  R.hips.rotation.set(0.04 * run * w, -sp * (0.12 + 0.06 * run) * w, -sp * 0.05 * w - shift * 0.04 * idle);
  R.torso.position.y = 0.08 + breathe * 0.006;
  // peito aberto parado (porte), leve inclinação na corrida, contra-rotação dos ombros
  R.torso.rotation.set(-0.04 * idle + lean + hunch + breathe * 0.012 + clamp(R._acc * 0.035, -0.2, 0.22) + 0.12 * combat,
    sp * (0.16 + 0.08 * run) * w, sp * 0.04 * w + shift * 0.03 * idle);
  const look = running ? 0 : Math.sin(t * 0.37) * 0.22 * Math.max(0, Math.sin(t * 0.13)) * (1 - combat);
  // a cabeça compensa a inclinação e o giro do tronco: o olhar fica estável à frente
  R.head.rotation.set(-lean * 0.8 - hunch * 0.85 - 0.06 * combat + 0.03 * idle, -sp * (0.16 + 0.08 * run) * w * 0.7 + look - R._turn * 0.05, -sp * 0.03 * w);
  R.legL.rotation.set(sp * stride - (0.04 + 0.08 * run) * w - 0.22 * combat, 0, 0.025 + 0.05 * combat);
  R.legR.rotation.set(-sp * stride - (0.04 + 0.08 * run) * w + 0.12 * combat, 0, -0.025 - 0.05 * combat);
  // joelho dobra na perna que vai à frente (balanço) e um pouco no apoio, para amortecer o passo
  const kSwing = 0.75 + 0.75 * run, kStance = 0.12 + 0.12 * run;
  setKnee(R, 0.06 + w * (Math.max(0, -cp) * kSwing + Math.max(0, cp) * Math.max(0, -sp) * kStance) + hunch * 0.5 + 0.38 * combat + Math.max(0, shift) * 0.14 * idle,
    0.06 + w * (Math.max(0, cp) * kSwing + Math.max(0, -cp) * Math.max(0, sp) * kStance) + hunch * 0.5 + 0.3 * combat + Math.max(0, -shift) * 0.14 * idle);
  if (hunch) { R.legL.rotation.x -= hunch * 0.45; R.legR.rotation.x -= hunch * 0.45; R.hips.position.y -= hunch * 0.12; }
  // girando parado: passinhos no lugar em vez de deslizar
  const shuffle = running ? 0 : clamp((Math.abs(R._turn) - 1) / 3, 0, 1);
  if (shuffle > 0) {
    const q = Math.sin(t * 13);
    R.legL.rotation.x += q * 0.28 * shuffle; R.legR.rotation.x -= q * 0.28 * shuffle;
    if (R.kneeL) { R.kneeL.rotation.x += Math.max(0, q) * 0.5 * shuffle; R.kneeR.rotation.x += Math.max(0, -q) * 0.5 * shuffle; }
    R.body.position.y += Math.abs(q) * 0.03 * shuffle;
  }
  restPose(R, kind, w, sw);
  if (combat > 0.01 && !s.action) guardStance(R, kind, combat, t);
  if (R.cape) {
    R.cape.rotation.x = 0.08 + w * 0.22 + run * 0.38 + Math.sin(t * 3.1) * 0.05 + Math.sin(ph * 2) * 0.04 * w + Math.max(0, R._acc) * 0.05;
    R.cape.rotation.z = clamp(R._turn * 0.06, -0.35, 0.35);
    if (R.capeLow) R.capeLow.rotation.x = 0.04 + w * 0.18 + run * 0.2 + Math.sin(t * 4.6 + 1) * 0.1 * (0.4 + w) + (s.action === 'whirl' ? 0.9 : 0);
  }
  if (R.skirt) R.skirt.rotation.x = -0.06 * w + Math.sin(ph * 2) * 0.03 * w;
  if (R.familiar) {
    R.familiar.rotation.y += dt * 1.6;
    R.familiar.position.y = 1.75 + Math.sin(t * 2.3) * 0.12;
    if (R.familiarGem) R.familiarGem.rotation.y += dt * 3;
  }
  // piscar
  if (R.eyes?.length) {
    R.blinkT -= dt;
    const closed = R.blinkT < 0.09;
    for (const e of R.eyes) e.scale.y = closed ? 0.012 : (e.userData.sy ??= e.scale.y);
    if (R.blinkT <= 0) R.blinkT = 2 + Math.random() * 3.5;
  }
  if (R.jaw) R.jaw.rotation.x = 0;
  R.flourishFx = null;
  if (s.idleT > 0 && !s.action && !s.emote && w < 0.05 && combat < 0.05) flourish(R, kind, s.idleT, t);
  const p = s.p || 0;
  switch (s.action) {
    case 'slash': {
      if (kind === 'adaga' && s.variant % 3 === 1) {
        // garras/adaga: arranhão duplo em X (os dois braços cruzam na frente)
        const wind = seg(p, 0, 0.28), cut = seg(p, 0.28, 0.5), back = seg(p, 0.65, 1), k = 1 - back;
        for (const [arm, sd] of [[R.armR, 1], [R.armL, -1]]) { arm.rotation.x = lerp(lerp(-0.3, -2.2, wind), -0.7, cut) * k - 0.3 * back; arm.rotation.z = lerp(lerp(0, 0.5 * sd, wind), -0.5 * sd, cut) * k; }
        setElb(R, lerp(lerp(-0.45, -1.3, wind), -0.3, cut) * k - 0.45 * back, lerp(lerp(-0.45, -1.3, wind), -0.3, cut) * k - 0.45 * back);
        R.torso.rotation.x = lerp(-0.2 * wind, 0.4, cut) * k + hunch;
        R.body.position.z = 0.22 * cut * k; R.body.position.y -= 0.08 * cut * k;
        setKnee(R, 0.15 + 0.45 * cut * k, 0.15 + 0.3 * cut * k);
        if (R.jaw) R.jaw.rotation.x = 0.5 * Math.sin(p * Math.PI);
        break;
      }
      if (kind === 'adaga' && s.variant % 3 === 2) {
        // bote: agacha, salta para frente com os braços abertos e cai cravando
        const crouch = seg(p, 0, 0.28), jump = seg(p, 0.28, 0.5), land = seg(p, 0.5, 0.62), back = seg(p, 0.7, 1), k = 1 - back;
        const air = Math.sin(Math.min(1, Math.max(0, (p - 0.28) / 0.34)) * Math.PI);
        R.body.position.y += (-0.18 * crouch * (1 - jump) + 0.45 * air) * k; R.body.position.z = (0.55 * jump) * k;
        R.torso.rotation.x = (0.45 * crouch * (1 - jump) + 0.15 * jump + 0.4 * land) * k + hunch;
        for (const [arm, sd] of [[R.armR, 1], [R.armL, -1]]) { arm.rotation.x = lerp(lerp(0.4, -2.0, jump), -0.9, land) * k; arm.rotation.z = 0.5 * sd * jump * (1 - land) * k; }
        setElb(R, -0.5 * k, -0.5 * k);
        setKnee(R, (1.0 * crouch * (1 - jump) + 0.6 * air + 0.5 * land) * k + 0.06, (1.0 * crouch * (1 - jump) + 0.6 * air + 0.5 * land) * k + 0.06);
        if (R.jaw) R.jaw.rotation.x = 0.6 * air;
        break;
      }
      if (kind === 'adaga') {
        // estocada rápida
        const wind = seg(p, 0, 0.28), thrust = seg(p, 0.28, 0.45), back = seg(p, 0.6, 1);
        const k = 1 - back;
        R.armR.rotation.x = lerp(lerp(-0.3, 0.45, wind), -1.55, thrust) * k + -0.3 * back;
        setElb(R, null, lerp(lerp(-0.45, -1.7, wind), -0.05, thrust) * k + -0.45 * back);
        R.handR.rotation.x = lerp(0.25, 1.1, thrust) * k;
        R.torso.rotation.y = lerp(lerp(0, 0.5, wind), -0.35, thrust) * k;
        R.body.position.z = 0.28 * thrust * k;
        setKnee(R, 0.5 * thrust * k + 0.15, 0.15);
        if (R.jaw) R.jaw.rotation.x = 0.4 * thrust * k;
      } else if (s.variant % 3 === 2) {
        // golpe pesado: salto curto e golpe de cima para baixo com as duas mãos
        const up = seg(p, 0, 0.3), down = seg(p, 0.3, 0.48), back = seg(p, 0.66, 1), k = 1 - back;
        const a = lerp(lerp(-0.3, -2.9, up), -0.15, down);
        R.armR.rotation.x = a * k - 0.3 * back; R.armL.rotation.x = (rig_shield(R) ? -0.5 : a * 0.9) * k + (rig_shield(R) ? -0.45 * back : 0);
        setElb(R, rig_shield(R) ? null : lerp(-0.6, -0.1, down) * k, lerp(lerp(-0.45, -0.9, up), -0.05, down) * k - 0.45 * back);
        R.handR.rotation.x = lerp(0.2, 1.2, down) * k;
        R.body.position.y += Math.sin(Math.min(1, p / 0.48) * Math.PI) * 0.32 * k;
        R.torso.rotation.x = lerp(-0.15 * up, 0.5, down) * k + hunch;
        R.body.position.z = 0.2 * down * k;
        setKnee(R, lerp(0.8 * up, 0.9, down) * k + 0.06, lerp(0.8 * up, 0.3, down) * k + 0.06);
        R.hips.position.y -= 0.12 * down * k;
      } else if (s.variant % 2 === 0) {
        // diagonal de cima para baixo com passo à frente
        const up = seg(p, 0, 0.28), down = seg(p, 0.28, 0.5), back = seg(p, 0.65, 1), k = 1 - back;
        R.armR.rotation.x = lerp(lerp(R.armR.rotation.x, -2.65, up), -0.35, down) * k + R.armR.rotation.x * back;
        R.armR.rotation.z = lerp(0, -0.35, up) * (1 - down) * k;
        setElb(R, null, lerp(lerp(-0.45, -0.95, up), -0.08, down) * k - 0.45 * back);
        R.handR.rotation.x = lerp(lerp(0.25, -0.3, up), 1.0, down) * k + 0.25 * back;
        R.torso.rotation.y = lerp(lerp(0, 0.5, up), -0.6, down) * k;
        R.torso.rotation.x = 0.1 - 0.12 * up * (1 - down) + down * 0.28 * k + hunch;
        R.hips.rotation.y = lerp(0.15 * up, -0.2, down) * k;
        R.body.position.z = 0.22 * down * k;
        setKnee(R, 0.06 + 0.5 * down * k, 0.06 + 0.2 * down * k);
        R.legL.rotation.x = -0.35 * down * k; R.legR.rotation.x = 0.25 * down * k;
      } else {
        // corte horizontal
        const wind = seg(p, 0, 0.25), cut = seg(p, 0.25, 0.5), back = seg(p, 0.65, 1), k = 1 - back;
        R.armR.rotation.x = lerp(R.armR.rotation.x, -1.5, Math.max(wind, cut) * k);
        R.armR.rotation.z = lerp(0, 0.45, wind * (1 - cut)) * k;
        setElb(R, null, lerp(-1.1, -0.1, cut) * Math.max(wind, cut) * k - 0.45 * back);
        R.torso.rotation.y = lerp(lerp(0, 1.1, wind), -1.05, cut) * k;
        R.hips.rotation.y = lerp(0.35 * wind, -0.35, cut) * k;
        R.body.position.z = 0.15 * cut * k;
        setKnee(R, 0.06 + 0.35 * Math.max(wind, cut) * k, 0.06 + 0.35 * Math.max(wind, cut) * k);
        R.hips.position.y -= 0.06 * Math.max(wind, cut) * k;
      }
      if (R.jaw && kind !== 'adaga') R.jaw.rotation.x = 0.35 * Math.sin(p * Math.PI);
      break;
    }
    case 'whirl': {
      R.body.rotation.y = p * TAU * 2;
      R.armR.rotation.x = -1.55; R.armR.rotation.z = -0.35; R.handR.rotation.x = 0.25; setElb(R, -0.3, -0.05);
      R.armL.rotation.x = -1.3; R.armL.rotation.z = 0.6;
      R.hips.position.y = 0.8; setKnee(R, 0.75, 0.75); R.legL.rotation.x = -0.4; R.legR.rotation.x = -0.4;
      R.torso.rotation.x = 0.2;
      break;
    }
    case 'charge': {
      R.torso.rotation.x = 0.6; R.armR.rotation.x = -1.4; R.handR.rotation.x = 0.4; setElb(R, null, -0.3);
      if (R.shield) { R.armL.rotation.x = -1.45; setElb(R, -0.5, null); R.handL.rotation.x = 1.0; }
      const q = t * 30;
      R.legL.rotation.x = Math.sin(q) * 0.95; R.legR.rotation.x = -Math.sin(q) * 0.95;
      setKnee(R, 0.2 + Math.max(0, -Math.cos(q)) * 1.4, 0.2 + Math.max(0, Math.cos(q)) * 1.4);
      R.body.position.y = Math.abs(Math.cos(q)) * 0.1;
      break;
    }
    case 'guard': {
      const k = seg(p, 0, 0.15) * (1 - seg(p, 0.85, 1));
      R.hips.position.y = 0.92 - 0.16 * k; setKnee(R, 0.06 + 0.6 * k, 0.06 + 0.6 * k);
      R.legL.rotation.x = -0.35 * k; R.legR.rotation.x = 0.2 * k;
      R.armL.rotation.x = lerp(R.armL.rotation.x, -1.45, k); setElb(R, lerp(-0.85, -0.6, k), null); R.handL.rotation.x = lerp(R.handL.rotation.x, 1.1, k);
      R.armR.rotation.x = lerp(R.armR.rotation.x, -2.2, k);
      break;
    }
    case 'slam': {
      const up = seg(p, 0, 0.35), down = seg(p, 0.35, 0.5), back = seg(p, 0.7, 1), k = 1 - back;
      const a = lerp(lerp(R.armR.rotation.x, -2.9, up), -0.2, down) * k + R.armR.rotation.x * back;
      R.armR.rotation.x = a; R.armL.rotation.x = a;
      setElb(R, lerp(-0.7 * up, -0.05, down) * k, lerp(-0.7 * up, -0.05, down) * k);
      R.handR.rotation.x = down * 0.9 * k;
      R.body.position.y += Math.sin(Math.min(1, p / 0.5) * Math.PI) * 0.4 * k;
      R.hips.position.y = 0.92 - 0.3 * down * k;
      setKnee(R, 0.06 + (0.9 * up * (1 - down) + 1.1 * down) * k, 0.06 + (0.9 * up * (1 - down) + 1.1 * down) * k);
      R.legL.rotation.x = -0.5 * down * k; R.legR.rotation.x = -0.5 * down * k;
      R.torso.rotation.x = 0.1 - 0.2 * up * (1 - down) + 0.5 * down * k;
      break;
    }
    case 'shoot': {
      const aim = seg(p, 0, 0.18) * (1 - seg(p, 0.75, 1));
      const draw = seg(p, 0.05, 0.45) * (1 - seg(p, 0.48, 0.54));
      const release = seg(p, 0.48, 0.56) * (1 - seg(p, 0.7, 1));
      R.torso.rotation.y = lerp(R.torso.rotation.y, -0.6, aim);
      R.hips.rotation.y = lerp(R.hips.rotation.y, -0.25, aim);
      R.armL.rotation.x = lerp(R.armL.rotation.x, -1.55, aim); R.armL.rotation.y = 0.5 * aim; setElb(R, lerp(-0.25, -0.02, aim), null);
      R.handL.rotation.x = lerp(-1.42, -0.05, aim);
      R.armR.rotation.x = lerp(R.armR.rotation.x, -1.5, aim); R.armR.rotation.y = 0.45 * aim;
      R.armR.rotation.z = 0.3 * draw - 0.45 * release;
      setElb(R, null, lerp(-0.2, -1.75, draw) * aim + 0.2 * release);
      R.head.rotation.y = 0.45 * aim;
      R.body.position.z -= 0.06 * release;
      R.bowDraw = draw;
      setKnee(R, 0.06 + 0.25 * aim, 0.06 + 0.15 * aim);
      R.legL.rotation.x += -0.2 * aim; R.legR.rotation.x += 0.15 * aim;
      break;
    }
    case 'cast': {
      const k = seg(p, 0, 0.3) * (1 - seg(p, 0.65, 1));
      const push = seg(p, 0.25, 0.4) * (1 - seg(p, 0.65, 1));
      if (kind === 'cajado' || kind === 'varinha') {
        R.armR.rotation.x = lerp(R.armR.rotation.x, -1.4, k); setElb(R, null, lerp(-1.0, -0.05, push) * k - 0.35 * (1 - k)); R.handR.rotation.x = lerp(-1.0, 0.5, k);
      } else { R.armR.rotation.x = lerp(R.armR.rotation.x, -1.5, k); setElb(R, null, lerp(-0.8, 0, push)); }
      R.armL.rotation.x = lerp(R.armL.rotation.x, -1.2, k * 0.8); R.armL.rotation.z = -0.35 * k; setElb(R, lerp(-0.2, -0.6, k), null);
      R.torso.rotation.x = 0.1 + 0.2 * push + hunch; R.torso.rotation.y = lerp(0.25 * k, -0.2, push);
      R.body.position.z = 0.1 * push - 0.05 * seg(p, 0.45, 0.65);
      setKnee(R, 0.06 + 0.35 * push, 0.06 + 0.15 * push);
      R.legL.rotation.x += -0.25 * push;
      break;
    }
    case 'castUp': {
      const crouch = seg(p, 0, 0.15) * (1 - seg(p, 0.15, 0.3));
      const k = seg(p, 0.1, 0.35) * (1 - seg(p, 0.75, 1));
      R.armR.rotation.x = lerp(R.armR.rotation.x, -2.85, k); R.armL.rotation.x = lerp(R.armL.rotation.x, -2.85, k);
      R.armR.rotation.z = 0.3 * k; R.armL.rotation.z = -0.3 * k; setElb(R, -0.25 * k, -0.25 * k);
      if (kind === 'cajado' || kind === 'varinha') R.handR.rotation.x = lerp(-1.0, 1.3, k);
      R.head.rotation.x = -0.4 * k;
      R.body.position.y += 0.18 * k - 0.1 * crouch;
      setKnee(R, 0.06 + 0.7 * crouch, 0.06 + 0.7 * crouch);
      R.torso.rotation.x = -0.15 * k + hunch;
      break;
    }
    case 'throw': {
      const up = seg(p, 0, 0.45), fw = seg(p, 0.45, 0.65), back = seg(p, 0.7, 1), k = 1 - back;
      R.armR.rotation.x = lerp(lerp(R.armR.rotation.x, -2.6, up), -0.6, fw) * k;
      setElb(R, null, lerp(-1.2 * up, -0.1, fw) * k);
      R.armL.rotation.x = -0.9 * up * (1 - fw) * k;
      R.torso.rotation.y = lerp(0.5 * up, -0.4, fw) * k;
      R.body.position.z = 0.12 * fw * k;
      setKnee(R, 0.06 + 0.4 * fw * k + hunch * 0.5, 0.06 + hunch * 0.5);
      break;
    }
    case 'roll': {
      const k = Math.sin(p * Math.PI);
      R.body.rotation.x = p * TAU;
      R.body.position.y = k * 0.45;
      R.hips.position.y = 0.92 - k * 0.38;
      R.legL.rotation.x = -1.3 * k; R.legR.rotation.x = -1.3 * k; setKnee(R, 2.1 * k, 2.1 * k);
      R.armL.rotation.x = -1.0; R.armR.rotation.x = -1.0; setElb(R, -1.4 * k, -1.4 * k);
      R.torso.rotation.x = 0.5 * k;
      break;
    }
    case 'leap': {
      const k = Math.sin(p * Math.PI);
      R.body.rotation.x = -p * TAU;
      R.body.position.y = k * 1.4;
      R.legL.rotation.x = -1.3 * k; R.legR.rotation.x = -1.0 * k; setKnee(R, 1.9 * k, 1.6 * k);
      setElb(R, -1.0 * k, -1.0 * k);
      break;
    }
    case 'phase': {
      const k = Math.sin(p * Math.PI);
      R.torso.rotation.x = 0.45 * k;
      R.body.position.y = 0.3 * k;
      R.armL.rotation.x = -0.8 * k; R.armL.rotation.z = -0.6 * k; R.armR.rotation.z = 0.6 * k;
      setKnee(R, 0.8 * k, 0.8 * k); R.legL.rotation.x = -0.5 * k; R.legR.rotation.x = -0.5 * k;
      break;
    }
    case 'victory': {
      const k = seg(p, 0, 0.15) * (1 - seg(p, 0.85, 1));
      R.armR.rotation.x = lerp(R.armR.rotation.x, -2.95, k); R.armL.rotation.x = lerp(R.armL.rotation.x, -2.95, k);
      R.armR.rotation.z = 0.3 * k; R.armL.rotation.z = -0.3 * k; setElb(R, -0.2 * k, -0.2 * k);
      R.body.position.y += Math.abs(Math.sin(p * Math.PI * 3)) * 0.35 * k;
      R.head.rotation.x = -0.3 * k;
      break;
    }
    default: break;
  }
  if (s.emote && !s.action && w < 0.05) emote(R, s);
  if (s.hurt > 0) {
    // tranco: tronco para trás e para um lado, cabeça chicoteia, joelhos cedem um pouco
    const h = s.hurt, side = (s.hurtSide || 1);
    R.torso.rotation.x -= h * 0.42; R.torso.rotation.z += h * 0.16 * side; R.torso.rotation.y += h * 0.12 * side;
    R.head.rotation.x -= h * 0.32; R.head.rotation.z -= h * 0.12 * side;
    R.body.position.z -= h * 0.12;
    setElb(R, -0.6 * h, R.elbowR ? R.elbowR.rotation.x - 0.25 * h : null);
    if (R.kneeL) { R.kneeL.rotation.x += 0.25 * h; R.kneeR.rotation.x += 0.25 * h; }
  }
  if (s.alert > 0) { R.head.rotation.x -= s.alert * 0.25; if (R.jaw) R.jaw.rotation.x = 0.3 * s.alert; }
  if (s.dead > 0) {
    if (!R._deathPick || s.dead < (R._lastDead || 0)) R._deathVar = Math.random() < 0.5 ? 1 : 0;
    R._deathPick = true; R._lastDead = s.dead;
    // cambaleia, cai de joelhos e tomba (para trás ou de cara no chão); a cabeça bate e quica de leve
    const d = ease(Math.max(0, (s.dead - 0.18) / 0.82));
    const kneel = ease(Math.min(1, s.dead * 2.2));
    const stag = Math.sin(Math.min(1, s.dead / 0.25) * Math.PI);
    R.torso.rotation.z += stag * 0.25; R.head.rotation.z -= stag * 0.2;
    setKnee(R, 1.4 * kneel * (1 - d * 0.7), 1.2 * kneel * (1 - d * 0.7));
    R.hips.position.y = 0.92 - 0.4 * kneel * (1 - d);
    if (R._deathVar === 1) {
      R.body.rotation.x = d * Math.PI / 2 * 0.96;
      R.body.position.y = d * 0.38;
      R.armL.rotation.x = -d * 1.2 - kneel * 0.3; R.armR.rotation.x = -d * 1.5; R.armL.rotation.z = -0.5 * d; R.armR.rotation.z = 0.4 * d; setElb(R, -0.9 * d, -0.6 * d);
      R.head.rotation.y = 0.9 * d;
      R.legL.rotation.x = -d * 0.1 - kneel * 0.6 * (1 - d); R.legR.rotation.x = d * 0.15 - kneel * 0.4 * (1 - d);
    } else {
      R.body.rotation.x = -d * Math.PI / 2;
      R.body.position.y = d * 0.25;
      R.armL.rotation.x = -d * 2.6; R.armR.rotation.x = -d * 2.4; setElb(R, -0.4 * d, -0.4 * d);
      R.legL.rotation.x = d * 0.2 - kneel * 0.6 * (1 - d); R.legR.rotation.x = -d * 0.15 - kneel * 0.4 * (1 - d);
    }
    const bounce = d >= 1 ? 0 : Math.max(0, Math.sin((d - 0.85) / 0.15 * Math.PI)) * 0.06;
    R.body.position.y += bounce;
  } else R._deathPick = false;
  // nadando (estilo Minecraft): parado fica "boiando" de pé batendo os braços; andando deita na água e dá braçadas
  if (s.swim > 0.03) {
    const sw = s.swim, mv = Math.min(1, w * 1.6), ph2 = t * (4 + mv * 3);
    const pitch = sw * (0.25 + 1.15 * mv);
    R.body.rotation.x = pitch;
    R.body.position.y = sw * (0.15 + 0.55 * mv) + Math.sin(ph2 * 0.5) * 0.04;
    R.body.position.z = 0;
    if (R.torso) R.torso.rotation.x = 0;
    if (R.head) R.head.rotation.x = -pitch * 0.8; // olha para a frente, não para o fundo
    // braçadas alternadas (crawl) ao nadar; parado, mãos remando para os lados
    const aL = mv > 0.2 ? -1.6 - Math.sin(ph2) * 1.5 : -0.4 + Math.sin(ph2) * 0.5;
    const aR = mv > 0.2 ? -1.6 + Math.sin(ph2) * 1.5 : -0.4 - Math.sin(ph2) * 0.5;
    R.armL.rotation.set(aL * sw, 0, (mv > 0.2 ? 0.25 : 0.9) * sw); R.armR.rotation.set(aR * sw, 0, -(mv > 0.2 ? 0.25 : 0.9) * sw);
    if (R.elbowL) { R.elbowL.rotation.x = -0.3 * sw; R.elbowR.rotation.x = -0.3 * sw; }
    // pernas batendo (pernada curta e rápida)
    const kick = Math.sin(t * (9 + mv * 5)) * (0.25 + 0.2 * mv);
    R.legL.rotation.set(kick * sw, 0, 0.06); R.legR.rotation.set(-kick * sw, 0, -0.06);
    if (R.kneeL) { R.kneeL.rotation.x = (0.2 + Math.max(0, kick)) * sw; R.kneeR.rotation.x = (0.2 + Math.max(0, -kick)) * sw; }
    return;
  }
  // pés no chão: ajusta a altura do quadril ao comprimento real das pernas dobradas (parado, guarda, golpes)
  if (R.kneeL && !AIR.has(s.action) && !(s.dead > 0) && !R.ghost && R.body.position.y < 0.05) {
    const ext = (a, k) => 0.42 * Math.cos(a) + 0.465 * Math.cos(a + k);
    const reach = Math.max(ext(R.legL.rotation.x, R.kneeL.rotation.x), ext(R.legR.rotation.x, R.kneeR.rotation.x));
    const g = clamp(1 - w * 3, 0, 1);
    R.hips.position.y = lerp(R.hips.position.y, reach + 0.035 - R.body.position.y, g);
  }
  if (R.ghost) R.body.position.y += 0.25 + Math.sin(t * 1.5) * 0.12;
}

// ---- Gestos parados (só o jogador): depois de alguns segundos sem fazer nada, um gesto por vez ----
// guerreiro apoia a arma no ombro / alonga / olha em volta; mago gira o cajado / acende a palma;
// arqueiro testa a corda / vigia o horizonte com a mão na testa.
const FL_START = 6, FL_CYCLE = 9, FL_DUR = 3.2;
function flourish(R, kind, idleT, t) {
  if (idleT < FL_START) return;
  const n = Math.floor((idleT - FL_START) / FL_CYCLE), q = ((idleT - FL_START) % FL_CYCLE) / FL_DUR;
  if (q >= 1) return;
  const env = seg(q, 0, 0.18) * (1 - seg(q, 0.8, 1)); // entra e sai suave
  if (env <= 0) return;
  const melee = ['espada', 'machado', 'clava', 'adaga', 'montante'].includes(kind);
  const magic = ['cajado', 'varinha', 'orbe'].includes(kind);
  const bow = ['arco', 'arco_longo', 'sling'].includes(kind);
  const v = (n + (R._flSeed ??= Math.floor(Math.random() * 3))) % 3;
  const L = (a, b) => lerp(a, b, env);
  if (v === 2 || (!melee && !magic && !bow)) {
    // alongamento: braços para cima, tronco arqueia para trás, um bocejo
    const st = Math.sin(Math.min(1, q / 0.55) * Math.PI * 0.5);
    R.armR.rotation.x = L(R.armR.rotation.x, -2.95 * st); R.armL.rotation.x = L(R.armL.rotation.x, -2.95 * st);
    R.armR.rotation.z = L(R.armR.rotation.z, 0.32); R.armL.rotation.z = L(R.armL.rotation.z, -0.32);
    setElb(R, L(R.elbowL ? R.elbowL.rotation.x : 0, -0.25), L(R.elbowR ? R.elbowR.rotation.x : 0, -0.25));
    R.torso.rotation.x -= 0.18 * env * st; R.head.rotation.x -= 0.35 * env * st;
    R.body.position.y += 0.04 * env * st;
    if (R.jaw) R.jaw.rotation.x = 0.35 * env * Math.max(0, Math.sin(q * Math.PI * 1.6));
    return;
  }
  if (melee) {
    if (v === 0) {
      // arma no ombro e gira o ombro livre
      R.armR.rotation.x = L(R.armR.rotation.x, -2.25); R.armR.rotation.z = L(R.armR.rotation.z, -0.32);
      setElb(R, null, L(R.elbowR ? R.elbowR.rotation.x : 0, -2.05)); R.handR.rotation.x = L(R.handR.rotation.x, -0.6);
      R.torso.rotation.z += Math.sin(t * 2.4) * 0.05 * env; R.torso.rotation.y -= 0.12 * env;
      R.head.rotation.y = L(R.head.rotation.y, 0.35 + Math.sin(t * 1.3) * 0.15); R.head.rotation.z = L(R.head.rotation.z, -0.12);
      R.hips.rotation.z += 0.05 * env;
    } else {
      // examina a lâmina: levanta a arma na frente do rosto e vira o pulso
      R.armR.rotation.x = L(R.armR.rotation.x, -1.35); R.armR.rotation.y = L(R.armR.rotation.y, -0.5);
      setElb(R, null, L(R.elbowR ? R.elbowR.rotation.x : 0, -1.35));
      R.handR.rotation.y = L(0, Math.sin(q * Math.PI * 3) * 0.6); R.handR.rotation.x = L(R.handR.rotation.x, -0.2);
      R.head.rotation.y = L(R.head.rotation.y, -0.35); R.head.rotation.x = L(R.head.rotation.x, 0.12);
      R.torso.rotation.y += 0.1 * env;
    }
    return;
  }
  if (magic) {
    if (v === 0) {
      // gira o cajado na mão, à frente do corpo
      R.armR.rotation.x = L(R.armR.rotation.x, -0.95); setElb(R, null, L(R.elbowR ? R.elbowR.rotation.x : 0, -0.9));
      R.handR.rotation.z = env * Math.sin(Math.min(1, q / 0.8) * Math.PI * 4) * 1.4; R.handR.rotation.x = L(R.handR.rotation.x, -0.2);
      R.head.rotation.x = L(R.head.rotation.x, 0.15); R.head.rotation.y = L(R.head.rotation.y, 0.2);
    } else {
      // acende a palma da mão livre e olha para ela
      R.armL.rotation.x = L(R.armL.rotation.x, -1.05); R.armL.rotation.y = L(R.armL.rotation.y, 0.35);
      setElb(R, L(R.elbowL ? R.elbowL.rotation.x : 0, -1.25), null); R.handL.rotation.z = L(0, -1.2);
      R.head.rotation.x = L(R.head.rotation.x, 0.35); R.head.rotation.y = L(R.head.rotation.y, -0.3);
      R.torso.rotation.y -= 0.1 * env;
      if (env > 0.6) R.flourishFx = 'palm';
    }
    return;
  }
  // arco
  if (v === 0) {
    // testa a corda: arco à frente, dedilha a corda duas vezes
    const pluck = Math.max(0, Math.sin(q * Math.PI * 4)) * env;
    R.armL.rotation.x = L(R.armL.rotation.x, -1.25); R.armL.rotation.y = L(R.armL.rotation.y, 0.45); setElb(R, L(R.elbowL ? R.elbowL.rotation.x : 0, -0.45), null);
    R.handL.rotation.x = L(R.handL.rotation.x, -0.9);
    R.armR.rotation.x = L(R.armR.rotation.x, -1.2); R.armR.rotation.y = L(R.armR.rotation.y, 0.3); setElb(R, null, L(R.elbowR ? R.elbowR.rotation.x : 0, -1.3) - 0.35 * pluck);
    R.bowDraw = 0.18 * pluck;
    R.head.rotation.y = L(R.head.rotation.y, 0.25); R.head.rotation.x = L(R.head.rotation.x, 0.2);
  } else {
    // vigia o horizonte com a mão na testa, virando a cabeça devagar
    R.armR.rotation.x = L(R.armR.rotation.x, -2.35); R.armR.rotation.z = L(R.armR.rotation.z, 0.25);
    setElb(R, null, L(R.elbowR ? R.elbowR.rotation.x : 0, -2.3)); R.handR.rotation.x = L(R.handR.rotation.x, 0.4);
    const scan = Math.sin(q * Math.PI * 1.6 - 0.8) * 0.7;
    R.head.rotation.y = L(R.head.rotation.y, scan); R.head.rotation.x = L(R.head.rotation.x, -0.1);
    R.torso.rotation.y += scan * 0.25 * env;
  }
}
const AIR = new Set(['roll', 'leap', 'whirl', 'phase', 'charge', 'victory']);
const rig_shield = (R) => !!R.shield;

function emote(R, s) {
  const t = s.t;
  switch (s.emote) {
    case 'wave':
      R.armR.rotation.x = -2.75; R.armR.rotation.z = -0.25 + Math.sin(t * 9) * 0.35; R.handR.rotation.x = -1.3;
      break;
    case 'dance':
      R.body.rotation.y = Math.sin(t * 4) * 0.7;
      R.body.position.y = Math.abs(Math.sin(t * 8)) * 0.18;
      R.armR.rotation.x = -2.3 + Math.sin(t * 8) * 0.6; R.armL.rotation.x = -2.3 - Math.sin(t * 8) * 0.6;
      R.legL.rotation.x = Math.max(0, Math.sin(t * 8)) * -0.6; R.legR.rotation.x = Math.max(0, -Math.sin(t * 8)) * -0.6;
      break;
    case 'cheer':
      R.armR.rotation.x = -2.95; R.armL.rotation.x = -2.95; R.armR.rotation.z = 0.35; R.armL.rotation.z = -0.35;
      R.body.position.y = Math.abs(Math.sin(t * 6)) * 0.35;
      break;
    case 'sit':
      R.hips.position.y = 0.42; R.legL.rotation.x = -1.45; R.legR.rotation.x = -1.45;
      R.armL.rotation.x = -0.6; R.armR.rotation.x = -0.6; R.torso.rotation.x = -0.1;
      break;
    case 'bow':
      R.torso.rotation.x = 0.75; R.head.rotation.x = 0.3; R.armR.rotation.x = -0.9; R.handR.rotation.x = 0;
      break;
    default: break;
  }
}

function slime(R, s, dt) {
  const w = s.move || 0;
  R.ph = (R.ph || 0) + dt * (4 + w * 5);
  const t = s.t || 0;
  const hop = Math.max(0, Math.sin(R.ph)) * w;
  // gelatina: achata ao tocar o chão e estica no ar
  let sy = 1 + (hop - 0.3 * w) * 0.22 + Math.sin(t * 3.2) * 0.03, sxz = 1 - (hop - 0.3 * w) * 0.11 - Math.sin(t * 3.2) * 0.015;
  let y = hop * 0.6, z = 0, mouth = 0.05 + Math.sin(t * 2) * 0.01, lean = 0;
  if (R.float) { // cérebro flutuante: sem pulos, só paira e pulsa
    const pulse = Math.sin(t * 2.4) * 0.04;
    sy = 1 + pulse; sxz = 1 - pulse * 0.5; y = Math.sin(t * 1.3) * 0.18; lean = Math.sin(t * 0.9) * 0.06 + w * 0.12;
    if (s.action) {
      const p = s.p || 0;
      if (p < 0.6) { const k = ease(p / 0.6); sy = 1 + 0.18 * k; sxz = 1 + 0.18 * k; y += 0.35 * k; lean = -0.25 * k; }
      else { const k = Math.sin(((p - 0.6) / 0.4) * Math.PI); sy = 1 - 0.12 * k; sxz = 1 + 0.1 * k; lean = 0.4 * k; z = 0.3 * k; }
    }
    if (s.hurt > 0) { sxz *= 1 + s.hurt * 0.15; lean -= s.hurt * 0.3; }
    if (s.dead > 0) { const d = ease(s.dead); y = -1.15 * d; lean = d * 0.9; }
    R.body.scale.set(sxz, sy, sxz); R.body.position.set(0, y, z); R.body.rotation.x = lean;
    const wig = s.action ? 0.7 : 0.32;
    if (R.tents) R.tents.forEach((segs, i) => segs.forEach((g, j) => {
      const b = (g.userData.b ??= { x: g.rotation.x, z: g.rotation.z });
      g.rotation.x = b.x + Math.sin(t * 3 + i * 1.3 - j * 0.9) * wig * (0.6 + j * 0.3);
      g.rotation.z = b.z + Math.cos(t * 2.4 + i * 1.7 - j * 0.9) * wig * 0.6;
    }));
    if (R.stem) R.stem.rotation.x = 0.35 + Math.sin(t * 1.7) * 0.15;
    if (R.orbit) { R.orbit.rotation.y += dt * (s.action ? 3 : 0.9); R.orbit.position.y = 0.15 + Math.sin(t * 1.1) * 0.1; }
    if (R.puddle) { R.puddle.scale.set(1.1 / sxz, 0.05, 1.1 / sxz); R.puddle.position.y = 0.03 - y / sy; }
    R.core.rotation.y += dt * 2;
    if (R.eyes) for (const e of R.eyes) e.scale.y = s.dead > 0.3 ? 0.15 : 1;
    return;
  }
  let spin = 0;
  if (s.action === 'attack') {
    const p = s.p || 0, v = s.variant || 0;
    if (v % 3 === 1) { // pancada de lado: gira o corpo e bate de raspão
      if (p < 0.6) { const k = ease(p / 0.6); sy = 1 - 0.25 * k; sxz = 1 + 0.15 * k; spin = -0.6 * k; mouth = 0.08; }
      else { const k = Math.sin(((p - 0.6) / 0.4) * Math.PI), q = (p - 0.6) / 0.4; spin = -0.6 + q * (Math.PI * 2 + 0.6); sy = 1 + 0.15 * k; z = k * 0.5; y = k * 0.2; mouth = 0.14 * k + 0.04; }
    } else if (v % 3 === 2) { // salto esmagador: pula alto e cai achatando
      if (p < 0.6) { const k = ease(p / 0.6); sy = 1 - 0.45 * k; sxz = 1 + 0.3 * k; y = 0; mouth = 0.04; }
      else { const q = (p - 0.6) / 0.4, k = Math.sin(q * Math.PI); y = k * 1.1; z = q * 0.6; sy = q > 0.8 ? 0.55 : 1 + 0.3 * k; sxz = q > 0.8 ? 1.4 : 1 - 0.15 * k; mouth = 0.16 * k + 0.04; }
    } else {
      if (p < 0.6) { const k = ease(p / 0.6); sy = 1 - 0.4 * k; sxz = 1 + 0.28 * k; mouth = 0.05 + 0.1 * k; lean = -0.15 * k; y = 0; }
      else { const k = Math.sin(((p - 0.6) / 0.4) * Math.PI); sy = 1 + 0.4 * k; sxz = 1 - 0.18 * k; z = k * 0.8; y = k * 0.45; mouth = 0.18 * k + 0.04; lean = 0.35 * k; }
    }
  }
  if (R.arms) { // braços de galho do boneco: acenam parados e golpeiam no ataque
    const atk = s.action === 'attack' ? Math.sin((s.p || 0) * Math.PI) : 0;
    R.arms.forEach((a, i) => { const sd = i ? 1 : -1, b = (a.userData.b ??= a.rotation.z); a.rotation.z = b + sd * (Math.sin(t * 2 + i * 2) * 0.12 + atk * 0.9) + sd * s.hurt * 0.4; a.rotation.x = -atk * 0.8; });
  }
  if (s.alert > 0) { sy *= 1 + 0.2 * s.alert; y += 0.2 * s.alert; }
  if (s.hurt > 0) { sy *= 1 - s.hurt * 0.3; sxz *= 1 + s.hurt * 0.22; mouth = 0.14; }
  if (s.dead > 0) { const d = ease(s.dead); sy *= 1 - d * 0.88; sxz *= 1 + d * 0.7; y = 0; mouth = 0.02; }
  R.body.scale.set(sxz, sy, sxz);
  R.body.position.set(0, y, z);
  R.body.rotation.x = lean; R.body.rotation.y = spin;
  if (R.puddle) { const ground = 1 - Math.min(1, y * 2); R.puddle.scale.set(1.45 * (0.6 + 0.4 * ground) / sxz, 0.16, 1.45 * (0.6 + 0.4 * ground) / sxz); R.puddle.position.y = 0.05 - y / sy; }
  if (R.top) R.top.position.z = -0.06 - (sy - 1) * 0.5;
  if (R.mouth) R.mouth.scale.y = mouth;
  R.core.rotation.y += dt * 2;
  if (R.eyes) {
    R.blinkT = (R.blinkT ?? 2) - dt;
    const closed = R.blinkT < 0.1 || s.dead > 0.3;
    for (const e of R.eyes) e.scale.y = closed ? 0.15 : (s.action === 'attack' ? 0.75 : 1);
    if (R.blinkT <= 0) R.blinkT = 1.5 + Math.random() * 3;
  }
}

function wolf(R, s, dt) {
  const w = s.move || 0, t = s.t || 0, p = s.p || 0, v = s.variant || 0, st = R.style || 'wolf';
  const insect = st === 'aranha' || st === 'caranguejo' || st === 'escorpiao' || st === 'besouro' || st === 'jabuti' || st === 'jacare' || st === 'basilisco'; // (répteis andam em pares cruzados, como os bichos de casca)
  if (R.heads) {
    const atk = s.action === 'attack' ? Math.sin(p * Math.PI) : 0;
    R.heads.forEach((h, i) => { const b = (h.userData.b ??= h.rotation.y); h.rotation.x = Math.sin(t * 2.1 + i * 2.5) * 0.14 + atk * (0.35 + 0.25 * ((v + i) % 2)); h.rotation.y = b + Math.sin(t * 1.3 + i * 4) * 0.25 - atk * Math.sign(b || 1) * 0.2; });
  }
  const run = ease((w - 0.45) / 0.5);
  R.ph = (R.ph || 0) + dt * (insect ? 4 + w * 16 : 3 + w * (9 + run * 3));
  const ph = R.ph;
  // passada: bichos de casca andam em "trípode" (pernas cruzadas juntas, passinhos rápidos); os outros galopam
  const offs = insect ? [0, Math.PI, Math.PI, 0] : [0, 0.55 + run * 0.4, Math.PI, Math.PI + 0.55 + run * 0.4];
  for (let i = 0; i < R.legs.length; i++) {
    const a = ph + offs[i % 4], front = i < 2;
    if (insect) {
      R.legs[i].rotation.x = Math.sin(a) * 0.4 * w; R.legs[i].rotation.y = Math.cos(a) * 0.3 * w * (i % 2 ? 1 : -1);
      if (R.lows) R.lows[i].rotation.x = Math.max(0, Math.cos(a)) * 0.6 * w;
    } else {
      R.legs[i].rotation.x = Math.sin(a) * (0.8 + 0.25 * run) * w;
      if (R.lows) R.lows[i].rotation.x = (front ? -1 : 1) * Math.max(0, front ? Math.cos(a) : -Math.cos(a)) * (1.0 + 0.3 * run) * w + (front ? 0 : 0.12);
    }
  }
  const sp = R.spine || R.body;
  const yaw = R.root.rotation.y;
  const yr = dt > 0 && R._ly !== undefined ? wrapA(yaw - R._ly) / dt : 0;
  R._ly = yaw;
  const breathe = Math.sin(t * 2.2), idle = 1 - Math.min(1, w * 3);
  // coluna dobra no galope (estica e encolhe), curva nas viradas
  sp.rotation.set(insect ? 0 : Math.sin(ph * 2) * (0.06 + 0.06 * run) * w, clamp(yr * 0.06, -0.3, 0.3), clamp(-yr * 0.05 * w, -0.25, 0.25));
  sp.scale.set(1, 1 + breathe * 0.02 * idle, 1);
  R.body.position.set(0, insect ? Math.abs(Math.sin(ph * 2)) * 0.03 * w : Math.abs(Math.sin(ph)) * (0.12 + 0.06 * run) * w + breathe * 0.01, 0);
  R.body.rotation.set(0, 0, 0);
  R.head.rotation.set(Math.sin(ph * 2) * 0.1 * w - 0.05 + breathe * 0.02 * idle, Math.sin(t * 0.6) * 0.22 * idle + clamp(yr * 0.05, -0.3, 0.3), Math.sin(t * 0.37) * 0.06 * idle);
  if (R.jaw) R.jaw.rotation.x = 0.05 + (w > 0.5 && !insect ? 0.18 : 0) + Math.max(0, Math.sin(t * 6)) * 0.04 * (1 - idle);
  if (R.tail) { R.tail.rotation.y = Math.sin(t * (insect ? 3 : 7)) * (insect ? 0.12 : 0.35) * (0.4 + w); R.tail.rotation.x = st === 'escorpiao' ? 0.1 * breathe : 0.35 - w * 0.35; }
  if (R.tail2) R.tail2.rotation.y = Math.sin(t * 7 - 0.8) * (st === 'escorpiao' ? 0.15 : 0.4);
  if (R.claws) R.claws.forEach((c, i) => { const b = (c.userData.b ??= { x: c.rotation.x, y: c.rotation.y }); c.rotation.set(b.x + Math.sin(t * 2 + i) * 0.08, b.y + Math.sin(t * 3 + i * 2) * 0.1, 0); });
  if (s.alert > 0) { // rosnado/uivo: cabeça erguida, boca aberta, cauda alta (escorpião ergue o ferrão)
    R.head.rotation.x = -0.95 * s.alert; sp.rotation.x = -0.15 * s.alert;
    if (R.jaw) R.jaw.rotation.x = 0.55 * s.alert; if (R.tail) R.tail.rotation.x = -0.5 * s.alert;
  }
  if (s.action === 'attack') {
    const k2 = (a, b) => ({ wind: seg(p, 0, 0.6), hit: Math.sin(clamp((p - 0.6) / 0.4, 0, 1) * Math.PI), q: clamp((p - 0.6) / 0.4, 0, 1) });
    const { wind, hit, q } = k2();
    const legsAll = (vals, lv) => { for (let i = 0; i < R.legs.length; i++) { R.legs[i].rotation.x = vals[i % 4]; if (R.lows && lv) R.lows[i].rotation.x = lv[i % 4]; } };
    const style = st === 'escorpiao' ? (v % 2 ? 'pinch' : 'sting') : st === 'caranguejo' ? 'crab' : st === 'aranha' ? 'spider' : st === 'besouro' ? 'ram' : st === 'javali' ? 'gore' : st === 'cervo' ? (v % 2 ? 'kick' : 'ram') : st === 'urso' ? (v % 2 ? 'bite' : 'rear') : (v % 3 === 1 ? 'paw' : 'bite');
    switch (style) {
      case 'paw': { // patada: ergue uma pata da frente e golpeia em arco, mordendo junto
        const i = v % 2;
        R.legs[i].rotation.x = lerp(-1.35 * wind, 0.3, q) * (1 - q * 0.6); if (R.lows) R.lows[i].rotation.x = 0.9 * wind * (1 - q);
        sp.rotation.y = (i ? -1 : 1) * (0.3 * wind - 0.5 * hit); sp.rotation.x = -0.2 * wind + 0.15 * hit;
        R.body.position.y = 0.12 * wind; R.body.position.z = 0.35 * hit; R.head.rotation.y = (i ? 1 : -1) * 0.4 * hit;
        if (R.jaw) R.jaw.rotation.x = 0.1 + 0.6 * hit;
        break;
      }
      case 'gore': { // chifrada de presa: abaixa a cabeça raspando a pata e joga o focinho para cima
        R.head.rotation.x = 0.55 * wind - 1.0 * hit; sp.rotation.x = 0.15 * wind - 0.2 * hit;
        R.body.position.y = -0.12 * wind + 0.15 * hit; R.body.position.z = -0.12 * wind + 0.7 * hit;
        R.legs[0].rotation.x = Math.sin(t * 16) * 0.5 * wind * (1 - q); legsAll([undefined, -0.3 * wind, 0.4 * wind, 0.4 * wind].map((x, i) => i ? x : R.legs[0].rotation.x), null);
        break;
      }
      case 'rear': { // urso: fica de pé nas patas de trás com os braços abertos e desaba com as duas patas
        const up = wind * (1 - q), th = 0.95 * up;
        R.body.rotation.x = -th + 0.15 * hit; R.body.position.y = 0.55 * Math.sin(th) + 0.1 * hit; R.body.position.z = -0.35 * Math.sin(th) + 0.4 * hit;
        legsAll([-1.6 * up - 0.4 * hit, -1.6 * up - 0.4 * hit, 0.9 * up, 0.9 * up], [0.6 * up, 0.6 * up, -0.4 * up, -0.4 * up]);
        R.head.rotation.x = -0.4 * up + 0.4 * hit; if (R.jaw) R.jaw.rotation.x = 0.6 * up + 0.3 * hit;
        break;
      }
      case 'kick': { // cervo: empina e dá coice com as patas da frente
        const up = wind * (1 - q * 0.5), th = 0.7 * up;
        R.body.rotation.x = -th; R.body.position.y = 0.6 * Math.sin(th); R.body.position.z = -0.3 * Math.sin(th) + 0.25 * hit;
        legsAll([-1.2 * up + Math.sin(t * 20) * 0.4 * hit, -1.0 * up - Math.sin(t * 20) * 0.4 * hit, 0.7 * up, 0.7 * up], [0.9 * up, 0.9 * up, 0, 0]);
        R.head.rotation.x = -0.6 * up;
        break;
      }
      case 'ram': { // marrada (cervo com a galhada / besouro com o chifre): recua, abaixa a cabeça e investe jogando para cima
        R.head.rotation.x = 0.6 * wind - 0.8 * hit; sp.rotation.x = 0.12 * wind;
        R.body.position.z = -0.2 * wind + 0.8 * hit; R.body.position.y = -0.1 * wind + 0.1 * hit;
        legsAll([0.4 * wind - 0.8 * hit, 0.4 * wind - 0.8 * hit, -0.3 * wind + 0.7 * hit, -0.3 * wind + 0.7 * hit], null);
        if (R.jaw) R.jaw.rotation.x = 0.4 * hit;
        break;
      }
      case 'spider': { // aranha: empina com as patas da frente abertas e crava as presas
        const up = wind * (1 - q);
        sp.rotation.x = -0.6 * up + 0.3 * hit; R.body.position.y = 0.2 * up; R.body.position.z = 0.4 * hit;
        for (const i of [0, 1]) { R.legs[i].rotation.x = -1.4 * up + 0.4 * hit; R.legs[i].rotation.y = (i ? 1 : -1) * 0.6 * up; }
        if (R.jaw) R.jaw.rotation.x = 0.7 * up - 0.3 * hit;
        break;
      }
      case 'sting': { // escorpião: arma o ferrão para trás e chicoteia por cima da cabeça
        if (R.tail) R.tail.rotation.x = 0.45 * wind - 1.6 * hit; if (R.tail2) R.tail2.rotation.x = 0.5 * wind - 1.7 * hit;
        sp.rotation.x = -0.1 * wind + 0.2 * hit; R.body.position.z = 0.2 * hit;
        if (R.claws) R.claws.forEach((c, i) => { c.rotation.y += (i ? -1 : 1) * 0.4 * wind; });
        break;
      }
      case 'pinch': case 'crab': { // pinças: ergue as duas, abre e fecha com força na frente (caranguejo esmaga para baixo)
        if (R.claws) R.claws.forEach((c, i) => { const sg = i ? -1 : 1; c.rotation.x = -0.7 * wind + (style === 'crab' ? 0.6 : 0.2) * hit; c.rotation.y += sg * (0.5 * wind - 0.8 * hit); });
        R.body.position.z = 0.25 * hit; sp.rotation.x = -0.15 * wind + 0.15 * hit; R.body.position.y = 0.06 * wind;
        break;
      }
      default: { // mordida com bote (lobos, cérbero, salamandra, urso)
        if (p < 0.6) {
          R.body.position.y = -0.22 * wind; sp.rotation.x = 0.16 * wind; R.head.rotation.x = 0.15 * wind;
          legsAll([-0.35 * wind, -0.35 * wind, 0.45 * wind, 0.45 * wind], [0.5 * wind, 0.5 * wind, -0.4 * wind, -0.4 * wind]);
          if (R.jaw) R.jaw.rotation.x = 0.1 + 0.55 * wind;
        } else {
          R.body.position.y = 0.4 * hit; R.body.position.z = 0.55 * hit; sp.rotation.x = -0.3 * hit; R.head.rotation.x = 0.35 * hit;
          legsAll([-1.1 * hit, -1.1 * hit, 0.9 * hit, 0.9 * hit], null);
          if (R.jaw) R.jaw.rotation.x = q < 0.45 ? 0.7 : 0.05;
        }
      }
    }
  }
  // levou dano: encolhe para trás, cabeça dá um tranco e o corpo treme
  if (s.hurt > 0) { const h = s.hurt; R.body.rotation.z = Math.sin(t * 40) * 0.12 * h; R.body.position.z -= 0.14 * h; sp.rotation.x -= 0.15 * h; R.head.rotation.x -= 0.4 * h; if (R.jaw) R.jaw.rotation.x = Math.max(R.jaw.rotation.x, 0.4 * h); }
  if (s.dead > 0) { const d = ease(s.dead); R.body.rotation.z = d * Math.PI / 2; R.body.position.y = -0.35 * d; if (R.jaw) R.jaw.rotation.x = 0.3; for (const l of R.legs) l.rotation.x = 0.3 * d; }
}

function golem(R, s, dt) {
  // gigante pesado: passada lenta com o joelho dobrando, o corpo afunda a cada pisada e os braços balançam com o cotovelo solto
  const w = s.move || 0, t = s.t || 0, p = s.p || 0;
  const run = ease((w - 0.45) / 0.5);
  const fastA = s.action === 'charge';
  R.ph = (R.ph || 0) + dt * (fastA ? 9 : 2.0 + w * (4.2 + run * 2.5));
  const ph = R.ph, sp = Math.sin(ph), cp = Math.cos(ph), mv = fastA ? 1 : w;
  const E = R.elbows || [], K = R.knees || [];
  const breathe = Math.sin(t * 1.6);
  const idle = 1 - Math.min(1, w * 3);
  const combat = Math.min(1, s.combat || 0) * idle;
  // pernas
  R.legs[0].rotation.set(sp * (0.5 + 0.2 * run) * mv - 0.08 * combat, 0, 0.04 + 0.04 * combat);
  R.legs[1].rotation.set(-sp * (0.5 + 0.2 * run) * mv - 0.08 * combat, 0, -0.04 - 0.04 * combat);
  if (K[0]) { K[0].rotation.set(0.08 + mv * Math.max(0, -cp) * (0.8 + 0.4 * run) + 0.18 * combat, 0, 0); K[1].rotation.set(0.08 + mv * Math.max(0, cp) * (0.8 + 0.4 * run) + 0.18 * combat, 0, 0); }
  // corpo: afunda no impacto do pé, balança de lado e inclina para frente correndo
  const step = Math.abs(sp);
  R.body.position.set(sp * 0.05 * mv, -(1 - step) * 0.08 * mv + step * 0.04 * mv - 0.06 * combat + breathe * 0.01 * idle, 0);
  R.body.rotation.set(0, 0, sp * 0.06 * mv);
  R.torso.rotation.set(0.06 + 0.1 * mv + 0.18 * run + 0.08 * combat + breathe * 0.015 * idle, sp * 0.14 * mv + Math.sin(t * 0.4) * 0.05 * idle, -sp * 0.03 * mv);
  R.torso.scale.set(1, 1 + breathe * 0.015, 1);
  R.head.rotation.set(-0.06 * mv - 0.05 * combat, Math.sin(t * 0.5) * 0.25 * idle * (1 - combat) - sp * 0.08 * mv, 0);
  // braços: balanço contrário às pernas, cotovelo dobrado (mais dobrado correndo e em guarda)
  R.arms[0].rotation.set(-sp * (0.45 + 0.25 * run) * mv - 0.35 * combat, 0, -0.1 - 0.12 * combat);
  R.arms[1].rotation.set(sp * (0.45 + 0.25 * run) * mv - 0.35 * combat, 0, 0.1 + 0.12 * combat);
  if (E[0]) { E[0].rotation.set(-0.22 - 0.4 * run - 0.6 * combat - Math.max(0, sp) * 0.3 * mv, 0, 0); E[1].rotation.set(-0.22 - 0.4 * run - 0.6 * combat - Math.max(0, -sp) * 0.3 * mv, 0, 0); }
  if (R.core) { const k = 1 + Math.sin(t * 5) * 0.15; R.core.scale.set(0.36 * k, 0.48 * k, 0.2 * k); }
  if (R.orbit) R.orbit.rotation.y += dt * (s.enraged ? 2.2 : 0.9);
  const setE = (a, b) => { if (E[0]) { if (a != null) E[0].rotation.x = a; if (b != null) E[1].rotation.x = b; } };
  const setK = (a, b) => { if (K[0]) { if (a != null) K[0].rotation.x = a; if (b != null) K[1].rotation.x = b; } };
  switch (s.action) {
    case 'slam': { // ergue os dois punhos bem alto (cotovelos para trás) e esmaga o chão dobrando os joelhos
      const up = seg(p, 0, 0.62), down = seg(p, 0.62, 0.78), back = seg(p, 0.86, 1), k = 1 - back;
      const a = lerp(lerp(-0.2, -3.0, up), -0.55, down) * k;
      R.arms[0].rotation.set(a, 0, -0.25 * up * (1 - down)); R.arms[1].rotation.set(a, 0, 0.25 * up * (1 - down));
      setE(lerp(lerp(-0.3, -1.3, up), -0.15, down) * k - 0.25 * back, lerp(lerp(-0.3, -1.3, up), -0.15, down) * k - 0.25 * back);
      R.torso.rotation.x = (-0.3 * up * (1 - down) + 0.55 * down) * k + 0.08;
      R.head.rotation.x = (-0.3 * up + 0.3 * down) * k;
      R.body.position.y = (0.12 * up * (1 - down) - 0.32 * down) * k;
      setK((0.25 * up + 0.9 * down) * k + 0.08, (0.25 * up + 0.9 * down) * k + 0.08);
      R.legs[0].rotation.x = -0.45 * down * k; R.legs[1].rotation.x = -0.45 * down * k;
      break;
    }
    case 'swipe': case 'swipe2': { // gancho: gira o tronco para trás, puxa o braço com o cotovelo dobrado e solta o soco atravessado, com um passo
      const L2 = s.action === 'swipe2', i = L2 ? 0 : 1, o = L2 ? 1 : 0, sg = L2 ? -1 : 1;
      const wind = seg(p, 0, 0.6), cut = seg(p, 0.6, 0.78), back = seg(p, 0.85, 1), k = 1 - back;
      R.torso.rotation.y = lerp(lerp(0, 0.85, wind), -0.95, cut) * sg * k;
      R.torso.rotation.x = 0.1 + 0.18 * cut * k;
      R.arms[i].rotation.set(lerp(lerp(-0.3, -1.1, wind), -1.55, cut) * k, 0, lerp(lerp(0, 1.0, wind), -0.2, cut) * sg * k + 0.1 * sg);
      if (E[i]) E[i].rotation.x = lerp(lerp(-0.3, -1.6, wind), -0.25, cut) * k - 0.22 * back;
      R.arms[o].rotation.set(-0.6 * k, 0, -0.3 * sg * k);
      if (E[o]) E[o].rotation.x = -1.2 * k;
      R.legs[o].rotation.x = -0.4 * cut * k; R.legs[i].rotation.x = 0.25 * cut * k;
      setK(0.2 + 0.35 * cut * k, 0.2 + 0.35 * cut * k);
      R.body.position.z = 0.3 * cut * k; R.body.position.y = -0.08 * cut * k;
      R.head.rotation.y = -0.4 * sg * cut * k;
      break;
    }
    case 'hurl': { // agacha, arranca a rocha, ergue sobre a cabeça e arremessa com o corpo todo
      const grab = seg(p, 0, 0.3), lift = seg(p, 0.3, 0.7), thr = seg(p, 0.7, 0.82), back = seg(p, 0.85, 1), k = 1 - back;
      const ax = lerp(lerp(lerp(0, 0.6, grab), -3.0, lift), -1.3, thr) * k;
      R.arms[0].rotation.set(ax, 0, -0.25 * lift * (1 - thr)); R.arms[1].rotation.set(ax, 0, 0.25 * lift * (1 - thr));
      setE(lerp(lerp(-0.2, -1.4, lift), -0.05, thr) * k, lerp(lerp(-0.2, -1.4, lift), -0.05, thr) * k);
      R.torso.rotation.x = (0.6 * grab * (1 - lift) - 0.35 * lift * (1 - thr) + 0.5 * thr) * k;
      R.body.position.y = (-0.35 * grab * (1 - lift) + 0.05 * lift) * k;
      setK((1.0 * grab * (1 - lift) + 0.15) * k + 0.08, (1.0 * grab * (1 - lift) + 0.15) * k + 0.08);
      R.legs[0].rotation.x = -0.5 * grab * (1 - lift) * k - 0.3 * thr * k; R.legs[1].rotation.x = -0.5 * grab * (1 - lift) * k + 0.2 * thr * k;
      break;
    }
    case 'charge': { // investida: tronco baixo à frente, ombro na frente, braços para trás
      R.torso.rotation.x = 0.65; R.head.rotation.x = -0.4;
      R.arms[0].rotation.set(0.55 - sp * 0.3, 0, -0.35); R.arms[1].rotation.set(0.55 + sp * 0.3, 0, 0.35);
      setE(-0.9, -0.9);
      break;
    }
    case 'chargeWind': { // prepara a investida: abaixa, raspa o pé e cerra os punhos
      const k = ease(p);
      R.torso.rotation.x = 0.1 + 0.35 * k; R.body.position.y = -0.25 * k; R.head.rotation.x = -0.35 * k;
      R.arms[0].rotation.set(0.7 * k, 0, -0.3 * k); R.arms[1].rotation.set(0.7 * k, 0, 0.3 * k); setE(-1.2 * k, -1.2 * k);
      setK(0.7 * k + 0.08, 0.7 * k + 0.08); R.legs[0].rotation.x = -0.5 * k + Math.sin(t * 14) * 0.25 * k; R.legs[1].rotation.x = 0.2 * k;
      break;
    }
    case 'roar': case 'cast': { // urro: estufa o peito, abre os braços dobrando os cotovelos (pose de força) e joga a cabeça para trás
      const k = Math.sin(Math.min(1, p) * Math.PI), pulse = Math.sin(t * 18) * 0.05 * k;
      R.arms[0].rotation.set(-0.3 * k, 0, -1.3 * k); R.arms[1].rotation.set(-0.3 * k, 0, 1.3 * k);
      setE(-1.5 * k, -1.5 * k);
      R.head.rotation.x = -0.6 * k + pulse; R.torso.rotation.x = -0.3 * k; R.torso.scale.set(1 + 0.06 * k, 1 + 0.03 * k, 1 + 0.06 * k);
      setK(0.35 * k + 0.08, 0.35 * k + 0.08); R.body.position.y = -0.12 * k;
      break;
    }
    default: break;
  }
  // levou dano: tranco para trás, cabeça sacode e um joelho cede
  if (s.hurt > 0) { const h = s.hurt; R.torso.rotation.x -= h * 0.28; R.head.rotation.x -= h * 0.3; R.body.position.z -= h * 0.12; R.torso.rotation.z += Math.sin(t * 30) * 0.05 * h; if (K[0]) K[0].rotation.x += h * 0.35; }
  if (s.dead > 0) { const d = ease(s.dead); R.body.rotation.x = -d * 1.3; R.body.position.y = -d * 0.5; setK(0.9 * d, 0.6 * d); setE(-1.2 * d, -0.4 * d); }
}
