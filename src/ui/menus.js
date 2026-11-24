import { VERSION } from '../version.js';
import { ICONS, CLASS_ICONS, SKILL_ICONS } from './icons.js';
import { esc } from './ui.js';
import { CLASSES, CLASS_LIST, SKILL_UNLOCKS } from '../config/classes.js';
import { SaveManager, MAX_CHARS } from '../game/save.js';
import { DEFAULT_BINDS, BIND_LABELS, keyLabel } from '../game/input.js';
import { QUALITY } from '../game/game.js';
import { COSMETIC_SETS } from '../game/cosmetics.js';
import { SERVERS, getServer, setServer, serverName, fetchServers } from '../game/servers.js';

// escolha do servidor (mundo) na tela inicial, com quantos estão jogando em cada um
// instalar como app: abre em tela cheia, sem a barra do navegador (Android/PC: pedido do Chrome; iPhone: instrução)
function installBtn() {
  try {
    if (window.parent !== window) return '';
    if (/[?&]app=1/.test(location.search) || String(document.referrer).startsWith('android-app://')) return ''; // já é o app (Play Store) // dentro do Claude: não se aplica
    // já está instalado (aberto pelo ícone). Tela cheia do próprio jogo no navegador NÃO conta como instalado.
    if (navigator.standalone || matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement)) return '';
    return `<button class="btn" data-a="m:install">📲 Instalar o jogo</button>`; // sempre à vista (sem o pedido do Chrome, mostra como fazer)
  } catch { /* ok */ }
  return '';
}

function serverRow() {
  const cur = getServer();
  fetchServers().then((list) => { for (const s of list || []) { const el = document.querySelector(`[data-svc="${s.id}"]`); if (el) el.textContent = `${s.online} online`; } });
  return `<div class="tsv"><span class="tsv-h">Servidor</span>${SERVERS.map((s) => `<button class="svb${s.id === cur ? ' on' : ''}" data-a="m:server" data-sv="${s.id}"><b>${esc(s.name)}</b><small data-svc="${s.id}"></small></button>`).join('')}</div>`;
}

const NAMES = ['Aeryn', 'Kael', 'Lysa', 'Doran', 'Mira', 'Thalos', 'Sera', 'Bryn', 'Iria', 'Vorn', 'Elan', 'Nyra', 'Caio', 'Luma', 'Tiago', 'Yara'];
const CLASS_BARS = {
  guerreiro: { Vida: 5, Dano: 3, Alcance: 1, Mobilidade: 3, Controle: 2 },
  arqueiro: { Vida: 3, Dano: 4, Alcance: 5, Mobilidade: 5, Controle: 2 },
  mago: { Vida: 2, Dano: 5, Alcance: 4, Mobilidade: 3, Controle: 5 },
};

