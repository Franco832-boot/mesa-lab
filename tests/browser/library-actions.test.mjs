import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { openFixture, startHarness } from './harness.mjs';
import { ledCircuit } from './fixtures.mjs';
let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
async function save(page, locale) {
  await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).click();
  await page.getByText(locale === 'es' ? 'Proyecto guardado en este navegador.' : 'Project saved in this browser.', { exact: true }).waitFor();
  await page.locator('.toast button').click();
}
async function stored(page) {
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}
async function draft(page, kind) {
  const link = page.getByTestId(`contact-${kind}`).locator('a');
  const href = await link.getAttribute('href'), url = new URL(href);
  assert.equal(url.protocol, 'mailto:'); assert.equal(url.pathname, 'franco.bettiol@gmail.com');
  assert.ok(url.searchParams.get('body').includes('\r\n'));
  // Observe a real link click without launching an OS email client or sending mail.
  await link.evaluate(anchor => anchor.addEventListener('click', event => { event.preventDefault(); window.testDraft = anchor.href; }, { once: true }));
  await link.click(); assert.equal(await page.evaluate(() => window.testDraft), href);
}
for (const [locale, width] of [['es', 1440], ['en', 390]]) test(`project creation/reopening and compact library requests: ${locale} ${width}px`, { timeout: 60000 }, async t => {
  const fixture = ledCircuit();
  const page = await openFixture(harness.browser, t, fixture, { locale, width });
  await save(page, locale);
  const initial = await stored(page);
  const cards = await page.locator('.project-library-content > article').evaluateAll(nodes => nodes.map(node => node.dataset.testid));
  assert.deepEqual(cards, ['create-project-card', 'contact-project']);
  await mkdir('test-results/browser', { recursive: true });
  await page.getByTestId('contact-project').scrollIntoViewIfNeeded();
  await page.getByTestId('project-library').screenshot({ path: `test-results/browser/library-projects-${locale}-${width}.png`, animations: 'disabled' });
  await draft(page, 'project');
  assert.deepEqual(await stored(page), initial);
  await page.getByTestId('create-project').click();
  if (await page.getByTestId('confirm-project').isVisible()) await page.getByTestId('confirm-project').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="workspace-stage"] [data-reference]').length === 0);
  const name = page.getByRole('textbox', { name: locale === 'es' ? 'Nombre del proyecto' : 'Project name', exact: true });
  await name.fill('User circuit');
  await page.getByTestId('add-resistor').click();
  await save(page, locale);
  const authored = await stored(page);
  assert.notEqual(authored.id, initial.id); assert.equal(authored.name, 'User circuit');
  assert.equal(authored.components.length, 1); assert.deepEqual(authored.wires, []); assert.deepEqual(authored.programs, []);
  await page.getByTestId('create-project').click();
  if (await page.getByTestId('confirm-project').isVisible()) await page.getByTestId('confirm-project').click();
  await save(page, locale); const empty = await stored(page);
  assert.notEqual(empty.id, authored.id); assert.deepEqual(empty.components, []);
  await page.reload(); await page.getByTestId('create-project').waitFor();
  await page.getByTestId('saved-projects').locator('summary').click();
  await page.getByTestId('open-project-copy').filter({ hasText: 'User circuit' }).click();
  if (await page.getByTestId('confirm-project').isVisible()) await page.getByTestId('confirm-project').click();
  await page.waitForFunction(() => document.querySelector('.project-title-row input')?.value === 'User circuit');
  await save(page, locale); assert.deepEqual(await stored(page), authored);
  const originals = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mesa.project.before-example.v1:')).map(key => JSON.parse(localStorage.getItem(key))));
  assert.ok(originals.some(document => JSON.stringify(document) === JSON.stringify(initial)), 'The previous project remains recoverable');
  const count = await page.locator('.component-card').count();
  await page.getByTestId('contact-module').scrollIntoViewIfNeeded();
  await page.getByTestId('component-library').screenshot({ path: `test-results/browser/library-components-${locale}-${width}.png`, animations: 'disabled' });
  await draft(page, 'module');
  await page.getByRole('textbox', { name: locale === 'es' ? 'Buscar componentes…' : 'Search components…', exact: true }).fill('zz-no-component');
  assert.equal(await page.locator('.component-card').count(), 0); assert.ok(count > 0);
  assert.equal(await page.getByTestId('contact-module').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
