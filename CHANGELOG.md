# Histórico de versões

## v0.9.3 — Equipamentos novos, dano estilo Rucoy e mapas sem regiões
- **Drops:** no chão aparece só a arte do item (sem os anéis coloridos); brilho de feixe só para épico ou melhor.
- **Bem menos drops**, com raridades muito mais difíceis: azul (raro) é cerca de 1 em 50 itens de monstro comum, e itens já caem pouco.
- **A espada lendária do 1º chefe não cai mais sempre:** o lendário de chefe ficou raríssimo (cerca de 2%), e os chefes agora dropam qualquer parte do equipamento.
- **Novos espaços de equipamento:** calça, luva esquerda, luva direita, botas e mochila.
  - O inventário mostra um boneco 3×3 que cabe sem rolar.
  - Luvas, botas, joelheiras e mochila aparecem no personagem.
- **Dano estilo Rucoy:** cada monstro tem armadura, que cresce com o nível e com o tipo do monstro. O mesmo golpe que tira quase tudo de um slime tira bem menos de um lobo. Quem fica muito mais forte que o monstro ignora a armadura, então dá pra chegar a ~1,5k no futuro.
- **Ermos e Confins (depois dos portais):**
  - Monstros espalhados pelo mapa inteiro em grupos pequenos.
  - O nível sobe quanto mais longe da entrada.
  - Cada monstro tem nível fixo.
  - Os muito fortes aparecem em grupos de 1–2.
  - Os grupos só nascem perto dos jogadores.
- **Sem as manchas redondas de região** no chão e no mapa dos Ermos.
- **Sem placas flutuantes de texto** no mundo.
- **Visual próprio** para 20 monstros que repetiam o corpo de outros: Goblin Corrompido, Diabrete das Cinzas, Goblin Fundeiro, Caçador Goblin, Arqueiro das Falésias, Cavaleiro de Osso, Cavaleiro Negro, Cavaleiro da Fenda, os 5 conjuradores, Brasa-Viva, Gosma Abissal, Lobo Sombrio e 4 golems/colossos.

## v0.9.2 — Cavalo com a bolsa cheia
- Se a bolsa estiver cheia, o Cavalo do Criador entra no lugar do item mais barato, que fica no chão ao seu lado (nada se perde).
- O botão de montar aparece sempre para a conta dona do jogo.

## v0.9.1 — Pesquisa na loja e Cavalo do Criador
- **Loja dos Jogadores: pesquisa.**
  - Campo "Pesquisar pelo nome…", que filtra enquanto você digita, sem ligar para acento nem maiúscula.
  - Fileira de **imagens dos itens à venda**: toque numa imagem para ver só aquele tipo (ex.: só Espadas, só Pelo de Yeti) e toque de novo para tirar o filtro.
  - Botão "Limpar".
- **Cavalo do Criador** (só para a conta dona do jogo, em todos os personagens): montaria que corre **20× mais rápido** que a pé, para explorar o mapa.
  - Como montar: botão do cavalo no celular, tecla H ou "Montar" no inventário.
  - Atacar ou usar habilidade desmonta. O cavalo não entra na Cripta.
  - Em alta velocidade o cavalo anda em passinhos e não atravessa paredes.
  - Os outros jogadores veem você montado.
  - Não pode ser trocado nem vendido.

## v0.9.0 — Economia: banco, loja dos jogadores, troca segura e diamantes
- **Banqueira Odete (Banco)**, na vila atrás da estátua.
  - Guardar e sacar ouro. O banco é da conta, então vale para todos os seus personagens.
  - Transferir ouro para outro jogador pelo nome ou código: sai do seu banco e cai no banco dele, mesmo offline.
  - Histórico das últimas movimentações.
- **Leiloeira Mara (Loja dos Jogadores)**, com barraca própria.
  - Você deixa um item e escolhe o preço; outros jogadores compram e você recebe o ouro mesmo offline (taxa de 5%).
  - Filtros (armas, armaduras, anéis, materiais, poções) e ordenação por preço.
  - Até 10 anúncios por jogador. Cada anúncio dura 3 dias; depois o item volta pelo botão "Retirar".
