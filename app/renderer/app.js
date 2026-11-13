// ==================== estado ====================
let chartApi = null;          // lightweight-charts
let candleSeries = null;
let volSeries = null;
let minutos = 30;             // janela do grafico (min)
let bucket = 60;              // segundos por candle
let busySeries = false;
let pendente = null;          // pedido que chegou enquanto outro rodava
let geracao = 0;              // incrementa a cada troca de timeframe
let geracaoAplicada = -1;     // qual geracao esta no grafico
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
// As pilulas do header foram removidas: repetiam os 4 cards logo abaixo.
// Mantido como no-op para nao quebrar chamadas antigas.
// ==================== status (pilulas do header) ====================
// Os 4 cards foram removidos: ocupavam 103 px de altura para repetir o que o
// header ja pode mostrar. Agora a pilula carrega o estado (bolinha) e o detalhe
// vai num tooltip rico.

function pillTexto(k, linhas) {
  const el = document.querySelector(`.pill[data-k="${k}"]`);
  if (el) el.setAttribute('data-tip', linhas.join('\n'));
}

function paintStatus(s) {
  const set = (k, on) => {
    const el = document.querySelector(`.pill[data-k="${k}"]`);
    if (el) el.classList.toggle('on', !!on);
  };

  set('mt5', s.mt5);
  pillTexto('mt5', [
    `MT5 — ${s.mt5 ? 'aberto' : 'fechado'}`,
    'Terminal MetaTrader 5 via Wine/Proton.',
    s.mt5 ? 'Coletando book e tick normalmente.'
          : 'Feche e reabra pelo Lutris. O CLI está quebrado, então não dá para abrir por script.',
  ]);

  set('bridge', s.bridge);
  pillTexto('bridge', [
    `Ponte RPyC — ${s.bridge ? 'ativa' : 'fora'}`,
    'Porta 18812 · liga o Python ao MT5.',
    s.bridge ? 'Latência típica: 5–80 ms por chamada.'
             : 'Sobe sozinha ao clicar em Ligar.',
  ]);

  const dbOn = !!s.docker;
  set('docker', dbOn);
  pillTexto('docker', [
    `Banco — ${dbOn ? 'no ar' : 'fora'}`,
    'TimescaleDB :5434 · docker mercado-db',
    dbOn ? s.docker : 'Container parado. Sobe junto com a coleta.',
    'Tabelas: book (snapshots), tick (negócios), book_delta_v2.',
  ]);

  const c = s.collector;
  set('collector', !!c);
  if (c) {
    pillTexto('collector', [
      `Coletor — ${c.symbol}`,
      `pid ${c.pid} · coleta_v5 · flush 0,1 s`,
      'Grava snapshot do book + delta por preço a cada mudança.',
      'Detecta o contrato vigente sozinho na virada do mês.',
    ]);
    // mostra o contrato na propria pilula: e a informacao mais util do conjunto
    const el = document.querySelector('.pill[data-k="collector"]');
    if (el) el.lastChild.textContent = ` ${c.symbol}`;
  } else {
    pillTexto('collector', [
      'Coletor — parado',
      'Nenhum processo coleta_v5 rodando.',
      'Clique em Ligar (▶) para subir banco, ponte e coletor.',
    ]);
    const el = document.querySelector('.pill[data-k="collector"]');
    if (el) el.lastChild.textContent = 'Coletor';
  }

  const fEl = document.querySelector('.pill[data-k="fonte"]');
  if (fEl) {
    const ehVM = (s.fonte || 'local') === 'vm';
    fEl.lastChild.textContent = ehVM ? ' VM' : ' Local';
    fEl.classList.toggle('on', !s.offline);
    fEl.classList.toggle('vm', ehVM);
    fEl.setAttribute('data-tip', [
      `Fonte — ${ehVM ? 'VM Inovatech' : 'esta máquina'}`,
      ehVM ? 'túnel SSH · 127.0.0.1:5433' : '127.0.0.1:5434',
      ehVM ? 'O MT5 e o banco rodam na VM. Aqui só se visualiza.'
           : 'MT5, ponte, banco e coletor rodam aqui.',
      s.offline ? 'VM fora do ar — o painel mostra o último dado conhecido.'
                : 'Mude em Configurações → Fonte dos dados.',
    ].join('\n'));
  }

  $('btn-start').disabled = !!c || !s.mt5;
  $('btn-stop').disabled = !c;
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
  if (!candleSeries) return;

  // Se ja tem um pedido rodando, ENFILEIRA em vez de descartar. Descartar fazia
  // o clique no timeframe se perder e o grafico ficar preso no anterior.
  if (busySeries) {
    pendente = { completo: completo || !!(pendente && pendente.completo) };
    return;
  }

  const g = geracao;
  const temDados = candleSeries.data().length > 0;
  // Decide ANTES de buscar: carga completa precisa da janela toda; se pedirmos a
  // janela curta e depois setData(), o grafico perde o historico.
  const vaiCompleto = completo || g !== geracaoAplicada || !temDados
    || (Date.now() - ultimoSetData > 30000);

  busySeries = true;
  try {
    // janela toda custa ~209 ms (120 min); janela curta custa ~7-12 ms.
    const janela = vaiCompleto ? minutos : Math.max(3, Math.ceil((bucket * 2) / 60));
    const r = await window.lab.candles(janela, bucket);
    if (r.erro || !r.candles || !r.candles.length) return;

    // Se a geracao mudou enquanto buscava, este resultado e de outro timeframe.
    if (g !== geracao) return;

    const { candles, vols } = paraChart(r.candles);

    if (vaiCompleto) {
      candleSeries.setData(candles);
      volSeries.setData(vols);
      ultimoSetData = Date.now();
      geracaoAplicada = g;
    } else {
      candleSeries.update(candles[candles.length - 1]);
      volSeries.update(vols[vols.length - 1]);
    }
  } catch (e) {
    console.error('grafico:', e);
  } finally {
    busySeries = false;
    if (pendente) {                 // executa o que ficou na fila
      const p = pendente;
      pendente = null;
      carregaGrafico(p.completo);
    }
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
  $('tf-atual').textContent = b.textContent.trim();   // rotulo visivel do timeframe
  cfg.tf = `${minutos}:${bucket}`;                     // lembra a escolha para a proxima abertura
  salvaConfig();
  geracao++;                     // invalida qualquer busca em voo do timeframe anterior
  ultimoSetData = 0;
  carregaGrafico(true);
});

