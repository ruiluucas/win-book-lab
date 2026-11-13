const http=require('http'); const fs=require('fs');
const get=p=>new Promise((r,j)=>{http.get({host:'127.0.0.1',port:9222,path:p},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>r(JSON.parse(d)))}).on('error',j)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const t=await get('/json'); const pg=t.find(x=>x.type==='page');
  const ws=new WebSocket(pg.webSocketDebuggerUrl); let id=0; const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
  await new Promise(r=>ws.onopen=r);
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
  for(let i=0;i<30;i++){ if(await ev('window.__ready===true')) break; await sleep(500); }
  let f=0; const ok=(c,n,d='')=>{console.log(`  ${c?'PASS':'FALHA'}  ${n}${d?'  -> '+d:''}`); if(!c)f++;};

  console.log('== 1. CARDS REMOVIDOS, PILULAS DE VOLTA ==');
  ok(await ev(`document.querySelectorAll('.card').length`)===0, 'nenhum card no DOM');
  ok(await ev(`document.querySelectorAll('.pill').length`)===4, '4 pilulas no header');
  const alt = await ev(`(()=>{const h=document.querySelector('.titlebar').getBoundingClientRect();const m=document.querySelector('main').getBoundingClientRect();return JSON.stringify({header:Math.round(h.height),conteudoTopo:Math.round(m.top)})})()`);
  console.log('   ', alt);
  ok(JSON.parse(alt).conteudoTopo <= 60, 'conteudo comeca logo abaixo do header', alt);

  console.log('\n== 2. PILULAS REFLETEM O ESTADO ==');
  for (const k of ['mt5','bridge','docker','collector']) {
    const on = await ev(`document.querySelector('.pill[data-k="${k}"]').classList.contains('on')`);
    ok(on === true, `pilula ${k} acesa`);
  }
  ok((await ev(`document.querySelector('.pill[data-k="collector"]').textContent`)).includes('WINZ26'), 'pilula do coletor mostra o contrato',
     await ev(`document.querySelector('.pill[data-k="collector"]').textContent.trim()`));

  console.log('\n== 3. TOOLTIP RICO ==');
  const tip = await ev(`(()=>{
    const el=document.querySelector('.pill[data-k="collector"]');
    el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    const tt=document.getElementById('tt');
    return JSON.stringify({
      linhas: tt.childElementCount,
      titulo: tt.querySelector('.tt-titulo')?.textContent,
      sub: tt.querySelector('.tt-sub')?.textContent,
      detalhes: [...tt.querySelectorAll('.tt-linha')].map(d=>d.textContent).length,
      dentro: (()=>{const r=tt.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()
    });
  })()`);
  console.log('   ', tip);
  const tp = JSON.parse(tip);
  ok(tp.linhas >= 3, 'tooltip tem varias linhas', tp.linhas+' blocos');
  ok(!!tp.titulo && tp.titulo.startsWith('Coletor'), 'primeira linha e titulo', tp.titulo);
  ok(!!tp.sub && (tp.sub.includes('pid') || tp.sub.includes('flush')), 'segunda linha e subtitulo', tp.sub);
  ok(tp.detalhes >= 1, 'tem linhas de detalhe', String(tp.detalhes));
  ok(tp.dentro, 'tooltip dentro da tela');

  console.log('\n== 4. NADA QUEBROU ==');
  ok((await ev('JSON.stringify(window.__erros||[])'))==='[]', 'zero erro JS', await ev('JSON.stringify(window.__erros||[])'));
  ok(await ev(`document.querySelectorAll('#bids .bl').length`)===5, 'book com 5 bids');
  ok(await ev(`document.querySelectorAll('#tf button').length`)===3, '3 timeframes');
  ok(await ev(`document.querySelectorAll('.inv').length===0 || document.querySelectorAll('.info').length>0`), 'icones .info preservados',
     String(await ev(`document.querySelectorAll('.info').length`)));

  console.log(`\n${f===0?'OK':f+' FALHA(S)'}`);
  await sleep(300);
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/shots/pill.png', Buffer.from(r.result.data,'base64'));
  ws.close(); process.exit(f===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
