import { describe, expect, it } from 'vitest';
import { createComponent, componentDefinitions, pinWorldPosition } from './components';
import { createProject, parseProject, serializeProject } from './project';
import { planInsertion } from './breadboard';
import { applyEditorCommand } from './editor';
import { phase1Source } from '../test/phase1';
import { readFileSync } from 'node:fs';
import { observeDht11 } from '../sim/dht11';
import { decodePersistedProject } from '../app/persistence';
import { editorCommandApplied, projectReducer, projectReplaced, redoApplied, undoApplied } from '../features/project/projectSlice';

const legacySource = readFileSync(new URL('../test/dht11-sip4.v1.json', import.meta.url), 'utf8');

describe('DHT11 physical component and additive project support', () => {
  it('uses a 16 by 22 mm PCB and 5 mm header tails, in verified KY-015 front-view order', () => {
    const definition = componentDefinitions.dht11;
    expect([definition.width, definition.height]).toEqual([64, 88]);
    expect(definition.pins.map((pin) => pin.id)).toEqual(['DATA', 'VCC', 'GND']);
    expect(definition.pins.every((pin) => pin.position.y === 108)).toBe(true);
    for (let i = 1; i < 3; i++) expect((definition.pins[i]?.position.x ?? 0) - (definition.pins[i - 1]?.position.x ?? 0)).toBeCloseTo(10.16, 10);
    expect(definition.contactGroups).toEqual([]);
  });
  it('persists defaults, edits and old projects without rewriting the v1 document shape', () => {
    const original = { ...createProject('dht'), components: [createComponent('dht11', { x: 100, y: 80 }, 'sensor')] };
    expect(original.components[0]?.properties).toEqual({ temperature: 25, humidity: 50 });
    const edited = applyEditorCommand(original, { type: 'properties', id: 'sensor', update: { kind: 'dht11', properties: { temperature: 31.4, humidity: 65.8 } } });
    expect(parseProject(serializeProject(edited))).toEqual(edited);
    expect(parseProject(serializeProject(parseProject(phase1Source)))).toEqual(parseProject(phase1Source));
    expect(() => applyEditorCommand(original, { type: 'properties', id: 'sensor', update: { kind: 'dht11', properties: { temperature: 100, humidity: 50 } } })).toThrow();
  });
  it('inserts the three header pins into distinct real breadboard columns', () => {
    const board = createComponent('breadboard', { x: 0, y: 0 }, 'bb');
    const sensor = createComponent('dht11', { x: 0, y: 0 }, 'sensor');
    const lead = pinWorldPosition([sensor], { componentId: 'sensor', pinId: 'DATA' });
    const hole = pinWorldPosition([board], { componentId: 'bb', pinId: 'b10' });
    if (!lead || !hole) throw new Error('Missing fixture terminals');
    const mounted = planInsertion([board], { ...sensor, position: { x: hole.x - lead.x, y: hole.y - lead.y } });
    expect(mounted.valid).toBe(true);
    expect(mounted.component.attachments?.map((item) => item.holeId)).toEqual(['b10','b11','b12']);
    const document = { ...createProject('mounted'), components: [board, mounted.component] };
    const restored = parseProject(serializeProject(document));
    expect(restored).toEqual(document);
    const rotated = applyEditorCommand(restored, { type: 'rotate', ids: ['bb'] });
    expect(parseProject(serializeProject(rotated))).toEqual(rotated);
    expect(rotated.components.find((item) => item.id === 'sensor')?.attachments).toHaveLength(3);
  });
  it('migrates a saved SIP-4 mount into explicit wires without changing the old holes, other components or wire IDs', () => {
    const migrated = parseProject(legacySource);
    expect(migrated.components.find((item) => item.id === 'sensor')?.attachments).toBeUndefined();
    expect(migrated.wires.slice(0, 5).map((wire) => wire.id)).toEqual(['vcc', 'ground', 'data', 'bias-vcc', 'bias-data']);
    expect(migrated.wires.slice(5).map((wire) => [wire.from.pinId, wire.to.pinId])).toEqual([['VCC','b10'],['DATA','b11'],['GND','b13']]);
    expect(migrated.components.find((item) => item.id === 'external-pullup')?.properties).toEqual({ resistance: 4700 });
    expect(observeDht11(migrated, {}, 'uno', 'D2')).toEqual({ sensorId: 'sensor', temperature: 25, humidity: 50 });
    expect(parseProject(serializeProject(migrated))).toEqual(migrated);
    const envelope = JSON.stringify({ document: legacySource, _persist: JSON.stringify({ version: 1, rehydrated: true }) });
    expect(decodePersistedProject(envelope).document).toEqual(migrated);
    expect(() => parseProject(legacySource.replace('97.92', '98.92'))).toThrow('invalid-lead-attachments');
  });
  it('preserves direct wired terminal IDs and undo/redo of module properties', () => {
    const original = parseProject(readFileSync(new URL('../../examples/dht11.json', import.meta.url), 'utf8'));
    const initial = projectReducer(undefined, projectReplaced(original));
    const edited = projectReducer(initial, editorCommandApplied({ type: 'properties', id: 'sensor',
      update: { kind: 'dht11', properties: { temperature: 30, humidity: 70 } } }));
    const undone = projectReducer(edited, undoApplied());
    expect(undone.document).toEqual(original);
    expect(projectReducer(undone, redoApplied()).document).toEqual(edited.document);
    expect(edited.document.wires).toEqual(original.wires);
  });
});
