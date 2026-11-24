// Pacote 3: monstros espalhados em grupinhos e renascimento individual (funções puras, testadas em test/mundo.test.mjs)

// sorte com semente (mesmo resultado em todo aparelho para o mesmo grupo)
export function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// divide n monstros em grupinhos de 1 a 3 (média ~2)
export function splitSizes(n, rnd = Math.random) {
  const out = [];
  let left = Math.max(0, n | 0);
  while (left > 0) {
    const s = left <= 3 ? (left === 3 && rnd() < 0.5 ? 2 : left) : rnd() < 0.2 ? 3 : rnd() < 0.8 ? 2 : 1;
    out.push(s); left -= s;
  }
  return out;
}

// escolhe k pontos entre os candidatos (já em ordem sorteada), afastados pelo menos minD uns dos outros e dos já
// ocupados (placed). Se não couber, a distância vai diminuindo. Resultado: grupinhos cobrindo a área toda, sem amontoar
// nas bordas (como faria "o mais longe possível").
export function pickAnchors(cands, k, placed = [], minD = 12) {
  const out = [], all = placed.slice(), pool = cands.slice();
  let D = minD;
  while (out.length < k && pool.length) {
    let idx = -1;
    for (let j = 0; j < pool.length && idx < 0; j++) {
      const c = pool[j];
      if (all.every((p) => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 >= D * D)) idx = j;
    }
    if (idx < 0) { D *= 0.85; if (D < 0.5) idx = 0; else continue; }
    const c = pool.splice(idx, 1)[0];
    out.push(c); all.push(c);
  }
  return out;
}
// espaçamento natural para k grupinhos num círculo de raio R
export const spacingFor = (R, k) => 0.85 * Math.sqrt((Math.PI * R * R) / Math.max(1, k));

// RENASCIMENTO INDIVIDUAL: cada monstro tem o próprio tempo (±30% e mais até 12 s de sorte),
// então um grupo limpo de uma vez não volta todo junto
export function respawnDelay(base, rnd = Math.random) { return base * (0.7 + rnd() * 0.6) + rnd() * 12; }
// intervalo mínimo entre dois nascimentos do MESMO grupo (os que estavam esperando voltam um por um)
export const GROUP_GAP = [5, 11];
export function groupGap(rnd = Math.random) { return GROUP_GAP[0] + rnd() * (GROUP_GAP[1] - GROUP_GAP[0]); }
// distância mínima de qualquer jogador para um monstro nascer (nada de nascer em cima de você)
export const SPAWN_CLEAR = 14;
