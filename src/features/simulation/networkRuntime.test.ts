import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { applyEditorCommand } from '../../model/editor';
import { createProject, parseProject, serializeProject } from '../../model/project';
import type { CircuitProject, ElectronicComponent, VirtualNetworkConfig } from '../../model/types';
import { pinKey } from '../../sim/topology';
import { initialSimulation, reconcileSimulationProject, simulationProjectStamp, transitionSimulation } from './runtime';

const config = (): VirtualNetworkConfig => ({ ssid: 'virtual lab', routes: [
  { method: 'GET', path: '/led/on', status: 200, responseBody: 'on', gpio: { pinId: 'D1', level: 'HIGH' } },
  { method: 'GET', path: '/led/off', status: 200, responseBody: 'off', gpio: { pinId: 'D1', level: 'LOW' } },
] });
const board = (id: string): ElectronicComponent => ({ ...createComponent('esp8266', { x: 0, y: 0 }, id), kind: 'esp8266', properties: { logicVoltage: 3.3, virtualNetwork: config() } });
function project(wired = true): CircuitProject {
  const a = board('a'), b = board('b'), led = createComponent('led', { x: 0, y: 0 }, 'l'), resistor = createComponent('resistor', { x: 0, y: 0 }, 'r');
  return { ...createProject('http-runtime'), components: [a, b, led, resistor], wires: wired ? [
    { id: 'w1', from: { componentId: 'a', pinId: 'D1' }, to: { componentId: 'r', pinId: '1' }, color: '#000000', waypoints: [] },
    { id: 'w2', from: { componentId: 'r', pinId: '2' }, to: { componentId: 'l', pinId: 'anode' }, color: '#000000', waypoints: [] },
    { id: 'w3', from: { componentId: 'l', pinId: 'cathode' }, to: { componentId: 'a', pinId: 'GND' }, color: '#000000', waypoints: [] },
  ] : [] };
}
const http = (path: string, componentId = 'a', ip = '192.0.2.1') => ({ type: 'http' as const,
  request: { componentId, method: 'GET' as const, url: `http://${ip}${path}` } });
