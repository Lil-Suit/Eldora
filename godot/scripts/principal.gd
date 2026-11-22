extends Node
## Início do jogo: tela de entrada → partida (Jogo).
## Testes (argumentos depois de "--"): --teste=terreno|regras|rede|foto ; entrada direta:
##   --servidor=http://127.0.0.1:10000 --nome=Ana --classe=guerreiro [--genero=F] [--sv=1]

var jogo: Jogo

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var a := {}
	for s in args:
		if s.begins_with("--") and s.contains("="):
			a[s.substr(2, s.find("=") - 2)] = s.substr(s.find("=") + 1)
	if a.has("teste") and a.teste != "rede":
		var n: Node = load("res://testes/testes.gd").new()
		n.name = "Testes"
		add_child(n)
		n.call_deferred("rodar", a.teste, args)
		return
	if a.has("servidor") and a.has("nome"):
		_entrar(a.nome, a.get("classe", "guerreiro"), a.get("genero", "M"), a.servidor, int(a.get("sv", "1")))
		if a.get("teste", "") == "rede":
			var b: Node = load("res://testes/bot_rede.gd").new()
			add_child(b)
			b.iniciar(jogo, args)
		return
	var e := Entrada.new()
	add_child(e)
	e.entrar.connect(func(n, c, g, s, v): e.queue_free(); _entrar(n, c, g, s, v))

func _entrar(nome: String, classe: String, genero: String, servidor: String, sv: int) -> void:
	# versão do servidor (vai na presença): sem ela o servidor isolaria este jogador como "versão antiga"
	if servidor != "":
		var h := HTTPRequest.new()
		add_child(h)
		h.timeout = 8.0
		h.request_completed.connect(func(_r, code, _hd, body):
			if code == 200:
				var j = JSON.parse_string(body.get_string_from_utf8())
				if typeof(j) == TYPE_DICTIONARY and j.has("versao"):
					Dados.versao_servidor = str(j.versao)
					if Dados.versao_servidor != Dados.versao and jogo:
						jogo.aviso("Servidor na versão %s (dados do app: %s)." % [Dados.versao_servidor, Dados.versao])
			h.queue_free())
		h.request(servidor.strip_edges().trim_suffix("/") + "/api/status")
	jogo = Jogo.new()
	add_child(jogo)
	jogo.iniciar(nome, classe, genero, servidor, sv)
