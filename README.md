# WIN Book Lab — captura e análise de microestrutura do mini-índice B3

Captura **tick a tick** do book de ofertas do WIN (mini-índice da B3) via MetaTrader 5,
com **delta por nível**, e mede se isso tem poder preditivo.

**Status em 13/11/2026:** infraestrutura **em validação**. Nenhum edge demonstrado.

> A amostra de 80 min coletada neste dia é **exploratória e está queimada** — não será
> reutilizada como confirmação. O protocolo de confirmação está em
> [`docs/PROTOCOLO.md`](docs/PROTOCOLO.md) e foi congelado **antes** de olhar dados novos.

A taxa de captura de 100% que constava aqui **não foi verificada** de forma independente:
foi medida com o mesmo polling que se queria validar (circular). O verificado é que o
coletor grava ~8,3 snapshots/s em mercado calmo, sem duplicatas e com 10 linhas por
snapshot.

> Este repositório foi escrito para ser **auditado**. A seção
> [O que auditar](#o-que-auditar) lista as afirmações que precisam de verificação
> independente, e a seção [Limitações](#limitações-conhecidas) lista o que este trabalho
> **não** prova.

---

## 1. O problema

Trader individual na B3, WIN futuro, 1 contrato, custo de **R$ 0,50 por round trip**
(RLP ativo na BTG). Stop operacional de 180 pts = R$ 36. Capital R$ 800.

O custo em pontos é **7,5 pts**: 5 de spread (comprar no ask, vender no bid) mais 2,5
de corretagem (R$ 0,50 ÷ R$ 0,20/pt). A pergunta que importa não é "o preço vai subir?", é:

> **existe algum conjunto de operações onde o movimento esperado cobre custo + prêmio de risco?**

Isso é diferente de prever direção. É **selecionar** operações. A literatura chama de
*meta-labeling* (López de Prado, 2018, cap. 3).

## 2. Por que book e não fita

"Fita" (*tape*) é o registro de negócios fechados: preço, volume, hora.
"Book" é a fila de ordens em aberto: quem quer comprar/vender e a quanto.

| | fita | book |
|---|---|---|
| o que é | negócios **fechados** | ordens **paradas** |
| diz | "negociou 5 a 174.000" | "227 querem vender a 174.010" |
| no MT5 | `copy_ticks_*`, `symbol_info_tick` | `market_book_get` |

**Sirignano & Cont (2019)** mostram que as features com poder preditivo em dados de tick
são de **book** — profundidade e desequilíbrio. Features derivadas de fita (velocidade,
spread) são mais fracas. Este projeto parte dessa premissa.

## 3. Arquitetura

```
MT5 (BTG)  →  ponte RPyC :18812  →  coletor (2 threads)  →  TimescaleDB :5434
Lutris/Proton         mt5server.exe     Python/asyncio        PostgreSQL 16
```

### Componentes

| peça | arquivo | papel |
|---|---|---|
| schema do banco | `sql/schema_v2.sql` | 3 hypertables: `tick`, `book`, `book_delta` |
| coletor | `scripts/coleta_v4.py` | 2 threads + 2 conexões RPyC |
| analisador | `scripts/analisa_book_db.py` | correlação, acerto, P&L com Newey-West |
| régua estrita | `scripts/book_estrito.py` | só observações **não sobrepostas** |
| didático | `scripts/explica.py` | abre o capô: dado cru → cálculo → decisão → resultado |

### Por que duas threads

Medido: `symbol_info_tick` leva **41 ms** e `market_book_get` leva **48 ms** pela ponte.
Na mesma thread, um ciclo completo são 89 ms → 11 ciclos/s. Com `sleep` cai para 6/s.
Mas o book muda **8,8 vezes/s** — ou seja, 30% das atualizações eram perdidas.

Com duas conexões RPyC independentes, cada uma faz a sua chamada em paralelo:

| versão | snapshots/s | % do teto |
|---|---:|---:|
| v2 (uma thread) | 4,13 | 47% |
| **v4 (duas threads)** | **8,0–9,1** | **91–100%** |

## 4. O dado

### Tabelas

**`book`** — snapshot completo, 10 linhas por instante (5 níveis × 2 lados):

| coluna | tipo | significado |
|---|---|---|
| `ts` | timestamptz | hora do **servidor** (BRT, GMT-3) |
| `symbol` | text | sempre `WINZ26` (guard: só aceita `WIN*`) |
| `lado` | smallint | 1 = SELL (ask), 2 = BUY (bid) |
| `nivel` | smallint | 0 = melhor preço do lado |
| `preco` | float | |
| `volume` | float | contratos parados no nível |

**`book_delta`** — só o que mudou desde o snapshot anterior:

| coluna | significado |
|---|---|
| `vol_antes` / `vol_agora` | volume no nível antes e depois |
| `delta` | `vol_agora - vol_antes` (positivo = ordem entrou) |
| `evento` | `novo` · `saiu` · `add` · `cancel` |

**`tick`** — a fita: `ts, symbol, time_msc, bid, ask, last, volume`

### Volume medido

Mercado calmo (WINZ26, 13/11/2026):

| fluxo | taxa | projeção 9 h |
|---|---:|---:|
| snapshots do book | 8,0–9,1 /s | ~1,8 M snapshots |
| linhas de `book` | ~90 /s | ~2,5 M linhas/dia |
| linhas de `book_delta` | ~57 /s | ~1,8 M linhas/dia |
| ticks | 10–12 /s | ~350 mil/dia |

**Compressão medida:** `book` 104,8 → **7,6 bytes/linha** (92,7% de redução);
`tick` 191,0 → **16,2 bytes/linha** (91,4%).
Projeção consolidada: **~4 GB/ano** comprimido.

## 5. Metodologia de medição

### A régua de honestidade

O erro mais fácil de cometer aqui: tratar observações sobrepostas como independentes.

Se o horizonte é 3 min e a coleta é a cada 175 ms, cada evento de 3 min contém
**1.030 snapshots sobrepostos**. Usar todos infla o t-stat artificialmente.

**Exemplo real deste projeto:**

| método | acerto | t | p | veredito |
|---|---:|---:|---:|---|
| todas as obs + Newey-West | 54,9% | 4,01 | 0,0001 | "edge!" ❌ |
| **só obs independentes (n=26)** | **50,0%** | **0,03** | **0,98** | **ruído** ✅ |

**O motivo técnico:** HAC (Newey-West) só é válido com largura de banda **≥ o
comprimento da sobreposição em observações** — ~1.030 para h=3 min a 175 ms. Com
n = 20 mil isso é inviável, e o lag padrão **subestima** o erro-padrão.

Régua primária: **amostragem sem sobreposição**. Complementos: sub-amostragem com vários
offsets (reportando média e dispersão entre eles), bootstrap em blocos e erro-padrão por
**cluster de sessão**.

### Poder estatístico

Detectar acerto de 55% contra 50% (teste bicaudal, p<0,05, poder 80%) exige
**~800 eventos independentes**.

| horizonte | eventos por sessão de 9 h | sessões necessárias |
|---|---:|---:|
| 1 min | 540 | **~1,5** |
| 3 min | 180 | **~4,5** |
| 5 min | 108 | ~7,5 |

`book_estrito.py` imprime esse número em toda execução para não deixar esquecer.

## 6. Resultados até agora

**Nada conclusivo. A amostra é de uma sessão parcial e está queimada.**

### OBI nas observações independentes (80 min)

`OBI_5 = (vol_BUY − vol_SELL)/(vol_BUY + vol_SELL)`, 5 níveis por lado.

| h | n indep | acerto | pts/op | p | veredito |
|---|---:|---:|---:|---:|---|
| 1 min | 80 | 42,5% | −0,3 | 0,96 | ruído |
| 2 min | 40 | 47,5% | −7,8 | 0,56 | ruído |
| 3 min | 26 | 50,0% | +0,6 | 0,98 | ruído |
| 5 min | 16 | 62,5% | +50,6 | 0,14 | ruído |

Com as observações sobrepostas o mesmo dado dava acerto 54,9% e t=4,01 — **artefato**.

### Delta do book — números CORRIGIDOS (P0.1 e P0.2)

A versão anterior deste README dizia "~97% churn" e "só 1% empurra o preço". **Ambos
eram artefato de chavear o delta por nível em vez de por preço** — quando o melhor preço
desliza 1 tick, os 5 níveis trocam de preço e o delta compara coisas diferentes.

| métrica | antes (por nível) | **agora (por preço)** |
|---|---|---|
| churn | "~97%" | **25% da movimentação** |
| disso, execução | não medido | **1,7%** |
| disso, cancelamento | "~97%" | **98,3%** |
| "só 1% empurra o preço" | publicado | **removido** — não sustentado |

**O que os 25% significam:** os outros 75% da "movimentação" são preço entrando e saindo
da janela de 5 níveis do MT5 — **não é ordem, é limitação de amostragem**.

**Prova de que o delta está correto:** `scripts/testa_ida_volta.py` → **1248/1248**
snapshots reconstruídos exatamente.

### Lado agressor — inferido, não observado

`copy_ticks_from` retorna **0** em qualquer janela (1, 5, 15, 60 min), com
`COPY_TICKS_ALL` e `COPY_TICKS_TRADE`. **Não há flags de agressor nesta conta.**
O `lado_inferido` usa a regra do tick: 85.196 contratos de comprador agressor contra
84.786 de vendedor, e **1,8% indefinidos** (negócio no meio do spread).

### Limitações do MT5/BTG (medidas)

| item | resultado |
|---|---|
| `ticks_bookdepth` do WIN | **5 níveis por lado** — teto do servidor |
| ordem dos preços | vem com o **pior preço primeiro** (melhor bid = `max`, melhor ask = `min`) |
| `market_book_get` após `market_book_add` | **0 entradas** por ~1 s |
| tipos no book | só 1 (SELL) e 2 (BUY); 3 e 4 não aparecem |
| **tick histórico** | **não existe** — `copy_ticks_*` = 0, `last_error = Success` |
| `time` do MT5 | hora do **servidor** (BRT), não UTC |
| latência da ponte | **6 ms** medidos no v5 (era 45 ms) |

## 7. O que auditar

Afirmações que um auditor independente deve verificar:

1. **`copy_ticks_range` retorna 0 em todos os símbolos.** Isso significa que não há
   histórico de tick na conta BTG. Se estiver errado, o projeto inteiro muda de escopo.
   Teste: `mt5.copy_ticks_range("WINZ26", datetime.now()-timedelta(hours=2), datetime.now(), mt5.COPY_TICKS_ALL)`.

2. **O book vem ordenado com o pior preço primeiro.** Se invertido, o spread calculado
   sai 25 pts em vez de 5. Teste: imprimir `market_book_get` e comparar com `symbol_info_tick`.

3. **8,8 mudanças/s é o teto real do book**, não uma limitação do meu polling.
   Teste com polling de 20 ms e contar quantas vezes o snapshot muda.

4. **A amostra de 80 min não permite conclusão.** Verificar se os números da seção 6
   se reproduzem com `scripts/book_estrito.py`.

5. **O delta está conceitualmente correto.** `vol_agora - vol_antes` por nível; `add` quando
   positivo, `cancel` quando negativo, `novo`/`saiu` quando o nível aparece/some.

6. **Newey-West não corrige sobreposição massiva.** Este é o ponto metodológico mais
   importante. Ver a tabela da seção 5.

## 8. Limitações conhecidas

- **Amostra de 1 sessão.** Nenhum resultado deste repositório é conclusivo.
- **5 níveis.** Não há book completo para o WIN na BTG retail. Para mais profundidade
  seria preciso feed CAM/L2 da B3.
- **Um ativo.** Só WIN, um contrato por vez. Sem cross-section, sem fator neutro.
- **Sem fila (queue position).** O book diz o volume, não a posição na fila. Iceberg e
  ordem escondida são invisíveis.
- **Latência.** A ponte RPyC tem ~45 ms por chamada. Book "instantâneo" não existe aqui.
- **Custo de 5 pts é uma premissa.** Se o slippage real for maior, todo P&L piora.
- **Nenhum modelo foi treinado ainda.** A seção 6 é medição de sinal, não de estratégia.

## 9. Como reproduzir

### Pré-requisitos

- MT5 da BTG rodando (via Lutris + Proton 10+ — **Wine 8 é rejeitado pelo build 6230**)
- `~/Projetos/mt5-bridge/start_server.sh 18812` (ponte RPyC)
- Docker com `timescale/timescaledb:latest-pg16`

### Subir

```bash
# 1. banco
docker run -d --name mercado-db \
  -e POSTGRES_PASSWORD=SENHA -e POSTGRES_DB=mercado \
  -p 127.0.0.1:5434:5432 \
  -v /caminho/mercado-db:/var/lib/postgresql/data \
  --shm-size=1g --restart unless-stopped \
  timescale/timescaledb:latest-pg16

# 2. schema (o CREATE EXTENSION é obrigatório — sem ele falha em silêncio)
psql -h 127.0.0.1 -p 5434 -U postgres -d mercado -f sql/schema_v2.sql

# 3. coleta
python scripts/coleta_v4.py --simbolo WINZ26 --flush-seg 10

# 4. análise
python scripts/analisa_book_db.py
python scripts/book_estrito.py     # a régua honesta
```

### Dependências

```
rpyc psycopg2-binary pandas numpy scipy
```

## 10. Referências

> **Status de verificação:** as referências marcadas **(não confirmado)** vieram de uma
> coleta automatizada e **não foram validadas independentemente** por DOI/veículo/páginas.
> Os números atribuídos a elas foram **removidos deste README** até verificação.
> Auditar em `docs/REFERENCIAS_AUDITORIA.md`.

**Confirmadas (DOI/veículo/páginas checados):**

- **López de Prado, M. (2018).** *Advances in Financial Machine Learning.* Wiley.
  ISBN 9781119482086. Cap. 3 (triple-barrier), cap. 4 (sample weights / overlapping
  outcomes), cap. 7 (purged K-fold com embargo), cap. 12 (CPCV).
- **Sirignano, J. & Cont, R. (2019).** "Universal features of price formation in
  financial markets." *Quantitative Finance* 19(9):1449–1459.
  DOI [10.1080/14697688.2019.1571683](https://doi.org/10.1080/14697688.2019.1571683) · arXiv:1803.06917.
  → features de **book** (profundidade, desequilíbrio) carregam informação sobre o
  próximo movimento; o estudo usa book de ações (NASDAQ). **Não afirma** que features
  de fita são mais fracas — essa extrapolação foi removida.
- **Ait-Sahalia, Mykland & Zhang (2005).** "How Often to Sample a Continuous-Time Process
  in the Presence of Market Microstructure Noise." *RFS* 18(2):351–416.
  → a frequência ótima de amostragem para **estimar volatilidade** pode ser finita sob
  ruído de microestrutura. **É sobre estimação de volatilidade, não sobre previsão
  direcional** — a extensão "amostrar mais fino piora o SNR de previsão" é minha, não
  deles, e foi removida do README.
- **Cont, Kukanov & Stoikov (2014).** "The Price Impact of Order Book Events."
  *Journal of Financial Econometrics* 12(1):47–88.
  → define o **OFI** (order flow imbalance), a feature primária do protocolo.

**Não confirmadas — números removidos:**

- *Baldo, Morais & Silva (2026), ENEGEP/ABEPRO* — usada antes como "ROC 0,50–0,65 no WIN".
  **Não confirmado.**
- *Grądzki, Wójcik & Lessmann (2025), Financial Innovation* — **não confirmado.**
- *Kili et al. (2025), Applied Sciences* — **não confirmado.**
- *Bhand & Joshi (2026), Research Square* — **não confirmado**; se existir, é **preprint
  sem revisão por pares**.
- *Gu, Kelly & Xiu (2020), RFS* — referência real, mas o R²_oos de 0,34–0,40% é de
  **retornos mensais em cross-section de ações**, **não** um "teto realista" para tick
  intradiário de um futuro. **Removido como teto.**

## 11. Estrutura do repositório

```
├── README.md                  este arquivo
├── sql/
│   └── schema_v2.sql          hypertables tick, book, book_delta + compressão + retenção
├── scripts/
│   ├── coleta_v4.py           coletor: 2 threads, 2 conexões RPyC, delta
│   ├── analisa_book_db.py     correlação/acerto/P&L por horizonte
│   ├── book_estrito.py        régua honesta: só obs independentes
│   └── explica.py             didático: dado cru → cálculo → decisão → resultado
└── docs/
    └── INFRAESTRUTURA.md      detalhes de operação e armadilhas
```

## Licença

Uso pessoal. Sem garantia. Isto não é recomendação de investimento.
