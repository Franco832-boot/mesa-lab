import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { openFixture, startHarness } from './harness.mjs';
import { component, project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const code = (page) => page.locator('#tool-panel-code');
const boardTab = (page, id) => code(page).locator(`[data-testid="code-board-tab"][data-board-id="${id}"]`);
function fixture() {
  const doc = project([
    component('arduino-uno', 'uno', 40, 60, { logicVoltage: 5 }),
    component('esp8266', 'esp', 360, 60, { logicVoltage: 3.3 }),
    component('esp8266', 'other', 600, 60, { logicVoltage: 3.3 }),
  ]);
  doc.programs = [
    { componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: '// UNO preserved' },
    { componentId: 'esp', language: 'arduino-cpp', execution: 'unavailable', source: '// ESP legacy main' },
  ];
  return doc;
}
async function openCode(page) {
  if (await page.getByTestId('project-library').isVisible()) await page.getByTestId('library-toggle').click();
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId('tool-tab-code').click();
  // The existing mobile flow closes the tools sheet when Code is chosen.
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
}
async function savedProject(page, locale = 'en') {
  const toast = page.locator('.toast');
  if (await toast.isVisible()) await toast.locator('button').click();
  await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).click();
  await page.getByText(locale === 'es' ? 'Proyecto guardado en este navegador.' : 'Project saved in this browser.', { exact: true }).waitFor();
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}

for (const locale of ['es', 'en']) for (const width of [1440, 390]) {
  test(`ESP project sections retain headers, implementations and inert HTML across boards/reload: ${locale} ${width}px`, { timeout: 60000 }, async (t) => {
    const original = fixture();
    const page = await openFixture(harness.browser, t, original, { locale, width });
    await openCode(page);
    await boardTab(page, 'esp').click();
    const editor = code(page).getByTestId('board-code-editor');
    const section = (name) => code(page).getByTestId(`esp-code-tab-${name}`);
    assert.equal(await section('main').getAttribute('aria-selected'), 'true');
    assert.equal(await editor.inputValue(), '// ESP legacy main');
    const values = {
      'main.ino': '#include "wifi.h"\n#include "functions.h"\n#include "server.h"\nvoid setup(){connectWifi();startServer();}\nvoid loop(){updateSensors();}',
      'wifi.h': '#pragma once\nvoid connectWifi();',
      'wifi.cpp': '#include "wifi.h"\n#include <ESP8266WiFi.h>\nvoid connectWifi(){WiFi.begin("Lab", "fictional");}',
      'functions.h': '#pragma once\nvoid updateSensors();',
      'functions.cpp': '#include "functions.h"\nvoid updateSensors(){}',
      'server.h': '#pragma once\nvoid startServer();',
      'server.cpp': '#include "server.h"\nvoid startServer(){}',
      'index.html': '<button id="led">LED</button><script>window.espPreviewExecuted = true;</script>',
    };
    await editor.fill(values['main.ino']);
    // Arrow navigation exercises both roving focus and atomic first-time module creation.
    await section('main').focus(); await section('main').press('ArrowRight');
    assert.equal(await section('wifi').evaluate((node) => node === document.activeElement), true);
    for (const name of ['wifi', 'functions', 'server']) {
      await section(name).click();
      assert.equal(await code(page).getByTestId('code-file-tab').count(), 2);
      await editor.fill(values[`${name}.h`]);
      await code(page).getByRole('tab', { name: `${name}.cpp`, exact: true }).click();
      await editor.fill(values[`${name}.cpp`]);
    }
    await section('html').click(); await editor.fill(values['index.html']);
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.evaluate(() => window.espPreviewExecuted), undefined);
    await section('serial').click();
    assert.equal(await code(page).getByTestId('board-code-editor').count(), 0);
    assert.match(await code(page).textContent(), locale === 'es' ? /monitor serie inferior/ : /serial monitor at the bottom/);
    await section('html').click();
    assert.equal(await editor.inputValue(), values['index.html']);
    await boardTab(page, 'other').click(); await editor.fill('// separate ESP');
    await boardTab(page, 'uno').click();
    assert.equal(await editor.inputValue(), '// UNO preserved');
    assert.equal(await code(page).getByTestId('esp-code-tab-main').count(), 0);
    await boardTab(page, 'esp').click();
    assert.equal(await editor.inputValue(), values['index.html']);
    await section('wifi').click();
    await code(page).getByRole('tab', { name: 'wifi.cpp', exact: true }).click();
    await code(page).getByTestId('code-file-explorer-toggle').click();
    await code(page).getByTestId('code-file-explorer').getByRole('button', { name: 'index.html', exact: true }).click();
    assert.equal(await section('html').getAttribute('aria-selected'), 'true');
    await code(page).getByTestId('code-file-explorer-toggle').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No document overflow');
    const saved = await savedProject(page, locale);
    assert.deepEqual(saved.components, original.components);
    assert.deepEqual(saved.wires, original.wires);
    assert.deepEqual(saved.viewport, original.viewport);
    const esp = saved.programs.find((item) => item.componentId === 'esp');
    assert.deepEqual(Object.fromEntries(esp.files.map((file) => [file.name, file.source])), values);
    assert.equal(esp.activeFile, 'index.html');
    assert.equal(esp.source, values['main.ino']);
    assert.equal(esp.files.length, 8);
    await page.reload(); await openCode(page); await boardTab(page, 'esp').click();
    assert.equal(await section('html').getAttribute('aria-selected'), 'true');
    assert.equal(await editor.inputValue(), values['index.html']);
    await section('functions').click();
    await code(page).getByRole('tab', { name: 'functions.cpp', exact: true }).click();
    assert.equal(await editor.inputValue(), values['functions.cpp']);
    await boardTab(page, 'other').click();
    assert.equal(await editor.inputValue(), '// separate ESP');
  });
}

