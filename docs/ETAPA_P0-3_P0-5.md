# P0-3 (custo) e P0-5 (Holm) · CONCLUÍDAS

**Data:** 13/11/2026
**P0-4 (OFI):** especificação escrita, **implementação não autorizada**.

---

## P0-3 — Fonte única de custo

### O problema

`CUSTO = 5.0` estava **hardcoded em 4 arquivos**, e a documentação dizia 7,5.

### A solução

**Novo:** `scripts/parametros.py`

```python
CUSTO_BASE = 7.5                      # decisão do dono
SENSIBILIDADES = (5.0, 7.5, 10.0)     # obrigatórias em todo relatório
CUSTO_HISTORICO_2026_11_13 = 5.0      # registro, não parâmetro
PT_RS = 0.20
```

### Migração

| script | antes | depois |
|---|---|---|
| `book_tempo.py` | `CUSTO = 5.0` | importa `CUSTO_BASE`; `--custo`; **3 cenários sempre** |
| `analisa_book_db.py` | `CUSTO, PT_RS = 5.0, 0.20` | importa `CUSTO_HISTORICO` |
| `explica.py` | `CUSTO, PT_RS = 5.0, 0.20` | importa `CUSTO_HISTORICO` |
| `book_estrito.py` | `CUSTO = 5.0` | **default 5.0 preservado** + `--custo` |

**`book_estrito.py` mantém 5,0 de propósito:** é o método histórico e precisa continuar
reproduzindo o número de 13/11. Verificado após a migração: **n=26, 50,0%, p=0,977** — idêntico.

### Sensibilidade sempre visível

```
  SENSIBILIDADE DE CUSTO (fator 2x, h=3) — P0-3
    custo     bruto   liquido     R$/op   acerto
      5.0     +71.7     +66.7    +13.33    83.3%
      7.5     +71.7     +64.2    +12.83    83.3% <-- base
     10.0     +71.7     +61.7    +12.33    83.3%
```

**Teste automatizado** (`test_nenhum_script_hardcoda_custo_de_analise`) varre `scripts/` e
**falha se algum analisador voltar a ter custo literal** — só `book_estrito.py` é exceção.

---

## P0-5 — Holm-Bonferroni

### O problema

7 secundárias testadas sem correção = **30% de chance de ao menos um falso positivo**
(1 − 0,95⁷). O protocolo exigia Holm; o código não tinha.

### A solução

**Novo:** `scripts/inferencia.py` — `holm()` step-down + `avalia_familia()`.

### Verificação contra cálculo manual

m=5, p = [0.01, 0.02, 0.03, 0.04, 0.05]:

| passo | cálculo | resultado |
|---|---|---|
| i=0 | 0.01 ≤ 0.05/5 = 0.010 | **rejeita** |
| i=1 | 0.02 ≤ 0.05/4 = 0.0125 | **não** — para |

| p_adj | cálculo |
|---|---|
| i0 | 5×0.01 = **0.05** |
| i1 | 4×0.02 = **0.08** |
| i2 | 3×0.03 = **0.09** |
| i3 | 2×0.04 = 0.08 → max(0.09,0.08) = **0.09** |
| i4 | 1×0.05 = 0.05 → max(0.09,0.05) = **0.09** |

**Nota:** eu tinha escrito 0.10 para i3/i4 na primeira verificação. **Estava errado** — a
monotonicidade força 0.09. O código estava certo e a minha conta à mão, não.

### 12 testes

exemplo calculado à mão · todos significativos · nenhum · ordem original preservada ·
monotonicidade · limite em 1 · lista vazia · teste único · p inválido levanta ·
Holm nunca rejeita mais que sem correção · ordenação por p · família de 7.

**Bug de nomenclatura encontrado:** `testa_familia` começava com `test` e o pytest tentava
coletá-la como teste. Renomeada para `avalia_familia`.

---

## P0-4 — OFI: especificação, sem código

`docs/ESPECIFICACAO_OFI.md` (154 linhas). Conclusão central:

| variante | identificável? | decisão |
|---|---|---|
| **Event OFI** (Cont-Kukanov-Stoikov) | **NÃO** — 5 níveis, 4,22 Hz, sem add/cancel | **não implementar** |
| **Sampled OFI** | **SIM** — diferença entre snapshots | implementar **após 2 decisões** |

**Mudança de protocolo necessária:** a hipótese primária diz `OFI_top_classic`. Precisa
passar a dizer **`OFI_top_sampled`** — porque o clássico não é reconstruível.

**Duas decisões pendentes do dono:**

| # | decisão |
|---|---|
| 1 | aceitar `OFI_top_sampled` como primária (mudança formal) |
| 2 | normalizar por `V_bid + V_ask`? (sem isso, mede liquidez, não pressão) |

---

## Suíte e aceitação

```
44 passed in 50.41s
```

| arquivo | testes |
|---|---:|
| `test_janela.py` (E1.1) | 14 |
| `test_tempo.py` (P0-2) | 11 |
| `test_inferencia.py` (P0-5) | 12 |
| `test_parametros.py` (P0-3) | 7 |

## O que NÃO foi alterado

- Nenhum resultado histórico sobrescrito
- `book_estrito.py` continua reproduzindo 13/11 (n=26, 50,0%, p=0,977)
- OFI **não implementado**
- Protocolo **não alterado** (a mudança do OFI é proposta, não aplicada)
- Nenhum `UPDATE`/`DELETE` no banco
- Nenhum modelo, nenhum ML
