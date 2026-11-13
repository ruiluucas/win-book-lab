// Testes do nucleo de configuracao e do tunel — rodam sem Electron.
//   node teste-config.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = require('./lib/config');
const tunel = require('./lib/tunel');

let passou = 0, falhou = 0;
function ok(nome, fn) {
  try { fn(); console.log(`  PASS  ${nome}`); passou++; }
  catch (e) { console.log(`  FALHA ${nome}  -> ${e.message}`); falhou++; }
}
function okAsync(nome, fn) {
  return fn().then(
    () => { console.log(`  PASS  ${nome}`); passou++; },
    (e) => { console.log(`  FALHA ${nome}  -> ${e.message}`); falhou++; },
  );
}

(async () => {
  console.log('== configuracao ==');

  ok('carrega devolve a fonte', () => {
    const c = config.carrega();
    assert.ok(['local', 'vm'].includes(c.fonte), 'fonte invalida: ' + c.fonte);
  });

  ok('carrega traz host e portas da VM', () => {
    const c = config.carrega();
    assert.ok(c.vm.host, 'sem host');
    assert.ok(Number.isInteger(c.vm.portaLocal), 'portaLocal nao inteira');
    assert.ok(c.vm.portaLocal !== c.vm.portaRemota, 'porta local igual a remota');
  });

  ok('config parcial nao perde o resto', () => {
    // salva so a fonte e confere que host/portas continuam la
    const antes = config.carrega();
    const original = fs.existsSync(config.ARQ) ? fs.readFileSync(config.ARQ, 'utf8') : null;
    try {
      config.salva({ fonte: antes.fonte });
      const d = config.carrega();
      assert.strictEqual(d.vm.host, antes.vm.host, 'host sumiu');
      assert.strictEqual(d.vm.portaLocal, antes.vm.portaLocal, 'porta sumiu');
    } finally {
      if (original === null) { try { fs.unlinkSync(config.ARQ); } catch {} }
      else fs.writeFileSync(config.ARQ, original);
    }
  });

  ok('config.json fica com permissao 600', () => {
    const original = fs.existsSync(config.ARQ) ? fs.readFileSync(config.ARQ, 'utf8') : null;
    try {
      config.salva(config.carrega());
      const modo = fs.statSync(config.ARQ).mode & 0o777;
      assert.strictEqual(modo, 0o600, 'modo ' + modo.toString(8));
    } finally {
      if (original) fs.writeFileSync(config.ARQ, original);
    }
  });

  ok('senhaVM le PG_SENHA do arquivo', () => {
    const original = fs.existsSync(config.ARQ_SENHA) ? fs.readFileSync(config.ARQ_SENHA, 'utf8') : null;
    try {
      fs.mkdirSync(config.DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(config.ARQ_SENHA, '# comentario\nPG_SENHA="abc123"\n', { mode: 0o600 });
      assert.strictEqual(config.senhaVM(), 'abc123', 'nao tirou as aspas');
    } finally {
      if (original === null) { try { fs.unlinkSync(config.ARQ_SENHA); } catch {} }
      else fs.writeFileSync(config.ARQ_SENHA, original);
    }
  });

  ok('senhaVM aceita export e sem aspas', () => {
    const original = fs.existsSync(config.ARQ_SENHA) ? fs.readFileSync(config.ARQ_SENHA, 'utf8') : null;
    try {
      fs.mkdirSync(config.DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(config.ARQ_SENHA, 'export PG_SENHA=xyz789\n', { mode: 0o600 });
      assert.strictEqual(config.senhaVM(), 'xyz789');
    } finally {
      if (original === null) { try { fs.unlinkSync(config.ARQ_SENHA); } catch {} }
      else fs.writeFileSync(config.ARQ_SENHA, original);
    }
  });

  ok('dsnVM aponta para a porta do tunel, nao para a da VM', () => {
    const original = fs.existsSync(config.ARQ_SENHA) ? fs.readFileSync(config.ARQ_SENHA, 'utf8') : null;
    try {
      const c = config.carrega();
      fs.mkdirSync(config.DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(config.ARQ_SENHA, 'PG_SENHA=teste\n', { mode: 0o600 });
      const dsn = config.dsnVM();
      assert.ok(dsn.includes(`port=${c.vm.portaLocal}`), 'porta errada: ' + dsn);
      assert.ok(dsn.includes('host=127.0.0.1'), 'host deveria ser o tunel local');
    } finally {
      if (original === null) { try { fs.unlinkSync(config.ARQ_SENHA); } catch {} }
      else fs.writeFileSync(config.ARQ_SENHA, original);
    }
  });

  ok('sem senha, dsnVM devolve null em vez de DSN quebrado', () => {
    const original = fs.existsSync(config.ARQ_SENHA) ? fs.readFileSync(config.ARQ_SENHA, 'utf8') : null;
    try {
      try { fs.unlinkSync(config.ARQ_SENHA); } catch {}
      assert.strictEqual(config.dsnVM(), null);
    } finally {
      if (original !== null) fs.writeFileSync(config.ARQ_SENHA, original);
    }
  });

  console.log('\n== tunel ==');

  ok('ssh recebe -N e o forward na porta local', () => {
    const c = config.carrega();
    const a = tunel.argumentos(c);
    assert.ok(a.includes('-N'), 'sem -N (abriria shell)');
    const fwd = a[a.indexOf('-L') + 1];
    assert.strictEqual(fwd, `${c.vm.portaLocal}:127.0.0.1:${c.vm.portaRemota}`);
  });

  ok('ssh falha rapido e nao fica pendurado', () => {
    const a = tunel.argumentos(config.carrega()).join(' ');
    assert.ok(a.includes('ExitOnForwardFailure=yes'), 'sem ExitOnForwardFailure');
    assert.ok(a.includes('ServerAliveInterval'), 'sem ServerAlive');
    assert.ok(a.includes('BatchMode=yes'), 'sem BatchMode (pediria senha no terminal)');
  });

  ok('destino do ssh e usuario@host', () => {
    const c = config.carrega();
    const a = tunel.argumentos(c);
    assert.strictEqual(a[a.length - 1], `${c.vm.usuario}@${c.vm.host}`);
  });

  await okAsync('portaAberta devolve false em porta fechada', async () => {
    const r = await tunel.portaAberta(59999);
    assert.strictEqual(r, false);
  });

  ok('status sem tunel nao mente', () => {
    const s = tunel.status();
    assert.ok('pid' in s && 'erro' in s, 'status incompleto');
  });

  console.log(`\n${falhou === 0 ? 'OK' : falhou + ' FALHA(S)'}  (${passou} passaram)`);
  process.exit(falhou === 0 ? 0 : 1);
})();
