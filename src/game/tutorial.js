// Dicas dos primeiros minutos: mover, falar, lutar, usar habilidade, entregar, evoluir.
export class Tutorial {
  constructor(G) {
    this.G = G;
    this.moved = 0;
    this.usedSkill = false;
    this.openedChar = false;
    G.bus.on('skillUsed', () => { this.usedSkill = true; });
    G.bus.on('panel', (id) => { if (id === 'character') this.openedChar = true; });
  }

  get step() { return this.G.state.world.tutorial; }
  set step(v) { this.G.state.world.tutorial = v; }

  steps() {
    const G = this.G, touch = G.isTouch;
    return [
      { text: touch ? 'Use o <b>joystick</b> à esquerda para andar.' : 'Use <b>W A S D</b> para andar. Clique no jogo e mexa o <b>mouse</b> para girar a câmera (<b>Caps Lock</b> solta o mouse).', done: () => this.moved > 8 },
      { text: `Fale com o <b>Mestre Aldric</b> na praça ${touch ? '(botão <b>Falar</b>)' : '(<b>E</b>)'}.`, marker: 'mestre', done: () => G.quests.q.q1_gosmas },
      { text: touch ? 'Atravesse a ponte ao norte e toque em <b>⚔</b> para atacar os slimes.' : 'Atravesse a ponte ao norte. <b>Clique</b> para atacar na direção do cursor.', done: () => (G.state.player.stats.kills.slime || 0) >= 1 },
      { text: touch ? 'Toque na habilidade <b>1</b> para um golpe especial.' : 'Pressione <b>1</b> para usar sua habilidade. <b>Espaço</b> faz você se esquivar.', done: () => this.usedSkill },
      { text: 'Derrote 5 slimes e volte ao <b>Mestre Aldric</b> (marcador <b class="q">?</b>).', done: () => G.quests.q.q1_gosmas?.state === 'done' },
      { text: touch ? 'Você tem pontos de atributo! Abra o <b>menu ☰ → Personagem</b>.' : 'Você tem pontos de atributo! Abra o <b>Personagem (C)</b>.', when: () => G.state.player.freePoints > 0, done: () => this.openedChar || G.state.player.freePoints === 0 },
      { text: 'Novas missões: procure os marcadores <b class="q">!</b> da <b>Ferreira</b> e do <b>Comerciante</b>. Explore o vale!', timed: 12 },
    ];
  }

  update(dt) {
    const G = this.G;
    if (this.step >= this.steps().length) { G.ui.setHint(null); return; }
    const P = G.player;
    if (P.vel) this.moved += Math.hypot(P.vel.x, P.vel.z) * dt;
    const s = this.steps()[this.step];
    if (s.when && !s.when()) { G.ui.setHint(null); if (s.done()) this.step++; return; }
    G.ui.setHint(s.text);
    if (s.timed) { s._t = (this._t = (this._t || 0) + dt); if (this._t > s.timed) { this.step++; this._t = 0; } return; }
    if (s.done()) { this.step++; G.audio.play('ui'); }
  }

  skip() { this.step = 99; this.G.ui.setHint(null); }
}
