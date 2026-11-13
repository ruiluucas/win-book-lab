# Adendo 01 ao Protocolo — janela da feature primária

**Data:** 13/11/2026
**Natureza:** alteração metodológica, **não** correção de implementação
**Aprovado por:** dono do projeto

## O que muda

| item | valor |
|---|---|
| **hipótese original** | janela de **250 ms** |
| **nova especificação** | janela de **1 segundo** |
| **justificativa** | resolução limitada da coleta |
| **protocolo** | `docs/PROTOCOLO.md` v1 → **v2** |
| **vigência** | a partir da próxima coleta, não retroativamente |

## Justificativa técnica

Com ~8,5 snapshots/s, o intervalo entre leituras é **~118 ms**.

| janela | observações na janela |
|---|---:|
| 250 ms | **~2** |
| 1 s | **~8,5** |

Uma feature de fluxo precisa de resolução para detectar mudança de preço nível a nível.
Com 2 pontos, o OFI clássico **perde a maior parte dos eventos**.

## O que NÃO motivou a mudança

- **Não** foi escolhida olhando resultados. Os resultados de 13/11 são de OBI, não de OFI;
  nenhum teste de OFI foi executado com nenhuma janela.
- **Não** é ajuste para melhorar número. Não há número de OFI para melhorar.
- **Não** é reversão de decisão anterior motivada por desempenho.

## O que permanece congelado

- hipótese primária: `OFI_top_classic`
- α = 0,05, teste unicaudal
- mínimos: 20 sessões
- custo base: 7,5 pts, sensibilidade 5 e 10
- Holm nas secundárias, primária fora da família

## Registro

A alteração está declarada **antes** de qualquer teste de OFI existir. Se o teste de OFI
com 1 s falhar, **não** se volta para 250 ms "porque rendeu mais" — a justificativa foi
de resolução, não de resultado.
