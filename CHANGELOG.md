# Histórico de versões

## v0.9.62 — Mochilas pela raridade
- **A raridade agora manda no espaço da mochila.** Antes, em nível alto toda mochila chegava ao mesmo limite (+42), então uma Incomum valia o mesmo que uma Mítica. Agora cada raridade tem o seu máximo: Comum **12**, Incomum **18**, Raro **24**, Épico **30**, Mítico **38** e Lendário **45**. O nível do item leva até esse máximo: no nível 1 é cerca de um terço, a partir do nível 120 é o máximo. Forjada na Fenda: +10%.
- **Mochila só dá espaço:** nenhum outro atributo.
- As mochilas que você já tem foram recalculadas pela regra nova. **Nenhum item se perde:** se a sua mochila equipada ficar menor do que a bolsa cheia, ela mantém o espaço necessário até você liberar.
- Os espaços da mochila aparecem na bolsa mesmo **vazios**, para você ver quanto ainda cabe.

## v0.9.61 — Celular sempre deitado e em tela cheia
- **Tela cheia sempre:** se o celular sair da tela cheia (voltar, notificação, trocar de app), o jogo entra de novo no **próximo toque**. Antes ele desistia depois de 3 tentativas e as barras do navegador ficavam aparecendo.
- **Sempre deitado:** ao entrar em tela cheia, a tela trava no lado em que o celular está e **não gira mais**. Com o celular em pé, aparece "Gire o celular" por cima de tudo (até da tela de entrar), em qualquer celular ou tablet.

## v0.9.60 — Bolsa com páginas e arqueiro/mago com mais alcance
**Bolsa, cofre e lojas com páginas**
- Os itens agora têm **sempre o mesmo tamanho**, maior e fácil de tocar, na bolsa, no cofre do banco e nas lojas (vender no Mercador e anunciar na Leiloeira). Eles não encolhem mais quando a bolsa cresce.
- Quando não cabe tudo, aparece uma **seta ao lado dos itens** (›) para trocar de página, com os tracinhos em cima mostrando em qual página você está (estilo Rucoy).

**Arqueiro e Mago**
- **Alcance maior:** a Flecha foi de 15 para **18 m** (e voa mais rápido), e a Fagulha Arcana de 13,5 para **16,5 m**. As habilidades de distância também ganharam cerca de 2 m.
- **Tiro estranho corrigido:** no celular, segurando o ataque sem nenhum monstro no alcance, o arqueiro e o mago **não atiram mais** para todo lado (as flechas saíam para onde você estava andando). Aparece o aviso "Nenhum alvo no alcance". Com um alvo, atiram normal, mesmo andando.

## v0.9.59 — Menos travadas, mapa com zoom, gestos e Titã de Gelo mais difícil
**Desempenho (as "travadinhas")**
- Os efeitos (golpes, anéis, explosões) não refazem mais o shader toda vez: antes, cada efeito que sumia jogava o shader fora e o próximo igual travava o celular para compilar de novo. Agora cada tipo compila **uma vez só**, e os principais já são preparados ao entrar no jogo.
- Só os monstros **perto** fazem sombra (a sombra de cada monstro custava desenhar ele de novo). Nas Ruínas, isso cortou mais da metade do trabalho de desenho.
- Monstros dentro da neblina não são desenhados nem têm os ossos recalculados.
- A aura tem menos partículas e o anel no chão é mais leve.

**Visual e uso**
- **Aura:** parada, o que cai de cima cai pela metade. Andando, correndo ou atacando, as partículas saem das **costas** (como um rastro), inclusive as que saíam do chão. Outros jogadores mostram metade das partículas.
- **Tela vermelha de dano** agora é desenhada dentro da imagem do jogo: cobre a tela inteira, de ponta a ponta, em qualquer celular.
- **Castelos dos Confins:** as paredes não ficam mais meio invisíveis quando você chega perto. Elas continuam sólidas e só abrem um buraco redondo no pedaço que tapa o seu personagem.
- **Gestos:** a janela ficou bonita (cartões com ícone) e agora funciona no celular. Antes o toque ia para o joystick por baixo dela. Tem também o botão **Parar**.
- **Botão ≡ (celular):** abre direto o diário na última aba que você usou (Inventário na primeira vez), sem o menu no meio. Gestos, Menu e Painel GM viraram botões no topo do diário. As abas ficaram **maiores**.
- **Mapa:** abre **ampliado na sua região**. Dá para arrastar, dar zoom com pinça, com a roda do mouse ou com os botões + e −, e ◎ volta para você. De longe, as Hunts mostram só o ⚔.
- **Mural das Runas:** pedra entalhada nova, com os 3 medalhões, setas e a **charada explicada embaixo** (a ordem e onde fica cada Pedra-Runa).
- **Leiloeira:** tocar num item abre uma janela no **meio da tela** só com ele, com preço e Comprar.

**Titã de Gelo**
- **Pedras de Gelo:** 5 pedras aparecem girando em volta dele e são lançadas em você, **uma atrás da outra**. Continue se mexendo!
- **Cristais do chão:** ele bate no chão e cristais de gelo vão saindo **em linha** até você. O Furioso, na fúria, também faz um anel de cristais em volta de você.

## v0.9.58 — Visuais liberados para os GMs
- As contas **GM** têm **todos os visuais** liberados (trajes, efeitos de arma e auras, inclusive os premium e os de conquista), sem gastar diamantes. Só para os GMs: os outros jogadores continuam desbloqueando normalmente.

## v0.9.57 — Itens antigos com a nova aparência
- Os itens que **já estavam na bolsa ou equipados** (de antes da aparência por monstro) agora também ganham o visual de um monstro **do mesmo nível do item**: cores, detalhes no ícone e na arma/escudo 3D, e o nome no estilo novo (ex.: "Capacete Goblin").
- Vale também para itens antigos que chegam por **troca, mercado ou correio**, e para os itens de **baús e missões**.
- O equipamento inicial (comum, nível 1) continua simples. Os atributos dos itens **não mudam**, só a aparência e o nome.

## v0.9.56 — Pergaminho de Teleporte na Fornecedora
- O **Pergaminho de Teleporte** agora está à venda na **Fornecedora Lia**, ao lado do Pergaminho de Retorno.
- Novo preço: **3 pergaminhos por 💎1** ou **8 por 💎2**. Também dá para comprar na Pedra de Teleporte e na Loja de Diamantes.

## v0.9.55 — Teleporte, lojas e barreira
**Pedra de Teleporte**
- Nova **Pedra de Teleporte** na Vila, no Acampamento dos Exilados (Ermos) e no Posto da Fronteira (Confins): escolha o **mundo** (1 Vale, 2 Ermos, 3 Confins) e a **região** — ex.: Mundo 3 → Deserto de Âmbar.
- As regiões liberam quando você as **descobre** andando por elas. Mostra o nível de cada uma e avisa quando é perigosa para você.
- Ir para as **zonas seguras é grátis**. As outras regiões gastam **1 Pergaminho de Teleporte**.
- **Pergaminho de Teleporte** (novo): comprado com **diamantes 💎**. Também dá para usar direto da bolsa, de qualquer lugar. É só conveniência (não dá força) e fica preso à conta (não vende nem troca).
- O saldo de diamantes agora fica **só no servidor**: ninguém consegue se dar diamantes. O dono do jogo credita pelo **Painel do dono** (busca pelo nome).

