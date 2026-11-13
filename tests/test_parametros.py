"""P0-3 — fonte unica de custo. Roda SEM banco e SEM MT5."""
import os, sys, re
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
from parametros import CUSTO_BASE, SENSIBILIDADES, CUSTO_HISTORICO_2026_11_13, PT_RS


def test_custo_base_e_7_5():
    assert CUSTO_BASE == 7.5


def test_sensibilidades_sao_5_7_5_10():
    assert SENSIBILIDADES == (5.0, 7.5, 10.0)


def test_historico_preservado_em_5():
    """O custo dos resultados de 13/11 fica registrado como 5,0, nao sobrescrito."""
    assert CUSTO_HISTORICO_2026_11_13 == 5.0


def test_pt_rs():
    assert PT_RS == 0.20


def test_nenhum_script_hardcoda_custo_de_analise():
    """CUSTO=5.0 (ou 7.5) nao pode aparecer como constante literal nos analisadores.

    Excecao: book_estrito.py mantem 5.0 de proposito (reproduz o historico).
    """
    permitidos = {"book_estrito.py"}
    infratores = []
    for f in os.listdir(os.path.join(RAIZ, "scripts")):
        if not f.endswith(".py") or f in permitidos or f == "parametros.py":
            continue
        txt = open(os.path.join(RAIZ, "scripts", f)).read()
        # atribuicao direta de custo literal
        if re.search(r"^CUSTO\s*=\s*[57]", txt, re.M) or \
           re.search(r"CUSTO,\s*PT_RS\s*=\s*[57]", txt):
            infratores.append(f)
    assert not infratores, f"custos hardcoded em: {infratores}"


def test_book_tempo_importa_de_parametros():
    txt = open(os.path.join(RAIZ, "scripts", "book_tempo.py")).read()
    assert "from parametros import" in txt
    assert "CUSTO_BASE" in txt


def test_book_estrito_mantem_default_historico():
    """O metodo antigo continua com default 5.0 para reproduzir 13/11."""
    txt = open(os.path.join(RAIZ, "scripts", "book_estrito.py")).read()
    assert "default=5.0" in txt
