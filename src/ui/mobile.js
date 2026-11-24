import { itemIcon, ICONS, SKILL_ICONS } from './icons.js';
import { SKILL_UNLOCKS } from '../config/classes.js';
import { BALANCE } from '../config/balance.js';

// Controles de toque: joystick dinâmico, botões para o polegar, arrastar para girar a câmera e pinça para zoom.
export class MobileControls {
  constructor(G, ui) {
    this.G = G; this.ui = ui;
    this.root = ui.el.mobile;
    this.joy = null; this.cam = new Map(); this.atk = null;
    this.pinchD = 0;
  }

  show() {
    const G = this.G, P = G.player, cls = P.cls;
    const basic = cls.id === 'guerreiro' ? SKILL_ICONS.corte : cls.id === 'arqueiro' ? SKILL_ICONS.flecha : SKILL_ICONS.fagulha;
    this._dcd = this._pcd = this._pu = null;
    this.root.innerHTML = `
      <div class="touchzone" data-z="cam"></div>
      <div class="joyzone" data-z="joy" data-hk="joy"><div class="joybase"><div class="joyknob"></div></div></div>
      <div class="tbtns-wrap">
        <button class="tb attack" data-b="attack" data-hk="attack">${basic}</button>
        ${cls.skills.map((s, i) => `<button class="tb sk sk${i}" data-b="skill" data-i="${i}" data-hk="sk${i}">${SKILL_ICONS[s.id]}<i class="cd"></i><em class="lk">Nv${SKILL_UNLOCKS[i]}</em></button>`).join('')}
        <button class="tb dodge" data-b="dodge" data-hk="dodge">${ICONS.esquiva}<i class="cd"></i></button>
        <button class="tb potion" data-b="potion" data-hk="potion">${ICONS.pocao}<i class="cd"></i><u></u></button>
        <button class="tb run" data-b="run" data-hk="run" title="Correr (liga/desliga)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6l6 6-6 6M13 6l6 6-6 6"/></svg></button>
        <button class="tb mount hidden nomount" data-b="mount" data-hk="mount" title="Montar / desmontar (H)">${itemIcon({ kind: 'quest', id: 'cavalo_criador' })}</button>
        <button class="tb interact hidden" data-b="interact" data-hk="interact">${ICONS.maoAberta}<span></span></button>
      </div>
      <button class="tb menu" data-b="menu" data-hk="menu">${ICONS.menu}</button>
      <button class="tb chatb" data-b="chat" data-hk="chat" title="Conversar">${ICONS.balao}</button>
      <div class="tmenu hidden">
        <button data-b="gm" class="gmonly">${ICONS.coroa || '♛'}<span>Painel GM</span></button>
        <button data-b="open" data-tab="inventory">${ICONS.bolsa}<span>Inventário</span></button>
        <button data-b="open" data-tab="character">${ICONS.pessoa}<span>Personagem</span></button>
        <button data-b="open" data-tab="skills">${ICONS.estrela}<span>Habilidades</span></button>
        <button data-b="open" data-tab="quests">${ICONS.livro}<span>Missões</span></button>
        <button data-b="open" data-tab="map">${ICONS.mapa}<span>Mapa</span></button>
        <button data-b="open" data-tab="appearance">${ICONS.cabide}<span>Aparência</span></button>
        <button data-b="emotes">${ICONS.sorriso}<span>Gestos</span></button>
        <button data-b="pause">${ICONS.engrenagem}<span>Menu</span></button>
      </div>`;
    this.root.classList.remove('hidden');
    this.knob = this.root.querySelector('.joyknob');
    this.base = this.root.querySelector('.joybase');
    this.btns = [...this.root.querySelectorAll('.tb.sk')];
    this.applyScale();
    this.bind();
    this.applyLayout();
  }

