import { describe, expect, it } from 'vitest';
import { createAppStore } from './store';
import { createProject, serializeProject } from '../model/project';
import { createComponent } from '../model/components';
import { editorCommandApplied, projectReplaced, undoApplied, redoApplied } from '../features/project/projectSlice';
import { PERSIST_KEY } from './persistence';
import { transitionSimulation, initialSimulation } from '../features/simulation/runtime';
import { pinKey } from '../sim/topology';
import { potentiometerResistances } from '../model/potentiometer';
import type { CircuitProject } from '../model/types';

async function ready(app: ReturnType<typeof createAppStore>) {
  if (app.persistor.getState().bootstrapped) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = app.persistor.subscribe(() => {
      if (app.persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
}
function divider(): CircuitProject {
  return { ...createProject('direct-knob'), components: [
    createComponent('power-supply', { x: 20, y: 20 }, 'source'),
    createComponent('potentiometer', { x: 500, y: 80 }, 'pot'),
  ], wires: [
    { id: 'positive', from: { componentId: 'source', pinId: 'positive' }, to: { componentId: 'pot', pinId: '1' }, color: '#668c75', waypoints: [] },
    { id: 'negative', from: { componentId: 'pot', pinId: '3' }, to: { componentId: 'source', pinId: 'negative' }, color: '#668c75', waypoints: [] },
  ] };
}

describe('insertion and knob project/runtime integration', () => {
  it('persists explicit lead attachments and saved knob position and recovers without runtime overrides', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); } };
    const first = createAppStore(storage);
    let second: ReturnType<typeof createAppStore> | undefined;
    try {
      await ready(first);
      const document = divider();
      document.components.push(createComponent('breadboard', { x: 40, y: 180 }, 'bb'), createComponent('resistor', { x: 150, y: 80 }, 'r'));
      first.store.dispatch(projectReplaced(document));
      first.store.dispatch(editorCommandApplied({ type: 'place', positions: { r: { x: 136, y: 224 } } }));
      first.store.dispatch(editorCommandApplied({ type: 'properties', id: 'pot', update: {
        kind: 'potentiometer', properties: { resistance: 10000, ratio: 0.75 },
      } }));
      const saved = first.store.getState().project.document;
      expect(saved.components.find((item) => item.id === 'r')?.attachments).toHaveLength(2);
      expect(first.store.getState().project.history.past).toHaveLength(2);
      first.store.dispatch(undoApplied());
      expect(first.store.getState().project.document.components.find((item) => item.kind === 'potentiometer')?.properties).toEqual({ resistance: 10000, ratio: 0.5 });
      first.store.dispatch(redoApplied());
      expect(await first.saveNow()).toBe(true);
      first.persistor.pause();
      const raw = values.get(PERSIST_KEY);
      expect(raw).toContain('attachments');
      second = createAppStore(storage);
      await ready(second);
      expect(second.store.getState().project.document).toEqual(saved);
      expect(second.store.getState().project.history.past).toEqual([]);
      const state = transitionSimulation(initialSimulation(), { type: 'start' }, saved);
      // 25% of the 5 V supply remains between the wiper and terminal 3.
      expect(state.snapshot?.pins[pinKey('pot', 'wiper')]?.voltage).toBeCloseTo(1.25, 10);
    } finally {
      await first.persistor.flush(); first.persistor.pause();
      if (second) { await second.persistor.flush(); second.persistor.pause(); }
    }
  });
  it('reevaluates a 10k divider immediately for each direct-knob runtime input without changing its saved track', () => {
    const document = divider(), before = serializeProject(document);
    let state = transitionSimulation(initialSimulation(), { type: 'start' }, document);
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      state = transitionSimulation(state, { type: 'potentiometer', componentId: 'pot', ratio }, document);
      const segments = potentiometerResistances(10000, ratio);
      expect(segments.toTerminal1 + segments.toTerminal3).toBe(10000);
      expect(state.snapshot?.pins[pinKey('pot', 'wiper')]?.voltage).toBeCloseTo(5 * (1 - ratio), 10);
      expect(state.snapshot?.components.pot?.power).toBeCloseTo(25 / 10000, 10);
    }
    expect(serializeProject(document)).toBe(before);
    state = transitionSimulation(state, { type: 'stop' }, document);
    state = transitionSimulation(state, { type: 'start' }, document);
    expect(state.snapshot?.pins[pinKey('pot', 'wiper')]?.voltage).toBeCloseTo(2.5, 10);
  });
});
