#!/usr/bin/env node
// Teste do nucleo do app, sem Electron e sem interface.
const lab = require('./lib/lab');
let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  console.log(`  ${cond ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? '  -> ' + detalhe : ''}`);
  if (!cond) falhas++;
};

(async () => {
  console.log('== 1. REPO resolvido ==');
  ok(lab.REPO.endsWith('win-book-lab'), 'REPO aponta para o repo', lab.REPO);

  console.log('\n== 2. getStatus ==');
  const s = await lab.getStatus();
  console.log('   ' + JSON.stringify(s));
  ok(typeof s.mt5 === 'boolean', 'mt5 e booleano');
  ok(typeof s.bridge === 'boolean', 'bridge e booleano');
  ok(s.collector === null || (s.collector.pid && s.collector.symbol), 'coletor tem pid e simbolo');

  console.log('\n== 3. dbStats ==');
  const d = await lab.dbStats();
  console.log('   ' + JSON.stringify(d));
  ok(!d.erro, 'sem erro', d.erro || '');
  ok(d.snapHoje > 0, 'tem snapshots hoje', String(d.snapHoje));
  ok(d.bookHoje >= d.snapHoje, 'linhas de book >= snapshots');
  ok(typeof d.ultimo === 'string' && d.ultimo.includes(':'), 'ultima escrita e horario', d.ultimo);

  console.log('\n== 4. tailLog ==');
  const t = await lab.tailLog();
  ok(typeof t === 'string' && t.length > 0, 'log tem conteudo', `${t.split('\n').length} linhas`);

  console.log('\n== 5. listLogs ==');
  const l = lab.listLogs();
  ok(Array.isArray(l) && l.length > 0, 'logs listados', l.map(x => x.nome).join(', '));

  console.log('\n== 6. runAnalysis TEMPO (fixture, sem banco) ==');
  const r1 = await lab.runAnalysis('tempo', { csv: 'tests/fixtures/book_20min.csv', custo: 7.5, fator: 2 });
  ok(r1.ok, 'rodou', r1.ok ? '' : r1.out.slice(0, 200));
  ok(/REGRA TEMPORAL/.test(r1.out), 'mostra a regra temporal');
  ok(/SENSIBILIDADE DE CUSTO/.test(r1.out), 'mostra os 3 cenarios de custo');

  console.log('\n== 7. runAnalysis ANTIGO (fixture) ==');
  const r2 = await lab.runAnalysis('linhas', { csv: 'tests/fixtures/book_20min.csv', custo: 5 });
  ok(r2.ok, 'rodou', r2.ok ? '' : r2.out.slice(0, 200));
  ok(/pts\/op/.test(r2.out), 'tem a tabela de pts/op');

  console.log('\n== 8. runAnalysis sem janela (deve recusar) ==');
  const r3 = await lab.runAnalysis('tempo', {});
  ok(!r3.ok && /Janela obrigatoria/.test(r3.out), 'recusa sem janela', r3.out);

  console.log('\n== 9. start quando ja roda (nao duplica) ==');
  const st = await lab.startCollection();
  console.log('   ' + st.msg);
  ok(st.ok, 'start idempotente', st.msg);

  console.log(`\n${falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' FALHA(S)'}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
