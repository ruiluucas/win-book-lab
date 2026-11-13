# Relatório de ajustes — revisão externa de 13/11/2026

Ordem de execução: **P0 → P1.1, P1.2, P1.3 → resto**.
Cada item traz status, evidência (comando) e — onde aplicável — número **antes/depois**.

| tarefa | status | evidência |
|---|---|---|
| **P0.1** delta por preço | **FEITO** | `scripts/testa_ida_volta.py` → 1248/1248 reconstruídos |
| **P0.2** execução vs cancelamento | **FEITO** | `scripts/delta_p02b.py` → sanidade OK |
| **P0.3** flags / lado agressor | **PARCIAL** | flags impossíveis; inferência implementada |
| **P0.4** timestamps | **PARCIAL** | `t_recv_ns` + latência gravadas; offset servidor−local não |
| **P0.5** invariantes | **FEITO** | `scripts/verifica_integridade.py` |
| **P0.6** dados suspeitos | **FEITO** | ver §P0.6 |
| **P0.7** schema inteiros | **FEITO** | `preco`/`volume` integer no banco |
| P1.1 cabeçalho "100%" | FEITO | README corrigido |
| P1.2 redação Newey-West | FEITO | README §5 reescrito |
| P1.3 pré-registro | FEITO | `docs/PROTOCOLO.md` |
| P1.4 poder em P&L | FEITO | README §5 |
| P1.5 custo 7,5 pts | FEITO | README §5 |
| P1.6 decaimento em segundos | **NÃO FEITO** | requer mais dados |
| P1.7 features/ML | **NÃO FEITO** | bloqueado por P1.6 |
| P1.8 "meta-labeling" | FEITO | termo removido |
| P2.x | PARCIAL | ver §Pendências |

---

## P0.1 — delta chaveado por nível → por preço

**O bug, provado com dois snapshots reais de 13/11:**

| | por nível (antes) | por preço (depois) |
|---|---|---|
| BID nível 0 | delta **−1** | (preço mudou) |
| BID nível 1 | delta **+17** | BID 174.235: `vol_up` **+187** |
| ASK nível 0 | delta **+111** | ASK 174.240: `saiu_janela` **−137** |

Quando o melhor preço desliza 1 tick, **os 10 níveis geram delta falso**. O churn
publicado antes era, em boa parte, artefato disso.

**Prova de correção — teste de ida e volta:**

```
IDA E VOLTA: 1248/1248 snapshots reconstruidos exatamente
```

Aplicar `book_delta_v2` ao snapshot *t* reproduz o snapshot *t+1* em **100%** dos
1.248 pares testados. Se o chaveamento estivesse errado, isso seria impossível.

**Eventos redefinidos:**
`entrou_janela` · `saiu_janela` · `vol_up` · `vol_down`

## P0.2 — "cancel" não é cancel

**Três tentativas, dois erros meus no caminho:**

| versão | resultado | erro |
|---|---|---|
| v1 | execução 97,3% | aplicava `min(\|delta\|, negociado)` a CADA evento — inflava pelo número de eventos |
| v2 | execução 200% do negociado | atribuía o mesmo volume aos dois lados — contava 2× |
| **v3** | **execução 3,1%** | sanidade **OK**: 169.031 ≤ 169.064 |

**Números antes/depois:**

| métrica | README antigo | **correto** |
|---|---|---|
| churn | "~97%" | **25% da movimentação** |
| execução dentro do churn | não medido | **1,7%** |
| cancelamento | "~97%" | **98,3% do churn** |
| frase "só 1% empurra o preço" | publicada | **removida** (não sustentada) |

**O que os 25% significam:** 75% da "movimentação" do book é **preço entrando e saindo
da janela de 5 níveis** — não é ordem, é limitação de amostragem do MT5.

**Limitação declarada:** polling a ~9 Hz **soma** eventos do mesmo intervalo. Os
números são **limite inferior** da atividade bruta.

## P0.3 — flags do agressor

**Testado e confirmado impossível:**

```
copy_ticks_from(WINZ26, agora-1min,  COPY_TICKS_ALL)   -> 0 ticks
copy_ticks_from(WINZ26, agora-60min, COPY_TICKS_ALL)   -> 0 ticks
copy_ticks_from(WINZ26, agora-1min,  COPY_TICKS_TRADE) -> 0 ticks
```

As constantes existem (`TICK_FLAG_BUY=32`, `SELL=64`, `LAST=8`, `VOLUME=16`) mas **não
há dado para consumir**. A conta BTG não guarda histórico de tick — nem do presente.

**Implementado:** `lado_inferido` por regra do tick (Lee-Ready):

```
last >= ask  -> +1 (comprador agressor, removeu do ASK)
last <= bid  -> -1 (vendedor agressor, removeu do BID)
no meio      ->  0 (indefinido)
```

