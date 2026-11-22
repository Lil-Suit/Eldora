class_name Hud
extends Control
## HUD e controles. PC: WASD, Shift corre, clique esquerdo ataca, botão direito arrastando (ou ←/→) gira a
## câmera, roda aproxima, Enter conversa. Toque: joystick à esquerda e botões à direita no MESMO lugar do
## jogo web (src/ui/style.css: .joybase, .tbtns-wrap, .tb.attack/.sk0-3/.dodge/.potion/.run).

var jogo
var ts := 1.0
var toque := false
# entrada acumulada
var drag := Vector2.ZERO
var cam_touch := Vector2.ZERO
var wheel := 0.0
var pinch := 0.0
var atk_mouse := false
var direito := false
var joy_id := -1
var joy_vec := Vector2.ZERO
var atk_id := -1
var correr_toggle := false
var cam_ids := {}
var botoes := {}
var avisos: Array = []
var chat_log: Array = []
var numeros: Array = []
var chat_edit: LineEdit
var fonte: Font

const OURO := Color(0.85, 0.7, 0.37)
const OURO2 := Color(0.95, 0.84, 0.55)

func _init(j) -> void:
	jogo = j
	name = "HUD"
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL

func _ready() -> void:
	toque = jogo.toque
	ts = 1.6 if toque else 1.0
	fonte = ThemeDB.fallback_font
	chat_edit = LineEdit.new()
	chat_edit.placeholder_text = "Mensagem…"
	chat_edit.visible = false
	chat_edit.max_length = 140
	chat_edit.position = Vector2(16, 0)
	chat_edit.size = Vector2(420, 34)
	chat_edit.text_submitted.connect(func(t): jogo.rede.send_chat(jogo.jogador.nome, t); chat_edit.text = ""; chat_edit.visible = false; grab_focus())
	add_child(chat_edit)
	grab_focus()

func _layout() -> void:
	var s := size
	var wr := Vector2(s.x - 18 * ts, s.y - 26 * ts) # canto inferior direito do grupo de botões
	var c := func(right: float, bottom: float, d: float) -> Dictionary:
		return { c = wr - Vector2(right + d / 2.0, bottom + d / 2.0) * ts, r = d / 2.0 * ts }
	botoes = {
		attack = c.call(0, 0, 92), sk0 = c.call(104, 6, 58), sk1 = c.call(94, 76, 58), sk2 = c.call(40, 122, 58), sk3 = c.call(-20, 150, 58),
		dodge = c.call(176, 14, 52), potion = c.call(170, 80, 46), run = c.call(222, 136, 46),
	}

func joy_base() -> Vector2:
	return Vector2(90 * (1.0 if ts == 1.0 else ts * 0.85), size.y - 110 * (1.0 if ts == 1.0 else ts * 0.85))

func _botao_em(p: Vector2) -> String:
	for k in botoes:
		if p.distance_to(botoes[k].c) <= botoes[k].r * 1.1:
			return k
	return ""

func _gui_input(ev: InputEvent) -> void:
	if ev is InputEventScreenTouch:
		var t := ev as InputEventScreenTouch
		if t.pressed:
			var b := _botao_em(t.position)
			if b == "attack":
				atk_id = t.index
			elif b == "run":
				correr_toggle = not correr_toggle
			elif b != "":
				pass # habilidades, esquiva e poção: próxima parte
			elif t.position.x < size.x * 0.42 and t.position.y > size.y * 0.45 and joy_id < 0:
				joy_id = t.index
				_joy(t.position)
			else:
				cam_ids[t.index] = t.position
		else:
			if t.index == joy_id:
				joy_id = -1
				joy_vec = Vector2.ZERO
			if t.index == atk_id:
				atk_id = -1
			cam_ids.erase(t.index)
		accept_event()
	elif ev is InputEventScreenDrag:
		var d := ev as InputEventScreenDrag
		if d.index == joy_id:
			_joy(d.position)
		elif cam_ids.has(d.index):
			if cam_ids.size() >= 2:
				var ids := cam_ids.keys()
				var o: int = ids[0] if ids[0] != d.index else ids[1]
				var antes: float = (cam_ids[d.index] as Vector2).distance_to(cam_ids[o])
				cam_ids[d.index] = d.position
				pinch -= (cam_ids[d.index] as Vector2).distance_to(cam_ids[o]) - antes
			else:
				cam_touch += d.relative
				cam_ids[d.index] = d.position
		accept_event()
	elif ev is InputEventMouseButton:
		var m := ev as InputEventMouseButton
		grab_focus()
		if m.button_index == MOUSE_BUTTON_LEFT:
			atk_mouse = m.pressed
		elif m.button_index == MOUSE_BUTTON_RIGHT or m.button_index == MOUSE_BUTTON_MIDDLE:
			direito = m.pressed
		elif m.button_index == MOUSE_BUTTON_WHEEL_UP and m.pressed:
			wheel -= 1.0
		elif m.button_index == MOUSE_BUTTON_WHEEL_DOWN and m.pressed:
			wheel += 1.0
	elif ev is InputEventMouseMotion and direito:
		drag += (ev as InputEventMouseMotion).relative

