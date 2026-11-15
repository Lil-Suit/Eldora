// Service worker do app instalado (tela inicial do celular).
// - Abre NA HORA com a cópia guardada do jogo quando o servidor demora (no plano grátis do Render ele "dorme"
//   e, ao acordar, mostra uma página própria por ~1 min — antes isso fazia o ícone do app não abrir).
// - Com o servidor acordado, a versão nova chega pela rede (espera até 2,5 s) e substitui a cópia.
// - Só guarda respostas que vieram do jogo (cabeçalho x-eldoria), nunca a página do Render.
// - /api e /ws sempre pela rede.
const CACHE = 'eldoria-v4';
const SHELL = './index.html';
const isGame = (r) => !!(r && r.ok && r.headers.get('x-eldoria'));

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  try { const r = await fetch('./', { cache: 'no-store' }); if (isGame(r)) await c.put(SHELL, r); } catch { /* sem rede: guarda depois */ }
  try { await c.addAll(['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']); } catch { /* ok */ }
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/ws')) return; // sempre rede

  // a página do jogo (abrir o app)
  if (req.mode === 'navigate' && (p === '/' || p.endsWith('/index.html'))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(SHELL);
      const net = fetch(req, { cache: 'no-store' }).then(async (r) => {
        if (isGame(r)) { await c.put(SHELL, r.clone()); return r; }
        return cached ? null : r; // página do Render (servidor acordando): usa a cópia se tiver
      }).catch(() => null);
      if (!cached) return (await net) || new Response('<meta charset="utf-8"><p style="font:16px sans-serif;padding:20px">Sem conexão. Tente de novo em instantes.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
      const r = await Promise.race([net, new Promise((res) => setTimeout(() => res(null), 2500))]);
      return r || cached;
    })());
    return;
  }
  if (req.mode === 'navigate') return; // outras páginas (/site): rede normal

  // arquivos (modelos, telas, ícones): os com ?v= nunca mudam → cópia primeiro; os outros, rede e cópia de reserva
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (url.searchParams.has('v')) { const hit = await c.match(req); if (hit) return hit; }
    try {
      const r = await fetch(req);
      if (isGame(r)) c.put(req, r.clone()).catch(() => {});
      return r;
    } catch {
      const hit = await c.match(req);
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