export function renderTitle(ui) {
  const G = ui.G;
  const chars = G.saver.characters();
  const last = G.pendingSave ? { id: '__pending', name: G.pendingSave.player.name, cls: G.pendingSave.player.classId, level: G.pendingSave.player.level, src: G.pendingSaveSrc } : chars[0];
  const full = chars.length >= MAX_CHARS, loading = G.saver.cloudLoading && !chars.length;
  // Com personagens salvos, a lista aparece em destaque na tela inicial (toque para jogar)
  let pick = '';
  if (G.pendingSave) pick = `<button class="btn big primary" data-a="m:continue" data-id="__pending"><span>Continuar</span><small>${esc(last.name)} · ${CLASSES[last.cls].name} · Nível ${last.level}</small></button>`;
  else if (chars.length) {
    // quantos cabem sem rolar (celular deitado mostra menos; o resto fica em "ver todos")
    const H = typeof innerHeight === 'number' ? innerHeight : 800, show = H < 420 ? 2 : H < 720 ? 3 : 4;
    const rows = chars.slice(0, show).map((c, i) => c.wait
      // servidor não respondeu: o personagem continua aqui, esperando (toque = tentar de novo)
      ? `<button class="tchar wait" data-a="m:retrysrv" style="--cc:${CLASSES[c.cls].resource.color}">
      <span class="ci">${CLASS_ICONS[c.cls]}</span><span class="cn"><b>${esc(c.name)}</b><small>${CLASSES[c.cls].name} · Nível ${c.level} · aguardando servidor</small></span><span class="go">⟳</span></button>`
      : `<button class="tchar${i === 0 ? ' last' : ''}" data-a="m:loadchar" data-id="${esc(c.id)}" style="--cc:${CLASSES[c.cls].resource.color}">
      <span class="ci">${CLASS_ICONS[c.cls]}</span><span class="cn"><b>${esc(c.name)}</b><small>${CLASSES[c.cls].name} · Nível ${c.level}</small></span><span class="go">${i === 0 ? 'Continuar' : 'Jogar'}</span></button>`).join('');
    const waitH = chars.some((c) => c.wait) ? ` · <a data-a="m:retrysrv">⟳ Tentar de novo</a>` : '';
    pick = `<div class="tpick"><div class="tpick-h">${waitH ? 'O servidor não respondeu' : 'Seus personagens'}${chars.length > show ? ` · <a data-a="m:chars">ver todos (${chars.length})</a>` : ''}${waitH}</div>${rows}</div>`;
  } else if (loading) pick = `<div class="tpick"><div class="tpick-h">${/^acordando/.test(G.saver.cloudState) ? 'Acordando o servidor do jogo… (até 1 min e meio)' : 'Procurando seus personagens…'}</div></div>`;
  const newBtn = chars.length || G.pendingSave
    ? `<button class="btn" data-a="m:new" ${full || loading ? 'disabled' : ''}>+ Novo personagem</button>`
    : `<button class="btn big primary" data-a="m:new" ${full || loading ? 'disabled' : ''}><span>Novo personagem</span><small>${loading ? 'Aguarde: verificando saves da sua conta' : 'Guerreiro, Arqueiro ou Mago · cada um tem seu próprio save'}</small></button>`;
  return `<button class="trank" data-a="m:site" title="Ranking, busca de jogadores e mortes no PvP">🏆 <span>Ranking</span></button>
  <div class="titlewrap">
    <div class="logo"><span class="lt">ELDORIA</span><i class="crack"></i></div>
    <div class="tsub">O MUNDO SEM LIMITES</div>
    <div class="tbtns">
      ${serverRow()}
      ${pick}
      ${chars.length || G.pendingSave ? '' : newBtn}
      <div class="tsmall">${chars.length || G.pendingSave ? newBtn : ''}
      ${chars.length > 1 && chars.length <= 4 ? `<button class="btn" data-a="m:chars">Gerenciar</button>` : ''}
      ${installBtn()}
      <button class="btn" data-a="m:settings">${ICONS.engrenagem} Configurações</button>
      <button class="btn" data-a="m:importview">${ICONS.chave} Importar código</button>
      ${G.saver.serverUser ? `<button class="btn" data-a="m:logout">Sair da conta (${esc(G.saver.serverUser)})</button>` : ''}</div>
    </div>
    <div class="tfoot"><span data-cloud>${esc(cloudLine(G))}</span><span>RPG de ação em 3D · v${VERSION}</span></div>
  </div>`;
}

export function renderChars(ui) {
  const G = ui.G;
  const chars = G.saver.characters();
  const rows = chars.map((c) => {
    const del = ui.confirmDel === c.id;
    return `<div class="charrow" style="--cc:${CLASSES[c.cls].resource.color}"><span class="ci">${CLASS_ICONS[c.cls]}</span>
      <div class="cn"><b>${esc(c.name)}</b><small>${CLASSES[c.cls].name} · Nível ${c.level} · ${c.src === 'nuvem' ? 'nuvem' : 'este navegador'}</small></div>
      <button class="btn sm primary" data-a="m:loadchar" data-id="${esc(c.id)}">Jogar</button>
      <button class="btn sm ${del ? 'danger' : ''}" data-a="m:delchar" data-id="${esc(c.id)}">${del ? 'Confirmar' : 'Apagar'}</button></div>`;
  }).join('') || '<p class="muted">Nenhum personagem salvo.</p>';
  return `<div class="card chars"><h2>Personagens <small>${chars.length}/${MAX_CHARS}</small></h2><div class="charlist">${rows}</div>
    <div class="row"><button class="btn" data-a="m:close">Voltar</button></div></div>`;
}

