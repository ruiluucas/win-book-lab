# Auditoria de referências

Regra: **número de fonte não verificada não entra em documento como fato.**

## Confirmadas

| referência | verificação | conceito efetivamente usado | reprodução ou adaptação |
|---|---|---|---|
| **López de Prado (2018)**, *Advances in Financial Machine Learning*, Wiley, ISBN 9781119482086 | TOC verificado (Google Books) | triple-barrier (cap.3), sample weights por unicidade (cap.4), purged K-fold com embargo (cap.7), CPCV (cap.12) | **adaptação** — não replico os exemplos dele; aplico o método ao WIN |
| **Cont, Kukanov & Stoikov (2014)**, "The Price Impact of Order Book Events", *J. Financial Econometrics* 12(1):47–88 | DOI/veículo/páginas checados | definição de **OFI** (order flow imbalance) | **adaptação** — o artigo usa book de futuros de ações; aplico ao WIN com 5 níveis |
| **Sirignano & Cont (2019)**, "Universal features of price formation", *Quantitative Finance* 19(9):1449–1459, DOI 10.1080/14697688.2019.1571683 | DOI/veículo/páginas checados | features de book (profundidade, desequilíbrio) carregam informação | **adaptação** — eles usam book L2 de **ações americanas** (NASDAQ); o WIN tem 5 níveis. **Não afirmam** que features de fita sejam inferiores — essa extrapolação foi removida do README |
| **Ait-Sahalia, Mykland & Zhang (2005)**, "How Often to Sample a Continuous-Time Process...", *RFS* 18(2):351–416 | DOI/veículo/páginas checados | frequência ótima de amostragem sob ruído de microestrutura **para estimar volatilidade** | **não aplicado diretamente** — o artigo trata de **estimação de volatilidade**, não de previsão direcional. A frase "amostrar mais fino piora o SNR de previsão" era minha extrapolação e foi **removida** |

## NÃO VERIFICADAS — números removidos dos documentos

| referência | o que se atribuía a ela | status |
|---|---|---|
| Baldo, Morais & Silva (2026), ENEGEP/ABEPRO | "ROC 0,50–0,65 no WIN/WDO" | **NÃO VERIFICADO** — DOI/URL não confirmados |
| Grądzki, Wójcik & Lessmann (2025), *Financial Innovation* 11 | "triple barrier positivo após custos" | **NÃO VERIFICADO** |
| Kili et al. (2025), *Applied Sciences* 15(24):13204 | "Sharpe AEDL 0,48 / FH −0,29 / TB −0,03" | **NÃO VERIFICADO** |
| Bhand & Joshi (2026), Research Square | "vazamento infla Sharpe no XGBoost" | **NÃO VERIFICADO** — se existir, é **preprint sem revisão por pares** |

**Ação tomada:** todos os números dessas quatro fontes foram **removidos** de `README.md`,
`MEDICOES.md` e demais documentos. Elas podem ser citadas apenas como pista de leitura,
nunca como fundamento numérico.

## Referência removida como "teto"

**Gu, Kelly & Xiu (2020)**, "Empirical Asset Pricing via Machine Learning", *RFS* 33(5).
Referência **real e verificada**, mas estava **mal usada**: o R²_oos de 0,34–0,40% é de
**retornos mensais em cross-section de ações**, não um teto para tick intradiário de um
futuro. **Removida como teto.** Pode voltar se o projeto migrar para cross-section.

## Como reproduzir a verificação

```bash
# DOI resolve?
curl -sI https://doi.org/10.1080/14697688.2019.1571683 | head -1
```

Para as não verificadas, a tentativa de resolução de DOI **falhou** ou o veículo não pôde
ser confirmado.
