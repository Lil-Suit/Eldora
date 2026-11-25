import { createLoading, sceneFor } from './loading.js';
import { serverName } from '../game/servers.js';
import { ENEMIES, BOSS, tintOf } from '../config/enemies.js';
import { CONFINS } from '../config/world.js';
import * as THREE from 'three';
import { ICONS, SKILL_ICONS, CLASS_ICONS, itemIcon } from './icons.js';
import { MapRenderer } from './minimap.js';
import { renderJournal, journalClick, JOURNAL_TABS } from './panels.js';
import { openDialog, dialogClick } from './dialog.js';
import { renderTrade, ecoClick, openDiamonds } from './economyui.js';
import { renderTitle, renderSelect, renderPause, renderSettings, menuClick, renderDeath, renderIntro, renderChars, renderGender, genderCards } from './menus.js';
import { MobileControls } from './mobile.js';
import { RankView } from './rankview.js';
import { xpToNext , attrPointsAt} from '../core/progression.js';
import { displayName, rarityOf } from '../core/items.js';
import { skillState } from '../game/skills.js';
import { SKILL_UNLOCKS } from '../config/classes.js';
import { QUESTS } from '../config/quests.js';
import { keyLabel } from '../game/input.js';
import { BALANCE } from '../config/balance.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (root, sel) => root.querySelector(sel);
const _v = new THREE.Vector3();

export class UI {
  constructor(G) {
    this.G = G;
    this.root = document.getElementById('ui');
    this.root.innerHTML = this.skeleton();
    { const rot = this.root.querySelector('.rotate'); if (rot) document.body.appendChild(rot); } // "Gire o celular" por cima de TUDO (até do login)
    this.el = {};
    for (const n of this.root.querySelectorAll('[data-el]')) this.el[n.dataset.el] = n;
    this.loader = createLoading(this.root);
    this.map = new MapRenderer(G);
    this.map.buildBackground();
    this.journalTab = null;
    this.dialogNpc = null;
    this.modal = null;
    this.selected = null;
    this.numbers = [];
    this.alerts = [];
    this.plates = new Map();
    this.platePool = [];
    this.hintHtml = null;
    this.miniT = 0;
    this.photo = false;
    this.emotesOpen = false;
    this.toastQ = [];
    if (G.isTouch) document.body.classList.add('touch');
    this.mobile = new MobileControls(G, this);
    this.rank = new RankView(G); // ranking dentro do jogo (botão do canto da tela inicial)
    // anel de alvo no chão
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.renderOrder = 6;
    G.scene.add(this.ring);
    this.ring.visible = false;
    this.bindEvents();
    const refit = () => {
      this._hurtKey = null; this.fitHurt();
      // tela inicial: virou o celular / mudou a janela → refaz (quantos personagens cabem sem rolar)
      if (G.mode === 'title' && this.el.screen.classList.contains('title') && !this.el.screen.classList.contains('hidden')) { clearTimeout(this._titleT); this._titleT = setTimeout(() => { if (G.mode === 'title' && this.el.screen.classList.contains('title')) this.showTitle(); }, 150); }
    };
    window.addEventListener('resize', refit); window.addEventListener('orientationchange', () => setTimeout(refit, 300));
    window.visualViewport?.addEventListener('resize', refit); document.addEventListener('fullscreenchange', () => setTimeout(refit, 200));
    this.showTitle();
  }

  skeleton() {
    return `
    <div class="fade" data-el="fade"></div>
    <div class="hurt" data-el="hurt"></div>
    <div class="screen" data-el="screen"></div>
    <div class="hud hidden" data-el="hud">
      <div class="overlay" data-el="overlay"></div>
      <div class="hud-tl">
        <div class="pframe">
          <div class="pframe-emblem" data-el="emblem"></div>
          <div class="pframe-lvl" data-el="plvl">1</div>
          <div class="pframe-bars">
            <div class="pname" data-el="pname"></div>
            <div class="bar hp"><i data-el="hpFill"></i><b class="shbar" data-el="shFill"></b><span data-el="hpText"></span></div>
            <div class="bar res"><i data-el="resFill"></i><span data-el="resText"></span></div>
            <div class="bar res smana hidden" data-el="smBar"><i data-el="smFill"></i><span data-el="smText"></span></div>
            <div class="buffs" data-el="buffs"></div>
          </div>
        </div>
        <div class="goldrow"><div class="gold hidden" data-el="gold"></div><div class="gold ammohud hidden" data-el="ammo" title="Flechas"></div></div>
        <div class="pvpbtn interactive lock" data-el="pvpbtn" data-a="pv:cycle" title="PvP"><span class="sw">⚔</span></div>
        <div class="teamhud interactive" data-el="teamhud" data-a="team"></div>
        <div class="psel interactive hidden" data-el="psel"></div>
      </div>
      <div class="hud-tc">
        <div class="bossbar hidden" data-el="boss"><div class="bossname" data-el="bossName"></div><div class="bar"><i data-el="bossFill"></i><span data-el="bossText"></span></div><div class="bossphase" data-el="bossPhase"></div></div>
        <div class="target hidden" data-el="target"><div class="tname" data-el="tName"></div><div class="bar"><i data-el="tFill"></i><span data-el="tText"></span></div></div>
        <div class="eventbar hidden" data-el="event"></div>
      </div>
      <div class="hud-tr">
        <div class="minimap interactive" data-a="open" data-tab="map" title="Abrir mapa (M)"><canvas data-el="mini" width="180" height="180"></canvas><div class="zone" data-el="zone"></div><div class="clock" data-el="clock"></div><div class="netpill" data-el="netpill" data-a="team" title="Time e jogadores online"></div></div>
        <div class="tracker" data-el="tracker"></div>
        <div class="menubtns interactive" data-el="menubtns"></div>
      </div>
      <div class="hud-bc">
        <div class="hint hidden" data-el="hint"></div>
        <div class="prompt hidden" data-el="prompt"></div>
        <div class="skillbar interactive" data-el="skillbar"></div>
        <div class="xpbar"><i data-el="xpFill"></i><span data-el="xpText"></span></div>
      </div>
      <div class="hud-bl interactive" data-el="chat"><div class="chatlog" data-el="chatlog"></div><form data-el="chatform"><input data-el="chatin" maxlength="140" placeholder="Enter para conversar… (@Nome mensagem = privado)" autocomplete="off"><button class="csend" type="submit">Enviar</button></form></div>
      <div class="lootfeed" data-el="feed"></div>
      <div class="toasts" data-el="toasts"></div>
      <div class="banner" data-el="banner"></div>
      <div class="zonelabel" data-el="zonelabel"></div>
      <div class="emotes interactive hidden" data-el="emotes"></div>
      <div class="photopill hidden" data-el="photopill">Modo foto · <b>P</b> para sair</div>
      <div class="fps hidden interactive" data-el="fps" data-a="fpsdet" title="Toque para ver o que pesa"></div>
      <div class="mira hidden" data-el="mira"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="saved" data-el="saved">Progresso salvo</div>
    </div>
    <div class="journal interactive hidden" data-el="journal"></div>
    <div class="dialog interactive hidden" data-el="dialog"></div>
    <div class="modal interactive hidden" data-el="modal"></div>
    <div class="mobile hidden" data-el="mobile"></div>
    <div class="rotate"><div class="ph"></div><b>Gire o celular</b><small>ELDORIA foi feito para jogar com a tela deitada. Vire o aparelho para continuar.</small></div>`;
  }

