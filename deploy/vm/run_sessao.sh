#!/bin/sh
# Supervisor da coleta: mantem o processo vivo enquanto o pregao esta aberto e
# dorme fora dele.
#
# Por que existe: `coleta_v5.py` sai sozinho quando o relogio passa das 18:00
# (fim do pregao da B3). Com `restart: unless-stopped` o Docker reinicia o
# container a cada ~65 s a noite inteira — inutil, e enche o log.
#
# Aqui o container nao sai: ele espera a proxima janela e chama o coletor.
# Assim o mesmo servico serve para sempre, sem timer nem cron.
set -eu

ARGS="$*"

while true; do
  # dow: 1=segunda .. 7=domingo | hour: 00..23 em Brasilia
  # %-u / %-H ja tiram o zero a esquerda. NAO usar $((10#$x)): o /bin/sh deste
  # container e dash, que nao entende base 10# e morre com
  # "arithmetic expression: expecting EOF". Medido 13/11 no python:3.12-slim.
  dow=$(TZ=America/Sao_Paulo date +%-u)
  hour=$(TZ=America/Sao_Paulo date +%-H)

  if [ "$dow" -ge 1 ] && [ "$dow" -le 5 ] && [ "$hour" -ge 8 ] && [ "$hour" -lt 18 ]; then
    echo ">>> sessao: iniciando coleta ($(TZ=America/Sao_Paulo date '+%a %H:%M'))"
    # shellcheck disable=SC2086
    python /app/scripts/coleta_v5.py $ARGS || true
    echo ">>> sessao: coletor saiu, aguardando 20 s"
    sleep 20
  else
    echo ">>> fora do pregao ($(TZ=America/Sao_Paulo date '+%a %H:%M')): dormindo 5 min"
    sleep 300
  fi
done
