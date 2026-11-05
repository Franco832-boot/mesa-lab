import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { es } from '../../locales/es/messages';
import { en } from '../../locales/en/messages';
import { createProject } from '../../model/project';
import type { CircuitProject } from '../../model/types';
import { initialSimulation, transitionSimulation } from '../simulation/runtime';
import type { SimulationState } from '../simulation/runtime';
import type { SimulationController } from '../simulation/useSimulation';
import type { ContextBoard } from './boardContext';
import { IotWorkspace } from './IotWorkspace';
import { CodeWorkspace } from './CodeWorkspace';
import { VirtualDeviceStatus } from './VirtualDeviceStatus';
import { createLedHttpExample } from './iotConfiguration';
import { pinKey } from '../../sim/topology';

const uno: ContextBoard = { id: 'uno', kind: 'arduino-uno', position: { x: 0, y: 0 }, rotation: 0, properties: { logicVoltage: 5 } };
const unconfigured: ContextBoard = { id: 'esp-1', kind: 'esp8266', position: { x: 10, y: 0 }, rotation: 0, properties: { logicVoltage: 3.3 } };
const configured = (id: string): ContextBoard => {
  const config = createLedHttpExample();
  if (!config) throw new Error('invalid example fixture');
  return { ...unconfigured, id, kind: 'esp8266', properties: { logicVoltage: 3.3, virtualNetwork: config } };
};
const first = configured('esp-1'), second = configured('esp-2');
const project = (): CircuitProject => ({ ...createProject('iot-ui'), components: [uno, first, second], wires: [] });
const controller = (state: SimulationState): SimulationController => ({
  ...state, start: vi.fn(), pause: vi.fn(), stop: vi.fn(), reset: vi.fn(), setGpio: vi.fn(), setButton: vi.fn(), setPotentiometer: vi.fn(),
  runFirmware: vi.fn(), stopFirmware: vi.fn(), connectDevice: vi.fn(), disconnectDevice: vi.fn(), requestHttp: vi.fn(),
});
const render = (state: SimulationState, activeBoard: ContextBoard | undefined, boards: ContextBoard[] = [uno, first, second]) => {
  const simulation = controller(state), onConfig = vi.fn(() => true);
  const markup = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(IotWorkspace, {
    boards, activeBoard, onSelectBoard: vi.fn(), simulation, onConfig,
  }) }));
  return { markup, simulation, onConfig };
};
function connected() {
  const doc = project();
  let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'esp-1' }, doc);
  state = transitionSimulation(state, { type: 'connect', componentId: 'esp-2' }, doc);
  return { doc, state };
}
afterEach(() => vi.unstubAllGlobals());
describe('virtual IoT workspace rendering', () => {
  it('has no implicit routes, network connection, request or GPIO action on render', () => {
    const { markup, simulation, onConfig } = render(initialSimulation(), unconfigured, [unconfigured]);
    expect(markup).toContain('data-status="unconfigured"');
    expect(markup).toContain('data-testid="iot-routes-empty"');
    expect(markup).toContain('data-testid="iot-install-example"');
    expect(markup).not.toContain('data-testid="iot-route-list"');
    expect(markup).not.toContain('data-testid="iot-device-ip"');
    expect(simulation.connectDevice).not.toHaveBeenCalled();
    expect(simulation.requestHttp).not.toHaveBeenCalled();
    expect(onConfig).not.toHaveBeenCalled();
  });
  it('explains UNO limitations and omits unsupported network controls', () => {
    const { markup } = render(initialSimulation(), uno);
    expect(markup).toContain(es.iotUnoNote);
    expect(markup).toContain('data-status="unsupported"');
    expect(markup).not.toContain('data-testid="iot-connect"');
    expect(markup).not.toContain('data-testid="iot-send"');
  });
  it.each(['es', 'en'] as const)('shows actual virtual connection, allocated address and saved routes in %s', (locale) => {
    vi.stubGlobal('localStorage', { getItem: () => locale });
    const dictionary = locale === 'es' ? es : en;
    const { state } = connected();
    const { markup } = render(state, first);
    expect(markup).toContain(dictionary.iotConnected);
    expect(markup).toContain('data-testid="iot-device-ip">192.0.2.1');
    expect(markup).toContain('GET /led/on');
    expect(markup).toContain('GET /led/off');
    expect(markup).toContain(dictionary.iotVirtualScope);
    expect(markup).toContain('value="Mesa Lab"');
  });
  it('renders a real virtual response and the electrical GPIO reading without attributing it to another device', () => {
    const { doc, state: initial } = connected();
    let state = transitionSimulation(initial, { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'http', request: { componentId: 'esp-1', method: 'GET', url: 'http://192.0.2.1/led/on', body: 'request payload' } }, doc);
    const firstMarkup = render(state, first).markup;
    expect(firstMarkup).toContain('data-testid="iot-response-status">HTTP 200');
    expect(firstMarkup).toContain('data-testid="iot-response-body">D1=HIGH');
    expect(firstMarkup).toContain('data-testid="iot-recorded-request-body">request payload');
    expect(firstMarkup).toContain('data-testid="iot-gpio-config">OUTPUT · HIGH');
    expect(state.snapshot?.pins[pinKey('esp-1', 'D1')]?.voltage).toBeCloseTo(3.3, 8);
    const secondMarkup = render(state, second).markup;
    expect(secondMarkup).toContain('data-testid="iot-response-empty"');
    expect(secondMarkup).not.toContain('data-testid="iot-response-body"');
    expect(secondMarkup).toContain('data-testid="iot-device-ip">192.0.2.2');
  });
  it('shows target mismatch on the explicitly selected device without driving either board', () => {
    const { doc, state: initial } = connected();
    let state = transitionSimulation(initial, { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'http', request: { componentId: 'esp-2', method: 'GET', url: 'http://192.0.2.1/led/on' } }, doc);
    const { markup } = render(state, second);
    expect(markup).toContain('data-testid="iot-response-status">HTTP 409');
    expect(markup).toContain('data-error="target-mismatch"');
    expect(markup).toContain(es.iotErrorTargetMismatch);
    expect(state.inputs.gpio).toBeUndefined();
  });
  it('keeps missing-target failures visible without falling back to an existing board response', () => {
    const { doc, state: initial } = connected();
    const state = transitionSimulation(initial, { type: 'http', request: { componentId: 'missing-device', method: 'GET', url: 'http://192.0.2.1/led/on' } }, doc);
    const { markup } = render(state, first);
    expect(markup).toContain('data-testid="iot-missing-target-error"');
    expect(markup).toContain('missing-device');
    expect(markup).toContain('data-testid="iot-response-empty"');
  });
  it('renders response and recorded request bodies as inert text', () => {
    const config = { ssid: 'Text', routes: [{ method: 'POST' as const, path: '/text', status: 200, responseBody: '<script>alert(1)</script>' }] };
    const board: ContextBoard = { ...unconfigured, kind: 'esp8266', properties: { logicVoltage: 3.3, virtualNetwork: config } };
    const doc: CircuitProject = { ...project(), components: [board] };
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: board.id }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'http', request: { componentId: board.id, method: 'POST', url: 'http://192.0.2.1/text', body: '<img src=x onerror=alert(1)>' } }, doc);
    const { markup } = render(state, board, [board]);
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img src=x');
  });
  it('clears sessions/history on reset while retaining configured routes in the document', () => {
    const { doc, state: initial } = connected();
    const reset = transitionSimulation(initial, { type: 'reset' }, doc);
    const { markup } = render(reset, first);
    expect(markup).toContain('data-status="disconnected"');
    expect(markup).toContain('data-testid="iot-response-empty"');
    expect(markup).toContain('GET /led/on');
    expect(markup).not.toContain('data-testid="iot-device-ip"');
  });
  it('shares active board connection status with the code workspace through the common header', () => {
    const { state } = connected();
    const status = createElement(VirtualDeviceStatus, { board: first, network: state.virtualNetwork, testIdPrefix: 'code' });
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(CodeWorkspace, {
      boards: [first, second], activeBoard: first, program: undefined, onChange: vi.fn(), onSelectBoard: vi.fn(), status,
    }) }));
    expect(markup).toContain('ESP8266 #1 · esp-1');
    expect(markup).toContain('data-testid="code-device-ip">192.0.2.1');
    expect(markup).not.toContain('data-testid="iot-device-ip"');
  });
});
