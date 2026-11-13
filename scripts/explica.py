"""ABRE O CAPO — dado cru, calculo, decisao, resultado. Nada escondido."""
import os
import pandas as pd, numpy as np, psycopg2

DSN = os.environ.get("MERCADO_DSN",
                    "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=CHANGE_ME")
# P0-3: fonte unica em parametros.py (antes era 5.0 hardcoded aqui)
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from parametros import CUSTO_HISTORICO_2026_11_13 as CUSTO, PT_RS
conn = psycopg2.connect(DSN); cur = conn.cursor()

print("="*78); print("  PASSO 1 — O DADO CRU (tabela book, 10 linhas por instante)"); print("="*78)
cur.execute("SELECT ts FROM book GROUP BY ts ORDER BY ts OFFSET 5000 LIMIT 1")
ts_alvo = cur.fetchone()[0]
cur.execute("SELECT lado,nivel,preco,volume FROM book WHERE ts=%s ORDER BY lado DESC,nivel",(ts_alvo,))
linhas = cur.fetchall()
print(f"\n  snapshot de {ts_alvo:%H:%M:%S}")
print(f"  {'lado':>12}{'nivel':>7}{'preco':>10}{'volume':>9}")
for lado,nivel,preco,vol in linhas:
    print(f"  {('BUY' if lado==2 else 'SELL'):>12}{nivel:>7}{preco:>10.0f}{vol:>9.0f}")
print("\n  -> e TUDO que o banco guarda de cada instante.")

b=[(p,v) for l,n,p,v in linhas if l==2]; a=[(p,v) for l,n,p,v in linhas if l==1]
bid,ask = max(p for p,v in b), min(p for p,v in a)
vb,va = sum(v for p,v in b), sum(v for p,v in a)
obi = (vb-va)/(vb+va)

print("\n"+"="*78); print("  PASSO 2 — Como essas 10 linhas viram 1 numero (OBI_5)"); print("="*78)
print(f"\n  melhor bid = max(dos {len(b)} precos BUY)   = {bid:.0f}")
print(f"  melhor ask = min(dos {len(a)} precos SELL)  = {ask:.0f}")
print(f"  mid        = ({bid:.0f}+{ask:.0f})/2          = {(bid+ask)/2:.1f}")
print(f"  spread     = {ask:.0f} - {bid:.0f}                  = {ask-bid:.0f} pts")
print(f"\n  volume total BUY  = {vb:.0f}")
print(f"  volume total SELL = {va:.0f}")
print(f"\n  OBI_5 = (BUY - SELL)/(BUY + SELL) = ({vb:.0f} - {va:.0f})/{vb+va:.0f} = {obi:+.4f}")
print("\n  OBI > 0 -> mais gente querendo COMPRAR -> pressao de ALTA")

print("\n"+"="*78); print("  PASSO 3 — A REGRA decide com esse numero"); print("="*78)
print("\n  REGRA: se |OBI_5| >= limiar, entra NA DIRECAO do OBI.")
print(f"\n  aqui OBI_5 = {obi:+.4f}")
for thr in (0.0,0.3,0.5):
    passa = abs(obi)>=thr
    lado = "COMPRA" if obi>0 else "VENDA"
    print(f"    limiar {thr:.1f} -> {'ENTRA ('+lado+')' if passa else 'NAO ENTRA'}")

q = """SELECT ts,
       max(CASE WHEN lado=2 THEN preco END) AS bid,
       min(CASE WHEN lado=1 THEN preco END) AS ask,
       sum(CASE WHEN lado=2 THEN volume ELSE 0 END) AS vbid,
       sum(CASE WHEN lado=1 THEN volume ELSE 0 END) AS vask
FROM book GROUP BY ts ORDER BY ts"""
S = pd.read_sql(q, conn); conn.close()
S["ts"]=pd.to_datetime(S.ts); S["mid"]=(S.bid+S.ask)/2
S["obi5"]=(S.vbid-S.vask)/(S.vbid+S.vask)
dt = S.ts.diff().dt.total_seconds().median(); h = max(1,int(180/dt))

print("\n"+"="*78); print(f"  PASSO 4 — Como vira resultado (3 min = {h} snapshots)"); print("="*78)
t = S.ts.values.astype("datetime64[ns]").astype("int64")/1e9
keep,ult = [],-1e18
for i,ti in enumerate(t):
    if ti-ult>=180: keep.append(i); ult=ti
idx=np.array(keep); fortes=idx[np.abs(S.obi5.values[idx])>=0.3][:3]
print(f"\n  {'#':>2}{'hora':>10}{'OBI':>9}{'lado':>8}{'mid entra':>11}{'mid sai':>9}{'bruto':>8}{'custo':>7}{'liquido':>9}{'R$':>9}")
soma=0.0
for n,i in enumerate(fortes,1):
    j=i+h
    if j>=len(S): continue
    ob=S.obi5.iloc[i]; lado=1 if ob>0 else -1
    m_in,m_out=S.mid.iloc[i],S.mid.iloc[j]
    bruto=(m_out-m_in)*lado; liq=bruto-CUSTO; soma+=liq
    print(f"  {n:>2}{S.ts.iloc[i]:%H:%M:%S}{ob:>+9.3f}{('COMPRA' if lado>0 else 'VENDA'):>8}{m_in:>11.1f}{m_out:>9.1f}{bruto:>+8.1f}{-CUSTO:>7.0f}{liq:>+9.1f}{liq*PT_RS:>+9.2f}")
if len(fortes): print(f"\n  media liquida: {soma/len(fortes):+.1f} pts = R$ {soma/len(fortes)*PT_RS:+.2f}/op")

print("""
  LENDO UMA LINHA:
    OBI +0,42 -> volume comprado 42% maior -> regra COMPRA
    mid entra 174.320 e sai 174.380 -> andou +60 pts A FAVOR
    bruto +60 - 5 custo = +55 liquidos = R$ +11,00
    se andasse 60 CONTRA: -60 - 5 = -65 pts = R$ -13,00
""")
print("="*78); print("  TUDO QUE ENTRA NO CALCULO"); print("="*78)
print("""
  FEATURE   OBI_5 = (vol BUY - vol SELL)/total, das 10 linhas do book a cada ~175ms
  ALVO      movimento do MID em h minutos; mid = (melhor bid + melhor ask)/2
  DECISAO   entra na direcao do OBI quando |OBI| >= limiar
  RESULTADO (mid_sai - mid_entra) * direcao - 5 pts custo
  AMOSTRA   1 entrada a cada h minutos  <- sem isso o t mente
""")
