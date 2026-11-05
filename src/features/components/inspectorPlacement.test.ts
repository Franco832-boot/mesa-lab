import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import { componentScreenBounds, inspectorAnchor, overlapArea, placeInspector } from './inspectorPlacement';
import type { InspectorAnchor } from './inspectorPlacement';

const anchor: InspectorAnchor = { rect: { x: 300, y: 260, width: 40, height: 40 }, obstacles: [], protect: true };
describe('contextual inspector placement', () => {
  it('opens beside the selected part and leaves its control unobscured', () => {
    const panel = placeInspector({ width: 1100, height: 800 }, anchor, false, false);
    expect(panel.x).toBe(356);
    expect(overlapArea(panel, anchor.rect)).toBe(0);
    expect(panel.y).toBeGreaterThanOrEqual(12);
  });
  it('chooses another side when nearby circuit components occupy the first candidate', () => {
    const panel = placeInspector({ width: 1100, height: 800 }, {
      ...anchor, obstacles: [{ rect: { x: 355, y: 50, width: 330, height: 460 }, weight: 8 }],
    }, false, false);
    expect(overlapArea(panel, anchor.rect)).toBe(0);
    expect(overlapArea(panel, { x: 355, y: 50, width: 330, height: 460 })).toBe(0);
  });
  it.each([
    { x: -100, y: -100 }, { x: 950, y: 750 }, { x: 20, y: 700 },
  ])('clamps an offscreen/edge selection to the available canvas ($x,$y)', (point) => {
    const panel = placeInspector({ width: 960, height: 700 }, { ...anchor, rect: { ...point, width: 50, height: 50 } }, true, false);
    expect(panel.x).toBeGreaterThanOrEqual(12);
    expect(panel.y).toBeGreaterThanOrEqual(12);
    expect(panel.x + panel.width).toBeLessThanOrEqual(948);
    expect(panel.y + panel.height).toBeLessThanOrEqual(688);
  });
  it('expands for complex settings without changing circuit coordinates', () => {
    const normal = placeInspector({ width: 1100, height: 850 }, anchor, false, false);
    const expanded = placeInspector({ width: 1100, height: 850 }, anchor, true, false);
    expect(expanded.width).toBeGreaterThan(normal.width);
    expect(expanded.height).toBeGreaterThan(normal.height);
    expect(anchor.rect).toEqual({ x: 300, y: 260, width: 40, height: 40 });
  });
  it.each([320, 390, 760])('uses a full-width bottom sheet at %spx with space above for the canvas', (width) => {
    const normal = placeInspector({ width, height: 600 }, anchor, false, true);
    const expanded = placeInspector({ width, height: 600 }, anchor, true, true);
    expect(normal.x).toBe(8);
    expect(normal.width).toBe(width - 16);
    expect(normal.y + normal.height).toBe(592);
    expect(normal.height).toBeLessThan(300);
    expect(expanded.height).toBeGreaterThan(normal.height);
    expect(expanded.y).toBeGreaterThanOrEqual(8);
  });
  it('transforms a rotated component with the same zoom/pan as SVG', () => {
    const component = { ...createComponent('resistor', { x: 100, y: 80 }, 'r'), rotation: 90 };
    const base = componentScreenBounds(component, { zoom: 1, offset: { x: 0, y: 0 } });
    const transformed = componentScreenBounds(component, { zoom: 2, offset: { x: 40, y: -20 } });
    expect(transformed.x).toBeCloseTo(base.x * 2 + 40, 8);
    expect(transformed.y).toBeCloseTo(base.y * 2 - 20, 8);
    expect(transformed.width).toBeCloseTo(base.width * 2, 8);
    expect(transformed.height).toBeCloseTo(base.height * 2, 8);
  });
  it('requires an actual component/wire selection', () => {
    const components = [createComponent('resistor', { x: 100, y: 80 }, 'r')];
    expect(inspectorAnchor(components, [], { zoom: 1, offset: { x: 0, y: 0 } }, null, null)).toBeNull();
    expect(inspectorAnchor(components, [], { zoom: 1, offset: { x: 0, y: 0 } }, 'r', null)?.protect).toBe(true);
  });
});
