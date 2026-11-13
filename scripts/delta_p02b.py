"""P0.2 v3 — execucao vs cancelamento, atribuindo cada negocio ao LADO atingido.

ERROS CORRIGIDOS:
  v1: aplicava min(|delta|, negocio_total_do_preco) a CADA evento -> inflava pelo
      numero de eventos (dava 97,3%, impossivel).
  v2: atribuia o mesmo volume negociado aos dois lados -> contava 2x (execucao
      339.918 contra 170.359 negociados).

CORRETO: um negocio a mercado atinge UM lado passivo. Sem flags de agressor, infiro
pela regra do tick (Lee-Ready): se last >= ask, o agressor comprou e removeu do ASK;
se last <= bid, removeu do BID; no meio, sem classificacao.
"""
import psycopg2, pandas as pd
from collections import defaultdict

DSN = "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local"
conn = psycopg2.connect(DSN)
f = lambda x: f"{x:,.0f}".replace(",", " ")

# --- deltas por preco (como no P0.1)
d = pd.read_sql("SELECT ts, lado, preco, volume FROM book ORDER BY ts, lado, preco", conn)
S = {ts: {(int(r.lado), int(r.preco)): int(r.volume) for r in g.itertuples()}
     for ts, g in d.groupby("ts")}
tss = sorted(S)
linhas = []
for ant, atu in zip(tss, tss[1:]):
    A, B = S[ant], S[atu]
    for k, v in B.items():
        va = A.get(k)
        if va is None: linhas.append((atu, k[0], k[1], v, "entrou_janela"))
        elif v != va:  linhas.append((atu, k[0], k[1], v-va, "vol_up" if v > va else "vol_down"))
    for k, v in A.items():
        if k not in B: linhas.append((atu, k[0], k[1], -v, "saiu_janela"))
D = pd.DataFrame(linhas, columns=["ts","lado","preco","delta","evento"])

# --- negocios, atribuidos ao lado atingido (regra do tick)
T = pd.read_sql("SELECT bid, ask, last, volume FROM tick WHERE last > 0", conn)
exec_por_lado_preco = defaultdict(int)
sem_class = 0
for r in T.itertuples():
    p = int(round(r.last / 5) * 5)
    if r.last >= r.ask:      exec_por_lado_preco[(1, p)] += r.volume   # agressor comprou -> atinge ASK
    elif r.last <= r.bid:    exec_por_lado_preco[(2, p)] += r.volume   # agressor vendeu -> atinge BID
    else:                    sem_class += r.volume
exec_total = sum(exec_por_lado_preco.values())

print(f"snapshots: {len(tss):,} | deltas: {len(D):,}")
print(f"negocios: {f(T.volume.sum())} contratos")
print(f"  atribuidos: {f(exec_total)} | sem classificacao (no meio): {f(sem_class)}")
print()

print("="*76)
print("  P0.2 — EXECUCAO vs CANCELAMENTO (por lado e preco)")
print("="*76)
tot_dn = tot_exec = 0
por_lado = {}
for (lado, preco), g in D[D.evento=="vol_down"].groupby(["lado","preco"]):
    dn = abs(int(g.delta.sum()))
    atingido = exec_por_lado_preco.get((lado, preco), 0)
    ex = min(dn, atingido)
    tot_dn += dn; tot_exec += ex
    d_ = por_lado.setdefault(lado, {"dn":0,"ex":0})
    d_["dn"] += dn; d_["ex"] += ex

print(f"\n  removido em vol_down:   {f(tot_dn):>14}")
print(f"  atribuivel a execucao:  {f(tot_exec):>14}  ({100*tot_exec/tot_dn:.1f}%)")
print(f"  residuo (cancelamento): {f(tot_dn-tot_exec):>14}  ({100*(1-tot_exec/tot_dn):.1f}%)")
print(f"\n  SANIDADE: execucao ({f(tot_exec)}) <= negociado atribuido ({f(exec_total)})? "
      f"{'OK' if tot_exec <= exec_total else 'FALHA'}")

print("\n  por lado:")
for lado in (2, 1):
    v = por_lado.get(lado)
    if not v: continue
    print(f"    {'BID' if lado==2 else 'ASK'}: removido {f(v['dn']):>10} | execucao {f(v['ex']):>10} ({100*v['ex']/v['dn']:.0f}%)")

print()
print("="*76)
print("  NUMERO DO README: antes vs depois")
print("="*76)
sub = D[D.evento.isin(["vol_up","vol_down"])]
churn = abs(sub[sub.delta>0].delta.sum()) + abs(sub[sub.delta<0].delta.sum())
visivel = abs(D.delta).sum()
print(f"  README antigo dizia:   '~97% churn' (delta por NIVEL — invalido)")
print(f"  Agora (delta por preco):")
print(f"    movimentacao total:  {f(visivel)}")
print(f"    churn (vol_up+down): {f(churn)}  = {100*churn/visivel:.0f}%")
print(f"    execucao:            {f(tot_exec)}  = {100*tot_exec/churn:.1f}% do churn")
print(f"    cancelamento:        {f(churn-tot_exec)}  = {100*(churn-tot_exec)/churn:.1f}% do churn")
print(f"\n  -> o churn NAO e 97%. E {100*churn/visivel:.0f}% da movimentacao, e o resto e")
print(f"     preco entrando/saindo da janela de 5 niveis (nao e ordem, e amostragem).")
conn.close()
