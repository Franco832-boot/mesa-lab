import { describe, expect, it } from 'vitest';
import { createProject } from '../../model/project';
import { nameChanged, projectReducer, projectReplaced, viewportChanged } from './projectSlice';

describe('pure project reducers', () => {
  it('produces the same initial state for the same action', () => {
    expect(projectReducer(undefined, { type: 'test/init' })).toEqual(
      projectReducer(undefined, { type: 'test/init' }),
    );
  });
  it('updates the project without mutating its previous state', () => {
    const before = projectReducer(undefined, projectReplaced(createProject('pure-test')));
    const after = projectReducer(before, nameChanged('New name'));
    expect(before.document.name).toBe('');
    expect(after.document.name).toBe('New name');
    expect(after.document.components).toBe(before.document.components);
  });
  it('changes the viewport without recalculating connections or electrical state', () => {
    const before = projectReducer(undefined, { type: 'test/init' });
    const after = projectReducer(before, viewportChanged({ offset: { x: 99, y: 22 }, zoom: 1.25 }));
    expect(after.document.wires).toBe(before.document.wires);
    expect(after.document.components).toBe(before.document.components);
    expect(after.document).not.toHaveProperty('electricalState');
  });
});
