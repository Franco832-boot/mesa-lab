import { describe, expect, it } from 'vitest';
import { createEmptyProject, createProject, parseProject } from '../../model/project';
import { EXAMPLE_BACKUP_PREFIX, listProjectCopies, preserveBeforeExample, readProjectCopy } from './replacement';

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
  it('creates independent empty documents and reopens existing copies without changing their bytes', () => {
    const first = createEmptyProject('First'), second = createEmptyProject('Second');
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ components: [], wires: [], programs: [], name: 'First', version: 1 });
    expect(createProject('reference').components).toHaveLength(3);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
      get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null };
    const original = preserveBeforeExample(storage, first, 'old-existing-copy');
    preserveBeforeExample(storage, first, 'duplicate');
    first.name = 'New revision';
    const revision = preserveBeforeExample(storage, first, 'revision');
    values.set(`${EXAMPLE_BACKUP_PREFIX}malformed`, '{broken');
    values.set('unrelated-private-key', 'not a project');
    const before = [...values];
    const result = listProjectCopies(storage);
    expect(result.copies.map((copy) => copy.name)).toEqual(['First', 'New revision']);
    expect(result.unreadable).toBe(1);
    expect(readProjectCopy(storage, original).name).toBe('First');
    expect(readProjectCopy(storage, revision).name).toBe('New revision');
    expect(() => readProjectCopy(storage, 'unrelated-private-key')).toThrow('invalid-project-copy');
    expect(() => readProjectCopy(storage, `${EXAMPLE_BACKUP_PREFIX}missing`)).toThrow('missing-project-copy');
    expect([...values]).toEqual(before);
    second.components.push(...createProject('example').components);
    expect(first.components).toEqual([]);
  });
});
