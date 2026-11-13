"""P0-5 — testes do Holm-Bonferroni. Roda SEM banco e SEM MT5."""
import os, sys
import numpy as np
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
from inferencia import holm, avalia_familia


def test_exemplo_calculado_a_mao():
    """m=5, p=[0.01,0.02,0.03,0.04,0.05], alpha=0.05.

    step-down: 0.01 <= 0.05/5=0.010 -> rejeita
               0.02 <= 0.05/4=0.0125 -> NAO, para
    p_adj: i0=(5)*0.01=0.05; i1=(4)*0.02=0.08; i2=(3)*0.03=0.09;
           i3=(2)*0.04=0.08 -> max(0.09,0.08)=0.09 (monotonico);
           i4=(1)*0.05=0.05 -> max(0.09,0.05)=0.09
    """
    h = holm([0.01, 0.02, 0.03, 0.04, 0.05])
    assert h["rejeita"].tolist() == [True, False, False, False, False]
    assert h["k"] == 1
    assert np.allclose(h["p_adj"], [0.05, 0.08, 0.09, 0.09, 0.09]), h["p_adj"]


def test_todos_significativos():
    """p muito pequenos: todos rejeitados."""
    h = holm([0.001, 0.002, 0.003])
    assert h["k"] == 3
    assert h["rejeita"].all()


def test_nenhum_significativo():
    """p altos: nenhum rejeitado."""
    h = holm([0.4, 0.5, 0.6])
    assert h["k"] == 0
    assert not h["rejeita"].any()


def test_ordem_original_preservada():
    """A saida vem na ordem de ENTRADA, nao na ordem de p."""
    h = holm([0.5, 0.001, 0.3])
    # o menor p esta no indice 1
    assert h["rejeita"][1] == True
    assert h["rejeita"][0] == False
    assert h["p_adj"][1] < h["p_adj"][0]


def test_p_adj_monotonico():
    """p_adj deve ser nao-decrescente na ordem crescente de p."""
    h = holm([0.02, 0.01, 0.04, 0.03, 0.05])
    ordenado = h["p_adj"][h["ordem"]]
    assert np.all(np.diff(ordenado) >= -1e-12), ordenado


def test_p_adj_limitado_a_1():
    """p_adj nunca passa de 1."""
    h = holm([0.9, 0.95, 0.99])
    assert (h["p_adj"] <= 1.0).all()


def test_lista_vazia():
    """Lista vazia nao explode."""
    h = holm([])
    assert h["k"] == 0
    assert len(h["rejeita"]) == 0


def test_um_unico_teste():
    """m=1: Holm equivale ao teste simples (0.05/1)."""
    assert holm([0.04])["k"] == 1
    assert holm([0.06])["k"] == 0


def test_p_invalido_levanta_erro():
    """p fora de [0,1] ou NaN deve levantar, nao silenciar."""
    with pytest.raises(ValueError):
        holm([1.5])
    with pytest.raises(ValueError):
        holm([-0.1])
    with pytest.raises(ValueError):
        holm([np.nan])


def test_holm_mais_conservador_que_sem_correcao():
    """Holm nunca rejeita MAIS que o teste sem correcao."""
    ps = [0.04, 0.045, 0.049]
    h = holm(ps)
    sem_correcao = sum(p < 0.05 for p in ps)
    assert h["k"] <= sem_correcao, f"holm={h['k']} sem_correcao={sem_correcao}"


def test_testa_familia_ordena_por_p():
    """testa_familia devolve as linhas em ordem crescente de p."""
    linhas, h = avalia_familia([("a", 0.3), ("b", 0.01), ("c", 0.2)])
    assert linhas[0]["nome"] == "b"
    assert linhas[-1]["nome"] == "a"


def test_familia_de_7_secundarias():
    """Cenario real: 7 hipoteses secundarias do protocolo."""
    ps = [0.003, 0.012, 0.04, 0.06, 0.12, 0.30, 0.55]
    h = holm(ps)
    # 0.003 <= 0.05/7=0.00714 -> sim; 0.012 <= 0.05/6=0.00833 -> nao, para
    assert h["k"] == 1
