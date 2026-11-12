import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { createComponent } from '../../model/components';
import { projectReducer } from '../project/projectSlice';
import { initialSimulation } from '../simulation/runtime';
import type { SimulationController } from '../simulation/useSimulation';
import { ContextualInspector } from './ContextualInspector';
import { Inspector } from './Inspector';

const noop = () => undefined;
const simulation: SimulationController = {
  ...initialSimulation(), start: noop, pause: noop, stop: noop, reset: noop,
  requestFirmwareHttp: () => ({ status: 503, contentType: 'text/plain', body: '503' }), clearSerial: () => undefined, sendFirmwareChat: () => false, runFirmware: noop, stopFirmware: noop, connectDevice: noop, disconnectDevice: noop, requestHttp: noop, setGpio: noop, setButton: noop, setDht11: noop, setPotentiometer: noop,
};
afterEach(() => vi.unstubAllGlobals());
const setLocale = (locale: string) => vi.stubGlobal('localStorage', { getItem: () => locale });

describe('contextual settings surfaces', () => {
  it('starts with a right-hand library after the main canvas and no permanent inspector', () => {
    vi.stubGlobal('window', { innerWidth: 1440, matchMedia: () => ({ matches: false }) });
    setLocale('en');
    const store = configureStore({ reducer: { project: projectReducer } });
    const before = store.getState();
    const markup = renderToStaticMarkup(createElement(Provider, { store, children:
      createElement(LocaleProvider, { children: createElement(App, { saveNow: async () => true }) }),
    }));
    expect(markup.indexOf('data-testid="component-library"')).toBeGreaterThan(markup.indexOf('data-testid="workspace-stage"'));
    expect(markup).toContain('data-testid="library-toggle"');
    expect(markup).toContain('aria-controls="workspace-tools"');
    expect(markup).not.toContain('data-testid="context-inspector"');
    expect(markup).not.toContain('class="inspector-panel panel"');
    expect(markup).not.toContain('data-testid="code-editor-pane"');
    expect(markup.indexOf('data-testid="code-workspace"')).toBeGreaterThan(markup.indexOf('data-testid="tool-sidebar"'));
    expect(store.getState()).toBe(before);
  });
  it.each([
    { locale: 'en', title: 'Selected circuit settings', collapse: 'Collapse inspector' },
    { locale: 'es', title: 'Ajustes del circuito seleccionado', collapse: 'Plegar inspector' },
  ])('retains editable controls and accessible collapse/close actions in $locale', ({ locale, title, collapse }) => {
    setLocale(locale);
    const component = createComponent('resistor', { x: 200, y: 220 }, 'r');
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children:
      createElement(ContextualInspector, {
        components: [component], wires: [], viewport: { zoom: 1, offset: { x: 0, y: 0 } },
        componentId: 'r', wireId: null, stageRef: { current: null }, onClose: noop, onSheetDockChange: noop,
        collapsed: false, onToggleCollapse: noop,
        children: (headerActions, close) => createElement(Inspector, {
          component, kind: 'resistor', simulation, locked: false, selectedCount: 1,
          headerActions, onClose: close, onUpdate: noop,
          onRotate: noop, onDuplicate: noop, onRemove: noop, onStartConnection: noop,
        }),
      }),
    }));
    expect(markup).toContain(`aria-label="${title}"`);
    expect(markup).toContain('class="inspector-overlay"');
    expect(markup).toContain(`aria-label="${collapse}"`);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('d="m6 9 6 6 6-6"');
    expect(markup).toContain('aria-controls="context-inspector-body"');
    expect(markup).toContain('data-testid="inspector-close"');
    expect(markup).toContain('type="number"');
    expect(markup).toContain('data-testid="terminal-select"');
    expect(markup).not.toContain('aria-modal="true"');
  });
});
