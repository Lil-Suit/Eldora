// =============================================================
// ELDORIA — NPCs, diálogos e missões
// Objetivos: kill | collect | reach | interact | flag
// =============================================================

export const NPCS = {
  mestre: {
    name: 'Mestre Aldric', title: 'Mestre da Vila', look: 'mestre',
    role: 'Guia as missões principais e conhece a história dos Selos.',
    greet: [
      'As fendas estão se abrindo mais rápido do que eu temia, viajante.',
      'Eldoria já foi protegida pelos Selos da Realidade. Hoje, eles rangem como portas velhas.',
    ],
  },
  ferreira: {
    name: 'Ferreira Brunna', title: 'Ferreira', look: 'ferreira', service: 'upgrade',
    role: 'Aprimora armas e armaduras com ouro e materiais.',
    greet: ['Traga materiais e ouro, e eu deixo seu aço digno de um herói.', 'Ferro bom não teme fenda nenhuma.'],
  },
  mercador: {
    name: 'Mercador Tomas', title: 'Comerciante', look: 'mercador', service: 'shop',
    role: 'Compra os seus itens (venda rápida) e vende equipamentos simples.',
    greet: ['Equipamento simples para começar — e compro o que você trouxer da estrada!', 'Tudo tem preço, amigo. Até coragem.'],
  },
  fornecedora: {
    name: 'Fornecedora Lia', title: 'Poções e Flechas', look: 'fornecedora', service: 'supplies',
    role: 'Vende poções de vida e de mana (pequena, média e grande), flechas e pergaminhos.',
    greet: ['Poções fresquinhas e flechas afiadas! Leve de 10, de 50 ou de 100.', 'Arqueiro sem flecha é só um homem com um galho.'],
  },
  banqueira: {
    name: 'Banqueira Odete', title: 'Banco de Eldoria', look: 'banqueira', service: 'bank',
    role: 'Guarda o seu ouro (vale para todos os seus personagens) e transfere para outros jogadores.',
    greet: ['Ouro guardado é ouro que não some numa caverna escura.', 'Quer mandar umas moedas para um amigo? É comigo mesmo.'],
  },
  leiloeira: {
    name: 'Leiloeira Mara', title: 'Loja dos Jogadores', look: 'leiloeira', service: 'market',
    role: 'Deixe um item com ela e escolha o preço: ela vende para os outros jogadores, mesmo com você offline.',
    greet: ['Cada item tem um comprador. Só precisa do preço certo.', 'Deixa comigo que eu vendo. Fico com só 5% da venda.'],
  },
  cronista: {
    name: 'Cronista Elias', title: 'Livro dos Itens', look: 'cronista', service: 'itens',
    role: 'Conhece todos os equipamentos de Eldoria: o que cada um faz e quais monstros soltam.',
    greet: ['Anoto tudo o que cai das criaturas de Eldoria. Quer dar uma olhada no meu livro?', 'Do mais simples ao mais lendário: está tudo aqui, em ordem.'],
  },
  exploradora: {
    name: 'Exploradora Lyra', title: 'Exploradora', look: 'exploradora', service: 'hints',
    role: 'Conhece os segredos do vale e dá pistas.',
    greet: ['Já mapeei metade do vale. A outra metade tenta me devorar.', 'Os melhores tesouros ficam onde ninguém olha.'],
    hints: [
      'Há pedras que dançam sobre o Lago Espelhado, a oeste da ponte. Dá para atravessar até a ilha… se pisar com cuidado.',
      'Debaixo da Ponte de Pedra, na margem norte, sempre há algo que os viajantes deixam cair.',
      'Os goblins escondem o melhor saque atrás da tenda maior do acampamento.',
      'Uma árvore oca no extremo leste da Floresta Sussurrante guarda um baú. Procure o tronco mais grosso.',
      'À noite, um lobo de pelo pálido caça na floresta. Dizem que é maior que uma carroça.',
      'No canto nordeste do vale, ao pé das montanhas, alguém escondeu algo valioso.',
      'As runas antigas não respondem a qualquer ordem. O mural de Vel’Thar mostra o caminho.',
    ],
  },
  eco: {
    name: 'Eco do Primeiro Guardião', title: 'Espírito', look: 'eco', service: 'lore',
    role: 'O espírito de quem ergueu os Selos. Revela a história de Eldoria.',
    greet: [
      'Há eras, ergui os Selos para que Eldoria não fosse engolida pelo vazio entre os mundos.',
      'O Guardião que protegia o Selo foi corrompido. Agora ele mantém a fenda aberta.',
      'Cada fenda é uma porta. Algumas levam a mundos que ainda não têm nome.',
    ],
    hidden: true, // só aparece após examinar o altar
  },
};

