import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './store';
import {
  decodePersistedProject,
  migratePersistedProject,
  PERSIST_KEY,
  RECOVERY_KEY,
} from './persistence';
import type { ProjectStorage } from './persistence';
import { createProject, serializeProject, STORAGE_KEY } from '../model/project';
import { nameChanged, projectReplaced, viewportChanged } from '../features/project/projectSlice';
import { projectWithData } from '../test/fixtures';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: ProjectStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { storage, values };
}
const applications: ReturnType<typeof createAppStore>[] = [];
async function open(storage: ProjectStorage) {
  const app = createAppStore(storage);
  applications.push(app);
  await new Promise<void>((resolve) => {
    if (app.persistor.getState().bootstrapped) {
      resolve();
      return;
    }
    const unsubscribe = app.persistor.subscribe(() => {
      if (app.persistor.getState().bootstrapped) {
        unsubscribe();
        resolve();
      }
    });
  });
  return app;
}
afterEach(async () => {
  for (const app of applications.splice(0)) {
    await app.persistor.flush();
    app.persistor.pause();
  }
  vi.restoreAllMocks();
});
describe('Redux Toolkit + Redux Persist', () => {
  it('recovers the entire project in a new store and excludes transient state', async () => {
    const { storage, values } = memoryStorage();
    const first = await open(storage);
    const project = projectWithData();
    first.store.dispatch(projectReplaced(project));
    expect(await first.saveNow()).toBe(true);
    first.persistor.pause();
    const raw = values.get(PERSIST_KEY);
    if (!raw) throw new Error('Persistence did not write');
    expect(Object.keys(JSON.parse(raw))).toEqual(['document', '_persist']);
    for (const key of [
      'saveStatus',
      'restoreIssue',
      'restored',
      'selection',
      'simulationActive',
      'wifi',
      'httpRequests',
    ])
      expect(raw).not.toContain(`"${key}"`);
    const second = await open(storage);
    expect(second.store.getState().project.document).toEqual(project);
    expect(second.store.getState().project.restored).toBe(true);
  });
  it('automatically writes updates without needing an explicit save', async () => {
    const { storage, values } = memoryStorage();
    const app = await open(storage);
    app.store.dispatch(nameChanged('Automatic save'));
    app.store.dispatch(viewportChanged({ zoom: 1.5, offset: { x: 22, y: -19 } }));
    await vi.waitFor(
      () => {
        const raw = values.get(PERSIST_KEY);
        expect(raw && decodePersistedProject(raw).document.name).toBe('Automatic save');
      },
      { timeout: 2000 },
    );
    expect(app.store.getState().project.saveStatus).toBe('saved');
  });
  it('migrates the original manual localStorage key without deleting it', async () => {
    const project = projectWithData();
    const legacy = serializeProject(project);
    const { storage, values } = memoryStorage({ [STORAGE_KEY]: legacy });
    const app = await open(storage);
    expect(app.store.getState().project.document).toEqual(project);
    await app.saveNow();
    expect(values.has(PERSIST_KEY)).toBe(true);
    expect(values.get(STORAGE_KEY)).toBe(legacy);
  });
  it('migrates storage v0 to v1 and discards unknown root state', async () => {
    const project = projectWithData();
    const envelope = JSON.stringify({
      project: JSON.stringify(project),
      selection: JSON.stringify(['esp-reference']),
      _persist: JSON.stringify({ version: 0, rehydrated: true }),
    });
    const { storage } = memoryStorage({ [PERSIST_KEY]: envelope });
    const app = await open(storage);
    expect(app.store.getState().project.document).toEqual(project);
    expect(app.store.getState().project._persist.version).toBe(1);
    expect(app.store.getState().project).not.toHaveProperty('selection');
  });
  it.each([
    '{invalid',
    JSON.stringify({
      document: JSON.stringify(createProject()),
      _persist: JSON.stringify({ version: 99 }),
    }),
  ])('backs up invalid/future state before recovering', async (raw) => {
    const { storage, values } = memoryStorage({ [PERSIST_KEY]: raw });
    const app = await open(storage);
    expect(app.store.getState().project.restoreIssue).toBe(true);
    expect(values.get(RECOVERY_KEY)).toBe(raw);
    expect(app.store.getState().project.document.components).toHaveLength(3);
    await app.saveNow();
    expect(values.get(RECOVERY_KEY)).toBe(raw);
  });
  it('does not overwrite invalid input if creating its recovery backup fails', async () => {
    const raw = '{invalid';
    const { storage, values } = memoryStorage({ [PERSIST_KEY]: raw });
    const originalSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === RECOVERY_KEY) throw new Error('quota');
      originalSet(key, value);
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await open(storage);
    expect(await app.saveNow()).toBe(false);
    expect(values.get(PERSIST_KEY)).toBe(raw);
  });
  it('reports unavailable storage without crashing and can retry writes', async () => {
    const { storage } = memoryStorage();
    const originalSet = storage.setItem;
    storage.setItem = () => {
      throw new Error('quota');
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await open(storage);
    expect(await app.saveNow()).toBe(false);
    expect(app.store.getState().project.saveStatus).toBe('error');
    storage.setItem = originalSet;
    expect(await app.saveNow()).toBe(true);
    expect(app.store.getState().project.saveStatus).toBe('saved');
  });
  it('rejects unsupported versions and invalid migrated documents', () => {
    expect(() =>
      migratePersistedProject({ document: createProject(), _persist: { version: 99 } }),
    ).toThrow('unsupported-storage-version');
    expect(() =>
      migratePersistedProject({ document: { version: 1 }, _persist: { version: 1 } }),
    ).toThrow();
  });
});
