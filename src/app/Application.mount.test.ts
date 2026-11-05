// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { createAppStore } from './store';

let root: Root | undefined;
let application: ReturnType<typeof createAppStore> | undefined;
let container: HTMLDivElement;
let errors: unknown[];
beforeEach(() => {
  localStorage.clear();
  errors = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  }));
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  application?.persistor.pause();
  await application?.persistor.flush();
  container.remove();
  root = undefined;
  application = undefined;
  vi.unstubAllGlobals();
});
async function mount() {
  application = createAppStore(localStorage);
  const current = application;
  await new Promise<void>((resolve) => {
    if (current.persistor.getState().bootstrapped) return resolve();
    const unsubscribe = current.persistor.subscribe(() => {
      if (current.persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
  root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
  await act(async () => root?.render(createElement(Application, { application: current })));
  expect(errors).toEqual([]);
  expect(container.querySelector('[data-testid="workspace-stage"]')).not.toBeNull();
}
function languageSelector(): HTMLSelectElement {
  const control = container.querySelector('.locale-picker select');
  if (!(control instanceof HTMLSelectElement)) throw new Error('Language selector missing');
  return control;
}
describe('real application provider hierarchy', () => {
  it('mounts App with Redux, rehydration, locale and StrictMode providers', async () => {
    await mount();
    expect(document.documentElement.lang).toBe('es');
    expect(container.textContent).toContain('Componentes');
    expect(application?.store.getState().project._persist.rehydrated).toBe(true);
  });
  it('switches ES/EN and restores the preference after unmount/remount', async () => {
    await mount();
    const control = languageSelector();
    await act(async () => { control.value = 'en'; control.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('mesa.locale')).toBe('en');
    expect(container.textContent).toContain('Components');
    await act(async () => root?.unmount());
    application?.persistor.pause();
    await application?.persistor.flush();
    await mount();
    expect(document.documentElement.lang).toBe('en');
    expect(languageSelector().value).toBe('en');
    const restored = languageSelector();
    await act(async () => { restored.value = 'es'; restored.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('mesa.locale')).toBe('es');
    expect(errors).toEqual([]);
  });
  it('starts in an existing English preference on a fresh mount', async () => {
    localStorage.setItem('mesa.locale', 'en');
    await mount();
    expect(languageSelector().value).toBe('en');
    expect(container.textContent).toContain('Components');
  });
});
