import * as THREE from 'three';
import { SKINS, WEAPON_FX, ACHIEVEMENTS } from '../config/cosmetics.js';
import { DIAMONDS } from '../config/monetization.js';
import { applyOutfit } from '../engine/outfits.js';
import { HERO_SKINS, skuOf } from '../config/heroskins.js';

// skins dos heróis (modelos 3D): a padrão é grátis, as outras na Loja de Diamantes
const HERO_SKIN_SET = Object.fromEntries(Object.entries(HERO_SKINS).map(([id, s]) => [id, {
  ...s, hero: true, unlock: s.price > 0 ? { type: 'premium', sku: skuOf(id) } : { type: 'free' },
}]));
// quem tinha comprado um visual antigo ganha uma skin nova parecida
// skins antigas compradas antes dos heróis 3D: valem a roupa nova equivalente e a cor (igual ao servidor)
const LEGACY = { skin_rubi: ['nobre'], skin_geada: ['mago', 'mago_3'], skin_abismo: ['mago', 'mago_2'], skin_jade: ['patrulheiro', 'patrulheiro_3'], skin_dragao: ['cavaleiro', 'cavaleiro_2'] };
export const COSMETIC_SETS = { skin: HERO_SKIN_SET, fx: WEAPON_FX }; // (auras removidas)
const DEFAULTS = { skin: 'campones', fx: 'nenhum' };

// Aplica as cores de um visual a um modelo de herói (também usado nos outros jogadores).
export function applySkin(rig, skinId, gender) {
  if (rig.kind === 'skinhero') { rig.setLook({ g: gender || rig.look?.g || 'M', skin: HERO_SKINS[skinId] ? skinId : 'campones' }); return; }
  const s = SKINS[skinId];
  if (!rig.base) rig.base = { pants: rig.M.pants.color.clone(), cape: rig.M.cape?.color.clone() };
  if (rig.skinId !== skinId) { rig.skinId = skinId; applyOutfit(rig, skinId, s?.colors); } // traje de verdade (chapéu, ombreiras, capa…)
  if (!s || !s.colors) {
    rig.M.pants.color.copy(rig.base.pants);
    if (rig.M.cape && rig.base.cape) rig.M.cape.color.copy(rig.base.cape);
    return;
  }
  const c = s.colors;
  rig.M.tunic.color.set(c.tunic); rig.M.pants.color.set(c.pants); rig.M.trim.color.set(c.trim);
  if (rig.M.cape) rig.M.cape.color.set(c.cape);
}

