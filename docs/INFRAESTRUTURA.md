# Coleta de book + tick do WIN — infraestrutura

Atualizado: 13/11/2026. Substitui a coleta em parquet descartável.

## O que roda onde

| peça | onde | estado |
|---|---|---|
| MT5 (BTG) | Lutris → umu → GE-Proton11 | precisa estar **aberto** |
| ponte RPyC | `127.0.0.1:18812` | `~/Projetos/mt5-bridge/start_server.sh` |
| banco | Docker `mercado-db`, `127.0.0.1:5434` | `restart unless-stopped` |
| coletor | `scripts/coleta_v2.py` | roda até 18h ou até o MT5 fechar |

## Subir tudo do zero

```bash
# 1. MT5 — abrir pela GUI do Lutris (runner: proton-cachyos-11.0 ou dw-proton)
#    Wine 8 é REJEITADO pelo MT5 build 6230 ("unstable and unsupported")

# 2. ponte
cd ~/Projetos/mt5-bridge && ./start_server.sh 18812 &

# 3. banco (já sobe sozinho depois da primeira vez)
docker start mercado-db

# 4. coletor
cd ~/Projetos/quant-lab && .venv/bin/python scripts/coleta_v2.py --simbolo WINZ26
```

## Schema

`schema_v2.sql` — **a versão em `mt5-bridge/deploy/ts_schema.sql` tem um bug**: falta
`CREATE EXTENSION timescaledb`, e sem ela `by_range`, `time_bucket` e
`add_compression_policy` falham. Usar `sql/schema_v2.sql`.

| tabela | conteúdo |
|---|---|
| `tick` | fita: ts, symbol, time_msc, bid, ask, last, volume |
| `book` | 5 níveis/lado: ts, symbol, lado (1=ask, 2=bid), nivel (0=melhor), preco, volume |
| `book_1s` | view contínua: 1 linha/segundo com melhor bid/ask, vol de cada lado, depth |
| `coleta_log` | o que foi capturado em cada sessão |

Compressão ativa após 2 dias (~5,2 B/linha), retenção de 2 anos.

## Medido (não estimado)

| item | valor |
|---|---|
| `ticks_bookdepth` do WIN | **5 níveis por lado** |
| book por snapshot | **10 linhas** |
| taxa do book | ~9,5 mudanças/s → **~95 linhas/s** |
| book por dia (9h) | **~3,1 M linhas** → ~16 MB comprimido |
| tick por dia (9h) | **~350 mil linhas** (10-12 ticks/s) → ~5,7 MB comprimido |
| RAM do banco | **~1 GB** |
| CPU do banco | **<1 %** |
| ano (250 pregões) | **~4 GB** comprimido (book 3,4 + tick 0,7) |

## Armadilhas (todas custaram tempo)

1. **`market_book_get` devolve 0 logo após `market_book_add`.** Esperar **~1 s**. Foi por
   isso que a primeira medição concluiu "não tem book" — era impaciência.
2. **O book vem com o PIOR preço primeiro.** Melhor bid = `max(preco)` do lado 2;
   melhor ask = `min(preco)` do lado 1. Errar isso infla o spread de 5 para 25 pts.
3. **`time` do MT5 é hora do SERVIDOR (GMT-3 = BRT), não UTC.** `datetime.now()` local casa;
   `datetime.now(timezone.utc)` devolve zero em `copy_ticks_range`.
4. **Não existe tick histórico nesta conta.** `copy_ticks_*` retorna 0 em todos os símbolos
   com `last_error = Success`. Só forward. Barras (`copy_rates_*`) funcionam.
5. **`x.index` de `BookInfo` é método, não atributo** — usar `enumerate`.
6. **Wine 8 é rejeitado** pelo build 6230. Usar Wine 10+.
7. **O CLI do Lutris está quebrado** nesta máquina (`No module named 'lutris'`).
   A GUI funciona. Só dá para abrir o MT5 pela interface.

## Análise

```bash
.venv/bin/python scripts/analisa_book_db.py            # tudo
.venv/bin/python scripts/analisa_book_db.py --minimo 60
```

Saída: estatística do book, correlação OBI→direção por horizonte, relação entre
desequilíbrio extremo e magnitude, e P&L com t corrigido por Newey-West —
**com o número de observações independentes ao lado de cada resultado.**

## A régua honesta

Detectar uma taxa de acerto de 55% (contra 50%) com p<0,05 e poder de 80% exige
**~800 eventos independentes**.

| horizonte | eventos por sessão de 9h | sessões necessárias |
|---|---|---|
| 1 min | 540 | ~1,5 |
| 3 min | 180 | **~4,5** |
| 5 min | 108 | ~7,5 |

**Enquanto não houver ~4 sessões com 3 min de horizonte, qualquer resultado é hipótese.**
O `analisa_book_db.py` imprime esse número para não deixar esquecer.

