# Comprovações exigidas antes de autorizar mudanças

**Data:** 13/11/2026 · **Commit auditado:** `acf9c47`
**Nenhum arquivo de código, banco ou protocolo foi alterado.**

---

## C1 — O clone limpo realmente falha, executado DENTRO do clone

**Observação do dono:** o comando apresentado no chat (`git clone ... && pytest tests/`)
não entra no diretório. Crítica correta **à apresentação** — mas o comando real já tinha
`cd wbl_clone` na linha seguinte. Repetido agora com prova de diretório:

```
$ git clone -q ~/Projetos/win-book-lab /tmp/wbl_clone2
$ cd /tmp/wbl_clone2
$ pwd
/tmp/wbl_clone2
$ git rev-parse --short HEAD
dd69c17

$ git ls-files tests/fixtures/
(vazio)

$ git ls-files tests/
tests/test_janela.py

$ find tests -type f
tests/test_janela.py

$ pytest tests/
11 failed, 3 passed
```

**VEREDITO: CONFIRMADO.** `pwd` é o clone; o git versionou **só** `test_janela.py`; a
suíte falha **dentro** do clone. A causa é `.gitignore:6:*.csv`.

---

## C2 — O cálculo temporal não introduz viés por seleção de snapshots ou gaps

Método: `pos = searchsorted(t, t + mh*60, side='left')` → primeiro snapshot **≥** alvo.

| h | base | válidas | descartadas | atraso mediano | p95 | **máximo** | caem em gap |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.227 | 21.979 | 248 | **+0,109 s** | +0,221 s | +2,246 s | 10 |
| 2 | 22.227 | 21.731 | 496 | +0,109 s | +0,222 s | +2,166 s | 9 |
| 3 | 22.227 | 21.483 | 744 | **+0,110 s** | +0,223 s | +2,130 s | 9 |
| 5 | 22.227 | 20.988 | 1.239 | +0,107 s | +0,223 s | +2,099 s | 9 |

**Três verificações:**

1. **Atraso mediano +0,109 s** = exatamente metade do intervalo de polling (~118 ms).
   É o esperado de uma amostragem uniforme — **não há seleção preferencial** de snapshot.
2. **Descartadas** = apenas as últimas `h×60 s` da janela, onde não existe futuro. Correto.
3. **Gaps:** entre 9 e 10 observações caem logo após um gap > 2 s, de ~22 mil (0,04%). O
   atraso máximo de +2,25 s vem desses casos.

**VEREDITO: NÃO CONFIRMADO** (não há viés). **Ressalva:** o código atual **não impõe
tolerância máxima**. Uma observação com atraso de 2,13 s conta igual a uma de 0,11 s.
Isso afeta 0,04% da amostra hoje, mas sem `max_atraso` o comportamento não é declarado.

---

## C3 — O +8,1 pts é reproduzível a partir dos dados originais

**h = 3 minutos, por tempo. Janela 09:20–10:40, commit `acf9c47`.**

| item | valor |
|---|---:|
| observações independentes (base) | 27 |
| **válidas (com futuro)** | **26** |
| descartadas | 1 |
| horizonte mediano | **3,002 min** |
| horizonte p05 / p95 | 3,000 / 3,003 |
| horizonte mínimo / máximo | 3,000 / **3,005** |
| acerto bruto | 53,8% |

### Horizonte realizado — a correção funciona

Mediana **3,002 min** contra alvo de 3,000. Máximo 3,005. **O horizonte agora é o anunciado**
(antes, por linhas, era 2,72 min).

### Resultado por cenário de custo

| custo | bruto | líquido | IC95% | p |
|---:|---:|---:|---:|---:|
| 5,0 | +13,1 | **+8,1** | [−33,9, +50,1] | 0,695 |
| **7,5** | +13,1 | **+5,6** | [−36,4, +47,6] | 0,787 |
| 10,0 | +13,1 | +3,1 | [−38,9, +45,1] | 0,881 |

**O +8,1 é reproduzível** — é o valor líquido com custo 5,0.

**Mas não é edge.** O IC95% vai de **−33,9 a +50,1** e contém zero. Com 26 observações, a
estimativa pontual é compatível com "sem efeito" e com "efeito grande", igualmente.

### Por sessão

**Sessões disponíveis: 1.** Não é possível agrupar. E como `n_sessoes = 1` não permite
estimar variância entre sessões, **o IC acima superestima a precisão** — trata 26
observações da mesma sessão como independentes entre si.

---

## Conclusão das três comprovações

| # | pergunta | resposta |
|---|---|---|
| C1 | o clone falha de verdade? | **SIM** — provado com `pwd`, `git ls-files`, 11 failed |
| C2 | o cálculo temporal tem viés de seleção? | **NÃO** — atraso +0,109 s, uniforme |
| C3 | o +8,1 é reproduzível? | **SIM** — mas IC [−33,9, +50,1], p=0,695 |

**O que isso significa:** a correção temporal é válida e o número é real. **O número não é
evidência de edge.** 26 observações em uma sessão não distinguem +8,1 de zero.

## O que falta antes de qualquer alegação

| item | status |
|---|---|
| 20 sessões (protocolo) | 1 de 20 |
| Holm | não implementado |
| OFI (hipótese primária) | não implementado |
| variância entre sessões | impossível com n_sessoes=1 |
| tolerância máxima de atraso | não declarada no código |

