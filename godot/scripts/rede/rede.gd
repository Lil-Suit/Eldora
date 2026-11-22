class_name Rede
extends Node
## Porte da parte de cliente de src/game/net.js. O app Godot é SEMPRE cliente: manda "nh: 1" na presença
## (o servidor nunca o escolhe como anfitrião) e recebe os monstros do anfitrião (estado ~15x por segundo).
## Presença no MESMO formato do jogo web (os jogadores do navegador veem o herói da Godot normalmente).

const R := preload("res://scripts/mundo/ruido.gd")

var jogo
var sala: SalaWs
var status := "offline"
var self_peer := ""
var host_peer = null       # anfitrião escolhido pelo servidor
var fantasmas := {}        # peer → Fantasma (outros jogadores)
var replicas := {}         # nid → Inimigo
var joined_at := 0.0
var last_send := 0.0
var last_sent := ""
var dmg_q: Array = []
var dmg_t := 0.0
var chat: Array = []
var char_id := ""
var tempo := 0.0

func _init(j) -> void:
	jogo = j
	name = "Rede"
	joined_at = Time.get_unix_time_from_system() * 1000.0

## servidor "http(s)://endereço" → ws(s)://endereço/ws?sv=N
static func url_ws(servidor: String, sv: int) -> String:
	var s := servidor.strip_edges().trim_suffix("/")
	if s.begins_with("https://"):
		s = "wss://" + s.substr(8)
	elif s.begins_with("http://"):
		s = "ws://" + s.substr(7)
	elif not s.begins_with("ws"):
		s = "ws://" + s
	return s + "/ws?sv=%d" % sv

func conectar(servidor: String, sv: int) -> void:
	sala = SalaWs.new()
	add_child(sala)
	sala.conectado.connect(func(ok): status = "conectado" if ok else "reconectando"; last_sent = "")
	sala.peers.connect(_on_peers)
	sala.mensagem.connect(_on_msg)
	sala.expulso.connect(func(): status = "outra sessão abriu este personagem"; jogo.aviso("Este personagem entrou em outro aparelho."))
	sala.manutencao.connect(func(): jogo.aviso("Servidor em atualização: esta versão do app pode estar desatualizada."))
	status = "conectando"
	sala.abrir(url_ws(servidor, sv))

func is_client() -> bool:
	return true

func ping() -> int:
	return sala.ping if sala else -1

# ---------------- presença (net.js → update) ----------------
func presenca() -> Dictionary:
	var P = jogo.jogador
	var ini: Dictionary = Dados.J.inicio.get(P.cls, {})
	var a: String = P.acao.name if P.acao else ("run" if P.anim.move > 0.1 else "idle")
	return {
		vv = Dados.versao_servidor if Dados.versao_servidor != "" else Dados.versao,
		n = P.nome, c = P.cls, l = P.level,
		x = snappedf(P.pos.x, 0.01), y = snappedf(P.pos.y, 0.01), z = snappedf(P.pos.z, 0.01),
		r = snappedf(P.yaw, 0.01), a = a, m = snappedf(P.anim.move, 0.1),
		e = null, ar = P.area, d = 0 if P.vivo else 1, w = ini.get("w"), wr = ini.get("wr"), wt = ini.get("wt"),
		eq = ini.get("eq", ""), sk = P.skin, gd = P.genero, fx = null,
		id = char_id, j = joined_at, v = 1, mb = 1 if jogo.toque else 0,
		pt = null, hb = int(Time.get_unix_time_from_system() / 2.0) % 1000, lu = 0,
		hp = roundi(P.hp / P.stats.maxHp * 100.0), mt = 0, sw = 1 if P.nadando else 0, pk = 0,
		nh = 1, # app nativo (Godot): nunca vira anfitrião
	}

func _process(dt: float) -> void:
	tempo += dt
	if jogo.jogador == null:
		return
	# monstros: segue o estado do anfitrião
	for nid in replicas.keys():
		var e: Inimigo = replicas[nid]
		e.net_update(dt, tempo)
		if e.removed:
			e.queue_free()
			replicas.erase(nid)
	for f in fantasmas.values():
		f.atualizar(dt, jogo.jogador)
	if sala == null:
		return
	last_send += dt
	if last_send > 0.1:
		last_send = 0.0
		var pr := presenca()
		var key := JSON.stringify(pr)
		if key != last_sent and sala.pronto():
			last_sent = key
			sala.presence(pr)
	if dmg_q.size() and host_peer != null:
		dmg_t += dt
		if dmg_t >= 0.033:
			dmg_t = 0.0
			var lote := dmg_q.slice(0, 40)
			dmg_q = dmg_q.slice(40)
			sala.emit("mob", { d = lote, to = host_peer })

# ---------------- lista de jogadores ----------------
func _on_peers(ch: Dictionary) -> void:
	host_peer = ch.host
	var seen := {}
	for p in ch.peers:
		if p.sameTab:
			self_peer = p.peer
			continue
		var pr: Dictionary = p.presence
		seen[p.peer] = true
		if not pr.has("c") or not Dados.classes.has(str(pr.c)):
			continue
		if pr.get("id") and pr.id == char_id:
			continue
		var g: Fantasma = fantasmas.get(p.peer)
		if g == null:
			g = Fantasma.new(jogo, p.peer, pr)
			fantasmas[p.peer] = g
			jogo.add_child(g)
		g.receber(pr, tempo)
	for id in fantasmas.keys():
		if not seen.has(id):
			fantasmas[id].queue_free()
			fantasmas.erase(id)