func _joy(p: Vector2) -> void:
	var r := 60.0 * ts
	var v := (p - joy_base()) / r
	joy_vec = v.limit_length(1.0)

func _unhandled_key_input(ev: InputEvent) -> void:
	var k := ev as InputEventKey
	if k and k.pressed and k.keycode == KEY_ENTER and not chat_edit.visible:
		chat_edit.visible = true
		chat_edit.position.y = size.y - 220
		chat_edit.grab_focus()

## estado desta tela para o jogo (zera o que é acumulado)
func ler() -> Dictionary:
	var kb := Vector2.ZERO
	if not chat_edit.has_focus():
		if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): kb.y += 1
		if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): kb.y -= 1
		if Input.is_physical_key_pressed(KEY_D): kb.x += 1
		if Input.is_physical_key_pressed(KEY_A): kb.x -= 1
	var mv := kb.normalized() if kb != Vector2.ZERO else Vector2(joy_vec.x, -joy_vec.y)
	var o := {
		mv = mv, mag = minf(1.0, mv.length()),
		correr = correr_toggle or Input.is_physical_key_pressed(KEY_SHIFT),
		atacar = atk_mouse or atk_id >= 0 or (Input.is_physical_key_pressed(KEY_SPACE) and not chat_edit.has_focus()),
		drag_dx = drag.x, drag_dy = drag.y, cam_dx = cam_touch.x, cam_dy = cam_touch.y, wheel = wheel, pinch = pinch,
		cam_left = Input.is_physical_key_pressed(KEY_LEFT) and not chat_edit.has_focus(), cam_right = Input.is_physical_key_pressed(KEY_RIGHT) and not chat_edit.has_focus(),
	}
	drag = Vector2.ZERO
	cam_touch = Vector2.ZERO
	wheel = 0.0
	pinch = 0.0
	return o

func aviso(t: String) -> void:
	avisos.append({ t = t, ttl = 5.0 })

func chat_msg(nome: String, t: String) -> void:
	chat_log.append("%s: %s" % [nome, t])
	if chat_log.size() > 6:
		chat_log.pop_front()

## número de dano flutuando sobre o alvo
func numero(p: Vector3, t: String, crit := false, em_mim := false) -> void:
	var l := Label3D.new()
	l.text = t
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.font_size = 64 if crit else 48
	l.pixel_size = 0.006
	l.outline_size = 12
	l.modulate = Color(1, 0.35, 0.3) if em_mim else (Color(1, 0.85, 0.3) if crit else Color(1, 1, 1))
	l.position = p
	jogo.add_child(l)
	numeros.append({ l = l, t = 0.0 })

func _process(dt: float) -> void:
	for n in numeros:
		n.t += dt
		n.l.position.y += dt * 1.6
		n.l.modulate.a = clampf(1.2 - n.t, 0.0, 1.0)
	for n in numeros.filter(func(x): return x.t > 1.2):
		n.l.queue_free()
	numeros = numeros.filter(func(x): return x.t <= 1.2)
	for a in avisos:
		a.ttl -= dt
	avisos = avisos.filter(func(x): return x.ttl > 0.0)
	queue_redraw()

