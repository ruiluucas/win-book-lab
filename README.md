# WIN Book Lab — captura e análise de microestrutura do mini-índice B3

Polling do book de ofertas e dos negócios do WIN (mini-índice da B3) via MetaTrader 5,
com delta por nível de preço, e medição de poder preditivo.

> **Estado do projeto (13/11/2026): infraestrutura em validação. Nenhum edge demonstrado.**
>
> A amostra coletada em 13/11 é **exploratória e está queimada** — não será reutilizada
> como confirmação. O protocolo de confirmação está em [`docs/PROTOCOLO.md`](docs/PROTOCOLO.md),
> congelado antes de olhar dados novos.

**Este repositório foi escrito para ser auditado.** Cada afirmação aponta para o script
ou documento que a sustenta. O que não foi verificado está marcado **NÃO VERIFICADO**.

---

## 1. O que este laboratório faz

| faz | não faz |
|---|---|
| captura o book (5 níveis/lado) por **polling** | não recebe eventos empurrados pelo servidor |
| captura os negócios (último tick observado) | não reconstrói a fita completa |
| calcula delta por nível de preço | não distingue execução de cancelamento diretamente |
| mede informação preditiva de features de book | não executa ordens (somente leitura) |
| versiona o método e as limitações | não promete retorno |

**Precisão sobre o termo "tick a tick":** não há captura tick a tick. O coletor faz
**polling** do book e lê o **último tick observado**. Entre duas leituras podem ocorrer
negócios não vistos. Ver [`docs/LIMITACOES.md`](docs/LIMITACOES.md).

## 2. Por que book

Duas fontes de dado distintas:

| | fita (tape) | book (livro) |
|---|---|---|
| o que é | negócios **fechados** | ordens **em aberto** |
| diz | "negociou 5 a 174.000" | "227 querem vender a 174.010" |
| no MT5 | `symbol_info_tick` | `market_book_get` |

O projeto investiga features de book porque elas descrevem **intenção** (ordens paradas),
não apenas resultado (negócios fechados). Se essa premissa é correta para o WIN é
exatamente o que o laboratório quer medir — **não é uma conclusão**.

## 3. Arquitetura

```
MT5 (BTG, Lutris/Proton)
        │
        ▼
ponte RPyC 127.0.0.1:18812  (mt5server.exe dentro do prefixo do MT5)
        │
        ▼
coletor v5  (2 threads, 2 conexões RPyC independentes)
        │
        ▼
TimescaleDB 127.0.0.1:5434  (tick · book · book_delta_v2)
```

| componente | arquivo | estado |
|---|---|---|
| schema | [`sql/schema_v2.sql`](sql/schema_v2.sql) | ativo |
| coletor | [`scripts/coleta_v5.py`](scripts/coleta_v5.py) | **ativo** |
| invariantes | [`scripts/verifica_integridade.py`](scripts/verifica_integridade.py) | ativo |
| prova do delta | [`scripts/testa_ida_volta.py`](scripts/testa_ida_volta.py) | ativo |
| análise | [`scripts/analisa_book_db.py`](scripts/analisa_book_db.py) | ativo |
| régua estrita | [`scripts/book_estrito.py`](scripts/book_estrito.py) | ativo |
| didático | [`scripts/explica.py`](scripts/explica.py) | ativo |

Histórico de versões do coletor: [`docs/VERSOES.md`](docs/VERSOES.md).

## 4. O dado

### Tabelas

**`book`** — snapshot do estado, 10 linhas por leitura (5 níveis × 2 lados):

| coluna | tipo | significado |
|---|---|---|
| `ts` | timestamptz | **relógio local no recebimento** (não é timestamp do servidor) |
| `symbol` | text | `WINZ26` (guard: só aceita `WIN*`) |
| `lado` | smallint | 1 = ask (venda), 2 = bid (compra) |
| `nivel` | smallint | 0 = melhor preço do lado |
| `preco` | **integer** | pontos (grade de 5) |
| `volume` | **integer** | contratos |

