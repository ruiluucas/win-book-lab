// Nucleo testavel do app — sem dependencia do Electron.
// Tudo que o painel faz passa por aqui, para poder ser testado com `node`.
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..', '..');
const VENV_PY = process.env.LAB_PY || '/home/rui/Projetos/quant-lab/.venv/bin/python';
const LOG_DIR = path.join(REPO, 'logs');
const DSN = 'host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args,
      { timeout: opts.timeout || 15000, maxBuffer: 8 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => resolve({
        ok: !err,
        out: (stdout || '').trim(),
        err: (stderr || '').trim(),
        code: err ? (err.code ?? 1) : 0,
      }));
  });
}

async function getStatus() {
  const [mt5, bridge, docker, coll] = await Promise.all([
    run('bash', ['-c', 'ps -eo comm 2>/dev/null | grep -qx main && echo sim || echo nao']),
    run('bash', ['-c', 'ss -tln 2>/dev/null | grep -q ":18812 " && echo sim || echo nao']),
    run('docker', ['ps', '--filter', 'name=mercado-db', '--format', '{{.Status}}']),
    run('bash', ['-c', 'pgrep -af "coleta_v5.py" | head -1']),
  ]);
  const line = coll.out || '';
  const sym = line.match(/coleta_v5\.py\s+--simbolo\s+(\S+)/);
  const pid = line.match(/^(\d+)/);
  return {
    mt5: mt5.out === 'sim',
    bridge: bridge.out === 'sim',
    docker: (docker.ok && docker.out) ? docker.out : null,
    collector: line ? { pid: pid ? pid[1] : '?', symbol: sym ? sym[1] : '?' } : null,
    ts: Date.now(),
  };
}

const SQL = `
SELECT
  (SELECT count(DISTINCT ts) FROM book WHERE ts >= current_date),
  (SELECT count(*) FROM tick WHERE ts >= current_date),
  (SELECT count(*) FROM book_delta_v2 WHERE ts >= current_date),
  (SELECT count(*) FROM book WHERE ts >= current_date),
  (SELECT count(DISTINCT ts) FROM book WHERE ts >= current_date AND ts >= now() - interval '60 seconds'),
  (SELECT to_char(max(ts) AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') FROM book);
`;

async function dbStats() {
  const r = await run('docker', ['exec', 'mercado-db', 'psql', '-U', 'postgres',
    '-d', 'mercado', '-t', '-A', '-F', '|', '-c', SQL]);
  if (!r.ok) return { erro: r.err.split('\n')[0] || 'banco indisponivel' };
  const p = r.out.split('\n')[0].split('|');
  if (p.length < 6) return { erro: 'resposta inesperada: ' + r.out.slice(0, 80) };
  return {
    snapHoje: +p[0], tickHoje: +p[1], deltaHoje: +p[2],
    bookHoje: +p[3], snap1min: +p[4], ultimo: p[5],
  };
}

async function startCollection() {
  const st = await getStatus();
  if (!st.mt5) return { ok: false, msg: 'MT5 fechado. Abra pelo Lutris primeiro.' };
  if (st.collector) return { ok: true, msg: `Ja coletando (pid ${st.collector.pid}, ${st.collector.symbol})` };
  await run('bash', ['-c',
    `cd ${JSON.stringify(REPO)} && setsid bash scripts/coleta_auto.sh > /dev/null 2>&1 &`,
  ], { timeout: 5000 });
  await new Promise(r => setTimeout(r, 3500));
  const a = await getStatus();
  return a.collector
    ? { ok: true, msg: `Coleta iniciada (pid ${a.collector.pid}, ${a.collector.symbol})` }
    : { ok: false, msg: 'Coletor nao subiu — veja o log.' };
}

async function stopCollection() {
  const st = await getStatus();
  if (!st.collector) return { ok: true, msg: 'Nao havia coletor rodando' };
  await run('bash', ['-c', `kill ${st.collector.pid} 2>/dev/null || true`]);
  await new Promise(r => setTimeout(r, 1500));
  const a = await getStatus();
  return a.collector ? { ok: false, msg: 'Coletor ainda vivo' } : { ok: true, msg: 'Coleta parada' };
}

