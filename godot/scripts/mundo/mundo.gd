class_name Mundo
extends Node3D
## O Vale de Eldoria (área 'world'): terreno (porte de terrain.js), água, construções/árvores exportadas do
## jogo web (assets/mundo/vale.glb + vale.inst), colisores e as mesmas regras de chão de world.js
## (groundHeight, walkable, tryMove, linha de visão).

const R := preload("res://scripts/mundo/ruido.gd")

var terreno: Terreno
var col := Colisao.new()
var area := "world"
var W: Dictionary
var water_y := -0.45
var deep_water := -1.05
var slope_limit := 1.35
var playable := 172.0
# ponte e pedras do lago (world.js)
var br := {}
var st_xs := PackedFloat64Array()
var st_zs := PackedFloat64Array()
var st_box := Rect2()
var plat: Dictionary

func _init() -> void:
	name = "Mundo"
	W = Dados.mundo.WORLD
	water_y = float(W.waterLevel)
	deep_water = float(W.deepWater)
	slope_limit = float(W.slopeLimit)
	playable = float(W.playable)
	plat = Dados.mundo.PLATEAU
	var B: Dictionary = Dados.mundo.BRIDGE
	br = { x0 = float(B.x) - float(B.half) - 0.4, x1 = float(B.x) + float(B.half) + 0.4, z0 = float(B.z0), z1 = float(B.z1), y0 = float(B.y0), y1 = float(B.y1), arch = float(B.arch) }
	var mnx := INF
	var mxx := -INF
	var mnz := INF
	var mxz := -INF
	for s in Dados.mundo.STEPPING_STONES:
		st_xs.append(float(s[0]))
		st_zs.append(float(s[1]))
		mnx = minf(mnx, s[0]); mxx = maxf(mxx, s[0]); mnz = minf(mnz, s[1]); mxz = maxf(mxz, s[1])
	st_box = Rect2(mnx - 1.2, mnz - 1.2, mxx - mnx + 2.4, mxz - mnz + 2.4)

func montar() -> void:
	var t0 := Time.get_ticks_msec()
	terreno = Terreno.new()
	terreno.gerar()
	var chao := MeshInstance3D.new()
	chao.name = "terreno"
	chao.mesh = terreno.malha()
	chao.material_override = Materiais.from_key("eld;k=lam;f=1")
	chao.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(chao)
	# água (PlaneGeometry 400×400 com 120 divisões, ondas no vértice e Phong facetado)
	var agua := MeshInstance3D.new()
	agua.name = "agua"
	var pm := PlaneMesh.new()
	pm.size = Vector2(float(W.size), float(W.size))
	pm.subdivide_width = 119
	pm.subdivide_depth = 119
	agua.mesh = pm
	agua.position.y = water_y
	var sp := Dados.cor_lin(0xbfe8ff)
	var am := Materiais.from_key("eld;k=phong;f=1;t=1;o=0.8;sh=70;sp=%s,%s,%s" % [sp.r, sp.g, sp.b], null, ["WAVE"]).duplicate()
	var wc := Dados.cor_lin(0x3b93bd)
	am.set_shader_parameter("tint", Vector3(wc.r, wc.g, wc.b))
	agua.material_override = am
	agua.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(agua)
	# construções, árvores, cercas… (o que o jogo web monta), com os mesmos materiais
	var cena: PackedScene = load("res://assets/mundo/vale.glb")
	if cena:
		var v := cena.instantiate()
		v.name = "vale"
		add_child(v)
		Materiais.ajustar(v)
		_instancias(v, "res://assets/mundo/vale.inst")
	var n := col.carregar("res://dados/vale_colisao.json")
	print("mundo montado em ", Time.get_ticks_msec() - t0, " ms · colisores ", n)

