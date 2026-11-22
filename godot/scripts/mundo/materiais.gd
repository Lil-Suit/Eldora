class_name Materiais
## Materiais iguais aos do jogo web (three.js r187, sem tonemapping, saída sRGB):
## - Lambert / Phong / Standard com a MESMA conta de luz do three.js (sol = DirectionalLight, céu/chão =
##   HemisphereLight como luz própria em EMISSION) e a MESMA neblina linear (smoothstep pela profundidade).
## - flatShading do three.js = normal por derivadas (cada triângulo facetado).
## - Básico (sem luz), aditivo, transparente, duas faces.
## A receita vem no nome do material exportado ("eld;k=lam;f=1;…", ver tools/godot-export-entry.js).
## Os valores globais (céu, neblina) são atualizados por Ceu (scripts/mundo/ceu.gd).

static var _shaders := {}
static var _mats := {}

const BASE := """
shader_type spatial;
render_mode %s;
global uniform vec3 eld_hemi_sky;
global uniform vec3 eld_hemi_ground;
global uniform vec3 eld_fog_color;
global uniform vec2 eld_fog_range;
global uniform float eld_time;
global uniform vec3 eld_sun;
uniform float opacity = 1.0;
uniform vec3 emissive = vec3(0.0);
uniform vec3 spec_color = vec3(0.0);
uniform float shininess = 30.0;
uniform float rough = 1.0;
uniform float rig_glow = 0.07;
uniform vec3 tint = vec3(1.0);
uniform vec3 flash = vec3(0.0);
uniform float flash_k = 0.0;
uniform sampler2D tex : source_color, filter_linear_mipmap, repeat_enable;
varying vec2 v_rig;
// o renderizador Compatibility (celular) trata ALBEDO e EMISSION como sRGB e converte para linear:
// as contas aqui são lineares (como no three.js), então manda já convertido
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
#define SRGB(c) mix((c) * 12.92, 1.055 * pow(max((c), vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), (c)))
#else
#define SRGB(c) (c)
#endif
varying float v_shine;
void vertex() {
#ifdef WAVE
	float wx = VERTEX.x * 0.33 + eld_time * 1.2, wy = -VERTEX.z * 0.41 - eld_time * 0.9;
	VERTEX.y += sin(wx) * 0.07 + sin(wy) * 0.07;
#endif
#ifdef RIG
	v_rig = UV2;
#endif
}
void fragment() {
	vec4 c = COLOR;
#ifdef TEX
	c *= texture(tex, UV);
#endif
	vec3 base = c.rgb * tint;
	float a = opacity;
#ifndef RIG
	a *= c.a;
#endif
#ifdef ALPHA_ON
	ALPHA = a;
#endif
#ifdef CUT
	ALPHA_SCISSOR_THRESHOLD = %s;
	ALPHA = a;
#endif
	vec3 N = NORMAL;
#ifdef FLAT
	N = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	if (dot(N, VIEW) < 0.0) N = -N;
	NORMAL = N;
#endif
#ifdef UNLIT
	ALBEDO = SRGB(base);
#else
	float glow = 0.0, shade = 1.0;
#ifdef RIG
	glow = v_rig.x; shade = v_rig.y;
#endif
	vec3 dif = base * (1.0 - glow) * shade;
	ALBEDO = SRGB(dif);
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(N, 0.0)).xyz);
	vec3 hemi = mix(eld_hemi_ground, eld_hemi_sky, 0.5 * nw.y + 0.5);
	vec3 em = dif * hemi + emissive;
#ifdef RIG
	em += base * mix(rig_glow, 1.0, glow);
#endif
#if defined(RIM) || defined(RIG)
	float rimK = pow(1.0 - clamp(abs(dot(N, VIEW)), 0.0, 1.0), 2.6);
	em += mix(base, vec3(1.0), 0.45) * rimK * 0.3 * (1.0 - glow) * shade;
#endif
	em = mix(em, flash, flash_k);
	EMISSION = SRGB(em);
	ROUGHNESS = rough;
	v_shine = c.a;
#endif
#ifdef FOG_ON
	FOG = vec4(eld_fog_color, smoothstep(eld_fog_range.x, eld_fog_range.y, -VERTEX.z));
#endif
}
#ifndef UNLIT
void light() {
	// eld_sun = cor × intensidade do sol do three.js (linear); ATTENUATION = sombra
	float nl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	DIFFUSE_LIGHT += ATTENUATION * eld_sun * nl / PI;
#ifdef PHONG
	vec3 H = normalize(LIGHT + VIEW);
	float nh = clamp(dot(NORMAL, H), 0.0, 1.0), vh = clamp(dot(VIEW, H), 0.0, 1.0);
	vec3 F = spec_color + (1.0 - spec_color) * pow(1.0 - vh, 5.0);
	float D = (1.0 / PI) * (shininess * 0.5 + 1.0) * pow(nh, shininess);
	float k = 1.0;
#ifdef RIG
	k = v_shine * (1.0 - v_rig.x);
#endif
	SPECULAR_LIGHT += ATTENUATION * eld_sun * nl * F * (0.25 * D) * k;
#endif
#ifdef STD
	vec3 H = normalize(LIGHT + VIEW);
	float nv = clamp(dot(NORMAL, VIEW), 1e-4, 1.0), nh = clamp(dot(NORMAL, H), 0.0, 1.0), vh = clamp(dot(VIEW, H), 0.0, 1.0);
	float al = max(ROUGHNESS * ROUGHNESS, 0.0525), a2 = al * al;
	float dd = nh * nh * (a2 - 1.0) + 1.0;
	float D = a2 / (PI * dd * dd);
	float gv = nl * sqrt(nv * nv * (1.0 - a2) + a2), gl = nv * sqrt(nl * nl * (1.0 - a2) + a2);
	float V = 0.5 / max(gv + gl, 1e-6);
	float F = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
	SPECULAR_LIGHT += ATTENUATION * eld_sun * nl * F * V * D;
#endif
}
#endif
"""

