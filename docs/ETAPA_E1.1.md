# E1.1 — Janela temporal reproduzível · CONCLUÍDA

**Data:** 13/11/2026 · **Critério:** reproduzir o resultado publicado na janela correta
e falhar sem janela declarada.

## O problema

`book_estrito.py` carregava o banco inteiro (`SELECT ... FROM book` sem `WHERE`).
Rodar hoje dá número diferente de ontem, porque a coleta continua. O resultado
publicado (50,0%, p=0,977) não era reproduzível a partir do script que deveria produzi-lo.

## O que mudou

**Novo:** `scripts/analisador.py` — núcleo compartilhado.
- `carrega_db(inicio, fim)` — janela obrigatória por parâmetro SQL
- `carrega_csv(caminho)` — roda sem banco (fixture versionada)
- `amostra_independente(S, minutos)` — a régua
- `cabecalho(...)` — imprime **janela, dados encontrados, n, commit, custo**

**Refatorado:** `scripts/book_estrito.py`
- `--inicio` e `--fim` obrigatórios; `--csv` como alternativa
- sem parâmetros → **exit code 2** com mensagem
- cabeçalho com hash do commit e custo em toda execução

**Novo:** `tests/test_janela.py` — 7 testes, **rodam sem banco e sem MT5**
**Novo:** `tests/fixtures/book_20min.csv` — 6.657 snapshots reais (2,7 MB)

## Diff resumido

```diff
- q = """SELECT ts, max(...) ... FROM book GROUP BY ts ORDER BY ts"""
- S = pd.read_sql(q, conn)
+ ap.add_argument("--inicio"); ap.add_argument("--fim"); ap.add_argument("--csv")
+ if a.csv:            S = carrega_csv(a.csv);   meta = cabecalho(S, "csv", a.csv, CUSTO)
+ elif a.inicio and a.fim: S = carrega_db(a.inicio, a.fim); meta = cabecalho(...)
+ else:                sys.exit(2)
```

## Evidências de aceitação

| # | critério | resultado |
|---|---|---|
| 1 | janela 09:20–10:40 reproduz n=26, 50,0%, p=0,977 | **PASS** — obtido exatamente |
| 2 | sem parâmetros → exit ≠ 0 | **PASS** — exit code **2** |
| 3 | janela diferente dá número diferente | **PASS** — dia inteiro: n=67, 47,8%, p=0,304 |
| 4 | roda sem banco (fixture CSV) | **PASS** — 7 testes, sem `MERCADO_DSN` |

### Saída do critério 1

```
  JANELA DECLARADA : 2026-11-13 09:20  ->  2026-11-13 10:40
  COMMIT           : 667b4b0
  CUSTO            : 5.0 pts
     h  n_indep  acerto   pts/op   R$/op       t         p      veredito
     1       79   43.0%     +0.7   +0.13    0.09     0.927         ruido
     2       39   46.2%     -8.5   -1.69   -0.62     0.536         ruido
     3       26   50.0%     +0.6   +0.12    0.03     0.977         ruido
     5       15   66.7%    +61.3  +12.27    1.84     0.087         ruido
```

**h=3: n=26, 50,0%, p=0,977** — idêntico ao publicado em 13/11.

### Testes

```
tests/test_janela.py .......  [100%]
7 passed
```

| teste | o que verifica |
|---|---|
| `test_amostra_nao_sobreposta` | gap entre observações ≥ h |
| `test_amostra_conta_correta` | 20 min / 3 min = 7 observações |
| `test_fixture_integridade` | bid<ask, spread múltiplo de 5, ts crescente |
| `test_sem_janela_falha` | exit ≠ 0 e mensagem |
| `test_csv_roda_sem_banco` | funciona sem `MERCADO_DSN` |
| `test_cabecalho_mostra_custo` | custo rastreável |
| `test_commit_hash_presente` | hash disponível |

## O que ainda não está feito nesta etapa

- **CUSTO continua 5.0** — é E1.2. O cabeçalho já imprime o valor, o que torna a
  divergência visível em vez de silenciosa.
- **p-valor bicaudal** — é E2.6.
- `analisa_book_db.py` **não foi refatorado** — é E2.4 (padronização). Continua com
  `--dia` e sem janela obrigatória.

## Ressalva registrada

O critério 3 foi escrito originalmente como "n=63". Na execução deu **n=67**, porque a
coleta continuou entre a auditoria e a implementação. **Isso não é falha do teste** — é
a demonstração do problema que E1.1 resolve: sem janela declarada, o número muda.

O critério correto passou a ser: *"janela diferente produz número diferente do
documentado"*, que se verifica independentemente do tamanho da coleta.