## O que já foi medido (13/11, 09:20–09:48, 28 min)

| métrica | valor |
|---|---|
| snapshots | 9.193 |
| spread mediano | **5 pts** |
| depth mediana | 2.730 contratos |
| OBI_5 desvio | 0,243 |
| OBI extremo (\|>0,5\|) | 2,9% do tempo |
| acerto direcional (1–3 min) | **56,2–56,5%** |
| correlação OBI→movimento | **+0,12 a +0,13 (p ≈ 1e-30)** |
| P&L com OBI>0,5 | +33 pts/op em 3 min — **mas só 9 obs independentes** |

**Veredito:** há sinal estatístico real e consistente. **Não há amostra** para dizer
se vira dinheiro. É exatamente onde o teste deve parar e a coleta deve continuar.

---

## v3 — duas threads (13/11/2026, correção de perda de dados)

O v2 fazia `symbol_info_tick` (41 ms) + `market_book_get` (48 ms) no **mesmo ciclo**:
89 ms por volta, e com sleep de 20 ms caía para **6,0 snapshots/s**. Mas o book muda
**8,8/s** — ou seja, **~30% das atualizações eram perdidas**, e justamente nas rajadas.

Medido: sozinho, `market_book_get` permite **19,7 leituras/s**. O gargalo era a serialização.

O v3 usa **duas conexões RPyC independentes**, uma thread para cada:

| versão | snapshots/s | ticks/s | perda |
|---|---:|---:|---|
| v2 (uma thread) | 6,0 | — | **~30%** |
| **v3 (duas threads)** | **8,7** | **9,9** | **~1%** |

### Limitação que não tem solução por software

`symbol_info.ticks_bookdepth = 5` — a BTG retail entrega **5 níveis por lado**.
Não existe "todas as camadas". Para book completo seria preciso feed L2/CAM da B3.

### Fuso — o bug que corrompeu 245 mil linhas

`datetime.now()` retorna *naive*; o Postgres interpreta como **UTC** e o dado fica 3 h errado.
Correção: `datetime.now(BRT)` com `BRT = timezone(timedelta(hours=-3))`.

Os 245 mil registros antigos foram corrigidos com `UPDATE ... ts + interval '3 hours'`.
**Atenção:** esse UPDATE descomprime os chunks e estoura o limite
(`max_tuples_decompressed_per_dml_transaction`, padrão 100.000) — resolver com
`SET timescaledb.max_tuples_decompressed_per_dml_transaction = 0` e depois `VACUUM FULL`
(levou o banco de 73 MB de volta para 13 MB).

---

## v4 — DELTA do book (13/11/2026)

Pedido do Rui: *"para cada tick, a profundidade pra cima e pra baixo o máximo possível,
ou pelo menos o delta — a mudança entre o que ocorreu no book em cima e em baixo."*

**Profundidade máxima:** `ticks_bookdepth = 5` no WINZ26. É o teto do servidor BTG.
Símbolos expirados (WINZ22, WING23) mostram 32 níveis na especificação, mas
`market_book_get` devolve **0** — não têm feed. Os ativos INDZ26/WDOZ26 têm 6.
**Para o WIN, 5 é o máximo.**

**Delta implementado** na tabela `book_delta`:

| coluna | significado |
|---|---|
| `vol_antes` / `vol_agora` | volume no nível antes e depois da mudança |
| `delta` | `vol_agora - vol_antes` (positivo = ordem entrou) |
| `evento` | `novo` (nível apareceu) · `saiu` (nível sumiu) · `add` (volume subiu) · `cancel` (volume caiu) |

**Estado completo diz ONDE o preço está. Delta diz QUEM AGIU.**

### Taxa medida (WINZ26, mercado calmo)

| fluxo | taxa | observação |
|---|---:|---|
| snapshots do book | **8,8/s** | o book muda 8,8/s → **100% capturado** |
| **linhas de delta** | **57,2/s** | ~6,5 mudanças por snapshot |
| ticks | 10,2/s | |

### Só WIN

O coletor tem guard: `if not sym.upper().startswith("WIN"): exit`. Um ativo por vez.
WDO, IND e DOL fora por decisão do Rui.

### O que o delta já mostrou (1 minuto)

| lado | add | cancel | líquido |
|---|---:|---:|---:|
| BID (compra) | +46.051 | −44.486 | **+1.565** |
| ASK (venda) | +18.975 | −18.944 | **+31** |

**Quase todo volume é churn** — entra e sai sem virar preço. É exatamente o tipo de coisa
que estado agregado esconde e delta revela: 46 mil contratos "apareceram" no bid em um
minuto, mas 44 mil saíram. Só o líquido (+1,5 mil) empurra o preço.
