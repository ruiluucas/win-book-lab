// ==================== estado ====================
let chartApi = null;          // lightweight-charts
let candleSeries = null;
let volSeries = null;
let minutos = 30;             // janela do grafico (min)
let bucket = 60;              // segundos por candle
let busySeries = false;
let ultimoSetData = 0;
const TZ_OFFSET = 3 * 3600;   // MT5/banco guarda em UTC+0; exibimos BRT (UTC-3)

const $ = id => document.getElementById(id);
const fmt = n => (n === undefined || n === null || isNaN(n)) ? '—' : n.toLocaleString('pt-BR');
const fmtP = n => (n === undefined || n === null || isNaN(n)) ? '—'
  : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0 });

// ==================== titulo da janela ====================
$('w-min').onclick = () => window.win.min();
$('w-max').onclick = () => window.win.max();
$('w-close').onclick = () => window.win.close();
window.win.onState(m => { $('w-max').title = m ? 'Restaurar' : 'Maximizar'; });

// ==================== status ====================
function setPill(k, on) {
  document.querySelector(`.pill[data-k="${k}"]`).classList.toggle('on', !!on);
}

function paintStatus(s) {
  setPill('mt5', s.mt5);
  $('v-mt5').textContent = s.mt5 ? 'aberto' : 'fechado';
  $('s-mt5').textContent = s.mt5 ? 'ok' : 'off';
  $('s-mt5').className = 'st ' + (s.mt5 ? 'ok-on' : 'ok-off');
  $('c-mt5').classList.toggle('on', s.mt5);

  setPill('bridge', s.bridge);
  $('v-bridge').textContent = s.bridge ? 'ativa' : 'off';
  $('s-bridge').textContent = s.bridge ? 'ok' : 'off';
  $('s-bridge').className = 'st ' + (s.bridge ? 'ok-on' : 'ok-off');
  $('c-bridge').classList.toggle('on', s.bridge);

  const dbOn = !!s.docker;
  setPill('docker', dbOn);
  $('v-docker').textContent = dbOn ? 'no ar' : 'off';
  $('s-docker').textContent = dbOn ? 'ok' : 'off';
  $('s-docker').className = 'st ' + (dbOn ? 'ok-on' : 'ok-off');
  $('v-docker').title = s.docker || '';
  $('c-docker').classList.toggle('on', dbOn);

  const colOn = !!s.collector;
  setPill('collector', colOn);
  $('v-collector').textContent = colOn ? s.collector.symbol : 'parado';
  $('s-collector').textContent = colOn ? 'ok' : 'off';
  $('s-collector').className = 'st ' + (colOn ? 'ok-on' : 'ok-off');
  $('h-collector').textContent = colOn ? `pid ${s.collector.pid}` : 'v5 · delta por preço';
  $('c-collector').classList.toggle('on', colOn);

  $('btn-start').disabled = colOn || !s.mt5;
  $('btn-stop').disabled = !colOn;
}

// ==================== metricas ====================
function paintStats(d) {
  if (d.erro) {
    ['m-snap', 'm-book', 'm-tick', 'm-delta', 'm-rate', 'm-last']
      .forEach(id => $(id).textContent = '—');
    return;
  }
  $('m-snap').textContent = fmt(d.snapHoje);
  $('m-book').textContent = fmt(d.bookHoje);
  $('m-tick').textContent = fmt(d.tickHoje);
  $('m-delta').textContent = fmt(d.deltaHoje);
  $('m-rate').textContent = d.snap1min ? (d.snap1min / 60).toFixed(1) + '/s' : 'parado';
  $('m-last').textContent = d.ultimo || '—';
}

// ==================== book ladder ====================
function linhaBook(lado, item, maxVol) {
  const pct = maxVol > 0 ? Math.max(2, Math.round((item.volume / maxVol) * 100)) : 0;
  const cor = lado === 'ask' ? 'var(--ask)' : 'var(--bid)';
  return `<div class="bl">
    <span class="bar" style="width:${pct}%;background:${cor}"></span>
    <span class="vol">${fmt(item.volume)}</span>
    <span class="pr">${fmtP(item.preco)}</span>
  </div>`;
}