- **Troca segura**: menu Time → Trocar, com a pessoa a até 10 m.
  - Cada um oferece até 8 itens + ouro.
  - Qualquer mudança desmarca o "Pronto" dos dois.
  - Tela de conferência "você dá / você recebe".
  - A troca só acontece quando os dois confirmam a mesma oferta e cada lado ainda tem o que ofereceu.
  - É cancelada se alguém se afastar.
  - Itens recebidos passam por um validador; itens de missão não podem ser trocados.
- **Diamantes 💎**: só com dinheiro real e só para visuais. Não caem de monstros e não podem ser trocados, vendidos nem transferidos.
  - Loja com pacotes e visuais premium. Dois novos: Jade Imperial e Dragão Carmesim; e o efeito Trovão.
  - O saldo só pode ser creditado pelo dono do jogo, pelo **Painel do dono**, depois de conferir o pagamento.
  - Cada jogador tem um código para mandar junto com o comprovante.
  - A compra com dinheiro real começa desligada ("em breve") até o dono configurar o meio de pagamento (`src/config/monetization.js`).

## v0.8.5 — Eventos novos, XP do Rucoy e saque de chefe dividido
**XP no estilo do Rucoy Online**
- XP total para chegar ao nível L = L^(3 + L/1000), igual ao Rucoy. Cada monstro dá cerca de 2× o nível dele (o dobro do Rucoy, porque aqui cada luta demora mais).
- Abates para subir de nível com monstros do seu nível: ~4 no nível 3, ~8 no 10, ~10 no 13, ~15 no 20, ~23 no 30.
- Monstros mais fortes que a média dão mais XP. Elites dão bem mais. Um chefe vale ~2,5 níveis.
- Monstros até 6 níveis abaixo dão XP cheio.
- O nível máximo subiu de 30 para 100.
- Quem já tinha XP na barra mantém a mesma porcentagem. Missões e descobertas continuam valendo a mesma fração de nível de antes.

**Drops no estilo do Rucoy**
- O ouro cai sempre.
- Cada monstro dos Ermos e dos Confins solta o seu próprio troféu, com arte em pixel no mesmo estilo do inventário: Chifre de Minotauro, Pelo de Yeti, Olho Pútrido, Coração de Gelo, Presa Infernal etc. São 45 troféus novos.
- Equipamento cai com mais frequência. As chances aparecem no Bestiário.

**Chefes: de 1 a 3 itens, divididos pelo dano**
- Cada chefe (Guardião, Vigia, Lobo Alfa e campeões de evento) solta de 1 a 3 itens diferentes.
- Com várias pessoas, cada item é sorteado entre quem bateu, com chance proporcional ao dano causado. Uma mensagem mostra quantos itens você levou e quanto dano causou.
- Ouro e materiais continuam sendo de todos.

**12 eventos de ondas**
- Mais forte = mais raro: a chance é proporcional a 1/★^1,6.
- **Vale:** Ruptura (★, agora com 6 ondas), Invasão Goblin (★★), Horda de Ossos (★★★, mais comum à noite).
- **Ermos:** Ruptura Abissal (★), Marcha dos Cavaleiros de Osso (★★★), O Colosso Desperta (★★★★).
- **Confins:** Horda do bioma (★), Ninho de Escorpiões (★), Estouro de Minotauros (★★), Enxame de Cérebros (★★), Caçada do Lobisomem (★★★, à noite) e Fúria do Titã (★★★★★, raríssimo).
- Cada evento tem de 6 a 8 ondas e um **campeão** na última: um monstro gigante que dá choque em área a cada 3 golpes.
- Cada evento tem o seu troféu.
- Os eventos do Vale ficaram mais difíceis: o nível dos monstros acompanha o seu.
- Com mais jogadores perto, as ondas ficam maiores.
- Quem estava perto quando o evento fecha ganha a própria recompensa (XP, itens e troféu).

## v0.8.4 — Visual novo dos monstros
- **Titãs** refeitos: tronco de rocha com placas e um núcleo brilhando no peito, ombros de pedra com pontas, cabeça baixa com mandíbula e olhos fundos, punhos enormes com correntes quebradas, cinto com caveira e saiote de placas.
  - **Gelo:** coroa e barba de cristais, estalactites nos ombros e braços.
  - **Magma:** presas, chifres e lava escorrendo.
  - **Fenda:** elmo com chifres, viseira acesa, capa e um halo de runas girando atrás da cabeça.
  - Espadona de pedra com fio e runas brilhando.
