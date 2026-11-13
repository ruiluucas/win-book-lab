"""P0.3 — inferir o lado agressor (Lee-Ready) porque NAO existe flag do servidor.

TESTADO E CONFIRMADO: copy_ticks_from retorna 0 em WINZ26 para 1, 5, 15 e 60 min,
com COPY_TICKS_ALL e COPY_TICKS_TRADE. As constantes existem (TICK_FLAG_BUY=32,
SELL=64, LAST=8, VOLUME=16) mas nao ha dado para consumir — a conta BTG nao guarda
historico de tick, nem do presente imediato.

Entao o agressor e INFERIDO pela regra do tick:
  last >= ask  -> comprador agressivo (removeu do ASK)  -> lado_inferido = +1
  last <= bid  -> vendedor agressivo (removeu do BID)   -> lado_inferido = -1
  no meio      -> indefinido                            -> lado_inferido =  0

LIMITACAO: no meio do spread nao ha informacao. E negocios que atravessam varios
niveis (sweep) sao classificados pelo preco do negocio, nao pelo nivel atingido.
"""
import psycopg2, pandas as pd

DSN = "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local"
conn = psycopg2.connect(DSN); cur = conn.cursor()

cur.execute("SELECT count(*) FROM tick WHERE last > 0 AND lado_inferido IS NULL")
print(f"ticks a classificar: {cur.fetchone()[0]:,}")

cur.execute("""
UPDATE tick SET lado_inferido =
  CASE WHEN last >= ask THEN 1
       WHEN last <= bid THEN -1
       ELSE 0 END
WHERE last > 0 AND lado_inferido IS NULL
""")
conn.commit()
print(f"classificados: {cur.rowcount:,}")

cur.execute("""
SELECT lado_inferido, count(*) n, sum(volume) vol
FROM tick WHERE last > 0 GROUP BY 1 ORDER BY 1 DESC
""")
print("\n  distribuicao:")
tot_n = tot_v = 0
for lado, n, vol in cur.fetchall():
    nome = {1:"comprador agressor", -1:"vendedor agressor", 0:"indefinido (no meio)"}.get(lado, str(lado))
    print(f"    {nome:<22} {n:>7,} ticks | {vol:>10,.0f} contratos")
    tot_n += n; tot_v += vol or 0
print(f"    {'TOTAL':<22} {tot_n:>7,} ticks | {tot_v:>10,.0f} contratos")

cur.execute("SELECT count(*) FROM tick WHERE last > 0 AND lado_inferido = 0")
indef = cur.fetchone()[0]
print(f"\n  indefinidos: {indef:,} ({100*indef/tot_n:.1f}%) — negocios no meio do spread")
print("  (nao da para classificar sem flag do servidor)")
conn.close()
