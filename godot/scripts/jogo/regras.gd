class_name Regras
## Fórmulas do jogo web portadas (src/core/progression.js e src/core/stats.js), com os números de dados/jogo.json.

static func B() -> Dictionary:
	return Dados.balance

static func rucoy_total(level: float) -> float:
	return pow(level, 3.0 + level / 1000.0)

static func xp_to_next(level: int) -> float:
	if level >= int(B().maxLevel):
		return INF
	return maxf(5.0, roundf((rucoy_total(level + 1) - rucoy_total(level)) * float(B().xpCurveMult)))

static func mob_base_xp(level: float) -> float:
	return 2.0 * level + 0.012 * level * level

static func level_gap_factor(enemy_level: float, player_level: float) -> float:
	var g: Dictionary = B().xpGap
	var below := player_level - enemy_level - float(g.free)
	return 1.0 if below <= 0.0 else maxf(float(g.min), 1.0 - float(g.perLevel) * below)

static func toughness(def: Dictionary) -> float:
	var t := clampf(Dados.n(def.get("xp"), 55.0) / 55.0, 0.5, 8.0)
	return t * (float(B().xp.eliteMult) if def.get("elite", false) else 1.0) * (float(B().xp.eventBossMult) if def.get("eventBoss", false) else 1.0)

## JS Math.round: arredonda .5 para cima (a Godot arredonda para longe do zero; só muda em negativos)
static func jround(v: float) -> float:
	return floorf(v + 0.5)

static func xp_for_kill(def: Dictionary, enemy_level: int, player_level: int) -> float:
	var L := maxi(1, enemy_level)
	if def.get("boss", false):
		return jround(xp_to_next(L) * float(B().xp.bossLevels))
	return maxf(1.0, jround(mob_base_xp(L) * float(B().xp.mobMult) * toughness(def) * level_gap_factor(L, player_level)))

static func item_tier(level: int) -> int:
	return int(floor(maxf(1, level) / 10.0)) # (não usado no Vale)

static func enemy_armor(def: Dictionary, level: int) -> float:
	var A: Dictionary = B().armor
	var tough := float(A.base) + Dados.n(def.get("def"), 0.0) / float(A.defDiv)
	return jround(maxf(1, level) * float(A.perLevel) * tough * (float(A.boss) if def.get("boss", false) else 1.0) * 10.0) / 10.0

static func boss_hp(level: int, def: Dictionary) -> float:
	var L := float(maxi(1, level))
	return jround((8000.0 + 900.0 * L * (1.0 + L / 60.0)) * (0.6 if def.get("eventBoss", false) and not def.get("worldBoss", false) else 1.0) * Dados.n(def.get("hpScale"), 1.0))

static func enemy_stats(def: Dictionary, level: int) -> Dictionary:
	var M: Dictionary = B().enemyMult
	var big: bool = def.get("boss", false) or def.get("miniboss", false)
	var mh: float = float(M.bossHp) if big else (float(M.eliteHp) if def.get("elite", false) else float(M.hp))
	var md: float = float(M.bossDmg) if big else (float(M.eliteDmg) if def.get("elite", false) else float(M.dmg))
	var s: Dictionary = B().enemyScale
	var armor := enemy_armor(def, level)
	if def.get("boss", false):
		return { maxHp = jround(float(B().guardianHp)), dmg = Dados.n(def.dmg) * md, armor = armor }
	if def.has("fixedHp"):
		return { maxHp = float(def.fixedHp), dmg = Dados.n(def.dmg) * md * (1.0 + float(s.dmg) * (level - 1)), armor = armor }
	var hp := boss_hp(level, def) if big or def.get("eventBoss", false) else jround(Dados.n(def.hp) * mh * (1.0 + float(s.hp) * (level - 1)))
	return { maxHp = hp, dmg = Dados.n(def.dmg) * md * (1.0 + float(s.dmg) * (level - 1)), armor = armor }

static func roll_damage(power: float, mult: float, crit_chance: float, crit_mult: float) -> Dictionary:
	var v := 1.0 + (randf() * 2.0 - 1.0) * float(B().damageVariance)
	var amount := power * mult * v
	var crit := randf() < crit_chance
	if crit:
		amount *= crit_mult
	return { amount = amount, crit = crit }

static func armor_mitigate(amount: float, power: float, armor: float) -> float:
	if armor <= 0.0:
		return maxf(float(B().minDamage), jround(amount))
	var p := maxf(1.0, power)
	return maxf(float(B().minDamage), jround(amount * p / (p + armor)))

## status do herói (nível 1..200 com o equipamento inicial, calculados pelo próprio jogo web)
static func stats_de(cls: String, level: int) -> Dictionary:
	var arr: Array = Dados.J.statsPorNivel[cls]
	return arr[clampi(level, 1, arr.size()) - 1]
