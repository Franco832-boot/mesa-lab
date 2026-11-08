import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { brightness, openFixture, startHarness, status } from './harness.mjs';
import { webFixture } from './web-fixture.mjs';
let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
async function code(page) {
  if (await page.getByTestId('project-library').isVisible()) await page.getByTestId('library-toggle').click();
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId('tool-tab-code').click();
}
async function wifiState(page, value) {
  await page.waitForFunction(value => document.querySelector('[data-testid="esp-wifi-status"]')?.getAttribute('data-state') === String(value), value);
}
const serial = page => page.locator('[data-testid="serial-output"][data-component-id="esp"]');
test('real mini-tab modules use only C++ credentials and the built-in network across stop, restart and reload', {timeout:60000}, async t => {
  const page = await openFixture(harness.browser,t,webFixture()); await code(page);
  const editor = page.locator('#tool-panel-code').getByTestId('board-code-editor');
  await page.getByTestId('esp-code-tab-main').click();
  const main = await editor.inputValue();
  assert.match(main, /#include "wifi.h"/); assert.doesNotMatch(main, /ssid|password|WiFi.begin/);
  assert.equal((main.match(/void setup\(/g)??[]).length,1); assert.equal((main.match(/void loop\(/g)??[]).length,1);
  await page.getByTestId('esp-code-tab-wifi').click();
  await page.getByRole('tab',{name:'wifi.h',exact:true}).click(); assert.match(await editor.inputValue(),/#pragma once[\s\S]*bool wifiConectado\(\);/);
  await page.getByRole('tab',{name:'wifi.cpp',exact:true}).click();
  assert.match(await editor.inputValue(), /const char\* ssid = "MiCasa"/);
  assert.match(await editor.inputValue(), /const char\* password = "carlos"/);
  assert.equal(await page.getByTestId('esp-wifi-environment').count(),0);
  assert.equal(await page.getByTestId('esp-ap-save').count(),0);
  await page.getByTestId('esp-code-tab-web').click(); await page.getByTestId('simulation-start').click(); await wifiState(page,3); const frame=page.frameLocator('[data-testid="esp-web-frame"]');
  await serial(page).getByText('IP: 192.0.2.10',{exact:false}).waitFor(); assert.doesNotMatch(await serial(page).textContent(),/carlos/);
  await frame.locator('#on').click(); await brightness(page,'led',true);
  await page.getByTestId('simulation-stop').click(); await status(page,'stopped');
  await page.getByTestId('esp-code-tab-wifi').click(); assert.equal(await page.getByTestId('esp-ap-ssid').count(),0);
  await page.getByTestId('simulation-start').click(); await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  await page.getByTestId('simulation-stop').click();
  const saved=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
  assert.equal(saved.programs[0].files.length,10); assert.equal(saved.programs[0].files.find(f=>f.name==='wifi.cpp').source.includes('password = "carlos"'),true);
  assert.equal('wifiNetworks' in saved,false);
  await page.reload();await code(page);await page.getByTestId('esp-code-tab-wifi').click();
  assert.equal(await page.getByTestId('esp-ap-ssid').count(),0);
  await page.getByTestId('esp-code-tab-web').click();await page.getByTestId('simulation-start').click();
  await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  await frame.locator('#on').click();await brightness(page,'led',true);await frame.locator('#off').click();await brightness(page,'led',false);
});
for (const scenario of ['wrong password','timeout']) test(`WiFi module reports ${scenario} without exposing an IP or starting HTTP`,{timeout:60000},async t=>{
  const document=webFixture();
  if(scenario==='wrong password') document.programs[0].files.find(f=>f.name==='wifi.cpp').source=document.programs[0].files.find(f=>f.name==='wifi.cpp').source.replace('"carlos"','"wrong"');
  if(scenario==='timeout') document.programs[0].files.find(f=>f.name==='wifi.cpp').source=document.programs[0].files.find(f=>f.name==='wifi.cpp').source.replace('5000UL','100UL');
  const page=await openFixture(harness.browser,t,document);await code(page);
  await page.getByTestId('esp-code-tab-web').click();await page.getByTestId('simulation-start').click();
  await serial(page).getByText('connection failed or timed out',{exact:false}).waitFor();
  await wifiState(page,scenario==='timeout'?6:4);assert.doesNotMatch(await serial(page).textContent(),/192\.0\.2\.10|wrong/);
  assert.equal(await page.getByTestId('esp-web-frame').count(),0);assert.equal(await page.getByTestId('esp-preview-open').isDisabled(),true);
  await page.getByTestId('simulation-stop').click();await status(page,'stopped');await brightness(page,'led',false);
});
test('polling with no delay remains cancellable; a linked function disconnects and reconnects', {timeout:60000},async t=>{
  const document=webFixture();const files=document.programs[0].files;
  const module=files.find(f=>f.name==='wifi.cpp');
  module.source=module.source.replace('delay(100);','');
  files.find(f=>f.name==='wifi.h').source+='\nvoid reconectarWiFi();';
  module.source+='\nvoid reconectarWiFi(){WiFi.disconnect();Serial.println(WiFi.status());conectarWiFi();}';
  const main=files.find(f=>f.name==='main.ino');main.source=main.source.replace('conectarWiFi();','conectarWiFi();reconectarWiFi();');document.programs[0].source=main.source;
  const page=await openFixture(harness.browser,t,document);await code(page);await page.getByTestId('simulation-start').click();
  const frame=page.frameLocator('[data-testid="esp-web-frame"]');await frame.locator('#status').getByText('D5: OFF',{exact:true}).waitFor();
  const output=await serial(page).textContent();assert.equal((output.match(/WiFi conectado/g)??[]).length,2);assert.match(output,/\r?\n6\r?\n/);
  await frame.locator('#on').click();await brightness(page,'led',true);await page.getByTestId('simulation-stop').click();await status(page,'stopped');
  // An endless unsupported-network wait still yields, so Stop can cancel it.
  await page.getByTestId('esp-code-tab-wifi').click();await page.getByRole('tab',{name:'wifi.cpp',exact:true}).click();
  await page.getByTestId('board-code-editor').fill(module.source.replace('"MiCasa"','"missing AP"').replace(' && WiFi.status() != WL_CONNECT_FAILED && millis() - inicio < WIFI_TIMEOUT_MS',''));
  await page.getByTestId('esp-code-tab-web').click();await page.getByTestId('simulation-start').click();await wifiState(page,4);
  assert.equal(await page.getByTestId('esp-web-frame').count(),0);await page.getByTestId('simulation-stop').click();await status(page,'stopped');
});
