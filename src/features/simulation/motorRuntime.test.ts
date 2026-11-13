import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/exampleProjects';
import { parseProject, serializeProject } from '../../model/project';
import type { CircuitProject } from '../../model/types';
import { initialSimulation, transitionSimulation } from './runtime';
import type { SimulationState } from './runtime';
import { nextFirmwareDelay } from './firmwareRuntime';
import { compileArduinoSubset } from '../../firmware/uno';

const project = () => createExampleProject('motor-l293d', 'Control de motor DC con L293D y millis()', 'motor-example');
function start(document: CircuitProject) {
  return transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source: document.programs[0]?.source ?? '' }, document);
}
function advance(state: SimulationState, document: CircuitProject, elapsedMs: number) {
  let result = transitionSimulation(state, { type: 'firmware-advance', elapsedMs }, document);
  for (let count = 0; nextFirmwareDelay(result) === 0; count++) {
    if (count > 10000) throw new Error('Unfinished time slice');
    result = transitionSimulation(result, { type: 'firmware-advance', elapsedMs: 0 }, document);
  }
  expect(result.firmware.uno?.error).toBeNull();
  return result;
}
const direction = (state: SimulationState) => state.snapshot?.components.motor?.motor?.direction;
describe('actual millis motor sketch, through physical breadboard contacts', () => {
  it('runs the exact saved sketch through 3/1/3 second boundaries and repeats', () => {
    const document = project(), saved = serializeProject(document);
    const source = document.programs[0]?.source ?? '';
    expect(source).toBe(readFileSync(new URL('../../../examples/arduino/motor-l293d-millis.ino', import.meta.url), 'utf8'));
    expect(source).not.toMatch(/\bdelay\s*\(/);
    let state = start(document);
    expect(state.firmware.uno?.error).toBeNull();
    expect(direction(state)).toBe('forward');
    expect(state.snapshot?.diagnostics).toEqual([]);
    state = advance(state, document, 2999); expect(direction(state)).toBe('forward');
    state = advance(state, document, 1); expect(direction(state)).toBe('stopped');
    state = advance(state, document, 999); expect(direction(state)).toBe('stopped');
    state = advance(state, document, 1); expect(direction(state)).toBe('reverse');
    state = advance(state, document, 2999); expect(direction(state)).toBe('reverse');
    state = advance(state, document, 1); expect(direction(state)).toBe('forward');
    state = advance(state, document, 3000); expect(direction(state)).toBe('stopped');
    state = advance(state, document, 1000); expect(direction(state)).toBe('reverse');
    expect(serializeProject(document)).toBe(saved);
    expect(parseProject(saved)).toEqual(document);
  });
  it('supports code edits, pause/resume and deterministic stop/reset without persisting runtime', () => {
    const document = project();
    const program = document.programs[0];
    if (!program) throw new Error('fixture');
    program.source = program.source.replaceAll('3000UL', '500UL');
    const saved = serializeProject(document);
    let state = advance(start(document), document, 499);
    expect(direction(state)).toBe('forward');
    state = transitionSimulation(state, { type: 'pause' }, document);
    const paused = state;
    expect(transitionSimulation(state, { type: 'firmware-advance', elapsedMs: 10000 }, document)).toBe(paused);
    state = transitionSimulation(state, { type: 'start' }, document);
    state = advance(state, document, 1);
    expect(direction(state)).toBe('stopped');
    expect(serializeProject(document)).toBe(saved);
    expect(transitionSimulation(state, { type: 'reset' }, document)).toEqual(initialSimulation());
    expect(transitionSimulation(state, { type: 'stop' }, document)).toEqual(initialSimulation());
    expect(direction(start(document))).toBe('forward');
  });
  it.each(['logic-power', 'logic-ground', 'motor-power', 'motor-ground', 'out1', 'out2', 'dip-ground-0'])('uses actual %s wires without granting code authority over connectivity', (id) => {
    const document = project(); document.wires = document.wires.filter((wire) => wire.id !== id);
    // All ground pins are internally common, so one removed DIP ground wire
    // retains the other three physical return connections.
    const result = start(document);
    expect(result.firmware.uno?.error).toBeNull();
    if (id === 'dip-ground-0') expect(direction(result)).toBe('forward');
    else expect(result.snapshot?.components.motor?.motor?.speed ?? 0).toBe(0);
  });
  it('compiles UNO PWM while rejecting an out-of-range duty', () => {
    expect(() => compileArduinoSubset('void setup(){analogWrite(9, 128);} void loop(){}')).not.toThrow();
    expect(() => compileArduinoSubset('void setup(){analogWrite(9, 256);} void loop(){}')).toThrow();
  });
  it('does not wire battery positive to the Arduino 5V network', () => {
    const document = project();
    const result = start(document).snapshot;
    expect(result?.components.battery?.voltage).toBeGreaterThan(8);
    expect(result?.components.motor?.voltage).toBeGreaterThan(8);
    const directPowerWire = document.wires.some((wire) =>
      (wire.from.componentId === 'battery' && wire.to.componentId === 'uno' && wire.to.pinId === '5V') ||
      (wire.to.componentId === 'battery' && wire.from.componentId === 'uno' && wire.from.pinId === '5V'));
    expect(directPowerWire).toBe(false);
  });
});
