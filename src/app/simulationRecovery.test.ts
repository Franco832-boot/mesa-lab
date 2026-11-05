import { describe, expect, it } from 'vitest';
import { createAppStore } from './store';
import { PERSIST_KEY } from './persistence';
import type { ProjectStorage } from './persistence';
import { editorCommandApplied, projectReplaced } from '../features/project/projectSlice';
import { createComponent } from '../model/components';
import { createProject, parseProject, serializeProject } from '../model/project';
import type { ComponentKind, Wire } from '../model/types';
import { evaluateCircuit } from '../sim/engine';
import { pinKey } from '../sim/topology';
import type { SimulationInputs } from '../sim/types';

type Application = ReturnType<typeof createAppStore>;
function storageFixture() {
  const values = new Map<string, string>();
  const storage: ProjectStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}
async function ready(app: Application): Promise<void> {
  if (app.persistor.getState().bootstrapped) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = app.persistor.subscribe(() => {
      if (app.persistor.getState().bootstrapped) { unsubscribe(); resolve(); }
    });
  });
}
function add(app: Application, kind: ComponentKind, id: string, x: number): void {
  app.store.dispatch(editorCommandApplied({
    type: 'add', component: createComponent(kind, { x, y: 100 }, id),
  }));
}
function connect(app: Application, id: string, from: Wire['from'], to: Wire['to']): void {
  app.store.dispatch(editorCommandApplied({
    type: 'add-wire', wire: { id, from, to, color: '#668c75', waypoints: [] },
  }));
}
const reference = (componentId: string, pinId: string) => ({ componentId, pinId });
const gpio = (level: 'HIGH' | 'LOW' | 'FLOATING'): SimulationInputs => ({
  gpio: { [pinKey('board', 'D1')]: { mode: 'output', level } },
});

describe('Phase 3 editor, electrical engine and persistence integration', () => {
  it('recovers an electrically functional GPIO/breadboard LED project without runtime overrides', async () => {
    const { storage, values } = storageFixture();
    const first = createAppStore(storage);
    let second: Application | undefined;
    try {
      await ready(first);
      first.store.dispatch(projectReplaced({ ...createProject('phase3-gpio'), components: [] }));
      add(first, 'esp8266', 'board', 50);
      add(first, 'breadboard', 'bb', 300);
      add(first, 'resistor', 'r', 500);
      add(first, 'led', 'led', 650);
      connect(first, 'w1', reference('board', 'D1'), reference('bb', 'a1'));
      connect(first, 'w2', reference('bb', 'e1'), reference('r', '1'));
      connect(first, 'w3', reference('r', '2'), reference('led', 'anode'));
      connect(first, 'w4', reference('led', 'cathode'), reference('board', 'GND'));
      const project = first.store.getState().project.document;
      const serialized = serializeProject(project);
      // Independent expectation: (3.3 V - 2.0 V) / (330 ohm + 50 ohm GPIO drive).
      const expectedCurrent = 1.3 / 380;
      const powered = evaluateCircuit(project, gpio('HIGH'));
      expect(powered.components.led?.current).toBeCloseTo(expectedCurrent, 10);
      expect(powered.components.led?.brightness).toBeGreaterThan(0);
      expect(powered.components.led?.condition).toBe('active');
      expect(powered.components.r?.power).toBeCloseTo(expectedCurrent ** 2 * 330, 10);
      expect(powered.pins[pinKey('board', 'D1')]?.voltage).toBeCloseTo(3.3 - expectedCurrent * 50, 10);
      expect(evaluateCircuit(project, gpio('LOW')).components.led?.brightness).toBe(0);
      expect(evaluateCircuit(project, gpio('FLOATING')).components.led?.brightness).toBe(0);
      expect(serializeProject(project)).toBe(serialized);
      expect(parseProject(serialized)).toEqual(project);

      expect(await first.saveNow()).toBe(true);
      first.persistor.pause();
      const raw = values.get(PERSIST_KEY);
      if (!raw) throw new Error('Project was not persisted');
      const envelope: unknown = JSON.parse(raw);
      if (
        typeof envelope !== 'object' || envelope === null ||
        !('document' in envelope) || typeof envelope.document !== 'string'
      ) throw new Error('Unexpected persistence envelope');
      expect(Object.keys(envelope)).toEqual(['document', '_persist']);
      expect(JSON.parse(envelope.document)).toEqual(project);
      second = createAppStore(storage);
      await ready(second);
      const recovered = second.store.getState().project.document;
      expect(recovered).toEqual(project);
      expect(second.store.getState().project.history).toEqual({ past: [], future: [] });
      expect(evaluateCircuit(recovered).components.led?.brightness).toBe(0);
      expect(evaluateCircuit(recovered, gpio('HIGH')).components.led?.current).toBeCloseTo(expectedCurrent, 10);
    } finally {
      await first.persistor.flush();
      first.persistor.pause();
      if (second) { await second.persistor.flush(); second.persistor.pause(); }
    }
  });

  it('responds to pressed contacts, reversed terminals and wire removal through editor commands', async () => {
    const { storage } = storageFixture();
    const app = createAppStore(storage);
    try {
      await ready(app);
      app.store.dispatch(projectReplaced({ ...createProject('phase3-button'), components: [] }));
      add(app, 'power-supply', 'source', 50);
      add(app, 'resistor', 'r', 500);
      add(app, 'led', 'led', 650);
      add(app, 'pushbutton', 'button', 800);
      connect(app, 'w1', reference('source', 'positive'), reference('r', '1'));
      connect(app, 'w2', reference('r', '2'), reference('led', 'anode'));
      connect(app, 'w3', reference('led', 'cathode'), reference('button', '1'));
      connect(app, 'w4', reference('button', '2'), reference('source', 'negative'));
      const project = () => app.store.getState().project.document;
      const pressed: SimulationInputs = { buttons: { button: true } };
      const before = serializeProject(project());
      expect(evaluateCircuit(project()).components.led?.brightness).toBe(0);
      expect(evaluateCircuit(project(), pressed).components.led?.current).toBeCloseTo(3 / 330, 10);
      expect(serializeProject(project())).toBe(before);

      app.store.dispatch(editorCommandApplied({ type: 'delete', componentIds: [], wireIds: ['w2', 'w3'] }));
      connect(app, 'reverse1', reference('r', '2'), reference('led', 'cathode'));
      connect(app, 'reverse2', reference('led', 'anode'), reference('button', '1'));
      const reversed = evaluateCircuit(project(), pressed);
      expect(reversed.components.led?.brightness).toBe(0);
      expect(reversed.diagnostics.some((issue) => issue.code === 'reverse-polarity')).toBe(true);
      app.store.dispatch(editorCommandApplied({ type: 'delete', componentIds: [], wireIds: ['reverse2'] }));
      const disconnected = evaluateCircuit(project(), pressed);
      expect(disconnected.components.led?.brightness).toBe(0);
      expect(disconnected.diagnostics.some((issue) => issue.code === 'open-circuit')).toBe(true);
      expect(parseProject(serializeProject(project()))).toEqual(project());
    } finally {
      await app.persistor.flush();
      app.persistor.pause();
    }
  });
});
