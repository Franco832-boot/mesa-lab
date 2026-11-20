import { describe, expect, it } from 'vitest';
import { createExampleProject } from './exampleProjects';
import { initialSimulation, transitionSimulation } from '../features/simulation/runtime';
import { nextFirmwareDelay } from '../features/simulation/firmwareRuntime';
import { applyEditorCommand } from './editor';
import { parseProject, serializeProject } from './project';
import type { CircuitProject } from './types';

const examples = ['lcd16-parallel','lcd20-parallel','lcd16-i2c','lcd20-i2c'] as const;
function run(project: CircuitProject) {
  let state = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source: project.programs[0]?.source ?? '' }, project);
  for (let count = 0; nextFirmwareDelay(state) === 0; count++) {
    if (count > 1000) throw new Error('Unexpected unfinished peripheral slice');
    state = transitionSimulation(state, { type: 'firmware-advance', elapsedMs: 0 }, project);
  }
  return state;
}
describe('four executable LCD educational templates', () => {
  it('updates visible contrast from a live potentiometer without changing the controller memory', () => {
    const project = createExampleProject('lcd16-parallel', 'Live contrast');
    const initial = run(project), memory = initial.inputs.lcd?.lcd?.memory;
    const dark = transitionSimulation(initial, { type: 'potentiometer', componentId: 'contrast', ratio: 0 }, project);
    expect(dark.snapshot?.components.lcd?.lcd?.lines[0]).toBe(' '.repeat(16));
    expect(dark.inputs.lcd?.lcd?.memory).toBe(memory);
    const visible = transitionSimulation(dark, { type: 'potentiometer', componentId: 'contrast', ratio: 1 }, project);
    expect(visible.snapshot?.components.lcd?.lcd?.lines[0]?.trim()).toBe('Los Profes');
    expect(visible.inputs.lcd?.lcd?.memory).toBe(memory);
  });
  it.each(examples)('%s displays its sketch through the actual complete circuit', (id) => {
    const project = createExampleProject(id, 'LCD example'), saved = serializeProject(project), state = run(project);
    const view = state.snapshot?.components.lcd?.lcd;
    expect(state.firmware.uno?.error).toBeNull();
    expect(view?.powered).toBe(true);
    expect(view?.lines[0]?.trim()).toBe(id.startsWith('lcd16') ? 'Los Profes' : 'Los Profes Para Vos');
    if (id.startsWith('lcd16')) expect(view?.lines[1]?.trim()).toBe('Para Vos');
    expect(view?.rows).toBe(id.startsWith('lcd16') ? 2 : 4);
    expect(view?.columns).toBe(id.startsWith('lcd16') ? 16 : 20);
    expect(view?.connection).toBe(id.endsWith('i2c') ? 'i2c' : 'parallel');
    expect(view?.backlight).toBeCloseTo((2/220)/.02, 10);
    expect(view?.contrast).toBeCloseTo(.5, 10);
    if (view?.rows === 4) expect(view.lines[3]?.trim()).toBe('HD44780');
    expect(serializeProject(project)).toBe(saved);
    expect(parseProject(saved)).toEqual(project);
    const rotated = applyEditorCommand(project, { type: 'rotate', ids: ['lcd'] });
    expect(run(rotated).snapshot?.components.lcd?.lcd?.lines).toEqual(view?.lines);
    expect(rotated.wires).toEqual(project.wires);
  });
  it.each(examples)('%s loses the displayed text when its breadboard supply feed is disconnected', (id) => {
    const project = createExampleProject(id, 'Power fault');
    project.wires = project.wires.filter((wire) => wire.id !== 'power');
    const view = run(project).snapshot?.components.lcd?.lcd;
    expect(view?.powered).toBe(false);
    expect(view?.lines.every((line) => line.trim() === '')).toBe(true);
  });
  it.each(['lcd16-parallel','lcd16-i2c'] as const)('%s changes contrast through an electrical divider, not an editable text property', (id) => {
    const project = createExampleProject(id, 'Contrast');
    const dark = applyEditorCommand(project, id.endsWith('i2c')
      ? { type: 'properties', id: 'adapter', update: { kind: 'pcf8574', properties: { address: 39, contrast: 0 } } }
      : { type: 'properties', id: 'contrast', update: { kind: 'potentiometer', properties: { resistance: 10000, ratio: 0 } } });
    const state = run(dark);
    expect(state.snapshot?.components.lcd?.lcd?.contrast).toBe(0);
    expect(state.snapshot?.components.lcd?.lcd?.lines.every((line) => line.trim() === '')).toBe(true);
    expect(state.inputs.lcd?.lcd?.memory[0]).toBe(76); // 'L' still exists in DDRAM.
  });
});
