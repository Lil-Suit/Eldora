class_name Terreno
## Porte de src/engine/terrain.js (Vale, área 'world'): MESMA função de altura e MESMAS cores do chão,
## mesmas coordenadas em metros (de -200 a 200, células de 2 m). Conferido com o jogo web em
## testes/teste_terreno.gd (amostra exportada por tools/godot-export.mjs).

const R := preload("res://scripts/mundo/ruido.gd")

var N := 200
var S := 400.0
var step := 2.0
var half := 200.0
var h := PackedFloat32Array()     # altura de cada vértice (N+1)²
var cores := PackedColorArray()   # cor (linear) de cada vértice

# configuração (de dados/jogo.json → config/world.js)
var ROADS: Array = []        # de PackedFloat64Array
var RIVER: PackedFloat64Array
var FOREST: PackedFloat64Array
var WALL: PackedFloat64Array
var LAKE: Dictionary
var POND: Dictionary
var PLATEAU: Dictionary
var HILL: Dictionary
var CRYPT: Dictionary
var VC: Dictionary           # centro da vila
var PEXT: Dictionary         # PLATEAU_EXT
var FLATS: Array = []
var SNOW := false
var PAL := {}
var SNOW_A: Color
var SNOW_B: Color
var SNOW_ROAD: Color

func _init() -> void:
	var M: Dictionary = Dados.mundo
	N = int(M.WORLD.grid)
	S = float(M.WORLD.size)
	step = S / N
	half = S / 2.0
	for r in M.ROADS:
		ROADS.append(R.poly(r))
	RIVER = R.poly(M.RIVER)
	FOREST = R.poly(M.FOREST_PATH)
	WALL = R.poly(M.VILLAGE.wallPoly)
	LAKE = M.LAKE
	POND = M.POND
	PLATEAU = M.PLATEAU
	HILL = M.HILL
	CRYPT = M.CRYPT_MOUND
	VC = M.VILLAGE.center
	PEXT = M.PLATEAU_EXT
	SNOW = Dados.natal
	# áreas planas (mesma lista de terrain.js)
	FLATS = [
		[float(VC.x), float(VC.z), 31.0, 10.0, 1.6],
		[-106.0, -42.0, 38.0, 12.0, 2.3],
		[-26.0, -102.0, 34.0, 11.0, 2.8],
		[-72.0, -78.0, 8.0, 6.0, 2.6],
		[148.0, -111.0, 6.0, 5.0, 2.6],
		[0.0, 100.0, 62.0, 12.0, 1.6],
		[float(M.RUNES.mural.x), float(M.RUNES.mural.z), 5.0, 4.0, 2.8],
	]
	var C := func(hx: int) -> Color: return Dados.cor_lin(hx)
	PAL = {
		grassA = C.call(0x6aa84f), grassB = C.call(0x93c264), grassGold = C.call(0xb9b65a), forest = C.call(0x47733a), forestB = C.call(0x55823f),
		road = C.call(0xb39466), roadB = C.call(0x9e8056), plaza = C.call(0xb7a98c), sand = C.call(0xd1bd88), under = C.call(0x6b8a74), deep = C.call(0x3c6466),
		rock = C.call(0x8b857b), rockDark = C.call(0x6f6a64), snow = C.call(0xeef2f5), corrupt = C.call(0x5b3f73), corruptB = C.call(0x7a4a8f),
		camp = C.call(0x9a7d55), ruins = C.call(0xa8a294), moss = C.call(0x7d8f5a),
	}
	SNOW_A = C.call(0xeef3f8)
	SNOW_B = C.call(0xdfe7f0)
	SNOW_ROAD = C.call(0xc9ced6)

func low_freq(x: float, z: float) -> float:
	return R.fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 3) * 5.5 + 1.8

func road_distance(x: float, z: float) -> float:
	var d := INF
	for r in ROADS:
		var v := R.dist_poly(x, z, r)
		if v < d:
			d = v
	return d

