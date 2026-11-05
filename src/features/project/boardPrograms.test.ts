import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { createProject, parseProject, serializeProject } from '../../model/project';
import { applyEditorCommand } from '../../model/editor';
import { editorCommandApplied, projectReducer, projectReplaced, redoApplied, undoApplied } from './projectSlice';
import { initialSimulation, transitionSimulation } from '../simulation/runtime';

const fixture = () => ({ ...createProject('code'), components: [
  createComponent('arduino-uno', { x: 10, y: 20 }, 'uno'), createComponent('esp8266', { x: 300, y: 20 }, 'esp'),
  createComponent('resistor', { x: 600, y: 20 }, 'r'),
] });
describe('board-owned code and circuit continuity', () => {
  it('stores independent source per board and roundtrips it in the existing v1 document', () => {
    let project = applyEditorCommand(fixture(), { type: 'program', id: 'uno', source: 'void setup() {}' });
    project = applyEditorCommand(project, { type: 'program', id: 'esp', source: '// virtual networking is separate from firmware' });
    expect(project.programs.map((program) => program.componentId)).toEqual(['uno', 'esp']);
    expect(parseProject(serializeProject(project))).toEqual(project);
    expect(project.programs.every((program) => program.execution === 'unavailable')).toBe(true);
  });
  it('preserves electrical identities, viewport and a running snapshot when source changes', () => {
    const project = fixture();
    const running = transitionSimulation(initialSimulation(), { type: 'start' }, project);
    const edited = applyEditorCommand(project, { type: 'program', id: 'esp', source: '// changed' });
    expect(edited.components).toBe(project.components);
    expect(edited.wires).toBe(project.wires);
    expect(edited.viewport).toBe(project.viewport);
    expect(running.status).toBe('running');
    expect(transitionSimulation(running, { type: 'start' }, edited)).toBe(running);
  });
  it('supports history and rejects non-board targets', () => {
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(projectReplaced(fixture()));
    store.dispatch(editorCommandApplied({ type: 'program', id: 'esp', source: '// saved' }));
    store.dispatch(undoApplied()); expect(store.getState().project.document.programs).toEqual([]);
    store.dispatch(redoApplied()); expect(store.getState().project.document.programs[0]?.source).toBe('// saved');
    expect(() => applyEditorCommand(fixture(), { type: 'program', id: 'r', source: 'bad' })).toThrow('code-target-not-board');
  });
});
