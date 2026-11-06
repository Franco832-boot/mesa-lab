import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { createComponent } from '../../model/components';
import { createProject } from '../../model/project';
import { pinKey } from '../../sim/topology';
import { initialSimulation, transitionSimulation } from './runtime';
import type { SimulationState } from './runtime';
import { SimulationConsole } from './SimulationConsole';

const project = {
  ...createProject('firmware-console'),
  components: [
    createComponent('arduino-uno', { x: 0, y: 0 }, 'uno'),
    createComponent('esp8266', { x: 400, y: 0 }, 'esp'),
  ],
};
const blink = 'void setup(){pinMode(D1,OUTPUT);}void loop(){digitalWrite(D1,HIGH);delay(1000);digitalWrite(D1,LOW);delay(1000);}';
const render = (state: SimulationState) => renderToStaticMarkup(createElement(LocaleProvider, {
  children: createElement(SimulationConsole, {
    open: true, onToggle: () => undefined, status: state.status, locked: state.status !== 'stopped',
    diagnostics: state.snapshot?.diagnostics ?? null, firmware: state.firmware,
    initialIssue: null, components: project.components, onNavigate: () => undefined,
  }),
}));
afterEach(() => vi.unstubAllGlobals());

describe('firmware runtime errors in the existing simulation console', () => {
  it.each([
    { locale: 'es', location: 'Línea 3, columna 3', message: 'Nombre sin declarar' },
    { locale: 'en', location: 'Line 3, column 3', message: 'Undeclared' },
  ])('renders a source-located semantic diagnostic in $locale', ({ locale, location, message }) => {
    vi.stubGlobal('localStorage', { getItem: () => locale });
    const state = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno',
      source: 'void setup(){}\nvoid loop(){\n  missing=1;\n}' }, project);
    expect(render(state)).toContain(location);
    expect(render(state)).toContain(message);
    expect(state.firmware.uno?.error).toBe('name-error');
  });
  it.each([
    { locale: 'es', source: 'void setup(){Serial.notSupported();}void loop(){}', message: 'Código no admitido o incorrecto' },
    { locale: 'en', source: 'void setup(){Serial.notSupported();}void loop(){}', message: 'Unsupported or malformed source' },
    { locale: 'es', source: 'void setup(){pinMode(99,OUTPUT);}void loop(){delay(1000);}', message: 'Pin, modo, nivel lógico o espera no válidos' },
    { locale: 'en', source: 'void setup(){pinMode(99,OUTPUT);}void loop(){delay(1000);}', message: 'Invalid pin, mode, logic level or delay' },
  ])('shows $message in $locale without stopping the healthy board', ({ locale, source, message }) => {
    vi.stubGlobal('localStorage', { getItem: () => locale });
    let state = transitionSimulation(initialSimulation(), { type: 'start' }, project);
    state = transitionSimulation(state, { type: 'firmware-run', componentId: 'uno', source }, project);
    state = transitionSimulation(state, { type: 'firmware-run', componentId: 'esp', source: blink }, project);
    const html = render(state);
    expect(html).toContain(message);
    expect(html).toContain('role="alert" data-testid="firmware-error" data-component-id="uno"');
    expect(html).not.toContain('data-component-id="esp"');
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo(3.3, 10);
    state = transitionSimulation(state, { type: 'firmware-advance', elapsedMs: 1000 }, project);
    expect(state.snapshot?.pins[pinKey('esp', 'D1')]?.voltage).toBeCloseTo(0, 10);
    expect(render(state)).toContain(message);
    state = transitionSimulation(state, { type: 'stop' }, project);
    expect(render(state)).not.toContain('data-testid="firmware-error"');
  });

  it('presents a delayed execution failure and preserves paused errors until stop', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'es' });
    const source = 'void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}void loop(){delay(10);digitalWrite(12,HIGH);}';
    let state = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source }, project);
    expect(render(state)).not.toContain('data-testid="firmware-error"');
    state = transitionSimulation(state, { type: 'firmware-advance', elapsedMs: 10 }, project);
    expect(state.inputs.gpio?.[pinKey('uno', 'D13')]).toBeUndefined();
    expect(render(state)).toContain('data-code="pin-not-output"');
    expect(render(state)).toContain('digitalWrite requiere pinMode(pin, OUTPUT)');
    state = transitionSimulation(state, { type: 'pause' }, project);
    expect(render(state)).toContain('data-code="pin-not-output"');
    state = transitionSimulation(state, { type: 'stop' }, project);
    expect(render(state)).not.toContain('data-testid="firmware-error"');
  });
});
