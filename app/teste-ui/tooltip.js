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
    if(r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||'').slice(0,120);
    return r.result?.result?.value;};
  for(let i=0;i<30;i++){ if(await ev('window.__ready===true')) break; await sleep(500); }

  // percorre todos os [data-tip]: dispara mouseover, mede o #tt, valida limites
  const res = await ev(`(async () => {
    const out=[];
    const els=[...document.querySelectorAll('[data-tip]')];
    for (const el of els) {
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      await new Promise(r=>setTimeout(r,30));
      const tt=document.getElementById('tt');
      const r=tt.getBoundingClientRect();
      const er=el.getBoundingClientRect();
      out.push({
        id: el.id || el.className.split(' ')[0] || el.tagName,
        visivel: tt.classList.contains('on'),
        left: Math.round(r.left), right: Math.round(r.right),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        // dentro da janela?
        ok: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
        janela: window.innerWidth+'x'+window.innerHeight
      });
      el.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));
      await new Promise(r=>setTimeout(r,10));
    }
    return JSON.stringify(out);
  })()`);

  let falhas=0;
  const lista = JSON.parse(res);
  console.log(`  testados: ${lista.length} elementos com tooltip\n`);
  for (const it of lista) {
    if (!it.visivel) { console.log(`  FALHA ${it.id}: tooltip nao apareceu`); falhas++; continue; }
    if (!it.ok) { console.log(`  FALHA ${it.id}: SAIU DA TELA  left=${it.left} right=${it.right} top=${it.top} bottom=${it.bottom} (janela ${it.janela})`); falhas++; }
  }
  if (falhas===0) console.log('  PASS  todos os tooltips ficaram dentro da janela');

  // mostra os dois extremos
  const esq = lista.reduce((a,b)=>a.left<b.left?a:b);
  const dir = lista.reduce((a,b)=>a.right>b.right?a:b);
  const baixo = lista.reduce((a,b)=>a.bottom>b.bottom?a:b);
  console.log(`\n  mais a esquerda : ${esq.id} -> left=${esq.left}`);
  console.log(`  mais a direita  : ${dir.id} -> right=${dir.right} (janela ${dir.janela})`);
  console.log(`  mais embaixo    : ${baixo.id} -> bottom=${baixo.bottom}`);

  console.log(`\n${falhas===0?'TOOLTIPS OK':falhas+' FALHA(S)'}`);
  ws.close(); process.exit(falhas===0?0:1);
})().catch(e=>{console.error(e.message);process.exit(1)});
