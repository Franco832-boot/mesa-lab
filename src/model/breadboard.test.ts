import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { componentDefinitions, createComponent, getPin, pinWorldPosition } from './components';
import { createProject, parseProject, serializeProject } from './project';
import { applyEditorCommand } from './editor';
import type { CircuitProject, ElectronicComponent, Point } from './types';
import { localToWorld } from './coordinates';
import { planComponentMove, planInsertion, validateAttachments } from './breadboard';
import { evaluateCircuit } from '../sim/engine';
import { pinKey, resolveTopology } from '../sim/topology';
import { editorCommandApplied, projectReducer, projectReplaced, redoApplied, undoApplied } from '../features/project/projectSlice';
import { migratePersistedProject } from '../app/persistence';

const board = createComponent('breadboard', { x: 40, y: 180 }, 'bb');
const resistor = createComponent('resistor', { x: 150, y: 80 }, 'r');
const fixture = (): CircuitProject => ({ ...createProject('insertion'), components: [board, resistor], wires: [] });
// Independently calculated from physical insertion pitch: a8=(126.36,226.65472),
// lead1=(-7.72,4.8), with a four-pitch resistor footprint (40.64 world units).
const a8Position = { x: 134.08, y: 221.85472 };
const place = (project = fixture(), position = a8Position) => applyEditorCommand(project, { type: 'place', positions: { r: position } });
const part = (project: CircuitProject, id = 'r'): ElectronicComponent => {
  const found = project.components.find((item) => item.id === id);
  if (!found) throw new Error('missing fixture');
  return found;
};
function alignedTo(project: CircuitProject, holeId: string): Point {
  const hole = pinWorldPosition(project.components, { componentId: 'bb', pinId: holeId });
  const lead = getPin('resistor', '1');
  if (!hole || !lead) throw new Error('fixture pins');
  return { x: hole.x - lead.position.x, y: hole.y - lead.position.y };
}

