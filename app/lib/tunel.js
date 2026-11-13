// Tunel SSH para o banco da VM.
//
// A VM expoe o Postgres so em 127.0.0.1. Para o app daqui ler, abrimos
//   ssh -N -L 5433:127.0.0.1:5432 root@192.168.201.50
// e o app fala com 127.0.0.1:5433 como se fosse local.
//
// O processo do tunel e filho deste app. Se a rede cair, o ssh morre; o
// status passa a "caido" e a proxima consulta tenta reabrir.

const { spawn, execFile } = require('child_process');
const net = require('net');

let proc = null;
let ultimoErro = null;

function portaAberta(porta, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port: porta, host, timeout: 900 });
    const fim = (ok) => { s.destroy(); resolve(ok); };
    s.once('connect', () => fim(true));
    s.once('timeout', () => fim(false));
    s.once('error', () => fim(false));
  });
}

// Opcoes do ssh que fazem o tunel se comportar:
//   ExitOnForwardFailure -> falha rapido se a porta local estiver ocupada
//   ServerAlive*         -> derruba em ~45 s quando a rede cai, em vez de ficar
//                           pendurado para sempre (foi o que aconteceu hoje)
function argumentos(cfg) {
  const v = cfg.vm;
  return [
    '-N',
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-L', `${v.portaLocal}:127.0.0.1:${v.portaRemota}`,
    `${v.usuario}@${v.host}`,
  ];
}

async function garante(cfg) {
  const v = cfg.vm;

  // ja tem alguem escutando na porta? pode ser tunel nosso ou de fora
  if (await portaAberta(v.portaLocal)) {
    return { ok: true, ja: true, pid: proc ? proc.pid : null };
  }

  if (proc && proc.exitCode === null) {
    // processo vivo mas porta fechada: ainda subindo ou travado
    return { ok: false, motivo: 'tunel subindo', pid: proc.pid };
  }

  ultimoErro = null;
  proc = spawn('ssh', argumentos(cfg), { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (d) => { ultimoErro = String(d).trim().slice(0, 300); });
  proc.on('exit', () => { proc = null; });

  // espera a porta abrir (max 6 s)
  for (let i = 0; i < 24; i++) {
    if (await portaAberta(v.portaLocal)) {
      return { ok: true, pid: proc ? proc.pid : null };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, motivo: ultimoErro || 'tunel nao abriu', pid: proc ? proc.pid : null };
}

function derruba() {
  if (proc && proc.exitCode === null) {
    try { proc.kill('SIGTERM'); } catch {}
  }
  proc = null;
}

function status() {
  return {
    pid: proc && proc.exitCode === null ? proc.pid : null,
    erro: ultimoErro,
  };
}

module.exports = { garante, derruba, status, portaAberta, argumentos };
