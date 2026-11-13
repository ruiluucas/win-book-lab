# Protocolo — hipóteses pré-registradas

Congelado **antes** de olhar dados novos. Mudança depois do congelamento invalida o teste
confirmatório e exige nova amostra.

## Por que existe

Em 13/11/2026 testei **6 horizontes × 4 limiares = 24 comparações** nos mesmos 80 minutos
e destaquei o melhor (5 min, 62,5%, +50,6 pts/op). **Isso é seleção sobre ruído.**

A amostra de 13/11 está **QUEIMADA** — exploratória, não reutilizável como confirmação.

## Hipótese primária (uma só, testada separadamente)

| item | definição |
|---|---|
| **feature** | `OFI_top_classic` — fluxo líquido de ordens no melhor nível (Cont, Kukanov & Stoikov, 2014) |
| **janela** | **1 s** (ver nota de resolução) |
| **alvo** | variação do **mid** no horizonte executável mínimo identificado em `EXECUCAO.md` |
| **rótulo** | sinal da variação; **empates excluídos e reportados** |
| **teste** | Spearman, **unicaudal** (efeito esperado positivo) |
| **α** | **0,05** |
| **amostragem** | 1 observação a cada `h` minutos — **sem sobreposição** |
| **mínimo operacional** | **20 sessões** com regimes variados |

### Nota de resolução

A janela de 250 ms que constava na versão anterior é **inviável**: com ~8,5 snapshots/s,
250 ms contém ~2 observações. Uma feature de fluxo precisa de resolução para detectar
mudanças de preço. **Janela mínima adotada: 1 s** (~8,5 observações).

## Hipótese primária NÃO participa do Holm

**Motivo:** Holm controla o erro tipo I **dentro de uma família** de comparações. A
primária é única, pré-registrada, e não é uma escolha entre alternativas. Incluí-la na
família confundiria o controle.

- **Primária:** α = 0,05, teste único, sem correção
- **Secundárias:** família com Holm, α = 0,05

## Hipóteses secundárias (contam para Holm)

| # | feature | o que investiga |
|---|---|---|
| 1 | `OBI_1` | desequilíbrio no melhor nível |
| 2 | `OBI_5` | desequilíbrio em 5 níveis |
| 3 | `OBI` ponderado por profundidade | mesma coisa, peso por volume |
| 4 | `microprice − mid` | pressão implícita no topo |
| 5 | `OFI_top_volume` | variação agregada (não é OFI) |
| 6 | razão `volume_increase / volume_decrease` no bid | assimetria de fluxo |
| 7 | `spread` | custo contemporâneo (controle) |

**7 comparações.** Holm com α=0,05 → o menor p precisa ser **< 0,05/7 ≈ 0,0071**.

## Regra de decisão — sem substituto

| resultado | conclusão |
|---|---|
| primária p < 0,05 **e** P&L executável > 0 | **sinal** |
| primária p < 0,05 **mas** P&L executável ≤ 0 | **sinal sem valor econômico** — resultado válido, registrar |
| primária p ≥ 0,05 | **sem evidência** |

**Se a primária falhar, uma secundária com p baixo NÃO a substitui.** No máximo vira
hipótese para amostra nova, declarada como tal.

## Modelo de execução

- **Ordem a mercado:** compra no ask, vende no bid
- **Custo base:** **7,5 pts** (5 spread + 2,5 corretagem)
- **Sensibilidade:** 5 / 7,5 / 10 pts
- **Toda tabela** rotulada como `mid-to-mid` ou `executável`

Detalhes em [`EXECUCAO.md`](EXECUCAO.md).

## Poder estatístico

Duas réguas distintas — **não confundir**:

| régua | fórmula | pergunta |
|---|---|---|
| taxa de acerto | `n ≈ (z_{α/2}+z_β)² · p(1-p) / (p₁-p₀)²` | acerta mais que moeda? |
| **P&L líquido** | `n ≈ (z_{α/2}+z_β)² · σ² / μ²` | média de pts/op é positiva? |

Com σ medido por horizonte e μ = 2 / 3 / 5 pts, o n necessário é reportado em
`scripts/poder.py`. A régua de "800 eventos" vale **só** para a taxa de acerto.

## Sessões, não só eventos

Eventos de uma mesma sessão compartilham regime de volatilidade. **Reportar o número de
sessões.** 100 eventos em 1 sessão não valem 100 eventos.

Erro-padrão por **cluster de sessão**, não por evento.

## Congelamento

Tag no git antes de rodar análise nas sessões novas.

```bash
git tag protocolo-v1 && git push --tags
```
