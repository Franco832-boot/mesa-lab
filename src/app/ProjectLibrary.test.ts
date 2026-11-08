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
async function openProjects() {
  if (control('project-library').hidden) await click(byId('library-toggle'));
  expect(control('project-library').hidden).toBe(false);
}


describe('independent project library and existing right tools', () => {
  it('uses the split-panel toolbar button for right tools only, preserves tabs and starts on Components', async () => {
    const current = await mount();
    const stage = container.querySelector('[data-testid="workspace-stage"]');
    const original = serializeProject(current.store.getState().project.document);
    const toggle = control('tools-toggle');
    expect(toggle.hasAttribute('disabled')).toBe(false);
    expect(toggle.getAttribute('aria-controls')).toBe('workspace-tools');
    expect(toggle.getAttribute('aria-label')).toBe('Mostrar/Ocultar panel derecho');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(control('tool-tab-components').getAttribute('aria-selected')).toBe('true');
    await click(byId('tools-toggle'));
    expect(control('tool-sidebar').hidden).toBe(true);
    expect(control('project-library').hidden).toBe(false);
    expect(container.querySelector('#context-inspector')).toBeNull();
    await click(byId('tools-toggle')); await click(byId('tool-tab-code'));
    await click(byId('tools-toggle')); await click(byId('tools-toggle'));
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    expect(control('tool-sidebar').hidden).toBe(false);
    expect(container.querySelector('[data-testid="tool-tab-iot"]')).toBeNull();
    await click(byId('tools-toggle')); await click(byId('sidebar-toggle'));
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    await click(byId('tools-toggle'));
    await click(byId('library-toggle')); await click(byId('library-toggle'));
    expect(control('tool-sidebar').hidden).toBe(true);
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-testid="workspace-stage"]')).toBe(stage);
    expect(serializeProject(current.store.getState().project.document)).toBe(original);
    const preferences = localStorage.getItem('mesa.workspace.preferences.v1');
    await act(async () => root?.unmount()); current.persistor.pause(); await current.persistor.flush();
    await mount();
    expect(control('tool-sidebar').hidden).toBe(true);
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    expect(localStorage.getItem('mesa.workspace.preferences.v1')).toBe(preferences);
  });
  it.each([false, true])('keeps the Inspector independent from both right-panel toggles, mobile=%s', async (mobile) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && query === '(max-width: 760px)', media: query,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }));
    const current = await mount();
    const uno = container.querySelector('[data-reference="uno-reference"]');
    if (!(uno instanceof SVGElement)) throw new Error('Missing board');
    const select = async () => { await act(async () => uno.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); };
    await select();
    const inspector = element('#context-inspector');
    const original = serializeProject(current.store.getState().project.document);
    const closed = control('tool-sidebar').hidden;
    await click(byId('tools-toggle'));
    expect(control('tool-sidebar').hidden).toBe(!closed);
    expect(container.querySelector('#context-inspector')).toBe(inspector);
    await click(byId('sidebar-toggle'));
    expect(control('tool-sidebar').hidden).toBe(closed);
    expect(container.querySelector('#context-inspector')).toBe(inspector);
    await click(byId('inspector-close'));
    expect(container.querySelector('#context-inspector')).toBeNull();
    await click(byId('tools-toggle'));
    expect(container.querySelector('#context-inspector')).toBeNull();
    await select();
    expect(container.querySelector('#context-inspector')).not.toBeNull();
    expect(control('project-library').hidden).toBe(false);
    expect(serializeProject(current.store.getState().project.document)).toBe(original);
  });
  it('configures the PCF address through the existing inspector and exposes LCD results without an editable text field', async () => {
    const current = await mount();
    await openProjects(); await click(`${byId('example-lcd16-i2c')} button`);
    const selectPart = async (id: string) => {
      const part = container.querySelector(`[data-reference="${id}"]`);
      if (!(part instanceof SVGElement)) throw new Error('Missing circuit part');
      await act(async () => { part.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    };
    await selectPart('adapter');
    const label = [...container.querySelectorAll('label.property-field')].find((item) => item.textContent?.includes('Dirección I²C'));
    const address = label?.querySelector('select');
    if (!(address instanceof HTMLSelectElement)) throw new Error('Missing address inspector field');
    await act(async () => { address.value = '63'; address.dispatchEvent(new Event('change', { bubbles: true })); });
    const adapter = current.store.getState().project.document.components.find((part) => part.kind === 'pcf8574');
    expect(adapter?.properties.address).toBe(63);
    await selectPart('lcd');
    expect(container.textContent).toContain('16 × 2');
    expect(container.querySelector('[data-reference="lcd"] [data-lcd-row="0"]')?.getAttribute('aria-label')).toBe('');
    await click(byId('simulation-start'));
    expect(control('lcd-status').textContent).toContain('Alimentación válida');
    expect(container.querySelector('[data-reference="lcd"] [data-lcd-row="0"]')?.getAttribute('aria-label')).toBe(' '.repeat(16));
    const lcd = current.store.getState().project.document.components.find((part) => part.id === 'lcd');
    expect(lcd?.properties).toEqual({ controller: 'HD44780' });
    await act(async () => { await current.saveNow(); });
    expect(parseProject(serializeProject(current.store.getState().project.document)).components.find((part) => part.kind === 'pcf8574')?.properties.address).toBe(63);
  });
  it('opens Projects on first entry and keeps folder, X and right arrow independent without changing the circuit', async () => {
    const current = await mount();
    const stage = container.querySelector('[data-testid="workspace-stage"]');
    const before = serializeProject(current.store.getState().project.document);
    expect(control('project-library').hidden).toBe(false);
    expect(control('tool-sidebar').hidden).toBe(false);
    await click(byId('library-toggle'));
    expect(control('project-library').hidden).toBe(true); expect(control('tool-sidebar').hidden).toBe(false);
    await click(byId('sidebar-toggle'));
    expect(control('tool-sidebar').hidden).toBe(true); expect(control('project-library').hidden).toBe(true);
    await click(byId('library-toggle'));
    expect(control('project-library').hidden).toBe(false); expect(control('tool-sidebar').hidden).toBe(true);
    await click('#example-projects .tool-sidebar-heading button');
    expect(control('project-library').hidden).toBe(true); expect(control('tool-sidebar').hidden).toBe(true);
    expect(container.querySelector('[data-testid="workspace-stage"]')).toBe(stage);
    expect(serializeProject(current.store.getState().project.document)).toBe(before);
    const preferences = localStorage.getItem('mesa.workspace.preferences.v1');
    expect(preferences).toContain('"projectsOpen":false');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => root?.unmount()); current.persistor.pause(); await current.persistor.flush();
    await mount();
    expect(control('project-library').hidden).toBe(true); expect(control('tool-sidebar').hidden).toBe(true);
    expect(localStorage.getItem('mesa.workspace.preferences.v1')).toBe(preferences);
    expect(writes.mock.calls.filter(([key]) => key === 'mesa.workspace.preferences.v1')).toHaveLength(0);
    expect(container.querySelectorAll('aside#workspace-tools')).toHaveLength(1);
    expect(container.querySelectorAll('aside#example-projects')).toHaveLength(1);
  });
  it.each(['es', 'en'] as const)('opens the user guide in %s, closes it accessibly, and exposes no public roadmap', async (locale) => {
    localStorage.setItem('mesa.locale', locale);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 760px)', media: query,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }));
    const current = await mount(), before = serializeProject(current.store.getState().project.document);
    expect(container.textContent).not.toMatch(/roadmap|plan de desarrollo/i);
    const help = element('.help-button'); help.focus();
    await click('.help-button');
    const dialog = element('dialog[open]');
    expect(dialog.getAttribute('aria-label')).toBe(locale === 'es' ? 'Cómo usar Mesa Lab' : 'How to use Mesa Lab');
    expect(dialog.querySelectorAll('.help-sections section')).toHaveLength(10);
    expect(dialog.textContent).toContain('DHT11'); expect(dialog.textContent).toContain('PCF8574');
    expect(dialog.textContent).toContain('Serial.println()');
    expect(dialog.textContent).not.toMatch(/roadmap|plan de desarrollo|Monaco|MQTT/i);
    expect(dialog.querySelector('.help-gestures')?.textContent).not.toContain(locale === 'es' ? 'botón +' : '+ button');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); });
    expect(serializeProject(current.store.getState().project.document)).toBe(before);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(control('tool-sidebar').hidden).toBe(false);
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); });
    expect(container.querySelector('dialog[open]')).toBeNull(); expect(document.activeElement).toBe(help);
    await click('.help-button'); await click('dialog .dialog-done');
    expect(container.querySelector('dialog[open]')).toBeNull();
    await click('.help-button'); await click('dialog .dialog-heading button');
    expect(container.querySelector('dialog[open]')).toBeNull();
    expect(control('project-library').hidden).toBe(false); expect(control('tool-sidebar').hidden).toBe(false);
    expect(errors).toEqual([]);
  });
  it('removes only the unused toolbar mode and keeps selection tools, component add buttons and Shift selection', async () => {
    await mount();
    const toolbar = element('.editor-toolbar');
    expect(toolbar.querySelector('path[d="M12 5v14M5 12h14"]')).toBeNull();
    expect(control('add-resistor').querySelector('svg')).not.toBeNull();
    const toolButtons = [...toolbar.querySelectorAll('button')].filter((button) => /\([VHC]\)/.test(button.getAttribute('aria-label') ?? ''));
    expect(toolButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Seleccionar (V)', 'Desplazar mesa (H)', 'Conectar pines (C)']);
    const selectPart = async (id: string, shiftKey = false) => {
      const part = container.querySelector(`[data-reference="${id}"]`);
      if (!(part instanceof SVGElement)) throw new Error('Missing part');
      await act(async () => { part.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true })); });
      return part;
    };
    const uno = await selectPart('uno-reference');
    const esp = await selectPart('esp-reference', true);
    expect(uno.getAttribute('aria-pressed')).toBe('true'); expect(esp.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.next-card')).toBeNull();
    expect(container.textContent).not.toMatch(/roadmap|plan de desarrollo/i);
  });
  it('retains right tab selection and component search while opening/closing projects and switching ES/EN', async () => {
    await mount();
    const search = container.querySelector('.library-panel .search-field input');
    if (!(search instanceof HTMLInputElement)) throw new Error('Missing component search');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setValue?.call(search, 'led'); search.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byId('tool-tab-code'));
    await openProjects();
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
    expect(search.value).toBe('led');
    const language = container.querySelector('.locale-picker select');
    if (!(language instanceof HTMLSelectElement)) throw new Error('Missing locale control');
    await act(async () => { language.value = 'en'; language.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(control('library-toggle').getAttribute('title')).toBe('Show/Hide projects');
    expect(control('project-library').textContent).toContain('LED with a for loop');
    expect(control('project-library').textContent).toContain('Communication');
    expect(control('project-library').textContent).toContain('ESP8266 — LED control through a web server');
    expect(control('tool-tab-code').getAttribute('aria-selected')).toBe('true');
  });
  it.each(projectExamples)('loads $id as a fresh, stopped ordinary project with sketch and local backup', async (example) => {
    const current = await mount();
    const original = serializeProject(current.store.getState().project.document);
    await click(byId('simulation-start'));
    await openProjects();
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
    await openProjects();
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
    await openProjects();
    await click(`${byId('example-dht11')} button`);
    expect(current.store.getState().project.document).toBe(original);
    expect(control('simulation-status').getAttribute('data-status')).toBe('running');
    expect(container.textContent).toContain('No se pudo preservar');
    expect(errors).toEqual([]);
  });
});
