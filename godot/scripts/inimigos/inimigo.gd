class_name Inimigo
extends Node3D
## Monstro vindo da rede (réplica): o anfitrião simula; aqui só segue o estado (porte de Enemy.netApply/
## netUpdate/sync de src/game/enemy.js) e anima o modelo do jogo (slime: anim.js → slime()).

const R := preload("res://scripts/mundo/ruido.gd")
const JUICE_T := 0.3

var jogo
var tipo := ""
var def: Dictionary
var level := 1
var nid := 0
var area := "world"
var stats: Dictionary
var hp := 1.0
var radius := 0.5
var base_scale := 1.0
var yaw := 0.0
var pos := Vector3.ZERO
var dead := false
var dead_t := 0.0
var removed := false
var state := "idle"
var net_s = null
var net_seen := -9.0
var net_init := false
var net_act = null
var net_p := 0.0
var pred_t := 0.0
var local_hit := -999.0
var rewarded := false
var flash_t := 0.0
var juice_t := 0.0
var hurt_t := 0.0
var _nh = null
# modelo
var rig: Node3D
var body: Node3D
var puddle: Node3D
var top: Node3D
var mouth: Node3D
var core: Node3D
var eyes: Array = []
var mats: Array = []
var anim := { t = 0.0, move = 0.0, action = null, p = 0.0, hurt = 0.0, dead = 0.0, alert = 0.0, variant = 0 }
var ph := 0.0
var blink_t := 2.0
var placa: Label3D

func _init(j, t: String, lvl: int, id: int, x: float, z: float, ar: String) -> void:
	jogo = j
	tipo = t
	def = Dados.inimigos[t]
	level = lvl
	nid = id
	area = ar
	stats = Regras.enemy_stats(def, level)
	hp = stats.maxHp
	var size := Dados.n(def.get("size"), 1.0)
	var model: String = def.get("model", "slime")
	radius = 0.7 * size if model == "wolf" else (0.75 * size if model in ["golem", "treant"] else (0.42 * size if model == "titan" else (0.62 * size if model == "quad" else 0.5 * size)))
	base_scale = size
	pos = Vector3(x, jogo.mundo.ground_height(x, z), z)
	name = "mob_%d" % id
	_montar(model)

func _montar(model: String) -> void:
	var arq := "res://assets/inimigos/%s.glb" % tipo
	if not ResourceLoader.exists(arq) and model == "slime":
		arq = "res://assets/inimigos/slime.glb"
	if ResourceLoader.exists(arq):
		rig = (load(arq) as PackedScene).instantiate()
		Materiais.ajustar(rig)
	else:
		# modelo ainda não exportado para a Godot (próxima parte): cápsula na cor do monstro
		rig = Node3D.new()
		var m := MeshInstance3D.new()
		var c := CapsuleMesh.new()
		c.radius = 0.45
		c.height = 1.6
		m.mesh = c
		m.position.y = 0.8
		var mt := Materiais.from_key("eld;k=lam").duplicate()
		var col := Dados.cor_lin(def.get("color", 0x888888))
		mt.set_shader_parameter("tint", Vector3(col.r, col.g, col.b))
		m.material_override = mt
		rig.add_child(m)
	add_child(rig)
	body = rig.find_child("body", true, false)
	puddle = rig.find_child("puddle", true, false)
	top = rig.find_child("top", true, false)
	mouth = rig.find_child("mouth", true, false)
	core = rig.find_child("core", true, false)
	for i in 2:
		var e = rig.find_child("eyes_%d" % i, true, false)
		if e:
			eyes.append(e)
	# materiais próprios (o brilho de golpe e o aviso de ataque mudam a cor só deste monstro)
	for mi in rig.find_children("*", "MeshInstance3D", true, false):
		for si in mi.mesh.get_surface_count():
			var m = mi.get_surface_override_material(si) if mi.get_surface_override_material(si) else mi.material_override
			if m is ShaderMaterial:
				var d: ShaderMaterial = m.duplicate()
				if mi.material_override:
					mi.material_override = d
				else:
					mi.set_surface_override_material(si, d)
				mats.append(d)
	placa = Label3D.new()
	placa.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	placa.font_size = 40
	placa.pixel_size = 0.006
	placa.outline_size = 10
	placa.no_depth_test = false
	placa.fixed_size = false
	add_child(placa)
	_placa()
	blink_t = randf() * 3.0

