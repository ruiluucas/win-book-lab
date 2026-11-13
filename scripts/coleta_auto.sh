#!/usr/bin/env bash
# Coleta automatica diaria. Chamado pelo systemd timer as 09:00 (seg-sex).
# Nao abre o MT5 (so GUI). Se o MT5 estiver fechado, registra e sai com 1.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
LOG="$REPO/logs/coleta_auto.log"
mkdir -p "$(dirname "$LOG")"

log(){ printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; echo "$*"; }

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
if pgrep -f "coleta_v5.py" >/dev/null 2>&1; then
  log "[ok] coletor ja rodando (pid $(pgrep -f coleta_v5.py | head -1))"
  exit 0
fi

# 5. descobre o contrato WIN vigente (nao fixar WINZ26 — vence em dez)
SIMBOLO=$($HOME/Projetos/quant-lab/.venv/bin/python - <<'PY' 2>/dev/null
import rpyc, re, datetime
try:
    c = rpyc.classic.connect("127.0.0.1", 18812)
    c._config["sync_request_timeout"] = 60
    mt5 = c.modules["MetaTrader5"]
    mt5.initialize()
    ativos = [s.name for s in mt5.symbols_get() if s.name.upper().startswith("WIN")]
    # WIN + letra do mes (F,G,H,J,K,M,N,Q,U,V,X,Z) + 2 digitos de ano
    hoje = datetime.date.today()
    melhores = []
    for s in ativos:
        m = re.match(r"^WIN([FGHJKMNQUVXZ])(\d{2})$", s.upper())
        if not m: continue
        letra, aa = m.group(1), int(m.group(2))
        venc = datetime.date(2000+aa, "FGHJKMNQUVXZ".index(letra)+1, 15)
        if venc >= hoje:                      # so contratos nao vencidos
            melhores.append((venc, s))
    print(min(melhores)[1] if melhores else "")
except Exception:
    print("")
PY
)
[ -z "$SIMBOLO" ] && { log "[ERRO] nao consegui detectar o contrato WIN vigente"; exit 1; }
log "[ok] contrato vigente: $SIMBOLO"

# 6. coletor em background, sobrevive ao timer
log "iniciando coleta_v5 em $SIMBOLO"
setsid nohup $HOME/Projetos/quant-lab/.venv/bin/python scripts/coleta_v5.py --simbolo "$SIMBOLO" --flush-seg 10 \
  >>"$REPO/logs/coletor_$SIMBOLO.log" 2>&1 &
sleep 5
if pgrep -f "coleta_v5.py" >/dev/null 2>&1; then
  log "[ok] coletor rodando (pid $(pgrep -f coleta_v5.py | head -1))"
else
  log "[ERRO] coletor morreu na largada — ver logs/coletor_$SIMBOLO.log"
  exit 1
fi
log "=== fim da inicializacao ==="
