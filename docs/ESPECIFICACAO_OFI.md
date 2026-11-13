# Especificação do OFI — P0-4 (documento, NÃO implementação)

**Status:** proposta para congelamento. **Código não escrito.**
**Data:** 13/11/2026

---

## 0. Por que este documento existe

O protocolo declara `OFI_top_classic` como hipótese primária. **Não existe no código.**
Antes de escrever, é preciso responder: *a variável é identificável com os dados que temos?*

A resposta curta é **não para o Event OFI** e **sim para o Sampled OFI** — e isso muda o
protocolo. Este documento propõe a mudança formal.

---

## 1. O que o paper define vs o que os dados permitem

**Cont, Kukanov & Stoikov (2014)** definem OFI por **eventos** no melhor nível:

```
e_n =  I(P_bid >= P_bid_prev) * V_bid
     - I(P_bid <= P_bid_prev) * V_bid_prev
     - I(P_ask <= P_ask_prev) * V_ask
     + I(P_ask >= P_ask_prev) * V_ask_prev
```

Cada termo pressupõe **saber o que aconteceu entre dois estados**, não apenas os estados.

| requisito do paper | temos? |
|---|---|
| sequência completa de add/cancel/execução | **NÃO** — snapshot de 5 níveis, 4,22 Hz |
| identificação de execução vs cancelamento | **NÃO** — só Δvolume |
| profundidade além de 5 níveis | **NÃO** — `ticks_bookdepth = 5` |

**Consequência:** eventos intermediários que se cancelam no mesmo intervalo são
**invisíveis**. Um add de 100 e um cancel de 100 entre dois snapshots aparecem como zero.

---

## 2. Os dois OFIs — definição precisa

### `OFI_top_classic` — **NÃO IDENTIFICÁVEL** com esta fonte

Exige a sequência de eventos. Não é reconstruível por diferença de snapshots.

**Não será implementado.** Alegar que é o do paper seria falso.

### `OFI_top_sampled` — **IDENTIFICÁVEL**, com limitações declaradas

Calculado por **diferença entre snapshots consecutivos**, aplicando a fórmula de Cont et al.
aos estados observados:

```
ΔV_bid = V_bid(t) - V_bid(t-1)
ΔP_bid = P_bid(t) - P_bid(t-1)
ΔV_ask = V_ask(t) - V_ask(t-1)
ΔP_ask = P_ask(t) - P_ask_prev(t-1)

OFI_sampled =
    (ΔP_bid > 0) *  V_bid(t)
  - (ΔP_bid < 0) *  V_bid(t-1)
  - (ΔP_ask < 0) *  V_ask(t)
  + (ΔP_ask > 0) *  V_ask(t-1)

caso ΔP_bid == 0: termo = ΔV_bid
caso ΔP_ask == 0: termo = -ΔV_ask
```

**É uma adaptação, não uma reprodução.** Precisa ser nomeada assim em todo lugar.

---

## 3. As cinco respostas que faltavam

| pergunta | resposta proposta |
|---|---|
| **qual variável?** | `OFI_top_sampled` no melhor nível (nível 0), em contratos |
| **qual horizonte?** | **3 min** — mesmo do resultado histórico, para comparabilidade. Secundários: 1, 2, 5 min |
| **qual sinal esperado?** | OFI > 0 (pressão de compra) → mid sobe no horizonte. **Spearman unicaudal, ρ > 0** |
| **qual teste?** | Spearman unicaudal, α = 0,05, **primária fora da família Holm** |
| **qual janela?** | **1 s** (Adendo 01) — com 4,22 Hz = **~4 snapshots** por janela |

### Por que 1 s e não 250 ms

| janela | snapshots na janela (4,22 Hz) |
|---|---:|
| 250 ms | **1,05** |
| 1 s | **4,22** |

Com 250 ms, o OFI seria a diferença entre **dois** snapshots — ruído puro. Com 1 s, quatro.

---

## 4. Normalização — decisão que muda o resultado

OFI bruto escala com o volume, que varia por hora do dia. **Sem normalizar, o coeficiente
mede liquidez, não pressão.**

**Proposta:** `OFI_norm = OFI_sampled / (V_bid + V_ask)` — adimensional, comparável entre
horários.

**Teste de sensibilidade obrigatório:** rodar com e sem normalização. Se o sinal só existe
em uma das duas, é artefato de escala.

---

## 5. Amostragem e sobreposição

- 1 observação a cada **3 min** (sem sobreposição de rótulo)
- janela de cálculo de 1 s, **terminando no instante da decisão** (sem look-ahead)
- `max_atraso = 2 × nominal da janela` (regra de P0-2)
- mínimo **20 sessões** (protocolo)

---

## 6. Critério de falha — declarado ANTES

| resultado | veredito |
|---|---|
| ρ > 0, p < 0,05 unicaudal, ≥20 sessões, sobrevive a Holm nas secundárias | **sinal** |
| ρ > 0, p < 0,05, mas <20 sessões | **inconclusivo** — não é validação |
| p ≥ 0,05 | **sem sinal** — e reportar o IC, não só o p |
| sinal só com normalização, ou só em um horizonte | **artefato** — reportar como tal |

**Regra que não se dobra:** se o OFI falhar, **não se troca para OBI_5 porque rendeu mais**.
Isso seria seleção de hipótese pelo resultado.

---

## 7. O que ainda falta antes de implementar

| # | pendência | dono |
|---|---|---|
| 1 | confirmar `OFI_top_sampled` como hipótese primária (mudança formal no protocolo) | **Rui** |
| 2 | confirmar normalização por volume como padrão | **Rui** |
| 3 | 20 sessões de coleta | tempo |
| 4 | declarar que Event OFI é impossível com 5 níveis | já declarado aqui |

---

## 8. Resumo para decisão

| item | status |
|---|---|
| Event OFI (paper) | **impossível** — 5 níveis, 4,22 Hz |
| Sampled OFI | **possível**, adaptação declarada |
| hipótese primária atual | declara `OFI_top_classic` → **precisa mudar para `OFI_top_sampled`** |
| implementação | **não autorizada** até decisão sobre 1 e 2 acima |

**Trocar o nome no protocolo não é burocracia:** é reconhecer que o experimento mede algo
diferente do que foi pré-registrado. Melhor declarar agora do que depois do resultado.