# ---------------- mensagens ----------------
func _on_msg(topic: String, m: Dictionary) -> void:
	if topic == "mob":
		_on_mob(m)
	elif topic == "fx":
		_on_fx(m)
	elif topic == "chat":
		var txt := str(m.data.get("text", "")).left(140)
		if txt != "":
			var nome := str(m.data.get("n", "Viajante")).left(16)
			chat.append({ nome = nome, txt = txt })
			if chat.size() > 40:
				chat.pop_front()
			jogo.hud.chat_msg(nome, txt)

func _on_mob(m: Dictionary) -> void:
	if m.sameTab:
		return
	var d: Dictionary = m.data
	var P = jogo.jogador
	if d.has("s") and d.has("ar") and str(d.ar) != P.area:
		return
	if d.has("s") and m.peer == host_peer:
		_snapshot(d)
	elif d.has("k") and m.peer == host_peer:
		var e: Inimigo = replicas.get(int(Dados.n(d.k)))
		if e:
			if not e.dead:
				e.dead = true
				e.state = "dead"
				e.dead_t = 0.0
			if not e.rewarded:
				var c: Array = d.get("c", []) if typeof(d.get("c")) == TYPE_ARRAY else []
				if tempo - e.local_hit < 60.0 or c.has(self_peer):
					e.rewarded = true
					jogo.ao_matar(e)
	elif d.has("h") and str(d.h) == self_peer and m.peer == host_peer:
		jogo.jogador.levar_golpe(clampf(Dados.n(d.get("dmg")), 0.0, 5000.0), str(d.get("n", "Monstro")).left(40), int(Dados.n(d.get("l"), 1.0)))

func _snapshot(d: Dictionary) -> void:
	var seen := {}
	var lista: Array = d.s if typeof(d.s) == TYPE_ARRAY else []
	for r in lista.slice(0, 220):
		if typeof(r) != TYPE_ARRAY or r.size() < 15:
			continue
		var nid := int(r[0])
		var ti := int(r[1])
		var ar := int(r[3])
		if ti < 0 or ti >= Dados.tipos.size() or ar < 0 or ar >= Dados.AREAS.size():
			continue
		var tipo: String = Dados.tipos[ti]
		var area: String = Dados.AREAS[ar]
		var fl := int(r[12])
		seen[nid] = true
		var e: Inimigo = replicas.get(nid)
		if e and e.removed and not (fl & 1):
			replicas.erase(nid)
			e.queue_free()
			e = null
		if e == null:
			if fl & 1:
				continue
			e = Inimigo.new(jogo, tipo, clampi(int(r[2]), 1, 500), nid, r[4] / 10.0, r[5] / 10.0, area)
			if int(r[14]) > 0:
				e.state = "spawn"
			replicas[nid] = e
			jogo.add_child(e)
		var st_i := int(r[8])
		var act_i := int(r[9])
		e.net_apply({ x = r[4] / 10.0, z = r[5] / 10.0, yaw = r[6] / 100.0, hp = clampf(r[7] / 1000.0, 0.0, 1.0),
			st = Dados.STATES[st_i] if st_i >= 0 and st_i < Dados.STATES.size() else "idle",
			act = Dados.ACTS[act_i] if act_i >= 0 and act_i < Dados.ACTS.size() else null,
			p = r[10] / 100.0, wind = r[11] / 100.0, dead = (fl & 1) != 0, mv = r[13] / 10.0, spawn = r[14] / 100.0 }, tempo)
	for nid in replicas.keys():
		if seen.has(nid):
			continue
		var e: Inimigo = replicas[nid]
		if tempo - e.net_seen > 3.0 and not e.removed:
			e.removed = true
	# horário do dia: vem do relógio do servidor (sala.clock_off)

func _on_fx(m: Dictionary) -> void:
	if m.sameTab:
		return
	var d: Dictionary = m.data
	if d.get("type") == "pa":
		var g: Fantasma = fantasmas.get(m.peer)
		if g and typeof(d.get("a")) == TYPE_STRING:
			g.acao_rede(str(d.a).left(16), clampf(Dados.n(d.get("d"), 0.4), 0.1, 4.0), int(Dados.n(d.get("v"))), tempo)

# ---------------- cliente → anfitrião ----------------
func send_damage(e: Inimigo, dmg: float, o: Dictionary = {}) -> void:
	dmg_q.append([e.nid, roundi(dmg), o.get("stun", 0), o.get("slow", 0), o.get("slowDur", 0), o.get("freeze", 0), o.get("knock", 0), snappedf(o.get("dirX", 0.0), 0.01), snappedf(o.get("dirZ", 0.0), 0.01)])

func send_action(nome: String, dur: float, variant: int) -> void:
	if sala and fantasmas.size():
		sala.emit("fx", { type = "pa", a = nome.left(16), d = snappedf(dur, 0.01), v = variant })

func level_up(nome: String, level: int) -> void:
	if sala:
		sala.emit("fx", { type = "levelup", n = nome })
		sala.emit("fx", { type = "announce", text = "alcançou o nível %d!" % level, n = nome })

func send_chat(nome: String, txt: String) -> void:
	if sala and txt.strip_edges() != "":
		sala.emit("chat", { text = txt.strip_edges().left(140), n = nome })

## horário do dia (0..1) pelo relógio do servidor, igual ao jogo web
func hora_do_dia() -> float:
	var off: float = sala.clock_off if sala and sala.clock_off != null else 0.0
	var t := (Time.get_unix_time_from_system() * 1000.0 + off) / 1000.0 / float(Dados.balance.dayLengthSec) + 0.32
	return fposmod(t, 1.0)
