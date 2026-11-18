import { describe, expect, it } from 'vitest';
import { createAppStore } from './store';
import { PERSIST_KEY } from './persistence';
import type { ProjectStorage } from './persistence';
import { createExampleProject } from '../model/exampleProjects';
import { projectReplaced, editorCommandApplied, undoApplied, redoApplied } from '../features/project/projectSlice';
import { initialSimulation, transitionSimulation } from '../features/simulation/runtime';

describe('motor circuit persistence and history', () => {
  it('rehydrates the wired DIP and properties, preserving undo/redo and excluding simulation state', async () => {
    const values = new Map<string, string>();
    const storage: ProjectStorage = { getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
    const open = async () => {
      const app = createAppStore(storage);
      await new Promise<void>((resolve) => {
        if (app.persistor.getState().bootstrapped) return resolve();
        const unsubscribe = app.persistor.subscribe(() => {
          if (app.persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
        });
      });
      return app;
    };
    const first = await open();
    const document = createExampleProject('motor-l293d', 'Motor DC con puente H L293D', 'persist-motor');
    try {
      first.store.dispatch(projectReplaced(document));
      first.store.dispatch(editorCommandApplied({ type: 'properties', id: 'battery', update: { kind: 'battery-9v', properties: { voltage: 9, internalResistance: 5, maxCurrent: .4 } } }));
      const edited = first.store.getState().project.document;
      first.store.dispatch(undoApplied()); expect(first.store.getState().project.document).toEqual(document);
      first.store.dispatch(redoApplied()); expect(first.store.getState().project.document).toEqual(edited);
      const runtime = transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source: edited.programs[0]?.source ?? '' }, edited);
      expect(runtime.snapshot?.components.motor?.motor?.direction).toBe('forward');
      expect(await first.saveNow()).toBe(true);
      first.persistor.pause();
      const raw = values.get(PERSIST_KEY);
      if (!raw) throw new Error('No persisted project');
      expect(Object.keys(JSON.parse(raw))).toEqual(['document', 'cloudLinks', '_persist']);
      expect(raw).not.toMatch(/"(?:snapshot|firmware|motor|speed|condition|gpio|buttons)"\s*:/);
      const second = await open();
      try {
        expect(second.store.getState().project.document).toEqual(edited);
        expect(second.store.getState().project.history).toEqual({ past: [], future: [] });
        expect(initialSimulation().snapshot).toBeNull();
      } finally { await second.persistor.flush(); second.persistor.pause(); }
    } finally { await first.persistor.flush(); first.persistor.pause(); }
  });
});