function cloudLine(G) {
  const s = G.saver.cloudState;
  if (G.saver.serverUser) return `Conta ${G.saver.serverUser}: personagens salvos no servidor`;
  if (s === 'conectado' || s === 'sincronizado') return 'Salvamento na nuvem ativo para sua conta';
  return 'Progresso salvo neste navegador · use o código de salvamento para levar a outro aparelho';
}

// primeiro passo de um personagem novo (e uma vez para os antigos): homem ou mulher
export function genderCards(act) {
  const card = (g, n) => `<button class="gcard" data-a="m:${act}" data-g="${g}"><span class="gimg"><img src="chars/retrato_${g}.jpg?v=${VERSION}" alt="" onerror="this.remove()"></span><b>${n}</b></button>`;
  return `<div class="gcards">${card('F', 'Mulher')}${card('M', 'Homem')}</div>`;
}
export function renderGender(ui) {
  return `<div class="selwrap gsel"><h1>Qual será seu personagem?</h1>${genderCards('gender')}
    <p class="muted gnote">Outras roupas ficam na Loja de Diamantes (aba Aparência).</p>
    <div class="row"><button class="btn" data-a="m:back">Voltar</button></div></div>`;
}

export function renderSelect(ui) {
  const sel = ui.pickClass || 'guerreiro';
  const cards = CLASS_LIST.map((id) => {
    const c = CLASSES[id];
    const bars = Object.entries(CLASS_BARS[id]).map(([k, v]) => `<div class="cbar"><span>${k}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`).join('');
    const sk = c.skills.map((s, i) => `<li title="${esc(s.desc)}"><span>${SKILL_ICONS[s.id]}</span>${esc(s.name)} <small>Nv ${SKILL_UNLOCKS[i]}</small></li>`).join('');
    return `<div class="ccard ${id === sel ? 'on' : ''}" data-a="m:pick" data-c="${id}" style="--cc:${c.resource.color}">
      <div class="cemb">${CLASS_ICONS[id]}</div><h2>${c.name}</h2><div class="ctitle">${c.title}</div>
      <div class="crole">${c.role} · Dificuldade ${'★'.repeat(c.difficulty)}${'☆'.repeat(3 - c.difficulty)}</div>
      <p>${esc(c.desc)}</p><div class="cbars">${bars}</div><ul class="cskills">${sk}</ul></div>`;
  }).join('');
  const name = ui.pickName ?? NAMES[Math.floor(Math.random() * NAMES.length)];
  ui.pickName = name;
  const gn = ui.pickGender === 'F' ? 'Mulher' : 'Homem';
  return `<div class="selwrap"><h1>Escolha sua classe</h1><div class="gpick">Personagem: <b>${gn}</b> <button class="btn sm" data-a="m:new">Trocar</button></div><div class="cards">${cards}</div>
    <div class="namebox"><label for="heroName">Nome do herói</label><input id="heroName" maxlength="16" value="${esc(name)}" autocomplete="off"><button class="btn sm" data-a="m:randname" title="Nome aleatório">Sortear</button></div><div id="nameErr" class="lerr hidden" style="margin:-4px 0 6px;color:#ff8a8a;font-weight:700;font-size:13px"></div>
    <div class="row"><button class="btn" data-a="m:back">Voltar</button><button class="btn big primary" data-a="m:start"><span>Começar jornada</span></button></div></div>`;
}

