// Servidores (mundos) do ELDORIA, como no Rucoy: cada um tem seus próprios jogadores à vista, monstros,
// eventos, raids e bate-papo. Conta, personagens, mercado, banco e diamantes são os mesmos em todos.
// A lista precisa bater com SERVERS em server/server.js.
export const SERVERS = [{ id: 1, name: 'Eldoria 1' }, { id: 2, name: 'Eldoria 2' }];
// site do jogo: no servidor próprio é o mesmo endereço; dentro do Claude, o endereço público
export const SITE_URL = (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/claude|anthropic|localhost|127\.0\.0\.1/.test(location.host) ? location.origin : 'https://eldoria-online-gztl.onrender.com') + '/site';
const KEY = 'rift.server';

import { MUNDO } from './mundo.js';

export function getServer() {
  if (MUNDO) return MUNDO.sv;
  let n = 1;
  try { n = parseInt(localStorage.getItem(KEY), 10) || 1; } catch { /* sem armazenamento */ }
  return SERVERS.some((s) => s.id === n) ? n : 1;
}
export function setServer(n) { try { localStorage.setItem(KEY, String(n)); } catch { /* sem armazenamento */ } }
export const serverName = (n) => (SERVERS.find((s) => s.id === n) || SERVERS[0]).name;

// jogadores online em cada servidor (só no servidor próprio do jogo; dentro do Claude não há contagem)
let cache = null, cacheT = 0;
export async function fetchServers() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || window.claude?.use) return null;
  if (cache && Date.now() - cacheT < 10000) return cache;
  try {
    const r = await fetch('/api/servers', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    cache = Array.isArray(j.servers) ? j.servers : null; cacheT = Date.now();
    return cache;
  } catch { return null; }
}
// rodando no servidor próprio do jogo (Render), e não dentro do Claude
export function ownServer() {
  return typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !window.claude?.use && !/claude\.ai|claudeusercontent/.test(location.host);
}
// o site do ranking: no servidor próprio é no mesmo endereço; dentro do Claude, abre o do Render
export function siteUrl() {
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !window.claude?.use && !/claude\.ai|claudeusercontent/.test(location.host)) return '/site';
  return SITE_URL;
}
