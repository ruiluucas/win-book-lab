// Configuracao persistida do app: de onde vem o dado.
//
// Duas fontes:
//   local -> Postgres da propria maquina (127.0.0.1:5434)
//   vm    -> Postgres da VM Inovatech, alcancado por tunel SSH (127.0.0.1:5433)
//
// O IP da VM e de uma rede interna atras de VPN. O banco so escuta em
// 127.0.0.1 LA; por isso o tunel. Senha nunca fica no codigo: vai em
// ~/.config/winbook-lab/vm.env com chmod 600.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.config', 'winbook-lab');
const ARQ = path.join(DIR, 'config.json');
const ARQ_SENHA = path.join(DIR, 'vm.env');

const PADRAO = {
  fonte: 'local',
  vm: {
    host: '192.168.201.50',
    usuario: 'root',
    portaRemota: 5432,   // porta do Postgres dentro da VM
    portaLocal: 5433,    // onde o tunel escuta aqui
    db: 'mercado',
    usuarioDb: 'winbook',
  },
  local: {
    porta: 5434,
    db: 'mercado',
    usuarioDb: 'postgres',
  },
};

function mescla(base, extra) {
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? mescla(base[k] || {}, v)
      : v;
  }
  return out;
}

function carrega() {
  try {
    return mescla(PADRAO, JSON.parse(fs.readFileSync(ARQ, 'utf8')));
  } catch {
    return mescla(PADRAO, {});
  }
}

function salva(cfg) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const final = mescla(PADRAO, cfg);
  fs.writeFileSync(ARQ, JSON.stringify(final, null, 2), { mode: 0o600 });
  return final;
}

// Le PG_SENHA de ~/.config/winbook-lab/vm.env. Formato: chave=valor por linha.
function senhaVM() {
  try {
    const txt = fs.readFileSync(ARQ_SENHA, 'utf8');
    for (const linha of txt.split('\n')) {
      const m = linha.match(/^\s*(?:export\s+)?PG_SENHA\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return null;
}

// DSN da senha local ja existente no lab.js (mantida la para nao duplicar segredo)
function dsnVM(senhaLocalFallback) {
  const c = carrega();
  const senha = senhaVM() || senhaLocalFallback;
  if (!senha) return null;
  const v = c.vm;
  return `host=127.0.0.1 port=${v.portaLocal} dbname=${v.db} ` +
         `user=${v.usuarioDb} password=${senha} connect_timeout=5`;
}

module.exports = { carrega, salva, senhaVM, dsnVM, ARQ, ARQ_SENHA, DIR, PADRAO };
