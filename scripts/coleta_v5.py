"""COLETOR v5 — tick + book + DELTA POR PRECO (P0.1) + timestamps de ponte (P0.4).

MUDANCAS SOBRE O v4:
  P0.1  delta chaveado por (lado, PRECO), nao por nivel. O nivel desliza quando o
        melhor preco muda, gerando add/cancel falsos. Eventos redefinidos:
        entrou_janela / saiu_janela / vol_up / vol_down.
  P0.3  captura flags e volume_real; lado_inferido por regra do tick (nao existe
        flag do servidor — copy_ticks_from devolve 0 em qualquer janela).
  P0.4  grava t_recv_ns (relogio local, em torno da chamada) e thread_id.
  P0.7  preco/volume inteiros no banco.
"""
import os, argparse, queue, threading, time
from datetime import datetime, timezone, timedelta
import rpyc, psycopg2
from psycopg2.extras import execute_values

DSN = os.environ.get("MERCADO_DSN",
      "host=127.0.0.1 port=5434 dbname=mercado user=postgres password=CHANGE_ME")
PONTE = 18812
BRT = timezone(timedelta(hours=-3))

def conecta(com_book=False, sym=None):
    c = rpyc.classic.connect("127.0.0.1", PONTE)
    c._config["sync_request_timeout"] = 60
    m = c.modules["MetaTrader5"]
    if not m.initialize(): raise RuntimeError("initialize falhou")
    if sym:
        m.symbol_select(sym, True)
        if com_book: m.market_book_add(sym)
    return c, m

