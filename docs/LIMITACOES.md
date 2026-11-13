# Limitações conhecidas

Lista única. Toda limitação do projeto está aqui; os outros documentos apontam para cá.

## Dado

### 1. Profundidade limitada a 5 níveis
`symbol_info.ticks_bookdepth = 5` para o WINZ26. A BTG retail entrega 5 níveis por lado —
**não existe como pedir mais**. Símbolos expirados (WINZ22, WING23) mostram 32 na
especificação, mas `market_book_get` devolve **0** (sem feed). Índice cheio e dólar têm 6.

**Consequência:** features de profundidade agregada (OBI_5) têm apenas 5 níveis. Book
completo exigiria feed CAM/L2 da B3.

### 2. Polling, não eventos — há perda
O coletor faz **polling** a ~8,5 leituras/s (~118 ms). Entre duas leituras podem ocorrer
várias mudanças que **não são vistas**. O teste de ida-e-volta (1248/1248) prova que o
delta está correto **entre leituras consecutivas**, não que todas as mudanças foram
capturadas.

**NÃO VERIFICADO:** a taxa em rajada (abertura, evento macro). A taxa de 8,5/s foi medida
em mercado calmo; a taxa de negócios variou 1,9× no mesmo dia (10 → 19/s).

### 3. Sem identificação de cancelamento ou execução
`volume_decrease` no mesmo preço pode ser execução, cancelamento ou modificação —
**indistinguíveis por snapshot**. A decomposição "~1,7% execução" é **estimativa** via
regra do tick, não observação.

### 4. Timestamp do book é relógio local
`market_book_get` não devolve timestamp do servidor. O `ts` do book é o relógio local
**após** a chamada, com latência de 6–48 ms.

**Incerteza de alinhamento book×tick: ~±3 ms** (metade da menor latência medida). Grãos
mais finos não são confiáveis.

### 5. Sem histórico de tick
`copy_ticks_from` / `copy_ticks_range` retornam **0** em qualquer janela (1, 5, 15, 60
min), com `COPY_TICKS_ALL` e `COPY_TICKS_TRADE`, `last_error = Success`.

**Consequência:** captura só **forward**. Não há como recuperar o passado, nem o minuto
anterior. Todo dia não capturado é perdido.

### 6. Sem flags de agressor
Consequência direta do item 5. Constantes existem (`TICK_FLAG_BUY=32` etc.) mas não há
dado. O `lado_inferido` usa regra do tick; **1,8% dos negócios ficam indefinidos** (no
meio do spread).

## Modelagem

### 7. Sem reconstrução da fila
A posição na fila de uma ordem limite **não é observável**. Isso impede modelar ordem
limitada com honestidade.

### 8. Sem book completo — iceberg e ordem escondida são invisíveis
Volume exibido é o que o servidor publica. Ordens iceberg e hidden aparecem só quando
executam.

### 9. Resolução temporal limita features rápidas
Com ~8,5 snapshots/s, uma janela de 250 ms tem **~2 observações**. Qualquer feature
calculada nessa janela tem resolução de 2 pontos. Ver
[`FEATURES.md`](FEATURES.md#limite-de-resolução--a-restrição-física).

## Amostra e método

### 10. Amostra atual é de uma sessão parcial — exploratória
80 minutos em 13/11. Não sustenta conclusão em nenhuma direção. **Está queimada** (24
combinações olhadas).

### 11. Um ativo
Só WIN, um contrato por vez. Sem cross-section, sem controle de fator, sem benchmark de
outros instrumentos.

### 12. Custo de 7,5 pts é teórico
Spread medido (5 pts) + corretagem de R$ 0,50 (de outra série). Slippage real não medido.

### 13. Latência ponta a ponta desconhecida
Só as etapas MT5→coletor e polling estão medidas. Servidor→MT5, decisão e
corretora→B3 **não foram medidas**. Ver [`EXECUCAO.md`](EXECUCAO.md).

## Referências

### 14. Quatro referências não confirmadas
Baldo et al. (2026), Grądzki et al. (2025), Kili et al. (2025) e Bhand & Joshi (2026)
não foram validadas independentemente. **Os números atribuídos a elas foram removidos.**
Ver [`REFERENCIAS_AUDITORIA.md`](REFERENCIAS_AUDITORIA.md).

## O que estas limitações NÃO invalidam

- O delta por preço está **correto** (prova: 1248/1248 reconstruções exatas)
- A captura é **íntegra** no que grava (10 linhas/snapshot, bid<ask, sem duplicatas no v5)
- O pipeline de medição **distingue** sinal de artefato (a régua estrita funciona)
