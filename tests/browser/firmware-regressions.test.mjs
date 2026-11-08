import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { openFixture, startHarness } from './harness.mjs';
import { component, project, wire } from './fixtures.mjs';
let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

test('the actual DHT11 sketch reads the wired environment through the unified bottom Serial monitor', { timeout: 60000 }, async (t) => {
  const document = project([
    component('arduino-uno', 'uno', 50, 60, { logicVoltage: 5 }),
    component('dht11', 'sensor', 400, 180, { temperature: 28, humidity: 63 }),
  ], [wire('vcc', 'uno', '5V', 'sensor', 'VCC'), wire('ground', 'uno', 'GND', 'sensor', 'GND'), wire('data', 'uno', 'D2', 'sensor', 'DATA')]);
  document.programs = [{ componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: readFileSync(new URL('../../examples/arduino/dht11.ino', import.meta.url), 'utf8') }];
  const page = await openFixture(harness.browser, t, document);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.getByTestId('simulation-start').click();
  await page.clock.runFor(2000);
  const output = page.locator('[data-testid="serial-output"][data-component-id="uno"]');
  await output.getByText('Humidity: 63 % | Temperature: 28 C', { exact: false }).waitFor();
  assert.equal(await page.getByTestId('serial-output').count(), 1);
  await page.locator('#serial-uno').getByTestId('serial-clear').click();
  assert.equal(await output.textContent(), '');
  await page.clock.runFor(2000);
  await output.getByText('Humidity: 63 % | Temperature: 28 C', { exact: false }).waitFor();
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
  await page.getByTestId('simulation-stop').click();
  assert.equal(await page.getByTestId('serial-output').count(), 0);
});

test('firmware-generated Serial survives a WiFi.localIP error and simulator diagnostics stay separate', { timeout: 60000 }, async (t) => {
  const document = project([component('esp8266', 'esp', 60, 70, { logicVoltage: 3.3 })]);
  document.programs = [{ componentId: 'esp', language: 'arduino-cpp', execution: 'unavailable', source: '#include <ESP8266WiFi.h>\nvoid setup(){Serial.begin(57600);Serial.println("Before IP lookup");Serial.println(WiFi.localIP());}void loop(){}' }];
  const page = await openFixture(harness.browser, t, document);
  await page.getByTestId('simulation-start').click();
  await page.getByTestId('firmware-error').waitFor();
  assert.equal(await page.getByTestId('firmware-error').getAttribute('data-code'), 'wifi-disconnected');
  assert.equal((await page.getByTestId('serial-output').textContent()).trim(), 'Before IP lookup');
  assert.match(await page.locator('#serial-esp h3').textContent(), /57600 baud/);
  assert.equal((await page.getByTestId('serial-output').textContent()).includes('192.0.2.10'), false);
  await page.getByTestId('serial-clear').click();
  assert.equal(await page.getByTestId('serial-output').textContent(), '');
  assert.equal(await page.getByTestId('firmware-error').count(), 1);
});