func _draw() -> void:
	_layout()
	var P = jogo.jogador
	if P == null:
		return
	# retrato/barras (canto superior esquerdo)
	var x0 := 16.0
	var y0 := 14.0
	draw_rect(Rect2(x0 - 6, y0 - 6, 300, 74), Color(0.06, 0.06, 0.12, 0.65))
	draw_string(fonte, Vector2(x0, y0 + 16), "%s · Nv %d · %s" % [P.nome, P.level, str(Dados.classes[P.cls].name)], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, OURO2)
	var hpf: float = clampf(P.hp / P.stats.maxHp, 0.0, 1.0)
	draw_rect(Rect2(x0, y0 + 24, 280, 16), Color(0.2, 0.05, 0.06, 0.9))
	draw_rect(Rect2(x0, y0 + 24, 280 * hpf, 16), Color(0.86, 0.2, 0.22))
	draw_string(fonte, Vector2(x0 + 6, y0 + 37), "%d / %d" % [int(P.hp), int(P.stats.maxHp)], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)
	var xn := Regras.xp_to_next(P.level)
	draw_rect(Rect2(x0, y0 + 46, 280, 8), Color(0.12, 0.1, 0.2, 0.9))
	draw_rect(Rect2(x0, y0 + 46, 280 * clampf(P.xp / xn, 0.0, 1.0), 8), Color(0.62, 0.45, 1.0))
	# rede
	var R = jogo.rede
	var st := "%s · %d jogadores · ping %s" % [R.status, R.fantasmas.size() + 1, str(R.ping()) + " ms" if R.ping() >= 0 else "—"]
	draw_string(fonte, Vector2(0, 26), st, HORIZONTAL_ALIGNMENT_RIGHT, size.x - 16, 14, Color(0.85, 0.9, 1.0))
	# avisos
	var ay := 110.0
	for a in avisos:
		draw_string(fonte, Vector2(0, ay), a.t, HORIZONTAL_ALIGNMENT_CENTER, size.x, 20, Color(1, 0.9, 0.6, clampf(a.ttl, 0.0, 1.0)))
		ay += 28
	if not P.vivo:
		draw_string(fonte, Vector2(0, size.y / 2.0), "Você caiu… voltando para a vila", HORIZONTAL_ALIGNMENT_CENTER, size.x, 28, Color(1, 0.6, 0.55))
	# bate-papo
	var cy := size.y - (260.0 if toque else 60.0)
	for i in chat_log.size():
		draw_string(fonte, Vector2(16, cy - (chat_log.size() - i) * 20), chat_log[i], HORIZONTAL_ALIGNMENT_LEFT, 520, 15, Color(1, 1, 1, 0.9))
	if not toque:
		return
	# joystick
	var jb := joy_base()
	var jr := 60.0 * ts * (1.0 if ts == 1.0 else 0.85)
	draw_circle(jb, jr, Color(1, 1, 1, 0.08 if joy_id < 0 else 0.14))
	draw_arc(jb, jr, 0, TAU, 48, Color(OURO, 0.4 if joy_id < 0 else 0.8), 2.0)
	draw_circle(jb + joy_vec * jr, jr * 0.46, Color(0.92, 0.78, 0.45, 0.85))
	# botões
	for k in botoes:
		var b: Dictionary = botoes[k]
		var on: bool = (k == "attack" and atk_id >= 0) or (k == "run" and correr_toggle)
		var fundo := Color(0.42, 0.33, 0.16, 0.92) if k == "attack" else (Color(0.23, 0.54, 0.35, 0.9) if on and k == "run" else Color(0.12, 0.12, 0.2, 0.88))
		var bloqueado: bool = k.begins_with("sk") or k == "dodge" or k == "potion"
		draw_circle(b.c, b.r, fundo if not bloqueado else Color(0.08, 0.08, 0.14, 0.7))
		draw_arc(b.c, b.r, 0, TAU, 40, Color(0.95, 0.84, 0.55) if k == "attack" or on else Color(OURO, 0.6), 2.0)
		var rot: String = { attack = "⚔", run = "»", dodge = "↷", potion = "♥" }.get(k, "✦")
		draw_string(fonte, b.c + Vector2(-b.r, b.r * 0.32), rot, HORIZONTAL_ALIGNMENT_CENTER, b.r * 2.0, int(b.r * 0.9), Color(OURO2, 0.45 if bloqueado else 1.0))
