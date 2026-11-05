import { describe, expect, it } from 'vitest';
import { createComponent, espGpioMap } from '../model/components';
import { createProject, parseProject, serializeProject } from '../model/project';
import type { CircuitProject, ElectronicComponent } from '../model/types';
import { evaluateCircuit } from './engine';
import { gpioPins } from './gpio';
import { pinKey } from './topology';
import type { SimulationInputs } from './types';

const piece = (kind: ElectronicComponent['kind'], id: string) => createComponent(kind, { x: 0, y: 0 }, id);
const source: ElectronicComponent = { ...piece('power-supply', 's'), kind: 'power-supply', properties: { voltage: 5 } };
const resistor: ElectronicComponent = { ...piece('resistor', 'r'), kind: 'resistor', properties: { resistance: 330 } };
function circuit(components: ElectronicComponent[], edges: [string, string, string, string][]): CircuitProject {
  return { ...createProject(), components, wires: edges.map(([a, ap, b, bp], index) => ({ id: `w${index}`, from: { componentId: a, pinId: ap }, to: { componentId: b, pinId: bp }, color: '#000000', waypoints: [] })) };
}
function gpioLed(kind: 'arduino-uno' | 'esp8266' = 'arduino-uno') {
  return circuit([piece(kind, 'b'), resistor, piece('led', 'l')], [['b', 'D1', 'r', '1'], ['r', '2', 'l', 'anode'], ['l', 'cathode', 'b', 'GND']]);
}
function output(level: 'HIGH' | 'LOW' | 'FLOATING'): SimulationInputs {
  return { gpio: { [pinKey('b', 'D1')]: { mode: 'output', level } } };
}
describe('interactive electrical models', () => {
  it('keeps open pushbutton off and closes all four contacts on press', () => {
    const project = circuit([source, resistor, piece('led', 'l'), piece('pushbutton', 'p')], [['s', 'positive', 'p', '1'], ['p', '4', 'r', '1'], ['r', '2', 'l', 'anode'], ['l', 'cathode', 's', 'negative']]);
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
    expect(evaluateCircuit(project, { buttons: { p: true } }).components.l?.current).toBeCloseTo(3 / 330, 10);
    expect(evaluateCircuit(project, { buttons: { p: true } }).components.p?.condition).toBe('active');
    expect(evaluateCircuit(project, { buttons: { p: false } }).components.l?.brightness).toBe(0);
  });
  it('inverts physical pressed state for normally closed buttons', () => {
    const button: ElectronicComponent = { ...piece('pushbutton', 'p'), kind: 'pushbutton', properties: { normallyClosed: true } };
    const project = circuit([source, resistor, button], [['s', 'positive', 'p', '1'], ['p', '2', 'r', '1'], ['r', '2', 's', 'negative']]);
    expect(evaluateCircuit(project).components.r?.current).toBeCloseTo(5 / 330, 10);
    expect(evaluateCircuit(project, { buttons: { p: true } }).components.r?.current).toBe(0);
  });
  it('models all three potentiometer terminals and changes divider voltage', () => {
    const project = circuit([source, piece('potentiometer', 'p')], [['s', 'positive', 'p', '3'], ['s', 'negative', 'p', '1']]);
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const result = evaluateCircuit(project, { potentiometers: { p: ratio } });
      expect(result.pins[pinKey('p', 'wiper')]?.voltage).toBeCloseTo(5 * ratio, 10);
      expect(result.components.p?.power).toBeCloseTo(25 / 10000, 10);
    }
  });
  it('loads the potentiometer wiper as a real voltage divider', () => {
    const load: ElectronicComponent = { ...resistor, properties: { resistance: 5000 } };
    const project = circuit([source, piece('potentiometer', 'p'), load], [['s', 'positive', 'p', '3'], ['s', 'negative', 'p', '1'], ['p', 'wiper', 'r', '1'], ['r', '2', 's', 'negative']]);
    // Bottom 5k parallel with load 5k -> 2.5k; upper 5k, 5 * 2.5/7.5 V.
    expect(evaluateCircuit(project).pins[pinKey('p', 'wiper')]?.voltage).toBeCloseTo(5 / 3, 10);
  });
  it('rejects out-of-range potentiometer input and unknown transient IDs', () => {
    const project = circuit([source, piece('potentiometer', 'p')], [['s', 'positive', 'p', '3'], ['s', 'negative', 'p', '1']]);
    for (const ratio of [-0.1, 1.1, Number.NaN, Infinity]) {
      expect(evaluateCircuit(project, { potentiometers: { p: ratio } }).diagnostics.some((issue) => issue.code === 'invalid-input')).toBe(true);
    }
    expect(evaluateCircuit(project, { buttons: { missing: true } }).diagnostics.some((issue) => issue.code === 'invalid-input')).toBe(true);
  });
  it('drives a wired UNO LED HIGH/LOW with finite output resistance', () => {
    const project = gpioLed();
    const high = evaluateCircuit(project, output('HIGH'));
    expect(high.components.l?.current).toBeCloseTo(3 / (330 + 40), 10);
    expect(high.pins[pinKey('b', 'D1')]?.voltage).toBeCloseTo(5 - (3 / 370) * 40, 10);
    expect(high.pins[pinKey('b', 'D1')]?.logic).toBe('HIGH');
    expect(evaluateCircuit(project, output('LOW')).components.l?.brightness).toBe(0);
    expect(evaluateCircuit(project, output('LOW')).pins[pinKey('b', 'D1')]?.logic).toBe('LOW');
  });
  it('defaults GPIO to high impedance and ignores remembered input HIGH', () => {
    const project = gpioLed();
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
    expect(evaluateCircuit(project, output('FLOATING')).components.l?.brightness).toBe(0);
    const input = evaluateCircuit(project, { gpio: { [pinKey('b', 'D1')]: { mode: 'input', level: 'HIGH' } } });
    expect(input.components.l?.brightness).toBe(0);
  });
  it('reads GPIO against its own ground, requiring a common reference', () => {
    const project = circuit([source, piece('esp8266', 'b')], [['s', 'positive', 'b', 'D1']]);
    const floating = evaluateCircuit(project);
    expect(floating.pins[pinKey('b', 'D1')]?.logic).toBe('FLOATING');
    expect(floating.pins[pinKey('b', 'D1')]?.voltage).toBeUndefined();
    project.wires.push({ id: 'ground', from: { componentId: 's', pinId: 'negative' }, to: { componentId: 'b', pinId: 'GND' }, color: '#000000', waypoints: [] });
    const grounded = evaluateCircuit(project);
    expect(grounded.pins[pinKey('b', 'D1')]?.voltage).toBeCloseTo(5);
    expect(grounded.diagnostics.some((issue) => issue.code === 'gpio-overvoltage')).toBe(true);
  });
  it('drives an ESP LED at 3.3V and respects 12mA per-pin limit', () => {
    const project = gpioLed('esp8266');
    expect(evaluateCircuit(project, output('HIGH')).components.l?.current).toBeCloseTo(1.3 / (330 + 50), 10);
    const load: ElectronicComponent = { ...resistor, properties: { resistance: 100 } };
    const loaded = circuit([piece('esp8266', 'b'), load], [['b', 'D1', 'r', '1'], ['r', '2', 'b', 'GND']]);
    expect(evaluateCircuit(loaded, output('HIGH')).components.r?.current).toBeCloseTo(3.3 / 150, 10);
    expect(evaluateCircuit(loaded, output('HIGH')).diagnostics.some((issue) => issue.code === 'gpio-overcurrent')).toBe(true);
  });
  it('uses the documented ESP mapping and reports boot-sensitive restrictions', () => {
    expect(espGpioMap.map((pin) => pin.gpio)).toEqual([16, 5, 4, 0, 2, 14, 12, 13, 15]);
    const project = circuit([piece('esp8266', 'b')], []);
    expect(evaluateCircuit(project).diagnostics.filter((issue) => issue.code === 'boot-sensitive-pin').map((issue) => issue.pinIds[0]).sort()).toEqual(['D3', 'D4', 'D8']);
    const wrong = evaluateCircuit(project, { gpio: { [pinKey('b', 'D3')]: { mode: 'output', level: 'LOW' } } });
    expect(wrong.diagnostics).toContainEqual({ code: 'boot-sensitive-pin', severity: 'warning', componentIds: ['b'], pinIds: ['D3'] });
  });
  it('supports input pull-up and undefined logic between digital thresholds', () => {
    const project = circuit([piece('arduino-uno', 'b')], []);
    expect(evaluateCircuit(project, { gpio: { [pinKey('b', 'D1')]: { mode: 'input-pullup', level: 'FLOATING' } } }).pins[pinKey('b', 'D1')]?.voltage).toBeCloseTo(5);
    const middleSource: ElectronicComponent = { ...source, properties: { voltage: 2 } };
    const middle = circuit([middleSource, piece('arduino-uno', 'b')], [['s', 'positive', 'b', 'D1'], ['s', 'negative', 'b', 'GND']]);
    expect(evaluateCircuit(middle).pins[pinKey('b', 'D1')]?.logic).toBe('UNDEFINED');
  });
  it('rejects ESP GPIO16 internal pull-up, which that pin does not provide', () => {
    const project = circuit([piece('esp8266', 'b')], []);
    const result = evaluateCircuit(project, { gpio: { [pinKey('b', 'D0')]: { mode: 'input-pullup', level: 'FLOATING' } } });
    expect(result.diagnostics).toContainEqual({ code: 'invalid-input', severity: 'error', componentIds: ['b'], pinIds: ['D0'] });
    expect(result.pins[pinKey('b', 'D0')]?.voltage).toBeUndefined();
  });
  it('uses one drive per UNO GPIO including A4/SDA aliases and rejects conflicts', () => {
    expect(gpioPins('arduino-uno').map((pin) => pin.id)).toContain('A4');
    expect(gpioPins('arduino-uno')).toHaveLength(20);
    const project = circuit([piece('arduino-uno', 'b'), resistor], [['b', 'SDA', 'r', '1'], ['r', '2', 'b', 'GND']]);
    const result = evaluateCircuit(project, { gpio: { [pinKey('b', 'SDA')]: { mode: 'output', level: 'HIGH' } } });
    expect(result.components.r?.current).toBeCloseTo(5 / 370, 10);
    expect(result.pins[pinKey('b', 'A4')]?.voltage).toBeCloseTo(result.pins[pinKey('b', 'SDA')]?.voltage ?? 0);
    const conflict = evaluateCircuit(project, { gpio: { [pinKey('b', 'SDA')]: { mode: 'output', level: 'HIGH' }, [pinKey('b', 'A4')]: { mode: 'output', level: 'LOW' } } });
    expect(conflict.diagnostics.some((issue) => issue.code === 'invalid-input')).toBe(true);
  });
  it('resets transient controls by supplying empty inputs and preserves serialization', () => {
    const project = gpioLed(); const json = serializeProject(project);
    expect(evaluateCircuit(project, output('HIGH')).components.l?.brightness).toBeGreaterThan(0);
    expect(evaluateCircuit(project, {}).components.l?.brightness).toBe(0);
    expect(serializeProject(project)).toBe(json);
    expect(parseProject(json)).toEqual(project);
    expect(json).not.toContain('brightness');
  });
  it('does not mistake a valid zero-current closed path for an open circuit', () => {
    const zero: ElectronicComponent = { ...source, properties: { voltage: 0 } };
    const project = circuit([zero, resistor], [['s', 'positive', 'r', '1'], ['r', '2', 's', 'negative']]);
    expect(evaluateCircuit(project).components.r?.current).toBe(0);
    expect(evaluateCircuit(project).diagnostics.some((issue) => issue.code === 'open-circuit')).toBe(false);
  });
  it('rejects indeterminate current for an ideal source exactly equal to LED Vf', () => {
    const two: ElectronicComponent = { ...source, properties: { voltage: 2 } };
    const project = circuit([two, piece('led', 'l')], [['s', 'positive', 'l', 'anode'], ['s', 'negative', 'l', 'cathode']]);
    expect(evaluateCircuit(project).diagnostics.some((issue) => issue.code === 'unsupported-network')).toBe(true);
    expect(evaluateCircuit(project).components.l?.current).toBeUndefined();
    expect(evaluateCircuit(project).components.l?.brightness).toBe(0);
  });
});
