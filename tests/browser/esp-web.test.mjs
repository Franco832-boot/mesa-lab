import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { brightness, openFixture, startHarness, status, baseURL } from './harness.mjs';
import { project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
async function openCode(page) {
  if (await page.getByTestId('project-library').isVisible()) await page.getByTestId('library-toggle').click();
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId('tool-tab-code').click();
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
}
async function save(page, locale) {
  const toast = page.locator('.toast');
  if (await toast.isVisible()) await toast.locator('button').click();
  await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).click();
  await page.getByText(locale === 'es' ? 'Proyecto guardado en este navegador.' : 'Project saved in this browser.', { exact: true }).waitFor();
}
async function example(page, locale) {
  await save(page, locale);
  if (await page.getByTestId('library-toggle').getAttribute('aria-expanded') === 'false') await page.getByTestId('library-toggle').click();
  await page.getByTestId('example-esp-web-led').getByRole('link').click();
  await page.locator('[data-reference="esp"]').waitFor();
  await openCode(page);
  await page.getByTestId('esp-code-tab-html').click();
}
for (const locale of ['es', 'en']) for (const width of [1440, 390]) {
  test(`ESP web page drives the wired D5 LED and respects lifecycle: ${locale} ${width}px`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project([]), { locale, width });
    const network = [];
    page.on('request', request => { if (!request.url().startsWith(baseURL) && !request.url().startsWith('blob:')) network.push(request.url()); });
    await example(page, locale);
    assert.equal(await page.getByTestId('tool-tab-iot').count(), 0);
    await page.getByTestId('esp-code-tab-wifi').click();
    await page.locator('#tool-panel-code').getByRole('tab', { name: 'wifi.cpp', exact: true }).click();
    const sourceEditor = page.locator('#tool-panel-code').getByTestId('board-code-editor');
    const original = await sourceEditor.inputValue();
    assert.match(original, /const char\* ssid = "MiCasa"/);
    assert.match(original, /const char\* password = "carlos"/);
    assert.equal(await page.getByTestId('esp-wifi-environment').count(), 0);
    await page.getByTestId('esp-code-tab-web').click();
    assert.equal(await page.getByTestId('esp-preview-open').isDisabled(), true);
    await page.getByTestId('simulation-start').click();
    await status(page, 'running');
    const frame = page.frameLocator('[data-testid="esp-web-frame"]');
    const state = frame.locator('#status');
    const serial = page.locator('[data-testid="serial-output"][data-component-id="esp"]');
    await serial.getByText('IP: 192.0.2.10', { exact: false }).waitFor();
    assert.match(await serial.textContent(), /IP: 192\.0\.2\.10/);
    assert.equal((await serial.textContent()).includes('carlos'), false);
    await page.waitForFunction(() => document.querySelector('[data-testid="esp-wifi-status"]')?.getAttribute('data-state') === '3');
    await page.evaluate(() => { window.addEventListener('message', event => { if (event.data?.type === 'preview-http') window.mesaTestToken = event.data.token; }); });
    await state.getByText(locale === 'es' ? 'D5: apagado' : 'D5: OFF', { exact: true }).waitFor();
    assert.equal(await frame.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(244, 240, 233)', 'Served CSS loaded');
    await frame.getByRole('button', { name: locale === 'es' ? 'Encender LED' : 'Turn LED on', exact: true }).click();
    await brightness(page, 'led', true);
    await state.getByText(locale === 'es' ? 'D5: encendido' : 'D5: ON', { exact: true }).waitFor();
    const expected = ((3.3 - 2) / (220 + 50)) / .02;
    const actual = Number(await page.locator('[data-reference="led"]').getAttribute('data-brightness'));
    assert.ok(Math.abs(actual - expected) < .000001, `Expected calculated brightness ${expected}, got ${actual}`);
    const oldToken = await page.evaluate(() => window.mesaTestToken);
    assert.equal(typeof oldToken, 'string');
    await frame.getByRole('button', { name: locale === 'es' ? 'Apagar LED' : 'Turn LED off', exact: true }).click();
    await brightness(page, 'led', false);
    await page.getByTestId('simulation-pause').click();
    assert.equal(await page.getByTestId('esp-web-frame').count(), 0);
    assert.equal(await page.getByTestId('esp-preview-open').isDisabled(), true);
    await page.getByTestId('simulation-start').click();
    await page.getByTestId('esp-preview-open').click();
    await frame.locator('#on').click(); await brightness(page, 'led', true);
    await page.getByTestId('simulation-stop').click();
    assert.equal(await page.getByTestId('esp-web-frame').count(), 0);
    await save(page, locale);
    const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
    assert.equal(saved.programs[0].files.length, 10);
    assert.equal(saved.programs[0].files.find(file => file.name === 'funciones.cpp').source.includes('digitalWrite(D5, HIGH)'), true);
    assert.equal('firmware' in saved, false);
    await page.reload(); await status(page, 'stopped');
    await openCode(page);
    await page.getByTestId('esp-code-tab-html').click();
    await page.getByTestId('simulation-start').click(); await page.getByTestId('esp-preview-open').click();
    await state.getByText(locale === 'es' ? 'D5: apagado' : 'D5: OFF', { exact: true }).waitFor();
    await frame.locator('body').evaluate((_, token) => parent.postMessage({type:'preview-http', token, id:9999, path:'/led/on'}, '*'), oldToken);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await brightness(page, 'led', false);
    await page.getByTestId('esp-preview-close').click();
    assert.equal(await page.getByTestId('esp-web-frame').count(), 0);
    await page.getByTestId('esp-code-tab-web').click();
    await state.getByText(locale === 'es' ? 'D5: apagado' : 'D5: OFF', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(network, [], 'Preview never contacted a real device or external server');
  });
}

