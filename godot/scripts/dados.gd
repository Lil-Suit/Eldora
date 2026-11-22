extends Node
## Números do jogo web, exportados por tools/godot-export.mjs (dados/jogo.json):
## classes, monstros, balanceamento, mapa e céu. Assim a versão Godot usa EXATAMENTE os mesmos valores.

var J: Dictionary = {}
var versao := ""          # versão do jogo web de onde os dados vieram
var versao_servidor := "" # versão que o servidor informou (vai na presença como "vv")
var natal := false
var balance: Dictionary
var classes: Dictionary
var inimigos: Dictionary
var mundo: Dictionary
var ceu: Dictionary
## lista de tipos e de mapas na MESMA ordem do net.js (o índice vai na rede)
var tipos: Array = []
const AREAS := ["world", "cripta", "ermos", "confins", "guardiao"]
const STATES := ["idle", "patrol", "alert", "chase", "attack", "hurt", "flee", "return", "dead", "spawn", "special"]
const ACTS := [null, "attack", "slash", "throw", "slam", "swipe", "charge", "chargeWind", "cast", "roar", "swipe2", "hurl"]

## configuração local (servidor, nome, classe…)
const CFG_PATH := "user://config.cfg"
var cfg := ConfigFile.new()

func _init() -> void:
	var f := FileAccess.open("res://dados/jogo.json", FileAccess.READ)
	if f == null:
		push_error("dados/jogo.json não encontrado: rode node tools/godot-export.mjs")
		return
	J = JSON.parse_string(f.get_as_text())
	versao = J.get("versao", "")
	natal = J.get("natal", false)
	balance = J.balance
	classes = J.classes
	inimigos = J.inimigos
	mundo = J.mundo
	ceu = J.ceu
	tipos = inimigos.keys() # mesma ordem de Object.keys(ENEMIES) no JS (o JSON guarda a ordem)
	cfg.load(CFG_PATH)

func salvar_cfg() -> void:
	cfg.save(CFG_PATH)

func get_cfg(k: String, padrao: Variant) -> Variant:
	return cfg.get_value("eldoria", k, padrao)

func set_cfg(k: String, v: Variant) -> void:
	cfg.set_value("eldoria", k, v)

## cor do JS (número 0xRRGGBB ou texto "0x…") → Color linear (como o three.js com gerência de cor)
static func cor_lin(v: Variant) -> Color:
	var n: int = int(v) if typeof(v) != TYPE_STRING else String(v).hex_to_int()
	var c := Color8((n >> 16) & 255, (n >> 8) & 255, n & 255)
	return c.srgb_to_linear()

static func n(v: Variant, d: float = 0.0) -> float:
	if typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT:
		return float(v)
	if typeof(v) == TYPE_STRING and String(v).is_valid_float():
		return String(v).to_float()
	if typeof(v) == TYPE_BOOL:
		return 1.0 if v else 0.0
	return d