**Lojas**
- **Mercador Tomas**: vende **equipamento inicial** da sua classe (arma, capuz, gibão, calça, luvas, botas, escudo e mochila) e compra os seus itens. Saiu dele o mercado de jogadores.
- **Leiloeira Mara**: abre **direto na aba Comprar** (sem menu antes). Ela é o único lugar do mercado entre jogadores.

**Combate e personagem**
- **Muralha de Ferro** virou uma **barreira com vida própria** (35% da sua vida máxima + 3× a defesa) que absorve todo o dano até quebrar. Só dá para renovar quando ela cair para **metade ou menos**. Aparece como uma bolha dourada e uma faixa dourada na barra de vida.
- **Agilidade** agora também dá um pouquinho de **velocidade de movimento** (+0,1% por ponto, até +12%).
- **Poções** (e outros consumíveis) acumulam **300 por espaço** na bolsa.
- **Celular:** segurando o botão de **ataque**, arrastar o dedo **gira a câmera** (como um analógico). A mira continua automática — só a visão muda.

**Correções**
- O **portal da Fenda** (evento) agora aparece para **todos** os jogadores, não só para quem o abriu.

## v0.9.54 — Convites com Aceitar na tela
- **Convite de time** agora aparece no cantinho da tela (o mesmo lugar do perfil quando você toca em alguém), com **Aceitar** e **✕ Recusar** — não precisa mais abrir o menu do Time.
- **Pedido de troca** usa o mesmo aviso. O aviso pisca em verde e some sozinho depois de 60 s.

## v0.9.53 — Telas de carregamento, animações e erros automáticos
**Telas de carregamento**
- Toda viagem entre mapas (Cripta, Ermos, Confins, pergaminho de volta, entrar no jogo) mostra uma **cena do próprio jogo** com o nome do destino, uma **dica** e uma barrinha, em vez da tela preta.
- 7 cenas: Vila ao pôr do sol, Ponte de pedra, Ruínas da planície, Portão dos Golens, Cripta, Ermos e a Tundra com os yetis.

**Animações**
- Parado à toa, o personagem faz **gestos**: o guerreiro apoia a arma no ombro ou examina a lâmina, o mago gira o cajado ou acende a palma da mão (com faíscas), o arqueiro testa a corda ou vigia o horizonte; todos se alongam de vez em quando.
- **Tranco ao apanhar** mais forte, para um lado ou para o outro.
- **Morte** com duas quedas: para trás ou de cara no chão, cambaleando antes e com um quique ao bater (jogadores e monstros).

**Erros e servidor**
- O jogo agora **avisa sozinho** quando dá erro no celular ou no PC (Sentry): versão, aparelho, classe e o que estava acontecendo — sem nome, e-mail ou conta.
- O servidor também registra os próprios erros.
- Backup do banco de dados feito antes da atualização.

## v0.9.52 — A grande atualização (lista de 29 itens + extras)
**Equilíbrio e progressão**
- Ponto de atributo **−50% de novo** (1,5 por nível) e subir de nível **5% mais fácil**. Todos os pontos de atributo foram **devolvidos** para você redistribuir (aviso ao entrar).
- Itens com números fixos e sensatos: **2 de ataque** e **4 de defesa** por ponto (ataque ≈ nível do item). Item de defesa **não dá vida**. Atributos extras **só em mítico e lendário**. Só escudo **épico ou lendário** atrai monstros.
- Ordem das raridades: sem fundo (comum) → verde → azul → roxo → **vermelho (mítico)** → **branco (lendário)**.
- **Conjuntos por bioma**: cada monstro tem mais chance de soltar certas peças do conjunto (ex.: Yeti → capacete; Homem de Gelo → peitoral/calça). Nomes simples: "Capacete Slime", "Botas Lobo"…
- Ícones dos itens com o desenho do monstro **bem mais visível** (gotas no slime, presas no lobo, chamas no fogo, cristais no gelo, ossos no esqueleto…).
- Mais armas caindo.

**Chefes e loot**
- Vida dos chefes maior e proporcional ao nível. Chefes da chave (Vigia) voltam em 1 min, mas **depois da 1ª vitória não dão XP, chave, saque nem ouro**.
- Chefes só soltam itens **com fundo**: no máximo **1 por pessoa** (2 com chance bem pequena), 1 a 3 no total e no máximo 1 muito raro. Chefes de raid **nunca** soltam lendário.
- **Os mesmos itens no chão para todos** (online): o anfitrião sorteia uma vez só. Mobs de raid não soltam nada (só o chefe). Pegar item do chão não aparece no chat; só o saque direto de chefe (em **laranja**). Avisos de fenda em **roxo**.
- Chaves e itens únicos (ex.: Anel) **não podem** ser vendidos, largados, trocados ou postos na loja.

**Fendas e raids**
- O portal **não gira** mais; os monstros **saem do portal aos poucos**.

**Hunts (novo!)**
- 15 **Hunts** para farmar: muitos monstros espalhados que voltam rápido (15–60 s), mesmo com você no meio. Placa vermelha "⚔ HUNT" no chão e marcadas no mapa (⚔) com o nível. 5 no Vale, 4 nos Ermos e 6 nos Confins.

**Lojas, banco e poções**
- **Fornecedora Lia** (nova barraca na vila): poções de vida e de mana em **3 tamanhos** — Pequena cura **100–200**, Média **200–400**, Grande **400–900** (o mesmo para a mana) — em pacotes de 1/10/50/100/250, **flechas** (25 a 500) e pergaminhos de retorno à cidade. Toque no item → perfil e preço.
- **Flechas agora acabam**: cada tiro gasta 1 (o arqueiro novo começa com 300; quem já era arqueiro ganhou 300). Contador no botão de ataque.
- Usar poção escolhe sozinha o tamanho certo (a maior que não desperdiça).
- **Mercador** sem rolar a tela: abas **Equipamentos** | **Poções e materiais**, toque no item → perfil com o botão **Vender** ao lado (saíram os botões de "vender tudo").
- **Banco** com visual novo e **cofre de itens** (40 espaços, dá para aumentar até 120), sem rolar.
- Na loja, tocar no item mostra o **perfil** e o preço.
- Barracas da vila maiores e caprichadas.

