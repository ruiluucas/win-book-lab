"""P0-5 — Holm-Bonferroni para as hipóteses secundárias.

PROTOCOLO: a hipótese PRIMÁRIA é testada separadamente (α=0,05, sem correção).
As SECUNDÁRIAS formam a família e são corrigidas por Holm.

Regra de Holm (step-down):
  1. ordene os p-valores crescentes: p(1) <= p(2) <= ... <= p(m)
  2. para k = 1..m: se p(k) > alpha/(m-k+1), pare e aceite H0 de k em diante
  3. rejeite H0 para 1..k-1
  4. p ajustado: p_adj(k) = max_{j<=k} min(1, (m-j+1) * p(j))  (monotonico)

Por que existe: 7 secundárias testadas sem correção inflam o falso positivo.
Com alpha=0,05 e 7 testes independentes, P(>=1 falso positivo) = 1-0,95^7 = 30%.
"""
import numpy as np


def holm(pvals, alpha=0.05):
    """Holm step-down.

    Devolve dict:
      rejeita : lista bool na ORDEM ORIGINAL
      p_adj   : p-valores ajustados na ordem original
      k       : quantas rejeicoes
      ordem   : indices na ordem crescente de p
    """
    p = np.asarray(pvals, dtype=float)
    if p.ndim != 1:
        raise ValueError("pvals deve ser 1-D")
    m = len(p)
    if m == 0:
        return {"rejeita": np.array([], bool), "p_adj": np.array([]),
                "k": 0, "ordem": np.array([], int)}
    if np.any(~np.isfinite(p)) or np.any((p < 0) | (p > 1)):
        raise ValueError("p-valores devem estar em [0,1] e ser finitos")

    ordem = np.argsort(p, kind="mergesort")
    p_ord = p[ordem]

    p_adj_ord = np.empty(m)
    acumulado = 0.0
    for i in range(m):
        val = (m - i) * p_ord[i]
        acumulado = max(acumulado, val)     # monotonico
        p_adj_ord[i] = min(1.0, acumulado)

    # step-down: rejeita enquanto p_ord[i] <= alpha/(m-i)
    rejeita_ord = np.zeros(m, bool)
    for i in range(m):
        if p_ord[i] <= alpha / (m - i):
            rejeita_ord[i] = True
        else:
            break                            # para na primeira nao-rejeicao

    rejeita = np.zeros(m, bool)
    p_adj = np.empty(m)
    rejeita[ordem] = rejeita_ord
    p_adj[ordem] = p_adj_ord

    return {"rejeita": rejeita, "p_adj": p_adj, "k": int(rejeita.sum()), "ordem": ordem}


def avalia_familia(resultados, alpha=0.05):
    """Recebe lista de (nome, p) e devolve tabela ordenada com decisao Holm."""
    nomes = [r[0] for r in resultados]
    ps = [r[1] for r in resultados]
    h = holm(ps, alpha)
    linhas = []
    for i in h["ordem"]:
        linhas.append({
            "nome": nomes[i], "p": ps[i], "p_adj": h["p_adj"][i],
            "rejeita": bool(h["rejeita"][i]),
        })
    return linhas, h