- **Minotauro:** cabeça de touro de verdade (focinho com narinas e argola, chifres curvos de 3 partes, orelhas), corcova de pelo, correia no peito, ombreira de ferro com espinhos, braçadeiras, tanga com caveira, cauda e machado de duas lâminas.
- **Lobisomem:** focinho comprido com presas e mandíbula que abre, orelhas pontudas, juba nas costas, garras nas mãos e nos pés, short rasgado e cauda peluda.
- **Yeti:** rosto escuro, chifres de carneiro, presas, barba, cristais de gelo nas costas e mais pelo nos braços.
- **Cérebros:** dois hemisférios cheios de dobras, olho enorme com pálpebra, tronco cerebral com vértebras e tentáculos de 3 partes que ondulam. O Pútrido tem olhinhos extras e pinga gosma; o Abissal tem cristais em órbita. Os dois têm uma aura leve.
- **Cérbero:** bocas acesas, coleiras com espinhos, juba de fogo, rachaduras de lava no corpo e as cabeças dos lados se mexendo.

## v0.8.3 — Monstros de verdade nos Confins
Os bichos comuns (javali, cervo, urso, salamandra) saíram. No lugar entraram monstros com modelos próprios:
- **Planícies Douradas:** **Minotauro** (machado, investe com os chifres) e o elite **Golem de Pedra** (runas azuis, bate no chão e racha tudo em volta).
- **Pântano Sombrio:** **Cérebro Pútrido**, um cérebro que flutua com tentáculos e espalha poças de **veneno**.
- **Floresta Esmeralda:** **Lobisomem** (3 garradas seguidas e um salto por cima de você).
- **Tundra Gélida:** **Yeti** (esmurra o chão e deixa lento) e o elite **Titã de Gelo**, gigante de 5 m com clava de gelo.
- **Terras de Magma:** **Cérbero** de três cabeças (morde duas vezes e cospe fogo) e o elite **Titã de Magma** (espada enorme, chama meteoros).
- **Picos do Fim do Mundo:** **Cérebro Abissal** (chove orbes do céu) e o elite **Titã da Fenda**, o maior de todos, que salta e cai sobre você.
- Os titãs são pesados: quase não são empurrados e o golpe deles atinge uma área no chão.
- Correção: as feras de 4 patas agora mostram a animação de ataque (antes atacavam paradas), e os golpes especiais dos humanoides usam a animação certa (investida, salto, pancada).
- O veneno agora aparece como “Veneno”, não “Queimadura”.

## v0.8.2 — Golpe especial de cada criatura
Cada espécie agora tem um golpe próprio, sempre avisado no chão antes de acertar (a esquiva evita tudo, inclusive os efeitos):
- **Escorpião de Âmbar:** ferroada curta que **envenena** (dano por 4 s).
- **Aranha dos Galhos:** cospe **teia** que deixa você **lento**.
- **Javali Dourado / Javali-Rei:** **investida** em linha reta; se bater numa parede, fica atordoado (brecha).
- **Cervo Espinhoso:** **salta** e cai em cima do ponto marcado.
- **Salamandra de Magma:** **sopro de fogo** em cone que **queima**.
- **Urso Polar:** fica de pé e **bate no chão** em área (deixa lento).
- **Besouro de Brasa:** **rola** em brasa na sua direção e queima.
- **Caranguejo Abissal:** **fecha o casco** (leva 75% menos dano) e depois revida.
- **Ente Ancião:** **raízes** saem do chão e **prendem** você (esquive para escapar).
- **Homem-Lagarto:** **estocada** longa de lança.
- **Conjuradores:** círculos mágicos no chão — fogo **queima** (Piromante, Arauto, Feiticeiro das Dunas); água e arcano deixam **lento** (Conjurador Afogado, Necromante, Oráculo).

