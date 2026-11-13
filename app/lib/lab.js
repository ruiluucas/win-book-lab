// Nucleo testavel do app — sem dependencia do Electron.
// Tudo que o painel faz passa por aqui, para poder ser testado com `node`.
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..', '..');
const VENV_PY = process.env.LAB_PY || '/home/rui/Projetos/quant-lab/.venv/bin/python';
const LOG_DIR = path.join(REPO, 'logs');
const DSN_LOCAL = 'host=127.0.0.1 port=5434 dbname=mercado user=postgres password=mercado_local';

const config = require('./config');
const tunel  = require('./tunel');

// ---------- de onde vem o dado ----------
// local -> Postgres desta maquina (5434)
// vm    -> Postgres da VM Inovatech, via tunel SSH em 127.0.0.1:5433
// Toda consulta passa por aqui: trocar a fonte no app muda o DSN em um lugar so.
async function fonteAtual() {
  const cfg = config.carrega();
  if (cfg.fonte !== 'vm') {
    return { cfg, fonte: 'local', dsn: DSN_LOCAL, preparo: { ok: true } };
  }
  const preparo = await tunel.garante(cfg);
  const dsn = preparo.ok ? config.dsnVM() : null;
  return {
    cfg, fonte: 'vm', dsn: dsn || DSN_LOCAL, preparo,
    motivo: !preparo.ok ? preparo.motivo
          : (!dsn ? 'senha da VM ausente em ~/.config/winbook-lab/vm.env' : null),
  };
}

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

function sshVm(cfg, cmd, timeout = 30000) {
  const v = cfg.vm;
  return run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6',
    '-o', 'StrictHostKeyChecking=accept-new', `${v.usuario}@${v.host}`, cmd],
    { timeout });
}

let cacheStatusRemoto = null;

// Estado dos servicos NA VM. Uma ida ao SSH a cada 10 s: as pilulas nao
// precisam de mais, e SSH a 2,5/s custaria mais que o banco inteiro.
async function statusRemoto(cfg) {
  const agora = Date.now();
  if (cacheStatusRemoto && agora - cacheStatusRemoto.ts < 10000) return cacheStatusRemoto.v;

  const cmd = [
    'echo "mt5=$(pgrep -x main >/dev/null && echo sim || echo nao)"',
    'echo "ponte=$(ss -tln 2>/dev/null | grep -q \':18812 \' && echo sim || echo nao)"',
    'echo "db=$(docker ps --filter name=winbook-db --format \'{{.Status}}\')"',
    'echo "col=$(docker ps --filter name=winbook-coletor --format \'{{.Status}}\')"',
    'echo "sym=$(docker logs --tail 200 winbook-coletor 2>&1 | grep -o \'contrato: WIN[A-Z0-9]*\' | tail -1 | cut -d\' \' -f2)"',
  ].join('; ');

  const v = cfg.vm;
  const r = await run('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=6',
    '-o', 'StrictHostKeyChecking=accept-new',
    `${v.usuario}@${v.host}`, cmd,
  ], { timeout: 12000 });

  if (!r.ok) {
    const falha = { mt5: false, bridge: false, docker: null, collector: null,
                    fonte: 'vm', offline: true,
                    erro: (r.err || 'VM inacessivel').split('\n')[0].slice(0, 120),
                    ts: Date.now() };
    cacheStatusRemoto = { ts: agora, v: falha };
    return falha;
  }
  const g = (k) => (r.out.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '';
  const col = g('col');
  const ok = {
    mt5: g('mt5') === 'sim',
    bridge: g('ponte') === 'sim',
    docker: g('db') || null,
    collector: col ? { pid: 'remoto', symbol: g('sym') || '?' } : null,
    fonte: 'vm', offline: false, erro: null, ts: Date.now(),
  };
  cacheStatusRemoto = { ts: agora, v: ok };
  return ok;
}

async function getStatus() {
  const { cfg, fonte } = await fonteAtual();
  if (fonte === 'vm') return statusRemoto(cfg);

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
    fonte: 'local', offline: false, erro: null,
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
  const r = await psql(SQL);
  if (!r.ok) return { erro: r.err.split('\n')[0] || 'banco indisponivel' };
  const p = r.out.split('\n')[0].split('|');
  if (p.length < 6) return { erro: 'resposta inesperada: ' + r.out.slice(0, 80) };
  return {
    snapHoje: +p[0], tickHoje: +p[1], deltaHoje: +p[2],
    bookHoje: +p[3], snap1min: +p[4], ultimo: p[5],
  };
}

