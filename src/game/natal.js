// =============================================================
// Evento de NATAL (config em config/seasonal.js).
// Três chefes (Noel, Flocos e a Rena Maligna) nascem num lugar aleatório e ABERTO do Vale ou dos Ermos
// (nunca dentro de vila, acampamento, ruína, casa ou qualquer construção). Só um vivo por vez.
//  • modo normal: um a cada 30 min a 2 h (horários sorteados, iguais em todos os aparelhos);
//  • "modo natal": 3 a 5 min depois que o anterior morre ou vai embora.
// Quem simula o mundo (o anfitrião) faz nascer e avisa TODO MUNDO conectado, em qualquer mapa.
// Se ninguém derrotar em 25 min, o chefe vai embora.
// =============================================================
import { NATAL, natalAtivo, natalBloco, natalBlocoAt, natalTipoBloco } from '../config/seasonal.js';
import { ENEMIES } from '../config/enemies.js';
import { LOCATIONS, ERMOS } from '../config/world.js';
import { openSpot, randomSpot, awayFromFights } from './sites.js';

const MIN = 60000;

export class Natal {
  constructor(G) {
    this.G = G;
    this.checkT = 2;
    this.seen = new Set();  // avisos já mostrados ("id:tipo de aviso")
    this.done = new Set();  // chefes (id) já derrotados ou que foram embora
    this.live = null;       // { e, id, until, msg } do chefe que EU (anfitrião) fiz nascer
    this.nextAt = null;     // modo natal: quando nasce o próximo
    this.lastType = null;
    this.cfg = NATAL;
  }
  get on() { return natalAtivo(); }
  aliveBoss() { return this.G.enemies.find((o) => o.def.natal && !o.def.mini && o.alive() && !o.removed) || null; }

  // quando nasce o próximo (para o aviso)
  nextTime(now = Date.now()) {
    if (NATAL.modoNatal) return this.nextAt;
    const b = natalBloco(now), at = natalBlocoAt(b);
    return at > now && !this.done.has('b' + b) ? at : natalBlocoAt(b + 1);
  }

  update(dt) {
    if (!this.on || this.G.mode !== 'play') return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    const G = this.G, host = !G.net?.isClient(), now = Date.now();
    // o chefe que eu fiz nascer: vai embora depois de 25 min sem ser derrotado
    if (this.live) {
      const { e } = this.live;
      if (e.dead || e.removed) this.live = null;
      else if (now > this.live.until) {
        const id = this.live.id;
        e.removed = true; e.rig.root.parent?.remove(e.rig.root);
        for (const o of G.enemies) if (o.summoner === e) { o.removed = true; o.rig.root.parent?.remove(o.rig.root); }
        G.enemies = G.enemies.filter((o) => o !== e && o.summoner !== e);
        this.live = null; this.done.add(id);
        if (NATAL.modoNatal) this.nextAt = now + this.modoWait();
        this.say({ k: 'fugiu', id, t: e.type, nx: this.nextTime() });
      }
    }
    if (!host) return;
    // reenvia o aviso de vez em quando: quem entrou no jogo depois também fica sabendo (cada um vê uma vez só)
    if (this.live && (this.reT = (this.reT || 0) + 2) >= 60) { this.reT = 0; G.net?.room?.emit('fx', { type: 'natal', ...this.live.msg }).catch(() => {}); }
    if (this.live || this.aliveBoss()) return; // nunca dois ao mesmo tempo
    if (NATAL.modoNatal) {
      if (this.nextAt == null) this.nextAt = now + this.modoWait(); // acabou de ligar (ou virei anfitrião agora)
      if (now < this.nextAt) return;
      const C = NATAL.chefes.filter((t) => t !== this.lastType);
      if (this.spawn({ id: 'n' + now.toString(36), type: C[Math.floor(Math.random() * C.length)] })) this.nextAt = null;
      return;
    }
    // modo normal: o horário sorteado deste bloco chegou e ninguém derrotou ainda
    const b = natalBloco(now), at = natalBlocoAt(b), id = 'b' + b;
    if (now < at || now > at + (NATAL.vidaMin - 1) * MIN || this.done.has(id)) return;
    this.spawn({ id, type: natalTipoBloco(b), ms: at + NATAL.vidaMin * MIN - now });
  }
  modoWait() { const [a, b] = NATAL.modoMin; return Math.round((a + Math.random() * (b - a)) * MIN); }

  // lugar aberto (sem construção perto), sorteado num mapa qualquer (Vale, Planície do Guardião, Ermos ou Confins)
  okPlace(x, z, area) { return openSpot(this.G, x, z, area); }
  pickPlace() {
    const tot = NATAL.areas.reduce((s, a) => s + a.peso, 0);
    let r = Math.random() * tot, first = NATAL.areas[0];
    for (const a of NATAL.areas) { r -= a.peso; if (r <= 0) { first = a; break; } }
    for (const A of [first, ...NATAL.areas.filter((a) => a !== first)]) {
      const p = randomSpot(this.G, A.area, { filter: (x, z) => awayFromFights(this.G, x, z, A.area, { players: 0, bosses: 70, fenda: 80 }) });
      if (p) return { A, x: p.x, z: p.z };
    }
    return null;
  }

