import { compileProjectFiles } from '../firmware/projectCompiler';
import { sourceFiles } from './programFiles';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createExampleProject, projectExamples, availableExampleCategories } from './exampleProjects';
import { parseProject, serializeProject } from './project';
import { compileArduinoSubset } from '../firmware/uno';
import { initialSimulation, transitionSimulation } from '../features/simulation/runtime';
import type { SimulationState } from '../features/simulation/runtime';
import { nextFirmwareDelay } from '../features/simulation/firmwareRuntime';
import type { CircuitProject } from './types';
import { applyEditorCommand } from './editor';
import { canInsert } from './breadboard';
import { componentDefinitions } from './components';
import { phase1Source } from '../test/phase1';

function start(project: CircuitProject, source = project.programs[0]?.source ?? '') {
  return transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: project.programs[0]?.componentId ?? 'uno', source }, project);
}
function advance(state: SimulationState, project: CircuitProject, elapsedMs: number) {
  let next = transitionSimulation(state, { type: 'firmware-advance', elapsedMs }, project);
  for (let count = 0; nextFirmwareDelay(next) === 0; count++) {
    if (count > 10000) throw new Error('Unexpected non-terminating time slice');
    next = transitionSimulation(next, { type: 'firmware-advance', elapsedMs: 0 }, project);
  }
  return next;
}
const brightness = (state: SimulationState) => state.snapshot?.components.led?.brightness;
describe('ordinary v1 educational project templates', () => {
  it.each(projectExamples)('$id has a complete validated circuit, mounted real terminals and a compilable sketch', (example) => {
    const project = createExampleProject(example.id, 'Example', 'test-template');
    expect(new Set(project.components.map((part) => part.kind))).toEqual(new Set(example.components));
    expect(new Set(project.components.map((part) => part.id)).size).toBe(project.components.length);
    expect(project.components.find((part) => part.kind === 'breadboard')).toBeDefined();
    for (const part of project.components.filter((part) => canInsert(part.kind))) expect(part.attachments).toHaveLength(componentDefinitions[part.kind].pins.length);
    expect(parseProject(serializeProject(project))).toEqual(project);
    if (example.components.some((kind) => kind === 'esp8266')) expect(() => compileProjectFiles(sourceFiles(project.programs[0]), 'esp8266')).not.toThrow();
    else expect(() => compileArduinoSubset(project.programs[0]?.source ?? '')).not.toThrow();
    expect(start(project).firmware[project.programs[0]?.componentId ?? 'uno']?.error).toBeNull();
  });
  it('keeps template instances independent and old project documents compatible', () => {
    const first = createExampleProject('dht11', 'First');
    const second = createExampleProject('dht11', 'Second');
    expect(first.id).not.toBe(second.id);
    first.wires.splice(0); first.components[0] && (first.components[0].position.x = 999);
    expect(second.wires).toHaveLength(3);
    expect(second.components[0]?.position.x).toBe(80);
    expect(availableExampleCategories).toEqual(['communication', 'sensors', 'basics', 'displays']);
    expect(parseProject(serializeProject(parseProject(phase1Source)))).toEqual(parseProject(phase1Source));
  });
  it('reuses the existing millis sketch and drives the actual LED at exact virtual second boundaries', () => {
    const project = createExampleProject('led-millis', 'Millis');
    expect(project.programs[0]?.source).toBe(readFileSync(new URL('../../examples/arduino/blink-without-delay.ino', import.meta.url), 'utf8'));
    let state = start(project);
    expect(brightness(state)).toBe(0);
    state = advance(state, project, 999); expect(brightness(state)).toBe(0);
    state = advance(state, project, 1); expect(state.snapshot?.components.led?.current).toBeCloseTo(3 / (330 + 40), 10);
    expect(brightness(state)).toBeCloseTo((3 / 370) / .02, 10);
    state = advance(state, project, 1000); expect(brightness(state)).toBe(0);
    state = advance(state, project, 1000); expect(brightness(state)).toBeGreaterThan(0);
    const faster = project.programs[0]?.source.replace('1000UL', '500UL');
    expect(brightness(advance(start(project, faster), project, 500))).toBeGreaterThan(0);
  });
  it('runs the actual for sequence through the GPIO and electrical solver', () => {
    const project = createExampleProject('led-for', 'For');
    let state = start(project);
    expect(brightness(state)).toBeCloseTo((3 / 370) / .02, 10);
    for (const expected of [0, 1, 0, 1, 0]) {
      state = advance(state, project, 300);
      expect(brightness(state)).toBeCloseTo(expected * (3 / 370) / .02, 10);
    }
    state = advance(state, project, 1799); expect(brightness(state)).toBe(0);
    state = advance(state, project, 1); expect(brightness(state)).toBeGreaterThan(0);
  });
  it.each(['led-millis', 'led-for'] as const)('%s stops lighting when the code pin mismatches the wire or the return wire is removed', (id) => {
    const project = createExampleProject(id, 'Experiment');
    const wrongPin = project.programs[0]?.source.replace(id === 'led-millis' ? 'LED_BUILTIN' : 'ledPin = 8', id === 'led-millis' ? '8' : 'ledPin = 7');
    expect(brightness(advance(start(project, wrongPin), project, 1000))).toBe(0);
    const unplugged = { ...project, wires: project.wires.filter((wire) => wire.id !== 'led-ground') };
    expect(brightness(advance(start(unplugged), unplugged, 1000))).toBe(0);
  });
  it('prints DHT readings from the mounted module and follows saved/live environment edits', () => {
    const project = createExampleProject('dht11', 'DHT');
    expect(project.components.some((part) => part.kind === 'resistor')).toBe(false);
    let state = advance(start(project), project, 2000);
    expect(state.firmware.uno?.execution?.serial.output).toBe('Humedad: 50.00 %  |  Temperatura: 25.00 °C\r\n');
    state = transitionSimulation(state, { type: 'dht11', componentId: 'sensor', temperature: 32, humidity: 70 }, project);
    state = advance(state, project, 2000);
    expect(state.firmware.uno?.execution?.serial.output).toContain('Humedad: 70.00 %  |  Temperatura: 32.00 °C');
    const edited = applyEditorCommand(project, { type: 'properties', id: 'sensor', update: { kind: 'dht11', properties: { temperature: 18, humidity: 63 } } });
    expect(advance(start(edited), edited, 2000).firmware.uno?.execution?.serial.output).toContain('Humedad: 63.00 %  |  Temperatura: 18.00 °C');
    expect(transitionSimulation(state, { type: 'reset' }, project)).toEqual(initialSimulation());
  });
  it.each(['sensor-data', 'sensor-vcc', 'sensor-ground'])('rejects DHT readings when %s is unplugged', (id) => {
    const project = createExampleProject('dht11', 'Fault'); project.wires = project.wires.filter((wire) => wire.id !== id);
    expect(advance(start(project), project, 2000).firmware.uno?.execution?.serial.output).toBe('Fallo al leer del sensor DHT11\r\n');
  });
});
