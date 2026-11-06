import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { openFixture, select, startHarness } from './harness.mjs';
import { component, project, wire } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const source = readFileSync(new URL('../../examples/arduino/dht11.ino', import.meta.url), 'utf8');
function fixture(pin = 2) {
  return { ...project([
    component('arduino-uno', 'uno', 50, 60, { logicVoltage: 5 }),
    component('dht11', 'sensor', 400, 180, { temperature: 25, humidity: 50 }),
  ], [wire('vcc', 'uno', '5V', 'sensor', 'VCC'), wire('ground', 'uno', 'GND', 'sensor', 'GND'),
    wire('data', 'uno', 'D2', 'sensor', 'DATA')]),
    programs: [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: source.replace('#define DHTPIN 2', `#define DHTPIN ${pin}`) }] };
}
async function clock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}
async function waitText(page, text) {
  await page.waitForFunction((text) => document.querySelector('[data-testid="serial-output"][data-component-id="uno"]')?.textContent?.includes(text), text);
}

test('DHT11 inspector edits persist, the actual sketch reads the circuit, and live edits remain transient', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, fixture());
  await select(page, 'sensor');
  assert.equal(await page.locator('[data-reference="sensor"] [data-testid="dht11-artwork"]').count(), 1);
  const temperature = page.getByRole('spinbutton', { name: 'Ambient temperature (°C)', exact: true });
  const humidity = page.getByRole('spinbutton', { name: 'Relative humidity (%)', exact: true });
  await temperature.fill('28.4'); await temperature.press('Tab');
  await humidity.fill('63.2'); await humidity.press('Tab');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  await page.reload();
  await select(page, 'sensor');
  assert.equal(await temperature.inputValue(), '28.4');
  assert.equal(await humidity.inputValue(), '63.2');
  assert.equal(await page.getByTestId('dht11-pcb').count(), 1);
  await page.getByTestId('inspector-more').click();
  assert.deepEqual(await page.getByTestId('terminal-select').locator('option').evaluateAll((options) => options.map((option) => option.value)), ['DATA', 'VCC', 'GND']);
  await mkdir('test-results/browser', { recursive: true });
  await page.screenshot({ path: 'test-results/browser/dht11-module.png', animations: 'disabled' });
  await clock(page);
  await page.getByTestId('simulation-start').click();
  await page.clock.runFor(2000);
  await waitText(page, 'Humidity: 63 % | Temperature: 28 C');
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
  const live = page.getByTestId('dht11-live');
  await live.getByRole('spinbutton', { name: 'Ambient temperature (°C)', exact: true }).fill('31');
  await live.getByRole('spinbutton', { name: 'Ambient temperature (°C)', exact: true }).press('Tab');
  await live.getByRole('spinbutton', { name: 'Relative humidity (%)', exact: true }).fill('70');
  await live.getByRole('spinbutton', { name: 'Relative humidity (%)', exact: true }).press('Tab');
  await page.clock.runFor(2000);
  await waitText(page, 'Humidity: 70 % | Temperature: 31 C');
  const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
  assert.deepEqual(saved.components.find((item) => item.id === 'sensor').properties, { temperature: 28.4, humidity: 63.2 });
  assert.equal(saved.firmware, undefined); assert.equal(saved.inputs, undefined);
  await page.getByTestId('simulation-stop').click();
  assert.equal(await page.getByTestId('serial-output').count(), 0);
});

test('wrong DATA pin produces an invalid sensor reading rather than canned temperature/humidity', async (t) => {
  const page = await openFixture(harness.browser, t, fixture(3));
  await clock(page); await page.getByTestId('simulation-start').click();
  await page.clock.runFor(2000);
  await waitText(page, 'DHT11: read failed');
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
});