## v0.8.1 — Criaturas novas e níveis em escada
- **Níveis sempre subindo depois do primeiro chefe:** Planície do Guardião 8–11 → Ermos da Fenda 10–20 → **Confins 20–40** (Planícies 20–24, Pântano e Deserto 24–28, Floresta 28–32, Tundra 32–36, Magma 33–37, Picos 36–40). O portal dos Confins agora pede **nível 18**.
- **Sem lobos e gosmas "pintados" nos mapas novos:** 13 modelos novos de verdade — Besouro de Brasa, Aranha dos Galhos, Caranguejo Abissal (Ermos); Javali Dourado e Javali-Rei, Homem-Lagarto, Escorpião de Âmbar, Cervo Espinhoso, Ente Ancião, Urso Polar, Salamandra de Magma (Confins); conjuradores encapuzados com cajado e capuz; cavaleiros de armadura completa. O nome sempre combina com o visual (o antigo "Touro Rochoso" que era um golem virou o Javali-Rei).
- Golens/colossos agora têm cristais e olhos da cor do bioma (gelo, magma, arenito, musgo, astral).
- Novo papel **fera** (javalis, ursos): investem e emendam 2 golpes; **fera elite** faz combos de 3.
- **Itens no chão sem quadro de fundo:** só o ícone do item (a raridade aparece no anel no chão).

## v0.8 — Batalhas de verdade
- **Chefe e elites interativos (estilo soulslike):** o Guardião faz combo de 3 garras (o terceiro golpe vem **atrasado e pesado**, com aviso vermelho), solta **ondas no chão** que você atravessa com a esquiva, e na fase final o golpe no chão tem tempo variável (finta). Depois do combo ou de uma investida, ele fica **exausto: BRECHA!** — 1,3 a 2,2 s parado levando **+50% de dano**.
- Guerreiros, saqueadores, esqueletos, guardiões, Vigia, Lobo Alfa e elites da Fenda também fazem combos de 2–3 golpes com o último atrasado e abrem brecha no fim.
- **Atiradores corrigidos:** quando estão fugindo e a recarga acaba, param, viram para você, atiram e voltam a correr. O tiro sempre sai na sua direção.
- **XP:** barra de nível bem menor (nível 12 → 13: de 16.700 para 4.800 XP) e monstros de nível alto dão mais XP (≈ 25 abates do mesmo nível por nível). O Guardião dá 4.200 XP.
- **Monstros da Fenda mais fortes** (≈ +35% de vida, +20% de dano), com **nomes curtos** (Brasa-Viva, Conjurador Afogado, Cavaleiro Negro…).
- **Ermos: muito mais monstros e espalhados** (≈ 275, em grupos maiores e pequenos bandos por toda a região).
- **Morro do acampamento:** o Acampamento dos Exilados fica no alto de um morro com o **Mirante dos Exilados**; lá de cima a neblina abre e dá para ver longe. Feixes de luz dos portais agora são curtos e somem na neblina.
- **Itens no chão com o mesmo visual do inventário** (ícone em pixel e quadro da raridade). **Moedas caem no chão** e são recolhidas ao passar.
- **Floresta dos lobos** do vale vai agora até a entrada da Cripta, com 4 grupos novos de lobos e um Lobo Alfa.
- **Tela inicial:** seus personagens aparecem em destaque (toque para jogar); "Novo personagem" fica menor e só libera depois de verificar os saves da conta.

## v0.7 — Ermos da Fenda completos e monstros com régua única
- **Ermos da Fenda (o mapa depois do chefe) ficou inteiro:** 960 × 960 m (2× maior), **8 regiões**: Campos de Cinza (10–12), Bosque dos Galhos Mortos (11–13), Charneca dos Uivos Eternos (12–14), Lago Violeta (12–14), Falésias do Vento Cortante (13–15), Ossário dos Reis (14–16), Vale dos Cristais (15–17) e Trono Partido (17–20). 31 grupos, 130 monstros, 6 baús.
- **12 monstros da Fenda, 1 ou 2 por região**, misturando corpo a corpo e distância: Brasa-Viva dos Campos de Cinza + Batedor Goblin das Cinzas Errantes; Lobo Sombrio dos Galhos Mortos; Saqueador Goblin Corrompido da Charneca; Gosma Abissal + Conjurador Afogado do Lago Violeta; Arqueiro Esquelético das Falésias do Vento Cortante; Cavaleiro de Osso + Necromante Encapuzado do Ossário dos Reis; Colosso de Cristal do Vale Partido; Cavaleiro Negro + Arauto Flamejante da Fenda do Trono Partido.
- **Régua única de força:** cada monstro tem um papel (enxame, caçador, guerreiro, saqueador, atirador, arqueiro, conjurador, bruto) com vida, dano, defesa, velocidade e alcance próprios; o **nível** escala tudo do mesmo jeito que no vale. XP e ouro saem da vida e do dano (monstro mais forte = mais recompensa). Saque por papel: enxame dá menos, elite dá muito mais.
- **Ataques à distância novos:** flechas, orbes de magia e bolas de fogo de monstros (com rastro), além das pedras. Funcionam no multiplayer.
- **Confins** reorganizados com a mesma régua: 1 ou 2 monstros por bioma + elite, com nomes completos (ex.: Piromante Esquelético das Terras de Magma, Oráculo Astral dos Picos do Fim do Mundo).