test('preview sanitizes active markup and confines project JS to a worker with local HTTP only', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project([]));
  await example(page, 'en');
  const panel = page.locator('#tool-panel-code');
  const html = '<body onload="parent.hacked=true"><meta http-equiv="refresh" content="0;url=http://127.0.0.1:9"><iframe src="http://192.0.2.10/frame"></iframe><img src="http://192.0.2.10/image"><video src="http://192.0.2.10/video"></video><p id="status">waiting</p><a href="http://127.0.0.1:9">link</a><script src="/app.js"></script></body>';
  await panel.getByRole('tab', { name: 'index.html', exact: true }).click();
  await panel.getByTestId('board-code-editor').fill(html);
  await panel.getByRole('tab', { name: 'app.js', exact: true }).click();
  await panel.getByTestId('board-code-editor').fill("WorkerGlobalScope.prototype.fetch.call(self, 'http://192.0.2.10/probe').then(async r => { let loaded = false; try { const xhr = new XMLHttpRequest(); xhr.open('GET', 'http://192.0.2.10/probe'); await new Promise(resolve => { xhr.onload = () => { loaded = true; resolve(); }; xhr.onerror = () => resolve(); try { xhr.send(); } catch { resolve(); } }); } catch {} document.querySelector('#status').textContent = r.status + '|' + typeof window + '|' + typeof self.document + '|' + typeof localStorage + '|' + (loaded ? 'escaped' : 'blocked'); });");
  const forbidden = [];
  page.on('request', request => { if (request.url().startsWith('http://127.0.0.1:9') || request.url().startsWith('http://192.0.2.10')) forbidden.push(request.url()); });
  await page.getByTestId('simulation-start').click(); await page.getByTestId('esp-preview-open').click();
  const frame = page.frameLocator('[data-testid="esp-web-frame"]');
  await frame.getByText('400|undefined|undefined|undefined|blocked', { exact: true }).waitFor();
  assert.equal(await frame.locator('#content').locator('iframe,meta,a[href],[onload]').count(), 0);
  assert.equal(await page.evaluate(() => window.hacked), undefined);
  assert.equal(await page.getByTestId('esp-web-frame').getAttribute('sandbox'), 'allow-scripts');
  assert.deepEqual(forbidden, []);
});

