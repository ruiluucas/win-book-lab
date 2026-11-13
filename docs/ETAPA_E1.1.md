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

---

## Verificações pedidas na revisão do dono

### V1 — Critério 3 estava fraco → substituído por testes determinísticos

**Crítica aceita.** "Janela diferente produz número diferente" prova que o filtro
*funciona*, não que funciona *corretamente*.

Substituído por 7 testes com resultado esperado calculado à mão, sobre uma fixture
**sintética** de controle total (`tests/fixtures/sintetica_6snapshots.csv`):
6 snapshots, um por minuto exato (09:00 a 09:05), preço subindo 10 pts/min.

| teste | janela | esperado | verifica |
|---|---|---|---|
| `test_deterministico_janela_A` | [09:00, 09:03) | **3 snapshots** (min 0,1,2) | contagem exata |
| `test_deterministico_janela_B` | [09:02, 09:05) | **3 snapshots** (min 2,3,4) | contagem exata, janela deslocada |
| `test_limite_inicio_inclusivo` | [09:01, 09:04) | min 1 **presente** | convenção do limite inferior |
| `test_limite_fim_exclusivo` | [09:01, 09:04) | min 4 **ausente**, lista = [1,2,3] | convenção do limite superior |
| `test_idempotencia_mesma_janela` | idêntica 2× | frames iguais | determinismo no núcleo |
| `test_idempotencia_cli` | CLI 2× | **stdout idêntico** | determinismo ponta a ponta |
| `test_hash_aparece_e_bate_com_repo` | — | hash impresso == `git rev-parse` | rastreabilidade |

**Convenção documentada e unificada:** `[inicio, fim)` — início **incluso**, fim **excluso**.
Vale para `recorta()` (CSV) e para o SQL (`>= inicio AND < fim`).

**Inconsistência encontrada durante a verificação:** a CLI usava `BETWEEN` (inclusivo nos
dois lados) enquanto `recorta()` usava `[inicio, fim)`. **Corrigido** para a mesma
convenção. Após a correção, a janela documentada continua reproduzindo n=26, 50,0%, p=0,977.

### V2 — Hash do commit na saída

**Já estava implementado; a evidência não tinha sido apresentada.** Agora está:

```
$ python scripts/book_estrito.py --csv tests/fixtures/book_20min.csv
  JANELA DECLARADA : csv  ->  tests/fixtures/book_20min.csv
  DADOS ENCONTRADOS: 2026-11-13 09:30 -> 09:49 (20.0 min)
  SNAPSHOTS        : 6,657
  COMMIT           : cd67a1c
  CUSTO            : 5.0 pts

$ git rev-parse --short HEAD
cd67a1c
```

Implementação: `analisador.py:15` (`commit_hash()`), usado em `analisador.py:112`.
Teste automatizado: `test_hash_aparece_e_bate_com_repo` — compara o valor impresso com
`git rev-parse`, então **falha se divergirem**.

## Suíte final

```
tests/test_janela.py ..............  [100%]
14 passed
```

7 testes originais + 7 determinísticos. Todos rodam **sem banco e sem MT5**.
