class_name Ceu
extends Node3D
## Porte de src/engine/sky.js (fora do Ultra): dia/noite pelas mesmas cores-chave, sol (luz direcional com
## sombra seguindo o herói), luz do céu/chão (hemisfério, via shader), neblina linear, cúpula do céu e nuvens.
## Intensidades: three.js (luz física) → Godot dividindo por PI (a Godot multiplica a energia por PI).

const R := preload("res://scripts/mundo/ruido.gd")

var sol: DirectionalLight3D
var env: Environment
var sky_mat: ShaderMaterial
var keys: Array = []
var fog_far := 215.0
var nuvens: MultiMeshInstance3D
var nuvem_mat: ShaderMaterial
var nuvens_dados: Array = []
var night := 0.0
var shadow_extent := 40.0

const SKY_SHADER := """
shader_type sky;
uniform vec3 top; uniform vec3 hor; uniform vec3 bottom = vec3(0.0232, 0.0423, 0.0232);
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0); uniform vec3 sun_col; uniform float night;
void sky() {
	vec3 d = normalize(EYEDIR);
	float y = d.y;
	vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(hor, bottom, clamp(-y * 3.0, 0.0, 1.0));
	float sd = max(dot(d, normalize(sun_dir)), 0.0);
	float disc = smoothstep(0.9975, 0.9988, sd);
	float glow = pow(sd, 18.0) * 0.55 + pow(sd, 3.0) * 0.12;
	vec3 moon_dir = -normalize(sun_dir);
	float md = max(dot(d, moon_dir), 0.0);
	float moon = smoothstep(0.9985, 0.9992, md) * night;
	c += sun_col * (disc * (1.0 - night) * 2.0 + glow * (1.0 - night * 0.8)) + vec3(0.85, 0.9, 1.0) * moon * 1.4 + vec3(0.4, 0.5, 0.9) * pow(md, 40.0) * night * 0.25;
	COLOR = c;
}
"""

func _ready() -> void:
	keys = []
	for k in Dados.ceu.keys:
		keys.append({ t = float(k.t), top = Dados.cor_lin(k.top), hor = Dados.cor_lin(k.hor), fog = Dados.cor_lin(k.fog), hs = Dados.cor_lin(k.hs), hg = Dados.cor_lin(k.hg), sc = Dados.cor_lin(k.sc), si = float(k.si), hi = float(k.hi) })
	fog_far = float(Dados.ceu.alta.fogFar)
	sol = DirectionalLight3D.new()
	sol.name = "Sol"
	# Sombra do sol: no renderizador Compatibility, com os shaders próprios (luz igual à do three.js), a parte
	# iluminada fica com a luz dobrada quando a sombra está ligada no Vale (não acontece numa cena simples:
	# testes --teste=luz). Desligada até a próxima parte (pendente); sem ela a luz bate certinho com o web.
	sol.shadow_enabled = bool(Dados.ceu.alta.shadows) and Dados.get_cfg("sombras", false)
	sol.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sol.directional_shadow_max_distance = 55.0
	sol.shadow_bias = 0.03
	sol.shadow_normal_bias = 1.2
	sol.shadow_blur = 1.0
	add_child(sol)
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sk := Sky.new()
	sky_mat = ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = SKY_SHADER
	sky_mat.shader = sh
	sk.sky_material = sky_mat
	sk.process_mode = Sky.PROCESS_MODE_REALTIME
	sk.radiance_size = Sky.RADIANCE_SIZE_32
	env.sky = sk
	env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.fog_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	_montar_nuvens()

func _montar_nuvens() -> void:
	# 18 nuvens de 4 bolos (icosaedro), como no sky.js
	var ico := _icosaedro()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = ico
	mm.instance_count = 72
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	nuvens_dados.clear()
	for i in 18:
		var puffs := []
		for j in 4:
			puffs.append({ x = j * 7 - 10, y = rng.randf() * 2, z = rng.randf() * 6 - 3, sx = 8 + rng.randf() * 8, sy = 2.5 + rng.randf() * 2, sz = 6 + rng.randf() * 5 })
		nuvens_dados.append({ x = rng.randf() * 500 - 250, y = 85 + rng.randf() * 25, z = rng.randf() * 500 - 250, speed = 1.5 + rng.randf() * 2, puffs = puffs })
	nuvens = MultiMeshInstance3D.new()
	nuvens.multimesh = mm
	nuvens.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	nuvem_mat = Materiais.from_key("eld;k=lam;f=1;t=1;o=0.9").duplicate()
	nuvens.material_override = nuvem_mat
	nuvens.custom_aabb = AABB(Vector3(-400, 0, -400), Vector3(800, 200, 800))
	add_child(nuvens)