## v0.6 — Planície do Guardião
- **O topo do morro do chefe agora é plano e enorme:** o Planalto da Fenda continua para o norte como a **Planície do Guardião**, uma área plana de ~250 × 250 m (cerca de 24× o topo antigo), sem tela de carregamento — é só subir a rampa e seguir. O morro que subia em direção à montanha foi aplainado.
- **Muito mais monstros do planalto:** 22 grupos novos (73 monstros) de Guardiões Corrompidos, Esqueletos, Lobos e Gosmas da Fenda, Goblins e um Lobo Alfa, níveis 8–11.
- Ruínas, pilares quebrados, muros caídos, cristais corrompidos, árvores mortas e uma colunata que leva até o **Trono do Guardião** no fundo da planície, onde o chefe agora espera.
- **Portal atrás do trono:** depois de derrotar o Guardião (ou a partir do nível 10), o portal leva aos **Ermos da Fenda**, o "outro canto" do mapa com monstros diferentes; de lá, os Confins (nível 12).
- Minimapa e mapa completo mostram a Planície, o trono e o portal; ao andar pela Planície o mapa completo mostra o norte.

## v0.5.2 — Modo time
- **Times sem limite de pessoas:** toque em "no vale" (no minimapa) para ver quem está online e **Convidar**. Quem recebe o convite vê uma janela com **Entrar** / **Recusar**.
- **XP dividido** igualmente entre os membros que lutaram ou estavam perto (até 55 m); quem ajudou ganha o abate, missões, bestiário e **conquistas**, inclusive a vitória sobre chefes.

## v0.5 — Ermos da Fenda e Confins de Eldoria
- **Ermos da Fenda (mapa 2):** atravesse o portal do Planalto (vença o Guardião ou chegue ao nível 10). Região de 680 × 680 m (mais de 20× a área do Planalto) sem cidades: Campos de Cinza, Bosque dos Galhos Mortos, Lago Violeta, Ossário dos Reis, Vale dos Cristais e Trono Partido. 5 monstros novos (níveis 10–20), 18 grupos, 4 baús. Acampamento dos Exilados com portal de volta.
- **Confins de Eldoria (mapa 3):** portal dourado atrás do Trono Partido, **exige nível 12**. Mapa de 3,7 × 3,7 km (~30× os Ermos), carregado em blocos perto do jogador para rodar no celular. 7 biomas: Planícies Douradas (12–16), Pântano Sombrio e Deserto de Âmbar (16–21), Floresta Esmeralda (19–24), Tundra Gélida (24–29), Terras de Magma (25–30) e Picos do Fim do Mundo (30–35). **28 monstros novos** (3 comuns e 1 elite por bioma). Os grupos aparecem conforme os jogadores chegam perto e somem quando todos se afastam. Posto da Fronteira com portal de volta.
- **Mais monstros no vale:** 16 grupos novos espalhados pelo mapa principal.
- **Portais fáceis de achar:** placa flutuante e seta em cima de cada portal, ◎ no minimapa (mesmo fora da tela), aviso ao chegar no Planalto com nível 10, e o marcador de objetivo aponta para o próximo portal quando não há missão. Área de interação maior.
- Minimapa e mapa completo funcionam nos mapas novos (com biomas, níveis e portais).
- **Efeitos das habilidades:** chão rachando com brilho (golpe pesado, Investida, Redemoinho, Golpe Sísmico, Prisão de Gelo); meteoro em brasa caindo na diagonal com cauda de fogo, onda de choque, pedras voando e marca queimada que esfria no chão; bola de fogo deixa marca e fumaça; flechas e magias deixam uma linha fina de vento atrás; Chuva de Flechas com flechas que caem riscando o ar e cravam no chão.
- **Porte e caminhada:** peito aberto parado; caminhada com passos mais curtos, braços soltos e cabeça erguida; corrida com inclinação, joelhos altos e cotovelos dobrados; o quadril balança para o lado da perna de apoio e a cabeça compensa o tronco (olhar estável).