async function startCollection() {
  const { cfg, fonte } = await fonteAtual();
  if (fonte === 'vm') {
    const st = await statusRemoto(cfg);
    if (st.offline) return { ok: false, msg: 'VM inacessivel: ' + st.erro };
    if (!st.mt5) return { ok: false, msg: 'MT5 fechado na VM.' };
    if (st.collector) return { ok: true, msg: `Ja coletando na VM (${st.collector.symbol})` };
    const r = await sshVm(cfg, 'cd /opt/winbook && docker compose up -d coletor 2>&1 | tail -3', 90000);
    cacheStatusRemoto = null;
    await new Promise(r2 => setTimeout(r2, 4000));
    const a = await statusRemoto(cfg);
    return a.collector
      ? { ok: true, msg: `Coleta iniciada na VM (${a.collector.symbol})` }
      : { ok: false, msg: 'Coletor nao subiu na VM: ' + (r.out || r.err).slice(0, 120) };
  }
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
  const { cfg, fonte } = await fonteAtual();
  if (fonte === 'vm') {
    const r = await sshVm(cfg, 'cd /opt/winbook && docker compose stop coletor 2>&1 | tail -2', 60000);
    cacheStatusRemoto = null;
    await new Promise(r2 => setTimeout(r2, 2000));
    const a = await statusRemoto(cfg);
    return a.collector
      ? { ok: false, msg: 'Coletor da VM ainda vivo: ' + (r.out || r.err).slice(0, 100) }
      : { ok: true, msg: 'Coleta da VM parada' };
  }
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
    env: { ...process.env, MERCADO_DSN: (await fonteAtual()).dsn },
  });
  return { ok: r.ok, out: (r.out + '\n' + r.err).trim() };
}

async function tailLog(n = 40) {
  const { cfg, fonte } = await fonteAtual();
  if (fonte === 'vm') {
    const r = await sshVm(cfg, `docker logs --tail ${n} winbook-coletor 2>&1`, 15000);
    return r.ok ? r.out : '(VM inacessivel: ' + (r.err || '').slice(0, 100) + ')';
  }
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



// ---------- SQL ----------
// Conexao PERSISTENTE via `pg`. Cada `psql`/`docker exec` custa 130-170 ms so para
// subir o processo; um pool responde em 2-5 ms. Era isso que limitava o grafico a
// ~5/s e o book a ~2,9/s (medido 13/11).
let pool = null;
let poolFalhou = false;

function dsnParaObjeto(dsn) {
  const o = {};
  for (const par of dsn.split(/\s+/)) {
    const [k, ...v] = par.split('=');
    if (!k) continue;
    const val = v.join('=');
    if (k === 'host') o.host = val;
    else if (k === 'port') o.port = parseInt(val, 10);
    else if (k === 'dbname') o.database = val;
    else if (k === 'user') o.user = val;
    else if (k === 'password') o.password = val;
  }
  return o;
}

let poolDsn = null;

function getPool(dsn) {
  // trocar de fonte (local <-> VM) exige pool novo: sao servidores diferentes
  if (pool && poolDsn !== dsn) { try { pool.end(); } catch {} pool = null; poolFalhou = false; }
  if (pool || poolFalhou) return pool;
  poolDsn = dsn;
  try {
    const { Pool } = require('pg');
    pool = new Pool({ ...dsnParaObjeto(dsn), max: 4, idleTimeoutMillis: 30000,
                      connectionTimeoutMillis: 3000 });
    pool.on('error', () => {});   // nao deixa o erro do pool derrubar o app
  } catch (e) {
    poolFalhou = true;
    pool = null;
  }
  return pool;
}

// Devolve o MESMO formato do psql -t -A -F'|', para o resto do codigo nao mudar.
async function psql(sql) {
  const { dsn } = await fonteAtual();
  const p = getPool(dsn);
  if (p) {
    try {
      const r = await p.query(sql);
      // Date vira ISO: o join cru produzia 'Fri Nov 13 2026 ...' e quebrava o SQL seguinte
      const out = r.rows
        .map(row => Object.values(row).map(v => (v instanceof Date ? v.toISOString() : v)).join('|'))
        .join('\n');
      return { ok: true, out, err: '', code: 0 };
    } catch (e) {
      // cai para o caminho lento abaixo
    }
  }
  // fallback: psql direto e, por ultimo, docker exec
  const r1 = await run('psql', [dsn, '-t', '-A', '-F', '|', '-c', sql]);
  if (r1.ok) return r1;
  return run('docker', ['exec', 'mercado-db', 'psql', '-U', 'postgres',
    '-d', 'mercado', '-t', '-A', '-F', '|', '-c', sql]);
}

// ---------- BOOK AO VIVO ----------
// UMA consulta com subconsulta. Nao da para ir e voltar ao Node com o timestamp:
// o driver `pg` trunca em milissegundos e o WHERE ts = '<iso>' nao casa com a
// precisao real da coluna (microssegundos). A subconsulta mantem a precisao.
// Medido no pool: 3-7 ms. A CTE antiga com max() sobre 5 min levava 257 ms.
const SQL_BOOK = `
SELECT lado, nivel, preco, volume FROM book
WHERE ts = (SELECT ts FROM book ORDER BY ts DESC LIMIT 1)
ORDER BY lado DESC, nivel;
`;

async function getBook() {
  const r = await psql(SQL_BOOK);
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
    bids, asks, bid, ask,
    mid: (bid + ask) / 2,
    spread: ask - bid,
    obi: (vb - va) / (vb + va),   // OBI dos 5 niveis
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
  const r = await psql(sqlCandles(m, b));
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
  psql,
  REPO, VENV_PY, LOG_DIR, DSN_LOCAL, run,
  fonteAtual, config, tunel,
  getStatus, dbStats, startCollection, stopCollection, runAnalysis, tailLog, listLogs,
  getBook, getCandles,
};