test('ESP serial mini-tab observes the existing per-board runtime and clears on Stop', async (t) => {
  const doc = fixture();
  doc.programs = ['uno', 'esp', 'other'].map((id) => ({ componentId: id, language: 'arduino-cpp', execution: 'unavailable',
    source: `void setup(){Serial.begin(9600);Serial.println("${id}");}void loop(){delay(1000);}` }));
  const page = await openFixture(harness.browser, t, doc);
  await openCode(page); await boardTab(page, 'esp').click();
  await page.getByTestId('simulation-start').click();
  await code(page).getByTestId('esp-code-tab-serial').click();
  assert.equal((await page.locator('[data-testid="serial-output"][data-component-id="esp"]').textContent()).trim(), 'esp');
  await boardTab(page, 'other').click(); await code(page).getByTestId('esp-code-tab-serial').click();
  assert.equal((await page.locator('[data-testid="serial-output"][data-component-id="other"]').textContent()).trim(), 'other');
  assert.equal(await code(page).getByTestId('serial-output').count(), 0, 'The editor never duplicates the bottom monitor');
  await page.locator('#serial-other').getByTestId('serial-clear').click();
  assert.equal((await page.locator('[data-testid="serial-output"][data-component-id="other"]').textContent()).trim(), '');
  assert.equal((await page.locator('[data-testid="serial-output"][data-component-id="esp"]').textContent()).trim(), 'esp');
  const saved = await savedProject(page);
  assert.deepEqual(saved.programs, doc.programs);
  assert.equal(saved.firmware, undefined); assert.equal(saved.virtualNetwork, undefined);
  await page.getByTestId('simulation-stop').click();
  assert.equal(await page.getByTestId('serial-output').count(), 0);
});

test('ESP module creation is one undo step and existing file controls retain renamed source', async (t) => {
  const page = await openFixture(harness.browser, t, fixture());
  await openCode(page); await boardTab(page, 'esp').click();
  await code(page).getByTestId('esp-code-tab-wifi').click();
  assert.equal(await code(page).getByTestId('code-file-tab').count(), 2);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  assert.equal(await code(page).getByTestId('esp-code-tab-main').getAttribute('aria-selected'), 'true');
  assert.equal(await code(page).getByTestId('board-code-editor').inputValue(), '// ESP legacy main');
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  assert.equal(await code(page).getByTestId('code-file-tab').count(), 2);
  const editor = code(page).getByTestId('board-code-editor');
  await editor.fill('#pragma once\nvoid connectWifi();');
  await code(page).getByTestId('code-file-rename').click();
  await page.getByTestId('code-file-name').fill('network.h');
  await page.getByTestId('code-file-confirm').click();
  assert.equal(await code(page).getByTestId('esp-code-tab-main').getAttribute('aria-selected'), 'true');
  assert.equal(await editor.inputValue(), '#pragma once\nvoid connectWifi();');
  await code(page).getByTestId('code-file-delete').click();
  await page.getByTestId('code-file-confirm').click();
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  assert.equal(await editor.inputValue(), '#pragma once\nvoid connectWifi();');
  const saved = await savedProject(page);
  const files = saved.programs.find((item) => item.componentId === 'esp').files;
  assert.equal(files.some((file) => file.name === 'wifi.h'), false);
  assert.equal(files.find((file) => file.name === 'network.h').source, '#pragma once\nvoid connectWifi();');
});
