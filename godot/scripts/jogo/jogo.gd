class_name Jogo
extends Node3D
## Partida: Vale + céu + herói + câmera + rede + HUD. Criado pela tela de entrada (scripts/ui/entrada.gd).

const R := preload("res://scripts/mundo/ruido.gd")

var mundo: Mundo
var ceu: Ceu
var camera: Camera3D
var cam: CameraRig
var jogador: Jogador
var rede: Rede
var hud: Hud
var toque := false
var tempo := 0.0
var bot: Callable    # testes: substitui os controles (ver testes/bot_rede.gd)
var hora_fixa := -1.0

func iniciar(nome: String, classe: String, genero: String, servidor: String, sv: int) -> void:
	name = "Jogo"
	toque = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
	ceu = Ceu.new()
	add_child(ceu)
	mundo = Mundo.new()
	add_child(mundo)
	mundo.montar()
	camera = Camera3D.new()
	camera.fov = 55.0
	camera.near = 0.3
	camera.far = 900.0
	add_child(camera)
	camera.make_current()
	cam = CameraRig.new(camera)
	rede = Rede.new(self)
	add_child(rede)
	jogador = Jogador.new(self, nome, classe, genero)
	add_child(jogador)
	var sp: Dictionary = Dados.mundo.WORLD.spawn
	jogador.teleport(float(sp.x), float(sp.z))
	cam.snap(jogador.pos)
	var cl := CanvasLayer.new()
	add_child(cl)
	hud = Hud.new(self)
	cl.add_child(hud)
	# convidado: id de personagem próprio deste aparelho (a conta entra na próxima parte)
	var cid: String = Dados.get_cfg("char_id", "")
	if cid == "":
		cid = "g" + str(Time.get_unix_time_from_system()).md5_text().left(12)
		Dados.set_cfg("char_id", cid)
		Dados.salvar_cfg()
	rede.char_id = cid + "_" + classe
	if servidor != "":
		rede.conectar(servidor, sv)
	else:
		rede.status = "offline"

func aviso(t: String) -> void:
	if hud:
		hud.aviso(t)

## recompensa do abate (game.js onEnemyKilled: XP = xpForKill / divisão do time)
func ao_matar(e: Inimigo) -> void:
	var xp := maxf(1.0, Regras.xp_for_kill(e.def, e.level, jogador.level))
	var ganhos := jogador.ganhar_xp(xp)
	hud.numero(e.pos + Vector3(0, 2.2 * e.base_scale, 0), "+%d XP" % int(xp), false)
	print("ELDORIA godot: abate ", e.tipo, " nv ", e.level, " +", xp, " XP (nível ", jogador.level, ")")
	if ganhos:
		aviso("Nível %d!" % jogador.level)
		rede.level_up(jogador.nome, jogador.level)

func _process(dt: float) -> void:
	if jogador == null:
		return
	dt = minf(dt, 0.1)
	tempo += dt
	var ent: Dictionary = bot.call(dt) if bot.is_valid() else hud.ler()
	# direção relativa à câmera (game.js moveDir)
	var f := cam.forward()
	var r := cam.right()
	var mv: Vector2 = ent.mv
	var dir := Vector2(f.x * mv.y + r.x * mv.x, f.y * mv.y + r.y * mv.x)
	if dir.length() > 1.0:
		dir = dir.normalized()
	if ent.has("dir"):
		dir = ent.dir
	jogador.atualizar(dt, dir.normalized() if dir.length() > 0.001 else Vector2.ZERO, ent.mag, ent.correr, ent.atacar)
	cam.update(dt, jogador.pos, mundo, ent)
	var tod := hora_fixa if hora_fixa >= 0.0 else rede.hora_do_dia()
	ceu.atualizar(dt, tod, jogador.pos, camera)
	RenderingServer.global_shader_parameter_set("eld_time", tempo)
