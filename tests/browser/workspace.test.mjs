import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { brightness, openFixture, part, select, startHarness, status } from './harness.mjs';
import { component, ledCircuit, project, wire } from './fixtures.mjs';
import { readFileSync } from 'node:fs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const panel = (page, tab) => page.locator(`#tool-panel-${tab}`);
const codeBoard = (page, id) => panel(page, 'code').locator(`[data-testid="code-board-tab"][data-board-id="${id}"]`);
async function selectedCodeBoard(page, id) {
  assert.equal(await codeBoard(page, id).getAttribute('aria-selected'), 'true');
}
async function tools(page, tab) {
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId(`tool-tab-${tab}`).click();
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
  assert.equal(await page.getByTestId(`tool-tab-${tab}`).getAttribute('aria-selected'), 'true');
}
async function closeInspector(page) {
  if (await page.getByTestId('inspector-close').isVisible()) await page.getByTestId('inspector-close').click();
}
async function save(page) {
  const toast = page.locator('.toast');
  if (await toast.isVisible()) await toast.locator('button').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}
function workspaceFixture({ reversed = false } = {}) {
  const document = ledCircuit({ reversed });
  document.components.push(
    component('arduino-uno', 'uno', 70, 370, { logicVoltage: 5 }),
    component('esp8266', 'esp', 450, 370, { logicVoltage: 3.3 }),
    component('breadboard', 'bb', 35, 650, { columns: 63 }),
  );
  return document;
}
function dualDeviceFixture() {
  return project([
    component('arduino-uno', 'uno', 20, 380, { logicVoltage: 5 }),
    component('esp8266', 'esp-one', 60, 70, { logicVoltage: 3.3 }),
    component('resistor', 'r-one', 260, 100, { resistance: 330 }),
    component('led', 'led-one', 390, 100, { color: 'red' }),
    component('esp8266', 'esp-two', 500, 370, { logicVoltage: 3.3 }),
    component('resistor', 'r-two', 660, 400, { resistance: 330 }),
    component('led', 'led-two', 790, 400, { color: 'red' }),
  ], [
    wire('out-one', 'esp-one', 'D1', 'r-one', '1'),
    wire('led-one', 'r-one', '2', 'led-one', 'anode'),
    wire('gnd-one', 'led-one', 'cathode', 'esp-one', 'GND'),
    wire('out-two', 'esp-two', 'D1', 'r-two', '1'),
    wire('led-two', 'r-two', '2', 'led-two', 'anode'),
    wire('gnd-two', 'led-two', 'cathode', 'esp-two', 'GND'),
  ]);
}
const blink = (pin = '13', period = 1000) => `void setup(){pinMode(${pin},OUTPUT);}void loop(){digitalWrite(${pin},HIGH);delay(${period});digitalWrite(${pin},LOW);delay(${period});}`;
function firmwareFixture() {
  return project([
    component('arduino-uno', 'uno', 60, 70, { logicVoltage: 5 }),
    component('resistor', 'r-uno', 300, 100, { resistance: 330 }),
    component('led', 'led-uno', 430, 100, { color: 'red' }),
    component('esp8266', 'esp', 60, 370, { logicVoltage: 3.3 }),
    component('resistor', 'r-esp', 300, 400, { resistance: 330 }),
    component('led', 'led-esp', 430, 400, { color: 'red' }),
  ], [
    wire('out-uno', 'uno', 'D13', 'r-uno', '1'),
    wire('anode-uno', 'r-uno', '2', 'led-uno', 'anode'),
    wire('gnd-uno', 'led-uno', 'cathode', 'uno', 'GND'),
    wire('out-esp', 'esp', 'D1', 'r-esp', '1'),
    wire('anode-esp', 'r-esp', '2', 'led-esp', 'anode'),
    wire('gnd-esp', 'led-esp', 'cathode', 'esp', 'GND'),
  ]);
}
const savedProgram = (componentId, source) => ({
  componentId, language: 'arduino-cpp', execution: 'unavailable', source,
});
const millisExample = readFileSync(new URL('../../examples/arduino/blink-without-delay.ino', import.meta.url), 'utf8');
async function freezeClock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}
async function assertSameNode(handle, selector) {
  assert.equal(await handle.evaluate((node, selector) =>
    node.isConnected && node === document.querySelector(selector), selector), true);
}

