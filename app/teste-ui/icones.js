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

  let falhas=0;
  const ok=(c,n,d='')=>{console.log(`  ${c?'PASS':'FALHA'}  ${n}${d?'  -> '+d:''}`); if(!c)falhas++;};

  const n = await ev(`document.querySelectorAll('.info').length`);
  ok(n === 15, 'os 15 icones de info existem no DOM', String(n));

  // o icone tem tamanho visivel e borda (prova de que o CSS voltou)
  const estilo = await ev(`(()=>{
    const e=document.querySelector('.info');
    const s=getComputedStyle(e); const r=e.getBoundingClientRect();
    return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),
      borda:s.borderTopWidth+' '+s.borderTopStyle, raio:s.borderTopLeftRadius,
      display:s.display, visivel:r.width>0&&r.height>0,
      cor:s.color, texto:e.textContent.trim()});
  })()`);
  const st = JSON.parse(estilo);
  console.log('   estilo do .info:', estilo);
  ok(st.visivel, 'icone tem dimensao', st.w+'x'+st.h);
  ok(st.borda !== '0px none', 'icone tem borda (circulo)', st.borda);
  ok(st.raio !== '0px', 'borda arredondada', st.raio);

  // conta quantos estao realmente visiveis na tela
  const visiveis = await ev(`(()=>{
    let v=0;
    for (const e of document.querySelectorAll('.info')) {
      const r=e.getBoundingClientRect();
      if (r.width>0 && r.height>0 && r.top<window.innerHeight && r.bottom>0) v++;
    }
    return v;
  })()`);
  ok(visiveis >= 12, 'icones renderizados na tela', String(visiveis));

  console.log(`\n${falhas===0?'ICONE OK':falhas+' FALHA(S)'}`);
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/shots/icone.png', Buffer.from(r.result.data,'base64'));
  ws.close(); process.exit(falhas===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
