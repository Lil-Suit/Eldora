// Pacote 3: Portal da Fenda (atrás do Guardião, para os Ermos). Só passa quem derrotou o Guardião ou PARTICIPOU da luta
// (deu dano ou curou). A liberação fica no servidor (livro "~seg"), por personagem; o save sozinho não abre.
// Este arquivo é usado pelo jogo e pelo servidor (sem dependências).
export const BOSS_ARENA = { x: 35, z: -392 }; // mesmo lugar de BOSS_SPAWN (config/world.js)
export const GATED_AREAS = ['ermos', 'confins']; // depois do portal do Guardião (a Cripta não tem trava)
export const isGated = (area) => GATED_AREAS.includes(area);
export const MSG_LOCKED = 'Derrote o Guardião primeiro';
// quem já tinha passado do Guardião antes desta versão: matou o chefe (flag antiga), está ou já esteve nos Ermos/Confins.
// trustNew = false (servidor): ignora a flag nova guardiaoOk (essa só o próprio servidor dá)
export function passedBefore(st, trustNew = true) {
  if (!st || typeof st !== 'object') return false;
  const w = st.world || {}, f = w.flags || {}, p = st.player || {};
  const disc = Array.isArray(w.discovered) ? w.discovered : [];
  return !!(f.bossKilled || (trustNew && f.guardiaoOk) || isGated(p.pos?.area) || disc.includes('ermos') || disc.includes('confins'));
}
// participou da luta: perto da arena do Guardião no mapa 2
export const nearArena = (ar, x, z, r = 70) => ar === 'guardiao' && Math.hypot((+x || 0) - BOSS_ARENA.x, (+z || 0) - BOSS_ARENA.z) <= r;
