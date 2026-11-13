"""Núcleo compartilhado dos analisadores — E1.1 (janela reproduzível).

REGRA: toda análise declara a janela. Sem `inicio` e `fim`, o script não roda.
Motivo: o resultado publicado em 13/11 (50,0%, p=0,977) só reproduz com a janela
09:20–10:40. Rodando sobre o banco inteiro dá outro número (47,6%, p=0,368).
Declarar a janela é o que torna o resultado verificável.
"""
import os
import subprocess
import hashlib
import pandas as pd
import numpy as np


def commit_hash():
    """Hash curto do commit atual, ou 'sem-git'."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return "sem-git"


def carrega_csv(caminho):
    """Carrega book de um CSV com colunas ts,lado,nivel,preco,volume."""
    d = pd.read_csv(caminho, parse_dates=["ts"])
    return _agrega(d)


def carrega_db(inicio, fim, dsn=None):
    """Carrega book do Postgres numa janela. Convenção [inicio, fim) — igual a recorta()."""
    import psycopg2
    dsn = dsn or os.environ.get("MERCADO_DSN")
    if not dsn:
        raise SystemExit(">>> MERCADO_DSN não definido (veja .env.example)")
    q = """
    SELECT ts AT TIME ZONE 'America/Sao_Paulo' AS ts,
           max(CASE WHEN lado=2 THEN preco END)        AS bid,
           min(CASE WHEN lado=1 THEN preco END)        AS ask,
           sum(CASE WHEN lado=2 THEN volume ELSE 0 END) AS vbid,
           sum(CASE WHEN lado=1 THEN volume ELSE 0 END) AS vask,
           max(CASE WHEN lado=2 AND nivel=0 THEN volume END) AS vb1,
           max(CASE WHEN lado=1 AND nivel=0 THEN volume END) AS va1
    FROM book
    WHERE ts AT TIME ZONE 'America/Sao_Paulo' >= %s
      AND ts AT TIME ZONE 'America/Sao_Paulo' <  %s
    GROUP BY ts ORDER BY ts
    """
    conn = psycopg2.connect(dsn)
    d = pd.read_sql(q, conn, params=(str(inicio), str(fim)))
    conn.close()
    if len(d) == 0:
        raise SystemExit(f">>> nenhum snapshot entre {inicio} e {fim}")
    d["ts"] = pd.to_datetime(d.ts)
    S = d.set_index("ts")
    S["mid"] = (S.bid + S.ask) / 2
    S["spread"] = S.ask - S.bid
    S["depth"] = S.vbid + S.vask
    S["obi1"] = (S.vb1 - S.va1) / (S.vb1 + S.va1)
    S["obi5"] = (S.vbid - S.vask) / S.depth
    return S.reset_index()


def _agrega(d):
    """Agrega linhas de book (ts,lado,nivel,preco,volume) em 1 linha por snapshot."""
    if {"bid", "ask"}.issubset(d.columns):
        return d
    g = d.groupby("ts")
    rows = []
    for ts, s in g:
        b = s[s.lado == 2]
        a = s[s.lado == 1]
        if len(b) == 0 or len(a) == 0:
            continue
        bid1, ask1 = b.preco.max(), a.preco.min()
        rows.append({
            "ts": ts,
            "bid": bid1, "ask": ask1,
            "vbid": b.volume.sum(), "vask": a.volume.sum(),
            "vb1": b.loc[b.preco.idxmax(), "volume"],
            "va1": a.loc[a.preco.idxmin(), "volume"],
        })
    S = pd.DataFrame(rows)
    S["mid"] = (S.bid + S.ask) / 2
    S["spread"] = S.ask - S.bid
    S["depth"] = S.vbid + S.vask
    S["obi1"] = (S.vb1 - S.va1) / (S.vb1 + S.va1)
    S["obi5"] = (S.vbid - S.vask) / S.depth
    return S


def recorta(S, inicio, fim):
    """Recorta uma janela com convenção EXPLÍCITA: [inicio, fim) — inicio incluso,
    fim EXCLUSO. A mesma convenção vale para --inicio/--fim na CLI e para o SQL."""
    ini = pd.Timestamp(inicio)
    f = pd.Timestamp(fim)
    m = (S.ts >= ini) & (S.ts < f)
    return S[m].reset_index(drop=True)


def amostra_independente(S, minutos):
    """Índices de 1 observação a cada `minutos`, sem sobreposição de rótulo."""
    t = S.ts.values.astype("datetime64[ns]").astype("int64") / 1e9
    keep, ult = [], -1e18
    for i, ti in enumerate(t):
        if ti - ult >= minutos * 60:
            keep.append(i)
            ult = ti
    return np.array(keep)


def cabecalho(S, inicio, fim, custo=None):
    """Cabeçalho obrigatório: janela, n, commit, custo."""
    dur = (S.ts.max() - S.ts.min()).total_seconds() / 60
    print("=" * 78)
    print(f"  JANELA DECLARADA : {inicio}  ->  {fim}")
    print(f"  DADOS ENCONTRADOS: {S.ts.min():%Y-%m-%d %H:%M} -> {S.ts.max():%H:%M} "
          f"({dur:.1f} min)")
    print(f"  SNAPSHOTS        : {len(S):,}")
    print(f"  COMMIT           : {commit_hash()}")
    if custo is not None:
        print(f"  CUSTO            : {custo} pts")
    print("=" * 78)
    return {"inicio": str(inicio), "fim": str(fim), "snapshots": len(S),
            "duracao_min": round(dur, 1), "commit": commit_hash(), "custo": custo}
