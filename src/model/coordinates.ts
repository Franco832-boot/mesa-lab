import type { Point, Viewport } from './types';

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 5;
export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.offset.x,
    y: point.y * viewport.zoom + viewport.offset.y,
  };
}
export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offset.x) / viewport.zoom,
    y: (point.y - viewport.offset.y) / viewport.zoom,
  };
}
/** Rotation is around the component's local origin, shared with the SVG transform. */
export function localToWorld(point: Point, position: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: position.x + point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: position.y + point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}
export function worldToLocal(point: Point, position: Point, degrees: number): Point {
  return localToWorld({ x: point.x - position.x, y: point.y - position.y }, { x: 0, y: 0 }, -degrees);
}
export function zoomAt(viewport: Viewport, anchor: Point, requestedZoom: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
  const world = screenToWorld(anchor, viewport);
  return { zoom, offset: { x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom } };
}
