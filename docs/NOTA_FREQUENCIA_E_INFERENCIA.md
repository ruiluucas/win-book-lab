# Nota técnica — discrepância de frequência e método de inferência

**Data:** 13/11/2026 · **Commit:** `acf9c47`
**Resposta às 4 perguntas do dono antes de congelar a especificação.**

---

## 1. A discrepância 4,24 Hz × 8,5 Hz — **resolvida, e é mais grave do que parecia**

**Você estava certo: são frequências diferentes.** Mas a diferença não é entre "consulta" e
"persistência" — é **entre versões do coletor ao longo do mesmo dia**.

Medição por bloco de 10 minutos (tabela `book`, 13/11):

| bloco | snapshots | dt mediano | **frequência** |
|---|---:|---:|---:|
| 09:20–09:40 | 3.175–3.393 | 174 ms | **5,75 Hz** |
| **09:50–10:40** | 2.475–2.485 | **237 ms** | **4,22 Hz** ← **a janela da análise** |
| 10:50–12:50 | 4.300–5.200 | 98–106 ms | **9,4–10,2 Hz** |

**A janela que gerou o resultado documentado (09:20–10:40) foi coletada a 4,22 Hz.**
O 8,5 Hz que eu reportei é do v5, que **começou às 10:46** — depois da janela analisada.

**Identificação das fases:**

| horário | frequência | coletor provável |
|---|---|---|
| 09:20–09:40 | 5,75 Hz | v3/v4 |
| 09:50–10:40 | 4,22 Hz | v4 |
| 10:46 em diante | 9,4–10,2 Hz | **v5** |

Os gaps confirmam as trocas: 10:46:41 (12,9 s), 10:49:41 (28,2 s), 10:52:43 (14,9 s),
11:14:14 (22,0 s) — reinícios de coletor.

### Consequência para o Adendo 01

O adendo justificou a janela de 1 s dizendo "250 ms = ~2 observações". **Isso estava errado
para a janela real.**

| janela | com 8,5 Hz (o que eu disse) | **com 4,22 Hz (o que os dados têm)** |
|---|---:|---:|
| 250 ms | ~2 obs | **~1,05 obs** |
| 1 s | ~8,5 obs | **~4,2 obs** |

**A conclusão do adendo continua válida** (1 s > 250 ms), mas por razão mais forte: com
4,22 Hz, a janela de 250 ms tem **1 observação** — não duas. O adendo foi corrigido.

### As cinco frequências que você pediu

| # | o que é | valor | fonte |
|---|---|---|---|
| 1 | consulta ao MT5 | loop com `time.sleep(0.001)` | `coleta_v5.py:94,112` |
| 2 | recebimento de atualizações | não medido — depende da latência RPyC (86,5 ms/ciclo no v2) | — |
| 3 | **persistência no banco** | **4,22 Hz na janela / 9,4 Hz no v5** | tabela `book` |
| 4 | distribuição dos intervalos | **bimodal: 175 ms e 237 ms** | abaixo |
| 5 | atraso residual | mediano **110,4 ms** | calculado |

**A distribuição é bimodal, não contínua:**

| faixa | % |
|---|---:|
| 150–175 ms | 22,1% |
| 175–200 ms | 17,7% |
| **225–250 ms** | **56,2%** |
| 200–225 ms | 0,4% ← **o vale** |

**É por isso que o atraso mediano é 110,4 ms e não 118 ms** (metade de 237). O atraso cai no
vale entre os dois picos. Não é erro — é característica da distribuição.

---

## 2. IC95% e p-valor — método exato

| item | valor |
|---|---|
| teste | **t de Student para uma amostra** (`scipy.stats.ttest_1samp`) |
| **hipótese nula** | média dos retornos líquidos = 0 |
| **hipótese alternativa** | média ≠ 0 (**bicaudal**) |
| n | 26 |
| média | **+8,077 pts** |
| desvio padrão | **103,994 pts** |
| erro padrão | sd/√n = **20,395** |
| t | 8,077 / 20,395 = **0,396** |
| graus de liberdade | 25 |
| **IC95%** | 8,077 ± 2,060 × 20,395 = **[−33,9, +50,1]** |
| **p-valor** | **0,695** |