// Partículas de efeito de arma (visuais apenas)
// fx de arma: sai da arma INTEIRA (ponto sorteado entre o cabo e a ponta) + brilho da cor na própria arma
const _v = new THREE.Vector3();
export function weaponPoint(weapon, out = _v) {
  const L = weapon?.userData?.fxLine;
  if (!L) return weapon ? weapon.localToWorld(out.copy(weapon.userData.tip || out.set(0, 0, 0.6))) : null;
  return weapon.localToWorld(out.lerpVectors(L[0], L[1], Math.random()));
}
export function tintWeapon(weapon, fxId) {
  if (!weapon) return;
  const fx = WEAPON_FX[fxId];
  if (weapon.userData.fxTint === (fx?.color ? fxId : null)) return;
  weapon.userData.fxTint = fx?.color ? fxId : null;
  weapon.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.isMeshBasicMaterial) return;
    const mt = m.material;
    if (!mt.userData.em0) mt.userData.em0 = mt.emissive ? mt.emissive.clone() : null;
    if (!mt.emissive) return;
    if (fx?.color) mt.emissive.set(fx.color[0]).multiplyScalar(0.42); else if (mt.userData.em0) mt.emissive.copy(mt.userData.em0);
  });
}
// mv: { moving, yaw, rate } — andando, correndo ou atacando, a aura sai das COSTAS do personagem (rastro);
// parado, fica em volta dele (e o que cai de cima cai pela metade). rate < 1 = menos partículas (outros jogadores).
export function emitCosmetics(G, pos, weapon, fxId, auraId, t, dt, mv = null) {
  const rate = mv?.rate ?? 1;
  const fx = WEAPON_FX[fxId];
  if (fx?.color && weapon) {
    tintWeapon(weapon, fxId);
    const n = Math.min(3, Math.floor(dt * 30 * rate + Math.random()));
    for (let i = 0; i < n; i++) {
      const p = weaponPoint(weapon), c = fx.color[Math.random() < 0.55 ? 0 : 1], r = Math.random();
      if (fxId === 'brasas') G.fx.emit(p.x, p.y, p.z, (r - 0.5) * 0.5, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5, c, 0.2 + r * 0.14, 0.6, -1.6, 1);
      else if (fxId === 'trovao') G.fx.emit(p.x, p.y, p.z, (r - 0.5) * 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 5, c, 0.16 + r * 0.1, 0.16, 0, 6);
      else if (fxId === 'geada') G.fx.emit(p.x, p.y, p.z, (r - 0.5) * 0.3, -0.25, (Math.random() - 0.5) * 0.3, c, 0.2 + r * 0.12, 0.9, 0.4, 0.5);
      else if (fxId === 'ouro') G.fx.emit(p.x, p.y, p.z, (r - 0.5) * 0.4, 0.35, (Math.random() - 0.5) * 0.4, r < 0.2 ? 0xffffff : c, r < 0.2 ? 0.34 : 0.2, 0.7, 0, 1);
      else G.fx.emit(p.x, p.y, p.z, (r - 0.5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, c, 0.22 + r * 0.12, 0.55, 0.1, 1);
    }
  } else if (weapon?.userData?.fxTint) tintWeapon(weapon, 'nenhum');
  // (as auras saíram do jogo na v0.9.92)
}

export class Cosmetics {
  constructor(G) {
    this.G = G;
    const w = G.state.world;
    w.cosmetics = Object.assign({ ...DEFAULTS, owned: [], achievements: [] }, w.cosmetics || {});
    this.data = w.cosmetics;
    if (LEGACY[this.data.skin]) this.data.skin = LEGACY[this.data.skin].at(-1); // skin antiga comprada: veste a equivalente nova
    if (!HERO_SKIN_SET[this.data.skin]) this.data.skin = 'campones'; // visuais antigos (boneco antigo) viram a roupa padrão
    this.checkT = 1;
  }
  gender() { return this.G.state?.player?.look?.g === 'F' ? 'F' : 'M'; }
  // a roupa existe para o gênero do personagem?
  fits(def) { return !def.hero || def.g.includes(this.gender()); }

  equipped(kind) { return this.data[kind] || DEFAULTS[kind]; }

  isUnlocked(def) {
    const u = def.unlock;
    if (u.type === 'free') return true;
    if (this.G.saver?.serverGm || this.G.economy?.owner) return true; // GMs (e o dono do jogo na página do Claude): todos os visuais liberados — só para eles
    if (u.type === 'achievement') return this.data.achievements.includes(u.id);
    if (u.type === 'premium') {
      if (this.data.owned.includes(u.sku) || this.G.economy?.ownsSku(u.sku)) return true;
      for (const [old, ids] of Object.entries(LEGACY)) if (ids.some((id) => u.sku === skuOf(id)) && (this.data.owned.includes(old) || this.G.economy?.ownsSku(old))) return true;
      return false;
    }
    return false;
  }
  // cor extra: precisa ter a roupa base
  needsBase(def) { return def.requires && !this.isUnlocked(HERO_SKIN_SET[def.requires]) ? HERO_SKIN_SET[def.requires] : null; }

  lockText(def) {
    const u = def.unlock;
    if (u.type === 'achievement') { const a = ACHIEVEMENTS[u.id]; return `Conquista “${a.name}”: ${a.desc}`; }
    if (u.type === 'premium') { const b = this.needsBase(def); return b ? `Cor extra: compre antes a roupa ${b.name}` : `${DIAMONDS.prices[u.sku] || '?'} 💎 na Loja de Diamantes`; }
    return '';
  }

  equip(kind, id) {
    const def = COSMETIC_SETS[kind][id];
    if (!def || !this.isUnlocked(def) || !this.fits(def)) return false;
    this.data[kind] = id;
    this.apply();
    this.G.saver.requestSave('aparência');
    return true;
  }

  apply() {
    const rig = this.G.player?.rig; if (!rig) return;
    let id = this.equipped('skin'); if (!this.fits(HERO_SKIN_SET[id] || {})) id = 'campones';
    applySkin(rig, id, this.gender());
  }

  // Visuais premium são comprados com diamantes (ver game/economy.js). A compra vale para a conta toda.
  async purchase(sku) { return this.G.economy.buyWithDiamonds(sku); }

  // compras com diamantes (da conta) liberam o visual em qualquer personagem
  syncPremium() {
    const E = this.G.economy;
    if (!E) return;
    for (const x of E.spent) if (!this.data.owned.includes(x.sku)) this.data.owned.push(x.sku);
  }

  unlocksFor(achId) {
    const out = [];
    for (const [kind, set] of Object.entries(COSMETIC_SETS)) for (const [id, d] of Object.entries(set)) if (d.unlock.type === 'achievement' && d.unlock.id === achId) out.push({ kind, id, name: d.name });
    return out;
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 2;
      for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
        if (this.data.achievements.includes(id)) continue;
        let ok = false;
        try { ok = a.check(G.state); } catch { ok = false; }
        if (!ok) continue;
        this.data.achievements.push(id);
        const un = this.unlocksFor(id);
        G.ui.banner('Conquista: ' + a.name, un.length ? `Desbloqueado: ${un.map((u) => u.name).join(', ')} (Aparência)` : a.desc, '#5ef0ff');
        G.audio.play('discover');
        G.net?.announce(`conquistou “${a.name}”!`);
        G.saver.requestSave('conquista');
        G.ui.refreshHud();
        break;
      }
    }
    if (P.alive && P.area) {
      const fxOn = WEAPON_FX[this.equipped('fx')]?.color;
      if (fxOn) P.rig.root.updateMatrixWorld(true);
      const moving = (P.anim.move || 0) > 0.12 || !!P.action || !!P.moveAction || P.anim.combat > 0.5;
      this._mv = this._mv || {}; this._mv.moving = moving; this._mv.yaw = P.yaw; this._mv.rate = 1;
      emitCosmetics(G, P.pos, P.rig.weapon, this.equipped('fx'), null, G.time.t, dt, this._mv);
    }
  }
}

export const _tmp = new THREE.Vector3();
