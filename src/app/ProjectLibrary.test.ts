// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { createAppStore } from './store';
import { nameChanged } from '../features/project/projectSlice';
import { EXAMPLE_BACKUP_PREFIX } from '../features/examples/replacement';
import { parseProject, serializeProject } from '../model/project';
import { projectExamples } from '../model/exampleProjects';

let root: Root | undefined;
let app: ReturnType<typeof createAppStore> | undefined;
let container: HTMLDivElement;
let errors: unknown[];
beforeEach(() => {
  localStorage.clear(); errors = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }));
  // jsdom has no native dialog implementation; browser tests cover its focus behavior.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  container = document.createElement('div'); document.body.append(container);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  app?.persistor.pause(); await app?.persistor.flush();
  container.remove(); app = undefined; root = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
async function mount() {
  const current = createAppStore(localStorage); app = current;
  await new Promise<void>((resolve) => {
    if (current.persistor.getState().bootstrapped) return resolve();
    const unsubscribe = current.persistor.subscribe(() => {
      if (current.persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
  root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
  await act(async () => root?.render(createElement(Application, { application: current })));
  await act(async () => { await current.saveNow(); });
  expect(errors).toEqual([]);
  return current;
}
function element(selector: string): HTMLElement {
  const item = container.querySelector(selector);
  if (!(item instanceof HTMLElement)) throw new Error(`Missing control: ${selector}`);
  return item;
}
function control(id: string) { return element(`[data-testid="${id}"]`); }
async function click(selector: string) { await act(async () => element(selector).click()); }
const byId = (id: string) => `[data-testid="${id}"]`;
const backups = () => Object.keys(localStorage).filter((key) => key.startsWith(EXAMPLE_BACKUP_PREFIX));

describe('independent project library and existing right tools', () => {
  it('routes the top-left button exclusively to projects and the purple arrow exclusively to right tools', async () => {
    const current = await mount();
    const stage = container.querySelector('[data-testid="workspace-stage"]');
    const before = serializeProject(current.store.getState().project.document);
    expect(control('project-library').hidden).toBe(true);
    expect(control('tool-sidebar').hidden).toBe(false);
    expect(control('library-toggle').getAttribute('aria-label')).toBe('Mostrar/Ocultar proyectos');
    await click(byId('library-toggle'));
    expect(control('project-library').hidden).toBe(false); expect(control('tool-sidebar').hidden).toBe(false);
    await click(byId('sidebar-toggle'));
    expect(control('tool-sidebar').hidden).toBe(true); expect(control('project-library').hidden).toBe(false);
    await click(byId('library-toggle'));
    expect(control('project-library').hidden).toBe(true); expect(control('tool-sidebar').hidden).toBe(true);
    await click(byId('sidebar-toggle'));
    expect(control('tool-sidebar').hidden).toBe(false); expect(control('project-library').hidden).toBe(true);
    expect(container.querySelector('[data-testid="workspace-stage"]')).toBe(stage);
    expect(serializeProject(current.store.getState().project.document)).toBe(before);
    expect(container.querySelectorAll('aside#workspace-tools')).toHaveLength(1);
    expect(container.querySelectorAll('aside#example-projects')).toHaveLength(1);
  });
  it('retains right tab selection and component search while opening/closing projects and switching ES/EN', async () => {
    await mount();
    const search = container.querySelector('.library-panel .search-field input');
    if (!(search instanceof HTMLInputElement)) throw new Error('Missing component search');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setValue?.call(search, 'led'); search.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byId('tool-tab-code'));
    await click(byId('library-toggle'));
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    expect(search.value).toBe('led');
    const language = container.querySelector('.locale-picker select');
    if (!(language instanceof HTMLSelectElement)) throw new Error('Missing locale control');
    await act(async () => { language.value = 'en'; language.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(control('library-toggle').getAttribute('title')).toBe('Show/Hide projects');
    expect(control('project-library').textContent).toContain('LED with a for loop');
    expect(control('project-library').textContent).not.toContain('Communication');
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
  });
  it.each(projectExamples)('loads $id as a fresh, stopped ordinary project with sketch and local backup', async (example) => {
    const current = await mount();
    const original = serializeProject(current.store.getState().project.document);
    await click(byId('simulation-start'));
    await click(byId('library-toggle'));
    await click(`${byId(`example-${example.id}`)} button`);
    const loaded = current.store.getState().project.document;
    expect(loaded.id).not.toBe(parseProject(original).id);
    expect(loaded.programs).toHaveLength(1);
    expect(new Set(loaded.components.map((part) => part.kind))).toEqual(new Set(example.components));
    expect(control('simulation-status').getAttribute('data-status')).toBe('stopped');
    expect(current.store.getState().project.history.past).toHaveLength(0);
    expect(backups()).toHaveLength(1);
    expect(localStorage.getItem(backups()[0] ?? '')).toBe(original);
    await act(async () => { await current.saveNow(); });
    expect(current.store.getState().project.saveStatus).toBe('saved');
    expect(errors).toEqual([]);
  });
  it('requires confirmation for unsaved changes, preserves them on cancel, and snapshots the latest document on confirm', async () => {
    const current = await mount(); current.persistor.pause();
    await act(async () => { current.store.dispatch(nameChanged('Unsaved lesson')); });
    const original = current.store.getState().project.document;
    await click(byId('library-toggle'));
    await click(`${byId('example-led-for')} button`);
    expect(container.querySelector('dialog[open]')).not.toBeNull();
    expect(current.store.getState().project.document).toBe(original);
    expect(backups()).toHaveLength(0);
    await click('dialog .secondary-button');
    expect(current.store.getState().project.document).toBe(original);
    await click(`${byId('example-led-for')} button`);
    await click(byId('confirm-example'));
    expect(current.store.getState().project.document.programs[0]?.source).toContain('for (int i = 0; i < 3; i++)');
    expect(parseProject(localStorage.getItem(backups()[0] ?? '') ?? '').name).toBe('Unsaved lesson');
    expect(container.querySelector('dialog[open]')).toBeNull();
  });
  it('leaves the circuit and running simulation intact if its preservation fails', async () => {
    const current = await mount();
    await click(byId('simulation-start'));
    const original = current.store.getState().project.document;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await click(byId('library-toggle'));
    await click(`${byId('example-dht11')} button`);
    expect(current.store.getState().project.document).toBe(original);
    expect(control('simulation-status').getAttribute('data-status')).toBe('running');
    expect(container.textContent).toContain('No se pudo preservar');
    expect(errors).toEqual([]);
  });
});
