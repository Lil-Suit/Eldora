# ELDORIA — versão nativa (Godot 4.5)

Esta pasta é o jogo ELDORIA feito na **Godot 4.5** (sem navegador), para **Android (Play Store)** e **PC (Steam)**.
Ele entra no **mesmo servidor** do jogo web (`server/server.js`): mesmas contas/saves e o mesmo mundo — jogadores da
Godot e do navegador se veem e lutam contra os mesmos monstros. O jogo web continua igual e no ar.

## Abrir e jogar no PC
1. Baixe a Godot 4.5 (versão padrão, não a .NET) em godotengine.org.
2. Na Godot: **Importar** → escolha `godot/project.godot` → **Importar e editar** (a 1ª vez demora: ela importa os modelos).
3. Aperte **F5** (ou o botão ▶). Escolha nome, classe e o endereço do servidor e toque em **Entrar**.
   - Já vem com o servidor publicado (`https://eldoria-online-gztl.onrender.com`; troque pelo da Oracle quando ele estiver no ar). Servidor local: `http://127.0.0.1:10000`.
   - Os monstros vêm do "anfitrião": no servidor de hoje (Render) ele é um jogador do navegador; então, para ver monstros no teste, deixe o jogo aberto também no navegador (ou use o servidor da Oracle com o mundo no servidor).

Controles no PC: **WASD** anda, **Shift** corre, **clique esquerdo** ataca, **botão direito arrastando** (ou setas ←/→) gira a câmera,
**roda do mouse** aproxima. No celular: joystick à esquerda, botões à direita (mesmo lugar do jogo web).

## Gerar o APK (Android)
1. Na Godot: **Editor → Gerenciar Modelos de Exportação → Baixar e instalar** (templates da 4.5).
2. Instale o **Android SDK** (Android Studio) e o **JDK 17**; em **Editor → Configurações do Editor → Exportar → Android**
   informe as pastas do SDK e do JDK e a *keystore* de depuração (ou a sua de publicação).
3. **Projeto → Exportar…** → preset **Android** (já configurado: pacote `com.eldoria.jogo`, paisagem, ícone) → **Exportar Projeto**
   (`.apk` para testar, `.aab` para a Play Store).
- PC: preset **Windows** (ou Linux) → **Exportar Projeto** (para a Steam, use o .exe com o .pck).

## Manter IGUAL ao jogo web
Números, mapa e modelos vêm do próprio jogo web, por uma ferramenta (rode na pasta do repositório):
```
node tools/build.mjs            # monta o jogo web (dist/)
node tools/godot-export.mjs     # atualiza godot/dados e godot/assets a partir do jogo web
```
Depois abra a Godot (ela reimporta) e rode o teste do terreno: `godot --headless --path godot -- --teste=terreno`
(confere o chão da Godot com o do jogo web e regrava `dados/terreno_vale.bin`).

## Testes sem tela
- `godot --headless --path godot -- --teste=terreno` — chão igual ao do jogo web.
- `godot --headless --path godot -- --teste=regras` — XP, vida/armadura de monstros e dano iguais ao web.
- `node tools/godot-rede.mjs` — servidor local + mundo no servidor + jogador web + jogador Godot (sem tela):
  o Godot vê os slimes, mata um, ganha XP, e o jogador web vê o jogador Godot.

## Como está organizado
- `scripts/rede/` — conexão com o servidor (mesmo protocolo de `src/game/wsroom.js` e `src/game/net.js`).
  O app Godot é sempre **cliente**: manda `nh: 1` na presença e o servidor nunca o escolhe como anfitrião.
- `scripts/mundo/` — terreno (porte de `terrain.js`), céu/luz (`sky.js`), colisão, materiais iguais aos do three.js.
- `scripts/heroi/`, `scripts/jogo/`, `scripts/inimigos/`, `scripts/ui/` — herói, câmera, controles, monstros, HUD.
- `dados/jogo.json` — números do jogo web (gerado). `assets/` — modelos (gerados/copiados do jogo web).
