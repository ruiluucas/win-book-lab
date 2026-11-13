# Histórico — resultados superados

## 13/11/2026, 09:20–09:48 (28 min)

**SUPERADO: invalidado pela régua estrita.**

Relatava acerto de 56,2–56,5% na direção do OBI, correlação +0,12 a +0,13 com
p ≈ 1e-30, e +33 pts/op em 3 min.

**Por que caiu:** os 9.193 snapshots dessa janela correspondem a **9 observações
independentes** em h=3 min. Usar todos os snapshots sobrepostos infla o t-stat: cada
evento de 3 min contém 1.030 medições do mesmo movimento.

Com amostragem sem sobreposição: **50,0% de acerto, p = 0,98.**

## "~97% de churn" no book

**SUPERADO: artefato de chaveamento por nível.**

O delta era calculado por `(lado, nível)` em vez de `(lado, preço)`. Quando o melhor
preço desliza 1 tick, os 5 níveis trocam de preço e o delta compara coisas diferentes —
gerando `add`/`cancel` falsos nos 10 níveis.

Valor correto (por preço): **25% de churn**, dos quais 98,3% é cancelamento e 1,7% é
execução. Os outros 75% da "movimentação" são preço entrando/saindo da janela de 5
níveis — limitação de amostragem, não ordem.

## "Coleta 100% das mudanças do book"

**SUPERADO: não verificado.**

A taxa de 8,8 mudanças/s foi medida com o **mesmo polling** que se queria validar
(circular), em mercado calmo. Em rajadas a taxa sobe. O verificado é que o coletor grava
~8,3 snapshots/s sem duplicatas.
