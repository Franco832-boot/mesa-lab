import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { baseURL, openFixture, select, startHarness, status } from './harness.mjs';
import { project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

const motor = (page) => page.locator('[data-reference="motor"] [data-testid="motor-artwork"]');
async function direction(page, expected) {
  await page.waitForFunction((expected) => document.querySelector('[data-reference="motor"] [data-testid="motor-artwork"]')?.getAttribute('data-direction') === expected, expected);
}
async function clock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}

for (const locale of ['es', 'en']) for (const width of [1440, 390]) {
  test(`real motor example, branded battery, inspector and timing: ${locale}, ${width}px`, { timeout: 60000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project(), { locale, width });
    await page.goto(`${baseURL}/arduino-motor-dc-l293d`);
    await motor(page).waitFor();
    await status(page, 'stopped');
    const battery = page.locator('[data-reference="battery"] [data-testid="battery-artwork"]');
    assert.equal(await battery.locator('image').getAttribute('href'), '/losprofesparavos-isotype.png');
    assert.match(await battery.textContent(), /Los ProfesPara Vos9 V/);
    assert.equal(await page.request.get(`${baseURL}/losprofesparavos-isotype.png`).then((result) => result.ok()), true);
    assert.equal(await page.locator('[data-reference="bridge"] [data-testid="l293d-artwork"]').count(), 1);
    await clock(page);
    await page.getByTestId('simulation-start').click();
    await direction(page, 'forward');
    await select(page, 'motor');
    if (width <= 768) await page.getByTestId('mobile-panel-inspector').click();
    const inspector = page.getByTestId('context-inspector');
    await inspector.getByTestId('motor-direction').waitFor();
    assert.equal(await inspector.getByTestId('motor-direction').textContent(), locale === 'es' ? 'Directo' : 'Forward');
    assert.match(await inspector.textContent(), locale === 'es' ? /Corriente estimada/ : /Estimated current/);
    assert.ok((await inspector.getByTestId('electrical-values').textContent()).includes(locale === 'es' ? '0,08464 A' : '0.08464 A'));
    assert.match(await inspector.textContent(), locale === 'es' ? /sin RPM, par, inercia/ : /without RPM, torque, inertia/);
    assert.equal(await inspector.locator('.terminal-readings').getAttribute('open'), null);
    const shaft = page.locator('[data-reference="motor"] [data-testid="motor-shaft"]');
    assert.equal(await shaft.evaluate((node) => getComputedStyle(node).animationName), 'none', 'Reduced motion disables shaft animation');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await shaft.evaluate((node) => getComputedStyle(node).animationName), 'motor-shaft-spin');
    await page.getByTestId('simulation-pause').click();
    assert.equal(await shaft.evaluate((node) => getComputedStyle(node).animationPlayState), 'paused');
    await page.clock.runFor(5000); await direction(page, 'forward');
    await page.getByTestId('simulation-start').click();
    await page.clock.runFor(3020); await direction(page, 'stopped');
    await page.clock.runFor(1000); await direction(page, 'reverse');
    assert.equal(await shaft.evaluate((node) => getComputedStyle(node).animationDirection), 'reverse');
    await page.clock.runFor(3000); await direction(page, 'forward');
    assert.equal(await page.getByTestId('firmware-error').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mkdir('test-results/browser', { recursive: true });
    await page.screenshot({ path: `test-results/browser/motor-${locale}-${width}.png`, animations: 'disabled' });
    await page.getByTestId('simulation-stop').click();
    await status(page, 'stopped');
    assert.equal(await motor(page).getAttribute('data-speed'), '0');
    await page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true }).click();
    await page.clock.runFor(200);
    await page.reload();
    await motor(page).waitFor();
    await status(page, 'stopped');
    assert.equal(await motor(page).getAttribute('data-speed'), '0');
    await page.getByTestId('simulation-start').click(); await direction(page, 'forward');
  });
}

for (const fault of ['motor-power', 'logic-power', 'motor-ground', 'out2', 'enable-low', 'wrong-code-pin']) {
test(`${fault} cannot animate the motor despite a running sketch`, { timeout: 60000 }, async (t) => {
  const document = JSON.parse(await readFile(new URL('../../examples/motor-l293d.json', import.meta.url), 'utf8'));
  if (fault === 'enable-low') document.programs[0].source = document.programs[0].source.replace('digitalWrite(enablePin, HIGH)', 'digitalWrite(enablePin, LOW)');
  else if (fault === 'wrong-code-pin') document.programs[0].source = document.programs[0].source.replace('input1 = 9', 'input1 = 11');
  else document.wires = document.wires.filter((wire) => wire.id !== fault);
  const page = await openFixture(harness.browser, t, document);
  await clock(page);
  await page.getByTestId('simulation-start').click();
  await page.clock.runFor(5000);
  assert.equal(await motor(page).getAttribute('data-speed'), '0');
  assert.equal(await page.locator('[data-reference="motor"] .is-rotating').count(), 0);
  await select(page, 'bridge');
  assert.equal(await page.getByTestId('bridge-channel-1').textContent(), fault === 'enable-low' ? 'Output disabled' : fault === 'out2' ? 'Reverse' : 'Invalid supply or signal');
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
});
}

test('a firmware timing edit changes motor timing through the same electrical path', { timeout: 60000 }, async (t) => {
  const document = JSON.parse(await readFile(new URL('../../examples/motor-l293d.json', import.meta.url), 'utf8'));
  document.programs[0].source = document.programs[0].source.replaceAll('3000UL', '500UL');
  const page = await openFixture(harness.browser, t, document);
  await clock(page);
  await page.getByTestId('simulation-start').click();
  await direction(page, 'forward');
  await page.clock.runFor(520); await direction(page, 'stopped');
  await page.clock.runFor(1000); await direction(page, 'reverse');
  await page.clock.runFor(500); await direction(page, 'forward');
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
});