**Visual**
- **Arqueiro**: arco recurvo de verdade (antes parecia um X), a corda **puxa** e a flecha aparece encaixada; flechas **retas** e bonitas (ponta de aço, penas coloridas, brilho). O mortal para trás virou **Agilidade do Vento**: 5 s com +10% de velocidade para andar e atirar.
- **Mago**: magias com vida (núcleo claro, aura e faíscas girando). O **Meteoro** agora é uma **bola de magia que despenca do céu** e explode em cima do inimigo (segue o alvo).
- **Guerreiro**: golpes viraram uma **meia-lua de lâmina** que varre o ar, na diagonal, com faíscas.
- **Trajes de verdade** nos visuais da loja/conquistas (não é mais só cor): elmo com pluma, capuz de folhas, tiara de sol, capuz com olhos brilhando, coroa de rubis, coroa de gelo, auréola de estrelas, chapéu de palha, elmo de dragão com chifres e asinhas…
- **Efeitos de arma** saem da arma **inteira** (não só da ponta) e a arma brilha na cor; **auras bem mais fortes**.
- Armaduras **não mudam mais** o visual padrão do personagem.
- Todos os monstros: sombra macia no chão, olhos brilhando, cores mais vivas; lobos com pelagem, garras e cauda cheia; goblins com dentes, sobrancelhas e pintura de guerra; esqueletos com a alma brilhando nas costelas.
- **Yeti** arranca uma **bola de neve** do chão e arremessa de vez em quando (deixa lento).
- **Ponte de pedra** do Vale 2× mais larga, em arco, com parapeito, braseiros e lampiões.
- **Portão dos Golens** no lugar da barreira do Planalto: com a Chave do Selo a **fechadura mágica explode em purpurina**, as portas afundam e os golens se curvam.
- **Entrada da Cripta** (toca dos lobos) caprichada: arco de pedra, escadaria, muralhas em ruínas, dois **lobos de pedra** de guarda, raízes, ossos e braseiros.
- **HUD do celular limpo**: barra do chefe fina numa linha só, alvo compacto (some quando é o próprio chefe), chat menor, painel e barra de XP menores.

**Correções**
- Câmera olha para cima. Mouse que não travava em alguns PCs e Caps Lock.
- Monstros fortes (mapa 3) não nascem mais em "grupinhos".
- A borda da montanha não deixa mais subir para a Planície do Guardião (só pelo Planalto).
- Modo time conferido com 2 jogadores (convite, mesmo time, XP dividido, sair).
- GM não vê mais o botão da espada do PvP.

## v0.9.51 — Itens com a cara do monstro
- Todo equipamento que cai de um monstro agora tem a **estética dele**: as cores do metal, da madeira e do couro viram as do monstro e aparece um **detalhe** típico dele — no ícone da bolsa e na arma/escudo/elmo/armadura 3D (você e os outros jogadores veem).
  - Golem de Pedra: cinza com **pedrinhas** · Brasa/Magma: vermelho com **chamas** · Yeti/Gelo e Cristal: branco-azulado com **cristais** · Esqueletos: cor de osso com **espinhos** · Gosmas: verde com **gotas** · Goblins: couro e **remendos** · Lobos e feras: **presas** · Deserto: areia com **âmbar** · Brejo: **musgo** · Bosque: **folhas** · Cérebros: rosa com **bolhas** · Fenda/Astral e Sombras: **runas** brilhando · e mais.
  - Dois monstros do mesmo tipo ainda ficam um pouco diferentes (cada um puxa a própria cor).
- A raridade (o fundo) continua aparecendo: na moldura e na gema do item.
- No detalhe do item: "Feito de Golem de Pedra · estilo Pedra".

## v0.9.50 — Itens com atributos FIXOS (estilo Rucoy)
- Acabou a sorte nos números: **o mesmo item, com o mesmo fundo (raridade), do mesmo monstro é sempre igual** — ataque, defesa e afixos.
- Cada monstro mais forte é um "patamar" acima (slime → goblin → … → os dos Confins). Ataque da arma = **2 por ponto**:
  - primeiro monstro: comum **2** · verde **4** · azul **6** · roxo **8** · amarelo **10** · rosa **12**;
  - a **amarela (lendária)** de um monstro tem o mesmo ataque da **comum do monstro seguinte** (ex.: amarela do slime = comum do goblin = 10).
- Armaduras seguem os mesmos pontos (peitoral 1 por ponto; elmo, escudo, calça, luvas e botas proporcionais). Afixos fixos para cada peça e raridade (e sem atributo principal de outra classe).
- Itens com nome (lendários especiais) seguem a mesma regra no ataque/defesa e mantêm o efeito especial.
- Os itens que você já tem foram ajustados para a regra nova automaticamente; itens trocados/comprados também.

## v0.9.49 — PvP da espada (Rucoy), vila 5× maior e Cripta no canto do mapa
- **PvP novo, pelo botão da espada ⚔** (embaixo do ouro; libera no **nível 30**). Não precisa mais clicar em ninguém:
  - 1 toque → **amarela**: você pode apanhar de quem está de espada vermelha, mas não ataca ninguém;
  - 2 toques → **vermelha**: seus golpes normais acertam jogadores (amarelos, vermelhos e com caveira) e você também apanha;
  - 3º toque apaga (só sem block).
  - Para a espada vermelha tirar dano é preciso ter **ouro na bolsa** (nível × 100). Sem o ouro, o golpe não faz nada.
  - Bateu em alguém → **caveira vermelha** ☠ na frente do nome (3 min): qualquer um de espada vermelha pode te bater, mesmo se você apagar a espada.
  - Matou → caveira **branca**; 5 abates → **roxa**; 10+ → **preta**. Os abates somem aos poucos (1 a cada 20 min).
  - **Block** (60 s, renova a cada golpe dado): não entra em área segura, não monta, não sai da conta/título — e se fechar o jogo, **o personagem continua no mundo** até o block acabar (pode ser derrotado; a morte vale quando você voltar).
  - Morrer para jogador: −10% do XP do nível; com caveira cai 1 item da bolsa (caveira preta: 2).
  - **Mural de Procurados** na vila (ao norte da praça): cartazes dos caveiras-pretas online com **nível e caveira, sem o nome**. Aceite a caçada, o procurado aparece com 🎯 para você; derrotá-lo dá ouro (nível × 150).
  - Conquistas novas: Primeiro Sangue, Caveira Preta, Caçador de Recompensas, Justiceiro.
  - O botão "Atacar" da ficha saiu; time não se ataca; GMs ficam de fora; na cidade ninguém luta.
- **Vila de Eldoria 5× maior:** cerca nova bem maior (para o norte), 16 casas novas, ruas e lampiões; a praça com as NPCs continua no mesmo lugar, perto do portão da ponte. A área segura cresceu junto.
- **Cripta do Vigia** mais longe, no canto direito do mapa; a estrada até ela foi refeita e as árvores ficaram mais afastadas do caminho.

## v0.9.48 — Mundo igual para todos, sem regeneração e perfil no canto
- **Um mundo só para todos:** o servidor agora escolhe UM anfitrião (quem simula monstros, eventos e chefes) e avisa todo mundo — antes cada aparelho podia se achar o anfitrião e aí cada um via monstros diferentes. Aba congelada/tela apagada há mais de 8 s passa a vez.
- **Um relógio só:** o dia/noite segue a hora do servidor — todo mundo vê a mesma hora.
- **Nenhum monstro regenera vida:** nem quando evade e volta para casa, nem curado por conjurador, nem o Guardião.
- **Renascimento pela força:** monstro morto demora mais para voltar quanto mais forte (slime ~45 s, goblin ~50 s, nível 50 ~2 min, nível 100+ ~3–5 min).
- **Perfil no canto (estilo Rucoy):** tocar/clicar num jogador só o seleciona; aparece no canto direito "Nome · Nv · [Perfil] [✕]". A ficha (time, amigo, mensagem, PvP, troca) abre pelo botão Perfil.
- **Convite de time não abre mais o painel sozinho** (aparece aviso e mensagem no chat; responda em Time no menu).
- Janelas sem o desfoque do fundo (a tela não fica mais embaçada atrás dos painéis; mais leve no celular).
- Os outros jogadores agora veem sua **armadura** (elmo, peitoral, escudo, calça, botas, luvas, mochila), não só a arma.

