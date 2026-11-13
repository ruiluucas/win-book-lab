# Auditoria adversarial — resposta técnica

**Commit auditado:** `acf9c4754ce18730db910cdb8d4fae633f2b1bfd`
**Escopo:** verificação dos apontamentos externos, com tentativa de refutação prévia
**Alterações:** **nenhuma**. Código, banco, protocolo e resultados intactos.

---

## 1. Resumo executivo

Dos 6 blocos, **4 têm apontamentos confirmados**, 1 parcial e 1 falso positivo.

| bloco | veredito | achado mais grave |
|---|---|---|
| **A** temporalidade | **CONFIRMADO** | horizonte real é **~9% menor** que o anunciado |
| **B** microestrutura | **CONFIRMADO** | agressor é **inferência**, não observação |
| **C** custos | **CONFIRMADO** | doc 7,5 × código 5,0 |
| **D** engenharia | **CONFIRMADO** | **clone limpo: 11 de 14 testes falham** |
| **E** protocolo | **CONFIRMADO** | OFI e Holm não implementados |
| **F** ML | **CONFIRMADO** | nada implementado (era planejamento) |

**O achado mais grave não é metodológico, é de reprodutibilidade:** o repositório publicado
**não reproduz os próprios testes**. Falha minha, introduzida em E1.1.

---

## 2. Bloco A — Temporalidade e estatística

### A.1 — `shift(-h)` com `h` derivado do intervalo mediano · **CONFIRMADO**

**Código:** `book_estrito.py:52` → `h = max(1, int(mh * 60 / dt))`, onde
`dt = S.ts.diff().dt.total_seconds().median()`.

**Problema:** o coletor grava **só quando o book muda**. Os intervalos são irregulares.

**Medição (janela 09:20–10:40, 22.227 snapshots):**

| estatística | valor |
|---|---:|
| dt mediano | **236,0 ms** ← o que o código usa |
| dt médio | 214,8 ms |
| dt p05 | 172,8 ms |
| dt p95 | 243,7 ms |
| dt máximo | 12.922,5 ms |
| **coeficiente de variação** | **0,40** |

Como a distribuição é assimétrica à direita, **mediana > média**. O código divide pelo
valor maior, produzindo `h` menor que o necessário.

**Horizonte pretendido × realizado:**

| pretendido | linhas | **real médio** | p05 | p95 | erro |
|---|---:|---:|---:|---:|---:|
| 1 min | 254 | **0,91 min** | 0,74 | 1,03 | **−9,0%** |
| 2 min | 508 | **1,82 min** | 1,48 | 2,07 | **−9,0%** |
| 3 min | 762 | **2,72 min** | 2,23 | 3,11 | **−9,3%** |
| 5 min | 1271 | **4,54 min** | 3,72 | 5,17 | **−9,2%** |

**Erro sistemático e uniforme de ~9%.** Não é ruído: é viés de método.

### A.2 — O resultado muda? · **PARCIALMENTE CONFIRMADO**

Recalculei com horizonte **por tempo** (`searchsorted(t, t + mh*60)`), que é o correto:

| h | pts/op por LINHAS (código) | pts/op por TEMPO | diferença |
|---|---:|---:|---:|
| 1 min | +0,7 | **+3,0** | +2,3 |
| 2 min | −8,5 | **−4,2** | +4,3 |
| 3 min | +0,6 | **+8,1** | +7,5 |
| 5 min | +61,3 | **+70,3** | +9,0 |

**Os números mudam em todos os horizontes. A conclusão não inverte:** nenhum é
significativo no n justo (h=5 tempo dá p=0,015 mas com n=15 — não sobrevive a Holm).

**Veredito:** o apontamento está **certo sobre o erro** e **parcialmente certo sobre a
consequência**. O horizonte anunciado não é o horizonte medido; a conclusão de "sem
sinal" sobrevive.

### A.3 — Independência estatística × amostragem não sobreposta · **CONFIRMADO**