for (const [ssid, password] of [['', 'anything'], ['anything', ''], ['   ', 'anything'], ['anything', '   ']]) {
  test(`empty emulated credentials disable the server and preview: ${JSON.stringify([ssid,password])}`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project([]));
    await example(page, 'en');
    await page.getByTestId('esp-code-tab-wifi').click();
    await page.locator('#tool-panel-code').getByRole('tab', { name: 'wifi.cpp', exact: true }).click();
    const editor = page.locator('#tool-panel-code').getByTestId('board-code-editor');
    await editor.fill((await editor.inputValue()).replace('ssid = "MiCasa"', 'ssid = ' + JSON.stringify(ssid)).replace('password = "carlos"', 'password = ' + JSON.stringify(password)));
    await page.getByTestId('esp-code-tab-web').click();
    await page.getByTestId('simulation-start').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="esp-wifi-status"]')?.getAttribute('data-state') === '4');
    assert.equal(await page.getByTestId('esp-preview-open').isDisabled(), true);
    assert.equal(await page.getByTestId('esp-web-frame').count(), 0);
    await brightness(page, 'led', false);
    assert.equal((await page.locator('[data-testid="serial-output"][data-component-id="esp"]').textContent()).includes('192.0.2.10'), false);
  });
}

test('a connected ESP still requires firmware server start; GET forms and links use the virtual server', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project([]));
  await example(page, 'en');
  await page.getByTestId('esp-code-tab-main').click();
  const editor = page.locator('#tool-panel-code').getByTestId('board-code-editor');
  const main = await editor.inputValue();
  await editor.fill(main.replace('iniciarServidor();', 'delay(0);'));
  await page.getByTestId('esp-code-tab-web').click();
  await page.getByTestId('simulation-start').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="esp-wifi-status"]')?.getAttribute('data-state') === '3');
  assert.equal(await page.getByTestId('esp-preview-open').isDisabled(), true);
  assert.equal(await page.getByTestId('esp-web-frame').count(), 0);
  await page.getByTestId('simulation-stop').click();
  await page.getByTestId('esp-code-tab-main').click(); await editor.fill(main);
  await page.getByTestId('esp-code-tab-html').click();
  await page.locator('#tool-panel-code').getByRole('tab', { name: 'index.html', exact: true }).click();
  await editor.fill('<form action="/led/on" method="get"><button type="submit">On by form</button></form><a href="/led/off">Off by link</a>');
  await page.getByTestId('simulation-start').click();
  const frame = page.frameLocator('[data-testid="esp-web-frame"]');
  await frame.getByRole('button', { name: 'On by form' }).click();
  await brightness(page, 'led', true);
  await frame.locator('#native-response').getByText('200: ON', { exact: true }).waitFor();
  await frame.getByText('Off by link', { exact: true }).click();
  await brightness(page, 'led', false);
  await frame.locator('#native-response').getByText('200: OFF', { exact: true }).waitFor();
});

test('ESP Inspector keeps information and GPIO without connection/simulator sections or generic boot warnings', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project([]));
  await example(page, 'en');
  const board = page.locator('[data-reference="esp"]');
  await board.focus(); await board.press('Enter');
  const inspector = page.locator('#context-inspector');
  await inspector.getByRole('button', { name: 'Overview', exact: true }).waitFor();
  assert.equal(await inspector.getByTestId('inspector-more').count(), 0);
  assert.equal(await inspector.getByTestId('terminal-select').count(), 0);
  assert.equal(await inspector.getByTestId('connect-terminal').count(), 0);
  await inspector.getByRole('button', { name: 'GPIO pins', exact: true }).click();
  await inspector.getByTestId('gpio-D5').waitFor();
  const row = inspector.locator('tr').filter({ has: page.locator('td', { hasText: /^D5$/ }) });
  assert.match(await row.textContent(), /D5.*14.*—/);
  await page.getByTestId('simulation-start').click();
  assert.equal(await page.locator('.diagnostic-card[data-code="boot-sensitive-pin"]').count(), 0);
});
