# Features — o que cada uma investiga

## Diferença fundamental: OFI clássico ≠ variação de volume

Confundir as duas é o erro mais comum. **Não são a mesma coisa.**

### `OFI_top_classic` — definido por Cont, Kukanov & Stoikov (2014)

Mede o **fluxo líquido de ordens** no melhor nível, reagindo a mudanças de preço:

```
Se o bid sobe (novo bid > bid_anterior):
    OFI += volume_do_novo_bid
Se o bid cai:
    OFI -= volume_do_bid_que_saiu
Se o bid fica igual:
    OFI += (volume_novo − volume_anterior)
```

Simetricamente para o ask (com sinal invertido). O OFI responde à pergunta:
**quem está empurrando o preço?**

### `OFI_top_volume` — variação agregada de volume

```
OFI_top_volume = Δvolume_bid(nível 0) − Δvolume_ask(nível 0)
```

Simples, mas **não é OFI**: ignora que o preço mudou. Se o bid sobe um tick, o volume no
"nível 0" é de um preço diferente — comparar é comparar coisas distintas. **É a mesma
armadilha do P0.1** (delta por nível em vez de por preço).

**Usar `OFI_top_classic` como hipótese primária.** `OFI_top_volume` fica como comparação
para quantificar o erro.

## Tabela comparativa

| feature | fórmula | fenômeno investigado | limitação |
|---|---|---|---|
| **`OFI_top_classic`** | ver acima | fluxo líquido de ordens no topo | exige resolução temporal fina |
| **`OFI_top_volume`** | `Δvol_bid − Δvol_ask` no nível 0 | variação bruta de volume | **ignora mudança de preço** |
| **`OBI_1`** | `(vol_bid₁ − vol_ask₁)/(vol_bid₁ + vol_ask₁)` | desequilíbrio instantâneo no topo | não diz fluxo, só estado |
| **`OBI_5`** | idem, somando 5 níveis | desequilíbrio agregado | níveis fundos têm peso igual e são mais sujeitos a ordem passiva grande |
| **`microprice − mid`** | `(bid·vol_ask + ask·vol_bid)/(vol_bid+vol_ask) − mid` | pressão implícita no topo | só o nível 1 |
| **`spread`** | `ask − bid` | custo contemporâneo | não prediz direção; prediz custo |

## Como avaliar informação incremental

Não basta cada feature ter correlação isolada. A pergunta certa é:

> **a feature X acrescenta informação além de Y?**

Três formas, em ordem de rigor:

1. **Regressão múltipla** — coeficiente de X com Y controlado. Se cai a zero, X não agrega.
2. **Comparação de AUC/poder fora da amostra** — modelo com e sem X, sessões diferentes.
3. **Decomposição de variância** — quanto da variância explicada é exclusiva de X.

**Correlação entre features é alta por construção** (OBI_1 e OBI_5 compartilham o nível 0).
Reportar a matriz de correlação entre elas antes de qualquer conclusão de "X funciona".

## Limite de resolução — a restrição física

Com **~8,5 snapshots/s**, o intervalo entre observações é **~118 ms**.

| janela | observações por janela |
|---|---:|
| 250 ms | **~2** |
| 500 ms | ~4 |
| 1 s | ~8,5 |
| 5 s | ~42 |

**Consequência:** uma feature "calculada em 250 ms" tem **resolução de 2 pontos**. O OFI
clássico, que depende de detectar mudança de preço nível a nível, **perde a maior parte
dos eventos** nessa janela.

Isso **não é limitação do cálculo** — é do polling. Duas saídas:

1. **Usar janelas ≥ 1 s** e aceitar horizonte mais longo
2. **Captura orientada a evento** (P3 da revisão): um EA dentro do MT5 com `OnBookEvent`
   enviaria cada mudança, sem polling. **NÃO VERIFICADO** se funciona sob Proton/Wine
   nesta conta.

## Features de book vs de fita

**O que se sabe:** Sirignano & Cont (2019) mostram que features de **book** (profundidade,
desequilíbrio) carregam informação sobre o próximo movimento, em book de ações americanas.

**O que NÃO se sabe:** que features de fita sejam inferiores. **Essa afirmação foi removida
do README** por falta de evidência bibliográfica direta. É uma hipótese a testar, não um
fato estabelecido.