## v0.9.47 — Monstros perseguem mais antes de "evadir"
- A distância que o monstro persegue antes de desistir ficou **~1,8× maior**, e agora é medida a partir do **centro do grupo** (mais o tamanho da área do grupo), não do ponto exato onde ele nasceu. Antes, um monstro que nascia na beirada do grupo (ou patrulhava para o outro lado, como os esqueletos) evadia depois de poucos passos.
- Ex.: goblins e esqueletos agora só desistem a ~60 m do grupo (antes ~26–28 m do ponto onde nasceram).

## v0.9.46 — Ruínas de Vel'Thar maiores e com o meio livre
- Área dos esqueletos do início ficou bem maior (anel de colunas com o dobro do raio, ~4× a área) e com mais esqueletos (5 grupos).
- Os muros, colunas e escombros que ficavam no meio foram para a borda: o miolo das ruínas ficou livre para as batalhas. As entradas pelas estradas continuam abertas.

## v0.9.45 — Chefes mais raros e Acampamento Goblin 5× maior
- **Chefes raros de verdade:** depois de morto, um chefe descansa no mínimo 20 min (mais para os fortes, até 90 min) e só então começa a sorte de nascer, agora bem menor. Em média: Rei Slime ≈ 1 h, Lorde dos Ossos ≈ 1 h 15; os campeões dos Confins, várias horas. O descanso fica salvo (recarregar o jogo não faz o chefe voltar).
- **Acampamento Goblin 5× maior:** paliçada nova bem mais larga, 10 tendas, 3 fogueiras, torres de vigia no portão, mais goblins espalhados.
- **Rei Slime** agora nasce **dentro do Acampamento Goblin** (não mais no Prado) e tem **10% menos vida**.

## v0.9.44 — Menu do celular cabe na tela
- O menu do celular abria para baixo e os últimos botões (incluindo o do GM) ficavam fora da tela. Agora abre em grade ao lado do botão, no topo, e cabe inteiro.
- O botão **Painel GM** (♛) fica em primeiro no menu para os GMs.

## v0.9.43 — Painel do GM e PvP estilo Rucoy
- **Painel do GM** (botão de coroa ♛ no menu, só para GMs — lil e pedrocas): aba **Chefes** com todos os 18 chefes do jogo (toque = nasce perto de você) e aba **Raids** com todas as raids separadas por estrelas, mais botões "★ aleatória" … "★★★★★ aleatória". Os comandos `/boss` e `/raid` agora valem para os dois GMs.
- **PvP estilo Rucoy:**
  - fora das cidades/acampamentos, jogadores de **nível 10+** podem se atacar: toque no jogador → **⚔ Atacar**;
  - atacar um inocente dá **caveira branca ☠** (3 min); **matar** um inocente dá **caveira vermelha ☠** (20 min) — todos veem a caveira ao lado do nome;
  - quem tem caveira pode ser atacado sem castigo; quem te atacou pode levar o troco (quem começou a briga não ganha "defesa");
  - morrer para jogador: perde **10% do XP do nível** (não desce de nível); com caveira vermelha, ainda **cai 1 item da bolsa**;
  - na cidade ninguém se machuca; time não se ataca; GMs ficam de fora do PvP; o dano entre jogadores é reduzido (45%) para a luta durar.

## v0.9.42 — GM Lil abre raids
- **`/raid` (só o GM Lil):** abre na hora uma raid (fenda/evento) perto dele, de **qualquer número de estrelas**:
  - `/raid` lista as raids do mapa com as estrelas;
  - `/raid 1` … `/raid 5` abre uma raid com essas estrelas (deste lugar; se o mapa não tiver, usa uma de outro mapa — ex.: 5★ no Vale = Fúria do Titã);
  - `/raid nome` abre pelo nome (ex.: `/raid goblin`, `/raid colosso`, `/raid titã`).
  Fecha a raid que estiver aberta antes. Funciona quando ele é o anfitrião.

## v0.9.41 — Chefes nascendo de verdade no online
- **Por que nenhum chefe nascia online:** o sorteio rodava no aparelho do "anfitrião" (quem controla os monstros) e recomeçava do zero toda vez que o anfitrião mudava — alguém entrar, sair ou trocar de app no celular. Na prática a espera nunca terminava.
- Agora o sorteio é **preso ao relógio de verdade**: cada minuto tem um número da sorte fixo para cada chefe, igual em todos os aparelhos. Trocar de anfitrião, recarregar ou sair não zera nada; quem assume vê o chefe que nasceu nos últimos minutos. Continua sendo sorte (sem horário fixo). Teste: 6 horas simuladas com troca de anfitrião a cada 3 min — Rei Slime e Lorde dos Ossos nasceram em todas.
- **GM: `/boss nome`** no chat chama um chefe na hora, perto de você (ex.: `/boss rei slime`, `/boss lorde`, `/boss minotauro`, `/boss guardiao`). Funciona quando você é o anfitrião.

## v0.9.40 — Poção infinita dos GMs
- **GMs (lil e pedrocas): poção de vida infinita.** Não gasta e não precisa ter na bolsa (o botão mostra ∞). Continua com o tempo de recarga normal. Jogador comum gasta normalmente.

## v0.9.39 — Fendas aleatórias e poderes de GM
- **Fendas (eventos) abrem em lugares aleatórios** do mapa: a 30–110 m de quem está jogando, sempre em chão aberto, fora da cidade e nunca atrás da Barreira fechada (antes eram 3 lugares fixos no Vale). O nome do lugar aparece no aviso.
- **GMs (lil e pedrocas), só eles:** personagem vai para o **nível 1000**, ganha **+500 pontos de atributo** e as **melhores armaduras do jogo, míticas, nível 1000** (elmo, cota, grevas, manoplas, botas, escudo-torre, anel e mochila). Acontece uma vez por personagem; o equipamento antigo vai para a bolsa.
- Nível máximo do jogo: 1000.

## v0.9.38 — Sair da conta de verdade, Pedrocas GM e mapas liberados
- **Sair da conta:** os personagens da conta saem deste navegador (continuam salvos na conta) — nada mais fica aparecendo atrás da tela de entrar. Cada personagem do navegador agora fica marcado com a conta dona: outra conta que entrar no mesmo navegador não vê nem "puxa" os personagens dela (era assim que apareciam personagens repetidos em contas diferentes).
- **Pedrocas é GM** e tem o **lobo**; **lil** tem o **cavalo**. Mais ninguém tem montaria.
- O selo vem **na frente** do nome: **GM Lil**, **GM Pedrocas**.
- **Mapas 2 e 3 sem exigência de nível:** os portais dos Ermos e dos Confins deixam qualquer um passar (só avisam o nível recomendado). A Barreira do Selo não pede mais nível (continua pedindo a Chave do Selo).

