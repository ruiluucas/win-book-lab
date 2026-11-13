# P0-1 — Reprodutibilidade das fixtures · CONCLUÍDA

**Data:** 13/11/2026
**Escopo autorizado:** **apenas** correção de reprodutibilidade. Nenhuma alteração de
código estatístico, protocolo ou resultado histórico.
**Commit:** `6d6f3aa0b29f77ef366810f4426bdcf98816e0b2` (`6d6f3aa`)

---

## O problema

`.gitignore` tinha `*.csv` **sem exceção**. As fixtures existiam no meu disco mas nunca
foram commitadas. Consequência medida: clone limpo → **11 failed, 3 passed**.

O repositório publicado não reproduzia os próprios testes. Qualquer auditor externo
recebia um projeto quebrado.

---

## O que mudou

### `.gitignore` — exceção específica, não geral

```diff
  *.parquet
- *.csv
  *.log
  dados/
+
+ # dados brutos NAO versionados
+ *.csv
+
+ # EXCECAO: fixtures de teste (pequenas, sem dado sensivel, necessarias ao pytest)
+ !tests/fixtures/*.csv
```

**Verificação de que a exceção é específica:**

| caminho | `git check-ignore` | esperado |
|---|---|---|
| `tests/fixtures/book_20min.csv` | **não ignorado** | ✅ liberado |
| `tests/fixtures/sintetica_6snapshots.csv` | **não ignorado** | ✅ liberado |
| `dados/qualquer.csv` | ignorado | ✅ continua bloqueado |
| `outro.csv` (raiz) | ignorado | ✅ continua bloqueado |

**`*.csv` NÃO foi liberado de forma geral.**

### Fixtures versionadas

| arquivo | tamanho | usado por |
|---|---:|---|
| `tests/fixtures/book_20min.csv` | 2.722 KB | 7 testes |
| `tests/fixtures/sintetica_6snapshots.csv` | 2,5 KB | 7 testes |
| ~~`book_2min.csv`~~ | ~~278 KB~~ | **removido — 0 referências** |

**Conteúdo:** apenas `ts, lado, nivel, preco, volume`. **Sem** conta, contrato, ordem,
ticket ou qualquer identificador. Nenhum dado sensível.

**Curadoria:** `book_2min.csv` existia mas **nenhum teste o usava** (grep = 0 ocorrências).
Removido em vez de versionado — 278 KB de dado desnecessário a menos no repositório.

---

## Comandos executados e saída

### 1. Clonar

```
$ git clone ~/Projetos/win-book-lab /tmp/wbl_final
Clonando em '/tmp/wbl_final'...
concluído.
```

### 2. Prova de que estamos DENTRO do clone

```
$ pwd
/tmp/wbl_final
$ git rev-parse --short HEAD
6d6f3aa
$ git remote get-url origin
/home/rui/Projetos/win-book-lab
```

### 3. `git ls-files tests/fixtures/` — critério 3

```
tests/fixtures/book_20min.csv
tests/fixtures/sintetica_6snapshots.csv
```

### 4. Arquivos em disco no clone — sem cópia local

```
tests/test_janela.py
tests/fixtures/sintetica_6snapshots.csv
tests/fixtures/book_20min.csv
```

**As fixtures vieram do clone, não do diretório original.**

### 5. `pytest` — saída integral, critério 4/5

```
============================= test session starts ==============================
collecting ... collected 14 items

tests/test_janela.py::test_amostra_nao_sobreposta PASSED                 [  7%]
tests/test_janela.py::test_amostra_conta_correta PASSED                  [ 14%]
tests/test_janela.py::test_fixture_integridade PASSED                    [ 21%]
tests/test_janela.py::test_sem_janela_falha PASSED                       [ 28%]
tests/test_janela.py::test_csv_roda_sem_banco PASSED                     [ 35%]
tests/test_janela.py::test_cabecalho_mostra_custo PASSED                 [ 42%]
tests/test_janela.py::test_commit_hash_presente PASSED                   [ 50%]
tests/test_janela.py::test_deterministico_janela_A PASSED                [ 57%]
tests/test_janela.py::test_deterministico_janela_B PASSED                [ 64%]
tests/test_janela.py::test_limite_inicio_inclusivo PASSED                [ 71%]
tests/test_janela.py::test_limite_fim_exclusivo PASSED                   [ 78%]
tests/test_janela.py::test_idempotencia_mesma_janela PASSED              [ 85%]
tests/test_janela.py::test_idempotencia_cli PASSED                       [ 92%]
tests/test_janela.py::test_hash_aparece_e_bate_com_repo PASSED           [100%]

============================= 14 passed in 50.12s ==============================
```

---

## Critérios de aceitação

| # | critério | resultado |
|---|---|---|
| 1 | versionar fixtures necessárias, sem dado desnecessário/sensível | **PASS** — 2 fixtures, `book_2min.csv` removido, sem dado sensível |
| 2 | `.gitignore` com exceção específica, sem liberar todos os CSVs | **PASS** — `!tests/fixtures/*.csv`; `dados/*.csv` e raiz seguem ignorados |
| 3 | `git ls-files tests/fixtures/` lista todas | **PASS** — 2 de 2 |
| 4 | testes em clone realmente limpo | **PASS** — `pwd=/tmp/wbl_final`, fixtures vindas do git |
| 5 | **14 passed** | **PASS** |
| 6 | SHA, comandos e saída integral registrados | **PASS** — este documento |

---

## Antes e depois

| ambiente | antes (`acf9c47`) | depois (`6d6f3aa`) |
|---|---|---|
| meu workspace | 14 passed | 14 passed |
| **clone limpo** | **11 failed, 3 passed** | **14 passed** |

---

## O que NÃO foi alterado

- Nenhum arquivo em `scripts/` tocado
- Nenhum teste modificado
- `PROTOCOLO.md`, `METODOLOGIA.md`, `EXECUCAO.md` intactos
- Nenhum resultado histórico sobrescrito
- Custo continua 5,0 no código (é P0-3, não autorizado ainda)
- Nenhum `UPDATE`/`DELETE` no banco

## Regra temporal aprovada — registrada para P0-2

| parâmetro | definição |
|---|---|
| nominal | **mediana do intervalo entre snapshots da janela** |
| limite primário | **2 × nominal** |
| acima do limite | excluir do teste primário e contabilizar |
| sensibilidade | **1×, 2× e 5×** |
| congelamento | **antes** de novos testes econômicos |

**Ainda não implementada.** É P0-2, aguardando liberação.

## Próximo

P0-2 — temporalidade: horizonte por tempo com `max_atraso = 2 × nominal`, e a nova
metodologia produzindo **versão identificável**, preservando integralmente os resultados
anteriores (sem sobrescrever).

