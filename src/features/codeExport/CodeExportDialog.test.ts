// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeExportDialog } from './CodeExportDialog';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { createEmptyProject } from '../../model/project';
import { createComponent } from '../../model/components';
import { espWebExampleFiles } from '../../model/espWebExample';
let root: Root | undefined;
let host: HTMLDivElement;
const downloaded = vi.fn(), closed = vi.fn(), createUrl = vi.fn((_blob: Blob) => 'blob:export-test'), revoke = vi.fn();
beforeEach(() => {
  localStorage.clear(); downloaded.mockClear(); closed.mockClear(); createUrl.mockClear(); revoke.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const NativeUrl = URL;
  vi.stubGlobal('URL', class extends NativeUrl { static createObjectURL = createUrl; static revokeObjectURL = revoke; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } },
  });
  vi.useFakeTimers();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount()); vi.runOnlyPendingTimers(); vi.useRealTimers(); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
function control(id: string): HTMLElement {
  const node = host.querySelector(`[data-testid="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${id}`);
  return node;
}
describe('code export preflight dialog', () => {
  it.each(['es', 'en'] as const)('requires WiFi-secret acknowledgement in %s and exports only the chosen board', async locale => {
    localStorage.setItem('mesa.locale', locale);
    const project = createEmptyProject('Private project');
    project.components.push(createComponent('esp8266', { x: 0, y: 0 }, 'esp'), createComponent('arduino-uno', { x: 1, y: 0 }, 'uno'));
    const files = espWebExampleFiles();
    project.programs = [{ componentId: 'esp', source: files[0]?.source ?? '', files, activeFile: 'wifi.cpp', language: 'arduino-cpp', execution: 'unavailable' },
      { componentId: 'uno', source: 'void setup(){}void loop(){}', language: 'arduino-cpp', execution: 'unavailable' }];
    const before = JSON.stringify(project);
    await act(async () => root?.render(createElement(LocaleProvider, { children: createElement(CodeExportDialog, {
      project, initialBoardId: 'esp', onClose: closed, onDownloaded: downloaded,
    }) })));
    const button = control('code-export-download');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(host.textContent).toContain('wifi.cpp'); expect(host.textContent).not.toContain('carlos');
    await act(async () => button.click()); expect(createUrl).not.toHaveBeenCalled();
    await act(async () => control('code-export-consent').click()); expect(button.hasAttribute('disabled')).toBe(false);
    const select = control('code-export-board');
    if (!(select instanceof HTMLSelectElement)) throw new Error('Missing board selector');
    await act(async () => { select.value = 'uno'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('[data-testid="code-export-consent"]')).toBeNull();
    expect(host.textContent).not.toContain('wifi.cpp');
    expect(button.hasAttribute('disabled')).toBe(false);
    await act(async () => { select.value = 'esp'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(button.hasAttribute('disabled')).toBe(true);
    await act(async () => control('code-export-consent').click());
    await act(async () => button.click());
    expect(downloaded).toHaveBeenCalledOnce(); expect(createUrl).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    const blob: unknown = createUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(JSON.stringify(project)).toBe(before); expect(closed).not.toHaveBeenCalled();
    await act(async () => vi.runOnlyPendingTimers()); expect(revoke).toHaveBeenCalledWith('blob:export-test');
    expect(document.querySelector('a[download]')).toBeNull();
  });
  it('does not fabricate source for a board without a program', async () => {
    const project = createEmptyProject('No code');project.components.push(createComponent('arduino-uno', { x:0,y:0 },'uno'));
    await act(async () => root?.render(createElement(LocaleProvider, {children:createElement(CodeExportDialog,{project,initialBoardId:'uno',onClose:closed,onDownloaded:downloaded})})));
    expect(control('code-export-download').hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(createUrl).not.toHaveBeenCalled();
  });
});
