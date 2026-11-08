import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { brightness, openFixture, startHarness, baseURL } from './harness.mjs';
import { webFixture, startWeb } from './web-fixture.mjs';
let harness;
before(async () => { harness=await startHarness(); },{timeout:30000});
after(async () => { await harness?.close(); });
function networkGuard(page,t) {
  const attempted=[], transported=[], sockets=[], popups=[], downloads=[];
  page.context().on('request',request=>{ if (!request.url().startsWith(baseURL) && !request.url().startsWith('blob:')) attempted.push(request.url()); });
  page.on('websocket',socket=>{ if (!socket.url().startsWith(baseURL.replace('http','ws'))) sockets.push(socket.url()); });
  page.on('popup',popup=>popups.push(popup.url())); page.on('download',download=>downloads.push(download.suggestedFilename()));
  const ready=page.context().route('**/*',route=>{
    if (route.request().url().startsWith(baseURL)) return route.continue();
    transported.push(route.request().url()); return route.abort();
  });
  t.after(()=>{ assert.deepEqual(attempted,[],'No external request attempts'); assert.deepEqual(transported,[],'No request reached network routing'); assert.deepEqual(sockets,[]); assert.deepEqual(popups,[]); assert.deepEqual(downloads,[]); });
  return ready;
}
const pageHtml='<h1>Untrusted project</h1><pre id="report">waiting</pre><button id="test">Probe</button><script src="/app.js"></script>';
test('untrusted Worker cannot read host/project state or access network, storage, workers and hidden bridge internals', {timeout:60000},async t=>{
  const script=`(async()=>{
    const report={}; const blocked=(name,fn)=>{try{fn();report[name]='ESCAPED';}catch{report[name]='blocked';}};
    blocked('parent',()=>parent.document.body); blocked('storage',()=>localStorage.getItem('mesa.private-canary'));
    blocked('session',()=>sessionStorage.clear()); blocked('redux',()=>window.mesaReduxCanary.secret);
    blocked('otherProject',()=>localStorage.getItem('mesa.project.other'));
    blocked('xhr',()=>new XMLHttpRequest()); blocked('socket',()=>new WebSocket('wss://example.invalid/probe'));
    blocked('eventsource',()=>new EventSource('https://example.invalid/probe')); blocked('beacon',()=>navigator.sendBeacon('https://example.invalid/probe','x'));
    blocked('worker',()=>new Worker('blob:null/evil')); blocked('sharedWorker',()=>new SharedWorker('https://example.invalid/evil'));
    blocked('serviceWorker',()=>navigator.serviceWorker.register('https://example.invalid/evil'));
    blocked('import',()=>importScripts('https://example.invalid/evil.js')); blocked('broadcast',()=>new BroadcastChannel('other-project'));
    blocked('rawMessage',()=>postMessage({type:'http',id:999,path:'/led/on'}));
    blocked('protoXhr',()=>new WorkerGlobalScope.prototype.XMLHttpRequest());
    blocked('eval',()=>new Function('return this')());
    report.hidden=typeof callbacks+'|'+typeof pending+'|'+typeof seal;
    for(const target of ['https://example.invalid/probe','http://192.168.1.1/probe','javascript:alert(1)','data:text/plain,secret','blob:null/secret']) report[target]=(await WorkerGlobalScope.prototype.fetch.call(self,target)).status;
    report.foreignRoute=(await fetch('/other-project/index.html')).status;
    report.source=(await fetch('/main.ino')).status;
    document.querySelector('#report').textContent=JSON.stringify(report);
  })();`;
  const page=await openFixture(harness.browser,t,webFixture({html:pageHtml,script}));
  await networkGuard(page,t);
  await page.evaluate(()=>{localStorage.setItem('mesa.private-canary','HOST_SECRET');localStorage.setItem('mesa.project.other','OTHER_PROJECT_SECRET');sessionStorage.setItem('mesa.session-canary','SESSION_SECRET');window.mesaReduxCanary={secret:'REDUX_SECRET'};});
  const frame=await startWeb(page);
  await frame.locator('#report').filter({hasText:'foreignRoute'}).waitFor();
  const report=JSON.parse(await frame.locator('#report').textContent());
  for(const key of ['parent','storage','session','redux','otherProject','xhr','socket','eventsource','beacon','worker','sharedWorker','serviceWorker','import','broadcast','rawMessage','protoXhr','eval']) assert.equal(report[key],'blocked',key);
  assert.equal(report.hidden,'undefined|undefined|undefined'); assert.equal(report.foreignRoute,404); assert.equal(report.source,404);
  for(const key of Object.keys(report).filter(key=>key.includes(':'))) assert.equal(report[key],400,key);
  const text=await frame.locator('#report').textContent(); assert.equal(text.includes('_SECRET'),false);
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('mesa.private-canary'),localStorage.getItem('mesa.project.other'),sessionStorage.getItem('mesa.session-canary')]),['HOST_SECRET','OTHER_PROJECT_SECRET','SESSION_SECRET']);
});

