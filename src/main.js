import { installGameKeyboard } from './ui/keyboard.js';
import { doSkill, doBasic } from './game/skills.js';
import { itemIcon } from './ui/icons.js';
import { TROPHIES } from './config/items.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { telemetry } from './core/telemetry.js';
import { MUNDO, startMundo } from './game/mundo.js';

// Espera a ponte da plataforma (window.claude) aparecer — ausente quando o arquivo é aberto localmente.
function waitForClaude(ms = 5000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (window.claude?.use) return resolve(true);
      if (performance.now() - t0 > ms) return resolve(false);
      setTimeout(tick, 200);
    };
    tick();
  });
}

function fatal(msg) {
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="boot-logo">ELDORIA</div><div class="boot-sub" style="max-width:420px;letter-spacing:.04em;text-transform:none;font-size:15px;line-height:1.5">${msg}</div>`;
}

// Celular: SEMPRE deitado e em tela cheia.
// - Tela cheia: entra no primeiro toque e volta a entrar em QUALQUER toque se o sistema sair dela
//   (o navegador só deixa entrar com um gesto do usuário). Antes desistia depois de 3 falhas.
// - Deitado: ao entrar na tela cheia, trava a orientação no lado em que o celular está (não gira mais).
//   Em pé aparece "Gire o celular" por cima de tudo (CSS .rotate).
function forceFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const lockLandscape = () => {
    const o = screen.orientation; if (!o?.lock) return;
    const t = String(o.type || '');
    o.lock(t.startsWith('landscape') ? t : 'landscape').catch(() => o.lock('landscape').catch(() => {}));
  };
  let busy = false, lastTry = 0;
  const tryEnter = () => {
    if (!req || isFs() || busy) return;
    const now = Date.now(); if (now - lastTry < 400) return; lastTry = now;
    busy = true;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => { lockLandscape(); navigator.keyboard?.lock?.(['Escape']).catch(() => {}); }).catch(() => {}).finally(() => { busy = false; });
      else { busy = false; lockLandscape(); }
    } catch { busy = false; }
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) document.addEventListener(ev, tryEnter, true);
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') tryEnter(); }, true);
  const onChange = () => { if (isFs()) lockLandscape(); window.__RIFT?.resize(); };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  // app instalado (tela inicial) já abre em tela cheia: trava a orientação logo
  // app (Play Store / ícone): tenta travar deitado já ao abrir e em todo toque, mesmo sem tela cheia
  const isApp = /[?&]app=1/.test(location.search) || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (isFs() || isApp) lockLandscape();
  if (isApp) { document.addEventListener('pointerdown', lockLandscape, true); document.addEventListener('visibilitychange', () => { if (!document.hidden) lockLandscape(); }); }
}

async function boot() {
  // versão nova no servidor? atualiza antes de mostrar o jogo (sem esperar entrar no mapa)
  try { const U = await import('./game/updater.js'); if (await U.bootCheck()) return; } catch { /* segue */ }
  telemetry.init(() => {
    const G = window.__RIFT; if (!G) return {};
    return {
      classe: G.state?.player?.classId, nivel: G.state?.player?.level, modo: G.mode, area: G.player?.area,
      qualidade: G.settings?.quality, mobile: !!G.isTouch, online: !!G.net?.room, fps: Math.round(G.fps || 0),
      inimigos: G.enemies?.length, jogadores: (G.net?.peers?.size || 0) + 1,
    };
  });
  forceFullscreen();
  const canvas = document.getElementById('game');
  let G;
  try {
    G = new Game(canvas, UI);
  } catch (e) {
    console.error(e);
    telemetry.capture(e, { origem: 'boot' });
    fatal('Não foi possível iniciar o jogo. Seu navegador precisa de suporte a WebGL.<br><small>' + String(e?.message || e) + '</small>');
    return;
  }
  window.__RIFT = G;
  installGameKeyboard(G); // teclado do próprio jogo no celular (compacto)
  // "Instalar o jogo" (vira ícone e abre em tela cheia, sem a barra do navegador)
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__instalar = e; if (G.mode === 'title') G.ui.showTitle(); });
  addEventListener('appinstalled', () => { window.__instalar = null; if (G.mode === 'title') G.ui.showTitle(); });
  if (MUNDO) startMundo(G); // página do servidor que roda o mundo (sem tela)
  G.telemetry = telemetry;
  window.__itemIcon = itemIcon;
  window.__RIFT_MATS = Object.fromEntries(Object.entries(TROPHIES).map(([k, v]) => [k, v.name]));
  window.__doSkill = doSkill; window.__doBasic = doBasic;
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('out');
  setTimeout(() => bootEl.remove(), 700);
  // nuvem: carrega o save mais recente da conta, se houver
  G.saver.cloudLoading = true;
  setTimeout(() => { if (G.saver.cloudLoading && !/^(entrando|acordando)/.test(G.saver.cloudState)) { G.saver.cloudLoading = false; if (G.mode === 'title' && G.ui.el.screen.classList.contains('title')) G.ui.showTitle(); } }, 6000);
  waitForClaude().then(async (ok) => {
    if (!ok) {
      // fora do Claude: se o servidor do jogo tiver contas, pede login e salva os personagens lá
      const SA = await import('./game/serverauth.js');
      // servidor dormindo: a tela inicial mostra "acordando o servidor" e espera (sem esconder os personagens da conta)
      const onWait = (i, ms) => { G.saver.cloudLoading = true; G.saver.cloudState = 'acordando o servidor…'; if (i === 0 && G.mode === 'title') { G.ui.showTitle(); G.ui.toastSmall?.('Acordando o servidor do jogo… (até 1 min e meio)', 6); } void ms; };
      const has = await SA.serverHasAccounts(onWait);
      G.saver.accountsAvail = has !== false; // jogo online: a tela inicial mostra "Entrar / Trocar de conta"
      if (has === null) {
        // não acordou a tempo: os personagens da conta continuam na lista ("aguardando servidor") + botão Tentar de novo
        let u = null; try { u = localStorage.getItem('eldoria_user'); } catch { /* ok */ }
        G.saver.waitOwner = u ? String(u).toLowerCase() : null; G.saver.cloudState = 'servidor sem resposta';
      }
      if (has) {
        G.saver.cloudLoading = true; G.saver.cloudState = 'entrando…';
        const acc = await SA.ensureLogin();
        if (acc) {
          try { await G.saver.connectServer(acc); } catch { G.saver.cloudState = 'conta indisponível'; }
          // conta antiga, só com apelido: oferece cadastrar o e-mail (pergunta de novo só em outra sessão)
          if (acc.email === null && !acc.offline && !sessionStorage.getItem('eld_email_ask')) { try { sessionStorage.setItem('eld_email_ask', '1'); } catch { /* ok */ } await SA.addEmailOverlay(acc.token); }
        }
        else G.saver.cloudState = 'sem conta (só este navegador)';
      }
      G.saver.cloudLoading = false; if (G.mode === 'title' && G.ui.el.screen.classList.contains('title')) G.ui.showTitle();
      // aviso de atualização/manutenção + recarregar sozinho quando sair versão nova
      // este personagem entrou de novo em outra aba/aparelho: esta aba sai da sala (sem clone)
      window.addEventListener('eldoria-kicked', () => { try { G.saver.saveNow('outra-aba', false); } catch { /* ok */ } G.ui.banner('Personagem aberto em outro lugar', 'Você entrou com este personagem em outra aba ou aparelho. Esta tela ficou offline: recarregue para voltar.', '#ffd36b'); });
      const UP = await import('./game/updater.js');
      G.updater = UP.startUpdater(G);
      // voltou de uma atualização: entra direto no personagem que estava jogando
      let resume = null; try { resume = sessionStorage.getItem('eld_resume'); sessionStorage.removeItem('eld_resume'); } catch { /* ok */ }
      if (resume && G.mode === 'title') { try { const st = await G.saver.loadCharacter(resume); if (st && G.mode === 'title') { G.ui.closeModal?.(); G.ui.loadScreen({ area: ['cripta', 'ermos', 'confins', 'guardiao'].includes(st.player?.area) ? st.player.area : 'world', title: st.player?.name || 'Eldoria', sub: 'Voltando da atualização' }, () => G.continueGame(st)); } } catch { /* fica no título */ } }
      return;
    }
    await G.saver.connectCloud();
    if (G.mode !== 'title' || !G.ui.el.screen.classList.contains('title')) return;
    G.ui.showTitle();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
