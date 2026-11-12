import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { brightness, openFixture, part, select, startHarness, status } from './harness.mjs';
import { component, ledCircuit } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const nav = (page, panel) => page.getByTestId(`mobile-panel-${panel}`);
function fixture() {
  const document = ledCircuit();
  document.components.push(component('arduino-uno', 'uno', 80, 270, { logicVoltage: 5 }));
  document.programs = [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable',
    source: 'void setup() {}\nvoid loop() {}' }];
  return document;
}
async function screenshot(page, name) {
  await mkdir('test-results/browser/responsive', { recursive: true });
  await page.screenshot({ path: `test-results/browser/responsive/${name}.png`, animations: 'disabled' });
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No page overflow');
}
async function reachable(control) {
  assert.equal(await control.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), true, 'Control receives pointer/touch events');
}
async function onlyPanel(page, expected) {
  assert.equal(await page.getByTestId('project-library').isVisible(), expected === 'projects');
  assert.equal(await page.getByTestId('tool-sidebar').isVisible(), expected === 'components' || expected === 'code');
  assert.equal(await page.getByTestId('context-inspector').isVisible(), expected === 'inspector');
}
async function headerOnly(page) {
  const inspector = page.getByTestId('context-inspector');
  assert.equal(await page.locator('#context-inspector-body').isVisible(), false);
  assert.equal(await page.getByTestId('inspector-expand').getAttribute('aria-expanded'), 'false');
  const box = await inspector.boundingBox(), heading = await inspector.locator('.panel-heading').boundingBox();
  assert.ok(box && heading);
  assert.ok(box.height - heading.height <= 9, `Collapsed height ${box.height} includes only header ${heading.height}`);
  assert.equal(await inspector.locator('button:visible').count(), 2, 'Only chevron and close remain');
  await reachable(page.getByTestId('inspector-expand'));
  await reachable(page.getByTestId('inspector-close'));
}

