# P0-2 — Horizonte por tempo real · CONCLUÍDA

**Data:** 13/11/2026 · **Commit:** `3a725e1`
**Escopo:** temporalidade **apenas**. Custo, OFI, testes estatísticos e protocolo **intactos**.

---

## O problema corrigido

O método antigo calculava `h = minutos × 60 / mediana(dt)` → **h LINHAS**. Como o coletor
só grava quando o book muda, os intervalos são irregulares e o horizonte real saía **~9%
menor** que o anunciado (3 min → 2,72 min).

---

## Convivência dos dois métodos — nada foi sobrescrito

| script | método | status |
|---|---|---|
| `scripts/book_estrito.py` | **antigo**, por linhas | **intocado** |
| `scripts/book_tempo.py` | **novo**, por tempo | criado |
| `scripts/tempo.py` | núcleo do novo | criado |

Os dois rodam na mesma janela e podem ser comparados linha a linha.

---

## Regra temporal (congelada antes de teste econômico)

| parâmetro | definição implementada |
|---|---|
| **nominal** | `mediana(diff(ts))` **da própria janela** |
| **limite** | `fator × nominal` |
| **válida** | `atraso <= limite` — **INCLUSIVO** (igualdade passa) |
| **sem futuro** | descartada, motivo `sem_futuro` |
| **atraso > limite** | descartada, motivo `atraso_excessivo`, contabilizada |
| **fatores** | 1, 2 (primário), 5 |

---

## Comparação na janela real — 09:20 a 10:40, mesmos dados

| h | **ANTIGO** (linhas) | **NOVO** (tempo) | diferença |
|---:|---:|---:|---:|
| 1 | +0,7 | **+8,0** | +7,3 |
| 2 | −8,5 | **+0,8** | +9,3 |
| 3 | +0,6 | **+13,1** | +12,5 |
| 5 | +61,3 | **+75,3** | +14,0 |

### Horizonte realizado

| método | anunciado | **real (mediana)** |
|---|---:|---:|
| antigo | 3 min | **2,72 min** ❌ |
| **novo** | 3 min | **3,002 min** ✅ |

**p05–p95: 3,000–3,003 min.** O horizonte agora é o anunciado.

---

## Sensibilidade de limite (h=3)

| fator | limite | válidas | sem futuro | atraso > | cobertura | h real | bruto | líquido |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **1×** | 236 ms | 25 | 1 | **1** | 92,6% | 3,002 | +12,2 | +7,2 |
| **2×** | 472 ms | 26 | 1 | **0** | 96,3% | 3,002 | +13,1 | +8,1 |
| **5×** | 1.180 ms | 26 | 1 | 0 | 96,3% | 3,002 | +13,1 | +8,1 |

**A diferença entre 1× e 2× é uma observação.** 2× e 5× são idênticos — o limite deixa de
morder acima de 472 ms nesta janela.

---

## Distribuição dos atrasos (fator 2×, h=3)

| métrica | valor |
|---|---:|
| atraso mediano | 110,4 ms |
| atraso p95 | ~223 ms |
| atraso máximo | 2,25 s |
| cobertura | 96,3% |

A distribuição é **bimodal** (picos em 175 ms e 237 ms, vale em 200–225 ms) — por isso o
atraso mediano (110,4 ms) não é exatamente metade do nominal (118 ms).

---

## Testes dos limites temporais — 11 testes

| teste | o que verifica |
|---|---|
| `test_atraso_exatamente_no_limite_e_valido` | **atraso == limite → VÁLIDO** (inclusivo) |
| `test_atraso_um_epsilon_acima_do_limite_e_invalido` | limite + 1 ms → inválido |
| `test_atraso_muito_acima_do_limite` | salto de 30 s → descarte |
| `test_gap_descarta_observacao_que_cruza_o_buraco` | gap de 20 s |
| `test_gap_grande_entre_entrada_e_alvo` | gap de 180 s engolindo o alvo |
| `test_ultimo_snapshot_sem_futuro` | último → `sem_futuro`, atraso NaN |
| `test_janela_menor_que_horizonte_tudo_sem_futuro` | 5 min de janela, 10 de horizonte → 0 válidas |
| `test_nominal_muda_com_a_frequencia` | 237 ms vs 106 ms → nominal 0,237 vs 0,106 |
| `test_mesma_janela_mesmo_limite_independente_de_fator` | `max_atraso_s` explícito == 2× nominal |
| `test_contabilidade_fecha` | `n_base = válido + sem_futuro + atraso_excessivo` |
| `test_horizonte_realizado_proximo_do_alvo` | h_real ≈ alvo |

**Nota:** os dois primeiros testes **falharam na primeira execução** — erro meu de
construção (coloquei um snapshot em 60 s quando queria 61 s para gerar atraso de 1 s). O
teste pegou o erro, não o código. Corrigido.

---

## Aceitação — clone limpo

```
$ git clone ~/Projetos/win-book-lab /tmp/wbl_p02 && cd /tmp/wbl_p02
$ pwd
/tmp/wbl_p02
$ git rev-parse --short HEAD
3a725e1
$ pytest tests/ -q
25 passed in 52.10s
```

| ambiente | resultado |
|---|---|
| workspace | **25 passed** |
| **clone limpo** | **25 passed** |

14 testes de E1.1 + 11 de P0-2.

---

## O que NÃO foi alterado

- `book_estrito.py` — método antigo **intocado**, continua reproduzindo os resultados de 13/11
- `CUSTO = 5.0` em todos os scripts — é P0-3
- Nenhum OFI, nenhum Holm, nenhum teste estatístico novo
- `PROTOCOLO.md`, `METODOLOGIA.md`, `EXECUCAO.md` intactos
- Nenhum resultado histórico sobrescrito
- Nenhum `UPDATE`/`DELETE` no banco

## Como comparar

```bash
# método antigo (por linhas)
python scripts/book_estrito.py --inicio "2026-11-13 09:20" --fim "2026-11-13 10:40"

# método corrigido (por tempo, com sensibilidade)
python scripts/book_tempo.py --inicio "2026-11-13 09:20" --fim "2026-11-13 10:40"
python scripts/book_tempo.py --inicio "..." --fim "..." --fator 1
```

## O que isso NÃO significa

O +13,1 pts/op (bruto, h=3) **não é edge**. Continua sendo 26 observações de uma sessão,
com `n_sessoes = 1`. A correção temporal remove um viés de método; não cria evidência.

**Próximo:** P0-3 (custo único de 7,5 com sensibilidade 5/10), preservando os resultados
com custo 5.

