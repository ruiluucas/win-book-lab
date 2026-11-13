# Infraestrutura — operação

Fonte principal sobre **como rodar**. Estado das versões em
[`VERSOES.md`](VERSOES.md). Números por dia em [`MEDICOES.md`](MEDICOES.md).

## Componentes e estado

| peça | onde | estado |
|---|---|---|
| MT5 (BTG) | Lutris → umu → GE-Proton11 | precisa estar **aberto** |
| ponte RPyC | `127.0.0.1:18812` | `~/Projetos/mt5-bridge/start_server.sh 18812` |
| banco | Docker `mercado-db`, `127.0.0.1:5434` | `restart unless-stopped` |
| **coletor** | `scripts/coleta_v5.py` | **ATIVO** |
| invariantes | `scripts/verifica_integridade.py` | ativo |

## Subir do zero

```bash
# 1. MT5 pela GUI do Lutris — runner Wine 10+ (Wine 8 é REJEITADO pelo build 6230)
#    O CLI do Lutris está quebrado nesta máquina (No module named 'lutris') — só GUI.

# 2. banco
docker start mercado-db

# 3. ponte
cd ~/Projetos/mt5-bridge && { ./start_server.sh 18812 & }

# 4. coletor
cd ~/Projetos/quant-lab
set -a && source .env && set +a
.venv/bin/python scripts/coleta_v5.py --simbolo WINZ26 --flush-seg 10
```

## Schema

`schema_v2.sql`. **A versão em `mt5-bridge/deploy/ts_schema.sql` tem um bug:** falta
`CREATE EXTENSION timescaledb`, e sem ela `by_range`, `time_bucket` e
`add_compression_policy` falham em silêncio.

| tabela | conteúdo |
|---|---|
| `tick` | negócios observados + `lado_inferido` + `t_recv_ns` |
| `book` | 5 níveis/lado por leitura, `preco`/`volume` **integer** |
| `book_delta_v2` | delta por preço: `volume_increase` · `volume_decrease` · `price_entered_window` · `price_left_window` |
| `coleta_log` | o que foi capturado por sessão |

Compressão após 2 dias (~7,6 B/linha no book), retenção de 2 anos.

## Armadilhas — todas custaram tempo

1. **`market_book_get` devolve 0 logo após `market_book_add`.** Esperar **~1 s**. Foi por
   isso que a primeira medição concluiu "não tem book".
2. **O book vem com o PIOR preço primeiro.** Melhor bid = `max(preco)` do lado 2; melhor
   ask = `min(preco)` do lado 1. Errar isso infla o spread de 5 para 25 pts.
3. **O delta DEVE ser chaveado por preço, não por nível.** Quando o melhor preço desliza,
   os níveis trocam de preço e o delta compara coisas diferentes. Ver
   [`RELATORIO_AJUSTES.md`](RELATORIO_AJUSTES.md#p01--delta-chaveado-por-nível--por-preço).
4. **`time` do MT5 é hora do servidor (GMT-3), não UTC.** `datetime.now()` naive faz o
   Postgres assumir UTC e o dado fica 3 h errado.
5. **`BookInfo.index` é método**, não atributo — usar `enumerate`.
6. **Wine 8 é rejeitado** pelo build 6230.
7. **CLI do Lutris quebrado** — só a GUI abre o MT5.
8. **`copy_ticks_*` = 0** em qualquer janela. Sem histórico, sem flags de agressor.
9. **ALTER em hypertable comprimida falha.** Descomprimir, alterar, recomprimir. E o
   UPDATE em massa estoura `max_tuples_decompressed_per_dml_transaction` (padrão 100 mil).
10. **UPDATE massivo deixa tuplas mortas** — `VACUUM FULL` devolveu 73 MB para 13 MB.

## Verificação antes de analisar

```bash
python scripts/verifica_integridade.py   # sai com código != 0 se falhar
```

Checa: 10 linhas/snapshot, bid<ask, spread múltiplo de 5, grade de preço, ts crescente,
gaps, dentro do pregão, duplicatas, e a **ida-e-volta do delta**.

## Contrato e rolagem

`WINZ26` vence em **dezembro/2026** (confirmar data exata no calendário da B3 —
**NÃO VERIFICADO**). O guard do coletor aceita qualquer `WIN*`, mas **o pipeline assume
série única**. Na rolagem:

- não misturar contratos na mesma série de features
- marcar os últimos dias antes do vencimento (liquidez migra para o contrato seguinte)
- trocar `--simbolo` manualmente e registrar a data no `coleta_log`
