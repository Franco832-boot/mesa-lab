import type { ElectronicComponent, Point, Wire } from './types';
import { wirePoints } from './editor';

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const between = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
const straight = (a: Point, b: Point, c: Point) =>
  (a.x === b.x && b.x === c.x && between(b.y, a.y, c.y)) ||
  (a.y === b.y && b.y === c.y && between(b.x, a.x, c.x));

/** A read-only projection: expose real bends and authored anchors without saving them. */
export function wireGeometry(components: readonly ElectronicComponent[], wire: Wire): Point[] | null {
  const route = wirePoints(components, wire);
  if (!route) return null;
  const vertices: { point: Point; authored: boolean }[] = [];
  route.forEach((point, index) => {
    const authored = index % 3 === 0 || index === route.length - 1;
    const previous = vertices.at(-1);
    if (previous && same(previous.point, point)) { previous.authored ||= authored; return; }
    vertices.push({ point, authored });
    while (vertices.length >= 3) {
      const a = vertices.at(-3), b = vertices.at(-2), c = vertices.at(-1);
      if (!a || !b || !c || b.authored || !straight(a.point, b.point, c.point)) break;
      vertices.splice(vertices.length - 2, 1);
    }
  });
  return vertices.map(({ point }) => ({ ...point }));
}

/** Only interior world-space anchors are persisted; terminals always come from pins. */
export const routeWaypoints = (points: readonly Point[]): Point[] => points.slice(1, -1).map((point) => ({ ...point }));
export function moveWireCorner(points: readonly Point[], index: number, position: Point): Point[] {
  return points.map((point, i) => ({ ...(i === index && i > 0 && i < points.length - 1 ? position : point) }));
}
export function moveWireSegment(points: readonly Point[], index: number, delta: Point): Point[] {
  const a = points[index], b = points[index + 1];
  if (!a || !b) return points.map((point) => ({ ...point }));
  const vertical = a.x === b.x;
  const offset = vertical ? delta.x : delta.y;
  if (offset === 0) return points.map((point) => ({ ...point }));
  const shift = (point: Point): Point => vertical ? { x: point.x + offset, y: point.y } : { x: point.x, y: point.y + offset };
  return [
    ...points.slice(0, index), ...(index === 0 ? [a] : []), shift(a), shift(b),
    ...(index + 1 === points.length - 1 ? [b] : []), ...points.slice(index + 2),
  ].map((point) => ({ ...point }));
}
export function projectToSegment(a: Point, b: Point, point: Point): Point {
  if (a.x === b.x) return { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), point.y)) };
  return { y: a.y, x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), point.x)) };
}
export function nearestWireSegment(points: readonly Point[], point: Point): number | null {
  let nearest: number | null = null, distance = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1];
    if (!a || !b) continue;
    const projected = projectToSegment(a, b, point);
    const candidate = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (candidate < distance) { nearest = index; distance = candidate; }
  }
  return nearest;
}
export function insertWireCorner(points: readonly Point[], index: number, position: Point): Point[] {
  const a = points[index], b = points[index + 1];
  if (!a || !b) return points.map((point) => ({ ...point }));
  return [...points.slice(0, index + 1), projectToSegment(a, b, position), ...points.slice(index + 1)];
}
export function removeWireCorner(points: readonly Point[], index: number): Point[] {
  return points.filter((_, i) => i !== index || i === 0 || i === points.length - 1).map((point) => ({ ...point }));
}
