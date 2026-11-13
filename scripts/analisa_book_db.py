"""ANALISADOR DO BOOK — consulta o banco e mede o que importa.

Uso:
  python scripts/analisa_book_db.py                      # tudo que existe
  python scripts/analisa_book_db.py --dia 2026-11-13
  python scripts/analisa_book_db.py --minimo 30           # so roda com 30+ min

Mede:
  1. o que o book diz (spread, depth, OBI)
  2. OBI antecipa direcao? (correlacao + acerto por horizonte)
  3. desequilibrio extremo antecipa movimento grande?
  4. P&L com t corrigido (Newey-West) + numero de obs INDEPENDENTES
"""
import argparse
import os
import pandas as pd, numpy as np
import psycopg2

DSN = os.environ.get("MERCADO_DSN",
                    "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=CHANGE_ME")
CUSTO, PT_RS = 5.0, 0.20

def carrega(dia=None):
    q = """
    SELECT ts, symbol,
           max(CASE WHEN lado=2 THEN preco END) AS bid,
           min(CASE WHEN lado=1 THEN preco END) AS ask,
           sum(CASE WHEN lado=2 THEN volume ELSE 0 END) AS vbid,
           sum(CASE WHEN lado=1 THEN volume ELSE 0 END) AS vask,
           max(CASE WHEN lado=2 AND nivel=0 THEN volume END) AS vb1,
           min(CASE WHEN lado=1 AND nivel=0 THEN volume END) AS va1
    FROM book
    {filtro}
    GROUP BY ts, symbol
    ORDER BY ts
    """
    filtro = f"WHERE ts::date = '{dia}'" if dia else ""
    conn = psycopg2.connect(DSN)
    d = pd.read_sql(q.format(filtro=filtro), conn)
    conn.close()
    d["ts"] = pd.to_datetime(d["ts"], utc=True).dt.tz_convert("America/Sao_Paulo").dt.tz_localize(None)
    d["mid"] = (d.bid + d.ask) / 2
    d["spread"] = d.ask - d.bid
    d["depth"] = d.vbid + d.vask
    d["obi1"] = (d.vb1 - d.va1) / (d.vb1 + d.va1)
    d["obi5"] = (d.vbid - d.vask) / d.depth
    return d

def nw_t(x, lag):
    x = np.asarray(x, float); n = len(x)
    if n < 20: return np.nan, False
    e = x - x.mean()
    v = float((e*e).sum())/n
    for L in range(1, int(lag)+1):
        if L >= n: break
        v += 2.0*(1.0 - L/(lag+1.0))*float((e[L:]*e[:-L]).sum())/n
    if v <= 1e-12: return np.nan, False
    return x.mean()/np.sqrt(v/n), True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dia", default=None)
    ap.add_argument("--minimo", type=int, default=0, help="minutos minimos para rodar")
    a = ap.parse_args()

    S = carrega(a.dia)
    if len(S) < 10:
        print("sem dados suficientes"); return
    dt = S.ts.diff().dt.total_seconds().median()
    dur = (S.ts.max()-S.ts.min()).total_seconds()/60
    print(f"snapshots: {len(S):,} | {S.ts.min():%d/%m %H:%M:%S} a {S.ts.max():%H:%M:%S} | {dur:.1f} min")
    print(f"intervalo mediano: {dt*1000:.0f} ms | symbol: {S.symbol.iloc[0]}")
    if a.minimo and dur < a.minimo:
        print(f"\n>>> {dur:.0f} min < {a.minimo} min pedidos. Rode de novo depois."); return

    print(f"\n{'='*78}")
    print("  1. O QUE O BOOK DIZ")
    print(f"{'='*78}")
    print(f"  spread    mediano {S.spread.median():.0f} | p90 {S.spread.quantile(.9):.0f}")
    print(f"  depth     mediano {S.depth.median():.0f} | p10 {S.depth.quantile(.1):.0f} | p90 {S.depth.quantile(.9):.0f}")
    print(f"  OBI_1     media {S.obi1.mean():+.3f} | desvio {S.obi1.std():.3f}")
    print(f"  OBI_5     media {S.obi5.mean():+.3f} | desvio {S.obi5.std():.3f}")
    print(f"  OBI extremo (|>0,5|): {(S.obi5.abs()>0.5).mean()*100:.1f}% do tempo")

    print(f"\n{'='*78}")
    print("  2. OBI ANTECIPA A DIRECAO?")
    print(f"{'='*78}")
    print(f"  {'h':>5}{'n':>7}{'corr':>9}{'acerto':>8}{'p':>10}{'indep':>7}")
    from scipy import stats
    for mh in (1, 2, 3, 5, 10, 15):
        h = max(1, int(mh*60/dt))
        fut = S.mid.shift(-h) - S.mid
        ok = fut.notna() & S.obi5.notna()
        if ok.sum() < 50: continue
        r, p = stats.pearsonr(S.obi5[ok], fut[ok])
        z = ok & (fut != 0)
        ac = (np.sign(S.obi5[z]) == np.sign(fut[z])).mean()*100
        print(f"  {mh:>3}min{ok.sum():>7}{r:>+9.4f}{ac:>7.1f}%{p:>10.1e}{int(dur/mh):>7}")

    print(f"\n{'='*78}")
    print("  3. DESEQUILIBRIO EXTREMO -> MOVIMENTO GRANDE?")
    print(f"{'='*78}")
    h5 = max(1, int(300/dt))
    print(f"  {'|OBI5|':>10}{'n':>8}{'|mov| 1min':>12}{'|mov| 5min':>12}")
    for lo, hi in [(0,.2),(.2,.4),(.4,.6),(.6,.8),(.8,1.01)]:
        m = S.obi5.abs().between(lo, hi, inclusive="left")
        if m.sum() < 20: continue
        f1 = (S.mid.shift(-max(1,int(60/dt)))-S.mid)[m].abs().mean()
        f5 = (S.mid.shift(-h5)-S.mid)[m].abs().mean()
        print(f"  {lo:.1f}–{hi:.1f}{m.sum():>8,}{f1:>12.1f}{f5:>12.1f}")

    print(f"\n{'='*78}")
    print("  4. P&L (t corrigido) — ler o numero de obs INDEPENDENTES")
    print(f"{'='*78}")
    print(f"  {'h':>4}{'thr':>6}{'n':>7}{'indep':>7}{'pts/op':>9}{'R$/op':>8}{'acerto':>8}{'t_nw':>8}")
    for mh in (1, 2, 3, 5):
        h = max(1, int(mh*60/dt))
        fut = S.mid.shift(-h) - S.mid
        for thr in (0.0, 0.3, 0.5):
            m = fut.notna().values & (np.abs(S.obi5.values) >= thr)
            if m.sum() < 50: continue
            pts = fut.values[m]*np.sign(S.obi5.values[m]) - CUSTO
            t, ok = nw_t(pts, lag=h)
            print(f"  {mh:>4}{thr:>6.1f}{m.sum():>7,}{int(dur/mh):>7}{pts.mean():>+9.1f}"
                  f"{pts.mean()*PT_RS:>+8.2f}{(pts>0).mean()*100:>7.1f}%"
                  f"{(f'{t:.2f}' if ok else '--'):>8}")

    print(f"\n  REGRA: detectar 55% vs 50% com p<0.05 e poder 80% exige ~800 eventos INDEPENDENTES.")
    print(f"         com h=3min: {800*3/60:.0f} h de coleta = {800*3/60/9:.0f} sessoes completas.")
    print(f"         voce tem: {dur/60:.1f} h -> {int(dur/3):.0f} eventos independentes em h=3min")

if __name__ == "__main__":
    main()