test('stored active markup, CSS imports/URLs, images, nested documents and external forms remain inert', {timeout:60000},async t=>{
  const html=`<meta http-equiv="refresh" content="0;url=https://example.invalid/nav"><base href="https://example.invalid/">
    <img src="https://example.invalid/img" srcset="https://example.invalid/set 2x" onerror="parent.hacked=true">
    <iframe src="https://example.invalid/frame" srcdoc="<script>parent.hacked=true</script>"></iframe><object data="https://example.invalid/object"></object><video src="https://example.invalid/video"></video>
    <svg onload="parent.hacked=true"><foreignObject><script>parent.hacked=true</script></foreignObject></svg>
    <style>@import url('https://example.invalid/import'); @font-face{font-family:evil;src:url('https://example.invalid/font')} body{color:#123456;background-image:u\\72l('https://example.invalid/bg')} p{background:url('data:text/html,evil')}</style>
    <p style="background-image:url(https://example.invalid/inline);color:red" id="report">safe</p>
    <a href="javascript:parent.hacked=true">JavaScript URL</a><a href="data:text/html,evil">Data URL</a><a href="blob:null/evil">Blob URL</a>
    <form action="https://example.invalid/form" target="_top"><button>External submit</button></form>
    <button id="test" onclick="parent.hacked=true">Active attribute</button>`;
  const page=await openFixture(harness.browser,t,webFixture({html,script:''})); await networkGuard(page,t);
  const frame=await startWeb(page);
  await frame.getByRole('button',{name:'External submit'}).click();
  await frame.getByRole('button',{name:'Active attribute'}).click();
  for(const label of ['JavaScript URL','Data URL','Blob URL']) await frame.getByText(label,{exact:true}).click();
  assert.equal(await frame.locator('#content').locator('iframe,object,video,svg,meta,base,[src],[srcset],[href],[onclick],[onerror],[action],[target]').count(),0);
  assert.equal((await frame.locator('#content').innerHTML()).includes('url('),false);
  assert.equal(await frame.locator('#report').evaluate(node=>getComputedStyle(node).color),'rgb(255, 0, 0)');
  assert.equal(await page.evaluate(()=>window.hacked),undefined); assert.equal(page.url(),baseURL+'/');
});
for(const markup of ['<script src="https://example.invalid/remote.js"></script>','<link rel="stylesheet" href="https://example.invalid/remote.css">']) {
  test(`external script/stylesheet resource fails closed before a browser request: ${markup.slice(1,7)}`,{timeout:60000},async t=>{
    const page=await openFixture(harness.browser,t,webFixture({html:markup}));await networkGuard(page,t);
    await page.getByTestId('simulation-start').click(); await page.getByTestId('esp-web-error').waitFor();
    assert.equal(await page.getByTestId('esp-web-frame').count(),0);
  });
}

test('iframe boundary denies host DOM/storage, top navigation, popups, and scripts without the fresh CSP nonce', {timeout:60000},async t=>{
  const page=await openFixture(harness.browser,t,webFixture({html:pageHtml,script:''})); await networkGuard(page,t);
  const frame=await startWeb(page);
  const values=await frame.locator('body').evaluate(()=>{
    const result={}; for(const [name,fn] of [['parent',()=>parent.document.body],['storage',()=>localStorage.getItem('persist:mesa.project')],['session',()=>sessionStorage.clear()],['top',()=>top.location.assign('https://example.invalid/top')]]) {try{fn();result[name]='ESCAPED';}catch{result[name]='blocked';}}
    result.popup=window.open('https://example.invalid/popup')===null?'blocked':'ESCAPED';
    window.violations=[]; document.addEventListener('securitypolicyviolation',event=>window.violations.push(event.effectiveDirective));
    const script=document.createElement('script');script.textContent='window.nonceBypass=true';document.body.append(script);
    return result;
  });
  assert.deepEqual(values,{parent:'blocked',storage:'blocked',session:'blocked',top:'blocked',popup:'blocked'});
  await frame.locator('body').evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  assert.equal(await frame.locator('body').evaluate(()=>window.nonceBypass),undefined);
  assert.ok((await frame.locator('body').evaluate(()=>window.violations)).some(value=>value.startsWith('script-src')));
  assert.equal(await page.getByTestId('esp-web-frame').getAttribute('sandbox'),'allow-scripts');
  const csp=await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  for(const directive of ["default-src 'none'","connect-src 'none'","img-src 'none'","font-src 'none'","frame-src 'none'","form-action 'none'","base-uri 'none'"]) assert.ok(csp.includes(directive));
  assert.match(csp,/script-src 'nonce-[a-f0-9]{32}'/);assert.equal(csp.includes("script-src 'unsafe-inline'"),false);
});

