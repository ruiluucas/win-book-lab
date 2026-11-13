// ---------- estado ----------
const hist = [];                 // historico de snapshots/60s
const MAXP = 90;
let pollTimer = null;
let lastSnap1min = null;

const $ = id => document.getElementById(id);
const fmt = n => (n === undefined || n === null || isNaN(n)) ? '—' : n.toLocaleString('pt-BR');

// ---------- status ----------
function setPill(k, on) {
  document.querySelector(`.pill[data-k="${k}"]`).classList.toggle('on', !!on);
}

function paintStatus(s) {
  // MT5
  setPill('mt5', s.mt5);
  $('v-mt5').textContent = s.mt5 ? 'aberto' : 'fechado';
  $('s-mt5').textContent = s.mt5 ? 'ok' : 'off';
  $('s-mt5').className = 'st ' + (s.mt5 ? 'ok-on' : 'ok-off');
  $('c-mt5').classList.toggle('on', s.mt5);

  // Ponte
  setPill('bridge', s.bridge);
  $('v-bridge').textContent = s.bridge ? 'ativa' : 'off';
  $('s-bridge').textContent = s.bridge ? 'ok' : 'off';
  $('s-bridge').className = 'st ' + (s.bridge ? 'ok-on' : 'ok-off');
  $('c-bridge').classList.toggle('on', s.bridge);

  // Banco
  const dbOn = !!s.docker;
  setPill('docker', dbOn);
  $('v-docker').textContent = dbOn ? 'no ar' : 'off';
  $('s-docker').textContent = dbOn ? 'ok' : 'off';
  $('s-docker').className = 'st ' + (dbOn ? 'ok-on' : 'ok-off');
  $('h-collector').textContent = 'v5 · delta por preço';
  $('v-docker').title = s.docker || '';
  $('c-docker').classList.toggle('on', dbOn);

  // Coletor
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

// ---------- metricas ----------
function paintStats(d) {
  if (d.erro) {
    ['m-snap', 'm-book', 'm-tick', 'm-delta', 'm-rate', 'm-last'].forEach(id => $(id).textContent = '—');
    return;
  }
  $('m-snap').textContent = fmt(d.snapHoje);
  $('m-book').textContent = fmt(d.bookHoje);
  $('m-tick').textContent = fmt(d.tickHoje);
  $('m-delta').textContent = fmt(d.deltaHoje);
  const taxa = d.snap1min ? (d.snap1min / 60).toFixed(1) : '0.0';
  $('m-rate').textContent = d.snap1min ? `${taxa}/s` : 'parado';
  $('m-last').textContent = d.ultimo || '—';

  // sparkline: snapshots por segundo no ultimo minuto
  const v = d.snap1min || 0;
  if (lastSnap1min === null || v !== lastSnap1min) {
    hist.push(v / 60);
    if (hist.length > MAXP) hist.shift();
    lastSnap1min = v;
  }
  $('chart-now').textContent = v ? `${(v / 60).toFixed(2)} snap/s` : '—';
  drawChart();
}

// ---------- grafico ----------
function drawChart() {
  const c = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight || 90;
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr; c.height = h * dpr;
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (hist.length < 2) { return; }
  const max = Math.max(...hist, 0.5);
  const stepX = w / (MAXP - 1);
  const x0 = w - (hist.length - 1) * stepX;

  // area
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(79,140,255,.30)');
  grad.addColorStop(1, 'rgba(79,140,255,0)');
  ctx.beginPath();
  ctx.moveTo(x0, h);
  hist.forEach((v, i) => ctx.lineTo(x0 + i * stepX, h - (v / max) * (h - 8)));
  ctx.lineTo(x0 + (hist.length - 1) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // linha
  ctx.beginPath();
  hist.forEach((v, i) => {
    const x = x0 + i * stepX, y = h - (v / max) * (h - 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#4f8cff';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // ultimo ponto
  const lx = x0 + (hist.length - 1) * stepX;
  const ly = h - (hist[hist.length - 1] / max) * (h - 8);
  ctx.beginPath();
  ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#4f8cff';
  ctx.fill();
}

// ---------- loop ----------
async function tick() {
  try {
    const [s, d] = await Promise.all([window.lab.status(), window.lab.dbstats()]);
    paintStatus(s);
    paintStats(d);
  } catch (e) {
    console.error(e);
  }
}

// ---------- acoes ----------
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

// ---------- boot ----------
(async () => {
  $('repo-path').textContent = await window.lab.repo();
  $('log-out').textContent = await window.lab.logtail();
  await tick();
  pollTimer = setInterval(tick, 2000);
})();

window.addEventListener('resize', drawChart);
