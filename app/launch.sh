#!/usr/bin/env bash
# Abre o painel. Instala dependencias na primeira vez.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -x node_modules/.bin/electron ] || [ ! -f node_modules/electron/dist/electron ]; then
  echo "instalando electron (primeira vez)..."
  npm install --no-audit --no-fund
  # o postinstall as vezes nao extrai; garante o binario
  if [ ! -f node_modules/electron/dist/electron ]; then
    node node_modules/electron/install.js || true
    ZIP=$(find ~/.cache/electron -name "electron-v*-linux-x64.zip" | sort -V | tail -1)
    if [ -n "$ZIP" ] && [ ! -f node_modules/electron/dist/electron ]; then
      mkdir -p node_modules/electron/dist
      unzip -q "$ZIP" -d node_modules/electron/dist
      chmod +x node_modules/electron/dist/electron
      printf 'electron' > node_modules/electron/path.txt
    fi
  fi
fi

exec ./node_modules/.bin/electron . --no-sandbox "$@" 2>/dev/null
