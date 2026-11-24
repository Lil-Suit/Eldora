// Áudio sintetizado (WebAudio): efeitos, ambiente e trilha generativa. Sem arquivos externos.
export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.45, amb: 0.6 };
    this.ambient = { day: 1, rain: 0, river: 0, fire: 0, dungeon: 0, combat: 0, corrupt: 0 };
    this.musicMode = 'explore';
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    // eco simples
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.23;
    this.fb = c.createGain(); this.fb.gain.value = 0.28;
    this.wet = c.createGain(); this.wet.gain.value = 0.22;
    this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(this.master);
    // ruído
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startAmbient();
    this.nextChord = c.currentTime + 1;
    this.chordI = 0;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music * 0.5;
    this.amb.gain.value = this.vol.amb;
  }

  noise(dur, out, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.5, attack = 0.005, when = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4; s.loop = true; // ruído longo (trovão) não acaba no meio
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return g;
  }

  tone(freq, dur, out, { type = 'sine', f1 = freq, gain = 0.3, attack = 0.005, when = 0, echo = false } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx);
    if (echo) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = o.gap ?? 35;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const v = o.vol ?? 1;
    switch (name) {
      case 'swing': this.noise(0.16, null, { f0: 1800, f1: 500, q: 2, gain: 0.18 * v }); break;
      case 'hit': this.tone(150, 0.12, null, { f1: 60, gain: 0.35 * v }); this.noise(0.06, null, { f0: 2500, f1: 1200, q: 1, gain: 0.15 * v }); break;
      case 'crit': this.tone(150, 0.16, null, { f1: 50, gain: 0.45 * v }); this.tone(1400, 0.18, null, { type: 'triangle', f1: 900, gain: 0.1 * v }); break;
      case 'arrow': this.noise(0.12, null, { type: 'highpass', f0: 3000, f1: 1500, gain: 0.12 * v }); this.tone(320, 0.08, null, { type: 'triangle', f1: 180, gain: 0.12 * v }); break;
      case 'magic': this.tone(520, 0.25, null, { type: 'sine', f1: 1100, gain: 0.12 * v, echo: true }); this.tone(780, 0.2, null, { type: 'triangle', f1: 1500, gain: 0.05 * v }); break;
      case 'fire': this.noise(0.4, null, { type: 'lowpass', f0: 1400, f1: 300, gain: 0.2 * v }); this.tone(180, 0.3, null, { f1: 90, gain: 0.12 * v }); break;
      case 'explosion': this.noise(0.75, null, { type: 'lowpass', f0: 1200, f1: 80, gain: 0.5 * v, attack: 0.01 }); this.tone(70, 0.5, null, { f1: 35, gain: 0.45 * v }); break;
      case 'ice': for (let i = 0; i < 4; i++) this.tone(1800 + i * 330, 0.3, null, { type: 'triangle', gain: 0.05 * v, when: i * 0.03, echo: true }); this.noise(0.3, null, { type: 'highpass', f0: 4000, gain: 0.1 * v }); break;
      case 'blink': this.tone(300, 0.2, null, { f1: 1600, gain: 0.12 * v, echo: true }); break;
      case 'dash': this.noise(0.25, null, { f0: 600, f1: 2400, q: 1.5, gain: 0.2 * v }); break;
      case 'shield': this.tone(220, 0.6, null, { type: 'triangle', f1: 330, gain: 0.15 * v, echo: true }); this.tone(440, 0.6, null, { type: 'sine', f1: 660, gain: 0.08 * v }); break;
      case 'quake': this.noise(0.6, null, { type: 'lowpass', f0: 600, f1: 60, gain: 0.5 * v }); this.tone(55, 0.5, null, { f1: 30, gain: 0.5 * v }); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, null, { type: 'triangle', gain: 0.16, when: i * 0.08, echo: true })); break;
      case 'loot': {
        const n = 1 + (o.rarity || 0);
        for (let i = 0; i < n; i++) this.tone(880 * Math.pow(1.26, i), 0.25, null, { type: 'sine', gain: 0.1 + 0.03 * (o.rarity || 0), when: i * 0.07, echo: (o.rarity || 0) >= 2 });
        break;
      }
      case 'coin': this.tone(1568, 0.08, null, { type: 'square', gain: 0.04 }); this.tone(2093, 0.12, null, { type: 'square', gain: 0.04, when: 0.06 }); break;
      case 'ui': this.tone(660, 0.05, null, { type: 'triangle', gain: 0.06 }); break;
      case 'hurt': this.tone(200, 0.15, null, { type: 'sawtooth', f1: 110, gain: 0.08 * v }); this.noise(0.1, null, { f0: 900, gain: 0.12 * v }); break;
      case 'death': [440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.5, null, { type: 'triangle', gain: 0.14, when: i * 0.22, echo: true })); break;
      case 'roar': this.tone(85, 1.3, null, { type: 'sawtooth', f1: 55, gain: 0.3 * v, attack: 0.15 }); this.noise(1.2, null, { type: 'lowpass', f0: 700, f1: 120, gain: 0.35 * v, attack: 0.1 }); break;
      case 'howl': this.tone(420, 1.1, null, { type: 'sine', f1: 640, gain: 0.08 * v, attack: 0.2, echo: true }); break;
      case 'squelch': this.tone(330, 0.12, null, { f1: 120, gain: 0.12 * v }); break;
      case 'rattle': for (let i = 0; i < 5; i++) this.noise(0.03, null, { f0: 2500, q: 4, gain: 0.08 * v, when: i * 0.04 }); break;
      case 'slam': this.noise(0.4, null, { type: 'lowpass', f0: 500, f1: 60, gain: 0.45 * v }); this.tone(60, 0.35, null, { f1: 35, gain: 0.4 * v }); break;
      case 'quest': this.tone(659, 0.2, null, { type: 'triangle', gain: 0.14 }); this.tone(988, 0.4, null, { type: 'triangle', gain: 0.14, when: 0.15, echo: true }); break;
      case 'discover': [392, 494, 587].forEach((f, i) => this.tone(f, 0.9, null, { type: 'sine', gain: 0.09, when: i * 0.12, echo: true })); break;
      case 'chest': this.noise(0.25, null, { f0: 400, f1: 200, gain: 0.15 }); this.tone(988, 0.3, null, { type: 'triangle', gain: 0.1, when: 0.15, echo: true }); break;
      case 'rune': this.tone(o.pitch || 440, 1.2, null, { type: 'sine', gain: 0.15, echo: true }); this.tone((o.pitch || 440) * 1.5, 1.2, null, { type: 'sine', gain: 0.06, echo: true }); break;
      case 'error': this.tone(180, 0.15, null, { type: 'square', gain: 0.05 }); break;
      case 'thunder': { const w = o.delay || 0; this.noise(0.25, null, { type: 'highpass', f0: 1800, f1: 600, gain: 0.25 * v, when: w }); this.noise(2.6, null, { type: 'lowpass', f0: 380, f1: 50, gain: 0.55 * v, attack: 0.08, when: w + 0.05 }); this.tone(48, 1.8, null, { f1: 30, gain: 0.3 * v, attack: 0.2, when: w }); break; }
      case 'portal': this.tone(110, 1.5, null, { type: 'sawtooth', f1: 440, gain: 0.08, attack: 0.3, echo: true }); break;
      default: break;
    }
  }

  startAmbient() {
    const c = this.ctx;
    const loop = (filterType, freq, q) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.amb); s.start();
      return { g, f };
    };
    this.loops = {
      wind: loop('lowpass', 420, 0.6),
      river: loop('bandpass', 700, 0.7),
      rain: loop('highpass', 1600, 0.3),
      drone: loop('lowpass', 160, 1),
      fire: loop('bandpass', 1800, 2),
    };
    this.ambT = 0;
  }

  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.loops) return;
    const a = this.ambient, L = this.loops, t = this.ctx.currentTime;
    this.ambT += dt;
    const set = (node, v) => node.g.gain.setTargetAtTime(v, t, 0.6);
    set(L.wind, 0.05 + 0.04 * Math.sin(this.ambT * 0.3) + a.corrupt * 0.06);
    set(L.river, a.river * 0.12);
    set(L.rain, a.rain * 0.16);
    set(L.drone, a.dungeon * 0.22 + a.corrupt * 0.12);
    set(L.fire, a.fire * 0.05 * (0.6 + Math.random() * 0.8));
    // pássaros de dia, grilos à noite
    if (a.dungeon < 0.5 && a.rain < 0.5) {
      if (a.day > 0.5 && Math.random() < dt * 0.35) {
        const f = 2200 + Math.random() * 1600;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f * (1 + Math.random() * 0.2), 0.07, this.amb, { type: 'sine', f1: f * 1.3, gain: 0.03, when: i * 0.09 });
      }
      if (a.day < 0.4 && Math.random() < dt * 1.2) {
        for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, this.amb, { type: 'square', gain: 0.006, when: i * 0.05 });
      }
    }
    // trilha generativa
    if (t > this.nextChord && this.vol.music > 0.01) {
      const prog = this.musicMode === 'boss' ? [[110, 131, 165], [104, 131, 156], [98, 123, 147], [104, 131, 156]]
        : this.musicMode === 'dungeon' ? [[110, 131, 165], [98, 117, 147], [87, 110, 131], [98, 117, 147]]
        : a.day > 0.5 ? [[220, 262, 330], [175, 220, 262], [262, 330, 392], [196, 247, 294]]
        : [[165, 196, 247], [147, 175, 220], [131, 165, 196], [147, 185, 220]];
      const ch = prog[this.chordI++ % prog.length];
      const dur = this.musicMode === 'boss' ? 2.2 : 4.2;
      for (const f of ch) this.pad(f, dur);
      if (this.musicMode === 'boss') this.tone(55, 0.25, this.music, { gain: 0.25 });
      this.nextChord = t + dur * 0.92;
    }
  }

  pad(freq, dur) {
    const c = this.ctx, t = c.currentTime;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = this.musicMode === 'boss' ? 1400 : 900;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.1);
    for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = this.musicMode === 'boss' ? 'sawtooth' : 'triangle';
      o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur * 1.15);
    }
    f.connect(g); g.connect(this.music); g.connect(this.delay);
  }
}
