// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { createAppStore } from './store';
import { createEmptyProject, STORAGE_KEY } from '../model/project';
import { EXAMPLE_BACKUP_PREFIX } from '../features/examples/replacement';
import { nameChanged } from '../features/project/projectSlice';

let root: Root | undefined;
let application: ReturnType<typeof createAppStore> | undefined;
let container: HTMLDivElement;
let errors: unknown[];
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
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

describe('routing after Redux Persist rehydration', () => {
  it('opens a public deep link, preserves a legacy session, and retains edits on reload', async () => {
    const legacy = createEmptyProject('Legacy session');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    window.history.replaceState(null, '', '/esp8266-led-telegram');
    await mount();
    expect(application?.store.getState().project.document.components.some((component) => component.kind === 'esp8266')).toBe(true);
    expect(Object.keys(localStorage).filter((key) => key.startsWith(EXAMPLE_BACKUP_PREFIX))).toHaveLength(1);
    await act(async () => { application?.store.dispatch(nameChanged('Edited local template')); });
    const id = application?.store.getState().project.document.id;
    // Rehydrate the exact current document as a page reload would do.
    await act(async () => root?.unmount());
    await application?.saveNow();
    application?.persistor.pause();
    await mount();
    expect(application?.store.getState().project.document.id).toBe(id);
    expect(application?.store.getState().project.document.name).toBe('Edited local template');
    expect(Object.keys(localStorage).filter((key) => key.startsWith(EXAMPLE_BACKUP_PREFIX))).toHaveLength(1);
    expect(window.location.pathname).toBe('/esp8266-led-telegram');
  });
  it('creates /new once and reloads its canonical local document', async () => {
    window.history.replaceState(null, '', '/new');
    await mount();
    const next = application?.store.getState().project.document;
    expect(next?.components).toEqual([]);
    expect(window.location.pathname).toMatch(/^\/local\/[^/]+\/[^/]+$/);
    const path = window.location.pathname;
    await act(async () => root?.unmount());
    await application?.saveNow();
    application?.persistor.pause();
    await mount();
    expect(window.location.pathname).toBe(path);
    expect(application?.store.getState().project.document).toEqual(next);
  });
  it.each(['/unknown', '/local/private/missing-id'])('shows a recoverable error for %s without replacing the restored document', async (path) => {
    const previous = createEmptyProject('Private project');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(previous));
    window.history.replaceState(null, '', path);
    await mount();
    expect(container.querySelector('[data-testid="route-error"]')).not.toBeNull();
    expect(application?.store.getState().project.document).toEqual(previous);
    const home = container.querySelector('[data-testid="route-error"] a');
    if (!(home instanceof HTMLAnchorElement)) throw new Error('Missing recovery link');
    await act(async () => home.click());
    expect(window.location.pathname).toBe('/');
    expect(container.querySelector('[data-testid="route-error"]')).toBeNull();
  });
});
