-- Schema DEFINITIVO: tick + book no TimescaleDB.
-- CORRECAO da versao em mt5-bridge/deploy: faltava CREATE EXTENSION timescaledb,
-- e sem isso by_range/time_bucket/add_compression_policy falham em silencio.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ------------------------------------------------------------------ TICK (fita)
CREATE TABLE IF NOT EXISTS tick (
    ts        timestamptz    NOT NULL,   -- hora LOCAL do servidor (BRT)
    symbol    text           NOT NULL,
    time_msc  bigint,
    bid       double precision,
    ask       double precision,
    last      double precision,
    volume    double precision
);

SELECT create_hypertable('tick', by_range('ts', INTERVAL '1 day'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS tick_sym_ts_idx ON tick (symbol, ts DESC);

ALTER TABLE tick SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts'
);
SELECT add_compression_policy('tick', INTERVAL '2 days', if_not_exists => TRUE);

-- ------------------------------------------------------------------ BOOK
-- 1 linha por nivel por snapshot. lado: 1=SELL(ask) 2=BUY(bid)
CREATE TABLE IF NOT EXISTS book (
    ts      timestamptz    NOT NULL,
    symbol  text           NOT NULL,
    lado    smallint       NOT NULL,
    nivel   smallint       NOT NULL,   -- 0 = melhor preco do lado
    preco   double precision,
    volume  double precision
);

SELECT create_hypertable('book', by_range('ts', INTERVAL '1 day'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS book_sym_ts_idx ON book (symbol, ts DESC);

ALTER TABLE book SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts'
);
SELECT add_compression_policy('book', INTERVAL '2 days', if_not_exists => TRUE);

-- ------------------------------------------------------------------ AGREGADO 1s
-- Snapshot por segundo com OBI calculado — a base para analise.
CREATE MATERIALIZED VIEW IF NOT EXISTS book_1s
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 second', ts) AS segundo,
       symbol,
       max(CASE WHEN lado=2 THEN preco END)                      AS melhor_bid,
       min(CASE WHEN lado=1 THEN preco END)                      AS melhor_ask,
       sum(CASE WHEN lado=2 THEN volume ELSE 0 END)              AS vol_bid,
       sum(CASE WHEN lado=1 THEN volume ELSE 0 END)              AS vol_ask,
       sum(volume)                                               AS depth,
       count(*)                                                  AS n_niveis
FROM book
GROUP BY segundo, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('book_1s',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '10 seconds',
    schedule_interval => INTERVAL '30 seconds',
    if_not_exists     => TRUE);

-- ------------------------------------------------------------------ RETENCAO
-- 2 anos. Com 26 MB/ano comprimido, e' irrelevante em espaco, mas mantem o banco leve.
SELECT add_retention_policy('tick', INTERVAL '2 years', if_not_exists => TRUE);
SELECT add_retention_policy('book', INTERVAL '2 years', if_not_exists => TRUE);

-- ------------------------------------------------------------------ CONTROLE DE COleta
CREATE TABLE IF NOT EXISTS coleta_log (
    inicio      timestamptz NOT NULL,
    fim         timestamptz,
    symbol      text,
    n_tick      bigint,
    n_book      bigint,
    observacao  text,
    PRIMARY KEY (inicio, symbol)
);
