// =============================================================
// Skins dos heróis (modelos 3D Quaternius, CC0). Só visual: nenhuma muda atributos.
// Qualquer classe pode usar qualquer skin (só o gênero importa).
// Cada skin é uma roupa (outfit = arquivo chars/<G>_<outfit>.glb) e, nas cores extras, uma textura
// (chars/tex/<tex>.jpg). g = gêneros que têm essa roupa. A padrão é grátis; as outras saem na
// Loja de Diamantes (preço em 💎). As cores extras pedem a roupa base (requires).
// =============================================================
export const HERO_SKINS = {
  campones:      { name: 'Camponês', nameF: 'Camponesa', outfit: 'peasant', g: ['M', 'F'], price: 0, desc: 'A roupa simples de quem está começando a aventura.' },
  campones_2:    { name: 'Camponês · Rústico', nameF: 'Camponesa · Rústica', outfit: 'peasant', tex: 'peasant_2', g: ['M', 'F'], price: 50, requires: null, desc: 'A roupa de camponês em outras cores.' },
  patrulheiro:   { name: 'Patrulheiro', nameF: 'Patrulheira', outfit: 'ranger', g: ['M', 'F'], price: 100, desc: 'Capuz, ombreira e botas de couro de quem vigia as estradas.' },
  patrulheiro_3: { name: 'Patrulheiro · Couro', nameF: 'Patrulheira · Couro', outfit: 'ranger', tex: 'ranger_3', g: ['M', 'F'], price: 50, requires: 'patrulheiro', desc: 'O traje de patrulha todo em couro.' },
  mago:          { name: 'Mago', nameF: 'Maga', outfit: 'wizard', g: ['M', 'F'], price: 150, desc: 'Manto bordado de quem estudou na torre dos magos.' },
  mago_2:        { name: 'Mago · Púrpura', nameF: 'Maga · Púrpura', outfit: 'wizard', tex: 'wizard_2', g: ['M', 'F'], price: 75, requires: 'mago', desc: 'O manto de mago em outra cor.' },
  mago_3:        { name: 'Mago · Rubro', nameF: 'Maga · Rubra', outfit: 'wizard', tex: 'wizard_3', g: ['M', 'F'], price: 75, requires: 'mago', desc: 'O manto de mago em outra cor.' },
  nobre:         { name: 'Nobre', outfit: 'noble', g: ['M', 'F'], price: 200, desc: 'Coroa, gola e ombreira de leão: roupa da realeza.' },
  nobre_2:       { name: 'Nobre · Gelo', outfit: 'noble', tex: 'noble_2', g: ['M', 'F'], price: 100, requires: 'nobre', desc: 'A roupa de nobre em outra cor.' },
  nobre_3:       { name: 'Nobre · Esmeralda', outfit: 'noble', tex: 'noble_3', g: ['M', 'F'], price: 100, requires: 'nobre', desc: 'A roupa de nobre em outra cor.' },
  cavaleiro:     { name: 'Cavaleiro', nameF: 'Cavaleira', outfit: 'knight', g: ['M', 'F'], price: 250, desc: 'Armadura de placas, elmo fechado com chifres e ombreiras de espinhos.' },
  cavaleiro_2:   { name: 'Cavaleiro · Dourado', nameF: 'Cavaleira · Dourada', outfit: 'knight_open', tex: 'knight_2', g: ['M', 'F'], price: 125, requires: 'cavaleiro', desc: 'A armadura de cavaleiro dourada, sem elmo.' },
  cavaleiro_3:   { name: 'Cavaleiro · Aço', nameF: 'Cavaleira · Aço', outfit: 'knight_open', tex: 'knight_3', g: ['M', 'F'], price: 125, requires: 'cavaleiro', desc: 'A armadura de cavaleiro de aço, sem elmo.' },
  rei:           { name: 'Rei', nameF: 'Rainha', outfit: 'noble', tex: 'rei', regal: true, g: ['M', 'F'], price: 500, desc: 'Manto vermelho real nas costas e coroa dourada brilhante.' },
};
export const SKIN_ORDER = Object.keys(HERO_SKINS);
export const skuOf = (id) => 'hs_' + id;
// skin válida para o gênero (senão a padrão)
export function skinOf(id, g = 'M') {
  const s = HERO_SKINS[id];
  if (!s || !s.g.includes(g)) return { id: 'campones', ...HERO_SKINS.campones };
  return { id, ...s };
}
export const skinName = (id, g) => { const s = HERO_SKINS[id]; return s ? (g === 'F' && s.nameF) || s.name : id; };
