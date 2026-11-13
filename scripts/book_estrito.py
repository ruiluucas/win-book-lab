"""Régua honesta: só observações NÃO SOBREPOSTAS.

E1.1: a janela é OBRIGATÓRIA. Sem ela o resultado não é reproduzível — rodar sobre o
banco inteiro dá número diferente de rodar sobre a janela de um estudo.

Uso:
  python scripts/book_estrito.py --inicio "2026-11-13 09:20" --fim "2026-11-13 10:40"
  python scripts/book_estrito.py --csv tests/fixtures/book_2min.csv   # sem banco
"""
import argparse, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy import stats
from analisador import (carrega_db, carrega_csv, amostra_independente, cabecalho)

CUSTO = 5.0      # E1.2 ainda não aplicado — mantido para reproduzir o resultado de 13/11
PT_RS = 0.20


def main():
    ap = argparse.ArgumentParser(
        description="Régua estrita. A janela é obrigatória (E1.1).")
    ap.add_argument("--inicio", help="ISO, ex: '2026-11-13 09:20'")
    ap.add_argument("--fim", help="ISO, ex: '2026-11-13 10:40'")
    ap.add_argument("--csv", help="fixture CSV em vez do banco (roda sem Postgres)")
    a = ap.parse_args()

    if a.csv:
        S = carrega_csv(a.csv)
        meta = cabecalho(S, "csv", a.csv, CUSTO)
    elif a.inicio and a.fim:
        S = carrega_db(a.inicio, a.fim)
        meta = cabecalho(S, a.inicio, a.fim, CUSTO)
    else:
        print(">>> ERRO: janela obrigatória.", file=sys.stderr)
        print("    use --inicio e --fim (banco) ou --csv (fixture)", file=sys.stderr)
        sys.exit(2)

    print()
    print("=" * 78)
    print("  SÓ OBSERVAÇÕES INDEPENDENTES (sem correção, sem desculpa)")
    print("=" * 78)
    print(f"  {'h':>4}{'n_indep':>9}{'acerto':>8}{'pts/op':>9}{'R$/op':>8}"
          f"{'t':>8}{'p':>10}{'veredito':>14}")
    for mh in (1, 2, 3, 5):
        idx = amostra_independente(S, mh)
        dt = S.ts.diff().dt.total_seconds().median()
        h = max(1, int(mh * 60 / dt))
        fut = S.mid.shift(-h).values
        m = np.isfinite(fut[idx]) & np.isfinite(S.obi5.values[idx])
        ii = idx[m]
        if len(ii) < 5:
            print(f"  {mh:>4}{len(ii):>9}  -- amostra insuficiente")
            continue
        pts = (fut[ii] - S.mid.values[ii]) * np.sign(S.obi5.values[ii]) - CUSTO
        ac = (pts > 0).mean() * 100
        if len(pts) > 2 and pts.std(ddof=1) > 0:
            t, p = stats.ttest_1samp(pts, 0)
        else:
            t, p = np.nan, np.nan
        ver = "SINAL" if (p == p and p < 0.05) else "ruido"
        print(f"  {mh:>4}{len(ii):>9}{ac:>7.1f}%{pts.mean():>+9.1f}{pts.mean()*PT_RS:>+8.2f}"
              f"{t:>8.2f}{p:>10.3f}{ver:>14}")
    print()
    print(f"  (teste t bicaudal — E2.6 vai parametrizar unicaudal)")
    return meta


if __name__ == "__main__":
    main()
