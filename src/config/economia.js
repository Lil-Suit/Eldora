// =============================================================
// ELDORIA — Economia (v0.11): cofre do banco com diamantes e baú diário.
// O SERVIDOR (server/server.js) tem a mesma tabela e é ele quem decide: aqui é só para mostrar na tela.
// =============================================================

// Cofre de itens do banco: começa com 40 espaços. +10 por compra com diamantes (50, 75, 100, 125 💎), até o dobro (80).
// A compra é da CONTA (vale para todos os personagens). Quem já tinha aumentado com ouro (versões antigas) não perde nada:
// o cofre dele começa do tamanho que já tinha e cada compra soma +10 até 80 (ou fica no que já tinha, se for maior).
export const VAULT = { start: 40, step: 10, buys: 4, sku: 'cofre10', price: (n) => 50 + 25 * Math.max(0, n | 0) };
export function vaultSizeFor(base, bought) {
  const b = Math.max(VAULT.start, Math.floor(+base) || VAULT.start), top = Math.max(VAULT.start * 2, b);
  return Math.min(top, b + VAULT.step * Math.max(0, Math.min(VAULT.buys, Math.floor(+bought) || 0)));
}

// Baú diário: 1 por dia por CONTA (no horário de Brasília, pelo relógio do servidor). Dias seguidos sobem de 1 a 7;
// depois do dia 7 volta ao dia 1. Perdeu um dia: volta ao dia 1. Sem passe pago.
// ouro = ouro × (1 + nível/10) do personagem que abriu (modesto: um nível 100 ganha ~11× o valor da tabela).
// item: chance pequena de um equipamento do seu nível, preso ao personagem (não vende nem troca).
export const DAILY = {
  days: [
    { ouro: 40, pocao: 3 },
    { ouro: 60, pocao: 4, tonico: 1 },
    { ouro: 80, pocao: 5, tonico: 1 },
    { ouro: 110, pocao: 6, tonico: 2 },
    { ouro: 140, pocao: 7, tonico: 2, item: 0.1 },
    { ouro: 180, pocao: 8, tonico: 3, item: 0.15 },
    { ouro: 250, pocao: 10, tonico: 4, item: 0.3 },
  ],
  itemRarity: { incomum: 75, raro: 22, epico: 3 },
};
export const dailyGold = (day, level) => Math.round(DAILY.days[Math.max(0, Math.min(6, (day | 0) - 1))].ouro * (1 + Math.max(1, Math.min(1000, level | 0)) / 10));