## v0.4.2
- **Chave do Selo no baú do Vigia** (antes ela só vinha ao entregar a missão). Quem já tinha aberto o baú recebe a chave ao entrar no jogo.
- **Baús se enchem de novo com o tempo:** o do Vigia a cada 10 minutos (sempre com uma nova Chave do Selo), os demais a cada 25 minutos. O tempo conta mesmo com o jogo fechado.
- **Mercado dos Viajantes** (com o Mercador Tomas): anuncie itens da bolsa com o seu preço; outros jogadores compram; você recebe o ouro (menos 5% de taxa) mesmo se estiver offline. Abas Comprar, Vender e Meus anúncios; até 6 anúncios por jogador; cancelar devolve o item. Funciona na página publicada.
- **Progressão mais lenta:** habilidades liberadas nos níveis 1, 4, 7 e 10 (antes 1, 3, 5 e 8) e ~45% mais XP para chegar ao nível 10.

## v0.4.1
- **Ícones de itens em pixel art** (desenhos originais 16x16): cada tipo de arma, armadura, anel, poção e material tem seu desenho, com detalhes na cor da raridade (gema, pluma, tecido) e o espaço do inventário pintado na cor da raridade. Ficheiro: `src/ui/pixelicons.js` — cada ícone é uma grade de letras fácil de editar.

## v0.4
- **Mundo compartilhado:** todos os jogadores veem e enfrentam os MESMOS monstros, no vale e dentro da Cripta. Um jogador (o primeiro que entrou e está com o jogo na tela) simula o mundo; os outros recebem o estado ~6x por segundo e enviam o dano que causam. Monstros perseguem e atacam qualquer jogador; golpes em área e avisos no chão aparecem para todos; eventos e horário do dia são os mesmos. XP e saque continuam individuais (cada um ganha pelo que lutou). Se quem simula sair ou minimizar, outro assume automaticamente.
- **O jogo não pausa:** menus, inventário, configurações e diálogos abrem por cima com o mundo rodando.
- **Planalto da Fenda:** muralha de pedra em volta; só se entra pela Barreira do Selo, que exige nível 8 (e a chave).
- **Tela de dano ajustável:** em Configurações → Interface: Automática (mede o tamanho real da tela a cada mudança e encosta nas 4 bordas), Suave ou Desligada, e intensidade.
- Teste automático de multiplayer (`tools/mptest.mjs`) com duas abas na mesma sala.

## v0.3.3
- Corrigido: um personagem antigo aberto em aparelhos diferentes virava várias cópias, e a lista podia "perder" um personagem. Agora a lista é lida direto da nuvem, cópias do mesmo personagem aparecem uma vez só (a mais avançada) e saves antigos recebem sempre o mesmo id.

- **Novo nome: ELDORIA: O Mundo Sem Limites** (tela inicial, carregamento, título da página e app instalável).
- **Itens proporcionais:** curva de crescimento por nível mais suave (um item 10 níveis acima ≈ 3× o inicial, antes ≈ 4×), raridades mais próximas (Incomum +10%, Raro +22%, Épico +36%, Lendário +50%, Mítico +65%), afixos menores e bônus de chefe de +12%. Antes, uma arma épica de chefe mais que dobrava o poder do personagem.
- **Saque no seu nível:** itens que caem nunca pedem nível acima do seu (no máximo 1–2 níveis de item acima), então sempre dá para equipar.
- Itens já existentes nos personagens são reescalados automaticamente para a curva nova, mantendo a qualidade relativa de cada um.

