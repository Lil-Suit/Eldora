class_name SalaWs
extends Node
## Porte de src/game/wsroom.js: sala multiplayer no servidor próprio (server/server.js, /ws?sv=N).
## Mesmas mensagens: hello, pres, emit (tópicos chat/fx/mob), peers (completo ou parcial com "keep"),
## msg, ping/pong, kicked, maint. Reconecta sozinho.

signal conectado(ok: bool)
signal peers(ch: Dictionary)     # { host, peers: [ {peer, sameTab, presence, updatedAt} ] }
signal mensagem(topic: String, m: Dictionary)  # { peer, sameTab, data }
signal expulso
signal manutencao

var url := ""
var ws := WebSocketPeer.new()
var self_peer := ""
var last_host = null
var last_peers: Array = []
var my_presence := {}
var my_token := ""
var clock_off = null   # diferença do relógio do servidor (ms)
var ping := -1
var aberto := false
var _estado := -1
var _ping_t := 0.0
var _retry := 0
var _espera := 0.0
var fechado_por_nos := false

func abrir(u: String) -> void:
	url = u
	fechado_por_nos = false
	_conectar()

func _conectar() -> void:
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 1 << 22
	ws.outbound_buffer_size = 1 << 20
	ws.max_queued_packets = 4096
	var err := ws.connect_to_url(url)
	if err != OK:
		_espera = minf(8.0, 0.5 * pow(2, _retry))
		_retry += 1
	_estado = -1

func fechar() -> void:
	fechado_por_nos = true
	ws.close()

func pronto() -> bool:
	return ws.get_ready_state() == WebSocketPeer.STATE_OPEN

func _out(o: Dictionary) -> void:
	if pronto():
		ws.send_text(JSON.stringify(o))

func emit(topic: String, data: Dictionary) -> void:
	_out({ t = "emit", topic = topic, data = data })

func presence(p: Dictionary) -> void:
	my_presence = p
	_out({ t = "pres", p = p })

func auth(token: String) -> void:
	my_token = token
	if token != "":
		_out({ t = "auth", token = token })

func agora_ms() -> float:
	return Time.get_unix_time_from_system() * 1000.0

func _process(dt: float) -> void:
	if _espera > 0.0:
		_espera -= dt
		if _espera <= 0.0 and not fechado_por_nos:
			_conectar()
		return
	ws.poll()
	var st := ws.get_ready_state()
	if st != _estado:
		var antes := _estado
		_estado = st
		if st == WebSocketPeer.STATE_OPEN:
			_retry = 0
		elif st == WebSocketPeer.STATE_CLOSED:
			if antes == WebSocketPeer.STATE_OPEN:
				conectado.emit(false)
			if not fechado_por_nos:
				_espera = minf(8.0, 0.5 * pow(2, _retry))
				_retry += 1
			return
	if st != WebSocketPeer.STATE_OPEN:
		return
	_ping_t += dt
	if _ping_t >= 2.0:
		_ping_t = 0.0
		_out({ t = "ping", at = Time.get_ticks_msec() })
	while ws.get_available_packet_count() > 0:
		var txt := ws.get_packet().get_string_from_utf8()
		var m = JSON.parse_string(txt)
		if typeof(m) != TYPE_DICTIONARY:
			continue
		_on(m)

func _on(m: Dictionary) -> void:
	var t: String = str(m.get("t", ""))
	if t == "hello":
		self_peer = str(m.peer)
		if m.has("now"):
			clock_off = float(m.now) - agora_ms()
		if my_token != "":
			_out({ t = "auth", token = my_token })
		_out({ t = "pres", p = my_presence })
		aberto = true
		conectado.emit(true)
	elif t == "pong":
		if m.has("at"):
			ping = Time.get_ticks_msec() - int(m.at)
	elif t == "kicked":
		fechado_por_nos = true
		expulso.emit()
	elif t == "maint":
		manutencao.emit()
	elif t == "peers":
		var lista: Array = m.get("peers", []) if typeof(m.get("peers")) == TYPE_ARRAY else []
		if m.get("partial") and typeof(m.get("keep")) == TYPE_ARRAY:
			var old := {}
			for q in last_peers:
				old[q.peer] = q
			for id in m.keep:
				if old.has(id):
					lista.append(old[id])
		last_peers = lista
		if m.has("host"):
			last_host = m.host
		if m.has("now"):
			var off := float(m.now) - agora_ms()
			clock_off = off if clock_off == null else clock_off * 0.8 + off * 0.2
		var ps := []
		for p in last_peers:
			ps.append({ peer = p.peer, sameTab = p.peer == self_peer, presence = p.get("presence", {}) if typeof(p.get("presence")) == TYPE_DICTIONARY else {}, updatedAt = p.get("updatedAt", 0) })
		peers.emit({ host = last_host, peers = ps })
	elif t == "msg":
		var topic: String = str(m.get("topic", ""))
		if topic in ["chat", "fx", "mob"]:
			mensagem.emit(topic, { peer = str(m.get("peer", "")), sameTab = str(m.get("peer", "")) == self_peer, data = m.get("data") if typeof(m.get("data")) == TYPE_DICTIONARY else {} })