func _placa() -> void:
	var nome: String = def.get("name", tipo)
	var frac := clampf(hp / maxf(1.0, stats.maxHp), 0.0, 1.0)
	var barra := ""
	if frac < 0.999 and not dead:
		var n := int(ceil(frac * 10))
		barra = "\n" + "■".repeat(n) + "□".repeat(10 - n)
	placa.text = "%s · Nv %d%s" % [nome, level, barra]
	placa.modulate = Color(1, 0.85, 0.85) if frac < 0.999 else Color(1, 1, 1)
	placa.position.y = 1.9 * base_scale + 0.4

func alive() -> bool:
	return not dead and not removed

## estado vindo do anfitrião (snapshot)
func net_apply(n: Dictionary, now: float) -> void:
	var prev = net_s
	if prev and now > net_seen:
		var dts := minf(0.5, now - net_seen)
		var vx: float = (n.x - prev.x) / dts
		var vz: float = (n.z - prev.z) / dts
		var ok := Vector2(vx, vz).length() < 25.0
		n.vx = vx if ok else 0.0
		n.vz = vz if ok else 0.0
	else:
		n.vx = 0.0
		n.vz = 0.0
	net_s = n
	net_seen = now
	if not net_init:
		net_init = true
		pos.x = n.x
		pos.z = n.z
		yaw = n.yaw

## dano do MEU golpe (previsto aqui; o valor vai para o anfitrião)
func take_damage(dmg: float, now: float) -> float:
	if dead:
		return -1.0
	if state == "return" or state == "spawn":
		return 0.0
	hp -= dmg
	flash_t = 0.12
	juice_t = JUICE_T
	local_hit = now
	pred_t = 0.8
	hurt_t = maxf(hurt_t, 0.12)
	if hp <= 0.0:
		hp = 0.0
		dead = true
		state = "dead"
		dead_t = 0.0
	_placa()
	return dmg

func net_update(dt: float, now: float) -> void:
	anim.t += dt
	flash_t = maxf(0.0, flash_t - dt)
	juice_t = maxf(0.0, juice_t - dt)
	hurt_t = maxf(0.0, hurt_t - dt)
	pred_t = maxf(0.0, pred_t - dt)
	var n = net_s
	if dead:
		dead_t += dt
		anim.dead = minf(1.0, dead_t / 0.7)
		if n and not n.dead and dead_t > 1.2 and now - net_seen < 0.6 and dead_t < 1.3:
			dead = false
			anim.dead = 0.0
			state = "chase"
		elif dead_t > 1.4:
			var k := maxf(0.0, 1.0 - (dead_t - 1.4) / 0.6)
			rig.scale = Vector3.ONE * (0.2 + 0.8 * k)
			if dead_t > 2.0 and not removed:
				removed = true
		_sync(dt, 0.0)
		return
	if n == null:
		_sync(dt, 0.0)
		return
	var spawn: float = n.spawn
	if spawn > 0.0:
		rig.scale = Vector3.ONE * maxf(0.01, 1.0 - spawn)
	elif state == "spawn":
		state = "idle"
	var k := 1.0 - exp(-16.0 * dt)
	var lead := minf(0.2, now - net_seen) + 0.05
	var moving: bool = not n.dead and n.st in ["chase", "attack", "special", "return", "flee", "patrol", "alert"]
	var tx: float = n.x + (n.vx * lead if moving else 0.0)
	var tz: float = n.z + (n.vz * lead if moving else 0.0)
	if Vector2(tx - pos.x, tz - pos.z).length() > 8.0:
		pos.x = tx
		pos.z = tz
	else:
		pos.x += (tx - pos.x) * k
		pos.z += (tz - pos.z) * k
	yaw = R.damp_angle(yaw, n.yaw, 12, dt)
	var nh: float = n.hp * stats.maxHp
	if _nh != null and nh < _nh - 0.5 and not n.dead and now - local_hit > 0.9:
		flash_t = 0.12
		juice_t = JUICE_T
	_nh = nh
	var hp0 := hp
	hp = nh if pred_t <= 0.0 else minf(hp, nh)
	if n.dead and not dead:
		dead = true
		state = "dead"
		dead_t = 0.0
	state = "dead" if dead else n.st
	net_act = n.act
	net_p = n.p
	if hp != hp0:
		_placa()
	_sync(dt, n.mv)