  // ---------- HUD personalizado: cada botão pode ficar onde o jogador quiser (posição, tamanho, transparência) ----------
  hk(key) { return this.root.querySelector(`[data-hk="${key}"]`); }
  applyLayout(only = null) {
    const L = this.G.settings.hudLayout || {};
    for (const e of this.root.querySelectorAll('[data-hk]')) {
      const k = e.dataset.hk;
      if (only && k !== only) continue;
      const c = L[k];
      if (!e._home) e._home = e.parentElement;
      const base = k === 'joy' ? e.querySelector('.joybase') : null;
      if (!c) {
        if (e.parentElement !== e._home) e._home.appendChild(e);
        e.classList.remove('hkfree'); e.style.left = e.style.top = e.style.right = e.style.bottom = e.style.transform = e.style.opacity = '';
        if (base) base.style.transform = '';
        continue;
      }
      if (e.parentElement !== this.root) this.root.appendChild(e);
      e.classList.add('hkfree');
      e.style.left = (c.x * 100).toFixed(2) + '%'; e.style.top = (c.y * 100).toFixed(2) + '%'; e.style.right = 'auto'; e.style.bottom = 'auto';
      if (base) { e.style.transform = 'translate(-50%, -50%)'; base.style.transform = `scale(${c.s || 1})`; }
      else e.style.transform = `translate(-50%, -50%) scale(${c.s || 1})`;
      e.style.opacity = c.o != null && c.o < 1 ? String(c.o) : '';
    }
  }
  centerOf(e) {
    const r = this.root.getBoundingClientRect(), b = (e.dataset.hk === 'joy' ? e.querySelector('.joybase') : e).getBoundingClientRect();
    return { x: (b.left + b.width / 2 - r.left) / r.width, y: (b.top + b.height / 2 - r.top) / r.height };
  }

