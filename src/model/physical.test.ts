import { describe, expect, it } from 'vitest';
import {
  artworkPointToLocal,
  artworkScale,
  CONTACT_PITCH_MM,
  physicalSpecs,
  visualBounds,
  WORLD_UNITS_PER_MM,
} from './physical';
import {
  componentDefinitions,
  createComponent,
  getPin,
  isComponentKind,
  pinWorldPosition,
} from './components';
import { localToWorld, screenToWorld, worldToScreen, zoomAt } from './coordinates';
import { applyEditorCommand, wirePoints } from './editor';
import { parseProject, serializeProject } from './project';
import { phase1Source } from '../test/phase1';

describe('one physical scale for every component', () => {
  it.each([
    ['arduino-uno', 68.6, 53.4],
    ['esp8266', 25.4, 48.26],
    ['breadboard', 165.1, 54.6],
    ['led', 5.9, 8.6],
    ['resistor', 6.3, 2.4],
  ] as const)('%s uses its physical body instead of the viewBox', (kind, width, height) => {
    expect(componentDefinitions[kind].width).toBeCloseTo(width * 4, 10);
    expect(componentDefinitions[kind].height).toBeCloseTo(height * 4, 10);
    const body = physicalSpecs[kind].sourceBody;
    const corner = artworkPointToLocal(kind, body);
    const opposite = artworkPointToLocal(kind, { x: body.x + body.width, y: body.y + body.height });
    expect(corner).toEqual({ x: 0, y: 0 });
    expect(opposite.x).toBeCloseTo(width * 4, 10);
    expect(opposite.y).toBeCloseTo(height * 4, 10);
    expect((artworkScale(kind) * body.width) / width).toBeCloseTo(WORLD_UNITS_PER_MM);
    expect((artworkScale(kind) * body.height) / height).toBeCloseTo(WORLD_UNITS_PER_MM);
  });
  it('keeps the relative sizes of boards, LED and resistor against an 830-point breadboard', () => {
    const width = componentDefinitions.breadboard.width;
    expect(componentDefinitions['arduino-uno'].width / width).toBeCloseTo(68.6 / 165.1, 10);
    expect(componentDefinitions.esp8266.width / width).toBeCloseTo(25.4 / 165.1, 10);
    expect(componentDefinitions.led.width / width).toBeCloseTo(5.9 / 165.1, 10);
    expect(componentDefinitions.resistor.width / width).toBeCloseTo(6.3 / 165.1, 10);
    // The lens, excluding the flange, is Ø5 mm in the unmodified horizontal artwork.
    expect(46 * artworkScale('led')).toBeCloseTo(5 * WORLD_UNITS_PER_MM);
  });
  it('normalizes every drawn terminal to the exact local coordinate used by wires', () => {
    for (const kind of Object.keys(componentDefinitions)) {
      if (!isComponentKind(kind)) throw new Error('unknown kind');
      const definition = componentDefinitions[kind];
      for (const source of definition.sourcePins)
        expect(getPin(kind, source.id)?.position).toEqual(
          artworkPointToLocal(kind, source.position),
        );
      const body = definition.physical.sourceBody;
      const scaleX = definition.width / body.width;
      const scaleY = definition.height / body.height;
      expect(scaleX).toBeCloseTo(scaleY, 10); // No non-uniform stretching.
      expect(visualBounds(kind).width).toBeGreaterThan(0);
    }
  });
  it('uses the same 2.54 mm terminal pitch on UNO, NodeMCU, breadboard and LED', () => {
    const position = (kind: Parameters<typeof getPin>[0], id: string) => {
      const pin = getPin(kind, id);
      if (!pin) throw new Error(id);
      return pin.position;
    };
    const pitch = CONTACT_PITCH_MM * WORLD_UNITS_PER_MM;
    expect(position('arduino-uno', 'D12').x - position('arduino-uno', 'D13').x).toBeCloseTo(pitch);
    expect(position('arduino-uno', 'A1').x - position('arduino-uno', 'A0').x).toBeCloseTo(pitch);
    expect(position('esp8266', 'D1').y - position('esp8266', 'D0').y).toBeCloseTo(pitch);
    expect(position('breadboard', 'a2').x - position('breadboard', 'a1').x).toBeCloseTo(pitch);
    expect(position('breadboard', 'b1').y - position('breadboard', 'a1').y).toBeCloseTo(pitch);
    expect(position('led', 'cathode').x - position('led', 'anode').x).toBeCloseTo(pitch);
    // Original NodeMCU footprint: rows at +/-11.43 mm, top D0 at +17.78 mm.
    expect(position('esp8266', 'D0').x).toBeCloseTo(24.13 * 4, 10);
    expect(position('esp8266', 'D0').y).toBeCloseTo(6.35 * 4, 10);
  });
  it.each([0.3, 0.7, 1, 2.5, 5])('keeps physical ratios and pin positions at zoom %s', (zoom) => {
    const viewport = { zoom, offset: { x: -130, y: 58 } };
    for (const rotation of [0, 90, 180, 270]) {
      for (const kind of ['arduino-uno', 'esp8266', 'breadboard', 'led', 'resistor'] as const) {
        const component = createComponent(kind, { x: 400, y: 300 }, kind);
        component.rotation = rotation;
        const source = componentDefinitions[kind].sourcePins[0];
        if (!source) throw new Error('missing pin');
        const fromSvgTransform = worldToScreen(
          localToWorld(artworkPointToLocal(kind, source.position), component.position, rotation),
          viewport,
        );
        const fromWire = pinWorldPosition([component], {
          componentId: component.id,
          pinId: source.id,
        });
        if (!fromWire) throw new Error('missing pin');
        expect(worldToScreen(fromWire, viewport)).toEqual(fromSvgTransform);
        const recovered = screenToWorld(fromSvgTransform, viewport);
        expect(recovered.x).toBeCloseTo(fromWire.x, 10);
        expect(recovered.y).toBeCloseTo(fromWire.y, 10);
      }
    }
    const changed = zoomAt(viewport, { x: 350, y: 220 }, 1.9);
    expect(
      (componentDefinitions['arduino-uno'].width * changed.zoom) /
        (componentDefinitions.breadboard.width * changed.zoom),
    ).toBeCloseTo(68.6 / 165.1, 10);
  });
  it('keeps historical projects compatible and wires attached after movement, rotation and recovery', () => {
    let project = parseProject(phase1Source);
    project = applyEditorCommand(project, {
      type: 'add',
      component: createComponent('led', { x: 450, y: 400 }, 'led'),
    });
    project = applyEditorCommand(project, {
      type: 'add-wire',
      wire: {
        id: 'physical-wire',
        from: { componentId: 'esp-reference', pinId: 'D1' },
        to: { componentId: 'led', pinId: 'anode' },
        color: '#55aa88',
        waypoints: [{ x: 430, y: 300 }],
      },
    });
    project = applyEditorCommand(project, { type: 'rotate', ids: ['esp-reference', 'led'] });
    project = applyEditorCommand(project, { type: 'move', positions: { led: { x: 550, y: 430 } } });
    const recovered = parseProject(serializeProject(project));
    expect(recovered).toEqual(project);
    const wire = recovered.wires[0];
    if (!wire) throw new Error('missing wire');
    const points = wirePoints(recovered.components, wire);
    expect(points?.[0]).toEqual(pinWorldPosition(recovered.components, wire.from));
    expect(points?.at(-1)).toEqual(pinWorldPosition(recovered.components, wire.to));
    expect(recovered.viewport).toEqual(project.viewport);
  });
});
