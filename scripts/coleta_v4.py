"""COLETOR v4 — tick + book + DELTA do book.

O DELTA e o que o Rui pediu: para cada mudanca do book, o quanto entrou/saiu em
cada nivel, pra cima e pra baixo. Estado completo diz ONDE o preco esta; delta diz
QUEM AGIU.

  book       : snapshot completo (5 niveis/lado) — reconstroi o estado
  book_delta : so o que mudou vs snapshot anterior — reconstroi a dinamica
  tick       : a fita

eventos do delta:
  novo    o nivel nao existia e apareceu
  saiu    o nivel existia e desapareceu
  add     o volume no nivel aumentou (ordem entrou)
  cancel  o volume no nivel diminuiu (ordem saiu ou foi executada)

Threads separadas: book+tick em conexoes RPyC distintas (latencia 41/48ms).
"""
import os
import argparse, queue, threading, time
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

def calcula_delta(antes, agora, ts, sym):
    """antes/agora = {(lado,nivel): (preco, volume)}. Otimizado: itera so o que existe."""
    linhas = []
    for k, (p_agr, v_agr) in agora.items():
        va = antes.get(k)
        if va is None:
            linhas.append((ts, sym, k[0], k[1], p_agr, 0.0, v_agr, v_agr, "novo"))
        else:
            p_ant, v_ant = va
            d = v_agr - v_ant
            if d != 0.0 or p_ant != p_agr:
                linhas.append((ts, sym, k[0], k[1], p_agr, v_ant, v_agr, d,
                               "add" if d > 0 else "cancel"))
    for k, (p_ant, v_ant) in antes.items():
        if k not in agora:
            linhas.append((ts, sym, k[0], k[1], p_ant, v_ant, 0.0, -v_ant, "saiu"))
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
    st = {"tick":0,"snap":0,"delta":0,"le":0}
    estado = {}     # ultimo estado do book: {(lado,nivel):(preco,volume)}

    def th_book():
        nonlocal estado
        while not parar.is_set():
            try:
                b = m_book.market_book_get(sym)
                st["le"] += 1
                if not b: continue
                agora = {}
                buys = sorted([x for x in b if int(x.type)==2], key=lambda x:-x.price)
                sells = sorted([x for x in b if int(x.type)==1], key=lambda x:x.price)
                for i,x in enumerate(buys):  agora[(2,i)] = (float(x.price), float(x.volume))
                for i,x in enumerate(sells): agora[(1,i)] = (float(x.price), float(x.volume))
                if agora == estado:
                    continue                       # nao mudou
                ts = datetime.now(BRT)
                # snapshot
                bufs = [(ts, sym, 2, i, p, v) for (l,i),(p,v) in agora.items() if l==2]
                bufs += [(ts, sym, 1, i, p, v) for (l,i),(p,v) in agora.items() if l==1]
                q_book.put(bufs); st["snap"] += 1
                # delta
                if estado:
                    dl = calcula_delta(estado, agora, ts, sym)
                    if dl: q_delta.put(dl); st["delta"] += len(dl)
                estado = agora
            except Exception as e:
                print(f"  [book] {str(e)[:60]}", flush=True); time.sleep(0.5)
            time.sleep(0.001)

    def th_tick():
        ant = None
        while not parar.is_set():
            try:
                t = m_tick.symbol_info_tick(sym)
                if t and t.time_msc != ant:
                    ant = t.time_msc
                    q_tick.put((datetime.now(BRT), sym, int(t.time_msc), float(t.bid),
                                float(t.ask), float(t.last), float(t.volume_real)))
                    st["tick"] += 1
            except Exception as e:
                print(f"  [tick] {str(e)[:60]}", flush=True); time.sleep(0.5)
            time.sleep(0.005)

    conn = psycopg2.connect(DSN); inicio = datetime.now(BRT); ult = time.time()

    def flush():
        nonlocal conn
        ticks,books,deltas = [],[],[]
        while not q_tick.empty(): ticks.append(q_tick.get())
        while not q_book.empty(): books.extend(q_book.get())
        while not q_delta.empty(): deltas.extend(q_delta.get())
        if not (ticks or books or deltas): return
        try:
            cur = conn.cursor()
            if ticks: execute_values(cur,"INSERT INTO tick (ts,symbol,time_msc,bid,ask,last,volume) VALUES %s",ticks,page_size=1000)
            if books: execute_values(cur,"INSERT INTO book (ts,symbol,lado,nivel,preco,volume) VALUES %s",books,page_size=3000)
            if deltas: execute_values(cur,"INSERT INTO book_delta (ts,symbol,lado,nivel,preco,vol_antes,vol_agora,delta,evento) VALUES %s",deltas,page_size=3000)
            conn.commit(); cur.close()
            print(f"  {datetime.now(BRT):%H:%M:%S} +{len(ticks)}t +{len(books)}b +{len(deltas)}Δ "
                  f"| snap {st['snap']} | leituras {st['le']}", flush=True)
        except Exception as e:
            print(f"  [db] {str(e)[:80]}", flush=True)
            try: conn.rollback()
            except Exception: pass

    threading.Thread(target=th_book, daemon=True).start()
    threading.Thread(target=th_tick, daemon=True).start()
    print(">>> v4: book + tick + DELTA (2 threads)", flush=True)
    try:
        while datetime.now(BRT).hour < 18:
            time.sleep(1)
            if time.time()-ult >= a.flush_seg: flush(); ult = time.time()
    except KeyboardInterrupt: print("\n>>> interrompido", flush=True)
    finally:
        parar.set(); time.sleep(1); flush()
        dur=(datetime.now(BRT)-inicio).total_seconds()
        print(f"\n>>> FIM {dur/60:.1f} min | {st['snap']} snapshots ({st['snap']/dur:.1f}/s) "
              f"| {st['delta']} deltas ({st['delta']/dur:.0f}/s) | {st['tick']} ticks ({st['tick']/dur:.1f}/s)", flush=True)

if __name__ == "__main__":
    main()
