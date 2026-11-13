"""P0-3 — fonte ÚNICA dos parâmetros econômicos.

Antes desta etapa, CUSTO estava repetido em 3 arquivos, todos com 5,0, enquanto a
documentação dizia 7,5. Agora vive aqui e em nenhum outro lugar.

HISTÓRICO PRESERVADO: os resultados publicados em 13/11 usaram custo 5,0 e continuam
reproduzíveis com --custo 5. Nada foi sobrescrito.
"""

# Custo-base de pesquisa, em pontos do WIN. Decisão do dono, 13/11/2026.
CUSTO_BASE = 7.5

# Cenários de sensibilidade obrigatórios em todo relatório.
SENSIBILIDADES = (5.0, 7.5, 10.0)

# Custo usado nos resultados históricos (NÃO alterar — é registro, não parâmetro).
CUSTO_HISTORICO_2026_11_13 = 5.0

PT_RS = 0.20   # R$ por ponto do WIN


def valida(custo):
    """Recusa custo fora dos cenários sem avisar. Transparência > conveniência."""
    if custo not in SENSIBILIDADES:
        import sys
        print(f">>> AVISO: custo {custo} não está nos cenários {SENSIBILIDADES}",
              file=sys.stderr)
    return custo
