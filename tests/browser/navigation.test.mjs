import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { baseURL, openFixture, startHarness, status } from './harness.mjs';
import { component, project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

async function persisted(page) {
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}
async function save(page, locale = 'en') {
  await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).click();
  await page.getByText(locale === 'es' ? 'Proyecto guardado en este navegador.' : 'Project saved in this browser.', { exact: true }).waitFor();
}
async function confirm(page) {
  const button = page.locator('[data-testid="confirm-example"], [data-testid="confirm-project"]');
  if (await button.isVisible()) await button.click();
}
async function library(page) {
  if (await page.getByTestId('library-toggle').getAttribute('aria-expanded') !== 'true') await page.getByTestId('library-toggle').click();
}

test('public deep links preserve previous projects, retain edits on reload and open fresh templates when shared', async t => {
  const page = await openFixture(harness.browser, t, project());
  await save(page);
  const original = await persisted(page);
  await page.goto(`${baseURL}/esp8266-led-telegram`);
  await page.locator('[data-reference="esp"]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/esp8266-led-telegram');
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await name.fill('Private edits'); await save(page);
  const authored = await persisted(page);
  await page.reload(); await name.waitFor();
  assert.deepEqual(await persisted(page), authored);
  const shared = await page.context().newPage();
  await shared.goto(`${baseURL}/esp8266-led-telegram`);
  await shared.locator('[data-reference="esp"]').waitFor();
  assert.notEqual((await persisted(shared)).id, authored.id);
  assert.notEqual(await shared.getByRole('textbox', { name: 'Project name', exact: true }).inputValue(), 'Private edits');
  const copies = await shared.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mesa.project.before-example.v1:')).map(key => JSON.parse(localStorage.getItem(key))));
  assert.ok(copies.some(copy => copy.id === original.id));
  assert.ok(copies.some(copy => copy.id === authored.id && copy.name === 'Private edits'));
});

