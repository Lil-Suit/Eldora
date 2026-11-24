// Filtro de palavras +18 do bate-papo (o servidor tem uma cópia igual em server/server.js).
// Normaliza acentos, números no lugar de letras (s3x0), letras repetidas (seeexo) e letras separadas (s e x o).
export const CHAT_BAN_MS = 30 * 60 * 1000;
const EXACT = ['sexo', 'sex', 'sexy', 'sexual', 'sexuais', 'transa', 'transar', 'transando', 'transou', 'transei', 'foder', 'fode', 'fodendo', 'fodida', 'fodido',
  'buceta', 'boceta', 'bct', 'xoxota', 'xota', 'xereca', 'xana', 'piroca', 'punheta', 'siririca', 'gozar', 'gozei', 'gozou', 'gozando', 'gozada', 'gozo',
  'porno', 'putaria', 'puta', 'putinha', 'prostituta', 'vagina', 'penis', 'boquete', 'mamada', 'tesao', 'tesuda', 'tesudo', 'nude', 'nudes', 'pelada', 'pelado', 'peladinha',
  'estupro', 'estuprar', 'estuprador', 'pedofilo', 'pedofilia', 'orgia', 'orgasmo', 'erecao', 'masturbar', 'masturbacao', 'anal', 'cu', 'cuzinho', 'hentai',
  'xvideos', 'pornhub', 'onlyfans', 'porn', 'fuck', 'fucking', 'dick', 'pussy', 'cock', 'boobs', 'tits', 'nsfw', 'xxx'];
const STEMS = ['bucet', 'bocet', 'xoxot', 'xerec', 'piroc', 'punhet', 'siriric', 'putari', 'masturb', 'pedofil', 'estupr', 'porn', 'orgasm', 'hentai', 'onlyfan', 'xvideo', 'tesud'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const squeeze = (w) => w.replace(/(.)\1+/g, '$1');
const SET = new Set([...EXACT, ...EXACT.map(squeeze)]);
const STEMS_SQ = [...new Set([...STEMS, ...STEMS.map(squeeze)])];

function tokens(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, (c) => LEET[c] || c).replace(/[^a-z]+/g, ' ').trim();
  const raw = t ? t.split(' ') : [];
  // letras soltas em sequência viram uma palavra só: "s e x o" -> "sexo"
  const out = [];
  let run = '';
  for (const w of raw) {
    if (w.length === 1) { run += w; continue; }
    if (run.length > 1) out.push(run);
    else if (run) out.push(run);
    run = '';
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

export function isAdult(text) {
  for (const w of tokens(text)) {
    const s = squeeze(w);
    if (SET.has(w) || SET.has(s)) return true;
    if (STEMS_SQ.some((st) => s.startsWith(st) || w.startsWith(st))) return true;
  }
  return false;
}

// Bloqueio do chat (guardado no aparelho e no personagem)
export function chatBanLeft(G) {
  let until = +(G?.state?.player?.chatBan || 0);
  try { until = Math.max(until, +(localStorage.getItem('eld_chatban') || 0)); } catch { /* ok */ }
  return Math.max(0, until - Date.now());
}
export function setChatBan(G, until) {
  if (G?.state?.player) G.state.player.chatBan = until;
  try { localStorage.setItem('eld_chatban', String(until)); } catch { /* ok */ }
  G?.saver?.requestSave?.('chatban');
}
