import { describe, expect, it } from 'vitest';
import { createProject } from '../../model/project';
import { createComponent } from '../../model/components';
import {
  editorCommandApplied,
  nameChanged,
  projectReducer,
  projectReplaced,
  redoApplied,
  undoApplied,
  viewportChanged,
} from './projectSlice';

describe('editor undo and redo', () => {
  it('records an entire multi-component drag as one command and restores it atomically', () => {
    const initial = projectReducer(undefined, projectReplaced(createProject('history')));
    const moved = projectReducer(
      initial,
      editorCommandApplied({
        type: 'move',
        positions: { 'uno-reference': { x: 300, y: 400 }, 'esp-reference': { x: 700, y: 500 } },
      }),
    );
    expect(moved.history.past).toHaveLength(1);
    expect(initial.document.components[0]?.position).toEqual({ x: 95, y: 145 });
    const undone = projectReducer(moved, undoApplied());
    expect(undone.document).toEqual(initial.document);
    expect(undone.history.future).toHaveLength(1);
    expect(projectReducer(undone, redoApplied()).document).toEqual(moved.document);
  });
  it('undoes additions, rotation, property changes, wires and deletion in order', () => {
    const initial = projectReducer(undefined, projectReplaced(createProject('sequence')));
    let state = projectReducer(
      initial,
      editorCommandApplied({
        type: 'add',
        component: createComponent('led', { x: 800, y: 300 }, 'led'),
      }),
    );
    state = projectReducer(state, editorCommandApplied({ type: 'rotate', ids: ['led'] }));
    state = projectReducer(
      state,
      editorCommandApplied({
        type: 'properties',
        id: 'led',
        update: { kind: 'led', properties: { color: 'green' } },
      }),
    );
    state = projectReducer(
      state,
      editorCommandApplied({
        type: 'add-wire',
        wire: {
          id: 'wire',
          from: { componentId: 'esp-reference', pinId: 'D1' },
          to: { componentId: 'led', pinId: 'anode' },
          color: '#ff0000',
          waypoints: [],
        },
      }),
    );
    const connected = state.document;
    state = projectReducer(
      state,
      editorCommandApplied({ type: 'delete', componentIds: ['led'], wireIds: [] }),
    );
    state = projectReducer(state, undoApplied());
    expect(state.document).toEqual(connected);
    for (let i = 0; i < 4; i++) state = projectReducer(state, undoApplied());
    expect(state.document).toEqual(initial.document);
    for (let i = 0; i < 4; i++) state = projectReducer(state, redoApplied());
    expect(state.document).toEqual(connected);
  });
  it('preserves current view and project name when undoing circuit edits', () => {
    let state = projectReducer(
      undefined,
      editorCommandApplied({ type: 'rotate', ids: ['esp-reference'] }),
    );
    state = projectReducer(state, nameChanged('Renamed'));
    state = projectReducer(state, viewportChanged({ zoom: 1.4, offset: { x: 10, y: 20 } }));
    state = projectReducer(state, undoApplied());
    expect(state.document.name).toBe('Renamed');
    expect(state.document.viewport.zoom).toBe(1.4);
    expect(state.document.components.find((item) => item.id === 'esp-reference')?.rotation).toBe(0);
  });
  it('clears redo after a new edit and excludes no-op commands', () => {
    const initial = projectReducer(undefined, { type: 'test/init' });
    expect(
      projectReducer(initial, editorCommandApplied({ type: 'move', positions: {} })).history.past,
    ).toHaveLength(0);
    let state = projectReducer(
      initial,
      editorCommandApplied({ type: 'rotate', ids: ['esp-reference'] }),
    );
    state = projectReducer(state, undoApplied());
    state = projectReducer(
      state,
      editorCommandApplied({ type: 'delete', componentIds: ['uno-reference'], wireIds: [] }),
    );
    expect(state.history.future).toHaveLength(0);
    const reset = projectReducer(state, projectReplaced(createProject()));
    expect(reset.history.past).toHaveLength(0);
  });
  it('bounds history to 50 commands', () => {
    let state = projectReducer(undefined, { type: 'test/init' });
    for (let i = 0; i < 60; i++)
      state = projectReducer(
        state,
        editorCommandApplied({ type: 'move', positions: { 'esp-reference': { x: i, y: i } } }),
      );
    expect(state.history.past).toHaveLength(50);
  });
});