## v0.9.37 — Nomes únicos e ferramentas de GM
- **Nomes de personagem únicos no jogo inteiro:** o servidor confere ANTES de criar o personagem. "Lil", "lil" e "Líl" contam como o mesmo nome; o nome da conta de outra pessoa também não pode ser usado (ninguém se passa pelo GM). Ao apagar um personagem, o nome fica livre de novo.
- Personagens antigos com nome repetido: ao entrar, quem não é o dono do nome escolhe um nome novo (não dá para pular).
- **Ferramentas de GM no chat** (só contas GM): `/conta usuario` (ou e-mail) mostra se a conta existe, o e-mail escondido e se o servidor está com banco de dados; `/senha usuario senhanova` troca a senha de quem esqueceu.

## v0.9.36 — Site sempre na versão certa, sem atualizar sozinho
- **Causa do "atualiza do nada", dos monstros misturados e de nenhum chefe:** o repositório tinha um `index.html` antigo (0.9.20) solto na raiz, e o servidor abria ele em vez do `docs/index.html` novo. O jogo velho via que o servidor era mais novo e ficava tentando atualizar; e como era o código antigo, misturava monstros dos biomas e não tinha os chefes novos.
- O servidor agora escolhe sozinho a cópia do jogo com a **mesma versão** dele (e avisa no log qual está servindo).
- Abas/aparelhos com versão antiga ficam **isolados** (não viram anfitriões, não mandam monstros nem chat para os outros) e recebem o aviso para atualizar.
- Chefes: o sorteio não zera mais quando alguém entra/sai (o 1º sorteio sai logo) e a chance subiu um pouco (Rei Slime ≈ 9 min em média, Lorde ≈ 14 min, Guardião ≈ 19 min, chefes dos Confins ≈ 40 min a 1 h 15).

## v0.9.35 — Aviso de atualização só quando precisa
- O aviso "Em atualização / manutenção" aparecia várias vezes seguidas depois de atualizar: cada reinício do servidor (Auto-Deploy + Manual Deploy, servidor velho saindo depois do novo já estar no ar) mostrava o aviso de novo, mesmo para quem já estava na versão nova, e ele ficava até 90 s na tela.
- Agora o aviso **só aparece** se existir **versão nova** (aí recarrega sozinho) ou se o servidor estiver **fora do ar** (some quando ele volta). Reinício com a mesma versão não mostra nada.

## v0.9.34 — Chefes dos biomas dentro das megaestruturas
- O chefe de cada bioma agora só nasce **dentro da megaestrutura do bioma** (continua por sorte, sem relógio): Rei Minotauro no salão do trono do Castelo Dourado, Titã de Gelo Furioso na Fortaleza do Inverno, Titã de Magma Furioso na arena da Caverna de Magma, Cérebro-Colmeia na Caverna de Cristal, Escorpião-Rainha em frente à Pirâmide, Lobisomem da Lua Cheia no Círculo dos Anciões e Rei Lagarto na Gruta do Brejo.
- Aviso quando ele aparece: "Nome apareceu: Nome da estrutura!" (até 500 m de distância).

## v0.9.33 — Megaestruturas nos Confins
Sete estruturas gigantes (180–250 m, ~20× a primeira caverna), **sem teto**, com **passagens largas** (portões de 18–30 m) e paredes que ficam **transparentes quando você está dentro** — nada tapa a visão:
- **Castelo Dourado** (Planícies): muralha com 4 portões, torres com telhado vermelho, estandartes, fortaleza central com salão do trono, colunas, fonte, braseiros e casinhas abertas.
- **Fortaleza do Inverno Eterno** (Tundra): o castelo de gelo, com cristais nas torres.
- **Caverna do Coração de Magma** (Terras de Magma) e **Grande Caverna de Cristal** (Picos): anéis de rochas de 26–44 m em volta de uma arena enorme, coluna central gigante, poças de lava/cristal, estalagmites e cristais brilhando.
- **Gruta Afundada do Brejo** (Pântano): a caverna de raízes e névoa verde.
- **Pirâmide de Âmbar** (Deserto): pirâmide de 6 degraus com rampa, avenida de obeliscos, estátuas de escorpião, espelhos d'água.
- **Círculo dos Anciões** (Floresta): dois anéis de pedras gigantes com altar de cristal no meio.
Cada uma tem chão plano, nome próprio ao entrar (+400 XP na descoberta), marcador no mapa, luzes e **guardas do bioma** lá dentro (14 monstros, com elites). Montadas só quando alguém chega perto (leves para o celular).

## v0.9.32 — Chat estilo Rucoy e drops só seus
- **Chat no canto, estilo Rucoy:** texto solto no canto de baixo (sem caixa), com contorno para ler em qualquer fundo; as linhas somem sozinhas depois de ~15 s. Agora aparece também no **celular** (antes ficava escondido), ao lado do joystick.
- Cores: **geral** em branco (nome em azul; o seu em dourado; GM dourado), **privado** em rosa (`[PV] Fulano`), **sistema** em amarelo.
- **Privado só para quem recebe** (o servidor manda só para a pessoa). Dá para mandar privado pelo próprio chat: `@Nome mensagem`.
- Celular: novo botão de **conversar** (balão, embaixo do menu) abre o campo de digitar no topo da tela, com botão Enviar.
- **Drops dos outros não aparecem mais:** o aviso "Fulano dropou: item" do chefe só aparece para quem ganhou.

## v0.9.31 — Chefes gigantes e bem diferentes dos comuns
- Chefes de bioma e de evento agora têm cerca de **2× o tamanho** do monstro comum (Titãs Furiosos 1,5×, porque já são enormes).
- Visual mais forte: cor do corpo bem diferente (ex.: Comandante de Osso com ossos negros e fogo verde), **olhos brilhando**, **emblema brilhante no peito**, **espinhos nas costas**, **arma maior**, brilho leve no corpo, ombreiras maiores — além da coroa/chifres/auréola, capa, aura e orbes da 0.9.30.
- Correção: a faixa dourada da coroa do Rei Slime e do Lorde dos Ossos não aparecia.

## v0.9.30 — Chefes com visual próprio, montaria só do Lil e selo GM
- **Chefes de bioma e de evento com cara de chefe:** cada um ganhou coroa real, chifres, coroa de cristais ou auréola; capa; ombreiras com espinhos; aura brilhante girando no chão; orbes flutuando; e cores próprias. Ficaram 15% maiores. (Rei Minotauro, Rei Lagarto, Escorpião-Rainha, Lobisomem da Lua Cheia, Titãs Furiosos, Cérebro-Colmeia, Gosma-Mãe, Comandante de Osso, Colosso Desperto, Lobo da Ruptura, Chefe Goblin, Cavaleiro dos Mortos.)
- **Montaria:** acabou o lobo para todos. Só a conta **lil** tem montaria (o cavalo). Quem tinha o lobo perde o item e desmonta ao entrar.
- **Selo GM:** a conta **lil** aparece como **Lil GM** (GM dourado) no topo da tela, em cima do personagem, no chat, no cartão do jogador e na lista de amigos. Quem decide é o servidor (pela conta), ninguém consegue fingir. Lista de GMs: variável `GMS` no Render (padrão `lil`).

