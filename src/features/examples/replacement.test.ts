import { describe, expect, it } from 'vitest';
import { createProject, parseProject } from '../../model/project';
import { EXAMPLE_BACKUP_PREFIX, preserveBeforeExample } from './replacement';

describe('preservation before replacing the active project', () => {
  it('stores project-only immutable snapshots without overwriting any saved project or previous snapshot', () => {
    const values = new Map<string, string>([['persist:mesa.project', 'active bytes'], ['mesa.project.v1', 'legacy bytes']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const project = createProject('original');
    const first = preserveBeforeExample(storage, project, 'first');
    project.name = 'Edited';
    preserveBeforeExample(storage, project, 'second');
    expect(parseProject(values.get(first) ?? '').name).toBe('');
    expect(parseProject(values.get(`${EXAMPLE_BACKUP_PREFIX}second`) ?? '').name).toBe('Edited');
    expect(values.get('persist:mesa.project')).toBe('active bytes');
    expect(values.get('mesa.project.v1')).toBe('legacy bytes');
    expect(() => preserveBeforeExample(storage, project, 'first')).toThrow('example-backup-exists');
  });
  it('reports unavailable storage instead of silently losing the current document', () => {
    const project = createProject('retained');
    expect(() => preserveBeforeExample({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, project)).toThrow('quota');
    expect(project.id).toBe('retained');
  });
});
