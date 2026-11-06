import { describe, expect, it } from 'vitest';
import { createComponent, pinWorldPosition } from './components';
import { applyEditorCommand, wirePoints } from './editor';
import { createProject, parseProject, serializeProject } from './project';
import type { Point, Wire } from './types';
import {
  insertWireCorner,
  moveWireCorner,
  moveWireSegment,
  nearestWireSegment,
  removeWireCorner,
  routeWaypoints,
  wireGeometry,
} from './wireGeometry';
import { evaluateCircuit } from '../sim/engine';
import { electricalProjectFingerprint } from '../features/simulation/runtime';
import {
  editorCommandApplied,
  projectReducer,
  projectReplaced,
  redoApplied,
  undoApplied,
} from '../features/project/projectSlice';

const points: Point[] = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 100 },
  { x: 100, y: 100 },
];
const fixture = () => ({
  ...createProject('wire-test'),
  components: [
    createComponent('power-supply', { x: 20, y: 40 }, 'source'),
    createComponent('resistor', { x: 350, y: 150 }, 'r'),
    createComponent('led', { x: 500, y: 150 }, 'led'),
  ],
  wires: [
    {
      id: 'supply',
      from: { componentId: 'source', pinId: 'positive' },
      to: { componentId: 'r', pinId: '1' },
      color: '#668c75',
      waypoints: [],
    },
    {
      id: 'anode',
      from: { componentId: 'r', pinId: '2' },
      to: { componentId: 'led', pinId: 'anode' },
      color: '#668c75',
      waypoints: [],
    },
    {
      id: 'return',
      from: { componentId: 'led', pinId: 'cathode' },
      to: { componentId: 'source', pinId: 'negative' },
      color: '#668c75',
      waypoints: [],
    },
  ],
});
const firstWire = (wires: readonly Wire[]) =>
  wires[0] ??
  (() => {
    throw new Error('Missing wire');
  })();