func raw_height(x: float, z: float) -> float:
	var hh := low_freq(x, z) + R.fbm(x * 0.045, z * 0.045, 2) * 1.1
	var rd := road_distance(x, z)
	if rd < 4.5:
		hh = R.lerp_(hh, low_freq(x, z), (1.0 - R.ss(1.5, 4.5, rd)) * 0.75)
	if hh < 0.9:
		hh = 0.9 - (0.9 - hh) * 0.12
	hh += float(HILL.amp) * exp(-(pow(x - float(HILL.x), 2) + pow(z - float(HILL.z), 2)) / (2.0 * pow(float(HILL.sigma), 2)))
	hh += float(CRYPT.amp) * exp(-(pow(x - float(CRYPT.x), 2) + pow(z - float(CRYPT.z), 2)) / (2.0 * pow(float(CRYPT.sigma), 2)))
	for f in FLATS:
		var d := R.dist2(x, z, f[0], f[1])
		if d < f[2] + f[3]:
			hh = R.lerp_(hh, f[4] + R.vnoise(x * 0.2, z * 0.2) * 0.12, 1.0 - R.ss(f[2], f[2] + f[3], d))
	var PL := PLATEAU
	var dp := R.dist2(x, z, float(PL.x), float(PL.z))
	var pm := 1.0 - R.ss(float(PL.r) - 1.0, float(PL.r) + 1.6, dp)
	if pm > 0.0:
		hh = R.lerp_(hh, float(PL.h) + R.fbm(x * 0.08, z * 0.08, 2) * 0.35, pm)
	var RP: Dictionary = PL.ramp
	if z > float(RP.zTop) - 4.0 and z < float(RP.zBottom) + 4.0 and x > float(RP.x0) - 5.0 and x < float(RP.x1) + 5.0:
		var t := R.clamp_((z - float(RP.zTop)) / (float(RP.zBottom) - float(RP.zTop)), 0.0, 1.0)
		var target := R.lerp_(float(PL.h), hh, t * t * (3.0 - 2.0 * t))
		var cx := (float(RP.x0) + float(RP.x1)) / 2.0
		var hw := (float(RP.x1) - float(RP.x0)) / 2.0
		var lat := 1.0 - R.ss(hw, hw + 2.5, absf(x - cx))
		var along := 1.0 - R.ss(float(RP.zBottom), float(RP.zBottom) + 4.0, z)
		hh = R.lerp_(hh, maxf(hh, target), lat * along)
	var dr := R.dist_poly(x, z, RIVER)
	if dr < 9.0:
		hh = R.lerp_(hh, -2.4, 1.0 - R.ss(2.2, 8.5, dr))
	var dl := R.dist2(x, z, float(LAKE.x), float(LAKE.z))
	if dl < float(LAKE.r) + 3.0:
		hh = R.lerp_(hh, -2.7, 1.0 - R.ss(float(LAKE.r) - 6.0, float(LAKE.r) + 2.0, dl))
	if dl < float(LAKE.island) + 2.0:
		hh = R.lerp_(hh, 0.85 + R.vnoise(x * 0.5, z * 0.5) * 0.1, 1.0 - R.ss(float(LAKE.island) - 2.2, float(LAKE.island) + 1.2, dl))
	var dpo := R.dist2(x, z, float(POND.x), float(POND.z))
	if dpo < float(POND.r) + 3.0:
		hh = R.lerp_(hh, -1.8, 1.0 - R.ss(float(POND.r) - 3.0, float(POND.r) + 1.5, dpo))
	var flat := 1.0 - R.ss(float(PL.r) - 1.0, float(PL.r) + 4.0, dp)
	var e := maxf(absf(x), absf(z))
	if e > 148.0:
		var k := (e - 148.0) / 9.0
		hh += (pow(k, 1.7) * 4.0 + R.fbm(x * 0.05, z * 0.05, 3) * 4.0 * minf(1.0, k / 3.0)) * (1.0 - flat)
	return hh

## dentro da muralha (polígono) e distância até ela — config/world.js
func in_village(x: float, z: float) -> bool:
	var P := WALL
	var n := P.size() / 2
	var inside := false
	var j := n - 1
	for i in n:
		var xi := P[i * 2]
		var zi := P[i * 2 + 1]
		var xj := P[j * 2]
		var zj := P[j * 2 + 1]
		if (zi > z) != (zj > z) and x < ((xj - xi) * (z - zi)) / (zj - zi) + xi:
			inside = not inside
		j = i
	return inside

