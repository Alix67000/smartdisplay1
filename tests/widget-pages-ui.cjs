const esbuild=require('esbuild'),{JSDOM}=require('jsdom'),{webcrypto}=require('crypto'),assert=require('assert'),path=require('path');
const wait=t=>new Promise(r=>setTimeout(r,t));
(async()=>{
 const out=await esbuild.build({entryPoints:['src/main.jsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.css':'empty'},define:{'import.meta.env.VITE_MICROSOFT_CLIENT_ID':'undefined','import.meta.env.VITE_MICROSOFT_TENANT_ID':'undefined'},plugins:[{name:'fake',setup(b){b.onResolve({filter:/firebase-client\.js$/},()=>({path:path.resolve('tests/fixtures/firebase-auth.js')}));b.onResolve({filter:/firebase-db\.js$/},()=>({path:path.resolve('tests/fixtures/firebase-db.js')}));b.onResolve({filter:/^firebase\/firestore$/},()=>({path:path.resolve('tests/fixtures/firebase-firestore.js')}))}}]});
 const d=new JSDOM('<div id="root"></div>',{url:'https://example.test/#/',runScripts:'dangerously',pretendToBeVisual:true}),w=d.window;
 w.fakeCloud={data:new Map(),watchers:[]};w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w.navigator,'locks',{value:{request:async(n,o,f)=>f()}});w.URL.createObjectURL=()=> 'blob:fake';w.URL.revokeObjectURL=()=>{};
 w.fetch=async url=>String(url).startsWith('/api/app-session')?{ok:true,status:200,json:async()=>({})}:{ok:false,status:503,json:async()=>({})};
 try{
  w.eval(out.outputFiles[0].text);await wait(160);
  const destinations=[['Ouvrir E-mails récents','#/emails','Mes e-mails'],['Ouvrir Tâches en cours','#/taches','Mes tâches'],['Ouvrir les devises','#/devises','Devises'],['Ouvrir l’horloge','#/horloge','Horloge']];
  for(const [label,hash,title] of destinations){const button=w.document.querySelector(`button[aria-label="${label}"]`);assert(button,label);button.click();await wait(40);assert.equal(w.location.hash,hash);assert.equal(w.document.querySelector('.intro h1').textContent.trim(),title);assert.equal(w.document.activeElement,w.document.querySelector('.intro h1'));w.document.querySelector('.detail-back').click();await wait(40);assert.equal(w.location.hash,'#/');assert.equal(w.document.activeElement,w.document.querySelector(`button[aria-label="${label}"]`))}
  const agenda=w.document.querySelector('[data-widget-route="agenda"]');
  const swipeStart={identifier:1,clientX:250,clientY:80};
  const swipeEnd={...swipeStart,clientX:110};
  agenda.dispatchEvent(new w.TouchEvent('touchstart',{bubbles:true,touches:[swipeStart]}));
  agenda.dispatchEvent(new w.TouchEvent('touchmove',{bubbles:true,touches:[swipeEnd]}));
  const panel=w.document.querySelector('.swipe-panel');
  assert.equal(panel.style.getPropertyValue('--swipe-offset'),'-140px','le panneau suit le doigt');
  const end=new w.TouchEvent('touchend',{bubbles:true,cancelable:true,changedTouches:[swipeEnd]});
  assert.equal(agenda.dispatchEvent(end),false,'un swipe ne doit pas activer la tuile');
  await wait(40);
  assert.equal(w.location.hash,'#/parametres');
  assert.equal(panel.style.getPropertyValue('--swipe-offset'),'');
  w.location.hash='#/';
  await wait(40);
  w.document.querySelector('[data-widget-route="agenda"]').click();
  await wait(40);
  assert.equal(w.location.hash,'#/agenda');
  w.location.hash='#/';
  await wait(40);
  const weather=w.document.querySelector('.weather-card[role=link]');assert(weather,'tuile météo');weather.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(40);assert.equal(w.location.hash,'#/meteo');assert(w.document.querySelector('.detail-back'));
  console.log('Pages widgets : e-mails, météo, devises, horloge, tâches et focus OK');
 }finally{d.window.close()}
})().catch(e=>{console.error(e);process.exit(1)});