function paintBook(b) {
  if (b.erro) {
    $('asks').innerHTML = `<div class="bl"><span class="vol">${b.erro}</span><span class="pr"></span></div>`;
    $('bids').innerHTML = '';
    $('book-mid').textContent = '—';
    $('book-spread').textContent = '—';
    $('book-obi').textContent = '—';
    return;
  }
  const maxVol = Math.max(...b.bids.map(x => x.volume), ...b.asks.map(x => x.volume));

  // asks: do pior (nivel 4, mais alto) para o melhor (nivel 0) — fica em cima
  const asks = [...b.asks].sort((x, y) => y.nivel - x.nivel);
  $('asks').innerHTML = asks.map(x => linhaBook('ask', x, maxVol)).join('');
  $('bids').innerHTML = b.bids.map(x => linhaBook('bid', x, maxVol)).join('');

  $('book-mid').textContent = fmtP(b.mid);
  $('book-spread').textContent = `spread ${b.spread} pts`;
  const obiEl = $('book-obi');
  obiEl.textContent = (b.obi >= 0 ? '+' : '') + b.obi.toFixed(3);
  obiEl.className = 'obi-val ' + (b.obi >= 0 ? 'pos' : 'neg');
}

// ==================== grafico ====================
function initChart() {
  if (typeof LightweightCharts === 'undefined') {
    $('chart').innerHTML = '<div style="padding:20px;color:#e5484d">lightweight-charts nao carregou</div>';
    return;
  }
  const el = $('chart');
  chartApi = LightweightCharts.createChart(el, {
    layout: {
      background: { color: 'transparent' },
      textColor: '#8894ab',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(34,43,61,.55)' },
      horzLines: { color: 'rgba(34,43,61,.55)' },
    },
    rightPriceScale: { borderColor: '#222b3d', scaleMargins: { top: 0.08, bottom: 0.30 } },
    timeScale: { borderColor: '#222b3d', timeVisible: true, secondsVisible: true },
    crosshair: {
      mode: 0,
      vertLine: { color: '#4f8cff', width: 1, style: 2, labelBackgroundColor: '#4f8cff' },
      horzLine: { color: '#4f8cff', width: 1, style: 2, labelBackgroundColor: '#4f8cff' },
    },
  });

  // lightweight-charts v5: addSeries(Tipo, opcoes). A API antiga
  // (addCandlestickSeries) foi removida e derrubava o boot silenciosamente.
  const { CandlestickSeries, HistogramSeries } = LightweightCharts;

  candleSeries = chartApi.addSeries(CandlestickSeries, {
    upColor: '#2fbf71', downColor: '#e5484d',
    borderUpColor: '#2fbf71', borderDownColor: '#e5484d',
    wickUpColor: '#2fbf71', wickDownColor: '#e5484d',
    priceFormat: { type: 'price', precision: 1, minMove: 0.5 },
  });

  volSeries = chartApi.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
  });
  chartApi.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

  const resize = () => {
    if (chartApi && el.clientWidth > 0) {
      chartApi.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    }
  };
  new ResizeObserver(resize).observe(el);
  setTimeout(resize, 60);
}

// Converte candles do banco para o formato do lightweight-charts.
// O banco entrega epoch em UTC; o chart exibe o que recebe, entao deslocamos
// para BRT — senao o eixo mostra 17:25 quando sao 14:25.
function paraChart(cs) {
  const candles = [], vols = [];
  for (const c of cs) {
    const t = c.ts - TZ_OFFSET;
    candles.push({ time: t, open: c.o, high: c.h, low: c.l, close: c.c });
    vols.push({
      time: t, value: c.v,
      color: c.c >= c.o ? 'rgba(47,191,113,.45)' : 'rgba(229,72,77,.45)',
    });
  }
  return { candles, vols };
}

