import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { projectExamples } from '../model/exampleProjects';
import { examplePaths, findLocalProject, localProjectPath, parseProjectRoute } from './projectRoutes';
import { preserveBeforeExample } from '../features/examples/replacement';

function storage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; }, clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); }, key: (index) => [...entries.keys()][index] ?? null,
  };
}
describe('project route identities', () => {
  it('assigns every curated template a unique readable route independent of its translated name', () => {
    expect(examplePaths['esp-chat-led']).toBe('/esp8266-led-telegram');
    expect(new Set(Object.values(examplePaths)).size).toBe(projectExamples.length);
    for (const example of projectExamples) {
      expect(parseProjectRoute(examplePaths[example.id])).toEqual({ kind: 'example', id: example.id });
      expect(parseProjectRoute(`${examplePaths[example.id]}/`)).toEqual({ kind: 'example', id: example.id });
    }
    expect(parseProjectRoute('/')).toEqual({ kind: 'home' });
    expect(parseProjectRoute('/new')).toEqual({ kind: 'new' });
  });
  it('rejects unknown, extra-segment and malformed encoded routes', () => {
    for (const path of ['/unknown', '/new/extra', '/local/name/%E0%A4%A', '/local/name/id/extra', '//'])
      expect(parseProjectRoute(path)).toEqual({ kind: 'missing' });
  });
  it('keeps duplicate names, reserved names and snapshot revisions separate from public URLs', () => {
    const first = localProjectPath('ESP8266 LED Telegram', 'first');
    const second = localProjectPath('ESP8266 LED Telegram', 'second');
    expect(first).not.toBe(second);
    expect(first).toBe('/local/esp8266-led-telegram/first');
    expect(localProjectPath('Árbol / Prueba', 'a/b:c')).toBe('/local/arbol-prueba/a%2Fb%3Ac');
    expect(parseProjectRoute(localProjectPath('', 'a/b:c'))).toEqual({ kind: 'local', token: 'a/b:c' });
    const local = storage(), current = createEmptyProject('Current');
    const old = createEmptyProject('Duplicate'), newer = { ...old, name: 'Changed' };
    const key1 = preserveBeforeExample(local, old, 'one');
    const key2 = preserveBeforeExample(local, newer, 'two');
    expect(findLocalProject(local, key1, current)).toEqual(old);
    expect(findLocalProject(local, key2, current)).toEqual(newer);
    expect(findLocalProject(local, old.id, current)).toEqual(newer);
    expect(findLocalProject(local, current.id, current)).toBe(current);
    expect(findLocalProject(storage(), old.id, current)).toBeNull();
    expect(local.length).toBe(2);
  });
});
