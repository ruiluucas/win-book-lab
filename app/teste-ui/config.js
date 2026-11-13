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
    if(r.result?.exceptionDetails) return '<<EXC: '+(r.result.exceptionDetails.exception?.description||'').slice(0,150)+'>>';
    return r.result?.result?.value;};
  await send('Page.reload',{ignoreCache:true});
  await sleep(6000);
  for(let i=0;i<40;i++){ if(await ev('window.__ready===true')) break; await sleep(500); }

  let falhas=0;
  const ok=(c,n,d='')=>{console.log(`  ${c?'PASS':'FALHA'}  ${n}${d?'  -> '+d:''}`); if(!c)falhas++;};

  console.log('== 1. TOOLTIP NAO VAZA ==');
  const ttCheck = await ev(`(async () => {
    const out=[];
    for (const el of [...document.querySelectorAll('[data-tip]')]) {
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      await new Promise(r=>setTimeout(r,25));
      const tt=document.getElementById('tt');
      const r=tt.getBoundingClientRect();
      out.push({id: el.id||el.className.split(' ')[0], ok: r.left>=0 && r.right<=window.innerWidth && r.top>=0 && r.bottom<=window.innerHeight, left:Math.round(r.left), right:Math.round(r.right)});
      el.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));
      await new Promise(r=>setTimeout(r,10));
    }
    return JSON.stringify(out);
  })()`);
  const arr = JSON.parse(ttCheck);
  const fora = arr.filter(x=>!x.ok);
  ok(fora.length === 0, `os ${arr.length} tooltips ficam dentro da janela`, fora.length ? JSON.stringify(fora.slice(0,3)) : 'clamp ok');
  ok(Math.min(...arr.map(x=>x.left)) >= 0, 'nenhum cortado na esquerda', 'menor left=' + Math.min(...arr.map(x=>x.left)));
  ok(Math.max(...arr.map(x=>x.right)) <= 1500, 'nenhum cortado na direita', 'maior right=' + Math.max(...arr.map(x=>x.right)));

  console.log('\n== 2. MODAL DE CONFIGURACOES ==');
  ok(await ev(`document.getElementById('modal-config').classList.contains('aberto')`) === false, 'comeca fechado');
  await ev(`document.getElementById('btn-config').click()`);
  await sleep(300);
  ok(await ev(`document.getElementById('modal-config').classList.contains('aberto')`), 'abre ao clicar na engrenagem');
  const campos = await ev(`JSON.stringify(['cfg-grafico','cfg-book','cfg-metricas','cfg-tf','cfg-custo','cfg-fator'].map(i=>!!document.getElementById(i)))`);
  ok(!campos.includes('false'), 'todos os campos existem', campos);

  console.log('\n== 3. SALVAR APLICA ==');
  await ev(`document.getElementById('cfg-grafico').value='100'`);
  await ev(`document.getElementById('cfg-tf').value='120:300'`);
  await ev(`document.getElementById('cfg-custo').value='5'`);
  await ev(`document.getElementById('cfg-salvar').click()`);
  await sleep(600);
  ok(await ev(`document.getElementById('modal-config').classList.contains('aberto')`) === false, 'fecha ao salvar');
  ok(await ev(`cfg.grafico`) === 100, 'cfg.grafico salvo', String(await ev('cfg.grafico')));
  ok(await ev(`JSON.parse(localStorage.getItem('winbooklab.cfg')).grafico`) === 100, 'persistiu no localStorage');
  ok(await ev(`document.getElementById('f-custo').value`) === '5', 'custo aplicado no painel');
  await sleep(3000);
  ok(await ev(`candleSeries.data()[1].time - candleSeries.data()[0].time`) === 300, 'timeframe 5min aplicado');

  console.log('\n== 4. NOVA CADENCIA ==');
  await ev(`window.__u=0;
    (function(){const a=candleSeries.setData.bind(candleSeries); candleSeries.setData=function(d){window.__u++;return a(d)}})();
    (function(){const b=candleSeries.update.bind(candleSeries); candleSeries.update=function(c){window.__u++;return b(c)}})();`);
  await sleep(3000);
  const u = await ev('window.__u');
  const taxa = u/3;
  ok(taxa >= 8, 'grafico a 10x/s', `${taxa.toFixed(1)}/s`);

  console.log('\n== 5. ESC FECHA ==');
  await ev(`document.getElementById('btn-config').click()`); await sleep(200);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(200);
  ok(await ev(`document.getElementById('modal-config').classList.contains('aberto')`) === false, 'Esc fecha');

  // volta ao padrao
  await ev(`localStorage.removeItem('winbooklab.cfg')`);

  console.log('\n== 6. ERROS ==');
  ok((await ev('JSON.stringify(window.__erros||[])')) === '[]', 'zero erro JS', await ev('JSON.stringify(window.__erros||[])'));

  console.log(`\n${falhas===0?'CONFIG OK':falhas+' FALHA(S)'}`);
  ws.close(); process.exit(falhas===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