async function carregaGrafico(completo = false) {
  if (busySeries || !candleSeries) return;
  busySeries = true;
  try {
    const r = await window.lab.candles(minutos, bucket);
    if (r.erro || !r.candles || !r.candles.length) return;
    const { candles, vols } = paraChart(r.candles);

    // setData completo a cada 30 s (backfill); entre isso, so o ultimo candle
    const agora = Date.now();
    if (completo || candles.length < 2 || agora - ultimoSetData > 30000) {
      candleSeries.setData(candles);
      volSeries.setData(vols);
      ultimoSetData = agora;
    } else {
      candleSeries.update(candles[candles.length - 1]);
      volSeries.update(vols[vols.length - 1]);
    }
  } catch (e) {
    console.error('grafico:', e);
  } finally {
    busySeries = false;
  }
}

// ==================== timeframe ====================
$('tf').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  [...$('tf').children].forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  minutos = parseInt(b.dataset.min, 10);
  bucket = parseInt(b.dataset.bucket, 10);
  ultimoSetData = 0;             // forca setData completo ao trocar de janela
  carregaGrafico(true);
});

// ==================== loop ====================
async function tick() {
  try {
    const [s, d, b] = await Promise.all([
      window.lab.status(), window.lab.dbstats(), window.lab.book(),
    ]);
    paintStatus(s);
    paintStats(d);
    paintBook(b);
  } catch (e) {
    console.error(e);
  }
}

// ==================== acoes ====================
function msg(el, txt, kind) {
  el.textContent = txt;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

$('btn-start').onclick = async () => {
  msg($('ctl-msg'), 'iniciando...');
  const r = await window.lab.start();
  msg($('ctl-msg'), r.msg, r.ok ? 'ok' : 'bad');
  tick();
};

$('btn-stop').onclick = async () => {
  msg($('ctl-msg'), 'parando...');
  const r = await window.lab.stop();
  msg($('ctl-msg'), r.msg, r.ok ? 'ok' : 'bad');
  tick();
};

$('btn-log').onclick = () => window.lab.openlog();

$('btn-refresh-log').onclick = async () => {
  $('log-out').textContent = await window.lab.logtail();
};

async function rodar(method) {
  const el = $('an-msg');
  msg(el, 'rodando...');
  const opts = {
    custo: parseFloat($('f-custo').value) || 7.5,
    fator: parseFloat($('f-fator').value) || 2,
  };
  if ($('f-csv').checked) opts.csv = 'tests/fixtures/book_20min.csv';
  else { opts.inicio = $('f-ini').value; opts.fim = $('f-fim').value; }

  const r = await window.lab.analysis(method, opts);
  $('an-out').textContent = r.out || '— sem saida —';
  msg(el, r.ok ? 'ok' : 'erro', r.ok ? 'ok' : 'bad');
}

$('btn-tempo').onclick = () => rodar('tempo');
$('btn-linhas').onclick = () => rodar('linhas');

// ==================== boot ====================
// erros aparecem no painel de log em vez de morrer calado
window.__erros = [];
window.addEventListener('error', e => {
  window.__erros.push(String(e.message));
  const el = $('log-out');
  if (el) el.textContent = 'ERRO JS: ' + e.message + '\n' + el.textContent;
});
window.addEventListener('unhandledrejection', e => {
  window.__erros.push(String(e.reason));
});

(async () => {
  try {
    initChart();
    $('repo-path').textContent = await window.lab.repo();
    $('log-out').textContent = await window.lab.logtail();
    await tick();
    await carregaGrafico(true);
  } catch (err) {
    window.__erros.push('boot: ' + err.message);
    $('log-out').textContent = 'FALHA NO BOOT: ' + err.message + '\n' + err.stack;
    window.__ready = 'erro';
    return;
  }

  setInterval(tick, 1500);                    // status, metricas, book
  setInterval(() => carregaGrafico(false), 1000);  // grafico a 1 s, incremental
  window.__ready = true;              // sinaliza boot completo (usado nos testes)
})();