`amostra_independente()` garante que **os rótulos não se sobrepõem no tempo**. Isso é
necessário, **não suficiente**: dois pontos separados por exatamente h minutos podem
estar na mesma tendência de mercado e correlacionados.

**Não há teste de autocorrelação dos resíduos em nenhum script.** A afirmação
"observações independentes" no código é, na verdade, "observações não sobrepostas".

### A.4 — Gaps e reinícios · **CONFIRMADO (menor)**

2 gaps > 2 s em 22.226 intervalos:

| horário | gap |
|---|---|
| 09:21:17 | **12,9 s** |
| 10:15:50 | 2,3 s |

O de 12,9 s é compatível com reinício do coletor. **Não há tratamento** — o código
calcula `shift(-h)` através do gap como se fosse tempo contínuo.

### A.5 — Reproducibilidade matemática · **CONFIRMADO**

Os resultados **são** reproduzíveis a partir do commit + dados + janela declarada
(verificado: n=26, 50,0%, p=0,977). **Mas não representam o horizonte anunciado**, por A.1.

---

## 3. Bloco B — Microestrutura

### B.1 — Agressor é inferência, não observação · **CONFIRMADO**

**Código:** `coleta_v5.py:7` — comentário literal:
> `P0.3 captura flags e volume_real; lado_inferido por regra do tick (nao existe...)`

`lado_inferido` (`coleta_v5.py:96`):
```
1 if last >= ask else -1 if last <= bid else 0
```

**Isso é regra do tick, não Lee-Ready.** Lee-Ready exige comparação com o **mid**
anterior e desempate por tick rule. A implementação usa bid/ask **correntes**.

**Classificação:** inferência heurística. **Nenhum lugar do código a chama de observação.**

### B.2 — Lee-Ready real · **PARCIALMENTE CONFIRMADO**

`scripts/delta_p02b.py` **documenta** Lee-Ready no cabeçalho:
> "Sem flags de agressor, infiro pela regra do tick (Lee-Ready): se last >= ask..."

Mas a implementação usa `last >= ask` — que é a **quote rule**, não Lee-Ready completo
(falta o mid e o tick rule de desempate).

**É uma adaptação declarada, não uma reprodução do artigo.** O código é honesto quanto a
isso no docstring.

### B.3 — Execução versus cancelamento · **CONFIRMADO (bem feito)**

`delta_p02b.py` corrige dois erros anteriores, documentados no próprio arquivo:
- v1: aplicava `min(|delta|, negocio)` a **cada evento** → inflava (97,3% impossível)
- v2: atribuía o mesmo volume aos **dois lados** → contava 2×

A v3 atribui cada negócio ao **lado passivo atingido**. **O apontamento de que o "97% de
churn" era artefato está correto e já foi corrigido** — o README atual não publica esse
número.

### B.4 — OFI clássico × sampled OFI · **CONFIRMADO**

Nenhum dos dois está implementado. `grep -rn "ofi" scripts/` → **zero ocorrências**.

### B.5 — Microprice · **CONFIRMADO**

Não implementado. Nenhuma referência no código.

### B.6 — Perda de eventos entre polls · **CONFIRMADO**

O coletor v5 lê o book a ~8,5 Hz (118 ms). Mudanças entre leituras **não são vistas**.
Taxa em rajada **não medida** — declarado em `LIMITACOES.md`.

---

## 4. Bloco C — Execução e custos

### C.1 — Divergência documentação × código · **CONFIRMADO**

| fonte | valor |
|---|---|
| `docs/EXECUCAO.md:11` | **7,5 pts** |
| `scripts/analisa_book_db.py:21` | `CUSTO, PT_RS = 5.0, 0.20` |
| `scripts/book_estrito.py:16` | `CUSTO = 5.0` |
| `scripts/explica.py:7` | `CUSTO, PT_RS = 5.0, 0.20` |

