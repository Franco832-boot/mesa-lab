import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { baseURL, brightness, openFixture, startHarness, status } from './harness.mjs';
import { project } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

for (const width of [1440, 390]) {
  test(`library opens the Chat-Simulation sketch and Arduino drives the LED at ${width}px`, { timeout: 30000 }, async (t) => {
    const page = await openFixture(harness.browser, t, project([]), { width, locale: 'es' });
    const external = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (new URL(url).origin === new URL(baseURL).origin) return route.continue();
      external.push(url);
      return route.abort();
    });
    const example = page.getByTestId('example-esp-chat-led');
    await example.getByRole('link').click();
    const confirmation = page.getByTestId('confirm-example');
    if (await confirmation.isVisible()) await confirmation.click();
    await page.locator('[data-reference="esp"]').waitFor({ state: 'attached' });
    const editor = page.getByTestId('board-code-editor');
    await editor.waitFor({ state: 'visible' });
    assert.match(await editor.inputValue(), /bot\.getUpdates\(bot\.last_message_received \+ 1\)/);
    await page.getByTestId('esp-code-tab-web').waitFor();
    await page.getByRole('tab', { name: 'Chat-Simulation' }).click();
    assert.equal(await editor.count(), 0);
    await page.getByText('Entorno simulado').waitFor();
    await page.getByTestId('simulation-start').click();
    await status(page, 'running');
    const input = page.getByRole('textbox', { name: 'Escribí un mensaje' });
    const send = async (message) => {
      await input.fill(message);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    };
    await send('/encender');
    await page.getByText('LED encendido.', { exact: false }).waitFor();
    await brightness(page, 'led', true);
    await page.getByTestId('simulation-pause').click();
    await status(page, 'paused');
    assert.equal(await input.isDisabled(), true);
    await page.getByTestId('simulation-start').click();
    await send('/apagar');
    await page.getByText('LED apagado.', { exact: false }).waitFor();
    await brightness(page, 'led', false);
    await page.getByTestId('simulation-stop').click();
    await status(page, 'stopped');
    assert.equal(await page.getByRole('log', { name: 'Historial de mensajes' }).locator('p').count(), 0);
    assert.deepEqual(external, []);
  });
}
