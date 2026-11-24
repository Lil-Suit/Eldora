// =============================================================
// ELDORIA — Cosméticos (100% visuais: nenhum altera atributos ou combate)
// unlock: { type: 'free' } | { type: 'achievement', id } | { type: 'premium', sku }
// =============================================================

export const SKINS = {
  padrao:   { name: 'Padrão', desc: 'O visual clássico da sua classe.', unlock: { type: 'free' } },
  guarda:   { name: 'Guarda de Eldoria', desc: 'Traje: elmo de aço com pluma azul, ombreiras de placa e tabardo com brasão.', colors: { tunic: 0x2c4a8a, cape: 0x1d2f5a, trim: 0xd9b25f, pants: 0x2a2a3a }, unlock: { type: 'achievement', id: 'missoes' } },
  floresta: { name: 'Floresta Antiga', desc: 'Traje: capuz de folhas, ombreiras de folha e cinto de cipó com flores.', colors: { tunic: 0x3f6b2a, cape: 0x6b4a2e, trim: 0xa8d060, pants: 0x3a2e1e }, unlock: { type: 'achievement', id: 'explorador' } },
  aurora:   { name: 'Aurora Dourada', desc: 'Traje: tiara de sol, manto branco nos ombros e sol dourado no peito.', colors: { tunic: 0xd9a441, cape: 0xfff2c8, trim: 0xffffff, pants: 0x7a5a2a }, unlock: { type: 'achievement', id: 'nivel10' } },
  sombra:   { name: 'Sombra da Fenda', desc: 'Traje: capuz escuro com olhos brilhando, cachecol roxo e cristais girando.', colors: { tunic: 0x2a1f3d, cape: 0x8b3cff, trim: 0x5ef0ff, pants: 0x161320 }, unlock: { type: 'achievement', id: 'chefe' } },
  rubi:     { name: 'Rubi Real', desc: 'Traje: coroa de rubis, gola de pele e corrente de ouro.', colors: { tunic: 0x8a1424, cape: 0x4a0a14, trim: 0xe8e8f0, pants: 0x2a1418 }, unlock: { type: 'premium', sku: 'skin_rubi' } },
  geada:    { name: 'Coroa de Gelo', desc: 'Traje: coroa de cristais de gelo e ombreiras congeladas.', colors: { tunic: 0xdfefff, cape: 0x7fc8ff, trim: 0x2f7fd8, pants: 0x8aa8c8 }, unlock: { type: 'premium', sku: 'skin_geada' } },
  abismo:   { name: 'Abismo Estelar', desc: 'Traje: auréola de estrelas girando e ombreiras com pontos de luz.', colors: { tunic: 0x14143a, cape: 0x0a0a20, trim: 0xff4fd8, pants: 0x0d0d22 }, unlock: { type: 'premium', sku: 'skin_abismo' } },
  jade:     { name: 'Jade Imperial', desc: 'Traje: chapéu de palha largo, faixa dourada e borlas.', colors: { tunic: 0x1f7a5a, cape: 0x0e3a2c, trim: 0xf2c65a, pants: 0x14261f }, unlock: { type: 'premium', sku: 'skin_jade' } },
  dragao:   { name: 'Dragão Carmesim', desc: 'Traje: elmo com chifres, ombreiras com espinhos e asinhas nas costas.', colors: { tunic: 0xa81e14, cape: 0x2a0a08, trim: 0xffb02a, pants: 0x3a0e0a }, unlock: { type: 'premium', sku: 'skin_dragao' } },
};

export const WEAPON_FX = {
  nenhum:  { name: 'Nenhum', desc: 'Sem efeito na arma.', unlock: { type: 'free' } },
  brasas:  { name: 'Brasas', desc: 'Faíscas quentes saem da arma.', color: [0xff7a2a, 0xffd36b], unlock: { type: 'achievement', id: 'cacador' } },
  fenda:   { name: 'Energia da Fenda', desc: 'Partículas ciano e magenta.', color: [0x5ef0ff, 0xd36bff], unlock: { type: 'achievement', id: 'fendas' } },
  geada:   { name: 'Geada', desc: 'Cristais de gelo flutuantes.', color: [0xbfe8ff, 0xffffff], unlock: { type: 'premium', sku: 'fx_geada' } },
  ouro:    { name: 'Ouro Celeste', desc: 'Poeira dourada brilhante.', color: [0xffd36b, 0xfff6dc], unlock: { type: 'premium', sku: 'fx_ouro' } },
  trovao:  { name: 'Trovão', desc: 'Faíscas elétricas azuis e brancas.', color: [0x7ad0ff, 0xffffff], unlock: { type: 'premium', sku: 'fx_trovao' } },
};


// Conquistas: liberam cosméticos jogando, sem pagar.
export const ACHIEVEMENTS = {
  primeiro:   { name: 'Primeiros Passos', desc: 'Conclua sua primeira missão.', check: (s) => Object.values(s.quests.q || {}).some((q) => q.state === 'done') },
  cacador:    { name: 'Caçador do Vale', desc: 'Derrote 100 inimigos.', check: (s) => Object.values(s.player.stats.kills).reduce((a, b) => a + b, 0) >= 100 },
  nivel10:    { name: 'Veterano', desc: 'Alcance o nível 10.', check: (s) => s.player.level >= 10 },
  explorador: { name: 'Cartógrafo', desc: 'Descubra todos os locais do Vale de Eldoria.', check: (s) => s.world.discovered.filter((d) => d !== 'cripta_interior').length >= 13 },
  runas:      { name: 'Guardião das Runas', desc: 'Abra o Cofre do Bosque Oculto.', check: (s) => !!s.world.flags.vaultOpen },
  pvp1:       { name: 'Primeiro Sangue', desc: 'Derrote um jogador no PvP.', check: (s) => (s.player.stats.pvpKills || 0) >= 1 },
  pvppreta:   { name: 'Caveira Preta', desc: 'Chegue à caveira preta (10 abates seguidos).', check: (s) => (s.player.pvpx?.maxSkull || 0) >= 4 },
  caca1:      { name: 'Caçador de Recompensas', desc: 'Complete uma caçada do Mural de Procurados.', check: (s) => (s.player.stats.bounties || 0) >= 1 },
  caca10:     { name: 'Justiceiro', desc: 'Complete 10 caçadas do Mural de Procurados.', check: (s) => (s.player.stats.bounties || 0) >= 10 },
  fendas:     { name: 'Selador', desc: 'Feche 3 Rupturas da Fenda.', check: (s) => (s.player.stats.events || 0) >= 3 },
  missoes:    { name: 'Herói de Eldoria', desc: 'Conclua todas as missões principais.', check: (s) => ['q1_gosmas', 'q2_presas', 'q3_ecos', 'q4_cripta', 'q5_guardiao'].every((id) => s.quests.q?.[id]?.state === 'done') },
  chefe:      { name: 'Matador da Fenda', desc: 'Derrote o Guardião (chefe da Planície).', check: (s) => !!s.world.flags.bossKilled },
};
