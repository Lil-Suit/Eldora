// =============================================================
// ELDORIA — Nível FIXO de cada monstro (estilo Rucoy Online)
// Cada tipo de monstro tem sempre o mesmo nível, em qualquer lugar do mapa.
// Os níveis vão se afastando cada vez mais (2–3 no começo, 3–5 no meio, 5+ no fim),
// então não é preciso um monstro novo para cada nível: novas regiões entram no topo da lista.
// Campeões (mini-chefes de evento/bioma) não ficam aqui: usam o nível da região + 3.
// =============================================================

export const MOB_LEVELS = {
  // ---------- Vale de Eldoria (1–25) ----------
  slime: 1,
  rei_slime: 1, // chefe do Prado
  campeao_goblin: 8, // chefe solo do Acampamento Goblin
  goblin: 5,
  goblin_atirador: 6,
  wolf: 8,
  alpha_wolf: 10,
  skeleton: 12,
  rei_esqueleto: 14, // chefe das Ruínas
  alma_acorrentada: 15,
  vigia: 17, // chefe da Cripta
  guardian: 18,
  // Planície do Guardião (mapa 2): crias da Fenda (o Guardião Corrompido também guarda o Planalto)
  couraco: 12,
  rajado: 16,

  // ---------- Ermos da Fenda (25–60) ----------
  besouro_brasa: 25,
  aranha_galhos: 33,
  caranguejo_abissal: 40,
  conjurador_afogado: 46,
  gargula: 50,
  jabuti: 55,
  cavaleiro_trono: 58,
  arauto_fenda: 60,

  // ---------- Confins de Eldoria (65–165): uma família por bioma ----------
  // Planícies Douradas
  javali: 65, javali_dourado: 68, minotauro: 70, javali_rei: 76,
  // Pântano Sombrio
  sapo: 82, homem_lagarto: 88, jacare: 96,
  // Deserto de Âmbar
  basilisco: 84, escorpiao_ambar: 88, esfinge: 96,
  // Floresta Esmeralda
  cogumelo: 102, cervo_espinhoso: 107, lobisomem: 110, guardiao_bosque: 115,
  // Tundra Gélida
  morsa: 122, urso_polar: 128, yeti: 132, tita_gelo: 138,
  // Terras de Magma
  rinoceronte: 126, salamandra_magma: 130, cerbero: 135, tita_magma: 142,
  // Picos do Fim do Mundo
  medusa: 148, cerebro_abissal: 158, tita_fenda: 165,
};

// nível fixo do monstro (ou o nível pedido, para quem não está na tabela)
export function mobLevel(type, fallback) { return MOB_LEVELS[type] ?? fallback; }
