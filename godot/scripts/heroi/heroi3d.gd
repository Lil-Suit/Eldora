class_name Heroi3D
extends Node3D
## Herói com o modelo 3D do jogo web (assets/chars, os mesmos .glb de docs/chars/*.wasm) e as animações de
## anim.glb (o three.js aplica os clipes pelos nomes dos ossos; aqui os caminhos são trocados para o
## Skeleton3D do personagem). Escolha de clipe igual a src/engine/hero3d.js (baseClip/actionClip).

const HERO_SCALE := 1.38
const SKINS := { campones = "peasant", patrulheiro = "ranger", mago = "wizard", nobre = "noble", cavaleiro = "knight" }

static var _lib: AnimationLibrary = null
static var _lib_skel_path := ""
var modelo: Node3D
var ap: AnimationPlayer
var grip: AnimationPlayer
var skel: Skeleton3D
var cls := "guerreiro"
var weapon_kind := "espada"
var base_atual := ""
var acao_atual := ""
var shield := false

func _init(classe := "guerreiro", genero := "M", skin := "campones") -> void:
	cls = classe
	name = "heroi"
	scale = Vector3.ONE * HERO_SCALE
	var outfit: String = SKINS.get(skin, "peasant")
	var cena: PackedScene = load("res://assets/chars/%s_%s.glb" % ["F" if genero == "F" else "M", outfit])
	modelo = cena.instantiate()
	add_child(modelo)
	Materiais.ajustar(modelo)
	skel = modelo.find_children("*", "Skeleton3D", true, false)[0]
	var path := String(modelo.get_path_to(skel))
	ap = AnimationPlayer.new()
	ap.name = "anim"
	modelo.add_child(ap)
	ap.root_node = NodePath("..")
	ap.add_animation_library("", _biblioteca(path))
	grip = AnimationPlayer.new()
	grip.name = "dedos"
	modelo.add_child(grip)
	grip.root_node = NodePath("..")
	grip.add_animation_library("", _dedos(_biblioteca(path)))
	grip.play("GripR")

## clipes de anim.glb com os caminhos trocados para os ossos do personagem ("Esqueleto:osso")
static func _biblioteca(skel_path: String) -> AnimationLibrary:
	if _lib and _lib_skel_path == skel_path:
		return _lib
	var src: Node = (load("res://assets/chars/anim.glb") as PackedScene).instantiate()
	var sap: AnimationPlayer = src.find_children("*", "AnimationPlayer", true, false)[0]
	var lib := AnimationLibrary.new()
	for nm in sap.get_animation_list():
		var a: Animation = sap.get_animation(nm).duplicate(true)
		for i in range(a.get_track_count() - 1, -1, -1):
			var p := String(a.track_get_path(i))
			var bone := p.get_slice(":", 0).get_file()
			a.track_set_path(i, NodePath(skel_path + ":" + bone))
		lib.add_animation(nm, a)
	src.free()
	_lib = lib
	_lib_skel_path = skel_path
	return lib

## só os ossos dos dedos (a mão fecha na arma sem mexer no resto do corpo)
static func _dedos(lib: AnimationLibrary) -> AnimationLibrary:
	var out := AnimationLibrary.new()
	for nm in ["GripR", "GripLFist", "GripLOpen"]:
		if not lib.has_animation(nm):
			continue
		var a: Animation = lib.get_animation(nm).duplicate(true)
		for i in range(a.get_track_count() - 1, -1, -1):
			var bone := String(a.track_get_path(i)).get_slice(":", 1)
			if not (bone.contains("thumb") or bone.contains("index") or bone.contains("middle") or bone.contains("ring") or bone.contains("pinky")):
				a.remove_track(i)
		a.loop_mode = Animation.LOOP_LINEAR
		out.add_animation(nm, a)
	return out

## arma na mão direita (igual ao encaixe do hero3d.js: hand_r, 3 cm para fora e 8 cm para os dedos)
func equipar(kind: String) -> void:
	weapon_kind = kind
	var arq := "res://assets/armas/%s_comum.glb" % kind
	if not ResourceLoader.exists(arq):
		return
	var bone := "hand_l" if kind == "arco" else "hand_r"
	var att := BoneAttachment3D.new()
	att.bone_name = bone
	skel.add_child(att)
	var enc := Node3D.new()
	enc.position = Vector3(0.03 if bone == "hand_l" else -0.03, 0.08, 0)
	att.add_child(enc)
	var w: Node3D = (load(arq) as PackedScene).instantiate()
	enc.add_child(w)
	Materiais.ajustar(w)
	grip.play("GripR")

## estado: move (0..1,35), action (nome), p (0..1), variant, dead (0..1), combat, swim
func atualizar(st: Dictionary, _dt: float) -> void:
	var b := _base_clip(st)
	var an: String = _action_clip(st) if st.get("action") and st.get("dead", 0.0) <= 0.0 else ""
	if an != "" and ap.has_animation(an):
		if acao_atual != an:
			acao_atual = an
			ap.play(an, 0.06)
		var d := ap.get_animation(an).length
		var span := 0.85 if an.begins_with("Sword_Regular") or an.begins_with("Punch") else 1.0
		ap.speed_scale = 0.0
		ap.seek(clampf(st.get("p", 0.0), 0.0, 0.999) * d * span, true)
		return
	ap.speed_scale = b[1]
	if acao_atual != "" or base_atual != b[0]:
		var blend := 0.06 if b[0] == "Death01" else 0.15
		ap.play(b[0], blend)
		base_atual = b[0]
		acao_atual = ""

func _base_clip(st: Dictionary) -> Array:
	if st.get("dead", 0.0) > 0.0:
		return ["Death01", 1.0]
	if st.get("swim", 0.0) > 0.5:
		return ["Swim_Fwd" if st.get("move", 0.0) > 0.1 else "Swim_Idle", 1.0]
	var w: float = st.get("move", 0.0)
	if w > 0.06:
		if st.get("action"):
			return ["Walk", clampf(w / 0.45, 0.7, 1.7)]
		if w < 0.5:
			return ["Walk", maxf(0.6, w / 0.32)]
		if w < 1.1:
			return ["Jog_Fwd", maxf(0.75, w / 0.85)]
		return ["Sprint", w / 1.25]
	if st.get("combat", 0.0) > 0.5:
		if cls == "mago":
			return ["Spell_Simple_Idle", 1.0]
		if cls == "arqueiro":
			return ["Idle", 1.0]
		return ["Sword_Idle", 1.0]
	return ["Idle", 1.0]

func _action_clip(st: Dictionary) -> String:
	var a: String = st.get("action", "")
	var k := weapon_kind
	var v: int = st.get("variant", 0)
	match a:
		"slash", "swipe":
			if k == "montante": return "Sword_Attack"
			if k in ["cajado", "varinha", "orbe"]: return "Spell_Simple_Shoot"
			if k in ["arco", "arco_longo"]: return "Punch_Jab"
			return ["Sword_Regular_A", "Sword_Regular_B", "Sword_Regular_A"][v % 3]
		"slam": return "Sword_Attack"
		"whirl": return "Sword_Regular_C"
		"charge": return "Shield_Dash" if shield else "Sword_Dash"
		"roll": return "Roll"
		"shoot", "bow": return "Pistol_Shoot"
		"cast", "castUp": return "Spell_Simple_Shoot"
		"sling", "throw": return "OverhandThrow"
		"victory": return "Yes"
	return ""