**`book_delta_v2`** — diferença entre leituras consecutivas, **chaveada por preço**:

| coluna | significado |
|---|---|
| `vol_antes` / `vol_agora` | volume no mesmo preço, antes e depois |
| `delta` | `vol_agora − vol_antes` |
| `evento` | `volume_increase` · `volume_decrease` · `price_entered_window` · `price_left_window` |

Ver [§6](#6-nomenclatura-do-delta--o-que-é-observado-e-o-que-é-inferido): a mudança de
volume **não é** observada como cancelamento ou execução.

**`tick`** — negócios observados: `ts, symbol, time_msc, bid, ask, last, volume, lado_inferido, t_recv_ns`

## 5. Como o dado é obtido

### Por que duas threads

Medido com o MT5 ativo:

| operação | latência |
|---|---|
| `symbol_info_tick` | 6–41 ms (varia com a carga do MT5) |
| `market_book_get` | 6–48 ms |

Na mesma thread, um ciclo serializado limita a taxa. Com duas **conexões RPyC
independentes**, cada chamada corre em paralelo. Métricas por versão em
[`docs/VERSOES.md`](docs/VERSOES.md).

### Taxa observada

| fluxo | taxa | nota |
|---|---:|---|
| snapshots do book | **8,3–8,5 /s** | mercado calmo, 13/11 |
| linhas de `book_delta_v2` | ~57 /s | |
| negócios (ticks) | 10–19 /s | variou 1,9× no mesmo dia |

**NÃO VERIFICADO:** a taxa em rajada (abertura, evento macro). 8,5/s é taxa de mercado
calmo, medida com o mesmo polling que se quer validar — **é circular**, e não é teto.

### O que o MT5 entrega

| item | valor | evidência |
|---|---|---|
| `ticks_bookdepth` do WIN | **5 níveis por lado** | `symbol_info` |
| ordem dos preços | **pior preço primeiro** | melhor bid = `max`, melhor ask = `min` |
| `market_book_get` logo após `add` | **0 entradas** por ~1 s | precisa esperar |
| tipos no book | só 1 (ask) e 2 (bid) | 3 e 4 (market) não aparecem |
| **histórico de tick** | **não existe** | `copy_ticks_*` = 0 em 1/5/15/60 min, `last_error = Success` |
| `time` do MT5 | hora do **servidor** (GMT-3) | não é UTC |
| flags de agressor | **não obteníveis** | consequência do item acima |

## 6. Nomenclatura do delta — o que é observado e o que é inferido

Este é o ponto mais fácil de errar num projeto de book. **Snapshots não são eventos.**

| evento | o que é | o que **não** é |
|---|---|---|
| `volume_increase` | volume no mesmo preço aumentou | não sabemos se é uma ordem nova ou ampliação |
| `volume_decrease` | volume no mesmo preço diminuiu | **não sabemos** se foi execução, cancelamento ou modificação |
| `price_entered_window` | o preço apareceu na janela de 5 níveis | **não é ordem nova** — o preço pode ter entrado na janela visível |
| `price_left_window` | o preço saiu da janela visível | **não é cancelamento** |

**O que a decomposição permitiu estimar:** cruzando `volume_decrease` com os negócios do
mesmo período, **~1,7% do churn é compatível com execução** e o resto seria cancelamento.
Isso é uma **estimativa**, não uma observação — depende da regra do tick e da janela.
Detalhes e as três tentativas (com dois erros meus) em
[`docs/RELATORIO_AJUSTES.md`](docs/RELATORIO_AJUSTES.md#p02--cancel-não-é-cancel).

**Nomes no código:** a tabela usa `vol_up`/`vol_down`/`entrou_janela`/`saiu_janela`.
O mapeamento para a nomenclatura acima é 1:1 e será unificado na próxima migração de
schema — **não alterado nesta rodada** por ser código, não documentação.

## 7. Features

Comparativo completo em [`docs/FEATURES.md`](docs/FEATURES.md). Resumo:

| feature | o que investiga |
|---|---|
| `OBI_1` | desequilíbrio no melhor nível |
| `OBI_5` | desequilíbrio nos 5 níveis |
| `OFI_top_classic` | fluxo de ordens no topo (Cont, Kukanov & Stoikov, 2014) |
| `OFI_top_volume` | variação agregada de volume no topo (mais simples, não é OFI) |
| `microprice − mid` | pressão implícita no melhor nível |
| `spread` | custo de transação contemporâneo |

**Limite de resolução:** com ~8,5 snapshots/s, uma janela de 250 ms contém **~2
observações**. Qualquer feature calculada nessa janela tem resolução de 2 pontos —
isso é uma limitação física do polling, não do cálculo.

## 8. Metodologia

Detalhes em [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md). O essencial:

**O erro mais fácil:** tratar observações sobrepostas como independentes. Se o horizonte é
3 min e a coleta é a 120 ms, cada evento contém ~1.500 leituras do mesmo movimento.

Prova concreta neste projeto:

| método | acerto | t | p | veredito |
|---|---:|---:|---:|---|
| todas as obs + Newey-West | 54,9% | 4,01 | 0,0001 | "edge!" ❌ |
| **só obs independentes (n=26)** | **50,0%** | **0,03** | **0,98** | **ruído** ✅ |

**Régua primária:** amostragem sem sobreposição. O Newey-West só é válido com largura de
banda ≥ o comprimento da sobreposição em observações (~1.500 aqui) — inviável.

## 9. Resultados até agora

**Exploratórios. Não confirmatórios. Amostra de uma sessão parcial.**

### OBI nas observações independentes (80 min, 13/11)

| h | n indep | acerto | pts/op | p | veredito |
|---|---:|---:|---:|---:|---|
| 1 min | 80 | 42,5% | −0,3 | 0,96 | ruído |
| 2 min | 40 | 47,5% | −7,8 | 0,56 | ruído |
| 3 min | 26 | 50,0% | +0,6 | 0,98 | ruído |
| 5 min | 16 | 62,5% | +50,6 | 0,14 | ruído |

### Delta do book (números corrigidos)

| métrica | valor anterior | **valor correto** |
|---|---|---|
| churn | "~97%" | **25% da movimentação** |
| execução dentro do churn | não medido | **~1,7% (estimativa)** |
| "só 1% empurra o preço" | publicado | **removido** — não sustentado |

Os outros 75% da movimentação são `price_entered_window` / `price_left_window` —
**limitação de amostragem do MT5**, não atividade de ordens.

**Prova do delta:** `scripts/testa_ida_volta.py` → **1248/1248** snapshots reconstruídos.

### Lado agressor — inferido, não observado

85.196 contratos de comprador agressor contra 84.786 de vendedor; **1,8% indefinidos**
(negócio no meio do spread). Inferência por regra do tick, não flag do servidor.

## 10. Referências

Verificação completa em [`docs/REFERENCIAS_AUDITORIA.md`](docs/REFERENCIAS_AUDITORIA.md).
**Números de fontes não confirmadas foram removidos.**

**Confirmadas:**

- **López de Prado, M. (2018).** *Advances in Financial Machine Learning.* Wiley.
  ISBN 9781119482086. Cap. 3 (triple-barrier), 4 (sample weights), 7 (purged CV), 12 (CPCV).
- **Cont, Kukanov & Stoikov (2014).** "The Price Impact of Order Book Events."
  *Journal of Financial Econometrics* 12(1):47–88. → define o **OFI**.
- **Sirignano & Cont (2019).** "Universal features of price formation in financial
  markets." *Quantitative Finance* 19(9):1449–1459. DOI 10.1080/14697688.2019.1571683.
  → book de ações americanas; **não afirma** superioridade sobre features de fita.
- **Ait-Sahalia, Mykland & Zhang (2005).** *RFS* 18(2):351–416.
  → estimação de **volatilidade** sob ruído. **Não** trata de previsão direcional.

**NÃO VERIFICADAS** (números removidos): Baldo et al. (2026) · Grądzki et al. (2025) ·
Kili et al. (2025) · Bhand & Joshi (2026, preprint, sem revisão por pares).

## 11. Meta-labeling — não implementado

**Correção de uma imprecisão anterior.** A arquitetura "modelo A decide se entra, modelo B
decide a direção" foi descrita como *meta-labeling*. **Não é** — ou não é completo.

Meta-labeling (López de Prado, cap. 3) exige:

| componente | o que faz | existe aqui? |
|---|---|---|
| **modelo primário** | define o **lado** da operação | ❌ **não existe** |
| **modelo secundário** | decide **se** aceitar o sinal do primário (size/filtro) | ❌ não existe |
| **rótulo** | derivado do retorno do primário sobre triple-barrier | ❌ não definido |

O que foi de fato testado foi **seleção por sinal de feature**: "entra na direção do OBI
quando |OBI| ≥ limiar". Isso é **filtro de regime**, não meta-labeling.

**Registrado como trabalho futuro.** Implementar meta-labeling corretamente exige:

1. definir o modelo primário (uma regra explícita que dá o lado)
2. rotular com triple-barrier **calibrado pela volatilidade realizada**
3. treinar o secundário só nos casos em que o primário disparou
4. purged K-fold com embargo ≥ horizonte, e sample weights por unicidade

**Nada disso foi feito.** A seção anterior do README que usava o termo foi corrigida.

## 12. Limitações

Lista única e completa em [`docs/LIMITACOES.md`](docs/LIMITACOES.md). As cinco que mais
mordem:

1. **5 níveis** — profundidade limitada; book completo exigiria feed CAM/L2 da B3
2. **Polling** — eventos entre leituras são perdidos
3. **Sem identificação de cancelamento/execução** — só inferência
4. **Timestamp do book é relógio local** — incerteza de alinhamento ~±3 ms
5. **Sem reconstrução da fila** — posição na fila não é observável

## 13. Como reproduzir

```bash
# 1. MT5 da BTG aberto (via Lutris + Proton 10+; Wine 8 é rejeitado pelo build 6230)
# 2. ponte RPyC
~/Projetos/mt5-bridge/start_server.sh 18812

# 3. banco
docker run -d --name mercado-db \
  -e POSTGRES_PASSWORD=SUA_SENHA -e POSTGRES_DB=mercado \
  -p 127.0.0.1:5434:5432 -v /caminho/mercado-db:/var/lib/postgresql/data \
  --shm-size=1g --restart unless-stopped timescale/timescaledb:latest-pg16
psql -h 127.0.0.1 -p 5434 -U postgres -d mercado -f sql/schema_v2.sql

# 4. coleta
cp .env.example .env   # ajuste a senha; nunca versione
python scripts/coleta_v5.py --simbolo WINZ26 --flush-seg 10

# 5. verificação e análise
python scripts/verifica_integridade.py    # sai com código != 0 se falhar
python scripts/book_estrito.py
```

Dependências fixas em [`requirements.txt`](requirements.txt).

## 14. Estrutura

```
├── README.md                  este arquivo (porta de entrada)
├── docs/
│   ├── VERSOES.md             tabela de versões dos coletores
│   ├── METODOLOGIA.md         régua estatística, Holm, poder, sessões
│   ├── FEATURES.md            comparativo de features
│   ├── EXECUCAO.md            modelo de execução e latência
│   ├── LIMITACOES.md          lista única de limitações
│   ├── PROTOCOLO.md           hipóteses pré-registradas
│   ├── REFERENCIAS_AUDITORIA.md  afirmação → fonte → status
│   ├── INFRAESTRUTURA.md      operação e armadilhas
│   ├── MEDICOES.md            números brutos do dia
│   ├── HISTORICO.md           resultados superados
│   └── RELATORIO_AJUSTES.md   o que foi corrigido e por quê
├── scripts/
└── sql/schema_v2.sql
```

## Licença

Uso pessoal. Sem garantia. Não é recomendação de investimento.
