# Versões do coletor

Fonte única de verdade sobre qual código roda. Atualizado em 13/11/2026.

## Tabela

| versão | arquitetura | melhoria | métricas medidas | estado |
|---|---|---|---|---|
| **v1** | parquet, 1 thread, intervalo fixo | primeira captura de book | 1 tick / 0 book no 1º flush (bug de `BookInfo.index`) | **legado** |
| **v2** | parquet/Postgres, 1 thread | corrige `index`, grava no banco | **4,13 snap/s** (47% do observado); **1.131 duplicatas** (4,6%) | **legado** |
| **v3** | 2 threads, 2 conexões RPyC | separa tick e book (latência 41/48 ms) | não medido isoladamente | **legado** |
| **v4** | 2 threads + delta | adiciona `book_delta` | **8,0–9,1 snap/s**; **zero duplicatas** | **legado** |
| **v5** | v4 + delta **por preço** | P0.1 (chave por preço), P0.3 (`lado_inferido`), P0.4 (`t_recv_ns`) | **8,3–8,5 snap/s**; latência **6 ms**; delta validado 1248/1248 | **ATIVO** |

## Detalhe das mudanças

### v1 → v2
`BookInfo.index` é **método**, não atributo — `int(x.index)` estourava e o coletor morria
no primeiro flush. Corrigido com `enumerate`.

### v2 → v3
v2 fazia `symbol_info_tick` (41 ms) + `market_book_get` (48 ms) **no mesmo ciclo**: 89 ms
por volta, e com `sleep` caía para **~4/s**. Medido que `market_book_get` sozinho permite
**19,7 leituras/s** — o gargalo era serializar duas chamadas independentes.
v3 separou em duas conexões RPyC.

### v3 → v4
Adicionou `book_delta` — só o que mudou desde a leitura anterior. Foi também a primeira
versão com **zero duplicatas** (o v2 gravava 4,6% de snapshots idênticos consecutivos).

### v4 → v5
**P0.1 (a mudança que importa):** o delta do v4 chaveava por **nível** (0..4). Quando o
melhor preço desliza 1 tick, os 5 níveis trocam de preço e o delta compara coisas
diferentes — gerando `add`/`cancel` falsos nos 10 níveis. Provado com dois snapshots
reais em [`RELATORIO_AJUSTES.md`](RELATORIO_AJUSTES.md#p01--delta-chaveado-por-nível--por-preço).
v5 chaveia por **(lado, preço)**.

**P0.3:** `lado_inferido` por regra do tick (não existe flag na conta).
**P0.4:** `t_recv_ns` gravado em torno de cada chamada.

## Como verificar qual está rodando

```bash
ps -eo args | grep coleta_v | grep -v grep
```

## Latências medidas

| medição | valor | condição |
|---|---:|---|
| `symbol_info_tick` | 40,9 ms | MT5 recém-aberto |
| `market_book_get` | 45,7–48,2 ms | idem |
| **ambos (v5)** | **6 ms** | MT5 com gráfico ativo |

**A latência não é estável** — varia com a carga do MT5 e do sistema. As três medições
acima são de momentos diferentes do mesmo dia. O v5 grava `t_recv_ns` justamente para
poder medir isso por sessão no futuro.
