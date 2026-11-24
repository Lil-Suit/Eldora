// =============================================================
// Eventos de temporada.
// NATAL
//  • `ligado`: o evento inteiro (os 3 chefes e o Conjunto Natalino). Para TIRAR depois do Natal: false.
//  • `modoNatal`: o "modo natal" (o dono do jogo pede para ligar/desligar):
//      true  → assim que um chefe morre (ou vai embora), outro aleatório nasce em 3 a 5 min;
//      false → nascem "normalmente": um a cada 30 min a 2 h (sorteado).
//  • Nunca nasce um enquanto outro dos três estiver vivo.
// =============================================================
export const NATAL = {
  ligado: true,
  modoNatal: true,   // LIGADO (pedido do dono do jogo em 14/nov, 13h26)
  janela: null,          // opcional: { de: [12, 1], ate: [1, 6] } ([mês, dia]) liga sozinho nesse período com `ligado: false`
  chefes: ['noel', 'boneco_neve', 'rena_maligna'],
  modoMin: [3, 5],       // modo natal: minutos até o próximo, depois que um morre ou vai embora
  bloco: 75, espalha: 45, // modo normal: um chefe por "bloco" de 75 min, num momento sorteado dos primeiros 45 → 30 min a 2 h entre um e outro
  vidaMin: 25,           // se ninguém derrotar em 25 min, ele vai embora
  // onde pode nascer: QUALQUER mapa (sorteado, não importa onde os jogadores estão — igual às fendas)
  areas: [{ area: 'world', peso: 30, nivel: 30 }, { area: 'guardiao', peso: 22, nivel: 38 }, { area: 'ermos', peso: 26, nivel: 55 }, { area: 'confins', peso: 22, nivel: 85 }],
  // saque natalino: 1 peça de defesa por chefe, nos fundos verde (vira azul por ser de chefe), vermelho e branco.
  // v0.11: vermelho 1 em 50 e branco 1 em 400 (antes 30% e 10%: generoso demais)
  raridades: { incomum: 97.75, mitico: 2, lendario: 0.25 },
};

export function natalAtivo(now = new Date()) {
  if (NATAL.ligado) return true;
  const J = NATAL.janela; if (!J) return false;
  const m = now.getMonth() + 1, d = now.getDate(), v = m * 100 + d, de = J.de[0] * 100 + J.de[1], ate = J.ate[0] * 100 + J.ate[1];
  return de <= ate ? v >= de && v <= ate : v >= de || v <= ate; // a janela atravessa o ano novo
}

// modo normal: horário de nascimento do bloco b (igual em todos os aparelhos, então trocar de anfitrião não muda nada)
const hash = (n) => { let h = (n | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function natalBlocoAt(b) { return b * NATAL.bloco * 60000 + Math.floor(hash(b) * NATAL.espalha * 60000); }
export function natalBloco(now = Date.now()) { return Math.floor(now / (NATAL.bloco * 60000)); }
// qual chefe nasce no bloco b: sorteio "em passos" a partir de uma data fixa, então nunca é o mesmo duas vezes seguidas
export function natalTipoBloco(b) {
  const C = NATAL.chefes, E = natalBloco(Date.UTC(2026, 10, 1));
  let k = 0;
  for (let i = Math.min(E, b); i <= b; i++) k += 1 + Math.floor(hash(i * 7 + 3) * (C.length - 1));
  return C[k % C.length];
}
