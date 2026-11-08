import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { brightness, openFixture, startHarness } from './harness.mjs';
import { webFixture, startWeb } from './web-fixture.mjs';
let harness;
before(async () => { harness = await startHarness(); }, { timeout:30000 });
after(async () => { await harness?.close(); });
for (const locale of ['es','en']) for (const width of [1440,390]) {
  test(`Web view reveals automatically, is distinct from source and retains circuit/Serial: ${locale} ${width}`, { timeout:60000 }, async t => {
    const page = await openFixture(harness.browser,t,webFixture(),{locale,width});
    const circuit = await page.locator('.workspace-svg').elementHandle();
    const frame = await startWeb(page);
    assert.equal(await page.getByTestId('tool-tab-code').getAttribute('aria-selected'),'true');
    assert.equal(await page.getByTestId('tool-sidebar').isVisible(),true);
    assert.equal(await page.getByTestId('esp-code-tab-web').getAttribute('aria-selected'),'true');
    assert.equal((await page.getByTestId('esp-code-tab-web').textContent()).trim(),locale==='es'?'Vista web':'Web view');
    assert.equal(await page.getByTestId('board-code-editor').count(),0);
    assert.equal(await page.getByTestId('esp-web-address').textContent(),'http://192.0.2.10/');
    await frame.locator('#on').click(); await brightness(page,'led',true);
    await frame.locator('#off').click(); await brightness(page,'led',false);
    assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(244, 240, 233)');
    assert.match(await page.locator('#serial-esp').textContent(),/115200 baud/);
    assert.ok(await circuit.evaluate(node=>node===document.querySelector('.workspace-svg')));
    assert.equal(await page.getByTestId('tool-tab-iot').count(),0);
    if (width===1440) {
      const led=await page.locator('[data-reference="led"]').boundingBox(), view=await page.getByTestId('esp-web-frame').boundingBox();
      assert.ok(led && view && led.x+led.width <= view.x, 'Circuit and web page occupy distinct visible desktop regions');
    }
    await page.getByTestId('esp-preview-close').click();
    assert.equal(await page.getByTestId('esp-web-frame').count(),0);
    await page.getByTestId('esp-code-tab-html').click();
    assert.equal(await page.getByTestId('board-code-editor').isVisible(),true);
    assert.equal(await page.getByTestId('esp-web-frame').count(),0);
    await page.getByTestId('esp-code-tab-web').click();
    await frame.locator('#status').getByText(locale==='es'?'D5: apagado':'D5: OFF',{exact:true}).waitFor();
    await page.getByTestId('esp-preview-open').click();
    await frame.locator('#on').click(); await brightness(page,'led',true);
    await page.getByTestId('simulation-stop').click();
    assert.equal(await page.getByTestId('esp-web-frame').count(),0);
    assert.equal(await page.getByTestId('esp-preview-open').isDisabled(),true);
    await page.getByTestId('simulation-start').click();
    await frame.locator('#status').getByText(locale==='es'?'D5: apagado':'D5: OFF',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mkdir('test-results/browser',{recursive:true});
    await page.screenshot({path:`test-results/browser/web-view-${locale}-${width}.png`,animations:'disabled'});
  });
}
for (const pin of ['D4','D2']) test(`user HTML controls ${pin} through actual firmware and connected circuit`, {timeout:60000}, async t => {
  const document=webFixture({pin,html:'<h1>My greenhouse</h1><p id="status">waiting</p><input id="switch" type="checkbox"><script src="/app.js"></script>',
    script:"document.querySelector('#switch').addEventListener('change', async event => { const r=await fetch(event.target.checked?'/led/on':'/led/off'); document.querySelector('#status').textContent=await r.text(); });"});
  const page=await openFixture(harness.browser,t,document);
  const frame=await startWeb(page);
  await frame.getByRole('heading',{name:'My greenhouse'}).waitFor();
  await frame.locator('#switch').check(); await brightness(page,'led',true);
  await frame.locator('#status').getByText('ON',{exact:true}).waitFor();
  await frame.locator('#switch').uncheck(); await brightness(page,'led',false);
});
test('an unplugged circuit never illuminates despite a successful user-page request', {timeout:60000}, async t => {
  const page=await openFixture(harness.browser,t,webFixture({open:true}));
  const frame=await startWeb(page);
  await frame.locator('#on').click();
  await frame.locator('#status').getByText('D5: ON',{exact:true}).waitFor();
  await brightness(page,'led',false);
});

test('switching boards disposes the old page and keeps responses and circuit GPIO board-specific', {timeout:60000},async t=>{
  const document=webFixture();
  const other=webFixture({pin:'D2'});
  for(const component of other.components) component.id=component.id==='esp'?'other':`${component.id}-other`;
  for(const wire of other.wires) {wire.id+='-other';for(const end of [wire.from,wire.to])end.componentId=end.componentId==='esp'?'other':`${end.componentId}-other`;}
  other.programs[0].componentId='other';
  const html=other.programs[0].files.find(file=>file.name==='index.html');html.source=html.source.replace('GPIO14','OTHER DEVICE');
  document.components.push(...other.components);document.wires.push(...other.wires);document.programs.push(...other.programs);
  const page=await openFixture(harness.browser,t,document);
  await page.evaluate(()=>{window.oldToken='';window.addEventListener('message',event=>{if(event.data?.type==='preview-http')window.oldToken=event.data.token;});});
  const frame=await startWeb(page);await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  const token=await page.evaluate(()=>window.oldToken);
  await page.locator('[data-testid="code-board-tab"][data-board-id="other"]').click();
  await frame.getByRole('heading',{name:/OTHER DEVICE/}).waitFor();
  await frame.locator('body').evaluate((_,token)=>parent.postMessage({type:'preview-http',token,id:888,path:'/led/on'},'*'),token);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await brightness(page,'led',false);await brightness(page,'led-other',false);
  await frame.locator('#on').click();await brightness(page,'led-other',true);await brightness(page,'led',false);
  await page.locator('[data-testid="code-board-tab"][data-board-id="esp"]').click();
  assert.equal(await page.getByTestId('esp-web-frame').count(),0,'Returning to an already-opened run does not auto-reopen a former page');
  await page.getByTestId('esp-code-tab-web').click();await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
});