test('forged/replayed messages and old page/run capabilities cannot change GPIO', {timeout:60000},async t=>{
  const page=await openFixture(harness.browser,t,webFixture());await networkGuard(page,t);
  await page.evaluate(()=>{window.tokens=[];window.addEventListener('message',event=>{if(event.data?.type==='preview-http')window.tokens.push(event.data.token);});});
  const frame=await startWeb(page);await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  const token=await page.evaluate(()=>window.tokens.at(-1));assert.equal(typeof token,'string');
  await frame.locator('body').evaluate((_,token)=>{
    for(const message of [{type:'preview-http',token:'0'.repeat(32),id:77,path:'/led/on'}, {type:'preview-http',token,id:78,path:'/led/on',method:'POST'},
      {type:'preview-http',token,id:79,path:'/led/on',componentId:'other'},{type:'gpio',token,id:80,path:'/led/on'}, {type:'preview-http',token,id:NaN,path:'/led/on'},
      {type:'preview-http',token,id:81,path:'https://example.invalid/'}])parent.postMessage(message,'*');
  },token);
  await page.evaluate(token=>window.postMessage({type:'preview-http',token,id:82,path:'/led/on'},'*'),token);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await brightness(page,'led',false);
  await frame.locator('body').evaluate((_,token)=>parent.postMessage({type:'preview-http',token,id:500,path:'/led/on'},'*'),token);
  await brightness(page,'led',true);
  await frame.locator('body').evaluate((_,token)=>parent.postMessage({type:'preview-http',token,id:500,path:'/led/off'},'*'),token);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await brightness(page,'led',true);
  await frame.locator('#off').click();await brightness(page,'led',false);
  await page.getByTestId('esp-preview-open').click();await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  await frame.locator('body').evaluate((_,token)=>parent.postMessage({type:'preview-http',token,id:100,path:'/led/on'},'*'),token);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await brightness(page,'led',false);
  await page.getByTestId('simulation-stop').click();assert.equal(await page.getByTestId('esp-web-frame').count(),0);
  await page.getByTestId('simulation-start').click();await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  await frame.locator('body').evaluate((_,token)=>parent.postMessage({type:'preview-http',token,id:101,path:'/led/on'},'*'),token);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await brightness(page,'led',false);
});

for(const script of ['while(true){}',"document.querySelector('#test').addEventListener('click',()=>{while(true){}});"]) {
  test(`a non-yielding Worker is terminated while Mesa controls remain responsive: ${script.slice(0,12)}`,{timeout:60000},async t=>{
    const page=await openFixture(harness.browser,t,webFixture({html:pageHtml,script}));await networkGuard(page,t);
    const frame=await startWeb(page);
    if(script.includes('addEventListener')) await frame.locator('#test').click();
    await page.getByTestId('esp-web-error').filter({hasText:'stopped responding'}).waitFor();
    assert.equal(await page.getByTestId('esp-web-frame').count(),0);
    await page.getByTestId('simulation-stop').click();assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'),'stopped');
  });
}
test('request floods and over-size pages are bounded without stopping the firmware or weakening limits', {timeout:60000},async t=>{
  const script="for(let i=0;i<100;i++)fetch('/led/state');";
  const page=await openFixture(harness.browser,t,webFixture({html:pageHtml,script}));await networkGuard(page,t);await page.getByTestId('simulation-start').click();
  await page.getByTestId('esp-web-error').waitFor();assert.equal(await page.getByTestId('esp-web-frame').count(),0);
  assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'),'running');
  await page.getByTestId('simulation-stop').click();
  await page.getByTestId('esp-code-tab-html').click();
  await page.locator('#tool-panel-code').getByRole('tab',{name:'index.html',exact:true}).click();
  await page.getByTestId('board-code-editor').fill('<p>'+ 'x'.repeat(97000)+'</p>');
  await page.getByTestId('simulation-start').click();await page.getByTestId('esp-web-error').filter({hasText:'exceeds'}).waitFor();
  assert.equal(await page.getByTestId('esp-web-frame').count(),0);
});

test('a dropped virtual response times out and Stop cancels the former page', {timeout:60000},async t=>{
  const page=await openFixture(harness.browser,t,webFixture());await networkGuard(page,t);const frame=await startWeb(page);
  await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  // Deliberately drop only transport delivery, without mocking firmware or GPIO results.
  await page.evaluate(()=>{window.dropped=[];window.bridgeEvents=[];window.addEventListener('message',event=>{window.bridgeEvents.push({type:event.data?.type,text:event.data?.text});if(event.data?.type==='preview-http'){window.dropped.push(event.data.path);event.stopImmediatePropagation();}},true);});
  await frame.locator('#on').click();
  await page.waitForFunction(()=>window.dropped?.includes('/led/on'));
  await brightness(page,'led',false);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,3500)));
  t.diagnostic(JSON.stringify(await page.evaluate(()=>({dropped:window.dropped,events:window.bridgeEvents}))));
  await page.getByTestId('esp-web-error').waitFor();
  assert.match(await page.getByTestId('esp-web-error').textContent(),/did not respond/);
  await brightness(page,'led',false);assert.equal(await page.getByTestId('esp-web-frame').count(),0);
  await page.getByTestId('simulation-stop').click();assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'),'stopped');
});