**Resultado em 61.908 ticks:**

| classe | ticks | contratos |
|---|---:|---:|
| comprador agressor | 29.900 | 85.196 |
| vendedor agressor | 30.922 | 84.786 |
| **indefinido** | **1.086 (1,8%)** | 3.032 |

Equilíbrio quase perfeito — o que se espera de um mercado líquido.

## P0.4 — timestamps

**Implementado:** `t_recv_ns` (`time.time_ns()` em torno de cada chamada) e `thread_id`.

**Latência medida:** **6 ms** (mediana, v5) — caiu de 45 ms medidos antes. A ponte
responde mais rápido quando o MT5 está com o gráfico ativo.

**NÃO implementado:** offset `servidor − local` por sessão. O `time_msc` do tick é do
servidor; o `ts` do book é relógio local pós-latência. **A incerteza de alinhamento é
da ordem de ±meia latência (~3 ms)** e está declarada, não medida.

**Origem do carimbo "11:30"** da versão anterior: era a hora em que a conferência foi
digitada à mão no documento, não um timestamp gerado. Erro de processo — os números
devem sair de script, não de digitação.

## P0.5 — invariantes

`scripts/verifica_integridade.py` — sai com código ≠ 0 se falhar. Resultado na base de
13/11 (55.262 snapshots):

| # | verificação | resultado |
|---|---|---|
| 1 | 10 linhas por snapshot | **PASS** (55.262/55.262) |
| 2 | bid < ask | **PASS** (0 violações) |
| 3 | spread ≥ 5 e múltiplo de 5 | **PASS** (0) |
| 4 | preços na grade, volumes inteiros > 0 | **PASS** (0) |
| 5 | ts crescente | **PASS** |
| 6 | gaps ≤ 500 ms | **FAIL** — 98 gaps, maior 627 s |
| 7 | dentro de 09:00–18:30 BRT | **PASS** |
| 8 | sem snapshots duplicados | **FAIL** — 1.131 |
| 9 | ida e volta do delta | **PASS** (1248/1248) |

**Sobre 6 e 8:** ambos são do **coletor v2**, antes das correções.

| versão | duplicatas | snapshots |
|---|---:|---:|
| v2 (09:20–10:46) | **1.131 (4,6%)** | 24.709 |
| **v4/v5 (10:50+)** | **0** | 30.903 |

Os 98 gaps são **reinícios do coletor** (cada vez que eu matei e subi de novo). O maior
é de 10,4 min. **Não é falha do código, é falta de disciplina operacional** — o coletor
deve rodar contínuo.

## P0.6 — dados corrigidos com UPDATE

245 mil linhas receberam `ts + interval '3 hours'` para corrigir o bug de fuso
(`datetime.now()` naive → Postgres assumiu UTC).

**Verificado:** nenhuma linha fora de 09:00–18:30 BRT; nenhuma corrigida duas vezes
(2290 linhas órfãs num chunk comprimido foram identificadas e corrigidas separadamente).

**Decisão:** como o volume é pequeno e a coleta é barata, **a base anterior a 10:50 é
marcada como suspeita** e não entra em análise. Só o que passou em P0.5 é usado.

## P0.7 — schema

- `preco` e `volume` agora são **`integer`** nas tabelas `book`, `book_delta` e `book_delta_v2`
- `book_delta_v2` guarda o delta por preço com eventos explícitos
- `CREATE EXTENSION timescaledb` mantido no topo, com comentário do motivo
- `snapshot_id`: **não implementado** — o `ts` de precisão de microssegundo já é único
  e distingue snapshots; criar um id sequencial exigiria estado compartilhado entre
  threads e não trouxe benefício medido

---

## O que ficou NÃO VERIFICADO

1. **Flags reais de agressor** — impossível nesta conta (copy_ticks = 0).
2. **Offset servidor−local** por sessão — não medido, declarado como ±3 ms.
3. **Taxa real de mudança do book em rajadas.** A medição de 8,8/s foi feita em mercado
   calmo, com o mesmo polling que se quer validar. **É circular.** Em abertura e em
   notícia a taxa sobe e a perda pode ser maior.
4. **Referências bibliográficas.** Baldo et al. (2026), Kili et al. (2025), Grądzki et
   al. (2025) e Bhand & Joshi (2026) **não foram confirmadas independentemente** por mim
   — vieram de uma coleta automatizada. Os números atribuídos a elas foram **removidos
   do README** até verificação.
5. **Decaimento do sinal em segundos** (P1.6) — não medido; os horizontes testados
   (1–10 min) podem estar além do ponto onde o efeito morre.
6. **Custo real de 7,5 pts.** A premissa de 5 pts substituída por 7,5 (spread 5 +
   corretagem 2,5) é **teórica**, não medida em nota de corretagem desta série.
