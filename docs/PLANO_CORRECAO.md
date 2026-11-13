# Plano de correção — por etapas, com critérios de aceitação

**Status: proposta. Nada foi executado.**
Derivado da auditoria de código de 13/11/2026.

**Regra que vale para todas as etapas:** nenhuma etapa começa antes da anterior passar
no critério de aceitação. Nenhuma altera hipótese, custo ou critério estatístico sem
decisão humana explícita registrada.

---

## Bloco 1 — Bloqueadores (nada é concluído antes destes)

### E1.1 — Janela temporal reproduzível · P0.3

**Problema:** `book_estrito.py` carrega o banco inteiro. Rodar hoje dá número diferente
de ontem. É a razão pela qual o resultado documentado (50,0%, p=0,977) não reproduz.

**Mudança proposta:**
- `--inicio` e `--fim` **obrigatórios** (formato ISO, timezone BRT)
- imprimir a janela, o `n` e o **hash do commit** em toda saída
- recusar rodar sem janela declarada

**Critério de aceitação:**
1. rodar com `--inicio "2026-11-13 09:20" --fim "2026-11-13 10:40"` reproduz
   **exatamente** n=26, 50,0%, p=0,977 em h=3
2. rodar sem parâmetros → exit code ≠ 0 com mensagem clara
3. rodar com o dia inteiro → n=63, 47,6%, p=0,368

**Teste:** `tests/test_janela.py` com fixture em CSV (sem banco), verificando que a
contagem de observações independentes bate com o esperado para 3 janelas conhecidas.

---

### E1.2 — Custo: decidir 5 ou 7,5 e aplicar · P0.2

**Problema:** documentação diz 7,5; código usa 5,0 nos três scripts.

**Decisão necessária (humana):** qual é o custo base?

| opção | valor | justificativa |
|---|---|---|
| A | **7,5** | spread 5 (medido) + corretagem 2,5 (de outra série) |
| B | 5,0 | só o spread; assume execução no mid, o que **não** ocorre em ordem a mercado |

**Recomendação:** opção A, com sensibilidade em 5 e 10.

**Mudança proposta:**
- `CUSTO` vira parâmetro único em módulo compartilhado, não constante repetida em 3 arquivos
- imprimir o custo usado no cabeçalho de **toda** tabela
- rodar em 5 / 7,5 / 10 e emitir as três

**Critério de aceitação:**
1. nenhuma tabela sai sem o custo no cabeçalho
2. os três cenários aparecem lado a lado
3. os resultados antigos ficam preservados em `docs/MEDICOES.md` marcados com o custo que usaram (5,0)

**Impacto já medido:** com 7,5, o h=3 passa de +0,6 para **−1,9 pts/op**. O sinal que
restava desaparece.

---

### E1.3 — Hipótese primária: implementar OFI ou redefinir · P0.1

**Problema:** `PROTOCOLO.md` declara `OFI_top_classic` como hipótese primária. **O código
não implementa OFI em nenhum lugar.**

**Duas saídas, e é uma decisão humana:**

| opção | o que implica |
|---|---|
| **A — implementar OFI** | seguir Cont, Kukanov & Stoikov (2014); exige resolver a mudança de preço nível a nível; janela ≥ 1 s dado o polling |
| **B — rebaixar OBI_5 a primária** | o que foi medido até hoje já é OBI_5; muda o protocolo, mas fica honesto com o que existe |

**Recomendação:** **opção A**, porque o OFI é a feature que a literatura aponta como
mais informativa, e o protocolo já foi congelado com ela. Mas se o prazo importar, B é
legítimo — desde que registrado como mudança de protocolo.

**Critério de aceitação (se A):**
1. `OFI_top_classic` implementado com teste contra exemplo numérico calculado à mão
2. teste com os 4 casos do paper: bid sobe, bid cai, bid igual com volume maior, bid igual com volume menor
3. `OFI_top_volume` implementado separadamente, e a diferença entre os dois documentada
4. nenhum uso de `OFI` sem que a janela seja ≥ 1 s declarada

**Teste:** `tests/test_ofi.py` com 8 snapshots sintéticos e resultado esperado escrito
no próprio teste.

---

### E1.4 — Holm nas secundárias · P0.4

**Problema:** documentado em `METODOLOGIA.md` e `PROTOCOLO.md`, ausente no código.

**Mudança proposta:**
- função `holm(pvals, alpha=0.05)` que devolve p ajustado e rejeições
- a **primária é testada separadamente** (α=0,05, sem correção) — como está documentado
- as 7 secundárias formam a família

**Critério de aceitação:**
1. teste com p-valores conhecidos: `[0.01, 0.02, 0.03, 0.04, 0.05]` → rejeições esperadas
   calculadas à mão