test('links, cancellation, history and /new keep URLs aligned with local documents', async t => {
  const page = await openFixture(harness.browser, t, project());
  await save(page);
  const first = page.getByTestId('example-led-for').getByRole('link');
  assert.equal(await first.getAttribute('href'), '/arduino-led-for');
  await first.click(); await confirm(page);
  await page.locator('[data-reference="uno"]').waitFor();
  await save(page); const authored = await persisted(page);
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Unsaved name');
  await page.getByTestId('create-project').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/arduino-led-for');
  await save(page);
  await page.getByTestId('example-dht11').getByRole('link').click(); await confirm(page);
  await page.locator('[data-reference="sensor"]').waitFor(); await save(page);
  await page.goBack(); await page.locator('[data-reference="led"]').waitFor();
  assert.equal((await persisted(page)).id, authored.id);
  assert.equal(await page.getByRole('textbox', { name: 'Project name', exact: true }).inputValue(), 'Unsaved name');
  await save(page); await page.goForward(); await page.locator('[data-reference="sensor"]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/arduino-dht11');
  await page.goto(`${baseURL}/new`);
  await page.waitForURL(/\/local\//);
  await save(page); const empty = await persisted(page), path = page.url();
  assert.deepEqual(empty.components, []);
  await page.reload(); await page.getByTestId('simulation-start').waitFor();
  assert.equal(page.url(), path); assert.equal((await persisted(page)).id, empty.id);
});

test('duplicate local names have distinct URLs and unavailable local links never create public projects', async t => {
  const page = await openFixture(harness.browser, t, project());
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await name.fill('Same name'); await save(page);
  await page.getByTestId('create-project').click(); await confirm(page);
  await name.fill('Same name'); await save(page);
  await page.getByTestId('create-project').click(); await confirm(page);
  await save(page);
  await page.getByTestId('saved-projects').locator('summary').click();
  const copies = page.getByTestId('open-project-copy').filter({ hasText: 'Same name' });
  assert.equal(await copies.count(), 2);
  const first = await copies.nth(0).getAttribute('href'), second = await copies.nth(1).getAttribute('href');
  assert.notEqual(first, second); assert.match(first, /^\/local\/same-name\//);
  await copies.nth(0).click(); await confirm(page); await save(page);
  const restored = await persisted(page);
  await page.reload(); await page.getByTestId('simulation-start').waitFor();
  assert.equal((await persisted(page)).id, restored.id);
  const isolated = await harness.browser.newContext();
  t.after(() => isolated.close());
  const other = await isolated.newPage();
  await other.goto(`${baseURL}${first}`);
  await other.getByTestId('route-error').waitFor();
  assert.match(await other.getByTestId('route-error').innerText(), /local/);
  await other.goto(`${baseURL}/invalid-project`);
  await other.getByTestId('route-error').getByRole('link').click();
  assert.equal(new URL(other.url()).pathname, '/');
  assert.equal(await other.getByTestId('route-error').count(), 0);
});

for (const locale of ['es', 'en']) for (const width of [1440, 390, 320]) {
  test(`ESP tabs stay on one scrollable row and Start selects chat: ${locale}, ${width}px`, async t => {
    const page = await openFixture(harness.browser, t, project(), { locale, width });
    await page.goto(`${baseURL}/esp8266-led-telegram`);
    await page.getByTestId('esp-code-tab-main').waitFor();
    const tabs = page.locator('.esp-code-sections');
    const geometry = await tabs.evaluate(node => ({
      tops: [...node.children].map(child => child.getBoundingClientRect().top),
      overflowing: node.scrollWidth > node.clientWidth, overflow: getComputedStyle(node).overflowX,
    }));
    assert.ok(geometry.tops.every(top => Math.abs(top - geometry.tops[0]) < 1));
    assert.equal(geometry.overflow, 'auto'); assert.equal(geometry.overflowing, true);
    for (const section of ['main', 'wifi', 'functions', 'server', 'html', 'web', 'chat']) {
      const tab = page.getByTestId(`esp-code-tab-${section}`);
      await tab.scrollIntoViewIfNeeded(); await tab.click();
      assert.equal(await tab.getAttribute('aria-selected'), 'true');
      assert.equal(await tab.evaluate(node => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true, `${section} is unobscured`);
    }
    await page.getByTestId('esp-code-tab-chat').focus(); await page.keyboard.press('Home');
    assert.equal(await page.getByTestId('esp-code-tab-main').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.getByTestId('esp-code-tab-chat').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    await page.getByTestId('tools-toggle').click();
    await page.getByTestId('simulation-start').click(); await status(page, 'running');
    assert.equal(await page.getByTestId('esp-code-tab-chat').getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByTestId('esp-code-tab-chat').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByTestId('simulation-stop').click();
    assert.equal(await page.locator('.reference-notice').count(), 0);
  });
}

test('Start selects configured HTML; a plain ESP retains its selected editor tab', async t => {
  const page = await openFixture(harness.browser, t, project());
  await page.goto(`${baseURL}/esp8266-led-web`);
  await page.locator('[data-reference="esp"]').waitFor();
  await page.getByTestId('simulation-start').click();
  await page.getByTestId('esp-code-tab-web').waitFor();
  assert.equal(await page.getByTestId('esp-code-tab-web').getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByTestId('esp-code-tab-chat').count(), 0);
  await page.getByTestId('simulation-stop').click();
  const plain = await openFixture(harness.browser, t, project([component('esp8266', 'plain', 30, 30)]));
  await plain.getByTestId('tool-tab-code').click();
  await plain.getByTestId('esp-code-tab-main').waitFor();
  await plain.getByTestId('simulation-start').click();
  assert.equal(await plain.getByTestId('esp-code-tab-main').getAttribute('aria-selected'), 'true');
  assert.equal(await plain.getByTestId('esp-code-tab-chat').count(), 0);
  await plain.getByTestId('simulation-stop').click();
});