func village_edge_dist(x: float, z: float) -> float:
	var P := WALL
	var n := P.size() / 2
	var best := INF
	var j := n - 1
	for i in n:
		var ax := P[j * 2]
		var az := P[j * 2 + 1]
		var dx := P[i * 2] - ax
		var dz := P[i * 2 + 1] - az
		var t := maxf(0.0, minf(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
		best = minf(best, Vector2(x - ax - dx * t, z - az - dz * t).length())
		j = i
	return best

func color_at(x: float, z: float, hh: float, slope: float) -> Color:
	var n := R.vnoise(x * 0.06, z * 0.06) * 0.5 + 0.5
	var n2 := R.vnoise(x * 0.21 + 5.0, z * 0.21 - 3.0) * 0.5 + 0.5
	var o: Color = PAL.grassA.lerp(PAL.grassB, n * 0.8)
	o = o.lerp(PAL.grassGold, R.ss(0.62, 0.9, R.vnoise(x * 0.018 - 8.0, z * 0.018 + 2.0) * 0.5 + 0.5) * 0.55)
	var fo := 1.0 - R.ss(24.0, 48.0, R.dist_poly(x, z, FOREST))
	if fo > 0.0:
		o = o.lerp(PAL.forest if n2 > 0.5 else PAL.forestB, fo * 0.85)
	var co := 1.0 - R.ss(22.0, 62.0, R.dist2(x, z, float(PLATEAU.x), float(PLATEAU.z)))
	if z < -176.0 and x > float(PEXT.x0) and x < float(PEXT.x1):
		co = maxf(co, R.ss(-176.0, -186.0, z))
	if co > 0.0:
		o = o.lerp(PAL.corrupt if n2 > 0.45 else PAL.corruptB, co * 0.8)
	var dc := R.dist2(x, z, -106.0, -42.0)
	if dc < 40.0:
		o = o.lerp(PAL.camp, (1.0 - R.ss(28.0, 40.0, dc)) * (0.6 + n2 * 0.4))
	var dru := R.dist2(x, z, -26.0, -102.0)
	if dru < 36.0:
		o = o.lerp(PAL.ruins if n2 > 0.35 else PAL.moss, (1.0 - R.ss(14.0, 36.0, dru)) * 0.85)
	var dv := R.dist2(x, z, float(VC.x), float(VC.z))
	if dv < 12.0:
		o = o.lerp(PAL.plaza, (1.0 - R.ss(7.0, 12.0, dv)) * 0.9)
	var rd := road_distance(x, z)
	if rd < 3.0:
		o = o.lerp(PAL.road if n2 > 0.5 else PAL.roadB, (1.0 - R.ss(1.3, 2.9, rd)) * 0.95)
	if SNOW and hh > -0.3:
		var sn := 1.0 if in_village(x, z) else 1.0 - R.ss(6.0, 46.0, village_edge_dist(x, z) + n2 * 8.0)
		if sn > 0.0:
			o = o.lerp(SNOW_ROAD if rd < 2.6 else (SNOW_A if n2 > 0.5 else SNOW_B), sn * (0.8 if rd < 2.6 else 0.96))
	if hh < 0.5 and not (SNOW and hh > -0.3 and village_edge_dist(x, z) < 30.0):
		o = o.lerp(PAL.sand, 1.0 - R.ss(-0.25, 0.5, hh))
	if hh < -0.5:
		o = o.lerp(PAL.under, 1.0 - R.ss(-1.2, -0.5, hh))
	if hh < -1.3:
		o = o.lerp(PAL.deep, 1.0 - R.ss(-2.4, -1.3, hh))
	if slope > 0.75:
		o = o.lerp(PAL.rock if n2 > 0.5 else PAL.rockDark, R.ss(0.75, 1.4, slope))
	if hh > 14.0:
		o = o.lerp(PAL.rock, R.ss(14.0, 22.0, hh))
	if hh > 32.0:
		o = o.lerp(PAL.snow, R.ss(32.0, 40.0, hh + n * 4.0))
	o.a = 1.0
	return o

## monta a grade (alturas + cores). Usa o arquivo pronto (dados/terreno_vale.bin) se existir.
func gerar(usar_cache := true) -> void:
	var V := N + 1
	if usar_cache and _carregar("res://dados/terreno_vale.bin"):
		return
	h.resize(V * V)
	for j in V:
		for i in V:
			h[j * V + i] = raw_height(-half + i * step, -half + j * step)
	cores.resize(V * V)
	for j in V:
		for i in V:
			var x := -half + i * step
			var z := -half + j * step
			cores[j * V + i] = color_at(x, z, h[j * V + i], slope_at(x, z))

func _carregar(p: String) -> bool:
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		return false
	var V := N + 1
	if f.get_32() != 0x454C4454 or f.get_32() != V or f.get_pascal_string() != Dados.versao + (":natal" if SNOW else ""):
		return false # gerado com outros dados: recalcula
	h = f.get_buffer(V * V * 4).to_float32_array()
	var c := f.get_buffer(V * V * 12).to_float32_array()
	cores.resize(V * V)
	for k in V * V:
		cores[k] = Color(c[k * 3], c[k * 3 + 1], c[k * 3 + 2])
	return h.size() == V * V

func salvar(p: String) -> void:
	var f := FileAccess.open(p, FileAccess.WRITE)
	var V := N + 1
	f.store_32(0x454C4454)
	f.store_32(V)
	f.store_pascal_string(Dados.versao + (":natal" if SNOW else ""))
	f.store_buffer(h.to_byte_array())
	var c := PackedFloat32Array()
	c.resize(V * V * 3)
	for k in V * V:
		c[k * 3] = cores[k].r
		c[k * 3 + 1] = cores[k].g
		c[k * 3 + 2] = cores[k].b
	f.store_buffer(c.to_byte_array())

## altura exata da malha (interpolação pelo triângulo, igual à renderização)
func height_at(x: float, z: float) -> float:
	var V := N + 1
	var gx := R.clamp_((x + half) / step, 0.0, N - 0.0001)
	var gz := R.clamp_((z + half) / step, 0.0, N - 0.0001)
	var i := int(gx)
	var j := int(gz)
	var fx := gx - i
	var fz := gz - j
	var a := h[j * V + i]
	var b := h[j * V + i + 1]
	var c := h[(j + 1) * V + i]
	var d := h[(j + 1) * V + i + 1]
	if fx + fz <= 1.0:
		return a + (b - a) * fx + (c - a) * fz
	return d + (c - d) * (1.0 - fx) + (b - d) * (1.0 - fz)

func slope_at(x: float, z: float) -> float:
	var dx := height_at(x + 1.0, z) - height_at(x - 1.0, z)
	var dz := height_at(x, z + 1.0) - height_at(x, z - 1.0)
	return sqrt(dx * dx + dz * dz) / 2.0

## malha do chão (cores por vértice; o shader faz o sombreado "facetado" como o flatShading do three.js)
func malha() -> ArrayMesh:
	var V := N + 1
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	pos.resize(V * V)
	nor.resize(V * V)
	for j in V:
		for i in V:
			var k := j * V + i
			var x := -half + i * step
			var z := -half + j * step
			pos[k] = Vector3(x, h[k], z)
			var hx0 := h[j * V + maxi(i - 1, 0)]
			var hx1 := h[j * V + mini(i + 1, N)]
			var hz0 := h[maxi(j - 1, 0) * V + i]
			var hz1 := h[mini(j + 1, N) * V + i]
			nor[k] = Vector3(hx0 - hx1, 2.0 * step, hz0 - hz1).normalized()
	var idx := PackedInt32Array()
	idx.resize(N * N * 6)
	var p := 0
	for j in N:
		for i in N:
			var a := j * V + i
			var b := a + 1
			var cc := a + V
			var d := cc + 1
			# mesmos triângulos do three.js (a,cc,b)/(b,cc,d), na ordem horária da Godot
			idx[p] = a; idx[p + 1] = b; idx[p + 2] = cc
			idx[p + 3] = b; idx[p + 4] = d; idx[p + 5] = cc
			p += 6
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_COLOR] = cores
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m
