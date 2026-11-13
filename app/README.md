# WIN Book Lab — painel

App desktop (Electron) que monitora e opera o laboratorio de microestrutura do WIN:
liga/desliga a coleta, mostra o estado do banco ao vivo e roda as duas metodologias
de analise (tempo e linhas) sem sair da tela.

## Abrir

```bash
./launch.sh          # instala o electron na primeira vez, depois abre
npm start            # se as dependencias ja estao instaladas
npm start:wayland    # forcar Wayland
```

Ou clique em **WIN Book Lab** na Area de trabalho.

## O que mostra

| bloco | conteudo |
|---|---|
| **Status** | MT5 aberto, ponte RPyC :18812, banco TimescaleDB, coletor (pid + contrato) |
| **Metricas** | snapshots hoje, linhas de book, ticks, deltas, taxa dos ultimos 60 s, ultima escrita |
| **Grafico** | snapshots/s em tempo real (janela de 90 amostras) |
| **Analise** | roda o metodo novo (tempo real) ou o antigo (linhas), com custo e fator |
| **Log** | ultimas 40 linhas do log de coleta |

Polling de 2 s. Nada e escrito no banco pelo app — so leitura e controle do coletor.

## Controles

- **Ligar coleta** — checa o MT5, sobe banco/ponte/coletor via `scripts/coleta_auto.sh`.
  Desabilitado se o MT5 estiver fechado (ele so abre pela GUI).
- **Parar** — encerra o processo do coletor.
- **Abrir log** — abre a pasta dos logs.

## Arquitetura

```
app/
  main.js          janela + IPC (fino, sem logica)
  preload.js       ponte segura (contextIsolation, sem nodeIntegration)
  lib/lab.js       TODO o nucleo: status, dbStats, start/stop, runAnalysis, log
  renderer/        index.html + style.css + app.js (UI)
  test_lab.js      teste do nucleo, sem Electron e sem interface
```

A logica fica em `lib/lab.js`, sem dependencia do Electron, para poder ser testada
com `node` puro. `main.js` so registra os handlers de IPC e cria a janela.

## Testes

```bash
npm test        # node test_lab.js — 16 asserções, sem banco e sem interface
```

O teste exercita: resolucao do repo, `getStatus`, `dbStats` (contra o banco real),
`tailLog`, `listLogs`, `runAnalysis` nos dois metodos, recusa sem janela e
idempotencia do `start`.

## Seguranca

- `contextIsolation: true`, `nodeIntegration: false`
- O renderer so acessa o que o `preload` expoe
- Nenhum comando e montado com entrada do usuario: janelas e custos vao por `execFile`
  com array de argumentos, nao por shell
- O app nunca envia ordem nem escreve no banco

## Fidelidade ao MT5

O gráfico usa **tick.last** (preço negociado), que é o que o MT5 desenha — não o mid.
Verificado candle a candle contra `copy_rates_from_pos(WINZ26, TIMEFRAME_M1)`:
fechamento idêntico no candle já fechado, diferença de 1–2 ticks no candle em formação.

O eixo de tempo é deslocado para **BRT**. O banco guarda `timestamptz`; `extract(epoch)`
devolve UTC, e o lightweight-charts exibe o que recebe — sem o deslocamento o eixo
mostrava 17:25 quando eram 14:25.

## Taxa de atualização

Três coisas controlam o que você vê:

| etapa | valor | onde |
|---|---|---|
| leitura do book | ~8,5 Hz | coletor (`time.sleep(0.001)`) |
| **gravação no banco** | **a cada 2 s** | `FLUSH_SEG` em `coleta_auto.sh` |
| leitura pelo painel | 1 s | `setInterval` em `renderer/app.js` |

O gargalo era o **flush**: com `--flush-seg 15` o banco só recebia a cada 15 s, então
o painel parecia travado mesmo com a UI atualizando a cada segundo. Agora grava a cada
2 s (`FLUSH_SEG=2`, e o coletor usa `--flush-seg 2`). Para mudar, edite `FLUSH_SEG`.

## Dependencias

Node >= 20 e **Electron 45.3.2**. `node_modules` fica fora do git (`app/.gitignore`).
Se o `postinstall` do Electron falhar em extrair o binario, `launch.sh` corrige
extraindo o zip do `~/.cache/electron`.

**Sobre `npm audit`:** o Electron 33 tinha 2 advisories altos (ASAR integrity bypass e
injeção de AppleScript) e um no `extract-zip`, dependencia usada só na instalação.
Subido para 45.3.2 — `npm audit` agora reporta **0**. O upgrade foi validado com a
suíte CDP inteira (18 asserções na UI real), não por inspeção.
