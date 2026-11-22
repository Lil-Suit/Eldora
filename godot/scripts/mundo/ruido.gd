class_name Ruido
## Porte EXATO de src/engine/noise.js (ruído de valor 2D determinístico + utilidades).
## O hash do JS usa inteiros de 32 bits (Math.imul, >>>): aqui é emulado com máscara 0xFFFFFFFF.

const M32 := 0xFFFFFFFF

static func hash2(ix: int, iz: int) -> float:
	var h: int = (ix * 374761393 + iz * 668265263) & M32
	h = ((h ^ (h >> 13)) * 1274126177) & M32
	h = h ^ (h >> 16)
	return float(h) / 4294967295.0

static func vnoise(x: float, z: float) -> float:
	var fx0 := floorf(x)
	var fz0 := floorf(z)
	var ix := int(fx0)
	var iz := int(fz0)
	var fx := x - fx0
	var fz := z - fz0
	var u := fx * fx * (3.0 - 2.0 * fx)
	var v := fz * fz * (3.0 - 2.0 * fz)
	var a := hash2(ix, iz)
	var b := hash2(ix + 1, iz)
	var c := hash2(ix, iz + 1)
	var d := hash2(ix + 1, iz + 1)
	return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2.0 - 1.0

static func fbm(x: float, z: float, octs: int = 4) -> float:
	var s := 0.0
	var a := 1.0
	var f := 1.0
	var n := 0.0
	for i in octs:
		s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1)
		n += a
		a *= 0.5
		f *= 2.03
	return s / n

static func clamp_(v: float, a: float, b: float) -> float:
	return a if v < a else (b if v > b else v)

static func lerp_(a: float, b: float, t: float) -> float:
	return a + (b - a) * t

## igual ao JS (aceita bordas invertidas, ex.: smoothstep(-176, -186, z))
static func ss(e0: float, e1: float, x: float) -> float:
	var t := clamp_((x - e0) / (e1 - e0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func dist2(ax: float, az: float, bx: float, bz: float) -> float:
	return sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz))

static func dist_seg(px: float, pz: float, ax: float, az: float, bx: float, bz: float) -> float:
	var dx := bx - ax
	var dz := bz - az
	var l2 := dx * dx + dz * dz
	var t := ((px - ax) * dx + (pz - az) * dz) / l2 if l2 > 0.0 else 0.0
	t = clamp_(t, 0.0, 1.0)
	var qx := px - (ax + dx * t)
	var qz := pz - (az + dz * t)
	return sqrt(qx * qx + qz * qz)

## pts: PackedFloat64Array [x0, z0, x1, z1, ...]
static func dist_poly(px: float, pz: float, pts: PackedFloat64Array) -> float:
	var d := INF
	var n := pts.size() / 2
	for i in n - 1:
		var v := dist_seg(px, pz, pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3])
		if v < d:
			d = v
	return d

## array do JSON [[x,z],[x,z]...] → PackedFloat64Array plano
static func poly(arr: Array) -> PackedFloat64Array:
	var out := PackedFloat64Array()
	for p in arr:
		out.append(float(p[0]))
		out.append(float(p[1]))
	return out

static func angle_diff(a: float, b: float) -> float:
	var d := fmod(b - a, TAU)
	if d > PI:
		d -= TAU
	if d < -PI:
		d += TAU
	return d

static func damp_angle(cur: float, target: float, k: float, dt: float) -> float:
	return cur + angle_diff(cur, target) * (1.0 - exp(-k * dt))

static func damp(cur: float, target: float, k: float, dt: float) -> float:
	return cur + (target - cur) * (1.0 - exp(-k * dt))
