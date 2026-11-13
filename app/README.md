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

## Dependencias

Node >= 20 e Electron 33. `node_modules` fica fora do git (`app/.gitignore`).
Se o `postinstall` do Electron falhar em extrair o binario, `launch.sh` corrige
extraindo o zip do `~/.cache/electron`.