  spawn({ id, type, ms = NATAL.vidaMin * MIN }) {
    const G = this.G;
    if (!ENEMIES[type]) return null;
    const P = this.pickPlace();
    if (!P) return null;
    const { A, x, z } = P;
    const e = G.spawnTemporary(type, A.nivel, x, z, A.area, true);
    e.aggroed = false; e.natalId = id;
    this.lastType = type;
    const msg = { k: 'nasceu', id, t: type, ar: A.area, x: Math.round(x), z: Math.round(z), lugar: this.placeName(x, z, A.area) };
    this.live = { e, id, until: Date.now() + ms, msg };
    this.reT = 0;
    this.say(msg);
    return e;
  }

  placeName(x, z, area) {
    if (area === 'confins') { const B = this.G.world?.confins?.biomeAtWorld?.(x, z); return 'em ' + (B?.name ? B.name + ', ' : '') + 'Confins'; }
    if (area === 'guardiao') return 'na Planície do Guardião';
    if (area === 'ermos') {
      let best = null, bd = Infinity;
      for (const L of Object.values(ERMOS.locations || {})) { const d = Math.hypot(x - L.x - ERMOS.offset.x, z - L.z - ERMOS.offset.z); if (d < bd) { bd = d; best = L; } }
      return 'em ' + (best?.name ? best.name + ', ' : '') + 'Ermos da Fenda';
    }
    let best = null, bd = Infinity;
    for (const L of Object.values(LOCATIONS)) { if (L.safe || L.secret || L.area) continue; const d = Math.hypot(x - L.x, z - L.z) - L.r; if (d < bd) { bd = d; best = L; } }
    if (best && bd < 25) return (bd <= 0 ? 'em ' : 'perto de ') + best.name + ', Vale de Eldoria';
    // longe de tudo: diz a direção a partir da vila
    const V = LOCATIONS.vila, ang = Math.atan2(-(z - V.z), x - V.x) * 180 / Math.PI; // norte = -z
    const dirs = ['a leste', 'a nordeste', 'ao norte', 'a noroeste', 'a oeste', 'a sudoeste', 'ao sul', 'a sudeste'];
    return dirs[((Math.round(ang / 45) % 8) + 8) % 8] + ' da Vila de Eldoria';
  }

  // o chefe morreu (quem simula o mundo avisa todo mundo)
  onKilled(e) {
    if (!e.def.natal || e.def.mini || e.replica) return;
    const id = e.natalId || 'x' + Date.now().toString(36);
    this.done.add(id);
    if (this.live?.e === e) this.live = null;
    for (const o of this.G.enemies) if (o.summoner === e && o.alive()) { o.hp = 0; o.die?.(); }
    if (NATAL.modoNatal) this.nextAt = Date.now() + this.modoWait();
    this.say({ k: 'morreu', id, t: e.type, nx: this.nextTime() });
  }

  // aviso para todos os jogadores conectados (qualquer mapa) + para mim
  say(d) {
    this.G.net?.room?.emit('fx', { type: 'natal', ...d }).catch(() => {});
    this.show(d);
  }
  onMsg(d) {
    if (!this.on) return;
    const id = String(d.id || '').slice(0, 20);
    if (d.k === 'morreu' || d.k === 'fugiu') {
      this.done.add(id);
      // se eu virar o anfitrião, já sei quando nasce o próximo
      if (NATAL.modoNatal && Number.isFinite(+d.nx) && +d.nx > Date.now() && +d.nx < Date.now() + 10 * MIN) this.nextAt = +d.nx;
    }
    this.show({ ...d, id });
  }
  show(d) {
    const G = this.G, def = ENEMIES[d.t];
    if (!def || !['nasceu', 'morreu', 'fugiu'].includes(d.k)) return;
    const key = d.id + ':' + d.k;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const nome = def.name, o = def.fem ? 'a' : 'o';
    const nx = +d.nx, mins = Number.isFinite(nx) && nx > Date.now() ? Math.max(1, Math.round((nx - Date.now()) / MIN)) : null;
    const prox = mins ? ` O próximo chefe de Natal aparece em cerca de ${mins} min.` : '';
    if (d.k === 'nasceu') {
      const lugar = String(d.lugar || '').slice(0, 60);
      G.ui.banner?.('🎄 Chefe de Natal!', `${nome} apareceu ${lugar || 'no mapa'}!`, '#ff5a5a');
      G.ui.chatMessage?.({ name: 'Natal', text: `🎄 ${nome} apareceu ${lugar || 'no mapa'}! Vida: ${def.fixedHp.toLocaleString('pt-BR')}. Se ninguém derrotar, vai embora em ${NATAL.vidaMin} min.`, system: true });
      G.audio?.play('discover');
      this.mark = { t: d.t, ar: d.ar, x: +d.x, z: +d.z, until: Date.now() + NATAL.vidaMin * MIN };
    } else if (d.k === 'morreu') {
      G.ui.chatMessage?.({ name: 'Natal', text: `🎁 ${nome} foi derrotad${o}!${prox}`, system: true });
      if (this.mark?.t === d.t) this.mark = null;
    } else {
      G.ui.chatMessage?.({ name: 'Natal', text: `❄️ ${nome} foi embora sem ser derrotad${o}…${prox}`, system: true });
      if (this.mark?.t === d.t) this.mark = null;
    }
  }
}
