import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { openFixture, startHarness } from './harness.mjs';
import { project } from './fixtures.mjs';

// Real Chromium/application execution; all API requests intercepted with fictional data.
// This suite never writes to Render or Neon.
let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'browser@example.test', createdAt: '2026-11-18T10:00:00Z' };
const remoteId = '33333333-3333-4333-8333-333333333333';
async function api(page, existing = false) {
  const state = { writes: [], failure: null, receipts: new Map(), remote: existing ? {
    id: remoteId, userId: user.id, version: 1, name: 'Existing cloud project',
    data: { ...project(), name: 'Existing cloud project' }, createdAt: user.createdAt, updatedAt: user.createdAt,
  } : null };
  await page.route('https://losprofesparavosback.onrender.com/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const respond = (body, status = 200) => route.fulfill({ status, json: body,
      headers: { 'Access-Control-Allow-Origin': '*' } });
    if (path === '/auth/login') return respond({ accessToken: 'fictional-browser-token', tokenType: 'Bearer', expiresIn: 900, user });
    assert.equal(request.headers().authorization, 'Bearer fictional-browser-token');
    if (path === '/auth/me') return respond(user);
    if (method === 'GET') {
      assert.equal(request.headers()['idempotency-key'], undefined);
      assert.equal(request.headers()['if-match'], undefined);
      return respond(path === '/projects' ? state.remote ? [state.remote] : [] : state.remote);
    }
    assert.ok(method === 'POST' || method === 'PATCH');
    const key = request.headers()['idempotency-key'];
    const body = request.postDataJSON(); state.writes.push({ method, key, body });
    if (state.failure === 'network') return route.abort('internetdisconnected');
    if (state.failure) return respond({ statusCode: state.failure, message: 'Fictional error' }, state.failure);
    if (state.receipts.has(key)) return respond(state.receipts.get(key), method === 'POST' ? 201 : 200);
    if (method === 'PATCH') {
      assert.equal(path, `/projects/${remoteId}`);
      assert.equal(body.version, state.remote.version);
    }
    state.remote = { ...body, id: remoteId, userId: user.id, version: method === 'POST' ? 1 : state.remote.version + 1,
      createdAt: user.createdAt, updatedAt: user.createdAt };
    state.receipts.set(key, state.remote);
    return respond(state.remote, method === 'POST' ? 201 : 200);
  });
  return state;
}
async function login(page, locale = 'en') {
  const text = locale === 'es' ? 'Ingresar' : 'Sign in';
  await page.getByTestId('account-controls').getByRole('button', { name: text, exact: true }).click();
  await page.getByRole('menuitem', { name: text, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name=email]').fill(user.email);
  await dialog.locator('[name=password]').fill('Fictional-browser-password-123');
  await dialog.getByRole('button', { name: text, exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function saved(page, locale = 'en') {
  await page.waitForFunction(text => document.getElementById('project-save-status')?.textContent?.includes(text),
    locale === 'es' ? 'Guardado en la nube' : 'Saved to the cloud');
}
async function openRemote(page, locale = 'en') {
  const text = locale === 'es' ? 'Abrir proyecto' : 'Open project';
  await page.locator('.cloud-open-button').click();
  await page.getByRole('dialog').getByRole('button', { name: text, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

for (const [locale, width] of [['en', 1440], ['es', 390]]) {
  test(`one Save action, local drafts, debounced PATCH, immediate Save and remote reopen: ${locale}, ${width}`, { timeout: 60000 }, async t => {
    const page = await openFixture(harness.browser, t, project(), { locale, width });
    const state = await api(page);
    await page.clock.install();
    const name = page.getByRole('textbox', { name: locale === 'es' ? 'Nombre del proyecto' : 'Project name', exact: true });
    const save = page.getByRole('button', { name: locale === 'es' ? 'Guardar' : 'Save', exact: true });
    assert.equal(await page.locator('.save-button').count(), 1);
    await name.fill('Guest draft'); await page.clock.runFor(3000);
    assert.equal(state.writes.length, 0);
    await login(page, locale); await name.fill('Signed-in local draft'); await page.clock.runFor(3000);
    assert.equal(state.writes.length, 0);
    await save.click(); await saved(page, locale);
    assert.equal(state.writes[0].method, 'POST'); assert.equal(state.remote.version, 1);
    await page.getByTestId('add-resistor').click();
    await page.clock.runFor(1000); await name.fill('Rapid edit');
    await page.clock.runFor(1900); assert.equal(state.writes.length, 1);
    await name.fill('Final edit'); await page.clock.runFor(1999); assert.equal(state.writes.length, 1);
    await page.clock.runFor(1); await saved(page, locale);
    assert.equal(state.writes.length, 2); assert.equal(state.writes[1].method, 'PATCH');
    assert.equal(state.remote.data.components.length, 1); assert.equal(state.remote.name, 'Final edit');
    await name.fill('Immediate save'); await save.click(); await saved(page, locale);
    assert.equal(state.writes.length, 3); assert.equal(state.remote.version, 3);
    await save.click(); assert.equal(state.writes.length, 3);
    await page.reload(); await page.getByTestId('simulation-status').waitFor();
    assert.equal(await name.inputValue(), 'Immediate save');
    await login(page, locale);
    if (await page.getByTestId('project-library').isVisible() === false) await page.getByTestId('mobile-panel-projects').click();
    await openRemote(page, locale);
    const stored = await page.evaluate(() => {
      const envelope = JSON.parse(localStorage.getItem('persist:mesa.project'));
      return { document: JSON.parse(envelope.document), links: JSON.parse(envelope.cloudLinks) };
    });
    assert.equal(stored.document.id, remoteId);
    assert.ok(stored.links.some(link => link.remote?.id === remoteId && link.remote.version === 3));
    assert.equal(state.writes.filter(write => write.method === 'POST').length, 1);
  });
}

for (const failure of [503, 409]) {
  test(`cloud HTTP ${failure} preserves the draft and ${failure === 409 ? 'blocks conflicting writes' : 'retries the same receipt'}`, { timeout: 60000 }, async t => {
    const page = await openFixture(harness.browser, t, project());
    const state = await api(page, true); await page.clock.install();
    await login(page); await openRemote(page);
    state.failure = failure;
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('My preserved draft');
    await page.clock.runFor(2000);
    await page.getByRole('alert').filter({ hasText: `HTTP ${failure}` }).waitFor();
    const receipt = state.writes[0];
    await page.clock.runFor(10000); assert.equal(state.writes.length, 1);
    state.failure = null;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    if (failure === 503) {
      await saved(page); assert.deepEqual(state.writes[1], receipt); assert.equal(state.remote.name, 'My preserved draft');
    } else {
      assert.equal(state.writes.length, 1); assert.equal(state.remote.version, 1);
      assert.equal(await page.getByRole('textbox', { name: 'Project name', exact: true }).inputValue(), 'My preserved draft');
      assert.match(await page.locator('#project-save-status').textContent(), /Version conflict/);
    }
  });
}