// ==================== loops ====================
// Separados por custo: dbStats conta a tabela do dia inteiro (caro), book e status
// sao leves. Antes tudo ia junto a cada 1,5 s, entao o book nunca passava disso.
async function tickLeve() {
  try {
    const [s, b] = await Promise.all([window.lab.status(), window.lab.book()]);
    paintStatus(s);
    paintBook(b);
  } catch (e) { console.error(e); }
}

async function tickStats() {
  try {
    paintStats(await window.lab.dbstats());
  } catch (e) { console.error(e); }
}

async function tick() { await Promise.all([tickLeve(), tickStats()]); }

// ==================== acoes ====================
function msg(el, txt, kind) {
  el.textContent = txt;
  // no header a classe e 'ctl-msg'; nos paineis continua 'msg'
  const base = el.id === 'ctl-msg' ? 'ctl-msg' : 'msg';
  el.className = base + (kind ? ' ' + kind : '');
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


// ==================== TOOLTIP FLUTUANTE ====================
// Um unico elemento, posicionado por JS. Mede a largura real depois de mostrar e
// faz clamp nas DUAS bordas — a versao anterior so tratava o lado direito e o
// texto era cortado quando o rotulo ficava colado na esquerda.
const TT = document.createElement('div');
TT.id = 'tt';
document.body.appendChild(TT);
let ttAtual = null;

function mostraTip(el) {
  const bruto = el.getAttribute('data-tip');
  if (!bruto) return;
  ttAtual = el;

  // formato: 1a linha titulo, 2a subtitulo, resto detalhes
  TT.textContent = '';
  bruto.split('\n').forEach((linha, i) => {
    const d = document.createElement('div');
    d.textContent = linha;
    d.className = i === 0 ? 'tt-titulo' : (i === 1 ? 'tt-sub' : 'tt-linha');
    TT.appendChild(d);
  });
  TT.classList.add('on');

  // medir DEPOIS de exibir: offsetWidth ja respeita o max-width do CSS
  const tw = TT.offsetWidth;
  const th = TT.offsetHeight;
  const r = el.getBoundingClientRect();
  const margem = 8;

  // horizontal: centra no elemento e prende dentro da janela
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(margem, Math.min(left, window.innerWidth - tw - margem));

  // vertical: abaixo; se nao couber, acima; se nem isso, cola no topo
  let top = r.bottom + 8;
  if (top + th > window.innerHeight - margem) top = r.top - th - 8;
  if (top < margem) top = margem;

  TT.style.left = Math.round(left) + 'px';
  TT.style.top = Math.round(top) + 'px';
}

function escondeTip() {
  TT.classList.remove('on');
  ttAtual = null;
}

document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tip]');
  if (el && el !== ttAtual) mostraTip(el);
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) return;
  const para = e.relatedTarget;
  if (!para || !el.contains(para)) escondeTip();
});
window.addEventListener('scroll', escondeTip, true);
window.addEventListener('blur', escondeTip);

