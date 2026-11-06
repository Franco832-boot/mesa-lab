import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { openFixture, part, select, startHarness, status } from './harness.mjs';
import { component, project, wire } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

// Independent BB830/axial footprint geometry, in world units (4 units/mm).
const PITCH = 10.16;
const RESISTOR_BODY = { x: 12.6, y: 4.8 };
const RESISTOR_LEAD = { x: -7.72, y: 4.8 };
function holePoint(hole) {
  const row = 'abcdefghij'.indexOf(hole[0]);
  const column = Number(hole.slice(1)) - 1;
  assert.ok(row >= 0 && column >= 0);
  return {
    x: 15.24 + column * PITCH,
    y: 46.65472 + row * PITCH + (row >= 5 ? 2 * PITCH : 0),
  };
}
async function screenPoint(locator, point) {
  return locator.evaluate((element, point) => {
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('SVG screen transform unavailable');
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, point);
}
async function beginInsertion(page, id, hole) {
  const resistor = part(page, id);
  const grip = await screenPoint(resistor, RESISTOR_BODY);
  const lead = await screenPoint(resistor, RESISTOR_LEAD);
  const destination = await screenPoint(part(page, 'bb'), holePoint(hole));
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(destination.x + grip.x - lead.x, destination.y + grip.y - lead.y, { steps: 8 });
}
async function dragBetween(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
async function save(page) {
  const oldToast = page.locator('.toast');
  if (await oldToast.isVisible()) await oldToast.locator('button').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}
const byId = (document, id) => document.components.find((item) => item.id === id);
const attachedHoles = (document, id) => (byId(document, id).attachments ?? []).map((lead) => lead.holeId).sort();
function boardFixture({ powered = false, occupied = false, rotated = false } = {}) {
  const bb = component('breadboard', 'bb', rotated ? 450 : 50, rotated ? 60 : 320, { columns: 63 });
  const r = component('resistor', 'r', 150, 180, { resistance: 330 });
  if (rotated) { bb.rotation = 90; r.rotation = 90; }
  const components = [bb, r];
  const wires = [];
  if (powered) {
    components.unshift(component('power-supply', 'source', 400, 35, { voltage: 5 }));
    wires.push(wire('positive', 'source', 'positive', 'bb', 'd8'));
    wires.push(wire('negative', 'source', 'negative', 'bb', 'd12'));
  }
  if (occupied) {
    const anchor = holePoint('a8');
    components.push({
      ...component('resistor', 'occupied', bb.position.x + anchor.x - RESISTOR_LEAD.x,
        bb.position.y + anchor.y - RESISTOR_LEAD.y, { resistance: 1000 }),
      attachments: [
        { pinId: '1', breadboardId: 'bb', holeId: 'a8' },
        { pinId: '2', breadboardId: 'bb', holeId: 'a12' },
      ],
    });
    components.push({ ...component('resistor', 'misaligned', 350, 180, { resistance: 330 }), rotation: 45 });
  }
  return project(components, wires);
}
function potentiometerFixture({ ratio = 0.5, mobile = false } = {}) {
  return project([
    component('power-supply', 'source', 25, 40, { voltage: 5 }),
    component('potentiometer', 'pot', mobile ? 100 : 500, mobile ? 180 : 130,
      { resistance: 10000, ratio }),
  ], [
    wire('positive', 'source', 'positive', 'pot', '1'),
    wire('negative', 'source', 'negative', 'pot', '3'),
  ]);
}
async function knobPoint(page, angle) {
  const radians = angle * Math.PI / 180;
  return screenPoint(page.getByTestId('pot-knob'), {
    x: Math.sin(radians) * 11, y: -Math.cos(radians) * 11,
  });
}
async function rotateKnob(page, from, to) {
  const start = await knobPoint(page, from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 36; step++) {
    const point = await knobPoint(page, from + (to - from) * step / 36);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
}
async function ratio(page, percent) {
  await page.waitForFunction((percent) =>
    document.querySelector('[data-testid="pot-knob"]')?.getAttribute('aria-valuenow') === String(percent),
  percent);
  assert.equal((await page.getByTestId('pot-position').textContent()).trim(), `${percent}%`);
}

test('drag insertion joins real holes electrically, persists, detaches/reinserts and follows its board', { timeout: 90000 }, async (t) => {
  const page = await openFixture(harness.browser, t, boardFixture({ powered: true }));
  await beginInsertion(page, 'r', 'a8');
  await page.locator('[data-testid="insertion-hole"][data-board="bb"][data-hole="a8"]').waitFor();
  assert.equal(await page.getByTestId('insertion-hole').count(), 2);
  await page.locator('[data-testid="insertion-hole"][data-hole="a12"]').waitFor();
  await page.mouse.up();
  let document = await save(page);
  assert.deepEqual(attachedHoles(document, 'r'), ['a12', 'a8']);
  assert.equal(byId(document, 'r').attachments.length, 2);
  assert.equal(document.wires.length, 2, 'Only supply-to-breadboard wires are needed');
  await select(page, 'r');
  await page.getByTestId('simulation-start').click();
  // Five volts across 330 ohm: 5/330 = 0.0151515... A, displayed to four significant digits.
  assert.match(await page.getByTestId('electrical-values').textContent(), /0\.01515 A/);
  await page.getByTestId('simulation-stop').click();
  await page.reload();
  await status(page, 'stopped');
  document = await save(page);
  assert.deepEqual(attachedHoles(document, 'r'), ['a12', 'a8']);
  const root = page.locator('.workspace-svg > g');
  await dragBetween(page, await screenPoint(part(page, 'r'), RESISTOR_BODY),
    await screenPoint(root, { x: 92.6, y: 184.8 }));
  document = await save(page);
  assert.deepEqual(attachedHoles(document, 'r'), []);
  await beginInsertion(page, 'r', 'a18');
  await page.mouse.up();
  document = await save(page);
  assert.deepEqual(attachedHoles(document, 'r'), ['a18', 'a22']);
  const oldBoard = byId(document, 'bb');
  const oldResistor = byId(document, 'r');
  const boardGrip = await screenPoint(part(page, 'bb'), { x: 5, y: 110 });
  const boardTarget = await screenPoint(root, {
    x: oldBoard.position.x + 5 + 35, y: oldBoard.position.y + 110 + 20,
  });
  await dragBetween(page, boardGrip, boardTarget);
  document = await save(page);
  assert.ok(Math.abs(byId(document, 'r').position.x - oldResistor.position.x - 35) < 1e-6);
  assert.ok(Math.abs(byId(document, 'r').position.y - oldResistor.position.y - 20) < 1e-6);
  assert.deepEqual(attachedHoles(document, 'r'), ['a18', 'a22']);
  await select(page, 'bb');
  await page.keyboard.press('r');
  document = await save(page);
  assert.equal(byId(document, 'bb').rotation, 90);
  assert.equal(byId(document, 'r').rotation, 90);
  assert.deepEqual(attachedHoles(document, 'r'), ['a18', 'a22']);
});

test('native library drag/drop inserts the new resistor with one undoable addition', async (t) => {
  const page = await openFixture(harness.browser, t, boardFixture({ powered: true }));
  const stage = page.getByTestId('workspace-stage');
  const hole = await screenPoint(part(page, 'bb'), holePoint('a8'));
  const localBody = await screenPoint(page.locator('.workspace-svg > g'), { x: 20.32, y: 0 });
  const origin = await screenPoint(page.locator('.workspace-svg > g'), { x: 0, y: 0 });
  const bounds = await stage.boundingBox();
  assert.ok(bounds);
  await page.getByTestId('add-resistor').dragTo(stage, { targetPosition: {
    x: hole.x + localBody.x - origin.x - bounds.x,
    y: hole.y + localBody.y - origin.y - bounds.y,
  } });
  const document = await save(page);
  const inserted = document.components.find((item) => item.kind === 'resistor' && item.id !== 'r');
  assert.ok(inserted, 'The library drop added a new component');
  assert.deepEqual(inserted.attachments.map((lead) => lead.holeId), ['a8', 'a12']);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  assert.equal(await part(page, inserted.id).count(), 0);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  assert.equal(await part(page, inserted.id).count(), 1);
});

test('occupied holes and a misaligned rigid footprint reject the release without changing the document', async (t) => {
  const page = await openFixture(harness.browser, t, boardFixture({ occupied: true }));
  for (const id of ['r', 'misaligned']) {
    const original = await part(page, id).getAttribute('transform');
    await beginInsertion(page, id, id === 'r' ? 'a8' : 'a20');
    await part(page, id).locator('.invalid-insertion').waitFor();
    assert.equal(await page.getByTestId('insertion-hole').count(), 0);
    await page.mouse.up();
    assert.equal(await part(page, id).getAttribute('transform'), original);
    const document = await save(page);
    assert.deepEqual(attachedHoles(document, id), []);
    assert.deepEqual(attachedHoles(document, 'occupied'), ['a12', 'a8']);
  }
});

test('zoom/pan and rotated board/component transforms preserve exact insertion and mounted rotation', async (t) => {
  const page = await openFixture(harness.browser, t, boardFixture({ rotated: true }));
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const stage = page.getByTestId('workspace-stage');
  await stage.focus();
  await stage.press('h');
  const from = await screenPoint(page.locator('.workspace-svg > g'), { x: 250, y: 100 });
  await dragBetween(page, from, { x: from.x + 25, y: from.y + 15 });
  await stage.press('v');
  await beginInsertion(page, 'r', 'c8');
  await page.locator('[data-testid="insertion-hole"][data-hole="c12"]').waitFor();
  await page.mouse.up();
  let document = await save(page);
  assert.deepEqual(attachedHoles(document, 'r'), ['c12', 'c8']);
  await select(page, 'r');
  await page.keyboard.press('r');
  document = await save(page);
  assert.equal(byId(document, 'r').rotation, 180);
  assert.deepEqual(attachedHoles(document, 'r'), ['a10', 'e10']);
});

test('direct knob gesture updates percent/drawing/inspector, commits one undo step and preserves total resistance', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, potentiometerFixture());
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const stage = page.getByTestId('workspace-stage');
  await stage.focus();
  await stage.press('h');
  const bounds = await stage.boundingBox();
  assert.ok(bounds);
  await dragBetween(page, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    { x: bounds.x + bounds.width / 2 + 35, y: bounds.y + bounds.height / 2 + 20 });
  await stage.press('v');
  await select(page, 'pot');
  await page.keyboard.press('r');
  const knob = page.getByTestId('pot-knob');
  const shape = part(page, 'pot').getByTestId('pot-indicator');
  const bodyTransform = await part(page, 'pot').getAttribute('transform');
  const viewTransform = await page.locator('.workspace-svg > g').getAttribute('transform');
  await knob.press('Home');
  await ratio(page, 0);
  assert.match(await shape.getAttribute('transform'), /rotate\(-135 /);
  await rotateKnob(page, -135, 145); // Move slightly past the mechanical stop to clamp exactly to 100%.
  await ratio(page, 100);
  assert.match(await shape.getAttribute('transform'), /rotate\(135 /);
  assert.equal(await page.getByRole('spinbutton', { name: 'Position (0–1)', exact: true }).inputValue(), '1');
  const saved = await save(page);
  assert.deepEqual(byId(saved, 'pot').properties, { resistance: 10000, ratio: 1 });
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await ratio(page, 0);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  await ratio(page, 100);
  await knob.press('ArrowLeft');
  await ratio(page, 99);
  await knob.press('Shift+ArrowLeft');
  await ratio(page, 89);
  await knob.press('Home');
  await knob.press('ArrowRight');
  await ratio(page, 1);
  await knob.press('End');
  await ratio(page, 100);
  await knob.press('Home');
  const center = await screenPoint(knob, { x: 0, y: 0 });
  const above = await screenPoint(knob, { x: 0, y: -85 });
  await dragBetween(page, center, above);
  await ratio(page, 100);
  await knob.press('r');
  await knob.press('Delete');
  assert.equal(await part(page, 'pot').getAttribute('transform'), bodyTransform);
  assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), viewTransform);
  assert.equal(await page.getByRole('spinbutton', { name: 'Resistance (Ω)', exact: true }).inputValue(), '10000');
});

test('running knob reevaluates a three-terminal divider without persisting runtime changes', async (t) => {
  const page = await openFixture(harness.browser, t, potentiometerFixture({ ratio: 0 }));
  await select(page, 'pot');
  await page.getByTestId('terminal-select').selectOption('wiper');
  await page.getByTestId('simulation-start').click();
  const voltage = page.getByTestId('selected-pin-voltage');
  assert.match(await voltage.textContent(), /Pin voltage: 5 V/);
  await rotateKnob(page, -135, 0);
  await ratio(page, 50);
  assert.match(await voltage.textContent(), /Pin voltage: 2\.5 V/);
  await page.getByTestId('pot-knob').press('End');
  await ratio(page, 100);
  assert.match(await voltage.textContent(), /Pin voltage: 0 V/);
  const saved = await save(page);
  assert.deepEqual(byId(saved, 'pot').properties, { resistance: 10000, ratio: 0 });
  await page.getByTestId('simulation-pause').click();
  assert.equal(await page.getByTestId('pot-knob').getAttribute('aria-disabled'), 'true');
  await page.getByTestId('simulation-stop').click();
  await ratio(page, 0);
});

test('native touch rotation changes the mobile knob without moving the part or canvas', async (t) => {
  const page = await openFixture(harness.browser, t, potentiometerFixture({ ratio: 0, mobile: true }), { width: 390 });
  const partBefore = await part(page, 'pot').getAttribute('transform');
  const viewportBefore = await page.locator('.workspace-svg > g').getAttribute('transform');
  const client = await page.context().newCDPSession(page);
  let touching = false;
  try {
    const start = await knobPoint(page, -135);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    touching = true;
    for (let step = 1; step <= 24; step++) {
      const point = await knobPoint(page, -135 + 280 * step / 24);
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touching = false;
    await ratio(page, 100);
    assert.equal(await part(page, 'pot').getAttribute('transform'), partBefore);
    assert.equal(await page.locator('.workspace-svg > g').getAttribute('transform'), viewportBefore);
  } finally {
    if (touching) await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await client.detach();
  }
});
