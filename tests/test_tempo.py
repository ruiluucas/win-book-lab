"""P0-2 — testes dos limites temporais. Roda SEM banco e SEM MT5."""
import os, sys
import numpy as np
import pandas as pd
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
from tempo import horizonte_temporal, intervalo_nominal, mede


def _t(segundos):
    """Cria timestamps a partir de offsets em segundos."""
    base = pd.Timestamp("2026-11-13 09:00:00")
    return np.array([(base + pd.Timedelta(seconds=s)).value / 1e9 for s in segundos])


# ---------- 1. IGUALDADE EXATA NO LIMITE ----------
def test_atraso_exatamente_no_limite_e_valido():
    """atraso == limite deve PASSAR (regra inclusiva)."""
    # entrada em 0s, alvo = 60s. NAO ha snapshot em 60s; o proximo e 61s -> atraso 1.0s
    t = _t([0, 61, 70])
    pos, atraso, valido, motivo = horizonte_temporal(t, 1, max_atraso_s=1.0)
    assert atraso[0] == pytest.approx(1.0), f"atraso={atraso[0]}"
    assert valido[0], "atraso == limite deveria ser VALIDO (inclusivo)"
    assert motivo[0] == "ok"


def test_atraso_um_epsilon_acima_do_limite_e_invalido():
    """atraso = limite + 1ms deve FALHAR."""
    t = _t([0, 61.001, 70])
    pos, atraso, valido, motivo = horizonte_temporal(t, 1, max_atraso_s=1.0)
    assert atraso[0] > 1.0
    assert not valido[0], "atraso > limite deveria ser INVALIDO"
    assert motivo[0] == "atraso_excessivo"


# ---------- 2. ATRASO ACIMA DO LIMITE ----------
def test_atraso_muito_acima_do_limite():
    """Salto de 30s: atraso enorme, deve ser descartado e contabilizado."""
    t = _t([0, 90])          # alvo 60s -> snapshot em 90s, atraso 30s
    pos, atraso, valido, motivo = horizonte_temporal(t, 1, max_atraso_s=0.5)
    assert not valido[0]
    assert motivo[0] == "atraso_excessivo"
    assert atraso[0] == pytest.approx(30.0)


# ---------- 3. GAPS ----------
def test_gap_descarta_observacao_que_cruza_o_buraco():
    """Um gap de 20s no meio: a entrada antes do gap nao tem saida valida."""
    # snapshots regulares ate 30s, gap de 20s, volta em 50s
    t = _t([0, 10, 20, 30, 50, 60, 70])
    pos, atraso, valido, motivo = horizonte_temporal(t, 0.5, max_atraso_s=12.0)
    # entrada em 20s: alvo 50s -> snapshots em 50s, atraso 0 -> valido
    assert valido[2]
    # entrada em 0s: alvo 30s -> snapshot em 30s, atraso 0 -> valido
    assert valido[0]
    # o gap de 20s e menor que o limite, entao nao descarta; teste o limite menor
    pos2, atr2, val2, mot2 = horizonte_temporal(t, 0.5, max_atraso_s=1.0)
    # entrada em 30s: alvo 60s -> snapshot em 60s, atraso 0 -> valido
    # entrada em 50s: alvo 80s -> nao existe -> sem_futuro
    assert mot2[4] == "sem_futuro"


def test_gap_grande_entre_entrada_e_alvo():
    """Gap que engole o alvo: atraso grande -> descarte."""
    t = _t([0, 10, 20, 200])   # gap de 180s
    pos, atraso, valido, motivo = horizonte_temporal(t, 1, max_atraso_s=1.0)
    # entrada em 20s: alvo 80s -> snapshot em 200s, atraso 120s -> invalido
    assert not valido[2]
    assert motivo[2] == "atraso_excessivo"
    assert atraso[2] == pytest.approx(120.0)