## v0.9.29 — Tela de dano à prova de erro
- O brilho vermelho agora fica numa camada maior que a tela (passa um pouco de todas as bordas), fora de qualquer caixa do jogo. Mesmo que o navegador do celular meça a tela errado (barra do Android, tela cheia, recorte da câmera), não sobra faixa sem vermelho nem retângulo deslocado.

## v0.9.28 — Correção da tela de dano
- O brilho vermelho de dano media a tela só na primeira pancada; depois de girar o celular, entrar em tela cheia ou a barra do navegador sumir, ele ficava deslocado e menor que a tela. Agora cobre sempre a tela inteira e se ajusta a cada giro/redimensionamento.

## v0.9.27 — Tela limpa
- Nova opção em **Configurações → Interface → Tela limpa**: some com os nomes (monstros, NPCs, jogadores), os avisos comuns (moedas, missões, regiões, itens), os textos como "Fugindo!"/"Esquivou" e o quadro do alvo. Ficam só os **avisos de chefe** e a **vida dos chefes no topo**. Os números de dano seguem a opção "Números de dano".
- A barra de vida no topo agora também aparece para os chefes menores (Rei Slime, Lorde dos Ossos, Vigia e campeões) enquanto você luta perto deles.

## v0.9.26 — Chefes por sorte e correção do nado
- **Chefes não ficam lá o tempo todo:** começam ausentes e, a cada minuto, cada chefe que não está no mapa tem uma **chance aleatória** de nascer (sem relógio). Quanto mais forte, menor a chance: Rei Slime ≈7,6% (≈13 min em média), Lorde dos Ossos ≈4,7% (≈21 min), Guardião da Fenda ≈3,6% (≈28 min), mini-chefes dos Confins de ≈1,6% até 1% (≈1 h a 1 h 40). Avisa quando um aparece perto de você.
- O Guardião da Fenda fica no Trono até a **primeira vitória** (é a missão principal); depois disso também só volta por sorte. O Vigia da Cripta continua como antes (faz parte da história).
- **Correção:** ao sair da água o personagem ficava travado numa pose, sem animação de andar nem de atacar. Agora a pose de nado solta de vez (também para os outros jogadores).

## v0.9.25 — Nível fixo por monstro (estilo Rucoy)
- Cada monstro tem **sempre o mesmo nível**, em qualquer lugar (tabela em `src/config/moblevels.js`). Os níveis se afastam cada vez mais: monstro novo entra no topo da lista.
- **Vale:** Slime 1 · Goblin 5 · Goblin Atirador 6 · Lobo 8 · Lobo Alfa 10 · Esqueleto 12 · Gosma da Fenda 14 · Lobo da Fenda 16 · Guardião 18. Chefes: Rei Slime 1, Lorde dos Ossos 14 (continua com 18.000 de vida), Vigia 17, Guardião da Fenda 25.
- **Ermos da Fenda:** 25 a 60 (portal no nível 22). **Confins:** 65 a 165 (portal no nível 62); cada bioma tem sua faixa e o mini-chefe fica 3 níveis acima do mais forte.
- Nível máximo do jogador: 100 → 500. O Bestiário mostra o nível de cada monstro.
- Eventos de onda continuam acompanhando o nível de quem está jogando.

## v0.9.24 — Cérebros mais perigosos
- **Rajada de 3 investidas:** Cérebro Pútrido e Cérebro Abissal avançam 3 vezes seguidas (tudo em 0,8 s), mirando de novo em você a cada uma. A última deixa lento.
- Cérebros **maiores** (1,25× e 1,6×) e **mais fortes** (vida 230/290, dano 27/33). O Cérebro-Colmeia também faz a rajada.

## v0.9.23 — Natação e chefes novos
- **Natação (estilo Minecraft):** na água rasa você anda. Quando a água passa da metade do corpo, você **nada**:
  - deita na água e dá braçadas (parado, fica boiando de pé);
  - vai mais devagar, com respingos;
  - dá para atravessar lagos e rios e sair pela margem;
  - a montaria desmonta na água funda;
  - os monstros não entram na água funda;
  - os outros jogadores veem você nadando.
- **Rei Slime (novo, primeiro chefe):** fica no Prado das Gosmas, com **10.000 de vida** e dano baixo. É passivo: só luta se for atacado.
  - **Super salto:** agacha, sobe bem alto e cai no círculo marcado.
  - **Chuva de gosma:** bolas caem nos círculos verdes e deixam lento.
  - Em 66% e 33% de vida **se divide** em slimes e fica mais rápido.
  - Volta 10 min depois de derrotado.
- **Lorde dos Ossos (novo):** fica nas Ruínas de Vel'Thar, no nível 8, com **18.000 de vida**. Tem coroa, capa vermelha e espadona.
  - Combo de 3 golpes.
  - **Espada giratória:** arremessa a espada, que vai e volta e acerta nas duas vezes.
  - **Mãos do Túmulo:** ossos brotam embaixo de você e prendem.
  - **Investida de escudo:** corre em linha reta e derruba. Se bater numa parede, fica atordoado.
  - Em 66% e 33% de vida levanta esqueletos.
- **Guardião da Fenda:** **30.000 de vida** (eram 13.680) e cerca de 20% a mais de dano.

## v0.9.22 — Cada região com seus monstros
- **Confins:** cada região só tem os monstros dela. Antes, qualquer monstro de nível parecido podia aparecer em qualquer lugar (yeti no magma, cérebro no gelo).
- Monstros por região:
  - **Planícies:** minotauro, goblin, touro rochoso, gosma de mel, javali dourado. Elites: golem de pedra e Javali-Rei.
  - **Pântano:** homem-lagarto, cérebro podre, gosma do pântano, goblin do lodo, lobo do brejo. Elite: golem de musgo.
  - **Deserto:** **escorpião de âmbar** (o mais comum), chacal faminto, feiticeiro das dunas, gosma de âmbar. Elite: colosso de areia.
  - **Floresta:** lobisomem, caçador goblin, lobo esmeralda, cervo espinhoso, gosma esmeralda. Elite: ente ancião.
  - **Tundra:** yeti, lobo branco, urso polar, gosma de gelo, sentinela congelada. Elites: titã e colosso de gelo.
  - **Magma:** cérbero, piromante, salamandra, cão de brasa, gosma de magma, cavaleiro de cinzas. Elites: titã e colosso de magma.
  - **Picos:** cavaleiro da fenda, cérebro abissal, oráculo, lobo e gosma astrais. Elites: titã e colosso astrais.
- **Mini-chefe de cada região:** aparece raramente e volta 10 min depois de derrotado. São eles: Rei Minotauro, **Rei Lagarto do Pântano** (novo), **Escorpião-Rainha de Âmbar**, Lobisomem da Lua Cheia, Titã de Gelo Furioso, Titã de Magma Furioso e Cérebro-Colmeia.
- O nível dos monstros segue a distância da entrada, dentro da faixa de cada região.
- **Titã de Magma (nível 40), ataques novos:**
  - **Giro da espadona** por 3 s, com fogo em volta, andando atrás de você. No fim ele fica exausto (BRECHA).
  - **Bola de fogo**, que explode onde cai e queima.
  - **Espinhos pretos** saindo do chão embaixo dos jogadores (marcados antes), que prendem por um instante.
  - **Fúria:** com menos de 35% de vida, fica mais rápido.