2. teste de borda: lista vazia, p fora de [0,1], p duplicados
3. a saída imprime quais hipóteses foram rejeitadas e o p ajustado de cada uma

**Teste:** `tests/test_holm.py`.

---

## Bloco 2 — Confiabilidade

### E2.1 — Schema para instalação limpa · P1.4
`sql/schema_v2.sql` tem `lado_inferido` e `t_recv_ns` comentados. Um banco criado do zero
**não aceita** o INSERT do v5.

**Aceitação:** criar banco novo a partir do schema, rodar o coletor por 60 s, `INSERT`
funciona sem `ALTER` manual.

### E2.2 — Testes independentes do banco · P1.3
Hoje o único teste é `verifica_integridade.py`, que exige Postgres rodando.

**Aceitação:** `pytest tests/` roda em máquina sem banco, sem MT5, com fixtures em CSV
versionadas (5 min de dados, ~500 KB).

### E2.3 — `scripts/poder.py` · P1.2
Citado no protocolo, não existe.

**Aceitação:** existe, recebe σ e μ, devolve n necessário pelas duas réguas (acerto e P&L),
com teste contra cálculo manual.

### E2.4 — Argumentos padronizados · P1.5
`analisa_book_db.py` tem `--dia`; `book_estrito.py` não tem nada.

**Aceitação:** todos os analisadores aceitam `--inicio`/`--fim` e `--custo`, com os
mesmos nomes.

### E2.5 — Reconexão do coletor · P2.1
O v5 faz `rollback`, não reconecta. Se o Postgres cair, os dados do buffer se perdem.

**Aceitação:** teste que derruba o container no meio da coleta; o coletor reconecta em
< 10 s sem perder o buffer acumulado.

### E2.6 — p-valor unicaudal · P1.1
Código usa bicaudal; protocolo diz unicaudal.

**Aceitação:** parâmetro explícito `--teste unilateral|bilateral`, default conforme o
protocolo, impresso no cabeçalho.

---

## Bloco 3 — Ressalva sobre a janela (registro, não correção)

> **Nota do dono (13/11):** criar um arquivo às 10:40 não prova execução naquele horário.
> A evidência abaixo é de **execução** (arquivo de saída do terminal), não de criação.

**Verificado com evidência de EXECUÇÃO, não de criação do arquivo:**

| evento | timestamp | fonte |
|---|---|---|
| coleta começou | 09:20:25 | `min(ts)` da tabela `book` |
| arquivo criado | 10:40:42.946 | `stat` ctime |
| **primeira execução** | **10:40:51.099** | **`~/.hermes/cache/rtk-transform/20261113-104051-terminal.txt`** |

A saída do terminal registra, no momento da execução:

```
snapshots: 22,395 | 80 min
h=3 → n_indep 26, 50.0%, +0.6 pts, p=0.977
```

**Isso prova três coisas:** o script rodou às 10:40:51; havia 22.395 snapshots (80 min)
naquele instante; o resultado publicado é exatamente o daquela execução.

O script rodou sobre **todo o banco existente**. A janela de 80 min **não foi escolhida**
— era o universo disponível. **Não houve seleção retrospectiva de janela.**

**O vício real é outro:** a coleta continuou até 12:51, mais que o dobro. Com os dados
adicionais, h=3 passou de **50,0% (p=0,977)** para **47,6% (p=0,368)**.

**Conclusão:** a amostra é **instável**, não viciada por escolha de janela. Isso é mais
grave do que seleção: significa que 26 observações não são base para nada, nem para dizer
"não há efeito".

**Ação:** a amostra de 13/11 fica marcada como **descartada para inferência** — nem
confirma nem nega. Serve apenas como piloto técnico do pipeline.

---

## Ordem de execução

```
E1.1 → E1.2 → (decisão: E1.3 A ou B) → E1.4
   ↓
E2.1 → E2.2 → E2.3 → E2.4 → E2.5 → E2.6
   ↓
só então: coleta das 20 sessões
```

**Nenhuma análise é publicada entre E1.1 e E1.4.** O pipeline está em obras.

## Decisões que exigem o dono antes de começar

| # | decisão | padrão recomendado |
|---|---|---|
| 1 | custo base: 5 ou **7,5**? | **7,5** |
| 2 | OFI implementado (A) ou OBI_5 como primária (B)? | **A** |
| 3 | janela mínima da feature: **1 s** ou outra? | **1 s** |
| 4 | a amostra de 13/11 entra em algum lugar? | **não** — só como piloto técnico |

## O que este plano NÃO faz

- não altera resultado publicado
- não recalibra parâmetro para melhorar número
- não executa nada automaticamente
- não muda hipótese, custo ou critério sem decisão registrada acima