## árvores/arbustos/pedras repetidos: MultiMesh com as posições e cores de cada cópia
func _instancias(root: Node, p: String) -> void:
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		return
	if f.get_buffer(4).get_string_from_ascii() != "ELDI":
		return
	f.get_32()
	var ng := f.get_32()
	for g in ng:
		var nl := f.get_16()
		var nome := f.get_buffer(nl).get_string_from_utf8()
		var cnt := f.get_32()
		var tem_cor := f.get_32() == 1
		var M := f.get_buffer(cnt * 48).to_float32_array()
		var C := f.get_buffer(cnt * 12).to_float32_array() if tem_cor else PackedFloat32Array()
		var src := root.find_child(nome, true, false) as MeshInstance3D
		if src == null:
			continue
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = tem_cor
		mm.mesh = src.mesh
		mm.instance_count = cnt
		for i in cnt:
			var o := i * 12
			mm.set_instance_transform(i, Transform3D(Basis(Vector3(M[o], M[o + 1], M[o + 2]), Vector3(M[o + 3], M[o + 4], M[o + 5]), Vector3(M[o + 6], M[o + 7], M[o + 8])), Vector3(M[o + 9], M[o + 10], M[o + 11])))
			if tem_cor:
				mm.set_instance_color(i, Color(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]))
		var mmi := MultiMeshInstance3D.new()
		mmi.name = nome
		mmi.multimesh = mm
		mmi.transform = src.transform
		mmi.cast_shadow = src.cast_shadow
		if src.get_surface_override_material(0):
			mmi.material_override = src.get_surface_override_material(0)
		src.get_parent().add_child(mmi)
		src.queue_free()

# ---------------- consulta de terreno (world.js) ----------------
func bridge_deck(t: float) -> float:
	return br.y0 + (br.y1 - br.y0) * t + sin(clampf(t, 0.0, 1.0) * PI) * br.arch

func ground_height(x: float, z: float) -> float:
	var hh := terreno.height_at(x, z)
	if x > br.x0 and x < br.x1 and z > br.z0 and z < br.z1:
		hh = maxf(hh, bridge_deck((z - br.z0) / (br.z1 - br.z0)) + 0.28)
	if st_box.has_point(Vector2(x, z)):
		for i in st_xs.size():
			var dx := x - st_xs[i]
			var dz := z - st_zs[i]
			if dx * dx + dz * dz < 1.32:
				hh = maxf(hh, water_y + 0.28)
				break
	return hh

func water_at() -> float:
	return water_y

func swimmable(x: float, z: float) -> bool:
	if ground_height(x, z) >= water_y - 0.05:
		return false
	return absf(x) <= playable and absf(z) <= playable

func walkable(x: float, z: float) -> bool:
	if z < -166.0 and R.dist2(x, z, float(plat.x), float(plat.z)) > float(plat.r) - 1.5 and z > -200.0:
		return false
	if z <= -200.0:
		return false
	if absf(x) > playable or absf(z) > playable:
		return false
	return ground_height(x, z) > deep_water

func in_water(x: float, z: float) -> bool:
	var hh := ground_height(x, z)
	return hh < water_y - 0.15

func try_move(pos: Vector3, dx: float, dz: float, r: float, swim := false) -> Dictionary:
	var ox := pos.x
	var oz := pos.z
	var wl := water_y if swim else NAN
	var eff := func(x: float, z: float) -> float:
		var g := ground_height(x, z)
		return maxf(g, wl - 0.9) if swim else g
	var h0: float = eff.call(ox, oz)
	var ok := func(x: float, z: float) -> bool:
		if not walkable(x, z) and not (swim and swimmable(x, z)):
			return false
		var stp := Vector2(x - ox, z - oz).length()
		if stp == 0.0:
			stp = 1e-4
		return eff.call(x, z) - h0 <= slope_limit * stp + 0.08 + (0.5 if swim else 0.0)
	var nx := ox + dx
	var nz := oz + dz
	if not ok.call(nx, nz):
		if ok.call(ox + dx, oz):
			nz = oz
		elif ok.call(ox, oz + dz):
			nx = ox
		else:
			return { ok = false, pos = pos }
	var p := Vector3(nx, pos.y, nz)
	p = col.resolve(p, r)
	if not walkable(p.x, p.z) and not (swim and swimmable(p.x, p.z)):
		return { ok = false, pos = pos }
	return { ok = true, pos = p }

func line_of_sight(ax: float, az: float, bx: float, bz: float) -> bool:
	return col.segment(ax, az, bx, bz, Colisao.LOS) < 0.0
