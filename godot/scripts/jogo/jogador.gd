class_name Jogador
extends Node3D
## O herói de quem joga: andar/correr (porte de player.js), golpe básico (skills.js doBasic + combat.js
## meleeArc/hitEnemy), dano recebido (combat.js hitPlayer), XP e nível (progression.js).

const R := preload("res://scripts/mundo/ruido.gd")

var jogo
var nome := "Viajante"
var cls := "guerreiro"
var genero := "M"
var skin := "campones"
var level := 1
var xp := 0.0
var cdef: Dictionary
var stats: Dictionary
var hp := 100.0
var pos := Vector3.ZERO
var yaw := 0.0
var vel := Vector3.ZERO
var area := "world"
var vivo := true
var nadando := false
var correndo := false
var acao = null            # { name, t, dur, slow, variant }
var anim := { move = 0.0, combat = 0.0, dead = 0.0, swim = 0.0 }
var cd_basic := 0.0
var combo := 0
var basic_count := 0
var heroi: Heroi3D
var radius := 0.5
var morto_t := 0.0
var combat_t := 0.0
var regen_acc := 0.0

func _init(j, n: String, c: String, g: String) -> void:
	jogo = j
	nome = n
	cls = c if Dados.classes.has(c) else "guerreiro"
	genero = "F" if g == "F" else "M"
	cdef = Dados.classes[cls]
	name = "jogador"
	stats = Regras.stats_de(cls, level)
	hp = stats.maxHp
	heroi = Heroi3D.new(cls, genero, skin)
	heroi.equipar(str(Dados.J.inicio[cls].w))
	add_child(heroi)

func teleport(x: float, z: float) -> void:
	pos = Vector3(x, jogo.mundo.ground_height(x, z), z)
	vel = Vector3.ZERO
	position = pos

func atualizar(dt: float, mv: Vector2, mag: float, correr: bool, atacar: bool) -> void:
	cd_basic = maxf(0.0, cd_basic - dt)
	combat_t = maxf(0.0, combat_t - dt)
	if not vivo:
		morto_t += dt
		anim.dead = minf(1.0, anim.dead + dt * 2.0)
		anim.move = 0.0
		heroi.atualizar({ dead = anim.dead }, dt)
		if morto_t > 4.0:
			_renascer()
		return
	# regeneração fora de combate (aproximação: regen por segundo do status)
	if combat_t <= 0.0 and hp < stats.maxHp:
		hp = minf(stats.maxHp, hp + float(stats.regen) * dt)
	if acao:
		acao.t += dt
		if acao.t >= acao.dur:
			acao = null
	var M = jogo.mundo
	var wl: float = M.water_y
	var depth: float = wl - M.ground_height(pos.x, pos.z)
	nadando = depth > 0.95
	var in_water: bool = M.in_water(pos.x, pos.z)
	var slow: float = (acao.slow if acao else 1.0) * (0.55 if nadando else (0.62 if in_water else 1.0))
	correndo = acao == null and mag > 0.2 and correr
	var sp: float = float(stats.moveSpeed) * slow * mag * (float(Dados.balance.runSpeed) if correndo else 1.0)
	vel.x = R.damp(vel.x, mv.x * sp, 14, dt)
	vel.z = R.damp(vel.z, mv.y * sp, 14, dt)
	var moved := Vector2(vel.x, vel.z).length()
	if moved > 0.05:
		var dist := moved * dt
		var n := clampi(ceili(dist / 0.5), 1, 60)
		var sx := vel.x * dt / n
		var sz := vel.z * dt / n
		var want := Vector2(sx, sz).length()
		for k in n:
			var px := pos.x
			var pz := pos.z
			var r: Dictionary = M.try_move(pos, sx, sz, radius, true)
			pos = r.pos
			if not r.ok or (n > 1 and Vector2(pos.x - px, pos.z - pz).length() < want * 0.7):
				break
		if mag > 0.1 and acao == null:
			yaw = R.damp_angle(yaw, atan2(mv.x, mv.y), 14, dt)
	var speed_frac := minf(1.35 if correndo else 1.0, moved / float(cdef.moveSpeed))
	var gh: float = M.ground_height(pos.x, pos.z)
	nadando = wl - gh > 0.95
	pos.y = R.damp(pos.y, wl - 0.95 if nadando else gh, 6.0 if nadando else 20.0, dt)
	anim.swim = R.damp(anim.swim, 1.0 if nadando else 0.0, 6.0 if nadando else 10.0, dt)
	anim.move = speed_frac
	anim.combat = R.damp(anim.combat, 1.0 if combat_t > 0.0 else 0.0, 5, dt)
	if atacar and cd_basic <= 0.0 and (acao == null or acao.t > acao.dur * 0.7):
		_basico()
	position = pos
	rotation.y = yaw
	var st := { move = anim.move, combat = anim.combat, swim = anim.swim }
	if acao:
		st.action = acao.name
		st.p = minf(1.0, acao.t / acao.dur)
		st.variant = acao.variant
	heroi.atualizar(st, dt)

