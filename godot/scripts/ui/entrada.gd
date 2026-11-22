class_name Entrada
extends Control
## Tela de entrada: convidado com nome/classe/gênero, servidor e mundo (Eldoria 1/2).
## Preparado para conta: o botão "Entrar com conta" usará /api/login do mesmo servidor (próxima parte).

signal entrar(nome: String, classe: String, genero: String, servidor: String, sv: int)

var nome: LineEdit
var classe: OptionButton
var genero: OptionButton
var servidor: LineEdit
var sv: OptionButton
var msg: Label
const CLASSES := ["guerreiro", "arqueiro", "mago"]

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var fundo := ColorRect.new()
	fundo.color = Color(0.05, 0.04, 0.09)
	fundo.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(fundo)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.custom_minimum_size = Vector2(420, 0)
	box.position = Vector2(-210, -230)
	box.add_theme_constant_override("separation", 10)
	add_child(box)
	var t := Label.new()
	t.text = "ELDORIA"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 48)
	t.add_theme_color_override("font_color", Color(0.95, 0.84, 0.55))
	box.add_child(t)
	nome = LineEdit.new()
	nome.placeholder_text = "Nome do herói"
	nome.max_length = 16
	nome.text = Dados.get_cfg("nome", "")
	box.add_child(nome)
	classe = OptionButton.new()
	for c in CLASSES:
		classe.add_item(str(Dados.classes[c].name))
	classe.selected = maxi(0, CLASSES.find(Dados.get_cfg("classe", "guerreiro")))
	box.add_child(classe)
	genero = OptionButton.new()
	genero.add_item("Masculino")
	genero.add_item("Feminino")
	genero.selected = 1 if Dados.get_cfg("genero", "M") == "F" else 0
	box.add_child(genero)
	servidor = LineEdit.new()
	servidor.placeholder_text = "Servidor (ex.: https://seu-site ou http://127.0.0.1:10000)"
	servidor.text = Dados.get_cfg("servidor", "https://eldoria-online-gztl.onrender.com")
	box.add_child(servidor)
	sv = OptionButton.new()
	sv.add_item("Eldoria 1")
	sv.add_item("Eldoria 2")
	sv.selected = int(Dados.get_cfg("sv", 1)) - 1
	box.add_child(sv)
	var b := Button.new()
	b.text = "Entrar como convidado"
	b.custom_minimum_size = Vector2(0, 48)
	b.pressed.connect(_ok)
	box.add_child(b)
	var conta := Button.new()
	conta.text = "Entrar com conta (em breve)"
	conta.disabled = true
	box.add_child(conta)
	msg = Label.new()
	msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(msg)

func _ok() -> void:
	var n := nome.text.strip_edges()
	if n.length() < 2:
		msg.text = "Escolha um nome (2 letras ou mais)."
		return
	Dados.set_cfg("nome", n)
	Dados.set_cfg("classe", CLASSES[classe.selected])
	Dados.set_cfg("genero", "F" if genero.selected == 1 else "M")
	Dados.set_cfg("servidor", servidor.text.strip_edges())
	Dados.set_cfg("sv", sv.selected + 1)
	Dados.salvar_cfg()
	entrar.emit(n, CLASSES[classe.selected], "F" if genero.selected == 1 else "M", servidor.text.strip_edges(), sv.selected + 1)
