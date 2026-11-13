# Testes de UI (CDP)

Rodam contra o app **já aberto** com `--remote-debugging-port=9222`. Não são
`pytest` nem `npm test` — precisam da janela real, porque medem coisas que só
existem na tela (posição de tooltip, cadência de redraw, retângulo de elemento).

```bash
# 1. abrir o app com porta de depuração
./node_modules/.bin/electron . --no-sandbox \
  --ozone-platform=wayland --remote-debugging-port=9222 &

# 2. rodar cada suíte
node teste-ui/tooltip.js      # todo tooltip tem que caber na janela
node teste-ui/icones.js       # os 15 ícones .info têm que estar estilizados
node teste-ui/config.js       # modal, persistência, cadência de 10x/s
node teste-ui/timeframes.js   # troca de timeframe muda o dado, não só o botão
node teste-ui/taxa.js         # botões no header e cadências
node teste-ui/status-header.js # pílulas de status e tooltip rico
```

Cada script sai com código 0/1 e imprime PASS/FALHA por asserção.

## Por que medir o efeito, não a intenção

Um teste que checa `elemento.classList.contains('tip-inv')` passa mesmo com o
texto cortado na tela — ele testa a *intenção*, não o *resultado*.

Estes scripts medem o resultado: `getBoundingClientRect()` do tooltip contra
`window.innerWidth`, `getComputedStyle(.info).borderTopWidth`, o `time` dos
candles antes e depois de clicar. Foi assim que o ícone apagado e o tooltip
cortado apareceram.
