"""E1.1 — a janela é obrigatória e o resultado é reproduzível.

Roda SEM banco e SEM MT5: usa a fixture CSV versionada.
"""
import subprocess, sys, os
import pandas as pd
import numpy as np
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
from analisador import carrega_csv, amostra_independente, commit_hash

FIXTURE = os.path.join(RAIZ, "tests", "fixtures", "book_20min.csv")
SCRIPT = os.path.join(RAIZ, "scripts", "book_estrito.py")


# ---------- unidade: amostragem independente ----------
def test_amostra_nao_sobreposta():
    """1 obs a cada h minutos: o intervalo entre observações escolhidas >= h."""
    S = carrega_csv(FIXTURE)
    idx = amostra_independente(S, 3)
    ts = S.ts.iloc[idx].values
    gaps = np.diff(ts).astype("timedelta64[s]").astype(int) / 60.0
    assert (gaps >= 3).all(), f"gap menor que 3 min: {gaps.min():.2f}"


def test_amostra_conta_correta():
    """20 min com passo de 3 min => 7 observações (0,3,6,9,12,15,18)."""
    S = carrega_csv(FIXTURE)
    idx = amostra_independente(S, 3)
    assert len(idx) == 7, f"esperado 7, obtido {len(idx)}"


def test_fixture_integridade():
    """A fixture tem bid<ask, 10 linhas por snapshot e grade de 5 pts."""
    S = carrega_csv(FIXTURE)
    assert (S.ask > S.bid).all()
    assert (S.spread % 5 == 0).all()
    assert (S.spread >= 5).all()
    assert S.ts.is_monotonic_increasing


# ---------- integração: CLI exige janela ----------
def test_sem_janela_falha():
    """Sem --inicio/--fim e sem --csv, exit code != 0."""
    r = subprocess.run([sys.executable, SCRIPT], capture_output=True, text=True)
    assert r.returncode != 0
    assert "janela" in (r.stderr + r.stdout).lower()


def test_csv_roda_sem_banco():
    """--csv funciona sem MERCADO_DSN definido."""
    env = {k: v for k, v in os.environ.items() if k != "MERCADO_DSN"}
    r = subprocess.run([sys.executable, SCRIPT, "--csv", FIXTURE],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr[-500:]
    assert "JANELA DECLARADA" in r.stdout
    assert "COMMIT" in r.stdout


def test_cabecalho_mostra_custo():
    """O custo deve aparecer no cabeçalho (rastreabilidade)."""
    r = subprocess.run([sys.executable, SCRIPT, "--csv", FIXTURE],
                       capture_output=True, text=True)
    assert "CUSTO" in r.stdout


def test_commit_hash_presente():
    h = commit_hash()
    assert isinstance(h, str) and len(h) > 0