test('millis Blink controls the electrical LED, pauses, resumes and resets without blocking the editor', async (t) => {
  const document = firmwareFixture();
  document.programs = [savedProgram('uno', millisExample.replace('1000UL', '64UL'))];
  const page = await openFixture(harness.browser, t, document);
  await freezeClock(page);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-uno', false);
  await page.clock.runFor(64);
  await brightness(page, 'led-uno', true);
  assert.ok(Math.abs(Number(await part(page, 'led-uno').getAttribute('data-brightness')) - (5 - 2) / (330 + 40) / 0.02) < 1e-9);
  await tools(page, 'code');
  await page.getByTestId('board-code-editor').fill('// Edits apply only on the next start');
  await page.getByTestId('simulation-pause').click();
  await status(page, 'paused');
  await page.clock.runFor(1024);
  await brightness(page, 'led-uno', true);
  await page.getByTestId('simulation-start').click();
  await page.clock.runFor(64);
  await brightness(page, 'led-uno', false);
  await page.getByTestId('simulation-stop').click();
  await status(page, 'stopped');
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
});

test('a large delay-free program yields so React can pause and stop execution', { timeout: 15000 }, async (t) => {
  const document = firmwareFixture();
  document.programs = [savedProgram('uno', `unsigned long n=0;
    void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}
    void loop(){${'n+=1;'.repeat(400)}}`)];
  const page = await openFixture(harness.browser, t, document);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-uno', true);
  // Real browser timers and an animation frame must run alongside interpreter slices.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
  await page.getByTestId('simulation-pause').click({ timeout: 2000 });
  await status(page, 'paused');
  await page.getByTestId('simulation-stop').click({ timeout: 2000 });
  await status(page, 'stopped');
  await brightness(page, 'led-uno', false);
});

test('saved Blink runs from Start, advances the electrical LED, resumes without setup and stops', async (t) => {
  const document = firmwareFixture();
  const page = await openFixture(harness.browser, t, document);
  await tools(page, 'code');
  await panel(page, 'code').locator('[data-testid="code-board-tab"][data-board-id="uno"]').click();
  await panel(page, 'code').getByTestId('board-code-editor').fill(blink());
  const saved = await save(page);
  assert.equal(saved.programs.find((program) => program.componentId === 'uno').files.find((file) => file.name === 'main.ino').source, blink());
  // Reload proves Start reads the persisted document rather than a temporary editor buffer.
  await page.reload();
  await status(page, 'stopped');
  await freezeClock(page);
  await page.getByTestId('simulation-start').click();
  await status(page, 'running');
  await brightness(page, 'led-uno', true);
  assert.ok(Math.abs(Number(await part(page, 'led-uno').getAttribute('data-brightness')) - (5 - 2) / (330 + 40) / 0.02) < 1e-9);
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
  await page.clock.runFor(1000);
  await brightness(page, 'led-uno', false);
  await page.getByTestId('simulation-pause').click();
  await status(page, 'paused');
  await page.clock.runFor(5000);
  await brightness(page, 'led-uno', false);
  await page.getByTestId('simulation-start').click();
  await status(page, 'running');
  await brightness(page, 'led-uno', false);
  await page.clock.runFor(1000);
  await brightness(page, 'led-uno', true);
  await page.getByTestId('simulation-stop').click();
  await status(page, 'stopped');
  await brightness(page, 'led-uno', false);
  await page.clock.runFor(5000);
  await brightness(page, 'led-uno', false);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-uno', true);
  await page.getByTestId('simulation-stop').click();
  const after = await save(page);
  assert.deepEqual(after.programs, saved.programs);
  assert.deepEqual(after.components, saved.components);
  assert.deepEqual(after.wires, saved.wires);
  assert.equal(after.firmware, undefined);
});

