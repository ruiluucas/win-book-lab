#!/usr/bin/env bash
# Sobe tudo que a coleta precisa, na ordem certa, e checa cada passo.
# Nao abre o MT5 — isso so pela GUI do Lutris (o CLI do Lutris esta quebrado).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
LOG="$REPO/logs/coleta_auto.log"
mkdir -p "$(dirname "$LOG")"

PY="$HOME/Projetos/quant-lab/.venv/bin/python"
FLUSH_SEG="${FLUSH_SEG:-0.1}"    # grava a cada N segundos (0.1 = 10x/s). Era 15: o painel parecia travado.

# O coletor le o DSN de MERCADO_DSN (o default dele nao serve). Pega do .env do
# quant-lab se existir; senao usa o DSN local do container mercado-db.
if [ -z "${MERCADO_DSN:-}" ] && [ -f "$HOME/Projetos/quant-lab/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/Projetos/quant-lab/.env" 2>/dev/null || true
  set +a
fi
export MERCADO_DSN="${MERCADO_DSN:-host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local}"

log(){ printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; echo "$*"; }

# checa um processo python pelo nome do script, sem pgrep casar com o proprio shell
# (o helper abaixo roda como `python3 - coleta_v5.py`, entao precisa se excluir)
rodando(){
  python3 - "$1" <<'EOF'
import sys, os, glob
alvo = sys.argv[1]
eu = os.getpid()
for d in glob.glob("/proc/[0-9]*"):
    pid = d.split("/")[-1]
    if int(pid) == eu:
        continue
    try:
        if "python" not in os.readlink(d + "/exe"):
            continue
        cmd = open(d + "/cmdline", "rb").read().replace(b"\0", b" ").decode(errors="ignore")
        if ("scripts/" + alvo) in cmd:
            print(pid); break
    except Exception:
        pass
EOF
}

log "=== inicio automatico ==="

# 1. MT5 tem que estar aberto (nao automatizavel)
if ! ps -eo comm 2>/dev/null | grep -qx "main"; then
  log "[ERRO] MT5 fechado. Abra pelo Lutris — a coleta NAO roda sem ele."
  exit 1
fi
log "[ok] MT5 rodando"

# 2. banco
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "mercado-db"; then
  log "[ok] banco rodando"
else
  docker start mercado-db >/dev/null 2>&1
  for i in $(seq 1 40); do
    docker exec mercado-db pg_isready -U postgres >/dev/null 2>&1 && { log "[ok] banco subiu em ${i}s"; break; }
    sleep 1
  done
fi

# 3. ponte
if ss -tln 2>/dev/null | grep -q ":18812 "; then
  log "[ok] ponte :18812 ativa"
else
  nohup "$HOME/Projetos/mt5-bridge/start_server.sh" 18812 >/tmp/ponte.log 2>&1 &
  for i in $(seq 1 30); do
    ss -tln 2>/dev/null | grep -q ":18812 " && { log "[ok] ponte subiu em ${i}s"; break; }
    sleep 1
  done
fi
ss -tln 2>/dev/null | grep -q ":18812 " || { log "[ERRO] ponte nao subiu"; exit 1; }

# 4. ja tem coletor rodando? nao duplica
PID_COL="$(rodando coleta_v5.py)"
if [ -n "$PID_COL" ]; then
  log "[ok] coletor ja rodando (pid $PID_COL)"
  exit 0
fi

# 5. contrato WIN vigente — script proprio, symbol_info em 24 candidatos (0,45 s),
#    porque symbols_get() devolve 52.506 simbolos e leva 39 s.
SIMBOLO="$("$PY" scripts/detecta_contrato.py)"
if [ -z "$SIMBOLO" ]; then
  log "[ERRO] nao consegui detectar o contrato WIN vigente"
  exit 1
fi
log "[ok] contrato vigente: $SIMBOLO"

# 6. coletor em background, desacoplado do shell
log "iniciando coleta_v5 em $SIMBOLO (flush ${FLUSH_SEG}s)"
setsid nohup "$PY" scripts/coleta_v5.py --simbolo "$SIMBOLO" --flush-seg "$FLUSH_SEG" \
  >>"$REPO/logs/coletor_$SIMBOLO.log" 2>&1 &
sleep 6

PID_COL="$(rodando coleta_v5.py)"
if [ -n "$PID_COL" ]; then
  log "[ok] coletor rodando (pid $PID_COL)"
else
  log "[ERRO] coletor morreu na largada — ver logs/coletor_$SIMBOLO.log"
  exit 1
fi
log "=== fim da inicializacao ==="
