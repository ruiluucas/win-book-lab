#!/usr/bin/env bash
# Chamado pelo item do desktop. Abre no konsole, mostra tudo, pausa no fim.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
LOG="$REPO/logs/coleta_auto.log"
mkdir -p "$(dirname "$LOG")"

echo "============================================================"
echo "  COLETA WIN — $(date '+%d/%m/%Y %H:%M')"
echo "============================================================"
echo

# MT5 e pre-requisito e so abre pela GUI
if ! ps -eo comm 2>/dev/null | grep -qx "main"; then
  echo "  MT5 NAO esta aberto."
  echo
  echo "  Abra o MetaTrader 5 pelo Lutris primeiro, depois clique aqui de novo."
  echo "  (o MT5 nao pode ser aberto por script — o CLI do Lutris esta quebrado)"
  echo
  notify-send -u critical "Coleta WIN" "MT5 fechado. Abra pelo Lutris primeiro."
  echo "  [Enter para fechar]"
  read -r _
  exit 1
fi

bash scripts/coleta_auto.sh 2>&1   # coleta_auto.sh ja grava em $LOG

echo
echo "------------------------------------------------------------"
if pgrep -f "coleta_v5.py" >/dev/null 2>&1; then
  PID=$(pgrep -f coleta_v5.py | head -1)
  echo "  COLETANDO — pid $PID"
  echo "  banco: $(docker ps --filter name=mercado-db --format '{{.Status}}' 2>/dev/null)"
  notify-send "Coleta WIN" "Coletor no ar (pid $PID)"
else
  echo "  COLETOR NAO SUBIU — veja o log acima"
  notify-send -u critical "Coleta WIN" "Coletor nao subiu. Veja o log."
fi
echo "------------------------------------------------------------"
echo
echo "  [Enter para fechar — a coleta continua em segundo plano]"
read -r _