describe('atomic virtual HTTP and electrical runtime integration', () => {
  it('connects before Start and sends HTTP GPIO through the real electrical solver', () => {
    const doc = project();
    const before = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    expect(state.status).toBe('stopped');
    expect(state.virtualNetwork.devices.a?.ip).toBe('192.0.2.1');
    state = transitionSimulation(state, { type: 'start' }, doc);
    expect(state.virtualNetwork.devices.a?.connected).toBe(true);
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(200);
    expect(state.inputs.gpio?.[pinKey('a', 'D1')]).toEqual({ mode: 'output', level: 'HIGH' });
    // Red LED Vf2V, ESP nominal3.3V, series330ohm plus modeled drive50ohm.
    expect(state.snapshot?.components.l?.current).toBeCloseTo(1.3 / 380, 10);
    expect(state.snapshot?.components.l?.brightness).toBeCloseTo((1.3 / 380) / 0.02, 10);
    state = transitionSimulation(state, http('/led/off'), doc);
    expect(state.snapshot?.components.l?.brightness).toBe(0);
    expect(serializeProject(doc)).toBe(before);
  });
  it('does not turn on an unwired LED merely because HTTP GPIO HIGH succeeded', () => {
    const doc = project(false);
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(200);
    expect(state.snapshot?.pins[pinKey('a', 'D1')]?.logic).toBe('HIGH');
    expect(state.snapshot?.components.l?.brightness).toBe(0);
  });
  it('a valid request to device B drives only B and cannot illuminate the LED wired to A', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'connect', componentId: 'b' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    const aLevel = state.snapshot?.pins[pinKey('a', 'D1')];
    const aSession = state.virtualNetwork.devices.a;
    state = transitionSimulation(state, http('/led/on', 'b', '192.0.2.2'), doc);
    expect(state.virtualNetwork.lastResponse).toMatchObject({ componentId: 'b', status: 200 });
    expect(state.inputs.gpio?.[pinKey('b', 'D1')]).toEqual({ mode: 'output', level: 'HIGH' });
    expect(state.inputs.gpio?.[pinKey('a', 'D1')]).toBeUndefined();
    expect(state.snapshot?.pins[pinKey('b', 'D1')]?.logic).toBe('HIGH');
    expect(state.snapshot?.pins[pinKey('a', 'D1')]).toEqual(aLevel);
    expect(state.snapshot?.components.l?.brightness).toBe(0);
    expect(state.virtualNetwork.devices.a).toBe(aSession);
  });
  it('successful HTTP HIGH leaves a reversed LED dark and reports electrical reverse polarity', () => {
    const doc = project();
    doc.wires = doc.wires.map((wire) => ({ ...wire,
      from: wire.from.componentId === 'l' ? { ...wire.from, pinId: 'anode' } : wire.from,
      to: wire.to.componentId === 'l' ? { ...wire.to, pinId: 'cathode' } : wire.to,
    }));
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(200);
    expect(state.inputs.gpio?.[pinKey('a', 'D1')]).toEqual({ mode: 'output', level: 'HIGH' });
    expect(state.snapshot?.components.l?.brightness).toBe(0);
    expect(state.snapshot?.components.l?.current).toBe(0);
    expect(state.snapshot?.components.l?.voltage).toBeCloseTo(-3.3, 10);
    expect(state.snapshot?.diagnostics).toContainEqual({
      code: 'reverse-polarity', severity: 'warning', componentIds: ['l'], pinIds: ['anode', 'cathode'],
    });
  });
  it('logs paused/stopped409 without mutating GPIO or frozen snapshot', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    const stopped = state;
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(409);
    expect(state.inputs).toBe(stopped.inputs);
    expect(state.snapshot).toBe(stopped.snapshot);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    state = transitionSimulation(state, { type: 'pause' }, doc);
    const paused = state;
    state = transitionSimulation(state, http('/led/off'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(409);
    expect(state.inputs).toBe(paused.inputs);
    expect(state.snapshot).toBe(paused.snapshot);
    expect(state.virtualNetwork.devices.a?.history).toHaveLength(3);
  });
  it('wrong target/offline/unknown route/method failures leave all GPIO and readings unchanged', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'connect', componentId: 'b' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    const before = state;
    for (const event of [http('/led/on', 'b'), http('/missing'), { ...http('/led/on'), request: { ...http('/led/on').request, method: 'DELETE' as const } }]) {
      state = transitionSimulation(state, event, doc);
      expect(state.inputs).toBe(before.inputs);
      expect(state.snapshot).toBe(before.snapshot);
    }
    state = transitionSimulation(state, { type: 'disconnect', componentId: 'a' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(state.virtualNetwork.lastResponse?.status).toBe(503);
    expect(state.inputs).toBe(before.inputs);
    expect(state.snapshot).toBe(before.snapshot);
    expect(state.inputs.gpio).toBeUndefined();
  });
  it('disconnect retains actual GPIO drive and the other device session', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'connect', componentId: 'b' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    const before = state;
    state = transitionSimulation(state, { type: 'disconnect', componentId: 'a' }, doc);
    expect(state.snapshot).toBe(before.snapshot);
    expect(state.inputs).toBe(before.inputs);
    expect(state.virtualNetwork.devices.b).toBe(before.virtualNetwork.devices.b);
    expect(state.virtualNetwork.devices.a?.history).toBe(before.virtualNetwork.devices.a?.history);
  });
  it('config changes disconnect only target, preserving electrical snapshot and all pin overrides', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'connect', componentId: 'b' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    const changed = applyEditorCommand(doc, { type: 'network', id: 'a', config: { ...config(), ssid: 'new virtual lab' } });
    const next = reconcileSimulationProject(state, simulationProjectStamp(doc), changed);
    expect(next.status).toBe('running');
    expect(next.snapshot).toBe(state.snapshot);
    expect(next.inputs).toBe(state.inputs);
    expect(next.virtualNetwork.devices.a?.connected).toBe(false);
    expect(next.virtualNetwork.devices.b).toBe(state.virtualNetwork.devices.b);
    const rejected = transitionSimulation(next, http('/led/off'), changed);
    expect(rejected.virtualNetwork.lastResponse?.status).toBe(503);
    expect(rejected.snapshot).toBe(state.snapshot);
  });
  it('code, viewport, position and wire cosmetics preserve complete runtime despite document normalization', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    let changed = applyEditorCommand(doc, { type: 'program', id: 'a', source: '// saved source only' });
    changed = applyEditorCommand(changed, { type: 'move', positions: { a: { x: 100, y: 200 } } });
    changed = parseProject(JSON.stringify({ ...changed, viewport: { zoom: 2, offset: { x: 55, y: -44 } }, wires: changed.wires.map((wire) => ({ ...wire, color: '#ff0000', waypoints: [{ x: 10, y: 20 }] })) }));
    expect(reconcileSimulationProject(state, simulationProjectStamp(doc), changed)).toBe(state);
  });
  it('electrical changes and explicit import epochs reset all transient runtime', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    const changed = applyEditorCommand(doc, { type: 'properties', id: 'r', update: { kind: 'resistor', properties: { resistance: 1000 } } });
    expect(reconcileSimulationProject(state, simulationProjectStamp(doc), changed)).toEqual(initialSimulation());
    expect(reconcileSimulationProject(state, simulationProjectStamp(doc, 'epoch1'), doc, 'epoch2')).toEqual(initialSimulation());
  });
  it.each(['stop', 'reset'] as const)('%s clears transient sessions/history/GPIO and retains saved configuration', (type) => {
    const doc = project(), json = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), { type: 'connect', componentId: 'a' }, doc);
    state = transitionSimulation(state, { type: 'start' }, doc);
    state = transitionSimulation(state, http('/led/on'), doc);
    expect(transitionSimulation(state, { type }, doc)).toEqual(initialSimulation());
    expect(serializeProject(doc)).toBe(json);
    expect(parseProject(json)).toEqual(doc);
  });
});