describe('breadboard insertion document and electrical behavior', () => {
  it('snaps the rigid footprint to actual hole centers and stores explicit lead attachments', () => {
    const project = place(fixture(), { x: a8Position.x + 3, y: a8Position.y - 2 });
    const mounted = part(project);
    expect(mounted.position.x).toBeCloseTo(a8Position.x, 8);
    expect(mounted.position.y).toBeCloseTo(a8Position.y, 8);
    expect(mounted.attachments).toEqual([
      { pinId: '1', breadboardId: 'bb', holeId: 'a8' },
      { pinId: '2', breadboardId: 'bb', holeId: 'a12' },
    ]);
    for (const attachment of mounted.attachments ?? []) {
      const lead = pinWorldPosition(project.components, { componentId: 'r', pinId: attachment.pinId });
      const hole = pinWorldPosition(project.components, { componentId: 'bb', pinId: attachment.holeId });
      expect(lead?.x).toBeCloseTo(hole?.x ?? NaN, 8);
      expect(lead?.y).toBeCloseTo(hole?.y ?? NaN, 8);
    }
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('electrically joins inserted leads through breadboard strips without authored resistor wires', () => {
    const project = place();
    project.components.push(createComponent('power-supply', { x: 750, y: 50 }, 's'));
    project.wires = [
      { id: 's+', from: { componentId: 's', pinId: 'positive' }, to: { componentId: 'bb', pinId: 'e8' }, color: '#668c75', waypoints: [] },
      { id: 's-', from: { componentId: 'bb', pinId: 'e12' }, to: { componentId: 's', pinId: 'negative' }, color: '#668c75', waypoints: [] },
    ];
    const topology = resolveTopology(project);
    expect(topology.nodeByPin.get(pinKey('r', '1'))).toBe(topology.nodeByPin.get(pinKey('bb', 'e8')));
    const result = evaluateCircuit(project);
    expect(result.components.r?.current).toBeCloseTo(5 / 330, 10);
    expect(result.components.r?.voltage).toBeCloseTo(5, 10);
    expect(result.diagnostics).toEqual([]);
  });
  it('rejects occupied holes and incompatible rotations atomically', () => {
    const project = place();
    const other = createComponent('resistor', { x: 150, y: 50 }, 'other');
    expect(() => applyEditorCommand({ ...project, components: [...project.components, other] }, {
      type: 'place', positions: { other: a8Position },
    })).toThrow('invalid-breadboard-placement');
    const diagonal = { ...resistor, position: a8Position, rotation: 45 };
    expect(planInsertion([board], diagonal).valid).toBe(false);
    expect(part(project).attachments).toHaveLength(2);
  });
  it('reassigns holes when moved and detaches a component moved into free space', () => {
    const inserted = place();
    const shifted = place(inserted, alignedTo(inserted, 'a9'));
    expect(part(shifted).attachments?.map((lead) => lead.holeId)).toEqual(['a9', 'a13']);
    const detached = applyEditorCommand(shifted, { type: 'place', positions: { r: { x: 100, y: 40 } } });
    expect(part(detached).attachments).toBeUndefined();
    expect(resolveTopology(detached).nodeByPin.get(pinKey('r', '1'))).not.toBe(resolveTopology(detached).nodeByPin.get(pinKey('bb', 'a9')));
  });
  it('carries inserted components when the board moves and rotates, keeping the same holes', () => {
    const inserted = place();
    const moved = applyEditorCommand(inserted, { type: 'move', positions: { bb: { x: 140, y: 210 } } });
    expect(part(moved).position.x).toBeCloseTo(a8Position.x + 100, 8);
    expect(part(moved).position.y).toBeCloseTo(a8Position.y + 30, 8);
    const rotated = applyEditorCommand(moved, { type: 'rotate', ids: ['bb'] });
    expect(part(rotated).rotation).toBe(90);
    expect(part(rotated).attachments).toEqual(part(inserted).attachments);
    expect(() => validateAttachments(rotated.components)).not.toThrow();
  });
  it('supports a rotated component aligned with a rotated board', () => {
    const rotatedBoard = { ...board, rotation: 90 };
    const hole = getPin('breadboard', 'a8'), lead = getPin('resistor', '1');
    if (!hole || !lead) throw new Error('fixture pins');
    const target = localToWorld(hole.position, rotatedBoard.position, 90);
    const offset = localToWorld(lead.position, { x: 0, y: 0 }, 90);
    const component = { ...resistor, rotation: 90, position: { x: target.x - offset.x + 2, y: target.y - offset.y } };
    const plan = planInsertion([rotatedBoard], component);
    expect(plan.valid).toBe(true);
    expect(plan.component.attachments?.map((item) => item.holeId)).toEqual(['a8', 'a12']);
  });
  it('rotates an entire selected mounted assembly once instead of double-rotating its child', () => {
    const inserted = place();
    const rotated = applyEditorCommand(inserted, { type: 'rotate', ids: ['bb', 'r'] });
    expect(part(rotated).rotation).toBe(90);
    expect(part(rotated).attachments).toEqual(part(inserted).attachments);
    expect(() => validateAttachments(rotated.components)).not.toThrow();
  });
  it('preserves the physical parent when moving a mounted assembly over another breadboard', () => {
    const inserted = place();
    inserted.components.push({ ...board, id: 'aa' });
    const moved = applyEditorCommand(inserted, { type: 'move', positions: { bb: { x: 50.16, y: 180 } } });
    expect(part(moved).attachments).toEqual(part(inserted).attachments);
    expect(part(moved).position.x).toBeCloseTo(a8Position.x + 10.16, 8);
    const topology = resolveTopology(moved);
    expect(topology.nodeByPin.get(pinKey('r', '1'))).toBe(topology.nodeByPin.get(pinKey('bb', 'a8')));
    expect(topology.nodeByPin.get(pinKey('r', '1'))).not.toBe(topology.nodeByPin.get(pinKey('aa', 'a9')));
  });
  it.each([
    { kind: 'led' as const, rotation: 0, anchor: 'a8', expected: ['a8', 'a9'] },
    { kind: 'potentiometer' as const, rotation: 0, anchor: 'a8', expected: ['a8', 'a9', 'a10'] },
    { kind: 'pushbutton' as const, rotation: 90, anchor: 'e8', expected: ['e8', 'f8', 'e6', 'f6'] },
  ])('fits the $kind footprint to its actual visible holes', ({ kind, rotation, anchor, expected }) => {
    const component = { ...createComponent(kind, { x: 0, y: 0 }, 'part'), rotation };
    const first = componentDefinitions[kind].pins[0];
    const target = pinWorldPosition([board], { componentId: 'bb', pinId: anchor });
    if (!first || !target) throw new Error('fixture pins');
    const offset = localToWorld(first.position, { x: 0, y: 0 }, rotation);
    component.position = { x: target.x - offset.x, y: target.y - offset.y };
    const plan = planInsertion([board], component);
    expect(plan.valid).toBe(true);
    expect(plan.component.attachments?.map((lead) => lead.holeId)).toEqual(expected);
    expect(() => validateAttachments([board, plan.component])).not.toThrow();
  });
  it('preserves insertion as one undo/redo operation and migrates old v1 documents as unmounted', () => {
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(projectReplaced(fixture()));
    store.dispatch(editorCommandApplied({ type: 'place', positions: { r: a8Position } }));
    expect(store.getState().project.history.past).toHaveLength(1);
    const mounted = store.getState().project.document;
    store.dispatch(undoApplied());
    expect(part(store.getState().project.document).attachments).toBeUndefined();
    store.dispatch(redoApplied());
    expect(store.getState().project.document).toEqual(mounted);
    const old = fixture();
    expect(migratePersistedProject({ document: old, _persist: { version: 1 } }).document).toEqual(old);
    expect(migratePersistedProject({ document: mounted, _persist: { version: 1 } }).document).toEqual(mounted);
  });
  it('detaches standalone copies and deleted-board mounts but remaps a copied mounted assembly', () => {
    const inserted = place();
    const copy = applyEditorCommand(inserted, { type: 'duplicate', components: [{ originalId: 'r', newId: 'r2' }], wires: [] });
    expect(part(copy, 'r2').attachments).toBeUndefined();
    const assembly = applyEditorCommand(inserted, { type: 'duplicate', components: [
      { originalId: 'r', newId: 'r2' }, { originalId: 'bb', newId: 'bb2' },
    ], wires: [] });
    expect(part(assembly, 'r2').attachments?.every((lead) => lead.breadboardId === 'bb2')).toBe(true);
    const deleted = applyEditorCommand(inserted, { type: 'delete', componentIds: ['bb'], wireIds: [] });
    expect(part(deleted).attachments).toBeUndefined();
  });
  it('rejects malformed, stale or dangling persisted attachments instead of creating ghost connections', () => {
    const mounted = place();
    const corruptions = [
      { pinId: 'missing', breadboardId: 'bb', holeId: 'a8' },
      { pinId: '1', breadboardId: 'missing', holeId: 'a8' },
      { pinId: '1', breadboardId: 'bb', holeId: 'not-a-hole' },
      { pinId: '1', breadboardId: 'bb', holeId: 'a9' },
    ];
    for (const lead of corruptions) {
      const component = { ...part(mounted), attachments: [lead, { pinId: '2', breadboardId: 'bb', holeId: 'a12' }] };
      expect(() => parseProject(JSON.stringify({ ...mounted, components: [board, component] }))).toThrow('invalid-lead-attachments');
    }
  });
  it('exposes the same snapped preview used by the committed pointer placement', () => {
    const raw = { r: { x: a8Position.x + 2, y: a8Position.y + 1 } };
    const preview = planComponentMove(fixture().components, raw);
    expect(preview.valid).toBe(true);
    expect(preview.holes.map((hole) => hole.pinId)).toEqual(['a8', 'a12']);
    const committed = applyEditorCommand(fixture(), { type: 'place', positions: raw });
    expect(committed.components).toEqual(preview.components);
  });
});
