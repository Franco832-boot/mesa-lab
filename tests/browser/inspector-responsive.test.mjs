import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { brightness, openFixture, part, select, startHarness, status } from './harness.mjs';
import { ledCircuit } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const inspector = (page) => page.getByTestId('context-inspector');
const toggle = (page) => page.getByTestId('inspector-expand');
async function hit(control) {
  assert.equal(await control.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), true, 'Control stays reachable');
}
async function screenshot(page, name) {
  await mkdir('test-results/browser/inspector', { recursive: true });
  await page.screenshot({ path: `test-results/browser/inspector/${name}.png`, animations: 'disabled' });
}
async function collapsed(page) {
  assert.equal(await toggle(page).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#context-inspector-body').isVisible(), false);
  const panel = await inspector(page).boundingBox(), header = await inspector(page).locator('.panel-heading').boundingBox();
  assert.ok(panel && header && panel.height - header.height <= 9, 'Only the header occupies space');
  await hit(toggle(page)); await hit(page.getByTestId('inspector-close'));
}

for (const width of [320, 390, 768]) for (const locale of ['es', 'en']) {
  test(`Inspector uses the shared mobile sheet, ${locale} at ${width}px`, { timeout: 45000 }, async (t) => {
    const page = await openFixture(harness.browser, t, ledCircuit(), { width, height: 844, locale });
    const stage = await page.getByTestId('workspace-stage').elementHandle();
    const transform = await page.locator('.workspace-svg > g').getAttribute('transform');
    await select(page, 'r');
    await page.getByTestId('mobile-panel-components').click();
    const sharedBox = await page.getByTestId('tool-sidebar').boundingBox();
    await page.getByTestId('mobile-panel-inspector').click();
    assert.equal(await inspector(page).count(), 1);
    assert.equal(await page.locator('.floating-inspector').count(), 0);
    assert.equal(await page.locator('.inspector-overlay').count(), 0);
    assert.equal(await page.getByTestId('tool-sidebar').isVisible(), false);
    assert.equal(await inspector(page).evaluate((node) => node.parentElement.classList.contains('lab-layout')), true);
    assert.match(await inspector(page).getAttribute('class'), /tool-sidebar.*mobile-inspector-sheet/);
    assert.deepEqual(await inspector(page).boundingBox(), sharedBox, 'Inspector uses the same sheet bounds');
    assert.equal(await inspector(page).locator('.panel-heading').count(), 1);
    assert.equal(await inspector(page).getByTestId('inspector-close').count(), 1);
    await hit(toggle(page)); await hit(page.getByTestId('inspector-close'));
    const resistance = page.locator('#context-inspector-body input[type="number"]').first();
    await resistance.fill('1000'); await resistance.press('Tab');
    await resistance.evaluate((node) => node.scrollIntoView({ block: 'nearest' })); await hit(resistance);
    assert.equal(await inspector(page).locator('.inspector-scroll').evaluate((node) => node.scrollHeight > node.clientHeight), true);
    await screenshot(page, `mobile-expanded-${locale}-${width}`);
    await toggle(page).click(); await collapsed(page);
    await select(page, 'led'); await collapsed(page);
    assert.equal(await part(page, 'led').getAttribute('aria-pressed'), 'true');
    await screenshot(page, `mobile-collapsed-${locale}-${width}`);
    await page.getByTestId('inspector-close').click();
    assert.equal(await inspector(page).count(), 0);
    assert.equal(await part(page, 'led').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'mobile-panel-inspector');
    await page.getByTestId('simulation-start').click(); await status(page, 'running');
    await brightness(page, 'led', true);
    // (5 V - 2 V) / 1000 Ω / 20 mA = 0.15; panel changes must preserve this solved result.
    assert.ok(Math.abs(Number(await part(page, 'led').getAttribute('data-brightness')) - 0.15) < 1e-9);
    await page.getByTestId('mobile-panel-inspector').click(); await collapsed(page);
    await page.getByTestId('mobile-panel-projects').click();
    assert.equal(await inspector(page).count(), 0);
    await page.getByTestId('mobile-panel-inspector').click(); await collapsed(page);
    assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'), 'running');
    assert.ok(Math.abs(Number(await part(page, 'led').getAttribute('data-brightness')) - 0.15) < 1e-9);
    await page.getByTestId('mobile-panel-desk').click();
    assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), transform);
    assert.ok(await stage.evaluate((node) => node === document.querySelector('[data-testid="workspace-stage"]')));
    await page.getByTestId('simulation-stop').click(); await status(page, 'stopped');
    await page.reload(); await page.getByTestId('simulation-status').waitFor();
    await select(page, 'r'); await page.getByTestId('mobile-panel-inspector').click(); await collapsed(page);
    await toggle(page).click(); assert.equal(await page.locator('#context-inspector-body').isVisible(), true);
    await page.getByTestId('mobile-panel-desk').click();
    const wire = page.locator('.circuit-wire[data-wire="supply"]');
    await wire.focus(); await wire.press('Enter');
    await page.getByTestId('mobile-panel-inspector').click();
    assert.equal(await inspector(page).count(), 1);
    assert.equal(await inspector(page).locator('.wire-inspector input[type="color"]').isVisible(), true);
    await toggle(page).click(); await collapsed(page);
    await inspector(page).press('Escape');
    assert.equal(await inspector(page).count(), 0);
    assert.equal(await wire.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
}

for (const locale of ['es', 'en']) {
  test(`desktop floating Inspector retains selection and persistent collapse, ${locale}`, { timeout: 45000 }, async (t) => {
    const page = await openFixture(harness.browser, t, ledCircuit(), { locale });
    await select(page, 'r');
    assert.equal(await page.locator('.floating-inspector').count(), 1);
    assert.equal(await page.locator('.mobile-inspector-sheet').count(), 0);
    await toggle(page).click(); await collapsed(page);
    await select(page, 'led'); await collapsed(page);
    await page.getByTestId('inspector-close').click();
    assert.equal(await part(page, 'led').getAttribute('aria-pressed'), 'true');
    await select(page, 'led'); await collapsed(page);
    await screenshot(page, `desktop-collapsed-${locale}`);
    await page.reload(); await page.getByTestId('simulation-status').waitFor();
    await select(page, 'r'); await collapsed(page);
    await toggle(page).click(); assert.equal(await page.locator('#context-inspector-body').isVisible(), true);
  });
}
