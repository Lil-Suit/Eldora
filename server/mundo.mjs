// =============================================================
// ELDORIA — "mundo no servidor"
// Abre o jogo numa página SEM TELA (Chromium headless) para cada servidor (Eldoria 1, 2…). Essa página vira o
// anfitrião fixo: simula monstros, chefes, eventos e dia/noite para todos, então nenhum jogador carrega o mundo.
// Uso (no mesmo computador do server.js):  MUNDO_KEY=<mesma chave do server.js> node server/mundo.mjs
// Precisa do Playwright:  npm i playwright && npx playwright install --with-deps chromium
// =============================================================
import { chromium } from 'playwright';

const PORT = process.env.PORT || 10000;
const KEY = String(process.env.MUNDO_KEY || '');
const BASE = process.env.MUNDO_URL || `http://127.0.0.1:${PORT}/`;
const SVS = String(process.env.MUNDO_SVS || '1,2').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
if (KEY.length < 12) { console.error('mundo: defina MUNDO_KEY (12+ letras), igual à do server.js'); process.exit(1); }

const pages = new Map();
let browser = null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function launch() {
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  browser.on('disconnected', () => { log('mundo: navegador fechou; reiniciando'); process.exit(2); }); // o systemd sobe de novo
}

async function open(sv) {
  const old = pages.get(sv); pages.delete(sv);
  if (old) { try { await old.ctx.close(); } catch { /* ok */ } }
  const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /^ELDORIA mundo/.test(t)) log(`[mundo ${sv}]`, t.slice(0, 240)); });
  page.on('pageerror', (e) => log(`[mundo ${sv}] erro:`, String(e.message).slice(0, 240)));
  page.on('crash', () => { log(`[mundo ${sv}] a página travou; reabrindo`); setTimeout(() => open(sv).catch((e) => log('reabrir falhou', e.message)), 3000); });
  pages.set(sv, { ctx, page, bad: 0, at: Date.now() });
  await page.goto(`${BASE}?mundo=${encodeURIComponent(KEY)}&sv=${sv}`, { timeout: 180000, waitUntil: 'load' });
  log(`[mundo ${sv}] aberto`);
}

// vigia: a cada 20 s pergunta para a página se está viva e anfitriã; parada por ~2 min = reabre.
// E reabre 1 vez a cada 12 h (memória sempre limpa).
setInterval(async () => {
  for (const sv of SVS) {
    const P = pages.get(sv); if (!P) continue;
    let r = null; try { r = await P.page.evaluate(() => window.__mundo?.() || null); } catch { /* recarregando */ }
    P.bad = r?.ok ? 0 : P.bad + 1;
    if (r?.ok && Date.now() - (P.logT || 0) > 600000) { P.logT = Date.now(); log(`[mundo ${sv}] ok · anfitrião: ${r.host ? 'sim' : 'não'} · monstros: ${r.monstros} · jogadores: ${r.jogadores}`); }
    if (P.bad >= 6 || Date.now() - P.at > 12 * 3600e3) { log(`[mundo ${sv}] reabrindo (${P.bad >= 6 ? 'sem resposta' : 'limpeza'})`); open(sv).catch((e) => log('reabrir falhou', e.message)); }
  }
}, 20000);

process.on('SIGTERM', async () => { try { await browser?.close(); } catch { /* ok */ } process.exit(0); });

await launch();
// espera o server.js responder antes de abrir as páginas
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + 'api/servers'); if (r.ok) break; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 2000)); }
for (const sv of SVS) await open(sv).catch((e) => log(`[mundo ${sv}] não abriu:`, e.message));