- **Yeti, ataques novos:**
  - **Arranca uma bola de gelo gigante do chão** (ela cresce acima da cabeça) e arremessa. Deixa lento e estilhaça em volta.
  - **Salto carregado:** agacha, salta para a frente e cai esmagando, deixando lento.

## v0.9.21 — Mercado funcionando no site
- **Mercado dos Viajantes no site próprio:** os anúncios ficam no seu servidor (Render + Neon). Antes ele tentava usar o banco do Claude e mostrava "Não foi possível anunciar agora".
- O servidor decide quem compra, uma compra por vez: o mesmo item nunca é vendido duas vezes.
- O vendedor recebe o ouro, menos a taxa de 5%, quando abre o mercado.
- **Vendas liberam no nível 10.** Antes disso dá para comprar, e o botão de vender avisa "libera no nível 10".

## v0.9.20 — Lobo de montaria para todos
- **Por enquanto, todo jogador ganha o Lobo de Montaria** (20× mais rápido). Ele aparece na bolsa uns segundos depois de entrar no jogo.
- Monte com **H**, pelo botão da barra (PC) ou pelo botão da tela (celular).
- A conta **lil** continua com o cavalo.
- Para voltar a ser só de algumas contas, troque `mountForAll` para `null` em `src/config/balance.js`.

## v0.9.19 — Sem clones e botão da montaria
- **Fim do "clone" parado:** quando você sai e entra de novo, o servidor derruba na hora a conexão antiga do mesmo personagem. Os outros jogadores veem só um de você.
- Jogador que fica sem sinal por mais de 12 s some da tela (conexão morta) e volta assim que o sinal volta.
- Se o mesmo personagem for aberto em outra aba ou aparelho, a aba antiga avisa e fica offline, em vez de as duas ficarem se derrubando.
- **Botão da montaria no PC:** aparece na barra de habilidades (tecla H), com o ícone do cavalo ou do lobo, e fica dourado quando você está montado. No celular o botão já existia.

## v0.9.18 — Largar no chão e montarias da equipe
- **"Descartar" virou "Largar no chão":** o item não some mais. Ele cai na sua frente e fica no chão por 5 minutos. Para pegar de volta, afaste-se e volte. Quem estiver online também vê o item e pode pegar; só uma pessoa leva, sem duplicar.
- **Montarias por conta (20× mais rápido):**
  - **lil:** Cavalo do Criador.
  - **Pedrocas:** **Lobo do Braço Direito**, um lobo cinza gigante com sela, juba e olhos azuis.
  - A montaria aparece na bolsa ao entrar no jogo. Aperte **H** ou o botão da montaria para montar.
  - Os outros jogadores veem o lobo.
  - Para mudar quem ganha qual montaria, use a variável `MONTARIAS` no Render (ex.: `lil:cavalo,pedrocas:lobo`).

## v0.9.17 — O Vigia de verdade
- **Vigia Corrompido virou um chefe próprio**, não mais o golem: um carcereiro espectral com capuz, rosto de caveira, coroa de ferro, correntes, **lanterna de almas** e **alabarda**.
- **Golpes:** combo de 3 golpes com a alabarda e, a cada 3 ataques, uma **varrida em círculo** (marcada no chão).
- **Correntes:** marca uma linha no chão. Quem ficar nela é preso e **puxado** para perto do Vigia. Desvie para o lado.
- **Olhar da Lanterna:** aviso de 2,6 s ("Esconda-se atrás de uma coluna!"). Acerta forte quem ele **enxerga**; atrás de uma coluna você fica protegido.
- **Almas acorrentadas:** em 66% e 33% de vida ele prende almas pela sala. Enquanto elas existem, o Vigia quase não sofre dano. Destrua todas e ele fica **atordoado por 3,5 s** (BRECHA).
- Os avisos do chefe aparecem para todos os jogadores da sala.
- **Servidor:** o jogo da raiz do repositório vem antes de uma pasta `docs` esquecida, então a versão nova sempre aparece.

## v0.9.16 — Fortaleza, chefes, amigos e atualização automática
- **Mochila:** só tem **capacidade** (os espaços extras aparecem no ícone e no item). A capacidade é sorteada e cresce com o nível do item. A cor não decide: uma verde pode ter mais espaço que uma azul. Cada melhoria dá +1 espaço. Mochilas antigas continuam com o mesmo espaço.
- **Escudo:** só **defesa**. Os épicos e lendários ganham **chance de atrair monstros** (8–22%, nunca mais que 25%).
- **Armas:** não mostram mais velocidade de ataque. O dano foi ajustado para dar o mesmo resultado.
- **Mais difícil:** todos os monstros têm +30% de vida e +20% de dano. O slime leva uns 5 golpes e bate bem mais forte (2–3 juntos derrubam quem bobear). Chefes ganham +80% de vida e só +8% de ataque.
- **Saque de chefe:** 1 item sempre; 40% de chance de 2; 15% de chance de 3. Com 2 itens e 2 pessoas, sai 1 para cada. O item vai **direto para a bolsa**, e todos veem no chat "Fulano dropou: …". O item tem o **nível do chefe**: chefe fraco dá item fraco.
- **Cripta do Vigia virou uma fortaleza** cerca de 6× maior: portão, pátio, quartel, arsenal, grande salão, catacumbas e trono. Tem muralhas com ameias, arcos, colunas, tapetes, estandartes e móveis. Também ficou mais clara.
- **Ficha do jogador:** clique ou toque em alguém para ver nick, classe, nível, time, loja e conquistas. Dali dá para convidar para o time, adicionar como amigo, mandar mensagem ou trocar.
- **Time:** só se forma quando o convidado **aceita**.
- **Amigos:** botão novo no menu. Mostra quem está online ou offline, avisa quando um amigo entra ou sai, e tocar no nome abre a **mensagem privada**.
- **Chat:** palavras +18 **bloqueiam o chat por 30 minutos**, no jogo e no servidor.
- **Atualização automática:** quando o servidor é atualizado, aparece "Em atualização / manutenção", a página recarrega sozinha e você volta para o mesmo personagem.

## v0.9.15 — Entrar com e-mail
- **Criar conta** pede **apelido, e-mail e senha**, e a senha é digitada duas vezes.
- **Cada e-mail só pode ter uma conta**, e cada apelido é único.
- **Entrar:** use o **e-mail ou o apelido**, mais a senha.
- **Contas antigas** (só apelido) recebem um aviso para cadastrar o e-mail, com a senha atual. O aviso pode ser adiado para outra vez.
- `/api/status` mostra a versão 0.9.15.

## v0.9.14 — Servidor num arquivo só
- O servidor agora é **um único arquivo** (`server/server.js`): o antigo `store.js` foi juntado nele. Assim não tem como uma parte ficar velha e a outra nova.
- `/api/status` mostra a **versão** do servidor (ex.: `"versao":"0.9.14"`), para conferir na hora se a atualização entrou.