// ==================== CONFIGURACOES ====================
const CFG_PADRAO = {
  grafico: 200,     // ms entre redraws do grafico
  book: 400,        // ms entre redraws do book/status
  metricas: 3000,   // ms entre consultas pesadas
  tf: '30:60',      // timeframe inicial "min:bucket"
  custo: 7.5,
  fator: 2,
};
let cfg = { ...CFG_PADRAO };
let timers = {};

function carregaConfig() {
  try {
    const salvo = JSON.parse(localStorage.getItem('winbooklab.cfg') || '{}');
    cfg = { ...CFG_PADRAO, ...salvo };
  } catch { cfg = { ...CFG_PADRAO }; }
}

function salvaConfig() {
  try { localStorage.setItem('winbooklab.cfg', JSON.stringify(cfg)); } catch {}
}

function aplicaTimers() {
  clearInterval(timers.grafico);
  clearInterval(timers.book);
  clearInterval(timers.metricas);
  timers.grafico = setInterval(() => carregaGrafico(false), cfg.grafico);
  timers.book = setInterval(tickLeve, cfg.book);
  timers.metricas = setInterval(tickStats, cfg.metricas);
}

function aplicaTimeframe(valor) {
  const [min, buck] = String(valor).split(':').map(Number);
  minutos = min; bucket = buck;
  geracao++; ultimoSetData = 0;
  // marca o botao correspondente
  [...$('tf').children].forEach(b => {
    const on = b.dataset.min === String(min);
    b.classList.toggle('on', on);
    if (on) $('tf-atual').textContent = b.textContent.trim();
  });
  carregaGrafico(true);
}

async function abreConfig() {
  try {
    const c = await window.lab.config();
    $('cfg-fonte').value = c.fonte;
    $('cfg-vm-host').value = c.vm.host;
    $('cfg-vm-user').value = c.vm.usuario;
    $('cfg-vm-porta').value = String(c.vm.portaLocal);
  } catch {}
  atualizaEstadoFonte(false);
  $('cfg-grafico').value = String(cfg.grafico);
  $('cfg-book').value = String(cfg.book);
  $('cfg-metricas').value = String(cfg.metricas);
  $('cfg-tf').value = cfg.tf;
  $('cfg-custo').value = String(cfg.custo);
  $('cfg-fator').value = String(cfg.fator);
  $('modal-config').classList.add('aberto');
}

function fechaConfig() {
  $('modal-config').classList.remove('aberto');
}