### O que este método NÃO faz — e você apontou certo

| limitação | consequência |
|---|---|
| **unidade de reamostragem = operação** | 26 operações da **mesma sessão** tratadas como independentes |
| n_sessoes = 1 | **não há como estimar variância entre sessões** |
| sem bootstrap | não há reamostragem por bloco |
| sem correção de autocorrelação | operações próximas compartilham regime |
| pareado | sim — mesma entrada, saída em t+h |

**Com n_sessoes = 1, o IC95% [−33,9, +50,1] é otimista: a largura real, considerando
variabilidade entre sessões, seria maior.** O intervalo verdadeiro é ainda mais largo — e
já contém zero.

**Não vou ajustar o erro-padrão para parecer mais rigoroso.** O número correto é: *uma
sessão não permite inferência sobre generalização*. Ponto.

---

## 3. `max_atraso` — regra proposta, congelada antes de novo teste

Aceito sua proposta, com o nominal resolvido pela frequência **da janela efetiva**:

| item | regra |
|---|---|
| **nominal** | mediana do dt **da própria janela** (não de outra) |
| **limite primário** | **2 × nominal** |
| observações acima | **descartadas do teste primário**, contadas e reportadas |
| **sensibilidade** | repetir com 1×, 2× e 5× |
| congelamento | regra fixada **antes** de qualquer teste econômico novo |

**Aplicação à janela de 13/11:** nominal 236 ms → limite **472 ms**. Observações afetadas
acima de 472 ms: **13 de 22.227 (0,06%)** — inclui os 2 gaps longos.

**Aviso:** quando a próxima coleta rodar no v5 a ~9,4 Hz, o nominal cai para ~106 ms e o
limite para **212 ms**. A regra se ajusta sozinha, porque usa o nominal **medido na janela**.

---

## 4. OFI — não autorizado, e concordo

Sua distinção é a correta e resolve o problema de identificabilidade:

| tipo | o que exige | viável aqui? |
|---|---|---|
| **Event OFI** | sequência completa de eventos (add/cancel/execução por nível) | **NÃO** — o snapshot não captura eventos intermediários; eles podem se cancelar |
| **Sampled OFI** | diferenças entre snapshots observados, sem alegar completude | **SIM** — mas com 4,22 Hz a janela de 250 ms tem 1 obs |

**Com 5 níveis e 4,22 Hz, o "OFI clássico" do paper não é reconstruível.** O que é
reconstruível é o **sampled OFI** — e ele precisa ser nomeado assim, sem alegar que
reproduz Cont-Kukanov-Stoikov.

**A especificação precisa responder antes de código:**

| pergunta | por que importa |
|---|---|
| qual variável exata? | sampled OFI no nível 0 ou nos 5 níveis? |
| qual horizonte? | 3 min foi o único medido |
| qual sinal esperado? | OFI positivo → mid sobe? |
| qual teste? | Spearman unicaudal, α=0,05 |
| com qual janela? | 1 s com 4,22 Hz = 4 observações |

**Sem essas cinco respostas, implementar OFI é marcar tarefa, não testar hipótese.**

---

## Resumo das respostas

| # | pergunta | resposta |
|---|---|---|
| 1 | 4,24 × 8,5 Hz | **4,22 Hz na janela analisada (v4); 9,4 Hz no v5 — coletores diferentes** |
| 2 | atraso 110 × 118 ms | distribuição **bimodal** (175 e 237 ms); o atraso cai no vale |
| 3 | método do IC | t de Student bicaudal, unidade = **operação**, 26 obs de **1 sessão** |
| 4 | `max_atraso` | **2 × nominal medido na janela**; sensibilidade 1×/2×/5× |

**O que fica:** a inferência de C3 continua inconclusiva, e agora sei exatamente por quê —
não é só `n=26`, é `n_sessoes=1` com unidade de reamostragem errada. Corrigir isso exige
coleta, não estatística.

