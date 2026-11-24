import { ENEMIES, BOSS } from '../config/enemies.js';
import { CONFINS } from '../config/world.js';
import { WAVE_EVENTS } from './events.js';
import { ITEM_SETS, ITEM_BASES, SLOT_NAMES, setBaseFor } from '../config/items.js';
import { RARITIES, RARITY_INDEX } from '../config/balance.js';
import { generateEquipment } from '../core/items.js';
import { Rng } from '../core/rng.js';

// GM: pega peças do Conjunto da Prece (ou o conjunto inteiro, na versão da sua classe) na raridade e no nível escolhidos
// pieces: ids das peças (prece_elmo…) ou 'all'
export function giveSetPieces(G, pieces, rarity, ilvl, setId = 'prece') {
  if (!isGm(G)) return 'Só GM.';
  const S = ITEM_SETS[setId] || ITEM_SETS.prece, rng = new Rng(), lvl = Math.max(1, Math.min(G.state.player.level, Math.round(ilvl || G.state.player.level)));
  const ids = pieces === 'all' ? Object.keys(S.bases).map((slot) => setBaseFor(S, slot, G.player.cls.id)) : pieces;
  let n = 0;
  for (const baseId of ids) {
    const it = generateEquipment({ baseId, rarity, ilvl: lvl, rng });
    if (G.inv.add(it)) { G.ui.refreshPanels?.(); return n ? `${n} peça(s) na bolsa; a bolsa encheu.` : 'Bolsa cheia.'; }
    n++;
  }
  G.state.player.inventory = G.inv.slots;
  G.ui.refreshPanels?.(); G.saver?.requestSave?.('gm');
  const R = RARITIES[RARITY_INDEX[rarity]]?.name || rarity;
  return n === 1 ? `${ITEM_BASES[ids[0]].name} (${R}, nível ${lvl}) foi para a bolsa.` : `${S.name} completo (${R}, nível ${lvl}) foi para a bolsa.`;
}

// =============================================================
// Ferramentas de GM (contas da lista GMS do servidor): chamar qualquer chefe e abrir qualquer raid.
// Usadas pelo painel de GM (botão de coroa) e pelos comandos /boss e /raid do chat.
// =============================================================
export const isGm = (G) => !!G.saver?.serverGm;