export const QUESTS = {
  q1_gosmas: {
    name: 'Gosmas no Caminho', giver: 'mestre', turnIn: 'mestre', type: 'principal',
    req: { level: 1 },
    intro: 'Bem-vindo a Eldoria! Os slimes do prado estão bloqueando a estrada logo ao norte da ponte. Derrote cinco deles e prove seu valor.',
    done: 'Muito bem! Você luta como alguém que já atravessou outras fendas. Pegue esta arma — vai precisar dela.',
    stages: [
      { objectives: [{ type: 'kill', target: 'slime', count: 5, text: 'Derrote Slimes', where: [12, -4] }] },
    ],
    rewards: { xp: 120, gold: 25, items: [{ consumable: 'pocao_vida', qty: 3 }, { roll: { slot: 'weapon', rarity: 'incomum', ilvl: 2 } }] },
  },
  s0_gosma: {
    name: 'Mercadoria Pegajosa', giver: 'mercador', turnIn: 'mercador', type: 'secundaria',
    req: { level: 1 },
    intro: 'Gosma de slime é ótima para lubrificar carroças — e para vender a alquimistas. Traga 5 Gosmas do Vale e eu pago bem.',
    done: 'Que cheiro… perfeito! Aqui está o combinado, e umas poções de brinde.',
    stages: [
      { objectives: [{ type: 'collect', item: 'gosma', count: 5, text: 'Colete Gosmas do Vale', where: [20, -14] }] },
    ],
    rewards: { xp: 80, gold: 40, items: [{ consumable: 'pocao_vida', qty: 2 }] },
  },
  q2_presas: {
    name: 'Presas e Insígnias', giver: 'ferreira', turnIn: 'ferreira', type: 'principal',
    req: { level: 2, quests: ['q1_gosmas'] },
    intro: 'Quer uma armadura de verdade? Traga 4 Presas de Lobo da Floresta Sussurrante e 3 Insígnias dos goblins do oeste. Eu faço o resto.',
    done: 'Olhe só para isso: a Armadura do Vale! E agora que conhece minha forja, posso aprimorar seu equipamento.',
    stages: [
      { objectives: [
        { type: 'collect', item: 'presa_lobo', count: 4, text: 'Colete Presas de Lobo', where: [90, -22] },
        { type: 'collect', item: 'insignia_goblin', count: 3, text: 'Colete Insígnias Goblin', where: [-92, -42] },
      ] },
    ],
    rewards: { xp: 450, gold: 60, items: [{ named: 'armadura_vale' }] },
  },
  q3_ecos: {
    name: "Ecos de Vel'Thar", giver: 'mestre', turnIn: 'eco', type: 'principal',
    req: { level: 4, quests: ['q1_gosmas'] },
    intro: "Algo desperta nas Ruínas de Vel'Thar, ao norte. Vá até o Altar dos Selos e descubra o que é. Cuidado: os esqueletos de lá não descansam.",
    done: 'Você me ouviu… Faz tanto tempo que ninguém toca o altar. Escute, herói: o Selo está quase partido.',
    stages: [
      { objectives: [{ type: 'reach', poi: 'ruinas', text: "Chegue às Ruínas de Vel'Thar", where: [-26, -96] }] },
      { objectives: [{ type: 'interact', id: 'altar', text: 'Examine o Altar dos Selos', where: [-26, -103] }] },
    ],
    rewards: { xp: 700, gold: 80, items: [{ consumable: 'tonico', qty: 2 }] },
  },
  q4_cripta: {
    name: 'A Cripta do Vigia', giver: 'eco', turnIn: 'eco', type: 'principal',
    req: { level: 5, quests: ['q3_ecos'] },
    intro: 'A chave do Selo foi guardada pelo Vigia, na cripta a leste. A corrupção o alcançou. Liberte-o — e traga a Chave do Selo.',
    done: 'A Chave do Selo… Com ela, a barreira do Planalto da Fenda vai se abrir para você.',
    stages: [
      { objectives: [{ type: 'reach', poi: 'cripta_interior', text: 'Entre na Cripta do Vigia', where: [148, -115] }] },
      { objectives: [{ type: 'kill', target: 'vigia', count: 1, text: 'Derrote o Vigia Corrompido', where: [148, -115] }] },
    ],
    rewards: { xp: 1400, gold: 150, items: [{ quest: 'chave_selo' }] },
  },
  q5_guardiao: {
    name: 'O Guardião da Fenda', giver: 'eco', turnIn: 'mestre', type: 'principal',
    req: { level: 7, quests: ['q4_cripta'] },
    intro: 'O antigo Guardião agora mantém a fenda aberta na Planície do Guardião — o portal fica no topo do Planalto, ao norte. Derrote-o antes que o Selo se parta de vez. Recomendo nível 18 ou mais (o Guardião é nível 25).',
    done: 'Você conseguiu! O Selo de Eldoria resiste… por enquanto. Mas recebemos notícias: fendas estão se abrindo em outras regiões. Sua jornada está só começando.',
    stages: [
      { objectives: [{ type: 'kill', target: 'boss_fenda', count: 1, text: 'Derrote o Guardião', where: [35, -392] }] },
    ],
    rewards: { xp: 3000, gold: 400, items: [{ consumable: 'pocao_vida', qty: 5 }] },
  },
  s1_runas: {
    name: 'As Três Runas', giver: 'exploradora', turnIn: 'exploradora', type: 'secundaria',
    req: { level: 3, quests: ['q1_gosmas'] },
    intro: "Três Pedras-Runa estão espalhadas pelo vale: Sol, Lua e Estrela. Dizem que a ordem certa está gravada num mural em Vel'Thar. Se as ativar na ordem, algo se abre na ilha do lago.",
    done: 'O Anel da Aurora! Eu sabia que a lenda era verdadeira. Fique com ele — você mereceu.',
    stages: [
      { objectives: [{ type: 'interact', id: 'mural', text: "Encontre o Mural das Runas em Vel'Thar", where: [-42, -90] }] },
      { objectives: [{ type: 'flag', flag: 'runasOk', text: 'Ative as Pedras-Runa na ordem do mural' }] },
      { objectives: [{ type: 'interact', id: 'cofre', text: 'Abra o Cofre do Bosque Oculto', where: [-95, 33] }] },
    ],
    rewards: { xp: 600, gold: 100 },
  },
};

export const QUEST_ORDER = ['q1_gosmas', 's0_gosma', 'q2_presas', 'q3_ecos', 's1_runas', 'q4_cripta', 'q5_guardiao'];
