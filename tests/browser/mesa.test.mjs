import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  approvedScreenshot, brightness, openFixture, part, select, startHarness, status,
} from './harness.mjs';
import {
  gpioCircuit, ledCircuit, overheatedCircuit, project, unsupportedCircuit,
} from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

async function add(page, kind) {
  await page.getByTestId(`add-${kind}`).click();
  const added = page.locator('[data-reference]').last();
  const id = await added.getAttribute('data-reference');
  assert.ok(id, 'Added component has a stable reference');
  return id;
}
async function connect(page, from, fromPin, to, toPin) {
  const before = await page.locator('[data-wire].circuit-wire').count();
  await select(page, from);
  await page.getByTestId('terminal-select').selectOption(fromPin);
  await page.getByTestId('connect-terminal').click();
  await select(page, to);
  await page.getByTestId('terminal-select').selectOption(toPin);
  await page.getByTestId('connect-terminal').click();
  await page.waitForFunction((count) => document.querySelectorAll('[data-wire].circuit-wire').length === count, before + 1);
}
async function savedProject(page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}

test('library, keyboard move/rotate, properties, exact wires, navigation, simulation and saved reload', { timeout: 90000 }, async (t) => {
  const page = await openFixture(harness.browser, t, project());
  const source = await add(page, 'power-supply');
  const resistor = await add(page, 'resistor');
  await select(page, resistor);
  const original = await part(page, resistor).getAttribute('transform');
  await part(page, resistor).press('Shift+ArrowRight');
  assert.notEqual(await part(page, resistor).getAttribute('transform'), original);
  await page.keyboard.press('r');
  assert.match(await part(page, resistor).getAttribute('transform'), /rotate\(90\)/);
  const resistance = page.getByRole('spinbutton', { name: 'Resistance (Ω)', exact: true });
  await resistance.fill('1000');
  await resistance.press('Enter');
  const led = await add(page, 'led-red');
  const root = page.locator('.workspace-svg > g');
  const initialViewport = await root.getAttribute('transform');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.notEqual(await root.getAttribute('transform'), initialViewport);
  const stage = page.getByTestId('workspace-stage');
  await stage.focus();
  await stage.press('h');
  const beforePan = await root.getAttribute('transform');
  const bounds = await stage.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(await root.getAttribute('transform'), beforePan);
  await stage.press('v');
  await connect(page, source, 'positive', resistor, '1');
  await connect(page, resistor, '2', led, 'anode');
  await connect(page, led, 'cathode', source, 'negative');
  await page.getByTestId('simulation-start').click();
  await status(page, 'running');
  await brightness(page, led, true);
  assert.equal(await part(page, led).getAttribute('data-condition'), 'active');
  // (5 V - 2 V) / 1000 ohm = 3 mA; modeled brightness is I / 20 mA.
  assert.ok(Math.abs(Number(await part(page, led).getAttribute('data-brightness')) - 0.15) < 1e-9);
  assert.equal(await page.getByTestId('add-resistor').isDisabled(), true);
  await select(page, resistor);
  assert.equal(await resistance.isDisabled(), true);
  const count = await page.locator('[data-reference]').count();
  await part(page, resistor).press('Delete');
  assert.equal(await page.locator('[data-reference]').count(), count);
  await page.getByTestId('simulation-pause').click();
  await status(page, 'paused');
  await brightness(page, led, true);
  await page.getByTestId('simulation-start').click();
  await page.getByTestId('simulation-stop').click();
  await status(page, 'stopped');
  await brightness(page, led, false);
  const saved = await savedProject(page);
  assert.equal(saved.components.length, 3);
  assert.equal(saved.wires.length, 3);
  assert.equal(saved.components.find((entry) => entry.id === resistor).properties.resistance, 1000);
  assert.equal(saved.components.find((entry) => entry.id === resistor).rotation, 90);
  await page.reload();
  await status(page, 'stopped');
  assert.equal(await page.locator('[data-reference]').count(), 3);
  assert.equal(await page.locator('[data-wire].circuit-wire').count(), 3);
  await page.getByTestId('simulation-start').click();
  await brightness(page, led, true);
  await page.getByTestId('simulation-reset').click();
  await status(page, 'stopped');
  await brightness(page, led, false);
});

for (const [name, fixture, diagnostic] of [
  ['reversed LED', ledCircuit({ reversed: true }), 'reverse-polarity'],
  ['missing return wire', ledCircuit({ open: true }), 'open-circuit'],
  ['unsupported ideal LED circuit without resistor', unsupportedCircuit(), 'unsupported-network'],
]) {
  test(`${name} stays dark and reports electrical diagnostics`, async (t) => {
    const page = await openFixture(harness.browser, t, fixture);
    await page.getByTestId('simulation-start').click();
    await brightness(page, 'led', false);
    await page.locator(`[data-code="${diagnostic}"]`).first().waitFor();
    assert.notEqual(await part(page, 'led').getAttribute('data-condition'), 'active');
  });
}

