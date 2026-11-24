import { QUESTS, QUEST_ORDER } from '../config/quests.js';

// Diário de missões — estado serializável em this.q
// q[id] = { state: 'active'|'ready'|'done', stage: n, prog: [números por objetivo] }
// ctx: { level, countItem(id), flags: {}, discovered: Set }
export class QuestLog {
  constructor(data = {}) {
    this.q = data.q || {};
    this.tracked = data.tracked || null;
  }

  toJSON() { return { q: this.q, tracked: this.tracked }; }

  status(id, ctx) {
    const s = this.q[id];
    if (s) return s.state;
    return this.meetsReq(id, ctx) ? 'available' : 'locked';
  }

  meetsReq(id, ctx) {
    const def = QUESTS[id];
    const r = def.req || {};
    if (r.level && ctx.level < r.level) return false;
    if (r.quests && !r.quests.every((qid) => this.q[qid]?.state === 'done')) return false;
    return true;
  }

  lockReason(id, ctx) {
    const r = QUESTS[id].req || {};
    if (r.quests && !r.quests.every((qid) => this.q[qid]?.state === 'done')) return 'Conclua missões anteriores.';
    if (r.level && ctx.level < r.level) return `Requer nível ${r.level}.`;
    return null;
  }

  accept(id, ctx) {
    if (this.q[id] || !this.meetsReq(id, ctx)) return false;
    const def = QUESTS[id];
    this.q[id] = { state: 'active', stage: 0, prog: def.stages[0].objectives.map(() => 0) };
    this.tracked = id;
    this.refresh(ctx);
    // objetivos "reach" já cumpridos
    for (const o of def.stages[0].objectives) if (o.type === 'reach' && ctx.discovered?.has(o.poi)) this.handle({ type: 'reach', poi: o.poi }, ctx);
    return true;
  }

  stageOf(id) {
    const s = this.q[id];
    if (!s) return null;
    return QUESTS[id].stages[Math.min(s.stage, QUESTS[id].stages.length - 1)];
  }

  objectives(id) {
    const s = this.q[id];
    const st = this.stageOf(id);
    if (!st) return [];
    return st.objectives.map((o, i) => {
      const need = o.count || 1;
      const have = s.state === 'ready' || s.state === 'done' ? need : Math.min(need, s.prog[i] || 0);
      return { ...o, need, have, done: have >= need };
    });
  }

  // Processa um evento do jogo. Retorna lista de { id, kind: 'progress'|'stage'|'ready' }.
  handle(evt, ctx) {
    const changes = [];
    for (const id of Object.keys(this.q)) {
      const s = this.q[id];
      if (s.state !== 'active') continue;
      const st = this.stageOf(id);
      let touched = false;
      st.objectives.forEach((o, i) => {
        if (o.type !== evt.type) return;
        const need = o.count || 1;
        if ((s.prog[i] || 0) >= need) return;
        if (evt.type === 'kill' && o.target === evt.target) { s.prog[i]++; touched = true; }
        else if (evt.type === 'reach' && o.poi === evt.poi) { s.prog[i] = 1; touched = true; }
        else if (evt.type === 'interact' && o.id === evt.id) { s.prog[i] = 1; touched = true; }
      });
      if (touched) changes.push({ id, kind: 'progress' });
      const adv = this.tryAdvance(id, ctx);
      if (adv) changes.push({ id, kind: adv });
    }
    if (evt.type === 'inventory' || evt.type === 'flag') changes.push(...this.refresh(ctx));
    return changes;
  }

  // Reavalia objetivos de coleta e flags (dependem do estado atual, não de eventos).
  refresh(ctx) {
    const changes = [];
    for (const id of Object.keys(this.q)) {
      const s = this.q[id];
      if (s.state !== 'active' && s.state !== 'ready') continue;
      const st = this.stageOf(id);
      let touched = false;
      st.objectives.forEach((o, i) => {
        let v = null;
        if (o.type === 'collect') v = Math.min(o.count, ctx.countItem(o.item));
        else if (o.type === 'flag') v = ctx.flags?.[o.flag] ? 1 : 0;
        if (v !== null && v !== s.prog[i]) { s.prog[i] = v; touched = true; }
      });
      if (s.state === 'ready' && !this.stageComplete(id)) { s.state = 'active'; changes.push({ id, kind: 'progress' }); continue; }
      if (touched) changes.push({ id, kind: 'progress' });
      const adv = this.tryAdvance(id, ctx);
      if (adv) changes.push({ id, kind: adv });
    }
    return changes;
  }

  stageComplete(id) {
    const s = this.q[id];
    const st = this.stageOf(id);
    return st.objectives.every((o, i) => (s.prog[i] || 0) >= (o.count || 1));
  }

  tryAdvance(id, ctx) {
    const s = this.q[id];
    if (s.state !== 'active' || !this.stageComplete(id)) return null;
    const def = QUESTS[id];
    if (s.stage < def.stages.length - 1) {
      s.stage++;
      s.prog = def.stages[s.stage].objectives.map(() => 0);
      this.refresh(ctx);
      for (const o of def.stages[s.stage].objectives) if (o.type === 'reach' && ctx.discovered?.has(o.poi)) this.handle({ type: 'reach', poi: o.poi }, ctx);
      return this.q[id].state === 'ready' ? 'ready' : 'stage';
    }
    s.state = 'ready';
    return 'ready';
  }

  // Entrega: consome itens de coleta, marca como concluída e devolve as recompensas.
  turnIn(id, ctx) {
    const s = this.q[id];
    if (!s || s.state !== 'ready') return null;
    const def = QUESTS[id];
    for (const st of def.stages) for (const o of st.objectives) if (o.type === 'collect') ctx.consume(o.item, o.count);
    s.state = 'done';
    if (this.tracked === id) this.tracked = this.nextTrackable(ctx);
    return def.rewards;
  }

  nextTrackable() {
    for (const id of QUEST_ORDER) if (this.q[id] && (this.q[id].state === 'active' || this.q[id].state === 'ready')) return id;
    return null;
  }

  forNpc(npcId, ctx) {
    const res = { available: [], ready: [], active: [] };
    for (const id of QUEST_ORDER) {
      const def = QUESTS[id];
      const st = this.status(id, ctx);
      if (st === 'available' && def.giver === npcId) res.available.push(id);
      else if (st === 'ready' && def.turnIn === npcId) res.ready.push(id);
      else if (st === 'active' && (def.turnIn === npcId || def.giver === npcId)) res.active.push(id);
    }
    return res;
  }

  // Marcador acima do NPC: '!' (disponível), '?' (entregar), '…' (em andamento)
  npcMarker(npcId, ctx) {
    const f = this.forNpc(npcId, ctx);
    if (f.ready.length) return 'ready';
    if (f.available.length) return 'available';
    if (f.active.length) return 'active';
    return null;
  }

  activeIds() { return QUEST_ORDER.filter((id) => this.q[id] && (this.q[id].state === 'active' || this.q[id].state === 'ready')); }
  doneIds() { return QUEST_ORDER.filter((id) => this.q[id]?.state === 'done'); }
}
