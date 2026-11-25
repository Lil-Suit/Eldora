// =============================================================
// Teclado do próprio jogo (celular). O teclado do sistema ocupava meia tela deitada; este é baixo e compacto.
// Vale para qualquer campo de texto (chat, login, nome, busca, valores). Campos de número abrem nos números.
// No PC não aparece (lá o teclado é o físico).
// =============================================================
const ROWS = {
  abc: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']],
  sym: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['@', '#', '$', '%', '&', '*', '(', ')', '-', '+'], ['!', '?', ':', ';', '"', '\'', '/', '_', '=', ','], ['á', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'õ', 'ú', '⌫']],
  num: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['⌫', '0', '✓']],
};
const TEXT_TYPES = new Set(['text', 'email', 'password', 'search', 'number', 'tel', 'url', '']);

export function installGameKeyboard(G) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;
  const kb = document.createElement('div');
  kb.className = 'gkb hidden'; kb.setAttribute('data-gkb', '');
  document.body.appendChild(kb);
  let target = null, layer = 'abc', shift = false;
  const isField = (el) => el && ((el.tagName === 'INPUT' && TEXT_TYPES.has((el.getAttribute('type') || '').toLowerCase())) || el.tagName === 'TEXTAREA') && !el.readOnly && !el.disabled;
  const on = () => G.settings?.gameKeyboard !== false;

  const preview = () => {
    if (!target) return '';
    const v = target.value || '', pw = target.type === 'password';
    return pw ? '•'.repeat(v.length) : v;
  };
  const render = () => {
    const rows = ROWS[layer];
    const key = (k) => {
      const lab = k.length === 1 && shift && layer === 'abc' ? k.toUpperCase() : k;
      const cls = k === '⌫' || k === '⇧' || k === '✓' ? ' fn' : '';
      return `<button type="button" class="gk${cls}${k === '⇧' && shift ? ' on' : ''}" data-k="${k === '"' ? '&quot;' : k}">${lab}</button>`;
    };
    const label = target?.getAttribute('placeholder') || target?.closest('label')?.textContent?.trim()?.slice(0, 40) || '';
    kb.className = 'gkb' + (layer === 'num' ? ' num' : '');
    kb.innerHTML = `<div class="gkb-top"><span class="gkb-lbl">${label.replace(/[<>&]/g, '')}</span><span class="gkb-txt">${preview().replace(/[<>&]/g, '')}<i></i></span><button type="button" class="gk fn" data-k="hide">Fechar</button></div>`
      + rows.map((r) => `<div class="gkb-row">${r.map(key).join('')}</div>`).join('')
      + (layer === 'num' ? '' : `<div class="gkb-row"><button type="button" class="gk fn" data-k="layer">${layer === 'abc' ? '?123 áé' : 'abc'}</button><button type="button" class="gk" data-k="@">@</button><button type="button" class="gk space" data-k=" ">espaço</button><button type="button" class="gk" data-k=".">.</button><button type="button" class="gk fn ok" data-k="enter">${target?.id === 'chatin' || target?.dataset?.el === 'chatin' ? 'Enviar' : 'OK'}</button></div>`);
  };
  const setVal = (v) => {
    if (!target) return;
    const max = +target.getAttribute('maxlength') || 0;
    if (max > 0 && v.length > max) return;
    target.value = v;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const open = (el) => {
    target = el; shift = false;
    layer = el.type === 'number' || el.type === 'tel' || el.inputMode === 'numeric' ? 'num' : 'abc';
    render(); kb.classList.remove('hidden'); document.body.classList.add('gkb-open'); requestAnimationFrame(() => document.documentElement.style.setProperty('--gkbh', kb.offsetHeight + 'px'));
  };
  const close = (blur = true) => {
    kb.classList.add('hidden'); document.body.classList.remove('gkb-open');
    const t = target; target = null;
    if (blur && t && document.activeElement === t) t.blur();
  };
  const next = () => {
    const t = target; if (!t) return;
    const root = t.closest('.card, .modal, .dialog, .screen, form') || document.body;
    const all = [...root.querySelectorAll('input, textarea')].filter(isField);
    const i = all.indexOf(t);
    if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); open(all[i + 1]); } else close();
  };

  // antes do campo ganhar o foco: avisa o navegador para NÃO abrir o teclado do sistema
  const prep = (e) => { const el = e.target; if (on() && isField(el)) { el.setAttribute('inputmode', 'none'); } };
  document.addEventListener('pointerdown', prep, true);
  document.addEventListener('touchstart', prep, { capture: true, passive: true });
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isField(el)) return;
    if (!on()) { if (el.getAttribute('inputmode') === 'none') el.removeAttribute('inputmode'); return; }
    el.setAttribute('inputmode', 'none');
    open(el);
  });
  document.addEventListener('focusout', (e) => { if (e.target === target) setTimeout(() => { if (target && document.activeElement !== target) close(false); }, 120); });
  // tocar nas teclas não tira o foco do campo
  kb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  kb.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b || !target) return;
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.k, v = target.value || '';
    if (k === 'hide') return close();
    if (k === 'layer') { layer = layer === 'abc' ? 'sym' : 'abc'; return render(); }
    if (k === '⇧') { shift = !shift; return render(); }
    if (k === '⌫') { setVal(v.slice(0, -1)); return render(); }
    if (k === 'enter' || k === '✓') {
      const t = target;
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
      t.dispatchEvent(ev);
      t.dispatchEvent(new Event('change', { bubbles: true }));
      if (t.dataset?.el === 'chatin') { if (!ev.defaultPrevented) t.form?.requestSubmit?.(); if (target) render(); return; }
      if (ev.defaultPrevented) { if (target) render(); return; }
      // último campo de um formulário: envia (ex.: login); senão vai para o próximo campo
      const fields = t.form ? [...t.form.querySelectorAll('input, textarea')].filter(isField) : [];
      if (t.form && fields[fields.length - 1] === t) { close(); t.form.requestSubmit?.(); } else next();
      return;
    }
    let ch = k;
    if (layer === 'abc' && shift) { ch = k.toUpperCase(); shift = false; }
    if (target.type === 'number' && !/[0-9.,-]/.test(ch)) return;
    setVal(v + ch); render();
  });
  G.gameKeyboard = { close, isOpen: () => !!target };
}