test('Start matches programs by board ID and runs main.ino instead of the first or selected header', async (t) => {
  const document = firmwareFixture();
  document.programs = [
    savedProgram('esp', blink('D1', 250)),
    { ...savedProgram('uno', '#define NOT_EXECUTABLE 1'),
      files: [{ name: 'config.h', source: '#define NOT_EXECUTABLE 1' }, { name: 'main.ino', source: blink() }],
      activeFile: 'config.h' },
  ];
  const page = await openFixture(harness.browser, t, document);
  await freezeClock(page);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-uno', true);
  await brightness(page, 'led-esp', true);
  assert.ok(Math.abs(Number(await part(page, 'led-esp').getAttribute('data-brightness')) - (3.3 - 2) / (330 + 50) / 0.02) < 1e-9);
  assert.equal(await page.getByTestId('firmware-error').count(), 0);
  await page.clock.runFor(250);
  await brightness(page, 'led-uno', true);
  await brightness(page, 'led-esp', false);
  await page.clock.runFor(250);
  await brightness(page, 'led-esp', true);
  await page.clock.runFor(250);
  await brightness(page, 'led-esp', false);
  await page.clock.runFor(250);
  await brightness(page, 'led-uno', false);
  await brightness(page, 'led-esp', true);
});

for (const [invalidBoard, locale, errorText] of [
  ['uno', 'es', 'Código no admitido o incorrecto'],
  ['esp', 'en', 'Unsupported or malformed source'],
]) {
  test(`invalid ${invalidBoard} firmware reports its error in ${locale} while the other board runs`, async (t) => {
    const document = firmwareFixture();
    document.programs = [
      savedProgram('uno', invalidBoard === 'uno' ? 'void setup(){Serial.notSupported();}void loop(){}' : blink()),
      savedProgram('esp', invalidBoard === 'esp' ? 'void setup(){WiFi.begin();}void loop(){}' : blink('D1')),
    ];
    const page = await openFixture(harness.browser, t, document, { locale });
    await freezeClock(page);
    await page.getByTestId('simulation-start').click();
    await status(page, 'running');
    const error = page.getByTestId('firmware-error');
    assert.equal(await error.count(), 1);
    assert.equal(await error.getAttribute('data-component-id'), invalidBoard);
    assert.equal(await error.getAttribute('data-code'), 'unsupported-syntax');
    assert.ok((await error.textContent()).includes(errorText));
    await brightness(page, `led-${invalidBoard}`, false);
    const healthy = invalidBoard === 'uno' ? 'esp' : 'uno';
    await brightness(page, `led-${healthy}`, true);
    await page.clock.runFor(1000);
    await brightness(page, `led-${healthy}`, false);
    await page.getByTestId('simulation-stop').click();
    assert.equal(await page.getByTestId('firmware-error').count(), 0);
  });
}

test('a delayed runtime error releases only the failed board and appears in the console', async (t) => {
  const document = firmwareFixture();
  document.programs = [
    savedProgram('uno', 'void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}void loop(){delay(10);digitalWrite(12,HIGH);}'),
    savedProgram('esp', blink('D1', 50)),
  ];
  const page = await openFixture(harness.browser, t, document);
  await freezeClock(page);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-uno', true);
  await brightness(page, 'led-esp', true);
  await page.clock.runFor(10);
  await brightness(page, 'led-uno', false);
  const error = page.getByTestId('firmware-error');
  assert.equal(await error.getAttribute('data-component-id'), 'uno');
  assert.equal(await error.getAttribute('data-code'), 'pin-not-output');
  assert.match(await error.textContent(), /digitalWrite requires pinMode/);
  await brightness(page, 'led-esp', true);
  await page.clock.runFor(40);
  await brightness(page, 'led-esp', false);
});