func _icosaedro() -> ArrayMesh:
	var t := (1.0 + sqrt(5.0)) / 2.0
	var v := [Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0), Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t), Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)]
	var f := [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
	var pos := PackedVector3Array()
	for i in range(0, f.size(), 3):
		# ordem horária (Godot)
		pos.append(v[f[i]].normalized()); pos.append(v[f[i + 2]].normalized()); pos.append(v[f[i + 1]].normalized())
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

func sample(t: float) -> Dictionary:
	var i := 0
	while i < keys.size() - 2 and keys[i + 1].t < t:
		i += 1
	var a: Dictionary = keys[i]
	var b: Dictionary = keys[i + 1]
	var k := R.clamp_((t - a.t) / (b.t - a.t), 0.0, 1.0)
	return { top = a.top.lerp(b.top, k), hor = a.hor.lerp(b.hor, k), fog = a.fog.lerp(b.fog, k), hs = a.hs.lerp(b.hs, k), hg = a.hg.lerp(b.hg, k), sc = a.sc.lerp(b.sc, k), si = lerpf(a.si, b.si, k), hi = lerpf(a.hi, b.hi, k) }

static func v3(c: Color, k := 1.0) -> Vector3:
	return Vector3(c.r * k, c.g * k, c.b * k)

## tod: 0 meia-noite, 0.5 meio-dia (mesma conta do sky.js)
func atualizar(dt: float, tod: float, focus: Vector3, cam: Camera3D) -> void:
	var ang := (tod - 0.25) * PI * 2.0
	var sy := sin(ang)
	var dir := Vector3(cos(ang) * 0.75, maxf(sy, -1.0), 0.45).normalized()
	night = 1.0 - R.ss(-0.12, 0.16, sy)
	var light_dir := dir if sy > -0.05 else Vector3(-dir.x, maxf(0.35, -dir.y), -dir.z).normalized()
	if light_dir.y < 0.18:
		light_dir.y = 0.18
		light_dir = light_dir.normalized()
	var c := sample(tod)
	var corrupt := 1.0 - R.ss(30.0, 75.0, Vector2(focus.x - float(Dados.mundo.PLATEAU.x), focus.z - float(Dados.mundo.PLATEAU.z)).length())
	var purple := Dados.cor_lin(0x5a2f7a)
	var hor: Color = c.hor.lerp(purple, corrupt * 0.35)
	sky_mat.set_shader_parameter("top", v3(c.top))
	sky_mat.set_shader_parameter("hor", v3(hor))
	sky_mat.set_shader_parameter("sun_dir", dir)
	sky_mat.set_shader_parameter("sun_col", v3(c.sc))
	sky_mat.set_shader_parameter("night", night)
	var fogc: Color = c.fog.lerp(purple, corrupt * 0.3)
	var near := lerpf(minf(55.0, fog_far * 0.6), 22.0, corrupt * 0.25)
	var far := lerpf(fog_far, fog_far * 0.6, corrupt * 0.2)
	RenderingServer.global_shader_parameter_set("eld_fog_color", v3(fogc))
	RenderingServer.global_shader_parameter_set("eld_fog_range", Vector2(near, far))
	# HemisphereLight(céu, chão, intensidade) → luz própria nos shaders (irradiância/PI, como o three.js)
	RenderingServer.global_shader_parameter_set("eld_hemi_sky", v3(c.hs, c.hi / PI))
	RenderingServer.global_shader_parameter_set("eld_hemi_ground", v3(c.hg, c.hi / PI))
	sol.light_color = Color(1, 1, 1)
	sol.light_energy = 1.0
	RenderingServer.global_shader_parameter_set("eld_sun", v3(c.sc, c.si))
	# sol segue o foco (grade de texels para não tremer a sombra)
	var texel := (2.0 * shadow_extent) / 2048.0
	var fx := roundf(focus.x / texel) * texel
	var fz := roundf(focus.z / texel) * texel
	var target := Vector3(fx, focus.y, fz)
	sol.look_at_from_position(target + light_dir * 120.0, target, Vector3.UP if absf(light_dir.y) < 0.99 else Vector3.FORWARD)
	# nuvens
	var cm := Color(1, 1, 1).lerp(c.hor, 0.35)
	nuvem_mat.set_shader_parameter("tint", v3(cm))
	var mm := nuvens.multimesh
	var k := 0
	for cl in nuvens_dados:
		cl.x += cl.speed * dt
		if cl.x > 260:
			cl.x = -260
		for p in cl.puffs:
			mm.set_instance_transform(k, Transform3D(Basis.from_scale(Vector3(p.sx, p.sy, p.sz)), Vector3(cl.x + p.x, cl.y + p.y, cl.z + p.z)))
			k += 1
