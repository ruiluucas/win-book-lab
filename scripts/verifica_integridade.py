"""P0.5 — INVARIANTES DO DADO. Sai com codigo != 0 se algo falhar.

Roda sobre os dados que existem no banco. Cada verificacao imprime PASS/FAIL com o
numero medido. Serve de porteiro: nada entra na analise sem passar aqui.

Verificacoes:
  1. linhas por snapshot (esperado 10: 5 niveis x 2 lados)
  2. melhor bid < melhor ask em todo snapshot
  3. spread >= 5 e multiplo de 5
  4. precos na grade de 5 pts e volumes inteiros > 0
  5. ts monotonicamente crescente por simbolo
  6. gaps > 500 ms entre snapshots consecutivos
  7. todos os ts dentro do pregao (09:00-18:30 BRT)
  8. snapshots identicos consecutivos (duplicata do coletor?)
  9. IDA E VOLTA: aplicar book_delta_v2 ao snapshot t reproduz o snapshot t+1
"""
import sys, psycopg2, pandas as pd, numpy as np

DSN = "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local"
conn = psycopg2.connect(DSN)
f = lambda x: f"{x:,.0f}".replace(",", " ")
falhas = []

def check(nome, ok, detalhe):
    print(f"  [{'PASS' if ok else 'FAIL'}] {nome:<44} {detalhe}")
    if not ok: falhas.append(nome)

print("="*88)
print("  VERIFICACAO DE INTEGRIDADE — book / book_delta_v2 / tick")
print("="*88)

# 1. linhas por snapshot
q = "SELECT ts AT TIME ZONE 'America/Sao_Paulo' AS ts, count(*) n FROM book GROUP BY ts"
d = pd.read_sql(q, conn)
dist = d.n.value_counts().sort_index()
print(f"\n1. LINHAS POR SNAPSHOT  (snapshots: {len(d):,})")
for n, c in dist.items():
    print(f"     {n} linhas -> {c:,} snapshots")
check("1. todos com 10 linhas", set(dist.index) == {10},
      f"distintos: {sorted(dist.index)}")

# 2. melhor bid < melhor ask
q = """SELECT ts AT TIME ZONE 'America/Sao_Paulo' AS ts,
              max(CASE WHEN lado=2 THEN preco END) bid,
              min(CASE WHEN lado=1 THEN preco END) ask
       FROM book GROUP BY ts"""
m = pd.read_sql(q, conn)
cruz = (m.bid >= m.ask).sum()
check("2. bid < ask em todo snapshot", cruz == 0, f"{cruz} violacoes")

# 3. spread
m["spread"] = m.ask - m.bid
mau = ((m.spread < 5) | (m.spread % 5 != 0)).sum()
print(f"\n3. SPREAD: min {m.spread.min():.0f} | mediano {m.spread.median():.0f} | max {m.spread.max():.0f}")
check("3. spread >= 5 e multiplo de 5", mau == 0, f"{mau} violacoes")

# 4. grade de 5 e volumes
q = """SELECT count(*) FILTER (WHERE CAST(preco AS numeric) % 5 != 0) fora_grade,
              count(*) FILTER (WHERE volume <= 0) vol_zero,
              count(*) FILTER (WHERE volume != floor(volume)) vol_frac
       FROM book"""
cur = conn.cursor(); cur.execute(q)
fora, vz, vf = cur.fetchone()
check("4a. precos na grade de 5 pts", fora == 0, f"{fora} fora")
check("4b. volumes > 0", vz == 0, f"{vz} zerados")
check("4c. volumes inteiros", vf == 0, f"{vf} fracionarios")

# 5. ts monotono
q = "SELECT ts AT TIME ZONE 'America/Sao_Paulo' AS ts FROM book GROUP BY ts ORDER BY ts"
ts = pd.read_sql(q, conn).ts
check("5. ts crescente", ts.is_monotonic_increasing,
      f"{len(ts):,} snapshots")

# 6. gaps
gaps = ts.diff().dt.total_seconds()
grandes = gaps[gaps > 0.5]
check("6. gaps <= 500 ms", len(grandes) == 0,
      f"{len(grandes)} gaps | maior {gaps.max():.1f}s")

# 7. dentro do pregao
h = ts.dt.hour + ts.dt.minute/60
fora_pregao = ((h < 9.0) | (h > 18.5)).sum()
check("7. ts dentro de 09:00-18:30", fora_pregao == 0,
      f"{fora_pregao} fora | faixa {h.min():.2f}h-{h.max():.2f}h")

# 8. snapshots identicos consecutivos
q = """SELECT ts AT TIME ZONE 'America/Sao_Paulo' AS ts, lado, nivel, preco, volume FROM book ORDER BY ts, lado, nivel"""
b = pd.read_sql(q, conn)
assinaturas = b.groupby("ts").apply(
    lambda g: tuple(zip(g.lado, g.preco, g.volume)), include_groups=False)
rep = (assinaturas.values[1:] == assinaturas.values[:-1]).sum()
check("8. sem snapshots duplicados consecutivos", rep == 0,
      f"{rep} repeticoes de {len(assinaturas):,}")

# 9. IDA E VOLTA
print("\n9. IDA E VOLTA — aplicar delta ao snapshot t reproduz t+1?")
q = """SELECT ts, lado, preco, volume FROM book
       WHERE ts IN (SELECT DISTINCT ts FROM book ORDER BY ts DESC LIMIT 400)
       ORDER BY ts, lado, preco"""
b400 = pd.read_sql(q, conn)
S = {t: {(int(r.lado), int(r.preco)): int(r.volume)
         for r in g.itertuples()} for t, g in b400.groupby("ts")}
tss = sorted(S)

q2 = """SELECT ts, lado, preco, vol_antes, vol_agora, delta, evento
        FROM book_delta_v2
        WHERE ts IN (SELECT DISTINCT ts FROM book_delta_v2 ORDER BY ts DESC LIMIT 400)"""
try:
    dl = pd.read_sql(q2, conn)
except Exception:
    dl = pd.DataFrame()

if dl.empty:
    print("     book_delta_v2 vazia — o coletor v4 ainda grava na tabela antiga")
    check("9. ida e volta", False, "sem delta por preco para testar")
else:
    D = {}
    for ts, g in dl.groupby("ts"):
        D[ts] = {(int(r.lado), int(r.preco)): int(r.delta) for r in g.itertuples()}
    ok_volta = erro = 0
    for ant, atu in zip(tss, tss[1:]):
        if ant not in D: continue
        recon = dict(S[ant])
        for k, dv in D[ant].items():
            recon[k] = recon.get(k, 0) + dv
            if recon[k] <= 0: recon.pop(k, None)
        if recon == S[atu]: ok_volta += 1
        else: erro += 1
    tot = ok_volta + erro
    check("9. ida e volta", erro == 0,
          f"{ok_volta}/{tot} snapshots reconstruidos" if tot else "sem pares")

print("\n" + "="*88)
if falhas:
    print(f"  RESULTADO: {len(falhas)} FALHA(S) -> {', '.join(falhas)}")
    print("="*88)
    sys.exit(1)
print("  RESULTADO: TODAS AS VERIFICACOES PASSARAM")
print("="*88)
conn.close()
