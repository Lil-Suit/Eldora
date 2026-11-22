#!/usr/bin/env bash
# =============================================================
# ELDORIA — instala o servidor 24h num computador na nuvem (Ubuntu 22.04/24.04: Oracle Cloud grátis, Hetzner…)
# Faz tudo: Node, HTTPS automático (Caddy), o jogo, o "mundo no servidor" (monstros rodando no servidor,
# não no navegador de ninguém), liga sozinho ao reiniciar e se ATUALIZA SOZINHO a cada 5 min pelo GitHub.
#
# Uso (no terminal do servidor):
#   curl -fsSL https://raw.githubusercontent.com/Lil-Suit/Eldora/main/server/instalar_vps.sh -o instalar.sh
#   sudo bash instalar.sh SEU-ENDERECO.duckdns.org
# Ele pergunta as variáveis do Render (DATABASE_URL etc.) — copie do painel do Render > Environment.
# Rodar de novo é seguro (só atualiza).
# =============================================================
set -euo pipefail
DOM="${1:-}"
if [ -z "$DOM" ]; then echo "Informe o endereço. Ex.: sudo bash instalar.sh meujogo.duckdns.org"; exit 1; fi
if [ "$(id -u)" != "0" ]; then echo "Rode com sudo."; exit 1; fi
APP=/opt/eldoria
REPO=https://github.com/Lil-Suit/Eldora.git
ENVF=/etc/eldoria.env
export DEBIAN_FRONTEND=noninteractive
echo "== 1/7 pacotes do sistema"
apt-get update -y -q
apt-get install -y -q git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent >/dev/null

echo "== 2/7 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi
node -v

echo "== 3/7 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -q && apt-get install -y -q caddy >/dev/null
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOM {
	encode gzip
	reverse_proxy 127.0.0.1:10000
}
CADDY

echo "== 4/7 portas 80 e 443 abertas no firewall do servidor"
for P in 80 443; do iptables -C INPUT -p tcp --dport $P -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $P -j ACCEPT; done
netfilter-persistent save >/dev/null 2>&1 || true

echo "== 5/7 o jogo"
id eldoria >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin eldoria
if [ -d "$APP/.git" ]; then git -C "$APP" fetch -q && git -C "$APP" reset -q --hard origin/main; else git clone -q "$REPO" "$APP"; fi
export PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
( cd "$APP" && npm i --no-save --no-audit --no-fund -q playwright >/dev/null && npx -y playwright install --with-deps chromium >/dev/null )
chown -R eldoria:eldoria "$APP" /opt/ms-playwright

echo "== 6/7 configuração ($ENVF)"
if [ ! -f "$ENVF" ]; then
  echo "Cole os valores do Render (painel > seu serviço > Environment). Deixe vazio o que não tiver."
  read -r -p "DATABASE_URL: " DBU </dev/tty || true
  read -r -p "GMS: " GMSV </dev/tty || true
  read -r -p "GOOGLE_CLIENT_ID: " GCID </dev/tty || true
  read -r -p "MONTARIAS: " MONT </dev/tty || true
  KEY=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 28)
  umask 077
  cat > "$ENVF" <<ENV
PORT=10000
NODE_ENV=production
MUNDO_KEY=$KEY
MUNDO_SVS=1,2
PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
DATABASE_URL=$DBU
GMS=$GMSV
GOOGLE_CLIENT_ID=$GCID
MONTARIAS=$MONT
# app da Play Store (preencha depois de gerar o app no PWABuilder):
ANDROID_PACKAGE=
ANDROID_SHA256=
ENV
fi

echo "== 7/7 serviços (ligam sozinhos) e atualização automática"
cat > /etc/systemd/system/eldoria.service <<UNIT
[Unit]
Description=ELDORIA servidor do jogo
After=network-online.target
[Service]
User=eldoria
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/eldoria-mundo.service <<UNIT
[Unit]
Description=ELDORIA mundo no servidor (monstros e eventos)
After=eldoria.service
Requires=eldoria.service
[Service]
User=eldoria
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server/mundo.mjs
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
cat > /usr/local/bin/eldoria-atualizar <<'UPD'
#!/usr/bin/env bash
# baixa a versão nova do GitHub (se houver) e reinicia o jogo
cd /opt/eldoria || exit 0
git fetch -q origin main || exit 0
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main && chown -R eldoria:eldoria /opt/eldoria
  systemctl restart eldoria eldoria-mundo
  echo "atualizado para $(git log -1 --format=%s)"
fi
UPD
chmod +x /usr/local/bin/eldoria-atualizar
cat > /etc/systemd/system/eldoria-atualizar.service <<UNIT
[Unit]
Description=ELDORIA atualiza pelo GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/eldoria-atualizar
UNIT
cat > /etc/systemd/system/eldoria-atualizar.timer <<UNIT
[Unit]
Description=ELDORIA confere atualização a cada 5 min
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable -q --now eldoria eldoria-mundo eldoria-atualizar.timer
systemctl restart eldoria eldoria-mundo caddy
sleep 4
echo
echo "PRONTO! O jogo está em: https://$DOM"
echo "(o HTTPS pode levar 1 minuto na primeira vez)"
echo "Ver se está tudo ligado:   systemctl status eldoria eldoria-mundo --no-pager"
echo "Ver o que está acontecendo: journalctl -u eldoria-mundo -f"
