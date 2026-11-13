#!/usr/bin/env python3
"""Detecta o contrato WIN vigente (o de vencimento mais proximo ainda nao vencido).

POR QUE NAO USA symbols_get():
    mt5.symbols_get() devolve 52.506 simbolos e leva 39 s (medido 13/11/2026).
    Testar 24 candidatos com symbol_info() leva 0,45 s.

USO:
    python scripts/detecta_contrato.py            # imprime o simbolo, ou vazio
    python scripts/detecta_contrato.py --verbose  # mostra os candidatos

Sai com codigo 0 e simbolo vazio se a ponte estiver fora — quem chama decide.
"""
import sys
import datetime

PONTE = "127.0.0.1"
PORTA = 18812
# letras de vencimento do WIN na B3 (F=jan, G=fev, H=mar, J=abr, K=mai, M=jun,
# N=jul, Q=ago, U=set, V=out, X=nov, Z=dez)
LETRAS = "FGHJKMNQUVXZ"


def candidatos(mt5, hoje):
    """Contratos WIN existentes e nao vencidos, do mais proximo ao mais distante.

    ATENCAO: vencimento mais proximo NAO e o criterio de contrato da frente — o
    da frente e o mais LIQUIDO. Aqui so listamos; quem decide e `detecta()`.
    """
    out = []
    for ano in (hoje.year, hoje.year + 1):
        for i, letra in enumerate(LETRAS):
            nome = f"WIN{letra}{ano % 100:02d}"
            info = mt5.symbol_info(nome)
            if info is None:
                continue
            venc = datetime.date(ano, i + 1, 15)   # vencimento ~dia 15
            if venc >= hoje:
                # session_deals e o contador de negocios da sessao e o sinal de
                # liquidez mais confiavel. volume_real vem 0 ou 1 em alguns
                # terminais (medido no local: WINZ26 real=1, session_deals=4.6M).
                deals = float(getattr(info, "session_deals", 0) or 0)
                vol = float(getattr(info, "session_volume", 0) or 0)
                out.append((venc, nome, deals, vol))
    out.sort()
    return out


def detecta(verbose=False):
    try:
        import rpyc
    except ImportError:
        print("rpyc nao instalado", file=sys.stderr)
        return ""

    try:
        c = rpyc.classic.connect(PONTE, PORTA)
        c._config["sync_request_timeout"] = 20
        mt5 = c.modules["MetaTrader5"]
        if not mt5.initialize():
            print("initialize falhou", file=sys.stderr)
            return ""
        cand = candidatos(mt5, datetime.date.today())
        if verbose:
            for v, n, deals, vol in cand:
                print(f"  {n}  vence {v}  negocios {deals:>12.0f}", file=sys.stderr)
        if not cand:
            return ""
        # O da frente e o MAIS LIQUIDO, nao o de vencimento mais proximo.
        # Se todos estiverem sem volume (fora do pregao), cai para o mais proximo.
        com_volume = [c for c in cand if c[2] > 0 or c[3] > 0]
        if com_volume:
            # liquidez: primeiro numero de negocios, depois volume financeiro
            return max(com_volume, key=lambda c: (c[2], c[3]))[1]
        return cand[0][1]
    except Exception as e:
        print(f"erro na ponte: {e}", file=sys.stderr)
        return ""


if __name__ == "__main__":
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    simbolo = detecta(verbose)

    if not simbolo:
        try:
            import rpyc  # noqa: F401
        except ImportError:
            sys.exit(3)          # sem rpyc
        sys.exit(2)              # ponte fora ou nada encontrado

    # rejeita qualquer coisa que nao seja WIN<letra><2 digitos>
    import re
    if not re.fullmatch(r"WIN[FGHJKMNQUVXZ]\d{2}", simbolo):
        print(f"simbolo inesperado: {simbolo}", file=sys.stderr)
        sys.exit(4)

    print(simbolo)
