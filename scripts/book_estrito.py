"""TESTE ESTRITO — so observacoes NAO SOBREPOSTAS.

O Newey-West com lag=h atenua a sobreposicao mas nao a elimina quando ha 800
observacoes sobrepostas para cada independente. Aqui eu pego SO as independentes:
uma a cada h minutos. Sem correcao nenhuma — o dado fala por si.
"""
import os
import pandas as pd, numpy as np
import psycopg2
from scipy import stats

DSN = os.environ.get("MERCADO_DSN",
                    "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=CHANGE_ME")
CUSTO, PT_RS = 5.0, 0.20

q = """
SELECT ts,
       max(CASE WHEN lado=2 THEN preco END) AS bid,
       min(CASE WHEN lado=1 THEN preco END) AS ask,
       sum(CASE WHEN lado=2 THEN volume ELSE 0 END) AS vbid,
       sum(CASE WHEN lado=1 THEN volume ELSE 0 END) AS vask
FROM book GROUP BY ts ORDER BY ts
"""
conn = psycopg2.connect(DSN)
S = pd.read_sql(q, conn); conn.close()
S["ts"] = pd.to_datetime(S.ts, utc=True).dt.tz_convert("America/Sao_Paulo").dt.tz_localize(None)
S["mid"] = (S.bid + S.ask)/2
S["obi5"] = (S.vbid - S.vask)/(S.vbid + S.vask)
dur = (S.ts.max()-S.ts.min()).total_seconds()/60
print(f"snapshots: {len(S):,} | {dur:.0f} min | {S.ts.min():%H:%M} a {S.ts.max():%H:%M}")

def amostra_indep(S, minutos):
    """pega 1 obs a cada 'minutos', de verdade (sem sobreposicao de label)."""
    t = S.ts.values.astype("datetime64[ns]").astype("int64")/1e9
    keep, ult = [], -1e18
    for i, ti in enumerate(t):
        if ti - ult >= minutos*60:
            keep.append(i); ult = ti
    return np.array(keep)

print()
print("="*78)
print("  SO OBSERVACOES INDEPENDENTES (sem correcao, sem desculpa)")
print("="*78)
print(f"  {'h':>4}{'n_indep':>9}{'acerto':>8}{'pts/op':>9}{'R$/op':>8}{'t':>8}{'p':>10}{'veredito':>16}")
for mh in (1, 2, 3, 5):
    idx = amostra_indep(S, mh)
    h = int(mh*60/(S.ts.diff().dt.total_seconds().median()))
    fut = S.mid.shift(-h).values
    m = np.isfinite(fut[idx]) & np.isfinite(S.obi5.values[idx])
    ii = idx[m]
    if len(ii) < 5:
        print(f"  {mh:>4}{len(ii):>9}  -- amostra insuficiente"); continue
    dirs = np.sign(S.obi5.values[ii])
    pts = (fut[ii]-S.mid.values[ii])*dirs - CUSTO
    ac = (pts > 0).mean()*100
    if len(pts) > 2 and pts.std(ddof=1) > 0:
        t, p = stats.ttest_1samp(pts, 0)
    else:
        t, p = np.nan, np.nan
    ver = "SINAL" if (p == p and p < 0.05) else "ruido"
    print(f"  {mh:>4}{len(ii):>9}{ac:>7.1f}%{pts.mean():>+9.1f}{pts.mean()*PT_RS:>+8.2f}"
          f"{t:>8.2f}{p:>10.3f}{ver:>16}")

print()
print("="*78)
print("  O MESMO COM LIMIAR DE OBI (so quando o desequilibrio e forte)")
print("="*78)
print(f"  {'h':>4}{'thr':>6}{'n_indep':>9}{'acerto':>8}{'pts/op':>9}{'R$/op':>8}{'p':>10}")
for mh in (1, 2, 3, 5):
    idx = amostra_indep(S, mh)
    h = int(mh*60/(S.ts.diff().dt.total_seconds().median()))
    fut = S.mid.shift(-h).values
    for thr in (0.3, 0.5):
        m = np.isfinite(fut[idx]) & (np.abs(S.obi5.values[idx]) >= thr)
        ii = idx[m]
        if len(ii) < 4:
            print(f"  {mh:>4}{thr:>6.1f}{len(ii):>9}   (insuficiente)"); continue
        dirs = np.sign(S.obi5.values[ii])
        pts = (fut[ii]-S.mid.values[ii])*dirs - CUSTO
        ac = (pts > 0).mean()*100
        t, p = stats.ttest_1samp(pts, 0) if len(pts) > 2 and pts.std(ddof=1) > 0 else (np.nan, np.nan)
        print(f"  {mh:>4}{thr:>6.1f}{len(ii):>9}{ac:>7.1f}%{pts.mean():>+9.1f}{pts.mean()*PT_RS:>+8.2f}{p:>10.3f}")

print()
print("="*78)
print("  CONTROLE — direcao ALEATORIA nos mesmos pontos")
print("="*78)
rng = np.random.default_rng(42)
for mh in (1, 2, 3):
    idx = amostra_indep(S, mh)
    h = int(mh*60/(S.ts.diff().dt.total_seconds().median()))
    fut = S.mid.shift(-h).values
    m = np.isfinite(fut[idx])
    ii = idx[m]
    if len(ii) < 5: continue
    dirs = rng.choice([-1, 1], size=len(ii))
    pts = (fut[ii]-S.mid.values[ii])*dirs - CUSTO
    print(f"  h={mh}min: n={len(ii)} acerto {(pts>0).mean()*100:.0f}% pts/op {pts.mean():+.1f}")

print()
print("="*78)
print("  QUANTO FALTA")
print("="*78)
print(f"  voce tem {dur/60:.1f} h de coleta")
for mh in (1, 3, 5):
    indep = int(dur/mh)
    print(f"    h={mh}min: {indep:>4} independentes | para 800 faltam {max(0,800-indep):>4} "
          f"({max(0,800-indep)*mh/60/9:.1f} sessoes de 9h)")