# ---------- 4. AUSENCIA DE SNAPSHOT FUTURO ----------
def test_ultimo_snapshot_sem_futuro():
    """O ultimo snapshot nunca tem saida: motivo='sem_futuro'."""
    t = _t([0, 10, 20])
    pos, atraso, valido, motivo = horizonte_temporal(t, 1, max_atraso_s=100)
    assert motivo[-1] == "sem_futuro"
    assert not valido[-1]
    assert np.isnan(atraso[-1])


def test_janela_menor_que_horizonte_tudo_sem_futuro():
    """Janela de 5 min com horizonte de 10 min: nenhuma observacao valida."""
    S = pd.DataFrame({
        "ts": pd.to_datetime(_t(np.arange(0, 300, 10)).tolist() if False else
                             [pd.Timestamp("2026-11-13 09:00:00") + pd.Timedelta(seconds=s)
                              for s in range(0, 300, 10)]),
        "mid": 100000.0, "obi5": 0.1,
    })
    d = mede(S, 10, fator=2)
    assert d["n_valido"] == 0
    assert d["n_sem_futuro"] > 0


# ---------- 5. MUDANCA DE FREQUENCIA ENTRE JANELAS ----------
def test_nominal_muda_com_a_frequencia():
    """Nominal = mediana da janela. Janela lenta e rapida tem nominais distintos."""
    lenta = pd.Series(pd.to_datetime(
        [pd.Timestamp("2026-11-13 09:00:00") + pd.Timedelta(milliseconds=237 * i)
         for i in range(100)]))
    rapida = pd.Series(pd.to_datetime(
        [pd.Timestamp("2026-11-13 11:00:00") + pd.Timedelta(milliseconds=106 * i)
         for i in range(100)]))
    n_lenta = intervalo_nominal(lenta)
    n_rapida = intervalo_nominal(rapida)
    assert n_lenta == pytest.approx(0.237, abs=1e-3)
    assert n_rapida == pytest.approx(0.106, abs=1e-3)
    # o limite 2x acompanha
    assert 2 * n_lenta == pytest.approx(0.474, abs=1e-3)
    assert 2 * n_rapida == pytest.approx(0.212, abs=1e-3)


def test_mesma_janela_mesmo_limite_independente_de_fator():
    """max_atraso_s explicito sobrepoe o fator."""
    S = pd.DataFrame({
        "ts": [pd.Timestamp("2026-11-13 09:00:00") + pd.Timedelta(milliseconds=200 * i)
               for i in range(600)],
        "mid": np.linspace(100000, 100100, 600), "obi5": np.full(600, 0.1),
    })
    d_f2 = mede(S, 1, fator=2)
    d_exp = mede(S, 1, max_atraso_s=2 * 0.2)
    assert d_f2["limite_s"] == pytest.approx(d_exp["limite_s"])


# ---------- contabilidade ----------
def test_contabilidade_fecha():
    """n_base = n_valido + n_sem_futuro + n_atraso_excessivo."""
    S = pd.DataFrame({
        "ts": [pd.Timestamp("2026-11-13 09:00:00") + pd.Timedelta(milliseconds=237 * i)
               for i in range(3000)],
        "mid": np.linspace(100000, 100500, 3000), "obi5": np.full(3000, 0.1),
    })
    d = mede(S, 3, fator=2)
    assert d["n_base"] == d["n_valido"] + d["n_sem_futuro"] + d["n_atraso_excessivo"], \
        f"{d['n_base']} != {d['n_valido']}+{d['n_sem_futuro']}+{d['n_atraso_excessivo']}"


def test_horizonte_realizado_proximo_do_alvo():
    """Com snapshots regulares, h_real deve ser ~= alvo."""
    S = pd.DataFrame({
        "ts": [pd.Timestamp("2026-11-13 09:00:00") + pd.Timedelta(milliseconds=237 * i)
               for i in range(3000)],
        "mid": np.linspace(100000, 100500, 3000), "obi5": np.full(3000, 0.1),
    })
    d = mede(S, 3, fator=2)
    assert abs(d["h_real_mediana"] - 3.0) < 0.01, f"h_real={d['h_real_mediana']}"
