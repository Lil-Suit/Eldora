import { VERSION } from '../version.js';

// Atualização sem sair da página (só no site próprio, fora do Claude):
// - quando o servidor vai reiniciar (deploy no Render), ele avisa "manutenção" pelo WebSocket;
// - a página mostra "Em atualização / manutenção", salva, espera o servidor novo responder e recarrega sozinha;
// - de tempos em tempos também confere /api/status: se a versão mudou, faz o mesmo.
// recarrega já com a versão nova (no máximo 2 tentativas por versão, para nunca ficar recarregando sem parar)
function quickReload(v) {
  let n = 0; try { const o = JSON.parse(sessionStorage.getItem('eld_upd') || '{}'); n = o.v === v ? o.n : 0; sessionStorage.setItem('eld_upd', JSON.stringify({ v, n: n + 1 })); } catch { /* ok */ }
  if (n >= 2) return false;
  const el = document.createElement('div'); el.className = 'maint';
  el.innerHTML = '<div class="mbox"><b>Atualizando o jogo…</b><small>Baixando a versão nova.</small><div class="spin"></div></div>';
  document.body.appendChild(el);
  location.reload();
  return true;
}

// Ao abrir o jogo: confere a versão do servidor ANTES de entrar (o celular pode ter aberto a cópia antiga guardada).
// Versão nova → recarrega na hora, ainda na tela inicial (nada de atualizar depois de entrar no mapa).
export async function bootCheck() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return false;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch('/api/status', { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) return false;
    const s = await r.json();
    if (s.versao && s.versao !== VERSION) return quickReload(s.versao);
  } catch { /* servidor dormindo/sem rede: segue com a cópia; o conferidor de sempre atualiza depois */ }
  return false;
}

export function startUpdater(G) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  let el = null, busy = false, poll = null, gaveUp = false;
  const show = () => {
    if (el) return;
    el = document.createElement('div'); el.className = 'maint';
    el.innerHTML = '<div class="mbox"><b>Em atualização / manutenção</b><small>O jogo está sendo atualizado. Ele volta sozinho em instantes — seu progresso está salvo.</small><div class="spin"></div></div>';
    document.body.appendChild(el);
    try { G.saver?.saveNow?.('manutencao', true); } catch { /* ok */ }
    try { if (G.mode === 'play' && G.state?.charId) sessionStorage.setItem('eld_resume', G.state.charId); } catch { /* ok */ }
  };
  const hide = () => { el?.remove(); el = null; };
  const status = async () => { const r = await fetch('/api/status', { cache: 'no-store' }); if (!r.ok) throw new Error('status ' + r.status); return r.json(); };
  // o servidor avisou que vai reiniciar (ou a versão mudou). O aviso SÓ aparece se:
  // - existe versão nova (aí recarrega), ou
  // - o servidor está fora do ar (espera ele voltar).
  // Se o servidor responde com a MESMA versão (deploy repetido, reinício, servidor velho saindo), nada aparece.
  const waitNew = (minMs = 1500) => {
    if (busy || gaveUp) return; busy = true;
    const t0 = Date.now();
    let fails = 0;
    clearInterval(poll);
    const tick = async () => {
      try {
        const s = await status();
        if (s.versao && s.versao !== VERSION) {
          if (G.mode !== 'play') { clearInterval(poll); quickReload(s.versao); return; } // ainda no lobby: atualiza direto
          show();
          if (Date.now() - t0 < minMs) return;
          clearInterval(poll);
          // trava contra recarregar sem parar (navegador preso numa cópia antiga)
          let n = 0; try { const o = JSON.parse(sessionStorage.getItem('eld_upd') || '{}'); n = o.v === s.versao ? o.n : 0; sessionStorage.setItem('eld_upd', JSON.stringify({ v: s.versao, n: n + 1 })); } catch { /* ok */ }
          if (n >= 2) { busy = false; gaveUp = true; hide(); G.ui?.toastSmall?.('Versão nova disponível: feche e abra o jogo de novo.', 8); return; }
          location.reload();
          return;
        }
        // mesma versão e servidor respondendo: era só um reinício, segue o jogo sem aviso
        clearInterval(poll); busy = false; hide();
      } catch {
        fails++; if (fails >= 1) show(); // servidor fora do ar: aí sim mostra o aviso e espera
        if (Date.now() - t0 > 120000) { clearInterval(poll); busy = false; hide(); }
      }
    };
    // o servidor velho fecha em ~2,5 s: a primeira olhada é depois disso, para falar com o novo
    setTimeout(() => { if (!busy) return; tick(); poll = setInterval(tick, 2500); }, 3200);
  };
  const check = async () => {
    if (busy) return;
    try {
      const s = await status();
      if (s.versao && s.versao !== VERSION) { if (G.mode !== 'play') quickReload(s.versao); else waitNew(800); } // no lobby: direto; jogando: aviso
    } catch { /* sem servidor próprio */ }
  };
  window.addEventListener('eldoria-maint', () => waitNew());
  setInterval(check, 45000);
  setTimeout(check, 1500);
  return { maintenance: () => waitNew(), check };
}