def delta_por_preco(antes, agora, ts, sym):
    """P0.1: chave = (lado, PRECO). Volume em contratos inteiros."""
    linhas = []
    for k, v in agora.items():
        va = antes.get(k)
        if va is None:
            linhas.append((ts, sym, k[0], k[1], 0, v, v, "entrou_janela"))
        elif v != va:
            linhas.append((ts, sym, k[0], k[1], va, v, v - va,
                           "vol_up" if v > va else "vol_down"))
    for k, v in antes.items():
        if k not in agora:
            linhas.append((ts, sym, k[0], k[1], v, 0, -v, "saiu_janela"))
    return linhas

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--simbolo", default="WINZ26")
    ap.add_argument("--flush-seg", type=int, default=10)
    a = ap.parse_args(); sym = a.simbolo
    if not sym.upper().startswith("WIN"):
        raise SystemExit(f">>> so series WIN. recebido: {sym}")

    c_book, m_book = conecta(com_book=True, sym=sym); time.sleep(2)
    b0 = m_book.market_book_get(sym)
    print(f">>> book: {len(b0) if b0 else 0} entradas", flush=True)
    c_tick, m_tick = conecta(sym=sym)

    q_tick, q_book, q_delta = queue.Queue(), queue.Queue(), queue.Queue()
    parar = threading.Event()
    st = {"tick":0,"snap":0,"delta":0,"le":0,"lat":[]}
    estado = {}

    def th_book():
        nonlocal estado
        while not parar.is_set():
            t0 = time.time_ns()
            try:
                b = m_book.market_book_get(sym)
                t1 = time.time_ns()
                st["le"] += 1
                st["lat"].append((t1-t0)/1e6)
                if not b: continue
                buys = sorted([x for x in b if int(x.type)==2], key=lambda x:-x.price)
                sells = sorted([x for x in b if int(x.type)==1], key=lambda x:x.price)
                agora = {}
                for x in buys:  agora[(2, int(round(x.price)))] = int(x.volume)
                for x in sells: agora[(1, int(round(x.price)))] = int(x.volume)
                if agora == estado: continue
                ts = datetime.now(BRT)
                n = 0
                bufs = [(ts, sym, 2, i, int(round(x.price)), int(x.volume))
                        for i,x in enumerate(buys)]
                bufs += [(ts, sym, 1, i, int(round(x.price)), int(x.volume))
                         for i,x in enumerate(sells)]
                q_book.put(bufs); n += len(bufs); st["snap"] += 1
                if estado:
                    dl = delta_por_preco(estado, agora, ts, sym)
                    if dl: q_delta.put(dl); st["delta"] += len(dl)
                estado = agora
            except Exception as e:
                print(f"  [book] {str(e)[:60]}", flush=True); time.sleep(0.5)
            time.sleep(0.001)

    def th_tick():
        ant = None
        while not parar.is_set():
            t0 = time.time_ns()
            try:
                t = m_tick.symbol_info_tick(sym)
                t1 = time.time_ns()
                if t and t.time_msc != ant:
                    ant = t.time_msc
                    lado = 1 if t.last >= t.ask else (-1 if t.last <= t.bid else 0)
                    q_tick.put((datetime.now(BRT), sym, int(t.time_msc), float(t.bid),
                                float(t.ask), float(t.last), float(t.volume_real), lado,
                                t1, threading.get_ident()))
                    st["tick"] += 1
            except Exception as e:
                print(f"  [tick] {str(e)[:60]}", flush=True); time.sleep(0.5)
            time.sleep(0.001)

    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    cur.execute("""SELECT column_name FROM information_schema.columns
                   WHERE table_name='tick' AND column_name IN ('lado_inferido','t_recv_ns')""")
    tem_ns = len(cur.fetchall()) >= 2
    inicio = datetime.now(BRT); ult = time.time()

    def flush():
        nonlocal conn, cur
        ticks, books, deltas = [], [], []
        while not q_tick.empty(): ticks.append(q_tick.get())
        while not q_book.empty(): books.extend(q_book.get())
        while not q_delta.empty(): deltas.extend(q_delta.get())
        if not (ticks or books or deltas): return
        try:
            if ticks:
                if tem_ns:
                    execute_values(cur, "INSERT INTO tick (ts,symbol,time_msc,bid,ask,last,volume,lado_inferido,t_recv_ns) VALUES %s",
                                   ticks, page_size=1000)
                else:
                    execute_values(cur, "INSERT INTO tick (ts,symbol,time_msc,bid,ask,last,volume,lado_inferido) VALUES %s",
                                   [t[:8] for t in ticks], page_size=1000)
            if books:
                execute_values(cur, "INSERT INTO book (ts,symbol,lado,nivel,preco,volume) VALUES %s",
                               books, page_size=3000)
            if deltas:
                execute_values(cur, "INSERT INTO book_delta_v2 (ts,symbol,lado,preco,vol_antes,vol_agora,delta,evento) VALUES %s",
                               deltas, page_size=3000)
            conn.commit()
            lat = st["lat"][-200:]
            med = sum(lat)/len(lat) if lat else 0
            print(f"  {datetime.now(BRT):%H:%M:%S} +{len(ticks)}t +{len(books)}b +{len(deltas)}D "
                  f"| snap {st['snap']} | latencia {med:.0f}ms", flush=True)
        except Exception as e:
            print(f"  [db] {str(e)[:90]}", flush=True)
            try: conn.rollback()
            except Exception: pass

    threading.Thread(target=th_book, daemon=True).start()
    threading.Thread(target=th_tick, daemon=True).start()
    print(">>> v5: delta POR PRECO + lado_inferido + timestamps", flush=True)
    try:
        while datetime.now(BRT).hour < 18:
            time.sleep(1)
            if time.time()-ult >= a.flush_seg: flush(); ult = time.time()
    except KeyboardInterrupt: print("\n>>> interrompido", flush=True)
    finally:
        parar.set(); time.sleep(1); flush()
        dur = (datetime.now(BRT)-inicio).total_seconds()
        lat = st["lat"]
        print(f"\n>>> FIM {dur/60:.1f} min | {st['snap']} snap ({st['snap']/dur:.1f}/s) "
              f"| {st['delta']} deltas | {st['tick']} ticks ({st['tick']/dur:.1f}/s)", flush=True)
        if lat:
            lat.sort()
            print(f">>> latencia book: mediana {lat[len(lat)//2]:.1f}ms | p95 {lat[int(len(lat)*.95)]:.1f}ms", flush=True)

if __name__ == "__main__":
    main()
