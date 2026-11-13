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


# ---------- DETERMINÍSTICOS (exigência do dono: critério 3 não era suficiente) ----------
from analisador import recorta

SINT = os.path.join(RAIZ, "tests", "fixtures", "sintetica_6snapshots.csv")


def _sint():
    """Fixture com snapshots em 09:00, 09:01, ..., 09:05 (um por minuto, exatos)."""
    return carrega_csv(SINT)


def test_deterministico_janela_A():
    """Janela A [09:00, 09:03) -> exatamente 3 snapshots (00, 01, 02)."""
    S = recorta(_sint(), "2026-11-13 09:00:00", "2026-11-13 09:03:00")
    assert len(S) == 3, f"esperado 3, obtido {len(S)}"
    assert list(S.ts.dt.minute) == [0, 1, 2]


def test_deterministico_janela_B():
    """Janela B [09:02, 09:05) -> exatamente 3 snapshots (02, 03, 04)."""
    S = recorta(_sint(), "2026-11-13 09:02:00", "2026-11-13 09:05:00")
    assert len(S) == 3, f"esperado 3, obtido {len(S)}"
    assert list(S.ts.dt.minute) == [2, 3, 4]


def test_limite_inicio_inclusivo():
    """Registro EXATAMENTE no início é incluído."""
    S = recorta(_sint(), "2026-11-13 09:01:00", "2026-11-13 09:04:00")
    assert 1 in list(S.ts.dt.minute), "limite inferior deveria ser inclusivo"


def test_limite_fim_exclusivo():
    """Registro EXATAMENTE no fim é EXCLUÍDO (convenção [inicio, fim))."""
    S = recorta(_sint(), "2026-11-13 09:01:00", "2026-11-13 09:04:00")
    assert 4 not in list(S.ts.dt.minute), "limite superior deveria ser exclusivo"
    assert list(S.ts.dt.minute) == [1, 2, 3]


def test_idempotencia_mesma_janela():
    """Duas execuções na mesma janela produzem resultado idêntico."""
    S = _sint()
    a = recorta(S, "2026-11-13 09:00:00", "2026-11-13 09:06:00")
    b = recorta(_sint(), "2026-11-13 09:00:00", "2026-11-13 09:06:00")
    pd.testing.assert_frame_equal(a, b)


def test_idempotencia_cli():
    """Duas execuções da CLI produzem stdout idêntico (exceto nada — é determinístico)."""
    r1 = subprocess.run([sys.executable, SCRIPT, "--csv", SINT], capture_output=True, text=True)
    r2 = subprocess.run([sys.executable, SCRIPT, "--csv", SINT], capture_output=True, text=True)
    assert r1.stdout == r2.stdout, "saída não é determinística"


def test_hash_aparece_e_bate_com_repo():
    """O commit impresso é o mesmo que o git reporta."""
    r = subprocess.run([sys.executable, SCRIPT, "--csv", SINT], capture_output=True, text=True)
    assert "COMMIT" in r.stdout
    impresso = [l.split(":")[1].strip() for l in r.stdout.splitlines() if "COMMIT" in l][0]
    real = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"],
                                   cwd=RAIZ, text=True).strip()
    assert impresso == real, f"impresso={impresso} real={real}"