test('unified tabs, keyboard resizing and collapse preserve circuit DOM identity, zoom and wires', async (t) => {
  const page = await openFixture(harness.browser, t, workspaceFixture());
  const stage = await page.getByTestId('workspace-stage').elementHandle();
  const source = await part(page, 'source').elementHandle();
  const physicalWire = await page.locator('[data-wire="supply"].circuit-wire').elementHandle();
  assert.ok(stage && source && physicalWire);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const transform = await page.locator('.workspace-svg > g').getAttribute('transform');
  const route = await page.locator('[data-wire="supply"] .wire-stroke').getAttribute('points');
  const componentsWidth = await page.getByTestId('sidebar-resizer').getAttribute('aria-valuenow');
  await page.getByTestId('tool-tab-components').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByTestId('tool-tab-code').getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByTestId('tool-tab-code').evaluate((node) => node === document.activeElement), true);
  const resizer = page.getByTestId('sidebar-resizer');
  await resizer.focus();
  const before = Number(await resizer.getAttribute('aria-valuenow'));
  await resizer.press('ArrowLeft');
  assert.equal(Number(await resizer.getAttribute('aria-valuenow')), before + 16);
  const divider = await resizer.boundingBox();
  assert.ok(divider);
  const resizeY = divider.y + divider.height / 4;
  await page.mouse.move(divider.x + divider.width / 2, resizeY);
  await page.mouse.down();
  await page.mouse.move(divider.x + divider.width / 2 - 40, resizeY, { steps: 6 });
  await page.mouse.up();
  assert.equal(Number(await resizer.getAttribute('aria-valuenow')), before + 56);
  await resizer.press('Home');
  assert.equal(await resizer.getAttribute('aria-valuenow'), await resizer.getAttribute('aria-valuemin'));
  await resizer.press('End');
  assert.equal(await resizer.getAttribute('aria-valuenow'), await resizer.getAttribute('aria-valuemax'));
  const codeWidth = await resizer.getAttribute('aria-valuenow');
  await tools(page, 'code');
  await page.getByTestId('tool-tab-code').press('Home');
  assert.equal(await page.getByTestId('tool-tab-components').getAttribute('aria-selected'), 'true');
  assert.equal(await resizer.getAttribute('aria-valuenow'), componentsWidth);
  await page.getByTestId('sidebar-toggle').click();
  assert.equal(await page.getByTestId('tool-sidebar').isVisible(), false);
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'sidebar-toggle');
  await tools(page, 'code');
  assert.equal(await resizer.getAttribute('aria-valuenow'), codeWidth);
  await panel(page, 'code').getByTestId('board-code-editor').press('Escape');
  assert.equal(await page.getByTestId('tool-sidebar').isVisible(), false);
  await tools(page, 'code');
  await assertSameNode(stage, '[data-testid="workspace-stage"]');
  await assertSameNode(source, '[data-reference="source"]');
  await assertSameNode(physicalWire, '[data-wire="supply"].circuit-wire');
  assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), transform);
  assert.equal(await page.locator('[data-wire="supply"] .wire-stroke').getAttribute('points'), route);
  assert.equal(await page.locator('.circuit-wire').count(), 3);
  const saved = await save(page);
  assert.deepEqual(saved.components, workspaceFixture().components);
  assert.deepEqual(saved.wires, workspaceFixture().wires);
  await page.reload();
  await status(page, 'stopped');
  assert.equal(await page.getByTestId('tool-tab-code').getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByTestId('sidebar-resizer').getAttribute('aria-valuenow'), codeWidth);
});