## v0.9.13 — Login com Google + senha
- Com `GOOGLE_CLIENT_ID` configurado no servidor, a conta passa a ser **ligada ao e-mail do Google** e protegida por uma **senha** (mínimo 6 caracteres).
- **Primeira vez:** "Continuar com o Google", escolher um **apelido** e a senha.
- **Depois:** Google e a senha, em qualquer aparelho.
- **Cada e-mail só pode ter uma conta**, e **cada apelido é único**; maiúsculas e minúsculas contam como o mesmo apelido.
- Contas antigas (apelido e senha) podem ser **ligadas** ao Google uma vez.
- O servidor confere o login direto com o Google, sem bibliotecas extras. Sem `GOOGLE_CLIENT_ID`, continua o login antigo por apelido e senha.

## v0.9.12 — Mochilas com espaço e escudo para todas as classes
- **Mochila aumenta a bolsa**, e quanto melhor, mais espaço:
  - Comum +4, incomum +6, rara +9, épica +13, lendária +18.
  - A Mochila de Viajante dá +2 extra, e cada 2 melhorias na forja dão +1.
  - A bolsa base continua com 30 espaços.
- Trocar ou tirar a mochila confere se tudo cabe. Se não couber, o jogo avisa quantos espaços liberar.
- Com mais espaço, a grade da bolsa ganha colunas e continua cabendo sem rolar.
- **Escudo para todas as classes** (novo espaço de equipamento):
  - Todo personagem começa com o Escudo de Madeira; personagens antigos também ganham o seu.
  - Escudos melhores caem como os outros itens: Broquel, Escudo de Ferro, Escudo Rúnico e Escudo-Torre.
  - Guerreiro e mago levam o escudo na mão; o arqueiro leva nas costas.
- Ouro aparece ao lado de "Bolsa", e o boneco de equipamentos ganhou o espaço do escudo.

## v0.9.11 — Drops iguais para todas as classes
- **A classe não influencia mais o que cai:**
  - As armas que caem são sorteadas entre todas as classes, com a mesma chance.
  - Nos chefes, o 1º item deixou de ser garantido da sua classe.
  - O lendário extra dos chefes é sorteado entre os lendários de todas as classes.
- Arma de outra classe continua útil para **vender, trocar ou pôr na Loja dos Jogadores**.
- As recompensas fixas de missão continuam sendo da sua classe, porque são prêmios e não drops.

## v0.9.10 — Equipar mais fácil
- **Botão de equipar mostra o motivo** quando o item não serve: "Precisa nível 3" ou "Só para Arqueiro". Antes parecia que o item simplesmente não equipava.
- **Tocar duas vezes** num item da bolsa equipa direto.
- Armas de outra classe caem menos: 85% das armas que caem são da sua classe (antes 70%).

## v0.9.9 — Conta e personagens salvos no servidor
- **Login no servidor próprio (Render):** ao abrir o jogo fora do Claude aparece a tela "Entre na sua conta", com usuário e senha.
  - As senhas são guardadas com hash (scrypt).
  - Há limite de tentativas de login.
- **Personagens salvos no servidor:** dá pra limpar o navegador ou trocar de aparelho sem perder nada.
  - Personagens antigos que estavam só no navegador sobem para a conta no primeiro login.
  - Salva no servidor a cada ~15 s e em cada momento importante (nível, missão, saque).
- **Jogar sem conta** continua possível, mas salva só no navegador.
- **Botão "Sair da conta"** na tela de título.
- **Banco de dados:** com a variável `DATABASE_URL` (Postgres, ex.: Neon grátis) os saves ficam guardados para sempre.
  - Sem ela, o servidor usa um arquivo temporário, que o Render grátis apaga ao reiniciar.
  - Build Command no Render: `npm install --omit=dev` (instala só o `pg`).

## v0.9.8 — Monstros mais espertos e efeitos de morte/drop
- **Cerco:** em bando, cada monstro corpo a corpo vem por um lado diferente do herói. Enquanto espera o próximo golpe, anda de lado.
- **Atiradores, arqueiros e magos:** andam de lado entre um tiro e outro, então ficam mais difíceis de acertar. Continuam fugindo quando você chega perto.
- **Fuga:** goblins, lobos e gosmas fogem com pouca vida (15%) e voltam chamando ajuda.
- **Conjuradores curam:** a cada ~9 s curam 20% da vida do aliado mais ferido por perto, com efeito verde.
- **Morte com efeito:**
  - Partículas na cor do monstro e um anel no chão.
  - Uma "alma" sobe e o corpo vira fumaça ao sumir.
  - Elites e chefes fazem onda de choque e tremem a tela.
- **Drops:** soltam poeira ao cair no chão. Itens raros ou melhores fazem um anel na cor da raridade.

## v0.9.7 — Correr
- **Correr:** 60% mais rápido.
  - No PC, segure **Shift**; a tecla pode ser trocada nas configurações.
  - No celular há um botão **»**, separado do analógico, que liga e desliga a corrida. Ele fica verde quando está ligado.
- Atacar ou usar habilidade interrompe a corrida durante o golpe.
- Os outros jogadores veem a passada mais rápida.

## v0.9.6 — Online mais rápido e chefes com fases
- **Menos atraso no online (servidor próprio):**
  - Os monstros são enviados 15 vezes por segundo (antes eram 10) e o dano dos clientes chega a cada 33 ms.
  - A lista de jogadores sai a cada 33 ms.
- **Previsão de movimento:** os outros jogadores e os monstros andam um pouco à frente na direção em que estão indo, então não ficam "atrasados" na tela.
- **Ping (ms)** aparece ao lado de "X no vale" quando joga pelo servidor próprio.
- **Chefes com fases** (campeões de evento, chefes de Fenda e mini-chefes):
  - Em 66% e 33% de vida entram em fúria: ficam mais rápidos, soltam onda de choque e chamam 2–3 ajudantes.
  - Durante a luta marcam o chão embaixo dos jogadores e explodem; na fase final marcam 3 pontos.
  - Tudo aparece igual para todos os jogadores.

## v0.9.5 — Os outros jogadores veem seus golpes
- Cada golpe, habilidade, esquiva e investida é avisado na hora aos outros jogadores. Seu personagem faz a animação certa na tela deles: duração, combo e variação de cada golpe.
- **Efeitos das habilidades aparecem para todos:** cortes, círculos, rachaduras, explosões, chuva de flechas e escudos.
- Flechas e magias que você lança também aparecem para os outros, só como efeito visual (o dano continua sendo de quem atacou).

## v0.9.4 — Mouse preso na câmera (PC)
- Clique no jogo para **prender o mouse**: mexer o mouse gira a visão e o clique ataca para onde você olha, com ajuda para acertar o inimigo nessa direção.
- **Caps Lock** solta o mouse (e prende de novo).
- O mouse se solta sozinho quando abre inventário, diálogo ou menu.
- **Servidor próprio de multiplayer** (`server/server.js`, sem dependências): serve o jogo e uma sala em tempo real por WebSocket.
  - Quem abre o mesmo endereço (ex.: Render) entra no mesmo mundo e vê os outros, com chat, monstros compartilhados, grupo e troca.
  - Fora do Claude, a posição é enviada a cada 50 ms.
  - Comando: `npm start` (ou `node server/server.js`).
  - Limite: os jogadores do link do Claude e os do servidor próprio ficam em salas separadas, porque o Claude não deixa a página falar com outros servidores.

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