// todos os chefes do jogo, do mais fraco ao mais forte
export function bossList() {
  const lvl = (t) => (ENEMIES[t].boss ? BOSS.level : bossLevel(t));
  return Object.keys(ENEMIES).filter((t) => ENEMIES[t].miniboss || ENEMIES[t].boss).map((t) => ({ type: t, name: ENEMIES[t].name, level: lvl(t) })).sort((a, b) => a.level - b.level);
}
function bossLevel(type) {
  const B = Object.values(CONFINS.biomes).find((b) => b.boss === type);
  if (B) return B.levels[1] + 3;
  return ENEMIES[type].level || ({ rei_slime: 1, campeao_goblin: 8, rei_esqueleto: 14, vigia: 17 })[type] || 20;
}
// todas as raids, por estrelas
export function raidList() {
  return Object.entries(WAVE_EVENTS).filter(([, d]) => d.tier).map(([id, d]) => ({ id, name: d.name, tier: d.tier, area: d.area })).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

export function spawnBoss(G, type) {
  if (!isGm(G)) return 'Só GM.';
  if (!ENEMIES[type]) return 'Chefe não encontrado.';
  if (G.net.isClient()) return 'Só funciona quando você é o anfitrião (o primeiro a entrar).';
  const P = G.player, a = Math.random() * Math.PI * 2;
  G.spawnTemporary(type, ENEMIES[type].boss ? BOSS.level : bossLevel(type), P.pos.x + Math.cos(a) * 9, P.pos.z + Math.sin(a) * 9, P.area);
  return `${ENEMIES[type].name} chamado perto de você.`;
}

// GM: faz nascer agora o chefe de Natal da vez (lugar aleatório + aviso para todos)
export function natalNow(G) {
  if (!isGm(G)) return 'Só GM.';
  if (G.net.isClient()) return 'Só funciona quando você é o anfitrião (o primeiro a entrar).';
  if (!G.natal?.on) return 'O evento de Natal está desligado.';
  if (G.enemies.some((o) => o.def.natal && !o.def.mini && o.alive())) return 'Já tem um chefe de Natal vivo no mapa.';
  const N = G.natal, order = ['noel', 'boneco_neve', 'rena_maligna'], t = order[(N.gmN = ((N.gmN ?? -1) + 1)) % 3];
  const e = N.spawn({ id: 'g' + Date.now().toString(36), type: t });
  return e ? `${e.def.name} apareceu (${N.live?.msg?.lugar || ''}).` : 'Não achei lugar para ele nascer, tente de novo.';
}

export function openRaid(G, id) {
  if (!isGm(G)) return 'Só GM.';
  const d = WAVE_EVENTS[id]; if (!d) return 'Raid não encontrada.';
  if (G.net.isClient()) return 'Só funciona quando você é o anfitrião (o primeiro a entrar).';
  const E = G.events; if (E.active) E.end(false);
  const oldArea = d.area, oldB = d.biomes; d.area = G.player.area; d.biomes = null; // abre aqui mesmo se for de outro mapa
  let ok = false; try { ok = E.start(id, { source: 'gm' }); } finally { d.area = oldArea; d.biomes = oldB; }
  return ok ? `Raid aberta: ${d.name} ${'★'.repeat(d.tier)}` : 'Não deu para abrir aqui (procure um lugar aberto, fora da cidade).';
}

// escolhe uma raid por estrelas (deste lugar → deste mapa → qualquer mapa)
export function raidByStars(G, n) {
  const A = G.player.area, B = A === 'confins' ? G.world.confins.biomeAtWorld(G.player.pos.x, G.player.pos.z) : null;
  const all = Object.entries(WAVE_EVENTS).filter(([, d]) => d.tier === n);
  const pools = [all.filter(([, d]) => d.area === A && (!d.biomes || (B && d.biomes.includes(B.id)))), all.filter(([, d]) => d.area === A), all.filter(([, d]) => !d.biomeHorde)];
  const pool = pools.find((x) => x.length) || [];
  return pool.length ? pool[Math.floor(Math.random() * pool.length)][0] : null;
}

// ---------- painel ----------
const AREA_NAME = { world: 'Vale', ermos: 'Ermos', confins: 'Confins' };
export function openGmPanel(G) {
  if (!isGm(G)) return;
  document.querySelector('.gmpanel')?.remove();
  const el = document.createElement('div');
  el.className = 'gmpanel';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const stars = [1, 2, 3, 4, 5].map((n) => `<div class="gmrow"><b class="gmstars">${'★'.repeat(n)}</b>${raidList().filter((r) => r.tier === n).map((r) => `<button data-raid="${r.id}">${esc(r.name)}<small>${AREA_NAME[r.area] || ''}</small></button>`).join('')}</div>`).join('');
  el.innerHTML = `<div class="gmbox"><div class="gmhead"><b><i class="gm">GM</i> Painel do GM</b><button class="gmx" data-x>✕</button></div>
    <div class="gmtabs"><button class="on" data-tab="boss">Chefes</button><button data-tab="raid">Raids</button><button data-tab="set">Conjuntos</button></div>
    <div class="gmbody" data-p="boss">${G.natal?.on ? '<button data-natal class="gmall">🎄 Chefe de Natal agora<small>nasce num lugar aleatório e avisa todo mundo</small></button>' : ''}${bossList().map((b) => `<button data-boss="${b.type}">${esc(b.name)}<small>Nv ${b.level}</small></button>`).join('')}</div>
    <div class="gmbody hidden" data-p="raid"><div class="gmquick">${[1, 2, 3, 4, 5].map((n) => `<button data-stars="${n}">${'★'.repeat(n)} aleatória</button>`).join('')}</div>${stars}</div>
    <div class="gmbody hidden" data-p="set">
      <div class="gmrow"><b class="gmstars">${esc(ITEM_SETS.prece.name)} — cura os aliados do time ao beber poção de vida</b></div>
      <div class="gmquick gmrar">${RARITIES.map((r) => `<button data-rar="${r.id}" class="${r.id === 'lendario' ? 'on' : ''}" style="--rc:${r.color}">${esc(r.name)}</button>`).join('')}</div>
      <div class="gmquick gmlvl">${[1, 14, 50, 100].map((l) => `<button data-lvl="${l}">Nível ${l}</button>`).join('')}<button data-lvl="0" class="on">Meu nível</button></div>
      <button data-piece="all" class="gmall">Conjunto completo (${ITEM_SETS.prece.pieces} peças da sua classe)<small>vai direto para a bolsa</small></button>
      ${Object.entries(ITEM_SETS.prece.bases).flatMap(([s, ids]) => ids.map((id) => `<button data-piece="${id}">${esc(ITEM_BASES[id].name)}<small>${esc(SLOT_NAMES[s] || s)}</small></button>`)).join('')}
      <div class="gmrow"><b class="gmstars">🎄 ${esc(ITEM_SETS.natal.name)} — congela os inimigos em volta de quem você acerta (gasta mana)</b></div>
      <button data-piece="all" data-set="natal" class="gmall">Conjunto natalino completo (${ITEM_SETS.natal.pieces} peças)<small>vai direto para a bolsa</small></button>
      ${Object.entries(ITEM_SETS.natal.bases).flatMap(([s, ids]) => ids.map((id) => `<button data-piece="${id}" data-set="natal">${esc(ITEM_BASES[id].name)}<small>${esc(SLOT_NAMES[s] || s)}</small></button>`)).join('')}
    </div>
    <div class="gmmsg"></div></div>`;
  let setRar = 'lendario', setLvl = 0;
  document.body.appendChild(el);
  const msg = el.querySelector('.gmmsg'), say = (t) => { msg.textContent = t; };
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) { if (e.target === el) el.remove(); return; }
    if (b.dataset.x !== undefined) { el.remove(); return; }
    if (b.dataset.tab) { el.querySelectorAll('.gmtabs button').forEach((x) => x.classList.toggle('on', x === b)); el.querySelectorAll('.gmbody').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== b.dataset.tab)); return; }
    G.audio?.play?.('ui');
    if (b.dataset.rar) { setRar = b.dataset.rar; el.querySelectorAll('.gmrar button').forEach((x) => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.lvl) { setLvl = +b.dataset.lvl; el.querySelectorAll('.gmlvl button').forEach((x) => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.piece) { say(giveSetPieces(G, b.dataset.piece === 'all' ? 'all' : [b.dataset.piece], setRar, setLvl || G.state.player.level, b.dataset.set || 'prece')); return; }
    if (b.dataset.natal !== undefined) { const r = natalNow(G); say(r); if (/apareceu/.test(r)) setTimeout(() => el.remove(), 350); return; }
    if (b.dataset.boss) { const r = spawnBoss(G, b.dataset.boss); say(r); if (/chamado/.test(r)) setTimeout(() => el.remove(), 350); }
    else if (b.dataset.raid) { const r = openRaid(G, b.dataset.raid); say(r); if (/aberta/.test(r)) setTimeout(() => el.remove(), 350); }
    else if (b.dataset.stars) { const id = raidByStars(G, +b.dataset.stars); const r = id ? openRaid(G, id) : 'Não existe raid com essas estrelas.'; say(r); if (/aberta/.test(r)) setTimeout(() => el.remove(), 350); }
  });
  return el;
}