export function renderPause(ui) {
  const G = ui.G;
  const tut = G.state && G.state.world.tutorial < 7;
  return `<div class="card pause"><h2>Menu</h2><p class="muted" style="text-align:center;margin:-6px 0 10px">O jogo continua rodando — o mundo não pausa.</p>
    <div class="col">
      <button class="btn primary" data-a="m:resume">Continuar</button>
      <button class="btn" data-a="m:settings">Configurações</button>
      <button class="btn" data-a="m:savenow">Salvar agora</button>
      <button class="btn" data-a="m:settings" data-tab="save">Código de salvamento</button>
      ${tut ? '<button class="btn" data-a="m:skiptut">Pular tutorial</button>' : ''}
      <button class="btn" data-a="m:title">Sair para o título</button>
      <button class="btn" data-a="m:title" data-sv="trocar">Trocar de servidor <small class="muted">(agora: ${esc(serverName(G.net.server || getServer()))})</small></button>
    </div>
    <div class="pinfo">
      <div>${ICONS.nuvem} Salvamento: <b>${esc(G.saver.localOk ? 'navegador ✓' : 'navegador indisponível')}</b> · nuvem: <b>${esc(G.saver.cloudState)}</b></div>
      <div>${ICONS.globo} Multiplayer: <b>${esc(G.net.status)}</b> · <b>${esc(serverName(G.net.server || getServer()))}</b>${G.net.status === 'conectado' ? ` · ${G.net.count() + 1} jogador(es) no vale` : ''}</div>
      <div class="muted">Outros jogadores aparecem em tempo real com nome, classe e gestos. Inimigos, saque e eventos são locais em cada aparelho nesta versão.</div>
    </div></div>`;
}