- **Animações mais suaves:** cada articulação persegue a pose com amortecimento — sem "estalos" ao começar ou terminar golpes, e capa, cauda e mandíbula balançam com atraso natural.
- **Postura de combate:** parado em combate, o herói abaixa a base e ergue a arma (espada e escudo, arco, cajado); goblins e esqueletos também.
- **Peso no movimento:** inclina nas curvas e ao acelerar/frear; passada sincronizada com a velocidade (pés não patinam); dá passinhos ao girar parado; troca o peso de uma perna para a outra quando ocioso.
- **Pés no chão:** o quadril se ajusta ao dobrar os joelhos (guarda, golpes), sem afundar no terreno.
- Lobos inclinam o corpo nas curvas; golens movem braços e pernas com mais peso.

- **Mira com analógico corrigida:** Arqueiro e Mago miram no alvo no momento do disparo (com antecipação do movimento) e as flechas/fagulhas perseguem levemente o alvo escolhido. Teste automático: 93% de acerto girando o analógico enquanto ataca.
- **Corpo a corpo em morros:** pequeno avanço até o alvo quando ele está um pouco fora do alcance, tolerância para desníveis e arco do golpe inclinado acompanhando o terreno.
- **Alcance menor:** Arqueiro 15 m e Mago 13,5 m no ataque básico (habilidades também foram reduzidas).
- **Velocidade de início menor:** heróis começam ~23% mais lentos e ganham até +14% com os níveis; inimigos acompanharam.
- **Drops:** monstros comuns derrubam bem menos (Slime: 3,5% de equipamento, 22% de Gosma; mais quando a missão pede).
- **Itens de chefe:** "Forjados na Fenda" — nível +2, +22% no atributo principal, 1 afixo extra, raridade mínima garantida (Guardião: 2 Épicos + 1 Raro, além do lendário da classe na 1ª vitória).
- **Eventos no mapa:** marcador pulsante no minimapa e no mapa completo, com nome do evento; o Lobo Alfa é seguido no mapa. Chefe marcado com ☠.
- **Toque no minimapa abre o mapa.**
- **Interface sem rolagem:** inventário, personagem, habilidades, missões, mapa, bestiário, aparência e configurações cabem na tela do celular deitado.
- **Itens identificáveis:** cada espaço do inventário mostra nome curto, ataque/defesa, quantidade, seta de melhoria e fundo vermelho quando não pode ser usado.
- **Personagens separados:** até 8 personagens, cada um com seu próprio save (navegador e nuvem). O mesmo personagem aberto em outro aparelho não aparece mais como "clone".
- **Visual:** heróis com joelhos e cotovelos, rosto, cinto, braçadeiras, capa em duas partes; Guerreiro com tabardo e ombreiras, Arqueiro com cachecol e aljava, Mago com manto e cristal flutuante. Monstros redesenhados (slime gelatinoso com boca, lobo com mandíbula e patas articuladas, goblin curvado com tanga e colar, esqueleto com elmo e escudo, golens com rachaduras brilhantes e musgo).
- **Animações:** corrida com passada e contra-rotação, respiração e piscar, golpes com passo à frente e golpe pesado com salto, puxar e soltar o arco, estocada de goblin, bote e mordida de lobo, salto do slime. Monstros brilham em vermelho enquanto preparam o golpe.
- Celular em pé mostra "Gire o celular". "Zona segura" virou um selo de texto (não parece mais botão).

## v0.2
- Corrigido: o arco do golpe corpo a corpo era desenhado atrás do personagem.
- Dificuldade reequilibrada: inimigos com mais vida e dano; diferença de nível altera o dano dos dois lados; sem bônus de XP por caçar inimigos muito acima do seu nível; aviso de região perigosa e marcador ☠.
- Herói com menos vida inicial (Vitalidade dá +10 de vida por ponto).
- Guarda-roupa de cosméticos (visuais, efeitos de arma, auras), 8 conquistas e estrutura de loja premium (desligada) + botão opcional "Apoiar o criador".
- Tela cheia automática no primeiro toque, sem botões.
- Layout para celular deitado em telas baixas (minimapa e botões não se sobrepõem).
- Silhueta do herói visível através de árvores e paredes; câmera enquadra o chefe.
- Terreno sem lagos acidentais; floresta menos densa; slimes com cor própria.

## v0.1
- Primeira versão jogável: Vale de Eldoria, 3 classes, combate, IA, chefe em 3 fases, saque, inventário, missões, masmorra, evento mundial, dia/noite, salvamento e multiplayer de presença.
