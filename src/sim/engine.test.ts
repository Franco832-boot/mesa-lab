import { describe, expect, it } from 'vitest';
import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import type { CircuitProject, ElectronicComponent, PinReference } from '../model/types';
import { evaluateCircuit } from './engine';
import { pinKey } from './topology';

const piece = (kind: ElectronicComponent['kind'], id: string) => createComponent(kind, { x: 0, y: 0 }, id);
function circuit(components: ElectronicComponent[], connections: [string, string, string, string][]): CircuitProject {
  const ref = (componentId: string, pinId: string): PinReference => ({ componentId, pinId });
  return { ...createProject(), components, wires: connections.map(([a, ap, b, bp], index) => ({ id: `w${index}`, from: ref(a, ap), to: ref(b, bp), color: '#000000', waypoints: [] })) };
}
const resistor = (id: string, resistance: number): ElectronicComponent => ({ ...piece('resistor', id), kind: 'resistor', properties: { resistance } });
const source = (id: string, voltage: number): ElectronicComponent => ({ ...piece('power-supply', id), kind: 'power-supply', properties: { voltage } });
function ledCircuit(resistance = 330, reversed = false) {
  return circuit([source('s', 5), resistor('r', resistance), piece('led', 'l')], [
    ['s', 'positive', 'r', '1'], ['r', '2', 'l', reversed ? 'cathode' : 'anode'], ['l', reversed ? 'anode' : 'cathode', 's', 'negative'],
  ]);
}
const codes = (project: CircuitProject) => evaluateCircuit(project).diagnostics.map((issue) => issue.code);
describe('DC electrical evaluation', () => {
  it('lights a forward red LED only from its valid current path: (5 - 2)/330 A', () => {
    const result = evaluateCircuit(ledCircuit());
    expect(result.components.l?.current).toBeCloseTo(3 / 330, 10);
    expect(result.components.l?.voltage).toBeCloseTo(2, 10);
    expect(result.components.l?.brightness).toBeCloseTo((3 / 330) / 0.02, 10);
    expect(result.components.l?.condition).toBe('active');
    expect(result.components.r?.power).toBeCloseTo(9 / 330, 10);
  });
  it('keeps reversed LED off and reports polarity without inventing reverse breakdown', () => {
    const result = evaluateCircuit(ledCircuit(330, true));
    expect(result.components.l?.brightness).toBe(0);
    expect(result.components.l?.current).toBe(0);
    expect(result.components.l?.voltage).toBeCloseTo(-5);
    expect(result.diagnostics.some((issue) => issue.code === 'reverse-polarity')).toBe(true);
  });
  it('does not illuminate a disconnected or dangling LED', () => {
    const project = ledCircuit(); project.wires.pop();
    const result = evaluateCircuit(project);
    expect(result.components.l?.brightness).toBe(0);
    expect(result.components.l?.voltage).toBeUndefined();
    expect(result.pins[pinKey('l', 'cathode')]?.voltage).toBeUndefined();
    expect(result.diagnostics.some((issue) => issue.code === 'open-circuit')).toBe(true);
  });
  it('reports a completely disconnected component and floating nodes', () => {
    const project = circuit([piece('led', 'l')], []);
    expect(codes(project)).toContain('disconnected-component');
    expect(codes(project)).toContain('floating-node');
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
  });
  it('reports ideal source direct short without inventing a current', () => {
    const project = circuit([source('s', 5)], [['s', 'positive', 's', 'negative']]);
    expect(codes(project)).toContain('short-circuit');
    expect(evaluateCircuit(project).components.s?.current).toBeUndefined();
  });
  it('solves a single 1k resistor at 5V: 5mA and 25mW', () => {
    const result = evaluateCircuit(circuit([source('s', 5), resistor('r', 1000)], [['s', 'positive', 'r', '1'], ['r', '2', 's', 'negative']]));
    expect(result.components.r?.current).toBeCloseTo(0.005, 10);
    expect(result.components.r?.voltage).toBeCloseTo(5, 10);
    expect(result.components.r?.power).toBeCloseTo(0.025, 10);
  });
  it('solves series resistors and divider: 5V/(1k+2k), middle 10/3V', () => {
    const result = evaluateCircuit(circuit([source('s', 5), resistor('r1', 1000), resistor('r2', 2000)], [['s', 'positive', 'r1', '1'], ['r1', '2', 'r2', '1'], ['r2', '2', 's', 'negative']]));
    expect(result.components.r1?.current).toBeCloseTo(5 / 3000, 10);
    expect(result.components.r2?.current).toBeCloseTo(5 / 3000, 10);
    expect(result.pins[pinKey('r2', '1')]?.voltage).toBeCloseTo(10 / 3, 10);
  });
  it('solves parallel resistors using Kirchhoff equations', () => {
    const result = evaluateCircuit(circuit([source('s', 5), resistor('r1', 1000), resistor('r2', 2000)], [['s', 'positive', 'r1', '1'], ['s', 'positive', 'r2', '1'], ['r1', '2', 's', 'negative'], ['r2', '2', 's', 'negative']]));
    expect(result.components.s?.current).toBeCloseTo(-0.0075, 10);
  });
  it('detects contradictory sources and suppresses affected LED results', () => {
    const project = ledCircuit(); project.components.push(source('s2', 3));
    project.wires.push({ id: 'a', from: { componentId: 's', pinId: 'positive' }, to: { componentId: 's2', pinId: 'positive' }, color: '#000000', waypoints: [] }, { id: 'b', from: { componentId: 's', pinId: 'negative' }, to: { componentId: 's2', pinId: 'negative' }, color: '#000000', waypoints: [] });
    expect(codes(project)).toContain('contradictory-sources');
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
  });
  it('rejects indeterminate parallel ideal source currents explicitly', () => {
    const project = circuit([source('s1', 5), source('s2', 5)], [['s1', 'positive', 's2', 'positive'], ['s1', 'negative', 's2', 'negative']]);
    expect(codes(project)).toContain('unsupported-network');
    expect(evaluateCircuit(project).components.s1?.current).toBeUndefined();
  });
  it('rejects ambiguous current sharing between identical parallel ideal LEDs', () => {
    const project = ledCircuit(); project.components.push(piece('led', 'l2'));
    project.wires.push({ id: 'p1', from: { componentId: 'l', pinId: 'anode' }, to: { componentId: 'l2', pinId: 'anode' }, color: '#000000', waypoints: [] }, { id: 'p2', from: { componentId: 'l', pinId: 'cathode' }, to: { componentId: 'l2', pinId: 'cathode' }, color: '#000000', waypoints: [] });
    expect(codes(project)).toContain('unsupported-network');
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
    expect(evaluateCircuit(project).components.l2?.current).toBeUndefined();
  });
  it('rejects an LED directly across an ideal source rather than fabricating current', () => {
    const project = circuit([source('s', 5), piece('led', 'l')], [['s', 'positive', 'l', 'anode'], ['s', 'negative', 'l', 'cathode']]);
    expect(codes(project)).toContain('unsupported-network');
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
  });
  it('reports 1/4W resistor overload based on solved dissipation', () => {
    const result = evaluateCircuit(circuit([source('s', 5), resistor('r', 10)], [['s', 'positive', 'r', '1'], ['s', 'negative', 'r', '2']]));
    expect(result.components.r?.power).toBeCloseTo(2.5);
    expect(result.components.r?.condition).toBe('overheated');
    expect(result.diagnostics.some((issue) => issue.code === 'resistor-overpower')).toBe(true);
  });
  it('warns of LED current above 20mA without assuming permanent damage', () => {
    const result = evaluateCircuit(ledCircuit(100));
    expect(result.components.l?.current).toBeCloseTo(0.03);
    expect(result.components.l?.condition).toBe('warning');
    expect(result.diagnostics.some((issue) => issue.code === 'led-overcurrent')).toBe(true);
  });
  it('produces deterministic conditions and recomputation reset without circuit mutation', () => {
    const project = ledCircuit(100); const before = JSON.stringify(project);
    expect(evaluateCircuit(project)).toEqual(evaluateCircuit(project));
    expect(JSON.stringify(project)).toBe(before);
    expect(evaluateCircuit(ledCircuit()).components.l?.condition).toBe('active');
  });
  it('does not let a faulty island suppress an independent valid circuit', () => {
    const project = ledCircuit(); project.components.push(source('bad', 5));
    project.wires.push({ id: 'bad', from: { componentId: 'bad', pinId: 'positive' }, to: { componentId: 'bad', pinId: 'negative' }, color: '#000000', waypoints: [] });
    expect(codes(project)).toContain('short-circuit');
    expect(evaluateCircuit(project).components.l?.brightness).toBeGreaterThan(0);
  });
  it('keeps source references and readings stable when a stacked-source circuit is reordered', () => {
    const project = circuit([source('a', 5), source('b', 3), resistor('r', 1000)], [
      ['a', 'positive', 'b', 'negative'], ['b', 'positive', 'r', '1'], ['r', '2', 'a', 'negative'],
    ]);
    const result = evaluateCircuit(project);
    expect(result.components.r?.voltage).toBeCloseTo(8, 10);
    expect(result.components.r?.current).toBeCloseTo(0.008, 10);
    expect(result.pins[pinKey('a', 'negative')]?.voltage).toBe(0);
    expect(evaluateCircuit({ ...project, components: [...project.components].reverse(), wires: [...project.wires].reverse() })).toEqual(result);
  });

  it('reports the documented matrix bound instead of evaluating an oversized series network', () => {
    const resistors = Array.from({ length: 100 }, (_, index) => resistor(`r${index}`, 1000));
    const connections: [string, string, string, string][] = [['s', 'positive', 'r0', '1']];
    for (let index = 0; index < 99; index++) connections.push([`r${index}`, '2', `r${index + 1}`, '1']);
    connections.push(['r99', '2', 's', 'negative']);
    const result = evaluateCircuit(circuit([source('s', 5), ...resistors], connections));
    expect(result.diagnostics.some((issue) => issue.code === 'unsupported-network')).toBe(true);
    expect(result.components.r0?.current).toBeUndefined();
  });
  it('rejects a seven-LED island beyond the documented combinatorial limit', () => {
    const parts = [source('s', 5)];
    const connections: [string, string, string, string][] = [];
    for (let index = 0; index < 7; index++) {
      parts.push(resistor(`r${index}`, 330), piece('led', `l${index}`));
      connections.push(['s', 'positive', `r${index}`, '1'], [`r${index}`, '2', `l${index}`, 'anode'], [`l${index}`, 'cathode', 's', 'negative']);
    }
    const result = evaluateCircuit(circuit(parts, connections));
    expect(result.diagnostics.some((issue) => issue.code === 'unsupported-network')).toBe(true);
    expect(result.components.l0?.brightness).toBe(0);
    expect(result.components.l0?.current).toBeUndefined();
  });
  it('keeps imported prototype-named component IDs safe in electrical result records', () => {
    const result = evaluateCircuit(circuit([source('s', 5), resistor('__proto__', 1000)], [
      ['s', 'positive', '__proto__', '1'], ['__proto__', '2', 's', 'negative'],
    ]));
    expect(Object.hasOwn(result.components, '__proto__')).toBe(true);
    expect(result.components['__proto__']?.current).toBeCloseTo(0.005, 10);
    expect(Object.getPrototypeOf(result.components)).toBe(Object.prototype);
  });

  it('bounds total runtime pin allocation while preserving large editable documents', () => {
    const project = circuit(Array.from({ length: 15 }, (_, index) => piece('breadboard', `bb${index}`)), []);
    const before = JSON.stringify(project);
    const result = evaluateCircuit(project);
    expect(result.diagnostics.some((issue) => issue.code === 'unsupported-network')).toBe(true);
    expect(result.pins).toEqual({});
    expect(JSON.stringify(project)).toBe(before);
  });

});
