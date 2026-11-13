# Ambiente local — caminhos e symlinks

Este repo é a **fonte de verdade** dos scripts de coleta. O `~/Projetos/quant-lab/`
continua existindo para o venv Python, as análises e os dados brutos, mas os scripts
de orquestração vivem aqui.

## Symlinks (evitam divergência)

| caminho | aponta para |
|---|---|
| `~/Projetos/quant-lab/scripts/coleta_auto.sh` | `~/Projetos/win-book-lab/scripts/coleta_auto.sh` |
| `~/Projetos/quant-lab/scripts/liga_coleta.sh` | `~/Projetos/win-book-lab/scripts/liga_coleta.sh` |

**Por que:** em 13/11 as cópias divergiram. A do `quant-lab` ficou com
`symbols_get()` (trava 39 s), `--flush-seg 10` e **sem exportar `MERCADO_DSN`**
(morre com `password authentication failed`). Rodar aquela versão por engano
dava a impressão de que a coleta estava quebrada.

Originais preservados como `*.old-20261113`.

## Atalhos no desktop

| atalho | faz |
|---|---|
| `~/Área de trabalho/WIN Book Lab.desktop` | abre o painel Electron |
| `~/Área de trabalho/Coleta WIN.desktop` | sobe a coleta num konsole (sem app) |
| `~/Área de trabalho/Coleta WIN.sh` | fallback do anterior |

Registrados também em `~/.local/share/applications/`.

## Precedência de configuração

| item | de onde vem |
|---|---|
| `MERCADO_DSN` | `~/Projetos/quant-lab/.env`, com fallback para o DSN local do container |
| `FLUSH_SEG` | env var, default **2** |
| venv Python | `~/Projetos/quant-lab/.venv/bin/python` |
| Electron | `app/node_modules` (não versionado) |
