"""P0.1 — PROVA: aplicar book_delta_v2 ao snapshot t reproduz o snapshot t+1?

Se o delta estiver correto (chaveado por preco), a reconstrucao fecha exatamente.
Se estiver errado (chaveado por nivel), a soma nao bate.
"""
import os, psycopg2, pandas as pd

conn = psycopg2.connect(os.environ.get("MERCADO_DSN",
      "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=CHANGE_ME"))

q = """SELECT ts, lado, preco, volume FROM book
       WHERE ts >= (SELECT max(ts) - interval '10 minutes' FROM book)
       ORDER BY ts, lado, preco"""
b = pd.read_sql(q, conn)
q2 = """SELECT ts, lado, preco, delta FROM book_delta_v2
        WHERE ts >= (SELECT max(ts) - interval '10 minutes' FROM book_delta_v2)"""
d = pd.read_sql(q2, conn)
conn.close()

S = {t: {(int(r.lado), int(r.preco)): int(r.volume) for r in g.itertuples()}
     for t, g in b.groupby("ts")}
D = {t: {(int(r.lado), int(r.preco)): int(r.delta) for r in g.itertuples()}
     for t, g in d.groupby("ts")}
tss = sorted(S)
print(f"snapshots: {len(tss)} | snapshots com delta: {len(D)}\n")

ok = erro = 0
detalhes = []
for ant, atu in zip(tss, tss[1:]):
    if atu not in D:
        continue
    recon = dict(S[ant])
    for k, dv in D[atu].items():
        novo = recon.get(k, 0) + dv
        if novo <= 0: recon.pop(k, None)
        else: recon[k] = novo
    if recon == S[atu]:
        ok += 1
    else:
        erro += 1
        if len(detalhes) < 3:
            faltando = {k: S[atu].get(k) for k in set(recon) | set(S[atu]) if recon.get(k) != S[atu].get(k)}
            detalhes.append((ant, faltando))

tot = ok + erro
print("="*70)
print(f"  IDA E VOLTA: {ok}/{tot} snapshots reconstruidos exatamente")
print("="*70)
if erro:
    print(f"  {erro} falhas. exemplos:")
    for ant, dif in detalhes:
        print(f"    {pd.Timestamp(ant)}: {list(dif.items())[:4]}")
else:
    print("  O delta por preco reproduz o estado seguinte em 100% dos casos testados.")
    print("  Isso PROVA que o chaveamento por preco esta correto.")