async function runAnalysis(method, opts = {}) {
  const script = method === 'tempo' ? 'book_tempo.py' : 'book_estrito.py';
  const args = [path.join(REPO, 'scripts', script)];
  if (opts.csv) args.push('--csv', opts.csv);
  else {
    if (!opts.inicio || !opts.fim) return { ok: false, out: 'Janela obrigatoria (inicio e fim).' };
    args.push('--inicio', opts.inicio, '--fim', opts.fim);
  }
  if (opts.custo) args.push('--custo', String(opts.custo));
  if (opts.fator && method === 'tempo') args.push('--fator', String(opts.fator));
  const r = await run(VENV_PY, args, {
    timeout: 240000,
    cwd: REPO,
    env: { ...process.env, MERCADO_DSN: DSN },
  });
  return { ok: r.ok, out: (r.out + '\n' + r.err).trim() };
}

async function tailLog(n = 40) {
  const f = path.join(LOG_DIR, 'coleta_auto.log');
  if (!fs.existsSync(f)) return '(sem log ainda)';
  const r = await run('bash', ['-c', `tail -${n} ${JSON.stringify(f)}`]);
  return r.out;
}

function listLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log')).map(f => ({
    nome: f, tam: fs.statSync(path.join(LOG_DIR, f)).size,
  }));
}


// ---------- BOOK AO VIVO ----------
const SQL_BOOK = `
WITH u AS (SELECT max(ts) t FROM book WHERE ts >= now() - interval '5 minutes')
SELECT b.lado, b.nivel, b.preco, b.volume
FROM book b, u WHERE b.ts = u.t
ORDER BY b.lado DESC, b.nivel;
`;

async function getBook() {
  const r = await run('docker', ['exec', 'mercado-db', 'psql', '-U', 'postgres',
    '-d', 'mercado', '-t', '-A', '-F', '|', '-c', SQL_BOOK]);
  if (!r.ok) return { erro: r.err.split('\n')[0] || 'banco indisponivel' };
  const bids = [], asks = [];
  for (const ln of r.out.split('\n')) {
    if (!ln) continue;
    const [lado, nivel, preco, volume] = ln.split('|');
    const item = { nivel: +nivel, preco: +preco, volume: +volume };
    if (lado === '2') bids.push(item); else asks.push(item);
  }
  if (!bids.length || !asks.length) return { erro: 'sem book recente' };
  const bid = bids[0].preco, ask = asks[0].preco;
  const vb = bids.reduce((a, x) => a + x.volume, 0);
  const va = asks.reduce((a, x) => a + x.volume, 0);
  return {
    bids, asks,
    bid, ask,
    mid: (bid + ask) / 2,
    spread: ask - bid,
    // OBI dos 5 niveis: (Vbid - Vask) / (Vbid + Vask)
    obi: (vb - va) / (vb + va),
    vbid: vb, vask: va,
  };
}

// ---------- CANDLES (fieis ao MT5) ----------
// Usa o preco NEGOCIADO (tick.last), que e o que o MT5 mostra no grafico.
// Nao usa mid: mid e construcao nossa e diverge do candle do MT5.
function sqlCandles(min, bucket) {
  return `
WITH x AS (
  SELECT to_timestamp(floor(extract(epoch FROM ts) / ${bucket}) * ${bucket}) AS b,
         last, volume, ts AS tr
  FROM tick
  WHERE ts >= now() - interval '${min} minutes' AND last > 0
)
SELECT extract(epoch FROM b)::bigint AS ts,
       (array_agg(last ORDER BY tr))[1]      AS o,
       max(last)                            AS h,
       min(last)                            AS l,
       (array_agg(last ORDER BY tr DESC))[1] AS c,
       sum(volume)                          AS v
FROM x GROUP BY b ORDER BY b;
`;
}

async function getCandles(min = 30, bucket = 60) {
  const m = Math.max(1, Math.min(180, parseInt(min, 10) || 30));
  const b = Math.max(5, Math.min(300, parseInt(bucket, 10) || 60));
  const r = await run('docker', ['exec', 'mercado-db', 'psql', '-U', 'postgres',
    '-d', 'mercado', '-t', '-A', '-F', '|', '-c', sqlCandles(m, b)]);
  if (!r.ok) return { erro: r.err.split('\n')[0] || 'banco indisponivel', candles: [] };
  const candles = [];
  for (const ln of r.out.split('\n')) {
    if (!ln) continue;
    const [ts, o, h, l, c, v] = ln.split('|');
    if (!ts) continue;
    candles.push({ ts: +ts, o: +o, h: +h, l: +l, c: +c, v: +v });
  }
  return { candles, minutos: m, bucket: b };
}


module.exports = {
  REPO, VENV_PY, LOG_DIR, DSN, run,
  getStatus, dbStats, startCollection, stopCollection, runAnalysis, tailLog, listLogs,
  getBook, getCandles,
};
