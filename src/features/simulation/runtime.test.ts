import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { createProject, parseProject, serializeProject } from '../../model/project';
import { initialSimulation, transitionSimulation } from './runtime';
import { pinKey } from '../../sim/topology';

const project = () => ({
  ...createProject('runtime'),
  components: [createComponent('arduino-uno', { x: 0, y: 0 }, 'uno'), createComponent('pushbutton', { x: 100, y: 100 }, 'button')],
});
describe('transient simulation lifecycle', () => {
  it('starts, freezes while paused, ignores paused controls, and resumes deterministically', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'gpio', componentId: 'uno', pinId: 'D13', state: { mode: 'output', level: 'HIGH' } }, doc);
    expect(state.snapshot?.pins[pinKey('uno', 'D13')]?.voltage).toBeCloseTo(5);
    state = transitionSimulation(state, { type: 'pause' }, doc);
    const frozen = state;
    state = transitionSimulation(state, { type: 'gpio', componentId: 'uno', pinId: 'D13', state: { mode: 'output', level: 'LOW' } }, doc);
    expect(state).toBe(frozen);
    state = transitionSimulation(state, { type: 'start' }, doc);
    expect(state.status).toBe('running');
    expect(state.snapshot?.pins[pinKey('uno', 'D13')]?.voltage).toBeCloseTo(5);
  });
  it.each(['stop', 'reset'] as const)('%s clears results and overrides without changing serialized project', (type) => {
    const doc = project(), before = serializeProject(doc);
    let state = transitionSimulation(initialSimulation(), { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'button', componentId: 'button', pressed: true }, doc);
    state = transitionSimulation(state, { type: 'gpio', componentId: 'uno', pinId: 'D13', state: { mode: 'output', level: 'HIGH' } }, doc);
    state = transitionSimulation(state, { type }, doc);
    expect(state).toEqual(initialSimulation());
    expect(serializeProject(doc)).toBe(before);
    expect(parseProject(before)).toEqual(doc);
    expect(transitionSimulation(state, { type: 'start' }, doc).snapshot?.pins[pinKey('uno', 'D13')]?.logic).toBe('FLOATING');
  });
  it('releases a held momentary button across pause, retaining frozen readings', () => {
    const doc = project();
    let state = transitionSimulation(initialSimulation(), { type: 'start' }, doc);
    state = transitionSimulation(state, { type: 'button', componentId: 'button', pressed: true }, doc);
    const snapshot = state.snapshot;
    state = transitionSimulation(state, { type: 'pause' }, doc);
    expect(state.snapshot).toBe(snapshot);
    expect(state.inputs.buttons).toEqual({});
    expect(transitionSimulation(state, { type: 'start' }, doc).inputs.buttons).toEqual({});
  });
  it('ignores controls while stopped and avoids duplicate evaluations for identical inputs', () => {
    const doc = project(), stopped = initialSimulation();
    expect(transitionSimulation(stopped, { type: 'button', componentId: 'button', pressed: true }, doc)).toBe(stopped);
    const running = transitionSimulation(stopped, { type: 'start' }, doc);
    expect(transitionSimulation(running, { type: 'start' }, doc)).toBe(running);
    expect(transitionSimulation(running, { type: 'button', componentId: 'button', pressed: false }, doc)).toBe(running);
  });
});
