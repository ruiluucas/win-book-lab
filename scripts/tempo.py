"""P0-2 — horizonte por TEMPO REAL, com tolerância declarada.

DIFERENÇA do método antigo (book_estrito.py, PRESERVADO):
  antigo : h = minutos*60 / mediana(dt)  -> h LINHAS. Horizonte real ~9% menor.
  novo   : busca o 1o snapshot com ts >= entrada + minutos, com atraso <= limite.

REGRA DE VALIDADE (congelada antes de teste economico):
  nominal      = mediana(dt) DA PROPRIA JANELA
  limite       = fator * nominal        (fator 1, 2 ou 5; primario = 2)
  valida       : atraso <= limite       (INCLUSIVO no limite)
  sem futuro   : descartada
  atraso > lim : descartada, contabilizada

NAO altera custo, hipotese, teste estatistico ou protocolo.
"""
import numpy as np
import pandas as pd


def intervalo_nominal(ts):
    """Mediana do intervalo entre snapshots, em segundos. Define o 'nominal'."""
    t = _seg(ts)
    d = np.diff(t)
    d = d[d > 0]
    if len(d) == 0:
        raise ValueError("menos de 2 snapshots distintos")
    return float(np.median(d))


def _seg(ts):
    """Converte timestamps em segundos float."""
    s = pd.to_datetime(pd.Series(ts))
    return s.values.astype("datetime64[ns]").astype("int64").astype(float) / 1e9


def horizonte_temporal(t, minutos, max_atraso_s):
    """Para cada instante, encontra o 1o snapshot com ts >= t+minutos.

    Devolve (pos, atraso_s, valido, motivo):
      pos    : indice do snapshot de saida (ou len(t) se nao existe)
      atraso : pos - alvo, em segundos (nan quando nao existe)
      valido : bool, atraso <= max_atraso_s
      motivo : 'ok' | 'sem_futuro' | 'atraso_excessivo'
    """
    t = np.asarray(t, float)
    alvo = t + minutos * 60.0
    pos = np.searchsorted(t, alvo, side="left")
    tem = pos < len(t)
    pos_c = np.clip(pos, 0, len(t) - 1)
    atraso = np.where(tem, t[pos_c] - alvo, np.nan)
    # INCLUSIVO no limite: atraso <= max_atraso_s  (igualdade PASSA)
    valido = tem & (atraso <= max_atraso_s + 1e-9)
    motivo = np.where(~tem, "sem_futuro", np.where(valido, "ok", "atraso_excessivo"))
    return pos_c, atraso, valido, motivo


def mede(S, minutos, fator=2.0, max_atraso_s=None):
    """Executa a medicao temporal. Devolve dict com resultado e diagnostico.

    S precisa ter colunas: ts, mid, obi5.
    fator: multiplicador do nominal (1, 2 ou 5). Ignorado se max_atraso_s vier.
    """
    t = _seg(S.ts)
    nominal = intervalo_nominal(S.ts)
    limite = max_atraso_s if max_atraso_s is not None else fator * nominal
    pos, atraso, valido, motivo = horizonte_temporal(t, minutos, limite)

    # amostragem nao sobreposta (mesma regua do metodo antigo)
    keep, ult = [], -1e18
    for i, ti in enumerate(t):
        if ti - ult >= minutos * 60:
            keep.append(i)
            ult = ti
    idx = np.array(keep, dtype=int)

    mid = S.mid.values
    obi = S.obi5.values
    ok = valido[idx] & np.isfinite(obi[idx]) & np.isfinite(mid[idx])
    ii = idx[ok]
    saida = pos[ii]
    atr = atraso[ii]
    h_real = (t[saida] - t[ii]) / 60.0
    bruto = (mid[saida] - mid[ii]) * np.sign(obi[ii])

    # contabilidade de descartes na amostra independente
    desc_sem_futuro = int((motivo[idx] == "sem_futuro").sum())
    desc_atraso = int((motivo[idx] == "atraso_excessivo").sum())

    return {
        "minutos": minutos, "nominal_s": nominal, "limite_s": limite,
        "fator": fator,
        "n_base": int(len(idx)), "n_valido": int(len(ii)),
        "n_sem_futuro": desc_sem_futuro, "n_atraso_excessivo": desc_atraso,
        "atraso_mediano_s": float(np.nanmedian(atr)) if len(atr) else np.nan,
        "atraso_p95_s": float(np.nanpercentile(atr, 95)) if len(atr) else np.nan,
        "atraso_max_s": float(np.nanmax(atr)) if len(atr) else np.nan,
        "h_real_mediana": float(np.median(h_real)) if len(h_real) else np.nan,
        "h_real_p05": float(np.percentile(h_real, 5)) if len(h_real) else np.nan,
        "h_real_p95": float(np.percentile(h_real, 95)) if len(h_real) else np.nan,
        "cobertura": float(len(ii) / len(idx)) if len(idx) else 0.0,
        "bruto_medio": float(bruto.mean()) if len(bruto) else np.nan,
        "acerto": float((bruto > 0).mean()) if len(bruto) else np.nan,
        "_bruto": bruto, "_h_real": h_real,
    }
