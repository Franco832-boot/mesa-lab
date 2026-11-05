import { describe, expect, it } from 'vitest';
import {
  localToWorld,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './coordinates';

describe('coordinate transformations', () => {
  it.each([0.3, 0.75, 1, 2.5])('roundtrips at zoom %s with pan', (zoom) => {
    const viewport = { zoom, offset: { x: -314.8, y: 92.1 } };
    const pin = { x: 127.65, y: -49.3 };
    const result = screenToWorld(worldToScreen(pin, viewport), viewport);
    expect(result.x).toBeCloseTo(pin.x, 10);
    expect(result.y).toBeCloseTo(pin.y, 10);
  });
  it('keeps the same world point under a zoom anchor', () => {
    const viewport = { zoom: 0.75, offset: { x: 90, y: -140 } };
    const anchor = { x: 380, y: 260 };
    const before = screenToWorld(anchor, viewport);
    const after = screenToWorld(anchor, zoomAt(viewport, anchor, 1.9));
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
  it('limits zoom without changing the anchor', () => {
    const viewport = { zoom: 1, offset: { x: 10, y: 20 } };
    expect(zoomAt(viewport, { x: 0, y: 0 }, 99).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(viewport, { x: 0, y: 0 }, 0).zoom).toBe(MIN_ZOOM);
  });
  it('rotates a pin around the same local origin as its SVG', () => {
    const result = localToWorld({ x: 10, y: 20 }, { x: 100, y: 200 }, 90);
    expect(result.x).toBeCloseTo(80);
    expect(result.y).toBeCloseTo(210);
  });
  it('combines rotated pin coordinates, pan and zoom accurately', () => {
    const pin = localToWorld({ x: 14, y: 42 }, { x: 515, y: 108 }, -37);
    const viewport = { zoom: 1.65, offset: { x: -72, y: 32 } };
    const recovered = screenToWorld(worldToScreen(pin, viewport), viewport);
    expect(recovered.x).toBeCloseTo(pin.x);
    expect(recovered.y).toBeCloseTo(pin.y);
  });
});
