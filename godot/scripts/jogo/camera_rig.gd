class_name CameraRig
## Porte de src/game/camera.js: terceira pessoa elevada, segue suave, orbita, evita paredes e não entra no chão.

const R := preload("res://scripts/mundo/ruido.gd")

var camera: Camera3D
var yaw := 0.0          # 0 = câmera ao sul olhando para o norte
var pitch := 0.9
var dist := 13.0
var min_dist := 6.0
var max_dist := 22.0
var target := Vector3.ZERO
var smooth := Vector3.ZERO
var cur_dist := 13.0
var extra_smooth := 0.0
var shake_t := 0.0
var shake_amp := 0.0
var sens := 1.0

func _init(cam: Camera3D) -> void:
	camera = cam

func snap(p: Vector3) -> void:
	smooth = p
	target = p

func shake(amp := 0.3, dur := 0.25) -> void:
	shake_amp = maxf(shake_amp, amp)
	shake_t = maxf(shake_t, dur)

func forward() -> Vector2:
	return Vector2(-sin(yaw), -cos(yaw))

func right() -> Vector2:
	return Vector2(cos(yaw), -sin(yaw))

## ent: drag_dx/dy (mouse), cam_dx/dy (toque), wheel, pinch, cam_left/right
func update(dt: float, focus: Vector3, mundo: Mundo, ent: Dictionary) -> void:
	yaw -= ent.get("drag_dx", 0.0) * 0.005 * sens
	pitch = clampf(pitch + ent.get("drag_dy", 0.0) * 0.004 * sens, -0.3, 1.3)
	yaw -= ent.get("cam_dx", 0.0) * 0.008 * sens
	pitch = clampf(pitch + ent.get("cam_dy", 0.0) * 0.006 * sens, -0.3, 1.3)
	if ent.get("cam_left", false): yaw += dt * 1.8 * sens
	if ent.get("cam_right", false): yaw -= dt * 1.8 * sens
	dist = clampf(dist + ent.get("wheel", 0.0) * 1.2 + ent.get("pinch", 0.0) * 0.05, min_dist, max_dist)
	target = Vector3(focus.x, focus.y + 1.3, focus.z)
	smooth.x = R.damp(smooth.x, target.x, 9, dt)
	smooth.y = R.damp(smooth.y, target.y, 6, dt)
	smooth.z = R.damp(smooth.z, target.z, 9, dt)
	var cp := cos(pitch)
	var sp := sin(pitch)
	var ox := sin(yaw) * cp
	var oz := cos(yaw) * cp
	var want := dist + extra_smooth
	if mundo:
		var t := mundo.col.segment(smooth.x, smooth.z, smooth.x + ox * want, smooth.z + oz * want, Colisao.CAM)
		if t >= 0.0:
			want = maxf(min_dist * 0.7, want * t - 0.6)
	cur_dist = want if want < cur_dist else R.damp(cur_dist, want, 3, dt)
	var cx := smooth.x + ox * cur_dist
	var cz := smooth.z + oz * cur_dist
	var cy := smooth.y + sp * cur_dist
	if mundo:
		var g := mundo.ground_height(cx, cz)
		if cy < g + 0.5:
			cy = g + 0.5
	var look_up := (0.35 - pitch) * 9.0 if pitch < 0.35 else 0.0
	if shake_t > 0.0:
		shake_t -= dt
		var a := shake_amp * maxf(0.0, shake_t) * 4.0
		cx += (randf() - 0.5) * a
		cy += (randf() - 0.5) * a
		cz += (randf() - 0.5) * a
		if shake_t <= 0.0:
			shake_amp = 0.0
	camera.look_at_from_position(Vector3(cx, cy, cz), Vector3(smooth.x, smooth.y + look_up, smooth.z), Vector3.UP)