// Grava a escolha no processo principal (nao no localStorage: muda DSN e tunel).
async function salvaFonte() {
  return window.lab.configSet({
    fonte: $('cfg-fonte').value,
    vm: {
      host: $('cfg-vm-host').value.trim() || '192.168.201.50',
      usuario: $('cfg-vm-user').value.trim() || 'root',
      portaLocal: parseInt($('cfg-vm-porta').value, 10) || 5433,
    },
  });
}

// Mostra o estado REAL da ligacao, nao a intencao: a escolha pode ser 'vm' e o
// tunel estar caido. `testar` abre o tunel e consulta o banco.
async function atualizaEstadoFonte(testar = true) {
  const el = $('cfg-vm-estado');
  const escolha = $('cfg-fonte').value;
  $('cfg-vm').classList.toggle('on', escolha === 'vm');
  if (escolha !== 'vm') { el.textContent = '\u2014'; el.className = 'cfg-estado'; return; }
  if (!testar) { el.textContent = 't\u00fanel n\u00e3o verificado'; el.className = 'cfg-estado'; return; }
  el.textContent = 'conectando\u2026'; el.className = 'cfg-estado';
  try {
    const f = await window.lab.fonte();
    if (f.preparo && f.preparo.ok && f.dsnOk) {
      el.textContent = `t\u00fanel ativo${f.preparo.pid ? ' (pid ' + f.preparo.pid + ')' : ''}`
                     + `\nbanco da VM acess\u00edvel`;
      el.className = 'cfg-estado ok';
    } else {
      el.textContent = 'sem conex\u00e3o: ' + (f.motivo || 'motivo desconhecido');
      el.className = 'cfg-estado err';
    }
  } catch (e) {
    el.textContent = 'erro: ' + e.message;
    el.className = 'cfg-estado err';
  }
}

function aplicarConfigDaTela() {
  cfg.grafico = parseInt($('cfg-grafico').value, 10);
  cfg.book = parseInt($('cfg-book').value, 10);
  cfg.metricas = parseInt($('cfg-metricas').value, 10);
  cfg.tf = $('cfg-tf').value;
  cfg.custo = parseFloat($('cfg-custo').value);
  cfg.fator = parseFloat($('cfg-fator').value);

  salvaConfig();
  salvaFonte().catch(() => {});
  aplicaTimers();
  aplicaTimeframe(cfg.tf);
  $('f-custo').value = cfg.custo;
  $('f-fator').value = cfg.fator;
  fechaConfig();
}

$('btn-config').onclick = abreConfig;
$('cfg-fonte').onchange = async () => {
    await salvaFonte();
    atualizaEstadoFonte(true);
    // o log tambem muda de origem: local le arquivo, VM le `docker logs`
    try { $('log-out').textContent = 'carregando\u2026'; $('log-out').textContent = await window.lab.logtail(); } catch {}
  };
  for (const id of ['cfg-vm-host', 'cfg-vm-user', 'cfg-vm-porta']) {
    $(id).onchange = () => { salvaFonte().then(() => atualizaEstadoFonte(true)); };
  }
  $('cfg-fechar').onclick = fechaConfig;
$('cfg-cancelar').onclick = fechaConfig;
$('cfg-salvar').onclick = aplicarConfigDaTela;
$('modal-config').addEventListener('click', e => {
  if (e.target === $('modal-config')) fechaConfig();   // clique no fundo fecha
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('modal-config').classList.contains('aberto')) fechaConfig();
});

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
    carregaConfig();
    initChart();
    $('repo-path').textContent = await window.lab.repo();
    $('log-out').textContent = await window.lab.logtail();
    $('f-custo').value = cfg.custo;
    $('f-fator').value = cfg.fator;
    aplicaTimeframe(cfg.tf);
    await tick();
  } catch (err) {
    window.__erros.push('boot: ' + err.message);
    $('log-out').textContent = 'FALHA NO BOOT: ' + err.message + '\n' + err.stack;
    window.__ready = 'erro';
    return;
  }

  aplicaTimers();   // cadencias vem das configuracoes
  window.__ready = true;              // sinaliza boot completo (usado nos testes)
})();
