import { expect, expectTypeOf, it } from 'vitest';
import { createAppStore } from './store';
import type { RootState } from './store';
import type { CircuitProject } from '../model/types';
import { createComponent } from '../model/components';
import { createProject } from '../model/project';
import { editorCommandApplied, projectReplaced } from '../features/project/projectSlice';
import { PERSIST_KEY } from './persistence';

it('builds the Phase 2 acceptance circuit and recovers it exactly with no editor history', async () => {
  expectTypeOf<RootState['project']['document']>().toEqualTypeOf<CircuitProject>();
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const first = createAppStore(storage);
  const ready = async (app: ReturnType<typeof createAppStore>) => {
    if (!app.persistor.getState().bootstrapped)
      await new Promise<void>((resolve) => {
        const unsubscribe = app.persistor.subscribe(() => {
          if (app.persistor.getState().bootstrapped) {
            unsubscribe();
            resolve();
          }
        });
      });
  };
  await ready(first);
  first.store.dispatch(projectReplaced({ ...createProject('acceptance'), components: [] }));
  const parts = [
    createComponent('esp8266', { x: 50, y: 50 }, 'esp'),
    createComponent('breadboard', { x: 300, y: 50 }, 'bb'),
    createComponent('led', { x: 400, y: 280 }, 'led'),
    createComponent('resistor', { x: 500, y: 280 }, 'r'),
  ];
  for (const component of parts)
    first.store.dispatch(editorCommandApplied({ type: 'add', component }));
  const connections = [
    { from: { componentId: 'esp', pinId: 'D1' }, to: { componentId: 'bb', pinId: 'a1' } },
    { from: { componentId: 'bb', pinId: 'e1' }, to: { componentId: 'r', pinId: '1' } },
    { from: { componentId: 'r', pinId: '2' }, to: { componentId: 'led', pinId: 'anode' } },
    { from: { componentId: 'led', pinId: 'cathode' }, to: { componentId: 'esp', pinId: 'GND' } },
  ];
  connections.forEach((connection, index) =>
    first.store.dispatch(
      editorCommandApplied({
        type: 'add-wire',
        wire: {
          ...connection,
          id: `wire-${index}`,
          color: '#558855',
          waypoints: [{ x: 200 + index * 25, y: 450 }],
        },
      }),
    ),
  );
  first.store.dispatch(editorCommandApplied({ type: 'rotate', ids: ['esp', 'led'] }));
  first.store.dispatch(
    editorCommandApplied({
      type: 'move',
      positions: { esp: { x: 120, y: 220 }, led: { x: 600, y: 200 } },
    }),
  );
  first.store.dispatch(
    editorCommandApplied({
      type: 'properties',
      id: 'r',
      update: { kind: 'resistor', properties: { resistance: 1000 } },
    }),
  );
  expect(await first.saveNow()).toBe(true);
  first.persistor.pause();
  const expected = first.store.getState().project.document;
  expect(first.store.getState().project.history.past.length).toBeGreaterThan(0);
  const raw = values.get(PERSIST_KEY);
  expect(raw).not.toContain('history');
  const second = createAppStore(storage);
  try {
    await ready(second);
    expect(second.store.getState().project.document).toEqual(expected);
    expect(second.store.getState().project.history).toEqual({ past: [], future: [] });
  } finally {
    await second.persistor.flush();
    second.persistor.pause();
  }
});