## material a partir da receita (texto "eld;k=…;…")
static func from_key(nome: String, tex: Texture2D = null, extra: Array = []) -> ShaderMaterial:
	var cache_key := nome + ("#tex" if tex else "") + ",".join(extra)
	if _mats.has(cache_key) and not tex:
		return _mats[cache_key]
	var kv := parse(nome)
	var k: String = kv.get("k", "lam")
	var defs := extra.duplicate()
	var modes := []
	var t := kv.has("t")
	if k == "basic" or k == "shader":
		defs.append("UNLIT")
		modes.append("unshaded")
	elif k == "phong":
		defs.append("PHONG")
	elif k == "std":
		defs.append("STD")
	if kv.get("f", "0") == "1" and not defs.has("UNLIT"):
		defs.append("FLAT")
	if kv.has("rig"):
		defs.append("RIG")
		if not defs.has("PHONG"):
			defs.append("PHONG")
	if kv.has("rim"):
		defs.append("RIM")
	if tex:
		defs.append("TEX")
	if kv.get("fog", "1") != "0":
		defs.append("FOG_ON")
	var cut := ""
	if kv.has("at"):
		defs.append("CUT")
		cut = kv.at
	elif t:
		defs.append("ALPHA_ON")
	if kv.get("bl", "") == "add":
		modes.append("blend_add")
	var s: String = kv.get("s", "0")
	modes.append("cull_disabled" if s == "2" else ("cull_front" if s == "1" else "cull_back"))
	if kv.get("dw", "1") == "0" or (t and kv.get("bl", "") == "add"):
		modes.append("depth_draw_never")
	if not defs.has("UNLIT"):
		modes.append("diffuse_lambert")
	var m := ShaderMaterial.new()
	m.shader = shader(defs, modes, cut)
	m.resource_name = nome
	m.set_shader_parameter("opacity", float(kv.get("o", "1")) if t else 1.0)
	if kv.has("e"):
		var e: PackedStringArray = String(kv.e).split(",")
		m.set_shader_parameter("emissive", Vector3(e[0].to_float(), e[1].to_float(), e[2].to_float()))
	if kv.has("sp"):
		var sp: PackedStringArray = String(kv.sp).split(",")
		m.set_shader_parameter("spec_color", Vector3(sp[0].to_float(), sp[1].to_float(), sp[2].to_float()))
	elif kv.has("rig"):
		var g := Color8(0x5a, 0x5a, 0x5a).srgb_to_linear()
		m.set_shader_parameter("spec_color", Vector3(g.r, g.g, g.b))
	if kv.has("sh"):
		m.set_shader_parameter("shininess", float(kv.sh))
	elif kv.has("rig"):
		m.set_shader_parameter("shininess", 70.0)
	if kv.has("ro"):
		m.set_shader_parameter("rough", float(kv.ro))
	if kv.has("rg"):
		m.set_shader_parameter("rig_glow", float(kv.rg))
	if tex:
		m.set_shader_parameter("tex", tex)
	if kv.has("ro2"):
		m.render_priority = clampi(int(kv.ro2), -128, 127)
	if not tex:
		_mats[cache_key] = m
	return m

static func parse(nome: String) -> Dictionary:
	var kv := {}
	for p in nome.trim_prefix("eld;").split(";"):
		var i := p.find("=")
		if i > 0:
			kv[p.substr(0, i)] = p.substr(i + 1)
	return kv

static func shader(defs: Array, modes: Array, cut := "") -> Shader:
	var code := ""
	for d in defs:
		code += "#define %s\n" % d
	code += BASE % [", ".join(modes), cut if cut != "" else "0.5"]
	if _shaders.has(code):
		return _shaders[code]
	var s := Shader.new()
	s.code = code
	_shaders[code] = s
	return s

## troca os materiais de uma cena importada (.glb) pelos materiais iguais aos do jogo web
static func ajustar(root: Node) -> void:
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		var mesh := m3.mesh
		if mesh == null:
			continue
		var sombra := false
		for si in mesh.get_surface_count():
			var src := mesh.surface_get_material(si)
			var nm := src.resource_name if src else ""
			var novo: Material = null
			if nm.begins_with("eld;"):
				var tex: Texture2D = null
				if src is BaseMaterial3D and nm.contains(";map="):
					tex = (src as BaseMaterial3D).albedo_texture
				novo = from_key(nm, tex)
				if parse(nm).has("cs"):
					sombra = true
			elif src is BaseMaterial3D:
				novo = do_padrao(src as BaseMaterial3D)
				sombra = true
			if novo:
				m3.set_surface_override_material(si, novo)
		m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if sombra else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

## material PBR do .glb (heróis) → Standard do three.js (cor × textura, rugosidade)
static func do_padrao(b: BaseMaterial3D) -> ShaderMaterial:
	var key := "eld;k=std;ro=%s" % b.roughness
	if b.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
		key += ";t=1;o=%s" % b.albedo_color.a
	var m := from_key(key, b.albedo_texture)
	if not b.albedo_texture:
		m = m.duplicate()
	var c := b.albedo_color # cor do glTF já vem linear na Godot? (baseColorFactor é linear)
	m.set_shader_parameter("tint", Vector3(c.r, c.g, c.b))
	return m