test('pushbutton responds to held pointer and keyboard contacts', async (t) => {
  const page = await openFixture(harness.browser, t, ledCircuit({ button: true }));
  await select(page, 'button');
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led', false);
  const button = page.getByTestId('runtime-button');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await brightness(page, 'led', true);
  await page.mouse.up();
  await brightness(page, 'led', false);
  await button.focus();
  await page.keyboard.down('Space');
  await brightness(page, 'led', true);
  await page.keyboard.up('Space');
  await brightness(page, 'led', false);
  await part(page, 'button').focus();
  await page.keyboard.down('Space');
  await brightness(page, 'led', true);
  await page.keyboard.up('Space');
  await brightness(page, 'led', false);
  const stage = page.getByTestId('workspace-stage');
  await stage.focus();
  await stage.press('h');
  const viewport = page.locator('.workspace-svg > g');
  const beforePan = await viewport.getAttribute('transform');
  const physicalButton = await part(page, 'button').locator('.component-outline').boundingBox();
  assert.ok(physicalButton);
  const x = physicalButton.x + physicalButton.width / 2;
  const y = physicalButton.y + physicalButton.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await brightness(page, 'led', false);
  await page.mouse.move(x + 30, y + 20, { steps: 5 });
  await page.mouse.up();
  assert.notEqual(await viewport.getAttribute('transform'), beforePan);
  await brightness(page, 'led', false);
});

test('manual GPIO drives actual wires HIGH, LOW and high impedance and resets on stop/reload', async (t) => {
  const page = await openFixture(harness.browser, t, gpioCircuit());
  await select(page, 'board');
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led', false);
  const mode = page.getByTestId('gpio-mode-D1');
  const level = page.getByTestId('gpio-level-D1');
  await mode.selectOption('output');
  await level.selectOption('HIGH');
  await brightness(page, 'led', true);
  assert.equal(await page.getByTestId('gpio-mode-D0').locator('option[value="input-pullup"]').getAttribute('disabled'), '');
  await level.selectOption('LOW');
  await brightness(page, 'led', false);
  await level.selectOption('FLOATING');
  await brightness(page, 'led', false);
  await level.selectOption('HIGH');
  await brightness(page, 'led', true);
  await page.getByTestId('simulation-pause').click();
  assert.equal(await level.isDisabled(), true);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led', true);
  await page.getByTestId('simulation-stop').click();
  await brightness(page, 'led', false);
  assert.equal(await mode.inputValue(), 'input');
  const saved = await savedProject(page);
  assert.equal(saved.components.length, 3);
  await page.reload();
  await status(page, 'stopped');
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led', false);
});

test('ESP8266 incompatible voltage reports a GPIO warning', async (t) => {
  const page = await openFixture(harness.browser, t, gpioCircuit({ overvoltage: true }));
  await page.getByTestId('simulation-start').click();
  await page.locator('[data-code="gpio-overvoltage"]').first().waitFor();
  await select(page, 'board');
  assert.match(await page.getByTestId('gpio-D1').locator('.gpio-reading').textContent(), /HIGH.*5 V/s);
});

test('overloaded resistor renders an electrical condition and clears it on reset', async (t) => {
  const page = await openFixture(harness.browser, t, overheatedCircuit());
  await page.getByTestId('simulation-start').click();
  await page.locator('[data-code="resistor-overpower"]').waitFor();
  assert.equal(await part(page, 'r').getAttribute('data-condition'), 'overheated');
  assert.equal(await part(page, 'r').locator('.component-artwork').getAttribute('data-condition'), 'overheated');
  assert.equal(await page.locator('[data-overlay-for="r"] .component-warning').count(), 1);
  await page.getByTestId('simulation-reset').click();
  assert.equal(await part(page, 'r').getAttribute('data-condition'), 'normal');
});

for (const width of [1440, 390, 320]) {
  for (const locale of ['en', 'es']) {
    test(`${locale} layout at ${width}px remains usable with reduced motion`, async (t) => {
      const page = await openFixture(harness.browser, t, ledCircuit(), { locale, width });
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.match(await page.getByTestId('simulation-start').textContent(), locale === 'en' ? /Start simulation/ : /Iniciar/);
      const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth, viewport: window.innerWidth,
      }));
      assert.ok(dimensions.content <= dimensions.viewport, 'No horizontal page overflow');
      const bounds = await page.getByTestId('workspace-stage').boundingBox();
      assert.ok(bounds && bounds.width > 0 && bounds.height > 0, 'Workbench remains visible');
      await page.getByTestId('simulation-start').click();
      await status(page, 'running');
      await brightness(page, 'led', true);
      assert.equal(await part(page, 'led').locator('.led-glow').evaluate((element) =>
        getComputedStyle(element).transitionDuration), '0s');
      await page.getByTestId('simulation-stop').click();
      await status(page, 'stopped');
      const language = page.getByRole('combobox', { name: locale === 'en' ? 'Language' : 'Idioma', exact: true });
      await language.selectOption(locale === 'en' ? 'es' : 'en');
      assert.equal(await page.locator('html').getAttribute('lang'), locale === 'en' ? 'es' : 'en');
    });
  }
}

test('reviewed desktop/mobile screenshot comparisons', {
  skip: process.env.MESA_SCREENSHOTS !== '1', timeout: 60000,
}, async (t) => {
  for (const [name, width] of [['desktop-en', 1440], ['mobile-en', 390]]) {
    const page = await openFixture(harness.browser, t, ledCircuit(), { width });
    await page.getByTestId('simulation-start').click();
    await brightness(page, 'led', true);
    await page.waitForFunction(() => localStorage.getItem('persist:mesa.project') !== null);
    await approvedScreenshot(page, name);
  }
});