describe('visual wire geometry', () => {
  it('projects the existing auto bends without modifying an old empty-waypoint wire', () => {
    const doc = fixture(),
      wire = firstWire(doc.wires),
      saved = serializeProject(doc);
    const route = wireGeometry(doc.components, wire);
    const a = pinWorldPosition(doc.components, wire.from),
      b = pinWorldPosition(doc.components, wire.to);
    if (!a || !b) throw new Error('Missing terminal');
    expect(route).toEqual([a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]);
    expect(wire.waypoints).toEqual([]);
    expect(serializeProject(doc)).toBe(saved);
    expect(wireGeometry(parseProject(saved).components, wire)).toEqual(route);
  });
  it('retains manually authored collinear anchors as controls and removes only implicit straight vertices', () => {
    const doc = fixture(),
      wire = firstWire(doc.wires);
    const a = pinWorldPosition(doc.components, wire.from),
      b = pinWorldPosition(doc.components, wire.to);
    if (!a || !b) throw new Error('Missing terminal');
    const manual = { x: (a.x + b.x) / 3, y: a.y };
    const route = wireGeometry(doc.components, { ...wire, waypoints: [manual] });
    expect(route).toContainEqual(manual);
    expect(route?.some((p, i) => i > 0 && p.x === route[i - 1]?.x && p.y === route[i - 1]?.y)).toBe(
      false,
    );
  });
  it('moves an automatic corner while keeping both terminals fixed', () => {
    const changed = moveWireCorner(points, 1, { x: 80, y: -30 });
    expect(changed[1]).toEqual({ x: 80, y: -30 });
    expect(changed[0]).toEqual(points[0]);
    expect(changed.at(-1)).toEqual(points.at(-1));
    expect(moveWireCorner(points, 0, { x: -9, y: -9 })).toEqual(points);
    expect(moveWireCorner(points, points.length - 1, { x: -9, y: -9 })).toEqual(points);
  });
  it('moves an entire vertical segment perpendicularly without changing its endpoint heights', () => {
    expect(moveWireSegment(points, 1, { x: 30, y: 999 })).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
      { x: 100, y: 100 },
    ]);
  });
  it.each([0, 2])(
    'adds a short fixed-terminal stub when moving terminal-adjacent segment %s',
    (index) => {
      const changed = moveWireSegment(points, index, { x: 999, y: 25 });
      expect(changed[0]).toEqual(points[0]);
      expect(changed.at(-1)).toEqual(points.at(-1));
      expect(changed).toHaveLength(5);
      for (let i = 1; i < changed.length; i++) {
        expect(changed[i]?.x === changed[i - 1]?.x || changed[i]?.y === changed[i - 1]?.y).toBe(
          true,
        );
      }
    },
  );
  it('inserts at the clicked segment in route order and projects clicks onto its axis', () => {
    const segment = nearestWireSegment(points, { x: 54, y: 35 });
    expect(segment).toBe(1);
    const inserted = insertWireCorner(points, 1, { x: 54, y: 35 });
    expect(inserted[2]).toEqual({ x: 50, y: 35 });
    expect(removeWireCorner(inserted, 2)).toEqual(points);
    expect(removeWireCorner(points, 0)).toEqual(points);
  });
  it('does not translate a segment when the cursor moves along its own axis', () => {
    expect(moveWireSegment(points, 1, { x: 0, y: 90 })).toEqual(points);
  });
  it('persists a moved route without changing its identity, electrical circuit or calculated values', () => {
    const doc = fixture(),
      wire = firstWire(doc.wires),
      route = wireGeometry(doc.components, wire);
    if (!route) throw new Error('Missing route');
    const before = evaluateCircuit(doc);
    // 5 V source, red LED drop 2 V and 330 ohms: 9.090909... mA.
    expect(before.components.led?.current).toBeCloseTo(3 / 330, 10);
    const changed = applyEditorCommand(doc, {
      type: 'wire',
      id: wire.id,
      color: wire.color,
      waypoints: routeWaypoints(moveWireSegment(route, 1, { x: 40, y: 0 })),
    });
    const restored = parseProject(serializeProject(changed));
    expect(firstWire(restored.wires).waypoints).toEqual(firstWire(changed.wires).waypoints);
    expect(firstWire(restored.wires)).toMatchObject({
      id: wire.id,
      from: wire.from,
      to: wire.to,
      color: wire.color,
    });
    expect(electricalProjectFingerprint(restored)).toBe(electricalProjectFingerprint(doc));
    expect(evaluateCircuit(restored)).toEqual(before);
  });
  it('makes a route edit one undoable command and anchors to rotated/moved terminals', () => {
    const doc = fixture(),
      wire = firstWire(doc.wires),
      route = wireGeometry(doc.components, wire);
    if (!route) throw new Error('Missing route');
    const initial = projectReducer(undefined, projectReplaced(doc));
    expect(wireGeometry(doc.components, wire)).toEqual(route);
    expect(initial.history.past).toHaveLength(0);
    const changed = projectReducer(
      initial,
      editorCommandApplied({
        type: 'wire',
        id: wire.id,
        color: wire.color,
        waypoints: routeWaypoints(moveWireCorner(route, 1, { x: 200, y: 35 })),
      }),
    );
    expect(changed.history.past).toHaveLength(1);
    const undone = projectReducer(changed, undoApplied());
    expect(undone.document).toEqual(doc);
    expect(projectReducer(undone, redoApplied()).document).toEqual(changed.document);
    const rotated = applyEditorCommand(changed.document, { type: 'rotate', ids: ['r'] });
    const moved = applyEditorCommand(rotated, {
      type: 'move',
      positions: { source: { x: 80, y: 80 } },
    });
    const anchored = wireGeometry(moved.components, firstWire(moved.wires));
    expect(anchored?.[0]).toEqual(pinWorldPosition(moved.components, wire.from));
    expect(anchored?.at(-1)).toEqual(pinWorldPosition(moved.components, wire.to));
    expect(firstWire(moved.wires).waypoints).toEqual(firstWire(changed.document.wires).waypoints);
    expect(wirePoints(moved.components, firstWire(moved.wires))?.at(-1)).toEqual(anchored?.at(-1));
  });
});
