import { BALANCE } from '../config/balance.js';

// Saque de chefe: 1 item garantido; chance de 2 e de 3 itens (BALANCE.bossItems: 40% e 15%).
// Cada item vai para um jogador diferente enquanto houver gente que ainda não ganhou
// (2 itens com 2 pessoas = um para cada); o sorteio é pelo dano causado.
// Devolve { w: [quem leva cada item], pct: { jogador: % do dano } }.
export function rollBossWinners(e, selfId = 'self', rand = Math.random) {
  const B = BALANCE.bossItems, r = rand();
  const n = e.def?.bossItems || 1 + (r < B.two ? 1 : 0) + (r < B.three ? 1 : 0); // alguns chefes soltam um número fixo
  const ent = [...(e.dmgBy || new Map())].map(([k, d]) => [k === 'self' ? selfId : String(k), d]).filter(([, d]) => d > 0);
  if (!ent.length) ent.push([selfId, 1]);
  const tot = ent.reduce((s, [, d]) => s + d, 0);
  const w = [];
  let pool = ent.slice();
  for (let i = 0; i < n; i++) {
    // todos já ganharam um: só com uma chance pequeníssima alguém leva um segundo (ninguém leva 3)
    if (!pool.length) { if (rand() >= B.secondForSame || w.length >= ent.length * 2) break; pool = ent.filter(([k]) => w.filter((x) => x === k).length < 2); if (!pool.length) break; }
    const pt = pool.reduce((s, [, d]) => s + d, 0);
    let x = rand() * pt, pick = pool[0][0];
    for (const [k, d] of pool) { x -= d; if (x <= 0) { pick = k; break; } }
    w.push(pick);
    pool = pool.filter(([k]) => k !== pick);
  }
  const pct = {};
  for (const [k, d] of ent) pct[k] = Math.round((d / tot) * 100);
  return { w, pct };
}
