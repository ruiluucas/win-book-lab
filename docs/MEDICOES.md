> **Números brutos do dia 13/11/2026.** Vários foram corrigidos depois — ver
> [`RELATORIO_AJUSTES.md`](RELATORIO_AJUSTES.md). Amostra **exploratória e queimada**.

# Medições brutas — 13/11/2026, WINZ26

Todas as medições deste dia, com amostra e horário. Nada aqui é conclusivo:
a amostra é de **1 sessão parcial**.

## Captura (verificada às 11:30)

| fluxo | taxa | integridade |
|---|---:|---|
| snapshots do book | **9,13/s** | 2.527 de 2.527 snapshots com exatamente 10 linhas |
| linhas de `book_delta` | 56,9/s | |
| ticks | 12,4/s | |

Book muda a 8,8/s em mercado calmo. Captura de **100%** era afirmação circular — **NÃO VERIFICADO** em rajada.

## Progressão das versões do coletor

| versão | snapshots/s | % do teto | observação |
|---|---:|---:|---|
| v2, intervalo 100 ms | 4,2 | 47% | perda ~52% |
| v2, 40 ms | 5,1 | 58% | |
| v2, 20 ms | 6,1 | 69% | latência da ponte é o piso |
| **v3/v4, 2 threads** | **8,0–9,1** | **91–100% do observado** (não é teto) | 2 conexões RPyC |

Latência medida: `symbol_info_tick` 40,9 ms · `market_book_get` 45,7–48,2 ms.

## OBI nas observações independentes (80 min)

`OBI_5 = (vol_BUY − vol_SELL)/(vol_BUY + vol_SELL)`

| h | n indep | acerto | pts/op | R$/op | t | p |
|---|---:|---:|---:|---:|---:|---:|
| 1 min | 80 | 42,5% | −0,3 | −0,07 | −0,05 | 0,962 |
| 2 min | 40 | 47,5% | −7,8 | −1,55 | −0,59 | 0,561 |
| 3 min | 26 | 50,0% | +0,6 | +0,12 | 0,03 | 0,977 |
| 5 min | 16 | 62,5% | +50,6 | +10,12 | 1,55 | 0,141 |

**Nenhum significativo.** Com todas as observações (sobrepostas) e Newey-West:
acerto 54,9%, t=4,01 — artefato da sobreposição.

## Correlação OBI → movimento (80 min, obs sobrepostas)

| h | correlação | acerto | p | n |
|---|---:|---:|---:|---:|
| 1 min | +0,133 | 56,2% | 2,7e-37 | 9.193 |
| 2 min | +0,083 | 54,0% | 2,6e-34 | 21.761 |
| 3 min | +0,094 | 54,9% | 2,0e-43 | 21.507 |
| 5 min | +0,070 | 53,2% | 4,9e-24 | 20.998 |
| 10 min | +0,077 | 54,1% | 2,1e-27 | 19.727 |

**Válido como correlação, inválido como edge** — as obs são sobrepostas.

## Delta do book (1 minuto)

| lado | evento | n | soma |
|---|---|---:|---:|
| BID | volume_increase | 505 | +46.051 |
| BID | volume_decrease | 399 | −44.486 |
| ASK | volume_increase | 511 | +18.975 |
| ASK | volume_decrease | 373 | −18.944 |

**Líquido: BID +1.565, ASK +31.** ~25% da movimentação é churn (corrigido).

## Storage

| tabela | sem compressão | comprimido | redução |
|---|---:|---:|---:|
| `book` | 104,8 B/linha | **7,6 B/linha** | 92,7% |
| `tick` | 191,0 B/linha | **16,2 B/linha** | 91,4% |

Projeção: ~4 GB/ano comprimido (book 3,4 + tick 0,7).

## Profundidade disponível

| símbolo | níveis | book responde? |
|---|---:|---|
| **WINZ26** (atual) | **5** | ✅ 10 entradas |
| INDZ26, WDOZ26, DOLZ26 | 6 | ✅ |
| WINZ22, WING23, WDOF23 | 32 | ❌ 0 entradas (expirados, sem feed) |
