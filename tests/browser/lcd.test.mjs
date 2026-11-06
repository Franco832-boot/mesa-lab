import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { openFixture, select, startHarness } from './harness.mjs';
import { project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
async function load(page, id) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  await page.getByTestId('library-toggle').click();
  await page.getByTestId(`example-${id}`).getByRole('button').click();
  await page.locator('[data-reference="lcd"]').waitFor();
}
for (const id of ['lcd16-parallel','lcd20-parallel','lcd16-i2c','lcd20-i2c']) {
  test(`${id} displays source-generated text and restores its project after reload`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project());
    await load(page, id); await page.getByTestId('simulation-start').click();
    await page.waitForFunction(() => document.querySelector('[data-reference="lcd"] [data-lcd-row="0"]')?.getAttribute('aria-label')?.trim() === 'Mesa Lab');
    const rows = id.startsWith('lcd20') ? 4 : 2, columns = rows === 4 ? 20 : 16;
    const lcd = page.locator('[data-reference="lcd"]');
    assert.equal(await lcd.locator('[data-lcd-row]').count(), rows);
    assert.equal(await lcd.locator('[data-lcd-cell]').count(), rows * columns);
    if (rows === 4) await page.waitForFunction(() => document.querySelector('[data-reference="lcd"] [data-lcd-row="3"]')?.getAttribute('aria-label')?.trim() === 'HD44780');
    assert.ok(Number(await lcd.getByTestId('lcd-glass').getAttribute('data-backlight')) > 0);
    assert.equal(await page.getByTestId('firmware-error').count(), 0);
    await select(page, 'lcd');
    await page.getByTestId('lcd-status').waitFor();
    await mkdir('test-results/browser', { recursive: true });
    await page.screenshot({ path: `test-results/browser/${id}.png`, animations: 'disabled' });
    await page.getByTestId('simulation-stop').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
    await page.reload(); await page.getByTestId('simulation-start').click();
    await page.waitForFunction(() => document.querySelector('[data-reference="lcd"] [data-lcd-row="0"]')?.getAttribute('aria-label')?.trim() === 'Mesa Lab');
  });
}
test('the PCF address inspector controls addressed communication without changing the sketch', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project());
  await load(page, 'lcd16-i2c'); await select(page, 'adapter');
  await page.getByLabel('I²C address', { exact: true }).selectOption('63');
  await page.getByTestId('simulation-start').click();
  const text = await page.locator('[data-reference="lcd"] [data-lcd-row="0"]').getAttribute('aria-label');
  assert.equal(text, ' '.repeat(16));
  await page.getByTestId('simulation-stop').click();
  await page.getByLabel('I²C address', { exact: true }).selectOption('39');
  await page.getByTestId('simulation-start').click();
  await page.waitForFunction(() => document.querySelector('[data-reference="lcd"] [data-lcd-row="0"]')?.getAttribute('aria-label')?.trim() === 'Mesa Lab');
});
