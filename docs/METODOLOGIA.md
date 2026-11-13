# Metodologia

## 1. O erro que domina tudo: sobreposição

Se o horizonte é `h` e a coleta é a cada `Δ`, cada evento de `h` contém `h/Δ` leituras
do **mesmo** movimento. Com h=3 min e Δ=120 ms: **~1.500 leituras por evento**.

Tratar essas leituras como independentes encolhe artificialmente o erro-padrão e infla
o t-stat.

**Prova neste projeto, mesmos dados, 80 min:**

| método | n usado | acerto | t | p | veredito |
|---|---:|---:|---:|---:|---|
| todas as obs + Newey-West (lag=h) | 21.507 | 54,9% | 4,01 | 0,0001 | "edge!" ❌ |
| **só obs independentes** | **26** | **50,0%** | **0,03** | **0,98** | **ruído** ✅ |

**Por que Newey-West não salvou:** HAC é válido com largura de banda ≥ o comprimento da
sobreposição **em observações** (~1.500). Com n≈20 mil isso é inviável, e o lag padrão
subestima o erro-padrão.

## 2. Régua primária

**Amostragem sem sobreposição:** uma observação a cada `h` minutos, sem correção.

Complementos, quando houver amostra:

- **sub-amostragem com vários offsets**, reportando média e dispersão entre eles
- **bootstrap em blocos** (blocos do tamanho da sobreposição)
- **erro-padrão por cluster de sessão** — eventos da mesma sessão compartilham regime

## 3. Hipótese primária e Holm

**A hipótese primária é testada separadamente.** Ela **não** participa do Holm.

Motivo: Holm controla o erro tipo I **dentro de uma família** de comparações. A primária
é única, pré-registrada e não é uma escolha entre alternativas — incluí-la na família
confundiria o controle.

**As secundárias formam a família** e recebem Holm com α=0,05.

**Regra que impede auto-engano:** se a primária falhar, o resultado é **sem evidência**.
Uma secundária com p baixo **não substitui** a primária — no máximo vira hipótese para
uma amostra nova, declarada como tal.

## 4. Mínimo operacional ≠ tamanho necessário

| conceito | o que é |
|---|---|
| **mínimo operacional** | 20 sessões — abaixo disso nem se testa |
| **tamanho estatisticamente necessário** | calculado por `n ≈ (z_{α/2}+z_β)²·σ²/μ²` |

O "800 eventos" citado antes vale para **detectar 55% contra 50% de acerto**, não para
P&L. São réguas diferentes:

| régua | pergunta |
|---|---|
| taxa de acerto | o modelo acerta a direção mais que moeda? |
| **P&L líquido** | a média de pontos por operação é positiva após custo? |

**A segunda é a que decide.** Um acerto de 55% com payoff desfavorável perde dinheiro.

## 5. Autocorrelação e tamanho efetivo

Não basta contar eventos. O **tamanho efetivo da amostra** desconta:

- **autocorrelação** dos retornos (a série não é i.i.d.)
- **regime** — dias de tendência e de lateralização não são intercambiáveis
- **clusters** — volatilidade agrupada reduz o número de episódios independentes

**Reportar sempre o número de sessões, não só de eventos.** 100 eventos em 1 sessão não
valem 100 eventos.

## 6. Regimes a cobrir

Mínimo sugerido para 20 sessões:

- dias de **tendência** clara
- dias **laterais**
- dias com **evento macro agendado** (Copom, payroll, CPI americano)
- abertura e fechamento (não só meio do pregão)

## 7. Análise de estabilidade

Antes de qualquer conclusão, verificar se o efeito sobrevive a:

| dimensão | como medir |
|---|---|
| **horário** | por hora do pregão (a volatilidade varia 3× entre 10h e 17h) |
| **volatilidade** | split por volatilidade realizada da sessão |
| **spread** | split por spread mediano |
| **profundidade** | split por depth mediano |
| **regime** | tendência vs lateral (ex.: |retorno do dia| / range) |
| **sessão** | por dia e por semana — o efeito aparece toda semana? |

Efeito que só existe em um subconjunto **é hipótese, não achado**.

## 8. Exploração vs confirmação

A amostra de 13/11 (80 min) foi usada para **24 combinações** (6 horizontes × 4 limiares).
O melhor resultado foi destacado no relatório: 5 min, 62,5%, +50,6 pts/op.

**Isso é seleção sobre ruído e está queimado.** Com 24 olhadas, o melhor número aparece
por sorte mesmo sem sinal.

Sessões novas = **confirmatórias**. O protocolo é congelado com git tag **antes** de
olhar os dados.