for (const width of [320, 360, 390, 430, 768]) for (const locale of ['es', 'en']) {
  test(`mobile sheets preserve desk, code, selection and preference: ${locale}, ${width}px`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, fixture(), { width, height: 844, locale });
    await onlyPanel(page, null);
    assert.equal(await page.getByTestId('sidebar-toggle').isVisible(), false, 'Side arrow replaced by labelled navigation');
    assert.equal(await page.getByTestId('library-toggle').isVisible(), false, 'No duplicate mobile Projects control');
    const stage = page.getByTestId('workspace-stage'), stageNode = await stage.elementHandle();
    const transform = await page.locator('.workspace-svg > g').getAttribute('transform');
    const deskBox = await stage.boundingBox(); assert.ok(deskBox && deskBox.height > 350);
    await screenshot(page, `desk-${locale}-${width}`);
    for (const panel of ['projects', 'components', 'code']) {
      await nav(page, panel).tap();
      await onlyPanel(page, panel);
      assert.deepEqual(await stage.boundingBox(), deskBox, 'Sheets do not resize or move the desk');
      assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), transform);
      await reachable(nav(page, 'desk'));
      await noOverflow(page);
    }
    const editor = page.getByTestId('board-code-editor'), editorNode = await editor.elementHandle();
    const source = 'void setup() {}\nvoid loop() {}\n// código móvil';
    await editor.fill(source);
    await editor.evaluate((textarea) => textarea.setSelectionRange(7, 12));
    await page.getByTestId('sidebar-expand').tap();
    assert.equal(await page.getByTestId('sidebar-expand').getAttribute('aria-expanded'), 'true');
    await screenshot(page, `code-expanded-${locale}-${width}`);
    await page.getByTestId('sidebar-expand').tap();
    assert.equal(await page.getByTestId('sidebar-expand').getAttribute('aria-expanded'), 'false');
    await nav(page, 'components').tap(); await nav(page, 'code').tap();
    assert.ok(await editorNode.evaluate((node) => node === document.querySelector('[data-testid="board-code-editor"]')));
    assert.equal(await editor.inputValue(), source);
    assert.deepEqual(await editor.evaluate((node) => [node.selectionStart, node.selectionEnd]), [7, 12]);
    await page.getByTestId('sidebar-close').tap();
    await onlyPanel(page, null);
    await nav(page, 'components').tap();
    await page.getByTestId('add-resistor').tap();
    await onlyPanel(page, null);
    assert.equal(await page.locator('[data-reference][aria-pressed="true"]').count(), 1);
    await select(page, 'r');
    await nav(page, 'inspector').tap(); await onlyPanel(page, 'inspector');
    assert.equal(await page.getByTestId('inspector-expand').getAttribute('aria-expanded'), 'true');
    const resistance = page.locator('#context-inspector-body input[type="number"]').first();
    await resistance.fill('1000'); await resistance.press('Tab');
    await page.getByTestId('inspector-expand').tap();
    await headerOnly(page);
    assert.equal(await part(page, 'r').getAttribute('aria-pressed'), 'true');
    const original = await part(page, 'r').getAttribute('transform');
    await part(page, 'r').focus(); await part(page, 'r').press('ArrowRight');
    assert.notEqual(await part(page, 'r').getAttribute('transform'), original);
    await page.getByRole('button', { name: locale === 'es' ? 'Rotar 90° (R)' : 'Rotate 90° (R)', exact: true }).tap();
    await headerOnly(page);
    await select(page, 'led'); await headerOnly(page);
    assert.match(await page.getByTestId('context-inspector').locator('.panel-heading').textContent(), /1/);
    await page.getByTestId('inspector-close').tap(); await onlyPanel(page, null);
    await nav(page, 'inspector').tap(); await headerOnly(page);
    await screenshot(page, `inspector-collapsed-${locale}-${width}`);
    await nav(page, 'desk').tap();
    await page.getByTestId('simulation-start').tap(); await status(page, 'running');
    await brightness(page, 'led', true);
    // Independent electrical expectation: (5 V - 2 V) / 1000 Ω / 20 mA = 0.15.
    assert.ok(Math.abs(Number(await part(page, 'led').getAttribute('data-brightness')) - 0.15) < 1e-9);
    await nav(page, 'projects').tap(); await onlyPanel(page, 'projects');
    await nav(page, 'code').tap(); await onlyPanel(page, 'code');
    assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'), 'running');
    assert.equal(await editor.inputValue(), source);
    await nav(page, 'desk').tap();
    await page.getByTestId('simulation-stop').tap(); await status(page, 'stopped');
    await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).tap();
    await page.waitForFunction(() => document.querySelector('.save-state')?.classList.contains('is-saved'));
    assert.ok(await stageNode.evaluate((node) => node === document.querySelector('[data-testid="workspace-stage"]')));
    const savedTransform = await page.locator('.workspace-svg > g').getAttribute('transform');
    await page.reload(); await page.getByTestId('simulation-status').waitFor();
    await onlyPanel(page, null);
    assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), savedTransform);
    await select(page, 'r'); await nav(page, 'inspector').tap(); await headerOnly(page);
    await page.getByTestId('inspector-expand').tap();
    assert.equal(await page.locator('#context-inspector-body').isVisible(), true);
    await nav(page, 'code').tap(); assert.equal(await editor.inputValue(), source);
    await noOverflow(page);
  });
}

test('desktop keeps its controls and the Inspector collapses to its header', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, fixture());
  assert.equal(await nav(page, 'desk').isVisible(), false);
  assert.equal(await page.getByTestId('library-toggle').isVisible(), true);
  assert.equal(await page.locator('.editor-toolbar path[d="M3 5h7l2 3h9v12H3Z"]').count(), 1);
  await page.getByTestId('library-toggle').click();
  await select(page, 'r'); await page.getByTestId('inspector-expand').click(); await headerOnly(page);
  await select(page, 'led'); await headerOnly(page);
  await page.getByTestId('tools-toggle').click(); await headerOnly(page);
  await screenshot(page, 'desktop-collapsed-1440');
  await noOverflow(page);
});

test('orientation and keyboard-sized viewports keep code and panel controls reachable', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, fixture(), { width: 390, height: 844 });
  await nav(page, 'code').tap(); await page.getByTestId('sidebar-expand').tap();
  const editor = page.getByTestId('board-code-editor');
  await editor.fill('void setup() {}\nvoid loop() {}\n// orientation');
  for (const viewport of [{ width: 768, height: 390 }, { width: 390, height: 430 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => Math.abs(document.querySelector('.app-shell').getBoundingClientRect().height - visualViewport.height) < 2);
    await editor.focus(); await editor.press('End'); await editor.press('x');
    await reachable(page.getByTestId('sidebar-close'));
    await reachable(nav(page, 'desk'));
    await noOverflow(page);
  }
  assert.match(await editor.inputValue(), /orientationxxx/);
  await screenshot(page, 'code-orientation-restored');
});
