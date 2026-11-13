# Modelo de execução e latência

## Custo

**Base: 7,5 pontos por round trip.**

| componente | pontos | origem |
|---|---:|---|
| spread (comprar no ask, vender no bid) | **5** | medido: spread mediano do WINZ26 = 5 pts |
| corretagem | **2,5** | R$ 0,50 ÷ R$ 0,20/pt (RLP BTG) |
| **total** | **7,5** | |

**Sensibilidade:** 5 / 7,5 / 10 pts. O cenário de 5 pressupõe execução no mid, que **não
acontece** em ordem a mercado — serve só como piso teórico.

**NÃO VERIFICADO:** o custo de 7,5 pts é **teórico**. O R$ 0,50/round trip foi confirmado
por notas de corretagem de outra série (out/2026), não desta. Slippage real não medido.

## Mid-to-mid ≠ P&L executável

Esta distinção é obrigatória em toda tabela:

| medida | o que é | quando usar |
|---|---|---|
| **mid-to-mid** | `(mid_saída − mid_entrada) × direção` | mede **sinal**, não lucro |
| **executável** | compra no ask, vende no bid, menos corretagem | mede **lucro** |

Um resultado positivo em mid-to-mid pode ser negativo em executável. **Toda tabela do
projeto deve dizer qual das duas é.** Na versão anterior, não dizia.

## Latência ponta a ponta

Do evento no mercado até a ordem na exchange:

| etapa | latência | medido? |
|---|---|---:|
| 1. evento no book do servidor | — | — |
| 2. servidor → MT5 (Wine/Proton) | desconhecida | ❌ |
| 3. MT5 → coletor (ponte RPyC) | **6–48 ms** | ✅ |
| 4. **polling** — espera até a próxima leitura | **0–118 ms** | ✅ (derivado de 8,5/s) |
| 5. processamento / decisão do modelo | não implementado | — |
| 6. ordem → corretora | desconhecida | ❌ |
| 7. corretora → B3 | desconhecida | ❌ |

**O que está medido:** só os passos 3 e 4. As etapas 2, 6 e 7 **não foram medidas** e não
há como medir sem dados da corretora.

**Consequência:** o horizonte mínimo executável é **desconhecido**. O que se sabe é que
entre o evento e a decisão passam **no mínimo ~120 ms** (polling) mais a latência da
corretora. Qualquer feature que só tenha poder em janelas menores que isso é
**inutilizável na prática**.

## Cenários de latência (HIPOTÉTICOS)

Não são medições. São cenários para dimensionar o que precisaria ser verdadeiro:

| latência total assumida | horizonte mínimo viável | observação |
|---:|---|---|
| **5 ms** | ~10 ms | exigiria captura orientada a evento + colocation |
| **10 ms** | ~25 ms | captura por evento dentro do MT5 (P3) |
| **25 ms** | ~60 ms | captura por evento sem otimização |
| **50 ms** | ~120 ms | limite do polling atual |
| **100 ms** | ~250 ms | polling lento + processamento |

**Nenhum destes foi medido.** A tabela existe para deixar claro que o horizonte em que a
literatura de microestrutura encontra efeito (ms a segundos) está **abaixo** do que este
sistema consegue alcançar.

## Modelo de ordem

**Ordem a mercado.** Compra no ask, vende no bid. Sem fila.

**Ordem limitada: não modelada.** Exigiria:

- probabilidade de execução no preço limite
- **posição na fila** — não observável no MT5
- **seleção adversa** — quem executa sua limite costuma ser quem tem informação contrária

Sem esses três, um backtest de ordem limitada é ficção.
