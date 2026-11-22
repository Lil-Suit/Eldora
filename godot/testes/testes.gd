extends Node
## Testes sem tela: godot --headless --path godot -- --teste=terreno

func rodar(t: String, args: PackedStringArray) -> void:
	if t == "luz":
		_luz()
		return
	if t == "fotojogo":
		_fotojogo(args)
		return
	if t == "foto":
		var F: Node3D = load("res://testes/foto.gd").new()
		add_child(F)
		F.rodar(args)
		return
	var ok := false
	match t:
		"terreno": ok = teste_terreno()
		"regras": ok = teste_regras()
	print("TESTE ", t, ": ", "OK" if ok else "FALHOU")
	get_tree().quit(0 if ok else 1)

func teste_terreno() -> bool:
	var T := Terreno.new()
	var t0 := Time.get_ticks_msec()
	T.gerar(false)
	print("terreno calculado em ", Time.get_ticks_msec() - t0, " ms")
	var ref: Array = JSON.parse_string(FileAccess.get_file_as_string("res://testes/terreno_ref.json"))
	var maxh := 0.0
	var maxc := 0.0
	for r in ref:
		var V := T.N + 1
		var i := int(round((float(r[0]) + T.half) / T.step))
		var j := int(round((float(r[1]) + T.half) / T.step))
		var k := j * V + i
		maxh = maxf(maxh, absf(T.h[k] - float(r[2])))
		var c: Color = T.cores[k]
		maxc = maxf(maxc, maxf(absf(c.r - float(r[3])), maxf(absf(c.g - float(r[4])), absf(c.b - float(r[5])))))
	print("amostras ", ref.size(), " · maior diferença de altura ", maxh, " m · de cor ", maxc)
	T.salvar("res://dados/terreno_vale.bin")
	return maxh < 0.001 and maxc < 0.002

## XP, vida e armadura dos monstros iguais ao jogo web (valores de referência em dados/jogo.json → ref)
func teste_regras() -> bool:
	var ok := true
	for r in Dados.J.ref.xp:
		var v := Regras.xp_to_next(int(r[0]))
		if v != float(r[1]):
			print("xp_to_next(", r[0], ") = ", v, " (web ", r[1], ")")
			ok = false
	for r in Dados.J.ref.mob:
		var d: Dictionary = Dados.inimigos[r[0]]
		var st := Regras.enemy_stats(d, int(r[1]))
		var x1 := Regras.xp_for_kill(d, int(r[1]), 1)
		var x30 := Regras.xp_for_kill(d, int(r[1]), 30)
		if st.maxHp != float(r[2]) or absf(st.armor - float(r[3])) > 1e-6 or x1 != float(r[4]) or x30 != float(r[5]):
			print(r[0], " nv ", r[1], ": vida ", st.maxHp, "/", r[2], " armadura ", st.armor, "/", r[3], " xp ", x1, "/", r[4], " ", x30, "/", r[5])
			ok = false
	print("conferidos ", Dados.J.ref.xp.size(), " níveis e ", Dados.J.ref.mob.size(), " monstros")
	return ok

## foto do jogo de verdade (herói + slime parado ao lado), sem servidor:
## --pos=x,z  --yaw=rad (câmera) --tod=0.42 --saida=arquivo.png
func _fotojogo(args: PackedStringArray) -> void:
	var px := 6.0
	var pz := 60.0
	var cyaw := 0.0
	var tod := 0.42
	var saida := "/tmp/jogo.png"
	var classe := "guerreiro"
	for a in args:
		if a.begins_with("--pos="): px = a.substr(6).split(",")[0].to_float(); pz = a.substr(6).split(",")[1].to_float()
		elif a.begins_with("--yaw="): cyaw = a.substr(6).to_float()
		elif a.begins_with("--tod="): tod = a.substr(6).to_float()
		elif a.begins_with("--saida="): saida = a.substr(8)
		elif a.begins_with("--classe="): classe = a.substr(9)
	var J := Jogo.new()
	get_parent().add_child(J)
	J.iniciar("Lia", classe, "M", "", 1)
	if "--toque" in args:
		J.toque = true
		J.hud.toque = true
		J.hud.ts = 1.6
	J.hora_fixa = tod
	J.jogador.teleport(px, pz)
	J.jogador.yaw = cyaw + PI
	J.cam.yaw = cyaw
	J.cam.snap(J.jogador.pos)
	var e := Inimigo.new(J, "slime", 1, 1, px + 2.5, pz - 2.0, "world")
	J.rede.replicas[1] = e
	J.add_child(e)
	e.net_apply({ x = px + 2.5, z = pz - 2.0, yaw = 2.6, hp = 1.0, st = "idle", act = null, p = 0.0, wind = 0.0, dead = false, mv = 0.0, spawn = 0.0 }, 0.0)
	if "--semsol" in args:
		J.ceu.sol.visible = false
	if "--sombrapadrao" in args:
		J.ceu.sol.shadow_bias = 0.1
		J.ceu.sol.shadow_normal_bias = 2.0
		J.ceu.sol.shadow_blur = 1.0
		J.ceu.sol.directional_shadow_max_distance = 100.0
	if "--semnuvem" in args:
		J.ceu.nuvens.visible = false
		J.hud.visible = false
	if "--semceu" in args:
		J.ceu.env.background_mode = Environment.BG_COLOR
	if "--pssm" in args:
		J.ceu.sol.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	if "--semsombra" in args:
		J.ceu.sol.shadow_enabled = false
	J.bot = func(_dt): return { mv = Vector2.ZERO, mag = 0.0, correr = false, atacar = false }
	for i in 45:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	for a in args:
		if a.begins_with("--sonda="):
			for q in a.substr(8).split(";"):
				var c := q.split(",")
				var w := Vector3(c[0].to_float(), 0, c[1].to_float())
				w.y = J.mundo.ground_height(w.x, w.z)
				var sp := J.camera.unproject_position(w)
				print("SONDA ", q, " -> ", img.get_pixelv(Vector2i(sp)) * 255.0)
	img.save_png(saida)
	print("foto salva: ", saida)
	get_tree().quit(0)