**Três scripts usam 5,0; a documentação afirma 7,5.** Nenhum resultado publicado aplica
o custo que a documentação declara ser o base.

### C.2 — Mid-to-mid × executável · **CONFIRMADO**

`book_estrito.py:54`:
```python
pts = (fut[ii] - S.mid.values[ii]) * np.sign(S.obi5.values[ii]) - CUSTO
```

**Entrada e saída no mid.** Um operador não compra no mid — compra no ask. O custo de 5 pts
é uma **aproximação do spread**, não uma simulação de execução.

**Não há modelagem de:** fila, slippage, latência, preenchimento parcial.

### C.3 — Resultados representam estratégia executável? · **NÃO**

**Nenhum resultado do repositório representa uma estratégia executável.** O que existe é
uma **medição de informação** (o OBI contém informação sobre o mid futuro?), não um backtest.

**Isso não é defeito** — está declarado em `LIMITACOES.md`. O defeito é a documentação não
deixar isso óbvio na primeira leitura.

---

## 5. Bloco D — Engenharia e reprodutibilidade

### D.1 — Fixtures não versionadas · **CONFIRMADO · achado mais grave**

```
$ git check-ignore -v tests/fixtures/book_20min.csv
.gitignore:6:*.csv    tests/fixtures/book_20min.csv
```

**O `.gitignore` tem `*.csv`** e excluiu as fixtures do commit.

### D.2 — `pytest` em clone limpo · **CONFIRMADO**

```
$ git clone ~/Projetos/win-book-lab /tmp/wbl_clone && pytest tests/
11 failed, 3 passed
```

| ambiente | resultado |
|---|---|
| meu workspace | **14 passed** |
| **clone limpo** | **11 failed, 3 passed** |

**O repositório publicado não reproduz os próprios testes.** Eu declarei "14 passed, sem
banco" e isso só era verdade na minha máquina, com arquivos que nunca foram commitados.

**É exatamente o problema que E1.1 deveria resolver, reintroduzido por descuido.**

### D.3 — `schema_v2.sql` × `coleta_v5.py` · **CONFIRMADO**

`coleta_v5.py:131` faz INSERT em `lado_inferido` e `t_recv_ns`.
`sql/schema_v2.sql` **não declara as colunas** (estão comentadas; funcionam aqui porque
rodei `ALTER TABLE` manual).

**Um banco criado do zero a partir do schema não aceitaria o INSERT.** O coletor tem um
fallback (`:134`, sem `t_recv_ns`), mas não sem `lado_inferido`.

### D.4 — Tratamento de falhas no PostgreSQL · **CONFIRMADO**

`coleta_v5.py:147-150` faz `rollback`, **não reconecta**. Se o Postgres cair, o buffer
acumulado se perde na próxima exceção.

### D.5 — `coleta_log` · **CONFIRMADO**

A tabela está no schema. **Nenhum script faz INSERT nela.** É infraestrutura morta.

---

## 6. Bloco E — Protocolo científico

| item do protocolo | implementado? | veredito |
|---|---|---|
| OFI como hipótese primária | **não** | **CONFIRMADO** |
| Holm nas secundárias | **não** | **CONFIRMADO** |
| `scripts/poder.py` | **não existe** | **CONFIRMADO** |
| teste unicaudal | não — código usa bicaudal | **CONFIRMADO** |
| α = 0,05 | sim | confirmado |
| amostragem sem sobreposição | sim | confirmado |
| mínimo 20 sessões | não atingido (1 sessão) | **CONFIRMADO** |
| seleção de horizontes | 4 horizontes testados sem correção | **CONFIRMADO** |

**Divergência fundamental:** o experimento pré-registrado **não pode ser executado** como
escrito, porque a feature primária não existe no código.

---

## 7. Bloco F — Machine Learning

### O que está implementado: **NADA**

```
$ grep -rln "xgboost\|lightgbm\|sklearn\|triple_barrier" scripts/
(vazio)
```

