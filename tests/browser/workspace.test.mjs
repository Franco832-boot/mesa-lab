import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { brightness, openFixture, part, select, startHarness, status } from './harness.mjs';
import { component, ledCircuit, project, wire } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const panel = (page, tab) => page.locator(`#tool-panel-${tab}`);
async function tools(page, tab) {
  if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('library-toggle').click();
  await page.getByTestId(`tool-tab-${tab}`).click();
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
async function freezeClock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}
async function assertSameNode(handle, selector) {
  assert.equal(await handle.evaluate((node, selector) =>
    node.isConnected && node === document.querySelector(selector), selector), true);
}

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
  await page.clock.runFor(500);
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
      savedProgram('uno', invalidBoard === 'uno' ? 'void setup(){Serial.begin(9600);}void loop(){}' : blink()),
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
  await tools(page, 'iot');
  await page.getByTestId('tool-tab-iot').press('Home');
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
      if (!await page.getByTestId('tool-sidebar').isVisible()) await page.getByTestId('library-toggle').click();
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

test('code and IoT share automatic/manual board context and independent saved source', async (t) => {
  const page = await openFixture(harness.browser, t, workspaceFixture());
  await tools(page, 'code');
  const code = panel(page, 'code');
  const editor = code.getByTestId('board-code-editor');
  assert.equal(await code.getByTestId('board-selector').inputValue(), 'uno');
  assert.match(await code.getByTestId('active-board-name').textContent(), /Arduino UNO #1 · uno/);
  await editor.fill('// UNO source');
  await select(page, 'esp');
  await closeInspector(page);
  assert.equal(await code.getByTestId('board-selector').inputValue(), 'esp');
  assert.equal(await editor.inputValue(), '');
  await editor.fill('// ESP source');
  await tools(page, 'iot');
  assert.equal(await panel(page, 'iot').getByTestId('board-selector').inputValue(), 'esp');
  await panel(page, 'iot').getByTestId('board-selector').selectOption('uno');
  await select(page, 'r');
  await closeInspector(page);
  assert.equal(await panel(page, 'iot').getByTestId('board-selector').inputValue(), 'uno');
  await tools(page, 'code');
  assert.equal(await editor.inputValue(), '// UNO source');
  const resistorTransform = await part(page, 'r').getAttribute('transform');
  await editor.press('End');
  await editor.pressSequentially('\nr');
  assert.equal(await part(page, 'r').getAttribute('transform'), resistorTransform, 'Editor keys cannot rotate the selected resistor');
  await code.getByTestId('board-selector').selectOption('esp');
  assert.equal(await editor.inputValue(), '// ESP source');
  await select(page, 'r');
  await closeInspector(page);
  assert.equal(await code.getByTestId('board-selector').inputValue(), 'esp', 'Selecting a passive component retains manual board context');
  const saved = await save(page);
  assert.equal(saved.programs.find((program) => program.componentId === 'uno').source, '// UNO source\nr');
  assert.equal(saved.programs.find((program) => program.componentId === 'esp').source, '// ESP source');
  assert.ok(saved.programs.every((program) => program.execution === 'unavailable'));
  await page.reload();
  await tools(page, 'code');
  await code.getByTestId('board-selector').selectOption('esp');
  assert.equal(await editor.inputValue(), '// ESP source');
  await code.getByTestId('board-selector').selectOption('uno');
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
  for (const tab of ['code', 'iot', 'components', 'code']) {
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
  assert.deepEqual(layers, ['background', 'wires', 'components', 'overlays']);
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
      for (const tab of ['components', 'code', 'iot']) {
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
      assert.equal(await page.getByTestId('library-toggle').getAttribute('aria-expanded'), 'false');
      await assertSameNode(stage, '[data-testid="workspace-stage"]');
    });
  }
}

test('explicit virtual HTTP routes drive only the addressed ESP electrical circuit and preserve per-device sessions', { timeout: 90000 }, async (t) => {
  const page = await openFixture(harness.browser, t, dualDeviceFixture());
  const realVirtualAddressRequests = [];
  page.on('request', (request) => {
    if (/^http:\/\/192\.0\.2\./.test(request.url())) realVirtualAddressRequests.push(request.url());
  });
  await tools(page, 'iot');
  const iot = panel(page, 'iot');
  const selector = iot.getByTestId('board-selector');
  assert.equal(await selector.inputValue(), 'uno');
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'unsupported');
  assert.equal(await iot.getByTestId('iot-connect').count(), 0, 'UNO has no virtual WiFi controls');
  await page.getByTestId('simulation-start').click();
  await selector.selectOption('esp-one');
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'unconfigured');
  assert.equal(await iot.getByTestId('iot-request-url').inputValue(), '');
  await iot.getByTestId('iot-install-example').click();
  assert.match(await iot.getByTestId('iot-route-list').textContent(), /GET \/led\/on.*D1.*HIGH/s);
  await iot.getByTestId('iot-connect').click();
  const firstIP = (await iot.getByTestId('iot-device-ip').textContent()).trim();
  assert.match(firstIP, /^192\.0\.2\.[1-9]\d{0,2}$/);
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'connected');
  assert.equal(await iot.getByTestId('iot-request-url').inputValue(), '', 'Connecting cannot silently issue or populate a request');
  await brightness(page, 'led-one', false);
  await brightness(page, 'led-two', false);
  await selector.selectOption('esp-two');
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'unconfigured');
  await iot.getByTestId('iot-install-example').click();
  await iot.getByTestId('iot-connect').click();
  const secondIP = (await iot.getByTestId('iot-device-ip').textContent()).trim();
  assert.notEqual(secondIP, firstIP);
  await iot.getByTestId('iot-request-method').selectOption('GET');
  await iot.getByTestId('iot-request-url').fill(`http://${firstIP}/led/on`);
  await iot.getByTestId('iot-send').click();
  assert.match(await iot.getByTestId('iot-response-status').textContent(), /\b409\b/);
  assert.equal(await iot.getByTestId('iot-response-error').getAttribute('data-error'), 'target-mismatch');
  await brightness(page, 'led-one', false);
  await brightness(page, 'led-two', false);
  await selector.selectOption('esp-one');
  assert.equal(await iot.getByTestId('iot-response-empty').count(), 1, 'Another device response does not leak into this device');
  await iot.getByTestId('iot-request-url').fill(`http://${firstIP}/led/on`);
  await iot.getByTestId('iot-send').click();
  assert.match(await iot.getByTestId('iot-response-status').textContent(), /\b200\b/);
  assert.equal((await iot.getByTestId('iot-response-body').textContent()).trim(), 'D1=HIGH');
  await brightness(page, 'led-one', true);
  await brightness(page, 'led-two', false);
  // The GPIO drive includes 50 ohm output resistance; HTTP enters the same electrical engine.
  const expectedBrightness = (3.3 - 2) / (330 + 50) / 0.02;
  assert.ok(Math.abs(Number(await part(page, 'led-one').getAttribute('data-brightness')) - expectedBrightness) < 1e-9);
  await tools(page, 'code');
  assert.equal(await panel(page, 'code').getByTestId('board-selector').inputValue(), 'esp-one');
  await panel(page, 'code').getByTestId('board-code-editor').fill('// Stored source does not execute or replace virtual routes');
  await tools(page, 'iot');
  assert.equal(await selector.inputValue(), 'esp-one');
  assert.equal((await iot.getByTestId('iot-device-ip').textContent()).trim(), firstIP);
  await brightness(page, 'led-one', true);
  await page.getByTestId('simulation-pause').click();
  await iot.getByTestId('iot-request-url').fill(`http://${firstIP}/led/off`);
  await iot.getByTestId('iot-send').click();
  assert.equal(await iot.getByTestId('iot-response-error').getAttribute('data-error'), 'not-running');
  await brightness(page, 'led-one', true);
  await page.getByTestId('simulation-start').click();
  await iot.getByTestId('iot-send').click();
  assert.match(await iot.getByTestId('iot-response-status').textContent(), /\b200\b/);
  await brightness(page, 'led-one', false);
  await selector.selectOption('esp-two');
  assert.equal((await iot.getByTestId('iot-device-ip').textContent()).trim(), secondIP);
  assert.equal(await iot.getByTestId('iot-response-error').getAttribute('data-error'), 'target-mismatch');
  await iot.getByTestId('iot-request-url').fill(`http://${secondIP}/led/on`);
  await iot.getByTestId('iot-send').click();
  await brightness(page, 'led-two', true);
  await brightness(page, 'led-one', false);
  await iot.getByTestId('iot-history').locator('summary').click();
  assert.equal(await iot.getByTestId('iot-history').locator('li').count(), 2);
  assert.deepEqual(realVirtualAddressRequests, [], 'Virtual HTTP must not call a real network address');
  await page.getByTestId('simulation-stop').click();
  await brightness(page, 'led-one', false);
  await brightness(page, 'led-two', false);
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'disconnected');
  assert.equal(await iot.getByTestId('iot-device-ip').count(), 0);
  const saved = await save(page);
  for (const id of ['esp-one', 'esp-two']) {
    const board = saved.components.find((component) => component.id === id);
    assert.deepEqual(board.properties.virtualNetwork.routes.map((route) => route.path), ['/led/on', '/led/off']);
    assert.ok(board.properties.virtualNetwork.routes.every((route) => route.gpio.pinId === 'D1'));
  }
  assert.equal(saved.programs.find((program) => program.componentId === 'esp-one').execution, 'unavailable');
  assert.equal(Object.hasOwn(saved, 'virtualNetwork'), false);
  await page.reload();
  await status(page, 'stopped');
  await tools(page, 'iot');
  await selector.selectOption('esp-one');
  assert.equal(await iot.getByTestId('iot-device-status').getAttribute('data-status'), 'disconnected');
  assert.equal(await iot.getByTestId('iot-response-empty').count(), 1);
  assert.equal(await iot.getByTestId('iot-route-list').locator('li').count(), 2);
  await brightness(page, 'led-one', false);
});