func basic_cooldown() -> float:
	return float(cdef.basic.cd) / (float(stats.weaponSpd) * (1.0 + float(stats.aspd)))

func _alvo(alcance: float):
	var best = null
	var best_s := INF
	for e in jogo.rede.replicas.values():
		if not e.alive() or e.area != area:
			continue
		var d := Vector2(e.pos.x - pos.x, e.pos.z - pos.z).length()
		if d > alcance:
			continue
		var a := absf(R.angle_diff(yaw, atan2(e.pos.x - pos.x, e.pos.z - pos.z)))
		if a > 1.9 and d > 3.0:
			continue
		var s := d + a * 4.0
		if s < best_s and jogo.mundo.line_of_sight(pos.x, pos.z, e.pos.x, e.pos.z):
			best = e
			best_s = s
	return best

## golpe básico (skills.js doBasic)
func _basico() -> void:
	var b: Dictionary = cdef.basic
	cd_basic = basic_cooldown()
	basic_count += 1
	combat_t = 6.0
	var melee: bool = b.type == "melee"
	var tg = _alvo(float(b.range) + (3.4 if melee else 0.0))
	if tg:
		yaw = atan2(tg.pos.x - pos.x, tg.pos.z - pos.z)
	if melee:
		combo = (combo + 1) % int(b.comboEvery)
		var heavy := combo == 0
		var mult: float = float(b.mult) * (float(b.comboMult) if heavy else 1.0)
		var lunge := 0.0
		if tg:
			var d: float = Vector2(tg.pos.x - pos.x, tg.pos.z - pos.z).length() - tg.radius
			if d > float(b.range) * 0.75 and d < float(b.range) + 3.4:
				var need: float = d - float(b.range) * 0.55
				lunge = minf(0.2, need / 17.0)
				var dir := Vector2(tg.pos.x - pos.x, tg.pos.z - pos.z).normalized()
				vel = Vector3(dir.x, 0, dir.y) * (need / maxf(0.05, lunge))
		var dur := 0.44 / maxf(0.7, float(stats.weaponSpd) * (1.0 + float(stats.aspd))) + lunge
		var variant := 2 if heavy else basic_count % 2
		acao = { name = "slash", t = 0.0, dur = dur, slow = 0.5, variant = variant }
		jogo.rede.send_action("slash", dur, variant)
		var y0 := yaw
		await get_tree().create_timer(0.12 + lunge).timeout
		if not vivo:
			return
		var y := y0
		if tg and tg.alive():
			y = atan2(tg.pos.x - pos.x, tg.pos.z - pos.z)
			yaw = y
		_melee_arc(y, float(b.range), float(b.arc), mult, int(b.maxTargets))
	else:
		# classes de longe (parte 2: projéteis de verdade): por enquanto o tiro acerta o alvo após o voo
		var dur := 0.44 / maxf(0.7, float(stats.weaponSpd) * (1.0 + float(stats.aspd)))
		var nm := "cast" if cls == "mago" else "shoot"
		acao = { name = nm, t = 0.0, dur = dur, slow = 0.5, variant = 0 }
		jogo.rede.send_action(nm, dur, 0)
		if tg:
			var voo: float = Vector2(tg.pos.x - pos.x, tg.pos.z - pos.z).length() / float(b.get("speed", 30.0))
			await get_tree().create_timer(0.15 + voo).timeout
			if tg.alive():
				_acertar(tg, float(b.mult), Vector2(tg.pos.x - pos.x, tg.pos.z - pos.z).normalized())

