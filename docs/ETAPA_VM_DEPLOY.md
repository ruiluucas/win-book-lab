
---

# Deploy executado — 13/11/2026, 17:29–17:40 BRT

A VM voltou às 17:01 (uptime 26 min). O deploy foi feito na janela em que ela
esteve de pé.

## Padrão de queda medido

`last -x` na VM:

| evento | janela |
|---|---|
| boot | 15:15 → 15:40 (25 min) |
| desligamento | 15:40 → 15:42 |
| boot | 15:42 → 16:28 (45 min) |
| desligamento | 16:28 → 17:01 (33 min parada) |
| boot | 17:01 → em diante |

Quatro boots e dois desligamentos em menos de duas horas. Os desligamentos são
**limpos** (registrados como `shutdown`), não crash — alguém ou algo desliga.
Causa ainda desconhecida.

## O que foi feito

1. Coletores antigos parados e desabilitados (`coleta-ticks`, `backfill-dia`).
2. Compose antigo derrubado; **volume antigo preservado** até o novo provar que
   funciona — e removido depois (280 MB).
3. `/opt/winbook` criado com o stack novo.
4. `docker compose up -d --build` — `winbook-db` healthy, `winbook-coletor` up.
5. Schema aplicado num banco novo.
6. Volume antigo `mercado-tick_mercado_dados` removido (18,6 M ticks sem book).

`/opt/mercado-tick` **fica**: `mt5-bridge.service` roda
`/opt/mercado-tick/mt5server.exe`. Só os serviços que escreviam no banco antigo
foram desabilitados (todos já estavam `inactive`/`static`).

## Três bugs que só apareceram em banco novo

Nenhum deles podia ser visto no banco local, que já existia.

### B1. `add_compression_policy` sem compressão habilitada

```
psql:...:109: ERROR: columnstore not enabled on hypertable "book_delta_v2"
```

`tick` e `book` tinham `ALTER TABLE ... SET (timescaledb.compress, ...)` antes da
policy; `book_delta_v2` **não**. E o `psql` roda com `ON_ERROR_STOP`: o erro na
linha 109 **abortou o resto do arquivo**, incluindo os `ALTER TABLE tick ADD
COLUMN` do fim. Resultado: `tick` nasceu sem `lado_inferido` nem `t_recv_ns`.

Corrigido com o `SET (timescaledb.compress, compress_segmentby='symbol, lado',
compress_orderby='ts')` antes da policy.

### B2. Tupla de tick com 10 valores para 9 colunas

```
ERROR: INSERT has more expressions than target columns
```

`coleta_v5.py` monta `(ts, sym, time_msc, bid, ask, last, volume, lado, t1,
threading.get_ident())` — 10 campos — e o INSERT declara 9 colunas. O ramo
`tem_ns` passava a tupla crua; o ramo sem ns usava `t[:8]` e funcionava.

Corrigido para `[t[:9] for t in ticks]`. Prova: `len((1..10)[:9]) == 9`.

### B3. Colunas sem alias colapsam no driver `pg`

```js
const r = await c.query('SELECT (SELECT 1), (SELECT 2), (SELECT 3)');
// r.fields -> ['?column?', '?column?', '?column?']
// Object.values(r.rows[0]) -> [3]
```

`dbStats` usava seis subconsultas sem nome e lia `Object.values`. Resultado: a
métrica de snapshots vinha **"—" mesmo com o banco cheio** — e isso valia
**também para a fonte local**, não era um problema da VM.

Corrigido com alias em cada coluna (`snap_hoje`, `tick_hoje`, …).

## Estado final

```
winbook-db       | Up (healthy)   | volume winbook_winbook_dados
winbook-coletor  | Up             | WINZ26, ~6,5 snapshots/s, latência 11-12 ms
```

Verificação nas duas fontes, na mesma janela:

| fonte | snapshots hoje | ticks | delta | snapshots/min |
|---|---:|---:|---:|---:|
| local | 210.455 | 247.514 | 695.219 | 465 |
| VM | 648 | 744 | 2.270 | 377 |

Book pela VM: `bid 174180 / ask 174185`, spread 5, OBI 0,112, 5+5 níveis.

## Teste de UI com a VM

```
PASS  pilula diz Local / métricas locais carregam (211.307)
PASS  tunel ativo, banco da VM acessível
PASS  pilula diz VM / métricas da VM carregam (1.418)
PASS  book da VM com 5 bids / tooltip identifica a VM
PASS  volta para local / métricas locais (211.466)
PASS  zero erro JS
```

## Pendente

- **Causa das quedas.** Sem isso, a VM não pode ser fonte principal.
- Book com 2 anos de retenção no volume novo — definir se é o que se quer.
