import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { openFixture, startHarness } from './harness.mjs';
import { project } from './fixtures.mjs';

// Chromium runs the actual login UI; fictional HTTP responses do not verify the live backend.
let harness;
before(async () => { harness = await startHarness(); }, { timeout: 30000 });
after(async () => { await harness?.close(); });

const labels = {
  es: {
    login: 'Ingresar', register: 'Registrarme', loading: 'Cargando…', cancel: 'Cancelar',
    title: 'El servidor puede tardar en responder',
    body: 'Utilizamos un servidor gratuito que puede entrar en reposo por inactividad. El primer inicio de sesión podría demorar hasta que vuelva a estar activo. Si ocurre un error, esperá unos segundos y volvé a intentarlo.',
  },
  en: {
    login: 'Sign in', register: 'Sign up', loading: 'Loading…', cancel: 'Cancel',
    title: 'The server may take a while to respond',
    body: 'We use a free server that may go to sleep when inactive. Your first sign-in may take a while as it wakes up. If an error occurs, wait a few seconds and try again.',
  },
};
async function openForm(page, text) {
  await page.locator('.account-trigger').click();
  await page.getByRole('menuitem', { name: text, exact: true }).click();
  return page.getByRole('dialog', { name: text, exact: true });
}

for (const locale of ['es', 'en']) for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 1440]) {
  test(`login notice remains readable: ${locale}, ${colorScheme}, ${width}px`, { timeout: 30000 }, async t => {
    const page = await openFixture(harness.browser, t, project(), { locale, width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const text = labels[locale];
    const dialog = await openForm(page, text.login);
    const notice = dialog.getByRole('complementary', { name: text.title, exact: true });
    await notice.waitFor({ state: 'visible' });
    assert.equal(await notice.locator('p').textContent(), text.body);
    assert.equal(await notice.locator('svg[aria-hidden=true]').count(), 1);
    assert.equal(await dialog.getByRole('alert').count(), 0);
    const layout = await notice.evaluate(node => {
      const box = node.getBoundingClientRect();
      const submit = node.closest('form').querySelector('[type=submit]').getBoundingClientRect();
      const dialog = node.closest('dialog');
      const style = getComputedStyle(node);
      const paragraph = node.querySelector('p').getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, top: box.top, submitBottom: submit.bottom,
        paragraphRight: paragraph.right, width: innerWidth, height: innerHeight,
        overflow: dialog.scrollWidth > dialog.clientWidth, foreground: style.color, background: style.backgroundColor };
    });
    assert.ok(layout.top >= layout.submitBottom, 'Notice is below the submit button');
    assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.bottom <= layout.height, 'Notice fits the viewport');
    assert.ok(layout.paragraphRight <= layout.right && !layout.overflow, 'Text wraps without horizontal overflow');
    // WCAG contrast calculation against the actual rendered solid colors.
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const fg = luminance(layout.foreground), bg = luminance(layout.background);
    assert.ok((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) >= 4.5, 'Readable text contrast in either theme');
    if (width === 390) {
      await mkdir('test-results/browser', { recursive: true });
      await dialog.screenshot({ path: `test-results/browser/login-notice-${locale}-${colorScheme}.png` });
    }
    await dialog.getByRole('button', { name: text.cancel, exact: true }).click();
    const registration = await openForm(page, text.register);
    assert.equal(await registration.locator('.account-server-notice').count(), 0, 'Notice applies only to sign-in');
  });
}

for (const locale of ['es', 'en']) {
  test(`pending login blocks duplicates and supports manual recovery: ${locale}`, { timeout: 30000 }, async t => {
    const page = await openFixture(harness.browser, t, project(), { locale, width: 390, height: 844 });
    const text = labels[locale];
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'login@example.test', createdAt: '2026-11-18T10:00:00Z' };
    const password = 'Fictional-browser-password-123';
    let attempts = 0;
    let release = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    t.after(() => release());
    await page.route('https://losprofesparavosback.onrender.com/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/auth/login') {
        attempts++;
        assert.equal(request.method(), 'POST');
        assert.deepEqual(request.postDataJSON(), { email: user.email, password });
        if (attempts === 1) {
          await gate;
          return route.fulfill({ status: 503, json: { message: 'Fictional unavailable server' } });
        }
        return route.fulfill({ json: { accessToken: 'fictional-login-token', tokenType: 'Bearer', expiresIn: 900, user } });
      }
      assert.equal(request.headers().authorization, 'Bearer fictional-login-token');
      assert.ok(path === '/auth/me' || path === '/projects');
      return route.fulfill({ json: path === '/auth/me' ? user : [] });
    });
    const dialog = await openForm(page, text.login);
    await dialog.locator('[name=email]').fill(user.email);
    await dialog.locator('[name=password]').fill(password);
    const started = page.waitForRequest(request => new URL(request.url()).pathname === '/auth/login');
    await dialog.getByRole('button', { name: text.login, exact: true }).click();
    await started;
    const loading = dialog.getByRole('button', { name: text.loading, exact: true });
    assert.equal(await loading.isDisabled(), true);
    assert.equal(await dialog.locator('form').getAttribute('aria-busy'), 'true');
    assert.equal(await dialog.locator('[name=email]').isDisabled(), true);
    assert.equal(await dialog.locator('[name=password]').isDisabled(), true);
    assert.equal(await dialog.locator('.account-server-notice').isVisible(), true);
    await dialog.locator('form').evaluate(form => {
      for (let i = 0; i < 3; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(attempts, 1);
    release();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByRole('button', { name: text.login, exact: true }).isEnabled(), true);
    assert.equal(await dialog.locator('.account-server-notice').isVisible(), true);
    await page.clock.install();
    await page.clock.runFor(60000);
    assert.equal(attempts, 1, 'No automatic login retry after an error');
    await dialog.locator('[name=password]').fill(password);
    await dialog.getByRole('button', { name: text.login, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(attempts, 2);
    await page.locator('.account-trigger').click();
    assert.equal(await page.locator('.account-email').textContent(), user.email);
  });
}
