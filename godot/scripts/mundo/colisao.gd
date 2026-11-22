class_name Colisao
## Porte de src/engine/colliders.js: mundo de colisão 2D (plano XZ) com círculos e caixas giradas numa grade.
## Os colisores do Vale vêm do próprio jogo web (dados/vale_colisao.json, exportado por tools/godot-export.mjs).

var cell := 8.0
var grid := {}   # chave → Array de colisores
var stamp := 0

# colisor: [tipo(0 círculo, 1 caixa), x, z, r|hw, hd, cs, sn, los, cam, minX, maxX, minZ, maxZ, marca]
const T := 0
const X := 1
const Z := 2
const RR := 3
const HD := 4
const CS := 5
const SN := 6
const LOS := 7
const CAM := 8
const MARK := 13

static func _key(ix: int, iz: int) -> int:
	return (ix + 4096) * 8192 + (iz + 4096)

func _insert(c: Array) -> void:
	for ix in range(floori(c[9] / cell), floori(c[10] / cell) + 1):
		for iz in range(floori(c[11] / cell), floori(c[12] / cell) + 1):
			var k := _key(ix, iz)
			if not grid.has(k):
				grid[k] = []
			grid[k].append(c)

func add_circle(x: float, z: float, r: float, los := true, cam := false) -> void:
	_insert([0, x, z, r, 0.0, 0.0, 0.0, los, cam, x - r, x + r, z - r, z + r, 0])

func add_box_raw(x: float, z: float, hw: float, hd: float, cs: float, sn: float, los := true, cam := true) -> void:
	var ex := absf(cs) * hw + absf(sn) * hd
	var ez := absf(sn) * hw + absf(cs) * hd
	_insert([1, x, z, hw, hd, cs, sn, los, cam, x - ex, x + ex, z - ez, z + ez, 0])

func carregar(p: String) -> int:
	var arr = JSON.parse_string(FileAccess.get_file_as_string(p))
	if typeof(arr) != TYPE_ARRAY:
		return 0
	for c in arr:
		if c[0] == "c":
			add_circle(c[1], c[2], c[3], c[4] == 1, c[5] == 1)
		else:
			add_box_raw(c[1], c[2], c[3], c[4], c[5], c[6], c[7] == 1, c[8] == 1)
	return arr.size()

func query(min_x: float, min_z: float, max_x: float, max_z: float) -> Array:
	var out := []
	stamp += 1
	for ix in range(floori(min_x / cell), floori(max_x / cell) + 1):
		for iz in range(floori(min_z / cell), floori(max_z / cell) + 1):
			var arr = grid.get(_key(ix, iz))
			if arr == null:
				continue
			for c in arr:
				if c[MARK] != stamp:
					c[MARK] = stamp
					out.append(c)
	return out

## empurra p para fora dos colisores (true se encostou em algo)
func resolve(p: Vector3, r: float) -> Vector3:
	var cand := query(p.x - r, p.z - r, p.x + r, p.z + r)
	for it in 2:
		for c in cand:
			if c[T] == 0:
				var dx: float = p.x - c[X]
				var dz: float = p.z - c[Z]
				var rr: float = r + c[RR]
				var d2 := dx * dx + dz * dz
				if d2 < rr * rr:
					var d := sqrt(d2)
					if d == 0.0:
						d = 0.0001
					var push := rr - d
					p.x += dx / d * push
					p.z += dz / d * push
			else:
				var dx: float = p.x - c[X]
				var dz: float = p.z - c[Z]
				var cs: float = c[CS]
				var sn: float = c[SN]
				var hw: float = c[RR]
				var hd: float = c[HD]
				var lx := dx * cs + dz * sn
				var lz := -dx * sn + dz * cs
				var qx := clampf(lx, -hw, hw)
				var qz := clampf(lz, -hd, hd)
				var nx := lx - qx
				var nz := lz - qz
				var d2 := nx * nx + nz * nz
				if d2 > r * r:
					continue
				var ox := 0.0
				var oz := 0.0
				if d2 > 1e-8:
					var d := sqrt(d2)
					var push := r - d
					ox = nx / d * push
					oz = nz / d * push
				else:
					var px := hw - absf(lx)
					var pz := hd - absf(lz)
					if px < pz:
						ox = (1.0 if lx >= 0.0 else -1.0) * (px + r)
					else:
						oz = (1.0 if lz >= 0.0 else -1.0) * (pz + r)
				p.x += ox * cs - oz * sn
				p.z += ox * sn + oz * cs
	return p

## primeiro impacto do segmento (fração 0..1) ou -1. filtro: LOS ou CAM
func segment(ax: float, az: float, bx: float, bz: float, filtro: int = LOS) -> float:
	var cand := query(minf(ax, bx), minf(az, bz), maxf(ax, bx), maxf(az, bz))
	var dx := bx - ax
	var dz := bz - az
	var best := INF
	for c in cand:
		if filtro >= 0 and not c[filtro]:
			continue
		var t := 0.0
		if c[T] == 0:
			var fx: float = ax - c[X]
			var fz: float = az - c[Z]
			var A := dx * dx + dz * dz
			var B := 2.0 * (fx * dx + fz * dz)
			var Cc: float = fx * fx + fz * fz - c[RR] * c[RR]
			if Cc < 0.0:
				t = 0.0
			else:
				var disc := B * B - 4.0 * A * Cc
				if disc < 0.0 or A == 0.0:
					continue
				t = (-B - sqrt(disc)) / (2.0 * A)
				if t < 0.0 or t > 1.0:
					continue
		else:
			var cs: float = c[CS]
			var sn: float = c[SN]
			var ox: float = ax - c[X]
			var oz: float = az - c[Z]
			var lax := ox * cs + oz * sn
			var laz := -ox * sn + oz * cs
			var ldx := dx * cs + dz * sn
			var ldz := -dx * sn + dz * cs
			var r := _slab(lax, ldx, c[RR], 0.0, 1.0)
			if r.x > r.y:
				continue
			r = _slab(laz, ldz, c[HD], r.x, r.y)
			if r.x > r.y:
				continue
			t = r.x
		if t < best:
			best = t
	return -1.0 if best == INF else best

static func _slab(o: float, d: float, hh: float, t0: float, t1: float) -> Vector2:
	if absf(d) < 1e-9:
		return Vector2(t0, t1) if absf(o) <= hh else Vector2(1, 0)
	var ta := (-hh - o) / d
	var tb := (hh - o) / d
	if ta > tb:
		var s := ta
		ta = tb
		tb = s
	return Vector2(maxf(t0, ta), minf(t1, tb))