## calibração: o que a Godot faz com DIFFUSE_LIGHT/ALBEDO/ATTENUATION no renderizador Compatibility
func _luz() -> void:
	var root := Node3D.new()
	add_child(root)
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	we.environment = env
	root.add_child(we)
	var sol := DirectionalLight3D.new()
	sol.shadow_enabled = "--sombra" in OS.get_cmdline_user_args()
	sol.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	root.add_child(sol)
	RenderingServer.global_shader_parameter_set("eld_sun", Vector3(PI * 0.5, PI * 0.5, PI * 0.5))
	RenderingServer.global_shader_parameter_set("eld_hemi_sky", Vector3.ZERO)
	RenderingServer.global_shader_parameter_set("eld_hemi_ground", Vector3.ZERO)
	RenderingServer.global_shader_parameter_set("eld_fog_range", Vector2(1000, 2000))
	var codes := [
		"ALBEDO = vec3(0.5);", "DIFFUSE_LIGHT += vec3(0.25);",
		"ALBEDO = vec3(1.0);", "DIFFUSE_LIGHT += vec3(0.25);",
		"ALBEDO = vec3(0.5);", "DIFFUSE_LIGHT += vec3(0.25) * ATTENUATION;",
		"ALBEDO = vec3(0.0); EMISSION = vec3(0.25);", "",
	]
	for i in 4:
		var m := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(1, 1)
		m.mesh = q
		m.position = Vector3(-1.5 + i, 0, -3)
		var sh := Shader.new()
		sh.code = "shader_type spatial;\nvoid fragment(){ %s }\nvoid light(){ %s }\n" % [codes[i * 2], codes[i * 2 + 1]]
		var mt := Materiais.from_key("eld;k=lam").duplicate()
		var tv: float = [1.0, 0.5, 0.25, 0.125][i]
		mt.set_shader_parameter("tint", Vector3(tv, tv, tv))
		m.material_override = mt
		root.add_child(m)
	var c := Camera3D.new()
	c.fov = 60
	if "--cam" in OS.get_cmdline_user_args():
		c.near = 0.3
		c.far = 900.0
	root.add_child(c)
	c.make_current()
	if "--mundo" in OS.get_cmdline_user_args():
		sol.directional_shadow_max_distance = 55.0
		sol.look_at_from_position(Vector3(0.3, 0.9, 0.4) * 50.0, Vector3.ZERO, Vector3.UP)
		var fl := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(40, 40) if not "--grande" in OS.get_cmdline_user_args() else Vector2(400, 400)
		fl.mesh = pm
		fl.position = Vector3(0, -2, -6)
		fl.material_override = Materiais.from_key("eld;k=lam;f=1")
		root.add_child(fl)
		var bx := MeshInstance3D.new()
		bx.mesh = BoxMesh.new()
		bx.position = Vector3(3, -1, -6)
		bx.material_override = Materiais.from_key("eld;k=lam;f=1")
		root.add_child(bx)
		RenderingServer.global_shader_parameter_set("eld_sun", Vector3(PI * 0.5, PI * 0.5, PI * 0.5))
	for k in 5:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	for i in 4:
		var sp := c.unproject_position(Vector3(-1.5 + i, 0, -3))
		print("LUZ ", i, " ", img.get_pixelv(Vector2i(sp)) * 255.0)
	for w in [Vector3(-3, -2, -8), Vector3(0, -2, -10)]:
		print("CHAO ", w, " ", img.get_pixelv(Vector2i(c.unproject_position(w))) * 255.0)
	get_tree().quit(0)
