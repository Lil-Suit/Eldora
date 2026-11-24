// =============================================================
// "Mundo no servidor": uma página sem tela, aberta pelo próprio servidor (server/mundo.mjs), que vira o
// ANFITRIÃO fixo de um servidor (Eldoria 1, 2…): simula monstros, chefes, eventos e dia/noite para todos.
// Assim nenhum celular/PC de jogador precisa carregar o mundo inteiro — menos lag para todo mundo.
// Ativa só com ?mundo=<chave>&sv=<n> (a chave é conferida pelo servidor; sem ela, nada muda).
// Ele não aparece para ninguém: não tem personagem visível, não conta como jogador, não salva nada.
// =============================================================
export const MUNDO = (() => {
  try {
    if (typeof location === 'undefined') return null;
    const q = new URLSearchParams(location.search), key = q.get('mundo');
    return key ? { key, sv: parseInt(q.get('sv'), 10) || 1 } : null;
  } catch { return null; }
})();

export function startMundo(G) {
  if (!MUNDO) return;
  document.title = 'ELDORIA · mundo ' + MUNDO.sv;
  try { G.settings.quality = 'leve'; G.settings.viewDist = 'curta'; G.settings.autoRes = false; G.applyQuality?.(); } catch { /* ok */ }
  G.ui.isPaused = () => false; // janela nenhuma pode pausar o mundo
  const go = () => {
    if (G.mode !== 'title') return void setTimeout(go, 400);
    G.startNew('Mundo', 'guerreiro', 'M');
    try { G.ui.closeModal?.(); G.tutorial?.skip?.(); } catch { /* ok */ }
    const P = G.player;
    P.invuln = 1e12; if (P.rig?.root) P.rig.root.visible = false;
    // não salva nada (nem no aparelho, nem na nuvem) e não mexe em tela
    G.saver.saveNow = () => true; G.saver.writeCloud = async () => {}; G.saver.requestSave = () => {};
    G.ui.update = () => {}; G.ui.updateOverlay = () => {}; G.ui.notice = () => {}; G.ui.toast = () => {}; G.ui.toastSmall = () => {};
    G.ui.damageNumber = () => {}; G.ui.chatMessage = () => {};
    G.fx.mute = true;
    // laço próprio, 30 vezes por segundo e sem desenhar (o que pesa é o desenho, e aqui ninguém olha)
    G.renderer.setAnimationLoop(null);
    setInterval(() => { try { G.frame(); } catch (e) { console.error('mundo:', e?.message || e); } }, 33);
    window.__mundo = () => ({ ok: true, host: G.net?.role === 'host' && !!G.net?.room, sv: MUNDO.sv, monstros: G.enemies.length, jogadores: G.net?.peers?.size || 0 });
    console.log('ELDORIA mundo', MUNDO.sv, 'rodando');
  };
  go();
}
