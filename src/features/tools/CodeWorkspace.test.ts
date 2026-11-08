import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import type { BoardProgram } from '../../model/types';
import type { ContextBoard } from './boardContext';
import { BoardHeader } from './BoardHeader';
import { applyProgramFileAction } from '../../model/programFiles';
import { CodePane } from './CodePane';
import { CodeWorkspace } from './CodeWorkspace';

const uno: ContextBoard = { id: 'uno', kind: 'arduino-uno', position: { x: 0, y: 0 }, rotation: 0, properties: { logicVoltage: 5 } };
const esp: ContextBoard = { id: 'esp', kind: 'esp8266', position: { x: 10, y: 0 }, rotation: 0, properties: { logicVoltage: 3.3 } };
const program = (componentId: string, source: string): BoardProgram => ({ componentId, source, language: 'arduino-cpp', execution: 'unavailable' });
const render = (activeBoard: ContextBoard | undefined, saved: BoardProgram | undefined) => {
  const onChange = vi.fn();
  const markup = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(CodeWorkspace, {
    boards: [uno, esp], activeBoard, program: saved, onSelectBoard: () => undefined, onChange, onFileAction: () => true,
  }) }));
  return { markup, onChange };
};

describe('board code workspace', () => {
  it('starts with the source explorer hidden and exposes an accessible toggle beside the file tabs', () => {
    const { markup } = render(uno, program('uno', '// existing source'));
    const toggle = markup.match(/<button\b[^>]*data-testid="code-file-explorer-toggle"[^>]*>/)?.[0];
    const explorer = markup.match(/<aside\b[^>]*data-testid="code-file-explorer"[^>]*>/)?.[0];
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('aria-controls="code-file-explorer-uno"');
    expect(explorer).toContain('id="code-file-explorer-uno"');
    expect(explorer).toContain('hidden=""');
    expect(markup).toContain('data-testid="code-file-tab"');
    expect(markup).toContain('// existing source');
  });
  it('renders saved source for the active board as an editable controlled input', () => {
    const { markup, onChange } = render(esp, program('esp', 'digitalWrite(D1, HIGH);'));
    expect(markup).toContain('data-testid="board-code-editor"');
    expect(markup).toContain('digitalWrite(D1, HIGH);');
    expect(markup).toContain('maxLength="500000"');
    expect(markup).not.toContain('disabled=""');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('switches independent saved programs without showing another board’s source', () => {
    const first = render(uno, program('uno', '// UNO saved source')).markup;
    const second = render(esp, program('esp', '// ESP saved source')).markup;
    const restored = render(uno, program('uno', '// UNO saved source')).markup;
    expect(first).toContain('// UNO saved source');
    expect(second).toContain('// ESP saved source');
    expect(second).not.toContain('// UNO saved source');
    expect(restored).toContain('// UNO saved source');
    expect(render(esp, program('uno', '// wrong board')).markup).not.toContain('// wrong board');
  });
  it('does not expose a source editor when no active board exists', () => {
    const { markup } = render(undefined, undefined);
    expect(markup).not.toContain('<textarea');
    expect(markup).toContain('data-testid="board-context-header"');
  });
  it('offers seven ESP sections with honest scope notes and leaves UNO file navigation intact', () => {
    const espMarkup = render(esp, program('esp', '// main')).markup;
    expect(espMarkup.match(/data-testid="esp-code-tab-/g)).toHaveLength(7);
    for (const label of ['Principal', 'WiFi', 'Funciones', 'Servidor web', 'HTML', 'Vista web', 'Monitor serie']) expect(espMarkup).toContain(label);
    expect(espMarkup).toContain('Includes locales y funciones void sin parámetros');
    expect(espMarkup).toContain('WiFi, ESP8266WebServer y LittleFS simulados');
    expect(render(uno, program('uno', '// UNO')).markup).not.toContain('esp-code-tab-');
  });
  it('explains saved main.ino execution and the supported GPIO subset without adding editor controls', () => {
    const { markup } = render(uno, undefined);
    expect(markup).toContain('Se ejecuta un subconjunto de Arduino');
    expect(markup).toContain('WiFi, ESP8266WebServer y LittleFS simulados');
    expect(markup).toContain('Detené y reiniciá para aplicar cambios');
    expect(markup).toContain('no C++ completo');
    expect(markup).toContain('sin WiFi real');
    expect(markup).toContain('sin hardware WiFi');
    expect(markup).toContain('data-testid="code-board-tab"');
    expect(markup).not.toContain('data-testid="firmware-run"');
  });
  it('renders independent source tabs and selects the saved header file', () => {
    let saved = applyProgramFileAction('uno', program('uno', '// main sketch'), { type: 'create', name: 'config.h' });
    saved = applyProgramFileAction('uno', saved, { type: 'edit', name: 'config.h', source: '#define LED_PIN 13' });
    const markup = render(uno, saved).markup;
    expect(markup).toContain('main.ino');
    expect(markup).toContain('config.h');
    expect(markup).toContain('#define LED_PIN 13');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('data-board-id="uno"');
    expect(markup).toContain('data-board-id="esp"');
    expect(markup).not.toContain('// main sketch');
  });
  it('renders web files as editable inert text and exposes an accessible split divider', () => {
    let saved = applyProgramFileAction('esp', undefined, { type: 'create', name: 'index.html' });
    saved = applyProgramFileAction('esp', saved, { type: 'edit', name: 'index.html', source: '<script>alert(1)</script>' });
    const markup = render(esp, saved).markup;
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    const pane = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(CodePane, { visible: true, children: 'editor' }) }));
    expect(pane).toContain('role="separator"');
    expect(pane).toContain('aria-orientation="horizontal"');
    expect(pane).toContain('aria-valuenow="60"');
  });
  it('provides a common manual selector with stable IDs for duplicate boards', () => {
    const duplicate = { ...esp, id: 'esp-second' };
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(BoardHeader, {
      components: [uno, esp, duplicate], activeBoardId: 'esp-second', onSelect: () => undefined,
      status: createElement('span', null, 'Virtual status'),
    }) }));
    expect(markup).toContain('ESP8266 #1 · esp');
    expect(markup).toContain('ESP8266 #2 · esp-second');
    expect(markup).toContain('value="esp-second" selected=""');
    expect(markup).toContain('data-testid="board-selector"');
    expect(markup).toContain('Virtual status');
  });
});
