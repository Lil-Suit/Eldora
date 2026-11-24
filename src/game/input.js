// Entrada de teclado/mouse com atalhos configuráveis. O toque é preenchido por ui/mobile.js.
export const DEFAULT_BINDS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  skill1: 'Digit1', skill2: 'Digit2', skill3: 'Digit3', skill4: 'Digit4',
  dodge: 'Space', interact: 'KeyE', potion: 'KeyQ', tonic: 'KeyR',
  inventory: 'KeyI', character: 'KeyC', skills: 'KeyK', quests: 'KeyJ', map: 'KeyM',
  menu: 'Escape', camLeft: 'ArrowLeft', camRight: 'ArrowRight', photo: 'KeyP', emote: 'KeyT', chat: 'Enter', mount: 'KeyH', sprint: 'ShiftLeft',
};
export const BIND_LABELS = {
  up: 'Mover para frente', down: 'Mover para trás', left: 'Mover para a esquerda', right: 'Mover para a direita',
  skill1: 'Habilidade 1', skill2: 'Habilidade 2', skill3: 'Habilidade 3', skill4: 'Habilidade 4',
  dodge: 'Esquiva', interact: 'Interagir', potion: 'Poção de Vida', tonic: 'Tônico Arcano',
  inventory: 'Inventário', character: 'Personagem', skills: 'Habilidades', quests: 'Missões', map: 'Mapa',
  menu: 'Menu / fechar', camLeft: 'Girar câmera (esq.)', camRight: 'Girar câmera (dir.)', photo: 'Modo foto', emote: 'Gestos', chat: 'Bate-papo', mount: 'Montar no cavalo', sprint: 'Correr (segurar)',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Espaço', Escape: 'Esc', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', Tab: 'Tab' };
  return map[code] || code;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.binds = { ...DEFAULT_BINDS };
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, left: false, right: false, inside: false, leftPressed: false };
    this.drag = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.touch = { active: false, move: { x: 0, y: 0 }, attack: false, skill: [false, false, false, false], dodge: false, interact: false, potion: false, mount: false, run: false, camDx: 0, camDy: 0, pinch: 0 };
    this.enabled = true;
    this.rebinding = null;
    this.onRebind = null;
    this.lastDevice = 'mouse';
    // Mouse preso na câmera (PC): clique no jogo prende o mouse; Caps Lock solta/prende de novo.
    this.locked = false;
    this.canLock = () => false;
    this.onLockChange = null;
    document.addEventListener('pointerlockerror', () => { if (!this._lockErrT || Date.now() - this._lockErrT > 2000) { this._lockErrT = Date.now(); clearTimeout(this._lockT); this._lockT = setTimeout(() => { if (!this.locked && this.canLock()) this.lock(false); }, 1100); this.onLockFail?.(); } });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouse.left = this.mouse.right = false;
      this.onLockChange?.(this.locked);
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.lastDevice = 'mouse';
      if (!this.locked && e.button === 0 && this.canLock()) { this.lock(); return; } // 1º clique só prende o mouse
      if (!this.locked) canvas.setPointerCapture?.(e.pointerId);
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2 || e.button === 1) this.mouse.right = true;
      this.updateMouse(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2 || e.button === 1) this.mouse.right = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.locked || this.mouse.right) { this.drag.dx += e.movementX || 0; this.drag.dy += e.movementY || 0; }
      if (this.locked) { this.mouse.inside = true; return; }
      this.updateMouse(e);
    });
    canvas.addEventListener('pointerenter', () => { this.mouse.inside = true; });
    canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
  }

  // prende o mouse; se o navegador recusar (ex.: logo depois de soltar com Esc, ou em alguns PCs), tenta de novo
  // uma vez e avisa: dá para girar a câmera segurando o botão direito
  lock(retry = true) {
    const fail = () => {
      if (retry) { clearTimeout(this._lockT); this._lockT = setTimeout(() => { if (!this.locked && this.canLock()) this.lock(false); }, 1100); }
      else this.onLockFail?.();
    };
    try {
      let r;
      try { r = this.canvas.requestPointerLock?.({ unadjustedMovement: true }); } catch { r = null; }
      if (r?.catch) r.catch(() => { try { const r2 = this.canvas.requestPointerLock?.(); r2?.catch?.(fail); } catch { fail(); } });
      else if (r === undefined) { /* navegador antigo: sem promessa */ }
    } catch { fail(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    this.mouse.nx = (this.mouse.x / r.width) * 2 - 1; this.mouse.ny = -(this.mouse.y / r.height) * 2 + 1;
    this.mouse.inside = true;
  }

  onKey(e, isDown) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (isDown && this.rebinding) {
      e.preventDefault();
      if (e.code !== 'Escape') { this.binds[this.rebinding] = e.code; }
      const a = this.rebinding; this.rebinding = null;
      this.onRebind?.(a);
      return;
    }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    this.lastDevice = 'keyboard';
    // Caps Lock prende/solta o mouse. No Mac o Caps Lock manda só "apertou" ao ligar e só "soltou" ao desligar:
    // por isso vale o primeiro dos dois (e ignora o par apertou+soltou do Windows)
    if (e.code === 'CapsLock' && !e.repeat) {
      let toggle = false;
      if (isDown) { this._capsDown = true; toggle = true; } else if (this._capsDown) this._capsDown = false; else toggle = true;
      if (toggle) { if (this.locked) this.unlock(); else if (this.canLock()) this.lock(); }
      return;
    }
    if (isDown) { if (!this.down.has(e.code)) this.pressed.add(e.code); this.down.add(e.code); }
    else this.down.delete(e.code);
  }

  held(action) { return this.down.has(this.binds[action]); }
  justPressed(action) { return this.pressed.has(this.binds[action]); }

  moveVector() {
    let x = 0, z = 0;
    if (this.held('up')) z -= 1;
    if (this.held('down')) z += 1;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.touch.active && (Math.abs(this.touch.move.x) > 0.08 || Math.abs(this.touch.move.y) > 0.08)) { x = this.touch.move.x; z = this.touch.move.y; }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z, mag: Math.min(1, l) };
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
    const t = this.touch;
    t.skill.fill(false); t.dodge = false; t.interact = false; t.potion = false; t.mount = false; t.camDx = 0; t.camDy = 0; t.pinch = 0;
  }
}