func _sync(dt: float, move: float) -> void:
	pos.y = jogo.mundo.ground_height(pos.x, pos.z)
	position = pos
	rotation.y = yaw
	var bs := base_scale
	var s := Vector3.ONE * bs
	if juice_t > 0.0 and not dead:
		var u := 1.0 - juice_t / JUICE_T
		var sq := sin(u * PI * 3.0) * (1.0 - u) * (1.0 - u) * 0.22
		s = Vector3(bs * (1.0 + sq * 0.75), bs * (1.0 - sq), bs * (1.0 + sq * 0.75))
	scale = s
	anim.move = move
	anim.hurt = hurt_t / 0.22
	anim.action = net_act
	anim.p = net_p
	if body:
		_slime(dt)
	var f := minf(1.0, flash_t / 0.1) if flash_t > 0.0 else 0.0
	for m in mats:
		m.set_shader_parameter("flash", Vector3(1, 1, 1))
		m.set_shader_parameter("flash_k", f * 0.95)

static func suave(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)

## porte de anim.js → slime()
func _slime(dt: float) -> void:
	var s := anim
	var w: float = s.move
	ph += dt * (4.0 + w * 5.0)
	var t: float = s.t
	var hop := maxf(0.0, sin(ph)) * w
	var sy := 1.0 + (hop - 0.3 * w) * 0.22 + sin(t * 3.2) * 0.03
	var sxz := 1.0 - (hop - 0.3 * w) * 0.11 - sin(t * 3.2) * 0.015
	var y := hop * 0.6
	var z := 0.0
	var mo := 0.05 + sin(t * 2.0) * 0.01
	var lean := 0.0
	var spin := 0.0
	if s.action == "attack":
		var p: float = s.p
		var v: int = s.variant
		if v % 3 == 1:
			if p < 0.6:
				var k := suave(p / 0.6); sy = 1.0 - 0.25 * k; sxz = 1.0 + 0.15 * k; spin = -0.6 * k; mo = 0.08
			else:
				var k := sin((p - 0.6) / 0.4 * PI); var q := (p - 0.6) / 0.4
				spin = -0.6 + q * (TAU + 0.6); sy = 1.0 + 0.15 * k; z = k * 0.5; y = k * 0.2; mo = 0.14 * k + 0.04
		elif v % 3 == 2:
			if p < 0.6:
				var k := suave(p / 0.6); sy = 1.0 - 0.45 * k; sxz = 1.0 + 0.3 * k; y = 0.0; mo = 0.04
			else:
				var q := (p - 0.6) / 0.4; var k := sin(q * PI)
				y = k * 1.1; z = q * 0.6; sy = 0.55 if q > 0.8 else 1.0 + 0.3 * k; sxz = 1.4 if q > 0.8 else 1.0 - 0.15 * k; mo = 0.16 * k + 0.04
		else:
			if p < 0.6:
				var k := suave(p / 0.6); sy = 1.0 - 0.4 * k; sxz = 1.0 + 0.28 * k; mo = 0.05 + 0.1 * k; lean = -0.15 * k; y = 0.0
			else:
				var k := sin((p - 0.6) / 0.4 * PI)
				sy = 1.0 + 0.4 * k; sxz = 1.0 - 0.18 * k; z = k * 0.8; y = k * 0.45; mo = 0.18 * k + 0.04; lean = 0.35 * k
	if s.alert > 0.0:
		sy *= 1.0 + 0.2 * s.alert; y += 0.2 * s.alert
	if s.hurt > 0.0:
		sy *= 1.0 - s.hurt * 0.3; sxz *= 1.0 + s.hurt * 0.22; mo = 0.14
	if s.dead > 0.0:
		var d := suave(s.dead); sy *= 1.0 - d * 0.88; sxz *= 1.0 + d * 0.7; y = 0.0; mo = 0.02
	body.scale = Vector3(sxz, sy, sxz)
	body.position = Vector3(0, y, z)
	body.rotation = Vector3(lean, spin, 0)
	if puddle:
		var ground := 1.0 - minf(1.0, y * 2.0)
		var ps := 1.45 * (0.6 + 0.4 * ground) / sxz
		puddle.scale = Vector3(ps, 0.16, ps)
		puddle.position.y = 0.05 - y / sy
	if top:
		top.position.z = -0.06 - (sy - 1.0) * 0.5
	if mouth:
		mouth.scale.y = mo
	if core:
		core.rotation.y += dt * 2.0
	blink_t -= dt
	var closed: bool = blink_t < 0.1 or s.dead > 0.3
	for e in eyes:
		e.scale.y = 0.15 if closed else (0.75 if s.action == "attack" else 1.0)
	if blink_t <= 0.0:
		blink_t = 1.5 + randf() * 3.0
