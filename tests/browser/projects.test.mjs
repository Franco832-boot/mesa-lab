import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { brightness, openFixture, select, startHarness, status } from './harness.mjs';
import { project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
async function save(page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
}
async function loadExample(page, id) {
  await save(page);
  if (await page.getByTestId('library-toggle').getAttribute('aria-expanded') === 'false') await page.getByTestId('library-toggle').click();
  await page.getByTestId(`example-${id}`).getByRole('button').click();
  await status(page, 'stopped');
  await page.locator('[data-reference="uno"]').waitFor();
}
async function virtualClock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}
async function snapshot(page, name) {
  await mkdir('test-results/browser', { recursive: true });
  await page.screenshot({ path: `test-results/browser/${name}.png`, animations: 'disabled' });
}

for (const locale of ['es', 'en']) for (const width of [1440, 390]) {
  test(`independent left projects and right tools, ${locale}, ${width}px`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project(), { locale, width });
    const toggle = page.getByTestId('library-toggle');
    const right = page.getByTestId('tool-sidebar');
    const left = page.getByTestId('project-library');
    const stage = page.getByTestId('workspace-stage');
    assert.equal(await toggle.getAttribute('aria-label'), locale === 'es' ? 'Mostrar/Ocultar proyectos' : 'Show/Hide projects');
    const viewport = await page.locator('.workspace-svg > g').getAttribute('transform');
    const stageNode = await stage.elementHandle();
    const before = await stage.boundingBox(); assert.ok(before);
    await toggle.click();
    assert.equal(await left.isVisible(), true); assert.equal(await right.isVisible(), true);
    assert.equal(await left.locator('.project-card').count(), 7);
    assert.equal(await left.locator('.project-category').count(), 3);
    const projectsBox = await left.boundingBox(), stageBox = await stage.boundingBox(), rightBox = await right.boundingBox();
    assert.ok(projectsBox && stageBox && rightBox);
    if (width > 760) {
      assert.ok(projectsBox.x + projectsBox.width <= stageBox.x + 1);
      assert.ok(stageBox.x + stageBox.width <= rightBox.x + 1);
      assert.ok(stageBox.width >= 350);
    } else {
      assert.ok(projectsBox.y + projectsBox.height <= stageBox.y + 1);
      assert.ok(projectsBox.y + projectsBox.height <= rightBox.y + 1);
      assert.ok(stageBox.width >= width - 2);
    }
    assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), viewport);
    assert.ok(await stageNode.evaluate((node) => node === document.querySelector('[data-testid="workspace-stage"]')));
    await snapshot(page, `projects-${locale}-${width}`);
    await page.getByTestId('sidebar-toggle').click();
    assert.equal(await right.isVisible(), false); assert.equal(await left.isVisible(), true);
    await page.getByTestId('sidebar-toggle').click();
    await toggle.click();
    assert.equal(await left.isVisible(), false); assert.equal(await right.isVisible(), true);
    const restored = await stage.boundingBox(); assert.ok(restored);
    assert.ok(Math.abs(restored.width - before.width) < 1 && Math.abs(restored.height - before.height) < 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  });
}

test('DHT project loads real connections/sketch, persists edits and reads the inspector environment', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project());
  await loadExample(page, 'dht11');
  await select(page, 'sensor');
  const temperature = page.getByRole('spinbutton', { name: 'Ambient temperature (°C)', exact: true });
  await temperature.fill('30'); await temperature.press('Tab');
  await save(page);
  await page.reload();
  assert.equal(await page.locator('[data-reference]').count(), 3);
  assert.equal(await page.getByTestId('dht11-pcb').count(), 1);
  await virtualClock(page); await page.getByTestId('simulation-start').click();
  await page.clock.runFor(2100);
  await page.waitForFunction(() => document.querySelector('[data-testid="serial-output"]')?.textContent?.includes('Temperatura: 30.00 °C'));
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
  await snapshot(page, 'projects-dht11-running');
  await page.getByTestId('simulation-stop').click();
  assert.equal(await page.getByTestId('serial-output').count(), 0);
});

for (const id of ['led-millis', 'led-for']) {
  test(`${id} uses the virtual clock and connected LED; pause and stop preserve the document`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project());
    await loadExample(page, id); await save(page);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('persist:mesa.project')).document);
    assert.equal(await page.locator('[data-reference]').count(), 4);
    await virtualClock(page); await page.getByTestId('simulation-start').click();
    if (id === 'led-millis') {
      await brightness(page, 'led', false);
      // The cooperative browser pump batches millis polling into 16 ms frames.
      await page.clock.runFor(1010); await brightness(page, 'led', true);
      await page.clock.runFor(1000); await brightness(page, 'led', false);
    } else {
      await brightness(page, 'led', true);
      await page.clock.runFor(300); await brightness(page, 'led', false);
      await page.clock.runFor(300); await brightness(page, 'led', true);
    }
    await page.getByTestId('simulation-pause').click(); await status(page, 'paused');
    const held = await page.locator('[data-reference="led"]').getAttribute('data-brightness');
    await page.clock.runFor(3000);
    assert.equal(await page.locator('[data-reference="led"]').getAttribute('data-brightness'), held);
    await page.getByTestId('simulation-stop').click(); await brightness(page, 'led', false);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('persist:mesa.project')).document), before);
    assert.equal(await page.getByTestId('firmware-error').count(), 0);
  });
}

test('unsaved replacement can be canceled and accepted without overwriting the previous snapshot', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project());
  await save(page); await virtualClock(page);
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Unsaved experiment');
  await page.getByTestId('library-toggle').click();
  await page.getByTestId('example-led-for').getByRole('button').click();
  const dialog = page.getByRole('dialog', { name: 'Replace the current project?', exact: true });
  await dialog.waitFor(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.locator('[data-reference]').count(), 0);
  await page.getByTestId('example-led-for').getByRole('button').click();
  await page.getByTestId('confirm-example').click();
  await page.locator('[data-reference="led"]').waitFor();
  const copies = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('mesa.project.before-example.v1:')).map((key) => JSON.parse(localStorage.getItem(key))));
  assert.equal(copies.length, 1); assert.equal(copies[0].name, 'Unsaved experiment');
});
