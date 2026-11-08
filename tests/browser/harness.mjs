import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const baseURL = process.env.MESA_BASE_URL ?? 'http://127.0.0.1:4173';
export async function startHarness() {
  let server;
  let browser;
  let output = '';
  let exited;
  const stopServer = async () => {
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    await new Promise((resolve) => {
      const force = setTimeout(() => server.kill('SIGKILL'), 2000);
      force.unref();
      server.once('close', () => { clearTimeout(force); resolve(); });
      server.kill('SIGTERM');
    });
  };
  try {
    if (!process.env.MESA_BASE_URL) {
      server = spawn(process.execPath, [
        'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort',
      ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
      server.stdout.on('data', (chunk) => { output += String(chunk); });
      server.stderr.on('data', (chunk) => { output += String(chunk); });
      server.once('close', (code) => { exited = code ?? 'signal'; });
      server.once('error', (error) => { output += error.message; exited = 'spawn-error'; });
    }
    let available = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (exited !== undefined) throw new Error(`Vite exited (${exited}). ${output || 'No process output captured; check child-process execution and socket permissions.'}`);
      try {
        const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { available = true; break; }
      } catch { /* Retry only until the bounded startup deadline. */ }
      await delay(100);
    }
    if (!available) throw new Error(`Application unavailable at ${baseURL}. ${output}`);
    const moduleName = process.env.MESA_PLAYWRIGHT_MODULE ?? 'playwright';
    let playwright;
    try { playwright = await import(moduleName); }
    catch (error) {
      throw new Error(`Cannot import Playwright (${moduleName}). See docs/BROWSER_TESTING.md.`, { cause: error });
    }
    browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.MESA_BROWSER_EXECUTABLE
        ? { executablePath: process.env.MESA_BROWSER_EXECUTABLE }
        : {}),
    });
    return {
      browser,
      async close() { try { await browser.close(); } finally { await stopServer(); } },
    };
  } catch (error) {
    await browser?.close();
    await stopServer();
    throw new Error(`Browser validation could not start; no browser check passed. ${error.message}`, { cause: error });
  }
}
export async function openFixture(browser, t, document, {
  locale = 'en', width = 1440, height = 1000,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1,
    reducedMotion: 'reduce', locale: locale === 'es' ? 'es-AR' : 'en-US',
    ...(width <= 760 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'Uncaught browser errors'); });
  await page.addInitScript(({ document, locale }) => {
    if (window !== window.top) return; // Project fixtures belong only to the app, never sandbox frames.
    // Seed only public storage; never access Redux internals or inject engine results.
    // Preserve subsequent saves when the test reloads this same tab.
    if (sessionStorage.getItem('mesa.browser.seeded') !== '1') {
      localStorage.clear();
      localStorage.setItem('mesa.locale', locale);
      localStorage.setItem('mesa.project.v1', JSON.stringify(document));
      sessionStorage.setItem('mesa.browser.seeded', '1');
    }
  }, { document, locale });
  await page.goto(baseURL);
  await page.getByTestId('simulation-status').waitFor();
  assert.equal(await page.getByTestId('simulation-status').getAttribute('data-status'), 'stopped');
  return page;
}
export const part = (page, id) => page.locator(`[data-reference="${id}"]`);
export async function select(page, id) {
  const target = part(page, id);
  await target.focus();
  await target.press('Enter');
  assert.equal(await target.getAttribute('aria-pressed'), 'true');
}
export async function brightness(page, id, illuminated) {
  await page.waitForFunction(({ id, illuminated }) => {
    const value = Number(document.querySelector(`[data-reference="${id}"]`)?.getAttribute('data-brightness'));
    return illuminated ? value > 0 : value === 0;
  }, { id, illuminated });
}
export async function status(page, expected) {
  await page.waitForFunction((expected) =>
    document.querySelector('[data-testid="simulation-status"]')?.getAttribute('data-status') === expected,
  expected);
}
export async function approvedScreenshot(page, name) {
  const actual = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true, scale: 'css' });
  const candidate = resolve('test-results/browser', `${name}.candidate.png`);
  const baseline = resolve('tests/browser/baselines', `${name}.png`);
  let expected;
  try { expected = await readFile(baseline); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(resolve('test-results/browser'), { recursive: true });
    await writeFile(candidate, actual);
    assert.fail(`No reviewed baseline: ${baseline}. Candidate saved to ${candidate}; review it before explicitly creating a baseline.`);
  }
  if (!actual.equals(expected)) {
    await mkdir(resolve('test-results/browser'), { recursive: true });
    await writeFile(candidate, actual);
    assert.fail(`Screenshot differs from reviewed baseline ${baseline}; inspect ${candidate}.`);
  }
}