**Não há modelo, nem rótulo, nem validação temporal. Apenas planejamento.**

Os scripts `dois_modelos.py` e `dois_modelos_m1.py` citados em sessões anteriores **não
estão neste repositório** — vivem em `quant-lab/scripts/` e não foram versionados aqui.

**Se a intenção é afirmar que há ML no projeto, a afirmação é falsa.** Se é planejamento,
está corretamente rotulado como tal.

---

## 8. Apontamentos refutados

**Nenhum.** Todos os apontamentos verificáveis se confirmaram, no todo ou em parte.

O único que exige nuance é **A.2**: o erro de horizonte é real, mas **não inverte a
conclusão** de "sem sinal". Isso reduz a gravidade sem anular o defeito.

---

## 9. Riscos científicos

| # | risco | gravidade |
|---|---|---|
| 1 | horizonte medido ≠ anunciado (−9%) | **alto** |
| 2 | hipótese primária inexistente no código | **crítico** |
| 3 | nenhuma correção de múltiplas hipóteses | **alto** |
| 4 | "não sobreposto" vendido como "independente" | médio |
| 5 | 1 sessão, 26 observações — nada conclui | **crítico** |
| 6 | gaps não tratados | baixo |
| 7 | agressor é inferência — limita conclusões causais | médio |

## 10. Riscos de engenharia

| # | risco | gravidade |
|---|---|---|
| 1 | **clone limpo falha 11 de 14 testes** | **crítico** |
| 2 | schema não reproduz o coletor | **alto** |
| 3 | coletor não reconecta ao banco | médio |
| 4 | `coleta_log` morta | baixo |
| 5 | fixtures não versionadas | **crítico** |

---

## 11. Plano priorizado

### P0 — bloqueiam qualquer conclusão

| # | correção | teste de aceitação |
|---|---|---|
| **P0-a** | versionar fixtures (`!tests/fixtures/*.csv`) | `git clone` + `pytest` = 14 passed |
| **P0-b** | horizonte por **tempo**, não por linhas | teste: h=3 cobre 2,9–3,1 min em p05–p95 |
| **P0-c** | implementar `OFI_top_classic` | 4 casos do paper com resultado à mão |
| **P0-d** | custo 7,5 num único lugar | nenhuma tabela sem custo no cabeçalho |
| **P0-e** | Holm | p conhecidos → rejeições esperadas |

### P1 — confiabilidade

| # | correção |
|---|---|
| P1-a | descomentar `lado_inferido`/`t_recv_ns` no schema |
| P1-b | coletor reconecta ao banco |
| P1-c | `poder.py` |
| P1-d | teste de autocorrelação dos resíduos |
| P1-e | p-valor unicaudal |
| P1-f | tratar gaps > 2 s |

### P2 — organização

| # | correção |
|---|---|
| P2-a | `coleta_log` ou removê-la |
| P2-b | separar "medição de informação" de "backtest" no README |
| P2-c | versionar os scripts de ML do `quant-lab` ou declarar que são externos |

---

## 12. Decisões que dependem do dono

| # | decisão | recomendação |
|---|---|---|
| 1 | **P0-b muda resultados publicados?** Reemitir com horizonte correto, ou preservar os antigos e gerar versão nova? | **gerar versão nova, preservar a antiga** |
| 2 | Os scripts de ML do `quant-lab` entram no repo? | **sim** — senão o projeto não tem ML |
| 3 | `delta_p02b.py`: promover a módulo testável ou manter como análise pontual? | promover |
| 4 | A janela de 1 s ainda vale com o horizonte corrigido por tempo? | **sim** — são problemas independentes |

---

## 13. Método desta auditoria

- **Nenhum arquivo de código, banco ou protocolo foi alterado.**
- Nenhum `UPDATE`/`DELETE` no banco.
- Todas as medições foram feitas **em memória**, sobre os dados existentes.
- Onde não havia como comprovar, está escrito.

**Commit auditado:** `acf9c47`