  bindEvents() {
    // "clique fantasma" do celular: o painel abre no toque e o clique que vem logo depois cairia num item dele
    this.root.addEventListener('click', (e) => {
      if (performance.now() < (this.ghostUntil || 0) && e.target.closest('.journal, .modal, .dialog')) { e.preventDefault(); e.stopPropagation(); return; }
    }, true);
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      const a = t.dataset.a;
      this.G.audio.init();
      if (a.startsWith('j:')) journalClick(this, a.slice(2), t, e);
      else if (a.startsWith('d:')) dialogClick(this, a.slice(2), t, e);
      else if (a.startsWith('m:')) menuClick(this, a.slice(2), t, e);
      else if (a === 'open') this.togglePanel(t.dataset.tab);
      else if (a === 'team') this.G.party?.open();
      else if (a.startsWith('team:')) this.G.party?.click(a.slice(5), t);
      else if (a.startsWith('tr:')) this.G.trade?.click(a.slice(3), t);
      else if (a.startsWith('so:')) this.G.social?.click(a.slice(3), t);
      else if (a.startsWith('tp:')) this.G.teleports?.click(a.slice(3), t);
      else if (a.startsWith('pv:')) this.G.pvp?.click(a.slice(3), t);
      else if (a === 'friends') this.G.social?.openFriends();
      else if (a === 'gm') import('../game/gm.js').then((GM) => GM.openGmPanel(this.G));
      else if (a === 'mount') this.G.player?.toggleMount();
      else if (a.startsWith('ec:')) ecoClick(this, a.slice(3), t);
      else if (a === 'diamonds') openDiamonds(this);
      else if (a === 'fpsdet') this._fpsDetail = !this._fpsDetail;
      else if (a === 'skill') { this.G.input.touch.skill[+t.dataset.i] = true; }
      else if (a === 'emote') { const P = this.G.player; P.emote = t.dataset.e === 'stop' || P.emote === t.dataset.e ? null : t.dataset.e; P.anim.t = 0; this.G.audio?.play?.('click'); this.toggleEmotes(false); }
      else if (a === 'emclose') this.toggleEmotes(false);
      else if (a === 'hintclose') { this.G.tutorial.skip(); }
    });
    this.el.chatform.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.el.chatin.value;
      const pv = /^@(\S+)\s+(.+)$/.exec(v.trim()); // "@Nome mensagem" = privado
      // GM: /raid [estrelas 1-5 | nome] e /boss nome (mesmas ações do painel de GM)
      const rm = /^\/raid(?:\s+(.+))?$/i.exec(v.trim()), bm = /^\/boss\s+(.+)$/i.exec(v.trim());
      if ((rm || bm) && this.G.saver.serverGm) {
        this.el.chatin.value = '';
        const G = this.G, say = (t) => this.chatMessage({ name: 'GM', text: t, system: true, pv: true });
        const fold = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        import('../game/gm.js').then((GM) => {
          if (bm) {
            const q = fold(bm[1]), b = GM.bossList().find((x) => fold(x.name).includes(q) || x.type.includes(q));
            say(b ? GM.spawnBoss(G, b.type) : 'Chefe não encontrado. Ex.: /boss rei slime, /boss lorde, /boss minotauro, /boss guardiao'); return;
          }
          const arg = (rm[1] || '').trim();
          if (!arg) { say('Raids: ' + GM.raidList().map((r) => `${r.name} ${'★'.repeat(r.tier)}`).join(' · ') + '. Use /raid 1 a 5 ou /raid nome — ou o botão de GM.'); return; }
          const id = /^[1-5]$/.test(arg) ? GM.raidByStars(G, +arg) : GM.raidList().find((r) => fold(r.name).includes(fold(arg)) || r.id.includes(fold(arg)))?.id;
          say(id ? GM.openRaid(G, id) : 'Raid não encontrada. Digite /raid para ver a lista.');
        });
        return;
      }
      // GM: /seguranca mostra os últimos alertas de trapaça que o servidor registrou
      if (/^\/seguran[cç]a$/i.test(v.trim()) && this.G.saver.serverToken) {
        this.el.chatin.value = '';
        const say = (t) => this.chatMessage({ name: 'GM', text: t, system: true, pv: true });
        fetch('/api/gm/seguranca', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.G.saver.serverToken }, body: '{}' })
          .then((r) => r.json()).then((j) => { if (!j.list) return say(j.error || '?'); if (!j.list.length) return say('Nenhum alerta de segurança.'); j.list.forEach((l) => say(l)); }).catch(() => say('Servidor fora do ar.'));
        return;
      }
      // comandos de GM: /conta usuario  ·  /senha usuario senhanova
      const gm = /^\/(conta|senha)\s+(\S+)(?:\s+(\S+))?$/i.exec(v.trim());
      if (gm && this.G.saver.serverToken) {
        this.el.chatin.value = '';
        fetch('/api/gm/' + gm[1].toLowerCase(), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.G.saver.serverToken }, body: JSON.stringify({ user: gm[2], pass: gm[3] || '' }) })
          .then((r) => r.json()).then((j) => this.chatMessage({ name: 'GM', text: j.info || j.error || '?', system: true, pv: true })).catch(() => this.chatMessage({ name: 'GM', text: 'Servidor fora do ar.', system: true, pv: true }));
        return;
      }
      if (pv && this.G.social) { this.G.social.sendDm(pv[1], pv[2]); }
      else if (v.trim()) { if (!this.G.net.sendChat(v)) this.chatMessage({ name: 'Sistema', text: 'Você está jogando sozinho: o bate-papo funciona quando outras pessoas abrem esta página.', system: true }); }
      this.el.chatin.value = '';
      this.el.chatin.blur();
    });
    this.el.chatin.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.el.chatin.blur(); e.stopPropagation(); });
    this.el.chatin.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('chatting'), 150));
  }

  // ---------- telas ----------
  showTitle() { this.el.screen.className = 'screen title'; this.el.screen.innerHTML = renderTitle(this); this.el.screen.classList.remove('hidden'); }
  showSelect() { if (!this.pickGender) return this.showGender(); this.el.screen.className = 'screen select'; this.el.screen.innerHTML = renderSelect(this); }
  showGender() { this.el.screen.className = 'screen select'; this.el.screen.innerHTML = renderGender(this); }
  // personagem antigo: escolhe uma vez (homem ou mulher)
  askGender() {
    if (this.modal || this.G.mode !== 'play' || this.G.state.player.look?.g) return;
    this.openModal('html', `<div class="card gsel"><h2>Qual será seu personagem?</h2><p class="muted">Os heróis ganharam modelos novos. Escolha uma vez: dá para usar outras roupas na aba Aparência.</p>${genderCards('gender2')}</div>`);
    this.modal = 'gender';
  }

  enterGame(isNew) {
    document.body.classList.toggle('isgm', !!this.G.saver?.serverGm); // botão do painel de GM
    const G = this.G;
    this.el.screen.classList.add('hidden');
    this.el.screen.innerHTML = '';
    this.el.hud.classList.remove('hidden');
    this.el.emblem.innerHTML = CLASS_ICONS[G.player.cls.id];
    this.el.emblem.style.color = G.player.cls.resource.color;
    this.el.pname.textContent = G.state.player.name;
    if (G.saver.serverGm) { const gm = document.createElement('i'); gm.className = 'gm'; gm.textContent = 'GM '; this.el.pname.prepend(gm); }
    this.buildSkillbar();
    this.buildMenuButtons();
    this.renderEmotes();
    if (G.isTouch) this.mobile.show();
    this.el.fps.classList.toggle('hidden', !G.settings.showFps);
    this.refreshHud(); this.refreshQuests(); this.refreshNet();
    this.setZone('Vale de Eldoria');
    if (isNew) this.openModal('intro');
  }

  buildSkillbar() {
    const G = this.G, P = G.player, cls = P.cls, I = G.input;
    const basicIcon = cls.id === 'guerreiro' ? SKILL_ICONS.corte : cls.id === 'arqueiro' ? SKILL_ICONS.flecha : SKILL_ICONS.fagulha;
    const slots = [`<div class="slot basic" title="${esc(cls.basic.name)}"><span class="ico">${basicIcon}</span><b class="key">${G.isTouch ? '' : 'Clique'}</b><i class="cd"></i></div>`];
    cls.skills.forEach((s, i) => {
      slots.push(`<div class="slot" data-a="skill" data-i="${i}" title="${esc(s.name)} — ${esc(s.desc)}"><span class="ico">${SKILL_ICONS[s.id] || ICONS.estrela}</span><b class="key">${keyLabel(I.binds['skill' + (i + 1)])}</b><i class="cd"></i><em class="lock">${ICONS.cadeado}<small>Nv ${SKILL_UNLOCKS[i]}</small></em></div>`);
    });
    slots.push(`<div class="slot small" title="Esquiva: ${esc(cls.dodge.name)}"><span class="ico">${ICONS.esquiva}</span><b class="key">${keyLabel(I.binds.dodge)}</b><i class="cd"></i></div>`);
    slots.push(`<div class="slot small potion" title="Poção de Vida"><span class="ico" style="color:#ff6a78">${ICONS.pocao}</span><b class="key">${keyLabel(I.binds.potion)}</b><i class="cd"></i><u class="qty"></u></div>`);
    // montaria (no PC; no celular o botão fica nos controles da tela)
    if (!G.isTouch) slots.push(`<div class="slot small mountslot hidden" data-a="mount" title="Montar / desmontar (${keyLabel(I.binds.mount)})"><span class="ico mico"></span><b class="key">${keyLabel(I.binds.mount)}</b></div>`);
    this.el.skillbar.innerHTML = slots.join('');
    this.slotEls = [...this.el.skillbar.querySelectorAll('.slot')];
  }

  buildMenuButtons() {
    const I = this.G.input.binds;
    const b = [['inventory', 'bolsa', 'Inventário', I.inventory], ['character', 'pessoa', 'Personagem', I.character], ['skills', 'estrela', 'Habilidades', I.skills], ['quests', 'livro', 'Missões', I.quests], ['map', 'mapa', 'Mapa', I.map], ['appearance', 'cabide', 'Aparência', null]];
    this.el.menubtns.innerHTML = b.map(([t, ic, n, k]) => `<button data-a="open" data-tab="${t}" title="${n}${k ? ` (${keyLabel(k)})` : ''}">${ICONS[ic]}<i class="dotalert hidden"></i></button>`).join('')
      + (this.G.saver?.serverGm ? `<button data-a="gm" class="gmbtn" title="Painel do GM: chamar chefes e abrir raids">${ICONS.coroa || '♛'}</button>` : '')
      + `<button data-a="friends" title="Amigos">${ICONS.amigos}</button><button data-a="m:pause" title="Menu (Esc)">${ICONS.engrenagem}</button>`;
  }

  // ---------- HUD ----------
  refreshHud() {
    const G = this.G, P = G.player;
    if (!P) return;
    const sp = G.state.player;
    this.el.plvl.textContent = sp.level;
    this.el.gold.innerHTML = `${ICONS.moeda}<span>${sp.gold.toLocaleString('pt-BR')}</span>`;
    const need = xpToNext(sp.level);
    const xpK = need === Infinity ? 1 : sp.xp / need;
    this.el.xpFill.style.width = (xpK * 100).toFixed(1) + '%';
    this.el.xpText.textContent = need === Infinity ? `Nível ${sp.level} (máximo)` : `Nível ${sp.level} · ${Math.floor(sp.xp)} / ${need} XP`;
    const alertChar = sp.freePoints > 0;
    const btn = this.el.menubtns.querySelector('[data-tab="character"] .dotalert');
    if (btn) btn.classList.toggle('hidden', !alertChar);
  }

  updateBars() {
    const G = this.G, P = G.player;
    const hpK = P.hp / P.stats.maxHp;
    // só escreve no HTML quando o valor muda (escrever todo quadro forçava o navegador a refazer a tela)
    const set = (el, prop, v) => { if (!el) return; const k = '_v_' + prop; if (el[k] !== v) { el[k] = v; if (prop === 'text') el.textContent = v; else el.style[prop] = v; } };
    set(this.el.hpFill, 'width', (hpK * 100).toFixed(1) + '%');
    set(this.el.hpText, 'text', `${Math.ceil(P.hp)} / ${P.stats.maxHp}` + (P.barrier > 0 ? ` +${Math.ceil(P.barrier)}` : ''));
    set(this.el.shFill, 'width', P.barrier > 0 ? (Math.min(1, P.barrier / P.stats.maxHp) * 100).toFixed(1) + '%' : '0%');
    this.el.hpFill.parentElement.classList.toggle('low', hpK < 0.3);
    set(this.el.resFill, 'width', ((P.res / P.stats.maxRes) * 100).toFixed(1) + '%');
    set(this.el.resFill, 'background', P.cls.resource.color);
    set(this.el.resText, 'text', `${Math.floor(P.res)} ${P.cls.resource.name}`);
    // Conjunto da Prece: barra de mana (o Mago já tem a dele)
    const SM = P.stats.smana, showSm = !!SM && P.cls.resource.id !== 'mana';
    if (this.el.smBar) {
      this.el.smBar.classList.toggle('hidden', !showSm);
      if (showSm) { set(this.el.smFill, 'width', ((P.smana / SM.max) * 100).toFixed(1) + '%'); set(this.el.smText, 'text', `${Math.floor(P.smana)} Mana`); }
    }
    const buffs = [];
    if (P.buffs.haste > 0) buffs.push(`<span class="buff" title="Agilidade do Vento: +10% de velocidade">${SKILL_ICONS.agilidade}<small>${Math.ceil(P.buffs.haste)}</small></span>`);
    if (P.barrier > 0) buffs.push(`<span class="buff" title="Barreira da Muralha de Ferro: ${Math.ceil(P.barrier)} de vida extra">${ICONS.escudo}<small>${Math.ceil(P.barrierT || 0)}s</small></span>`);
    if (P.slowK < 1) buffs.push(`<span class="buff bad" title="Lento">⧗</span>`);
    if (!P.inCombat && P.stats.effects.has('aurora')) buffs.push(`<span class="buff gold" title="Aurora">☀</span>`);
    if (G.world.isSafe(P.pos.x, P.pos.z, P.area)) buffs.push(`<span class="buff safe" title="Zona segura: regeneração acelerada">Zona segura</span>`);
    const bh = buffs.join('');
    if (bh !== this._buffs) { this.el.buffs.innerHTML = bh; this._buffs = bh; }
    // habilidades
    const cdOf = (k, max) => (max > 0 ? Math.min(1, P.cds[k] / max) : 0);
    const s = this.slotEls;
    if (!s) return;
    const bcd = P.cls.basic.cd / (P.stats.weaponSpd * (1 + P.stats.aspd));
    this.setCd(s[0], cdOf('basic', bcd), P.cds.basic);
    P.cls.skills.forEach((sk, i) => {
      const el = s[i + 1];
      const st = skillState(P, i);
      el.classList.toggle('locked', !!st.locked);
      el.classList.toggle('nores', !st.locked && P.res < (sk.cost || 0));
      this.setCd(el, cdOf('s' + i, sk.cd * (1 - P.stats.cdr)), P.cds['s' + i]);
    });
    this.setCd(s[5], cdOf('dodge', P.cls.dodge.cd), P.cds.dodge);
    this.setCd(s[6], cdOf('potion', BALANCE.potionCooldown), P.cds.potion);
    const q = G.saver.serverGm ? '∞' : G.lifeCount(); // GM: infinita
    const qe = s[6].querySelector('.qty');
    if (qe.textContent !== String(q)) qe.textContent = q;
    s[6].classList.toggle('empty', q === 0);
    // arqueiro: quantas flechas restam (no botão do ataque básico)
    if (P.cls.id === 'arqueiro') { let ae = s[0].querySelector('.ammo'); if (!ae) { ae = document.createElement('u'); ae.className = 'ammo'; s[0].appendChild(ae); } const na = G.saver.serverGm ? '∞' : G.inv.count('flechas'); if (ae.textContent !== String(na)) ae.textContent = na; ae.classList.toggle('zero', na === 0); }
    // contador de flechas sempre à vista (embaixo do ouro), sem precisar abrir a mochila
    const am = this.el.ammo, arch = P.cls.id === 'arqueiro';
    if (am.classList.contains('hidden') === arch) am.classList.toggle('hidden', !arch);
    if (arch) { const na = G.saver.serverGm ? '∞' : G.inv.count('flechas'), key = String(na); if (am.dataset.n !== key) { am.dataset.n = key; am.innerHTML = `${itemIcon({ kind: 'consumable', id: 'flechas' })}<span>${typeof na === 'number' ? na.toLocaleString('pt-BR') : na}</span>`; am.classList.toggle('zero', na === 0); am.classList.toggle('low', typeof na === 'number' && na > 0 && na < 30); } }
    const ms = s[7];
    if (ms) {
      const mk = P.mountKind?.() || null;
      ms.classList.toggle('hidden', !mk); ms.classList.toggle('on', !!P.mounted);
      if (mk && ms.dataset.k !== mk) { ms.dataset.k = mk; ms.querySelector('.mico').innerHTML = itemIcon({ kind: 'quest', id: mk === 'lobo' ? 'lobo_criacao' : 'cavalo_criador' }); }
    }
    this.mobile.updateCooldowns();
  }

  setCd(el, k, remaining) {
    const cd = el._cd || (el._cd = el.querySelector('.cd'));
    const v = k > 0 ? `conic-gradient(rgba(8,8,16,.72) ${Math.round(k * 120) * 3}deg, transparent 0)` : 'none';
    if (cd._v !== v) { cd.style.background = v; cd._v = v; }
    const txt = remaining > 0.05 && k > 0 ? (remaining >= 1 ? Math.ceil(remaining) : remaining.toFixed(1)) : '';
    if (cd.textContent !== String(txt)) cd.textContent = txt;
  }

  refreshQuests() {
    const G = this.G;
    if (!G.quests) return;
    const ids = G.quests.activeIds();
    const tracked = G.quests.tracked && ids.includes(G.quests.tracked) ? G.quests.tracked : ids[0];
    const order = tracked ? [tracked, ...ids.filter((i) => i !== tracked)] : ids;
    const html = order.slice(0, 3).map((id, n) => {
      const def = QUESTS[id], st = G.quests.q[id];
      const obj = st.state === 'ready'
        ? `<li class="ready">Entregar a ${esc(G.interact?.npcs[def.turnIn]?.def.name || def.turnIn)}</li>`
        : G.quests.objectives(id).map((o) => `<li class="${o.done ? 'done' : ''}">${esc(o.text)}${o.need > 1 ? ` <b>${o.have}/${o.need}</b>` : ''}</li>`).join('');
      return `<div class="tq ${n === 0 ? 'main' : ''} ${def.type}"><div class="tqn">${def.type === 'principal' ? '◆ ' : ''}${esc(def.name)}</div><ul>${obj}</ul></div>`;
    }).join('');
    this.el.tracker.innerHTML = html || '<div class="tq muted">Sem missões ativas. Procure por <b>!</b> nos NPCs.</div>';
    if (this.journalTab === 'quests') this.renderJournal();
  }

  refreshPanels() {
    if (this.journalTab) this.renderJournal();
    if (this.dialogNpc && this.dialogView && ['shop', 'upgrade'].includes(this.dialogView)) openDialog(this, this.dialogNpc, this.dialogView, true);
    this.refreshHud();
  }

  refreshNet() {
    const N = this.G.net;
    const n = N.count();
    const on = N.status === 'conectado';
    const team = this.G.party?.id ? this.G.party.size() : 0;
    const ping = N.room?.ping;
    this.el.netpill.innerHTML = on ? `${ICONS.globo}<span>${esc(serverName(N.server || 1))} · ${n + 1} online${team > 1 ? ` · time ${team}` : ''}${Number.isFinite(ping) ? ` · ${ping} ms` : ''}</span>` : `${ICONS.globo}<span>Solo</span>`;
    this.el.netpill.title = 'Toque para ver quem está online e montar um time';
    this.G.party?.refresh();
    this.el.chat.classList.toggle('solo', !on);
  }

  setZone(name) { this.el.zone.textContent = name; }

  // "Tela limpa" (Configurações → Interface): sem nomes nem mensagens; só avisos de chefe e a vida deles no topo
  get clean() { return !!this.G.settings.cleanScreen; }

  zoneLabel(name, sub) {
    if (this.clean) return;
    const z = this.el.zonelabel;
    z.innerHTML = `<div class="zl1">${esc(name)}</div><div class="zl2">${esc(sub || '')}</div>`;
    z.classList.remove('show'); void z.offsetWidth; z.classList.add('show');
  }

  setPrompt(label) {
    const G = this.G;
    if (label === this._prompt) return;
    this._prompt = label;
    const p = this.el.prompt;
    if (!label) { p.classList.add('hidden'); this.mobile.setInteract(null); return; }
    p.innerHTML = `<kbd>${keyLabel(G.input.binds.interact)}</kbd> ${esc(label)}`;
    p.classList.toggle('hidden', G.isTouch);
    this.mobile.setInteract(label);
  }

  setHint(html) {
    if (html === this.hintHtml) return;
    this.hintHtml = html;
    const h = this.el.hint;
    if (!html) { h.classList.add('hidden'); return; }
    h.innerHTML = `<span>${html}</span><button class="interactive" data-a="hintclose" title="Pular tutorial">${ICONS.fechar}</button>`;
    h.classList.remove('hidden');
  }

  toastSmall(text, dur = 2.4, boss = false) {
    if (this.clean && !boss) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), dur * 1000);
    setTimeout(() => t.remove(), dur * 1000 + 400);
  }

  questToast(title, sub) {
    if (this.clean) return;
    const t = document.createElement('div');
    t.className = 'toast quest';
    t.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3600);
  }

  banner(title, sub, color, boss = false) {
    if (this.clean && !boss) return;
    const b = this.el.banner;
    b.innerHTML = `<div class="b1" style="${color ? `color:${color}` : ''}">${esc(title)}</div><div class="b2">${esc(sub || '')}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  levelUp(level, unlocked) {
    this.banner(`NÍVEL ${level}`, unlocked.length ? `Nova habilidade: ${unlocked.join(', ')}` : `+${attrPointsAt(level)} ponto${attrPointsAt(level) > 1 ? 's' : ''} de atributo · Vida e recursos restaurados`, '#ffd36b');
    if (unlocked.length) setTimeout(() => this.questToast('Habilidade desbloqueada', unlocked.join(', ')), 1200);
    this.refreshHud();
  }

  lootFeed(entry, qty) {
    const f = document.createElement('div');
    const isEq = entry.kind === 'equip';
    const col = isEq ? rarityOf(entry).color : '#e8e0cc';
    f.className = 'feed' + (isEq && ['raro', 'epico', 'lendario', 'mitico'].includes(entry.rarity) ? ' rare' : '');
    f.style.setProperty('--c', col);
    f.innerHTML = `<i style="color:${col}">${itemIcon(entry)}</i><span style="color:${col}">${esc(displayName(entry))}</span>${qty > 1 ? `<b>x${qty}</b>` : ''}`;
    this.el.feed.appendChild(f);
    while (this.el.feed.children.length > 6) this.el.feed.firstChild.remove();
    setTimeout(() => f.classList.add('out'), 3500);
    setTimeout(() => f.remove(), 4000);
  }

  // Tela de dano: a camada SEMPRE cobre a tela inteira (inset 0, sem medir posição) e só a grossura
  // do brilho é calculada pelo tamanho atual — refeita a cada flash e a cada giro/redimensionamento.
  fitHurt() {
    const h = this.el.hurt;
    if (!h) return;
    h.style.display = 'none'; return; // camada antiga (HTML) desligada — ver flashHurt
    const r = this.root || document.body;
    const w = r.clientWidth || window.innerWidth, ht = r.clientHeight || window.innerHeight;
    const s = this.G.settings || {};
    const m = Math.min(w, ht);
    const blur = Math.round(m * (s.hurtFx === 'suave' ? 0.09 : 0.16)), spread = Math.round(m * (s.hurtFx === 'suave' ? 0.015 : 0.03));
    // a camada passa da tela em todos os lados (E px) e a sobra entra na grossura: o que aparece é o mesmo,
    // mas mesmo se o navegador medir a tela errado (barra do Android, tela cheia, recorte da câmera) não sobra faixa sem vermelho
    const E = Math.round(Math.max(w, ht) * 0.2);
    const key = blur + '|' + spread + '|' + E;
    if (key === this._hurtKey) return;
    this._hurtKey = key;
    if (h.parentElement !== document.body) document.body.appendChild(h); // fora de qualquer caixa do jogo
    Object.assign(h.style, { position: 'fixed', left: -E + 'px', top: -E + 'px', right: 'auto', bottom: 'auto', width: `calc(100vw + ${2 * E}px)`, height: `calc(100vh + ${2 * E}px)`, zIndex: '3',
      boxShadow: `inset 0 0 ${blur}px ${spread + E}px rgba(205, 25, 25, .75)` });
    h.style.height = `calc(100lvh + ${2 * E}px)`; // navegadores novos: altura máxima da tela (se não entender, fica a de cima)
  }

  // a tela de dano agora é desenhada dentro da imagem 3D (engine/hurtvignette.js): sempre do tamanho exato da tela
  flashHurt(k) {
    const s = this.G.settings || {};
    if (s.hurtFx === 'off') return;
    const amp = s.hurtIntensity ?? 0.7;
    this.G.hurtFx?.flash(Math.min(1, (0.3 + k * 0.6) * amp * 1.2), s.hurtFx === 'suave' ? 0.12 : 0.2);
  }

  savedIndicator(reason) {
    if (reason === 'auto') return;
    const s = this.el.saved;
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
  }

  bossBar(e) {
    this.bossE = e; this._mini = null;
    this.el.boss.classList.toggle('hidden', !e);
    if (e) { this.el.bossName.textContent = e.def.name; this.el.bossName.style.color = tintOf(e.def) || ''; }
  }

  eventBanner(inst) {
    const el = this.el.event;
    // só aparece para quem está perto da fenda (mesma área e até ~60 m)
    const P = this.G.player, S = inst?.site;
    const near = inst && P && (!inst.area || inst.area === P.area) && (!S || Math.hypot(P.pos.x - S.x, P.pos.z - S.z) < 60);
    if (!near) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const html = `<b>${esc(inst.title || inst.def.name)}</b><span>${esc(inst.status || '')}</span><em>${this.G.net?.peers.size ? "Evento · todos os jogadores perto ganham" : "Evento"}</em>`;
    if (html !== this._ev) { el.innerHTML = html; this._ev = html; }
  }

  alertMark(e) { this.alerts.push({ e, t: 0.9 }); }

  // avisos no chat (estilo Rucoy): chefes em laranja, fendas/raids em roxo
  notice(text, kind = 'boss', title) {
    if (kind === 'rift') { // aviso roxo da fenda: só para quem está perto dela
      const P = this.G.player, inst = this.G.events?.active, S = inst?.site;
      if (!P || (inst?.area && inst.area !== P.area) || (S && Math.hypot(P.pos.x - S.x, P.pos.z - S.z) > 60)) return;
    }
    this.chatMessage({ name: title || (kind === 'rift' ? 'Fenda' : 'Chefe'), text, system: true, kind });
  }

  chatMessage(m) {
    const d = document.createElement('div');
    // estilo Rucoy: texto solto no canto, geral em branco, privado em rosa, sistema em dourado; some sozinho
    if (m.system && this.clean && !m.pv && !m.kind) return;
    d.className = 'cm' + (m.system ? ' sys' : '') + (m.me ? ' me' : '') + (m.pv ? ' pv' : '') + (m.kind ? ' k-' + m.kind : '');
    const n = document.createElement('b'); n.textContent = m.system && !m.pv && m.name === 'Sistema' ? '' : m.name + (m.guest ? ' (convidado)' : '');
    if (m.gm) { const g = document.createElement('i'); g.className = 'gm'; g.textContent = 'GM '; n.prepend(g); }
    const t = document.createElement('span'); t.textContent = (m.system && !m.pv ? (n.textContent ? ' ' : '') : ': ') + m.text;
    setTimeout(() => d.classList.add('old'), 15000);
    d.append(n, t);
    this.el.chatlog.appendChild(d);
    while (this.el.chatlog.children.length > 30) this.el.chatlog.firstChild.remove();
    this.el.chatlog.scrollTop = 1e6;
    this.el.chat.classList.add('active');
    clearTimeout(this._chatT);
    this._chatT = setTimeout(() => this.el.chat.classList.remove('active'), 9000);
  }

  focusChat() { this.el.chat.classList.add('active'); document.body.classList.add('chatting'); this.el.chatin.focus(); }

  reportError(e) {
    if (this._errShown) return;
    this._errShown = true;
    this.toastSmall('Algo deu errado: ' + (e?.message || e), 6);
  }

  // ---------- painéis e janelas ----------
  togglePanel(tab) {
    if (this.G.mode !== 'play') return;
    this.ghostUntil = performance.now() + 450;
    if (this.journalTab === tab) return this.closeJournal();
    this.closeDialog();
    if (tab === 'map') this.map.view = null; // abre de novo ampliado na sua região
    this.sel = null; this.confirmDrop = null; // abre sem nenhum item escolhido
    this.journalTab = tab;
    this.el.journal.classList.remove('hidden');
    this.renderJournal();
    this.G.bus.emit('panel', tab);
    this.G.audio.play('ui');
  }

  renderJournal() { this.el.journal.innerHTML = renderJournal(this, this.journalTab); }

  closeJournal() { if (this.journalTab) this.lastJournalTab = this.journalTab; this.journalTab = null; this.el.journal.classList.add('hidden'); this.el.journal.innerHTML = ''; }

  openDialog(npcId) { this.closeJournal(); openDialog(this, npcId); }

  refreshDialog() { if (this.dialogNpc) openDialog(this, this.dialogNpc, this.dialogView || 'main', true); }
  renderTrade(T) { return renderTrade(this, T); }
  openDiamonds() { openDiamonds(this); }

  closeDialog() { this.dialogNpc = null; this.dialogView = null; this.el.dialog.classList.add('hidden'); this.el.dialog.innerHTML = ''; }

  openModal(kind, data) {
    this.modal = kind;
    const m = this.el.modal;
    m.classList.remove('hidden');
    if (kind === 'pause') m.innerHTML = renderPause(this);
    else if (kind === 'settings') m.innerHTML = renderSettings(this, data);
    else if (kind === 'death') m.innerHTML = renderDeath(this);
    else if (kind === 'intro') m.innerHTML = renderIntro(this);
    else if (kind === 'chars') m.innerHTML = renderChars(this);
    else if (kind === 'message') m.innerHTML = `<div class="card msg"><h2>${esc(data.title)}</h2><p>${data.html}</p><div class="row"><button class="btn primary" data-a="m:close">Fechar</button></div></div>`;
    else if (kind === 'html') m.innerHTML = data;
    m.className = 'modal interactive ' + kind;
  }

  closeModal() { this.modal = null; this.el.modal.classList.add('hidden'); this.el.modal.innerHTML = ''; if (this.G.mode === 'title' && this.el.screen.classList.contains('title')) this.showTitle(); }

  refreshTeam() {
    const h = this.G.party ? this.G.party.hudHtml() : '';
    if (h !== this._teamH) { this._teamH = h; this.el.teamhud.innerHTML = h; this.el.teamhud.classList.toggle('hidden', !h); }
  }

  showMessage(title, html) { this.openModal('message', { title, html }); }

  showDeath() {
    this.deathT = BALANCE.respawnDelaySec;
    this.closeJournal(); this.closeDialog();
    this.openModal('death');
  }
  hideDeath() { if (this.modal === 'death') this.closeModal(); }

  escape() {
    if (this.G.mode !== 'play') return;
    if (this.G.input.rebinding) return;
    if (this.modal === 'death' || this.modal === 'gender') return;
    if (this.modal) { if (this.modal === 'settings') return this.openModal('pause'); return this.closeModal(); }
    if (this.dialogNpc) return this.closeDialog();
    if (this.journalTab) return this.closeJournal();
    if (this.emotesOpen) return this.toggleEmotes(false);
    if (this.photo) return this.togglePhoto();
    this.openModal('pause');
  }

  blocking() { return !!this.modal || !!this.dialogNpc || document.activeElement === this.el.chatin; }
  // Jogo online: o mundo nunca pausa — menus, configurações, inventário e diálogos abrem por cima
  // enquanto inimigos, eventos, dia/noite e outros jogadores continuam normalmente.
  isPaused() { return !!this.hudEditing; } // editando o HUD: o jogo fica parado
  panelCount() { return (this.journalTab ? 1 : 0) + (this.dialogNpc ? 1 : 0); }
  get pointerOverUi() { return !this.G.input.mouse.inside; }

  togglePhoto() {
    this.photo = !this.photo;
    document.body.classList.toggle('photo', this.photo);
    this.el.photopill.classList.toggle('hidden', !this.photo);
    if (this.photo) { this.closeJournal(); this.closeDialog(); }
  }

  // Gestos: cartões com ícone (cabe no celular deitado) — tocar de novo no mesmo gesto (ou em Parar) para de fazer
  renderEmotes() {
    const cur = this.G.player?.emote;
    const L = [['wave', '👋', 'Acenar'], ['dance', '💃', 'Dançar'], ['cheer', '🎉', 'Comemorar'], ['bow', '🙇', 'Reverência'], ['sit', '🪑', 'Sentar'], ['stop', '✋', 'Parar']];
    this.el.emotes.innerHTML = `<div class="emh"><span>Gestos</span><button data-a="emclose" aria-label="Fechar">✕</button></div>
      <div class="emg">${L.map(([e, ic, n]) => `<button class="emb${cur === e ? ' on' : ''}" data-a="emote" data-e="${e}"><i>${ic}</i>${n}</button>`).join('')}</div>`;
  }

  toggleEmotes(force) {
    this.emotesOpen = force ?? !this.emotesOpen;
    if (this.emotesOpen) this.renderEmotes();
    this.el.emotes.classList.toggle('hidden', !this.emotesOpen);
  }

  // tela de carregamento com uma cena do jogo (troca de mapa, entrar no jogo, voltar à vila)
  loadScreen({ area = 'world', scene, title = '', sub = '', minMs } = {}, cb) {
    return this.loader.show({ scene: scene || sceneFor(area), title, sub, minMs }, cb);
  }

  fade(cb) {
    const f = this.el.fade;
    f.classList.add('on');
    setTimeout(() => { try { cb(); } finally { setTimeout(() => f.classList.remove('on'), 120); } }, 380);
  }

  // ---------- números e marcadores no mundo ----------
  damageNumber(x, y, z, text, kind) {
    if (!this.G.settings.damageNumbers && (kind === 'dmg' || kind === 'crit')) return;
    if (this.clean && typeof text !== 'number') return; // tela limpa: sem "Fugindo!", "Esquivou", "Errou"…
    let el = this.numbers.length > 40 ? this.numbers.shift().el : document.createElement('div');
    el.className = 'num ' + kind;
    el.textContent = typeof text === 'number' ? Math.round(text).toLocaleString('pt-BR') : text;
    this.el.overlay.appendChild(el);
    this.numbers.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, t: 0, dur: kind === 'crit' ? 1.1 : 0.9 });
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.G.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return [(_v.x * 0.5 + 0.5) * window.innerWidth, (-_v.y * 0.5 + 0.5) * window.innerHeight];
  }

  plate(key) {
    let p = this.plates.get(key);
    if (!p) {
      const el = this.platePool.pop() || document.createElement('div');
      el.className = 'plate';
      el.innerHTML = '<div class="pn"></div><div class="pb"><i></i></div>';
      this.el.overlay.appendChild(el);
      p = { el, n: el.firstChild, fill: el.querySelector('i'), used: true, last: '' };
      this.plates.set(key, p);
    }
    p.used = true;
    return p;
  }

  updateOverlay(dt) {
    const G = this.G, P = G.player;
    // números
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      const k = n.t / n.dur;
      const s = this.project(n.x, n.y + k * 1.4, n.z);
      if (!s || k >= 1) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      n.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%,-50%) scale(${k < 0.15 ? 0.6 + k * 4 : 1})`;
      n.el.style.opacity = k > 0.7 ? String((1 - k) / 0.3) : '1';
    }
    for (const p of this.plates.values()) p.used = false;
    const clean = this.clean;
    // placas dos inimigos
    if (!clean) for (const e of G.enemies) {
      if (e.dead || !e.visibleToPlayer || e.def.boss) continue;
      if (e.minion && e !== G.target) continue; // chamados por chefe (vêm vários de uma vez): sem placa de nome, menos peso na tela
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      const show = d < 26 && (e.hp < e.stats.maxHp || e === G.target || e === G.hover || e.def.elite || e.state === 'chase' || e.state === 'attack' || e.state === 'special' || d < 12);
      if (!show) continue;
      const s = this.project(e.pos.x, e.pos.y + e.rig.height + 0.45, e.pos.z);
      if (!s) continue;
      const p = this.plate('e' + e.id);
      const diff = e.level - G.state.player.level;
      const cls = diff >= 3 ? 'red' : diff >= 1 ? 'orange' : diff <= -4 ? 'gray' : 'white';
      const label = `${diff >= 4 ? '☠ ' : ''}${e.def.name} · ${e.level}${e.evading ? ' · Evadindo' : ''}`;
      if (p.last !== label + cls) {
        // versão mais forte: o NOME na cor dela (azul, roxo, vermelho); o nível continua na cor do perigo
        const tc = tintOf(e.def);
        if (tc) p.n.innerHTML = `${diff >= 4 ? '☠ ' : ''}<b class="tint" style="color:${tc}">${esc(e.def.name)}</b> · ${e.level}${e.evading ? ' · Evadindo' : ''}`;
        else p.n.textContent = label;
        p.n.className = 'pn ' + cls; p.last = label + cls;
      }
      p.fill.style.width = ((e.hp / e.stats.maxHp) * 100).toFixed(0) + '%';
      p.el.classList.toggle('elite', !!e.def.elite);
      p.el.classList.toggle('tgt', e === G.target);
      p.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%,-100%)`;
    }
    // NPCs
    if (P.area === 'world') for (const id in G.interact.npcs) {
      const n = G.interact.npcs[id];
      const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z);
      if (d > 45) continue;
      const s = this.project(n.pos.x, n.pos.y + 2.55, n.pos.z);
      if (!s) continue;
      const p = this.plate('n' + id);
      const mk = G.quests.npcMarker(id, G.questCtx());
      if (clean && !mk) continue; // tela limpa: sem nome, só o marcador de missão
      const near = d < 18 && !clean;
      const label = (near ? n.def.name : '') + '|' + mk;
      if (p.last !== label) {
        p.n.innerHTML = `${mk ? `<b class="mk ${mk}">${mk === 'ready' ? '?' : mk === 'available' ? '!' : '…'}</b>` : ''}${near ? `<span>${esc(n.def.name)}</span><small>${esc(n.def.title)}</small>` : ''}`;
        p.n.className = 'pn npc'; p.last = label;
      }
      p.el.classList.add('npcplate');
      p.fill.parentElement.style.display = 'none';
      p.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%,-100%)`;
    }
    // outros jogadores
    if (G.settings.showPeers && !clean) for (const g of G.net.peers.values()) {
      if (g.pr.ar !== P.area) continue;
      // nick preso na cabeça: some de longe e diminui com a distância (tamanho fixo em relação ao personagem)
      if (!g.rig?.root.visible || G.net.stale(g)) continue; // só de quem está no mesmo mapa e aparece na tela
      if (Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) > 32) continue;
      const s = this.project(g.pos.x, g.pos.y + 2.3, g.pos.z);
      if (!s) continue;
      const cam = G.camera.position, ref = Math.max(4, Math.hypot(cam.x - P.pos.x, cam.y - P.pos.y - 1.6, cam.z - P.pos.z));
      const cd = Math.max(1, Math.hypot(cam.x - g.pos.x, cam.y - g.pos.y - 2.3, cam.z - g.pos.z)), ps = Math.min(1.1, ref / cd);
      const p = this.plate('p' + g.id);
      const gm = G.net.isGm(g), pk = +g.pr.pk || 0, pv = +g.pr.pv || 0, hunt = G.pvp?.isBountyTarget(g) ? 1 : 0;
      const label = `${g.pr.n || 'Viajante'}|${g.pr.l}|${g.bubble?.text || ''}|${g.isMe ? 1 : 0}|${g.pr.pt || ''}|${gm ? 1 : 0}|${pk}|${pv}|${hunt}`;
      if (p.last !== label) {
        p.n.innerHTML = `${g.bubble ? `<em class="bubble"></em>` : ''}<span class="peer${pk === 1 ? ' pkred' : ''}">${hunt ? '<i class="hunt">🎯</i>' : ''}${pk ? `<i class="pk${pk}">☠</i>` : ''}${pv ? `<i class="pvs pv${pv}">⚔</i>` : ''}${gm ? '<i class="gm">GM </i>' : ''}<span class="pnm"></span><span class="plv"></span></span>`;
        p.n.querySelector('.pnm').textContent = String(g.pr.n || 'Viajante').slice(0, 16);
        p.n.querySelector('.plv').textContent = ` · Nv ${+g.pr.l || 1}${g.isMe ? ' (sua outra aba)' : ''}`;
        if (g.bubble) p.n.querySelector('.bubble').textContent = g.bubble.text;
        p.n.className = 'pn' + (g.isMe ? ' me' : '') + (this.G.party?.isMate(g.id) ? ' team' : ''); p.last = label;
      }
      p.fill.parentElement.style.display = 'none';
      p.el.style.transformOrigin = '50% 100%';
      p.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%,-100%) scale(${ps.toFixed(3)})`;
    }
    // alertas "!"
    if (clean) this.alerts.length = 0;
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      const a = this.alerts[i];
      a.t -= dt;
      if (a.t <= 0 || a.e.dead) { this.alerts.splice(i, 1); continue; }
      const s = this.project(a.e.pos.x, a.e.pos.y + a.e.rig.height + 1.1, a.e.pos.z);
      if (!s) continue;
      const p = this.plate('a' + a.e.id);
      if (p.last !== '!') { p.n.innerHTML = '<b class="alertmk">!</b>'; p.n.className = 'pn'; p.last = '!'; }
      p.fill.parentElement.style.display = 'none';
      p.el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%,-100%)`;
    }
    for (const [k, p] of this.plates) {
      if (!p.used) {
        p.el.remove(); p.el.className = 'plate'; p.el.style.transformOrigin = ''; p.fill.parentElement.style.display = ''; this.platePool.push(p.el); this.plates.delete(k);
      }
    }
    // anel do alvo
    const t = G.hover || G.target;
    if (t && t.alive() && t.area === P.area) {
      this.ring.visible = true;
      this.ring.position.set(t.pos.x, t.pos.y + 0.06, t.pos.z);
      const r = t.radius + 0.35;
      this.ring.scale.set(r, 1, r);
      this.ring.material.opacity = 0.6 + Math.sin(G.time.real * 6) * 0.2;
    } else this.ring.visible = false;
  }

  // chefões menores (Rei Slime, Lorde dos Ossos, Vigia, campeões): vida no topo enquanto lutam perto de você
  nearMiniBoss() {
    const G = this.G, P = G.player, t = G.target;
    if (t && t.alive() && t.def.miniboss && t.area === P.area) return t;
    let best = null, bd = 30;
    for (const e of G.enemies) {
      if (e.dead || !e.def.miniboss || e.area !== P.area || !['chase', 'attack', 'special'].includes(e.state)) continue;
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateTargetFrame() {
    const G = this.G;
    let b = this.bossE;
    const mini = null; // monstros comuns e elites não mostram mais a barra no topo (só chefes)
    if (!b && mini !== this._mini) { this._mini = mini; this.el.boss.classList.toggle('hidden', !mini); if (mini) { this.el.bossName.textContent = mini.def.name; this.el.bossName.style.color = tintOf(mini.def) || ''; } }
    b = b || mini;
    if (b) {
      const k = Math.max(0, b.hp / b.stats.maxHp);
      this.el.bossFill.style.width = (k * 100).toFixed(1) + '%';
      this.el.bossText.textContent = `${Math.ceil(b.hp).toLocaleString('pt-BR')} / ${b.stats.maxHp.toLocaleString('pt-BR')}`;
      const names = b.boss ? ['Fase 1 · Despertar', 'Fase 2 · Fúria da Fenda', 'Fase 3 · Colapso'] : ['Nível ' + b.level, 'Nível ' + b.level + ' · Fúria', 'Nível ' + b.level + ' · Fúria total'];
      this.el.bossPhase.textContent = names[(b.boss ? b.boss.phase : b.phase) || 0] || '';
    }
    const t = G.target;
    const show = t && t.alive() && !t.def.boss && t !== b && !this.clean; // o chefe já tem a barra dele (nada de duas barras iguais)
    this.el.target.classList.toggle('hidden', !show);
    if (show) {
      const label = `${t.pvpFoe ? '⚔ ' : ''}${t.def.name} · Nível ${t.level}${t.def.elite ? ' · Elite' : ''}${t.pvpFoe ? ' · PvP' : ''}`;
      if (this.el.tName.textContent !== label) { this.el.tName.textContent = label; this.el.tName.style.color = (!t.pvpFoe && tintOf(t.def)) || ''; }
      this.el.tFill.style.width = ((t.hp / t.stats.maxHp) * 100).toFixed(1) + '%';
      this.el.tText.textContent = t.pvpFoe ? `${Math.ceil(t.hp)}%` : `${Math.ceil(t.hp)} / ${t.stats.maxHp}`;
    }
  }

  update(dt) {
    const G = this.G;
    if (G.mode !== 'play') return;
    const dlg = !!this.dialogNpc, jo = !!this.journalTab;
    if (dlg !== this._dlg) { this._dlg = dlg; document.body.classList.toggle('dlg', dlg); }
    if (jo !== this._jo) { this._jo = jo; document.body.classList.toggle('jopen', jo); }
    this.updateBars();
    this.updateTargetFrame();
    this.updateOverlay(dt);
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.1;
      const c = this.el.mini, mm = G.settings.minimap !== false;
      c.parentElement.classList.toggle('off', !mm);
      if (mm) this.map.drawMini(c.getContext('2d'), c.width);
      const tod = G.state.world.timeOfDay;
      const h = Math.floor(tod * 24), m = Math.floor((tod * 24 - h) * 60);
      const clock = `${G.night > 0.5 ? '☾' : '☀'} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${G.sky.isRaining() ? ' · Chuva' : ''}`;
      if (this.el.clock.textContent !== clock) this.el.clock.textContent = clock;
      if (this.journalTab === 'map') { const mc = this.el.journal.querySelector('canvas.fullmap'); if (mc) this.map.drawFull(mc.getContext('2d'), mc.width, mc.height); }
      if (G.settings.showFps) this.el.fps.textContent = `${Math.round(G.fps)} FPS` + (this._fpsDetail ? ` · ${G.profText()} · ${Math.round(G.renderer.info.render.calls)} desenhos · ${(G.renderer.getPixelRatio()).toFixed(2)}x` : '');
    }
    if (this.modal === 'death') {
      this.deathT -= dt;
      const b = this.el.modal.querySelector('[data-a="m:respawn"]');
      if (b) { const ready = this.deathT <= 0; b.disabled = !ready; b.textContent = ready ? 'Renascer' : `Renascer em ${Math.ceil(this.deathT)}s`; }
    }
    this.mobile.update(dt);
  }
}
