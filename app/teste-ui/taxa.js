const http=require('http');
const get=p=>new Promise((r,j)=>{http.get({host:'127.0.0.1',port:9222,path:p},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>r(JSON.parse(d)))}).on('error',j)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const t=await get('/json'); const pg=t.find(x=>x.type==='page');
  const ws=new WebSocket(pg.webSocketDebuggerUrl); let id=0; const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
  await new Promise(r=>ws.onopen=r);
  const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
    if(r.result?.exceptionDetails) return null; return r.result?.result?.value;};
  for(let i=0;i<40;i++){ if(await ev('window.__ready===true')) break; await sleep(500); }

  let falhas=0;
  const ok=(c,n,d='')=>{console.log(`  ${c?'PASS':'FALHA'}  ${n}${d?'  -> '+d:''}`); if(!c)falhas++;};

  console.log('== 1. BOTOES NO HEADER ==');
  const noHeader = await ev(`document.querySelectorAll('.titlebar #btn-start, .titlebar #btn-stop, .titlebar #btn-log').length`);
  ok(noHeader === 3, 'os 3 botoes estao na titlebar', String(noHeader));
  ok(await ev(`document.querySelector('main .toolbar .iconbtn#btn-start') === null`), 'faixa antiga removida');
  const h = await ev(`document.querySelector('.titlebar').getBoundingClientRect().height`);
  ok(h <= 50, 'header compacto', h+'px');

  console.log('\n== 2. TAXA DO GRAFICO (alvo 5x/s) ==');
  await ev(`
    window.__upd = 0;
    (function(){ const o = candleSeries.setData.bind(candleSeries);
      candleSeries.setData = function(d){ window.__upd++; return o(d); }; })();
    (function(){ const o2 = candleSeries.update.bind(candleSeries);
      candleSeries.update = function(c){ window.__upd++; return o2(c); }; })();
  `);
  // conta o numero de vezes que o grafico recebe dado em 4s
  const t0 = Date.now();
  await sleep(4000);
  const ups = await ev('window.__upd');
  const taxa = ups / ((Date.now()-t0)/1000);
  ok(taxa >= 3.5, 'grafico recebe >= 3,5 atualizacoes/s', `${taxa.toFixed(1)}/s (${ups} em 4s)`);

  console.log('\n== 3. TAXA DO BOOK ==');
  await ev(`window.__paint = 0; (function(){const o=paintBook; window.paintBook=function(b){window.__paint++; return o(b);};})();`);
  const t1 = Date.now();
  await sleep(4000);
  const p = await ev('window.__paint');
  const taxaBook = p / ((Date.now()-t1)/1000);
  ok(taxaBook >= 2, 'book repinta >= 2x/s', `${taxaBook.toFixed(1)}/s`);

  console.log('\n== 4. DADO FRESCO NA TELA ==');
  const a = await ev('document.getElementById("m-last").textContent');
  await sleep(2500);
  const b = await ev('document.getElementById("m-last").textContent');
  console.log(`   ultima escrita: ${a} -> ${b}`);
  ok(a !== '—', 'ultima escrita preenchida', b);

  console.log('\n== 5. ERROS ==');
  ok((await ev('JSON.stringify(window.__erros||[])')) === '[]', 'zero erro JS');

  console.log(`\n${falhas===0?'OK':falhas+' FALHA(S)'}`);
  ws.close(); process.exit(falhas===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
