# Coleta do WIN na VM

Duas pecas em Docker e duas no host.

## Docker (`docker compose up -d`)

| servico | o que faz |
|---|---|
| `winbook-db` | TimescaleDB com `tick`, `book` e `book_delta_v2` |
| `winbook-coletor` | le o book a ~9 Hz, grava snapshot + delta por preco |

## Host (systemd, ja existente)

| servico | por que nao esta no Docker |
|---|---|
| `mt5-vm.service` | MT5 precisa de Wine + sessao grafica (VNC) |
| `mt5-bridge.service` | ponte RPyC em cima do processo do MT5 |
| `win-roll.service` | mantem o contrato da frente no config do MT5 |

## Contrato da frente

`--simbolo auto` escolhe pelo **numero de negocios da sessao** (`session_deals`),
nao pelo vencimento mais proximo nem pela cotacao mais recente. Em 13/11/2026 o
WINZ26 tinha 4.604.948 negocios contra 6.623 do WING27 — e uma regra antiga que
olhava a cotacao mais nova chegou a gravar o contrato iliquido a sessao inteira.

## Acesso ao banco

A porta fica em `127.0.0.1:5432` **so no host**. O app no desktop acessa por
tunel SSH: `ssh -N -L 5433:127.0.0.1:5432 root@192.168.201.50`.

## Operacao

```bash
docker compose ps
docker logs -f winbook-coletor --tail 20
docker exec winbook-db psql -U winbook -d mercado -c "select count(*) from book"
```
