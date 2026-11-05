import { describe, expect, it } from 'vitest';
import type { CircuitProject } from './types';
import {
  componentDefinitions,
  createComponent,
  espGpioMap,
  getPin,
  isComponentKind,
  pinWorldPosition,
} from './components';
import { applyEditorCommand, wirePoints } from './editor';
import { createProject, parseProject, serializeProject } from './project';
import { worldToScreen, screenToWorld } from './coordinates';
import { projectWithData } from '../test/fixtures';
import { phase1Source } from '../test/phase1';
import { visualBounds } from './physical';

describe('centralized physical terminals', () => {
  it('gives every terminal a unique identifier and finite coordinates', () => {
    for (const [kind, definition] of Object.entries(componentDefinitions)) {
      if (!isComponentKind(kind)) throw new Error('unknown definition');
      const bounds = visualBounds(kind);
      expect(new Set(definition.pins.map((pin) => pin.id)).size).toBe(definition.pins.length);
      for (const pin of definition.pins) {
        expect(Number.isFinite(pin.position.x) && Number.isFinite(pin.position.y)).toBe(true);
        expect(pin.position.x).toBeGreaterThanOrEqual(bounds.x);
        expect(pin.position.x).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(pin.position.y).toBeGreaterThanOrEqual(bounds.y);
        expect(pin.position.y).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      for (const group of definition.contactGroups)
        for (const id of group.pinIds)
          expect(definition.pins.some((pin) => pin.id === id)).toBe(true);
    }
  });
  it('models all 830 breadboard holes and separates the channel and rails', () => {
    const board = componentDefinitions.breadboard;
    expect(board.pins).toHaveLength(830);
    expect(board.contactGroups).toHaveLength(130);
    expect(new Set(board.contactGroups.flatMap((group) => group.pinIds)).size).toBe(830);
    expect(board.contactGroups.find((group) => group.pinIds.includes('a1'))?.pinIds).toEqual([
      'a1',
      'b1',
      'c1',
      'd1',
      'e1',
    ]);
    expect(board.contactGroups.find((group) => group.pinIds.includes('f1'))?.pinIds).not.toContain(
      'e1',
    );
    expect(board.contactGroups.find((group) => group.pinIds.includes('tp1'))?.pinIds).toHaveLength(
      50,
    );
  });
  it('maps NodeMCU labels to GPIO and records boot constraints', () => {
    expect(espGpioMap.map((pin) => pin.gpio)).toEqual([16, 5, 4, 0, 2, 14, 12, 13, 15]);
    expect(getPin('esp8266', 'D3')).toMatchObject({ gpio: 0, bootLevel: 'HIGH', maxVoltage: 3.3 });
    expect(getPin('esp8266', 'D8')).toMatchObject({ gpio: 15, bootLevel: 'LOW' });
  });
  it('rejects nonexistent pin references on import', () => {
    const project = projectWithData();
    const wire = project.wires[0];
    if (!wire) throw new Error('fixture');
    wire.from.pinId = 'D999';
    expect(() => parseProject(JSON.stringify(project))).toThrow('invalid-pin-reference');
    expect(wirePoints(project.components, wire)).toBeNull();
  });
  it('loads Phase 1 projects and normalizes legacy printed UNO pin IDs', () => {
    const project = projectWithData();
    const wire = project.wires[0];
    if (!wire) throw new Error('fixture');
    wire.from = { componentId: 'uno-reference', pinId: '13' };
    expect(parseProject(JSON.stringify(project)).wires[0]?.from.pinId).toBe('D13');
    const phase1 = parseProject(phase1Source);
    expect(phase1.id).toBe('phase-one-lab');
    expect(phase1.components[1]?.position).toEqual({ x: 515, y: 108 });
    expect(parseProject(serializeProject(phase1))).toEqual(phase1);
  });
});

describe('circuit editor domain operations', () => {
  it('creates every component kind with valid defaults', () => {
    let project: CircuitProject = { ...createProject(), components: [] };
    const kinds = [
      'arduino-uno',
      'esp8266',
      'breadboard',
      'led',
      'resistor',
      'pushbutton',
      'potentiometer',
      'power-supply',
    ] as const;
    for (const kind of kinds)
      project = applyEditorCommand(project, {
        type: 'add',
        component: createComponent(kind, { x: 10, y: 20 }, kind),
      });
    expect(project.components).toHaveLength(8);
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('moves a group in world coordinates and keeps endpoint references intact', () => {
    const before = projectWithData();
    const after = applyEditorCommand(before, {
      type: 'move',
      positions: { 'esp-reference': { x: 600, y: 200 }, 'led-1': { x: 900, y: 300 } },
    });
    expect(after.wires).toEqual(before.wires);
    expect(after.components.find((item) => item.id === 'esp-reference')?.position).toEqual({
      x: 600,
      y: 200,
    });
    const reference = before.wires[0]?.from;
    if (!reference) throw new Error('fixture');
    expect(pinWorldPosition(after.components, reference)).not.toEqual(
      pinWorldPosition(before.components, reference),
    );
  });
  it('rotates 90 degrees about the center and computes connected endpoints with pan and zoom', () => {
    const before = projectWithData();
    const after = applyEditorCommand(before, { type: 'rotate', ids: ['esp-reference'] });
    const board = after.components.find((item) => item.id === 'esp-reference');
    expect(board?.rotation).toBe(90);
    const reference = after.wires[0]?.from;
    if (!reference) throw new Error('fixture');
    const position = pinWorldPosition(after.components, reference);
    if (!position) throw new Error('missing terminal');
    const viewport = { zoom: 1.7, offset: { x: -210, y: 85 } };
    const recovered = screenToWorld(worldToScreen(position, viewport), viewport);
    expect(recovered.x).toBeCloseTo(position.x);
    expect(recovered.y).toBeCloseTo(position.y);
    expect(after.wires).toEqual(before.wires);
  });
  it('duplicates selected circuits with internal wires and board code, without external links', () => {
    const before = projectWithData();
    const after = applyEditorCommand(before, {
      type: 'duplicate',
      components: [
        { originalId: 'esp-reference', newId: 'esp-copy' },
        { originalId: 'led-1', newId: 'led-copy' },
      ],
      wires: [{ originalId: 'wire-1', newId: 'wire-copy' }],
    });
    expect(after.wires.find((item) => item.id === 'wire-copy')).toMatchObject({
      from: { componentId: 'esp-copy', pinId: 'D1' },
      to: { componentId: 'led-copy' },
    });
    expect(after.programs.some((item) => item.componentId === 'esp-copy')).toBe(true);
    expect(after.components.find((item) => item.id === 'led-copy')?.position).toEqual({
      x: 825,
      y: 275,
    });
    expect(before.wires).toHaveLength(1);
  });
  it('deletes a component and its wires and associated program atomically', () => {
    const after = applyEditorCommand(projectWithData(), {
      type: 'delete',
      componentIds: ['esp-reference'],
      wireIds: [],
    });
    expect(after.components.some((item) => item.id === 'esp-reference')).toBe(false);
    expect(after.wires).toHaveLength(0);
    expect(after.programs).toHaveLength(0);
  });
  it('connects real pins, rejects self/duplicate/invalid connections and removes a wire', () => {
    const project = projectWithData();
    const existing = project.wires[0];
    if (!existing) throw new Error('fixture');
    const wire = {
      ...existing,
      id: 'new',
      from: { componentId: 'esp-reference', pinId: 'GND' },
      to: { componentId: 'led-1', pinId: 'cathode' },
    };
    const next = applyEditorCommand(project, { type: 'add-wire', wire });
    expect(next.wires).toHaveLength(2);
    expect(() =>
      applyEditorCommand(next, { type: 'add-wire', wire: { ...wire, id: 'duplicate' } }),
    ).toThrow('duplicate-wire');
    expect(() =>
      applyEditorCommand(project, { type: 'add-wire', wire: { ...wire, to: wire.from } }),
    ).toThrow('invalid-wire-reference');
    expect(() =>
      applyEditorCommand(project, {
        type: 'add-wire',
        wire: { ...wire, to: { componentId: 'led-1', pinId: 'bad' } },
      }),
    ).toThrow('invalid-pin-reference');
    expect(
      applyEditorCommand(next, { type: 'delete', componentIds: [], wireIds: ['new'] }).wires,
    ).toHaveLength(1);
  });
  it('changes properties, color and route and preserves them through JSON recovery', () => {
    let project = applyEditorCommand(projectWithData(), {
      type: 'properties',
      id: 'led-1',
      update: { kind: 'led', properties: { color: 'blue' } },
    });
    project = applyEditorCommand(project, {
      type: 'wire',
      id: 'wire-1',
      color: '#ffcc00',
      waypoints: [
        { x: 400, y: 500 },
        { x: 900, y: 500 },
      ],
    });
    expect(parseProject(serializeProject(project))).toEqual(project);
    expect(project.wires[0]?.color).toBe('#ffcc00');
    expect(project.components.find((item) => item.id === 'led-1')?.properties).toEqual({
      color: 'blue',
    });
  });
});
