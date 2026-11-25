// =============================================================
// ELDORIA — Monetização (cosméticos + Pergaminho de Teleporte: só conveniência, nada de força)
// Esta versão NÃO processa pagamentos. Itens premium aparecem bloqueados como "em breve".
// =============================================================

import { HERO_SKINS } from './heroskins.js';

export const MONETIZATION = {
  // Link de apoio (Pix, Ko-fi, Patreon, Catarse…). Deixe vazio para esconder o botão.
  // Exemplo: 'https://ko-fi.com/seu_usuario'
  supportUrl: '',
  supportLabel: 'Apoiar o criador',
  // Texto opcional mostrado junto (ex.: sua chave Pix). Deixe vazio para esconder.
  supportNote: '',
  // Loja de cosméticos premium. Mantenha false até ligar um meio de pagamento real
  // (ex.: Google Play Billing no app Android). Ver README → Monetização.
  storeEnabled: false,
  // Preços exibidos SOMENTE quando a loja estiver ligada (preço real vem da loja do app).
  prices: {
    skin_rubi: 'R$ 4,90', skin_geada: 'R$ 4,90', skin_abismo: 'R$ 7,90',
    fx_geada: 'R$ 2,90', fx_ouro: 'R$ 2,90', aura_petalas: 'R$ 2,90', aura_vazio: 'R$ 3,90',
  },
};

// ---------- Diamantes 💎 ----------
// Moeda premium. Só entra no jogo comprando com dinheiro real: não cai de monstro, não se troca,
// não vai para o mercado nem para o banco. Serve para cosméticos e para o Pergaminho de Teleporte (nada que dê vantagem em combate).
// O saldo de cada jogador fica num documento que SÓ o dono do jogo pode escrever (db "diamonds/<id>").
export const DIAMONDS = {
  // Pacotes mostrados na loja (preço em reais; o valor é cobrado pelo meio de pagamento abaixo).
  packs: [
    { id: 'd100', qty: 100, price: 'R$ 4,90' },
    { id: 'd260', qty: 260, price: 'R$ 9,90', tag: '+30%' },
    { id: 'd550', qty: 550, price: 'R$ 19,90', tag: '+38%' },
    { id: 'd1200', qty: 1200, price: 'R$ 39,90', tag: '+50%' },
  ],
  // Como o jogador paga:
  //  'off'  → compra desligada (mostra "em breve")
  //  'link' → abre um link de pagamento (Mercado Pago, PagSeguro, Pix com QR...). Depois de conferir o pagamento,
  //           o dono do jogo credita os diamantes no "Painel do dono" (aparece só para o dono, na loja de diamantes),
  //           buscando o jogador pelo código que ele mandou junto com o comprovante.
  //  'app'  → app Android com Google Play Billing: o app expõe window.RIFT_STORE.buyDiamonds(packId) e um servidor seu
  //           confirma a compra e credita o saldo (precisa de servidor próprio).
  payment: 'off',
  paymentUrl: '',          // ex.: link do Mercado Pago (modo 'link'). Pode usar {pack} e {code} no link.
  paymentNote: 'Depois de pagar, envie o comprovante com o seu código de jogador. Os diamantes caem na sua conta assim que o pagamento for conferido.',
  // Preço em diamantes dos cosméticos premium
  prices: {
    skin_rubi: 120, skin_geada: 120, skin_abismo: 200, skin_jade: 150, skin_dragao: 220,
    fx_geada: 80, fx_ouro: 80, fx_trovao: 100, // (as auras saíram; quem comprou recebeu os diamantes de volta)
    tp3: 1, tp8: 2, // Pergaminhos de Teleporte: 3 por 💎1, 8 por 💎2 (iguais aos do servidor: server/server.js DIA_PRICES)
    mk10: 100, // +10 espaços de venda no mercado (até 50 no total)
    respec: 50, // redistribuir os pontos de atributo (igual ao servidor)
    // skins dos heróis (modelos 3D): hs_<id> (iguais às do servidor)
    ...Object.fromEntries(Object.entries(HERO_SKINS).filter(([, s]) => s.price > 0).map(([id, s]) => ['hs_' + id, s.price])),
  },
  // podem ser comprados de novo (os visuais são 1 vez só)
  repeat: ['tp3', 'tp8', 'mk10', 'respec'],
  // pacotes de Pergaminho de Teleporte: viajar para qualquer região já descoberta (conveniência, não dá força)
  scrolls: [{ sku: 'tp3', qty: 3 }, { sku: 'tp8', qty: 8, tag: '+33%' }],
};

