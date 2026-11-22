extends Node3D
## Foto fixa do mundo (para comparar com o jogo web):
## xvfb-run -a godot --rendering-driver opengl3 --path godot -- --teste=foto --cam=x,y,z --olha=x,y,z --tod=0.42 --saida=/tmp/a.png
## (y da câmera e do alvo = metros acima do chão; --fov=55)

var cam: Camera3D
var ceu: Ceu
var mundo: Mundo
var tod := 0.42
var saida := "/tmp/foto.png"

func rodar(args: PackedStringArray) -> void:
	var cpos := Vector3(0, 12, 90)
	var olha := Vector3(0, 1.5, 70)
	var fov := 55.0
	for a in args:
		if a.begins_with("--cam="): cpos = _v3(a.substr(6))
		elif a.begins_with("--olha="): olha = _v3(a.substr(7))
		elif a.begins_with("--tod="): tod = a.substr(6).to_float()
		elif a.begins_with("--saida="): saida = a.substr(8)
		elif a.begins_with("--fov="): fov = a.substr(6).to_float()
	ceu = Ceu.new()
	add_child(ceu)
	mundo = Mundo.new()
	add_child(mundo)
	mundo.montar()
	cpos.y += mundo.ground_height(cpos.x, cpos.z)
	olha.y += mundo.ground_height(olha.x, olha.z)
	cam = Camera3D.new()
	cam.fov = fov
	cam.near = 0.3
	cam.far = 900
	add_child(cam)
	cam.look_at_from_position(cpos, olha, Vector3.UP)
	extra(args)
	for i in 6:
		ceu.atualizar(1.0 / 30, tod, olha, cam)
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(saida)
	print("foto salva: ", saida)
	get_tree().quit(0)

func extra(_args: PackedStringArray) -> void:
	pass

static func _v3(s: String) -> Vector3:
	var p := s.split(",")
	return Vector3(p[0].to_float(), p[1].to_float(), p[2].to_float())
