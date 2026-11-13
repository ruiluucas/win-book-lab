"""P0-2 — método CORRIGIDO: horizonte por tempo real, com tolerância declarada.

CONVIVE com book_estrito.py (metodo antigo, por linhas), que NAO foi alterado.
Rode os dois na mesma janela para comparar.

Uso:
  python scripts/book_tempo.py --inicio "2026-11-13 09:20" --fim "2026-11-13 10:40"
  python scripts/book_tempo.py --csv tests/fixtures/book_20min.csv
"""
import argparse, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from analisador import carrega_db, carrega_csv, cabecalho
from tempo import mede, intervalo_nominal

CUSTO = 5.0   # NAO alterado nesta etapa (custo e P0-3)
PT_RS = 0.20


def linha(d):
    return (f"  {d['fator']:>4.0f}x {d['limite_s']*1000:>8.0f}ms "
            f"{d['n_valido']:>7}{d['n_sem_futuro']:>9}{d['n_atraso_excessivo']:>9} "
            f"{d['cobertura']*100:>7.1f}% {d['h_real_mediana']:>8.3f} "
            f"{d['bruto_medio']:>+9.1f} {d['bruto_medio']-CUSTO:>+9.1f}")


def main():
    ap = argparse.ArgumentParser(description="Horizonte por TEMPO (P0-2)")
    ap.add_argument("--inicio"); ap.add_argument("--fim"); ap.add_argument("--csv")
    ap.add_argument("--fator", type=float, default=2.0, help="1, 2 ou 5 (default 2)")
    a = ap.parse_args()

    if a.csv:
        S = carrega_csv(a.csv); cabecalho(S, "csv", a.csv, CUSTO)
    elif a.inicio and a.fim:
        S = carrega_db(a.inicio, a.fim); cabecalho(S, a.inicio, a.fim, CUSTO)
    else:
        print(">>> ERRO: janela obrigatoria (--inicio/--fim ou --csv)", file=sys.stderr)
        sys.exit(2)

    nominal = intervalo_nominal(S.ts)
    print()
    print("=" * 100)
    print(f"  REGRA TEMPORAL  nominal = mediana(dt) da janela = {nominal*1000:.1f} ms")
    print(f"                  limite  = fator x nominal | valida se atraso <= limite (INCLUSIVO)")
    print("=" * 100)

    # sensibilidade 1x / 2x / 5x
    print()
    print("  SENSIBILIDADE DE LIMITE")
    print(f"  {'fat':>5} {'limite':>9} {'validas':>7} {'sem fut':>9} {'atraso>':>9} "
          f"{'cobert':>8} {'h_real':>8} {'bruto':>9} {'liquido':>9}")
    for f in (1, 2, 5):
        d = mede(S, 3, fator=f)
        print(linha(d))

    # detalhe do fator escolhido
    print()
    d2 = mede(S, 3, fator=a.fator)
    print(f"  DETALHE (fator {a.fator:.0f}x, h=3 min)")
    print(f"    nominal              : {d2['nominal_s']*1000:.1f} ms")
    print(f"    limite               : {d2['limite_s']*1000:.1f} ms")
    print(f"    base (independentes) : {d2['n_base']}")
    print(f"    validas              : {d2['n_valido']}  (cobertura {d2['cobertura']*100:.1f}%)")
    print(f"    descartadas          : {d2['n_sem_futuro']} sem futuro + "
          f"{d2['n_atraso_excessivo']} atraso > limite")
    print(f"    atraso mediano       : {d2['atraso_mediano_s']*1000:.1f} ms")
    print(f"    atraso p95 / max     : {d2['atraso_p95_s']*1000:.0f} / {d2['atraso_max_s']*1000:.0f} ms")
    print(f"    horizonte realizado  : mediana {d2['h_real_mediana']:.3f} min "
          f"(p05 {d2['h_real_p05']:.3f}, p95 {d2['h_real_p95']:.3f})")
    print(f"    bruto / liquido      : {d2['bruto_medio']:+.2f} / "
          f"{d2['bruto_medio']-CUSTO:+.2f} pts/op")
    print(f"    acerto bruto         : {d2['acerto']*100:.1f}%")

    # horizontes
    print()
    print(f"  POR HORIZONTE (fator {a.fator:.0f}x)")
    print(f"  {'h':>3} {'validas':>8} {'cobert':>8} {'h_real':>8} {'bruto':>9} {'liquido':>9}")
    for mh in (1, 2, 3, 5):
        d = mede(S, mh, fator=a.fator)
        print(f"  {mh:>3} {d['n_valido']:>8}{d['cobertura']*100:>7.1f}% "
              f"{d['h_real_mediana']:>8.3f}{d['bruto_medio']:>+9.1f}"
              f"{d['bruto_medio']-CUSTO:>+9.1f}")
    print()
    print("  Custo 5,0 mantido (P0-3). Metodo antigo: python scripts/book_estrito.py")


if __name__ == "__main__":
    main()
