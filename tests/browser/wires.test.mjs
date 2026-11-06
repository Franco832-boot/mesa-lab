import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { brightness, openFixture, part, select, startHarness } from './harness.mjs';
import { component, ledCircuit } from './fixtures.mjs';

let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const stroke = (page) => page.locator('[data-wire="supply"].circuit-wire .wire-stroke');
const wire = (page) => page.locator('[data-wire="supply"].circuit-wire');
const controls = (page) => page.locator('[data-testid="wire-controls"][data-wire="supply"]');
async function route(page) {
  return (await stroke(page).getAttribute('points')).split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number); return { x, y };
  });
}
async function screen(page, point) {
  return page.locator('.workspace-svg > g').evaluate((element, point) => {
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('Missing SVG transform');
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
  }, point);
}
async function saved(page) {
  const toast = page.locator('.toast');
  if (await toast.isVisible()) await toast.locator('button').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Project saved in this browser.', { exact: true }).waitFor();
  return page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document));
}
async function closeInspector(page) {
  if (await page.getByTestId('inspector-close').isVisible()) await page.getByTestId('inspector-close').click();
}
async function blankClick(page) {
  const point = await page.getByTestId('workspace-stage').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.bottom - 80; y > bounds.top + 20; y -= 60) {
      for (let x = bounds.left + 30; x < bounds.right - 30; x += 80) {
        const target = document.elementFromPoint(x, y);
        if (target?.closest('.stage') && !target.closest('[data-wire],[data-reference],[data-waypoint],button')) return { x, y };
      }
    }
    throw new Error('No free canvas position');
  });
  await page.mouse.click(point.x, point.y);
}
async function segment(page) {
  const points = await route(page);
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 35) continue;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, position = await screen(page, midpoint);
    const hittable = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-wire]')?.getAttribute('data-wire') === 'supply', position);
    if (hittable) return { a, b, midpoint, position, index };
  }
  throw new Error('No exposed wire segment');
}

for (const zoom of [0.7, 1.5]) {
  test(`automatic corners select without writes, follow the pointer at zoom ${zoom}, persist and undo`, { timeout: 60000 }, async (t) => {
    const document = ledCircuit();
    document.viewport = { offset: { x: 35, y: 40 }, zoom };
    const page = await openFixture(harness.browser, t, document);
    const before = await saved(page), originalRoute = await route(page);
    assert.equal(await page.locator('[data-waypoint]').count(), 0);
    const click = await segment(page);
    await page.mouse.click(click.position.x, click.position.y);
    assert.equal(await wire(page).getAttribute('aria-pressed'), 'true');
    assert.equal(await controls(page).locator('[data-waypoint]').count(), originalRoute.length - 2);
    assert.deepEqual((await saved(page)).wires, before.wires, 'Selection cannot materialize automatic corners');
    await closeInspector(page);
    const corner = controls(page).locator('[data-waypoint="1"]');
    const a = originalRoute[1], b = { x: a.x + 45, y: a.y + 35 };
    const start = await screen(page, a), end = await screen(page, b);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    assert.ok(Math.abs(Number(await corner.getAttribute('cx')) - b.x) < 0.1);
    assert.ok(Math.abs(Number(await corner.getAttribute('cy')) - b.y) < 0.1);
    const live = await corner.boundingBox();
    assert.ok(live && Math.abs(live.x + live.width / 2 - end.x) < 1 && Math.abs(live.y + live.height / 2 - end.y) < 1);
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('persist:mesa.project')).document).wires[0].waypoints), [], 'Preview must not persist during a gesture');
    await page.mouse.up();
    const changed = await saved(page), edited = changed.wires.find((item) => item.id === 'supply');
    assert.ok(edited.waypoints.some((point) => Math.abs(point.x - b.x) < 0.1 && Math.abs(point.y - b.y) < 0.1));
    assert.deepEqual(edited.from, before.wires[0].from); assert.deepEqual(edited.to, before.wires[0].to);
    const changedRoute = await route(page);
    assert.deepEqual(changedRoute[0], originalRoute[0]); assert.deepEqual(changedRoute.at(-1), originalRoute.at(-1));
    await page.getByTestId('workspace-stage').focus(); await page.keyboard.press('Control+z');
    assert.deepEqual((await saved(page)).wires, before.wires);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual((await saved(page)).wires, changed.wires);
    await blankClick(page);
    assert.equal(await page.locator('[data-waypoint]').count(), 0);
    assert.equal(await wire(page).getAttribute('aria-pressed'), 'false');
    await page.reload();
    assert.deepEqual(await route(page), changedRoute);
    assert.deepEqual((await saved(page)).wires, changed.wires);
    await page.getByTestId('simulation-start').click(); await brightness(page, 'led', true);
    assert.ok(Math.abs(Number(await part(page, 'led').getAttribute('data-brightness')) - (3 / 330) / 0.02) < 1e-9);
  });
}