  startEdit() {
    if (this.editing) return;
    this.editing = true; this.ui.hudEditing = true; document.body.classList.add('hudedit');
    this.closeMenu();
    this._backup = JSON.stringify(this.G.settings.hudLayout || {});
    this.L = JSON.parse(this._backup);
    this.selKey = null;
    const NAMES = { attack: 'Ataque', sk0: 'Habilidade 1', sk1: 'Habilidade 2', sk2: 'Habilidade 3', sk3: 'Habilidade 4', dodge: 'Esquiva', potion: 'Poção', run: 'Correr', mount: 'Montaria', interact: 'Interagir', menu: 'Menu', chat: 'Conversa', joy: 'Analógico' };
    const bar = document.createElement('div'); bar.className = 'hudedbar';
    bar.innerHTML = `<div class="hdrow"><b>Personalizar HUD</b><span class="hdsel">Toque e arraste um botão</span><button class="hdfold" data-ed="fold" title="Esconder">▾</button></div>
      <div class="hdbody"><label>Tamanho <input type="range" min="0.6" max="1.8" step="0.05" data-ed="s" disabled></label>
      <label>Transparência <input type="range" min="0.25" max="1" step="0.05" data-ed="o" disabled></label>
      <button class="btn sm" data-ed="reset">Restaurar padrão</button><button class="btn sm" data-ed="cancel">Cancelar</button><button class="btn sm primary" data-ed="save">Salvar</button></div>`;
    this.root.appendChild(bar); this.bar = bar;
    const sync = () => {
      const c = this.selKey && this.L[this.selKey];
      bar.querySelector('.hdsel').textContent = this.selKey ? NAMES[this.selKey] : 'Toque e arraste um botão';
      for (const k of ['s', 'o']) { const inp = bar.querySelector(`[data-ed="${k}"]`); inp.disabled = !this.selKey; inp.value = c ? (c[k] ?? 1) : 1; }
      for (const e of this.root.querySelectorAll('[data-hk]')) e.classList.toggle('hksel', e.dataset.hk === this.selKey);
      // a barra fica do lado oposto ao botão escolhido (nunca tapa o que você está arrumando)
      bar.classList.toggle('dockb', !!c && c.y < 0.5);
    };
    this._sync = sync;
    bar.addEventListener('input', (e) => { const k = e.target.dataset.ed; if (!this.selKey || !k) return; this.L[this.selKey][k] = parseFloat(e.target.value); this.G.settings.hudLayout = this.L; this.applyLayout(this.selKey); });
    bar.addEventListener('click', (e) => {
      const k = e.target.closest('[data-ed]')?.dataset.ed; if (!k || k === 's' || k === 'o') return;
      if (k === 'fold') { bar.classList.toggle('fold'); return; }
      if (k === 'reset') { this.L = {}; this.G.settings.hudLayout = {}; this.selKey = null; this.applyLayout(); sync(); return; }
      if (k === 'cancel') this.G.settings.hudLayout = JSON.parse(this._backup);
      if (k === 'save') { this.G.settings.hudLayout = this.L; this.G.saveSettings(); this.ui.toastSmall('HUD salvo!'); }
      this.endEdit();
    });
    this._edDown = (e) => {
      if (e.target.closest('.hudedbar')) return;
      e.preventDefault(); e.stopPropagation();
      const el = e.target.closest('[data-hk]');
      if (!el) { this.selKey = null; sync(); return; }
      const k = el.dataset.hk, c0 = this.L[k] || this.centerOf(el);
      this.L[k] = { s: 1, o: 1, ...this.L[k], x: c0.x, y: c0.y };
      this.G.settings.hudLayout = this.L; this.applyLayout(k);
      this.selKey = k; sync();
      this.drag = { id: e.pointerId, k, sx: e.clientX, sy: e.clientY, x0: this.L[k].x, y0: this.L[k].y };
      bar.classList.add('dragging');
    };
    this._edMove = (e) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      e.preventDefault(); e.stopPropagation();
      const r = this.root.getBoundingClientRect();
      const c = this.L[d.k];
      c.x = Math.max(0.03, Math.min(0.97, d.x0 + (e.clientX - d.sx) / r.width));
      c.y = Math.max(0.04, Math.min(0.96, d.y0 + (e.clientY - d.sy) / r.height));
      this.applyLayout(d.k); sync();
    };
    this._edUp = (e) => { if (this.drag && e.pointerId === this.drag.id) { this.drag = null; bar.classList.remove('dragging'); } };
    this.root.addEventListener('pointerdown', this._edDown, true);
    window.addEventListener('pointermove', this._edMove, true);
    window.addEventListener('pointerup', this._edUp, true); window.addEventListener('pointercancel', this._edUp, true);
    sync();
  }
  endEdit() {
    this.editing = false; this.ui.hudEditing = false; document.body.classList.remove('hudedit');
    this.root.removeEventListener('pointerdown', this._edDown, true);
    window.removeEventListener('pointermove', this._edMove, true);
    window.removeEventListener('pointerup', this._edUp, true); window.removeEventListener('pointercancel', this._edUp, true);
    this.bar?.remove(); this.bar = null; this.drag = null; this.selKey = null;
    for (const e of this.root.querySelectorAll('.hksel')) e.classList.remove('hksel');
    this.applyLayout();
  }

  applyScale() { this.root.style.setProperty('--ts', String(this.G.settings.touchScale || 1)); }

  bind() {
    const I = this.G.input, T = I.touch;
    const zJoy = this.root.querySelector('[data-z="joy"]');
    const zCam = this.root.querySelector('[data-z="cam"]');
    zJoy.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.G.audio.init();
      I.lastDevice = 'touch'; T.active = true;
      try { zJoy.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      if (this.G.settings.joyFloat) {
        // analógico móvel (opção nas configurações): aparece onde você tocou
        const r = zJoy.getBoundingClientRect();
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        this.base.style.left = (e.clientX - r.left) + 'px'; this.base.style.top = (e.clientY - r.top) + 'px';
      } else {
        // padrão: analógico TRAVADO no lugar — o centro é sempre o mesmo, tocar em qualquer ponto da área mexe a partir dele
        this.base.style.left = ''; this.base.style.top = '';
        const b = this.base.getBoundingClientRect();
        this.joy = { id: e.pointerId, ox: b.left + b.width / 2, oy: b.top + b.height / 2 };
        zJoy.dispatchEvent(new PointerEvent('pointermove', { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }));
      }
      this.base.classList.add('on');
    });
    zJoy.addEventListener('pointermove', (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      const R = 52 * (this.G.settings.touchScale || 1);
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      T.move.x = dx / R; T.move.y = dy / R;
    });
    const endJoy = (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      this.joy = null; T.move.x = T.move.y = 0;
      this.knob.style.transform = ''; this.base.classList.remove('on');
      if (!this.G.settings.joyFloat) { this.base.style.left = ''; this.base.style.top = ''; } // volta ao lugar fixo
    };
    zJoy.addEventListener('pointerup', endJoy); zJoy.addEventListener('pointercancel', endJoy);
    zCam.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.G.audio.init(); I.lastDevice = 'touch'; T.active = true;
      zCam.setPointerCapture(e.pointerId);
      this.cam.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() });
      if (this.cam.size === 2) { const [a, b] = [...this.cam.values()]; this.pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
      this.closeMenu();
    });
    zCam.addEventListener('pointermove', (e) => {
      const p = this.cam.get(e.pointerId);
      if (!p) return;
      if (this.cam.size === 1) { T.camDx += e.clientX - p.x; T.camDy += e.clientY - p.y; }
      p.x = e.clientX; p.y = e.clientY;
      if (this.cam.size === 2) {
        const [a, b] = [...this.cam.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        T.pinch += (this.pinchD - d) * 0.6;
        this.pinchD = d;
      }
    });
    const endCam = (e) => {
      const p = this.cam.get(e.pointerId);
      this.cam.delete(e.pointerId);
      // toque rápido no minimapa abre o mapa completo
      if (p && e.type === 'pointerup' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 14 && performance.now() - p.t0 < 400) {
        const mm = this.G.ui.root.querySelector('.minimap');
        const r = mm?.getBoundingClientRect();
        if (r && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) this.G.ui.togglePanel('map');
        else { const cr = this.G.renderer.domElement.getBoundingClientRect(); this.G.social?.tryOpenAt(e.clientX - cr.left, e.clientY - cr.top); } // tocar em um jogador abre a ficha
      }
    };
    zCam.addEventListener('pointerup', endCam); zCam.addEventListener('pointercancel', endCam);
    for (const b of this.root.querySelectorAll('[data-b]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.G.audio.init();
        I.lastDevice = 'touch'; T.active = true;
        const k = b.dataset.b;
        b.classList.add('pressed');
        if (k === 'attack') { T.attack = true; try { b.setPointerCapture(e.pointerId); } catch { /* sem captura */ } this.atk = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false }; }
        else if (k === 'skill') T.skill[+b.dataset.i] = true;
        else if (k === 'dodge') T.dodge = true;
        else if (k === 'potion') T.potion = true;
        else if (k === 'mount') T.mount = true;
        else if (k === 'run') { T.run = !T.run; b.classList.toggle('on', T.run); }
        else if (k === 'interact') T.interact = true;
        else if (k === 'menu') { this.closeMenu(); this.ui.journalTab ? this.ui.closeJournal() : this.ui.togglePanel(this.ui.lastJournalTab || 'inventory'); } // abre direto onde você estava
        else if (k === 'chat') { this.closeMenu(); setTimeout(() => this.ui.focusChat(), 30); }
        else if (k === 'open') { this.closeMenu(); this.ui.togglePanel(b.dataset.tab); }
        else if (k === 'emotes') { this.closeMenu(); this.ui.toggleEmotes(); }
        else if (k === 'gm') { this.closeMenu(); import('../game/gm.js').then((GM) => GM.openGmPanel(this.G)); }
        else if (k === 'pause') { this.closeMenu(); this.ui.openModal('pause'); }
      });
      const up = (e) => {
        if (b.dataset.b === 'attack') {
          // arrastando o dedo para fora do botão continua atacando (e girando a câmera) até soltar
          if (e.type === 'pointerleave' && this.atk && e.pointerId === this.atk.id) return;
          T.attack = false; this.atk = null;
        }
        b.classList.remove('pressed');
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      // segurando o ataque: arrastar o dedo gira a câmera (como um analógico) — não muda a mira, só a visão
      if (b.dataset.b === 'attack') b.addEventListener('pointermove', (e) => {
        const a = this.atk;
        if (!a || e.pointerId !== a.id) return;
        if (!a.on && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > 10) { a.on = true; a.x = e.clientX; a.y = e.clientY; }
        if (a.on) { T.camDx += e.clientX - a.x; T.camDy += e.clientY - a.y; }
        a.x = e.clientX; a.y = e.clientY;
      });
    }
  }

  toggleMenu() { this.root.querySelector('.tmenu').classList.toggle('hidden'); }
  closeMenu() { this.root.querySelector('.tmenu')?.classList.add('hidden'); }

  setInteract(label) {
    const b = this.root.querySelector('.tb.interact');
    if (!b) return;
    b.classList.toggle('hidden', !label);
    if (label) b.querySelector('span').textContent = label.length > 26 ? label.slice(0, 24) + '…' : label;
  }

  updateCooldowns() {
    if (!this.btns) return;
    const P = this.G.player;
    P.cls.skills.forEach((s, i) => {
      const b = this.btns[i];
      const locked = this.G.state.player.level < SKILL_UNLOCKS[i];
      b.classList.toggle('locked', locked);
      b.classList.toggle('nores', !locked && P.res < (s.cost || 0));
      const k = P.cds['s' + i] / (s.cd * (1 - P.stats.cdr));
      const cd = b._cd || (b._cd = b.querySelector('.cd'));
      const v = k > 0 ? `conic-gradient(rgba(8,8,16,.72) ${Math.round(k * 120) * 3}deg, transparent 0)` : 'none';
      if (cd._v !== v) { cd.style.background = v; cd._v = v; cd.textContent = k > 0 ? Math.ceil(P.cds['s' + i]) : ''; }
    });
    const d = this._dcd || (this._dcd = this.root.querySelector('.tb.dodge .cd'));
    const kd = P.cds.dodge / P.cls.dodge.cd;
    const vd = kd > 0 ? `conic-gradient(rgba(8,8,16,.72) ${Math.round(kd * 120) * 3}deg, transparent 0)` : 'none';
    if (d._v !== vd) { d._v = vd; d.style.background = vd; }
    const pc = this._pcd || (this._pcd = this.root.querySelector('.tb.potion .cd'));
    const kp = P.cds.potion / BALANCE.potionCooldown;
    const vp = kp > 0 ? `conic-gradient(rgba(8,8,16,.72) ${Math.round(kp * 120) * 3}deg, transparent 0)` : 'none';
    if (pc._v !== vp) { pc._v = vp; pc.style.background = vp; }
    const q = this.G.saver.serverGm ? '∞' : this.G.lifeCount();
    const u = this._pu || (this._pu = this.root.querySelector('.tb.potion u'));
    if (u.textContent !== String(q)) u.textContent = q;
    if (P.cls.id === 'arqueiro') { const ab = this.root.querySelector('.tb.attack'); if (ab) { let ae = ab.querySelector('.ammo'); if (!ae) { ae = document.createElement('u'); ae.className = 'ammo'; ab.appendChild(ae); } const na = this.G.saver.serverGm ? '∞' : this.G.inv.count('flechas'); if (ae.textContent !== String(na)) ae.textContent = na; ae.classList.toggle('zero', na === 0); } }
    const mb = this.root.querySelector('.tb.mount');
    if (mb) { const mk = P.mountKind(); mb.classList.toggle('hidden', !mk); mb.classList.toggle('nomount', !mk); mb.classList.toggle('on', !!P.mounted); if (mk && mb.dataset.k !== mk) { mb.dataset.k = mk; mb.innerHTML = itemIcon({ kind: 'quest', id: mk === 'lobo' ? 'lobo_criacao' : 'cavalo_criador' }); } }
  }

  update() {
    const vis = !this.ui.blocking() && !this.ui.photo;
    this.root.classList.toggle('dim', !vis);
  }
}