for (const width of [1440, 390]) {
  test(`sidebar edge toggle preserves its tab, width and editor and stays centered at ${width}px`, async (t) => {
    const page = await openFixture(harness.browser, t, workspaceFixture(), { width });
    await tools(page, 'code');
    const toggle = page.getByTestId('sidebar-toggle');
    const sidebar = page.getByTestId('tool-sidebar');
    if (!await sidebar.isVisible()) await toggle.click();
    const editor = panel(page, 'code').getByTestId('board-code-editor');
    await editor.fill('// Retained across sidebar collapse');
    const editorNode = await editor.elementHandle();
    assert.ok(editorNode);
    const openWidth = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
    const assertCentered = async (open) => {
      await page.waitForFunction((open) => {
        const button = document.querySelector('[data-testid="sidebar-toggle"]').getBoundingClientRect();
        const anchor = document.querySelector(open ? '#workspace-tools' : '.lab-layout').getBoundingClientRect();
        return Math.abs(button.y + button.height / 2 - anchor.y - anchor.height / 2) < 1;
      }, open);
      const button = await toggle.boundingBox();
      const anchor = await page.locator(open ? '#workspace-tools' : '.lab-layout').boundingBox();
      assert.ok(button && anchor);
      assert.ok(Math.abs(button.y + button.height / 2 - anchor.y - anchor.height / 2) < 1);
      assert.ok(button.x >= 0 && button.x + button.width <= page.viewportSize().width);
      assert.equal(await toggle.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit === node || node.contains(hit);
      }), true, 'Edge toggle remains clickable');
    };
    await assertCentered(true);
    const button = await toggle.boundingBox();
    const editorBounds = await editor.boundingBox();
    assert.ok(button && editorBounds);
    assert.ok(button.x + button.width <= editorBounds.x, 'Edge control does not cover the code editor');
    await toggle.click();
    assert.equal(await sidebar.isVisible(), false);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    const widths = await page.locator('.lab-layout').evaluate((layout) => ({
      layout: layout.getBoundingClientRect().width,
      circuit: layout.querySelector('.workspace-main').getBoundingClientRect().width,
    }));
    assert.ok(Math.abs(widths.layout - widths.circuit) < 1, 'Collapsed sidebar reserves no column');
    await assertCentered(false);
    await page.setViewportSize({ width: width === 1440 ? 1280 : 360, height: 800 });
    await assertCentered(false);
    await toggle.click();
    await assertCentered(true);
    await page.setViewportSize({ width, height: 1000 });
    await assertCentered(true);
    assert.equal(await page.getByTestId('tool-tab-code').getAttribute('aria-selected'), 'true');
    assert.equal(await sidebar.evaluate((node) => node.getBoundingClientRect().width), openWidth);
    assert.equal(await editor.inputValue(), '// Retained across sidebar collapse');
    await assertSameNode(editorNode, '#tool-panel-code [data-testid="board-code-editor"]');
    assert.equal(await sidebar.getByTestId('sidebar-toggle').count(), 0);
  });

  test(`source explorer toggle releases its full width and retains editor state across tools at ${width}px`, async (t) => {
    const document = workspaceFixture();
    document.programs = [{
      componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: '// main sketch',
      files: [{ name: 'main.ino', source: '// main sketch' }, { name: 'config.h', source: '#define LED_PIN 13' }],
      activeFile: 'config.h',
    }];
    const page = await openFixture(harness.browser, t, document, { width });
    const showCode = async () => {
      await tools(page, 'code');
      if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('sidebar-toggle').click();
    };
    await showCode();
    const code = panel(page, 'code');
    const toggle = code.getByTestId('code-file-explorer-toggle');
    const explorer = code.getByTestId('code-file-explorer');
    const editor = code.getByTestId('board-code-editor');
    const editorNode = await editor.elementHandle();
    assert.ok(editorNode);
    const assertFullWidth = async () => {
      const geometry = await code.locator('.code-files-body').evaluate((body) => {
        const explorer = body.querySelector('.code-file-explorer');
        const editor = body.querySelector('.code-document');
        return { body: body.getBoundingClientRect().width, editor: editor.getBoundingClientRect().width,
          explorer: explorer.getBoundingClientRect().width, display: getComputedStyle(explorer).display };
      });
      assert.equal(geometry.display, 'none');
      assert.equal(geometry.explorer, 0);
      assert.ok(Math.abs(geometry.body - geometry.editor) < 1, 'Closed explorer reserves no editor width');
    };
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await assertFullWidth();
    const closedWidth = await editor.evaluate((node) => node.getBoundingClientRect().width);
    await toggle.click();
    assert.equal(await explorer.isVisible(), true);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await editor.evaluate((node) => node.getBoundingClientRect().width) < closedWidth);
    await editor.fill('#define LED_PIN 7');
    for (const other of ['components', 'iot']) {
      await tools(page, other);
      await showCode();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await explorer.isVisible(), true);
    }
    await toggle.click();
    await assertFullWidth();
    for (const other of ['components', 'iot']) {
      await tools(page, other);
      await showCode();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await assertFullWidth();
    }
    assert.equal(await editor.inputValue(), '#define LED_PIN 7');
    assert.equal(await code.getByTestId('code-file-tab').filter({ hasText: 'config.h' }).getAttribute('aria-selected'), 'true');
    await assertSameNode(editorNode, '#tool-panel-code [data-testid="board-code-editor"]');
    await code.getByTestId('code-file-tab').filter({ hasText: 'main.ino' }).click();
    assert.equal(await editor.inputValue(), '// main sketch');
    await code.getByTestId('code-file-tab').filter({ hasText: 'config.h' }).click();
    assert.equal(await editor.inputValue(), '#define LED_PIN 7');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
}