test('segments move orthogonally; double-click and keyboard delete edit only intermediate points', { timeout: 60000 }, async (t) => {
  const page = await openFixture(harness.browser, t, ledCircuit());
  const original = await route(page), a = await segment(page);
  await page.mouse.click(a.position.x, a.position.y); await closeInspector(page);
  const chosen = await segment(page), vertical = chosen.a.x === chosen.b.x;
  const target = await screen(page, { x: chosen.midpoint.x + (vertical ? 35 : 0), y: chosen.midpoint.y + (vertical ? 0 : 35) });
  await page.mouse.move(chosen.position.x, chosen.position.y); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up();
  const moved = await route(page);
  assert.notDeepEqual(moved, original); assert.deepEqual(moved[0], original[0]); assert.deepEqual(moved.at(-1), original.at(-1));
  for (let i = 1; i < moved.length; i++) assert.ok(moved[i].x === moved[i - 1].x || moved[i].y === moved[i - 1].y);
  await closeInspector(page);
  const chosenInsert = await segment(page);
  // Avoid the midpoint handle: insert one third of the way along this exposed segment.
  const inserted = { x: (chosenInsert.a.x * 2 + chosenInsert.b.x) / 3, y: (chosenInsert.a.y * 2 + chosenInsert.b.y) / 3 };
  const position = await screen(page, inserted);
  await page.mouse.dblclick(position.x, position.y);
  const point = controls(page).locator('[data-waypoint]').filter({ has: undefined });
  const index = await point.evaluateAll((nodes, inserted) => nodes.findIndex((node) => Math.abs(Number(node.getAttribute('cx')) - inserted.x) < 1 && Math.abs(Number(node.getAttribute('cy')) - inserted.y) < 1), inserted);
  assert.ok(index >= 0, 'Inserted point must be visible');
  await point.nth(index).focus(); await page.keyboard.press('Delete');
  assert.equal(await wire(page).count(), 1, 'Delete on a control must not delete the wire');
  await wire(page).focus(); await wire(page).press('Enter');
  const count = (await saved(page)).wires[0].waypoints.length;
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  assert.equal((await saved(page)).wires[0].waypoints.length, count + 1);
  const transform = await part(page, 'r').getAttribute('transform');
  await closeInspector(page); await select(page, 'r'); await part(page, 'r').press('ArrowRight');
  assert.notEqual(await part(page, 'r').getAttribute('transform'), transform);
  assert.equal(await page.locator('[data-waypoint]').count(), 0, 'Component selection hides wire controls');
  await mkdir('test-results/browser', { recursive: true });
  await wire(page).focus(); await wire(page).press('Enter'); await closeInspector(page);
  await page.screenshot({ path: 'test-results/browser/wire-controls.png', animations: 'disabled' });
});

test('compact inspectors, accessible component titles and board/wire layers remain usable', { timeout: 60000 }, async (t) => {
  const document = ledCircuit();
  document.components.push(component('arduino-uno', 'uno', 70, 370, { logicVoltage: 5 }), component('esp8266', 'esp', 450, 370, { logicVoltage: 3.3 }));
  const page = await openFixture(harness.browser, t, document);
  assert.equal(await page.locator('.reference-name,.reference-detail').count(), 0);
  assert.match(await part(page, 'led').locator(':scope > title').textContent(), /LED/);
  assert.equal(await part(page, 'uno').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'boards');
  assert.equal(await part(page, 'esp').evaluate((node) => node.closest('[data-layer]').dataset.layer), 'boards');
  await select(page, 'led');
  await page.waitForFunction(() => document.querySelector('#context-inspector').getBoundingClientRect().height < 400);
  assert.equal(await page.getByTestId('inspector-more').getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', { name: 'Green', exact: true }).click();
  await mkdir('test-results/browser', { recursive: true });
  await page.screenshot({ path: 'test-results/browser/compact-led.png', animations: 'disabled' });
  await page.getByTestId('inspector-more').click();
  assert.equal(await page.getByTestId('terminal-select').isVisible(), true);
  await select(page, 'uno');
  await page.waitForFunction(() => document.querySelector('#context-inspector').getBoundingClientRect().height < 400);
  await page.screenshot({ path: 'test-results/browser/compact-board.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Pinout', exact: true }).click();
  assert.ok(await page.locator('.pinout-content tr').count() > 10);
});
