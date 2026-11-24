import { pixelIconHtml } from './pixelicons.js';
// Ícones SVG originais de ELDORIA (traços simples, herdam currentColor).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  espada: S('<path d="M14.5 3.5 20.5 3.5 20.5 9.5 9 21 3 15z" fill="currentColor" fill-opacity=".18"/><path d="M5 13l6 6M3.5 20.5l3-3"/>'),
  montante: S('<path d="M16 2.5h5.5V8L9.5 20 4 14.5z" fill="currentColor" fill-opacity=".18"/><path d="M4.5 12.5l7 7M2.5 21.5l3.5-3.5"/>'),
  machado: S('<path d="M5 21 15 8"/><path d="M13 3c3 0 7 2.5 7 6.5-2 1-4.5.5-6.5-1.5S12 4 13 3z" fill="currentColor" fill-opacity=".2"/>'),
  arco: S('<path d="M6 3c8 3 12 9 12 18"/><path d="M6 3 18 21"/><path d="M9 14l-5 5M3 17v3h3"/>'),
  arco_longo: S('<path d="M5 2c9 3 14 10 14 20"/><path d="M5 2 19 22"/><path d="M10 13l-6 6"/>'),
  varinha: S('<path d="M4 20 15 9"/><path d="M17 3l1.2 2.6L21 7l-2.8 1.2L17 11l-1.2-2.8L13 7l2.8-1.4z" fill="currentColor" fill-opacity=".25"/>'),
  cajado: S('<path d="M6 22 15 8"/><circle cx="17" cy="5.5" r="3.2" fill="currentColor" fill-opacity=".25"/><path d="M13.5 8.5l-2-1"/>'),
  orbe: S('<circle cx="12" cy="11" r="6.5" fill="currentColor" fill-opacity=".2"/><path d="M5 11h14M12 4.5c3 3 3 10 0 13M7 20h10"/>'),
  elmo: S('<path d="M4 15c0-6 3.5-10 8-10s8 4 8 10v3H4z" fill="currentColor" fill-opacity=".18"/><path d="M12 5v6M8 15h8"/>'),
  capuz: S('<path d="M5 20c0-9 3-15 7-15s7 6 7 15" fill="currentColor" fill-opacity=".18"/><path d="M8.5 20c0-4 1.5-7 3.5-7s3.5 3 3.5 7"/>'),
  tiara: S('<path d="M3 15l3-6 3 4 3-7 3 7 3-4 3 6z" fill="currentColor" fill-opacity=".2"/><path d="M3 18h18"/>'),
  couro: S('<path d="M7 3l5 2 5-2 4 4-2 4v10H5V11L3 7z" fill="currentColor" fill-opacity=".18"/><path d="M12 5v16"/>'),
  malha: S('<path d="M7 3l5 2 5-2 4 4-2 4v10H5V11L3 7z" fill="currentColor" fill-opacity=".18"/><path d="M8 11h8M8 14h8M8 17h8"/>'),
  manto: S('<path d="M8 3h8l2 6 2 12H4L6 9z" fill="currentColor" fill-opacity=".18"/><path d="M12 3v18"/>'),
  anel: S('<circle cx="12" cy="14" r="6"/><path d="M9.5 6.5 12 3l2.5 3.5L12 8z" fill="currentColor" fill-opacity=".35"/>'),
  pocao: S('<path d="M10 3h4M10.5 3v4.5L6 14a6 6 0 1 0 12 0l-4.5-6.5V3" fill="currentColor" fill-opacity=".25"/>'),
  pergaminho: S('<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8"/><path d="M6 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2zM8 20a2 2 0 0 1-2-2v-2" /><path d="M10 9h6M10 13h6"/>'),
  gota: S('<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="currentColor" fill-opacity=".25"/>'),
  presa: S('<path d="M8 3c0 7 2 13 6 18 1-6 1-12-2-18z" fill="currentColor" fill-opacity=".2"/>'),
  insignia: S('<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" fill="currentColor" fill-opacity=".2"/><path d="M9 11l2 2 4-4"/>'),
  po: S('<circle cx="8" cy="15" r="2"/><circle cx="14" cy="12" r="2.5"/><circle cx="16" cy="18" r="1.6"/><circle cx="10" cy="8" r="1.4"/>'),
  cristal: S('<path d="M12 2l5 7-5 13-5-13z" fill="currentColor" fill-opacity=".25"/><path d="M7 9h10"/>'),
  chave: S('<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 16l2-2M18 18l2-2"/>'),
  bolsa: S('<path d="M6 8h12l1.5 12h-15z" fill="currentColor" fill-opacity=".15"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  pessoa: S('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>'),
  livro: S('<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4z"/><path d="M12 5v16"/>'),
  mapa: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  coroa: S('<path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5z"/><path d="M5 19h14"/>'),
  estrela: S('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  caveira: S('<path d="M5 11a7 7 0 1 1 14 0c0 2.5-1 4-3 5v3H8v-3c-2-1-3-2.5-3-5z"/><circle cx="9.5" cy="11" r="1.6" fill="currentColor"/><circle cx="14.5" cy="11" r="1.6" fill="currentColor"/>'),
  engrenagem: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  fechar: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  moeda: S('<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".25"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
  balao: S('<path d="M4 5h16v11H9l-5 4z"/>'),
  sorriso: S('<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.3 2 4 2s3-.5 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  escudo: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor" fill-opacity=".18"/>'),
  esquiva: S('<path d="M4 17c4 0 6-3 8-6s4-6 8-6"/><path d="M16 5h4v4"/><path d="M4 12h3M5 8h3"/>'),
  maoAberta: S('<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7s-5-2-6.5-5L3 12.5a1.5 1.5 0 0 1 2.5-1.6L8 13"/>'),
  ataque: S('<path d="M14.5 3.5h6v6L10 20l-6-6z" fill="currentColor" fill-opacity=".25"/><path d="M6 12l6 6M3 21l3-3"/>'),
  cadeado: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  amigos: S('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.3c3 .2 5.5 2.4 5.5 5.7"/>'),
  globo: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  cabide: S('<path d="M12 6.5a2 2 0 1 1 2 2c-1 0-2 .7-2 1.7V11"/><path d="M12 11 3 17.5h18z"/>'),
  nuvem: S('<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>'),
};

// Habilidades
export const SKILL_ICONS = {
  redemoinho: S('<path d="M12 4a8 8 0 1 1-8 8"/><path d="M12 8a4 4 0 1 1-4 4"/><path d="M4 12l-2-2M4 12l2-2"/>'),
  investida: S('<path d="M3 12h12"/><path d="M11 6l7 6-7 6"/><path d="M3 8h5M3 16h5"/>'),
  muralha: ICONS.escudo,
  sismico: S('<path d="M2 18h20"/><path d="M5 18l3-6 3 4 3-8 3 6 2-2 2 6"/>'),
  multiplo: S('<path d="M4 12h12M4 12l12-6M4 12l12 6"/><path d="M16 4l3 2-3 1M16 11l3 1-3 1M16 17l3 1-3 1"/>'),
  perfurante: S('<path d="M2 12h17"/><path d="M15 8l5 4-5 4"/><circle cx="8" cy="12" r="2.5"/><circle cx="13" cy="12" r="1.8"/>'),
  salto: S('<path d="M18 19C16 9 10 5 4 7"/><path d="M7 4 4 7l3 3"/><path d="M15 21h6"/>'),
  agilidade: S('<path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>'),
  chuva: S('<path d="M6 3v8M10 5v9M14 3v8M18 5v9"/><path d="M5 18h14"/><path d="M8 21l1-2M12 21l1-2M16 21l1-2"/>'),
  bola_fogo: S('<circle cx="14" cy="10" r="5" fill="currentColor" fill-opacity=".3"/><path d="M9.5 13 3 20M10 9 5 12M13 15l-3 5"/>'),
  gelo: S('<path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>'),
  piscar: S('<circle cx="6" cy="12" r="2.5" stroke-dasharray="2 2"/><circle cx="18" cy="12" r="2.5" fill="currentColor" fill-opacity=".35"/><path d="M9 12h6"/><path d="M13 10l2 2-2 2"/>'),
  meteoro: S('<circle cx="15" cy="15" r="4.5" fill="currentColor" fill-opacity=".3"/><path d="M12 12 4 4M14 10.5 8 3M10.5 14 3 8"/>'),
  corte: ICONS.ataque,
  flecha: S('<path d="M3 21 21 3"/><path d="M15 3h6v6"/><path d="M3 17v4h4"/>'),
  fagulha: S('<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="currentColor" fill-opacity=".25"/>'),
};

export const CLASS_ICONS = {
  guerreiro: S('<path d="M12 2l7 3v6c0 5-3 8-7 10-4-2-7-5-7-10V5z" fill="currentColor" fill-opacity=".15"/><path d="M12 6v11M9 9h6"/>'),
  arqueiro: S('<path d="M6 3c9 2 13 8 13 18"/><path d="M6 3 19 21"/><path d="M12 9l-8 8M4 14v3h3"/>'),
  mago: S('<path d="M12 2l2.4 5.6L20 8.5l-4.3 3.8 1.2 5.7L12 15l-4.9 3 1.2-5.7L4 8.5l5.6-.9z" fill="currentColor" fill-opacity=".2"/><path d="M12 15v7"/>'),
};

export function itemIcon(entry) {
  const px = pixelIconHtml(entry);
  if (px) return px;
  if (entry.kind === 'equip') {
    if (entry.slot === 'weapon') return ICONS[entry.wkind] || ICONS.espada;
    if (entry.slot === 'helm') return ICONS[entry.wkind] || ICONS.elmo;
    if (entry.slot === 'chest') return ICONS[entry.wkind] || ICONS.couro;
    return ICONS.anel;
  }
  const map = { pocao_vida: 'pocao', tonico: 'pocao', pergaminho: 'pergaminho', gosma: 'gota', presa_lobo: 'presa', insignia_goblin: 'insignia', po_osso: 'po', fragmento_fenda: 'cristal', chave_selo: 'chave' };
  return ICONS[map[entry.id]] || ICONS.bolsa;
}

export const NPC_ICONS = { mestre: CLASS_ICONS.mago, ferreira: ICONS.machado, mercador: ICONS.moeda, fornecedora: ICONS.pocao || ICONS.moeda, banqueira: ICONS.moeda, leiloeira: ICONS.bolsa, exploradora: ICONS.mapa, cronista: ICONS.livro, eco: ICONS.globo };