test('code retains automatic/manual board context without Control IoT and independent saved source', async (t) => {
  const page = await openFixture(harness.browser, t, workspaceFixture());
  await tools(page, 'code');
  const code = panel(page, 'code');
  const editor = code.getByTestId('board-code-editor');
  await selectedCodeBoard(page, 'uno');
  assert.match(await codeBoard(page, 'uno').textContent(), /Arduino UNO #1 · uno/);
  await editor.fill('// UNO source');
  await select(page, 'esp');
  await closeInspector(page);
  await selectedCodeBoard(page, 'esp');
  assert.equal(await editor.inputValue(), '');
  await editor.fill('// ESP source');
  assert.equal(await page.getByTestId('tool-tab-iot').count(), 0);
  await codeBoard(page, 'uno').click();
  await select(page, 'r');
  await closeInspector(page);
  await selectedCodeBoard(page, 'uno');
  await tools(page, 'code');
  assert.equal(await editor.inputValue(), '// UNO source');
  const resistorTransform = await part(page, 'r').getAttribute('transform');
  await editor.press('End');
  await editor.pressSequentially('\nr');
  assert.equal(await part(page, 'r').getAttribute('transform'), resistorTransform, 'Editor keys cannot rotate the selected resistor');
  await codeBoard(page, 'esp').click();
  assert.equal(await editor.inputValue(), '// ESP source');
  await select(page, 'r');
  await closeInspector(page);
  await selectedCodeBoard(page, 'esp');
  const saved = await save(page);
  assert.equal(saved.programs.find((program) => program.componentId === 'uno').source, '// UNO source\nr');
  assert.equal(saved.programs.find((program) => program.componentId === 'esp').source, '// ESP source');
  assert.ok(saved.programs.every((program) => program.execution === 'unavailable'));
  await page.reload();
  await tools(page, 'code');
  await codeBoard(page, 'esp').click();
  assert.equal(await editor.inputValue(), '// ESP source');
  await codeBoard(page, 'uno').click();
  assert.equal(await editor.inputValue(), '// UNO source\nr');
});

test('tool switching and stored code edits retain running and paused electrical results', async (t) => {
  const page = await openFixture(harness.browser, t, workspaceFixture());
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led', true);
  const stage = await page.getByTestId('workspace-stage').elementHandle();
  const led = await part(page, 'led').elementHandle();
  assert.ok(stage && led);
  const currentBrightness = await part(page, 'led').getAttribute('data-brightness');
  const transform = await page.locator('.workspace-svg > g').getAttribute('transform');
  for (const tab of ['code', 'components', 'code']) {
    await tools(page, tab);
    await status(page, 'running');
    assert.equal(await part(page, 'led').getAttribute('data-brightness'), currentBrightness);
  }
  await panel(page, 'code').getByTestId('board-code-editor').fill('// Saved while running; not executed');
  await status(page, 'running');
  assert.equal(await part(page, 'led').getAttribute('data-brightness'), currentBrightness);
  await page.getByTestId('simulation-pause').click();
  await tools(page, 'iot');
  await tools(page, 'code');
  await panel(page, 'code').getByTestId('board-code-editor').fill('// Saved while paused; not executed');
  await status(page, 'paused');
  assert.equal(await part(page, 'led').getAttribute('data-brightness'), currentBrightness);
  assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), transform);
  await assertSameNode(stage, '[data-testid="workspace-stage"]');
  await assertSameNode(led, '[data-reference="led"]');
  const saved = await save(page);
  assert.equal(saved.programs.find((program) => program.componentId === 'uno').source, '// Saved while paused; not executed');
});

