class_name Fantasma
extends Node3D
## Outro jogador (web ou Godot), desenhado a partir da presença — porte dos "fantasmas" de net.js:
## posição com previsão curta, giro suave, animação pela ação ('pa' na hora ou o campo "a" da presença).

const R := preload("res://scripts/mundo/ruido.gd")

var jogo
var peer := ""
var pr: Dictionary = {}
var heroi: Heroi3D
var pos := Vector3.ZERO
var yaw := 0.0
var vx := 0.0
var vz := 0.0
var _lx = null
var _lz := 0.0
var _lt := 0.0
var act = null
var act_from := -9.0
var last_act = null
var act_t := 0.0
var dead := 0.0
var nome: Label3D
var key := ""
var tempo := 0.0

func _init(j, id: String, p: Dictionary) -> void:
	jogo = j
	peer = id
	pr = p
	name = "jogador_" + id
	pos = Vector3(Dados.n(p.get("x")), Dados.n(p.get("y")), Dados.n(p.get("z")))
	yaw = Dados.n(p.get("r"))
	_montar()

func _montar() -> void:
	if heroi:
		heroi.queue_free()
	var gd := "F" if pr.get("gd") == "F" else "M"
	var sk: String = pr.sk if typeof(pr.get("sk")) == TYPE_STRING else "campones"
	heroi = Heroi3D.new(str(pr.c), gd, sk)
	var w = pr.get("w")
	heroi.equipar(str(w) if w else ("espada" if pr.c == "guerreiro" else ("arco" if pr.c == "arqueiro" else "varinha")))
	add_child(heroi)
	key = str(pr.get("w", "")) + str(pr.get("sk", "")) + str(pr.get("gd", ""))
	if nome == null:
		nome = Label3D.new()
		nome.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		nome.font_size = 44
		nome.pixel_size = 0.006
		nome.outline_size = 10
		nome.position.y = 2.95
		add_child(nome)
	nome.text = "%s · Nv %d" % [str(pr.get("n", "Viajante")).left(16), int(Dados.n(pr.get("l"), 1))]

func receber(p: Dictionary, agora: float) -> void:
	var kx := Dados.n(p.get("x"))
	var kz := Dados.n(p.get("z"))
	if _lx == null or _lx != kx or _lz != kz:
		var dtp := clampf(agora - _lt, 0.02, 0.5)
		if _lx != null:
			var nvx: float = (kx - _lx) / dtp
			var nvz: float = (kz - _lz) / dtp
			var sp := Vector2(nvx, nvz).length()
			vx = nvx if sp < 30.0 else 0.0
			vz = nvz if sp < 30.0 else 0.0
		_lx = kx
		_lz = kz
		_lt = agora
	pr = p
	tempo = agora
	var k := str(p.get("w", "")) + str(p.get("sk", "")) + str(p.get("gd", ""))
	if k != key:
		_montar()
	nome.text = "%s · Nv %d" % [str(p.get("n", "Viajante")).left(16), int(Dados.n(p.get("l"), 1))]

func acao_rede(a: String, dur: float, v: int, agora: float) -> void:
	act = { name = a, t = 0.0, dur = dur, v = v }
	act_from = agora

func atualizar(dt: float, eu) -> void:
	tempo += dt
	var vis: bool = str(pr.get("ar", "world")) == eu.area and Vector2(pos.x - eu.pos.x, pos.z - eu.pos.z).length() < 85.0
	visible = vis
	var age := minf(0.15, tempo - _lt)
	var moving := Dados.n(pr.get("m")) > 0.05
	var tx := Dados.n(pr.get("x")) + (vx * age if moving else 0.0)
	var tz := Dados.n(pr.get("z")) + (vz * age if moving else 0.0)
	var k := 1.0 - exp(-14.0 * dt)
	if Vector2(tx - pos.x, tz - pos.z).length() > 12.0:
		pos.x = tx
		pos.z = tz
	pos.x += (tx - pos.x) * k
	pos.z += (tz - pos.z) * k
	pos.y += (Dados.n(pr.get("y")) - pos.y) * k
	position = pos
	if not vis:
		return
	yaw = R.damp_angle(yaw, Dados.n(pr.get("r")), 12, dt)
	rotation.y = yaw
	var st := { move = Dados.n(pr.get("m")), swim = Dados.n(pr.get("sw")) }
	if act:
		act.t += dt
		st.action = act.name
		st.p = minf(1.0, act.t / act.dur)
		st.variant = act.v
		if act.t >= act.dur:
			act = null
			act_from = tempo
	else:
		var a = pr.get("a")
		var ac = null if (a in ["run", "idle"] or tempo - act_from < 0.6) else a
		if ac != last_act:
			last_act = ac
			act_t = 0.0
		act_t += dt
		if ac:
			st.action = ac
			st.p = minf(1.0, act_t / 0.45)
	dead = minf(1.0, dead + dt * 2.0) if Dados.n(pr.get("d")) > 0.0 else 0.0
	st.dead = dead
	heroi.atualizar(st, dt)