## combat.js meleeArc
func _melee_arc(y: float, rng: float, arc_deg: float, mult: float, max_t: int) -> void:
	var half := arc_deg * PI / 360.0
	var hits := []
	for e in jogo.rede.replicas.values():
		if not e.alive() or e.area != area:
			continue
		var d := Vector2(e.pos.x - pos.x, e.pos.z - pos.z).length()
		if d > rng + 1.3 + e.radius:
			continue
		var a := atan2(e.pos.x - pos.x, e.pos.z - pos.z)
		var dy := absf(e.pos.y - pos.y)
		if dy > 1.6 + maxf(1.0, 1.0 * e.base_scale) * 0.5:
			continue
		if d > rng + e.radius + minf(1.3, dy * 0.55):
			continue
		if d > e.radius + 0.6 and absf(R.angle_diff(y, a)) > half + minf(0.35, dy * 0.12):
			continue
		if not jogo.mundo.line_of_sight(pos.x, pos.z, e.pos.x, e.pos.z):
			continue
		hits.append([d, e])
	hits.sort_custom(func(p, q): return p[0] < q[0])
	for h in hits.slice(0, max_t):
		var e = h[1]
		_acertar(e, mult, Vector2(e.pos.x - pos.x, e.pos.z - pos.z).normalized())

## combat.js hitEnemy (o monstro é do anfitrião: o dano vai para ele)
func _acertar(e, mult: float, dir: Vector2) -> void:
	if not e.alive():
		return
	var power := float(stats.power)
	var r := Regras.roll_damage(power, mult, minf(0.95, float(stats.crit)), float(stats.critMult))
	var LD: Dictionary = Dados.balance.levelDiff
	var diff: int = e.level - level
	var amount: float = r.amount * (maxf(float(LD.playerDmgMin), 1.0 - float(LD.playerDmgPerLevel) * diff) if diff > 0 else 1.0)
	var dmg := Regras.armor_mitigate(amount, power, e.stats.armor)
	var got: float = e.take_damage(dmg, jogo.rede.tempo)
	if got < 0.0:
		return
	if got > 0.0:
		jogo.rede.send_damage(e, got, { dirX = dir.x, dirZ = dir.y })
	jogo.hud.numero(e.pos + Vector3(0, 1.6 * e.base_scale, 0), str(int(got)) if got > 0.0 else "Evadiu", r.crit)
	combat_t = 6.0

## combat.js hitPlayer (golpe de monstro vindo do anfitrião)
func levar_golpe(raw: float, quem: String, lvl: int) -> void:
	if not vivo:
		return
	var LD: Dictionary = Dados.balance.levelDiff
	var v := 1.0 + (randf() * 2.0 - 1.0) * 0.1
	var diff := lvl - level
	var lm := minf(float(LD.enemyDmgMax), 1.0 + float(LD.enemyDmgPerLevel) * diff) if diff > 0 else maxf(float(LD.lowerEnemyDmgMin), 1.0 + float(LD.lowerEnemyDmgPerLevel) * diff)
	var amount := raw * v * lm
	var red := float(stats.def) / (float(stats.def) + float(stats.dk))
	var dmg := maxf(float(Dados.balance.minDamage), Regras.jround(amount * (1.0 - red)))
	hp -= dmg
	combat_t = 6.0
	jogo.hud.numero(pos + Vector3(0, 2.4, 0), str(int(dmg)), false, true)
	if hp <= 0.0:
		hp = 0.0
		vivo = false
		morto_t = 0.0
		acao = null
		jogo.aviso("Você foi derrotado por %s." % quem)

func _renascer() -> void:
	vivo = true
	anim.dead = 0.0
	hp = stats.maxHp
	var sp: Dictionary = Dados.mundo.WORLD.spawn
	teleport(float(sp.x), float(sp.z))

## progression.js addXp
func ganhar_xp(qtd: float) -> int:
	var ganhos := 0
	xp += maxf(0.0, roundf(qtd))
	while xp >= Regras.xp_to_next(level):
		xp -= Regras.xp_to_next(level)
		level += 1
		ganhos += 1
	if ganhos:
		stats = Regras.stats_de(cls, level)
		hp = stats.maxHp
	return ganhos
