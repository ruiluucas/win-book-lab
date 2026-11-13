# Protocolo de análise — congelado ANTES de olhar dados novos

## Por que este documento existe

Na sessão de 13/11/2026 eu testei **6 horizontes × 4 limiares = 24 comparações** nos
mesmos 80 minutos, e no relatório destaquei o melhor resultado (5 min, 62,5% de acerto,
+50,6 pts/op, p=0,14). **Isso é seleção sobre ruído.** Com 24 olhadas, o melhor número
aparece por sorte mesmo se não houver sinal nenhum.

A amostra de 13/11 está **QUEIMADA** (exploratória). Não será reutilizada como
confirmação.

## Hipótese primária (uma só)

| item | definição |
|---|---|
| **feature** | **OFI do nível 0** — `Δvolume_bid(1º nível) − Δvolume_ask(1º nível)` na janela de 250 ms |
| **alvo** | variação do **mid** no horizonte executável mínimo (a determinar em P1.6) |
| **rótulo** | sinal da variação; empates (>15% dos casos) **excluídos e reportados** |
| **teste** | Spearman, **unicaudal** (efeito esperado positivo) |
| **α** | **0,05**, com correção de Holm para as hipóteses secundárias |
| **amostragem** | **1 observação a cada `h` minutos** — sem sobreposição |
| **mínimo** | **20 sessões** com regimes variados |

## Hipóteses secundárias (declaradas, contam para a correção)

1. OBI_5 (baseline atual)
2. OBI só do nível 0
3. OBI ponderado por profundidade
4. microprice − mid
5. OFI agregado em 5 níveis
6. razão `vol_up / vol_down` no bid
7. spread contemporâneo

**7 hipóteses secundárias + 1 primária = 8 comparações.** Holm com α=0,05:
o menor p precisa ser < 0,00625.

## Da amostra já olhada

24 combinações (6 horizontes × 4 limiares) foram examinadas em 13/11 → **queimadas**.

## Regra de decisão

| resultado | conclusão |
|---|---|
| hipótese primária com p < 0,05 após Holm **e** P&L líquido > 0 com custo de 7,5 pts | **sinal** |
| p < 0,05 mas P&L ≤ 0 | **sinal sem valor econômico** — registrar como resultado válido |
| p ≥ 0,05 | **sem evidência** — não é "quase", é sem evidência |

## Modelo de execução (fixo)

- **Ordem a mercado:** compra no ask, vende no bid.
- **Custo:** **7,5 pts** = 5 de spread + 2,5 de corretagem.
- **Sensibilidade:** 5 / 7,5 / 10 pts.
- **Ordem limitada:** não modelada. Exigiria fila, seleção adversa e probabilidade de
  execução, e a posição na fila **não é observável** no MT5.

## Poder estatístico

`n ≈ (z_{α/2} + z_β)² · σ² / μ²`

Com μ = 3 pts líquidos e σ medido por horizonte, o n necessário é reportado pelo
`scripts/poder.py`. A régua de "800 eventos" vale para **taxa de acerto**, não para
P&L — são coisas diferentes.

## Congelamento

Este documento é **taggeado no git antes** de rodar qualquer análise nas sessões novas.
Mudança depois do congelamento invalida o teste confirmatório e exige nova amostra.
