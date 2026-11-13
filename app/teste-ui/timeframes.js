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

  const passoAtual = async () => {
    const d = await ev('JSON.stringify(candleSeries.data().map(c=>c.time).slice(-4))');
    try { const a=JSON.parse(d); return a.length>1 ? a[1]-a[0] : 0; } catch { return 0; }
  };
  const nVelas = async () => await ev('candleSeries.data().length');

  // espera o passo do grafico virar o esperado (ate 8s)
  const esperaPasso = async (esperado) => {
    for (let i=0;i<40;i++){
      if (await passoAtual() === esperado) return true;
      await sleep(200);
    }
    return false;
  };

  const TF = [['10','15s',15],['30','1min',60],['120','5min',300]];

  console.log('== troca simples, com espera ==');
  for (const [min,rot,bucket] of TF) {
    await ev(`document.querySelector('#tf button[data-min="${min}"]').click()`);
    const virou = await esperaPasso(bucket);
    const n = await nVelas();
    ok(virou, `${rot}: grafico mudou para passo de ${bucket}s`, `${n} velas, passo ${await passoAtual()}s`);
  }

  console.log('\n== martelando: 12 trocas rapidas (100ms entre elas) ==');
  const seq = ['10','30','120','10','120','30','120','10','30','120','30','10'];
  for (const min of seq) {
    await ev(`document.querySelector('#tf button[data-min="${min}"]').click()`);
    await sleep(100);
  }
  const ultimo = seq[seq.length-1];
  const bucketFinal = TF.find(x=>x[0]===ultimo)[2];
  const chegou = await esperaPasso(bucketFinal);
  ok(chegou, `apos 12 trocas rapidas, termina em ${bucketFinal}s`, `passo ${await passoAtual()}s, ${await nVelas()} velas`);

  console.log('\n== estado final bate com o botao marcado? ==');
  const marcado = await ev(`document.querySelector('#tf button.on').dataset.bucket`);
  const passo = await passoAtual();
  ok(parseInt(marcado,10) === passo, 'botao marcado == passo do grafico', `botao ${marcado}s | grafico ${passo}s`);

  console.log('\n== erros ==');
  ok((await ev('JSON.stringify(window.__erros||[])')) === '[]', 'zero erro JS');

  console.log(`\n${falhas===0?'TIMEFRAMES OK':falhas+' FALHA(S)'}`);
  ws.close(); process.exit(falhas===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