test('SVG layers keep breadboards below wires, parts above wires and diagnostic overlays last', async (t) => {
  const page = await openFixture(harness.browser, t, workspaceFixture({ reversed: true }));
  const layers = await page.locator('.workspace-svg > g > [data-layer]').evaluateAll((nodes) => nodes.map((node) => node.dataset.layer));
  assert.deepEqual(layers, ['background', 'boards', 'wires', 'components', 'overlays']);
  assert.equal(await part(page, 'uno').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'boards');
  assert.equal(await part(page, 'esp').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'boards');
  assert.equal(await part(page, 'bb').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'background');
  assert.equal(await part(page, 'led').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'components');
  assert.equal(await page.locator('[data-wire="supply"].circuit-wire').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'wires');
  await page.getByTestId('simulation-start').click();
  const diagnostic = page.locator('[data-code="reverse-polarity"]');
  await diagnostic.waitFor();
  assert.match(await diagnostic.locator('.diagnostic-guidance').textContent(), /Why this appears.*What to check/s);
  await diagnostic.getByTestId('diagnostic-navigate').click();
  await page.locator('[data-selection-for="led"].is-diagnostic').waitFor();
  assert.equal(await part(page, 'led').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('context-inspector').isVisible(), true);
  assert.equal(await page.locator('[data-selection-for="led"]').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'overlays');
  await brightness(page, 'led', false);
  await status(page, 'running');
});

for (const width of [1440, 390]) {
  for (const locale of ['en', 'es']) {
    test(`unified sidebar ${locale} at ${width}px exposes accessible tabs and preserves the desk`, async (t) => {
      const page = await openFixture(harness.browser, t, workspaceFixture(), { width, locale });
      const stage = await page.getByTestId('workspace-stage').elementHandle();
      assert.ok(stage);
      assert.equal(await page.getByTestId('tool-sidebar').getAttribute('aria-label'), locale === 'en' ? 'Workspace tools' : 'Herramientas de la mesa');
      for (const tab of ['components', 'code']) {
        await tools(page, tab);
        const control = page.getByTestId(`tool-tab-${tab}`);
        assert.equal(await control.getAttribute('role'), 'tab');
        assert.equal(await control.getAttribute('aria-controls'), `tool-panel-${tab}`);
        assert.equal(await control.getAttribute('tabindex'), '0');
        assert.ok((await control.textContent()).trim());
        assert.equal(await panel(page, tab).getAttribute('role'), 'tabpanel');
        await assertSameNode(stage, '[data-testid="workspace-stage"]');
      }
      const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(dimensions.page <= dimensions.viewport, 'Tools do not create horizontal overflow');
      if (width <= 760) {
        const assertUnobscuredMessages = async () => {
          assert.equal(await page.locator('.console-toggle').evaluate((button) => {
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit !== null && (hit === button || button.contains(hit));
          }), true, 'The mobile sheet must leave the Messages toggle clickable');
          assert.equal(await page.getByTestId('workspace-stage').evaluate((stage) => {
            const rect = stage.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + 50);
            return hit !== null && hit.closest('#workspace-tools') === null;
          }), true, 'A visible circuit strip remains above the mobile tools sheet');
        };
        await assertUnobscuredMessages();
        await page.getByTestId('sidebar-expand').click();
        assert.match(await page.getByTestId('tool-sidebar').getAttribute('class'), /is-expanded/);
        await assertUnobscuredMessages();
      }
      await page.getByTestId('sidebar-toggle').click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'sidebar-toggle');
      assert.equal(await page.getByTestId('sidebar-toggle').getAttribute('aria-expanded'), 'false');
      await assertSameNode(stage, '[data-testid="workspace-stage"]');
    });
  }
}

test('retired Control IoT is absent and independent ESP circuits stay inactive without firmware', async (t) => {
  const page = await openFixture(harness.browser, t, dualDeviceFixture());
  assert.equal(await page.getByTestId('tool-tab-iot').count(), 0);
  assert.equal(await panel(page, 'iot').count(), 0);
  await page.getByTestId('simulation-start').click();
  await brightness(page, 'led-one', false); await brightness(page, 'led-two', false);
  await page.getByTestId('simulation-stop').click();
  const saved = await save(page);
  assert.equal(saved.components.filter(component => component.kind === 'esp8266').length, 2);
});
