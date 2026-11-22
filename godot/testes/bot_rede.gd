extends Node
## Teste de rede sem tela: entra no servidor, espera os slimes do anfitrião, vai até o mais perto,
## bate até ele morrer e confere o XP. Imprime "BOT …" (lido por tools/godot-rede.mjs).
## Fica no mundo por --ficar=<s> segundos (para o jogador web conferir que vê o herói da Godot).

var jogo: Jogo
var t := 0.0
var fase := "esperando"
var alvo: Inimigo = null
var xp0 := 0.0
var lv0 := 1
var bc0 := 0
var ficar := 25.0
var res := {}
var vistos_max := 0
var ponto := Vector3(12, 0, -16)

func iniciar(j: Jogo, args: PackedStringArray) -> void:
	jogo = j
	for a in args:
		if a.begins_with("--ficar="): ficar = a.substr(8).to_float()
		if a.begins_with("--ponto="):
			var p := a.substr(8).split(",")
			ponto = Vector3(p[0].to_float(), 0, p[1].to_float())
	jogo.bot = _entrada
	jogo.jogador.teleport(ponto.x, ponto.z)

func _entrada(dt: float) -> Dictionary:
	t += dt
	var P := jogo.jogador
	var o := { mv = Vector2.ZERO, mag = 0.0, correr = false, atacar = false }
	var vivos := jogo.rede.replicas.values().filter(func(e): return e.alive() and e.tipo.contains("slime"))
	vistos_max = maxi(vistos_max, jogo.rede.replicas.size())
	match fase:
		"esperando":
			if t > 60.0:
				_fim("sem monstros do anfitrião")
			elif vivos.size() and t > 3.0:
				vivos.sort_custom(func(a, b): return a.pos.distance_to(P.pos) < b.pos.distance_to(P.pos))
				alvo = vivos[0]
				xp0 = P.xp
				lv0 = P.level
				bc0 = P.basic_count
				res.monstros_vistos = jogo.rede.replicas.size()
				res.alvo = { tipo = alvo.tipo, nivel = alvo.level, vida = alvo.stats.maxHp, nid = alvo.nid }
				res.host = str(jogo.rede.host_peer)
				res.eu = jogo.rede.self_peer
				fase = "lutando"
				print("BOT alvo ", JSON.stringify(res.alvo))
		"lutando":
			if alvo == null or not is_instance_valid(alvo) or alvo.dead:
				fase = "conferindo"
				t = 0.0
			elif t > 90.0:
				_fim("o slime não morreu")
			else:
				var d := Vector2(alvo.pos.x - P.pos.x, alvo.pos.z - P.pos.z)
				if d.length() > 2.0:
					o.dir = d.normalized()
					o.mag = 1.0
					if d.length() > 12.0:
						P.teleport(alvo.pos.x - d.normalized().x * 2.0, alvo.pos.z - d.normalized().y * 2.0)
				else:
					P.yaw = atan2(d.x, d.y)
					o.atacar = true
		"conferindo":
			if (P.xp > xp0 or P.level > lv0) or t > 6.0:
				res.golpes = P.basic_count - bc0
				res.xp_ganho = P.xp - xp0
				res.nivel = P.level
				res.abate_confirmado = P.xp > xp0 or P.level > lv0
				res.monstros_max = vistos_max
				print("BOT resultado ", JSON.stringify(res))
				fase = "ficando"
				t = 0.0
		"ficando":
			res.jogadores_vistos = jogo.rede.fantasmas.size()
			# anda em círculo devagar (para o jogador web ver posição e animação mudando)
			o.dir = Vector2(cos(t * 0.8), sin(t * 0.8))
			o.mag = 0.6
			if t > ficar:
				var nomes := []
				for f in jogo.rede.fantasmas.values():
					nomes.append(str(f.pr.get("n", "")))
				print("BOT vi_jogadores ", JSON.stringify(nomes))
				_fim("")
	if o.has("dir") and not o.has("mv"):
		o.mv = Vector2.ZERO
	return o

func _fim(erro: String) -> void:
	if erro != "":
		print("BOT erro ", erro)
	print("BOT fim")
	get_tree().quit(0 if erro == "" else 1)