export function renderSettings(ui, tab = 'gfx') {
  const G = ui.G, s = G.settings;
  ui.settingsTab = tab;
  const tabs = [['gfx', 'Gráficos'], ['audio', 'Áudio'], ['ctrl', 'Controles'], ['ui', 'Interface'], ['save', 'Salvamento']]
    .map(([id, n]) => `<button class="stab ${tab === id ? 'on' : ''}" data-a="m:stab" data-tab="${id}">${n}</button>`).join('');
  const range = (k, label, min = 0, max = 1, step = 0.05) => `<label class="srow"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-set="${k}"><b>${Math.round((s[k] / max) * 100)}%</b></label>`;
  const check = (k, label, hint = '') => `<label class="srow chk"><input type="checkbox" ${s[k] ? 'checked' : ''} data-set="${k}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  let body = '';
  if (tab === 'gfx') {
    body = `<label class="srow"><span>Qualidade</span><select data-set="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${s.quality === k ? 'selected' : ''}>${q.label}</option>`).join('')}</select></label>
      <label class="srow"><span>Distância de visão<small>Mais curta = mais leve (desenha menos coisas longe)</small></span><select data-set="viewDist">${[['curta', 'Curta'], ['media', 'Média'], ['longa', 'Longa']].map(([k, n]) => `<option value="${k}" ${(s.viewDist || 'media') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${check('rain', 'Chuva', 'Desligada: quando for chover, não chove para você (fica mais leve).')}
      ${check('ultraGrass', 'Grama e matinhos do Ultra realismo', 'Desligada: tira o capim, flores e pedrinhas em volta (bem mais leve). O chão realista continua.')}
      ${check('autoRes', 'Resolução automática', 'Só se o jogo travar: tira as sombras e depois baixa a nitidez; volta sozinho quando melhorar. Vale também no Ultra leve.')}
      ${check('showFps', 'Mostrar FPS')}
      <p class="muted">Baixa: sem sombras, ideal para celulares. Alta: sombras detalhadas e maior distância de visão.</p>`;
  } else if (tab === 'audio') {
    body = range('master', 'Volume geral') + range('sfx', 'Efeitos') + range('music', 'Música') + range('amb', 'Ambiente');
  } else if (tab === 'ctrl') {
    const binds = G.input.binds;
    const rows = Object.keys(DEFAULT_BINDS).map((a) => `<div class="bind"><span>${BIND_LABELS[a]}</span><button class="btn sm ${G.input.rebinding === a ? 'wait' : ''}" data-a="m:rebind" data-k="${a}">${G.input.rebinding === a ? 'Pressione uma tecla…' : keyLabel(binds[a])}</button></div>`).join('');
    body = `<label class="srow"><span>Sensibilidade da câmera</span><input type="range" min="0.3" max="2.5" step="0.1" value="${s.camSens}" data-set="camSens"><b>${s.camSens.toFixed(1)}×</b></label>
      ${check('invertY', 'Inverter eixo vertical da câmera')}
      ${check('crosshair', 'Mira de tiro (arqueiro e mago)', 'Aparece uma mira; o tiro vai para onde a câmera aponta (gire a câmera para mirar). Ela fica vermelha quando trava num monstro.')}
      ${check('camFollow', 'Câmera fixa no personagem', 'A câmera volta sozinha para as costas do herói enquanto você anda.')}
      ${G.isTouch ? `<div class="row" style="justify-content:flex-start"><button class="btn primary" data-a="m:hudedit">✥ Personalizar HUD</button><small class="muted">arraste os botões para onde quiser</small></div>` : ''}
      ${G.isTouch ? check('joyFloat', 'Analógico móvel (aparece onde você tocar no lado esquerdo)') : ''}
      ${G.isTouch ? `<label class="srow"><span>Tamanho dos botões de toque</span><input type="range" min="0.8" max="1.4" step="0.05" value="${s.touchScale}" data-set="touchScale"><b>${Math.round(s.touchScale * 100)}%</b></label>` : ''}
      ${G.isTouch && G.input.lastDevice !== 'keyboard' ? `<p class="muted">No celular: analógico à esquerda move · arraste a tela gira a câmera · pinça aproxima · toque no minimapa abre o mapa. As teclas podem ser trocadas ao jogar com teclado.</p>` : `<h3>Teclas</h3><div class="binds">${rows}</div><div class="row"><button class="btn sm" data-a="m:resetbinds">Restaurar padrão</button></div>
      <p class="muted">Mouse: clique no jogo para prender o mouse na câmera (mexer o mouse gira a visão, clique ataca para onde você olha) · <b>Caps Lock</b> solta/prende o mouse · roda do mouse aproxima.</p>`}`;
  } else if (tab === 'ui') {
    body = `<label class="srow"><span>Tela de dano (brilho vermelho ao apanhar)</span><select data-set="hurtFx">${[['auto', 'Automática — ajusta ao tamanho da tela'], ['suave', 'Suave — só nas bordas finas'], ['off', 'Desligada']].map(([v, n]) => `<option value="${v}" ${s.hurtFx === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
      + range('hurtIntensity', 'Intensidade da tela de dano') + check('damageNumbers', 'Números de dano') + check('showPeers', 'Mostrar nomes de outros jogadores')
      + check('cleanScreen', 'Tela limpa: esconder nomes e mensagens (fica só o aviso e a vida dos chefes)');
  } else if (tab === 'save') {
    const inGame = G.mode === 'play';
    body = `${inGame ? `<div><h3>Exportar personagem</h3><p class="muted">Leve este personagem para outro aparelho.</p>
      <textarea class="code" readonly data-el2="exportcode">${esc(G.saver.exportCode())}</textarea><div class="row"><button class="btn sm" data-a="m:copy">Copiar código</button></div></div>` : ''}
      <div><h3>Importar personagem</h3><textarea class="code" data-el2="importcode" placeholder="Cole aqui o código de salvamento…"></textarea><div class="row"><button class="btn sm" data-a="m:doimport">Importar</button></div></div>
      <div><h3>Apagar progresso</h3><div class="row">${ui.confirmErase ? '<button class="btn danger" data-a="m:erase">Confirmar: apagar TODOS os personagens</button>' : '<button class="btn" data-a="m:erase">Apagar todos os personagens</button>'}</div>
      <p class="muted">Cada personagem tem seu próprio salvamento. Navegador ${G.saver.localOk ? '✓' : 'indisponível'} · nuvem: ${esc(G.saver.cloudState)}</p></div>`;
  }
  return `<div class="card settings"><h2>Configurações</h2><div class="stabs">${tabs}</div><div class="sbody ${tab}">${body}</div><div class="row"><button class="btn primary" data-a="m:closesettings">Concluir</button></div></div>`;
}

export function renderDeath() {
  return `<div class="card death"><h2>Você caiu</h2><p>Seu progresso está salvo. Você renasce no ponto seguro mais próximo, sem perder itens ou experiência.</p>
    <div class="row"><button class="btn primary" data-a="m:respawn" disabled>Renascer</button></div></div>`;
}

export function renderIntro(ui) {
  const G = ui.G, touch = G.isTouch;
  const ctrls = touch
    ? '<li><b>Joystick</b> à esquerda move · arraste à direita gira a câmera · pinça aproxima</li><li><b>⚔</b> ataca o alvo mais próximo · <b>1–4</b> habilidades · <b>esquiva</b> e <b>poção</b> ao lado</li><li><b>☰</b> abre inventário, personagem, missões e mapa</li>'
    : '<li><b>WASD</b> move · <b>mouse</b> gira a câmera (preso na tela) · <b>clique</b> ataca · <b>Caps Lock</b> solta o mouse</li><li><b>1–4</b> habilidades · <b>Espaço</b> esquiva · <b>Q</b> poção · <b>E</b> interagir</li><li><b>I</b> inventário · <b>C</b> personagem · <b>J</b> missões · <b>M</b> mapa · <b>T</b> gestos · <b>P</b> modo foto</li>';
  return `<div class="card intro"><div class="lore"><p>Há muito tempo, o mundo de <b>Eldoria</b> foi protegido por estruturas antigas: os <b>Selos da Realidade</b>.</p>
    <p>Os selos começaram a falhar. Fendas surgiram em regiões distantes, e criaturas desconhecidas passaram a atravessar para o mundo.</p>
    <p>Você chega ao <b>Vale de Eldoria</b> quando os primeiros sinais de corrupção começam a aparecer.</p></div>
    <ul class="ctrls">${ctrls}</ul><div class="row"><button class="btn big primary" data-a="m:introok"><span>Começar</span></button></div></div>`;
}

export function afterModal(ui, kind) {
  if (kind !== 'settings') return;
  const G = ui.G;
  for (const inp of ui.el.modal.querySelectorAll('[data-set]')) {
    const k = inp.dataset.set;
    const handler = () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
      G.settings[k] = v;
      if (k === 'quality' || k === 'rain' || k === 'viewDist') G.applyQuality();
      if (k === 'showFps') ui.el.fps.classList.toggle('hidden', !v);
      if (k === 'touchScale') ui.mobile.applyScale();
      if (k === 'hurtFx' || k === 'hurtIntensity') { ui._hurtKey = null; ui.fitHurt(); if (v !== 'off') ui.flashHurt(0.5); }
      G.saveSettings();
      if (inp.type === 'range') { const b = inp.parentElement.querySelector('b'); if (b) b.textContent = k === 'camSens' ? v.toFixed(1) + '×' : Math.round((v / parseFloat(inp.max)) * 100) + '%'; }
    };
    inp.addEventListener(inp.type === 'range' ? 'input' : 'change', handler);
  }
}

export function menuClick(ui, a, el) {
  const G = ui.G;
  G.audio.init();
  G.audio.play('ui');
  switch (a) {
    case 'new': ui.pickClass = 'guerreiro'; ui.pickName = null; ui.pickGender = null; ui.showGender(); break;
    case 'gender': ui.pickGender = el.dataset.g === 'F' ? 'F' : 'M'; ui.showSelect(); break;
    case 'gender2': { // personagem antigo escolhendo pela primeira vez
      const g = el.dataset.g === 'F' ? 'F' : 'M';
      G.state.player.look = { g };
      if (!G.cosmetics.fits(G.cosmetics.data.skin && COSMETIC_SETS.skin[G.cosmetics.data.skin] || {})) G.cosmetics.data.skin = 'campones';
      G.player.rebuildRig(); G.cosmetics.apply();
      G.saver.requestSave('aparência'); ui.closeModal();
      ui.toastSmall?.(g === 'F' ? 'Personagem: Mulher' : 'Personagem: Homem');
      break;
    }
    case 'pick': ui.pickName = document.getElementById('heroName')?.value ?? ui.pickName; ui.pickClass = el.dataset.c; ui.showSelect(); break;
    case 'randname': ui.pickName = NAMES[Math.floor(Math.random() * NAMES.length)]; ui.showSelect(); break;
    case 'back': ui.showTitle(); break;
    case 'install': {
      const p = window.__instalar;
      if (p) { p.prompt(); p.userChoice.finally(() => { window.__instalar = null; if (G.mode === 'title') ui.showTitle(); }); }
      else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) ui.toastSmall('No iPhone: toque em Compartilhar ⤴ e depois em "Adicionar à Tela de Início". Abra pelo ícone: tela cheia, sem barra.');
      else ui.toastSmall('Toque nos 3 pontinhos ⋮ do Chrome e em "Instalar app" (ou "Adicionar à tela inicial"). Depois abra pelo ícone do ELDORIA: tela cheia, sem barra.');
      break;
    }
    case 'start': {
      const name = (document.getElementById('heroName')?.value || ui.pickName || 'Viajante').replace(/\s+/g, ' ').trim();
      const tok = G.saver.serverToken;
      if (!tok) { ui.loadScreen({ scene: 'vila', title: name, sub: 'Começando a aventura' }, () => G.startNew(name, ui.pickClass || 'guerreiro', ui.pickGender)); break; }
      // site com contas: o servidor confere se o nome está livre ANTES de criar (nomes são únicos no jogo)
      if (ui._naming) break; ui._naming = true; const old = el.innerHTML; el.disabled = true; el.textContent = 'Conferindo o nome…';
      import('../game/serverauth.js').then(async (SA) => {
        const r = await SA.reserveName(tok, name, null);
        ui._naming = false; el.disabled = false; el.innerHTML = old;
        if (!r.ok) { ui.pickName = name; const e2 = document.getElementById('nameErr'); if (e2) { e2.textContent = r.error; e2.classList.remove('hidden'); } else ui.toastSmall(r.error, 5); return; }
        ui.loadScreen({ scene: 'vila', title: name, sub: 'Começando a aventura' }, () => {
          G.startNew(name, ui.pickClass || 'guerreiro', ui.pickGender);
          SA.reserveName(tok, name, G.state.charId); // prende o nome neste personagem
        });
      });
      break;
    }
    case 'continue': {
      if (el.dataset.id === '__pending' && G.pendingSave) { const ps = G.pendingSave; ui.loadScreen(enterInfo(ps), () => G.continueGame(ps)); break; }
      menuClick(ui, 'loadchar', el);
      break;
    }
    case 'chars': ui.confirmDel = null; ui.openModal('chars'); break;
    case 'loadchar': {
      if (ui._loading) break;
      ui._loading = true;
      G.saver.loadCharacter(el.dataset.id).then((s) => {
        ui._loading = false;
        if (s) { ui.closeModal(); ui.loadScreen(enterInfo(s), () => G.continueGame(s)); } else ui.toastSmall('Não foi possível carregar este personagem.');
      });
      break;
    }
    case 'delchar': {
      const id = el.dataset.id;
      if (ui.confirmDel !== id) { ui.confirmDel = id; ui.openModal('chars'); break; }
      ui.confirmDel = null;
      G.saver.deleteCharacter(id).then(() => { ui.openModal('chars'); });
      break;
    }
    case 'importview':
      ui.openModal('html', `<div class="card"><h2>Importar código</h2><textarea class="code" data-el2="importcode" placeholder="Cole aqui o código de salvamento…"></textarea><div class="row"><button class="btn" data-a="m:close">Cancelar</button><button class="btn primary" data-a="m:doimport">Importar</button></div></div>`);
      break;
    case 'settings': ui.openModal('settings', el.dataset.tab || 'gfx'); afterModal(ui, 'settings'); break;
    case 'server': setServer(+el.dataset.sv || 1); ui.showTitle(); break;
    case 'retrysrv': location.reload(); break; // servidor dormindo: tenta acordar de novo
    case 'site': ui.rank.open(); break; // ranking dentro do jogo (seta ← volta)
    case 'stab': ui.openModal('settings', el.dataset.tab); afterModal(ui, 'settings'); break;
    case 'logout': if (G.mode === 'play' && G.pvp?.blocked()) { ui.toastSmall(`Em combate (block): espere ${G.pvp.blockLeft()} s para sair.`, 3); break; } import('../game/serverauth.js').then(async (SA) => {
      // salva na conta, tira deste navegador os personagens dela e volta para a tela de entrar
      try { if (G.mode === 'play') await G.saver.writeCloud(G.saver.snapshot()); } catch { /* ok */ }
      const { SaveManager } = await import('../game/save.js');
      SaveManager.clearOwner(SaveManager.OWNER);
      SA.logoutServer(); location.reload();
    }); break;
    case 'closesettings': G.input.rebinding = null; if (G.mode === 'play') ui.openModal('pause'); else ui.closeModal(); break;
    case 'close': ui.closeModal(); break;
    case 'hudedit': ui.closeModal(); ui.mobile.startEdit(); break;
    case 'pause': if (G.mode === 'play') ui.openModal('pause'); break;
    case 'resume': ui.closeModal(); break;
    case 'savenow': G.saver.saveNow('manual', true); ui.toastSmall('Progresso salvo.'); break;
    case 'skiptut': G.tutorial.skip(); ui.closeModal(); break;
    case 'title': if (G.pvp?.blocked()) { ui.toastSmall(`Em combate (block): espere ${G.pvp.blockLeft()} s para sair.`, 3); break; } G.saver.saveNow('saída', true); setTimeout(() => location.reload(), 250); break;
    case 'copy': {
      const ta = ui.el.modal.querySelector('[data-el2="exportcode"]');
      const txt = ta?.value || '';
      const done = () => ui.toastSmall('Código copiado.');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, () => { ta.select(); ui.toastSmall('Selecione e copie manualmente (Ctrl+C).'); });
      else { ta.select(); ui.toastSmall('Selecione e copie manualmente (Ctrl+C).'); }
      break;
    }
    case 'doimport': {
      const ta = ui.el.modal.querySelector('[data-el2="importcode"]');
      try {
        const s = SaveManager.importCode(ta.value);
        if (G.mode === 'play') {
          if (SaveManager.writeLocal(s)) { ui.toastSmall('Importado como personagem separado! Recarregando…'); G.saver.saveNow('troca', true); setTimeout(() => location.reload(), 600); }
          else ui.toastSmall('Não foi possível gravar neste navegador.');
        } else { SaveManager.writeLocal(s); G.pendingSave = null; ui.closeModal(); ui.showTitle(); ui.toastSmall('Personagem importado — clique em Continuar.'); }
      } catch (e) { ui.toastSmall(e.message || 'Código inválido.'); G.audio.play('error'); }
      break;
    }
    case 'erase':
      if (!ui.confirmErase) { ui.confirmErase = true; ui.openModal('settings', 'save'); afterModal(ui, 'settings'); break; }
      ui.confirmErase = false;
      G.mode = 'erased';
      G.saver.clearAll().finally(() => setTimeout(() => location.reload(), 200));
      break;
    case 'rebind':
      G.input.rebinding = el.dataset.k;
      G.input.onRebind = () => { ui.openModal('settings', 'ctrl'); afterModal(ui, 'settings'); ui.buildSkillbar(); ui.buildMenuButtons(); };
      ui.openModal('settings', 'ctrl'); afterModal(ui, 'settings');
      break;
    case 'resetbinds':
      G.input.binds = { ...DEFAULT_BINDS };
      ui.openModal('settings', 'ctrl'); afterModal(ui, 'settings'); ui.buildSkillbar(); ui.buildMenuButtons();
      break;
    case 'respawn': if (ui.deathT <= 0) G.respawnPlayer(); break;
    case 'introok': ui.closeModal(); break;
    default: break;
  }
}

// tela de carregamento ao entrar com um personagem salvo: cena do mapa onde ele parou
export function enterInfo(st) {
  const p = st?.player || {};
  const area = ['cripta', 'ermos', 'confins', 'guardiao'].includes(p.area) ? p.area : 'world';
  return { area, title: p.name || 'Eldoria', sub: 'Nível ' + (p.level || 1) };
}
