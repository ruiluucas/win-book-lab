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

  console.log('== 1. PILULA DA FONTE ==');
  const pill = await ev(`(()=>{const e=document.querySelector('.pill[data-k="fonte"]');
    return JSON.stringify({existe:!!e, texto:e?e.textContent.trim():null, acesa:e?e.classList.contains('on'):null})})()`);
  console.log('   ', pill);
  const pl = JSON.parse(pill);
  ok(pl.existe, 'pilula da fonte existe');
  ok(/Local|VM/.test(pl.texto||''), 'mostra a fonte', pl.texto);

  console.log('\n== 2. MODAL TEM A SECAO ==');
  await ev(`document.querySelector('[data-tip^="Abrir"], #btn-config, .tb-right button:last-child')?.click()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/config/i.test(x.getAttribute('data-tip')||''));if(b)b.click();})()`);
  await sleep(700);
  const modal = await ev(`(()=>{const m=document.getElementById('modal-config');
    return JSON.stringify({
      aberto: m.classList.contains('aberto'),
      temFonte: !!document.getElementById('cfg-fonte'),
      opcoes: [...document.querySelectorAll('#cfg-fonte option')].map(o=>o.value),
      valor: document.getElementById('cfg-fonte')?.value,
      host: document.getElementById('cfg-vm-host')?.value,
      vmVisivel: document.getElementById('cfg-vm')?.classList.contains('on')
    })})()`);
  console.log('   ', modal);
  const md = JSON.parse(modal);
  ok(md.aberto, 'modal abriu');
  ok(md.temFonte, 'campo de fonte existe');
  ok(JSON.stringify(md.opcoes)==='["local","vm"]', 'duas opcoes', JSON.stringify(md.opcoes));
  ok(md.valor==='local', 'fonte atual = local', md.valor);
  ok(md.host==='192.168.201.50', 'host da VM preenchido', md.host);
  ok(md.vmVisivel===false, 'campos da VM ocultos quando local');

  console.log('\n== 3. TROCAR PARA VM (deve falhar: rede fora) ==');
  const troca = await ev(`(async()=>{
    const s=document.getElementById('cfg-fonte'); s.value='vm';
    await s.onchange();
    await new Promise(r=>setTimeout(r,12000));
    const e=document.getElementById('cfg-vm-estado');
    return JSON.stringify({visivel: document.getElementById('cfg-vm').classList.contains('on'),
      classe: e.className, texto: e.textContent.trim().slice(0,90)});
  })()`);
  console.log('   ', troca);
  const tr = JSON.parse(troca);
  ok(tr.visivel, 'campos da VM aparecem');
  ok(tr.classe.includes('err')||tr.classe.includes('ok'), 'estado foi medido (nao ficou em "conectando")', tr.classe);
  ok(!/conectando/.test(tr.texto), 'saiu do estado "conectando"', tr.texto);

  console.log('\n== 4. VOLTAR PARA LOCAL ==');
  const volta = await ev(`(async()=>{
    const s=document.getElementById('cfg-fonte'); s.value='local';
    await s.onchange();
    await new Promise(r=>setTimeout(r,1200));
    return JSON.stringify({valor:document.getElementById('cfg-fonte').value,
      visivel:document.getElementById('cfg-vm').classList.contains('on')});
  })()`);
  console.log('   ', volta);
  const vt = JSON.parse(volta);
  ok(vt.valor==='local', 'voltou para local');
  ok(!vt.visivel, 'campos da VM ocultos de novo');

  console.log('\n== 5. APP CONTINUA FUNCIONANDO ==');
  await ev(`document.getElementById('cfg-fechar')?.click()`);
  await sleep(2500);
  const vivo = await ev(`JSON.stringify({
    erros:(window.__erros||[]).length,
    bids:document.querySelectorAll('#bids .bl').length,
    preco:(document.getElementById('f-ultimo')||{}).textContent,
    snap:(document.getElementById('m-snap')||{}).textContent
  })`);
  console.log('   ', vivo);
  const vv = JSON.parse(vivo);
  ok(vv.erros===0, 'zero erro JS', String(vv.erros));
  ok(vv.bids===5, 'book com 5 bids', String(vv.bids));

  console.log(`\n${f===0?'OK':f+' FALHA(S)'}`);
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/shots/fonte.png', Buffer.from(r.result.data,'base64'));
  ws.close(); process.exit(f===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
